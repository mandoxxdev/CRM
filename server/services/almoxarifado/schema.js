/**
 * Schema initialization and migrations for almoxarifado v3
 */

const { dbRun, dbGet } = require('./db');

const CATEGORIAS_SEED = [
  'Aço carbono', 'Aço inox', 'Chapas', 'Tubos', 'Perfis estruturais', 'Barras e eixos',
  'Componentes usinados', 'Motores elétricos', 'Redutores', 'Bombas', 'Válvulas', 'Conexões',
  'Pneumática', 'Hidráulica', 'Elétrica', 'Automação', 'Sensores e instrumentos', 'Rolamentos',
  'Retentores', 'Elementos de fixação', 'Solda e consumíveis', 'Pintura', 'EPIs', 'Ferramentas',
  'Materiais de montagem', 'Materiais fornecidos pelo cliente', 'Sucata e sobras reaproveitáveis',
];

const TIPOS_MATERIAL_ENUM = [
  'chapa', 'tubo', 'perfil', 'barra', 'motor', 'redutor', 'rolamento', 'valvula', 'conexao',
  'sensor', 'painel_eletrico', 'componente_pneumatico', 'tinta', 'consumivel', 'epi',
  'ferramenta', 'item_montagem', 'item_comprado', 'item_fabricado', 'item_cliente',
];

const TIPOS_LOCALIZACAO = [
  'Almoxarifado', 'Rua', 'Prateleira', 'Gaveta', 'Box', 'Área externa', 'Área de corte',
  'Área de montagem', 'Área de elétrica', 'Área de pintura', 'Área de expedição',
  'Área de materiais do cliente', 'Área de quarentena/inspeção',
];

const UNIDADES_SEED = [
  ['UN', 'Unidade'], ['KG', 'Quilograma'], ['M', 'Metro'], ['M2', 'Metro quadrado'],
  ['M3', 'Metro cúbico'], ['L', 'Litro'], ['PC', 'Peça'], ['CX', 'Caixa'], ['RL', 'Rolo'],
  ['PAR', 'Par'], ['TON', 'Tonelada'], ['MM', 'Milímetro'],
];

const SETORES_REQUISICAO = [
  'Engenharia', 'Produção', 'Caldeiraria', 'Usinagem', 'Elétrica', 'Automação',
  'Montagem', 'Pintura', 'Expedição', 'Assistência técnica', 'Obras externas',
];

const TIPOS_MOVIMENTO = [
  'ENTRADA_COMPRA', 'ENTRADA_MANUAL', 'ENTRADA_DEVOLUCAO', 'SAIDA_PRODUCAO',
  'SAIDA_MONTAGEM', 'SAIDA_ASSISTENCIA', 'TRANSFERENCIA', 'RESERVA', 'LIBERACAO_RESERVA',
  'BLOQUEIO', 'DESBLOQUEIO', 'AJUSTE_POSITIVO', 'AJUSTE_NEGATIVO', 'SUCATA', 'PERDA', 'RETRABALHO',
  'ENTRADA', 'SAIDA', 'AJUSTE', 'DEVOLUCAO', 'ESTORNO',
];

const FAMILIAS_SEED = [
  ['PAR', 'Parafusos e Porcas', 'Elementos de fixação — parafusos, porcas e arruelas'],
  ['ROL', 'Rolamentos', 'Rolamentos e mancais'],
  ['VAL', 'Válvulas', 'Válvulas pneumáticas e hidráulicas'],
];

const SETORES_ALMOX_SEED = [
  ['Bancada', 'GAV', 'bancada', 1],
  ['Corredor A', 'A', 'corredor', 2],
  ['Corredor B', 'B', 'corredor', 3],
  ['Corredor C', 'C', 'corredor', 4],
  ['Área de Segurança', 'EPI', 'area', 5],
  ['Área de Ferramentas', 'FERR', 'area', 6],
  ['Área Externa', 'EXT', 'area', 7],
  ['Almoxarifado Principal', 'ALM', 'area', 8],
];

// Migrado de routes/almoxarifado.js (diff de segurança — Task 3): seed de tipos de
// material que só existia no callback do CREATE TABLE da rota.
const TIPOS_MATERIAL_ALMOX_SEED = [
  ['EPI', 'Equipamento de Proteção Individual', '🦺', '#f59e0b', 1, 1, 1, 1],
  ['Ferramenta', 'Ferramentas e utensílios controlados', '🔧', '#8b5cf6', 0, 1, 0, 1],
  ['Consumível', 'Materiais de uso contínuo', '📦', '#4facfe', 0, 0, 0, 0],
  ['Insumo', 'Matéria-prima e insumos de produção', '⚗️', '#1aa34a', 0, 0, 0, 0],
  ['Embalagem', 'Materiais de embalagem', '📫', '#06b6d4', 0, 0, 0, 0],
  ['Manutenção', 'Peças e materiais de manutenção', '⚙️', '#ef4444', 0, 0, 0, 0],
  ['Escritório', 'Material de escritório e papelaria', '📝', '#6b7280', 0, 0, 0, 0],
  ['Limpeza', 'Produtos de higiene e limpeza', '🧹', '#22c55e', 0, 0, 0, 0],
];

// Migrado de routes/almoxarifado.js (diff de segurança — Task 3): seed de localizações
// padrão que só existia no callback do CREATE TABLE da rota.
const LOCALIZACOES_ALMOX_SEED = [
  ['A-01', 'Prateleira A, Coluna 1', 'Corredor A'],
  ['A-02', 'Prateleira A, Coluna 2', 'Corredor A'],
  ['B-01', 'Prateleira B, Coluna 1', 'Corredor B'],
  ['B-02', 'Prateleira B, Coluna 2', 'Corredor B'],
  ['GAV-01', 'Gaveta 1', 'Bancada'],
  ['GAV-02', 'Gaveta 2', 'Bancada'],
  ['EPI', 'Armário de EPIs', 'Área de Segurança'],
  ['FERR', 'Painel de Ferramentas', 'Área de Ferramentas'],
];

