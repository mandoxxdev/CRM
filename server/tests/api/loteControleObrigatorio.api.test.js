const assert = require('assert');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet } = require('../../services/almoxarifado/db');
const stockService = require('../../services/almoxarifado/stockService');
const lotService = require('../../services/almoxarifado/lotService');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}
const ADMIN = { id: 1, nome: 'Admin Teste', role: 'admin' };
const JUST = { justificativa: 'teste de controle de lote' };

let seq = 0;
async function novoMaterial(db, controlado) {
  seq += 1;
  const r = await dbRun(db,
    `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, ativo, controle_lote)
     VALUES (?,?,'UN',0,1,?)`, [`CTL-${seq}`, `Material controlado ${seq}`, controlado ? 1 : 0]);
  return r.lastID;
}

(async () => {
  const { db, close } = await createTestApp({ user: ADMIN });

  await test('entrada sem lote em material com controle_lote falha', async () => {
    const mat = await novoMaterial(db, true);
    await assert.rejects(() => stockService.registrarMovimentacao(db, ADMIN, {
      material_id: mat, tipo: 'ENTRADA', quantidade: 10, motivo: 'sem lote' }), /lote/i);
    const m = await dbGet(db, 'SELECT quantidade_atual FROM materiais_almoxarifado WHERE id = ?', [mat]);
    assert.strictEqual(m.quantidade_atual, 0, 'entrou estoque mesmo com a movimentacao recusada');
  });

  await test('saida sem lote em material com controle_lote falha', async () => {
    const mat = await novoMaterial(db, true);
    const lote = await lotService.criarOuObterLote(db, ADMIN, { material_id: mat, codigo: 'CTL-A' });
    await stockService.registrarMovimentacao(db, ADMIN, {
      material_id: mat, tipo: 'ENTRADA', quantidade: 10, lote_id: lote.id, motivo: 'setup' });
    await assert.rejects(() => stockService.registrarMovimentacao(db, ADMIN, {
      material_id: mat, tipo: 'SAIDA', quantidade: 1, ...JUST }), /lote/i);
  });

  await test('com lote, o material controlado movimenta normalmente', async () => {
    const mat = await novoMaterial(db, true);
    const lote = await lotService.criarOuObterLote(db, ADMIN, { material_id: mat, codigo: 'CTL-B' });
    await stockService.registrarMovimentacao(db, ADMIN, {
      material_id: mat, tipo: 'ENTRADA', quantidade: 10, lote_id: lote.id, motivo: 'setup' });
    await stockService.registrarMovimentacao(db, ADMIN, {
      material_id: mat, tipo: 'SAIDA', quantidade: 3, lote_id: lote.id, ...JUST });
    const m = await dbGet(db, 'SELECT quantidade_atual FROM materiais_almoxarifado WHERE id = ?', [mat]);
    assert.strictEqual(m.quantidade_atual, 7);
  });

  await test('material SEM controle_lote continua movimentando sem lote', async () => {
    const mat = await novoMaterial(db, false);
    await stockService.registrarMovimentacao(db, ADMIN, {
      material_id: mat, tipo: 'ENTRADA', quantidade: 10, motivo: 'sem controle' });
    await stockService.registrarMovimentacao(db, ADMIN, {
      material_id: mat, tipo: 'SAIDA', quantidade: 4, ...JUST });
    const m = await dbGet(db, 'SELECT quantidade_atual FROM materiais_almoxarifado WHERE id = ?', [mat]);
    assert.strictEqual(m.quantidade_atual, 6);
  });

  // AJUSTE e contagem de inventario: exigir lote nele travaria a regularizacao do saldo que
  // existe fisicamente sem lote conhecido — justamente o caminho de saida para quem ligou a flag
  // com estoque antigo em casa.
  await test('AJUSTE nao exige lote nem em material controlado', async () => {
    const mat = await novoMaterial(db, true);
    await stockService.registrarMovimentacao(db, ADMIN, {
      material_id: mat, tipo: 'AJUSTE', quantidade: 5, justificativa: 'contagem' });
    const m = await dbGet(db, 'SELECT quantidade_atual FROM materiais_almoxarifado WHERE id = ?', [mat]);
    assert.strictEqual(m.quantidade_atual, 5);
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
