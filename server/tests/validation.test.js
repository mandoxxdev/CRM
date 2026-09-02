/**
 * Testes do helper de validação Zod para rotas do almoxarifado.
 * Executar: node server/tests/validation.test.js
 */
const assert = require('assert');
const express = require('express');
const request = require('supertest');
const { z } = require('zod');
const { validate } = require('../services/almoxarifado/validation');

let passed = 0;
let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

function appWith(schema) {
  const app = express();
  app.use(express.json());
  app.post('/t', validate(schema), (req, res) => res.status(200).json({ body: req.body }));
  return app;
}

(async () => {
  const MovSchema = z.object({
    material_id: z.number().int(),
    quantidade: z.number().gt(0),
    motivo: z.string().optional(),
  });

  const ReqSchema = z.object({
    itens: z.array(z.object({
      material_id: z.number().int(),
      quantidade: z.number().gt(0),
    })).min(1),
  });

  await test('payload valido passa e chega parseado ao handler', async () => {
    const res = await request(appWith(MovSchema)).post('/t')
      .send({ material_id: 1, quantidade: 5 });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.body.quantidade, 5);
  });

  await test('payload invalido retorna 400 no formato { error } citando o campo', async () => {
    const res = await request(appWith(MovSchema)).post('/t')
      .send({ material_id: 1, quantidade: 0 });
    assert.strictEqual(res.status, 400);
    assert.ok(typeof res.body.error === 'string', 'error deve ser string');
    assert.ok(res.body.error.includes('quantidade'), `error deve citar o campo: ${res.body.error}`);
  });

  await test('erro em item aninhado aponta o caminho (itens.0.quantidade)', async () => {
    const res = await request(appWith(ReqSchema)).post('/t')
      .send({ itens: [{ material_id: 1, quantidade: -2 }] });
    assert.strictEqual(res.status, 400);
    assert.ok(res.body.error.includes('itens.0.quantidade'), `caminho ausente: ${res.body.error}`);
  });

  await test('body vazio em schema com campos obrigatorios retorna 400', async () => {
    const res = await request(appWith(MovSchema)).post('/t').send({});
    assert.strictEqual(res.status, 400);
    assert.ok(res.body.error.includes('material_id'), `error deve citar material_id: ${res.body.error}`);
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
