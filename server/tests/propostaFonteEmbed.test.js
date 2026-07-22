/**
 * Testa as fontes Century Gothic no @font-face.
 * Contrato (desde a otimização de payload do preview):
 *   - forPdfServer=true  (PDF, Puppeteer offline) → fonte embutida em base64.
 *   - forPdfServer=false (preview no navegador)    → fonte referenciada por URL cacheável.
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

// Preview (navegador): forPdfServer=false → fontes por URL.
const html = gerarHTMLPropostaPremiumV2(proposta, itens, totais, null, null, false, true);
// PDF (Puppeteer offline): forPdfServer=true → fontes em base64.
const htmlPdf = gerarHTMLPropostaPremiumV2(proposta, itens, totais, null, 'http://localhost:5000', true, true);

test('HTML contém @font-face', () => {
  assert.ok(html.includes('@font-face'), 'esperava encontrar @font-face no HTML');
});

test('PDF (forPdfServer=true) embute a fonte em base64', () => {
  assert.ok(htmlPdf.includes('data:font/ttf;base64,'), 'esperava data:font/ttf;base64, no HTML do PDF (Puppeteer roda offline)');
});

test('Preview (forPdfServer=false) referencia a fonte por URL cacheável, sem base64', () => {
  assert.ok(!html.includes('data:font'), 'preview NÃO deve embutir fonte em base64 (payload gigante)');
  assert.ok(/\/api\/assets\/fonts\/CenturyGothic\.ttf/.test(html), 'esperava referência /api/assets/fonts/CenturyGothic.ttf no preview');
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
