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
// A numeracao da tabela segue a da SECAO 4 ("4.1", "4.2"...), por pedido do usuario: e o
// padrao do documento dele, e o cliente que le a tabela precisa achar o mesmo item no escopo.
// Antes a tabela numerava 1, 2, 3 e o escopo 4.1, 4.2, 4.3.
t('o item usa a numeracao da secao 4 (4.1), nao 1', () => {
  const linhas = [...htmlCom.matchAll(/<tr[^>]*>\s*<td class="col-center">([^<]*)<\/td>/g)].map((m) => m[1]);
  assert.strictEqual(linhas[0], '4.1', 'numeros encontrados: ' + linhas.join(', '));
});
t('o acessorio e sub-item do item (4.1.1, 4.1.2)', () => {
  const linhas = [...htmlCom.matchAll(/<tr class="linha-acessorio">\s*<td class="col-center">([^<]*)<\/td>/g)].map((m) => m[1]);
  assert.deepStrictEqual(linhas, ['4.1.1', '4.1.2'], 'numeros: ' + linhas.join(', '));
});
t('tabela e escopo usam O MESMO numero para o mesmo item', () => {
  const naTabela = /<td class="col-center">([^<]*)<\/td>/.exec(htmlCom)[1];
  const noEscopo = /<h3>(4\.\d+)\s/.exec(htmlCom);
  assert(noEscopo, 'nao achei o titulo do item no escopo');
  assert.strictEqual(naTabela, noEscopo[1], `tabela=${naTabela} escopo=${noEscopo[1]}`);
});
t('o segundo item continua alinhado (4.2 e 4.2.1)', () => {
  const doisItens = gerarHTMLPropostaPremiumV2(
    { numero_proposta: 'X', titulo: 'T', razao_social: 'C' },
    [
      { id: 1, produto_nome: 'A', quantidade: 1, unidade: 'UN', valor_unitario: 1, valor_total: 1, familia_produto: 'F' },
      { id: 2, produto_nome: 'B', quantidade: 1, unidade: 'UN', valor_unitario: 1, valor_total: 1, familia_produto: 'F',
        acessorios: JSON.stringify([{ descricao: 'BOMBA', quantidade: 1, valor_unitario: 10 }]) },
    ],
    { total: 12, dataEmissao: '02/08/2026' }, {}, null, false, true
  );
  const acessorio = /<tr class="linha-acessorio">\s*<td class="col-center">([^<]*)<\/td>/.exec(doisItens);
  assert.strictEqual(acessorio[1], '4.2.1', 'o acessorio do 2o item saiu como ' + acessorio[1]);
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

console.log('\n[o TOTAL soma os acessorios - nos dois calculos]');
// Bug reportado pelo usuario: a tabela listava 3 acessorios de R$ 8.790 e o total continuava
// R$ 64.608,08, so os equipamentos. Causa: o documento tem DOIS calculos de total - um na
// rota do PDF e outro na do preview (/premium) - e eu tinha somado os acessorios so no
// primeiro. As duas checagens abaixo recortam OS DOIS trechos do index.js e exigem que
// chamem totalAcessoriosDosItens; um teste que so olhasse o resultado do template nao pegaria,
// porque o total chega pronto de fora.
const fonteIndex = fs.readFileSync(path.join(__dirname, '..', 'index.js'), 'utf8');
t('os dois calculos de subtotal somam os acessorios', () => {
  const chamadas = (fonteIndex.match(/\}, 0\) \+ totalAcessoriosDosItens\(itensArray\)/g) || []).length;
  assert.strictEqual(chamadas, 2, 'calculos que somam acessorios: ' + chamadas + ' (esperado 2)');
});
t('nao sobrou calculo de subtotal de item sem os acessorios', () => {
  // Assinatura do reduce de subtotal: soma quantidade x valor_unitario com fallback em
  // preco_base. Todo trecho assim tem de terminar somando os acessorios.
  const trechos = [...fonteIndex.matchAll(/parseFloat\(item\.valor_unitario\) \|\|[\s\S]{0,60}?parseFloat\(item\.preco_base\) \|\| 0;[\s\S]{0,120}?\}, 0\)([^;]*)/g)];
  const semAcessorios = trechos.filter((m) => !m[1].includes('totalAcessoriosDosItens'));
  assert.strictEqual(semAcessorios.length, 0,
    'ha ' + semAcessorios.length + ' subtotal(is) que ignoram os acessorios');
});

