/**
 * GET /api/almoxarifado/minhas-permissoes
 *
 * A interface usa este endpoint para barrar a ação antes de o usuário preencher um
 * formulário inteiro e só então tomar 403 no save. O risco dessa abordagem é o front e o
 * back discordarem — então o teste central aqui não é "o endpoint responde", é
 * **o endpoint concorda com o middleware**: para cada ação, o booleano devolvido tem de
 * corresponder ao que a rota real faz (2xx vs 403).
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun } = require('../../services/almoxarifado/db');
const { ACAO_PERFIS } = require('../../services/almoxarifado/permissions');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

const PRODUCAO = { id: 60, nome: 'Chão de Fábrica', role: 'usuario' };
const ALMOXARIFE = { id: 61, nome: 'Almoxarife', role: 'usuario', perfil_almoxarifado: 'ALMOXARIFE' };
const CONSULTA = { id: 62, nome: 'Consulta', role: 'usuario', perfil_almoxarifado: 'CONSULTA' };
const GESTOR = { id: 63, nome: 'Gestor', role: 'usuario', perfil_almoxarifado: 'GESTOR' };
const ADMIN = { id: 64, nome: 'Admin', role: 'admin' };

const get = (app) => request(app).get('/api/almoxarifado/minhas-permissoes');

(async () => {
  const { app, db, setUser, close } = await createTestApp({ user: ADMIN });

  await test('devolve perfil resolvido e um booleano para CADA ação de ACAO_PERFIS', async () => {
    setUser(PRODUCAO);
    const res = await get(app);
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.strictEqual(res.body.perfil, 'PRODUCAO');
    for (const acao of Object.keys(ACAO_PERFIS)) {
      assert.strictEqual(typeof res.body.acoes[acao], 'boolean', `ação ausente ou não-booleana: ${acao}`);
    }
  });

  await test('não devolve a tabela ACAO_PERFIS (só a decisão já resolvida)', async () => {
    setUser(PRODUCAO);
    const res = await get(app);
    // nenhum valor pode ser lista de perfis — isso indicaria o front tendo que decidir
    Object.entries(res.body.acoes).forEach(([acao, v]) => {
      assert.ok(!Array.isArray(v), `${acao} veio como lista de perfis`);
    });
  });

  await test('PRODUCAO: pode visualizar/requisitar, não pode as ações do hardening', async () => {
    setUser(PRODUCAO);
    const { acoes } = (await get(app)).body;
    assert.strictEqual(acoes.visualizar, true);
    assert.strictEqual(acoes.requisitar, true);
    ['criar_material', 'editar_material', 'movimentar', 'inventario',
      'separar_emitir', 'aprovar_requisicao', 'ajustar_estoque', 'configurar']
      .forEach(a => assert.strictEqual(acoes[a], false, `PRODUCAO não deveria poder ${a}`));
  });

  await test('ALMOXARIFE: movimenta e separa, mas NÃO ajusta saldo nem configura', async () => {
    setUser(ALMOXARIFE);
    const res = await get(app);
    assert.strictEqual(res.body.perfil, 'ALMOXARIFE');
    const { acoes } = res.body;
    ['movimentar', 'separar_emitir', 'criar_material', 'inventario', 'aprovar_requisicao']
      .forEach(a => assert.strictEqual(acoes[a], true, `ALMOXARIFE deveria poder ${a}`));
    assert.strictEqual(acoes.ajustar_estoque, false);
    assert.strictEqual(acoes.configurar, false);
  });

  await test('CONSULTA: só visualizar', async () => {
    setUser(CONSULTA);
    const { acoes } = (await get(app)).body;
    assert.strictEqual(acoes.visualizar, true);
    assert.strictEqual(acoes.requisitar, false);
    assert.strictEqual(acoes.criar_material, false);
  });

  await test('GESTOR ajusta estoque; ALMOXARIFE não (segregação do inventário)', async () => {
    setUser(GESTOR);
    assert.strictEqual((await get(app)).body.acoes.ajustar_estoque, true);
    setUser(ALMOXARIFE);
    assert.strictEqual((await get(app)).body.acoes.ajustar_estoque, false);
  });

  await test('admin de sistema pode tudo', async () => {
    setUser(ADMIN);
    const res = await get(app);
    assert.strictEqual(res.body.perfil, 'ADMINISTRADOR');
    Object.entries(res.body.acoes).forEach(([acao, v]) => {
      assert.strictEqual(v, true, `admin deveria poder ${acao}`);
    });
  });

  // ── O teste que importa: endpoint x middleware não podem discordar ──

  await test('[coerência] criar_material: o booleano prevê o status real do POST', async () => {
    for (const u of [PRODUCAO, CONSULTA, ALMOXARIFE, ADMIN]) {
      setUser(u);
      const previsto = (await get(app)).body.acoes.criar_material;
      const real = await request(app).post('/api/almoxarifado/materiais')
        .send({ codigo: `COER-${u.id}`, nome: `Material ${u.id}` });
      // O sinal de AUTORIZAÇÃO é o 403, não "status < 400": um 400 de validação de schema
      // significa que a permissão passou e o payload é que estava incompleto.
      const bloqueado = real.status === 403;
      assert.strictEqual(bloqueado, !previsto,
        `${u.nome}: endpoint disse pode=${previsto}, rota devolveu ${real.status}`);
    }
  });

  await test('[coerência] inventario: o booleano prevê o status real de POST /conferencias', async () => {
    for (const u of [PRODUCAO, CONSULTA, ALMOXARIFE, GESTOR, ADMIN]) {
      setUser(u);
      const previsto = (await get(app)).body.acoes.inventario;
      const real = await request(app).post('/api/almoxarifado/conferencias').send({});
      // O sinal de AUTORIZAÇÃO é o 403, não "status < 400": um 400 de validação de schema
      // significa que a permissão passou e o payload é que estava incompleto.
      const bloqueado = real.status === 403;
      assert.strictEqual(bloqueado, !previsto,
        `${u.nome}: endpoint disse pode=${previsto}, rota devolveu ${real.status}`);
    }
  });

  await test('[coerência] movimentar: o booleano prevê o status real da movimentação', async () => {
    const r = await dbRun(db,
      `INSERT INTO materiais_almoxarifado (codigo, nome, quantidade_atual, ativo) VALUES (?,?,?,1)`,
      ['COER-MOV', 'Material coerência mov', 500]);
    for (const u of [PRODUCAO, CONSULTA, ALMOXARIFE, GESTOR, ADMIN]) {
      setUser(u);
      const previsto = (await get(app)).body.acoes.movimentar;
      const real = await request(app).post('/api/almoxarifado/movimentacoes')
        .send({ material_id: r.lastID, tipo: 'ENTRADA', quantidade: 1 });
      // O sinal de AUTORIZAÇÃO é o 403, não "status < 400": um 400 de validação de schema
      // significa que a permissão passou e o payload é que estava incompleto.
      const bloqueado = real.status === 403;
      assert.strictEqual(bloqueado, !previsto,
        `${u.nome}: endpoint disse pode=${previsto}, rota devolveu ${real.status}`);
    }
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
