const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

async function criarMaterial(db, codigo, qtd = 100) {
  const r = await dbRun(db,
    `INSERT INTO materiais_almoxarifado (codigo, nome, quantidade_atual, ativo) VALUES (?,?,?,1)`,
    [codigo, `Material ${codigo}`, qtd]);
  return r.lastID;
}

(async () => {
  const { app, db, close } = await createTestApp();
  const matId = await criarMaterial(db, 'MOV-001', 100);

  await test('ENTRADA v1 soma saldo e responde contrato antigo', async () => {
    const res = await request(app).post('/api/almoxarifado/movimentacoes')
      .send({ material_id: matId, tipo: 'ENTRADA', quantidade: 50, motivo: 'Compra' });
    assert.strictEqual(res.status, 201, JSON.stringify(res.body));
    assert.strictEqual(res.body.saldo_anterior, 100);
    assert.strictEqual(res.body.saldo_posterior, 150);
  });

  await test('movimentação v1 grava auditoria (regra central da Etapa 0)', async () => {
    const rows = await dbAll(db,
      `SELECT * FROM auditoria_log_almoxarifado WHERE entidade = 'movimentacao'`);
    assert.ok(rows.length >= 1, 'nenhuma linha de auditoria gravada');
  });

  await test('SAIDA com motivo baixa saldo', async () => {
    const res = await request(app).post('/api/almoxarifado/movimentacoes')
      .send({ material_id: matId, tipo: 'SAIDA', quantidade: 30, motivo: 'Consumo OS 123' });
    assert.strictEqual(res.status, 201, JSON.stringify(res.body));
    assert.strictEqual(res.body.saldo_posterior, 120);
  });

  await test('SAIDA sem motivo retorna 400 (novo contrato, spec 13.3)', async () => {
    const res = await request(app).post('/api/almoxarifado/movimentacoes')
      .send({ material_id: matId, tipo: 'SAIDA', quantidade: 1 });
    assert.strictEqual(res.status, 400);
  });

  await test('SAIDA acima do saldo retorna 400 e não altera saldo', async () => {
    const res = await request(app).post('/api/almoxarifado/movimentacoes')
      .send({ material_id: matId, tipo: 'SAIDA', quantidade: 9999, motivo: 'teste' });
    assert.strictEqual(res.status, 400);
    const m = await dbGet(db, 'SELECT quantidade_atual FROM materiais_almoxarifado WHERE id = ?', [matId]);
    assert.strictEqual(m.quantidade_atual, 120);
  });

  await test('SAIDA respeita o disponível (reserva bloqueia consumo)', async () => {
    await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_reservada = 100 WHERE id = ?', [matId]);
    const res = await request(app).post('/api/almoxarifado/movimentacoes')
      .send({ material_id: matId, tipo: 'SAIDA', quantidade: 50, motivo: 'teste' }); // físico 120, disponível 20
    assert.strictEqual(res.status, 400);
    await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_reservada = 0 WHERE id = ?', [matId]);
  });

  await test('AJUSTE define o saldo diretamente (paridade v1)', async () => {
    const res = await request(app).post('/api/almoxarifado/movimentacoes')
      .send({ material_id: matId, tipo: 'AJUSTE', quantidade: 77, motivo: 'Inventário' });
    assert.strictEqual(res.status, 201, JSON.stringify(res.body));
    assert.strictEqual(res.body.saldo_posterior, 77);
  });

  await test('DEVOLUCAO soma saldo (paridade v1)', async () => {
    const res = await request(app).post('/api/almoxarifado/movimentacoes')
      .send({ material_id: matId, tipo: 'DEVOLUCAO', quantidade: 3, motivo: 'Sobra de OS' });
    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.body.saldo_posterior, 80);
  });

  await test('tipo inválido retorna 400', async () => {
    const res = await request(app).post('/api/almoxarifado/movimentacoes')
      .send({ material_id: matId, tipo: 'TRANSFERENCIA', quantidade: 1, motivo: 'x' });
    assert.strictEqual(res.status, 400);
  });

  await test('quantidade zero/negativa retorna 400', async () => {
    for (const q of [0, -5]) {
      const res = await request(app).post('/api/almoxarifado/movimentacoes')
        .send({ material_id: matId, tipo: 'ENTRADA', quantidade: q, motivo: 'x' });
      assert.strictEqual(res.status, 400, `quantidade ${q}`);
    }
  });

  await test('material inativo retorna 400', async () => {
    const inativo = await criarMaterial(db, 'MOV-INATIVO', 10);
    await dbRun(db, 'UPDATE materiais_almoxarifado SET ativo = 0 WHERE id = ?', [inativo]);
    const res = await request(app).post('/api/almoxarifado/movimentacoes')
      .send({ material_id: inativo, tipo: 'ENTRADA', quantidade: 1, motivo: 'x' });
    assert.strictEqual(res.status, 400);
  });

  await test('AJUSTE sincroniza saldo da localização padrão quando não há saldo por localização (regressão v1)', async () => {
    const loc = await dbRun(db,
      `INSERT INTO localizacoes_almoxarifado (codigo, descricao, setor, ativo) VALUES (?,?,?,1)`,
      ['LOC-AJT', 'Depósito Teste', 'Almoxarifado']);
    const locId = loc.lastID;
    const matAjuste = await dbRun(db,
      `INSERT INTO materiais_almoxarifado (codigo, nome, quantidade_atual, ativo, localizacao_padrao_id) VALUES (?,?,?,1,?)`,
      ['MOV-AJUSTE-LOC', 'Material Ajuste Loc', 20, locId]);
    const matAjusteId = matAjuste.lastID;

    const res = await request(app).post('/api/almoxarifado/movimentacoes')
      .send({ material_id: matAjusteId, tipo: 'AJUSTE', quantidade: 55, motivo: 'Inventário' });
    assert.strictEqual(res.status, 201, JSON.stringify(res.body));

    const saldo = await dbGet(db,
      'SELECT * FROM estoque_saldo_almoxarifado WHERE material_id = ? AND localizacao_id = ?',
      [matAjusteId, locId]);
    assert.ok(saldo, 'saldo por localização não foi criado/atualizado');
    assert.strictEqual(saldo.quantidade, 55);
  });

  await test('tipo desconhecido retorna 400', async () => {
    const res = await request(app).post('/api/almoxarifado/movimentacoes/v2')
      .send({ material_id: matId, tipo: 'FOO', quantidade: 1 });
    assert.strictEqual(res.status, 400, JSON.stringify(res.body));
  });

  await test('tipo ESTORNO nao pode ser criado diretamente', async () => {
    const res = await request(app).post('/api/almoxarifado/movimentacoes/v2')
      .send({ material_id: matId, tipo: 'ESTORNO', quantidade: 1 });
    assert.strictEqual(res.status, 400, JSON.stringify(res.body));
  });

  // Achado do review final da Etapa 5: a v2 tem gate `movimentar`, mas aceitava QUALQUER tipo do
  // motor. Um ALMOXARIFE que toma 403 em POST /materiais/:id/bloquear (gate `ajustar_estoque`)
  // conseguia o MESMO efeito mandando {tipo:'BLOQUEIO'} aqui — o gate da rota específica virava
  // decorativo. Pior com a quarentena: {tipo:'LIBERACAO_INSPECAO'} soltava retido sem permissão
  // `inspecionar`, sem registro de inspeção e sem baixar o retido do item (que ficava indecidível).
  await test('v2 recusa os tipos de retencao (so nascem dos servicos com o gate certo)', async () => {
    const retencao = ['RESERVA', 'LIBERACAO_RESERVA', 'BLOQUEIO', 'DESBLOQUEIO',
      'QUARENTENA', 'LIBERACAO_INSPECAO', 'REPROVACAO_INSPECAO', 'DECISAO_INSPECAO'];
    for (const tipo of retencao) {
      const res = await request(app).post('/api/almoxarifado/movimentacoes/v2')
        .send({ material_id: matId, tipo, quantidade: 1, justificativa: 'forjado' });
      assert.strictEqual(res.status, 400, `${tipo} deveria ser recusado: ${JSON.stringify(res.body)}`);
    }
    const m = await dbGet(db, 'SELECT * FROM materiais_almoxarifado WHERE id = ?', [matId]);
    assert.strictEqual(m.quantidade_reservada || 0, 0, 'v2 criou reserva');
    assert.strictEqual(m.quantidade_bloqueada || 0, 0, 'v2 bloqueou material sem ajustar_estoque');
    assert.strictEqual(m.quantidade_em_inspecao || 0, 0, 'v2 mexeu na quarentena sem inspecionar');
  });

  // A whitelist não pode fechar demais: os tipos que o formulário oferece e as variantes que
  // outras telas/relatórios usam continuam passando pela v2.
  await test('v2 continua aceitando os tipos operacionais do formulario', async () => {
    const mat = await criarMaterial(db, 'MOV-WL', 100);
    for (const tipo of ['ENTRADA', 'SAIDA', 'DEVOLUCAO', 'SAIDA_PRODUCAO', 'ENTRADA_COMPRA', 'SUCATA']) {
      const res = await request(app).post('/api/almoxarifado/movimentacoes/v2')
        .send({ material_id: mat, tipo, quantidade: 1, justificativa: 'operacao normal', os_id: 1 });
      assert.strictEqual(res.status, 201, `${tipo} deveria passar: ${JSON.stringify(res.body)}`);
    }
  });

  await test('livro registra saldo_anterior/saldo_posterior encadeados', async () => {
    const movs = await dbAll(db,
      `SELECT saldo_anterior, saldo_posterior FROM movimentacoes_almoxarifado
       WHERE material_id = ? AND cancelado = 0 ORDER BY id`, [matId]);
    for (let i = 1; i < movs.length; i++) {
      assert.strictEqual(movs[i].saldo_anterior, movs[i - 1].saldo_posterior,
        `quebra de encadeamento no movimento ${i}`);
    }
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
