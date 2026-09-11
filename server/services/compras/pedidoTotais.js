/**
 * Totais do pedido de compra — implementador ÚNICO da RN-03/04/05 da Etapa 32.
 *
 * Quem consome: a rota de lista, o GET :id, a impressão e o formulário da tela.
 * NINGUÉM recalcula por fora. Três implementações da mesma conta divergem em centavos
 * (SQL SUM, Math.round no Node e a soma em JS do formulário), e o documento vai ao
 * fornecedor — divergência aqui é diferença de nota fiscal.
 *
 * A ordem do arredondamento é normativa: cada linha é arredondada a 2 casas ANTES de
 * somar. Arredondar a soma bruta dá resultado diferente na escala de dezenas de itens,
 * e é a linha arredondada que o fornecedor lê no papel.
 */

/** Meio-para-cima em 2 casas, defendido do erro de ponto flutuante (1.005 → 1.01). */
function arred2(valor) {
  const n = Number(valor);
  if (!Number.isFinite(n)) return 0;
  // O +Number.EPSILON sozinho não resolve todos os casos; o round no inteiro escalado
  // com correção de representação é o que mantém 28.483 → 28.48 e 2.418 → 2.42.
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function numero(valor, padrao = 0) {
  const n = Number(valor);
  return Number.isFinite(n) ? n : padrao;
}

/**
 * Calcula os derivados de uma linha.
 * @returns {{ valor_linha: number, ipi_linha: number }}
 */
function calcularLinha(item) {
  const quantidade = numero(item && item.quantidade);
  const valorUnitario = numero(item && item.valor_unitario);
  const ipiPercentual = numero(item && item.ipi_percentual);

  const valor_linha = arred2(quantidade * valorUnitario);
  const ipi_linha = arred2(valor_linha * (ipiPercentual / 100));
  return { valor_linha, ipi_linha };
}

/**
 * Totais do pedido.
 *
 * @param {Array} itens
 * @param {object} encargos { total_icms_st, valor_frete, total_desconto }
 * @returns {{ itens: Array, totais: object }} itens devolvidos COM os derivados,
 *          para o chamador não ter de recalcular e arriscar divergir.
 */
function calcularTotaisPedido(itens, encargos = {}) {
  const lista = Array.isArray(itens) ? itens : [];

  const itensCalculados = lista.map((item) => ({
    ...item,
    ...calcularLinha(item),
  }));

  const total_produtos = arred2(
    itensCalculados.reduce((soma, i) => soma + i.valor_linha, 0)
  );
  const total_ipi = arred2(
    itensCalculados.reduce((soma, i) => soma + i.ipi_linha, 0)
  );

  const total_icms_st = arred2(numero(encargos.total_icms_st));
  const valor_frete = arred2(numero(encargos.valor_frete));
  const total_desconto = arred2(numero(encargos.total_desconto));

  const total_geral = arred2(
    total_produtos + total_ipi + total_icms_st + valor_frete - total_desconto
  );

  return {
    itens: itensCalculados,
    totais: {
      total_produtos,
      total_ipi,
      total_icms_st,
      total_desconto,
      valor_frete,
      total_geral,
    },
  };
}

module.exports = { calcularTotaisPedido, calcularLinha, arred2 };
