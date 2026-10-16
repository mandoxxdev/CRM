/**
 * Etapa 123 — integracao (T4): familias sem corrida (C221), o dono que existe (C216) e o pai 0 (C223), cruzando as rotas
 * de familia, de material e o boot.
 *
 * (i) PELA ROTA: cliente -> raiz e subfamilia pelo POST -> material (raiz, sub) com o dono cadastrado (201) e com um
 *     inexistente (400) -> "Inativar" a raiz recusado (subfamilia ativa) -> a corrida "raiz vira subfamilia x cadastro de
 *     material nela" -> familia de pai 0 recusada no POST, semeada direto, reparada, e o material entra nela.
 * (ii) PELO SERVICO: materialService.createMaterial com dono inexistente lanca 400; schema.migrateRepararFamiliaPaiZero repara.
 *
 * Executar: cd server && node tests/api/familiasSemCorridaIntegracao.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet } = require('../../services/almoxarifado/db');
const materialService = require('../../services/almoxarifado/materialService');
const schema = require('../../services/almoxarifado/schema');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}
const SUPER = { id: 1, nome: 'Super Teste', role: 'admin', is_superadmin: 1, email: 'super@test.com' };
const L_DONO = (n) => `O cliente dono informado (#${n}) não existe em Clientes — escolha um cliente cadastrado ou deixe o material como estoque próprio.`;
const L_SUBS_DEL = (n) => `Não é possível remover: família possui ${n} subfamília(s) ativa(s)`;
const L_ITENS = (n) => `Não é possível remover: família possui ${n} item(ns) ativo(s)`;
const L_VIRAR_SUB = (n) => `Não é possível transformar em subfamília: a família tem ${n} material(is) cadastrado(s) (contando os inativos)`;
const L_FAM_SUB = 'A família escolhida é uma subfamília — escolha a família principal e use a subfamília no campo Subfamília';
const L_PAI_NAO = 'Família pai não encontrada';
const LEDGER = 'reparo_familia_pai_zero';

(async () => {
  console.log('\n═══ Familias sem corrida e o dono que existe — integracao (Etapa 123) ═══\n');
  const { app, db, close } = await createTestApp({ user: SUPER });
  await new Promise((r) => setTimeout(r, 300));
  const clienteId = (await dbRun(db, "INSERT INTO clientes (razao_social) VALUES ('Caldeiraria Integracao 123')")).lastID;
  let seq = 0;
  const corpo = (familiaId, extra = {}) => {
    seq += 1;
    return { codigo: `INT123-${seq}`, nome: `Integracao 123 ${seq}`, unidade: 'PC', categoria: 'OUTROS', familia_id: familiaId, ...extra };
  };

  await test('(i) pela rota: raiz e sub pelo POST, material com dono cadastrado e com inexistente, Inativar recusado', async () => {
    const raiz = await request(app).post('/api/almoxarifado/familias').send({ nome: 'Raiz integracao 123' });
    assert.strictEqual(raiz.status, 201, JSON.stringify(raiz.body));
    const sub = await request(app).post('/api/almoxarifado/familias').send({ nome: 'Sub integracao 123', parent_id: raiz.body.id });
    assert.strictEqual(sub.status, 201, JSON.stringify(sub.body));
    assert.strictEqual(sub.body.parent_id, raiz.body.id);

    const ok = await request(app).post('/api/almoxarifado/materiais')
      .send(corpo(raiz.body.id, { subfamilia_id: sub.body.id, proprietario_cliente_id: clienteId }));
    assert.strictEqual(ok.status, 201, JSON.stringify(ok.body));
    assert.strictEqual(ok.body.proprietario_cliente_id, clienteId);
    const fantasma = corpo(raiz.body.id, { subfamilia_id: sub.body.id, proprietario_cliente_id: 987654 });
    const nao = await request(app).post('/api/almoxarifado/materiais').send(fantasma);
    assert.strictEqual(nao.status, 400, JSON.stringify(nao.body));
    assert.strictEqual(nao.body.error, L_DONO(987654));
    assert.strictEqual((await dbGet(db, 'SELECT COUNT(*) AS n FROM materiais_almoxarifado WHERE codigo = ?', [fantasma.codigo])).n, 0);

    // o PUT do material trocando para o inexistente: 400, dono intacto
    const troca = await request(app).put(`/api/almoxarifado/materiais/${ok.body.id}`).send({ proprietario_cliente_id: 987654 });
    assert.strictEqual(troca.status, 400, JSON.stringify(troca.body));
    assert.strictEqual(troca.body.error, L_DONO(987654));
    assert.strictEqual((await dbGet(db, 'SELECT proprietario_cliente_id AS p FROM materiais_almoxarifado WHERE id = ?', [ok.body.id])).p, clienteId);

    // a hierarquia que as duas pontas montaram continua guardada: a sub tem material, a raiz tem a sub
    const inatRaiz = await request(app).delete(`/api/almoxarifado/familias/${raiz.body.id}`);
    assert.strictEqual(inatRaiz.status, 400, JSON.stringify(inatRaiz.body));
    assert.ok([L_ITENS(1), L_SUBS_DEL(1)].includes(inatRaiz.body.error), inatRaiz.body.error);
    const virar = await request(app).put(`/api/almoxarifado/familias/${sub.body.id}`).send({ nome: 'Sub integracao 123', parent_id: null });
    assert.strictEqual(virar.status, 400, JSON.stringify(virar.body));
  });

  await test('(i) pela rota: raiz vira subfamilia x cadastro de material nela, 30 rodadas — nunca subfamilia com material de raiz', async () => {
    const furos = [];
    for (let i = 0; i < 30; i++) {
      const X = (await request(app).post('/api/almoxarifado/familias').send({ nome: `X int ${i}` })).body.id;
      const R2 = (await request(app).post('/api/almoxarifado/familias').send({ nome: `R2 int ${i}` })).body.id;
      const b = corpo(X, { proprietario_cliente_id: clienteId });
      const [rf, rm] = await Promise.all([
        request(app).put(`/api/almoxarifado/familias/${X}`).send({ nome: `X int ${i}`, parent_id: R2 }),
        request(app).post('/api/almoxarifado/materiais').send(b),
      ]);
      assert.ok(rf.status === 200 || (rf.status === 400 && rf.body.error === L_VIRAR_SUB(1)), `familia ${rf.status} ${JSON.stringify(rf.body)}`);
      assert.ok(rm.status === 201 || (rm.status === 400 && rm.body.error === L_FAM_SUB), `material ${rm.status} ${JSON.stringify(rm.body)}`);
      assert.ok(rf.status === 200 || rm.status === 201, 'nenhum dos dois gravou');
      const pai = (await dbGet(db, 'SELECT parent_id FROM familias_material_almoxarifado WHERE id = ?', [X])).parent_id;
      const mats = (await dbGet(db, 'SELECT COUNT(*) AS n FROM materiais_almoxarifado WHERE familia_id = ?', [X])).n;
      if (pai !== null && mats > 0) furos.push(i);
    }
    assert.deepStrictEqual(furos, []);
  });

  await test('(i) pela rota: pai 0 recusado no POST; o legado semeado e reparado e passa a receber material', async () => {
    const r = await request(app).post('/api/almoxarifado/familias').send({ nome: 'Pai zero int', parent_id: '0' });
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, L_PAI_NAO);
    const z = (await dbRun(db, "INSERT INTO familias_material_almoxarifado (codigo, nome, parent_id) VALUES ('INT0', 'pai 0 int', 0)")).lastID;
    const antes = await request(app).post('/api/almoxarifado/materiais').send(corpo(z));
    assert.strictEqual(antes.status, 400, JSON.stringify(antes.body));
    assert.strictEqual(antes.body.error, L_FAM_SUB);
    await dbRun(db, 'DELETE FROM schema_migrations_almoxarifado WHERE id = ?', [LEDGER]);
    await schema.initSchema(db);
    const depois = await request(app).post('/api/almoxarifado/materiais').send(corpo(z, { proprietario_cliente_id: clienteId }));
    assert.strictEqual(depois.status, 201, JSON.stringify(depois.body));
    const sub = await request(app).post('/api/almoxarifado/familias').send({ nome: 'Sub do pai 0 reparado', parent_id: z });
    assert.strictEqual(sub.status, 201, JSON.stringify(sub.body));
  });

  await test('(ii) pelo servico: createMaterial com dono inexistente lanca 400; migrateRepararFamiliaPaiZero repara', async () => {
    const raiz = (await dbRun(db, "INSERT INTO familias_material_almoxarifado (codigo, nome) VALUES ('INTSRV', 'raiz servico')")).lastID;
    let lancou = null;
    try {
      await materialService.createMaterial(db, SUPER, corpo(raiz, { proprietario_cliente_id: 555555 }));
    } catch (e) { lancou = e; }
    assert.ok(lancou, 'o servico nao lancou');
    assert.strictEqual(lancou.status, 400);
    assert.strictEqual(lancou.message, L_DONO(555555));
    const okSrv = await materialService.createMaterial(db, SUPER, corpo(raiz, { proprietario_cliente_id: clienteId }));
    assert.strictEqual(okSrv.proprietario_cliente_id, clienteId);
    const z = (await dbRun(db, "INSERT INTO familias_material_almoxarifado (codigo, nome, parent_id) VALUES ('INTSRV0', 'pai 0 servico', 0)")).lastID;
    await dbRun(db, 'DELETE FROM schema_migrations_almoxarifado WHERE id = ?', [LEDGER]);
    await schema.migrateRepararFamiliaPaiZero(db);
    assert.strictEqual((await dbGet(db, 'SELECT parent_id FROM familias_material_almoxarifado WHERE id = ?', [z])).parent_id, null);
    const m = await materialService.createMaterial(db, SUPER, corpo(z));
    assert.strictEqual(m.familia_id, z);
  });

  await close();
  console.log(`\n${passed} passaram, ${failed} falharam\n`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
