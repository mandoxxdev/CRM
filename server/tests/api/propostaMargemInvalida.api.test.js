/**
 * Etapa 139 (propostas) — a margem de desconto que não é número (C299) e a geração automática sem a regra dos 5% (C300),
 * pelo `index.js` de verdade (pasta vazia).
 *
 *   RN-139.04 a régua da margem: null/'' -> 0; número (ou texto com número com ponto) de 0 a 100 -> o número; o resto -> 400
 *             L-MARGEM, nada gravado. No POST, no PUT (só quando a chave veio) e na geração automática.
 *   RN-139.05 geração automática: margem > 5 com status que não é rascunho -> 403 (a mensagem do POST); sem status -> rascunho.
 *
 * Antes: "10,5" e "10abc" não são > 5 para o JavaScript — passavam pela regra do desconto e eram gravados como texto
 * (a proposta ficava "enviada" com desconto sem aprovação); -1 e 101 também passavam.
 *
 * Plano: docs/superpowers/plans/2026-10-17-almoxarifado-etapa139-as-invariantes-da-proposta.md
 * Molde: putParcialMantem.api.test.js.
 * Executar: cd server && node tests/api/propostaMargemInvalida.api.test.js
 */
const assert = require('assert');
const fs = require('fs');
const net = require('net');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const sqlite3 = require('sqlite3');

const SERVER_DIR = path.join(__dirname, '..', '..');
const pausa = (ms) => new Promise((r) => setTimeout(r, ms));

let passed = 0; let failed = 0;
const testes = [];
function test(name, fn) { testes.push([name, fn]); }

// ── o servidor real ───────────────────────────────────────────────────────────────────────
let porta; let filho = null; let pasta; let logArq; let saiu = null;
async function j(m, u, tok, body) {
  const r = await fetch(`http://127.0.0.1:${porta}/api${u}`, {
    method: m,
    headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: 'Bearer ' + tok } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20000),
  });
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
const SEED = { email: 'e139margem@t.com', senha: 'E139margem!senha' };
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
        while (Date.now() < ate && !fs.readFileSync(logArq, 'utf8').includes('Banco de dados totalmente inicializado')) await pausa(200);
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
const run = (sql, p = []) => new Promise((res, rej) => cru.run(sql, p, function feito(e) { if (e) rej(e); else res(this); }));
const all = (sql, p = []) => new Promise((res, rej) => cru.all(sql, p, (e, r) => (e ? rej(e) : res(r))));
const get = async (sql, p = []) => (await all(sql, p))[0];
const ctx = { n: 0 };
async function novoCliente() {
  const [s, c] = await j('POST', '/clientes', ctx.T, {
    razao_social: `Cli ${++ctx.n}`, nome_fantasia: 'Fant', cnpj: '11.222.333/0001-44', segmento: 'Seg', telefone: '(11) 9999-0000', email: 'a@a.com',
    endereco: 'Rua A', cidade: 'Sao Paulo', estado: 'SP', cep: '01000-000', contato_principal: 'Joao', observacoes: 'obs',
  });
  assert.strictEqual(s, 200, JSON.stringify(c));
  await run("UPDATE clientes SET logo_url = 'logo-139.png' WHERE id = ?", [c.id]);
  return c.id;
}

const { lerMargemDesconto } = require('../../margemDesconto');

const L_MARGEM = 'Margem de desconto inválida: informe um número de 0 a 100, com ponto como separador decimal.';
const L_DESC_POST = 'Não é possível salvar uma proposta com desconto acima de 5% sem aprovação prévia. A proposta deve ser salva como rascunho até que a autorização seja aprovada.';
const L_DESC_PUT = 'Não é possível alterar o status de uma proposta com desconto acima de 5% sem aprovação prévia. A proposta deve permanecer como rascunho até que a autorização seja aprovada.';
const L_TITULO = 'Título é obrigatório';

