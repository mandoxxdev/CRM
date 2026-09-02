/**
 * Alcance da guarda de `controle_lote` — Etapa 6 (Task 4) + review final (2026-08-10).
 *
 * A Task 4 acendeu a flag exigindo lote em TODA entrada e saida, viesse a chamada de onde viesse.
 * O review final mediu o efeito: ligar "Controle por lote" tornava o material impossivel de
 * entregar por requisicao e de devolver — os fluxos internos chamam o motor sem ter DE ONDE tirar
 * um lote (nao ha campo na tela nem parametro na chamada), e a reserva da requisicao nascia
 * normalmente (RESERVA nao e entrada nem saida), entao o saldo ficava preso numa reserva que nunca
 * podia ser consumida.
 *
 * Decisao do cliente (2026-08-10): a exigencia vale so onde existe COMO informar — movimentacao
 * manual (rotas v1 e v2) e recebimento. Este arquivo trava os dois lados: onde tem de recusar, e
 * onde tem de deixar passar. (A devolucao saiu desta lista de isentos na Etapa 7 — ver os testes
 * marcados [devolucao] no lado 1: agora ela herda o lote da saida original quando cita a entrega,
 * e tem seletor de lote na tela quando e avulsa, entao ja existe COMO informar.) Os testes de recusa passam pelas ROTAS de proposito — e nas rotas que
 * a guarda vive agora (`opcoes.exigeLote`), nao no motor; chamar `registrarMovimentacao` direto
 * (como este arquivo fazia antes) deixaria de provar qualquer coisa sobre o caminho real.
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet } = require('../../services/almoxarifado/db');
const stockService = require('../../services/almoxarifado/stockService');
const lotService = require('../../services/almoxarifado/lotService');
const returnService = require('../../services/almoxarifado/returnService');
const receiptService = require('../../services/almoxarifado/receiptService');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}
const ADMIN = { id: 1, nome: 'Admin Teste', role: 'admin', is_superadmin: 1, email: 'admin@test.com' };
const JUST = { justificativa: 'teste de controle de lote' };

let seq = 0;
async function novoMaterial(db, controlado, qtd = 0) {
  seq += 1;
  const r = await dbRun(db,
    `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, ativo, controle_lote)
     VALUES (?,?,'UN',?,1,?)`, [`CTL-${seq}`, `Material controlado ${seq}`, qtd, controlado ? 1 : 0]);
  return r.lastID;
}
const totalDoMaterial = async (db, id) => (await dbGet(db,
  'SELECT quantidade_atual FROM materiais_almoxarifado WHERE id = ?', [id])).quantidade_atual;

async function criarRequisicao(db, materialId, quantidade) {
  seq += 1;
  const r = await dbRun(db, `INSERT INTO requisicoes_almoxarifado
    (numero, solicitante_id, solicitante_nome, status) VALUES (?, 1, 'Solicitante Teste', 'EM_SEPARACAO')`,
    [`REQ-CTL-${seq}`]);
  const item = await dbRun(db, `INSERT INTO itens_requisicao_almoxarifado
    (requisicao_id, material_id, quantidade_solicitada, quantidade_separada, quantidade_entregue, quantidade_atendida)
    VALUES (?,?,?,?,0,0)`, [r.lastID, materialId, quantidade, quantidade]);
  return { id: r.lastID, itemId: item.lastID };
}

(async () => {
  const { app, db, close } = await createTestApp({ user: ADMIN });

  // ── Lado 1: onde a exigencia TEM de continuar valendo ───────────────────────────────────────

  await test('[rota v2] entrada sem lote em material com controle_lote e recusada', async () => {
    const mat = await novoMaterial(db, true);
    const res = await request(app).post('/api/almoxarifado/movimentacoes/v2')
      .send({ material_id: mat, tipo: 'ENTRADA', quantidade: 10, motivo: 'sem lote' });
    assert.strictEqual(res.status, 400, `esperava 400, veio ${res.status}: ${JSON.stringify(res.body)}`);
    assert.match(res.body.error || '', /lote/i);
    assert.strictEqual(await totalDoMaterial(db, mat), 0, 'entrou estoque mesmo com a movimentacao recusada');
  });

  await test('[rota v2] saida sem lote em material com controle_lote e recusada', async () => {
    const mat = await novoMaterial(db, true);
    const lote = await lotService.criarOuObterLote(db, ADMIN, { material_id: mat, codigo: 'CTL-A' });
    await stockService.registrarMovimentacao(db, ADMIN, {
      material_id: mat, tipo: 'ENTRADA', quantidade: 10, lote_id: lote.id, motivo: 'setup' });

    const res = await request(app).post('/api/almoxarifado/movimentacoes/v2')
      .send({ material_id: mat, tipo: 'SAIDA', quantidade: 1, ...JUST });
    assert.strictEqual(res.status, 400, `esperava 400, veio ${res.status}: ${JSON.stringify(res.body)}`);
    assert.match(res.body.error || '', /lote/i);
    assert.strictEqual(await totalDoMaterial(db, mat), 10, 'saiu estoque mesmo com a movimentacao recusada');
  });

  // O cliente nao pode desligar a exigencia mandando a flag no proprio corpo: `exigeLote` mora no
  // 4o argumento de registrarMovimentacao, nao em `params` (que e `req.body` inteiro).
  await test('[rota v2] o corpo nao consegue desligar a exigencia (exigeLote nao vem do body)', async () => {
    const mat = await novoMaterial(db, true);
    const res = await request(app).post('/api/almoxarifado/movimentacoes/v2')
      .send({ material_id: mat, tipo: 'ENTRADA', quantidade: 10, motivo: 'sem lote', exigeLote: false });
    assert.strictEqual(res.status, 400, `o cliente desligou a guarda pelo body: ${JSON.stringify(res.body)}`);
    assert.strictEqual(await totalDoMaterial(db, mat), 0);
  });

  await test('[rota v1] o modal rapido da tela de Materiais tambem continua recusando', async () => {
    const mat = await novoMaterial(db, true);
    const res = await request(app).post('/api/almoxarifado/movimentacoes')
      .send({ material_id: mat, tipo: 'ENTRADA', quantidade: 10, motivo: 'sem lote' });
    assert.strictEqual(res.status, 400, `esperava 400, veio ${res.status}: ${JSON.stringify(res.body)}`);
    assert.match(res.body.error || '', /lote/i);
    assert.strictEqual(await totalDoMaterial(db, mat), 0);
  });

  await test('[recebimento] nota com item sem lote em material controlado e recusada inteira', async () => {
    const mat = await novoMaterial(db, true);
    const rec = await dbRun(db, `INSERT INTO recebimentos_material_almoxarifado
      (numero, fornecedor_nome, nota_fiscal, status) VALUES ('REC-CTL-1','Acme','NF-CTL-1','EM_ENTRADA_NF')`);
    await dbRun(db, `INSERT INTO recebimentos_material_itens_almoxarifado
      (recebimento_id, material_id, quantidade_esperada, quantidade_recebida) VALUES (?,?,?,?)`,
      [rec.lastID, mat, 5, 5]);
    const recRow = await dbGet(db, 'SELECT * FROM recebimentos_material_almoxarifado WHERE id = ?', [rec.lastID]);

    await assert.rejects(
      () => receiptService.darEntradaEstoque(db, ADMIN, recRow, rec.lastID, {}),
      /lote/i, 'o recebimento aceitou item sem lote em material com controle_lote');
    assert.strictEqual(await totalDoMaterial(db, mat), 0, 'entrou estoque de uma nota recusada');
  });

  // Etapa 7 (Task 3): a devolucao SAIU da lista de fluxos internos isentos, e por isso estes dois
  // testes ficam no lado 1 e nao no lado 2. Ate 2026-08-12 eles afirmavam exatamente o oposto —
  // que a devolucao passava SEM lote. Nao foi teste afrouxado nem apertado por capricho: a
  // isencao existia porque nao havia DE ONDE tirar um lote na devolucao, e agora ha nos dois
  // caminhos — herda da saida original quando a devolucao cita a entrega (movimentacao_saida_id),
  // e a tela de Devolucoes tem seletor de lote quando ela e avulsa. Deixar a isencao de pe agora
  // que existe onde informar significaria devolver material controlado com lote NULL: o saldo
  // voltava para o estoque e ficava PRESO, porque a saida seguinte exige lote e nao acharia
  // nenhum.
  await test('[devolucao] devolucao avulsa sem lote em material com controle_lote e recusada', async () => {
    const mat = await novoMaterial(db, true, 0);
    await assert.rejects(
      () => returnService.registrarDevolucao(db, ADMIN, {
        material_id: mat, quantidade: 4, motivo: 'SOBRA_PROJETO', destino: 'ESTOQUE' }),
      /lote/i);
    assert.strictEqual(await totalDoMaterial(db, mat), 0, 'entrou estoque de uma devolucao recusada');
  });

  await test('[devolucao] devolucao com lote informado passa e o saldo entra COM lote', async () => {
    const mat = await novoMaterial(db, true, 0);
    const lote = await lotService.criarOuObterLote(db, ADMIN, { material_id: mat, codigo: 'CTL-DEV' });
    const r = await returnService.registrarDevolucao(db, ADMIN, {
      material_id: mat, quantidade: 4, motivo: 'SOBRA_PROJETO', destino: 'ESTOQUE', lote_id: lote.id });
    assert.ok(r.id);
    assert.strictEqual(await totalDoMaterial(db, mat), 4);
    const mov = await dbGet(db,
      "SELECT lote_id FROM movimentacoes_almoxarifado WHERE material_id = ? AND tipo = 'ENTRADA_DEVOLUCAO'", [mat]);
    assert.strictEqual(mov.lote_id, lote.id, 'o saldo devolvido entrou sem lote e ficaria preso');
  });

  // ── Lado 2: os fluxos internos que continuam ISENTOS ────────────────────────────────────────

  await test('[requisicao] entrega de material com controle_lote passa SEM lote', async () => {
    const mat = await novoMaterial(db, true);
    const lote = await lotService.criarOuObterLote(db, ADMIN, { material_id: mat, codigo: 'CTL-REQ' });
    await stockService.registrarMovimentacao(db, ADMIN, {
      material_id: mat, tipo: 'ENTRADA', quantidade: 20, lote_id: lote.id, motivo: 'setup' });

    const { id: reqId, itemId } = await criarRequisicao(db, mat, 5);
    const res = await request(app).put(`/api/almoxarifado/requisicoes/${reqId}/entregar`)
      .send({ itens_atendidos: [{ item_id: itemId, quantidade_atendida: 5 }] });

    assert.strictEqual(res.status, 200,
      `a entrega travou em material com controle_lote (nao ha campo de lote na requisicao): ${JSON.stringify(res.body)}`);
    assert.strictEqual(await totalDoMaterial(db, mat), 15);
  });

  await test('[requisicao] exclusao administrativa (ENTRADA de estorno) passa SEM lote', async () => {
    const mat = await novoMaterial(db, true);
    const lote = await lotService.criarOuObterLote(db, ADMIN, { material_id: mat, codigo: 'CTL-EXC' });
    await stockService.registrarMovimentacao(db, ADMIN, {
      material_id: mat, tipo: 'ENTRADA', quantidade: 20, lote_id: lote.id, motivo: 'setup' });

    const { id: reqId, itemId } = await criarRequisicao(db, mat, 5);
    const entrega = await request(app).put(`/api/almoxarifado/requisicoes/${reqId}/entregar`)
      .send({ itens_atendidos: [{ item_id: itemId, quantidade_atendida: 5 }] });
    assert.strictEqual(entrega.status, 200, JSON.stringify(entrega.body));

    const res = await request(app).delete(`/api/almoxarifado/requisicoes/${reqId}`)
      .send({ justificativa: 'exclusao de teste' });
    assert.strictEqual(res.status, 200,
      `o estorno da exclusao travou em material com controle_lote: ${JSON.stringify(res.body)}`);
    assert.strictEqual(await totalDoMaterial(db, mat), 20, 'o estorno nao devolveu o saldo');
  });

  // ── Comportamentos que nao mudaram ──────────────────────────────────────────────────────────

  await test('com lote, o material controlado movimenta normalmente pela rota v2', async () => {
    const mat = await novoMaterial(db, true);
    const lote = await lotService.criarOuObterLote(db, ADMIN, { material_id: mat, codigo: 'CTL-B' });
    const entrada = await request(app).post('/api/almoxarifado/movimentacoes/v2')
      .send({ material_id: mat, tipo: 'ENTRADA', quantidade: 10, lote_id: lote.id, motivo: 'setup' });
    assert.strictEqual(entrada.status, 201, JSON.stringify(entrada.body));
    const saida = await request(app).post('/api/almoxarifado/movimentacoes/v2')
      .send({ material_id: mat, tipo: 'SAIDA', quantidade: 3, lote_id: lote.id, ...JUST });
    assert.strictEqual(saida.status, 201, JSON.stringify(saida.body));
    assert.strictEqual(await totalDoMaterial(db, mat), 7);
  });

  await test('material SEM controle_lote continua movimentando sem lote', async () => {
    const mat = await novoMaterial(db, false);
    await stockService.registrarMovimentacao(db, ADMIN, {
      material_id: mat, tipo: 'ENTRADA', quantidade: 10, motivo: 'sem controle' }, { exigeLote: true });
    await stockService.registrarMovimentacao(db, ADMIN, {
      material_id: mat, tipo: 'SAIDA', quantidade: 4, ...JUST }, { exigeLote: true });
    assert.strictEqual(await totalDoMaterial(db, mat), 6);
  });

  // AJUSTE e contagem de inventario: exigir lote nele travaria a regularizacao do saldo que
  // existe fisicamente sem lote conhecido — justamente o caminho de saida para quem ligou a flag
  // com estoque antigo em casa. Isento por tipo, independente de quem chama.
  await test('AJUSTE nao exige lote nem em material controlado, nem na rota manual', async () => {
    const mat = await novoMaterial(db, true);
    const res = await request(app).post('/api/almoxarifado/movimentacoes/v2')
      .send({ material_id: mat, tipo: 'AJUSTE', quantidade: 5, justificativa: 'contagem de inventario' });
    assert.strictEqual(res.status, 201, JSON.stringify(res.body));
    assert.strictEqual(await totalDoMaterial(db, mat), 5);
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
