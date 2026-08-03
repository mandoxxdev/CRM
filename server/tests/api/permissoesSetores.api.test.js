const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

(async () => {
  const { app, setUser, close } = await createTestApp();

  const setores = await request(app).get('/api/almoxarifado/setores-requisicao');
  assert.strictEqual(setores.status, 200);
  const setorId = setores.body[0].id;

  await test('role=admin continua podendo salvar permissões', async () => {
    setUser({ id: 1, nome: 'Admin', role: 'admin' });
    const res = await request(app)
      .put(`/api/almoxarifado/setores-requisicao/${setorId}/permissoes`)
      .send({ permissoes: [] });
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
  });

  await test('super admin SEM role=admin pode salvar (bug atual: 403)', async () => {
    setUser({ id: 2, nome: 'Super', role: 'user', is_superadmin: 1 });
    const res = await request(app)
      .put(`/api/almoxarifado/setores-requisicao/${setorId}/permissoes`)
      .send({ permissoes: [] });
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
  });

  await test('admin do módulo almoxarifado pode salvar', async () => {
    setUser({ id: 3, nome: 'AdminAlmox', role: 'user', admin_modulos: ['almoxarifado'] });
    const res = await request(app)
      .post(`/api/almoxarifado/setores-requisicao/${setorId}/permissoes/bulk-tipo`)
      .send({ tipo_uso: 'industrial' });
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
  });

  await test('usuário comum recebe 403', async () => {
    setUser({ id: 4, nome: 'Comum', role: 'user' });
    const res = await request(app)
      .put(`/api/almoxarifado/setores-requisicao/${setorId}/permissoes`)
      .send({ permissoes: [] });
    assert.strictEqual(res.status, 403);
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
