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

  // Etapa 164 (Fase 2 M11): o "Atualizar" (force) fura tambem o cache de 30 s do servidor — sem isso o cartao seguia velho.
  const promise = (force ? api.get('/frotas/dashboard', { params: { refresh: 1 } }) : api.get('/frotas/dashboard'))
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

/**
 * Le a mensagem de erro do servidor nas duas formas em que o axios a entrega: JSON (`data.error`) e Blob (quando a
 * requisicao pediu `responseType: 'blob'` — ai `err.response.data.error` e sempre undefined). Molde: AnexosDocumento.js.
 */
export async function mensagemDoServidor(err, generica) {
  try {
    const bruto = err?.response?.data;
    if (bruto && typeof bruto.text === 'function') {
      const corpo = JSON.parse(await bruto.text());
      if (corpo && corpo.error) return corpo.error;
    } else if (bruto && bruto.error) {
      return bruto.error;
    }
  } catch (parseErr) { /* corpo nao-JSON: fica a generica */ }
  return generica;
}

function nomeDoArquivo(headers, fallback) {
  const cd = headers?.['content-disposition'] || headers?.['Content-Disposition'] || '';
  const m = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(cd);
  return m ? decodeURIComponent(m[1]) : fallback;
}

/**
 * Frota Etapa 1 (T7, RN-F1.18): baixa a planilha no formato da que a empresa usa hoje (GET /frotas/exportar.xlsx).
 * `periodo` = { data_inicio, data_fim }, cada um opcional; vazio nao vai na URL (Cadastro e Documentos saem inteiros).
 */
export async function baixarPlanilhaFrota(periodo = {}) {
  const params = {};
  if (periodo.data_inicio) params.data_inicio = periodo.data_inicio;
  if (periodo.data_fim) params.data_fim = periodo.data_fim;
  const res = await api.get('/frotas/exportar.xlsx', { params, responseType: 'blob' });
  const hoje = new Date();
  const dois = (n) => String(n).padStart(2, '0');
  const fallback = `controle-de-frota-${hoje.getFullYear()}-${dois(hoje.getMonth() + 1)}-${dois(hoje.getDate())}.xlsx`;
  const url = window.URL.createObjectURL(new Blob([res.data], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  }));
  try {
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', nomeDoArquivo(res.headers, fallback));
    document.body.appendChild(link);
    link.click();
    link.remove();
  } finally {
    window.URL.revokeObjectURL(url);
  }
}
