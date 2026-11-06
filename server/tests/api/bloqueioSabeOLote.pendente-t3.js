/**
 * Etapa 209 (T0) — PENDENTES da T3/T4/T5/T7: o motor confere o lote no DESBLOQUEIO (M1/M2) e no estorno do BLOQUEIO (M3), o
 * desbloqueio avulso aceita `lote_id` (B1422), a rota GET /materiais/:id/bloqueado-por-lote e a integracao (RN-209.07).
 *
 * POR QUE ESTE ARQUIVO NAO SE CHAMA *.api.test.js: o runner (`tests/api/run-all.js`) so descobre `*.api.test.js`. Estes testes
 * ficam VERMELHOS de proposito ate a T3-T5 (o codigo de hoje nao tem M1/M2/M3, o servico ignora `lote_id`, a rota nao existe) e
 * nao podem derrubar o `npm run test:api` da fatia T0-T2. Quem comecar a T3: rodar `node tests/api/bloqueioSabeOLote.pendente-t3.js`
 * (vermelho real em cada RN), implementar, e quando T3+T4+T5 estiverem verdes MOVER estes testes para
 * `bloqueioSabeOLote.api.test.js` (ou renomear este para `bloqueioSabeOLote.motor.api.test.js`) — nao deixar fora do runner.
 *
 * Divergencia do plano (T7): `POST /movimentacoes/v2` RECUSA `SUCATA` (TIPO_DEDICADO, schemas.js:72 — a sucata tem dupla aprovacao
 * na aba Sucateamentos). A RN-209.07 pela rota usa PERDA na v2; pelo servico, `registrarMovimentacao` SUCATA direto no motor.
 *
 * Plano: docs/superpowers/plans/2026-11-07-almoxarifado-etapa209-bloqueio-sabe-o-lote.md
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const returnService = require('../../services/almoxarifado/returnService');
const inspectionService = require('../../services/almoxarifado/inspectionService');
const stockService = require('../../services/almoxarifado/stockService');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${String(e.message).replace(/\s*\n\s*/g, ' ').slice(0, 700)}`); });
}
const ADMIN = { id: 1, nome: 'Adm 209', role: 'admin', is_superadmin: 1, email: 'a209@t.com' };
const API = '/api/almoxarifado';
let seq = 0;
let terminou = false;
process.on('exit', (code) => {
  if (!terminou && code === 0) { console.error('  ✗ o arquivo SAIU NO MEIO (event loop vazio)'); process.exitCode = 1; }
});
const M1 = (semLote, lista) => `Informe o lote: só ${semLote} UN bloqueado(s) sem lote — o resto está em lote (${lista})`;
const M2 = (codigo, noLote) => `Quantidade bloqueada insuficiente no lote ${codigo}: ${noLote} UN`;
const M3 = (codigo, n) => `Não é possível estornar: o bloqueio do lote ${codigo} já foi desfeito (bloqueado no lote: ${n} UN)`;
const B1422 = 'lote_id deve ser um número inteiro positivo';

(async () => {
  console.log('\n=== Etapa 209 (T0, pendentes da T3-T7): o motor confere o lote ===\n');
  const { bloqueadoPorLote } = require('../../services/almoxarifado/bloqueioPorLote');
  const { app, db, close } = await createTestApp({ user: { ...ADMIN } });
  const post = (u, b) => request(app).post(u).send(b);
  const alm = await post(`${API}/almoxarifados`, { codigo: 'ALM209P', nome: 'Almox 209 P' });
  assert.ok(alm.status === 201 || alm.status === 200, `almoxarifado: ${alm.status}`);
  await post(`${API}/localizacoes`, { codigo: 'Z209P-01', descricao: 'Z209P-01', almoxarifado_id: alm.body.id, tipo: 'Prateleira' });
  const P01 = await dbGet(db, "SELECT id FROM localizacoes_almoxarifado WHERE codigo = 'Z209P-01'");

  const material = async ({ lote = 1 } = {}) => {
    const c = `E209P-${++seq}`;
    const id = (await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, quantidade_minima, ativo,
        material_critico, custo_unitario, controle_lote, controle_serie, localizacao_padrao_id)
        VALUES (?, ?, 'UN', 0, 0, 1, 0, 0.1, ?, 0, ?)`, [c, c, lote, P01.id])).lastID;
    return { id, nome: c };
  };
  const entrar = async (m, q, lote) => {
    const r = await post(`${API}/movimentacoes/v2`, { material_id: m.id, tipo: 'ENTRADA', quantidade: q, motivo: 'e209',
      localizacao_destino_id: P01.id, lote });
    assert.strictEqual(r.status, 201, `entrada: ${JSON.stringify(r.body)}`);
  };
  const loteId = async (m, codigo) => (await dbGet(db, 'SELECT id FROM lotes_almoxarifado WHERE material_id = ? AND codigo = ?',
    [m.id, codigo])).id;
  const sair = async (m, q, codigo) => {
    const r = await post(`${API}/movimentacoes/v2`, { material_id: m.id, tipo: 'SAIDA', quantidade: q, motivo: 'e209',
      justificativa: 'teste 209', localizacao_origem_id: P01.id, lote_id: codigo ? await loteId(m, codigo) : undefined });
    assert.strictEqual(r.status, 201, `saida: ${JSON.stringify(r.body)}`);
    return dbGet(db, "SELECT id, lote_id FROM movimentacoes_almoxarifado WHERE material_id = ? AND tipo = 'SAIDA' ORDER BY id DESC", [m.id]);
  };
  // quarentena de q pecas de L (entra 5+q em L, sai q, devolve q para Quarentena citando a saida)
  const quarentena = async (m, q, codigo = 'L1') => {
    await entrar(m, 5 + q, codigo);
    const s = await sair(m, q, codigo);
    await returnService.registrarDevolucao(db, ADMIN, { material_id: m.id, quantidade: q, motivo: 'DEFEITO', destino: 'QUARENTENA',
      movimentacao_saida_id: s.id, localizacao_id: P01.id });
    return loteId(m, codigo);
  };
  const desbloquear = (m, corpo) => post(`${API}/materiais/${m.id}/desbloquear`, { justificativa: 'libera 209', ...corpo });
  const recusou = (r, msg) => { assert.strictEqual(r.status, 400, JSON.stringify(r.body)); assert.strictEqual(r.body.error, msg); };
  const contaDesbloqueios = async (m) => Number((await dbGet(db,
    "SELECT COUNT(*) n FROM movimentacoes_almoxarifado WHERE material_id = ? AND tipo = 'DESBLOQUEIO'", [m.id])).n);
  const bloqueada = async (m) => Number((await dbGet(db, 'SELECT quantidade_bloqueada b FROM materiais_almoxarifado WHERE id = ?', [m.id])).b);

  // ── RN-209.04: liberar do lote ───────────────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-209.04 a] desbloquear L1 2 de L1 2: 200, DESBLOQUEIO com L1, total e L1 descem', async () => {
    const m = await material(); const L1 = await quarentena(m, 2);
    const r = await desbloquear(m, { quantidade: 2, lote_id: L1 });
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    const d = await dbGet(db, "SELECT lote_id FROM movimentacoes_almoxarifado WHERE material_id = ? AND tipo = 'DESBLOQUEIO'", [m.id]);
    assert.strictEqual(d.lote_id, L1);
    assert.deepStrictEqual(await bloqueadoPorLote(db, m.id), { material_id: m.id, total: 0, sem_lote: 0, lotes: [] });
  });
  await test('[RN-209.04 b] L1 2 + avulso 3: desbloquear 3 de L1 -> 400 M2, nada gravado', async () => {
    const m = await material(); const L1 = await quarentena(m, 2);
    await inspectionService.bloquearMaterial(db, ADMIN, m.id, { quantidade: 3, justificativa: 'avulso' });
    recusou(await desbloquear(m, { quantidade: 3, lote_id: L1 }), M2('L1', 2));
    assert.strictEqual(await contaDesbloqueios(m), 0); assert.strictEqual(await bloqueada(m), 5);
  });
  await test('[RN-209.04 c] lote de outro material / inexistente -> as literais do motor', async () => {
    const m = await material(); await quarentena(m, 2);
    const outro = await material(); await entrar(outro, 1, 'LX');
    recusou(await desbloquear(m, { quantidade: 1, lote_id: await loteId(outro, 'LX') }), 'O lote informado pertence a outro material');
    recusou(await desbloquear(m, { quantidade: 1, lote_id: 999999 }), 'Lote nao encontrado');
    assert.strictEqual(await contaDesbloqueios(m), 0);
  });
  await test('[RN-209.04 d, B1422] lote_id "x" / 0 / 1.5 -> 400; vazio e null = sem lote', async () => {
    const m = await material(); await entrar(m, 5, 'L1');
    await inspectionService.bloquearMaterial(db, ADMIN, m.id, { quantidade: 3, justificativa: 'avulso' });
    for (const v of ['x', 0, 1.5, -2]) recusou(await desbloquear(m, { quantidade: 1, lote_id: v }), B1422); // eslint-disable-line no-await-in-loop
    assert.strictEqual((await desbloquear(m, { quantidade: 1, lote_id: '' })).status, 200);
    assert.strictEqual((await desbloquear(m, { quantidade: 1, lote_id: null })).status, 200);
    assert.strictEqual(await bloqueada(m), 1);
  });

  // ── RN-209.05: sem lote so do "sem lote" (B1417) e a ordem das recusas (B1420) ────────────────────────────────────────────────
  await test('[RN-209.05] total 5 = L1 2 + sem lote 3: sem lote q=4 -> M1; q=6 -> a literal de hoje; q=3 -> 200 (L1 fica 2)', async () => {
    const m = await material(); const L1 = await quarentena(m, 2);
    await inspectionService.bloquearMaterial(db, ADMIN, m.id, { quantidade: 3, justificativa: 'avulso' });
    recusou(await desbloquear(m, { quantidade: 4 }), M1(3, 'L1: 2'));
    recusou(await desbloquear(m, { quantidade: 6 }), 'Quantidade bloqueada insuficiente: 5');
    assert.strictEqual(await contaDesbloqueios(m), 0);
    assert.strictEqual((await desbloquear(m, { quantidade: 3 })).status, 200);
    assert.deepStrictEqual(await bloqueadoPorLote(db, m.id), { material_id: m.id, total: 2, sem_lote: 0, lotes: [{ lote_id: L1, codigo: 'L1', quantidade: 2 }] });
  });

  // ── RN-209.06: o estorno respeita o lote ─────────────────────────────────────────────────────────────────────────────────────
  const estornar = (id) => post(`${API}/movimentacoes/${id}/cancelar`, { motivo: 'estorno 209' });
  await test('[RN-209.06 a] estornar o DESBLOQUEIO de L1 -> L1 volta (cancelado = 1), sem guarda nova', async () => {
    const m = await material(); const L1 = await quarentena(m, 2);
    assert.strictEqual((await desbloquear(m, { quantidade: 2, lote_id: L1 })).status, 200);
    const d = await dbGet(db, "SELECT id FROM movimentacoes_almoxarifado WHERE material_id = ? AND tipo = 'DESBLOQUEIO'", [m.id]);
    assert.strictEqual((await estornar(d.id)).status, 200);
    assert.deepStrictEqual((await bloqueadoPorLote(db, m.id)).lotes, [{ lote_id: L1, codigo: 'L1', quantidade: 2 }]);
  });
  await test('[RN-209.06 c] L1 2 + sem lote 2, desbloqueia L1 2, estorna o BLOQUEIO de L1 -> 400 M3; BLOQUEIO vivo, sem ESTORNO, total 2 = sem lote 2', async () => {
    const m = await material(); const L1 = await quarentena(m, 2);
    await inspectionService.bloquearMaterial(db, ADMIN, m.id, { quantidade: 2, justificativa: 'avulso' });
    assert.strictEqual((await desbloquear(m, { quantidade: 2, lote_id: L1 })).status, 200);
    const bl = await dbGet(db, "SELECT id FROM movimentacoes_almoxarifado WHERE material_id = ? AND tipo = 'BLOQUEIO' AND lote_id = ?", [m.id, L1]);
    recusou(await estornar(bl.id), M3('L1', 2));
    const depois = await dbGet(db, 'SELECT cancelado FROM movimentacoes_almoxarifado WHERE id = ?', [bl.id]);
    assert.strictEqual(Number(depois.cancelado), 0, 'o BLOQUEIO continua vivo');
    assert.strictEqual(Number((await dbGet(db, "SELECT COUNT(*) n FROM movimentacoes_almoxarifado WHERE material_id = ? AND tipo = 'ESTORNO'", [m.id])).n), 0);
    assert.deepStrictEqual(await bloqueadoPorLote(db, m.id), { material_id: m.id, total: 2, sem_lote: 2, lotes: [] });
  });

  // ── RN-209.08: a rota GET (T5) ───────────────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-209.08] GET /materiais/:id/bloqueado-por-lote -> o contrato; inexistente -> 404', async () => {
    const m = await material(); const L1 = await quarentena(m, 2);
    await inspectionService.bloquearMaterial(db, ADMIN, m.id, { quantidade: 3, justificativa: 'avulso' });
    const r = await request(app).get(`${API}/materiais/${m.id}/bloqueado-por-lote`);
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.deepStrictEqual(r.body, { material_id: m.id, total: 5, sem_lote: 3, lotes: [{ lote_id: L1, codigo: 'L1', quantidade: 2 }] });
    const n = await request(app).get(`${API}/materiais/999999/bloqueado-por-lote`);
    assert.strictEqual(n.status, 404); assert.strictEqual(n.body.error, 'Material não encontrado');
  });

  // ── RN-209.10: corrida (sem gancho: o motor serializa por naTravaDoMaterial) ──────────────────────────────────────────────────
  await test('[RN-209.10] dois desbloqueios simultaneos de L1 2 (total 4) pedindo 2 cada: um 200, um 400 M2; total 2, L1 0', async () => {
    const m = await material(); const L1 = await quarentena(m, 2);
    await inspectionService.bloquearMaterial(db, ADMIN, m.id, { quantidade: 2, justificativa: 'avulso' });
    const rs = await Promise.allSettled([1, 2].map(() => inspectionService.desbloquearMaterial(db, ADMIN, m.id,
      { quantidade: 2, lote_id: L1, justificativa: 'corrida' })));
    assert.deepStrictEqual(rs.map((x) => x.status).sort(), ['fulfilled', 'rejected']);
    assert.strictEqual(rs.find((x) => x.status === 'rejected').reason.message, M2('L1', 0));
    assert.deepStrictEqual(await bloqueadoPorLote(db, m.id), { material_id: m.id, total: 2, sem_lote: 2, lotes: [] });
  });

  // ── RN-209.07: o descarte da peca em quarentena fica no lote (T7) ────────────────────────────────────────────────────────────
  await test('[RN-209.07, rota] devolucao Q de L1 2 -> GET -> desbloquear L1 2 -> PERDA de L1 2 na v2: saldo de L1 desce 2, bloqueado L1 0, quatro linhas com L1', async () => {
    const m = await material(); const L1 = await quarentena(m, 2);
    const g = await request(app).get(`${API}/materiais/${m.id}/bloqueado-por-lote`);
    assert.deepStrictEqual(g.body.lotes, [{ lote_id: L1, codigo: 'L1', quantidade: 2 }]);
    assert.strictEqual((await desbloquear(m, { quantidade: 2, lote_id: L1 })).status, 200);
    const antes = Number((await dbGet(db, 'SELECT SUM(quantidade) q FROM estoque_saldo_almoxarifado WHERE lote_id = ?', [L1])).q);
    const p = await post(`${API}/movimentacoes/v2`, { material_id: m.id, tipo: 'PERDA', quantidade: 2, motivo: 'descarte 209',
      justificativa: 'peca da quarentena', localizacao_origem_id: P01.id, lote_id: L1 });
    assert.strictEqual(p.status, 201, JSON.stringify(p.body));
    const depois = Number((await dbGet(db, 'SELECT SUM(quantidade) q FROM estoque_saldo_almoxarifado WHERE lote_id = ?', [L1])).q);
    assert.strictEqual(antes - depois, 2);
    const l = await dbAll(db, `SELECT tipo, lote_id FROM movimentacoes_almoxarifado WHERE material_id = ?
      AND tipo IN ('ENTRADA_DEVOLUCAO','BLOQUEIO','DESBLOQUEIO','PERDA') ORDER BY id`, [m.id]);
    assert.deepStrictEqual(l.map((x) => [x.tipo, x.lote_id]), [['ENTRADA_DEVOLUCAO', L1], ['BLOQUEIO', L1], ['DESBLOQUEIO', L1], ['PERDA', L1]]);
    assert.deepStrictEqual((await bloqueadoPorLote(db, m.id)).lotes, []);
  });
  await test('[RN-209.07, servico] registrarDevolucao -> desbloquearMaterial(L1) -> registrarMovimentacao SUCATA L1 2', async () => {
    const m = await material(); const L1 = await quarentena(m, 2);
    await inspectionService.desbloquearMaterial(db, ADMIN, m.id, { quantidade: 2, lote_id: L1, justificativa: 'descarte' });
    await stockService.registrarMovimentacao(db, ADMIN, { material_id: m.id, tipo: 'SUCATA', quantidade: 2, motivo: 'descarte 209',
      justificativa: 'peca da quarentena', localizacao_origem_id: P01.id, lote_id: L1 });
    const l = await dbAll(db, `SELECT tipo, lote_id FROM movimentacoes_almoxarifado WHERE material_id = ?
      AND tipo IN ('ENTRADA_DEVOLUCAO','BLOQUEIO','DESBLOQUEIO','SUCATA') ORDER BY id`, [m.id]);
    assert.deepStrictEqual(l.map((x) => [x.tipo, x.lote_id]), [['ENTRADA_DEVOLUCAO', L1], ['BLOQUEIO', L1], ['DESBLOQUEIO', L1], ['SUCATA', L1]]);
    assert.deepStrictEqual((await bloqueadoPorLote(db, m.id)).lotes, []);
  });

  await close();
  console.log(`\n${passed} passaram, ${failed} falharam\n`);
  terminou = true;
  process.exit(failed > 0 ? 1 : 0);
})();
