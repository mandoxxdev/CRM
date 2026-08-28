/**
 * Etapa 21 / Task 3 — RN-04: precedencia do SMTP no CORE e a queda do `from` para o `user`.
 *
 * Teste de SERVICO, nao de rota — mora em tests/api/ porque o runner (tests/api/run-all.js) so
 * descobre `*.api.test.js`. Mesmo precedente de `dbRecoveryBackup.api.test.js:1-6`,
 * `backupExposicao.api.test.js` (Task 1) e `configSecretsCore.api.test.js` (Task 2).
 *
 * Por que so funcao pura: `server/index.js` tem 23 mil linhas, abre banco em disco e faz
 * `listen` no import — nao ha harness de core. `getEmailConfig` em si fica DECLARADA sem teste
 * de comportamento; a regua que ela consome e testada aqui.
 *
 * O DEFEITO (medido na Fase 0 da Etapa 21): `getEmailConfig` devolvia os quatro campos
 * HARDCODED, sem olhar para o ambiente. A senha literal esta no git desde 2026-03-17 — trocar o
 * arquivo NAO a remove de clone nenhum, so a rotacao na Locaweb resolve (declarado na letra B).
 * O que da para fazer aqui e parar de depender dela como fonte PRIMARIA: com `SMTP_PASS` no
 * ambiente, a do codigo nunca e usada.
 *
 * O QUE ESTE ARQUIVO PROVA:
 *   RN-04 precedencia — env vence o hardcoded nos quatro campos, campo a campo (env parcial
 *   nao arrasta os outros tres junto).
 *   RN-04 `from` — cai para o `user` quando o configurado nao e um endereco UNICO. O valor que
 *   esta no banco hoje e uma lista de DOIS enderecos separados por virgula, e um `from` com dois
 *   enderecos e RECUSADO pelo servidor SMTP: o e-mail simplesmente para de sair.
 *   RN-04 banco FORA — a assinatura tem exatamente 2 parametros `(env, padroes)`. Se alguem
 *   acrescentar leitura de banco, a assinatura muda e este arquivo cai. E deliberado: os campos
 *   `email_smtp_host`/`email_smtp_pass` do banco ESTAO preenchidos hoje, e o host de la
 *   (`smtplw.com.br`) e outro produto da Locaweb, com outro esquema de credencial, diferente do
 *   `smtp.locaweb.com.br` que esta funcionando. Adotar o banco nao seria salvaguarda, seria um
 *   interruptor que trocaria o host de producao sem ninguem pedir (achado A1 da revisao).
 */
const assert = require('assert');

const emailConfig = require('../../services/emailConfig');
const { resolverEmailConfig } = emailConfig;

let passed = 0; let failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { failed++; console.error(`  ✗ ${name}: ${e.message}`); }
}

// Padroes de mentira, NAO os de producao: o teste tem de provar a REGUA, nao decorar a senha
// real. Se alguem trocar o hardcoded do index.js, este arquivo continua valendo.
const PADROES = {
  host: 'smtp.padrao.example',
  user: 'padrao@example.com',
  pass: 'senha-padrao',
  from: 'padrao@example.com',
};

console.log('\n[RN-04] precedencia env -> hardcoded');

test('env completa vence o hardcoded nos QUATRO campos', () => {
  const cfg = resolverEmailConfig({
    SMTP_HOST: 'smtp.env.example',
    SMTP_USER: 'env@example.com',
    SMTP_PASS: 'senha-do-ambiente',
    SMTP_FROM: 'remetente-env@example.com',
  }, PADROES);
  assert.strictEqual(cfg.host, 'smtp.env.example', 'host ignorou a env');
  assert.strictEqual(cfg.user, 'env@example.com', 'user ignorou a env');
  assert.strictEqual(cfg.pass, 'senha-do-ambiente',
    'pass ignorou a env — e o ponto da etapa: com SMTP_PASS definida, a senha do codigo nao e usada');
  assert.strictEqual(cfg.from, 'remetente-env@example.com', 'from ignorou a env');
});

test('env ausente cai no hardcoded nos QUATRO campos', () => {
  const cfg = resolverEmailConfig({}, PADROES);
  assert.strictEqual(cfg.host, PADROES.host);
  assert.strictEqual(cfg.user, PADROES.user);
  assert.strictEqual(cfg.pass, PADROES.pass,
    'sem SMTP_PASS o hardcoded TEM de continuar valendo — remove-lo derrubaria o envio na VPS, '
    + 'que pode nao ter .env (decisao registrada no design)');
  assert.strictEqual(cfg.from, PADROES.from);
});

test('env PARCIAL: so SMTP_USER definido -> user da env, os outros TRES do hardcoded', () => {
  // A precedencia e campo a campo. Um `if (env.SMTP_HOST) return {...env}` faria a presenca de
  // uma variavel arrastar as outras tres para undefined e derrubar o envio inteiro.
  const cfg = resolverEmailConfig({ SMTP_USER: 'so-o-user@example.com' }, PADROES);
  assert.strictEqual(cfg.user, 'so-o-user@example.com', 'user deveria vir da env');
  assert.strictEqual(cfg.host, PADROES.host, 'host deveria ter ficado no hardcoded');
  assert.strictEqual(cfg.pass, PADROES.pass, 'pass deveria ter ficado no hardcoded');
});

