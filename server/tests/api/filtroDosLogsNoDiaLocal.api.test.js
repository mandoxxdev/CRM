/**
 * Etapa 168 (nucleo) — o filtro *Data inicio* / *Data fim* da tela de Logs no dia de Brasilia (B1070), pelo `index.js` de verdade (pasta vazia).
 *
 *   RN-168.03  GET /api/auditoria/logs?data_inicio=D1&data_fim=D2 devolve os logs cujo dia de BRASILIA esta entre D1 e D2 (antes: o dia UTC
 *              do `created_at` — o log das 21h a meia-noite caia no filtro do dia seguinte). O par (mod, data) so entra quando a data veio;
 *              `tipo`, `modulo`, a ordem e o `limit` continuam; data invalida -> 200 e lista vazia (inalterado).
 *
 * Nao depende do relogio: o `created_at` de cada log e escolhido por fora. DEPENDE DO FUSO DO NEGOCIO (o `FUSO_PADRAO`, -03), nao do `TZ`
 * do processo — o filho sobe com TZ=UTC de proposito: o `date(created_at)` antigo e o certo so concordam se o modificador for 0, e a guarda
 * derruba o arquivo se o modificador do servidor nao for o de Brasilia.
 *
 * Plano: docs/superpowers/plans/2026-10-20-almoxarifado-etapa168-a-hora-de-criacao-no-relogio-de-brasilia-no-nucleo-na-viagem-e-nas-solicitacoes.md
 * Executar: cd server && node tests/api/filtroDosLogsNoDiaLocal.api.test.js
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

// ── o servidor real ─────────────────────────────────────────────────────────────────────────
let porta; let filho = null; let pasta; let logArq; let saiu = null;
async function cru(m, u, tok, body, ms = 60000) {
  const headers = { ...(tok ? { Authorization: 'Bearer ' + tok } : {}) };
  let corpo;
  if (body !== undefined) { headers['Content-Type'] = 'application/json'; corpo = JSON.stringify(body); }
  const r = await fetch(`http://127.0.0.1:${porta}${u}`, { method: m, headers, body: corpo, signal: AbortSignal.timeout(ms) });
  const buf = Buffer.from(await r.arrayBuffer());
  let x = buf.toString('utf8'); try { x = JSON.parse(x); } catch (e) { /* sem JSON */ }
  return [r.status, x];
}
function portaLivre() {
  return new Promise((res, rej) => {
    const s = net.createServer();
    s.once('error', rej);
    s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); });
  });
}
const SEED = { email: 'e168seed@t.com', senha: 'E168seed!senha' };
process.on('exit', () => { try { if (filho) filho.kill(); } catch (e) { /* ja saiu */ } });

