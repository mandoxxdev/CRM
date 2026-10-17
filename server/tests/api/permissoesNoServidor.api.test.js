/**
 * Etapa 133 (C273, C274) — as rotas de permissoes e o aviso de mensagem apagada, pela ROTA: o `index.js` de verdade.
 *
 * O registrador (`rotasDePermissoes.api.test.js`) prova a regua; isto prova o que a TELA faz no servidor real (o `enrichUserFromDb`
 * lendo o papel e o super do banco, o cadastro, o portao de modulo, os logs no index.js):
 *
 *   RN-06 o salvar do UsuarioForm (PUT do cadastro -> DELETE dos modulos -> POST de cada modulo) e a aba Permissoes pelo super com
 *         papel `usuario` e pelo papel `Admin`; o alvo passa no portao do modulo que ganhou e perde o que tiraram; a aba Logs; o
 *         administrador do modulo `admin` e o comum recusados com o literal de hoje, sem mudar nada
 *   RN-08 (Fase 2 C1) o portao da OS deixa o super com papel usuario e o Admin criar; o comum segue como hoje (500, C277)
 *   RN-07 (C274) apagar a mensagem pelo endereco com zero (`/conversas/0<id>/...`) avisa a sala da conversa
 *
 * Sobe com pasta de dados vazia numa porta livre (molde: chatSocketInativoNoServidor.api.test.js).
 */
const assert = require('assert');
const fs = require('fs');
const net = require('net');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const { conectar, ate, pausa } = require('../helpers/clienteSocketIo');

const SERVER_DIR = path.join(__dirname, '..', '..');
const L1 = 'Acesso negado';
const L2 = 'Apenas administradores podem gerenciar permissões';
const L3 = 'Acesso negado. Apenas administradores podem visualizar logs.';

let passed = 0; let failed = 0;
const testes = [];
function test(name, fn) { testes.push([name, fn]); }

// ── C274 — estatico ───────────────────────────────────────────────────────────────────────
test('[RN-07] routes/chat.js: o mensagem_excluida vai para a sala pelo numero', () => {
  const fonte = fs.readFileSync(path.join(SERVER_DIR, 'routes', 'chat.js'), 'utf8');
  const i = fonte.indexOf("app.delete('/api/chat/conversas/:id/mensagens/:msgId'");
  assert.ok(i > 0);
  const corpo = fonte.slice(i, fonte.indexOf('});', fonte.indexOf("emit('mensagem_excluida'", i)));
  assert.ok(corpo.includes("chatSocket?.io?.to(`conversa:${Number(req.params.id)}`).emit('mensagem_excluida', {"), corpo);
});

// ── o servidor real ───────────────────────────────────────────────────────────────────────
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
const ADMIN = { email: 'e133boot@t.com', senha: 'E133boot!senha' };
const abertos = [];

async function subir() {
  pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'e133-perm-'));
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

const ctx = { id: {}, tok: {} };
async function preparar() {
  ctx.T = await subir();
  // S super com papel usuario · A papel "Admin" · M administrador do modulo admin · C comum · alvoS, alvoA, alvoX alvos comuns
  const quem = {
    S: { role: 'usuario', is_superadmin: 1 }, A: { role: 'Admin' }, M: { role: 'usuario', admin_modulos: ['admin'] },
    C: { role: 'usuario' }, alvoS: { role: 'usuario' }, alvoA: { role: 'usuario' }, alvoX: { role: 'usuario' },
  };
  for (const [k, extra] of Object.entries(quem)) {
    const email = `${k.toLowerCase()}133@t.com`;
    const [s, c] = await j('POST', '/usuarios', ctx.T, { nome: k, email, senha: 'Senha!133', cargo: 'C', setor: '', ...extra });
    assert.strictEqual(s, 200, `criar ${k}: ${s} ${JSON.stringify(c)}`);
    ctx.id[k] = c.id;
    const [ls, l] = await j('POST', '/auth/login', null, { email, senha: 'Senha!133' });
    assert.strictEqual(ls, 200, `login ${k}`);
    ctx.tok[k] = l.token;
  }
  const [, me] = await j('GET', `/usuarios/${ctx.id.S}`, ctx.T);
  assert.deepStrictEqual([me.role, Number(me.is_superadmin)], ['usuario', 1], 'S e super com papel usuario');
  const [, ma] = await j('GET', `/usuarios/${ctx.id.A}`, ctx.T);
  assert.deepStrictEqual([ma.role, Number(ma.is_superadmin)], ['Admin', 0], 'A tem o papel com maiuscula');
}

