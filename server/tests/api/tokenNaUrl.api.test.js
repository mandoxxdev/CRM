/**
 * Etapa 84 — o login deixa de aceitar o JWT na URL (`?token=`).
 *
 * Funcao pura + o middleware de verdade (fabrica `services/authenticateToken.js` num mini-app
 * express + supertest; o `index.js` abre banco e faz `listen` no import, por isso a fabrica) + uma
 * checagem curta de fonte de que o index.js usa a fabrica. A prova HTTP real (servidor em
 * CRM_DATA_DIR vazio) esta registrada no plano da etapa.
 *
 *   RN-84.01 `authenticateToken` le so `Authorization: Bearer` e `X-Auth-Token`.
 *   RN-84.02 so `?token=` -> motivo TOKEN_NA_URL (401 com corpo literal, aviso sem query string).
 *   RN-84.03 header + `?token=` -> o header manda.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const { tokenDaRequisicao, ERRO_TOKEN_NA_URL } = require('../../services/tokenDaRequisicao');

let passed = 0; let failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { failed++; console.error(`  ✗ ${name}: ${e.message}`); }
}

const req = (headers = {}, query = {}) => ({ headers, query });

// ── Funcao pura ──────────────────────────────────────────────────────────────────────

test('Authorization: Bearer -> token, sem motivo', () => {
  assert.deepStrictEqual(tokenDaRequisicao(req({ authorization: 'Bearer abc.def' })), { token: 'abc.def', motivo: null });
});

test('X-Auth-Token -> token, sem motivo', () => {
  assert.deepStrictEqual(tokenDaRequisicao(req({ 'x-auth-token': 'xyz' })), { token: 'xyz', motivo: null });
});

test('Bearer vence X-Auth-Token (ordem de antes)', () => {
  assert.strictEqual(tokenDaRequisicao(req({ authorization: 'Bearer A', 'x-auth-token': 'B' })).token, 'A');
});

test('so ?token= -> sem token e motivo TOKEN_NA_URL (RN-84.02)', () => {
  assert.deepStrictEqual(tokenDaRequisicao(req({}, { token: 'jwt.na.url' })), { token: null, motivo: 'TOKEN_NA_URL' });
});

test('header + ?token= -> o header manda, a query e ignorada (RN-84.03)', () => {
  assert.deepStrictEqual(
    tokenDaRequisicao(req({ authorization: 'Bearer DO.HEADER' }, { token: 'DA.URL' })),
    { token: 'DO.HEADER', motivo: null },
  );
  assert.deepStrictEqual(
    tokenDaRequisicao(req({ 'x-auth-token': 'DO.HEADER' }, { token: 'DA.URL' })),
    { token: 'DO.HEADER', motivo: null },
  );
});

test('nada -> motivo NO_TOKEN', () => {
  assert.deepStrictEqual(tokenDaRequisicao(req()), { token: null, motivo: 'NO_TOKEN' });
});

test('req sem query/headers nao quebra -> NO_TOKEN', () => {
  assert.deepStrictEqual(tokenDaRequisicao({}), { token: null, motivo: 'NO_TOKEN' });
});

test('?token= vazio nao conta como token na URL -> NO_TOKEN', () => {
  assert.strictEqual(tokenDaRequisicao(req({}, { token: '' })).motivo, 'NO_TOKEN');
});

test('corpo do 401 e literal', () => {
  assert.deepStrictEqual(ERRO_TOKEN_NA_URL, { error: 'Envie o token no cabeçalho Authorization', code: 'TOKEN_NA_URL' });
});

// ── Middleware de verdade: mini-app express + supertest ─────────────────────────────────
// A regua por fonte que estava aqui deixava passar tres mutacoes (revisao adversarial da 84):
// `const { query: q } = req` + `jwt.verify(q.token ...)`; NO_TOKEN checado antes do ramo
// TOKEN_NA_URL; e `res.status(200).json(ERRO_TOKEN_NA_URL)`. Aqui o middleware roda de verdade.

const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const { criarAuthenticateToken } = require('../../services/authenticateToken');

const SEGREDO = 'segredo-de-teste-c84';
const valido = jwt.sign({ id: 42, email: 'x@y.z' }, SEGREDO, { expiresIn: '1h' });
const invalido = jwt.sign({ id: 42 }, 'outro-segredo');

let enrichChamadas = 0;
const app = express();
app.get('/api/eco', criarAuthenticateToken({
  jwtSecret: SEGREDO,
  enrich: (req, res, next) => { enrichChamadas++; req.user.enriquecido = true; next(); },
}), (req, res) => res.json({ ok: true, user: req.user }));

const avisos = [];
const warnOriginal = console.warn;
function capturandoAvisos() { avisos.length = 0; console.warn = (...a) => avisos.push(a.join(' ')); }
function soltaAvisos() { console.warn = warnOriginal; }

const testesHttp = [];
function testHttp(name, fn) { testesHttp.push([name, fn]); }

testHttp('Bearer valido -> 200, req.user do JWT e enrich chamado', async () => {
  const antes = enrichChamadas;
  const r = await request(app).get('/api/eco').set('Authorization', `Bearer ${valido}`);
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.user.id, 42);
  assert.strictEqual(r.body.user.enriquecido, true);
  assert.strictEqual(enrichChamadas, antes + 1, 'enrich nao foi chamado uma vez');
});

testHttp('X-Auth-Token valido -> 200', async () => {
  const r = await request(app).get('/api/eco').set('X-Auth-Token', valido);
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.user.id, 42);
});

testHttp('so ?token=<valido> -> 401 com corpo literal, enrich NAO chamado, 1 aviso sem o token (RN-84.02)', async () => {
  const antes = enrichChamadas;
  capturandoAvisos();
  let r;
  try { r = await request(app).get(`/api/eco?token=${valido}`); } finally { soltaAvisos(); }
  assert.strictEqual(r.status, 401);
  assert.deepStrictEqual(r.body, { error: 'Envie o token no cabeçalho Authorization', code: 'TOKEN_NA_URL' });
  assert.strictEqual(enrichChamadas, antes, 'a query autenticou');
  assert.strictEqual(avisos.length, 1, `esperava 1 aviso, veio ${avisos.length}`);
  assert.ok(avisos[0].includes('GET') && avisos[0].includes('/api/eco'), `aviso sem metodo/caminho: ${avisos[0]}`);
  assert.ok(!avisos[0].includes(valido) && !avisos[0].includes('token='), 'o aviso vazou o token');
});

testHttp('Bearer valido + ?token=lixo -> 200 (o header manda, RN-84.03)', async () => {
  const r = await request(app).get('/api/eco?token=lixo').set('Authorization', `Bearer ${valido}`);
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.user.id, 42);
});

testHttp('nada -> 401 NO_TOKEN', async () => {
  const r = await request(app).get('/api/eco');
  assert.strictEqual(r.status, 401);
  assert.deepStrictEqual(r.body, { error: 'Token não fornecido', code: 'NO_TOKEN' });
});

testHttp('Bearer invalido -> 401 Token inválido ou expirado', async () => {
  const r = await request(app).get('/api/eco').set('Authorization', `Bearer ${invalido}`);
  assert.strictEqual(r.status, 401);
  assert.deepStrictEqual(r.body, { error: 'Token inválido ou expirado' });
});

// ── Fiacao por fonte (curta): o index.js usa a fabrica, nao uma copia propria ───────────

const fonte = fs.readFileSync(path.join(__dirname, '..', '..', 'index.js'), 'utf8');

test('index.js monta authenticateToken com criarAuthenticateToken (JWT_SECRET + enrichUserFromDb(db))', () => {
  assert.ok(/const authenticateToken = criarAuthenticateToken\(\{\s*jwtSecret: JWT_SECRET,\s*enrich: \(req, res, next\) => enrichUserFromDb\(db\)\(req, res, next\),\s*\}\);/.test(fonte),
    'authenticateToken do index.js nao vem da fabrica');
  assert.ok(!/function authenticateToken\(/.test(fonte), 'index.js voltou a ter um authenticateToken proprio');
});

(async () => {
  for (const [name, fn] of testesHttp) {
    try { await fn(); passed++; console.log(`  ✓ ${name}`); }
    catch (e) { failed++; console.error(`  ✗ ${name}: ${e.message}`); }
  }
  console.log(`\ntokenNaUrl: ${passed} passaram, ${failed} falharam`);
  process.exit(failed ? 1 : 0);
})();
