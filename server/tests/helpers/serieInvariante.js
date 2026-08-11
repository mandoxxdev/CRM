const assert = require('assert');
const { dbGet } = require('../../services/almoxarifado/db');

/**
 * O invariante da Etapa 6b: para material com controle_serie,
 * COUNT(series presentes) == quantidade_atual. E a defesa contra a
 * quarta reencarnacao da "coluna que diverge em silencio".
 */
async function assertInvarianteSerie(db, materialId) {
  const m = await dbGet(db, 'SELECT quantidade_atual FROM materiais_almoxarifado WHERE id = ?', [materialId]);
  const c = await dbGet(db, `SELECT COUNT(*) AS n FROM series_almoxarifado
    WHERE material_id = ? AND status IN ('EM_ESTOQUE','BLOQUEADA')`, [materialId]);
  assert.strictEqual(c.n, Math.round(m.quantidade_atual),
    `invariante de serie violado: presentes=${c.n} != quantidade_atual=${m.quantidade_atual}`);
}
module.exports = { assertInvarianteSerie };
