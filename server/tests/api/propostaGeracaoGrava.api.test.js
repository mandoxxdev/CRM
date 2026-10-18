/**
 * Etapa 145 (propostas) — a geracao automatica responde depois de gravar os itens, e o cliente que nao existe e recusado nas duas
 * portas, pelo `index.js` de verdade (pasta vazia): C318, C315.
 *
 *   RN-145.05  a geracao automatica grava os itens em sequencia e so responde depois do ultimo; falha num item -> 500 e nada fica
 *              (itens e proposta desfeitos); a limpeza que falha -> 500 dizendo que a proposta ficou incompleta
 *   RN-145.06  cliente que nao existe -> 400 com a frase, antes do numero e de criar, na geracao automatica e no POST /api/propostas
 *   RN-145.07  a ordem: o portao (403) antes de tudo; o produto (RN-144) e o 403 dos 5 % antes do cliente
 *   T4         integracao com o portao da T1 (o mesmo usuario le pelo Operacional e e barrado na geracao, antes do 400 do cliente)
 *
 * Molde: propostaProdutoInexistente.api.test.js (pasta vazia, porta livre, morreComOPai, banco lido por fora).
 * Plano: docs/superpowers/plans/2026-10-18-almoxarifado-etapa145-o-modulo-nas-rotas-da-proposta.md
 * Executar: cd server && node tests/api/propostaGeracaoGrava.api.test.js
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
/** A chamada que tem de RESPONDER: 60 s de limite (3 000 itens gravados um a um). */
async function responde(m, u, body, tok = ctx.T) {
  try {
    return await j(m, u, tok, body, false, 60000);
  } catch (e) {
    throw new Error(`${m} ${u} nao respondeu em 60 s (${e.name}) com ${JSON.stringify(body).slice(0, 120)}`);
  }
}
function portaLivre() {
  return new Promise((res, rej) => {
    const s = net.createServer();
    s.once('error', rej);
    s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); });
  });
}
const SEED = { email: 'e145gseed@t.com', senha: 'E145gseed!senha' };
process.on('exit', () => { try { if (filho) filho.kill(); } catch (e) { /* ja saiu */ } });

