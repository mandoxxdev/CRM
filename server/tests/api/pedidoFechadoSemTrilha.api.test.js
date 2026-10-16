/**
 * Etapa 122 (C255a, B788; RN-05..RN-09) — o "fechado automaticamente" do pedido de compra mora numa coluna, nao na Auditoria.
 *
 * Medido na Fase 0 (sonda e122fase0): nota processada contra um pedido `enviado` com a trilha STATUS_AUTOMATICO_RECEBIDO
 * falhando -> o pedido fecha `recebido`; o estorno da entrada desconta a linha mas NAO reabre o pedido, porque
 * `destinoDaReabertura` lia a ultima trilha de status da Auditoria (Etapa 71) e ela nao existia. Desde a 121 a trilha pode
 * faltar com o ato feito (B784). Agora o fechamento grava `pedidos_compra.fechado_automaticamente_de` no MESMO UPDATE do
 * status; a reabertura le e limpa a coluna no mesmo UPDATE dela; a mudanca manual do Compras limpa quando o status muda.
 *
 * Executar: cd server && node tests/api/pedidoFechadoSemTrilha.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet } = require('../../services/almoxarifado/db');
const schema = require('../../services/almoxarifado/schema');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${String(e.message).replace(/\s*\n\s*/g, ' ').slice(0, 500)}`); });
}
const SUPER = { id: 1, nome: 'Super Teste', role: 'admin', is_superadmin: 1, email: 'super@test.com' };
const API = '/api/almoxarifado';
const LEDGER = 'backfill_pedido_fechado_automaticamente';

(async () => {
  const { app, db, setUser, close } = await createTestApp({ user: SUPER });

  /** Os INSERTs da Auditoria com `entidade`/`acao` falham `vezes` vezes (gancho em `db.run`). */
  async function comAuditoriaFalhando(entidade, acao, fn, vezes = 1) {
    const original = db.run;
    let disparou = 0;
    db.run = function (sql, params, cb) {
      if (typeof params === 'function') { cb = params; params = []; }
      if (disparou < vezes && typeof sql === 'string' && sql.includes('INSERT INTO auditoria_log_almoxarifado')
        && Array.isArray(params) && params[0] === entidade && params[2] === acao) {
        disparou += 1;
        setImmediate(() => cb.call({}, new Error(`falha forcada da auditoria ${entidade}/${acao} (teste)`)));
        return this;
      }
      return original.call(db, sql, params, cb);
    };
    const warn = console.warn; console.warn = () => {};
    let r;
    try { r = await fn(); } finally { db.run = original; console.warn = warn; }
    assert.strictEqual(disparou, vezes, `gancho da auditoria ${entidade}/${acao} disparou ${disparou} de ${vezes}`);
    return r;
  }

  const forn = (await dbRun(db,
    "INSERT INTO fornecedores (razao_social, cnpj, status) VALUES ('Fornecedor PFST122','12200000000222','ativo')")).lastID;
  let seq = 0;
  const material = async () => {
    seq += 1;
    return (await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, quantidade_minima,
      custo_unitario, ativo) VALUES (?, ?, 'PC', 0, 0, 10, 1)`, [`PFST122-${seq}`, `PFST122-${seq}`])).lastID;
  };
  /** Pedido `status` de 2 pela porta real. */
  async function novoPedido(status = 'enviado') {
    setUser(SUPER);
    const m = await material();
    const r = await request(app).post('/api/compras/pedidos').send({ fornecedor_id: forn, status,
      itens: [{ material_id: m, quantidade: 2, valor_unitario: 1 }] });
    assert.strictEqual(r.status, 201, `fixture: POST do pedido ${r.status} ${JSON.stringify(r.body)}`);
    const linha = (await dbGet(db, 'SELECT id FROM itens_pedido_compra WHERE pedido_id = ?', [r.body.id])).id;
    return { id: r.body.id, material: m, linha };
  }
  /** Nota de 2 contra o pedido, processada pela rota. Devolve a movimentacao de entrada. */
  async function notaProcessada(p) {
    seq += 1;
    const rec = (await dbRun(db, `INSERT INTO recebimentos_material_almoxarifado (numero, status, nota_fiscal, fornecedor_nome,
      data_emissao_nf, data_entrada_nf, valor_total_nota, pedido_compra_id)
      VALUES (?, 'EM_ENTRADA_NF', ?, 'F-PFST122', '2026-09-01', '2026-09-02', 10, ?)`, [`REC-PFST122-${seq}`, `NF-PFST122-${seq}`, p.id])).lastID;
    await dbRun(db, `INSERT INTO recebimentos_material_itens_almoxarifado (recebimento_id, material_id, pedido_item_id,
      quantidade_esperada, quantidade_recebida) VALUES (?,?,?,2,2)`, [rec, p.material, p.linha]);
    const r = await request(app).post(`${API}/recebimentos/${rec}/processar`).send({});
    assert.strictEqual(r.status, 200, `processar: ${r.status} ${JSON.stringify(r.body)}`);
    return (await dbGet(db, `SELECT id FROM movimentacoes_almoxarifado WHERE recebimento_id = ? AND tipo = 'ENTRADA_COMPRA'
      AND COALESCE(cancelado, 0) = 0`, [rec])).id;
  }
  const estornar = async (movId) => {
    setUser(SUPER);
    const r = await request(app).post(`${API}/movimentacoes/${movId}/cancelar`).send({ motivo: 'lancado errado' });
    assert.strictEqual(r.status, 200, `estorno: ${r.status} ${JSON.stringify(r.body)}`);
    return r;
  };
  const pedidoAgora = (id) => dbGet(db, 'SELECT status, fechado_automaticamente_de AS col FROM pedidos_compra WHERE id = ?', [id]);
  const patchStatus = (id, status) => request(app).patch(`/api/compras/pedidos/${id}/status`).send({ status });

  console.log('\n=== Etapa 122: o fechamento automatico do pedido numa coluna (C255a) ===\n');

  await test('[RN-05] a trilha do fechamento falhando: o estorno reabre o pedido para enviado e limpa a coluna', async () => {
    const p = await novoPedido('enviado');
    const mov = await comAuditoriaFalhando('pedido_compra', 'STATUS_AUTOMATICO_RECEBIDO', () => notaProcessada(p));
    assert.deepStrictEqual({ ...(await pedidoAgora(p.id)) }, { status: 'recebido', col: 'enviado' });
    await estornar(mov);
    assert.deepStrictEqual({ ...(await pedidoAgora(p.id)) }, { status: 'enviado', col: null },
      'o pedido fechado automaticamente nao reabriu sem a trilha');
  });

  await test('[RN-06] a trilha da reabertura falhando: reabre, e o fechamento seguinte grava a coluna de novo e reabre outra vez', async () => {
    const p = await novoPedido('aprovado');
    const mov1 = await notaProcessada(p);
    assert.deepStrictEqual({ ...(await pedidoAgora(p.id)) }, { status: 'recebido', col: 'aprovado' });
    await comAuditoriaFalhando('pedido_compra', 'STATUS_AUTOMATICO_REABERTO', () => estornar(mov1));
    assert.deepStrictEqual({ ...(await pedidoAgora(p.id)) }, { status: 'aprovado', col: null });
    const mov2 = await notaProcessada(p);
    assert.deepStrictEqual({ ...(await pedidoAgora(p.id)) }, { status: 'recebido', col: 'aprovado' });
    await estornar(mov2);
    assert.deepStrictEqual({ ...(await pedidoAgora(p.id)) }, { status: 'aprovado', col: null });
  });

  await test('[RN-07] o comprador fecha a mao com as duas trilhas manuais falhando: o estorno NAO reabre', async () => {
    const p = await novoPedido('enviado');
    const mov = await notaProcessada(p);
    const r1 = await comAuditoriaFalhando('pedido_compra', 'STATUS_MANUAL_ALTERADO', () => patchStatus(p.id, 'aprovado'));
    assert.strictEqual(r1.status, 200, JSON.stringify(r1.body));
    assert.deepStrictEqual({ ...(await pedidoAgora(p.id)) }, { status: 'aprovado', col: null }, 'a mudanca manual nao limpou a coluna');
    const r2 = await comAuditoriaFalhando('pedido_compra', 'STATUS_MANUAL_ALTERADO', () => patchStatus(p.id, 'recebido'));
    assert.strictEqual(r2.status, 200, JSON.stringify(r2.body));
    await estornar(mov);
    assert.deepStrictEqual({ ...(await pedidoAgora(p.id)) }, { status: 'recebido', col: null },
      'o estorno reabriu um fechamento do comprador');
  });

  await test('[RN-07b] o PATCH que reescreve o mesmo status nao limpa: o estorno reabre', async () => {
    const p = await novoPedido('enviado');
    const mov = await notaProcessada(p);
    const r = await patchStatus(p.id, 'recebido');
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.deepStrictEqual({ ...(await pedidoAgora(p.id)) }, { status: 'recebido', col: 'enviado' });
    await estornar(mov);
    assert.deepStrictEqual({ ...(await pedidoAgora(p.id)) }, { status: 'enviado', col: null });
  });

  await test('[RN-07c] recebido sem coluna e sem trilha (gravado direto): o estorno nao reabre', async () => {
    const p = await novoPedido('enviado');
    const mov = await notaProcessada(p);
    await dbRun(db, 'UPDATE pedidos_compra SET fechado_automaticamente_de = NULL WHERE id = ?', [p.id]);
    await dbRun(db, "DELETE FROM auditoria_log_almoxarifado WHERE entidade = 'pedido_compra' AND entidade_id = ?", [p.id]);
    await estornar(mov);
    assert.strictEqual((await pedidoAgora(p.id)).status, 'recebido');
    // Fase 5 (r3 M11): a metade positiva — o estorno rodou (a linha foi descontada); so nao reabriu.
    assert.strictEqual((await dbGet(db, 'SELECT quantidade_recebida q FROM itens_pedido_compra WHERE id = ?', [p.linha])).q, 0);
  });

  await test('[RN-07d] controle: a trilha automatica gravada e a coluna apagada nao reabre (quem decide e a coluna)', async () => {
    const p = await novoPedido('enviado');
    const mov = await notaProcessada(p);
    const trilha = await dbGet(db, `SELECT COUNT(*) n FROM auditoria_log_almoxarifado WHERE entidade = 'pedido_compra'
      AND entidade_id = ? AND acao = 'STATUS_AUTOMATICO_RECEBIDO'`, [p.id]);
    assert.strictEqual(trilha.n, 1, 'fixture: a trilha tinha de existir');
    await dbRun(db, 'UPDATE pedidos_compra SET fechado_automaticamente_de = NULL WHERE id = ?', [p.id]);
    await estornar(mov);
    assert.strictEqual((await pedidoAgora(p.id)).status, 'recebido', 'o estorno ainda decide pela trilha da Auditoria');
    assert.strictEqual((await dbGet(db, 'SELECT quantidade_recebida q FROM itens_pedido_compra WHERE id = ?', [p.linha])).q, 0,
      'a metade positiva: o estorno rodou e descontou a linha');
  });

  await test('[RN-08] destino ilegivel na coluna: reabre para pendente', async () => {
    const p = await novoPedido('enviado');
    const mov = await notaProcessada(p);
    await dbRun(db, "UPDATE pedidos_compra SET fechado_automaticamente_de = 'qualquer' WHERE id = ?", [p.id]);
    await estornar(mov);
    assert.deepStrictEqual({ ...(await pedidoAgora(p.id)) }, { status: 'pendente', col: null });
  });

  await test('[RN-09] o legado: o backfill grava a coluna pela ultima trilha de status, uma vez so (ledger)', async () => {
    const ins = async (status) => (await dbRun(db, `INSERT INTO pedidos_compra (numero, fornecedor_id, status)
      VALUES (?, ?, ?)`, [`PC-PFST122-L${++seq}`, forn, status])).lastID;
    const trilha = (pedido, acao, anteriores) => dbRun(db, `INSERT INTO auditoria_log_almoxarifado
      (entidade, entidade_id, acao, dados_anteriores) VALUES ('pedido_compra', ?, ?, ?)`, [pedido, acao, anteriores]);
    const a = await ins('recebido'); await trilha(a, 'STATUS_AUTOMATICO_RECEBIDO', '{"status":"aprovado"}');
    const b = await ins('recebido'); await trilha(b, 'STATUS_AUTOMATICO_RECEBIDO', '{"status":"enviado"}');
    await trilha(b, 'STATUS_MANUAL_ALTERADO', '{"status":"recebido"}');
    const c = await ins('recebido'); await trilha(c, 'STATUS_AUTOMATICO_RECEBIDO', 'nao e json');
    const d = await ins('enviado'); await trilha(d, 'STATUS_AUTOMATICO_RECEBIDO', '{"status":"aprovado"}');
    const e = await ins('Recebido'); await trilha(e, 'STATUS_AUTOMATICO_RECEBIDO', '{"status":"Enviado"}');
    await dbRun(db, 'DELETE FROM schema_migrations_almoxarifado WHERE id = ?', [LEDGER]);
    await schema.migrateBackfillPedidoFechadoAutomaticamente(db);
    const col = async (id) => (await pedidoAgora(id)).col;
    assert.deepStrictEqual([await col(a), await col(b), await col(c), await col(d), await col(e)],
      ['aprovado', null, 'pendente', null, 'enviado']);
    assert.ok(await dbGet(db, 'SELECT 1 ok FROM schema_migrations_almoxarifado WHERE id = ?', [LEDGER]), 'o ledger nao foi gravado');
    await dbRun(db, 'UPDATE pedidos_compra SET fechado_automaticamente_de = NULL WHERE id = ?', [a]);
    await schema.migrateBackfillPedidoFechadoAutomaticamente(db);
    assert.strictEqual(await col(a), null, 'com o ledger gravado o backfill rodou de novo');
  });

  await test('[RN-09c] o legado de verdade: a coluna do backfill reabre pelo estorno', async () => {
    const p = await novoPedido('enviado');
    const mov = await notaProcessada(p);
    await dbRun(db, 'UPDATE pedidos_compra SET fechado_automaticamente_de = NULL WHERE id = ?', [p.id]);
    await dbRun(db, 'DELETE FROM schema_migrations_almoxarifado WHERE id = ?', [LEDGER]);
    await schema.migrateBackfillPedidoFechadoAutomaticamente(db);
    assert.strictEqual((await pedidoAgora(p.id)).col, 'enviado', 'o backfill nao leu a trilha da nota');
    await estornar(mov);
    assert.deepStrictEqual({ ...(await pedidoAgora(p.id)) }, { status: 'enviado', col: null });
  });

  console.log(`\n${passed} passaram, ${failed} falharam\n`);
  await close();
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
