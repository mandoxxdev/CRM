/**
 * Etapa 160 (RN-160.06) — a busca que as telas fazem no navegador, sobre a lista que já carregaram.
 *
 * O termo e cada valor passam pela mesma forma: texto (nulo e não texto viram ''; número vira o texto dele), composto (NFC — o "ção"
 * colado de um PDF vem decomposto), aparado e em minúsculas pelo JavaScript (que baixa a letra acentuada: "SÃO" → "são"). O acento
 * conta, como nas buscas do servidor ("sao" não acha "SÃO" — B1013).
 */

/** A forma comparável de um termo ou de um valor. */
export function normalizarBusca(x) {
  if (x === null || x === undefined) return '';
  if (typeof x !== 'string' && typeof x !== 'number') return '';
  return String(x).normalize('NFC').trim().toLowerCase();
}

/** true se o termo está vazio (só espaços, nulo, não texto) ou se algum dos valores o contém. */
export function casaBusca(termo, ...valores) {
  const t = normalizarBusca(termo);
  if (!t) return true;
  return valores.some((v) => normalizarBusca(v).includes(t));
}
