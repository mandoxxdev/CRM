/**
 * Maquina de estados da ferramenta (Etapa 9b). Padrao thirdPartyStateMachine.
 * Ferramenta e PATRIMONIO, nao estoque: nada aqui toca o motor de movimentacoes.
 * A transicao real acontece SEMPRE por UPDATE com claim no WHERE (toolService);
 * este modulo e a fonte unica de quais transicoes existem — quem valida fora dele
 * esta criando segunda fonte.
 */
const STATUS = {
  DISPONIVEL: 'DISPONIVEL',
  EMPRESTADA: 'EMPRESTADA',
  BLOQUEADA: 'BLOQUEADA',
  EM_MANUTENCAO: 'EM_MANUTENCAO',
  AVARIADA: 'AVARIADA',
  PERDIDA: 'PERDIDA',
  // Etapa 177 (B1144): descartada depois da manutencao. Estado final, visivel no historico — ativo = 0 sumiria da tela.
  BAIXADA: 'BAIXADA',
};

const TRANSICOES = {
  [STATUS.DISPONIVEL]: [STATUS.EMPRESTADA, STATUS.BLOQUEADA, STATUS.EM_MANUTENCAO, STATUS.AVARIADA, STATUS.PERDIDA],
  [STATUS.EMPRESTADA]: [STATUS.DISPONIVEL, STATUS.AVARIADA, STATUS.PERDIDA], // devolucao e RN-05
  [STATUS.BLOQUEADA]: [STATUS.DISPONIVEL],
  [STATUS.EM_MANUTENCAO]: [STATUS.DISPONIVEL, STATUS.BAIXADA], // Etapa 177: o destino da conclusao
  [STATUS.AVARIADA]: [STATUS.EM_MANUTENCAO, STATUS.PERDIDA],
  [STATUS.PERDIDA]: [STATUS.DISPONIVEL], // RN-10 reencontrada, com justificativa
  [STATUS.BAIXADA]: [STATUS.DISPONIVEL], // Etapa 177 (B1142): reverter a baixa, com justificativa
};

function podeTransicionar(de, para) {
  return (TRANSICOES[de] || []).includes(para);
}

module.exports = { STATUS, TRANSICOES, podeTransicionar };
