/**
 * Etapa 70, T0 — "chegou zero" NAO da entrada pela esperada.
 *
 * O defeito (critico da Fase 2 da Etapa 70, medido por sonda): `quantidadeDoItem` era
 * `quantidade_recebida || quantidade_esperada`, e o `||` trata o 0 como "nao informado". O item
 * conferido com 0 (a tela grava o 0 de proposito: e o "nao chegou nada") entrava no estoque com a
 * ESPERADA — esperada 5, conferida 0 -> saldo 5. O mesmo `||` estava no INSERT do item em
 * `criarRecebimento` (`item.quantidade_recebida || qtd`, registrado na letra D da Etapa 67): o item
 * criado com `quantidade_recebida: 0` nascia com a esperada gravada, e a divergencia sumia antes de
 * existir.
 *
 * O par que separa "nao conferido" de "chegou zero" e NULL x 0: NULL continua caindo na esperada
 * (ninguem contou, vale o documento); 0 e um fato e nao move estoque.
 *
 * Cada cenario tem a metade positiva: o item zerado nao entra, MAS a nota processa, os outros
 * itens entram e a divergencia continua registrada.
 *
 * Executar: cd server && node tests/api/recebimentoChegouZero.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const receiptService = require('../../services/almoxarifado/receiptService');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}
const ADMIN = { id: 1, nome: 'Admin Zero', role: 'admin' };

let seq = 0;
async function novoMaterial(db) {
  seq += 1;
  return (await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, ativo)
    VALUES (?,?,'UN',0,1)`, [`Z70-${seq}`, `Material zero ${seq}`])).lastID;
}

/** Recebimento pronto para processar; `recebida` pode ser numero ou null (nao conferido). */
async function recebimentoCom(db, itens, status = 'EM_ENTRADA_NF') {
  seq += 1;
  const rec = await dbRun(db, `INSERT INTO recebimentos_material_almoxarifado
    (numero, status, nota_fiscal, fornecedor_nome, data_emissao_nf, data_entrada_nf, valor_total_nota)
    VALUES (?, ?, ?, 'Acme Zero', '2026-08-01', '2026-08-02', 100)`, [`REC-Z70-${seq}`, status, `NF-Z70-${seq}`]);
  for (const it of itens) {
    await dbRun(db, `INSERT INTO recebimentos_material_itens_almoxarifado
      (recebimento_id, material_id, quantidade_esperada, quantidade_recebida) VALUES (?,?,?,?)`,
    [rec.lastID, it.material_id, it.esperada, it.recebida]);
  }
  return rec.lastID;
}

const saldo = async (db, id) => (await dbGet(db,
  'SELECT quantidade_atual FROM materiais_almoxarifado WHERE id = ?', [id])).quantidade_atual;
const entradasDoMaterial = (db, recId, matId) => dbAll(db, `SELECT quantidade FROM movimentacoes_almoxarifado
  WHERE recebimento_id = ? AND material_id = ? AND tipo = 'ENTRADA_COMPRA'`, [recId, matId]);
const itemDe = (db, recId, matId) => dbGet(db, `SELECT * FROM recebimentos_material_itens_almoxarifado
  WHERE recebimento_id = ? AND material_id = ?`, [recId, matId]);

