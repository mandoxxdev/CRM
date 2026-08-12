/**
 * Schema initialization and migrations for almoxarifado v3
 */

const { dbRun, dbGet, dbAll } = require('./db');

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

// Etapa 3 (design 2026-08-05, seção "Dados"): tipo único de requisição — usado em
// filtros, exibição e na regra do emergencial (EMERGENCIAL exige justificativa).
const TIPOS_REQUISICAO = [
  'CONSUMO', 'ORDEM_PRODUCAO', 'ORDEM_SERVICO', 'PROJETO', 'MONTAGEM',
  'INSTALACAO_EXTERNA', 'ASSISTENCIA_TECNICA', 'MANUTENCAO', 'DESENVOLVIMENTO',
  'ADMINISTRATIVO', 'EMERGENCIAL', 'FERRAMENTA', 'EPI', 'MATERIAL_CLIENTE',
];

const TIPOS_MOVIMENTO = [
  'ENTRADA_COMPRA', 'ENTRADA_MANUAL', 'ENTRADA_DEVOLUCAO', 'SAIDA_PRODUCAO',
  'SAIDA_MONTAGEM', 'SAIDA_ASSISTENCIA', 'TRANSFERENCIA', 'RESERVA', 'LIBERACAO_RESERVA',
  'BLOQUEIO', 'DESBLOQUEIO', 'AJUSTE_POSITIVO', 'AJUSTE_NEGATIVO', 'SUCATA', 'PERDA', 'RETRABALHO',
  // Etapa 8, decisao 9: devolver ao cliente e SAIDA — o material sai do predio de volta para quem
  // e dele. NAO CONFUNDIR com a devolucao da Etapa 7 (tela /almoxarifado/devolucoes, tipo
  // ENTRADA_DEVOLUCAO), onde o material VOLTA para o estoque. Sao movimentos de direcoes OPOSTAS
  // com nomes parecidos — e a confusao mais provavel de quem ler este codigo depois.
  // Passa pelo motor de proposito: assim lote, serie e endereco funcionam, que e justamente o
  // que a ilha de materiais de cliente nao dava.
  'DEVOLUCAO_CLIENTE',
  // Etapa 5 — quarentena. Simetria de BLOQUEIO/DESBLOQUEIO: mexem em coluna de retencao
  // sem tocar o fisico, porque o material esta no galpao o tempo todo.
  'QUARENTENA', 'LIBERACAO_INSPECAO', 'REPROVACAO_INSPECAO',
  // Etapa 5, correcao de review: uma decisao de inspecao pode aprovar parte e reprovar parte do
  // MESMO retido. LIBERACAO_INSPECAO + REPROVACAO_INSPECAO como duas chamadas independentes
  // abrem uma janela entre elas onde uma decisao concorrente pode consumir o em_inspecao pela
  // metade — DECISAO_INSPECAO baixa o retido inteiro e soma a parte reprovada em bloqueada no
  // MESMO UPDATE (ver stockService.js).
  'DECISAO_INSPECAO',
  'ENTRADA', 'SAIDA', 'AJUSTE', 'DEVOLUCAO', 'ESTORNO',
];

// Tipos de RETENCAO: nao mexem no fisico (quantidade_atual), so nas colunas de retencao de
// materiais_almoxarifado (reservada/bloqueada/em_inspecao). Cada um tem um SERVICO dono, com o
// gate de permissao proprio e o registro paralelo que da lastro ao numero:
//   RESERVA / LIBERACAO_RESERVA        -> criarReserva/liberarReserva (`reservar`) + reservas_material_almoxarifado
//   BLOQUEIO / DESBLOQUEIO             -> inspectionService (`ajustar_estoque`), exige justificativa
//   QUARENTENA                         -> receiptService.aprovarRecebimento (`receber_material`) + retido no item
//   LIBERACAO_/REPROVACAO_/DECISAO_INSPECAO -> inspectionService.decidirInspecao (`inspecionar`) + inspecoes_recebimento
// Por isso a rota generica de movimentacao NAO pode aceita-los (ver TIPOS_MOVIMENTO_ROTA em
// schemas.js): entrar por ela pula o gate certo E o registro paralelo, deixando o numero da
// coluna sem nada por tras.
const TIPOS_RETENCAO = [
  'RESERVA', 'LIBERACAO_RESERVA',
  'BLOQUEIO', 'DESBLOQUEIO',
  'QUARENTENA', 'LIBERACAO_INSPECAO', 'REPROVACAO_INSPECAO', 'DECISAO_INSPECAO',
];

