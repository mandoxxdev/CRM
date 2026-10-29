/**
 * Frota Etapa 9 (S1) — destino da lista na Viagem do gestor (B89 desfaz a B79) e o endereco da GMP na origem.
 *
 *   RN-F9.10  POST/PUT /viagens aceitam destino_id, resolvido DENTRO da fila de viagens: destino ATIVO -> grava destino = nome e
 *             destino_id; senao 400 `Destino não encontrado` (nada gravado). Com destino_id e destino texto, o id manda
 *   RN-F9.11  POST sem destino_id (ausente/null/'') -> o texto `destino` como antes (compat da API)
 *   RN-F9.12  PUT: destino_id ausente/null/'' -> mantem destino e destino_id; igual ao gravado -> aceito mesmo com o destino
 *             desativado depois, sem renomear
 *   A3        destino_id numero ou texto so de digitos; "igual ao gravado" compara depois de Number()
 *   A5        mesmo id, destino ativo renomeado -> a viagem mantem o nome gravado
 *   RN-F9.21  endereco da GMP de configuracoes (empresa_endereco/cidade/estado/cep): `<endereco>, <cidade>/<UF>, CEP <cep>`, partes
 *             vazias saem; tabela ausente -> '' (nunca 500)
 *   RN-F9.22  GET /meta.origemEndereco; GET /portal/inicio.origem = { nome: 'GMP', endereco }
 *
 * Decisao do executor (registrada no plano): no PUT sem destino_id, um texto `destino` DIFERENTE do gravado (API antiga) grava o texto
 * e solta o destino_id (ele deixaria de nomear o destino gravado); o mesmo texto mantem o id.
 *
 * Plano: docs/superpowers/plans/2026-10-29-frotas-etapa9-endereco-do-destino.md
 * Executar: cd server && node tests/api/frotasViagemDestinoGestor.api.test.js
 */
const assert = require('assert');
const { createFrotasTestApp, ADMIN, MOTORISTA } = require('../helpers/frotasTestApp');
const { comEndereco } = require('../helpers/frotasDestinoFixture');
const { dbGet, dbRun } = require('../../services/frotas/db');
const { naFilaDeViagens } = require('../../services/frotas/filaDeViagens');
const { esperarFilaDeViagens } = require('../helpers/esperarFilaDeViagens');

let passed = 0; let failed = 0;
const testes = [];
function test(name, fn) { testes.push([name, fn]); }

let ctx;
const S = {};
const ana = (m, u, c) => ctx.como(MOTORISTA)(m, u, c);
const gestor = (m, u, c) => ctx.como(ADMIN)(m, u, c);
const VIA = '/api/frotas/viagens';
const MSG_DESTINO = 'Destino não encontrado';
const viagemDb = (id) => dbGet(ctx.db, 'SELECT * FROM frotas_viagens WHERE id = ?', [id]);
const contaViagens = async () => (await dbGet(ctx.db, 'SELECT COUNT(*) n FROM frotas_viagens')).n;

async function destino(nome) {
  const r = await gestor('post', '/api/frotas/destinos', comEndereco({ nome }));
  assert.strictEqual(r.status, 201, JSON.stringify(r.body));
  return r.body;
}
async function viagemOk(extra) {
  const r = await gestor('post', VIA, { veiculo_id: S.v.id, data_saida: '2026-10-29', ...extra });
  assert.strictEqual(r.status, 201, `${JSON.stringify(extra)} -> ${r.status} ${JSON.stringify(r.body)}`);
  return r.body;
}
async function putOk(id, corpo) {
  const r = await gestor('put', `${VIA}/${id}`, corpo);
  assert.strictEqual(r.status, 200, `${JSON.stringify(corpo)} -> ${r.status} ${JSON.stringify(r.body)}`);
  return r.body;
}

async function cenario() {
  const v = await gestor('post', '/api/frotas/veiculos', { placa: 'DST0001', km_atual: 1000 });
  assert.strictEqual(v.status, 201, JSON.stringify(v.body));
  S.v = v.body;
  S.alfa = await destino('Cliente Alfa');
  S.beta = await destino('Obra Beta');
  S.desat = await destino('Antigo');
  assert.strictEqual((await gestor('delete', `/api/frotas/destinos/${S.desat.id}`)).status, 200);
}

