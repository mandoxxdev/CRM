/**
 * Etapa 158 (Comercial, C377) — as colunas da coordenada guardada no cadastro do cliente (geo_lat, geo_lon, geo_termo): a migracao e o
 * erro ao gravar a memoria. Pelo `index.js` de verdade, com NOMINATIM_URL num servidor local (o Nominatim de verdade NUNCA e chamado).
 *
 *   RN-158.04  as tres colunas entram por ALTER no callback do CREATE de `clientes`: (a) primeiro boot numa pasta vazia; (b) boot sobre um
 *              banco antigo (a tabela `clientes` com o CREATE de antes da etapa, sem as colunas e sem o logo_url, com um cliente com
 *              endereco) — as colunas entram, o cliente fica intacto, a rota responde e grava; (c) o segundo boot na mesma pasta — log
 *              limpo, a memoria ainda la, a abertura nao consulta
 *   RN-158.01  (Fase 2 I2) o UPDATE da memoria que falha: a resposta e a coordenada do SERVICO (nao a da cidade), o processo segue, nada e
 *              gravado, a linha do erro no log, e a abertura seguinte consulta de novo
 *
 * Plano: docs/superpowers/plans/2026-10-19-almoxarifado-etapa158-coordenada-guardada-resumo-e-historico-dos-custos.md
 * Executar: cd server && node tests/api/coordenadaGuardadaMigracao.api.test.js
 */
const assert = require('assert');
const fs = require('fs');
const http = require('http');
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

// ── a fronteira HTTP: o servico de mapas local ───────────────────────────────────────────────
const fronteira = { pedidos: [], lat: '-22.5', lon: '-47.5' };
const servidorDeMapas = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://local');
  fronteira.pedidos.push(Object.fromEntries(u.searchParams));
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify([{ lat: fronteira.lat, lon: fronteira.lon }]));
});
const sockets = new Set();
servidorDeMapas.on('connection', (s) => { sockets.add(s); s.on('close', () => sockets.delete(s)); });
let urlDaFronteira;

