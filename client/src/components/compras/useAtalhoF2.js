import { useEffect, useRef } from 'react';

/**
 * Etapa 173 (RN-173.01, RN-173.06) — o F2 das telas que escolhem fornecedor abre o cadastro dele.
 *
 * Escuta a janela inteira (o foco pode estar em qualquer campo do pedido) só enquanto `ativo`.
 * Não é o atalho: F2 segurado (`repeat`), F2 com Ctrl/Alt/Shift/Meta, ou F2 com outra janela
 * aberta por cima — a do próprio F2 (`aria-modal`), a busca global (Ctrl+K), a ajuda (F1), o
 * relatório e o workflow do Layout, ou um modal da própria tela. Sem esta guarda, o F2 com a busca
 * aberta abria a ficha ESCONDIDA atrás dela (a busca fica em z-index 10000).
 */
export const JANELAS_POR_CIMA = [
  '[aria-modal="true"]',
  '.busca-global-overlay', '.help-search-overlay', '.report-builder-overlay', '.workflow-engine-overlay',
  '.modal-grupo-overlay', '.modal-overlay', '.almox-modal-overlay',
].join(', ');

export function ehAtalhoF2(e) {
  if (!e || e.key !== 'F2') return false;
  if (e.repeat || e.ctrlKey || e.altKey || e.shiftKey || e.metaKey) return false;
  return true;
}

export default function useAtalhoF2(ativo, aoApertar) {
  // O callback muda a cada render do pedido; o listener não precisa ser trocado por isso.
  const aoApertarRef = useRef(aoApertar);
  aoApertarRef.current = aoApertar;

  useEffect(() => {
    if (!ativo) return undefined;
    const aoTeclar = (e) => {
      if (!ehAtalhoF2(e)) return;
      if (document.querySelector(JANELAS_POR_CIMA)) return;
      e.preventDefault();
      aoApertarRef.current();
    };
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [ativo]);
}
