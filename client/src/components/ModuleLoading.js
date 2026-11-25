import React from 'react';
import { NOMES_MODULO } from '../constants/modulosMeta';
import CataventoGMP from './CataventoGMP';
import './ModuleLoading.css';

// Etapa 111 (G17): o nome vem de NOMES_MODULO (constants/modulosMeta.js), o mesmo do acesso negado e do log.
// Ate a 110 havia um mapa proprio aqui, igual menos na engenharia ("Engenharia"; agora "Cálculos de Engenharia" — B62).
// `sistema` e o que nao e modulo continuam "Orion".

const ModuleLoading = ({ module = 'sistema', compact = false, inline = false }) => {
  const label = NOMES_MODULO[module] || 'Orion';

  if (inline || compact) {
    return (
      <div
        className={`module-loading module-loading--compact${inline ? ' module-loading--inline' : ''}`}
        role="status"
        aria-live="polite"
      >
        <CataventoGMP size={22} modo="girando" className="module-loading__catavento" />
        <span>Carregando {label}...</span>
      </div>
    );
  }

  return (
    <div className={`module-loading module-loading--${module}`} role="status" aria-live="polite">
      <div className="module-loading__backdrop" aria-hidden="true">
        <div className="module-loading__glow module-loading__glow--1" />
        <div className="module-loading__glow module-loading__glow--2" />
      </div>

      <div className="module-loading__panel">
        <div className="module-loading__brand">
          {/* O catavento da GMP E o indicador de espera (24/11/2026): o mesmo da tela de
              modulos — grande, da as voltas, assenta e escreve "GMP Industriais" ("fazer o
              mesmo na tela de loading"). A marca Orion continua na barra lateral e no login. */}
          <CataventoGMP size={120} modo="entrada" className="module-loading__catavento" title="Carregando" legenda="GMP" legendaDestaque="Industriais" />
        </div>

        <p className="module-loading__title">Preparando {label}</p>
        <p className="module-loading__subtitle">Sincronizando interface do módulo</p>

        <div className="module-loading__skeleton" aria-hidden="true">
          <div className="module-loading__skeleton-bar module-loading__skeleton-bar--wide" />
          <div className="module-loading__skeleton-bar" />
          <div className="module-loading__skeleton-bar module-loading__skeleton-bar--medium" />
          <div className="module-loading__skeleton-grid">
            <div className="module-loading__skeleton-card" />
            <div className="module-loading__skeleton-card" />
            <div className="module-loading__skeleton-card" />
          </div>
        </div>

        <div className="module-loading__progress" aria-hidden="true">
          <div className="module-loading__progress-track">
            <div className="module-loading__progress-fill" />
          </div>
        </div>
      </div>
    </div>
  );
};

export default ModuleLoading;
