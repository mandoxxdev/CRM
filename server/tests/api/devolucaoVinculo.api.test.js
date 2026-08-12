/**
 * Etapa 7, Tasks 3/4/5 — devolucao vinculada a saida original.
 *
 * Ate esta etapa a devolucao aceitava qualquer quantidade de qualquer material, sem dizer de qual
 * entrega veio: nao havia "nao devolver mais do que foi entregue" nem rastro da saida que estava
 * sendo desfeita. E a entrada de devolucao gravava lote_id NULL mesmo em material controlado,
 * criando saldo que a saida seguinte nao conseguia consumir (a saida exige lote e nao achava
 * nenhum).
 *
 * Decisao 2 do design: o vinculo e OPCIONAL, mas VALIDADO quando informado. Devolucao avulsa
 * continua possivel (sobra antiga, material entregue antes do sistema, entrega sem registro);
 * obrigatorio foi descartado porque tornaria impossivel devolver o que saiu por um caminho sem
 * registro.
 *
 * Executar: cd server && node tests/api/devolucaoVinculo.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const stockService = require('../../services/almoxarifado/stockService');
const lotService = require('../../services/almoxarifado/lotService');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}
const ADMIN = { id: 1, nome: 'Admin Teste', role: 'admin', is_superadmin: 1, email: 'admin@test.com' };

let seq = 0;
async function novoMaterial(db, { lote = false, serie = false, qtd = 0 } = {}) {
  seq += 1;
  const r = await dbRun(db,
    `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, ativo, controle_lote, controle_serie)
     VALUES (?,?,'UN',?,1,?,?)`,
    [`DEVV-${seq}`, `Material vinculo ${seq}`, qtd, lote ? 1 : 0, serie ? 1 : 0]);
  return r.lastID;
}
const totalDoMaterial = async (db, id) => (await dbGet(db,
  'SELECT quantidade_atual FROM materiais_almoxarifado WHERE id = ?', [id])).quantidade_atual;
const materialRow = (db, id) => dbGet(db, 'SELECT * FROM materiais_almoxarifado WHERE id = ?', [id]);
const devolucaoRow = (db, id) => dbGet(db, 'SELECT * FROM devolucoes_material_almoxarifado WHERE id = ?', [id]);
const movimentosDoMaterial = (db, id) => dbAll(db,
  'SELECT id, tipo, quantidade, lote_id, referencia FROM movimentacoes_almoxarifado WHERE material_id = ? ORDER BY id', [id]);

/** Entrega N unidades e devolve o id da movimentacao de saida (o que a devolucao vai citar). */
async function entregar(db, materialId, qtd, extra = {}) {
  const mov = await stockService.registrarMovimentacao(db, ADMIN, {
    material_id: materialId, tipo: 'SAIDA', quantidade: qtd,
    justificativa: 'entrega para a producao', ...extra });
  return mov.id;
}

