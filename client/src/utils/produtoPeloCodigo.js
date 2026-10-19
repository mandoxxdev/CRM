/**
 * Etapa 155 (RN-155.04, C351) — o endereco do produto pelo codigo, para as tres telas da OS (a OS do Comercial, o detalhe da OS e o preview
 * editavel). Elas montavam `/produtos/codigo/${codigo}` com o codigo cru: um codigo com `/` nao achava o produto (o caminho virava dois
 * segmentos), e um com `?` ou `#` caia em outra operacao. O servidor (GET /api/produtos/codigo/:codigo) le o parametro decodificado pelo
 * Express — uma decodificacao so, entao um `%2F` literal no codigo tambem volta ele mesmo.
 *
 * E o unico lugar do client que cita esse caminho (o teste do client confere o inventario).
 */
export function caminhoDoProdutoPeloCodigo(codigo) {
  return `/produtos/codigo/${encodeURIComponent(String(codigo))}`;
}

export default caminhoDoProdutoPeloCodigo;
