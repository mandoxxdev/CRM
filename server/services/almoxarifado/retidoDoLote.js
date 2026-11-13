/**
 * Etapa 217 (C466, 2a parte; C503; B1434-B1439) — o RETIDO DO LOTE: o que esta na prateleira de um lote e nao pode sair porque esta
 * bloqueado NELE. Uma regua so para os dois leitores: o automatico da entrega (`requisitionService.lotesParaOAutomatico`, via
 * `retidoPorLote`) e o desconto do lote impedido da aprovacao e da separacao (`loteImpedido.loteImpedidoSql`, via `retidoDoLoteSql` e
 * `retidoComLoteSql`).
 *
 * As tres parcelas (B1434), cada uma >= 0:
 *   - quarentena/avulso — o livro: `bloqueioPorLote.bloqueadoDoLoteSql` (Etapa 209), MAX(0, ...);
 *   - reprovacao da inspecao — o documento: `inspecoes_recebimento_almoxarifado.quantidade_reprovada` do item de recebimento do lote,
 *     sem nenhum dos tres carimbos (`liberacao_nc_em`, `devolucao_fornecedor_em`, `sucateamento_em`). A reprovacao NAO muda o status do
 *     lote (Achado 1): a peca reprovada fica num lote ATIVO;
 *   - em terceiros — o item da remessa ENVIADO: `quantidade − quantidade_retornada` (`retornada` = liquidada: retorno, perda, consumo,
 *     encerramento, cancelamento). A remessa nao baixa o saldo do lote (Achado 2).
 * Limite por familia (B1436, tudo ou nada): a quarentena so vale se a soma dela por lote couber em `quantidade_bloqueada`; a reprovacao
 * so se quarentena + reprovacao couberem (a quarentena primeiro: o livro e guardado pelas M1/M2/M3 da 209; a reprovacao pode estar velha,
 * C501); terceiros so se a soma couber em `quantidade_em_terceiros`. Familia que nao cabe retem 0 em todo lote — o total dela volta para
 * o desconto do material, o numero de hoje. A soma da familia e a das PARCELAS (cada lote por MAX(0, ...)), nunca a liquida do livro
 * (`bloqueadoComLoteSql`): com a liquida, um lote com soma negativa abatia a de outro e o retido total passava do total do material — o
 * impedido caia abaixo do de hoje (Fase 2 M4, achado pelo sorteio RN-217.09).
 * Limite por lote (B1435): o retido nunca passa do fisico livre do lote, MAX(0, saldo − em inspecao no lote). O que o limite tira volta
 * para o resto do material (quem soma o resto e `loteImpedidoSql`: total − Σ retido).
 *
 * Nada aqui grava; roda dentro das secoes que os leitores ja seguram (B1437, sem trava nova). Sem `require` de `stockService` nem de
 * `requisitionService` (o `loteImpedido` importa este arquivo e o `requisitionStateMachine` importa o `loteImpedido`). `m` e `l` sao
 * APELIDOS (de `materiais_almoxarifado` e `lotes_almoxarifado`) — sempre qualificados nas subconsultas (o fix `8ff95f59` da 209: `id`
 * solto dentro da subconsulta e o do livro). Apelidos internos `rdl_*`. Quantidades por `Q.qtdSql`.
 */
const Q = require('./quantidade');
const { dbGet } = require('./db');
const { bloqueadoDoLoteSql } = require('./bloqueioPorLote');

const SEM_CARIMBO = (i) => `${i}.liberacao_nc_em IS NULL AND ${i}.devolucao_fornecedor_em IS NULL AND ${i}.sucateamento_em IS NULL`;

/** Parcela da quarentena/avulso do lote (o livro), >= 0. */
function quarentenaDoLoteSql(m, l) {
  return `MAX(0, ${bloqueadoDoLoteSql(`${m}.id`, `${l}.id`)})`;
}

/** Parcela da reprovacao da inspecao do lote (o documento), sem os carimbos. */
function reprovadoDoLoteSql(l) {
  return `COALESCE((SELECT SUM(MAX(0, COALESCE(rdl_i.quantidade_reprovada, 0))) FROM inspecoes_recebimento_almoxarifado rdl_i
      JOIN recebimentos_material_itens_almoxarifado rdl_ri ON rdl_ri.id = rdl_i.recebimento_item_id
      WHERE rdl_ri.lote_id = ${l}.id AND ${SEM_CARIMBO('rdl_i')}), 0)`;
}

/** Parcela em terceiros do lote (itens de remessa enviados do material). */
function terceirosDoLoteSql(m, l) {
  return `COALESCE((SELECT SUM(MAX(0, rdl_t.quantidade - COALESCE(rdl_t.quantidade_retornada, 0)))
      FROM itens_remessa_terceiro_almoxarifado rdl_t
      WHERE rdl_t.material_id = ${m}.id AND rdl_t.lote_id = ${l}.id AND rdl_t.enviado_em IS NOT NULL), 0)`;
}

/** O fisico livre do lote: MAX(0, saldo do lote − em inspecao no lote) — a mesma regua da 205/197. */
function fisicoLivreDoLoteSql(m, l) {
  return `MAX(0, COALESCE((SELECT SUM(rdl_s.quantidade) FROM estoque_saldo_almoxarifado rdl_s
                WHERE rdl_s.material_id = ${m}.id AND rdl_s.lote_id = ${l}.id), 0)
      - COALESCE((SELECT SUM(rdl_ri3.quantidade_em_inspecao) FROM recebimentos_material_itens_almoxarifado rdl_ri3
                  WHERE rdl_ri3.lote_id = ${l}.id AND COALESCE(rdl_ri3.quantidade_em_inspecao, 0) > 0), 0))`;
}

