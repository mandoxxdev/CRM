/**
 * Renomear uma família leva os produtos junto (pedido do Comercial, 24/11/2026: "mesmo com o projeto conceitual cadastrado no meu
 * sistema, não sobe para cá"). O produto liga à família pelo NOME (produtos.familia); o PUT /api/familias/:id mudava só a família e
 * o produto sumia do catálogo da proposta (GET /api/produtos?familia=).
 *
 *   FR-01 renomear: o produto aparece pelo nome NOVO e não pelo antigo; a resposta diz quantos produtos foram levados
 *   FR-02 o produto gravado com outra caixa/acento/espaço no nome antigo também vai (a régua do catálogo, agora sem acento de verdade)
 *   FR-03 produto de OUTRA família não muda; renomear só a caixa não mexe em nada
 *
 * Executar: node tests/api/familiaRenomeadaLevaProdutos.api.test.js
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
const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'familia-ren-'));
const SEED = { email: 'frseed@t.com', senha: 'FrSeed!senha123' };
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
  for (const k of ['NODE_ENV', 'NODE_OPTIONS', 'RUN_ALL_GUARDA_EXIT', 'PORT', 'CRM_DATA_DIR', 'JWT_SECRET', 'API_URL', 'SEED_ADMIN_EMAIL', 'SEED_ADMIN_PASSWORD', 'FALHA_SQL_INJETADA', 'RATE_LIMIT_WINDOW_MS']) delete env[k];
  Object.assign(env, { CRM_DATA_DIR: pasta, PORT: String(porta), SEED_ADMIN_EMAIL: SEED.email, SEED_ADMIN_PASSWORD: SEED.senha, RATE_LIMIT_MAX: '100000' });
  const out = fs.openSync(logArq, 'a');
  filho = spawn(process.execPath, ['-r', path.join(__dirname, '..', 'helpers', 'morreComOPai.js'), 'index.js'], { cwd: SERVER_DIR, env, stdio: ['pipe', out, out], windowsHide: true });
  filho.on('exit', (code) => { saiu = code; });
  const fim = Date.now() + 180000; // numa pasta do OneDrive a primeira subida passa de 60 s
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
const banco = (sql, p = []) => new Promise((res, rej) => {
  const cru = new sqlite3.Database(path.join(pasta, 'database.sqlite'));
  cru.configure('busyTimeout', 15000);
  cru.run(sql, p, function feito(e) { const r = this; cru.close(() => (e ? rej(e) : res(r))); });
});
const codigos = (lista) => (lista || []).map((p) => p.codigo).sort();

let token; let idFam;
test('FR-01/02 renomear a familia leva os produtos (inclusive o gravado com outra caixa e acento)', async () => {
  token = await subir();
  idFam = (await banco("INSERT INTO familias_produto (nome) VALUES ('PROJETO CONCEITUAL')")).lastID;
  await banco("INSERT INTO familias_produto (nome) VALUES ('MASSEIRAS')");
  await banco("INSERT INTO produtos (codigo, nome, familia, ativo) VALUES ('PCT-1', 'PROJETO CONCEITUAL', 'PROJETO CONCEITUAL', 1)");
  await banco("INSERT INTO produtos (codigo, nome, familia, ativo) VALUES ('PCT-2', 'PROJETO CONCEITUAL B', ' projeto  conceitual ', 1)");
  await banco("INSERT INTO produtos (codigo, nome, familia, ativo) VALUES ('MB-1', 'MASSEIRA', 'MASSEIRAS', 1)");
  const r = await req('PUT', `/familias/${idFam}`, token, { nome: 'PROJETO CONCEITUAL - TINTAS' });
  assert.strictEqual(r.status, 200, JSON.stringify(r.json));
  assert.strictEqual(r.json.produtos_renomeados, 2, 'a resposta diz quantos produtos foram levados');
  const novo = await req('GET', `/produtos?ativo=true&familia=${encodeURIComponent('PROJETO CONCEITUAL - TINTAS')}`, token);
  assert.deepStrictEqual(codigos(novo.json), ['PCT-1', 'PCT-2'], 'os produtos aparecem pelo nome novo');
  const antigo = await req('GET', `/produtos?ativo=true&familia=${encodeURIComponent('PROJETO CONCEITUAL')}`, token);
  assert.deepStrictEqual(codigos(antigo.json), [], 'e nao mais pelo antigo');
});

test('FR-03 produto de outra familia nao muda; renomear so a caixa nao mexe em produto', async () => {
  const m = await req('GET', '/produtos?ativo=true&familia=MASSEIRAS', token);
  assert.deepStrictEqual(codigos(m.json), ['MB-1']);
  const r = await req('PUT', `/familias/${idFam}`, token, { nome: 'Projeto Conceitual - Tintas' });
  assert.strictEqual(r.status, 200, JSON.stringify(r.json));
  assert.strictEqual(r.json.produtos_renomeados, 0);
});

test('FR-02 acento: a regua do catalogo casa "HELICES" com "Hélices" (o regex dos acentos estava sem colchetes)', async () => {
  await banco("INSERT INTO produtos (codigo, nome, familia, ativo) VALUES ('H-1', 'HELICE', 'HELICES E ACESSORIOS', 1)");
  const r = await req('GET', `/produtos?ativo=true&familia=${encodeURIComponent('Hélices e Acessórios')}`, token);
  assert.deepStrictEqual(codigos(r.json), ['H-1']);
});

(async () => {
  for (const [nome, fn] of testes) {
    try { await fn(); passed++; console.log('  ✓ ' + nome); } catch (e) { failed++; console.log('  ✗ ' + nome + '\n      ' + (e && e.message)); }
  }
  if (filho && saiu === null) { const morreu = new Promise((r) => filho.once('exit', r)); filho.kill(); await Promise.race([morreu, pausa(10000)]); }
  try { fs.rmSync(pasta, { recursive: true, force: true }); } catch (e) { /* windows segura o arquivo */ }
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
