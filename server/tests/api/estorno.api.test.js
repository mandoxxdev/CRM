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

  await test('estorno de ENTRADA baixa o saldo e vincula os movimentos', async () => {
    const mat = await criarMaterial(db, 'EST-001', 100);
    const ent = await request(app).post('/api/almoxarifado/movimentacoes/v2')
      .send({ material_id: mat, tipo: 'ENTRADA', quantidade: 50 });
    const est = await request(app).post(`/api/almoxarifado/movimentacoes/${ent.body.id}/cancelar`)
      .send({ motivo: 'Lançamento errado' });
    assert.strictEqual(est.status, 200, JSON.stringify(est.body));
    const m = await dbGet(db, 'SELECT quantidade_atual FROM materiais_almoxarifado WHERE id = ?', [mat]);
    assert.strictEqual(m.quantidade_atual, 100);
    const orig = await dbGet(db, 'SELECT cancelado, movimento_estorno_id FROM movimentacoes_almoxarifado WHERE id = ?', [ent.body.id]);
    assert.strictEqual(orig.cancelado, 1);
    const estMov = await dbGet(db, 'SELECT tipo, quantidade FROM movimentacoes_almoxarifado WHERE id = ?', [orig.movimento_estorno_id]);
    assert.strictEqual(estMov.tipo, 'ESTORNO');
    assert.strictEqual(estMov.quantidade, 50);
  });

  await test('estorno de SAIDA devolve o saldo', async () => {
    const mat = await criarMaterial(db, 'EST-002', 100);
    const sai = await request(app).post('/api/almoxarifado/movimentacoes/v2')
      .send({ material_id: mat, tipo: 'SAIDA', quantidade: 30, justificativa: 'x' });
    await request(app).post(`/api/almoxarifado/movimentacoes/${sai.body.id}/cancelar`).send({ motivo: 'devolver' });
    const m = await dbGet(db, 'SELECT quantidade_atual FROM materiais_almoxarifado WHERE id = ?', [mat]);
    assert.strictEqual(m.quantidade_atual, 100);
  });

  await test('estorno de AJUSTE restaura o saldo anterior', async () => {
    const mat = await criarMaterial(db, 'EST-003', 80);
    const aj = await request(app).post('/api/almoxarifado/movimentacoes/v2')
      .send({ material_id: mat, tipo: 'AJUSTE', quantidade: 55, justificativa: 'inventário' });
    await request(app).post(`/api/almoxarifado/movimentacoes/${aj.body.id}/cancelar`).send({ motivo: 'inventário errado' });
    const m = await dbGet(db, 'SELECT quantidade_atual FROM materiais_almoxarifado WHERE id = ?', [mat]);
    assert.strictEqual(m.quantidade_atual, 80);
  });

  await test('estorno de TRANSFERENCIA devolve o saldo para a origem', async () => {
    const locA = (await dbRun(db, `INSERT INTO localizacoes_almoxarifado (codigo, descricao) VALUES ('EST-A','A')`)).lastID;
    const locB = (await dbRun(db, `INSERT INTO localizacoes_almoxarifado (codigo, descricao) VALUES ('EST-B','B')`)).lastID;
    const mat = await criarMaterial(db, 'EST-004', 40);
    await dbRun(db, `INSERT INTO estoque_saldo_almoxarifado (material_id, localizacao_id, quantidade) VALUES (?,?,40)`, [mat, locA]);
    const tr = await request(app).post('/api/almoxarifado/transferencias')
      .send({ material_id: mat, quantidade: 15, localizacao_origem_id: locA, localizacao_destino_id: locB });
    assert.strictEqual(tr.status, 201, JSON.stringify(tr.body));
    await request(app).post(`/api/almoxarifado/movimentacoes/${tr.body.id}/cancelar`).send({ motivo: 'voltar' });
    const sa = await dbGet(db, 'SELECT quantidade FROM estoque_saldo_almoxarifado WHERE material_id=? AND localizacao_id=?', [mat, locA]);
    const sb = await dbGet(db, 'SELECT quantidade FROM estoque_saldo_almoxarifado WHERE material_id=? AND localizacao_id=?', [mat, locB]);
    assert.strictEqual(sa.quantidade, 40);
    assert.strictEqual(sb.quantidade, 0);
  });

  await test('estorno duplo falha; estornar um ESTORNO falha; sem motivo falha', async () => {
    const mat = await criarMaterial(db, 'EST-005', 10);
    const ent = await request(app).post('/api/almoxarifado/movimentacoes/v2')
      .send({ material_id: mat, tipo: 'ENTRADA', quantidade: 5 });
    const semMotivo = await request(app).post(`/api/almoxarifado/movimentacoes/${ent.body.id}/cancelar`).send({});
    assert.strictEqual(semMotivo.status, 400);
    const ok = await request(app).post(`/api/almoxarifado/movimentacoes/${ent.body.id}/cancelar`).send({ motivo: 'x' });
    assert.strictEqual(ok.status, 200);
    const duplo = await request(app).post(`/api/almoxarifado/movimentacoes/${ent.body.id}/cancelar`).send({ motivo: 'de novo' });
    assert.strictEqual(duplo.status, 400);
    const doEstorno = await request(app).post(`/api/almoxarifado/movimentacoes/${ok.body.estorno_id}/cancelar`).send({ motivo: 'estorno do estorno' });
    assert.strictEqual(doEstorno.status, 400);
  });

  await test('estorno de entrada ja consumida falha com saldo insuficiente', async () => {
    const mat = await criarMaterial(db, 'EST-006', 0);
    const ent = await request(app).post('/api/almoxarifado/movimentacoes/v2')
      .send({ material_id: mat, tipo: 'ENTRADA', quantidade: 20 });
    await request(app).post('/api/almoxarifado/movimentacoes/v2')
      .send({ material_id: mat, tipo: 'SAIDA', quantidade: 15, justificativa: 'consumo' });
    const est = await request(app).post(`/api/almoxarifado/movimentacoes/${ent.body.id}/cancelar`).send({ motivo: 'cancelar compra' });
    assert.strictEqual(est.status, 400, JSON.stringify(est.body));
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
