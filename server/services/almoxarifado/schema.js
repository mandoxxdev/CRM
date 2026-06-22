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
  'ENTRADA', 'SAIDA', 'AJUSTE', 'DEVOLUCAO',
];

async function safeAlter(db, sql) {
  try { await dbRun(db, sql); } catch (e) { /* duplicate column */ }
}

async function initSchema(db) {
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

  // ── Extend localizações ──
  await safeAlter(db, 'ALTER TABLE localizacoes_almoxarifado ADD COLUMN tipo TEXT DEFAULT \'Almoxarifado\'');
  await safeAlter(db, 'ALTER TABLE localizacoes_almoxarifado ADD COLUMN parent_id INTEGER');

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

  // ── Perfis de usuário no almoxarifado ──
  await dbRun(db, `CREATE TABLE IF NOT EXISTS perfil_almoxarifado_usuario (
    usuario_id INTEGER PRIMARY KEY,
    perfil TEXT NOT NULL DEFAULT 'PRODUCAO',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // ── Extend requisições ──
  const reqCols = [
    'projeto_id INTEGER', 'cliente_id INTEGER', 'equipamento TEXT',
    'prioridade TEXT DEFAULT \'NORMAL\'', 'data_necessidade DATE', 'setor TEXT',
    'justificativa TEXT',
  ];
  for (const col of reqCols) await safeAlter(db, `ALTER TABLE requisicoes_almoxarifado ADD COLUMN ${col}`);

  // ── Extend conferências (inventário) ──
  await safeAlter(db, 'ALTER TABLE conferencias_almoxarifado ADD COLUMN tipo TEXT DEFAULT \'GERAL\'');
  await safeAlter(db, 'ALTER TABLE conferencias_almoxarifado ADD COLUMN projeto_id INTEGER');
  await safeAlter(db, 'ALTER TABLE conferencias_almoxarifado ADD COLUMN localizacao_id INTEGER');
  await safeAlter(db, 'ALTER TABLE conferencias_almoxarifado ADD COLUMN aprovador_id INTEGER');
  await safeAlter(db, 'ALTER TABLE conferencias_almoxarifado ADD COLUMN aprovador_nome TEXT');
  await safeAlter(db, 'ALTER TABLE conferencias_almoxarifado ADD COLUMN justificativa_ajuste TEXT');

  // ── Config defaults ──
  const configs = [
    ['inspecao_material_critico', '1', 'Exigir inspeção para materiais críticos no recebimento'],
    ['permite_saldo_negativo_global', '0', 'Permitir saldo negativo (global)'],
    ['perfil_padrao', 'PRODUCAO', 'Perfil padrão para novos usuários no almoxarifado'],
  ];
  for (const [chave, valor, desc] of configs) {
    await dbRun(db, 'INSERT OR IGNORE INTO configuracoes_almoxarifado (chave, valor, descricao) VALUES (?,?,?)', [chave, valor, desc]);
  }

  console.log('✅ Schema almoxarifado v3 inicializado');
}

module.exports = {
  initSchema,
  CATEGORIAS_SEED,
  TIPOS_MATERIAL_ENUM,
  TIPOS_LOCALIZACAO,
  UNIDADES_SEED,
  SETORES_REQUISICAO,
  TIPOS_MOVIMENTO,
};
