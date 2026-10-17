/**
 * Permissões globais do Orion CRM — Super Admin, Admin de Sistema e Admin por Módulo
 */

// Etapa 109 (G7): a lista sai de modulosSistema.js (fonte unica do servidor) — mesmos valores e ordem.
const { chavesComAdminDeModulo } = require('./modulosSistema');
const { respondDbError } = require('./sqliteConcurrency');

const MODULE_ADMIN_KEYS = chavesComAdminDeModulo();

function parseAdminModulos(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter(Boolean);
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
    } catch {
      return [];
    }
  }
  return [];
}

function serializeAdminModulos(mods) {
  const list = parseAdminModulos(mods);
  return JSON.stringify(list);
}

function isTruthyFlag(value) {
  return value === 1 || value === true || value === '1';
}

function isSuperAdmin(user) {
  return isTruthyFlag(user?.is_superadmin) || isTruthyFlag(user?.isSuperAdmin);
}

function isSystemAdmin(user) {
  return isSuperAdmin(user) || String(user?.role || '').toLowerCase() === 'admin';
}

function canManageUsers(user) {
  return isSystemAdmin(user);
}

function canDeleteUsers(user) {
  return isSuperAdmin(user);
}

function canGrantSuperAdmin(user) {
  return isSuperAdmin(user);
}

function isModuleAdmin(user, module) {
  if (!module) return false;
  if (isSuperAdmin(user)) return true;
  return parseAdminModulos(user?.admin_modulos).includes(module);
}

function canDeleteAlmoxRequisicao(user) {
  return isSuperAdmin(user) || isModuleAdmin(user, 'almoxarifado') || String(user?.role || '').toLowerCase() === 'admin';
}

function hasAlmoxAdminPerfil(user) {
  return String(user?.perfil_almoxarifado || '').toUpperCase() === 'ADMINISTRADOR';
}

function canConfigureModule(user, module) {
  if (!module) return false;
  if (isSuperAdmin(user)) return true;
  if (isModuleAdmin(user, module)) return true;
  if (module === 'almoxarifado' && hasAlmoxAdminPerfil(user)) return true;
  if (module === 'frota' && hasFrotaAdminPerfil(user)) return true;
  return false;
}

function canAccessAdministrativoConfig(user) {
  return canConfigureModule(user, 'administrativo') || canConfigureModule(user, 'comercial');
}

function canConfigureAlmox(user) {
  return canConfigureModule(user, 'almoxarifado');
}

function hasFrotaAdminPerfil(user) {
  return String(user?.perfil_frota || '').toUpperCase() === 'ADMIN_FROTA';
}

function canConfigureFrota(user) {
  return canConfigureModule(user, 'frota');
}

function canConfigureOperacional(user) {
  return canConfigureModule(user, 'operacional');
}

function bypassModuleRestrictions(user) {
  return isSuperAdmin(user) || String(user?.role || '').toLowerCase() === 'admin';
}

function requireManageUsers(req, res, next) {
  if (canManageUsers(req.user)) return next();
  return res.status(403).json({ error: 'Acesso negado — apenas administradores do sistema' });
}

function requireDeleteUsers(req, res, next) {
  if (canDeleteUsers(req.user)) return next();
  return res.status(403).json({ error: 'Apenas Super Administradores podem excluir usuários' });
}

function requireSuperAdmin(req, res, next) {
  if (isSuperAdmin(req.user)) return next();
  return res.status(403).json({ error: 'Acesso restrito a Super Administradores' });
}

function requireModuleAdmin(module) {
  return (req, res, next) => {
    if (isModuleAdmin(req.user, module)) {
      return next();
    }
    return res.status(403).json({
      error: 'Acesso restrito — administrador do módulo ou Super Administrador',
      modulo: module,
    });
  };
}

function requireConfigureModule(module) {
  return (req, res, next) => {
    if (canConfigureModule(req.user, module)) return next();
    return res.status(403).json({
      error: 'Acesso restrito — administrador do módulo ou Super Administrador',
      modulo: module,
    });
  };
}

function requireAdministrativoConfig(req, res, next) {
  if (canAccessAdministrativoConfig(req.user)) return next();
  return res.status(403).json({
    error: 'Acesso restrito — administrador do módulo Administrativo/Comercial ou Super Administrador',
  });
}

function requireAlmoxAdmin(req, res, next) {
  if (canConfigureAlmox(req.user)) return next();
  return res.status(403).json({ error: 'Acesso restrito — administrador do Almoxarifado ou Super Administrador' });
}

/** Etapa 131 (B842): o 401 do usuario desativado ou apagado com o token ainda valido. */
const LITERAL_SESSAO_ENCERRADA = 'Sessão encerrada — o usuário foi desativado ou removido';

/** O id do token so vale se for um inteiro positivo (o login sempre assina o id da linha; AUTOINCREMENT, nunca 0). */
function idDoTokenValido(id) {
  const n = Number(id);
  return id !== null && id !== '' && typeof id !== 'boolean' && Number.isInteger(n) && n > 0;
}

