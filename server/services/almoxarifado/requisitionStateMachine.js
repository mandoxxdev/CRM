/**
 * Máquina de estados de requisições de material (Etapa 3, Task 2).
 *
 * `TRANSICOES` é cópia literal do diagrama aprovado em
 * docs/superpowers/specs/2026-08-05-almoxarifado-etapa3-requisicoes-design.md, seção
 * "Máquina de estados". Padrão: objeto declarativo + validador — mesmo estilo de
 * movementRules.js (REGRAS_VINCULO + avaliarRegrasVinculo).
 */
const { dbGet, dbAll } = require('./db');
const { disponivelSql } = require('./availabilitySql');

// Etapa 73 (T1): abaixo disso o "a caminho" e residuo de ponto flutuante, nao compra vindo.
const EPS_A_CAMINHO = 1e-9;

/**
 * Le a config `reposicao_horizonte_solicitacao_dias` (default 60) — mesmo padrao inline usado
 * por cada servico do modulo (alertService.getConfigValue, stockService, purchaseService
 * .lerConfigNumero): sem helper compartilhado, cada um le a propria chave.
 * Etapa 11, revisao final (achado 3): calcularStatusPosAprovacao contava solicitacao PENDENTE
 * sem corte de data — uma solicitacao de 400 dias atras, que a propria tela de reposicao ja
 * nao considera "a caminho" (RN-03 usa o mesmo horizonte), continuava travando requisicoes
 * novas em AGUARDANDO_COMPRA para sempre (o status nunca se autocorrige). Duas leituras da
 * mesma tabela nao podem usar reguas diferentes de "aberta".
 */
async function lerHorizonteSolicitacaoDias(db) {
  const row = await dbGet(db, "SELECT valor FROM configuracoes_almoxarifado WHERE chave = 'reposicao_horizonte_solicitacao_dias'");
  const n = parseFloat(row?.valor);
  return Number.isFinite(n) && n > 0 ? n : 60;
}

/**
 * Etapa 4: os dois status de reserva. Nomeados aqui porque a máquina de estados é a dona da
 * lista de status — quem os grava (requisitionService.reservarItensAprovacao) importa daqui em
 * vez de repetir a string.
 */
const STATUS_PARCIALMENTE_RESERVADA = 'PARCIALMENTE_RESERVADA';
const STATUS_TOTALMENTE_RESERVADA = 'TOTALMENTE_RESERVADA';

