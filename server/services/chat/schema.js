const { dbRun } = require('./db');

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
    tipo TEXT DEFAULT 'texto' CHECK(tipo IN ('texto', 'sistema')),
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

  await dbRun(db, `CREATE INDEX IF NOT EXISTS idx_chat_participantes_usuario ON chat_participantes(usuario_id)`);
  await dbRun(db, `CREATE INDEX IF NOT EXISTS idx_chat_mensagens_conversa ON chat_mensagens(conversa_id, created_at)`);
  await dbRun(db, `CREATE INDEX IF NOT EXISTS idx_chat_conversas_updated ON chat_conversas(updated_at DESC)`);
}

module.exports = { initChatSchema };
