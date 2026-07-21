/**
 * Testa os atributos data-clausula-key/data-clausula-campo usados pela edição inline
 * da seção 5 (cláusulas). Executar: node tests/propostaClausulasInline.test.js
 */
const assert = require('assert');
const { gerarHTMLPropostaPremiumV2 } = require('../templates/propostaPremiumV2');

let passed = 0;
let failed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failed++;
    console.error(`  ✗ ${name}: ${e.message}`);
  }
}

const proposta = {
  numero_proposta: '01260508/R00',
  razao_social: 'Empresa Teste Ltda',
  cnpj: '12.345.678/0001-99',
  cliente_email: 'teste@exemplo.com.br',
  responsavel_nome: 'Fulano de Tal',
};
const itens = [{
  produto_nome: 'Equipamento Teste',
  quantidade: 1, unidade: 'UN', modelo: 'MOD-1',
  valor_unitario: 1000, valor_total: 1000,
}];
const totais = { subtotal: 1000, icms: 0, ipi: 0, total: 1000, dataEmissao: '01/01/2026', dataValidade: '15/01/2026' };

test('cláusula persistida (com id) gera data-clausula-key igual ao id', () => {
  const templateConfig = {
    clausulas_custom: [
      { id: 42, titulo: '5.21 FORO', conteudo: 'Texto do foro.' },
    ],
  };
  const html = gerarHTMLPropostaPremiumV2(proposta, itens, totais, templateConfig, null, false, true);
  assert.ok(html.includes('data-clausula-key="42"'), 'esperava data-clausula-key="42"');
  assert.ok(/data-clausula-key="42"[^>]*>\s*<h3 data-clausula-campo="titulo">/.test(html)
    || html.includes('<h3 data-clausula-campo="titulo">5.21 FORO'), 'esperava <h3 data-clausula-campo="titulo"> com o título');
  assert.ok(html.includes('data-clausula-campo="conteudo"'), 'esperava data-clausula-campo="conteudo" no container do texto');
});

test('cláusula default (sem id, com numero) gera data-clausula-key="default-{numero}"', () => {
  const templateConfig = {
    clausulas_custom: [
      { numero: '5.4', titulo: 'GARANTIA', conteudo: 'Texto da garantia.' },
    ],
  };
  const html = gerarHTMLPropostaPremiumV2(proposta, itens, totais, templateConfig, null, false, true);
  assert.ok(html.includes('data-clausula-key="default-5.4"'), 'esperava data-clausula-key="default-5.4"');
});

test('primeira cláusula da lista também recebe os atributos (fica aninhada no wrapper five-intro-group)', () => {
  const templateConfig = {
    clausulas_custom: [
      { id: 1, titulo: '5.1 PRAZO DE ENTREGA', conteudo: 'Texto 1.' },
      { id: 2, titulo: '5.2 TRANSPORTE', conteudo: 'Texto 2.' },
    ],
  };
  const html = gerarHTMLPropostaPremiumV2(proposta, itens, totais, templateConfig, null, false, true);
  assert.ok(html.includes('data-clausula-key="1"'), 'primeira cláusula (id 1) deveria ter data-clausula-key="1"');
  assert.ok(html.includes('data-clausula-key="2"'), 'segunda cláusula (id 2) deveria ter data-clausula-key="2"');
  const idxWrapper = html.indexOf('five-intro-group');
  const idxKey1 = html.indexOf('data-clausula-key="1"');
  assert.ok(idxKey1 > idxWrapper && idxKey1 < html.indexOf('data-clausula-key="2"'), 'data-clausula-key="1" deveria aparecer dentro do wrapper five-intro-group, antes da key="2"');
});

test('cláusula default (sem id, com numero) renderiza título COM o número prefixado (bug crítico da revisão final)', () => {
  const templateConfig = {
    clausulas_custom: [
      { numero: '5.4', titulo: 'GARANTIA', conteudo: 'Texto da garantia.' },
    ],
  };
  const html = gerarHTMLPropostaPremiumV2(proposta, itens, totais, templateConfig, null, false, true);
  assert.ok(html.includes('<h3 data-clausula-campo="titulo">5.4 GARANTIA</h3>'), 'esperava título numerado "5.4 GARANTIA" para casar com o formato persistido pelo /clausulas/inicializar');
});

test('cláusula persistida (com id, título já numerado) mantém o título inalterado, sem duplicar número', () => {
  const templateConfig = {
    clausulas_custom: [
      { id: 42, titulo: '5.21 FORO', conteudo: 'Texto do foro.' },
    ],
  };
  const html = gerarHTMLPropostaPremiumV2(proposta, itens, totais, templateConfig, null, false, true);
  assert.ok(html.includes('<h3 data-clausula-campo="titulo">5.21 FORO</h3>'), 'esperava título "5.21 FORO" sem duplicação de número');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
