/**
 * Etapa 132 (C271) — o usuario desativado ou apagado no chat, pela ROTA: o `index.js` de verdade.
 *
 * O servico (`chatSocketSessaoDoInativo.api.test.js`) prova o socket; a feature depende de FIACAO — as tres portas do
 * `index.js` que desativam ou apagam (PATCH de status, PUT do formulario, DELETE) chamando o socket depois do sucesso. O
 * `index.js` nao esta no harness, entao este arquivo o sobe com pasta de dados vazia numa porta livre (boot ~1,6 s).
 *
 *   RN-05 (index.js) as tres chamadas, no lugar certo (estatico)
 *   RN-06 PATCH/PUT/DELETE derrubam o socket aberto; a mensagem seguinte nao chega; a conexao nova com o token velho e
 *         recusada; as recusas e a reativacao nao derrubam ninguem; o reativado volta a receber
 */
const assert = require('assert');
const fs = require('fs');
const net = require('net');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const { LITERAL_SESSAO_ENCERRADA: L11 } = require('../../services/systemPermissions');
const { conectar, ate, pausa } = require('../helpers/clienteSocketIo');

const SERVER_DIR = path.join(__dirname, '..', '..');
const ENCERRADA = { error: L11, code: 'USUARIO_INATIVO' };
const RECUSA_L11 = { message: L11, data: { code: 'USUARIO_INATIVO' } };

let passed = 0; let failed = 0;
const testes = [];
function test(name, fn) { testes.push([name, fn]); }

// ── RN-05 (index.js) — estatico ───────────────────────────────────────────────────────────
const fonte = fs.readFileSync(path.join(SERVER_DIR, 'index.js'), 'utf8')
  .split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
function trecho(de, ate_) {
  const i = fonte.indexOf(de);
  assert.ok(i >= 0, `nao achei ${de}`);
  const j = fonte.indexOf(ate_, i + de.length);
  assert.ok(j > i, `nao achei ${ate_} depois de ${de}`);
  return fonte.slice(i, j);
}
function depois(txt, antes, chamada) {
  const a = txt.indexOf(antes);
  const c = txt.indexOf(chamada);
  assert.ok(a >= 0, `nao achei ${antes}`);
  assert.ok(c >= 0, `nao achei a chamada ${chamada}`);
  assert.strictEqual(txt.split(chamada).length, 2, `a chamada ${chamada} tem de aparecer uma vez`);
  assert.ok(c > a, `${chamada} tem de vir depois de ${antes}`);
}

test('[RN-05] PATCH /status: encerrarSocketsDoUsuario so com ativo === 0, depois do UPDATE sem erro', () => {
  const t = trecho("app.patch('/api/usuarios/:id/status'", "app.delete('/api/usuarios/:id'");
  depois(t, "db.run('UPDATE usuarios SET ativo = ? WHERE id = ?'", 'if (ativo === 0 && chatSocket) chatSocket.encerrarSocketsDoUsuario(id);');
  const u = t.indexOf("db.run('UPDATE usuarios SET ativo = ? WHERE id = ?'");
  depois(t.slice(u), "return respondDbError(res, err, 'usuarios:status');", 'chatSocket.encerrarSocketsDoUsuario(id)');
});

test('[RN-05] PUT: encerrarSocketsSeInativo(id) no finishUpdate, depois do if (err)', () => {
  const t = trecho("app.put('/api/usuarios/:id'", "app.patch('/api/usuarios/:id/status'");
  const f = t.indexOf('const finishUpdate = (err) => {');
  assert.ok(f >= 0);
  const corpo = t.slice(f, t.indexOf('};', f));
  depois(corpo, 'return res.status(500).json({ error: err.message });', 'if (chatSocket) chatSocket.encerrarSocketsSeInativo(id);');
});

test('[RN-05] DELETE: encerrarSocketsDoUsuario(targetId) depois do db.exec da transacao e antes do catch', () => {
  const t = trecho("app.delete('/api/usuarios/:id'", "app.get('/api/clientes'");
  depois(t, "await db.exec(stmts.join('\\n'));", 'if (chatSocket) chatSocket.encerrarSocketsDoUsuario(targetId);');
  assert.ok(t.indexOf('chatSocket.encerrarSocketsDoUsuario(targetId)') < t.indexOf('} catch (e) {'));
});

// ── RN-06 — o servidor real ───────────────────────────────────────────────────────────────
let porta; let filho; let pasta; let logArq; let saiu = null;
const ROOT = () => `http://127.0.0.1:${porta}`;
async function j(m, u, tok, body) {
  const r = await fetch(ROOT() + '/api' + u, {
    method: m,
    headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: 'Bearer ' + tok } : {}) },
    body: body ? JSON.stringify(body) : undefined,
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
const ADMIN = { email: 'e132boot@t.com', senha: 'E132boot!senha' };
const abertos = [];
function abre(tok) { const c = conectar(porta, tok); abertos.push(c); return c; }
const msgs = (c) => c.recebeu('nova_mensagem').map((e) => e[1].conteudo);

