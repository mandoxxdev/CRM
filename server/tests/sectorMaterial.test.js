/**
 * Testes de isolamento de materiais por setor
 * Executar: node server/tests/sectorMaterial.test.js
 */
const sqlite3 = require('sqlite3').verbose();
const assert = require('assert');
const { initSchema } = require('../services/almoxarifado/schema');
const { dbRun, dbGet, dbAll } = require('../services/almoxarifado/db');
const sectorMaterialService = require('../services/almoxarifado/sectorMaterialService');

let passed = 0;
let failed = 0;

function test(name, fn) {
  return fn().then(() => {
    passed++;
    console.log(`  ✓ ${name}`);
  }).catch((e) => {
    failed++;
    console.error(`  ✗ ${name}: ${e.message}`);
  });
}

async function setupDb() {
  const db = new sqlite3.Database(':memory:');
  await initSchema(db);
  return db;
}

async function criarMaterial(db, { codigo, nome, familiaId, categoriaId }) {
  const r = await dbRun(db,
    `INSERT INTO materiais_almoxarifado (codigo, nome, familia_id, categoria_id, ativo)
     VALUES (?,?,?,?,1)`,
    [codigo, nome, familiaId || null, categoriaId || null]);
  return r.lastID;
}

async function materiaisFiltrados(db, setor) {
  const clause = await sectorMaterialService.buildMaterialFilterClause(db, setor);
  let sql = 'SELECT m.id, m.nome FROM materiais_almoxarifado m WHERE m.ativo = 1';
  if (clause) sql += ` AND ${clause}`;
  return dbAll(db, sql);
}

