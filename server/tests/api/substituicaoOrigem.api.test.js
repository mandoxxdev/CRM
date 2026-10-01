/**
 * Etapa 63 — a substituição da origem separada fica registrada na entrega, e a planejada vale para o
 * separado pendente mesmo quando a entrega passa dele (a baixa se divide).
 *
 * Plano: docs/superpowers/plans/2026-10-01-almoxarifado-etapa63-substituicao-na-entrega.md
 *
 * Executar: cd server && node tests/api/substituicaoOrigem.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const requisitionService = require('../../services/almoxarifado/requisitionService');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

const ADMIN = { id: 1, nome: 'Admin', role: 'admin', is_superadmin: 1, email: 'admin@test.com' };
let seq = 0;

(async () => {
  console.log('\n=== Etapa 63: substituicao da origem separada ===\n');
  const { app, db, close, setUser } = await createTestApp({ user: ADMIN });
  setUser(ADMIN);
  const loc = async (nome) => {
    const c = `E63-${nome}-${++seq}`;
    return { id: (await dbRun(db, 'INSERT INTO localizacoes_almoxarifado (codigo, descricao, ativo) VALUES (?,?,1)', [c, nome])).lastID, codigo: c };
  };
  const material = async (padrao = null) => {
    const c = `E63-M${++seq}`;
    return { id: (await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, ativo, localizacao_padrao_id)
      VALUES (?, ?, 'UN', 0, 1, ?)`, [c, `Mat ${c}`, padrao])).lastID, codigo: c };
  };
  const entrar = async (m, destino, q, lote) => {
    const r = await request(app).post('/api/almoxarifado/movimentacoes/v2').send({
      material_id: m, tipo: 'ENTRADA', quantidade: q, motivo: 'e63', localizacao_destino_id: destino, ...(lote ? { lote } : {}),
    });
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
  };
  const loteId = async (m, codigo) => (await dbGet(db, 'SELECT id FROM lotes_almoxarifado WHERE material_id = ? AND codigo = ?', [m, codigo])).id;
  const req = async (itens) => {
    const r = (await dbRun(db, `INSERT INTO requisicoes_almoxarifado (numero, solicitante_id, solicitante_nome, status)
      VALUES (?, 1, 'Sol', 'APROVADO')`, [`REQ-E63-${++seq}`])).lastID;
    const ids = [];
    for (const [m, q] of itens) {
      ids.push((await dbRun(db, `INSERT INTO itens_requisicao_almoxarifado
        (requisicao_id, material_id, quantidade_solicitada, quantidade_separada, quantidade_entregue, quantidade_atendida)
        VALUES (?,?,?,0,0,0)`, [r, m, q])).lastID);
    }
    return { id: r, ids };
  };
  const separar = (reqId, itens) => requisitionService.separarRequisicao(db, reqId, itens, ADMIN);
  const entregar = (reqId, itens) => request(app).put(`/api/almoxarifado/requisicoes/${reqId}/entregar`).send({ itens_atendidos: itens });
  const subs = async (reqId) => (await request(app).get(`/api/almoxarifado/requisicoes/${reqId}`)).body.substituicoes;
  const saldoEm = async (m, l) => Number((await dbGet(db, 'SELECT COALESCE(SUM(quantidade),0) q FROM estoque_saldo_almoxarifado WHERE material_id = ? AND localizacao_id IS ?', [m, l])).q);

  await test('RN-01 separou de A, entregou de B: substituicao registrada (com motivo), e o detalhe mostra depois da planejada limpa', async () => {
    const A = await loc('A'); const B = await loc('B'); const m = await material();
    await entrar(m.id, A.id, 10); await entrar(m.id, B.id, 10);
    const { id, ids } = await req([[m.id, 5]]);
    await separar(id, [{ item_id: ids[0], quantidade_separada: 5, localizacao_origem_id: A.id }]);
    const r = await entregar(id, [{ item_id: ids[0], quantidade_atendida: 5, localizacao_origem_id: B.id, motivo_substituicao: '  A interditada para inventario  ' }]);
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    const s = await subs(id);
    assert.strictEqual(s.length, 1, JSON.stringify(s));
    assert.strictEqual(s[0].planejada_codigo, A.codigo); assert.strictEqual(s[0].saiu_codigo, B.codigo);
    assert.strictEqual(s[0].quantidade, 5); assert.strictEqual(s[0].motivo, 'A interditada para inventario');
    assert.strictEqual(s[0].material_codigo, m.codigo);
    assert.strictEqual((await dbGet(db, 'SELECT origem_separacao_id o FROM itens_requisicao_almoxarifado WHERE id = ?', [ids[0]])).o, null);
  });

  await test('Metade positiva: sair da propria planejada (um clique) NAO gera substituicao', async () => {
    const A = await loc('PA'); const m = await material();
    await entrar(m.id, A.id, 10);
    const { id, ids } = await req([[m.id, 4]]);
    await separar(id, [{ item_id: ids[0], quantidade_separada: 4, localizacao_origem_id: A.id }]);
    assert.strictEqual((await entregar(id, [{ item_id: ids[0], quantidade_atendida: 4 }])).status, 200);
    assert.deepStrictEqual(await subs(id), []);
  });

  await test('Planejada SEM lote vale qualquer lote: (A, sem lote) -> (A, L1) nao e substituicao; (A, L1) -> (A, L2) e', async () => {
    const A = await loc('LA'); const m = await material();
    const c1 = `L1-${seq}`; const c2 = `L2-${seq}`;
    await entrar(m.id, A.id, 10, c1); await entrar(m.id, A.id, 10, c2);
    await entrar(m.id, A.id, 5); // saldo sem lote em A: separar "de A, sem lote" confere o saldo sem lote (Etapa 59)
    const l1 = await loteId(m.id, c1); const l2 = await loteId(m.id, c2);
    const r1 = await req([[m.id, 2]]);
    await separar(r1.id, [{ item_id: r1.ids[0], quantidade_separada: 2, localizacao_origem_id: A.id }]);
    assert.strictEqual((await entregar(r1.id, [{ item_id: r1.ids[0], quantidade_atendida: 2, localizacao_origem_id: A.id, lote_id: l1 }])).status, 200);
    assert.deepStrictEqual(await subs(r1.id), []);
    const r2 = await req([[m.id, 2]]);
    await separar(r2.id, [{ item_id: r2.ids[0], quantidade_separada: 2, localizacao_origem_id: A.id, lote_id: l1 }]);
    assert.strictEqual((await entregar(r2.id, [{ item_id: r2.ids[0], quantidade_atendida: 2, localizacao_origem_id: A.id, lote_id: l2 }])).status, 200);
    const s = await subs(r2.id);
    assert.strictEqual(s.length, 1); assert.strictEqual(s[0].planejada_lote, c1); assert.strictEqual(s[0].saiu_lote, c2);
  });

  await test('origem_automatica: substituicao automatica, com o lote que saiu lido do livro', async () => {
    const A = await loc('AA'); const P = await loc('AP'); const m = await material(P.id);
    const c = `LP-${seq}`;
    await entrar(m.id, A.id, 5); await entrar(m.id, P.id, 10, c);
    const { id, ids } = await req([[m.id, 3]]);
    await separar(id, [{ item_id: ids[0], quantidade_separada: 3, localizacao_origem_id: A.id }]);
    assert.strictEqual((await entregar(id, [{ item_id: ids[0], quantidade_atendida: 3, origem_automatica: true }])).status, 200);
    const s = await subs(id);
    assert.strictEqual(s.length, 1); assert.strictEqual(s[0].automatica, 1); assert.strictEqual(s[0].saiu_codigo, null);
  });

  await test('Fase 2 (critico): entrega ACIMA do pendente — o pendente sai da planejada, o excedente automatico', async () => {
    const A = await loc('XA'); const P = await loc('XP'); const m = await material(P.id);
    await entrar(m.id, A.id, 5); await entrar(m.id, P.id, 20);
    const { id, ids } = await req([[m.id, 10]]);
    await separar(id, [{ item_id: ids[0], quantidade_separada: 5, localizacao_origem_id: A.id }]);
    assert.strictEqual((await entregar(id, [{ item_id: ids[0], quantidade_atendida: 2 }])).status, 200);
    assert.strictEqual(await saldoEm(m.id, A.id), 3);
    // A entrega de 8: os 3 que estavam na caixa (separados de A) saem de A; os 5 a mais, automaticos.
    const r = await entregar(id, [{ item_id: ids[0], quantidade_atendida: 8 }]);
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.strictEqual(await saldoEm(m.id, A.id), 0, 'o separado pendente nao saiu de A');
    assert.strictEqual(await saldoEm(m.id, P.id), 15);
    const daA = await dbAll(db, "SELECT quantidade FROM movimentacoes_almoxarifado WHERE material_id = ? AND tipo = 'SAIDA' AND localizacao_origem_id = ?", [m.id, A.id]);
    assert.deepStrictEqual(daA.map((x) => x.quantidade), [2, 3]);
    assert.deepStrictEqual(await subs(id), []);
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
})();
