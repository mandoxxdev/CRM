/**
 * Middleware de autenticacao do core (`authenticateToken`) — Etapa 84 (B39).
 *
 * Fabrica em vez de funcao solta no `index.js` para o teste exercitar o middleware de VERDADE
 * (mini-app express + supertest) e nao so casar regex na fonte: a revisao adversarial da 84 mostrou
 * que tres mutacoes passavam na regua por fonte — ler a query por desestruturacao
 * (`const { query: q } = req`), checar NO_TOKEN antes do ramo TOKEN_NA_URL, e responder 200 com o
 * corpo de erro.
 *
 * - token so por header (`Authorization: Bearer` ou `X-Auth-Token`) — `tokenDaRequisicao`;
 * - so `?token=` -> 401 `ERRO_TOKEN_NA_URL` + aviso com metodo e caminho, nunca a URL com query;
 * - sem token -> 401 NO_TOKEN; JWT invalido/expirado -> 401 'Token inválido ou expirado';
 * - valido -> `req.user = payload` e `enrich(req, res, next)`.
 *
 * `enrich` e injetado porque o `db` do index.js e atribuido depois (abre no callback do sqlite):
 * o index passa `(req, res, next) => enrichUserFromDb(db)(req, res, next)`, que le o `db` na hora
 * do pedido, como antes.
 */
const jwt = require('jsonwebtoken');
const { tokenDaRequisicao, ERRO_TOKEN_NA_URL } = require('./tokenDaRequisicao');

function criarAuthenticateToken({ jwtSecret, enrich }) {
  if (!jwtSecret) throw new Error('criarAuthenticateToken: jwtSecret obrigatorio');
  if (typeof enrich !== 'function') throw new Error('criarAuthenticateToken: enrich obrigatorio');

  return function authenticateToken(req, res, next) {
    const { token, motivo } = tokenDaRequisicao(req);

    if (motivo === 'TOKEN_NA_URL') {
      console.warn(`[auth] token na URL recusado: ${req.method} ${req.baseUrl || ''}${req.path}`);
      return res.status(401).json(ERRO_TOKEN_NA_URL);
    }

    if (!token) {
      return res.status(401).json({ error: 'Token não fornecido', code: 'NO_TOKEN' });
    }

    jwt.verify(token, jwtSecret, (err, user) => {
      if (err) {
        return res.status(401).json({ error: 'Token inválido ou expirado' });
      }
      req.user = user;
      enrich(req, res, next);
    });
  };
}

module.exports = { criarAuthenticateToken };