async function run() {
  console.log('\n🧪 Testes isolamento materiais por setor\n');
  const db = await setupDb();

  const famPar = await dbGet(db, "SELECT id FROM familias_material_almoxarifado WHERE codigo = 'PAR'");
  const catEpi = await dbGet(db, "SELECT id FROM categorias_material_almoxarifado WHERE nome = 'EPIs'");
  const catChapa = await dbGet(db, "SELECT id FROM categorias_material_almoxarifado WHERE nome = 'Chapas'");

  await dbRun(db, "UPDATE familias_material_almoxarifado SET tipo_uso = 'industrial' WHERE id = ?", [famPar.id]);
  await dbRun(db, "UPDATE categorias_material_almoxarifado SET tipo_uso = 'administrativo' WHERE id = ?", [catEpi.id]);
  await dbRun(db, "UPDATE categorias_material_almoxarifado SET tipo_uso = 'industrial' WHERE id = ?", [catChapa.id]);

  const matParafuso = await criarMaterial(db, { codigo: 'PAR-001', nome: 'Parafuso M8', familiaId: famPar.id });
  const matEpi = await criarMaterial(db, { codigo: 'EPI-001', nome: 'Luva EPI', categoriaId: catEpi.id });
  const matChapa = await criarMaterial(db, { codigo: 'CHP-001', nome: 'Chapa 3mm', categoriaId: catChapa.id });

  await test('Administrativo não vê parafusos industriais', async () => {
    const rows = await materiaisFiltrados(db, 'Administrativo');
    const ids = rows.map((r) => r.id);
    assert.ok(!ids.includes(matParafuso));
    assert.ok(!ids.includes(matChapa));
  });

  await test('Administrativo vê EPIs por tipo_uso administrativo', async () => {
    const rows = await materiaisFiltrados(db, 'Administrativo');
    const ids = rows.map((r) => r.id);
    assert.ok(ids.includes(matEpi));
  });

  await test('Produção não vê EPIs administrativos', async () => {
    const rows = await materiaisFiltrados(db, 'Produção');
    const ids = rows.map((r) => r.id);
    assert.ok(!ids.includes(matEpi));
    assert.ok(ids.includes(matParafuso) || ids.includes(matChapa));
  });

  await test('Comercial vê materiais administrativos sem whitelist explícita', async () => {
    const setorComercial = await dbGet(db, "SELECT id FROM setores_requisicao_almoxarifado WHERE nome = 'Comercial'");
    await dbRun(db, 'DELETE FROM setor_material_permitido WHERE setor_id = ?', [setorComercial.id]);
    const rows = await materiaisFiltrados(db, 'Comercial');
    const ids = rows.map((r) => r.id);
    assert.ok(ids.includes(matEpi), 'Comercial deve ver EPI administrativo');
    assert.ok(!ids.includes(matParafuso), 'Comercial não deve ver parafuso industrial');
    assert.ok(!ids.includes(matChapa), 'Comercial não deve ver chapa industrial');
  });

  await test('Compras vê materiais administrativos mesmo com regras globais', async () => {
    const setorCompras = await dbGet(db, "SELECT id FROM setores_requisicao_almoxarifado WHERE nome = 'Compras'");
    await dbRun(db, 'DELETE FROM setor_material_permitido WHERE setor_id = ?', [setorCompras.id]);
    const global = await sectorMaterialService.hasGlobalPermissoes(db);
    assert.strictEqual(global, true);
    const rows = await materiaisFiltrados(db, 'Compras');
    const ids = rows.map((r) => r.id);
    assert.ok(ids.includes(matEpi));
    assert.ok(!ids.includes(matParafuso));
  });

  await test('getTipoSetor — Produção é industrial, Comercial é administrativo', async () => {
    assert.strictEqual(sectorMaterialService.getTipoSetor('Produção'), 'industrial');
    assert.strictEqual(sectorMaterialService.getTipoSetor('Comercial'), 'administrativo');
    assert.strictEqual(sectorMaterialService.getTipoSetor('Engenharia'), 'administrativo');
    assert.strictEqual(sectorMaterialService.getTipoSetor('Manutenção'), 'industrial');
  });

  await test('Almoxarifado sem filtro na listagem completa', async () => {
    const clause = await sectorMaterialService.buildMaterialFilterClause(db, 'Almoxarifado');
    assert.strictEqual(clause, null);
  });

  await test('validateMateriaisParaSetor bloqueia industrial em setor ADM', async () => {
    let erro = false;
    try {
      await sectorMaterialService.validateMateriaisParaSetor(db, 'Administrativo', [matParafuso]);
    } catch (e) {
      erro = e.status === 400;
    }
    assert.strictEqual(erro, true);
  });

  await test('Fallback tipo_uso quando não há regras globais', async () => {
    const db2 = new sqlite3.Database(':memory:');
    await initSchema(db2);
    await dbRun(db2, 'DELETE FROM setor_material_permitido');

    const famAdm = await dbRun(db2,
      "INSERT INTO familias_material_almoxarifado (codigo, nome, tipo_uso) VALUES ('CAN','Canetas','administrativo')");
    const famInd = await dbRun(db2,
      "INSERT INTO familias_material_almoxarifado (codigo, nome, tipo_uso) VALUES ('CHP','Chapas','industrial')");
    await criarMaterial(db2, { codigo: 'CAN-1', nome: 'Caneta', familiaId: famAdm.lastID });
    await criarMaterial(db2, { codigo: 'CHP-1', nome: 'Chapa', familiaId: famInd.lastID });

    const rows = await materiaisFiltrados(db2, 'Administrativo');
    assert.strictEqual(rows.length, 1);
    assert.strictEqual(rows[0].nome, 'Caneta');
    db2.close();
  });

  await test('Material legado sem família/categoria visível para setores administrativos', async () => {
    const matLegado = await criarMaterial(db, { codigo: 'LEG-001', nome: 'Material Legado' });
    const rowsAdm = await materiaisFiltrados(db, 'Comercial');
    assert.ok(rowsAdm.some((r) => r.id === matLegado));
    const rowsProd = await materiaisFiltrados(db, 'Produção');
    assert.ok(!rowsProd.some((r) => r.id === matLegado));
  });

  console.log(`\n📊 Resultado: ${passed} passou, ${failed} falhou\n`);
  db.close();
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((e) => { console.error(e); process.exit(1); });
