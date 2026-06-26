/**
 * Serviços do módulo Frotas — GMP Industriais
 */

const { dbRun, dbGet, dbAll } = require('./db');

const VEICULO_JOIN = `SELECT v.*, t.nome as tipo_nome, t.categoria as tipo_categoria,
  mot.nome as motorista_nome
  FROM frotas_veiculos v
  LEFT JOIN frotas_tipos_veiculo t ON v.tipo_id = t.id
  LEFT JOIN frotas_motoristas mot ON v.motorista_id = mot.id`;

function normalizePlaca(placa) {
  return String(placa || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function daysUntil(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  return Math.ceil((d - today) / (1000 * 60 * 60 * 24));
}

function buildSearchWhere(fields, search) {
  if (!search) return { clause: '', params: [] };
  const term = `%${search}%`;
  const parts = fields.map((f) => `${f} LIKE ?`);
  return { clause: ` AND (${parts.join(' OR ')})`, params: fields.map(() => term) };
}

async function updateKmVeiculoSeMaior(db, veiculoId, km) {
  if (km == null || Number.isNaN(Number(km))) return;
  const v = await dbGet(db, 'SELECT km_atual, horimetro_atual, tipo_medicao FROM frotas_veiculos WHERE id = ?', [veiculoId]);
  if (!v) return;
  const novoKm = Math.max(Number(v.km_atual) || 0, Number(km));
  await dbRun(db, 'UPDATE frotas_veiculos SET km_atual = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [novoKm, veiculoId]);
}

async function updateHorimetroVeiculoSeMaior(db, veiculoId, horimetro) {
  if (horimetro == null || Number.isNaN(Number(horimetro))) return;
  const v = await dbGet(db, 'SELECT horimetro_atual FROM frotas_veiculos WHERE id = ?', [veiculoId]);
  if (!v) return;
  const novo = Math.max(Number(v.horimetro_atual) || 0, Number(horimetro));
  await dbRun(db, 'UPDATE frotas_veiculos SET horimetro_atual = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [novo, veiculoId]);
}

// ── Meta ─────────────────────────────────────────────────────────────────────

async function getMeta(db) {
  const tipos = await dbAll(db, 'SELECT * FROM frotas_tipos_veiculo WHERE ativo = 1 ORDER BY nome');
  const motoristas = await dbAll(db, "SELECT id, nome FROM frotas_motoristas WHERE ativo = 1 AND status = 'ativo' ORDER BY nome");
  const { SETORES_GMP, CENTROS_CUSTO_GMP, STATUS_VEICULO, TIPOS_COMBUSTIVEL, TIPOS_MANUTENCAO, TIPOS_DOCUMENTO, TIPOS_MEDICAO, STATUS_VIAGEM } = require('./schema');
  return {
    tipos, motoristas, setores: SETORES_GMP, centrosCusto: CENTROS_CUSTO_GMP,
    statusVeiculo: STATUS_VEICULO, combustiveis: TIPOS_COMBUSTIVEL,
    tiposManutencao: TIPOS_MANUTENCAO, tiposDocumento: TIPOS_DOCUMENTO,
    tiposMedicao: TIPOS_MEDICAO, statusViagem: STATUS_VIAGEM,
  };
}

// ── Veículos ─────────────────────────────────────────────────────────────────

async function listVeiculos(db, { search, status } = {}) {
  let sql = `${VEICULO_JOIN} WHERE v.ativo = 1`;
  const params = [];
  const s = buildSearchWhere(['v.placa', 'v.modelo', 'v.marca', 'v.setor_responsavel'], search);
  sql += s.clause;
  params.push(...s.params);
  if (status) {
    sql += ' AND v.status = ?';
    params.push(status);
  }
  sql += ' ORDER BY v.placa';
  return dbAll(db, sql, params);
}

async function getVeiculo(db, id) {
  return dbGet(db, `${VEICULO_JOIN} WHERE v.id = ?`, [id]);
}

async function createVeiculo(db, userOrData, maybeData) {
  const data = maybeData || userOrData;
  const placa = normalizePlaca(data.placa);
  if (!placa) {
    const err = new Error('Placa é obrigatória');
    err.status = 400;
    throw err;
  }
  const exists = await dbGet(db, 'SELECT id FROM frotas_veiculos WHERE placa = ? AND ativo = 1', [placa]);
  if (exists) {
    const err = new Error('Placa já cadastrada');
    err.status = 409;
    throw err;
  }
  const r = await dbRun(db, `INSERT INTO frotas_veiculos
    (placa, modelo, marca, ano, tipo_id, tipo_texto, status, km_atual, horimetro_atual, tipo_medicao,
     combustivel, consumo_medio_esperado, setor_responsavel, centro_custo, motorista_id,
     cor, chassi, renavam, observacoes)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [
    placa, data.modelo || null, data.marca || null, data.ano || null,
    data.tipo_id || null, data.tipo_texto || null, data.status || 'ativo',
    Number(data.km_atual) || 0, Number(data.horimetro_atual) || 0, data.tipo_medicao || 'km',
    data.combustivel || 'diesel', data.consumo_medio_esperado != null ? Number(data.consumo_medio_esperado) : null,
    data.setor_responsavel || null, data.centro_custo || null, data.motorista_id || null,
    data.cor || null, data.chassi || null, data.renavam || null, data.observacoes || null,
  ]);
  return getVeiculo(db, r.lastID);
}

async function updateVeiculo(db, id, data) {
  const current = await getVeiculo(db, id);
  if (!current) {
    const err = new Error('Veículo não encontrado');
    err.status = 404;
    throw err;
  }
  const placa = data.placa != null ? normalizePlaca(data.placa) : current.placa;
  if (placa !== current.placa) {
    const exists = await dbGet(db, 'SELECT id FROM frotas_veiculos WHERE placa = ? AND id != ? AND ativo = 1', [placa, id]);
    if (exists) {
      const err = new Error('Placa já cadastrada');
      err.status = 409;
      throw err;
    }
  }
  await dbRun(db, `UPDATE frotas_veiculos SET
    placa=?, modelo=?, marca=?, ano=?, tipo_id=?, tipo_texto=?, status=?, km_atual=?, horimetro_atual=?,
    tipo_medicao=?, combustivel=?, consumo_medio_esperado=?, setor_responsavel=?, centro_custo=?,
    motorista_id=?, cor=?, chassi=?, renavam=?, observacoes=?,
    updated_at=CURRENT_TIMESTAMP WHERE id=?`, [
    placa, data.modelo ?? current.modelo, data.marca ?? current.marca, data.ano ?? current.ano,
    data.tipo_id ?? current.tipo_id, data.tipo_texto ?? current.tipo_texto,
    data.status ?? current.status, data.km_atual != null ? Number(data.km_atual) : current.km_atual,
    data.horimetro_atual != null ? Number(data.horimetro_atual) : current.horimetro_atual,
    data.tipo_medicao ?? current.tipo_medicao ?? 'km',
    data.combustivel ?? current.combustivel,
    data.consumo_medio_esperado != null ? Number(data.consumo_medio_esperado) : current.consumo_medio_esperado,
    data.setor_responsavel ?? current.setor_responsavel, data.centro_custo ?? current.centro_custo,
    data.motorista_id ?? current.motorista_id,
    data.cor ?? current.cor, data.chassi ?? current.chassi, data.renavam ?? current.renavam,
    data.observacoes ?? current.observacoes, id,
  ]);
  return getVeiculo(db, id);
}

async function deleteVeiculo(db, id) {
  await dbRun(db, 'UPDATE frotas_veiculos SET ativo = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [id]);
  return { success: true };
}

// ── Motoristas ───────────────────────────────────────────────────────────────

async function listMotoristas(db, { search, status } = {}) {
  let sql = 'SELECT * FROM frotas_motoristas WHERE ativo = 1';
  const params = [];
  const s = buildSearchWhere(['nome', 'cpf', 'cnh_numero', 'setor'], search);
  sql += s.clause;
  params.push(...s.params);
  if (status) {
    sql += ' AND status = ?';
    params.push(status);
  }
  sql += ' ORDER BY nome';
  return dbAll(db, sql, params);
}

async function getMotorista(db, id) {
  return dbGet(db, 'SELECT * FROM frotas_motoristas WHERE id = ? AND ativo = 1', [id]);
}

async function createMotorista(db, userOrData, maybeData) {
  const data = maybeData || userOrData;
  if (!data.nome) {
    const err = new Error('Nome é obrigatório');
    err.status = 400;
    throw err;
  }
  const r = await dbRun(db, `INSERT INTO frotas_motoristas
    (nome, cpf, usuario_id, cnh_numero, cnh_categoria, cnh_validade, telefone, email, setor, status, observacoes)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`, [
    data.nome, data.cpf || null, data.usuario_id || null, data.cnh_numero || null,
    data.cnh_categoria || null, data.cnh_validade || null, data.telefone || null,
    data.email || null, data.setor || null, data.status || 'ativo', data.observacoes || null,
  ]);
  return getMotorista(db, r.lastID);
}

async function updateMotorista(db, id, data) {
  const current = await getMotorista(db, id);
  if (!current) {
    const err = new Error('Motorista não encontrado');
    err.status = 404;
    throw err;
  }
  await dbRun(db, `UPDATE frotas_motoristas SET
    nome=?, cpf=?, usuario_id=?, cnh_numero=?, cnh_categoria=?, cnh_validade=?,
    telefone=?, email=?, setor=?, status=?, observacoes=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`, [
    data.nome ?? current.nome, data.cpf ?? current.cpf, data.usuario_id ?? current.usuario_id,
    data.cnh_numero ?? current.cnh_numero, data.cnh_categoria ?? current.cnh_categoria,
    data.cnh_validade ?? current.cnh_validade, data.telefone ?? current.telefone,
    data.email ?? current.email, data.setor ?? current.setor, data.status ?? current.status,
    data.observacoes ?? current.observacoes, id,
  ]);
  return getMotorista(db, id);
}

async function deleteMotorista(db, id) {
  await dbRun(db, 'UPDATE frotas_motoristas SET ativo = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [id]);
  return { success: true };
}

// ── Manutenções ──────────────────────────────────────────────────────────────

async function listManutencoes(db, { search, veiculo_id, tipo } = {}) {
  let sql = `SELECT m.*, v.placa, v.modelo as veiculo_modelo
    FROM frotas_manutencoes m
    JOIN frotas_veiculos v ON m.veiculo_id = v.id
    WHERE 1=1`;
  const params = [];
  if (veiculo_id) {
    sql += ' AND m.veiculo_id = ?';
    params.push(veiculo_id);
  }
  if (tipo) {
    sql += ' AND m.tipo = ?';
    params.push(tipo);
  }
  const s = buildSearchWhere(['m.descricao', 'm.oficina', 'v.placa'], search);
  sql += s.clause;
  params.push(...s.params);
  sql += ' ORDER BY m.data_manutencao DESC, m.id DESC';
  return dbAll(db, sql, params);
}

async function createManutencao(db, user, data) {
  if (!data.veiculo_id || !data.descricao) {
    const err = new Error('Veículo e descrição são obrigatórios');
    err.status = 400;
    throw err;
  }
  const r = await dbRun(db, `INSERT INTO frotas_manutencoes
    (veiculo_id, tipo, descricao, oficina, custo, pecas_descricao, km_manutencao, data_manutencao,
     proxima_revisao_km, proxima_revisao_data, status, usuario_id, usuario_nome, observacoes, requisicao_almox_id)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [
    data.veiculo_id, data.tipo || 'preventiva', data.descricao, data.oficina || null,
    Number(data.custo) || 0, data.pecas_descricao || null, data.km_manutencao != null ? Number(data.km_manutencao) : null,
    data.data_manutencao || new Date().toISOString().slice(0, 10),
    data.proxima_revisao_km != null ? Number(data.proxima_revisao_km) : null,
    data.proxima_revisao_data || null, data.status || 'concluida',
    user?.id || null, user?.nome || user?.name || null, data.observacoes || null,
    data.requisicao_almox_id || null,
  ]);
  if (data.km_manutencao != null) {
    await updateKmVeiculoSeMaior(db, data.veiculo_id, data.km_manutencao);
  }
  if (data.status === 'em_andamento') {
    await dbRun(db, "UPDATE frotas_veiculos SET status = 'manutencao', updated_at = CURRENT_TIMESTAMP WHERE id = ?", [data.veiculo_id]);
  }
  return dbGet(db, 'SELECT * FROM frotas_manutencoes WHERE id = ?', [r.lastID]);
}

async function updateManutencao(db, id, data) {
  const current = await dbGet(db, 'SELECT * FROM frotas_manutencoes WHERE id = ?', [id]);
  if (!current) {
    const err = new Error('Manutenção não encontrada');
    err.status = 404;
    throw err;
  }
  await dbRun(db, `UPDATE frotas_manutencoes SET
    veiculo_id=?, tipo=?, descricao=?, oficina=?, custo=?, pecas_descricao=?, km_manutencao=?,
    data_manutencao=?, proxima_revisao_km=?, proxima_revisao_data=?, status=?, observacoes=?,
    requisicao_almox_id=?
    WHERE id=?`, [
    data.veiculo_id ?? current.veiculo_id, data.tipo ?? current.tipo, data.descricao ?? current.descricao,
    data.oficina ?? current.oficina, data.custo != null ? Number(data.custo) : current.custo,
    data.pecas_descricao ?? current.pecas_descricao,
    data.km_manutencao != null ? Number(data.km_manutencao) : current.km_manutencao,
    data.data_manutencao ?? current.data_manutencao,
    data.proxima_revisao_km != null ? Number(data.proxima_revisao_km) : current.proxima_revisao_km,
    data.proxima_revisao_data ?? current.proxima_revisao_data, data.status ?? current.status,
    data.observacoes ?? current.observacoes,
    data.requisicao_almox_id ?? current.requisicao_almox_id, id,
  ]);
  return dbGet(db, 'SELECT * FROM frotas_manutencoes WHERE id = ?', [id]);
}

async function deleteManutencao(db, id) {
  await dbRun(db, 'DELETE FROM frotas_manutencoes WHERE id = ?', [id]);
  return { success: true };
}

// ── Abastecimentos ───────────────────────────────────────────────────────────

async function listAbastecimentos(db, { search, veiculo_id } = {}) {
  let sql = `SELECT a.*, v.placa, m.nome as motorista_nome
    FROM frotas_abastecimentos a
    JOIN frotas_veiculos v ON a.veiculo_id = v.id
    LEFT JOIN frotas_motoristas m ON a.motorista_id = m.id
    WHERE 1=1`;
  const params = [];
  if (veiculo_id) {
    sql += ' AND a.veiculo_id = ?';
    params.push(veiculo_id);
  }
  const s = buildSearchWhere(['v.placa', 'a.posto'], search);
  sql += s.clause;
  params.push(...s.params);
  sql += ' ORDER BY a.data_abastecimento DESC, a.id DESC';
  return dbAll(db, sql, params);
}

async function calcConsumoMedio(db, veiculoId, kmAtual, litros) {
  const prev = await dbGet(db,
    `SELECT km_abastecimento, litros FROM frotas_abastecimentos
     WHERE veiculo_id = ? AND km_abastecimento IS NOT NULL ORDER BY data_abastecimento DESC, id DESC LIMIT 1`,
    [veiculoId]);
  if (!prev || prev.km_abastecimento == null || !litros) return null;
  const kmDiff = Number(kmAtual) - Number(prev.km_abastecimento);
  if (kmDiff <= 0) return null;
  return Math.round((kmDiff / Number(litros)) * 100) / 100;
}

async function createAbastecimento(db, user, data) {
  if (!data.veiculo_id || !data.litros || !data.data_abastecimento) {
    const err = new Error('Veículo, litros e data são obrigatórios');
    err.status = 400;
    throw err;
  }
  const litros = Number(data.litros);
  const valorTotal = Number(data.valor_total) || 0;
  const valorLitro = data.valor_litro != null ? Number(data.valor_litro) : (litros > 0 ? valorTotal / litros : 0);
  const consumo = data.km_abastecimento != null
    ? await calcConsumoMedio(db, data.veiculo_id, data.km_abastecimento, litros)
    : null;
  const r = await dbRun(db, `INSERT INTO frotas_abastecimentos
    (veiculo_id, motorista_id, data_abastecimento, litros, valor_total, valor_litro, posto,
     km_abastecimento, combustivel_tipo, consumo_medio, observacoes, usuario_id, usuario_nome)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`, [
    data.veiculo_id, data.motorista_id || null, data.data_abastecimento, litros, valorTotal, valorLitro,
    data.posto || null, data.km_abastecimento != null ? Number(data.km_abastecimento) : null,
    data.combustivel_tipo || null, consumo, data.observacoes || null,
    user?.id || null, user?.nome || user?.name || null,
  ]);
  if (data.km_abastecimento != null) {
    await updateKmVeiculoSeMaior(db, data.veiculo_id, data.km_abastecimento);
  }
  return dbGet(db, 'SELECT * FROM frotas_abastecimentos WHERE id = ?', [r.lastID]);
}

async function updateAbastecimento(db, id, data) {
  const current = await dbGet(db, 'SELECT * FROM frotas_abastecimentos WHERE id = ?', [id]);
  if (!current) {
    const err = new Error('Abastecimento não encontrado');
    err.status = 404;
    throw err;
  }
  const litros = data.litros != null ? Number(data.litros) : current.litros;
  const valorTotal = data.valor_total != null ? Number(data.valor_total) : current.valor_total;
  const valorLitro = data.valor_litro != null ? Number(data.valor_litro) : current.valor_litro;
  const km = data.km_abastecimento != null ? Number(data.km_abastecimento) : current.km_abastecimento;
  const veiculoId = data.veiculo_id ?? current.veiculo_id;
  const consumo = km != null ? await calcConsumoMedio(db, veiculoId, km, litros) : current.consumo_medio;
  await dbRun(db, `UPDATE frotas_abastecimentos SET
    veiculo_id=?, motorista_id=?, data_abastecimento=?, litros=?, valor_total=?, valor_litro=?,
    posto=?, km_abastecimento=?, combustivel_tipo=?, consumo_medio=?, observacoes=? WHERE id=?`, [
    veiculoId, data.motorista_id ?? current.motorista_id, data.data_abastecimento ?? current.data_abastecimento,
    litros, valorTotal, valorLitro, data.posto ?? current.posto, km,
    data.combustivel_tipo ?? current.combustivel_tipo, consumo, data.observacoes ?? current.observacoes, id,
  ]);
  return dbGet(db, 'SELECT * FROM frotas_abastecimentos WHERE id = ?', [id]);
}

async function deleteAbastecimento(db, id) {
  await dbRun(db, 'DELETE FROM frotas_abastecimentos WHERE id = ?', [id]);
  return { success: true };
}

// ── Multas ───────────────────────────────────────────────────────────────────

async function listMultas(db, { search, veiculo_id, status_pagamento } = {}) {
  let sql = `SELECT mu.*, v.placa, mot.nome as motorista_nome
    FROM frotas_multas mu
    JOIN frotas_veiculos v ON mu.veiculo_id = v.id
    LEFT JOIN frotas_motoristas mot ON mu.motorista_id = mot.id
    WHERE 1=1`;
  const params = [];
  if (veiculo_id) { sql += ' AND mu.veiculo_id = ?'; params.push(veiculo_id); }
  if (status_pagamento) { sql += ' AND mu.status_pagamento = ?'; params.push(status_pagamento); }
  const s = buildSearchWhere(['mu.descricao', 'v.placa', 'mu.numero_auto'], search);
  sql += s.clause;
  params.push(...s.params);
  sql += ' ORDER BY mu.data_infracao DESC';
  return dbAll(db, sql, params);
}

async function createMulta(db, data) {
  if (!data.veiculo_id) {
    const err = new Error('Veículo é obrigatório');
    err.status = 400;
    throw err;
  }
  const r = await dbRun(db, `INSERT INTO frotas_multas
    (veiculo_id, motorista_id, data_infracao, descricao, valor, pontos, status_pagamento,
     data_vencimento, data_pagamento, numero_auto, observacoes)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`, [
    data.veiculo_id, data.motorista_id || null, data.data_infracao || null, data.descricao || null,
    Number(data.valor) || 0, Number(data.pontos) || 0, data.status_pagamento || 'pendente',
    data.data_vencimento || null, data.data_pagamento || null, data.numero_auto || null, data.observacoes || null,
  ]);
  return dbGet(db, 'SELECT * FROM frotas_multas WHERE id = ?', [r.lastID]);
}

async function updateMulta(db, id, data) {
  const current = await dbGet(db, 'SELECT * FROM frotas_multas WHERE id = ?', [id]);
  if (!current) {
    const err = new Error('Multa não encontrada');
    err.status = 404;
    throw err;
  }
  await dbRun(db, `UPDATE frotas_multas SET
    veiculo_id=?, motorista_id=?, data_infracao=?, descricao=?, valor=?, pontos=?,
    status_pagamento=?, data_vencimento=?, data_pagamento=?, numero_auto=?, observacoes=? WHERE id=?`, [
    data.veiculo_id ?? current.veiculo_id, data.motorista_id ?? current.motorista_id,
    data.data_infracao ?? current.data_infracao, data.descricao ?? current.descricao,
    data.valor != null ? Number(data.valor) : current.valor,
    data.pontos != null ? Number(data.pontos) : current.pontos,
    data.status_pagamento ?? current.status_pagamento, data.data_vencimento ?? current.data_vencimento,
    data.data_pagamento ?? current.data_pagamento, data.numero_auto ?? current.numero_auto,
    data.observacoes ?? current.observacoes, id,
  ]);
  return dbGet(db, 'SELECT * FROM frotas_multas WHERE id = ?', [id]);
}

async function deleteMulta(db, id) {
  await dbRun(db, 'DELETE FROM frotas_multas WHERE id = ?', [id]);
  return { success: true };
}

// ── Documentos ─────────────────────────────────────────────────────────────

async function listDocumentos(db, { search, veiculo_id, tipo, vencendo } = {}) {
  let sql = `SELECT d.*, v.placa FROM frotas_documentos d
    JOIN frotas_veiculos v ON d.veiculo_id = v.id WHERE 1=1`;
  const params = [];
  if (veiculo_id) { sql += ' AND d.veiculo_id = ?'; params.push(veiculo_id); }
  if (tipo) { sql += ' AND d.tipo = ?'; params.push(tipo); }
  if (vencendo === '1' || vencendo === 'true') {
    sql += ` AND d.data_vencimento IS NOT NULL
      AND date(d.data_vencimento) <= date('now', '+' || COALESCE(d.alerta_dias_antes, 30) || ' days')`;
  }
  const s = buildSearchWhere(['d.descricao', 'v.placa', 'd.numero_documento'], search);
  sql += s.clause;
  params.push(...s.params);
  sql += ' ORDER BY d.data_vencimento ASC';
  return dbAll(db, sql, params);
}

async function createDocumento(db, data) {
  if (!data.veiculo_id || !data.tipo) {
    const err = new Error('Veículo e tipo são obrigatórios');
    err.status = 400;
    throw err;
  }
  const r = await dbRun(db, `INSERT INTO frotas_documentos
    (veiculo_id, tipo, descricao, numero_documento, seguradora, valor, data_emissao,
     data_vencimento, alerta_dias_antes, status, observacoes)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`, [
    data.veiculo_id, data.tipo, data.descricao || null, data.numero_documento || null,
    data.seguradora || null, Number(data.valor) || 0, data.data_emissao || null,
    data.data_vencimento || null, data.alerta_dias_antes != null ? Number(data.alerta_dias_antes) : 30,
    data.status || 'ativo', data.observacoes || null,
  ]);
  return dbGet(db, 'SELECT * FROM frotas_documentos WHERE id = ?', [r.lastID]);
}

async function updateDocumento(db, id, data) {
  const current = await dbGet(db, 'SELECT * FROM frotas_documentos WHERE id = ?', [id]);
  if (!current) {
    const err = new Error('Documento não encontrado');
    err.status = 404;
    throw err;
  }
  await dbRun(db, `UPDATE frotas_documentos SET
    veiculo_id=?, tipo=?, descricao=?, numero_documento=?, seguradora=?, valor=?,
    data_emissao=?, data_vencimento=?, alerta_dias_antes=?, status=?, observacoes=?,
    updated_at=CURRENT_TIMESTAMP WHERE id=?`, [
    data.veiculo_id ?? current.veiculo_id, data.tipo ?? current.tipo, data.descricao ?? current.descricao,
    data.numero_documento ?? current.numero_documento, data.seguradora ?? current.seguradora,
    data.valor != null ? Number(data.valor) : current.valor, data.data_emissao ?? current.data_emissao,
    data.data_vencimento ?? current.data_vencimento,
    data.alerta_dias_antes != null ? Number(data.alerta_dias_antes) : current.alerta_dias_antes,
    data.status ?? current.status, data.observacoes ?? current.observacoes, id,
  ]);
  return dbGet(db, 'SELECT * FROM frotas_documentos WHERE id = ?', [id]);
}

async function deleteDocumento(db, id) {
  await dbRun(db, 'DELETE FROM frotas_documentos WHERE id = ?', [id]);
  return { success: true };
}

// ── Viagens ──────────────────────────────────────────────────────────────────

async function listViagens(db, { search, veiculo_id, status } = {}) {
  let sql = `SELECT vi.*, v.placa, m.nome as motorista_nome
    FROM frotas_viagens vi
    JOIN frotas_veiculos v ON vi.veiculo_id = v.id
    LEFT JOIN frotas_motoristas m ON vi.motorista_id = m.id
    WHERE 1=1`;
  const params = [];
  if (veiculo_id) { sql += ' AND vi.veiculo_id = ?'; params.push(veiculo_id); }
  if (status) { sql += ' AND vi.status = ?'; params.push(status); }
  const s = buildSearchWhere(['vi.destino', 'vi.finalidade', 'v.placa'], search);
  sql += s.clause;
  params.push(...s.params);
  sql += ' ORDER BY vi.data_saida DESC, vi.id DESC';
  return dbAll(db, sql, params);
}

async function createViagem(db, user, data) {
  if (!data.veiculo_id) {
    const err = new Error('Veículo é obrigatório');
    err.status = 400;
    throw err;
  }
  const r = await dbRun(db, `INSERT INTO frotas_viagens
    (veiculo_id, motorista_id, data_saida, data_retorno, km_saida, km_retorno, km_rodado,
     destino, finalidade, setor, status, observacoes, solicitante_id, solicitante_nome)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [
    data.veiculo_id, data.motorista_id || null, data.data_saida || null, data.data_retorno || null,
    data.km_saida != null ? Number(data.km_saida) : null, data.km_retorno != null ? Number(data.km_retorno) : null,
    data.km_rodado != null ? Number(data.km_rodado) : null, data.destino || null, data.finalidade || null,
    data.setor || null, data.status || 'solicitada', data.observacoes || null,
    user?.id || null, user?.nome || user?.name || null,
  ]);
  return dbGet(db, 'SELECT * FROM frotas_viagens WHERE id = ?', [r.lastID]);
}

async function updateViagem(db, id, data) {
  const current = await dbGet(db, 'SELECT * FROM frotas_viagens WHERE id = ?', [id]);
  if (!current) {
    const err = new Error('Viagem não encontrada');
    err.status = 404;
    throw err;
  }
  let kmRodado = data.km_rodado;
  const kmSaida = data.km_saida != null ? Number(data.km_saida) : current.km_saida;
  const kmRetorno = data.km_retorno != null ? Number(data.km_retorno) : current.km_retorno;
  if (kmRodado == null && kmSaida != null && kmRetorno != null) {
    kmRodado = kmRetorno - kmSaida;
  }
  await dbRun(db, `UPDATE frotas_viagens SET
    veiculo_id=?, motorista_id=?, data_saida=?, data_retorno=?, km_saida=?, km_retorno=?, km_rodado=?,
    destino=?, finalidade=?, setor=?, status=?, observacoes=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`, [
    data.veiculo_id ?? current.veiculo_id, data.motorista_id ?? current.motorista_id,
    data.data_saida ?? current.data_saida, data.data_retorno ?? current.data_retorno,
    kmSaida, kmRetorno, kmRodado != null ? kmRodado : current.km_rodado,
    data.destino ?? current.destino, data.finalidade ?? current.finalidade, data.setor ?? current.setor,
    data.status ?? current.status, data.observacoes ?? current.observacoes, id,
  ]);
  const veiculoId = data.veiculo_id ?? current.veiculo_id;
  if (kmRetorno != null) {
    await updateKmVeiculoSeMaior(db, veiculoId, kmRetorno);
  }
  return dbGet(db, 'SELECT * FROM frotas_viagens WHERE id = ?', [id]);
}

async function aprovarViagem(db, id, user) {
  const viagem = await dbGet(db, 'SELECT * FROM frotas_viagens WHERE id = ?', [id]);
  if (!viagem) {
    const err = new Error('Viagem não encontrada');
    err.status = 404;
    throw err;
  }
  await dbRun(db, `UPDATE frotas_viagens SET status='aprovada', aprovador_id=?, aprovador_nome=?,
    data_aprovacao=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE id=?`, [
    user?.id || null, user?.nome || user?.name || null, id,
  ]);
  return dbGet(db, 'SELECT * FROM frotas_viagens WHERE id = ?', [id]);
}

async function deleteViagem(db, id) {
  await dbRun(db, 'DELETE FROM frotas_viagens WHERE id = ?', [id]);
  return { success: true };
}

// ── Checklists ───────────────────────────────────────────────────────────────

async function listChecklists(db, { search, veiculo_id } = {}) {
  let sql = `SELECT c.*, v.placa, m.nome as motorista_nome
    FROM frotas_checklists c
    JOIN frotas_veiculos v ON c.veiculo_id = v.id
    LEFT JOIN frotas_motoristas m ON c.motorista_id = m.id
    WHERE 1=1`;
  const params = [];
  if (veiculo_id) { sql += ' AND c.veiculo_id = ?'; params.push(veiculo_id); }
  const s = buildSearchWhere(['v.placa', 'c.observacoes'], search);
  sql += s.clause;
  params.push(...s.params);
  sql += ' ORDER BY c.data_checklist DESC, c.id DESC';
  return dbAll(db, sql, params);
}

async function createChecklist(db, user, data) {
  if (!data.veiculo_id || !data.data_checklist) {
    const err = new Error('Veículo e data são obrigatórios');
    err.status = 400;
    throw err;
  }
  const bool = (v, def = 1) => (v === 0 || v === false ? 0 : v === 1 || v === true ? 1 : def);
  const items = ['pneus_ok', 'oleo_ok', 'luzes_ok', 'freios_ok', 'extintor_ok', 'documentos_ok', 'limpeza_ok'];
  const vals = items.map((k) => bool(data[k]));
  const aprovado = vals.every((v) => v === 1) ? 1 : 0;
  const r = await dbRun(db, `INSERT INTO frotas_checklists
    (veiculo_id, motorista_id, data_checklist, pneus_ok, oleo_ok, luzes_ok, freios_ok,
     extintor_ok, documentos_ok, limpeza_ok, observacoes, aprovado, usuario_id, usuario_nome)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [
    data.veiculo_id, data.motorista_id || null, data.data_checklist,
    ...vals, data.observacoes || null, aprovado,
    user?.id || null, user?.nome || user?.name || null,
  ]);
  return dbGet(db, 'SELECT * FROM frotas_checklists WHERE id = ?', [r.lastID]);
}

async function deleteChecklist(db, id) {
  await dbRun(db, 'DELETE FROM frotas_checklists WHERE id = ?', [id]);
  return { success: true };
}

// ── Dashboard e alertas ──────────────────────────────────────────────────────

async function getAlertas(db) {
  const alertas = [];

  const docs = await dbAll(db, `SELECT d.*, v.placa FROM frotas_documentos d
    JOIN frotas_veiculos v ON d.veiculo_id = v.id
    WHERE d.data_vencimento IS NOT NULL
    AND date(d.data_vencimento) <= date('now', '+' || COALESCE(d.alerta_dias_antes, 30) || ' days')
    AND d.status = 'ativo' ORDER BY d.data_vencimento`);
  docs.forEach((d) => {
    const dias = daysUntil(d.data_vencimento);
    alertas.push({
      tipo: 'documento',
      severidade: dias != null && dias < 0 ? 'critico' : dias != null && dias <= 7 ? 'alto' : 'medio',
      titulo: `${d.tipo.toUpperCase()} — ${d.placa}`,
      descricao: d.descricao || d.numero_documento || 'Documento vencendo',
      data: d.data_vencimento,
      dias_restantes: dias,
      referencia_id: d.id,
      veiculo_id: d.veiculo_id,
    });
  });

  const motoristas = await dbAll(db, `SELECT * FROM frotas_motoristas
    WHERE ativo = 1 AND status = 'ativo' AND cnh_validade IS NOT NULL
    AND date(cnh_validade) <= date('now', '+30 days') ORDER BY cnh_validade`);
  motoristas.forEach((m) => {
    const dias = daysUntil(m.cnh_validade);
    alertas.push({
      tipo: 'cnh',
      severidade: dias != null && dias < 0 ? 'critico' : 'alto',
      titulo: `CNH — ${m.nome}`,
      descricao: `Categoria ${m.cnh_categoria || '-'} vence em ${m.cnh_validade}`,
      data: m.cnh_validade,
      dias_restantes: dias,
      referencia_id: m.id,
    });
  });

  const manutencoes = await dbAll(db, `SELECT m.*, v.placa, v.km_atual FROM frotas_manutencoes m
    JOIN frotas_veiculos v ON m.veiculo_id = v.id
    WHERE (m.proxima_revisao_data IS NOT NULL AND date(m.proxima_revisao_data) <= date('now', '+15 days'))
       OR (m.proxima_revisao_km IS NOT NULL AND v.km_atual >= m.proxima_revisao_km - 500)
    ORDER BY m.proxima_revisao_data`);
  manutencoes.forEach((m) => {
    const dias = daysUntil(m.proxima_revisao_data);
    const kmRestante = m.proxima_revisao_km != null ? m.proxima_revisao_km - (m.km_atual || 0) : null;
    alertas.push({
      tipo: 'manutencao',
      severidade: (dias != null && dias < 0) || (kmRestante != null && kmRestante <= 0) ? 'critico' : 'medio',
      titulo: `Manutenção — ${m.placa}`,
      descricao: m.descricao,
      data: m.proxima_revisao_data,
      dias_restantes: dias,
      km_restante: kmRestante,
      referencia_id: m.id,
      veiculo_id: m.veiculo_id,
    });
  });

  const multas = await dbAll(db, `SELECT mu.*, v.placa FROM frotas_multas mu
    JOIN frotas_veiculos v ON mu.veiculo_id = v.id
    WHERE mu.status_pagamento = 'pendente' AND mu.data_vencimento IS NOT NULL
    AND date(mu.data_vencimento) <= date('now', '+15 days')`);
  multas.forEach((mu) => {
    alertas.push({
      tipo: 'multa',
      severidade: 'alto',
      titulo: `Multa pendente — ${mu.placa}`,
      descricao: mu.descricao || mu.numero_auto,
      data: mu.data_vencimento,
      dias_restantes: daysUntil(mu.data_vencimento),
      referencia_id: mu.id,
      veiculo_id: mu.veiculo_id,
    });
  });

  const consumoAnomalo = await dbAll(db, `SELECT v.id as veiculo_id, v.placa, v.consumo_medio_esperado,
    AVG(a.consumo_medio) as consumo_recente
    FROM frotas_abastecimentos a
    JOIN frotas_veiculos v ON a.veiculo_id = v.id
    WHERE a.consumo_medio IS NOT NULL AND v.ativo = 1
    AND a.data_abastecimento >= date('now', '-60 days')
    GROUP BY v.id
    HAVING v.consumo_medio_esperado IS NOT NULL AND consumo_recente < v.consumo_medio_esperado * 0.7`);
  consumoAnomalo.forEach((c) => {
    alertas.push({
      tipo: 'consumo',
      severidade: 'medio',
      titulo: `Consumo baixo — ${c.placa}`,
      descricao: `Média recente ${Number(c.consumo_recente).toFixed(1)} km/L${c.consumo_medio_esperado ? ` (esperado ${c.consumo_medio_esperado} km/L)` : ''}`,
      referencia_id: c.veiculo_id,
      veiculo_id: c.veiculo_id,
    });
  });

  return alertas.sort((a, b) => {
    const order = { critico: 0, alto: 1, medio: 2 };
    return (order[a.severidade] ?? 3) - (order[b.severidade] ?? 3);
  });
}

async function getDashboard(db) {
  const [veiculoStats, custos, counters, manutencoesVencidas, alertas, ultimosAbastecimentos] = await Promise.all([
    dbGet(db, `SELECT
      SUM(CASE WHEN status = 'ativo' THEN 1 ELSE 0 END) as veiculosAtivos,
      SUM(CASE WHEN status = 'manutencao' THEN 1 ELSE 0 END) as veiculosManutencao,
      SUM(CASE WHEN status = 'inativo' THEN 1 ELSE 0 END) as veiculosInativos,
      SUM(CASE WHEN status = 'vendido' THEN 1 ELSE 0 END) as veiculosVendidos,
      COUNT(*) as totalVeiculos
      FROM frotas_veiculos WHERE ativo = 1`),
    dbGet(db, `SELECT
      COALESCE((SELECT SUM(custo) FROM frotas_manutencoes), 0) as manutencao,
      COALESCE((SELECT SUM(valor_total) FROM frotas_abastecimentos), 0) as combustivel,
      COALESCE((SELECT SUM(valor) FROM frotas_multas WHERE status_pagamento != 'contestado'), 0) as multas,
      COALESCE((SELECT SUM(valor) FROM frotas_documentos), 0) as documentos`),
    dbGet(db, `SELECT
      (SELECT COALESCE(SUM(valor_total), 0) FROM frotas_abastecimentos
        WHERE strftime('%Y-%m', data_abastecimento) = strftime('%Y-%m', 'now')) as custoCombustivelMes,
      (SELECT COUNT(*) FROM frotas_manutencoes WHERE status IN ('agendada','em_andamento')) as osAbertas,
      (SELECT COUNT(*) FROM frotas_viagens WHERE status IN ('solicitada','aprovada','em_andamento')) as viagensAbertas,
      (SELECT COUNT(*) FROM frotas_checklists WHERE date(data_checklist) = date('now')) as checklistsHoje`),
    dbGet(db, `SELECT COUNT(DISTINCT m.veiculo_id) as total
      FROM frotas_manutencoes m
      JOIN frotas_veiculos v ON m.veiculo_id = v.id
      WHERE (m.proxima_revisao_data IS NOT NULL AND date(m.proxima_revisao_data) < date('now'))
         OR (m.proxima_revisao_km IS NOT NULL AND v.km_atual >= m.proxima_revisao_km)`),
    getAlertas(db),
    dbAll(db, `SELECT a.*, v.placa FROM frotas_abastecimentos a
      JOIN frotas_veiculos v ON a.veiculo_id = v.id ORDER BY a.data_abastecimento DESC LIMIT 5`),
  ]);

  const custoTotal = (custos?.manutencao || 0) + (custos?.combustivel || 0) + (custos?.multas || 0) + (custos?.documentos || 0);

  return {
    veiculosAtivos: veiculoStats?.veiculosAtivos || 0,
    veiculosManutencao: veiculoStats?.veiculosManutencao || 0,
    veiculosInativos: veiculoStats?.veiculosInativos || 0,
    totalVeiculos: veiculoStats?.totalVeiculos || 0,
    custoManutencao: custos?.manutencao || 0,
    custoCombustivel: custos?.combustivel || 0,
    custoMultas: custos?.multas || 0,
    custoDocumentos: custos?.documentos || 0,
    custoTotal,
    custoCombustivelMes: counters?.custoCombustivelMes || 0,
    osAbertas: counters?.osAbertas || 0,
    manutencoesVencidas: manutencoesVencidas?.total || 0,
    alertasCount: alertas.length,
    alertas: alertas.slice(0, 15),
    viagensAbertas: counters?.viagensAbertas || 0,
    checklistsHoje: counters?.checklistsHoje || 0,
    ultimosAbastecimentos,
  };
}

// ── Relatórios ───────────────────────────────────────────────────────────────

async function relatorioCustosPorVeiculo(db, { data_inicio, data_fim } = {}) {
  const dateFilterMan = data_inicio && data_fim
    ? ' AND date(data_manutencao) BETWEEN date(?) AND date(?)'
    : '';
  const dateFilterAbs = data_inicio && data_fim
    ? ' AND date(data_abastecimento) BETWEEN date(?) AND date(?)'
    : '';
  const dateParams = data_inicio && data_fim ? [data_inicio, data_fim] : [];

  const rows = await dbAll(db, `SELECT
      v.id, v.placa, v.modelo, v.marca, v.setor_responsavel, v.km_atual,
      COALESCE(man.total, 0) as custo_manutencao,
      COALESCE(abs.total, 0) as custo_combustivel,
      COALESCE(mul.total, 0) as custo_multas
    FROM frotas_veiculos v
    LEFT JOIN (
      SELECT veiculo_id, SUM(custo) as total FROM frotas_manutencoes WHERE 1=1${dateFilterMan} GROUP BY veiculo_id
    ) man ON man.veiculo_id = v.id
    LEFT JOIN (
      SELECT veiculo_id, SUM(valor_total) as total FROM frotas_abastecimentos WHERE 1=1${dateFilterAbs} GROUP BY veiculo_id
    ) abs ON abs.veiculo_id = v.id
    LEFT JOIN (
      SELECT veiculo_id, SUM(valor) as total FROM frotas_multas GROUP BY veiculo_id
    ) mul ON mul.veiculo_id = v.id
    WHERE v.ativo = 1
    ORDER BY v.placa`,
  [...dateParams, ...dateParams]);

  return rows.map((r) => ({
    id: r.id,
    placa: r.placa,
    modelo: r.modelo,
    marca: r.marca,
    setor_responsavel: r.setor_responsavel,
    custo_manutencao: r.custo_manutencao || 0,
    custo_combustivel: r.custo_combustivel || 0,
    custo_multas: r.custo_multas || 0,
    custo_total: (r.custo_manutencao || 0) + (r.custo_combustivel || 0) + (r.custo_multas || 0),
    km_atual: r.km_atual,
  }));
}

async function relatorioConsumo(db, { veiculo_id } = {}) {
  let sql = `SELECT a.veiculo_id, v.placa, AVG(a.consumo_medio) as consumo_medio,
    SUM(a.litros) as total_litros, SUM(a.valor_total) as total_gasto, COUNT(*) as abastecimentos
    FROM frotas_abastecimentos a
    JOIN frotas_veiculos v ON a.veiculo_id = v.id
    WHERE a.consumo_medio IS NOT NULL`;
  const params = [];
  if (veiculo_id) { sql += ' AND a.veiculo_id = ?'; params.push(veiculo_id); }
  sql += ' GROUP BY a.veiculo_id ORDER BY consumo_medio DESC';
  return dbAll(db, sql, params);
}

module.exports = {
  getMeta,
  listVeiculos, getVeiculo, createVeiculo, updateVeiculo, deleteVeiculo,
  listMotoristas, getMotorista, createMotorista, updateMotorista, deleteMotorista,
  listManutencoes, createManutencao, updateManutencao, deleteManutencao,
  listAbastecimentos, createAbastecimento, updateAbastecimento, deleteAbastecimento,
  listMultas, createMulta, updateMulta, deleteMulta,
  listDocumentos, createDocumento, updateDocumento, deleteDocumento,
  listViagens, createViagem, updateViagem, aprovarViagem, deleteViagem,
  listChecklists, createChecklist, deleteChecklist,
  getDashboard, getAlertas,
  relatorioCustosPorVeiculo, relatorioConsumo,
};
