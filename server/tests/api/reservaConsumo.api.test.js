/**
 * Consumo de estoque contra reserva — o núcleo da Etapa 4.
 *
 * Antes disto `reserva_id` era só uma coluna gravada na movimentação. Como criarReserva soma
 * em `quantidade_reservada` e getSaldoDisponivel subtrai isso, reservar 10 unidades para o
 * projeto A tornava essas 10 indisponíveis para TODOS — inclusive o projeto A. Não havia
 * caminho de consumo: reservar era uma armadilha.
 *
 * Agora uma saída que cita `reserva_id` valida contra a PRÓPRIA reserva (não contra o
 * disponível, que justamente exclui o reservado), baixa físico e reservado juntos e marca a
 * reserva como CONSUMIDA quando zera.
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet } = require('../../services/almoxarifado/db');
const stockService = require('../../services/almoxarifado/stockService');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

const ADMIN = { id: 1, nome: 'Admin Teste', role: 'admin' };

async function novoMaterial(db, codigo, qtd) {
  const r = await dbRun(db,
    `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, ativo) VALUES (?,?,?,?,1)`,
    [codigo, `Material ${codigo}`, 'UN', qtd]);
  return r.lastID;
}
const material = (db, id) => dbGet(db,
  'SELECT quantidade_atual, COALESCE(quantidade_reservada,0) as reservada FROM materiais_almoxarifado WHERE id = ?', [id]);
const reserva = (db, id) => dbGet(db,
  'SELECT quantidade, COALESCE(quantidade_utilizada,0) as utilizada, status FROM reservas_material_almoxarifado WHERE id = ?', [id]);
const disponivel = async (db, id) => {
  const m = await dbGet(db, 'SELECT * FROM materiais_almoxarifado WHERE id = ?', [id]);
  return stockService.getSaldoDisponivel(m);
};

(async () => {
  const { app, db, close } = await createTestApp({ user: ADMIN });

  await test('após reservar, disponível cai e o físico permanece', async () => {
    const mat = await novoMaterial(db, 'RES-001', 100);
    const res = await request(app).post('/api/almoxarifado/reservas')
      .send({ material_id: mat, quantidade: 30, projeto_id: 1 });
    assert.strictEqual(res.status, 201, JSON.stringify(res.body));

    const m = await material(db, mat);
    assert.strictEqual(m.quantidade_atual, 100, 'físico não deveria mudar com reserva');
    assert.strictEqual(m.reservada, 30);
    assert.strictEqual(await disponivel(db, mat), 70);
  });

  await test('reservar acima do disponível → erro', async () => {
    const mat = await novoMaterial(db, 'RES-002', 10);
    const res = await request(app).post('/api/almoxarifado/reservas')
      .send({ material_id: mat, quantidade: 11, projeto_id: 1 });
    assert.ok(res.status >= 400, `esperava erro, veio ${res.status}`);
    const m = await material(db, mat);
    assert.strictEqual(m.reservada, 0, 'nada deveria ter sido reservado');
  });

  await test('saída SEM reserva_id não consome reserva de terceiro', async () => {
    const mat = await novoMaterial(db, 'RES-003', 100);
    await request(app).post('/api/almoxarifado/reservas')
      .send({ material_id: mat, quantidade: 80, projeto_id: 1 });
    // disponível = 20; pedir 25 sem citar reserva tem de falhar mesmo com 100 no físico
    const res = await request(app).post('/api/almoxarifado/movimentacoes/v2')
      .send({ material_id: mat, tipo: 'SAIDA', quantidade: 25, projeto_id: 2, motivo: 'projeto B' });
    assert.strictEqual(res.status, 400, `esperava 400, veio ${res.status}: ${JSON.stringify(res.body)}`);
    const m = await material(db, mat);
    assert.strictEqual(m.quantidade_atual, 100, 'estoque mudou apesar do erro');
  });

  await test('saída COM reserva_id consome a reserva e NÃO é barrada pelo disponível', async () => {
    const mat = await novoMaterial(db, 'RES-004', 100);
    const r = await request(app).post('/api/almoxarifado/reservas')
      .send({ material_id: mat, quantidade: 90, projeto_id: 7 });
    const reservaId = r.body.id;
    // disponível é 10, mas a reserva tem 90: consumir 50 dela deve passar
    const res = await request(app).post('/api/almoxarifado/movimentacoes/v2')
      .send({ material_id: mat, tipo: 'SAIDA', quantidade: 50, projeto_id: 7, reserva_id: reservaId, motivo: 'consumo do projeto' });
    assert.strictEqual(res.status, 201, `esperava 201, veio ${res.status}: ${JSON.stringify(res.body)}`);

    const m = await material(db, mat);
    assert.strictEqual(m.quantidade_atual, 50, 'físico deveria ter caído 50');
    assert.strictEqual(m.reservada, 40, 'reservado deveria ter caído 50');
    const rr = await reserva(db, reservaId);
    assert.strictEqual(rr.utilizada, 50);
    assert.strictEqual(rr.status, 'ATIVA', 'reserva parcial continua ativa');
    assert.strictEqual(await disponivel(db, mat), 10, 'disponível permanece coerente');
  });

  await test('consumir mais que o saldo da reserva → 400 e nada muda', async () => {
    const mat = await novoMaterial(db, 'RES-005', 100);
    const r = await request(app).post('/api/almoxarifado/reservas')
      .send({ material_id: mat, quantidade: 20, projeto_id: 3 });
    const antes = await material(db, mat);

    const res = await request(app).post('/api/almoxarifado/movimentacoes/v2')
      .send({ material_id: mat, tipo: 'SAIDA', quantidade: 21, projeto_id: 3, reserva_id: r.body.id, motivo: 'acima da reserva' });
    assert.strictEqual(res.status, 400, `esperava 400, veio ${res.status}: ${JSON.stringify(res.body)}`);
    assert.ok(/reserva/i.test(res.body.error || ''), `mensagem deveria citar a reserva: ${res.body.error}`);

    const depois = await material(db, mat);
    assert.deepStrictEqual(depois, antes, 'material mudou apesar do 400');
    const rr = await reserva(db, r.body.id);
    assert.strictEqual(rr.utilizada, 0, 'a reivindicação não foi compensada');
  });

  await test('reserva totalmente consumida vira CONSUMIDA e libera o reservado', async () => {
    const mat = await novoMaterial(db, 'RES-006', 100);
    const r = await request(app).post('/api/almoxarifado/reservas')
      .send({ material_id: mat, quantidade: 40, projeto_id: 4 });
    const res = await request(app).post('/api/almoxarifado/movimentacoes/v2')
      .send({ material_id: mat, tipo: 'SAIDA', quantidade: 40, projeto_id: 4, reserva_id: r.body.id, motivo: 'consumo total' });
    assert.strictEqual(res.status, 201, JSON.stringify(res.body));

    const rr = await reserva(db, r.body.id);
    assert.strictEqual(rr.status, 'CONSUMIDA');
    const m = await material(db, mat);
    assert.strictEqual(m.reservada, 0, 'reserva zumbi: ainda segurando saldo');
    assert.strictEqual(m.quantidade_atual, 60);
    assert.strictEqual(await disponivel(db, mat), 60);
  });

  await test('consumir reserva já CONSUMIDA → 400', async () => {
    const mat = await novoMaterial(db, 'RES-007', 50);
    const r = await request(app).post('/api/almoxarifado/reservas')
      .send({ material_id: mat, quantidade: 10, projeto_id: 5 });
    await request(app).post('/api/almoxarifado/movimentacoes/v2')
      .send({ material_id: mat, tipo: 'SAIDA', quantidade: 10, projeto_id: 5, reserva_id: r.body.id, motivo: 'zera' });

    const res = await request(app).post('/api/almoxarifado/movimentacoes/v2')
      .send({ material_id: mat, tipo: 'SAIDA', quantidade: 1, projeto_id: 5, reserva_id: r.body.id, motivo: 'de novo' });
    assert.strictEqual(res.status, 400, `esperava 400, veio ${res.status}: ${JSON.stringify(res.body)}`);
    assert.ok(/consumida/i.test(res.body.error || ''), res.body.error);
  });

  await test('reserva_id de outro material → 400', async () => {
    const matA = await novoMaterial(db, 'RES-008A', 50);
    const matB = await novoMaterial(db, 'RES-008B', 50);
    const r = await request(app).post('/api/almoxarifado/reservas')
      .send({ material_id: matA, quantidade: 10, projeto_id: 6 });

    const res = await request(app).post('/api/almoxarifado/movimentacoes/v2')
      .send({ material_id: matB, tipo: 'SAIDA', quantidade: 5, projeto_id: 6, reserva_id: r.body.id, motivo: 'material trocado' });
    assert.strictEqual(res.status, 400, `esperava 400, veio ${res.status}: ${JSON.stringify(res.body)}`);
    const rr = await reserva(db, r.body.id);
    assert.strictEqual(rr.utilizada, 0, 'reserva do material A foi tocada');
  });

  await test('liberar reserva devolve ao disponível', async () => {
    const mat = await novoMaterial(db, 'RES-009', 100);
    const r = await request(app).post('/api/almoxarifado/reservas')
      .send({ material_id: mat, quantidade: 60, projeto_id: 8 });
    assert.strictEqual(await disponivel(db, mat), 40);

    const res = await request(app).post(`/api/almoxarifado/reservas/${r.body.id}/liberar`).send({});
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.strictEqual(await disponivel(db, mat), 100);
    const m = await material(db, mat);
    assert.strictEqual(m.quantidade_atual, 100, 'liberar não deve mexer no físico');
  });

  await test('a movimentação de consumo fica registrada com o reserva_id (rastro)', async () => {
    const mat = await novoMaterial(db, 'RES-010', 30);
    const r = await request(app).post('/api/almoxarifado/reservas')
      .send({ material_id: mat, quantidade: 10, projeto_id: 9 });
    await request(app).post('/api/almoxarifado/movimentacoes/v2')
      .send({ material_id: mat, tipo: 'SAIDA', quantidade: 4, projeto_id: 9, reserva_id: r.body.id, motivo: 'rastro' });

    const mov = await dbGet(db,
      `SELECT tipo, quantidade, reserva_id, saldo_anterior, saldo_posterior FROM movimentacoes_almoxarifado
       WHERE material_id = ? AND tipo = 'SAIDA' ORDER BY id DESC LIMIT 1`, [mat]);
    assert.ok(mov, 'movimentação de consumo não foi registrada');
    assert.strictEqual(mov.reserva_id, r.body.id);
    assert.strictEqual(mov.saldo_anterior, 30);
    assert.strictEqual(mov.saldo_posterior, 26);
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
