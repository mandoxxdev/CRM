/**
 * Proposta bilíngue — o documento gerado pelo template (sem navegador). Spec: specs/proposta-bilingue/README.md.
 * A paginação (pares na mesma página, nada vazando) é provada no navegador: tests/propostaBilinguePaginacao.test.js.
 *
 *   BI-T01 RN-BI.01  pt-BR (sem idioma, 'pt-BR', moeda BRL, incoterm vazio) sai BYTE A BYTE igual à base de antes da etapa,
 *                    nos 3 casos, PDF e preview — inclusive o script de paginação
 *   BI-T02 RN-BI.02  en/es: o corpo vira pares; nenhum atributo do editor (data-clausula-*, data-variavel-*, data-item-descricao)
 *                    — o bilíngue é somente leitura (Fase 2, C1-C3)
 *   BI-T03 RN-BI.04  tradução da memória entra; sem tradução, pendente com o PT; título traduzido pela chave SEM número (I7)
 *   BI-T04 RN-BI.04  textos fixos do dicionário (CONTRATANTE nunca vira "Contractor"); dados da capa não vão para o tradutor (I12)
 *   BI-T05 RN-BI.08  moeda: cada metade no formato da sua língua; pt-BR com USD usa US$
 *   BI-T06 RN-BI.09/10 incoterm junto da tabela de preços; FINAME fora do bilíngue
 *   BI-T07 I5        marcador {{…}} na chave sai como entidade e a troca de marcadores não a alcança; o texto visível é trocado
 *   BI-T08 RN-BI.03  as guardas do paginador (par e linha de tabela indivisíveis; sumário pela metade PT) só existem no bilíngue
 *
 * Executar: node tests/api/propostaBilingueTemplate.api.test.js
 */
const assert = require('assert');
const { CASOS, BASE, htmlDoCaso, hashDoCaso } = require('../helpers/propostaBaseHtml');

let passed = 0; let failed = 0;
function test(nome, fn) {
  try { fn(); passed++; console.log('  ✓ ' + nome); } catch (e) { failed++; console.log('  ✗ ' + nome + '\n      ' + e.message); }
}
const conta = (h, s) => h.split(s).length - 1;
// Só o corpo do documento (sem o <style> e o <script>), para contar atributos sem pegar o código.
const corpo = (h) => h.replace(/<style[\s\S]*?<\/style>/g, '').replace(/<script[\s\S]*?<\/script>/g, '');

test('BI-T01 RN-BI.01 pt-BR byte a byte igual a base (3 casos x PDF/preview x 3 formas de "pt-BR")', () => {
  for (const nome of Object.keys(CASOS)) {
    for (const [modo, pdf] of [['pdf', true], ['preview', false]]) {
      for (const extra of [{}, { idioma: 'pt-BR' }, { idioma: '', moeda: 'BRL', incoterm: '' }, { idioma: 'fr', moeda: 'XYZ' }]) {
        assert.strictEqual(hashDoCaso(nome, extra, pdf), BASE[modo][nome], `${nome}/${modo} ${JSON.stringify(extra)} mudou o documento pt-BR`);
      }
    }
  }
});

const en = htmlDoCaso('projetoConceitual', { idioma: 'en', traducoes: { 'OBJETIVO DA PROPOSTA': 'PURPOSE OF THE PROPOSAL',
  'O desenvolvimento será conduzido em duas etapas:': 'The work will be carried out in two stages:' } }, false);
const es = htmlDoCaso('equipamento', { idioma: 'es', moeda: 'EUR', incoterm: 'CIF – Puerto de Valencia', traducoes: { 'Masseira Bimix': 'Amasadora Bimix' } }, false);

test('BI-T02 RN-BI.02 en/es: corpo em pares, sem nenhum atributo do editor', () => {
  for (const [nome, h] of [['en', en], ['es', es]]) {
    const c = corpo(h);
    assert.ok(conta(c, 'class="bi-par') > 40, `${nome}: poucos pares`);
    for (const attr of ['data-clausula-key', 'data-clausula-campo', 'data-clausula-slot', 'data-variavel-manual', 'data-item-descricao']) {
      assert.strictEqual(conta(c, attr + '='), 0, `${nome}: ${attr} no documento bilingue (o editor corromperia o salvamento)`);
    }
    // os campos da capa continuam UMA vez cada (nunca duplicados numa copia traduzida)
    for (const campo of ['cliente_nome', 'cliente_contato', 'cliente_email', 'cliente_telefone']) assert.strictEqual(conta(c, `data-edit="${campo}"`), 1, campo);
  }
});

test('BI-T03 RN-BI.04 memoria, pendente com o PT e titulo pela chave sem numero', () => {
  // o numero fica FORA do span com a chave: a correcao do painel nunca grava "1. " (sairia "1. 1. TITULO")
  assert.ok(en.includes('<span class="bi-tr" lang="en">1. <span data-tr-origem="OBJETIVO DA PROPOSTA" data-tr-texto="PURPOSE OF THE PROPOSAL">PURPOSE OF THE PROPOSAL</span></span>'), 'titulo traduzido com o numero do PT');
  assert.ok(en.includes('<p data-tr-origem="O desenvolvimento será conduzido em duas etapas:" data-tr-texto="The work will be carried out in two stages:">The work will be carried out in two stages:</p>'));
  assert.ok(en.includes('<span class="bi-tr" lang="en">2. <span class="bi-pendente" data-tr-origem="METODOLOGIA" data-traduzir="METODOLOGIA">METODOLOGIA</span></span>'), 'titulo sem traducao: pendente, chave sem numero');
  assert.ok(es.includes('data-tr-origem="Masseira Bimix" data-tr-texto="Amasadora Bimix">Amasadora Bimix</span>'), 'nome do equipamento da memoria');
  assert.ok(conta(corpo(en), ' data-traduzir="') > 50, 'o resto sai pendente');
});

