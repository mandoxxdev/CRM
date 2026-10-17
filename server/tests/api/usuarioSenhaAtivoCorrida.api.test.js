/**
 * Etapa 136 (nucleo: C289, C288, C287, C285) — o cadastro de usuario pela API, pelo `index.js` de verdade (pasta vazia).
 *
 *   RN-07 senha que nao e texto -> 400 "Senha inválida: envie a senha como texto" no POST e no PUT (C289; no PUT o hashSync lancava
 *         dentro do callback do db.get)
 *   RN-08 `ativo` "" no PUT e ausente — mantem o que havia (C288)
 *   RN-09 `ativo` na criacao pela regua de sim/nao; o resto -> 400 "Ativo inválido: envie 1 (ativo) ou 0 (inativo)" (C287)
 *   RN-10 a trava do ultimo super conta no proprio comando que grava — dois rebaixamentos cruzados: um 200 e um 403 (C285)
 *
 * Plano: docs/superpowers/plans/2026-10-17-almoxarifado-etapa136-a-ordem-das-baixas.md
 * Molde: usuarioPelaApi.api.test.js (pasta vazia, porta livre, morreComOPai).
 * Executar: cd server && node tests/api/usuarioSenhaAtivoCorrida.api.test.js
 */
const assert = require('assert');
const fs = require('fs');
const net = require('net');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const SERVER_DIR = path.join(__dirname, '..', '..');
const L_SENHA = 'Senha inválida: envie a senha como texto';
const L_ATIVO = 'Ativo inválido: envie 1 (ativo) ou 0 (inativo)';
const L_ULTIMO_PUT = 'Não é possível remover ou desativar o último Super Administrador ativo do sistema';
const L_ACESSO_NEGADO = 'Acesso negado — apenas administradores do sistema';
const L_ULTIMO_PATCH = 'Não é possível desativar o último Super Administrador ativo do sistema';
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
    signal: AbortSignal.timeout(15000), // Fase 2 I3: o PUT com senha numero de antes NUNCA respondia (C290) — sem isto pendurava ~300 s
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
const SEED = { email: 'e136seed@t.com', senha: 'E136seed!senha' };
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
const ctx = { senha: 'Senha!136', n: 0 };
const novoEmail = () => `u136-${++ctx.n}@t.com`;
const vivo = async () => { try { const [s] = await j('GET', '/usuarios', ctx.T); return s === 200 && saiu === null; } catch (e) { return false; } };
const criar = async (extra = {}, tok = ctx.T) => {
  const email = novoEmail();
  const [s, c] = await j('POST', '/usuarios', tok, { nome: 'U136', email, senha: ctx.senha, cargo: 'C', role: 'usuario', ...extra });
  assert.strictEqual(s, 200, JSON.stringify(c));
  return { ...c, email };
};
const corpo = (u, extra = {}) => ({ nome: u.nome || 'U136', email: u.email, cargo: 'C', role: u.role || 'usuario', ...extra });
const linha = async (id) => (await lista(ctx.T)).find((x) => x.id === id);

test('[RN-07] POST com senha que nao e texto: 400 com a literal, nenhuma linha; com texto passa', async () => {
  const antes = (await lista(ctx.T)).length;
  for (const senha of [1234567, [], {}, true, ['1234567']]) {
    const [s, x] = await j('POST', '/usuarios', ctx.T, { nome: 'Senha Ruim', email: novoEmail(), senha, cargo: 'C', role: 'usuario' });
    assert.deepStrictEqual([s, x && x.error], [400, L_SENHA], `POST senha ${JSON.stringify(senha)}`);
  }
  assert.strictEqual((await lista(ctx.T)).length, antes, 'o POST recusado gravou');
  // a ordem: sem senha continua o "obrigatorios"; e-mail nao texto vem antes da senha nao texto
  const [s0, x0] = await j('POST', '/usuarios', ctx.T, { nome: 'Sem Senha', email: novoEmail(), cargo: 'C', role: 'usuario' });
  assert.deepStrictEqual([s0, x0 && x0.error], [400, 'Nome, email e senha são obrigatórios']);
  const [s1, x1] = await j('POST', '/usuarios', ctx.T, { nome: 'Os Dois', email: 123, senha: 1234567, cargo: 'C', role: 'usuario' });
  assert.deepStrictEqual([s1, x1 && x1.error], [400, 'E-mail inválido: envie o e-mail como texto']);
  const [s2, x2] = await j('POST', '/usuarios', ctx.T, { nome: 'Curta', email: novoEmail(), senha: '12345', cargo: 'C', role: 'usuario' });
  assert.deepStrictEqual([s2, x2 && x2.error], [400, 'Senha deve ter no mínimo 6 caracteres']);
  const u = await criar();
  assert.ok(await login(u.email, ctx.senha), 'a senha de texto nao entra');
});

