/**
 * Proposta para fora do Brasil (specs/proposta-bilingue/README.md, RN-BI.01/08/09): as opções da tela e o incoterm.
 *
 * O servidor já gravava `propostas.idioma`, `moeda` e `incoterm` (POST/PUT/clonar/GET) sem nenhuma tela que os preenchesse.
 * O incoterm é UMA coluna de texto: guarda "FOB – Porto de Santos" (código + travessão + local), e a tela separa de novo.
 */

export const IDIOMAS_PROPOSTA = [
  { value: 'pt-BR', label: 'Só português' },
  { value: 'en', label: 'Português + inglês (duas colunas)' },
  { value: 'es', label: 'Português + espanhol (duas colunas)' },
];

export const MOEDAS_PROPOSTA = [
  { value: 'BRL', label: 'Real (R$)' },
  { value: 'USD', label: 'Dólar americano (US$)' },
  { value: 'EUR', label: 'Euro (€)' },
];

// Incoterms 2020.
export const INCOTERMS = ['EXW', 'FCA', 'CPT', 'CIP', 'DAP', 'DPU', 'DDP', 'FAS', 'FOB', 'CFR', 'CIF'];

const SEPARADOR = ' – ';

/**
 * "FOB – Porto de Santos" -> { codigo: 'FOB', local: 'Porto de Santos' }. Texto sem código conhecido fica todo no local.
 * O FIM do local NÃO é cortado: a tela remonta o texto a cada tecla, e cortar o espaço final impedia digitar "Porto de Santos".
 */
export function separarIncoterm(texto) {
  const bruto = String(texto || '').replace(/^\s+/, '');
  if (!bruto.trim()) return { codigo: '', local: '' };
  const m = /^([A-Za-z]{3})(?:\s*[–-]\s*|\s+|$)([\s\S]*)$/.exec(bruto);
  if (m && INCOTERMS.includes(m[1].toUpperCase())) return { codigo: m[1].toUpperCase(), local: m[2] };
  return { codigo: '', local: bruto };
}

/** { codigo, local } -> o texto gravado. Sem código e sem local = '' (o servidor grava null). */
export function montarIncoterm(codigo, local) {
  const c = String(codigo || '').trim().toUpperCase();
  const l = String(local || '').replace(/^\s+/, '');
  if (!c) return l;
  return l.trim() ? `${c}${SEPARADOR}${l}` : c;
}

/** Valor do banco para a tela: idioma/moeda fora da lista caem no padrão (proposta antiga = pt-BR em reais). */
export function idiomaDoBanco(v) {
  return IDIOMAS_PROPOSTA.some((o) => o.value === v) ? v : 'pt-BR';
}
export function moedaDoBanco(v) {
  return MOEDAS_PROPOSTA.some((o) => o.value === v) ? v : 'BRL';
}
