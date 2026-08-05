/**
 * Testes para as três consultas de endereçamento (Etapa 2, Task 5)
 * Executar: node server/tests/api/enderecamento.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet } = require('../../services/almoxarifado/db');

let passed = 0;
let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

(async () => {
  const { app, db, close } = await createTestApp();

  // ── Test 1: endereco_completo é montado corretamente no GET /localizacoes ──
  await test('GET /api/almoxarifado/localizacoes inclui endereco_completo formatado', async () => {
    // Criar almoxarifado
    const almRes = await dbRun(db,
      `INSERT INTO almoxarifados (codigo, nome) VALUES ('ALM-TESTE', 'Almoxarifado Teste')`);
    const almoxarifado_id = almRes.lastID;

    // Criar uma localização "raiz" (setor)
    const setorRes = await dbRun(db,
      `INSERT INTO localizacoes_almoxarifado (codigo, setor, almoxarifado_id, ativo) VALUES ('SETOR-01', 'Setor A', ?, 1)`,
      [almoxarifado_id]);
    const setor_id = setorRes.lastID;

    // Criar uma localização "filho" (subgrupo sob o setor)
    const locRes = await dbRun(db,
      `INSERT INTO localizacoes_almoxarifado (codigo, setor, subgrupo, parent_id, almoxarifado_id, ativo) VALUES ('LOC-001', 'Setor A', 'Grupo X', ?, ?, 1)`,
      [setor_id, almoxarifado_id]);
    const loc_id = locRes.lastID;

    const res = await request(app).get('/api/almoxarifado/localizacoes');
    assert.strictEqual(res.status, 200);
    assert.ok(Array.isArray(res.body));

    // Encontrar a localização criada
    const loc = res.body.find(l => l.id === loc_id);
    assert.ok(loc, 'Localização criada deveria estar no resultado');
    assert.ok(loc.endereco_completo, 'endereco_completo não pode ser vazio');

    // Esperado: ALM-TESTE / Setor A / SETOR-01 / LOC-001
    // ou possivelmente: ALM-TESTE / Setor A / Grupo X / LOC-001 (dependendo se parent.codigo ou parent.subgrupo)
    // A spec diz: codigo do almoxarifado + setor + parent.codigo + codigo
    // Então deveria ser: ALM-TESTE / Setor A / SETOR-01 / LOC-001
    const expectedParts = ['ALM-TESTE', 'Setor A', 'SETOR-01', 'LOC-001'];
    const actualParts = loc.endereco_completo.split(' / ');
    assert.deepStrictEqual(actualParts, expectedParts,
      `endereco_completo="${loc.endereco_completo}" deveria ser "${expectedParts.join(' / ')}"`);
  });

  // ── Test 2: vazias lista apenas localizações sem nenhuma linha de saldo ──
  await test('GET /api/almoxarifado/localizacoes/vazias exclui localização com saldo > 0', async () => {
    // Criar dois materiais
    const mat1Res = await dbRun(db,
      `INSERT INTO materiais_almoxarifado (codigo, nome, ativo) VALUES ('VAZ-001', 'Material com Saldo', 1)`);
    const material_com_saldo = mat1Res.lastID;

    const mat2Res = await dbRun(db,
      `INSERT INTO materiais_almoxarifado (codigo, nome, ativo) VALUES ('VAZ-002', 'Material sem Saldo', 1)`);
    const material_sem_saldo = mat2Res.lastID;

    // Criar duas localizações
    const loc1Res = await dbRun(db,
      `INSERT INTO localizacoes_almoxarifado (codigo, descricao, ativo) VALUES ('VAZ-LOC-01', 'Com Saldo', 1)`);
    const loc_com_saldo = loc1Res.lastID;

    const loc2Res = await dbRun(db,
      `INSERT INTO localizacoes_almoxarifado (codigo, descricao, ativo) VALUES ('VAZ-LOC-02', 'Vazia', 1)`);
    const loc_vazia = loc2Res.lastID;

    // Inserir saldo em loc_com_saldo
    await dbRun(db,
      `INSERT INTO estoque_saldo_almoxarifado (material_id, localizacao_id, quantidade) VALUES (?, ?, 100)`,
      [material_com_saldo, loc_com_saldo]);

    // Não inserir nada em loc_vazia

    const res = await request(app).get('/api/almoxarifado/localizacoes/vazias');
    assert.strictEqual(res.status, 200);
    assert.ok(Array.isArray(res.body));

    // loc_com_saldo NÃO deve estar no resultado
    assert.ok(
      !res.body.find(l => l.id === loc_com_saldo),
      'Localização com saldo > 0 não deveria aparecer em vazias'
    );

    // loc_vazia DEVE estar no resultado
    assert.ok(
      res.body.find(l => l.id === loc_vazia),
      'Localização sem nenhuma linha de saldo deveria aparecer em vazias'
    );
  });

  // ── Test 3: materiais-sem-endereco lista materiais ativos com localizacao_padrao_id NULL ──
  await test('GET /api/almoxarifado/relatorios/materiais-sem-endereco lista corretamente', async () => {
    // Criar uma localização
    const locRes = await dbRun(db,
      `INSERT INTO localizacoes_almoxarifado (codigo, descricao, ativo) VALUES ('MSE-LOC-01', 'Localização', 1)`);
    const localizacao_id = locRes.lastID;

    // Material 1: ativo, sem localizacao_padrao_id, sem saldo com localização
    const mat1Res = await dbRun(db,
      `INSERT INTO materiais_almoxarifado (codigo, nome, ativo, localizacao_padrao_id) VALUES ('MSE-001', 'Sem Endereço', 1, NULL)`);
    const mat_sem_endereco = mat1Res.lastID;

    // Material 2: ativo, com localizacao_padrao_id (não deveria aparecer)
    const mat2Res = await dbRun(db,
      `INSERT INTO materiais_almoxarifado (codigo, nome, ativo, localizacao_padrao_id) VALUES ('MSE-002', 'Com Endereço', 1, ?)`,
      [localizacao_id]);
    const mat_com_endereco = mat2Res.lastID;

    // Material 3: inativo, sem localizacao_padrao_id (não deveria aparecer)
    const mat3Res = await dbRun(db,
      `INSERT INTO materiais_almoxarifado (codigo, nome, ativo, localizacao_padrao_id) VALUES ('MSE-003', 'Inativo', 0, NULL)`);
    const mat_inativo = mat3Res.lastID;

    // Material 4: ativo, sem localizacao_padrao_id, MAS com saldo em localização (não deveria aparecer)
    const mat4Res = await dbRun(db,
      `INSERT INTO materiais_almoxarifado (codigo, nome, ativo, localizacao_padrao_id) VALUES ('MSE-004', 'Tem Saldo em Locação', 1, NULL)`);
    const mat_com_saldo = mat4Res.lastID;
    await dbRun(db,
      `INSERT INTO estoque_saldo_almoxarifado (material_id, localizacao_id, quantidade) VALUES (?, ?, 50)`,
      [mat_com_saldo, localizacao_id]);

    const res = await request(app).get('/api/almoxarifado/relatorios/materiais-sem-endereco');
    assert.strictEqual(res.status, 200);
    assert.ok(Array.isArray(res.body));

    // mat_sem_endereco DEVE estar
    assert.ok(
      res.body.find(m => m.id === mat_sem_endereco),
      'Material ativo sem endereço deveria aparecer'
    );

    // mat_com_endereco NÃO deve estar
    assert.ok(
      !res.body.find(m => m.id === mat_com_endereco),
      'Material com localizacao_padrao_id não deveria aparecer'
    );

    // mat_inativo NÃO deve estar
    assert.ok(
      !res.body.find(m => m.id === mat_inativo),
      'Material inativo não deveria aparecer'
    );

    // mat_com_saldo NÃO deve estar (tem saldo com localização)
    assert.ok(
      !res.body.find(m => m.id === mat_com_saldo),
      'Material com saldo em localização não deveria aparecer'
    );
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
