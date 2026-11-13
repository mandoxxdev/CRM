/**
 * Etapa 213 (Compras) — RN-213.01 a RN-213.03: o codigo do fornecedor na cotacao e no pedido de compra.
 *
 * O codigo vem do vinculo material x fornecedor da Etapa 212 (`itens_fornecedor.material_id`) e e FOTO da linha no salvar.
 * Cenarios pela rota (cotacao, gerar pedido, pedido, documento impresso).
 *
 * Executar: cd server && node tests/api/codigoFornecedorNoPedido.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet } = require('../../services/almoxarifado/db');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

const ADMIN = { id: 101, nome: 'Admin E213', role: 'admin', is_superadmin: 1, email: 'admin@test.com' };

(async () => {
  const { app, db, close } = await createTestApp({ user: ADMIN });
  const fornecedor = async (razao) => (await dbRun(db, "INSERT INTO fornecedores (razao_social, status) VALUES (?, 'ativo')", [razao])).lastID;
  const material = async (codigo, nome) => (await dbRun(db,
    'INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, ativo) VALUES (?, ?, \'KG\', 0, 1)', [codigo, nome])).lastID;
  const vincular = (m, f, codigo) => dbRun(db,
    'INSERT INTO itens_fornecedor (fornecedor_id, material_id, codigo, descricao, unidade, preco) VALUES (?, ?, ?, \'X\', \'KG\', 0)', [f, m, codigo]);

  const FA = await fornecedor('Alfa E213');
  const FB = await fornecedor('Beta E213');
  const M1 = await material('GMP-213-1', 'Chapa E213');
  const M2 = await material('GMP-213-2', 'Tubo E213');
  await vincular(M1, FA, '45879');
  await vincular(M1, FB, 'B-77');
  await vincular(M2, FB, '  ');   // vinculo sem codigo

  let seq = 0;
  const cotar = async (fornecedorId, itens) => {
    const r = await request(app).post('/api/compras/cotacoes').send({ numero: `COT-E213-${++seq}`, fornecedor_id: fornecedorId, itens });
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    return r.body;
  };
  const porMaterial = (itens) => Object.fromEntries(itens.map((i) => [i.material_id, i.codigo_fornecedor]));

  await test('[RN-213.01] cotacao: a linha com vinculo grava o codigo do fornecedor do cabecalho; sem vinculo, null', async () => {
    const c = await cotar(FA, [{ material_id: M1, quantidade: 1, valor_unitario: 10 }, { material_id: M2, quantidade: 1, valor_unitario: 5 }]);
    assert.deepStrictEqual(porMaterial(c.itens), { [M1]: '45879', [M2]: null });
    const lido = await request(app).get(`/api/compras/cotacoes/${c.id}`);
    assert.deepStrictEqual(porMaterial(lido.body.itens), { [M1]: '45879', [M2]: null });
  });

  await test('[RN-213.01] trocar o fornecedor e salvar refaz o codigo; vinculo sem codigo grava null', async () => {
    const c = await cotar(FA, [{ material_id: M1, quantidade: 1 }, { material_id: M2, quantidade: 1 }]);
    const r = await request(app).put(`/api/compras/cotacoes/${c.id}`).send({ numero: c.numero, fornecedor_id: FB, itens: [{ material_id: M1, quantidade: 1 }, { material_id: M2, quantidade: 1 }] });
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.deepStrictEqual(porMaterial(r.body.itens), { [M1]: 'B-77', [M2]: null });
  });

  await test('[RN-213.02/03 integracao] cotacao -> gerar pedido -> o pedido e o impresso trazem o codigo do fornecedor', async () => {
    const c = await cotar(FA, [{ material_id: M1, quantidade: 2, valor_unitario: 10 }, { material_id: M2, quantidade: 1, valor_unitario: 5 }]);
    const g = await request(app).post(`/api/compras/cotacoes/${c.id}/gerar-pedido`).send();
    assert.strictEqual(g.status, 201, JSON.stringify(g.body));
    const p = await request(app).get(`/api/compras/pedidos/${g.body.id}`);
    assert.strictEqual(p.status, 200);
    assert.deepStrictEqual(porMaterial(p.body.itens), { [M1]: '45879', [M2]: null });
    const doc = await request(app).get(`/api/compras/pedidos/${g.body.id}/documento`);
    assert.strictEqual(doc.status, 200);
    assert.ok(doc.text.includes('Cód. fornecedor: 45879'), 'o impresso mostra o codigo do fornecedor');
    assert.strictEqual((doc.text.match(/Cód\. fornecedor:/g) || []).length, 1, 'so a linha com codigo ganha o texto');
    assert.ok(doc.text.includes('GMP-213-1'), 'o codigo GMP continua na linha');
  });

  await test('[RN-213.01] pedido direto: foto no salvar — mudar o vinculo depois nao muda o pedido; salvar de novo refaz', async () => {
    const r = await request(app).post('/api/compras/pedidos').send({ fornecedor_id: FA, itens: [{ material_id: M1, quantidade: 1, valor_unitario: 1 }] });
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    const id = r.body.id;
    await dbRun(db, 'UPDATE itens_fornecedor SET codigo = ? WHERE material_id = ? AND fornecedor_id = ?', ['NOVO-1', M1, FA]);
    let p = await request(app).get(`/api/compras/pedidos/${id}`);
    assert.strictEqual(p.body.itens[0].codigo_fornecedor, '45879');
    const u = await request(app).put(`/api/compras/pedidos/${id}`).send({ fornecedor_id: FA, itens: [{ material_id: M1, quantidade: 1, valor_unitario: 1 }] });
    assert.strictEqual(u.status, 200, JSON.stringify(u.body));
    p = await request(app).get(`/api/compras/pedidos/${id}`);
    assert.strictEqual(p.body.itens[0].codigo_fornecedor, 'NOVO-1');
    assert.strictEqual((await dbGet(db, 'SELECT codigo FROM materiais_almoxarifado WHERE id = ?', [M1])).codigo, 'GMP-213-1');
  });

  await close();
  console.log(`\n${passed} passaram, ${failed} falharam`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
