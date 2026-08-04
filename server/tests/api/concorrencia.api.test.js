const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet } = require('../../services/almoxarifado/db');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

async function criarMaterial(db, codigo, qtd = 100) {
  const r = await dbRun(db,
    `INSERT INTO materiais_almoxarifado (codigo, nome, quantidade_atual, ativo) VALUES (?,?,?,1)`,
    [codigo, `Material ${codigo}`, qtd]);
  return r.lastID;
}

(async () => {
  const { app, db, close } = await createTestApp();

  await test('duas saidas concorrentes de 60 com saldo 100: exatamente uma falha', async () => {
    const mat = await criarMaterial(db, 'CONC-001', 100);
    const payload = { material_id: mat, tipo: 'SAIDA', quantidade: 60, justificativa: 'corrida' };
    const [a, b] = await Promise.all([
      request(app).post('/api/almoxarifado/movimentacoes/v2').send(payload),
      request(app).post('/api/almoxarifado/movimentacoes/v2').send(payload),
    ]);
    const sucessos = [a, b].filter((r) => r.status === 201).length;
    assert.strictEqual(sucessos, 1, `esperado 1 sucesso, houve ${sucessos} (${a.status}/${b.status})`);
    const m = await dbGet(db, 'SELECT quantidade_atual FROM materiais_almoxarifado WHERE id = ?', [mat]);
    assert.strictEqual(m.quantidade_atual, 40);
  });

  await test('10 saidas concorrentes de 10 com saldo 50: 5 sucessos e saldo final 0', async () => {
    const mat = await criarMaterial(db, 'CONC-002', 50);
    const reqs = Array.from({ length: 10 }, () =>
      request(app).post('/api/almoxarifado/movimentacoes/v2')
        .send({ material_id: mat, tipo: 'SAIDA', quantidade: 10, justificativa: 'corrida' }));
    const results = await Promise.all(reqs);
    const sucessos = results.filter((r) => r.status === 201).length;
    assert.strictEqual(sucessos, 5, `esperado 5 sucessos, houve ${sucessos}`);
    const m = await dbGet(db, 'SELECT quantidade_atual FROM materiais_almoxarifado WHERE id = ?', [mat]);
    assert.strictEqual(m.quantidade_atual, 0);
  });

  await test('entradas concorrentes somam corretamente', async () => {
    const mat = await criarMaterial(db, 'CONC-003', 0);
    const reqs = Array.from({ length: 8 }, () =>
      request(app).post('/api/almoxarifado/movimentacoes/v2')
        .send({ material_id: mat, tipo: 'ENTRADA', quantidade: 5 }));
    const results = await Promise.all(reqs);
    assert.ok(results.every((r) => r.status === 201));
    const m = await dbGet(db, 'SELECT quantidade_atual FROM materiais_almoxarifado WHERE id = ?', [mat]);
    assert.strictEqual(m.quantidade_atual, 40);
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
