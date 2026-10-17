/**
 * Etapa 137 (nucleo: C292, C291, C293) — a exclusao do ultimo super em corrida e duas pequenas do cadastro de usuario, pelo `index.js` de
 * verdade (pasta vazia).
 *
 *   RN-01 a exclusao decide o ultimo super DENTRO da propria transacao, antes de escrever (o motivo pelo token; GUARDA_ULTIMO_SUPER_SQL):
 *         em corrida sobra um (C292); RN-01b com o destino padrao (o proprio ator); RN-01c o destino apagado no meio -> 400, nunca 500
 *   RN-02 quem perde a corrida nao escreve nada (nem purge, nem transferencia)
 *   RN-03 o alvo apagado no meio e 404, sem nada feito
 *
 * Plano: docs/superpowers/plans/2026-10-17-almoxarifado-etapa137-a-exclusao-do-ultimo-super.md
 * Molde: usuarioSenhaAtivoCorrida.api.test.js (pasta vazia, porta livre, morreComOPai). O banco e lido e preparado por uma conexao crua
 * ao arquivo (o servidor de pe, busy_timeout).
 * Executar: cd server && node tests/api/usuarioExclusaoCorrida.api.test.js
 */
const assert = require('assert');
const fs = require('fs');
const net = require('net');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const sqlite3 = require('sqlite3');

const SERVER_DIR = path.join(__dirname, '..', '..');
const L_EXC = 'Não é possível excluir o último Super Administrador ativo do sistema';
const L_ULTIMO_PUT = 'Não é possível remover ou desativar o último Super Administrador ativo do sistema';
const L_ULTIMO_PATCH = 'Não é possível desativar o último Super Administrador ativo do sistema';
const L_ACESSO_NEGADO = 'Acesso negado — apenas administradores do sistema';
const L_SO_SUPER_EXCLUI = 'Apenas Super Administradores podem excluir usuários';
const L_NAO_ENCONTRADO = 'Usuário não encontrado';
const L_ATIVO = 'Ativo inválido: envie 1 (ativo) ou 0 (inativo)';
const L_PROPRIO = 'Não é possível desativar o próprio usuário';
const pausa = (ms) => new Promise((r) => setTimeout(r, ms));

let passed = 0; let failed = 0;
const testes = [];
function test(name, fn) { testes.push([name, fn]); }

