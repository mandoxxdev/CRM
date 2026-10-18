/**
 * Etapa 142 (propostas) — a identidade do item no salvamento, pelo `index.js` de verdade (pasta vazia): itens iguais, variaveis manuais
 * e campos preservados (C298, C308, C309).
 *
 *   RN-142.02/05/06 C298: tirar o PRIMEIRO de dois iguais (com o id do que ficou) -> o que ficou com o SEU valor; o do que saiu, aposentado
 *   RN-142.03/06   sem id que vale, por posicao (o de antes); o que sobra e aposentado
 *   RN-142.04      C308: cada item igual preserva os SEUS campos (descricao da tabela)
 *   RN-142.07      o /premium mostra o valor certo (o reparo da leitura)
 *   RN-142.08      a coluna nova em banco novo e em banco antigo (segunda subida sobre a tabela sem a coluna)
 *   RN-142.09      id que nao vale (de outra proposta, texto, repetido) -> posicao
 *   RN-142.10      o que saiu nao volta (incluir de novo; tirar todos e incluir)
 *   RN-142.11      o PUT grava o reparo antes de parear (o legado da C298)
 *   RN-142.12      o PUT do preview grava o reparo antes (apagar o reparado apaga) e ignora item que nao e da proposta (aba velha)
 *
 * Cada cenario confere tambem as funcoes puras (variaveisManuaisItens / propostaItensDiff) contra as linhas lidas do banco: a rota faz o
 * que a funcao diz. Molde: putParcialMantem.api.test.js (pasta vazia, porta livre, morreComOPai, banco lido por fora).
 * Plano: docs/superpowers/plans/2026-10-18-almoxarifado-etapa142-itens-iguais-na-proposta.md
 * Executar: cd server && node tests/api/propostaItensIguais.api.test.js
 */
const assert = require('assert');
const fs = require('fs');
const net = require('net');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const sqlite3 = require('sqlite3');
const { planoReligacao, repararVariaveisManuais, planoMaterializacao } = require('../../variaveisManuaisItens');

const SERVER_DIR = path.join(__dirname, '..', '..');
const pausa = (ms) => new Promise((r) => setTimeout(r, ms));

let passed = 0; let failed = 0;
const testes = [];
function test(name, fn) { testes.push([name, fn]); }

// ── o servidor real ───────────────────────────────────────────────────────────────────────
let porta; let filho = null; let pasta; let logArq; let saiu = null;
async function j(m, u, tok, body, texto) {
  const r = await fetch(`http://127.0.0.1:${porta}/api${u}`, {
    method: m,
    headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: 'Bearer ' + tok } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30000),
  });
  if (texto) return [r.status, await r.text()];
  let x = null; try { x = await r.json(); } catch (e) { /* sem corpo */ }
  return [r.status, x];
}
function portaLivre() {
  return new Promise((res, rej) => {
    const s = net.createServer();
    s.once('error', rej);
    s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); });
  });
}
const SEED = { email: 'e142seed@t.com', senha: 'E142seed!senha' };
process.on('exit', () => { try { if (filho) filho.kill(); } catch (e) { /* ja saiu */ } });

