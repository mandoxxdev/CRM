/**
 * Testes de disponibilidade de estoque e notificação de compras
 * Executar: node server/tests/stockAvailability.test.js
 */
const sqlite3 = require('sqlite3').verbose();
const assert = require('assert');
const { initSchema } = require('../services/almoxarifado/schema');
const { dbRun } = require('../services/almoxarifado/db');
const stockAvailability = require('../services/almoxarifado/stockAvailabilityService');
const purchaseNotify = require('../services/almoxarifado/requisitionPurchaseNotifyService');

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

async function criarMaterial(db, { codigo, nome, qty }) {
  const r = await dbRun(db,
    `INSERT INTO materiais_almoxarifado (codigo, nome, quantidade_atual, ativo) VALUES (?,?,?,1)`,
    [codigo, nome, qty]);
  return r.lastID;
}

async function run() {
  console.log('\n🧪 Testes disponibilidade de estoque e compras\n');

  await test('computeDisponibilidade — em estoque', async () => {
    const r = stockAvailability.computeDisponibilidade(10, 3);
    assert.strictEqual(r.disponibilidade, 'em_estoque');
    assert.strictEqual(r.saldo_suficiente, true);
    assert.strictEqual(r.disponibilidade_label, 'Em estoque');
  });

  await test('computeDisponibilidade — parcial', async () => {
    const r = stockAvailability.computeDisponibilidade(2, 3);
    assert.strictEqual(r.disponibilidade, 'parcial');
    assert.strictEqual(r.saldo_suficiente, false);
  });

  await test('computeDisponibilidade — sem estoque', async () => {
    const r = stockAvailability.computeDisponibilidade(0, 1);
    assert.strictEqual(r.disponibilidade, 'sem_estoque');
    assert.strictEqual(r.saldo_suficiente, false);
  });

  await test('sanitizeMaterialForSector remove quantidade_atual', async () => {
    const sanitized = stockAvailability.sanitizeMaterialForSector({
      id: 1,
      nome: 'Papel A4',
      quantidade_atual: 15,
      custo_unitario: 10,
    }, 5);
    assert.strictEqual(sanitized.quantidade_atual, undefined);
    assert.strictEqual(sanitized.custo_unitario, undefined);
    assert.strictEqual(sanitized.disponibilidade, 'em_estoque');
  });

  const db = await setupDb();
  const matId = await criarMaterial(db, { codigo: 'PAP-001', nome: 'Papel SOFIT A4', qty: 2 });

  await test('checkDisponibilidadeBatch — parcial e em estoque', async () => {
    const rows = await stockAvailability.checkDisponibilidadeBatch(db, [
      { material_id: matId, quantidade: 3 },
      { material_id: matId, quantidade: 1 },
    ]);
    assert.strictEqual(rows[0].disponibilidade, 'parcial');
    assert.strictEqual(rows[1].disponibilidade, 'em_estoque');
  });

  await test('filterItensSemEstoqueCompleto', async () => {
    const itens = [
      { disponibilidade: 'em_estoque' },
      { disponibilidade: 'parcial' },
      { disponibilidade: 'sem_estoque' },
    ];
    const filtrados = stockAvailability.filterItensSemEstoqueCompleto(itens);
    assert.strictEqual(filtrados.length, 2);
  });

  await test('notifyComprasItensSemEstoque — skip sem e-mails', async () => {
    const r = await purchaseNotify.notifyComprasItensSemEstoque(
      db,
      { numero: 'REQ-001', setor: 'Projetos', solicitante_nome: 'Mateus' },
      [{ material_id: matId, quantidade_solicitada: 5 }],
      'matheus@gmp.ind.br',
    );
    assert.strictEqual(r.skipped, true);
    assert.strictEqual(r.motivo, 'sem_destinatarios');
  });

  await test('notifyComprasItensSemEstoque — skip todos em estoque', async () => {
    await dbRun(db,
      `INSERT INTO configuracoes_almoxarifado (chave, valor) VALUES (?, ?)
       ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor`,
      [purchaseNotify.COMPRAS_EMAILS_KEY, JSON.stringify(['compras@gmp.ind.br'])]);
    const r = await purchaseNotify.notifyComprasItensSemEstoque(
      db,
      { numero: 'REQ-002', setor: 'Projetos', solicitante_nome: 'Mateus' },
      [{ material_id: matId, quantidade_solicitada: 1 }],
      'matheus@gmp.ind.br',
    );
    assert.strictEqual(r.skipped, true);
    assert.strictEqual(r.motivo, 'todos_em_estoque');
  });

  await test('buildComprasMensagem — HTML com itens', async () => {
    const msg = purchaseNotify.buildComprasMensagem(
      { numero: 'REQ-003', setor: 'Engenharia', os_referencia: 'Proj-42', solicitante_nome: 'Ana' },
      [{ material_nome: 'Papel A4', material_codigo: 'PAP-001', quantidade: 5, unidade: 'CX', disponibilidade: 'sem_estoque' }],
      'https://systemgmp.online',
    );
    assert.ok(msg.assunto.includes('REQ-003'));
    assert.ok(msg.html.includes('Papel A4'));
    assert.ok(msg.html.includes('Sem estoque'));
    assert.ok(msg.text.includes('Proj-42'));
  });

  console.log(`\n📊 Resultado: ${passed} passou, ${failed} falhou\n`);
  db.close();
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((e) => { console.error(e); process.exit(1); });
