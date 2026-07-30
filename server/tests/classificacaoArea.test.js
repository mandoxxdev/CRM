/**
 * Classificacao de Area do produto (coluna produtos.classificacao_area).
 *
 * Pedido (30/07/2026): "deveria ter a variavel para preencher Class. Area (...) duas opcoes
 * Area Segura que deve ficar verde claro e Area Classificada (ATEX) que deve ficar um
 * vermelinho". A coluna e o rotulo da listagem ja existiam; o formulario e que oferecia
 * "Base Agua / Base Solvente" — residuo de outro dominio ocupando o mesmo campo.
 *
 * A sutileza que exige teste: as rotas POST/PUT /api/produtos passam o valor por toUpper
 * antes de gravar. Ou seja, o que volta do banco e "AREA SEGURA", nunca "Area Segura" como
 * escrito na lista de opcoes. Comparacao sensivel a caixa deixaria o botao sem marcar e o
 * selo sem cor mesmo com o campo corretamente preenchido.
 *
 * Executar: node tests/classificacaoArea.test.js
 */
const assert = require('assert');

let ok = 0, total = 0;
const t = (nome, fn) => {
  total++;
  try { fn(); ok++; console.log('  OK   ' + nome); }
  catch (e) { console.error('  FALHA ' + nome + ': ' + e.message); }
};

// Como o servidor normaliza antes de gravar (server/index.js, POST e PUT).
const toUpper = (v) => String(v == null ? '' : v).toLocaleUpperCase('pt-BR');
const gravarComoNoServidor = (v) => (v != null && String(v).trim() !== '') ? toUpper(String(v).trim()) : null;

// Formulario: qual botao aparece marcado (ProdutoForm.areaSelecionada).
const OPCOES = ['Área Segura', 'Área Classificada (ATEX)'];
const selecionado = (salvo, opcao) =>
  String(salvo || '').trim().toLocaleUpperCase('pt-BR') === opcao.toLocaleUpperCase('pt-BR');

// Listagem: qual selo/cor (Produtos.js).
const selo = (salvo) => {
  if (!salvo) return '-';
  const up = salvo.toLocaleUpperCase('pt-BR');
  if (up.includes('ATEX')) return 'class-area-atex';
  if (up.includes('SEGURA')) return 'class-area-segura';
  return 'class-area-outro';
};

console.log('\n[ida e volta] o que o servidor grava marca o botao certo');
OPCOES.forEach((opcao) => {
  const salvo = gravarComoNoServidor(opcao);
  t(`"${opcao}" -> grava "${salvo}" e o botao volta marcado`, () => {
    assert(selecionado(salvo, opcao), 'botao nao marcou apos o toUpper do servidor');
    // A regressao que este teste pega: comparar sem normalizar a caixa.
    assert(salvo !== opcao, 'o servidor deveria ter mudado a caixa (premissa do teste)');
    assert.strictEqual(salvo === opcao, false);
  });
  t(`"${opcao}" nao marca a OUTRA opcao`, () => {
    const outra = OPCOES.find((o) => o !== opcao);
    assert(!selecionado(salvo, outra), 'marcou as duas');
  });
});

console.log('\n[cores] verde para segura, vermelho para ATEX');
t('ÁREA SEGURA -> selo verde', () => assert.strictEqual(selo('ÁREA SEGURA'), 'class-area-segura'));
t('ÁREA CLASSIFICADA (ATEX) -> selo vermelho',
  () => assert.strictEqual(selo('ÁREA CLASSIFICADA (ATEX)'), 'class-area-atex'));
t('a caixa como digitada nao muda a cor', () => {
  assert.strictEqual(selo('Área Segura'), 'class-area-segura');
  assert.strictEqual(selo('área classificada (atex)'), 'class-area-atex');
});
t('vazio/nulo mostra apenas o traco', () => {
  assert.strictEqual(selo(''), '-');
  assert.strictEqual(selo(null), '-');
});

console.log('\n[dado antigo] valor fora das duas opcoes nao pode virar verde');
// Produtos gravados antes disto podem ter "BASE ÁGUA" / "BASE SOLVENTE". Pintar de verde um
// valor que NAO afirma area segura seria pior do que nao pintar: leria como equipamento
// liberado para area classificada.
['BASE ÁGUA', 'BASE SOLVENTE', 'QUALQUER COISA'].forEach((legado) => {
  t(`"${legado}" recebe selo neutro`, () => assert.strictEqual(selo(legado), 'class-area-outro'));
  t(`"${legado}" nao marca nenhuma das duas opcoes`,
    () => assert(OPCOES.every((o) => !selecionado(legado, o))));
});

// E o formulario avisa, em vez de esconder — o valor continua no banco e na listagem.
const foraDoPadrao = (salvo) => !!String(salvo || '').trim() && OPCOES.every((o) => !selecionado(salvo, o));
t('valor legado dispara o aviso no formulario', () => assert(foraDoPadrao('BASE ÁGUA')));
t('valor valido NAO dispara aviso', () => assert(!foraDoPadrao('ÁREA SEGURA')));
t('vazio NAO dispara aviso', () => assert(!foraDoPadrao('')));

console.log(`\n${ok}/${total} checagens`);
console.log(ok === total ? '0 failed' : `${total - ok} failed`);
process.exit(ok === total ? 0 : 1);
