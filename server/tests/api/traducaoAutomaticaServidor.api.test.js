/**
 * POST /api/traducoes/automatica — a proposta bilingue traduz NO SERVIDOR, em qualquer navegador (pedido de 24/11/2026: "erro na
 * traducao, deve funcionar em qualquer navegador"). O servico da internet e trocado por um servidor HTTP falso (TRADUTOR_WEB_URL).
 *
 *   TA-01 traduz em lote, na ordem, e manda ao servico sl=pt, o idioma e os textos (com as fichas intactas)
 *   TA-02 corpo invalido (idioma, lista vazia, texto acima de 5.000) = 400; sem login = 401
 *   TA-03 servico fora do ar = 502 com a mensagem para a tela, e o servidor continua de pe
 *
 * Executar: node tests/api/traducaoAutomaticaServidor.api.test.js
 */
const assert = require('assert');
const fs = require('fs');
const net = require('net');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const SERVER_DIR = path.join(__dirname, '..', '..');
const pausa = (ms) => new Promise((r) => setTimeout(r, ms));
let passed = 0; let failed = 0;
const testes = [];
function test(name, fn) { testes.push([name, fn]); }

let porta; let filho = null; let saiu = null;
const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'traducao-auto-'));
const SEED = { email: 'taseed@t.com', senha: 'TaSeed!senha123' };
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
  Object.assign(env, { TRADUTOR_WEB_URL: `http://127.0.0.1:${portaFalso}/t`, CRM_DATA_DIR: pasta, PORT: String(porta), SEED_ADMIN_EMAIL: SEED.email, SEED_ADMIN_PASSWORD: SEED.senha, RATE_LIMIT_MAX: '100000' });
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
// Servidor falso do tradutor: "traduz" pondo EN: na frente; com `falhar`, responde 503.
const http = require('http');
let portaFalso; let falhar = false; const pedidosFalso = [];
const falso = http.createServer((rq, rs) => {
  let dados = '';
  rq.on('data', (c) => { dados += c; });
  rq.on('end', () => {
    const q = new URLSearchParams(dados).getAll('q');
    pedidosFalso.push({ url: rq.url, q });
    if (falhar) { rs.writeHead(503); rs.end('fora'); return; }
    rs.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    rs.end(JSON.stringify(q.map((t) => `EN:${t}`)));
  });
});

let token;
test('TA-01 traduz em lote, na ordem, pelo servico configurado — fichas intactas', async () => {
  portaFalso = await new Promise((r) => falso.listen(0, '127.0.0.1', () => r(falso.address().port)));
  token = await subir();
  const r = await req('POST', '/traducoes/automatica', token, { idioma: 'es', textos: ['Garantia de 12 meses', 'A ⟦0⟧ pagará'] });
  assert.strictEqual(r.status, 200, JSON.stringify(r.json));
  assert.deepStrictEqual(r.json, { traducoes: ['EN:Garantia de 12 meses', 'EN:A ⟦0⟧ pagará'] });
  assert.strictEqual(pedidosFalso.length, 1);
  assert.match(pedidosFalso[0].url, /^\/t\?client=gtx&sl=pt&tl=es&format=text$/);
  assert.deepStrictEqual(pedidosFalso[0].q, ['Garantia de 12 meses', 'A ⟦0⟧ pagará']);
});

test('TA-02 corpo invalido = 400 sem chamar o servico; sem login = 401', async () => {
  const antes = pedidosFalso.length;
  for (const corpo of [{ idioma: 'fr', textos: ['a'] }, { idioma: 'en', textos: [] }, { idioma: 'en', textos: ['x'.repeat(5001)] },
    { idioma: 'en', textos: [' '] }, { idioma: 'en', textos: [3] }, { idioma: 'en' }]) {
    // eslint-disable-next-line no-await-in-loop
    const r = await req('POST', '/traducoes/automatica', token, corpo);
    assert.strictEqual(r.status, 400, JSON.stringify(corpo).slice(0, 60));
  }
  assert.strictEqual(pedidosFalso.length, antes, 'nenhum pedido invalido chega ao servico');
  const s = await req('POST', '/traducoes/automatica', null, { idioma: 'en', textos: ['a'] });
  assert.strictEqual(s.status, 401);
});

test('TA-03 servico fora do ar = 502 com mensagem para a tela; o servidor continua respondendo', async () => {
  falhar = true;
  const r = await req('POST', '/traducoes/automatica', token, { idioma: 'en', textos: ['Prazo'] });
  falhar = false;
  assert.strictEqual(r.status, 502);
  assert.match(r.json.error, /não respondeu agora/);
  const ok = await req('POST', '/traducoes/automatica', token, { idioma: 'en', textos: ['Prazo'] });
  assert.deepStrictEqual(ok.json, { traducoes: ['EN:Prazo'] });
});

(async () => {
  for (const [nome, fn] of testes) {
    try { await fn(); passed++; console.log('  ✓ ' + nome); } catch (e) { failed++; console.log('  ✗ ' + nome + '\n      ' + (e && e.message)); }
  }
  if (filho && saiu === null) { const morreu = new Promise((r) => filho.once('exit', r)); filho.kill(); await Promise.race([morreu, pausa(10000)]); }
  falso.close();
  try { fs.rmSync(pasta, { recursive: true, force: true }); } catch (e) { /* windows segura o arquivo */ }
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
