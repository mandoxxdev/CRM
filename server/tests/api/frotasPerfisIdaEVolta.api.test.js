/**
 * Frotas Etapa 2 — T2 (integracao): o perfil gravado pela tela chega ao pedido SEGUINTE do usuario pelo login REAL.
 *
 *   RN-F2.06  PUT do gestor (pela rota, com o stub) -> pedido da Ana pelo login real (criarAuthenticateToken + enrichUserFromDb ->
 *             finishFrotaProfile): /dashboard 403 -> 200 -> 403; portal recusa gravar como CONSULTA
 *   RN-F2.06  o mesmo entrando pelo SERVICO (definirPerfil direto no banco)
 *   RN-F2.02  para cada usuario da lista, o perfil_efetivo do GET == o `perfil` que o servidor aplica nele (GET /portal/inicio)
 *   RN-F8.07  (Etapa 8) Administrador de Frota dado pela tela (admin_modulos) chega ao pedido seguinte: /perfis-usuario 200 -> 403
 *
 * O stub de createFrotasTestApp poe o perfil pronto no header — nao prova que a linha gravada chega ao req.user. O `comLoginReal`
 * (frotasTestApp.js) monta o MESMO banco atras do login de verdade; por isso este arquivo existe (ponto de atencao 1 do plano).
 *
 * Plano: docs/superpowers/plans/2026-10-23-frotas-etapa2-perfis-pela-tela.md
 * Executar: cd server && node tests/api/frotasPerfisIdaEVolta.api.test.js
 */
const assert = require('assert');
const { createFrotasTestApp, comLoginReal, ADMIN } = require('../helpers/frotasTestApp');
const { dbRun, dbGet } = require('../../services/frotas/db');
const perfisService = require('../../services/frotas/perfisService');

let passed = 0; let failed = 0;
const testes = [];
function test(name, fn) { testes.push([name, fn]); }

let ctx; let login;
const S = {};
const ANA = 2; const BRUNO = 4;

async function cenario() {
  await dbRun(ctx.db, `INSERT INTO usuarios (id, nome, email, ativo, role, is_superadmin, admin_modulos, is_oculto) VALUES
    (6, 'Fabio AdminModulo', 'fabio@x.com', 1, 'usuario', 0, '["frota"]', 0),
    (8, 'Super', 'super@x.com', 1, 'usuario', 1, NULL, 0),
    (9, 'Gil AdminAlmox', 'gil@x.com', 1, 'usuario', 0, '["almoxarifado"]', 0),
    (10, 'Helena Sobra', 'helena@x.com', 1, 'usuario', 0, '[]', 0),
    (11, 'Iris RoleMaiuscula', 'iris@x.com', 1, 'Admin', 0, NULL, 0),
    (12, 'Joao Minusculo', 'joao@x.com', 1, 'usuario', 0, NULL, 0)`);
  await dbRun(ctx.db, "INSERT INTO perfil_frota_usuario (usuario_id, perfil) VALUES (3, 'CONSULTA'), (10, 'ADMIN_FROTA'), (12, 'consulta')");
  ctx.setUser(ADMIN);
  S.v = (await ctx.req('post', '/api/frotas/veiculos', { placa: 'IDA0001', km_atual: 100 })).body;
  const m = await ctx.req('post', '/api/frotas/motoristas', { nome: 'Ana Motorista', usuario_id: ANA });
  assert.strictEqual(m.status, 201, JSON.stringify(m.body));
  ctx.setUser(null);
  login = await comLoginReal(ctx);
}

const putPerfil = (id, perfil) => ctx.como(ADMIN)('put', `/api/frotas/perfis-usuario/${id}`, { perfil });

