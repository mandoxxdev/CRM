import api from '../services/api';

const DASHBOARD_CACHE_TTL_MS = 45 * 1000;
const META_CACHE_TTL_MS = 60 * 1000;

const dashboardCache = { at: 0, data: null };
const metaCache = { at: 0, data: null };
const dashboardInflight = { current: null };
const metaInflight = { current: null };

// Etapa 160 (RN-160.05, C394): o servidor guarda o painel 30 s e so recalcula com `refresh=1`. O Atualizar (force) manda; a
// invalidacao depois de uma acao da producao marca que a PROXIMA busca manda (Fase 2 I3) — antes so limpava o cache daqui, e a
// abertura seguinte caia no cache do servidor. So a resposta da ultima busca grava o cache e chega a tela (Fase 2 M6): a de uma
// busca anterior que termina depois devolve a da ultima.
const dashboardEstado = { seq: 0, ultima: null, forcarServidor: false };

export async function fetchProducaoDashboard({ force = false } = {}) {
  const forcar = force || dashboardEstado.forcarServidor;
  if (!forcar && dashboardCache.data && Date.now() - dashboardCache.at < DASHBOARD_CACHE_TTL_MS) {
    return dashboardCache.data;
  }
  if (!forcar && dashboardInflight.current) return dashboardInflight.current;

  const meu = ++dashboardEstado.seq;
  const pedido = forcar
    ? api.get('/producao/dashboard', { params: { refresh: '1' } })
    : api.get('/producao/dashboard');
  dashboardEstado.forcarServidor = false;
  const promise = pedido
    .then(({ data }) => {
      if (meu !== dashboardEstado.seq) return dashboardEstado.ultima;
      dashboardCache.at = Date.now();
      dashboardCache.data = data;
      dashboardInflight.current = null;
      return data;
    })
    .catch((err) => {
      if (meu !== dashboardEstado.seq) return dashboardEstado.ultima;
      dashboardInflight.current = null;
      if (forcar) dashboardEstado.forcarServidor = true; // a busca forcada que falhou: a proxima tenta de novo pelo servidor
      throw err;
    });

  dashboardInflight.current = promise;
  dashboardEstado.ultima = promise;
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
  dashboardEstado.forcarServidor = true; // Etapa 160 (Fase 2 I3): a proxima busca passa do cache de 30 s do servidor
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
