/**
 * Frotas Etapa 8 — G1: Administrador de Frota pela tela Perfis de acesso (PUT /api/frotas/perfis-usuario com ADMIN_FROTA).
 *
 *   RN-F8.01  classificarPerfilFrota distingue `forcado` (superadmin, role admin em qualquer caixa) de `admin_modulo` (so
 *             admin_modulos com frota); nos dois o efetivo e ADMIN_FROTA. O perfil_explicito do admin_modulo e CALCULADO
 *             (ajuste 20): sem a linha espelho o GET ainda diz ADMIN_FROTA
 *   RN-F8.02  PUT ADMIN_FROTA escreve `frota` em usuarios.admin_modulos (sem duplicar, preservando os outros) + linha espelho
 *   RN-F8.03  PUT CONSULTA/MOTORISTA/null num admin_modulo tira `frota` (preservando os outros), apaga o espelho e grava o pedido
 *   RN-F8.04  forcado -> 409 PERFIL_FORCADO com a mensagem nova, nada gravado (nem admin_modulos, nem linha)
 *   RN-F8.05  mensagem de perfil invalido nova; GET perfis com os tres
 *   RN-F8.06  o proprio perfil -> 409 PROPRIO_PERFIL, inclusive o administrador se rebaixando ou se reconfirmando
 *   RN-F8.08  (ajuste 14, B81) o sync do nucleo rodado com a lista ATUAL nao desfaz; rodado com a lista VELHA (sem frota — o que o
 *             cadastro de usuario aberto antes manda) apaga o espelho; a linha CONSULTA gravada pela tela ele nao toca
 *
 * O harness do Frota nao tem perfil_almoxarifado_usuario: por isso o espelho e gravado pelo proprio perfisService (mesmo SQL do
 * sync) e este teste cria a tabela para chamar o sync do nucleo na RN-F8.08.
 *
 * Plano: docs/superpowers/plans/2026-10-28-frotas-etapa8-admin-destinos-condutor.md
 * Executar: cd server && node tests/api/frotasPerfisAdmin.api.test.js
 */
const assert = require('assert');
const { createFrotasTestApp, ADMIN, MOTORISTA2 } = require('../helpers/frotasTestApp');
const { dbRun, dbGet } = require('../../services/frotas/db');
const { classificarPerfilFrota, PERFIS_ATRIBUIVEIS } = require('../../services/frotas/permissions');
const { syncModuleAdminProfiles } = require('../../services/systemPermissions');

let passed = 0; let failed = 0;
const testes = [];
function test(name, fn) { testes.push([name, fn]); }

const MSG_FORCADO = 'Este usuário é superadmin ou administrador do sistema e tem acesso total à frota. Isso não se altera por esta tela.';
const MSG_INVALIDO = 'Perfil inválido. Use CONSULTA, MOTORISTA, ADMIN_FROTA ou vazio para voltar ao padrão.';
const MSG_PROPRIO = 'Você não pode mudar o seu próprio perfil por esta tela.';
const URL = '/api/frotas/perfis-usuario';
const ANA = 2; const BRUNO = 4; const FABIO = 6; const SUPER = 8; const GIL = 9; const IRIS = 11;
// como o enrich monta o Fabio (admin_modulos vem da linha de usuarios; o getPerfilFromUser le a string JSON)
const FABIO_LOGADO = { id: 6, nome: 'Fabio', role: 'usuario', admin_modulos: '["frota"]' };

let ctx;
const como = (user, metodo, url, corpo) => ctx.como(user)(metodo, url, corpo);
const linha = (id) => dbGet(ctx.db, 'SELECT perfil FROM perfil_frota_usuario WHERE usuario_id = ?', [id]);
const modulos = async (id) => (await dbGet(ctx.db, 'SELECT admin_modulos FROM usuarios WHERE id = ?', [id])).admin_modulos;
const listar = async () => {
  const r = await como(ADMIN, 'get', URL);
  assert.strictEqual(r.status, 200, JSON.stringify(r.body));
  return r.body;
};
const doUsuario = async (id) => (await listar()).usuarios.find((u) => u.id === id);
const tripla = (u) => [u.perfil_explicito, u.perfil_efetivo, u.origem];
const put = (id, perfil) => como(ADMIN, 'put', `${URL}/${id}`, { perfil });

