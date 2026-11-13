/**
 * Etapa 214 (Compras) — RN-214.01/02: o historico de precos cotados e comprados do material, por fornecedor.
 * Cenarios pela rota, com a porta do cadastro do Compras real (`portaCompras.leitura`).
 *
 * Executar: cd server && node tests/api/historicoDePrecos.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun } = require('../../services/almoxarifado/db');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

const SUPER = { id: 1, nome: 'Super', role: 'usuario', is_superadmin: 1, email: 'super@test.com' };
const ADMIN_COMPRAS = { id: 3, nome: 'Chefe de Compras', role: 'usuario', admin_modulos: ['compras'], email: 'chefe@test.com' };
const ALMOXARIFE = { id: 4, nome: 'Almoxarife', role: 'usuario', perfil_almoxarifado: 'ALMOXARIFE', email: 'almox@test.com' };

(async () => {
  const { app, db, setUser, close } = await createTestApp({ user: SUPER });
  const fornecedor = async (razao, fantasia = null) => (await dbRun(db,
    "INSERT INTO fornecedores (razao_social, nome_fantasia, status) VALUES (?, ?, 'ativo')", [razao, fantasia])).lastID;
  const material = async (codigo) => (await dbRun(db,
    "INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, ativo) VALUES (?, 'Chapa E214', 'KG', 0, 1)", [codigo])).lastID;
  const url = (m) => `/api/compras/materiais/cadastro/${m}/historico-precos`;
  let seq = 0;
  const cotar = async (f, m, preco, extra = {}) => {
    const r = await request(app).post('/api/compras/cotacoes').send({ numero: `COT-E214-${++seq}`, fornecedor_id: f, itens: [{ material_id: m, quantidade: 2, valor_unitario: preco }], ...extra });
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    return r.body;
  };
  const pedir = async (f, m, preco, extra = {}) => {
    const r = await request(app).post('/api/compras/pedidos').send({ fornecedor_id: f, itens: [{ material_id: m, quantidade: 3, valor_unitario: preco }], ...extra });
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    return r.body;
  };

  const FA = await fornecedor('Aços Alfa Ltda', 'Alfa');
  const FB = await fornecedor('Beta Metais SA');

  await test('[RN-214.01 integracao] cotar -> gerar pedido: o historico tem o preco cotado e o comprado, mais recente primeiro', async () => {
    const M = await material('GMP-214-1');
    const c = await cotar(FA, M, 45.9, { data_cotacao: '2026-11-01' });
    const g = await request(app).post(`/api/compras/cotacoes/${c.id}/gerar-pedido`).send();
    assert.strictEqual(g.status, 201, JSON.stringify(g.body));
    await cotar(FB, M, 50, { data_cotacao: '2026-10-20' });
    const r = await request(app).get(url(M));
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.deepStrictEqual(r.body.map((l) => [l.origem, l.fornecedor_nome, l.valor_unitario]),
      [['pedido', 'Alfa', 45.9], ['cotacao', 'Alfa', 45.9], ['cotacao', 'Beta Metais SA', 50]]);
    const p = r.body[0];
    assert.deepStrictEqual([p.documento_id, p.numero, p.quantidade, p.unidade, p.fornecedor_id], [g.body.id, g.body.numero, 2, 'KG', FA]);
    assert.strictEqual(r.body[2].data, '2026-10-20');
  });

  await test('[RN-214.02] fora: cotacao cancelada, pedido cancelado e rejeitado; dentro: cotacao rejeitada (com o status)', async () => {
    const M = await material('GMP-214-2');
    const cc = await cotar(FA, M, 10);
    await dbRun(db, "UPDATE cotacoes SET status = 'cancelado' WHERE id = ?", [cc.id]);
    await cotar(FB, M, 11, { status: 'rejeitado' });
    const p1 = await pedir(FA, M, 12);
    const p2 = await pedir(FA, M, 13);
    const p3 = await pedir(FB, M, 14);
    await dbRun(db, "UPDATE pedidos_compra SET status = 'cancelado' WHERE id = ?", [p1.id]);
    await dbRun(db, "UPDATE pedidos_compra SET status = 'rejeitado' WHERE id = ?", [p2.id]);
    const r = await request(app).get(url(M));
    assert.strictEqual(r.status, 200);
    const vistos = r.body.map((l) => [l.origem, l.valor_unitario, l.status]).sort((a, b) => a[1] - b[1]);
    assert.deepStrictEqual(vistos, [['cotacao', 11, 'rejeitado'], ['pedido', 14, p3.status]]);
  });

  await test('[RN-214.01] so as linhas DESTE material; material sem preco -> []; inexistente -> 404', async () => {
    const M = await material('GMP-214-3');
    const OUTRO = await material('GMP-214-4');
    await pedir(FA, OUTRO, 99);
    let r = await request(app).get(url(M));
    assert.deepStrictEqual([r.status, r.body], [200, []]);
    r = await request(app).get(url(999999));
    assert.deepStrictEqual([r.status, r.body.error], [404, 'Material não encontrado']);
  });

  await test('[RN-214.01] porta: admin do Compras le; almoxarife -> 403', async () => {
    const M = await material('GMP-214-5');
    await pedir(FA, M, 7);
    setUser(ADMIN_COMPRAS);
    let r = await request(app).get(url(M));
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.strictEqual(r.body.length, 1);
    setUser(ALMOXARIFE);
    r = await request(app).get(url(M));
    assert.strictEqual(r.status, 403, JSON.stringify(r.body));
    setUser(SUPER);
  });

  await close();
  console.log(`\n${passed} passaram, ${failed} falharam`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
