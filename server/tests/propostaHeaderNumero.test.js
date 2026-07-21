const assert = require('assert');
const { gerarHTMLPropostaPremiumV2 } = require('../templates/propostaPremiumV2');
let passed=0,failed=0; function test(n,f){try{f();passed++;console.log('  ✓ '+n)}catch(e){failed++;console.error('  ✗ '+n+': '+e.message)}}
const html = gerarHTMLPropostaPremiumV2({ numero_proposta: 'PROP-777' }, [], { total: 0 }, null, null, false, true);
test('header tem o titulo e o numero em linhas separadas', () => {
  assert(html.includes('PROPOSTA TÉCNICA COMERCIAL'), 'faltou titulo');
  assert(html.includes('page-header-num') && html.includes('Nº PROP-777'), 'faltou numero em elemento proprio');
  // o numero NAO deve estar colado na mesma <p> do titulo (linha separada)
  assert(!/PROPOSTA TÉCNICA COMERCIAL Nº PROP-777/.test(html), 'numero ainda inline na mesma linha do titulo');
});
console.log(`\n${passed} passed, ${failed} failed`); process.exit(failed?1:0);