/**
 * Le o usuario do banco a cada pedido e poe em req.user o papel, o super, os modulos administrados e os perfis.
 *
 * Etapa 131 (B842, RN-06/RN-07):
 * - sem linha ATIVA (desativado ou apagado, token ainda valido por ate 24 h) -> 401 LITERAL_SESSAO_ENCERRADA, code USUARIO_INATIVO;
 *   o client desloga em qualquer 401 (services/api.js). Ate a 130 rebaixava e seguia: o desativado usava o sistema como comum.
 * - token sem id, ou com id que nao e inteiro positivo -> o mesmo 401, sem ler o banco (Fase 5 r2 M1: ate aqui seguia com o papel
 *   do token, sem nada que o banco confirmasse — so alcancavel com o segredo do JWT, mas contradizia a regra).
 * - erro do banco em QUALQUER das tres leituras -> respondDbError (503 no BUSY, que o client repete; 500 nos outros) e o pedido
 *   nao segue. Ate a 130 o erro deixava o token como estava: com um BUSY o administrador desativado voltava a ser administrador
 *   (Fase 2 I1); e seguir rebaixado num erro de outro tipo deixava o desativado passar como comum (Fase 5 r2 M2), assim como o BUSY
 *   na leitura do perfil fazia o Almoxarife virar Producao naquele pedido.
 * - sem cache: o de 30 s era codigo morto (o index.js cria uma instancia por pedido, o Map nascia vazio); como instancia unica,
 *   a retirada de papel e a desativacao passariam a valer so depois de ate 30 s.
 */
function enrichUserFromDb(db) {
  return (req, res, next) => {
    const encerrada = () => res.status(401).json({ error: LITERAL_SESSAO_ENCERRADA, code: 'USUARIO_INATIVO' });
    if (!req.user || !idDoTokenValido(req.user.id)) return encerrada();

    db.get(
      'SELECT id, nome, email, role, is_superadmin, admin_modulos FROM usuarios WHERE id = ? AND ativo = 1',
      [req.user.id],
      (err, row) => {
        if (err) return respondDbError(res, err, 'auth:enrich');
        if (!row) return encerrada();

        req.user.nome = row.nome;
        req.user.email = row.email;
        req.user.role = row.role;
        req.user.is_superadmin = row.is_superadmin;
        req.user.admin_modulos = parseAdminModulos(row.admin_modulos);

        if (isModuleAdmin(req.user, 'almoxarifado')) {
          req.user.perfil_almoxarifado = 'ADMINISTRADOR';
          finishFrotaProfile(db, req, res, next);
          return;
        }

        db.get(
          'SELECT perfil FROM perfil_almoxarifado_usuario WHERE usuario_id = ?',
          [req.user.id],
          (err2, perfilRow) => {
            if (err2) return respondDbError(res, err2, 'auth:enrich');
            if (perfilRow?.perfil) {
              req.user.perfil_almoxarifado = perfilRow.perfil;
            }
            finishFrotaProfile(db, req, res, next);
          }
        );
      }
    );
  };
}

function finishFrotaProfile(db, req, res, next) {
  if (isModuleAdmin(req.user, 'frota')) {
    req.user.perfil_frota = 'ADMIN_FROTA';
    return next();
  }
  db.get(
    'SELECT perfil FROM perfil_frota_usuario WHERE usuario_id = ?',
    [req.user.id],
    (err, perfilRow) => {
      if (err) return respondDbError(res, err, 'auth:enrich');
      if (perfilRow?.perfil) {
        req.user.perfil_frota = perfilRow.perfil;
      }
      next();
    }
  );
}

function syncModuleAdminProfiles(db, userId, adminModulos) {
  return new Promise((resolve, reject) => {
    const mods = parseAdminModulos(adminModulos);

    const almoxAdmin = mods.includes('almoxarifado');
    const frotaAdmin = mods.includes('frota');

    // Ao revogar o módulo, remove APENAS o perfil que esta função concede
    // (ADMINISTRADOR / ADMIN_FROTA). Perfis atribuídos manualmente
    // (ex.: ALMOXARIFE, MOTORISTA) são preservados.
    const almoxSql = almoxAdmin
      ? `INSERT INTO perfil_almoxarifado_usuario (usuario_id, perfil, updated_at)
         VALUES (?, 'ADMINISTRADOR', CURRENT_TIMESTAMP)
         ON CONFLICT(usuario_id) DO UPDATE SET perfil='ADMINISTRADOR', updated_at=CURRENT_TIMESTAMP`
      : `DELETE FROM perfil_almoxarifado_usuario WHERE usuario_id = ? AND perfil = 'ADMINISTRADOR'`;

    const frotaSql = frotaAdmin
      ? `INSERT INTO perfil_frota_usuario (usuario_id, perfil, updated_at)
         VALUES (?, 'ADMIN_FROTA', CURRENT_TIMESTAMP)
         ON CONFLICT(usuario_id) DO UPDATE SET perfil='ADMIN_FROTA', updated_at=CURRENT_TIMESTAMP`
      : `DELETE FROM perfil_frota_usuario WHERE usuario_id = ? AND perfil = 'ADMIN_FROTA'`;

    const runQuery = (sql, params, cb) => {
      if (!sql) return cb();
      db.run(sql, params, (e) => (e ? cb(e) : cb()));
    };

    runQuery(almoxSql, [userId], (e1) => {
      if (e1) return reject(e1);
      runQuery(frotaSql, [userId], (e2) => {
        if (e2) return reject(e2);
        resolve();
      });
    });
  });
}

