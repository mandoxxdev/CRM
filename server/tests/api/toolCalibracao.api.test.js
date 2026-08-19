/**
 * Etapa 9b, Task 3 — Calibracao: registrar (multipart), listar, painel de vencimento.
 *
 * Executar: cd server && node tests/api/toolCalibracao.api.test.js
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbAll, dbGet } = require('../../services/almoxarifado/db');

const PRODUCAO_FALLBACK = { id: 50, nome: 'Chão de Fábrica', role: 'usuario', email: 'prod@test.com' };

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

let seq = 0;
async function novaFerramenta(db, extra = {}) {
  seq += 1;
  const r = await dbRun(db, `INSERT INTO ferramentas_almoxarifado
    (codigo_patrimonio, nome, status, exige_calibracao) VALUES (?,?,?,?)`,
    [`FER-CAL-${seq}`, `Ferramenta ${seq}`, extra.status || 'DISPONIVEL', extra.exige_calibracao || 0]);
  return r.lastID;
}

(async () => {
  await test('RN-08: registrar calibracao vigente torna a ferramenta emprestavel de novo', async () => {
    const { app, db, close } = await createTestApp();
    const fid = await novaFerramenta(db, { exige_calibracao: 1 });

    // sem calibracao alguma -> RN-03 barra
    await request(app).post(`/api/almoxarifado/ferramentas/${fid}/emprestar`)
      .send({ colaborador_nome: 'Joao' }).expect(400);

    // registra calibracao com validade futura via multipart
    const post = await request(app).post(`/api/almoxarifado/ferramentas/${fid}/calibracoes`)
      .field('data_calibracao', '2026-01-01')
      .field('data_validade', '2030-01-01')
      .expect(201);
    assert.ok(post.body.id, 'esperava {id} no 201');

    // agora empresta
    await request(app).post(`/api/almoxarifado/ferramentas/${fid}/emprestar`)
      .send({ colaborador_nome: 'Joao' }).expect(201);
    await close();
  });

  await test('validade <= calibracao recusa com a mensagem literal do contrato', async () => {
    const { app, db, close } = await createTestApp();
    const fid = await novaFerramenta(db);

    const r = await request(app).post(`/api/almoxarifado/ferramentas/${fid}/calibracoes`)
      .field('data_calibracao', '2026-05-01')
      .field('data_validade', '2026-05-01')
      .expect(400);
    assert.strictEqual(r.body.error, 'Data de validade deve ser posterior à data de calibração');

    const r2 = await request(app).post(`/api/almoxarifado/ferramentas/${fid}/calibracoes`)
      .field('data_calibracao', '2026-05-01')
      .field('data_validade', '2026-04-01')
      .expect(400);
    assert.strictEqual(r2.body.error, 'Data de validade deve ser posterior à data de calibração');
    await close();
  });

  await test('POST com certificado grava certificado_path e o arquivo existe em uploadsAlmoxDir', async () => {
    const { app, db, close, uploadsAlmoxDir } = await createTestApp();
    const fid = await novaFerramenta(db);

    const r = await request(app).post(`/api/almoxarifado/ferramentas/${fid}/calibracoes`)
      .field('data_calibracao', '2026-01-01')
      .field('data_validade', '2030-01-01')
      .attach('certificado', Buffer.from('%PDF-1.4'), 'cert.pdf')
      .expect(201);

    const row = await dbGet(db, 'SELECT certificado_path FROM calibracoes_ferramenta_almoxarifado WHERE id = ?', [r.body.id]);
    assert.ok(row.certificado_path, 'certificado_path deveria ter sido gravado');
    const arquivo = path.join(uploadsAlmoxDir, row.certificado_path);
    assert.ok(fs.existsSync(arquivo), `arquivo nao encontrado em ${arquivo}`);
    assert.ok(/^calibracao-/.test(row.certificado_path), `filename deveria comecar com calibracao-, veio ${row.certificado_path}`);
    await close();
  });

  await test('GET /ferramentas/:id/calibracoes lista o historico', async () => {
    const { app, db, close } = await createTestApp();
    const fid = await novaFerramenta(db);
    await request(app).post(`/api/almoxarifado/ferramentas/${fid}/calibracoes`)
      .field('data_calibracao', '2026-01-01').field('data_validade', '2030-01-01').expect(201);
    await request(app).post(`/api/almoxarifado/ferramentas/${fid}/calibracoes`)
      .field('data_calibracao', '2026-02-01').field('data_validade', '2030-02-01').expect(201);

    const r = await request(app).get(`/api/almoxarifado/ferramentas/${fid}/calibracoes`).expect(200);
    assert.strictEqual(r.body.length, 2, `esperava 2 registros, veio ${r.body.length}`);
    await close();
  });

  await test('painel separa vencidas de a_vencer respeitando ?dias', async () => {
    const { app, db, close } = await createTestApp();
    const vencida = await novaFerramenta(db, { exige_calibracao: 1 });
    const aVencer = await novaFerramenta(db, { exige_calibracao: 1 });
    // ferramenta que nao exige calibracao NAO deve aparecer, mesmo com calibracao vencida
    const naoExige = await novaFerramenta(db, { exige_calibracao: 0 });

    await dbRun(db, `INSERT INTO calibracoes_ferramenta_almoxarifado
      (ferramenta_id, data_calibracao, data_validade) VALUES (?, date('now','-2 years'), date('now','-1 day'))`, [vencida]);
    await dbRun(db, `INSERT INTO calibracoes_ferramenta_almoxarifado
      (ferramenta_id, data_calibracao, data_validade) VALUES (?, date('now','-1 year'), date('now','+10 days'))`, [aVencer]);
    await dbRun(db, `INSERT INTO calibracoes_ferramenta_almoxarifado
      (ferramenta_id, data_calibracao, data_validade) VALUES (?, date('now','-2 years'), date('now','-1 day'))`, [naoExige]);

    const r30 = await request(app).get('/api/almoxarifado/calibracoes/painel?dias=30').expect(200);
    const vencidasIds30 = r30.body.vencidas.map(i => i.id);
    const aVencerIds30 = r30.body.a_vencer.map(i => i.id);
    assert.ok(vencidasIds30.includes(vencida), `vencida ausente de vencidas: ${JSON.stringify(r30.body.vencidas)}`);
    assert.ok(aVencerIds30.includes(aVencer), `a_vencer ausente: ${JSON.stringify(r30.body.a_vencer)}`);
    assert.ok(!vencidasIds30.includes(naoExige) && !aVencerIds30.includes(naoExige), 'ferramenta sem exige_calibracao vazou no painel');

    const item = r30.body.a_vencer.find(i => i.id === aVencer);
    assert.ok(item.codigo_patrimonio && item.nome && item.data_validade, `item incompleto: ${JSON.stringify(item)}`);
    assert.strictEqual(item.dias_restantes, 10, `dias_restantes esperado 10, veio ${item.dias_restantes}`);

    const r5 = await request(app).get('/api/almoxarifado/calibracoes/painel?dias=5').expect(200);
    const aVencerIds5 = r5.body.a_vencer.map(i => i.id);
    assert.ok(!aVencerIds5.includes(aVencer), 'ferramenta a vencer em 10 dias apareceu com ?dias=5');
    assert.ok(r5.body.vencidas.map(i => i.id).includes(vencida), 'vencida some do painel com dias=5 — vencida independe de dias');
    await close();
  });

  await test('painel: exige_calibracao=1 sem NENHUMA calibracao aparece em vencidas com data_validade null', async () => {
    const { app, db, close } = await createTestApp();
    const nuncaCalibrada = await novaFerramenta(db, { exige_calibracao: 1 });
    // controle positivo: sem exige_calibracao e sem registro nao aparece em lugar nenhum
    const semExigenciaSemRegistro = await novaFerramenta(db, { exige_calibracao: 0 });

    const r = await request(app).get('/api/almoxarifado/calibracoes/painel?dias=30').expect(200);
    const item = r.body.vencidas.find(i => i.id === nuncaCalibrada);
    assert.ok(item, `ferramenta exige_calibracao=1 sem historico ausente de vencidas: ${JSON.stringify(r.body.vencidas)}`);
    assert.strictEqual(item.data_validade, null, `data_validade esperado null, veio ${item.data_validade}`);
    assert.strictEqual(item.dias_restantes, null, `dias_restantes esperado null, veio ${item.dias_restantes}`);
    assert.ok(!r.body.a_vencer.map(i => i.id).includes(nuncaCalibrada), 'nunca-calibrada vazou em a_vencer');

    const idsTodos = [...r.body.vencidas, ...r.body.a_vencer].map(i => i.id);
    assert.ok(!idsTodos.includes(semExigenciaSemRegistro),
      'ferramenta sem exige_calibracao e sem registro apareceu no painel');
    await close();
  });

  await test('PRODUCAO -> 403 no POST sem gravar arquivo orfao; 200 no GET', async () => {
    const { app, db, close, setUser, uploadsAlmoxDir } = await createTestApp();
    const fid = await novaFerramenta(db);
    const arquivosAntes = fs.readdirSync(uploadsAlmoxDir).length;

    setUser(PRODUCAO_FALLBACK);
    const r = await request(app).post(`/api/almoxarifado/ferramentas/${fid}/calibracoes`)
      .field('data_calibracao', '2026-01-01')
      .field('data_validade', '2030-01-01')
      .attach('certificado', Buffer.from('%PDF-1.4'), 'cert.pdf')
      .expect(403);
    assert.strictEqual(fs.readdirSync(uploadsAlmoxDir).length, arquivosAntes,
      'multer gravou arquivo antes do 403 — requirePermission deve vir ANTES do multer');

    await request(app).get(`/api/almoxarifado/ferramentas/${fid}/calibracoes`).expect(200);
    await close();
  });

  await test('POST audita CALIBRACAO', async () => {
    const { app, db, close } = await createTestApp();
    const fid = await novaFerramenta(db);
    await request(app).post(`/api/almoxarifado/ferramentas/${fid}/calibracoes`)
      .field('data_calibracao', '2026-01-01').field('data_validade', '2030-01-01').expect(201);

    const audit = await dbAll(db,
      "SELECT acao FROM auditoria_log_almoxarifado WHERE entidade = 'ferramenta' AND entidade_id = ?", [fid]);
    assert.ok(audit.map(a => a.acao).includes('CALIBRACAO'), `sem auditoria de calibracao: ${JSON.stringify(audit)}`);
    await close();
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