/** O salvar do UsuarioForm (UsuarioForm.js ~250-300): PUT do cadastro, DELETE dos modulos, um POST por modulo. */
async function salvarComo(quem, alvo, modulos) {
  const tok = ctx.tok[quem];
  const [, u] = await j('GET', `/usuarios/${ctx.id[alvo]}`, ctx.T);
  const [ps] = await j('PUT', `/usuarios/${ctx.id[alvo]}`, tok, { nome: u.nome, email: u.email, cargo: 'Mudou', role: 'usuario', ativo: 1 });
  const [ds, dx] = await j('DELETE', `/permissoes/usuario/${ctx.id[alvo]}/modulos`, tok);
  const posts = [];
  for (const modulo of modulos) {
    posts.push(await j('POST', '/permissoes', tok, { usuario_id: ctx.id[alvo], grupo_id: null, modulo, acao: 'visualizar', permissao: 1,
      restricao_cliente_id: null, restricao_regiao: null }));
  }
  return { ps, ds, dx, posts };
}
const diretas = async (alvo) => {
  const [s, g] = await j('GET', `/usuarios/${ctx.id[alvo]}/grupos`, ctx.T);
  assert.strictEqual(s, 200);
  return g.permissoes.filter((p) => p.grupo_id === null && Number(p.permissao) === 1).map((p) => p.modulo).sort();
};
const portao = async (alvo) => (await j('GET', '/financeiro/contas-pagar', ctx.tok[alvo]))[0];

test('[RN-06] antes: o alvo sem financeiro toma 403 no portao do modulo (metade negativa)', async () => {
  for (const alvo of ['alvoS', 'alvoA', 'alvoX']) assert.strictEqual(await portao(alvo), 403, alvo);
});

test('[RN-06] o salvar do UsuarioForm pelo super com papel usuario e pelo papel Admin grava os modulos e o alvo entra', async () => {
  for (const [quem, alvo] of [['S', 'alvoS'], ['A', 'alvoA']]) {
    const r = await salvarComo(quem, alvo, ['financeiro', 'compras']);
    assert.deepStrictEqual([r.ps, r.ds, ...r.posts.map((p) => p[0])], [200, 200, 200, 200], `${quem}: ${JSON.stringify(r)}`);
    assert.deepStrictEqual(await diretas(alvo), ['compras', 'financeiro'], quem);
    assert.strictEqual(await portao(alvo), 200, `${alvo} passa no portao do financeiro`);
  }
});

test('[RN-06] o segundo salvar sem financeiro: o DELETE apagou de verdade e o alvo volta a 403', async () => {
  for (const [quem, alvo] of [['S', 'alvoS'], ['A', 'alvoA']]) {
    const r = await salvarComo(quem, alvo, ['compras']);
    assert.deepStrictEqual([r.ps, r.ds, ...r.posts.map((p) => p[0])], [200, 200, 200], quem);
    assert.deepStrictEqual(await diretas(alvo), ['compras'], quem);
    assert.strictEqual(await portao(alvo), 403, `${alvo} perdeu o financeiro`);
  }
});

