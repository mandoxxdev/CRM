/**
 * Etapa 34 — Ficha do fornecedor, PELA ROTA.
 * Executar: cd server && node tests/api/comprasFornecedor.api.test.js
 *
 * Até esta etapa POST/PUT /api/compras/fornecedores moravam inline no index.js e NENHUM teste
 * os alcançava. O POST não gravava endereço/cidade/estado/cep; o PUT tratava `grupo_id: null`
 * como "não mexe", então o botão "Remover do grupo" (FornecedoresDoGrupo.js:191) mostrava
 * "removido" e não removia. Os cenários (1) e (4) são os controles positivos naturais dessas
 * duas falhas — ambos falham contra o código antigo.
 *
 * Cobre RN-34.02, RN-34.05, RN-34.06, RN-34.07. Plano:
 * docs/superpowers/plans/2026-10-06-crm-etapa34-ficha-do-fornecedor.md
 *
 * Não há cenário de 403 por módulo: o `fakeCheckModulePermission` do harness é no-op
 * (testApp.js) — seria teste vazio. O gate é provado por leitura do `guard` do módulo.
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet } = require('../../services/compras/db');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

const COMPRAS = { id: 5, nome: 'Comprador', role: 'usuario', perfil_almoxarifado: 'COMPRAS', email: 'compras@test.com' };

const CHAVES_CONTRATO_GET = [
  'id', 'razao_social', 'nome_fantasia', 'cnpj', 'inscricao_estadual', 'contato', 'email',
  'telefone', 'telefone_vendedor', 'celular', 'endereco', 'cidade', 'estado', 'cep', 'status',
  'grupo_id', 'foto', 'created_at', 'updated_at',
];

/** As 13 colunas da ficha, todas preenchidas. */
function fichaCompleta(over = {}) {
  return {
    razao_social: 'TECNOPAR FIXADORES LTDA',
    nome_fantasia: 'TECNOPAR',
    cnpj: '54.984.382/0001-64',
    inscricao_estadual: '799850123110',
    contato: 'Carlos Vendedor',
    email: 'contato@tecnopar.com.br',
    telefone: '(11) 4177-2311',
    telefone_vendedor: '(11) 98765-4321',
    endereco: 'AV. WINSTON CHURCHILL, 596 - RUDGE RAMOS',
    cidade: 'SAO BERNARDO DO CAMPO',
    estado: 'SP',
    cep: '09614-000',
    grupo_id: 3,
    ...over,
  };
}

/** Corpo EXATO que o modal de FornecedoresDoGrupo.js manda (7 textos + grupo_id). */
function corpoDoModal(grupoId) {
  return {
    razao_social: 'TECNOPAR FIXADORES LTDA',
    nome_fantasia: 'TECNOPAR',
    cnpj: '54.984.382/0001-64',
    contato: 'Carlos Vendedor',
    email: 'contato@tecnopar.com.br',
    telefone: '(11) 4177-2311',
    endereco: 'AV. WINSTON CHURCHILL, 596 - RUDGE RAMOS',
    grupo_id: grupoId,
  };
}

