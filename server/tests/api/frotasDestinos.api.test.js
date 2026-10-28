/**
 * Frota Etapa 8 (G2) — destinos cadastrados: /api/frotas/destinos (feature 22).
 *
 *   RN-F8.27  POST (registrar_operacoes: motorista e gestor; Consulta 403): nome aparado e com espacos internos colapsados; vazio,
 *             nao-string (ajuste 9) e > 120 -> 400 com as mensagens literais; endereco opcional (<= 255); 201 com criado_por_nome
 *   RN-F8.28  nome ja ativo (sem distinguir caixa) -> 409 { error, code: 'DESTINO_DUPLICADO', destino: <linha existente> } (ajuste T-1:
 *             o `destino` viaja pelo `err.extra` do handleError); nome de um DESATIVADO cria normalmente (indice parcial)
 *   RN-F8.29  GET (todo perfil do modulo): ativos por nome; ?search= em nome/endereco; ?inativos=1 inclui desativados
 *   RN-F8.30  PUT/DELETE so gerenciar_veiculos (motorista 403); PUT nome/endereco/ativo com as mesmas validacoes; renomear para nome
 *             ativo -> 409; reativar um desativado cujo nome ja tem outro ativo -> 409; inexistente -> 404 (ajuste T-7); DELETE desativa
 *
 * Plano: docs/superpowers/plans/2026-10-28-frotas-etapa8-admin-destinos-condutor.md
 * Executar: cd server && node tests/api/frotasDestinos.api.test.js
 */
const assert = require('assert');
const { createFrotasTestApp, ADMIN, MOTORISTA, CONSULTA } = require('../helpers/frotasTestApp');

let passed = 0; let failed = 0;
const testes = [];
function test(name, fn) { testes.push([name, fn]); }

let ctx;
const S = {};
const ana = (m, u, c) => ctx.como(MOTORISTA)(m, u, c);
const consulta = (m, u, c) => ctx.como(CONSULTA)(m, u, c);
const gestor = (m, u, c) => ctx.como(ADMIN)(m, u, c);
const URL = '/api/frotas/destinos';

const MSG_NOME = 'Informe o nome do destino';
const MSG_NOME_LONGO = 'Nome do destino: no máximo 120 caracteres';
const MSG_END_LONGO = 'Endereço: no máximo 255 caracteres';
const MSG_DUP = 'Destino já cadastrado';
const MSG_404 = 'Destino não encontrado';

// ── RN-F8.27 ───────────────────────────────────────────────────────────────────────────────────
test('RN-F8.27 motorista cria (201) com criado_por_nome; nome aparado e espacos colapsados; endereco opcional', async () => {
  const r = await ana('post', URL, { nome: '  Cliente   Alfa  ', endereco: ' Rua A, 10 ' });
  assert.strictEqual(r.status, 201, JSON.stringify(r.body));
  assert.strictEqual(r.body.nome, 'Cliente Alfa');
  assert.strictEqual(r.body.endereco, 'Rua A, 10');
  assert.strictEqual(r.body.ativo, 1);
  assert.strictEqual(r.body.criado_por_id, 2);
  assert.strictEqual(r.body.criado_por_nome, 'Ana');
  assert(r.body.id > 0 && r.body.created_at && r.body.updated_at);
  S.alfa = r.body;
  const semEnd = await gestor('post', URL, { nome: 'Obra Beta' });
  assert.strictEqual(semEnd.status, 201);
  assert.strictEqual(semEnd.body.endereco, null);
  assert.strictEqual(semEnd.body.criado_por_nome, 'Gestor');
  S.beta = semEnd.body;
  // endereco nao-string = ausente (ajuste 9)
  const endTorto = await gestor('post', URL, { nome: 'Deposito Gama', endereco: 123 });
  assert.strictEqual(endTorto.status, 201);
  assert.strictEqual(endTorto.body.endereco, null);
  S.gama = endTorto.body;
});

