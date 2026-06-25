const { dbRun, dbGet, dbAll } = require('./db');
const { sanitizeMessageContent } = require('./sanitize');

function mapMessage(row) {
  if (!row) return row;
  return {
    id: row.id,
    conversa_id: row.conversa_id,
    usuario_id: row.usuario_id,
    conteudo: row.conteudo,
    tipo: row.tipo,
    anexo_url: row.anexo_url,
    anexo_nome: row.anexo_nome,
    anexo_tamanho: row.anexo_tamanho,
    created_at: row.created_at,
    editado_at: row.editado_at,
    deletado: row.deletado,
    autor_nome: row.autor_nome,
    lida_por_todos: row.lida_por_todos,
  };
}

function previewText(msg) {
  if (!msg) return '';
  if (msg.tipo === 'imagem') return '📷 Imagem';
  if (msg.tipo === 'sistema') return msg.conteudo || '';
  return msg.conteudo || '';
}

async function isParticipant(db, conversaId, userId) {
  const row = await dbGet(
    db,
    'SELECT 1 FROM chat_participantes WHERE conversa_id = ? AND usuario_id = ?',
    [conversaId, userId]
  );
  return !!row;
}

async function getConversationTitle(db, conversa, userId) {
  if (conversa.tipo === 'grupo') return conversa.nome || 'Grupo';
  const other = await dbGet(
    db,
    `SELECT u.nome FROM chat_participantes cp
     JOIN usuarios u ON u.id = cp.usuario_id
     WHERE cp.conversa_id = ? AND cp.usuario_id != ?`,
    [conversa.id, userId]
  );
  return other?.nome || 'Conversa';
}

async function listConversations(db, userId, { incluirArquivadas = false } = {}) {
  const archiveFilter = incluirArquivadas ? '' : 'AND (c.arquivada IS NULL OR c.arquivada = 0)';
  const rows = await dbAll(
    db,
    `SELECT c.id, c.tipo, c.nome, c.criado_por, c.arquivada, c.created_at, c.updated_at,
            cp.ultima_leitura_at,
            (SELECT COUNT(*) FROM chat_mensagens m
             WHERE m.conversa_id = c.id AND m.deletado = 0 AND m.usuario_id != ?
             AND (cp.ultima_leitura_at IS NULL OR m.created_at > cp.ultima_leitura_at)) AS nao_lidas
     FROM chat_conversas c
     JOIN chat_participantes cp ON cp.conversa_id = c.id AND cp.usuario_id = ?
     WHERE 1=1 ${archiveFilter}
     ORDER BY c.updated_at DESC`,
    [userId, userId]
  );

  const result = [];
  for (const row of rows) {
    const lastMsg = await dbGet(
      db,
      `SELECT m.id, m.conteudo, m.tipo, m.anexo_url, m.created_at, m.usuario_id, u.nome AS autor_nome
       FROM chat_mensagens m
       LEFT JOIN usuarios u ON u.id = m.usuario_id
       WHERE m.conversa_id = ? AND m.deletado = 0
       ORDER BY m.created_at DESC LIMIT 1`,
      [row.id]
    );

    const participantes = await dbAll(
      db,
      `SELECT u.id, u.nome, u.email, u.cargo
       FROM chat_participantes cp
       JOIN usuarios u ON u.id = cp.usuario_id
       WHERE cp.conversa_id = ?`,
      [row.id]
    );

    result.push({
      id: row.id,
      tipo: row.tipo,
      nome: row.nome,
      titulo: await getConversationTitle(db, row, userId),
      arquivada: row.arquivada,
      criado_por: row.criado_por,
      created_at: row.created_at,
      updated_at: row.updated_at,
      ultima_leitura_at: row.ultima_leitura_at,
      nao_lidas: row.nao_lidas || 0,
      ultima_mensagem: lastMsg
        ? {
            id: lastMsg.id,
            conteudo: previewText(lastMsg),
            tipo: lastMsg.tipo,
            created_at: lastMsg.created_at,
            usuario_id: lastMsg.usuario_id,
            autor_nome: lastMsg.autor_nome,
          }
        : null,
      participantes,
    });
  }
  return result;
}

async function getTotalUnread(db, userId) {
  const row = await dbGet(
    db,
    `SELECT COALESCE(SUM(sub.cnt), 0) AS total FROM (
       SELECT COUNT(*) AS cnt
       FROM chat_conversas c
       JOIN chat_participantes cp ON cp.conversa_id = c.id AND cp.usuario_id = ?
       JOIN chat_mensagens m ON m.conversa_id = c.id
       WHERE m.deletado = 0 AND m.usuario_id != ?
       AND (cp.ultima_leitura_at IS NULL OR m.created_at > cp.ultima_leitura_at)
       GROUP BY c.id
     ) sub`,
    [userId, userId]
  );
  return row?.total || 0;
}

