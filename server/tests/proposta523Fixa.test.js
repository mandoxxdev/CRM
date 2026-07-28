/**
 * A seção 5.23 (preço + FINAME + fiscais) deve renderizar TAMBÉM no caminho
 * de cláusulas customizadas/inline (não só no hardcoded).
 * Executar: node tests/proposta523Fixa.test.js
 */
const assert = require('assert');
const { gerarHTMLPropostaPremiumV2 } = require('../templates/propostaPremiumV2');
const { getClausulasDefault } = require('../clausulasDefault');

let passed = 0, failed = 0;
function test(name, fn) { try { fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { failed++; console.error(`  ✗ ${name}: ${e.message}`); } }

const proposta = { numero_proposta: '01/R00', titulo: 'T', razao_social: 'X', cnpj: '1', cliente_email: 'a@b.c' };
const itens = [{ produto_nome: 'Masseira', quantidade: 1, unidade: 'UN', valor_unitario: 1000, valor_total: 1000 }];
const totais = { total: 1000, dataEmissao: '21/07/2026' };
const custom = getClausulasDefault().map(c => ({ numero: c.numero, titulo: c.titulo, conteudo: c.conteudo }));

test('caminho custom/inline contém a 5.24 PREÇO', () => {
  const html = gerarHTMLPropostaPremiumV2(proposta, itens, totais, { clausulas_custom: custom }, null, false, true);
  assert(html.includes('5.24 PREÇO'), 'faltou título 5.24 no caminho custom');
});
test('caminho custom/inline contém a tabela FINAME/BNDES', () => {
  const html = gerarHTMLPropostaPremiumV2(proposta, itens, totais, { clausulas_custom: custom }, null, false, true);
  assert(html.includes('Ref. FINAME') && html.includes('04051088'), 'faltou tabela FINAME no caminho custom');
});
test('caminho custom/inline contém a tabela de preços com o total', () => {
  const html = gerarHTMLPropostaPremiumV2(proposta, itens, totais, { clausulas_custom: custom }, null, false, true);
  assert(html.includes('TOTAL DA PROPOSTA'), 'faltou tabela de preços no caminho custom');
});
test('caminho hardcoded (sem custom) mantém a 5.24', () => {
  const html = gerarHTMLPropostaPremiumV2(proposta, itens, totais, null, null, false, true);
  assert(html.includes('5.24 PREÇO'), 'regrediu a 5.24 no hardcoded');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
