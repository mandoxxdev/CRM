/**
 * Requisições de material — atendimento parcial com validação de estoque
 */
const { dbRun, dbGet, dbAll } = require('./db');

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

function maxSeparar(item, estoque) {
  return Math.min(pendenteSeparacao(item), num(estoque));
}

function maxEntregar(item, estoque) {
  const pendente = pendenteEntrega(item);
  const separadoDisponivel = Math.max(0, getSeparado(item) - getEntregue(item));
  return Math.min(pendente, separadoDisponivel, num(estoque));
}

function normalizarItem(item) {
  const entregue = getEntregue(item);
  const separado = getSeparado(item);
  const solicitado = num(item.quantidade_solicitada);
  const estoque = num(item.saldo_atual ?? item.quantidade_atual);
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
  return dbAll(db, `SELECT ir.*, ma.quantidade_atual, ma.unidade, ma.nome as material_nome, ma.codigo as material_codigo
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
  if (!['APROVADO', 'EM_SEPARACAO', 'PARCIALMENTE_ATENDIDA'].includes(reqRow.status)) {
    const err = new Error('Requisição deve estar aprovada, em separação ou parcialmente atendida para separar');
    err.status = 400;
    throw err;
  }

  const itens = await carregarItensRequisicao(db, requisicaoId);

  for (const entrada of itensSeparados) {
    const item = itens.find((i) => Number(i.id) === Number(entrada.item_id));
    if (!item) continue;

    const qty = num(entrada.quantidade_separada);
    if (qty <= 0) continue;

    const mat = await dbGet(db, 'SELECT quantidade_atual FROM materiais_almoxarifado WHERE id = ?', [item.material_id]);
    const estoque = num(mat?.quantidade_atual);
    const max = maxSeparar(item, estoque);

    if (qty > max) {
      const err = new Error(
        `${item.material_nome}: não é possível separar ${qty} ${item.unidade || ''}. `
        + `Máximo: ${max} (pendente: ${pendenteSeparacao(item)}, estoque: ${estoque})`
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
    `UPDATE requisicoes_almoxarifado SET status='EM_SEPARACAO', updated_at=CURRENT_TIMESTAMP WHERE id=?`,
    [requisicaoId]);

  return { success: true, status: 'EM_SEPARACAO' };
}

async function entregarRequisicao(db, requisicaoId, itensAtendidos, user, alertService) {
  const reqRow = await dbGet(db, 'SELECT * FROM requisicoes_almoxarifado WHERE id = ?', [requisicaoId]);
  if (!reqRow) {
    const err = new Error('Requisição não encontrada');
    err.status = 404;
    throw err;
  }
  if (!['EM_SEPARACAO', 'PARCIALMENTE_ATENDIDA'].includes(reqRow.status)) {
    const err = new Error('Requisição deve estar em separação ou parcialmente atendida');
    err.status = 400;
    throw err;
  }

  const itens = await carregarItensRequisicao(db, requisicaoId);
  const entregas = [];

  for (const item of itens) {
    const entrada = itensAtendidos?.find((ia) => Number(ia.item_id) === Number(item.id));
    const qtyEntregar = entrada ? num(entrada.quantidade_atendida) : 0;
    if (qtyEntregar <= 0) continue;

    const mat = await dbGet(db, 'SELECT quantidade_atual FROM materiais_almoxarifado WHERE id = ?', [item.material_id]);
    const estoque = num(mat?.quantidade_atual);
    const max = maxEntregar(item, estoque);

    if (qtyEntregar > max) {
      const err = new Error(
        `${item.material_nome}: não é possível entregar ${qtyEntregar} ${item.unidade || ''}. `
        + `Máximo: ${max} (pendente: ${pendenteEntrega(item)}, estoque: ${estoque})`
      );
      err.status = 400;
      throw err;
    }

    const entregueAtual = getEntregue(item);
    const novaEntregue = entregueAtual + qtyEntregar;
    const saldoAnterior = estoque;
    const saldoPosterior = saldoAnterior - qtyEntregar;

    await dbRun(db,
      'UPDATE materiais_almoxarifado SET quantidade_atual=?, updated_at=CURRENT_TIMESTAMP WHERE id=?',
      [saldoPosterior, item.material_id]);
    await dbRun(db, `INSERT INTO movimentacoes_almoxarifado
      (material_id, tipo, quantidade, saldo_anterior, saldo_posterior, motivo, referencia, usuario_id, usuario_nome, requisicao_id)
      VALUES (?, 'SAIDA', ?, ?, ?, ?, ?, ?, ?, ?)`,
      [item.material_id, qtyEntregar, saldoAnterior, saldoPosterior,
        `Requisição ${reqRow.numero}`, reqRow.os_referencia || reqRow.numero,
        user.id, user.nome || user.email, requisicaoId]);
    await dbRun(db,
      'UPDATE itens_requisicao_almoxarifado SET quantidade_entregue=?, quantidade_atendida=? WHERE id=?',
      [novaEntregue, novaEntregue, item.id]);

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
      `UPDATE requisicoes_almoxarifado SET status=?, data_entrega=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE id=?`,
      [novoStatus, requisicaoId]);
  } else {
    await dbRun(db,
      `UPDATE requisicoes_almoxarifado SET status=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`,
      [novoStatus, requisicaoId]);
  }

  if (alertService) {
    const materialIds = [...new Set(entregas.map((e) => {
      const item = itens.find((i) => i.id === e.item_id);
      return item?.material_id;
    }).filter(Boolean))];
    await Promise.all(materialIds.map((id) => alertService.verificarAlertaPorMaterialId(db, id).catch(() => null)));
  }

  return { success: true, status: novoStatus, parcial: !completo, entregas };
}

async function excluirRequisicao(db, requisicaoId, user, justificativa, alertService) {
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

    const mat = await dbGet(db, 'SELECT quantidade_atual, unidade FROM materiais_almoxarifado WHERE id = ?',
      [item.material_id]);
    const saldoAnterior = num(mat?.quantidade_atual);
    const saldoPosterior = saldoAnterior + qtyEstorno;

    await dbRun(db,
      'UPDATE materiais_almoxarifado SET quantidade_atual=?, updated_at=CURRENT_TIMESTAMP WHERE id=?',
      [saldoPosterior, item.material_id]);
    await dbRun(db, `INSERT INTO movimentacoes_almoxarifado
      (material_id, tipo, quantidade, saldo_anterior, saldo_posterior, motivo, referencia, usuario_id, usuario_nome, requisicao_id)
      VALUES (?, 'ENTRADA', ?, ?, ?, ?, ?, ?, ?, ?)`,
      [item.material_id, qtyEstorno, saldoAnterior, saldoPosterior,
        `Estorno exclusão requisição ${reqRow.numero}`,
        reqRow.os_referencia || reqRow.numero,
        user.id, user.nome || user.email, requisicaoId]);
    estornos.push({ material_id: item.material_id, quantidade: qtyEstorno });
  }

  const motivo = justificativa?.trim() || 'Excluída pelo administrador';
  await dbRun(db,
    `UPDATE requisicoes_almoxarifado
     SET ativo=0, status='CANCELADO', rejeicao_motivo=?, updated_at=CURRENT_TIMESTAMP
     WHERE id=?`,
    [motivo, requisicaoId]);

  if (alertService && estornos.length > 0) {
    const materialIds = [...new Set(estornos.map((e) => e.material_id))];
    await Promise.all(materialIds.map((id) => alertService.verificarAlertaPorMaterialId(db, id).catch(() => null)));
  }

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