async function findDirectConversation(db, userId, otherUserId) {
  const row = await dbGet(
    db,
    `SELECT c.id FROM chat_conversas c
     WHERE c.tipo = 'direta'
     AND EXISTS (SELECT 1 FROM chat_participantes p1 WHERE p1.conversa_id = c.id AND p1.usuario_id = ?)
     AND EXISTS (SELECT 1 FROM chat_participantes p2 WHERE p2.conversa_id = c.id AND p2.usuario_id = ?)
     AND (SELECT COUNT(*) FROM chat_participantes p WHERE p.conversa_id = c.id) = 2
     LIMIT 1`,
    [userId, otherUserId]
  );
  return row?.id || null;
}

async function createDirectConversation(db, userId, otherUserId) {
  if (userId === otherUserId) throw new Error('Não é possível iniciar conversa consigo mesmo');
  const other = await dbGet(db, 'SELECT id, ativo FROM usuarios WHERE id = ?', [otherUserId]);
  if (!other || other.ativo === 0) throw new Error('Usuário não encontrado');

  const existing = await findDirectConversation(db, userId, otherUserId);
  if (existing) return existing;

  const { lastID } = await dbRun(
    db,
    `INSERT INTO chat_conversas (tipo, criado_por) VALUES ('direta', ?)`,
    [userId]
  );
  await dbRun(db, 'INSERT INTO chat_participantes (conversa_id, usuario_id) VALUES (?, ?)', [lastID, userId]);
  await dbRun(db, 'INSERT INTO chat_participantes (conversa_id, usuario_id) VALUES (?, ?)', [lastID, otherUserId]);
  return lastID;
}

async function createGroupConversation(db, userId, nome, memberIds) {
  const cleanName = sanitizeMessageContent(nome).slice(0, 120);
  if (!cleanName) throw new Error('Nome do grupo é obrigatório');

  const uniqueMembers = [...new Set([userId, ...(memberIds || []).map(Number).filter(Boolean)])];
  if (uniqueMembers.length < 2) throw new Error('O grupo precisa de pelo menos 2 participantes');

  const placeholders = uniqueMembers.map(() => '?').join(',');
  const validUsers = await dbAll(
    db,
    `SELECT id FROM usuarios WHERE id IN (${placeholders}) AND ativo = 1`,
    uniqueMembers
  );
  if (validUsers.length !== uniqueMembers.length) throw new Error('Um ou mais usuários são inválidos');

  const { lastID } = await dbRun(
    db,
    `INSERT INTO chat_conversas (tipo, nome, criado_por) VALUES ('grupo', ?, ?)`,
    [cleanName, userId]
  );

  for (const memberId of uniqueMembers) {
    await dbRun(
      db,
      'INSERT INTO chat_participantes (conversa_id, usuario_id, is_admin) VALUES (?, ?, ?)',
      [lastID, memberId, memberId === userId ? 1 : 0]
    );
  }

  const criador = await dbGet(db, 'SELECT nome FROM usuarios WHERE id = ?', [userId]);
  await dbRun(
    db,
    `INSERT INTO chat_mensagens (conversa_id, usuario_id, conteudo, tipo) VALUES (?, ?, ?, 'sistema')`,
    [lastID, userId, `${criador?.nome || 'Alguém'} criou o grupo "${cleanName}"`]
  );
  await dbRun(db, 'UPDATE chat_conversas SET updated_at = CURRENT_TIMESTAMP WHERE id = ?', [lastID]);
  return lastID;
}

async function setArchived(db, conversaId, userId, arquivada) {
  if (!(await isParticipant(db, conversaId, userId))) throw new Error('Acesso negado');
  await dbRun(db, 'UPDATE chat_conversas SET arquivada = ? WHERE id = ?', [arquivada ? 1 : 0, conversaId]);
}

async function getMessages(db, conversaId, userId, { limit = 50, before } = {}) {
  if (!(await isParticipant(db, conversaId, userId))) throw new Error('Acesso negado');

  const params = [conversaId];
  let beforeClause = '';
  if (before) {
    beforeClause = 'AND m.id < ?';
    params.push(before);
  }
  params.push(limit);

  const messages = await dbAll(
    db,
    `SELECT m.id, m.conversa_id, m.usuario_id, m.conteudo, m.tipo,
            m.anexo_url, m.anexo_nome, m.anexo_tamanho,
            m.created_at, m.editado_at, m.deletado, u.nome AS autor_nome
     FROM chat_mensagens m
     LEFT JOIN usuarios u ON u.id = m.usuario_id
     WHERE m.conversa_id = ? AND m.deletado = 0 ${beforeClause}
     ORDER BY m.id DESC
     LIMIT ?`,
    params
  );

  const ordered = messages.reverse();
  const readStatus = await getReadStatusForMessages(db, conversaId, userId, ordered);
  const mensagens = ordered.map((m) =>
    mapMessage({ ...m, lida_por_todos: readStatus[m.id] ?? false })
  );

  return {
    mensagens,
    hasMore: messages.length === limit,
    oldestId: mensagens.length > 0 ? mensagens[0].id : null,
  };
}

