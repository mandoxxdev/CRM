/**
 * Etapa 21 / Task 1 — exposicao no core: o que entra no zip de backup e quem pode baixa-lo.
 *
 * Teste de SERVICO, nao de rota — mora em tests/api/ porque o runner (tests/api/run-all.js)
 * so descobre `*.api.test.js`. Mesmo precedente de `dbRecoveryBackup.api.test.js:1-6`.
 *
 * Por que so funcao pura: `server/index.js` tem 23 mil linhas, abre banco em disco e faz
 * `listen` no import — nao ha harness de core (tests/helpers/testApp.js monta so o
 * almoxarifado). O gate HTTP fica declarado sem teste automatizado; a regua e testada aqui.
 *
 * O que esta coberto:
 *   RN-01/RN-08 — `deveIncluirNoBackup` tira `.runtime-secrets.json` (quem baixa o zip forja
 *   token de superadmin: index.js:318 assina com esse segredo) e tudo sob `backups/`, mas
 *   NAO tira `database.sqlite` — backup que exclui demais deixa de ser backup. E
 *   `backupMaisRecente` devolve a copia que `dbRecovery.js:86` manda restaurar, para o zip
 *   continuar tendo fallback no cenario "database.sqlite corrompido".
 *   RN-02 — `validarTokenBackup` compara em tempo constante, aceita query string com aviso de
 *   depreciacao (o comentario da propria rota documenta `?token=`) e AVISA em token curto em
 *   vez de recusar (nao ha .env no repositorio; recusar token curto porem correto quebraria o
 *   backup de producao).
 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { deveIncluirNoBackup, backupMaisRecente, EXCLUIDOS } = require('../../services/backupPackage');
const { validarTokenBackup } = require('../../services/backupAuth');

let passed = 0; let failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { failed++; console.error(`  ✗ ${name}: ${e.message}`); }
}

const tmpDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'bkpexp-'));

// ── RN-01: o que NAO pode entrar no zip ──────────────────────────────────────────────

test('.runtime-secrets.json fica de fora (jwtSecret em claro = forjar superadmin)', () => {
  assert.strictEqual(deveIncluirNoBackup('.runtime-secrets.json'), false);
});

test('o diretorio backups/ fica de fora', () => {
  assert.strictEqual(deveIncluirNoBackup('backups'), false);
});

test('arquivo DENTRO de backups/ fica de fora (o glob desce apesar da entrada recusada)', () => {
  assert.strictEqual(deveIncluirNoBackup('backups/database-2026-08-25T10-00-00.sqlite'), false);
  assert.strictEqual(deveIncluirNoBackup('backups/database-2026-08-25T10-00-00.sqlite-wal'), false);
});

test('primeiro segmento e o que decide: backups/sub/x.sqlite tambem fica de fora', () => {
  assert.strictEqual(deveIncluirNoBackup('backups/sub/x.sqlite'), false);
});

test('caminho com separador do Windows tambem e recusado', () => {
  assert.strictEqual(deveIncluirNoBackup('backups\\database-x.sqlite'), false);
});

// ── RN-01 (lado positivo): o que TEM de continuar entrando ───────────────────────────

test('database.sqlite entra (senao o backup deixa de ser backup)', () => {
  assert.strictEqual(deveIncluirNoBackup('database.sqlite'), true);
});

test('acompanhantes do banco entram', () => {
  assert.strictEqual(deveIncluirNoBackup('database.sqlite-wal'), true);
  assert.strictEqual(deveIncluirNoBackup('database.sqlite-shm'), true);
});

test('uploads/ entra, inclusive em subpasta', () => {
  assert.strictEqual(deveIncluirNoBackup('uploads'), true);
  assert.strictEqual(deveIncluirNoBackup('uploads/almoxarifado/x.png'), true);
});

test('variaveis-base.json entra', () => {
  assert.strictEqual(deveIncluirNoBackup('variaveis-base.json'), true);
});

test('pasta que apenas COMECA com o nome excluido continua entrando', () => {
  assert.strictEqual(deveIncluirNoBackup('backups-antigos/x.sqlite'), true);
});

test('EXCLUIDOS documenta exatamente os dois itens da RN-01', () => {
  assert.deepStrictEqual([...EXCLUIDOS].sort(), ['.runtime-secrets.json', 'backups']);
});

// ── RN-08: o fallback de recuperacao continua no zip ─────────────────────────────────

test('backupMaisRecente devolve null quando nao ha diretorio backups/', () => {
  assert.strictEqual(backupMaisRecente(tmpDir()), null);
});

test('backupMaisRecente devolve null quando backups/ esta vazio', () => {
  const dir = tmpDir();
  fs.mkdirSync(path.join(dir, 'backups'));
  assert.strictEqual(backupMaisRecente(dir), null);
});

test('backupMaisRecente devolve a copia MAIS NOVA (por mtime)', () => {
  const dir = tmpDir();
  const bdir = path.join(dir, 'backups');
  fs.mkdirSync(bdir);
  fs.writeFileSync(path.join(bdir, 'database-2026-01-01T00-00-00.sqlite'), 'velho');
  fs.writeFileSync(path.join(bdir, 'database-2026-08-25T10-00-00.sqlite'), 'novo');
  const agora = Date.now();
  fs.utimesSync(path.join(bdir, 'database-2026-01-01T00-00-00.sqlite'), agora / 1000 - 9999, agora / 1000 - 9999);
  fs.utimesSync(path.join(bdir, 'database-2026-08-25T10-00-00.sqlite'), agora / 1000, agora / 1000);
  assert.strictEqual(backupMaisRecente(dir), 'database-2026-08-25T10-00-00.sqlite');
});

test('backupMaisRecente ignora acompanhantes soltos (-wal/-shm nao restauram sozinhos)', () => {
  const dir = tmpDir();
  const bdir = path.join(dir, 'backups');
  fs.mkdirSync(bdir);
  fs.writeFileSync(path.join(bdir, 'database-2026-01-01T00-00-00.sqlite'), 'db');
  fs.writeFileSync(path.join(bdir, 'database-2026-08-25T10-00-00.sqlite-wal'), 'orfao mais novo');
  const agora = Date.now();
  fs.utimesSync(path.join(bdir, 'database-2026-01-01T00-00-00.sqlite'), agora / 1000 - 9999, agora / 1000 - 9999);
  assert.strictEqual(backupMaisRecente(dir), 'database-2026-01-01T00-00-00.sqlite');
});

// ── RN-02: gate do token ─────────────────────────────────────────────────────────────

const TOKEN_OK = 'a'.repeat(40);

test('header Authorization: Bearer com o token certo passa', () => {
  const r = validarTokenBackup({ authorization: `Bearer ${TOKEN_OK}` }, TOKEN_OK);
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.motivo, null);
  assert.deepStrictEqual(r.avisos, []);
});

test('sem token configurado no ambiente recusa (fail-closed, comportamento de hoje)', () => {
  assert.deepStrictEqual(
    validarTokenBackup({ authorization: `Bearer ${TOKEN_OK}` }, undefined).motivo,
    'SEM_TOKEN_CONFIGURADO'
  );
  assert.strictEqual(validarTokenBackup({ authorization: `Bearer x` }, '').motivo, 'SEM_TOKEN_CONFIGURADO');
  assert.strictEqual(validarTokenBackup({ authorization: `Bearer x` }, '').ok, false);
});

test('objeto sem authorization e sem queryToken -> AUSENTE', () => {
  const r = validarTokenBackup({}, TOKEN_OK);
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.motivo, 'AUSENTE');
});

test('token errado de MESMO tamanho -> INVALIDO (prova o timingSafeEqual)', () => {
  const errado = 'b'.repeat(40);
  assert.strictEqual(errado.length, TOKEN_OK.length);
  const r = validarTokenBackup({ authorization: `Bearer ${errado}` }, TOKEN_OK);
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.motivo, 'INVALIDO');
});

test('token errado de tamanho DIFERENTE -> INVALIDO sem lancar', () => {
  const r = validarTokenBackup({ authorization: 'Bearer curtinho' }, TOKEN_OK);
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.motivo, 'INVALIDO');
});

test('query string CONTINUA aceita, com aviso de depreciacao', () => {
  const r = validarTokenBackup({ queryToken: TOKEN_OK }, TOKEN_OK);
  assert.strictEqual(r.ok, true, 'query string nao pode ser recusada: quebraria cron de producao');
  assert.ok(r.avisos.includes('QUERY_DEPRECIADA'), `avisos=${JSON.stringify(r.avisos)}`);
});

test('token esperado curto AVISA e deixa passar (nao ha .env aqui para saber o tamanho real)', () => {
  const curto = 'abc123';
  const r = validarTokenBackup({ authorization: `Bearer ${curto}` }, curto);
  assert.strictEqual(r.ok, true, 'token curto porem CORRETO nao pode ser recusado');
  assert.ok(r.avisos.includes('CURTO'), `avisos=${JSON.stringify(r.avisos)}`);
});

test('token curto E por query string acumula os dois avisos', () => {
  const curto = 'abc123';
  const r = validarTokenBackup({ queryToken: curto }, curto);
  assert.strictEqual(r.ok, true);
  assert.ok(r.avisos.includes('CURTO'), `avisos=${JSON.stringify(r.avisos)}`);
  assert.ok(r.avisos.includes('QUERY_DEPRECIADA'), `avisos=${JSON.stringify(r.avisos)}`);
});

test('header vence a query string quando os dois vem', () => {
  const r = validarTokenBackup({ authorization: `Bearer ${TOKEN_OK}`, queryToken: 'lixo' }, TOKEN_OK);
  assert.strictEqual(r.ok, true);
  assert.ok(!r.avisos.includes('QUERY_DEPRECIADA'), 'nao usou a query, nao deve avisar sobre ela');
});

test('Bearer vazio nao e tratado como token', () => {
  const r = validarTokenBackup({ authorization: 'Bearer ' }, TOKEN_OK);
  assert.strictEqual(r.motivo, 'AUSENTE');
});

// ── Fiacao em index.js ───────────────────────────────────────────────────────────────
// ESTE ARQUIVO NASCEU SEM ESTE CENARIO, e a revisao adversarial mostrou o custo: apagando o
// TERCEIRO argumento de archive.directory em index.js — uma linha, servico intacto — a suite
// ficava 25/25 VERDE e o zip real voltava a entregar `.runtime-secrets.json` com o jwtSecret,
// que e escalada de privilegio (quem baixa forja token de superadmin). A regra pura sozinha nao
// protege nada se ninguem a chamar. Nao ha harness de core, entao a checagem e de TEXTO — e por
// isso mesmo e sobre a CHAMADA LITERAL, nao sobre contagem de identificador (a contagem passa
// com a fiacao presente-porem-errada; ver configSecretsCore.api.test.js).
test('[fiacao] a rota de backup consome esta regua (checagem de TEXTO, nao de comportamento)', () => {
  const fonte = require('fs').readFileSync(require('path').join(__dirname, '../../index.js'), 'utf8');
  assert.ok(fonte.includes("require('./services/backupPackage')"),
    'server/index.js parou de importar services/backupPackage');
  assert.ok(fonte.includes("require('./services/backupAuth')"),
    'server/index.js parou de importar services/backupAuth');
  assert.ok(fonte.includes('archive.directory(backupDir, false, '),
    'archive.directory perdeu o 3o argumento — o zip volta a levar o diretorio INTEIRO, '
    + 'incluindo .runtime-secrets.json com o jwtSecret');
  assert.ok(fonte.includes('deveIncluirNoBackup(entry.name)'),
    'o filtro do zip parou de consultar deveIncluirNoBackup');
  assert.ok(fonte.includes('backupMaisRecente('),
    'a rota parou de somar a copia de backup mais recente — RN-08, o fallback de recuperacao');
  assert.ok(fonte.includes('validarTokenBackup('),
    'o gate do backup parou de usar a comparacao em tempo constante');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
