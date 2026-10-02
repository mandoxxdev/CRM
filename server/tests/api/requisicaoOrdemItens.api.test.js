/**
 * Etapa 73, Task 0 (RN-09, G80) — os itens da requisicao voltam na ordem em que foram pedidos.
 *
 * Plano: docs/superpowers/plans/2026-10-02-almoxarifado-etapa73-requisicao-espera-compra.md (T0 e a
 * secao "Fase 2 — revisao do plano", que prevalece).
 *
 * O defeito: requisitionCreateService gravava os itens com Promise.all(itens.map(dbRun INSERT)). O
 * node-sqlite3 nao garante a ordem de execucao de comandos paralelos na mesma conexao, entao o id do
 * item podia sair trocado — e o detalhe (sem ORDER BY) seguia o id. Quem pedia A e B via B e A no
 * detalhe, no comprovante e na fila; o teste dos indicadores (Etapa 67) separava pela posicao e caia
 * de forma intermitente (G80, causa 2).
 *
 * Aqui: 5 itens com material_id fora de ordem no payload (a ordem do id do material nao pode ser a
 * resposta certa por acaso), 20 repeticoes seguidas pela rota do almoxarifado, mais pela rota
 * cross-modulo (POST /api/requisicoes-material, mesmo servico) e pelo servico direto.
 *
 * Executar: cd server && node tests/api/requisicaoOrdemItens.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbAll } = require('../../services/almoxarifado/db');
const requisitionCreateService = require('../../services/almoxarifado/requisitionCreateService');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

const ADMIN = { id: 7301, nome: 'Admin E73T0', role: 'admin', is_superadmin: 1, email: 'e73t0@test.com' };
const REPETICOES = 20;

(async () => {
  console.log('\n=== Etapa 73 Task 0: a ordem dos itens da requisicao e a do pedido (RN-09) ===\n');
  const { app, db, close, setUser } = await createTestApp({ user: { ...ADMIN } });

  // familia de uso AMBOS: a rota cross-modulo valida o material contra o setor (Produção)
  const fam = (await dbRun(db, `INSERT INTO familias_material_almoxarifado (codigo, nome, tipo_uso)
    VALUES ('E73T0-F', 'Familia E73T0', 'ambos')`)).lastID;
  const mats = [];
  for (let i = 1; i <= 5; i++) {
    // eslint-disable-next-line no-await-in-loop
    mats.push((await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, ativo, familia_id)
      VALUES (?, ?, 'UN', 0, 1, ?)`, [`E73T0-M${i}`, `Mat E73T0 ${i}`, fam])).lastID);
  }
  // payload fora da ordem dos ids de material: [3,1,5,2,4]
  const ordem = [mats[2], mats[0], mats[4], mats[1], mats[3]];
  const payload = () => ordem.map((material_id, i) => ({ material_id, quantidade: i + 1 }));

  /** Confere: material_id na ordem do payload, quantidade casada, id do item crescente. */
  const confere = (itens, rotulo) => {
    assert.deepStrictEqual(itens.map((i) => i.material_id), ordem,
      `${rotulo}: itens fora da ordem do pedido: ${JSON.stringify(itens.map((i) => [i.id, i.material_id]))}`);
    assert.deepStrictEqual(itens.map((i) => Number(i.quantidade_solicitada)), [1, 2, 3, 4, 5], `${rotulo}: quantidade trocada`);
    for (let k = 1; k < itens.length; k++) {
      assert.ok(itens[k].id > itens[k - 1].id, `${rotulo}: id do item nao cresce na ordem do pedido: ${JSON.stringify(itens.map((i) => i.id))}`);
    }
  };

  await test(`[rota almoxarifado] POST /requisicoes com 5 itens -> GET /requisicoes/:id na ordem do pedido, ${REPETICOES} vezes`, async () => {
    const trocadas = [];
    for (let k = 0; k < REPETICOES; k++) {
      setUser({ ...ADMIN });
      // eslint-disable-next-line no-await-in-loop
      const cr = await request(app).post('/api/almoxarifado/requisicoes').send({ itens: payload() });
      assert.strictEqual(cr.status, 201, JSON.stringify(cr.body));
      // eslint-disable-next-line no-await-in-loop
      const det = await request(app).get(`/api/almoxarifado/requisicoes/${cr.body.id}`);
      assert.strictEqual(det.status, 200, JSON.stringify(det.body));
      try { confere(det.body.itens, `repeticao ${k + 1}`); } catch (e) { trocadas.push(e.message); }
    }
    assert.deepStrictEqual(trocadas, [], `${trocadas.length} de ${REPETICOES} repeticoes trocaram a ordem`);
  });

  await test('[rota cross-modulo] POST /api/requisicoes-material -> GET /api/requisicoes-material/:id na ordem do pedido', async () => {
    const trocadas = [];
    for (let k = 0; k < REPETICOES; k++) {
      setUser({ ...ADMIN });
      // eslint-disable-next-line no-await-in-loop
      const cr = await request(app).post('/api/requisicoes-material').send({ setor: 'Produção', itens: payload() });
      assert.strictEqual(cr.status, 201, JSON.stringify(cr.body));
      // eslint-disable-next-line no-await-in-loop
      const det = await request(app).get(`/api/requisicoes-material/${cr.body.id}`);
      assert.strictEqual(det.status, 200, JSON.stringify(det.body));
      try { confere(det.body.itens, `cross ${k + 1}`); } catch (e) { trocadas.push(e.message); }
    }
    assert.deepStrictEqual(trocadas, [], `${trocadas.length} de ${REPETICOES} repeticoes trocaram a ordem`);
  });

  await test('[servico] createRequisicao direto grava os itens com id crescente na ordem do payload', async () => {
    const trocadas = [];
    for (let k = 0; k < REPETICOES; k++) {
      // eslint-disable-next-line no-await-in-loop
      const r = await requisitionCreateService.createRequisicao(db, { ...ADMIN }, { setor: 'Produção', itens: payload() },
        { modulo: 'almoxarifado', skipNotificacoes: true });
      // leitura pelo id (a ordem de gravacao), nao pela ordem que a rota de detalhe impoe
      // eslint-disable-next-line no-await-in-loop
      const itens = await dbAll(db, 'SELECT id, material_id, quantidade_solicitada FROM itens_requisicao_almoxarifado WHERE requisicao_id = ? ORDER BY id', [r.id]);
      try { confere(itens, `servico ${k + 1}`); } catch (e) { trocadas.push(e.message); }
    }
    assert.deepStrictEqual(trocadas, [], `${trocadas.length} de ${REPETICOES} repeticoes trocaram a ordem`);
  });

  await close();
  console.log(`\n${passed} passaram, ${failed} falharam\n`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
