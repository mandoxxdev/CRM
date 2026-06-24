/**
 * Testes do módulo Frotas
 * Executar: node server/tests/frotas.test.js
 */
const sqlite3 = require('sqlite3').verbose();
const assert = require('assert');
const { initSchema } = require('../services/frotas/schema');
const { dbRun, dbGet } = require('../services/frotas/db');
const frotasService = require('../services/frotas/frotasService');
const { can, PERFIS } = require('../services/frotas/permissions');

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

const userAdmin = { id: 1, nome: 'Admin', role: 'admin' };
const userMotorista = { id: 2, nome: 'Motorista', role: 'user', perfil_frota: PERFIS.MOTORISTA };
const userConsulta = { id: 3, nome: 'Consulta', role: 'user', perfil_frota: PERFIS.CONSULTA };

async function run() {
  console.log('\n🚛 Testes Frotas GMP\n');

  await test('schema cria tabelas e tipos de veículo', async () => {
    const db = await setupDb();
    const tipos = await dbGet(db, 'SELECT COUNT(*) as c FROM frotas_tipos_veiculo');
    assert(tipos.c >= 5);
    db.close();
  });

  await test('CRUD veículo', async () => {
    const db = await setupDb();
    const v = await frotasService.createVeiculo(db, { placa: 'ABC1D23', modelo: 'Strada', marca: 'Fiat', km_atual: 1000 });
    assert(v.placa === 'ABC1D23');
    const list = await frotasService.listVeiculos(db, { search: 'ABC' });
    assert(list.length === 1);
    await frotasService.updateVeiculo(db, v.id, { km_atual: 1500 });
    const updated = await frotasService.getVeiculo(db, v.id);
    assert(updated.km_atual === 1500);
    db.close();
  });

  await test('abastecimento atualiza km e calcula consumo', async () => {
    const db = await setupDb();
    const v = await frotasService.createVeiculo(db, { placa: 'XYZ9A87', km_atual: 1000 });
    await frotasService.createAbastecimento(db, userAdmin, {
      veiculo_id: v.id, data_abastecimento: '2025-01-01', litros: 40, valor_total: 200, km_abastecimento: 1000,
    });
    const ab2 = await frotasService.createAbastecimento(db, userAdmin, {
      veiculo_id: v.id, data_abastecimento: '2025-01-15', litros: 40, valor_total: 220, km_abastecimento: 1500,
    });
    assert(ab2.consumo_medio === 12.5);
    const veiculo = await frotasService.getVeiculo(db, v.id);
    assert(veiculo.km_atual === 1500);
    db.close();
  });

  await test('dashboard retorna KPIs', async () => {
    const db = await setupDb();
    await frotasService.createVeiculo(db, { placa: 'GMP0001', status: 'ativo' });
    const dash = await frotasService.getDashboard(db);
    assert(dash.totalVeiculos >= 1);
    assert(typeof dash.custoTotal === 'number');
    db.close();
  });

  await test('permissões internas frota', async () => {
    assert(can(userAdmin, 'gerenciar_veiculos') === true);
    assert(can(userMotorista, 'registrar_operacoes') === true);
    assert(can(userMotorista, 'gerenciar_veiculos') === false);
    assert(can(userConsulta, 'visualizar') === true);
    assert(can(userConsulta, 'registrar_operacoes') === false);
  });

  await test('checklist reprova quando item falha', async () => {
    const db = await setupDb();
    const v = await frotasService.createVeiculo(db, { placa: 'CHK1234' });
    const c = await frotasService.createChecklist(db, userAdmin, {
      veiculo_id: v.id, data_checklist: '2025-06-01', freios_ok: 0,
    });
    assert(c.aprovado === 0);
    db.close();
  });

  console.log(`\nResultado: ${passed} passou, ${failed} falhou\n`);
  process.exit(failed > 0 ? 1 : 0);
}

run();
