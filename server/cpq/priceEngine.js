/**
 * Motor de preço CPQ.
 * Custo equipamento, engenharia, montagem, logística, automação + margem + desconto + impostos.
 */

function calculate(db, items, options, callback) {
  const margin = parseFloat(options.margem) || 0;
  const discount = parseFloat(options.desconto) || 0;
  const costEquipment = (items || []).reduce((s, i) => s + (parseFloat(i.valor_unitario) || 0) * (parseFloat(i.quantidade) || 1), 0);
  const costEngineering = (parseFloat(options.custo_engenharia) || 0) + (costEquipment * (parseFloat(options.percentual_engenharia) || 0) / 100);
  const costMontagem = (parseFloat(options.custo_montagem) || 0) + (costEquipment * (parseFloat(options.percentual_montagem) || 0) / 100);
  const costLogistica = parseFloat(options.custo_logistica) || 0;
  const costAutomacao = parseFloat(options.custo_automacao) || 0;

  const subtotalCost = costEquipment + costEngineering + costMontagem + costLogistica + costAutomacao;
  const withMargin = subtotalCost * (1 + margin / 100);
  const withDiscount = withMargin * (1 - discount / 100);
  const icms = (options.icms != null ? parseFloat(options.icms) : 18) / 100;
  const total = withDiscount * (1 + icms);

  const byGroup = {};
  (items || []).forEach(i => {
    const g = i.group_name || i.composition_group || 'Outros';
    if (!byGroup[g]) byGroup[g] = { items: [], subtotal: 0 };
    const lineTotal = (parseFloat(i.valor_unitario) || 0) * (parseFloat(i.quantidade) || 1);
    byGroup[g].items.push({ ...i, line_total: lineTotal });
    byGroup[g].subtotal += lineTotal;
  });

  callback(null, {
    breakdown: {
      custo_equipamento: costEquipment,
      custo_engenharia: costEngineering,
      custo_montagem: costMontagem,
      custo_logistica: costLogistica,
      custo_automacao: costAutomacao,
      subtotal_custo: subtotalCost,
      margem_percent: margin,
      com_margem: withMargin,
      desconto_percent: discount,
      com_desconto: withDiscount,
      impostos: total - withDiscount,
      total
    },
    by_group: byGroup,
    total
  });
}

module.exports = { calculate };
