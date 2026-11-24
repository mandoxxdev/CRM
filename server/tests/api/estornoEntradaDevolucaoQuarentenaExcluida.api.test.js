/**
 * Etapa 262 (C239, C552; B1617, B1618) — o estorno da ENTRADA_DEVOLUCAO:
 *  - RN-262.01 (C552): a devolucao que cita a saida de uma requisicao EXCLUIDA nao se estorna (a exclusao ja descontou a devolucao;
 *    o estorno tirava as pecas de novo: fisico 3 em vez de 5), em qualquer destino, antes da guarda da Sucata.
 *  - RN-262.02 (C239): a devolucao para QUARENTENA nao se estorna com o bloqueio dela de pe e cobrindo (ficava bloqueado sem as pecas).
 *  - RN-262.03: a quarentena liberada, o bloqueio estornado, a requisicao viva, a compensacao — passam.
 *  - RN-262.04: as duas guardas de novo dentro da secao da trava do material (a exclusao e o estorno do Desbloquear no meio).
 *
 * Executar: cd server && node tests/api/estornoEntradaDevolucaoQuarentenaExcluida.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet } = require('../../services/almoxarifado/db');
const requisitionService = require('../../services/almoxarifado/requisitionService');
const stockService = require('../../services/almoxarifado/stockService');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${String(e.message).replace(/\s*\n\s*/g, ' ').slice(0, 500)}`); });
}
const SUPER = { id: 1, nome: 'Super Teste', role: 'admin', is_superadmin: 1, email: 'super@test.com' };

const MSG_EXCLUIDA = (dev, numero) => `Não é possível estornar: esta entrada é da devolução DEV-${dev}, de uma entrega da requisição `
  + `${numero}, que foi excluída — a exclusão já devolveu ao estoque o resto da entrega contando com esta devolução, e estornar a `
  + 'entrada tiraria estas peças de novo. Se a devolução foi registrada errada, acerte o estoque com um Ajuste.';
const MSG_QUARENTENA = (dev) => `Não é possível estornar: esta entrada é da devolução DEV-${dev}, que foi para a quarentena, e o `
  + 'bloqueio dela continua de pé — estornar só a entrada deixaria bloqueadas peças que não estão mais no estoque. Estorne primeiro '
  + 'o bloqueio desta devolução e depois esta entrada.';

const MSG_PARTE = (dev, n) => `Não é possível estornar: esta entrada é da devolução DEV-${dev}, que foi para a quarentena, e ainda há ${n} `
  + `PC dela no bloqueio — estornar só a entrada deixaria bloqueadas peças que não estão mais no estoque. Desbloqueie ${n} PC e depois `
  + 'estorne esta entrada.';
const MSG_ANDAMENTO = (dev) => `Não é possível estornar agora: o estorno do bloqueio da devolução DEV-${dev} está em andamento — tente `
  + 'de novo em instantes.';

(async () => {
  const { app, db, close } = await createTestApp({ user: SUPER });
  let seq = 0;
  async function material(extra = {}) {
    seq += 1;
    const codigo = `EDQ262-${seq}`;
    const id = (await dbRun(db, `INSERT INTO materiais_almoxarifado
      (codigo, nome, unidade, quantidade_atual, quantidade_minima, custo_unitario, ativo)
      VALUES (?, ?, 'PC', 0, 0, 10, 1)`, [codigo, codigo])).lastID;
    for (const [k, v] of Object.entries(extra)) await dbRun(db, `UPDATE materiais_almoxarifado SET ${k} = ? WHERE id = ?`, [v, id]);
    return { id, codigo };
  }
  const ultima = async (m, tipo) => (await dbGet(db,
    'SELECT id FROM movimentacoes_almoxarifado WHERE material_id = ? AND tipo = ? ORDER BY id DESC LIMIT 1', [m.id, tipo])).id;
  const mov = async (m, body) => {
    const r = await request(app).post('/api/almoxarifado/movimentacoes/v2').send({ material_id: m.id, motivo: 'edq262',
      justificativa: 'preparo edq262', documento_vinculado: 'NF-EDQ262', ...body });
    assert.strictEqual(r.status, 201, `${body.tipo}: ${JSON.stringify(r.body)}`);
    return ultima(m, body.tipo);
  };
  const devolver = async (m, saidaId, quantidade, destino) => {
    const r = await request(app).post('/api/almoxarifado/devolucoes')
      .send({ material_id: m.id, quantidade, motivo: 'NAO_UTILIZADO', destino, movimentacao_saida_id: saidaId });
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    return { devId: r.body.id, entradaId: await ultima(m, 'ENTRADA_DEVOLUCAO') };
  };
  const estornar = (movId) => request(app).post(`/api/almoxarifado/movimentacoes/${movId}/cancelar`).send({ motivo: 'edq262' });
  const desbloquear = (m, quantidade, extra = {}) => request(app).post(`/api/almoxarifado/materiais/${m.id}/desbloquear`)
    .send({ quantidade, justificativa: 'quarentena liberada', ...extra });
  const estado = async (m) => {
    const r = await dbGet(db, 'SELECT quantidade_atual q, COALESCE(quantidade_bloqueada, 0) b FROM materiais_almoxarifado WHERE id = ?', [m.id]);
    return [r.q, r.b];
  };
  const cancelado = async (id) => (await dbGet(db, 'SELECT COALESCE(cancelado, 0) c FROM movimentacoes_almoxarifado WHERE id = ?', [id])).c;
  const estornos = async (id) => (await dbGet(db, "SELECT COUNT(*) n FROM movimentacoes_almoxarifado WHERE tipo = 'ESTORNO' AND documento_vinculado = ?",
    [`ESTORNO-${id}`])).n;
  async function requisicaoEntregue(m, qtd) {
    const numero = `REQ-${m.codigo}`;
    const rq = (await dbRun(db, `INSERT INTO requisicoes_almoxarifado (numero, solicitante_id, solicitante_nome, status)
      VALUES (?, 1, 'Sol', 'APROVADO')`, [numero])).lastID;
    const it = (await dbRun(db, `INSERT INTO itens_requisicao_almoxarifado (requisicao_id, material_id, quantidade_solicitada,
      quantidade_separada, quantidade_entregue, quantidade_atendida) VALUES (?,?,?,0,0,0)`, [rq, m.id, qtd])).lastID;
    await requisitionService.separarRequisicao(db, rq, [{ item_id: it, quantidade_separada: qtd }], SUPER);
    const ent = await request(app).put(`/api/almoxarifado/requisicoes/${rq}/entregar`)
      .send({ itens_atendidos: [{ item_id: it, quantidade_atendida: qtd }] });
    assert.strictEqual(ent.status, 200, JSON.stringify(ent.body));
    return { rq, numero, saidaId: await ultima(m, 'SAIDA') };
  }
  const excluir = async (rq) => {
    const ex = await request(app).delete(`/api/almoxarifado/requisicoes/${rq}`).send({ justificativa: 'edq262' });
    assert.strictEqual(ex.status, 200, JSON.stringify(ex.body));
  };
  /** Entrada 10, Saida avulsa 2, devolucao 2 para Quarentena: [10, 2]. */
  async function quarentena(extra = {}) {
    const m = await material(extra);
    await mov(m, { tipo: 'ENTRADA', quantidade: 10 });
    const saidaId = await mov(m, { tipo: 'SAIDA', quantidade: 2 });
    const d = await devolver(m, saidaId, 2, 'QUARENTENA');
    assert.deepStrictEqual(await estado(m), [10, 2]);
    return { m, ...d, bloqueioId: await ultima(m, 'BLOQUEIO') };
  }
  /** Entrada 5, requisicao entrega `entregue`, devolucao 2 (destino) citando a saida, requisicao excluida. */
  async function excluida(destino, entregue = 2) {
    const m = await material();
    await mov(m, { tipo: 'ENTRADA', quantidade: 5 });
    const { rq, numero, saidaId } = await requisicaoEntregue(m, entregue);
    const d = await devolver(m, saidaId, 2, destino);
    await excluir(rq);
    return { m, numero, rq, saidaId, ...d };
  }

  // ── RN-262.02 (C239) — a quarentena ──────────────────────────────────────────────────────────────────────────────────
  await test('[RN-262.02] quarentena com o bloqueio de pe: 400 literal, nada tocado ([10, 2], a entrada nao cancelada, sem ESTORNO)', async () => {
    const { m, devId, entradaId } = await quarentena();
    const e = await estornar(entradaId);
    assert.strictEqual(e.status, 400, JSON.stringify(e.body));
    assert.strictEqual(e.body.error, MSG_QUARENTENA(devId));
    assert.deepStrictEqual(await estado(m), [10, 2]);
    assert.strictEqual(await cancelado(entradaId), 0);
    assert.strictEqual(await estornos(entradaId), 0);
  });

  await test('[RN-262.02] o caminho da mensagem: estornado o bloqueio ([10, 0]), a entrada estorna ([8, 0])', async () => {
    const { m, entradaId, bloqueioId } = await quarentena();
    assert.strictEqual((await estornar(bloqueioId)).status, 200);
    assert.deepStrictEqual(await estado(m), [10, 0]);
    const e = await estornar(entradaId);
    assert.strictEqual(e.status, 200, JSON.stringify(e.body));
    assert.deepStrictEqual(await estado(m), [8, 0]);
  });

  await test('[RN-262.02] com lote: o bloqueio do lote de pe recusa; estornado o bloqueio, a entrada estorna', async () => {
    const m = await material({ controle_lote: 1 });
    const r = await request(app).post('/api/almoxarifado/movimentacoes/v2').send({ material_id: m.id, tipo: 'ENTRADA', quantidade: 10,
      motivo: 'edq262', justificativa: 'edq262', documento_vinculado: 'NF', lote: 'L1' });
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    const lote = await dbGet(db, 'SELECT id FROM lotes_almoxarifado WHERE material_id = ?', [m.id]);
    const saidaId = await mov(m, { tipo: 'SAIDA', quantidade: 2, lote_id: lote.id });
    const { devId, entradaId } = await devolver(m, saidaId, 2, 'QUARENTENA');
    const bloqueioId = await ultima(m, 'BLOQUEIO');
    assert.strictEqual((await dbGet(db, 'SELECT lote_id FROM movimentacoes_almoxarifado WHERE id = ?', [bloqueioId])).lote_id, lote.id);
    const e = await estornar(entradaId);
    assert.strictEqual(e.status, 400, JSON.stringify(e.body));
    assert.strictEqual(e.body.error, MSG_QUARENTENA(devId));
    assert.deepStrictEqual(await estado(m), [10, 2]);
    assert.strictEqual((await estornar(bloqueioId)).status, 200);
    assert.strictEqual((await estornar(entradaId)).status, 200);
    assert.deepStrictEqual(await estado(m), [8, 0]);
  });

  await test('[RN-262.02] liberada pela metade (Desbloquear 1): recusa mandando desbloquear 1; desbloqueado, passa ([8, 0])', async () => {
    const { m, devId, entradaId } = await quarentena();
    assert.strictEqual((await desbloquear(m, 1)).status, 200);
    let e = await estornar(entradaId);
    assert.strictEqual(e.status, 400, JSON.stringify(e.body));
    assert.strictEqual(e.body.error, MSG_PARTE(devId, 1));
    assert.deepStrictEqual(await estado(m), [10, 1]);
    assert.strictEqual((await desbloquear(m, 1)).status, 200);
    e = await estornar(entradaId);
    assert.strictEqual(e.status, 200, JSON.stringify(e.body));
    assert.deepStrictEqual(await estado(m), [8, 0]);
  });

  await test('[RN-262.02] com lote: o estorno do bloqueio em andamento (claim provisorio) tambem recusa', async () => {
    // o claim provisorio tira o bloqueio da soma do lote (cancelado = 1) sem ter desfeito nada; sem a clausula (i) a entrada passaria
    const m = await material({ controle_lote: 1 });
    await request(app).post('/api/almoxarifado/movimentacoes/v2').send({ material_id: m.id, tipo: 'ENTRADA', quantidade: 10,
      motivo: 'edq262', justificativa: 'edq262', documento_vinculado: 'NF', lote: 'L1' });
    const lote = await dbGet(db, 'SELECT id FROM lotes_almoxarifado WHERE material_id = ?', [m.id]);
    const saidaId = await mov(m, { tipo: 'SAIDA', quantidade: 2, lote_id: lote.id });
    const { devId, entradaId } = await devolver(m, saidaId, 2, 'QUARENTENA');
    const bloqueioId = await ultima(m, 'BLOQUEIO');
    await dbRun(db, 'UPDATE movimentacoes_almoxarifado SET cancelado = 1 WHERE id = ?', [bloqueioId]);
    const e = await estornar(entradaId);
    await dbRun(db, 'UPDATE movimentacoes_almoxarifado SET cancelado = 0 WHERE id = ?', [bloqueioId]);
    assert.strictEqual(e.status, 400, JSON.stringify(e.body));
    assert.strictEqual(e.body.error, MSG_ANDAMENTO(devId));
    assert.deepStrictEqual(await estado(m), [10, 2]);
  });

  // ── RN-262.03 — o que nao trava ──────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-262.03] quarentena ja liberada (Desbloquear 2): o estorno do bloqueio recusa e o da entrada passa ([8, 0])', async () => {
    const { m, entradaId, bloqueioId } = await quarentena();
    const d = await desbloquear(m, 2);
    assert.strictEqual(d.status, 200, JSON.stringify(d.body));
    assert.deepStrictEqual(await estado(m), [10, 0]);
    assert.strictEqual((await estornar(bloqueioId)).status, 400);
    const e = await estornar(entradaId);
    assert.strictEqual(e.status, 200, JSON.stringify(e.body));
    assert.deepStrictEqual(await estado(m), [8, 0]);
  });

  await test('[RN-262.03] liberada e com outro bloqueio so de lote (o total cobre, o sem lote nao): a entrada passa', async () => {
    const { m, entradaId } = await quarentena();
    assert.strictEqual((await desbloquear(m, 2)).status, 200);
    // um bloqueio de 2 num lote (legado/outra porta), escrito direto: total 2, sem lote 0
    const lote = (await dbRun(db, "INSERT INTO lotes_almoxarifado (material_id, codigo) VALUES (?, 'LX')", [m.id])).lastID;
    await dbRun(db, `INSERT INTO movimentacoes_almoxarifado (material_id, tipo, quantidade, saldo_anterior, saldo_posterior, motivo, lote_id, cancelado)
      VALUES (?, 'BLOQUEIO', 2, 10, 10, 'outro', ?, 0)`, [m.id, lote]);
    await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_bloqueada = 2 WHERE id = ?', [m.id]);
    // e uma linha sem lote antiga que nao bate com o total (o livro sem lote diz 2): a regua e o MENOR dos dois — so o total - lotes da 0
    await dbRun(db, `INSERT INTO movimentacoes_almoxarifado (material_id, tipo, quantidade, saldo_anterior, saldo_posterior, motivo, cancelado)
      VALUES (?, 'BLOQUEIO', 2, 10, 10, 'legado', 0)`, [m.id]);
    const e = await estornar(entradaId);
    assert.strictEqual(e.status, 200, JSON.stringify(e.body));
    assert.deepStrictEqual(await estado(m), [8, 2]);
  });

  await test('[RN-262.03] com lote, liberada no lote e outro bloqueio sem lote (o total cobre, o lote nao): a entrada passa', async () => {
    const m = await material({ controle_lote: 1 });
    await request(app).post('/api/almoxarifado/movimentacoes/v2').send({ material_id: m.id, tipo: 'ENTRADA', quantidade: 10,
      motivo: 'edq262', justificativa: 'edq262', documento_vinculado: 'NF', lote: 'L1' });
    const lote = await dbGet(db, 'SELECT id FROM lotes_almoxarifado WHERE material_id = ?', [m.id]);
    const saidaId = await mov(m, { tipo: 'SAIDA', quantidade: 2, lote_id: lote.id });
    const { entradaId } = await devolver(m, saidaId, 2, 'QUARENTENA');
    const d = await desbloquear(m, 2, { lote_id: lote.id });
    assert.strictEqual(d.status, 200, JSON.stringify(d.body));
    const b = await request(app).post(`/api/almoxarifado/materiais/${m.id}/bloquear`).send({ quantidade: 2, justificativa: 'avulso' });
    assert.strictEqual(b.status, 200, JSON.stringify(b.body));
    assert.deepStrictEqual(await estado(m), [10, 2]);
    const e = await estornar(entradaId);
    assert.strictEqual(e.status, 200, JSON.stringify(e.body));
    assert.deepStrictEqual(await estado(m), [8, 2]);
  });

  await test('[RN-262.03] liberada, e o bloqueado de uma reprovacao (sem livro) no material: a entrada passa ([8, 2])', async () => {
    const { m, entradaId } = await quarentena();
    assert.strictEqual((await desbloquear(m, 2)).status, 200);
    await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_bloqueada = 2 WHERE id = ?', [m.id]); // a reprovacao soma direto
    const e = await estornar(entradaId);
    assert.strictEqual(e.status, 200, JSON.stringify(e.body));
    assert.deepStrictEqual(await estado(m), [8, 2]);
  });

  await test('[RN-262.03] devolucao para Estoque de requisicao viva estorna (o fisico volta a 3)', async () => {
    const m = await material();
    await mov(m, { tipo: 'ENTRADA', quantidade: 5 });
    const { saidaId } = await requisicaoEntregue(m, 2);
    const { entradaId } = await devolver(m, saidaId, 2, 'ESTOQUE');
    const e = await estornar(entradaId);
    assert.strictEqual(e.status, 200, JSON.stringify(e.body));
    assert.deepStrictEqual(await estado(m), [3, 0]);
  });

  await test('[RN-262.03] a compensacao interna nao passa pelas guardas (quarentena e requisicao excluida)', async () => {
    const q = await quarentena();
    await stockService.cancelarMovimentacao(db, SUPER, q.entradaId, 'compensacao edq262', { compensacao: true });
    assert.strictEqual(await cancelado(q.entradaId), 1);
    const x = await excluida('ESTOQUE');
    await stockService.cancelarMovimentacao(db, SUPER, x.entradaId, 'compensacao edq262', { compensacao: true });
    assert.strictEqual(await cancelado(x.entradaId), 1);
  });

  // ── RN-262.01 (C552) — a requisicao excluida ─────────────────────────────────────────────────────────────────────────
  await test('[RN-262.01] Estoque: excluida a requisicao (5), o estorno da entrada recusa com a literal e nada muda', async () => {
    const { m, numero, devId, entradaId } = await excluida('ESTOQUE');
    assert.deepStrictEqual(await estado(m), [5, 0]);
    const e = await estornar(entradaId);
    assert.strictEqual(e.status, 400, JSON.stringify(e.body));
    assert.strictEqual(e.body.error, MSG_EXCLUIDA(devId, numero));
    assert.deepStrictEqual(await estado(m), [5, 0]);
    assert.strictEqual(await cancelado(entradaId), 0);
    assert.strictEqual(await estornos(entradaId), 0);
  });

  await test('[RN-262.01/05] Quarentena: a da requisicao excluida vem antes da do bloqueio, e continua depois de estornar o bloqueio', async () => {
    const { m, numero, devId, entradaId, saidaId } = await excluida('QUARENTENA');
    assert.ok(saidaId);
    let e = await estornar(entradaId);
    assert.strictEqual(e.status, 400, JSON.stringify(e.body));
    assert.strictEqual(e.body.error, MSG_EXCLUIDA(devId, numero));
    assert.strictEqual((await estornar(await ultima(m, 'BLOQUEIO'))).status, 200);
    e = await estornar(entradaId);
    assert.strictEqual(e.body.error, MSG_EXCLUIDA(devId, numero));
    assert.deepStrictEqual(await estado(m), [5, 0]);
  });

  await test('[RN-262.01/05] Sucata: a da requisicao excluida vem antes da E1 (a sucata de pe), e depois de estornar a sucata', async () => {
    const { m, numero, devId, entradaId } = await excluida('SUCATA');
    assert.deepStrictEqual(await estado(m), [3, 0]);
    let e = await estornar(entradaId);
    assert.strictEqual(e.status, 400, JSON.stringify(e.body));
    assert.strictEqual(e.body.error, MSG_EXCLUIDA(devId, numero));
    assert.strictEqual((await estornar(await ultima(m, 'SUCATA'))).status, 200);
    e = await estornar(entradaId);
    assert.strictEqual(e.body.error, MSG_EXCLUIDA(devId, numero));
    assert.deepStrictEqual(await estado(m), [5, 0]);
  });

  // ── RN-262.04 — de novo dentro da secao (gancho no claim; o gesto concorrente disparado do contexto do teste) ───────────
  /** Segura o claim do estorno de `movId` (o UPDATE ja gravou); devolve { chegou, soltar }. */
  function seguraNoClaim(movId) {
    const runOriginal = db.run;
    let sinal; const chegou = new Promise((r) => { sinal = r; });
    let soltar; const portao = new Promise((r) => { soltar = r; });
    let armado = true;
    db.run = function (sql, params, cb) {
      if (typeof params === 'function') { cb = params; params = []; }
      if (armado && /SET cancelado = 1, cancelado_por/.test(String(sql)) && Array.isArray(params) && Number(params[2]) === movId) {
        armado = false;
        db.run = runOriginal;
        return runOriginal.call(db, sql, params, function (err) {
          const self = this;
          sinal();
          portao.then(() => cb.call(self, err));
        });
      }
      return runOriginal.call(db, sql, params, cb);
    };
    const comPrazo = Promise.race([chegou, new Promise((_, rej) => setTimeout(() => rej(new Error('gancho do claim nao disparou')), 5000))]);
    return { chegou: comPrazo, soltar: () => soltar(), desarmar: () => { db.run = runOriginal; } };
  }

  await test('[RN-262.04] a exclusao da requisicao entre a guarda de fora e a secao: o estorno recusa (C552) e o fisico fica 5', async () => {
    const m = await material();
    await mov(m, { tipo: 'ENTRADA', quantidade: 5 });
    const { rq, numero, saidaId } = await requisicaoEntregue(m, 3);
    const { devId, entradaId } = await devolver(m, saidaId, 2, 'ESTOQUE');
    assert.deepStrictEqual(await estado(m), [4, 0]);
    const g = seguraNoClaim(entradaId);
    let e;
    try {
      const pEstorno = estornar(entradaId).then((r) => r); // supertest so dispara no then
      await g.chegou;
      await excluir(rq); // o claim provisorio conta a devolucao como viva: credita 1
      assert.deepStrictEqual(await estado(m), [5, 0]);
      g.soltar();
      e = await pEstorno;
    } finally { g.desarmar(); }
    assert.strictEqual(e.status, 400, JSON.stringify(e.body));
    assert.strictEqual(e.body.error, MSG_EXCLUIDA(devId, numero));
    assert.deepStrictEqual(await estado(m), [5, 0]);
    assert.strictEqual(await cancelado(entradaId), 0);
  });

  await test('[RN-262.04] o estorno do Desbloquear entre a guarda de fora e a secao: o estorno da entrada recusa ([10, 2])', async () => {
    const { m, devId, entradaId } = await quarentena();
    assert.strictEqual((await desbloquear(m, 2)).status, 200);
    const desbloqueioId = await ultima(m, 'DESBLOQUEIO');
    const g = seguraNoClaim(entradaId);
    let e;
    try {
      const pEstorno = estornar(entradaId).then((r) => r); // supertest so dispara no then
      await g.chegou;
      const ed = await estornar(desbloqueioId); // bloqueia de novo: a quarentena volta a valer
      assert.strictEqual(ed.status, 200, JSON.stringify(ed.body));
      g.soltar();
      e = await pEstorno;
    } finally { g.desarmar(); }
    assert.strictEqual(e.status, 400, JSON.stringify(e.body));
    assert.strictEqual(e.body.error, MSG_QUARENTENA(devId));
    assert.deepStrictEqual(await estado(m), [10, 2]);
  });

  await close();
  console.log(`\n${passed} passou, ${failed} falhou`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
