/**
 * Etapa 100 (G10) — subfamilia no lugar da familia: recusada em material NOVO, tolerada no LEGADO.
 *
 * A divida G10 (`docs/compras-novidades-por-etapa.md`): material gravado pela API com
 * `familia_id = <id de subfamilia>` (nenhuma tela faz isso) conta e lista na sub, nao na raiz, e o
 * filtro de Materiais nao o acha. A correcao recusa o valor NOVO; o que ja esta gravado assim nao
 * pode virar ineditavel (B47) — o PUT so revalida a familia quando ela MUDA.
 *
 * RN-100.05: POST (rota) e `createMaterial` (servico, o caminho de Sobras/Remessas) -> 400 L1.
 * RN-100.06: PUT mudando para sub -> 400 L1; PUT do legado omitindo ou repetindo -> 200; legado
 *            corrigido para raiz + sub -> 200.
 *
 * Executar: cd server && node tests/api/materialFamiliaSubfamilia.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet } = require('../../services/almoxarifado/db');
const materialService = require('../../services/almoxarifado/materialService');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}
const ADMIN = { id: 1, nome: 'Admin Teste', role: 'admin', is_superadmin: 1, email: 'admin@test.com' };

/** A literal do contrato, escrita AQUI por extenso: o teste nao pode aceitar qualquer texto que o servico exporte. */
const L1 = 'A família escolhida é uma subfamília — escolha a família principal e use a subfamília no campo Subfamília';

