/**
 * Etapa 6b, Task 6 — a serie nasce no recebimento (nota fiscal).
 *
 * O motor (Task 3/4) ja exige e efetiva series em entrada/saida/estorno quando o CHAMADOR declara
 * `opcoes.exigeSerie`. Ate esta task, `receiptService.darEntradaEstoque` nao declarava — um
 * material com `controle_serie` ligado entrava pelo recebimento sem nenhuma serie nascer, e o
 * invariante (COUNT(series presentes) == quantidade_atual) so seria cobrado na PROXIMA
 * movimentacao (saida), tarde demais.
 *
 * Molde: recebimentoEntradaAtomica.api.test.js (mesma pre-checagem da nota inteira, mesma marca de
 * idempotencia por item — `series` so acrescenta uma nova causa de recusa e um novo efeito).
 */
const assert = require('assert');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const receiptService = require('../../services/almoxarifado/receiptService');
const { assertInvarianteSerie } = require('../helpers/serieInvariante');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}
const ADMIN = { id: 1, nome: 'Admin Teste', role: 'admin' };

let seq = 0;
async function novoMaterial(db, { controleSerie = 1, qtd = 0 } = {}) {
  seq += 1;
  const r = await dbRun(db,
    `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, ativo, controle_serie)
     VALUES (?,?,'UN',?,1,?)`, [`SERREC-${seq}`, `Material serie recebimento ${seq}`, qtd, controleSerie ? 1 : 0]);
  return r.lastID;
}

/** Recebimento pronto para processar, com N itens (cada um pode trazer `lote` e `series`). */
async function recebimentoCom(db, itens) {
  seq += 1;
  const rec = await dbRun(db, `INSERT INTO recebimentos_material_almoxarifado
    (numero, status, nota_fiscal, fornecedor_nome, data_emissao_nf, data_entrada_nf, valor_total_nota)
    VALUES (?, 'EM_ENTRADA_NF', ?, 'Acme Acos', '2026-08-01', '2026-08-02', 1000)`,
    [`REC-SER-${seq}`, `NF-SER-${seq}`]);
  for (const it of itens) {
    await dbRun(db, `INSERT INTO recebimentos_material_itens_almoxarifado
      (recebimento_id, material_id, quantidade_esperada, quantidade_recebida, lote, series)
      VALUES (?,?,?,?,?,?)`, [rec.lastID, it.material_id, it.qtd, it.qtd, it.lote ?? null, it.series ?? null]);
  }
  return rec.lastID;
}

const totalDoMaterial = async (db, id) => (await dbGet(db,
  'SELECT quantidade_atual FROM materiais_almoxarifado WHERE id = ?', [id])).quantidade_atual;
const itensDoRecebimento = (db, recId) => dbAll(db,
  `SELECT * FROM recebimentos_material_itens_almoxarifado WHERE recebimento_id = ? ORDER BY id`, [recId]);
const seriesDoMaterial = (db, materialId) => dbAll(db,
  `SELECT * FROM series_almoxarifado WHERE material_id = ? ORDER BY numero`, [materialId]);

