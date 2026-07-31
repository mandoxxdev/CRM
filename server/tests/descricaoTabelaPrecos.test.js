/**
 * Coluna DESCRICAO da tabela de precos: modelo automatico + texto editavel.
 *
 * Pedido (31/07/2026): "aqui tem que aparecer o modelo tmb, e tenho que poder digitar no
 * campo de descricao. EX: DISCO DISPERSOR e muito pobre". E, sobre a relacao com a secao 4:
 * "os textos sao independentes".
 *
 * O RISCO REAL desta funcionalidade nao e a edicao em si, e sim a PERSISTENCIA: o texto mora
 * em proposta_itens, a tabela que o PUT /api/propostas/:id APAGA e reinsere inteira a cada
 * salvamento. Sem estar em CAMPOS_PRESERVAR, o texto digitado sumiria no primeiro save feito
 * pelo formulario - exatamente a armadilha que ja nos custou varias tentativas nas variaveis
 * manuais. E o que o segundo bloco de checagens cobre.
 *
 * Executar: node tests/descricaoTabelaPrecos.test.js
 */
const assert = require('assert');
const { gerarHTMLPropostaPremiumV2 } = require('../templates/propostaPremiumV2');
const { mesclarItensPreservandoCampos, CAMPOS_PRESERVAR } = require('../propostaItensDiff');

let ok = 0, total = 0;
const t = (nome, fn) => {
  total++;
  try { fn(); ok++; console.log('  OK   ' + nome); }
  catch (e) { console.error('  FALHA ' + nome + ': ' + e.message); }
};

// Le a celula DESCRICAO da primeira linha da TABELA DE PRECOS (o documento tem outras
// tabelas; mirar pelo titulo evita pegar a errada).
function descricaoNaTabela(item) {
  const html = gerarHTMLPropostaPremiumV2(
    { numero_proposta: 'X', titulo: 'T', razao_social: 'C' },
    [{ quantidade: 1, unidade: 'UN', valor_unitario: 900, valor_total: 900, familia_produto: 'F', ...item }],
    { total: 900, dataEmissao: '31/07/2026' }, {}, null, false, true
  );
  const i = html.indexOf('Tabela de Preços');
  const bloco = html.slice(i, i + 3000);
  const linha = /<tbody>([\s\S]*?)<\/tr>/.exec(bloco);
  const tds = [...linha[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) => m[1]);
  // Decodifica as entidades para comparar TEXTO. O escape em si é desejado e tem checagem
  // própria mais abaixo: o vendedor digita livre nesse campo, então aspas, & e < precisam
  // sair escapados para não quebrar (nem injetar) HTML no documento.
  const semTags = tds[1].replace(/<[^>]+>/g, '');
  const texto = semTags
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .trim();
  return { html: tds[1], texto };
}

console.log('\n[modelo] a descricao deixa de ser so o nome');
t('nome + MODELO', () => assert.strictEqual(
  descricaoNaTabela({ produto_nome: 'DISCO DISPERSOR', modelo: 'DD-320' }).texto,
  'DISCO DISPERSOR, MODELO DD-320'));
t('sem modelo cadastrado, so o nome', () => assert.strictEqual(
  descricaoNaTabela({ produto_nome: 'DISCO DISPERSOR', modelo: '' }).texto, 'DISCO DISPERSOR'));
t('nome que JA contem o modelo nao repete', () => assert.strictEqual(
  descricaoNaTabela({ produto_nome: 'DISCO DISPERSOR DD-320', modelo: 'DD-320' }).texto,
  'DISCO DISPERSOR DD-320'));
t('a comparacao ignora caixa', () => assert.strictEqual(
  descricaoNaTabela({ produto_nome: 'Disco Dispersor dd-320', modelo: 'DD-320' }).texto,
  'Disco Dispersor dd-320'));

console.log('\n[edicao] o texto digitado vence o automatico');
t('descricao_tabela substitui nome + modelo', () => assert.strictEqual(
  descricaoNaTabela({ produto_nome: 'DISCO DISPERSOR', modelo: 'DD-320', descricao_tabela: 'Disco dispersor dentado Ø320mm x 1/8" em aço inox' }).texto,
  'Disco dispersor dentado Ø320mm x 1/8" em aço inox'));
t('texto so com espacos NAO vence (volta ao automatico)', () => assert.strictEqual(
  descricaoNaTabela({ produto_nome: 'DISCO DISPERSOR', modelo: 'DD-320', descricao_tabela: '   ' }).texto,
  'DISCO DISPERSOR, MODELO DD-320'));