async function getReadStatusForMessages(db, conversaId, senderId, messages) {
  const others = await dbAll(
    db,
    `SELECT usuario_id, ultima_leitura_at FROM chat_participantes
     WHERE conversa_id = ? AND usuario_id != ?`,
    [conversaId, senderId]
  );
  const status = {};
  for (const msg of messages) {
    if (msg.usuario_id !== senderId) {
      status[msg.id] = false;
      continue;
    }
    if (others.length === 0) {
      status[msg.id] = true;
      continue;
    }
    status[msg.id] = others.every(
      (p) => p.ultima_leitura_at && new Date(p.ultima_leitura_at) >= new Date(msg.created_at)
    );
  }
  return status;
}

async function fetchMessageById(db, messageId) {
  const msg = await dbGet(
    db,
    `SELECT m.id, m.conversa_id, m.usuario_id, m.conteudo, m.tipo,
            m.anexo_url, m.anexo_nome, m.anexo_tamanho,
            m.created_at, m.editado_at, m.deletado, u.nome AS autor_nome
     FROM chat_mensagens m
     LEFT JOIN usuarios u ON u.id = m.usuario_id
     WHERE m.id = ?`,
    [messageId]
  );
  return mapMessage({ ...msg, lida_por_todos: false });
}

async function sendMessage(db, conversaId, userId, conteudo) {
  if (!(await isParticipant(db, conversaId, userId))) throw new Error('Acesso negado');
  const clean = sanitizeMessageContent(conteudo);
  if (!clean) throw new Error('Mensagem vazia');

  const { lastID } = await dbRun(
    db,
    `INSERT INTO chat_mensagens (conversa_id, usuario_id, conteudo, tipo) VALUES (?, ?, ?, 'texto')`,
    [conversaId, userId, clean]
  );
  await dbRun(db, 'UPDATE chat_conversas SET updated_at = CURRENT_TIMESTAMP WHERE id = ?', [conversaId]);
  return fetchMessageById(db, lastID);
}

async function sendImageMessage(db, conversaId, userId, { url, nome, tamanho, legenda }) {
  if (!(await isParticipant(db, conversaId, userId))) throw new Error('Acesso negado');
  const cleanLegenda = legenda ? sanitizeMessageContent(legenda) : '';

  const { lastID } = await dbRun(
    db,
    `INSERT INTO chat_mensagens (
      conversa_id, usuario_id, conteudo, tipo, anexo_url, anexo_nome, anexo_tamanho
    ) VALUES (?, ?, ?, 'imagem', ?, ?, ?)`,
    [conversaId, userId, cleanLegenda, url, nome, tamanho]
  );
  await dbRun(db, 'UPDATE chat_conversas SET updated_at = CURRENT_TIMESTAMP WHERE id = ?', [conversaId]);
  return fetchMessageById(db, lastID);
}

async function softDeleteMessage(db, conversaId, messageId, userId) {
  if (!(await isParticipant(db, conversaId, userId))) throw new Error('Acesso negado');
  const msg = await dbGet(
    db,
    'SELECT usuario_id FROM chat_mensagens WHERE id = ? AND conversa_id = ? AND deletado = 0',
    [messageId, conversaId]
  );
  if (!msg) throw new Error('Mensagem não encontrada');
  if (msg.usuario_id !== userId) throw new Error('Só é possível excluir suas próprias mensagens');
  await dbRun(
    db,
    'UPDATE chat_mensagens SET deletado = 1, deletado_em = CURRENT_TIMESTAMP WHERE id = ?',
    [messageId]
  );
}

async function markAsRead(db, conversaId, userId) {
  if (!(await isParticipant(db, conversaId, userId))) throw new Error('Acesso negado');
  await dbRun(
    db,
    'UPDATE chat_participantes SET ultima_leitura_at = CURRENT_TIMESTAMP WHERE conversa_id = ? AND usuario_id = ?',
    [conversaId, userId]
  );
  return { conversa_id: conversaId, usuario_id: userId };
}

async function listChatUsers(db, userId, search = '') {
  const term = `%${search || ''}%`;
  let rows;
  if (search) {
    rows = await dbAll(
      db,
      `SELECT id, nome, email, cargo FROM usuarios
       WHERE id != ? AND ativo = 1 AND (nome LIKE ? OR email LIKE ?)
       ORDER BY nome COLLATE NOCASE LIMIT 30`,
      [userId, term, term]
    );
  } else {
    rows = await dbAll(
      db,
      `SELECT id, nome, email, cargo FROM usuarios WHERE id != ? AND ativo = 1 ORDER BY nome COLLATE NOCASE`,
      [userId]
    );
  }
  return rows || [];
}

module.exports = {
  listConversations,
  getTotalUnread,
  createDirectConversation,
  createGroupConversation,
  setArchived,
  getMessages,
  sendMessage,
  sendImageMessage,
  softDeleteMessage,
  markAsRead,
  listChatUsers,
  isParticipant,
};