(async () => {
  const { app, db, close } = await createTestApp({ user: ADMIN });

  const FAM = (await dbRun(db,
    "INSERT INTO familias_material_almoxarifado (codigo, nome, ativo) VALUES ('G10','Familia raiz',1)")).lastID;
  const SUB = (await dbRun(db,
    "INSERT INTO familias_material_almoxarifado (codigo, nome, ativo, parent_id) VALUES ('G10-S','Sub da raiz',1,?)",
    [FAM])).lastID;
  const OUTRA = (await dbRun(db,
    "INSERT INTO familias_material_almoxarifado (codigo, nome, ativo) VALUES ('G10B','Outra raiz',1)")).lastID;
  const SUB_INATIVA = (await dbRun(db,
    "INSERT INTO familias_material_almoxarifado (codigo, nome, ativo, parent_id) VALUES ('G10-X','Sub inativa',0,?)",
    [FAM])).lastID;

  // LEGADO: gravado direto no banco, como a API de antes desta etapa aceitava.
  const LEGADO = (await dbRun(db,
    "INSERT INTO materiais_almoxarifado (codigo, nome, unidade, familia_id, ativo) VALUES ('LEG-1','Material legado',?,?,1)",
    ['UN', SUB])).lastID;

  const corpo = (over = {}) => ({ codigo: `G10-${Math.random().toString(36).slice(2, 8)}`, nome: 'Item G10', unidade: 'UN', ...over });

  await test('RN-100.05 POST com familia_id = subfamilia -> 400 com a literal que orienta; nada gravado', async () => {
    const antes = (await dbGet(db, 'SELECT COUNT(*) AS n FROM materiais_almoxarifado')).n;
    const r = await request(app).post('/api/almoxarifado/materiais').send(corpo({ familia_id: SUB }));
    assert.strictEqual(r.status, 400, `esperava 400: ${r.status} ${JSON.stringify(r.body)}`);
    assert.strictEqual(r.body.error, L1);
    const depois = (await dbGet(db, 'SELECT COUNT(*) AS n FROM materiais_almoxarifado')).n;
    assert.strictEqual(depois, antes, 'a recusa nao pode ter gravado material');
    // Sub INATIVA tambem cai na literal de subfamilia (a ordem do contrato: subfamilia antes de inativa).
    const r2 = await request(app).post('/api/almoxarifado/materiais').send(corpo({ familia_id: SUB_INATIVA }));
    assert.strictEqual(r2.status, 400);
    assert.strictEqual(r2.body.error, L1);
  });

  await test('RN-100.05 METADE POSITIVA: raiz + subfamilia no campo certo -> 201', async () => {
    const r = await request(app).post('/api/almoxarifado/materiais').send(corpo({ familia_id: FAM, subfamilia_id: SUB }));
    assert.strictEqual(r.status, 201, `raiz + sub tem de criar: ${r.status} ${JSON.stringify(r.body)}`);
    const row = await dbGet(db, 'SELECT familia_id, subfamilia_id FROM materiais_almoxarifado WHERE id = ?', [r.body.id]);
    assert.strictEqual(row.familia_id, FAM);
    assert.strictEqual(row.subfamilia_id, SUB);
  });

  await test('RN-100.05 pelo SERVICO (o caminho dos atalhos de Sobras/Remessas) -> status 400 e L1', async () => {
    let erro = null;
    try {
      await materialService.createMaterial(db, ADMIN, corpo({ familia_id: SUB }));
    } catch (e) { erro = e; }
    assert.ok(erro, 'createMaterial tem de recusar');
    assert.strictEqual(erro.status, 400);
    assert.strictEqual(erro.message, L1);
    assert.strictEqual(materialService.FAMILIA_E_SUBFAMILIA, L1, 'a constante exportada e a literal do contrato');
  });

  await test('RN-100.06 PUT que MUDA familia_id para uma subfamilia -> 400 L1; o gravado nao muda', async () => {
    const criado = await request(app).post('/api/almoxarifado/materiais').send(corpo({ familia_id: OUTRA }));
    assert.strictEqual(criado.status, 201);
    const r = await request(app).put(`/api/almoxarifado/materiais/${criado.body.id}`).send({ familia_id: SUB });
    assert.strictEqual(r.status, 400, `esperava 400: ${r.status} ${JSON.stringify(r.body)}`);
    assert.strictEqual(r.body.error, L1);
    const row = await dbGet(db, 'SELECT familia_id FROM materiais_almoxarifado WHERE id = ?', [criado.body.id]);
    assert.strictEqual(row.familia_id, OUTRA);
  });

  await test('RN-100.06 LEGADO (familia_id = sub) continua editavel: omitindo e repetindo o valor -> 200', async () => {
    const omitindo = await request(app).put(`/api/almoxarifado/materiais/${LEGADO}`).send({ nome: 'Legado renomeado' });
    assert.strictEqual(omitindo.status, 200, `omitindo familia_id: ${omitindo.status} ${JSON.stringify(omitindo.body)}`);
    // O formulario manda SEMPRE `familia_id` (o mesmo valor que leu).
    const repetindo = await request(app).put(`/api/almoxarifado/materiais/${LEGADO}`).send({ nome: 'Legado de novo', familia_id: SUB });
    assert.strictEqual(repetindo.status, 200, `repetindo familia_id: ${repetindo.status} ${JSON.stringify(repetindo.body)}`);
    const row = await dbGet(db, 'SELECT nome, familia_id FROM materiais_almoxarifado WHERE id = ?', [LEGADO]);
    assert.strictEqual(row.nome, 'Legado de novo');
    assert.strictEqual(row.familia_id, SUB, 'o legado nao e corrigido sozinho (B47)');
  });

  await test('RN-100.06 LEGADO corrigido pela tela: raiz + subfamilia -> 200 e gravado no padrao', async () => {
    const r = await request(app).put(`/api/almoxarifado/materiais/${LEGADO}`).send({ familia_id: FAM, subfamilia_id: SUB });
    assert.strictEqual(r.status, 200, `corrigir o legado: ${r.status} ${JSON.stringify(r.body)}`);
    const row = await dbGet(db, 'SELECT familia_id, subfamilia_id FROM materiais_almoxarifado WHERE id = ?', [LEGADO]);
    assert.strictEqual(row.familia_id, FAM);
    assert.strictEqual(row.subfamilia_id, SUB);
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
