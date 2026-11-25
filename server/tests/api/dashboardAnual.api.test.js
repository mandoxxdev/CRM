/**
 * Dashboard anual (25/11/2026: "esses filtros devem ser todos anuais, pq agora estamos no fim de 2026, deve resetar em 2027").
 * A tela abre no ano corrente (client/src/components/periodoDashboard.js) e manda inicio/fim; aqui, o servidor respeitando o período:
 *
 *   DA-01 /dashboard/vendas: o funil, o valor por etapa, o pipeline e o tempo médio contam só as propostas criadas no período
 *         (antes ignorava qualquer filtro); sem período, todas
 *   DA-02 /dashboard/historico com inicio/fim: só os meses do período (antes, sempre os últimos 12 meses); sem período, o de antes
 *   DA-03 /dashboard: o valor aprovado e os status no período (já respeitava; guarda contra regressão)
 *
 * Executar: cd server && node tests/api/dashboardAnual.api.test.js
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

let porta; let filho = null; let saiu = null;
const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'dash-anual-'));
const SEED = { email: 'daseed@t.com', senha: 'DaSeed!senha123' };
process.on('exit', () => { try { if (filho) filho.kill(); } catch (e) { /* ja saiu */ } });

async function req(m, u, tok, body) {
  const r = await fetch(`http://127.0.0.1:${porta}/api${u}`, {
    method: m, headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: 'Bearer ' + tok } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(60000),
  });
  let json = null; try { json = await r.json(); } catch (e) { /* sem corpo */ }
  return { status: r.status, json };
}
function portaLivre() {
  return new Promise((res, rej) => { const s = net.createServer(); s.once('error', rej); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
}
async function subir() {
  const logArq = path.join(pasta, 'index.log');
  porta = await portaLivre();
  const env = { ...process.env };
  for (const k of ['NODE_ENV', 'NODE_OPTIONS', 'RUN_ALL_GUARDA_EXIT', 'PORT', 'CRM_DATA_DIR', 'JWT_SECRET', 'API_URL', 'SEED_ADMIN_EMAIL', 'SEED_ADMIN_PASSWORD', 'FALHA_SQL_INJETADA', 'RATE_LIMIT_WINDOW_MS', 'TZ', 'RELOGIO_ADIANTADO_MS']) delete env[k];
  Object.assign(env, { CRM_DATA_DIR: pasta, PORT: String(porta), SEED_ADMIN_EMAIL: SEED.email, SEED_ADMIN_PASSWORD: SEED.senha, RATE_LIMIT_MAX: '100000' });
  const out = fs.openSync(logArq, 'a');
  filho = spawn(process.execPath, ['-r', path.join(__dirname, '..', 'helpers', 'morreComOPai.js'), 'index.js'], { cwd: SERVER_DIR, env, stdio: ['pipe', out, out], windowsHide: true });
  filho.on('exit', (code) => { saiu = code; });
  const fim = Date.now() + 180000;
  while (Date.now() < fim) {
    if (saiu !== null) throw new Error(`o index.js saiu cedo (codigo ${saiu})`);
    try {
      const r = await req('POST', '/auth/login', null, SEED);
      if (r.status === 200 && r.json && r.json.token) {
        const ate = Date.now() + 30000;
        while (Date.now() < ate && !/Banco de dados totalmente inicializado/.test(fs.readFileSync(logArq, 'utf8'))) await pausa(200);
        await pausa(1500);
        return r.json.token;
      }
    } catch (e) { /* ainda subindo */ }
    await pausa(300);
  }
  throw new Error('o index.js nao ficou pronto em 180 s');
}
let arquivo;
const run = (sql, p = []) => new Promise((res, rej) => arquivo.run(sql, p, function feito(e) { if (e) rej(e); else res(this); }));
const all = (sql, p = []) => new Promise((res, rej) => arquivo.all(sql, p, (e, r) => (e ? rej(e) : res(r))));
let n = 0;
async function inserir(tabela, campos) {
  const cols = await all(`PRAGMA table_info(${tabela})`);
  const dados = { ...campos };
  for (const c of cols) {
    if (c.pk || !c.notnull || c.dflt_value !== null || c.name in dados) continue;
    dados[c.name] = /INT|REAL|NUM/i.test(c.type) ? 1 : `da-${++n}`;
  }
  const k = Object.keys(dados);
  return (await run(`INSERT INTO ${tabela} (${k.join(', ')}) VALUES (${k.map(() => '?').join(', ')})`, Object.values(dados))).lastID;
}

let token;
const ANO = { inicio: '2026-01-01', fim: '2026-12-31' };
const qs = (p) => `?${new URLSearchParams(p)}`;

test('massa: propostas de 2025 e de 2026', async () => {
  token = await subir();
  arquivo = new sqlite3.Database(path.join(pasta, 'database.sqlite'));
  arquivo.configure('busyTimeout', 15000);
  const admin = (await all('SELECT id FROM usuarios WHERE email = ?', [SEED.email]))[0].id;
  const cli = await inserir('clientes', { razao_social: 'CLIENTE ANUAL', nome_fantasia: 'ANUAL', status: 'ativo', created_at: '2026-03-10 15:00:00' });
  const prop = (status, valor, criado) => inserir('propostas', { cliente_id: cli, numero_proposta: `DA-${++n}`, titulo: `DA ${n}`, status, valor_total: valor,
    responsavel_id: admin, created_by: admin, created_at: criado });
  await prop('aprovada', 1000, '2025-06-15 15:00:00'); // ano passado
  await prop('enviada', 500, '2025-09-15 15:00:00'); // ano passado
  await prop('aprovada', 200, '2026-03-10 15:00:00');
  await prop('enviada', 30, '2026-08-20 15:00:00');
  await prop('rascunho', 4, '2026-08-21 15:00:00');
});

test('DA-01 /dashboard/vendas conta só o período; sem período, todas', async () => {
  const r = await req('GET', `/dashboard/vendas${qs(ANO)}`, token);
  assert.strictEqual(r.status, 200, JSON.stringify(r.json));
  const funil = Object.fromEntries(r.json.funilVendas.map((e) => [e.etapa, e.quantidade]));
  assert.deepStrictEqual(funil, { Rascunho: 1, Enviadas: 1, Aprovadas: 1 }, `funil de 2026: ${JSON.stringify(r.json.funilVendas)}`);
  assert.strictEqual(r.json.pipeline.valorPorEtapa.Aprovadas, 200, 'valor aprovado de 2026');
  assert.strictEqual(r.json.pipeline.valorTotal, 234, 'pipeline de 2026 (rascunho+enviada+aprovada)');
  const todo = await req('GET', '/dashboard/vendas', token);
  const funilTodo = Object.fromEntries(todo.json.funilVendas.map((e) => [e.etapa, e.quantidade]));
  assert.deepStrictEqual(funilTodo, { Rascunho: 1, Enviadas: 2, Aprovadas: 2 }, `todo o período: ${JSON.stringify(todo.json.funilVendas)}`);
  const passado = await req('GET', `/dashboard/vendas${qs({ inicio: '2025-01-01', fim: '2025-12-31' })}`, token);
  assert.strictEqual(passado.json.pipeline.valorPorEtapa.Aprovadas, 1000, 'ano passado');
});

test('DA-02 /dashboard/historico com período: só os meses do período', async () => {
  const r = await req('GET', `/dashboard/historico${qs(ANO)}`, token);
  assert.strictEqual(r.status, 200, JSON.stringify(r.json));
  const meses = r.json.map((x) => x.mes);
  assert.ok(meses.length > 0 && meses.every((m) => m >= '2026-01' && m <= '2026-12'), `só 2026: ${meses.join(',')}`);
  assert.ok(meses.includes('2026-03') && meses.includes('2026-08'), `os meses com proposta: ${meses.join(',')}`);
  const passado = await req('GET', `/dashboard/historico${qs({ inicio: '2025-01-01', fim: '2025-12-31' })}`, token);
  assert.deepStrictEqual(passado.json.map((x) => x.mes), ['2025-06', '2025-09'], `2025: ${JSON.stringify(passado.json)}`);
  const lixo = await req('GET', `/dashboard/historico${qs({ inicio: "2026-01-01' OR 1=1 --", fim: 'x' })}`, token);
  assert.strictEqual(lixo.status, 200, 'período inválido é ignorado (cai nos últimos 12 meses), não quebra');
});

test('DA-03 /dashboard: aprovado e status no período', async () => {
  const r = await req('GET', `/dashboard${qs(ANO)}`, token);
  assert.strictEqual(r.json.valorTotalPropostasAprovadas, 200);
  const st = Object.fromEntries(r.json.propostasPorStatus.map((x) => [x.status, x.total]));
  assert.deepStrictEqual(st, { aprovada: 1, enviada: 1, rascunho: 1 });
});

(async () => {
  for (const [nome, fn] of testes) {
    try { await fn(); passed++; console.log('  ✓ ' + nome); } catch (e) { failed++; console.log('  ✗ ' + nome + '\n      ' + (e && e.message)); }
  }
  if (filho && saiu === null) { const morreu = new Promise((r) => filho.once('exit', r)); filho.kill(); await Promise.race([morreu, pausa(10000)]); }
  try { if (arquivo) arquivo.close(); fs.rmSync(pasta, { recursive: true, force: true }); } catch (e) { /* windows segura o arquivo */ }
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
