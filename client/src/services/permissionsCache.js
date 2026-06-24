import api from './api';
import { bypassModuleRestrictions, mergeUserPermissions, isSystemAdmin } from '../utils/systemPermissions';

const CACHE_TTL_MS = 5 * 60 * 1000;
const FETCH_TIMEOUT_MS = parseInt(process.env.REACT_APP_PERMISSIONS_TIMEOUT_MS || '12000', 10);
const cache = new Map();
const inflight = new Map();

function withTimeout(promise, ms = FETCH_TIMEOUT_MS) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error('TIMEOUT_PERMISSIONS')), ms);
    }),
  ]);
}

/** Preenche cache a partir do usuário já autenticado (evita round-trip ao DB na entrada do módulo). */
export function seedPermissionsFromAuthUser(authUser) {
  if (!authUser?.id) return;
  if (!bypassModuleRestrictions(authUser) && !isSystemAdmin(authUser)) return;

  const data = {
    permissoes: [],
    grupos: [],
    usuario: mergeUserPermissions(authUser, {}),
  };
  cache.set(authUser.id, { data, ts: Date.now() });
}

export async function fetchUserPermissions(userId, options = {}) {
  if (!userId) {
    return { permissoes: [], grupos: [], usuario: null };
  }

  const cached = cache.get(userId);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return cached.data;
  }

  if (inflight.has(userId)) {
    return inflight.get(userId);
  }

  const timeoutMs = options.timeoutMs ?? FETCH_TIMEOUT_MS;

  const promise = withTimeout(
    api.get(`/usuarios/${userId}/grupos`),
    timeoutMs
  )
    .then((response) => {
      const data = response.data || { permissoes: [], grupos: [], usuario: null };
      cache.set(userId, { data, ts: Date.now() });
      inflight.delete(userId);
      return data;
    })
    .catch((error) => {
      inflight.delete(userId);
      if (error?.message === 'TIMEOUT_PERMISSIONS') {
        const stale = cache.get(userId);
        if (stale?.data) {
          console.warn('[permissionsCache] Timeout — usando cache expirado');
          return stale.data;
        }
        throw new Error('Tempo esgotado ao carregar permissões. Tente novamente.');
      }
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

export function getEffectiveUser(authUser) {
  if (!authUser?.id) return authUser;
  const cached = getCachedUserPermissions(authUser.id);
  if (cached?.usuario) {
    return mergeUserPermissions(authUser, cached.usuario);
  }
  return authUser;
}

export function hasModuleAccess(permissoes, modulo, user) {
  if (bypassModuleRestrictions(user)) return true;
  const role = String(user?.role || user || '').toLowerCase();
  if (role === 'admin') return true;
  if (!modulo) return true;

  // Módulo Admin do sistema exige administrador de sistema ou permissão explícita
  if (modulo === 'admin') {
    if (isSystemAdmin(user)) return true;
    if (permissoes && permissoes.length > 0) {
      return permissoes.some((perm) => perm.modulo === 'admin' && perm.permissao === 1);
    }
    return false;
  }

  if (permissoes && permissoes.length > 0) {
    return permissoes.some((perm) => perm.modulo === modulo && perm.permissao === 1);
  }

  return modulo === 'comercial' || modulo === 'frota';
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