test('[RN-08] PUT com ativo "" mantem o que havia (1 continua 1 e entra; 0 continua 0) e nao conta como desativar', async () => {
  const u = await criar();
  const [s, x] = await j('PUT', `/usuarios/${u.id}`, ctx.T, corpo(u, { ativo: '' }));
  assert.strictEqual(s, 200, JSON.stringify(x));
  assert.strictEqual((await linha(u.id)).ativo, 1);
  assert.ok(await login(u.email, ctx.senha), 'o ativo "" trancou o usuario');
  const z = await criar({ ativo: 0 });
  assert.strictEqual((await j('PUT', `/usuarios/${z.id}`, ctx.T, corpo(z, { ativo: '' })))[0], 200);
  assert.strictEqual((await linha(z.id)).ativo, 0, 'o "" reativou');
  // o proprio administrador editando a si com ativo "": nao e "desativar o proprio usuario"
  const eu = (await lista(ctx.T)).find((y) => y.email === SEED.email);
  const [s2, x2] = await j('PUT', `/usuarios/${eu.id}`, ctx.T, { nome: eu.nome, email: eu.email, cargo: eu.cargo || 'C', role: eu.role, ativo: '', is_superadmin: 1 } /* sem o campo, o super se rebaixa (C291) */);
  assert.strictEqual(s2, 200, JSON.stringify(x2));
  assert.strictEqual((await linha(eu.id)).ativo, 1);
  // Fase 2 M3: o nulo tambem e ausente (antes contava como desativar o proprio usuario -> 403)
  const [s4, x4] = await j('PUT', `/usuarios/${eu.id}`, ctx.T, { nome: eu.nome, email: eu.email, cargo: eu.cargo || 'C', role: eu.role, ativo: null, is_superadmin: 1 });
  assert.strictEqual(s4, 200, JSON.stringify(x4));
  assert.strictEqual((await linha(eu.id)).ativo, 1);
  // metade positiva: 0 de verdade continua desativando
  const [s3] = await j('PUT', `/usuarios/${u.id}`, ctx.T, corpo(u, { ativo: 0 }));
  assert.strictEqual(s3, 200);
  assert.strictEqual(await login(u.email, ctx.senha), null, 'o 0 nao desativou');
});

test('[RN-09] POST: ativo pela regua de sim/nao (1/true/"1"/"true" -> 1; 0/false/"0"/"false" -> 0); o resto -> 400', async () => {
  for (const v of [1, true, '1', 'true']) {
    const u = await criar({ ativo: v });
    assert.strictEqual(u.ativo, 1, `resposta ${JSON.stringify(v)}`);
    assert.strictEqual((await linha(u.id)).ativo, 1, `gravado ${JSON.stringify(v)}`);
    assert.ok(await login(u.email, ctx.senha), `${JSON.stringify(v)} nao entra`);
  }
  for (const v of [0, false, '0', 'false']) {
    const u = await criar({ ativo: v });
    assert.strictEqual(u.ativo, 0, `resposta ${JSON.stringify(v)}`);
    assert.strictEqual((await linha(u.id)).ativo, 0, `gravado ${JSON.stringify(v)}`);
    assert.strictEqual(await login(u.email, ctx.senha), null, `${JSON.stringify(v)} entrou`);
  }
  const antes = (await lista(ctx.T)).length;
  for (const v of [2, 'sim', 'TRUE ', [], {}, -1, 'on', 'yes', '2', ' 1', '01', 1.0001, 'True']) { // Fase 5 r3 (C7): a regua e fechada
    const [s, x] = await j('POST', '/usuarios', ctx.T, { nome: 'Ativo Ruim', email: novoEmail(), senha: ctx.senha, cargo: 'C', role: 'usuario', ativo: v });
    assert.deepStrictEqual([s, x && x.error], [400, L_ATIVO], `ativo ${JSON.stringify(v)}`);
  }
  assert.strictEqual((await lista(ctx.T)).length, antes, 'o POST recusado gravou');
});

/** Dois supers (o ator e um novo), cada um tira o outro AO MESMO TEMPO; devolve [status do ator, status do novo] e o super que sobrou. */
async function rodadaCruzada(ator, tirar) {
  const s = await criar({ is_superadmin: 1, nome: 'Super Novo' }, ator.tok); // so um super da super
  const tokS = await login(s.email, ctx.senha);
  assert.ok(tokS, 'o super novo nao entrou');
  const ativos = (await lista(ator.tok)).filter((u) => !!u.is_superadmin && u.ativo === 1).map((u) => u.id).sort();
  assert.deepStrictEqual(ativos, [ator.id, s.id].sort(), 'premissa: exatamente dois supers ativos');
  const [r1, r2] = await Promise.all([tirar(ator.tok, s), tirar(tokS, ator)]);
  const depois = (await lista(ator.tok).catch(() => [])).filter((u) => !!u.is_superadmin && u.ativo === 1).map((u) => u.id);
  const depois2 = depois.length ? depois : (await lista(tokS)).filter((u) => !!u.is_superadmin && u.ativo === 1).map((u) => u.id);
  return { r: [r1, r2], ativos: depois2, alvos: [s.id, ator.id], novo: { id: s.id, email: s.email, nome: s.nome, tok: tokS, role: 'usuario' } };
}

