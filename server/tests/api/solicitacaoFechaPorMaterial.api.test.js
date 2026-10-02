/**
 * Etapa 72, T1 (RN-01..RN-07 + a revisao da Fase 2) — a SOLICITACAO DE COMPRA QUE FECHA QUANDO O
 * MATERIAL DELA CHEGA, nao na primeira nota do pedido.
 *
 * ── O DEFEITO QUE ESTE ARQUIVO FECHA (B22(a) da Etapa 14, revogada) ──────────────────────────────
 * Ate a 72, `fecharSolicitacoesDoPedido` virava `RECEBIDA` toda solicitacao VINCULADO do pedido na
 * PRIMEIRA nota processada, parcial ou nao, e mesmo quando o material dela nem tinha chegado. Medido
 * pela sonda da Fase 0 (pelas rotas): depois da nota de 4 de 10, a sugestao mandava comprar 6 (o que
 * ainda vinha pelo pedido) e o `verificar-minimos` abria outra solicitacao de 10. E o
 * `verificar-minimos` ja duplicava ANTES de qualquer nota, porque o dedupe olhava so PENDENTE.
 *
 * ── A REGRA (contrato da T1, com a Fase 2 do plano) ──────────────────────────────────────────────
 * - fecha por (pedido, material): material completo no pedido (MATERIAL_COMPLETO), ou o que chegou
 *   cobre o que as solicitacoes do par pediram (SOLICITADO_RECEBIDO), ou o material nem tem linha no
 *   pedido (SEM_LINHA_NO_PEDIDO, a regra de antes, legado);
 * - o "a caminho" e o que FALTA chegar, por solicitacao, com o recebido do par rateado em ordem de id
 *   e cada solicitacao enxergando so o que chegou depois do vinculo dela (`recebido_no_vinculo`);
 * - pedido encerrado (recebido/cancelado/rejeitado) nao traz nada;
 * - o `verificar-minimos` nao duplica o que esta vindo (VINCULADO de pedido vivo, dentro do horizonte).
 *
 * ── POR QUE ROTA E SERVICO ───────────────────────────────────────────────────────────────────────
 * A nota fecha a solicitacao por DUAS portas (`/processar` e o `/aprovar` direto) e o gancho e uma
 * funcao exportada; (S1)/(S2) chamam o servico direto com a linha somada a mao, o resto entra pelas
 * rotas reais (pedido pelo `POST /api/compras/pedidos` com `solicitacao_id`, nota pelas seis portas).
 *
 * Datas: o horizonte de 60 dias e medido com `datetime('now', ...)` do SQLite, nunca com o "hoje" do
 * JS (UTC perto da meia-noite muda o dia).
 *
 * Executar: cd server && node tests/api/solicitacaoFechaPorMaterial.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const purchaseService = require('../../services/almoxarifado/purchaseService');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

const ADMIN = { id: 272, nome: 'Admin E72 T1', role: 'admin', is_superadmin: 1, email: 'admin@test.com' };

(async () => {
  const { app, db, setUser, close } = await createTestApp({ user: ADMIN });

  const forn = await dbRun(db,
    "INSERT INTO fornecedores (razao_social, cnpj, status) VALUES ('Fornecedor E72 T1','72000111000172','ativo')");

  let seq = 0;
  /** Material abaixo do minimo (saldo 0, maxima 0): o `verificar-minimos` abre solicitacao = minimo. */
  async function novoMaterial(minimo) {
    seq += 1;
    return (await dbRun(db, `INSERT INTO materiais_almoxarifado
      (codigo, nome, unidade, quantidade_atual, quantidade_minima, quantidade_maxima, ativo, fornecedor_id)
      VALUES (?,?,'PC',0,?,0,1,?)`,
    [`MAT-E72T1-${String(seq).padStart(3, '0')}`, `Parafuso E72 T1 ${seq}`, minimo, forn.lastID])).lastID;
  }

  async function verificarMinimos() {
    setUser(ADMIN);
    const r = await request(app).post('/api/almoxarifado/compras/verificar-minimos').send({});
    assert.strictEqual(r.status, 200, `verificar-minimos: ${JSON.stringify(r.body)}`);
    return r.body.criadas;
  }

  /** A solicitacao do material, aberta pela porta real (verificar-minimos). */
  async function solicitacaoPeloMinimo(materialId) {
    const criada = (await verificarMinimos()).find((c) => c.material_id === materialId);
    assert.ok(criada, `fixture: verificar-minimos nao abriu solicitacao do material ${materialId}`);
    return criada.solicitacao_id;
  }

  /** Solicitacao extra do mesmo material (o verificar-minimos deduplica): pela gravacao direta, PENDENTE. */
  const solicitacaoDireta = async (materialId, quantidade) => (await dbRun(db,
    `INSERT INTO solicitacoes_compra_almoxarifado (material_id, quantidade, motivo, status)
     VALUES (?,?,'PONTO_REPOSICAO','PENDENTE')`, [materialId, quantidade])).lastID;

  async function novoPedido(itens, { solicitacaoId, status = 'pendente' } = {}) {
    setUser(ADMIN);
    const corpo = { fornecedor_id: forn.lastID, status, itens };
    if (solicitacaoId) corpo.solicitacao_id = solicitacaoId;
    const r = await request(app).post('/api/compras/pedidos').send(corpo);
    assert.strictEqual(r.status, 201, `fixture: POST do pedido ${r.status} ${JSON.stringify(r.body)}`);
    const linhas = await dbAll(db, 'SELECT id, material_id FROM itens_pedido_compra WHERE pedido_id = ? ORDER BY id',
      [r.body.id]);
    const linhaDe = (materialId) => linhas.find((l) => l.material_id === materialId).id;
    return { pedido: r.body, linhaDe };
  }

  async function vincular(solicitacaoId, pedidoId) {
    setUser(ADMIN);
    const r = await request(app).post(`/api/almoxarifado/compras/solicitacoes/${solicitacaoId}/vincular-pedido`)
      .send({ pedido_compra_id: pedidoId });
    assert.strictEqual(r.status, 200, `vincular-pedido: ${JSON.stringify(r.body)}`);
  }

  const itemDaTela = (materialId, linhaId, qtd) => ({
    material_id: materialId, pedido_item_id: linhaId, quantidade: qtd, quantidade_recebida: qtd,
  });

  let nf = 0;
  /** As seis portas reais ate PROCESSADO. */
  async function receber(pedido, itens) {
    setUser(ADMIN);
    nf += 1;
    const criado = await request(app).post('/api/almoxarifado/recebimentos').send({
      tipo_recebimento: 'PEDIDO_COMPRA', pedido_compra_id: pedido.id, itens,
    });
    assert.strictEqual(criado.status, 201, `POST /recebimentos: ${JSON.stringify(criado.body)}`);
    const recId = criado.body.id;
    assert.strictEqual((await request(app).put(`/api/almoxarifado/recebimentos/${recId}/conferir`).send({ itens })).status, 200);
    for (const acao of ['encaminhar_compras', 'finalizar_compras', 'iniciar_faturamento']) {
      const r = await request(app).post(`/api/almoxarifado/recebimentos/${recId}/workflow`).send({ acao });
      assert.strictEqual(r.status, 200, `workflow ${acao}: ${JSON.stringify(r.body)}`);
    }
    const fiscal = await request(app).put(`/api/almoxarifado/recebimentos/${recId}/fiscal`).send({
      nota_fiscal: `NF-E72T1-${nf}`, fornecedor_id: forn.lastID, fornecedor_nome: 'Fornecedor E72 T1',
      data_emissao_nf: '2026-09-01', data_entrada_nf: '2026-09-02', valor_total_nota: 100, itens,
    });
    assert.strictEqual(fiscal.status, 200, `PUT /fiscal: ${JSON.stringify(fiscal.body)}`);
    const p = await request(app).post(`/api/almoxarifado/recebimentos/${recId}/workflow`).send({ acao: 'processar' });
    assert.strictEqual(p.status, 200, `processar: ${JSON.stringify(p.body)}`);
    return recId;
  }

  /** A segunda porta: `POST /recebimentos/:id/aprovar` direto (ramo `concluirAprovacaoDireta`). */
  async function aprovarDireto(pedido, itens) {
    setUser(ADMIN);
    const criado = await request(app).post('/api/almoxarifado/recebimentos').send({
      tipo_recebimento: 'PEDIDO_COMPRA', pedido_compra_id: pedido.id, itens,
    });
    assert.strictEqual(criado.status, 201, `POST /recebimentos: ${JSON.stringify(criado.body)}`);
    const a = await request(app).post(`/api/almoxarifado/recebimentos/${criado.body.id}/aprovar`).send({});
    assert.strictEqual(a.status, 200, `aprovar: ${JSON.stringify(a.body)}`);
    const rec = await dbGet(db, 'SELECT status FROM recebimentos_material_almoxarifado WHERE id = ?', [criado.body.id]);
    assert.strictEqual(rec.status, 'APROVADO', 'fixture: o /aprovar tinha de cair no ramo direto');
    return criado.body.id;
  }

  const sol = (id) => dbGet(db, `SELECT id, status, quantidade, pedido_compra_id, recebida_em, recebido_no_vinculo
    FROM solicitacoes_compra_almoxarifado WHERE id = ?`, [id]);
  const trilhaRecebida = (id) => dbAll(db, `SELECT acao, dados_novos FROM auditoria_log_almoxarifado
    WHERE entidade = 'solicitacao_compra' AND entidade_id = ? AND acao = 'RECEBIDA' ORDER BY id`, [id]);
  const statusPedido = async (id) => (await dbGet(db, 'SELECT status FROM pedidos_compra WHERE id = ?', [id])).status;

  async function sugestaoDe(materialId) {
    setUser(ADMIN);
    const r = await request(app).get('/api/almoxarifado/reposicao/sugestoes');
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    for (const g of r.body.fornecedores) {
      const i = g.itens.find((it) => it.material_id === materialId);
      if (i) return i;
    }
    return null;
  }
  const resumo = (i) => (i ? {
    a_caminho: i.a_caminho, a_caminho_vencido: i.a_caminho_vencido, disponivel: i.disponivel,
    posicao: i.posicao, quantidade_sugerida: i.quantidade_sugerida,
  } : null);

  async function patchStatus(pedidoId, status) {
    setUser(ADMIN);
    const r = await request(app).patch(`/api/compras/pedidos/${pedidoId}/status`).send({ status });
    assert.strictEqual(r.status, 200, `PATCH status ${status}: ${JSON.stringify(r.body)}`);
  }

  /** Cenario-base de RN-05/06: minimo 10, solicitacao de 10, pedido de 10, nota de 4. */
  async function baseNotaDeQuatro() {
    const mat = await novoMaterial(10);
    const solId = await solicitacaoPeloMinimo(mat);
    const { pedido, linhaDe } = await novoPedido([{ material_id: mat, quantidade: 10, valor_unitario: 1 }],
      { solicitacaoId: solId });
    await receber(pedido, [itemDaTela(mat, linhaDe(mat), 4)]);
    return { mat, solId, pedido, linhaDe };
  }

  // ── RN-01 nota parcial nao fecha (pelo /processar) ──────────────────────────────────────────────
  await test('(1) RN-01 /processar: nota de 4 de 10 deixa VINCULADO sem trilha; a de 6 fecha com MATERIAL_COMPLETO', async () => {
    const mat = await novoMaterial(10);
    const solId = await solicitacaoPeloMinimo(mat);
    const { pedido, linhaDe } = await novoPedido([{ material_id: mat, quantidade: 10, valor_unitario: 1 }],
      { solicitacaoId: solId });
    assert.strictEqual((await sol(solId)).status, 'VINCULADO', 'fixture: o POST do pedido tinha de vincular');

    await receber(pedido, [itemDaTela(mat, linhaDe(mat), 4)]);
    const depoisDe4 = await sol(solId);
    assert.strictEqual(depoisDe4.status, 'VINCULADO', `a nota PARCIAL fechou a solicitacao: ${JSON.stringify(depoisDe4)}`);
    assert.strictEqual(depoisDe4.recebida_em, null);
    assert.strictEqual((await trilhaRecebida(solId)).length, 0, 'trilha RECEBIDA na nota parcial');

    await receber(pedido, [itemDaTela(mat, linhaDe(mat), 6)]);
    const depoisDe10 = await sol(solId);
    assert.strictEqual(depoisDe10.status, 'RECEBIDA', `o material completou e nao fechou: ${JSON.stringify(depoisDe10)}`);
    assert.ok(depoisDe10.recebida_em, 'recebida_em vazio');
    const trilha = await trilhaRecebida(solId);
    assert.strictEqual(trilha.length, 1);
    assert.deepStrictEqual(JSON.parse(trilha[0].dados_novos), {
      pedido_compra_id: pedido.id, material_id: mat, regra: 'MATERIAL_COMPLETO', recebido_no_pedido: 10, solicitado: 10,
    });
  });

  // ── RN-01 pela segunda porta (/aprovar direto) ──────────────────────────────────────────────────
  await test('(1b) RN-01 /aprovar direto: 4 de 10 nao fecha; 6 de 10 fecha', async () => {
    const mat = await novoMaterial(10);
    const solId = await solicitacaoPeloMinimo(mat);
    const { pedido, linhaDe } = await novoPedido([{ material_id: mat, quantidade: 10, valor_unitario: 1 }],
      { solicitacaoId: solId });
    await aprovarDireto(pedido, [itemDaTela(mat, linhaDe(mat), 4)]);
    assert.strictEqual((await sol(solId)).status, 'VINCULADO', 'o /aprovar da nota parcial fechou');
    await aprovarDireto(pedido, [itemDaTela(mat, linhaDe(mat), 6)]);
    assert.strictEqual((await sol(solId)).status, 'RECEBIDA', 'o /aprovar que completa nao fechou');
    assert.strictEqual(JSON.parse((await trilhaRecebida(solId))[0].dados_novos).regra, 'MATERIAL_COMPLETO');
  });

  // ── RN-02 so a do material que chegou ───────────────────────────────────────────────────────────
  await test('(2) RN-02: pedido X(5)+Y(5), nota so de X fecha X e deixa Y VINCULADO; nota de Y fecha Y', async () => {
    const x = await novoMaterial(5);
    const y = await novoMaterial(5);
    const criadas = await verificarMinimos();
    const sx = criadas.find((c) => c.material_id === x).solicitacao_id;
    const sy = criadas.find((c) => c.material_id === y).solicitacao_id;
    const { pedido, linhaDe } = await novoPedido([
      { material_id: x, quantidade: 5, valor_unitario: 1 }, { material_id: y, quantidade: 5, valor_unitario: 1 },
    ], { solicitacaoId: sx });
    await vincular(sy, pedido.id);

    await receber(pedido, [itemDaTela(x, linhaDe(x), 5)]);
    assert.strictEqual((await sol(sx)).status, 'RECEBIDA', 'X completou e nao fechou');
    assert.strictEqual((await sol(sy)).status, 'VINCULADO', 'Y fechou sem nada de Y ter chegado (Surpresa 2)');
    assert.strictEqual((await trilhaRecebida(sy)).length, 0);

    await receber(pedido, [itemDaTela(y, linhaDe(y), 5)]);
    assert.strictEqual((await sol(sy)).status, 'RECEBIDA', 'Y completou e nao fechou');
    assert.strictEqual((await trilhaRecebida(sx)).length, 1, 'a nota de Y re-auditou X');
  });

  // ── RN-03 o que ela pediu chegou ────────────────────────────────────────────────────────────────
  await test('(3) RN-03: solicitacao de 10 num pedido de 15 -> 7 nao fecha, +5 fecha (SOLICITADO_RECEBIDO), pedido segue aberto', async () => {
    const mat = await novoMaterial(10);
    const solId = await solicitacaoPeloMinimo(mat);
    const { pedido, linhaDe } = await novoPedido([{ material_id: mat, quantidade: 15, valor_unitario: 1 }],
      { solicitacaoId: solId });
    await receber(pedido, [itemDaTela(mat, linhaDe(mat), 7)]);
    assert.strictEqual((await sol(solId)).status, 'VINCULADO', '7 de 10 pedidos fechou');
    await receber(pedido, [itemDaTela(mat, linhaDe(mat), 5)]);
    assert.strictEqual((await sol(solId)).status, 'RECEBIDA', '12 >= 10 e nao fechou');
    assert.deepStrictEqual(JSON.parse((await trilhaRecebida(solId))[0].dados_novos), {
      pedido_compra_id: pedido.id, material_id: mat, regra: 'SOLICITADO_RECEBIDO', recebido_no_pedido: 12, solicitado: 10,
    });
    assert.strictEqual(await statusPedido(pedido.id), 'pendente', 'o pedido com 3 faltando foi fechado');
  });

  await test('(3b) RN-03: duas solicitacoes (6 + 4) do mesmo material no pedido de 10 -> 6 nao fecha nenhuma, +4 fecha as duas', async () => {
    const mat = await novoMaterial(6);
    const s6 = await solicitacaoPeloMinimo(mat);
    const s4 = await solicitacaoDireta(mat, 4);
    const { pedido, linhaDe } = await novoPedido([{ material_id: mat, quantidade: 10, valor_unitario: 1 }],
      { solicitacaoId: s6 });
    await vincular(s4, pedido.id);
    await receber(pedido, [itemDaTela(mat, linhaDe(mat), 6)]);
    assert.deepStrictEqual([(await sol(s6)).status, (await sol(s4)).status], ['VINCULADO', 'VINCULADO'],
      '6 de 10 solicitados fechou alguma');
    await receber(pedido, [itemDaTela(mat, linhaDe(mat), 4)]);
    assert.deepStrictEqual([(await sol(s6)).status, (await sol(s4)).status], ['RECEBIDA', 'RECEBIDA']);
    assert.strictEqual((await trilhaRecebida(s6)).length + (await trilhaRecebida(s4)).length, 2, 'duas trilhas');
  });

  // ── RN-04 legado: material sem linha no pedido ──────────────────────────────────────────────────
  await test('(4) RN-04: solicitacao vinculada a pedido SEM linha do material dela fecha na primeira nota (SEM_LINHA_NO_PEDIDO)', async () => {
    const semLinha = await novoMaterial(8);
    const outro = await novoMaterial(0);
    const solId = await solicitacaoPeloMinimo(semLinha);
    const { pedido, linhaDe } = await novoPedido([{ material_id: outro, quantidade: 10, valor_unitario: 1 }]);
    await vincular(solId, pedido.id);
    await receber(pedido, [itemDaTela(outro, linhaDe(outro), 3)]);
    assert.strictEqual((await sol(solId)).status, 'RECEBIDA', 'o legado sem linha deixou de fechar');
    const dados = JSON.parse((await trilhaRecebida(solId))[0].dados_novos);
    assert.strictEqual(dados.regra, 'SEM_LINHA_NO_PEDIDO');
    assert.strictEqual(dados.pedido_compra_id, pedido.id);
  });

  // ── RN-05 o "a caminho" e o que falta ───────────────────────────────────────────────────────────
  await test('(5) RN-05: nota de 4 de 10 -> com minimo 10 nao sugere; com minimo 15, a_caminho 6, posicao 10, sugerida 5', async () => {
    const { mat, solId } = await baseNotaDeQuatro();
    assert.strictEqual((await sol(solId)).status, 'VINCULADO', 'fixture');
    assert.strictEqual(await sugestaoDe(mat), null, 'disponivel 4 + 6 a caminho cobre o minimo 10 e foi sugerido');
    await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_minima = 15 WHERE id = ?', [mat]);
    assert.deepStrictEqual(resumo(await sugestaoDe(mat)),
      { a_caminho: 6, a_caminho_vencido: 0, disponivel: 4, posicao: 10, quantidade_sugerida: 5 });
  });

  await test('(5b) RN-05 fora do horizonte: a mesma solicitacao velha vai para a_caminho_vencido com o que FALTA (6)', async () => {
    const { mat, solId } = await baseNotaDeQuatro();
    await dbRun(db, "UPDATE solicitacoes_compra_almoxarifado SET created_at = datetime('now', '-100 days') WHERE id = ?", [solId]);
    assert.deepStrictEqual(resumo(await sugestaoDe(mat)),
      { a_caminho: 0, a_caminho_vencido: 6, disponivel: 4, posicao: 4, quantidade_sugerida: 6 });
  });

  // ── RN-06 pedido encerrado nao traz nada ────────────────────────────────────────────────────────
  await test('(6) RN-06: pedido cancelado/recebido/rejeitado -> a_caminho 0; enviado/aprovado/pendente/em_analise -> 6', async () => {
    const { mat, solId, pedido } = await baseNotaDeQuatro();
    await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_minima = 15 WHERE id = ?', [mat]);
    for (const status of ['cancelado', 'recebido', 'rejeitado']) {
      await patchStatus(pedido.id, status);
      assert.deepStrictEqual(resumo(await sugestaoDe(mat)),
        { a_caminho: 0, a_caminho_vencido: 0, disponivel: 4, posicao: 4, quantidade_sugerida: 11 }, `status ${status}`);
      assert.strictEqual((await sol(solId)).status, 'VINCULADO', `o pedido ${status} fechou a solicitacao (D3: nao fecha)`);
    }
    for (const status of ['enviado', 'aprovado', 'pendente', 'em_analise']) {
      await patchStatus(pedido.id, status);
      assert.strictEqual((await sugestaoDe(mat)).a_caminho, 6, `status ${status} deixou de contar`);
    }
  });

  // ── RN-07 verificar-minimos nao duplica o que esta vindo ────────────────────────────────────────
  await test('(7) RN-07: VINCULADO de pedido vivo bloqueia o verificar-minimos (antes e depois da nota parcial); cancelado libera', async () => {
    const mat = await novoMaterial(10);
    const solId = await solicitacaoPeloMinimo(mat);
    const doMaterial = (criadas) => criadas.filter((c) => c.material_id === mat);
    assert.deepStrictEqual(doMaterial(await verificarMinimos()), [], 'PENDENTE deixou de deduplicar');
    const { pedido, linhaDe } = await novoPedido([{ material_id: mat, quantidade: 10, valor_unitario: 1 }],
      { solicitacaoId: solId });
    assert.deepStrictEqual(doMaterial(await verificarMinimos()), [], 'VINCULADO sem nota duplicou (Surpresa 1)');
    await receber(pedido, [itemDaTela(mat, linhaDe(mat), 4)]);
    assert.deepStrictEqual(doMaterial(await verificarMinimos()), [], 'VINCULADO depois da nota parcial duplicou');
    await patchStatus(pedido.id, 'cancelado');
    const nova = doMaterial(await verificarMinimos());
    assert.strictEqual(nova.length, 1, `pedido cancelado continuou bloqueando: ${JSON.stringify(nova)}`);
    assert.strictEqual(nova[0].quantidade, 10);
  });

  await test('(7b) RN-07 (Fase 2): VINCULADO de pedido vivo FORA do horizonte nao bloqueia para sempre', async () => {
    const mat = await novoMaterial(10);
    const solId = await solicitacaoPeloMinimo(mat);
    await novoPedido([{ material_id: mat, quantidade: 10, valor_unitario: 1 }], { solicitacaoId: solId });
    await dbRun(db, "UPDATE solicitacoes_compra_almoxarifado SET created_at = datetime('now', '-100 days') WHERE id = ?", [solId]);
    const nova = (await verificarMinimos()).filter((c) => c.material_id === mat);
    assert.strictEqual(nova.length, 1, 'o pedido esquecido de 100 dias bloqueou o minimo');
  });

  // ── Fase 2: o recebido do par e rateado por solicitacao, em ordem de id ─────────────────────────
  await test('(8) Fase 2: duas solicitacoes (6 + 4) no pedido de 10, nota de 7 -> atribuido [6, 1], a caminho [0, 3]; a sugestao soma 3', async () => {
    const mat = await novoMaterial(6);
    const s6 = await solicitacaoPeloMinimo(mat);
    const s4 = await solicitacaoDireta(mat, 4);
    const { pedido, linhaDe } = await novoPedido([{ material_id: mat, quantidade: 10, valor_unitario: 1 }],
      { solicitacaoId: s6 });
    await vincular(s4, pedido.id);
    await receber(pedido, [itemDaTela(mat, linhaDe(mat), 7)]);
    const pos = await purchaseService.posicaoDasSolicitacoes(db, { material_id: mat });
    assert.deepStrictEqual(pos.map((p) => [p.solicitacao_id, p.recebido_atribuido, p.a_caminho, p.pedido_encerrado]),
      [[s6, 6, 0, false], [s4, 1, 3, false]]);
    assert.ok(pos.every((p) => p.recebido_no_pedido === 7 && p.pedido_id === pedido.id), JSON.stringify(pos));
    await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_minima = 20 WHERE id = ?', [mat]);
    const item = await sugestaoDe(mat);
    assert.strictEqual(item.a_caminho, 3, 'a sugestao nao e a soma da funcao por solicitacao');
    assert.strictEqual(item.disponivel, 7);
  });

  await test('(8b) Fase 2: PENDENTE conta a quantidade inteira e nao tem recebido; filtro por solicitacao_ids', async () => {
    const mat = await novoMaterial(9);
    const solId = await solicitacaoPeloMinimo(mat);
    const [p] = await purchaseService.posicaoDasSolicitacoes(db, { solicitacao_ids: [solId] });
    assert.deepStrictEqual(
      { id: p.solicitacao_id, status: p.status, sol: p.solicitado, rec: p.recebido_no_pedido, atr: p.recebido_atribuido,
        cam: p.a_caminho, enc: p.pedido_encerrado },
      { id: solId, status: 'PENDENTE', sol: 9, rec: null, atr: null, cam: 9, enc: false });
  });

  // ── Fase 2: o recebido ANTES do vinculo nao conta para a solicitacao ────────────────────────────
  await test('(9) Fase 2: pedido com 4 ja recebidos, solicitacao de 10 vinculada depois -> recebido_no_vinculo 4, a caminho 10; +3 -> atribuido 3', async () => {
    const mat = await novoMaterial(10);
    const { pedido, linhaDe } = await novoPedido([{ material_id: mat, quantidade: 20, valor_unitario: 1 }]);
    await receber(pedido, [itemDaTela(mat, linhaDe(mat), 4)]);
    const solId = await solicitacaoPeloMinimo(mat);
    await vincular(solId, pedido.id);
    assert.strictEqual((await sol(solId)).recebido_no_vinculo, 4, 'o vinculo nao gravou o recebido do par');
    let [p] = await purchaseService.posicaoDasSolicitacoes(db, { solicitacao_ids: [solId] });
    assert.deepStrictEqual([p.recebido_atribuido, p.a_caminho], [0, 10], 'o recebido de ANTES do vinculo contou');
    await receber(pedido, [itemDaTela(mat, linhaDe(mat), 3)]);
    [p] = await purchaseService.posicaoDasSolicitacoes(db, { solicitacao_ids: [solId] });
    assert.deepStrictEqual([p.recebido_atribuido, p.a_caminho], [3, 7]);
    assert.strictEqual((await sol(solId)).status, 'VINCULADO', '7 do par >= 10 nao vale: 4 vieram antes do vinculo');
    await receber(pedido, [itemDaTela(mat, linhaDe(mat), 7)]);
    assert.strictEqual((await sol(solId)).status, 'RECEBIDA', '14 do par = 4 antes + 10 depois e nao fechou');
    assert.strictEqual(JSON.parse((await trilhaRecebida(solId))[0].dados_novos).regra, 'SOLICITADO_RECEBIDO');
  });

  await test('(9b) gerar o pedido com solicitacao_id grava recebido_no_vinculo 0', async () => {
    const mat = await novoMaterial(3);
    const solId = await solicitacaoPeloMinimo(mat);
    await novoPedido([{ material_id: mat, quantidade: 3, valor_unitario: 1 }], { solicitacaoId: solId });
    assert.strictEqual((await sol(solId)).recebido_no_vinculo, 0);
  });

  // ── Pelo SERVICO: o gancho chamado direto, com a linha somada a mao ─────────────────────────────
  await test('(S1) servico: fecharSolicitacoesDoPedido com a linha somada a mao — parcial devolve [], completa devolve a regra', async () => {
    const mat = await novoMaterial(10);
    const solId = await solicitacaoPeloMinimo(mat);
    const { pedido, linhaDe } = await novoPedido([{ material_id: mat, quantidade: 10, valor_unitario: 1 }],
      { solicitacaoId: solId });
    await dbRun(db, 'UPDATE itens_pedido_compra SET quantidade_recebida = 4 WHERE id = ?', [linhaDe(mat)]);
    assert.deepStrictEqual(await purchaseService.fecharSolicitacoesDoPedido(db, ADMIN, pedido.id), []);
    assert.strictEqual((await sol(solId)).status, 'VINCULADO');
    await dbRun(db, 'UPDATE itens_pedido_compra SET quantidade_recebida = 10 WHERE id = ?', [linhaDe(mat)]);
    assert.deepStrictEqual(await purchaseService.fecharSolicitacoesDoPedido(db, ADMIN, pedido.id),
      [{ id: solId, material_id: mat, regra: 'MATERIAL_COMPLETO' }]);
    assert.deepStrictEqual(await purchaseService.fecharSolicitacoesDoPedido(db, ADMIN, pedido.id), [],
      'a segunda chamada fechou de novo (dedupe do AND status = VINCULADO)');
    assert.strictEqual((await trilhaRecebida(solId)).length, 1);
  });

  await test('(S2) servico: residuo de float (2,2 + 7,8 de 10) conta como completo', async () => {
    const mat = await novoMaterial(10);
    const solId = await solicitacaoPeloMinimo(mat);
    const { pedido, linhaDe } = await novoPedido([{ material_id: mat, quantidade: 10, valor_unitario: 1 }],
      { solicitacaoId: solId });
    await dbRun(db, 'UPDATE itens_pedido_compra SET quantidade_recebida = 2.2 + 7.8 - 1e-12 WHERE id = ?', [linhaDe(mat)]);
    const r = await purchaseService.fecharSolicitacoesDoPedido(db, ADMIN, pedido.id);
    assert.deepStrictEqual(r.map((f) => f.id), [solId], JSON.stringify(r));
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
