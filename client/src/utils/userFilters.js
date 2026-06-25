import api from '../services/api';
import { isSuperAdmin } from './systemPermissions';

const COMERCIAL_CACHE_TTL_MS = 60 * 1000;

const comercialCache = new Map();
const comercialInflight = new Map();

function comercialCacheKey(actor) {
  const superKey = isSuperAdmin(actor) ? 'super' : 'user';
  return `${superKey}:${actor?.id || 'anon'}`;
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
  return data;
}

/** Comercial responsáveis/vendedores — /usuarios/comercial */
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
      comercialCache.set(key, { at: Date.now(), list });
      comercialInflight.delete(key);
      return list;
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

/** Usuários com acesso a um módulo (responsável, vendedor, etc.) */
export async function fetchModuleUsers(modulo) {
  const { data } = await api.get(`/usuarios/por-modulo/${modulo}`);
  return Array.isArray(data) ? data : [];
}

/** Pass-through for user arrays from API (ghost filter disabled) */
export function applyVisibleUsersFilter(users) {
  return users || [];
}
