/**
 * Permissões de materiais por setor requisitante
 */
const { dbGet, dbAll, dbRun } = require('./db');

const TIPO_USO = {
  ADMINISTRATIVO: 'administrativo',
  INDUSTRIAL: 'industrial',
  AMBOS: 'ambos',
};

const SETORES_MODULO_SEED = [
  ['Engenharia', 'ENG', 'engenharia', 'industrial', 1],
  ['Engenharia / Projetos', 'ENGP', 'engenharia_projetos', 'industrial', 2],
  ['Produção', 'PROD', 'operacional', 'industrial', 3],
  ['Comercial', 'COM', 'comercial', 'administrativo', 4],
  ['Compras', 'COMP', 'compras', 'ambos', 5],
  ['Financeiro', 'FIN', 'financeiro', 'administrativo', 6],
  ['Administrativo', 'ADM', 'administrativo', 'administrativo', 7],
  ['Almoxarifado', 'ALM', 'almoxarifado', 'ambos', 8],
  ['Manutenção', 'MAN', 'frota', 'industrial', 9],
  ['Caldeiraria', 'CALD', null, 'industrial', 10],
  ['Usinagem', 'USIN', null, 'industrial', 11],
  ['Elétrica', 'ELET', null, 'industrial', 12],
  ['Montagem', 'MONT', null, 'industrial', 13],
  ['Qualidade', 'QUAL', null, 'industrial', 14],
];

const CATEGORIAS_TIPO_USO = {
  EPIs: TIPO_USO.ADMINISTRATIVO,
  'Solda e consumíveis': TIPO_USO.AMBOS,
  Ferramentas: TIPO_USO.AMBOS,
  Pintura: TIPO_USO.AMBOS,
  'Materiais fornecidos pelo cliente': TIPO_USO.AMBOS,
  'Sucata e sobras reaproveitáveis': TIPO_USO.AMBOS,
};

const FAMILIAS_TIPO_USO = {
  PAR: TIPO_USO.INDUSTRIAL,
  ROL: TIPO_USO.INDUSTRIAL,
  VAL: TIPO_USO.INDUSTRIAL,
};

async function safeAlter(db, sql) {
  try {
    await dbRun(db, sql);
  } catch (e) {
    if (!/duplicate column/i.test(e.message)) throw e;
  }
}

async function ensureTipoUsoColumns(db) {
  await safeAlter(db, `ALTER TABLE familias_material_almoxarifado ADD COLUMN tipo_uso TEXT DEFAULT 'ambos'`);
  await safeAlter(db, `ALTER TABLE categorias_material_almoxarifado ADD COLUMN tipo_uso TEXT DEFAULT 'industrial'`);
  await safeAlter(db, `ALTER TABLE setores_requisicao_almoxarifado ADD COLUMN tipo_setor TEXT DEFAULT 'industrial'`);

  for (const [codigo, tipo] of Object.entries(FAMILIAS_TIPO_USO)) {
    await dbRun(db,
      `UPDATE familias_material_almoxarifado SET tipo_uso = ? WHERE codigo = ? AND (tipo_uso IS NULL OR tipo_uso = 'ambos')`,
      [tipo, codigo]);
  }

  for (const [nome, tipo] of Object.entries(CATEGORIAS_TIPO_USO)) {
    await dbRun(db,
      `UPDATE categorias_material_almoxarifado SET tipo_uso = ? WHERE nome = ?`,
      [tipo, nome]);
  }
}

