/**
 * Etapa 209 (C466, 1a parte; B1416, B1421) — o BLOQUEADO POR LOTE de um material, derivado do livro: a parcela
 * "quarentena/avulso" e Σ BLOQUEIO (+) − Σ DESBLOQUEIO (−) com `lote_id` e `cancelado = 0`. Sem tabela nem coluna nova (B1416):
 * o estorno marca `cancelado = 1` (a soma corrige sozinha; volta a 0 se o estorno falhar), o catch do motor nao grava a linha
 * (a soma nao muda) e linha antiga tem `lote_id IS NULL` (fica "sem lote"). O material continua sendo a fonte do TOTAL
 * (`quantidade_bloqueada`); o lote e um detalhamento.
 *
 * Quem escreve `lote_id` num BLOQUEIO hoje: so a devolucao para Quarentena (o lote herdado da saida, T2). O bloqueio avulso e a
 * liberacao por NC continuam sem lote (B1419, C500, C501). Reprovacao da inspecao e terceiros NAO entram aqui: ja sabem o lote pelo
 * documento (B1418) — quem compoe as tres parcelas e o item 9 (C503).
 *
 * O leitor NAO clampa (B1421): `lotes` e o que o livro diz; `sem_lote = MAX(0, total − Σ lotes)`.
 *
 * Sem `require` de `stockService` (o motor importa este arquivo). Quantidades arredondadas a 1e-6 (`Q.qtdSql`, molde
 * `loteImpedido.js`). `materialExpr`/`loteExpr` sao expressoes SQL (coluna correlacionada ou `'?'` com o valor como parametro —
 * Fase 2 item 5); nunca interpolar valor vindo do usuario.
 */
const Q = require('./quantidade');
const { dbGet, dbAll } = require('./db');

const SOMA_SQL = 'SUM(CASE WHEN bpl.tipo = \'BLOQUEIO\' THEN bpl.quantidade ELSE -bpl.quantidade END)';
const FILTRO_SQL = 'bpl.cancelado = 0 AND bpl.tipo IN (\'BLOQUEIO\',\'DESBLOQUEIO\')';

/** O bloqueado do lote `loteExpr` do material `materialExpr`, ja entre parenteses. */
function bloqueadoDoLoteSql(materialExpr, loteExpr) {
  return `(${Q.qtdSql(`COALESCE((SELECT ${SOMA_SQL} FROM movimentacoes_almoxarifado bpl
      WHERE bpl.material_id = ${materialExpr} AND bpl.lote_id = ${loteExpr} AND ${FILTRO_SQL}), 0)`)})`;
}

/** Σ do bloqueado de todos os lotes do material (o mesmo filtro, `lote_id IS NOT NULL`), ja entre parenteses. */
function bloqueadoComLoteSql(materialExpr) {
  return `(${Q.qtdSql(`COALESCE((SELECT ${SOMA_SQL} FROM movimentacoes_almoxarifado bpl
      WHERE bpl.material_id = ${materialExpr} AND bpl.lote_id IS NOT NULL AND ${FILTRO_SQL}), 0)`)})`;
}

/**
 * `{ material_id, total, sem_lote, lotes: [{ lote_id, codigo, quantidade }] }` — `lotes` so com quantidade > folga, por codigo e
 * id. Material inexistente -> null (a rota decide o 404).
 */
async function bloqueadoPorLote(db, materialId) {
  const mat = await dbGet(db, `SELECT id, COALESCE(quantidade_bloqueada, 0) AS total, ${bloqueadoComLoteSql('id')} AS com_lote
    FROM materiais_almoxarifado WHERE id = ?`, [materialId]);
  if (!mat) return null;
  const linhas = await dbAll(db, `SELECT bpl.lote_id, l.codigo, ${Q.qtdSql(SOMA_SQL)} AS quantidade
    FROM movimentacoes_almoxarifado bpl JOIN lotes_almoxarifado l ON l.id = bpl.lote_id
    WHERE bpl.material_id = ? AND bpl.lote_id IS NOT NULL AND ${FILTRO_SQL}
    GROUP BY bpl.lote_id, l.codigo ORDER BY l.codigo, l.id`, [mat.id]);
  const total = Q.qtd(Number(mat.total));
  return {
    material_id: Number(mat.id),
    total,
    sem_lote: Math.max(0, Q.qtd(total - Number(mat.com_lote))),
    lotes: linhas.filter((x) => Number(x.quantidade) > Q.QTD_FOLGA)
      .map((x) => ({ lote_id: Number(x.lote_id), codigo: x.codigo, quantidade: Q.qtd(Number(x.quantidade)) })),
  };
}

module.exports = { bloqueadoDoLoteSql, bloqueadoComLoteSql, bloqueadoPorLote };
