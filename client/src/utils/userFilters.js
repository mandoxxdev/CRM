import api from '../services/api';
import { filterVisibleUsers } from './systemPermissions';

/**
 * Filtro premium de usuários (dropdowns/listas/pesquisas) com:
 * - flags por função (vendedor/compras/ti)
 * - isolamento por setor baseado no usuário logado (enforced no backend)
 * - filtros adicionais (ativo, departamento, busca) e paginação
 *
 * Uso típico (dropdown de vendedores):
 *   const { items } = await fetchUsersFiltered({ flag: 'vendedor', q: 'mat', ativo: 1, limit: 25 });
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