// Tipos que exigem ROTA DEDICADA e por isso NAO entram na rota generica de movimentacao (mesma
// logica de TIPOS_RETENCAO acima, motivo diferente):
//   DEVOLUCAO_CLIENTE -> POST /materiais-cliente/devolucoes (gate `movimentar` + guarda do dono)
// Ele exige numero de documento de devolucao, que MovimentacaoSchema nao tem como campo
// obrigatorio, e so vale para material com proprietario. Entrar pela v2 significaria ou tornar o
// documento obrigatorio para todos os tipos (quebra tudo), ou fazer o motor validar campo que so
// existe para UM tipo (regra de um tipo espalhada pelo motor inteiro). A v2 tem gate `movimentar`,
// o mais amplo do modulo: aceitar o tipo la tornaria decorativas as exigencias proprias da rota
// dedicada — bastaria mandar {tipo:'DEVOLUCAO_CLIENTE'} para a v2 e sair material de cliente sem
// documento nenhum.
const TIPOS_DEDICADOS = ['DEVOLUCAO_CLIENTE'];

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

const MIGRATION_BACKFILL_ITEM_EM_INSPECAO = 'backfill_quantidade_em_inspecao_item';

/**
 * Backfill (correcao de review, Etapa 5): `quantidade_em_inspecao` em
 * `recebimentos_material_itens_almoxarifado` nasceu com DEFAULT 0. Num banco onde a Task 3/4 ja
 * rodou ANTES desta coluna existir, um item retido em quarentena fica com 0 na coluna nova
 * enquanto o pool do material (`materiais_almoxarifado.quantidade_em_inspecao`) ainda segura a
 * retencao — o item some da fila (`listarInspecoesPendentes`) e `decidirInspecao` recusa com 400
 * mesmo havendo saldo retido esperando por ele. So sai por SQL cru sem este backfill.
 *
 * Criterio: para cada item, soma as movimentacoes `QUARENTENA` que citam o MESMO
 * (`recebimento_id`, `material_id`) do item — e exatamente isso que `darEntradaEstoque` grava
 * quando o item retem. So aplica quando esse par e INEQUIVOCO (exatamente um item daquele
 * recebimento tem aquele material) — se dois itens do MESMO recebimento compartilharem o MESMO
 * material (incomum: um recebimento normalmente tem um item por material), a movimentacao nao
 * carrega `recebimento_item_id` para desambiguar quem reteve o que, e esses casos ficam de fora
 * (permanecem em 0 — limitacao conhecida, documentada no relatório da task, não um critério
 * inventado). Itens que já têm decisão registrada (linha em
 * `inspecoes_recebimento_almoxarifado`) NÃO recebem backfill: já foram decididos por um caminho
 * anterior que baixou o pool do material por conta própria, então continuar em 0 está correto.
 *
 * Idempotente pelo ledger (roda uma única vez) — mas o próprio UPDATE também é seguro de
 * reexecutar: a cláusula `NOT EXISTS` já exclui itens legitimamente decididos.
 */
