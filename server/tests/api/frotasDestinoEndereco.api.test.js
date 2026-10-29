/**
 * Frota Etapa 9 (S1) — endereco estruturado do destino (feature 23): /api/frotas/destinos e /portal/inicio.destinos.
 *
 *   RN-F9.01  frotas_destinos ganha cep, logradouro, numero, complemento, bairro, cidade, uf (safeAlter); boot numa base da Etapa 8 ->
 *             colunas novas, linhas antigas intactas
 *   RN-F9.02  POST exige rua, numero, bairro, cidade e UF (CEP e complemento opcionais), na ordem e com as mensagens do contrato
 *   RN-F9.03  CEP: so digitos contam; 8 digitos -> `00000-000`; outro tamanho -> 400; so nao-digitos ("-") = ausente
 *   RN-F9.04  UF: as 27 siglas; minuscula vira maiuscula; fora da lista -> 400
 *   RN-F9.05  nao-string = ausente; aparado; espacos internos colapsados; limites (rua 150, numero 20, complemento 60, bairro 80,
 *             cidade 80)
 *   RN-F9.06  `endereco` montado pelo servidor; o `endereco` do corpo e ignorado
 *   RN-F9.07  PUT: qualquer das 7 chaves -> o endereco final (corpo sobre o gravado) passa pela regua inteira; sem nenhuma, nao muda
 *   A1        no PUT, presente = `!== undefined`; obrigatorio null/'' -> `Informe...`; cep/complemento null/'' apagam
 *   A2        destino ANTIGO (sem logradouro) com as 7 chaves vazias -> o endereco nao muda e o PUT passa; destino estruturado com
 *             tudo vazio -> 400 `Informe a rua (logradouro) do destino`
 *   RN-F9.08  busca tambem por cidade, bairro e CEP; A7: termo so de digitos acha o CEP gravado com hifen
 *   RN-F9.09  /portal/inicio.destinos = { id, nome, endereco, cidade, uf }
 *   A8        POST: nome ja ativo -> 409 com o existente ANTES de conferir o endereco (mesmo sem endereco)
 *
 * Plano: docs/superpowers/plans/2026-10-29-frotas-etapa9-endereco-do-destino.md
 * Executar: cd server && node tests/api/frotasDestinoEndereco.api.test.js
 */
const assert = require('assert');
const sqlite3 = require('sqlite3').verbose();
const { createFrotasTestApp, ADMIN, MOTORISTA } = require('../helpers/frotasTestApp');
const { ENDERECO_OK, ENDERECO_OK_MONTADO, comEndereco } = require('../helpers/frotasDestinoFixture');
const { dbRun, dbGet, dbAll } = require('../../services/frotas/db');
const { initSchema } = require('../../services/frotas/schema');

let passed = 0; let failed = 0;
const testes = [];
function test(name, fn) { testes.push([name, fn]); }

let ctx;
const S = {};
const ana = (m, u, c) => ctx.como(MOTORISTA)(m, u, c);
const gestor = (m, u, c) => ctx.como(ADMIN)(m, u, c);
const URL = '/api/frotas/destinos';
const COLS_NOVAS = ['cep', 'logradouro', 'numero', 'complemento', 'bairro', 'cidade', 'uf'];
const VAZIO = { cep: '', logradouro: '', numero: '', complemento: '', bairro: '', cidade: '', uf: '' };

const M = {
  CEP: 'CEP deve ter 8 dígitos',
  RUA: 'Informe a rua (logradouro) do destino', RUA_LONGA: 'Rua: no máximo 150 caracteres',
  NUM: 'Informe o número (ou S/N)', NUM_LONGO: 'Número: no máximo 20 caracteres',
  COMPL_LONGO: 'Complemento: no máximo 60 caracteres',
  BAIRRO: 'Informe o bairro do destino', BAIRRO_LONGO: 'Bairro: no máximo 80 caracteres',
  CIDADE: 'Informe a cidade do destino', CIDADE_LONGA: 'Cidade: no máximo 80 caracteres',
  UF: 'Informe o estado (UF) do destino', UF_INV: 'Estado (UF) inválido',
};

let seq = 0;
const nomeNovo = () => `Destino ${++seq}`;
const conta = async () => (await dbGet(ctx.db, 'SELECT COUNT(*) n FROM frotas_destinos')).n;