test('[RN-06] a aba Permissoes pelo super e pelo Admin: grupo, membro, permissao de grupo, listas; e o membro entra pelo grupo', async () => {
  for (const quem of ['S', 'A']) {
    const tok = ctx.tok[quem];
    const [gs, g] = await j('POST', '/permissoes/grupos', tok, { nome: `Fin-${quem}`, descricao: 'x', ativo: true });
    assert.strictEqual(gs, 200, `${quem}: ${JSON.stringify(g)}`);
    const [ps] = await j('POST', '/permissoes', tok, { usuario_id: null, grupo_id: g.id, modulo: 'financeiro', acao: 'visualizar', permissao: 1 });
    const [us] = await j('POST', `/permissoes/grupos/${g.id}/usuarios`, tok, { usuario_id: ctx.id.alvoX });
    const [ls, lista] = await j('GET', '/permissoes/grupos', tok);
    const [ms, membros] = await j('GET', `/permissoes/grupos/${g.id}/usuarios`, tok);
    const [pgs, pg] = await j('GET', `/permissoes/grupos/${g.id}/permissoes`, tok);
    assert.deepStrictEqual([ps, us, ls, ms, pgs], [200, 200, 200, 200, 200], quem);
    assert.ok(lista.some((x) => x.id === g.id), quem);
    assert.deepStrictEqual(membros.map((x) => x.id), [ctx.id.alvoX], quem);
    assert.deepStrictEqual(pg.map((x) => x.modulo), ['financeiro'], quem);
    assert.strictEqual(await portao('alvoX'), 200, `${quem}: alvoX entra pelo grupo`);
    // Fase 2 I1: o toggle da aba (POST /permissoes com grupo_id e permissao 0) tira o modulo do grupo; o PUT do grupo grava
    const [ts, tx] = await j('POST', '/permissoes', tok, { usuario_id: null, grupo_id: g.id, modulo: 'financeiro', acao: 'visualizar', permissao: 0 });
    assert.deepStrictEqual([ts, tx && tx.message], [200, 'Permissão removida com sucesso'], quem);
    assert.strictEqual(await portao('alvoX'), 403, `${quem}: o toggle tirou o financeiro do grupo`);
    const [pus, pu] = await j('PUT', `/permissoes/grupos/${g.id}`, tok, { nome: `Fin-${quem}`, descricao: 'mudou', ativo: true });
    assert.deepStrictEqual([pus, pu && pu.message], [200, 'Grupo atualizado com sucesso'], quem);
    const [, g2] = await j('GET', `/permissoes/grupos/${g.id}`, tok);
    assert.strictEqual(g2.descricao, 'mudou', quem);
    const [rs] = await j('DELETE', `/permissoes/grupos/${g.id}/usuarios/${ctx.id.alvoX}`, tok);
    const [dgs] = await j('DELETE', `/permissoes/grupos/${g.id}`, tok);
    assert.deepStrictEqual([rs, dgs], [200, 200], quem);
    const [, g3] = await j('GET', `/permissoes/grupos/${g.id}`, tok);
    assert.deepStrictEqual(g3, { error: 'Grupo não encontrado' }, quem);
  }
});

test('[RN-08] a OS (Fase 2 C1): o super com papel usuario e o Admin criam; o comum segue como hoje (500, C277)', async () => {
  const corpo = (n) => ({ numero_os: `OS-133-${n}`, tipo_os: 'Manutencao', data_abertura: '2026-10-16' });
  for (const quem of ['S', 'A']) {
    const [s, x] = await j('POST', '/operacional/ordens-servico', ctx.tok[quem], corpo(quem));
    assert.strictEqual(s, 200, `${quem}: ${s} ${JSON.stringify(x)}`);
  }
  const [cs, cx] = await j('POST', '/operacional/ordens-servico', ctx.tok.C, corpo('C'));
  assert.deepStrictEqual([cs, cx], [500, { error: 'Erro ao verificar permissões' }], 'o comum: o portao de hoje (C277)');
});

test('[RN-06/RN-04] a aba Logs pelo super e pelo Admin: 200; /verificar do super diz admin', async () => {
  for (const quem of ['S', 'A']) {
    const [s, x] = await j('GET', '/auditoria/logs', ctx.tok[quem]);
    assert.strictEqual(s, 200, `${quem}: ${JSON.stringify(x)}`);
    const [vs, v] = await j('GET', '/permissoes/verificar?modulo=financeiro&acao=visualizar', ctx.tok[quem]);
    assert.deepStrictEqual([vs, v], [200, { permitido: true, motivo: 'admin' }], quem);
  }
});

