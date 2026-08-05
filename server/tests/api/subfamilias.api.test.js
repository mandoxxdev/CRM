const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbGet } = require('../../services/almoxarifado/db');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

async function criarFamilia(app, nome, overrides = {}) {
  const res = await request(app).post('/api/almoxarifado/familias').send({ nome, ...overrides });
  if (res.status !== 201) throw new Error(`Falha ao criar família ${nome}: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body;
}

async function criarMaterialReq(app, body) {
  return request(app).post('/api/almoxarifado/materiais').send(body);
}

(async () => {
  // Rotas de famílias (POST/PUT/DELETE) usam canConfigureAlmox — exige is_superadmin
  // (mesmo motivo do almoxarifados.api.test.js). Rotas de materiais aceitam o admin default.
  const { app, db, close } = await createTestApp({
    user: { id: 1, nome: 'Admin Teste', role: 'admin', is_superadmin: 1 },
  });

  let raizA, raizB, subA, subB;

  await test('POST família raiz sem parent_id → 201 com parent_id null', async () => {
    raizA = await criarFamilia(app, 'Fixadores');
    assert.strictEqual(raizA.parent_id, null);
  });

  await test('POST subfamília com parent_id de uma raiz → 201', async () => {
    subA = await criarFamilia(app, 'Parafusos Sextavados', { parent_id: raizA.id });
    assert.strictEqual(subA.parent_id, raizA.id);
  });

  await test('POST sub-subfamília (parent = subfamília) → 400 máximo 2 níveis', async () => {
    const res = await request(app).post('/api/almoxarifado/familias')
      .send({ nome: 'Neto Inválido', parent_id: subA.id });
    assert.strictEqual(res.status, 400, JSON.stringify(res.body));
    assert.ok(/2 n[íi]veis/i.test(res.body.error), `mensagem deveria citar máximo de 2 níveis: ${res.body.error}`);
  });

  await test('POST família com parent_id inexistente → 400', async () => {
    const res = await request(app).post('/api/almoxarifado/familias')
      .send({ nome: 'Órfã', parent_id: 999999 });
    assert.strictEqual(res.status, 400, JSON.stringify(res.body));
  });

  await test('POST família com parent_id de raiz inativa → 400', async () => {
    const raizInativa = await criarFamilia(app, 'Vai Inativar');
    const putRes = await request(app).put(`/api/almoxarifado/familias/${raizInativa.id}`).send({ nome: 'Vai Inativar', ativo: 0 });
    assert.strictEqual(putRes.status, 200, JSON.stringify(putRes.body));
    const res = await request(app).post('/api/almoxarifado/familias')
      .send({ nome: 'Filha de Inativa', parent_id: raizInativa.id });
    assert.strictEqual(res.status, 400, JSON.stringify(res.body));
  });

  await test('GET /familias retorna parent_id e parent_nome', async () => {
    const res = await request(app).get('/api/almoxarifado/familias?ativo=all');
    const linhaSub = res.body.find((f) => f.id === subA.id);
    assert.ok(linhaSub, 'subfamília deveria aparecer na lista');
    assert.strictEqual(linhaSub.parent_id, raizA.id);
    assert.strictEqual(linhaSub.parent_nome, raizA.nome);
    const linhaRaiz = res.body.find((f) => f.id === raizA.id);
    assert.strictEqual(linhaRaiz.parent_nome, null);
  });

  await test('PUT família não pode ser pai de si mesma → 400', async () => {
    const res = await request(app).put(`/api/almoxarifado/familias/${raizA.id}`)
      .send({ nome: raizA.nome, parent_id: raizA.id });
    assert.strictEqual(res.status, 400, JSON.stringify(res.body));
  });

  await test('PUT família com filhas ativas não pode virar subfamília → 400', async () => {
    raizB = await criarFamilia(app, 'Outra Raiz');
    // raizA já tem subA como filha ativa
    const res = await request(app).put(`/api/almoxarifado/familias/${raizA.id}`)
      .send({ nome: raizA.nome, parent_id: raizB.id });
    assert.strictEqual(res.status, 400, JSON.stringify(res.body));
  });

  await test('PUT inativar família com subfamília ativa → 400', async () => {
    const res = await request(app).put(`/api/almoxarifado/familias/${raizA.id}`)
      .send({ nome: raizA.nome, ativo: 0 });
    assert.strictEqual(res.status, 400, JSON.stringify(res.body));
  });

  await test('DELETE família com subfamília ativa → 400', async () => {
    const res = await request(app).delete(`/api/almoxarifado/familias/${raizA.id}`);
    assert.strictEqual(res.status, 400, JSON.stringify(res.body));
  });

  await test('PUT subfamília válida (mantém parent_id de raiz ativa) → 200', async () => {
    const res = await request(app).put(`/api/almoxarifado/familias/${subA.id}`)
      .send({ nome: subA.nome, parent_id: raizA.id });
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.strictEqual(res.body.parent_id, raizA.id);
  });

  await test('setup: raizB ganha subfamília subB', async () => {
    subB = await criarFamilia(app, 'Filha de B', { parent_id: raizB.id });
    assert.strictEqual(subB.parent_id, raizB.id);
  });

  await test('POST material com familia A + subfamília de B → 400', async () => {
    const res = await criarMaterialReq(app, {
      codigo: 'MAT-SUB-001', nome: 'Material errado', familia_id: raizA.id, subfamilia_id: subB.id,
    });
    assert.strictEqual(res.status, 400, JSON.stringify(res.body));
    assert.ok(/[Ss]ubfam[íi]lia inv[áa]lida/.test(res.body.error), `mensagem deveria citar subfamília inválida: ${res.body.error}`);
  });

  await test('POST material com subfamília correta → 201 e coluna persistida', async () => {
    const res = await criarMaterialReq(app, {
      codigo: 'MAT-SUB-002', nome: 'Material certo', familia_id: raizA.id, subfamilia_id: subA.id,
    });
    assert.strictEqual(res.status, 201, JSON.stringify(res.body));
    assert.strictEqual(res.body.subfamilia_id, subA.id);
    const row = await dbGet(db, 'SELECT subfamilia_id FROM materiais_almoxarifado WHERE id = ?', [res.body.id]);
    assert.strictEqual(row.subfamilia_id, subA.id, 'coluna deveria estar persistida no banco');
  });

  await test('POST material com familia raiz + subfamília raiz (não filha) → 400', async () => {
    const res = await criarMaterialReq(app, {
      codigo: 'MAT-SUB-003', nome: 'Material com raiz como subfamília', familia_id: raizA.id, subfamilia_id: raizB.id,
    });
    assert.strictEqual(res.status, 400, JSON.stringify(res.body));
  });

  await test('PUT material trocando para subfamília inválida → 400; para válida → 200 persistido', async () => {
    const criado = await criarMaterialReq(app, {
      codigo: 'MAT-SUB-004', nome: 'Material para editar', familia_id: raizA.id,
    });
    assert.strictEqual(criado.status, 201, JSON.stringify(criado.body));

    const putInvalido = await request(app).put(`/api/almoxarifado/materiais/${criado.body.id}`)
      .send({ codigo: 'MAT-SUB-004', nome: 'Material para editar', familia_id: raizA.id, subfamilia_id: subB.id });
    assert.strictEqual(putInvalido.status, 400, JSON.stringify(putInvalido.body));

    const putValido = await request(app).put(`/api/almoxarifado/materiais/${criado.body.id}`)
      .send({ codigo: 'MAT-SUB-004', nome: 'Material para editar', familia_id: raizA.id, subfamilia_id: subA.id });
    assert.strictEqual(putValido.status, 200, JSON.stringify(putValido.body));
    assert.strictEqual(putValido.body.subfamilia_id, subA.id);
    const row = await dbGet(db, 'SELECT subfamilia_id FROM materiais_almoxarifado WHERE id = ?', [criado.body.id]);
    assert.strictEqual(row.subfamilia_id, subA.id);
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
