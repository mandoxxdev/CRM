/**
 * Etapa 21 / Task 2 — mascara e guarda do segredo nas configuracoes do CORE.
 *
 * Teste de SERVICO, nao de rota — mora em tests/api/ porque o runner (tests/api/run-all.js)
 * so descobre `*.api.test.js`. Mesmo precedente de `dbRecoveryBackup.api.test.js:1-6` e de
 * `backupExposicao.api.test.js` (Task 1 desta etapa).
 *
 * Por que so funcao pura: `server/index.js` tem 23 mil linhas, abre banco em disco e faz
 * `listen` no import — nao ha harness de core (tests/helpers/testApp.js monta so o
 * almoxarifado). A fiacao HTTP das 3 rotas (`GET /api/configuracoes`,
 * `GET /api/configuracoes/:chave`, `PUT /api/configuracoes/:chave`) fica DECLARADA sem teste
 * automatizado; a regua que elas consomem e testada aqui.
 *
 * O DEFEITO (medido na Fase 0 da Etapa 21): os dois GETs devolviam `email_smtp_pass` EM CLARO
 * para admin de administrativo OU comercial — grupo maior que quem precisa da senha — e o
 * `PUT /:chave` aceitava qualquer valor, sem a guarda que a rota irma do almoxarifado tem.
 *
 * O QUE ESTE ARQUIVO PROVA:
 *   RN-05 — `mascararValorConfig` devolve PASSWORD_MASK quando ha valor, `''` quando nao ha, e
 *   o valor INTACTO para chave nao-secreta (mascarar demais quebraria a tela inteira).
 *   FONTE UNICA — a constante e a MESMA exportada por `services/almoxarifado/alertService`.
 *   Se alguem criar uma segunda mascara ('***', '(oculto)'), este arquivo cai: duas mascaras
 *   divergentes ja seriam duas telas mostrando formatos diferentes para o mesmo dado, e a
 *   guarda do PUT deixaria de reconhecer a mascara que o GET emitiu.
 *   RN-06 — `podeGravarSegredo` recusa vazio, so-espacos, a mascara exata E qualquer valor que
 *   CONTENHA a mascara. O `contem` e o ponto: a tela do core salva a cada tecla, entao o admin
 *   que clicasse no campo com '********' e digitasse mandaria '********N' — que NAO e a
 *   mascara, passa em qualquer guarda de igualdade e SOBRESCREVE a senha real com lixo; e como
 *   o GET seguinte remascara, o estrago fica invisivel.
 *   (A versao anterior desta frase dizia "invisivel ate o proximo e-mail nao sair". ESTAVA
 *   ERRADA: ninguem em `server/` le `email_smtp_*` da tabela `configuracoes`, entao a coluna e
 *   dado morto hoje e sobrescreve-la nao derruba envio nenhum. A guarda vale pelo que a coluna
 *   representa e por uma etapa futura ligar o banco na precedencia — ver o comentario de
 *   `podeGravarSegredo`.)
 */
const assert = require('assert');

const alertService = require('../../services/almoxarifado/alertService');
const configSecrets = require('../../services/configSecrets');
const { mascararValorConfig, podeGravarSegredo, CHAVES_SECRETAS_CORE } = configSecrets;

let passed = 0; let failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { failed++; console.error(`  ✗ ${name}: ${e.message}`); }
}

const MASK = alertService.PASSWORD_MASK;

// ── Fonte unica da mascara ───────────────────────────────────────────────────────────

test('[fonte unica] configSecrets reusa o PASSWORD_MASK do alertService, sem segunda constante', () => {
  assert.strictEqual(configSecrets.PASSWORD_MASK, alertService.PASSWORD_MASK,
    'ha DUAS mascaras no projeto — o GET emitiria uma e a guarda do PUT reconheceria a outra');
});

test('[fonte unica] a mascara nao e vazia', () => {
  // Guarda de sanidade: com PASSWORD_MASK === '', `String(valor).includes(MASK)` seria SEMPRE
  // verdadeiro e `podeGravarSegredo` recusaria ate a senha legitima — a senha nunca mais
  // poderia ser trocada pela tela, e o sintoma seria "nao salva" sem nenhum erro util.
  assert.ok(typeof MASK === 'string' && MASK.length > 0, `PASSWORD_MASK=${JSON.stringify(MASK)}`);
});

test('[fonte unica] a chave secreta do core esta congelada', () => {
  assert.ok(Array.isArray(CHAVES_SECRETAS_CORE), 'CHAVES_SECRETAS_CORE deve ser lista');
  assert.ok(CHAVES_SECRETAS_CORE.includes('email_smtp_pass'),
    `email_smtp_pass saiu da lista de segredos: ${JSON.stringify(CHAVES_SECRETAS_CORE)}`);
});