async function subir() {
  pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'e132-chat-'));
  logArq = path.join(pasta, 'index.log');
  porta = await portaLivre();
  if (porta === 5000) porta = await portaLivre();
  const env = { ...process.env };
  for (const k of ['NODE_ENV', 'NODE_OPTIONS', 'RUN_ALL_GUARDA_EXIT', 'PORT', 'CRM_DATA_DIR', 'JWT_SECRET']) delete env[k];
  Object.assign(env, {
    CRM_DATA_DIR: pasta, PORT: String(porta), SEED_ADMIN_EMAIL: ADMIN.email, SEED_ADMIN_PASSWORD: ADMIN.senha,
  });
  const out = fs.openSync(logArq, 'a');
  filho = spawn(process.execPath, ['-r', path.join(__dirname, '..', 'helpers', 'morreComOPai.js'), 'index.js'], {
    cwd: SERVER_DIR, env, stdio: ['pipe', out, out], windowsHide: true,
  });
  filho.on('exit', (code) => { saiu = code; });
  process.on('exit', () => { try { filho.kill(); } catch (e) { /* ja saiu */ } });
  const fim = Date.now() + 60000;
  let token = null;
  while (Date.now() < fim) {
    if (saiu !== null) throw new Error(`o index.js saiu cedo (codigo ${saiu})`);
    try {
      const [s, x] = await j('POST', '/auth/login', null, ADMIN);
      if (s === 200 && x && x.token) {
        const p = await fetch(`${ROOT()}/socket.io/?EIO=4&transport=polling`);
        if (p.status === 200) { token = x.token; break; }
      }
    } catch (e) { /* ainda subindo */ }
    await pausa(200);
  }
  if (!token) throw new Error('o index.js nao ficou pronto em 60 s');
  return token;
}
async function descer() {
  for (const c of abertos) c.fechar();
  if (filho && saiu === null) {
    const morreu = new Promise((r) => filho.once('exit', r));
    filho.kill();
    await Promise.race([morreu, pausa(10000)]);
  }
  try { fs.rmSync(pasta, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }); } catch (e) { /* temporario */ }
}

const ctx = {};
async function preparar() {
  const T = await subir();
  ctx.T = T;
  const [, eu] = await j('GET', '/auth/me', T);
  ctx.adminId = eu && (eu.id || (eu.user && eu.user.id));
  ctx.ids = {}; ctx.tok = {}; ctx.conv = {};
  for (const nome of ['pat', 'put', 'del', 'ok']) {
    const [s, c] = await j('POST', '/usuarios', T, { nome, email: `${nome}132@t.com`, senha: 'Senha!132', cargo: 'C', role: 'usuario', setor: '' });
    assert.strictEqual(s, 200, `criar ${nome}: ${s} ${JSON.stringify(c)}`);
    ctx.ids[nome] = c.id;
    const [ls, l] = await j('POST', '/auth/login', null, { email: `${nome}132@t.com`, senha: 'Senha!132' });
    assert.strictEqual(ls, 200);
    ctx.tok[nome] = l.token;
    const [cs, cv] = await j('POST', '/chat/conversas/direta', T, { usuario_id: c.id });
    assert.ok(cs < 300 && cv.conversa_id, `conversa ${nome}: ${cs}`);
    ctx.conv[nome] = cv.conversa_id;
  }
  ctx.sa = abre(T);
  assert.strictEqual(await ctx.sa.pronto, 'conectado');
  ctx.s = {};
  for (const k of Object.keys(ctx.ids)) {
    ctx.s[k] = abre(ctx.tok[k]);
    assert.strictEqual(await ctx.s[k].pronto, 'conectado', `socket ${k}`);
    ctx.s[k].emit('join_conversa', ctx.conv[k]);
    ctx.sa.emit('join_conversa', ctx.conv[k]);
  }
  await pausa(300);
}
const envia = (k, conteudo) => j('POST', `/chat/conversas/${ctx.conv[k]}/mensagens`, ctx.T, { conteudo });

test('[RN-06] antes de tudo: os quatro recebem a mensagem da conversa (metade positiva do cenario)', async () => {
  for (const k of Object.keys(ctx.ids)) await envia(k, `ANTES-${k}`);
  for (const k of Object.keys(ctx.ids)) assert.ok(await ate(() => msgs(ctx.s[k]).includes(`ANTES-${k}`)), `${k} recebe`);
});

