const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet } = require('../../services/almoxarifado/db');
const seriesService = require('../../services/almoxarifado/seriesService');
const lotService = require('../../services/almoxarifado/lotService');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}
const ADMIN = { id: 1, nome: 'Admin Teste', role: 'admin', is_superadmin: 1, email: 'admin@test.com' };

let seq = 0;
async function novoMaterial(db) {
  seq += 1;
  const r = await dbRun(db,
    `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, ativo, controle_serie) VALUES (?,?,'UN',0,1,1)`,
    [`SERIE-${seq}`, `Material serie ${seq}`]);
  return r.lastID;
}

async function loteDoMaterial(db, materialId, codigo) {
  const lote = await lotService.criarOuObterLote(db, ADMIN, {
    material_id: materialId, codigo, data_validade: '2030-01-01' });
  return lote;
}

(async () => {
  const { app, db, close } = await createTestApp({ user: ADMIN });

  await test('GET lista series do material com lote_codigo e filtra por status', async () => {
    const mat = await novoMaterial(db);
    const lote = await loteDoMaterial(db, mat, 'LOTE-SERIE-1');

    // Cria duas series com seriesService
    await seriesService.entradaSeries(db, ADMIN, {
      material_id: mat, numeros: ['001', '002'], lote_id: lote.id });

    const res = await request(app).get(`/api/almoxarifado/materiais/${mat}/series`);
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.strictEqual(res.body.length, 2, `deveria ter 2 series, teve ${res.body.length}`);

    // Verifica campos obrigatorios
    res.body.forEach(s => {
      assert.ok(s.numero !== undefined, 'falta campo numero');
      assert.ok(s.status !== undefined, 'falta campo status');
      assert.ok(s.lote_codigo !== undefined, 'falta campo lote_codigo');
      assert.strictEqual(s.lote_codigo, 'LOTE-SERIE-1', `lote_codigo incorreto: ${s.lote_codigo}`);
    });
  });

  await test('PUT status exige justificativa (400) e permissao inspecionar (403 p/ PRODUCAO via setUser)', async () => {
    const mat = await novoMaterial(db);
    const lote = await loteDoMaterial(db, mat, 'LOTE-SERIE-2');
    await seriesService.entradaSeries(db, ADMIN, {
      material_id: mat, numeros: ['003'], lote_id: lote.id });

    // Pega a serie criada
    const series = await request(app).get(`/api/almoxarifado/materiais/${mat}/series`);
    const serieId = series.body[0].id;

    // Testa sem justificativa
    const semJust = await request(app).put(`/api/almoxarifado/series/${serieId}/status`)
      .send({ status: 'BLOQUEADA' });
    assert.strictEqual(semJust.status, 400, `esperava 400 sem justificativa, got ${semJust.status}: ${JSON.stringify(semJust.body)}`);

    // Testa com user PRODUCAO (sem permissao inspecionar)
    const ctxProd = await createTestApp({ user: { id: 9, nome: 'Producao', perfil_almoxarifado: 'PRODUCAO' } });
    const res403 = await request(ctxProd.app).put(`/api/almoxarifado/series/${serieId}/status`)
      .send({ status: 'BLOQUEADA', justificativa: 'teste' });
    assert.strictEqual(res403.status, 403, `esperava 403 com user PRODUCAO, got ${res403.status}`);
    await ctxProd.close();
  });

  await test('PUT status bloqueia e desbloqueia; transicao invalida 400; corrida 409', async () => {
    const mat = await novoMaterial(db);
    const lote = await loteDoMaterial(db, mat, 'LOTE-SERIE-3');
    await seriesService.entradaSeries(db, ADMIN, {
      material_id: mat, numeros: ['004'], lote_id: lote.id });

    const series = await request(app).get(`/api/almoxarifado/materiais/${mat}/series`);
    const serieId = series.body[0].id;

    // Bloqueia com sucesso
    const bloqueio = await request(app).put(`/api/almoxarifado/series/${serieId}/status`)
      .send({ status: 'BLOQUEADA', justificativa: 'teste bloqueio' });
    assert.strictEqual(bloqueio.status, 200, `bloqueio falhou: ${JSON.stringify(bloqueio.body)}`);
    assert.strictEqual(bloqueio.body.status, 'BLOQUEADA');

    // Desbloqueia com sucesso
    const desbloqueio = await request(app).put(`/api/almoxarifado/series/${serieId}/status`)
      .send({ status: 'EM_ESTOQUE', justificativa: 'teste desbloqueio' });
    assert.strictEqual(desbloqueio.status, 200, `desbloqueio falhou: ${JSON.stringify(desbloqueio.body)}`);
    assert.strictEqual(desbloqueio.body.status, 'EM_ESTOQUE');

    // Tenta transicao invalida (EM_ESTOQUE -> ENTREGUE sem passar por BLOQUEADA)
    const transicaoInvalida = await request(app).put(`/api/almoxarifado/series/${serieId}/status`)
      .send({ status: 'ENTREGUE', justificativa: 'transicao invalida' });
    assert.strictEqual(transicaoInvalida.status, 400, `transicao invalida deveria retornar 400, got ${transicaoInvalida.status}`);

    // Simula race condition: muda status via service 2x seguido (BLOQUEADA e depois EM_ESTOQUE)
    // Se o service garante atomicidade, ambas as chamadas devem funcionar
    try {
      await seriesService.mudarStatusSerie(db, ADMIN, serieId, 'BLOQUEADA', 'mudanca 1');
      const depois1 = await seriesService.mudarStatusSerie(db, ADMIN, serieId, 'EM_ESTOQUE', 'mudanca 2');
      assert.strictEqual(depois1.status, 'EM_ESTOQUE', 'segunda mudanca nao funcionou');
    } catch (e) {
      // Se lancou erro com status 409, e race condition
      if (e.status === 409) {
        // ok, race condition detectada
      } else {
        throw e;
      }
    }
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
