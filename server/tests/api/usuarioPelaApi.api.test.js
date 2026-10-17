/**
 * Etapa 135 (nucleo: C284, C283, C282) — o cadastro de usuario pela API, pelo `index.js` de verdade, com REINICIO no mesmo data dir.
 *
 *   RN-08 `POST /api/usuarios` sem `ativo` (ausente, nulo ou "") grava 1 — nulo e "" gravavam nulo e o usuario nao entrava; ausente ja gravava 1 (C284)
 *   RN-09 e-mail presente que nao e texto -> 400 "E-mail inválido: envie o e-mail como texto", nada gravado (C283)
 *   RN-10 o boot nao apaga mais usuario pelo nome — a limpeza de "administrator" saiu (C282)
 *
 * Plano: docs/superpowers/plans/2026-10-16-almoxarifado-etapa135-o-entregavel-de-irmaos.md
 * Molde: superPadraoNoBoot.api.test.js (pasta vazia, porta livre, morreComOPai).
 * Executar: cd server && node tests/api/usuarioPelaApi.api.test.js
 */
const assert = require('assert');
const fs = require('fs');
const net = require('net');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const SERVER_DIR = path.join(__dirname, '..', '..');
const L_EMAIL = 'E-mail inválido: envie o e-mail como texto';
const pausa = (ms) => new Promise((r) => setTimeout(r, ms));

let passed = 0; let failed = 0;
const testes = [];
function test(name, fn) { testes.push([name, fn]); }

const semComentarios = (f) => f.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
const fonteIndex = semComentarios(fs.readFileSync(path.join(SERVER_DIR, 'index.js'), 'utf8'));

test('[RN-10] estatico: o boot nao procura nem apaga usuario pelo nome "administrator"', () => {
  assert.ok(!/administrator/i.test(fonteIndex), 'o index.js ainda menciona "administrator" fora de comentario');
  // metade positiva: a regua acha o que existe (a rota de exclusao continua)
  assert.ok(/DELETE FROM usuarios WHERE id = \$\{targetId\}/.test(fonteIndex), 'premissa: a exclusao de usuario pela rota');
  assert.strictEqual((fonteIndex.match(/DELETE FROM usuarios/g) || []).length, 1, 'outro DELETE de usuario no index.js');
});

