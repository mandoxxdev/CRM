/**
 * Etapa 117 (C236, B759) — a devolucao "viva": a linha de `devolucoes_material_almoxarifado` cuja ENTRADA_DEVOLUCAO NAO foi
 * estornada pelo livro. Uma regua so para as cinco contas que dizem quanto de uma saida ja voltou: o estorno da saida
 * (`stockService`, RN-10 da 116, guarda e claim), a validacao e a gravacao da devolucao e a lista de saidas elegiveis
 * (`returnService`), e o liquido da exclusao da requisicao (`requisitionService`).
 *
 * Ate a 117 so o estorno da saida usava esta regua (Etapa 116, Fase 5) e as outras somavam toda devolucao: estornada a
 * entrada de uma devolucao, o material saia do estoque de novo, mas a tela continuava dizendo "ja foram devolvidos 2 e
 * restam 0" e recusava devolver de novo; e excluir a requisicao nao creditava o que a devolucao estornada tinha tirado.
 *
 * Duas precisoes da revisao do plano (Fase 2 da 117):
 *  - IDENTIDADE (R2): a entrada da devolucao e a PRIMEIRA ENTRADA_DEVOLUCAO com a referencia `DEV-<id>` do mesmo material —
 *    a que `registrarDevolucao` grava logo depois da linha. A Entrada v2 aceita o tipo ENTRADA_DEVOLUCAO com referencia
 *    livre: sem a identidade, uma entrada digitada com `DEV-<id>` e estornada "matava" a devolucao (medido: o estorno da
 *    saida passava e o fisico ia a 12 com 10 de verdade).
 *  - SO O ESTORNO CONCLUIDO (R3): `cancelado = 1` e gravado pelo claim ANTES do efeito, e o estorno que falha depois (saldo,
 *    lote, caixa, livro) volta a 0. `movimento_estorno_id` e a ultima escrita do estorno que deu certo — so com ele a
 *    devolucao morre. Sem isto, o estorno da saida no meio de um estorno da entrada que falhava passava (fisico 7 para 5).
 *
 * A devolucao legada (sem a referencia, antes da Etapa 7) e a de RETRABALHO (nao grava entrada) continuam contando —
 * conservador: nao ha entrada para estornar. SQL correlacionado com o apelido `d`. Sem `require` do app (sem ciclo).
 */
const ENTRADA_DA_DEVOLUCAO_SQL = `(SELECT MIN(e2.id) FROM movimentacoes_almoxarifado e2
  WHERE e2.referencia = 'DEV-' || d.id AND e2.tipo = 'ENTRADA_DEVOLUCAO' AND e2.material_id = d.material_id)`;

/** A movimentacao (apelido `alias`) foi estornada e o estorno concluiu (o claim provisorio nao conta). */
const estornoConcluidoSql = (alias) => `(COALESCE(${alias}.cancelado, 0) = 1 AND ${alias}.movimento_estorno_id IS NOT NULL)`;

const DEVOLUCAO_VIVA_SQL = `NOT EXISTS (SELECT 1 FROM movimentacoes_almoxarifado ed
  WHERE ed.id = ${ENTRADA_DA_DEVOLUCAO_SQL} AND ${estornoConcluidoSql('ed')})`;

/**
 * Etapa 121 (C253, B783) — as series que sairam pela saida `saidaSql` e voltaram ao estoque por uma entrada que NAO e a de uma
 * devolucao que cita essa saida (uma Entrada avulsa com o numero da serie, ou a devolucao avulsa). A reativacao apaga o vinculo
 * da serie com a saida; desde a 120 a linha de `series_entrada_anterior_almoxarifado` guarda a saida (`saida_anterior_id`). Sem
 * esta conta a devolucao citando a saida, com a serie desligada, devolvia de novo o que ja tinha voltado (2 pecas, fisico 4).
 *
 * Conta TODA linha que cita a saida, inclusive a de uma entrada estornada depois (Fase 0 da 121, medido): filtrar a entrada
 * estornada abria o falso negativo da Fase 2 da 120 (volta, estorno da volta com a serie ligada — series ESTORNADA —, nova
 * entrada que as reativa sem citar a saida: devolveria em dobro). O preco, declarado (RN-06b): a volta estornada sem nova
 * entrada recusa a devolucao com o material de fato fora — recusar nunca conta em dobro; o acerto e um Ajuste.
 *
 * A entrada de uma devolucao que cita a saida fica fora (viva, ja conta em `DEVOLUCAO_VIVA_SQL`; estornada, a serie voltou a
 * "Entregue" nessa saida). Legado (a linha sem a saida, antes da 120): nao e vista — a A68 acha. `saidaSql` e o SQL do id da
 * saida (`?` ou uma coluna correlacionada); devolve um numero (COUNT).
 */
const seriesQueVoltaramSql = (saidaSql) => `(SELECT COUNT(DISTINCT sea.serie_id) FROM series_entrada_anterior_almoxarifado sea
  WHERE sea.saida_anterior_id = ${saidaSql} AND NOT EXISTS (SELECT 1 FROM devolucoes_material_almoxarifado d
    WHERE d.movimentacao_saida_id = ${saidaSql} AND sea.movimentacao_entrada_id = ${ENTRADA_DA_DEVOLUCAO_SQL}))`;

module.exports = { DEVOLUCAO_VIVA_SQL, ENTRADA_DA_DEVOLUCAO_SQL, estornoConcluidoSql, seriesQueVoltaramSql };
