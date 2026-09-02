/**
 * Etapa 25, Task 3 (contrato C2) — DE ONDE veio a requisicao, para a trilha de auditoria.
 *
 * ── Por que DOIS campos de IP, e nao um ──────────────────────────────────────────────────────
 * `trust proxy` NAO esta configurado neste servidor: a unica ocorrencia do termo no repositorio
 * e um comentario dizendo isso. Sem ele, o Express nao interpreta `x-forwarded-for` e `req.ip`
 * vale o endereco de quem ABRIU A CONEXAO — atras do nginx, `127.0.0.1` para todo mundo.
 * Gravar `req.ip` cru encheria a trilha de PRODUCAO com o IP do proxy enquanto o teste local,
 * que fala direto com o express, passa verde: falha silenciosa, o modo que esta base ja pagou
 * caro mais de uma vez.
 *
 * Guardar SO o `x-forwarded-for` tambem nao serve: ele e cabecalho, ou seja, forjavel pelo
 * cliente, e some quando nao ha proxy. Entao a trilha guarda os dois lados e nao esconde de
 * ninguem qual e qual — `ip` e a melhor leitura do cliente, `ip_proxy` e por onde ela chegou.
 * E o mesmo par que o core grava desde a Etapa 21 (`index.js`, `ip=${req.ip} xff=${...}`).
 *
 * NAO ligue `trust proxy` como "consequencia" desta funcao: isso mudaria `req.ip` para TODAS as
 * rotas do sistema, inclusive as de rate limit e log do core, e e decisao de infraestrutura que
 * esta etapa nao tomou.
 *
 * ── Por que nao lanca NUNCA (RN-05) ─────────────────────────────────────────────────────────
 * A origem existe para virar DADO INERTE: um objeto pronto, pendurado em `req.user` pelo
 * middleware, que o motor de movimentacao le sem tocar em Express. A auditoria de movimentacao
 * NAO tem `try/catch` (59 das 60 chamadas de `registrarAuditoria` do modulo estao sem `try`), e
 * criar um ali mudaria semantica congelada. Como nao ha rede de seguranca no ponto da ESCRITA,
 * toda a robustez vive aqui, na porta de ENTRADA: `req` malformado, sem `get`, ou com um `get`
 * que lanca devolvem campos nulos em vez de derrubar a movimentacao.
 */

// Truncamento do user-agent. 255 e folgado para os navegadores reais (os maiores em uso ficam
// perto de 200) e curto o bastante para o campo nunca virar payload: sem limite, um cliente
// hostil escreve kilobytes por linha de auditoria e a tabela vira o vetor de crescimento.
// O numero e AFIRMADO no teste de proposito — mudar aqui tem de ser decisao, nao acidente.
const LIMITE_USER_AGENT = 255;

const VAZIO = { ip: null, ip_proxy: null, user_agent: null };

/**
 * Le um cabecalho de um `req` que pode nao ser um `req`. Tenta `req.get` (a forma canonica do
 * Express, case-insensitive) e cai para `req.headers` quando ele nao existe ou explode.
 */
function lerCabecalho(req, nome) {
  try {
    if (typeof req.get === 'function') {
      const v = req.get(nome);
      if (v !== undefined && v !== null) return v;
    }
  } catch (e) { /* req.get hostil ou fora de contexto — cai para os headers crus */ }
  try {
    const h = req.headers;
    if (h && typeof h === 'object') return h[nome];
  } catch (e) { /* nem headers — devolve undefined */ }
  return undefined;
}

/** Normaliza para string nao vazia, ou null. Cabecalho repetido chega como array no Node. */
function texto(v) {
  const bruto = Array.isArray(v) ? v.join(',') : v;
  if (typeof bruto !== 'string') return null;
  const t = bruto.trim();
  return t ? t : null;
}