console.log('\n[secao 4: o escopo lista os acessorios]');
// Pedido do usuario depois de ver a tabela funcionando: "tem que aparecer ACESSORIOS: X, Y, Z".
const textoEscopo = htmlCom.replace(/<[^>]+>/g, '|').replace(/\|+/g, '|');
t('a linha "Acessórios:" aparece no escopo',
  () => assert(/Acess[oó]rios: /.test(textoEscopo), 'nao encontrei a linha no escopo'));
t('lista os nomes separados por virgula', () => {
  const m = /Acess[oó]rios: ([^|]+)/.exec(textoEscopo);
  assert(m, 'linha nao encontrada');
  assert(m[1].includes('TAMPA BIPARTIDA'), m[1]);
  assert(m[1].includes('PLATAFORMA'), m[1]);
  assert(m[1].includes(','), 'deveria separar por virgula');
});
t('quantidade so aparece quando e mais de um', () => {
  const m = /Acess[oó]rios: ([^|]+)/.exec(textoEscopo);
  assert(m[1].includes('PLATAFORMA (2x)'), 'faltou o (2x): ' + m[1]);
  assert(!m[1].includes('(1x)'), '(1x) e ruido: ' + m[1]);
});
t('o escopo NAO repete o preco (ele ja esta na tabela)', () => {
  const m = /Acess[oó]rios: ([^|]+)/.exec(textoEscopo);
  assert(!/4\.500|R\$/.test(m[1]), 'preco vazou para o escopo: ' + m[1]);
});
t('item sem acessorio nao ganha a linha no escopo', () => {
  const html = gerarHTMLPropostaPremiumV2(
    { numero_proposta: 'X', titulo: 'T', razao_social: 'C' },
    [{ id: 1, produto_nome: 'DISPERSOR', quantidade: 1, unidade: 'UN', valor_unitario: 1,
       valor_total: 1, familia_produto: 'F' }],
    { total: 1, dataEmissao: '02/08/2026' }, {}, null, false, true
  );
  assert(!/Acess[oó]rios: /.test(html.replace(/<[^>]+>/g, '|')), 'apareceu linha vazia');
});

console.log('\n[mascara de moeda do campo de valor]');
// A mascara e do cliente (utils/moeda.js), carregada aqui para nao virar mais uma copia -
// em ProdutoForm.js ela ja existia como funcao local e foi extraida para ser uma so.
const moeda = (() => {
  const arq = path.join(__dirname, '..', '..', 'client', 'src', 'utils', 'moeda.js');
  const fonte = fs.readFileSync(arq, 'utf8').replace(/export function/g, 'function');
  // eslint-disable-next-line no-new-func
  return new Function(fonte + '\nreturn { formatarMoedaBR, digitadoParaValor };')();
})();
t('formata com ponto de milhar e virgula decimal',
  () => assert.strictEqual(moeda.formatarMoedaBR(8790), '8.790,00'));
t('valor com centavos', () => assert.strictEqual(moeda.formatarMoedaBR(14776.92), '14.776,92'));
t('vazio continua vazio (para o placeholder aparecer)',
  () => assert.strictEqual(moeda.formatarMoedaBR(''), ''));
t('valor invalido nao vira NaN na tela',
  () => assert.strictEqual(moeda.formatarMoedaBR('abc'), ''));
t('digitacao entra por centavos, como caixa registradora', () => {
  assert.strictEqual(moeda.digitadoParaValor('8'), '0.08');
  assert.strictEqual(moeda.digitadoParaValor('87'), '0.87');
  assert.strictEqual(moeda.digitadoParaValor('879'), '8.79');
  assert.strictEqual(moeda.digitadoParaValor('8790'), '87.9');
});
t('desfaz a propria mascara (ida e volta)',
  () => assert.strictEqual(moeda.formatarMoedaBR(moeda.digitadoParaValor('8.790,00')), '8.790,00'));
t('campo apagado devolve vazio, nao zero',
  () => assert.strictEqual(moeda.digitadoParaValor(''), ''));
t('ProdutoForm nao tem mais copia local da mascara', () => {
  const fonte = fs.readFileSync(path.join(__dirname, '..', '..', 'client', 'src', 'components',
    'ProdutoForm.js'), 'utf8');
  assert(!/const formatarMoedaBR = /.test(fonte), 'a copia local voltou');
  assert(/^import \{[^}]*formatarMoedaBR/m.test(fonte), 'nao importa do utilitario');
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
