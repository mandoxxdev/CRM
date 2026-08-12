/**
 * Etapa 8, Task 9, Step 1 — o selo de propriedade precisa dizer DE QUEM e o material.
 *
 * O client (SeloProprietario.js) ja da precedencia ao dado da propria linha e cai no rotulo
 * generico "Material de cliente" quando o nome nao vem. Este teste prende o lado servidor: as
 * QUATRO respostas que as tres telas seladas consomem tem de trazer
 * `proprietario_cliente_nome` (LEFT JOIN clientes, padrao de stockService.consultarEstoque).
 *
 * CONTROLE POSITIVO BILATERAL em cada resposta: material de cliente traz o nome E material
 * nosso traz null. So a metade "traz o nome" seria aprovada por uma implementacao que
 * preenchesse o campo para todo mundo (ex.: JOIN errado, ou um COALESCE com rotulo fixo) —
 * o que reintroduz exatamente a confusao que o selo existe para evitar.
 *
 * O caso do GET /movimentacoes e especial: aquele SELECT lista as colunas de `ma` UMA A UMA
 * (`ma.nome as material_nome, ...`), entao antes desta task nem `proprietario_cliente_id`
 * chegava ao client — o selo do livro era invisivel para sempre. Por isso as asserces daquele
 * bloco cobrem o id TAMBEM, nao so o nome.
 *
 * Executar: cd server && node tests/api/materialClienteSeloProprietario.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun } = require('../../services/almoxarifado/db');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}
const ADMIN = { id: 1, nome: 'Admin Teste', role: 'admin', is_superadmin: 1, email: 'admin@test.com' };
const RAZAO = 'Cliente Alfa LTDA';

let seq = 0;
async function novoMaterial(db, { proprietario_cliente_id = null } = {}) {
  seq += 1;
  const r = await dbRun(db, `INSERT INTO materiais_almoxarifado
    (codigo, nome, unidade, categoria, quantidade_atual, quantidade_minima, quantidade_maxima,
     custo_unitario, ativo, proprietario_cliente_id)
    VALUES (?, ?, 'PC', 'Chapas', 100, 10, 500, 25, 1, ?)`,
  [`T9-SELO-${seq}`, `Chapa 3mm ${seq}`, proprietario_cliente_id]);
  return r.lastID;
}

async function novaMovimentacao(db, materialId) {
  const r = await dbRun(db, `INSERT INTO movimentacoes_almoxarifado
    (material_id, tipo, quantidade, saldo_anterior, saldo_posterior, motivo, usuario_id, usuario_nome)
    VALUES (?, 'ENTRADA', 10, 90, 100, 'fixture do selo', 1, 'Admin Teste')`, [materialId]);
  return r.lastID;
}

/**
 * As duas metades, sempre juntas e sempre nesta ordem: o controle positivo primeiro, para que
 * uma implementacao que apagou a leitura (JOIN que virou INNER e sumiu com a linha) acuse a
 * causa certa em vez de "nao trouxe o nome".
 */
function assertSelo(linhaCliente, linhaPropria, contexto) {
  assert.ok(linhaCliente, `CONTROLE POSITIVO: ${contexto} nao devolveu a linha do material de cliente`);
  assert.ok(linhaPropria, `CONTROLE POSITIVO: ${contexto} nao devolveu a linha do material proprio`);
  assert.strictEqual(linhaCliente.proprietario_cliente_nome, RAZAO,
    `${contexto}: o selo nao consegue dizer DE QUAL cliente e o material — sem `
    + 'proprietario_cliente_nome o client cai no rotulo generico "Material de cliente"');
  assert.strictEqual(linhaPropria.proprietario_cliente_nome, null,
    `${contexto}: material NOSSO veio com nome de proprietario — um selo pintado em toda linha `
    + 'nao identifica propriedade nenhuma');
}

(async () => {
  const { app, db, close } = await createTestApp({ user: ADMIN });

  const cli = await dbRun(db, 'INSERT INTO clientes (razao_social) VALUES (?)', [RAZAO]);
  const clienteId = cli.lastID;

  const matProprio = await novoMaterial(db);
  const matCliente = await novoMaterial(db, { proprietario_cliente_id: clienteId });
  await novaMovimentacao(db, matProprio);
  await novaMovimentacao(db, matCliente);

  await test('lista de materiais traz a razao social do dono [GET /almoxarifado/materiais]', async () => {
    const res = await request(app).get('/api/almoxarifado/materiais');
    assert.strictEqual(res.status, 200);
    assertSelo(
      res.body.find((r) => r.id === matCliente),
      res.body.find((r) => r.id === matProprio),
      'GET /materiais',
    );
  });

  await test('detalhe do material traz a razao social do dono [GET /almoxarifado/materiais/:id]', async () => {
    const doCliente = await request(app).get(`/api/almoxarifado/materiais/${matCliente}`);
    const nosso = await request(app).get(`/api/almoxarifado/materiais/${matProprio}`);
    assert.strictEqual(doCliente.status, 200);
    assert.strictEqual(nosso.status, 200);
    assertSelo(doCliente.body, nosso.body, 'GET /materiais/:id');
  });

  await test('livro de movimentacoes traz id E razao social do dono [GET /almoxarifado/movimentacoes]', async () => {
    const res = await request(app).get('/api/almoxarifado/movimentacoes');
    assert.strictEqual(res.status, 200);
    const doCliente = res.body.find((r) => r.material_id === matCliente);
    const nossa = res.body.find((r) => r.material_id === matProprio);
    // O id primeiro: este SELECT lista as colunas de `ma` uma a uma, entao a falha original
    // aqui nao era "nome ausente", era a linha inteira sem nenhum dado de propriedade.
    assert.ok(doCliente, 'CONTROLE POSITIVO: a movimentacao do material de cliente nao veio');
    assert.ok(nossa, 'CONTROLE POSITIVO: a movimentacao do material proprio nao veio');
    assert.strictEqual(doCliente.proprietario_cliente_id, clienteId,
      'GET /movimentacoes: sem proprietario_cliente_id na linha o selo do livro fica invisivel '
      + '(o SELECT lista as colunas de `ma` uma a uma)');
    assert.strictEqual(nossa.proprietario_cliente_id, null,
      'GET /movimentacoes: movimentacao de material nosso veio com dono');
    assertSelo(doCliente, nossa, 'GET /movimentacoes');
  });

  await test('extrato do item traz a razao social do dono [GET /almoxarifado/materiais/:id/extrato]', async () => {
    const doCliente = await request(app).get(`/api/almoxarifado/materiais/${matCliente}/extrato`);
    const nosso = await request(app).get(`/api/almoxarifado/materiais/${matProprio}/extrato`);
    assert.strictEqual(doCliente.status, 200);
    assert.strictEqual(nosso.status, 200);
    assertSelo(doCliente.body.material, nosso.body.material, 'GET /materiais/:id/extrato');
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