async function subir(extraEnv = {}) {
  logArq = path.join(pasta, 'index.log');
  porta = await portaLivre();
  if (porta === 5000) porta = await portaLivre();
  const env = { ...process.env };
  for (const k of ['NODE_ENV', 'NODE_OPTIONS', 'RUN_ALL_GUARDA_EXIT', 'PORT', 'CRM_DATA_DIR', 'JWT_SECRET',
    'SEED_ADMIN_EMAIL', 'SEED_ADMIN_PASSWORD', 'FALHA_SQL_INJETADA', 'RATE_LIMIT_WINDOW_MS']) delete env[k];
  Object.assign(env, { CRM_DATA_DIR: pasta, PORT: String(porta), SEED_ADMIN_EMAIL: SEED.email, SEED_ADMIN_PASSWORD: SEED.senha, RATE_LIMIT_MAX: '100000' }, extraEnv);
  const out = fs.openSync(logArq, 'a');
  saiu = null;
  const preload = ['-r', path.join(__dirname, '..', 'helpers', 'morreComOPai.js')];
  if (extraEnv.FALHA_SQL_INJETADA) preload.push('-r', path.join(__dirname, '..', 'helpers', 'falhaSqlInjetada.js'));
  filho = spawn(process.execPath, [...preload, 'index.js'], {
    cwd: SERVER_DIR, env, stdio: ['pipe', out, out], windowsHide: true,
  });
  filho.on('exit', (code) => { saiu = code; });
  const marcas = (fs.readFileSync(logArq, 'utf8').match(/Banco de dados totalmente inicializado/g) || []).length;
  const fim = Date.now() + 60000;
  while (Date.now() < fim) {
    if (saiu !== null) throw new Error(`o index.js saiu cedo (codigo ${saiu})`);
    try {
      const [s, x] = await j('POST', '/auth/login', null, SEED);
      if (s === 200 && x && x.token) {
        const ate = Date.now() + 30000;
        while (Date.now() < ate && (fs.readFileSync(logArq, 'utf8').match(/Banco de dados totalmente inicializado/g) || []).length <= marcas) await pausa(200);
        await pausa(1500);
        return x.token;
      }
    } catch (e) { /* ainda subindo */ }
    await pausa(200);
  }
  throw new Error('o index.js nao ficou pronto em 60 s');
}
async function descer() {
  if (filho && saiu === null) {
    const morreu = new Promise((r) => filho.once('exit', r));
    filho.kill();
    await Promise.race([morreu, pausa(10000)]);
  }
  filho = null;
}

// ── o arquivo, por fora ───────────────────────────────────────────────────────────────────
let cru = null;
function abrirCru() {
  cru = new sqlite3.Database(path.join(pasta, 'database.sqlite'));
  cru.configure('busyTimeout', 15000);
}
const run = (sql, p = []) => new Promise((res, rej) => cru.run(sql, p, function feito(e) { if (e) rej(e); else res(this); }));
const all = (sql, p = []) => new Promise((res, rej) => cru.all(sql, p, (e, r) => (e ? rej(e) : res(r))));
const ctx = { n: 0 };

const FAM = 'FAM142';
const CHAVE = 'tag_e142';
const P = { descricao: 'Bomba P', quantidade: 1, unidade: 'UN', valor_unitario: 100, valor_total: 100, codigo_produto: 'P142', familia_produto: FAM };
const Q = { descricao: 'Bomba Q', quantidade: 1, unidade: 'UN', valor_unitario: 50, valor_total: 50, codigo_produto: 'Q142', familia_produto: FAM };
const itensP = (id) => all('SELECT * FROM proposta_itens WHERE proposta_id = ? ORDER BY id', [id]);
const vm = (id) => all('SELECT * FROM proposta_variaveis_manuais WHERE proposta_id = ? ORDER BY id', [id]);
/** As variaveis vivas, como "posicao do item:valor" (posicao 1-based na ordem do documento). */
async function vivasPorPosicao(id) {
  const its = await itensP(id);
  const pos = new Map(its.map((it, i) => [String(it.id), i + 1]));
  return (await vm(id)).filter((l) => l.item_removido_em == null)
    .map((l) => `${pos.has(String(l.item_id)) ? pos.get(String(l.item_id)) : 'orfa' + l.item_id}:${l.valor}`).sort();
}
const aposentadas = async (id) => (await vm(id)).filter((l) => l.item_removido_em != null).map((l) => l.valor).sort();

