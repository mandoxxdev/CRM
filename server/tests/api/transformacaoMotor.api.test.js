/**
 * Etapa 8c, Task 4 — RETORNO_TRANSFORMACAO dentro do motor.
 *
 * O tipo e ENTRADA: credita quantidade_atual, aceita custo_unitario e alimenta o custo medio pelo
 * caminho que ja existe (stockService.js:1031-1041). NAO e retencao: nao toca em
 * quantidade_em_terceiros — quem baixa a retencao da chapa e o CONSUMO_TERCEIRO do outro lado.
 *
 * Metade dos testes daqui existe por causa de UM defeito da 8b que so a execucao achou: tiposEntrada
 * e declarado DUAS vezes neste arquivo (:512 em registrarMovimentacao e :1388 em
 * cancelarMovimentacao) e o if-chain do cancelamento NAO tem else. Tipo ausente da segunda lista e
 * marcado cancelado=1, ganha linha de ESTORNO com saldo_anterior == saldo_posterior, e NENHUM saldo
 * volta. Leitura e suite verde nao pegam isso.
 *
 * Executar: cd server && node tests/api/transformacaoMotor.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet } = require('../../services/almoxarifado/db');
const stockService = require('../../services/almoxarifado/stockService');
const { TIPOS_MOVIMENTO, TIPOS_DEDICADOS, TIPOS_RETENCAO } = require('../../services/almoxarifado/schema');
const { TIPOS_MOVIMENTO_ROTA } = require('../../services/almoxarifado/schemas');
const { TIPOS_ISENTOS_DONO } = require('../../services/almoxarifado/ownerRules');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}
const ADMIN = { id: 1, nome: 'Admin Teste', role: 'admin', is_superadmin: 1, email: 'admin@test.com' };
const T = 'RETORNO_TRANSFORMACAO';

let seq = 0;
async function novoMaterial(db, { atual = 0, custo = 0, terceiros = 0 } = {}) {
  seq += 1;
  const r = await dbRun(db,
    `INSERT INTO materiais_almoxarifado
       (codigo, nome, unidade, quantidade_atual, custo_medio, custo_unitario, quantidade_em_terceiros, ativo)
     VALUES (?,?,'UN',?,?,?,?,1)`, [`MOT-${seq}`, `Material motor ${seq}`, atual, custo, custo, terceiros]);
  return r.lastID;
}
const est = async (db, id) => dbGet(db,
  `SELECT quantidade_atual, COALESCE(quantidade_em_terceiros,0) AS em_terceiros,
          COALESCE(custo_medio,0) AS custo_medio, COALESCE(custo_unitario,0) AS custo_unitario
   FROM materiais_almoxarifado WHERE id = ?`, [id]);

(async () => {
  const { app, db, close } = await createTestApp({ user: ADMIN });

  await test('[declaracao] RETORNO_TRANSFORMACAO esta em TIPOS_MOVIMENTO e em TIPOS_DEDICADOS', async () => {
    assert.ok(TIPOS_MOVIMENTO.includes(T), 'o tipo nao foi declarado em TIPOS_MOVIMENTO');
    assert.ok(TIPOS_DEDICADOS.includes(T), 'o tipo nao entrou em TIPOS_DEDICADOS');
  });

  await test('[declaracao] RETORNO_TRANSFORMACAO NAO esta em TIPOS_RETENCAO', async () => {
    // Se entrasse, o motor pularia o bloco fisico (a skip-list deriva de TIPOS_RETENCAO,
    // stockService.js:926) e a peca NUNCA seria creditada — o pior modo de falhar desta etapa,
    // porque a movimentacao apareceria no livro do mesmo jeito.
    assert.ok(!TIPOS_RETENCAO.includes(T));
  });

  await test('[declaracao] entrar em TIPOS_DEDICADOS ja tira o tipo da rota generica', async () => {
    // TIPOS_MOVIMENTO_ROTA e DERIVADO (schemas.js:54-56): TIPOS_MOVIMENTO menos ESTORNO, menos
    // TIPOS_RETENCAO, menos TIPOS_DEDICADOS. Nao ha lista a editar em schemas.js — e este teste e
    // o que garante que a derivacao continua sendo derivacao.
    assert.ok(!TIPOS_MOVIMENTO_ROTA.includes(T));
  });

  await test('[declaracao] RETORNO_TRANSFORMACAO esta em TIPOS_ISENTOS_DONO', async () => {
    // Declarativo: a guarda do dono (assertSaidaPermitida) so roda para SAIDA, e este tipo e
    // entrada — a ausencia nao mudaria comportamento HOJE. Esta na lista para a ausencia nao poder
    // ser lida como esquecimento por quem for mexer nela depois. Mesmo criterio de AJUSTE_POSITIVO,
    // que tambem e entrada e tambem esta la.
    assert.ok(TIPOS_ISENTOS_DONO.includes(T));
  });

  await test('RETORNO_TRANSFORMACAO credita quantidade_atual e alimenta o custo medio', async () => {
    const mat = await novoMaterial(db, { atual: 0, custo: 0 });
    const mov = await stockService.registrarMovimentacao(db, ADMIN, {
      material_id: mat, tipo: T, quantidade: 40, custo_unitario: 25,
      justificativa: 'Transformacao da remessa REM-1 (chapa CHP-001)',
    });
    assert.ok(mov.id, 'a movimentacao nao foi gravada no livro');
    const e = await est(db, mat);
    assert.strictEqual(e.quantidade_atual, 40);
    assert.strictEqual(e.custo_medio, 25);
    assert.strictEqual(e.custo_unitario, 25);
  });

  await test('RETORNO_TRANSFORMACAO NAO mexe em quantidade_em_terceiros', async () => {
    // Quem baixa a retencao da chapa e o CONSUMO_TERCEIRO do OUTRO material. Se a entrada da peca
    // tambem mexesse na retencao, o numero baixaria duas vezes — e a peca nem estava no terceiro.
    const mat = await novoMaterial(db, { atual: 10, terceiros: 7 });
    await stockService.registrarMovimentacao(db, ADMIN, {
      material_id: mat, tipo: T, quantidade: 5, justificativa: 'Transformacao REM-2' });
    const e = await est(db, mat);
    assert.strictEqual(e.quantidade_atual, 15);
    assert.strictEqual(e.em_terceiros, 7, 'a entrada da peca mexeu na retencao de terceiros');
  });

  await test('RETORNO_TRANSFORMACAO sem custo credita quantidade e NAO zera o custo existente', async () => {
    // O caminho da SOBRA (custo zero, decisao 4). Sem esta garantia, creditar a sobra apagaria o
    // custo cadastrado do material da sobra.
    const mat = await novoMaterial(db, { atual: 20, custo: 8 });
    await stockService.registrarMovimentacao(db, ADMIN, {
      material_id: mat, tipo: T, quantidade: 5, custo_unitario: 0, justificativa: 'Sobra da REM-3' });
    const e = await est(db, mat);
    assert.strictEqual(e.quantidade_atual, 25);
    assert.strictEqual(e.custo_medio, 8, 'a sobra a custo zero apagou o custo do material');
    assert.strictEqual(e.custo_unitario, 8);
  });

  await test('RETORNO_TRANSFORMACAO exige justificativa', async () => {
    // movementRules: o tipo muda a resposta a pergunta "de onde veio esse material?", e a resposta
    // tem de estar escrita. Vinculo com OS/projeto e 'nenhum' porque o vinculo mora no DOCUMENTO
    // da remessa — exigi-lo de novo aqui duplicaria a regra em dois lugares que divergiriam.
    const mat = await novoMaterial(db);
    await assert.rejects(
      () => stockService.registrarMovimentacao(db, ADMIN, { material_id: mat, tipo: T, quantidade: 1 }),
      /justificativa/i);
    assert.strictEqual((await est(db, mat)).quantidade_atual, 0, 'creditou mesmo recusando');
  });

  await test('a rota generica de movimentacao RECUSA RETORNO_TRANSFORMACAO', async () => {
    // Gate `movimentar` e o mais amplo do modulo. Aceitar o tipo la permitiria criar peca cortada
    // sem remessa nenhuma por tras e sem baixar chapa alguma — estoque do nada, exatamente o que a
    // mensagem de recusa da 8b dizia querer evitar.
    const mat = await novoMaterial(db);
    const r = await request(app).post('/api/almoxarifado/movimentacoes/v2')
      .send({ material_id: mat, tipo: T, quantidade: 5, justificativa: 'pela porta errada' });
    assert.strictEqual(r.status, 400, `a rota generica aceitou o tipo (status ${r.status})`);
    assert.strictEqual((await est(db, mat)).quantidade_atual, 0);
  });

  await test('[CONTROLE POSITIVO] a rota generica continua aceitando ENTRADA_MANUAL', async () => {
    // Sem isto, um TIPOS_MOVIMENTO_ROTA vazio (ou um refine quebrado) passaria no teste acima e
    // derrubaria a tela de movimentacao inteira.
    const mat = await novoMaterial(db);
    const r = await request(app).post('/api/almoxarifado/movimentacoes/v2')
      .send({ material_id: mat, tipo: 'ENTRADA_MANUAL', quantidade: 5, justificativa: 'entrada normal' });
    assert.strictEqual(r.status, 201, `ENTRADA_MANUAL levou ${r.status}: ${JSON.stringify(r.body)}`);
  });

  await test('estorno de RETORNO_TRANSFORMACAO DEVOLVE a quantidade (as duas listas tiposEntrada)', async () => {
    // ESTE E O TESTE DA ARMADILHA. tiposEntrada e declarado DUAS vezes em stockService.js: :512
    // (registrarMovimentacao) e :1388 (cancelarMovimentacao). O if-chain do cancelamento nao tem
    // else — tipo ausente da segunda lista e marcado cancelado=1, ganha linha de ESTORNO com
    // saldo_anterior == saldo_posterior e NENHUM saldo volta. Foi o quarto defeito que so a
    // execucao da 8b achou, e ele nao aparece em leitura nem em suite verde.
    const mat = await novoMaterial(db, { atual: 0 });
    const mov = await stockService.registrarMovimentacao(db, ADMIN, {
      material_id: mat, tipo: T, quantidade: 30, custo_unitario: 10, justificativa: 'REM-9' });
    assert.strictEqual((await est(db, mat)).quantidade_atual, 30);

    await stockService.cancelarMovimentacao(db, ADMIN, mov.id, 'teste de estorno');
    const e = await est(db, mat);
    assert.strictEqual(e.quantidade_atual, 0, 'o estorno gravou a linha e NAO devolveu o saldo');

    const estorno = await dbGet(db,
      "SELECT * FROM movimentacoes_almoxarifado WHERE tipo = 'ESTORNO' AND material_id = ?", [mat]);
    assert.ok(estorno, 'nao gravou linha de ESTORNO');
    assert.notStrictEqual(estorno.saldo_anterior, estorno.saldo_posterior,
      'a linha de ESTORNO diz que nada mudou — o tipo caiu no if-chain sem ramo');
  });

  await test('o estorno de RETORNO_TRANSFORMACAO NAO reverte o custo (decisao anterior, declarada)', async () => {
    // Decisao explicita da Etapa 1 (stockService.js:1548-1550): reversao exata de custo medio e
    // mal-definida depois de movimentos intermediarios. Este teste NAO aprova o comportamento — ele
    // o FIXA, para a decisao 11.2 do design da 8c ser verdade verificavel e para uma mudanca futura
    // aparecer como quebra de teste em vez de surpresa em relatorio.
    const mat = await novoMaterial(db, { atual: 0, custo: 0 });
    const mov = await stockService.registrarMovimentacao(db, ADMIN, {
      material_id: mat, tipo: T, quantidade: 10, custo_unitario: 50, justificativa: 'REM-10' });
    await stockService.cancelarMovimentacao(db, ADMIN, mov.id, 'teste de custo no estorno');
    const e = await est(db, mat);
    assert.strictEqual(e.quantidade_atual, 0);
    assert.strictEqual(e.custo_medio, 50,
      'o estorno passou a reverter custo — se foi de proposito, corrija a decisao 11.2 do design e este teste');
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
