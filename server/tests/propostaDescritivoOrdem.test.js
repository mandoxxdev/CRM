const assert = require('assert');
const { gerarHTMLPropostaPremiumV2 } = require('../templates/propostaPremiumV2');
let passed = 0, failed = 0;
function test(n, f){try{f();passed++;console.log('  ✓ '+n)}catch(e){failed++;console.error('  ✗ '+n+': '+e.message)}}

const itens = [{ produto_nome: 'Masseira XPTO', quantidade: 2, unidade: 'UN', valor_unitario: 1, valor_total: 2,
  descritivo_tecnico: 'DESCRITIVO_MARCADOR' }];
const html = gerarHTMLPropostaPremiumV2({ numero_proposta: '1' }, itens, { total: 2 }, null, null, false, true);

test('Descritivo técnico aparece antes de "Equipamento:"', () => {
  const iDesc = html.indexOf('DESCRITIVO_MARCADOR');
  const iEquip = html.indexOf('<strong>Equipamento:</strong>');
  assert(iDesc > -1 && iEquip > -1, 'marcadores ausentes');
  assert(iDesc < iEquip, 'descritivo deveria vir antes de Equipamento');
});
console.log(`\n${passed} passed, ${failed} failed`); process.exit(failed?1:0);