test('RN-F2.06 pela rota: Ana 403 -> PUT CONSULTA -> 200 no painel e nos relatorios, 403 no portal -> PUT null -> 403', async () => {
  const ana = login.como(ANA);
  const antes = await ana('get', '/api/frotas/dashboard');
  assert.strictEqual(antes.status, 403, `sem linha a Ana e MOTORISTA: ${JSON.stringify(antes.body)}`);
  assert.strictEqual(antes.body.perfil, 'MOTORISTA');

  const r = await putPerfil(ANA, 'CONSULTA');
  assert.strictEqual(r.status, 200, JSON.stringify(r.body));

  const depois = await ana('get', '/api/frotas/dashboard');
  assert.strictEqual(depois.status, 200, `o perfil gravado nao chegou ao req.user: ${JSON.stringify(depois.body)}`);
  assert.strictEqual((await ana('get', '/api/frotas/relatorios/custos-por-veiculo')).status, 200);
  const inicio = await ana('get', '/api/frotas/portal/inicio');
  assert.strictEqual(inicio.body.perfil, 'CONSULTA');
  assert.strictEqual(inicio.body.pode_registrar, false);
  const grava = await ana('post', '/api/frotas/portal/registros', { tipo: 'inspecao', veiculo_id: S.v.id, km: 150, itens: {} });
  assert.strictEqual(grava.status, 403);
  assert.strictEqual(grava.body.acao, 'registrar_operacoes');

  const volta = await putPerfil(ANA, null);
  assert.strictEqual(volta.status, 200);
  const fim = await ana('get', '/api/frotas/dashboard');
  assert.strictEqual(fim.status, 403, 'voltar ao padrao devolve o 403');
  assert.strictEqual((await ana('get', '/api/frotas/portal/inicio')).body.pode_registrar, true, 'e ela volta a registrar');
});

test('RN-F2.06 pelo servico: definirPerfil direto e o pedido seguinte do Bruno muda', async () => {
  const bruno = login.como(BRUNO);
  assert.strictEqual((await bruno('get', '/api/frotas/alertas')).status, 403);
  const r = await perfisService.definirPerfil(ctx.db, String(BRUNO), { perfil: 'CONSULTA' });
  assert.deepStrictEqual(r, { usuario_id: BRUNO, perfil_explicito: 'CONSULTA', perfil_efetivo: 'CONSULTA', origem: 'explicito' });
  assert.strictEqual((await bruno('get', '/api/frotas/alertas')).status, 200);
  await perfisService.definirPerfil(ctx.db, String(BRUNO), { perfil: 'MOTORISTA' });
  assert.strictEqual((await bruno('get', '/api/frotas/alertas')).status, 403, 'MOTORISTA explicito tira o painel de novo');
  await perfisService.definirPerfil(ctx.db, String(BRUNO), { perfil: null });
});

test('RN-F2.02 a tela e o servidor concordam: perfil_efetivo do GET == perfil aplicado no pedido real, usuario a usuario', async () => {
  const lista = (await ctx.como(ADMIN)('get', '/api/frotas/perfis-usuario')).body.usuarios;
  assert.ok(lista.length >= 9, `lista curta demais: ${lista.length}`);
  const origens = new Set(lista.map((u) => u.origem));
  // Etapa 8 (RN-F8.01, ajuste 15): o admin do modulo (6) deixou de ser `forcado` e virou `admin_modulo`
  assert.deepStrictEqual([...origens].sort(), ['admin_modulo', 'explicito', 'forcado', 'padrao'], 'o cenario cobre as quatro origens');
  for (const u of lista) {
    const r = await login.como(u.id)('get', '/api/frotas/portal/inicio');
    assert.strictEqual(r.status, 200, `${u.nome}: ${JSON.stringify(r.body)}`);
    assert.strictEqual(r.body.perfil, u.perfil_efetivo, `${u.nome} (${u.origem}): tela diz ${u.perfil_efetivo}, servidor aplica ${r.body.perfil}`);
  }
});

