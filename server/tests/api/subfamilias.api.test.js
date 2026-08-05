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

  // ── Fix pós-review: PUT full-replace preservando parent_id/subfamilia_id omitidos
  // (mesma proteção já aplicada em localizações na Task 2) — as telas reais mandam PUT sem
  // esses campos, então "omitido" precisa preservar, não colapsar para NULL. ──

  await test('PUT em subfamília no formato da UI (sem parent_id) preserva o vínculo com a raiz', async () => {
    const raiz = await criarFamilia(app, 'Raiz PUT-UI');
    const sub = await criarFamilia(app, 'Sub PUT-UI', { parent_id: raiz.id });

    // Corpo IDÊNTICO ao que handleSalvar (ConfiguracoesAlmoxarifado.js:489-493) manda hoje:
    // {nome, descricao, tipo_uso} — nunca inclui parent_id.
    const res = await request(app).put(`/api/almoxarifado/familias/${sub.id}`)
      .send({ nome: sub.nome, descricao: sub.descricao, tipo_uso: sub.tipo_uso });
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.strictEqual(res.body.parent_id, raiz.id, 'parent_id deveria ter sido preservado (PUT da UI não manda o campo)');
  });

  await test('PUT em família com parent_id:null explícito converte subfamília em raiz', async () => {
    const raiz = await criarFamilia(app, 'Raiz PUT-NULL');
    const sub = await criarFamilia(app, 'Sub PUT-NULL', { parent_id: raiz.id });

    const res = await request(app).put(`/api/almoxarifado/familias/${sub.id}`)
      .send({ nome: sub.nome, parent_id: null });
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.strictEqual(res.body.parent_id, null, 'parent_id null explícito deveria limpar o vínculo (virar raiz)');
  });

  await test('PUT de material no formato da UI (sem subfamilia_id) preserva o vínculo com a subfamília', async () => {
    const raiz = await criarFamilia(app, 'Raiz Mat PUT-UI');
    const sub = await criarFamilia(app, 'Sub Mat PUT-UI', { parent_id: raiz.id });
    const criado = await criarMaterialReq(app, {
      codigo: 'MAT-SUB-005', nome: 'Material preservar sub', familia_id: raiz.id, subfamilia_id: sub.id,
    });
    assert.strictEqual(criado.status, 201, JSON.stringify(criado.body));

    // Corpo no formato que MaterialAlmoxarifadoForm.js manda hoje: o form nunca carregou
    // subfamilia_id no state (nem em loadMaterial, nem no payload do handleSubmit), então a
    // chave simplesmente não existe no body.
    const res = await request(app).put(`/api/almoxarifado/materiais/${criado.body.id}`)
      .send({ codigo: 'MAT-SUB-005', nome: 'Material renomeado', familia_id: raiz.id });
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.strictEqual(res.body.subfamilia_id, sub.id, 'subfamilia_id deveria ter sido preservado (PUT da UI não manda o campo)');
    const row = await dbGet(db, 'SELECT subfamilia_id FROM materiais_almoxarifado WHERE id = ?', [criado.body.id]);
    assert.strictEqual(row.subfamilia_id, sub.id);
  });

  await test('PUT de material com subfamilia_id:null explícito limpa o vínculo', async () => {
    const raiz = await criarFamilia(app, 'Raiz Mat PUT-NULL');
    const sub = await criarFamilia(app, 'Sub Mat PUT-NULL', { parent_id: raiz.id });
    const criado = await criarMaterialReq(app, {
      codigo: 'MAT-SUB-006', nome: 'Material limpar sub', familia_id: raiz.id, subfamilia_id: sub.id,
    });
    assert.strictEqual(criado.status, 201, JSON.stringify(criado.body));

    const res = await request(app).put(`/api/almoxarifado/materiais/${criado.body.id}`)
      .send({ codigo: 'MAT-SUB-006', nome: 'Material limpar sub', familia_id: raiz.id, subfamilia_id: null });
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.strictEqual(res.body.subfamilia_id, null, 'subfamilia_id null explícito deveria limpar o vínculo');
    const row = await dbGet(db, 'SELECT subfamilia_id FROM materiais_almoxarifado WHERE id = ?', [criado.body.id]);
    assert.strictEqual(row.subfamilia_id, null);
  });

  // ── Fix pós-review final Etapa 2: PUT /familias preservando ativo/categoria_id omitidos
  // (mesma classe do fix de parent_id acima) — a aba Famílias manda PUT só com
  // {nome, descricao, tipo_uso}, então "omitido" precisa preservar, não colapsar para o
  // default do handler (ativo=1 reativa; categoria_id=null apaga o vínculo). ──

  await test('PUT estilo UI ({nome, descricao, tipo_uso}) em família inativa com categoria_id preserva ambos', async () => {
    const categoria = await dbGet(db, 'SELECT id FROM categorias_material_almoxarifado LIMIT 1');
    assert.ok(categoria, 'seed deveria ter ao menos uma categoria');

    const familia = await criarFamilia(app, 'Raiz Preserva Ativo/Categoria', { categoria_id: categoria.id });
    assert.strictEqual(familia.categoria_id, categoria.id);

    const inativou = await request(app).put(`/api/almoxarifado/familias/${familia.id}`)
      .send({ nome: familia.nome, ativo: 0 });
    assert.strictEqual(inativou.status, 200, JSON.stringify(inativou.body));
    assert.strictEqual(Number(inativou.body.ativo), 0);

    // Corpo IDÊNTICO ao que handleSalvar (ConfiguracoesAlmoxarifado.js) manda hoje — sem
    // ativo, sem categoria_id.
    const res = await request(app).put(`/api/almoxarifado/familias/${familia.id}`)
      .send({ nome: familia.nome, descricao: familia.descricao, tipo_uso: familia.tipo_uso });
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.strictEqual(Number(res.body.ativo), 0, 'ativo deveria continuar inativo (PUT da UI não manda o campo)');
    assert.strictEqual(res.body.categoria_id, categoria.id, 'categoria_id deveria ter sido preservado (PUT da UI não manda o campo)');
  });

  await test('PUT com ativo:1 explícito reativa família inativa', async () => {
    const familia = await criarFamilia(app, 'Raiz Reativa Explicito');
    const inativou = await request(app).put(`/api/almoxarifado/familias/${familia.id}`)
      .send({ nome: familia.nome, ativo: 0 });
    assert.strictEqual(inativou.status, 200, JSON.stringify(inativou.body));
    assert.strictEqual(Number(inativou.body.ativo), 0);

    const res = await request(app).put(`/api/almoxarifado/familias/${familia.id}`)
      .send({ nome: familia.nome, ativo: 1 });
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.strictEqual(Number(res.body.ativo), 1, 'ativo:1 explícito deveria reativar a família');
  });

  await test('PUT com categoria_id:null explícito limpa o vínculo com a categoria', async () => {
    const categoria = await dbGet(db, 'SELECT id FROM categorias_material_almoxarifado LIMIT 1');
    const familia = await criarFamilia(app, 'Raiz Limpa Categoria', { categoria_id: categoria.id });
    assert.strictEqual(familia.categoria_id, categoria.id);

    const res = await request(app).put(`/api/almoxarifado/familias/${familia.id}`)
      .send({ nome: familia.nome, categoria_id: null });
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.strictEqual(res.body.categoria_id, null, 'categoria_id:null explícito deveria limpar o vínculo');
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
