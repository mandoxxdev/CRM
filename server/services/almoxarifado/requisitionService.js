/**
 * Requisições de material — atendimento parcial com validação de estoque
 */
const { dbRun, dbGet, dbAll } = require('./db');
const valueApprovalService = require('./requisitionValueApprovalService');
const stockService = require('./stockService');
const { PODE_SEPARAR, PODE_ENTREGAR } = require('./requisitionStateMachine');

function num(v) {
  return Number(v) || 0;
}

function getEntregue(item) {
  return num(item.quantidade_entregue ?? item.quantidade_atendida);
}

function getSeparado(item) {
  return num(item.quantidade_separada);
}

function pendenteEntrega(item) {
  return Math.max(0, num(item.quantidade_solicitada) - getEntregue(item));
}

function pendenteSeparacao(item) {
  return Math.max(0, num(item.quantidade_solicitada) - getSeparado(item));
}

/**
 * `estoque` aqui é o saldo DISPONÍVEL (quantidade_atual − reservada − bloqueada −
 * em_inspecao), não mais o físico (Etapa 3, Task 3 — fecha o bypass de
 * entregarRequisicao/excluirRequisicao que baixava/estornava direto no físico sem passar
 * pelo motor). Os chamadores (separarRequisicao/entregarRequisicao/normalizarItem) já
 * calculam e passam o disponível.
 */
function maxSeparar(item, estoque) {
  return Math.min(pendenteSeparacao(item), num(estoque));
}

function maxEntregar(item, estoque) {
  const pendente = pendenteEntrega(item);
  if (pendente <= 0) return 0;
  const separadoDisponivel = Math.max(0, getSeparado(item) - getEntregue(item));
  // Segunda rodada após entrega parcial: separado já foi consumido, mas pendente permanece
  if (getEntregue(item) > 0 && separadoDisponivel < pendente) {
    return Math.min(pendente, num(estoque));
  }
  return Math.min(pendente, separadoDisponivel, num(estoque));
}

function normalizarItem(item) {
  const entregue = getEntregue(item);
  const separado = getSeparado(item);
  const solicitado = num(item.quantidade_solicitada);
  // saldo_atual mantém o NOME por compat com o front, mas passa a carregar o DISPONÍVEL
  // quando a query de origem já traz saldo_disponivel (carregarItensRequisicao) — mudança
  // semântica documentada na Task 3. Se só o físico estiver disponível (chamador antigo),
  // cai no físico como antes.
  const estoque = num(item.saldo_atual ?? item.saldo_disponivel ?? item.quantidade_atual);
  const pendente = Math.max(0, solicitado - entregue);
  const entregavel = maxEntregar(item, estoque);
  return {
    ...item,
    quantidade_entregue: entregue,
    quantidade_separada: separado,
    quantidade_atendida: entregue,
    quantidade_pendente: pendente,
    quantidade_entregavel: entregavel,
    saldo_atual: item.saldo_atual ?? estoque,
  };
}

function todosItensCompletos(itens) {
  return itens.every((i) => getEntregue(i) >= num(i.quantidade_solicitada));
}

async function carregarItensRequisicao(db, requisicaoId) {
  return dbAll(db, `SELECT ir.*, ma.quantidade_atual, ma.unidade, ma.nome as material_nome, ma.codigo as material_codigo,
      COALESCE(ma.custo_medio, ma.custo_unitario, 0) as custo_unitario,
      (ma.quantidade_atual - COALESCE(ma.quantidade_reservada,0) - COALESCE(ma.quantidade_bloqueada,0)
        - COALESCE(ma.quantidade_em_inspecao,0)) as saldo_disponivel
    FROM itens_requisicao_almoxarifado ir
    JOIN materiais_almoxarifado ma ON ir.material_id = ma.id
    WHERE ir.requisicao_id = ?`, [requisicaoId]);
}

