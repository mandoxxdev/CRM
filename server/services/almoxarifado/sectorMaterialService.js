/**
 * Permissões de materiais por setor requisitante
 */
const { dbGet, dbAll, dbRun } = require('./db');

const SETORES_MODULO_SEED = [
  ['Engenharia', 'ENG', 'engenharia', 1],
  ['Engenharia / Projetos', 'ENGP', 'engenharia_projetos', 2],
  ['Produção', 'PROD', 'operacional', 3],
  ['Comercial', 'COM', 'comercial', 4],
  ['Compras', 'COMP', 'compras', 5],
  ['Financeiro', 'FIN', 'financeiro', 6],
  ['Administrativo', 'ADM', 'administrativo', 7],
  ['Almoxarifado', 'ALM', 'almoxarifado', 8],
  ['Manutenção', 'MAN', 'frota', 9],
  ['Caldeiraria', 'CALD', null, 10],
  ['Usinagem', 'USIN', null, 11],
  ['Elétrica', 'ELET', null, 12],
  ['Montagem', 'MONT', null, 13],
  ['Qualidade', 'QUAL', null, 14],
];

async function ensureSetoresRequisicao(db) {
  await dbRun(db, `CREATE TABLE IF NOT EXISTS setores_requisicao_almoxarifado (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT UNIQUE NOT NULL,
    codigo TEXT,
    modulo_origem TEXT,
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

  const count = await dbGet(db, 'SELECT COUNT(*) as c FROM setores_requisicao_almoxarifado');
  if (count.c === 0) {
    for (const [nome, codigo, modulo, ordem] of SETORES_MODULO_SEED) {
      await dbRun(db,
        'INSERT INTO setores_requisicao_almoxarifado (nome, codigo, modulo_origem, ordem) VALUES (?,?,?,?)',
        [nome, codigo, modulo, ordem]);
    }
    await seedPermissoesPadrao(db);
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
  return dbGet(db,
    'SELECT * FROM setores_requisicao_almoxarifado WHERE modulo_origem = ? AND ativo = 1 ORDER BY ordem LIMIT 1',
    [moduloOrigem]);
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
    `SELECT p.*, f.nome as familia_nome, f.codigo as familia_codigo,
            c.nome as categoria_nome, m.nome as material_nome, m.codigo as material_codigo
     FROM setor_material_permitido p
     LEFT JOIN familias_material_almoxarifado f ON p.familia_id = f.id
     LEFT JOIN categorias_material_almoxarifado c ON p.categoria_id = c.id
     LEFT JOIN materiais_almoxarifado m ON p.material_id = m.id
     WHERE p.setor_id = ?
     ORDER BY COALESCE(f.nome, c.nome, m.nome)`,
    [setorId]);
}

async function buildMaterialFilterClause(db, setorNome) {
  const setor = await getSetorByNome(db, setorNome);
  if (!setor) return null;

  const perms = await dbAll(db, 'SELECT * FROM setor_material_permitido WHERE setor_id = ?', [setor.id]);
  if (!perms.length) return null;

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

async function validateMateriaisParaSetor(db, setorNome, materialIds) {
  if (!materialIds?.length) return { ok: true };
  const clause = await buildMaterialFilterClause(db, setorNome);
  if (!clause) return { ok: true };

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

module.exports = {
  SETORES_MODULO_SEED,
  ensureSetoresRequisicao,
  seedPermissoesPadrao,
  getSetorByNome,
  getSetorByModulo,
  listSetores,
  getPermissoesSetor,
  buildMaterialFilterClause,
  validateMateriaisParaSetor,
  salvarPermissoesSetor,
};