// ── RN-05: mascara nos GETs ──────────────────────────────────────────────────────────

test('[RN-05] chave secreta com valor vira a mascara', () => {
  assert.strictEqual(mascararValorConfig('email_smtp_pass', 'Gmp@2024!'), MASK);
});

test('[RN-05] a senha real NAO aparece em lugar nenhum do valor mascarado', () => {
  // Assercao negativa sobre o valor devolvido: se a implementacao devolvesse a senha (ou um
  // prefixo dela, tipo 'Gmp...'), a igualdade acima pegaria, mas esta e a que diz o PORQUE.
  const saida = String(mascararValorConfig('email_smtp_pass', 'Gmp@2024!'));
  assert.ok(!saida.includes('Gmp'), `a senha vazou no GET: ${JSON.stringify(saida)}`);
});

test('[RN-05] chave secreta VAZIA devolve string vazia, nao a mascara', () => {
  // Dizer '********' para senha inexistente MENTIRIA "ja configurado" para quem abre a tela —
  // mesma decisao da rota irma do almoxarifado (routes/almoxarifado.js:2398).
  assert.strictEqual(mascararValorConfig('email_smtp_pass', ''), '');
});

test('[RN-05] chave secreta null/undefined tambem devolve string vazia', () => {
  assert.strictEqual(mascararValorConfig('email_smtp_pass', null), '');
  assert.strictEqual(mascararValorConfig('email_smtp_pass', undefined), '');
});

test('[RN-05] chave NAO secreta sai intacta (mascarar demais quebraria a tela)', () => {
  assert.strictEqual(mascararValorConfig('email_smtp_host', 'smtp.locaweb.com.br'), 'smtp.locaweb.com.br');
  assert.strictEqual(mascararValorConfig('empresa_nome', 'GMP Industriais'), 'GMP Industriais');
  assert.strictEqual(mascararValorConfig('email_smtp_user', 'contato@gmp.ind.br'), 'contato@gmp.ind.br');
});

test('[RN-05] chave nao secreta preserva o TIPO ja convertido pela rota', () => {
  // O GET converte por `row.tipo` ANTES de mascarar: number vira Number, boolean vira Boolean,
  // json vira objeto. Devolver String(valor) aqui transformaria 587 em '587' e o campo de porta
  // (type=number) da tela pararia de bater.
  assert.strictEqual(mascararValorConfig('email_smtp_port', 587), 587);
  assert.strictEqual(mascararValorConfig('backup_automatico', true), true);
  assert.strictEqual(mascararValorConfig('backup_automatico', false), false);
  const obj = { a: 1 };
  assert.strictEqual(mascararValorConfig('config_json', obj), obj);
});

// ── RN-06: guarda do PUT ─────────────────────────────────────────────────────────────

test('[RN-06] recusa null e undefined', () => {
  assert.strictEqual(podeGravarSegredo(null).ok, false);
  assert.strictEqual(podeGravarSegredo(undefined).ok, false);
});

test('[RN-06] recusa string vazia (nao ha "apagar a senha por atalho")', () => {
  const r = podeGravarSegredo('');
  assert.strictEqual(r.ok, false, 'string vazia passou pela guarda e APAGARIA a senha do SMTP');
  assert.ok(r.motivo, 'a recusa tem de dizer o motivo, senao a rota nao sabe o que responder');
});

test('[RN-06] recusa valor so com espacos', () => {
  assert.strictEqual(podeGravarSegredo('   ').ok, false);
  assert.strictEqual(podeGravarSegredo('\t\n ').ok, false);
});

test('[RN-06] recusa a mascara EXATA reenviada pela tela', () => {
  assert.strictEqual(podeGravarSegredo(MASK).ok, false,
    'gravaria a mascara como senha e mataria o envio de e-mail em silencio');
});

test('[RN-06] recusa mascara + digitacao (o caso REAL: a tela salva a cada tecla)', () => {
  // Achado A2 da revisao do design, reproduzido: com a mascara no input, clicar no fim do campo
  // e digitar 'N' dispara onChange com '********N'. Nao e a mascara, passa em guarda de
  // igualdade e sobrescreve a senha real. O GET remascara e o estrago fica invisivel.
  const r = podeGravarSegredo(`${MASK}N`);
  assert.strictEqual(r.ok, false,
    `'${MASK}N' passou pela guarda — e exatamente o valor que o onChange da tela manda`);
});

test('[RN-06] recusa mascara no MEIO e no FIM, nao so no comeco', () => {
  assert.strictEqual(podeGravarSegredo(`N${MASK}`).ok, false);
  assert.strictEqual(podeGravarSegredo(`a${MASK}b`).ok, false);
  assert.strictEqual(podeGravarSegredo(`  ${MASK}  `).ok, false);
});

