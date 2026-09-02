/**
 * A leitura do CUSTO UNITARIO de um material — em UM lugar so.
 *
 * ── O defeito que criou este arquivo (Etapa 8c, achado por execucao) ─────────────────────────
 *
 * `materiais_almoxarifado.custo_medio` e `REAL DEFAULT 0` (schema.js:686) — ZERO, nao NULL. E o
 * cadastro de material grava SO `custo_unitario` (materialService.js). Entao, para todo material
 * cadastrado a mao — que e o acervo INTEIRO anterior a Task 2 desta etapa, porque ate ela o
 * recebimento por NF nem alimentava custo medio — `custo_medio` vale 0 e NAO NULL.
 *
 * `COALESCE(custo_medio, custo_unitario, 0)` devolve o primeiro NAO-NULO: devolve 0 e NUNCA chega
 * em `custo_unitario`. O material e valorado a ZERO, em silencio.
 *
 * Sonda executada antes do conserto, no banco de teste (custo_unitario = 10, custo_medio = 0):
 *
 *   codigo    custo_medio  custo_unitario  qtd   COALESCE(cm,cu,0)   CASE WHEN cm>0 ...
 *   SONDA-1   0            10              5     0   (valor 0)       10  (valor 50)
 *   SONDA-2   12           10              5     12  (valor 60)      12  (valor 60)
 *
 * SONDA-1 e o material do dia a dia; SONDA-2 e o que as fixtures constroem — as duas colunas
 * preenchidas. Por isso NENHUM teste caia: as fixtures escondiam exatamente o caso comum.
 *
 * ── Por que um modulo, e nao uma quarta copia ────────────────────────────────────────────────
 *
 * A mesma pergunta ("quanto vale uma unidade deste material?") estava respondida em 8 lugares com
 * TRES respostas diferentes:
 *   - a certa (CASE WHEN): stockService.js (media ponderada da entrada),
 *     requisitionValueApprovalService.js (valor da requisicao), thirdPartyService.js
 *     (CUSTO_UNITARIO_SQL, Task 7 desta etapa);
 *   - a que zera (COALESCE simples): reportService.js (posicao de estoque),
 *     stockService.consultarEstoque (valor_estoque), requisitionService (itens da requisicao);
 *   - so `custo_unitario`, ignorando a media: routes/almoxarifado.js (dashboard e
 *     relatorio/posicao-estoque).
 *
 * Resultado pratico antes deste arquivo: o dashboard e o relatorio de posicao de estoque, que
 * respondem a MESMA pergunta, devolviam numeros diferentes um do outro — e o relatorio devolvia
 * ZERO para o acervo inteiro. Precedente direto no proprio modulo: `availabilitySql.js`, criado na
 * Etapa 8b porque a conta do disponivel estava replicada 14 vezes; e antes dele
 * `RESERVADO_PARA_ITEM_SQL` em requisitionService.js.
 *
 * REGRA: nenhuma query nova pode escrever a leitura do custo a mao.
 * `tests/api/custoUnitarioFonteUnica.api.test.js` varre o codigo-fonte e falha se alguem voltar a
 * replica-la — e tem controle positivo do proprio padrao de busca.
 */

/**
 * O custo de UMA unidade, na convencao do motor.
 *
 * `custo_medio` MANDA quando existe (> 0): e a media ponderada que o recebimento mantem. Quando
 * ainda nao existe, cai para `custo_unitario`, que e o custo digitado no cadastro (e tambem o
 * ultimo custo de compra, reescrito pela entrada). O teste do `> 0` — e nao do NULL — e o ponto
 * inteiro deste arquivo.
 *
 * @param {string} alias alias da tabela materiais_almoxarifado SEM o ponto ('m', 'ma'). Vazio
 *   (default) para UPDATE de tabela unica, onde as colunas nao sao qualificadas.
 * @returns {string} expressao JA ENTRE PARENTESES (pode ir direto para um `* qtd` ou um `as x`).
 */
function custoUnitarioSql(alias = '') {
  const p = alias ? `${alias}.` : '';
  return `(CASE WHEN COALESCE(${p}custo_medio,0) > 0 THEN ${p}custo_medio ELSE COALESCE(${p}custo_unitario,0) END)`;
}

/**
 * O valor do saldo em estoque: quantidade fisica x custo unitario.
 *
 * Usa `quantidade_atual` (o que esta na prateleira), NAO o disponivel: material reservado ou em
 * inspecao continua sendo patrimonio. Quem quiser outra base multiplica `custoUnitarioSql` a mao.
 *
 * @param {string} alias mesmo contrato de custoUnitarioSql.
 */
function valorEstoqueSql(alias = '') {
  const p = alias ? `${alias}.` : '';
  return `(${p}quantidade_atual * ${custoUnitarioSql(alias)})`;
}

module.exports = { custoUnitarioSql, valorEstoqueSql };
