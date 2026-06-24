import { format, isValid, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';

function toDate(value) {
  if (value == null || value === '') return null;
  if (value instanceof Date) return isValid(value) ? value : null;
  const str = String(value).trim();
  if (!str) return null;
  const parsed = parseISO(str);
  if (isValid(parsed)) return parsed;
  const fallback = new Date(str);
  return isValid(fallback) ? fallback : null;
}

/** Formata data sem lançar exceção em valores inválidos do banco legado. */
export function formatDateBR(value, pattern = 'dd/MM/yyyy') {
  const date = toDate(value);
  if (!date) return '—';
  try {
    return format(date, pattern, { locale: ptBR });
  } catch {
    return '—';
  }
}

export function formatDateTimeBR(value) {
  return formatDateBR(value, 'dd/MM/yyyy HH:mm');
}

export function normalizePropostasResponse(data) {
  if (Array.isArray(data)) return data.filter(Boolean);
  if (data && Array.isArray(data.propostas)) return data.propostas.filter(Boolean);
  if (data && Array.isArray(data.rows)) return data.rows.filter(Boolean);
  return [];
}

/** Proposta inativa: aceita 0 numérico ou string do SQLite/JSON. */
export function isPropostaInativa(proposta) {
  if (!proposta) return false;
  const ativo = proposta.ativo;
  return ativo === 0 || ativo === '0' || ativo === false;
}