/**
 * Uma tabela derivada (para um FROM) com UMA linha por lote do material `m` (apelido de fora — correlacionado):
 * `lote_id`, `fis` (fisico livre), `ret` (o retido, B1434-B1436) e as `colunas` extras que o chamador pedir (funcao do apelido do lote
 * -> lista SQL `expr AS nome`). As parcelas sao lidas UMA vez por lote e as somas das familias saem de `SUM(...) OVER ()` sobre as
 * mesmas linhas — a primeira versao (somas por subconsulta dentro de cada lote, e o retido de cada lote recalculado para o resto do
 * material) estourava a pilha do analisador do SQLite ("parser stack overflow") nas leituras da fila e do detalhe.
 */
function lotesComRetidoSql(m, colunas = null) {
  const bloq = `COALESCE(${m}.quantidade_bloqueada, 0)`;
  const terc = `COALESCE(${m}.quantidade_em_terceiros, 0)`;
  const extras = colunas ? `, ${colunas('rdl_l')}` : '';
  return `(SELECT rdl_p.*, ${Q.qtdSql(`MIN(rdl_p.fis,
        (CASE WHEN SUM(rdl_p.quar) OVER () <= ${bloq} + ${Q.QTD_FOLGA} THEN rdl_p.quar ELSE 0 END)
      + (CASE WHEN SUM(rdl_p.quar) OVER () + SUM(rdl_p.repr) OVER () <= ${bloq} + ${Q.QTD_FOLGA} THEN rdl_p.repr ELSE 0 END)
      + (CASE WHEN SUM(rdl_p.terc) OVER () <= ${terc} + ${Q.QTD_FOLGA} THEN rdl_p.terc ELSE 0 END))`)} AS ret
    FROM (SELECT rdl_l.id AS lote_id${extras}, ${fisicoLivreDoLoteSql(m, 'rdl_l')} AS fis, ${quarentenaDoLoteSql(m, 'rdl_l')} AS quar,
        ${reprovadoDoLoteSql('rdl_l')} AS repr, ${terceirosDoLoteSql(m, 'rdl_l')} AS terc
      FROM lotes_almoxarifado rdl_l WHERE rdl_l.material_id = ${m}.id) rdl_p)`;
}

/** Map<lote_id, retido> do material (so retido > folga) — o mesmo fragmento, numa consulta. */
async function retidoPorLote(db, materialId) {
  const row = await dbGet(db, `SELECT (SELECT json_group_array(json_array(rdl_r.lote_id, rdl_r.ret)) FROM ${lotesComRetidoSql('rdl_mp')} rdl_r)
    AS j FROM materiais_almoxarifado rdl_mp WHERE rdl_mp.id = ?`, [materialId]);
  const mapa = new Map();
  for (const [id, r] of (row && row.j ? JSON.parse(row.j) : [])) if (Number(r) > Q.QTD_FOLGA) mapa.set(Number(id), Q.qtd(Number(r)));
  return mapa;
}

/**
 * Etapa 218 (B1444, C513): a situacao de cada lote do material para o lote escolhido a mao ("Sai de") — Map<lote_id, { saldo, inspecao,
 * retido, livre }>. A MESMA tabela derivada (`lotesComRetidoSql`) do automatico e da 205, com o saldo e a inspecao crus do lote (para a
 * literal). `livre = MAX(0, fis − ret)` = `MAX(0, saldo − inspecao − retido)`. Uma consulta; so le.
 */
async function situacaoDosLotes(db, materialId) {
  const extras = (l) => `COALESCE((SELECT SUM(rdl_s2.quantidade) FROM estoque_saldo_almoxarifado rdl_s2
        WHERE rdl_s2.material_id = rdl_mp.id AND rdl_s2.lote_id = ${l}.id), 0) AS saldo,
      COALESCE((SELECT SUM(rdl_ri4.quantidade_em_inspecao) FROM recebimentos_material_itens_almoxarifado rdl_ri4
        WHERE rdl_ri4.lote_id = ${l}.id AND COALESCE(rdl_ri4.quantidade_em_inspecao, 0) > 0), 0) AS insp`;
  const row = await dbGet(db, `SELECT (SELECT json_group_array(json_array(rdl_r.lote_id, rdl_r.saldo, rdl_r.insp, rdl_r.ret, rdl_r.fis))
      FROM ${lotesComRetidoSql('rdl_mp', extras)} rdl_r) AS j FROM materiais_almoxarifado rdl_mp WHERE rdl_mp.id = ?`, [materialId]);
  const mapa = new Map();
  for (const [id, saldo, insp, ret, fis] of (row && row.j ? JSON.parse(row.j) : [])) {
    const retido = Q.qtd(Number(ret) || 0);
    mapa.set(Number(id), { saldo: Q.qtd(Number(saldo) || 0), inspecao: Q.qtd(Number(insp) || 0), retido,
      livre: Q.qtd(Math.max(0, (Number(fis) || 0) - retido)) });
  }
  return mapa;
}

module.exports = {
  quarentenaDoLoteSql, reprovadoDoLoteSql, terceirosDoLoteSql, fisicoLivreDoLoteSql, lotesComRetidoSql, retidoPorLote,
  situacaoDosLotes,
};
