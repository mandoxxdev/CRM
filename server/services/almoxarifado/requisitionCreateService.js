/**
 * Criação unificada de requisições de material (Etapa 3, Task 1).
 *
 * Usada pelas DUAS rotas de criação — `POST /api/almoxarifado/requisicoes` e
 * `POST /api/requisicoes-material` — que delegam aqui após `validate(RequisicaoSchema)`.
 * Cada rota mapeia o retorno para o SEU contrato de resposta (histórico preservado —
 * ver task-1-brief.md da Etapa 3). A validação de forma (itens >= 1, quantidade > 0,
 * tipo_requisicao no enum, EMERGENCIAL exige justificativa) já rodou no schema Zod antes
 * de chegar aqui; este serviço cuida das validações que dependem do banco (material
 * existente/ativo, whitelist por setor) e da persistência + efeitos colaterais.
 */
const { dbRun, dbGet, dbAll } = require('./db');
const sectorMaterialService = require('./sectorMaterialService');
const requisitionNotificationService = require('./requisitionNotificationService');
const purchaseNotifyService = require('./requisitionPurchaseNotifyService');
const valueApprovalService = require('./requisitionValueApprovalService');
// Etapa 31: `gerarNumeroReq` SUMIU daqui. Ela era o milissegundo fatiado em DECIMAL (os seis
// ultimos digitos) mais 2 digitos aleatorios — esse carimbo repetia a cada 16,7 MINUTOS (o pior
// dos quatro), e duas requisicoes criadas nesse intervalo, no mesmo offset de ms, disputavam 100
// sufixos. Era exportada mas nao importada em lugar nenhum, entao remove-la nao mexe em contrato
// de ninguem.
const { inserirComNumeroUnico } = require('./numeroDoc');

/**
 * Dispara as notificações pós-criação (e-mail solicitantes/almoxarifado + alerta de
 * Compras p/ itens sem estoque) e aplica a avaliação de liberação por valor. Extraído da
 * criação para ser reaproveitado pela Task 2 (enviar rascunho -> pendente dispara o mesmo
 * fluxo que a criação direta). Rascunhos NÃO passam por aqui.
 *
 * `solicitanteEmail` é opcional — quem cria via createRequisicao já tem `user.email` em
 * mãos e o repassa (evita depender de uma tabela `usuarios` que este módulo não possui/
 * gerencia); quando chamado sem ele (ex.: Task 2 a partir de um rascunho já persistido),
 * a notificação de Compras simplesmente não copia o solicitante — degradação graciosa.
 */
async function dispararNotificacoesCriacao(db, requisicaoId, solicitanteEmail = null) {
  const reqRow = await dbGet(db, 'SELECT * FROM requisicoes_almoxarifado WHERE id = ?', [requisicaoId]);
  if (!reqRow) return { status: 'PENDENTE' };

  const itens = await dbAll(db,
    `SELECT material_id, quantidade_solicitada FROM itens_requisicao_almoxarifado WHERE requisicao_id = ?`,
    [requisicaoId]);

  const reqData = {
    id: reqRow.id,
    numero: reqRow.numero,
    setor: reqRow.setor,
    departamento: reqRow.departamento,
    os_referencia: reqRow.os_referencia,
    solicitante_nome: reqRow.solicitante_nome,
    observacoes: reqRow.observacoes,
  };

  requisitionNotificationService.notificarNovaRequisicao(db, reqData).catch((err) => {
    console.warn('[requisitionCreateService] Falha ao notificar por e-mail:', err.message);
  });

  purchaseNotifyService.notifyComprasItensSemEstoque(
    db,
    reqData,
    itens.map((i) => ({ material_id: i.material_id, quantidade_solicitada: i.quantidade_solicitada })),
    solicitanteEmail,
  ).catch((err) => {
    console.warn('[requisitionCreateService] Falha ao notificar Compras:', err.message);
  });

  let avaliacaoValor;
  try {
    avaliacaoValor = await valueApprovalService.aplicarAvaliacaoNaCriacao(db, requisicaoId);
  } catch (valErr) {
    console.warn('[requisitionCreateService] Falha na avaliação de valor:', valErr.message);
    avaliacaoValor = { status: 'PENDENTE' };
  }

  return avaliacaoValor;
}

