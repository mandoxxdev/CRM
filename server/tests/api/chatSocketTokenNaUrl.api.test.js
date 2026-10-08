/**
 * Etapa 84 / T2 — o socket do chat deixa de aceitar o JWT na query do handshake.
 *
 * O transporte polling do socket.io poe a query do handshake na URL (`/socket.io/?token=...`), entao
 * `socket.handshake.query.token` vazava o token em log de proxy do mesmo jeito que o `?token=` do
 * `authenticateToken` (T1). O client manda o token no `auth` do handshake
 * (`client/src/services/chatSocket.js:41`), entao o fallback de query nao tinha usuario.
 *
 *   RN-84.05 o socket le o token so de `handshake.auth.token` e do header `Authorization: Bearer`;
 *            so na query -> recusa (sem ler a query).
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const { tokenDoHandshake } = require('../../services/chat/socket');

let passed = 0; let failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { failed++; console.error(`  ✗ ${name}: ${e.message}`); }
}

test('auth.token -> token', () => {
  assert.strictEqual(tokenDoHandshake({ auth: { token: 'a.b.c' }, headers: {}, query: {} }), 'a.b.c');
});

test('header Authorization: Bearer -> token', () => {
  assert.strictEqual(tokenDoHandshake({ auth: {}, headers: { authorization: 'Bearer x.y.z' }, query: {} }), 'x.y.z');
});

test('so na query -> null (nao le a query)', () => {
  assert.strictEqual(tokenDoHandshake({ auth: {}, headers: {}, query: { token: 'q.q.q' } }), null);
});

test('auth + query -> o auth manda', () => {
  assert.strictEqual(tokenDoHandshake({ auth: { token: 'a.b.c' }, headers: {}, query: { token: 'q.q.q' } }), 'a.b.c');
});

test('handshake vazio/incompleto -> null sem lancar', () => {
  assert.strictEqual(tokenDoHandshake({}), null);
  assert.strictEqual(tokenDoHandshake(undefined), null);
});

test('fiacao: io.use usa tokenDoHandshake e o arquivo nao le handshake.query', () => {
  const fonte = fs.readFileSync(path.join(__dirname, '../../services/chat/socket.js'), 'utf8');
  const semComentarios = fonte.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  assert.ok(/io\.use\(\(socket, next\) => \{\s*const token = tokenDoHandshake\(socket\.handshake\);/.test(semComentarios),
    'io.use tem de obter o token por tokenDoHandshake(socket.handshake)');
  assert.ok(!/handshake\??\.query/.test(semComentarios), 'socket.js ainda le handshake.query');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
