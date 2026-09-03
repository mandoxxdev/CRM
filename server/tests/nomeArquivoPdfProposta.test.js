/**
 * Nome do arquivo do PDF da proposta.
 *
 * Pedido (02/08/2026): "ao gerar o pdf da proposta, depois do REV00 eu queria que tivesse um
 * - NOME DO CLIENTE, para nao ficar tao generico". Na pasta de downloads as propostas se
 * acumulam e "proposta-127-01-MH-2026-REV00" nao diz de quem e.
 *
 * O nome era montado em CINCO lugares (servidor + quatro telas), cada um com uma sanitizacao
 * propria - o do preview ja tinha divergido. Agora o servidor decide e manda no
 * Content-Disposition; as telas leem o cabecalho. Este teste cobre as duas pontas:
 * a funcao real do servidor e o leitor do cabecalho do cliente.
 *
 * As funcoes sao RECORTADAS DOS ARQUIVOS REAIS, nao reimplementadas: teste com copia da
 * funcao ja me deixou entregar codigo quebrado com o verde na tela (ver filtroDashboard).
 *
 * Executar: node tests/nomeArquivoPdfProposta.test.js
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

let ok = 0, total = 0;
const t = (nome, fn) => {
  total++;
  try { fn(); ok++; console.log('  OK   ' + nome); }
  catch (e) { console.error('  FALHA ' + nome + ': ' + e.message); }
};

// --- funcao do SERVIDOR, recortada do index.js ---
function carregarDoServidor() {
  const fonte = fs.readFileSync(path.join(__dirname, '..', 'index.js'), 'utf8');
  const inicio = fonte.indexOf('function nomeArquivoPdfProposta(proposta, idFallback) {');
  if (inicio < 0) throw new Error('nomeArquivoPdfProposta nao encontrada no index.js');
  const fim = fonte.indexOf('\n}\n', inicio);
  const corpo = fonte.slice(inicio, fim + 2);
  // eslint-disable-next-line no-new-func
  return new Function(corpo + '\nreturn nomeArquivoPdfProposta;')();
}

// --- leitor de cabecalho do CLIENTE, recortado do modulo real ---
function carregarDoCliente() {
  const arq = path.join(__dirname, '..', '..', 'client', 'src', 'utils', 'nomeArquivoPdf.js');
  const fonte = fs.readFileSync(arq, 'utf8');
  const inicio = fonte.indexOf('export function nomeArquivoDoCabecalho(headers) {');
  if (inicio < 0) throw new Error('nomeArquivoDoCabecalho nao encontrada no cliente');
  const fim = fonte.indexOf('\n}\n', inicio);
  const corpo = fonte.slice(inicio, fim + 2).replace('export function', 'function');
  // eslint-disable-next-line no-new-func
  return new Function(corpo + '\nreturn nomeArquivoDoCabecalho;')();
}

const nomeArquivo = carregarDoServidor();
const lerCabecalho = carregarDoCliente();

console.log('\n[o pedido: numero + cliente]');
t('numero e cliente juntos', () => assert.strictEqual(
  nomeArquivo({ numero_proposta: '127-01-MH-2026-REV00', razao_social: 'DURIN TINTAS E VERNIZES LTDA' }),
  'proposta-127-01-MH-2026-REV00 - DURIN TINTAS E VERNIZES LTDA.pdf'));
t('o separador e " - ", como pedido', () => assert(
  nomeArquivo({ numero_proposta: 'X', razao_social: 'Y' }).includes('X - Y')));

console.log('\n[quando falta o cliente]');
t('sem razao social, usa o nome fantasia', () => assert.strictEqual(
  nomeArquivo({ numero_proposta: 'X', razao_social: '', nome_fantasia: 'DURIN' }),
  'proposta-X - DURIN.pdf'));
t('a razao social tem precedencia sobre o fantasia', () => assert.strictEqual(
  nomeArquivo({ numero_proposta: 'X', razao_social: 'RAZAO', nome_fantasia: 'FANTASIA' }),
  'proposta-X - RAZAO.pdf'));
t('sem cliente nenhum, volta ao formato antigo (nao deixa " - " solto)', () => assert.strictEqual(
  nomeArquivo({ numero_proposta: 'X' }), 'proposta-X.pdf'));
t('so espacos no cliente contam como vazio', () => assert.strictEqual(
  nomeArquivo({ numero_proposta: 'X', razao_social: '   ' }), 'proposta-X.pdf'));
t('sem numero, cai no id', () => assert.strictEqual(
  nomeArquivo({ razao_social: 'CLIENTE' }, 42), 'proposta-42 - CLIENTE.pdf'));
t('sem nada, nao gera nome quebrado', () => assert.strictEqual(
  nomeArquivo({}), 'proposta-sem-numero.pdf'));

console.log('\n[caracteres que o Windows recusa em nome de arquivo]');
// Razao social com "/" e comum (ex.: "COM/IND"), e barra quebra o download no Windows.
t('barra vira hifen', () => assert.strictEqual(
  nomeArquivo({ numero_proposta: 'X', razao_social: 'COM/IND LTDA' }),
  'proposta-X - COM-IND LTDA.pdf'));
t('nenhum caractere proibido sobrevive', () => {
  const r = nomeArquivo({ numero_proposta: 'A\\B:C*D?E"F<G>H|I', razao_social: 'J/K' });
  assert(!/[\\/:*?"<>|]/.test(r.replace(/\.pdf$/, '')), r);
});
t('quebra de linha na razao social nao vaza para o cabecalho', () => {
  const r = nomeArquivo({ numero_proposta: 'X', razao_social: 'LINHA1\r\nLINHA2' });
  assert(!/[\r\n]/.test(r), JSON.stringify(r));
});
t('acento e preservado (nao e caractere proibido)', () => assert.strictEqual(
  nomeArquivo({ numero_proposta: 'X', razao_social: 'CONSTRUÇÃO E MANUTENÇÃO' }),
  'proposta-X - CONSTRUÇÃO E MANUTENÇÃO.pdf'));

console.log('\n[limite de tamanho]');
t('razao social gigante e cortada, mas o numero fica inteiro', () => {
  const numero = '127-01-MH-2026-REV00';
  const r = nomeArquivo({ numero_proposta: numero, razao_social: 'A'.repeat(300) });
  assert(r.includes(numero), 'o numero da proposta nao pode ser cortado');
  assert(r.length < 120, 'nome longo demais: ' + r.length);
});

console.log('\n[o cliente le o cabecalho que o servidor manda]');
const montarCabecalho = (nome) => ({ 'content-disposition': `attachment; filename="${nome}"` });
t('le o nome com cliente junto', () => {
  const nome = nomeArquivo({ numero_proposta: '127-01-MH-2026-REV00', razao_social: 'DURIN TINTAS' });
  assert.strictEqual(lerCabecalho(montarCabecalho(nome)), nome);
});
t('aceita a chave com maiuscula (nem todo adaptador normaliza)', () => assert.strictEqual(
  lerCabecalho({ 'Content-Disposition': 'attachment; filename="proposta-X - Y.pdf"' }),
  'proposta-X - Y.pdf'));
t('sem cabecalho devolve null, para a tela usar o fallback',
  () => assert.strictEqual(lerCabecalho({}), null));
t('sem headers nenhum devolve null',
  () => assert.strictEqual(lerCabecalho(null), null));
t('filename sem aspas tambem e lido', () => assert.strictEqual(
  lerCabecalho({ 'content-disposition': 'attachment; filename=proposta-X.pdf' }), 'proposta-X.pdf'));
t('filename*=UTF-8 tem precedencia e e decodificado', () => assert.strictEqual(
  lerCabecalho({ 'content-disposition': "attachment; filename=\"ruim.pdf\"; filename*=UTF-8''proposta-X%20-%20CONSTRU%C3%87%C3%83O.pdf" }),
  'proposta-X - CONSTRUÇÃO.pdf'));

console.log('\n[as telas nao remontam o nome por conta propria]');
// A duplicacao era o problema original: cinco lugares, cinco sanitizacoes.
['PropostaDetalhe.js', 'PropostaForm.js', 'PropostaPreviewEditavel.js'].forEach((tela) => {
  const caminho = path.join(__dirname, '..', '..', 'client', 'src', 'components', 'proposta', tela);
  const fonte = fs.readFileSync(caminho, 'utf8');
  t(tela + ' usa o helper', () => {
    assert(/^import \{ nomeArquivoPdfProposta \}/m.test(fonte), 'falta o import em ' + tela);
    assert(fonte.includes('nomeArquivoPdfProposta('), 'nao chama o helper em ' + tela);
  });
});
t('o download do PDF gerado nao monta mais a string na mao', () => {
  const preview = fs.readFileSync(path.join(__dirname, '..', '..', 'client', 'src', 'components',
    'proposta', 'PropostaPreviewEditavel.js'), 'utf8');
  assert(!/a\.download = `proposta-\$\{numeroProposta/.test(preview),
    'o preview voltou a montar o nome sozinho');
});

console.log(`\n${ok}/${total} checagens`);
console.log(ok === total ? '0 failed' : `${total - ok} failed`);
process.exit(ok === total ? 0 : 1);
