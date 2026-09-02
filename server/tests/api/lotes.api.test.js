const assert = require('assert');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
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
    [`LOT-${seq}`, `Material lote ${seq}`, qtd]);
  return r.lastID;
}

(async () => {
  const { db, close } = await createTestApp({ user: ADMIN });

  await test('criar lote grava os dados da NF e nasce ATIVO', async () => {
    const mat = await novoMaterial(db);
    const lote = await lotService.criarOuObterLote(db, ADMIN, {
      material_id: mat, codigo: 'L-001', fornecedor_nome: 'Acme Acos',
      corrida: 'HEAT-99', data_validade: '2030-01-31', nota_fiscal: '12345',
    });
    assert.strictEqual(lote.codigo, 'L-001');
    assert.strictEqual(lote.fornecedor_nome, 'Acme Acos');
    assert.strictEqual(lote.corrida, 'HEAT-99');
    assert.strictEqual(lote.nota_fiscal, '12345');
    assert.strictEqual(lote.status, 'ATIVO', 'lote deveria nascer ATIVO');
  });

  await test('criar duas vezes o mesmo codigo devolve o mesmo lote, sem duplicar', async () => {
    const mat = await novoMaterial(db);
    const a = await lotService.criarOuObterLote(db, ADMIN, { material_id: mat, codigo: 'L-DUP', corrida: 'H1' });
    const b = await lotService.criarOuObterLote(db, ADMIN, { material_id: mat, codigo: 'L-DUP', corrida: 'H2' });
    assert.strictEqual(a.id, b.id, 'criou um segundo lote com o mesmo codigo');
    assert.strictEqual(b.corrida, 'H1', 'a segunda chamada sobrescreveu os dados do lote existente');
    const linhas = await dbAll(db, 'SELECT id FROM lotes_almoxarifado WHERE material_id = ? AND codigo = ?', [mat, 'L-DUP']);
    assert.strictEqual(linhas.length, 1);
  });

  await test('o mesmo codigo em materiais diferentes sao lotes diferentes', async () => {
    const matA = await novoMaterial(db);
    const matB = await novoMaterial(db);
    const a = await lotService.criarOuObterLote(db, ADMIN, { material_id: matA, codigo: 'MESMO' });
    const b = await lotService.criarOuObterLote(db, ADMIN, { material_id: matB, codigo: 'MESMO' });
    assert.notStrictEqual(a.id, b.id);
  });

  await test('lote sem codigo e recusado', async () => {
    const mat = await novoMaterial(db);
    await assert.rejects(() => lotService.criarOuObterLote(db, ADMIN, { material_id: mat, codigo: '  ' }),
      /codigo/i);
  });

  await test('status invalido em criarOuObterLote e recusado; status ausente nasce ATIVO', async () => {
    const mat = await novoMaterial(db);
    await assert.rejects(() => lotService.criarOuObterLote(db, ADMIN,
      { material_id: mat, codigo: 'L-STATUS-INVALIDO', status: 'CANCELADO' }), /status/i);
    const linhas = await dbAll(db,
      'SELECT id FROM lotes_almoxarifado WHERE material_id = ? AND codigo = ?', [mat, 'L-STATUS-INVALIDO']);
    assert.strictEqual(linhas.length, 0, 'status invalido nao deveria ter criado o lote');

    const semStatus = await lotService.criarOuObterLote(db, ADMIN, { material_id: mat, codigo: 'L-STATUS-AUSENTE' });
    assert.strictEqual(semStatus.status, 'ATIVO', 'omitir status deveria nascer ATIVO');
  });

  await test('vencido e derivado da data, nao e status gravado', async () => {
    const mat = await novoMaterial(db);
    const vencido = await lotService.criarOuObterLote(db, ADMIN, {
      material_id: mat, codigo: 'L-VENC', data_validade: '2020-01-01' });
    assert.strictEqual(vencido.status, 'ATIVO', 'status nao deve virar VENCIDO');
    assert.strictEqual(lotService.isVencido(vencido), true);

    const semValidade = await lotService.criarOuObterLote(db, ADMIN, {
      material_id: mat, codigo: 'L-SEM-VALIDADE' });
    assert.strictEqual(lotService.isVencido(semValidade), false, 'lote sem validade nao vence');
  });

  await test('mudar status audita e exige justificativa', async () => {
    const mat = await novoMaterial(db);
    const lote = await lotService.criarOuObterLote(db, ADMIN, { material_id: mat, codigo: 'L-STATUS' });

    await assert.rejects(() => lotService.mudarStatusLote(db, ADMIN, lote.id, 'BLOQUEADO', '   '),
      /justificativa/i);
    const intacto = await lotService.getLote(db, lote.id);
    assert.strictEqual(intacto.status, 'ATIVO', 'bloqueou mesmo recusando');

    const bloqueado = await lotService.mudarStatusLote(db, ADMIN, lote.id, 'BLOQUEADO', 'certificado ilegivel');
    assert.strictEqual(bloqueado.status, 'BLOQUEADO');
    assert.strictEqual(bloqueado.status_motivo, 'certificado ilegivel');

    const log = await dbGet(db,
      `SELECT * FROM auditoria_log_almoxarifado WHERE entidade = 'lote' AND entidade_id = ? ORDER BY id DESC LIMIT 1`,
      [lote.id]);
    assert.ok(log, 'mudanca de status nao foi auditada');
    assert.strictEqual(log.justificativa, 'certificado ilegivel');
    assert.strictEqual(JSON.parse(log.dados_anteriores).status, 'ATIVO');
    assert.strictEqual(JSON.parse(log.dados_novos).status, 'BLOQUEADO');
  });

  await test('status invalido e recusado', async () => {
    const mat = await novoMaterial(db);
    const lote = await lotService.criarOuObterLote(db, ADMIN, { material_id: mat, codigo: 'L-INVALIDO' });
    await assert.rejects(() => lotService.mudarStatusLote(db, ADMIN, lote.id, 'VENCIDO', 'tentativa'),
      /status/i);
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
