/**
 * Etapa 196 — separar em duas vezes: a parte separada primeiro continua saindo de onde foi separada. O item guarda, alem do par
 * (endereco, lote) da separacao, QUANTO da caixa saiu dele (`quantidade_origem_separacao`); a rodada de outro par nao apaga a origem
 * nem grava troca; a entrega consome a parte; a fila e a sugestao contam a parte, nao a caixa.
 *
 * Plano: docs/superpowers/plans/2026-11-05-almoxarifado-etapa196-origem-da-separacao-em-duas-vezes.md (o bloco "Fase 2" manda).
 *
 * Executar: cd server && node tests/api/origemSeparacaoEmDuasVezes.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const { initSchema } = require('../../services/almoxarifado/schema');
const requisitionService = require('../../services/almoxarifado/requisitionService');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${String(e.message).replace(/\s*\n\s*/g, ' ')}`); });
}

const ADMIN = { id: 1, nome: 'Admin', role: 'admin', is_superadmin: 1, email: 'admin@test.com' };
let seq = 0;
let terminou = false;
process.on('exit', (code) => {
  if (!terminou && code === 0) { console.error('  ✗ o arquivo SAIU NO MEIO (event loop vazio)'); process.exitCode = 1; }
});

(async () => {
  console.log('\n=== Etapa 196: origem da separacao em duas vezes ===\n');
  const { app, db, close, setUser } = await createTestApp({ user: ADMIN });
  setUser(ADMIN);
  const loc = async (nome) => {
    const c = `E196-${nome}-${++seq}`;
    return { id: (await dbRun(db, 'INSERT INTO localizacoes_almoxarifado (codigo, descricao, ativo) VALUES (?,?,1)', [c, nome])).lastID, codigo: c };
  };
  const material = async ({ serie = false } = {}) => {
    const c = `E196-M${++seq}`;
    return { id: (await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, ativo, controle_serie)
      VALUES (?, ?, 'UN', 0, 1, ?)`, [c, `Mat ${c}`, serie ? 1 : 0])).lastID, codigo: c };
  };
  const entrar = async (m, destino, q, lote, series) => {
    const r = await request(app).post('/api/almoxarifado/movimentacoes/v2').send({
      material_id: m, tipo: 'ENTRADA', quantidade: q, motivo: 'e196', localizacao_destino_id: destino,
      ...(lote ? { lote } : {}), ...(series ? { series } : {}),
    });
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
  };
  const loteId = async (m, codigo) => (await dbGet(db, 'SELECT id FROM lotes_almoxarifado WHERE material_id = ? AND codigo = ?', [m, codigo])).id;
  const req = async (itens) => {
    const r = (await dbRun(db, `INSERT INTO requisicoes_almoxarifado (numero, solicitante_id, solicitante_nome, status)
      VALUES (?, 1, 'Sol', 'APROVADO')`, [`REQ-E196-${++seq}`])).lastID;
    const ids = [];
    for (const [m, q] of itens) {
      ids.push((await dbRun(db, `INSERT INTO itens_requisicao_almoxarifado
        (requisicao_id, material_id, quantidade_solicitada, quantidade_separada, quantidade_entregue, quantidade_atendida)
        VALUES (?,?,?,0,0,0)`, [r, m, q])).lastID);
    }
    return { id: r, ids };
  };
  const separar = (reqId, itens) => request(app).put(`/api/almoxarifado/requisicoes/${reqId}/separacao`).send({ itens_separados: itens });
  const entregar = (reqId, itens) => request(app).put(`/api/almoxarifado/requisicoes/${reqId}/entregar`).send({ itens_atendidos: itens });
  const devolver = (reqId, itens) => request(app).put(`/api/almoxarifado/requisicoes/${reqId}/devolver-separado`)
    .send({ motivo: 'e196', itens });
  const subs = async (reqId) => dbAll(db, 'SELECT * FROM substituicoes_origem_requisicao WHERE requisicao_id = ? ORDER BY id', [reqId]);
  const origem = async (itemId) => dbGet(db, `SELECT origem_separacao_id o, lote_separacao_id l, quantidade_origem_separacao q,
      quantidade_separada - COALESCE(quantidade_entregue, 0) caixa FROM itens_requisicao_almoxarifado WHERE id = ?`, [itemId]);
  const ok = async (p) => { const r = await p; assert.strictEqual(r.status, 200, JSON.stringify(r.body)); return r; };
  const saldo = async (m, l, lote = null) => Number((await dbGet(db, `SELECT COALESCE(SUM(quantidade), 0) q FROM estoque_saldo_almoxarifado
    WHERE material_id = ? AND localizacao_id = ? AND lote_id IS ?`, [m, l, lote])).q);

  // ── T0 — a coluna ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  await test('[T0] banco novo: itens_requisicao_almoxarifado tem quantidade_origem_separacao (REAL), e o initSchema de novo nao quebra', async () => {
    const cols = await dbAll(db, 'PRAGMA table_info(itens_requisicao_almoxarifado)');
    const c = cols.find((x) => x.name === 'quantidade_origem_separacao');
    assert.ok(c, `coluna ausente: ${cols.map((x) => x.name).join(',')}`);
    assert.strictEqual(c.type, 'REAL');
    await initSchema(db);
    const cols2 = await dbAll(db, 'PRAGMA table_info(itens_requisicao_almoxarifado)');
    assert.strictEqual(cols2.filter((x) => x.name === 'quantidade_origem_separacao').length, 1);
  });

  await test('[T0] parteDaOrigem: sem origem 0; origem com quantidade = a quantidade (limitada a caixa); origem antiga NULL = a caixa', async () => {
    const { parteDaOrigem } = requisitionService;
    assert.strictEqual(parteDaOrigem({ origem_separacao_id: null, quantidade_separada: 5, quantidade_entregue: 0 }), 0);
    assert.strictEqual(parteDaOrigem({ origem_separacao_id: 7, quantidade_origem_separacao: 3, quantidade_separada: 6, quantidade_entregue: 0 }), 3);
    assert.strictEqual(parteDaOrigem({ origem_separacao_id: 7, quantidade_origem_separacao: 5, quantidade_separada: 6, quantidade_entregue: 4 }), 2);
    assert.strictEqual(parteDaOrigem({ origem_separacao_id: 7, quantidade_origem_separacao: null, quantidade_separada: 6, quantidade_entregue: 2 }), 4);
    const r = await dbGet(db, `SELECT ${requisitionService.parteOrigemSql('x')} AS p FROM (SELECT 7 AS origem_separacao_id, NULL AS quantidade_origem_separacao,
      6 AS quantidade_separada, 2 AS quantidade_entregue, NULL AS quantidade_atendida) x`);
    assert.strictEqual(Number(r.p), 4);
    const r2 = await dbGet(db, `SELECT ${requisitionService.parteOrigemSql('x')} AS p FROM (SELECT 7 AS origem_separacao_id, 9 AS quantidade_origem_separacao,
      6 AS quantidade_separada, 2 AS quantidade_entregue, NULL AS quantidade_atendida) x`);
    assert.strictEqual(Number(r2.p), 4);
    const r3 = await dbGet(db, `SELECT ${requisitionService.parteOrigemSql('x')} AS p FROM (SELECT NULL AS origem_separacao_id, 9 AS quantidade_origem_separacao,
      6 AS quantidade_separada, 2 AS quantidade_entregue, NULL AS quantidade_atendida) x`);
    assert.strictEqual(Number(r3.p), 0);
  });

  //@@T1@@

  await close();
  terminou = true;
  console.log(`\n${passed} passaram, ${failed} falharam\n`);
  process.exit(failed ? 1 : 0);
})();
