const assert = require('assert');
const { resolverCamposCustomizacao } = require('../propostaCustomizacoes');
let passed=0,failed=0; function test(n,f){try{f();passed++;console.log('  ✓ '+n)}catch(e){failed++;console.error('  ✗ '+n+': '+e.message)}}

test('editar só cliente_nome preserva cliente_email do anterior', () => {
  const anterior = { cliente_nome: 'ACME', cliente_email: 'a@b.c', cliente_telefone: '111', cliente_contato: 'João' };
  const r = resolverCamposCustomizacao({ cliente_nome: 'ACME LTDA' }, anterior);
  assert.strictEqual(r.cliente_nome, 'ACME LTDA');
  assert.strictEqual(r.cliente_email, 'a@b.c', 'email não enviado deve ser preservado');
  assert.strictEqual(r.cliente_telefone, '111');
  assert.strictEqual(r.cliente_contato, 'João');
});

test('campo enviado vazio ("") é tratado como limpo (null)', () => {
  const anterior = { cliente_nome: 'ACME', cliente_email: 'a@b.c' };
  const r = resolverCamposCustomizacao({ cliente_email: '' }, anterior);
  assert.strictEqual(r.cliente_email, null, 'email enviado vazio deve limpar');
  assert.strictEqual(r.cliente_nome, 'ACME', 'nome não enviado preservado');
});

test('sem anterior: campos não enviados ficam null', () => {
  const r = resolverCamposCustomizacao({ cliente_nome: 'NOVO' }, null);
  assert.strictEqual(r.cliente_nome, 'NOVO');
  assert.strictEqual(r.cliente_email, null);
  assert.strictEqual(r.cliente_telefone, null);
  assert.strictEqual(r.cliente_contato, null);
});

test('campo enviado com valor usa o valor enviado', () => {
  const anterior = { cliente_email: 'velho@x.com' };
  const r = resolverCamposCustomizacao({ cliente_email: 'novo@x.com' }, anterior);
  assert.strictEqual(r.cliente_email, 'novo@x.com');
});

console.log(`\n${passed} passed, ${failed} failed`); process.exit(failed?1:0);
