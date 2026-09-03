/**
 * Máscara de moeda (BRL) para campos de digitação.
 *
 * Extraído de ProdutoForm.js, onde nasceu como função local. Virou utilitário quando o campo
 * de valor dos acessórios da proposta precisou do mesmo comportamento: nesta base já houve
 * lógica duplicada que divergiu em silêncio (o nome do arquivo do PDF chegou a ter cinco
 * implementações diferentes), então a segunda cópia vira módulo em vez de copiar-e-colar.
 *
 * COMO A DIGITAÇÃO FUNCIONA: o campo é `type="text"` e o usuário digita só dígitos, que
 * entram pela direita como centavos — teclar 8, 7, 9, 0 mostra 0,08 → 0,87 → 8,79 → 87,90.
 * É o comportamento de caixa registradora, o mesmo do resto do sistema. `type="number"` não
 * serve aqui: ele não aceita ponto de milhar e mostraria "8790" cru, que foi a reclamação.
 */

/**
 * Formata para exibição no campo: 8790 -> "8.790,00". Devolve string vazia para valor
 * ausente, para o campo poder ficar em branco com o placeholder à mostra em vez de "0,00".
 */
export function formatarMoedaBR(valor) {
  const n = Number(valor);
  if (valor === '' || valor == null || !isFinite(n)) return '';
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Converte o que foi digitado no valor a guardar: descarta tudo que não é dígito e trata o
 * resto como centavos. "R$ 8.790,00" -> "8790". Campo apagado devolve '' (e não 0), para
 * distinguir "sem valor" de "zero" — o componente decide o que fazer com cada caso.
 */
export function digitadoParaValor(texto) {
  const digitos = String(texto == null ? '' : texto).replace(/\D/g, '');
  return digitos ? String(Number(digitos) / 100) : '';
}