(async () => {
  const { app, db, close } = await createTestApp({ user: ADMIN });

  await test('servico: nota de UM item conferido com 0 processa e NAO entra nada (era: entrava a esperada)', async () => {
    const m = await novoMaterial(db);
    const r = await recebimentoCom(db, [{ material_id: m, esperada: 5, recebida: 0 }]);
    const res = await receiptService.processarNota(db, ADMIN, r);
    assert.strictEqual(res.status, 'PROCESSADO');
    assert.strictEqual(await saldo(db, m), 0, 'chegou zero nao pode creditar a esperada');
    assert.deepStrictEqual(await entradasDoMaterial(db, r, m), []);
    assert.strictEqual((await itemDe(db, r, m)).entrada_estoque_em, null, 'item zerado nao e reclamado');
    assert.strictEqual((await dbGet(db, 'SELECT status FROM recebimentos_material_almoxarifado WHERE id = ?', [r])).status,
      'PROCESSADO', 'a nota nao trava por causa do item zerado');
  });

  await test('servico: nota de DOIS itens, um com 0 — o outro entra, o zerado nao', async () => {
    const zero = await novoMaterial(db);
    const bom = await novoMaterial(db);
    const r = await recebimentoCom(db, [
      { material_id: zero, esperada: 5, recebida: 0 },
      { material_id: bom, esperada: 4, recebida: 3 },
    ]);
    await receiptService.processarNota(db, ADMIN, r);
    assert.strictEqual(await saldo(db, zero), 0);
    assert.strictEqual(await saldo(db, bom), 3, 'o item conferido entra pela RECEBIDA');
    assert.strictEqual((await entradasDoMaterial(db, r, bom)).length, 1);
    assert.notStrictEqual((await itemDe(db, r, bom)).entrada_estoque_em, null);
  });

  await test('servico: recebida NULL (nao conferido) continua entrando pela esperada', async () => {
    const m = await novoMaterial(db);
    const r = await recebimentoCom(db, [{ material_id: m, esperada: 6, recebida: null }]);
    await receiptService.processarNota(db, ADMIN, r);
    assert.strictEqual(await saldo(db, m), 6, 'NULL e "ninguem contou": vale o documento');
  });

  await test('servico: aprovarRecebimento (ramo direto) tambem nao da entrada no zerado', async () => {
    const zero = await novoMaterial(db);
    const bom = await novoMaterial(db);
    const r = await recebimentoCom(db, [
      { material_id: zero, esperada: 2, recebida: 0 },
      { material_id: bom, esperada: 2, recebida: 2 },
    ], 'RECEBIDO');
    await receiptService.aprovarRecebimento(db, ADMIN, r);
    assert.strictEqual(await saldo(db, zero), 0);
    assert.strictEqual(await saldo(db, bom), 2);
  });

  await test('ROTA: cria com quantidade_recebida 0, confere, processa — o zerado nao entra e a NC continua', async () => {
    const zero = await novoMaterial(db);
    const bom = await novoMaterial(db);
    const criado = await request(app).post('/api/almoxarifado/recebimentos').send({
      tipo_recebimento: 'NOTA_FISCAL', nota_fiscal: 'NF-Z70-ROTA', fornecedor_nome: 'Acme Zero',
      itens: [
        { material_id: zero, quantidade: 5, quantidade_recebida: 0 },
        { material_id: bom, quantidade: 3 },
      ],
    });
    assert.strictEqual(criado.status, 201, JSON.stringify(criado.body));
    const r = criado.body.id;
    // O INSERT: o 0 e gravado como 0 (era a esperada); a omissao continua gravando a esperada.
    assert.strictEqual((await itemDe(db, r, zero)).quantidade_recebida, 0, 'o INSERT nao pode trocar 0 pela esperada');
    assert.strictEqual((await itemDe(db, r, bom)).quantidade_recebida, 3, 'campo omitido nasce com a esperada');

    const wf = async (acao) => {
      const x = await request(app).post(`/api/almoxarifado/recebimentos/${r}/workflow`).send({ acao });
      assert.strictEqual(x.status, 200, `${acao}: ${JSON.stringify(x.body)}`);
    };
    await wf('iniciar_conferencia');
    const itemZero = await itemDe(db, r, zero);
    const conf = await request(app).put(`/api/almoxarifado/recebimentos/${r}/conferir`)
      .send({ itens: [{ id: itemZero.id, quantidade_recebida: 0 }] });
    assert.strictEqual(conf.status, 200, JSON.stringify(conf.body));
    const ncAntes = await dbAll(db, `SELECT * FROM nao_conformidades_almoxarifado
      WHERE referencia_tipo = 'RECEBIMENTO_ITEM' AND referencia_id = ? AND tipo = 'QUANTIDADE'`, [itemZero.id]);
    assert.strictEqual(ncAntes.length, 1, 'a conferencia com 0 abre a NC de quantidade');
    assert.strictEqual(ncAntes[0].divergencia, -5);

    await wf('finalizar_conferencia');
    await wf('encaminhar_compras');
    await wf('finalizar_compras');
    await wf('iniciar_faturamento');
    const fiscal = await request(app).put(`/api/almoxarifado/recebimentos/${r}/fiscal`).send({
      nota_fiscal: 'NF-Z70-ROTA', data_emissao_nf: '2026-08-01', data_entrada_nf: '2026-08-02', valor_total_nota: 50,
    });
    assert.strictEqual(fiscal.status, 200, JSON.stringify(fiscal.body));
    const proc = await request(app).post(`/api/almoxarifado/recebimentos/${r}/processar`).send({});
    assert.strictEqual(proc.status, 200, JSON.stringify(proc.body));
    assert.strictEqual(proc.body.status, 'PROCESSADO');

    assert.strictEqual(await saldo(db, zero), 0, 'pela rota: chegou zero nao entra');
    assert.strictEqual(await saldo(db, bom), 3, 'pela rota: o outro item entra');
    assert.strictEqual((await itemDe(db, r, zero)).quantidade_recebida, 0, 'o processamento nao reescreve o 0');
    const ncDepois = await dbAll(db, `SELECT * FROM nao_conformidades_almoxarifado
      WHERE referencia_tipo = 'RECEBIMENTO_ITEM' AND referencia_id = ? AND tipo = 'QUANTIDADE'`, [itemZero.id]);
    assert.strictEqual(ncDepois.length, 1);
    assert.notStrictEqual(ncDepois[0].status, 'CANCELADA', 'a divergencia continua registrada depois de processar');
  });

  await close();
  console.log(`\n${passed} passou, ${failed} falhou`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
