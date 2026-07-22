/**
 * #4 — Capa mostra telefone/email vindos do cadastro do cliente (com override
 * da proposta tendo prioridade). Executar: node tests/propostaCapaContatoCadastro.test.js
 */
const assert = require('assert');
const { gerarHTMLPropostaPremiumV2 } = require('../templates/propostaPremiumV2');
let passed = 0, failed = 0;
function test(n, f) { try { f(); passed++; console.log('  ✓ ' + n); } catch (e) { failed++; console.error('  ✗ ' + n + ': ' + e.message); } }

const base = { numero_proposta: '1', razao_social: 'ACME' };

test('telefone do cadastro aparece na capa quando nao ha override', () => {
  const html = gerarHTMLPropostaPremiumV2({ ...base, cliente_telefone_cadastro: '(11) 4513-9570' }, [], { total: 0 }, null, null, false, true);
  assert(html.includes('cover-field-telefone'), 'faltou a linha de telefone');
  assert(html.includes('(11) 4513-9570'), 'faltou o telefone do cadastro');
});
test('override da proposta tem prioridade sobre o cadastro (telefone)', () => {
  const html = gerarHTMLPropostaPremiumV2({ ...base, cliente_telefone: '(11) 99999-0000', cliente_telefone_cadastro: '(11) 4513-9570' }, [], { total: 0 }, null, null, false, true);
  assert(html.includes('(11) 99999-0000'));
});
test('telefone e editavel inline (span data-edit="cliente_telefone"), como nome/email', () => {
  const html = gerarHTMLPropostaPremiumV2({ ...base, cliente_telefone_cadastro: '(11) 4513-9570' }, [], { total: 0 }, null, null, false, true);
  assert(/cover-field-telefone[\s\S]{0,120}data-edit="cliente_telefone"/.test(html), 'faltou span data-edit no telefone da capa');
});
test('sem telefone em lugar nenhum: mostra travessao', () => {
  const html = gerarHTMLPropostaPremiumV2(base, [], { total: 0 }, null, null, false, true);
  assert(/cover-field-telefone[\s\S]{0,200}—/.test(html), 'esperado fallback —');
});
test('email cai para o cadastro quando a proposta nao tem override', () => {
  const html = gerarHTMLPropostaPremiumV2({ ...base, cliente_email_cadastro: 'cadastro@acme.com' }, [], { total: 0 }, null, null, false, true);
  assert(html.includes('cadastro@acme.com'));
});
test('email da proposta (override) tem prioridade', () => {
  const html = gerarHTMLPropostaPremiumV2({ ...base, cliente_email: 'override@acme.com', cliente_email_cadastro: 'cadastro@acme.com' }, [], { total: 0 }, null, null, false, true);
  assert(html.includes('override@acme.com'));
  assert(!html.includes('cadastro@acme.com'));
});

console.log(`\n${passed} passed, ${failed} failed`); process.exit(failed ? 1 : 0);
