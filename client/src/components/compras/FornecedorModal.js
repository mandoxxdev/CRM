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

  useEffect(() => {
    if (!aberto) return undefined;
    const aoTeclar = (e) => {
      if (e.key !== 'Escape') return;
      const alvo = e.target;
      const semFoco = !alvo || alvo === window || alvo === document || alvo === document.body
        || alvo === document.documentElement;
      if (semFoco || (janelaRef.current && janelaRef.current.contains(alvo))) onFecharRef.current();
    };
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
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
