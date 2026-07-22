const assert = require('assert');
// A função é exportada de um módulo dedicado para ser testável sem subir o servidor.
const { diffItensParaLog } = require('../propostaItensDiff');
let passed=0,failed=0; function test(n,f){try{f();passed++;console.log('  ✓ '+n)}catch(e){failed++;console.error('  ✗ '+n+': '+e.message)}}

test('detecta item adicionado', () => {
  const d = diffItensParaLog([], [{ codigo_produto: 'A', descricao: 'Masseira', quantidade: 1, valor_unitario: 10 }]);
  assert.strictEqual(d.adicionados.length, 1);
  assert.strictEqual(d.removidos.length, 0);
});
test('detecta item removido', () => {
  const d = diffItensParaLog([{ codigo_produto: 'A', descricao: 'Masseira', quantidade: 1, valor_unitario: 10 }], []);
  assert.strictEqual(d.removidos.length, 1);
});
test('edição vira UMA entrada agrupada por item (com nome e lista de mudanças)', () => {
  const antes = [{ codigo_produto: 'A', descricao: 'Masseira', quantidade: 1, valor_unitario: 10, valor_total: 10 }];
  const depois = [{ codigo_produto: 'A', descricao: 'Masseira', quantidade: 3, valor_unitario: 10, valor_total: 30 }];
  const d = diffItensParaLog(antes, depois);
  assert.strictEqual(d.adicionados.length, 0);
  assert.strictEqual(d.removidos.length, 0);
  assert.strictEqual(d.editados.length, 1, 'deve ser 1 entrada por item editado');
  assert.strictEqual(d.editados[0].nome, 'Masseira');
  const campos = d.editados[0].mudancas.map(m => m.campo);
  assert(campos.includes('quantidade'), 'deve conter quantidade');
  assert(campos.includes('valor_total'), 'deve conter valor_total');
  const q = d.editados[0].mudancas.find(m => m.campo === 'quantidade');
  assert.strictEqual(String(q.antes), '1');
  assert.strictEqual(String(q.depois), '3');
});
test('sem mudança: nada', () => {
  const x = [{ codigo_produto: 'A', descricao: 'M', quantidade: 1, valor_unitario: 10, valor_total: 10 }];
  const d = diffItensParaLog(x, x.map(o => ({ ...o })));
  assert.strictEqual(d.adicionados.length + d.removidos.length + d.editados.length, 0);
});
test('NÃO gera edição espúria para campos ausentes no payload (modelo/descritivo)', () => {
  // item do banco tem modelo/descritivo; payload do formulário não os envia
  const dbRow = { codigo_produto: 'A', descricao: 'Masseira', quantidade: 1, unidade: 'UN', valor_unitario: 10, valor_total: 10, modelo: 'MBY-30', descritivo_tecnico: 'texto' };
  const payload = { codigo_produto: 'A', descricao: 'Masseira', quantidade: 1, unidade: 'UN', valor_unitario: 10, valor_total: 10 };
  const d = diffItensParaLog([dbRow], [payload]);
  assert.strictEqual(d.editados.length, 0, 'não deve logar edição de campos que o formulário nem envia');
});
test('normalização numérica: 250000 (number) == "250000" == 250000.0 (sem edição)', () => {
  const dbRow = { codigo_produto: 'A', descricao: 'M', quantidade: 1, valor_unitario: 250000, valor_total: 250000.0 };
  const payload = { codigo_produto: 'A', descricao: 'M', quantidade: '1', valor_unitario: '250000', valor_total: 250000 };
  const d = diffItensParaLog([dbRow], [payload]);
  assert.strictEqual(d.editados.length, 0, 'diferença apenas de formatação numérica não é edição');
});
test('adicionar um produto não gera edição espúria no item existente', () => {
  const dbRow = { codigo_produto: 'A', descricao: 'Masseira', quantidade: 1, unidade: 'UN', valor_unitario: 10, valor_total: 10, modelo: 'MBY-30', descritivo_tecnico: 'x' };
  const existentePayload = { codigo_produto: 'A', descricao: 'Masseira', quantidade: 1, unidade: 'UN', valor_unitario: 10, valor_total: 10 };
  const novoPayload = { codigo_produto: 'B', descricao: 'Moinho', quantidade: 1, unidade: 'UN', valor_unitario: 5, valor_total: 5 };
  const d = diffItensParaLog([dbRow], [existentePayload, novoPayload]);
  assert.strictEqual(d.adicionados.length, 1);
  assert.strictEqual(d.adicionados[0].descricao, 'Moinho');
  assert.strictEqual(d.editados.length, 0, 'o item existente não deve aparecer como editado');
});
test('DUPLICATAS: remover uma de 3 itens com o mesmo codigo_produto é detectado', () => {
  const dup = () => ({ codigo_produto: 'PROD-X', descricao: 'Moinho', quantidade: 1, valor_unitario: 100, valor_total: 100 });
  const outro = { codigo_produto: 'PROD-Y', descricao: 'Masseira', quantidade: 1, valor_unitario: 5, valor_total: 5 };
  const antes = [outro, dup(), dup(), dup()];   // 3 iguais
  const depois = [outro, dup(), dup()];          // sobrou 2
  const d = diffItensParaLog(antes, depois);
  assert.strictEqual(d.removidos.length, 1, 'deve detectar 1 removido mesmo com chave duplicada');
  assert.strictEqual(d.adicionados.length, 0);
});
test('DUPLICATAS: adicionar mais uma de um item com codigo_produto repetido é detectado', () => {
  const dup = () => ({ codigo_produto: 'PROD-X', descricao: 'Moinho', quantidade: 1, valor_unitario: 100, valor_total: 100 });
  const antes = [dup(), dup()];    // 2 iguais
  const depois = [dup(), dup(), dup()]; // virou 3
  const d = diffItensParaLog(antes, depois);
  assert.strictEqual(d.adicionados.length, 1, 'deve detectar 1 adicionado mesmo com chave duplicada');
  assert.strictEqual(d.removidos.length, 0);
});
test('DUPLICATAS: editar uma entre várias iguais ainda é detectado (par por posição)', () => {
  const dup = (v) => ({ codigo_produto: 'PROD-X', descricao: 'Moinho', quantidade: 1, valor_unitario: v, valor_total: v });
  const antes = [dup(100), dup(100)];
  const depois = [dup(100), dup(200)]; // a 2a mudou
  const d = diffItensParaLog(antes, depois);
  assert.strictEqual(d.editados.length, 1, 'deve detectar 1 edição entre duplicatas');
  assert.strictEqual(d.adicionados.length, 0);
  assert.strictEqual(d.removidos.length, 0);
});

console.log(`\n${passed} passed, ${failed} failed`); process.exit(failed?1:0);
