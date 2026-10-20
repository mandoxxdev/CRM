/**
 * Etapa 167 (Comercial) — a Atividade Recente da elegibilidade de viagem no dia de Brasilia (C416), pelo `index.js` de verdade (pasta vazia).
 *
 *   RN-167.04  GET /api/custos-viagens/verificar-elegibilidade/:cliente_id — `dias` = dias de CALENDARIO de Brasilia entre hoje e o dia da
 *              ultima proposta ativa; `atividade_recente.atendida` = dias <= 90 (a regua das Visitas Tecnicas, RN-166.03)
 *   T3         para os mesmos clientes, a elegibilidade de viagem concorda com a atividade recente das Visitas Tecnicas
 *
 * DEPENDE DO RELOGIO E DO FUSO — e por isso fixa os dois. Diferenca deliberada do molde da 166: o filho sobe com TZ=America/Sao_Paulo (o de
 * producao, Dockerfile) — e nele que o codigo antigo (`new Date(MAX(created_at))`) le o instante UTC como hora local; em UTC a leitura antiga
 * sairia certa e o K4 nao discriminaria. O relogio do JavaScript do filho fica adiantado (tests/helpers/relogioAdiantado.js) para as 22h de
 * Brasilia de HOJE (= 01h UTC de HOJE+1): o hoje de Brasilia, o dia UTC do JS e o `date('now')` do SQLite (o real, semanas antes) sao tres
 * dias diferentes; a guarda derruba o arquivo se isso nao valer.
 *
 * Plano: docs/superpowers/plans/2026-10-20-almoxarifado-etapa167-o-marcador-vivo-no-preview-e-a-atividade-recente-da-viagem-no-dia-de-brasilia.md
 * Executar: cd server && node tests/api/atividadeRecenteDaViagemNoDiaLocal.api.test.js
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

// ── o relogio do filho ───────────────────────────────────────────────────────────────────────
const somaDias = (dia, n) => { const [a, m, d] = dia.split('-').map(Number); return new Date(Date.UTC(a, m - 1, d + n)).toISOString().slice(0, 10); };
const brt = (dia, hh, mm = 0) => { const [a, m, d] = dia.split('-').map(Number); return new Date(Date.UTC(a, m - 1, d, hh + 3, mm)).getTime(); };
/** o `created_at` do banco (UTC, sem fuso) das hh:mm de Brasilia do dia */
const banco = (dia, hh, mm = 0) => new Date(brt(dia, hh, mm)).toISOString().slice(0, 19).replace('T', ' ');
const HOJE = (() => {
  const real = new Date().toISOString(); // o mes UTC real
  let a = Number(real.slice(0, 4)); let m = Number(real.slice(5, 7)) + 1;
  if (m > 12) { m -= 12; a += 1; }
  return new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10); // o ultimo dia do mes seguinte: semanas a frente do real
})();
const ALVO = brt(HOJE, 22, 0);
const DESLOCAMENTO = ALVO - Date.now();

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
const j = (m, u, body, tok = ctx.T) => cru(m, `/api${u}`, tok, body);
function portaLivre() {
  return new Promise((res, rej) => {
    const s = net.createServer();
    s.once('error', rej);
    s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); });
  });
}
const SEED = { email: 'e167seed@t.com', senha: 'E167seed!senha' };
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
    RATE_LIMIT_MAX: '100000', NOMINATIM_URL: 'http://127.0.0.1:9/search', TZ: 'America/Sao_Paulo', RELOGIO_ADIANTADO_MS: String(DESLOCAMENTO) });
  const out = fs.openSync(logArq, 'a');
  saiu = null;
  const preload = ['-r', path.join(__dirname, '..', 'helpers', 'morreComOPai.js'), '-r', path.join(__dirname, '..', 'helpers', 'relogioAdiantado.js')];
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
const all = (sql, p = []) => new Promise((res, rej) => arquivo.all(sql, p, (e, r) => (e ? rej(e) : res(r))));
const ctx = { n: 0 };

async function inserir(tabela, campos) {
  const cols = await all(`PRAGMA table_info(${tabela})`);
  assert.ok(cols.length, `a tabela ${tabela} nao existe`);
  const dados = { ...campos };
  for (const c of cols) {
    if (c.pk || !c.notnull || c.dflt_value !== null || c.name in dados) continue;
    dados[c.name] = /INT|REAL|NUM/i.test(c.type) ? 1 : `x167-${++ctx.n}`;
  }
  const k = Object.keys(dados);
  return (await run(`INSERT INTO ${tabela} (${k.join(', ')}) VALUES (${k.map(() => '?').join(', ')})`, Object.values(dados))).lastID;
}
const proposta = (cliente, criado, extra) => inserir('propostas', {
  cliente_id: cliente, numero_proposta: `E167-${++ctx.n}`, titulo: `PROPOSTA 167 ${ctx.n}`, status: 'enviada', valor_total: 1,
  responsavel_id: ctx.admin, created_by: ctx.admin, created_at: criado, ...extra,
});

// [cliente, as ultimas propostas (created_at no banco), { atendida, dias } esperados] — preenchido na massa (o I90 vem do SQLite)
const CASOS = {};