/** Ghost user feature disabled — always false */
function isGhostUser() {
  return false;
}

/** Ghost user feature disabled — always false */
function shouldHideGhostUsers() {
  return false;
}

/** Ghost user feature disabled — no-op */
function ghostUserAnd() {
  return '';
}

function ghostUserFilter() {
  return { sql: '', params: [] };
}

/** Ghost user feature disabled — no-op */
function filterGhostUsersFromRows(rows) {
  return rows || [];
}

/** Ghost user feature disabled — no-op */
function sanitizeUserRowsForActor(rows) {
  return rows || [];
}

function sanitizeGhostUserPayload(actor, body) {
  const data = { ...body };
  delete data.is_oculto;
  return data;
}

function sanitizeSuperAdminPayload(actor, body) {
  const data = sanitizeGhostUserPayload(actor, body);
  if (!canGrantSuperAdmin(actor)) {
    delete data.is_superadmin;
  } else {
    data.is_superadmin = isTruthyFlag(data.is_superadmin) ? 1 : 0;
  }
  if (data.admin_modulos !== undefined) {
    const mods = parseAdminModulos(data.admin_modulos).filter((m) => MODULE_ADMIN_KEYS.includes(m));
    data.admin_modulos = serializeAdminModulos(mods);
  }
  return data;
}

function countActiveSuperAdmins(db, excludeUserId = null) {
  return new Promise((resolve, reject) => {
    // Etapa 134 (Fase 5 r1 M1): `ativo = 1`, a regua do login — o super gravado com `ativo` nulo nao entra, e contado aqui deixava o
    // unico super que entra se rebaixar ou desativar.
    let sql = 'SELECT COUNT(*) as cnt FROM usuarios WHERE COALESCE(is_superadmin, 0) = 1 AND ativo = 1';
    const params = [];
    if (excludeUserId != null) {
      sql += ' AND id != ?';
      params.push(excludeUserId);
    }
    db.get(sql, params, (err, row) => {
      if (err) return reject(err);
      resolve(Number(row?.cnt) || 0);
    });
  });
}

function wouldRemoveLastSuperAdmin(db, targetUserId, { demote = false, deactivate = false } = {}) {
  return new Promise((resolve, reject) => {
    if (!demote && !deactivate) return resolve(false);

    db.get(
      'SELECT id, is_superadmin, ativo FROM usuarios WHERE id = ?',
      [targetUserId],
      (err, target) => {
        if (err) return reject(err);
        if (!target) return resolve(false);

        const targetIsSuper = isTruthyFlag(target.is_superadmin);
        const targetIsActive = target.ativo !== 0 && target.ativo !== false;

        if (!targetIsSuper || !targetIsActive) return resolve(false);

        countActiveSuperAdmins(db, targetUserId)
          .then((others) => resolve(others === 0))
          .catch(reject);
      }
    );
  });
}

module.exports = {
  MODULE_ADMIN_KEYS,
  parseAdminModulos,
  serializeAdminModulos,
  isSuperAdmin,
  isSystemAdmin,
  canManageUsers,
  canDeleteUsers,
  canGrantSuperAdmin,
  isModuleAdmin,
  isGhostUser,
  shouldHideGhostUsers,
  ghostUserAnd,
  ghostUserFilter,
  filterGhostUsersFromRows,
  sanitizeUserRowsForActor,
  sanitizeGhostUserPayload,
  canDeleteAlmoxRequisicao,
  canConfigureModule,
  canAccessAdministrativoConfig,
  canConfigureAlmox,
  hasAlmoxAdminPerfil,
  canConfigureFrota,
  hasFrotaAdminPerfil,
  canConfigureOperacional,
  bypassModuleRestrictions,
  requireManageUsers,
  requireDeleteUsers,
  requireSuperAdmin,
  requireModuleAdmin,
  requireConfigureModule,
  requireAdministrativoConfig,
  requireAlmoxAdmin,
  enrichUserFromDb,
  LITERAL_SESSAO_ENCERRADA,
  idDoTokenValido,
  syncModuleAdminProfiles,
  sanitizeSuperAdminPayload,
  isTruthyFlag,
  countActiveSuperAdmins,
  wouldRemoveLastSuperAdmin,
};