// ── RN-F9.10 ───────────────────────────────────────────────────────────────────────────────────
test('RN-F9.10 POST com destino_id ativo grava destino = nome e destino_id; com texto tambem, o id manda; A3 texto de digitos', async () => {
  const v1 = await viagemOk({ destino_id: S.alfa.id });
  assert.strictEqual(v1.destino, 'Cliente Alfa');
  assert.strictEqual(v1.destino_id, S.alfa.id);
  const v2 = await viagemOk({ destino_id: S.beta.id, destino: 'Ignorado' });
  assert.strictEqual(v2.destino, 'Obra Beta');
  assert.strictEqual(v2.destino_id, S.beta.id);
  const v3 = await viagemOk({ destino_id: ` ${S.alfa.id} ` }); // o select do formulario manda texto
  assert.strictEqual(v3.destino_id, S.alfa.id);
  assert.strictEqual((await viagemDb(v3.id)).destino, 'Cliente Alfa');
  S.viagemAlfa = v1;
});

test('RN-F9.10 POST com destino_id inexistente/desativado/torto -> 400 Destino não encontrado; nada gravado', async () => {
  const antes = await contaViagens();
  for (const destino_id of [99999, S.desat.id, String(S.desat.id), 'abc', 0, -1, '12.5', 1.5, true, {}, [], '1e1']) {
    const r = await gestor('post', VIA, { veiculo_id: S.v.id, destino_id, destino: 'Ignorado' });
    assert.strictEqual(r.status, 400, `${JSON.stringify(destino_id)} -> ${r.status} ${JSON.stringify(r.body)}`);
    assert.strictEqual(r.body.error, MSG_DESTINO, JSON.stringify(destino_id));
  }
  assert.strictEqual(await contaViagens(), antes);
});

test('RN-F9.10 o destino e resolvido DENTRO da fila: desativado enquanto o POST espera -> 400, nada gravado', async () => {
  const efemero = await destino('Efemero');
  const antes = await contaViagens();
  let soltar;
  const gancho = new Promise((r) => { soltar = r; });
  const segurando = naFilaDeViagens(() => gancho);
  const post = gestor('post', VIA, { veiculo_id: S.v.id, destino_id: efemero.id }).then((r) => r);
  // o gancho que segura a fila + a requisicao, ja dentro dela (sem pausa fixa); se nao chegar, solta o gancho antes de falhar (senao a fila fica presa e o arquivo inteiro trava)
  await esperarFilaDeViagens(2).catch((e) => { soltar(); throw e; });
  await gestor('delete', `/api/frotas/destinos/${efemero.id}`);
  soltar();
  await segurando;
  const r = await post;
  assert.strictEqual(r.status, 400, JSON.stringify(r.body));
  assert.strictEqual(r.body.error, MSG_DESTINO);
  assert.strictEqual(await contaViagens(), antes);
});

// ── RN-F9.11 ───────────────────────────────────────────────────────────────────────────────────
test('RN-F9.11 POST sem destino_id (ausente, null, "") -> o texto destino como antes, destino_id null', async () => {
  for (const extra of [{}, { destino_id: null }, { destino_id: '' }]) {
    const v = await viagemOk({ ...extra, destino: 'Cliente Texto' });
    assert.strictEqual(v.destino, 'Cliente Texto', JSON.stringify(extra));
    assert.strictEqual(v.destino_id, null, JSON.stringify(extra));
  }
  const semNada = await viagemOk({});
  assert.strictEqual(semNada.destino, null);
  assert.strictEqual(semNada.destino_id, null);
  S.viagemTexto = semNada;
});

// ── RN-F9.12 ───────────────────────────────────────────────────────────────────────────────────
test('RN-F9.12 PUT com destino_id ausente/null/"" mantem destino e destino_id gravados', async () => {
  const id = S.viagemAlfa.id;
  for (const corpo of [{ km_saida: 1001 }, { km_saida: 1002, destino_id: null }, { km_saida: 1003, destino_id: '' },
    { km_saida: 1004, destino_id: null, destino: 'Cliente Alfa' }]) {
    const r = await putOk(id, corpo);
    assert.strictEqual(r.destino, 'Cliente Alfa', JSON.stringify(corpo));
    assert.strictEqual(r.destino_id, S.alfa.id, JSON.stringify(corpo));
  }
});

test('RN-F9.12 PUT troca o destino pelo id (ativo); id desativado/inexistente -> 400 e nada muda', async () => {
  const id = S.viagemAlfa.id;
  const r = await putOk(id, { destino_id: S.beta.id, destino: 'Ignorado' });
  assert.strictEqual(r.destino, 'Obra Beta');
  assert.strictEqual(r.destino_id, S.beta.id);
  for (const destino_id of [S.desat.id, 99999, 'abc', 0]) {
    const x = await gestor('put', `${VIA}/${id}`, { destino_id, km_saida: 5 });
    assert.strictEqual(x.status, 400, `${JSON.stringify(destino_id)} -> ${x.status} ${JSON.stringify(x.body)}`);
    assert.strictEqual(x.body.error, MSG_DESTINO);
  }
  const gravada = await viagemDb(id);
  assert.deepStrictEqual([gravada.destino, gravada.destino_id, gravada.km_saida], ['Obra Beta', S.beta.id, 1004]);
  // volta para o Alfa para os proximos
  assert.strictEqual((await putOk(id, { destino_id: S.alfa.id })).destino, 'Cliente Alfa');
});

