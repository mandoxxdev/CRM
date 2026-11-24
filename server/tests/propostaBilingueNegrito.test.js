/**
 * Negrito na coluna traduzida (24/11/2026: "e as partes de negrito tmb"; depois, com o tradutor de verdade, "cadê o negrito na versão
 * em esp" — traduzido sozinho, o trecho saía com outra palavra e a primeira versão não o achava na frase).
 *
 *   NG-01 a frase com negrito leva o PT MARCADO (data-tr-marcado, ⟦b⟧…⟦/b⟧) para a tela traduzir a frase inteira com o negrito
 *   NG-02 tradução com **…** sai com <strong> no lugar certo (o que o tradutor devolveu, no contexto da frase)
 *   NG-03 tradução ANTIGA, sem **, de frase com negrito: continua aparecendo e pede para ser refeita (data-tr-refazer + data-traduzir);
 *         não conta como pendente no aviso do PDF (o regex do index.js)
 *   NG-04 pendente (sem tradução): o PT aparece com o MESMO negrito
 *   NG-05 parágrafo inteiro em negrito sai inteiro em negrito, sem marca e sem pedir para refazer
 *   NG-06 sem negrito no PT: nada muda
 *
 * Executar: node tests/propostaBilingueNegrito.test.js
 */
const assert = require('assert');
const B = require('../propostaBilingue');

let falhas = 0;
const test = (n, fn) => { try { fn(); console.log('  ✓ ' + n); } catch (e) { falhas++; console.log('  ✗ ' + n + '\n      ' + e.message); } };
const traduzida = (html, tr = {}) => B.paresDeConteudo(html, 'es', tr).split('<div class="bi-tr" lang="es">')[1];
const P1 = '<p>A presente proposta contempla o <strong>PROJETO CONCEITUAL</strong> para o CLIENTE.</p>';
const CHAVE1 = 'A presente proposta contempla o PROJETO CONCEITUAL para o CLIENTE.';

test('NG-01 frase com negrito leva o PT marcado', () => {
  assert.ok(traduzida(P1).includes('data-tr-marcado="A presente proposta contempla o ⟦b⟧PROJETO CONCEITUAL⟦/b⟧ para o CLIENTE."'));
  assert.strictEqual(B.marcarNegrito('<strong>Elaboração:</strong> desenvolvimento de <b>soluções</b>.'), '⟦b⟧Elaboração:⟦/b⟧ desenvolvimento de ⟦b⟧soluções⟦/b⟧.');
});
test('NG-02 **…** vira <strong> no lugar que o tradutor devolveu', () => {
  const h = traduzida(P1, { [CHAVE1]: 'La presente propuesta contempla el **PROYECTO CONCEPTUAL** para el CLIENTE.' });
  assert.ok(h.includes('>La presente propuesta contempla el <strong>PROYECTO CONCEPTUAL</strong> para el CLIENTE.</p>'), h);
  assert.ok(!/data-tr-refazer|data-traduzir/.test(h), 'já tem o negrito: não pede para refazer');
});
test('NG-03 tradução antiga sem ** continua visível e pede para refazer; o aviso do PDF não a conta', () => {
  const h = traduzida(P1, { [CHAVE1]: 'La presente propuesta contempla el PROYECTO CONCEPTUAL para el CLIENTE.' });
  assert.ok(h.includes(' data-tr-refazer="1" data-traduzir="A presente proposta contempla o PROJETO CONCEITUAL para o CLIENTE."'), h);
  assert.ok(h.includes('>La presente propuesta contempla el PROYECTO CONCEPTUAL para el CLIENTE.</p>'), 'continua aparecendo traduzida');
  assert.ok(!h.includes('bi-pendente'), 'não fica laranja');
  // a mesma conta do cabeçalho X-Traducoes-Pendentes (index.js)
  const pend = (h.match(/ data-traduzir="/g) || []).length - (h.match(/ data-tr-refazer="1" data-traduzir="/g) || []).length;
  assert.strictEqual(pend, 0);
});
test('NG-04 pendente: o PT aparece com o mesmo negrito', () => {
  assert.ok(traduzida(P1).includes('>A presente proposta contempla o <strong>PROJETO CONCEITUAL</strong> para o CLIENTE.</p>'));
});
test('NG-05 parágrafo inteiro em negrito', () => {
  const h = traduzida('<p><strong>Tudo em negrito.</strong></p>', { 'Tudo em negrito.': 'Todo en negrita.' });
  assert.ok(h.includes('><strong>Todo en negrita.</strong></p>'), h);
  assert.ok(!/data-tr-marcado|data-tr-refazer/.test(h), h);
});
test('NG-06 sem negrito no PT: nada muda', () => {
  const h = traduzida('<p>Texto simples.</p>', { 'Texto simples.': 'Texto simple.' });
  assert.ok(!/<strong>|data-tr-marcado|data-tr-refazer/.test(h), h);
});
console.log(`\n${falhas} failed`);
process.exit(falhas ? 1 : 0);
