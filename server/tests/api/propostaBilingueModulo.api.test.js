/**
 * Proposta bilíngue — o módulo puro (server/propostaBilingue.js). Spec: specs/proposta-bilingue/README.md.
 *
 *   BI-M01 idioma: só 'en' e 'es' ligam o bilíngue; vazio, 'pt', 'PT-BR' e lixo = pt-BR (RN-BI.01)
 *   BI-M02 moeda por coluna: BRL em pt-BR igual ao moedaBRL de antes; USD/EUR no formato de cada língua (RN-BI.08)
 *   BI-M03 chave da memória: espaços e quebras não fazem dois textos diferentes
 *   BI-M04 segmentar: texto puro do editor (linha em branco), <p>, listas, texto solto entre blocos — nada se perde
 *   BI-M05 pares: um .bi-par por parágrafo e por item de lista; a metade PT guarda o HTML; tradução da memória ou pendente (RN-BI.03/04)
 *   BI-M06 dicionário: termos de contrato (CONTRATANTE nunca vira "Contractor"); sem chave = PT
 *
 * Executar: node tests/api/propostaBilingueModulo.api.test.js
 */
const assert = require('assert');
const B = require('../../propostaBilingue');

let passed = 0; let failed = 0;
function test(nome, fn) {
  try { fn(); passed++; console.log('  ✓ ' + nome); } catch (e) { failed++; console.log('  ✗ ' + nome + '\n      ' + e.message); }
}

test('BI-M01 idioma: so en/es ligam o bilingue', () => {
  assert.strictEqual(B.idiomaDaProposta('en'), 'en');
  assert.strictEqual(B.idiomaDaProposta(' ES '), 'es');
  for (const v of [undefined, null, '', 'pt', 'pt-BR', 'PT-BR', 'fr', 'english']) assert.strictEqual(B.idiomaDaProposta(v), 'pt-BR', String(v));
  assert.ok(B.ehBilingue('en') && B.ehBilingue('es') && !B.ehBilingue('pt-BR'));
});

test('BI-M02 moeda: BRL em pt-BR e o de sempre; USD/EUR no formato da lingua; moeda invalida = BRL', () => {
  const antes = (v) => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); // o moedaBRL do template
  for (const v of [0, 1, 1234.5, 150000, null, 'x']) assert.strictEqual(B.formatarMoeda(v, 'BRL', 'pt-BR'), antes(v));
  assert.strictEqual(B.formatarMoeda(1000, 'XYZ', 'pt-BR'), antes(1000));
  assert.strictEqual(B.formatarMoeda(1000, 'USD', 'en'), '$1,000.00');
  // es-ES nao agrupa milhar em numero de 4 digitos (1000,00 US$) — regra da lingua; com 7 digitos agrupa
  assert.ok(/1\.000\.000,00\sUS\$/.test(B.formatarMoeda(1000000, 'USD', 'es')), B.formatarMoeda(1000000, 'USD', 'es'));
  assert.ok(/US\$\s1\.000,00/.test(B.formatarMoeda(1000, 'USD', 'pt-BR')), B.formatarMoeda(1000, 'USD', 'pt-BR'));
  assert.strictEqual(B.formatarMoeda(1000, 'EUR', 'en'), '€1,000.00');
});

test('BI-M03 chave: espacos e quebras nao separam o mesmo texto', () => {
  assert.strictEqual(B.normalizarChave('  Garantia de 12\n meses.  '), 'Garantia de 12 meses.');
  assert.strictEqual(B.textoDeHtml('<p>A <strong>CONTRATANTE</strong> &amp; a CONTRATADA</p>'), 'A CONTRATANTE & a CONTRATADA');
});

test('BI-M04 segmentar: texto puro, paragrafos, listas e texto solto', () => {
  const puro = B.segmentarHtml('Primeiro paragrafo.\n\nSegundo & sinal > 5.');
  assert.deepStrictEqual(puro.map((b) => b.texto), ['Primeiro paragrafo.', 'Segundo & sinal > 5.']);
  assert.ok(puro[1].html.includes('&amp; sinal &gt; 5'), 'texto puro do editor tem de sair escapado');
  const html = B.segmentarHtml('<p>Um.</p>solto<ul style="x"><li>A;</li><li><strong>B</strong>;</li></ul><p>Dois.</p>');
  assert.deepStrictEqual(html.map((b) => b.tipo), ['p', 'p', 'ul', 'p']);
  assert.strictEqual(html[1].texto, 'solto');
  assert.deepStrictEqual(html[2].itens, ['A;', '<strong>B</strong>;']);
  assert.strictEqual(html[2].abre, '<ul style="x">');
  assert.deepStrictEqual(B.textosDeConteudo('<p>Um.</p><ol><li>A</li></ol>'), ['Um.', 'A']);
  // Fase 5, 2: paragrafo/item vazio (o contentEditable salva <p><br></p>) nao vira pendente eterno
  assert.deepStrictEqual(B.textosDeConteudo('<p><br></p><p>&nbsp;</p><p>Texto.</p><ul><li> </li><li>B</li></ul><ul><li></li></ul>'), ['Texto.', 'B']);
  // Fase 5, 3: blocos aninhados nao colam frases numa chave so
  assert.deepStrictEqual(B.textosDeConteudo('<div><p>Primeiro.</p><p>Segundo.</p></div>'), ['Primeiro.', 'Segundo.']);
  assert.strictEqual(B.textoDeHtml('<p>Um.</p><p>Dois.</p>'), 'Um. Dois.');
});

