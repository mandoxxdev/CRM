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
const approvalRulesService = require('./approvalRulesService');
// Etapa 31: `gerarNumeroReq` SUMIU daqui. Ela era o milissegundo fatiado em DECIMAL (os seis
// ultimos digitos) mais 2 digitos aleatorios — esse carimbo repetia a cada 16,7 MINUTOS (o pior
// dos quatro), e duas requisicoes criadas nesse intervalo, no mesmo offset de ms, disputavam 100
// sufixos. Era exportada mas nao importada em lugar nenhum, entao remove-la nao mexe em contrato
// de ninguem.
const { inserirComNumeroUnico } = require('./numeroDoc');
const Q = require('./quantidade'); // Etapa 96 (Fase 5, R1)
const { TIPOS_URGENCIA } = require('./schema');

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

  // Etapa 47 (RN-09): as regras de aprovação, ANTES do valor. Falha é logada e NÃO abre a porta:
  // sem `regras_avaliadas_em` o gate de aprovação fica fechado e `/aprovar` reavalia (9.7/C2).
  try {
    await approvalRulesService.avaliarRequisicao(db, requisicaoId);
  } catch (regraErr) {
    console.warn('[requisitionCreateService] Falha ao avaliar regras de aprovação:', regraErr.message);
  }

  let avaliacaoValor;
  try {
    avaliacaoValor = await valueApprovalService.aplicarAvaliacaoNaCriacao(db, requisicaoId);
  } catch (valErr) {
    console.warn('[requisitionCreateService] Falha na avaliação de valor:', valErr.message);
    avaliacaoValor = { status: 'PENDENTE' };
  }

  return avaliacaoValor;
}

const FORMATO_DATA_NECESSIDADE = 'data_necessidade deve estar no formato AAAA-MM-DD';

/**
 * Etapa 67: `data_necessidade` e o PRAZO do indicador "% no prazo". Vazio, null ou ausente = sem
 * prazo (NULL). Qualquer outra coisa tem de ser AAAA-MM-DD de um dia que EXISTE — o regex sozinho
 * deixaria passar 2026-02-30, que o `date()` do SQLite normaliza para outro dia em vez de recusar.
 * O legado ja gravado (DD/MM/AAAA) continua no banco e o relatorio o conta em `sem_data_valida`.
 */
function normalizarDataNecessidade(valor) {
  if (valor === undefined || valor === null || valor === '') return null;
  const recusa = () => Object.assign(new Error(FORMATO_DATA_NECESSIDADE), { status: 400 });
  if (typeof valor !== 'string') throw recusa();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valor);
  if (!m) throw recusa();
  const [ano, mes, dia] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const d = new Date(Date.UTC(ano, mes - 1, dia));
  if (d.getUTCFullYear() !== ano || d.getUTCMonth() !== mes - 1 || d.getUTCDate() !== dia) throw recusa();
  return valor;
}

/**
 * Cria uma requisição (payload já validado por RequisicaoSchema — ids/quantidades
 * numéricos). Valida whitelist de material por setor (quando setor informado) e
 * existência/ativo dos materiais; insere requisição + itens; dispara notificações +
 * avaliação de valor (a menos que seja rascunho ou skipNotificacoes).
 *
 * @returns {{id:number, numero:string, status:string, valor_total?:number, requer_aprovacao_valor?:boolean}}
 */
/**
 * RN-A (Etapa 33) — nenhuma saiída de material sem OS.
 *
 * Pedido da Gerência de Compras (e-mail 15/09/2026): *"preciso que a informação do número da
 * OS seja obrigatória, tanto para quem solicita quanto para quem realiza a liberação. Caso não
 * exista uma OS cadastrada, o sistema deverá impedir a liberação"*. O objetivo dela é saber,
 * depois, em qual serviço cada material foi usado.
 *
 * O número é DIGITADO, não escolhido de um cadastro — decisão do P.O., 16/09/2026. Ou seja,
 * aqui não existe validação contra `ordens_servico`: basta existir um número.
 *
 * Duas coisas que esta função NÃO faz, de propósito:
 *  - não exige OS no RASCUNHO. Rascunho é trabalho pela metade por definição; a cobrança
 *    acontece no envio (rota `/enviar`), que é quando a requisição passa a valer.
 *  - não mexe em requisição ANTIGA sem OS. Preencher retroativamente seria inventar dado que
 *    ninguém tem; a regra vale do que for criado daqui para a frente.
 */
