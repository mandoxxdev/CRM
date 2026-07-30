/**
 * Ctrl+Z das fotos da proposta.
 *
 * Pedido (30/07/2026): "tem que habilitar o control z para as imagens".
 *
 * O ponto delicado nao e a pilha em si, e sim o que cada acao precisa GUARDAR para poder
 * ser revertida, e a ordem em que a pilha devolve:
 *   - mover/redimensionar -> a geometria de ANTES (pagina, x, y, largura) de cada foto
 *     envolvida (num arrasto em grupo sao varias);
 *   - colar -> os ids CRIADOS, para poder apaga-los;
 *   - excluir -> a geometria das apagadas, para restaurar no lugar exato pelo MESMO id
 *     (o delete e logico, ativo = 0, entao restaurar nao cria copia).
 *
 * Executar: node tests/desfazerFotos.test.js
 */
const assert = require('assert');

let ok = 0, total = 0;
const t = (nome, fn) => {
  total++;
  try { fn(); ok++; console.log('  OK   ' + nome); }
  catch (e) { console.error('  FALHA ' + nome + ': ' + e.message); }
};

const LIMITE = 40;

function criarPilha() {
  const pilha = [];
  return {
    registrar(acao) {
      if (!acao) return;
      pilha.push(acao);
      if (pilha.length > LIMITE) pilha.shift();
    },
    desfazer() { return pilha.pop(); },
    tamanho: () => pilha.length,
  };
}

// Modelo do estado das fotos, para aplicar as acoes e conferir o resultado.
function criarEstado(fotos) {
  return { fotos: fotos.map((f) => ({ ...f })), proximoId: 100 };
}
const buscar = (est, id) => est.fotos.find((f) => String(f.id) === String(id));

function aplicarDesfazer(est, acao) {
  if (!acao) return;
  if (acao.tipo === 'geometria') {
    acao.fotos.forEach((g) => {
      const f = buscar(est, g.id);
      if (f) { f.pagina = g.pagina; f.x = g.x; f.y = g.y; f.largura = g.largura; }
    });
  } else if (acao.tipo === 'colar') {
    est.fotos = est.fotos.filter((f) => !acao.ids.includes(String(f.id)));
  } else if (acao.tipo === 'excluir') {
    acao.fotos.forEach((g) => { est.fotos.push({ ...g }); });
  }
}

const A = { id: '1', pagina: 1, x: 20, y: 60, largura: 80 };
const B = { id: '2', pagina: 1, x: 120, y: 60, largura: 80 };

console.log('\n[mover] volta para a posicao anterior');
{
  const est = criarEstado([A, B]);
  const p = criarPilha();
  p.registrar({ tipo: 'geometria', fotos: [{ ...buscar(est, '1') }] });
  buscar(est, '1').x = 90; buscar(est, '1').y = 150;
  aplicarDesfazer(est, p.desfazer());
  t('a foto volta ao x/y de antes', () => {
    assert.strictEqual(buscar(est, '1').x, 20);
    assert.strictEqual(buscar(est, '1').y, 60);
  });
  t('a outra foto nao e tocada', () => assert.strictEqual(buscar(est, '2').x, 120));
}

console.log('\n[grupo] desfazer um arrasto de duas devolve as DUAS');
{
  const est = criarEstado([A, B]);
  const p = criarPilha();
  // Foi isso que o mousedown gravou: a arrastada MAIS as demais selecionadas.
  p.registrar({ tipo: 'geometria', fotos: [{ ...buscar(est, '1') }, { ...buscar(est, '2') }] });
  buscar(est, '1').x += 30; buscar(est, '2').x += 30;
  aplicarDesfazer(est, p.desfazer());
  t('as duas voltam ao lugar, num unico Ctrl+Z', () => {
    assert.strictEqual(buscar(est, '1').x, 20);
    assert.strictEqual(buscar(est, '2').x, 120);
  });
}

