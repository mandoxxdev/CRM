/**
 * Aviso do painel sobre as propostas em dólar ou euro. Os valores são digitados em REAIS em qualquer moeda (25/11/2026: "coloquei
 * 128 mil reais e na proposta aparece US$ 128.990,00"); a moeda é a do documento, que converte pela cotação de cada proposta. O
 * painel soma o valor em reais e o aviso diz quanto disso é de propostas em outra moeda e quanto dá nela — e aponta a proposta sem
 * cotação (o documento dela sai em reais até alguém preencher a cotação).
 *
 * Entrada: `stats.propostasEmOutraMoeda` do /api/dashboard — [{ moeda, propostas, valor (na moeda), em_reais, sem_cotacao }].
 */
const fmt = (valor, moeda) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: moeda }).format(Number(valor) || 0);

export function avisosDeOutraMoeda(lista) {
  return (Array.isArray(lista) ? lista : [])
    .filter((o) => o && ['USD', 'EUR'].includes(o.moeda) && Number(o.propostas) > 0)
    .map((o) => {
      const n = Number(o.propostas);
      const qtd = `${n} proposta${n > 1 ? 's' : ''}`;
      const sem = Number(o.sem_cotacao) || 0;
      const base = `${qtd} em ${o.moeda === 'USD' ? 'dólar' : 'euro'}: ${fmt(o.em_reais, 'BRL')} (${fmt(o.valor, o.moeda)} no documento, pela cotação de cada uma)`;
      return sem > 0
        ? `${base}. ${sem} sem cotação sai${sem > 1 ? 'em' : ''} em reais — preencha a cotação na proposta.`
        : `${base}.`;
    });
}
