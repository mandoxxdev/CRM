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
  const { app, db, close, setUser } = await createTestApp({ user: ADMIN });

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

    // Testa com user PRODUCAO (sem permissao inspecionar) — padrão: setUser sem criar novo app
    const PRODUCAO = { id: 9, nome: 'Producao', perfil_almoxarifado: 'PRODUCAO' };
    setUser(PRODUCAO);
    try {
      const res403 = await request(app).put(`/api/almoxarifado/series/${serieId}/status`)
        .send({ status: 'BLOQUEADA', justificativa: 'teste' });
      assert.strictEqual(res403.status, 403, `esperava 403 com user PRODUCAO, got ${res403.status}`);
    } finally {
      setUser(ADMIN);
    }
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

    // Race condition real: duas mudancas para o mesmo status leem EM_ESTOQUE antes dos UPDATEs
    // Uma vence na guarda (UPDATE com AND status = ?), a outra cai em 409
    const results = await Promise.allSettled([
      seriesService.mudarStatusSerie(db, ADMIN, serieId, 'BLOQUEADA', 'corrida 1'),
      seriesService.mudarStatusSerie(db, ADMIN, serieId, 'BLOQUEADA', 'corrida 2')
    ]);
    const fulfilled = results.filter(r => r.status === 'fulfilled').length;
    const rejected = results.filter(r => r.status === 'rejected').length;
    assert.strictEqual(fulfilled, 1, `race condition: esperava 1 fulfilled, got ${fulfilled}`);
    assert.strictEqual(rejected, 1, `race condition: esperava 1 rejected, got ${rejected}`);
    const error = results.find(r => r.status === 'rejected')?.reason;
    assert.strictEqual(error?.status, 409, `rejected deveria ser 409, got ${error?.status}`);
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
