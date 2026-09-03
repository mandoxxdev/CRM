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
    const n = Number(exp);
    if (!Number.isInteger(n) || n * 1000 < Date.now()) return false;
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

module.exports = { criarAssinadorUpload, derivarSegredoUpload, MINUTOS_VALIDADE, PREFIXO };
