/**
 * De onde o `authenticateToken` le o JWT — Etapa 84 (B39).
 *
 * Ate aqui o middleware aceitava o JWT tambem em `?token=`. Nenhum consumidor do app usava isso
 * (o client manda Bearer, o socket do chat manda no handshake, os scripts mandam Bearer), e o
 * caminho vazava a sessao inteira em URL: historico do navegador, `Referer`, log do nginx. O JWT
 * vale 24 h e abre o CRM todo.
 *
 * A query NAO e simplesmente ignorada: quem chega so com `?token=` recebe um motivo proprio
 * (TOKEN_NA_URL) para o 401 dizer o que fazer e o log mostrar que algo externo dependia disso.
 * Descartado: fase de depreciacao aceitando com aviso (como o backup em backupAuth.js) — la havia
 * cron provavel; aqui nao ha consumidor e cada dia aceitando e um dia vazando.
 *
 * O backup (`GET /api/backup?token=`) tem validador proprio e nao passa por aqui.
 */

const ERRO_TOKEN_NA_URL = Object.freeze({
  error: 'Envie o token no cabeçalho Authorization',
  code: 'TOKEN_NA_URL',
});

/**
 * @param {{ headers?: object, query?: object }} req
 * @returns {{ token: string|null, motivo: null|'TOKEN_NA_URL'|'NO_TOKEN' }}
 */
function tokenDaRequisicao(req) {
  const headers = (req && req.headers) || {};
  const authHeader = headers['authorization'];
  let token = (authHeader && authHeader.split(' ')[1]) || null;
  if (!token && headers['x-auth-token']) {
    token = headers['x-auth-token'];
  }
  if (token) return { token, motivo: null };

  const query = (req && req.query) || {};
  if (query.token) return { token: null, motivo: 'TOKEN_NA_URL' };
  return { token: null, motivo: 'NO_TOKEN' };
}

module.exports = { tokenDaRequisicao, ERRO_TOKEN_NA_URL };
