/**
 * Etapa 144 (propostas) — o produto que nao existe na geracao automatica e o preview numa aba velha, pelo `index.js` de verdade
 * (pasta vazia): C313, D (142).
 *
 *   RN-144.01  a geracao automatica recusa (400) o produto sem id que vale; o id em texto de digitos vale como o numero
 *   RN-144.02  a geracao automatica recusa (400) o produto que nao existe, antes de gerar numero e de criar: nenhuma proposta nasce
 *   RN-144.03  a ordem das recusas da geracao automatica (a da RN-143.03, estendida)
 *   RN-144.04  as duas rotas do preview respondem quantos valores nao gravaram (ignorados) — o item nao e mais da proposta
 *
 * Molde: propostaItemInvalido.api.test.js (pasta vazia, porta livre, morreComOPai, banco lido por fora).
 * Plano: docs/superpowers/plans/2026-10-18-almoxarifado-etapa144-produto-inexistente-na-geracao.md
 * Executar: cd server && node tests/api/propostaProdutoInexistente.api.test.js
 */
const assert = require('assert');
const fs = require('fs');
const net = require('net');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const sqlite3 = require('sqlite3');
const { idsDosProdutos, msgProdutoNaoEncontrado, MSG_PRODUTO_SEM_ID, MSG_ITEM_INVALIDO } = require('../../propostaItensDiff');

const SERVER_DIR = path.join(__dirname, '..', '..');
const pausa = (ms) => new Promise((r) => setTimeout(r, ms));

let passed = 0; let failed = 0;
const testes = [];
function test(name, fn) { testes.push([name, fn]); }

// As mensagens literais do contrato (o plano). O teste compara com o texto, nao com a constante: trocar a constante tem de derrubar.
const SEM_ID = 'Produto inválido: cada produto da proposta deve trazer o id de um produto cadastrado.';
const nao = (ids) => `Produto não encontrado (id ${ids}). Atualize a lista de produtos e tente de novo.`;
const ITEM = 'Item inválido: cada item da proposta deve ser um objeto.';
const OBRIG = 'Cliente e produtos são obrigatórios';
const MARGEM = 'Margem de desconto inválida: informe um número de 0 a 100, com ponto como separador decimal.';

// ── o servidor real ───────────────────────────────────────────────────────────────────────
let porta; let filho = null; let pasta; let logArq; let saiu = null;
async function j(m, u, tok, body, texto, ms = 30000) {
  const r = await fetch(`http://127.0.0.1:${porta}/api${u}`, {
    method: m,
    headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: 'Bearer ' + tok } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(ms),
  });
  if (texto) return [r.status, await r.text()];
  let x = null; try { x = await r.json(); } catch (e) { /* sem corpo */ }
  return [r.status, x];
}
/** A chamada que tem de RESPONDER: 10 s de limite (o de antes da etapa nunca respondia — C310). */
async function responde(m, u, body) {
  try {
    return await j(m, u, ctx.T, body, false, 10000);
  } catch (e) {
    throw new Error(`${m} ${u} nao respondeu em 10 s (${e.name}) com ${JSON.stringify(body).slice(0, 120)}`);
  }
}
function portaLivre() {
  return new Promise((res, rej) => {
    const s = net.createServer();
    s.once('error', rej);
    s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); });
  });
}
const SEED = { email: 'e144seed@t.com', senha: 'E144seed!senha' };
process.on('exit', () => { try { if (filho) filho.kill(); } catch (e) { /* ja saiu */ } });

