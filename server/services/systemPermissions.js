/**
 * Permissões globais do Orion CRM — Super Admin, Admin de Sistema e Admin por Módulo
 */

const MODULE_ADMIN_KEYS = [
  'comercial',
  'compras',
  'financeiro',
  'operacional',
  'engenharia',
  'engenharia_projetos',
  'almoxarifado',
  'frota',
  'relatorios',
  'administrativo',
  'admin',
];

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

function canConfigureAlmox(user) {
  return isSuperAdmin(user) || isModuleAdmin(user, 'almoxarifado') || String(user?.role || '').toLowerCase() === 'admin';
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
    if (isModuleAdmin(req.user, module) || String(req.user?.role || '').toLowerCase() === 'admin') {
      return next();
    }
    return res.status(403).json({
      error: 'Acesso restrito — administrador do módulo ou Super Administrador',
      modulo: module,
    });
  };
}

function requireAlmoxAdmin(req, res, next) {
  if (canConfigureAlmox(req.user)) return next();
  return res.status(403).json({ error: 'Acesso restrito — administrador do Almoxarifado ou Super Administrador' });
}

function enrichUserFromDb(db) {
  return (req, res, next) => {
    if (!req.user?.id) return next();

    db.get(
      'SELECT id, nome, email, role, is_superadmin, admin_modulos FROM usuarios WHERE id = ? AND ativo = 1',
      [req.user.id],
      (err, row) => {
        if (err || !row) return next();

        req.user.nome = row.nome;
        req.user.email = row.email;
        req.user.role = row.role;
        req.user.is_superadmin = row.is_superadmin;
        req.user.admin_modulos = parseAdminModulos(row.admin_modulos);

        if (isModuleAdmin(req.user, 'almoxarifado')) {
          req.user.perfil_almoxarifado = 'ADMINISTRADOR';
          return finishFrotaProfile(db, req, next);
        }

        db.get(
          'SELECT perfil FROM perfil_almoxarifado_usuario WHERE usuario_id = ?',
          [req.user.id],
          (err2, perfilRow) => {
            if (!err2 && perfilRow?.perfil) {
              req.user.perfil_almoxarifado = perfilRow.perfil;
            }
            finishFrotaProfile(db, req, next);
          }
        );
      }
    );
  };
}

function finishFrotaProfile(db, req, next) {
  if (isModuleAdmin(req.user, 'frota')) {
    req.user.perfil_frota = 'ADMIN_FROTA';
    return next();
  }
  db.get(
    'SELECT perfil FROM perfil_frota_usuario WHERE usuario_id = ?',
    [req.user.id],
    (err, perfilRow) => {
      if (!err && perfilRow?.perfil) {
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

    const almoxSql = almoxAdmin
      ? `INSERT INTO perfil_almoxarifado_usuario (usuario_id, perfil, updated_at)
         VALUES (?, 'ADMINISTRADOR', CURRENT_TIMESTAMP)
         ON CONFLICT(usuario_id) DO UPDATE SET perfil='ADMINISTRADOR', updated_at=CURRENT_TIMESTAMP`
      : null;

    const frotaSql = frotaAdmin
      ? `INSERT INTO perfil_frota_usuario (usuario_id, perfil, updated_at)
         VALUES (?, 'ADMIN_FROTA', CURRENT_TIMESTAMP)
         ON CONFLICT(usuario_id) DO UPDATE SET perfil='ADMIN_FROTA', updated_at=CURRENT_TIMESTAMP`
      : null;

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

function sanitizeSuperAdminPayload(actor, body) {
  const data = { ...body };
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
  canDeleteAlmoxRequisicao,
  canConfigureAlmox,
  bypassModuleRestrictions,
  requireManageUsers,
  requireDeleteUsers,
  requireSuperAdmin,
  requireModuleAdmin,
  requireAlmoxAdmin,
  enrichUserFromDb,
  syncModuleAdminProfiles,
  sanitizeSuperAdminPayload,
};