const TRANSICOES = {
  RASCUNHO: ['PENDENTE', 'CANCELADO'],
  PENDENTE: ['APROVADO', 'REJEITADO', 'AGUARDANDO_APROVACAO_VALOR', 'CANCELADO'],
  // Task 6: os dois status de reserva também são destino daqui. A lane /aprovar-valor passou a
  // reservar como a /aprovar faz — sem estas setas, aprovar por valor com saldo ficaria com o
  // hold criado mas o status recusado pela máquina, e o mesmo fato (aprovada COM reserva) teria
  // dois status conforme a rota que aprovou. APROVADO continua: é o destino quando não há nada
  // a reservar.
  AGUARDANDO_APROVACAO_VALOR: ['PENDENTE', 'APROVADO', 'REJEITADO', 'CANCELADO',
    'PARCIALMENTE_RESERVADA', 'TOTALMENTE_RESERVADA'],
  APROVADO: ['EM_SEPARACAO', 'AGUARDANDO_ESTOQUE', 'AGUARDANDO_COMPRA',
    'PARCIALMENTE_RESERVADA', 'TOTALMENTE_RESERVADA', 'CANCELADO'],
  // Etapa 74 (D5/B371): a requisição que esperava ganha a reserva quando a nota chega
  // (reservaChegadaService) — AGUARDANDO_* -> *_RESERVADA. Reabre a B362 de propósito: agora há
  // escritor de status fora das três portas de aprovação.
  AGUARDANDO_ESTOQUE: ['EM_SEPARACAO', 'CANCELADO', 'PARCIALMENTE_RESERVADA', 'TOTALMENTE_RESERVADA'],
  AGUARDANDO_COMPRA: ['EM_SEPARACAO', 'CANCELADO', 'PARCIALMENTE_RESERVADA', 'TOTALMENTE_RESERVADA'],
  // Etapa 4 (design, decisão 2): entram ENTRE APROVADO e EM_SEPARACAO. A aprovação reserva o
  // saldo de cada item e a requisição para num deles em vez de ficar só APROVADO. Daqui só se
  // vai para a separação (o caminho normal) ou para o cancelamento — não há atalho para
  // PRONTA_PARA_RETIRADA/ENTREGUE, que continuam exigindo passar por EM_SEPARACAO.
  // Etapa 74 (D5/B371): PARCIALMENTE -> TOTALMENTE quando a nota traz o resto; e, para o estorno da
  // entrada que desfaz a reserva da chegada, de volta a AGUARDANDO_*/APROVADO (sem hold nenhum) ou
  // de TOTALMENTE a PARCIALMENTE (perdeu parte). Só o recálculo de reservaChegadaService grava estas.
  PARCIALMENTE_RESERVADA: ['EM_SEPARACAO', 'CANCELADO', 'TOTALMENTE_RESERVADA',
    'AGUARDANDO_ESTOQUE', 'AGUARDANDO_COMPRA', 'APROVADO'],
  TOTALMENTE_RESERVADA: ['EM_SEPARACAO', 'CANCELADO', 'PARCIALMENTE_RESERVADA',
    'AGUARDANDO_ESTOQUE', 'AGUARDANDO_COMPRA', 'APROVADO'],
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
 * estados") — e, desde a Etapa 4, PARCIALMENTE_RESERVADA/TOTALMENTE_RESERVADA, que são o
 * novo estado normal de uma requisição recém-aprovada com saldo: sem eles aqui, a reserva
 * automática travaria a separação da própria requisição que a criou.
 */
const PODE_SEPARAR = ['APROVADO', 'AGUARDANDO_ESTOQUE', 'AGUARDANDO_COMPRA',
  'PARCIALMENTE_RESERVADA', 'TOTALMENTE_RESERVADA', 'EM_SEPARACAO', 'PARCIALMENTE_ATENDIDA'];

/**
 * Estados a partir dos quais é permitido entregar (requisitionService.entregarRequisicao).
 * Além de EM_SEPARACAO/PARCIALMENTE_ATENDIDA (já existentes), inclui
 * PRONTA_PARA_RETIRADA — entrega direta após liberação para retirada.
 */
const PODE_ENTREGAR = ['EM_SEPARACAO', 'PRONTA_PARA_RETIRADA', 'PARCIALMENTE_ATENDIDA'];

/**
 * Etapa 92 (B434, C149): os status em que quem pediu cancela pela rota dos outros modulos
 * (`PUT /api/requisicoes-material/:id/cancelar`). E a lista da tela fora do modo almoxarifado
 * (`client/src/components/almoxarifado/requisicaoLabels.js`, STATUS_CANCELAVEIS_OUTROS_MODULOS),
 * conferida por teste (RN-07); subconjunto do que TRANSICOES deixa ir a CANCELADO.
 */
const CANCELAVEIS_OUTROS_MODULOS = Object.freeze(['PENDENTE', 'APROVADO', 'AGUARDANDO_ESTOQUE', 'AGUARDANDO_COMPRA',
  'PARCIALMENTE_RESERVADA', 'TOTALMENTE_RESERVADA']);

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
 * Etapa 11 (revisão final, achado 3): a contagem de `PENDENTE` respeita o MESMO horizonte
 * (`reposicao_horizonte_solicitacao_dias`) que `purchaseService.calcularSugestoes` usa para
 * decidir se uma solicitação ainda está "a caminho" (RN-03).
 * ATUALIZAÇÃO (Etapa 14, revisão da Task 1): a frase original dizia "nada no sistema fecha
 * uma solicitação" — DEIXOU DE SER VERDADE: a Etapa 14 fecha por RECEBIDA (recebimento do
 * pedido processado/aprovado) e por CANCELADA (manual). O corte de horizonte CONTINUA
 * necessário — ele cobre o pedido que NUNCA chega (nem fecha, nem cancela): sem ele, uma
 * solicitação órfã antiga continuaria empurrando requisições novas para AGUARDANDO_COMPRA
 * indefinidamente.
 *
 * Etapa 73 (C116): o parágrafo do topo dizia "status PENDENTE" — DEIXOU DE SER A REGRA. Assim que o
 * comprador gerava o pedido (solicitação VINCULADO), a requisição sem saldo ia para
 * AGUARDANDO_ESTOQUE com a compra a caminho. Agora conta a solicitação (PENDENTE ou VINCULADO) com
 * `a_caminho > 0` dentro do horizonte, lida de `purchaseService.posicaoDasSolicitacoes` (a fonte
 * única da Etapa 72). Pedido encerrado ou material já completo no pedido: `a_caminho` 0, não conta.
 * Pedido avulso do Compras SEM solicitação não conta (coerente com a reposição — declarado no plano).
 * Se a posição lançar, cai para a consulta antiga só de PENDENTE (a aprovação não quebra pelo rótulo).
 *
 * @returns {Promise<'APROVADO'|'AGUARDANDO_ESTOQUE'|'AGUARDANDO_COMPRA'>}
 */
