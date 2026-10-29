/**
 * Frota C22 — o painel diz o perfil de quem pediu, para a tela renovar o menu quando ele mudou.
 *
 * Quem deixava de ser Administrador de Frota (Perfis de acesso) continuava vendo o menu de administrador ate recarregar: o servidor
 * ja recusava, mas o painel respondia normalmente e nada mandava a tela renovar o usuario. O portal resolve isso para si com o
 * `perfil` do /portal/inicio; agora o GET /dashboard tambem leva `perfil` (getPerfilFromUser, a mesma regua do portal).
 *
 * O painel tem cache UNICO no servidor (um para todos os perfis). O `perfil` e calculado POR PEDIDO e nunca entra no cache — senao
 * o primeiro a aquecer o cache emprestaria o perfil dele a todos os outros por 30 s.
 *
 * Executar: cd server && node tests/api/frotasDashboardPerfil.api.test.js
 */
const assert = require('assert');
const { createFrotasTestApp, comLoginReal, ADMIN, CONSULTA } = require('../helpers/frotasTestApp');

let passed = 0; let failed = 0;
const testes = [];
function test(name, fn) { testes.push([name, fn]); }

let ctx; let login;
const ANA = 2;
const URL = '/api/frotas/dashboard';

test('C22 o painel leva o perfil de quem pediu (ADMIN_FROTA e CONSULTA)', async () => {
  ctx.limparCacheDashboard();
  const a = await ctx.como(ADMIN)('get', URL);
  assert.strictEqual(a.status, 200, JSON.stringify(a.body));
  assert.strictEqual(a.body.perfil, 'ADMIN_FROTA');
  ctx.limparCacheDashboard();
  const c = await ctx.como(CONSULTA)('get', URL);
  assert.strictEqual(c.status, 200, JSON.stringify(c.body));
  assert.strictEqual(c.body.perfil, 'CONSULTA');
});

test('C22 cache quente: dois usuarios de perfis diferentes recebem cada um o seu perfil (o perfil nao entra no cache)', async () => {
  ctx.limparCacheDashboard();
  const a = await ctx.como(ADMIN)('get', URL); // aquece o cache como ADMIN_FROTA
  assert.strictEqual(a.body.perfil, 'ADMIN_FROTA');
  const c = await ctx.como(CONSULTA)('get', URL); // le do cache quente
  assert.strictEqual(c.status, 200);
  assert.strictEqual(c.body.perfil, 'CONSULTA', 'o perfil do primeiro vazou pelo cache');
  const a2 = await ctx.como(ADMIN)('get', URL);
  assert.strictEqual(a2.body.perfil, 'ADMIN_FROTA', 'o perfil do segundo vazou pelo cache');
  // e o resto do corpo e o mesmo (prova de que o segundo e o terceiro vieram do cache, nao de outra contagem)
  const semPerfil = ({ perfil, ...resto }) => resto;
  assert.deepStrictEqual(semPerfil(c.body), semPerfil(a.body));
});

test('C22 pedidos simultaneos com cache frio (mesma contagem em andamento): cada um com o seu perfil', async () => {
  ctx.limparCacheDashboard();
  const [a, c] = await Promise.all([ctx.como(ADMIN)('get', URL), ctx.como(CONSULTA)('get', URL)]);
  assert.strictEqual(a.body.perfil, 'ADMIN_FROTA');
  assert.strictEqual(c.body.perfil, 'CONSULTA');
  const d = await ctx.como(CONSULTA)('get', URL);
  assert.strictEqual(d.body.perfil, 'CONSULTA');
});

test('C22 login real: a Ana vira ADMIN_FROTA pela tela, depois CONSULTA — o painel (cache quente) acompanha no pedido seguinte', async () => {
  const ana = login.como(ANA);
  let r = await ctx.como(ADMIN)('put', `/api/frotas/perfis-usuario/${ANA}`, { perfil: 'ADMIN_FROTA' });
  assert.strictEqual(r.status, 200, JSON.stringify(r.body));
  ctx.limparCacheDashboard();
  const antes = await ana('get', URL);
  assert.strictEqual(antes.status, 200, JSON.stringify(antes.body));
  assert.strictEqual(antes.body.perfil, 'ADMIN_FROTA');

  r = await ctx.como(ADMIN)('put', `/api/frotas/perfis-usuario/${ANA}`, { perfil: 'CONSULTA' });
  assert.strictEqual(r.status, 200, JSON.stringify(r.body));
  const depois = await ana('get', URL); // o cache ainda e o aquecido como ADMIN_FROTA
  assert.strictEqual(depois.status, 200, JSON.stringify(depois.body));
  assert.strictEqual(depois.body.perfil, 'CONSULTA');
});

(async () => {
  ctx = await createFrotasTestApp();
  login = await comLoginReal(ctx);
  console.log('\nFrota C22 — perfil no painel\n');
  for (const [name, fn] of testes) {
    try { await fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { failed++; console.error(`  ✗ ${name}: ${e.message}`); }
  }
  console.log(`\nResultado: ${passed} passou, ${failed} falhou\n`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
