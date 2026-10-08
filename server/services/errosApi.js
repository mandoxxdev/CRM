/**
 * Etapa 86 (RN-86.01/03) — handler global de erro do `/api`.
 *
 * ── O DEFEITO ────────────────────────────────────────────────────────────────────────────────
 *
 * Ate a Etapa 85 este handler morava inline no `server/index.js` e tinha dois problemas:
 *
 *  1) Os routers dos modulos (almoxarifado, extended, frotas, producao, todolist, chat...) eram
 *     registrados DEPOIS dele — o `extended` e o chat ate depois do `listen`. No Express um
 *     middleware de erro so pega erro de quem foi registrado antes dele, entao um `next(err)`
 *     dessas rotas caia no finalhandler: 500 `text/html` com stack. A correcao (no index.js) e o
 *     Router `rotasModulos`, montado ANTES dos handlers; rota adicionada nele depois continua
 *     rodando na posicao do Router.
 *  2) Todo erro virava 500, mesmo o que ja trazia 4xx (JSON malformado do `express.json` vem com
 *     `status = 400`; corpo acima do limite, `413`).
 *
 * Saiu do `index.js` porque o harness (tests/helpers/testApp.js) nao pode dar `require` nele (ele
 * sobe o servidor) e precisa montar os MESMOS handlers.
 *
 * ── A REGRA ──────────────────────────────────────────────────────────────────────────────────
 *
 *  - SQLITE_BUSY / "database is locked" -> 503 (como antes).
 *  - `MulterError` (o LIMIT_FILE_SIZE ja foi tratado pelo `tratarArquivoGrandeDemais`, antes
 *    deste) -> 400 "Upload inválido".
 *  - erro com `status`/`statusCode` 4xx -> o mesmo status, e a mensagem:
 *      `err.mensagemUsuario` quando o NOSSO codigo a pos (ver `erroComMensagemUsuario`);
 *      senao, pelo `err.type` do body-parser (JSON malformado, corpo grande demais);
 *      senao, "Requisição inválida".
 *    NUNCA o `err.message` cru: o de terceiros vem em ingles ("Unexpected token } in JSON",
 *    "request entity too large"). Por isso tambem NAO se usa `err.expose` (decisao B41).
 *  - Excecoes ao "4xx passa" (revisao adversarial da 86):
 *      404 sem `mensagemUsuario` -> "Arquivo não encontrado" se `err.code === 'ENOENT'` (o
 *        `res.sendFile` do Express devolve 404 com o ENOENT do disco), senao "Recurso não
 *        encontrado" — "Requisição inválida" para 404 mentia sobre a causa;
 *      401/403 SEM `mensagemUsuario` (de terceiro) -> 500 generico. O client trata 401 como sessao
 *        expirada e desloga; o NOSSO auth responde 401/403 direto, sem passar por aqui;
 *      `parameters.too.many` (urlencoded acima do `parameterLimit`, 413) -> "Requisição grande demais".
 *  - Antes de responder JSON, um `Content-Disposition` que a rota ja tinha posto (download que
 *    falhou no `sendFile`) e removido — senao o navegador baixaria o JSON de erro com o nome do anexo.
 *  - o resto -> 500 "Erro interno do servidor", com `message` so em `development` (como antes).
 */

const MSG_ERRO_INTERNO = 'Erro interno do servidor';
const MSG_REQUISICAO_INVALIDA = 'Requisição inválida';
const MSG_UPLOAD_INVALIDO = 'Upload inválido';
const MSG_JSON_INVALIDO = 'JSON inválido no corpo da requisição';
const MSG_REQUISICAO_GRANDE = 'Requisição grande demais';
const MSG_ARQUIVO_NAO_ENCONTRADO = 'Arquivo não encontrado';
const MSG_RECURSO_NAO_ENCONTRADO = 'Recurso não encontrado';

