/**
 * Testa resolverClausulasParaPreview — decide o que o preview do editor usa como
 * seção 5 (clausulas ativas da proposta, ou os defaults quando ainda não customizada).
 * Executar: node tests/clausulasDefault.test.js
 */
const assert = require('assert');
const { resolverClausulasParaPreview, getClausulasDefault } = require('../clausulasDefault');

let passed = 0;
let failed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failed++;
    console.error(`  ✗ ${name}: ${e.message}`);
  }
}

test('retorna as clausulas ativas quando existem (independente de embedPreview)', () => {
  const ativas = [{ id: 1, titulo: '5.1 X', conteudo: 'Y' }];
  assert.strictEqual(resolverClausulasParaPreview(ativas, true), ativas);
  assert.strictEqual(resolverClausulasParaPreview(ativas, false), ativas);
});

test('sem clausulas ativas + embedPreview=true → retorna getClausulasDefault()', () => {
  const result = resolverClausulasParaPreview([], true);
  assert.deepStrictEqual(result, getClausulasDefault());
});

test('sem clausulas ativas + embedPreview=false → retorna null (mantém HTML fixo do template)', () => {
  assert.strictEqual(resolverClausulasParaPreview([], false), null);
});

test('trata lista ausente (null/undefined) como vazia', () => {
  assert.deepStrictEqual(resolverClausulasParaPreview(null, true), getClausulasDefault());
  assert.deepStrictEqual(resolverClausulasParaPreview(undefined, true), getClausulasDefault());
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