console.log('\n[RN-04] `from` cai para `user` quando nao e endereco unico');

test('from com DOIS enderecos -> devolve o `user`, NAO a lista', () => {
  // Forma real do valor que esta no banco hoje. Um `from` com dois enderecos e recusado pelo
  // servidor SMTP — adotar a lista faria o e-mail parar de sair, em silencio.
  const cfg = resolverEmailConfig({
    SMTP_USER: 'caixa@example.com',
    SMTP_FROM: 'a@x.com, b@x.com',
  }, PADROES);
  assert.strictEqual(cfg.from, 'caixa@example.com',
    `from deveria ter caido para o user, veio '${cfg.from}'`);
  assert.ok(!String(cfg.from).includes(','), 'from NAO pode conter virgula');
});

test('from com dois enderecos separados por PONTO-E-VIRGULA -> tambem cai para o `user`', () => {
  const cfg = resolverEmailConfig({
    SMTP_USER: 'caixa@example.com',
    SMTP_FROM: 'a@x.com; b@x.com',
  }, PADROES);
  assert.strictEqual(cfg.from, 'caixa@example.com');
});

test('from com UM endereco valido -> devolve ele mesmo', () => {
  // A regua nao pode ser "sempre usa o user": o remetente configurado e legitimo quando e unico.
  const cfg = resolverEmailConfig({
    SMTP_USER: 'caixa@example.com',
    SMTP_FROM: 'remetente@example.com',
  }, PADROES);
  assert.strictEqual(cfg.from, 'remetente@example.com');
});

test('from VAZIO ou AUSENTE -> devolve o `user`', () => {
  const semFrom = resolverEmailConfig(
    { SMTP_USER: 'caixa@example.com' },
    { ...PADROES, from: undefined },
  );
  assert.strictEqual(semFrom.from, 'caixa@example.com', 'from ausente deveria cair para o user');

  const vazio = resolverEmailConfig(
    { SMTP_USER: 'caixa@example.com', SMTP_FROM: '   ' },
    PADROES,
  );
  assert.strictEqual(vazio.from, 'caixa@example.com', 'from so-espacos deveria cair para o user');
});

console.log('\n[RN-04] o BANCO fica fora da precedencia');

test('assinatura travada em 2 parametros (env, padroes) — o banco NAO participa', () => {
  // RN-04 TRAVADA. Esta assercao existe para cair se alguem acrescentar um terceiro argumento
  // (uma conexao, uma linha de `configuracoes`) para "usar o banco quando estiver preenchido".
  // Aquilo nao seria salvaguarda: os dois campos da condicao ESTAO preenchidos hoje, entao o
  // banco venceria e trocaria o host de producao de `smtp.locaweb.com.br` (que funciona) para
  // `smtplw.com.br`, outro produto com outro esquema de credencial — e o `from` viraria a lista
  // de dois destinatarios. Adotar o banco exige envio real verificado contra aquele host,
  // impossivel daqui; esta declarado na letra B.
  assert.strictEqual(resolverEmailConfig.length, 2,
    `resolverEmailConfig deveria receber exatamente (env, padroes), recebe ${resolverEmailConfig.length} parametros`);
  assert.deepStrictEqual(Object.keys(emailConfig).sort(), ['resolverEmailConfig'],
    'o modulo passou a exportar outra coisa — se for um leitor de banco, a RN-04 caiu');

  // A ARIDADE SOZINHA NAO SEGURA A RN-04, e a revisao adversarial provou: reintroduzindo a
  // leitura de banco DENTRO da funcao — sem mexer na assinatura nem nas exports, com a leitura
  // valendo so quando ha conexao aberta (em teste unitario nao ha) — este arquivo ficava 9/9
  // VERDE e, em producao, o host voltava a ser `smtplw.com.br`. Ou seja: a assercao acima
  // registra a decisao, nao a impede. Quem impede e a de baixo, sobre o FONTE do modulo: o
  // caminho realista de "usar o banco" precisa de um require de banco ou de um SELECT, e
  // nenhum dos dois cabe num resolvedor de precedencia que recebe tudo por parametro.
  const fonteModulo = require('fs')
    .readFileSync(require('path').join(__dirname, '../../services/emailConfig.js'), 'utf8');
  const semComentarios = fonteModulo
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
  for (const proibido of ['sqlite3', 'require(', 'SELECT', 'configuracoes', 'db.']) {
    assert.ok(!semComentarios.includes(proibido),
      `services/emailConfig.js passou a conter "${proibido}" fora de comentario — `
      + 'a RN-04 manda o banco ficar FORA da precedencia, e um resolvedor puro nao precisa disso');
  }
});

test('[fiacao] getEmailConfig do core consome esta regua (checagem de TEXTO)', () => {
  // Nao ha harness de core, entao o consumo fica declarado sem teste de comportamento. Esta
  // checagem estatica e o pouco que da: pega a fiacao sendo REMOVIDA.
  const fonte = require('fs').readFileSync(require('path').join(__dirname, '../../index.js'), 'utf8');
  assert.ok(fonte.includes("require('./services/emailConfig')"),
    'server/index.js parou de importar services/emailConfig');
  assert.ok(fonte.includes('resolverEmailConfig'),
    'getEmailConfig parou de chamar resolverEmailConfig — a precedencia voltou a ser inline');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
