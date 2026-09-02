/**
 * Maquina de estados da remessa para terceiros (Etapa 8b, decisao 3 do design).
 *
 * `TRANSICOES` e copia literal do diagrama aprovado em
 * docs/superpowers/specs/2026-08-12-almoxarifado-etapa8b-materiais-terceiros-design.md, decisao 3.
 * Padrao: objeto declarativo + validador — MESMO estilo de requisitionStateMachine.js e de
 * movementRules.js (REGRAS_VINCULO + avaliarRegrasVinculo). Nao inventar forma nova.
 *
 * O que cada estado significa em termos de SALDO — e e isto que faz a maquina valer alguma coisa,
 * porque o efeito de estoque esta amarrado a transicao, nao ao clique:
 *
 *   ABERTA          remessa montada, itens escolhidos. NADA saiu do estoque ainda. Cancelar daqui
 *                   nao mexe em saldo nenhum.
 *   ENVIADA         o efeito acontece: quantidade_em_terceiros sobe, disponivel desce,
 *                   quantidade_atual NAO muda (o material continua sendo nosso, so nao esta aqui).
 *   RETORNO_PARCIAL parte voltou (em_terceiros desceu na proporcao); o restante segue retido.
 *                   Auto-transicao permitida: uma remessa recebe varios retornos.
 *   ENCERRADA       final. Se sobrou saldo que nunca voltou, o encerramento EXIGE destino
 *                   (PERDA_NO_TERCEIRO ou CONSUMIDO_NO_PROCESSO) + justificativa, e a baixa
 *                   correspondente zera quantidade_em_terceiros — ver thirdPartyService.encerrar.
 *   CANCELADA       final. Depois de ENVIADA, devolve tudo ao disponivel, como um estorno.
 *
 * Por que ENCERRADA e CANCELADA nao tem saida: saldo retido preso e o defeito que esta sessao ja
 * corrigiu duas vezes (reserva presa na Etapa 6, linha orfa de devolucao na Etapa 7). Reabrir uma
 * remessa encerrada significaria ressuscitar retencao sem lastro — se foi encerrada errada, o
 * caminho e estornar a movimentacao pela tela de Movimentacoes, que ja existe.
 */

const STATUS_REMESSA = ['ABERTA', 'ENVIADA', 'RETORNO_PARCIAL', 'ENCERRADA', 'CANCELADA'];

const TRANSICOES = {
  ABERTA: ['ENVIADA', 'CANCELADA'],
  // ENVIADA -> ENCERRADA direto: retorno total num unico recebimento, ou encerramento com tudo
  // pendente (o galvanizador perdeu a chapa inteira). Nos dois casos passar por RETORNO_PARCIAL
  // seria mentira de status.
  ENVIADA: ['RETORNO_PARCIAL', 'ENCERRADA', 'CANCELADA'],
  // Auto-transicao DECLARADA: uma remessa recebe N retornos parciais. Sem esta seta o segundo
  // retorno seria recusado pela propria maquina que autorizou o primeiro.
  RETORNO_PARCIAL: ['RETORNO_PARCIAL', 'ENCERRADA', 'CANCELADA'],
  ENCERRADA: [],
  CANCELADA: [],
};

/** Estados a partir dos quais o servico aceita registrar retorno (thirdPartyService.registrarRetorno). */
const PODE_RECEBER_RETORNO = ['ENVIADA', 'RETORNO_PARCIAL'];

/** Estados a partir dos quais o servico aceita encerrar (thirdPartyService.encerrar). */
const PODE_ENCERRAR = ['ENVIADA', 'RETORNO_PARCIAL'];

/**
 * Estados a partir dos quais o servico aceita cancelar (thirdPartyService.cancelar). ABERTA entra:
 * cancelar remessa que nunca saiu e so apagar um rascunho, e nao mexe em saldo.
 */
const PODE_CANCELAR = ['ABERTA', 'ENVIADA', 'RETORNO_PARCIAL'];

/**
 * Valida uma transicao conforme TRANSICOES. Toda mudanca de status de remessa passa por aqui.
 * A mensagem nomeia o status ATUAL e os PERMITIDOS: "transicao invalida" seco obriga o operador a
 * adivinhar se ele esqueceu de enviar ou se a remessa ja estava encerrada.
 * @returns {{ok:true}|{ok:false, erro:string}}
 */
function validarTransicao(statusAtual, novoStatus) {
  const permitidos = TRANSICOES[statusAtual] || [];
  if (!permitidos.includes(novoStatus)) {
    const destinos = permitidos.length ? permitidos.join(', ') : 'nenhum (estado final)';
    return {
      ok: false,
      erro: `Transicao invalida: remessa em ${statusAtual} nao pode ir para ${novoStatus}. `
        + `Permitidos a partir de ${statusAtual}: ${destinos}.`,
    };
  }
  return { ok: true };
}

module.exports = {
  STATUS_REMESSA, TRANSICOES, PODE_RECEBER_RETORNO, PODE_ENCERRAR, PODE_CANCELAR, validarTransicao,
};
