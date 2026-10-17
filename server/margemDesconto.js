/**
 * Etapa 139 (RN-139.04, C299) — a régua da margem de desconto da proposta, uma só para todas as portas que a gravam
 * (POST e PUT de proposta, geração automática, solicitação de aprovação).
 *
 * Antes cada porta gravava o que viesse: "10,5" e "10abc" não são > 5 para o JavaScript, então passavam pela regra do
 * desconto acima de 5% sem aprovação e iam para o banco como texto; -1 e 101 também passavam. A tela manda sempre
 * número de 0 a 100 (<input type="number" min="0" max="100">).
 *
 *   null, '' ou só espaços                     -> { ok: true, valor: 0 }  (como sempre: o vazio é sem desconto)
 *   número finito de 0 a 100                   -> { ok: true, valor }
 *   texto com número com ponto (" 10.5 ")      -> { ok: true, valor: 10.5 }, se de 0 a 100
 *   o resto ("10,5", "10abc", "1e2", ".5", -1, 101, true, false, [], {}, NaN, Infinity) -> { ok: false }
 *
 * Vírgula NÃO é convertida de propósito (B, Etapa 139): adivinhar o formato de quem integra pela API é pior que recusar
 * com a mensagem que diz o formato. Reversível.
 */
const MSG_MARGEM_INVALIDA = 'Margem de desconto inválida: informe um número de 0 a 100, com ponto como separador decimal.';

function lerMargemDesconto(v) {
  if (v === null || v === undefined) return { ok: true, valor: 0 };
  let n;
  if (typeof v === 'number') {
    n = v;
  } else if (typeof v === 'string') {
    if (v.trim() === '') return { ok: true, valor: 0 };
    if (!/^\s*\d+(\.\d+)?\s*$/.test(v)) return { ok: false };
    n = Number(v);
  } else {
    return { ok: false };
  }
  if (!Number.isFinite(n) || n < 0 || n > 100) return { ok: false };
  return { ok: true, valor: n === 0 ? 0 : n }; // -0 vira 0
}

module.exports = { lerMargemDesconto, MSG_MARGEM_INVALIDA };
