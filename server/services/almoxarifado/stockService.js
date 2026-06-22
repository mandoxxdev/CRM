const { dbRun, dbGet, dbAll } = require('./db');
const { registrarAuditoria } = require('./audit');
const { can } = require('./permissions');

async function getConfig(db, chave) {
  const row = await dbGet(db, 'SELECT valor FROM configuracoes_almoxarifado WHERE chave = ?', [chave]);
  return row?.valor;
}

async function getMaterial(db, materialId) {
  const m = await dbGet(db, 'SELECT * FROM materiais_almoxarifado WHERE id = ?', [materialId]);
  if (!m) throw Object.assign(new Error('Material não encontrado'), { status: 404 });
  return m;
}

async function getSaldoDisponivel(material) {
  const reservado = material.quantidade_reservada || 0;
  const bloqueado = material.quantidade_bloqueada || 0;
  const inspecao = material.quantidade_em_inspecao || 0;
  return material.quantidade_atual - reservado - bloqueado - inspecao;
}

async function syncMaterialTotals(db, materialId) {
  const saldos = await dbGet(db, `
    SELECT COALESCE(SUM(quantidade),0) as total,
           COALESCE(SUM(quantidade_reservada),0) as reservado,
           COALESCE(SUM(quantidade_bloqueada),0) as bloqueado,
           COALESCE(SUM(quantidade_em_inspecao),0) as inspecao
    FROM estoque_saldo_almoxarifado WHERE material_id = ?`, [materialId]);

  if (saldos && saldos.total > 0) {
    await dbRun(db, `UPDATE materiais_almoxarifado SET
      quantidade_atual = ?, quantidade_reservada = ?, quantidade_bloqueada = ?, quantidade_em_inspecao = ?,
      updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [saldos.total, saldos.reservado, saldos.bloqueado, saldos.inspecao, materialId]);
  }
}

async function getOrCreateSaldo(db, materialId, localizacaoId, lote = null) {
  let saldo = await dbGet(db,
    'SELECT * FROM estoque_saldo_almoxarifado WHERE material_id = ? AND localizacao_id IS ? AND lote IS ?',
    [materialId, localizacaoId || null, lote || null]);
  if (!saldo) {
    const r = await dbRun(db,
      'INSERT INTO estoque_saldo_almoxarifado (material_id, localizacao_id, lote) VALUES (?,?,?)',
      [materialId, localizacaoId || null, lote || null]);
    saldo = await dbGet(db, 'SELECT * FROM estoque_saldo_almoxarifado WHERE id = ?', [r.lastID]);
  }
  return saldo;
}

async function registrarMovimentacao(db, user, params) {
  const {
    material_id, tipo, quantidade, motivo, referencia, observacoes,
    localizacao_origem_id, localizacao_destino_id, lote, projeto_id, os_id, cliente_id,
    documento_vinculado, justificativa, reserva_id, recebimento_id, requisicao_id,
  } = params;

  if (!user?.id) throw Object.assign(new Error('Usuário responsável obrigatório'), { status: 400 });
  if (!material_id || !tipo || !quantidade || quantidade <= 0) {
    throw Object.assign(new Error('material_id, tipo e quantidade são obrigatórios'), { status: 400 });
  }

  const material = await getMaterial(db, material_id);
  if (!material.ativo) throw Object.assign(new Error('Material inativo não pode ser movimentado'), { status: 400 });

  const permiteNegativo = material.permite_saldo_negativo || (await getConfig(db, 'permite_saldo_negativo_global')) === '1';
  const saldoAnterior = material.quantidade_atual;
  let saldoPosterior = saldoAnterior;

  const tiposEntrada = ['ENTRADA', 'ENTRADA_COMPRA', 'ENTRADA_MANUAL', 'ENTRADA_DEVOLUCAO', 'DEVOLUCAO', 'AJUSTE_POSITIVO'];
  const tiposSaida = ['SAIDA', 'SAIDA_PRODUCAO', 'SAIDA_MONTAGEM', 'SAIDA_ASSISTENCIA', 'AJUSTE_NEGATIVO', 'SUCATA', 'PERDA'];
  const tiposAjuste = ['AJUSTE'];

  if (tiposEntrada.includes(tipo)) {
    saldoPosterior = saldoAnterior + parseFloat(quantidade);
  } else if (tiposSaida.includes(tipo)) {
    const disponivel = await getSaldoDisponivel(material);
    if (disponivel < quantidade && !permiteNegativo) {
      throw Object.assign(new Error(`Saldo insuficiente. Disponível: ${disponivel} ${material.unidade}`), { status: 400 });
    }
    if ((material.quantidade_bloqueada || 0) > 0 && tiposSaida.includes(tipo)) {
      const dispSemBloqueio = material.quantidade_atual - (material.quantidade_bloqueada || 0);
      if (quantidade > dispSemBloqueio && !permiteNegativo) {
        throw Object.assign(new Error('Material bloqueado não pode ser utilizado'), { status: 400 });
      }
    }
    if (tiposSaida.includes(tipo) && !os_id && !projeto_id && !justificativa && !referencia) {
      throw Object.assign(new Error('Saída de produção requer OS/projeto ou justificativa'), { status: 400 });
    }
    saldoPosterior = saldoAnterior - parseFloat(quantidade);
  } else if (tiposAjuste.includes(tipo)) {
    if (!justificativa && !can(user, 'ajustar_estoque')) {
      throw Object.assign(new Error('Ajuste requer justificativa'), { status: 400 });
    }
    saldoPosterior = parseFloat(quantidade);
  } else if (tipo === 'TRANSFERENCIA') {
    if (!localizacao_origem_id || !localizacao_destino_id) {
      throw Object.assign(new Error('Transferência requer origem e destino'), { status: 400 });
    }
    const saldoOrigem = await getOrCreateSaldo(db, material_id, localizacao_origem_id, lote);
    if (saldoOrigem.quantidade < quantidade) {
      throw Object.assign(new Error('Saldo insuficiente na localização de origem'), { status: 400 });
    }
    await dbRun(db, 'UPDATE estoque_saldo_almoxarifado SET quantidade = quantidade - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [quantidade, saldoOrigem.id]);
    const saldoDestino = await getOrCreateSaldo(db, material_id, localizacao_destino_id, lote);
    await dbRun(db, 'UPDATE estoque_saldo_almoxarifado SET quantidade = quantidade + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [quantidade, saldoDestino.id]);
    saldoPosterior = saldoAnterior;
  } else if (tipo === 'BLOQUEIO') {
    await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_bloqueada = COALESCE(quantidade_bloqueada,0) + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [quantidade, material_id]);
    saldoPosterior = saldoAnterior;
  } else if (tipo === 'DESBLOQUEIO') {
    await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_bloqueada = MAX(0, COALESCE(quantidade_bloqueada,0) - ?), updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [quantidade, material_id]);
    saldoPosterior = saldoAnterior;
  }

  if (!['TRANSFERENCIA', 'BLOQUEIO', 'DESBLOQUEIO', 'RESERVA', 'LIBERACAO_RESERVA'].includes(tipo)) {
    if (saldoPosterior < 0 && !permiteNegativo) {
      throw Object.assign(new Error('Operação resultaria em saldo negativo'), { status: 400 });
    }
    await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_atual = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [saldoPosterior, material_id]);

    if (localizacao_destino_id && tiposEntrada.includes(tipo)) {
      const saldo = await getOrCreateSaldo(db, material_id, localizacao_destino_id, lote);
      await dbRun(db, 'UPDATE estoque_saldo_almoxarifado SET quantidade = quantidade + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [quantidade, saldo.id]);
    }
    if (localizacao_origem_id && tiposSaida.includes(tipo)) {
      const saldo = await getOrCreateSaldo(db, material_id, localizacao_origem_id, lote);
      await dbRun(db, 'UPDATE estoque_saldo_almoxarifado SET quantidade = quantidade - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [quantidade, saldo.id]);
    }
  }

  const result = await dbRun(db, `INSERT INTO movimentacoes_almoxarifado
    (material_id, tipo, quantidade, saldo_anterior, saldo_posterior, motivo, referencia, observacoes,
     usuario_id, usuario_nome, localizacao_origem_id, localizacao_destino_id, lote, unidade,
     projeto_id, os_id, cliente_id, documento_vinculado, justificativa, reserva_id, recebimento_id, requisicao_id)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [
    material_id, tipo, quantidade, saldoAnterior, saldoPosterior,
    motivo || null, referencia || null, observacoes || null,
    user.id, user.nome || user.email,
    localizacao_origem_id || null, localizacao_destino_id || null, lote || null, material.unidade,
    projeto_id || null, os_id || null, cliente_id || null,
    documento_vinculado || null, justificativa || null,
    reserva_id || null, recebimento_id || null, requisicao_id || null,
  ]);

  await registrarAuditoria(db, {
    entidade: 'movimentacao', entidade_id: result.lastID, acao: tipo,
    usuario_id: user.id, usuario_nome: user.nome || user.email,
    dados_novos: { material_id, tipo, quantidade, saldo_posterior: saldoPosterior },
    justificativa,
  });

  return { id: result.lastID, saldo_anterior: saldoAnterior, saldo_posterior: saldoPosterior };
}

async function cancelarMovimentacao(db, user, movimentoId, motivo) {
  if (!motivo) throw Object.assign(new Error('Justificativa obrigatória para cancelamento'), { status: 400 });
  const mov = await dbGet(db, 'SELECT * FROM movimentacoes_almoxarifado WHERE id = ?', [movimentoId]);
  if (!mov) throw Object.assign(new Error('Movimentação não encontrada'), { status: 404 });
  if (mov.cancelado) throw Object.assign(new Error('Movimentação já cancelada'), { status: 400 });

  const material = await getMaterial(db, mov.material_id);
  const tiposEntrada = ['ENTRADA', 'ENTRADA_COMPRA', 'ENTRADA_MANUAL', 'ENTRADA_DEVOLUCAO', 'DEVOLUCAO', 'AJUSTE_POSITIVO'];
  let novoSaldo = material.quantidade_atual;
  if (tiposEntrada.includes(mov.tipo)) novoSaldo -= mov.quantidade;
  else if (['SAIDA', 'SAIDA_PRODUCAO', 'SAIDA_MONTAGEM', 'SAIDA_ASSISTENCIA', 'AJUSTE_NEGATIVO', 'SUCATA', 'PERDA'].includes(mov.tipo)) {
    novoSaldo += mov.quantidade;
  }

  await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_atual = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    [novoSaldo, mov.material_id]);
  await dbRun(db, `UPDATE movimentacoes_almoxarifado SET cancelado = 1, cancelado_por = ?, cancelado_em = CURRENT_TIMESTAMP, cancelamento_motivo = ? WHERE id = ?`,
    [user.id, motivo, movimentoId]);

  const estorno = await registrarMovimentacao(db, user, {
    material_id: mov.material_id,
    tipo: 'AJUSTE',
    quantidade: novoSaldo,
    motivo: `Estorno mov. #${movimentoId}`,
    justificativa: motivo,
    documento_vinculado: `ESTORNO-${movimentoId}`,
  });

  await dbRun(db, 'UPDATE movimentacoes_almoxarifado SET movimento_estorno_id = ? WHERE id = ?', [estorno.id, movimentoId]);

  await registrarAuditoria(db, {
    entidade: 'movimentacao', entidade_id: movimentoId, acao: 'CANCELAMENTO',
    usuario_id: user.id, usuario_nome: user.nome || user.email, justificativa: motivo,
  });

  return { success: true, estorno_id: estorno.id };
}

