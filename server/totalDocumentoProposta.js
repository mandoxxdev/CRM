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
 */
const { totalAcessoriosDosItens } = require('./acessoriosItem');

const ITENS_SQL = `SELECT pi.*, pr.preco_base FROM proposta_itens pi
  LEFT JOIN produtos pr ON TRIM(COALESCE(pi.codigo_produto,'')) = TRIM(COALESCE(pr.codigo,''))
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

module.exports = { ITENS_SQL, subtotalDosItens, totalDoDocumento };
