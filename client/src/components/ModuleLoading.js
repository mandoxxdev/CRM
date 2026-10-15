import React from 'react';
import { NOMES_MODULO } from '../constants/modulosMeta';
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
        <div className="module-loading__spinner" aria-hidden="true" />
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
          <img src="/orion-logo.png" alt="Orion" className="module-loading__logo" />
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
