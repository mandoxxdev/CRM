import api from '../services/api';
import { filterVisibleUsers, isSuperAdmin } from './systemPermissions';

const COMERCIAL_CACHE_TTL_MS = 60 * 1000;

const comercialCache = new Map();
const comercialInflight = new Map();

/** Known dev/test ghost names — client backup if DB is_oculto not yet set */
const KNOWN_GHOST_NAME_PATTERNS = [
  /^andre\s*dev$/i,
  /^andredev$/i,
];

function isKnownGhostName(nome) {
  const n = String(nome || '').trim();
  if (!n) return false;
  return KNOWN_GHOST_NAME_PATTERNS.some((re) => re.test(n));
}

function comercialCacheKey(actor) {
  const superKey = isSuperAdmin(actor) ? 'super' : 'user';
  return `${superKey}:${actor?.id || 'anon'}`;
}

function filterComercialResponsaveis(list, actor) {
  let filtered = filterVisibleUsers(list, actor);
  if (!isSuperAdmin(actor)) {
    filtered = filtered.filter((u) => !isKnownGhostName(u?.nome));
  }
  return filtered;
}

/**
 * Filtro premium de usuários (dropdowns/listas/pesquisas) com:
 * - flags por função (vendedor/compras/ti)
 * - isolamento por setor baseado no usuário logado (enforced no backend)
 * - filtros adicionais (ativo, departamento, busca) e paginação
 *
 * Uso típico (dropdown de vendedores):
 *   const { items } = await fetchUsersFiltered({ flag: 'vendedor', q: 'mat', ativo: 1, limit: 25, actor });
 */
export async function fetchUsersFiltered({
  flag,
  q = '',
  ativo = 1, // 1 | 0 | 'all'
  departamento = '',
  setor = '', // só admin consegue efetivamente filtrar por setor; para outros será ignorado
  limit = 50,
  offset = 0,
  actor = null,
} = {}) {
  if (!flag) {
    throw new Error('Parâmetro obrigatório: flag (ex: vendedor, compras, ti)');
  }

  const params = {
    flag,
    q,
    ativo,
    departamento,
    limit,
    offset,
  };

  // O backend só respeita "setor" quando o usuário é admin.
  if (setor) params.setor = setor;

  const { data } = await api.get('/usuarios/filtrar', { params });
  if (actor && Array.isArray(data?.items)) {
    data.items = filterVisibleUsers(data.items, actor);
  }
  return data;
}

/** Comercial responsáveis/vendedores — ONLY /usuarios/comercial (server ghost filter + client backup) */
export async function fetchComercialResponsaveis(actor, { force = false } = {}) {
  if (!actor?.id) return [];

  const key = comercialCacheKey(actor);
  if (!force) {
    const hit = comercialCache.get(key);
    if (hit && Date.now() - hit.at < COMERCIAL_CACHE_TTL_MS) {
      return hit.list;
    }
    if (comercialInflight.has(key)) {
      return comercialInflight.get(key);
    }
  }

  const promise = api.get('/usuarios/comercial')
    .then(({ data }) => {
      const list = Array.isArray(data) ? data : [];
      const filtered = filterComercialResponsaveis(list, actor);
      comercialCache.set(key, { at: Date.now(), list: filtered });
      comercialInflight.delete(key);
      return filtered;
    })
    .catch((err) => {
      comercialInflight.delete(key);
      throw err;
    });

  comercialInflight.set(key, promise);
  return promise;
}

export function invalidateComercialResponsaveisClientCache() {
  comercialCache.clear();
  comercialInflight.clear();
}

/** Usuários com acesso a um módulo (responsável, vendedor, etc.) — server + client ghost filter */
export async function fetchModuleUsers(modulo, actor = null) {
  if (!actor?.id) return [];
  const { data } = await api.get(`/usuarios/por-modulo/${modulo}`);
  const list = Array.isArray(data) ? data : [];
  return filterVisibleUsers(list, actor);
}

/** Backup client-side filter for any user array from API */
export function applyVisibleUsersFilter(users, actor) {
  return filterVisibleUsers(users, actor);
}
