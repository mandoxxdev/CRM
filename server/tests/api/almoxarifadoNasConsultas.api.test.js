/**
 * Prova que toda consulta que já expunha localização passou a expor TAMBÉM
 * `almoxarifado_codigo` / `almoxarifado_nome` (contrato do client), preenchidos quando o
 * material/saldo tem localização vinculada a um almoxarifado e null quando não tem.
 *
 * A coluna materiais_almoxarifado.localizacao é um TEXT desnormalizado que NÃO carrega o
 * almoxarifado — os campos novos vêm de localizacao_padrao_id -> localizacoes_almoxarifado
 * -> almoxarifados (LEFT JOIN em cadeia, para não sumir com material sem localização).
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun } = require('../../services/almoxarifado/db');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

const ALM_CODIGO = 'ALM-CONS';
const ALM_NOME = 'Almoxarifado Consultas';

async function seed(db) {
  const almox = (await dbRun(db,
    `INSERT INTO almoxarifados (codigo, nome) VALUES (?,?)`, [ALM_CODIGO, ALM_NOME])).lastID;
  // Localização vinculada ao almoxarifado acima
  const loc = (await dbRun(db,
    `INSERT INTO localizacoes_almoxarifado (codigo, descricao, almoxarifado_id) VALUES ('ACQ-L1','Prateleira 1',?)`,
    [almox])).lastID;
  // Localização órfã (sem almoxarifado) — prova que a cadeia toda é LEFT JOIN
  const locSemAlmox = (await dbRun(db,
    `INSERT INTO localizacoes_almoxarifado (codigo, descricao, almoxarifado_id) VALUES ('ACQ-L2','Sem almox',NULL)`)).lastID;

  const familia = (await dbRun(db,
    `INSERT INTO familias_material_almoxarifado (codigo, nome) VALUES ('ACQ-FAM','Familia Consultas')`)).lastID;

  // COM localização vinculada a almoxarifado
  const matComLoc = (await dbRun(db,
    `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, localizacao, localizacao_padrao_id, familia_id, ativo)
     VALUES ('ACQ-001','Material ACQ com localizacao','UN',50,'ACQ-L1 — Prateleira 1',?,?,1)`,
    [loc, familia])).lastID;
  // SEM localização nenhuma
  const matSemLoc = (await dbRun(db,
    `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, localizacao, localizacao_padrao_id, familia_id, ativo)
     VALUES ('ACQ-002','Material ACQ sem localizacao','UN',20,NULL,NULL,?,1)`,
    [familia])).lastID;
  // COM localização, mas a localização não tem almoxarifado
  const matLocOrfa = (await dbRun(db,
    `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, localizacao, localizacao_padrao_id, familia_id, ativo)
     VALUES ('ACQ-003','Material ACQ localizacao orfa','UN',10,'ACQ-L2 — Sem almox',?,?,1)`,
    [locSemAlmox, familia])).lastID;

  return {
    almox, loc, locSemAlmox, familia, matComLoc, matSemLoc, matLocOrfa,
  };
}

function assertComAlmoxarifado(row, ctx) {
  assert.ok(row, `${ctx}: linha não encontrada`);
  assert.strictEqual(row.almoxarifado_codigo, ALM_CODIGO, `${ctx}: almoxarifado_codigo`);
  assert.strictEqual(row.almoxarifado_nome, ALM_NOME, `${ctx}: almoxarifado_nome`);
}

function assertSemAlmoxarifado(row, ctx) {
  assert.ok(row, `${ctx}: linha não encontrada`);
  assert.ok('almoxarifado_codigo' in row, `${ctx}: campo almoxarifado_codigo ausente do payload`);
  assert.ok('almoxarifado_nome' in row, `${ctx}: campo almoxarifado_nome ausente do payload`);
  assert.strictEqual(row.almoxarifado_codigo, null, `${ctx}: almoxarifado_codigo deveria ser null`);
  assert.strictEqual(row.almoxarifado_nome, null, `${ctx}: almoxarifado_nome deveria ser null`);
}

(async () => {
  const { app, db, close } = await createTestApp();
  const ids = await seed(db);

  await test('GET /materiais devolve almoxarifado_codigo/nome por item (e null sem localizacao)', async () => {
    const res = await request(app).get('/api/almoxarifado/materiais?search=Material ACQ');
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    const byCodigo = Object.fromEntries(res.body.map((m) => [m.codigo, m]));
    assertComAlmoxarifado(byCodigo['ACQ-001'], 'lista ACQ-001');
    assertSemAlmoxarifado(byCodigo['ACQ-002'], 'lista ACQ-002 (sem localizacao)');
    assertSemAlmoxarifado(byCodigo['ACQ-003'], 'lista ACQ-003 (localizacao sem almoxarifado)');
    // O LEFT JOIN não pode ter derrubado nenhum material da lista
    assert.strictEqual(res.body.length, 3, 'lista deveria trazer os 3 materiais');
  });

  await test('GET /materiais/:id devolve almoxarifado_codigo/nome', async () => {
    const res = await request(app).get(`/api/almoxarifado/materiais/${ids.matComLoc}`);
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assertComAlmoxarifado(res.body, 'detalhe com localizacao');
  });

  await test('GET /materiais/:id sem localizacao devolve os campos como null', async () => {
    const res = await request(app).get(`/api/almoxarifado/materiais/${ids.matSemLoc}`);
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assertSemAlmoxarifado(res.body, 'detalhe sem localizacao');
  });

  await test('GET /familias/:id/itens devolve almoxarifado_codigo/nome por item', async () => {
    const res = await request(app).get(`/api/almoxarifado/familias/${ids.familia}/itens`);
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.strictEqual(res.body.length, 3, 'itens da familia');
    const byCodigo = Object.fromEntries(res.body.map((m) => [m.codigo, m]));
    assertComAlmoxarifado(byCodigo['ACQ-001'], 'itens familia ACQ-001');
    assertSemAlmoxarifado(byCodigo['ACQ-002'], 'itens familia ACQ-002');
  });

  await test('GET /conferencias/:id devolve almoxarifado_codigo/nome por item conferido', async () => {
    const conf = (await dbRun(db,
      `INSERT INTO conferencias_almoxarifado (numero, status) VALUES ('CONF-ACQ-1','ABERTO')`)).lastID;
    await dbRun(db,
      `INSERT INTO itens_conferencia_almoxarifado (conferencia_id, material_id, quantidade_sistema) VALUES (?,?,50)`,
      [conf, ids.matComLoc]);
    await dbRun(db,
      `INSERT INTO itens_conferencia_almoxarifado (conferencia_id, material_id, quantidade_sistema) VALUES (?,?,20)`,
      [conf, ids.matSemLoc]);

    const res = await request(app).get(`/api/almoxarifado/conferencias/${conf}`);
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.strictEqual(res.body.itens.length, 2, 'itens da conferencia');
    const byCodigo = Object.fromEntries(res.body.itens.map((i) => [i.material_codigo, i]));
    assertComAlmoxarifado(byCodigo['ACQ-001'], 'conferencia ACQ-001');
    assertSemAlmoxarifado(byCodigo['ACQ-002'], 'conferencia ACQ-002');
  });

  await test('GET /requisicoes/:id devolve almoxarifado_codigo/nome por item requisitado', async () => {
    const req_id = (await dbRun(db,
      `INSERT INTO requisicoes_almoxarifado (numero, solicitante_id, solicitante_nome, status)
       VALUES ('REQ-ACQ-1', 1, 'Admin Teste', 'PENDENTE')`)).lastID;
    await dbRun(db,
      `INSERT INTO itens_requisicao_almoxarifado (requisicao_id, material_id, quantidade_solicitada) VALUES (?,?,5)`,
      [req_id, ids.matComLoc]);
    await dbRun(db,
      `INSERT INTO itens_requisicao_almoxarifado (requisicao_id, material_id, quantidade_solicitada) VALUES (?,?,3)`,
      [req_id, ids.matSemLoc]);

    const res = await request(app).get(`/api/almoxarifado/requisicoes/${req_id}`);
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.strictEqual(res.body.itens.length, 2, 'itens da requisicao');
    const byCodigo = Object.fromEntries(res.body.itens.map((i) => [i.material_codigo, i]));
    assertComAlmoxarifado(byCodigo['ACQ-001'], 'requisicao ACQ-001');
    assertSemAlmoxarifado(byCodigo['ACQ-002'], 'requisicao ACQ-002');
  });

  await test('GET /estoque/:materialId/saldos devolve almoxarifado da localizacao do saldo', async () => {
    // saldo na localização COM almoxarifado + saldo na localização SEM almoxarifado:
    // aqui o vínculo é pela localização da PRÓPRIA linha de saldo, não pela padrão do material.
    await dbRun(db,
      `INSERT INTO estoque_saldo_almoxarifado (material_id, localizacao_id, quantidade) VALUES (?,?,30)`,
      [ids.matComLoc, ids.loc]);
    await dbRun(db,
      `INSERT INTO estoque_saldo_almoxarifado (material_id, localizacao_id, quantidade) VALUES (?,?,20)`,
      [ids.matComLoc, ids.locSemAlmox]);

    const res = await request(app).get(`/api/almoxarifado/estoque/${ids.matComLoc}/saldos`);
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    const byLoc = Object.fromEntries(res.body.map((s) => [s.localizacao_codigo, s]));
    assertComAlmoxarifado(byLoc['ACQ-L1'], 'saldo em ACQ-L1');
    assertSemAlmoxarifado(byLoc['ACQ-L2'], 'saldo em ACQ-L2 (localizacao sem almoxarifado)');
  });

  await test('GET /materiais/:id/extrato traz almoxarifado no material e nos saldos', async () => {
    const res = await request(app).get(`/api/almoxarifado/materiais/${ids.matComLoc}/extrato`);
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assertComAlmoxarifado(res.body.material, 'extrato: cabecalho do material');
    const byLoc = Object.fromEntries(res.body.saldos_localizacao.map((s) => [s.localizacao_codigo, s]));
    assertComAlmoxarifado(byLoc['ACQ-L1'], 'extrato: saldo em ACQ-L1');
    assertSemAlmoxarifado(byLoc['ACQ-L2'], 'extrato: saldo em ACQ-L2');
  });

  await test('GET /materiais/:id/extrato de material sem localizacao traz campos null', async () => {
    const res = await request(app).get(`/api/almoxarifado/materiais/${ids.matSemLoc}/extrato`);
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assertSemAlmoxarifado(res.body.material, 'extrato sem localizacao');
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