const linhaP = (id) => get('SELECT * FROM propostas WHERE id = ?', [id]);
const contaP = async () => (await get('SELECT COUNT(*) n FROM propostas')).n;
const tipoMargem = async (id) => (await get('SELECT typeof(margem_desconto) t, margem_desconto m FROM propostas WHERE id = ?', [id]));
function mudou(antes, depois, ignorar = ['updated_at', 'html_rendered']) {
  const out = {};
  for (const k of Object.keys(antes)) if (!ignorar.includes(k) && JSON.stringify(antes[k]) !== JSON.stringify(depois[k])) out[k] = [antes[k], depois[k]];
  return out;
}
const ITENS = [{ descricao: 'Item 1', quantidade: 1, unidade: 'UN', valor_unitario: 100, valor_total: 100, codigo_produto: 'P1' }];
const corpoPost = (extra = {}) => ({ cliente_id: ctx.clienteId, titulo: 'Prop margem', valor_total: 100, status: 'rascunho', itens: ITENS, ...extra });
async function novaProposta(extra = {}) {
  const [s, p] = await j('POST', '/propostas', ctx.T, corpoPost(extra));
  assert.strictEqual(s, 200, JSON.stringify(p));
  return p.id;
}
/** A recusa: status e mensagem literais, e nada gravado na proposta. */
async function recusaPut(id, corpo, status, msg) {
  const a = await linhaP(id);
  const r = await j('PUT', `/propostas/${id}`, ctx.T, corpo);
  assert.deepStrictEqual([r[0], r[1] && r[1].error], [status, msg], `PUT ${JSON.stringify(corpo)}`);
  assert.deepStrictEqual(mudou(a, await linhaP(id)), {}, `a recusa de ${JSON.stringify(corpo)} gravou algo`);
}
async function recusaPost(corpo, status, msg, rota = '/propostas') {
  const n = await contaP();
  const r = await j('POST', rota, ctx.T, corpo);
  assert.deepStrictEqual([r[0], r[1] && r[1].error], [status, msg], `POST ${rota} ${JSON.stringify(corpo)}`);
  assert.strictEqual(await contaP(), n, `a recusa de ${JSON.stringify(corpo)} criou proposta`);
}

// ── a régua ───────────────────────────────────────────────────────────────────────────────
test('[RN-139.04] a regua: vazio e 0 a 100 aceitos (numero ou texto com ponto), o resto recusado', async () => {
  const aceitos = [[null, 0], ['', 0], ['   ', 0], [0, 0], [5, 5], [100, 100], [10.5, 10.5], ['10.5', 10.5], [' 7 ', 7], ['100.0', 100], ['0', 0], [-0, 0]];
  for (const [v, esperado] of aceitos) assert.deepStrictEqual(lerMargemDesconto(v), { ok: true, valor: esperado }, `aceito ${JSON.stringify(v)}`);
  const recusados = ['10,5', '10abc', -1, '-1', 101, '101', 100.0001, true, false, [], [5], {}, NaN, Infinity, '1e2', '0x10', '.5', '5.', 'abc'];
  for (const v of recusados) assert.deepStrictEqual(lerMargemDesconto(v), { ok: false }, `recusado ${String(v)}`);
});

// ── POST ──────────────────────────────────────────────────────────────────────────────────
test('[RN-139.04a] POST: margem que nao e numero -> 400, nada criado; "10.5" grava o numero 10.5', async () => {
  for (const m of ['10,5', '10abc', -1, 101, true]) await recusaPost(corpoPost({ margem_desconto: m }), 400, L_MARGEM);
  const id = await novaProposta({ margem_desconto: '10.5' });
  assert.deepStrictEqual(await tipoMargem(id), { t: 'real', m: 10.5 });
  const id2 = await novaProposta({ margem_desconto: null });
  assert.deepStrictEqual(await tipoMargem(id2), { t: 'real', m: 0 });
  const id3 = await novaProposta({ margem_desconto: 3 });
  assert.deepStrictEqual(await tipoMargem(id3), { t: 'real', m: 3 });
});

test('[RN-139.04a] POST: a ordem das recusas — titulo antes da margem, margem antes do motivo', async () => {
  await recusaPost(corpoPost({ titulo: '', margem_desconto: 'x' }), 400, L_TITULO);
  await recusaPost(corpoPost({ margem_desconto: 'x', status: 'rejeitada' }), 400, L_MARGEM);
  // "10,5" com status enviada: antes passava pela regra dos 5% (nao e > 5) e criava a proposta enviada
  await recusaPost(corpoPost({ margem_desconto: '10,5', status: 'enviada' }), 400, L_MARGEM);
  await recusaPost(corpoPost({ margem_desconto: '10.5', status: 'enviada' }), 403, L_DESC_POST);
});

