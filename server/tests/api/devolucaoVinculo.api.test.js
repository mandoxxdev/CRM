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

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
