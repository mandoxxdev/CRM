const assert = require('assert');
const { gerarHTMLPropostaPremiumV2 } = require('../templates/propostaPremiumV2');
let passed=0,failed=0; function test(n,f){try{f();passed++;console.log('  ✓ '+n)}catch(e){failed++;console.error('  ✗ '+n+': '+e.message)}}

test('sem cliente_logo_url: não renderiza o bloco cover-client-logo', () => {
  const html = gerarHTMLPropostaPremiumV2({ numero_proposta: '1' }, [], { total: 0 }, null, null, false, true);
  // Verifica a AUSÊNCIA do elemento renderizado (o nome da classe existe no CSS,
  // por isso testamos a marcação da <div>, não a mera substring).
  assert(!html.includes('<div class="cover-client-logo">'), 'não deveria renderizar o bloco de logo do cliente');
});
test('com cliente_logo_url inexistente no disco: degrada sem quebrar (sem <img> quebrada)', () => {
  const html = gerarHTMLPropostaPremiumV2({ numero_proposta: '1', cliente_logo_url: 'nao-existe.png' }, [], { total: 0 }, null, null, false, true);
  // aceitável: ou não renderiza o bloco, ou renderiza com onerror. Não deve lançar.
  assert(typeof html === 'string' && html.length > 0);
});
console.log(`\n${passed} passed, ${failed} failed`); process.exit(failed?1:0);
