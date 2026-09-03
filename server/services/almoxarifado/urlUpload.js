/**
 * URL assinada para os uploads LEGADOS do almoxarifado — Etapa 33 (furo C42).
 *
 * Ate aqui `uploads/almoxarifado` era servido por dois `express.static` SEM autenticacao nenhuma:
 * quem tivesse a URL baixava DESLOGADO o certificado do fornecedor, o comprovante de sucateamento
 * e a IMAGEM DA ASSINATURA de quem retirou material. A defesa era o nome do arquivo
 * (`Date.now()` + `random*1e9`) — obscuridade, nao controle.
 *
 * ── POR QUE NAO `?token=` ────────────────────────────────────────────────────────────────────
 *
 * `authenticateToken` (server/index.js:2874) ACEITA o JWT na query string, e usa-lo seria a
 * correcao de menor esforco. Esta base ja recusou esse caminho, com raciocinio escrito, em
 * `client/src/components/almoxarifado/RelatoriosAlmoxarifado.js:34-37`: vazaria o token na URL, no
 * historico do navegador, no `Referer` e no log do nginx, e nenhum download do app faz isso.
 * O JWT daqui nao expira em minutos e abre o CRM INTEIRO.
 *
 * A assinatura deste modulo NAO e credencial de sessao: ela vale para UM arquivo por ~15 minutos.
 * Vazar essa URL vaza a capacidade de baixar aquele arquivo ate expirar — incomparavelmente menos
 * que vazar a sessao. Nao estamos reabrindo aquela decisao; estamos respeitando o motivo dela.
 */
const crypto = require('crypto');

const MINUTOS_VALIDADE = 15;
const PREFIXO = '/api/uploads/almoxarifado';

// O `sig` e conferido por FORMATO antes de virar buffer, e isso nao e zelo — e correcao de um
// defeito medido: `sig.length` conta CARACTERES e `crypto.timingSafeEqual` compara BYTES. Um `sig`
// com 32 caracteres acentuados tem 64 bytes, passava por um guard de comprimento de string e
// fazia o `timingSafeEqual` lancar RangeError -> 500, violando a regra de "toda falha e 404".
const HEX32 = /^[0-9a-f]{32}$/;

/**
 * DERIVA a chave da assinatura a partir do segredo raiz, em vez de usar o segredo do JWT direto.
 *
 * Assinar URL de arquivo com a MESMA chave que assina sessao mistura dois dominios: qualquer
 * fraqueza futura de um vira alavanca contra o outro, e a assinatura daqui e exposta em URL —
 * muito mais visivel que um token em header. Derivar custa um hash no boot e nao muda contrato
 * nenhum: as URLs continuam com a mesma forma.
 *
 * E EXPORTADA, e nao escondida no closure, por um motivo pratico: o cenario da RN-03 precisa
 * construir uma assinatura CORRETA e VENCIDA — coisa que `assinar()` nao emite, porque ele so gera
 * `exp` no futuro. Sem exportar, o teste duplicaria a string de dominio e as duas copias
 * divergiriam na primeira mudanca.
 */
function derivarSegredoUpload(segredoRaiz) {
  return crypto.createHash('sha256')
    .update(`${segredoRaiz}:almoxarifado-uploads-v1`)
    .digest();
}

/**
 * A extensao do arquivo em disco vem do MIME ACEITO, nunca do nome que o cliente mandou.
 *
 * ── O DEFEITO QUE ISTO FECHA (reproduzido contra o servidor real) ────────────────────────────
 *
 * Os `fileFilter` do modulo validam o `Content-Type` que o CLIENTE DECLARA, mas a extensao gravada
 * vinha de `path.extname(file.originalname)` — outro campo, controlado pelo atacante de forma
 * INDEPENDENTE. Entao `Content-Type: image/png` com `filename="payload.html"` passava no filtro e
 * gravava `.html`.
 *
 * O `express.static` servia esse arquivo como `text/html` NA ORIGEM DO CRM, sem `nosniff` e sem
 * CSP (nao ha helmet neste app). O caminho de vitima era um clique normal: "Ver certificado" em
 * Lotes navega para a URL, mesma origem, com a sessao do usuario. XSS armazenado.
 *
 * `.svg` tem o mesmo efeito (`image/svg+xml` executa script ao navegar) e `.js` sai como
 * `application/javascript`.
 *
 * A Etapa 32 ja tinha fechado exatamente isto nos ANEXOS; os uploads legados ficaram de fora, e a
 * revisao adversarial da Etapa 33 mediu. Este helper existe para que a regra tenha UM lugar — seis
 * multers repetindo o mapa divergiriam no primeiro tipo novo.
 */
const EXTENSAO_POR_MIME = Object.freeze({
  'application/pdf': '.pdf',
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif',
  'image/webp': '.webp',
});

function extensaoSegura(mimetype) {
  // `.bin` para o que passou pelo filtro mas nao esta no mapa: nao executa, nao renderiza, e o
  // navegador baixa. Preferivel a confiar no nome — e se aparecer, e sinal de mapa desatualizado.
  return EXTENSAO_POR_MIME[String(mimetype || '').toLowerCase()] || '.bin';
}

