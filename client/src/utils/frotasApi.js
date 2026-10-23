import api from '../services/api';

const DASHBOARD_CACHE_TTL_MS = 45 * 1000;
const META_CACHE_TTL_MS = 60 * 1000;

const dashboardCache = { at: 0, data: null };
const metaCache = { at: 0, data: null };
const dashboardInflight = { current: null };
// Frota Etapa 6 (Fase 2 T-1): geracao do cache do painel. Limpar incrementa; a busca que ja estava em andamento so grava no cache
// (e so zera o "em andamento") se a geracao ainda for a dela — senao o resultado velho (com o alerta ja tratado) voltava ao cache.
let dashboardGeracao = 0;
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
  const geracao = dashboardGeracao;
  const promise = (force ? api.get('/frotas/dashboard', { params: { refresh: 1 } }) : api.get('/frotas/dashboard'))
    .then(({ data }) => {
      if (geracao === dashboardGeracao) {
        dashboardCache.at = Date.now();
        dashboardCache.data = data;
      }
      if (dashboardInflight.current === promise) dashboardInflight.current = null;
      return data;
    })
    .catch((err) => {
      if (dashboardInflight.current === promise) dashboardInflight.current = null;
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
  dashboardGeracao += 1;
  dashboardCache.at = 0;
  dashboardCache.data = null;
  dashboardInflight.current = null;
}

/**
 * Frota Etapa 6 (RN-F6.02/03/09): o gestor marca a pendencia do registro como tratada, ou desfaz. Sucesso limpa o cache do painel
 * (o alerta sai/volta na hora). `manutencao_id` vazio vai como null (o servidor aceita null, '' ou ausente).
 */
export async function tratarPendencia(id, { tratamento, manutencao_id } = {}) {
  const corpo = { tratamento, manutencao_id: manutencao_id === '' || manutencao_id == null ? null : manutencao_id };
  const { data } = await api.post(`/frotas/checklists/${id}/tratar-pendencia`, corpo);
  invalidateFrotasDashboardCache();
  return data;
}

export async function desfazerTratamento(id) {
  const { data } = await api.delete(`/frotas/checklists/${id}/tratar-pendencia`);
  invalidateFrotasDashboardCache();
  return data;
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

/* ---------------------------------------------------------------- Frota Etapa 5: fotos (RN-F5.09) */

const UM_MB = 1024 * 1024;
const LADO_MAIOR = 1600;
const QUALIDADE_JPEG = 0.8;
const TIPOS_QUE_O_SERVIDOR_ACEITA = ['image/jpeg', 'image/png', 'image/webp'];

function decodificarImagem(file) {
  if (typeof createImageBitmap === 'function') return createImageBitmap(file);
  if (typeof Image === 'undefined' || typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') {
    return Promise.reject(new Error('sem decodificador'));
  }
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    const fim = (fn, valor) => { try { URL.revokeObjectURL(url); } catch (_) { /* nada */ } fn(valor); };
    // Navegador que nunca dispara load/error (ou formato que ele nao le) nao pode prender o envio: desiste e manda a original.
    const desiste = setTimeout(() => fim(reject, new Error('tempo')), 20000);
    img.onload = () => { clearTimeout(desiste); fim(resolve, img); };
    img.onerror = () => { clearTimeout(desiste); fim(reject, new Error('nao decodificou')); };
    img.src = url;
  });
}

/**
 * Reconverte para JPEG (lado maior 1600 px, qualidade 0,8) a foto acima de 1 MB ou fora de jpeg/png/webp (HEIC do iPhone).
 * Qualquer falha (navegador sem canvas, formato que ele nao le) devolve o arquivo original: quem decide e o servidor (Fase 2, 16).
 * A reconversao tira os metadados (GPS); a original abaixo de 1 MB sobe com eles (B57).
 */
export async function reduzirFoto(file) {
  if (!file) return file;
  const precisa = file.size > UM_MB || !TIPOS_QUE_O_SERVIDOR_ACEITA.includes(file.type);
  if (!precisa) return file;
  try {
    if (typeof document === 'undefined') return file;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext && canvas.getContext('2d');
    if (!ctx || typeof canvas.toBlob !== 'function') return file;
    const imagem = await decodificarImagem(file);
    const largura = imagem.width;
    const altura = imagem.height;
    if (!largura || !altura) return file;
    const escala = Math.min(1, LADO_MAIOR / Math.max(largura, altura));
    canvas.width = Math.round(largura * escala);
    canvas.height = Math.round(altura * escala);
    ctx.drawImage(imagem, 0, 0, canvas.width, canvas.height);
    if (typeof imagem.close === 'function') imagem.close();
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', QUALIDADE_JPEG));
    if (!blob) return file;
    const nome = `${String(file.name || 'foto').replace(/\.[^.]*$/, '') || 'foto'}.jpg`;
    return new File([blob], nome, { type: 'image/jpeg' });
  } catch (_) {
    return file;
  }
}

/**
 * POST /frotas/anexos (multipart: foto, entidade, entidade_id) -> 201 { id, entidade, entidade_id, url, tipo_mime, tamanho, created_at }.
 * Timeout de 120 s (o `api` tem 30 s; foto em 3G demora — Fase 2, 15).
 */
export async function enviarFotoFrota(entidade, entidadeId, file) {
  const foto = await reduzirFoto(file);
  const fd = new FormData();
  fd.append('entidade', entidade);
  fd.append('entidade_id', String(entidadeId));
  fd.append('foto', foto, foto.name || 'foto.jpg');
  const { data } = await api.post('/frotas/anexos', fd, { timeout: 120000 });
  return data;
}

/** DELETE /frotas/anexos/:id -> { success: true } */
export async function removerFotoFrota(id) {
  const { data } = await api.delete(`/frotas/anexos/${id}`);
  return data;
}
