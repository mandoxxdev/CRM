const { dbRun, dbAll, dbGet } = require('./db');

async function criarSobra(db, user, data) {
  const r = await dbRun(db, `INSERT INTO sobras_material_almoxarifado
    (material_id, tipo_material, dimensoes_originais, dimensoes_restantes, espessura, material_descricao,
     peso_aproximado, localizacao_id, projeto_origem_id, os_origem_id, reutilizavel, status, observacoes)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`, [
    data.material_id || null, data.tipo_material || null,
    data.dimensoes_originais || null, data.dimensoes_restantes || null,
    data.espessura || null, data.material_descricao || null,
    data.peso_aproximado || null, data.localizacao_id || null,
    data.projeto_origem_id || null, data.os_origem_id || null,
    data.reutilizavel !== false ? 1 : 0, data.status || 'DISPONIVEL', data.observacoes || null,
  ]);
  return { id: r.lastID };
}

async function listarSobras(db, filters = {}) {
  let sql = `SELECT s.*, l.codigo as localizacao_codigo
    FROM sobras_material_almoxarifado s
    LEFT JOIN localizacoes_almoxarifado l ON s.localizacao_id = l.id WHERE 1=1`;
  const params = [];
  if (filters.status) { sql += ' AND s.status = ?'; params.push(filters.status); }
  if (filters.disponivel) { sql += " AND s.status = 'DISPONIVEL' AND s.reutilizavel = 1"; }
  sql += ' ORDER BY s.created_at DESC';
  return dbAll(db, sql, params);
}

async function atualizarSobra(db, id, data) {
  await dbRun(db, `UPDATE sobras_material_almoxarifado SET
    status = COALESCE(?, status), localizacao_id = COALESCE(?, localizacao_id),
    observacoes = COALESCE(?, observacoes), updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [data.status || null, data.localizacao_id || null, data.observacoes || null, id]);
  return dbGet(db, 'SELECT * FROM sobras_material_almoxarifado WHERE id = ?', [id]);
}

module.exports = { criarSobra, listarSobras, atualizarSobra };