test('BI-T04 RN-BI.04 dicionario nos textos fixos; dados da capa fora do tradutor', () => {
  assert.ok(en.includes('PROPOSAL FOR THE SUPPLY OF SPECIALIZED SERVICES') || en.includes('PROPOSAL FOR THE SUPPLY OF INDUSTRIAL EQUIPMENT'));
  assert.ok(en.includes('EMPRESA CONTRATANTE / CONTRACTING COMPANY:'));
  assert.ok(en.includes('5. GENERAL TERMS OF SUPPLY') && en.includes('4. SCOPE OF SUPPLY'));
  assert.ok(es.includes('4. ALCANCE DEL SUMINISTRO') && es.includes('Firma y sello de la empresa CONTRATANTE'));
  assert.ok(!/contractor\b[^"]*signature|Signature[^<]*CONTRACTOR\b/i.test(en), 'CONTRATANTE virou Contractor na assinatura');
  assert.ok(!/data-tr-origem="CLIENTE TESTE LTDA"/.test(en), 'o nome do cliente nao pode ir para a memoria de traducao');
});

test('BI-T05 RN-BI.08 moeda por coluna; pt-BR em dolar usa US$', () => {
  // \s: o Intl separa simbolo e numero com espaco INSEPARAVEL (U+00A0)
  assert.ok(/€\s150\.000,00/.test(es) && /150\.000,00\s€/.test(es), 'EUR em pt-BR e em es-ES');
  const usd = htmlDoCaso('pecas', { moeda: 'USD' });
  assert.ok(/US\$\s900,00/.test(usd) && !/R\$\s900,00/.test(usd), 'pt-BR em dolar');
  const enUsd = htmlDoCaso('pecas', { idioma: 'en', moeda: 'USD' });
  assert.ok(/US\$\s900,00/.test(enUsd) && enUsd.includes('$900.00'));
});

test('BI-T06 RN-BI.09/10 incoterm sob a tabela de precos; FINAME fora do bilingue', () => {
  assert.ok(es.includes('<strong>Incoterm:</strong> CIF – Puerto de Valencia'));
  // a TABELA (nao a palavra no CSS do <head>, que vinha antes de tudo e fazia esta checagem nunca falhar — Fase 5, 5)
  const posTabela = es.indexOf('<table class="table bi-tabela bi-tabela-precos"');
  assert.ok(posTabela > es.indexOf('<body') && es.indexOf('<strong>Incoterm:</strong>') > posTabela, 'incoterm depois da tabela');
  assert.ok(!es.includes('Tabela Ref. FINAME') && !en.includes('Tabela Ref. FINAME'), 'FINAME no bilingue');
  assert.ok(htmlDoCaso('equipamento', {}).includes('Tabela Ref. FINAME'), 'FINAME some do pt-BR (controle)');
  assert.ok(htmlDoCaso('equipamento', { incoterm: 'FOB – Santos' }).includes('<strong>Incoterm:</strong> FOB – Santos'), 'incoterm tambem no pt-BR');
});

test('BI-T07 I5 marcador na chave escapado; texto visivel trocado', () => {
  const c = CASOS.projetoConceitual.config();
  c.clausulas_custom = c.clausulas_custom.map((cl, i) => (i === 3 ? { ...cl, conteudo: '<p>Proposta para {{cliente.nome}} conforme escopo.</p>' } : cl));
  const { gerarHTMLPropostaPremiumV2 } = require('../../templates/propostaPremiumV2');
  const h = gerarHTMLPropostaPremiumV2({ ...CASOS.projetoConceitual.proposta }, CASOS.projetoConceitual.itens, { total: 1 }, { ...c, idioma: 'en' }, null, true, true);
  assert.ok(h.includes('data-tr-origem="Proposta para &#123;&#123;cliente.nome&#125;&#125; conforme escopo."'), 'a chave tem de manter o marcador');
  assert.ok(!h.includes('>Proposta para {{cliente.nome}} conforme escopo.<'), 'o texto visivel tem de sair com o marcador trocado');
  // Fase 5, critico 1: traduzido, a traducao CRUA (com o marcador) vai no atributo — e dela que o painel parte para corrigir
  const h2 = gerarHTMLPropostaPremiumV2({ ...CASOS.projetoConceitual.proposta }, CASOS.projetoConceitual.itens, { total: 1 },
    { ...c, idioma: 'en', traducoes: { 'Proposta para {{cliente.nome}} conforme escopo.': 'Proposal for {{cliente.nome}} as per scope.' } }, null, true, true);
  assert.ok(h2.includes('data-tr-texto="Proposal for &#123;&#123;cliente.nome&#125;&#125; as per scope."'), 'traducao crua com o marcador no atributo');
  assert.ok(!h2.includes('>Proposal for {{cliente.nome}} as per scope.<'), 'o visivel da traducao tambem tem o marcador trocado');
});

test('BI-T08 RN-BI.03 guardas do paginador e do sumario so no bilingue', () => {
  const pt = htmlDoCaso('equipamento', {});
  const guarda = "el.tagName === 'TR' || (el.classList && el.classList.contains('bi-par'))";
  assert.strictEqual(conta(en, guarda), 2, 'divisor de blocos e corte de texto, as duas guardas');
  assert.strictEqual(conta(pt, guarda), 0);
  assert.ok(en.includes("(h.querySelector('.bi-pt') || h).textContent") && !pt.includes(".bi-pt') || h)"));
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
