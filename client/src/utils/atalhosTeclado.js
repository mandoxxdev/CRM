/**
 * Atalhos de teclado globais do sistema (registrados em components/Layout.js).
 *
 * Mantido fora do Layout para poder ser testado sem montar a arvore inteira
 * de componentes/contextos.
 */

/**
 * Traduz um evento de teclado no atalho correspondente, ou null se nao houver.
 *
 * Usa e.key.toLowerCase(): com Caps Lock ligado (ou Shift pressionado) o browser
 * entrega e.key === 'K', e a comparacao estrita com 'k' nunca casava.
 * Aceita tambem metaKey (Cmd+K no macOS).
 *
 * @param {KeyboardEvent|{ctrlKey?:boolean, metaKey?:boolean, key?:string}} e
 * @returns {'sidebar'|'busca'|'report'|'workflow'|'ajuda'|null}
 */
export function identificarAtalho(e) {
  if (!e) return null;
  const tecla = typeof e.key === 'string' ? e.key.toLowerCase() : '';
  if (tecla === 'f1') return 'ajuda';

  const modificador = e.ctrlKey || e.metaKey;
  if (!modificador) return null;

  switch (tecla) {
    case 'b': return 'sidebar';
    case 'k': return 'busca';
    case 'r': return 'report';
    case 'w': return 'workflow';
    case '/': return 'ajuda';
    default: return null;
  }
}

export default identificarAtalho;