t('a celula fica marcada como editavel, com o id do item', () => {
  const r = descricaoNaTabela({ id: 42, produto_nome: 'DISCO', modelo: 'D-1' });
  assert(r.html.includes('data-item-descricao="42"'), r.html);
});

t('texto com HTML e escapado (o campo aceita digitacao livre)', () => {
  const r = descricaoNaTabela({ produto_nome: 'X', descricao_tabela: '<script>alert(1)</script> & "aspas"' });
  assert(!r.html.includes('<script>'), 'HTML digitado nao pode entrar cru no documento');
  assert(r.html.includes('&lt;'), r.html);
  assert.strictEqual(r.texto, '<script>alert(1)</script> & "aspas"');
});

console.log('\n[independencia] a secao 4 nao e afetada');
t('secao 4 mostra o nome tecnico, nao o texto comercial', () => {
  const html = gerarHTMLPropostaPremiumV2(
    { numero_proposta: 'X', titulo: 'T', razao_social: 'C' },
    [{ id: 1, produto_nome: 'DISCO DISPERSOR', descricao: 'DISCO DISPERSOR', modelo: 'DD-320',
       descricao_tabela: 'TEXTO COMERCIAL SO DA TABELA', quantidade: 1, unidade: 'UN',
       valor_unitario: 900, valor_total: 900, familia_produto: 'F' }],
    { total: 900, dataEmissao: '31/07/2026' }, {}, null, false, true
  );
  const texto = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  assert(/Equipamento: DISCO DISPERSOR/.test(texto), 'secao 4 deveria manter o nome tecnico');
  assert(texto.includes('TEXTO COMERCIAL SO DA TABELA'), 'o texto editado deveria aparecer na tabela');
  const ocorrencias = (texto.match(/TEXTO COMERCIAL SO DA TABELA/g) || []).length;
  assert.strictEqual(ocorrencias, 1, 'o texto da tabela nao pode vazar para a secao 4');
});

console.log('\n[persistencia] sobrevive ao salvamento que recria os itens');
// O PUT apaga e reinsere TODOS os itens. O formulario nao envia descricao_tabela, entao so
// a mesclagem por CAMPOS_PRESERVAR impede a perda.
t('descricao_tabela esta na lista de campos preservados',
  () => assert(CAMPOS_PRESERVAR.includes('descricao_tabela'), CAMPOS_PRESERVAR.join(', ')));

const itensNoBanco = [
  { id: 10, codigo_produto: 'D-1', descricao: 'DISCO DISPERSOR', modelo: 'DD-320', descricao_tabela: 'Texto que o vendedor digitou' },
];
// Payload como o formulario manda: sem descricao_tabela.
const doFormulario = [
  { codigo_produto: 'D-1', descricao: 'DISCO DISPERSOR', quantidade: 1, valor_unitario: 900 },
];
const mesclado = mesclarItensPreservandoCampos(itensNoBanco, doFormulario);
t('o texto digitado sobrevive ao save do formulario',
  () => assert.strictEqual(mesclado[0].descricao_tabela, 'Texto que o vendedor digitou'));
t('e o modelo continua preservado junto',
  () => assert.strictEqual(mesclado[0].modelo, 'DD-320'));

// Item NOVO na proposta nao pode herdar a descricao de outro.
const comItemNovo = mesclarItensPreservandoCampos(itensNoBanco, [
  ...doFormulario,
  { codigo_produto: 'D-2', descricao: 'OUTRO DISCO', quantidade: 1, valor_unitario: 500 },
]);
t('item novo nao herda a descricao de outro item',
  () => assert.strictEqual(comItemNovo[1].descricao_tabela, undefined));

// E se o formulario ENVIAR o campo (ex.: tela futura), o valor enviado deve vencer.
const comEnvio = mesclarItensPreservandoCampos(itensNoBanco, [
  { codigo_produto: 'D-1', descricao: 'DISCO DISPERSOR', descricao_tabela: 'texto novo' },
]);
t('valor enviado explicitamente vence o preservado',
  () => assert.strictEqual(comEnvio[0].descricao_tabela, 'texto novo'));

console.log(`\n${ok}/${total} checagens`);
console.log(ok === total ? '0 failed' : `${total - ok} failed`);
process.exit(ok === total ? 0 : 1);
