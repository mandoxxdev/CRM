/**
 * Etapa 40, Task 3 — `POST`/`GET /:id`/`PUT` de cotacao. RN-E07…RN-E11, RN-E13.
 * O DELETE continua pelo generico e o cenario (8) prova que a promocao de `cotacoes` ao harness
 * (T1) nao mudou a forma que o cenario (8) de comprasPedidoEditarExcluir ja media.
 *
 * Executar: cd server && node tests/api/comprasCotacaoRotas.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet } = require('../../services/almoxarifado/db');
const S = require('../../services/compras/schemas');
const { FORNECEDOR_NAO_ENCONTRADO } = require('../../services/compras/pedidoCompraService');
const cotacaoService = require('../../services/compras/cotacaoService');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}
const ADMIN = { id: 98, nome: 'Admin E40 T3', role: 'admin', is_superadmin: 1, email: 'admin@test.com' };

(async () => {
  const { app, db, close } = await createTestApp({ user: ADMIN });
  const fA = (await dbRun(db, "INSERT INTO fornecedores (razao_social, status) VALUES ('Forn A E40', 'ativo')")).lastID;
  const fB = (await dbRun(db, "INSERT INTO fornecedores (razao_social, status) VALUES ('Forn B E40', 'inativo')")).lastID;
  const post = (c) => request(app).post('/api/compras/cotacoes').send(c);
  const put = (id, c) => request(app).put(`/api/compras/cotacoes/${id}`).send(c);
  const get = (id) => request(app).get(`/api/compras/cotacoes/${id}`);
  let seq = 0; const num = () => `COT-E40-${String(++seq).padStart(3, '0')}`;

  await test('(1) POST minimo -> 201, status em_analise, valor_total 0, fornecedor_nome, datas null', async () => {
    const n = num();
    const r = await post({ numero: n, fornecedor_id: fA });
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    assert.strictEqual(r.body.numero, n);
    assert.strictEqual(r.body.status, 'em_analise');
    assert.strictEqual(r.body.valor_total, 0);
    assert.strictEqual(r.body.fornecedor_nome, 'Forn A E40');
    assert.strictEqual(r.body.data_cotacao, null);
    assert.strictEqual(r.body.validade, null);
    assert.ok(r.body.id > 0);
    const g = await get(r.body.id);
    assert.deepStrictEqual(g.body, r.body, 'POST e GET devolvem a MESMA linha');
  });

  await test('(2) RN-E07 numero duplicado -> 409 com o numero na frase (POST e PUT de OUTRO id); o proprio id -> 200', async () => {
    const n = num();
    const a = await post({ numero: n, fornecedor_id: fA });
    const r = await post({ numero: n, fornecedor_id: fA });
    assert.strictEqual(r.status, 409, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, `Já existe uma cotação com o número ${n}`);
    const b = await post({ numero: num(), fornecedor_id: fA });
    const r2 = await put(b.body.id, { numero: n, fornecedor_id: fA });
    assert.strictEqual(r2.status, 409);
    assert.strictEqual(r2.body.error, `Já existe uma cotação com o número ${n}`);
    const r3 = await put(a.body.id, { numero: n, fornecedor_id: fA, valor_total: 5 });
    assert.strictEqual(r3.status, 200, 'o proprio id com o mesmo numero nao e duplicata');
    assert.strictEqual(r3.body.valor_total, 5);
    // numero com espacos em volta e o MESMO numero (trim antes de comparar)
    const r4 = await post({ numero: `  ${n} `, fornecedor_id: fA });
    assert.strictEqual(r4.status, 409);
  });

  await test('(3) RN-E08 fornecedor_id ausente/"3"/0 -> 400 literal do schema; inexistente -> 400 Fornecedor não encontrado; INATIVO e aceito', async () => {
    for (const v of [undefined, '3', 0]) {
      const r = await post({ numero: num(), fornecedor_id: v });
      assert.strictEqual(r.status, 400, JSON.stringify(v));
      assert.strictEqual(r.body.error, `Dados inválidos — fornecedor_id: ${S.FORNECEDOR_COTACAO_OBRIGATORIO}`);
    }
    const r = await post({ numero: num(), fornecedor_id: 999999 });
    assert.strictEqual(r.status, 400);
    assert.deepStrictEqual(r.body, { error: FORNECEDOR_NAO_ENCONTRADO });
    const r2 = await post({ numero: num(), fornecedor_id: fB });
    assert.strictEqual(r2.status, 201, 'inativo aceito — RN-E05/D5, declarado');
  });

  await test('(4) RN-E09 datas: "" -> NULL gravado; 31/12/2026 -> 400 por campo', async () => {
    const r = await post({ numero: num(), fornecedor_id: fA, data_cotacao: '', validade: '2026-12-31' });
    assert.strictEqual(r.status, 201);
    const l = await dbGet(db, 'SELECT data_cotacao, validade FROM cotacoes WHERE id = ?', [r.body.id]);
    assert.strictEqual(l.data_cotacao, null);
    assert.strictEqual(l.validade, '2026-12-31');
    const r1 = await post({ numero: num(), fornecedor_id: fA, data_cotacao: '31/12/2026' });
    assert.strictEqual(r1.body.error, `Dados inválidos — data_cotacao: ${S.DATA_COTACAO_INVALIDA}`);
    const r2 = await post({ numero: num(), fornecedor_id: fA, validade: '31/12/2026' });
    assert.strictEqual(r2.body.error, `Dados inválidos — validade: ${S.VALIDADE_COTACAO_INVALIDA}`);
  });

  await test('(5) RN-E10 status "aprovada" -> 400 literal; "aprovado" grava', async () => {
    const r = await post({ numero: num(), fornecedor_id: fA, status: 'aprovada' });
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.body.error, `Dados inválidos — status: ${S.STATUS_COTACAO_INVALIDO}`);
    const r2 = await post({ numero: num(), fornecedor_id: fA, status: 'aprovado' });
    assert.strictEqual(r2.body.status, 'aprovado');
  });

  await test('(6) RN-E11 valor_total "10" e -1 -> 400; 12.5 grava', async () => {
    for (const v of ['10', -1]) {
      const r = await post({ numero: num(), fornecedor_id: fA, valor_total: v });
      assert.strictEqual(r.status, 400, JSON.stringify(v));
      assert.strictEqual(r.body.error, `Dados inválidos — valor_total: ${S.VALOR_COTACAO_NEGATIVO}`);
    }
    const r = await post({ numero: num(), fornecedor_id: fA, valor_total: 12.5 });
    assert.strictEqual(r.body.valor_total, 12.5);
  });

  await test('(7) RN-E13 PUT troca o fornecedor -> fornecedor_nome novo; PUT e GET de id inexistente -> 404', async () => {
    const a = await post({ numero: num(), fornecedor_id: fA, observacoes: 'antes' });
    const r = await put(a.body.id, { numero: a.body.numero, fornecedor_id: fB, status: 'rejeitado', observacoes: 'depois' });
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.strictEqual(r.body.fornecedor_nome, 'Forn B E40');
    assert.strictEqual(r.body.status, 'rejeitado');
    assert.strictEqual(r.body.observacoes, 'depois');
    const r404 = await put(999999, { numero: 'X', fornecedor_id: fA });
    assert.strictEqual(r404.status, 404);
    assert.deepStrictEqual(r404.body, { error: 'Cotação não encontrada' });
    const g404 = await get(999999);
    assert.strictEqual(g404.status, 404);
    assert.deepStrictEqual(g404.body, { error: 'Cotação não encontrada' });
    // PUT de fornecedor inexistente -> 400, e a linha NAO muda
    const r400 = await put(a.body.id, { numero: a.body.numero, fornecedor_id: 999999 });
    assert.strictEqual(r400.status, 400);
    assert.strictEqual((await get(a.body.id)).body.fornecedor_id, fB);
  });

  await test('(8) DELETE pelo generico continua 200 e a linha some', async () => {
    const a = await post({ numero: num(), fornecedor_id: fA });
    const r = await request(app).delete(`/api/compras/cotacoes/${a.body.id}`);
    assert.strictEqual(r.status, 200);
    assert.strictEqual((await get(a.body.id)).status, 404);
  });

  await test('(9) RN-E07 numero so espacos -> 400 literal do schema', async () => {
    const r = await post({ numero: '   ', fornecedor_id: fA });
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.body.error, `Dados inválidos — numero: ${S.NUMERO_COTACAO_OBRIGATORIO}`);
  });

  await test('(10) pelo SERVICO: criarCotacao com fornecedor apagado -> erro 400 com a literal; numeroDuplicado e a mesma frase da rota', async () => {
    const fC = (await dbRun(db, "INSERT INTO fornecedores (razao_social) VALUES ('Some')")).lastID;
    await dbRun(db, 'DELETE FROM fornecedores WHERE id = ?', [fC]);
    let e;
    try { await cotacaoService.criarCotacao(db, { numero: num(), fornecedor_id: fC }); } catch (x) { e = x; }
    assert.ok(e, 'devia lancar');
    assert.strictEqual(e.status, 400);
    assert.strictEqual(e.message, FORNECEDOR_NAO_ENCONTRADO);
    assert.strictEqual(cotacaoService.numeroDuplicado('Z'), 'Já existe uma cotação com o número Z');
    assert.strictEqual(cotacaoService.FORNECEDOR_COM_COTACOES, 'Fornecedor possui cotações — não pode ser excluído');
  });

  await close();
  console.log(`\n${passed} passou, ${failed} falhou`);
  process.exit(failed ? 1 : 0);
})();
