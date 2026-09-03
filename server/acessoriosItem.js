/**
 * Acessórios de um item da proposta.
 *
 * Pedido do usuário (02/08/2026): "ao selecionar um item para fazer a proposta, deve ter
 * algum lugar para habilitar acessórios, escrever o acessório e colocar preço para ele, pq
 * as vezes tenho o mesmo item com 10mil acessórios, dai não tem como cadastrar 10mil itens".
 *
 * POR QUE JSON NUMA COLUNA, E NÃO UMA TABELA FILHA: `proposta_itens` é APAGADA e reinserida
 * inteira a cada salvamento da proposta, então o id do item troca a cada save. Uma tabela
 * filha com `item_id` perderia o vínculo — foi exatamente o que aconteceu com as variáveis
 * manuais e custou várias tentativas até virar `item_chave` + reparo na leitura. Guardando os
 * acessórios NO PRÓPRIO ITEM, eles viajam junto com a linha e a máquina de preservação já
 * existente (`mesclarItensPreservandoCampos`) cuida do resto.
 *
 * Este módulo é a fonte única do cálculo. O total dos acessórios entra no subtotal da
 * proposta em mais de um lugar (rota do PDF, preview, formulário); cada um somando por conta
 * própria é como o nome do arquivo do PDF acabou tendo cinco implementações diferentes.
 */

/**
 * Lê a coluna `acessorios` de um item e devolve SEMPRE um array normalizado.
 *
 * Aceita string JSON (como vem do banco) ou array já pronto (como vem do formulário), e
 * nunca lança: item com JSON corrompido vira item sem acessórios, em vez de derrubar a
 * geração do documento inteiro.
 */
function lerAcessorios(item) {
  const bruto = item && item.acessorios;
  if (!bruto) return [];
  let lista = bruto;
  if (typeof bruto === 'string') {
    const texto = bruto.trim();
    if (!texto) return [];
    try {
      lista = JSON.parse(texto);
    } catch (_) {
      return [];
    }
  }
  if (!Array.isArray(lista)) return [];
  return lista
    .map((a) => {
      const descricao = String((a && a.descricao) || '').trim();
      // Quantidade ausente vale 1: acessório costuma ser unitário, e obrigar o vendedor a
      // digitar 1 em cada linha seria atrito à toa.
      const quantidade = Number(a && a.quantidade);
      const valorUnitario = Number(a && a.valor_unitario);
      return {
        descricao,
        quantidade: Number.isFinite(quantidade) && quantidade > 0 ? quantidade : 1,
        valor_unitario: Number.isFinite(valorUnitario) && valorUnitario > 0 ? valorUnitario : 0,
      };
    })
    // Linha sem descrição é lixo de formulário (o vendedor clicou em adicionar e desistiu):
    // não vai para o documento nem para a conta.
    .filter((a) => a.descricao !== '');
}

/** Total em R$ dos acessórios de UM item. */
function totalAcessorios(item) {
  return lerAcessorios(item).reduce((soma, a) => soma + a.quantidade * a.valor_unitario, 0);
}

/** Total em R$ dos acessórios de uma lista de itens. */
function totalAcessoriosDosItens(itens) {
  return (Array.isArray(itens) ? itens : []).reduce((soma, item) => soma + totalAcessorios(item), 0);
}

/**
 * Serializa para gravar. Devolve SEMPRE uma string JSON — inclusive '[]' quando não há
 * acessório.
 *
 * O '[]' é importante e não é detalhe: `mesclarItensPreservandoCampos` só restaura um campo
 * preservado quando o payload manda null ou string vazia. Se aqui devolvêssemos '' para
 * lista vazia, apagar todos os acessórios de um item seria desfeito no salvamento seguinte,
 * com os acessórios reaparecendo sozinhos.
 */
function serializarAcessorios(valor) {
  return JSON.stringify(lerAcessorios({ acessorios: valor }));
}

module.exports = {
  lerAcessorios,
  totalAcessorios,
  totalAcessoriosDosItens,
  serializarAcessorios,
};
