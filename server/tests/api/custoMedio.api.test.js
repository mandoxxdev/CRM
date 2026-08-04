const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

async function criarMaterial(db, codigo, qtd = 0) {
  const r = await dbRun(db,
    `INSERT INTO materiais_almoxarifado (codigo, nome, quantidade_atual, ativo) VALUES (?,?,?,1)`,
    [codigo, `Material ${codigo}`, qtd]);
  return r.lastID;
}

(async () => {
  const { app, db, close } = await createTestApp();

  await test('primeira entrada com custo define o custo medio', async () => {
    const mat = await criarMaterial(db, 'CM-001', 0);
    await request(app).post('/api/almoxarifado/movimentacoes/v2')
      .send({ material_id: mat, tipo: 'ENTRADA', quantidade: 10, custo_unitario: 20 });
    const m = await dbGet(db, 'SELECT custo_medio, custo_unitario FROM materiais_almoxarifado WHERE id = ?', [mat]);
    assert.strictEqual(m.custo_medio, 20);
    assert.strictEqual(m.custo_unitario, 20);
  });

  await test('segunda entrada pondera: (10*20 + 10*40) / 20 = 30', async () => {
    const mat = await criarMaterial(db, 'CM-002', 0);
    await request(app).post('/api/almoxarifado/movimentacoes/v2')
      .send({ material_id: mat, tipo: 'ENTRADA', quantidade: 10, custo_unitario: 20 });
    await request(app).post('/api/almoxarifado/movimentacoes/v2')
      .send({ material_id: mat, tipo: 'ENTRADA', quantidade: 10, custo_unitario: 40 });
    const m = await dbGet(db, 'SELECT custo_medio, custo_unitario FROM materiais_almoxarifado WHERE id = ?', [mat]);
    assert.strictEqual(m.custo_medio, 30);
    assert.strictEqual(m.custo_unitario, 40); // último custo
  });

  await test('entrada sem custo nao altera custo medio', async () => {
    const mat = await criarMaterial(db, 'CM-003', 0);
    await request(app).post('/api/almoxarifado/movimentacoes/v2')
      .send({ material_id: mat, tipo: 'ENTRADA', quantidade: 10, custo_unitario: 20 });
    await request(app).post('/api/almoxarifado/movimentacoes/v2')
      .send({ material_id: mat, tipo: 'ENTRADA', quantidade: 10 });
    const m = await dbGet(db, 'SELECT custo_medio FROM materiais_almoxarifado WHERE id = ?', [mat]);
    assert.strictEqual(m.custo_medio, 20);
  });

  await test('saida nao altera custo medio', async () => {
    const mat = await criarMaterial(db, 'CM-004', 0);
    await request(app).post('/api/almoxarifado/movimentacoes/v2')
      .send({ material_id: mat, tipo: 'ENTRADA', quantidade: 10, custo_unitario: 20 });
    await request(app).post('/api/almoxarifado/movimentacoes/v2')
      .send({ material_id: mat, tipo: 'SAIDA', quantidade: 5, justificativa: 'x' });
    const m = await dbGet(db, 'SELECT custo_medio FROM materiais_almoxarifado WHERE id = ?', [mat]);
    assert.strictEqual(m.custo_medio, 20);
  });

  await test('entrada com saldo anterior negativo/zero usa o custo informado', async () => {
    const mat = await criarMaterial(db, 'CM-005', 0);
    await dbRun(db, 'UPDATE materiais_almoxarifado SET custo_medio = 99 WHERE id = ?', [mat]); // custo antigo com saldo zero
    await request(app).post('/api/almoxarifado/movimentacoes/v2')
      .send({ material_id: mat, tipo: 'ENTRADA', quantidade: 10, custo_unitario: 15 });
    const m = await dbGet(db, 'SELECT custo_medio FROM materiais_almoxarifado WHERE id = ?', [mat]);
    assert.strictEqual(m.custo_medio, 15);
  });

  await test('entradas concorrentes com custos diferentes ponderam corretamente (ordem-independente)', async () => {
    const mat = await criarMaterial(db, 'CM-006', 0);
    const [a, b] = await Promise.all([
      request(app).post('/api/almoxarifado/movimentacoes/v2')
        .send({ material_id: mat, tipo: 'ENTRADA', quantidade: 10, custo_unitario: 20 }),
      request(app).post('/api/almoxarifado/movimentacoes/v2')
        .send({ material_id: mat, tipo: 'ENTRADA', quantidade: 10, custo_unitario: 40 }),
    ]);
    assert.strictEqual(a.status, 201); assert.strictEqual(b.status, 201);
    const m = await dbGet(db, 'SELECT quantidade_atual, custo_medio FROM materiais_almoxarifado WHERE id = ?', [mat]);
    assert.strictEqual(m.quantidade_atual, 20);
    assert.strictEqual(m.custo_medio, 30); // ((0)+(10*20))/10=20, depois ((10*20)+(10*40))/20=30 — qualquer ordem
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
