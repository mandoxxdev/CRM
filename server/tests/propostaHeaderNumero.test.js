/**
 * T3 — o cabeçalho das páginas internas traz título e número na MESMA LINHA, no
 * formato exato "PROPOSTA TÉCNICA COMERCIAL: Nº <numero>".
 *
 * O que este teste NÃO pode afrouxar: a garantia de que o NÚMERO da proposta aparece
 * no cabeçalho montado. Foi a regressão de produção de 24/07/2026 (cabeçalho por
 * imagem escondia o .page-header-inner e, com ele, o número) — ver
 * tests/propostaHeaderPadraoSempre.test.js e a armadilha 8 do review.
 *
 * Executar: node tests/propostaHeaderNumero.test.js
 */
const assert = require('assert');
const { gerarHTMLPropostaPremiumV2 } = require('../templates/propostaPremiumV2');
let passed=0,failed=0; function test(n,f){try{f();passed++;console.log('  ✓ '+n)}catch(e){failed++;console.error('  ✗ '+n+': '+e.message)}}
const html = gerarHTMLPropostaPremiumV2({ numero_proposta: '059-02-MH-2026-REV00' }, [], { total: 0 }, null, null, false, true);

test('o número da proposta continua presente no cabeçalho montado', () => {
  assert(html.includes('PROPOSTA TÉCNICA COMERCIAL'), 'faltou titulo');
  assert(html.includes('Nº 059-02-MH-2026-REV00'), 'faltou o numero da proposta');
  assert(html.includes('page-header-num'), 'faltou o elemento proprio do numero (usado como ancora pelos outros testes)');
});

test('titulo e numero saem na MESMA linha, no formato "PROPOSTA TÉCNICA COMERCIAL: Nº ..."', () => {
  // Compara o TEXTO renderizado do cabeçalho (sem tags): o numero pode estar num
  // <span> proprio dentro do mesmo <p>, o que importa e sair numa linha so.
  const bloco = html.match(/<div class="page-header-center-box">[\s\S]*?<\/div>/);
  assert(bloco, 'nao achei o bloco central do cabecalho');
  const texto = bloco[0].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
  assert(
    texto.startsWith('PROPOSTA TÉCNICA COMERCIAL: Nº 059-02-MH-2026-REV00'),
    `formato inesperado no cabecalho: "${texto.slice(0, 80)}"`
  );
});

test('nao ha mais duas linhas separadas (titulo num <p> e numero em outro <p>)', () => {
  assert(!/<p class="page-header-title">PROPOSTA TÉCNICA COMERCIAL<\/p>\s*<p class="page-header-num">/.test(html),
    'titulo e numero ainda estao em paragrafos separados');
});

console.log(`\n${passed} passed, ${failed} failed`); process.exit(failed?1:0);
