import { serializarAcessorios } from '../../utils/acessoriosItem';

/**
 * O corpo que o formulário de proposta manda no salvar (criar e editar) — extraído do handleSubmit do PropostaForm.
 *
 * Desde a Etapa 138 o servidor trata a chave AUSENTE como "mantém o que está gravado" e a PRESENTE (inclusive null/'') como "grava":
 * por isso os campos que o formulário apaga mandam `null`, nunca `undefined` (que o JSON omite). Antes, *Tipo* "—", *Fechamento* vazio,
 * oportunidade e expiração vazias iam como `undefined` — com o servidor novo, apagar o tipo deixaria de apagar.
 * O responsável vazio continua ausente: o servidor mantém o gravado (ou usa quem salva) — o formulário não o apaga.
 */
export function montarPayloadProposta({ form, itens, statusSalvar, valorTotal, maxDesc, exigeMotivo }) {
  return {
    ...form,
    status: statusSalvar,
    cliente_id: Number(form.cliente_id),
    responsavel_id: form.responsavel_id ? Number(form.responsavel_id) : undefined,
    valor_total: valorTotal,
    margem_desconto: maxDesc,
    probabilidade: Number(form.probabilidade) || 0,
    oportunidade_id: form.oportunidade_id ? Number(form.oportunidade_id) : null,
    tipo_proposta: form.tipo_proposta || null,
    expira_em: form.expira_em || null,
    data_fechamento: form.data_fechamento || null,
    motivo_nao_venda: exigeMotivo ? form.motivo_nao_venda : null,
    origem_busca: form.origem_busca || null,
    familia_produto: form.familia_produto || null,
    lembrete_data: form.lembrete_data || null,
    lembrete_mensagem: form.lembrete_mensagem || null,
    itens: itens.map((i) => ({
      descricao: i.descricao,
      quantidade: i.quantidade,
      unidade: i.unidade,
      valor_unitario: i.valor_unitario,
      valor_total: i.valor_total,
      codigo_produto: i.codigo_produto?.trim() || null,
      familia_produto: i.familia_produto || null,
      regiao_busca: i.regiao_busca || null,
      desconto_percentual: 0,
      preco_tabela: i.preco_tabela != null ? Number(i.preco_tabela) : null,
      // Normaliza na saída: descarta linha sem descrição (o vendedor clicou em adicionar
      // e desistiu) e converte os campos numéricos, que enquanto se digita são texto.
      // Vai SEMPRE, inclusive '[]' — mandar vazio faria a mesclagem do servidor
      // "restaurar" acessórios que ele acabou de apagar.
      acessorios: serializarAcessorios(i.acessorios)
    }))
  };
}