test('[RN-06] as recusas nao derrubam: o administrador desativando a si mesmo (403); reativar quem ja e ativo; PUT mantendo ativo', async () => {
  const [s1, x1] = await j('PATCH', `/usuarios/${ctx.adminId}/status`, ctx.T, { ativo: 0 });
  assert.deepStrictEqual([s1, x1 && x1.error], [403, 'Não é possível desativar o próprio usuário']);
  const [s2] = await j('PATCH', `/usuarios/${ctx.ids.ok}/status`, ctx.T, { ativo: 1 });
  assert.strictEqual(s2, 200);
  const [, u] = await j('GET', `/usuarios/${ctx.ids.ok}`, ctx.T);
  const [s3] = await j('PUT', `/usuarios/${ctx.ids.ok}`, ctx.T, { ...u, cargo: 'Outro', ativo: 1, admin_modulos: undefined });
  assert.strictEqual(s3, 200);
  await pausa(400);
  assert.strictEqual(ctx.sa.conectado, true, 'o administrador segue');
  assert.strictEqual(ctx.s.ok.conectado, true, 'o ok segue');
  assert.deepStrictEqual(ctx.s.ok.recebeu('sessao_encerrada'), []);
});

test('[RN-06] PATCH ativo 0, PUT ativo 0 e DELETE: o socket aberto leva sessao_encerrada e cai pelo servidor (41)', async () => {
  const [ps] = await j('PATCH', `/usuarios/${ctx.ids.pat}/status`, ctx.T, { ativo: 0 });
  const [, u] = await j('GET', `/usuarios/${ctx.ids.put}`, ctx.T);
  const [pu] = await j('PUT', `/usuarios/${ctx.ids.put}`, ctx.T, { ...u, ativo: 0, admin_modulos: undefined });
  const [ds] = await j('DELETE', `/usuarios/${ctx.ids.del}`, ctx.T);
  assert.deepStrictEqual([ps, pu, ds], [200, 200, 200]);
  for (const k of ['pat', 'put', 'del']) {
    assert.ok(await ate(() => ctx.s[k].desconectadoPeloServidor, 3000), `${k} cai pelo servidor`);
    assert.deepStrictEqual(ctx.s[k].recebeu('sessao_encerrada').map((e) => e[1]), [ENCERRADA], `${k} recebe o aviso`);
  }
});

test('[RN-06] a mensagem seguinte nao chega a nenhum dos tres; o ok e o administrador seguem recebendo', async () => {
  for (const k of Object.keys(ctx.ids)) await envia(k, `DEPOIS-${k}`);
  assert.ok(await ate(() => msgs(ctx.s.ok).includes('DEPOIS-ok')), 'o ok recebe');
  assert.ok(await ate(() => msgs(ctx.sa).includes('DEPOIS-ok') && msgs(ctx.sa).includes('DEPOIS-pat')), 'o administrador recebe');
  await pausa(200);
  for (const k of ['pat', 'put', 'del']) assert.ok(!msgs(ctx.s[k]).includes(`DEPOIS-${k}`), `${k} nao pode receber`);
  assert.strictEqual(ctx.s.ok.conectado, true);
});

test('[RN-06] a conexao nova com o token velho: pat, put e del recusados com L11; o ok conecta', async () => {
  for (const k of ['pat', 'put', 'del']) {
    const c = abre(ctx.tok[k]);
    assert.strictEqual(await c.pronto, 'recusado', k);
    assert.deepStrictEqual(c.recusa, RECUSA_L11, k);
  }
  const ok = abre(ctx.tok.ok);
  assert.strictEqual(await ok.pronto, 'conectado');
  ok.fechar();
});

test('[RN-06] reativar pat: o token velho conecta de novo e recebe a mensagem seguinte da conversa (o participante ficou)', async () => {
  const [s] = await j('PATCH', `/usuarios/${ctx.ids.pat}/status`, ctx.T, { ativo: 1 });
  assert.strictEqual(s, 200);
  const c = abre(ctx.tok.pat);
  assert.strictEqual(await c.pronto, 'conectado');
  c.emit('join_conversa', ctx.conv.pat);
  await pausa(300);
  await envia('pat', 'VOLTOU-pat');
  assert.ok(await ate(() => msgs(c).includes('VOLTOU-pat')), 'o reativado recebe');
});

(async () => {
  const estaticos = testes.splice(0, 3);
  for (const [name, fn] of estaticos) {
    try { await fn(); passed++; console.log(`  ✓ ${name}`); }
    catch (e) { failed++; console.error(`  ✗ ${name}: ${e.message}`); }
  }
  try {
    await preparar();
    for (const [name, fn] of testes) {
      try { await fn(); passed++; console.log(`  ✓ ${name}`); }
      catch (e) { failed++; console.error(`  ✗ ${name}: ${e.message}`); }
    }
  } catch (e) {
    failed++;
    console.error(`  ✗ preparar o servidor real: ${e.message}`);
  }
  if (failed > 0 && logArq && fs.existsSync(logArq)) {
    const log = fs.readFileSync(logArq, 'utf8').split('\n');
    console.error('--- ultimas linhas do index.js ---\n' + log.slice(-40).join('\n'));
  }
  await descer();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
