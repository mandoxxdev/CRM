/**
 * Regra crítica de saída (spec 13.3): vínculo obrigatório por tipo de movimento.
 * vinculo:
 *   'os_ou_projeto'  → exige os_id || projeto_id
 *   'qualquer'       → exige os_id || projeto_id || centro_custo_id || justificativa || referencia
 *                      (referencia é aceita aqui por compat v1 — ver avaliarRegrasVinculo abaixo)
 *   'nenhum'         → sem exigência de vínculo
 * justificativa: true → exige justificativa (independente de vínculo)
 * Emergencial (emergencial=true + justificativa) bypassa o vínculo e marca regularizacao_pendente.
 */
const REGRAS_VINCULO = {
  SAIDA_PRODUCAO: { vinculo: 'os_ou_projeto' },
  SAIDA_MONTAGEM: { vinculo: 'os_ou_projeto' },
  SAIDA_ASSISTENCIA: { vinculo: 'os_ou_projeto' },
  SAIDA: { vinculo: 'qualquer' },
  AJUSTE: { vinculo: 'nenhum', justificativa: true },
  AJUSTE_POSITIVO: { vinculo: 'nenhum', justificativa: true },
  AJUSTE_NEGATIVO: { vinculo: 'nenhum', justificativa: true },
  SUCATA: { vinculo: 'nenhum', justificativa: true },
  PERDA: { vinculo: 'nenhum', justificativa: true },

  // Etapa 5: tirar material do disponivel sem dizer por que e estorno sem motivo. Vale para o
  // bloqueio avulso, o desbloqueio e a reprovacao de inspecao.
  BLOQUEIO: { vinculo: 'nenhum', justificativa: true },
  DESBLOQUEIO: { vinculo: 'nenhum', justificativa: true },
  REPROVACAO_INSPECAO: { vinculo: 'nenhum', justificativa: true },
  DECISAO_INSPECAO: { vinculo: 'nenhum', justificativa: true },

  // Etapa 7 (decisao 5 do design): TRANSFERENCIA passa a estar DECLARADA aqui com 'nenhum'. Nao
  // exige nada — mas a ausencia deixa de ser omissao e vira decisao escrita. Exigir
  // justificativa em toda transferencia foi descartado: mover material de prateleira e rotina, e
  // operador obrigado a justificar rotina escreve "ok". Exigir so quando muda de almoxarifado
  // foi descartado por ser mais regra para explicar e testar do que valor entregue — a tela tem
  // campo de motivo OPCIONAL, que vai para o livro.
  TRANSFERENCIA: { vinculo: 'nenhum' },

  // Etapa 8, decisao 9: DEVOLUCAO_CLIENTE e isenta de vinculo com OS/projeto — o destino da
  // devolucao E o proprio proprietario, entao exigir OS do dono para devolver ao dono nao faz
  // sentido. A guarda do dono (ownerRules.TIPOS_ISENTOS_DONO) tambem a isenta, pelo mesmo motivo.
  // O que substitui o vinculo como controle e o documento de devolucao, obrigatorio na rota
  // dedicada (DevolucaoClienteSchema).
  //
  // Como TRANSFERENCIA acima: declarar com 'nenhum' nao muda comportamento (avaliarRegrasVinculo
  // ja devolve ok para tipo ausente do mapa) — muda a LEITURA, porque a ausencia deixa de poder
  // ser lida como esquecimento.
  //
  // NAO CONFUNDIR com a devolucao da Etapa 7 (ENTRADA_DEVOLUCAO), onde o material VOLTA para o
  // estoque. Aqui ele SAI do predio.
  DEVOLUCAO_CLIENTE: { vinculo: 'nenhum' },

  // Etapa 8b: os quatro exigem justificativa e nenhum exige vinculo com OS/projeto.
  // Justificativa porque cada um deles muda a resposta a pergunta "onde esta esse material?" e a
  // resposta tem de estar escrita: REMESSA_TERCEIRO tira do disponivel, RETORNO_TERCEIRO devolve,
  // e os dois de baixa apagam material do patrimonio.
  // Vinculo 'nenhum' porque o vinculo da remessa mora no DOCUMENTO (fornecedor, prazo, OS/projeto
  // e proprietario ficam em remessas_terceiro_almoxarifado) — exigi-lo de novo na movimentacao
  // duplicaria a regra em dois lugares que divergiriam na primeira mudanca.
  REMESSA_TERCEIRO: { vinculo: 'nenhum', justificativa: true },
  RETORNO_TERCEIRO: { vinculo: 'nenhum', justificativa: true },
  PERDA_TERCEIRO: { vinculo: 'nenhum', justificativa: true },
  CONSUMO_TERCEIRO: { vinculo: 'nenhum', justificativa: true },

  // Etapa 8c: mesma forma dos quatro da 8b, e pela mesma razao. Justificativa porque o tipo muda a
  // resposta a pergunta "de onde veio esse material?" e a resposta tem de estar escrita — no
  // extrato da peca, sem ela, ela teria aparecido do nada. Vinculo 'nenhum' porque o vinculo mora
  // no DOCUMENTO da remessa (fornecedor, prazo, OS/projeto e proprietario ficam em
  // remessas_terceiro_almoxarifado); exigi-lo de novo aqui duplicaria a regra em dois lugares que
  // divergiriam na primeira mudanca.
  RETORNO_TRANSFORMACAO: { vinculo: 'nenhum', justificativa: true },

  // Etapa 9, Task 2: mesma forma e mesma razao de RETORNO_TRANSFORMACAO acima. Justificativa
  // porque o tipo muda a resposta a pergunta "de onde veio esse retalho?" e a resposta tem de
  // estar escrita — sem ela o retalho apareceria no extrato do mesmo jeito que uma peca do nada.
  // Vinculo 'nenhum' porque o vinculo (chapa de origem, requisicao/OS onde a sobra ficou) mora na
  // LINHA DA SOBRA (sobras_almoxarifado, Etapa 9 Task 1), nao na movimentacao — exigi-lo de novo
  // aqui duplicaria a regra em dois lugares que divergiriam na primeira mudanca.
  ENTRADA_RETALHO: { vinculo: 'nenhum', justificativa: true },
};

function avaliarRegrasVinculo(tipo, params) {
  const regra = REGRAS_VINCULO[tipo];
  if (!regra) return { ok: true };
  const { os_id, projeto_id, centro_custo_id, justificativa, referencia, emergencial } = params;
  const just = justificativa || null;

  if (regra.justificativa && !just) {
    return { ok: false, erro: `${tipo} exige justificativa` };
  }
  if (emergencial) {
    if (!just) return { ok: false, erro: 'Movimentação emergencial exige justificativa' };
    return { ok: true, pendente: true };
  }
  if (regra.vinculo === 'os_ou_projeto' && !os_id && !projeto_id) {
    return { ok: false, erro: `${tipo} exige vínculo com OS ou projeto (ou use emergencial com justificativa)` };
  }
  if (regra.vinculo === 'qualquer' && !os_id && !projeto_id && !centro_custo_id && !just && !referencia) {
    return { ok: false, erro: 'Saída exige OS, projeto, centro de custo ou justificativa' };
  }
  return { ok: true };
}

module.exports = { REGRAS_VINCULO, avaliarRegrasVinculo };
