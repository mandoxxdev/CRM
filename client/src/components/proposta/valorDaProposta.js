/**
 * Valor da proposta na moeda DELA (25/11/2026: "essa proposta eu coloquei em dólar e aqui está em real... tem que ter um fator de
 * conversão de moeda"). A lista mostrava tudo como R$. Em USD/EUR: "US$ 23.550,00" e, com a cotação gravada (propostas.taxa_cambio,
 * reais por 1 unidade), "≈ R$ 137.939,42" embaixo.
 */
const formatar = (valor, moeda) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: moeda }).format(Number(valor) || 0);

export function moedaDaProposta(p) {
  const m = String((p && p.moeda) || 'BRL').toUpperCase();
  return ['USD', 'EUR'].includes(m) ? m : 'BRL';
}

/** { principal: 'US$ 23.550,00', emReais: '≈ R$ 137.939,42' | null } */
export function valorDaProposta(p) {
  const moeda = moedaDaProposta(p);
  const valor = Number(p && p.valor_total) || 0;
  if (moeda === 'BRL') return { principal: formatar(valor, 'BRL'), emReais: null };
  const taxa = Number(p && p.taxa_cambio);
  return { principal: formatar(valor, moeda), emReais: taxa > 0 ? `≈ ${formatar(valor * taxa, 'BRL')}` : null };
}

/** Texto da cotação para o cadastro: "R$ 5,8573 por US$". */
export function rotuloDaCotacao(moeda, valor) {
  const simbolo = moeda === 'EUR' ? '€' : 'US$';
  const n = Number(valor);
  return n > 0 ? `R$ ${n.toLocaleString('pt-BR', { minimumFractionDigits: 4, maximumFractionDigits: 4 })} por ${simbolo}` : '';
}
