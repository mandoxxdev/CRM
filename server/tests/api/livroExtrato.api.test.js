const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun } = require('../../services/almoxarifado/db');

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

  await test('filtro por projeto retorna apenas movimentos do projeto', async () => {
    const mat = await criarMaterial(db, 'LIV-001', 100);
    await request(app).post('/api/almoxarifado/movimentacoes/v2')
      .send({ material_id: mat, tipo: 'SAIDA', quantidade: 5, projeto_id: 77, justificativa: 'p77' });
    await request(app).post('/api/almoxarifado/movimentacoes/v2')
      .send({ material_id: mat, tipo: 'SAIDA', quantidade: 3, justificativa: 'sem projeto' });
    const res = await request(app).get('/api/almoxarifado/movimentacoes?projeto_id=77');
    assert.strictEqual(res.status, 200);
    assert.ok(res.body.length >= 1);
    assert.ok(res.body.every((m) => m.projeto_id === 77));
  });

  await test('filtro pendentes_regularizacao', async () => {
    const mat = await criarMaterial(db, 'LIV-002', 50);
    await request(app).post('/api/almoxarifado/movimentacoes/v2')
      .send({ material_id: mat, tipo: 'SAIDA_PRODUCAO', quantidade: 2, emergencial: true, justificativa: 'urgente' });
    const res = await request(app).get('/api/almoxarifado/movimentacoes?pendentes_regularizacao=1');
    assert.ok(res.body.length >= 1);
    assert.ok(res.body.every((m) => m.regularizacao_pendente === 1));
  });

  await test('extrato do item agrega saldos, movimentacoes e reservas', async () => {
    const mat = await criarMaterial(db, 'LIV-003', 100);
    await request(app).post('/api/almoxarifado/movimentacoes/v2')
      .send({ material_id: mat, tipo: 'SAIDA', quantidade: 10, justificativa: 'x' });
    await request(app).post('/api/almoxarifado/reservas')
      .send({ material_id: mat, quantidade: 20, os_referencia: 'OS-EXTRATO' });
    const res = await request(app).get(`/api/almoxarifado/materiais/${mat}/extrato`);
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.strictEqual(res.body.material.id, mat);
    assert.strictEqual(res.body.material.quantidade_disponivel, 70); // 90 físico − 20 reservado
    assert.ok(Array.isArray(res.body.movimentacoes) && res.body.movimentacoes.length >= 2); // saída + reserva
    assert.ok(Array.isArray(res.body.reservas) && res.body.reservas.length === 1);
    assert.ok(Array.isArray(res.body.saldos_localizacao));
  });

  await test('extrato de material inexistente retorna 404', async () => {
    const res = await request(app).get('/api/almoxarifado/materiais/999999/extrato');
    assert.strictEqual(res.status, 404);
  });

  await test('aux de ordens de servico responde lista', async () => {
    await dbRun(db, `CREATE TABLE IF NOT EXISTS ordens_servico (id INTEGER PRIMARY KEY, numero_os TEXT, status TEXT, cliente_id INTEGER)`);
    await dbRun(db, `INSERT INTO ordens_servico (numero_os, status) VALUES ('OS-0001','ABERTA')`);
    const res = await request(app).get('/api/almoxarifado/aux/ordens-servico');
    assert.strictEqual(res.status, 200);
    assert.ok(res.body.some((o) => o.numero_os === 'OS-0001'));
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
