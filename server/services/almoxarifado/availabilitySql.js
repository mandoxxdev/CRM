/**
 * A conta do saldo DISPONIVEL do material — em UM lugar so.
 *
 * Ate a Etapa 8b esta subtracao existia escrita a mao em **13 queries** espalhadas por 8 arquivos
 * (services/almoxarifado/{stockService,requisitionService,requisitionStateMachine,reportService,
 * clienteEstoqueService}.js, routes/almoxarifado.js, routes/almoxarifado/extended.js e
 * routes/requisicoesMaterial.js — este ultimo NEM pertence ao modulo), mais a funcao
 * `stockService.getSaldoDisponivel`: 14 implementacoes da mesma conta.
 *
 * Acrescentar uma coluna de retencao nova (`quantidade_em_terceiros`, Etapa 8b) exigia acertar as
 * 14 — e errar UMA nao quebra nada: o sistema passa a RECUSAR pela funcao e ACEITAR pelo SQL, com
 * o numero errado em silencio. O design da 8b chegou a contar SETE; a spec da Etapa 8, antes dela,
 * mandou auditar um subconjunto de diretorios e deixou de fora as duas piores leituras. Dois erros
 * do mesmo tipo em duas etapas seguidas: a resposta nao e contar melhor, e nao haver o que contar.
 *
 * Precedente do proprio modulo: `RESERVADO_PARA_ITEM_SQL` em requisitionService.js ja e um
 * fragmento de SQL compartilhado por constante. Isto e a mesma ideia, para a conta mais copiada
 * do modulo.
 *
 * REGRA: nenhuma query nova pode escrever a subtracao a mao.
 * `tests/api/saldoEmTerceiros.api.test.js` varre o codigo-fonte e falha se alguem voltar a
 * replica-la — e tem controle positivo do proprio padrao de busca.
 */

/**
 * As colunas que RETEM saldo. Ordem preservada por legibilidade do SQL gerado.
 *
 * As tres primeiras sao estados administrativos de material que ESTA na prateleira.
 * `quantidade_em_terceiros` e a unica que significa "nao esta no predio" — ver o comentario da
 * coluna em schema.js e o desconto da conferencia em routes/almoxarifado.js.
 */
const COLUNAS_RETENCAO = [
  'quantidade_reservada',
  'quantidade_bloqueada',
  'quantidade_em_inspecao',
  'quantidade_em_terceiros',
];

/**
 * Expressao SQL do disponivel, JA ENTRE PARENTESES (pode ir direto para um `>= ?` ou um `as x`).
 *
 * @param {string} alias alias da tabela materiais_almoxarifado SEM o ponto ('m', 'ma'). Vazio
 *   (default) para UPDATE de tabela unica, onde as colunas nao sao qualificadas.
 * @returns {string}
 *
 *   disponivelSql('m')  =>  (m.quantidade_atual - COALESCE(m.quantidade_reservada,0) - ...)
 *   disponivelSql()     =>  (quantidade_atual - COALESCE(quantidade_reservada,0) - ...)
 */
function disponivelSql(alias = '') {
  const p = alias ? `${alias}.` : '';
  const retido = COLUNAS_RETENCAO.map((c) => `COALESCE(${p}${c},0)`).join(' - ');
  return `(${p}quantidade_atual - ${retido})`;
}

module.exports = { COLUNAS_RETENCAO, disponivelSql };