function exigirOS(osReferencia) {
  const numero = String(osReferencia == null ? '' : osReferencia).trim();
  if (!numero) {
    const err = new Error('Informe o número da OS: toda saída de material precisa estar vinculada a uma OS');
    err.status = 400;
    throw err;
  }
  return numero;
}

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

  const isRascunho = salvar_rascunho === true || salvar_rascunho === 1;

  // RN-A cobrada ANTES da validação de itens/setor: o motivo da recusa é a requisição em si,
  // não o que veio na lista de materiais. Com a ordem invertida, quem esquecesse a OS receberia
  // "material não permitido para este setor" e iria mexer no lugar errado.
  // Rascunho pode ficar sem OS; a cobrança acontece no envio.
  const osFinal = isRascunho
    ? (os_referencia == null ? null : String(os_referencia).trim() || null)
    : exigirOS(os_referencia);

  const setorFinal = departamento || setor || null;

  // Etapa 48 (RN-01): lista fechada, ANTES de qualquer escrita (o `ensureSetoresRequisicao` abaixo
  // já escreve). Vazio/ausente continuam sendo NORMAL. Comparação EXATA: 'urgente' é recusado —
  // aceitar variações seria reabrir a lista por outro caminho.
  const urgenciaFinal = (urgencia === undefined || urgencia === null || urgencia === '') ? 'NORMAL' : urgencia;
  if (!TIPOS_URGENCIA.includes(urgenciaFinal)) {
    const err = new Error(`Urgência inválida: ${urgencia}`);
    err.status = 400;
    throw err;
  }

  // Etapa 67 (Fase 2, critico 1): o "% no prazo" compara date(data_necessidade) — texto que o
  // SQLite nao le (DD/MM/AAAA, "amanha") sumia calado do indicador. Recusa ANTES de qualquer
  // escrita, aqui no servico (unico escritor da coluna: as duas rotas de criacao passam por ele).
  const dataNecessidadeFinal = normalizarDataNecessidade(data_necessidade);

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

  // Etapa 96 (Fase 5, R1): a quantidade do item e gravada ARREDONDADA a 1e-6 (B482), como a porta do motor. Gravada
  // crua (0,3333333; 1,0000004; o 1/3 de uma conversao), a separacao e a entrega — que arredondam — nunca alcancavam o
  // solicitado: a requisicao ficava PARCIALMENTE_ATENDIDA com pendente 0, fora da fila, e a reserva ATIVA com 3e-7.
  // O que arredonda a zero (0,0000004) recebe a recusa de quantidade invalida de sempre (a do schema), ANTES de
  // qualquer escrita. Descartado: recusar mais de 6 casas (B482: a conversao de unidade produz 1/3 legitimo).
  const itensQtd = itens.map((item, i) => {
    const q = Q.qtd(item.quantidade);
    if (!(q > 0)) {
      const err = new Error(`Dados inválidos — itens.${i}.quantidade: quantidade deve ser maior que zero`);
      err.status = 400;
      throw err;
    }
    return q;
  });

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
      setorFinal, setorFinal, osFinal,
      urgenciaFinal, observacoes || null, justificativa_urgencia || null,
      modulo_origem || null, statusInicial,
      tipo_requisicao || 'CONSUMO', centro_custo_id || null, local_entrega || null,
      projeto_id || null, cliente_id || null, equipamento || null,
      prioridade || 'NORMAL', dataNecessidadeFinal, justificativa || null,
    ]));

  const reqId = insertResult.lastID;

  // Etapa 73 (T0, G80): um item por vez, NA ORDEM do payload. Era Promise.all(itens.map(INSERT)) e o
  // node-sqlite3 nao garante a ordem de execucao de comandos paralelos na mesma conexao: o id do
  // item saia trocado (medido: 16-17 de 20 requisicoes de 5 itens) e o detalhe, que segue o id,
  // mostrava B antes de A para quem pediu A e B.
  for (const [n, item] of itens.entries()) {
    // eslint-disable-next-line no-await-in-loop
    await dbRun(db,
      `INSERT INTO itens_requisicao_almoxarifado (requisicao_id, material_id, quantidade_solicitada, observacoes)
       VALUES (?,?,?,?)`,
      [reqId, item.material_id, itensQtd[n], item.observacoes || null]);
  }

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

module.exports = {
  // Exportada para a rota /enviar cobrar a MESMA regra no envio do rascunho — duas
  // cópias da condição divergiriam e o rascunho viraria a porta dos fundos da RN-A.
  exigirOS, createRequisicao, dispararNotificacoesCriacao, FORMATO_DATA_NECESSIDADE };