// ── PUT ───────────────────────────────────────────────────────────────────────────────────
test('[RN-139.04b] PUT: margem que nao e numero -> 400 e nada muda (nem o titulo que veio junto)', async () => {
  const id = await novaProposta({ margem_desconto: 2 });
  await recusaPut(id, { titulo: 'Outro', margem_desconto: '10abc' }, 400, L_MARGEM);
  await recusaPut(id, { margem_desconto: -1 }, 400, L_MARGEM);
  await recusaPut(id, { margem_desconto: '101' }, 400, L_MARGEM);
  await recusaPut(id, { margem_desconto: {} }, 400, L_MARGEM);
});

test('[RN-139.04b] PUT: "7" grava o numero 7; ausente mantem; null grava 0', async () => {
  const id = await novaProposta({ margem_desconto: 2 });
  let r = await j('PUT', `/propostas/${id}`, ctx.T, { margem_desconto: '7' });
  assert.strictEqual(r[0], 200, JSON.stringify(r[1]));
  assert.deepStrictEqual(await tipoMargem(id), { t: 'real', m: 7 });
  r = await j('PUT', `/propostas/${id}`, ctx.T, { titulo: 'So titulo' });
  assert.strictEqual(r[0], 200, JSON.stringify(r[1]));
  assert.deepStrictEqual(await tipoMargem(id), { t: 'real', m: 7 }, 'a chave ausente deixou de manter');
  r = await j('PUT', `/propostas/${id}`, ctx.T, { margem_desconto: null });
  assert.strictEqual(r[0], 200, JSON.stringify(r[1]));
  assert.deepStrictEqual(await tipoMargem(id), { t: 'real', m: 0 });
});

test('[RN-139.04c] PUT: "10,5" com status enviada -> 400 (antes 200 e enviada); "10.5" -> 403 da regra dos 5%', async () => {
  const id = await novaProposta({ margem_desconto: 2 });
  await recusaPut(id, { margem_desconto: '10,5', status: 'enviada' }, 400, L_MARGEM);
  await recusaPut(id, { margem_desconto: '10.5', status: 'enviada' }, 403, L_DESC_PUT);
});

test('[RN-139.04] PUT: a ordem das recusas — 404, titulo, margem', async () => {
  const r = await j('PUT', '/propostas/999999', ctx.T, { margem_desconto: 'x' });
  assert.deepStrictEqual([r[0], r[1] && r[1].error], [404, 'Proposta não encontrada']);
  const id = await novaProposta();
  await recusaPut(id, { titulo: '', margem_desconto: 'x' }, 400, L_TITULO);
  await recusaPut(id, { margem_desconto: 'x', status: 'rejeitada' }, 400, L_MARGEM);
});

test('[RN-139.04d] PUT: a margem GRAVADA ilegivel ("10,5", de antes) conta como acima de 5 — enviar sem aprovacao -> 403', async () => {
  const id = await novaProposta({ margem_desconto: 2 });
  await run("UPDATE propostas SET margem_desconto = '10,5' WHERE id = ?", [id]);
  assert.deepStrictEqual(await tipoMargem(id), { t: 'text', m: '10,5' }, 'o preparo nao gravou o texto');
  await recusaPut(id, { status: 'enviada' }, 403, L_DESC_PUT);
  // o titulo sozinho continua passando (a regra so roda quando status ou margem vieram)
  const r = await j('PUT', `/propostas/${id}`, ctx.T, { titulo: 'Legado' });
  assert.strictEqual(r[0], 200, JSON.stringify(r[1]));
  // e a margem nova, legivel, conserta
  const r2 = await j('PUT', `/propostas/${id}`, ctx.T, { margem_desconto: 3, status: 'enviada' });
  assert.strictEqual(r2[0], 200, JSON.stringify(r2[1]));
  assert.deepStrictEqual([(await linhaP(id)).status, (await tipoMargem(id)).m], ['enviada', 3]);
});