// ── Etapa 8 (RN-F8.07): Administrador de Frota dado pela tela chega ao pedido seguinte pelo login real ──
test('RN-F8.07 pela rota: PUT ADMIN_FROTA na Ana -> ela abre /perfis-usuario e /dashboard; CONSULTA -> so o painel; null -> nada', async () => {
  const ana = login.como(ANA);
  const antes = await ana('get', '/api/frotas/perfis-usuario');
  assert.strictEqual(antes.status, 403, `sem nada a Ana e MOTORISTA: ${JSON.stringify(antes.body)}`);

  const r = await putPerfil(ANA, 'ADMIN_FROTA');
  assert.strictEqual(r.status, 200, JSON.stringify(r.body));
  assert.deepStrictEqual(r.body, { usuario_id: ANA, perfil_explicito: 'ADMIN_FROTA', perfil_efetivo: 'ADMIN_FROTA', origem: 'admin_modulo' });
  const perfis = await ana('get', '/api/frotas/perfis-usuario');
  assert.strictEqual(perfis.status, 200, `o admin_modulos gravado nao chegou ao req.user (finishFrotaProfile): ${JSON.stringify(perfis.body)}`);
  assert.strictEqual((await ana('get', '/api/frotas/dashboard')).status, 200);
  assert.strictEqual((await ana('get', '/api/frotas/portal/inicio')).body.perfil, 'ADMIN_FROTA');
  // A fonte e admin_modulos, nao a linha espelho: a linha sozinha ja daria ADMIN_FROTA pelo enrich (RN-F2.07, "linha sobrando") e
  // mascararia uma gravacao errada da coluna (sabotagem 'frotas' passava aqui). Sem a linha, a Ana tem de continuar administradora.
  const col = await dbGet(ctx.db, 'SELECT admin_modulos FROM usuarios WHERE id = ?', [ANA]);
  assert.strictEqual(col.admin_modulos, '["frota"]');
  await dbRun(ctx.db, 'DELETE FROM perfil_frota_usuario WHERE usuario_id = ?', [ANA]);
  const semEspelho = await ana('get', '/api/frotas/perfis-usuario');
  assert.strictEqual(semEspelho.status, 200, `sem a linha espelho o admin_modulos sozinho nao sustentou: ${JSON.stringify(semEspelho.body)}`);
  await dbRun(ctx.db, "INSERT INTO perfil_frota_usuario (usuario_id, perfil) VALUES (?, 'ADMIN_FROTA')", [ANA]);

  const consulta = await putPerfil(ANA, 'CONSULTA');
  assert.strictEqual(consulta.status, 200, JSON.stringify(consulta.body));
  assert.deepStrictEqual(consulta.body, { usuario_id: ANA, perfil_explicito: 'CONSULTA', perfil_efetivo: 'CONSULTA', origem: 'explicito' });
  const semConfigurar = await ana('get', '/api/frotas/perfis-usuario');
  assert.strictEqual(semConfigurar.status, 403, `tirar o administrador nao chegou ao pedido seguinte: ${JSON.stringify(semConfigurar.body)}`);
  assert.strictEqual(semConfigurar.body.acao, 'configurar');
  assert.strictEqual((await ana('get', '/api/frotas/dashboard')).status, 200, 'Consulta ve o painel');

  const volta = await putPerfil(ANA, null);
  assert.strictEqual(volta.status, 200);
  assert.strictEqual((await ana('get', '/api/frotas/dashboard')).status, 403, 'voltar ao padrao devolve o 403');
  assert.strictEqual((await ana('get', '/api/frotas/portal/inicio')).body.perfil, 'MOTORISTA');
});

(async () => {
  ctx = await createFrotasTestApp();
  await cenario();
  console.log('\nFrotas Etapa 2 — T2 (ida e volta pelo login real)\n');
  for (const [name, fn] of testes) {
    try { await fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { failed++; console.error(`  ✗ ${name}: ${e.message}`); }
  }
  console.log(`\nResultado: ${passed} passou, ${failed} falhou\n`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
