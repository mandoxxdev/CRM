/**
 * Etapa 10, Task 1 — RN-06: guarda de retencao do AJUSTE (e do novo AJUSTE_INVENTARIO).
 *
 * Resolve a lacuna nomeada desde a Etapa 7/8/8b (docs/almoxarifado-novidades-por-etapa.md, itens
 * B1-B3): ate aqui um AJUSTE (ou o ajuste que a conclusao da conferencia de inventario grava por
 * fora do motor) podia levar quantidade_atual para menos do que esta bloqueado/reservado/em
 * inspecao/em terceiros, deixando o disponivel negativo por inconsistencia interna dos dados —
 * categoria diferente de "aceito vender mais do que tenho fisicamente"
 * (permite_saldo_negativo_global, que nao bypassa esta guarda de proposito).
 *
 * Executar: cd server && node tests/api/ajusteRetencao.api.test.js
 */
const assert = require('assert');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet } = require('../../services/almoxarifado/db');
const stockService = require('../../services/almoxarifado/stockService');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

(async () => {
  await test('RN-06: AJUSTE que deixaria bloqueado > total e recusado', async () => {
    const { db, close } = await createTestApp();
    const r = await dbRun(db, `INSERT INTO materiais_almoxarifado
      (codigo, nome, unidade, quantidade_atual, quantidade_bloqueada, ativo) VALUES
      ('MAT-BLQ', 'Material bloqueado', 'UN', 10, 8, 1)`);
    const materialId = r.lastID;
    await assert.rejects(
      // AJUSTE exige justificativa por REGRAS_VINCULO (achado da Fase 2 — sem isto o motivo do
      // 400 seria "AJUSTE exige justificativa", nao a guarda de retencao, e o assert do
      // regex/mensagem abaixo estouraria dentro do proprio validador do assert.rejects).
      stockService.registrarMovimentacao(db, { id: 1, nome: 'Teste' },
        { material_id: materialId, tipo: 'AJUSTE', quantidade: 5, motivo: 'contagem', justificativa: 'inventario' }),
      (err) => {
        assert.strictEqual(err.status, 400);
        assert.ok(/bloqueada/.test(err.message) && /8/.test(err.message), err.message);
        return true;
      });
    const m = await dbGet(db, 'SELECT quantidade_atual FROM materiais_almoxarifado WHERE id = ?', [materialId]);
    assert.strictEqual(m.quantidade_atual, 10, 'ajuste recusado nao pode ter mudado o saldo');
    await close();
  });

  await test('RN-06: AJUSTE_INVENTARIO tem a MESMA guarda (nao e segunda implementacao)', async () => {
    const { db, close } = await createTestApp();
    const r = await dbRun(db, `INSERT INTO materiais_almoxarifado
      (codigo, nome, unidade, quantidade_atual, quantidade_em_terceiros, ativo) VALUES
      ('MAT-TER', 'Material em terceiros', 'UN', 20, 15, 1)`);
    const materialId = r.lastID;
    await assert.rejects(
      stockService.registrarMovimentacao(db, { id: 1, nome: 'Teste' },
        { material_id: materialId, tipo: 'AJUSTE_INVENTARIO', quantidade: 10, motivo: 'conferencia', justificativa: 'conferencia INV-1' }),
      (err) => { assert.strictEqual(err.status, 400); return true; });
    await close();
  });

  await test('[CONTROLE POSITIVO] AJUSTE_INVENTARIO para valor >= retencao total passa normalmente', async () => {
    const { db, close } = await createTestApp();
    const r = await dbRun(db, `INSERT INTO materiais_almoxarifado
      (codigo, nome, unidade, quantidade_atual, quantidade_reservada, ativo) VALUES
      ('MAT-OK', 'Material ok', 'UN', 10, 3, 1)`);
    const materialId = r.lastID;
    const res = await stockService.registrarMovimentacao(db, { id: 1, nome: 'Teste' },
      { material_id: materialId, tipo: 'AJUSTE_INVENTARIO', quantidade: 3, motivo: 'conferencia', justificativa: 'conferencia INV-1' });
    assert.ok(res.id, 'ajuste valido tem de passar e devolver a movimentacao');
    const m = await dbGet(db, 'SELECT quantidade_atual FROM materiais_almoxarifado WHERE id = ?', [materialId]);
    assert.strictEqual(m.quantidade_atual, 3);
    await close();
  });

  await test('AJUSTE COM localizacao continua passando mesmo com retencao (guarda so no branch SEM localizacao)', async () => {
    // achado 1 da Fase 2: no codigo real (stockService.js:726-727) o branch de saldoPosterior nao
    // distinguia com/sem localizacao — sem o qualificador, este teste cairia (a guarda recusaria
    // uma contagem por endereco legitima). Prova o D1/D7 do design: a guarda de retencao NAO se
    // aplica ao ajuste com localizacao (fora do escopo desta etapa).
    const { db, close } = await createTestApp();
    // precedente exato: ajusteLocalizacao.api.test.js:28 — colunas sao codigo/descricao, nao "tipo"
    const loc = await dbRun(db, `INSERT INTO localizacoes_almoxarifado (codigo, descricao) VALUES ('LOC-1', 'Prateleira 1')`);
    const r = await dbRun(db, `INSERT INTO materiais_almoxarifado
      (codigo, nome, unidade, quantidade_atual, quantidade_reservada, ativo) VALUES
      ('MAT-LOC', 'Material com localizacao', 'UN', 10, 8, 1)`);
    const materialId = r.lastID;
    // ajuste de uma linha de localizacao para 2 (abaixo da retencao 8) tem de PASSAR: a guarda de
    // retencao nao olha para este branch de proposito.
    const res = await stockService.registrarMovimentacao(db, { id: 1, nome: 'Teste' },
      { material_id: materialId, tipo: 'AJUSTE', quantidade: 2, localizacao_destino_id: loc.lastID, justificativa: 'contagem por localizacao' });
    assert.ok(res.id, 'ajuste com localizacao nao pode ser barrado pela guarda de retencao (fora do escopo)');
    await close();
  });

  await test('AJUSTE_INVENTARIO nao e aceito pela rota generica de Movimentacoes (tipo dedicado)', async () => {
    const { app, db, close } = await createTestApp();
    const r = await dbRun(db, `INSERT INTO materiais_almoxarifado
      (codigo, nome, unidade, quantidade_atual, ativo) VALUES ('MAT-DED', 'Material', 'UN', 10, 1)`);
    const request = require('supertest');
    const res = await request(app).post('/api/almoxarifado/movimentacoes/v2')
      .send({ material_id: r.lastID, tipo: 'AJUSTE_INVENTARIO', quantidade: 5, motivo: 'x', justificativa: 'x' });
    assert.strictEqual(res.status, 400);
    await close();
  });

  await test('material de cliente com divergencia exige ajustar_material_cliente (Etapa 8, decisao 7)', async () => {
    const { db, close } = await createTestApp();
    // clientes usa razao_social, nao nome (achado ao verificar o schema antes do dispatch)
    const cli = await dbRun(db, `INSERT INTO clientes (razao_social) VALUES ('Cliente Teste LTDA')`);
    const r = await dbRun(db, `INSERT INTO materiais_almoxarifado
      (codigo, nome, unidade, quantidade_atual, proprietario_cliente_id, ativo) VALUES
      ('MAT-CLI', 'Material cliente', 'UN', 10, ?, 1)`, [cli.lastID]);
    await assert.rejects(
      stockService.registrarMovimentacao(db, { id: 9, nome: 'Gestor', perfil_almoxarifado: 'GESTOR' },
        { material_id: r.lastID, tipo: 'AJUSTE_INVENTARIO', quantidade: 8, motivo: 'conferencia', justificativa: 'conferencia INV-1' }),
      (err) => { assert.strictEqual(err.status, 403); return true; });
    await close();
  });

  await test('AJUSTE_INVENTARIO nao e cancelavel pela rota generica (RN-10)', async () => {
    const { app, db, close } = await createTestApp();
    const request = require('supertest');
    const r = await dbRun(db, `INSERT INTO materiais_almoxarifado
      (codigo, nome, unidade, quantidade_atual, ativo) VALUES ('MAT-CANC', 'Material', 'UN', 10, 1)`);
    const mov = await stockService.registrarMovimentacao(db, { id: 1, nome: 'Teste' },
      { material_id: r.lastID, tipo: 'AJUSTE_INVENTARIO', quantidade: 7, motivo: 'conferencia', justificativa: 'conferencia INV-1' });
    // CancelamentoSchema exige `motivo` (schemas.js:139-141) — mandar preenchido, senao o 400
    // provaria o Zod, nao a recusa de RN-10 que este teste existe para cobrir.
    const res = await request(app).post(`/api/almoxarifado/movimentacoes/${mov.id}/cancelar`).send({ motivo: 'engano' });
    assert.strictEqual(res.status, 400);
    assert.ok(/nova conferência/.test(res.body.error), res.body.error);
    await close();
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
