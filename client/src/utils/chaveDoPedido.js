/**
 * Etapa 156 (RN-156.01, C369) — a chave com que a camada de comunicacao (`services/api.js`, o ramo do 503) reconhece "o mesmo pedido".
 *
 * Leitura (GET/HEAD): metodo + endereco + filtros (`params`, em ordem de chave; `undefined` e `null` ficam de fora, como o axios nao os
 * manda) + `responseType`. Dois pedidos com filtros diferentes sao pedidos diferentes — antes a chave era so `metodo-url`, e o segundo
 * pedido ao mesmo endereco com outros filtros, feito enquanto o primeiro esperava o banco, era recusado na hora.
 *
 * Gravacao (POST/PUT/PATCH/DELETE): a chave de antes, `metodo-url`, de proposito (B1001) — repetir gravacao pelo 503 e outra conversa
 * (o servidor pode responder 503 depois de ter gravado parte); esta etapa nao muda nada nas gravacoes.
 */
const LEITURAS = new Set(['get', 'head']);

function paresDosParams(params) {
  if (!params) return [];
  if (typeof URLSearchParams !== 'undefined' && params instanceof URLSearchParams) {
    return Array.from(params.entries());
  }
  if (typeof params !== 'object') return [['', String(params)]];
  return Object.keys(params)
    .filter((k) => params[k] !== undefined && params[k] !== null)
    .map((k) => [k, params[k]]);
}

export function ehLeitura(config) {
  return LEITURAS.has(String((config && config.method) || 'get').toLowerCase());
}

export function chaveDoPedido(config) {
  const cfg = config || {};
  const metodo = String(cfg.method || 'get').toLowerCase();
  const url = String(cfg.url || '');
  if (!LEITURAS.has(metodo)) return `${metodo}-${url}`;
  const pares = paresDosParams(cfg.params)
    .map(([k, v]) => [String(k), typeof v === 'object' ? JSON.stringify(v) : String(v)])
    // so pela chave (o sort e estavel): a ordem dos valores repetidos de uma chave vai na URL, e `a=2&a=1` nao e `a=1&a=2` (Fase 5 r3 C4)
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  return JSON.stringify([metodo, url, pares, cfg.responseType || '']);
}
