/**
 * Etapa 123 (C223, B795) — o "pai 0" das familias.
 *
 * A C223 dizia "legado de antes da Etapa 103"; ESTAVA ERRADA: a 103 fechou o PUT (`parent_id` so inteiro positivo), mas o
 * POST /familias continuava gravando — `parent_id: "0"` virava `parent_id = 0` (201), `"abc"` virava raiz calada e `"1.5"`
 * virava subfamilia da familia 1 (Fase 0 da 123, sonda e123fase0). A familia de pai 0 e raiz para a aba Familias e
 * subfamilia para o cadastro de material (recusa "A família escolhida é uma subfamília — …").
 *
 * Correcao: o POST ganha a regua do PUT (RN-13) e o boot repara `parent_id = 0` -> NULL, com ledger (RN-14).
 *
 * Executar: cd server && node tests/api/familiaPaiZero.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet } = require('../../services/almoxarifado/db');
const schema = require('../../services/almoxarifado/schema');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}
const SUPER = { id: 1, nome: 'Super Teste', role: 'admin', is_superadmin: 1, email: 'super@test.com' };
const L_PAI_NAO = 'Família pai não encontrada';
const L_NOME = 'Nome é obrigatório';
const L_FAM_SUB = 'A família escolhida é uma subfamília — escolha a família principal e use a subfamília no campo Subfamília';
const LEDGER = 'reparo_familia_pai_zero';

(async () => {
  console.log('\n═══ O pai 0 das familias (Etapa 123, C223) ═══\n');
  const { app, db, close } = await createTestApp({ user: SUPER });
  // o initSchema do harness roda o reparo em fundo; espera ele assentar antes de qualquer cenario
  await new Promise((r) => setTimeout(r, 300));
  let seq = 0;
  const familia = async (ativo = 1, parentId = null) => {
    seq += 1;
    return (await dbRun(db, 'INSERT INTO familias_material_almoxarifado (codigo, nome, ativo, parent_id) VALUES (?, ?, ?, ?)',
      [`F0-${seq}`, `Familia pai0 ${seq}`, ativo, parentId])).lastID;
  };
  const porNome = async (nome) => (await dbGet(db, 'SELECT COUNT(*) AS n FROM familias_material_almoxarifado WHERE nome = ?', [nome])).n;
  const paiDe = async (id) => (await dbGet(db, 'SELECT parent_id FROM familias_material_almoxarifado WHERE id = ?', [id])).parent_id;
  const ledger = async () => !!(await dbGet(db, 'SELECT 1 AS ok FROM schema_migrations_almoxarifado WHERE id = ?', [LEDGER]));

  await test('[RN-13] POST /familias com parent_id que nao e inteiro positivo -> 400 "Família pai não encontrada", nada gravado', async () => {
    for (const [i, p] of [['a', '0'], ['b', 0], ['c', 'abc'], ['d', '1.5'], ['e', -1], ['f', ' 0 ']].entries()) {
      const nome = `pai invalido ${i}`;
      const r = await request(app).post('/api/almoxarifado/familias').send({ nome, parent_id: p[1] });
      assert.strictEqual(r.status, 400, `parent_id ${JSON.stringify(p[1])}: ${r.status} ${JSON.stringify(r.body)}`);
      assert.strictEqual(r.body.error, L_PAI_NAO, `parent_id ${JSON.stringify(p[1])}`);
      assert.strictEqual(await porNome(nome), 0, `parent_id ${JSON.stringify(p[1])} gravou`);
    }
  });

  await test('[RN-13] metade positiva: null, "" e omitido -> raiz (201); "<id>" de raiz ativa -> subfamilia (201)', async () => {
    for (const [i, corpo] of [{ parent_id: null }, { parent_id: '' }, {}].entries()) {
      const r = await request(app).post('/api/almoxarifado/familias').send({ nome: `raiz ok ${i}`, ...corpo });
      assert.strictEqual(r.status, 201, `${JSON.stringify(corpo)}: ${r.status} ${JSON.stringify(r.body)}`);
      assert.strictEqual(r.body.parent_id, null);
    }
    const R = await familia();
    const r = await request(app).post('/api/almoxarifado/familias').send({ nome: 'sub ok', parent_id: String(R) });
    assert.strictEqual(r.status, 201, `${r.status} ${JSON.stringify(r.body)}`);
    assert.strictEqual(r.body.parent_id, R);
    const r2 = await request(app).post('/api/almoxarifado/familias').send({ nome: 'sub ok numero', parent_id: R });
    assert.strictEqual(r2.status, 201, `${r2.status} ${JSON.stringify(r2.body)}`);
    assert.strictEqual(r2.body.parent_id, R);
  });

  await test('[RN-13] sem nome -> "Nome é obrigatório" antes do pai invalido (Fase 2, M3)', async () => {
    const r = await request(app).post('/api/almoxarifado/familias').send({ nome: '  ', parent_id: '0' });
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.body.error, L_NOME);
  });

  await test('[RN-14] o reparo: pai 0 -> NULL, as outras intocadas, ledger gravado; material passa a entrar nela', async () => {
    const Z = await familia(1, 0); const R = await familia(); const S = await familia(1, R); const Z2 = await familia(0, 0);
    const antes = await request(app).post('/api/almoxarifado/materiais')
      .send({ codigo: 'PAI0-A', nome: 'pai0 a', unidade: 'PC', categoria: 'OUTROS', familia_id: Z });
    assert.strictEqual(antes.status, 400, `antes do reparo: ${antes.status} ${JSON.stringify(antes.body)}`);
    assert.strictEqual(antes.body.error, L_FAM_SUB);
    await dbRun(db, 'DELETE FROM schema_migrations_almoxarifado WHERE id = ?', [LEDGER]);
    await schema.migrateRepararFamiliaPaiZero(db);
    assert.strictEqual(await paiDe(Z), null);
    assert.strictEqual(await paiDe(Z2), null);
    assert.strictEqual(await paiDe(S), R);
    assert.strictEqual(await paiDe(R), null);
    assert.strictEqual(await ledger(), true);
    const depois = await request(app).post('/api/almoxarifado/materiais')
      .send({ codigo: 'PAI0-B', nome: 'pai0 b', unidade: 'PC', categoria: 'OUTROS', familia_id: Z });
    assert.strictEqual(depois.status, 201, `depois do reparo: ${depois.status} ${JSON.stringify(depois.body)}`);
  });

  await test('[RN-14] com o ledger, a segunda chamada nao toca (um 0 gravado a mao depois continua 0)', async () => {
    assert.strictEqual(await ledger(), true);
    const Z = await familia(1, 0);
    await schema.migrateRepararFamiliaPaiZero(db);
    assert.strictEqual(await paiDe(Z), 0);
    // metade positiva: sem o ledger, repara
    await dbRun(db, 'DELETE FROM schema_migrations_almoxarifado WHERE id = ?', [LEDGER]);
    await schema.migrateRepararFamiliaPaiZero(db);
    assert.strictEqual(await paiDe(Z), null);
  });

  await test('[RN-14] o initSchema chama o reparo (banco que ja tinha a familia de pai 0 antes do boot)', async () => {
    const { db: db2, close: close2 } = await createTestApp({ user: SUPER });
    await new Promise((r) => setTimeout(r, 300));
    await dbRun(db2, 'DELETE FROM schema_migrations_almoxarifado WHERE id = ?', [LEDGER]);
    const z = (await dbRun(db2, "INSERT INTO familias_material_almoxarifado (codigo, nome, parent_id) VALUES ('BOOT0', 'boot pai 0', 0)")).lastID;
    await schema.initSchema(db2);
    const p = (await dbGet(db2, 'SELECT parent_id FROM familias_material_almoxarifado WHERE id = ?', [z])).parent_id;
    assert.strictEqual(p, null, 'o initSchema nao reparou');
    assert.ok(await dbGet(db2, 'SELECT 1 AS ok FROM schema_migrations_almoxarifado WHERE id = ?', [LEDGER]));
    await close2();
  });

  await close();
  console.log(`\n${passed} passaram, ${failed} falharam\n`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