// ── o servidor real ───────────────────────────────────────────────────────────────────────
let porta; let filho = null; let pasta; let logArq; let saiu = null;
const ROOT = () => `http://127.0.0.1:${porta}`;
async function j(m, u, tok, body) {
  const r = await fetch(ROOT() + '/api' + u, {
    method: m,
    headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: 'Bearer ' + tok } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
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
const SEED = { email: 'e135seed@t.com', senha: 'E135seed!senha' };
const pastas = [];
process.on('exit', () => { try { if (filho) filho.kill(); } catch (e) { /* ja saiu */ } });

async function subir() {
  logArq = path.join(pasta, 'index.log');
  porta = await portaLivre();
  if (porta === 5000) porta = await portaLivre();
  const env = { ...process.env };
  for (const k of ['NODE_ENV', 'NODE_OPTIONS', 'RUN_ALL_GUARDA_EXIT', 'PORT', 'CRM_DATA_DIR', 'JWT_SECRET',
    'SEED_ADMIN_EMAIL', 'SEED_ADMIN_PASSWORD', 'FALHA_SQL_INJETADA']) delete env[k];
  Object.assign(env, { CRM_DATA_DIR: pasta, PORT: String(porta), SEED_ADMIN_EMAIL: SEED.email, SEED_ADMIN_PASSWORD: SEED.senha });
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
        // o login responde antes das migracoes e da limpeza do boot: espera a linha que o boot escreve no fim
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
const login = async (email, senha) => { const [s, x] = await j('POST', '/auth/login', null, { email, senha }); return s === 200 ? x.token : null; };
const lista = async (tok) => { const [s, l] = await j('GET', '/usuarios', tok); assert.strictEqual(s, 200); return l; };
const ctx = { senha: 'Senha!135', n: 0 };
const novoEmail = () => `u135-${++ctx.n}@t.com`;

test('[RN-08] criar sem ativo (ausente, nulo, "") grava 1 e o usuario entra; com 0 grava 0 e nao entra', async () => {
  for (const [rotulo, extra] of [['ausente', {}], ['nulo', { ativo: null }], ['vazio', { ativo: '' }]]) {
    const email = novoEmail();
    const [s, c] = await j('POST', '/usuarios', ctx.T, { nome: `Ativo ${rotulo}`, email, senha: ctx.senha, cargo: 'C', role: 'usuario', ...extra });
    assert.strictEqual(s, 200, `${rotulo}: ${s} ${JSON.stringify(c)}`);
    assert.strictEqual(Number(c.ativo), 1, `${rotulo}: a resposta`);
    const u = (await lista(ctx.T)).find((x) => x.id === c.id);
    assert.strictEqual(u && u.ativo, 1, `${rotulo}: gravado ${JSON.stringify(u && u.ativo)}`);
    assert.ok(await login(email, ctx.senha), `${rotulo}: nao entrou`);
  }
  const email = novoEmail();
  const [s, c] = await j('POST', '/usuarios', ctx.T, { nome: 'Ativo zero', email, senha: ctx.senha, cargo: 'C', role: 'usuario', ativo: 0 });
  assert.strictEqual(s, 200, JSON.stringify(c));
  assert.strictEqual((await lista(ctx.T)).find((x) => x.id === c.id).ativo, 0);
  assert.strictEqual(await login(email, ctx.senha), null, 'o inativo entrou');
});

test('[RN-09] POST com e-mail que nao e texto: 400 com a literal, nenhuma linha; com texto passa', async () => {
  const antes = (await lista(ctx.T)).length;
  for (const email of [123, [], ['a135@t.com'], {}, true]) {
    const [s, x] = await j('POST', '/usuarios', ctx.T, { nome: 'Email Ruim', email, senha: ctx.senha, cargo: 'C', role: 'usuario' });
    assert.deepStrictEqual([s, x && x.error], [400, L_EMAIL], `POST ${JSON.stringify(email)}`);
  }
  assert.strictEqual((await lista(ctx.T)).length, antes, 'o POST recusado gravou');
  const [s, c] = await j('POST', '/usuarios', ctx.T, { nome: 'Email Bom', email: novoEmail(), senha: ctx.senha, cargo: 'C', role: 'usuario' });
  assert.strictEqual(s, 200, JSON.stringify(c));
  ctx.alvo = c;
});

test('[RN-09] PUT com e-mail que nao e texto (inclusive nulo): 400 com a literal, o e-mail nao muda; com texto passa', async () => {
  const { id, email } = ctx.alvo;
  for (const ruim of [123, [], [email], {}, true, null]) {
    const [s, x] = await j('PUT', `/usuarios/${id}`, ctx.T, { nome: 'Email Bom', email: ruim, cargo: 'C', role: 'usuario', ativo: 1 });
    assert.deepStrictEqual([s, x && x.error], [400, L_EMAIL], `PUT ${JSON.stringify(ruim)}`);
  }
  assert.strictEqual((await lista(ctx.T)).find((u) => u.id === id).email, email, 'o PUT recusado gravou');
  const [s] = await j('PUT', `/usuarios/${id}`, ctx.T, { nome: 'Email Bom', email, cargo: 'C2', role: 'usuario', ativo: 1 });
  assert.strictEqual(s, 200);
  assert.ok(await login(email, ctx.senha), 'o e-mail de texto nao entra');
  const [s404, x404] = await j('PUT', '/usuarios/999999', ctx.T, { nome: 'X', email: 123, cargo: 'C', role: 'usuario' });
  assert.deepStrictEqual([s404, x404 && x404.error], [404, 'Usuário não encontrado'], 'o 404 vem antes');
});

test('[RN-10] reinicio no mesmo data dir: o usuario com "administrator" no nome continua, e entra', async () => {
  const email = novoEmail();
  const [s, c] = await j('POST', '/usuarios', ctx.T, { nome: 'System Administrator', email, senha: ctx.senha, cargo: 'C', role: 'usuario' });
  assert.strictEqual(s, 200, JSON.stringify(c));
  assert.strictEqual((await lista(ctx.T)).find((u) => u.id === c.id).nome, 'SYSTEM ADMINISTRATOR', 'premissa: gravado em maiusculas');
  await descer();
  ctx.T = await subir();
  const u = (await lista(ctx.T)).find((x) => x.id === c.id);
  assert.ok(u, 'o reinicio apagou o usuario');
  assert.ok(await login(email, ctx.senha), 'nao entrou depois do reinicio');
});

(async () => {
  console.log('\n=== Etapa 135 (nucleo): o cadastro de usuario pela API ===\n');
  try {
    pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'e135-usu-'));
    pastas.push(pasta);
    ctx.T = await subir();
    for (const [name, fn] of testes) {
      try { await fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) {
        failed++; console.error(`  ✗ ${name}: ${String(e.message).replace(/\s*\n\s*/g, ' ')}`);
      }
    }
  } catch (e) { failed++; console.error('  ✗ preparo:', e.message); }
  await descer();
  for (const p of pastas) { try { fs.rmSync(p, { recursive: true, force: true }); } catch (e) { /* windows segura o arquivo */ } }
  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
})();
