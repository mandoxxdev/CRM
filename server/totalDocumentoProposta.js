/**
 * O total da proposta como o DOCUMENTO o mostra (preview, PDF) — e, desde a Etapa 141 (RN-141.08, C306, Fase 5 r1/r2 I-1), como o
 * pedido de aprovação do desconto o grava.
 *
 *   subtotal = Σ quantidade (parseFloat, vazia/0 → 1) × (valor_unitario || preco_base do produto, parseFloat) + os acessórios
 *   total    = com itens, o subtotal; sem itens, o `valor_total` gravado (parseFloat, não número → 0)
 *
 * Antes eram duas cópias da mesma conta no `index.js` (o /premium e o /pdf — "mexeu num, mexa no outro"), e o pedido de aprovação
 * gravava o total que o corpo dissesse; a primeira versão da Etapa 141 passou a ler `propostas.valor_total`, que o PUT grava do corpo
 * sem conferir com os itens — o vendedor gravava 100 numa proposta de R$ 100.000 e o aprovador via "Desconto: R$ 30".
 *
 * Os itens vêm de `proposta_itens` com `preco_base` do produto (o LEFT JOIN por código das duas rotas do documento).
 *
 * Etapa 143 (RN-143.05, C311): no máximo UM produto por item — o de código igual ao do item, senão o de código igual aparado de menor id;
 * item sem código (ou só espaços) não junta produto nenhum. Antes o JOIN comparava aparado contra um UNIQUE do texto cru, e o cadastro
 * não apara: com os produtos 'PJ1' e 'PJ1 ' o item saía duas vezes no documento (e o total, em dobro — aqui, no pedido de aprovação do
 * desconto); com um produto de código só de espaços, todo item manual juntava esse produto (o nome e o preço dele no documento).
 * Um texto só, usado pelo /premium, pelo /pdf e por ITENS_SQL.
 */
// Uma subconsulta "ORDER BY ... LIMIT 1" no ON não serve: o SQLite não deixa o ORDER BY dela ler a coluna do item (no such column:
// pi.codigo_produto). Então: junta o produto de código igual aparado para o qual NÃO existe outro melhor (código igual ao cru, depois menor id).
const JOIN_PRODUTO_DO_ITEM = `LEFT JOIN produtos pr ON TRIM(COALESCE(pi.codigo_produto, '')) <> ''
    AND TRIM(pr.codigo) = TRIM(pi.codigo_produto)
    AND NOT EXISTS (
      SELECT 1 FROM produtos p2
      WHERE TRIM(p2.codigo) = TRIM(pi.codigo_produto)
        AND ((p2.codigo = pi.codigo_produto) > (pr.codigo = pi.codigo_produto)
          OR ((p2.codigo = pi.codigo_produto) = (pr.codigo = pi.codigo_produto) AND p2.id < pr.id)))`;
const { totalAcessoriosDosItens } = require('./acessoriosItem');

const ITENS_SQL = `SELECT pi.*, pr.preco_base FROM proposta_itens pi
  ${JOIN_PRODUTO_DO_ITEM}
  WHERE pi.proposta_id = ? ORDER BY pi.id`;

function subtotalDosItens(itens) {
  const lista = Array.isArray(itens) ? itens : [];
  return lista.reduce((soma, item) => {
    const qtd = parseFloat(item.quantidade) || 1;
    const preco = parseFloat(item.valor_unitario) || parseFloat(item.preco_base) || 0;
    return soma + (qtd * preco);
    // Os acessórios entram logo abaixo: são linhas próprias na tabela de preços, não parte do preço do equipamento.
  }, 0) + totalAcessoriosDosItens(lista);
}

function totalDoDocumento(itens, valorTotalGravado) {
  const lista = Array.isArray(itens) ? itens : [];
  return lista.length > 0 ? subtotalDosItens(lista) : (parseFloat(valorTotalGravado) || 0);
}

module.exports = { ITENS_SQL, JOIN_PRODUTO_DO_ITEM, subtotalDosItens, totalDoDocumento };
