import api from './api';

const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map();
const inflight = new Map();

export async function fetchUserPermissions(userId) {
  if (!userId) {
    return { permissoes: [], grupos: [] };
  }

  const cached = cache.get(userId);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return cached.data;
  }

  if (inflight.has(userId)) {
    return inflight.get(userId);
  }

  const promise = api
    .get(`/usuarios/${userId}/grupos`)
    .then((response) => {
      const data = response.data || { permissoes: [], grupos: [] };
      cache.set(userId, { data, ts: Date.now() });
      inflight.delete(userId);
      return data;
    })
    .catch((error) => {
      inflight.delete(userId);
      throw error;
    });

  inflight.set(userId, promise);
  return promise;
}

export function getCachedUserPermissions(userId) {
  const cached = cache.get(userId);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return cached.data;
  }
  return null;
}

export function hasModuleAccess(permissoes, modulo, userRole) {
  const role = String(userRole || '').toLowerCase();
  if (role === 'admin') return true;
  if (!modulo) return true;

  if (permissoes && permissoes.length > 0) {
    return permissoes.some((perm) => perm.modulo === modulo && perm.permissao === 1);
  }

  return modulo === 'comercial';
}

export function invalidatePermissionsCache(userId) {
  if (userId) {
    cache.delete(userId);
    inflight.delete(userId);
    return;
  }
  cache.clear();
  inflight.clear();
}