test('[RN-06] recusa mascara PARCIAL apos backspace, se ainda contiver a mascara', () => {
  // Um backspace deixa '*******' (7 asteriscos) — nao contem a mascara de 8 e passa; e um
  // problema de valor invalido, nao de mascara, e a tela corrigida (RN-07) nunca chega la
  // porque o campo nasce vazio. O que NAO pode passar e a mascara inteira com sujeira em volta.
  assert.strictEqual(podeGravarSegredo(`${MASK}${MASK}`).ok, false);
});

test('[RN-06] recusa numero/objeto que virem mascara depois de String()', () => {
  assert.strictEqual(podeGravarSegredo({ toString: () => MASK }).ok, false);
});

test('[RN-06] ACEITA senha real (a guarda nao pode travar a troca legitima)', () => {
  const r = podeGravarSegredo('Nov@SenhaSMTP2026');
  assert.strictEqual(r.ok, true, `senha legitima recusada: ${JSON.stringify(r)}`);
});

test('[RN-06] ACEITA senha real que contenha asteriscos soltos', () => {
  assert.strictEqual(podeGravarSegredo('a*b*c*d').ok, true,
    'asterisco e caractere valido de senha — so a mascara INTEIRA e proibida');
});

test('[RN-06] o motivo distingue vazio de mascara (a rota precisa explicar o 400)', () => {
  assert.notStrictEqual(podeGravarSegredo('').motivo, podeGravarSegredo(MASK).motivo,
    'vazio e mascara recebem o mesmo motivo — a mensagem de erro nao pode orientar o usuario');
});

// ── Fechamento do ciclo: o que o GET emite, o PUT recusa ─────────────────────────────

test('[RN-05+RN-06] round-trip: o valor que o GET devolve nunca e regravavel', () => {
  // A regra que amarra as duas RNs. Se um dia a mascara mudar de forma so num dos lados, este
  // cenario cai antes de a senha de producao ser sobrescrita.
  const doGet = mascararValorConfig('email_smtp_pass', 'senha-de-producao');
  assert.strictEqual(podeGravarSegredo(doGet).ok, false,
    `o GET devolve ${JSON.stringify(doGet)} e o PUT aceitaria de volta`);
});

// ── Mensagem do 400 e fiacao das 3 rotas ─────────────────────────────────────────────

test('[RN-06] a mensagem do 400 esta congelada e DIZ O QUE FAZER', () => {
  // "Valor invalido" sozinho faria o admin tentar de novo — provavelmente reenviando a mascara.
  assert.strictEqual(configSecrets.MENSAGEM_SEGREDO_INVALIDO,
    'Valor inválido para senha: deixe o campo em branco para manter a senha atual');
  assert.ok(/em branco/.test(configSecrets.MENSAGEM_SEGREDO_INVALIDO),
    'a mensagem parou de dizer ao usuario o que fazer para manter a senha');
});

test('[fiacao] as 3 rotas do core consomem esta regua (checagem de TEXTO, nao de comportamento)', () => {
  // Nao ha harness de core (index.js tem 23 mil linhas, abre banco em disco e faz listen no
  // import), entao o gate HTTP fica declarado sem teste de comportamento. Esta checagem estatica
  // e o pouco que da: pega a fiacao sendo REMOVIDA — que foi como o defeito nasceu (a regua do
  // almoxarifado existia desde a Etapa 20 e o core simplesmente nao a chamava).
  const fonte = require('fs').readFileSync(require('path').join(__dirname, '../../index.js'), 'utf8');
  assert.ok(fonte.includes("require('./services/configSecrets')"),
    'server/index.js parou de importar services/configSecrets');
  // CONTAR OCORRENCIAS NAO BASTA, e a revisao adversarial provou: trocando
  // `mascararValorConfig(row.chave, valor)` por `mascararValorConfig('empresa_nome', valor)` nos
  // dois GETs, a contagem continuava >= 3 e o teste passava 23/23 — enquanto as rotas reais
  // devolviam a senha SMTP em claro (canario extraido pelos dois GETs com a suite verde).
  // A assercao passa a ser sobre a CHAMADA LITERAL: a chave mascarada tem de ser a da linha.
  const chamadasCertas = fonte.split('mascararValorConfig(row.chave, valor)').length - 1;
  assert.ok(chamadasCertas >= 2, // 1 em cada GET (plural e singular)
    `mascararValorConfig(row.chave, valor) aparece ${chamadasCertas}x em index.js — `
    + 'um dos dois GETs perdeu a mascara ou passou a mascarar outra chave');
  assert.ok(fonte.split('podeGravarSegredo').length - 1 >= 2,
    'o PUT /api/configuracoes/:chave perdeu a guarda do segredo');
  assert.ok(fonte.includes('MENSAGEM_SEGREDO_INVALIDO'),
    'o 400 parou de usar a mensagem congelada acima');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