/**
 * Erro com mensagem que PODE ir ao usuario (o handler global so manda ao cliente o texto de
 * `mensagemUsuario`, nunca o `message`). Usado pelos `fileFilter` dos multers do almoxarifado.
 */
function erroComMensagemUsuario(mensagem, status = 400) {
  const err = new Error(mensagem);
  err.status = status;
  err.mensagemUsuario = mensagem;
  return err;
}

function ehErroDeLock(err) {
  return Boolean(err && ((err.message && (err.message.includes('database is locked')
    || err.message.includes('SQLITE_BUSY'))) || err.code === 'SQLITE_BUSY'));
}

/** "Requisição grande demais (máximo 15 MB)"; `limit` do body-parser em bytes; sem limite -> sem numero. */
function mensagemRequisicaoGrande(limite) {
  if (typeof limite !== 'number' || !Number.isFinite(limite) || limite <= 0) return MSG_REQUISICAO_GRANDE;
  const mb = limite / (1024 * 1024);
  const texto = mb >= 1
    ? `${String(Math.round(mb * 10) / 10).replace('.', ',')} MB`
    : `${String(Math.round((limite / 1024) * 10) / 10).replace('.', ',')} KB`;
  return `${MSG_REQUISICAO_GRANDE} (máximo ${texto})`;
}

function temMensagemUsuario(err) {
  return typeof err.mensagemUsuario === 'string' && Boolean(err.mensagemUsuario.trim());
}

function mensagem4xx(err, status) {
  if (temMensagemUsuario(err)) return err.mensagemUsuario;
  if (status === 404) return err.code === 'ENOENT' ? MSG_ARQUIVO_NAO_ENCONTRADO : MSG_RECURSO_NAO_ENCONTRADO;
  if (err.type === 'entity.parse.failed') return MSG_JSON_INVALIDO;
  if (err.type === 'entity.too.large') return mensagemRequisicaoGrande(err.limit);
  if (err.type === 'parameters.too.many') return MSG_REQUISICAO_GRANDE;
  return MSG_REQUISICAO_INVALIDA;
}

// eslint-disable-next-line no-unused-vars
function tratarErroGlobalApi(err, req, res, next) {
  if (!err) return next();
  if (res.headersSent) return next(err);
  // Download que falhou no `sendFile`: a rota ja tinha posto o `attachment` (ex.: anexos do extended).
  res.removeHeader('Content-Disposition');
  if (ehErroDeLock(err)) {
    console.warn('⚠️ Erro de lock no banco de dados:', err.message);
    return res.status(503).json({
      error: 'Banco de dados temporariamente ocupado. Tente novamente em alguns segundos.',
      retryAfter: 2,
    });
  }
  if (err.name === 'MulterError') {
    console.warn('[upload] multer recusou:', err.code, err.message, req.method, req.originalUrl);
    return res.status(400).json({ error: MSG_UPLOAD_INVALIDO });
  }
  const status = Number(err.status || err.statusCode);
  const authDeTerceiro = (status === 401 || status === 403) && !temMensagemUsuario(err);
  if (Number.isInteger(status) && status >= 400 && status < 500 && !authDeTerceiro) {
    console.warn('[api] erro', status, err.type || '', err.message, req.method, req.originalUrl);
    return res.status(status).json({ error: mensagem4xx(err, status) });
  }
  console.error('❌ Erro na API:', err);
  return res.status(500).json({
    error: MSG_ERRO_INTERNO,
    message: process.env.NODE_ENV === 'development' ? err.message : undefined,
  });
}

module.exports = {
  erroComMensagemUsuario, mensagemRequisicaoGrande, MSG_ARQUIVO_NAO_ENCONTRADO, MSG_ERRO_INTERNO, MSG_JSON_INVALIDO,
  MSG_RECURSO_NAO_ENCONTRADO, MSG_REQUISICAO_INVALIDA, MSG_UPLOAD_INVALIDO, tratarErroGlobalApi,
};