test('[RN-10] PUT: dois supers se rebaixando ao mesmo tempo — em toda rodada um 200 e um 403, e sobra um super ativo', async () => {
  const eu = (await lista(ctx.T)).find((y) => y.email === SEED.email);
  let ator = { id: eu.id, email: eu.email, nome: eu.nome, role: eu.role, tok: ctx.T };
  // Fase 5 r3 (C10): cada lado manda um nome proprio — todo 200 tem de ter gravado (o 200 sem gravar e o this.changes ignorado)
  let rodada = 0;
  const tirar = (tok, alvo) => j('PUT', `/usuarios/${alvo.id}`, tok, { ...corpo(alvo), nome: `R136-${rodada}-${alvo.id}`, is_superadmin: 0 });
  const contagem = {};
  for (let i = 0; i < 10; i++) {
    rodada = i;
    const { r, ativos, novo, alvos } = await rodadaCruzada(ator, tirar);
    for (let k = 0; k < 2; k++) {
      if (r[k][0] !== 200) continue;
      const tok = ativos.length ? (ativos[0] === ator.id ? ator.tok : novo.tok) : ctx.T;
      const l = (await lista(tok)).find((u) => u.id === alvos[k]);
      assert.strictEqual(l && l.nome, `R136-${i}-${alvos[k]}`, `rodada ${i}: o 200 do lado ${k} nao gravou — ${JSON.stringify(r)}`);
    }
    // o perdedor: 403 da trava (a literal) ou, se o vencedor gravou antes de ele passar da autenticacao, ja nao e super e o campo some
    // (200 sem rebaixar ninguem — Fase 2 M1). O que nao pode: os dois rebaixarem (zero super ativo — o defeito de antes, 10/10).
    assert.strictEqual(ativos.length, 1, `rodada ${i}: ${JSON.stringify(r)} — supers ativos ${JSON.stringify(ativos)}`);
    for (const [st, x] of r) {
      assert.ok(st === 200 || (st === 403 && [L_ULTIMO_PUT, L_ACESSO_NEGADO].includes(x && x.error)), `rodada ${i}: ${JSON.stringify(r)}`);
    }
    contagem[r.map((x) => x[0]).sort().join('/')] = (contagem[r.map((x) => x[0]).sort().join('/')] || 0) + 1;
    ator = ativos[0] === ator.id ? ator : novo;
  }
  console.log(`    (PUT: ${JSON.stringify(contagem)})`);
  ctx.T = ator.tok;
});

test('[RN-10] F5 C9: PUT desativando (ativo 0, sem rebaixar) ao mesmo tempo — sobra um super ativo', async () => {
  const eu = (await lista(ctx.T)).find((y) => !!y.is_superadmin && y.ativo === 1);
  let ator = { id: eu.id, email: eu.email, nome: eu.nome, role: eu.role, tok: ctx.T };
  const tirar = (tok, alvo) => j('PUT', `/usuarios/${alvo.id}`, tok, { ...corpo(alvo), is_superadmin: 1, ativo: 0 });
  for (let i = 0; i < 5; i++) {
    const { r, ativos, novo } = await rodadaCruzada(ator, tirar);
    assert.strictEqual(ativos.length, 1, `rodada ${i}: ${JSON.stringify(r)} — supers ativos ${JSON.stringify(ativos)}`);
    for (const [st, x] of r) {
      assert.ok(st === 200 || st === 401 || (st === 403 && x && x.error === L_ULTIMO_PUT), `rodada ${i}: ${JSON.stringify(r)}`);
    }
    ator = ativos[0] === ator.id ? ator : novo;
  }
  ctx.T = ator.tok;
});