async function ensureSetoresRequisicao(db) {
  await dbRun(db, `CREATE TABLE IF NOT EXISTS setores_requisicao_almoxarifado (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT UNIQUE NOT NULL,
    codigo TEXT,
    modulo_origem TEXT,
    tipo_setor TEXT DEFAULT 'industrial',
    ativo INTEGER DEFAULT 1,
    ordem INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  await dbRun(db, `CREATE TABLE IF NOT EXISTS setor_material_permitido (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    setor_id INTEGER NOT NULL,
    familia_id INTEGER,
    categoria_id INTEGER,
    material_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (setor_id) REFERENCES setores_requisicao_almoxarifado(id) ON DELETE CASCADE,
    FOREIGN KEY (familia_id) REFERENCES familias_material_almoxarifado(id),
    FOREIGN KEY (categoria_id) REFERENCES categorias_material_almoxarifado(id),
    FOREIGN KEY (material_id) REFERENCES materiais_almoxarifado(id)
  )`);

  await ensureTipoUsoColumns(db);

  const count = await dbGet(db, 'SELECT COUNT(*) as c FROM setores_requisicao_almoxarifado');
  if (count.c === 0) {
    for (const [nome, codigo, modulo, tipoSetor, ordem] of SETORES_MODULO_SEED) {
      await dbRun(db,
        'INSERT INTO setores_requisicao_almoxarifado (nome, codigo, modulo_origem, tipo_setor, ordem) VALUES (?,?,?,?,?)',
        [nome, codigo, modulo, tipoSetor, ordem]);
    }
    await seedPermissoesPadrao(db);
  } else {
    for (const [nome, codigo, modulo, tipoSetor, ordem] of SETORES_MODULO_SEED) {
      await dbRun(db,
        `UPDATE setores_requisicao_almoxarifado
         SET tipo_setor = COALESCE(tipo_setor, ?), modulo_origem = COALESCE(modulo_origem, ?), ordem = ?
         WHERE nome = ?`,
        [tipoSetor, modulo, ordem, nome]);
    }
  }
}

async function findCategoriaId(db, nome) {
  const row = await dbGet(db,
    'SELECT id FROM categorias_material_almoxarifado WHERE nome = ? AND ativo = 1',
    [nome]);
  return row?.id || null;
}

async function findFamiliaId(db, codigo) {
  const row = await dbGet(db,
    'SELECT id FROM familias_material_almoxarifado WHERE codigo = ? AND ativo = 1',
    [codigo]);
  return row?.id || null;
}

async function addPermissao(db, setorNome, { familiaCodigo, categoriaNome, materialId }) {
  const setor = await dbGet(db,
    'SELECT id FROM setores_requisicao_almoxarifado WHERE nome = ?', [setorNome]);
  if (!setor) return;

  let familia_id = null;
  let categoria_id = null;
  if (familiaCodigo) familia_id = await findFamiliaId(db, familiaCodigo);
  if (categoriaNome) categoria_id = await findCategoriaId(db, categoriaNome);

  const exists = await dbGet(db,
    `SELECT id FROM setor_material_permitido
     WHERE setor_id = ? AND COALESCE(familia_id,0) = COALESCE(?,0)
       AND COALESCE(categoria_id,0) = COALESCE(?,0) AND COALESCE(material_id,0) = COALESCE(?,0)`,
    [setor.id, familia_id, categoria_id, materialId || null]);
  if (exists) return;

  await dbRun(db,
    'INSERT INTO setor_material_permitido (setor_id, familia_id, categoria_id, material_id) VALUES (?,?,?,?)',
    [setor.id, familia_id, categoria_id, materialId || null]);
}

async function seedPermissoesPadrao(db) {
  const defaults = [
    { setor: 'Administrativo', categorias: ['EPIs', 'Solda e consumíveis'] },
    { setor: 'Produção', familias: ['PAR'], categorias: ['Chapas', 'Elementos de fixação', 'Materiais de montagem'] },
    { setor: 'Engenharia', familias: ['ROL', 'VAL'], categorias: ['Automação', 'Sensores e instrumentos', 'Componentes usinados'] },
    { setor: 'Engenharia / Projetos', familias: ['ROL', 'VAL'], categorias: ['Automação', 'Componentes usinados'] },
    { setor: 'Comercial', categorias: ['Solda e consumíveis', 'EPIs'] },
    { setor: 'Manutenção', categorias: ['Pneumática', 'Hidráulica', 'Elétrica', 'Ferramentas'] },
    { setor: 'Compras', categorias: [] },
    { setor: 'Financeiro', categorias: ['Solda e consumíveis'] },
    { setor: 'Almoxarifado', categorias: [] },
  ];

  for (const cfg of defaults) {
    if (!cfg.categorias?.length && !cfg.familias?.length) continue;
    for (const cat of cfg.categorias || []) {
      await addPermissao(db, cfg.setor, { categoriaNome: cat });
    }
    for (const fam of cfg.familias || []) {
      await addPermissao(db, cfg.setor, { familiaCodigo: fam });
    }
  }
}

async function getSetorByNome(db, setorNome) {
  if (!setorNome) return null;
  return dbGet(db,
    'SELECT * FROM setores_requisicao_almoxarifado WHERE nome = ? AND ativo = 1',
    [setorNome]);
}

async function getSetorByModulo(db, moduloOrigem) {
  if (!moduloOrigem) return null;
  const aliases = { admin: 'administrativo' };
  const modulo = aliases[moduloOrigem] || moduloOrigem;
  return dbGet(db,
    'SELECT * FROM setores_requisicao_almoxarifado WHERE modulo_origem = ? AND ativo = 1 ORDER BY ordem LIMIT 1',
    [modulo]);
}

async function hasGlobalPermissoes(db) {
  const row = await dbGet(db, 'SELECT COUNT(*) as c FROM setor_material_permitido');
  return row.c > 0;
}

function buildTipoUsoDenyClause(tipoSetor) {
  if (!tipoSetor || tipoSetor === TIPO_USO.AMBOS) return null;

  const denied = tipoSetor === TIPO_USO.ADMINISTRATIVO
    ? TIPO_USO.INDUSTRIAL
    : TIPO_USO.ADMINISTRATIVO;

  return `(
    NOT EXISTS (
      SELECT 1 FROM familias_material_almoxarifado f2
      WHERE f2.id = m.familia_id AND f2.tipo_uso = '${denied}'
    )
    AND NOT EXISTS (
      SELECT 1 FROM categorias_material_almoxarifado c2
      WHERE c2.id = m.categoria_id AND c2.tipo_uso = '${denied}'
    )
  )`;
}

function buildExplicitPermClause(perms) {
  const familiaIds = [...new Set(perms.filter((p) => p.familia_id).map((p) => p.familia_id))];
  const categoriaIds = [...new Set(perms.filter((p) => p.categoria_id).map((p) => p.categoria_id))];
  const materialIds = [...new Set(perms.filter((p) => p.material_id).map((p) => p.material_id))];

  const parts = [];
  if (familiaIds.length) parts.push(`m.familia_id IN (${familiaIds.join(',')})`);
  if (categoriaIds.length) parts.push(`m.categoria_id IN (${categoriaIds.join(',')})`);
  if (materialIds.length) parts.push(`m.id IN (${materialIds.join(',')})`);

  if (!parts.length) return null;
  return `(${parts.join(' OR ')})`;
}

function combineClauses(clauses) {
  const valid = clauses.filter(Boolean);
  if (!valid.length) return null;
  return valid.map((c) => `(${c})`).join(' AND ');
}

async function buildMaterialFilterClause(db, setorNome, { bypassAlmoxarifado = true } = {}) {
  const setor = await getSetorByNome(db, setorNome);
  if (!setor) return '1=0';

  if (bypassAlmoxarifado && setor.nome === 'Almoxarifado') return null;

  const perms = await dbAll(db, 'SELECT * FROM setor_material_permitido WHERE setor_id = ?', [setor.id]);
  const globalRules = await hasGlobalPermissoes(db);
  const tipoDeny = buildTipoUsoDenyClause(setor.tipo_setor);
  const explicit = buildExplicitPermClause(perms);

  if (explicit) {
    return combineClauses([tipoDeny, explicit]);
  }

  if (globalRules) {
    return '1=0';
  }

  return tipoDeny || null;
}

async function validateMateriaisParaSetor(db, setorNome, materialIds) {
  if (!materialIds?.length) return { ok: true };
  const clause = await buildMaterialFilterClause(db, setorNome, { bypassAlmoxarifado: false });
  if (!clause) return { ok: true };
  if (clause === '1=0') {
    const err = new Error('Um ou mais materiais não são permitidos para este setor');
    err.status = 400;
    err.blockedIds = materialIds;
    throw err;
  }

  const placeholders = materialIds.map(() => '?').join(',');
  const rows = await dbAll(db,
    `SELECT id FROM materiais_almoxarifado m
     WHERE m.id IN (${placeholders}) AND m.ativo = 1 AND ${clause}`,
    materialIds);

  if (rows.length !== materialIds.length) {
    const allowed = new Set(rows.map((r) => r.id));
    const blocked = materialIds.filter((id) => !allowed.has(Number(id)));
    const err = new Error('Um ou mais materiais não são permitidos para este setor');
    err.status = 400;
    err.blockedIds = blocked;
    throw err;
  }
  return { ok: true };
}

async function listSetores(db) {
  return dbAll(db,
    `SELECT s.*,
       (SELECT COUNT(*) FROM setor_material_permitido p WHERE p.setor_id = s.id) as qtd_permissoes
     FROM setores_requisicao_almoxarifado s
     WHERE s.ativo = 1 ORDER BY s.ordem, s.nome`);
}

async function getPermissoesSetor(db, setorId) {
  return dbAll(db,
    `SELECT p.*, f.nome as familia_nome, f.codigo as familia_codigo, f.tipo_uso as familia_tipo_uso,
            c.nome as categoria_nome, c.tipo_uso as categoria_tipo_uso,
            m.nome as material_nome, m.codigo as material_codigo
     FROM setor_material_permitido p
     LEFT JOIN familias_material_almoxarifado f ON p.familia_id = f.id
     LEFT JOIN categorias_material_almoxarifado c ON p.categoria_id = c.id
     LEFT JOIN materiais_almoxarifado m ON p.material_id = m.id
     WHERE p.setor_id = ?
     ORDER BY COALESCE(f.nome, c.nome, m.nome)`,
    [setorId]);
}

async function salvarPermissoesSetor(db, setorId, permissoes = []) {
  await dbRun(db, 'DELETE FROM setor_material_permitido WHERE setor_id = ?', [setorId]);
  for (const p of permissoes) {
    if (!p.familia_id && !p.categoria_id && !p.material_id) continue;
    await dbRun(db,
      'INSERT INTO setor_material_permitido (setor_id, familia_id, categoria_id, material_id) VALUES (?,?,?,?)',
      [setorId, p.familia_id || null, p.categoria_id || null, p.material_id || null]);
  }
  return getPermissoesSetor(db, setorId);
}

async function bulkAssignFamiliasPorTipo(db, setorId, tipoUso) {
  const familias = await dbAll(db,
    `SELECT id FROM familias_material_almoxarifado
     WHERE ativo = 1 AND (tipo_uso = ? OR tipo_uso = 'ambos')`,
    [tipoUso]);
  const existing = await dbAll(db,
    'SELECT familia_id FROM setor_material_permitido WHERE setor_id = ? AND familia_id IS NOT NULL',
    [setorId]);
  const existingIds = new Set(existing.map((e) => e.familia_id));
  for (const fam of familias) {
    if (existingIds.has(fam.id)) continue;
    await dbRun(db,
      'INSERT INTO setor_material_permitido (setor_id, familia_id) VALUES (?,?)',
      [setorId, fam.id]);
  }
  return getPermissoesSetor(db, setorId);
}

module.exports = {
  TIPO_USO,
  SETORES_MODULO_SEED,
  CATEGORIAS_TIPO_USO,
  FAMILIAS_TIPO_USO,
  ensureSetoresRequisicao,
  ensureTipoUsoColumns,
  seedPermissoesPadrao,
  getSetorByNome,
  getSetorByModulo,
  hasGlobalPermissoes,
  listSetores,
  getPermissoesSetor,
  buildMaterialFilterClause,
  buildTipoUsoDenyClause,
  validateMateriaisParaSetor,
  salvarPermissoesSetor,
  bulkAssignFamiliasPorTipo,
};
