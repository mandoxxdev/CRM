/**
 * In-memory cache for GET /api/usuarios/comercial — reduces SQLITE_BUSY under dropdown load.
 */
const {
  ghostUserAnd,
  shouldHideGhostUsers,
  sanitizeUserRowsForActor,
} = require('./systemPermissions');

const CACHE_TTL_MS = parseInt(process.env.COMERCIAL_RESPONSAVEIS_CACHE_MS || '60000', 10);

const cache = new Map();

function buildSetorCondition(isAdmin, setorParam) {
  if (isAdmin) return { sql: '', params: [] };
  const s = (setorParam != null && setorParam !== '') ? String(setorParam).trim() : '';
  return {
    sql: 'AND LOWER(TRIM(COALESCE(u.setor, \'\'))) = LOWER(?)',
    params: [s],
  };
}

function cacheKey(actor, isAdmin, setor) {
  const ghostMode = shouldHideGhostUsers(actor) ? 'hide' : 'show';
  const setorKey = isAdmin ? '__admin__' : String(setor || '').toLowerCase().trim();
  return `${ghostMode}|${setorKey}`;
}

/** HARD ghost filter: COALESCE(is_oculto,0)=0 unless actor is superadmin (via ghostUserAnd). */
function buildComercialSql(actor, isAdmin, setor) {
  const setorCond = buildSetorCondition(isAdmin, setor);
  const ghostSql = ghostUserAnd(actor, 'u');
  const sql = `
    SELECT DISTINCT u.id, u.nome, u.email, u.cargo, u.role, u.ativo, u.setor, u.departamento, u.is_oculto, u.created_at
    FROM usuarios u
    WHERE u.ativo = 1
    ${setorCond.sql}
    ${ghostSql}
    AND (
      u.role = 'admin'
      OR EXISTS (
        SELECT 1 FROM permissoes p
        WHERE p.usuario_id = u.id AND (p.grupo_id IS NULL OR p.grupo_id = 0)
        AND p.modulo = 'comercial' AND p.permissao = 1
      )
      OR EXISTS (
        SELECT 1 FROM usuarios_grupos ug
        INNER JOIN permissoes p ON p.grupo_id = ug.grupo_id AND p.modulo = 'comercial' AND p.permissao = 1
        WHERE ug.usuario_id = u.id
      )
    )
    ORDER BY u.nome`;
  return { sql, params: [...setorCond.params] };
}

function invalidateComercialResponsaveisCache() {
  cache.clear();
}

function fetchComercialResponsaveis(db, actor, ctxUser, callback) {
  const isAdmin = ctxUser.role === 'admin';
  const key = cacheKey(actor, isAdmin, ctxUser.setor);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
    return callback(null, sanitizeUserRowsForActor(hit.rows, actor));
  }

  const { sql, params } = buildComercialSql(actor, isAdmin, ctxUser.setor);
  db.all(sql, params, (err, rows) => {
    if (err) return callback(err);
    const raw = rows || [];
    cache.set(key, { at: Date.now(), rows: raw });
    callback(null, sanitizeUserRowsForActor(raw, actor));
  });
}

module.exports = {
  CACHE_TTL_MS,
  buildComercialSql,
  fetchComercialResponsaveis,
  invalidateComercialResponsaveisCache,
};
