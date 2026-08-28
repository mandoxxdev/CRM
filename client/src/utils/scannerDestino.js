/**
 * Decide o destino de navegacao a partir do texto lido de um QR (RN-01, contrato C3).
 *
 * So devolve caminho relativo (path + query) quando o texto e uma URL http/https cujo
 * pathname comeca com /almoxarifado — QUALQUER host serve, porque o identificador util
 * esta no path (etiqueta impressa em outro ambiente continua util). Qualquer outra
 * coisa devolve null: a tela mostra o conteudo lido e NUNCA navega.
 *
 * Atencao (achado da revisao do plano): new URL('javascript:alert(1)') parseia SEM
 * lancar — o parse NAO filtra protocolo. O filtro explicito de http:/https: abaixo e
 * obrigatorio; o teste com javascript: e o controle disso.
 */
const PROTOCOLOS_PERMITIDOS = ['http:', 'https:'];

export function parseQrDestino(texto) {
  if (typeof texto !== 'string' || !texto.trim()) return null;
  let url;
  try {
    url = new URL(texto.trim());
  } catch (e) {
    return null; // nao e URL absoluta — texto solto, codigo interno etc.
  }
  if (!PROTOCOLOS_PERMITIDOS.includes(url.protocol)) return null;
  // Prefixo com barra obrigatoria: startsWith('/almoxarifado') sozinho deixava
  // /almoxarifado-admin e /almoxarifadoX passarem para fora do modulo (tela branca,
  // pois o App nao tem rota catch-all na raiz) — achado Important da revisao da etapa.
  const { pathname } = url;
  if (pathname !== '/almoxarifado' && !pathname.startsWith('/almoxarifado/')) return null;
  return pathname + url.search;
}
