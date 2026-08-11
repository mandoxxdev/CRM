/**
 * Etapa 6b, Task 4 — motor: efeito de SAIDA para material com controle_serie (claim de series +
 * compensacao).
 *
 * Fecha o Critical do review da Task 3: ate esta task, `POST /movimentacoes/v2` com
 * `tipo: SAIDA, serie_ids` CORRETOS retornava 201, debitava `quantidade_atual`, mas NUNCA tocava
 * `series_almoxarifado` — as series continuavam EM_ESTOQUE e o invariante
 * COUNT(serie presente) == quantidade_atual quebrava (presentes=2 != quantidade_atual=0). O
 * primeiro teste abaixo reproduz exatamente esse cenario.
 *
 * Molde: serieControleObrigatorio.api.test.js (requisicao v2, `assertInvarianteSerie` no fim de
 * cada caso). Todas as saidas aqui precisam de vinculo (regra `qualquer` de movementRules): por
 * simplicidade os testes usam `justificativa`.
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const lotService = require('../../services/almoxarifado/lotService');
const { assertInvarianteSerie } = require('../helpers/serieInvariante');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}
const ADMIN = { id: 1, nome: 'Admin Teste', role: 'admin', is_superadmin: 1, email: 'admin@test.com' };
const JUST = { justificativa: 'teste de saida com serie' };

let seq = 0;
async function novoMaterial(db, { controle_serie = 1, controle_lote = 0, qtd = 0 } = {}) {
  seq += 1;
  const r = await dbRun(db,
    `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, ativo, controle_serie, controle_lote)
     VALUES (?,?,'UN',?,1,?,?)`,
    [`MAT-SERSAI-${seq}`, `Material serie saida ${seq}`, qtd, controle_serie ? 1 : 0, controle_lote ? 1 : 0]);
  return r.lastID;
}
const totalDoMaterial = async (db, id) => (await dbGet(db,
  'SELECT quantidade_atual FROM materiais_almoxarifado WHERE id = ?', [id])).quantidade_atual;

// Entrada v2 com series, pra popular o material antes de testar a saida. Devolve as linhas de
// series_almoxarifado criadas (na ordem informada), ja lidas do banco.
async function entrarComSeries(app, db, materialId, numeros, extra = {}) {
  const res = await request(app).post('/api/almoxarifado/movimentacoes/v2')
    .send({ material_id: materialId, tipo: 'ENTRADA', quantidade: numeros.length, motivo: 'setup', series: numeros, ...extra });
  assert.strictEqual(res.status, 201, `setup de entrada falhou: ${JSON.stringify(res.body)}`);
  return dbAll(db, 'SELECT * FROM series_almoxarifado WHERE movimentacao_entrada_id = ? ORDER BY id', [res.body.id]);
}

(async () => {
  const { app, db, close } = await createTestApp({ user: ADMIN });

  await test('saida com serie_ids marca ENTREGUE, vincula a movimentacao e mantem o invariante (fecha o Critical da Task 3)', async () => {
    const mat = await novoMaterial(db, { controle_serie: 1 });
    const series = await entrarComSeries(app, db, mat, ['SN-A', 'SN-B', 'SN-C']);
    assert.strictEqual(series.length, 3);

    const res = await request(app).post('/api/almoxarifado/movimentacoes/v2')
      .send({
        material_id: mat, tipo: 'SAIDA', quantidade: 2,
        serie_ids: [series[0].id, series[1].id], ...JUST,
      });
    assert.strictEqual(res.status, 201, JSON.stringify(res.body));
    assert.strictEqual(await totalDoMaterial(db, mat), 1, 'saldo deveria ter sido debitado em 2');

    const a = await dbGet(db, 'SELECT * FROM series_almoxarifado WHERE id = ?', [series[0].id]);
    const b = await dbGet(db, 'SELECT * FROM series_almoxarifado WHERE id = ?', [series[1].id]);
    const c = await dbGet(db, 'SELECT * FROM series_almoxarifado WHERE id = ?', [series[2].id]);
    assert.strictEqual(a.status, 'ENTREGUE', 'a serie citada na saida deveria sair de EM_ESTOQUE');
    assert.strictEqual(b.status, 'ENTREGUE', 'a serie citada na saida deveria sair de EM_ESTOQUE');
    assert.strictEqual(a.movimentacao_saida_id, res.body.id, 'serie sem vinculo com a movimentacao de saida');
    assert.strictEqual(b.movimentacao_saida_id, res.body.id, 'serie sem vinculo com a movimentacao de saida');
    assert.strictEqual(c.status, 'EM_ESTOQUE', 'serie NAO citada na saida nao podia ser afetada');

    await assertInvarianteSerie(db, mat);
  });

  await test('SUCATA marca SUCATEADA', async () => {
    const mat = await novoMaterial(db, { controle_serie: 1 });
    const series = await entrarComSeries(app, db, mat, ['SN-D']);

    const res = await request(app).post('/api/almoxarifado/movimentacoes/v2')
      .send({ material_id: mat, tipo: 'SUCATA', quantidade: 1, serie_ids: [series[0].id], ...JUST });
    assert.strictEqual(res.status, 201, JSON.stringify(res.body));

    const s = await dbGet(db, 'SELECT status, movimentacao_saida_id FROM series_almoxarifado WHERE id = ?', [series[0].id]);
    assert.strictEqual(s.status, 'SUCATEADA');
    assert.strictEqual(s.movimentacao_saida_id, res.body.id);
    await assertInvarianteSerie(db, mat);
  });

  await test('saida com serie de outro material e recusada sem efeito', async () => {
    const matA = await novoMaterial(db, { controle_serie: 1 });
    const matB = await novoMaterial(db, { controle_serie: 1 });
    const seriesA = await entrarComSeries(app, db, matA, ['SN-E1', 'SN-E2']);
    const seriesB = await entrarComSeries(app, db, matB, ['SN-F1']);

    const res = await request(app).post('/api/almoxarifado/movimentacoes/v2')
      .send({
        material_id: matA, tipo: 'SAIDA', quantidade: 2,
        serie_ids: [seriesA[0].id, seriesB[0].id], ...JUST,
      });
    assert.strictEqual(res.status, 400);
    assert.ok(/nao pertence a este material/.test(res.body.error), res.body.error);

    assert.strictEqual(await totalDoMaterial(db, matA), 2, 'saldo do material A nao podia ter sido debitado');
    assert.strictEqual(await totalDoMaterial(db, matB), 1, 'saldo do material B nao devia ser tocado');
    const a0 = await dbGet(db, 'SELECT status FROM series_almoxarifado WHERE id = ?', [seriesA[0].id]);
    assert.strictEqual(a0.status, 'EM_ESTOQUE', 'a serie valida de A nao podia ter sido reivindicada');
    await assertInvarianteSerie(db, matA);
    await assertInvarianteSerie(db, matB);
  });

  await test('saida com serie BLOQUEADA e recusada e nao deixa claim parcial', async () => {
    const mat = await novoMaterial(db, { controle_serie: 1 });
    const series = await entrarComSeries(app, db, mat, ['SN-G1', 'SN-G2']);
    await dbRun(db, "UPDATE series_almoxarifado SET status = 'BLOQUEADA' WHERE id = ?", [series[1].id]);

    const res = await request(app).post('/api/almoxarifado/movimentacoes/v2')
      .send({
        material_id: mat, tipo: 'SAIDA', quantidade: 2,
        serie_ids: [series[0].id, series[1].id], ...JUST,
      });
    assert.strictEqual(res.status, 400);
    assert.ok(/nao esta dispon/.test(res.body.error), res.body.error);

    const a = await dbGet(db, 'SELECT status FROM series_almoxarifado WHERE id = ?', [series[0].id]);
    assert.strictEqual(a.status, 'EM_ESTOQUE', 'a primeira serie do lote nao podia sobrar claimada (claim parcial)');
    assert.strictEqual(await totalDoMaterial(db, mat), 2, 'saldo nao podia ter sido debitado');
    await assertInvarianteSerie(db, mat);
  });

  await test('material com controle_lote e controle_serie: serie tem de pertencer ao lote da saida', async () => {
    const mat = await novoMaterial(db, { controle_serie: 1, controle_lote: 1 });
    const loteL1 = await lotService.criarOuObterLote(db, ADMIN, { material_id: mat, codigo: 'L1' });
    const loteL2 = await lotService.criarOuObterLote(db, ADMIN, { material_id: mat, codigo: 'L2' });
    await entrarComSeries(app, db, mat, ['SN-L2'], { lote_id: loteL2.id });
    const seriesL1 = await entrarComSeries(app, db, mat, ['SN-L1'], { lote_id: loteL1.id });

    // Saida cita o lote L2 (que tem saldo suficiente: 1 unidade) mas a serie informada e do L1.
    const res = await request(app).post('/api/almoxarifado/movimentacoes/v2')
      .send({
        material_id: mat, tipo: 'SAIDA', quantidade: 1,
        lote_id: loteL2.id, serie_ids: [seriesL1[0].id], ...JUST,
      });
    assert.strictEqual(res.status, 400);
    assert.ok(/nao pertence ao lote/.test(res.body.error), res.body.error);

    assert.strictEqual(await totalDoMaterial(db, mat), 2, 'saldo nao podia ter sido debitado (nem o do lote L2)');
    const s = await dbGet(db, 'SELECT status FROM series_almoxarifado WHERE id = ?', [seriesL1[0].id]);
    assert.strictEqual(s.status, 'EM_ESTOQUE');
    await assertInvarianteSerie(db, mat);
  });

  await test('saida sem controle_serie continua ignorando serie_ids', async () => {
    const mat = await novoMaterial(db, { controle_serie: 0, qtd: 5 });
    const res = await request(app).post('/api/almoxarifado/movimentacoes/v2')
      .send({ material_id: mat, tipo: 'SAIDA', quantidade: 2, serie_ids: [999999], ...JUST });
    assert.strictEqual(res.status, 201, JSON.stringify(res.body));
    assert.strictEqual(await totalDoMaterial(db, mat), 3);
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
