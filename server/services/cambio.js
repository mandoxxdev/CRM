/**
 * Cotação da moeda da proposta (25/11/2026: "essa proposta eu coloquei em dólar e aqui está em real, e no dash subiu em real, tem que ter
 * um fator de conversão de moeda").
 *
 * Fonte: PTAX do Banco Central (olinda.bcb.gov.br) — oficial, gratuita, sem chave. Usa a de VENDA do boletim de fechamento mais recente
 * dos últimos 10 dias (fim de semana e feriado não têm boletim). Guarda por 1 hora em memória. `CAMBIO_PTAX_URL` troca a base (testes).
 *
 * Cada proposta em USD/EUR guarda a SUA cotação (`propostas.taxa_cambio`, reais por 1 unidade da moeda): a do dia em que foi salva, ou a
 * que o vendedor digitou. O painel converte por ela — mudar a cotação do dia não muda o valor de uma proposta antiga.
 */
const MOEDAS_ESTRANGEIRAS = ['USD', 'EUR'];
const BASE_PADRAO = 'https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata';
const cache = new Map(); // moeda -> { valor, data, ate }

const mmddaaaa = (d) => `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}-${d.getFullYear()}`;

/** { valor, data } da PTAX de venda mais recente; null se a moeda não é estrangeira ou o Banco Central não respondeu. */
async function cotacaoDoDia(moeda, { fetchImpl = globalThis.fetch, agora = new Date(), base = process.env.CAMBIO_PTAX_URL || BASE_PADRAO } = {}) {
  const m = String(moeda || '').toUpperCase();
  if (!MOEDAS_ESTRANGEIRAS.includes(m)) return null;
  const c = cache.get(m);
  if (c && c.ate > agora.getTime()) return { valor: c.valor, data: c.data };
  const inicio = new Date(agora.getTime() - 10 * 864e5);
  const url = `${base}/CotacaoMoedaPeriodo(moeda=@moeda,dataInicial=@dataInicial,dataFinalCotacao=@dataFinalCotacao)`
    + `?@moeda=%27${m}%27&@dataInicial=%27${mmddaaaa(inicio)}%27&@dataFinalCotacao=%27${mmddaaaa(agora)}%27`
    + '&%24format=json&%24orderby=dataHoraCotacao%20desc&%24top=20';
  try {
    const r = await fetchImpl(url, { signal: AbortSignal.timeout(8000) });
    if (!r.ok) return null;
    const lista = ((await r.json()) || {}).value || [];
    const escolhida = lista.find((x) => x.tipoBoletim === 'Fechamento') || lista[0];
    const valor = escolhida && Number(escolhida.cotacaoVenda);
    if (!(valor > 0)) return null;
    const res = { valor, data: String(escolhida.dataHoraCotacao || '').slice(0, 10) };
    cache.set(m, { ...res, ate: agora.getTime() + 3600e3 });
    return res;
  } catch (e) {
    return null;
  }
}

/** A cotação digitada: número positivo e plausível (aceita vírgula). null se não for. */
function taxaValida(v) {
  if (v === null || v === undefined || v === '') return null;
  const s = String(v).trim();
  const n = Number(s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s); // "5,8573" e "5.8573"
  return n > 0 && n < 1000 ? n : null;
}

/** SQL do valor em REAIS de uma proposta: valor_total x a cotação dela (BRL e sem moeda = 1; estrangeira sem cotação = 1, avisado). */
function valorEmReaisSql(alias) {
  const p = alias ? `${alias}.` : '';
  return `(COALESCE(${p}valor_total, 0) * (CASE WHEN UPPER(COALESCE(${p}moeda, 'BRL')) IN ('', 'BRL') THEN 1 ELSE COALESCE(${p}taxa_cambio, 1) END))`;
}

module.exports = { MOEDAS_ESTRANGEIRAS, cotacaoDoDia, taxaValida, valorEmReaisSql, _cache: cache };