async function novaProposta(itens) {
  const [s, p] = await j('POST', '/propostas', ctx.T, {
    cliente_id: ctx.clienteId, titulo: `Prop 142 ${++ctx.n}`, valor_total: 100, status: 'rascunho', margem_desconto: 0, itens,
  });
  assert.strictEqual(s, 200, JSON.stringify(p));
  return p.id;
}
async function gravarVars(id, valores) {
  const r = await j('PUT', `/propostas/${id}/variaveis-manuais`, ctx.T, { valores });
  assert.strictEqual(r[0], 200, JSON.stringify(r[1]));
}
async function salvar(id, itens) {
  const r = await j('PUT', `/propostas/${id}`, ctx.T, { itens });
  assert.strictEqual(r[0], 200, JSON.stringify(r[1]));
}
/** Os valores das variaveis manuais que o /premium imprime, por posicao do item no documento. */
async function noPremium(id) {
  const [s, html] = await j('GET', `/propostas/${id}/premium?embed=1`, ctx.T, undefined, true);
  assert.strictEqual(s, 200, String(html).slice(0, 300));
  const its = await itensP(id);
  const pos = new Map(its.map((it, i) => [String(it.id), i + 1]));
  const fonte = html.indexOf('id="proposalSource"') >= 0 ? html.slice(html.indexOf('id="proposalSource"')) : html;
  const re = new RegExp(`data-variavel-manual="${CHAVE}" data-variavel-item="(\\d+)">([^<]*)<`, 'g');
  const vistos = new Map();
  let m;
  while ((m = re.exec(fonte))) if (!vistos.has(m[1])) vistos.set(m[1], m[2]);
  return Array.from(vistos.entries()).map(([itemId, v]) => `${pos.get(itemId) || 'x' + itemId}:${v}`).sort();
}
/** Proposta [P, P] com TAG-A no primeiro e TAG-B no segundo. */
async function doisPComTags() {
  const id = await novaProposta([{ ...P }, { ...P }]);
  const its = await itensP(id);
  await gravarVars(id, [{ item_id: its[0].id, chave: CHAVE, valor: 'TAG-A' }, { item_id: its[1].id, chave: CHAVE, valor: 'TAG-B' }]);
  assert.deepStrictEqual(await vivasPorPosicao(id), ['1:TAG-A', '2:TAG-B']);
  return { id, its };
}

// ── o banco da etapa: a variavel manual da familia ────────────────────────────────────────
test('[RN-142.08] banco novo: a coluna item_removido_em existe; o /premium imprime a variavel manual (o cenario funciona)', async () => {
  const cols = (await all('PRAGMA table_info(proposta_variaveis_manuais)')).map((c) => c.name);
  assert.ok(cols.includes('item_removido_em'), cols.join(','));
  const id = await novaProposta([{ ...P }]);
  const its = await itensP(id);
  await gravarVars(id, [{ item_id: its[0].id, chave: CHAVE, valor: 'UNICO' }]);
  assert.deepStrictEqual(await noPremium(id), ['1:UNICO']);
});

// ── C298 ──────────────────────────────────────────────────────────────────────────────────
test('[RN-142.02/05/06/07] C298: tirar o primeiro de dois iguais com o id do que ficou -> TAG-B no que ficou, TAG-A aposentada (rota e funcao)', async () => {
  const { id, its } = await doisPComTags();
  const corpo = [{ ...P, id: its[1].id }];
  await salvar(id, corpo);
  const novos = await itensP(id);
  assert.strictEqual(novos.length, 1);
  assert.deepStrictEqual(await vivasPorPosicao(id), ['1:TAG-B'], 'o que ficou nao tem o SEU valor (antes: TAG-A)');
  assert.deepStrictEqual(await aposentadas(id), ['TAG-A'], 'a TAG-A devia ficar no banco, aposentada');
  assert.deepStrictEqual(await noPremium(id), ['1:TAG-B']);
  // pelo servico: a funcao, com o que a rota leu, diz o mesmo
  assert.deepStrictEqual(planoReligacao(its, corpo, novos.map((n) => n.id)), { mover: [[its[1].id, novos[0].id]], aposentar: [its[0].id] });
});

test('[RN-142.10] o que saiu nao volta: incluir outro P depois -> o novo abre sem TAG; tirar todos e incluir -> sem TAG', async () => {
  const { id, its } = await doisPComTags();
  await salvar(id, [{ ...P, id: its[1].id }]);
  const ficou = (await itensP(id))[0];
  await salvar(id, [{ ...P, id: ficou.id }, { ...P }]);
  assert.deepStrictEqual(await vivasPorPosicao(id), ['1:TAG-B']);
  assert.deepStrictEqual(await noPremium(id), ['1:TAG-B', '2:'], 'o P incluido herdou valor');
  await salvar(id, []);
  assert.deepStrictEqual(await vivasPorPosicao(id), []);
  assert.deepStrictEqual(await aposentadas(id), ['TAG-A', 'TAG-B']);
  await salvar(id, [{ ...P }]);
  assert.deepStrictEqual(await vivasPorPosicao(id), []);
  assert.deepStrictEqual(await noPremium(id), ['1:'], 'tirar todos e incluir trouxe a variavel de volta');
});

