/**
 * Etapa 6b, Task 5 — estorno (cancelarMovimentacao) integrado com series_almoxarifado, e
 * reentrada manual de serie ja ENTREGUE pela tela (fluxo de devolucao via ENTRADA v2).
 *
 * Ate esta task, `cancelarMovimentacao` revertia saldo de ENTRADA/SAIDA sem tocar
 * `series_almoxarifado` — o invariante COUNT(serie presente) == quantidade_atual quebrava
 * assim que o material tinha controle_serie: o saldo voltava, mas as series continuavam
 * ENTREGUE/SUCATEADA (estorno de saida) ou EM_ESTOQUE vinculadas a uma entrada que o livro
 * diz ter sido desfeita (estorno de entrada).
 *
 * Molde: estorno.api.test.js (rotas v2 + /cancelar) e serieGuardasSaida.api.test.js
 * (`assertInvarianteSerie`, helper `entrarComSeries`).
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const { assertInvarianteSerie } = require('../helpers/serieInvariante');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

let seq = 0;
async function novoMaterial(db, { controle_serie = 1, qtd = 0 } = {}) {
  seq += 1;
  const r = await dbRun(db,
    `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, ativo, controle_serie)
     VALUES (?,?,'UN',?,1,?)`,
    [`MAT-SEREST-${seq}`, `Material serie estorno ${seq}`, qtd, controle_serie ? 1 : 0]);
  return r.lastID;
}

// Entrada v2 com series, pra popular o material. Devolve as linhas de series_almoxarifado
// criadas (na ordem informada), ja lidas do banco, e o id da movimentacao de entrada.
async function entrarComSeries(app, db, materialId, numeros, extra = {}) {
  const res = await request(app).post('/api/almoxarifado/movimentacoes/v2')
    .send({ material_id: materialId, tipo: 'ENTRADA', quantidade: numeros.length, motivo: 'setup', series: numeros, ...extra });
  assert.strictEqual(res.status, 201, `setup de entrada falhou: ${JSON.stringify(res.body)}`);
  const linhas = await dbAll(db, 'SELECT * FROM series_almoxarifado WHERE movimentacao_entrada_id = ? ORDER BY id', [res.body.id]);
  return { movId: res.body.id, series: linhas };
}

(async () => {
  const { app, db, close } = await createTestApp();

  await test('estorno de saida devolve as series a EM_ESTOQUE e mantem o invariante', async () => {
    const mat = await novoMaterial(db);
    const { series } = await entrarComSeries(app, db, mat, ['SN-DEV-1', 'SN-DEV-2']);

    const sai = await request(app).post('/api/almoxarifado/movimentacoes/v2')
      .send({
        material_id: mat, tipo: 'SAIDA', quantidade: 2,
        serie_ids: [series[0].id, series[1].id], justificativa: 'saida para estornar',
      });
    assert.strictEqual(sai.status, 201, JSON.stringify(sai.body));

    const antes1 = await dbGet(db, 'SELECT status FROM series_almoxarifado WHERE id = ?', [series[0].id]);
    const antes2 = await dbGet(db, 'SELECT status FROM series_almoxarifado WHERE id = ?', [series[1].id]);
    assert.strictEqual(antes1.status, 'ENTREGUE');
    assert.strictEqual(antes2.status, 'ENTREGUE');

    const est = await request(app).post(`/api/almoxarifado/movimentacoes/${sai.body.id}/cancelar`)
      .send({ motivo: 'devolucao — estorno de saida' });
    assert.strictEqual(est.status, 200, JSON.stringify(est.body));

    const depois1 = await dbGet(db, 'SELECT status, movimentacao_saida_id FROM series_almoxarifado WHERE id = ?', [series[0].id]);
    const depois2 = await dbGet(db, 'SELECT status, movimentacao_saida_id FROM series_almoxarifado WHERE id = ?', [series[1].id]);
    assert.strictEqual(depois1.status, 'EM_ESTOQUE');
    assert.strictEqual(depois2.status, 'EM_ESTOQUE');
    assert.strictEqual(depois1.movimentacao_saida_id, null, 'vinculo com a saida estornada devia ter sido limpo');

    await assertInvarianteSerie(db, mat);
  });

  await test('estorno de entrada marca ESTORNADA', async () => {
    const mat = await novoMaterial(db);
    const { movId, series } = await entrarComSeries(app, db, mat, ['SN-ENT-1', 'SN-ENT-2']);

    const est = await request(app).post(`/api/almoxarifado/movimentacoes/${movId}/cancelar`)
      .send({ motivo: 'entrada errada' });
    assert.strictEqual(est.status, 200, JSON.stringify(est.body));

    const s1 = await dbGet(db, 'SELECT status FROM series_almoxarifado WHERE id = ?', [series[0].id]);
    const s2 = await dbGet(db, 'SELECT status FROM series_almoxarifado WHERE id = ?', [series[1].id]);
    assert.strictEqual(s1.status, 'ESTORNADA');
    assert.strictEqual(s2.status, 'ESTORNADA');

    await assertInvarianteSerie(db, mat);
  });

  await test('estorno de entrada com serie ja movimentada e recusado', async () => {
    const mat = await novoMaterial(db);
    const { movId, series } = await entrarComSeries(app, db, mat, ['SN-MOV-1', 'SN-MOV-2']);

    const sai = await request(app).post('/api/almoxarifado/movimentacoes/v2')
      .send({
        material_id: mat, tipo: 'SAIDA', quantidade: 1,
        serie_ids: [series[0].id], justificativa: 'ja saiu uma das duas',
      });
    assert.strictEqual(sai.status, 201, JSON.stringify(sai.body));

    const est = await request(app).post(`/api/almoxarifado/movimentacoes/${movId}/cancelar`)
      .send({ motivo: 'tentando estornar a entrada inteira' });
    assert.strictEqual(est.status, 400, JSON.stringify(est.body));
    assert.ok(/series ja movimentadas|ha series desta entrada ja movimentadas/.test(est.body.error || ''),
      `mensagem inesperada: ${JSON.stringify(est.body)}`);

    // nada deve ter mudado: a movimentacao original nao pode ficar marcada como cancelada,
    // a serie que saiu continua ENTREGUE, a que ficou continua EM_ESTOQUE
    const movOriginal = await dbGet(db, 'SELECT cancelado FROM movimentacoes_almoxarifado WHERE id = ?', [movId]);
    assert.strictEqual(movOriginal.cancelado, 0, 'claim nao devia ter sido feito — a recusa e antes dele');
    const s1 = await dbGet(db, 'SELECT status FROM series_almoxarifado WHERE id = ?', [series[0].id]);
    const s2 = await dbGet(db, 'SELECT status FROM series_almoxarifado WHERE id = ?', [series[1].id]);
    assert.strictEqual(s1.status, 'ENTREGUE');
    assert.strictEqual(s2.status, 'EM_ESTOQUE');

    await assertInvarianteSerie(db, mat);
  });

  await test('reentrada manual de serie ENTREGUE reativa (fluxo de devolucao via tela)', async () => {
    const mat = await novoMaterial(db);
    const { series } = await entrarComSeries(app, db, mat, ['SN-REAT-1']);

    const sai = await request(app).post('/api/almoxarifado/movimentacoes/v2')
      .send({
        material_id: mat, tipo: 'SAIDA', quantidade: 1,
        serie_ids: [series[0].id], justificativa: 'entregue ao tecnico',
      });
    assert.strictEqual(sai.status, 201, JSON.stringify(sai.body));
    const entregue = await dbGet(db, 'SELECT status FROM series_almoxarifado WHERE id = ?', [series[0].id]);
    assert.strictEqual(entregue.status, 'ENTREGUE');

    // reentrada manual: NAO e um estorno, e uma nova ENTRADA v2 citando o mesmo numero de serie
    // (a tela de devolucao usa este caminho quando o tecnico devolve fisicamente o item).
    const reent = await request(app).post('/api/almoxarifado/movimentacoes/v2')
      .send({ material_id: mat, tipo: 'ENTRADA', quantidade: 1, motivo: 'devolucao do tecnico', series: ['SN-REAT-1'] });
    assert.strictEqual(reent.status, 201, JSON.stringify(reent.body));

    const reativada = await dbGet(db, 'SELECT status, movimentacao_entrada_id, movimentacao_saida_id FROM series_almoxarifado WHERE id = ?', [series[0].id]);
    assert.strictEqual(reativada.status, 'EM_ESTOQUE');
    assert.strictEqual(reativada.movimentacao_entrada_id, reent.body.id);

    await assertInvarianteSerie(db, mat);
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
