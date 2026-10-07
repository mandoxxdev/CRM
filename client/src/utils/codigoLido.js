/**
 * Etapa 56 (RN-03) — o campo "Confirmar endereço lido" aceita o que o leitor entregar:
 *  - o código puro (leitor de código de barras que "digita" o código);
 *  - a URL da etiqueta de localização (`.../almoxarifado/mapa?loc=<id>&codigo=<codigo>`), de onde
 *    sai o `codigo` já decodificado (`A%26B%231%2B2` -> `A&B#1+2`).
 * Qualquer outra coisa volta como veio (sem espaços nas pontas): uma URL estragada pelo layout de
 * teclado errado do leitor (`?` e `/` trocados) não é URL válida, e o servidor recusa o texto cru
 * com a mensagem dele — a tela não adivinha. Só http(s) conta como URL: `new URL('COR:01')` é
 * "válida" (protocolo `cor:`) e um código com dois-pontos não pode virar outra coisa.
 * O servidor recebe sempre o código; a comparação (maiúsculas, espaços) é dele.
 */
export function extrairCodigoLido(texto) {
  const cru = String(texto ?? '').trim();
  if (!cru) return '';
  let url;
  try {
    url = new URL(cru);
  } catch {
    return cru;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return cru;
  const codigo = url.searchParams.get('codigo');
  return codigo && codigo.trim() ? codigo.trim() : cru;
}

export default extrairCodigoLido;