async function subir(extraEnv = {}) {
  logArq = path.join(pasta, 'index.log');
  porta = await portaLivre();
  if (porta === 5000) porta = await portaLivre();
  const env = { ...process.env };
  for (const k of ['NODE_ENV', 'NODE_OPTIONS', 'RUN_ALL_GUARDA_EXIT', 'PORT', 'CRM_DATA_DIR', 'JWT_SECRET',
    'SEED_ADMIN_EMAIL', 'SEED_ADMIN_PASSWORD', 'FALHA_SQL_INJETADA', 'FALHA_SQL_MSG', 'FALHA_SQL_METODOS', 'RATE_LIMIT_WINDOW_MS']) delete env[k];
  Object.assign(env, { CRM_DATA_DIR: pasta, PORT: String(porta), SEED_ADMIN_EMAIL: SEED.email, SEED_ADMIN_PASSWORD: SEED.senha, RATE_LIMIT_MAX: '100000' }, extraEnv);
  const out = fs.openSync(logArq, 'a');
  saiu = null;
  const preload = ['-r', path.join(__dirname, '..', 'helpers', 'morreComOPai.js')];
  if (extraEnv.FALHA_SQL_INJETADA) preload.push('-r', path.join(__dirname, '..', 'helpers', 'falhaSqlInjetada.js'));
  const marcas = fs.existsSync(logArq) ? (fs.readFileSync(logArq, 'utf8').match(/Banco de dados totalmente inicializado/g) || []).length : 0;
  filho = spawn(process.execPath, [...preload, 'index.js'], {
    cwd: SERVER_DIR, env, stdio: ['pipe', out, out], windowsHide: true,
  });
  filho.on('exit', (code) => { saiu = code; });
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

const FAM = 'FAM143';
const CHAVE = 'tag_e143';
const P = { descricao: 'Bomba P', quantidade: 1, unidade: 'UN', valor_unitario: 100, valor_total: 100, codigo_produto: 'P143', familia_produto: FAM };
const Q = { descricao: 'Bomba Q', quantidade: 1, unidade: 'UN', valor_unitario: 50, valor_total: 50, codigo_produto: 'Q143', familia_produto: FAM };
const itensP = (id) => all('SELECT * FROM proposta_itens WHERE proposta_id = ? ORDER BY id', [id]);
const codigos = async (id) => (await itensP(id)).map((i) => i.codigo_produto);
const contarPropostas = async () => (await all('SELECT COUNT(*) AS n FROM propostas'))[0].n;


async function criarProduto(codigo, preco = 10) {
  const [s, x] = await j('POST', '/produtos', ctx.T, { codigo, nome: `Produto ${codigo}`, familia: 'FAM144', classificacao_area: 'NAO CLASSIFICADA', preco_base: preco });
  assert.strictEqual(s, 200, JSON.stringify(x));
  return x.id;
}
const gerar = (produtos, extra = {}) => responde('POST', '/propostas/gerar-automatica', { cliente_id: ctx.clienteId, produtos, ...extra });
/** A recusa que nao cria nada: status, mensagem literal e a contagem de propostas igual (lida por fora). */
async function recusa(produtos, status, msg, extra = {}) {
  const n0 = await contarPropostas();
  const [s, x] = await gerar(produtos, extra);
  assert.deepStrictEqual([s, x && x.error], [status, msg], `${JSON.stringify(produtos)} ${JSON.stringify(extra)}`);
  await pausa(100);
  assert.strictEqual(await contarPropostas(), n0, `${JSON.stringify(produtos)} criou proposta`);
}
const itensGerados = async (id) => (await itensP(id)).map((i) => [i.codigo_produto, i.quantidade, i.valor_total]);

// ── puros ─────────────────────────────────────────────────────────────────────────────────
test('[RN-144.01] puro: a mensagem literal do contrato e idsDosProdutos — inteiro positivo (numero ou texto de digitos) vale, o resto nao', () => {
  assert.strictEqual(MSG_PRODUTO_SEM_ID, SEM_ID);
  assert.strictEqual(MSG_ITEM_INVALIDO, ITEM);
  assert.deepStrictEqual(idsDosProdutos([{ id: 5 }, { id: '7' }, { id: ' 8 ' }, { id: 5.0 }, { id: '007' }]), { ids: ['5', '7', '8', '5', '7'] });
  for (const id of [undefined, null, true, false, 1.5, -1, 0, '0', '000', '-1', 'abc', '', ' ', '1e3', '0x10', '5.0', [], [5], {}, NaN, Infinity,
    1e21, 9007199254740992, '9007199254740992', '9007199254740993', '1'.repeat(400)]) {
    assert.deepStrictEqual(idsDosProdutos([{ id: 5 }, { id }]), { erro: SEM_ID }, `id ${JSON.stringify(id)} (${typeof id}) devia ser recusado`);
  }
  assert.deepStrictEqual(idsDosProdutos([{}]), { erro: SEM_ID });
  // o maior inteiro seguro ainda vale (Fase 2 M-2: acima dele o Number arredonda e poderia casar outro produto)
  assert.deepStrictEqual(idsDosProdutos([{ id: 9007199254740991 }, { id: '9007199254740991' }]), { ids: ['9007199254740991', '9007199254740991'] });
  assert.deepStrictEqual(idsDosProdutos([]), { ids: [] });
});
test('[RN-144.02] puro: msgProdutoNaoEncontrado — sem repeticao, na ordem, ate 10 e "e mais N"', () => {
  assert.strictEqual(msgProdutoNaoEncontrado(['99999']), nao('99999'));
  assert.strictEqual(msgProdutoNaoEncontrado(['9', '3', '9']), nao('9, 3'));
  const doze = Array.from({ length: 12 }, (_, i) => String(i + 1));
  assert.strictEqual(msgProdutoNaoEncontrado(doze), nao('1, 2, 3, 4, 5, 6, 7, 8, 9, 10 e mais 2'));
  assert.strictEqual(msgProdutoNaoEncontrado(doze.slice(0, 10)), nao('1, 2, 3, 4, 5, 6, 7, 8, 9, 10'));
  assert.strictEqual(msgProdutoNaoEncontrado(doze.slice(0, 11)), nao('1, 2, 3, 4, 5, 6, 7, 8, 9, 10 e mais 1'), 'com 11 (F5 r3 s20)');
  assert.strictEqual(msgProdutoNaoEncontrado([...doze.slice(0, 10), '1', '2']), nao('1, 2, 3, 4, 5, 6, 7, 8, 9, 10'), 'repetido conta no "e mais"');
});

// ── RN-144.02: o produto que nao existe ───────────────────────────────────────────────────
test('[RN-144.02, C313] produto que nao existe: 400 com os ids e nenhuma proposta nasce (antes: 200 com proposta vazia ou so com os achados)', async () => {
  await recusa([{ id: 99999 }], 400, nao('99999'));
  await recusa([{ id: ctx.a }, { id: 99999 }], 400, nao('99999'));
  await recusa([{ id: 99999 }, { id: ctx.a, quantidade: 2 }, { id: 88888 }, { id: 99999 }], 400, nao('99999, 88888'));
  await recusa([{ id: '99999' }], 400, nao('99999'));
  await recusa([{ id: 99999 }, { id: '099999' }, { id: 99999 }], 400, nao('99999'));
  // Fase 2 I-3: 40 000 ids (o IN (?, ...) de antes estourava em 32 766 variaveis -> 500): a recusa chega, com os 10 primeiros e o resto
  const muitos = Array.from({ length: 40000 }, (_, i) => ({ id: 500000 + i }));
  await recusa(muitos, 400, nao('500000, 500001, 500002, 500003, 500004, 500005, 500006, 500007, 500008, 500009 e mais 39990'));
  await recusa([...muitos, { id: ctx.a }].reverse().slice(0, 35000), 400, nao(Array.from({ length: 10 }, (_, i) => 539999 - i).join(', ') + ' e mais 34989'));
  // a metade positiva: o achado sozinho cria, com o item
  const [s, x] = await gerar([{ id: ctx.a, quantidade: 2 }]);
  assert.strictEqual(s, 200, JSON.stringify(x));
  assert.deepStrictEqual(await itensGerados(x.id), [['SA144', 2, 20]]);
  assert.strictEqual(x.valor_total, 20);
});

// ── RN-144.01: o produto sem id que vale ──────────────────────────────────────────────────
test('[RN-144.01] produto sem id que vale: 400 com a mensagem e nenhuma proposta nasce (antes: 200 com proposta vazia)', async () => {
  for (const p of [{}, { id: null }, { id: true }, { id: 1.5 }, { id: -1 }, { id: 0 }, { id: 'abc' }, { id: '' }, { id: '5.0' }, { id: 1e21 }]) {
    await recusa([p], 400, SEM_ID);
    await recusa([{ id: ctx.a }, p], 400, SEM_ID);
  }
  // o id objeto ou lista cai antes, na guarda dos campos da 143 (B934; Fase 2 M-1)
  await recusa([{ id: [ctx.a] }], 400, ITEM);
  await recusa([{ id: { a: 1 } }], 400, ITEM);
});
test('[RN-144.01, B938] o id em texto de digitos vale como o numero (antes: o item sumia e a proposta nascia vazia)', async () => {
  const [s, x] = await gerar([{ id: String(ctx.a) }, { id: ` ${ctx.b} `, quantidade: 3 }]);
  assert.strictEqual(s, 200, JSON.stringify(x));
  assert.deepStrictEqual(await itensGerados(x.id), [['SA144', 1, 10], ['SB144', 3, 15]]);
  assert.strictEqual(x.valor_total, 25);
});
test('[RN-144.02, B936, B937] o inativo conta como achado e o repetido e um item por vez (o de sempre)', async () => {
  let [s, x] = await gerar([{ id: ctx.inativo }]);
  assert.strictEqual(s, 200, JSON.stringify(x));
  assert.deepStrictEqual(await itensGerados(x.id), [['SI144', 1, 10]]);
  [s, x] = await gerar([{ id: ctx.a }, { id: ctx.b }, { id: ctx.a, quantidade: 2 }]);
  assert.strictEqual(s, 200, JSON.stringify(x));
  assert.deepStrictEqual(await itensGerados(x.id), [['SA144', 1, 10], ['SB144', 1, 5], ['SA144', 2, 20]]);
  assert.strictEqual(x.valor_total, 35);
});

// ── RN-144.03: a ordem ────────────────────────────────────────────────────────────────────
test('[RN-144.03] a ordem: obrigatorios -> item -> margem -> 403 do desconto -> sem id -> nao encontrado -> cliente invalido', async () => {
  await recusa([{}], 400, OBRIG, { cliente_id: undefined });
  await recusa([{}, null], 400, ITEM);
  await recusa([{ id: 99999 }, null], 400, ITEM);
  await recusa([{}], 400, MARGEM, { margem_desconto: '10,5' });
  await recusa([{ id: 99999 }], 400, MARGEM, { margem_desconto: '10,5' });
  const n0 = await contarPropostas();
  let [s, x] = await gerar([{}], { margem_desconto: 10, status: 'enviada' });
  assert.strictEqual(s, 403, JSON.stringify(x));
  assert.ok(/desconto acima de 5% sem aprovação prévia/.test(x.error), x.error);
  [s, x] = await gerar([{ id: 99999 }], { margem_desconto: 10, status: 'enviada' });
  assert.strictEqual(s, 403, 'o 403 do desconto devia vir antes do nao encontrado');
  assert.strictEqual(await contarPropostas(), n0);
  // as duas novas: a lista inteira e lida antes da busca (sem id na frente, mesmo depois de um que nao existe)
  await recusa([{ id: 99999 }, {}], 400, SEM_ID);
  await recusa([{}, { id: 99999 }], 400, SEM_ID);
  // e as duas novas vem antes do "Cliente invalido"
  await recusa([{}], 400, SEM_ID, { cliente_id: 'abc' });
  await recusa([{ id: 99999 }], 400, nao('99999'), { cliente_id: 'abc' });
  await recusa([{ id: ctx.a }], 400, 'Cliente inválido', { cliente_id: 'abc' });
  // o rascunho com desconto acima de 5% e o produto que existe: passa (a metade positiva)
  [s, x] = await gerar([{ id: ctx.a }], { margem_desconto: 10 });
  assert.strictEqual(s, 200, JSON.stringify(x));
});

// ── RN-144.04: o preview numa aba velha ───────────────────────────────────────────────────
async function propostaPQ() {
  const [s, p] = await j('POST', '/propostas', ctx.T, {
    cliente_id: ctx.clienteId, titulo: `Prop 144 ${++ctx.n}`, valor_total: 150, status: 'rascunho', margem_desconto: 0, itens: [{ ...P }, { ...Q }],
  });
  assert.strictEqual(s, 200, JSON.stringify(p));
  return p.id;
}
const vars = (id) => all('SELECT item_id, chave, valor FROM proposta_variaveis_manuais WHERE proposta_id = ? ORDER BY item_id, chave', [id]);
const descTabela = async (id) => (await itensP(id)).map((i) => i.descricao_tabela);
test('[RN-144.04] variaveis-manuais: responde quantos nao gravaram — item de outra proposta, que nao existe ou id que nao vale; o da proposta grava e nao conta', async () => {
  const id = await propostaPQ(); const outra = await propostaPQ();
  const [i1, i2] = (await itensP(id)).map((i) => i.id);
  const [o1] = (await itensP(outra)).map((i) => i.id);
  let [s, x] = await responde('PUT', `/propostas/${id}/variaveis-manuais`, { valores: [{ item_id: i1, chave: 'k1', valor: 'A' }, { item_id: String(i2), chave: 'k1', valor: 'B' }] });
  assert.deepStrictEqual([s, x], [200, { ok: true, ignorados: 0 }]);
  assert.deepStrictEqual(await vars(id), [{ item_id: i1, chave: 'k1', valor: 'A' }, { item_id: i2, chave: 'k1', valor: 'B' }]);
  [s, x] = await responde('PUT', `/propostas/${id}/variaveis-manuais`, { valores: [
    { item_id: 999999, chave: 'k2', valor: 'X' }, { item_id: o1, chave: 'k2', valor: 'X' }, { item_id: 'abc', chave: 'k2', valor: 'X' },
    { item_id: [i1], chave: 'k2', valor: 'X' }, { item_id: i1, chave: 'k2', valor: 'C' },
    { item_id: i1, valor: 'sem chave' }, { chave: 'k3', valor: 'sem item' }, null] });
  assert.deepStrictEqual([s, x], [200, { ok: true, ignorados: 4 }]);
  assert.deepStrictEqual(await vars(id), [{ item_id: i1, chave: 'k1', valor: 'A' }, { item_id: i1, chave: 'k2', valor: 'C' }, { item_id: i2, chave: 'k1', valor: 'B' }]);
  assert.deepStrictEqual(await vars(outra), [], 'gravou na outra proposta');
  // apagar (valor vazio) do item da proposta tambem nao conta
  [s, x] = await responde('PUT', `/propostas/${id}/variaveis-manuais`, { valores: [{ item_id: i1, chave: 'k2', valor: '' }, { item_id: 999999, chave: 'k2', valor: '' }] });
  assert.deepStrictEqual([s, x], [200, { ok: true, ignorados: 1 }]);
  assert.deepStrictEqual((await vars(id)).length, 2);
});
test('[RN-144.04] itens/descricoes: responde quantos nao gravaram; o da proposta grava e nao conta; o de outra proposta nao muda', async () => {
  const id = await propostaPQ(); const outra = await propostaPQ();
  const [i1, i2] = (await itensP(id)).map((i) => i.id);
  const [o1] = (await itensP(outra)).map((i) => i.id);
  let [s, x] = await responde('PUT', `/propostas/${id}/itens/descricoes`, { descricoes: [{ item_id: i1, texto: 'Tabela P' }, { item_id: String(i2), texto: ' Tabela Q ' }] });
  assert.deepStrictEqual([s, x], [200, { ok: true, ignorados: 0 }]);
  assert.deepStrictEqual(await descTabela(id), ['Tabela P', 'Tabela Q']);
  [s, x] = await responde('PUT', `/propostas/${id}/itens/descricoes`, { descricoes: [
    { item_id: 999999, texto: 'X' }, { item_id: o1, texto: 'X' }, { item_id: 'abc', texto: 'X' }, { item_id: i1, texto: '' }, { texto: 'sem item' }, null] });
  assert.deepStrictEqual([s, x], [200, { ok: true, ignorados: 3 }]);
  assert.deepStrictEqual(await descTabela(id), [null, 'Tabela Q']);
  assert.deepStrictEqual(await descTabela(outra), [null, null], 'gravou na outra proposta');
  // F5 r3 s11: a entrada de texto vazio com item que nao e da proposta tambem conta (o preview manda todos os campos)
  [s, x] = await responde('PUT', `/propostas/${id}/itens/descricoes`, { descricoes: [{ item_id: 999999, texto: '' }] });
  assert.deepStrictEqual([s, x], [200, { ok: true, ignorados: 1 }]);
  // F5 r3 s13 (B942): "5.0" e true nao casam mais pela afinidade do SQLite
  [s, x] = await responde('PUT', `/propostas/${id}/itens/descricoes`, { descricoes: [{ item_id: `${i2}.0`, texto: 'X' }, { item_id: true, texto: 'X' }] });
  assert.deepStrictEqual([s, x], [200, { ok: true, ignorados: 2 }]);
  assert.deepStrictEqual(await descTabela(id), [null, 'Tabela Q'], '"5.0" ou true gravou');
  // F5 r3 s10: o id com um espaco que o SQLite nao converte (nbsp) e aparado pelo idInteiro e GRAVA — gravar pelo id cru perdia calado
  [s, x] = await responde('PUT', `/propostas/${id}/itens/descricoes`, { descricoes: [{ item_id: '\u00a0' + i1, texto: 'Y' }] });
  assert.deepStrictEqual([s, x], [200, { ok: true, ignorados: 0 }]);
  assert.deepStrictEqual(await descTabela(id), ['Y', 'Tabela Q']);
});

// ── integracao ────────────────────────────────────────────────────────────────────────────
test('[RN-144.01..04] integracao: gerada com id em texto -> o formulario salva (ids novos) -> o preview velho nao grava e diz quantos -> com os ids novos grava', async () => {
  let [s, x] = await gerar([{ id: String(ctx.a) }, { id: ctx.b, quantidade: 2 }]);
  assert.strictEqual(s, 200, JSON.stringify(x));
  const id = x.id;
  const its = await itensP(id);
  const velhos = its.map((i) => i.id);
  assert.strictEqual(velhos.length, 2);
  // o formulario (montarPayloadProposta) manda os itens com o id deles; o servidor apaga e reinsere — ids novos
  [s, x] = await responde('PUT', `/propostas/${id}`, {
    titulo: 'Gerada 144',
    itens: its.map((i) => ({ id: i.id, descricao: i.descricao, quantidade: i.quantidade, unidade: i.unidade, valor_unitario: i.valor_unitario, valor_total: i.valor_total, codigo_produto: i.codigo_produto, familia_produto: i.familia_produto })),
  });
  assert.strictEqual(s, 200, JSON.stringify(x));
  const novos = (await itensP(id)).map((i) => i.id);
  assert.strictEqual(novos.length, 2);
  assert.ok(novos.every((n) => !velhos.includes(n)), `os ids nao mudaram (${velhos} -> ${novos}); o cenario da aba velha nao existe`);
  // o preview aberto antes do salvamento manda os ids velhos
  [s, x] = await responde('PUT', `/propostas/${id}/variaveis-manuais`, { valores: velhos.map((v) => ({ item_id: v, chave: 'k', valor: 'velho' })) });
  assert.deepStrictEqual([s, x], [200, { ok: true, ignorados: 2 }]);
  [s, x] = await responde('PUT', `/propostas/${id}/itens/descricoes`, { descricoes: velhos.map((v) => ({ item_id: v, texto: 'velho' })) });
  assert.deepStrictEqual([s, x], [200, { ok: true, ignorados: 2 }]);
  assert.deepStrictEqual(await vars(id), []);
  assert.deepStrictEqual(await descTabela(id), [null, null]);
  // recarregado, com os ids novos: grava e nao conta
  [s, x] = await responde('PUT', `/propostas/${id}/variaveis-manuais`, { valores: novos.map((v) => ({ item_id: v, chave: 'k', valor: 'novo' })) });
  assert.deepStrictEqual([s, x], [200, { ok: true, ignorados: 0 }]);
  [s, x] = await responde('PUT', `/propostas/${id}/itens/descricoes`, { descricoes: novos.map((v) => ({ item_id: v, texto: 'novo' })) });
  assert.deepStrictEqual([s, x], [200, { ok: true, ignorados: 0 }]);
  assert.deepStrictEqual((await vars(id)).map((v) => v.valor), ['novo', 'novo']);
  assert.deepStrictEqual(await descTabela(id), ['novo', 'novo']);
});

test('[RN-144.04, F5 r2] itens/descricoes com o UPDATE falhando: 500 que chega, nada gravado (antes: stmt.run sem callback, a resposta nunca chegava)', async () => {
  const id = await propostaPQ();
  const [i1] = (await itensP(id)).map((i) => i.id);
  await descer();
  ctx.T = await subir({ FALHA_SQL_INJETADA: '^UPDATE proposta_itens SET descricao_tabela', FALHA_SQL_MSG: 'SQLITE_BUSY: database is locked' });
  const [s, x] = await responde('PUT', `/propostas/${id}/itens/descricoes`, { descricoes: [{ item_id: i1, texto: 'Z' }] });
  assert.deepStrictEqual([s, x], [500, { error: 'SQLITE_BUSY: database is locked' }]);
  assert.deepStrictEqual(await descTabela(id), [null, null]);
  // a metade positiva: sem a falha (o servidor de volta ao normal) grava
  await descer();
  ctx.T = await subir();
  const [s2, x2] = await responde('PUT', `/propostas/${id}/itens/descricoes`, { descricoes: [{ item_id: i1, texto: 'Z' }] });
  assert.deepStrictEqual([s2, x2], [200, { ok: true, ignorados: 0 }]);
  assert.deepStrictEqual(await descTabela(id), ['Z', null]);
});

(async () => {
  console.log('\n=== Etapa 144 (propostas): o produto que nao existe na geracao automatica e o preview numa aba velha (C313, D (142)) ===\n');
  try {
    pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'e144-prod-'));
    ctx.T = await subir();
    abrirCru();
    const [sc, c] = await j('POST', '/clientes', ctx.T, { razao_social: 'Cli 144', cnpj: '11.222.333/0001-44', email: 'a@a.com' });
    assert.strictEqual(sc, 200, JSON.stringify(c));
    ctx.clienteId = c.id;
    ctx.a = await criarProduto('SA144', 10);
    ctx.b = await criarProduto('SB144', 5);
    ctx.inativo = await criarProduto('SI144', 10);
    const [sd] = await j('DELETE', `/produtos/${ctx.inativo}`, ctx.T);
    assert.strictEqual(sd, 200);
    assert.strictEqual((await all('SELECT ativo FROM produtos WHERE id = ?', [ctx.inativo]))[0].ativo, 0, 'o produto nao ficou inativo');
    for (const [name, fn] of testes) {
      if (saiu !== null) { failed++; console.error(`  ✗ ${name}: o servidor caiu antes (codigo ${saiu})`); continue; }
      try { await fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) {
        failed++; console.error(`  ✗ ${name}: ${String(e.message).replace(/\s*\n\s*/g, ' ')}`);
      }
    }
  } catch (e) { failed++; console.error('  ✗ preparo:', e.message); }
  if (cru) await new Promise((r) => cru.close(() => r()));
  await descer();
  try { fs.rmSync(pasta, { recursive: true, force: true }); } catch (e) { /* windows segura o arquivo */ }
  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
})();
