/**
 * Etapa 134 (C280) — o super administrador do boot, pelo `index.js` de verdade, com REINICIO no mesmo data dir.
 *
 *   RN-01 o boot so promove o `admin@gmp.com.br` quando nao ha super ativo (a recuperacao do banco antigo), antes do seed
 *   RN-02 o administrador semeado so nasce quando nao ha super ativo (o apagado nao volta com a senha antiga)
 *   RN-03 o e-mail do administrador padrao so e dado por um super (POST/PUT /api/usuarios, 403 L4)
 *
 * Ate a 133 o boot promovia a super, a cada reinicio, quem tivesse o e-mail `admin@gmp.com.br` — e quem gerencia usuarios trocava o
 * proprio e-mail para esse (reproduzido pelo r2 da 133: o DELETE de usuario, so de super, passava de 403 a 200 depois do reinicio).
 *
 * Plano: docs/superpowers/plans/2026-10-16-almoxarifado-etapa134-o-super-do-boot-e-a-trilha.md
 * Molde: permissoesNoServidor.api.test.js (pasta vazia, porta livre, morreComOPai).
 */
const assert = require('assert');
const fs = require('fs');
const net = require('net');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const sqlite3 = require('sqlite3');
const bcrypt = require('bcryptjs');

const SERVER_DIR = path.join(__dirname, '..', '..');
const PADRAO = 'admin@gmp.com.br';
const L4 = 'O e-mail admin@gmp.com.br é reservado ao administrador padrão — só um Super Administrador pode atribuí-lo';
const L5 = 'Apenas Super Administradores podem excluir usuários';
const pausa = (ms) => new Promise((r) => setTimeout(r, ms));

let passed = 0; let failed = 0;
const testes = [];
function test(name, fn) { testes.push([name, fn]); }

// ── estatico e unidade ────────────────────────────────────────────────────────────────────
const semComentarios = (f) => f.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
const fonteIndex = semComentarios(fs.readFileSync(path.join(SERVER_DIR, 'index.js'), 'utf8'));

test('[RN-01] estatico: nao sobra UPDATE que promove pelo e-mail fora do servico; o seed chama a promocao antes de procurar', () => {
  assert.ok(!/UPDATE usuarios SET is_superadmin\s*=\s*1/.test(fonteIndex), 'o index.js ainda promove por conta propria');
  const i = fonteIndex.indexOf('function seedAdminInicial()');
  assert.ok(i > 0, 'seedAdminInicial sumiu');
  const corpo = fonteIndex.slice(i, fonteIndex.indexOf('\n  }\n', i));
  const iProm = corpo.indexOf('superPadrao.promoverSuperPadraoSemSuperAtivo(db)');
  const iBusca = corpo.indexOf("'SELECT * FROM usuarios WHERE email = ?'");
  const iHa = corpo.indexOf('superPadrao.haSuperAtivo(db)');
  assert.ok(iProm > 0 && iBusca > iProm, 'a promocao nao vem antes da busca do seed');
  assert.ok(iHa > iBusca, 'o seed nao confere se ha super ativo antes de criar');
});

function memoria() {
  const db = new sqlite3.Database(':memory:');
  const run = (sql, p = []) => new Promise((res, rej) => db.run(sql, p, function cb(e) { if (e) rej(e); else res(this); }));
  const all = (sql, p = []) => new Promise((res, rej) => db.all(sql, p, (e, r) => (e ? rej(e) : res(r))));
  return { db, run, all };
}

