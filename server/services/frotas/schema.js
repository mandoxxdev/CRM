/**
 * Schema e migrations do módulo Frotas — GMP Industriais
 */

const { dbRun, dbGet, dbAll } = require('./db');

const TIPOS_VEICULO_SEED = [
  ['Automóvel', 'leve'],
  ['Caminhonete', 'leve'],
  ['Caminhão', 'pesado'],
  ['Van', 'leve'],
  ['Empilhadeira', 'industrial'],
  ['Trator', 'industrial'],
  ['Moto', 'leve'],
  ['Ônibus / Micro-ônibus', 'pesado'],
  ['Reboque / Carreta', 'pesado'],
  ['Máquina industrial', 'industrial'],
];

const TIPOS_MEDICAO = ['km', 'horimetro'];
const CENTROS_CUSTO_GMP = [
  'CC-Produção', 'CC-Caldeiraria', 'CC-Usinagem', 'CC-Montagem', 'CC-Expedição',
  'CC-Assistência', 'CC-Comercial', 'CC-Administrativo', 'CC-Manutenção', 'CC-Frota',
];

const SETORES_GMP = [
  'Produção', 'Caldeiraria', 'Usinagem', 'Montagem', 'Expedição',
  'Assistência Técnica', 'Comercial', 'Engenharia', 'Administrativo', 'Manutenção',
];

const STATUS_VEICULO = ['ativo', 'manutencao', 'inativo', 'vendido'];
const TIPOS_COMBUSTIVEL = ['gasolina', 'etanol', 'flex', 'diesel', 'gnv', 'eletrico', 'outro'];
const TIPOS_MANUTENCAO = ['preventiva', 'corretiva'];
const TIPOS_DOCUMENTO = ['ipva', 'licenciamento', 'seguro', 'crlv', 'rastreador', 'outros'];
const STATUS_VIAGEM = ['solicitada', 'aprovada', 'em_andamento', 'concluida', 'cancelada'];

async function safeAlter(db, sql) {
  try {
    await dbRun(db, sql);
  } catch (e) {
    /* coluna já existe */
  }
}