test('RN-F8.27 Consulta nao cria (403); motorista e gestor sim', async () => {
  const c = await consulta('post', URL, { nome: 'Nao entra' });
  assert.strictEqual(c.status, 403);
  assert.strictEqual(c.body.acao, 'registrar_operacoes');
  const lista = await gestor('get', URL);
  assert(!lista.body.some((d) => d.nome === 'Nao entra'));
});

test('RN-F8.27 validacoes: nome vazio/so espacos/nao-string -> 400; > 120 -> 400; endereco > 255 -> 400', async () => {
  const casos = [
    [{}, MSG_NOME],
    [{ nome: '' }, MSG_NOME],
    [{ nome: '   ' }, MSG_NOME],
    [{ nome: null }, MSG_NOME],
    [{ nome: 123 }, MSG_NOME],
    [{ nome: {} }, MSG_NOME],
    [{ nome: ['Lista'] }, MSG_NOME],
    [{ nome: 'x'.repeat(121) }, MSG_NOME_LONGO],
    [{ nome: 'Ok', endereco: 'y'.repeat(256) }, MSG_END_LONGO],
  ];
  for (const [corpo, msg] of casos) {
    const r = await ana('post', URL, corpo);
    assert.strictEqual(r.status, 400, `${JSON.stringify(corpo)} -> ${r.status} ${JSON.stringify(r.body)}`);
    assert.strictEqual(r.body.error, msg, JSON.stringify(corpo));
  }
  // os limites exatos passam
  const ok120 = await ana('post', URL, { nome: 'z'.repeat(120), endereco: 'w'.repeat(255) });
  assert.strictEqual(ok120.status, 201, JSON.stringify(ok120.body));
  S.longo = ok120.body;
  // espacos em volta nao contam para o limite
  const comEspacos = await ana('post', URL, { nome: `  ${'q'.repeat(120)}  ` });
  assert.strictEqual(comEspacos.status, 201, JSON.stringify(comEspacos.body));
  S.longo2 = comEspacos.body;
});

// ── RN-F8.28 ───────────────────────────────────────────────────────────────────────────────────
test('RN-F8.28 nome ja ativo (outra caixa, outros espacos) -> 409 DESTINO_DUPLICADO com a linha existente (ajuste T-1)', async () => {
  const r = await ana('post', URL, { nome: 'cliente   ALFA' });
  assert.strictEqual(r.status, 409, JSON.stringify(r.body));
  assert.strictEqual(r.body.error, MSG_DUP);
  assert.strictEqual(r.body.code, 'DESTINO_DUPLICADO');
  assert(r.body.destino, 'a linha existente viaja no corpo (err.extra)');
  assert.strictEqual(r.body.destino.id, S.alfa.id);
  assert.strictEqual(r.body.destino.nome, 'Cliente Alfa');
  assert.strictEqual(r.body.destino.ativo, 1);
  // pelo gestor tambem
  const g = await gestor('post', URL, { nome: 'OBRA BETA' });
  assert.strictEqual(g.status, 409);
  assert.strictEqual(g.body.destino.id, S.beta.id);
  // nada a mais na tabela
  const lista = await gestor('get', URL);
  assert.strictEqual(lista.body.filter((d) => d.nome.toLowerCase() === 'cliente alfa').length, 1);
});

// ── RN-F8.29 ───────────────────────────────────────────────────────────────────────────────────
test('RN-F8.29 GET: todo perfil le; ativos por nome; ?search= em nome e endereco', async () => {
  const c = await consulta('get', URL);
  assert.strictEqual(c.status, 200);
  const nomes = c.body.map((d) => d.nome);
  assert.deepStrictEqual(nomes, [...nomes].sort((a, b) => a.localeCompare(b)), 'por nome');
  assert(nomes.includes('Cliente Alfa') && nomes.includes('Obra Beta') && nomes.includes('Deposito Gama'));
  assert(c.body.every((d) => d.ativo === 1));
  assert.deepStrictEqual(Object.keys(c.body[0]).sort(),
    ['ativo', 'created_at', 'criado_por_id', 'criado_por_nome', 'endereco', 'id', 'nome', 'updated_at']);
  const m = await ana('get', URL);
  assert.strictEqual(m.status, 200);
  assert.strictEqual(m.body.length, c.body.length, 'o motorista le a mesma lista');
  const porNome = await ana('get', `${URL}?search=beta`);
  assert.deepStrictEqual(porNome.body.map((d) => d.nome), ['Obra Beta']);
  const porEnd = await ana('get', `${URL}?search=Rua%20A`);
  assert.deepStrictEqual(porEnd.body.map((d) => d.nome), ['Cliente Alfa']);
  const nada = await ana('get', `${URL}?search=zzz-nao-existe`);
  assert.deepStrictEqual(nada.body, []);
});

