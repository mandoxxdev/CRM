/**
 * Etapa 96 T4 (A47, B483, B484) — o legado de quantidade gravada torta.
 *
 * Antes da 96 o motor somava REAL sem arredondar: 0,7 + 0,2 + 0,1 ficava 0.9999999999999999. Depois da 96 a escrita
 * nova grava arredondado (quantidade.js) e a folga faz o legado nao prender gesto nenhum — o que sobra e o numero torto
 * na tela. Este modulo lista o legado (a consulta A47) e, so quando mandado, o normaliza.
 *
 * - "Torto" = `col <> ROUND(col, 6)`. NAO `ABS(col - ROUND(col, 6)) > 1e-12`: a deriva e ~1e-16 e essa forma devolve
 *   vazio (o falso negativo medido na Etapa 95).
 * - O `arredondado` do relatorio vem do ROUND do SQL — o mesmo numero que `normalizar` grava (Fase 2, I6: nunca
 *   arredondar o mesmo cru em JS e no SQL e comparar; nos meios exatos eles discordam).
 * - `movimentacoes_almoxarifado` NAO entra (B484): o livro e rastro, reescrever apaga a prova do defeito.
 *   `itens_conferencia_almoxarifado` tambem nao: a contagem e registro do que se contou.
 * - Nada roda sozinho no boot (B483): quem chama e o script `scripts/normalizar-quantidades-almoxarifado.js`.
 *
 * Plano: docs/superpowers/plans/2026-10-09-almoxarifado-etapa96-motor-quantidade-arredondada.md (contrato "O legado")
 */
const { dbRun, dbGet, dbAll } = require('./db');
const { QTD_CASAS } = require('./quantidade');

const COLUNAS_LEGADO = Object.freeze([
  ['materiais_almoxarifado', 'quantidade_atual'],
  ['materiais_almoxarifado', 'quantidade_reservada'],
  ['materiais_almoxarifado', 'quantidade_bloqueada'],
  ['materiais_almoxarifado', 'quantidade_em_inspecao'],
  ['materiais_almoxarifado', 'quantidade_em_terceiros'],
  ['estoque_saldo_almoxarifado', 'quantidade'],
  ['reservas_material_almoxarifado', 'quantidade'],
  ['reservas_material_almoxarifado', 'quantidade_utilizada'],
  // Etapa 96 (Fase 5, R1): o solicitado tambem — o 1/3 cru prendia a requisicao em PARCIALMENTE_ATENDIDA.
  ['itens_requisicao_almoxarifado', 'quantidade_solicitada'],
  ['itens_requisicao_almoxarifado', 'quantidade_separada'],
  ['itens_requisicao_almoxarifado', 'quantidade_entregue'],
  ['itens_requisicao_almoxarifado', 'quantidade_atendida'],
  ['itens_remessa_terceiro_almoxarifado', 'quantidade_retornada'],
  ['recebimentos_material_itens_almoxarifado', 'quantidade_recebida'],
  ['recebimentos_material_itens_almoxarifado', 'quantidade_em_inspecao'],
].map(([tabela, coluna]) => Object.freeze({ tabela, coluna })));

/** A unica definicao de "torto" — a consulta, a contagem e o UPDATE usam esta. NULL nao e torto. */
function tortoSql(coluna) {
  return `${coluna} <> ROUND(${coluna}, ${QTD_CASAS})`;
}

/** A47: cada valor guardado com residuo, `[{ tabela, coluna, id, valor, arredondado }]`, por tabela, coluna e id. */
async function listarTortos(db) {
  const out = [];
  for (const { tabela, coluna } of COLUNAS_LEGADO) {
    const rows = await dbAll(db, `SELECT id, ${coluna} AS valor, ROUND(${coluna}, ${QTD_CASAS}) AS arredondado
      FROM ${tabela} WHERE ${tortoSql(coluna)} ORDER BY id`);
    for (const r of rows) out.push({ tabela, coluna, id: r.id, valor: r.valor, arredondado: r.arredondado });
  }
  return out.sort((a, b) => (a.tabela.localeCompare(b.tabela) || a.coluna.localeCompare(b.coluna) || a.id - b.id));
}

/**
 * Sem `aplicar`: so conta, por coluna, quantas linhas estao tortas. Com `aplicar`: grava `ROUND(col, 6)` onde torto
 * (idempotente), tudo numa transacao — ou normaliza as 15 colunas, ou nenhuma.
 * → `{ aplicado, porColuna: [{ tabela, coluna, linhas }] }` na ordem de COLUNAS_LEGADO.
 */
async function normalizar(db, { aplicar = false } = {}) {
  const porColuna = [];
  if (aplicar) {
    await dbRun(db, 'BEGIN IMMEDIATE');
    try {
      for (const { tabela, coluna } of COLUNAS_LEGADO) {
        const r = await dbRun(db, `UPDATE ${tabela} SET ${coluna} = ROUND(${coluna}, ${QTD_CASAS})
          WHERE ${tortoSql(coluna)}`);
        porColuna.push({ tabela, coluna, linhas: r.changes });
      }
      await dbRun(db, 'COMMIT');
    } catch (e) {
      await dbRun(db, 'ROLLBACK').catch(() => {});
      throw e;
    }
    return { aplicado: true, porColuna };
  }
  for (const { tabela, coluna } of COLUNAS_LEGADO) {
    const r = await dbGet(db, `SELECT COUNT(*) AS n FROM ${tabela} WHERE ${tortoSql(coluna)}`);
    porColuna.push({ tabela, coluna, linhas: r.n });
  }
  return { aplicado: false, porColuna };
}

module.exports = { COLUNAS_LEGADO, listarTortos, normalizar };
