import api from '../services/api';

const DASHBOARD_CACHE_TTL_MS = 45 * 1000;
const META_CACHE_TTL_MS = 60 * 1000;

const dashboardCache = { at: 0, data: null };
const metaCache = { at: 0, data: null };
const dashboardInflight = { current: null };
const metaInflight = { current: null };

/**
 * Dashboard frota — cache curto + dedupe de requisições paralelas (evita burst no SQLite).
 */
export async function fetchFrotasDashboard({ force = false } = {}) {
  if (!force && dashboardCache.data && Date.now() - dashboardCache.at < DASHBOARD_CACHE_TTL_MS) {
    return dashboardCache.data;
  }
  if (!force && dashboardInflight.current) {
    return dashboardInflight.current;
  }

  const promise = api.get('/frotas/dashboard')
    .then(({ data }) => {
      dashboardCache.at = Date.now();
      dashboardCache.data = data;
      dashboardInflight.current = null;
      return data;
    })
    .catch((err) => {
      dashboardInflight.current = null;
      throw err;
    });

  dashboardInflight.current = promise;
  return promise;
}

/** Meta de formulários — cache + dedupe. */
export async function fetchFrotasMeta({ force = false } = {}) {
  if (!force && metaCache.data && Date.now() - metaCache.at < META_CACHE_TTL_MS) {
    return metaCache.data;
  }
  if (!force && metaInflight.current) {
    return metaInflight.current;
  }

  const promise = api.get('/frotas/meta')
    .then(({ data }) => {
      metaCache.at = Date.now();
      metaCache.data = data;
      metaInflight.current = null;
      return data;
    })
    .catch((err) => {
      metaInflight.current = null;
      throw err;
    });

  metaInflight.current = promise;
  return promise;
}

export function invalidateFrotasDashboardCache() {
  dashboardCache.at = 0;
  dashboardCache.data = null;
}