test("guarda: o filho esta nas 22h de Brasilia de HOJE, em TZ=America/Sao_Paulo, e o date('now') do SQLite e semanas antes", async () => {
  const [s, h] = await cru('GET', '/api/health');
  assert.ok([200, 503].includes(s), `health ${s}`);
  const agoraFilho = new Date(h.timestamp).getTime();
  assert.ok(Math.abs(agoraFilho - ALVO) < 10 * 60000, `o relogio do filho (${h.timestamp}) nao esta perto das 22h de ${HOJE}`);
  assert.strictEqual(new Date(ALVO).toISOString().slice(0, 10), somaDias(HOJE, 1), 'as 22h de Brasilia sao o dia UTC seguinte');
  const [{ d }] = await all("SELECT date('now') AS d");
  assert.ok(d < somaDias(HOJE, -8), `o date('now') (${d}) tem de estar semanas antes de HOJE (${HOJE})`);
});

test('massa: um cliente por borda (created_at escolhido, por fora)', async () => {
  ctx.admin = (await all('SELECT id FROM usuarios WHERE email = ?', [SEED.email]))[0].id;
  const [{ i90 }] = await all("SELECT date(?, '-90 days') AS i90", [HOJE]);
  ctx.I90 = i90;
  const cli = (nome) => inserir('clientes', { razao_social: nome, nome_fantasia: nome, status: 'ativo', estado: 'SP', cidade: 'CIDADE' });
  const def = {
    K1: [[banco(i90, 0, 30)], { atendida: true, dias: 90 }],
    K2: [[banco(somaDias(i90, -1), 22, 30)], { atendida: false, dias: 91 }], // antes true/90: lida como local, 3 h depois
    K3: [[banco(i90, 12, 0)], { atendida: true, dias: 90 }], // com o hoje UTC (HOJE+1) daria false/91
    K4: [[banco(somaDias(i90, 1), 23, 0)], { atendida: true, dias: 89 }], // antes 88 (88 d 20 h)
    K5: [['lixo'], { atendida: false, dias: null }],
    K6: [[banco(HOJE, 22, 30)], { atendida: true, dias: 0 }], // antes -1 (Math.floor de -0,15 dia)
    K7: [['lixo', banco(somaDias(HOJE, -10), 12, 0)], { atendida: true, dias: 10 }], // antes false/null: o 'lixo' vencia o MAX de texto
    // Fase 5 r3 S05/S12: a ULTIMA (o MAX, nao o MIN) e so a ATIVA
    K8: [[banco(somaDias(HOJE, -200), 12, 0), banco(somaDias(HOJE, -10), 12, 0)], { atendida: true, dias: 10 }],
    K9: [[banco(somaDias(HOJE, -200), 12, 0), [banco(somaDias(HOJE, -5), 12, 0), { ativo: 0 }]], { atendida: false, dias: 200 }],
  };
  for (const [k, [criados, esperado]] of Object.entries(def)) {
    const id = await cli(`CLIENTE ${k} 167`);
    for (const c of criados) await (Array.isArray(c) ? proposta(id, c[0], c[1]) : proposta(id, c));
    CASOS[k] = { id, esperado };
  }
});

test('[RN-167.04, B1066] a Atividade Recente da viagem: dias de calendario de Brasilia, <= 90', async () => {
  const got = {}; const exp = {};
  for (const [k, { id, esperado }] of Object.entries(CASOS)) {
    const [s, r] = await j('GET', `/custos-viagens/verificar-elegibilidade/${id}`);
    assert.strictEqual(s, 200, `${k}: ${s} ${JSON.stringify(r).slice(0, 200)}`);
    const a = r.regras && r.regras.atividade_recente;
    assert.ok(a, `${k}: sem a regra atividade_recente`);
    got[k] = { atendida: a.atendida, dias: a.dias };
    exp[k] = esperado;
    assert.strictEqual(r.resumo.atividade_recente, a.atendida, `${k}: o resumo = a regra`);
    assert.strictEqual(r.pode_registrar, true, `${k}: as obrigatorias nao mudam (a proposta enviada)`);
  }
  assert.deepStrictEqual(got, exp, `HOJE ${HOJE}, I90 ${ctx.I90}`);
});

test('[RN-167.04] o cliente que nao existe: 404 com a mesma frase', async () => {
  const [s, r] = await j('GET', '/custos-viagens/verificar-elegibilidade/999999');
  assert.strictEqual(s, 404);
  assert.strictEqual(r.error, 'Cliente não encontrado');
});

test('[T3] a elegibilidade de viagem concorda com a atividade recente das Visitas Tecnicas, cliente por cliente', async () => {
  const [s, r] = await j('GET', '/relatorios/visitas-tecnicas');
  assert.strictEqual(s, 200, JSON.stringify(r).slice(0, 200));
  const todos = [...(r.elegiveis || []), ...(r.naoElegiveis || [])];
  const por = Object.fromEntries(todos.map((c) => [c.id, c]));
  const visitas = {}; const viagem = {};
  for (const [k, { id }] of Object.entries(CASOS)) {
    assert.ok(por[id], `${k} nao aparece nas Visitas Tecnicas`);
    visitas[k] = por[id].regras.atividadeRecente.passou;
    const [, e] = await j('GET', `/custos-viagens/verificar-elegibilidade/${id}`);
    viagem[k] = e.regras.atividade_recente.atendida;
  }
  assert.deepStrictEqual(viagem, visitas, 'as duas reguas da atividade recente');
  // metade positiva: os dois lados existem (nao e igualdade de dois vazios)
  assert.deepStrictEqual(Object.values(visitas).sort(), [false, false, false, true, true, true, true, true, true]);
});

(async () => {
  console.log(`\n▶ Etapa 167 — a atividade recente da viagem no dia de Brasilia (HOJE ${HOJE}, o filho as 22h, TZ=America/Sao_Paulo)\n`);
  pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'e167-'));
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
