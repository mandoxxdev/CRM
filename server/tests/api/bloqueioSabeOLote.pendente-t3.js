/**
 * Etapa 209 — PENDENTES da T5 (e da RN-209.07 pela rota, T7): a rota GET /materiais/:id/bloqueado-por-lote ainda NAO existe.
 * Os 9 testes da T3/T4 (RN-209.04 a-d, .05, .06 a/c, .10, .07 servico) ja estao em `bloqueioSabeOLote.api.test.js` (movidos na T3 e
 * na T4); ficaram aqui so os dois que chamam o GET.
 *
 * POR QUE ESTE ARQUIVO NAO SE CHAMA *.api.test.js: o runner (`tests/api/run-all.js`) so descobre `*.api.test.js`, e estes dois ficam
 * VERMELHOS ate a T5 (404 do GET). Quem fizer a T5: rodar `node tests/api/bloqueioSabeOLote.pendente-t3.js` (vermelho real: 404),
 * criar a rota, e MOVER os dois para `bloqueioSabeOLote.api.test.js` (helpers `quarentena`/`desbloquear` ja existem la) e apagar
 * este arquivo — nao deixar teste fora do runner.
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

(async () => {
  console.log('\n=== Etapa 209 (pendentes da T5): a rota GET bloqueado-por-lote ===\n');
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

  await close();
  console.log(`\n${passed} passaram, ${failed} falharam\n`);
  terminou = true;
  process.exit(failed > 0 ? 1 : 0);
})();