(async () => {
  const { app, db, close } = await createTestApp({ user: ADMIN });

  // ── Validacao do vinculo ────────────────────────────────────────────────────────────────────

  await test('devolucao acima da quantidade entregue falha', async () => {
    const mat = await novoMaterial(db, { qtd: 100 });
    const saidaId = await entregar(db, mat, 10);
    const res = await request(app).post('/api/almoxarifado/devolucoes')
      .send({ material_id: mat, quantidade: 11, motivo: 'SOBRA_PROJETO', destino: 'ESTOQUE', movimentacao_saida_id: saidaId });
    assert.strictEqual(res.status, 400, JSON.stringify(res.body));
    // A mensagem TEM de dizer quanto resta — mensagem que nao diz o numero obriga o operador a adivinhar.
    assert.match(res.body.error || '', /10/, `a mensagem nao diz o saldo devolvivel: ${res.body.error}`);
    assert.strictEqual(await totalDoMaterial(db, mat), 90, 'devolucao recusada mexeu no saldo');
  });

  await test('devolucao parcial soma com a anterior no limite do entregue', async () => {
    const mat = await novoMaterial(db, { qtd: 100 });
    const saidaId = await entregar(db, mat, 10);
    const a = await request(app).post('/api/almoxarifado/devolucoes')
      .send({ material_id: mat, quantidade: 6, motivo: 'SOBRA_PROJETO', destino: 'ESTOQUE', movimentacao_saida_id: saidaId });
    assert.strictEqual(a.status, 201, JSON.stringify(a.body));
    const b = await request(app).post('/api/almoxarifado/devolucoes')
      .send({ material_id: mat, quantidade: 5, motivo: 'SOBRA_PROJETO', destino: 'ESTOQUE', movimentacao_saida_id: saidaId });
    assert.strictEqual(b.status, 400, `6 + 5 > 10 e passou: ${JSON.stringify(b.body)}`);
    const c = await request(app).post('/api/almoxarifado/devolucoes')
      .send({ material_id: mat, quantidade: 4, motivo: 'SOBRA_PROJETO', destino: 'ESTOQUE', movimentacao_saida_id: saidaId });
    assert.strictEqual(c.status, 201, `6 + 4 = 10 tinha de passar: ${JSON.stringify(c.body)}`);
  });

  await test('devolucao sem saida original valida falha', async () => {
    const mat = await novoMaterial(db, { qtd: 100 });
    const outro = await novoMaterial(db, { qtd: 100 });

    // (a) id inexistente
    const inexistente = await request(app).post('/api/almoxarifado/devolucoes')
      .send({ material_id: mat, quantidade: 1, motivo: 'SOBRA_PROJETO', destino: 'ESTOQUE', movimentacao_saida_id: 999999 });
    assert.strictEqual(inexistente.status, 400, JSON.stringify(inexistente.body));
    assert.match(inexistente.body.error || '', /encontrada/i);

    // (b) saida de OUTRO material
    const saidaOutro = await entregar(db, outro, 5);
    const materialErrado = await request(app).post('/api/almoxarifado/devolucoes')
      .send({ material_id: mat, quantidade: 1, motivo: 'SOBRA_PROJETO', destino: 'ESTOQUE', movimentacao_saida_id: saidaOutro });
    assert.strictEqual(materialErrado.status, 400, JSON.stringify(materialErrado.body));
    assert.match(materialErrado.body.error || '', /outro material/i);

    // (c) saida CANCELADA (estornada)
    const saidaId = await entregar(db, mat, 5);
    await request(app).post(`/api/almoxarifado/movimentacoes/${saidaId}/cancelar`).send({ motivo: 'entrega errada' });
    const cancelada = await request(app).post('/api/almoxarifado/devolucoes')
      .send({ material_id: mat, quantidade: 1, motivo: 'SOBRA_PROJETO', destino: 'ESTOQUE', movimentacao_saida_id: saidaId });
    assert.strictEqual(cancelada.status, 400, JSON.stringify(cancelada.body));
    assert.match(cancelada.body.error || '', /cancelada/i);

    // (d) movimentacao que NAO e uma entrega devolvivel (uma ENTRADA)
    const entrada = await stockService.registrarMovimentacao(db, ADMIN, {
      material_id: mat, tipo: 'ENTRADA', quantidade: 5, motivo: 'compra' });
    const tipoErrado = await request(app).post('/api/almoxarifado/devolucoes')
      .send({ material_id: mat, quantidade: 1, motivo: 'SOBRA_PROJETO', destino: 'ESTOQUE', movimentacao_saida_id: entrada.id });
    assert.strictEqual(tipoErrado.status, 400, JSON.stringify(tipoErrado.body));
    assert.match(tipoErrado.body.error || '', /ENTRADA/);
  });

  // ── Efeito no saldo (regras essenciais da spec 12) ──────────────────────────────────────────

  await test('devolucao boa aumenta saldo com movimentacao vinculada', async () => {
    const mat = await novoMaterial(db, { qtd: 100 });
    const saidaId = await entregar(db, mat, 10);
    const res = await request(app).post('/api/almoxarifado/devolucoes')
      .send({ material_id: mat, quantidade: 4, motivo: 'SOBRA_PROJETO', condicao: 'BOA', destino: 'ESTOQUE', movimentacao_saida_id: saidaId });
    assert.strictEqual(res.status, 201, JSON.stringify(res.body));
    assert.strictEqual(await totalDoMaterial(db, mat), 94);

    const row = await devolucaoRow(db, res.body.id);
    assert.strictEqual(row.movimentacao_saida_id, saidaId, 'o vinculo com a saida nao foi gravado');
    const entradaDev = (await movimentosDoMaterial(db, mat)).find((m) => m.tipo === 'ENTRADA_DEVOLUCAO');
    assert.strictEqual(entradaDev.referencia, `DEV-${res.body.id}`);
  });

  await test('devolucao para quarentena nao aumenta disponivel', async () => {
    const mat = await novoMaterial(db, { qtd: 100 });
    const saidaId = await entregar(db, mat, 10);
    const res = await request(app).post('/api/almoxarifado/devolucoes')
      .send({ material_id: mat, quantidade: 6, motivo: 'ITEM_ERRADO', condicao: 'SUSPEITA', destino: 'QUARENTENA', movimentacao_saida_id: saidaId });
    assert.strictEqual(res.status, 201, JSON.stringify(res.body));

    const m = await materialRow(db, mat);
    assert.strictEqual(m.quantidade_atual, 96, 'o fisico tem de voltar (o material esta no galpao)');
    assert.strictEqual(m.quantidade_bloqueada, 6, 'a quarentena precisa bloquear o que voltou');
    const disponivel = m.quantidade_atual - (m.quantidade_reservada || 0) - (m.quantidade_bloqueada || 0) - (m.quantidade_em_inspecao || 0);
    assert.strictEqual(disponivel, 90, 'a devolucao suspeita entrou no disponivel');
  });

  await test('devolucao para sucata nao baixa estoque duas vezes (regressao do bug da Task 1)', async () => {
    const mat = await novoMaterial(db, { qtd: 100 });
    const saidaId = await entregar(db, mat, 10);
    const res = await request(app).post('/api/almoxarifado/devolucoes')
      .send({ material_id: mat, quantidade: 3, motivo: 'DANIFICADO', condicao: 'DANIFICADA', destino: 'SUCATA', movimentacao_saida_id: saidaId });
    assert.strictEqual(res.status, 201, JSON.stringify(res.body));
    assert.strictEqual(await totalDoMaterial(db, mat), 90);
  });

  await test('[controle positivo] devolucao para estoque no mesmo arquivo soma', async () => {
    const mat = await novoMaterial(db, { qtd: 100 });
    const saidaId = await entregar(db, mat, 10);
    await request(app).post('/api/almoxarifado/devolucoes')
      .send({ material_id: mat, quantidade: 2, motivo: 'SOBRA_PROJETO', destino: 'ESTOQUE', movimentacao_saida_id: saidaId });
    assert.strictEqual(await totalDoMaterial(db, mat), 92,
      'a medicao de saldo deste arquivo esta cega — nenhum numero se moveu');
  });

  // ── Lote (decisao 4) ────────────────────────────────────────────────────────────────────────

  await test('devolucao herda o lote da saida original', async () => {
    const mat = await novoMaterial(db, { lote: true });
    const lote = await lotService.criarOuObterLote(db, ADMIN, { material_id: mat, codigo: 'DEV-LOTE-1' });
    await stockService.registrarMovimentacao(db, ADMIN, {
      material_id: mat, tipo: 'ENTRADA', quantidade: 20, lote_id: lote.id, motivo: 'setup' });
    const saidaId = await entregar(db, mat, 8, { lote_id: lote.id });

    const res = await request(app).post('/api/almoxarifado/devolucoes')
      .send({ material_id: mat, quantidade: 3, motivo: 'SOBRA_PROJETO', destino: 'ESTOQUE', movimentacao_saida_id: saidaId });
    assert.strictEqual(res.status, 201, JSON.stringify(res.body));

    const row = await devolucaoRow(db, res.body.id);
    assert.strictEqual(row.lote_id, lote.id, 'a devolucao nao herdou o lote da saida');
    const entradaDev = (await movimentosDoMaterial(db, mat)).find((m) => m.tipo === 'ENTRADA_DEVOLUCAO');
    assert.strictEqual(entradaDev.lote_id, lote.id,
      'o saldo devolvido entrou sem lote — a saida seguinte nao vai conseguir consumi-lo');
  });

  await test('devolucao avulsa de material com controle de lote exige lote informado', async () => {
    const mat = await novoMaterial(db, { lote: true });
    const res = await request(app).post('/api/almoxarifado/devolucoes')
      .send({ material_id: mat, quantidade: 3, motivo: 'SOBRA_PROJETO', destino: 'ESTOQUE' });
    assert.strictEqual(res.status, 400,
      `agora existe onde informar o lote nos dois caminhos, entao a devolucao nao e mais isenta: ${JSON.stringify(res.body)}`);
    assert.match(res.body.error || '', /lote/i);
    assert.strictEqual(await totalDoMaterial(db, mat), 0, 'entrou saldo de uma devolucao recusada');
  });

  await test('devolucao avulsa COM lote informado passa', async () => {
    const mat = await novoMaterial(db, { lote: true });
    const lote = await lotService.criarOuObterLote(db, ADMIN, { material_id: mat, codigo: 'DEV-LOTE-2' });
    const res = await request(app).post('/api/almoxarifado/devolucoes')
      .send({ material_id: mat, quantidade: 3, motivo: 'SOBRA_PROJETO', destino: 'ESTOQUE', lote_id: lote.id });
    assert.strictEqual(res.status, 201, JSON.stringify(res.body));
    assert.strictEqual((await devolucaoRow(db, res.body.id)).lote_id, lote.id);
  });

  // ARMADILHA da Task 3: SUCATA faz entrada e depois saida. Sem pre-validacao, um lote bloqueado
  // deixaria a entrada passar e a saida falhar — o material entrava e nao saia (estado parcial,
  // e nao ha transacao neste modulo).
  //
  // Este teste mede o LIVRO tambem, nao so o saldo: se a pre-validacao nao existir, a
  // ENTRADA_DEVOLUCAO fica gravada em movimentacoes_almoxarifado mesmo que alguem "conserte" o
  // saldo por outro caminho. Estado parcial e exatamente isso — uma metade do par no livro.
  await test('devolucao para sucata com lote bloqueado falha ANTES de creditar o estoque', async () => {
    const mat = await novoMaterial(db, { lote: true });
    const lote = await lotService.criarOuObterLote(db, ADMIN, { material_id: mat, codigo: 'DEV-LOTE-BLOQ' });
    await stockService.registrarMovimentacao(db, ADMIN, {
      material_id: mat, tipo: 'ENTRADA', quantidade: 10, lote_id: lote.id, motivo: 'setup' });
    const saidaId = await entregar(db, mat, 5, { lote_id: lote.id });
    await dbRun(db, "UPDATE lotes_almoxarifado SET status = 'BLOQUEADO', status_motivo = 'ensaio' WHERE id = ?", [lote.id]);

    const antes = await totalDoMaterial(db, mat);
    const livroAntes = (await movimentosDoMaterial(db, mat)).map((m) => m.tipo);
    const res = await request(app).post('/api/almoxarifado/devolucoes')
      .send({ material_id: mat, quantidade: 2, motivo: 'DANIFICADO', destino: 'SUCATA', movimentacao_saida_id: saidaId });
    assert.strictEqual(res.status, 400, JSON.stringify(res.body));
    assert.match(res.body.error || '', /bloqueado/i);
    assert.strictEqual(await totalDoMaterial(db, mat), antes,
      'estado parcial: a entrada da sucata creditou o estoque e a saida falhou depois');
    const livroDepois = (await movimentosDoMaterial(db, mat)).map((m) => m.tipo);
    assert.deepStrictEqual(livroDepois, livroAntes,
      `estado parcial no livro: a devolucao recusada deixou lancamento para tras (${livroDepois.join(',')})`);
    const devolucao = await dbGet(db,
      'SELECT COUNT(*) AS n FROM devolucoes_material_almoxarifado WHERE material_id = ?', [mat]);
    assert.strictEqual(devolucao.n, 0, 'a devolucao recusada ficou gravada na tabela de devolucoes');
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
