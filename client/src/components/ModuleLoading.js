import React from 'react';
import './ModuleLoading.css';

const MODULE_LABELS = {
  comercial: 'Comercial',
  compras: 'Compras',
  financeiro: 'Financeiro',
  operacional: 'Operacional',
  administrativo: 'Administrativo',
  engenharia: 'Engenharia',
  engenharia_projetos: 'Engenharia / Projetos',
  almoxarifado: 'Almoxarifado',
  admin: 'Administração',
  sistema: 'Orion',
};

const ModuleLoading = ({ module = 'sistema', compact = false, inline = false }) => {
  const label = MODULE_LABELS[module] || 'Orion';

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