test('BI-M07 paragrafo maior que o limite vira varios (por frase); com tag interna fica inteiro (Fase 5, 6)', () => {
  const longo = Array.from({ length: 60 }, (_, i) => `Frase numero ${i + 1} do descritivo tecnico.`).join(' ');
  const partes = B.textosDeConteudo(longo);
  assert.ok(partes.length > 1, 'um texto de ' + longo.length + ' caracteres tinha de ser dividido');
  assert.ok(partes.every((p) => p.length <= B.LIMITE_PARAGRAFO), 'nenhuma parte acima do limite');
  assert.strictEqual(partes.join(' '), longo, 'nada se perde nem muda de ordem');
  assert.strictEqual(B.textosDeConteudo(`<p><strong>X</strong> ${longo}</p>`).length, 1, 'com HTML dentro nao divide (nao quebra tag)');
  assert.strictEqual(B.textosDeConteudo(`<p>${longo}</p>`).length, partes.length, '<p> de texto puro tambem divide');
});

test('BI-M08 traducao crua no atributo e marcadores (Fase 5, critico 1)', () => {
  const h = B.paresDeConteudo('<p>Proposta para {{cliente.nome}}.</p>', 'en', { 'Proposta para {{cliente.nome}}.': 'Proposal for {{cliente.nome}}.' });
  assert.ok(h.includes('data-tr-texto="Proposal for &#123;&#123;cliente.nome&#125;&#125;."'), h);
  assert.ok(!B.paresDeConteudo('<p>Sem.</p>', 'en', {}).includes('data-tr-texto'), 'pendente nao tem traducao crua');
  assert.deepStrictEqual(B.marcadoresDe('A {{b}} e {{ a }}'), ['{{a}}', '{{b}}']);
});

test('BI-M05 pares: um por paragrafo e por item; PT com HTML; traducao ou pendente', () => {
  const tr = { 'Garantia de 12 meses.': '12-month warranty.' };
  const h = B.paresDeConteudo('<p>Garantia de <strong>12</strong> meses.</p><ul><li>Sem par;</li><li>Outro;</li></ul>', 'en', tr);
  assert.strictEqual((h.match(/class="bi-par/g) || []).length, 3, 'um par por paragrafo e por item');
  // Desde 24/11/2026 (noite) o <p> do PT leva o HTML original em data-pt-html, para a edição na tela de duas colunas.
  assert.ok(h.includes('<div class="bi-pt"><p data-pt-html="Garantia de &lt;strong&gt;12&lt;/strong&gt; meses.">Garantia de <strong>12</strong> meses.</p></div>'), 'a metade PT guarda o HTML');
  // Desde 24/11/2026 (noite) o negrito do PT atravessa para a tradução ("e as partes de negrito tmb"): o "12" em negrito sai em negrito
  // e vira uma chave própria (span hidden .bi-termo). Esta linha esperava a tradução sem negrito — o comportamento anterior.
  assert.ok(h.includes('<p data-tr-origem="Garantia de 12 meses." data-tr-texto="12-month warranty."><strong>12</strong>-month warranty.<span hidden class="bi-termo bi-pendente" data-tr-origem="12" data-traduzir="12"></span></p>'), 'traducao da memoria, com o negrito do PT');
  assert.ok(h.includes('<li class="bi-pendente" data-tr-origem="Sem par;" data-traduzir="Sem par;">Sem par;</li>'), 'sem traducao: pendente com o PT');
  assert.ok(h.includes('lang="en"'));
  // texto com aspas e sinais na chave sai escapado no atributo (nao quebra o HTML)
  const q = B.paresDeConteudo('<p>Diga "sim" & <ok></p>', 'es', {});
  assert.ok(q.includes('data-traduzir="Diga &quot;sim&quot; &amp;"'), q);
  // marcador {{…}} na chave sai com as chaves em entidade (a troca de marcadores do template nao pode alcancar o atributo)
  const m = B.paresDeConteudo('<p>Cliente {{cliente.nome}} aceita.</p>', 'en', {});
  assert.ok(m.includes('data-tr-origem="Cliente &#123;&#123;cliente.nome&#125;&#125; aceita."'), m);
  assert.ok(m.includes('>Cliente {{cliente.nome}} aceita.</p>'), 'o texto visivel continua com o marcador, para a troca preencher');
});

test('BI-M06 dicionario: termos de contrato e fallback', () => {
  assert.strictEqual(B.t('en', 'EMPRESA CONTRATANTE:'), 'CONTRACTING COMPANY:');
  assert.ok(!/contractor/i.test(B.t('en', 'Assinatura e carimbo da empresa CONTRATANTE:')), 'CONTRATANTE nunca e Contractor');
  assert.ok(/CONTRACTOR/.test(B.t('en', 'Tabela com Dados Cadastrais da CONTRATADA')), 'CONTRATADA e o Contractor');
  assert.strictEqual(B.t('es', '4. ESCOPO DE FORNECIMENTO'), '4. ALCANCE DEL SUMINISTRO');
  assert.strictEqual(B.t('en', 'texto que nao existe'), 'texto que nao existe');
  assert.strictEqual(B.t('pt-BR', 'TOTAL DA PROPOSTA'), 'TOTAL DA PROPOSTA');
  assert.strictEqual(B.rotuloDuplo('en', 'TOTAL'), 'TOTAL');
  assert.strictEqual(B.rotuloDuplo('en', 'DESCRIÇÃO'), 'DESCRIÇÃO / DESCRIPTION');
  Object.entries(B.DICIONARIO).forEach(([pt, v]) => assert.ok(v.en && v.es, 'sem as duas linguas: ' + pt));
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
