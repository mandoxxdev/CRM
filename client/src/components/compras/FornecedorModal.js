import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import FornecedorFicha from './FornecedorFicha';
import './FornecedorModal.css';

/**
 * Etapa 173 — a janela "Novo fornecedor" que o F2 (e o botão "Novo fornecedor") abre por cima do
 * pedido de compra, da cotação e do grupo homologado. É a ficha completa da Etapa 34, não um
 * cadastro resumido (RN-173.01, RN-173.08).
 *
 *  - Portal no <body>: a janela não pode ficar DENTRO do <form> do pedido (form aninhado é HTML
 *    inválido). O submit da ficha também para a propagação, porque o React a leva pela árvore de
 *    componentes mesmo através do portal (achado 1 da Fase 2).
 *  - Fecha pelo ×, por "Cancelar" e por Esc; clique no fundo NÃO fecha (RN-173.04).
 *  - O Esc só vale com o foco dentro da janela, ou sem foco em lugar nenhum: o Esc da busca global
 *    aberta por cima fecha só a busca (mesma regra de BuscaGlobal.js; achado 3 da Fase 2).
 *  - A recusa do servidor fica DENTRO da janela, e a janela fica aberta (RN-173.07) — é a ficha
 *    que mostra o `role="alert"`, e `onSalvo` só é chamado no sucesso.
 */
const FOCAVEIS = 'button, input, select, textarea, a[href], [tabindex]:not([tabindex="-1"])';

/**
 * RN-173.03 — o fornecedor recém-salvo vai para o TOPO da lista do `<select>` (o servidor ordena
 * por `created_at DESC`, então é onde ele estaria num recarregamento), sem duplicar.
 */
export function colocarNoTopo(lista, novo) {
  return [novo, ...(lista || []).filter((f) => String(f.id) !== String(novo.id))];
}

/**
 * A lista inicial do `GET /compras/fornecedores` que chega DEPOIS de um cadastro pelo F2 não pode
 * apagá-lo: o `<select>` mostraria "Selecione o fornecedor" com o id dele no estado (achado 6 da
 * Fase 2). Os que a tela já tem e o servidor não trouxe ficam no topo.
 */
export function juntarListaCarregada(atual, doServidor) {
  const lista = Array.isArray(doServidor) ? doServidor : [];
  const soLocais = (atual || []).filter((f) => !lista.some((s) => String(s.id) === String(f.id)));
  return [...soLocais, ...lista];
}

const FornecedorModal = ({ aberto, grupoIdInicial, grupoTravado = false, onSalvo, onFechar }) => {
  const janelaRef = useRef(null);
  const onFecharRef = useRef(onFechar);
  onFecharRef.current = onFechar;
  // Lido no RENDER que abre a janela, e não no efeito: o efeito da ficha (filha) roda antes do
  // desta janela e já moveu o foco para a razão social.
  const focoAnteriorRef = useRef(null);
  const estavaAbertoRef = useRef(false);
  if (aberto && !estavaAbertoRef.current) focoAnteriorRef.current = document.activeElement;
  estavaAbertoRef.current = aberto;

  useEffect(() => {
    if (!aberto) return undefined;
    // Ao fechar, o foco volta para onde estava quando o F2 foi apertado (o campo Fornecedor, em
    // geral) — senão caía no <body> e o próximo Tab recomeçava do menu (achado 3 da Fase 5).
    const focoAnterior = focoAnteriorRef.current;
    const aoTeclar = (e) => {
      const janela = janelaRef.current;
      if (e.key === 'Tab' && janela) {
        // O Tab fica DENTRO da janela (achado 2 da Fase 5): `aria-modal` não prende o foco no
        // navegador, e um Shift+Tab levava o foco ao pedido atrás do fundo escuro — um Enter ali
        // salvava o pedido com o fornecedor antigo.
        const focaveis = [...janela.querySelectorAll(FOCAVEIS)].filter((el) => !el.disabled);
        if (focaveis.length === 0) return;
        const primeiro = focaveis[0];
        const ultimo = focaveis[focaveis.length - 1];
        const dentro = janela.contains(document.activeElement);
        if (e.shiftKey && (!dentro || document.activeElement === primeiro)) {
          e.preventDefault();
          ultimo.focus();
        } else if (!e.shiftKey && (!dentro || document.activeElement === ultimo)) {
          e.preventDefault();
          primeiro.focus();
        }
        return;
      }
      if (e.key !== 'Escape') return;
      const alvo = e.target;
      const semFoco = !alvo || alvo === window || alvo === document || alvo === document.body
        || alvo === document.documentElement;
      if (semFoco || (janela && janela.contains(alvo))) onFecharRef.current();
    };
    window.addEventListener('keydown', aoTeclar);
    return () => {
      window.removeEventListener('keydown', aoTeclar);
      if (focoAnterior && focoAnterior !== document.body && document.contains(focoAnterior)
        && typeof focoAnterior.focus === 'function') {
        focoAnterior.focus();
      }
    };
  }, [aberto]);

  if (!aberto) return null;

  return createPortal(
    <div className="fornecedor-modal-overlay" data-testid="fornecedor-modal-fundo">
      <div
        ref={janelaRef}
        className="fornecedor-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="fornecedor-modal-titulo"
        data-testid="fornecedor-modal"
      >
        <div className="fornecedor-modal-topo">
          <h2 id="fornecedor-modal-titulo">Novo fornecedor</h2>
          <button type="button" className="fornecedor-modal-fechar" onClick={onFechar} aria-label="Fechar">×</button>
        </div>
        <div className="fornecedor-modal-corpo">
          <FornecedorFicha
            grupoIdInicial={grupoIdInicial}
            grupoTravado={grupoTravado}
            onSalvo={onSalvo}
            onCancelar={onFechar}
            autoFocar
          />
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default FornecedorModal;
