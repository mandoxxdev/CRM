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

const jwt = require('jsonwebtoken');
const { tokenDoHandshake, criarAuthSocket } = require('../../services/chat/socket');

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

test('fiacao: io.use usa criarAuthSocket(jwtSecret) e e o unico io.use', () => {
  const fonte = fs.readFileSync(path.join(__dirname, '../../services/chat/socket.js'), 'utf8');
  const semComentarios = fonte.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  assert.ok(/io\.use\(criarAuthSocket\(jwtSecret\)\);/.test(semComentarios),
    'io.use tem de usar criarAuthSocket(jwtSecret)');
  assert.strictEqual((semComentarios.match(/io\.use\(/g) || []).length, 1, 'outro io.use poderia autenticar por outro caminho');
});

// ── Comportamento do middleware do io.use (sockets falsos) ──────────────────────────────
// A regua por fonte acima deixava passar `socket.handshake['query']` e `socket.request._query`;
// aqui o middleware roda de verdade com a query preenchida em todos os lugares onde o socket.io
// a guarda.

const SEGREDO = 'segredo-de-teste-c84-socket';
const authSocket = criarAuthSocket(SEGREDO);
const valido = jwt.sign({ id: 7, email: 'a@b.c' }, SEGREDO, { expiresIn: '1h' });

function socketFalso({ auth = {}, headers = {}, query = {} } = {}) {
  return { handshake: { auth, headers, query }, request: { _query: query, headers } };
}

function roda(socket) {
  return new Promise((resolve) => authSocket(socket, (err) => resolve(err || null)));
}

const testesAsync = [];
function testAsync(name, fn) { testesAsync.push([name, fn]); }

testAsync('token valido no auth -> next() sem erro e socket.user preenchido', async () => {
  const s = socketFalso({ auth: { token: valido } });
  const err = await roda(s);
  assert.strictEqual(err, null);
  assert.strictEqual(s.user && s.user.id, 7);
});

testAsync('token valido no header Bearer -> next() sem erro', async () => {
  const s = socketFalso({ headers: { authorization: `Bearer ${valido}` } });
  assert.strictEqual(await roda(s), null);
  assert.strictEqual(s.user.id, 7);
});

testAsync('token valido SO na query (handshake.query e request._query) -> Error Token não fornecido', async () => {
  const s = socketFalso({ query: { token: valido } });
  const err = await roda(s);
  assert.ok(err instanceof Error, 'deveria recusar');
  assert.strictEqual(err.message, 'Token não fornecido');
  assert.strictEqual(s.user, undefined, 'socket.user nao pode ser preenchido');
});

testAsync('token invalido no auth -> Error Token inválido', async () => {
  const s = socketFalso({ auth: { token: jwt.sign({ id: 7 }, 'outro-segredo') } });
  const err = await roda(s);
  assert.ok(err instanceof Error);
  assert.strictEqual(err.message, 'Token inválido');
  assert.strictEqual(s.user, undefined);
});

testAsync('nada -> Error Token não fornecido', async () => {
  const err = await roda(socketFalso());
  assert.strictEqual(err && err.message, 'Token não fornecido');
});

(async () => {
  for (const [name, fn] of testesAsync) {
    try { await fn(); passed++; console.log(`  ✓ ${name}`); }
    catch (e) { failed++; console.error(`  ✗ ${name}: ${e.message}`); }
  }
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