async function subir(extraEnv = {}) {
  logArq = path.join(pasta, 'index.log');
  porta = await portaLivre();
  if (porta === 5000) porta = await portaLivre();
  const env = { ...process.env };
  for (const k of ['NODE_ENV', 'NODE_OPTIONS', 'RUN_ALL_GUARDA_EXIT', 'PORT', 'CRM_DATA_DIR', 'JWT_SECRET',
    'SEED_ADMIN_EMAIL', 'SEED_ADMIN_PASSWORD', 'FALHA_SQL_INJETADA', 'FALHA_SQL_MSG', 'FALHA_SQL_METODOS', 'FALHA_SQL_PULAR', 'PROPOSTAS_PORTAO_DE_MODULO', 'RATE_LIMIT_WINDOW_MS']) delete env[k];
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
const NAO_CLIENTE = (id) => `Cliente não encontrado (id ${id}). Atualize a lista de clientes e tente de novo.`;
const ITENS_NADA = (msg) => `Erro ao gravar os itens da proposta (${msg}). Nenhuma proposta foi criada — tente de novo.`;
const ITENS_INCOMPLETA = (msg, numero) => `Erro ao gravar os itens da proposta (${msg}). A proposta ${numero} ficou incompleta — exclua-a e gere de novo.`;
const DESCONTO = 'Não é possível salvar uma proposta com desconto acima de 5% sem aprovação prévia. A proposta deve ser salva como rascunho até que a autorização seja aprovada.';
const NEGADO = { error: 'Acesso negado ao módulo', modulo: 'comercial' };
const INJ = 'falha injetada pelo teste';

const contar = async () => {
  const [p] = await all('SELECT COUNT(*) AS n FROM propostas');
  const [i] = await all('SELECT COUNT(*) AS n FROM proposta_itens');
  return [p.n, i.n];
};
const gerar = (corpo, tok = ctx.T) => responde('POST', '/propostas/gerar-automatica', corpo, tok);
const cinco = () => Array.from({ length: 5 }, () => ({ id: ctx.produto }));
async function semNada(fn, rotulo) {
  const antes = await contar();
  const r = await fn();
  await pausa(150);
  assert.deepStrictEqual(await contar(), antes, `${rotulo}: criou proposta ou item`);
  return r;
}
async function usuario(nome, diretas) {
  const email = `${nome}@e145g.t`;
  const [s, u] = await j('POST', '/usuarios', ctx.T, { nome, email, senha: 'Senha!145g', cargo: 'C', role: 'usuario', setor: '' });
  assert.ok(s === 200 || s === 201, `usuario ${nome}: ${s} ${JSON.stringify(u)}`);
  const id = (await all('SELECT id FROM usuarios WHERE email = ?', [email]))[0].id;
  for (const m of diretas) await run("INSERT INTO permissoes (usuario_id, grupo_id, modulo, acao, permissao) VALUES (?, NULL, ?, 'acesso', 1)", [id, m]);
  const [sl, l] = await j('POST', '/auth/login', null, { email, senha: 'Senha!145g' });
  assert.strictEqual(sl, 200, JSON.stringify(l));
  return { id, T: l.token };
}

// ── RN-145.05 (C318): a resposta depois do ultimo item ───────────────────────────────────
test('[RN-145.05, C318] 3 000 itens: no instante do 200 os 3 000 estao no banco (antes: 34 de 200 na resposta)', async () => {
  const [s, x] = await gerar({ cliente_id: ctx.clienteId, produtos: Array.from({ length: 3000 }, (_, i) => ({ id: ctx.produto, quantidade: 1 + (i % 3) })) });
  const [n] = await all('SELECT COUNT(*) AS n, SUM(valor_total) AS soma, MAX(numero_item) AS ultimo FROM proposta_itens WHERE proposta_id = ?', [x && x.id]);
  assert.strictEqual(s, 200, JSON.stringify(x).slice(0, 200));
  assert.deepStrictEqual([n.n, n.ultimo, n.soma], [3000, 3000, x.valor_total], 'a resposta saiu antes de gravar todos os itens');
  assert.strictEqual(x.itens.length, 3000);
  assert.strictEqual(x.valor_total, 10 * (1000 * 1 + 1000 * 2 + 1000 * 3));
});

test('[RN-145.06, C315] cliente que nao existe: 400 com a frase nas duas portas, com e sem numero, e nada nasce (antes: 500)', async () => {
  const [s1, x1] = await semNada(() => gerar({ cliente_id: 99999, produtos: [{ id: ctx.produto }] }), 'gerar');
  assert.deepStrictEqual([s1, x1], [400, { error: NAO_CLIENTE(99999) }]);
  const [s2, x2] = await semNada(() => responde('POST', '/propostas', { titulo: 'X', cliente_id: 99999, itens: [{ descricao: 'A' }] }), 'post');
  assert.deepStrictEqual([s2, x2], [400, { error: NAO_CLIENTE(99999) }]);
  const [s3, x3] = await semNada(() => responde('POST', '/propostas', { titulo: 'X', cliente_id: '88888', numero_proposta: '777-01-XX-2026-REV00' }), 'post com numero');
  assert.deepStrictEqual([s3, x3], [400, { error: NAO_CLIENTE(88888) }]);
  // a metade positiva: com o cliente que existe as duas criam
  const [s4, x4] = await gerar({ cliente_id: ctx.clienteId, produtos: [{ id: ctx.produto }] });
  assert.strictEqual(s4, 200, JSON.stringify(x4));
  const [s5, x5] = await responde('POST', '/propostas', { titulo: 'X', cliente_id: ctx.clienteId, numero_proposta: '778-01-XX-2026-REV00' });
  assert.strictEqual(s5, 200, JSON.stringify(x5));
});

test('[RN-145.06, B947] o cliente inativo conta como achado (as duas portas criam)', async () => {
  await run("UPDATE clientes SET status = 'inativo' WHERE id = ?", [ctx.inativo]);
  const [s1, x1] = await gerar({ cliente_id: ctx.inativo, produtos: [{ id: ctx.produto }] });
  const [s2, x2] = await responde('POST', '/propostas', { titulo: 'X', cliente_id: ctx.inativo });
  assert.deepStrictEqual([s1, s2], [200, 200], JSON.stringify([x1, x2]));
});

test('[RN-145.07] a ordem: "Cliente inválido" e o produto que nao existe antes do cliente; o 403 dos 5 % antes do cliente', async () => {
  const casos = [
    [() => gerar({ cliente_id: 'abc', produtos: [{ id: ctx.produto }] }), 400, 'Cliente inválido'],
    [() => gerar({ cliente_id: 99999, produtos: [{ id: 99999 }] }), 400, nao('99999')],
    [() => gerar({ cliente_id: 99999, produtos: [{ id: ctx.produto }], margem_desconto: 10, status: 'enviada' }), 403, DESCONTO],
    [() => responde('POST', '/propostas', { titulo: 'X', cliente_id: 'abc' }), 400, 'Cliente inválido'],
    [() => responde('POST', '/propostas', { titulo: 'X', cliente_id: 99999, margem_desconto: 10, status: 'enviada' }), 403, DESCONTO],
    [() => responde('POST', '/propostas', { cliente_id: 99999 }), 400, 'Título é obrigatório'],
  ];
  const out = [];
  for (const [fn, st, msg] of casos) {
    const [s, x] = await semNada(fn, msg);
    out.push([s, x && x.error, st, msg]);
  }
  assert.deepStrictEqual(out.map(([s, e]) => [s, e]), out.map(([, , st, msg]) => [st, msg]));
});

// ── T4: integracao com o portao (T1) ─────────────────────────────────────────────────────
test('[T4, RN-145.01/02/05/07] o vendedor gera (itens gravados); o usuario so do Operacional le pelo GET /:id e e barrado no preview e na geracao — antes do 400 do cliente', async () => {
  const [s, x] = await gerar({ cliente_id: ctx.clienteId, produtos: [{ id: ctx.produto }, { id: String(ctx.produto), quantidade: 2 }] }, ctx.vend.T);
  assert.strictEqual(s, 200, JSON.stringify(x));
  assert.deepStrictEqual((await all('SELECT quantidade FROM proposta_itens WHERE proposta_id = ? ORDER BY id', [x.id])).map((r) => r.quantidade), [1, 2]);
  const [s1, x1] = await j('GET', `/propostas/${x.id}`, ctx.oper.T);
  assert.strictEqual(s1, 200, JSON.stringify(x1));
  assert.strictEqual(x1.itens.length, 2, 'a OS do Operacional le os itens da proposta');
  const [s2, x2] = await j('PUT', `/propostas/${x.id}/itens/descricoes`, ctx.oper.T, { descricoes: [] });
  assert.deepStrictEqual([s2, x2], [403, NEGADO]);
  const [s3, x3] = await semNada(() => gerar({ cliente_id: 99999, produtos: [{ id: ctx.produto }] }, ctx.oper.T), 'oper');
  assert.deepStrictEqual([s3, x3], [403, NEGADO]);
  // a metade positiva: o vendedor, com o mesmo corpo, toma o 400 do cliente
  const [s4, x4] = await gerar({ cliente_id: 99999, produtos: [{ id: ctx.produto }] }, ctx.vend.T);
  assert.deepStrictEqual([s4, x4], [400, { error: NAO_CLIENTE(99999) }]);
});

// ── RN-145.05 com a falha injetada (reboots) ──────────────────────────────────────────────
async function reboot(env) {
  await descer();
  ctx.T = await subir(env);
}
test('[RN-145.05, C318] a falha no 1o item e no 3o de 5: 500 com a frase, e nem proposta nem item ficam', async () => {
  await reboot({ FALHA_SQL_INJETADA: '^INSERT INTO proposta_itens' });
  const [s1, x1] = await semNada(() => gerar({ cliente_id: ctx.clienteId, produtos: cinco() }), '1o item');
  assert.deepStrictEqual([s1, x1], [500, { error: ITENS_NADA(INJ) }]);
  await reboot({ FALHA_SQL_INJETADA: '^INSERT INTO proposta_itens', FALHA_SQL_PULAR: '2' });
  const [s2, x2] = await semNada(() => gerar({ cliente_id: ctx.clienteId, produtos: cinco() }), '3o item');
  assert.deepStrictEqual([s2, x2], [500, { error: ITENS_NADA(INJ) }]);
  // a metade positiva: com PULAR=5 os cinco passam (a injecao so pega do 6o em diante) e a proposta nasce com os cinco
  await reboot({ FALHA_SQL_INJETADA: '^INSERT INTO proposta_itens', FALHA_SQL_PULAR: '5' });
  const [s3, x3] = await gerar({ cliente_id: ctx.clienteId, produtos: cinco() });
  assert.strictEqual(s3, 200, JSON.stringify(x3));
  assert.strictEqual((await all('SELECT COUNT(*) AS n FROM proposta_itens WHERE proposta_id = ?', [x3.id]))[0].n, 5);
});

test('[RN-145.05, Fase 2 M-9] a limpeza que falha: 500 dizendo que a proposta ficou incompleta (sem itens, ou com os que gravaram)', async () => {
  // a proposta nao sai: fica sem itens
  await reboot({ FALHA_SQL_INJETADA: '^INSERT INTO proposta_itens|^DELETE FROM propostas WHERE', FALHA_SQL_PULAR: '2' });
  const [p0, i0] = await contar();
  const [s1, x1] = await gerar({ cliente_id: ctx.clienteId, produtos: cinco() });
  await pausa(150);
  const [ult] = await all('SELECT id, numero_proposta FROM propostas ORDER BY id DESC LIMIT 1');
  assert.deepStrictEqual([s1, x1], [500, { error: ITENS_INCOMPLETA(INJ, ult.numero_proposta) }]);
  assert.deepStrictEqual(await contar(), [p0 + 1, i0], 'a proposta incompleta devia ficar, sem itens');
  // os itens nao saem: a proposta NAO e apagada (fica com os dois que gravaram)
  await reboot({ FALHA_SQL_INJETADA: '^INSERT INTO proposta_itens|^DELETE FROM proposta_itens', FALHA_SQL_PULAR: '2' });
  const [p1, i1] = await contar();
  const [s2, x2] = await gerar({ cliente_id: ctx.clienteId, produtos: cinco() });
  await pausa(150);
  const [ult2] = await all('SELECT id, numero_proposta FROM propostas ORDER BY id DESC LIMIT 1');
  assert.deepStrictEqual([s2, x2], [500, { error: ITENS_INCOMPLETA(INJ, ult2.numero_proposta) }]);
  assert.deepStrictEqual(await contar(), [p1 + 1, i1 + 2], 'com os itens presos, a proposta devia ficar (com os dois)');
});

test('[RN-145.06] falha ao ler o cliente: 500 com a frase nas duas portas, e nada nasce', async () => {
  await reboot({ FALHA_SQL_INJETADA: '^SELECT id FROM clientes WHERE id = \\?$' });
  const [s1, x1] = await semNada(() => gerar({ cliente_id: ctx.clienteId, produtos: [{ id: ctx.produto }] }), 'gerar');
  const [s2, x2] = await semNada(() => responde('POST', '/propostas', { titulo: 'X', cliente_id: ctx.clienteId }), 'post');
  assert.deepStrictEqual([[s1, x1], [s2, x2]], [[500, { error: `Erro ao verificar o cliente: ${INJ}` }], [500, { error: `Erro ao verificar o cliente: ${INJ}` }]]);
  await reboot({});
});

(async () => {
  console.log('\n=== Etapa 145 (propostas): a geracao automatica responde depois de gravar e o cliente que nao existe (C318, C315) ===\n');
  try {
    pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'e145-grava-'));
    ctx.T = await subir();
    abrirCru();
    const [sc, c] = await j('POST', '/clientes', ctx.T, { razao_social: 'Cli 145g', cnpj: '11.222.333/0001-46', email: 'a@a.com' });
    assert.strictEqual(sc, 200, JSON.stringify(c));
    ctx.clienteId = c.id;
    const [sc2, c2] = await j('POST', '/clientes', ctx.T, { razao_social: 'Cli 145 inativo', cnpj: '11.222.333/0001-47', email: 'b@a.com' });
    assert.strictEqual(sc2, 200, JSON.stringify(c2));
    ctx.inativo = c2.id;
    const [sp, p] = await j('POST', '/produtos', ctx.T, { codigo: 'SG145', nome: 'Produto 145g', familia: 'FAM145', classificacao_area: 'NAO CLASSIFICADA', preco_base: 10 });
    assert.strictEqual(sp, 200, JSON.stringify(p));
    ctx.produto = p.id;
    ctx.vend = await usuario('vend145', ['comercial']);
    ctx.oper = await usuario('oper145', ['operacional']);
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
