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

// Mesmo usuário do stub de auth do harness — os movimentos de retenção nascem dos serviços
// (a rota v2 não aceita tipo de retenção), então precisam de um `user` na chamada direta.
const ADMIN = { id: 1, nome: 'Admin Teste', role: 'admin' };

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

  await test('estorno de AJUSTE por localizacao reverte so a localizacao afetada (nao a soma inteira)', async () => {
    const locA = (await dbRun(db, `INSERT INTO localizacoes_almoxarifado (codigo, descricao) VALUES ('AJL-D','D')`)).lastID;
    const locB = (await dbRun(db, `INSERT INTO localizacoes_almoxarifado (codigo, descricao) VALUES ('AJL-E','E')`)).lastID;
    const mat = await criarMaterial(db, 'AJL-004', 0);
    await dbRun(db, `INSERT INTO estoque_saldo_almoxarifado (material_id, localizacao_id, quantidade) VALUES (?,?,30)`, [mat, locA]);
    await dbRun(db, `INSERT INTO estoque_saldo_almoxarifado (material_id, localizacao_id, quantidade) VALUES (?,?,20)`, [mat, locB]);
    await dbRun(db, `UPDATE materiais_almoxarifado SET quantidade_atual = 50 WHERE id = ?`, [mat]);

    const aj = await request(app).post('/api/almoxarifado/movimentacoes/v2')
      .send({ material_id: mat, tipo: 'AJUSTE', quantidade: 10, localizacao_destino_id: locA, justificativa: 'contagem A' });
    assert.strictEqual(aj.status, 201, JSON.stringify(aj.body));
    const totalAposAjuste = await dbGet(db, 'SELECT quantidade_atual FROM materiais_almoxarifado WHERE id=?', [mat]);
    assert.strictEqual(totalAposAjuste.quantidade_atual, 30); // 10 (A) + 20 (B)

    const est = await request(app).post(`/api/almoxarifado/movimentacoes/${aj.body.id}/cancelar`)
      .send({ motivo: 'contagem errada' });
    assert.strictEqual(est.status, 200, JSON.stringify(est.body));

    const sa = await dbGet(db, 'SELECT quantidade FROM estoque_saldo_almoxarifado WHERE material_id=? AND localizacao_id=?', [mat, locA]);
    const sb = await dbGet(db, 'SELECT quantidade FROM estoque_saldo_almoxarifado WHERE material_id=? AND localizacao_id=?', [mat, locB]);
    const m = await dbGet(db, 'SELECT quantidade_atual FROM materiais_almoxarifado WHERE id=?', [mat]);
    assert.strictEqual(sa.quantidade, 30, 'localizacao A deveria voltar a 30');
    assert.strictEqual(sb.quantidade, 20, 'localizacao B nao deveria ser tocada');
    assert.strictEqual(m.quantidade_atual, 50, 'total deveria voltar a 50 (30 + 20)');

    const estornoMov = await dbGet(db,
      `SELECT tipo, quantidade FROM movimentacoes_almoxarifado WHERE id = ?`, [est.body.estorno_id]);
    assert.ok(estornoMov, 'movimento de ESTORNO deveria existir');
    assert.strictEqual(estornoMov.tipo, 'ESTORNO');
  });

  // ── Costura com a retenção (achado do review final da Etapa 5) ────────────────
  // AJUSTE COM localização é o ÚNICO caminho que passa por syncMaterialTotals. Nada no sistema
  // escreve as colunas de retenção de estoque_saldo_almoxarifado (elas existem no CREATE TABLE e
  // ficam sempre em 0), então recalcular retenção a partir dessa soma zerava a quarentena/reserva
  // do material sem movimentação e sem rastro. Os testes de AJUSTE acima não alcançavam isso
  // porque nenhum deles tinha material retido.

  await test('AJUSTE por localizacao nao evapora a quarentena do material', async () => {
    const loc = (await dbRun(db, `INSERT INTO localizacoes_almoxarifado (codigo, descricao) VALUES ('AJL-F','F')`)).lastID;
    const mat = await criarMaterial(db, 'AJL-005', 100);
    await dbRun(db, `INSERT INTO estoque_saldo_almoxarifado (material_id, localizacao_id, quantidade) VALUES (?,?,100)`, [mat, loc]);
    await stockService.registrarMovimentacao(db, ADMIN, {
      material_id: mat, tipo: 'QUARENTENA', quantidade: 100, justificativa: 'material critico aguardando inspecao' });

    const res = await request(app).post('/api/almoxarifado/movimentacoes/v2')
      .send({ material_id: mat, tipo: 'AJUSTE', quantidade: 100, localizacao_destino_id: loc, justificativa: 'contagem' });
    assert.strictEqual(res.status, 201, JSON.stringify(res.body));

    const m = await dbGet(db, 'SELECT * FROM materiais_almoxarifado WHERE id=?', [mat]);
    assert.strictEqual(m.quantidade_atual, 100);
    assert.strictEqual(m.quantidade_em_inspecao, 100, 'AJUSTE liberou a quarentena sem movimentacao');
    assert.strictEqual(await stockService.getSaldoDisponivel(m), 0, 'material em quarentena virou disponivel');
  });

  await test('estorno de AJUSTE por localizacao nao evapora a reserva do material', async () => {
    const loc = (await dbRun(db, `INSERT INTO localizacoes_almoxarifado (codigo, descricao) VALUES ('AJL-G','G')`)).lastID;
    const mat = await criarMaterial(db, 'AJL-006', 100);
    await dbRun(db, `INSERT INTO estoque_saldo_almoxarifado (material_id, localizacao_id, quantidade) VALUES (?,?,100)`, [mat, loc]);
    await stockService.criarReserva(db, ADMIN, { material_id: mat, quantidade: 30 });

    const aj = await request(app).post('/api/almoxarifado/movimentacoes/v2')
      .send({ material_id: mat, tipo: 'AJUSTE', quantidade: 80, localizacao_destino_id: loc, justificativa: 'contagem' });
    assert.strictEqual(aj.status, 201, JSON.stringify(aj.body));
    const posAjuste = await dbGet(db, 'SELECT * FROM materiais_almoxarifado WHERE id=?', [mat]);
    assert.strictEqual(posAjuste.quantidade_atual, 80);
    assert.strictEqual(posAjuste.quantidade_reservada, 30, 'AJUSTE soltou a reserva');

    const est = await request(app).post(`/api/almoxarifado/movimentacoes/${aj.body.id}/cancelar`)
      .send({ motivo: 'contagem errada' });
    assert.strictEqual(est.status, 200, JSON.stringify(est.body));

    const m = await dbGet(db, 'SELECT * FROM materiais_almoxarifado WHERE id=?', [mat]);
    assert.strictEqual(m.quantidade_atual, 100);
    assert.strictEqual(m.quantidade_reservada, 30, 'estorno do AJUSTE soltou a reserva');
    const res = await dbGet(db, 'SELECT status FROM reservas_material_almoxarifado WHERE material_id = ?', [mat]);
    assert.strictEqual(res.status, 'ATIVA', 'a reserva continua viva — o hold no material tem de acompanhar');
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
