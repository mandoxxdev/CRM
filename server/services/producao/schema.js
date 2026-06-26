/**
 * Schema e migrations do módulo Produção — GMP Industriais
 */

const { dbRun, dbGet } = require('./db');

const STATUS_OP = ['planejada', 'liberada', 'em_producao', 'concluida', 'cancelada'];
const PRIORIDADES = ['baixa', 'normal', 'alta', 'urgente'];
const STATUS_MAQUINA = ['disponivel', 'em_producao', 'parada', 'manutencao', 'inativa'];
const SETORES_GMP = [
  'Caldeiraria', 'Usinagem', 'Montagem', 'Pintura', 'Expedição', 'Manutenção', 'Geral',
];

const MOTIVOS_PARADA_SEED = [
  ['Setup / Troca de ferramenta', 'setup', 'planejada'],
  ['Falta de material', 'material', 'nao_planejada'],
  ['Manutenção corretiva', 'manutencao', 'nao_planejada'],
  ['Manutenção preventiva', 'manutencao', 'planejada'],
  ['Falta de operador', 'pessoal', 'nao_planejada'],
  ['Ajuste de processo', 'processo', 'planejada'],
  ['Qualidade / Retrabalho', 'qualidade', 'nao_planejada'],
  ['Energia / Utilidades', 'utilidades', 'nao_planejada'],
  ['Reunião / Treinamento', 'pessoal', 'planejada'],
  ['Outros', 'outros', 'nao_planejada'],
];

const ETAPAS_ROTEIRO_PADRAO = [
  ['Corte / Preparação', 1, 60],
  ['Caldeiraria', 2, 480],
  ['Usinagem', 3, 360],
  ['Montagem', 4, 480],
  ['Pintura / Acabamento', 5, 120],
  ['Teste / Inspeção', 6, 60],
  ['Expedição', 7, 30],
];

async function safeAlter(db, sql) {
  try {
    await dbRun(db, sql);
  } catch (e) {
    /* coluna já existe */
  }
}