(async () => {
  const { db, close } = await createTestApp({ user: ADMIN });
  const recRow = (id) => dbGet(db, 'SELECT * FROM recebimentos_material_almoxarifado WHERE id = ?', [id]);

  await test('nota com item sem series em material controlado e recusada inteira (nada entra)', async () => {
    const bom = await novoMaterial(db, { controleSerie: 0 });
    const controlado = await novoMaterial(db, { controleSerie: 1 });
    const recId = await recebimentoCom(db, [
      { material_id: bom, qtd: 10 },
      { material_id: controlado, qtd: 4, series: null }, // sem series nenhuma
    ]);

    let erro = null;
    try { await receiptService.processarNota(db, ADMIN, recId, {}); } catch (e) { erro = e; }
    assert.ok(erro, 'a nota deveria ter sido recusada');
    assert.strictEqual(erro.status, 400, JSON.stringify(erro));
    assert.match(erro.message, /serie/i);

    assert.strictEqual(await totalDoMaterial(db, bom), 0,
      'o item bom entrou antes de a nota inteira ser validada — mesmo defeito da Etapa 6 com lote');
    assert.strictEqual(await totalDoMaterial(db, controlado), 0);
    for (const it of await itensDoRecebimento(db, recId)) {
      assert.strictEqual(it.entrada_estoque_em, null,
        'item ficou marcado como "ja entrou" numa nota que nao entrou');
    }
  });

  await test('nota com cardinalidade errada e recusada inteira', async () => {
    const mat = await novoMaterial(db, { controleSerie: 1 });
    // 3 unidades, so 2 numeros de serie informados.
    const recId = await recebimentoCom(db, [
      { material_id: mat, qtd: 3, series: 'SN-CARD-1\nSN-CARD-2' },
    ]);

    let erro = null;
    try { await receiptService.processarNota(db, ADMIN, recId, {}); } catch (e) { erro = e; }
    assert.ok(erro, 'cardinalidade errada deveria ter sido recusada');
    assert.strictEqual(erro.status, 400, JSON.stringify(erro));
    assert.match(erro.message, /informe 3 serie/i, erro.message);

    assert.strictEqual(await totalDoMaterial(db, mat), 0);
    const [item] = await itensDoRecebimento(db, recId);
    assert.strictEqual(item.entrada_estoque_em, null);
  });

  await test('nota ok cria series EM_ESTOQUE vinculadas ao lote, ao recebimento e ao item', async () => {
    const mat = await novoMaterial(db, { controleSerie: 1 });
    const recId = await recebimentoCom(db, [
      { material_id: mat, qtd: 2, lote: 'LOTE-SER-OK', series: 'SN-OK-1\nSN-OK-2' },
    ]);
    const [item] = await itensDoRecebimento(db, recId);

    const resultado = await receiptService.processarNota(db, ADMIN, recId, {});
    assert.strictEqual(resultado.status, 'PROCESSADO', JSON.stringify(resultado));

    assert.strictEqual(await totalDoMaterial(db, mat), 2);
    await assertInvarianteSerie(db, mat);

    const series = await seriesDoMaterial(db, mat);
    assert.strictEqual(series.length, 2, 'deveria ter criado exatamente as 2 series informadas');
    assert.deepStrictEqual(series.map((s) => s.numero), ['SN-OK-1', 'SN-OK-2']);
    for (const s of series) {
      assert.strictEqual(s.status, 'EM_ESTOQUE');
      assert.ok(s.lote_id, 'serie sem vinculo com o lote nascido no recebimento');
      assert.strictEqual(s.recebimento_id, recId, 'serie sem vinculo com o recebimento de origem');
      assert.strictEqual(s.recebimento_item_id, item.id, 'serie sem vinculo com o item de origem');
    }
  });

  await test('material sem controle_serie com texto em series nao reescreve serie orfa pre-existente do material', async () => {
    // Fix round 1 (achado do review por sonda): a griffagem original olhava so
    // `numerosSerie.length > 0`, sem checar `item.controle_serie`. Um item de material SEM
    // controle de serie mas com texto residual no campo `series` (ex.: sobra de quando o
    // material tinha controle_serie ligado, ou colado por engano) reescrevia
    // recebimento_id/recebimento_item_id de uma serie ORFA pre-existente do MESMO material so
    // porque o numero batia — mesmo o motor nao tendo tocado nela nesta chamada (controle_serie=0
    // -> serieObrigatoria=false no motor -> entradaSeries nem roda).
    const mat = await novoMaterial(db, { controleSerie: 0 });
    const orfa = await dbRun(db, `INSERT INTO series_almoxarifado
        (material_id, numero, status, recebimento_id, recebimento_item_id)
      VALUES (?, 'SN-ORFA-1', 'ESTORNADA', 999, 888)`, [mat]);

    const recId = await recebimentoCom(db, [
      { material_id: mat, qtd: 5, series: 'SN-ORFA-1' }, // texto residual; material nao exige serie
    ]);

    const resultado = await receiptService.processarNota(db, ADMIN, recId, {});
    assert.strictEqual(resultado.status, 'PROCESSADO', JSON.stringify(resultado));
    assert.strictEqual(await totalDoMaterial(db, mat), 5,
      'material sem controle_serie deveria ter entrado normalmente, texto em series e so residual');

    const linha = await dbGet(db, 'SELECT * FROM series_almoxarifado WHERE id = ?', [orfa.lastID]);
    assert.strictEqual(linha.recebimento_id, 999,
      'a griffagem reescreveu recebimento_id de uma serie orfa que o motor nao tocou nesta chamada');
    assert.strictEqual(linha.recebimento_item_id, 888,
      'a griffagem reescreveu recebimento_item_id de uma serie orfa que o motor nao tocou nesta chamada');
    assert.strictEqual(linha.status, 'ESTORNADA', 'status da serie orfa nao devia mudar');
  });

  await test('reprocessar a nota nao duplica series', async () => {
    const mat = await novoMaterial(db, { controleSerie: 1 });
    const recId = await recebimentoCom(db, [
      { material_id: mat, qtd: 2, series: 'SN-REP-1\nSN-REP-2' },
    ]);

    // Mesmo padrao do teste de idempotencia do lote (recebimentoEntradaAtomica): chama
    // `darEntradaEstoque` diretamente para poder reprocessar sem esbarrar no guard de status
    // ("Nota já processada") que `processarNota` aplicaria na segunda chamada.
    let rec = await recRow(recId);
    await receiptService.darEntradaEstoque(db, ADMIN, rec, recId, {});
    assert.strictEqual(await totalDoMaterial(db, mat), 2);
    await assertInvarianteSerie(db, mat);

    rec = await recRow(recId);
    await receiptService.darEntradaEstoque(db, ADMIN, rec, recId, {});
    assert.strictEqual(await totalDoMaterial(db, mat), 2,
      'o reprocessamento creditou de novo — 2 viraram 4, mesmo defeito da Etapa 6 com lote');

    const series = await seriesDoMaterial(db, mat);
    assert.strictEqual(series.length, 2, 'reprocessar duplicou as series');
    await assertInvarianteSerie(db, mat);
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
