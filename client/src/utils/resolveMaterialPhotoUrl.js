import api from '../services/api';

/**
 * Resolve material photo paths for <img src>.
 * Handles legacy `/uploads/almoxarifado/...` and filename-only values from the DB.
 */
export function resolveMaterialPhotoUrl(pathOrFilename) {
  if (!pathOrFilename) return '';
  const raw = String(pathOrFilename).trim();
  if (!raw) return '';
  if (/^(https?|blob|data):/i.test(raw)) return raw;

  let apiPath = raw;
  if (!apiPath.startsWith('/api/uploads/almoxarifado/')) {
    const filename = apiPath
      .replace(/^\/+/, '')
      .replace(/^uploads\/almoxarifado\//i, '')
      .replace(/^api\/uploads\/almoxarifado\//i, '');
    apiPath = `/api/uploads/almoxarifado/${filename}`;
  }

  const apiBase = api.defaults?.baseURL || '/api';
  if (typeof apiBase === 'string' && apiBase.startsWith('http')) {
    const origin = apiBase.replace(/\/api\/?$/, '');
    return `${origin}${apiPath}`;
  }

  return apiPath;
}