/**
 * `origemRequisicao(req) -> { ip, ip_proxy, user_agent }` (contrato C2).
 *
 *   ip         = primeiro endereco do `x-forwarded-for` (o cliente) quando houver; senao req.ip
 *   ip_proxy   = req.ip quando difere do `ip`; senao null (nao duplica o mesmo endereco)
 *   user_agent = user-agent truncado em LIMITE_USER_AGENT; null quando ausente
 *
 * Cadeia com o primeiro item em branco (`", proxy1"`) cai no primeiro item NAO vazio, e uma
 * cadeia inteiramente vazia cai no `req.ip` — degenerado, mas melhor do que gravar `null` e
 * perder tambem o endereco da conexao.
 */
function origemRequisicao(req) {
  if (!req || typeof req !== 'object') return { ...VAZIO };

  let ipDireto = null;
  try { ipDireto = texto(req.ip); } catch (e) { ipDireto = null; }

  const cadeia = texto(lerCabecalho(req, 'x-forwarded-for'));
  const primeiroDaCadeia = cadeia
    ? (cadeia.split(',').map((p) => p.trim()).find((p) => p.length > 0) || null)
    : null;

  const ip = primeiroDaCadeia || ipDireto;
  // So e `ip_proxy` quando ha de fato um segundo endereco a contar. Sem proxy os dois seriam
  // iguais, e uma coluna repetindo a outra so ensina o leitor da trilha a ignorar as duas.
  const ipProxy = ipDireto && ip && ipDireto !== ip ? ipDireto : null;

  const ua = texto(lerCabecalho(req, 'user-agent'));

  return {
    ip: ip || null,
    ip_proxy: ipProxy,
    user_agent: ua ? ua.slice(0, LIMITE_USER_AGENT) : null,
  };
}

/**
 * Middleware do modulo: pendura a origem no `req.user`, que e o objeto que TODAS as rotas do
 * almoxarifado repassam aos servicos (`Service.x(db, req.user, ...)`).
 *
 * Por que aqui e nao no 4o parametro (`opcoes`) do motor: dos 28 call sites de
 * `registrarMovimentacao` em producao, 23 nascem DENTRO de servicos que nao tem `req` — pela
 * via de `opcoes` so as 5 rotas que chamam o motor direto passariam origem, e os outros 23
 * gravariam `null` em silencio. `req.user` alcanca os 28 sem mudar assinatura nenhuma.
 *
 * TEM de rodar DEPOIS que a autenticacao terminou, e "depois" aqui e mais estrito do que parece:
 * `authenticateToken` faz `req.user = user`, SUBSTITUINDO o objeto. Um `app.use(prefixo, ...,
 * anexarOrigem)` roda antes dos middlewares de ROTA, e as rotas da `extended` declaram `auth` de
 * novo em cada uma — a origem pendurada no prefixo era apagada por essa segunda passagem, com
 * todos os cenarios de unidade verdes (medido na execucao desta task). Por isso o registrador do
 * modulo ENVOLVE o `authenticateToken` com este middleware, em vez de acrescentar um `app.use`.
 *
 * Se `req.user` nao existir — rota fora do gate, ou auth que nao populou — nao inventa objeto:
 * segue adiante e a origem simplesmente nao e gravada.
 */
function anexarOrigemAoUsuario(req, res, next) {
  if (req && req.user && typeof req.user === 'object') {
    req.user.origem = origemRequisicao(req);
  }
  next();
}

/**
 * O que da origem vai para o `dados_novos` da auditoria. Funcao PURA sobre o `user` — nao toca
 * em Express, e por isso pode ser chamada de dentro do motor sem `try/catch` (RN-05).
 *
 * Campo nulo fica de FORA: a tela de auditoria monta `alteracoes` pela uniao das chaves dos dois
 * lados, entao uma chave gravada com `null` viraria a linha "ip_proxy: — → —" em toda
 * movimentacao feita sem proxy. Ausencia de chave e o jeito de dizer "nao havia isso".
 */
function camposDeOrigem(user) {
  const o = user && user.origem;
  if (!o || typeof o !== 'object' || Array.isArray(o)) return {};
  const campos = {};
  if (o.ip) campos.ip = o.ip;
  if (o.ip_proxy) campos.ip_proxy = o.ip_proxy;
  if (o.user_agent) campos.user_agent = o.user_agent;
  return campos;
}

module.exports = { origemRequisicao, anexarOrigemAoUsuario, camposDeOrigem, LIMITE_USER_AGENT };