(async () => {
  console.log('\n═══ Fornecedor — ficha (API) ═══\n');
  const ctx = await createTestApp({ user: COMPRAS });
  const { app, db, setUser } = ctx;

  const linha = (id) => dbGet(db, 'SELECT * FROM fornecedores WHERE id = ?', [id]);

  /* ── (1) POST grava as 13 colunas ─────────────────────────────────── */
  console.log('(1) POST com as 13 colunas');
  let idCompleto = null;
  await test('POST com as 13 colunas -> 201 e SELECT devolve todas gravadas (inclusive cidade)', async () => {
    const corpo = fichaCompleta();
    const r = await request(app).post('/api/compras/fornecedores').send(corpo);
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    assert.ok(r.body.id, 'devolve id');
    assert.strictEqual(r.body.razao_social, corpo.razao_social);
    assert.strictEqual(r.body.nome_fantasia, corpo.nome_fantasia);
    assert.strictEqual(r.body.grupo_id, 3);
    idCompleto = r.body.id;
    const row = await linha(idCompleto);
    Object.keys(corpo).forEach((k) => {
      assert.strictEqual(row[k], corpo[k], `coluna ${k} gravada`);
    });
    assert.strictEqual(row.status, 'ativo');
  });

  /* ── (2) POST do modal ────────────────────────────────────────────── */
  console.log('(2) POST do modal (4 chaves)');
  await test('POST do modal (razao, fantasia, cnpj, grupo_id) -> 201, endereco/cidade/estado/cep NULL', async () => {
    const r = await request(app).post('/api/compras/fornecedores').send({
      razao_social: 'FORNECEDOR DO MODAL', nome_fantasia: 'MODAL', cnpj: '11.222.333/0001-81', grupo_id: 2,
    });
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    const row = await linha(r.body.id);
    assert.strictEqual(row.grupo_id, 2);
    ['endereco', 'cidade', 'estado', 'cep', 'telefone_vendedor', 'contato', 'email', 'telefone', 'inscricao_estadual']
      .forEach((k) => assert.strictEqual(row[k], null, `${k} fica NULL`));
  });

  /* ── (3) PUT do modal não zera o que não manda ────────────────────── */
  console.log('(3) PUT do modal preserva o que nao manda');
  await test('PUT com os 7 textos + grupo_id mantem cidade e telefone_vendedor (chave ausente nao mexe)', async () => {
    const antes = await linha(idCompleto);
    assert.strictEqual(antes.cidade, 'SAO BERNARDO DO CAMPO');
    assert.strictEqual(antes.telefone_vendedor, '(11) 98765-4321');
    const r = await request(app).put(`/api/compras/fornecedores/${idCompleto}`).send(corpoDoModal(7));
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.deepStrictEqual(r.body, { message: 'Fornecedor atualizado' });
    const depois = await linha(idCompleto);
    assert.strictEqual(depois.cidade, 'SAO BERNARDO DO CAMPO', 'cidade permanece');
    assert.strictEqual(depois.estado, 'SP', 'estado permanece');
    assert.strictEqual(depois.cep, '09614-000', 'cep permanece');
    assert.strictEqual(depois.telefone_vendedor, '(11) 98765-4321', 'telefone_vendedor permanece');
    assert.strictEqual(depois.inscricao_estadual, '799850123110', 'IE permanece');
    assert.strictEqual(depois.grupo_id, 7, 'grupo_id trocou');
  });

  /* ── (4) '' e null limpam; grupo_id null limpa (Remover do grupo) ─── */
  console.log('(4) vazio e null limpam');
  await test("PUT com telefone_vendedor: '' -> NULL", async () => {
    const r = await request(app).put(`/api/compras/fornecedores/${idCompleto}`)
      .send({ razao_social: 'TECNOPAR FIXADORES LTDA', telefone_vendedor: '' });
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    const row = await linha(idCompleto);
    assert.strictEqual(row.telefone_vendedor, null);
    assert.strictEqual(row.cidade, 'SAO BERNARDO DO CAMPO', 'o resto intacto');
  });
  await test('PUT com cidade: null -> NULL', async () => {
    const r = await request(app).put(`/api/compras/fornecedores/${idCompleto}`)
      .send({ razao_social: 'TECNOPAR FIXADORES LTDA', cidade: null });
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    const row = await linha(idCompleto);
    assert.strictEqual(row.cidade, null);
    assert.strictEqual(row.estado, 'SP', 'estado intacto');
  });
  await test('PUT com grupo_id: null em fornecedor com grupo -> grupo_id NULL (corpo do "Remover do grupo")', async () => {
    const antes = await linha(idCompleto);
    assert.strictEqual(antes.grupo_id, 7, 'precondicao: tinha grupo');
    // Corpo EXATO de FornecedoresDoGrupo.js:191
    const r = await request(app).put(`/api/compras/fornecedores/${idCompleto}`).send({
      razao_social: antes.razao_social,
      nome_fantasia: antes.nome_fantasia || '',
      cnpj: antes.cnpj || '',
      contato: antes.contato || '',
      email: antes.email || '',
      telefone: antes.telefone || '',
      endereco: antes.endereco || '',
      grupo_id: null,
    });
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    const depois = await linha(idCompleto);
    assert.strictEqual(depois.grupo_id, null, 'grupo_id limpo');
  });
  await test("PUT com grupo_id: '' tambem limpa", async () => {
    await dbRun(db, 'UPDATE fornecedores SET grupo_id = 9 WHERE id = ?', [idCompleto]);
    const r = await request(app).put(`/api/compras/fornecedores/${idCompleto}`)
      .send({ razao_social: 'TECNOPAR FIXADORES LTDA', grupo_id: '' });
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.strictEqual((await linha(idCompleto)).grupo_id, null);
  });
  await test('PUT com grupo_id numerico em string ("4") grava 4', async () => {
    const r = await request(app).put(`/api/compras/fornecedores/${idCompleto}`)
      .send({ razao_social: 'TECNOPAR FIXADORES LTDA', grupo_id: '4' });
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.strictEqual((await linha(idCompleto)).grupo_id, 4);
  });

  /* ── (5) GET /:id ─────────────────────────────────────────────────── */
  console.log('(5) GET /:id');
  await test('GET /:id -> 200 com as chaves do contrato e SEM planilha_*', async () => {
    await dbRun(db, `UPDATE fornecedores SET planilha_dados = '[{"a":1}]', planilha_nome = 'x.xlsx',
      planilha_atualizado_em = CURRENT_TIMESTAMP, foto = 'f.png', celular = '(11) 91111-2222' WHERE id = ?`, [idCompleto]);
    const r = await request(app).get(`/api/compras/fornecedores/${idCompleto}`);
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    CHAVES_CONTRATO_GET.forEach((k) => assert.ok(k in r.body, `chave ${k} presente`));
    ['planilha_dados', 'planilha_nome', 'planilha_atualizado_em']
      .forEach((k) => assert.ok(!(k in r.body), `${k} NAO vem`));
    assert.strictEqual(r.body.id, idCompleto);
    assert.strictEqual(r.body.razao_social, 'TECNOPAR FIXADORES LTDA');
    assert.strictEqual(r.body.celular, '(11) 91111-2222');
    assert.strictEqual(r.body.foto, 'f.png');
    assert.strictEqual(r.body.grupo_id, 4);
  });
  await test('GET /9999 -> 404 "Fornecedor não encontrado"', async () => {
    const r = await request(app).get('/api/compras/fornecedores/9999');
    assert.strictEqual(r.status, 404);
    assert.strictEqual(r.body.error, 'Fornecedor não encontrado');
  });
  await test('PUT /9999 -> 404 "Fornecedor não encontrado"', async () => {
    const r = await request(app).put('/api/compras/fornecedores/9999').send({ razao_social: 'X' });
    assert.strictEqual(r.status, 404);
    assert.strictEqual(r.body.error, 'Fornecedor não encontrado');
  });

  /* ── (6) validações ───────────────────────────────────────────────── */
  console.log('(6) validacoes');
  await test('POST sem razao_social -> 400 "Razão social é obrigatória"', async () => {
    const r = await request(app).post('/api/compras/fornecedores').send({ nome_fantasia: 'X' });
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.body.error, 'Razão social é obrigatória');
  });
  await test('PUT sem razao_social -> 400 literal (obrigatoria tambem no PUT)', async () => {
    const r = await request(app).put(`/api/compras/fornecedores/${idCompleto}`).send({ cidade: 'X' });
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.body.error, 'Razão social é obrigatória');
  });
  await test("PUT com razao_social: '' -> 400 literal", async () => {
    const r = await request(app).put(`/api/compras/fornecedores/${idCompleto}`).send({ razao_social: '  ' });
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.body.error, 'Razão social é obrigatória');
  });
  await test("PUT status: 'x' -> 400 \"Status inválido\"", async () => {
    const r = await request(app).put(`/api/compras/fornecedores/${idCompleto}`)
      .send({ razao_social: 'TECNOPAR FIXADORES LTDA', status: 'x' });
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.body.error, 'Status inválido');
  });
  await test("PUT grupo_id: 'abc' -> 400 \"Grupo inválido\"", async () => {
    const r = await request(app).put(`/api/compras/fornecedores/${idCompleto}`)
      .send({ razao_social: 'TECNOPAR FIXADORES LTDA', grupo_id: 'abc' });
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.body.error, 'Grupo inválido');
    assert.strictEqual((await linha(idCompleto)).grupo_id, 4, 'nada gravado');
  });
  await test("POST grupo_id: 'abc' -> 400 \"Grupo inválido\"", async () => {
    const r = await request(app).post('/api/compras/fornecedores').send({ razao_social: 'X', grupo_id: 'abc' });
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.body.error, 'Grupo inválido');
  });
  await test("POST grupo_id: '' -> 201 com grupo_id NULL", async () => {
    const r = await request(app).post('/api/compras/fornecedores').send({ razao_social: 'SEM GRUPO', grupo_id: '' });
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    assert.strictEqual(r.body.grupo_id, null);
    assert.strictEqual((await linha(r.body.id)).grupo_id, null);
  });
  await test("POST com textos opcionais '' grava NULL (nao '')", async () => {
    const r = await request(app).post('/api/compras/fornecedores')
      .send({ razao_social: 'SO RAZAO', nome_fantasia: '', cnpj: '  ', email: '' });
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    const row = await linha(r.body.id);
    assert.strictEqual(row.nome_fantasia, null);
    assert.strictEqual(row.cnpj, null);
    assert.strictEqual(row.email, null);
  });

  /* ── (7) status ───────────────────────────────────────────────────── */
  console.log('(7) status');
  await test("PUT status: 'inativo' grava; sem status nao mexe", async () => {
    let r = await request(app).put(`/api/compras/fornecedores/${idCompleto}`)
      .send({ razao_social: 'TECNOPAR FIXADORES LTDA', status: 'inativo' });
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.strictEqual((await linha(idCompleto)).status, 'inativo');
    r = await request(app).put(`/api/compras/fornecedores/${idCompleto}`)
      .send({ razao_social: 'TECNOPAR FIXADORES LTDA' });
    assert.strictEqual(r.status, 200);
    assert.strictEqual((await linha(idCompleto)).status, 'inativo', 'ausente nao mexe');
  });
  await test("POST ignora status (sempre 'ativo')", async () => {
    const r = await request(app).post('/api/compras/fornecedores').send({ razao_social: 'NOVO', status: 'inativo' });
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    assert.strictEqual((await linha(r.body.id)).status, 'ativo');
  });

  /* ── (8) autenticacao ─────────────────────────────────────────────── */
  console.log('(8) autenticacao');
  await test('as tres rotas exigem token (setUser(null) -> 401)', async () => {
    setUser(null);
    try {
      const g = await request(app).get(`/api/compras/fornecedores/${idCompleto}`);
      assert.strictEqual(g.status, 401, 'GET');
      const p = await request(app).post('/api/compras/fornecedores').send({ razao_social: 'X' });
      assert.strictEqual(p.status, 401, 'POST');
      const u = await request(app).put(`/api/compras/fornecedores/${idCompleto}`).send({ razao_social: 'X' });
      assert.strictEqual(u.status, 401, 'PUT');
    } finally {
      setUser(COMPRAS);
    }
  });

  await test('[G2] GET /api/compras/fornecedores (lista) NAO devolve planilha_*; search e status continuam; mais novo primeiro', async () => {
    const a = await request(app).post('/api/compras/fornecedores').send({ razao_social: 'G2 Alfa Planilhada', cnpj: '11.111.111/0001-11' });
    const b = await request(app).post('/api/compras/fornecedores').send({ razao_social: 'G2 Beta Inativo', cnpj: '22.222.222/0001-22' });
    assert.strictEqual(a.status, 201); assert.strictEqual(b.status, 201);
    const planilha = JSON.stringify(Array.from({ length: 500 }, (_, i) => ({ codigo: 'P' + i, preco: i })));
    await dbRun(db, 'UPDATE fornecedores SET planilha_dados = ?, planilha_nome = ?, planilha_atualizado_em = CURRENT_TIMESTAMP WHERE id = ?', [planilha, 'precos.xlsx', a.body.id]);
    await dbRun(db, "UPDATE fornecedores SET status = 'inativo' WHERE id = ?", [b.body.id]);
    await dbRun(db, "UPDATE fornecedores SET created_at = '2030-01-01 00:00:00' WHERE id = ?", [b.body.id]);

    const lista = await request(app).get('/api/compras/fornecedores');
    assert.strictEqual(lista.status, 200, JSON.stringify(lista.body));
    const linhaA = lista.body.find((f) => f.id === a.body.id);
    assert.ok(linhaA, 'a lista traz o fornecedor');
    for (const k of ['planilha_dados', 'planilha_nome', 'planilha_atualizado_em']) {
      assert.ok(!(k in linhaA), 'a lista NAO deve trazer ' + k);
    }
    for (const k of CHAVES_CONTRATO_GET) assert.ok(k in linhaA, 'a lista traz ' + k);
    assert.ok(JSON.stringify(lista.body).length < planilha.length, 'a resposta inteira e menor que a planilha de um fornecedor');
    assert.strictEqual(lista.body[0].id, b.body.id, 'ORDER BY created_at DESC: o mais novo vem primeiro');

    const busca = await request(app).get('/api/compras/fornecedores?search=G2 Alfa');
    assert.deepStrictEqual(busca.body.map((f) => f.id), [a.body.id]);
    const porCnpj = await request(app).get('/api/compras/fornecedores?search=22.222');
    assert.deepStrictEqual(porCnpj.body.map((f) => f.id), [b.body.id]);
    const inativos = await request(app).get('/api/compras/fornecedores?status=inativo');
    assert.ok(inativos.body.every((f) => f.status === 'inativo') && inativos.body.some((f) => f.id === b.body.id));
    const semToken = await (async () => { ctx.setUser(null); const r = await request(app).get('/api/compras/fornecedores'); ctx.setUser(COMPRAS); return r; })();
    assert.strictEqual(semToken.status, 401);
  });

  await ctx.close();
  console.log(`\n${passed} passaram, ${failed} falharam\n`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((e) => {
  console.error('Erro fatal:', e);
  process.exit(1);
});