test('[RN-10] F5 C8: um super com ativo NULO (nao entra) nao conta como "o outro" — a corrida continua deixando um super ativo', async () => {
  const sqlite3 = require('sqlite3');
  const banco = new sqlite3.Database(path.join(pasta, 'database.sqlite'));
  await new Promise((ok, ko) => banco.run("INSERT INTO usuarios (nome, email, senha, cargo, role, is_superadmin, ativo) VALUES ('NULO 136', 'nulo136@t.com', 'x', 'C', 'admin', 1, NULL)",
    (e) => (e ? ko(e) : ok())));
  await new Promise((ok) => banco.close(ok));
  const eu = (await lista(ctx.T)).find((y) => !!y.is_superadmin && y.ativo === 1);
  let ator = { id: eu.id, email: eu.email, nome: eu.nome, role: eu.role, tok: ctx.T };
  const tirar = (tok, alvo) => j('PUT', `/usuarios/${alvo.id}`, tok, { ...corpo(alvo), is_superadmin: 0 });
  for (let i = 0; i < 5; i++) {
    const { r, ativos, novo } = await rodadaCruzada(ator, tirar);
    assert.strictEqual(ativos.length, 1, `rodada ${i}: ${JSON.stringify(r)} — supers ativos ${JSON.stringify(ativos)}`);
    ator = ativos[0] === ator.id ? ator : novo;
  }
  ctx.T = ator.tok;
});

test('[RN-10] PATCH /status: dois supers se desativando ao mesmo tempo — um 200 e um 403, sobra um super ativo', async () => {
  const eu = (await lista(ctx.T)).find((y) => !!y.is_superadmin && y.ativo === 1);
  let ator = { id: eu.id, email: eu.email, nome: eu.nome, role: eu.role, tok: ctx.T };
  const tirar = (tok, alvo) => j('PATCH', `/usuarios/${alvo.id}/status`, tok, { ativo: 0 });
  const contagem = {};
  for (let i = 0; i < 10; i++) {
    const { r, ativos, novo } = await rodadaCruzada(ator, tirar);
    // o perdedor: 403 da trava ou 401 (ja desativado, a sessao cai na autenticacao — Fase 2 M1); nunca os dois desativam
    assert.strictEqual(ativos.length, 1, `rodada ${i}: ${JSON.stringify(r)} — supers ativos ${JSON.stringify(ativos)}`);
    for (const [st, x] of r) {
      assert.ok(st === 200 || st === 401 || (st === 403 && x && x.error === L_ULTIMO_PATCH), `rodada ${i}: ${JSON.stringify(r)}`);
    }
    assert.strictEqual(r.filter((x) => x[0] === 200).length, 1, `rodada ${i}: ${JSON.stringify(r)}`);
    contagem[r.map((x) => x[0]).sort().join('/')] = (contagem[r.map((x) => x[0]).sort().join('/')] || 0) + 1;
    ator = ativos[0] === ator.id ? ator : novo;
  }
  console.log(`    (PATCH: ${JSON.stringify(contagem)})`);
  ctx.T = ator.tok;
  // metade positiva: com um terceiro super, o rebaixamento passa
  const t = await criar({ is_superadmin: 1, nome: 'Terceiro' }, ctx.T);
  const [s] = await j('PUT', `/usuarios/${t.id}`, ctx.T, { ...corpo(t), is_superadmin: 0 });
  assert.strictEqual(s, 200);
});

// por ultimo: no codigo de antes o PUT com senha numero NUNCA responde (C290: o hashSync lanca no callback e o installProcessGuards segura) — cada valor espera o tempo limite
test('[RN-07] PUT com senha que nao e texto: 400 com a literal, o servidor continua de pe e a senha antiga entra', async () => {
  const u = await criar();
  for (const senha of [1234567, [], {}, true]) {
    const [s, x] = await j('PUT', `/usuarios/${u.id}`, ctx.T, corpo(u, { senha }));
    assert.deepStrictEqual([s, x && x.error], [400, L_SENHA], `PUT senha ${JSON.stringify(senha)}`);
    assert.ok(await vivo(), `o servidor caiu com a senha ${JSON.stringify(senha)}`);
  }
  assert.ok(await login(u.email, ctx.senha), 'a senha antiga nao entra');
  // falso continua "nao muda a senha"
  for (const senha of [0, false, '', null]) {
    const [s, x] = await j('PUT', `/usuarios/${u.id}`, ctx.T, corpo(u, { senha }));
    assert.strictEqual(s, 200, `PUT senha ${JSON.stringify(senha)}: ${JSON.stringify(x)}`);
  }
  assert.ok(await login(u.email, ctx.senha), 'o falso mudou a senha');
  const [s, x] = await j('PUT', `/usuarios/${u.id}`, ctx.T, corpo(u, { senha: 'Nova!1360' }));
  assert.strictEqual(s, 200, JSON.stringify(x));
  assert.ok(await login(u.email, 'Nova!1360'), 'a senha nova de texto nao entra');
});

(async () => {
  console.log('\n=== Etapa 136 (nucleo): senha, ativo e a corrida do ultimo super ===\n');
  try {
    pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'e136-usu-'));
    pastas.push(pasta);
    ctx.T = await subir();
    for (const [name, fn] of testes) {
      if (saiu !== null) { failed++; console.error(`  ✗ ${name}: o servidor caiu antes (codigo ${saiu})`); continue; }
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