async function cenario() {
  // 6 admin do modulo (com a linha que o sync grava), 8 super, 9 admin de OUTRO modulo, 11 role 'Admin' maiusculo
  const extra = [
    [6, 'Fabio AdminModulo', 'fabio@x.com', 1, 'usuario', 0, '["frota"]', 0],
    [8, 'Super', 'super@x.com', 1, 'usuario', 1, null, 0],
    [9, 'Gil AdminAlmox', 'gil@x.com', 1, 'usuario', 0, '["almoxarifado"]', 0],
    [11, 'Iris RoleMaiuscula', 'iris@x.com', 1, 'Admin', 0, null, 0],
  ];
  for (const u of extra) {
    await dbRun(ctx.db, `INSERT INTO usuarios (id, nome, email, ativo, role, is_superadmin, admin_modulos, is_oculto)
      VALUES (?,?,?,?,?,?,?,?)`, u);
  }
  await dbRun(ctx.db, "INSERT INTO perfil_frota_usuario (usuario_id, perfil) VALUES (6, 'ADMIN_FROTA')"); // o sync grava
  // RN-F8.08: a tabela do almoxarifado, que o sync do nucleo tambem toca e o harness do Frota nao sobe
  await dbRun(ctx.db, 'CREATE TABLE IF NOT EXISTS perfil_almoxarifado_usuario (usuario_id INTEGER PRIMARY KEY, perfil TEXT, updated_at TEXT)');
}

// ── RN-F8.01 ────────────────────────────────────────────────────────────────
test('RN-F8.01 a regua: forcado (super, role admin em qualquer caixa) != admin_modulo (admin_modulos com frota)', async () => {
  assert.deepStrictEqual(PERFIS_ATRIBUIVEIS, ['CONSULTA', 'MOTORISTA', 'ADMIN_FROTA']);
  const f = (u, exp) => classificarPerfilFrota(u, exp);
  assert.deepStrictEqual(f({ is_superadmin: 1 }, null), { efetivo: 'ADMIN_FROTA', origem: 'forcado' }, 'superadmin');
  assert.deepStrictEqual(f({ role: 'admin' }, null), { efetivo: 'ADMIN_FROTA', origem: 'forcado' }, 'role admin');
  assert.deepStrictEqual(f({ role: 'Admin' }, null), { efetivo: 'ADMIN_FROTA', origem: 'forcado' }, "role 'Admin' maiusculo");
  assert.deepStrictEqual(f({ role: 'usuario', admin_modulos: '["frota"]' }, null), { efetivo: 'ADMIN_FROTA', origem: 'admin_modulo' }, 'so admin_modulos');
  assert.deepStrictEqual(f({ role: 'usuario', admin_modulos: '["frota"]' }, 'CONSULTA'), { efetivo: 'ADMIN_FROTA', origem: 'admin_modulo' },
    'linha CONSULTA sobrando num admin do modulo nao conta: admin_modulos manda');
  assert.deepStrictEqual(f({ role: 'usuario', admin_modulos: '["almoxarifado"]' }, null), { efetivo: 'MOTORISTA', origem: 'padrao' }, 'outro modulo');
  assert.deepStrictEqual(f({ is_superadmin: 1, admin_modulos: '["frota"]' }, null), { efetivo: 'ADMIN_FROTA', origem: 'forcado' },
    'super com frota na lista continua forcado (a tela nao mexe nele)');
  assert.deepStrictEqual(f({ role: 'usuario', admin_modulos: '[]' }, 'ADMIN_FROTA'), { efetivo: 'ADMIN_FROTA', origem: 'explicito' },
    'RN-F2.07: linha ADMIN_FROTA sobrando sem admin_modulos segue explicito');

  const b = await listar();
  const v = (id) => tripla(b.usuarios.find((x) => x.id === id));
  assert.deepStrictEqual(v(1), [null, 'ADMIN_FROTA', 'forcado']);
  assert.deepStrictEqual(v(SUPER), [null, 'ADMIN_FROTA', 'forcado']);
  assert.deepStrictEqual(v(IRIS), [null, 'ADMIN_FROTA', 'forcado']);
  assert.deepStrictEqual(v(FABIO), ['ADMIN_FROTA', 'ADMIN_FROTA', 'admin_modulo']);
  assert.deepStrictEqual(v(GIL), [null, 'MOTORISTA', 'padrao']);
});

test('RN-F8.01 (ajuste 20) o explicito do admin_modulo e calculado: sem a linha espelho o GET ainda diz ADMIN_FROTA', async () => {
  await dbRun(ctx.db, 'DELETE FROM perfil_frota_usuario WHERE usuario_id = ?', [FABIO]);
  assert.strictEqual(await linha(FABIO), undefined, 'metade positiva: a linha sumiu mesmo');
  assert.deepStrictEqual(tripla(await doUsuario(FABIO)), ['ADMIN_FROTA', 'ADMIN_FROTA', 'admin_modulo'], 'a fonte e admin_modulos');
  await dbRun(ctx.db, "INSERT INTO perfil_frota_usuario (usuario_id, perfil) VALUES (6, 'ADMIN_FROTA')");
});

