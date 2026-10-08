import api from '../services/api';

/**
 * Etapa 82 (RN-82.04/05) — URL de foto da proposta e de avatar para `<img src>`.
 *
 * `/api/uploads/proposta-fotos` e `/api/uploads/avatares` só servem com assinatura (`?exp=&sig=`), e
 * só o servidor a emite: o client NUNCA monta o endereço a partir do nome do arquivo (daria 404 —
 * imagem quebrada sem erro nem log). Usa o `url` (fotos) / `foto_src` (avatar) que a API devolve.
 *
 * Mesmo padrão de `resolveMaterialPhotoUrl` (Etapa 33): o servidor devolve a URL RELATIVA
 * `/api/uploads/...`; quando a base da API é absoluta (`REACT_APP_API_URL` em outro host), prefixa
 * só a ORIGEM — `${baseURL}${url}` daria `/api/api/...`. Qualquer coisa fora do prefixo esperado
 * (nome cru, caminho legado) vira `''`.
 */
export const PREFIXO_FOTO_PROPOSTA = '/api/uploads/proposta-fotos/';
export const PREFIXO_AVATAR = '/api/uploads/avatares/';

export function resolverUrlAssinada(urlDoServidor, prefixo) {
  if (!urlDoServidor) return '';
  const raw = String(urlDoServidor).trim();
  if (!raw) return '';
  if (/^(https?|blob|data):/i.test(raw)) return raw;
  if (!raw.startsWith(prefixo)) return '';

  const apiBase = api.defaults?.baseURL || '/api';
  if (typeof apiBase === 'string' && /^https?:/i.test(apiBase)) {
    const origin = apiBase.replace(/\/api\/?$/, '');
    return `${origin}${raw}`;
  }
  return raw;
}

export const resolveFotoPropostaUrl = (url) => resolverUrlAssinada(url, PREFIXO_FOTO_PROPOSTA);
export const resolveAvatarUrl = (fotoSrc) => resolverUrlAssinada(fotoSrc, PREFIXO_AVATAR);
