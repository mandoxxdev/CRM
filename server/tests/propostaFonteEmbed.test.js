/**
 * Testa o embed das fontes Century Gothic via @font-face base64.
 * Executar: node tests/propostaFonteEmbed.test.js
 */
const assert = require('assert');
const { gerarHTMLPropostaPremiumV2 } = require('../templates/propostaPremiumV2');

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

const proposta = {
  numero_proposta: '01260508/R00',
  razao_social: 'Empresa Teste Ltda',
  cnpj: '12.345.678/0001-99',
  cliente_email: 'teste@exemplo.com.br',
  responsavel_nome: 'Fulano de Tal',
};
const itens = [{
  produto_nome: 'Equipamento Teste',
  quantidade: 1, unidade: 'UN', modelo: 'MOD-1',
  valor_unitario: 1000, valor_total: 1000,
}];
const totais = { subtotal: 1000, icms: 0, ipi: 0, total: 1000, dataEmissao: '01/01/2026', dataValidade: '15/01/2026' };

const html = gerarHTMLPropostaPremiumV2(proposta, itens, totais, null, null, false, true);

test('HTML contém @font-face', () => {
  assert.ok(html.includes('@font-face'), 'esperava encontrar @font-face no HTML');
});

test('HTML contém data:font/ttf;base64, (prova de embed)', () => {
  assert.ok(html.includes('data:font/ttf;base64,'), 'esperava encontrar data:font/ttf;base64, indicando que a fonte foi embutida');
});

test('HTML contém @font-face com font-family Century Gothic', () => {
  assert.ok(/font-family:\s*['"]Century Gothic['"]/.test(html), 'esperava encontrar font-family: "Century Gothic" em @font-face');
});

test('HTML contém @font-face para peso 400 normal', () => {
  assert.ok(/font-weight:\s*400;[^}]*font-style:\s*normal/.test(html) || /font-style:\s*normal[^}]*font-weight:\s*400/.test(html), 'esperava encontrar @font-face com font-weight: 400; font-style: normal');
});

test('HTML contém @font-face para peso 700 normal', () => {
  assert.ok(/font-weight:\s*700;[^}]*font-style:\s*normal/.test(html) || /font-style:\s*normal[^}]*font-weight:\s*700/.test(html), 'esperava encontrar @font-face com font-weight: 700; font-style: normal');
});

test('HTML contém @font-face para peso 400 italic', () => {
  assert.ok(/font-weight:\s*400;[^}]*font-style:\s*italic/.test(html) || /font-style:\s*italic[^}]*font-weight:\s*400/.test(html), 'esperava encontrar @font-face com font-weight: 400; font-style: italic');
});

test('HTML contém @font-face para peso 700 italic', () => {
  assert.ok(/font-weight:\s*700;[^}]*font-style:\s*italic/.test(html) || /font-style:\s*italic[^}]*font-weight:\s*700/.test(html), 'esperava encontrar @font-face com font-weight: 700; font-style: italic');
});

test('HTML contém font-display: swap nas @font-face', () => {
  const fontFaceMatches = html.match(/@font-face\s*\{[^}]*\}/g);
  assert.ok(fontFaceMatches && fontFaceMatches.length > 0, 'esperava encontrar pelo menos uma @font-face');
  const hasSwap = fontFaceMatches.some(ff => ff.includes('font-display: swap'));
  assert.ok(hasSwap, 'esperava encontrar font-display: swap em pelo menos uma @font-face');
});

test('HTML mantém fallback de fontes no stack', () => {
  assert.ok(html.includes("font-family: 'Century Gothic'") && (html.includes("'Trebuchet MS'") || html.includes('Trebuchet MS')), 'esperava manter Trebuchet MS no fallback');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
