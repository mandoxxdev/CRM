/**
 * Apagar libera o nome (25/11/2026: "quando eu apago um item, ele parece ser um remove soft, dai nao consigo cadastrar outras coisas com o
 * mesmo nome... uma hora ou outra vou ter que apagar algo"). Apagar continua sendo exclusao logica (historico e vinculos guardados).
 *
 *   AL-01 familia apagada + cadastro com o mesmo nome: reativa (o de antes, continua)
 *   AL-02 familia apagada + RENOMEAR outra para o nome dela: passa; a apagada vira "<nome> [apagada #id]" (antes: 400)
 *   AL-03 familia apagada + CLONAR com o nome dela: passa (antes: "Ja existe uma familia INATIVA com este nome")
 *   AL-04 produto apagado + cadastro com o mesmo CODIGO: reaproveita a linha (mesmo id, dados novos, ativo) (antes: "Codigo ja cadastrado");
 *         com o produto ATIVO, continua recusando
 *
 * Executar: cd server && node tests/api/apagarLiberaNome.api.test.js
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
const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'apagar-libera-'));
const SEED = { email: 'alseed@t.com', senha: 'AlSeed!senha123' };
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
const familia = async (nome) => (await req('POST', '/familias', token, { nome })).json;

test('AL-01 familia apagada + cadastro com o mesmo nome: reativa', async () => {
  token = await subir();
  arquivo = new sqlite3.Database(path.join(pasta, 'database.sqlite'));
  arquivo.configure('busyTimeout', 15000);
  const f = await familia('MOINHO AL1');
  assert.ok(f && f.id, JSON.stringify(f));
  assert.strictEqual((await req('DELETE', `/familias/${f.id}`, token)).status, 200);
  const r = await req('POST', '/familias', token, { nome: 'MOINHO AL1' });
  assert.strictEqual(r.status, 200, JSON.stringify(r.json));
  assert.strictEqual(r.json.id, f.id);
  assert.strictEqual(r.json.reativada, true);
});

test('AL-02 renomear para o nome de uma familia apagada: passa; a apagada guarda o nome marcado', async () => {
  const apagada = await familia('DISPERSOR AL2');
  await req('DELETE', `/familias/${apagada.id}`, token);
  const outra = await familia('OUTRA AL2');
  const r = await req('PUT', `/familias/${outra.id}`, token, { nome: 'DISPERSOR AL2' });
  assert.strictEqual(r.status, 200, JSON.stringify(r.json));
  assert.strictEqual(r.json.nome, 'DISPERSOR AL2');
  const [linha] = await all('SELECT nome, ativo FROM familias_produto WHERE id = ?', [apagada.id]);
  assert.deepStrictEqual(linha, { nome: `DISPERSOR AL2 [apagada #${apagada.id}]`, ativo: 0 });
});

test('AL-03 clonar com o nome de uma familia apagada: passa', async () => {
  const apagada = await familia('TACHO AL3');
  await req('DELETE', `/familias/${apagada.id}`, token);
  const origem = await familia('ORIGEM AL3');
  const r = await req('POST', `/familias/${origem.id}/clonar`, token, { nome: 'TACHO AL3' });
  assert.strictEqual(r.status, 200, JSON.stringify(r.json));
  const ativas = await all("SELECT id FROM familias_produto WHERE nome = 'TACHO AL3' AND ativo = 1");
  assert.strictEqual(ativas.length, 1, 'o clone ficou com o nome');
  assert.notStrictEqual(ativas[0].id, apagada.id, 'e uma familia nova (o clone), nao a apagada');
});

test('AL-04 produto apagado + cadastro com o mesmo codigo: reaproveita; ativo continua recusando', async () => {
  const p = await req('POST', '/produtos', token, { codigo: 'AL-P-1', nome: 'Produto antigo', familia: 'MOINHO AL1' });
  assert.strictEqual(p.status, 200, JSON.stringify(p.json));
  assert.strictEqual((await req('DELETE', `/produtos/${p.json.id}`, token)).status, 200);
  const r = await req('POST', '/produtos', token, { codigo: 'AL-P-1', nome: 'Produto novo', familia: 'MOINHO AL1', preco_base: 99 });
  assert.strictEqual(r.status, 200, JSON.stringify(r.json));
  assert.strictEqual(r.json.id, p.json.id, 'a mesma linha (as propostas ligam pelo codigo)');
  assert.strictEqual(r.json.reativado, true);
  const [linha] = await all('SELECT nome, ativo, preco_base FROM produtos WHERE id = ?', [p.json.id]);
  assert.deepStrictEqual(linha, { nome: 'PRODUTO NOVO', ativo: 1, preco_base: 99 });
  const dup = await req('POST', '/produtos', token, { codigo: 'AL-P-1', nome: 'Outro' });
  assert.strictEqual(dup.status, 400, 'com o produto ativo, o codigo continua ocupado');
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
