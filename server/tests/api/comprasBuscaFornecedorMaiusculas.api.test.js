/**
 * Etapa 192 (Compras) Fase 5, X2 — a ficha do fornecedor grava razao social e nome fantasia em MAIUSCULAS com acento
 * (RN-192.05), e o LIKE do SQLite so ignora a caixa das letras sem acento: "aços" deixou de achar "AÇOS BRASIL" na lista de
 * pedidos, na de cotacoes e no seletor de pedido do recebimento do almoxarifado. As quatro buscas usam agora a regua comum
 * `services/buscaSemCaixa.js` (`condicaoDeBusca`: o termo como veio, em maiusculas e em minusculas).
 *
 *   RN-1  lista de pedidos, de cotacoes e seletor do recebimento: "aços", "Aços" e "AÇOS" acham o gravado em maiusculas e o
 *         legado em caixa mista.
 *   RN-2  lista de fornecedores (G4): nome fantasia minusculo acentuado acha; o CPF continua achado mascarado e so digitos.
 *   RN-3  importacao de pedido (G7): o nome fantasia da planilha em minusculas acentuadas acha o fornecedor gravado em maiusculas.
 *
 * Executar: cd server && node tests/api/comprasBuscaFornecedorMaiusculas.api.test.js
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

const ADMIN = { id: 1, nome: 'Admin', role: 'admin', is_superadmin: 1, email: 'admin@test.com' };

(async () => {
  const { app, db, close } = await createTestApp({ user: ADMIN });

  const novo = await request(app).post('/api/compras/fornecedores').send({ razao_social: 'Aços Brasil', nome_fantasia: 'Ótica São José',
    cpf: '529.982.247-25' });
  assert.strictEqual(novo.status, 201, JSON.stringify(novo.body));
  assert.strictEqual(novo.body.razao_social, 'AÇOS BRASIL');
  const FN = novo.body.id;
  const FL = (await dbRun(db, "INSERT INTO fornecedores (razao_social, status) VALUES ('Aços Legado', 'ativo')")).lastID;
  for (const f of [FN, FL]) {
    await dbRun(db, "INSERT INTO pedidos_compra (numero, fornecedor_id, status) VALUES (?, ?, 'pendente')", [`PC-${f}`, f]);
    await dbRun(db, "INSERT INTO cotacoes (numero, fornecedor_id, status) VALUES (?, ?, 'pendente')", [`CT-${f}`, f]);
  }
  const ids = (body) => (Array.isArray(body) ? body.map((x) => x.fornecedor_id ?? x.fornecedor_nome) : body);
  const nomes = (body) => (Array.isArray(body) ? body.map((x) => x.fornecedor_nome).sort() : body);
  const ESPERADO = ['AÇOS BRASIL', 'Aços Legado'];

  await test('[RN-1] lista de pedidos: aços / Aços / AÇOS acham o gravado em maiusculas e o legado', async () => {
    for (const q of ['aços', 'Aços', 'AÇOS']) {
      const r = await request(app).get('/api/compras/pedidos').query({ search: q });
      assert.strictEqual(r.status, 200);
      assert.deepStrictEqual(nomes(r.body), ESPERADO, `"${q}": ${JSON.stringify(ids(r.body))}`);
    }
  });

  await test('[RN-1] lista de cotacoes: aços / Aços / AÇOS acham os dois', async () => {
    for (const q of ['aços', 'Aços', 'AÇOS']) {
      const r = await request(app).get('/api/compras/cotacoes').query({ search: q });
      assert.strictEqual(r.status, 200);
      assert.deepStrictEqual(nomes(r.body), ESPERADO, `"${q}": ${JSON.stringify(ids(r.body))}`);
    }
  });

  await test('[RN-1] seletor de pedido do recebimento: aços / Aços / AÇOS acham os dois', async () => {
    for (const q of ['aços', 'Aços', 'AÇOS']) {
      const r = await request(app).get('/api/almoxarifado/recebimentos-aux/pedidos-compra').query({ search: q });
      assert.strictEqual(r.status, 200, JSON.stringify(r.body));
      assert.deepStrictEqual(nomes(r.body), ESPERADO, `"${q}": ${JSON.stringify(ids(r.body))}`);
    }
  });

  await test('[RN-1] a busca pelo numero do pedido continua', async () => {
    const r = await request(app).get('/api/compras/pedidos').query({ search: `PC-${FN}` });
    assert.deepStrictEqual(r.body.map((p) => p.id).length, 1);
  });

  await test('[RN-2/G4] fornecedores: razao e fantasia minusculas acentuadas acham; CPF mascarado e so digitos tambem', async () => {
    for (const q of ['aços', 'ótica são', 'ÓTICA SÃO', '529.982.247-25', '52998224725', '982247']) {
      const r = await request(app).get('/api/compras/fornecedores').query({ search: q });
      assert.strictEqual(r.status, 200);
      assert.ok(r.body.some((f) => f.id === FN), `"${q}" nao achou: ${JSON.stringify(r.body.map((f) => f.razao_social))}`);
    }
    const leg = await request(app).get('/api/compras/fornecedores').query({ search: 'AÇOS' });
    assert.ok(leg.body.some((f) => f.id === FL), 'AÇOS nao achou o legado em caixa mista');
  });

  await test('[RN-3/G7] importacao: nome fantasia minusculo acentuado acha o fornecedor gravado em maiusculas', async () => {
    const svc = require('../../services/compras/pedidoCompraService');
    const achado = await svc.resolverFornecedorDaLinha(db, { fornecedor: 'ótica são josé' });
    assert.ok(achado, 'nao achou pelo nome fantasia minusculo');
    assert.strictEqual(achado.id, FN);
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