async function criarReserva(db, user, data) {
  const { material_id, quantidade, projeto_id, os_id, os_referencia, cliente_id, equipamento, submontagem, observacoes } = data;
  if (!can(user, 'reservar')) throw Object.assign(new Error('Sem permissão para reservar'), { status: 403 });

  const material = await getMaterial(db, material_id);
  const disponivel = await getSaldoDisponivel(material);
  if (disponivel < quantidade) {
    throw Object.assign(new Error(`Saldo disponível insuficiente: ${disponivel}`), { status: 400 });
  }

  const r = await dbRun(db, `INSERT INTO reservas_material_almoxarifado
    (material_id, quantidade, projeto_id, os_id, os_referencia, cliente_id, equipamento, submontagem,
     solicitante_id, solicitante_nome, observacoes)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`, [
    material_id, quantidade, projeto_id || null, os_id || null, os_referencia || null,
    cliente_id || null, equipamento || null, submontagem || null,
    user.id, user.nome || user.email, observacoes || null,
  ]);

  await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_reservada = COALESCE(quantidade_reservada,0) + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    [quantidade, material_id]);

  await registrarMovimentacao(db, user, {
    material_id, tipo: 'RESERVA', quantidade,
    motivo: 'Reserva por OS/projeto', os_id, projeto_id, cliente_id,
    reserva_id: r.lastID, referencia: os_referencia,
  });

  return { id: r.lastID };
}

