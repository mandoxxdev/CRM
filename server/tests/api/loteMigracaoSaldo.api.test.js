const assert = require('assert');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const { initSchema } = require('../../services/almoxarifado/schema');
const stockService = require('../../services/almoxarifado/stockService');
const lotService = require('../../services/almoxarifado/lotService');

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
    [`MIG-${seq}`, `Material migracao ${seq}`, qtd]);
  return r.lastID;
}
const colunas = (db) => dbAll(db, `SELECT name FROM pragma_table_info('estoque_saldo_almoxarifado')`);

(async () => {
  const { db, close } = await createTestApp({ user: ADMIN });

  await test('saldo referencia o lote por id, nao por texto', async () => {
    const nomes = (await colunas(db)).map((c) => c.name);
    assert.ok(nomes.includes('lote_id'), 'faltou a coluna lote_id');
    assert.ok(!nomes.includes('lote'), 'a coluna lote TEXT deveria ter sido removida do saldo');
  });

  await test('as tres colunas de retencao sem escritor sumiram do saldo', async () => {
    const nomes = (await colunas(db)).map((c) => c.name);
    for (const morta of ['quantidade_reservada', 'quantidade_bloqueada', 'quantidade_em_inspecao']) {
      assert.ok(!nomes.includes(morta), `${morta} continua em estoque_saldo_almoxarifado`);
    }
  });

  await test('a chave unica impede duplicata mesmo com localizacao e lote nulos', async () => {
    const mat = await novoMaterial(db);
    await dbRun(db, 'INSERT INTO estoque_saldo_almoxarifado (material_id, quantidade) VALUES (?, 10)', [mat]);
    await assert.rejects(
      () => dbRun(db, 'INSERT INTO estoque_saldo_almoxarifado (material_id, quantidade) VALUES (?, 20)', [mat]),
      /UNIQUE|constraint/i,
      'dois NULL sao distintos para UNIQUE no SQLite — o indice com COALESCE deveria barrar');
  });

  await test('getOrCreateSaldo chaveia por lote_id e nao duplica', async () => {
    const mat = await novoMaterial(db);
    const lote = await lotService.criarOuObterLote(db, ADMIN, { material_id: mat, codigo: 'MIG-L1' });
    const a = await stockService.getOrCreateSaldo(db, mat, null, lote.id);
    const b = await stockService.getOrCreateSaldo(db, mat, null, lote.id);
    assert.strictEqual(a.id, b.id, 'criou duas linhas para o mesmo lote');
    const semLote = await stockService.getOrCreateSaldo(db, mat, null, null);
    assert.notStrictEqual(semLote.id, a.id, 'saldo sem lote e saldo com lote sao linhas diferentes');
  });

  await test('initSchema roda duas vezes sem quebrar (migracao idempotente)', async () => {
    await initSchema(db);
    await initSchema(db);
    const nomes = (await colunas(db)).map((c) => c.name);
    assert.ok(nomes.includes('lote_id'));
    assert.ok(!nomes.includes('quantidade_bloqueada'));
  });

  // REGRESSAO da Etapa 5: AJUSTE com localizacao passa por syncMaterialTotals. A retencao mora
  // em materiais_almoxarifado e tem de continuar intacta depois de mexer no saldo por localizacao.
  await test('AJUSTE por localizacao continua nao evaporando a quarentena', async () => {
    const loc = (await dbRun(db, `INSERT INTO localizacoes_almoxarifado (codigo, descricao) VALUES ('MIG-L','L')`)).lastID;
    const mat = await novoMaterial(db, 100);
    await dbRun(db, 'INSERT INTO estoque_saldo_almoxarifado (material_id, localizacao_id, quantidade) VALUES (?,?,100)', [mat, loc]);
    await stockService.registrarMovimentacao(db, ADMIN, {
      material_id: mat, tipo: 'QUARENTENA', quantidade: 100, justificativa: 'material critico aguardando inspecao' });
    await stockService.registrarMovimentacao(db, ADMIN, {
      material_id: mat, tipo: 'AJUSTE', quantidade: 100, localizacao_destino_id: loc, justificativa: 'contagem' });
    const m = await dbGet(db, 'SELECT * FROM materiais_almoxarifado WHERE id = ?', [mat]);
    assert.strictEqual(m.quantidade_em_inspecao, 100, 'AJUSTE liberou a quarentena');
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
