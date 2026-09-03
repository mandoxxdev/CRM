/**
 * Acessórios do item da proposta.
 *
 * Pedido (02/08/2026): "ao selecionar um item para fazer a proposta, deve ter algum lugar
 * para habilitar acessórios, escrever o acessório e colocar preço para ele, pq as vezes tenho
 * o mesmo item com 10mil acessórios, dai nao tem como cadastrar 10mil itens".
 *
 * TRES RISCOS, e o teste cobre os tres:
 *
 * 1. PERSISTENCIA. proposta_itens e APAGADA e reinserida a cada salvamento. Um campo que o
 *    payload nao mande e apagado, e foi assim que as variaveis manuais se perderam por varias
 *    tentativas. Os acessorios entram em CAMPOS_PRESERVAR - mas com uma armadilha propria:
 *    apagar TODOS os acessorios de um item nao pode ser desfeito pela preservacao.
 *
 * 2. DUPLICACAO. A logica existe em server/acessoriosItem.js e, espelhada, em
 *    client/src/utils/acessoriosItem.js, porque o CRA nao importa de fora de client/src.
 *    Duplicacao diverge - o nome do arquivo do PDF chegou a ter cinco versoes nesta base.
 *    A ultima secao carrega OS DOIS arquivos e exige resultado identico.
 *
 * 3. TOTAL. Acessorio tem preco e precisa entrar no subtotal, senao o documento fecha com
 *    um valor e a tabela mostra outro.
 *
 * Executar: node tests/acessoriosItem.test.js
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  lerAcessorios, totalAcessorios, totalAcessoriosDosItens, serializarAcessorios,
} = require('../acessoriosItem');
const { mesclarItensPreservandoCampos, CAMPOS_PRESERVAR } = require('../propostaItensDiff');
const { gerarHTMLPropostaPremiumV2 } = require('../templates/propostaPremiumV2');

let ok = 0, total = 0;
const t = (nome, fn) => {
  total++;
  try { fn(); ok++; console.log('  OK   ' + nome); }
  catch (e) { console.error('  FALHA ' + nome + ': ' + e.message); }
};

const acs = (lista) => ({ acessorios: JSON.stringify(lista) });

console.log('\n[leitura]');
t('item sem acessorios devolve lista vazia', () => assert.deepStrictEqual(lerAcessorios({}), []));
t('aceita JSON string (como vem do banco)', () => assert.strictEqual(
  lerAcessorios(acs([{ descricao: 'TAMPA', quantidade: 2, valor_unitario: 100 }])).length, 1));
t('aceita array pronto (como vem do formulario)', () => assert.strictEqual(
  lerAcessorios({ acessorios: [{ descricao: 'TAMPA' }] }).length, 1));
t('quantidade ausente vale 1', () => assert.strictEqual(
  lerAcessorios({ acessorios: [{ descricao: 'X' }] })[0].quantidade, 1));
t('valor ausente vale 0', () => assert.strictEqual(
  lerAcessorios({ acessorios: [{ descricao: 'X' }] })[0].valor_unitario, 0));
t('numeros em texto (o input devolve string) sao convertidos', () => {
  const a = lerAcessorios({ acessorios: [{ descricao: 'X', quantidade: '3', valor_unitario: '250.50' }] })[0];
  assert.strictEqual(a.quantidade, 3);
  assert.strictEqual(a.valor_unitario, 250.5);
});
t('linha sem descricao e descartada (o vendedor adicionou e desistiu)', () => assert.strictEqual(
  lerAcessorios({ acessorios: [{ descricao: '  ', valor_unitario: 900 }] }).length, 0));

console.log('\n[entrada malformada nao derruba o documento]');
[
  ['JSON corrompido', { acessorios: '{isso nao e json' }],
  ['JSON que nao e array', { acessorios: '{"descricao":"X"}' }],
  ['string vazia', { acessorios: '' }],
  ['null', { acessorios: null }],
  ['numero', { acessorios: 42 }],
  ['item null', null],
].forEach(([nome, item]) => t(nome + ' -> lista vazia',
  () => assert.deepStrictEqual(lerAcessorios(item), [])));

console.log('\n[total]');
t('soma quantidade x valor', () => assert.strictEqual(
  totalAcessorios(acs([
    { descricao: 'TAMPA', quantidade: 1, valor_unitario: 4500 },
    { descricao: 'PLATAFORMA', quantidade: 2, valor_unitario: 1200 },
  ])), 6900));
t('soma de varios itens', () => assert.strictEqual(
  totalAcessoriosDosItens([
    acs([{ descricao: 'A', quantidade: 1, valor_unitario: 100 }]),
    acs([{ descricao: 'B', quantidade: 3, valor_unitario: 10 }]),
    {},
  ]), 130));

console.log('\n[persistencia: sobrevive ao save que apaga e reinsere os itens]');
t('acessorios esta em CAMPOS_PRESERVAR',
  () => assert(CAMPOS_PRESERVAR.includes('acessorios'), CAMPOS_PRESERVAR.join(', ')));

const noBanco = [{
  id: 10, codigo_produto: 'D-1', descricao: 'DISPERSOR',
  acessorios: JSON.stringify([{ descricao: 'TAMPA', quantidade: 1, valor_unitario: 4500 }]),
}];
// Payload de um caminho que nao manda o campo (ex.: preview salvando so o texto da tabela).
const semCampo = mesclarItensPreservandoCampos(noBanco, [
  { codigo_produto: 'D-1', descricao: 'DISPERSOR', quantidade: 1, valor_unitario: 900 },
]);
t('save que NAO manda acessorios preserva os que existiam',
  () => assert.strictEqual(lerAcessorios(semCampo[0]).length, 1));

// A ARMADILHA: apagar todos os acessorios manda '[]', que NAO pode ser tratado como vazio.
const apagouTodos = mesclarItensPreservandoCampos(noBanco, [
  { codigo_produto: 'D-1', descricao: 'DISPERSOR', acessorios: serializarAcessorios([]) },
]);
t('apagar TODOS os acessorios nao e desfeito pela preservacao',
  () => assert.strictEqual(lerAcessorios(apagouTodos[0]).length, 0,
    'os acessorios apagados voltaram sozinhos'));

const trocou = mesclarItensPreservandoCampos(noBanco, [
  { codigo_produto: 'D-1', descricao: 'DISPERSOR',
    acessorios: serializarAcessorios([{ descricao: 'OUTRO', quantidade: 1, valor_unitario: 50 }]) },
]);
t('lista enviada substitui a antiga', () => {
  const lista = lerAcessorios(trocou[0]);
  assert.strictEqual(lista.length, 1);
  assert.strictEqual(lista[0].descricao, 'OUTRO');
});
t('item NOVO nao herda acessorios de outro item', () => {
  const comNovo = mesclarItensPreservandoCampos(noBanco, [
    { codigo_produto: 'D-1', descricao: 'DISPERSOR' },
    { codigo_produto: 'D-2', descricao: 'OUTRO ITEM' },
  ]);
  assert.strictEqual(lerAcessorios(comNovo[1]).length, 0);
});

console.log('\n[serializacao]');
t('serializa SEMPRE JSON, inclusive vazio', () => assert.strictEqual(serializarAcessorios([]), '[]'));
t('nunca devolve string vazia (que a preservacao trataria como "nao enviado")',
  () => assert.notStrictEqual(serializarAcessorios(null), ''));
t('normaliza ao serializar (descarta linha vazia, converte numero)', () => {
  const json = serializarAcessorios([
    { descricao: 'BOM', quantidade: '2', valor_unitario: '10' },
    { descricao: '', valor_unitario: 999 },
  ]);
  const lista = JSON.parse(json);
  assert.strictEqual(lista.length, 1);
  assert.strictEqual(lista[0].quantidade, 2);
});

console.log('\n[documento]');
const htmlCom = gerarHTMLPropostaPremiumV2(
  { numero_proposta: 'X', titulo: 'T', razao_social: 'C' },
  [{ id: 1, produto_nome: 'DISPERSOR', modelo: 'DHY-80', quantidade: 1, unidade: 'UN',
     valor_unitario: 1000, valor_total: 1000, familia_produto: 'F',
     acessorios: JSON.stringify([
       { descricao: 'TAMPA BIPARTIDA', quantidade: 1, valor_unitario: 4500 },
       { descricao: 'PLATAFORMA', quantidade: 2, valor_unitario: 1200 },
     ]) }],
  { total: 7900, dataEmissao: '02/08/2026' }, {}, null, false, true
);
const textoCom = htmlCom.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
t('o acessorio aparece na tabela de precos', () => assert(textoCom.includes('TAMPA BIPARTIDA'), 'nao apareceu'));
t('numerado como sub-item do equipamento (1.1, 1.2)', () => {
  assert(textoCom.includes('1.1'), 'falta 1.1');
  assert(textoCom.includes('1.2'), 'falta 1.2');
});
t('o total do acessorio e quantidade x valor (2 x 1.200 = 2.400)',
  () => assert(textoCom.includes('2.400,00'), 'total do acessorio errado'));
t('uma linha de tabela por acessorio', () => {
  const linhas = (htmlCom.match(/<tr class="linha-acessorio">/g) || []).length;
  assert.strictEqual(linhas, 2, 'linhas encontradas: ' + linhas);
});
t('item SEM acessorio nao ganha linha extra', () => {
  const html = gerarHTMLPropostaPremiumV2(
    { numero_proposta: 'X', titulo: 'T', razao_social: 'C' },
    [{ id: 1, produto_nome: 'DISPERSOR', quantidade: 1, unidade: 'UN', valor_unitario: 1000,
       valor_total: 1000, familia_produto: 'F' }],
    { total: 1000, dataEmissao: '02/08/2026' }, {}, null, false, true
  );
  assert.strictEqual((html.match(/<tr class="linha-acessorio">/g) || []).length, 0);
});
t('descricao com HTML e escapada (o campo e digitacao livre)', () => {
  const html = gerarHTMLPropostaPremiumV2(
    { numero_proposta: 'X', titulo: 'T', razao_social: 'C' },
    [{ id: 1, produto_nome: 'D', quantidade: 1, unidade: 'UN', valor_unitario: 1, valor_total: 1,
       familia_produto: 'F',
       acessorios: JSON.stringify([{ descricao: '<script>alert(1)</script>', quantidade: 1, valor_unitario: 1 }]) }],
    { total: 1, dataEmissao: '02/08/2026' }, {}, null, false, true
  );
  assert(!html.includes('<script>alert(1)</script>'), 'HTML digitado entrou cru no documento');
  assert(html.includes('&lt;script&gt;'), 'nao escapou');
});

console.log('\n[paridade entre servidor e cliente]');
// A duplicacao e forcada (o CRA nao importa de fora de client/src). Este bloco e o que
// impede as duas copias de divergirem em silencio.
function carregarDoCliente() {
  const arq = path.join(__dirname, '..', '..', 'client', 'src', 'utils', 'acessoriosItem.js');
  const fonte = fs.readFileSync(arq, 'utf8').replace(/export function/g, 'function');
  // eslint-disable-next-line no-new-func
  return new Function(fonte + '\nreturn { lerAcessorios, totalAcessorios, totalAcessoriosDosItens, serializarAcessorios };')();
}
const cliente = carregarDoCliente();
const casos = [
  {},
  { acessorios: null },
  { acessorios: '' },
  { acessorios: '[]' },
  { acessorios: 'json quebrado' },
  { acessorios: '{"a":1}' },
  { acessorios: 42 },
  { acessorios: [{ descricao: 'A' }] },
  { acessorios: [{ descricao: '   ', valor_unitario: 10 }] },
  { acessorios: [{ descricao: 'A', quantidade: '3', valor_unitario: '250.50' }] },
  { acessorios: [{ descricao: 'A', quantidade: -1, valor_unitario: -5 }] },
  { acessorios: [{ descricao: 'A', quantidade: 0 }] },
  { acessorios: JSON.stringify([{ descricao: 'B', quantidade: 2, valor_unitario: 1200 }]) },
];
casos.forEach((caso, i) => {
  t('caso ' + i + ': as duas copias concordam', () => {
    assert.deepStrictEqual(cliente.lerAcessorios(caso), lerAcessorios(caso), 'lerAcessorios difere');
    assert.strictEqual(cliente.totalAcessorios(caso), totalAcessorios(caso), 'totalAcessorios difere');
    assert.strictEqual(cliente.serializarAcessorios(caso.acessorios), serializarAcessorios(caso.acessorios),
      'serializarAcessorios difere');
  });
});

console.log(`\n${ok}/${total} checagens`);
console.log(ok === total ? '0 failed' : `${total - ok} failed`);
process.exit(ok === total ? 0 : 1);
