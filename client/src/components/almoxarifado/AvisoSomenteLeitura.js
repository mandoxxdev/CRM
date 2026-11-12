import React from 'react';
import { FiShield } from 'react-icons/fi';

/**
 * Etapa 126 (C261): a faixa de "somente leitura" das abas de Configuracoes. Etapa 211: saiu de `ConfiguracoesAlmoxarifado.js` para
 * servir tambem `FamiliasDeMaterial` (Compras e Almoxarifado), sem import circular.
 */
const AvisoSomenteLeitura = ({ frase, className = '' }) => (
  <div className={`almox-config-somente-leitura ${className}`.trim()} style={{ fontSize: '0.85rem', marginBottom: 20, padding: '10px 14px', borderRadius: 8, background: 'rgba(79,172,254,0.08)', border: '1px solid rgba(79,172,254,0.25)' }}>
    <FiShield size={14} style={{ verticalAlign: '-2px', marginRight: 6 }} />{frase}
  </div>
);

export default AvisoSomenteLeitura;
