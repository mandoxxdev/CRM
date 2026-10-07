const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbGet, dbRun } = require('../../services/almoxarifado/db');

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

  // ── Etapa 37 (T1): contagens, itens, filtro e DELETE honestos para subfamília.
  // O material grava familia_id = raiz e subfamilia_id = filha; antes desta etapa a sub
  // aparecia com 0 itens, expandia vazia, o filtro ?subfamilia_id= era ignorado e o DELETE
  // da sub com itens passava (tornando os materiais dela ineditáveis). Raiz e sub PRÓPRIAS —
  // subA já tem 2 materiais a esta altura do arquivo. ──

  let raiz37, sub37, outraSub37, mat37, matSemSub37;

  await test('E37 setup: raiz, duas subs e material com familia_id=raiz + subfamilia_id=sub', async () => {
    raiz37 = await criarFamilia(app, 'Raiz E37');
    sub37 = await criarFamilia(app, 'Sub E37', { parent_id: raiz37.id });
    outraSub37 = await criarFamilia(app, 'Outra Sub E37', { parent_id: raiz37.id });
    const res = await criarMaterialReq(app, {
      codigo: 'MAT-E37-001', nome: 'Material da sub E37', familia_id: raiz37.id, subfamilia_id: sub37.id,
    });
    assert.strictEqual(res.status, 201, JSON.stringify(res.body));
    mat37 = res.body;
    const row = await dbGet(db, 'SELECT familia_id, subfamilia_id FROM materiais_almoxarifado WHERE id = ?', [mat37.id]);
    assert.strictEqual(row.familia_id, raiz37.id, 'material deveria gravar familia_id = raiz');
    assert.strictEqual(row.subfamilia_id, sub37.id, 'material deveria gravar subfamilia_id = sub');
  });

  await test('E37 (a) GET /familias: qtd_itens = 1 na raiz E na subfamília', async () => {
    const res = await request(app).get('/api/almoxarifado/familias');
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    const linhaRaiz = res.body.find((f) => f.id === raiz37.id);
    const linhaSub = res.body.find((f) => f.id === sub37.id);
    assert.ok(linhaRaiz && linhaSub, 'raiz e sub deveriam estar na lista');
    assert.strictEqual(Number(linhaRaiz.qtd_itens), 1, `qtd_itens da raiz deveria ser 1, veio ${linhaRaiz.qtd_itens}`);
    assert.strictEqual(Number(linhaSub.qtd_itens), 1, `qtd_itens da sub deveria ser 1, veio ${linhaSub.qtd_itens}`);
  });

  await test('E37 (a) GET /familias/:id da subfamília: qtd_itens = 1', async () => {
    const res = await request(app).get(`/api/almoxarifado/familias/${sub37.id}`);
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.strictEqual(Number(res.body.qtd_itens), 1, `qtd_itens da sub deveria ser 1, veio ${res.body.qtd_itens}`);
    const raizRes = await request(app).get(`/api/almoxarifado/familias/${raiz37.id}`);
    assert.strictEqual(Number(raizRes.body.qtd_itens), 1, `qtd_itens da raiz deveria ser 1, veio ${raizRes.body.qtd_itens}`);
  });

  await test('E37 (b) GET /familias/:id/itens da subfamília traz o material com familia_nome da raiz', async () => {
    const res = await request(app).get(`/api/almoxarifado/familias/${sub37.id}/itens`);
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.strictEqual(res.body.length, 1, `itens da sub deveria ter 1 material, veio ${res.body.length}`);
    assert.strictEqual(res.body[0].id, mat37.id);
    assert.strictEqual(res.body[0].familia_nome, raiz37.nome, 'familia_nome deveria ser o da raiz (JOIN por familia_id)');

    const raizRes = await request(app).get(`/api/almoxarifado/familias/${raiz37.id}/itens`);
    assert.strictEqual(raizRes.status, 200);
    assert.ok(raizRes.body.some((m) => m.id === mat37.id), 'itens da raiz deveria continuar trazendo o material da sub');
  });

  await test('E37 (c) GET /materiais?subfamilia_id=S traz só o material da sub; outra sub → vazio; combinado com familia_id idem', async () => {
    const res = await request(app).get(`/api/almoxarifado/materiais?subfamilia_id=${sub37.id}`);
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.strictEqual(res.body.length, 1, `?subfamilia_id=S deveria trazer 1, veio ${res.body.length}`);
    assert.strictEqual(res.body[0].id, mat37.id);

    const outra = await request(app).get(`/api/almoxarifado/materiais?subfamilia_id=${outraSub37.id}`);
    assert.strictEqual(outra.status, 200);
    assert.strictEqual(outra.body.length, 0, `?subfamilia_id=outra deveria vir vazio, veio ${outra.body.length}`);

    const combinado = await request(app).get(`/api/almoxarifado/materiais?familia_id=${raiz37.id}&subfamilia_id=${sub37.id}`);
    assert.strictEqual(combinado.status, 200);
    assert.strictEqual(combinado.body.length, 1, `familia_id=R&subfamilia_id=S deveria trazer 1, veio ${combinado.body.length}`);
    assert.strictEqual(combinado.body[0].id, mat37.id);

    const combinadoOutra = await request(app).get(`/api/almoxarifado/materiais?familia_id=${raiz37.id}&subfamilia_id=${outraSub37.id}`);
    assert.strictEqual(combinadoOutra.body.length, 0, 'familia_id=R&subfamilia_id=outra deveria vir vazio');
  });

  await test('E37 (d) material da raiz sem subfamília não entra na contagem da sub (mas entra na da raiz)', async () => {
    const res = await criarMaterialReq(app, {
      codigo: 'MAT-E37-002', nome: 'Material sem sub E37', familia_id: raiz37.id,
    });
    assert.strictEqual(res.status, 201, JSON.stringify(res.body));
    matSemSub37 = res.body;

    const lista = await request(app).get('/api/almoxarifado/familias');
    const linhaRaiz = lista.body.find((f) => f.id === raiz37.id);
    const linhaSub = lista.body.find((f) => f.id === sub37.id);
    assert.strictEqual(Number(linhaRaiz.qtd_itens), 2, `raiz deveria contar 2, veio ${linhaRaiz.qtd_itens}`);
    assert.strictEqual(Number(linhaSub.qtd_itens), 1, `sub deveria continuar com 1, veio ${linhaSub.qtd_itens}`);

    const itensSub = await request(app).get(`/api/almoxarifado/familias/${sub37.id}/itens`);
    assert.strictEqual(itensSub.body.length, 1, 'itens da sub não deveriam incluir o material sem sub');
    const filtro = await request(app).get(`/api/almoxarifado/materiais?subfamilia_id=${sub37.id}`);
    assert.strictEqual(filtro.body.length, 1, '?subfamilia_id=S não deveria incluir o material sem sub');
  });

  await test('E37 (e) DELETE /familias/S com material ativo → 400 "possui 1 item(ns) ativo(s)" e a sub continua ativa', async () => {
    const res = await request(app).delete(`/api/almoxarifado/familias/${sub37.id}`);
    assert.strictEqual(res.status, 400, `esperava 400, veio ${res.status} ${JSON.stringify(res.body)}`);
    assert.ok(/possui 1 item\(ns\) ativo\(s\)/.test(res.body.error), `literal esperada, veio: ${res.body.error}`);
    const row = await dbGet(db, 'SELECT ativo FROM familias_material_almoxarifado WHERE id = ?', [sub37.id]);
    assert.strictEqual(Number(row.ativo), 1, 'sub deveria continuar ativa');
  });

  await test('E37 (e) depois de inativar o material, DELETE /familias/S passa', async () => {
    const del = await request(app).delete(`/api/almoxarifado/materiais/${mat37.id}`);
    assert.strictEqual(del.status, 200, JSON.stringify(del.body));

    const lista = await request(app).get('/api/almoxarifado/familias');
    const linhaSub = lista.body.find((f) => f.id === sub37.id);
    assert.strictEqual(Number(linhaSub.qtd_itens), 0, 'material inativo não conta');

    const res = await request(app).delete(`/api/almoxarifado/familias/${sub37.id}`);
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    const row = await dbGet(db, 'SELECT ativo FROM familias_material_almoxarifado WHERE id = ?', [sub37.id]);
    assert.strictEqual(Number(row.ativo), 0, 'sub deveria ter sido inativada');
  });

  await test('[F1 revisão E37] PUT de material cuja subfamília foi INATIVADA depois (mesmo subfamilia_id) → 200; trocar para outra sub inativa → 400', async () => {
    const stamp = String(Date.now()).slice(-5);
    const raiz = await criarFamilia(app, 'Raiz F1 ' + stamp, { codigo: 'RF1' + stamp });
    const sub = await criarFamilia(app, 'Sub F1 ' + stamp, { parent_id: raiz.id });
    const outraSub = await criarFamilia(app, 'Outra Sub F1 ' + stamp, { parent_id: raiz.id });
    const criado = await criarMaterialReq(app, { codigo: 'MAT-F1-' + stamp, nome: 'Material F1', familia_id: raiz.id, subfamilia_id: sub.id, categoria: 'OUTROS', unidade: 'UN' });
    assert.strictEqual(criado.status, 201, JSON.stringify(criado.body));
    const matId = criado.body.id;
    // Simula o dado de ANTES da 37: a sub foi inativada com itens (o DELETE antigo deixava).
    await dbRun(db, 'UPDATE familias_material_almoxarifado SET ativo = 0 WHERE id = ?', [sub.id]);
    await dbRun(db, 'UPDATE familias_material_almoxarifado SET ativo = 0 WHERE id = ?', [outraSub.id]);
    // O form manda o MESMO subfamilia_id que leu: vinculo preservado, nao e valor novo -> 200.
    const mesma = await request(app).put('/api/almoxarifado/materiais/' + matId).send({ nome: 'Material F1 renomeado', familia_id: raiz.id, subfamilia_id: sub.id });
    assert.strictEqual(mesma.status, 200, 'PUT com a mesma sub (inativada depois) deveria passar: ' + JSON.stringify(mesma.body));
    const row = await dbGet(db, 'SELECT nome, subfamilia_id FROM materiais_almoxarifado WHERE id = ?', [matId]);
    assert.strictEqual(row.nome, 'Material F1 renomeado');
    assert.strictEqual(Number(row.subfamilia_id), Number(sub.id), 'o vinculo com a sub inativa e preservado, nao apagado');
    // Trocar para OUTRA sub inativa e valor novo -> continua recusado.
    const troca = await request(app).put('/api/almoxarifado/materiais/' + matId).send({ nome: 'x', familia_id: raiz.id, subfamilia_id: outraSub.id });
    assert.strictEqual(troca.status, 400, JSON.stringify(troca.body));
    assert.ok(/Subfamília inválida/.test(troca.body.error), troca.body.error);
    // Limpar (null) continua permitido.
    const limpa = await request(app).put('/api/almoxarifado/materiais/' + matId).send({ nome: 'x', familia_id: raiz.id, subfamilia_id: null });
    assert.strictEqual(limpa.status, 200, JSON.stringify(limpa.body));
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
