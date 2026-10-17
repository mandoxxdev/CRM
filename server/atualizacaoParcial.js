// Etapa 138 — o `SET` dos `PUT` montado só com o que veio no corpo.
//
// Antes, os `PUT` de cliente, proposta e oportunidade gravavam TODAS as colunas com o que estivesse no corpo: a chave que não veio
// virava `null` (ou `''`, ou 0). Mandar só o telefone de um cliente apagava a razão social (500 de banco), mandar a razão social apagava
// as outras 13 colunas, logo e status inclusive; salvar a proposta pela tela apagava as oito colunas que a tela não carrega.
//
// Regra, por coluna:
//   - AUSENTE no corpo (a chave não veio)  -> a coluna nem entra no comando: fica como está (e não sobrescreve gravação concorrente)
//   - PRESENTE (inclusive `null` e `''`)   -> entra, com a transformação de hoje da porta (o vazio que limpava continua limpando)
//
// Mesma régua que `resolverCamposCustomizacao` (propostaCustomizacoes.js) já usava no preview — aqui sem ler a linha antes.

function presente(corpo, chave) {
  return corpo != null && typeof corpo === 'object' && Object.prototype.hasOwnProperty.call(corpo, chave) && corpo[chave] !== undefined;
}

/**
 * @param {object} corpo  o `req.body`
 * @param {Object<string, function>} mapa  coluna -> transformação do valor presente (a ordem do mapa é a ordem do comando)
 * @returns {{ colunas: string[], params: any[], sql: string }}  `sql` = 'a = ?, b = ?' ('' se nada veio)
 */
function montarSetParcial(corpo, mapa) {
  const colunas = [];
  const params = [];
  for (const coluna of Object.keys(mapa)) {
    if (!presente(corpo, coluna)) continue;
    colunas.push(coluna);
    params.push(mapa[coluna](corpo[coluna]));
  }
  return { colunas, params, sql: colunas.map((c) => `${c} = ?`).join(', ') };
}

module.exports = { presente, montarSetParcial };