// ── o servidor real ─────────────────────────────────────────────────────────────────────────
let porta; let filho = null; let saiu = null; let T = null; let pastaAtual; let logAtual;
async function j(m, u, body) {
  const headers = { ...(T ? { Authorization: 'Bearer ' + T } : {}) };
  let corpo;
  if (body !== undefined) { headers['Content-Type'] = 'application/json'; corpo = JSON.stringify(body); }
  const r = await fetch(`http://127.0.0.1:${porta}/api${u}`, { method: m, headers, body: corpo, signal: AbortSignal.timeout(30000) });
  const txt = await r.text();
  let x = txt; try { x = JSON.parse(txt); } catch (e) { /* sem JSON */ }
  return [r.status, x];
}
function portaLivre() {
  return new Promise((res, rej) => {
    const s = net.createServer();
    s.once('error', rej);
    s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); });
  });
}
const SEED = { email: 'e158seed@t.com', senha: 'E158seed!senha' };
process.on('exit', () => { try { if (filho) filho.kill(); } catch (e) { /* ja saiu */ } });
// sobe o index.js na pasta; devolve o trecho do log DESTE boot quando ele termina de inicializar
async function subir(pasta, extraEnv = {}) {
  pastaAtual = pasta;
  logAtual = path.join(pasta, 'index.log');
  const inicio = fs.existsSync(logAtual) ? fs.readFileSync(logAtual, 'utf8').length : 0;
  porta = await portaLivre();
  if (porta === 5000) porta = await portaLivre();
  const env = { ...process.env };
  for (const k of ['NODE_ENV', 'NODE_OPTIONS', 'RUN_ALL_GUARDA_EXIT', 'PORT', 'CRM_DATA_DIR', 'JWT_SECRET', 'API_URL', 'SEED_ADMIN_EMAIL',
    'SEED_ADMIN_PASSWORD', 'FALHA_SQL_INJETADA', 'FALHA_SQL_MSG', 'FALHA_SQL_METODOS', 'FALHA_SQL_PULAR', 'FALHA_SQL_MSGS',
    'PROPOSTAS_PORTAO_DE_MODULO', 'RATE_LIMIT_WINDOW_MS', 'NOMINATIM_URL', 'NOMINATIM_PRAZO_MS']) delete env[k];
  // o cliente antigo tem endereco: NUNCA sem a NOMINATIM_URL local (ponto de atencao 1 do plano)
  Object.assign(env, { CRM_DATA_DIR: pasta, PORT: String(porta), SEED_ADMIN_EMAIL: SEED.email, SEED_ADMIN_PASSWORD: SEED.senha, RATE_LIMIT_MAX: '100000',
    NOMINATIM_URL: urlDaFronteira, NOMINATIM_PRAZO_MS: '2000' }, extraEnv);
  assert.ok(/^http:\/\/127\.0\.0\.1:\d+\/search$/.test(env.NOMINATIM_URL), `NOMINATIM_URL fora da fronteira local: ${env.NOMINATIM_URL}`);
  const out = fs.openSync(logAtual, 'a');
  saiu = null;
  const preload = ['-r', path.join(__dirname, '..', 'helpers', 'morreComOPai.js')];
  if (extraEnv.FALHA_SQL_INJETADA) preload.push('-r', path.join(__dirname, '..', 'helpers', 'falhaSqlInjetada.js'));
  filho = spawn(process.execPath, [...preload, 'index.js'], { cwd: SERVER_DIR, env, stdio: ['pipe', out, out], windowsHide: true });
  filho.on('exit', (code) => { saiu = code; });
  const desteBoot = () => fs.readFileSync(logAtual, 'utf8').slice(inicio);
  const fim = Date.now() + 60000;
  while (Date.now() < fim) {
    if (saiu !== null) throw new Error(`o index.js saiu cedo (codigo ${saiu}): ${desteBoot().slice(-600)}`);
    try {
      T = null;
      const [s, x] = await j('POST', '/auth/login', SEED);
      if (s === 200 && x && x.token) {
        const ate = Date.now() + 30000;
        while (Date.now() < ate && !/Banco de dados totalmente inicializado/.test(desteBoot())) await pausa(200);
        await pausa(1500);
        T = x.token;
        return desteBoot();
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
function sql(pasta, q, p = []) {
  return new Promise((res, rej) => {
    const b = new sqlite3.Database(path.join(pasta, 'database.sqlite'));
    b.configure('busyTimeout', 15000);
    const metodo = /^\s*(select|pragma)/i.test(q) ? 'all' : 'run';
    b[metodo](q, p, function feito(e, rows) { const r = metodo === 'all' ? rows : this; b.close(() => (e ? rej(e) : res(r))); });
  });
}
async function aguardar(cond, ms = 3000) {
  const fim = Date.now() + ms;
  for (;;) {
    const v = await cond();
    if (v || Date.now() > fim) return v;
    await pausa(50);
  }
}
// os erros que esta feature produziria no boot (Fase 2 M-mig-1): tabela/coluna ausente, e a ALTER mal tratada das colunas novas
function errosDoBoot(log) {
  return log.split(/\r?\n/).filter((l) => /no such table|no column named|no such column/i.test(l)
    || (/geo_(lat|lon|termo)/.test(l) && /erro|error|duplicate/i.test(l)));
}
const colunas = async (pasta) => (await sql(pasta, 'PRAGMA table_info(clientes)')).map((c) => `${c.name}:${c.type}`);

// O CREATE de `clientes` de antes da Etapa 158 (index.js:1234 em 99781bd0) — o banco antigo nasce com ele, sem logo_url (Fase 2 M-mig-3)
const CREATE_ANTIGO = `CREATE TABLE IF NOT EXISTS clientes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    razao_social TEXT NOT NULL,
    nome_fantasia TEXT,
    cnpj TEXT,
    segmento TEXT,
    telefone TEXT,
    email TEXT,
    endereco TEXT,
    cidade TEXT,
    estado TEXT,
    cep TEXT,
    contato_principal TEXT,
    observacoes TEXT,
    status TEXT DEFAULT 'ativo',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`;
const ANTIGO = {
  id: 77, razao_social: 'CLIENTE ANTIGO 158', nome_fantasia: 'ANTIGO', cnpj: '12.345.678/0001-58', segmento: 'INDUSTRIA', telefone: '11 1580-1580',
  email: 'antigo158@t.com', endereco: 'RUA VELHA 1', cidade: 'CAMPINAS', estado: 'SP', cep: '13000-158', contato_principal: 'FULANO',
  observacoes: 'DE ANTES', status: 'ativo', created_at: '2001-02-03 04:05:06', updated_at: '2001-02-03 04:05:06',
};
const ctx = {};

test('[RN-158.04] primeiro boot numa pasta vazia: as tres colunas no PRAGMA, nenhum erro de tabela/coluna no log; a rota responde e grava', async () => {
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'e158-vazia-'));
  ctx.pastas.push(pasta);
  const log = await subir(pasta);
  try {
    const cols = await colunas(pasta);
    for (const c of ['geo_lat:REAL', 'geo_lon:REAL', 'geo_termo:TEXT', 'logo_url:TEXT', 'endereco:TEXT']) assert.ok(cols.includes(c), `faltou ${c}: ${cols.join(', ')}`);
    assert.deepStrictEqual(errosDoBoot(log), []);
    const [sc, c] = await j('POST', '/clientes', { razao_social: 'Novo 158', cidade: 'Campinas', estado: 'SP', endereco: 'Rua Nova 1' });
    assert.strictEqual(sc, 200, JSON.stringify(c));
    fronteira.pedidos = []; fronteira.lat = '-22.1'; fronteira.lon = '-47.1';
    const [s, x] = await j('GET', `/custos-viagens/coordenadas-cliente/${c.id}`);
    assert.deepStrictEqual([s, x], [200, { coordenadas: [-22.1, -47.1], lat: -22.1, lon: -47.1 }]);
    assert.strictEqual(fronteira.pedidos.length, 1);
    assert.ok(await aguardar(async () => (await sql(pasta, 'SELECT geo_termo FROM clientes WHERE id = ?', [c.id]))[0].geo_termo === 'RUA NOVA 1, CAMPINAS, SP, Brasil'), 'nao gravou');
  } finally { await descer(); }
});

test('[RN-158.04] boot sobre um banco antigo (clientes sem as colunas, com um cliente com endereco): as colunas entram, o cliente intacto, a rota responde e grava', async () => {
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'e158-antigo-'));
  ctx.pastas.push(pasta);
  ctx.antigo = pasta;
  await sql(pasta, CREATE_ANTIGO);
  const nomes = Object.keys(ANTIGO);
  await sql(pasta, `INSERT INTO clientes (${nomes.join(', ')}) VALUES (${nomes.map(() => '?').join(', ')})`, nomes.map((k) => ANTIGO[k]));
  const colsAntes = await colunas(pasta);
  assert.ok(!colsAntes.some((c) => /^geo_|^logo_url/.test(c)), `o banco antigo ja tinha as colunas: ${colsAntes.join(', ')}`);
  const log = await subir(pasta);
  try {
    const cols = await colunas(pasta);
    for (const c of ['geo_lat:REAL', 'geo_lon:REAL', 'geo_termo:TEXT', 'logo_url:TEXT']) assert.ok(cols.includes(c), `faltou ${c}: ${cols.join(', ')}`);
    assert.deepStrictEqual(errosDoBoot(log), []);
    const linha = (await sql(pasta, 'SELECT * FROM clientes WHERE id = 77'))[0];
    for (const k of nomes) assert.strictEqual(linha[k], ANTIGO[k], `o cliente antigo mudou em ${k}`);
    assert.deepStrictEqual([linha.geo_lat, linha.geo_lon, linha.geo_termo], [null, null, null]);
    fronteira.pedidos = []; fronteira.lat = '-22.2'; fronteira.lon = '-47.2';
    const [s, x] = await j('GET', '/custos-viagens/coordenadas-cliente/77');
    assert.deepStrictEqual([s, x], [200, { coordenadas: [-22.2, -47.2], lat: -22.2, lon: -47.2 }]);
    assert.strictEqual(fronteira.pedidos.length, 1);
    assert.strictEqual(fronteira.pedidos[0].q, 'RUA VELHA 1, CAMPINAS, SP, Brasil');
    const m = await aguardar(async () => { const r = (await sql(pasta, 'SELECT geo_lat, geo_lon, geo_termo, updated_at FROM clientes WHERE id = 77'))[0]; return r.geo_termo ? r : null; });
    assert.deepStrictEqual(m, { geo_lat: -22.2, geo_lon: -47.2, geo_termo: 'RUA VELHA 1, CAMPINAS, SP, Brasil', updated_at: ANTIGO.updated_at });
  } finally { await descer(); }
});

