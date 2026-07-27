/**
 * Schema do módulo TODOLIST — Kanban de atividades de programação
 */

const { dbRun } = require('./db');

async function safeAlter(db, sql) {
  try {
    await dbRun(db, sql);
  } catch (e) {
    /* coluna já existe */
  }
}

async function initSchema(db) {
  await dbRun(db, `CREATE TABLE IF NOT EXISTS todolist_tarefas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    titulo TEXT NOT NULL,
    descricao TEXT,
    status TEXT NOT NULL DEFAULT 'a_fazer',
    prioridade TEXT DEFAULT 'media',
    responsavel_id INTEGER,
    prazo TEXT,
    ordem INTEGER DEFAULT 0,
    data_conclusao TEXT,
    created_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  await dbRun(db, `CREATE INDEX IF NOT EXISTS idx_todolist_tarefas_status ON todolist_tarefas(status)`);
  await dbRun(db, `CREATE INDEX IF NOT EXISTS idx_todolist_tarefas_responsavel ON todolist_tarefas(responsavel_id)`);
  await dbRun(db, `CREATE INDEX IF NOT EXISTS idx_todolist_tarefas_ordem ON todolist_tarefas(status, ordem)`);

  await safeAlter(db, `ALTER TABLE todolist_tarefas ADD COLUMN data_conclusao TEXT`);
  await safeAlter(db, `ALTER TABLE todolist_tarefas ADD COLUMN prazo TEXT`);
  await safeAlter(db, `ALTER TABLE todolist_tarefas ADD COLUMN ordem INTEGER DEFAULT 0`);
}

module.exports = {
  initSchema,
  STATUS_COLUNAS: ['a_fazer', 'em_progresso', 'em_revisao', 'concluido'],
  PRIORIDADES: ['baixa', 'media', 'alta', 'urgente'],
};
