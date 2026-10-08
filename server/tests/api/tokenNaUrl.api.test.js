/**
 * Etapa 84 — o login deixa de aceitar o JWT na URL (`?token=`).
 *
 * Teste de funcao pura + fiacao por FONTE: `server/index.js` abre banco em disco e faz `listen`
 * no import, entao nao ha harness HTTP do core (mesmo precedente de backupExposicao.api.test.js).
 * A prova HTTP real (servidor em CRM_DATA_DIR vazio) esta registrada no plano da etapa.
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

// ── Fiacao por fonte ─────────────────────────────────────────────────────────────────

const fonte = fs.readFileSync(path.join(__dirname, '..', '..', 'index.js'), 'utf8');
const inicio = fonte.indexOf('function authenticateToken(');
const fim = fonte.indexOf('\nfunction ', inicio + 1);
const corpo = inicio >= 0 && fim > inicio ? fonte.slice(inicio, fim) : '';

test('authenticateToken foi encontrado na fonte (regua nao e vazia)', () => {
  assert.ok(corpo.length > 100, 'corpo de authenticateToken nao encontrado em index.js');
  assert.ok(/jwt\.verify\(/.test(corpo), 'recorte nao contem jwt.verify — recorte errado');
});

test('authenticateToken chama tokenDaRequisicao(req)', () => {
  assert.ok(/tokenDaRequisicao\(req\)/.test(corpo), 'authenticateToken nao usa tokenDaRequisicao');
});

test('authenticateToken nao le req.query.token (RN-84.01)', () => {
  assert.ok(!/req\.query/.test(corpo), 'authenticateToken ainda le req.query');
});

test('authenticateToken responde TOKEN_NA_URL com ERRO_TOKEN_NA_URL e avisa sem query string', () => {
  assert.ok(/TOKEN_NA_URL/.test(corpo), 'sem ramo TOKEN_NA_URL');
  assert.ok(/ERRO_TOKEN_NA_URL/.test(corpo), 'nao usa o corpo literal exportado');
  assert.ok(/console\.warn\([^)]*req\.method[^)]*req\.path/.test(corpo), 'aviso sem metodo e req.path');
  assert.ok(!/req\.(originalUrl|url)\b/.test(corpo), 'aviso usa URL com query string (vazaria o token)');
});

console.log(`\ntokenNaUrl: ${passed} passaram, ${failed} falharam`);
process.exit(failed ? 1 : 0);
