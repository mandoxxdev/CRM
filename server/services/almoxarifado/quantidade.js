/**
 * Etapa 96 (C176, B480-B482) — a regra unica de quantidade do almoxarifado.
 *
 * Todas as colunas de quantidade sao REAL no SQLite. Somar 0,7 + 0,2 + 0,1 grava 0.9999999999999999 e, com isso, o
 * pedido de 1 era recusado ("Saldo insuficiente. Disponivel: 0.9999999999999999"). Pior: o disponivel e uma DIFERENCA
 * de colunas (fisico - retencoes), e a diferenca de dois numeros limpos ja sai torta (0,3 - 0,1 = 0.19999999999999998),
 * entao arredondar so a gravacao nao consertava nem dado novo (sonda 9 da Fase 0).
 *
 * A regra tem duas metades, e as duas sao necessarias:
 *   - ao GRAVAR, arredondar a 1e-6 (QTD_CASAS) — `qtdSql` no lado direito de um SET, `qtd` no valor calculado em JS;
 *   - ao RECUSAR, comparar com a folga QTD_FOLGA (1e-9) — `cabe` em JS, `FOLGA_SQL` no claim (`col >= ? ${FOLGA_SQL}`).
 *
 * A folga e MENOR que meia unidade da precisao (5e-7): nunca aceita o que nao existe (0,200001 contra 0,2 continua
 * recusado — RN-03 da Etapa 96).
 *
 * Importar por NAMESPACE (`const Q = require('./quantidade')`; Fase 2, I3): varios servicos tem `const qtd` local, e
 * desestruturar `{ qtd }` no topo os quebra (TypeError ou TDZ).
 *
 * `qtd` usa `toFixed(6)` (Fase 2, I6): medido contra o ROUND(x, 6) do SQLite, 0/20 000 discordancias em valores
 * aleatorios e em somas de 0,1/0,2/0,3/0,7; ~40/20 000 so nos meios exatos (x,xxxxxx5), onde nenhuma implementacao em JS
 * concorda 100%. Regra: nunca arredondar o mesmo valor cru em JS e no SQL e comparar os dois — um lado le o que o outro
 * gravou.
 *
 * Plano: docs/superpowers/plans/2026-10-09-almoxarifado-etapa96-motor-quantidade-arredondada.md
 */

const QTD_CASAS = 6;
const QTD_FOLGA = 1e-9;

/**
 * A quantidade arredondada a 1e-6. Nao inventa numero: `null`, `undefined`, `''`, booleano, texto nao numerico e
 * nao-finito devolvem NaN (quem chama decide a recusa) — `Number(null)` seria 0 e `Number(true)` seria 1. Nunca devolve
 * -0 (o JSON escreveria 0, mas `Object.is` e a divisao distinguem).
 */
function qtd(x) {
  let n = x;
  if (typeof n === 'string') {
    if (n.trim() === '') return NaN;
    n = Number(n);
  }
  if (typeof n !== 'number' || !Number.isFinite(n)) return NaN;
  const r = Number(n.toFixed(QTD_CASAS));
  return r === 0 ? 0 : r;
}

/** O pedido cabe no disponivel, com a folga de ponto flutuante. Nao arredonda nenhum dos dois. */
function cabe(pedido, disponivel) {
  return Number(pedido) <= Number(disponivel) + QTD_FOLGA;
}

/** Expressao SQL arredondada a 1e-6 — para o lado direito de um SET (`col = ${qtdSql('col + ?')}`). */
function qtdSql(expr) {
  return `ROUND((${expr}), ${QTD_CASAS})`;
}

/** Para o lado direito de um claim: `col >= ? ${FOLGA_SQL}`. */
const FOLGA_SQL = `- ${QTD_FOLGA}`;

module.exports = { QTD_CASAS, QTD_FOLGA, qtd, cabe, qtdSql, FOLGA_SQL };