/**
 * Cria uma requisição (payload já validado por RequisicaoSchema — ids/quantidades
 * numéricos). Valida whitelist de material por setor (quando setor informado) e
 * existência/ativo dos materiais; insere requisição + itens; dispara notificações +
 * avaliação de valor (a menos que seja rascunho ou skipNotificacoes).
 *
 * @returns {{id:number, numero:string, status:string, valor_total?:number, requer_aprovacao_valor?:boolean}}
 */
// eslint-disable-next-line no-unused-vars -- `modulo` faz parte do contrato da interface
// (identifica a rota chamadora para uso futuro/auditoria); nenhuma regra de Task 1 depende dele.
async function createRequisicao(db, user, payload, { modulo, skipNotificacoes = false } = {}) {
  const {
    departamento, setor, os_referencia, urgencia, observacoes,
    justificativa_urgencia, itens, modulo_origem,
    tipo_requisicao, centro_custo_id, local_entrega,
    projeto_id, cliente_id, equipamento, prioridade, data_necessidade,
    justificativa, salvar_rascunho,
  } = payload;

  const setorFinal = departamento || setor || null;

  if (setorFinal) {
    await sectorMaterialService.ensureSetoresRequisicao(db);
  }

  const materialIds = [...new Set(itens.map((i) => i.material_id))];
  const placeholders = materialIds.map(() => '?').join(',');
  const materiaisAtivos = await dbAll(db,
    `SELECT id FROM materiais_almoxarifado WHERE id IN (${placeholders}) AND ativo = 1`,
    materialIds);
  if (materiaisAtivos.length !== materialIds.length) {
    const encontrados = new Set(materiaisAtivos.map((m) => m.id));
    const faltando = materialIds.filter((id) => !encontrados.has(id));
    const err = new Error(`Material(is) inexistente(s) ou inativo(s): ${faltando.join(', ')}`);
    err.status = 400;
    throw err;
  }

  if (setorFinal) {
    await sectorMaterialService.validateMateriaisParaSetor(db, setorFinal, materialIds);
  }

  const isRascunho = salvar_rascunho === true || salvar_rascunho === 1;
  const statusInicial = isRascunho ? 'RASCUNHO' : 'PENDENTE';

  // Etapa 31 (RN-07): o numero nasce DENTRO do gerador, na tentativa que vencer o UNIQUE, e e ele
  // que volta nos dois `return` deste servico. O `fn` contem SO o INSERT da requisicao — o
  // `ensureSetoresRequisicao` la em cima escreve ANTES e fica FORA do retry de proposito (e
  // idempotente); os itens sao inseridos DEPOIS, e entrariam em duplicata se estivessem aqui.
  const { numero, resultado: insertResult } = await inserirComNumeroUnico(db, 'REQ', (num) => dbRun(db,
    `INSERT INTO requisicoes_almoxarifado
      (numero, solicitante_id, solicitante_nome, departamento, setor, os_referencia,
       urgencia, observacoes, justificativa_urgencia, modulo_origem, status,
       tipo_requisicao, centro_custo_id, local_entrega, projeto_id, cliente_id,
       equipamento, prioridade, data_necessidade, justificativa)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      num, user.id, user.nome || user.email,
      setorFinal, setorFinal, os_referencia || null,
      urgencia || 'NORMAL', observacoes || null, justificativa_urgencia || null,
      modulo_origem || null, statusInicial,
      tipo_requisicao || 'CONSUMO', centro_custo_id || null, local_entrega || null,
      projeto_id || null, cliente_id || null, equipamento || null,
      prioridade || 'NORMAL', data_necessidade || null, justificativa || null,
    ]));

  const reqId = insertResult.lastID;

  await Promise.all(itens.map((item) => dbRun(db,
    `INSERT INTO itens_requisicao_almoxarifado (requisicao_id, material_id, quantidade_solicitada, observacoes)
     VALUES (?,?,?,?)`,
    [reqId, item.material_id, item.quantidade, item.observacoes || null])));

  if (isRascunho || skipNotificacoes) {
    return { id: reqId, numero, status: statusInicial };
  }

  const avaliacaoValor = await dispararNotificacoesCriacao(db, reqId, user.email);

  return {
    id: reqId,
    numero,
    status: avaliacaoValor.status || 'PENDENTE',
    valor_total: avaliacaoValor.valor_total,
    requer_aprovacao_valor: avaliacaoValor.status === valueApprovalService.STATUS_AGUARDANDO,
  };
}

module.exports = { createRequisicao, dispararNotificacoesCriacao };
