/**
 * Etapa 143 (propostas) — o item que nao e item, o historico pelo pareamento e o produto de codigo repetido, pelo `index.js` de verdade
 * (pasta vazia): C310, C311.
 *
 *   RN-143.01  o PUT recusa (400) itens que nao e lista e item que nao e objeto ANTES de gravar qualquer coisa; a resposta chega (C310)
 *   RN-143.02  o POST /api/propostas recusa igual; nenhuma proposta nasce
 *   RN-143.03  a geracao automatica recusa o produto que nao e objeto; nenhuma proposta nasce
 *   RN-143.04  o historico de itens pelo mesmo pareamento (tirar o primeiro de dois = so "removido")
 *   RN-143.05  um produto por item no /premium e no /pdf (C311): codigo repetido aparado nao duplica o item; item manual nao junta produto
 *
 * Molde: propostaItensIguais.api.test.js (pasta vazia, porta livre, morreComOPai, banco lido por fora).
 * Plano: docs/superpowers/plans/2026-10-18-almoxarifado-etapa143-item-invalido-na-proposta.md
 * Executar: cd server && node tests/api/propostaItemInvalido.api.test.js
 */
const assert = require('assert');
const fs = require('fs');
const net = require('net');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const sqlite3 = require('sqlite3');
const { validarItensDoCorpo, MSG_ITENS_LISTA, MSG_ITEM_INVALIDO, diffItensParaLog } = require('../../propostaItensDiff');

const SERVER_DIR = path.join(__dirname, '..', '..');
const pausa = (ms) => new Promise((r) => setTimeout(r, ms));

let passed = 0; let failed = 0;
const testes = [];
function test(name, fn) { testes.push([name, fn]); }

// As mensagens literais do contrato (o plano). O teste compara com o texto, nao com a constante: trocar a constante tem de derrubar.
const LISTA = 'Itens inválidos: os itens da proposta devem ser enviados como uma lista.';
const ITEM = 'Item inválido: cada item da proposta deve ser um objeto.';

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
const SEED = { email: 'e143seed@t.com', senha: 'E143seed!senha' };
process.on('exit', () => { try { if (filho) filho.kill(); } catch (e) { /* ja saiu */ } });

