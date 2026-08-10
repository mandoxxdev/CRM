/**
 * Entrada de estoque do recebimento: pre-checagem e idempotencia por item.
 * Achado CRITICAL do review final da Etapa 6 (2026-08-10).
 *
 * O defeito: `darEntradaEstoque` percorria os itens chamando o motor um a um. Se o item B
 * falhasse no meio, os anteriores JA tinham entrado, o recebimento continuava em `EM_ENTRADA_NF` e
 * o botao "Processar Nota" continuava disponivel. Reproduzido pelo revisor: 1a tentativa entrou 10
 * do item A e falhou no B; corrigido o B, a 2a tentativa entrou MAIS 10 do A — total 20.
 *
 * Os testes abaixo medem os numeros dessa reproducao. Como nao ha transacao no modulo, a correcao
 * tem duas pontas e cada uma tem teste proprio:
 *   - pre-checagem (nota com item invalido e recusada INTEIRA, sem mover nada);
 *   - marca `entrada_estoque_em` por item (reprocessar nao credita de novo o que ja entrou), com o
 *     caso da marca sendo DEVOLVIDA quando a falha acontece antes da entrada fisica.
 */
const assert = require('assert');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const receiptService = require('../../services/almoxarifado/receiptService');
const lotService = require('../../services/almoxarifado/lotService');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}
const ADMIN = { id: 1, nome: 'Admin Teste', role: 'admin' };

let seq = 0;
async function novoMaterial(db, { ativo = 1, controleLote = 0 } = {}) {
  seq += 1;
  const r = await dbRun(db,
    `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, ativo, controle_lote)
     VALUES (?,?,'UN',0,?,?)`, [`ATM-${seq}`, `Material atomico ${seq}`, ativo, controleLote]);
  return r.lastID;
}

/** Recebimento pronto para processar, com N itens. */
async function recebimentoCom(db, itens) {
  seq += 1;
  const rec = await dbRun(db, `INSERT INTO recebimentos_material_almoxarifado
    (numero, status, nota_fiscal, fornecedor_nome, data_emissao_nf, data_entrada_nf, valor_total_nota)
    VALUES (?, 'EM_ENTRADA_NF', ?, 'Acme Acos', '2026-08-01', '2026-08-02', 1000)`,
    [`REC-ATM-${seq}`, `NF-ATM-${seq}`]);
  for (const it of itens) {
    await dbRun(db, `INSERT INTO recebimentos_material_itens_almoxarifado
      (recebimento_id, material_id, quantidade_esperada, quantidade_recebida, lote)
      VALUES (?,?,?,?,?)`, [rec.lastID, it.material_id, it.qtd, it.qtd, it.lote ?? null]);
  }
  return rec.lastID;
}

const qtdMaterial = async (db, id) => (await dbGet(db,
  'SELECT quantidade_atual FROM materiais_almoxarifado WHERE id = ?', [id])).quantidade_atual;
const entradasDoRecebimento = (db, recId) => dbAll(db,
  `SELECT id, quantidade FROM movimentacoes_almoxarifado
   WHERE recebimento_id = ? AND tipo = 'ENTRADA_COMPRA' ORDER BY id`, [recId]);
const itensDoRecebimento = (db, recId) => dbAll(db,
  `SELECT id, material_id, entrada_estoque_em FROM recebimentos_material_itens_almoxarifado
   WHERE recebimento_id = ? ORDER BY id`, [recId]);

