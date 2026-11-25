/**
 * Aviso do painel sobre as propostas em dólar ou euro (25/11/2026: "lá no painel também não está ficando certo, fica aparecendo
 * em real"). O painel soma tudo em reais — dólar e real não se somam —, pela cotação gravada em cada proposta. O aviso diz quanto
 * veio em outra moeda e por quanto entrou, e aponta a proposta sem cotação (essa entra 1 para 1 até alguém preencher a cotação).
 *
 * Entrada: `stats.propostasEmOutraMoeda` do /api/dashboard — [{ moeda, propostas, valor, em_reais, sem_cotacao }].
 */
const fmt = (valor, moeda) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: moeda }).format(Number(valor) || 0);

export function avisosDeOutraMoeda(lista) {
  return (Array.isArray(lista) ? lista : [])
    .filter((o) => o && ['USD', 'EUR'].includes(o.moeda) && Number(o.propostas) > 0)
    .map((o) => {
      const n = Number(o.propostas);
      const qtd = `${n} proposta${n > 1 ? 's' : ''}`;
      const sem = Number(o.sem_cotacao) || 0;
      const base = `${qtd} em ${o.moeda === 'USD' ? 'dólar' : 'euro'}: ${fmt(o.valor, o.moeda)}, somados como ${fmt(o.em_reais, 'BRL')} pela cotação de cada uma`;
      return sem > 0
        ? `${base}. ${sem} sem cotação entra${sem > 1 ? 'm' : ''} 1 para 1 — preencha a cotação na proposta.`
        : `${base}.`;
    });
}
