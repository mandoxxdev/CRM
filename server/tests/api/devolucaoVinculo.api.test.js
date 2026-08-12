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
const { assertInvarianteSerie } = require('../helpers/serieInvariante');

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

  // ── Rota de leitura: as saidas que uma devolucao pode citar (Task 4) ────────────────────────
  //
  // Estes testes moram no MESMO arquivo da validacao de proposito: a rota existe para ALIMENTAR
  // a validacao acima, e o `saldo_devolvivel` que ela publica tem de ser exatamente o numero que
  // `validarSaidaOriginal` usa para recusar. Em arquivos separados os dois lados poderiam
  // divergir sem que nada percebesse — a tela ofereceria devolver 6 e o servidor responderia que
  // so cabem 4, e o operador nao teria como saber quem esta certo.

  await test('saidas-elegiveis lista as entregas do material com o saldo devolvivel', async () => {
    const mat = await novoMaterial(db, { qtd: 100 });
    const saidaA = await entregar(db, mat, 10);
    const saidaB = await entregar(db, mat, 4);
    await request(app).post('/api/almoxarifado/devolucoes')
      .send({ material_id: mat, quantidade: 3, motivo: 'SOBRA_PROJETO', destino: 'ESTOQUE', movimentacao_saida_id: saidaA });

    const res = await request(app).get(`/api/almoxarifado/devolucoes/saidas-elegiveis?material_id=${mat}`);
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    const porId = Object.fromEntries(res.body.map((s) => [s.id, s]));
    assert.strictEqual(porId[saidaA].quantidade_devolvida, 3);
    assert.strictEqual(porId[saidaA].saldo_devolvivel, 7);
    assert.strictEqual(porId[saidaB].quantidade_devolvida, 0);
    assert.strictEqual(porId[saidaB].saldo_devolvivel, 4);
    assert.ok(res.body[0].id > res.body[1].id, 'a lista tem de vir da mais recente para a mais antiga');
  });

  // O TESTE QUE AMARRA AS DUAS PONTAS, na MESMA execucao: le o saldo_devolvivel publicado pela
  // rota e usa aquele numero — nao um literal — contra a validacao de registrarDevolucao. Se um
  // dos lados mudar de definicao (contar devolucao de outro material, ignorar saida cancelada,
  // arredondar diferente), este teste cai; dois testes com numeros escritos a mao nao cairiam.
  await test('[duas pontas] o saldo_devolvivel da rota e exatamente o limite que a validacao aplica', async () => {
    const mat = await novoMaterial(db, { qtd: 100 });
    const saidaId = await entregar(db, mat, 9);
    await request(app).post('/api/almoxarifado/devolucoes')
      .send({ material_id: mat, quantidade: 2, motivo: 'SOBRA_PROJETO', destino: 'ESTOQUE', movimentacao_saida_id: saidaId });

    const lista = await request(app).get(`/api/almoxarifado/devolucoes/saidas-elegiveis?material_id=${mat}`);
    assert.strictEqual(lista.status, 200, JSON.stringify(lista.body));
    const linha = lista.body.find((s) => s.id === saidaId);
    assert.ok(linha, 'a rota nao devolveu a saida que acabou de ser parcialmente devolvida');
    const saldo = linha.saldo_devolvivel;
    assert.ok(saldo > 0, `cenario invalido: a rota publicou saldo ${saldo}`);

    // (a) saldo + 1 tem de ser RECUSADO — a rota nao pode prometer mais do que a validacao aceita.
    const demais = await request(app).post('/api/almoxarifado/devolucoes')
      .send({ material_id: mat, quantidade: saldo + 1, motivo: 'SOBRA_PROJETO', destino: 'ESTOQUE', movimentacao_saida_id: saidaId });
    assert.strictEqual(demais.status, 400,
      `a rota publicou saldo ${saldo} e a validacao aceitou ${saldo + 1}: a tela promete mais do que o servidor cumpre`);

    // (b) exatamente o saldo publicado tem de PASSAR — a rota nao pode prometer menos, senao a
    //     tela bloqueia uma devolucao que o servidor aceitaria e o operador fica sem saida.
    const exato = await request(app).post('/api/almoxarifado/devolucoes')
      .send({ material_id: mat, quantidade: saldo, motivo: 'SOBRA_PROJETO', destino: 'ESTOQUE', movimentacao_saida_id: saidaId });
    assert.strictEqual(exato.status, 201,
      `a rota publicou saldo ${saldo} e a validacao recusou esse mesmo numero: ${JSON.stringify(exato.body)}`);

    // (c) depois de consumir o saldo inteiro, a rota tem de publicar 0 e a validacao recusar 1.
    const depois = await request(app).get(`/api/almoxarifado/devolucoes/saidas-elegiveis?material_id=${mat}`);
    assert.strictEqual(depois.body.find((s) => s.id === saidaId).saldo_devolvivel, 0,
      'a rota continua oferecendo saldo depois de a saida ter sido devolvida por inteiro');
    const maisUm = await request(app).post('/api/almoxarifado/devolucoes')
      .send({ material_id: mat, quantidade: 1, motivo: 'SOBRA_PROJETO', destino: 'ESTOQUE', movimentacao_saida_id: saidaId });
    assert.strictEqual(maisUm.status, 400, `saldo 0 e a validacao aceitou mais 1: ${JSON.stringify(maisUm.body)}`);
  });

  // Linha zerada VOLTA na lista de proposito — "ja devolvido por inteiro" e informacao util, nao
  // ruido; a tela a mostra desabilitada. Se ela sumisse, o operador procuraria uma entrega que o
  // sistema decidiu esconder.
  await test('saidas-elegiveis mantem a saida ja devolvida por inteiro, com saldo 0', async () => {
    const mat = await novoMaterial(db, { qtd: 100 });
    const saidaId = await entregar(db, mat, 5);
    await request(app).post('/api/almoxarifado/devolucoes')
      .send({ material_id: mat, quantidade: 5, motivo: 'SOBRA_PROJETO', destino: 'ESTOQUE', movimentacao_saida_id: saidaId });

    const res = await request(app).get(`/api/almoxarifado/devolucoes/saidas-elegiveis?material_id=${mat}`);
    const linha = res.body.find((s) => s.id === saidaId);
    assert.ok(linha, 'a saida totalmente devolvida sumiu da lista');
    assert.strictEqual(linha.saldo_devolvivel, 0);
  });

  await test('saidas-elegiveis nao oferece descarte, ajuste, entrada nem saida cancelada', async () => {
    const mat = await novoMaterial(db, { qtd: 100 });
    const saidaBoa = await entregar(db, mat, 5);
    const cancelada = await entregar(db, mat, 5);
    await request(app).post(`/api/almoxarifado/movimentacoes/${cancelada}/cancelar`).send({ motivo: 'errada' });
    await stockService.registrarMovimentacao(db, ADMIN, { material_id: mat, tipo: 'SUCATA', quantidade: 2, justificativa: 'quebrou' });
    await stockService.registrarMovimentacao(db, ADMIN, { material_id: mat, tipo: 'PERDA', quantidade: 1, justificativa: 'sumiu' });
    await stockService.registrarMovimentacao(db, ADMIN, { material_id: mat, tipo: 'ENTRADA', quantidade: 9, motivo: 'compra' });

    const res = await request(app).get(`/api/almoxarifado/devolucoes/saidas-elegiveis?material_id=${mat}`);
    assert.deepStrictEqual(res.body.map((s) => s.id), [saidaBoa],
      `a lista precisa conter so a entrega devolvivel, veio ${JSON.stringify(res.body.map((s) => `${s.id}:${s.tipo}`))}`);
  });

  await test('saidas-elegiveis traz as series entregues naquela saida', async () => {
    const mat = await novoMaterial(db, { serie: true });
    const entrada = await request(app).post('/api/almoxarifado/movimentacoes/v2')
      .send({ material_id: mat, tipo: 'ENTRADA', quantidade: 2, series: ['SN-EL-1', 'SN-EL-2'], motivo: 'setup' });
    assert.strictEqual(entrada.status, 201, JSON.stringify(entrada.body));
    const series = await dbAll(db, 'SELECT id, numero FROM series_almoxarifado WHERE material_id = ? ORDER BY numero', [mat]);
    const saida = await request(app).post('/api/almoxarifado/movimentacoes/v2')
      .send({ material_id: mat, tipo: 'SAIDA', quantidade: 1, serie_ids: [series[0].id], justificativa: 'entregue ao tecnico' });
    assert.strictEqual(saida.status, 201, JSON.stringify(saida.body));

    const res = await request(app).get(`/api/almoxarifado/devolucoes/saidas-elegiveis?material_id=${mat}`);
    const linha = res.body.find((s) => s.id === saida.body.id);
    assert.ok(linha, 'a saida com serie nao apareceu na lista');
    assert.deepStrictEqual(linha.series.map((s) => s.numero), ['SN-EL-1']);
    assert.strictEqual(linha.series[0].id, series[0].id);
  });

  // A tela comeca pelo material e mostra a entrega: sem estes campos o operador ve uma lista de
  // datas e quantidades iguais e nao sabe qual delas e a dele.
  await test('saidas-elegiveis identifica a entrega: lote, requisicao, OS, projeto e quem retirou', async () => {
    const mat = await novoMaterial(db, { lote: true });
    const lote = await lotService.criarOuObterLote(db, ADMIN, { material_id: mat, codigo: 'ELEG-L1' });
    await stockService.registrarMovimentacao(db, ADMIN, {
      material_id: mat, tipo: 'ENTRADA', quantidade: 10, lote_id: lote.id, motivo: 'setup' });
    const req1 = await dbRun(db,
      `INSERT INTO requisicoes_almoxarifado (numero, solicitante_id, solicitante_nome)
       VALUES ('REQ-ELEG-1', 1, 'Solicitante Teste')`);
    const saidaId = await entregar(db, mat, 4, {
      lote_id: lote.id, requisicao_id: req1.lastID, os_id: 77, projeto_id: 88 });

    const res = await request(app).get(`/api/almoxarifado/devolucoes/saidas-elegiveis?material_id=${mat}`);
    const linha = res.body.find((s) => s.id === saidaId);
    assert.ok(linha, 'a entrega nao apareceu na lista');
    assert.strictEqual(linha.lote_id, lote.id);
    assert.strictEqual(linha.lote, 'ELEG-L1', `o codigo do lote congelado nao veio: ${linha.lote}`);
    assert.strictEqual(linha.requisicao_id, req1.lastID);
    assert.strictEqual(linha.requisicao_numero, 'REQ-ELEG-1');
    assert.strictEqual(linha.os_id, 77);
    assert.strictEqual(linha.projeto_id, 88);
    assert.strictEqual(linha.usuario_nome, ADMIN.nome);
    assert.ok(linha.created_at, 'a data da entrega nao veio');
    assert.strictEqual(linha.tipo, 'SAIDA');
    assert.strictEqual(linha.quantidade, 4);
  });

  // CONTROLE POSITIVO da separacao por material: a soma de devolucoes e a lista tem de olhar
  // SOMENTE a movimentacao citada. Se o SUM esquecesse o `WHERE movimentacao_saida_id`, o saldo
  // de uma saida cairia por causa de devolucao de outra — e nenhum dos testes acima pegaria,
  // porque todos usam um material com uma unica saida devolvida.
  await test('[controle positivo] devolucao de uma saida nao baixa o saldo da outra', async () => {
    const mat = await novoMaterial(db, { qtd: 100 });
    const saidaA = await entregar(db, mat, 6);
    const saidaB = await entregar(db, mat, 6);
    await request(app).post('/api/almoxarifado/devolucoes')
      .send({ material_id: mat, quantidade: 4, motivo: 'SOBRA_PROJETO', destino: 'ESTOQUE', movimentacao_saida_id: saidaA });

    const res = await request(app).get(`/api/almoxarifado/devolucoes/saidas-elegiveis?material_id=${mat}`);
    const porId = Object.fromEntries(res.body.map((s) => [s.id, s]));
    assert.strictEqual(porId[saidaA].saldo_devolvivel, 2);
    assert.strictEqual(porId[saidaB].saldo_devolvivel, 6,
      'a devolucao da saida A baixou o saldo da saida B — a soma nao esta presa a movimentacao citada');
  });

  await test('saidas-elegiveis sem material_id responde 400', async () => {
    const res = await request(app).get('/api/almoxarifado/devolucoes/saidas-elegiveis');
    assert.strictEqual(res.status, 400, JSON.stringify(res.body));
  });

  // ── Serie na devolucao (Task 5, decisao 10) ─────────────────────────────────────────────────

  /** Entra com N series, entrega a primeira e devolve { saidaId, series }. */
  async function entregarComSerie(materialId, numeros) {
    const entrada = await request(app).post('/api/almoxarifado/movimentacoes/v2')
      .send({ material_id: materialId, tipo: 'ENTRADA', quantidade: numeros.length, series: numeros, motivo: 'setup' });
    assert.strictEqual(entrada.status, 201, JSON.stringify(entrada.body));
    const series = await dbAll(db, 'SELECT id, numero FROM series_almoxarifado WHERE material_id = ? ORDER BY numero', [materialId]);
    const saida = await request(app).post('/api/almoxarifado/movimentacoes/v2')
      .send({ material_id: materialId, tipo: 'SAIDA', quantidade: 1, serie_ids: [series[0].id], justificativa: 'entregue' });
    assert.strictEqual(saida.status, 201, JSON.stringify(saida.body));
    return { saidaId: saida.body.id, series };
  }
  const serieRow = (id) => dbGet(db, 'SELECT * FROM series_almoxarifado WHERE id = ?', [id]);
  const statusDaSerie = async (id) => (await serieRow(id)).status;

  // "A rota respondeu 201" nao prova NADA sobre serie: o saldo pode ter voltado com a peca ainda
  // marcada como entregue. Por isso este teste le a LINHA da serie no banco — status, vinculo de
  // entrada e o vinculo de saida que tem de ser anulado — e ainda cobra o invariante da Etapa 6b.
  await test('devolucao de material com serie reativa a serie da saida', async () => {
    const mat = await novoMaterial(db, { serie: true });
    const { saidaId, series } = await entregarComSerie(mat, ['SN-DEV-1', 'SN-DEV-2']);
    assert.strictEqual(await statusDaSerie(series[0].id), 'ENTREGUE');

    const res = await request(app).post('/api/almoxarifado/devolucoes')
      .send({ material_id: mat, quantidade: 1, motivo: 'NAO_UTILIZADO', destino: 'ESTOQUE',
              movimentacao_saida_id: saidaId, series: ['SN-DEV-1'] });
    assert.strictEqual(res.status, 201, JSON.stringify(res.body));

    const linha = await serieRow(series[0].id);
    assert.strictEqual(linha.status, 'EM_ESTOQUE',
      'a serie devolvida continuou ENTREGUE — o saldo voltou sem a peca correspondente');

    // A entrada de devolucao TEM de ficar gravada na serie: sem isso a peca volta ao estoque sem
    // dizer por qual lancamento voltou, e o estorno dessa entrada nao teria como encontra-la.
    const movs = await movimentosDoMaterial(db, mat);
    const entradaDevolucao = movs.filter((m) => m.tipo === 'ENTRADA_DEVOLUCAO').pop();
    assert.ok(entradaDevolucao, 'nenhuma ENTRADA_DEVOLUCAO foi emitida');
    assert.strictEqual(linha.movimentacao_entrada_id, entradaDevolucao.id,
      `a serie nao aponta para a ENTRADA_DEVOLUCAO que a trouxe de volta: ${linha.movimentacao_entrada_id}`);
    assert.strictEqual(linha.movimentacao_saida_id, null,
      'a serie voltou ao estoque ainda apontando para a saida antiga');
    await assertInvarianteSerie(db, mat);
  });

  await test('devolucao ao estoque de material com serie sem informar a serie e recusada', async () => {
    const mat = await novoMaterial(db, { serie: true });
    const { saidaId } = await entregarComSerie(mat, ['SN-DEV-3']);
    const res = await request(app).post('/api/almoxarifado/devolucoes')
      .send({ material_id: mat, quantidade: 1, motivo: 'NAO_UTILIZADO', destino: 'ESTOQUE', movimentacao_saida_id: saidaId });
    assert.strictEqual(res.status, 400, JSON.stringify(res.body));
    // `s[ée]rie` e nao `serie`: a recusa vem do returnService, cujas mensagens sao acentuadas. O
    // plano assumia a mensagem do motor (sem acento) — assert /serie/i sozinho quebraria aqui.
    assert.match(res.body.error || '', /s[ée]rie/i);
    // A recusa acontece ANTES do INSERT da devolucao. Uma linha gravada sem movimentacao nenhuma
    // continuaria somando em `quantidade_devolvida` e encolheria para sempre o saldo devolvivel
    // da saida citada.
    const devs = await dbAll(db, 'SELECT id FROM devolucoes_material_almoxarifado WHERE material_id = ?', [mat]);
    assert.strictEqual(devs.length, 0, 'a devolucao recusada por falta de serie ficou gravada na tabela');
  });

  await test('devolucao para quarentena tambem aceita serie', async () => {
    const mat = await novoMaterial(db, { serie: true });
    const { saidaId, series } = await entregarComSerie(mat, ['SN-DEV-4']);
    const res = await request(app).post('/api/almoxarifado/devolucoes')
      .send({ material_id: mat, quantidade: 1, motivo: 'ITEM_ERRADO', condicao: 'SUSPEITA', destino: 'QUARENTENA',
              movimentacao_saida_id: saidaId, series: ['SN-DEV-4'] });
    assert.strictEqual(res.status, 201, JSON.stringify(res.body));
    assert.strictEqual(await statusDaSerie(series[0].id), 'EM_ESTOQUE');
    await assertInvarianteSerie(db, mat);
  });

  // Decisao 10: sucatear peca serializada direto na devolucao esta FORA de escopo. O erro tem de
  // ensinar o caminho de dois passos, nao so recusar.
  await test('devolucao para sucata de material com serie recusa e explica o caminho', async () => {
    const mat = await novoMaterial(db, { serie: true });
    const { saidaId } = await entregarComSerie(mat, ['SN-DEV-5']);
    const res = await request(app).post('/api/almoxarifado/devolucoes')
      .send({ material_id: mat, quantidade: 1, motivo: 'DANIFICADO', destino: 'SUCATA',
              movimentacao_saida_id: saidaId, series: ['SN-DEV-5'] });
    assert.strictEqual(res.status, 400, JSON.stringify(res.body));
    assert.match(res.body.error || '', /Movimenta/i,
      `o erro tem de apontar a tela de Movimentacoes como caminho: ${res.body.error}`);
    // Recusa antes de QUALQUER efeito: a devolucao nao pode ficar gravada sem movimentacao.
    const devs = await dbAll(db, 'SELECT id FROM devolucoes_material_almoxarifado WHERE material_id = ?', [mat]);
    assert.strictEqual(devs.length, 0, 'a devolucao recusada ficou gravada na tabela');
  });

  await test('devolucao para retrabalho de material com serie recusa e explica o caminho', async () => {
    const mat = await novoMaterial(db, { serie: true });
    const { saidaId } = await entregarComSerie(mat, ['SN-DEV-6']);
    const res = await request(app).post('/api/almoxarifado/devolucoes')
      .send({ material_id: mat, quantidade: 1, motivo: 'RECUPERAVEL', destino: 'RETRABALHO',
              movimentacao_saida_id: saidaId, series: ['SN-DEV-6'] });
    assert.strictEqual(res.status, 400, JSON.stringify(res.body));
    assert.match(res.body.error || '', /Movimenta/i, res.body.error);
  });

  // A PORTA QUE A DECISAO 10 NAO PODE FECHAR: devolucao AVULSA (sem movimentacao_saida_id) de
  // material serializado. Nao ha saida de onde herdar as series, entao os numeros vem digitados —
  // e o motor aceita tanto numero novo quanto numero que voltou de ENTREGUE. Se `exigeSerie`
  // tivesse sido declarado sem este caminho existir, devolver peca serializada sem citar entrega
  // ficaria impossivel e a limitacao declarada viraria travamento.
  await test('devolucao AVULSA de material com serie continua possivel com series digitadas', async () => {
    const mat = await novoMaterial(db, { serie: true });
    const entrada = await request(app).post('/api/almoxarifado/movimentacoes/v2')
      .send({ material_id: mat, tipo: 'ENTRADA', quantidade: 1, series: ['SN-AVU-1'], motivo: 'setup' });
    assert.strictEqual(entrada.status, 201, JSON.stringify(entrada.body));
    const [serieA] = await dbAll(db, 'SELECT id, numero FROM series_almoxarifado WHERE material_id = ?', [mat]);
    // Sai por um caminho que a devolucao NAO cita (o caso real: entrega antiga, sem registro).
    const saida = await request(app).post('/api/almoxarifado/movimentacoes/v2')
      .send({ material_id: mat, tipo: 'SAIDA', quantidade: 1, serie_ids: [serieA.id], justificativa: 'entregue' });
    assert.strictEqual(saida.status, 201, JSON.stringify(saida.body));

    const res = await request(app).post('/api/almoxarifado/devolucoes')
      .send({ material_id: mat, quantidade: 1, motivo: 'SOBRA_PROJETO', destino: 'ESTOQUE', series: ['SN-AVU-1'] });
    assert.strictEqual(res.status, 201,
      `devolucao avulsa de material serializado ficou impossivel: ${JSON.stringify(res.body)}`);
    const linha = await serieRow(serieA.id);
    assert.strictEqual(linha.status, 'EM_ESTOQUE', 'a serie da devolucao avulsa nao voltou ao estoque');
    assert.strictEqual(linha.movimentacao_saida_id, null);
    await assertInvarianteSerie(db, mat);
  });

  // A limitacao declarada NAO e "material serializado nao pode ir para sucata por devolucao": e
  // "nao da para informar a serie ali". Sem `series`, o destino SUCATA continua passando — a
  // entrada entra sem serie e a SUCATA sai logo depois, saldo liquido zero, invariante fechado.
  await test('devolucao para sucata de material com serie SEM series passa e mantem o invariante', async () => {
    const mat = await novoMaterial(db, { serie: true });
    const { saidaId } = await entregarComSerie(mat, ['SN-DEV-7', 'SN-DEV-8']);
    const antes = await totalDoMaterial(db, mat);
    const res = await request(app).post('/api/almoxarifado/devolucoes')
      .send({ material_id: mat, quantidade: 1, motivo: 'DANIFICADO', destino: 'SUCATA', movimentacao_saida_id: saidaId });
    assert.strictEqual(res.status, 201, JSON.stringify(res.body));
    assert.strictEqual(await totalDoMaterial(db, mat), antes, 'a sucata mexeu no saldo liquido');
    await assertInvarianteSerie(db, mat);
  });

  // CONTROLE POSITIVO da guarda de serie: material SEM controle_serie continua devolvendo sem
  // nada disso — se a exigencia tivesse ficado ampla demais, este teste falharia.
  await test('[controle positivo] material sem controle de serie devolve sem informar serie', async () => {
    const mat = await novoMaterial(db, { qtd: 20 });
    const saidaId = await entregar(db, mat, 5);
    const res = await request(app).post('/api/almoxarifado/devolucoes')
      .send({ material_id: mat, quantidade: 2, motivo: 'SOBRA_PROJETO', destino: 'ESTOQUE', movimentacao_saida_id: saidaId });
    assert.strictEqual(res.status, 201, JSON.stringify(res.body));
  });

  // ── Compensacao da devolucao recusada (conserto fora do plano, achado na Etapa 7) ───────────
  //
  // `registrarDevolucao` grava a linha de `devolucoes_material_almoxarifado` ANTES de emitir as
  // movimentacoes, porque precisa do `id` para montar `referencia: DEV-<id>`. Se o motor recusar
  // DEPOIS disso, a linha ficava gravada: uma devolucao registrada que nunca aconteceu. Os testes
  // abaixo medem as duas consequencias (linha fantasma na listagem; saldo_devolvivel encolhido)
  // e a fronteira da compensacao (movimentacao ja gravada => a linha TEM de ficar).
  //
  // Pre-validacao caso a caso (Tasks 3 e 5) continua sendo a primeira linha de defesa, mas nao
  // fecha o buraco: QUALQUER erro do motor depois do INSERT cai aqui.

  const devolucoesDoMaterial = (matId) => dbAll(db,
    'SELECT * FROM devolucoes_material_almoxarifado WHERE material_id = ?', [matId]);

  // Cenario EXATO da sonda que achou o bug (2026-08-12): material com controle_lote, entrada de
  // 20 no lote L1, saida de 10, devolucao AVULSA de 3 sem informar lote.
  // Medido antes do conserto: resposta 400 e `linhas antes: 0 | depois: 1`.
  await test('[compensacao] devolucao avulsa sem lote recusada nao deixa linha gravada', async () => {
    const mat = await novoMaterial(db, { lote: true });
    const lote = await lotService.criarOuObterLote(db, ADMIN, { material_id: mat, codigo: 'DEV-COMP-L1' });
    await stockService.registrarMovimentacao(db, ADMIN, {
      material_id: mat, tipo: 'ENTRADA', quantidade: 20, lote_id: lote.id, motivo: 'setup' });
    await entregar(db, mat, 10, { lote_id: lote.id });

    const antes = (await devolucoesDoMaterial(mat)).length;
    const res = await request(app).post('/api/almoxarifado/devolucoes')
      .send({ material_id: mat, quantidade: 3, motivo: 'SOBRA_PROJETO', destino: 'ESTOQUE' });
    assert.strictEqual(res.status, 400, JSON.stringify(res.body));
    assert.match(res.body.error || '', /lote/i);
    const depois = (await devolucoesDoMaterial(mat)).length;
    assert.strictEqual(depois, antes,
      `devolucao recusada ficou gravada: linhas antes ${antes} | depois ${depois}`);
    // A mensagem do motor e o que o operador le — a compensacao nao pode masca-la.
    assert.doesNotMatch(res.body.error || '', /compensa|desfaz/i,
      `a compensacao mascarou o erro original do motor: ${res.body.error}`);
  });

  // A CONSEQUENCIA INVISIVEL, e a razao principal deste conserto: a linha fantasma de uma
  // devolucao VINCULADA entra no SUM de `quantidade_devolvida`. Cada recusa encolhia para sempre
  // o quanto ainda podia ser devolvido daquela entrega — e nada avisava.
  //
  // A recusa aqui e legitima e acontece DEPOIS do INSERT: a saida citada nao tem lote (o motor so
  // exige lote em quem declara `exigeLote`, e a entrega direta nao declara), entao a devolucao nao
  // tem de quem herdar e a ENTRADA_DEVOLUCAO — que declara — e recusada.
  await test('[compensacao] devolucao vinculada recusada nao encolhe o saldo_devolvivel da entrega', async () => {
    const mat = await novoMaterial(db, { lote: true, qtd: 20 });
    const saidaId = await entregar(db, mat, 10);

    const saldoDaSaida = async () => {
      const r = await request(app).get(`/api/almoxarifado/devolucoes/saidas-elegiveis?material_id=${mat}`);
      assert.strictEqual(r.status, 200, JSON.stringify(r.body));
      const linha = r.body.find((s) => s.id === saidaId);
      assert.ok(linha, 'a entrega sumiu da lista de saidas elegiveis');
      return linha.saldo_devolvivel;
    };

    const antes = await saldoDaSaida();
    assert.strictEqual(antes, 10, `cenario invalido: a entrega ja nascia com saldo ${antes}`);

    const res = await request(app).post('/api/almoxarifado/devolucoes')
      .send({ material_id: mat, quantidade: 3, motivo: 'SOBRA_PROJETO', destino: 'ESTOQUE', movimentacao_saida_id: saidaId });
    assert.strictEqual(res.status, 400, JSON.stringify(res.body));

    const depois = await saldoDaSaida();
    assert.strictEqual(depois, antes,
      `a devolucao RECUSADA encolheu o saldo devolvivel da entrega: ${antes} -> ${depois}`);
    // E a validacao tem de continuar aceitando os 10 — a ponta de escrita nao pode discordar da
    // leitura. Sem a compensacao, aqui voltaria "restam 7".
    const tudo = await request(app).post('/api/almoxarifado/devolucoes')
      .send({ material_id: mat, quantidade: 10, motivo: 'SOBRA_PROJETO', destino: 'ESTOQUE',
              movimentacao_saida_id: saidaId });
    assert.strictEqual(tudo.status, 400, JSON.stringify(tudo.body));
    assert.doesNotMatch(tudo.body.error || '', /acima do entregue/i,
      `a recusa anterior consumiu saldo da entrega: ${tudo.body.error}`);
  });

  // A FRONTEIRA da compensacao: quando UMA movimentacao ja foi gravada, a linha da devolucao TEM
  // de ficar. Apagar ali seria pior do que o bug — a linha passaria a ser o unico rastro de um
  // movimento que de fato aconteceu no estoque.
  //
  // Cenario alcancavel so pela API: o destino SUCATA emite ENTRADA_DEVOLUCAO e depois SUCATA. Um
  // BLOQUEIO seguido de AJUSTE para menos deixa `quantidade_bloqueada` MAIOR que
  // `quantidade_atual` (inventario achou menos do que o sistema dizia, com parte em quarentena) —
  // disponivel fica negativo, a entrada passa (entrada nao olha disponivel) e a saida da sucata
  // falha. E exatamente o par meio-feito que a pre-validacao da Task 3 evita quando consegue.
  await test('[compensacao] devolucao com movimentacao JA gravada mantem a linha (rastro do estoque)', async () => {
    const mat = await novoMaterial(db, { qtd: 20 });
    const saidaId = await entregar(db, mat, 10);
    await stockService.registrarMovimentacao(db, ADMIN, {
      material_id: mat, tipo: 'BLOQUEIO', quantidade: 8, justificativa: 'lote em analise' });
    await stockService.registrarMovimentacao(db, ADMIN, {
      material_id: mat, tipo: 'AJUSTE', quantidade: 1, justificativa: 'inventario achou menos' });

    const res = await request(app).post('/api/almoxarifado/devolucoes')
      .send({ material_id: mat, quantidade: 3, motivo: 'DANIFICADO', destino: 'SUCATA', movimentacao_saida_id: saidaId });
    assert.strictEqual(res.status, 400,
      `cenario invalido: a sucata passou, o teste nao mede fronteira nenhuma: ${JSON.stringify(res.body)}`);

    const linhas = await devolucoesDoMaterial(mat);
    assert.strictEqual(linhas.length, 1,
      'a compensacao apagou a devolucao cuja ENTRADA_DEVOLUCAO ja tinha mexido no estoque — '
      + 'a linha era o unico rastro do movimento');
    const movs = await movimentosDoMaterial(db, mat);
    const entradaDev = movs.find((m) => m.referencia === `DEV-${linhas[0].id}`);
    assert.ok(entradaDev, 'cenario invalido: nenhuma movimentacao chegou a ser gravada');
    assert.strictEqual(entradaDev.tipo, 'ENTRADA_DEVOLUCAO');
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
