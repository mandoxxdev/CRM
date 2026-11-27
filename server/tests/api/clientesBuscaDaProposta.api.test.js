/**
 * Busca do cliente na proposta (27/11/2026: "essa parte de selecionar o cliente esta ruim, pensa nisso com 5k de clientes"). O campo
 * da tela pede GET /api/clientes?status=ativo&search=...&limite=20 enquanto se digita.
 *
 *   CB-01 `limite` devolve so os primeiros (na ordem da razao social); sem ele, a lista inteira, como sempre; invalido = sem limite
 *   CB-02 o limite vale DEPOIS do filtro de segmento (cortar antes deixaria de fora quem bate o segmento)
 *   CB-03 CNPJ so com numeros acha o cliente gravado com pontuacao; texto com letras continua como antes
 *
 * Executar: cd server && node tests/api/clientesBuscaDaProposta.api.test.js
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
const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'busca-cli-'));
const SEED = { email: 'bcseed@t.com', senha: 'BcSeed!senha123' };
process.on('exit', () => { try { if (filho) filho.kill(); } catch (e) { /* ja saiu */ } });

async function req(m, u, tok) {
  const r = await fetch(`http://127.0.0.1:${porta}/api${u}`, {
    method: m, headers: tok ? { Authorization: 'Bearer ' + tok } : {}, signal: AbortSignal.timeout(60000),
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
  Object.assign(env, { CAMBIO_PTAX_URL: 'http://127.0.0.1:9/ptax', CRM_DATA_DIR: pasta, PORT: String(porta), SEED_ADMIN_EMAIL: SEED.email, SEED_ADMIN_PASSWORD: SEED.senha, RATE_LIMIT_MAX: '100000' });
  const out = fs.openSync(logArq, 'a');
  filho = spawn(process.execPath, ['-r', path.join(__dirname, '..', 'helpers', 'morreComOPai.js'), 'index.js'], { cwd: SERVER_DIR, env, stdio: ['pipe', out, out], windowsHide: true });
  filho.on('exit', (code) => { saiu = code; });
  const fim = Date.now() + 180000;
  while (Date.now() < fim) {
    if (saiu !== null) throw new Error(`o index.js saiu cedo (codigo ${saiu})`);
    try {
      const r = await fetch(`http://127.0.0.1:${porta}/api/auth/login`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(SEED), signal: AbortSignal.timeout(5000),
      });
      const x = await r.json().catch(() => null);
      if (r.status === 200 && x && x.token) {
        const ate = Date.now() + 30000;
        while (Date.now() < ate && !/Banco de dados totalmente inicializado/.test(fs.readFileSync(logArq, 'utf8'))) await pausa(200);
        await pausa(1500);
        return x.token;
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
    dados[c.name] = /INT|REAL|NUM/i.test(c.type) ? 1 : `cb-${++n}`;
  }
  const k = Object.keys(dados);
  return (await run(`INSERT INTO ${tabela} (${k.join(', ')}) VALUES (${k.map(() => '?').join(', ')})`, Object.values(dados))).lastID;
}

let token;
const nomes = (r) => (r.json || []).map((c) => c.razao_social);

test('CB-01 limite devolve so os primeiros; sem ele (ou invalido), a lista inteira', async () => {
  token = await subir();
  arquivo = new sqlite3.Database(path.join(pasta, 'database.sqlite'));
  arquivo.configure('busyTimeout', 15000);
  for (let i = 0; i < 30; i++) {
    await inserir('clientes', { razao_social: `TINTAS BUSCA ${String(i).padStart(2, '0')} LTDA`, nome_fantasia: `TB${i}`, status: 'ativo', segmento: i % 3 === 0 ? 'TINTAS' : 'OUTROS', cnpj: `11.222.333/00${String(i).padStart(2, '0')}-44` });
  }
  const tudo = await req('GET', '/clientes?status=ativo&search=busca', token);
  assert.strictEqual(tudo.status, 200, JSON.stringify(tudo.json));
  assert.strictEqual(tudo.json.length, 30);
  const vinte = await req('GET', '/clientes?status=ativo&search=busca&limite=20', token);
  assert.deepStrictEqual(nomes(vinte), nomes(tudo).slice(0, 20), 'os 20 primeiros na ordem da razao social');
  for (const ruim of ['abc', '0', '-5']) {
    assert.strictEqual((await req('GET', `/clientes?status=ativo&search=busca&limite=${ruim}`, token)).json.length, 30, `limite=${ruim} vale como sem limite`);
  }
  assert.strictEqual((await req('GET', '/clientes?status=ativo&search=busca&limite=999999', token)).json.length, 30, 'o teto (200) nao corta 30');
});

test('CB-02 o limite vale depois do filtro de segmento', async () => {
  const r = await req('GET', '/clientes?status=ativo&search=busca&segmento=TINTAS&limite=5', token);
  assert.strictEqual(r.json.length, 5, JSON.stringify(nomes(r)));
  assert.ok(r.json.every((c) => c.segmento === 'TINTAS'));
  const todos = await req('GET', '/clientes?status=ativo&search=busca&segmento=TINTAS', token);
  assert.strictEqual(todos.json.length, 10);
});

test('CB-03 CNPJ so com numeros acha o gravado com pontuacao; texto com letras como antes', async () => {
  await inserir('clientes', { razao_social: 'FALCAO INDUSTRIA E COMERCIO DE TINTAS SA', status: 'ativo', cnpj: '12.345.678/0001-90' });
  for (const termo of ['12345678', '12345678000190', '12.345.678', '0001-90']) {
    assert.deepStrictEqual(nomes(await req('GET', `/clientes?status=ativo&search=${encodeURIComponent(termo)}&limite=20`, token)),
      ['FALCAO INDUSTRIA E COMERCIO DE TINTAS SA'], `CNPJ "${termo}"`);
  }
  assert.deepStrictEqual(nomes(await req('GET', '/clientes?status=ativo&search=falcao&limite=20', token)), ['FALCAO INDUSTRIA E COMERCIO DE TINTAS SA']);
  assert.strictEqual((await req('GET', '/clientes?status=ativo&search=99999999&limite=20', token)).json.length, 0, 'digitos que nao batem: ninguem');
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
