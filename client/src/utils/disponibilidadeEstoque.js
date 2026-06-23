export const DISPONIBILIDADE_LABELS = {
  em_estoque: 'Em estoque',
  parcial: 'Parcial',
  sem_estoque: 'Sem estoque',
};

export function labelDisponibilidade(disponibilidade) {
  return DISPONIBILIDADE_LABELS[disponibilidade] || disponibilidade || '—';
}

export function styleDisponibilidade(disponibilidade) {
  if (disponibilidade === 'em_estoque') {
    return { color: '#047857', background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)' };
  }
  if (disponibilidade === 'parcial') {
    return { color: '#b45309', background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)' };
  }
  return { color: '#b91c1c', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)' };
}

export function DisponibilidadeBadge({ disponibilidade, style = {} }) {
  const s = styleDisponibilidade(disponibilidade);
  return (
    <span
      style={{
        display: 'inline-block',
        fontSize: '0.7rem',
        fontWeight: 600,
        padding: '2px 8px',
        borderRadius: 12,
        ...s,
        ...style,
      }}
    >
      {labelDisponibilidade(disponibilidade)}
    </span>
  );
}
