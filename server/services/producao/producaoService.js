/**
 * Serviços do módulo Produção — GMP Industriais
 */

const { dbRun, dbGet, dbAll } = require('./db');
const { STATUS_OP, PRIORIDADES, STATUS_MAQUINA, SETORES_GMP } = require('./schema');

const OP_JOIN = `SELECT o.*, m.codigo as maquina_codigo, m.nome as maquina_nome,
  os.numero_os, c.razao_social as cliente_nome
  FROM producao_ops o
  LEFT JOIN producao_maquinas m ON o.maquina_id = m.id
  LEFT JOIN ordens_servico os ON o.os_id = os.id
  LEFT JOIN clientes c ON o.cliente_id = c.id`;

function buildSearchWhere(fields, search) {
  if (!search) return { clause: '', params: [] };
  const term = `%${search}%`;
  const parts = fields.map((f) => `${f} LIKE ?`);
  return { clause: ` AND (${parts.join(' OR ')})`, params: fields.map(() => term) };
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

async function gerarNumeroOp(db) {
  const year = new Date().getFullYear();
  const prefix = `OP-${year}-`;
  const row = await dbGet(db, `SELECT numero_op FROM producao_ops WHERE numero_op LIKE ? ORDER BY id DESC LIMIT 1`, [`${prefix}%`]);
  let seq = 1;
  if (row?.numero_op) {
    const parts = row.numero_op.split('-');
    const last = parseInt(parts[parts.length - 1], 10);
    if (!Number.isNaN(last)) seq = last + 1;
  }
  return `${prefix}${String(seq).padStart(4, '0')}`;
}

function calcDuracaoMin(inicio, fim) {
  if (!inicio || !fim) return null;
  const a = new Date(inicio);
  const b = new Date(fim);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null;
  return Math.max(0, (b - a) / 60000);
}

// ── Meta ─────────────────────────────────────────────────────────────────────

async function getMeta(db) {
  const maquinas = await dbAll(db, "SELECT id, codigo, nome, setor, status FROM producao_maquinas WHERE ativo = 1 ORDER BY codigo");
  const motivos = await dbAll(db, 'SELECT * FROM producao_motivos_parada WHERE ativo = 1 ORDER BY descricao');
  const colaboradores = await dbAll(db, "SELECT id, nome FROM colaboradores WHERE status = 'ativo' ORDER BY nome");
  return {
    maquinas, motivos, colaboradores,
    statusOp: STATUS_OP, prioridades: PRIORIDADES, statusMaquina: STATUS_MAQUINA, setores: SETORES_GMP,
  };
}

// ── Dashboard ────────────────────────────────────────────────────────────────

async function getDashboard(db) {
  const hoje = todayISO();
  const [
    opsAbertas, opsProducao, opsAtrasadas, opsConcluidasMes,
    maquinasUso, maquinasParada, paradasHoje, apontamentosHoje,
    opsRecentes, paradasRecentes, maquinasStatus,
  ] = await Promise.all([
    dbGet(db, `SELECT COUNT(*) as total FROM producao_ops WHERE ativo = 1 AND status IN ('planejada','liberada','em_producao')`),
    dbGet(db, `SELECT COUNT(*) as total FROM producao_ops WHERE ativo = 1 AND status = 'em_producao'`),
    dbGet(db, `SELECT COUNT(*) as total FROM producao_ops WHERE ativo = 1 AND status IN ('planejada','liberada','em_producao')
      AND data_prevista_fim IS NOT NULL AND date(data_prevista_fim) < date('now')`),
    dbGet(db, `SELECT COUNT(*) as total FROM producao_ops WHERE ativo = 1 AND status = 'concluida'
      AND strftime('%Y-%m', data_fim) = strftime('%Y-%m', 'now')`),
    dbGet(db, `SELECT COUNT(*) as total FROM producao_maquinas WHERE ativo = 1 AND status = 'em_producao'`),
    dbGet(db, `SELECT COUNT(*) as total FROM producao_maquinas WHERE ativo = 1 AND status = 'parada'`),
    dbGet(db, `SELECT COUNT(*) as total FROM producao_paradas WHERE date(data_inicio) = date('now')`),
    dbGet(db, `SELECT COALESCE(SUM(quantidade_produzida),0) as total FROM producao_apontamentos WHERE date(data_inicio) = date('now')`),
    dbAll(db, `${OP_JOIN} WHERE o.ativo = 1 AND o.status IN ('planejada','liberada','em_producao')
      ORDER BY CASE o.prioridade WHEN 'urgente' THEN 1 WHEN 'alta' THEN 2 WHEN 'normal' THEN 3 ELSE 4 END, o.data_prevista_fim LIMIT 8`),
    dbAll(db, `SELECT p.*, m.codigo as maquina_codigo, m.nome as maquina_nome, mp.descricao as motivo_descricao
      FROM producao_paradas p
      LEFT JOIN producao_maquinas m ON p.maquina_id = m.id
      LEFT JOIN producao_motivos_parada mp ON p.motivo_id = mp.id
      WHERE p.data_fim IS NULL OR date(p.data_inicio) = date('now')
      ORDER BY p.data_inicio DESC LIMIT 8`),
    dbAll(db, `SELECT id, codigo, nome, setor, status FROM producao_maquinas WHERE ativo = 1 ORDER BY codigo`),
  ]);

  const totalPlanejado = await dbGet(db, `SELECT COALESCE(SUM(quantidade_planejada),0) as t FROM producao_ops
    WHERE ativo = 1 AND status IN ('liberada','em_producao')`);
  const totalProduzido = await dbGet(db, `SELECT COALESCE(SUM(quantidade_produzida),0) as t FROM producao_ops
    WHERE ativo = 1 AND status IN ('liberada','em_producao','concluida')`);

  const planejado = Number(totalPlanejado?.t) || 0;
  const produzido = Number(totalProduzido?.t) || 0;
  const eficiencia = planejado > 0 ? Math.min(100, Math.round((produzido / planejado) * 1000) / 10) : 0;

  const paradasMin = await dbGet(db, `SELECT COALESCE(SUM(duracao_minutos),0) as t FROM producao_paradas WHERE date(data_inicio) = date('now')`);
  const apontMin = await dbGet(db, `SELECT COALESCE(SUM(
    CASE WHEN data_fim IS NOT NULL THEN (julianday(data_fim) - julianday(data_inicio)) * 24 * 60 ELSE 0 END
  ),0) as t FROM producao_apontamentos WHERE date(data_inicio) = date('now')`);

  const tempoParada = Number(paradasMin?.t) || 0;
  const tempoProducao = Number(apontMin?.t) || 0;
  const tempoTotal = tempoParada + tempoProducao;
  const disponibilidade = tempoTotal > 0 ? Math.round(((tempoProducao / tempoTotal) * 100) * 10) / 10 : 100;

  return {
    kpis: {
      opsAbertas: opsAbertas?.total || 0,
      opsEmProducao: opsProducao?.total || 0,
      opsAtrasadas: opsAtrasadas?.total || 0,
      opsConcluidasMes: opsConcluidasMes?.total || 0,
      maquinasEmUso: maquinasUso?.total || 0,
      maquinasParada: maquinasParada?.total || 0,
      paradasHoje: paradasHoje?.total || 0,
      producaoHoje: Number(apontamentosHoje?.total) || 0,
      eficiencia,
      disponibilidade,
      oee: Math.round((eficiencia * disponibilidade) / 100 * 10) / 10,
    },
    opsRecentes,
    paradasRecentes,
    maquinasStatus,
    dataReferencia: hoje,
  };
}

// ── Máquinas ─────────────────────────────────────────────────────────────────

async function listMaquinas(db, { search, status, setor } = {}) {
  let sql = 'SELECT * FROM producao_maquinas WHERE ativo = 1';
  const params = [];
  const s = buildSearchWhere(['codigo', 'nome', 'setor', 'centro_trabalho'], search);
  sql += s.clause;
  params.push(...s.params);
  if (status) { sql += ' AND status = ?'; params.push(status); }
  if (setor) { sql += ' AND setor = ?'; params.push(setor); }
  sql += ' ORDER BY codigo';
  return dbAll(db, sql, params);
}

async function getMaquina(db, id) {
  return dbGet(db, 'SELECT * FROM producao_maquinas WHERE id = ? AND ativo = 1', [id]);
}

async function createMaquina(db, data) {
  const codigo = String(data.codigo || '').trim().toUpperCase();
  if (!codigo || !data.nome) {
    const err = new Error('Código e nome são obrigatórios');
    err.status = 400;
    throw err;
  }
  const exists = await dbGet(db, 'SELECT id FROM producao_maquinas WHERE codigo = ? AND ativo = 1', [codigo]);
  if (exists) {
    const err = new Error('Código já cadastrado');
    err.status = 409;
    throw err;
  }
  const r = await dbRun(db, `INSERT INTO producao_maquinas
    (codigo, nome, setor, tipo, status, capacidade_hora, centro_trabalho, observacoes)
    VALUES (?,?,?,?,?,?,?,?)`, [
    codigo, data.nome, data.setor || null, data.tipo || 'maquina',
    data.status || 'disponivel', Number(data.capacidade_hora) || 1,
    data.centro_trabalho || data.setor || null, data.observacoes || null,
  ]);
  return getMaquina(db, r.lastID);
}

async function updateMaquina(db, id, data) {
  const cur = await getMaquina(db, id);
  if (!cur) {
    const err = new Error('Máquina não encontrada');
    err.status = 404;
    throw err;
  }
  const codigo = data.codigo != null ? String(data.codigo).trim().toUpperCase() : cur.codigo;
  if (codigo !== cur.codigo) {
    const exists = await dbGet(db, 'SELECT id FROM producao_maquinas WHERE codigo = ? AND id != ? AND ativo = 1', [codigo, id]);
    if (exists) {
      const err = new Error('Código já cadastrado');
      err.status = 409;
      throw err;
    }
  }
  await dbRun(db, `UPDATE producao_maquinas SET
    codigo=?, nome=?, setor=?, tipo=?, status=?, capacidade_hora=?, centro_trabalho=?, observacoes=?,
    updated_at=CURRENT_TIMESTAMP WHERE id=?`, [
    codigo, data.nome ?? cur.nome, data.setor ?? cur.setor, data.tipo ?? cur.tipo,
    data.status ?? cur.status, data.capacidade_hora != null ? Number(data.capacidade_hora) : cur.capacidade_hora,
    data.centro_trabalho ?? cur.centro_trabalho, data.observacoes ?? cur.observacoes, id,
  ]);
  return getMaquina(db, id);
}

async function deleteMaquina(db, id) {
  await dbRun(db, 'UPDATE producao_maquinas SET ativo = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [id]);
  return { ok: true };
}

// ── Ordens de Produção ───────────────────────────────────────────────────────

async function listOps(db, { search, status, prioridade, maquina_id } = {}) {
  let sql = `${OP_JOIN} WHERE o.ativo = 1`;
  const params = [];
  const s = buildSearchWhere(['o.numero_op', 'o.produto_descricao', 'o.produto_codigo', 'os.numero_os', 'c.razao_social'], search);
  sql += s.clause;
  params.push(...s.params);
  if (status) { sql += ' AND o.status = ?'; params.push(status); }
  if (prioridade) { sql += ' AND o.prioridade = ?'; params.push(prioridade); }
  if (maquina_id) { sql += ' AND o.maquina_id = ?'; params.push(maquina_id); }
  sql += ` ORDER BY CASE o.prioridade WHEN 'urgente' THEN 1 WHEN 'alta' THEN 2 WHEN 'normal' THEN 3 ELSE 4 END, o.data_prevista_fim, o.id DESC`;
  return dbAll(db, sql, params);
}

async function getOp(db, id) {
  const op = await dbGet(db, `${OP_JOIN} WHERE o.id = ? AND o.ativo = 1`, [id]);
  if (!op) return null;
  const etapas = await dbAll(db, `SELECT e.*, m.codigo as maquina_codigo, m.nome as maquina_nome
    FROM producao_op_etapas e
    LEFT JOIN producao_maquinas m ON e.maquina_id = m.id
    WHERE e.op_id = ? ORDER BY e.sequencia`, [id]);
  return { ...op, etapas };
}

async function aplicarRoteiroOp(db, opId, produtoCodigo) {
  if (!produtoCodigo) return;
  const roteiro = await dbGet(db, 'SELECT * FROM producao_roteiros WHERE produto_codigo = ? AND ativo = 1', [produtoCodigo]);
  if (!roteiro) return;
  const etapas = await dbAll(db, 'SELECT * FROM producao_roteiro_etapas WHERE roteiro_id = ? ORDER BY sequencia', [roteiro.id]);
  for (const et of etapas) {
    await dbRun(db, `INSERT INTO producao_op_etapas (op_id, sequencia, nome, maquina_id, tempo_previsto_min, status)
      VALUES (?,?,?,?,?,?)`, [opId, et.sequencia, et.nome, et.maquina_id, et.tempo_previsto_min, 'pendente']);
  }
}

async function createOp(db, user, data) {
  if (!data.produto_descricao) {
    const err = new Error('Descrição do produto é obrigatória');
    err.status = 400;
    throw err;
  }
  const numero = data.numero_op || await gerarNumeroOp(db);
  const r = await dbRun(db, `INSERT INTO producao_ops
    (numero_op, produto_codigo, produto_descricao, quantidade_planejada, quantidade_produzida, quantidade_refugo,
     status, prioridade, data_planejada, data_prevista_fim, maquina_id, os_id, cliente_id, projeto_id,
     observacoes, usuario_criacao_id, usuario_criacao_nome)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [
    numero, data.produto_codigo || null, data.produto_descricao,
    Number(data.quantidade_planejada) || 1, 0, 0,
    data.status || 'planejada', data.prioridade || 'normal',
    data.data_planejada || todayISO(), data.data_prevista_fim || null,
    data.maquina_id || null, data.os_id || null, data.cliente_id || null, data.projeto_id || null,
    data.observacoes || null, user?.id || null, user?.nome || user?.username || null,
  ]);

  if (data.etapas && Array.isArray(data.etapas) && data.etapas.length) {
    for (let i = 0; i < data.etapas.length; i++) {
      const et = data.etapas[i];
      await dbRun(db, `INSERT INTO producao_op_etapas (op_id, sequencia, nome, maquina_id, tempo_previsto_min, status)
        VALUES (?,?,?,?,?,?)`, [r.lastID, et.sequencia || i + 1, et.nome, et.maquina_id || null, et.tempo_previsto_min || 0, 'pendente']);
    }
  } else {
    await aplicarRoteiroOp(db, r.lastID, data.produto_codigo);
  }

  return getOp(db, r.lastID);
}

async function updateOp(db, id, data) {
  const cur = await getOp(db, id);
  if (!cur) {
    const err = new Error('OP não encontrada');
    err.status = 404;
    throw err;
  }
  await dbRun(db, `UPDATE producao_ops SET
    produto_codigo=?, produto_descricao=?, quantidade_planejada=?, prioridade=?,
    data_planejada=?, data_prevista_fim=?, maquina_id=?, os_id=?, cliente_id=?, projeto_id=?,
    observacoes=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`, [
    data.produto_codigo ?? cur.produto_codigo, data.produto_descricao ?? cur.produto_descricao,
    data.quantidade_planejada != null ? Number(data.quantidade_planejada) : cur.quantidade_planejada,
    data.prioridade ?? cur.prioridade, data.data_planejada ?? cur.data_planejada,
    data.data_prevista_fim ?? cur.data_prevista_fim, data.maquina_id ?? cur.maquina_id,
    data.os_id ?? cur.os_id, data.cliente_id ?? cur.cliente_id, data.projeto_id ?? cur.projeto_id,
    data.observacoes ?? cur.observacoes, id,
  ]);
  return getOp(db, id);
}

async function changeOpStatus(db, id, novoStatus, user) {
  if (!STATUS_OP.includes(novoStatus)) {
    const err = new Error('Status inválido');
    err.status = 400;
    throw err;
  }
  const cur = await getOp(db, id);
  if (!cur) {
    const err = new Error('OP não encontrada');
    err.status = 404;
    throw err;
  }
  const updates = { status: novoStatus };
  if (novoStatus === 'em_producao' && !cur.data_inicio) {
    updates.data_inicio = new Date().toISOString();
    if (cur.maquina_id) {
      await dbRun(db, "UPDATE producao_maquinas SET status = 'em_producao', updated_at = CURRENT_TIMESTAMP WHERE id = ?", [cur.maquina_id]);
    }
  }
  if (novoStatus === 'concluida') {
    updates.data_fim = new Date().toISOString();
    if (cur.maquina_id) {
      await dbRun(db, "UPDATE producao_maquinas SET status = 'disponivel', updated_at = CURRENT_TIMESTAMP WHERE id = ?", [cur.maquina_id]);
    }
  }
  if (novoStatus === 'cancelada' && cur.maquina_id) {
    await dbRun(db, "UPDATE producao_maquinas SET status = 'disponivel', updated_at = CURRENT_TIMESTAMP WHERE id = ?", [cur.maquina_id]);
  }
  await dbRun(db, `UPDATE producao_ops SET status = ?, data_inicio = COALESCE(?, data_inicio),
    data_fim = COALESCE(?, data_fim), updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [novoStatus, updates.data_inicio || null, updates.data_fim || null, id]);
  return getOp(db, id);
}

async function deleteOp(db, id) {
  await dbRun(db, 'UPDATE producao_ops SET ativo = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [id]);
  return { ok: true };
}

// ── Apontamentos ─────────────────────────────────────────────────────────────

async function listApontamentos(db, { op_id, maquina_id, data_inicio, data_fim, em_andamento } = {}) {
  let sql = `SELECT a.*, o.numero_op, o.produto_descricao, m.codigo as maquina_codigo, c.nome as colaborador_nome
    FROM producao_apontamentos a
    LEFT JOIN producao_ops o ON a.op_id = o.id
    LEFT JOIN producao_maquinas m ON a.maquina_id = m.id
    LEFT JOIN colaboradores c ON a.colaborador_id = c.id
    WHERE 1=1`;
  const params = [];
  if (op_id) { sql += ' AND a.op_id = ?'; params.push(op_id); }
  if (maquina_id) { sql += ' AND a.maquina_id = ?'; params.push(maquina_id); }
  if (data_inicio) { sql += ' AND date(a.data_inicio) >= date(?)'; params.push(data_inicio); }
  if (data_fim) { sql += ' AND date(a.data_inicio) <= date(?)'; params.push(data_fim); }
  if (em_andamento === '1' || em_andamento === true) { sql += ' AND a.data_fim IS NULL'; }
  sql += ' ORDER BY a.data_inicio DESC LIMIT 500';
  return dbAll(db, sql, params);
}

async function iniciarApontamento(db, user, data) {
  if (!data.op_id) {
    const err = new Error('OP é obrigatória');
    err.status = 400;
    throw err;
  }
  const op = await getOp(db, data.op_id);
  if (!op) {
    const err = new Error('OP não encontrada');
    err.status = 404;
    throw err;
  }
  const agora = new Date().toISOString();
  const r = await dbRun(db, `INSERT INTO producao_apontamentos
    (op_id, etapa_id, maquina_id, colaborador_id, operador_nome, tipo, data_inicio, observacoes, usuario_id, usuario_nome)
    VALUES (?,?,?,?,?,?,?,?,?,?)`, [
    data.op_id, data.etapa_id || null, data.maquina_id || op.maquina_id || null,
    data.colaborador_id || null, data.operador_nome || user?.nome || null,
    data.tipo || 'producao', agora, data.observacoes || null, user?.id || null, user?.nome || user?.username || null,
  ]);
  if (op.status === 'liberada' || op.status === 'planejada') {
    await changeOpStatus(db, data.op_id, 'em_producao', user);
  }
  const maqId = data.maquina_id || op.maquina_id;
  if (maqId) {
    await dbRun(db, "UPDATE producao_maquinas SET status = 'em_producao', updated_at = CURRENT_TIMESTAMP WHERE id = ?", [maqId]);
  }
  return dbGet(db, 'SELECT * FROM producao_apontamentos WHERE id = ?', [r.lastID]);
}

async function finalizarApontamento(db, id, user, data) {
  const cur = await dbGet(db, 'SELECT * FROM producao_apontamentos WHERE id = ?', [id]);
  if (!cur) {
    const err = new Error('Apontamento não encontrado');
    err.status = 404;
    throw err;
  }
  if (cur.data_fim) {
    const err = new Error('Apontamento já finalizado');
    err.status = 400;
    throw err;
  }
  const agora = new Date().toISOString();
  const qtd = Number(data.quantidade_produzida) || 0;
  const refugo = Number(data.quantidade_refugo) || 0;
  await dbRun(db, `UPDATE producao_apontamentos SET data_fim = ?, quantidade_produzida = ?, quantidade_refugo = ?, observacoes = ?
    WHERE id = ?`, [agora, qtd, refugo, data.observacoes ?? cur.observacoes, id]);

  if (qtd > 0 || refugo > 0) {
    await dbRun(db, `UPDATE producao_ops SET
      quantidade_produzida = quantidade_produzida + ?,
      quantidade_refugo = quantidade_refugo + ?,
      updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [qtd, refugo, cur.op_id]);
  }

  if (cur.etapa_id) {
    await dbRun(db, `UPDATE producao_op_etapas SET quantidade_produzida = quantidade_produzida + ?, status = 'em_andamento'
      WHERE id = ?`, [qtd, cur.etapa_id]);
  }

  const op = await getOp(db, cur.op_id);
  if (op && op.quantidade_produzida >= op.quantidade_planejada && op.status === 'em_producao') {
    await changeOpStatus(db, cur.op_id, 'concluida', user);
  }

  return dbGet(db, 'SELECT * FROM producao_apontamentos WHERE id = ?', [id]);
}

// ── Paradas ──────────────────────────────────────────────────────────────────

async function listParadas(db, { maquina_id, data_inicio, data_fim, em_andamento } = {}) {
  let sql = `SELECT p.*, m.codigo as maquina_codigo, m.nome as maquina_nome,
    mp.descricao as motivo_descricao, o.numero_op
    FROM producao_paradas p
    LEFT JOIN producao_maquinas m ON p.maquina_id = m.id
    LEFT JOIN producao_motivos_parada mp ON p.motivo_id = mp.id
    LEFT JOIN producao_ops o ON p.op_id = o.id
    WHERE 1=1`;
  const params = [];
  if (maquina_id) { sql += ' AND p.maquina_id = ?'; params.push(maquina_id); }
  if (data_inicio) { sql += ' AND date(p.data_inicio) >= date(?)'; params.push(data_inicio); }
  if (data_fim) { sql += ' AND date(p.data_inicio) <= date(?)'; params.push(data_fim); }
  if (em_andamento === '1' || em_andamento === true) { sql += ' AND p.data_fim IS NULL'; }
  sql += ' ORDER BY p.data_inicio DESC LIMIT 500';
  return dbAll(db, sql, params);
}

async function iniciarParada(db, user, data) {
  if (!data.maquina_id) {
    const err = new Error('Máquina é obrigatória');
    err.status = 400;
    throw err;
  }
  const aberta = await dbGet(db, 'SELECT id FROM producao_paradas WHERE maquina_id = ? AND data_fim IS NULL', [data.maquina_id]);
  if (aberta) {
    const err = new Error('Já existe parada em andamento nesta máquina');
    err.status = 409;
    throw err;
  }
  const agora = new Date().toISOString();
  const r = await dbRun(db, `INSERT INTO producao_paradas
    (maquina_id, op_id, motivo_id, motivo_texto, data_inicio, observacoes, usuario_id, usuario_nome)
    VALUES (?,?,?,?,?,?,?,?)`, [
    data.maquina_id, data.op_id || null, data.motivo_id || null, data.motivo_texto || null,
    agora, data.observacoes || null, user?.id || null, user?.nome || user?.username || null,
  ]);
  await dbRun(db, "UPDATE producao_maquinas SET status = 'parada', updated_at = CURRENT_TIMESTAMP WHERE id = ?", [data.maquina_id]);
  return dbGet(db, 'SELECT * FROM producao_paradas WHERE id = ?', [r.lastID]);
}

async function finalizarParada(db, id, user, data) {
  const cur = await dbGet(db, 'SELECT * FROM producao_paradas WHERE id = ?', [id]);
  if (!cur) {
    const err = new Error('Parada não encontrada');
    err.status = 404;
    throw err;
  }
  if (cur.data_fim) {
    const err = new Error('Parada já finalizada');
    err.status = 400;
    throw err;
  }
  const agora = new Date().toISOString();
  const duracao = calcDuracaoMin(cur.data_inicio, agora);
  await dbRun(db, 'UPDATE producao_paradas SET data_fim = ?, duracao_minutos = ?, observacoes = ? WHERE id = ?',
    [agora, duracao, data.observacoes ?? cur.observacoes, id]);

  const emProducao = await dbGet(db, 'SELECT id FROM producao_apontamentos WHERE maquina_id = ? AND data_fim IS NULL', [cur.maquina_id]);
  const novoStatus = emProducao ? 'em_producao' : 'disponivel';
  await dbRun(db, 'UPDATE producao_maquinas SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [novoStatus, cur.maquina_id]);
  return dbGet(db, 'SELECT * FROM producao_paradas WHERE id = ?', [id]);
}

// ── Roteiros ─────────────────────────────────────────────────────────────────

async function listRoteiros(db, { search } = {}) {
  let sql = 'SELECT r.*, (SELECT COUNT(*) FROM producao_roteiro_etapas e WHERE e.roteiro_id = r.id) as total_etapas FROM producao_roteiros r WHERE r.ativo = 1';
  const params = [];
  const s = buildSearchWhere(['r.produto_codigo', 'r.produto_descricao'], search);
  sql += s.clause;
  params.push(...s.params);
  sql += ' ORDER BY r.produto_codigo';
  return dbAll(db, sql, params);
}

async function getRoteiro(db, id) {
  const roteiro = await dbGet(db, 'SELECT * FROM producao_roteiros WHERE id = ? AND ativo = 1', [id]);
  if (!roteiro) return null;
  const etapas = await dbAll(db, `SELECT e.*, m.codigo as maquina_codigo FROM producao_roteiro_etapas e
    LEFT JOIN producao_maquinas m ON e.maquina_id = m.id
    WHERE e.roteiro_id = ? ORDER BY e.sequencia`, [id]);
  return { ...roteiro, etapas };
}

async function createRoteiro(db, data) {
  const codigo = String(data.produto_codigo || '').trim();
  if (!codigo) {
    const err = new Error('Código do produto é obrigatório');
    err.status = 400;
    throw err;
  }
  const exists = await dbGet(db, 'SELECT id FROM producao_roteiros WHERE produto_codigo = ? AND ativo = 1', [codigo]);
  if (exists) {
    const err = new Error('Roteiro já existe para este produto');
    err.status = 409;
    throw err;
  }
  const r = await dbRun(db, `INSERT INTO producao_roteiros (produto_codigo, produto_descricao, versao, observacoes)
    VALUES (?,?,?,?)`, [codigo, data.produto_descricao || null, data.versao || '1.0', data.observacoes || null]);
  if (data.etapas && Array.isArray(data.etapas)) {
    for (let i = 0; i < data.etapas.length; i++) {
      const et = data.etapas[i];
      await dbRun(db, `INSERT INTO producao_roteiro_etapas (roteiro_id, sequencia, nome, maquina_id, tempo_previsto_min, observacoes)
        VALUES (?,?,?,?,?,?)`, [r.lastID, et.sequencia || i + 1, et.nome, et.maquina_id || null, et.tempo_previsto_min || 0, et.observacoes || null]);
    }
  }
  return getRoteiro(db, r.lastID);
}

async function updateRoteiro(db, id, data) {
  const cur = await getRoteiro(db, id);
  if (!cur) {
    const err = new Error('Roteiro não encontrado');
    err.status = 404;
    throw err;
  }
  await dbRun(db, `UPDATE producao_roteiros SET produto_descricao=?, versao=?, observacoes=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`,
    [data.produto_descricao ?? cur.produto_descricao, data.versao ?? cur.versao, data.observacoes ?? cur.observacoes, id]);
  if (data.etapas && Array.isArray(data.etapas)) {
    await dbRun(db, 'DELETE FROM producao_roteiro_etapas WHERE roteiro_id = ?', [id]);
    for (let i = 0; i < data.etapas.length; i++) {
      const et = data.etapas[i];
      await dbRun(db, `INSERT INTO producao_roteiro_etapas (roteiro_id, sequencia, nome, maquina_id, tempo_previsto_min, observacoes)
        VALUES (?,?,?,?,?,?)`, [id, et.sequencia || i + 1, et.nome, et.maquina_id || null, et.tempo_previsto_min || 0, et.observacoes || null]);
    }
  }
  return getRoteiro(db, id);
}

async function deleteRoteiro(db, id) {
  await dbRun(db, 'UPDATE producao_roteiros SET ativo = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [id]);
  return { ok: true };
}

// ── Motivos parada (config) ──────────────────────────────────────────────────

async function listMotivosParada(db) {
  return dbAll(db, 'SELECT * FROM producao_motivos_parada WHERE ativo = 1 ORDER BY descricao');
}

async function createMotivoParada(db, data) {
  if (!data.descricao) {
    const err = new Error('Descrição é obrigatória');
    err.status = 400;
    throw err;
  }
  const r = await dbRun(db, 'INSERT INTO producao_motivos_parada (descricao, categoria, tipo) VALUES (?,?,?)',
    [data.descricao, data.categoria || 'outros', data.tipo || 'nao_planejada']);
  return dbGet(db, 'SELECT * FROM producao_motivos_parada WHERE id = ?', [r.lastID]);
}

async function updateMotivoParada(db, id, data) {
  await dbRun(db, 'UPDATE producao_motivos_parada SET descricao=?, categoria=?, tipo=? WHERE id=?',
    [data.descricao, data.categoria || 'outros', data.tipo || 'nao_planejada', id]);
  return dbGet(db, 'SELECT * FROM producao_motivos_parada WHERE id = ?', [id]);
}

async function deleteMotivoParada(db, id) {
  await dbRun(db, 'UPDATE producao_motivos_parada SET ativo = 0 WHERE id = ?', [id]);
  return { ok: true };
}

// ── Relatórios ───────────────────────────────────────────────────────────────

async function relatorioProducaoPeriodo(db, { data_inicio, data_fim } = {}) {
  const di = data_inicio || new Date(new Date().setDate(1)).toISOString().slice(0, 10);
  const df = data_fim || todayISO();
  const porDia = await dbAll(db, `SELECT date(data_inicio) as dia,
    SUM(quantidade_produzida) as produzido, SUM(quantidade_refugo) as refugo, COUNT(*) as apontamentos
    FROM producao_apontamentos WHERE date(data_inicio) BETWEEN date(?) AND date(?)
    GROUP BY date(data_inicio) ORDER BY dia`, [di, df]);
  const porOp = await dbAll(db, `SELECT o.numero_op, o.produto_descricao, o.quantidade_planejada, o.quantidade_produzida, o.quantidade_refugo, o.status
    FROM producao_ops o WHERE o.ativo = 1 AND (
      date(o.data_inicio) BETWEEN date(?) AND date(?)
      OR date(o.created_at) BETWEEN date(?) AND date(?)
    ) ORDER BY o.numero_op`, [di, df, di, df]);
  return { periodo: { data_inicio: di, data_fim: df }, porDia, porOp };
}

async function relatorioEficiencia(db, { data_inicio, data_fim } = {}) {
  const di = data_inicio || new Date(new Date().setDate(1)).toISOString().slice(0, 10);
  const df = data_fim || todayISO();
  const ops = await dbAll(db, `SELECT numero_op, produto_descricao, quantidade_planejada, quantidade_produzida, quantidade_refugo, status,
    CASE WHEN quantidade_planejada > 0 THEN ROUND(quantidade_produzida * 100.0 / quantidade_planejada, 1) ELSE 0 END as eficiencia_pct
    FROM producao_ops WHERE ativo = 1 AND status IN ('em_producao','concluida')
    AND date(COALESCE(data_inicio, created_at)) BETWEEN date(?) AND date(?)
    ORDER BY eficiencia_pct DESC`, [di, df]);
  const media = ops.length ? Math.round(ops.reduce((s, o) => s + (o.eficiencia_pct || 0), 0) / ops.length * 10) / 10 : 0;
  return { periodo: { data_inicio: di, data_fim: df }, ops, mediaEficiencia: media };
}

async function relatorioParadas(db, { data_inicio, data_fim } = {}) {
  const di = data_inicio || new Date(new Date().setDate(1)).toISOString().slice(0, 10);
  const df = data_fim || todayISO();
  const porMotivo = await dbAll(db, `SELECT COALESCE(mp.descricao, p.motivo_texto, 'Sem motivo') as motivo,
    COUNT(*) as ocorrencias, SUM(COALESCE(p.duracao_minutos,0)) as minutos
    FROM producao_paradas p
    LEFT JOIN producao_motivos_parada mp ON p.motivo_id = mp.id
    WHERE date(p.data_inicio) BETWEEN date(?) AND date(?)
    GROUP BY motivo ORDER BY minutos DESC`, [di, df]);
  const porMaquina = await dbAll(db, `SELECT m.codigo, m.nome, COUNT(*) as ocorrencias, SUM(COALESCE(p.duracao_minutos,0)) as minutos
    FROM producao_paradas p
    JOIN producao_maquinas m ON p.maquina_id = m.id
    WHERE date(p.data_inicio) BETWEEN date(?) AND date(?)
    GROUP BY m.id ORDER BY minutos DESC`, [di, df]);
  return { periodo: { data_inicio: di, data_fim: df }, porMotivo, porMaquina };
}

module.exports = {
  getMeta, getDashboard,
  listMaquinas, getMaquina, createMaquina, updateMaquina, deleteMaquina,
  listOps, getOp, createOp, updateOp, changeOpStatus, deleteOp, gerarNumeroOp,
  listApontamentos, iniciarApontamento, finalizarApontamento,
  listParadas, iniciarParada, finalizarParada,
  listRoteiros, getRoteiro, createRoteiro, updateRoteiro, deleteRoteiro,
  listMotivosParada, createMotivoParada, updateMotivoParada, deleteMotivoParada,
  relatorioProducaoPeriodo, relatorioEficiencia, relatorioParadas,
};
