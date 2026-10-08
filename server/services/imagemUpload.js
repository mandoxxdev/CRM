/**
 * Etapa 82 (RN-82.06) — decisao de tipo/extensao das imagens enviadas fora do almoxarifado.
 *
 * ── O DEFEITO ────────────────────────────────────────────────────────────────────────────────
 *
 * As rotas `foto-base64` faziam `b64.match(/^data:image\/(\w+);base64,(.+)$/)` e gravavam
 * `'.' + match[1]`: `data:image/html;base64,...` virava `grupo_1_<ts>.html` em disco. E o caso SEM
 * prefixo (nao casou) era decodificado cru e salvo como `.jpg` — `data:image/svg+xml` e
 * `data:image/x-icon` caiam nele porque `\w+` nao casa `+`/`-`. Os multers de grupos-compras e
 * fornecedores tiravam a extensao do NOME original (com filtro so por MIME), e os de avatar e foto
 * da proposta usavam um regex solto (`/jpeg|jpg|png|gif|webp/`) que aceita `image/pjpeg` e
 * `image/x-png` — tipos que nao estao no mapa do `extensaoSegura` e virariam `.bin`.
 *
 * A regra agora tem UM lugar, ancorado no mapa de `extensaoSegura` (urlUpload.js): a imagem so e
 * aceita se o MIME estiver nele, e a extensao em disco vem dele — nunca do nome nem do texto livre
 * do `data:`. Nenhum client manda outra coisa (todos pre-filtram jpeg/png/gif/webp).
 */
const { extensaoSegura } = require('./almoxarifado/urlUpload');

const MSG_FORMATO_NAO_SUPORTADO = 'Formato de imagem não suportado';

// `[a-z0-9.+-]+` de proposito, e nao `\w+`: precisa CASAR `svg+xml` e `x-icon` para recusa-los
// pelo mapa. Com `\w+` eles nao casavam e caiam no ramo "sem prefixo", que gravava como `.jpg`.
const RE_DATA_URL_IMAGEM = /^data:(image\/[a-z0-9.+-]+);base64,([\s\S]+)$/i;

/** MIME de imagem aceito = tem extensao propria no mapa do `extensaoSegura` (nao cai no `.bin`). */
function ehMimeImagemAceito(mimetype) {
  const m = String(mimetype || '').toLowerCase();
  return m.startsWith('image/') && extensaoSegura(m) !== '.bin';
}

/**
 * `data:image/<tipo>;base64,<dados>` -> `{ ext, buf, mime }`, ou `{ erro }` (o handler responde 400
 * com `erro`). Sem prefixo, tipo fora do mapa ou base64 vazio -> erro. Nao ha mais "decodifica cru".
 */
function decodificarImagemBase64(texto) {
  const m = typeof texto === 'string' ? texto.match(RE_DATA_URL_IMAGEM) : null;
  if (!m) return { erro: MSG_FORMATO_NAO_SUPORTADO };
  const mime = m[1].toLowerCase();
  if (!ehMimeImagemAceito(mime)) return { erro: MSG_FORMATO_NAO_SUPORTADO };
  const buf = Buffer.from(m[2].replace(/\s/g, ''), 'base64');
  if (!buf.length) return { erro: MSG_FORMATO_NAO_SUPORTADO };
  return { ext: extensaoSegura(mime), buf, mime };
}

/** `fileFilter` de multer: so MIME do mapa. O nome original nao e consultado (nem para a extensao). */
function filtroImagemMulter(mensagem) {
  return (req, file, cb) => {
    if (ehMimeImagemAceito(file && file.mimetype)) return cb(null, true);
    return cb(new Error(mensagem || 'Apenas imagens (JPEG, PNG, GIF, WEBP)'));
  };
}

module.exports = {
  decodificarImagemBase64, ehMimeImagemAceito, filtroImagemMulter, MSG_FORMATO_NAO_SUPORTADO,
};