async function separarRequisicao(db, requisicaoId, itensSeparados = []) {
  const reqRow = await dbGet(db, 'SELECT * FROM requisicoes_almoxarifado WHERE id = ?', [requisicaoId]);
  if (!reqRow) {
    const err = new Error('Requisição não encontrada');
    err.status = 404;
    throw err;
  }
  if (!PODE_SEPARAR.includes(reqRow.status)) {
    const err = new Error(
      'Requisição deve estar aprovada, aguardando estoque/compra, em separação ou parcialmente atendida para separar'
    );
    err.status = 400;
    throw err;
  }

  await valueApprovalService.verificarBloqueioLiberacao(db, requisicaoId);

  const itens = await carregarItensRequisicao(db, requisicaoId);

  for (const entrada of itensSeparados) {
    const item = itens.find((i) => Number(i.id) === Number(entrada.item_id));
    if (!item) continue;

    const qty = num(entrada.quantidade_separada);
    if (qty <= 0) continue;

    const mat = await dbGet(db, `SELECT (quantidade_atual - COALESCE(quantidade_reservada,0)
        - COALESCE(quantidade_bloqueada,0) - COALESCE(quantidade_em_inspecao,0)) as saldo_disponivel
      FROM materiais_almoxarifado WHERE id = ?`, [item.material_id]);
    const estoque = num(mat?.saldo_disponivel);
    const max = maxSeparar(item, estoque);

    if (qty > max) {
      const err = new Error(
        `${item.material_nome}: não é possível separar ${qty} ${item.unidade || ''}. `
        + `Máximo: ${max} (pendente: ${pendenteSeparacao(item)}, disponível: ${estoque})`
      );
      err.status = 400;
      throw err;
    }

    const novaSeparada = getSeparado(item) + qty;
    await dbRun(db, 'UPDATE itens_requisicao_almoxarifado SET quantidade_separada = ? WHERE id = ?',
      [novaSeparada, item.id]);
    item.quantidade_separada = novaSeparada;
  }

  await dbRun(db,
    `UPDATE requisicoes_almoxarifado SET status='EM_SEPARACAO', updated_at=CURRENT_TIMESTAMP, ultimo_lembrete_enviado=NULL WHERE id=?`,
    [requisicaoId]);

  return { success: true, status: 'EM_SEPARACAO' };
}

/**
 * `alertService` é aceito e ignorado (Etapa 3, Task 3): a baixa agora passa por
 * stockService.registrarMovimentacao, que já dispara a checagem de alerta internamente
 * (stockService.js, pós-INSERT da movimentação). Chamar de novo aqui duplicaria o disparo.
 * Mantido no parâmetro só para não quebrar as duas rotas que ainda o passam
 * (routes/almoxarifado.js, routes/requisicoesMaterial.js).
 */
async function entregarRequisicao(db, requisicaoId, itensAtendidos, user, alertService) { // eslint-disable-line no-unused-vars
  const reqRow = await dbGet(db, 'SELECT * FROM requisicoes_almoxarifado WHERE id = ?', [requisicaoId]);
  if (!reqRow) {
    const err = new Error('Requisição não encontrada');
    err.status = 404;
    throw err;
  }
  if (!PODE_ENTREGAR.includes(reqRow.status)) {
    const err = new Error('Requisição deve estar em separação, pronta para retirada ou parcialmente atendida');
    err.status = 400;
    throw err;
  }

  await valueApprovalService.verificarBloqueioLiberacao(db, requisicaoId);

  const itens = await carregarItensRequisicao(db, requisicaoId);
  const entregas = [];

  for (const item of itens) {
    const entrada = itensAtendidos?.find((ia) => Number(ia.item_id) === Number(item.id));
    const qtyEntregar = entrada ? num(entrada.quantidade_atendida) : 0;
    if (qtyEntregar <= 0) continue;

    // Ceiling é o DISPONÍVEL (Etapa 3, Task 3), não mais o físico — leitura fresca aqui é só
    // uma checagem antecipada para uma mensagem de erro com nome do material/pendente; a
    // validação que realmente vale é a atômica dentro de stockService.registrarMovimentacao
    // logo abaixo (fecha a janela de corrida entre esta leitura e a baixa real).
    const mat = await dbGet(db, `SELECT (quantidade_atual - COALESCE(quantidade_reservada,0)
        - COALESCE(quantidade_bloqueada,0) - COALESCE(quantidade_em_inspecao,0)) as saldo_disponivel
      FROM materiais_almoxarifado WHERE id = ?`, [item.material_id]);
    const disponivel = num(mat?.saldo_disponivel);
    const max = maxEntregar(item, disponivel);

    if (qtyEntregar > max) {
      const err = new Error(
        `${item.material_nome}: não é possível entregar ${qtyEntregar} ${item.unidade || ''}. `
        + `Máximo: ${max} (pendente: ${pendenteEntrega(item)}, disponível: ${disponivel})`
      );
      err.status = 400;
      throw err;
    }

    try {
      // eslint-disable-next-line no-await-in-loop
      await stockService.registrarMovimentacao(db, user, {
        material_id: item.material_id,
        tipo: 'SAIDA',
        quantidade: qtyEntregar,
        motivo: `Requisição ${reqRow.numero}`,
        referencia: reqRow.os_referencia || reqRow.numero,
        justificativa: `Entrega requisição ${reqRow.numero}`,
        requisicao_id: requisicaoId,
        projeto_id: reqRow.projeto_id || undefined,
        cliente_id: reqRow.cliente_id || undefined,
        centro_custo_id: reqRow.centro_custo_id || undefined,
      });
    } catch (e) {
      const err = new Error(`${item.material_nome}: ${e.message}`);
      err.status = e.status;
      throw err;
    }

    const entregueAtual = getEntregue(item);
    const novaEntregue = entregueAtual + qtyEntregar;
    const novaSeparada = Math.max(getSeparado(item), novaEntregue);

    await dbRun(db,
      'UPDATE itens_requisicao_almoxarifado SET quantidade_entregue=?, quantidade_atendida=?, quantidade_separada=? WHERE id=?',
      [novaEntregue, novaEntregue, novaSeparada, item.id]);

    entregas.push({ item_id: item.id, quantidade: qtyEntregar });
  }

  if (entregas.length === 0) {
    const err = new Error('Informe ao menos uma quantidade maior que zero para entregar');
    err.status = 400;
    throw err;
  }

  const itensAtualizados = await carregarItensRequisicao(db, requisicaoId);
  const completo = todosItensCompletos(itensAtualizados);
  const novoStatus = completo ? 'ENTREGUE' : 'PARCIALMENTE_ATENDIDA';

  if (completo) {
    await dbRun(db,
      `UPDATE requisicoes_almoxarifado SET status=?, data_entrega=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP, ultimo_lembrete_enviado=NULL WHERE id=?`,
      [novoStatus, requisicaoId]);
  } else {
    await dbRun(db,
      `UPDATE requisicoes_almoxarifado SET status=?, updated_at=CURRENT_TIMESTAMP, ultimo_lembrete_enviado=NULL WHERE id=?`,
      [novoStatus, requisicaoId]);
  }

  return { success: true, status: novoStatus, parcial: !completo, entregas };
}

