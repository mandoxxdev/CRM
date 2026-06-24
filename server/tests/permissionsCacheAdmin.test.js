/**
 * Admin module permission fast-path tests
 */
const assert = require('assert');

function run() {
  const cache = new Map();

  function isTruthyFlag(v) { return v === 1 || v === true || v === '1'; }
  function isSuperAdmin(user) { return isTruthyFlag(user?.is_superadmin); }
  function bypassModuleRestrictions(user) {
    return isSuperAdmin(user) || String(user?.role || '').toLowerCase() === 'admin';
  }
  function seedPermissionsFromAuthUser(authUser) {
    if (!authUser?.id) return;
    if (!bypassModuleRestrictions(authUser)) return;
    cache.set(authUser.id, {
      data: { permissoes: [], grupos: [], usuario: authUser },
      ts: Date.now(),
    });
  }
  function hasModuleAccess(permissoes, modulo, user) {
    if (bypassModuleRestrictions(user)) return true;
    if (String(user?.role || '').toLowerCase() === 'admin') return true;
    if (modulo === 'admin') return isSuperAdmin(user);
    return (permissoes || []).some((p) => p.modulo === modulo && p.permissao === 1);
  }

  const adminUser = { id: 1, role: 'admin', email: 'a@test.com' };
  seedPermissionsFromAuthUser(adminUser);
  assert(cache.has(1), 'admin user should seed cache');
  assert(hasModuleAccess([], 'admin', adminUser), 'system admin should access admin module');

  const regularUser = { id: 2, role: 'usuario', email: 'u@test.com' };
  seedPermissionsFromAuthUser(regularUser);
  assert(!cache.has(2), 'regular user should not seed cache');
  assert(!hasModuleAccess([], 'admin', regularUser), 'regular user denied admin module');

  console.log('permissionsCache admin fast-path: OK');
}

run();