async function migrateBackfillItemQuantidadeEmInspecao(db) {
  await dbRun(db, `CREATE TABLE IF NOT EXISTS schema_migrations_almoxarifado (
    id TEXT PRIMARY KEY,
    applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  const applied = await dbGet(db,
    'SELECT 1 as ok FROM schema_migrations_almoxarifado WHERE id = ?',
    [MIGRATION_BACKFILL_ITEM_EM_INSPECAO]);
  if (applied) return;

  const colInfo = await dbGet(db,
    `SELECT name FROM pragma_table_info('recebimentos_material_itens_almoxarifado') WHERE name = 'quantidade_em_inspecao'`);
  if (!colInfo) {
    await dbRun(db, 'INSERT OR IGNORE INTO schema_migrations_almoxarifado (id) VALUES (?)',
      [MIGRATION_BACKFILL_ITEM_EM_INSPECAO]);
    return;
  }

  const result = await dbRun(db, `
    UPDATE recebimentos_material_itens_almoxarifado
    SET quantidade_em_inspecao = (
      SELECT SUM(mov.quantidade) FROM movimentacoes_almoxarifado mov
      WHERE mov.tipo = 'QUARENTENA'
        AND mov.recebimento_id = recebimentos_material_itens_almoxarifado.recebimento_id
        AND mov.material_id = recebimentos_material_itens_almoxarifado.material_id
    )
    WHERE COALESCE(quantidade_em_inspecao, 0) = 0
      AND EXISTS (
        SELECT 1 FROM movimentacoes_almoxarifado mov
        WHERE mov.tipo = 'QUARENTENA'
          AND mov.recebimento_id = recebimentos_material_itens_almoxarifado.recebimento_id
          AND mov.material_id = recebimentos_material_itens_almoxarifado.material_id
      )
      AND NOT EXISTS (
        SELECT 1 FROM inspecoes_recebimento_almoxarifado insp
        WHERE insp.recebimento_item_id = recebimentos_material_itens_almoxarifado.id
      )
      AND 1 = (
        SELECT COUNT(*) FROM recebimentos_material_itens_almoxarifado ri2
        WHERE ri2.recebimento_id = recebimentos_material_itens_almoxarifado.recebimento_id
          AND ri2.material_id = recebimentos_material_itens_almoxarifado.material_id
      )
  `);

  await dbRun(db, 'INSERT OR IGNORE INTO schema_migrations_almoxarifado (id) VALUES (?)',
    [MIGRATION_BACKFILL_ITEM_EM_INSPECAO]);
  if (result.changes > 0) {
    console.log(`✅ Migração backfill_quantidade_em_inspecao_item aplicada (${result.changes} item(ns) retroativo(s))`);
  }
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

const MIGRATION_SALDO_LOTE_ID = 'estoque_saldo_lote_id_e_sem_retencao';

/**
 * Reconstroi estoque_saldo_almoxarifado (Etapa 6):
 *   - `lote TEXT` -> `lote_id INTEGER` (FK para lotes_almoxarifado);
 *   - remove quantidade_reservada/bloqueada/em_inspecao (nunca tiveram escritor);
 *   - troca a UNIQUE de tabela pelo indice com COALESCE.
 *
 * Reconstruir e seguro porque a sonda no dump de producao (2026-08-09) achou 3 linhas, todas com
 * lote IS NULL, e zero lotes em texto livre — nao ha dado a converter. Segue o padrao de
 * migrateHistoricoNullableMaterial.
 */
async function migrateSaldoLoteId(db) {
  await dbRun(db, `CREATE TABLE IF NOT EXISTS schema_migrations_almoxarifado (
    id TEXT PRIMARY KEY,
    applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  const applied = await dbGet(db,
    'SELECT 1 as ok FROM schema_migrations_almoxarifado WHERE id = ?', [MIGRATION_SALDO_LOTE_ID]);
  if (applied) return;

  const tabela = await dbGet(db,
    `SELECT name FROM sqlite_master WHERE type='table' AND name='estoque_saldo_almoxarifado'`);
  const colLoteTexto = tabela && await dbGet(db,
    `SELECT name FROM pragma_table_info('estoque_saldo_almoxarifado') WHERE name = 'lote'`);

  // Banco novo (CREATE TABLE acima ja nasceu na forma nova) ou tabela ausente: nada a fazer.
  if (!tabela || !colLoteTexto) {
    await dbRun(db, 'INSERT OR IGNORE INTO schema_migrations_almoxarifado (id) VALUES (?)',
      [MIGRATION_SALDO_LOTE_ID]);
    return;
  }

  await dbRun(db, 'PRAGMA foreign_keys=OFF');
  try {
    await dbRun(db, `CREATE TABLE estoque_saldo_almoxarifado_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      material_id INTEGER NOT NULL,
      localizacao_id INTEGER,
      lote_id INTEGER,
      quantidade REAL DEFAULT 0,
      custo_medio REAL DEFAULT 0,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (material_id) REFERENCES materiais_almoxarifado(id),
      FOREIGN KEY (localizacao_id) REFERENCES localizacoes_almoxarifado(id),
      FOREIGN KEY (lote_id) REFERENCES lotes_almoxarifado(id)
    )`);

    // Converte o texto livre em lote de verdade. Em producao isto nao move nenhuma linha (zero
    // lotes em texto), mas bancos de desenvolvimento podem ter — e perder o dado em silencio
    // seria pior do que a coluna morta que estamos removendo.
    const comTexto = await dbAll(db,
      `SELECT DISTINCT material_id, TRIM(lote) as codigo FROM estoque_saldo_almoxarifado
       WHERE lote IS NOT NULL AND TRIM(lote) <> ''`);
    for (const linha of comTexto) {
      await dbRun(db,
        `INSERT OR IGNORE INTO lotes_almoxarifado (material_id, codigo, observacoes)
         VALUES (?,?,'Migrado do texto livre em 2026-08-09 (Etapa 6)')`,
        [linha.material_id, linha.codigo]);
    }

    // Soma ao consolidar: se duas linhas duplicadas existirem (a UNIQUE antiga nao impedia com
    // NULL), somar preserva o saldo; descartar uma delas perderia quantidade.
    await dbRun(db, `INSERT INTO estoque_saldo_almoxarifado_new
      (material_id, localizacao_id, lote_id, quantidade, custo_medio, updated_at)
      SELECT s.material_id, s.localizacao_id, l.id,
             SUM(s.quantidade), MAX(COALESCE(s.custo_medio,0)), MAX(s.updated_at)
      FROM estoque_saldo_almoxarifado s
      LEFT JOIN lotes_almoxarifado l
        ON l.material_id = s.material_id AND l.codigo = TRIM(s.lote)
      GROUP BY s.material_id, COALESCE(s.localizacao_id,0), COALESCE(l.id,0)`);

    await dbRun(db, 'DROP TABLE estoque_saldo_almoxarifado');
    await dbRun(db, 'ALTER TABLE estoque_saldo_almoxarifado_new RENAME TO estoque_saldo_almoxarifado');
    await dbRun(db, `CREATE UNIQUE INDEX IF NOT EXISTS idx_saldo_almox_chave
      ON estoque_saldo_almoxarifado(material_id, COALESCE(localizacao_id,0), COALESCE(lote_id,0))`);
    await dbRun(db, 'INSERT INTO schema_migrations_almoxarifado (id) VALUES (?)',
      [MIGRATION_SALDO_LOTE_ID]);
    console.log('✅ Migração estoque_saldo (lote_id + sem colunas de retenção) aplicada');
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

  // Subfamílias (Etapa 2, Task 3): NULL = família raiz; preenchido = subfamília.
  // Máximo 2 níveis (subfamília não pode ter filhos) — validado na rota, não no schema.
  await safeAlter(db, 'ALTER TABLE familias_material_almoxarifado ADD COLUMN parent_id INTEGER REFERENCES familias_material_almoxarifado(id)');

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
    'subfamilia_id INTEGER',

    // ── Cadastro completo de material (Etapa 2, Task 4) ──
    'fabricante TEXT',
    'codigo_fabricante TEXT',
    'peso_unitario REAL',
    'dimensoes TEXT',
    'material_construtivo TEXT',
    'norma TEXT',
    'marca TEXT',
    'modelo TEXT',
    'aplicacao TEXT',
    'ponto_reposicao REAL',
    'lote_economico REAL',
    'controle_serie INTEGER DEFAULT 0',
    'controle_validade INTEGER DEFAULT 0',
    'controle_corrida INTEGER DEFAULT 0',
    'requer_inspecao INTEGER DEFAULT 0',
    'requer_foto INTEGER DEFAULT 0',
    'classe_abc TEXT',
    'unidade_compra TEXT',
    'fator_conversao_compra REAL',
    'unidade_consumo TEXT',
    'fator_conversao_consumo REAL',
  ];
  for (const col of materialCols) await safeAlter(db, `ALTER TABLE materiais_almoxarifado ADD COLUMN ${col}`);

  // ── Colunas que existiam SÓ em routes/almoxarifado.js (diff de segurança — Task 3,
  // unificação de DDL). Confirmado ausentes aqui antes da remoção do DDL duplicado. ──
  await safeAlter(db, 'ALTER TABLE materiais_almoxarifado ADD COLUMN tipo_material_id INTEGER REFERENCES tipos_material_almoxarifado(id)');
  await safeAlter(db, 'ALTER TABLE materiais_almoxarifado ADD COLUMN ponto_pedido REAL DEFAULT 0');
  await safeAlter(db, 'ALTER TABLE materiais_almoxarifado ADD COLUMN prazo_reposicao_dias INTEGER DEFAULT 0');

  // Etapa 8: proprietario_cliente_id — o dono do material mora na linha do MATERIAL, nao na
  // linha de saldo. NULL = material nosso; preenchido = material de cliente.
  //
  // Por que na linha do material e nao no saldo: o disponivel deriva de
  // materiais_almoxarifado.quantidade_atual, um escalar POR MATERIAL
  // (stockService.getSaldoDisponivel). Repartir propriedade dentro do saldo faria esse escalar
  // misturar donos, e toda guarda de "saldo insuficiente" viraria cirurgia no nucleo do motor.
  // Razao semantica, igualmente forte: a chapa do Cliente X tem certificado e corrida proprios e
  // NAO pode ser trocada pela do Cliente Y — duas linhas de catalogo e o modelo correto.
  // Custo aceito: o catalogo ganha uma linha por cliente do mesmo item fisico.
  await safeAlter(db, 'ALTER TABLE materiais_almoxarifado ADD COLUMN proprietario_cliente_id INTEGER REFERENCES clientes(id)');
  await dbRun(db, `CREATE INDEX IF NOT EXISTS idx_materiais_almox_proprietario
    ON materiais_almoxarifado (proprietario_cliente_id)`);

  // Etapa 8b (decisao 2 do design): a QUARTA coluna de retencao. Material no galvanizador continua
  // sendo nosso (quantidade_atual nao muda) mas nao esta disponivel para sair — igual as outras
  // tres. O QUE A DIFERENCIA DAS OUTRAS TRES, e isto decide a conferencia de inventario:
  // reservada/bloqueada/em_inspecao sao estados ADMINISTRATIVOS de material que ESTA na prateleira
  // e TEM de ser contado; `quantidade_em_terceiros` e a unica que significa "nao esta no predio".
  // Por isso so ela sai do esperado da contagem (routes/almoxarifado.js, POST /conferencias).
  // Quem "uniformizar as quatro" aqui quebra a contagem de inventario.
  //
  // A conta do disponivel que a consome mora em UM lugar so — services/almoxarifado/
  // availabilitySql.js. Ate esta etapa ela estava replicada a mao em 13 queries de 8 arquivos,
  // e acrescentar a coluna em 12 delas nao quebraria nada: o sistema so passaria a recusar pela
  // funcao e aceitar pelo SQL, com o numero errado em silencio.
  await safeAlter(db, 'ALTER TABLE materiais_almoxarifado ADD COLUMN quantidade_em_terceiros REAL DEFAULT 0');

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
  // Etapa 6: `lote TEXT` virou `lote_id` (FK). As tres colunas de retencao que existiam aqui
  // (reservada/bloqueada/em_inspecao) foram REMOVIDAS: nada no sistema jamais escreveu nelas, a
  // soma era sempre 0, e manter coluna sem escritor e o padrao que ja causou tres bugs neste
  // modulo. A retencao mora exclusivamente em materiais_almoxarifado.
  await dbRun(db, `CREATE TABLE IF NOT EXISTS estoque_saldo_almoxarifado (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    material_id INTEGER NOT NULL,
    localizacao_id INTEGER,
    lote_id INTEGER,
    quantidade REAL DEFAULT 0,
    custo_medio REAL DEFAULT 0,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (material_id) REFERENCES materiais_almoxarifado(id),
    FOREIGN KEY (localizacao_id) REFERENCES localizacoes_almoxarifado(id),
    FOREIGN KEY (lote_id) REFERENCES lotes_almoxarifado(id)
  )`);
  // O CREATE UNIQUE INDEX (idx_saldo_almox_chave) NAO vem aqui em seguida de propósito: numa base
  // já existente esta CREATE TABLE IF NOT EXISTS é no-op (a tabela já existe na forma ANTIGA, sem
  // `lote_id`), e criar o índice antes de migrateSaldoLoteId reconstruir a tabela quebraria o
  // boot com "no such column: lote_id". O índice é criado mais abaixo, depois da migração —
  // dentro da própria migração para quem reconstrói, e pela linha após a chamada para quem já
  // nasceu na forma nova.

  // ── Lotes (Etapa 6) ──
  // `VENCIDO` NAO e status: vencimento e derivado de data_validade < date('now'), calculado na
  // leitura. Gravar exigiria um cron para virar o status a meia-noite e criaria um estado que
  // diverge da data quando o cron falhasse — mais uma coluna mentindo. Derivado nao diverge.
  await dbRun(db, `CREATE TABLE IF NOT EXISTS lotes_almoxarifado (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    material_id INTEGER NOT NULL,
    codigo TEXT NOT NULL,
    fornecedor_id INTEGER,
    fornecedor_nome TEXT,
    corrida TEXT,
    data_fabricacao DATE,
    data_validade DATE,
    certificado_arquivo TEXT,
    certificado_em DATETIME,
    certificado_por INTEGER,
    status TEXT NOT NULL DEFAULT 'ATIVO',
    status_motivo TEXT,
    recebimento_id INTEGER,
    recebimento_item_id INTEGER,
    nota_fiscal TEXT,
    observacoes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_por INTEGER,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(material_id, codigo),
    FOREIGN KEY (material_id) REFERENCES materiais_almoxarifado(id)
  )`);

  // Etapa 6, Task 3b: liberacao de vencimento para uso. A tabela ja existe em producao desde a
  // Task 1 — por isso ALTER, nao CREATE TABLE. `vencido` continua 100% derivado de data_validade
  // (isVencido, em lotService); estas tres colunas nao mudam esse calculo, so registram QUEM
  // liberou o uso de um lote vencido, QUANDO e POR QUE — um fato datado e assinado, nao um
  // "desvencimento". Ver lotService.liberarVencimento e a guarda em stockService.
  await safeAlter(db, 'ALTER TABLE lotes_almoxarifado ADD COLUMN vencimento_liberado_em DATETIME');
  await safeAlter(db, 'ALTER TABLE lotes_almoxarifado ADD COLUMN vencimento_liberado_por INTEGER');
  await safeAlter(db, 'ALTER TABLE lotes_almoxarifado ADD COLUMN vencimento_liberado_motivo TEXT');

  // Migração de estoque_saldo_almoxarifado (lote_id + sem colunas de retenção) — precisa rodar
  // DEPOIS do CREATE TABLE de lotes_almoxarifado acima, porque reconstrução insere lotes nele.
  await migrateSaldoLoteId(db);
  // Índice idempotente: no-op se a migração acima já criou (banco antigo reconstruído); cria de
  // fato quando a tabela já nasceu na forma nova (banco novo, migração saiu pelo early-return).
  await dbRun(db, `CREATE UNIQUE INDEX IF NOT EXISTS idx_saldo_almox_chave
    ON estoque_saldo_almoxarifado(material_id, COALESCE(localizacao_id,0), COALESCE(lote_id,0))`);

  // Etapa 6b: series_almoxarifado — registro de posse por unidade fisica (1 linha = 1
  // unidade). NAO existe serie_id em estoque_saldo_almoxarifado (decisao de design da 6b):
  // o saldo agregado continua em quantidade_atual + estoque_saldo; o invariante
  // COUNT(series presentes) == quantidade_atual e coberto por teste
  // (tests/helpers/serieInvariante.js).
  await dbRun(db, `CREATE TABLE IF NOT EXISTS series_almoxarifado (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    material_id INTEGER NOT NULL,
    numero TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'EM_ESTOQUE',
    status_motivo TEXT,
    lote_id INTEGER,
    localizacao_id INTEGER,
    recebimento_id INTEGER,
    recebimento_item_id INTEGER,
    movimentacao_entrada_id INTEGER,
    movimentacao_saida_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_por INTEGER,
    updated_at DATETIME,
    UNIQUE (material_id, numero),
    FOREIGN KEY (material_id) REFERENCES materiais_almoxarifado(id),
    FOREIGN KEY (lote_id) REFERENCES lotes_almoxarifado(id),
    FOREIGN KEY (localizacao_id) REFERENCES localizacoes_almoxarifado(id)
  )`);
  await dbRun(db, `CREATE INDEX IF NOT EXISTS idx_series_almox_material_status
    ON series_almoxarifado (material_id, status)`);

  // ── Extend movimentações ──
  const movCols = [
    'localizacao_origem_id INTEGER',
    'localizacao_destino_id INTEGER',
    'lote TEXT',
    'lote_id INTEGER',
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

  // Etapa 4 — prazo da reserva e rastro da liberação.
  // `expira_em` é a data limite do hold: o job POST /reservas/processar-expiracao devolve ao
  // disponível tudo que passou dessa data (reserva sem a coluna preenchida nunca expira).
  // O trio liberado_* responde "quem soltou, quando e por quê" — sem ele a liberação
  // (e a expiração) só existia como movimentação, sem dono na própria reserva.
  await safeAlter(db, 'ALTER TABLE reservas_material_almoxarifado ADD COLUMN data_necessidade DATE');
  await safeAlter(db, 'ALTER TABLE reservas_material_almoxarifado ADD COLUMN expira_em DATE');
  await safeAlter(db, 'ALTER TABLE reservas_material_almoxarifado ADD COLUMN liberado_por INTEGER');
  await safeAlter(db, 'ALTER TABLE reservas_material_almoxarifado ADD COLUMN liberado_em DATETIME');
  await safeAlter(db, 'ALTER TABLE reservas_material_almoxarifado ADD COLUMN motivo_liberacao TEXT');

  // Etapa 4 — vínculo da reserva com a requisição que a originou (ligação 04→07).
  // `requisicao_id`/`item_requisicao_id` são o que permite à entrega achar a reserva DAQUELE
  // item e consumi-la (stockService.registrarMovimentacao com reserva_id) em vez de disputar
  // o disponível geral — sem esse vínculo a reserva da aprovação seria um hold contra a
  // própria requisição. `origem` separa o que nasceu do fluxo (REQUISICAO) do que alguém
  // reservou à mão (MANUAL): só a primeira pode ser consumida automaticamente pela entrega.
  await safeAlter(db, 'ALTER TABLE reservas_material_almoxarifado ADD COLUMN requisicao_id INTEGER');
  await safeAlter(db, 'ALTER TABLE reservas_material_almoxarifado ADD COLUMN item_requisicao_id INTEGER');
  await safeAlter(db, "ALTER TABLE reservas_material_almoxarifado ADD COLUMN origem TEXT DEFAULT 'MANUAL'");

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

  // Etapa 5 — a decisao da inspecao passa a ter quantidade, porque "aprovar parcialmente" e
  // requisito original (secao 9). `encaminhamento` registra o destino pretendido do material
  // reprovado (requisito "Solicitar devolucao ao fornecedor / analise da Engenharia /
  // substituicao"); a SAIDA em si e da feature 12.
  await safeAlter(db, 'ALTER TABLE inspecoes_recebimento_almoxarifado ADD COLUMN quantidade_aprovada REAL');
  await safeAlter(db, 'ALTER TABLE inspecoes_recebimento_almoxarifado ADD COLUMN quantidade_reprovada REAL');
  await safeAlter(db, 'ALTER TABLE inspecoes_recebimento_almoxarifado ADD COLUMN encaminhamento TEXT');

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
    // Etapa 5, correcao de review: quanto DESTE item especifico esta retido em quarentena.
    // Antes a inspecao inferia o retido de quantidade_recebida (que conferirRecebimento pode
    // sobrescrever sem guarda) e a fila filtrava por quantidade_em_inspecao do MATERIAL (um pool
    // compartilhado entre itens de recebimentos diferentes). Rastrear por item e o mesmo rigor
    // da Etapa 4, que vinculou a reserva ao item via item_requisicao_id.
    'quantidade_em_inspecao REAL DEFAULT 0',
    // Etapa 6: o lote nasce aqui. `lote` TEXT ja existia e vira o codigo digitado na conferencia;
    // estes quatro completam o que a NF traz e o lote precisa. `data_fabricacao_lote` entrou no
    // review final: `lotes_almoxarifado.data_fabricacao` existia desde a Task 1 e NINGUEM a
    // escrevia — coluna sem escritor, exatamente o padrao que esta etapa veio combater. Ou ganhava
    // escritor, ou saia; ganhou (tela do recebimento -> item -> lote).
    'lote_id INTEGER',
    'data_validade_lote DATE',
    'data_fabricacao_lote DATE',
    'corrida_lote TEXT',
    // Etapa 6, review final: marca de idempotencia da entrada no estoque. `darEntradaEstoque`
    // reclama o item aqui (UPDATE ... WHERE entrada_estoque_em IS NULL) ANTES de mover saldo, e
    // pula quem ja entrou. Sem isto, uma nota que falhava no meio podia ser reprocessada e
    // creditava DE NOVO os itens que ja tinham entrado (reproduzido: 10 viraram 20).
    'entrada_estoque_em DATETIME',
    // Etapa 6b, Task 6: numeros de serie da NF para este item, um por linha (texto livre, igual
    // ao campo `lote`). `darEntradaEstoque` faz o parse e declara `exigeSerie` ao motor; o motor
    // e quem cria/reativa as linhas em series_almoxarifado. Este texto e so o que o operador
    // digitou — a fonte de verdade de "quais series existem" continua sendo series_almoxarifado.
    'series TEXT',
  ];
  for (const col of recebItemCols) await safeAlter(db, `ALTER TABLE recebimentos_material_itens_almoxarifado ADD COLUMN ${col}`);
  await migrateBackfillItemQuantidadeEmInspecao(db);

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

  // Etapa 7: vinculo da devolucao a entrega que ela desfaz, e o lote que voltou. Via safeAlter
  // porque a tabela ja existe em producao. `movimentacao_saida_id` e o que permite validar
  // "nao devolver mais do que foi entregue" e dar rastro; `lote_id` e o lote herdado da saida
  // (ou informado a mao numa devolucao avulsa) — sem ele, o saldo devolvido de material
  // controlado ficava preso: entrava com lote NULL e a saida seguinte, que exige lote, nao
  // achava nenhum.
  await safeAlter(db, 'ALTER TABLE devolucoes_material_almoxarifado ADD COLUMN movimentacao_saida_id INTEGER');
  await safeAlter(db, 'ALTER TABLE devolucoes_material_almoxarifado ADD COLUMN lote_id INTEGER');

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
  // ── APOSENTADA na Etapa 8 (decisao 4 do design, 2026-08-12) ──────────────────────────────────
  // NAO tem escritor nem leitor no codigo: o clientMaterialService.js foi removido e as tres rotas
  // /materiais-cliente sairam junto (Task 7). Material de cliente virou material normal com dono
  // (materiais_almoxarifado.proprietario_cliente_id).
  //
  // Por que o CREATE TABLE continua aqui em vez de um DROP: a medicao de "0 linhas" foi feita no
  // banco de DESENVOLVIMENTO, e apagar tabela com base em medicao que nao cobre producao nao tem
  // volta. O CREATE IF NOT EXISTS e inofensivo (cria vazia num banco novo, nao toca num existente).
  //
  // Quem for remover de vez: (1) confirme em PRODUCAO
  //     SELECT COUNT(*) AS total,
  //            SUM(CASE WHEN ativo = 1 THEN 1 ELSE 0 END) AS ativos
  //       FROM materiais_cliente_almoxarifado;
  // (2) se houver linha, migre para materiais_almoxarifado + movimentacao de entrada ANTES — o
  // `descricao` e texto livre sem FK, entao a migracao e assistida, nao automatica; (3) so entao
  // o DROP. As rotas de escrita ja sairam nos dois cenarios: eram o caminho sem guarda.
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

  // ── Etapa 3 (Task 1): tipo de requisição, centro de custo, local de entrega,
  // confirmação de recebimento (pelo solicitante) e encerramento (perfil aprovar_requisicao). ──
  await safeAlter(db, "ALTER TABLE requisicoes_almoxarifado ADD COLUMN tipo_requisicao TEXT DEFAULT 'CONSUMO'");
  await safeAlter(db, 'ALTER TABLE requisicoes_almoxarifado ADD COLUMN centro_custo_id INTEGER');
  await safeAlter(db, 'ALTER TABLE requisicoes_almoxarifado ADD COLUMN local_entrega TEXT');
  await safeAlter(db, 'ALTER TABLE requisicoes_almoxarifado ADD COLUMN recebimento_confirmado_por INTEGER');
  await safeAlter(db, 'ALTER TABLE requisicoes_almoxarifado ADD COLUMN recebimento_confirmado_em DATETIME');
  await safeAlter(db, 'ALTER TABLE requisicoes_almoxarifado ADD COLUMN encerrado_por INTEGER');
  await safeAlter(db, 'ALTER TABLE requisicoes_almoxarifado ADD COLUMN encerrado_em DATETIME');

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
  TIPOS_RETENCAO,
  TIPOS_DEDICADOS,
  TIPOS_REQUISICAO,
};
