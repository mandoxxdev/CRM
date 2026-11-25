/**
 * Período do Dashboard (25/11/2026: "esses filtros devem ser todos anuais, pq agora estamos no fim de 2026, deve resetar em 2027").
 *
 * O painel abre no ANO CORRENTE (1º de janeiro a 31 de dezembro): virou o ano, passa a mostrar o ano novo sozinho, sem ninguém mexer.
 * "Todo o período" (sem datas) continua existindo como atalho. As datas vão ao servidor como YYYY-MM-DD (dia de Brasília; o servidor
 * compara com o dia local do created_at da proposta — filtroDashboardSql).
 */
import { hojeLocalISO } from '../utils/dataLocal';

export function periodoDoAno(ano = new Date().getFullYear()) {
  return { inicio: `${ano}-01-01`, fim: `${ano}-12-31` };
}

/** O período é o padrão (o ano corrente inteiro)? — aí não conta como filtro aplicado. */
export function ehPeriodoPadrao(filtros, hoje = new Date()) {
  const p = periodoDoAno(hoje.getFullYear());
  return Boolean(filtros) && filtros.inicio === p.inicio && filtros.fim === p.fim;
}

const br = (iso) => (/^\d{4}-\d{2}-\d{2}$/.test(iso || '') ? iso.split('-').reverse().join('/') : '');

/** O que a tela mostra: "Ano 2026", "Todo o período", "01/03/2026 a 30/06/2026", "A partir de 01/03/2026", "Até 30/06/2026". */
export function rotuloDoPeriodo(filtros) {
  const { inicio = '', fim = '' } = filtros || {};
  if (!inicio && !fim) return 'Todo o período';
  const m = /^(\d{4})-01-01$/.exec(inicio);
  if (m && fim === `${m[1]}-12-31`) return `Ano ${m[1]}`;
  if (inicio && fim) return `${br(inicio)} a ${br(fim)}`;
  return inicio ? `A partir de ${br(inicio)}` : `Até ${br(fim)}`;
}

/** Só vai o que estiver preenchido (o servidor descarta o resto). */
export function paramsDoPeriodo(filtros) {
  const params = {};
  if (filtros && filtros.inicio) params.inicio = filtros.inicio;
  if (filtros && filtros.fim) params.fim = filtros.fim;
  if (filtros && filtros.usuario) params.usuario = filtros.usuario;
  return params;
}

/** Atalhos do painel de filtros. Devolvem sempre o PAR inteiro (início e fim). */
export function atalhosDoPeriodo(hoje = new Date()) {
  const ano = hoje.getFullYear();
  const dia = (d) => hojeLocalISO(d);
  return [
    { rotulo: 'Este mês', intervalo: () => ({ inicio: dia(new Date(ano, hoje.getMonth(), 1)), fim: dia(hoje) }) },
    { rotulo: 'Últimos 3 meses', intervalo: () => ({ inicio: dia(new Date(ano, hoje.getMonth() - 2, 1)), fim: dia(hoje) }) },
    { rotulo: `Ano ${ano}`, intervalo: () => periodoDoAno(ano) },
    { rotulo: `Ano ${ano - 1}`, intervalo: () => periodoDoAno(ano - 1) },
    { rotulo: 'Todo o período', intervalo: () => ({ inicio: '', fim: '' }) },
  ];
}
