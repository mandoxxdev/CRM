const assert = require('assert');
const { mesclarItensPreservandoCampos } = require('../propostaItensDiff');
let passed=0,failed=0; function test(n,f){try{f();passed++;console.log('  ✓ '+n)}catch(e){failed++;console.error('  ✗ '+n+': '+e.message)}}

// Item como vem do banco (tem os campos "ricos")
const dbRow = { codigo_produto: 'A', descricao: 'Masseira', quantidade: 1, valor_unitario: 10, valor_total: 10,
  modelo: 'MBY-30', descritivo_tecnico: 'texto tecnico', categoria: 'Mistura', tag: 'T1', descricao_resumida: 'resumo' };
// Item como vem do payload do formulário (SEM os campos ricos)
const payloadRow = { codigo_produto: 'A', descricao: 'Masseira', quantidade: 2, valor_unitario: 10, valor_total: 20 };

test('preserva campos que o payload não envia, a partir do item existente', () => {
  const [m] = mesclarItensPreservandoCampos([dbRow], [payloadRow]);
  assert.strictEqual(m.modelo, 'MBY-30');
  assert.strictEqual(m.descritivo_tecnico, 'texto tecnico');
  assert.strictEqual(m.categoria, 'Mistura');
  assert.strictEqual(m.tag, 'T1');
  // e mantém o que o payload trouxe (quantidade editada)
  assert.strictEqual(m.quantidade, 2);
});

test('item novo (sem correspondente antigo) fica como está, sem inventar campos', () => {
  const novo = { codigo_produto: 'B', descricao: 'Moinho', quantidade: 1, valor_unitario: 5, valor_total: 5 };
  const [m] = mesclarItensPreservandoCampos([dbRow], [novo]);
  assert.strictEqual(m.codigo_produto, 'B');
  assert.strictEqual(m.modelo, undefined);
  assert.strictEqual(m.descritivo_tecnico, undefined);
});

test('se o payload TROUXE o campo, respeita o payload (não sobrescreve com o antigo)', () => {
  const payloadComModelo = { codigo_produto: 'A', descricao: 'Masseira', quantidade: 1, valor_unitario: 10, valor_total: 10, modelo: 'NOVO-MODELO' };
  const [m] = mesclarItensPreservandoCampos([dbRow], [payloadComModelo]);
  assert.strictEqual(m.modelo, 'NOVO-MODELO');
});

test('não muta os objetos de entrada', () => {
  const entrada = { codigo_produto: 'A', descricao: 'Masseira', quantidade: 2 };
  mesclarItensPreservandoCampos([dbRow], [entrada]);
  assert.strictEqual(entrada.modelo, undefined, 'o objeto do payload não deve ser mutado');
});

console.log(`\n${passed} passed, ${failed} failed`); process.exit(failed?1:0);