async function criaOk(quem, corpo) {
  const r = await quem('post', URL, corpo);
  assert.strictEqual(r.status, 201, `${JSON.stringify(corpo)} -> ${r.status} ${JSON.stringify(r.body)}`);
  return r.body;
}
async function postRecusado(corpo, msg) {
  const antes = await conta();
  const r = await ana('post', URL, corpo);
  assert.strictEqual(r.status, 400, `${JSON.stringify(corpo)} -> ${r.status} ${JSON.stringify(r.body)}`);
  assert.strictEqual(r.body.error, msg, JSON.stringify(corpo));
  assert.strictEqual(await conta(), antes, 'nada gravado');
}
/** Destino da Etapa 8 (so nome e endereco texto), gravado direto no banco. */
async function destinoAntigo(nome, endereco) {
  const r = await dbRun(ctx.db, 'INSERT INTO frotas_destinos (nome, endereco, ativo) VALUES (?, ?, 1)', [nome, endereco]);
  return dbGet(ctx.db, 'SELECT * FROM frotas_destinos WHERE id = ?', [r.lastID]);
}

// ── RN-F9.01 ───────────────────────────────────────────────────────────────────────────────────
test('RN-F9.01 boot numa base da Etapa 8: as 7 colunas entram, a linha antiga fica intacta; o segundo boot nao quebra', async () => {
  const db = new sqlite3.Database(':memory:');
  // a tabela como a Etapa 8 a criou (sem as colunas novas)
  await dbRun(db, `CREATE TABLE frotas_destinos (id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT NOT NULL, endereco TEXT,
    ativo INTEGER DEFAULT 1, criado_por_id INTEGER, criado_por_nome TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
  await dbRun(db, "INSERT INTO frotas_destinos (nome, endereco, criado_por_nome) VALUES ('Obra Velha', 'Rua Velha, 1', 'Ana')");
  const antes = (await dbAll(db, 'PRAGMA table_info(frotas_destinos)')).map((c) => c.name);
  for (const c of COLS_NOVAS) assert(!antes.includes(c), `controle: ${c} nao existia`);
  await initSchema(db);
  await initSchema(db); // safeAlter: coluna ja existe e engolida
  const depois = (await dbAll(db, 'PRAGMA table_info(frotas_destinos)')).map((c) => c.name);
  for (const c of COLS_NOVAS) assert(depois.includes(c), `frotas_destinos.${c}`);
  const linha = await dbGet(db, "SELECT * FROM frotas_destinos WHERE nome = 'Obra Velha'");
  assert.strictEqual(linha.endereco, 'Rua Velha, 1');
  assert.strictEqual(linha.criado_por_nome, 'Ana');
  for (const c of COLS_NOVAS) assert.strictEqual(linha[c], null, c);
  await new Promise((r) => db.close(r));
});

// ── RN-F9.02 ───────────────────────────────────────────────────────────────────────────────────
test('RN-F9.02 cada obrigatorio ausente -> 400 com a mensagem literal; nada gravado; CEP e complemento sao opcionais', async () => {
  for (const [chave, msg] of [['logradouro', M.RUA], ['numero', M.NUM], ['bairro', M.BAIRRO], ['cidade', M.CIDADE], ['uf', M.UF]]) {
    const corpo = comEndereco({ nome: nomeNovo() });
    delete corpo[chave];
    await postRecusado(corpo, msg);
    await postRecusado({ ...corpo, [chave]: '   ' }, msg);
  }
  // sem bairro (o cenario da tabela) -> a mensagem do bairro
  await postRecusado({ nome: nomeNovo(), logradouro: 'Rua A', numero: '1', cidade: 'Santo André', uf: 'SP' }, M.BAIRRO);
  // so o nome -> a primeira da ordem (rua)
  await postRecusado({ nome: nomeNovo() }, M.RUA);
  const ok = await criaOk(ana, comEndereco({ nome: nomeNovo() }));
  assert.strictEqual(ok.cep, null);
  assert.strictEqual(ok.complemento, null);
  assert.strictEqual(ok.criado_por_nome, 'Ana');
});

test('RN-F9.02 a ordem das conferencias e a do contrato: cep -> rua -> numero -> complemento -> bairro -> cidade -> uf', async () => {
  const tudoRuim = {
    nome: nomeNovo(), cep: '123', logradouro: '', numero: '', complemento: 'c'.repeat(61), bairro: '', cidade: '', uf: 'XX',
  };
  const ordem = [
    ['cep', '09844100', M.RUA], ['logradouro', 'Rua A', M.NUM], ['numero', '1', M.COMPL_LONGO], ['complemento', '', M.BAIRRO],
    ['bairro', 'Centro', M.CIDADE], ['cidade', 'Santo André', M.UF_INV],
  ];
  await postRecusado(tudoRuim, M.CEP);
  const corpo = { ...tudoRuim };
  for (const [chave, valorBom, proxima] of ordem) {
    corpo[chave] = valorBom;
    await postRecusado(corpo, proxima);
  }
  corpo.uf = 'sp';
  await criaOk(ana, corpo);
});

// ── RN-F9.03 ───────────────────────────────────────────────────────────────────────────────────
test('RN-F9.03 CEP: "09844100" e "09.844-100" -> 09844-100; "0984" e 9 digitos -> 400; "-" e "" = ausente', async () => {
  assert.strictEqual((await criaOk(ana, comEndereco({ nome: nomeNovo(), cep: '09844100' }))).cep, '09844-100');
  assert.strictEqual((await criaOk(ana, comEndereco({ nome: nomeNovo(), cep: ' 09.844-100 ' }))).cep, '09844-100');
  await postRecusado(comEndereco({ nome: nomeNovo(), cep: '0984' }), M.CEP);
  await postRecusado(comEndereco({ nome: nomeNovo(), cep: '098441001' }), M.CEP);
  await postRecusado(comEndereco({ nome: nomeNovo(), cep: 'abc1' }), M.CEP);
  for (const cep of ['-', '', '  ', null, 9844100]) { // nao-string = ausente (RN-F9.05)
    const d = await criaOk(ana, comEndereco({ nome: nomeNovo(), cep }));
    assert.strictEqual(d.cep, null, JSON.stringify(cep));
    assert.strictEqual(d.endereco, ENDERECO_OK_MONTADO, 'sem CEP termina em /SP');
  }
});

// ── RN-F9.04 ───────────────────────────────────────────────────────────────────────────────────
test('RN-F9.04 UF: "sp" e " rj " gravam maiuscula; "XX", "S", "SPP", "São Paulo" -> 400 Estado (UF) inválido; as 27 siglas passam', async () => {
  assert.strictEqual((await criaOk(ana, comEndereco({ nome: nomeNovo(), uf: 'sp' }))).uf, 'SP');
  assert.strictEqual((await criaOk(ana, comEndereco({ nome: nomeNovo(), uf: ' rj ' }))).uf, 'RJ');
  for (const uf of ['XX', 'S', 'SPP', 'São Paulo', 'S P']) await postRecusado(comEndereco({ nome: nomeNovo(), uf }), M.UF_INV);
  for (const uf of ['', null, 35]) await postRecusado(comEndereco({ nome: nomeNovo(), uf }), M.UF);
  const siglas = 'AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' ');
  assert.strictEqual(siglas.length, 27);
  for (const uf of siglas) assert.strictEqual((await criaOk(gestor, comEndereco({ nome: `UF ${uf}`, uf }))).uf, uf);
});

// ── RN-F9.05 ───────────────────────────────────────────────────────────────────────────────────
test('RN-F9.05 nao-string = ausente; aparado; espacos internos colapsados; limites exatos passam e o seguinte cai', async () => {
  for (const v of [123, {}, ['Rua'], true]) await postRecusado(comEndereco({ nome: nomeNovo(), logradouro: v }), M.RUA);
  await postRecusado(comEndereco({ nome: nomeNovo(), numero: 100 }), M.NUM); // numero tem de vir texto
  const d = await criaOk(ana, comEndereco({
    nome: nomeNovo(), logradouro: '  Rua   das   Flores ', numero: ' 100 ', complemento: ' Sala   2 ', bairro: ' Centro ',
    cidade: ' São   Bernardo do Campo ',
  }));
  assert.deepStrictEqual([d.logradouro, d.numero, d.complemento, d.bairro, d.cidade],
    ['Rua das Flores', '100', 'Sala 2', 'Centro', 'São Bernardo do Campo']);
  const limites = [['logradouro', 150, M.RUA_LONGA], ['numero', 20, M.NUM_LONGO], ['complemento', 60, M.COMPL_LONGO],
    ['bairro', 80, M.BAIRRO_LONGO], ['cidade', 80, M.CIDADE_LONGA]];
  for (const [chave, max, msg] of limites) {
    const ok = await criaOk(ana, comEndereco({ nome: nomeNovo(), [chave]: `  ${'a'.repeat(max)}  ` }));
    assert.strictEqual(ok[chave].length, max, chave);
    await postRecusado(comEndereco({ nome: nomeNovo(), [chave]: 'a'.repeat(max + 1) }), msg);
  }
});

// ── RN-F9.06 ───────────────────────────────────────────────────────────────────────────────────
test('RN-F9.06 endereco montado (com e sem complemento/CEP); o endereco do corpo e ignorado; a linha tem o contrato inteiro', async () => {
  const completo = await criaOk(ana, {
    nome: 'Cliente Montado', cep: '09844100', logradouro: 'Rua das Flores', numero: '100', complemento: 'Sala 2', bairro: 'Centro',
    cidade: 'São Bernardo do Campo', uf: 'sp', endereco: 'Texto que nao entra',
  });
  assert.strictEqual(completo.endereco, 'Rua das Flores, 100 - Sala 2, Centro, São Bernardo do Campo/SP, CEP 09844-100');
  assert.deepStrictEqual(Object.keys(completo).sort(), ['ativo', 'bairro', 'cep', 'cidade', 'complemento', 'created_at',
    'criado_por_id', 'criado_por_nome', 'endereco', 'id', 'logradouro', 'nome', 'numero', 'uf', 'updated_at']);
  S.montado = completo;
  const semCompl = await criaOk(ana, comEndereco({ nome: nomeNovo(), cep: '09844-100' }));
  assert.strictEqual(semCompl.endereco, 'Rua das Flores, 100, Centro, São Bernardo do Campo/SP, CEP 09844-100');
  const semCep = await criaOk(ana, comEndereco({ nome: nomeNovo(), complemento: 'Galpão 3' }));
  assert.strictEqual(semCep.endereco, 'Rua das Flores, 100 - Galpão 3, Centro, São Bernardo do Campo/SP');
});

// ── A8 ─────────────────────────────────────────────────────────────────────────────────────────
test('A8 POST com nome ja ativo -> 409 com o existente ANTES do endereco (sem endereco, com CEP torto); nada gravado', async () => {
  const antes = await conta();
  for (const corpo of [{ nome: 'cliente   MONTADO' }, { nome: 'Cliente Montado', cep: '12' }, { nome: 'Cliente Montado', uf: 'XX' }]) {
    const r = await ana('post', URL, corpo);
    assert.strictEqual(r.status, 409, `${JSON.stringify(corpo)} -> ${r.status} ${JSON.stringify(r.body)}`);
    assert.strictEqual(r.body.code, 'DESTINO_DUPLICADO');
    assert.deepStrictEqual(r.body.destino, {
      id: S.montado.id, nome: 'Cliente Montado', endereco: S.montado.endereco, cidade: 'São Bernardo do Campo', uf: 'SP', ativo: 1,
    });
  }
  assert.strictEqual(await conta(), antes);
  // o nome invalido continua sendo o primeiro 400 (o nome vem antes de tudo)
  await postRecusado({ nome: '  ' }, 'Informe o nome do destino');
});

// ── RN-F9.07 / A1 ──────────────────────────────────────────────────────────────────────────────
test('RN-F9.07 PUT sem nenhuma das 7 chaves nao mexe no endereco (nome, ativo, endereco texto ignorado)', async () => {
  const id = S.montado.id;
  const r = await gestor('put', `${URL}/${id}`, { nome: 'Cliente Montado', ativo: 1, endereco: 'Outro texto' });
  assert.strictEqual(r.status, 200, JSON.stringify(r.body));
  for (const k of [...COLS_NOVAS, 'endereco']) assert.strictEqual(r.body[k], S.montado[k], k);
});

test('RN-F9.07/A1 PUT parcial: o corpo por cima do gravado e a regua inteira; endereco remontado', async () => {
  const id = S.montado.id;
  const num = await gestor('put', `${URL}/${id}`, { numero: ' 200 ', uf: 'mg' });
  assert.strictEqual(num.status, 200, JSON.stringify(num.body));
  assert.strictEqual(num.body.endereco, 'Rua das Flores, 200 - Sala 2, Centro, São Bernardo do Campo/MG, CEP 09844-100');
  // cep e complemento: null e '' APAGAM (A1)
  const semCompl = await gestor('put', `${URL}/${id}`, { complemento: null });
  assert.strictEqual(semCompl.status, 200, JSON.stringify(semCompl.body));
  assert.strictEqual(semCompl.body.complemento, null);
  assert.strictEqual(semCompl.body.endereco, 'Rua das Flores, 200, Centro, São Bernardo do Campo/MG, CEP 09844-100');
  const semCep = await gestor('put', `${URL}/${id}`, { cep: '' });
  assert.strictEqual(semCep.body.cep, null);
  assert.strictEqual(semCep.body.endereco, 'Rua das Flores, 200, Centro, São Bernardo do Campo/MG');
  // o resto das regras vale no PUT
  for (const [corpo, msg] of [[{ cep: '123' }, M.CEP], [{ uf: 'XX' }, M.UF_INV], [{ bairro: 'b'.repeat(81) }, M.BAIRRO_LONGO]]) {
    const r = await gestor('put', `${URL}/${id}`, corpo);
    assert.strictEqual(r.status, 400, JSON.stringify(corpo));
    assert.strictEqual(r.body.error, msg, JSON.stringify(corpo));
  }
});

test('A1 PUT com obrigatorio null ou "" -> a mensagem Informe... (nao mantem); nada gravado', async () => {
  const id = S.montado.id;
  const antes = await dbGet(ctx.db, 'SELECT * FROM frotas_destinos WHERE id = ?', [id]);
  const casos = [[{ logradouro: null }, M.RUA], [{ logradouro: '' }, M.RUA], [{ numero: '  ' }, M.NUM], [{ bairro: null }, M.BAIRRO],
    [{ cidade: '' }, M.CIDADE], [{ uf: null }, M.UF]];
  for (const [corpo, msg] of casos) {
    const r = await gestor('put', `${URL}/${id}`, corpo);
    assert.strictEqual(r.status, 400, `${JSON.stringify(corpo)} -> ${r.status} ${JSON.stringify(r.body)}`);
    assert.strictEqual(r.body.error, msg, JSON.stringify(corpo));
  }
  assert.deepStrictEqual(await dbGet(ctx.db, 'SELECT * FROM frotas_destinos WHERE id = ?', [id]), antes);
});

// ── A2 ─────────────────────────────────────────────────────────────────────────────────────────
test('A2 destino estruturado com as 7 chaves vazias (o formulario esvaziado) -> 400 Informe a rua; nada muda', async () => {
  const id = S.montado.id;
  const antes = await dbGet(ctx.db, 'SELECT * FROM frotas_destinos WHERE id = ?', [id]);
  const r = await gestor('put', `${URL}/${id}`, { nome: 'Cliente Montado', ...VAZIO, ativo: '1' });
  assert.strictEqual(r.status, 400, JSON.stringify(r.body));
  assert.strictEqual(r.body.error, M.RUA);
  const comNull = await gestor('put', `${URL}/${id}`, Object.fromEntries(COLS_NOVAS.map((k) => [k, null])));
  assert.strictEqual(comNull.status, 400);
  assert.strictEqual(comNull.body.error, M.RUA);
  assert.deepStrictEqual(await dbGet(ctx.db, 'SELECT * FROM frotas_destinos WHERE id = ?', [id]), antes);
});

test('A2/B92 destino ANTIGO (so nome/endereco texto): PUT {ativo} e PUT do formulario com as 7 vazias -> 200, endereco antigo fica', async () => {
  const velho = await destinoAntigo('Obra Antiga', 'Rua Velha, 1 - Centro');
  const reativa = await gestor('put', `${URL}/${velho.id}`, { ativo: 1 });
  assert.strictEqual(reativa.status, 200, JSON.stringify(reativa.body));
  // renomear pela tela: o formulario manda as 7 chaves vazias (e o null do campo vazio)
  for (const vazio of [VAZIO, Object.fromEntries(COLS_NOVAS.map((k) => [k, null])), { ...VAZIO, cep: '-' }]) {
    const r = await gestor('put', `${URL}/${velho.id}`, { nome: 'Obra Antiga 2', ...vazio, ativo: '1' });
    assert.strictEqual(r.status, 200, `${JSON.stringify(vazio)} -> ${JSON.stringify(r.body)}`);
    assert.strictEqual(r.body.nome, 'Obra Antiga 2');
    assert.strictEqual(r.body.endereco, 'Rua Velha, 1 - Centro', 'o endereco antigo nao foi apagado');
    for (const c of COLS_NOVAS) assert.strictEqual(r.body[c], null, c);
  }
  // completar so parte -> a regua inteira (falta o numero)
  const parcial = await gestor('put', `${URL}/${velho.id}`, { ...VAZIO, logradouro: 'Rua Nova' });
  assert.strictEqual(parcial.status, 400);
  assert.strictEqual(parcial.body.error, M.NUM);
  // completar tudo -> vira estruturado, endereco remontado
  const completo = await gestor('put', `${URL}/${velho.id}`, { ...ENDERECO_OK, cep: '09844100', complemento: '' });
  assert.strictEqual(completo.status, 200, JSON.stringify(completo.body));
  assert.strictEqual(completo.body.endereco, `${ENDERECO_OK_MONTADO}, CEP 09844-100`);
  // a partir dai ele nao e mais antigo: esvaziar -> 400
  const esvazia = await gestor('put', `${URL}/${velho.id}`, VAZIO);
  assert.strictEqual(esvazia.status, 400);
  assert.strictEqual(esvazia.body.error, M.RUA);
});

// ── RN-F9.08 / A7 ──────────────────────────────────────────────────────────────────────────────
test('RN-F9.08/A7 a busca acha por bairro, cidade e CEP (com e sem hifen); o filtro de ativos continua', async () => {
  const bat = await criaOk(gestor, {
    nome: 'Galpao Busca', cep: '09844-100', logradouro: 'Av. Angelo Demarchi', numero: '130', bairro: 'Batistini',
    cidade: 'Diadema Teste', uf: 'SP',
  });
  // cep do Galpao e unico; o "Cliente Montado" teve o CEP apagado acima
  const busca = async (termo, extra = '') => (await ana('get', `${URL}?search=${encodeURIComponent(termo)}${extra}`)).body.map((d) => d.id);
  assert.deepStrictEqual(await busca('Batistini'), [bat.id]);
  assert.deepStrictEqual(await busca('diadema teste'), [bat.id]);
  assert((await busca('09844-100')).includes(bat.id));
  assert((await busca('09844100')).includes(bat.id), 'A7: so digitos acha o gravado com hifen');
  assert((await busca('4410')).includes(bat.id), 'pedaco do CEP sem hifen');
  assert.deepStrictEqual(await busca('nao-existe-zzz'), []);
  await gestor('delete', `${URL}/${bat.id}`);
  assert.deepStrictEqual(await busca('Batistini'), []);
  assert.deepStrictEqual(await busca('Batistini', '&inativos=1'), [bat.id]);
});

// ── RN-F9.09 ───────────────────────────────────────────────────────────────────────────────────
test('RN-F9.09 /portal/inicio.destinos traz { id, nome, endereco, cidade, uf } dos ativos', async () => {
  const r = await ana('get', '/api/frotas/portal/inicio');
  assert.strictEqual(r.status, 200, JSON.stringify(r.body));
  assert(r.body.destinos.length > 0);
  for (const d of r.body.destinos) assert.deepStrictEqual(Object.keys(d).sort(), ['cidade', 'endereco', 'id', 'nome', 'uf']);
  const m = r.body.destinos.find((d) => d.id === S.montado.id);
  assert.deepStrictEqual(m, { id: S.montado.id, nome: 'Cliente Montado', endereco: 'Rua das Flores, 200, Centro, São Bernardo do Campo/MG',
    cidade: 'São Bernardo do Campo', uf: 'MG' });
  const antigo = r.body.destinos.find((d) => d.nome === 'Obra Antiga 2');
  assert(antigo && antigo.cidade === 'São Bernardo do Campo', 'o antigo completado tem cidade');
});

(async () => {
  ctx = await createFrotasTestApp();
  console.log('\nFrota Etapa 9 — S1 (endereco estruturado do destino)\n');
  for (const [name, fn] of testes) {
    try { await fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { failed++; console.error(`  ✗ ${name}: ${e.message}`); }
  }
  console.log(`\nResultado: ${passed} passou, ${failed} falhou\n`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
