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

// Etapa 165 (RN-165.07, B1058): o `'AAAA-MM-DD HH:MM:SS'` do banco (o CURRENT_TIMESTAMP, UTC sem fuso) e lido como UTC — o `parseISO` o
// lia como hora local: *Criada em*, *Enviada em* e o historico das propostas saiam 3 h adiantados (das 21h, no dia seguinte).
const RE_INSTANTE_DO_BANCO = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2}(\.\d+)?)?$/;
export function formatDateTimeBR(value) {
  if (typeof value === 'string' && RE_INSTANTE_DO_BANCO.test(value.trim())) {
    return formatDateBR(new Date(`${value.trim().replace(' ', 'T')}Z`), 'dd/MM/yyyy HH:mm');
  }
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
