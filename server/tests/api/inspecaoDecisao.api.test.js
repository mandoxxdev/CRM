/**
 * Etapa 5, Task 4 — inspectionService decide a inspecao pelo motor.
 *
 * Ate aqui, `receiptService.inspecionarItem` fazia um UPDATE SQL direto que somava a MESMA
 * quantidade em `quantidade_bloqueada` E `quantidade_em_inspecao` — bloquear 10 tirava 20 do
 * disponivel (as duas colunas sao subtraidas por getSaldoDisponivel), sem passar pelo motor,
 * sem gerar movimentacao, sem existir no livro. Esta task cria `inspectionService`, que decide
 * aprovar/reprovar/parcial via `registrarMovimentacao` (LIBERACAO_INSPECAO/REPROVACAO_INSPECAO,
 * Task 1), e remove `inspecionarItem` por inteiro.
 */
const assert = require('assert');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet } = require('../../services/almoxarifado/db');
const stockService = require('../../services/almoxarifado/stockService');
const receiptService = require('../../services/almoxarifado/receiptService');
const inspectionService = require('../../services/almoxarifado/inspectionService');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

const ADMIN = { id: 1, nome: 'Admin Teste', role: 'admin' };

let seq = 0;
async function novoMaterial(db, qtd = 0, { critico = false } = {}) {
  seq += 1;
  const r = await dbRun(db,
    `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, ativo, material_critico)
     VALUES (?,?,'UN',?,1,?)`,
    [`INSP-${seq}`, `Material inspecao ${seq}`, qtd, critico ? 1 : 0]);
  return r.lastID;
}

async function recebimentoComItem(db, materialId, qtd) {
  // Mesmo caminho de producao usado em recebimentoQuarentena.api.test.js (Task 3):
  // criarRecebimento ja deixa o recebimento em 'RECEBIDO', unico status que aprovarRecebimento
  // aceita sem desviar para processarNota nem recusar.
  const rec = await receiptService.criarRecebimento(db, ADMIN, {
    nota_fiscal: `NF-${Date.now()}-${materialId}`,
    itens: [{ material_id: materialId, quantidade: qtd }],
  });
  return rec.id;
}

const setConfig = (db, chave, valor) => dbRun(db,
  `INSERT INTO configuracoes_almoxarifado (chave, valor) VALUES (?,?)
   ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor`, [chave, valor]);

const material = (db, id) => dbGet(db, 'SELECT * FROM materiais_almoxarifado WHERE id = ?', [id]);
const disponivel = async (db, id) => stockService.getSaldoDisponivel(await material(db, id));

// Cria material critico + recebimento + aprova (entra retido, via QUARENTENA da Task 3), e
// devolve o item pronto para decidirInspecao — exercita o fluxo real em vez de fabricar
// quantidade_em_inspecao na mao.
async function itemRetido(db, qtd) {
  await setConfig(db, 'inspecao_material_critico', '1');
  const mat = await novoMaterial(db, 0, { critico: true });
  const recId = await recebimentoComItem(db, mat, qtd);
  await receiptService.aprovarRecebimento(db, ADMIN, recId);
  const item = await dbGet(db,
    'SELECT id FROM recebimentos_material_itens_almoxarifado WHERE recebimento_id = ?', [recId]);
  return { mat, itemId: item.id, recId };
}

