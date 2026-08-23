/**
 * Etapa 9b — revisao final de branch, achado F3: PUT /ferramentas/:id e o 409 de patrimonio
 * duplicado nao tinham nenhum teste (a rota existe desde a Task 1/2, mas nunca foi exercitada).
 * A UI de edicao propriamente dita NAO foi entregue nesta etapa (corte descoberto na revisao
 * final, ver D9 do design) — este arquivo cobre so o contrato de API que ja existe.
 *
 * Executar: cd server && node tests/api/toolFerramentaEdicao.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbGet } = require('../../services/almoxarifado/db');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

let seq = 0;
async function novaFerramenta(app, extra = {}) {
  seq += 1;
  const r = await request(app).post('/api/almoxarifado/ferramentas')
    .send({ codigo_patrimonio: `PAT-EDIT-${seq}`, nome: `Ferramenta ${seq}`, ...extra })
    .expect(201);
  return r.body.id;
}

(async () => {
  await test('PUT atualiza nome, localizacao_id e exige_calibracao', async () => {
    const { app, db, close } = await createTestApp();
    // localizacao_id so precisa existir como numero para a coluna aceitar — nao ha FK checada
    // aqui (mesma liberdade que o resto do modulo da a localizacao_id em ferramentas).
    const fid = await novaFerramenta(app);

    const r = await request(app).put(`/api/almoxarifado/ferramentas/${fid}`)
      .send({ nome: 'Furadeira revisada', localizacao_id: 1, exige_calibracao: true })
      .expect(200);
    assert.strictEqual(r.body.id, fid);

    const linha = await dbGet(db, 'SELECT * FROM ferramentas_almoxarifado WHERE id = ?', [fid]);
    assert.strictEqual(linha.nome, 'Furadeira revisada');
    assert.strictEqual(linha.localizacao_id, 1);
    assert.strictEqual(linha.exige_calibracao, 1);
    await close();
  });

  await test('PUT em id inexistente devolve 404', async () => {
    const { app, close } = await createTestApp();
    const r = await request(app).put('/api/almoxarifado/ferramentas/999999')
      .send({ nome: 'Nao existe' }).expect(404);
    assert.strictEqual(r.body.error, 'Ferramenta não encontrada');
    await close();
  });

  await test('POST duplicando codigo_patrimonio devolve 409 com a mensagem literal do contrato', async () => {
    const { app, close } = await createTestApp();
    await request(app).post('/api/almoxarifado/ferramentas')
      .send({ codigo_patrimonio: 'PAT-DUP-1', nome: 'Primeira' }).expect(201);
    const r = await request(app).post('/api/almoxarifado/ferramentas')
      .send({ codigo_patrimonio: 'PAT-DUP-1', nome: 'Segunda' }).expect(409);
    assert.strictEqual(r.body.error, 'Código de patrimônio já cadastrado');
    await close();
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
