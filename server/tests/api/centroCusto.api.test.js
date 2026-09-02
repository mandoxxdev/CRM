const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet } = require('../../services/almoxarifado/db');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

(async () => {
  const { app, db, setUser, close } = await createTestApp();

  let ccId;
  await test('POST cria centro de custo', async () => {
    const res = await request(app).post('/api/almoxarifado/centros-custo')
      .send({ codigo: 'CC-100', nome: 'Manutenção Industrial' });
    assert.strictEqual(res.status, 201, JSON.stringify(res.body));
    ccId = res.body.id;
    assert.ok(ccId > 0);
  });

  await test('codigo duplicado retorna 400/409', async () => {
    const res = await request(app).post('/api/almoxarifado/centros-custo')
      .send({ codigo: 'CC-100', nome: 'Outro' });
    assert.ok([400, 409].includes(res.status), `status ${res.status}`);
  });

  await test('payload invalido (sem codigo) retorna 400 Zod', async () => {
    const res = await request(app).post('/api/almoxarifado/centros-custo')
      .send({ nome: 'Sem código' });
    assert.strictEqual(res.status, 400);
    assert.ok(res.body.error.includes('codigo'), res.body.error);
  });

  await test('GET lista apenas ativos por padrao', async () => {
    await request(app).post('/api/almoxarifado/centros-custo')
      .send({ codigo: 'CC-200', nome: 'Inativar' });
    const lista1 = await request(app).get('/api/almoxarifado/centros-custo');
    const cc200 = lista1.body.find((c) => c.codigo === 'CC-200');
    await request(app).put(`/api/almoxarifado/centros-custo/${cc200.id}`).send({ ativo: 0 });
    const lista2 = await request(app).get('/api/almoxarifado/centros-custo');
    assert.ok(!lista2.body.some((c) => c.codigo === 'CC-200'), 'inativo não deveria aparecer');
    const lista3 = await request(app).get('/api/almoxarifado/centros-custo?todos=1');
    assert.ok(lista3.body.some((c) => c.codigo === 'CC-200'), 'todos=1 deveria incluir inativo');
  });

  await test('POST sem perfil de configuracao retorna 403', async () => {
    setUser({ id: 9, nome: 'Produção', role: 'user', perfil_almoxarifado: 'PRODUCAO' });
    const res = await request(app).post('/api/almoxarifado/centros-custo')
      .send({ codigo: 'CC-300', nome: 'Não pode' });
    assert.strictEqual(res.status, 403);
    setUser({ id: 1, nome: 'Admin Teste', role: 'admin' });
  });

  await test('movimentacao aceita centro_custo_id (coluna existe)', async () => {
    const material = await dbRun(db,
      'INSERT INTO materiais_almoxarifado (codigo, nome, quantidade_atual, ativo) VALUES (?,?,?,1)',
      ['CC-MAT-001', 'Material Centro de Custo', 10]);
    const materialId = material.lastID;

    const res = await request(app).post('/api/almoxarifado/movimentacoes/v2')
      .send({ material_id: materialId, tipo: 'ENTRADA', quantidade: 5, centro_custo_id: ccId });
    assert.strictEqual(res.status, 201, JSON.stringify(res.body));

    const mov = await dbGet(db, 'SELECT centro_custo_id FROM movimentacoes_almoxarifado WHERE id = ?', [res.body.id]);
    assert.strictEqual(mov.centro_custo_id, ccId);
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