async function calcularStatusPosAprovacao(db, requisicaoId) {
  const itens = await dbAll(db, `
    SELECT ir.material_id,
      ${disponivelSql('ma')} as disponivel
    FROM itens_requisicao_almoxarifado ir
    JOIN materiais_almoxarifado ma ON ir.material_id = ma.id
    WHERE ir.requisicao_id = ?`, [requisicaoId]);

  if (itens.length === 0 || itens.some((i) => Number(i.disponivel) > 0)) {
    return 'APROVADO';
  }

  const materialIds = [...new Set(itens.map((i) => i.material_id))];
  const horizonte = await lerHorizonteSolicitacaoDias(db);

  // Etapa 73 (T1, C116, D1/B357): "aguardando compra" = existe solicitacao do material, dentro do
  // horizonte, com algo A CAMINHO — pela fonte unica da Etapa 72. Para PENDENTE, `a_caminho` e a
  // quantidade inteira (a regra de antes, intacta); o que entra e o VINCULADO a pedido vivo com saldo
  // a receber. VINCULADO de pedido encerrado, ou de material ja completo no pedido, tem a_caminho 0 e
  // NAO conta (nada vem). Require DENTRO da funcao: alertRegistry requer esta maquina e o
  // purchaseService requer o alertService — no topo arriscaria ciclo.
  try {
    const purchaseService = require('./purchaseService');
    for (const materialId of materialIds) {
      // eslint-disable-next-line no-await-in-loop
      const linhas = await purchaseService.posicaoDasSolicitacoes(db, { material_id: materialId, horizonteDias: horizonte });
      if (linhas.some((l) => l.dentro_horizonte && Number(l.a_caminho) > EPS_A_CAMINHO)) return 'AGUARDANDO_COMPRA';
    }
    return 'AGUARDANDO_ESTOQUE';
  } catch (e) {
    // A aprovacao nunca quebra por causa do rotulo: cai para a regra de antes da 73 (so PENDENTE).
    console.warn(`[almoxarifado-aprovar] posicao das solicitacoes indisponivel: ${e.message}`);
  }

  const placeholders = materialIds.map(() => '?').join(',');
  const compraPendente = await dbGet(db,
    `SELECT COUNT(*) as n FROM solicitacoes_compra_almoxarifado
     WHERE status = 'PENDENTE' AND material_id IN (${placeholders})
       AND created_at >= datetime('now', '-' || ? || ' days')`,
    [...materialIds, horizonte]);

  return (compraPendente && compraPendente.n > 0) ? 'AGUARDANDO_COMPRA' : 'AGUARDANDO_ESTOQUE';
}

module.exports = {
  TRANSICOES,
  STATUS_PARCIALMENTE_RESERVADA,
  STATUS_TOTALMENTE_RESERVADA,
  PODE_SEPARAR,
  PODE_ENTREGAR,
  CANCELAVEIS_OUTROS_MODULOS,
  validarTransicao,
  calcularStatusPosAprovacao,
};