// ── RN-F8.02 ────────────────────────────────────────────────────────────────
test('RN-F8.02 PUT ADMIN_FROTA na Ana (admin_modulos NULL): ["frota"], linha espelho, resposta admin_modulo; repetir nao duplica', async () => {
  assert.strictEqual(await modulos(ANA), null);
  const r = await put(ANA, 'ADMIN_FROTA');
  assert.strictEqual(r.status, 200, JSON.stringify(r.body));
  assert.deepStrictEqual(r.body, { usuario_id: ANA, perfil_explicito: 'ADMIN_FROTA', perfil_efetivo: 'ADMIN_FROTA', origem: 'admin_modulo' });
  assert.strictEqual(await modulos(ANA), '["frota"]');
  assert.deepStrictEqual(await linha(ANA), { perfil: 'ADMIN_FROTA' }, 'a linha espelho, como o sync gravaria');
  assert.deepStrictEqual(tripla(await doUsuario(ANA)), ['ADMIN_FROTA', 'ADMIN_FROTA', 'admin_modulo']);

  const de_novo = await put(ANA, 'ADMIN_FROTA');
  assert.strictEqual(de_novo.status, 200, JSON.stringify(de_novo.body));
  assert.strictEqual(await modulos(ANA), '["frota"]', 'sem duplicar');
  assert.deepStrictEqual(await linha(ANA), { perfil: 'ADMIN_FROTA' });
});

test('RN-F8.02 PUT ADMIN_FROTA no Gil (["almoxarifado"]) preserva o outro modulo: ["almoxarifado","frota"]', async () => {
  const r = await put(GIL, 'ADMIN_FROTA');
  assert.strictEqual(r.status, 200, JSON.stringify(r.body));
  assert.strictEqual(r.body.origem, 'admin_modulo');
  assert.strictEqual(await modulos(GIL), '["almoxarifado","frota"]', 'frota no fim, o almoxarifado intacto');
  assert.deepStrictEqual(await linha(GIL), { perfil: 'ADMIN_FROTA' });
});

test('RN-F8.02 PUT ADMIN_FROTA em quem tinha linha CONSULTA troca a linha e escreve o admin_modulos', async () => {
  await put(BRUNO, 'CONSULTA');
  assert.deepStrictEqual(await linha(BRUNO), { perfil: 'CONSULTA' });
  const r = await put(BRUNO, 'ADMIN_FROTA');
  assert.strictEqual(r.status, 200, JSON.stringify(r.body));
  assert.deepStrictEqual(await linha(BRUNO), { perfil: 'ADMIN_FROTA' });
  assert.strictEqual(await modulos(BRUNO), '["frota"]');
});

// ── RN-F8.03 ────────────────────────────────────────────────────────────────
test('RN-F8.03 PUT CONSULTA no Fabio (admin_modulo): tira frota, apaga o espelho, grava CONSULTA; efetivo CONSULTA', async () => {
  const r = await put(FABIO, 'CONSULTA');
  assert.strictEqual(r.status, 200, JSON.stringify(r.body));
  assert.deepStrictEqual(r.body, { usuario_id: FABIO, perfil_explicito: 'CONSULTA', perfil_efetivo: 'CONSULTA', origem: 'explicito' });
  assert.strictEqual(await modulos(FABIO), '[]');
  assert.deepStrictEqual(await linha(FABIO), { perfil: 'CONSULTA' });
  assert.deepStrictEqual(tripla(await doUsuario(FABIO)), ['CONSULTA', 'CONSULTA', 'explicito']);
  const vinc = await como(ADMIN, 'get', '/api/frotas/usuarios-vinculaveis');
  assert.strictEqual(vinc.body.find((u) => u.id === FABIO).perfil_frota, 'CONSULTA', 'RN-F2.08 acompanha');
});

test('RN-F8.03 PUT MOTORISTA no Gil (["almoxarifado","frota"]): volta a ["almoxarifado"], linha MOTORISTA', async () => {
  const r = await put(GIL, 'MOTORISTA');
  assert.strictEqual(r.status, 200, JSON.stringify(r.body));
  assert.deepStrictEqual(r.body, { usuario_id: GIL, perfil_explicito: 'MOTORISTA', perfil_efetivo: 'MOTORISTA', origem: 'explicito' });
  assert.strictEqual(await modulos(GIL), '["almoxarifado"]', 'so o frota sai');
  assert.deepStrictEqual(await linha(GIL), { perfil: 'MOTORISTA' });
});