(async () => {
  const { db, close } = await createTestApp({ user: ADMIN });
  const recRow = (id) => dbGet(db, 'SELECT * FROM recebimentos_material_almoxarifado WHERE id = ?', [id]);

  await test('nota com um item invalido e recusada INTEIRA — nada do primeiro item entra', async () => {
    const bom = await novoMaterial(db);
    const ruim = await novoMaterial(db, { ativo: 0 }); // material inativo: o motor recusaria
    const recId = await recebimentoCom(db, [
      { material_id: bom, qtd: 10 },
      { material_id: ruim, qtd: 4 },
    ]);
    const rec = await recRow(recId);

    await assert.rejects(() => receiptService.darEntradaEstoque(db, ADMIN, rec, recId, {}),
      /inativo/i, 'a nota com item invalido nao foi recusada');

    assert.strictEqual(await qtdMaterial(db, bom), 0,
      'o item bom entrou antes de a nota inteira ser validada — era exatamente o defeito');
    assert.strictEqual((await entradasDoRecebimento(db, recId)).length, 0,
      'gravou movimentacao de entrada numa nota recusada');
    // A recusa acontece antes de qualquer claim: nenhum item pode ficar marcado.
    for (const it of await itensDoRecebimento(db, recId)) {
      assert.strictEqual(it.entrada_estoque_em, null,
        'item ficou marcado como "ja entrou" numa nota que nao entrou');
    }
  });

  await test('material com controle_lote e sem lote digitado tambem recusa a nota inteira', async () => {
    const bom = await novoMaterial(db);
    const controlado = await novoMaterial(db, { controleLote: 1 });
    const recId = await recebimentoCom(db, [
      { material_id: bom, qtd: 10 },
      { material_id: controlado, qtd: 4, lote: null },
    ]);
    const rec = await recRow(recId);

    await assert.rejects(() => receiptService.darEntradaEstoque(db, ADMIN, rec, recId, {}),
      /lote/i);
    assert.strictEqual(await qtdMaterial(db, bom), 0, 'o item bom entrou apesar da nota ser invalida');
  });

  await test('reprocessar uma nota ja processada nao credita nada de novo', async () => {
    const mat = await novoMaterial(db);
    const recId = await recebimentoCom(db, [{ material_id: mat, qtd: 10 }]);
    const rec = await recRow(recId);

    await receiptService.darEntradaEstoque(db, ADMIN, rec, recId, {});
    assert.strictEqual(await qtdMaterial(db, mat), 10);

    await receiptService.darEntradaEstoque(db, ADMIN, rec, recId, {});
    assert.strictEqual(await qtdMaterial(db, mat), 10,
      'o reprocessamento creditou de novo — 10 viraram 20, que e a reproducao do revisor');
    assert.strictEqual((await entradasDoRecebimento(db, recId)).length, 1,
      'gravou uma segunda movimentacao de entrada para o mesmo item');
  });

  // ── A reproducao exata do revisor: A entra, B falha, corrige B, reprocessa ──
  await test('A entra e B falha: reprocessar entra so o B, e o A continua em 10 (nao 20)', async () => {
    const matA = await novoMaterial(db);
    const matB = await novoMaterial(db);
    const recId = await recebimentoCom(db, [
      { material_id: matA, qtd: 10 },
      { material_id: matB, qtd: 5, lote: 'LOTE-B' },
    ]);
    const rec = await recRow(recId);

    // Falha INJETADA no item B, depois da pre-checagem e DEPOIS do claim, mas ANTES da entrada
    // fisica dele: e a unica forma honesta de chegar no meio do laco (a pre-checagem, de
    // proposito, tira do caminho tudo que da para saber antes). Escolhido `criarOuObterLote`
    // porque roda exatamente nessa janela.
    const original = lotService.criarOuObterLote;
    lotService.criarOuObterLote = async () => {
      throw Object.assign(new Error('falha simulada ao criar o lote do item B'), { status: 400 });
    };
    try {
      await assert.rejects(() => receiptService.darEntradaEstoque(db, ADMIN, rec, recId, {}),
        /falha simulada/);
    } finally {
      lotService.criarOuObterLote = original;
    }

    assert.strictEqual(await qtdMaterial(db, matA), 10, 'o item A deveria ter entrado uma vez');
    assert.strictEqual(await qtdMaterial(db, matB), 0, 'o item B nao podia ter entrado');
    const itens = await itensDoRecebimento(db, recId);
    assert.ok(itens[0].entrada_estoque_em, 'o item A entrou e tinha de ficar marcado');
    assert.strictEqual(itens[1].entrada_estoque_em, null,
      'a marca do item B nao foi devolvida — a falha aconteceu antes da entrada fisica dele');

    // "Corrigido o B", reprocessa: e aqui que o defeito dobrava o A.
    await receiptService.darEntradaEstoque(db, ADMIN, rec, recId, {});
    assert.strictEqual(await qtdMaterial(db, matA), 10,
      'o reprocessamento creditou o A de novo: 10 viraram 20 — o defeito reproduzido pelo revisor');
    assert.strictEqual(await qtdMaterial(db, matB), 5, 'o item B nao entrou no reprocessamento');
    assert.strictEqual((await entradasDoRecebimento(db, recId)).length, 2,
      'deveria haver exatamente uma entrada por item');
  });

  await test('item com quantidade zero nao entra nem e marcado', async () => {
    const mat = await novoMaterial(db);
    const recId = await recebimentoCom(db, [{ material_id: mat, qtd: 0 }]);
    const rec = await recRow(recId);
    await receiptService.darEntradaEstoque(db, ADMIN, rec, recId, {});
    assert.strictEqual(await qtdMaterial(db, mat), 0);
    const itens = await itensDoRecebimento(db, recId);
    assert.strictEqual(itens[0].entrada_estoque_em, null,
      'item sem quantidade nao move estoque, entao nao pode consumir a marca de entrada');
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
