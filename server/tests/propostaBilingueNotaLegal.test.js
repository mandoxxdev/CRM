/**
 * Cláusula IDIOMA da proposta em outra língua (24/11/2026: "sempre que for em outro idioma, tem que aparecer uma nota legal de que a
 * versão que vale é a em PTBR, mas isso só deve aparecer quando fazemos a proposta em outras línguas"; depois: "não deve ser no sistema,
 * deve ser incluído no contrato"). A primeira versão era um quadro solto antes dos campos de assinatura; agora é cláusula numerada.
 *
 *   NL-01 em inglês e em espanhol, nos três documentos: UMA cláusula IDIOMA, numerada em sequência à última (Projeto Conceitual: 21.,
 *         depois da 20.; equipamento: 5.26, depois da 5.25; peças: 5.11, depois da 5.10), antes dos campos de assinatura, prevalecendo
 *         o português
 *   NL-02 em pt-BR (e sem idioma): nenhuma (o documento é o de sempre; o hash byte a byte fica no BI-T01)
 *   NL-03 o quadro solto da primeira versão não sai mais (o texto não aparece duas vezes)
 *
 * Executar: node tests/propostaBilingueNotaLegal.test.js
 */
const assert = require('assert');
const { htmlDoCaso } = require('./helpers/propostaBaseHtml');

let falhas = 0;
const test = (n, fn) => { try { fn(); console.log('  ✓ ' + n); } catch (e) { falhas++; console.log('  ✗ ' + n + '\n      ' + e.message); } };
const clausulas = (h) => (h.match(/class="block stack-md allow-break clausula-corpo clausula-idioma"/g) || []).length;

test('NL-01 uma cláusula IDIOMA, numerada em sequência, antes da assinatura, nas duas línguas', () => {
  // Peças: o contrato de peças termina na 5.10 CONSIDERAÇÃO FINAL — a IDIOMA é a 5.11 (a seguinte à última, não um número fixo).
  const numero = { equipamento: '5.26', pecas: '5.11', projetoConceitual: '21.' };
  for (const caso of ['equipamento', 'pecas', 'projetoConceitual']) {
    for (const [idioma, titulo, frase, lingua] of [
      ['en', 'LANGUAGE', /the Portuguese version shall prevail/, 'inglês'],
      ['es', 'IDIOMA', /prevalecerá la versión en portugués/, 'espanhol']]) {
      const h = htmlDoCaso(caso, { idioma }, true);
      assert.strictEqual(clausulas(h), 1, `${caso} ${idioma}: ${clausulas(h)} cláusulas`);
      const c = h.slice(h.indexOf('clausula-idioma'));
      assert.ok(c.includes(`<span class="bi-pt">${numero[caso]} IDIOMA</span>`), `${caso} ${idioma}: número ${numero[caso]}`);
      assert.ok(c.includes(`>${numero[caso]} ${titulo}</span>`), `${caso} ${idioma}: título traduzido`);
      assert.ok(c.indexOf('campo-manual') > 0, `${caso} ${idioma}: vem antes dos campos de assinatura`);
      assert.ok(new RegExp(`em português e em ${lingua} apenas para facilitar a leitura.*prevalece a versão em português`).test(c), `${caso} ${idioma}: PT`);
      assert.match(c, frase, `${caso} ${idioma}: tradução`);
    }
  }
  const pc = htmlDoCaso('projetoConceitual', { idioma: 'es' }, true);
  assert.ok(pc.indexOf('20. VALIDADE E ACEITE') < pc.indexOf('21. IDIOMA'), 'Projeto Conceitual: a 21 vem depois da 20');
});

test('NL-02 em pt-BR, nenhuma', () => {
  for (const caso of ['equipamento', 'pecas', 'projetoConceitual']) {
    for (const extra of [{}, { idioma: 'pt-BR' }]) {
      const h = htmlDoCaso(caso, extra, true);
      assert.strictEqual(clausulas(h), 0, `${caso} ${JSON.stringify(extra)}`);
      assert.ok(!/IDIOMA<\/span>/.test(h), `${caso}: nenhum título IDIOMA`);
    }
  }
});

test('NL-03 o quadro solto não sai mais', () => {
  for (const caso of ['equipamento', 'pecas', 'projetoConceitual']) {
    assert.ok(!htmlDoCaso(caso, { idioma: 'en' }, true).includes('<div class="bi-nota-legal">'), caso);
  }
});

console.log(`\n${falhas} failed`);
process.exit(falhas ? 1 : 0);