// ── o servidor real ───────────────────────────────────────────────────────────────────────
let porta; let filho = null; let pasta; let logArq; let saiu = null;
const ROOT = () => `http://127.0.0.1:${porta}`;
async function j(m, u, tok, body) {
  const r = await fetch(ROOT() + '/api' + u, {
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
const SEED = { email: 'e137seed@t.com', senha: 'E137seed!senha' };
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

// ── o arquivo, por fora (preparo e conferencia) ───────────────────────────────────────────
let cru = null;
const run = (sql, p = []) => new Promise((res, rej) => cru.run(sql, p, function feito(e) { if (e) rej(e); else res(this); }));
const all = (sql, p = []) => new Promise((res, rej) => cru.all(sql, p, (e, r) => (e ? rej(e) : res(r))));
const get = async (sql, p = []) => (await all(sql, p))[0];
const supersAtivos = async () => (await all('SELECT id FROM usuarios WHERE COALESCE(is_superadmin, 0) = 1 AND ativo = 1 ORDER BY id')).map((r) => r.id);

const login = async (email, senha) => { const [s, x] = await j('POST', '/auth/login', null, { email, senha }); return s === 200 ? x.token : null; };
const ctx = { senha: 'Senha!137', n: 0 };
const novoEmail = () => `u137-${++ctx.n}@t.com`;
const criar = async (extra = {}, tok = ctx.T) => {
  const email = novoEmail();
  const [s, c] = await j('POST', '/usuarios', tok, { nome: 'U137', email, senha: ctx.senha, cargo: 'C', role: 'usuario', ...extra });
  assert.strictEqual(s, 200, JSON.stringify(c));
  return { ...c, email };
};
const corpo = (u, extra = {}) => ({ nome: u.nome || 'U137', email: u.email, cargo: 'C', role: u.role || 'usuario', ...extra });
const linha = (id) => get('SELECT id, nome, ativo, is_superadmin FROM usuarios WHERE id = ?', [id]);

/** O semente volta a ser o unico super ativo (preparo de cada cenario que nao e de corrida). */
async function soOSemente() {
  await run('UPDATE usuarios SET is_superadmin = 0 WHERE id != ?', [ctx.seedId]);
  await run('UPDATE usuarios SET is_superadmin = 1, ativo = 1 WHERE id = ?', [ctx.seedId]);
  ctx.T = await login(SEED.email, SEED.senha);
  assert.ok(ctx.T, 'o semente nao entra');
}

/** Linhas de cada usuario nas tabelas que a exclusao purga (permissoes, push_subscriptions) e numa que ela transfere (proposta_followups). */
async function darLinhas(id) {
  await run("INSERT INTO permissoes (usuario_id, modulo, acao, permissao) VALUES (?, 'm137', 'a137', 1)", [id]);
  await run("INSERT INTO push_subscriptions (usuario_id, endpoint, p256dh, auth) VALUES (?, ?, 'p', 'a')", [id, `https://e137/${id}`]);
  const r = await run("INSERT INTO proposta_followups (proposta_id, comentario, criado_por) VALUES (999137, ?, ?)", [`do-${id}`, id]);
  return r.lastID;
}
async function linhasDe(id, followupId) {
  const p = await get("SELECT COUNT(*) AS n FROM permissoes WHERE usuario_id = ? AND modulo = 'm137'", [id]);
  const s = await get('SELECT COUNT(*) AS n FROM push_subscriptions WHERE usuario_id = ?', [id]);
  const f = await get('SELECT criado_por FROM proposta_followups WHERE id = ?', [followupId]);
  return { usuario: !!(await linha(id)), permissoes: p.n, push: s.n, followupDe: f && f.criado_por };
}

/** Dois supers novos (A, B) — os unicos ativos —, com linhas proprias; devolve os dois com token. */
async function parDeSupers() {
  await soOSemente();
  const n1 = await criar({ is_superadmin: 1, nome: 'N1' });
  const n2 = await criar({ is_superadmin: 1, nome: 'N2' });
  await run('UPDATE usuarios SET is_superadmin = 0 WHERE id != ? AND id != ?', [n1.id, n2.id]);
  const A = { id: n1.id, email: n1.email, nome: n1.nome, role: 'usuario', tok: await login(n1.email, ctx.senha) };
  const B = { id: n2.id, email: n2.email, nome: n2.nome, role: 'usuario', tok: await login(n2.email, ctx.senha) };
  assert.ok(A.tok && B.tok, 'os supers novos nao entram');
  assert.deepStrictEqual(await supersAtivos(), [A.id, B.id].sort((a, b) => a - b), 'premissa: exatamente dois supers ativos');
  A.followup = await darLinhas(A.id);
  B.followup = await darLinhas(B.id);
  // o destino da transferencia e um terceiro, comum: com o destino padrao (o proprio ator) o perdedor do DELETE x DELETE transferiria para
  // quem ja foi apagado e a FK o recusaria (500) — a trava nao seria provada (medido na escrita do teste)
  const C = await criar({ nome: 'Destino' });
  A.dest = C.id; B.dest = C.id;
  return [A, B, C];
}

const apaga = (ator, alvo) => j('DELETE', `/usuarios/${alvo.id}${ator.dest ? `?transferToId=${ator.dest}` : ''}`, ator.tok);
const putRebaixa = (ator, alvo) => j('PUT', `/usuarios/${alvo.id}`, ator.tok, { ...corpo(alvo), ativo: 1, is_superadmin: 0 });
const patchDesativa = (ator, alvo) => j('PATCH', `/usuarios/${alvo.id}/status`, ator.tok, { ativo: 0 });

const PERMITIDO = [L_EXC, L_ULTIMO_PUT, L_ULTIMO_PATCH, L_ACESSO_NEGADO, L_SO_SUPER_EXCLUI];
const statusOk = ([st, x]) => st === 200 || st === 401 || (st === 403 && PERMITIDO.includes(x && x.error));

/** Confere o que cada DELETE deixou: 200 -> o alvo saiu, purgado e transferido para o ator; 403 L-EXC -> o alvo intacto. */
async function conferirExclusao(rotulo, [st, x], ator, alvo) {
  const l = await linhasDe(alvo.id, alvo.followup);
  if (st === 200) {
    assert.deepStrictEqual(l, { usuario: false, permissoes: 0, push: 0, followupDe: ator.dest || ator.id }, `${rotulo}: o 200 nao apagou/transferiu`);
    return 'ok';
  }
  if (st === 403 && x && x.error === L_EXC) {
    assert.deepStrictEqual(l, { usuario: true, permissoes: 1, push: 1, followupDe: alvo.id }, `${rotulo}: o 403 deixou a exclusao pela metade`);
    return 'recusado';
  }
  return 'outro';
}

test('[RN-01][RN-02] A exclui B x B exclui A ao mesmo tempo: um 200, sobra um super ativo, quem perde nao deixa nada pela metade', async () => {
  const cont = {}; let recusas = 0;
  for (let i = 0; i < 6; i++) {
    const [A, B] = await parDeSupers();
    const r = await Promise.all([apaga(A, B), apaga(B, A)]);
    const k = r.map((x) => x[0]).join('/'); cont[k] = (cont[k] || 0) + 1;
    assert.strictEqual((await supersAtivos()).length, 1, `rodada ${i}: ${JSON.stringify(r)} — supers ativos ${JSON.stringify(await supersAtivos())}`);
    assert.ok(r.every(statusOk), `rodada ${i}: ${JSON.stringify(r)}`);
    assert.strictEqual(r.filter((x) => x[0] === 200).length, 1, `rodada ${i}: ${JSON.stringify(r)}`);
    const c1 = await conferirExclusao(`rodada ${i} A->B`, r[0], A, B);
    const c2 = await conferirExclusao(`rodada ${i} B->A`, r[1], B, A);
    recusas += [c1, c2].filter((c) => c === 'recusado').length;
  }
  console.log(`    (DELETE x DELETE: ${JSON.stringify(cont)}; recusas L-EXC ${recusas})`);
  // sem nenhuma recusa da trava o cenario nao provou o ROLLBACK (o perdedor so caiu na autenticacao)
  assert.ok(recusas >= 1, `nenhuma rodada chegou a trava do DELETE: ${JSON.stringify(cont)}`);
});

test('[RN-01b] o mesmo com o destino padrao (a tela: o proprio ator): um 200, sobra um super, nenhum 500 (Fase 2 I3)', async () => {
  const cont = {};
  for (let i = 0; i < 6; i++) {
    const [A, B] = await parDeSupers();
    delete A.dest; delete B.dest;
    const r = await Promise.all([apaga(A, B), apaga(B, A)]);
    const k = r.map((x) => x[0]).join('/'); cont[k] = (cont[k] || 0) + 1;
    assert.strictEqual((await supersAtivos()).length, 1, `rodada ${i}: ${JSON.stringify(r)} — supers ativos ${JSON.stringify(await supersAtivos())}`);
    assert.ok(r.every((x) => statusOk(x) || (x[0] === 400 && x[1] && x[1].error === 'Usuário de destino dos registros não encontrado')),
      `rodada ${i}: ${JSON.stringify(r)}`);
    assert.strictEqual(r.filter((x) => x[0] === 200).length, 1, `rodada ${i}: ${JSON.stringify(r)}`);
    await conferirExclusao(`rodada ${i} A->B`, r[0], A, B);
    await conferirExclusao(`rodada ${i} B->A`, r[1], B, A);
  }
  console.log(`    (destino padrao: ${JSON.stringify(cont)})`);
});

for (const [nome, outro] of [
  ['B rebaixa A (PUT)', (A, B) => putRebaixa(B, A)],
  ['A se rebaixa (PUT em si, duas abas)', (A) => putRebaixa(A, A)],
  ['B desativa A (PATCH /status)', (A, B) => patchDesativa(B, A)],
]) {
  test(`[RN-01] A exclui B x ${nome} ao mesmo tempo: sobra exatamente um super ativo`, async () => {
    const cont = {};
    for (let i = 0; i < 6; i++) {
      const [A, B] = await parDeSupers();
      const r = await Promise.all([apaga(A, B), outro(A, B)]);
      const k = r.map((x) => x[0]).join('/'); cont[k] = (cont[k] || 0) + 1;
      assert.strictEqual((await supersAtivos()).length, 1, `rodada ${i}: ${JSON.stringify(r)} — supers ativos ${JSON.stringify(await supersAtivos())}`);
      assert.ok(r.every(statusOk), `rodada ${i}: ${JSON.stringify(r)}`);
      await conferirExclusao(`rodada ${i}`, r[0], A, B);
    }
    console.log(`    (${nome}: ${JSON.stringify(cont)})`);
  });
}

test('[RN-01] metade positiva: com um terceiro super, A exclui B (super) — 200, transferido e purgado', async () => {
  const [A, B] = await parDeSupers();
  await run('UPDATE usuarios SET is_superadmin = 1, ativo = 1 WHERE id = ?', [ctx.seedId]);
  const r = await apaga(A, B);
  assert.strictEqual(r[0], 200, JSON.stringify(r));
  assert.strictEqual(await conferirExclusao('terceiro', r, A, B), 'ok');
  assert.deepStrictEqual(r[1] && r[1].transferidoPara, A.dest);
});

test('[RN-03] o mesmo super exclui o mesmo usuario comum em duas abas: um 200 e um 404, nada transferido duas vezes', async () => {
  const cont = {};
  for (let i = 0; i < 6; i++) {
    await soOSemente();
    const c = await criar({ nome: 'Comum' });
    const followup = await darLinhas(c.id);
    const eu = { id: ctx.seedId, tok: ctx.T };
    const r = await Promise.all([apaga(eu, c), apaga(eu, c)]);
    const k = r.map((x) => x[0]).sort().join('/'); cont[k] = (cont[k] || 0) + 1;
    assert.deepStrictEqual(r.map((x) => x[0]).sort(), [200, 404], `rodada ${i}: ${JSON.stringify(r)}`);
    const o404 = r.find((x) => x[0] === 404);
    assert.strictEqual(o404[1] && o404[1].error, L_NAO_ENCONTRADO, `rodada ${i}: ${JSON.stringify(r)}`);
    assert.deepStrictEqual(await linhasDe(c.id, followup), { usuario: false, permissoes: 0, push: 0, followupDe: ctx.seedId });
  }
  console.log(`    (mesmo alvo: ${JSON.stringify(cont)})`);
});

test('[RN-01c] o destino apagado no meio: 400 "destino nao encontrado", nunca 500 de FK, e nada feito (sabotagem S4)', async () => {
  const cont = {};
  for (let i = 0; i < 6; i++) {
    await soOSemente();
    const c = await criar({ nome: 'Alvo' });
    const d = await criar({ nome: 'Destino Apagado' });
    const followup = await darLinhas(c.id);
    const eu = { id: ctx.seedId, tok: ctx.T, dest: d.id };
    const r = await Promise.all([apaga(eu, c), apaga({ id: ctx.seedId, tok: ctx.T }, d)]);
    const k = r.map((x) => x[0]).join('/'); cont[k] = (cont[k] || 0) + 1;
    assert.strictEqual(r[1][0], 200, `rodada ${i}: ${JSON.stringify(r)}`);
    if (r[0][0] === 200) {
      assert.deepStrictEqual(await linhasDe(c.id, followup), { usuario: false, permissoes: 0, push: 0, followupDe: ctx.seedId }, `rodada ${i}: o followup foi para D e, com D apagado depois, para o semente`);
    } else {
      assert.deepStrictEqual([r[0][0], r[0][1] && r[0][1].error], [400, 'Usuário de destino dos registros não encontrado'], `rodada ${i}: ${JSON.stringify(r)}`);
      assert.deepStrictEqual(await linhasDe(c.id, followup), { usuario: true, permissoes: 1, push: 1, followupDe: c.id }, `rodada ${i}: o 400 fez algo`);
    }
  }
  console.log(`    (destino apagado: ${JSON.stringify(cont)})`);
});

(async () => {
  console.log('\n=== Etapa 137 (nucleo): a exclusao do ultimo super em corrida, o campo de super e o ativo pela regua ===\n');
  try {
    pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'e137-usu-'));
    pastas.push(pasta);
    ctx.T = await subir();
    cru = new sqlite3.Database(path.join(pasta, 'database.sqlite'));
    cru.configure('busyTimeout', 15000);
    ctx.seedId = (await get('SELECT id FROM usuarios WHERE email = ?', [SEED.email])).id;
    for (const [name, fn] of testes) {
      if (saiu !== null) { failed++; console.error(`  ✗ ${name}: o servidor caiu antes (codigo ${saiu})`); continue; }
      try { await fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) {
        failed++; console.error(`  ✗ ${name}: ${String(e.message).replace(/\s*\n\s*/g, ' ')}`);
      }
    }
  } catch (e) { failed++; console.error('  ✗ preparo:', e.message); }
  if (cru) await new Promise((r) => cru.close(() => r()));
  await descer();
  for (const p of pastas) { try { fs.rmSync(p, { recursive: true, force: true }); } catch (e) { /* windows segura o arquivo */ } }
  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
})();