test('[RN-06] o administrador do modulo admin e o comum: 403 com o literal de hoje e o alvo segue com o que tinha', async () => {
  for (const quem of ['M', 'C']) {
    const r = await salvarComo(quem, 'alvoS', ['financeiro']);
    assert.strictEqual(r.ps, 403, `${quem}: o cadastro recusa`);
    assert.deepStrictEqual([r.ds, r.dx], [403, { error: L1 }], quem);
    assert.deepStrictEqual(r.posts.map((p) => [p[0], p[1]]), [[403, { error: L2 }]], quem);
    assert.deepStrictEqual(await diretas('alvoS'), ['compras'], `${quem}: nada mudou`);
    const [gs, g] = await j('GET', '/permissoes/grupos', ctx.tok[quem]);
    assert.deepStrictEqual([gs, g], [403, { error: L1 }], quem);
    const [ngs, ng] = await j('POST', '/permissoes/grupos', ctx.tok[quem], { nome: `X-${quem}` });
    assert.deepStrictEqual([ngs, ng], [403, { error: L1 }], quem);
    const [os_, o] = await j('GET', `/permissoes/usuario/${ctx.id.alvoS}`, ctx.tok[quem]);
    assert.deepStrictEqual([os_, o], [403, { error: L1 }], quem);
    const [ls, l] = await j('GET', '/auditoria/logs', ctx.tok[quem]);
    assert.deepStrictEqual([ls, l], [403, { error: L3 }], quem);
  }
  const [, todos] = await j('GET', '/permissoes/grupos', ctx.T);
  assert.ok(!todos.some((x) => /^X-/.test(x.nome)), 'a recusa nao criou grupo');
});

test('[RN-07] C274: apagar a mensagem pelo endereco com zero avisa quem esta na conversa', async () => {
  const [cs, cv] = await j('POST', '/chat/conversas/direta', ctx.T, { usuario_id: ctx.id.C });
  assert.ok(cs < 300 && cv.conversa_id, `conversa: ${cs}`);
  const conv = cv.conversa_id;
  const c = conectar(porta, ctx.tok.C);
  abertos.push(c);
  assert.strictEqual(await c.pronto, 'conectado');
  c.emit('join_conversa', conv);
  await pausa(300);
  const [ms, m] = await j('POST', `/chat/conversas/${conv}/mensagens`, ctx.T, { conteudo: 'APAGAR-133' });
  assert.strictEqual(ms, 200, JSON.stringify(m));
  assert.ok(await ate(() => c.recebeu('nova_mensagem').some((e) => e[1].conteudo === 'APAGAR-133')), 'C recebe a mensagem (esta na sala)');
  const msgId = m.mensagem.id;
  const [ds, d] = await j('DELETE', `/chat/conversas/0${conv}/mensagens/${msgId}`, ctx.T);
  assert.deepStrictEqual([ds, d], [200, { success: true }]);
  assert.ok(await ate(() => c.recebeu('mensagem_excluida').length > 0, 3000), 'C recebe o aviso de mensagem apagada');
  assert.deepStrictEqual(c.recebeu('mensagem_excluida').map((e) => e[1]), [{ id: msgId, conversa_id: conv }]);
});

(async () => {
  const estaticos = testes.splice(0, 1);
  for (const [name, fn] of estaticos) {
    try { await fn(); passed++; console.log(`  ✓ ${name}`); }
    catch (e) { failed++; console.error(`  ✗ ${name}: ${e.message}`); }
  }
  try {
    await preparar();
    for (const [name, fn] of testes) {
      try { await fn(); passed++; console.log(`  ✓ ${name}`); }
      catch (e) { failed++; console.error(`  ✗ ${name}: ${String(e.message).slice(0, 800)}`); }
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
