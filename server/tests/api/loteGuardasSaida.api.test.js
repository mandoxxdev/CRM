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
const JUST = { justificativa: 'teste de guarda de lote' };

let seq = 0;
async function novoMaterial(db, extra = '') {
  seq += 1;
  const r = await dbRun(db,
    `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, ativo${extra ? ', ' + extra : ''})
     VALUES (?,?,'UN',0,1${extra ? ', 1' : ''})`,
    [`GRD-${seq}`, `Material guarda ${seq}`]);
  return r.lastID;
}
async function entrar(db, materialId, loteId, qtd) {
  await stockService.registrarMovimentacao(db, ADMIN, {
    material_id: materialId, tipo: 'ENTRADA', quantidade: qtd, lote_id: loteId, motivo: 'setup' });
}
const saldoDoLote = (db, materialId, loteId) => dbGet(db,
  'SELECT quantidade FROM estoque_saldo_almoxarifado WHERE material_id = ? AND lote_id IS ?', [materialId, loteId]);

(async () => {
  const { db, close } = await createTestApp({ user: ADMIN });

  await test('saida acima do saldo do lote falha e nao deixa a linha negativa', async () => {
    const mat = await novoMaterial(db);
    const loteA = await lotService.criarOuObterLote(db, ADMIN, { material_id: mat, codigo: 'A' });
    const loteB = await lotService.criarOuObterLote(db, ADMIN, { material_id: mat, codigo: 'B' });
    await entrar(db, mat, loteA.id, 100);
    await entrar(db, mat, loteB.id, 2);

    await assert.rejects(() => stockService.registrarMovimentacao(db, ADMIN, {
      material_id: mat, tipo: 'SAIDA', quantidade: 10, lote_id: loteB.id, ...JUST }),
      /saldo/i, 'o motor aceitou tirar 10 de um lote que tem 2');

    const b = await saldoDoLote(db, mat, loteB.id);
    assert.strictEqual(b.quantidade, 2, `lote B ficou em ${b.quantidade} — a linha do lote foi negativada`);
    const m = await dbGet(db, 'SELECT quantidade_atual FROM materiais_almoxarifado WHERE id = ?', [mat]);
    assert.strictEqual(m.quantidade_atual, 102, 'o total do material foi alterado por uma saida recusada');
  });

  await test('saida dentro do saldo do lote passa e debita o lote certo', async () => {
    const mat = await novoMaterial(db);
    const loteA = await lotService.criarOuObterLote(db, ADMIN, { material_id: mat, codigo: 'A2' });
    const loteB = await lotService.criarOuObterLote(db, ADMIN, { material_id: mat, codigo: 'B2' });
    await entrar(db, mat, loteA.id, 100);
    await entrar(db, mat, loteB.id, 10);

    await stockService.registrarMovimentacao(db, ADMIN, {
      material_id: mat, tipo: 'SAIDA', quantidade: 4, lote_id: loteB.id, ...JUST });

    assert.strictEqual((await saldoDoLote(db, mat, loteB.id)).quantidade, 6);
    assert.strictEqual((await saldoDoLote(db, mat, loteA.id)).quantidade, 100, 'debitou o lote errado');
  });

  await test('saida de lote vencido falha', async () => {
    const mat = await novoMaterial(db);
    const lote = await lotService.criarOuObterLote(db, ADMIN, {
      material_id: mat, codigo: 'VENCIDO', data_validade: '2020-01-01' });
    await entrar(db, mat, lote.id, 50);
    await assert.rejects(() => stockService.registrarMovimentacao(db, ADMIN, {
      material_id: mat, tipo: 'SAIDA', quantidade: 1, lote_id: lote.id, ...JUST }), /vencid/i);
  });

  await test('saida de lote reprovado falha', async () => {
    const mat = await novoMaterial(db);
    const lote = await lotService.criarOuObterLote(db, ADMIN, { material_id: mat, codigo: 'REPROVADO' });
    await entrar(db, mat, lote.id, 50);
    await lotService.mudarStatusLote(db, ADMIN, lote.id, 'REPROVADO', 'falhou no ensaio');
    await assert.rejects(() => stockService.registrarMovimentacao(db, ADMIN, {
      material_id: mat, tipo: 'SAIDA', quantidade: 1, lote_id: lote.id, ...JUST }), /reprovad|bloquead/i);
  });

  await test('saida de lote bloqueado falha, e liberar o lote destrava', async () => {
    const mat = await novoMaterial(db);
    const lote = await lotService.criarOuObterLote(db, ADMIN, { material_id: mat, codigo: 'BLOQ' });
    await entrar(db, mat, lote.id, 50);
    await lotService.mudarStatusLote(db, ADMIN, lote.id, 'BLOQUEADO', 'aguardando certificado');
    await assert.rejects(() => stockService.registrarMovimentacao(db, ADMIN, {
      material_id: mat, tipo: 'SAIDA', quantidade: 1, lote_id: lote.id, ...JUST }), /bloquead/i);

    await lotService.mudarStatusLote(db, ADMIN, lote.id, 'ATIVO', 'certificado anexado');
    await stockService.registrarMovimentacao(db, ADMIN, {
      material_id: mat, tipo: 'SAIDA', quantidade: 1, lote_id: lote.id, ...JUST });
    assert.strictEqual((await saldoDoLote(db, mat, lote.id)).quantidade, 49);
  });

  await test('a movimentacao guarda lote_id e o codigo do lote', async () => {
    const mat = await novoMaterial(db);
    const lote = await lotService.criarOuObterLote(db, ADMIN, { material_id: mat, codigo: 'LEDGER-1' });
    await entrar(db, mat, lote.id, 5);
    const mov = await dbGet(db,
      'SELECT lote_id, lote FROM movimentacoes_almoxarifado WHERE material_id = ? ORDER BY id DESC LIMIT 1', [mat]);
    assert.strictEqual(mov.lote_id, lote.id);
    assert.strictEqual(mov.lote, 'LEDGER-1', 'o ledger precisa guardar o codigo, nao so o id');
  });

  await test('aceita o codigo do lote no lugar do id', async () => {
    const mat = await novoMaterial(db);
    const lote = await lotService.criarOuObterLote(db, ADMIN, { material_id: mat, codigo: 'POR-CODIGO' });
    await entrar(db, mat, lote.id, 20);
    await stockService.registrarMovimentacao(db, ADMIN, {
      material_id: mat, tipo: 'SAIDA', quantidade: 5, lote: 'POR-CODIGO', ...JUST });
    assert.strictEqual((await saldoDoLote(db, mat, lote.id)).quantidade, 15);
  });

  await test('codigo de lote inexistente na saida falha', async () => {
    const mat = await novoMaterial(db);
    await stockService.registrarMovimentacao(db, ADMIN, {
      material_id: mat, tipo: 'ENTRADA', quantidade: 10, motivo: 'setup' });
    await assert.rejects(() => stockService.registrarMovimentacao(db, ADMIN, {
      material_id: mat, tipo: 'SAIDA', quantidade: 1, lote: 'NAO-EXISTE', ...JUST }),
      /lote/i);
  });

  await test('material que permite saldo negativo continua podendo ficar negativo no lote', async () => {
    const mat = await novoMaterial(db);
    await dbRun(db, 'UPDATE materiais_almoxarifado SET permite_saldo_negativo = 1 WHERE id = ?', [mat]);
    const lote = await lotService.criarOuObterLote(db, ADMIN, { material_id: mat, codigo: 'NEG' });
    await entrar(db, mat, lote.id, 2);
    await stockService.registrarMovimentacao(db, ADMIN, {
      material_id: mat, tipo: 'SAIDA', quantidade: 10, lote_id: lote.id, ...JUST });
    assert.strictEqual((await saldoDoLote(db, mat, lote.id)).quantidade, -8,
      'a guarda por lote nao pode valer para material que permite saldo negativo');
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
