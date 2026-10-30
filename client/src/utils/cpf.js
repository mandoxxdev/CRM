/**
 * CPF do fornecedor pessoa física — Etapa 192 (RN-192.01/02). Mesma regra do servidor
 * (`server/routes/compras/fornecedores.js`, `cpfValido`): 11 dígitos, não todos iguais, e os dois
 * dígitos verificadores pelo módulo 11. A tela barra antes; quem decide é o servidor.
 */
import { somenteDigitos } from './cnpj';

export const CPF_INVALIDO = 'CPF inválido. Verifique os dígitos.';
export const CPF_E_CNPJ = 'Preencha o CPF ou o CNPJ, não os dois.';

/** Máscara progressiva 000.000.000-00, tolerante a valor incompleto. */
export function formatarCPF(valor) {
  const d = somenteDigitos(valor).slice(0, 11);
  return d
    .replace(/^(\d{3})(\d)/, '$1.$2')
    .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/^(\d{3})\.(\d{3})\.(\d{3})(\d)/, '$1.$2.$3-$4');
}

/** Dígitos verificadores do CPF (módulo 11). */
export function validarCPF(valor) {
  const cpf = somenteDigitos(valor);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  for (let t = 9; t < 11; t++) {
    let soma = 0;
    for (let i = 0; i < t; i++) soma += Number(cpf[i]) * (t + 1 - i);
    if (((soma * 10) % 11) % 10 !== Number(cpf[t])) return false;
  }
  return true;
}
