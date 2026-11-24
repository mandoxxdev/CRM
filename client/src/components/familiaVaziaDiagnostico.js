/**
 * Por que a família abriu sem produtos no catálogo da proposta (pedido do Comercial, 24/11/2026: "mesmo com o projeto conceitual
 * cadastrado no meu sistema, não sobe para cá"). A tela dizia só "Nenhum produto encontrado nesta família".
 *
 * O produto liga à família pelo NOME gravado nele. Duas causas comuns, que a tela agora mostra:
 *  - o produto está INATIVO;
 *  - o produto ficou com um nome de família que não existe mais — a família foi renomeada antes de 24/11/2026, quando renomear
 *    ainda não levava os produtos junto. Ele não aparece em família nenhuma.
 */

// A mesma régua do servidor (normalizarFamiliaComparacao): sem caixa, sem acento, espaços reduzidos.
export function normalizarFamilia(s) {
  return String(s || '').trim().toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ');
}

/**
 * { inativos: n, orfaos: [{ codigo, nome, familia }] } — `inativosDaFamilia`: produtos inativos desta família; `ativos`: todos os
 * produtos ativos; `familias`: as famílias ativas (com `nome`).
 */
export function diagnosticarFamiliaVazia({ inativosDaFamilia = [], ativos = [], familias = [] }) {
  const existentes = new Set(familias.map((f) => normalizarFamilia(f.nome)));
  const orfaos = ativos
    .filter((p) => String(p.familia || '').trim() && !existentes.has(normalizarFamilia(p.familia)))
    .map((p) => ({ codigo: p.codigo || '', nome: p.nome || '', familia: String(p.familia).trim() }));
  return { inativos: inativosDaFamilia.length, orfaos };
}
