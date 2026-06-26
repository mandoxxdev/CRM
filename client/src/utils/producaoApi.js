import api from '../services/api';

const DASHBOARD_CACHE_TTL_MS = 45 * 1000;
const META_CACHE_TTL_MS = 60 * 1000;

const dashboardCache = { at: 0, data: null };
const metaCache = { at: 0, data: null };
const dashboardInflight = { current: null };
const metaInflight = { current: null };

export async function fetchProducaoDashboard({ force = false } = {}) {
  if (!force && dashboardCache.data && Date.now() - dashboardCache.at < DASHBOARD_CACHE_TTL_MS) {
    return dashboardCache.data;
  }
  if (!force && dashboardInflight.current) return dashboardInflight.current;

  const promise = api.get('/producao/dashboard')
    .then(({ data }) => {
      dashboardCache.at = Date.now();
      dashboardCache.data = data;
      dashboardInflight.current = null;
      return data;
    })
    .catch((err) => { dashboardInflight.current = null; throw err; });

  dashboardInflight.current = promise;
  return promise;
}

export async function fetchProducaoMeta({ force = false } = {}) {
  if (!force && metaCache.data && Date.now() - metaCache.at < META_CACHE_TTL_MS) {
    return metaCache.data;
  }
  if (!force && metaInflight.current) return metaInflight.current;

  const promise = api.get('/producao/meta')
    .then(({ data }) => {
      metaCache.at = Date.now();
      metaCache.data = data;
      metaInflight.current = null;
      return data;
    })
    .catch((err) => { metaInflight.current = null; throw err; });

  metaInflight.current = promise;
  return promise;
}

export function invalidateProducaoDashboardCache() {
  dashboardCache.at = 0;
  dashboardCache.data = null;
}

export const STATUS_OP_LABELS = {
  planejada: 'Planejada',
  liberada: 'Liberada',
  em_producao: 'Em produção',
  concluida: 'Concluída',
  cancelada: 'Cancelada',
};

export const STATUS_MAQUINA_LABELS = {
  disponivel: 'Disponível',
  em_producao: 'Em produção',
  parada: 'Parada',
  manutencao: 'Manutenção',
  inativa: 'Inativa',
};

export function statusOpClass(status) {
  const map = {
    planejada: 'info',
    liberada: 'primary',
    em_producao: 'warning',
    concluida: 'success',
    cancelada: 'muted',
  };
  return map[status] || 'muted';
}

export function statusMaquinaClass(status) {
  const map = {
    disponivel: 'success',
    em_producao: 'warning',
    parada: 'danger',
    manutencao: 'info',
    inativa: 'muted',
  };
  return map[status] || 'muted';
}