test('[RN-142.03/06] sem ids (API, corpo antigo): por posicao — o primeiro fica com TAG-A, a TAG-B e aposentada (declarado, D (142))', async () => {
  const { id } = await doisPComTags();
  await salvar(id, [{ ...P }]);
  assert.deepStrictEqual(await vivasPorPosicao(id), ['1:TAG-A']);
  assert.deepStrictEqual(await aposentadas(id), ['TAG-B']);
  assert.deepStrictEqual(await noPremium(id), ['1:TAG-A'], 'sem linha dobrada no documento');
});

test('[RN-142.09] id que nao vale (de outra proposta, texto, repetido) -> por posicao', async () => {
  const outra = await novaProposta([{ ...P }]);
  const idOutra = (await itensP(outra))[0].id;
  for (const ruim of [idOutra, 'abc', '1.5']) {
    const { id } = await doisPComTags();
    await salvar(id, [{ ...P, id: ruim }]);
    assert.deepStrictEqual(await vivasPorPosicao(id), ['1:TAG-A'], 'id ' + ruim);
    assert.deepStrictEqual(await aposentadas(id), ['TAG-B'], 'id ' + ruim);
  }
  const { id, its } = await doisPComTags();
  await salvar(id, [{ ...P, id: its[1].id }, { ...P, id: its[1].id }]);
  assert.deepStrictEqual(await vivasPorPosicao(id), ['1:TAG-B'], 'o id repetido valeu duas vezes');
  assert.deepStrictEqual(await aposentadas(id), ['TAG-A']);
});

test('[RN-03b da 138, C296] sem ids e sem mexer: a variavel continua no seu item (a religacao de sempre)', async () => {
  const id = await novaProposta([{ ...P }, { ...Q }]);
  const its = await itensP(id);
  await gravarVars(id, [{ item_id: its[0].id, chave: CHAVE, valor: 'V1' }]);
  await salvar(id, [{ ...Q }, { ...P }]);
  assert.deepStrictEqual(await vivasPorPosicao(id), ['2:V1'], 'reordenar trocou o valor de item');
  assert.deepStrictEqual(await aposentadas(id), []);
});

// ── C308 ──────────────────────────────────────────────────────────────────────────────────
test('[RN-142.04] C308: dois P com descricao da tabela diferentes -> salvar sem ids mantem cada uma; com id, a do que ficou', async () => {
  const id = await novaProposta([{ ...P }, { ...P }]);
  let its = await itensP(id);
  await run('UPDATE proposta_itens SET descricao_tabela = ?, tag = ? WHERE id = ?', ['linha 1', 'TG1', its[0].id]);
  await run('UPDATE proposta_itens SET descricao_tabela = ?, tag = ? WHERE id = ?', ['linha 2', 'TG2', its[1].id]);
  await salvar(id, [{ ...P }, { ...P }]);
  its = await itensP(id);
  assert.deepStrictEqual(its.map((i) => `${i.tag}/${i.descricao_tabela}`), ['TG1/linha 1', 'TG2/linha 2'], 'antes: TG2/linha 2 nos dois');
  await salvar(id, [{ ...P, id: its[1].id }]);
  its = await itensP(id);
  assert.deepStrictEqual(its.map((i) => `${i.tag}/${i.descricao_tabela}`), ['TG2/linha 2']);
});

// ── RN-142.11 ─────────────────────────────────────────────────────────────────────────────
test('[RN-142.11] legado da C298 (A viva no item, B orfa): incluir outro P -> B aposentada, o novo sem TAG (rota e funcao)', async () => {
  const id = await novaProposta([{ ...P }]);
  const [it] = await itensP(id);
  await gravarVars(id, [{ item_id: it.id, chave: CHAVE, valor: 'TAG-A' }]);
  await run('INSERT INTO proposta_variaveis_manuais (proposta_id, item_id, chave, valor, item_chave) VALUES (?, ?, ?, ?, ?)', [id, 999001, CHAVE, 'TAG-B', 'P142']);
  assert.deepStrictEqual(await noPremium(id), ['1:TAG-A'], 'a orfa entrou no item que ja tinha valor');
  const linhas = await vm(id);
  const plano = planoMaterializacao(linhas, [it]);
  assert.deepStrictEqual(plano, { mover: [], aposentar: [linhas.find((l) => l.valor === 'TAG-B').id] });
  await salvar(id, [{ ...P, id: it.id }, { ...P }]);
  assert.deepStrictEqual(await vivasPorPosicao(id), ['1:TAG-A']);
  assert.deepStrictEqual(await aposentadas(id), ['TAG-B']);
  assert.deepStrictEqual(await noPremium(id), ['1:TAG-A', '2:'], 'o P incluido herdou a orfa');
});