test('RN-F8.03 PUT null na Ana (admin_modulo): [] e sem linha (padrao MOTORISTA)', async () => {
  const r = await put(ANA, null);
  assert.strictEqual(r.status, 200, JSON.stringify(r.body));
  assert.deepStrictEqual(r.body, { usuario_id: ANA, perfil_explicito: null, perfil_efetivo: 'MOTORISTA', origem: 'padrao' });
  assert.strictEqual(await modulos(ANA), '[]');
  assert.strictEqual(await linha(ANA), undefined);
  assert.deepStrictEqual(tripla(await doUsuario(ANA)), [null, 'MOTORISTA', 'padrao']);
});

test('RN-F8.03 quem NAO e admin_modulo nao tem o admin_modulos tocado pelo PUT de CONSULTA/null', async () => {
  // Gil ficou com ["almoxarifado"]: um PUT CONSULTA nele nao pode reescrever a coluna (nem de formato)
  const antes = await modulos(GIL);
  await put(GIL, 'CONSULTA');
  assert.strictEqual(await modulos(GIL), antes, 'a coluna nao foi reescrita');
  await put(GIL, null);
  assert.strictEqual(await modulos(GIL), antes);
  assert.strictEqual(await linha(GIL), undefined);
});

// ── RN-F8.04 ────────────────────────────────────────────────────────────────
test('RN-F8.04 forcado (super, role admin) -> 409 PERFIL_FORCADO com a mensagem nova; nada gravado, com qualquer perfil', async () => {
  for (const id of [1, SUPER, IRIS]) {
    for (const perfil of ['ADMIN_FROTA', 'CONSULTA', 'MOTORISTA', null]) {
      const mods = await modulos(id); const l = await linha(id);
      const r = await put(id, perfil);
      assert.strictEqual(r.status, 409, `usuario ${id} perfil ${perfil}: ${r.status} ${JSON.stringify(r.body)}`);
      assert.deepStrictEqual(r.body, { error: MSG_FORCADO, code: 'PERFIL_FORCADO' });
      assert.strictEqual(await modulos(id), mods, `usuario ${id}: admin_modulos intacto`);
      assert.deepStrictEqual(await linha(id), l, `usuario ${id}: linha intacta`);
    }
  }
});

// ── RN-F8.05 ────────────────────────────────────────────────────────────────
test('RN-F8.05 perfil fora da lista -> 400 com a mensagem nova; GET perfis traz os tres', async () => {
  const r = await put(ANA, 'GESTOR');
  assert.strictEqual(r.status, 400);
  assert.strictEqual(r.body.error, MSG_INVALIDO);
  assert.strictEqual((await put(ANA, 'admin_frota')).status, 400, 'caixa errada nao vale');
  assert.deepStrictEqual((await listar()).perfis, ['CONSULTA', 'MOTORISTA', 'ADMIN_FROTA']);
  assert.strictEqual(await modulos(ANA), '[]', 'nada gravado');
});

// ── RN-F8.06 ────────────────────────────────────────────────────────────────
test('RN-F8.06 o administrador do modulo nao se rebaixa nem se reconfirma por esta tela (409 PROPRIO_PERFIL); muda os outros', async () => {
  await put(FABIO, 'ADMIN_FROTA'); // devolve o Fabio ao estado do cenario
  assert.strictEqual(await modulos(FABIO), '["frota"]');
  for (const perfil of ['CONSULTA', 'MOTORISTA', null, 'ADMIN_FROTA']) {
    const r = await como(FABIO_LOGADO, 'put', `${URL}/${FABIO}`, { perfil });
    assert.strictEqual(r.status, 409, `perfil ${perfil}: ${r.status} ${JSON.stringify(r.body)}`);
    assert.deepStrictEqual(r.body, { error: MSG_PROPRIO, code: 'PROPRIO_PERFIL' });
  }
  assert.strictEqual(await modulos(FABIO), '["frota"]', 'nada gravado');
  assert.deepStrictEqual(await linha(FABIO), { perfil: 'ADMIN_FROTA' });
  // metade positiva: ele da Administrador de Frota a outro e tira
  const da = await como(FABIO_LOGADO, 'put', `${URL}/${BRUNO}`, { perfil: 'ADMIN_FROTA' });
  assert.strictEqual(da.status, 200, JSON.stringify(da.body));
  assert.strictEqual(await modulos(BRUNO), '["frota"]');
  const tira = await como(FABIO_LOGADO, 'put', `${URL}/${BRUNO}`, { perfil: null });
  assert.strictEqual(tira.status, 200, JSON.stringify(tira.body));
  assert.strictEqual(await modulos(BRUNO), '[]');
  assert.strictEqual(await linha(BRUNO), undefined);
});

