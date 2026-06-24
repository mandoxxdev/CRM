export function parseAdminModulos(value) {
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

export function isTruthyFlag(value) {
  return value === 1 || value === true || value === '1';
}

export function isSuperAdmin(user) {
  return isTruthyFlag(user?.is_superadmin) || isTruthyFlag(user?.isSuperAdmin);
}

export function isSystemAdmin(user) {
  return isSuperAdmin(user) || String(user?.role || '').toLowerCase() === 'admin';
}

export function canManageUsers(user) {
  return isSystemAdmin(user);
}

export function canDeleteUsers(user) {
  return isSuperAdmin(user);
}

export function isModuleAdmin(user, module) {
  if (!module) return false;
  if (isSuperAdmin(user)) return true;
  return parseAdminModulos(user?.admin_modulos).includes(module);
}

export function canDeleteAlmoxRequisicao(user) {
  return isSuperAdmin(user) || isModuleAdmin(user, 'almoxarifado') || String(user?.role || '').toLowerCase() === 'admin';
}

export function hasAlmoxAdminPerfil(user) {
  return String(user?.perfil_almoxarifado || '').toUpperCase() === 'ADMINISTRADOR';
}

export function canConfigureAlmox(user) {
  return (
    isSuperAdmin(user)
    || isModuleAdmin(user, 'almoxarifado')
    || hasAlmoxAdminPerfil(user)
  );
}

export function hasFrotaAdminPerfil(user) {
  return String(user?.perfil_frota || '').toUpperCase() === 'ADMIN_FROTA';
}

export function canConfigureFrota(user) {
  return (
    isSuperAdmin(user)
    || isModuleAdmin(user, 'frota')
    || hasFrotaAdminPerfil(user)
  );
}

export function canConfigureOperacional(user) {
  return isSuperAdmin(user) || isModuleAdmin(user, 'operacional');
}

export function mergeUserPermissions(authUser, extra = {}) {
  if (!authUser && !extra?.id) return null;
  const base = authUser || {};
  const rawSuperadmin = extra.is_superadmin !== undefined
    ? extra.is_superadmin
    : base.is_superadmin;
  return {
    ...base,
    ...extra,
    role: extra.role ?? base.role,
    is_superadmin: isTruthyFlag(rawSuperadmin) ? 1 : 0,
    admin_modulos: extra.admin_modulos !== undefined
      ? parseAdminModulos(extra.admin_modulos)
      : parseAdminModulos(base.admin_modulos),
    perfil_almoxarifado: extra.perfil_almoxarifado ?? base.perfil_almoxarifado ?? null,
    perfil_frota: extra.perfil_frota ?? base.perfil_frota ?? null,
  };
}

export function bypassModuleRestrictions(user) {
  return isSuperAdmin(user) || String(user?.role || '').toLowerCase() === 'admin';
}

export function isGhostUser(user) {
  return isTruthyFlag(user?.is_oculto);
}

/** Backup client-side filter — server is source of truth */
export function filterVisibleUsers(users, actor) {
  if (isSuperAdmin(actor)) return users || [];
  return (users || []).filter((u) => !isGhostUser(u));
}
