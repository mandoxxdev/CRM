const assert = require('assert');
// A função é exportada de um módulo dedicado para ser testável sem subir o servidor.
const { diffItensParaLog } = require('../propostaItensDiff');
let passed=0,failed=0; function test(n,f){try{f();passed++;console.log('  ✓ '+n)}catch(e){failed++;console.error('  ✗ '+n+': '+e.message)}}

const chave = (i) => i.codigo_produto || i.descricao;

test('detecta item adicionado', () => {
  const d = diffItensParaLog([], [{ codigo_produto: 'A', descricao: 'Masseira', quantidade: 1, valor_unitario: 10 }]);
  assert.strictEqual(d.adicionados.length, 1);
  assert.strictEqual(d.removidos.length, 0);
});
test('detecta item removido', () => {
  const d = diffItensParaLog([{ codigo_produto: 'A', descricao: 'Masseira', quantidade: 1, valor_unitario: 10 }], []);
  assert.strictEqual(d.removidos.length, 1);
});
test('detecta item editado (quantidade)', () => {
  const antes = [{ codigo_produto: 'A', descricao: 'Masseira', quantidade: 1, valor_unitario: 10 }];
  const depois = [{ codigo_produto: 'A', descricao: 'Masseira', quantidade: 3, valor_unitario: 10 }];
  const d = diffItensParaLog(antes, depois);
  assert.strictEqual(d.adicionados.length, 0);
  assert.strictEqual(d.removidos.length, 0);
  assert.strictEqual(d.editados.length, 1);
  assert.strictEqual(d.editados[0].campo, 'quantidade');
  assert.strictEqual(String(d.editados[0].antes), '1');
  assert.strictEqual(String(d.editados[0].depois), '3');
});
test('sem mudança: nada', () => {
  const x = [{ codigo_produto: 'A', descricao: 'M', quantidade: 1, valor_unitario: 10 }];
  const d = diffItensParaLog(x, x.map(o => ({ ...o })));
  assert.strictEqual(d.adicionados.length + d.removidos.length + d.editados.length, 0);
});
console.log(`\n${passed} passed, ${failed} failed`); process.exit(failed?1:0);
