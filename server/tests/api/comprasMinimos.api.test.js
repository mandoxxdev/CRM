const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

(async () => {
  const { app, close } = await createTestApp(); // admin default tem permissão 'configurar'

  await test('POST /compras/verificar-minimos responde 200 (bug do import do purchaseService)', async () => {
    const res = await request(app).post('/api/almoxarifado/compras/verificar-minimos');
    assert.strictEqual(res.status, 200);
    assert.ok('criadas' in res.body);
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
