const { dbRun, dbGet } = require('./db');

/** SQLite não altera CHECK em ALTER TABLE — recria a tabela se 'imagem' ainda não for permitido. */
async function migrateChatMensagensAllowImagem(db) {
  const row = await dbGet(db, "SELECT sql FROM sqlite_master WHERE type='table' AND name='chat_mensagens'");
  if (!row?.sql || row.sql.includes("'imagem'")) return;

  await dbRun(db, 'PRAGMA foreign_keys = OFF');
  try {
    await dbRun(db, 'BEGIN IMMEDIATE');
    await dbRun(db, `CREATE TABLE chat_mensagens_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversa_id INTEGER NOT NULL,
      usuario_id INTEGER,
      conteudo TEXT NOT NULL,
      tipo TEXT DEFAULT 'texto' CHECK(tipo IN ('texto', 'sistema', 'imagem')),
      anexo_url TEXT,
      anexo_nome TEXT,
      anexo_tamanho INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      editado_at DATETIME,
      deletado INTEGER DEFAULT 0,
      deletado_em DATETIME,
      FOREIGN KEY (conversa_id) REFERENCES chat_conversas(id) ON DELETE CASCADE,
      FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
    )`);
    await dbRun(db, `INSERT INTO chat_mensagens_new (
      id, conversa_id, usuario_id, conteudo, tipo, anexo_url, anexo_nome, anexo_tamanho,
      created_at, editado_at, deletado, deletado_em
    ) SELECT
      id, conversa_id, usuario_id, conteudo, tipo, anexo_url, anexo_nome, anexo_tamanho,
      created_at, editado_at, deletado, deletado_em
    FROM chat_mensagens`);
    await dbRun(db, 'DROP TABLE chat_mensagens');
    await dbRun(db, 'ALTER TABLE chat_mensagens_new RENAME TO chat_mensagens');
    await dbRun(db, 'CREATE INDEX IF NOT EXISTS idx_chat_mensagens_conversa ON chat_mensagens(conversa_id, created_at)');
    await dbRun(db, 'COMMIT');
    console.log('[chat] Migração aplicada: tipo "imagem" permitido em chat_mensagens');
  } catch (e) {
    try { await dbRun(db, 'ROLLBACK'); } catch (_) { /* ignore */ }
    console.error('[chat] Falha na migração chat_mensagens (tipo imagem):', e);
    throw e;
  } finally {
    await dbRun(db, 'PRAGMA foreign_keys = ON');
  }
}

async function initChatSchema(db) {
  await dbRun(db, `CREATE TABLE IF NOT EXISTS chat_conversas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tipo TEXT NOT NULL CHECK(tipo IN ('direta', 'grupo')),
    nome TEXT,
    criado_por INTEGER,
    arquivada INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (criado_por) REFERENCES usuarios(id)
  )`);

  await dbRun(db, `CREATE TABLE IF NOT EXISTS chat_participantes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversa_id INTEGER NOT NULL,
    usuario_id INTEGER NOT NULL,
    ultima_leitura_at DATETIME,
    is_admin INTEGER DEFAULT 0,
    joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(conversa_id, usuario_id),
    FOREIGN KEY (conversa_id) REFERENCES chat_conversas(id) ON DELETE CASCADE,
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
  )`);

  await dbRun(db, `CREATE TABLE IF NOT EXISTS chat_mensagens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversa_id INTEGER NOT NULL,
    usuario_id INTEGER,
    conteudo TEXT NOT NULL,
    tipo TEXT DEFAULT 'texto' CHECK(tipo IN ('texto', 'sistema', 'imagem')),
    anexo_url TEXT,
    anexo_nome TEXT,
    anexo_tamanho INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    editado_at DATETIME,
    deletado INTEGER DEFAULT 0,
    deletado_em DATETIME,
    FOREIGN KEY (conversa_id) REFERENCES chat_conversas(id) ON DELETE CASCADE,
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
  )`);

  const migrations = [
    'ALTER TABLE chat_conversas ADD COLUMN arquivada INTEGER DEFAULT 0',
    'ALTER TABLE chat_mensagens ADD COLUMN anexo_url TEXT',
    'ALTER TABLE chat_mensagens ADD COLUMN anexo_nome TEXT',
    'ALTER TABLE chat_mensagens ADD COLUMN anexo_tamanho INTEGER',
    'ALTER TABLE chat_mensagens ADD COLUMN deletado_em DATETIME',
  ];
  for (const sql of migrations) {
    try { await dbRun(db, sql); } catch (_) { /* coluna já existe */ }
  }

  await migrateChatMensagensAllowImagem(db);

  await dbRun(db, `CREATE INDEX IF NOT EXISTS idx_chat_participantes_usuario ON chat_participantes(usuario_id)`);
  await dbRun(db, `CREATE INDEX IF NOT EXISTS idx_chat_mensagens_conversa ON chat_mensagens(conversa_id, created_at)`);
  await dbRun(db, `CREATE INDEX IF NOT EXISTS idx_chat_conversas_updated ON chat_conversas(updated_at DESC)`);
}

module.exports = { initChatSchema };