// ── aprovação ─────────────────────────────────────────────────────────────────────────────
test('[RN-139.06] POST /aprovacoes: desconto que nao e numero de 0 a 100 -> 400, nada criado; 12.5 -> criada', async () => {
  const id = await novaProposta({ margem_desconto: 2 });
  const u = await get('SELECT MIN(id) id FROM usuarios');
  await run('UPDATE usuarios SET pode_aprovar_descontos = 1 WHERE id = ?', [u.id]); // a rota exige um aprovador cadastrado
  const conta = async () => (await get('SELECT COUNT(*) n FROM aprovacoes WHERE proposta_id = ?', [id])).n;
  for (const v of ['10,5', 500, -3, 'abc']) {
    const n = await conta();
    const r = await j('POST', '/aprovacoes', ctx.T, { proposta_id: id, tipo: 'desconto', valor_desconto: v, solicitado_por: u.id });
    assert.deepStrictEqual([r[0], r[1] && r[1].error], [400, L_MARGEM], `valor_desconto ${JSON.stringify(v)}`);
    assert.strictEqual(await conta(), n, `a recusa de ${JSON.stringify(v)} criou aprovacao`);
  }
  const r = await j('POST', '/aprovacoes', ctx.T, { proposta_id: id, tipo: 'desconto', valor_desconto: 12.5, solicitado_por: u.id });
  assert.ok(r[0] === 200 || r[0] === 201, JSON.stringify(r));
  assert.strictEqual((await get('SELECT valor_desconto v FROM aprovacoes WHERE proposta_id = ? ORDER BY id DESC', [id])).v, 12.5);
});

// ── Fase 5 (sabotagens B03/C01/D06/E02, B05/D03) ──────────────────────────────────────────
test('[RN-139.04] Fase 5: so espacos grava o NUMERO 0 em todas as portas (o SQLite nao converte "   " em REAL)', async () => {
  const id = await novaProposta({ margem_desconto: '   ' });
  assert.deepStrictEqual(await tipoMargem(id), { t: 'real', m: 0 }, 'POST');
  await run('UPDATE propostas SET margem_desconto = 2 WHERE id = ?', [id]);
  let r = await j('PUT', `/propostas/${id}`, ctx.T, { margem_desconto: '   ' });
  assert.strictEqual(r[0], 200, JSON.stringify(r[1]));
  assert.deepStrictEqual(await tipoMargem(id), { t: 'real', m: 0 }, 'PUT');
  r = await j('POST', '/propostas/gerar-automatica', ctx.T, { cliente_id: ctx.clienteId, produtos: [{ id: ctx.produtoId, quantidade: 1 }], margem_desconto: '   ' });
  assert.strictEqual(r[0], 200, JSON.stringify(r[1]));
  assert.deepStrictEqual(await tipoMargem(r[1].id), { t: 'real', m: 0 }, 'gerar-automatica');
  const u = await get('SELECT MIN(id) id FROM usuarios');
  await run('UPDATE usuarios SET pode_aprovar_descontos = 1 WHERE id = ?', [u.id]);
  r = await j('POST', '/aprovacoes', ctx.T, { proposta_id: id, tipo: 'desconto', valor_desconto: '   ', solicitado_por: u.id });
  assert.ok(r[0] === 200 || r[0] === 201, JSON.stringify(r));
  const ap = await get('SELECT typeof(valor_desconto) t, valor_desconto m FROM aprovacoes WHERE proposta_id = ? ORDER BY id DESC', [id]);
  assert.deepStrictEqual({ t: ap.t, m: ap.m }, { t: 'real', m: 0 }, 'aprovacoes');
});

test('[RN-139.04/05] Fase 5: exatamente 5% com status enviada passa (o limite e "acima de 5"), no POST e na geracao', async () => {
  const [s, p] = await j('POST', '/propostas', ctx.T, corpoPost({ margem_desconto: 5, status: 'enviada' }));
  assert.strictEqual(s, 200, JSON.stringify(p));
  assert.deepStrictEqual([(await linhaP(p.id)).status, (await linhaP(p.id)).margem_desconto], ['enviada', 5]);
  const [s2, p2] = await j('POST', '/propostas/gerar-automatica', ctx.T, { cliente_id: ctx.clienteId, produtos: [{ id: ctx.produtoId, quantidade: 1 }], margem_desconto: '5', status: 'enviada' });
  assert.strictEqual(s2, 200, JSON.stringify(p2));
  assert.deepStrictEqual([(await linhaP(p2.id)).status, (await linhaP(p2.id)).margem_desconto], ['enviada', 5]);
  // e o passo seguinte cai: 5.01
  await recusaPost(corpoPost({ margem_desconto: 5.01, status: 'enviada' }), 403, L_DESC_POST);
});

