/**
 * Etapa 21 (RN-04) — regua da configuracao de SMTP do CORE.
 *
 * Por que existe: `getEmailConfig` (server/index.js) devolvia os quatro campos HARDCODED, sem
 * olhar para o ambiente — a senha literal esta no git desde 2026-03-17. Trocar o arquivo NAO
 * remove a credencial de clone nenhum; so a rotacao na Locaweb resolve, e isso e operacao, nao
 * codigo (declarado na letra B). O que o codigo consegue fazer e parar de depender dela como
 * fonte PRIMARIA: com `SMTP_PASS` no ambiente, a senha do arquivo nunca e usada.
 *
 * Funcao PURA de proposito: `server/index.js` tem 23 mil linhas, abre banco em disco e faz
 * `listen` no import, entao nao ha harness de core. O que da para testar e a regua — e ela esta
 * congelada em `tests/api/emailConfigCore.api.test.js`. Mesmo padrao de `backupPackage.js` e
 * `configSecrets.js` nesta etapa.
 *
 * PRECEDENCIA: env -> hardcoded. O BANCO FICA FORA, de proposito. Ver o comentario de
 * `resolverEmailConfig`.
 */

/**
 * Um `from` so pode carregar UM endereco: dois enderecos num `From:` sao recusados pelo servidor
 * SMTP e o e-mail para de sair, em silencio. Virgula e ponto-e-virgula sao os dois separadores
 * de lista que aparecem na pratica; qualquer um dos dois desqualifica o valor.
 *
 * Deliberadamente FROUXO no resto (nao valida dominio, TLD nem RFC 5322): a pergunta aqui e "da
 * para usar isto como remetente unico?", nao "este endereco existe?". Uma validacao apertada
 * demais recusaria remetente legitimo e jogaria tudo para o `user` sem motivo.
 */
function ehEnderecoUnico(valor) {
  if (valor === null || valor === undefined) return false;
  const texto = String(valor).trim();
  if (texto === '') return false;
  if (texto.includes(',') || texto.includes(';')) return false;
  if (/\s/.test(texto)) return false;
  return /^[^@\s]+@[^@\s]+$/.test(texto);
}

/**
 * RN-04 — resolve a configuracao de SMTP a partir do ambiente, caindo para os padroes.
 *
 * Assinatura TRAVADA em `(env, padroes)`. O BANCO NAO PARTICIPA, e isso e uma decisao, nao um
 * esquecimento: os campos `email_smtp_host`/`email_smtp_pass` da tabela `configuracoes` ESTAO
 * preenchidos hoje, e o host de la (`smtplw.com.br`) e OUTRO produto da Locaweb, com outro
 * esquema de credencial, diferente do `smtp.locaweb.com.br` que esta funcionando em producao.
 * Uma regra do tipo "usa o banco quando estiver completo" nao seria salvaguarda — seria um
 * interruptor que trocaria o host de producao sem ninguem pedir, e ainda poria no `from` a lista
 * de DOIS enderecos que esta gravada la. Adotar o banco exige um envio real verificado contra
 * aquele host, impossivel de fazer daqui; ficou declarado na letra B. (Achado A1 da revisao do
 * design, que corrigiu o proprio design.)
 *
 * A precedencia e CAMPO A CAMPO. Nada de "se SMTP_HOST existe, usa o bloco da env inteiro":
 * isso faria uma unica variavel definida arrastar as outras tres para `undefined`.
 *
 * @param {object} env    normalmente `process.env`
 * @param {object} padroes ultimo recurso (o hardcoded do index.js)
 * @returns {{host: string, user: string, pass: string, from: string}}
 */
function resolverEmailConfig(env, padroes) {
  const e = env || {};
  const p = padroes || {};

  const host = e.SMTP_HOST || p.host;
  const user = e.SMTP_USER || p.user;
  const pass = e.SMTP_PASS || p.pass;

  // `from` configurado so vale se for endereco unico; senao, o proprio `user` — que e a caixa
  // autenticada e sempre um endereco so.
  const fromConfigurado = e.SMTP_FROM || p.from;
  const from = ehEnderecoUnico(fromConfigurado) ? String(fromConfigurado).trim() : user;

  return { host, user, pass, from };
}

module.exports = { resolverEmailConfig };
