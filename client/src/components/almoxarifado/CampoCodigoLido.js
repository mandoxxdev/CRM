import React from 'react';

// Etapa 56 (RN-03/04): campo opcional "Confirmar endereço lido". O leitor que "digita" termina com
// Enter — sem o preventDefault, a leitura submeteria o formulário antes do operador conferir o resto.
// Etapa 58: extraído de MovimentacoesAlmoxarifado.js para a entrega de requisição usar o mesmo campo;
// `disabled` existe para a entrega, onde a leitura só faz sentido com a origem escolhida.
const CampoCodigoLido = ({ id, value, onChange, dica, disabled = false }) => (
  <div style={{ marginTop: 6 }}>
    <label className="almox-label" htmlFor={id} style={{ fontSize: '0.8rem' }}>Confirmar endereço lido</label>
    <input
      id={id}
      className="almox-input"
      type="text"
      autoComplete="off"
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault(); }}
      placeholder="Leia a etiqueta da localização (opcional)"
    />
    {dica && (disabled || value.trim()) && (
      <small style={{ color: 'var(--gmp-text-light)', fontSize: '0.75rem' }}>{dica}</small>
    )}
  </div>
);

export default CampoCodigoLido;
