/**
 * T1 — NOME DO CONTATO do cliente na capa, no mesmo formato dos demais campos
 * (rótulo em cima / valor embaixo) e EDITÁVEL inline (span data-edit="cliente_contato").
 *
 * Encadeamento de fallback espelha o de email/telefone:
 *   proposta.cliente_contato (override da proposta / customização do preview)
 *     -> proposta.cliente_contato_cadastro (alias de clientes.contato_principal)
 *     -> proposta.contato_principal (nome cru da coluna, caso a query traga assim)
 *     -> '—'
 *
 * Executar: node tests/propostaCapaContato.test.js
 */
const assert = require('assert');
const { gerarHTMLPropostaPremiumV2 } = require('../templates/propostaPremiumV2');

let passed = 0, failed = 0;
function test(n, f) { try { f(); passed++; console.log('  ✓ ' + n); } catch (e) { failed++; console.error('  ✗ ' + n + ': ' + e.message); } }

const base = { numero_proposta: '1', razao_social: 'ACME' };
const gerar = (p, forPdfServer = false) => gerarHTMLPropostaPremiumV2({ ...base, ...p }, [], { total: 0 }, null, null, forPdfServer, true);

test('capa tem a linha do contato com rótulo próprio', () => {
  const html = gerar({ cliente_contato: 'MARIA SILVA' });
  assert(html.includes('cover-field-contato'), 'faltou a linha .cover-field-contato');
  assert(/cover-field-contato[\s\S]{0,160}<span class="cover-field-rotulo">Contato:<\/span>/.test(html),
    'faltou o rótulo "Contato:" no mesmo formato dos demais (span.cover-field-rotulo)');
  assert(html.includes('MARIA SILVA'), 'faltou o valor do contato');
});

test('contato é editável inline (span data-edit="cliente_contato"), como o nome do cliente', () => {
  const html = gerar({ cliente_contato: 'MARIA SILVA' });
  assert(/cover-field-contato[\s\S]{0,200}data-edit="cliente_contato"/.test(html),
    'faltou span data-edit="cliente_contato" na linha do contato');
});

// Ordem da capa: primeiro a IDENTIFICAÇÃO da empresa (razão social + CNPJ), depois os
// dados de CONTATO (pessoa, e-mail, telefone). Antes o CNPJ ficava entre o nome e o
// contato, separando a empresa da própria identificação fiscal.
test('capa identifica a empresa (nome + CNPJ) antes dos dados de contato', () => {
  const html = gerar({ cliente_contato: 'MARIA SILVA' });
  // Recorta o BLOCO da capa: os mesmos nomes de classe também aparecem no <style>,
  // e comparar índices do documento inteiro compararia com as regras CSS, não com os campos.
  const bloco = html.match(/<div class="cover-client-info">[\s\S]*?<\/div>/);
  assert(bloco, 'não achei o bloco .cover-client-info');
  const pos = (campo) => bloco[0].indexOf(`cover-field-${campo}`);
  const [iContratante, iCnpj, iContato, iEmail, iTelefone] =
    ['contratante', 'cnpj', 'contato', 'email', 'telefone'].map(pos);
  assert([iContratante, iCnpj, iContato, iEmail, iTelefone].every((i) => i > -1), 'algum campo da capa sumiu');
  assert(iContratante < iCnpj, 'CNPJ deveria vir logo depois de EMPRESA CONTRATANTE');
  assert(iCnpj < iContato, 'o contato deveria vir DEPOIS do CNPJ');
  assert(iContato < iEmail && iEmail < iTelefone, 'contato, e-mail e telefone devem ficar juntos, nessa ordem');
});

test('cai para o contato do CADASTRO (clientes.contato_principal) quando a proposta não tem override', () => {
  const html = gerar({ cliente_contato_cadastro: 'LUCAS MORAIS' });
  assert(html.includes('LUCAS MORAIS'), 'faltou o contato vindo do cadastro do cliente');
});

test('aceita também a coluna crua contato_principal (mesma origem, sem alias na query)', () => {
  const html = gerar({ contato_principal: 'JOÃO PEDRO' });
  assert(html.includes('JOÃO PEDRO'), 'faltou o contato vindo de contato_principal');
});

test('override da proposta/customização tem prioridade sobre o cadastro', () => {
  const html = gerar({ cliente_contato: 'CONTATO DA PROPOSTA', cliente_contato_cadastro: 'CONTATO DO CADASTRO' });
  assert(html.includes('CONTATO DA PROPOSTA'), 'faltou o override');
  assert(!html.includes('CONTATO DO CADASTRO'), 'o cadastro não deveria aparecer quando há override');
});

test('sem contato em lugar nenhum: mostra travessão (não some a linha)', () => {
  const html = gerar({});
  assert(/cover-field-contato[\s\S]{0,240}—/.test(html), 'esperado fallback —');
});

test('o valor é escapado (não injeta HTML na capa)', () => {
  const html = gerar({ cliente_contato: '<script>x</script>' });
  assert(!html.includes('<script>x</script>'), 'valor do contato entrou sem escape');
  assert(html.includes('&lt;script&gt;'), 'esperado valor escapado');
});

test('vale nos dois caminhos: preview e PDF', () => {
  for (const forPdf of [false, true]) {
    const html = gerar({ cliente_contato: 'MARIA SILVA' }, forPdf);
    assert(html.includes('cover-field-contato'), `faltou o contato (forPdfServer=${forPdf})`);
    assert(html.includes('data-edit="cliente_contato"'), `faltou o data-edit (forPdfServer=${forPdf})`);
  }
});

console.log(`\n${passed} passed, ${failed} failed`); process.exit(failed ? 1 : 0);
