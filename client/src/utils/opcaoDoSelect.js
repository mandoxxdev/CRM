/**
 * Etapa 160 (RN-160.08, C389) — a opção do select que casa com o valor gravado.
 *
 * O servidor grava alguns campos em maiúsculas ("COSMÉTICOS", "ALTA", "MANUTENCAO") e as opções da tela têm outra caixa ("Cosméticos",
 * "alta", "manutencao"): sem casar, o navegador mostra a primeira opção (ou "Selecione...") e quem "corrige" o campo grava errado.
 *
 * Devolve o valor da opção que casa sem diferença de maiúsculas/minúsculas e de espaço nas pontas (NFC); nenhuma casa → o gravado como
 * veio (a tela o mostra como uma opção a mais); gravado nulo, vazio ou só de espaços → ''.
 */
const forma = (x) => String(x).normalize('NFC').trim().toUpperCase();

export function opcaoQueCasa(gravado, valores) {
  if (gravado === null || gravado === undefined) return '';
  if (typeof gravado !== 'string' && typeof gravado !== 'number') return '';
  const g = forma(gravado);
  if (!g) return '';
  const achada = (valores || []).find((v) => forma(v) === g);
  return achada !== undefined ? achada : String(gravado);
}

/** true quando o valor do select não é nenhuma das opções (a tela desenha a opção a mais). */
export function precisaOpcaoAMais(valor, valores) {
  return !!valor && !(valores || []).includes(valor);
}
