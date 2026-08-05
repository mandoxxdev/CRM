const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbGet } = require('../../services/almoxarifado/db');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

(async () => {
  // Nota (mesmo motivo do schemaUnico.api.test.js): as rotas de localizações usam
  // canConfigureAlmox (systemPermissions), que NÃO aceita role:'admin' isolado — exige
  // is_superadmin, admin_modulos ou perfil_almoxarifado ADMINISTRADOR. Já as rotas de
  // almoxarifados (extended.js) usam requirePermission('configurar') (permissions.js),
  // que aceita role:'admin'. is_superadmin:1 satisfaz as duas camadas.
  const { app, db, setUser, close } = await createTestApp({
    user: { id: 1, nome: 'Admin Teste', role: 'admin', is_superadmin: 1 },
  });

  await test('migracao criou o Almoxarifado Geral e vinculou localizacoes existentes', async () => {
    const geral = await dbGet(db, `SELECT * FROM almoxarifados WHERE codigo = 'ALM-GERAL'`);
    assert.ok(geral, 'ALM-GERAL deveria existir via migração');
    const semVinculo = await dbGet(db, `SELECT COUNT(*) as c FROM localizacoes_almoxarifado WHERE almoxarifado_id IS NULL`);
    assert.strictEqual(semVinculo.c, 0, 'todas as localizações (incl. seed) deveriam estar vinculadas');
  });

  await test('POST cria almoxarifado; codigo duplicado 409', async () => {
    const res = await request(app).post('/api/almoxarifado/almoxarifados')
      .send({ codigo: 'ALM-ELET', nome: 'Materiais Elétricos' });
    assert.strictEqual(res.status, 201, JSON.stringify(res.body));
    const dup = await request(app).post('/api/almoxarifado/almoxarifados')
      .send({ codigo: 'ALM-ELET', nome: 'Outro' });
    assert.strictEqual(dup.status, 409);
  });

  await test('POST sem perfil configurar retorna 403', async () => {
    setUser({ id: 9, nome: 'Prod', role: 'user', perfil_almoxarifado: 'PRODUCAO' });
    const res = await request(app).post('/api/almoxarifado/almoxarifados')
      .send({ codigo: 'ALM-X', nome: 'X' });
    assert.strictEqual(res.status, 403);
    setUser({ id: 1, nome: 'Admin Teste', role: 'admin', is_superadmin: 1 });
  });

  await test('localizacao criada com almoxarifado_id e filtro por almoxarifado funciona', async () => {
    const alm = await request(app).post('/api/almoxarifado/almoxarifados')
      .send({ codigo: 'ALM-FIX', nome: 'Fixadores' });
    const loc = await request(app).post('/api/almoxarifado/localizacoes')
      .send({ codigo: 'FIX-01', descricao: 'Prateleira fixadores', almoxarifado_id: alm.body.id });
    assert.strictEqual(loc.status, 201, JSON.stringify(loc.body));
    const filtradas = await request(app).get(`/api/almoxarifado/localizacoes?almoxarifado_id=${alm.body.id}`);
    assert.ok(filtradas.body.length === 1 && filtradas.body[0].codigo === 'FIX-01');
  });

  await test('localizacao criada sem almoxarifado_id usa ALM-GERAL como default', async () => {
    const loc = await request(app).post('/api/almoxarifado/localizacoes')
      .send({ codigo: 'SEM-ALM-01', descricao: 'Sem vinculo explicito' });
    assert.strictEqual(loc.status, 201, JSON.stringify(loc.body));
    const geral = await dbGet(db, `SELECT id FROM almoxarifados WHERE codigo = 'ALM-GERAL'`);
    assert.strictEqual(loc.body.almoxarifado_id, geral.id);
  });

  await test('PUT em localizacao sem almoxarifado_id preserva o vinculo atual (como a UI hoje manda)', async () => {
    const almA = await request(app).post('/api/almoxarifado/almoxarifados')
      .send({ codigo: 'ALM-PUT1', nome: 'Vinculo A' });
    const almB = await request(app).post('/api/almoxarifado/almoxarifados')
      .send({ codigo: 'ALM-PUT2', nome: 'Vinculo B' });
    const loc = await request(app).post('/api/almoxarifado/localizacoes')
      .send({ codigo: 'PUT-01', descricao: 'Preserva vinculo', almoxarifado_id: almA.body.id });
    assert.strictEqual(loc.status, 201, JSON.stringify(loc.body));

    // PUT full-replace SEM almoxarifado_id — reproduz o body que a tela de Configurações
    // (Editar/Mover) manda hoje, que ainda não conhece esse campo.
    const putSemCampo = await request(app).put(`/api/almoxarifado/localizacoes/${loc.body.id}`)
      .send({ codigo: 'PUT-01', descricao: 'Editado sem tocar no vinculo', setor: loc.body.setor });
    assert.strictEqual(putSemCampo.status, 200, JSON.stringify(putSemCampo.body));
    assert.strictEqual(putSemCampo.body.almoxarifado_id, almA.body.id, 'vinculo deveria ter sido preservado');

    // PUT com almoxarifado_id explícito — troca o vinculo normalmente.
    const putComCampo = await request(app).put(`/api/almoxarifado/localizacoes/${loc.body.id}`)
      .send({ codigo: 'PUT-01', descricao: 'Editado trocando o vinculo', almoxarifado_id: almB.body.id });
    assert.strictEqual(putComCampo.status, 200, JSON.stringify(putComCampo.body));
    assert.strictEqual(putComCampo.body.almoxarifado_id, almB.body.id, 'vinculo deveria ter sido trocado');
  });

  await test('inativar almoxarifado com localizacoes ativas falha 400', async () => {
    const alm = await dbGet(db, `SELECT id FROM almoxarifados WHERE codigo = 'ALM-FIX'`);
    const res = await request(app).put(`/api/almoxarifado/almoxarifados/${alm.id}`).send({ ativo: 0 });
    assert.strictEqual(res.status, 400);
  });

  await test('GET lista apenas ativos por padrao; ?todos=1 inclui inativos', async () => {
    const alm = await request(app).post('/api/almoxarifado/almoxarifados')
      .send({ codigo: 'ALM-INATIVAR', nome: 'Vai inativar' });
    await request(app).put(`/api/almoxarifado/almoxarifados/${alm.body.id}`).send({ ativo: 0 });
    const lista = await request(app).get('/api/almoxarifado/almoxarifados');
    assert.ok(!lista.body.some((a) => a.codigo === 'ALM-INATIVAR'), 'inativo não deveria aparecer por padrão');
    const listaTodos = await request(app).get('/api/almoxarifado/almoxarifados?todos=1');
    assert.ok(listaTodos.body.some((a) => a.codigo === 'ALM-INATIVAR'), 'todos=1 deveria incluir inativo');
  });

  await test('PUT em almoxarifado inexistente retorna 404', async () => {
    const res = await request(app).put('/api/almoxarifado/almoxarifados/999999').send({ ativo: 0 });
    assert.strictEqual(res.status, 404);
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
