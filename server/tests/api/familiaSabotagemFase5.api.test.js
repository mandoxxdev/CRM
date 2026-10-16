/**
 * Etapa 123, Fase 5 (revisor de sabotagem, r3) — seis cenarios que faltavam: 78 sabotagens, 68 derrubaram teste pela
 * assercao certa; das 10 que passaram, 4 sao equivalentes ou inalcancaveis (declaradas no plano) e estas 6 viraram teste.
 *  [RN-09c] a ordem da primeira passada do PUT de familia: o nivel (material) antes do pai.
 *  [RN-11c] a ordem do PUT de material: o dono antes das guardas de inativar/controle.
 *  [RN-08b] o legado do terceiro nivel: a sub com neta sobe a raiz (sem o !!parentId, um 409 falso).
 *  [RN-06g] reativar a sub com o pai mudado no meio: 409, nao a recusa sobre o pai antigo.
 *  [RN-13b] o POST aceita o pai com espacos (o trim da regua).
 *  [RN-14c] o reparo nao toca pai que aponta para id inexistente (so o 0).
 *
 * Executar: cd server && node tests/api/familiaSabotagemFase5.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet } = require('../../services/almoxarifado/db');
const schema = require('../../services/almoxarifado/schema');
let passed = 0; let failed = 0;
async function test(name, fn) { try { await fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { failed++; console.error(`  ✗ ${name}: ${e.message}`); } }
const SUPER = { id: 1, nome: 'Super Teste', role: 'admin', is_superadmin: 1, email: 'super@test.com' };
(async () => {
  const { app, db, close } = await createTestApp({ user: SUPER });
  await new Promise((r) => setTimeout(r, 300));
  const srv = app.listen(0);
  let seq = 0;
  const familia = async (ativo = 1, parentId = null) => { seq += 1; return (await dbRun(db, 'INSERT INTO familias_material_almoxarifado (codigo, nome, ativo, parent_id) VALUES (?, ?, ?, ?)', [`PR-${seq}`, `Probe ${seq}`, ativo, parentId])).lastID; };
  const pai = async (id) => (await dbGet(db, 'SELECT parent_id FROM familias_material_almoxarifado WHERE id = ?', [id])).parent_id;
  let inj = null;
  const getOriginal = db.get.bind(db);
  db.get = function (sql, params, cb) {
    if (typeof params === 'function') { cb = params; params = []; }
    const s = String(sql).replace(/\s+/g, ' ').trim();
    if (inj && inj.sql.test(s)) { const i = inj; inj = null; return getOriginal(sql, params, (err, row) => i.depois().then(() => cb(err, row), cb)); }
    return getOriginal(sql, params, cb);
  };

  await test('[RN-09c] ordem: raiz com material para pai inativo -> a recusa do material (nivel) vem antes da do pai', async () => {
    const R = await familia(); const R2 = await familia(0);
    await dbRun(db, "INSERT INTO materiais_almoxarifado (codigo, nome, unidade, familia_id, ativo) VALUES ('PRA', 'pra', 'PC', ?, 1)", [R]);
    const r = await request(srv).put(`/api/almoxarifado/familias/${R}`).send({ nome: 'x', parent_id: R2 });
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, 'Não é possível transformar em subfamília: a família tem 1 material(is) cadastrado(s) (contando os inativos)');
    assert.strictEqual(await pai(R), null);
  });

  await test('[RN-11c] ordem: PUT material inativar com saldo + dono inexistente -> a do dono vem antes', async () => {
    const id = (await dbRun(db, "INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, ativo) VALUES ('PRB', 'prb', 'PC', 10, 1)")).lastID;
    const r = await request(srv).put(`/api/almoxarifado/materiais/${id}`).send({ ativo: 0, proprietario_cliente_id: 77777 });
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.ok(r.body.error.startsWith('O cliente dono informado (#77777)'), r.body.error);
  });

  await test('[RN-08b] legado terceiro nivel: sub com neta vira raiz -> 200', async () => {
    const R = await familia(); const S = await familia(1, R); await familia(1, S);
    const r = await request(srv).put(`/api/almoxarifado/familias/${S}`).send({ nome: 'sobe', parent_id: null });
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.strictEqual(await pai(S), null);
  });

  await test('[RN-06g] reativar sub, na janela ela muda para R2 e R1 e inativada -> 409 (nao a recusa do pai antigo)', async () => {
    const R1 = await familia(); const R2 = await familia(); const S = await familia(0, R1);
    inj = { sql: /^SELECT ativo, parent_id FROM familias_material_almoxarifado WHERE id = \?$/, depois: async () => {
      await dbRun(db, 'UPDATE familias_material_almoxarifado SET parent_id = ? WHERE id = ?', [R2, S]);
      await dbRun(db, 'UPDATE familias_material_almoxarifado SET ativo = 0 WHERE id = ?', [R1]);
    } };
    const r = await request(srv).put(`/api/almoxarifado/familias/${S}`).send({ nome: 'reat', ativo: 1 });
    assert.strictEqual(inj, null, 'injecao nao consumida');
    assert.strictEqual(r.status, 409, JSON.stringify(r.body));
    assert.strictEqual(await pai(S), R2);
  });

  await test('[RN-13b] POST parent_id com espacos " <id> " -> 201 subfamilia', async () => {
    const R = await familia();
    const r = await request(srv).post('/api/almoxarifado/familias').send({ nome: 'esp', parent_id: ` ${R} ` });
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    assert.strictEqual(r.body.parent_id, R);
  });

  await test('[RN-14c] reparo nao toca pai orfao (id inexistente)', async () => {
    const O = await familia(1, 999999);
    await dbRun(db, "DELETE FROM schema_migrations_almoxarifado WHERE id = 'reparo_familia_pai_zero'");
    await schema.migrateRepararFamiliaPaiZero(db);
    assert.strictEqual(await pai(O), 999999);
  });

  srv.close();
  await close();
  console.log(`\n${passed} passaram, ${failed} falharam`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
