/**
 * Negrito na coluna traduzida (24/11/2026: "e as partes de negrito tmb").
 *
 *   NG-01 rótulo em negrito ("Elaboração:") sai em negrito na tradução, com a pontuação
 *   NG-02 termo em negrito no meio da frase ("PROJETO CONCEITUAL") acha a tradução dele dentro da frase traduzida
 *   NG-03 parágrafo inteiro em negrito sai inteiro em negrito
 *   NG-04 cada trecho vira uma chave própria (span hidden .bi-termo) — a tela o traduz; sem tradução, ele fica pendente
 *   NG-05 trecho que o tradutor trocou de palavra: a frase sai sem esse negrito, sem perder texto
 *
 * Executar: node tests/propostaBilingueNegrito.test.js
 */
const assert = require('assert');
const B = require('../propostaBilingue');

let falhas = 0;
const test = (n, fn) => { try { fn(); console.log('  ✓ ' + n); } catch (e) { falhas++; console.log('  ✗ ' + n + '\n      ' + e.message); } };
const tr = {
  'Elaboração: desenvolvimento de soluções.': 'Elaboración: desarrollo de soluciones.', 'Elaboração:': 'Elaboración:',
  'A presente proposta contempla o PROJETO CONCEITUAL para o CLIENTE.': 'La presente propuesta contempla el PROYECTO CONCEPTUAL para el CLIENTE.',
  'PROJETO CONCEITUAL': 'PROYECTO CONCEPTUAL',
  'Caráter orientativo e preliminar.': 'Carácter indicativo y preliminar.', 'orientativo e preliminar': 'orientador y preliminar',
};
const traduzida = (html) => B.paresDeConteudo(html, 'es', tr).split('<div class="bi-tr" lang="es">')[1];

test('NG-01 rótulo em negrito sai em negrito, com os dois-pontos', () => {
  assert.match(traduzida('<p><strong>Elaboração:</strong> desenvolvimento de soluções.</p>'), /<strong>Elaboración:<\/strong> desarrollo/);
});
test('NG-02 termo no meio da frase acha a tradução dele', () => {
  assert.match(traduzida('<p>A presente proposta contempla o <strong>PROJETO CONCEITUAL</strong> para o CLIENTE.</p>'), /el <strong>PROYECTO CONCEPTUAL<\/strong> para/);
});
test('NG-03 parágrafo inteiro em negrito', () => {
  assert.match(traduzida('<p><strong>Tudo em negrito.</strong></p>'), /><strong>Tudo em negrito\.<\/strong><\/p>/);
});
test('NG-04 trecho vira chave própria; sem tradução fica pendente', () => {
  const h = traduzida('<ul><li>✓ Capacidade: <strong>A INFORMAR</strong>;</li></ul>');
  assert.match(h, /<span hidden class="bi-termo bi-pendente" data-tr-origem="A INFORMAR" data-traduzir="A INFORMAR"><\/span>/);
  assert.match(h, /✓ Capacidade: <strong>A INFORMAR<\/strong>;/, 'pendente: o PT sai com o mesmo negrito');
});
test('NG-05 tradutor trocou a palavra: sem negrito, texto inteiro', () => {
  const h = traduzida('<p>Caráter <strong>orientativo e preliminar</strong>.</p>');
  assert.ok(h.includes('>Carácter indicativo y preliminar.<span hidden'), h);
});
test('sem negrito no PT: nada muda (nem span)', () => {
  const h = traduzida('<p>Elaboração: desenvolvimento de soluções.</p>');
  assert.ok(!/<strong>|bi-termo/.test(h), h);
});
console.log(`\n${falhas} failed`);
process.exit(falhas ? 1 : 0);
