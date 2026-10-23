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

// ── Frotas Etapa 1 (portal do motorista) ────────────────────────────────────
// RN-F1.01: os 12 itens do formulario de papel, na ordem do papel. Chaves fixas — ficam gravadas em itens_json.
const ITENS_CHECKLIST = [
  { chave: 'pneus_estepe', rotulo: 'Pneus e estepe' },
  { chave: 'farois_lanternas', rotulo: 'Faróis / lanternas' },
  { chave: 'setas_luz_freio', rotulo: 'Setas / luz de freio' },
  { chave: 'parabrisa_vidros', rotulo: 'Parabrisa / vidros' },
  { chave: 'espelhos_retrovisores', rotulo: 'Espelhos / retrovisores' },
  { chave: 'limpadores_agua', rotulo: 'Limpadores / água' },
  { chave: 'oleo_motor', rotulo: 'Óleo do motor / vazamentos' },
  { chave: 'arrefecimento', rotulo: 'Arrefecimento / nível' },
  { chave: 'freios', rotulo: 'Freios / freio de estacionamento' },
  { chave: 'buzina_cintos', rotulo: 'Buzina / cintos' },
  { chave: 'documentos_equipamentos', rotulo: 'Documentos / equipamentos' },
  { chave: 'carroceria_carga', rotulo: 'Carroceria / amarração da carga' },
];
const RESPOSTAS_ITEM = ['OK', 'NA', 'FALHA'];
const VISTAS_AVARIA = ['lateral_esquerda', 'lateral_direita', 'superior', 'frente', 'traseira'];
const TIPOS_AVARIA = ['R', 'A', 'T', 'Q', 'O'];
const NIVEIS_COMBUSTIVEL = ['vazio', '1/4', '1/2', '3/4', 'cheio'];
const TIPOS_REGISTRO = ['saida', 'retorno', 'inspecao'];
const ITENS_LEGADOS = ['pneus_ok', 'oleo_ok', 'luzes_ok', 'freios_ok', 'extintor_ok', 'documentos_ok', 'limpeza_ok'];
// Os 7 *_ok antigos continuam gravados a partir dos 12 (extintor e limpeza nao estao no papel -> 1).
const LEGADO_DE_ITEM = {
  pneus_ok: 'pneus_estepe', oleo_ok: 'oleo_motor', luzes_ok: 'farois_lanternas', freios_ok: 'freios',
  documentos_ok: 'documentos_equipamentos',
};

/**
 * F2-6: a UNICA regua da situacao de um registro (portal, rota antiga, painel, exportacao).
 *  - com `itens` (RN-F1.02): PENDENCIA se algum FALHA ou houver avaria; senao INCOMPLETO se faltar algum dos 12; senao OK.
 *  - sem `itens` (rota antiga, F2-7 / RN-F1.03 reescrita): os 7 `*_ok` — algum enviado = 0 -> PENDENCIA; os 7 enviados = 1 -> OK;
 *    algum ausente -> INCOMPLETO. (Antes, item ausente valia OK: um POST so com veiculo e data saia aprovado — A3.)
 */
function situacaoDoRegistro({ itens, avarias, legados } = {}) {
  if (itens && typeof itens === 'object') {
    const valores = ITENS_CHECKLIST.map((i) => itens[i.chave]);
    if (valores.includes('FALHA') || (Array.isArray(avarias) && avarias.length > 0)) return 'PENDENCIA';
    if (valores.some((v) => !RESPOSTAS_ITEM.includes(v))) return 'INCOMPLETO';
    return 'OK';
  }
  const l = legados || {};
  const valores = ITENS_LEGADOS.map((k) => l[k]);
  if (valores.some((v) => v === 0 || v === false || v === '0')) return 'PENDENCIA';
  if (valores.some((v) => v == null)) return 'INCOMPLETO';
  return 'OK';
}

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

  // Frotas Etapa 1 (portal do motorista): saida/retorno/inspecao reaproveitam frotas_checklists (B1)
  await safeAlter(db, "ALTER TABLE frotas_checklists ADD COLUMN tipo_registro TEXT DEFAULT 'inspecao'");
  await safeAlter(db, 'ALTER TABLE frotas_checklists ADD COLUMN km REAL');
  await safeAlter(db, 'ALTER TABLE frotas_checklists ADD COLUMN horario TEXT');
  await safeAlter(db, 'ALTER TABLE frotas_checklists ADD COLUMN nivel_combustivel TEXT');
  await safeAlter(db, 'ALTER TABLE frotas_checklists ADD COLUMN itens_json TEXT');
  await safeAlter(db, 'ALTER TABLE frotas_checklists ADD COLUMN avarias_json TEXT');
  await safeAlter(db, 'ALTER TABLE frotas_checklists ADD COLUMN status_geral TEXT');
  await safeAlter(db, 'ALTER TABLE frotas_checklists ADD COLUMN viagem_id INTEGER');
  await safeAlter(db, 'ALTER TABLE frotas_viagens ADD COLUMN origem TEXT');
  await safeAlter(db, 'ALTER TABLE frotas_abastecimentos ADD COLUMN km_desde_anterior REAL');

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
  ITENS_CHECKLIST,
  RESPOSTAS_ITEM,
  VISTAS_AVARIA,
  TIPOS_AVARIA,
  NIVEIS_COMBUSTIVEL,
  TIPOS_REGISTRO,
  ITENS_LEGADOS,
  LEGADO_DE_ITEM,
  situacaoDoRegistro,
};