/**
 * Cabecalhos do `express.static` dos uploads. `nosniff` impede o navegador de adivinhar tipo pelo
 * conteudo, e a CSP `sandbox` neutraliza script mesmo que algum `.html` legado ja esteja no disco —
 * porque fechar o upload NAO limpa o que ja foi gravado antes desta correcao.
 */
function cabecalhosUploadSeguro(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
  // `private`: o conteudo e servido sob assinatura e nao deve ser guardado por cache compartilhado.
  res.setHeader('Cache-Control', 'private, max-age=0, must-revalidate');
}

function criarAssinadorUpload(segredoRaiz) {
  if (!segredoRaiz) throw new Error('urlUpload: segredo obrigatorio');

  // Achado da revisao adversarial — ver o cabecalho de `derivarSegredoUpload`.
  const segredo = derivarSegredoUpload(segredoRaiz);

  // O NOME DO ARQUIVO entra no HMAC. Sem ele, uma assinatura valida para `material-1.png` serviria
  // para `assinatura-9.png` — o erro classico deste padrao, e o unico motivo da RN-02 existir.
  //
  // `String(exp)` dos dois lados de proposito: `assinar` gera `exp` numerico e `verificar` recebe
  // a string da query. O template literal ja chamaria ToString nos dois, mas deixar explicito
  // evita que alguem "otimize" a interpolacao e crie divergencia entre assinar e verificar.
  const calcular = (filename, exp) => crypto
    .createHmac('sha256', segredo)
    .update(`${filename}:${String(exp)}`)
    .digest('hex')
    .slice(0, 32);

  function assinar(filename) {
    const nome = String(filename || '').trim();
    if (!nome) return null;
    // `exp` em BALDE de 5 minutos, e nao `agora + 900` cru: sem isso o `exp` muda a cada segundo,
    // toda carga de lista gera URLs ineditas e o cache do navegador nunca reaproveita nada —
    // regressao de performance justamente na tela de N imagens que motivou este desenho. Com o
    // balde, a URL do mesmo arquivo e estavel por 5 min e a validade efetiva fica entre 15 e 20.
    const agora = Math.floor(Date.now() / 1000);
    const exp = Math.ceil(agora / 300) * 300 + MINUTOS_VALIDADE * 60;
    return `${PREFIXO}/${encodeURIComponent(nome)}?exp=${exp}&sig=${calcular(nome, exp)}`;
  }

  function verificar(filename, exp, sig) {
    // Formato ANTES da coercao: Number.isInteger(Number('9e99')) e TRUE, e o mesmo vale para
    // hexadecimal, espaco em volta e sinal — o guard aceitava formas que a mintagem nunca emite.
    // Nao era exploravel (trocar o exp invalida o sig), mas o guard nao expressava a intencao.
    if (!/^[0-9]{1,10}$/.test(String(exp))) return false;
    const n = Number(exp);
    // TETO: nenhuma URL pode viver mais que a janela do balde (15 a 20 min). Se algum dia algo
    // minar um exp distante, ele nao vira acesso perpetuo.
    const agora = Math.floor(Date.now() / 1000);
    if (n < agora || n > agora + (MINUTOS_VALIDADE + 5) * 60) return false;
    if (typeof sig !== 'string' || !HEX32.test(sig)) return false;
    const esperado = calcular(filename, exp);
    const recebido = Buffer.from(sig, 'utf8');
    const alvo = Buffer.from(esperado, 'utf8');
    if (recebido.length !== alvo.length) return false;
    return crypto.timingSafeEqual(recebido, alvo);
  }

  // 404 em TODA falha, nunca 401/403: um 401 confirmaria que o arquivo existe, que e exatamente a
  // informacao que a obscuridade de hoje protege por acidente. Quem enumera nao aprende nada.
  //
  // Sem banco e sem sessao, de proposito: este middleware roda em TODA imagem de TODA lista, e nao
  // pode custar uma consulta.
  function middleware(req, res, next) {
    let nome;
    try {
      // `%` solto no nome (`/foo%.png`) faz `decodeURIComponent` lancar URIError. Medido pela rota
      // real: `req.path` chega NAO decodificado, entao quem estoura e este decode — e um 500 aqui
      // seria um status distinto de 404, vazando que a requisicao chegou ao middleware.
      nome = decodeURIComponent(String(req.path || '').replace(/^\/+/, ''));
    } catch (e) {
      return res.status(404).end();
    }
    if (!nome || nome.includes('/') || nome.includes('\\')) return res.status(404).end();
    if (!verificar(nome, req.query.exp, req.query.sig)) return res.status(404).end();
    return next();
  }

  return { assinar, verificar, middleware, MINUTOS_VALIDADE };
}

module.exports = {
  criarAssinadorUpload, derivarSegredoUpload, extensaoSegura, cabecalhosUploadSeguro,
  MINUTOS_VALIDADE, PREFIXO,
};
