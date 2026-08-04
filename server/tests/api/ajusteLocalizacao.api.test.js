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

  await test('AJUSTE com localizacao define o saldo daquela localizacao e recalcula o total', async () => {
    const locA = (await dbRun(db, `INSERT INTO localizacoes_almoxarifado (codigo, descricao) VALUES ('AJL-A','A')`)).lastID;
    const locB = (await dbRun(db, `INSERT INTO localizacoes_almoxarifado (codigo, descricao) VALUES ('AJL-B','B')`)).lastID;
    const mat = await criarMaterial(db, 'AJL-001', 0);
    await dbRun(db, `INSERT INTO estoque_saldo_almoxarifado (material_id, localizacao_id, quantidade) VALUES (?,?,30)`, [mat, locA]);
    await dbRun(db, `INSERT INTO estoque_saldo_almoxarifado (material_id, localizacao_id, quantidade) VALUES (?,?,20)`, [mat, locB]);
    await dbRun(db, `UPDATE materiais_almoxarifado SET quantidade_atual = 50 WHERE id = ?`, [mat]);

    const res = await request(app).post('/api/almoxarifado/movimentacoes/v2')
      .send({ material_id: mat, tipo: 'AJUSTE', quantidade: 10, localizacao_destino_id: locA, justificativa: 'contagem A' });
    assert.strictEqual(res.status, 201, JSON.stringify(res.body));

    const sa = await dbGet(db, 'SELECT quantidade FROM estoque_saldo_almoxarifado WHERE material_id=? AND localizacao_id=?', [mat, locA]);
    const m = await dbGet(db, 'SELECT quantidade_atual FROM materiais_almoxarifado WHERE id=?', [mat]);
    assert.strictEqual(sa.quantidade, 10);      // só a loc A mudou
    assert.strictEqual(m.quantidade_atual, 30); // 10 (A) + 20 (B)
  });

  await test('AJUSTE de localizacao para zero propaga total zero', async () => {
    const locC = (await dbRun(db, `INSERT INTO localizacoes_almoxarifado (codigo, descricao) VALUES ('AJL-C','C')`)).lastID;
    const mat = await criarMaterial(db, 'AJL-002', 0);
    await dbRun(db, `INSERT INTO estoque_saldo_almoxarifado (material_id, localizacao_id, quantidade) VALUES (?,?,25)`, [mat, locC]);
    await dbRun(db, `UPDATE materiais_almoxarifado SET quantidade_atual = 25 WHERE id = ?`, [mat]);

    const res = await request(app).post('/api/almoxarifado/movimentacoes/v2')
      .send({ material_id: mat, tipo: 'AJUSTE', quantidade: 0, localizacao_destino_id: locC, justificativa: 'zerar' });
    assert.strictEqual(res.status, 201, JSON.stringify(res.body));

    const sa = await dbGet(db, 'SELECT quantidade FROM estoque_saldo_almoxarifado WHERE material_id=? AND localizacao_id=?', [mat, locC]);
    const m = await dbGet(db, 'SELECT quantidade_atual FROM materiais_almoxarifado WHERE id=?', [mat]);
    assert.strictEqual(sa.quantidade, 0);
    assert.strictEqual(m.quantidade_atual, 0);
  });

  await test('AJUSTE sem localizacao mantem comportamento atual (define total)', async () => {
    const mat = await criarMaterial(db, 'AJL-003', 40);
    await request(app).post('/api/almoxarifado/movimentacoes/v2')
      .send({ material_id: mat, tipo: 'AJUSTE', quantidade: 70, justificativa: 'contagem geral' });
    const m = await dbGet(db, 'SELECT quantidade_atual FROM materiais_almoxarifado WHERE id=?', [mat]);
    assert.strictEqual(m.quantidade_atual, 70);
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
