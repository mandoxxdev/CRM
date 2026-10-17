/**
 * Etapa 138 (C294) — a renumeracao de propostas que falha no meio nao desfaz o que os outros gravaram, pelo `index.js` de verdade (pasta
 * vazia).
 *
 *   RN-11 a renumeracao grava num `exec` so; se um passo falha, o ROLLBACK roda NA MESMA VAGA da fila (`db.execEmTransacao`, Etapa 137).
 *         Antes, o `catch` da rota mandava o ROLLBACK pela fila, DEPOIS das gravacoes que ja estavam esperando: elas rodavam dentro da
 *         transacao aberta, respondiam 200 e eram desfeitas junto.
 *
 * Quem perde (medido na Fase 2): o `exec` do driver e exclusivo e toda rota autenticada le o banco antes de gravar — a leitura de quem
 * chega DURANTE a renumeracao espera o `exec`, e a gravacao dela entra na fila depois do ROLLBACK. Perde quem ja tinha a leitura em curso
 * quando o `exec` foi agendado: uma RAJADA mandada junto com a renumeracao (21 a 24 de 30, no codigo velho). A falha e forcada por um
 * gatilho com RAISE(ABORT) no ultimo UPDATE (RAISE(ROLLBACK) fecharia a transacao sozinho e o codigo velho passaria).
 *
 * Plano: docs/superpowers/plans/2026-10-17-almoxarifado-etapa138-payload-parcial-nos-put.md
 * Molde: putParcialMantem.api.test.js; o RN-04b de tests/sqliteConcurrency.test.js (o servico).
 * Executar: cd server && node tests/api/propostaRenumerarFalha.api.test.js
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
const RAJADA = 30;

let passed = 0; let failed = 0;
const testes = [];
function test(name, fn) { testes.push([name, fn]); }

let porta; let filho = null; let pasta; let logArq; let saiu = null;
async function j(m, u, tok, body) {
  const r = await fetch(`http://127.0.0.1:${porta}/api${u}`, {
    method: m,
    headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: 'Bearer ' + tok } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(60000),
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
const SEED = { email: 'e138renum@t.com', senha: 'E138renum!senha' };
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

let cru = null;
const run = (sql, p = []) => new Promise((res, rej) => cru.run(sql, p, function feito(e) { if (e) rej(e); else res(this); }));
const all = (sql, p = []) => new Promise((res, rej) => cru.all(sql, p, (e, r) => (e ? rej(e) : res(r))));
const ctx = {};
const numeros = async () => (await all("SELECT id, numero_proposta FROM propostas WHERE numero_proposta LIKE '%-E138-%' ORDER BY id")).map((r) => r.numero_proposta);

/** Seis propostas no padrao, na ordem de criacao inversa a do numero (todas precisam renumerar). As da rodada anterior saem (inativas). */
async function propostasForaDeOrdem(rodada) {
  await run("UPDATE propostas SET ativo = 0 WHERE numero_proposta LIKE '%-E138-%'");
  const ids = [];
  for (let k = 0; k < 6; k++) {
    const r = await run(
      "INSERT INTO propostas (cliente_id, numero_proposta, titulo, status, created_at) VALUES (?, ?, 'R', 'rascunho', datetime('2026-01-01', ?))",
      [ctx.clienteId, `${String(900 - k - rodada * 10).padStart(3, '0')}-${String(50 - k).padStart(2, '0')}-E138-${rodada}-REV00`, `+${k} minutes`],
    );
    ids.push(r.lastID);
  }
  return ids;
}

