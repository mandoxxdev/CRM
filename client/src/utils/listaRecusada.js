// Etapa 156 (RN-156.02, C366): o motivo de uma lista auxiliar (a de clientes, a de projetos) que voltou recusada, para a tela dizer por que o
// seletor esta vazio. Antes, as quatro telas do Almoxarifado trocavam a recusa por uma lista vazia, calada: quem nao tinha o Comercial, o
// Almoxarifado ou o Operacional (o portao das listas, Etapa 154) via o seletor so com "—" e nao sabia se nao havia projeto ou se nao podia ve-los.
//
// - 403 (o portao das listas responde `{ error: 'Acesso negado ao modulo', modulo: [...] }` — o fixture
//   components/almoxarifado/__fixtures__/recusaDaListaDoServidor.json, conferido pelo teste do servidor): "Sem acesso a lista de ...", com o
//   `error` do corpo quando ha (sem o ponto final dele, para nao duplicar);
// - qualquer outra falha (o banco ocupado depois das repeticoes da camada — um Error sem `response` —, a rede, o 500): "Nao foi possivel
//   carregar a lista de ...";
// - sem erro: null (nada a dizer).

/** @param {unknown} erro o erro do pedido da lista (axios) ou null @param {string} nome 'clientes' | 'projetos' @returns {string|null} */
export function motivoDaListaRecusada(erro, nome) {
  if (!erro) return null;
  const resposta = erro && erro.response;
  if (resposta && resposta.status === 403) {
    const doServidor = resposta.data && typeof resposta.data.error === 'string' ? resposta.data.error.trim().replace(/[.\s]+$/, '') : '';
    return doServidor
      ? `Sem acesso à lista de ${nome}: ${doServidor}. Recarregue a página para conferir suas permissões.`
      : `Sem acesso à lista de ${nome}. Recarregue a página para conferir suas permissões.`;
  }
  return `Não foi possível carregar a lista de ${nome}. Recarregue a página para tentar de novo.`;
}

export default motivoDaListaRecusada;