console.log('\n[redimensionar] volta a largura e a ancora');
{
  const est = criarEstado([A]);
  const p = criarPilha();
  p.registrar({ tipo: 'geometria', fotos: [{ ...buscar(est, '1') }] });
  // Alca oeste: cresce para a esquerda, entao x tambem muda.
  buscar(est, '1').largura = 110; buscar(est, '1').x = -10;
  aplicarDesfazer(est, p.desfazer());
  t('largura restaurada', () => assert.strictEqual(buscar(est, '1').largura, 80));
  t('a posicao tambem, senao a foto voltaria deslocada',
    () => assert.strictEqual(buscar(est, '1').x, 20));
}

console.log('\n[colar] desfazer apaga as copias, nao as originais');
{
  const est = criarEstado([A, B]);
  const p = criarPilha();
  const criadas = ['100', '101'];
  criadas.forEach((novoId, i) => est.fotos.push({ id: novoId, pagina: 1, x: 25 + i, y: 65, largura: 80 }));
  p.registrar({ tipo: 'colar', ids: criadas });
  aplicarDesfazer(est, p.desfazer());
  t('as coladas somem', () => assert(!est.fotos.some((f) => criadas.includes(String(f.id)))));
  t('as originais continuam', () => assert.strictEqual(est.fotos.length, 2));
}

console.log('\n[excluir] desfazer restaura no lugar exato, com o MESMO id');
{
  const est = criarEstado([A, B]);
  const p = criarPilha();
  const apagadas = [{ ...buscar(est, '1') }, { ...buscar(est, '2') }];
  p.registrar({ tipo: 'excluir', fotos: apagadas });
  est.fotos = [];
  aplicarDesfazer(est, p.desfazer());
  t('as duas voltam', () => assert.strictEqual(est.fotos.length, 2));
  t('com os ids originais (restaurar nao cria copia)',
    () => assert.deepStrictEqual(est.fotos.map((f) => f.id).sort(), ['1', '2']));
  t('e na posicao/tamanho de antes', () => {
    assert.strictEqual(buscar(est, '1').x, 20);
    assert.strictEqual(buscar(est, '2').x, 120);
    assert.strictEqual(buscar(est, '1').largura, 80);
  });
}

console.log('\n[ordem] a pilha desfaz da ultima para a primeira');
{
  const est = criarEstado([A]);
  const p = criarPilha();
  p.registrar({ tipo: 'geometria', fotos: [{ ...buscar(est, '1') }] });      // antes: x=20
  buscar(est, '1').x = 50;
  p.registrar({ tipo: 'geometria', fotos: [{ ...buscar(est, '1') }] });      // antes: x=50
  buscar(est, '1').x = 90;
  aplicarDesfazer(est, p.desfazer());
  t('primeiro Ctrl+Z volta um passo (90 -> 50)', () => assert.strictEqual(buscar(est, '1').x, 50));
  aplicarDesfazer(est, p.desfazer());
  t('segundo Ctrl+Z volta o passo anterior (50 -> 20)', () => assert.strictEqual(buscar(est, '1').x, 20));
  t('pilha vazia depois disso', () => assert.strictEqual(p.tamanho(), 0));
  t('desfazer com a pilha vazia nao quebra nem altera nada', () => {
    aplicarDesfazer(est, p.desfazer());
    assert.strictEqual(buscar(est, '1').x, 20);
  });
}

console.log('\n[teto] a pilha nao cresce sem limite');
{
  const p = criarPilha();
  for (let i = 0; i < LIMITE + 15; i++) p.registrar({ tipo: 'geometria', fotos: [{ id: '1', pagina: 1, x: i, y: 0, largura: 80 }] });
  t(`para em ${LIMITE} acoes`, () => assert.strictEqual(p.tamanho(), LIMITE));
  t('descarta as MAIS ANTIGAS (o topo continua sendo a acao recente)',
    () => assert.strictEqual(p.desfazer().fotos[0].x, LIMITE + 14));
}

console.log(`\n${ok}/${total} checagens`);
console.log(ok === total ? '0 failed' : `${total - ok} failed`);
process.exit(ok === total ? 0 : 1);