/**
 * `alertService` é aceito e ignorado (Etapa 3, Task 3) — mesmo motivo de entregarRequisicao:
 * stockService.registrarMovimentacao já dispara a checagem de alerta internamente.
 */
async function excluirRequisicao(db, requisicaoId, user, justificativa, alertService) { // eslint-disable-line no-unused-vars
  const reqRow = await dbGet(db,
    'SELECT * FROM requisicoes_almoxarifado WHERE id = ? AND COALESCE(ativo, 1) = 1',
    [requisicaoId]);
  if (!reqRow) {
    const err = new Error('Requisição não encontrada');
    err.status = 404;
    throw err;
  }

  const itens = await carregarItensRequisicao(db, requisicaoId);
  const estornos = [];

  for (const item of itens) {
    const qtyEstorno = getEntregue(item);
    if (qtyEstorno <= 0) continue;

    try {
      // eslint-disable-next-line no-await-in-loop
      await stockService.registrarMovimentacao(db, user, {
        material_id: item.material_id,
        tipo: 'ENTRADA',
        quantidade: qtyEstorno,
        motivo: `Estorno exclusão requisição ${reqRow.numero}`,
        referencia: reqRow.os_referencia || reqRow.numero,
        requisicao_id: requisicaoId,
        projeto_id: reqRow.projeto_id || undefined,
        cliente_id: reqRow.cliente_id || undefined,
        centro_custo_id: reqRow.centro_custo_id || undefined,
      });
    } catch (e) {
      const err = new Error(`${item.material_nome}: ${e.message}`);
      err.status = e.status;
      throw err;
    }

    estornos.push({ material_id: item.material_id, quantidade: qtyEstorno });
  }

  const motivo = justificativa?.trim() || 'Excluída pelo administrador';
  await dbRun(db,
    `UPDATE requisicoes_almoxarifado
     SET ativo=0, status='CANCELADO', rejeicao_motivo=?, updated_at=CURRENT_TIMESTAMP, ultimo_lembrete_enviado=NULL
     WHERE id=?`,
    [motivo, requisicaoId]);

  return { success: true, estornos };
}

module.exports = {
  num,
  getEntregue,
  getSeparado,
  pendenteEntrega,
  pendenteSeparacao,
  maxSeparar,
  maxEntregar,
  normalizarItem,
  todosItensCompletos,
  carregarItensRequisicao,
  separarRequisicao,
  entregarRequisicao,
  excluirRequisicao,
};
