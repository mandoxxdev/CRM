/**
 * Etapa 9, Task 5 — SUCATA sai da rota generica de movimentacao, vira tipo dedicado.
 *
 * Precedente: DEVOLUCAO_CLIENTE (Etapa 8) e ENTRADA_RETALHO (Etapa 9, Task 2) — mesmo raciocinio.
 * A v2 (`POST /movimentacoes/v2`) tem gate `movimentar`, o mais amplo do modulo. Enquanto SUCATA
 * era aceito la, o teste que a spec 15 exige ("sucatear sem dupla aprovacao falha") era
 * IMPOSSIVEL de cumprir: bastava mandar {tipo:'SUCATA'} na v2 para sucatear sem passar pela rota
 * de sucateamento (Task 6/7), que e onde a dupla aprovacao vai morar. Aceitar o tipo na v2
 * tornaria a exigencia decorativa — exatamente o padrao que tirou DEVOLUCAO do formulario na
 * Etapa 7 (ver comentario em MovimentacoesAlmoxarifado.js:26-31) e DEVOLUCAO_CLIENTE da v2 na
 * Etapa 8 (schemas.js:35-39).
 *
 * O que continua igual: SUCATA continua em TIPOS_MOVIMENTO, TIPOS_ISENTOS_DONO,
 * TIPOS_SAIDA_COM_DONO e movementRules (exige justificativa) — so a PORTA HTTP generica fecha.
 * Os caminhos legitimos chamam stockService.registrarMovimentacao DIRETO, por fora da v2:
 *  - returnService (devolucao com destino SUCATA: ENTRADA_DEVOLUCAO seguido de SUCATA) — a
 *    cobertura funda desse par mora em devolucaoDestinos.api.test.js, que TEM de continuar verde
 *    depois desta mudanca (nao duplicado aqui, so um smoke de regressao abaixo).
 *  - o servico de sucateamento (Task 6/7 desta etapa), que ainda nao existe.
 *
 * Rota v1 (`POST /api/almoxarifado/movimentacoes`, modal rapido de Materiais): NAO precisa de
 * mudanca. server/routes/almoxarifado.js:633-635 ja tem whitelist propria e mais estreita
 * (`['ENTRADA', 'SAIDA', 'AJUSTE', 'DEVOLUCAO']`) que nunca incluiu SUCATA nem PERDA — SUCATA
 * sempre foi estruturalmente inalcancavel por ali. Sem teste dedicado aqui por isso; a prova e
 * o file:line acima (recusa antes de qualquer chamada ao motor, 400 "Tipo invalido").
 *
 * Executar: cd server && node tests/api/sucataDedicada.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const stockService = require('../../services/almoxarifado/stockService');
const { TIPOS_MOVIMENTO, TIPOS_DEDICADOS } = require('../../services/almoxarifado/schema');
const { TIPOS_MOVIMENTO_ROTA } = require('../../services/almoxarifado/schemas');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}
const ADMIN = { id: 1, nome: 'Admin Teste', role: 'admin', is_superadmin: 1, email: 'admin@test.com' };
const T = 'SUCATA';

let seq = 0;
async function novoMaterial(db, { atual = 100 } = {}) {
  seq += 1;
  const r = await dbRun(db,
    `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, ativo)
     VALUES (?,?,'UN',?,1)`, [`SCT-${seq}`, `Material sucata ${seq}`, atual]);
  return r.lastID;
}
const totalDoMaterial = async (db, id) => (await dbGet(db,
  'SELECT quantidade_atual FROM materiais_almoxarifado WHERE id = ?', [id])).quantidade_atual;

async function entregar(db, materialId, qtd) {
  await stockService.registrarMovimentacao(db, ADMIN, {
    material_id: materialId, tipo: 'SAIDA', quantidade: qtd, justificativa: 'entrega para a producao' });
}

(async () => {
  const { app, db, close } = await createTestApp({ user: ADMIN });

  await test('[declaracao] SUCATA continua em TIPOS_MOVIMENTO e passa a estar em TIPOS_DEDICADOS', async () => {
    assert.ok(TIPOS_MOVIMENTO.includes(T), 'o tipo nao pode sumir de TIPOS_MOVIMENTO — o motor ainda precisa aceita-lo (fora da rota)');
    assert.ok(TIPOS_DEDICADOS.includes(T), 'o tipo nao entrou em TIPOS_DEDICADOS');
  });

  await test('[declaracao] entrar em TIPOS_DEDICADOS ja tira SUCATA da rota generica', async () => {
    // TIPOS_MOVIMENTO_ROTA e DERIVADO (schemas.js:54-56): TIPOS_MOVIMENTO menos ESTORNO, menos
    // TIPOS_RETENCAO, menos TIPOS_DEDICADOS. Nao ha segunda lista a editar em schemas.js.
    assert.ok(!TIPOS_MOVIMENTO_ROTA.includes(T));
  });

  await test('a rota generica de movimentacao (v2) RECUSA SUCATA com 400 e nao mexe no saldo', async () => {
    const mat = await novoMaterial(db);
    const r = await request(app).post('/api/almoxarifado/movimentacoes/v2')
      .send({ material_id: mat, tipo: T, quantidade: 5, justificativa: 'pela porta errada' });
    assert.strictEqual(r.status, 400, `a rota generica aceitou o tipo (status ${r.status}): ${JSON.stringify(r.body)}`);
    assert.strictEqual(await totalDoMaterial(db, mat), 100, 'a recusa nao podia mexer no saldo');
  });

  await test('[CONTROLE POSITIVO] a rota generica continua aceitando PERDA (so SUCATA saiu)', async () => {
    // Sem isto, um TIPOS_MOVIMENTO_ROTA vazio (ou um refine quebrado que recusa tudo) passaria
    // no teste acima sem provar nada especifico de SUCATA.
    const mat = await novoMaterial(db);
    const r = await request(app).post('/api/almoxarifado/movimentacoes/v2')
      .send({ material_id: mat, tipo: 'PERDA', quantidade: 5, justificativa: 'extraviada' });
    assert.strictEqual(r.status, 201, `PERDA levou ${r.status}: ${JSON.stringify(r.body)}`);
  });

  await test('SUCATA via motor direto (fora da v2) ainda exige justificativa — a regra de negocio nao mudou de lugar', async () => {
    // Cobertura que saiu de movimentoRegras.api.test.js: aquele arquivo so testa a v2, e a v2
    // nao alcanca mais este tipo. A regra (movementRules.REGRAS_VINCULO.SUCATA.justificativa)
    // continua valendo para quem chama o motor por dentro — devolucao destino sucata e o futuro
    // servico de sucateamento tem de continuar mandando justificativa.
    const mat = await novoMaterial(db);
    await assert.rejects(
      () => stockService.registrarMovimentacao(db, ADMIN, { material_id: mat, tipo: T, quantidade: 1 }),
      /justificativa/i);
    assert.strictEqual(await totalDoMaterial(db, mat), 100, 'baixou mesmo recusando por falta de justificativa');

    const mov = await stockService.registrarMovimentacao(db, ADMIN,
      { material_id: mat, tipo: T, quantidade: 4, justificativa: 'material danificado' });
    assert.ok(mov.id, 'a movimentacao nao foi gravada no livro');
    assert.strictEqual(await totalDoMaterial(db, mat), 96);
  });

  await test('[regressao] devolucao com destino SUCATA continua funcionando pelo motor (par ENTRADA_DEVOLUCAO+SUCATA)', async () => {
    // Smoke de regressao apenas — a sonda funda (saldo nao dobra a baixa) e o controle positivo
    // completo moram em devolucaoDestinos.api.test.js, que continua rodando sozinho na suite e
    // TEM de continuar verde. Este teste so prova que o caminho HTTP de devolucoes (que chama
    // returnService, que chama stockService DIRETO) nao foi afetado por SUCATA sair da v2.
    const mat = await novoMaterial(db, { atual: 100 });
    await entregar(db, mat, 10);
    assert.strictEqual(await totalDoMaterial(db, mat), 90, 'setup errado: a saida nao baixou 10');
    const saida = await dbGet(db,
      'SELECT id FROM movimentacoes_almoxarifado WHERE material_id = ? AND tipo = ? ORDER BY id DESC LIMIT 1',
      [mat, 'SAIDA']);

    const res = await request(app).post('/api/almoxarifado/devolucoes')
      .send({ material_id: mat, quantidade: 3, motivo: 'DANIFICADO', condicao: 'DANIFICADA',
        destino: 'SUCATA', movimentacao_saida_id: saida.id });
    assert.strictEqual(res.status, 201, JSON.stringify(res.body));
    assert.strictEqual(await totalDoMaterial(db, mat), 90, 'a devolucao para sucata nao pode alterar o saldo liquido');

    const tipos = (await dbAll(db,
      'SELECT tipo FROM movimentacoes_almoxarifado WHERE material_id = ? ORDER BY id', [mat]))
      .map((m) => m.tipo);
    assert.deepStrictEqual(tipos, ['SAIDA', 'ENTRADA_DEVOLUCAO', 'SUCATA'],
      'o par ENTRADA_DEVOLUCAO+SUCATA continua sendo emitido pelo motor, por fora da v2');
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
