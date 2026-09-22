/**
 * Etapa 41, Task 2 — a cotacao ganha ITENS (`itens_cotacao`), total derivado e lixeira PROPRIA.
 * RN-F01…RN-F06.
 *
 * ⚠️ O cenario que importa e o (7): a FK `itens_cotacao.cotacao_id` NAO dispara no harness
 * (`foreign_keys = 0`, `testApp.js`), entao um `DELETE FROM cotacoes` que nao apague os filhos
 * responde 200 aqui e 500 em producao. Por isso o (7) CONTA orfaos em `itens_cotacao` em vez de
 * olhar so o status — a sabotagem 1 do plano remove o `DELETE` dos filhos e e esse `COUNT` que cai.
 *
 * Executar: cd server && node tests/api/comprasCotacaoItens.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}
const ADMIN = { id: 100, nome: 'Admin E41 T2 Itens', role: 'admin', is_superadmin: 1, email: 'admin@test.com' };

(async () => {
  const { app, db, close } = await createTestApp({ user: ADMIN });
  const forn = (await dbRun(db, "INSERT INTO fornecedores (razao_social, status) VALUES ('Forn Itens E41', 'ativo')")).lastID;
  let seq = 0; const num = () => `COT-E41-I-${String(++seq).padStart(3, '0')}`;
  async function material(codigo, nome, unidade = 'KG') {
    return (await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, ativo) VALUES (?,?,?,0,1)`, [codigo, nome, unidade])).lastID;
  }
  const mA = await material('MAT-E41-A', 'Chapa A E41');
  const mB = await material('MAT-E41-B', 'Tubo B E41', 'PC');
  const post = (c) => request(app).post('/api/compras/cotacoes').send(c);
  const put = (id, c) => request(app).put(`/api/compras/cotacoes/${id}`).send(c);
  const get = (id) => request(app).get(`/api/compras/cotacoes/${id}`);
  const del = (id) => request(app).delete(`/api/compras/cotacoes/${id}`);
  const itensNoBanco = (id) => dbAll(db, 'SELECT * FROM itens_cotacao WHERE cotacao_id = ? ORDER BY id', [id]);
  const contaCotacoes = async () => (await dbGet(db, 'SELECT COUNT(*) AS n FROM cotacoes')).n;

  await test('(1) RN-F03/F04 POST com 2 itens -> 201, valor_total = soma, itens com codigo/descricao/unidade do material, na ordem', async () => {
    const r = await post({ numero: num(), fornecedor_id: forn, itens: [{ material_id: mA, quantidade: 2, valor_unitario: 10 }, { material_id: mB, quantidade: 1, valor_unitario: 5 }] });
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    assert.strictEqual(r.body.valor_total, 25);
    assert.strictEqual(r.body.itens.length, 2);
    assert.deepStrictEqual(r.body.itens.map((i) => [i.material_id, i.codigo, i.descricao, i.unidade, i.quantidade, i.valor_unitario]),
      [[mA, 'MAT-E41-A', 'Chapa A E41', 'KG', 2, 10], [mB, 'MAT-E41-B', 'Tubo B E41', 'PC', 1, 5]]);
    assert.ok(r.body.itens[0].id < r.body.itens[1].id, 'ordem de lancamento');
    assert.strictEqual(r.body.pedido_id, null);
    assert.strictEqual(r.body.pedido_numero, null);
  });
  await test('(2) RN-F03 valor_total do payload e IGNORADO quando ha itens; a soma e ARREDONDADA a 2 casas (3 x 0.1 = 0.3, nao 0.30000000000000004)', async () => {
    const r = await post({ numero: num(), fornecedor_id: forn, valor_total: 999, itens: [{ material_id: mA, quantidade: 3, valor_unitario: 1.5 }] });
    assert.strictEqual(r.status, 201);
    assert.strictEqual(r.body.valor_total, 4.5, 'devia ignorar 999');
    // Onda de correcao da 41 (F3b = UX I2, metade servidor): sem `Math.round(s * 100) / 100` o double
    // cru ia para o banco e para a tela (`cotacao-valor` mostrava 0.30000000000000004).
    const f = await post({ numero: num(), fornecedor_id: forn, itens: [{ material_id: mA, quantidade: 3, valor_unitario: 0.1 }] });
    assert.strictEqual(f.status, 201);
    assert.strictEqual(f.body.valor_total, 0.3, `ponto flutuante cru: ${f.body.valor_total}`);
    const u = await put(f.body.id, { numero: f.body.numero, fornecedor_id: forn, itens: [{ material_id: mA, quantidade: 3, valor_unitario: 0.2 }] });
    assert.strictEqual(u.status, 200, JSON.stringify(u.body));
    assert.strictEqual(u.body.valor_total, 0.6, `ponto flutuante cru no PUT: ${u.body.valor_total}`);
  });
  await test('(3) RN-F02 sem itens (ausente e []) -> valor_total do payload; itens = []', async () => {
    const a = await post({ numero: num(), fornecedor_id: forn, valor_total: 77 });
    assert.strictEqual(a.body.valor_total, 77); assert.deepStrictEqual(a.body.itens, []);
    const b = await post({ numero: num(), fornecedor_id: forn, valor_total: 12, itens: [] });
    assert.strictEqual(b.body.valor_total, 12); assert.deepStrictEqual(b.body.itens, []);
  });
  await test('(4) RN-F01 material inexistente -> 400 "Material não encontrado" e NADA gravado (cabecalho inclusive)', async () => {
    const antes = await contaCotacoes();
    const r = await post({ numero: num(), fornecedor_id: forn, itens: [{ material_id: mA, quantidade: 1 }, { material_id: 999999, quantidade: 1 }] });
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.deepStrictEqual(r.body, { error: 'Material não encontrado' });
    assert.strictEqual(await contaCotacoes(), antes, 'o cabecalho nao pode ter sido gravado (resolverItens antes do INSERT)');
  });
  await test('(5) RN-F05 PUT substitui as linhas (ids novos); PUT sem itens APAGA e volta o total ao do payload', async () => {
    const a = await post({ numero: num(), fornecedor_id: forn, itens: [{ material_id: mA, quantidade: 2, valor_unitario: 10 }, { material_id: mB, quantidade: 1, valor_unitario: 5 }] });
    const idsAntes = a.body.itens.map((i) => i.id);
    const r = await put(a.body.id, { numero: a.body.numero, fornecedor_id: forn, itens: [{ material_id: mB, quantidade: 4, valor_unitario: 2 }] });
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.strictEqual(r.body.itens.length, 1); assert.strictEqual(r.body.valor_total, 8);
    assert.ok(!idsAntes.includes(r.body.itens[0].id), 'DELETE+INSERT: id novo');
    assert.strictEqual((await itensNoBanco(a.body.id)).length, 1);
    const r2 = await put(a.body.id, { numero: a.body.numero, fornecedor_id: forn, valor_total: 50 });
    assert.strictEqual(r2.status, 200);
    assert.deepStrictEqual(r2.body.itens, []); assert.strictEqual(r2.body.valor_total, 50);
    assert.strictEqual((await itensNoBanco(a.body.id)).length, 0);
  });
  await test('(6) RN-F04 GET /:id devolve itens; a LISTA nao devolve itens mas devolve pedido_id/pedido_numero', async () => {
    const a = await post({ numero: num(), fornecedor_id: forn, itens: [{ material_id: mA, quantidade: 1 }] });
    const g = await get(a.body.id);
    assert.strictEqual(g.body.itens.length, 1);
    const lista = await request(app).get('/api/compras/cotacoes');
    const l = lista.body.find((c) => c.id === a.body.id);
    assert.ok(l, 'na lista');
    assert.ok(!('itens' in l), 'a lista nao carrega itens');
    assert.ok('pedido_id' in l && 'pedido_numero' in l, `pedido_id/pedido_numero tem de vir na lista: ${Object.keys(l)}`);
  });
  await test('(7) RN-F06 DELETE leva os itens junto (orfaos = 0) e responde a literal', async () => {
    const a = await post({ numero: num(), fornecedor_id: forn, itens: [{ material_id: mA, quantidade: 1 }, { material_id: mB, quantidade: 1 }] });
    const r = await del(a.body.id);
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.deepStrictEqual(r.body, { message: 'Cotação excluída com sucesso' });
    assert.strictEqual((await get(a.body.id)).status, 404);
    // ⚠️ A ASSERCAO QUE IMPORTA: a FK nao dispara no harness (foreign_keys = 0). Sem o DELETE dos
    // filhos o status seria 200 do mesmo jeito — e producao daria 500. Contar orfaos e a regua.
    assert.strictEqual((await itensNoBanco(a.body.id)).length, 0, 'itens_cotacao orfaos — o DELETE dos filhos nao rodou');
  });
  await test('(8) DELETE de id inexistente -> 404 com a literal da cotacao (nao "Item não encontrado" do generico)', async () => {
    const r = await del(999999);
    assert.strictEqual(r.status, 404);
    assert.deepStrictEqual(r.body, { error: 'Cotação não encontrada' });
  });
  await test('(9) o (8) da Etapa 40 continua: DELETE de cotacao SEM pedido -> 200 e a linha some', async () => {
    const a = await post({ numero: num(), fornecedor_id: forn });
    assert.strictEqual((await del(a.body.id)).status, 200);
    assert.strictEqual((await get(a.body.id)).status, 404);
  });
  await test('(10) RN-F06 cotacao com pedido_id -> DELETE 409 com numero e PC (e o generico NAO responde mais por cotacoes)', async () => {
    const ped = await request(app).post('/api/compras/pedidos').send({ fornecedor_id: forn, itens: [{ material_id: mA, quantidade: 1 }] });
    assert.strictEqual(ped.status, 201, 'fixture pedido');
    const a = await post({ numero: num(), fornecedor_id: forn });
    await dbRun(db, 'UPDATE cotacoes SET pedido_id = ? WHERE id = ?', [ped.body.id, a.body.id]);
    const r = await del(a.body.id);
    assert.strictEqual(r.status, 409, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, `Cotação ${a.body.numero} já gerou o pedido ${ped.body.numero} — não pode ser excluída`);
    assert.strictEqual((await get(a.body.id)).status, 200, 'continua la');
  });
  await close(); console.log(`\n${passed} passou, ${failed} falhou`); process.exit(failed ? 1 : 0);
})();
