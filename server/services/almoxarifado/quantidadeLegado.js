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
const { QTD_CASAS, QTD_FOLGA } = require('./quantidade');

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
 * Etapa 96 (Fase 5, R2) — os AGREGADOS do material sao recalculados das fontes, nao arredondados sozinhos.
 *
 * Arredondar cada coluna sozinha quebrava as invariantes do motor: tres linhas de endereco de 1/3 e o material 1 ficavam
 * linhas 0,333333 x 3 = 0,999999 e material 1 (`ENTRADA 1` + `SAIDA 2` deixava uma linha em -0,000001); tres reservas
 * de 1/3 contra o reservado 1 ficavam 0,333333 x 3 e reservado 1 — liberadas as tres, sobrava 0,000001 reservado sem
 * reserva (sonda e96rv1-p6-normaliza). Regra: onde a invariante VALIA antes (com a folga de 1e-9), ela continua
 * valendo depois — `quantidade_atual` = ROUND(soma das linhas ja arredondadas) (a "soma das linhas e a verdade" de
 * `syncMaterialTotals`) e `quantidade_reservada` = ROUND(soma dos saldos das reservas ATIVAS ja arredondados). Onde a
 * invariante ja estava quebrada antes (divergencia de verdade, nao residuo), o script NAO reconcilia: so arredonda — a
 * divergencia e outro defeito e nao se apaga calada. Descartados: (i) recalcular todo material com linha — sobrescreveria
 * divergencias reais; (ii) distribuir o resto entre as linhas (maior resto) para manter o total 1 — inventa em qual
 * endereco fica o 0,000001; o material perde 1e-6 por arredondamento de linha, que e a precisao do modulo (B481).
 *
 * O `novo` sai do SQL (ROUND das linhas como o UPDATE as grava, e ROUND da soma) — I6: nunca arredondar o mesmo cru dos
 * dois lados. Calculado ANTES de gravar as colunas (a invariante e medida no cru).
 */
const RECALCULOS = Object.freeze([
  Object.freeze({
    tabela: 'materiais_almoxarifado', coluna: 'quantidade_atual', fonte: 'soma das linhas de saldo',
    sql: `SELECT m.id, ROUND(SUM(ROUND(s.quantidade, ${QTD_CASAS})), ${QTD_CASAS}) AS novo
      FROM materiais_almoxarifado m JOIN estoque_saldo_almoxarifado s ON s.material_id = m.id
      GROUP BY m.id
      HAVING ABS(COALESCE(m.quantidade_atual, 0) - SUM(s.quantidade)) <= ${QTD_FOLGA}
        AND novo <> ROUND(COALESCE(m.quantidade_atual, 0), ${QTD_CASAS})
      ORDER BY m.id`,
  }),
  Object.freeze({
    tabela: 'materiais_almoxarifado', coluna: 'quantidade_reservada', fonte: 'soma dos saldos das reservas ativas',
    sql: `SELECT m.id, ROUND(SUM(ROUND(r.quantidade, ${QTD_CASAS}) - ROUND(COALESCE(r.quantidade_utilizada, 0), ${QTD_CASAS})),
        ${QTD_CASAS}) AS novo
      FROM materiais_almoxarifado m JOIN reservas_material_almoxarifado r ON r.material_id = m.id AND r.status = 'ATIVA'
      GROUP BY m.id
      HAVING ABS(COALESCE(m.quantidade_reservada, 0) - SUM(r.quantidade - COALESCE(r.quantidade_utilizada, 0))) <= ${QTD_FOLGA}
        AND novo <> ROUND(COALESCE(m.quantidade_reservada, 0), ${QTD_CASAS})
      ORDER BY m.id`,
  }),
]);

/** O que o recalculo gravaria agora: `[{ tabela, coluna, fonte, ids: [{ id, novo }] }]`. */
async function planejarRecalculos(db) {
  const out = [];
  for (const r of RECALCULOS) {
    // eslint-disable-next-line no-await-in-loop
    const ids = await dbAll(db, r.sql);
    out.push({ tabela: r.tabela, coluna: r.coluna, fonte: r.fonte, ids });
  }
  return out;
}

/**
 * Sem `aplicar`: so conta, por coluna, quantas linhas estao tortas. Com `aplicar`: grava `ROUND(col, 6)` onde torto
 * (idempotente), tudo numa transacao — ou normaliza as 15 colunas, ou nenhuma.
 * → `{ aplicado, porColuna: [{ tabela, coluna, linhas }], recalculados: [{ tabela, coluna, fonte, materiais }] }` —
 * `porColuna` na ordem de COLUNAS_LEGADO; `recalculados` (Fase 5, R2) conta os materiais cujo agregado sai da fonte e
 * nao do ROUND da propria coluna (sem `aplicar`, os que sairiam).
 */
async function normalizar(db, { aplicar = false } = {}) {
  const porColuna = [];
  if (aplicar) {
    await dbRun(db, 'BEGIN IMMEDIATE');
    try {
      const plano = await planejarRecalculos(db); // ANTES de gravar: a invariante e medida no cru
      for (const { tabela, coluna } of COLUNAS_LEGADO) {
        const r = await dbRun(db, `UPDATE ${tabela} SET ${coluna} = ROUND(${coluna}, ${QTD_CASAS})
          WHERE ${tortoSql(coluna)}`);
        porColuna.push({ tabela, coluna, linhas: r.changes });
      }
      const recalculados = [];
      for (const p of plano) {
        for (const { id, novo } of p.ids) {
          // eslint-disable-next-line no-await-in-loop
          await dbRun(db, `UPDATE ${p.tabela} SET ${p.coluna} = ? WHERE id = ?`, [novo, id]);
        }
        recalculados.push({ tabela: p.tabela, coluna: p.coluna, fonte: p.fonte, materiais: p.ids.length });
      }
      await dbRun(db, 'COMMIT');
      return { aplicado: true, porColuna, recalculados };
    } catch (e) {
      await dbRun(db, 'ROLLBACK').catch(() => {});
      throw e;
    }
  }
  for (const { tabela, coluna } of COLUNAS_LEGADO) {
    const r = await dbGet(db, `SELECT COUNT(*) AS n FROM ${tabela} WHERE ${tortoSql(coluna)}`);
    porColuna.push({ tabela, coluna, linhas: r.n });
  }
  const recalculados = (await planejarRecalculos(db))
    .map((p) => ({ tabela: p.tabela, coluna: p.coluna, fonte: p.fonte, materiais: p.ids.length }));
  return { aplicado: false, porColuna, recalculados };
}

module.exports = { COLUNAS_LEGADO, listarTortos, normalizar, planejarRecalculos };