// ── RN-F8.30 ───────────────────────────────────────────────────────────────────────────────────
test('RN-F8.30 motorista PUT/DELETE -> 403; gestor PUT renomeia, muda endereco e ativo (normalizado como uso_funcionarios)', async () => {
  const p = await ana('put', `${URL}/${S.gama.id}`, { nome: 'Outro' });
  assert.strictEqual(p.status, 403);
  assert.strictEqual(p.body.acao, 'gerenciar_veiculos');
  const d = await ana('delete', `${URL}/${S.gama.id}`);
  assert.strictEqual(d.status, 403);
  assert.strictEqual((await gestor('get', URL)).body.find((x) => x.id === S.gama.id).nome, 'Deposito Gama', 'nada mudou');

  const r = await gestor('put', `${URL}/${S.gama.id}`, { nome: '  Deposito   Gama  2 ', endereco: 'Av. B, 200' });
  assert.strictEqual(r.status, 200, JSON.stringify(r.body));
  assert.strictEqual(r.body.nome, 'Deposito Gama 2');
  assert.strictEqual(r.body.endereco, 'Av. B, 200');
  assert.strictEqual(r.body.ativo, 1);
  // so o endereco: o nome fica
  const soEnd = await gestor('put', `${URL}/${S.gama.id}`, { endereco: 'Av. C' });
  assert.strictEqual(soEnd.body.nome, 'Deposito Gama 2');
  assert.strictEqual(soEnd.body.endereco, 'Av. C');
  // ativo como o select manda ('0'/'1') e como booleano
  const off = await gestor('put', `${URL}/${S.gama.id}`, { ativo: '0' });
  assert.strictEqual(off.status, 200);
  assert.strictEqual(off.body.ativo, 0);
  const on = await gestor('put', `${URL}/${S.gama.id}`, { ativo: true });
  assert.strictEqual(on.body.ativo, 1);
  const off2 = await gestor('put', `${URL}/${S.gama.id}`, { ativo: false });
  assert.strictEqual(off2.body.ativo, 0);
  const on2 = await gestor('put', `${URL}/${S.gama.id}`, { ativo: 1 });
  assert.strictEqual(on2.body.ativo, 1);
  // validacoes do PUT
  const vazio = await gestor('put', `${URL}/${S.gama.id}`, { nome: '  ' });
  assert.strictEqual(vazio.status, 400);
  assert.strictEqual(vazio.body.error, MSG_NOME);
  const longo = await gestor('put', `${URL}/${S.gama.id}`, { nome: 'x'.repeat(121) });
  assert.strictEqual(longo.body.error, MSG_NOME_LONGO);
  const endLongo = await gestor('put', `${URL}/${S.gama.id}`, { endereco: 'y'.repeat(256) });
  assert.strictEqual(endLongo.body.error, MSG_END_LONGO);
});

test('RN-F8.30 renomear para nome ja ativo -> 409 DESTINO_DUPLICADO com a linha do outro; o proprio nome em outra caixa passa', async () => {
  const r = await gestor('put', `${URL}/${S.gama.id}`, { nome: 'CLIENTE alfa' });
  assert.strictEqual(r.status, 409, JSON.stringify(r.body));
  assert.strictEqual(r.body.code, 'DESTINO_DUPLICADO');
  assert.strictEqual(r.body.destino.id, S.alfa.id);
  assert.strictEqual((await gestor('get', URL)).body.find((x) => x.id === S.gama.id).nome, 'Deposito Gama 2', 'nada gravado');
  // mudar so a caixa do proprio nome nao bate no indice (e a mesma linha)
  const caixa = await gestor('put', `${URL}/${S.gama.id}`, { nome: 'DEPOSITO GAMA 2' });
  assert.strictEqual(caixa.status, 200, JSON.stringify(caixa.body));
  assert.strictEqual(caixa.body.nome, 'DEPOSITO GAMA 2');
});