test('[RN-01][RN-03] o servico: ehEmailDoSuperPadrao, a promocao com e sem super ativo, o super inativo nao conta', async () => {
  const sp = require('../../services/superPadrao');
  assert.strictEqual(sp.EMAIL_SUPER_PADRAO, PADRAO);
  assert.strictEqual(sp.LITERAL_EMAIL_RESERVADO, L4);
  for (const e of [PADRAO, ' ADMIN@GMP.com.br ', 'Admin@Gmp.Com.Br']) assert.strictEqual(sp.ehEmailDoSuperPadrao(e), true, e);
  for (const e of ['admin@gmp.com', 'xadmin@gmp.com.br', '', null, undefined, 5, {}]) assert.strictEqual(sp.ehEmailDoSuperPadrao(e), false, String(e));
  const m = memoria();
  await m.run('CREATE TABLE usuarios (id INTEGER PRIMARY KEY, email TEXT, ativo INTEGER DEFAULT 1, is_superadmin INTEGER DEFAULT 0)');
  await m.run(`INSERT INTO usuarios (id, email, ativo, is_superadmin) VALUES (1, ?, 1, 0), (2, 'outro@t.com', 0, 1), (3, 'c@t.com', 1, 0)`, [PADRAO]);
  assert.strictEqual(await sp.haSuperAtivo(m.db), false, 'o super inativo conta como ativo');
  assert.strictEqual(await sp.promoverSuperPadraoSemSuperAtivo(m.db), 1, 'sem super ativo, promove');
  assert.deepStrictEqual((await m.all('SELECT id FROM usuarios WHERE is_superadmin = 1 AND ativo = 1')).map((r) => r.id), [1]);
  assert.strictEqual(await sp.haSuperAtivo(m.db), true);
  await m.run('UPDATE usuarios SET is_superadmin = 0 WHERE id = 1');
  await m.run('UPDATE usuarios SET is_superadmin = 1 WHERE id = 3');
  assert.strictEqual(await sp.promoverSuperPadraoSemSuperAtivo(m.db), 0, 'com super ativo, nao promove');
  assert.strictEqual((await m.all('SELECT is_superadmin FROM usuarios WHERE id = 1'))[0].is_superadmin, 0);
  // Fase 5 r1 M1: o super com `ativo` nulo nao entra (o login exige ativo = 1) e nao conta como ativo
  await m.run('UPDATE usuarios SET is_superadmin = 0');
  await m.run("INSERT INTO usuarios (id, email, ativo, is_superadmin) VALUES (4, 'fantasma@t.com', NULL, 1)");
  assert.strictEqual(await sp.haSuperAtivo(m.db), false, 'o super com ativo nulo conta como ativo');
  assert.strictEqual(await sp.promoverSuperPadraoSemSuperAtivo(m.db), 1, 'o super com ativo nulo travou a promocao');
  m.db.close();
});

// ── o servidor real ───────────────────────────────────────────────────────────────────────
let porta; let filho = null; let pasta; let logArq; let saiu = null;
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
const SEED = { email: 'e134seed@t.com', senha: 'E134seed!senha' };
const pastas = [];
process.on('exit', () => { try { if (filho) filho.kill(); } catch (e) { /* ja saiu */ } });

