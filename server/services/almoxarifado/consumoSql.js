const { TIPOS_SAIDA } = require('./movementTypes');

/**
 * O consumo de um material NUMA JANELA de dias — em UM lugar so.
 *
 * ── Por que este arquivo existe (Etapa 13, Global Constraints/C4) ─────────────────────────────
 *
 * Ate esta etapa a mesma pergunta ("quanto este material consumiu nos ultimos N dias?") tinha
 * QUATRO respostas divergentes no modulo: a regua deste arquivo (TIPOS_SAIDA inteiro — todo
 * debito de patrimonio, D6 da Etapa 11), e mais tres reguas HISTORICAS mais estreitas (so
 * SAIDA/SAIDA_PRODUCAO/SAIDA_MONTAGEM/SAIDA_ASSISTENCIA) em `consumo-os`, `consumo-periodo` e
 * `materiais-mais-consumidos` (reportService.js) — medido 10 vs 18 no mesmo material. Unificar
 * as quatro seria mudar o NUMERO de relatorio existente (letra B, fora de escopo desta etapa);
 * este arquivo so extrai a regua que ja existia embutida em `purchaseService.calcularSugestoes`
 * (Etapa 11) para o indicador de `cobertura` (Etapa 13, Task 2) poder REUSAR o mesmo calculo por
 * material, em vez de nascer uma QUINTA copia da mesma subquery correlacionada.
 *
 * Fragmento PURO (sem I/O): so monta o texto SQL e a lista de bind params. Quem chama decide o
 * alias da tabela `materiais_almoxarifado` na query externa.
 *
 * REGRA: nenhuma query nova de "consumo pelo TIPOS_SAIDA inteiro, por material, numa janela"
 * pode escrever esta subquery a mao — chama `consumoJanelaSql`/`consumoJanelaParams`.
 */

/**
 * Subquery CORRELACIONADA (por `${alias}.id`) que soma a quantidade debitada de UM material nos
 * ultimos N dias, contando TODO tipo de `TIPOS_SAIDA` (fonte unica de tipos, movementTypes.js).
 *
 * @param {string} alias alias da tabela materiais_almoxarifado SEM o ponto ('m', 'ma'). Vazio
 *   (default) para contexto sem alias.
 * @returns {string} expressao JA ENTRE PARENTESES via COALESCE (nunca NULL — pode ir direto
 *   para uma divisao ou um `as x`).
 */
function consumoJanelaSql(alias = '') {
  const p = alias ? `${alias}.` : '';
  const placeholders = TIPOS_SAIDA.map(() => '?').join(',');
  return `COALESCE((SELECT SUM(mv.quantidade) FROM movimentacoes_almoxarifado mv
                     WHERE mv.material_id = ${p}id AND mv.cancelado = 0
                       AND mv.tipo IN (${placeholders})
                       AND mv.created_at >= datetime('now', '-' || ? || ' days')), 0)`;
}

/**
 * Bind params de `consumoJanelaSql`, NA MESMA ORDEM que a expressao exige: um `?` por tipo de
 * `TIPOS_SAIDA`, seguido do numero de dias da janela.
 *
 * @param {number} janelaDias
 * @returns {Array}
 */
function consumoJanelaParams(janelaDias) {
  return [...TIPOS_SAIDA, janelaDias];
}

module.exports = { consumoJanelaSql, consumoJanelaParams };
