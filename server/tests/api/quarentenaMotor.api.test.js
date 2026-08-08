/**
 * Contrato dos tipos de quarentena NO MOTOR (stockService.registrarMovimentacao) — chamada
 * direta, de proposito: nao ha rota que aceite esses tipos.
 *
 * Depois do review final da Etapa 5, POST /movimentacoes/v2 tem whitelist (TIPOS_MOVIMENTO_ROTA
 * em schemas.js) e recusa todo tipo de retencao — quem os cria sao os servicos com o gate certo:
 * QUARENTENA nasce de receiptService.aprovarRecebimento e DECISAO_INSPECAO de
 * inspectionService.decidirInspecao (ambos cobertos em recebimentoQuarentena/inspecaoDecisao).
 *
 * LIBERACAO_INSPECAO e REPROVACAO_INSPECAO ficaram SEM chamador de producao — a decisao passou a
 * ser um unico DECISAO_INSPECAO atomico, justamente para nao ter a janela entre "liberar" e
 * "reprovar". Os testes deles seguem valendo e NAO devem ser apagados: sao os ramos do motor que
 * provam as invariantes que o DECISAO_INSPECAO herda (guarda no WHERE em vez de MAX(0,...),
 * retencao nunca mexe no fisico, reprovar move de em_inspecao para bloqueada num movimento so).
 * Se um dia a decisao voltar a ser fatiada, o contrato ja esta testado aqui.
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
const ADMIN = { id: 1, nome: 'Admin Teste', role: 'admin' };

let seq = 0;
async function novoMaterial(db, qtd = 100) {
  seq += 1;
  const r = await dbRun(db,
    `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, ativo) VALUES (?,?,'UN',?,1)`,
    [`QUAR-${seq}`, `Material quarentena ${seq}`, qtd]);
  return r.lastID;
}
const material = (db, id) => dbGet(db, 'SELECT * FROM materiais_almoxarifado WHERE id = ?', [id]);
const disponivel = async (db, id) => stockService.getSaldoDisponivel(await material(db, id));

(async () => {
  const { db, close } = await createTestApp({ user: ADMIN });

  await test('QUARENTENA retem sem mexer no fisico', async () => {
    const mat = await novoMaterial(db, 100);
    await stockService.registrarMovimentacao(db, ADMIN, {
      material_id: mat, tipo: 'QUARENTENA', quantidade: 30, justificativa: 'Aguardando inspecao',
    });
    const m = await material(db, mat);
    assert.strictEqual(m.quantidade_atual, 100, 'fisico nao pode mudar');
    assert.strictEqual(m.quantidade_em_inspecao, 30);
    assert.strictEqual(await disponivel(db, mat), 70);
  });

  await test('material em quarentena nao pode sair', async () => {
    const mat = await novoMaterial(db, 100);
    await stockService.registrarMovimentacao(db, ADMIN, {
      material_id: mat, tipo: 'QUARENTENA', quantidade: 100, justificativa: 'Aguardando inspecao',
    });
    await assert.rejects(
      () => stockService.registrarMovimentacao(db, ADMIN, {
        material_id: mat, tipo: 'SAIDA', quantidade: 1, justificativa: 'tentativa',
      }),
      /insuficiente|disponivel|disponível/i,
      'quarentena que nao barra saida e decorativa');
  });

  await test('LIBERACAO_INSPECAO devolve ao disponivel', async () => {
    const mat = await novoMaterial(db, 100);
    await stockService.registrarMovimentacao(db, ADMIN, {
      material_id: mat, tipo: 'QUARENTENA', quantidade: 40, justificativa: 'x' });
    await stockService.registrarMovimentacao(db, ADMIN, {
      material_id: mat, tipo: 'LIBERACAO_INSPECAO', quantidade: 40, justificativa: 'aprovado' });
    const m = await material(db, mat);
    assert.strictEqual(m.quantidade_em_inspecao, 0);
    assert.strictEqual(m.quantidade_atual, 100, 'liberar nao cria material');
    assert.strictEqual(await disponivel(db, mat), 100);
  });

  await test('liberar mais do que esta retido falha e nao muda nada', async () => {
    const mat = await novoMaterial(db, 100);
    await stockService.registrarMovimentacao(db, ADMIN, {
      material_id: mat, tipo: 'QUARENTENA', quantidade: 10, justificativa: 'x' });
    await assert.rejects(() => stockService.registrarMovimentacao(db, ADMIN, {
      material_id: mat, tipo: 'LIBERACAO_INSPECAO', quantidade: 25, justificativa: 'demais' }),
      /inspe/i);
    const m = await material(db, mat);
    assert.strictEqual(m.quantidade_em_inspecao, 10, 'saturou em vez de recusar');
  });

  await test('REPROVACAO_INSPECAO move de em_inspecao para bloqueada num movimento so', async () => {
    const mat = await novoMaterial(db, 100);
    await stockService.registrarMovimentacao(db, ADMIN, {
      material_id: mat, tipo: 'QUARENTENA', quantidade: 25, justificativa: 'x' });
    await stockService.registrarMovimentacao(db, ADMIN, {
      material_id: mat, tipo: 'REPROVACAO_INSPECAO', quantidade: 25, justificativa: 'fora de medida' });
    const m = await material(db, mat);
    assert.strictEqual(m.quantidade_em_inspecao, 0);
    assert.strictEqual(m.quantidade_bloqueada, 25);
    assert.strictEqual(m.quantidade_atual, 100, 'reprovar nao tira o material do galpao');
    assert.strictEqual(await disponivel(db, mat), 75);
  });

  await test('os tres tipos deixam rastro no livro sem alterar o saldo fisico', async () => {
    const mat = await novoMaterial(db, 50);
    await stockService.registrarMovimentacao(db, ADMIN, {
      material_id: mat, tipo: 'QUARENTENA', quantidade: 5, justificativa: 'x' });
    const mov = await dbGet(db,
      `SELECT * FROM movimentacoes_almoxarifado WHERE material_id = ? AND tipo = 'QUARENTENA'`, [mat]);
    assert.ok(mov, 'quarentena tem de existir no livro');
    assert.strictEqual(mov.saldo_anterior, mov.saldo_posterior, 'nao mexe no fisico');
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
