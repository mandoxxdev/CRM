/**
 * Máscara de telefone brasileiro.
 *
 * `mascararTelefoneDigitando` é PROGRESSIVA: roda a cada tecla, então precisa produzir algo
 * coerente com o número ainda incompleto — "(11", "(11) 9888", "(11) 98888-7777". Uma máscara
 * que só aceita o formato completo travaria a digitação.
 *
 * O nono dígito só entra na conta quando existe: até 10 dígitos o corte é (XX) XXXX-XXXX e a
 * partir do 11º vira (XX) XXXXX-XXXX. Por isso o formato muda sozinho quando o usuário digita
 * o último dígito de um celular.
 */

/** Máscara aplicada a cada tecla, tolerante a número incompleto. */
export function mascararTelefoneDigitando(valor) {
  const d = String(valor ?? '').replace(/\D/g, '').slice(0, 11);
  if (!d) return '';
  if (d.length <= 2) return `(${d}`;
  // Celular ou fixo é decidido pelo PRIMEIRO dígito depois do DDD, não pelo total digitado.
  // Todo celular brasileiro começa com 9 desde que o nono dígito virou obrigatório (2016).
  // Sem essa checagem o corte vinha do total, e o hífen pulava de lugar no meio da digitação:
  // "(11) 9888-8777" virava "(11) 98888-7777" só ao teclar o 11º dígito.
  const ehCelular = d[2] === '9';
  const corte = ehCelular ? 7 : 6;
  if (d.length <= corte) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, corte)}-${d.slice(corte)}`;
}

/**
 * Máscara de um valor JÁ COMPLETO (vindo do banco ou de uma consulta de CNPJ).
 * Diferente da versão progressiva em dois pontos, ambos deliberados:
 *  - quantidade de dígitos desconhecida devolve o valor ORIGINAL, em vez de truncar. O cadastro
 *    aceitou texto livre por anos e tem ramal, número estrangeiro e registro incompleto;
 *    mascarar na marra inventaria um número que não existe.
 *  - entende +55 e o descarta antes de formatar.
 * Espelha o formatarTelefone de server/templates/propostaPremiumV2.js, que é quem imprime o
 * telefone na proposta — as duas pontas precisam concordar sobre o que é um número válido.
 */
export function mascararTelefoneCompleto(valor) {
  const bruto = String(valor ?? '').trim();
  if (!bruto) return '';
  let d = bruto.replace(/\D/g, '');
  // Internacional explícito que não seja +55 sai como veio: "+1 415 555 2671" tem 11 dígitos e
  // casaria com a regra de celular, virando "(14) 15555-2671" — um número brasileiro inexistente.
  if (bruto.startsWith('+') && !d.startsWith('55')) return bruto;
  if (d.length === 13 && d.startsWith('55')) d = d.slice(2);
  if (d.length === 12 && d.startsWith('55')) d = d.slice(2);
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  if (d.length === 9) return `${d.slice(0, 5)}-${d.slice(5)}`;
  if (d.length === 8) return `${d.slice(0, 4)}-${d.slice(4)}`;
  return bruto;
}