async function subir() {
  logArq = path.join(pasta, 'index.log');
  porta = await portaLivre();
  if (porta === 5000) porta = await portaLivre();
  const env = { ...process.env };
  for (const k of ['NODE_ENV', 'NODE_OPTIONS', 'RUN_ALL_GUARDA_EXIT', 'PORT', 'CRM_DATA_DIR', 'JWT_SECRET', 'API_URL', 'NOMINATIM_URL',
    'SEED_ADMIN_EMAIL', 'SEED_ADMIN_PASSWORD', 'FALHA_SQL_INJETADA', 'FALHA_SQL_MSG', 'FALHA_SQL_METODOS', 'FALHA_SQL_PULAR', 'FALHA_SQL_MSGS',
    'PROPOSTAS_PORTAO_DE_MODULO', 'RATE_LIMIT_WINDOW_MS', 'TZ', 'RELOGIO_ADIANTADO_MS']) delete env[k];
  Object.assign(env, { CRM_DATA_DIR: pasta, PORT: String(porta), SEED_ADMIN_EMAIL: SEED.email, SEED_ADMIN_PASSWORD: SEED.senha,
    RATE_LIMIT_MAX: '100000', NOMINATIM_URL: 'http://127.0.0.1:9/search', TZ: 'UTC' });
  const out = fs.openSync(logArq, 'a');
  saiu = null;
  const preload = ['-r', path.join(__dirname, '..', 'helpers', 'morreComOPai.js')];
  filho = spawn(process.execPath, [...preload, 'index.js'], { cwd: SERVER_DIR, env, stdio: ['pipe', out, out], windowsHide: true });
  filho.on('exit', (code) => { saiu = code; });
  const fim = Date.now() + 60000;
  while (Date.now() < fim) {
    if (saiu !== null) throw new Error(`o index.js saiu cedo (codigo ${saiu})`);
    try {
      const [s, x] = await cru('POST', '/api/auth/login', null, SEED);
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

// ── o arquivo, por fora ─────────────────────────────────────────────────────────────────────
let arquivo = null;
function abrirCru() {
  arquivo = new sqlite3.Database(path.join(pasta, 'database.sqlite'));
  arquivo.configure('busyTimeout', 15000);
}
const run = (sql, p = []) => new Promise((res, rej) => arquivo.run(sql, p, function feito(e) { if (e) rej(e); else res(this); }));
const ctx = {};

// o modulo de cada log separa a massa desta etapa de qualquer log que o boot ou o login gravem
const MOD = 'e168';
const LOGS = {
  L1: ['2026-10-21 01:30:00', 'tipo_a'], // 20/10 22h30 de Brasilia (o dia UTC e 21/10)
  L2: ['2026-10-20 12:00:00', 'tipo_a'], // 20/10 09h00
  L3: ['2026-10-20 02:30:00', 'tipo_b'], // 19/10 23h30 (o dia UTC e 20/10)
  L4: ['2026-10-22 02:59:59', 'tipo_b'], // 21/10 23h59m59s
  L5: ['2026-10-22 03:00:00', 'tipo_a'], // 22/10 00h00 — a borda
};
const nomes = (rows) => rows.map((r) => r.nome_modulo).sort();
async function filtro(q) {
  const [s, r] = await cru('GET', `/api/auditoria/logs?modulo=${MOD}&${q}`, ctx.T);
  assert.strictEqual(s, 200, `${q}: ${s} ${JSON.stringify(r).slice(0, 200)}`);
  assert.ok(Array.isArray(r), `${q}: nao e lista`);
  return r;
}

test('guarda: o servidor recorta com o modificador de Brasilia (-180 minutes) e o processo esta em UTC', async () => {
  const diaLocal = require(path.join(SERVER_DIR, 'services', 'diaLocal'));
  assert.strictEqual(diaLocal.modificadorDoFuso(new Date('2026-10-20T12:00:00Z')), '-180 minutes');
  const [s, h] = await cru('GET', '/api/health');
  assert.ok([200, 503].includes(s), `health ${s}`);
});

test('massa: cinco logs com o created_at escolhido, por fora', async () => {
  for (const [k, [criado, tipo]] of Object.entries(LOGS)) {
    await run(`INSERT INTO logs_auditoria (usuario_id, usuario_nome, usuario_email, tipo, modulo, nome_modulo, created_at)
               VALUES (1, 'E168', 'e168@t', ?, ?, ?, ?)`, [tipo, MOD, k, criado]);
  }
  assert.deepStrictEqual(nomes(await filtro('')), ['L1', 'L2', 'L3', 'L4', 'L5']); // sem data: todos
});

test('[RN-168.03, B1070] o dia de Brasilia nos dois recortes', async () => {
  const got = {
    '20-20': nomes(await filtro('data_inicio=2026-10-20&data_fim=2026-10-20')), // antes [L2, L3]
    '21-21': nomes(await filtro('data_inicio=2026-10-21&data_fim=2026-10-21')), // antes [L1]
    '19-19': nomes(await filtro('data_inicio=2026-10-19&data_fim=2026-10-19')), // antes []
    '22-22': nomes(await filtro('data_inicio=2026-10-22&data_fim=2026-10-22')), // antes [L4, L5]
  };
  assert.deepStrictEqual(got, { '20-20': ['L1', 'L2'], '21-21': ['L4'], '19-19': ['L3'], '22-22': ['L5'] });
});

test('[RN-168.03, Fase 2 M1] so uma das datas: o par (mod, data) da que veio', async () => {
  assert.deepStrictEqual(nomes(await filtro('data_inicio=2026-10-21')), ['L4', 'L5']); // antes [L1, L4, L5]
  assert.deepStrictEqual(nomes(await filtro('data_fim=2026-10-19')), ['L3']); // antes []
  assert.deepStrictEqual(nomes(await filtro('data_fim=2026-10-20')), ['L1', 'L2', 'L3']); // antes [L2, L3]
});

test('[RN-168.03] com o tipo antes das datas: os ? na ordem do SQL; a ordem e o limit continuam', async () => {
  assert.deepStrictEqual(nomes(await filtro('tipo=tipo_a&data_inicio=2026-10-20&data_fim=2026-10-20')), ['L1', 'L2']);
  assert.deepStrictEqual(nomes(await filtro('tipo=tipo_b&data_inicio=2026-10-19&data_fim=2026-10-21')), ['L3', 'L4']);
  const ordem = await filtro('data_inicio=2026-10-19&data_fim=2026-10-22');
  assert.deepStrictEqual(ordem.map((r) => r.nome_modulo), ['L5', 'L4', 'L1', 'L2', 'L3']); // created_at DESC
  assert.deepStrictEqual((await filtro('data_inicio=2026-10-19&data_fim=2026-10-22&limit=2')).map((r) => r.nome_modulo), ['L5', 'L4']);
  // o created_at sai cru (a tela converte — RN-168.01)
  assert.strictEqual(ordem.find((r) => r.nome_modulo === 'L1').created_at, '2026-10-21 01:30:00');
});

test('[RN-168.03, Fase 2 M2] data invalida: 200 e lista vazia (inalterado)', async () => {
  assert.deepStrictEqual(await filtro('data_inicio=lixo'), []);
  assert.deepStrictEqual(nomes(await filtro('data_fim=lixo')), ['L1', 'L2', 'L3', 'L4', 'L5']); // 'AAAA-…' <= 'lixo' (texto) — como antes
});

// ── Etapa 170 (RN-170.05, B1083, C422): limit/offset presentes tem de ser texto so de digitos — 400 com a mensagem literal ──────────────
const L_LIMIT = { error: 'limit inválido. Use um número inteiro maior ou igual a zero.' };
const L_OFFSET = { error: 'offset inválido. Use um número inteiro maior ou igual a zero.' };
const cruLogs = (q, tok = ctx.T) => cru('GET', `/api/auditoria/logs?modulo=${MOD}&${q}`, tok);

test('[RN-170.05] limit/offset validos: o limite, o deslocamento, o zero, o 05 e o padrao (inalterados)', async () => {
  const ordem = (await filtro('')).map((r) => r.nome_modulo);
  assert.deepStrictEqual(ordem, ['L5', 'L4', 'L1', 'L2', 'L3']); // sem limit: o padrao (100) cobre os cinco
  assert.deepStrictEqual((await filtro('limit=2')).map((r) => r.nome_modulo), ['L5', 'L4']);
  assert.deepStrictEqual((await filtro('limit=1&offset=1')).map((r) => r.nome_modulo), ['L4']);
  assert.deepStrictEqual((await filtro('offset=3')).map((r) => r.nome_modulo), ['L2', 'L3']);
  assert.deepStrictEqual(await filtro('limit=0'), []);
  assert.deepStrictEqual((await filtro('limit=03')).map((r) => r.nome_modulo), ['L5', 'L4', 'L1']); // so digitos: aceito
  assert.deepStrictEqual((await filtro('limit=9007199254740991')).length, 5); // MAX_SAFE_INTEGER: aceito
});

test('[RN-170.05] limit invalido -> 400 com a mensagem literal (antes 500 do SQLite, ou sem limite, ou o parseInt)', async () => {
  for (const q of ['limit=abc', 'limit=-1', 'limit=10abc', 'limit=1.5', 'limit=', 'limit', 'limit=%2B5', 'limit=+5', 'limit=%205',
    'limit[]=5', 'limit[a]=1', 'limit=1&limit=2', 'limit=1&limit[a]=2', 'limit=9007199254740992', 'limit=99999999999999999999',
    'limit=abc&offset=abc']) {
    const [s, r] = await cruLogs(q);
    assert.deepStrictEqual([s, r], [400, L_LIMIT], q);
  }
});

test('[RN-170.05] offset invalido -> 400 com a mensagem literal', async () => {
  for (const q of ['offset=abc', 'offset=-1', 'offset=2x', 'offset=', 'offset[]=1', 'offset=1&offset=2', 'limit=2&offset=-1']) {
    const [s, r] = await cruLogs(q);
    assert.deepStrictEqual([s, r], [400, L_OFFSET], q);
  }
});

test('[RN-170.05] o portao vem antes: quem nao gerencia usuarios toma 403 mesmo com limit invalido; sem token 401', async () => {
  const email = 'e170comum@t.com';
  const [sc, c] = await cru('POST', '/api/usuarios', ctx.T, { nome: 'E170 Comum', email, senha: 'Senha!170', cargo: 'C', setor: '' });
  assert.ok([200, 201].includes(sc), `criar usuario: ${sc} ${JSON.stringify(c)}`);
  const [sl, l] = await cru('POST', '/api/auth/login', null, { email, senha: 'Senha!170' });
  assert.strictEqual(sl, 200, `login: ${JSON.stringify(l)}`);
  const [s, r] = await cruLogs('limit=abc', l.token);
  assert.deepStrictEqual([s, r], [403, { error: 'Acesso negado. Apenas administradores podem visualizar logs.' }]);
  const [s2] = await cru('GET', `/api/auditoria/logs?limit=abc`, null);
  assert.strictEqual(s2, 401);
});

test('o portao nao muda: sem token 401', async () => {
  const [s] = await cru('GET', `/api/auditoria/logs?modulo=${MOD}&data_inicio=2026-10-20`, null);
  assert.strictEqual(s, 401);
});

(async () => {
  console.log('\n▶ Etapas 168 e 170 — o filtro dos logs no dia de Brasilia (o filho em TZ=UTC) e o limit/offset validados\n');
  pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'e168-'));
  try {
    ctx.T = await subir();
    abrirCru();
    for (const [nome, fn] of testes) {
      try { await fn(); passed++; console.log(`  ✓ ${nome}`); } catch (e) {
        failed++; console.log(`  ✗ ${nome}\n    ${e && e.message}`);
        if (/^guarda|^massa/.test(nome)) { console.log('    (guarda/massa caiu — os cenarios abaixo nao provariam nada)'); break; }
      }
    }
  } catch (e) {
    failed++; console.log(`  ✗ preparo: ${e && e.stack}`);
  } finally {
    if (arquivo) await new Promise((r) => arquivo.close(r));
    await descer();
    try { fs.rmSync(pasta, { recursive: true, force: true }); } catch (e) { /* o Windows segura o arquivo as vezes */ }
  }
  console.log(`\n${passed} passaram, ${failed} falharam\n`);
  process.exit(failed ? 1 : 0);
})();
