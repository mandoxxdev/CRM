/**
 * Etapa 122, Fase 5 — o que a revisao adversarial do codigo achou (r1 regra, r2 concorrencia, r3 sabotagem), cada um com o
 * cenario que o prende. Os tres de producao (corrigidos nesta rodada): o `/aprovar-valor` que, com um cancelamento no meio e a
 * falha do status, deixava a reserva ATIVA numa requisicao CANCELADO (r2 I1, 30/30); o PATCH manual que corria com o fechamento
 * automatico e deixava a coluna "automatico" com a trilha "manual" (r2 M1, 20/20); e o backfill do boot gravando a coluna sobre
 * um fechamento manual feito no meio dele (r2 M2, 10/10). O resto e prova que faltava (r3): a trilha do excedente no `/fiscal`
 * antes do item (I1), os backfills chamados pelo `initSchema` (I2), e os Minor P1..P9.
 *
 * Executar: cd server && node tests/api/estadoForaDaAuditoriaFase5.api.test.js
 */
const assert = require('assert');
const sqlite3 = require('sqlite3');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const schema = require('../../services/almoxarifado/schema');
const trava = require('../../services/almoxarifado/travaPorMaterial');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${String(e.message).replace(/\s*\n\s*/g, ' ').slice(0, 500)}`); });
}
const SUPER = { id: 1, nome: 'Super Teste', role: 'admin', is_superadmin: 1, email: 'super@test.com' };
const API = '/api/almoxarifado';
const LEDGER_PEDIDO = 'backfill_pedido_fechado_automaticamente';
const LEDGER_CONF = 'backfill_conferencia_finalizada_em';

(async () => {
  const { app, db, setUser, close } = await createTestApp({ user: SUPER });
  await dbRun(db, 'CREATE TABLE IF NOT EXISTS usuarios (id INTEGER PRIMARY KEY, nome TEXT, email TEXT, ativo INTEGER DEFAULT 1)');
  await dbRun(db, 'INSERT OR REPLACE INTO usuarios (id, nome, email, ativo) VALUES (50, ?, ?, 1)', ['Outro', 'outro@test.com']);
  const cfg = (k, v) => dbRun(db, `INSERT INTO configuracoes_almoxarifado (chave, valor) VALUES (?,?)
    ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor`, [k, v]);
  await cfg('aprovacao_automatica', '0'); await cfg('liberacao_valor_ativo', '0');
  const warn = console.warn; const info = console.info; console.warn = () => {}; console.info = () => {};

  let seq = 0;
  const material = async (qtd = 0) => (await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual,
    quantidade_minima, custo_unitario, ativo) VALUES (?, ?, 'PC', ?, 0, 10, 1)`, [`F5E122-${++seq}`, `F5E122-${seq}`, qtd])).lastID;

  /** Gancho em db[metodo]: `acao(sql, params, cb, original)` devolve true se tratou o comando. */
  async function comGancho(metodo, acao, fn) {
    const original = db[metodo];
    db[metodo] = function (sql, params, cb) {
      if (typeof params === 'function') { cb = params; params = []; }
      if (typeof sql === 'string' && acao(sql, params || [], cb, original)) return this;
      return original.call(db, sql, params, cb);
    };
    try { return await fn(); } finally { db[metodo] = original; }
  }
  /** Segura UMA vez o db.run que casa com `pred` ate `release()`. */
  function segurarUmaVez(pred) {
    const original = db.run; let liberar; let avisar;
    const solto = new Promise((r) => { liberar = r; });
    const pegou = new Promise((r) => { avisar = r; });
    let disparou = false;
    db.run = function (sql, params, cb) {
      if (typeof params === 'function') { cb = params; params = []; }
      if (!disparou && typeof sql === 'string' && pred(sql, params || [])) {
        disparou = true; db.run = original; avisar();
        solto.then(() => original.call(db, sql, params, cb));
        return this;
      }
      return original.call(db, sql, params, cb);
    };
    return { pegou, release: () => liberar(), restore: () => { db.run = original; } };
  }

  // ── requisicao ──
  const requisicaoValor = async (m) => {
    const id = (await dbRun(db, `INSERT INTO requisicoes_almoxarifado (numero, solicitante_id, solicitante_nome, status, ativo)
      VALUES (?, 50, 'X', 'AGUARDANDO_APROVACAO_VALOR', 1)`, [`REQ-F5E122-${++seq}`])).lastID;
    await dbRun(db, `INSERT INTO itens_requisicao_almoxarifado (requisicao_id, material_id, quantidade_solicitada, quantidade_separada,
      quantidade_entregue) VALUES (?, ?, 3, 0, 0)`, [id, m]);
    return id;
  };
  const statusReq = async (id) => (await dbGet(db, 'SELECT status FROM requisicoes_almoxarifado WHERE id = ?', [id])).status;
  const ativas = async (id) => (await dbGet(db, `SELECT COUNT(*) n FROM reservas_material_almoxarifado
    WHERE requisicao_id = ? AND status = 'ATIVA'`, [id])).n;
  const UPD_VALOR = "UPDATE requisicoes_almoxarifado SET status=?, updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='APROVADO'";

  console.log('\n=== Etapa 122, Fase 5: os achados da revisao do codigo ===\n');

  await test('[RN-02d] aprovar-valor: cancelada no meio (antes da reserva) e o status falhando -> 200 CANCELADO, reservas [], 0 ATIVA', async () => {
    const m = await material(10);
    const id = await requisicaoValor(m);
    let cancelou = false; let falhou = false;
    const r = await comGancho('get', (sql, params, cb, orig) => {
      // a releitura da requisicao SOB A TRAVA (a secao segura m): o cancelamento (que nao pega a trava) entra aqui
      if (!cancelou && sql.trim() === 'SELECT * FROM requisicoes_almoxarifado WHERE id = ?' && Number(params[0]) === id
        && trava.materiaisForaDaSecao([m]).length === 0 && trava.materiaisForaDaSecao([999999]).length === 1) {
        cancelou = true;
        request(app).put(`${API}/requisicoes/${id}/cancelar`).send({ motivo: 'f5' }).then(() => orig.call(db, sql, params, cb));
        return true;
      }
      return false;
    }, () => comGancho('run', (sql, params, cb) => {
      if (cancelou && !falhou && sql.includes(UPD_VALOR)) {
        falhou = true; setImmediate(() => cb.call({}, new Error('falha forcada do status (teste)'))); return true;
      }
      return false;
    }, () => request(app).put(`${API}/requisicoes/${id}/aprovar-valor`).send({})));
    assert.ok(cancelou && falhou, `gancho: cancelou=${cancelou} falhou=${falhou}`);
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.strictEqual(await statusReq(id), 'CANCELADO');
    assert.strictEqual(await ativas(id), 0, 'a reserva ficou presa numa requisicao CANCELADO');
    assert.deepStrictEqual({ status: r.body.status, reservas: r.body.reservas }, { status: 'CANCELADO', reservas: [] });
    assert.strictEqual((await dbGet(db, 'SELECT quantidade_reservada q FROM materiais_almoxarifado WHERE id = ?', [m])).q, 0);
  });

  await test('[RN-02e] aprovar-valor: perde o UPDATE (outro gesto cancelou) e a releitura falha -> 200 CANCELADO, reservas [] (r3 P1)', async () => {
    const m = await material(10);
    const id = await requisicaoValor(m);
    let perdeu = false; let falhouLeitura = false;
    const r = await comGancho('run', (sql, params, cb, orig) => {
      if (!perdeu && sql.includes(UPD_VALOR)) {
        perdeu = true;
        orig.call(db, "UPDATE requisicoes_almoxarifado SET status='CANCELADO' WHERE id = ?", [id], () => orig.call(db, sql, params, cb));
        return true;
      }
      return false;
    }, () => comGancho('get', (sql, params, cb) => {
      if (perdeu && !falhouLeitura && sql === 'SELECT status FROM requisicoes_almoxarifado WHERE id = ?') {
        falhouLeitura = true; setImmediate(() => cb.call({}, new Error('releitura falhou (teste)'))); return true;
      }
      return false;
    }, () => request(app).put(`${API}/requisicoes/${id}/aprovar-valor`).send({})));
    assert.ok(perdeu && falhouLeitura, `gancho: perdeu=${perdeu} leitura=${falhouLeitura}`);
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.strictEqual(await ativas(id), 0, 'reserva ATIVA');
    assert.deepStrictEqual({ status: r.body.status, reservas: r.body.reservas }, { status: 'CANCELADO', reservas: [] });
  });

  // ── recebimento ──
  const recebimento = async (n, status = 'EM_CONFERENCIA') => {
    const id = (await dbRun(db, `INSERT INTO recebimentos_material_almoxarifado (numero, status, nota_fiscal, fornecedor_nome)
      VALUES (?, ?, ?, 'F-F5E122')`, [`REC-F5E122-${++seq}`, status, `NF-F5E122-${seq}`])).lastID;
    const itens = [];
    for (let i = 0; i < n; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      itens.push((await dbRun(db, `INSERT INTO recebimentos_material_itens_almoxarifado (recebimento_id, material_id,
        quantidade_esperada, quantidade_recebida) VALUES (?, ?, 2, 2)`, [id, await material()])).lastID);
    }
    return { id, itens };
  };
  const trilhas = async (itens) => (await dbAll(db, `SELECT entidade_id FROM auditoria_log_almoxarifado WHERE entidade = 'recebimento_item'
    AND acao = 'EXCEDENTE_AUTORIZADO' AND entidade_id IN (${itens.map(() => '?').join(',')}) ORDER BY entidade_id`, itens)).map((x) => x.entidade_id);
  const recebidas = async (recId) => (await dbAll(db, `SELECT quantidade_recebida q FROM recebimentos_material_itens_almoxarifado
    WHERE recebimento_id = ? ORDER BY id`, [recId])).map((x) => x.q);

  await test('[RN-13e] /fiscal: o UPDATE do 2o item lanca -> 500, o 1o gravado COM a trilha, o 2o sem item e sem trilha (r3 I1)', async () => {
    const { id, itens } = await recebimento(2, 'EM_ENTRADA_NF');
    let ok = false;
    const r = await comGancho('run', (sql, params, cb) => {
      if (!ok && sql.includes('UPDATE recebimentos_material_itens_almoxarifado SET') && params.includes(itens[1])) {
        ok = true; setImmediate(() => cb.call({}, new Error('falha forcada do item (teste)'))); return true;
      }
      return false;
    }, () => request(app).put(`${API}/recebimentos/${id}/fiscal`).send({ autorizar_excedente: true,
      itens: [{ id: itens[0], quantidade_recebida: 5 }, { id: itens[1], quantidade_recebida: 6 }] }));
    assert.ok(ok, 'gancho');
    assert.strictEqual(r.status, 500, JSON.stringify(r.body));
    assert.deepStrictEqual(await recebidas(id), [5, 2]);
    assert.deepStrictEqual(await trilhas(itens), [itens[0]], 'a trilha nao pode existir sem o ato');
  });

  await test('[RN-13f] /conferir: o UPDATE do item nao grava linha (changes 0) -> nenhuma trilha; com changes 1 -> a trilha (r3 P2)', async () => {
    const { id, itens } = await recebimento(1);
    let ok = false;
    const r = await comGancho('run', (sql, params, cb) => {
      if (!ok && sql.includes('UPDATE recebimentos_material_itens_almoxarifado SET')) {
        ok = true; setImmediate(() => cb.call({ changes: 0 }, null)); return true;
      }
      return false;
    }, () => request(app).put(`${API}/recebimentos/${id}/conferir`).send({ autorizar_excedente: true,
      itens: [{ id: itens[0], quantidade_recebida: 5 }] }));
    assert.ok(ok, 'gancho');
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.deepStrictEqual(await trilhas(itens), [], 'trilha sem o ato');
    const r2 = await request(app).put(`${API}/recebimentos/${id}/conferir`).send({ autorizar_excedente: true,
      itens: [{ id: itens[0], quantidade_recebida: 5 }] });
    assert.strictEqual(r2.status, 200, JSON.stringify(r2.body));
    assert.deepStrictEqual(await trilhas(itens), [itens[0]], 'a metade positiva: com o ato, a trilha');
  });

  await test('[RN-11c] so o gesto finalizar grava a coluna: iniciar_conferencia e encaminhar_compras (de RECEBIDO) nao (r3 P6)', async () => {
    const { id: a } = await recebimento(1, 'RECEBIDO');
    const r1 = await request(app).post(`${API}/recebimentos/${a}/workflow`).send({ acao: 'iniciar_conferencia' });
    assert.strictEqual(r1.status, 200, JSON.stringify(r1.body));
    const { id: b } = await recebimento(1, 'RECEBIDO');
    const r2 = await request(app).post(`${API}/recebimentos/${b}/workflow`).send({ acao: 'encaminhar_compras' });
    assert.strictEqual(r2.status, 200, JSON.stringify(r2.body));
    const col = async (id) => (await dbGet(db, 'SELECT conferencia_finalizada_em c FROM recebimentos_material_almoxarifado WHERE id = ?', [id])).c;
    assert.deepStrictEqual([await col(a), await col(b)], [null, null]);
    const r3 = await request(app).post(`${API}/recebimentos/${a}/workflow`).send({ acao: 'finalizar_conferencia' });
    assert.strictEqual(r3.status, 200, JSON.stringify(r3.body));
    assert.ok(await col(a), 'a metade positiva: o gesto finalizar grava');
  });

  // ── pedido ──
  const forn = (await dbRun(db, "INSERT INTO fornecedores (razao_social, cnpj, status) VALUES ('Forn F5E122','12200000000555','ativo')")).lastID;
  async function novoPedido(status = 'enviado') {
    setUser(SUPER);
    const m = await material();
    const r = await request(app).post('/api/compras/pedidos').send({ fornecedor_id: forn, status,
      itens: [{ material_id: m, quantidade: 2, valor_unitario: 1 }] });
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    return { id: r.body.id, material: m, linha: (await dbGet(db, 'SELECT id FROM itens_pedido_compra WHERE pedido_id = ?', [r.body.id])).id };
  }
  async function nota(p) {
    const rec = (await dbRun(db, `INSERT INTO recebimentos_material_almoxarifado (numero, status, nota_fiscal, fornecedor_nome,
      data_emissao_nf, data_entrada_nf, valor_total_nota, pedido_compra_id) VALUES (?, 'EM_ENTRADA_NF', ?, 'F', '2026-09-01', '2026-09-02', 10, ?)`,
    [`REC-F5P-${++seq}`, `NF-F5P-${seq}`, p.id])).lastID;
    await dbRun(db, `INSERT INTO recebimentos_material_itens_almoxarifado (recebimento_id, material_id, pedido_item_id, quantidade_esperada,
      quantidade_recebida) VALUES (?,?,?,2,2)`, [rec, p.material, p.linha]);
    return rec;
  }
  const processar = async (rec) => {
    const r = await request(app).post(`${API}/recebimentos/${rec}/processar`).send({});
    assert.strictEqual(r.status, 200, `processar: ${JSON.stringify(r.body)}`);
  };
  const movDe = async (rec) => (await dbGet(db, `SELECT id FROM movimentacoes_almoxarifado WHERE recebimento_id = ? AND tipo = 'ENTRADA_COMPRA'
    AND COALESCE(cancelado, 0) = 0`, [rec])).id;
  const estornar = async (mov) => {
    const r = await request(app).post(`${API}/movimentacoes/${mov}/cancelar`).send({ motivo: 'f5' });
    assert.strictEqual(r.status, 200, `estorno: ${JSON.stringify(r.body)}`);
  };
  const pedidoAgora = async (id) => ({ ...(await dbGet(db, 'SELECT status, fechado_automaticamente_de AS col FROM pedidos_compra WHERE id = ?', [id])) });
  const linhaRecebida = async (linha) => (await dbGet(db, 'SELECT quantidade_recebida q FROM itens_pedido_compra WHERE id = ?', [linha])).q;

  await test('[RN-07e] PATCH recebido lido antes do fechamento automatico e gravado depois: e do comprador, o estorno nao reabre (r2 M1)', async () => {
    const p = await novoPedido('enviado');
    const rec = await nota(p);
    const h = segurarUmaVez((s) => s.includes('fechado_automaticamente_de = CASE'));
    const patch = request(app).patch(`/api/compras/pedidos/${p.id}/status`).send({ status: 'recebido' }).then((r) => r);
    await h.pegou;
    await processar(rec);
    assert.deepStrictEqual(await pedidoAgora(p.id), { status: 'recebido', col: 'enviado' }, 'fixture: o fechamento automatico no meio');
    h.release();
    const rp = await patch;
    assert.strictEqual(rp.status, 200, JSON.stringify(rp.body));
    assert.deepStrictEqual(await pedidoAgora(p.id), { status: 'recebido', col: null }, 'o PATCH lido em enviado nao limpou a coluna');
    await estornar(await movDe(rec));
    assert.strictEqual((await pedidoAgora(p.id)).status, 'recebido', 'o estorno desfez o fechamento do comprador');
    assert.strictEqual(await linhaRecebida(p.linha), 0, 'a metade positiva: o estorno rodou e descontou a linha');
  });

  await test('[RN-07f] PATCH aprovado e recebido entre o destino lido e o UPDATE da reabertura: o estorno nao reabre (r3 M4, a guarda IS NOT NULL)', async () => {
    const p = await novoPedido('enviado');
    const rec = await nota(p);
    await processar(rec);
    const mov = await movDe(rec);
    const h = segurarUmaVez((s) => s.includes('fechado_automaticamente_de = NULL, updated_at'));
    const est = request(app).post(`${API}/movimentacoes/${mov}/cancelar`).send({ motivo: 'f5' }).then((r) => r);
    await h.pegou;
    assert.strictEqual((await request(app).patch(`/api/compras/pedidos/${p.id}/status`).send({ status: 'aprovado' })).status, 200);
    assert.strictEqual((await request(app).patch(`/api/compras/pedidos/${p.id}/status`).send({ status: 'recebido' })).status, 200);
    h.release();
    assert.strictEqual((await est).status, 200);
    assert.deepStrictEqual(await pedidoAgora(p.id), { status: 'recebido', col: null }, 'reabriu sobre o fechamento do comprador');
    assert.strictEqual(await linhaRecebida(p.linha), 0, 'a metade positiva: o estorno descontou a linha');
  });

  await test('[RN-07g] PATCH com o mesmo status em outra caixa (RECEBIDO) num pedido fechado automaticamente nao limpa (r3 P4)', async () => {
    const p = await novoPedido('enviado');
    await processar(await nota(p));
    const r = await request(app).patch(`/api/compras/pedidos/${p.id}/status`).send({ status: 'RECEBIDO' });
    if (r.status === 400) {
      // a rota so aceita os status em minusculas: o caso e inalcancavel por ela (medido na Fase 5, r3 P4)
      assert.ok(/status do pedido inv/i.test(r.body.error || ''), JSON.stringify(r.body));
    } else {
      assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    }
    assert.strictEqual((await pedidoAgora(p.id)).col, 'enviado');
  });

  // ── backfills ──
  const legadoPedido = async (anteriores = '{"status":"aprovado"}') => {
    const id = (await dbRun(db, "INSERT INTO pedidos_compra (numero, fornecedor_id, status) VALUES (?, ?, 'recebido')", [`PC-F5E122-${++seq}`, forn])).lastID;
    await dbRun(db, `INSERT INTO auditoria_log_almoxarifado (entidade, entidade_id, acao, dados_anteriores)
      VALUES ('pedido_compra', ?, 'STATUS_AUTOMATICO_RECEBIDO', ?)`, [id, anteriores]);
    return id;
  };
  const colRec = async (id) => (await dbGet(db, 'SELECT conferencia_finalizada_em c FROM recebimentos_material_almoxarifado WHERE id = ?', [id])).c;

  await test('[RN-09e] o initSchema (nao so a chamada direta) roda os dois backfills (r3 I2)', async () => {
    const ped = await legadoPedido();
    const { id: rec } = await recebimento(1, 'CONFERIDO_ALMOX');
    await dbRun(db, `INSERT INTO auditoria_log_almoxarifado (entidade, entidade_id, acao, created_at)
      VALUES ('recebimento', ?, 'FINALIZAR_CONFERENCIA', '2026-03-01 09:00:00')`, [rec]);
    await dbRun(db, 'DELETE FROM schema_migrations_almoxarifado WHERE id IN (?, ?)', [LEDGER_PEDIDO, LEDGER_CONF]);
    await schema.initSchema(db);
    assert.strictEqual((await pedidoAgora(ped)).col, 'aprovado', 'o backfill do pedido nao rodou no initSchema');
    assert.strictEqual(await colRec(rec), '2026-03-01 09:00:00', 'o backfill da conferencia nao rodou no initSchema');
  });

  await test('[RN-09f] backfill x PATCH manual no meio (o initSchema roda antes do listen): o PATCH vence (r2 M2)', async () => {
    const p = await legadoPedido('{"status":"enviado"}');
    await dbRun(db, 'DELETE FROM schema_migrations_almoxarifado WHERE id = ?', [LEDGER_PEDIDO]);
    let segurou = false;
    await comGancho('run', (sql, params, cb, orig) => {
      if (!segurou && sql.includes('UPDATE pedidos_compra SET fechado_automaticamente_de = ?') && Number(params[1]) === p) {
        segurou = true;
        (async () => {
          await request(app).patch(`/api/compras/pedidos/${p}/status`).send({ status: 'aprovado' });
          await request(app).patch(`/api/compras/pedidos/${p}/status`).send({ status: 'recebido' });
        })().then(() => orig.call(db, sql, params, cb));
        return true;
      }
      return false;
    }, () => schema.migrateBackfillPedidoFechadoAutomaticamente(db));
    assert.ok(segurou, 'gancho');
    assert.deepStrictEqual(await pedidoAgora(p), { status: 'recebido', col: null }, 'o backfill gravou sobre o fechamento do comprador');
    const q = await legadoPedido('{"status":"enviado"}');
    await dbRun(db, 'DELETE FROM schema_migrations_almoxarifado WHERE id = ?', [LEDGER_PEDIDO]);
    await schema.migrateBackfillPedidoFechadoAutomaticamente(db);
    assert.strictEqual((await pedidoAgora(q)).col, 'enviado', 'a metade positiva: sem o PATCH no meio, o backfill grava');
  });

  await test('[RN-09g] backfill: dois fechamentos no historico -> o destino do ULTIMO (r3 P7); fora da lista -> pendente (P9)', async () => {
    const a = (await dbRun(db, "INSERT INTO pedidos_compra (numero, fornecedor_id, status) VALUES (?, ?, 'recebido')", [`PC-F5E122-${++seq}`, forn])).lastID;
    const t = (acao, ant) => dbRun(db, `INSERT INTO auditoria_log_almoxarifado (entidade, entidade_id, acao, dados_anteriores)
      VALUES ('pedido_compra', ?, ?, ?)`, [a, acao, ant]);
    await t('STATUS_AUTOMATICO_RECEBIDO', '{"status":"aprovado"}');
    await t('STATUS_AUTOMATICO_REABERTO', '{"status":"recebido"}');
    await t('STATUS_MANUAL_ALTERADO', '{"status":"aprovado"}');
    await t('STATUS_AUTOMATICO_RECEBIDO', '{"status":"enviado"}');
    const b = await legadoPedido('{"status":"cancelado"}');
    await dbRun(db, 'DELETE FROM schema_migrations_almoxarifado WHERE id = ?', [LEDGER_PEDIDO]);
    await schema.migrateBackfillPedidoFechadoAutomaticamente(db);
    assert.deepStrictEqual([(await pedidoAgora(a)).col, (await pedidoAgora(b)).col], ['enviado', 'pendente']);
  });

  await test('[RN-09h] re-executar com o ledger perdido nao reescreve a coluna ja gravada, nos dois backfills (r3 P8)', async () => {
    const p = await legadoPedido('{"status":"aprovado"}');
    await dbRun(db, "UPDATE pedidos_compra SET fechado_automaticamente_de = 'enviado' WHERE id = ?", [p]);
    const { id: rec } = await recebimento(1, 'CONFERIDO_ALMOX');
    await dbRun(db, "UPDATE recebimentos_material_almoxarifado SET conferencia_finalizada_em = '2026-02-01 00:00:00' WHERE id = ?", [rec]);
    await dbRun(db, `INSERT INTO auditoria_log_almoxarifado (entidade, entidade_id, acao, created_at)
      VALUES ('recebimento', ?, 'FINALIZAR_CONFERENCIA', '2026-01-15 00:00:00')`, [rec]);
    const outro = await legadoPedido('{"status":"aprovado"}');
    await dbRun(db, 'DELETE FROM schema_migrations_almoxarifado WHERE id IN (?, ?)', [LEDGER_PEDIDO, LEDGER_CONF]);
    await schema.migrateBackfillPedidoFechadoAutomaticamente(db);
    await schema.migrateBackfillConferenciaFinalizadaEm(db);
    assert.strictEqual((await pedidoAgora(p)).col, 'enviado');
    assert.strictEqual(await colRec(rec), '2026-02-01 00:00:00');
    assert.strictEqual((await pedidoAgora(outro)).col, 'aprovado', 'a metade positiva: o que estava vazio foi preenchido');
  });

  await test('[RN-09i] banco sem a tabela do Compras: o backfill do pedido grava o ledger e sai (Fase 2 M4; r3 M6)', async () => {
    const novo = new sqlite3.Database(':memory:');
    try {
      await schema.migrateBackfillPedidoFechadoAutomaticamente(novo);
      const ok = await dbGet(novo, 'SELECT 1 ok FROM schema_migrations_almoxarifado WHERE id = ?', [LEDGER_PEDIDO]);
      assert.ok(ok, 'o ledger nao foi gravado sem a tabela');
      assert.ok(!(await dbGet(novo, "SELECT name FROM sqlite_master WHERE type='table' AND name='pedidos_compra'")),
        'o backfill criou a tabela do core');
    } finally { await new Promise((ok) => novo.close(ok)); }
  });

  console.warn = warn; console.info = info;
  console.log(`\n${passed} passaram, ${failed} falharam\n`);
  await close();
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