async function liberarReserva(db, user, reservaId, quantidade = null) {
  const reserva = await dbGet(db, 'SELECT * FROM reservas_material_almoxarifado WHERE id = ?', [reservaId]);
  if (!reserva || reserva.status !== 'ATIVA') throw Object.assign(new Error('Reserva não encontrada ou inativa'), { status: 404 });

  const qtd = quantidade || (reserva.quantidade - reserva.quantidade_utilizada);
  await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_reservada = MAX(0, COALESCE(quantidade_reservada,0) - ?), updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    [qtd, reserva.material_id]);
  await dbRun(db, 'UPDATE reservas_material_almoxarifado SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    [qtd >= reserva.quantidade - reserva.quantidade_utilizada ? 'LIBERADA' : 'ATIVA', reservaId]);

  await registrarMovimentacao(db, user, {
    material_id: reserva.material_id, tipo: 'LIBERACAO_RESERVA', quantidade: qtd,
    reserva_id: reservaId, os_id: reserva.os_id, projeto_id: reserva.projeto_id,
    motivo: 'Liberação de reserva',
  });

  return { success: true };
}

async function consultarEstoque(db, filters = {}) {
  let sql = `SELECT m.*, c.nome as categoria_nome,
    (m.quantidade_atual - COALESCE(m.quantidade_reservada,0) - COALESCE(m.quantidade_bloqueada,0) - COALESCE(m.quantidade_em_inspecao,0)) as quantidade_disponivel,
    (m.quantidade_atual * COALESCE(m.custo_medio, m.custo_unitario, 0)) as valor_estoque
    FROM materiais_almoxarifado m
    LEFT JOIN categorias_material_almoxarifado c ON m.categoria_id = c.id
    WHERE m.ativo = 1`;
  const params = [];
  if (filters.categoria_id) { sql += ' AND m.categoria_id = ?'; params.push(filters.categoria_id); }
  if (filters.below_minimum) { sql += ' AND m.quantidade_atual <= m.quantidade_minima AND m.quantidade_minima > 0'; }
  if (filters.material_id) { sql += ' AND m.id = ?'; params.push(filters.material_id); }
  sql += ' ORDER BY m.nome';
  return dbAll(db, sql, params);
}

async function consultarSaldosPorLocalizacao(db, materialId) {
  return dbAll(db, `SELECT s.*, l.codigo as localizacao_codigo, l.descricao as localizacao_descricao, l.tipo as localizacao_tipo
    FROM estoque_saldo_almoxarifado s
    LEFT JOIN localizacoes_almoxarifado l ON s.localizacao_id = l.id
    WHERE s.material_id = ?`, [materialId]);
}

module.exports = {
  getConfig,
  getMaterial,
  getSaldoDisponivel,
  syncMaterialTotals,
  getOrCreateSaldo,
  registrarMovimentacao,
  cancelarMovimentacao,
  criarReserva,
  liberarReserva,
  consultarEstoque,
  consultarSaldosPorLocalizacao,
};