test('[RN-11] a renumeracao que falha no ultimo passo: 500, nenhum numero muda, e TODA edicao da rajada que respondeu 200 fica', async () => {
  let perdidas = 0; const detalhe = [];
  for (let rodada = 0; rodada < 3; rodada++) {
    const ids = await propostasForaDeOrdem(rodada);
    const antes = await numeros();
    // o ultimo UPDATE da renumeracao (a fase 2 da ultima proposta da fila) falha com ABORT: a transacao fica aberta, e o erro sobe
    await run('DROP TRIGGER IF EXISTS e138_falha');
    await run(`CREATE TRIGGER e138_falha BEFORE UPDATE OF numero_proposta ON propostas
      WHEN NEW.id = ${ids[ids.length - 1]} AND NEW.numero_proposta NOT LIKE '__RENUM_%'
      BEGIN SELECT RAISE(ABORT, 'falha injetada 138'); END`);
    const pRenum = j('POST', '/propostas/renumerar', ctx.T, {});
    const edicoes = ctx.clientes.map((id, k) => {
      const tel = `R${rodada}-T${k}`;
      return j('PUT', `/clientes/${id}`, ctx.T, { razao_social: `Edit ${k}`, telefone: tel }).then((r) => [id, tel, r[0]]);
    });
    const rRenum = await pRenum;
    const feitas = await Promise.all(edicoes);
    assert.strictEqual(rRenum[0], 500, `a renumeracao nao falhou: ${JSON.stringify(rRenum)}`);
    assert.match(String(rRenum[1] && rRenum[1].error), /falha injetada 138/);
    assert.deepStrictEqual(await numeros(), antes, 'a renumeracao que falhou mudou numero');
    let perdidasRodada = 0;
    for (const [id, tel, st] of feitas) {
      assert.strictEqual(st, 200, `a edicao do cliente ${id} -> ${st}`);
      const [l] = await all('SELECT telefone FROM clientes WHERE id = ?', [id]);
      if (l.telefone !== tel) perdidasRodada++;
    }
    perdidas += perdidasRodada;
    detalhe.push(perdidasRodada);
  }
  assert.strictEqual(perdidas, 0, `edicoes de cliente que responderam 200 e foram desfeitas pelo ROLLBACK da renumeracao, por rodada: ${detalhe.join('/')} de ${RAJADA}`);
  // a conexao nao ficou com transacao aberta: a proxima gravacao grava
  const [s] = await j('PUT', `/clientes/${ctx.clienteId}`, ctx.T, { razao_social: 'Cli renum', telefone: 'depois' });
  assert.strictEqual(s, 200);
  assert.strictEqual((await all('SELECT telefone FROM clientes WHERE id = ?', [ctx.clienteId]))[0].telefone, 'depois');
});

test('[RN-11] sem a falha, a renumeracao renumera (o caminho de hoje)', async () => {
  await run('DROP TRIGGER IF EXISTS e138_falha');
  await propostasForaDeOrdem(9);
  const r = await j('POST', '/propostas/renumerar', ctx.T, {});
  assert.strictEqual(r[0], 200, JSON.stringify(r[1]));
  assert.ok(r[1].success && r[1].alteradas >= 6, JSON.stringify(r[1]));
  const ns = await numeros();
  assert.ok(ns.every((n) => !n.startsWith('__RENUM_')), JSON.stringify(ns));
  const vivos = (await all('SELECT numero_proposta FROM propostas WHERE (ativo IS NULL OR ativo = 1) ORDER BY datetime(created_at), id')).map((x) => x.numero_proposta);
  assert.ok(vivos.length >= 6, JSON.stringify(vivos));
  assert.deepStrictEqual(vivos.map((n) => n.slice(0, 3)), vivos.map((_, k) => String(k + 1).padStart(3, '0')), JSON.stringify(vivos));
});

(async () => {
  console.log('\n=== Etapa 138 (C294): a renumeracao de propostas que falha nao desfaz o que os outros gravaram ===\n');
  try {
    pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'e138-renum-'));
    ctx.T = await subir();
    cru = new sqlite3.Database(path.join(pasta, 'database.sqlite'));
    cru.configure('busyTimeout', 30000);
    const [sc, c] = await j('POST', '/clientes', ctx.T, { razao_social: 'Cli renum' });
    assert.strictEqual(sc, 200, JSON.stringify(c));
    ctx.clienteId = c.id;
    ctx.clientes = [];
    for (let k = 0; k < RAJADA; k++) {
      const [s, x] = await j('POST', '/clientes', ctx.T, { razao_social: `Edit ${k}` });
      assert.strictEqual(s, 200);
      ctx.clientes.push(x.id);
    }
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
