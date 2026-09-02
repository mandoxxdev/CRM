/**
 * Etapa 9, Task 2 — ENTRADA_RETALHO nasce nas fontes unicas.
 *
 * O tipo credita quantidade_atual (e' ENTRADA de verdade) mas NAO e' o mesmo caminho de
 * ENTRADA_MANUAL/ENTRADA_COMPRA: quem emite este tipo e' SEMPRE o evento composto de retalho
 * (Task 3), nunca a rota generica. Por isso e' DEDICADO (TIPOS_DEDICADOS), exige justificativa
 * (REGRAS_VINCULO) e nunca recebe custo_unitario do servico que o chama — o retalho entra a
 * custo ZERO, mesmo tratamento conservador que TIPOS_RESULTADO.SOBRA ja usa (schema.js:150-163):
 * o patrimonio nunca infla, e se o retalho for vendido como sucata um dia aparece como GANHO, e
 * nunca como perda inventada. Por isso NAO reusar ENTRADA_MANUAL: aquele tipo aceita custo e
 * alimenta custo medio, e o retalho nao pode.
 *
 * Molde: tests/api/transformacaoMotor.api.test.js:50-70 (testes de declaracao).
 *
 * Executar: cd server && node tests/api/retalhoTipo.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet } = require('../../services/almoxarifado/db');
const stockService = require('../../services/almoxarifado/stockService');
const { TIPOS_MOVIMENTO, TIPOS_DEDICADOS, TIPOS_RETENCAO } = require('../../services/almoxarifado/schema');
const { TIPOS_MOVIMENTO_ROTA } = require('../../services/almoxarifado/schemas');
const { TIPOS_ENTRADA } = require('../../services/almoxarifado/movementTypes');
const { TIPOS_ISENTOS_DONO } = require('../../services/almoxarifado/ownerRules');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}
const ADMIN = { id: 1, nome: 'Admin Teste', role: 'admin', is_superadmin: 1, email: 'admin@test.com' };
const T = 'ENTRADA_RETALHO';

let seq = 0;
async function novoMaterial(db, { atual = 0, custo = 0 } = {}) {
  seq += 1;
  const r = await dbRun(db,
    `INSERT INTO materiais_almoxarifado
       (codigo, nome, unidade, quantidade_atual, custo_medio, custo_unitario, ativo)
     VALUES (?,?,'UN',?,?,?,1)`, [`RET-${seq}`, `Material retalho ${seq}`, atual, custo, custo]);
  return r.lastID;
}
const est = async (db, id) => dbGet(db,
  `SELECT quantidade_atual, COALESCE(custo_medio,0) AS custo_medio, COALESCE(custo_unitario,0) AS custo_unitario
   FROM materiais_almoxarifado WHERE id = ?`, [id]);

(async () => {
  const { app, db, close } = await createTestApp({ user: ADMIN });

  await test('[declaracao] ENTRADA_RETALHO esta em TIPOS_MOVIMENTO e em TIPOS_DEDICADOS', async () => {
    assert.ok(TIPOS_MOVIMENTO.includes(T), 'o tipo nao foi declarado em TIPOS_MOVIMENTO');
    assert.ok(TIPOS_DEDICADOS.includes(T), 'o tipo nao entrou em TIPOS_DEDICADOS');
  });

  await test('[declaracao] ENTRADA_RETALHO NAO esta em TIPOS_RETENCAO', async () => {
    // Se entrasse, o motor pularia o bloco fisico (skip-list deriva de TIPOS_RETENCAO,
    // stockService.js) e o retalho nunca seria creditado.
    assert.ok(!TIPOS_RETENCAO.includes(T));
  });

  await test('[declaracao] ENTRADA_RETALHO esta em movementTypes.TIPOS_ENTRADA', async () => {
    // E' esta lista que faz o motor CREDITAR e que clientePosicaoTipos.api.test.js (a equacao da
    // posicao por cliente) passa a exercitar sozinha, sem teste proprio.
    assert.ok(TIPOS_ENTRADA.includes(T), 'o tipo nao esta em movementTypes.TIPOS_ENTRADA — o motor nao vai creditar');
  });

  await test('[declaracao] entrar em TIPOS_DEDICADOS ja tira o tipo da rota generica', async () => {
    // TIPOS_MOVIMENTO_ROTA e' DERIVADO (schemas.js:54-56): TIPOS_MOVIMENTO menos ESTORNO, menos
    // TIPOS_RETENCAO, menos TIPOS_DEDICADOS. Nao ha lista a editar em schemas.js.
    assert.ok(!TIPOS_MOVIMENTO_ROTA.includes(T));
  });

  await test('[declaracao] ENTRADA_RETALHO esta em TIPOS_ISENTOS_DONO', async () => {
    // Declarativo, como RETORNO_TRANSFORMACAO: a guarda do dono (assertSaidaPermitida) so roda
    // para SAIDA, e este tipo e' entrada — a ausencia nao mudaria comportamento hoje. A guarda de
    // verdade (retalho tem de ter o MESMO dono da origem) mora no evento composto da Task 3.
    assert.ok(TIPOS_ISENTOS_DONO.includes(T));
  });

  await test('a rota generica de movimentacao RECUSA ENTRADA_RETALHO', async () => {
    // Gate `movimentar` e' o mais amplo do modulo. Aceitar o tipo la permitiria criar retalho
    // do nada, sem o evento composto (Task 3) e sem a origem que o justifica.
    const mat = await novoMaterial(db);
    const r = await request(app).post('/api/almoxarifado/movimentacoes/v2')
      .send({ material_id: mat, tipo: T, quantidade: 5, justificativa: 'pela porta errada' });
    assert.strictEqual(r.status, 400, `a rota generica aceitou o tipo (status ${r.status})`);
    assert.strictEqual((await est(db, mat)).quantidade_atual, 0);
    // Fix wave final da Etapa 9 (decisao 8 do design): a recusa tem de ENSINAR o caminho —
    // a mensagem antiga mandava para "as telas de Reservas e Inspecoes", que nao criam retalho.
    assert.match(r.body.error, /Gerar retalho/, `a recusa nao ensina o caminho: ${r.body.error}`);
    assert.match(r.body.error, /Sobras e Retalhos/, `a recusa nao aponta a tela certa: ${r.body.error}`);
    assert.ok(!/Reservas e Inspe/.test(r.body.error),
      `a recusa ainda aponta para as telas erradas (Reservas e Inspecoes): ${r.body.error}`);
  });

  await test('[CONTROLE POSITIVO] a rota generica continua aceitando ENTRADA_MANUAL', async () => {
    // Sem isto, um TIPOS_MOVIMENTO_ROTA vazio (ou um refine quebrado) passaria no teste acima.
    const mat = await novoMaterial(db);
    const r = await request(app).post('/api/almoxarifado/movimentacoes/v2')
      .send({ material_id: mat, tipo: 'ENTRADA_MANUAL', quantidade: 5, justificativa: 'entrada normal' });
    assert.strictEqual(r.status, 201, `ENTRADA_MANUAL levou ${r.status}: ${JSON.stringify(r.body)}`);
  });

  await test('ENTRADA_RETALHO com justificativa credita quantidade_atual', async () => {
    const mat = await novoMaterial(db, { atual: 10 });
    const mov = await stockService.registrarMovimentacao(db, ADMIN, {
      material_id: mat, tipo: T, quantidade: 7, justificativa: 'Retalho da chapa CHP-001 (sobra da requisicao REQ-9)',
    });
    assert.ok(mov.id, 'a movimentacao nao foi gravada no livro');
    const e = await est(db, mat);
    assert.strictEqual(e.quantidade_atual, 17);
  });

  await test('ENTRADA_RETALHO sem justificativa e recusado', async () => {
    // movementRules: o tipo muda a resposta a pergunta "de onde veio esse retalho?", e a
    // resposta tem de estar escrita — o vinculo mora na linha da sobra, nao aqui.
    const mat = await novoMaterial(db, { atual: 5 });
    await assert.rejects(
      () => stockService.registrarMovimentacao(db, ADMIN, { material_id: mat, tipo: T, quantidade: 1 }),
      /justificativa/i);
    assert.strictEqual((await est(db, mat)).quantidade_atual, 5, 'creditou mesmo recusando');
  });

  await test('ENTRADA_RETALHO NAO altera custo_medio do material (o servico nunca passa custo)', async () => {
    const mat = await novoMaterial(db, { atual: 20, custo: 15 });
    await stockService.registrarMovimentacao(db, ADMIN, {
      material_id: mat, tipo: T, quantidade: 3, justificativa: 'Retalho da chapa CHP-002',
    });
    const e = await est(db, mat);
    assert.strictEqual(e.quantidade_atual, 23);
    assert.strictEqual(e.custo_medio, 15, 'o credito do retalho mexeu no custo medio preexistente');
    assert.strictEqual(e.custo_unitario, 15, 'o credito do retalho mexeu no custo unitario preexistente');
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
