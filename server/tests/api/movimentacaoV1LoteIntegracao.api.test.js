/**
 * Etapa 202 (T2) — integracao: a v1 (POST /api/almoxarifado/movimentacoes) com lote, conferida em PORTAS DIFERENTES e sem mudanca:
 * (a) do comeco ao fim pela v1 — entrada de lote vencido, saida recusada, liberacao do vencimento (PUT /lotes/:id/liberar-vencimento),
 *     saida aceita, o relatorio "Saldo por lote" (GET /relatorios/saldo-por-lote, o da tela Relatorios) e o estorno pelo livro
 *     (POST /movimentacoes/:id/cancelar) devolvendo ao lote;
 * (b) paridade v1 x v2 (RN-202.10): os mesmos corpos nas duas rotas, mesmo status e mesma mensagem;
 * (c) pelo servico: o mesmo corpo da (a) direto em stockService.registrarMovimentacao da o mesmo resultado (a rota nao filtra nada).
 *
 * Plano: docs/superpowers/plans/2026-11-05-almoxarifado-etapa202-rota-antiga-respeita-o-lote.md
 * Executar: cd server && node tests/api/movimentacaoV1LoteIntegracao.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet } = require('../../services/almoxarifado/db');
const stockService = require('../../services/almoxarifado/stockService');
const lotService = require('../../services/almoxarifado/lotService');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${String(e.message).replace(/\s*\n\s*/g, ' ')}`); });
}
let terminou = false;
process.on('exit', (code) => {
  if (!terminou && code === 0) { console.error('  ✗ o arquivo SAIU NO MEIO (event loop vazio)'); process.exitCode = 1; }
});

const ADMIN = { id: 1, nome: 'Adm 202i', role: 'admin', is_superadmin: 1, email: 'a202i@t.com' };
const API = '/api/almoxarifado';
const PASSADO = '2020-01-01';
const FUTURO = '2099-12-31';
const MSG_VENCIDO = (c, d) => `Lote ${c} vencido em ${d} nao pode sair para consumo. Libere o vencimento do lote (PUT `
  + '/api/almoxarifado/lotes/:id/liberar-vencimento) com justificativa, ou baixe por SUCATA/PERDA ou corrija por AJUSTE.';

(async () => {
  console.log('\n=== Etapa 202 (T2): integracao da v1 com lote ===\n');
  const { app, db } = await createTestApp({ user: { ...ADMIN } });
  const post = (u, b) => request(app).post(u).send(b);

  let seq = 0;
  const material = async () => {
    const c = `V1LI-${++seq}`;
    const id = (await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, ativo, controle_lote)
      VALUES (?, ?, 'UN', 0, 1, 0)`, [c, c])).lastID;
    return { id, codigo: c };
  };
  const loteDe = async (m, codigo) => dbGet(db, 'SELECT * FROM lotes_almoxarifado WHERE material_id = ? AND codigo = ?', [m, codigo]);
  const linhaLote = async (m, loteId) => Number((await dbGet(db,
    'SELECT COALESCE(SUM(quantidade),0) q FROM estoque_saldo_almoxarifado WHERE material_id = ? AND lote_id = ?', [m, loteId])).q);
  const linhaSemLote = async (m) => Number((await dbGet(db,
    'SELECT COALESCE(SUM(quantidade),0) q FROM estoque_saldo_almoxarifado WHERE material_id = ? AND lote_id IS NULL', [m])).q);
  const fisico = async (m) => Number((await dbGet(db, 'SELECT quantidade_atual q FROM materiais_almoxarifado WHERE id = ?', [m])).q);
  const nLivro = async (m) => (await dbGet(db, 'SELECT COUNT(*) n FROM movimentacoes_almoxarifado WHERE material_id = ?', [m])).n;
  const mov = async (id) => dbGet(db, 'SELECT * FROM movimentacoes_almoxarifado WHERE id = ?', [id]);

  // ── (a) do comeco ao fim pela v1 ─────────────────────────────────────────────────────────────────────────────────────────
  await test('[a] v1: entrada LV vencido -> saida recusada -> liberar vencimento -> saida do LV -> relatorio -> estorno volta ao LV',
    async () => {
      const { id: m, codigo } = await material();
      const e = await post(`${API}/movimentacoes`, { material_id: m, tipo: 'ENTRADA', quantidade: 5, lote: 'LV', data_validade: PASSADO });
      assert.strictEqual(e.status, 201, JSON.stringify(e.body));
      assert.strictEqual(e.body.aviso_validade, lotService.MSG_VALIDADE.AVISO_VENCIDO('LV', PASSADO));
      const LV = await loteDe(m, 'LV');
      assert.ok(LV, 'a entrada v1 nao criou o lote');
      assert.strictEqual(LV.data_validade, PASSADO);
      assert.strictEqual(await linhaLote(m, LV.id), 5);

      const corpoSaida = { material_id: m, tipo: 'SAIDA', quantidade: 1, motivo: 'consumo', lote: 'LV' };
      const s1 = await post(`${API}/movimentacoes`, corpoSaida);
      assert.strictEqual(s1.status, 400, JSON.stringify(s1.body));
      assert.strictEqual(s1.body.error, MSG_VENCIDO('LV', PASSADO));
      assert.strictEqual(await nLivro(m), 1, 'a saida recusada gravou no livro');

      const lib = await request(app).put(`${API}/lotes/${LV.id}/liberar-vencimento`).send({ justificativa: 'laudo 202' });
      assert.strictEqual(lib.status, 200, JSON.stringify(lib.body));

      const s2 = await post(`${API}/movimentacoes`, corpoSaida);
      assert.strictEqual(s2.status, 201, JSON.stringify(s2.body));
      const saida = await mov(s2.body.id);
      assert.strictEqual(saida.lote_id, LV.id);
      assert.strictEqual(saida.lote, 'LV');
      assert.strictEqual(await linhaLote(m, LV.id), 4);
      assert.strictEqual(await linhaSemLote(m), 0);

      const rel = await request(app).get(`${API}/relatorios/saldo-por-lote`);
      assert.strictEqual(rel.status, 200, JSON.stringify(rel.body));
      const minhas = rel.body.filter((l) => l.material_codigo === codigo);
      assert.deepStrictEqual(minhas.map((l) => [l.lote, Number(l.quantidade)]), [['LV', 4]],
        `relatorio: ${JSON.stringify(minhas)}`);

      const est = await post(`${API}/movimentacoes/${saida.id}/cancelar`, { motivo: 'lancado errado' });
      assert.strictEqual(est.status, 200, JSON.stringify(est.body));
      assert.strictEqual(await linhaLote(m, LV.id), 5, 'o estorno nao voltou ao LV');
      assert.strictEqual(await linhaSemLote(m), 0);
      assert.strictEqual(await fisico(m), 5);
    });

  // ── (b) paridade v1 x v2 ─────────────────────────────────────────────────────────────────────────────────────────────────
  const cenario = async () => {
    const { id: m } = await material();
    await stockService.registrarMovimentacao(db, ADMIN, { material_id: m, tipo: 'ENTRADA', quantidade: 5, lote: 'LV', data_validade: PASSADO });
    await stockService.registrarMovimentacao(db, ADMIN, { material_id: m, tipo: 'ENTRADA', quantidade: 5, lote: 'LB', data_validade: FUTURO });
    await stockService.registrarMovimentacao(db, ADMIN, { material_id: m, tipo: 'ENTRADA', quantidade: 3 });
    return { m, LV: await loteDe(m, 'LV'), LB: await loteDe(m, 'LB') };
  };
  const recusas = [
    ['lote_id vencido', (c) => ({ tipo: 'SAIDA', lote_id: c.LV.id })],
    ['lote vencido', () => ({ tipo: 'SAIDA', lote: 'LV' })],
    ['lote inexistente', () => ({ tipo: 'SAIDA', lote: 'NAOEXISTE' })],
    ['lote_id inexistente', () => ({ tipo: 'SAIDA', lote_id: 99999999 })],
    ['lote_id de outro material', (c, outro) => ({ tipo: 'SAIDA', lote_id: outro.LB.id })],
    ['lote bloqueado', (c) => ({ tipo: 'SAIDA', lote_id: c.LBQ.id })],
    ['saldo insuficiente no lote', () => ({ tipo: 'SAIDA', lote: 'LB', quantidade: 6 })],
    ['validade em formato errado', () => ({ tipo: 'ENTRADA', lote: 'LF', data_validade: '31/03/2027' })],
    ['validade numa saida', () => ({ tipo: 'SAIDA', lote: 'LB', data_validade: FUTURO })],
    ['validade sem lote', () => ({ tipo: 'ENTRADA', data_validade: FUTURO })],
    ['validade em conflito', () => ({ tipo: 'ENTRADA', lote: 'LB', data_validade: '2098-01-01' })],
  ];
  const c = await cenario();
  const outro = await cenario();
  await stockService.registrarMovimentacao(db, ADMIN, { material_id: c.m, tipo: 'ENTRADA', quantidade: 2, lote: 'LBQ' });
  c.LBQ = await loteDe(c.m, 'LBQ');
  await dbRun(db, "UPDATE lotes_almoxarifado SET status = 'BLOQUEADO' WHERE id = ?", [c.LBQ.id]);
  for (const [nome, corpo] of recusas) {
    await test(`[b, RN-202.10] paridade v1 x v2: ${nome} -> mesmo status e mesma mensagem, nada gravado`, async () => {
      const body = { material_id: c.m, quantidade: 1, motivo: 'paridade', justificativa: 'paridade', ...corpo(c, outro) };
      const antes = [await fisico(c.m), await nLivro(c.m)];
      const r1 = await post(`${API}/movimentacoes`, body);
      const r2 = await post(`${API}/movimentacoes/v2`, body);
      assert.strictEqual(r1.status, 400, `v1: ${r1.status} ${JSON.stringify(r1.body)}`);
      assert.strictEqual(r2.status, r1.status, `v2: ${r2.status} ${JSON.stringify(r2.body)}`);
      assert.strictEqual(r1.body.error, r2.body.error);
      assert.deepStrictEqual([await fisico(c.m), await nLivro(c.m)], antes);
    });
  }
  await test('[b, RN-202.10] paridade v1 x v2: saida de lote bom -> 201 nas duas, as duas saem do lote', async () => {
    const x = await cenario();
    const body = { material_id: x.m, tipo: 'SAIDA', quantidade: 1, motivo: 'paridade', justificativa: 'paridade', lote: 'LB' };
    const r1 = await post(`${API}/movimentacoes`, body);
    const r2 = await post(`${API}/movimentacoes/v2`, body);
    assert.strictEqual(r1.status, 201, JSON.stringify(r1.body));
    assert.strictEqual(r2.status, 201, JSON.stringify(r2.body));
    assert.strictEqual((await mov(r1.body.id)).lote_id, x.LB.id);
    assert.strictEqual((await mov(r2.body.id)).lote_id, x.LB.id);
    assert.strictEqual(await linhaLote(x.m, x.LB.id), 3);
    assert.strictEqual(await linhaSemLote(x.m), 3);
  });

  // ── (c) pelo servico: o mesmo corpo da (a) ───────────────────────────────────────────────────────────────────────────────
  await test('[c] servico: o mesmo corpo da (a) direto no motor (exigeLote) -> mesma recusa, mesma saida do lote depois de liberar',
    async () => {
      const { id: m } = await material();
      const opc = { exigeLote: true, exigeSerie: true };
      await stockService.registrarMovimentacao(db, ADMIN,
        { material_id: m, tipo: 'ENTRADA', quantidade: 5, lote: 'LV', data_validade: PASSADO, justificativa: null }, opc);
      const LV = await loteDe(m, 'LV');
      const corpo = { material_id: m, tipo: 'SAIDA', quantidade: 1, motivo: 'consumo', justificativa: 'consumo', lote: 'LV' };
      await assert.rejects(stockService.registrarMovimentacao(db, ADMIN, corpo, opc),
        (e) => e.status === 400 && e.message === MSG_VENCIDO('LV', PASSADO));
      await lotService.liberarVencimento(db, ADMIN, LV.id, 'laudo 202');
      const r = await stockService.registrarMovimentacao(db, ADMIN, corpo, opc);
      assert.strictEqual((await mov(r.id)).lote_id, LV.id);
      assert.strictEqual(await linhaLote(m, LV.id), 4);
      assert.strictEqual(await linhaSemLote(m), 0);
    });

  terminou = true;
  console.log(`\n${passed} passaram, ${failed} falharam\n`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
