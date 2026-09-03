/**
 * Acessórios de um item da proposta — lado do cliente.
 *
 * ESTE ARQUIVO É UM ESPELHO DE server/acessoriosItem.js. A duplicação é forçada: o CRA não
 * importa nada de fora de client/src, então não dá para as duas pontas compartilharem o
 * mesmo módulo.
 *
 * Duplicação de lógica sempre diverge com o tempo — nesta base o nome do arquivo do PDF
 * chegou a ter cinco implementações diferentes. Por isso existe
 * server/tests/acessoriosItem.test.js, que carrega OS DOIS arquivos e exige que produzam
 * exatamente o mesmo resultado para a mesma entrada. Mexeu aqui, mexa lá — o teste reprova
 * se as duas versões se afastarem.
 *
 * O contexto do recurso está no arquivo do servidor.
 */

/** Lê os acessórios de um item e devolve SEMPRE um array normalizado. Nunca lança. */
export function lerAcessorios(item) {
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
      const quantidade = Number(a && a.quantidade);
      const valorUnitario = Number(a && a.valor_unitario);
      return {
        descricao,
        quantidade: Number.isFinite(quantidade) && quantidade > 0 ? quantidade : 1,
        valor_unitario: Number.isFinite(valorUnitario) && valorUnitario > 0 ? valorUnitario : 0,
      };
    })
    .filter((a) => a.descricao !== '');
}

/**
 * Versão para EDITAR na tela — só do cliente, não existe no servidor.
 *
 * Diferente de lerAcessorios, ela NÃO descarta linha sem descrição e NÃO converte os números:
 * enquanto o vendedor digita, a linha está vazia e os campos são texto. Usar a versão
 * normalizada aqui faria a linha recém-adicionada desaparecer antes de ele escrever nela, e
 * impediria de apagar o conteúdo de um campo numérico.
 */
export function lerAcessoriosParaEdicao(item) {
  const bruto = item && item.acessorios;
  if (Array.isArray(bruto)) return bruto;
  if (typeof bruto === 'string' && bruto.trim()) {
    try {
      const lista = JSON.parse(bruto);
      return Array.isArray(lista) ? lista : [];
    } catch (_) {
      return [];
    }
  }
  return [];
}

/** Total em R$ dos acessórios de UM item. */
export function totalAcessorios(item) {
  return lerAcessorios(item).reduce((soma, a) => soma + a.quantidade * a.valor_unitario, 0);
}

/** Total em R$ dos acessórios de uma lista de itens. */
export function totalAcessoriosDosItens(itens) {
  return (Array.isArray(itens) ? itens : []).reduce((soma, item) => soma + totalAcessorios(item), 0);
}

/** Serializa para enviar ao servidor. Devolve SEMPRE JSON, inclusive '[]'. */
export function serializarAcessorios(valor) {
  return JSON.stringify(lerAcessorios({ acessorios: valor }));
}
