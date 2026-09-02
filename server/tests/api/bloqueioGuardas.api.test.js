const assert = require('assert');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet } = require('../../services/almoxarifado/db');
const stockService = require('../../services/almoxarifado/stockService');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}
const ADMIN = { id: 1, nome: 'Admin Teste', role: 'admin' };

let seq = 0;
async function novoMaterial(db, qtd = 100) {
  seq += 1;
  const r = await dbRun(db,
    `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, ativo) VALUES (?,?,'UN',?,1)`,
    [`BLQ-${seq}`, `Material bloqueio ${seq}`, qtd]);
  return r.lastID;
}
const material = (db, id) => dbGet(db, 'SELECT * FROM materiais_almoxarifado WHERE id = ?', [id]);
const disponivel = async (db, id) => stockService.getSaldoDisponivel(await material(db, id));

(async () => {
  const { db, close } = await createTestApp({ user: ADMIN });

  await test('BLOQUEIO sem justificativa e recusado', async () => {
    const mat = await novoMaterial(db, 50);
    await assert.rejects(() => stockService.registrarMovimentacao(db, ADMIN, {
      material_id: mat, tipo: 'BLOQUEIO', quantidade: 5 }), /justificativa/i);
    const m = await material(db, mat);
    assert.strictEqual(m.quantidade_bloqueada || 0, 0, 'bloqueou mesmo recusando');
  });

  await test('DESBLOQUEIO acima do bloqueado falha em vez de saturar', async () => {
    const mat = await novoMaterial(db, 50);
    await stockService.registrarMovimentacao(db, ADMIN, {
      material_id: mat, tipo: 'BLOQUEIO', quantidade: 10, justificativa: 'peca amassada' });
    await assert.rejects(() => stockService.registrarMovimentacao(db, ADMIN, {
      material_id: mat, tipo: 'DESBLOQUEIO', quantidade: 30, justificativa: 'engano' }),
      /bloquead/i);
    const m = await material(db, mat);
    assert.strictEqual(m.quantidade_bloqueada, 10, 'saturou e perdeu o bloqueio');
  });

  await test('DESBLOQUEIO no valor exato devolve ao disponivel', async () => {
    const mat = await novoMaterial(db, 50);
    await stockService.registrarMovimentacao(db, ADMIN, {
      material_id: mat, tipo: 'BLOQUEIO', quantidade: 10, justificativa: 'avaria' });
    assert.strictEqual(await disponivel(db, mat), 40);
    await stockService.registrarMovimentacao(db, ADMIN, {
      material_id: mat, tipo: 'DESBLOQUEIO', quantidade: 10, justificativa: 'recuperada' });
    assert.strictEqual(await disponivel(db, mat), 50);
  });

  // REGRESSAO: returnService.js:31 e o unico chamador existente de BLOQUEIO. A funcao real e
  // registrarDevolucao (o nome "devolverParaQuarentena" do brief era ilustrativo). Ela passava
  // `motivo` e nao `justificativa` — sem o ajuste, a devolucao para quarentena quebra aqui.
  await test('devolucao para quarentena continua bloqueando (regressao returnService)', async () => {
    const returnService = require('../../services/almoxarifado/returnService');
    const mat = await novoMaterial(db, 50);
    await returnService.registrarDevolucao(db, ADMIN, {
      material_id: mat, quantidade: 8, motivo: 'DANIFICADO', destino: 'QUARENTENA' });
    const m = await material(db, mat);
    assert.strictEqual(m.quantidade_bloqueada, 8);
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
