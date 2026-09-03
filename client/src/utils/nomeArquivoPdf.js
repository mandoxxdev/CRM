/**
 * Nome do arquivo ao baixar o PDF da proposta.
 *
 * QUEM DECIDE O NOME É O SERVIDOR, em nomeArquivoPdfProposta() (server/index.js), e manda no
 * cabeçalho Content-Disposition. Aqui só lemos.
 *
 * Por que não montar aqui: o nome inclui a razão social do cliente, e as telas de proposta
 * nem sempre têm esse dado carregado — a de detalhe e a de preview trabalham com o número da
 * proposta. Além disso, o nome já era montado em cinco lugares diferentes, cada um com uma
 * sanitização própria, e o do preview já tinha divergido do servidor.
 *
 * O download é feito por blob (a resposta vem com responseType 'blob' para podermos tratar
 * erro), e nesse caminho o navegador IGNORA o Content-Disposition e usa o atributo `download`
 * do link. Daí a necessidade de ler o cabeçalho na mão.
 */

/**
 * Extrai o filename de um Content-Disposition. Devolve null quando o cabeçalho não veio —
 * o que acontece se a resposta for cross-origin sem Access-Control-Expose-Headers. Nesse
 * caso quem chamou usa o próprio fallback, em vez de baixar um arquivo sem nome.
 */
export function nomeArquivoDoCabecalho(headers) {
  if (!headers) return null;
  // Axios normaliza as chaves para minúsculas, mas nem todo adaptador faz isso.
  const bruto = headers['content-disposition'] || headers['Content-Disposition'] || '';
  if (!bruto) return null;

  // filename*=UTF-8''... tem precedência sobre filename="..." (RFC 5987) e é o que preserva
  // acento em razão social. O servidor manda a forma simples, mas ler as duas é barato.
  const estendido = /filename\*=\s*UTF-8''([^;]+)/i.exec(bruto);
  if (estendido) {
    try {
      return decodeURIComponent(estendido[1].trim());
    } catch (_) {
      /* percent-encoding inválido: cai para a forma simples abaixo */
    }
  }

  const simples = /filename\s*=\s*"([^"]*)"/i.exec(bruto) || /filename\s*=\s*([^;]+)/i.exec(bruto);
  if (!simples) return null;
  const nome = simples[1].trim();
  return nome || null;
}

/**
 * Nome de fallback, para quando o cabeçalho não estiver acessível. Mantém o formato antigo
 * (só o número), porque sem o cabeçalho a tela pode não ter a razão social para acrescentar.
 */
export function nomeArquivoPdfFallback(numeroProposta, id) {
  const limpar = (v) => String(v == null ? '' : v).replace(/[\\/:*?"<>|\r\n]+/g, '-').trim();
  const numero = limpar(numeroProposta) || limpar(id) || 'sem-numero';
  return `proposta-${numero}.pdf`;
}

/**
 * O que as telas chamam: nome do cabeçalho quando existir, senão o fallback.
 */
export function nomeArquivoPdfProposta(resposta, numeroProposta, id) {
  return nomeArquivoDoCabecalho(resposta && resposta.headers)
    || nomeArquivoPdfFallback(numeroProposta, id);
}
