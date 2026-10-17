/**
 * Etapa 138 (nucleo/propostas) — o montador do `SET` parcial dos `PUT` (`server/atualizacaoParcial.js`), pelo servico.
 *
 *   RN-12 (servico) a chave AUSENTE nao entra no comando (a coluna fica intacta); a PRESENTE entra com a transformacao do mapa — inclusive
 *         `null` e `""` (presente vazio limpa, como hoje). A ordem e a do mapa; chave fora do mapa e ignorada.
 *
 * Plano: docs/superpowers/plans/2026-10-17-almoxarifado-etapa138-payload-parcial-nos-put.md
 * Executar: cd server && node tests/api/atualizacaoParcial.api.test.js
 */
const assert = require('assert');
const { presente, montarSetParcial } = require('../../atualizacaoParcial');

let passed = 0; let failed = 0;
function test(nome, fn) {
  try { fn(); passed++; console.log(`  ✓ ${nome}`); } catch (e) { failed++; console.error(`  ✗ ${nome}: ${e.message}`); }
}
const up = (v) => (v == null ? v : String(v).toUpperCase());
const MAPA = { razao_social: up, telefone: (v) => v, logo_url: (v) => v || null };

console.log('\n=== Etapa 138: montarSetParcial (ausente mantem, presente grava) ===\n');

test('[RN-12] presente: a chave no corpo, inclusive com null e ""; ausente: a chave fora ou undefined', () => {
  assert.strictEqual(presente({ a: 1 }, 'a'), true);
  assert.strictEqual(presente({ a: null }, 'a'), true);
  assert.strictEqual(presente({ a: '' }, 'a'), true);
  assert.strictEqual(presente({ a: 0 }, 'a'), true);
  assert.strictEqual(presente({}, 'a'), false);
  assert.strictEqual(presente({ a: undefined }, 'a'), false);
  assert.strictEqual(presente(null, 'a'), false);
  assert.strictEqual(presente(undefined, 'a'), false);
  assert.strictEqual(presente(Object.create({ a: 1 }), 'a'), false, 'herdada nao conta');
});

test('[RN-12] so a chave presente entra, transformada; a ausente nao aparece no comando', () => {
  const r = montarSetParcial({ telefone: '2299' }, MAPA);
  assert.deepStrictEqual(r.colunas, ['telefone']);
  assert.deepStrictEqual(r.params, ['2299']);
  assert.strictEqual(r.sql, 'telefone = ?');
});

test('[RN-12] presente vazio e nulo entram (limpam), pela transformacao do mapa', () => {
  const r = montarSetParcial({ telefone: '', logo_url: '', razao_social: null }, MAPA);
  assert.deepStrictEqual(r.colunas, ['razao_social', 'telefone', 'logo_url'], 'na ordem do mapa');
  assert.deepStrictEqual(r.params, [null, '', null]);
  assert.strictEqual(r.sql, 'razao_social = ?, telefone = ?, logo_url = ?');
});

test('[RN-12] a transformacao roda (maiusculas) e chave fora do mapa e ignorada', () => {
  const r = montarSetParcial({ razao_social: 'acme', id: 9, created_at: 'x', 'x = 1; --': 1 }, MAPA);
  assert.deepStrictEqual(r.colunas, ['razao_social']);
  assert.deepStrictEqual(r.params, ['ACME']);
});

test('[RN-12] corpo vazio ou ausente: nada entra', () => {
  for (const c of [{}, null, undefined]) {
    const r = montarSetParcial(c, MAPA);
    assert.deepStrictEqual([r.colunas, r.params, r.sql], [[], [], '']);
  }
});

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
