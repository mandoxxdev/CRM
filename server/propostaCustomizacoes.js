// Resolve os campos de customização de contato de uma proposta preservando os
// campos NÃO enviados no payload. O frontend (PropostaPreviewEditavel) manda um
// payload PARCIAL — apenas os campos que o usuário editou. Sem preservação, o
// UPDATE zerava os demais (ex.: editar só o nome apagava o e-mail).
//
// Regra por campo:
//   - presente no payload com valor  -> usa o valor
//   - presente no payload vazio ('')  -> null (usuário limpou o campo)
//   - ausente no payload              -> preserva o valor anterior
const CAMPOS_CUSTOMIZACAO = ['cliente_nome', 'cliente_email', 'cliente_telefone', 'cliente_contato'];

function resolverCamposCustomizacao(reqBody, anterior) {
  const prev = anterior || {};
  const body = reqBody || {};
  const out = {};
  for (const campo of CAMPOS_CUSTOMIZACAO) {
    out[campo] = (campo in body) ? (body[campo] || null) : (prev[campo] ?? null);
  }
  return out;
}

module.exports = { resolverCamposCustomizacao, CAMPOS_CUSTOMIZACAO };
