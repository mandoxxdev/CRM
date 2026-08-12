/**
 * Etapa 8, Task 1: a coluna proprietario_cliente_id existe, aceita NULL (material nosso) e
 * numero (material de cliente), e o indice foi criado. Teste de fundacao — as leituras
 * auditadas sao cobertas pelo materialClienteSegregacao.api.test.js (Task 2).
 *
 * Executar: cd server && node tests/api/materialClienteColuna.api.test.js
 */
const assert = require('assert');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}
const ADMIN = { id: 1, nome: 'Admin Teste', role: 'admin', is_superadmin: 1, email: 'admin@test.com' };

let seq = 0;
async function novoMaterial(db, { qtd = 0, proprietario_cliente_id = null, minima = 0 } = {}) {
  seq += 1;
  const r = await dbRun(db, `INSERT INTO materiais_almoxarifado
    (codigo, nome, unidade, quantidade_atual, quantidade_minima, custo_unitario, ativo, proprietario_cliente_id)
    VALUES (?, ?, 'PC', ?, ?, 10, 1, ?)`,
  [`T8-COL-${seq}`, `Material T8 ${seq}`, qtd, minima, proprietario_cliente_id]);
  return r.lastID;
}

(async () => {
  const { db, close } = await createTestApp({ user: ADMIN });

  await test('a coluna proprietario_cliente_id existe em materiais_almoxarifado', async () => {
    const cols = await dbAll(db, 'PRAGMA table_info(materiais_almoxarifado)');
    const col = cols.find((c) => c.name === 'proprietario_cliente_id');
    assert.ok(col, 'coluna proprietario_cliente_id ausente');
    assert.strictEqual(col.type, 'INTEGER');
  });

  await test('material sem dono nasce com proprietario_cliente_id NULL', async () => {
    const id = await novoMaterial(db, { qtd: 5 });
    const m = await dbGet(db, 'SELECT proprietario_cliente_id FROM materiais_almoxarifado WHERE id = ?', [id]);
    assert.strictEqual(m.proprietario_cliente_id, null);
  });

  await test('material com dono guarda o cliente_id', async () => {
    const cli = await dbRun(db, 'INSERT INTO clientes (razao_social) VALUES (?)', ['Cliente Alfa LTDA']);
    const id = await novoMaterial(db, { qtd: 5, proprietario_cliente_id: cli.lastID });
    const m = await dbGet(db, 'SELECT proprietario_cliente_id FROM materiais_almoxarifado WHERE id = ?', [id]);
    assert.strictEqual(m.proprietario_cliente_id, cli.lastID);
  });

  await test('o indice idx_materiais_almox_proprietario existe', async () => {
    const idx = await dbAll(db, 'PRAGMA index_list(materiais_almoxarifado)');
    assert.ok(idx.some((i) => i.name === 'idx_materiais_almox_proprietario'), 'indice ausente');
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