test('[RN-142.11/07] a religacao que nunca aconteceu (todas orfas): o /premium repara, e o salvamento seguinte grava o reparo e religa', async () => {
  const id = await novaProposta([{ ...P }, { ...P }]);
  const its = await itensP(id);
  await run('INSERT INTO proposta_variaveis_manuais (proposta_id, item_id, chave, valor, item_chave) VALUES (?, ?, ?, ?, ?)', [id, 998002, CHAVE, 'VB', 'P142']);
  await run('INSERT INTO proposta_variaveis_manuais (proposta_id, item_id, chave, valor, item_chave) VALUES (?, ?, ?, ?, ?)', [id, 998001, CHAVE, 'VA', 'P142']);
  assert.deepStrictEqual(await noPremium(id), ['1:VA', '2:VB']);
  assert.deepStrictEqual(repararVariaveisManuais(await vm(id), its).map((l) => `${l.item_id === its[0].id ? 1 : 2}:${l.valor}`).sort(), ['1:VA', '2:VB']);
  await salvar(id, [{ ...P, id: its[1].id }]);
  assert.deepStrictEqual(await vivasPorPosicao(id), ['1:VB'], 'o reparo nao foi gravado antes de parear');
  assert.deepStrictEqual(await aposentadas(id), ['VA']);
});

// ── RN-142.12 ─────────────────────────────────────────────────────────────────────────────
test('[RN-142.12] apagar no preview um valor que veio do reparo apaga de verdade (antes voltava)', async () => {
  const id = await novaProposta([{ ...P }]);
  const [it] = await itensP(id);
  await run('INSERT INTO proposta_variaveis_manuais (proposta_id, item_id, chave, valor, item_chave) VALUES (?, ?, ?, ?, ?)', [id, 997001, CHAVE, 'ZUMBI', 'P142']);
  assert.deepStrictEqual(await noPremium(id), ['1:ZUMBI']);
  await gravarVars(id, [{ item_id: it.id, chave: CHAVE, valor: '' }]);
  assert.deepStrictEqual(await noPremium(id), ['1:'], 'o valor apagado voltou');
  assert.deepStrictEqual((await vm(id)).map((l) => l.valor), []);
});

test('[RN-142.12] o preview numa aba velha (item que saiu) nao cria linha nem apaga a identidade da aposentada', async () => {
  const { id, its } = await doisPComTags();
  await salvar(id, [{ ...P, id: its[1].id }]);
  const antes = await vm(id);
  await gravarVars(id, [{ item_id: its[0].id, chave: CHAVE, valor: 'DA ABA VELHA' }, { item_id: 123456789, chave: CHAVE, valor: 'X' }]);
  const depois = await vm(id);
  assert.deepStrictEqual(depois.map((l) => [l.id, l.item_id, l.valor, l.item_chave, l.item_removido_em]), antes.map((l) => [l.id, l.item_id, l.valor, l.item_chave, l.item_removido_em]));
  assert.ok(depois.every((l) => l.item_chave === 'P142'), JSON.stringify(depois));
});

test('[RN-142.12] o preview grava normalmente para os itens da proposta (o upsert de sempre)', async () => {
  const { id } = await doisPComTags();
  const its = await itensP(id);
  await gravarVars(id, [{ item_id: its[0].id, chave: CHAVE, valor: 'TAG-A2' }]);
  assert.deepStrictEqual(await vivasPorPosicao(id), ['1:TAG-A2', '2:TAG-B']);
  const r = await j('PUT', `/propostas/${id}/variaveis-manuais`, ctx.T, { valores: 'x' });
  assert.strictEqual(r[0], 400);
});

