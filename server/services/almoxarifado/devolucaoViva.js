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

/**
 * Etapa 271 (C553, RN-271.01..05) — o que uma exclusao da requisicao INTERROMPIDA ja devolveu ao estoque desta saida. A exclusao
 * credita uma ENTRADA por linha da saida, sem transacao: uma falha inesperada no meio deixa as primeiras gravadas com a requisicao
 * ativa. A nova exclusao ja pula o que entrou (B1609, `requisitionService.excluirSemTrava`), mas a Devolucao citando a saida nao via
 * essas ENTRADAs: A 3, B 5, entrega de 6, a 2a ENTRADA falha, Devolucao de 6 aceita, excluir de novo -> fisico 11 (certo 8).
 *
 * A ENTRADA da exclusao nao cita a saida: a chave e a da B1609 (`requisicao_id`, tipo ENTRADA, o motivo da exclusao com o numero,
 * viva). O total `E` dela (por requisicao e material) e repartido pelas saidas da requisicao na ordem da exclusao — por id, cada uma
 * pelo liquido (entregue - devolucao viva): exclusao(s) = max(0, min(liquido(s), E - soma dos liquidos das saidas de id menor)).
 * A ENTRADA da exclusao que trouxe serie fica fora de `E` (RN-271.05): as series reativadas ja contam em `seriesQueVoltaramSql`
 * (a reativacao grava a saida de onde sairam) — contar as duas descontaria em dobro.
 *
 * Fase 2 (achado 2): a saida cujas pecas tem serie (vinculada, ou que voltou com a serie — a linha da reativacao guarda a saida) fica
 * fora da reparticao, dos dois lados: a exclusao credita essas partes com serie (contadas nas series) e a B1609 nao as pula. Sem isto,
 * com uma saida com serie e outra antiga sem serie do mesmo material, o que a exclusao devolveu da antiga caia na com serie (ja zerada
 * pelas series) e a antiga aceitava devolver de novo.
 *
 * `semDevolucaoId` (opcional, um id numerico): a devolucao que NAO entra no liquido — a reconferencia dentro da trava passa a propria
 * linha, ja gravada. Sem isto a conta e circular: a linha recem-gravada zera o liquido e a parte da exclusao some (dev 6 + exclusao 0
 * nunca passa de 6 — medido na RN-271.06 b: fisico 11). As outras devolucoes entram: as que vieram depois da exclusao ja foram
 * limitadas por esta conta, entao o liquido nunca cai abaixo do que a exclusao devolveu.
 *
 * Usada pelas quatro contas da devolucao (`returnService`). NAO pela exclusao (ela ja pula o que entrou: contaria duas vezes) nem
 * pelo estorno da saida pelo livro (a saida de requisicao ja e recusada la). `saidaSql` aparece uma vez (`?` ou coluna); devolve um
 * numero, 0 sem exclusao interrompida.
 */
const MOTIVO_DA_EXCLUSAO = 'Estorno exclusão requisição ';
const devolvidaVivaDa = (alias, sem) => `(SELECT COALESCE(SUM(d.quantidade), 0) FROM devolucoes_material_almoxarifado d
  WHERE d.movimentacao_saida_id = ${alias}.id AND ${DEVOLUCAO_VIVA_SQL}${sem ? ` AND d.id <> ${sem}` : ''})`;
const saidaComSerieSql = (alias) => `(EXISTS (SELECT 1 FROM series_almoxarifado ssx WHERE ssx.movimentacao_saida_id = ${alias}.id)
  OR EXISTS (SELECT 1 FROM series_entrada_anterior_almoxarifado sey WHERE sey.saida_anterior_id = ${alias}.id))`;
const exclusaoInterrompidaSql = (saidaSql, semDevolucaoId) => {
  const sem = semDevolucaoId == null ? null : Number(semDevolucaoId);
  if (sem !== null && !Number.isInteger(sem)) throw new Error('exclusaoInterrompidaSql: semDevolucaoId tem de ser inteiro');
  // Fase 5 (desempenho): sem ENTRADA da exclusao da requisicao (o caso de sempre) responde 0 sem as somas — so o EXISTS pelo indice
  // `idx_mov_almox_requisicao_material`.
  return `COALESCE((SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM movimentacoes_almoxarifado exq
      WHERE exq.requisicao_id = sxa.requisicao_id AND exq.material_id = sxa.material_id AND exq.tipo = 'ENTRADA'
        AND exq.motivo LIKE '${MOTIVO_DA_EXCLUSAO}%') THEN 0 ELSE MAX(0, MIN(MAX(0, sxa.quantidade - ${devolvidaVivaDa('sxa', sem)}),
    (SELECT COALESCE(SUM(ex.quantidade), 0) FROM movimentacoes_almoxarifado ex
      JOIN requisicoes_almoxarifado rqe ON rqe.id = ex.requisicao_id
      WHERE ex.requisicao_id = sxa.requisicao_id AND ex.material_id = sxa.material_id AND ex.tipo = 'ENTRADA'
        AND COALESCE(ex.cancelado, 0) = 0 AND ex.motivo = '${MOTIVO_DA_EXCLUSAO}' || rqe.numero
        AND NOT EXISTS (SELECT 1 FROM series_entrada_anterior_almoxarifado sez WHERE sez.movimentacao_entrada_id = ex.id))
    - (SELECT COALESCE(SUM(MAX(0, sp.quantidade - ${devolvidaVivaDa('sp', sem)})), 0) FROM movimentacoes_almoxarifado sp
      WHERE sp.requisicao_id = sxa.requisicao_id AND sp.material_id = sxa.material_id AND sp.tipo = 'SAIDA'
        AND COALESCE(sp.cancelado, 0) = 0 AND sp.id < sxa.id AND NOT ${saidaComSerieSql('sp')}))) END
  FROM movimentacoes_almoxarifado sxa
  WHERE sxa.id = ${saidaSql} AND sxa.requisicao_id IS NOT NULL AND sxa.tipo = 'SAIDA' AND COALESCE(sxa.cancelado, 0) = 0
    AND NOT ${saidaComSerieSql('sxa')}), 0)`;
};

module.exports = {
  DEVOLUCAO_VIVA_SQL, ENTRADA_DA_DEVOLUCAO_SQL, estornoConcluidoSql, seriesQueVoltaramSql, exclusaoInterrompidaSql, MOTIVO_DA_EXCLUSAO,
};
