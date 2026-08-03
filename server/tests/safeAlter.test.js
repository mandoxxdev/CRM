const sqlite3 = require('sqlite3').verbose();
const assert = require('assert');
const { dbRun } = require('../services/almoxarifado/db');
const { safeAlter } = require('../services/almoxarifado/schema');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

(async () => {
  const db = new sqlite3.Database(':memory:');
  await dbRun(db, 'CREATE TABLE t (id INTEGER PRIMARY KEY, nome TEXT)');

  await test('coluna duplicada é engolida silenciosamente', async () => {
    await safeAlter(db, 'ALTER TABLE t ADD COLUMN nome TEXT'); // não deve lançar
  });

  await test('ALTER com erro real propaga (tabela inexistente)', async () => {
    let threw = false;
    try { await safeAlter(db, 'ALTER TABLE tabela_que_nao_existe ADD COLUMN x TEXT'); }
    catch (e) { threw = true; }
    assert.ok(threw, 'erro de ALTER foi engolido');
  });

  await test('ALTER com sintaxe inválida propaga', async () => {
    let threw = false;
    try { await safeAlter(db, 'ALTER TABEL t ADD COLUMN y TEXT'); }
    catch (e) { threw = true; }
    assert.ok(threw);
  });

  db.close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