test('[RN-158.04] o segundo boot na mesma pasta: log limpo, a memoria ainda la e a abertura nao consulta', async () => {
  assert.ok(ctx.antigo, 'o cenario do banco antigo nao rodou');
  const log = await subir(ctx.antigo);
  try {
    assert.deepStrictEqual(errosDoBoot(log), []);
    assert.ok(/Banco de dados totalmente inicializado/.test(log), 'o trecho do log nao e deste boot');
    fronteira.pedidos = []; fronteira.lat = '-1'; fronteira.lon = '-1';
    const [s, x] = await j('GET', '/custos-viagens/coordenadas-cliente/77');
    assert.deepStrictEqual([s, x.coordenadas], [200, [-22.2, -47.2]]);
    assert.strictEqual(fronteira.pedidos.length, 0, 'depois do reboot a memoria nao valeu');
  } finally { await descer(); }
});

test('[RN-158.01, Fase 2 I2] o UPDATE da memoria falha: 200 com a coordenada do servico, o processo segue, nada gravado, o erro no log; a seguinte consulta de novo', async () => {
  assert.ok(ctx.antigo, 'o cenario do banco antigo nao rodou');
  // o endereco muda por fora, com o servidor parado: a proxima abertura tem de consultar e gravar
  await sql(ctx.antigo, "UPDATE clientes SET endereco = 'RUA NOVA 9' WHERE id = 77");
  await subir(ctx.antigo, { FALHA_SQL_INJETADA: 'UPDATE clientes SET geo_lat' });
  try {
    fronteira.pedidos = []; fronteira.lat = '-22.3'; fronteira.lon = '-47.3';
    const [s, x] = await j('GET', '/custos-viagens/coordenadas-cliente/77');
    assert.deepStrictEqual([s, x], [200, { coordenadas: [-22.3, -47.3], lat: -22.3, lon: -47.3 }], 'a falha ao gravar mudou a resposta');
    assert.strictEqual(fronteira.pedidos.length, 1);
    await pausa(800);
    assert.strictEqual(saiu, null, 'a falha ao gravar a memoria derrubou o index.js');
    const [sl, lista] = await j('GET', '/clientes');
    assert.ok(sl === 200 && lista.some((c) => c.id === 77), `o servidor nao responde depois da falha: ${sl}`);
    const r = (await sql(ctx.antigo, 'SELECT geo_lat, geo_lon, geo_termo FROM clientes WHERE id = 77'))[0];
    assert.deepStrictEqual(r, { geo_lat: -22.2, geo_lon: -47.2, geo_termo: 'RUA VELHA 1, CAMPINAS, SP, Brasil' }, 'a falha gravou');
    const log = fs.readFileSync(logAtual, 'utf8');
    assert.ok(/\[falha injetada\] UPDATE clientes SET geo_lat/.test(log), 'a falha nao foi injetada (o teste nao provaria nada)');
    assert.ok(/\[coordenadas\] nao gravou a coordenada do cliente 77: falha injetada pelo teste/.test(log), 'o erro nao foi para o log');
    const [s2, x2] = await j('GET', '/custos-viagens/coordenadas-cliente/77');
    assert.deepStrictEqual([s2, x2.coordenadas], [200, [-22.3, -47.3]]);
    assert.strictEqual(fronteira.pedidos.length, 2, 'a abertura seguinte a falha nao consultou');
  } finally { await descer(); }
});