/** Sobe o index.js na `pasta` atual; `seed` = credenciais do env (ou null: sem SEED_ADMIN_*); espera o login de `login`. */
async function subir({ seed = SEED, login = SEED, falha = null } = {}) {
  logArq = path.join(pasta, 'index.log');
  porta = await portaLivre();
  if (porta === 5000) porta = await portaLivre();
  const env = { ...process.env };
  for (const k of ['NODE_ENV', 'NODE_OPTIONS', 'RUN_ALL_GUARDA_EXIT', 'PORT', 'CRM_DATA_DIR', 'JWT_SECRET',
    'SEED_ADMIN_EMAIL', 'SEED_ADMIN_PASSWORD']) delete env[k];
  Object.assign(env, { CRM_DATA_DIR: pasta, PORT: String(porta) });
  if (seed) Object.assign(env, { SEED_ADMIN_EMAIL: seed.email, SEED_ADMIN_PASSWORD: seed.senha });
  delete env.FALHA_SQL_INJETADA;
  if (falha) env.FALHA_SQL_INJETADA = falha;
  const out = fs.openSync(logArq, 'a');
  saiu = null;
  filho = spawn(process.execPath, ['-r', path.join(__dirname, '..', 'helpers', 'morreComOPai.js'),
    '-r', path.join(__dirname, '..', 'helpers', 'falhaSqlInjetada.js'), 'index.js'], {
    cwd: SERVER_DIR, env, stdio: ['pipe', out, out], windowsHide: true,
  });
  filho.on('exit', (code) => { saiu = code; });
  const fim = Date.now() + 60000;
  while (Date.now() < fim) {
    if (saiu !== null) throw new Error(`o index.js saiu cedo (codigo ${saiu})`);
    if (login === null) {
      // sem login a esperar: o banco pronto (a linha do log que o boot escreve depois do seed e das migracoes)
      if (fs.readFileSync(logArq, 'utf8').includes('Banco de dados totalmente inicializado')) { await pausa(1500); return null; }
      await pausa(200);
      continue;
    }
    try {
      // `/health` responde antes do banco estar pronto: o login so e 200 depois do seed e da promocao.
      const [s, x] = await j('POST', '/auth/login', null, login);
      if (s === 200 && x && x.token) {
        await pausa(1500); // o PRAGMA das colunas e as migracoes terminam depois do primeiro login possivel
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
const novaPasta = () => { pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'e134-boot-')); pastas.push(pasta); return pasta; };

/** O arquivo do banco com o servidor PARADO. */
function noArquivo(fn) {
  return new Promise((res, rej) => {
    const db = new sqlite3.Database(path.join(pasta, 'database.sqlite'));
    const run = (sql, p = []) => new Promise((r2, j2) => db.run(sql, p, (e) => (e ? j2(e) : r2())));
    const all = (sql, p = []) => new Promise((r2, j2) => db.all(sql, p, (e, r) => (e ? j2(e) : r2(r))));
    Promise.resolve(fn({ run, all })).then((v) => db.close(() => res(v)), (e) => db.close(() => rej(e)));
  });
}
const login = async (email, senha) => { const [s, x] = await j('POST', '/auth/login', null, { email, senha }); return s === 200 ? x.token : null; };
const superDe = async (tok, id) => { const [s, u] = await j('GET', `/usuarios/${id}`, tok); assert.strictEqual(s, 200); return Number(u.is_superadmin); };
const contagem = async (tok) => { const [s, l] = await j('GET', '/usuarios', tok); assert.strictEqual(s, 200); return l.length; };

const ctx = { id: {}, tok: {}, senha: 'Senha!134' };
async function preparar() {
  novaPasta();
  ctx.T = await subir();
  const quem = { S2: { role: 'usuario', is_superadmin: 1 }, A: { role: 'admin' }, C: { role: 'usuario' }, X: { role: 'usuario' } };
  for (const [k, extra] of Object.entries(quem)) {
    const email = `${k.toLowerCase()}134@t.com`;
    const [s, c] = await j('POST', '/usuarios', ctx.T, { nome: `Pessoa ${k}`, email, senha: ctx.senha, cargo: 'C', ...extra });
    assert.strictEqual(s, 200, `criar ${k}: ${s} ${JSON.stringify(c)}`);
    ctx.id[k] = c.id;
    ctx.tok[k] = await login(email, ctx.senha);
    assert.ok(ctx.tok[k], `login ${k}`);
  }
  const [, me] = await j('GET', '/auth/me', ctx.T);
  ctx.id.seed = me.user.id;
}

test('[RN-02a] pasta vazia: o seed nasce super, com o papel admin', async () => {
  const [s, u] = await j('GET', `/usuarios/${ctx.id.seed}`, ctx.T);
  assert.strictEqual(s, 200);
  assert.deepStrictEqual([u.email, u.role, Number(u.is_superadmin)], [SEED.email, 'admin', 1]);
  assert.strictEqual(await superDe(ctx.T, ctx.id.S2), 1);
  assert.strictEqual(await superDe(ctx.T, ctx.id.A), 0);
});

test('[RN-03] quem nao e super nao poe o e-mail do administrador padrao (proprio, com caixa e espacos, criando) — 403 L4, nada gravado', async () => {
  for (const email of [PADRAO, '  ADMIN@GMP.com.br ']) {
    const [s, x] = await j('PUT', `/usuarios/${ctx.id.A}`, ctx.tok.A, { nome: 'Pessoa A', email, cargo: 'C', role: 'admin', ativo: 1 });
    assert.deepStrictEqual([s, x && x.error], [403, L4], `PUT proprio com ${JSON.stringify(email)}`);
  }
  const [s2, x2] = await j('PUT', `/usuarios/${ctx.id.X}`, ctx.tok.A, { nome: 'Pessoa X', email: PADRAO, cargo: 'C', role: 'usuario', ativo: 1 });
  assert.deepStrictEqual([s2, x2 && x2.error], [403, L4], 'PUT de outro');
  const antes = await contagem(ctx.T);
  const [s3, x3] = await j('POST', '/usuarios', ctx.tok.A, { nome: 'Novo', email: PADRAO, senha: 'Senha!134', cargo: 'C', role: 'usuario' });
  assert.deepStrictEqual([s3, x3 && x3.error], [403, L4], 'POST');
  assert.strictEqual(await contagem(ctx.T), antes, 'o POST recusado gravou');
  const [, a] = await j('GET', `/usuarios/${ctx.id.A}`, ctx.T);
  const [, xx] = await j('GET', `/usuarios/${ctx.id.X}`, ctx.T);
  assert.deepStrictEqual([a.email, xx.email], ['a134@t.com', 'x134@t.com'], 'o PUT recusado gravou');
  // metade positiva: o mesmo PUT com outro e-mail passa (a recusa e do e-mail, nao do gesto)
  const [s4] = await j('PUT', `/usuarios/${ctx.id.A}`, ctx.tok.A, { nome: 'Pessoa A', email: 'a134@t.com', cargo: 'C2', role: 'admin', ativo: 1 });
  assert.strictEqual(s4, 200);
  // o comum segue com a recusa de hoje (requireManageUsers)
  const [s5, x5] = await j('PUT', `/usuarios/${ctx.id.C}`, ctx.tok.C, { nome: 'Pessoa C', email: PADRAO, cargo: 'C', role: 'usuario', ativo: 1 });
  assert.deepStrictEqual([s5, x5 && x5.error], [403, 'Acesso negado — apenas administradores do sistema']);
  // Fase 2 I2: e-mail que nao e texto nao derruba o processo nem leva o L4; ausente segue o 500 NOT NULL de hoje
  const [s6, x6] = await j('PUT', `/usuarios/${ctx.id.X}`, ctx.tok.A, { nome: 'Pessoa X', email: 123, cargo: 'C', role: 'usuario', ativo: 1 });
  assert.notStrictEqual(x6 && x6.error, L4, 'email numerico levou o L4');
  // Etapa 135 (C283, RN-09; Fase 2 M5): e o 400 do e-mail que nao e texto
  assert.deepStrictEqual([s6, x6 && x6.error], [400, 'E-mail inválido: envie o e-mail como texto']);
  const [s7, x7] = await j('PUT', `/usuarios/${ctx.id.X}`, ctx.tok.A, { nome: 'Pessoa X', cargo: 'C', role: 'usuario', ativo: 1 });
  assert.notStrictEqual(x7 && x7.error, L4);
  assert.strictEqual(s7, 500, `sem email: ${s7} ${JSON.stringify(x7)}`);
  const [s8] = await j('PUT', `/usuarios/${ctx.id.X}`, ctx.T, { nome: 'Pessoa X', email: 'x134@t.com', cargo: 'C', role: 'usuario', ativo: 1 });
  assert.strictEqual(s8, 200, 'o processo caiu ou o PUT de volta falhou');
});

test('[RN-03] o super da o e-mail; quem ja o tem e editado com ele igual (inclusive por quem nao e super)', async () => {
  // o super cria com o e-mail (o POST nao barra o super), gravado com outra caixa; quem o tem edita a si mesmo com ele igual (Fase 5 r3)
  const [sy, y] = await j('POST', '/usuarios', ctx.T, { nome: 'Pessoa Y', email: 'ADMIN@GMP.COM.BR', senha: ctx.senha, cargo: 'C', role: 'admin' });
  assert.strictEqual(sy, 200, `o super nao criou com o e-mail: ${JSON.stringify(y)}`);
  const tokY = await login('ADMIN@GMP.COM.BR', ctx.senha);
  const [sy2, y2] = await j('PUT', `/usuarios/${y.id}`, tokY, { nome: 'Pessoa Y2', email: 'ADMIN@GMP.COM.BR', cargo: 'C', role: 'admin', ativo: 1 });
  assert.strictEqual(sy2, 200, `quem ja tem o e-mail (com outra caixa) nao se editou: ${JSON.stringify(y2)}`);
  const [sy3] = await j('DELETE', `/usuarios/${y.id}`, ctx.T);
  assert.strictEqual(sy3, 200);
  const [s, x] = await j('PUT', `/usuarios/${ctx.id.A}`, ctx.T, { nome: 'Pessoa A', email: PADRAO, cargo: 'C', role: 'admin', ativo: 1 });
  assert.strictEqual(s, 200, JSON.stringify(x));
  ctx.tok.A = await login(PADRAO, ctx.senha);
  assert.ok(ctx.tok.A, 'login de A pelo e-mail novo');
  const [s2, x2] = await j('PUT', `/usuarios/${ctx.id.A}`, ctx.tok.A, { nome: 'Pessoa A Editada', email: PADRAO, cargo: 'C', role: 'admin', ativo: 1 });
  assert.strictEqual(s2, 200, JSON.stringify(x2));
  const [, a] = await j('GET', `/usuarios/${ctx.id.A}`, ctx.T);
  assert.deepStrictEqual([a.nome, a.email, Number(a.is_superadmin)], ['PESSOA A EDITADA', PADRAO, 0]);
});

test('[RN-01a][RN-02b] reinicio com super ativo: quem tem o e-mail do administrador padrao NAO vira super, e ninguem nasce', async () => {
  const antes = await contagem(ctx.T);
  const [d0, dx0] = await j('DELETE', `/usuarios/${ctx.id.X}`, ctx.tok.A);
  assert.deepStrictEqual([d0, dx0 && dx0.error], [403, L5], 'premissa: antes do reinicio A nao exclui');
  await descer();
  ctx.T = await subir();
  ctx.tok.A = await login(PADRAO, ctx.senha);
  assert.strictEqual(await superDe(ctx.T, ctx.id.A), 0, 'o boot promoveu quem tem o e-mail com super ativo');
  const [d1, dx1] = await j('DELETE', `/usuarios/${ctx.id.X}`, ctx.tok.A);
  assert.deepStrictEqual([d1, dx1 && dx1.error], [403, L5], 'depois do reinicio A exclui usuario (so super)');
  assert.strictEqual(await contagem(ctx.T), antes, 'o reinicio criou ou apagou usuario');
  assert.strictEqual(await superDe(ctx.T, ctx.id.seed), 1, 'metade positiva: o seed segue super');
});

test('[RN-02d] o super renomeia o seed: o reinicio com o mesmo env NAO cria outro (Fase 2 M2)', async () => {
  ctx.tok.S2 = await login('s2134@t.com', ctx.senha);
  const antes = await contagem(ctx.tok.S2);
  const [s, x] = await j('PUT', `/usuarios/${ctx.id.seed}`, ctx.tok.S2, { nome: 'Administrador', email: 'renomeado134@t.com', cargo: 'Adm', role: 'admin', ativo: 1 });
  assert.strictEqual(s, 200, JSON.stringify(x));
  await descer();
  ctx.tok.S2 = await subir({ login: { email: 's2134@t.com', senha: ctx.senha } });
  assert.strictEqual(await login(SEED.email, SEED.senha), null, 'nasceu outro seed com a senha do env');
  assert.strictEqual(await contagem(ctx.tok.S2), antes, 'o reinicio criou usuario');
  assert.ok(await login('renomeado134@t.com', SEED.senha), 'metade positiva: o renomeado entra com a senha dele');
});

test('[RN-02c] o super exclui o seed: o reinicio com o mesmo env NAO o recria', async () => {
  const antes = await contagem(ctx.tok.S2);
  const [s, x] = await j('DELETE', `/usuarios/${ctx.id.seed}`, ctx.tok.S2);
  assert.strictEqual(s, 200, JSON.stringify(x));
  await descer();
  ctx.tok.S2 = await subir({ login: { email: 's2134@t.com', senha: ctx.senha } });
  assert.strictEqual(await login(SEED.email, SEED.senha), null, 'o seed voltou com a senha do env');
  assert.strictEqual(await contagem(ctx.tok.S2), antes - 1, 'o reinicio criou usuario');
  assert.strictEqual(await superDe(ctx.tok.S2, ctx.id.A), 0);
});

test('[RN-01c] banco sem super ativo (editado com o servidor parado): o reinicio promove o administrador padrao e so ele', async () => {
  await descer();
  await noArquivo(({ run }) => run('UPDATE usuarios SET is_superadmin = 0'));
  const T = await subir({ login: { email: PADRAO, senha: ctx.senha } });
  const [, me] = await j('GET', '/auth/me', T);
  assert.strictEqual(Number(me.user.is_superadmin), 1, 'a recuperacao nao promoveu');
  const supers = await noArquivoVivo(T);
  assert.deepStrictEqual(supers, [ctx.id.A], 'promoveu mais alguem');
  assert.strictEqual(await login(SEED.email, SEED.senha), null, 'o seed nasceu mesmo com o super recuperado');
});
/** Os super ativos, pela API (o servidor de pe): os ids com is_superadmin 1. */
async function noArquivoVivo(tok) {
  const [s, l] = await j('GET', '/usuarios', tok);
  assert.strictEqual(s, 200);
  return l.filter((u) => Number(u.is_superadmin) === 1 && Number(u.ativo) === 1).map((u) => u.id).sort((a, b) => a - b);
}

test('[RN-01d] o super com ativo nulo (nao entra) nao trava a recuperacao nem conta para a trava do ultimo super (Fase 5 r1 M1)', async () => {
  // Mudado na Etapa 135 (C284, RN-08): o POST com `ativo: null` passou a gravar 1 — o fantasma nasce pelo POST e tem o `ativo` anulado
  // NO ARQUIVO, com o servidor parado (o PUT com ativo nulo nao anula: COALESCE). Ordem da Fase 2 (M3): criar -> descer -> anular -> subir.
  const [sg, g] = await j('POST', '/usuarios', await login(PADRAO, ctx.senha), { nome: 'Fantasma', email: 'fantasma134@t.com',
    senha: ctx.senha, cargo: 'C', role: 'usuario', is_superadmin: 1, ativo: null });
  assert.strictEqual(sg, 200, JSON.stringify(g));
  await descer();
  await noArquivo(async ({ run }) => { await run('UPDATE usuarios SET ativo = NULL WHERE id = ?', [g.id]); });
  const tA = await subir({ login: { email: PADRAO, senha: ctx.senha } });
  assert.strictEqual(await login('fantasma134@t.com', ctx.senha), null, 'premissa: o super com ativo nulo nao entra');
  const [sd, xd] = await j('PUT', `/usuarios/${ctx.id.A}`, tA, { nome: 'Pessoa A', email: PADRAO, cargo: 'C', role: 'admin', is_superadmin: 0 });
  assert.deepStrictEqual([sd, xd && xd.error], [403, 'Não é possível remover ou desativar o último Super Administrador ativo do sistema'],
    'o unico super que entra se rebaixou (o fantasma contou)');
  await descer();
  await noArquivo(async ({ run }) => {
    await run('UPDATE usuarios SET is_superadmin = 0');
    await run('UPDATE usuarios SET is_superadmin = 1, ativo = NULL WHERE id = ?', [ctx.id.S2]);
  });
  const T = await subir({ login: { email: PADRAO, senha: ctx.senha } });
  const [, me] = await j('GET', '/auth/me', T);
  assert.strictEqual(Number(me.user.is_superadmin), 1, 'o super com ativo nulo contou como ativo e travou a recuperacao');
  assert.strictEqual(await login('s2134@t.com', ctx.senha), null, 'premissa: o super com ativo nulo nao entra');
});

test('[RN-02] a verificacao de super ativo falha no boot: o seed NAO nasce, e o processo segue (falha fechada)', async () => {
  await descer();
  novaPasta();
  await subir({ login: null, falha: String.raw`^SELECT 1 AS ok FROM usuarios WHERE COALESCE\(is_superadmin` });
  assert.strictEqual(saiu, null, 'o processo caiu');
  assert.strictEqual(await login(SEED.email, SEED.senha), null, 'o seed nasceu com a regua falhando');
  assert.ok(fs.readFileSync(logArq, 'utf8').includes('Admin inicial não criado — a verificação de super ativo falhou'), 'o log nao diz');
});

test('[RN-01] a promocao falha no boot: o seed ainda nasce na pasta vazia (a falha so no log)', async () => {
  await descer();
  novaPasta();
  await subir({ falha: String.raw`^UPDATE usuarios SET is_superadmin = 1\s+WHERE email` });
  assert.ok(await login(SEED.email, SEED.senha), 'o seed nao nasceu');
  assert.ok(fs.readFileSync(logArq, 'utf8').includes('Promoção do administrador padrão não verificada'), 'o log nao diz');
});

test('[RN-01b] banco antigo sem a coluna is_superadmin, sem SEED no env: o boot cria a coluna e promove o administrador padrao', async () => {
  await descer();
  novaPasta();
  const hash = bcrypt.hashSync('Antigo!134', 10);
  await noArquivo(async ({ run }) => {
    await run(`CREATE TABLE usuarios (id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT NOT NULL, email TEXT UNIQUE NOT NULL,
      senha TEXT NOT NULL, cargo TEXT, role TEXT DEFAULT 'usuario', ativo INTEGER DEFAULT 1, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
    await run("INSERT INTO usuarios (nome, email, senha, cargo, role) VALUES ('Adm Antigo', ?, ?, 'Adm', 'admin')", [PADRAO, hash]);
    await run("INSERT INTO usuarios (nome, email, senha, cargo, role) VALUES ('Comum Antigo', 'comum134@t.com', ?, 'C', 'usuario')", [hash]);
  });
  const T = await subir({ seed: null, login: { email: PADRAO, senha: 'Antigo!134' } });
  const [, me] = await j('GET', '/auth/me', T);
  assert.strictEqual(Number(me.user.is_superadmin), 1, 'o administrador padrao do banco antigo nao virou super');
  const [s, l] = await j('GET', '/usuarios', T);
  assert.strictEqual(s, 200);
  assert.deepStrictEqual(l.map((u) => [u.email, Number(u.is_superadmin)]).sort(), [[PADRAO, 1], ['comum134@t.com', 0]],
    `o boot criou usuario ou promoveu o comum: ${JSON.stringify(l.map((u) => [u.email, u.is_superadmin, u.ativo]))}`);
});

test("[RN-01b'] banco antigo sem as colunas ativo e is_superadmin (Fase 2 I1): o primeiro boot ja promove o administrador padrao", async () => {
  await descer();
  novaPasta();
  const hash = bcrypt.hashSync('Antigo!134', 10);
  await noArquivo(async ({ run }) => {
    await run(`CREATE TABLE usuarios (id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT NOT NULL, email TEXT UNIQUE NOT NULL,
      senha TEXT NOT NULL, cargo TEXT, role TEXT DEFAULT 'usuario', created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
    await run("INSERT INTO usuarios (nome, email, senha, cargo, role) VALUES ('Adm Antigo', ?, ?, 'Adm', 'admin')", [PADRAO, hash]);
  });
  const T = await subir({ seed: null, login: { email: PADRAO, senha: 'Antigo!134' } });
  const [, me] = await j('GET', '/auth/me', T);
  assert.strictEqual(Number(me.user.is_superadmin), 1, 'o primeiro boot do banco sem ativo nao promoveu');
});

(async () => {
  const estaticos = testes.splice(0, 2);
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
  for (const p of pastas) { try { fs.rmSync(p, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }); } catch (e) { /* temporario */ } }
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