// ── Fase 5 ────────────────────────────────────────────────────────────────────────────────
test('[RN-142.12, F5 r3 Z1] legado (A viva, B orfa de item que saiu): apagar A no preview nao faz a B aparecer no item', async () => {
  const id = await novaProposta([{ ...P }]);
  const [it] = await itensP(id);
  await gravarVars(id, [{ item_id: it.id, chave: CHAVE, valor: 'TAG-A' }]);
  await run('INSERT INTO proposta_variaveis_manuais (proposta_id, item_id, chave, valor, item_chave) VALUES (?, ?, ?, ?, ?)', [id, 999101, CHAVE, 'TAG-B', 'P142']);
  await gravarVars(id, [{ item_id: it.id, chave: CHAVE, valor: '' }]);
  assert.deepStrictEqual(await noPremium(id), ['1:'], 'o valor do item que saiu apareceu no que ficou');
  assert.deepStrictEqual(await aposentadas(id), ['TAG-B']);
});

test('[RN-142.07/12, F5 r3 Z2] item manual (sem codigo): a identidade e a descricao; orfao, o /premium o repara', async () => {
  const id = await novaProposta([{ ...P, codigo_produto: '', descricao: 'Item Livre Z2' }]);
  const [it] = await itensP(id);
  await gravarVars(id, [{ item_id: it.id, chave: CHAVE, valor: 'MAN' }]);
  const [linha] = await vm(id);
  assert.strictEqual(String(linha.item_chave).toUpperCase(), 'ITEM LIVRE Z2');
  await run('UPDATE proposta_variaveis_manuais SET item_id = 990201 WHERE id = ?', [linha.id]);
  assert.deepStrictEqual(await noPremium(id), ['1:MAN']);
});

test('[RN-142.12, F5 r2 M2] item_id que nao e inteiro (lista, objeto, fracao) no preview nao grava nada', async () => {
  const id = await novaProposta([{ ...P }]);
  const [it] = await itensP(id);
  await gravarVars(id, [{ item_id: [it.id], chave: CHAVE, valor: 'L' }, { item_id: { id: it.id }, chave: CHAVE, valor: 'O' }, { item_id: it.id + 0.5, chave: CHAVE, valor: 'F' }]);
  assert.deepStrictEqual(await vm(id), []);
  await gravarVars(id, [{ item_id: String(it.id), chave: CHAVE, valor: 'TXT' }]);
  assert.deepStrictEqual((await vm(id)).map((l) => [l.item_id, l.valor]), [[it.id, 'TXT']], 'o id em texto de digitos deixou de gravar');
});

test('[RN-142.07, F5 r3 S37/S38] o /pdf usa o mesmo reparo: o retrato gravado tem a TAG-B no item que ficou e nao a TAG-A', async () => {
  const { id, its } = await doisPComTags();
  await salvar(id, [{ ...P, id: its[1].id }]);
  const [ficou] = await itensP(id);
  // a linha viva da TAG-B fica orfa (como se a religacao nao tivesse acontecido): so o reparo do /pdf a poe no item
  await run('UPDATE proposta_variaveis_manuais SET item_id = 996001 WHERE proposta_id = ? AND item_removido_em IS NULL', [id]);
  const [s] = await j('GET', `/propostas/${id}/pdf`, ctx.T, undefined, true);
  assert.strictEqual(s, 200);
  let html = '';
  const ate = Date.now() + 15000;
  while (Date.now() < ate) {
    html = String(((await all('SELECT html_rendered FROM propostas WHERE id = ?', [id]))[0] || {}).html_rendered || '');
    if (html.includes('data-variavel-manual')) break;
    await pausa(300);
  }
  const re = new RegExp(`data-variavel-manual="${CHAVE}" data-variavel-item="${ficou.id}">([^<]*)<`);
  const m = re.exec(html);
  assert.ok(m, 'o retrato do /pdf nao tem a variavel do item');
  assert.strictEqual(m[1], 'TAG-B');
  assert.ok(!html.includes('TAG-A'), 'a TAG-A (aposentada) saiu no PDF');
});