(async () => {
  const { db, close } = await createTestApp({ user: ADMIN });

  await test('aprovar tudo move o retido para o disponivel', async () => {
    const { mat, itemId } = await itemRetido(db, 20);
    await inspectionService.decidirInspecao(db, ADMIN, itemId, { quantidade_aprovada: 20, quantidade_reprovada: 0 });
    const m = await material(db, mat);
    assert.strictEqual(m.quantidade_em_inspecao, 0);
    assert.strictEqual(await disponivel(db, mat), 20);
  });

  await test('aprovar duas vezes nao duplica saldo', async () => {
    const { mat, itemId } = await itemRetido(db, 20);
    await inspectionService.decidirInspecao(db, ADMIN, itemId, { quantidade_aprovada: 20, quantidade_reprovada: 0 });
    await assert.rejects(() => inspectionService.decidirInspecao(db, ADMIN, itemId,
      { quantidade_aprovada: 20, quantidade_reprovada: 0 }), /inspe|decid/i);
    assert.strictEqual(await disponivel(db, mat), 20, 'a segunda aprovacao criou saldo do nada');
  });

  await test('reprovar move o retido para bloqueado, sem tirar do galpao', async () => {
    const { mat, itemId } = await itemRetido(db, 20);
    await inspectionService.decidirInspecao(db, ADMIN, itemId, {
      quantidade_aprovada: 0, quantidade_reprovada: 20, observacoes: 'fora de medida' });
    const m = await material(db, mat);
    assert.strictEqual(m.quantidade_em_inspecao, 0);
    assert.strictEqual(m.quantidade_bloqueada, 20);
    assert.strictEqual(m.quantidade_atual, 20);
    assert.strictEqual(await disponivel(db, mat), 0);
  });

  await test('aprovacao parcial divide entre disponivel e bloqueado', async () => {
    const { mat, itemId } = await itemRetido(db, 100);
    await inspectionService.decidirInspecao(db, ADMIN, itemId, {
      quantidade_aprovada: 90, quantidade_reprovada: 10, observacoes: '10 amassadas' });
    const m = await material(db, mat);
    assert.strictEqual(m.quantidade_em_inspecao, 0, 'sobrou saldo preso em quarentena');
    assert.strictEqual(m.quantidade_bloqueada, 10);
    assert.strictEqual(await disponivel(db, mat), 90);
  });

  await test('aprovado + reprovado tem de fechar com o retido', async () => {
    const { mat, itemId } = await itemRetido(db, 100);
    await assert.rejects(() => inspectionService.decidirInspecao(db, ADMIN, itemId, {
      quantidade_aprovada: 50, quantidade_reprovada: 10 }), /confer|fecha|retid/i);
    const m = await material(db, mat);
    assert.strictEqual(m.quantidade_em_inspecao, 100, 'mexeu no saldo apesar de recusar');
  });

  await test('reprovar registra o encaminhamento pretendido', async () => {
    const { itemId } = await itemRetido(db, 10);
    const r = await inspectionService.decidirInspecao(db, ADMIN, itemId, {
      quantidade_aprovada: 0, quantidade_reprovada: 10, encaminhamento: 'DEVOLVER' });
    const insp = await dbGet(db, 'SELECT * FROM inspecoes_recebimento_almoxarifado WHERE id = ?', [r.id]);
    assert.strictEqual(insp.encaminhamento, 'DEVOLVER');
    assert.strictEqual(insp.quantidade_reprovada, 10);
  });

  await test('encaminhamento invalido e recusado', async () => {
    const { itemId } = await itemRetido(db, 10);
    await assert.rejects(() => inspectionService.decidirInspecao(db, ADMIN, itemId, {
      quantidade_aprovada: 0, quantidade_reprovada: 10, encaminhamento: 'SUMIR_COM_ELE' }),
      /encaminhamento/i);
  });

  await test('bloqueio avulso tira do disponivel e deixa rastro', async () => {
    const mat = await novoMaterial(db, 50);
    await inspectionService.bloquearMaterial(db, ADMIN, mat, { quantidade: 8, justificativa: 'avaria na prateleira' });
    assert.strictEqual(await disponivel(db, mat), 42);
    const mov = await dbGet(db, `SELECT * FROM movimentacoes_almoxarifado WHERE material_id = ? AND tipo = 'BLOQUEIO'`, [mat]);
    assert.ok(mov, 'bloqueio avulso sem movimentacao no livro');
  });

  await test('desbloqueio avulso devolve ao disponivel', async () => {
    const mat = await novoMaterial(db, 50);
    await inspectionService.bloquearMaterial(db, ADMIN, mat, { quantidade: 8, justificativa: 'avaria' });
    await inspectionService.desbloquearMaterial(db, ADMIN, mat, { quantidade: 8, justificativa: 'recuperada' });
    assert.strictEqual(await disponivel(db, mat), 50);
  });

  await test('a fila de pendentes lista o que esta retido', async () => {
    const { mat } = await itemRetido(db, 15);
    const fila = await inspectionService.listarInspecoesPendentes(db, {});
    assert.ok(fila.some((l) => l.material_id === mat), 'item retido fora da fila');
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