async function initSchema(db) {
  await dbRun(db, `CREATE TABLE IF NOT EXISTS producao_maquinas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    codigo TEXT NOT NULL UNIQUE,
    nome TEXT NOT NULL,
    setor TEXT,
    tipo TEXT DEFAULT 'maquina',
    status TEXT DEFAULT 'disponivel',
    capacidade_hora REAL DEFAULT 1,
    centro_trabalho TEXT,
    observacoes TEXT,
    ativo INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  await dbRun(db, `CREATE TABLE IF NOT EXISTS producao_motivos_parada (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    descricao TEXT NOT NULL,
    categoria TEXT DEFAULT 'outros',
    tipo TEXT DEFAULT 'nao_planejada',
    ativo INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  await dbRun(db, `CREATE TABLE IF NOT EXISTS producao_ops (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    numero_op TEXT NOT NULL UNIQUE,
    produto_codigo TEXT,
    produto_descricao TEXT NOT NULL,
    quantidade_planejada REAL DEFAULT 1,
    quantidade_produzida REAL DEFAULT 0,
    quantidade_refugo REAL DEFAULT 0,
    status TEXT DEFAULT 'planejada',
    prioridade TEXT DEFAULT 'normal',
    data_planejada TEXT,
    data_prevista_fim TEXT,
    data_inicio TEXT,
    data_fim TEXT,
    maquina_id INTEGER,
    os_id INTEGER,
    cliente_id INTEGER,
    projeto_id INTEGER,
    observacoes TEXT,
    usuario_criacao_id INTEGER,
    usuario_criacao_nome TEXT,
    ativo INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (maquina_id) REFERENCES producao_maquinas(id),
    FOREIGN KEY (os_id) REFERENCES ordens_servico(id)
  )`);

  await dbRun(db, `CREATE TABLE IF NOT EXISTS producao_op_etapas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    op_id INTEGER NOT NULL,
    sequencia INTEGER NOT NULL,
    nome TEXT NOT NULL,
    maquina_id INTEGER,
    tempo_previsto_min REAL DEFAULT 0,
    status TEXT DEFAULT 'pendente',
    quantidade_produzida REAL DEFAULT 0,
    observacoes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (op_id) REFERENCES producao_ops(id) ON DELETE CASCADE,
    FOREIGN KEY (maquina_id) REFERENCES producao_maquinas(id)
  )`);

  await dbRun(db, `CREATE TABLE IF NOT EXISTS producao_apontamentos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    op_id INTEGER NOT NULL,
    etapa_id INTEGER,
    maquina_id INTEGER,
    colaborador_id INTEGER,
    operador_nome TEXT,
    tipo TEXT DEFAULT 'producao',
    data_inicio TEXT NOT NULL,
    data_fim TEXT,
    quantidade_produzida REAL DEFAULT 0,
    quantidade_refugo REAL DEFAULT 0,
    observacoes TEXT,
    usuario_id INTEGER,
    usuario_nome TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (op_id) REFERENCES producao_ops(id) ON DELETE CASCADE,
    FOREIGN KEY (etapa_id) REFERENCES producao_op_etapas(id),
    FOREIGN KEY (maquina_id) REFERENCES producao_maquinas(id),
    FOREIGN KEY (colaborador_id) REFERENCES colaboradores(id)
  )`);

  await dbRun(db, `CREATE TABLE IF NOT EXISTS producao_paradas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    maquina_id INTEGER NOT NULL,
    op_id INTEGER,
    motivo_id INTEGER,
    motivo_texto TEXT,
    data_inicio TEXT NOT NULL,
    data_fim TEXT,
    duracao_minutos REAL,
    observacoes TEXT,
    usuario_id INTEGER,
    usuario_nome TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (maquina_id) REFERENCES producao_maquinas(id),
    FOREIGN KEY (op_id) REFERENCES producao_ops(id),
    FOREIGN KEY (motivo_id) REFERENCES producao_motivos_parada(id)
  )`);

  await dbRun(db, `CREATE TABLE IF NOT EXISTS producao_roteiros (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    produto_codigo TEXT NOT NULL UNIQUE,
    produto_descricao TEXT,
    versao TEXT DEFAULT '1.0',
    ativo INTEGER DEFAULT 1,
    observacoes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  await dbRun(db, `CREATE TABLE IF NOT EXISTS producao_roteiro_etapas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    roteiro_id INTEGER NOT NULL,
    sequencia INTEGER NOT NULL,
    nome TEXT NOT NULL,
    maquina_id INTEGER,
    tempo_previsto_min REAL DEFAULT 0,
    observacoes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (roteiro_id) REFERENCES producao_roteiros(id) ON DELETE CASCADE,
    FOREIGN KEY (maquina_id) REFERENCES producao_maquinas(id)
  )`);

  await safeAlter(db, 'ALTER TABLE producao_ops ADD COLUMN requisicao_almox_id INTEGER');

  for (const [desc, cat, tipo] of MOTIVOS_PARADA_SEED) {
    const exists = await dbGet(db, 'SELECT id FROM producao_motivos_parada WHERE descricao = ?', [desc]);
    if (!exists) {
      await dbRun(db, 'INSERT INTO producao_motivos_parada (descricao, categoria, tipo) VALUES (?, ?, ?)', [desc, cat, tipo]);
    }
  }

  const maqCount = await dbGet(db, 'SELECT COUNT(*) as c FROM producao_maquinas');
  if ((maqCount?.c || 0) === 0) {
    const seeds = [
      ['CAL-01', 'Torno Caldeiraria 01', 'Caldeiraria', 'torno', 2],
      ['USI-01', 'Centro Usinagem CNC 01', 'Usinagem', 'cnc', 4],
      ['MON-01', 'Bancada Montagem 01', 'Montagem', 'bancada', 1],
      ['MON-02', 'Bancada Montagem 02', 'Montagem', 'bancada', 1],
      ['PIN-01', 'Cabine Pintura', 'Pintura', 'cabine', 1],
    ];
    for (const [codigo, nome, setor, tipo, cap] of seeds) {
      await dbRun(db, `INSERT INTO producao_maquinas (codigo, nome, setor, tipo, capacidade_hora, centro_trabalho)
        VALUES (?, ?, ?, ?, ?, ?)`, [codigo, nome, setor, tipo, cap, setor]);
    }
  }

  console.log('✅ Schema Produção inicializado');
}

module.exports = {
  initSchema,
  STATUS_OP,
  PRIORIDADES,
  STATUS_MAQUINA,
  SETORES_GMP,
  MOTIVOS_PARADA_SEED,
  ETAPAS_ROTEIRO_PADRAO,
};
