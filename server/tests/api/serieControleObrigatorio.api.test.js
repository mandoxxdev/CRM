/**
 * Etapa 6b, Task 3 — motor: exigencia e efeito de ENTRADA para material com controle_serie.
 *
 * Molde: loteControleObrigatorio.api.test.js. Mesma decisao de desenho que o lote: a exigencia
 * vive em `opcoes.exigeSerie` (4o argumento de registrarMovimentacao), declarada pelo CHAMADOR
 * (rotas v1/v2), nunca deduzida pelo motor nem forjavel pelo corpo da requisicao. Fluxos internos
 * (entrega de requisicao, etc.) continuam isentos — nao tem campo de serie na tela ainda
 * (pendencia declarada nas specs 04/12).
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const requisitionService = require('../../services/almoxarifado/requisitionService');
const { assertInvarianteSerie } = require('../helpers/serieInvariante');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}
const ADMIN = { id: 1, nome: 'Admin Teste', role: 'admin', is_superadmin: 1, email: 'admin@test.com' };

let seq = 0;
async function novoMaterial(db, { controle_serie = 1, qtd = 0 } = {}) {
  seq += 1;
  const r = await dbRun(db,
    `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, ativo, controle_serie)
     VALUES (?,?,'UN',?,1,?)`, [`MAT-SEROBR-${seq}`, `Material serie obrigatoria ${seq}`, qtd, controle_serie ? 1 : 0]);
  return r.lastID;
}
const totalDoMaterial = async (db, id) => (await dbGet(db,
  'SELECT quantidade_atual FROM materiais_almoxarifado WHERE id = ?', [id])).quantidade_atual;

async function criarRequisicao(db, materialId, quantidade, { status = 'APROVADO' } = {}) {
  seq += 1;
  const r = await dbRun(db, `INSERT INTO requisicoes_almoxarifado
    (numero, solicitante_id, solicitante_nome, status) VALUES (?, 1, 'Solicitante Teste', ?)`,
    [`REQ-SEROBR-${seq}`, status]);
  const item = await dbRun(db, `INSERT INTO itens_requisicao_almoxarifado
    (requisicao_id, material_id, quantidade_solicitada, quantidade_separada, quantidade_entregue, quantidade_atendida)
    VALUES (?,?,?,0,0,0)`, [r.lastID, materialId, quantidade]);
  return { id: r.lastID, itemId: item.lastID };
}

(async () => {
  const { app, db, close } = await createTestApp({ user: ADMIN });

  await test('[rota v2] entrada sem series em material controlado e recusada', async () => {
    const mat = await novoMaterial(db, { controle_serie: 1 });
    const res = await request(app).post('/api/almoxarifado/movimentacoes/v2')
      .send({ material_id: mat, tipo: 'ENTRADA', quantidade: 2, motivo: 'teste' });
    assert.strictEqual(res.status, 400);
    assert.ok(/serie/.test(res.body.error), res.body.error);
    assert.strictEqual(await totalDoMaterial(db, mat), 0, 'entrada nao podia ter efeito');
  });

  await test('[rota v2] cardinalidade errada (1 serie para 2 unidades) e recusada', async () => {
    const mat = await novoMaterial(db, { controle_serie: 1 });
    const res = await request(app).post('/api/almoxarifado/movimentacoes/v2')
      .send({ material_id: mat, tipo: 'ENTRADA', quantidade: 2, motivo: 'teste', series: ['SN-1'] });
    assert.strictEqual(res.status, 400);
    assert.ok(/2 serie/.test(res.body.error), res.body.error);
  });

  await test('[rota v2] quantidade fracionaria com controle_serie e recusada', async () => {
    const mat = await novoMaterial(db, { controle_serie: 1 });
    const res = await request(app).post('/api/almoxarifado/movimentacoes/v2')
      .send({ material_id: mat, tipo: 'ENTRADA', quantidade: 1.5, motivo: 'teste', series: ['SN-1', 'SN-2'] });
    assert.strictEqual(res.status, 400);
    assert.ok(/inteira/.test(res.body.error), res.body.error);
  });

  await test('[rota v2] entrada com N series cria as N e mantem o invariante', async () => {
    const mat = await novoMaterial(db, { controle_serie: 1 });
    const res = await request(app).post('/api/almoxarifado/movimentacoes/v2')
      .send({ material_id: mat, tipo: 'ENTRADA', quantidade: 2, motivo: 'teste', series: ['SN-1', 'SN-2'] });
    assert.strictEqual(res.status, 201, JSON.stringify(res.body));
    await assertInvarianteSerie(db, mat);
    const mov = await dbGet(db, 'SELECT id FROM movimentacoes_almoxarifado ORDER BY id DESC LIMIT 1');
    const vinculadas = await dbAll(db, 'SELECT * FROM series_almoxarifado WHERE movimentacao_entrada_id = ?', [mov.id]);
    assert.strictEqual(vinculadas.length, 2, 'series sem vinculo com a movimentacao');
  });

  await test('[rota v2] entrada com serie ja em estoque e recusada sem efeito no saldo', async () => {
    const mat = await novoMaterial(db, { controle_serie: 1 });
    await request(app).post('/api/almoxarifado/movimentacoes/v2')
      .send({ material_id: mat, tipo: 'ENTRADA', quantidade: 1, motivo: 'teste', series: ['SN-DUP'] });
    const res = await request(app).post('/api/almoxarifado/movimentacoes/v2')
      .send({ material_id: mat, tipo: 'ENTRADA', quantidade: 2, motivo: 'teste', series: ['SN-NOVA', 'SN-DUP'] });
    assert.strictEqual(res.status, 400);
    assert.strictEqual(await totalDoMaterial(db, mat), 1, 'a segunda entrada nao podia creditar');
    await assertInvarianteSerie(db, mat);
  });

  await test('[rota v1] o modal rapido tambem exige serie', async () => {
    const mat = await novoMaterial(db, { controle_serie: 1 });
    const res = await request(app).post('/api/almoxarifado/movimentacoes')
      .send({ material_id: mat, tipo: 'ENTRADA', quantidade: 1, motivo: 'teste' });
    assert.strictEqual(res.status, 400);
    assert.ok(/serie/.test(res.body.error), res.body.error);
  });

  await test('[rota v2] o corpo nao consegue ligar exigeSerie em material sem controle', async () => {
    const mat = await novoMaterial(db, { controle_serie: 0 });
    const res = await request(app).post('/api/almoxarifado/movimentacoes/v2')
      .send({ material_id: mat, tipo: 'ENTRADA', quantidade: 1, motivo: 'teste', exigeSerie: true });
    assert.strictEqual(res.status, 201, 'material sem controle_serie nao pode ser travado pelo body');
  });

  // ⚠️ Etapa 61: este cenario dizia "entrega de requisicao continua isenta de serie" — e a isencao
  // ERA O DEFEITO (sonda: a entrega baixava o fisico e deixava as series EM_ESTOQUE; fisico 1, series
  // presentes 3). Reescrito DE PROPOSITO: a entrega de material com serie exige as series, e o
  // estoque legado sem linha de serie tem saida pela regularizacao (cadastrar as series do fisico).
  await test('[Etapa 61] entrega de requisicao EXIGE as series; o legado sem serie sai pela regularizacao', async () => {
    const mat = await novoMaterial(db, { controle_serie: 1, qtd: 5 }); // legado: 5 no fisico, 0 series
    const { id: reqId, itemId } = await criarRequisicao(db, mat, 5, { status: 'APROVADO' });

    await requisitionService.separarRequisicao(db, reqId, [{ item_id: itemId, quantidade_separada: 5 }], ADMIN);
    const separada = await dbGet(db, 'SELECT quantidade_separada FROM itens_requisicao_almoxarifado WHERE id = ?', [itemId]);
    assert.strictEqual(separada.quantidade_separada, 5);

    await assert.rejects(() => requisitionService.entregarRequisicao(
      db, reqId, [{ item_id: itemId, quantidade_atendida: 5 }], ADMIN, null,
    ), (e) => e.status === 400 && /informe 5 serie\(s\) para 5 unidade\(s\) — recebidas 0/.test(e.message));
    assert.strictEqual(await totalDoMaterial(db, mat), 5, 'a entrega recusada nao pode baixar o fisico');

    const seriesService = require('../../services/almoxarifado/seriesService');
    await seriesService.regularizarSeries(db, ADMIN, mat, { cadastrar: ['L1', 'L2', 'L3', 'L4', 'L5'], justificativa: 'cadastro do legado' });
    const ids = (await dbAll(db, 'SELECT id FROM series_almoxarifado WHERE material_id = ? ORDER BY id', [mat])).map((s) => s.id);
    const entrega = await requisitionService.entregarRequisicao(
      db, reqId, [{ item_id: itemId, quantidade_atendida: 5, serie_ids: ids }], ADMIN, null,
    );
    assert.strictEqual(entrega.status, 'ENTREGUE', JSON.stringify(entrega));
    assert.strictEqual(await totalDoMaterial(db, mat), 0);
    const presentes = await dbGet(db, "SELECT COUNT(*) n FROM series_almoxarifado WHERE material_id = ? AND status IN ('EM_ESTOQUE','BLOQUEADA')", [mat]);
    assert.strictEqual(presentes.n, 0, 'fisico e series presentes tem de bater');
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