test('RN-F9.12/A3 viagem cujo destino foi desativado depois: editar so o km com o MESMO id (numero ou texto) -> 200, destino mantido', async () => {
  const gama = await destino('Deposito Gama');
  const v = await viagemOk({ destino_id: gama.id });
  assert.strictEqual((await gestor('delete', `/api/frotas/destinos/${gama.id}`)).status, 200);
  for (const destino_id of [gama.id, String(gama.id), ` ${gama.id}`]) {
    const r = await putOk(v.id, { destino_id, destino: 'Deposito Gama', km_saida: 1100 });
    assert.strictEqual(r.destino, 'Deposito Gama', JSON.stringify(destino_id));
    assert.strictEqual(r.destino_id, gama.id, JSON.stringify(destino_id));
    assert.strictEqual(r.km_saida, 1100);
  }
  // outra viagem nao pode ESCOLHER o desativado
  const outra = await gestor('put', `${VIA}/${S.viagemTexto.id}`, { destino_id: gama.id });
  assert.strictEqual(outra.status, 400);
  assert.strictEqual(outra.body.error, MSG_DESTINO);
});

test('A5 mesmo id com o destino ativo renomeado -> a viagem mantem o nome gravado (nao renomeia)', async () => {
  const id = S.viagemAlfa.id;
  const ren = await gestor('put', `/api/frotas/destinos/${S.alfa.id}`, { nome: 'Cliente Alfa Renomeado' });
  assert.strictEqual(ren.status, 200, JSON.stringify(ren.body));
  const r = await putOk(id, { destino_id: S.alfa.id, km_saida: 1005 });
  assert.strictEqual(r.destino, 'Cliente Alfa');
  assert.strictEqual(r.destino_id, S.alfa.id);
  // escolher de novo uma viagem que estava em OUTRO destino grava o nome atual
  const v = await putOk(S.viagemTexto.id, { destino_id: String(S.alfa.id) });
  assert.strictEqual(v.destino, 'Cliente Alfa Renomeado');
  assert.strictEqual(v.destino_id, S.alfa.id);
});

test('RN-F9.12 (decisao S1) PUT sem destino_id com texto destino DIFERENTE grava o texto e solta o destino_id', async () => {
  const v = await viagemOk({ destino_id: S.beta.id });
  const r = await putOk(v.id, { destino: 'Outro lugar digitado' });
  assert.strictEqual(r.destino, 'Outro lugar digitado');
  assert.strictEqual(r.destino_id, null);
});

test('RN-F9.10 o motorista (registrar_operacoes) tambem passa pela mesma regua no POST /viagens', async () => {
  const m = await gestor('post', '/api/frotas/motoristas', { nome: 'Ana Motorista', usuario_id: 2 });
  assert.strictEqual(m.status, 201, JSON.stringify(m.body));
  const r = await ana('post', VIA, { veiculo_id: S.v.id, destino_id: S.desat.id });
  assert.strictEqual(r.status, 400, JSON.stringify(r.body));
  assert.strictEqual(r.body.error, MSG_DESTINO);
  const ok = await ana('post', VIA, { veiculo_id: S.v.id, destino_id: S.beta.id });
  assert.strictEqual(ok.status, 201, JSON.stringify(ok.body));
  assert.strictEqual(ok.body.destino, 'Obra Beta');
});

// ── RN-F9.21 / 22 ──────────────────────────────────────────────────────────────────────────────
async function origens() {
  const meta = await gestor('get', '/api/frotas/meta');
  assert.strictEqual(meta.status, 200, JSON.stringify(meta.body));
  const ini = await ana('get', '/api/frotas/portal/inicio');
  assert.strictEqual(ini.status, 200, JSON.stringify(ini.body));
  assert.deepStrictEqual(Object.keys(ini.body.origem).sort(), ['endereco', 'nome']);
  assert.strictEqual(ini.body.origem.nome, 'GMP');
  assert.strictEqual(meta.body.origemPadrao, 'GMP', 'a origem gravada continua o texto GMP (RN-F9.20)');
  assert.strictEqual(meta.body.origemEndereco, ini.body.origem.endereco, 'a mesma fonte nos dois');
  return meta.body.origemEndereco;
}
async function config(chave, valor) {
  if (valor === undefined) await dbRun(ctx.db, 'DELETE FROM configuracoes WHERE chave = ?', [chave]);
  else await dbRun(ctx.db, 'INSERT OR REPLACE INTO configuracoes (chave, valor) VALUES (?, ?)', [chave, valor]);
}