test('RN-F8.06 o 409 do proprio vem DEPOIS do 400 e do 409 forcado (ordem mantida)', async () => {
  const invalido = await como(FABIO_LOGADO, 'put', `${URL}/${FABIO}`, { perfil: 'GESTOR' });
  assert.strictEqual(invalido.status, 400, 'invalido antes do proprio');
  const SUPER_LOGADO = { id: SUPER, nome: 'Super', role: 'usuario', is_superadmin: 1 };
  const forcado = await como(SUPER_LOGADO, 'put', `${URL}/${SUPER}`, { perfil: 'CONSULTA' });
  assert.strictEqual(forcado.status, 409);
  assert.strictEqual(forcado.body.code, 'PERFIL_FORCADO', 'ajuste 13: o forcado que tenta a si mesmo leva PERFIL_FORCADO');
});

// ── RN-F8.08 (ajuste 14, B81) ───────────────────────────────────────────────
test('RN-F8.08 o sync do nucleo com a lista ATUAL mantem o Administrador dado pela tela', async () => {
  const r = await put(BRUNO, 'ADMIN_FROTA');
  assert.strictEqual(r.status, 200, JSON.stringify(r.body));
  await syncModuleAdminProfiles(ctx.db, BRUNO, await modulos(BRUNO)); // o que o save do cadastro faz com a lista que a tela gravou
  assert.deepStrictEqual(await linha(BRUNO), { perfil: 'ADMIN_FROTA' }, 'a linha segue');
  assert.strictEqual(await modulos(BRUNO), '["frota"]');
  assert.deepStrictEqual(tripla(await doUsuario(BRUNO)), ['ADMIN_FROTA', 'ADMIN_FROTA', 'admin_modulo']);
});

test('RN-F8.08 (B81) o sync com a lista VELHA (cadastro de usuario aberto antes) apaga o espelho — comportamento fixado', async () => {
  assert.deepStrictEqual(await linha(BRUNO), { perfil: 'ADMIN_FROTA' }, 'metade positiva: a linha existe antes');
  await syncModuleAdminProfiles(ctx.db, BRUNO, '[]');
  assert.strictEqual(await linha(BRUNO), undefined, 'o sync apaga a linha ADMIN_FROTA');
  // so o sync nao mexe em usuarios: a fonte ainda diz administrador (o GET continua admin_modulo, ajuste 20)
  assert.deepStrictEqual(tripla(await doUsuario(BRUNO)), ['ADMIN_FROTA', 'ADMIN_FROTA', 'admin_modulo']);
  // o save inteiro do cadastro (PUT /usuarios/:id): grava a lista velha E roda o sync -> o Administrador dado pela tela some
  await dbRun(ctx.db, "UPDATE usuarios SET admin_modulos = '[]' WHERE id = ?", [BRUNO]);
  await syncModuleAdminProfiles(ctx.db, BRUNO, '[]');
  assert.deepStrictEqual(tripla(await doUsuario(BRUNO)), [null, 'MOTORISTA', 'padrao'], 'B81: a tela de usuario desfaz');
});

test('RN-F8.08 a linha CONSULTA gravada pela tela ao tirar o administrador sobrevive ao sync sem frota', async () => {
  await put(FABIO, 'CONSULTA');
  assert.strictEqual(await modulos(FABIO), '[]');
  await syncModuleAdminProfiles(ctx.db, FABIO, '[]');
  assert.deepStrictEqual(await linha(FABIO), { perfil: 'CONSULTA' }, 'o sync so apaga ADMIN_FROTA');
  assert.deepStrictEqual(tripla(await doUsuario(FABIO)), ['CONSULTA', 'CONSULTA', 'explicito']);
  // e o sync com frota (o cadastro marcando o modulo de novo) sobrescreve: C9 continua
  await syncModuleAdminProfiles(ctx.db, FABIO, '["frota"]');
  assert.deepStrictEqual(await linha(FABIO), { perfil: 'ADMIN_FROTA' });
  assert.strictEqual((await como(MOTORISTA2, 'get', URL)).status, 403, 'metade negativa do harness: quem nao e admin nao abre');
});

(async () => {
  ctx = await createFrotasTestApp();
  await cenario();
  console.log('\nFrotas Etapa 8 — G1 (Administrador de Frota pela tela)\n');
  for (const [name, fn] of testes) {
    try { await fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { failed++; console.error(`  ✗ ${name}: ${e.message}`); }
  }
  console.log(`\nResultado: ${passed} passou, ${failed} falhou\n`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
