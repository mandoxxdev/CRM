/**
 * Nota legal da proposta em outra língua (24/11/2026: "sempre que for em outro idioma, tem que aparecer uma nota legal de que a versão
 * que vale é a em PTBR, mas isso só deve aparecer quando fazemos a proposta em outras línguas").
 *
 *   NL-01 em inglês e em espanhol, nos três documentos (equipamento, peças, Projeto Conceitual): UMA nota, antes dos campos de assinatura,
 *         dizendo que prevalece o português — nas duas línguas
 *   NL-02 em pt-BR (e sem idioma): nenhuma nota (o documento é o de sempre; o hash byte a byte fica no BI-T01)
 *
 * Executar: node tests/propostaBilingueNotaLegal.test.js
 */
const assert = require('assert');
const { htmlDoCaso } = require('./helpers/propostaBaseHtml');

let falhas = 0;
const test = (n, fn) => { try { fn(); console.log('  ✓ ' + n); } catch (e) { falhas++; console.log('  ✗ ' + n + '\n      ' + e.message); } };
const notas = (h) => (h.match(/<div class="bi-nota-legal">/g) || []).length;

test('NL-01 uma nota, antes da assinatura, nas duas línguas, nos três documentos', () => {
  for (const caso of ['equipamento', 'pecas', 'projetoConceitual']) {
    for (const [idioma, frase, lingua] of [['en', /the Portuguese version shall prevail/, 'inglês'], ['es', /prevalecerá la versión en portugués/, 'espanhol']]) {
      const h = htmlDoCaso(caso, { idioma }, true);
      assert.strictEqual(notas(h), 1, `${caso} ${idioma}: ${notas(h)} notas`);
      const nota = h.slice(h.indexOf('<div class="bi-nota-legal">'));
      assert.ok(nota.indexOf('campo-manual') > 0, `${caso} ${idioma}: a nota vem antes dos campos de assinatura`);
      assert.ok(new RegExp(`em português e em ${lingua} apenas para facilitar a leitura.*prevalece a versão em português`).test(nota), `${caso} ${idioma}: PT`);
      assert.match(nota, frase, `${caso} ${idioma}: tradução`);
    }
  }
});

test('NL-02 em pt-BR, nenhuma nota', () => {
  for (const caso of ['equipamento', 'pecas', 'projetoConceitual']) {
    for (const extra of [{}, { idioma: 'pt-BR' }]) assert.strictEqual(notas(htmlDoCaso(caso, extra, true)), 0, `${caso} ${JSON.stringify(extra)}`);
  }
});

console.log(`\n${falhas} failed`);
process.exit(falhas ? 1 : 0);