test('RN-F9.21/22 sem a tabela configuracoes (o harness nao cria) -> origemEndereco "" e origem.endereco "", nunca 500', async () => {
  const t = await dbGet(ctx.db, "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'configuracoes'");
  assert.strictEqual(t, undefined, 'controle: a tabela nao existe');
  assert.strictEqual(await origens(), '');
});

test('RN-F9.21/22 com Configuracoes -> Empresa: endereco montado; partes vazias saem', async () => {
  await dbRun(ctx.db, 'CREATE TABLE configuracoes (id INTEGER PRIMARY KEY AUTOINCREMENT, chave TEXT UNIQUE NOT NULL, valor TEXT)');
  assert.strictEqual(await origens(), '', 'tabela vazia');
  await config('empresa_endereco', 'Av. Angelo Demarchi 130, Batistini');
  await config('empresa_cidade', 'São Bernardo do Campo');
  await config('empresa_estado', 'SP');
  await config('empresa_cep', '09844-100');
  await config('empresa_nome', 'GMP Industriais'); // nao entra no endereco
  assert.strictEqual(await origens(), 'Av. Angelo Demarchi 130, Batistini, São Bernardo do Campo/SP, CEP 09844-100');
  await config('empresa_cep', '09844100'); // CEP so de digitos sai com o hifen
  assert.strictEqual(await origens(), 'Av. Angelo Demarchi 130, Batistini, São Bernardo do Campo/SP, CEP 09844-100');
  await config('empresa_cep', '  ');
  assert.strictEqual(await origens(), 'Av. Angelo Demarchi 130, Batistini, São Bernardo do Campo/SP', 'sem CEP termina em /SP');
  await config('empresa_cep', undefined);
  assert.strictEqual(await origens(), 'Av. Angelo Demarchi 130, Batistini, São Bernardo do Campo/SP');
  await config('empresa_cidade', undefined);
  await config('empresa_estado', null);
  assert.strictEqual(await origens(), 'Av. Angelo Demarchi 130, Batistini', 'sem cidade e sem estado: so o endereco');
  await config('empresa_estado', 'SP');
  assert.strictEqual(await origens(), 'Av. Angelo Demarchi 130, Batistini, SP');
  await config('empresa_endereco', '');
  await config('empresa_estado', undefined);
  assert.strictEqual(await origens(), '');
});

test('RN-F9.24/RN-F9.20 (servidor) POST sem origem grava o texto GMP; origem antiga diferente fica no PUT; origem NULL ganha GMP', async () => {
  for (const extra of [{}, { origem: null }, { origem: '' }, { origem: '  ' }]) {
    const v = await viagemOk(extra);
    assert.strictEqual(v.origem, 'GMP', JSON.stringify(extra));
  }
  const matriz = await viagemOk({ origem: 'Matriz' });
  assert.strictEqual(matriz.origem, 'Matriz');
  const r = await putOk(matriz.id, { km_saida: 10 }); // o formulario novo nao manda origem
  assert.strictEqual(r.origem, 'Matriz', 'a origem gravada (Origem gravada: Matriz) fica');
  assert.strictEqual((await putOk(matriz.id, { origem: null, km_saida: 11 })).origem, 'Matriz');
  // viagem antiga com origem NULL (antes da Etapa 8): salvar sem origem grava GMP
  await dbRun(ctx.db, 'UPDATE frotas_viagens SET origem = NULL WHERE id = ?', [matriz.id]);
  assert.strictEqual((await putOk(matriz.id, { km_saida: 12 })).origem, 'GMP');
  // nada de endereco na viagem (B94): a coluna origem guarda so o texto
  assert.strictEqual((await viagemDb(matriz.id)).origem, 'GMP');
});

(async () => {
  ctx = await createFrotasTestApp();
  await cenario();
  console.log('\nFrota Etapa 9 — S1 (destino da lista na viagem do gestor; endereco da GMP)\n');
  for (const [name, fn] of testes) {
    try { await fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { failed++; console.error(`  ✗ ${name}: ${e.message}`); }
  }
  console.log(`\nResultado: ${passed} passou, ${failed} falhou\n`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
