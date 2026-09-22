/**
 * Etapa 40, Task 2 — as portas de fornecedor. RN-E01, RN-E02, RN-E03, RN-E04, RN-E06, RN-E12.
 *
 * ⚠️ (1) e (2) foram escritos e rodados ANTES do retrofit de Zod, contra o codigo de hoje: sao os
 * quatro payloads reais de `FornecedoresDoGrupo.js` (`:217`, `:131`, `:167`, `:191`). O retrofit
 * so esta certo se os dois continuarem verdes sem mudar uma linha deles.
 *
 * Executar: cd server && node tests/api/comprasFornecedorRotas.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet } = require('../../services/almoxarifado/db');
const { RAZAO_SOCIAL_OBRIGATORIA, GRUPO_FORNECEDOR_INVALIDO, STATUS_FORNECEDOR_INVALIDO } = require('../../services/compras/schemas');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}
const ADMIN = { id: 97, nome: 'Admin E40 T2', role: 'admin', is_superadmin: 1, email: 'admin@test.com' };
const LITERAL_409_PEDIDO = 'Fornecedor possui pedidos de compra — não pode ser excluído';
const LITERAL_409_COTACAO = 'Fornecedor possui cotações — não pode ser excluído';

(async () => {
  const { app, db, close } = await createTestApp({ user: ADMIN });
  // `grupos_compras` nao esta no harness (core): DDL local, mesma forma de comprasPedidosRotas.api.test.js
  await dbRun(db, `CREATE TABLE IF NOT EXISTS grupos_compras (
    id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT NOT NULL, numero INTEGER, ordem INTEGER DEFAULT 0,
    ativo INTEGER DEFAULT 1, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
  const grupo = await dbRun(db, "INSERT INTO grupos_compras (nome, numero) VALUES ('Grupo E40', 40)");
  const grupoId = grupo.lastID;
  const linha = (id) => dbGet(db, 'SELECT * FROM fornecedores WHERE id = ?', [id]);
  const post = (corpo) => request(app).post('/api/compras/fornecedores').send(corpo);
  const put = (id, corpo) => request(app).put(`/api/compras/fornecedores/${id}`).send(corpo);
  const get = (id) => request(app).get(`/api/compras/fornecedores/${id}`);
  const SETE = { razao_social: 'ACME E40', nome_fantasia: '', cnpj: '', contato: '', email: '', telefone: '', endereco: '' };

  await test('(1) CARACTERIZACAO: o POST do modal (4 chaves, grupo_id STRING) -> 201 e a linha de hoje', async () => {
    const r = await post({ razao_social: 'Modal E40', nome_fantasia: '', cnpj: '', grupo_id: String(grupoId) });
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    assert.deepStrictEqual(Object.keys(r.body).sort(), ['grupo_id', 'id', 'nome_fantasia', 'razao_social']);
    const l = await linha(r.body.id);
    assert.strictEqual(l.grupo_id, grupoId);
    assert.strictEqual(l.status, 'ativo');
    assert.strictEqual(l.nome_fantasia, '');
    assert.strictEqual(l.contato, null);
  });

  await test('(2) CARACTERIZACAO: os 3 PUT do modal (7 textos "" + grupo_id string) -> 200 { message }', async () => {
    const r0 = await post({ razao_social: 'Tres PUT' });
    const id = r0.body.id;
    for (const corpo of [
      { ...SETE, grupo_id: String(grupoId) },              // editar
      { ...SETE, telefone: '(47) 9', grupo_id: String(grupoId) }, // vincular
    ]) {
      const r = await put(id, corpo);
      assert.strictEqual(r.status, 200, JSON.stringify(r.body));
      assert.deepStrictEqual(r.body, { message: 'Fornecedor atualizado' });
    }
    assert.strictEqual((await linha(id)).grupo_id, grupoId);
  });

  await test('(3) RN-E01 razao_social so espacos -> 400 "Dados inválidos — razao_social: …" nas DUAS portas', async () => {
    const r = await post({ razao_social: '   ' });
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.body.error, `Dados inválidos — razao_social: ${RAZAO_SOCIAL_OBRIGATORIA}`);
    const r0 = await post({ razao_social: 'Para editar' });
    const r2 = await put(r0.body.id, { razao_social: '' });
    assert.strictEqual(r2.status, 400);
    assert.strictEqual(r2.body.error, `Dados inválidos — razao_social: ${RAZAO_SOCIAL_OBRIGATORIA}`);
  });

  await test('(4) RN-E03 PUT com grupo_id null LIMPA a coluna (o botao "Remover do grupo" passa a remover)', async () => {
    const r0 = await post({ razao_social: 'No grupo', grupo_id: grupoId });
    assert.strictEqual((await linha(r0.body.id)).grupo_id, grupoId, 'fixture');
    const r = await put(r0.body.id, { ...SETE, grupo_id: null });   // o payload EXATO de :191-200
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.strictEqual((await linha(r0.body.id)).grupo_id, null, 'grupo_id null tinha de LIMPAR — antes era no-op (routes/compras.js:563)');
    // '' tambem limpa (a tela nova manda '' na opcao "Sem grupo")
    await put(r0.body.id, { ...SETE, grupo_id: grupoId });
    const r2 = await put(r0.body.id, { ...SETE, grupo_id: '' });
    assert.strictEqual(r2.status, 200);
    assert.strictEqual((await linha(r0.body.id)).grupo_id, null);
  });

  await test('(5) RN-E03 grupo_id AUSENTE nao mexe; "abc" -> 400 literal', async () => {
    const r0 = await post({ razao_social: 'Fica no grupo', grupo_id: grupoId });
    const r = await put(r0.body.id, { ...SETE });
    assert.strictEqual(r.status, 200);
    assert.strictEqual((await linha(r0.body.id)).grupo_id, grupoId, 'sem a chave, a coluna nao muda');
    const r2 = await put(r0.body.id, { ...SETE, grupo_id: 'abc' });
    assert.strictEqual(r2.status, 400);
    assert.strictEqual(r2.body.error, `Dados inválidos — grupo_id: ${GRUPO_FORNECEDOR_INVALIDO}`);
  });

  await test('(6) RN-E04 status: PUT inativo grava; POST ignora status; "x" -> 400', async () => {
    const r0 = await post({ razao_social: 'Vai inativar', status: 'inativo' });
    assert.strictEqual(r0.status, 201);
    assert.strictEqual((await linha(r0.body.id)).status, 'ativo', 'o POST grava ativo SEMPRE');
    const r = await put(r0.body.id, { ...SETE, status: 'inativo' });
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.strictEqual((await linha(r0.body.id)).status, 'inativo');
    const r2 = await put(r0.body.id, { ...SETE });
    assert.strictEqual(r2.status, 200);
    assert.strictEqual((await linha(r0.body.id)).status, 'inativo', 'sem a chave, status nao muda');
    const r3 = await put(r0.body.id, { ...SETE, status: 'x' });
    assert.strictEqual(r3.status, 400);
    assert.strictEqual(r3.body.error, `Dados inválidos — status: ${STATUS_FORNECEDOR_INVALIDO}`);
  });

  await test('(7) RN-E02 CARACTERIZACAO: PUT so com razao_social zera os outros seis', async () => {
    const r0 = await post({ razao_social: 'Cheio', nome_fantasia: 'NF', cnpj: '1', contato: 'C', email: 'e@x', telefone: 't' });
    await put(r0.body.id, { ...SETE, endereco: 'Rua 1' });
    assert.strictEqual((await linha(r0.body.id)).endereco, 'Rua 1', 'fixture');
    const r = await put(r0.body.id, { razao_social: 'Cheio' });
    assert.strictEqual(r.status, 200);
    const l = await linha(r0.body.id);
    assert.strictEqual(l.nome_fantasia, ''); assert.strictEqual(l.email, null); assert.strictEqual(l.endereco, null);
  });

  await test('(8) RN-E06 GET /:id devolve a linha SEM planilha_*; 404 para id inexistente e nao numerico', async () => {
    const r0 = await post({ razao_social: 'Com planilha', cnpj: '99' });
    await dbRun(db, "UPDATE fornecedores SET planilha_dados = '{\"x\":1}', planilha_nome = 'p.xlsx', endereco = 'Rua 2' WHERE id = ?", [r0.body.id]);
    const r = await get(r0.body.id);
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.strictEqual(r.body.razao_social, 'Com planilha');
    assert.strictEqual(r.body.endereco, 'Rua 2');
    assert.strictEqual(r.body.status, 'ativo');
    assert.ok(!('planilha_dados' in r.body) && !('planilha_nome' in r.body) && !('planilha_atualizado_em' in r.body),
      `a projecao tinha de excluir planilha_*: ${Object.keys(r.body)}`);
    const r404 = await get(999999);
    assert.strictEqual(r404.status, 404);
    assert.deepStrictEqual(r404.body, { error: 'Fornecedor não encontrado' });
    const rNaN = await get('abc');
    assert.strictEqual(rNaN.status, 404);
  });

  await test('(9) RN-E12 fornecedor com cotacao -> 409 literal; com pedido E cotacao vale a de PEDIDO; sem nada -> 200', async () => {
    const r0 = await post({ razao_social: 'Cotado' });
    const id = r0.body.id;
    await dbRun(db, "INSERT INTO cotacoes (numero, fornecedor_id) VALUES ('COT-E40-T2', ?)", [id]);
    const r = await request(app).delete(`/api/compras/fornecedores/${id}`);
    assert.strictEqual(r.status, 409, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, LITERAL_409_COTACAO);
    await dbRun(db, "INSERT INTO pedidos_compra (numero, fornecedor_id) VALUES ('PC-E40-T2', ?)", [id]);
    const r2 = await request(app).delete(`/api/compras/fornecedores/${id}`);
    assert.strictEqual(r2.status, 409);
    assert.strictEqual(r2.body.error, LITERAL_409_PEDIDO, 'com os dois, a literal de pedido tem precedencia');
    await dbRun(db, "DELETE FROM pedidos_compra WHERE fornecedor_id = ?", [id]);
    await dbRun(db, "DELETE FROM cotacoes WHERE fornecedor_id = ?", [id]);
    const r3 = await request(app).delete(`/api/compras/fornecedores/${id}`);
    assert.strictEqual(r3.status, 200);
    assert.strictEqual(await linha(id), undefined);
  });

  await test('(10) looseObject: POST com cidade (chave que a rota ignora) -> 201 e cidade continua NULL; POST grava endereco', async () => {
    const r = await post({ razao_social: 'Com cidade', cidade: 'Joinville' });
    assert.strictEqual(r.status, 201);
    assert.strictEqual((await linha(r.body.id)).cidade, null);
    // Etapa 40: o POST passa a gravar `endereco` (era ignorado — Fase 0 servidor §1.2). Unico
    // acrescimo de coluna no POST; o (1) nao manda endereco, entao a regua fica aqui.
    const r2 = await post({ razao_social: 'Com endereco', endereco: 'Rua 3' });
    assert.strictEqual(r2.status, 201);
    assert.strictEqual((await linha(r2.body.id)).endereco, 'Rua 3', 'o POST tinha de gravar endereco');
  });

  await test('(11) o 400 de schema tem SEMPRE o prefixo "Dados inválidos — " (e o corpo e { error })', async () => {
    const r = await post({});
    assert.strictEqual(r.status, 400);
    assert.ok(r.body.error.startsWith('Dados inválidos — '), r.body.error);
    assert.deepStrictEqual(Object.keys(r.body), ['error']);
  });

  await close();
  console.log(`\n${passed} passou, ${failed} falhou`);
  process.exit(failed ? 1 : 0);
})();