test('[RN-158.04, Fase 2 M2, Fase 5 r3 R18/R21] as ALTERs da coordenada falham: o erro de cada coluna no log; a rota responde pelo servico, sem memoria (nao 500)', async () => {
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'e158-alterfalha-'));
  ctx.pastas.push(pasta);
  const log = await subir(pasta, { FALHA_SQL_INJETADA: 'ALTER TABLE clientes ADD COLUMN geo' });
  try {
    for (const c of ['geo_lat', 'geo_lon', 'geo_termo']) {
      assert.ok(new RegExp(`Erro ao adicionar coluna ${c} em clientes: falha injetada pelo teste`).test(log), `a falha da coluna ${c} nao foi para o log`);
    }
    assert.ok(!(await colunas(pasta)).some((c) => /^geo_/.test(c)), 'a falha nao foi injetada (as colunas existem)');
    const [sc, c] = await j('POST', '/clientes', { razao_social: 'Sem Memoria 158', cidade: 'Campinas', estado: 'SP', endereco: 'Rua A 1' });
    assert.strictEqual(sc, 200, JSON.stringify(c));
    fronteira.pedidos = []; fronteira.lat = '-22.7'; fronteira.lon = '-47.7';
    const [s, x] = await j('GET', `/custos-viagens/coordenadas-cliente/${c.id}`);
    assert.deepStrictEqual([s, x], [200, { coordenadas: [-22.7, -47.7], lat: -22.7, lon: -47.7 }]);
    const [s2] = await j('GET', `/custos-viagens/coordenadas-cliente/${c.id}`);
    assert.strictEqual(s2, 200);
    assert.strictEqual(fronteira.pedidos.length, 2, 'sem as colunas, a segunda abertura tambem consulta');
    await pausa(300);
    assert.strictEqual(saiu, null, 'o UPDATE sem as colunas derrubou o index.js');
  } finally { await descer(); }
});