// ── geração automática ────────────────────────────────────────────────────────────────────
test('[RN-139.05] gerar-automatica: o corpo da tela cria rascunho com margem 0 (como hoje)', async () => {
  const tela = { cliente_id: ctx.clienteId, oportunidade_id: null, tipo_proposta: null, expira_em: null, validade_dias: 15,
    condicoes_pagamento: 'cp', observacoes: 'o', produtos: [{ id: ctx.produtoId, codigo: 'E139-P', nome: 'Prod', quantidade: 2 }] };
  const [s, p] = await j('POST', '/propostas/gerar-automatica', ctx.T, tela);
  assert.strictEqual(s, 200, JSON.stringify(p));
  const l = await linhaP(p.id);
  assert.deepStrictEqual([l.status, l.margem_desconto, l.valor_total], ['rascunho', 0, 200]);
});

test('[RN-139.05] gerar-automatica: margem > 5 com status enviada -> 403 (antes nascia enviada); invalida -> 400; sem status -> rascunho', async () => {
  const base = { cliente_id: ctx.clienteId, produtos: [{ id: ctx.produtoId, quantidade: 1 }] };
  await recusaPost({ ...base, margem_desconto: 50, status: 'enviada' }, 403, L_DESC_POST, '/propostas/gerar-automatica');
  await recusaPost({ ...base, margem_desconto: '10,5' }, 400, L_MARGEM, '/propostas/gerar-automatica');
  await recusaPost({ ...base, margem_desconto: '10,5', status: 'enviada' }, 400, L_MARGEM, '/propostas/gerar-automatica');
  const [s, p] = await j('POST', '/propostas/gerar-automatica', ctx.T, { ...base, margem_desconto: 50 });
  assert.strictEqual(s, 200, JSON.stringify(p));
  const l = await linhaP(p.id);
  assert.deepStrictEqual([l.status, l.margem_desconto], ['rascunho', 50]);
  const [s2, p2] = await j('POST', '/propostas/gerar-automatica', ctx.T, { ...base, margem_desconto: 50, status: 'rascunho' });
  assert.strictEqual(s2, 200, JSON.stringify(p2));
  assert.strictEqual((await linhaP(p2.id)).status, 'rascunho');
  const [s3, p3] = await j('POST', '/propostas/gerar-automatica', ctx.T, { ...base, margem_desconto: 4, status: 'enviada' });
  assert.strictEqual(s3, 200, JSON.stringify(p3));
  assert.deepStrictEqual([(await linhaP(p3.id)).status, (await linhaP(p3.id)).margem_desconto], ['enviada', 4]);
});

(async () => {
  console.log('\n=== Etapa 139 (propostas): a margem que nao e numero (C299) e a geracao automatica (C300) ===\n');
  try {
    pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'e139-margem-'));
    ctx.T = await subir();
    cru = new sqlite3.Database(path.join(pasta, 'database.sqlite'));
    cru.configure('busyTimeout', 15000);
    ctx.clienteId = await novoCliente();
    const ins = await run("INSERT INTO produtos (codigo, nome, familia, preco_base) VALUES ('E139-P', 'Prod 139', 'FAM', 100)");
    ctx.produtoId = ins.lastID;
    // Etapa 140 (RN-140.07): quem pede o desconto não é quem o decide — os pedidos abaixo são feitos pelo super do seed, então tem de
    // existir OUTRO aprovador (senão 400 "Só você pode aprovar descontos..."). A regra não afrouxa: o teste ganha o aprovador.
    const [sa, ua] = await j('POST', '/usuarios', ctx.T, { nome: 'Aprov 139', email: 'aprov139@t.com', senha: 'Senha!139', cargo: 'C', role: 'usuario', setor: '', pode_aprovar_descontos: 1 });
    assert.strictEqual(sa, 200, `criar o aprovador: ${sa} ${JSON.stringify(ua)}`);
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
