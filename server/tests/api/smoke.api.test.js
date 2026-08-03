/**
 * Smoke test do harness de API do almoxarifado.
 * Executar: node server/tests/api/smoke.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');

let passed = 0;
let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

(async () => {
  const { app, setUser, close } = await createTestApp();

  await test('GET /api/almoxarifado/materiais retorna 200 com lista', async () => {
    const res = await request(app).get('/api/almoxarifado/materiais');
    assert.strictEqual(res.status, 200);
    assert.ok(Array.isArray(res.body));
  });

  await test('GET /api/almoxarifado/meta/tipos-material (rota extended) retorna 200', async () => {
    const res = await request(app).get('/api/almoxarifado/meta/tipos-material');
    assert.strictEqual(res.status, 200);
    assert.ok(Array.isArray(res.body.tipos));
  });

  await test('sem usuário autenticado retorna 401', async () => {
    setUser(null);
    const res = await request(app).get('/api/almoxarifado/materiais');
    assert.strictEqual(res.status, 401);
    setUser({ id: 1, nome: 'Admin Teste', role: 'admin' });
  });

  await test('GET /api/requisicoes-material/setores retorna 200', async () => {
    const res = await request(app).get('/api/requisicoes-material/setores');
    assert.strictEqual(res.status, 200);
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
