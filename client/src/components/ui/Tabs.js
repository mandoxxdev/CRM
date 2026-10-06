import React, { useRef } from 'react';
import './Tabs.css';

/**
 * Barra de abas reutilizavel (Etapa 36, RN-36.09).
 *
 * Contrato (congelado no plano da etapa):
 *   abas: [{ id, label, icon? }]  — `icon` e um componente (react-icons), opcional
 *   ativa: id da aba selecionada  — o componente e CONTROLADO; quem guarda o estado e o pai
 *   onChange(id)                  — chamado no clique e nas setas; o pai decide o que fazer
 *   ariaLabel                     — rotulo do tablist (ha dois niveis na mesma tela)
 *   tamanho: 'md' | 'sm'          — 'sm' e o segundo nivel (abas internas de um modulo)
 *
 * Acessibilidade: `role="tablist"`/`role="tab"`, `aria-selected` so na ativa, `aria-controls`
 * SO quando o pai passa `painelId` (o id do unico painel que troca de conteudo — e o padrao
 * desta base: um `role="tabpanel"` por tela, nao um por aba). Sem `painelId` nenhum
 * `aria-controls` e emitido: a revisao da Etapa 36 achou 12 `aria-controls` apontando para ids
 * que nao existiam no DOM, e o leitor de tela anunciava relacao com elemento inexistente.
 * Roving tabindex (so a ativa entra no Tab do teclado) e setas ← → com volta circular, Home/End.
 * Cada aba tem `id="ui-tab-<id>"` — e o alvo do `aria-labelledby` do painel.
 *
 * Nomes de classe: `.ui-tabs`, `.ui-tab`, `.ui-tab-ativa`, `.ui-tabs-sm`. NENHUM pode conter
 * 'header', 'toolbar', 'barra', 'actions' etc. — `mobile-app.css:231-238` forca `flex-wrap:
 * wrap` nesses fragmentos e a barra deixaria de rolar no celular.
 */
const Tabs = ({ abas = [], ativa, onChange, ariaLabel, tamanho = 'md', painelId }) => {
  const listaRef = useRef(null);

  const irPara = (indice) => {
    if (!abas.length) return;
    const alvo = abas[((indice % abas.length) + abas.length) % abas.length];
    if (!alvo) return;
    onChange?.(alvo.id);
    // Move o foco junto com a selecao (o roving tabindex so e aplicado no proximo render).
    const botao = listaRef.current?.querySelector(`[data-id="${alvo.id}"]`);
    botao?.focus?.();
  };

  const onKeyDown = (e, indice) => {
    switch (e.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        e.preventDefault();
        irPara(indice + 1);
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        e.preventDefault();
        irPara(indice - 1);
        break;
      case 'Home':
        e.preventDefault();
        irPara(0);
        break;
      case 'End':
        e.preventDefault();
        irPara(abas.length - 1);
        break;
      default:
        break;
    }
  };

  return (
    <div
      ref={listaRef}
      className={`ui-tabs${tamanho === 'sm' ? ' ui-tabs-sm' : ''}`}
      role="tablist"
      aria-label={ariaLabel}
    >
      {abas.map((aba, indice) => {
        const selecionada = aba.id === ativa;
        const Icone = aba.icon;
        return (
          <button
            key={aba.id}
            type="button"
            role="tab"
            id={`ui-tab-${aba.id}`}
            data-id={aba.id}
            aria-selected={selecionada ? 'true' : 'false'}
            aria-controls={painelId || undefined}
            tabIndex={selecionada ? 0 : -1}
            className={`ui-tab${selecionada ? ' ui-tab-ativa' : ''}`}
            onClick={() => onChange?.(aba.id)}
            onKeyDown={(e) => onKeyDown(e, indice)}
          >
            {Icone ? <Icone aria-hidden="true" /> : null}
            <span className="ui-tab-rotulo">{aba.label}</span>
          </button>
        );
      })}
    </div>
  );
};

export default Tabs;