test('RN-F8.30 PUT/DELETE inexistente -> 404 (ajuste T-7)', async () => {
  const p = await gestor('put', `${URL}/99999`, { nome: 'Nada' });
  assert.strictEqual(p.status, 404);
  assert.strictEqual(p.body.error, MSG_404);
  const d = await gestor('delete', `${URL}/99999`);
  assert.strictEqual(d.status, 404);
  assert.strictEqual(d.body.error, MSG_404);
  const torto = await gestor('delete', `${URL}/abc`);
  assert.strictEqual(torto.status, 404);
  // sem GET /destinos/:id (sem getOne) — declarado no plano
  const um = await gestor('get', `${URL}/${S.alfa.id}`);
  assert.strictEqual(um.status, 404);
});

test('RN-F8.30/29 DELETE desativa ({ success: true }); some da lista; ?inativos=1 traz com ativo 0', async () => {
  const d = await gestor('delete', `${URL}/${S.beta.id}`);
  assert.strictEqual(d.status, 200);
  assert.deepStrictEqual(d.body, { success: true });
  const ativos = await ana('get', URL);
  assert(!ativos.body.some((x) => x.id === S.beta.id), 'desativado nao aparece na lista padrao');
  const todos = await gestor('get', `${URL}?inativos=1`);
  const beta = todos.body.find((x) => x.id === S.beta.id);
  assert(beta, 'com ?inativos=1 aparece');
  assert.strictEqual(beta.ativo, 0);
  assert(todos.body.length > ativos.body.length);
  const comTrue = await gestor('get', `${URL}?inativos=true`);
  assert(comTrue.body.some((x) => x.id === S.beta.id));
  const comZero = await gestor('get', `${URL}?inativos=0`);
  assert(!comZero.body.some((x) => x.id === S.beta.id), "'0' e falso");
  // busca tambem respeita o filtro
  const busca = await gestor('get', `${URL}?inativos=1&search=obra`);
  assert.deepStrictEqual(busca.body.map((x) => x.id), [S.beta.id]);
});

test('RN-F8.28 desativado libera o nome: cria outro ativo igual (201); reativar o velho -> 409 com o novo (B82)', async () => {
  const novo = await ana('post', URL, { nome: 'obra beta' });
  assert.strictEqual(novo.status, 201, JSON.stringify(novo.body));
  assert.notStrictEqual(novo.id, S.beta.id);
  S.beta2 = novo.body;
  const reativar = await gestor('put', `${URL}/${S.beta.id}`, { ativo: 1 });
  assert.strictEqual(reativar.status, 409, JSON.stringify(reativar.body));
  assert.strictEqual(reativar.body.code, 'DESTINO_DUPLICADO');
  assert.strictEqual(reativar.body.destino.id, S.beta2.id);
  const velho = (await gestor('get', `${URL}?inativos=1`)).body.find((x) => x.id === S.beta.id);
  assert.strictEqual(velho.ativo, 0, 'continua desativado');
  // desativando o novo, o velho reativa
  await gestor('delete', `${URL}/${S.beta2.id}`);
  const ok = await gestor('put', `${URL}/${S.beta.id}`, { ativo: '1' });
  assert.strictEqual(ok.status, 200, JSON.stringify(ok.body));
  assert.strictEqual(ok.body.ativo, 1);
});

(async () => {
  ctx = await createFrotasTestApp();
  console.log('\nFrota Etapa 8 — G2 (destinos cadastrados)\n');
  for (const [name, fn] of testes) {
    try { await fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { failed++; console.error(`  ✗ ${name}: ${e.message}`); }
  }
  console.log(`\nResultado: ${passed} passou, ${failed} falhou\n`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
