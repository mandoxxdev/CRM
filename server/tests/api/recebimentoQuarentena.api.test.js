/**
 * Etapa 5, Task 3 — entrada retida.
 *
 * Ate aqui, `darEntradaEstoque` RECUSAVA aprovar recebimento de item critico sem inspecao
 * previa, e pulava (nao entrava) o item que a inspecao marcasse para devolver. Isso negava
 * material que ja estava fisicamente no galpao desde o descarregamento, e o bloqueio da
 * inspecao recaia sobre saldo que ainda nem tinha entrado.
 *
 * Esta task inverte: o material entra sempre. O que exige inspecao (critico + config ligada)
 * entra RETIDO — sobe `quantidade_atual` (fisico) e `quantidade_em_inspecao` (fora do
 * disponivel) via QUARENTENA. A decisao de devolver passa a ser da inspecao (Task 4), com o
 * material ja dentro e bloqueado.
 */
const assert = require('assert');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet } = require('../../services/almoxarifado/db');
const stockService = require('../../services/almoxarifado/stockService');
const receiptService = require('../../services/almoxarifado/receiptService');

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
    [`QRT-${seq}`, `Material quarentena ${seq}`, qtd, critico ? 1 : 0]);
  return r.lastID;
}

async function recebimentoComItem(db, materialId, qtd) {
  // criarRecebimento ja deixa o recebimento em status 'RECEBIDO' — o unico status que
  // aprovarRecebimento aceita sem desviar para processarNota (EM_ENTRADA_NF/ENCAMINHADO_
  // FATURAMENTO) nem recusar (PROCESSADO/APROVADO).
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

(async () => {
  const { db, close } = await createTestApp({ user: ADMIN });

  await test('item critico entra no fisico mas fora do disponivel', async () => {
    await setConfig(db, 'inspecao_material_critico', '1');
    const mat = await novoMaterial(db, 0, { critico: true });
    const recId = await recebimentoComItem(db, mat, 20);

    await receiptService.aprovarRecebimento(db, ADMIN, recId);

    const m = await material(db, mat);
    assert.strictEqual(m.quantidade_atual, 20, 'o material esta no galpao, o fisico tem de subir');
    assert.strictEqual(m.quantidade_em_inspecao, 20, 'deveria ter entrado retido');
    assert.strictEqual(await disponivel(db, mat), 0, 'material a inspecionar nao pode estar disponivel');
  });

  await test('aprovar recebimento de item critico NAO exige inspecao previa (mudanca da Etapa 5)', async () => {
    await setConfig(db, 'inspecao_material_critico', '1');
    const mat = await novoMaterial(db, 0, { critico: true });
    const recId = await recebimentoComItem(db, mat, 5);
    // Antes da Etapa 5 isto lancava "Item critico #N requer inspecao".
    await receiptService.aprovarRecebimento(db, ADMIN, recId);
    const m = await material(db, mat);
    assert.strictEqual(m.quantidade_atual, 5);
  });

  await test('item NAO critico entra direto no disponivel (regressao)', async () => {
    const mat = await novoMaterial(db, 0, { critico: false });
    const recId = await recebimentoComItem(db, mat, 12);
    await receiptService.aprovarRecebimento(db, ADMIN, recId);
    const m = await material(db, mat);
    assert.strictEqual(m.quantidade_em_inspecao || 0, 0, 'material comum nao pode ser retido');
    assert.strictEqual(await disponivel(db, mat), 12);
  });

  await test('com a config desligada, material critico entra direto', async () => {
    await setConfig(db, 'inspecao_material_critico', '0');
    const mat = await novoMaterial(db, 0, { critico: true });
    const recId = await recebimentoComItem(db, mat, 7);
    await receiptService.aprovarRecebimento(db, ADMIN, recId);
    assert.strictEqual(await disponivel(db, mat), 7);
  });

  await test('a retencao aparece no livro como QUARENTENA vinculada ao recebimento', async () => {
    await setConfig(db, 'inspecao_material_critico', '1');
    const mat = await novoMaterial(db, 0, { critico: true });
    const recId = await recebimentoComItem(db, mat, 9);
    await receiptService.aprovarRecebimento(db, ADMIN, recId);
    const mov = await dbGet(db,
      `SELECT * FROM movimentacoes_almoxarifado WHERE material_id = ? AND tipo = 'QUARENTENA'`, [mat]);
    assert.ok(mov, 'retencao sem rastro no livro');
    assert.strictEqual(mov.recebimento_id, recId);
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