test('[RN-158.03, Fase 5 r1 M3] a leitura do cliente falha: o 500 literal da rota e nenhum pedido ao servico de mapas', async () => {
  assert.ok(ctx.antigo, 'o cenario do banco antigo nao rodou');
  await subir(ctx.antigo, { FALHA_SQL_INJETADA: '^SELECT \\* FROM clientes WHERE id = \\?$', FALHA_SQL_METODOS: 'get' });
  try {
    fronteira.pedidos = [];
    const [s, x] = await j('GET', '/custos-viagens/coordenadas-cliente/77');
    assert.deepStrictEqual([s, x], [500, { error: 'falha injetada pelo teste' }]);
    assert.strictEqual(fronteira.pedidos.length, 0);
    assert.ok(/\[falha injetada\] SELECT \* FROM clientes WHERE id/.test(fs.readFileSync(logAtual, 'utf8')), 'a falha nao foi injetada');
    // a metade positiva: outra leitura de clientes (a lista) responde
    const [sl, lista] = await j('GET', '/clientes');
    assert.ok(sl === 200 && lista.some((c) => c.id === 77), `${sl}`);
  } finally { await descer(); }
});

(async () => {
  console.log('\n=== Etapa 158: a migracao da coordenada guardada e o erro ao grava-la (C377) ===\n');
  ctx.pastas = [];
  try {
    await new Promise((r) => servidorDeMapas.listen(0, '127.0.0.1', r));
    urlDaFronteira = `http://127.0.0.1:${servidorDeMapas.address().port}/search`;
    for (const [name, fn] of testes) {
      try { await fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) {
        failed++; console.error(`  ✗ ${name}: ${String(e.message).replace(/\s*\n\s*/g, ' ').slice(0, 900)}`);
        await descer();
      }
    }
  } catch (e) { failed++; console.error('  ✗ preparo:', e.message); }
  await descer();
  for (const s of sockets) s.destroy();
  await new Promise((r) => servidorDeMapas.close(() => r()));
  for (const p of ctx.pastas) { try { fs.rmSync(p, { recursive: true, force: true }); } catch (e) { /* windows segura o arquivo */ } }
  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
})();
