/**
 * Serviço TODOLIST — CRUD e board Kanban
 */

const { dbRun, dbGet, dbAll } = require('./db');
const { STATUS_COLUNAS, PRIORIDADES } = require('./schema');

const STATUS_SET = new Set(STATUS_COLUNAS);
const PRIORIDADE_SET = new Set(PRIORIDADES);
const COLUNA_CONCLUIDO = 'concluido';

function nowIso() {
  return new Date().toISOString();
}

function normalizeStatus(status) {
  const s = String(status || 'a_fazer').toLowerCase().trim();
  return STATUS_SET.has(s) ? s : 'a_fazer';
}

function normalizePrioridade(prioridade) {
  const p = String(prioridade || 'media').toLowerCase().trim();
  return PRIORIDADE_SET.has(p) ? p : 'media';
}

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

async function getTarefaById(db, id) {
  return dbGet(db, `
    SELECT t.*,
           u.nome AS responsavel_nome,
           c.nome AS created_by_nome
    FROM todolist_tarefas t
    LEFT JOIN usuarios u ON u.id = t.responsavel_id
    LEFT JOIN usuarios c ON c.id = t.created_by
    WHERE t.id = ?
  `, [id]);
}

async function listUsuariosAtivos(db) {
  return dbAll(db, `
    SELECT id, nome, email, role
    FROM usuarios
    WHERE ativo = 1
    ORDER BY nome COLLATE NOCASE
  `);
}

async function getBoard(db, { busca } = {}) {
  const params = [];
  let where = '';
  if (busca && String(busca).trim()) {
    where = `WHERE (
      LOWER(t.titulo) LIKE ? OR
      LOWER(COALESCE(t.descricao, '')) LIKE ? OR
      LOWER(COALESCE(u.nome, '')) LIKE ?
    )`;
    const q = `%${String(busca).trim().toLowerCase()}%`;
    params.push(q, q, q);
  }

  const tarefas = await dbAll(db, `
    SELECT t.*,
           u.nome AS responsavel_nome,
           c.nome AS created_by_nome
    FROM todolist_tarefas t
    LEFT JOIN usuarios u ON u.id = t.responsavel_id
    LEFT JOIN usuarios c ON c.id = t.created_by
    ${where}
    ORDER BY t.ordem ASC, t.created_at ASC
  `, params);

  const colunas = STATUS_COLUNAS.map((status) => ({
    id: status,
    tarefas: tarefas.filter((t) => normalizeStatus(t.status) === status),
  }));

  const usuarios = await listUsuariosAtivos(db);

  return {
    colunas_meta: [
      { id: 'a_fazer', nome: 'A Fazer' },
      { id: 'em_progresso', nome: 'Em Progresso' },
      { id: 'em_revisao', nome: 'Em Revisão' },
      { id: 'concluido', nome: 'Concluído' },
    ],
    colunas,
    tarefas,
    usuarios,
    prioridades: PRIORIDADES,
  };
}

async function createTarefa(db, user, body = {}) {
  const titulo = String(body.titulo || '').trim();
  if (!titulo) throw httpError(400, 'Título é obrigatório');

  const status = normalizeStatus(body.status);
  const prioridade = normalizePrioridade(body.prioridade);
  const descricao = body.descricao != null ? String(body.descricao) : null;
  const responsavel_id = body.responsavel_id ? Number(body.responsavel_id) : null;
  const prazo = body.prazo ? String(body.prazo).slice(0, 32) : null;
  const data_conclusao = status === COLUNA_CONCLUIDO ? (body.data_conclusao || nowIso()) : null;
  const created_by = user?.id || null;

  const maxOrdem = await dbGet(db, `
    SELECT COALESCE(MAX(ordem), -1) AS max_ordem
    FROM todolist_tarefas WHERE status = ?
  `, [status]);
  const ordem = body.ordem != null ? Number(body.ordem) : (maxOrdem?.max_ordem ?? -1) + 1;

  const result = await dbRun(db, `
    INSERT INTO todolist_tarefas (
      titulo, descricao, status, prioridade, responsavel_id, prazo, ordem,
      data_conclusao, created_by, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `, [titulo, descricao, status, prioridade, responsavel_id, prazo, ordem, data_conclusao, created_by]);

  return getTarefaById(db, result.lastID);
}