async function initSchema(db) {
  await dbRun(db, `CREATE TABLE IF NOT EXISTS frotas_tipos_veiculo (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL UNIQUE,
    categoria TEXT DEFAULT 'leve',
    ativo INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  await dbRun(db, `CREATE TABLE IF NOT EXISTS frotas_veiculos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    placa TEXT NOT NULL UNIQUE,
    modelo TEXT,
    marca TEXT,
    ano INTEGER,
    tipo_id INTEGER,
    tipo_texto TEXT,
    status TEXT DEFAULT 'ativo',
    km_atual REAL DEFAULT 0,
    combustivel TEXT DEFAULT 'diesel',
    setor_responsavel TEXT,
    cor TEXT,
    chassi TEXT,
    renavam TEXT,
    observacoes TEXT,
    ativo INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tipo_id) REFERENCES frotas_tipos_veiculo(id)
  )`);

  await dbRun(db, `CREATE TABLE IF NOT EXISTS frotas_motoristas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    cpf TEXT,
    usuario_id INTEGER,
    cnh_numero TEXT,
    cnh_categoria TEXT,
    cnh_validade TEXT,
    telefone TEXT,
    email TEXT,
    setor TEXT,
    status TEXT DEFAULT 'ativo',
    observacoes TEXT,
    ativo INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  await dbRun(db, `CREATE TABLE IF NOT EXISTS frotas_manutencoes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    veiculo_id INTEGER NOT NULL,
    tipo TEXT DEFAULT 'preventiva',
    descricao TEXT NOT NULL,
    oficina TEXT,
    custo REAL DEFAULT 0,
    pecas_descricao TEXT,
    km_manutencao REAL,
    data_manutencao TEXT,
    proxima_revisao_km REAL,
    proxima_revisao_data TEXT,
    status TEXT DEFAULT 'concluida',
    usuario_id INTEGER,
    usuario_nome TEXT,
    observacoes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (veiculo_id) REFERENCES frotas_veiculos(id)
  )`);

  await dbRun(db, `CREATE TABLE IF NOT EXISTS frotas_abastecimentos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    veiculo_id INTEGER NOT NULL,
    motorista_id INTEGER,
    data_abastecimento TEXT NOT NULL,
    litros REAL NOT NULL,
    valor_total REAL DEFAULT 0,
    valor_litro REAL DEFAULT 0,
    posto TEXT,
    km_abastecimento REAL,
    combustivel_tipo TEXT,
    consumo_medio REAL,
    observacoes TEXT,
    usuario_id INTEGER,
    usuario_nome TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (veiculo_id) REFERENCES frotas_veiculos(id),
    FOREIGN KEY (motorista_id) REFERENCES frotas_motoristas(id)
  )`);

  await dbRun(db, `CREATE TABLE IF NOT EXISTS frotas_multas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    veiculo_id INTEGER NOT NULL,
    motorista_id INTEGER,
    data_infracao TEXT,
    descricao TEXT,
    valor REAL DEFAULT 0,
    pontos INTEGER DEFAULT 0,
    status_pagamento TEXT DEFAULT 'pendente',
    data_vencimento TEXT,
    data_pagamento TEXT,
    numero_auto TEXT,
    observacoes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (veiculo_id) REFERENCES frotas_veiculos(id),
    FOREIGN KEY (motorista_id) REFERENCES frotas_motoristas(id)
  )`);

  await dbRun(db, `CREATE TABLE IF NOT EXISTS frotas_documentos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    veiculo_id INTEGER NOT NULL,
    tipo TEXT NOT NULL,
    descricao TEXT,
    numero_documento TEXT,
    seguradora TEXT,
    valor REAL DEFAULT 0,
    data_emissao TEXT,
    data_vencimento TEXT,
    alerta_dias_antes INTEGER DEFAULT 30,
    status TEXT DEFAULT 'ativo',
    observacoes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (veiculo_id) REFERENCES frotas_veiculos(id)
  )`);

  await dbRun(db, `CREATE TABLE IF NOT EXISTS frotas_viagens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    veiculo_id INTEGER NOT NULL,
    motorista_id INTEGER,
    data_saida TEXT,
    data_retorno TEXT,
    km_saida REAL,
    km_retorno REAL,
    km_rodado REAL,
    destino TEXT,
    finalidade TEXT,
    setor TEXT,
    status TEXT DEFAULT 'solicitada',
    aprovador_id INTEGER,
    aprovador_nome TEXT,
    data_aprovacao TEXT,
    observacoes TEXT,
    solicitante_id INTEGER,
    solicitante_nome TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (veiculo_id) REFERENCES frotas_veiculos(id),
    FOREIGN KEY (motorista_id) REFERENCES frotas_motoristas(id)
  )`);

  await dbRun(db, `CREATE TABLE IF NOT EXISTS frotas_checklists (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    veiculo_id INTEGER NOT NULL,
    motorista_id INTEGER,
    data_checklist TEXT NOT NULL,
    pneus_ok INTEGER DEFAULT 1,
    oleo_ok INTEGER DEFAULT 1,
    luzes_ok INTEGER DEFAULT 1,
    freios_ok INTEGER DEFAULT 1,
    extintor_ok INTEGER DEFAULT 1,
    documentos_ok INTEGER DEFAULT 1,
    limpeza_ok INTEGER DEFAULT 1,
    observacoes TEXT,
    aprovado INTEGER DEFAULT 1,
    usuario_id INTEGER,
    usuario_nome TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (veiculo_id) REFERENCES frotas_veiculos(id),
    FOREIGN KEY (motorista_id) REFERENCES frotas_motoristas(id)
  )`);

  await safeAlter(db, 'ALTER TABLE frotas_veiculos ADD COLUMN foto TEXT');
  await safeAlter(db, 'ALTER TABLE frotas_veiculos ADD COLUMN motorista_id INTEGER');
  await safeAlter(db, 'ALTER TABLE frotas_veiculos ADD COLUMN centro_custo TEXT');
  await safeAlter(db, 'ALTER TABLE frotas_veiculos ADD COLUMN horimetro_atual REAL DEFAULT 0');
  await safeAlter(db, 'ALTER TABLE frotas_veiculos ADD COLUMN tipo_medicao TEXT DEFAULT \'km\'');
  await safeAlter(db, 'ALTER TABLE frotas_veiculos ADD COLUMN consumo_medio_esperado REAL');
  await safeAlter(db, 'ALTER TABLE frotas_manutencoes ADD COLUMN requisicao_almox_id INTEGER');
  await safeAlter(db, 'ALTER TABLE frotas_motoristas ADD COLUMN perfil_frota TEXT');

  for (const [nome, categoria] of TIPOS_VEICULO_SEED) {
    await dbRun(db, 'INSERT OR IGNORE INTO frotas_tipos_veiculo (nome, categoria) VALUES (?, ?)', [nome, categoria]);
  }

  console.log('✅ Schema Frotas inicializado');
}

module.exports = {
  initSchema,
  TIPOS_VEICULO_SEED,
  SETORES_GMP,
  CENTROS_CUSTO_GMP,
  STATUS_VEICULO,
  TIPOS_COMBUSTIVEL,
  TIPOS_MANUTENCAO,
  TIPOS_DOCUMENTO,
  TIPOS_MEDICAO,
  STATUS_VIAGEM,
};
