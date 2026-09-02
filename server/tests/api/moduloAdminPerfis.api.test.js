/**
 * syncModuleAdminProfiles: conceder E revogar admin de módulo.
 *
 * Bug coberto: ao revogar 'almoxarifado'/'frota' de admin_modulos a função só
 * fazia INSERT quando o módulo era concedido — a linha em
 * perfil_almoxarifado_usuario / perfil_frota_usuario ficava órfã e o usuário
 * continuava ADMINISTRADOR do módulo (getPerfilFromUser lê user.perfil_almoxarifado).
 */
const assert = require('assert');
const sqlite3 = require('sqlite3').verbose();
const { syncModuleAdminProfiles } = require('../../services/systemPermissions');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

function run(db, sql, params = []) {
  return new Promise((resolve, reject) => db.run(sql, params, (e) => (e ? reject(e) : resolve())));
}
function get(db, sql, params = []) {
  return new Promise((resolve, reject) => db.get(sql, params, (e, row) => (e ? reject(e) : resolve(row))));
}

async function createDb() {
  const db = new sqlite3.Database(':memory:');
  await run(db, `CREATE TABLE perfil_almoxarifado_usuario (
    usuario_id INTEGER PRIMARY KEY,
    perfil TEXT NOT NULL DEFAULT 'PRODUCAO',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  await run(db, `CREATE TABLE perfil_frota_usuario (
    usuario_id INTEGER PRIMARY KEY,
    perfil TEXT NOT NULL DEFAULT 'MOTORISTA',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  return db;
}

const perfilAlmox = (db, id) => get(db, 'SELECT perfil FROM perfil_almoxarifado_usuario WHERE usuario_id = ?', [id]);
const perfilFrota = (db, id) => get(db, 'SELECT perfil FROM perfil_frota_usuario WHERE usuario_id = ?', [id]);

(async () => {
  const db = await createDb();

  await test('conceder almoxarifado cria linha ADMINISTRADOR', async () => {
    await syncModuleAdminProfiles(db, 10, '["almoxarifado"]');
    assert.strictEqual((await perfilAlmox(db, 10))?.perfil, 'ADMINISTRADOR');
  });

  await test('revogar almoxarifado (admin_modulos "[]") remove a linha', async () => {
    await syncModuleAdminProfiles(db, 10, '[]');
    assert.strictEqual(await perfilAlmox(db, 10), undefined, 'linha ADMINISTRADOR ficou órfã após revogação');
  });

  await test('conceder frota cria linha ADMIN_FROTA', async () => {
    await syncModuleAdminProfiles(db, 11, '["frota"]');
    assert.strictEqual((await perfilFrota(db, 11))?.perfil, 'ADMIN_FROTA');
  });

  await test('revogar frota remove a linha', async () => {
    await syncModuleAdminProfiles(db, 11, '[]');
    assert.strictEqual(await perfilFrota(db, 11), undefined, 'linha ADMIN_FROTA ficou órfã após revogação');
  });

  await test('conceder um e revogar o outro na mesma chamada: só o revogado some', async () => {
    await syncModuleAdminProfiles(db, 12, '["almoxarifado","frota"]');
    assert.strictEqual((await perfilAlmox(db, 12))?.perfil, 'ADMINISTRADOR');
    assert.strictEqual((await perfilFrota(db, 12))?.perfil, 'ADMIN_FROTA');

    await syncModuleAdminProfiles(db, 12, '["frota"]');
    assert.strictEqual(await perfilAlmox(db, 12), undefined, 'almoxarifado revogado deveria ter sumido');
    assert.strictEqual((await perfilFrota(db, 12))?.perfil, 'ADMIN_FROTA', 'frota concedida não deveria sumir');
  });

  await test('revogar quando não havia linha nenhuma é idempotente', async () => {
    await syncModuleAdminProfiles(db, 99, '[]');
    await syncModuleAdminProfiles(db, 99, '[]');
    assert.strictEqual(await perfilAlmox(db, 99), undefined);
    assert.strictEqual(await perfilFrota(db, 99), undefined);
  });

  await test('perfil ALMOXARIFE concedido manualmente NÃO é apagado ao editar usuário', async () => {
    await run(db, "INSERT INTO perfil_almoxarifado_usuario (usuario_id, perfil) VALUES (?, 'ALMOXARIFE')", [13]);
    await syncModuleAdminProfiles(db, 13, '[]');
    assert.strictEqual((await perfilAlmox(db, 13))?.perfil, 'ALMOXARIFE', 'perfil legítimo foi apagado');
  });

  await test('perfil MOTORISTA (frota) concedido manualmente NÃO é apagado ao editar usuário', async () => {
    await run(db, "INSERT INTO perfil_frota_usuario (usuario_id, perfil) VALUES (?, 'MOTORISTA')", [14]);
    await syncModuleAdminProfiles(db, 14, '["almoxarifado"]');
    assert.strictEqual((await perfilFrota(db, 14))?.perfil, 'MOTORISTA', 'perfil legítimo foi apagado');
    assert.strictEqual((await perfilAlmox(db, 14))?.perfil, 'ADMINISTRADOR');
  });

  await test('promover ALMOXARIFE a admin de módulo e depois revogar volta a linha para... nada', async () => {
    // Documenta o efeito colateral aceito: o INSERT ... ON CONFLICT sobrescreve o
    // perfil anterior, então após revogar o usuário fica sem perfil (e não ALMOXARIFE).
    await run(db, "INSERT INTO perfil_almoxarifado_usuario (usuario_id, perfil) VALUES (?, 'ALMOXARIFE')", [15]);
    await syncModuleAdminProfiles(db, 15, '["almoxarifado"]');
    assert.strictEqual((await perfilAlmox(db, 15))?.perfil, 'ADMINISTRADOR');
    await syncModuleAdminProfiles(db, 15, '[]');
    assert.strictEqual(await perfilAlmox(db, 15), undefined);
  });

  await new Promise((resolve) => db.close(resolve));
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