(async () => {
  console.log('\n=== Etapa 142 (propostas): a identidade do item no salvamento — itens iguais (C298, C308, C309) ===\n');
  try {
    pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'e142-itens-'));
    ctx.T = await subir();
    abrirCru();
    const [sc, c] = await j('POST', '/clientes', ctx.T, { razao_social: 'Cli 142', cnpj: '11.222.333/0001-44', email: 'a@a.com' });
    assert.strictEqual(sc, 200, JSON.stringify(c));
    ctx.clienteId = c.id;
    // a variavel "Manual na Proposta" da familia (o que a tela de configuracao grava)
    await run("INSERT INTO variaveis_tecnicas (nome, chave, tipo, ativo) VALUES ('Tag E142', ?, 'manual_proposta', 1)", [CHAVE]);
    await run("INSERT INTO proposta_template_config (familia, variaveis_proposta_por_familia) VALUES ('Geral', ?)", [JSON.stringify({ [FAM]: [CHAVE] })]);
    for (const [name, fn] of testes) {
      if (saiu !== null) { failed++; console.error(`  ✗ ${name}: o servidor caiu antes (codigo ${saiu})`); continue; }
      try { await fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) {
        failed++; console.error(`  ✗ ${name}: ${String(e.message).replace(/\s*\n\s*/g, ' ')}`);
      }
    }
    // ── RN-142.08, banco antigo: a tabela sem a coluna, com uma linha, e uma segunda subida ──
    const nome = '[RN-142.08] banco antigo: a segunda subida sobre a tabela sem a coluna a cria e mantem as linhas';
    try {
      await descer();
      await new Promise((r) => cru.close(() => r()));
      abrirCru();
      const antes = await all('SELECT id, proposta_id, item_id, chave, valor, item_chave FROM proposta_variaveis_manuais ORDER BY id');
      assert.ok(antes.length > 0, 'sem linhas para provar');
      await run('ALTER TABLE proposta_variaveis_manuais DROP COLUMN item_removido_em');
      assert.ok(!(await all('PRAGMA table_info(proposta_variaveis_manuais)')).some((c) => c.name === 'item_removido_em'), 'o DROP nao tirou a coluna');
      await new Promise((r) => cru.close(() => r()));
      ctx.T = await subir();
      abrirCru();
      assert.ok((await all('PRAGMA table_info(proposta_variaveis_manuais)')).some((c) => c.name === 'item_removido_em'), 'a subida nao criou a coluna');
      const depois = await all('SELECT id, proposta_id, item_id, chave, valor, item_chave FROM proposta_variaveis_manuais ORDER BY id');
      assert.deepStrictEqual(depois, antes);
      assert.ok(/Coluna item_removido_em verificada/.test(fs.readFileSync(logArq, 'utf8')));
      passed++; console.log(`  ✓ ${nome}`);
    } catch (e) { failed++; console.error(`  ✗ ${nome}: ${String(e.message).replace(/\s*\n\s*/g, ' ')}`); }
    // ── F5 r2 M1 / r3 S30: o passo que falha nao leva os seguintes junto (subida com o UPDATE que move as variaveis falhando) ──
    const nome2 = '[RN-142.05/06, F5 r2 M1] o UPDATE que move falha: a aposentadoria roda mesmo assim e o /premium mostra a TAG-B no que ficou';
    try {
      await descer();
      await new Promise((r) => cru.close(() => r()));
      ctx.T = await subir({ FALHA_SQL_INJETADA: '^UPDATE OR REPLACE proposta_variaveis_manuais SET item_id' });
      abrirCru();
      const { id, its } = await doisPComTags();
      await salvar(id, [{ ...P, id: its[1].id }]);
      assert.ok(/\[falha injetada\] UPDATE OR REPLACE proposta_variaveis_manuais/.test(fs.readFileSync(logArq, 'utf8')), 'a falha nao foi injetada');
      assert.deepStrictEqual(await aposentadas(id), ['TAG-A'], 'a aposentadoria nao rodou depois do passo que falhou');
      assert.deepStrictEqual(await noPremium(id), ['1:TAG-B']);
      passed++; console.log(`  ✓ ${nome2}`);
    } catch (e) { failed++; console.error(`  ✗ ${nome2}: ${String(e.message).replace(/\s*\n\s*/g, ' ')}`); }
  } catch (e) { failed++; console.error('  ✗ preparo:', e.message); }
  if (cru) await new Promise((r) => cru.close(() => r()));
  await descer();
  try { fs.rmSync(pasta, { recursive: true, force: true }); } catch (e) { /* windows segura o arquivo */ }
  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
})();
