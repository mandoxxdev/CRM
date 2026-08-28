/**
 * Etapa 21 (C3) — regua do segredo nas configuracoes do CORE (tabela `configuracoes`).
 *
 * Por que existe: `GET /api/configuracoes` e `GET /api/configuracoes/:chave` devolviam
 * `email_smtp_pass` EM CLARO para admin de administrativo OU comercial — grupo bem maior que
 * quem precisa da senha do SMTP — e o `PUT /:chave` gravava qualquer valor sem guarda nenhuma.
 * O modulo do almoxarifado ja tinha as duas metades (`alertService.getAlertSettingsForApi` +
 * `shouldUpdateSecret`); o core nao tinha nem uma.
 *
 * Funcao PURA de proposito: `server/index.js` tem 23 mil linhas, abre banco em disco e faz
 * `listen` no import, entao nao ha harness de core. O que da para testar e a regua — e ela
 * esta congelada em `tests/api/configSecretsCore.api.test.js`.
 *
 * FONTE UNICA DA MASCARA: reusa `PASSWORD_MASK` de `services/almoxarifado/alertService.js:17`.
 * NAO criar uma segunda constante — duas mascaras divergentes fariam o GET emitir uma forma que
 * a guarda do PUT nao reconhece, que e exatamente o buraco que este arquivo fecha. Ha assercao
 * de teste comparando as duas.
 */
const alertService = require('./almoxarifado/alertService');

const PASSWORD_MASK = alertService.PASSWORD_MASK;

// So `email_smtp_pass` por enquanto. As demais chaves de e-mail (host, porta, usuario, from)
// nao sao segredo — mascara-las quebraria a tela sem reduzir exposicao. As 3 chaves da aba
// "Backup" nao entram porque nenhum leitor do servidor as consome (feature morta, nomeada no
// design da Etapa 21).
const CHAVES_SECRETAS_CORE = ['email_smtp_pass'];

function ehChaveSecretaCore(chave) {
  return CHAVES_SECRETAS_CORE.includes(chave);
}

/**
 * RN-05 — mascara para a SERIALIZACAO dos dois GETs.
 *
 * Devolve o valor ORIGINAL (mesma referencia, mesmo tipo) quando a chave nao e secreta: as
 * rotas ja converteram por `row.tipo` antes de chamar aqui, entao um `String(valor)` aqui
 * transformaria a porta 587 em '587' e o campo numerico da tela pararia de bater.
 *
 * Chave secreta com conteudo -> PASSWORD_MASK. Chave secreta vazia -> '' e NAO a mascara:
 * mostrar '********' para senha inexistente MENTIRIA "ja configurado" para quem abre a tela.
 * Mesma forma que `getAlertSettingsForApi` (alertService.js:162) e a rota irma
 * (routes/almoxarifado.js:2398) ja devolvem, para as duas telas verem o mesmo formato.
 */
function mascararValorConfig(chave, valor) {
  if (!ehChaveSecretaCore(chave)) return valor;
  if (valor === null || valor === undefined) return '';
  return String(valor) === '' ? '' : PASSWORD_MASK;
}

// Mensagem literal do 400 do `PUT /api/configuracoes/:chave`. Mora AQUI, e nao inline na rota,
// porque e a unica parte da fiacao HTTP que o teste consegue congelar sem harness de core — e
// porque ela precisa DIZER O QUE FAZER: "recusado" sozinho faria o admin tentar de novo com a
// mascara. Acentuada de proposito: e texto de tela, e a rota vizinha ja responde
// 'Configuração não encontrada'.
const MENSAGEM_SEGREDO_INVALIDO =
  'Valor inválido para senha: deixe o campo em branco para manter a senha atual';

/**
 * RN-06 — guarda do `PUT /api/configuracoes/:chave` para chave secreta.
 *
 * Devolve `{ ok, motivo }`; `motivo` e `'VAZIO'` ou `'MASCARA'` no caso de recusa e `null` no
 * sucesso — a rota precisa distinguir os dois para dizer ao usuario o que fazer.
 *
 * O `includes` (e nao `===`) e o ponto do achado A2 da revisao do design, REPRODUZIDO: a tela
 * do core salva a cada tecla. Com a mascara no input, o admin que clicasse no campo e digitasse
 * mandaria '********N' — que NAO e a mascara, passa em qualquer guarda de igualdade e
 * SOBRESCREVE a senha real com lixo. E como o GET seguinte remascara, o estrago fica invisivel
 * ate o proximo e-mail nao sair. A tela foi corrigida junto (RN-07: campo nasce vazio), mas a
 * guarda do servidor nao pode depender de a tela estar certa — e o backend que decide.
 *
 * Vazio tambem e recusa, nao "apagar a senha": o unico jeito de esvaziar o campo passa a ser um
 * UPDATE deliberado no banco, nao um backspace acidental num formulario que salva sozinho.
 * Regua irma: `alertService.shouldUpdateSecret:168-172` (que devolve boolean e trata o vazio
 * como "nao mexer" porque la a tela manda o formulario inteiro; aqui a rota grava uma chave por
 * vez, entao o vazio vira 400 em vez de no-op silencioso — decisao A3 do design).
 */
function podeGravarSegredo(valor) {
  if (valor === null || valor === undefined) return { ok: false, motivo: 'VAZIO' };
  const texto = String(valor);
  if (texto.trim() === '') return { ok: false, motivo: 'VAZIO' };
  if (texto.includes(PASSWORD_MASK)) return { ok: false, motivo: 'MASCARA' };
  return { ok: true, motivo: null };
}

module.exports = {
  PASSWORD_MASK,
  MENSAGEM_SEGREDO_INVALIDO,
  CHAVES_SECRETAS_CORE,
  ehChaveSecretaCore,
  mascararValorConfig,
  podeGravarSegredo,
};
