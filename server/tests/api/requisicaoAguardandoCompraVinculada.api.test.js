/**
 * Etapa 73, Task 1 (C116) — compra VINCULADA a pedido e ainda a caminho e "aguardando compra".
 *
 * Plano: docs/superpowers/plans/2026-10-02-almoxarifado-etapa73-requisicao-espera-compra.md (T1, RN-01 a
 * RN-04, D1/B357; a secao "Fase 2 — revisao do plano" prevalece).
 *
 * O defeito: calcularStatusPosAprovacao contava so solicitacao PENDENTE. Assim que o comprador gerava o
 * pedido (solicitacao VINCULADO), a requisicao do mesmo material aprovada sem saldo ia para
 * AGUARDANDO_ESTOQUE — "nada vem" — com a compra a caminho. Agora o criterio e a fonte unica da Etapa
 * 72 (`purchaseService.posicaoDasSolicitacoes`): existe solicitacao do material dentro do horizonte com
 * `a_caminho > 0`.
 *
 * TUDO PELAS ROTAS (solicitacao pelo verificar-minimos, pedido por POST /api/compras/pedidos com
 * solicitacao_id, nota pelas seis portas do recebimento, encerramento pelo PATCH do status, aprovacao
 * pelo PUT /aprovar) e um bloco PELO SERVICO (calcularStatusPosAprovacao direto, com fixture), incluindo
 * o fallback quando a posicao lanca.
 *
 * Datas: nada de "hoje" do JS — o SQLite responde.
 *
 * Executar: cd server && node tests/api/requisicaoAguardandoCompraVinculada.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const purchaseService = require('../../services/almoxarifado/purchaseService');
const { calcularStatusPosAprovacao } = require('../../services/almoxarifado/requisitionStateMachine');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

// Solicitante e aprovador diferentes: a segregacao do /aprovar recusa quem aprova a propria.
const SOL = { id: 7311, nome: 'Solicitante E73T1', role: 'admin', is_superadmin: 1, email: 'e73t1s@test.com' };
const APR = { id: 7312, nome: 'Aprovador E73T1', role: 'admin', is_superadmin: 1, email: 'e73t1a@test.com' };

(async () => {
  console.log('\n=== Etapa 73 Task 1: compra vinculada a caminho e "aguardando compra" (C116) ===\n');
  const { app, db, close, setUser } = await createTestApp({ user: { ...SOL } });
  const forn = (await dbRun(db, "INSERT INTO fornecedores (razao_social, cnpj, status) VALUES ('Forn E73T1','73100000000173','ativo')")).lastID;
  const as = async (u, fn) => { setUser({ ...u }); try { return await fn(); } finally { setUser({ ...SOL }); } };

  let seq = 0;
  /** Material sem saldo; com `minimo` > 0 o verificar-minimos abre a solicitacao dele. */
  const material = async ({ minimo = 0 } = {}) => {
    seq += 1;
    return (await dbRun(db, `INSERT INTO materiais_almoxarifado
      (codigo, nome, unidade, quantidade_atual, quantidade_minima, quantidade_maxima, ativo, fornecedor_id)
      VALUES (?, ?, 'PC', 0, ?, 0, 1, ?)`, [`E73T1-M${seq}`, `Mat E73T1 ${seq}`, minimo, forn])).lastID;
  };
  const verificarMinimos = async (materialId) => {
    const r = await request(app).post('/api/almoxarifado/compras/verificar-minimos').send({});
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    const c = r.body.criadas.find((x) => x.material_id === materialId);
    assert.ok(c, `premissa: o verificar-minimos abriu a solicitacao do material ${materialId}: ${JSON.stringify(r.body.criadas)}`);
    return c.solicitacao_id;
  };
  const statusSolicitacao = async (id) => (await dbGet(db, 'SELECT status FROM solicitacoes_compra_almoxarifado WHERE id = ?', [id])).status;
  const gerarPedido = async (solicitacaoId, materialId, quantidade = 10, status = 'pendente') => {
    const r = await request(app).post('/api/compras/pedidos').send({
      fornecedor_id: forn, status, solicitacao_id: solicitacaoId,
      itens: [{ material_id: materialId, quantidade, valor_unitario: 1 }],
    });
    assert.strictEqual(r.status, 201, `pedido: ${JSON.stringify(r.body)}`);
    assert.strictEqual(await statusSolicitacao(solicitacaoId), 'VINCULADO', 'premissa: o pedido vinculou a solicitacao');
    const linha = (await dbGet(db, 'SELECT id FROM itens_pedido_compra WHERE pedido_id = ?', [r.body.id])).id;
    return { id: r.body.id, linha };
  };
  const patchPedido = async (pedidoId, status) => {
    const r = await request(app).patch(`/api/compras/pedidos/${pedidoId}/status`).send({ status });
    assert.strictEqual(r.status, 200, `PATCH ${status}: ${JSON.stringify(r.body)}`);
  };
  const criarReq = async (materialId, quantidade) => as(SOL, async () => {
    const r = await request(app).post('/api/almoxarifado/requisicoes').send({ itens: [{ material_id: materialId, quantidade }] });
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    return r.body.id;
  });
  /** Aprova pelo /aprovar e confere resposta = banco. Devolve { status, reservas }. */
  const aprovar = async (reqId) => as(APR, async () => {
    const r = await request(app).put(`/api/almoxarifado/requisicoes/${reqId}/aprovar`).send({});
    assert.strictEqual(r.status, 200, `aprovar: ${JSON.stringify(r.body)}`);
    const gravado = (await dbGet(db, 'SELECT status FROM requisicoes_almoxarifado WHERE id = ?', [reqId])).status;
    assert.strictEqual(r.body.status, gravado, `resposta ${r.body.status} x banco ${gravado}`);
    return { status: gravado, reservas: r.body.reservas || [] };
  });
  const aprovarNova = async (materialId, quantidade) => aprovar(await criarReq(materialId, quantidade));

  let nf = 0;
  /** A nota pelas seis portas: criar -> conferir -> encaminhar/finalizar/faturar -> fiscal -> processar. */
  const receber = async (pedido, materialId, quantidade) => {
    nf += 1;
    const { d } = await dbGet(db, "SELECT date('now', '-1 day') AS d");
    const itens = [{ material_id: materialId, pedido_item_id: pedido.linha, quantidade, quantidade_recebida: quantidade }];
    const c = await request(app).post('/api/almoxarifado/recebimentos').send({ tipo_recebimento: 'PEDIDO_COMPRA', pedido_compra_id: pedido.id, itens });
    assert.strictEqual(c.status, 201, JSON.stringify(c.body));
    const id = c.body.id;
    const conf = await request(app).put(`/api/almoxarifado/recebimentos/${id}/conferir`).send({ itens });
    assert.strictEqual(conf.status, 200, JSON.stringify(conf.body));
    for (const acao of ['encaminhar_compras', 'finalizar_compras', 'iniciar_faturamento']) {
      // eslint-disable-next-line no-await-in-loop
      const r = await request(app).post(`/api/almoxarifado/recebimentos/${id}/workflow`).send({ acao });
      assert.strictEqual(r.status, 200, `${acao}: ${JSON.stringify(r.body)}`);
    }
    const f = await request(app).put(`/api/almoxarifado/recebimentos/${id}/fiscal`).send({
      nota_fiscal: `NF-E73T1-${nf}`, fornecedor_id: forn, fornecedor_nome: 'Forn E73T1',
      data_emissao_nf: d, data_entrada_nf: d, valor_total_nota: quantidade, itens,
    });
    assert.strictEqual(f.status, 200, JSON.stringify(f.body));
    const p = await request(app).post(`/api/almoxarifado/recebimentos/${id}/workflow`).send({ acao: 'processar' });
    assert.strictEqual(p.status, 200, `processar: ${JSON.stringify(p.body)}`);
  };
  const posicao = async (solicitacaoId) => (await purchaseService.posicaoDasSolicitacoes(db, { solicitacao_ids: [solicitacaoId] }))[0];
  const reservasDe = async (reqId) => dbAll(db, "SELECT quantidade FROM reservas_material_almoxarifado WHERE requisicao_id = ? AND status = 'ATIVA'", [reqId]);

  // ══════════════ RN-01 — compra vinculada e compra ══════════════
  await test('[RN-01] solicitacao VINCULADO a pedido vivo -> /aprovar sem saldo da AGUARDANDO_COMPRA, sem reserva', async () => {
    const m = await material({ minimo: 10 });
    const sol = await verificarMinimos(m);
    await gerarPedido(sol, m);
    const reqId = await criarReq(m, 3);
    const r = await aprovar(reqId);
    assert.strictEqual(r.status, 'AGUARDANDO_COMPRA', `C116: com o pedido gerado a requisicao dizia "${r.status}"`);
    assert.deepStrictEqual(r.reservas, []);
    assert.deepStrictEqual(await reservasDe(reqId), []);
  });

  await test('[RN-01 positiva] a mesma requisicao sem nenhuma solicitacao do material -> AGUARDANDO_ESTOQUE', async () => {
    const m = await material();
    assert.strictEqual((await aprovarNova(m, 3)).status, 'AGUARDANDO_ESTOQUE');
  });

  // ══════════════ RN-02 — o que ainda falta chegar conta ══════════════
  await test('[RN-02] nota de 4 de 10 processada (a_caminho 6) e o saldo consumido -> requisicao nova AGUARDANDO_COMPRA', async () => {
    const m = await material({ minimo: 10 });
    const sol = await verificarMinimos(m);
    const pedido = await gerarPedido(sol, m, 10);
    await receber(pedido, m, 4);
    const p = await posicao(sol);
    assert.strictEqual(p.status, 'VINCULADO', JSON.stringify(p));
    assert.strictEqual(p.a_caminho, 6, `premissa: 6 a caminho depois da nota de 4: ${JSON.stringify(p)}`);
    const saida = await request(app).post('/api/almoxarifado/movimentacoes/v2')
      .send({ material_id: m, tipo: 'SAIDA', quantidade: 4, justificativa: 'E73T1 consome o que chegou' });
    assert.strictEqual(saida.status, 201, JSON.stringify(saida.body));
    const q = await dbGet(db, 'SELECT quantidade_atual q FROM materiais_almoxarifado WHERE id = ?', [m]);
    assert.strictEqual(Number(q.q), 0, 'premissa: o saldo da nota foi consumido');
    assert.strictEqual((await aprovarNova(m, 2)).status, 'AGUARDANDO_COMPRA');
  });

  // ══════════════ RN-03 — nada vem, nada espera ══════════════
  await test('[RN-03 positiva] pedido ENVIADO -> AGUARDANDO_COMPRA; [RN-03] o mesmo pedido CANCELADO (solicitacao segue VINCULADO) -> AGUARDANDO_ESTOQUE', async () => {
    const m = await material({ minimo: 10 });
    const sol = await verificarMinimos(m);
    const pedido = await gerarPedido(sol, m);
    await patchPedido(pedido.id, 'enviado');
    assert.strictEqual((await aprovarNova(m, 1)).status, 'AGUARDANDO_COMPRA', 'pedido enviado ao fornecedor: a compra vem');
    await patchPedido(pedido.id, 'cancelado');
    assert.strictEqual(await statusSolicitacao(sol), 'VINCULADO', 'premissa: cancelar o pedido nao fecha a solicitacao');
    const p = await posicao(sol);
    assert.strictEqual(p.a_caminho, 0, `premissa: pedido cancelado nao traz nada: ${JSON.stringify(p)}`);
    assert.strictEqual((await aprovarNova(m, 1)).status, 'AGUARDANDO_ESTOQUE', 'pedido cancelado: nada vem');
  });

  await test('[RN-03] solicitacao VINCULADO de 400 dias (fora do horizonte) -> AGUARDANDO_ESTOQUE; dentro -> AGUARDANDO_COMPRA', async () => {
    const m = await material({ minimo: 10 });
    const sol = await verificarMinimos(m);
    await gerarPedido(sol, m);
    assert.strictEqual((await aprovarNova(m, 1)).status, 'AGUARDANDO_COMPRA', 'positiva: dentro do horizonte');
    await dbRun(db, "UPDATE solicitacoes_compra_almoxarifado SET created_at = datetime('now', '-400 days') WHERE id = ?", [sol]);
    assert.strictEqual((await aprovarNova(m, 1)).status, 'AGUARDANDO_ESTOQUE', 'fora do horizonte da reposicao');
  });

  // ══════════════ RN-04 — a regra de sempre, pelo /aprovar ══════════════
  await test('[RN-04] PENDENTE dentro do horizonte -> AGUARDANDO_COMPRA; de 400 dias -> AGUARDANDO_ESTOQUE', async () => {
    const m = await material({ minimo: 10 });
    const sol = await verificarMinimos(m);
    assert.strictEqual(await statusSolicitacao(sol), 'PENDENTE');
    assert.strictEqual((await aprovarNova(m, 1)).status, 'AGUARDANDO_COMPRA');
    await dbRun(db, "UPDATE solicitacoes_compra_almoxarifado SET created_at = datetime('now', '-400 days') WHERE id = ?", [sol]);
    assert.strictEqual((await aprovarNova(m, 1)).status, 'AGUARDANDO_ESTOQUE');
  });

  await test('[RN-04] algum item com disponivel -> reserva e *_RESERVADA, mesmo com compra vinculada de outro item', async () => {
    const mSem = await material({ minimo: 10 });
    const sol = await verificarMinimos(mSem);
    await gerarPedido(sol, mSem);
    const mCom = await material();
    const e = await request(app).post('/api/almoxarifado/movimentacoes/v2').send({ material_id: mCom, tipo: 'ENTRADA', quantidade: 5, motivo: 'setup' });
    assert.strictEqual(e.status, 201, JSON.stringify(e.body));
    const reqId = await as(SOL, async () => {
      const r = await request(app).post('/api/almoxarifado/requisicoes')
        .send({ itens: [{ material_id: mSem, quantidade: 2 }, { material_id: mCom, quantidade: 2 }] });
      assert.strictEqual(r.status, 201, JSON.stringify(r.body));
      return r.body.id;
    });
    const r = await aprovar(reqId);
    assert.strictEqual(r.status, 'PARCIALMENTE_RESERVADA', JSON.stringify(r));
    assert.deepStrictEqual((await reservasDe(reqId)).map((x) => Number(x.quantidade)), [2]);
  });

  // ══════════════ pelo SERVICO — calcularStatusPosAprovacao direto, com fixture ══════════════
  let nreq = 0;
  const reqFixture = async (materialId) => {
    nreq += 1;
    const id = (await dbRun(db, `INSERT INTO requisicoes_almoxarifado (numero, solicitante_id, solicitante_nome, status)
      VALUES (?, ?, 'E73T1', 'PENDENTE')`, [`REQ-E73T1-${nreq}`, SOL.id])).lastID;
    await dbRun(db, 'INSERT INTO itens_requisicao_almoxarifado (requisicao_id, material_id, quantidade_solicitada) VALUES (?, ?, 1)', [id, materialId]);
    return id;
  };
  const solicitacaoFixture = async (materialId, status, diasAtras = 0) => (await dbRun(db, `INSERT INTO solicitacoes_compra_almoxarifado
      (material_id, quantidade, status, created_at) VALUES (?, 5, ?, datetime('now', ?))`,
  [materialId, status, `-${diasAtras} days`])).lastID;

  await test('[servico] VINCULADO sem pedido (D4 da 72: conta como a caminho) dentro do horizonte -> AGUARDANDO_COMPRA; de 400 dias -> AGUARDANDO_ESTOQUE', async () => {
    const m1 = await material();
    await solicitacaoFixture(m1, 'VINCULADO', 1);
    assert.strictEqual(await calcularStatusPosAprovacao(db, await reqFixture(m1)), 'AGUARDANDO_COMPRA');
    const m2 = await material();
    await solicitacaoFixture(m2, 'VINCULADO', 400);
    assert.strictEqual(await calcularStatusPosAprovacao(db, await reqFixture(m2)), 'AGUARDANDO_ESTOQUE');
  });

  await test('[servico] solicitacao RECEBIDA/CANCELADA nao conta -> AGUARDANDO_ESTOQUE', async () => {
    const m = await material();
    await solicitacaoFixture(m, 'RECEBIDA', 1);
    await solicitacaoFixture(m, 'CANCELADA', 1);
    assert.strictEqual(await calcularStatusPosAprovacao(db, await reqFixture(m)), 'AGUARDANDO_ESTOQUE');
  });

  await test('[servico] a posicao lanca -> cai para a regra antiga (so PENDENTE no horizonte) com o warn literal; a aprovacao nao quebra', async () => {
    const mPend = await material();
    await solicitacaoFixture(mPend, 'PENDENTE', 1);
    const mVinc = await material();
    await solicitacaoFixture(mVinc, 'VINCULADO', 1);
    const original = purchaseService.posicaoDasSolicitacoes;
    const warnOriginal = console.warn;
    const avisos = [];
    purchaseService.posicaoDasSolicitacoes = async () => { throw new Error('falha proposital E73T1'); };
    console.warn = (...a) => { avisos.push(a.join(' ')); };
    let pend; let vinc;
    try {
      pend = await calcularStatusPosAprovacao(db, await reqFixture(mPend));
      vinc = await calcularStatusPosAprovacao(db, await reqFixture(mVinc));
    } finally {
      purchaseService.posicaoDasSolicitacoes = original;
      console.warn = warnOriginal;
    }
    assert.strictEqual(pend, 'AGUARDANDO_COMPRA', 'o fallback ainda enxerga PENDENTE');
    assert.strictEqual(vinc, 'AGUARDANDO_ESTOQUE', 'o fallback e a regra de antes (so PENDENTE)');
    assert.ok(avisos.length >= 2 && avisos.every((a) => a === '[almoxarifado-aprovar] posicao das solicitacoes indisponivel: falha proposital E73T1'),
      `warn literal: ${JSON.stringify(avisos)}`);
    // e com a funcao de volta, o VINCULADO volta a contar (o monkeypatch nao vazou)
    assert.strictEqual(await calcularStatusPosAprovacao(db, await reqFixture(mVinc)), 'AGUARDANDO_COMPRA');
  });

  await close();
  console.log(`\n${passed} passaram, ${failed} falharam\n`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