async function subir() {
  logArq = path.join(pasta, 'index.log');
  porta = await portaLivre();
  if (porta === 5000) porta = await portaLivre();
  const env = { ...process.env };
  for (const k of ['NODE_ENV', 'NODE_OPTIONS', 'RUN_ALL_GUARDA_EXIT', 'PORT', 'CRM_DATA_DIR', 'JWT_SECRET',
    'SEED_ADMIN_EMAIL', 'SEED_ADMIN_PASSWORD', 'FALHA_SQL_INJETADA', 'RATE_LIMIT_WINDOW_MS']) delete env[k];
  Object.assign(env, { CRM_DATA_DIR: pasta, PORT: String(porta), SEED_ADMIN_EMAIL: SEED.email, SEED_ADMIN_PASSWORD: SEED.senha, RATE_LIMIT_MAX: '100000' });
  const out = fs.openSync(logArq, 'a');
  saiu = null;
  filho = spawn(process.execPath, ['-r', path.join(__dirname, '..', 'helpers', 'morreComOPai.js'), 'index.js'], {
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
        while (Date.now() < ate && !/Banco de dados totalmente inicializado/.test(fs.readFileSync(logArq, 'utf8'))) await pausa(200);
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

/** Tudo que o PUT pode gravar de uma proposta, lido por fora: a linha, os itens, as revisoes, o historico e as variaveis manuais. */
async function retrato(id) {
  const [p] = await all('SELECT titulo, revisao, numero_proposta, valor_total, status, html_rendered, updated_at FROM propostas WHERE id = ?', [id]);
  return {
    p,
    itens: (await itensP(id)).map((i) => [i.id, i.codigo_produto, i.quantidade]),
    revisoes: (await all('SELECT COUNT(*) AS n FROM proposta_revisoes WHERE proposta_id = ?', [id]))[0].n,
    log: (await all('SELECT COUNT(*) AS n FROM proposta_edicoes_log WHERE proposta_id = ?', [id]))[0].n,
    vars: await all('SELECT item_id, chave, valor, item_removido_em FROM proposta_variaveis_manuais WHERE proposta_id = ? ORDER BY id', [id]),
  };
}

async function novaProposta(itens, extra = {}) {
  const [s, p] = await j('POST', '/propostas', ctx.T, {
    cliente_id: ctx.clienteId, titulo: `Prop 143 ${++ctx.n}`, valor_total: 100, status: 'rascunho', margem_desconto: 0, itens, ...extra,
  });
  assert.strictEqual(s, 200, JSON.stringify(p));
  return p.id;
}
/** Proposta [P, Q] com uma variavel manual no P e o html_rendered preenchido (para provar que nada disso mexe). */
async function propostaComTudo() {
  const id = await novaProposta([{ ...P }, { ...Q }]);
  const its = await itensP(id);
  const r = await j('PUT', `/propostas/${id}/variaveis-manuais`, ctx.T, { valores: [{ item_id: its[0].id, chave: CHAVE, valor: 'TAG-1' }] });
  assert.strictEqual(r[0], 200, JSON.stringify(r[1]));
  await run("UPDATE propostas SET html_rendered = '<p>retrato</p>' WHERE id = ?", [id]);
  return id;
}

// ── puros: a guarda ───────────────────────────────────────────────────────────────────────
test('[RN-143.01] puro: as mensagens literais do contrato', () => {
  assert.strictEqual(MSG_ITENS_LISTA, LISTA);
  assert.strictEqual(MSG_ITEM_INVALIDO, ITEM);
});
test('[RN-143.01] puro: validarItensDoCorpo — lista de objetos, [] , null e ausente passam; o resto, a mensagem certa', () => {
  for (const ok of [undefined, null, [], [{}], [{ ...P }, { ...Q }]]) assert.strictEqual(validarItensDoCorpo(ok), null, JSON.stringify(ok));
  for (const v of [{}, 'x', '', 5, 0, true, false]) assert.strictEqual(validarItensDoCorpo(v), LISTA, JSON.stringify(v));
  for (const v of [[null], [null, P], [P, null], [5], ['x'], [[P]], [P, 7], [true], [undefined]]) {
    assert.strictEqual(validarItensDoCorpo(v), ITEM, JSON.stringify(v));
  }
});
test('[RN-143.01, F5 r1 I-1/r2, B934] puro: o item cujo campo e objeto ou lista (fora acessorios) e recusado; acessorios em lista ou texto passa', () => {
  for (const it of [{ ...P, descricao: { a: 1 } }, { ...P, descricao: ['x'] }, { ...P, unidade: {} }, { ...P, codigo_produto: ['x'] },
    { ...P, quantidade: { a: 1 } }, { ...P, id: { a: 1 } }, { ...P, nome: {} }, { ...P, tag: { a: 1 } }]) {
    assert.strictEqual(validarItensDoCorpo([{ ...Q }, it]), ITEM, JSON.stringify(it));
  }
  for (const it of [{ ...P, acessorios: [{ descricao: 'A', valor: 1 }] }, { ...P, acessorios: '[]' }, { ...P, acessorios: null },
    { ...P, quantidade: '2', ativo: true, x: null, id: 7 }]) {
    assert.strictEqual(validarItensDoCorpo([it]), null, JSON.stringify(it));
  }
});

// ── RN-143.01: o PUT ──────────────────────────────────────────────────────────────────────
// Os ultimos tres (F5 r1 I-1): item objeto com um CAMPO objeto/lista, do mesmo tamanho do gravado — o PUT nunca respondia do mesmo jeito.
const CORPOS_ITEM = [[null], [null, P], [P, null], [5], ['x'], [[P]], [P, 7], [null, P, Q],
  [{ ...P, descricao: { a: 1 } }, { ...Q }], [{ ...P, unidade: {} }, { ...Q }], [{ ...P, quantidade: { a: 1 } }]];
test('[RN-143.01, C310] PUT com item que nao e objeto: 400 com a mensagem, a resposta chega e NADA muda (tamanho igual e diferente do gravado)', async () => {
  for (const itens of CORPOS_ITEM) {
    const id = await propostaComTudo();
    const antes = await retrato(id);
    const [s, x] = await responde('PUT', `/propostas/${id}`, { titulo: 'Titulo novo', valor_total: 999, itens });
    assert.strictEqual(s, 400, `${JSON.stringify(itens)}: ${JSON.stringify(x)}`);
    assert.strictEqual(x && x.error, ITEM, JSON.stringify(itens));
    await pausa(150);
    assert.deepStrictEqual(await retrato(id), antes, `${JSON.stringify(itens)} mexeu na proposta`);
  }
});
test('[RN-143.01, B930] PUT com itens que nao e lista nem null: 400 com a mensagem e nada muda (antes: apagava os itens com 200)', async () => {
  for (const itens of [{}, { 0: P }, 'x', 5, true]) {
    const id = await propostaComTudo();
    const antes = await retrato(id);
    const [s, x] = await responde('PUT', `/propostas/${id}`, { titulo: 'Titulo novo', itens });
    assert.strictEqual(s, 400, `${JSON.stringify(itens)}: ${JSON.stringify(x)}`);
    assert.strictEqual(x && x.error, LISTA, JSON.stringify(itens));
    await pausa(150);
    assert.deepStrictEqual(await retrato(id), antes, `${JSON.stringify(itens)} mexeu na proposta`);
  }
});
test('[RN-143.01] PUT: o que passa continua passando — itens null apaga (contrato da 138), ausente nao toca, [{}] grava, lista valida grava', async () => {
  const id = await propostaComTudo();
  let r = await responde('PUT', `/propostas/${id}`, { titulo: 'So titulo' });
  assert.strictEqual(r[0], 200, JSON.stringify(r[1]));
  assert.deepStrictEqual(await codigos(id), ['P143', 'Q143'], 'itens ausente mexeu nos itens');
  r = await responde('PUT', `/propostas/${id}`, { itens: [{ ...Q }] });
  assert.strictEqual(r[0], 200, JSON.stringify(r[1]));
  assert.deepStrictEqual(await codigos(id), ['Q143']);
  r = await responde('PUT', `/propostas/${id}`, { itens: [{ ...Q, acessorios: [{ descricao: 'Acessorio 143', quantidade: 1, valor_unitario: 3 }] }] });
  assert.strictEqual(r[0], 200, 'acessorios em lista deixou de passar: ' + JSON.stringify(r[1]));
  r = await responde('PUT', `/propostas/${id}`, { itens: [{}] });
  assert.strictEqual(r[0], 200, JSON.stringify(r[1]));
  assert.strictEqual((await itensP(id)).length, 1, 'o objeto vazio passou a ser recusado (fora do escopo)');
  r = await responde('PUT', `/propostas/${id}`, { itens: null });
  assert.strictEqual(r[0], 200, JSON.stringify(r[1]));
  assert.deepStrictEqual(await codigos(id), [], 'itens null deixou de apagar (contrato da 138)');
});
test('[RN-143.01] PUT: a ordem das recusas — 404 antes, titulo e margem antes, o motivo da nao venda depois', async () => {
  let r = await responde('PUT', '/propostas/987654', { itens: [null] });
  assert.strictEqual(r[0], 404, JSON.stringify(r[1]));
  const id = await propostaComTudo();
  r = await responde('PUT', `/propostas/${id}`, { titulo: '  ', itens: [null] });
  assert.deepStrictEqual([r[0], r[1].error], [400, 'Título é obrigatório']);
  r = await responde('PUT', `/propostas/${id}`, { margem_desconto: '10,5', itens: [null] });
  assert.strictEqual(r[0], 400);
  assert.ok(/^Margem de desconto inválida/.test(r[1].error), r[1].error);
  r = await responde('PUT', `/propostas/${id}`, { status: 'rejeitada', itens: [null] });
  assert.deepStrictEqual([r[0], r[1].error], [400, ITEM], 'a guarda dos itens devia vir antes do motivo da nao venda');
});

// ── RN-143.02: o POST ─────────────────────────────────────────────────────────────────────
test('[RN-143.02] POST com item que nao e objeto ou itens que nao e lista: 400 com a mensagem e nenhuma proposta nasce', async () => {
  for (const [itens, msg] of [...CORPOS_ITEM.map((c) => [c, ITEM]), [{}, LISTA], ['x', LISTA], [5, LISTA]]) {
    const n0 = await contarPropostas();
    const [s, x] = await responde('POST', '/propostas', { cliente_id: ctx.clienteId, titulo: 'Nao nasce', status: 'rascunho', itens });
    assert.strictEqual(s, 400, `${JSON.stringify(itens)}: ${JSON.stringify(x)}`);
    assert.strictEqual(x && x.error, msg, JSON.stringify(itens));
    await pausa(100);
    assert.strictEqual(await contarPropostas(), n0, `${JSON.stringify(itens)} criou proposta`);
  }
});
test('[RN-143.02] POST: o que passa continua passando — itens null/ausente/[] = sem itens; lista valida grava; titulo vazio ainda vem antes', async () => {
  for (const extra of [{ itens: null }, {}, { itens: [] }]) {
    const id = await novaProposta(undefined, extra);
    assert.deepStrictEqual(await codigos(id), [], JSON.stringify(extra));
  }
  const id = await novaProposta([{ ...P }, { ...Q }]);
  assert.deepStrictEqual(await codigos(id), ['P143', 'Q143']);
  const r = await responde('POST', '/propostas', { cliente_id: ctx.clienteId, titulo: '', itens: [null] });
  assert.deepStrictEqual([r[0], r[1].error], [400, 'Título é obrigatório']);
});

test('[RN-143.02, F5 r3 S08/S10] POST: a ordem — a margem vem antes dos itens; os itens antes do motivo da nao venda', async () => {
  let r = await responde('POST', '/propostas', { cliente_id: ctx.clienteId, titulo: 'Ordem 1', status: 'rejeitada', itens: [null] });
  assert.deepStrictEqual([r[0], r[1].error], [400, ITEM], 'a guarda dos itens do POST devia vir antes do motivo');
  r = await responde('POST', '/propostas', { cliente_id: ctx.clienteId, titulo: 'Ordem 2', margem_desconto: '10,5', itens: [null] });
  assert.strictEqual(r[0], 400);
  assert.ok(/^Margem de desconto inválida/.test(r[1].error), 'a margem devia vir antes dos itens: ' + r[1].error);
});

// ── RN-143.03: a geracao automatica ───────────────────────────────────────────────────────
test('[RN-143.03] gerar-automatica com produto que nao e objeto: 400 com a mensagem (antes 500 ou proposta vazia) e nenhuma proposta nasce', async () => {
  for (const produtos of [[null], [null, { id: ctx.produtoId }], [5], ['x'], [[{ id: ctx.produtoId }]], [{ id: ctx.produtoId }, null],
    [{ id: { a: 1 } }], [{ id: ctx.produtoId, quantidade: { a: 1 } }]]) {
    const n0 = await contarPropostas();
    const [s, x] = await responde('POST', '/propostas/gerar-automatica', { cliente_id: ctx.clienteId, produtos });
    assert.strictEqual(s, 400, `${JSON.stringify(produtos)}: ${JSON.stringify(x)}`);
    assert.strictEqual(x && x.error, ITEM, JSON.stringify(produtos));
    await pausa(100);
    assert.strictEqual(await contarPropostas(), n0, `${JSON.stringify(produtos)} criou proposta`);
  }
  // o que passa: o produto do catalogo vira item
  const [s, x] = await responde('POST', '/propostas/gerar-automatica', { cliente_id: ctx.clienteId, produtos: [{ id: ctx.produtoId, quantidade: 2 }] });
  assert.strictEqual(s, 200, JSON.stringify(x));
  assert.deepStrictEqual(await codigos(x.id), ['PJ143']);
  // e a recusa de antes continua na frente; a da margem vem DEPOIS (F5 r3 S12/S13)
  let r = await responde('POST', '/propostas/gerar-automatica', { cliente_id: ctx.clienteId, produtos: [] });
  assert.deepStrictEqual([r[0], r[1].error], [400, 'Cliente e produtos são obrigatórios']);
  r = await responde('POST', '/propostas/gerar-automatica', { produtos: [null] });
  assert.deepStrictEqual([r[0], r[1].error], [400, 'Cliente e produtos são obrigatórios'], 'sem cliente, a recusa de antes devia vir primeiro');
  r = await responde('POST', '/propostas/gerar-automatica', { cliente_id: ctx.clienteId, produtos: [null], margem_desconto: '10,5' });
  assert.deepStrictEqual([r[0], r[1].error], [400, ITEM], 'a guarda dos produtos devia vir antes da margem');
});

// ── RN-143.04: o historico pelo pareamento ────────────────────────────────────────────────
async function logItens(id) {
  await pausa(300);
  const [s, x] = await j('GET', `/propostas/${id}/edicoes-log?limit=50`, ctx.T);
  assert.strictEqual(s, 200, JSON.stringify(x));
  return x.logs.filter((l) => /^item_/.test(l.tipo)).map((l) => `${l.tipo}:${l.campo}:${l.valor_anterior || ''}>${l.valor_novo || ''}`).sort();
}
test('[RN-143.04] historico: tirar o PRIMEIRO de dois iguais (com o id do que ficou) registra so "removido" — nenhuma edicao', async () => {
  const id = await novaProposta([{ ...P, quantidade: 1, valor_total: 100 }, { ...P, quantidade: 2, valor_total: 200 }]);
  const its = await itensP(id);
  const corpo = [{ ...P, quantidade: 2, valor_total: 200, id: its[1].id }];
  const r = await responde('PUT', `/propostas/${id}`, { itens: corpo });
  assert.strictEqual(r[0], 200, JSON.stringify(r[1]));
  assert.deepStrictEqual(await logItens(id), ['item_removido:BOMBA P:BOMBA P>'], 'o historico pareou pela posicao (antes: editado Qtd 1 -> 2 + removido)');
  // pelo servico: a funcao, com o que a rota leu, diz o mesmo
  const d = diffItensParaLog(its, corpo);
  assert.deepStrictEqual([d.adicionados.length, d.editados.length, d.removidos.map((x) => x.id)], [0, 0, [its[0].id]]);
});
test('[RN-143.04] historico sem ids: o de sempre — editar o segundo de dois iguais e uma edicao (posicao); o item manual igual nao aparece', async () => {
  const id = await novaProposta([{ ...P }, { ...P }, { descricao: 'Item manual', quantidade: 1, valor_unitario: 5, valor_total: 5 }]);
  const r = await responde('PUT', `/propostas/${id}`, { itens: [{ ...P }, { ...P, quantidade: 3, valor_total: 300 }, { descricao: 'item manual', quantidade: 1, unidade: 'UN', valor_unitario: 5, valor_total: 5 }] });
  assert.strictEqual(r[0], 200, JSON.stringify(r[1]));
  assert.deepStrictEqual(await logItens(id), ['item_editado:BOMBA P:Qtd: 1, Total: 100>Qtd: 3, Total: 300']);
});

// ── RN-143.05: um produto por item ────────────────────────────────────────────────────────
const VALOR = 98765.43; const VALOR_TXT = '98.765,43';
const conta = (html, s) => html.split(s).length - 1;
async function premium(id) {
  const [s, html] = await j('GET', `/propostas/${id}/premium?embed=1`, ctx.T, undefined, true);
  assert.strictEqual(s, 200, String(html).slice(0, 300));
  return html;
}
async function pdfRetrato(id) {
  await run('UPDATE propostas SET html_rendered = NULL WHERE id = ?', [id]);
  const [s] = await j('GET', `/propostas/${id}/pdf`, ctx.T, undefined, true, 90000);
  assert.strictEqual(s, 200);
  let html = '';
  const ate = Date.now() + 20000;
  while (Date.now() < ate) {
    html = String(((await all('SELECT html_rendered FROM propostas WHERE id = ?', [id]))[0] || {}).html_rendered || '');
    if (html) break;
    await pausa(300);
  }
  assert.ok(html, 'o /pdf nao gravou o retrato');
  return html;
}
async function criarProduto(codigo, nome) {
  const [s, x] = await j('POST', '/produtos', ctx.T, { codigo, nome, familia: FAM, classificacao_area: 'NAO CLASSIFICADA', preco_base: 10 });
  assert.strictEqual(s, 200, JSON.stringify(x));
  return x.id;
}
test('[RN-143.05, C311] /premium e /pdf: o produto de codigo repetido aparado nao duplica o item; o item manual nao junta o produto de codigo em branco', async () => {
  const id = await novaProposta([
    { descricao: 'Item jota', quantidade: 1, unidade: 'UN', valor_unitario: VALOR, valor_total: VALOR, codigo_produto: 'PJ143', familia_produto: FAM },
    { descricao: 'Item manual 143', quantidade: 1, unidade: 'UN', valor_unitario: 7, valor_total: 7 },
  ], { valor_total: VALOR + 7 });
  const h1 = await premium(id);
  const p1 = await pdfRetrato(id);
  const nValor = conta(h1, VALOR_TXT); const nManual = conta(h1.toUpperCase(), 'ITEM MANUAL 143');
  const pValor = conta(p1, VALOR_TXT);
  assert.ok(nValor > 0 && nManual > 0 && pValor > 0, `o cenario nao funciona: valor ${nValor}, manual ${nManual}, pdf ${pValor}`);
  // o cadastro aceita (medido na Fase 0): o mesmo codigo com espaco no fim e um codigo so de espacos
  await criarProduto('PJ143 ', 'Jota com espaco');
  await criarProduto('   ', 'Produto em branco 143');
  const h2 = await premium(id);
  assert.strictEqual(conta(h2, VALOR_TXT), nValor, 'o /premium duplicou o item (dois produtos PJ143 aparados)');
  assert.strictEqual(conta(h2.toUpperCase(), 'ITEM MANUAL 143'), nManual, 'o item manual perdeu o texto (juntou o produto de codigo em branco)');
  assert.ok(!h2.toUpperCase().includes('PRODUTO EM BRANCO 143'), 'o produto de codigo em branco saiu no documento');
  assert.ok(!h2.toUpperCase().includes('JOTA COM ESPACO'), 'saiu o produto de codigo aparado, nao o de codigo igual');
  const p2 = await pdfRetrato(id);
  assert.strictEqual(conta(p2, VALOR_TXT), pValor, 'o /pdf duplicou o item');
  assert.ok(!p2.toUpperCase().includes('PRODUTO EM BRANCO 143'), 'o produto de codigo em branco saiu no PDF');
  // o pedido de aprovacao do desconto le os itens pela mesma conta (ITENS_SQL): o total e o do documento, sem o item em dobro
  const [sa, xa] = await j('POST', '/aprovacoes', ctx.T, { proposta_id: id, valor_desconto: 10 });
  assert.strictEqual(sa, 200, JSON.stringify(xa));
  const [ap] = await all('SELECT valor_total FROM aprovacoes WHERE proposta_id = ? ORDER BY id DESC LIMIT 1', [id]);
  assert.strictEqual(ap.valor_total, Math.round((VALOR + 7) * 100) / 100, 'o pedido de aprovacao somou o item em dobro');
  // o item com codigo so de espacos (a API grava: '  ' e verdadeiro) tambem nao junta o produto de codigo em branco
  const r = await responde('PUT', `/propostas/${id}`, { itens: [{ descricao: 'Item manual 143', codigo_produto: '  ', quantidade: 1, unidade: 'UN', valor_unitario: 7, valor_total: 7 }] });
  assert.strictEqual(r[0], 200, JSON.stringify(r[1]));
  assert.deepStrictEqual(await codigos(id), ['  '], 'o cenario nao funciona: o codigo so de espacos nao foi gravado');
  const h3 = (await premium(id)).toUpperCase();
  assert.ok(h3.includes('ITEM MANUAL 143') && !h3.includes('PRODUTO EM BRANCO 143'), 'o item de codigo so de espacos juntou o produto de codigo em branco');
});
test('[RN-143.05] so o codigo aparado casa: o item " PJ243" (gravado com espaco) junta o produto PJ243 (o de antes continua)', async () => {
  await criarProduto('PJ243', 'Produto dois quatro tres');
  const id = await novaProposta([{ descricao: 'Item 243', quantidade: 1, unidade: 'UN', valor_unitario: 3, valor_total: 3, codigo_produto: 'PJ243', familia_produto: FAM }]);
  await run("UPDATE proposta_itens SET codigo_produto = ' PJ243' WHERE proposta_id = ?", [id]);
  assert.ok((await premium(id)).toUpperCase().includes('PRODUTO DOIS QUATRO TRES'), 'o item de codigo com espaco deixou de juntar o produto');
  // o de codigo IGUAL vence o de menor id: o item 'PJ143 ' (gravado assim) junta o produto 'PJ143 ', nao o 'PJ143' (criado antes)
  await run("UPDATE proposta_itens SET codigo_produto = 'PJ143 ' WHERE proposta_id = ?", [id]);
  const h = (await premium(id)).toUpperCase();
  assert.ok(h.includes('JOTA COM ESPACO') && !h.includes('JOTA CENTO E QUARENTA E TRES'), 'o codigo igual nao venceu o de menor id');
});

test('[RN-143.04, F5 r1 M-2] historico: o corpo com nome e sem descricao (o INSERT grava descricao = nome) nao registra edicao em todo salvamento', async () => {
  const id = await novaProposta([{ nome: 'Fulano servico', quantidade: 1, unidade: 'UN', valor_unitario: 5, valor_total: 5 }]);
  const [it] = await itensP(id);
  assert.strictEqual(it.descricao, 'Fulano servico', 'o cenario nao funciona: o INSERT nao gravou a descricao pelo nome');
  for (let k = 0; k < 2; k++) {
    const r = await responde('PUT', `/propostas/${id}`, { itens: [{ id: (await itensP(id))[0].id, nome: 'Fulano servico', valor_unitario: 5, valor_total: 5 }] });
    assert.strictEqual(r[0], 200, JSON.stringify(r[1]));
  }
  assert.deepStrictEqual(await logItens(id), [], 'edicao falsa (descricao/unidade/quantidade pelo valor cru do corpo)');
});
test('[RN-143.04, Fase 2 I-4] historico pela rota: o item manual com SO a descricao editada (com o id) registra a edicao da descricao', async () => {
  const id = await novaProposta([{ descricao: 'Servico A', quantidade: 1, unidade: 'UN', valor_unitario: 5, valor_total: 5 }]);
  const [it] = await itensP(id);
  const r = await responde('PUT', `/propostas/${id}`, { itens: [{ id: it.id, descricao: 'Servico B', quantidade: 1, unidade: 'UN', valor_unitario: 5, valor_total: 5 }] });
  assert.strictEqual(r[0], 200, JSON.stringify(r[1]));
  assert.deepStrictEqual(await logItens(id), ['item_editado:SERVICO B:Descrição: SERVICO A>Descrição: SERVICO B']);
});

test('[RN-143.05, F5 r3 Q2/Q3] nenhum produto de codigo igual: o aparado de MENOR id, uma vez so (documento e total do pedido)', async () => {
  // os produtos 'PJ143' (menor id) e 'PJ143 ' ja existem; o item gravado pela API com ' PJ143' nao e igual a nenhum dos dois
  const id = await novaProposta([{ descricao: 'Item m5', quantidade: 1, unidade: 'UN', valor_unitario: VALOR, valor_total: VALOR, codigo_produto: ' PJ143', familia_produto: FAM }], { valor_total: VALOR });
  assert.deepStrictEqual(await codigos(id), [' PJ143'], 'o cenario nao funciona: o codigo com espaco nao foi gravado');
  const h = await premium(id);
  assert.ok(conta(h, VALOR_TXT) > 0, 'o cenario nao funciona: o valor nao saiu');
  const hu = h.toUpperCase();
  assert.ok(hu.includes('JOTA CENTO E QUARENTA E TRES') && !hu.includes('JOTA COM ESPACO'), 'nao saiu o de menor id (ou sairam os dois)');
  const [sa, xa] = await j('POST', '/aprovacoes', ctx.T, { proposta_id: id, valor_desconto: 10 });
  assert.strictEqual(sa, 200, JSON.stringify(xa));
  const [ap] = await all('SELECT valor_total FROM aprovacoes WHERE proposta_id = ? ORDER BY id DESC LIMIT 1', [id]);
  assert.strictEqual(ap.valor_total, VALOR, 'o pedido de aprovacao somou o item em dobro');
});
test('[RN-143.05, Fase 2 M-10, F5 r3 Q13] o produto inativo entra na escolha: o inativo de codigo igual vence, o item sai uma vez', async () => {
  const pInativo = await criarProduto('PI143', 'Produto inativo 143');
  await criarProduto('PI143 ', 'Produto ativo espaco 143');
  await run('UPDATE produtos SET ativo = 0 WHERE id = ?', [pInativo]);
  const id = await novaProposta([{ descricao: 'Item pi', quantidade: 1, unidade: 'UN', valor_unitario: VALOR, valor_total: VALOR, codigo_produto: 'PI143', familia_produto: FAM }], { valor_total: VALOR });
  const hu = (await premium(id)).toUpperCase();
  assert.ok(hu.includes('PRODUTO INATIVO 143') && !hu.includes('PRODUTO ATIVO ESPACO 143'), 'o inativo de codigo igual deixou de vencer (ou sairam os dois)');
});

/** Os valores das variaveis manuais que o /premium imprime, por posicao do item no documento (o mesmo da 142). */
async function noPremium(id) {
  const html = await premium(id);
  const its = await itensP(id);
  const pos = new Map(its.map((it, i) => [String(it.id), i + 1]));
  const fonte = html.indexOf('id="proposalSource"') >= 0 ? html.slice(html.indexOf('id="proposalSource"')) : html;
  const re = new RegExp(`data-variavel-manual="${CHAVE}" data-variavel-item="(\\d+)">([^<]*)<`, 'g');
  const vistos = new Map();
  let m;
  while ((m = re.exec(fonte))) if (!vistos.has(m[1])) vistos.set(m[1], m[2]);
  return Array.from(vistos.entries()).map(([itemId, v]) => `${pos.get(itemId) || 'x' + itemId}:${v}`).sort();
}
test('[RN-143.05, Fase 2 I-3] o reparo das variaveis do /premium ve cada item uma vez: duas orfas de dois iguais, com produto de codigo repetido, uma em cada', async () => {
  await criarProduto('PR143', 'Produto erre');
  await criarProduto('PR143 ', 'Produto erre espaco');
  const R = { descricao: 'Item erre', quantidade: 1, unidade: 'UN', valor_unitario: 9, valor_total: 9, codigo_produto: 'PR143', familia_produto: FAM };
  const id = await novaProposta([{ ...R }, { ...R }]);
  const its = await itensP(id);
  const r = await j('PUT', `/propostas/${id}/variaveis-manuais`, ctx.T, { valores: [{ item_id: its[0].id, chave: CHAVE, valor: 'TAG-1' }, { item_id: its[1].id, chave: CHAVE, valor: 'TAG-2' }] });
  assert.strictEqual(r[0], 200, JSON.stringify(r[1]));
  assert.deepStrictEqual(await noPremium(id), ['1:TAG-1', '2:TAG-2'], 'o cenario nao funciona');
  // as duas viram orfas (de itens velhos distintos), como se a religacao nao tivesse acontecido: so o reparo da leitura as poe nos itens
  await run('UPDATE proposta_variaveis_manuais SET item_id = 997001 WHERE proposta_id = ? AND valor = ?', [id, 'TAG-1']);
  await run('UPDATE proposta_variaveis_manuais SET item_id = 997002 WHERE proposta_id = ? AND valor = ?', [id, 'TAG-2']);
  assert.deepStrictEqual(await noPremium(id), ['1:TAG-1', '2:TAG-2'], 'o reparo pos as duas orfas no mesmo item (o item duplicado pelo JOIN)');
});

// ── integracao: as tres portas e as duas leituras no mesmo fluxo ──────────────────────────
test('[RN-143.01..05] integracao: POST recusado e aceito -> PUT recusado (nada muda) -> PUT tirando o primeiro de dois (log so removido) -> /premium uma vez', async () => {
  const item = { descricao: 'Item int', quantidade: 1, unidade: 'UN', valor_unitario: 4321.09, valor_total: 4321.09, codigo_produto: 'PJ143', familia_produto: FAM };
  let r = await responde('POST', '/propostas', { cliente_id: ctx.clienteId, titulo: 'Int 143', status: 'rascunho', itens: [item, null] });
  assert.deepStrictEqual([r[0], r[1].error], [400, ITEM]);
  const id = await novaProposta([{ ...item }, { ...item, quantidade: 2, valor_unitario: 1111.11, valor_total: 2222.22 }]);
  const its = await itensP(id);
  const antes = await retrato(id);
  r = await responde('PUT', `/propostas/${id}`, { itens: [{ ...item, quantidade: 2, valor_unitario: 1111.11, valor_total: 2222.22, id: its[1].id }, null] });
  assert.deepStrictEqual([r[0], r[1].error], [400, ITEM]);
  assert.deepStrictEqual(await retrato(id), antes);
  r = await responde('PUT', `/propostas/${id}`, { itens: [{ ...item, quantidade: 2, valor_unitario: 1111.11, valor_total: 2222.22, id: its[1].id }], valor_total: 2222.22 });
  assert.strictEqual(r[0], 200, JSON.stringify(r[1]));
  assert.deepStrictEqual(await logItens(id), ['item_removido:ITEM INT:ITEM INT>']);
  const html = await premium(id);
  assert.strictEqual(conta(html, '2.222,22') > 0, true, 'o item que ficou nao saiu no documento');
  assert.strictEqual(conta(html, '4.321,09'), 0, 'o item que saiu (o unitario dele) ainda aparece');
});

(async () => {
  console.log('\n=== Etapa 143 (propostas): o item que nao e item, o historico pelo pareamento e o produto de codigo repetido (C310, C311) ===\n');
  try {
    pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'e143-item-'));
    ctx.T = await subir();
    abrirCru();
    const [sc, c] = await j('POST', '/clientes', ctx.T, { razao_social: 'Cli 143', cnpj: '11.222.333/0001-44', email: 'a@a.com' });
    assert.strictEqual(sc, 200, JSON.stringify(c));
    ctx.clienteId = c.id;
    await run("INSERT INTO variaveis_tecnicas (nome, chave, tipo, ativo) VALUES ('Tag E143', ?, 'manual_proposta', 1)", [CHAVE]);
    await run("INSERT INTO proposta_template_config (familia, variaveis_proposta_por_familia) VALUES ('Geral', ?)", [JSON.stringify({ [FAM]: [CHAVE] })]);
    ctx.produtoId = await criarProduto('PJ143', 'Jota cento e quarenta e tres');
    // um aprovador de desconto que nao e dono das propostas (o pedido de aprovacao exige — Etapa 140)
    await run("INSERT INTO usuarios (nome, email, senha, ativo, pode_aprovar_descontos) VALUES ('Aprovador 143', 'aprov143@t.com', 'x', 1, 1)");
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
