/**
 * Maquina de estados do sucateamento (Etapa 9, decisao 9 do design).
 *
 * `TRANSICOES` e copia literal do diagrama aprovado em
 * docs/superpowers/specs/2026-08-15-almoxarifado-etapa9-retalhos-sucatas-design.md, decisao 9.
 * Padrao: objeto declarativo + validador — MESMO estilo de thirdPartyStateMachine.js,
 * requisitionStateMachine.js e de movementRules.js (REGRAS_VINCULO + avaliarRegrasVinculo). Nao
 * inventar forma nova.
 *
 * ── AS DUAS PERNAS DE APROVACAO NAO SAO ESTADOS ──────────────────────────────────────────────
 *
 * Isto e a decisao central deste arquivo, e e o que ele existe para tornar impossivel de esquecer.
 * A tentacao natural seria modelar `APROVADO_ALMOX` e `APROVADO_GESTAO` como estados intermediarios
 * — e ai a maquina precisaria de setas nas DUAS ordens (almox->gestao e gestao->almox), de um
 * estado para cada combinacao, e a pergunta "quem assinou o que" continuaria sem resposta, porque
 * status e um campo so e as pernas sao duas assinaturas com nome, id e hora.
 *
 * As pernas sao COLUNAS (`aprovador_almox_*`, `aprovador_gestao_*`). O status so vira APROVADO
 * quando a SEGUNDA assinatura chega — e quem decide isso e o `CASE` do claim em
 * scrapDisposalService.aprovar, num UPDATE unico guardado no WHERE (o padrao anti-corrida da base).
 * Consequencia pratica: enquanto uma perna so assinou, `status` continua 'SOLICITADO', e e por isso
 * que uma assinatura sozinha nao baixa nada.
 *
 * ── O que cada estado significa em termos de SALDO ───────────────────────────────────────────
 *
 *   SOLICITADO  pedido registrado, com ou sem UMA das duas assinaturas. NADA saiu do estoque.
 *               Cancelar ou rejeitar daqui nao mexe em saldo nenhum.
 *   APROVADO    as DUAS pernas assinaram e a baixa `SUCATA` JA FOI EMITIDA pelo motor
 *               (movimentacao_sucata_id preenchido). O material saiu do patrimonio. Se o motor
 *               recusar a baixa, o servico COMPENSA o claim e o processo volta a SOLICITADO — ou
 *               seja, APROVADO sem baixa nao e um estado alcancavel de proposito.
 *   VENDIDA     final. O que ja tinha saido do estoque foi vendido: valor + comprovante.
 *   DESCARTADA  final. O mesmo material foi descartado (comprovante opcional).
 *   REJEITADO   final. Rejeicao justificada por quem aprova qualquer uma das pernas.
 *   CANCELADO   final. Desistencia do proprio solicitante, so enquanto SOLICITADO.
 *
 * Por que VENDIDA/DESCARTADA nao voltam para APROVADO, e por que REJEITADO/CANCELADO nao voltam
 * para SOLICITADO: as duas voltas significariam desfazer um fato. Depois de APROVADO a baixa
 * existe no livro — corrigir um destino errado e corrigir o CAMPO (o material ja saiu de qualquer
 * jeito), e desfazer a propria sucata e ESTORNAR a movimentacao pela tela de Movimentacoes, que ja
 * existe. Ressuscitar um processo rejeitado ou cancelado apagaria o registro de que ele foi
 * recusado; o caminho e solicitar de novo, que custa um formulario e deixa os dois rastros.
 * Mesmo criterio do comentario de ENCERRADA/CANCELADA em thirdPartyStateMachine.js.
 */

const STATUS_SUCATEAMENTO = ['SOLICITADO', 'APROVADO', 'VENDIDA', 'DESCARTADA', 'REJEITADO', 'CANCELADO'];

const TRANSICOES = {
  SOLICITADO: ['APROVADO', 'REJEITADO', 'CANCELADO'],
  APROVADO: ['VENDIDA', 'DESCARTADA'], // a baixa ja aconteceu; falta o destino final
  VENDIDA: [],
  DESCARTADA: [],
  REJEITADO: [],
  CANCELADO: [],
};

/**
 * Os dois destinos finais. Lista CANONICA — `SucateamentoDestinoSchema` (schemas.js) importa
 * DAQUI em vez de repetir o enum a mao.
 *
 * Isto e uma correcao consciente do precedente da 8b: `EncerramentoRemessaSchema` escreveu o enum
 * de novo e documentou a duplicacao como armadilha conhecida ("quem acrescentar um destino tem de
 * mexer nos dois lugares"). Listas replicadas foi o que este modulo passou a Etapa 8c inteira
 * consertando — aqui elas nascem com fonte unica. E derivada de TRANSICOES.APROVADO, e nao escrita
 * ao lado, porque "destino final" E, literalmente, "para onde APROVADO pode ir".
 */
const DESTINOS_FINAIS = TRANSICOES.APROVADO;

/** Estados a partir dos quais o servico aceita assinar uma perna (scrapDisposalService.aprovar). */
const PODE_APROVAR = ['SOLICITADO'];

/** Estados a partir dos quais o servico aceita rejeitar (scrapDisposalService.rejeitar). */
const PODE_REJEITAR = ['SOLICITADO'];

/**
 * Estados a partir dos quais o servico aceita cancelar (scrapDisposalService.cancelar). So
 * SOLICITADO: depois de APROVADO a baixa existe no livro, e "cancelar" ali seria apagar um fato —
 * o caminho e estornar a movimentacao.
 */
const PODE_CANCELAR = ['SOLICITADO'];

/** Estados a partir dos quais o servico aceita registrar destino (scrapDisposalService.registrarDestino). */
const PODE_REGISTRAR_DESTINO = ['APROVADO'];

/**
 * Valida uma transicao conforme TRANSICOES. Toda mudanca de status de sucateamento passa por aqui.
 * A mensagem nomeia o status ATUAL e os PERMITIDOS: "transicao invalida" seco obriga o operador a
 * adivinhar se ele esqueceu de aprovar ou se o processo ja tinha sido rejeitado por outra pessoa.
 * @returns {{ok:true}|{ok:false, erro:string}}
 */
function validarTransicao(statusAtual, novoStatus) {
  const permitidos = TRANSICOES[statusAtual] || [];
  if (!permitidos.includes(novoStatus)) {
    const destinos = permitidos.length ? permitidos.join(', ') : 'nenhum (estado final)';
    return {
      ok: false,
      erro: `Transicao invalida: sucateamento em ${statusAtual} nao pode ir para ${novoStatus}. `
        + `Permitidos a partir de ${statusAtual}: ${destinos}.`,
    };
  }
  return { ok: true };
}

module.exports = {
  STATUS_SUCATEAMENTO, TRANSICOES, DESTINOS_FINAIS,
  PODE_APROVAR, PODE_REJEITAR, PODE_CANCELAR, PODE_REGISTRAR_DESTINO,
  validarTransicao,
};