async function updateTarefa(db, id, body = {}) {
  const existing = await getTarefaById(db, id);
  if (!existing) throw httpError(404, 'Tarefa não encontrada');

  const titulo = body.titulo != null ? String(body.titulo).trim() : existing.titulo;
  if (!titulo) throw httpError(400, 'Título é obrigatório');

  const status = body.status != null ? normalizeStatus(body.status) : normalizeStatus(existing.status);
  const prioridade = body.prioridade != null
    ? normalizePrioridade(body.prioridade)
    : normalizePrioridade(existing.prioridade);
  const descricao = body.descricao !== undefined
    ? (body.descricao != null ? String(body.descricao) : null)
    : existing.descricao;
  const responsavel_id = body.responsavel_id !== undefined
    ? (body.responsavel_id ? Number(body.responsavel_id) : null)
    : existing.responsavel_id;
  const prazo = body.prazo !== undefined
    ? (body.prazo ? String(body.prazo).slice(0, 32) : null)
    : existing.prazo;
  const ordem = body.ordem != null ? Number(body.ordem) : existing.ordem;

  let data_conclusao = existing.data_conclusao;
  if (status === COLUNA_CONCLUIDO && normalizeStatus(existing.status) !== COLUNA_CONCLUIDO) {
    data_conclusao = body.data_conclusao || nowIso();
  } else if (status !== COLUNA_CONCLUIDO && normalizeStatus(existing.status) === COLUNA_CONCLUIDO) {
    data_conclusao = null;
  } else if (body.data_conclusao !== undefined && status === COLUNA_CONCLUIDO) {
    data_conclusao = body.data_conclusao || null;
  }

  await dbRun(db, `
    UPDATE todolist_tarefas SET
      titulo = ?, descricao = ?, status = ?, prioridade = ?,
      responsavel_id = ?, prazo = ?, ordem = ?, data_conclusao = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `, [titulo, descricao, status, prioridade, responsavel_id, prazo, ordem, data_conclusao, id]);

  return getTarefaById(db, id);
}

async function moveTarefa(db, id, { status, ordem } = {}) {
  const existing = await getTarefaById(db, id);
  if (!existing) throw httpError(404, 'Tarefa não encontrada');

  const novoStatus = status != null ? normalizeStatus(status) : normalizeStatus(existing.status);
  let novaOrdem = ordem;
  if (novaOrdem == null) {
    const maxOrdem = await dbGet(db, `
      SELECT COALESCE(MAX(ordem), -1) AS max_ordem
      FROM todolist_tarefas WHERE status = ? AND id != ?
    `, [novoStatus, id]);
    novaOrdem = (maxOrdem?.max_ordem ?? -1) + 1;
  } else {
    novaOrdem = Number(novaOrdem);
  }

  let data_conclusao = existing.data_conclusao;
  if (novoStatus === COLUNA_CONCLUIDO && normalizeStatus(existing.status) !== COLUNA_CONCLUIDO) {
    data_conclusao = nowIso();
  } else if (novoStatus !== COLUNA_CONCLUIDO && normalizeStatus(existing.status) === COLUNA_CONCLUIDO) {
    data_conclusao = null;
  }

  await dbRun(db, `
    UPDATE todolist_tarefas SET
      status = ?, ordem = ?, data_conclusao = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `, [novoStatus, novaOrdem, data_conclusao, id]);

  return getTarefaById(db, id);
}

async function deleteTarefa(db, id) {
  const existing = await getTarefaById(db, id);
  if (!existing) throw httpError(404, 'Tarefa não encontrada');
  await dbRun(db, `DELETE FROM todolist_tarefas WHERE id = ?`, [id]);
  return { ok: true, id: Number(id) };
}

module.exports = {
  getBoard,
  getTarefaById,
  createTarefa,
  updateTarefa,
  moveTarefa,
  deleteTarefa,
  listUsuariosAtivos,
  STATUS_COLUNAS,
  PRIORIDADES,
};
