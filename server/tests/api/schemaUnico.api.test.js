const assert = require('assert');
const fs = require('fs');
const path = require('path');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

(async () => {
  // Nota de implementação (Step 2 do brief): POST /familias e GET /configuracoes exigem
  // canConfigureAlmox(req.user) (admin do módulo Almoxarifado ou Super Administrador).
  // O usuário default do harness ({ role: 'admin' }) não satisfaz essa checagem — é um
  // "admin" genérico, não necessariamente admin do módulo. Como o objetivo deste teste é
  // provar que o schema (initSchema) sozinho basta, não testar a matriz de permissões,
  // usamos um usuário com is_superadmin para não colidir com essa camada de autorização.
  const { app, db, close } = await createTestApp({
    user: { id: 1, nome: 'Admin Teste', role: 'admin', is_superadmin: 1 },
  });

  await test('routes/almoxarifado.js nao contem mais DDL (CREATE TABLE)', async () => {
    const src = fs.readFileSync(path.join(__dirname, '../../routes/almoxarifado.js'), 'utf8');
    assert.ok(!src.includes('CREATE TABLE'), 'DDL ainda presente no arquivo de rotas');
  });

  await test('app inicializado só com initSchema atende o CRUD de material', async () => {
    const fam = await request(app).post('/api/almoxarifado/familias')
      .send({ codigo: 'FAM1', nome: 'Família Teste' });
    assert.strictEqual(fam.status, 201, JSON.stringify(fam.body));
    const mat = await request(app).post('/api/almoxarifado/materiais')
      .send({ codigo: 'MAT-001', nome: 'Material Teste', familia_id: fam.body.id, unidade: 'UN' });
    assert.strictEqual(mat.status, 201, JSON.stringify(mat.body));
    const lista = await request(app).get('/api/almoxarifado/materiais');
    assert.strictEqual(lista.status, 200);
    assert.strictEqual(lista.body.length, 1);
  });

  await test('demais telas principais respondem (conferencias, requisicoes, configuracoes)', async () => {
    for (const rota of ['/api/almoxarifado/conferencias', '/api/almoxarifado/requisicoes', '/api/almoxarifado/configuracoes']) {
      const res = await request(app).get(rota);
      assert.strictEqual(res.status, 200, `${rota} -> ${res.status}`);
    }
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
