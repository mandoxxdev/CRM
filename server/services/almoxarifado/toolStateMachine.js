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
};

const TRANSICOES = {
  [STATUS.DISPONIVEL]: [STATUS.EMPRESTADA, STATUS.BLOQUEADA, STATUS.EM_MANUTENCAO, STATUS.AVARIADA, STATUS.PERDIDA],
  [STATUS.EMPRESTADA]: [STATUS.DISPONIVEL, STATUS.AVARIADA, STATUS.PERDIDA], // devolucao e RN-05
  [STATUS.BLOQUEADA]: [STATUS.DISPONIVEL],
  [STATUS.EM_MANUTENCAO]: [STATUS.DISPONIVEL],
  [STATUS.AVARIADA]: [STATUS.EM_MANUTENCAO, STATUS.PERDIDA],
  [STATUS.PERDIDA]: [STATUS.DISPONIVEL], // RN-10 reencontrada, com justificativa
};

function podeTransicionar(de, para) {
  return (TRANSICOES[de] || []).includes(para);
}

module.exports = { STATUS, TRANSICOES, podeTransicionar };
