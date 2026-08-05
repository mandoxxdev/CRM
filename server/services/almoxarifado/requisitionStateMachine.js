/**
 * Máquina de estados de requisições de material (Etapa 3, Task 2).
 *
 * `TRANSICOES` é cópia literal do diagrama aprovado em
 * docs/superpowers/specs/2026-08-05-almoxarifado-etapa3-requisicoes-design.md, seção
 * "Máquina de estados". Padrão: objeto declarativo + validador — mesmo estilo de
 * movementRules.js (REGRAS_VINCULO + avaliarRegrasVinculo).
 */
const { dbGet, dbAll } = require('./db');

const TRANSICOES = {
  RASCUNHO: ['PENDENTE', 'CANCELADO'],
  PENDENTE: ['APROVADO', 'REJEITADO', 'AGUARDANDO_APROVACAO_VALOR', 'CANCELADO'],
  AGUARDANDO_APROVACAO_VALOR: ['PENDENTE', 'APROVADO', 'REJEITADO', 'CANCELADO'],
  APROVADO: ['EM_SEPARACAO', 'AGUARDANDO_ESTOQUE', 'AGUARDANDO_COMPRA', 'CANCELADO'],
  AGUARDANDO_ESTOQUE: ['EM_SEPARACAO', 'CANCELADO'],
  AGUARDANDO_COMPRA: ['EM_SEPARACAO', 'CANCELADO'],
  EM_SEPARACAO: ['PRONTA_PARA_RETIRADA', 'PARCIALMENTE_ATENDIDA', 'ENTREGUE'],
  PRONTA_PARA_RETIRADA: ['PARCIALMENTE_ATENDIDA', 'ENTREGUE'],
  PARCIALMENTE_ATENDIDA: ['EM_SEPARACAO', 'ENTREGUE', 'ENCERRADA'],
  ENTREGUE: ['ENCERRADA'],
};

/**
 * Estados a partir dos quais é permitido iniciar/repetir a separação (requisitionService
 * .separarRequisicao). Além de APROVADO/EM_SEPARACAO/PARCIALMENTE_ATENDIDA (já existentes
 * antes desta Task), inclui AGUARDANDO_ESTOQUE/AGUARDANDO_COMPRA — o almoxarife pode
 * iniciar separação a partir deles quando o estoque chegar (design, seção "Máquina de
 * estados").
 */
const PODE_SEPARAR = ['APROVADO', 'AGUARDANDO_ESTOQUE', 'AGUARDANDO_COMPRA', 'EM_SEPARACAO', 'PARCIALMENTE_ATENDIDA'];

/**
 * Estados a partir dos quais é permitido entregar (requisitionService.entregarRequisicao).
 * Além de EM_SEPARACAO/PARCIALMENTE_ATENDIDA (já existentes), inclui
 * PRONTA_PARA_RETIRADA — entrega direta após liberação para retirada.
 */
const PODE_ENTREGAR = ['EM_SEPARACAO', 'PRONTA_PARA_RETIRADA', 'PARCIALMENTE_ATENDIDA'];

/**
 * Valida uma transição de status conforme TRANSICOES. Toda mudança de status de
 * requisição deve passar por aqui (design: "Toda mudança de status passa pelo validador;
 * transição inválida → 400").
 * @returns {{ok:true}|{ok:false, erro:string}}
 */
function validarTransicao(statusAtual, novoStatus) {
  const permitidos = TRANSICOES[statusAtual] || [];
  if (!permitidos.includes(novoStatus)) {
    return { ok: false, erro: `Transição inválida: ${statusAtual} → ${novoStatus}` };
  }
  return { ok: true };
}

/**
 * Regra pós-aprovação (design, seção "Máquina de estados"): calculada ANTES do handler
 * `aprovar` gravar qualquer coisa — depende só dos itens/materiais da requisição, não do
 * status dela. Se NENHUM item da requisição tem saldo disponível (quantidade_atual −
 * reservada − bloqueada − em_inspecao) > 0, a requisição não fica em APROVADO — vai para
 * AGUARDANDO_COMPRA quando existe `solicitacoes_compra_almoxarifado` com status PENDENTE
 * para algum material envolvido (mesmo status usado por
 * purchaseService.verificarEstoqueMinimo), senão AGUARDANDO_ESTOQUE. Se ao menos um item
 * tem disponível > 0, permanece APROVADO.
 *
 * Não persiste nada — apenas calcula o status final; o handler grava o resultado num
 * único UPDATE (status + aprovador_id + data_aprovacao), evitando uma janela transitória
 * com status=APROVADO visível a leitores concorrentes entre dois writes.
 *
 * @returns {Promise<'APROVADO'|'AGUARDANDO_ESTOQUE'|'AGUARDANDO_COMPRA'>}
 */
async function calcularStatusPosAprovacao(db, requisicaoId) {
  const itens = await dbAll(db, `
    SELECT ir.material_id,
      (ma.quantidade_atual - COALESCE(ma.quantidade_reservada,0)
        - COALESCE(ma.quantidade_bloqueada,0) - COALESCE(ma.quantidade_em_inspecao,0)) as disponivel
    FROM itens_requisicao_almoxarifado ir
    JOIN materiais_almoxarifado ma ON ir.material_id = ma.id
    WHERE ir.requisicao_id = ?`, [requisicaoId]);

  if (itens.length === 0 || itens.some((i) => Number(i.disponivel) > 0)) {
    return 'APROVADO';
  }

  const materialIds = [...new Set(itens.map((i) => i.material_id))];
  const placeholders = materialIds.map(() => '?').join(',');
  const compraPendente = await dbGet(db,
    `SELECT COUNT(*) as n FROM solicitacoes_compra_almoxarifado
     WHERE status = 'PENDENTE' AND material_id IN (${placeholders})`,
    materialIds);

  return (compraPendente && compraPendente.n > 0) ? 'AGUARDANDO_COMPRA' : 'AGUARDANDO_ESTOQUE';
}

module.exports = {
  TRANSICOES,
  PODE_SEPARAR,
  PODE_ENTREGAR,
  validarTransicao,
  calcularStatusPosAprovacao,
};
