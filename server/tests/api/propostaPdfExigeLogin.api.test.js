/**
 * Etapa 79 / T1 — o PDF e o preview da proposta exigem login (A5 de docs/compras-novidades-por-etapa.md).
 *
 * O buraco: `GET /api/propostas/:id/premium` (HTML completo da proposta: cliente, itens, precos,
 * condicoes) e `GET /api/propostas/:id/pdf` (o mesmo em PDF) eram registradas SEM
 * `authenticateToken`, com o comentario "rota liberada sem autenticacao para permitir abertura
 * direta via link/PDF" (commit bd836d2d). Os ids sao sequenciais: quem tinha a URL do servidor
 * baixava TODAS as propostas trocando o numero. Nenhum chamador usa link cru — os 7 pontos do
 * client passam por `api.get` (Bearer pelo interceptor) — entao o gate entra sem perda de uso.
 *
 * Teste de TEXTO, nao de comportamento: `server/index.js` tem 23 mil linhas, abre banco em disco e
 * faz `listen` no import; nao ha harness de core (mesmo precedente de backupExposicao.api.test.js).
 * O 401 real foi provado com o servidor de pe (plano da Etapa 79, linha "> Estado").
 *
 * Regua de regressao: a lista de registros `app.<verbo>('/api...'` do index.js SEM
 * `authenticateToken` na mesma linha tem de ser EXATAMENTE as 7 legitimas. Uma rota nova aberta
 * por engano derruba o teste — se for aberta de proposito, acrescente-a em LEGITIMAS com o motivo.
 *
 * FORA do escopo desta regua (cada um tem gate proprio, ou nao e rota de dado):
 *   - montagens `app.use` (estaticos de /api/uploads/*, /api/assets, rate limit);
 *   - `routes/*.js` — cada modulo tem o proprio gate (app.use do almoxarifado com
 *     checkModulePermission, frotaAuth, prodAuth, guard);
 *   - `whatsappGateway`, que autentica por segredo proprio.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

let passed = 0; let failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { failed++; console.error(`  ✗ ${name}: ${e.message}`); }
}

const fonte = fs.readFileSync(path.join(__dirname, '../../index.js'), 'utf8');
const linhas = fonte.split('\n');

// ── RN-79.01: as duas rotas da proposta passam pelo authenticateToken ─────────────────

for (const sufixo of ['premium', 'pdf']) {
  test(`GET /api/propostas/:id/${sufixo} e registrada com authenticateToken`, () => {
    const alvo = `app.get('/api/propostas/:id/${sufixo}'`;
    const registros = linhas.filter((l) => l.trim().startsWith(alvo));
    assert.strictEqual(registros.length, 1,
      `esperava 1 registro de ${alvo}, achei ${registros.length}`);
    assert.ok(registros[0].includes(`${alvo}, authenticateToken,`),
      `a rota voltou a ser aberta: ${registros[0].trim()}`);
  });
}

// ── Regua: rotas /api do index.js sem authenticateToken ───────────────────────────────

const LEGITIMAS = [
  'GET /api',                 // indice da API, sem dado
  'GET /api/health',          // healthcheck (registrada 2x no index.js)
  'GET /api/health',
  'POST /api/auth/login',     // e o proprio login
  'GET /api/backup',          // token proprio (validarTokenBackup, Etapa 21)
  'GET /api/deploy-version',  // versao do deploy, sem dado
  'GET /api/app-version',     // versao do app, sem dado (indentada dentro de um if)
].sort();

test('a regua acha registros (controle contra regex que nao casa nada)', () => {
  const total = linhas.filter((l) => /^\s*app\.(get|post|put|patch|delete)\(['"`]\/api/.test(l)).length;
  assert.ok(total > 100, `so ${total} registros /api casaram — a regex quebrou`);
});

test('as unicas rotas /api do index.js sem authenticateToken sao as 7 legitimas', () => {
  const re = /^\s*app\.(get|post|put|patch|delete)\(\s*['"`](\/api[^'"`]*)['"`]/;
  const abertas = [];
  linhas.forEach((l) => {
    const m = l.match(re);
    if (m && !l.includes('authenticateToken')) abertas.push(`${m[1].toUpperCase()} ${m[2]}`);
  });
  abertas.sort();
  const sobrando = abertas.filter((r, i) => abertas.indexOf(r) === i
    && abertas.filter((x) => x === r).length > LEGITIMAS.filter((x) => x === r).length);
  const faltando = LEGITIMAS.filter((r, i) => LEGITIMAS.indexOf(r) === i
    && LEGITIMAS.filter((x) => x === r).length > abertas.filter((x) => x === r).length);
  assert.deepStrictEqual(abertas, LEGITIMAS,
    `rotas /api abertas divergem da lista legitima.\n      novas abertas: ${JSON.stringify(sobrando)}`
    + `\n      legitimas que sumiram: ${JSON.stringify(faltando)}`);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