async function safeAlter(db, sql) {
  try {
    await dbRun(db, sql);
  } catch (e) {
    if (/duplicate column name/i.test(e.message)) return;
    console.error('[almoxarifado-schema] ALTER falhou:', sql.trim().slice(0, 80), '—', e.message);
    throw e;
  }
}

/** Base tables from almoxarifado.js — ensure they exist before v3 migrations (avoids startup race). */
async function ensureBaseTables(db) {
  await dbRun(db, `CREATE TABLE IF NOT EXISTS materiais_almoxarifado (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    codigo TEXT UNIQUE NOT NULL,
    nome TEXT NOT NULL,
    descricao TEXT,
    categoria TEXT DEFAULT 'OUTROS',
    unidade TEXT DEFAULT 'UN',
    foto TEXT,
    localizacao TEXT,
    quantidade_atual REAL DEFAULT 0,
    quantidade_minima REAL DEFAULT 0,
    quantidade_maxima REAL DEFAULT 0,
    custo_unitario REAL DEFAULT 0,
    fornecedor_principal TEXT,
    codigo_fornecedor TEXT,
    ncm TEXT,
    especificacoes TEXT,
    observacoes TEXT,
    ativo INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  await dbRun(db, `CREATE TABLE IF NOT EXISTS movimentacoes_almoxarifado (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    material_id INTEGER NOT NULL,
    tipo TEXT NOT NULL,
    quantidade REAL NOT NULL,
    saldo_anterior REAL NOT NULL,
    saldo_posterior REAL NOT NULL,
    motivo TEXT,
    referencia TEXT,
    observacoes TEXT,
    usuario_id INTEGER,
    usuario_nome TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (material_id) REFERENCES materiais_almoxarifado(id)
  )`);

  await dbRun(db, `CREATE TABLE IF NOT EXISTS conferencias_almoxarifado (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    numero TEXT UNIQUE NOT NULL,
    status TEXT DEFAULT 'ABERTO',
    responsavel_id INTEGER,
    responsavel_nome TEXT,
    data_inicio DATETIME DEFAULT CURRENT_TIMESTAMP,
    data_fim DATETIME,
    observacoes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  await dbRun(db, `CREATE TABLE IF NOT EXISTS itens_conferencia_almoxarifado (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conferencia_id INTEGER NOT NULL,
    material_id INTEGER NOT NULL,
    quantidade_sistema REAL NOT NULL,
    quantidade_contada REAL,
    divergencia REAL,
    ajustado INTEGER DEFAULT 0,
    observacoes TEXT,
    FOREIGN KEY (conferencia_id) REFERENCES conferencias_almoxarifado(id),
    FOREIGN KEY (material_id) REFERENCES materiais_almoxarifado(id)
  )`);

  await dbRun(db, `CREATE TABLE IF NOT EXISTS configuracoes_almoxarifado (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chave TEXT UNIQUE NOT NULL,
    valor TEXT,
    descricao TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_by TEXT
  )`);

  await dbRun(db, `CREATE TABLE IF NOT EXISTS tipos_material_almoxarifado (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    descricao TEXT,
    icone TEXT DEFAULT '📦',
    cor TEXT DEFAULT '#4facfe',
    requer_assinatura INTEGER DEFAULT 0,
    requer_termo INTEGER DEFAULT 0,
    is_epi INTEGER DEFAULT 0,
    is_controlado INTEGER DEFAULT 0,
    ativo INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  await dbRun(db, `CREATE TABLE IF NOT EXISTS localizacoes_almoxarifado (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    codigo TEXT UNIQUE NOT NULL,
    descricao TEXT,
    setor TEXT,
    ativo INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  await dbRun(db, `CREATE TABLE IF NOT EXISTS requisicoes_almoxarifado (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    numero TEXT UNIQUE NOT NULL,
    solicitante_id INTEGER NOT NULL,
    solicitante_nome TEXT NOT NULL,
    departamento TEXT,
    os_referencia TEXT,
    urgencia TEXT DEFAULT 'NORMAL',
    status TEXT DEFAULT 'PENDENTE',
    observacoes TEXT,
    justificativa_urgencia TEXT,
    aprovador_id INTEGER,
    aprovador_nome TEXT,
    data_aprovacao DATETIME,
    data_entrega DATETIME,
    rejeicao_motivo TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  await dbRun(db, `CREATE TABLE IF NOT EXISTS itens_requisicao_almoxarifado (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    requisicao_id INTEGER NOT NULL,
    material_id INTEGER NOT NULL,
    quantidade_solicitada REAL NOT NULL,
    quantidade_atendida REAL DEFAULT 0,
    observacoes TEXT,
    FOREIGN KEY (requisicao_id) REFERENCES requisicoes_almoxarifado(id),
    FOREIGN KEY (material_id) REFERENCES materiais_almoxarifado(id)
  )`);
}

const MIGRATION_CRIAR_ALMOXARIFADO_GERAL = 'criar_almoxarifado_geral';

/**
 * Ledger de migração: cria o almoxarifado "ALM-GERAL" (idempotente via INSERT OR IGNORE)
 * e vincula a ele todas as localizações ainda sem almoxarifado_id — incluindo as seedadas
 * no próprio initSchema. Roda uma única vez (marcada em schema_migrations_almoxarifado);
 * chamadas seguintes do initSchema são no-op. Segue o padrão de migrateHistoricoNullableMaterial.
 */
async function migrateCriarAlmoxarifadoGeral(db) {
  await dbRun(db, `CREATE TABLE IF NOT EXISTS schema_migrations_almoxarifado (
    id TEXT PRIMARY KEY,
    applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  const applied = await dbGet(db,
    'SELECT 1 as ok FROM schema_migrations_almoxarifado WHERE id = ?',
    [MIGRATION_CRIAR_ALMOXARIFADO_GERAL]);
  if (applied) return;

  const tableRow = await dbGet(db,
    `SELECT name FROM sqlite_master WHERE type='table' AND name='localizacoes_almoxarifado'`);
  if (!tableRow) {
    await dbRun(db, 'INSERT OR IGNORE INTO schema_migrations_almoxarifado (id) VALUES (?)',
      [MIGRATION_CRIAR_ALMOXARIFADO_GERAL]);
    return;
  }

  await dbRun(db, `INSERT OR IGNORE INTO almoxarifados (codigo, nome, descricao)
    VALUES ('ALM-GERAL', 'Almoxarifado Geral', 'Almoxarifado padrão criado automaticamente na migração inicial')`);
  const geral = await dbGet(db, `SELECT id FROM almoxarifados WHERE codigo = 'ALM-GERAL'`);
  if (geral) {
    await dbRun(db, 'UPDATE localizacoes_almoxarifado SET almoxarifado_id = ? WHERE almoxarifado_id IS NULL', [geral.id]);
  }

  // OR IGNORE: no boot há duas chamadas de initSchema em paralelo (routes/almoxarifado.js:56
  // fire-and-forget + extended.js runInitSchemaWithRetry) que podem interlear num DB fresco —
  // ambas passam pelo `if (applied) return;` acima antes de qualquer uma commitar a marca, então
  // a perdedora bateria numa violação de PK aqui. Com OR IGNORE ela é auto-curativa e silenciosa
  // (a vencedora já persistiu a marca; a corrida não perde nem duplica o vínculo/ALM-GERAL).
  await dbRun(db, 'INSERT OR IGNORE INTO schema_migrations_almoxarifado (id) VALUES (?)',
    [MIGRATION_CRIAR_ALMOXARIFADO_GERAL]);
  console.log('✅ Migração criar_almoxarifado_geral aplicada (ALM-GERAL criado e localizações vinculadas)');
}

const MIGRATION_HISTORICO_NULLABLE = 'alertas_historico_nullable_material';

async function migrateHistoricoNullableMaterial(db) {
  await dbRun(db, `CREATE TABLE IF NOT EXISTS schema_migrations_almoxarifado (
    id TEXT PRIMARY KEY,
    applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  const applied = await dbGet(db,
    'SELECT 1 as ok FROM schema_migrations_almoxarifado WHERE id = ?',
    [MIGRATION_HISTORICO_NULLABLE]);
  if (applied) return;

  const tableRow = await dbGet(db,
    `SELECT name FROM sqlite_master WHERE type='table' AND name='alertas_estoque_historico_almoxarifado'`);
  if (!tableRow) {
    await dbRun(db, 'INSERT OR IGNORE INTO schema_migrations_almoxarifado (id) VALUES (?)',
      [MIGRATION_HISTORICO_NULLABLE]);
    return;
  }

  const histMaterialCol = await dbGet(db,
    `SELECT "notnull" as nn FROM pragma_table_info('alertas_estoque_historico_almoxarifado') WHERE name = 'material_id'`);
  if (!histMaterialCol || histMaterialCol.nn !== 1) {
    await dbRun(db, 'INSERT OR IGNORE INTO schema_migrations_almoxarifado (id) VALUES (?)',
      [MIGRATION_HISTORICO_NULLABLE]);
    return;
  }

  await dbRun(db, 'PRAGMA foreign_keys=OFF');
  try {
    await dbRun(db, `CREATE TABLE alertas_estoque_historico_almoxarifado_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      material_id INTEGER,
      canal TEXT NOT NULL,
      destinatario TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'ENVIADO',
      erro TEXT,
      teste INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (material_id) REFERENCES materiais_almoxarifado(id)
    )`);
    await dbRun(db, `INSERT INTO alertas_estoque_historico_almoxarifado_new
      (id, material_id, canal, destinatario, status, erro, teste, created_at)
      SELECT id, material_id, canal, destinatario, status, erro, teste, created_at
      FROM alertas_estoque_historico_almoxarifado`);
    await dbRun(db, 'DROP TABLE alertas_estoque_historico_almoxarifado');
    await dbRun(db, 'ALTER TABLE alertas_estoque_historico_almoxarifado_new RENAME TO alertas_estoque_historico_almoxarifado');
    await dbRun(db, 'INSERT INTO schema_migrations_almoxarifado (id) VALUES (?)',
      [MIGRATION_HISTORICO_NULLABLE]);
    console.log('✅ Migração alertas_estoque_historico (material_id nullable) aplicada');
  } finally {
    await dbRun(db, 'PRAGMA foreign_keys=ON');
  }
}

async function initSchema(db) {
  await ensureBaseTables(db);

  // ── Categorias ──
  await dbRun(db, `CREATE TABLE IF NOT EXISTS categorias_material_almoxarifado (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    parent_id INTEGER,
    ativo INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (parent_id) REFERENCES categorias_material_almoxarifado(id)
  )`);

  const catCount = await dbGet(db, 'SELECT COUNT(*) as c FROM categorias_material_almoxarifado');
  if (catCount.c === 0) {
    for (const nome of CATEGORIAS_SEED) {
      await dbRun(db, 'INSERT INTO categorias_material_almoxarifado (nome) VALUES (?)', [nome]);
    }
  }

  // ── Famílias de material ──
  await dbRun(db, `CREATE TABLE IF NOT EXISTS familias_material_almoxarifado (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    codigo TEXT UNIQUE NOT NULL,
    nome TEXT NOT NULL,
    descricao TEXT,
    categoria_id INTEGER,
    tipo_uso TEXT DEFAULT 'ambos',
    ativo INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (categoria_id) REFERENCES categorias_material_almoxarifado(id)
  )`);

  const famCount = await dbGet(db, 'SELECT COUNT(*) as c FROM familias_material_almoxarifado');
  if (famCount.c === 0) {
    for (const [codigo, nome, descricao] of FAMILIAS_SEED) {
      await dbRun(db,
        'INSERT INTO familias_material_almoxarifado (codigo, nome, descricao) VALUES (?,?,?)',
        [codigo, nome, descricao]);
    }
  }

  await safeAlter(db, 'ALTER TABLE materiais_almoxarifado ADD COLUMN familia_id INTEGER REFERENCES familias_material_almoxarifado(id)');

  // ── Unidades de medida ──
  await dbRun(db, `CREATE TABLE IF NOT EXISTS unidades_medida_almoxarifado (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sigla TEXT UNIQUE NOT NULL,
    descricao TEXT,
    ativo INTEGER DEFAULT 1
  )`);
  const umCount = await dbGet(db, 'SELECT COUNT(*) as c FROM unidades_medida_almoxarifado');
  if (umCount.c === 0) {
    for (const [sigla, desc] of UNIDADES_SEED) {
      await dbRun(db, 'INSERT INTO unidades_medida_almoxarifado (sigla, descricao) VALUES (?,?)', [sigla, desc]);
    }
  }

  // ── Extend materiais ──
  const materialCols = [
    'subcategoria_id INTEGER',
    'descricao_tecnica TEXT',
    'categoria_id INTEGER',
    'localizacao_padrao_id INTEGER',
    'fornecedor_id INTEGER',
    'tipo_material TEXT',
    'material_critico INTEGER DEFAULT 0',
    'controle_lote INTEGER DEFAULT 0',
    'controle_certificado INTEGER DEFAULT 0',
    'quantidade_reservada REAL DEFAULT 0',
    'quantidade_bloqueada REAL DEFAULT 0',
    'quantidade_em_inspecao REAL DEFAULT 0',
    'custo_medio REAL DEFAULT 0',
    'permite_saldo_negativo INTEGER DEFAULT 0',
  ];
  for (const col of materialCols) await safeAlter(db, `ALTER TABLE materiais_almoxarifado ADD COLUMN ${col}`);

  // ── Colunas que existiam SÓ em routes/almoxarifado.js (diff de segurança — Task 3,
  // unificação de DDL). Confirmado ausentes aqui antes da remoção do DDL duplicado. ──
  await safeAlter(db, 'ALTER TABLE materiais_almoxarifado ADD COLUMN tipo_material_id INTEGER REFERENCES tipos_material_almoxarifado(id)');
  await safeAlter(db, 'ALTER TABLE materiais_almoxarifado ADD COLUMN ponto_pedido REAL DEFAULT 0');
  await safeAlter(db, 'ALTER TABLE materiais_almoxarifado ADD COLUMN prazo_reposicao_dias INTEGER DEFAULT 0');

  // ── Seed de tipos_material_almoxarifado (só existia no callback do CREATE TABLE da
  // rota — diff de segurança Task 3). Protegido por try/catch: alguns harnesses de teste
  // pré-criam essa tabela com um subconjunto mínimo de colunas (id, nome); nesses casos o
  // seed é ignorado silenciosamente, sem quebrar o restante do initSchema. ──
  try {
    const tiposCount = await dbGet(db, 'SELECT COUNT(*) as c FROM tipos_material_almoxarifado');
    if (tiposCount.c === 0) {
      for (const [nome, descricao, icone, cor, assinatura, termo, epi, controlado] of TIPOS_MATERIAL_ALMOX_SEED) {
        await dbRun(db,
          `INSERT INTO tipos_material_almoxarifado
           (nome, descricao, icone, cor, requer_assinatura, requer_termo, is_epi, is_controlado)
           VALUES (?,?,?,?,?,?,?,?)`,
          [nome, descricao, icone, cor, assinatura, termo, epi, controlado]);
      }
    }
  } catch (e) { /* tabela com schema mínimo (harness de teste) — seed ignorado com segurança */
    console.warn('[almoxarifado-schema] Seed ignorado:', e.message);
  }

  // ── Almoxarifados (entidade raiz — multi-almoxarifado) ──
  await dbRun(db, `CREATE TABLE IF NOT EXISTS almoxarifados (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    codigo TEXT UNIQUE NOT NULL,
    nome TEXT NOT NULL,
    descricao TEXT,
    ativo INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // ── Extend localizações ──
  await safeAlter(db, 'ALTER TABLE localizacoes_almoxarifado ADD COLUMN tipo TEXT DEFAULT \'Almoxarifado\'');
  await safeAlter(db, 'ALTER TABLE localizacoes_almoxarifado ADD COLUMN almoxarifado_id INTEGER REFERENCES almoxarifados(id)');
  await safeAlter(db, 'ALTER TABLE localizacoes_almoxarifado ADD COLUMN parent_id INTEGER');
  await safeAlter(db, 'ALTER TABLE localizacoes_almoxarifado ADD COLUMN pos_x REAL');
  await safeAlter(db, 'ALTER TABLE localizacoes_almoxarifado ADD COLUMN pos_y REAL');
  await safeAlter(db, 'ALTER TABLE localizacoes_almoxarifado ADD COLUMN largura REAL DEFAULT 120');
  await safeAlter(db, 'ALTER TABLE localizacoes_almoxarifado ADD COLUMN altura REAL DEFAULT 80');
  await safeAlter(db, 'ALTER TABLE localizacoes_almoxarifado ADD COLUMN subgrupo TEXT');
  // Restrições de endereço (Etapa 2, Task 2): localização bloqueada rejeita qualquer uso como
  // origem OU destino de movimento; tipos_material_permitidos (JSON array de strings, NULL =
  // sem restrição) só é avaliado quando a localização é destino. Ver validarLocalizacaoParaMovimento
  // em stockService.js.
  await safeAlter(db, 'ALTER TABLE localizacoes_almoxarifado ADD COLUMN bloqueada INTEGER DEFAULT 0');
  await safeAlter(db, 'ALTER TABLE localizacoes_almoxarifado ADD COLUMN tipos_material_permitidos TEXT');

  // ── Seed de localizacoes_almoxarifado (só existia no callback do CREATE TABLE da
  // rota — diff de segurança Task 3). Protegido por try/catch pelo mesmo motivo do
  // seed de tipos_material_almoxarifado acima. ──
  try {
    const locCount = await dbGet(db, 'SELECT COUNT(*) as c FROM localizacoes_almoxarifado');
    if (locCount.c === 0) {
      for (const [cod, desc, setor] of LOCALIZACOES_ALMOX_SEED) {
        await dbRun(db, 'INSERT INTO localizacoes_almoxarifado (codigo, descricao, setor) VALUES (?,?,?)', [cod, desc, setor]);
      }
    }
  } catch (e) { /* tabela com schema mínimo (harness de teste) — seed ignorado com segurança */
    console.warn('[almoxarifado-schema] Seed ignorado:', e.message);
  }

  // ── Migração: cria ALM-GERAL e vincula localizações existentes (incl. as seedadas acima) ──
  await migrateCriarAlmoxarifadoGeral(db);

  // ── Setores e áreas do almoxarifado ──
  await dbRun(db, `CREATE TABLE IF NOT EXISTS setores_almoxarifado (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT UNIQUE NOT NULL,
    codigo_prefixo TEXT NOT NULL,
    tipo TEXT NOT NULL DEFAULT 'area',
    ordem INTEGER DEFAULT 0,
    ativo INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  const setorCount = await dbGet(db, 'SELECT COUNT(*) as c FROM setores_almoxarifado');
  if (setorCount.c === 0) {
    for (const [nome, prefixo, tipo, ordem] of SETORES_ALMOX_SEED) {
      await dbRun(db,
        'INSERT INTO setores_almoxarifado (nome, codigo_prefixo, tipo, ordem) VALUES (?,?,?,?)',
        [nome, prefixo, tipo, ordem]);
    }
  }

  // ── Estoque por localização/lote ──
  await dbRun(db, `CREATE TABLE IF NOT EXISTS estoque_saldo_almoxarifado (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    material_id INTEGER NOT NULL,
    localizacao_id INTEGER,
    lote TEXT,
    quantidade REAL DEFAULT 0,
    quantidade_reservada REAL DEFAULT 0,
    quantidade_bloqueada REAL DEFAULT 0,
    quantidade_em_inspecao REAL DEFAULT 0,
    custo_medio REAL DEFAULT 0,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(material_id, localizacao_id, lote),
    FOREIGN KEY (material_id) REFERENCES materiais_almoxarifado(id),
    FOREIGN KEY (localizacao_id) REFERENCES localizacoes_almoxarifado(id)
  )`);

  // ── Extend movimentações ──
  const movCols = [
    'localizacao_origem_id INTEGER',
    'localizacao_destino_id INTEGER',
    'lote TEXT',
    'unidade TEXT',
    'projeto_id INTEGER',
    'os_id INTEGER',
    'cliente_id INTEGER',
    'documento_vinculado TEXT',
    'justificativa TEXT',
    'cancelado INTEGER DEFAULT 0',
    'cancelado_por INTEGER',
    'cancelado_em DATETIME',
    'cancelamento_motivo TEXT',
    'movimento_estorno_id INTEGER',
    'reserva_id INTEGER',
    'recebimento_id INTEGER',
    'requisicao_id INTEGER',
  ];
  for (const col of movCols) await safeAlter(db, `ALTER TABLE movimentacoes_almoxarifado ADD COLUMN ${col}`);

  // ── Reservas ──
  await dbRun(db, `CREATE TABLE IF NOT EXISTS reservas_material_almoxarifado (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    material_id INTEGER NOT NULL,
    quantidade REAL NOT NULL,
    quantidade_utilizada REAL DEFAULT 0,
    projeto_id INTEGER,
    os_id INTEGER,
    os_referencia TEXT,
    cliente_id INTEGER,
    equipamento TEXT,
    submontagem TEXT,
    status TEXT DEFAULT 'ATIVA',
    solicitante_id INTEGER,
    solicitante_nome TEXT,
    observacoes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (material_id) REFERENCES materiais_almoxarifado(id)
  )`);

  // ── Recebimentos ──
  await dbRun(db, `CREATE TABLE IF NOT EXISTS recebimentos_material_almoxarifado (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    numero TEXT UNIQUE NOT NULL,
    pedido_compra_id INTEGER,
    nota_fiscal TEXT,
    fornecedor_id INTEGER,
    fornecedor_nome TEXT,
    data_recebimento DATETIME DEFAULT CURRENT_TIMESTAMP,
    status TEXT DEFAULT 'RECEBIDO',
    responsavel_id INTEGER,
    responsavel_nome TEXT,
    observacoes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  await dbRun(db, `CREATE TABLE IF NOT EXISTS recebimentos_material_itens_almoxarifado (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    recebimento_id INTEGER NOT NULL,
    material_id INTEGER NOT NULL,
    quantidade_esperada REAL NOT NULL,
    quantidade_recebida REAL,
    conferencia_quantidade INTEGER DEFAULT 0,
    conferencia_descricao INTEGER DEFAULT 0,
    lote TEXT,
    observacoes TEXT,
    FOREIGN KEY (recebimento_id) REFERENCES recebimentos_material_almoxarifado(id),
    FOREIGN KEY (material_id) REFERENCES materiais_almoxarifado(id)
  )`);

  await dbRun(db, `CREATE TABLE IF NOT EXISTS inspecoes_recebimento_almoxarifado (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    recebimento_item_id INTEGER NOT NULL,
    conforme INTEGER DEFAULT 1,
    divergencia_quantidade INTEGER DEFAULT 0,
    divergencia_dimensional INTEGER DEFAULT 0,
    certificado_ausente INTEGER DEFAULT 0,
    dano_fisico INTEGER DEFAULT 0,
    material_incorreto INTEGER DEFAULT 0,
    acao TEXT,
    responsavel_id INTEGER,
    responsavel_nome TEXT,
    data_inspecao DATETIME DEFAULT CURRENT_TIMESTAMP,
    observacoes TEXT,
    FOREIGN KEY (recebimento_item_id) REFERENCES recebimentos_material_itens_almoxarifado(id)
  )`);

  const recebCols = [
    "tipo_recebimento TEXT DEFAULT 'NOTA_FISCAL'",
    'fornecedor_cnpj TEXT',
    'pedido_compra_numero TEXT',
    'nota_serie TEXT',
    'data_emissao_nf DATE',
    'data_entrada_nf DATE',
    'cfop_nota TEXT',
    'cfop_entrada TEXT',
    'chave_nfe TEXT',
    'base_icms REAL DEFAULT 0',
    'valor_icms REAL DEFAULT 0',
    'valor_produtos REAL DEFAULT 0',
    'frete REAL DEFAULT 0',
    'desconto REAL DEFAULT 0',
    'outras_despesas REAL DEFAULT 0',
    'valor_ipi REAL DEFAULT 0',
    'valor_total_nota REAL DEFAULT 0',
    'compras_responsavel_id INTEGER',
    'compras_responsavel_nome TEXT',
    'compras_data DATETIME',
    'faturamento_responsavel_id INTEGER',
    'faturamento_responsavel_nome TEXT',
    'faturamento_data DATETIME',
    'contas_pagar_id INTEGER',
    'etapa_atual TEXT DEFAULT \'ALMOXARIFADO\'',
  ];
  for (const col of recebCols) await safeAlter(db, `ALTER TABLE recebimentos_material_almoxarifado ADD COLUMN ${col}`);

  const recebItemCols = [
    'valor_unitario REAL DEFAULT 0',
    'valor_total REAL DEFAULT 0',
    'valor_icms REAL DEFAULT 0',
    'valor_ipi REAL DEFAULT 0',
    'reducao_icms_percent REAL DEFAULT 0',
  ];
  for (const col of recebItemCols) await safeAlter(db, `ALTER TABLE recebimentos_material_itens_almoxarifado ADD COLUMN ${col}`);

  await dbRun(db, `CREATE TABLE IF NOT EXISTS itens_pedido_compra (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pedido_id INTEGER NOT NULL,
    material_id INTEGER,
    codigo TEXT,
    descricao TEXT,
    quantidade REAL NOT NULL DEFAULT 1,
    valor_unitario REAL DEFAULT 0,
    unidade TEXT DEFAULT 'UN',
    FOREIGN KEY (pedido_id) REFERENCES pedidos_compra(id),
    FOREIGN KEY (material_id) REFERENCES materiais_almoxarifado(id)
  )`);

  // ── Devoluções ──
  await dbRun(db, `CREATE TABLE IF NOT EXISTS devolucoes_material_almoxarifado (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    material_id INTEGER NOT NULL,
    quantidade REAL NOT NULL,
    motivo TEXT NOT NULL,
    condicao TEXT,
    destino TEXT DEFAULT 'ESTOQUE',
    origem_os_id INTEGER,
    origem_projeto_id INTEGER,
    responsavel_id INTEGER,
    responsavel_nome TEXT,
    observacoes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (material_id) REFERENCES materiais_almoxarifado(id)
  )`);

  // ── Sobras/Scrap ──
  await dbRun(db, `CREATE TABLE IF NOT EXISTS sobras_material_almoxarifado (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    material_id INTEGER,
    tipo_material TEXT,
    dimensoes_originais TEXT,
    dimensoes_restantes TEXT,
    espessura REAL,
    material_descricao TEXT,
    peso_aproximado REAL,
    localizacao_id INTEGER,
    projeto_origem_id INTEGER,
    os_origem_id INTEGER,
    reutilizavel INTEGER DEFAULT 1,
    status TEXT DEFAULT 'DISPONIVEL',
    observacoes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // ── Ferramentas ──
  await dbRun(db, `CREATE TABLE IF NOT EXISTS ferramentas_almoxarifado (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    codigo_patrimonio TEXT UNIQUE NOT NULL,
    nome TEXT NOT NULL,
    tipo TEXT,
    setor_responsavel TEXT,
    status TEXT DEFAULT 'DISPONIVEL',
    material_id INTEGER,
    observacoes TEXT,
    ativo INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  await dbRun(db, `CREATE TABLE IF NOT EXISTS emprestimos_ferramenta_almoxarifado (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ferramenta_id INTEGER NOT NULL,
    colaborador_id INTEGER,
    colaborador_nome TEXT NOT NULL,
    setor TEXT,
    data_retirada DATETIME DEFAULT CURRENT_TIMESTAMP,
    data_prevista_devolucao DATETIME,
    data_devolucao_real DATETIME,
    status TEXT DEFAULT 'EMPRESTADA',
    observacoes TEXT,
    FOREIGN KEY (ferramenta_id) REFERENCES ferramentas_almoxarifado(id)
  )`);

  // ── Materiais do cliente ──
  await dbRun(db, `CREATE TABLE IF NOT EXISTS materiais_cliente_almoxarifado (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cliente_id INTEGER NOT NULL,
    projeto_id INTEGER,
    os_id INTEGER,
    descricao TEXT NOT NULL,
    nota_remessa TEXT,
    quantidade_recebida REAL DEFAULT 0,
    quantidade_consumida REAL DEFAULT 0,
    quantidade_saldo REAL DEFAULT 0,
    unidade TEXT DEFAULT 'UN',
    localizacao_id INTEGER,
    observacoes TEXT,
    ativo INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // ── Anexos ──
  await dbRun(db, `CREATE TABLE IF NOT EXISTS anexos_documento_almoxarifado (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entidade TEXT NOT NULL,
    entidade_id INTEGER NOT NULL,
    tipo TEXT NOT NULL,
    arquivo_path TEXT NOT NULL,
    nome_original TEXT,
    uploaded_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // ── Auditoria ──
  await dbRun(db, `CREATE TABLE IF NOT EXISTS auditoria_log_almoxarifado (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entidade TEXT NOT NULL,
    entidade_id INTEGER,
    acao TEXT NOT NULL,
    usuario_id INTEGER,
    usuario_nome TEXT,
    dados_anteriores TEXT,
    dados_novos TEXT,
    justificativa TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // ── Solicitações de compra (integração futura) ──
  await dbRun(db, `CREATE TABLE IF NOT EXISTS solicitacoes_compra_almoxarifado (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    material_id INTEGER NOT NULL,
    quantidade REAL NOT NULL,
    motivo TEXT DEFAULT 'ESTOQUE_MINIMO',
    projeto_id INTEGER,
    os_id INTEGER,
    cliente_id INTEGER,
    status TEXT DEFAULT 'PENDENTE',
    pedido_compra_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (material_id) REFERENCES materiais_almoxarifado(id)
  )`);

  // ── Alertas de estoque mínimo ──
  await dbRun(db, `CREATE TABLE IF NOT EXISTS alertas_estoque_material_almoxarifado (
    material_id INTEGER PRIMARY KEY,
    estado_estoque TEXT DEFAULT 'ACIMA',
    ultimo_alerta_enviado DATETIME,
    FOREIGN KEY (material_id) REFERENCES materiais_almoxarifado(id)
  )`);
  await safeAlter(db, "ALTER TABLE alertas_estoque_material_almoxarifado ADD COLUMN estado_estoque TEXT DEFAULT 'ACIMA'");

  await dbRun(db, `CREATE TABLE IF NOT EXISTS alertas_estoque_historico_almoxarifado (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    material_id INTEGER,
    canal TEXT NOT NULL,
    destinatario TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'ENVIADO',
    erro TEXT,
    teste INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (material_id) REFERENCES materiais_almoxarifado(id)
  )`);

  await migrateHistoricoNullableMaterial(db);

  // ── Perfis de usuário no almoxarifado ──
  await dbRun(db, `CREATE TABLE IF NOT EXISTS perfil_almoxarifado_usuario (
    usuario_id INTEGER PRIMARY KEY,
    perfil TEXT NOT NULL DEFAULT 'PRODUCAO',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // ── Setores requisitantes e permissões de material ──
  const { ensureSetoresRequisicao } = require('./sectorMaterialService');
  await ensureSetoresRequisicao(db);

  // ── Extend requisições ──
  const reqCols = [
    'projeto_id INTEGER', 'cliente_id INTEGER', 'equipamento TEXT',
    'prioridade TEXT DEFAULT \'NORMAL\'', 'data_necessidade DATE', 'setor TEXT',
    'justificativa TEXT', 'modulo_origem TEXT',
  ];
  for (const col of reqCols) await safeAlter(db, `ALTER TABLE requisicoes_almoxarifado ADD COLUMN ${col}`);

  await safeAlter(db, 'ALTER TABLE requisicoes_almoxarifado ADD COLUMN ativo INTEGER DEFAULT 1');
  await safeAlter(db, 'ALTER TABLE requisicoes_almoxarifado ADD COLUMN ultimo_lembrete_enviado DATETIME');

  // ── Liberação por valor ──
  await safeAlter(db, 'ALTER TABLE requisicoes_almoxarifado ADD COLUMN valor_total REAL DEFAULT 0');
  await safeAlter(db, 'ALTER TABLE requisicoes_almoxarifado ADD COLUMN requer_aprovacao_valor INTEGER DEFAULT 0');
  await safeAlter(db, 'ALTER TABLE requisicoes_almoxarifado ADD COLUMN aprovador_valor_id INTEGER');
  await safeAlter(db, 'ALTER TABLE requisicoes_almoxarifado ADD COLUMN aprovador_valor_nome TEXT');
  await safeAlter(db, 'ALTER TABLE requisicoes_almoxarifado ADD COLUMN data_aprovacao_valor DATETIME');
  await safeAlter(db, 'ALTER TABLE requisicoes_almoxarifado ADD COLUMN rejeicao_valor_motivo TEXT');

  await dbRun(db, `CREATE TABLE IF NOT EXISTS requisicao_lembretes_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    requisicao_id INTEGER NOT NULL,
    destinatario TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'ENVIADO',
    erro TEXT,
    dias_aguardando INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (requisicao_id) REFERENCES requisicoes_almoxarifado(id)
  )`);

  // ── Atendimento parcial por item ──
  await safeAlter(db, 'ALTER TABLE itens_requisicao_almoxarifado ADD COLUMN quantidade_separada REAL DEFAULT 0');
  await safeAlter(db, 'ALTER TABLE itens_requisicao_almoxarifado ADD COLUMN quantidade_entregue REAL DEFAULT 0');
  await dbRun(db, `UPDATE itens_requisicao_almoxarifado
    SET quantidade_entregue = quantidade_atendida
    WHERE COALESCE(quantidade_entregue, 0) = 0 AND COALESCE(quantidade_atendida, 0) > 0`);

  // ── Extend conferências (inventário) ──
  await safeAlter(db, 'ALTER TABLE conferencias_almoxarifado ADD COLUMN tipo TEXT DEFAULT \'GERAL\'');
  await safeAlter(db, 'ALTER TABLE conferencias_almoxarifado ADD COLUMN projeto_id INTEGER');
  await safeAlter(db, 'ALTER TABLE conferencias_almoxarifado ADD COLUMN localizacao_id INTEGER');
  await safeAlter(db, 'ALTER TABLE conferencias_almoxarifado ADD COLUMN aprovador_id INTEGER');
  await safeAlter(db, 'ALTER TABLE conferencias_almoxarifado ADD COLUMN aprovador_nome TEXT');
  await safeAlter(db, 'ALTER TABLE conferencias_almoxarifado ADD COLUMN justificativa_ajuste TEXT');

  // ── Config defaults ──
  const configs = [
    // Migrado de routes/almoxarifado.js (diff de segurança — Task 3): chaves base que só
    // existiam no callback do CREATE TABLE da rota.
    ['aprovacao_automatica', '0', 'Aprovar requisições automaticamente sem revisão'],
    ['limite_aprovacao_auto', '5', 'Quantidade máxima para aprovação automática por item'],
    ['notificar_estoque_critico', '1', 'Enviar alerta quando estoque atingir mínimo'],
    ['prazo_atendimento_horas', '24', 'Prazo padrão para atendimento de requisições (horas)'],
    ['prefixo_requisicao', 'REQ', 'Prefixo do número de requisição'],
    ['prefixo_material', 'ALM', 'Prefixo do código de material'],
    ['requer_justificativa_urgente', '1', 'Exigir justificativa para requisições urgentes'],
    ['inspecao_material_critico', '1', 'Exigir inspeção para materiais críticos no recebimento'],
    ['permite_saldo_negativo_global', '0', 'Permitir saldo negativo (global)'],
    ['perfil_padrao', 'PRODUCAO', 'Perfil padrão para novos usuários no almoxarifado'],
    ['alertas_estoque_notificar_email', '1', 'Habilita alertas de estoque mínimo por e-mail'],
    ['alertas_estoque_notificar_whatsapp', '0', 'Habilita alertas de estoque mínimo por WhatsApp'],
    ['alertas_estoque_emails', '[]', 'Lista de e-mails para notificação de estoque mínimo'],
    ['alertas_estoque_whatsapp_numeros', '[]', 'Lista de números WhatsApp para notificação de estoque mínimo'],
    ['alertas_estoque_intervalo_verificacao_horas', '4', 'Intervalo sugerido de verificação de alertas (horas)'],
    ['alertas_estoque_debounce_segundos', '60', 'Debounce anti-duplicata na mesma operação (segundos; 0=desligado)'],
    ['alertas_app_url', 'https://systemgmp.online', 'URL base do sistema para links nos alertas (e-mail e WhatsApp)'],
    ['alertas_smtp_host', '', 'Servidor SMTP para alertas de estoque'],
    ['alertas_smtp_port', '587', 'Porta SMTP para alertas de estoque'],
    ['alertas_smtp_user', '', 'Usuário SMTP para alertas de estoque'],
    ['alertas_smtp_pass', '', 'Senha SMTP para alertas de estoque'],
    ['alertas_smtp_from', '', 'E-mail remetente dos alertas de estoque'],
    ['alertas_smtp_secure', '0', 'Usar TLS/SSL no SMTP dos alertas (1=sim)'],
    ['alertas_whatsapp_webhook_url', '', 'URL do webhook WhatsApp para alertas de estoque'],
    ['alertas_whatsapp_api_key', '', 'Token/chave API opcional do webhook WhatsApp'],
    ['requisicoes_notificar_email', '1', 'Habilita notificação por e-mail de novas requisições de material'],
    ['requisicoes_notificar_emails', '[]', 'Lista de e-mails para notificação de requisições (vazio = usa alertas_estoque_emails)'],
    ['compras_notificar_emails', '[]', 'E-mails do setor de Compras para solicitações automáticas de compra (itens sem estoque)'],
    ['requisicoes_lembrete_ativo', '1', 'Habilita lembretes diários por e-mail para requisições pendentes'],
    ['requisicoes_lembrete_intervalo_horas', '24', 'Intervalo mínimo entre lembretes da mesma requisição (horas)'],
    ['liberacao_valor_ativo', '0', 'Habilita aprovação de alto valor em requisições de material'],
    ['liberacao_valor_limite', '500', 'Valor máximo (R$) para liberação automática sem aprovação extra'],
    ['liberacao_valor_aprovadores', '[]', 'IDs dos usuários aprovadores de alto valor (JSON)'],
  ];
  for (const [chave, valor, desc] of configs) {
    await dbRun(db, 'INSERT OR IGNORE INTO configuracoes_almoxarifado (chave, valor, descricao) VALUES (?,?,?)', [chave, valor, desc]);
  }

  // ── Centros de custo ──
  await dbRun(db, `CREATE TABLE IF NOT EXISTS centros_custo_almoxarifado (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    codigo TEXT UNIQUE NOT NULL,
    nome TEXT NOT NULL,
    ativo INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  await safeAlter(db, 'ALTER TABLE movimentacoes_almoxarifado ADD COLUMN centro_custo_id INTEGER');
  await safeAlter(db, 'ALTER TABLE movimentacoes_almoxarifado ADD COLUMN emergencial INTEGER DEFAULT 0');
  await safeAlter(db, 'ALTER TABLE movimentacoes_almoxarifado ADD COLUMN regularizacao_pendente INTEGER DEFAULT 0');

  console.log('✅ Schema almoxarifado v3 inicializado');
}

module.exports = {
  initSchema,
  safeAlter,
  CATEGORIAS_SEED,
  FAMILIAS_SEED,
  SETORES_ALMOX_SEED,
  TIPOS_MATERIAL_ALMOX_SEED,
  LOCALIZACOES_ALMOX_SEED,
  TIPOS_MATERIAL_ENUM,
  TIPOS_LOCALIZACAO,
  UNIDADES_SEED,
  SETORES_REQUISICAO,
  TIPOS_MOVIMENTO,
};
