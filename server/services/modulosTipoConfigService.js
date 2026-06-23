/**
 * Tipo de setor (administrativo | industrial) por módulo do sistema
 */
const { dbRun, dbGet, dbAll } = require('./almoxarifado/db');

const TIPO_ADMINISTRATIVO = 'administrativo';
const TIPO_INDUSTRIAL = 'industrial';
const VALID_TIPOS = new Set([TIPO_ADMINISTRATIVO, TIPO_INDUSTRIAL]);

/** Defaults espelhados de client/src/config/requisicoesMaterialConfig.js */
const DEFAULT_MODULOS_TIPO = {
  comercial: TIPO_ADMINISTRATIVO,
  compras: TIPO_ADMINISTRATIVO,
  financeiro: TIPO_ADMINISTRATIVO,
  operacional: TIPO_INDUSTRIAL,
  engenharia: TIPO_ADMINISTRATIVO,
  engenharia_projetos: TIPO_ADMINISTRATIVO,
  almoxarifado: TIPO_ADMINISTRATIVO,
  administrativo: TIPO_ADMINISTRATIVO,
  admin: TIPO_ADMINISTRATIVO,
  frota: TIPO_INDUSTRIAL,
};

async function ensureModulosTipoConfig(db) {
  await dbRun(db, `CREATE TABLE IF NOT EXISTS modulos_tipo_config (
    modulo_id TEXT PRIMARY KEY,
    tipo_setor TEXT NOT NULL DEFAULT 'administrativo',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  for (const [moduloId, tipoSetor] of Object.entries(DEFAULT_MODULOS_TIPO)) {
    await dbRun(db,
      `INSERT OR IGNORE INTO modulos_tipo_config (modulo_id, tipo_setor) VALUES (?, ?)`,
      [moduloId, tipoSetor]);
  }
}

async function getAllModulosTipo(db) {
  await ensureModulosTipoConfig(db);
  const rows = await dbAll(db, 'SELECT modulo_id, tipo_setor, updated_at FROM modulos_tipo_config ORDER BY modulo_id');
  const map = { ...DEFAULT_MODULOS_TIPO };
  for (const row of rows) {
    map[row.modulo_id] = row.tipo_setor;
  }
  return map;
}

async function getModuloTipo(db, moduloId) {
  await ensureModulosTipoConfig(db);
  const row = await dbGet(db,
    'SELECT tipo_setor FROM modulos_tipo_config WHERE modulo_id = ?',
    [moduloId]);
  if (row?.tipo_setor) return row.tipo_setor;
  return DEFAULT_MODULOS_TIPO[moduloId] || TIPO_ADMINISTRATIVO;
}

async function syncSetoresFromModulo(db, moduloId, tipoSetor) {
  await dbRun(db,
    `UPDATE setores_requisicao_almoxarifado SET tipo_setor = ? WHERE modulo_origem = ?`,
    [tipoSetor, moduloId]);
}

async function setModuloTipo(db, moduloId, tipoSetor) {
  if (!moduloId || typeof moduloId !== 'string') {
    const err = new Error('modulo_id inválido');
    err.status = 400;
    throw err;
  }
  const normalized = String(tipoSetor || '').toLowerCase().trim();
  if (!VALID_TIPOS.has(normalized)) {
    const err = new Error('tipo_setor deve ser administrativo ou industrial');
    err.status = 400;
    throw err;
  }

  await ensureModulosTipoConfig(db);
  await dbRun(db,
    `INSERT INTO modulos_tipo_config (modulo_id, tipo_setor, updated_at)
     VALUES (?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(modulo_id) DO UPDATE SET
       tipo_setor = excluded.tipo_setor,
       updated_at = CURRENT_TIMESTAMP`,
    [moduloId, normalized]);

  await syncSetoresFromModulo(db, moduloId, normalized);

  return { modulo_id: moduloId, tipo_setor: normalized };
}

module.exports = {
  TIPO_ADMINISTRATIVO,
  TIPO_INDUSTRIAL,
  DEFAULT_MODULOS_TIPO,
  ensureModulosTipoConfig,
  getAllModulosTipo,
  getModuloTipo,
  setModuloTipo,
  syncSetoresFromModulo,
};
