/**
 * Valor da proposta na moeda DELA (o modelo mudou em 25/11/2026 — veja valorDaProposta) (25/11/2026: "essa proposta eu coloquei em dólar e aqui está em real... tem que ter um fator de
 * conversão de moeda"). A lista mostrava tudo como R$. Em USD/EUR: "US$ 23.550,00" e, com a cotação gravada (propostas.taxa_cambio,
 * reais por 1 unidade), "≈ R$ 137.939,42" embaixo.
 */
const formatar = (valor, moeda) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: moeda }).format(Number(valor) || 0);

export function moedaDaProposta(p) {
  const m = String((p && p.moeda) || 'BRL').toUpperCase();
  return ['USD', 'EUR'].includes(m) ? m : 'BRL';
}

/**
 * { principal, emReais }. O valor GRAVADO é em reais em qualquer moeda (25/11/2026: "coloquei 128 mil reais e na proposta aparece
 * US$ 128.990,00"): em dólar/euro com cotação, o principal é o do documento (reais ÷ cotação, "US$ 22.022,08") e embaixo o valor
 * em reais ("R$ 128.990,00"). Sem cotação o documento sai em reais — e a lista também.
 */
export function valorDaProposta(p) {
  return valorEmReaisNaMoeda(p, Number(p && p.valor_total) || 0);
}

/** O mesmo para um valor qualquer da proposta em reais (o líquido com desconto, por exemplo). */
export function valorEmReaisNaMoeda(p, reais) {
  const moeda = moedaDaProposta(p);
  const valor = Number(reais) || 0;
  const taxa = Number(p && p.taxa_cambio);
  if (moeda === 'BRL' || !(taxa > 0)) return { principal: formatar(valor, 'BRL'), emReais: null };
  return { principal: formatar(valor / taxa, moeda), emReais: formatar(valor, 'BRL') };
}

/** Texto da cotação para o cadastro: "R$ 5,8573 por US$". */
export function rotuloDaCotacao(moeda, valor) {
  const simbolo = moeda === 'EUR' ? '€' : 'US$';
  const n = Number(valor);
  return n > 0 ? `R$ ${n.toLocaleString('pt-BR', { minimumFractionDigits: 4, maximumFractionDigits: 4 })} por ${simbolo}` : '';
}
