/**
 * Etapa 72, T2 (RN-08, RN-09 + a D6 revista na Fase 2) — o ESTORNO DA ENTRADA REABRE A SOLICITACAO DE
 * COMPRA que a entrada estornada tinha fechado.
 *
 * ── POR QUE ──────────────────────────────────────────────────────────────────────────────────────
 * Ate a 72 o estorno da Etapa 71 descontava a linha e reabria o PEDIDO, mas nao tocava a solicitacao
 * (B334/D6 da 71: "reabrir no estorno nao teria criterio", e nao tinha — ela fechava na primeira
 * nota). Com o fechamento por material da T1 o criterio existe: a solicitacao fechou porque o
 * material completou (ou porque o que ela pediu chegou), e o estorno pode fazer a conta deixar de
 * fechar. Sem reabrir, o defeito volta pelo estorno: RECEBIDA com o material faltando, fora do
 * "a caminho", e a sugestao manda comprar de novo o que o pedido ainda traz.
 *
 * A regra (Fase 2 do plano): reabre so a solicitacao cuja condicao de fechamento VALIA antes deste
 * estorno e DEIXOU de valer depois, com o pedido vivo depois do passo do pedido. Legado fechado cedo
 * pela regra antiga (a condicao nunca valeu) nao reabre — senao inflaria a posicao.
 *
 * ── POR QUE ROTA E SERVICO ───────────────────────────────────────────────────────────────────────
 * O estorno entra pela rota do livro e por `stockService.cancelarMovimentacao` chamado direto; o gancho
 * mora no motor (`estornarEntradaNoPedido`). (1) e (3) entram pela rota, (2) pelo servico.
 *
 * Executar: cd server && node tests/api/solicitacaoReabreNoEstorno.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const stockService = require('../../services/almoxarifado/stockService');
const purchaseService = require('../../services/almoxarifado/purchaseService');
const { rotularAcao } = require('../../services/almoxarifado/auditLabels');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

const ADMIN = { id: 273, nome: 'Admin E72 T2', role: 'admin', is_superadmin: 1, email: 'admin@test.com' };

function capturarWarn(fn) {
  const original = console.warn;
  const linhas = [];
  console.warn = (...args) => { linhas.push(args.join(' ')); };
  return Promise.resolve().then(fn).finally(() => { console.warn = original; }).then((valor) => ({ linhas, valor }));
}

(async () => {
  const { app, db, setUser, close } = await createTestApp({ user: ADMIN });

  const forn = await dbRun(db,
    "INSERT INTO fornecedores (razao_social, cnpj, status) VALUES ('Fornecedor E72 T2','72000222000172','ativo')");

  let seq = 0;
  async function novoMaterial(minimo) {
    seq += 1;
    return (await dbRun(db, `INSERT INTO materiais_almoxarifado
      (codigo, nome, unidade, quantidade_atual, quantidade_minima, quantidade_maxima, ativo, fornecedor_id)
      VALUES (?,?,'PC',0,?,0,1,?)`,
    [`MAT-E72T2-${String(seq).padStart(3, '0')}`, `Porca E72 T2 ${seq}`, minimo, forn.lastID])).lastID;
  }

  async function solicitacaoPeloMinimo(materialId) {
    setUser(ADMIN);
    const r = await request(app).post('/api/almoxarifado/compras/verificar-minimos').send({});
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    const criada = r.body.criadas.find((c) => c.material_id === materialId);
    assert.ok(criada, `fixture: verificar-minimos nao abriu solicitacao do material ${materialId}`);
    return criada.solicitacao_id;
  }

  async function novoPedido(materialId, quantidade, solicitacaoId) {
    setUser(ADMIN);
    const r = await request(app).post('/api/compras/pedidos').send({
      fornecedor_id: forn.lastID, status: 'pendente', solicitacao_id: solicitacaoId,
      itens: [{ material_id: materialId, quantidade, valor_unitario: 1 }],
    });
    assert.strictEqual(r.status, 201, `fixture: POST do pedido ${r.status} ${JSON.stringify(r.body)}`);
    const linha = (await dbGet(db, 'SELECT id FROM itens_pedido_compra WHERE pedido_id = ?', [r.body.id])).id;
    return { pedido: r.body, linha };
  }

  let nf = 0;
  /** As seis portas reais ate PROCESSADO; devolve a movimentacao de entrada da nota. */
  async function receber(pedido, materialId, linhaId, qtd) {
    setUser(ADMIN);
    nf += 1;
    const itens = [{ material_id: materialId, pedido_item_id: linhaId, quantidade: qtd, quantidade_recebida: qtd }];
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
      nota_fiscal: `NF-E72T2-${nf}`, fornecedor_id: forn.lastID, fornecedor_nome: 'Fornecedor E72 T2',
      data_emissao_nf: '2026-09-01', data_entrada_nf: '2026-09-02', valor_total_nota: 100, itens,
    });
    assert.strictEqual(fiscal.status, 200, `PUT /fiscal: ${JSON.stringify(fiscal.body)}`);
    const p = await request(app).post(`/api/almoxarifado/recebimentos/${recId}/workflow`).send({ acao: 'processar' });
    assert.strictEqual(p.status, 200, `processar: ${JSON.stringify(p.body)}`);
    return (await dbGet(db, "SELECT id FROM movimentacoes_almoxarifado WHERE recebimento_id = ? AND tipo = 'ENTRADA_COMPRA'",
      [recId])).id;
  }

  const estornarPelaRota = (movId) => {
    setUser(ADMIN);
    return request(app).post(`/api/almoxarifado/movimentacoes/${movId}/cancelar`).send({ motivo: 'lancado errado' });
  };
  const sol = (id) => dbGet(db, 'SELECT id, status, recebida_em FROM solicitacoes_compra_almoxarifado WHERE id = ?', [id]);
  const trilha = (id) => dbAll(db, `SELECT acao, dados_anteriores, dados_novos, justificativa
    FROM auditoria_log_almoxarifado WHERE entidade = 'solicitacao_compra' AND entidade_id = ?
      AND acao IN ('RECEBIDA','REABERTA') ORDER BY id`, [id]);
  const statusPedido = async (id) => (await dbGet(db, 'SELECT status FROM pedidos_compra WHERE id = ?', [id])).status;
  const recebidaDa = async (linhaId) => (await dbGet(db,
    'SELECT quantidade_recebida AS q FROM itens_pedido_compra WHERE id = ?', [linhaId])).q;
  async function aCaminhoNaSugestao(materialId) {
    setUser(ADMIN);
    const r = await request(app).get('/api/almoxarifado/reposicao/sugestoes');
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    for (const g of r.body.fornecedores) {
      const i = g.itens.find((it) => it.material_id === materialId);
      if (i) return i.a_caminho;
    }
    return null;
  }
  async function patchStatus(pedidoId, status) {
    setUser(ADMIN);
    const r = await request(app).patch(`/api/compras/pedidos/${pedidoId}/status`).send({ status });
    assert.strictEqual(r.status, 200, `PATCH status ${status}: ${JSON.stringify(r.body)}`);
  }

  /** Solicitacao de 10, pedido de 10, nota de 10: RECEBIDA (MATERIAL_COMPLETO) e pedido `recebido`. */
  async function baseFechada() {
    const mat = await novoMaterial(10);
    const solId = await solicitacaoPeloMinimo(mat);
    const { pedido, linha } = await novoPedido(mat, 10, solId);
    const movId = await receber(pedido, mat, linha, 10);
    assert.strictEqual((await sol(solId)).status, 'RECEBIDA', 'fixture: a nota completa nao fechou a solicitacao');
    assert.strictEqual(await statusPedido(pedido.id), 'recebido', 'fixture: o pedido completo nao fechou');
    return { mat, solId, pedido, linha, movId };
  }

  // ── (1) RN-08 pela ROTA ─────────────────────────────────────────────────────────────────────────
  await test('(1) RN-08 rota: estorno da nota que completou reabre (VINCULADO, trilha REABERTA, a_caminho 10); nova nota fecha de novo', async () => {
    const { mat, solId, pedido, linha, movId } = await baseFechada();
    const r = await estornarPelaRota(movId);
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.strictEqual(r.body.pedido_compra.reaberto, true, 'fixture: o pedido tinha de reabrir antes');
    assert.deepStrictEqual(r.body.pedido_compra.solicitacoes_reabertas, [solId], JSON.stringify(r.body));

    const depois = await sol(solId);
    assert.deepStrictEqual([depois.status, depois.recebida_em], ['VINCULADO', null]);
    const t = await trilha(solId);
    assert.deepStrictEqual(t.map((x) => x.acao), ['RECEBIDA', 'REABERTA']);
    assert.deepStrictEqual(JSON.parse(t[1].dados_anteriores), { status: 'RECEBIDA' });
    assert.deepStrictEqual(JSON.parse(t[1].dados_novos), {
      status: 'VINCULADO', pedido_compra_id: pedido.id, material_id: mat, movimentacao_id: movId, recebido_no_pedido: 0,
    });
    assert.strictEqual(t[1].justificativa, `Estorno da movimentação #${movId} reabriu a solicitação`);
    assert.strictEqual(rotularAcao('REABERTA'), 'Solicitação reaberta (estorno)');

    await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_minima = 15 WHERE id = ?', [mat]);
    assert.strictEqual(await aCaminhoNaSugestao(mat), 10, 'a solicitacao reaberta nao voltou ao a caminho');

    await receber(pedido, mat, linha, 10);
    assert.strictEqual((await sol(solId)).status, 'RECEBIDA', 'a nota nova nao fechou de novo');
    assert.deepStrictEqual((await trilha(solId)).map((x) => x.acao), ['RECEBIDA', 'REABERTA', 'RECEBIDA']);
  });

  // ── (2) RN-08 pelo SERVICO ──────────────────────────────────────────────────────────────────────
  await test('(2) RN-08 servico: stockService.cancelarMovimentacao reabre e devolve solicitacoes_reabertas', async () => {
    const { solId, movId } = await baseFechada();
    const r = await stockService.cancelarMovimentacao(db, ADMIN, movId, 'lancado errado');
    assert.deepStrictEqual(r.pedido_compra.solicitacoes_reabertas, [solId], JSON.stringify(r));
    assert.strictEqual((await sol(solId)).status, 'VINCULADO');
  });

  // ── (3) negativas ───────────────────────────────────────────────────────────────────────────────
  await test('(3a) estorno de nota PARCIAL (solicitacao ainda VINCULADO): solicitacoes_reabertas [] e nenhuma trilha', async () => {
    const mat = await novoMaterial(10);
    const solId = await solicitacaoPeloMinimo(mat);
    const { pedido, linha } = await novoPedido(mat, 10, solId);
    const movId = await receber(pedido, mat, linha, 4);
    const r = await estornarPelaRota(movId);
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.deepStrictEqual(r.body.pedido_compra.solicitacoes_reabertas, []);
    assert.strictEqual((await sol(solId)).status, 'VINCULADO');
    assert.strictEqual((await trilha(solId)).length, 0);
  });

  await test('(3b) pedido cancelado pelo comprador antes do estorno: nao reabre ([]), solicitacao segue RECEBIDA', async () => {
    const { solId, pedido, linha, movId } = await baseFechada();
    await patchStatus(pedido.id, 'cancelado');
    const r = await estornarPelaRota(movId);
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.strictEqual(await recebidaDa(linha), 0, 'fixture: a linha tinha de ser descontada');
    assert.strictEqual(await statusPedido(pedido.id), 'cancelado', 'fixture: o estorno reabriu o pedido cancelado');
    assert.deepStrictEqual(r.body.pedido_compra.solicitacoes_reabertas, []);
    assert.strictEqual((await sol(solId)).status, 'RECEBIDA', 'reabriu solicitacao de pedido encerrado');
  });

  await test('(3c) solicitacao CANCELADA nunca reabre', async () => {
    const { solId, movId } = await baseFechada();
    await dbRun(db, "UPDATE solicitacoes_compra_almoxarifado SET status = 'CANCELADA' WHERE id = ?", [solId]);
    const r = await estornarPelaRota(movId);
    assert.deepStrictEqual(r.body.pedido_compra.solicitacoes_reabertas, []);
    assert.strictEqual((await sol(solId)).status, 'CANCELADA');
  });

  await test('(3d) outra nota ja cobria: solicitacao de 10, pedido de 20, notas de 10 + 10, estorno da segunda -> pedido reabre, solicitacao nao', async () => {
    const mat = await novoMaterial(10);
    const solId = await solicitacaoPeloMinimo(mat);
    const { pedido, linha } = await novoPedido(mat, 20, solId);
    await receber(pedido, mat, linha, 10);
    assert.strictEqual((await sol(solId)).status, 'RECEBIDA', 'fixture: 10 de 10 solicitados nao fechou');
    const mov2 = await receber(pedido, mat, linha, 10);
    assert.strictEqual(await statusPedido(pedido.id), 'recebido', 'fixture');
    const r = await estornarPelaRota(mov2);
    assert.strictEqual(r.body.pedido_compra.reaberto, true, 'fixture: o pedido tinha de reabrir');
    assert.deepStrictEqual(r.body.pedido_compra.solicitacoes_reabertas, [],
      'reabriu a solicitacao com 10 recebidos cobrindo os 10 que ela pediu');
    assert.strictEqual((await sol(solId)).status, 'RECEBIDA');
  });

  await test('(3e) Fase 2: legado fechado cedo pela regra antiga (RECEBIDA com 4 de 10) nao reabre no estorno dos 4', async () => {
    const mat = await novoMaterial(10);
    const solId = await solicitacaoPeloMinimo(mat);
    const { pedido, linha } = await novoPedido(mat, 10, solId);
    const movId = await receber(pedido, mat, linha, 4);
    await dbRun(db, "UPDATE solicitacoes_compra_almoxarifado SET status = 'RECEBIDA', recebida_em = CURRENT_TIMESTAMP WHERE id = ?",
      [solId]);
    const r = await estornarPelaRota(movId);
    assert.deepStrictEqual(r.body.pedido_compra.solicitacoes_reabertas, [],
      'reabriu a solicitacao cuja condicao de fechamento nunca valeu');
    assert.strictEqual((await sol(solId)).status, 'RECEBIDA');
  });

  // ── (4) RN-09 best-effort ───────────────────────────────────────────────────────────────────────
  await test('(4) RN-09: a reabertura lancando nao derruba o estorno — 200, linha descontada, pedido reaberto, warn com a literal', async () => {
    const { solId, pedido, linha, movId } = await baseFechada();
    const original = purchaseService.reabrirSolicitacoesDoMaterial;
    purchaseService.reabrirSolicitacoesDoMaterial = async () => { throw new Error('falha simulada'); };
    let resposta;
    let linhas;
    try {
      ({ linhas, valor: resposta } = await capturarWarn(() => estornarPelaRota(movId)));
    } finally {
      purchaseService.reabrirSolicitacoesDoMaterial = original;
    }
    assert.strictEqual(resposta.status, 200, JSON.stringify(resposta.body));
    assert.strictEqual(await recebidaDa(linha), 0, 'a linha nao foi descontada');
    assert.strictEqual(resposta.body.pedido_compra.reaberto, true, 'o pedido nao reabriu');
    assert.deepStrictEqual(resposta.body.pedido_compra.solicitacoes_reabertas, []);
    assert.ok(linhas.some((l) => l === `[recebimento] reabertura das solicitacoes do pedido ${pedido.id} no estorno falhou: falha simulada`),
      `warn: ${JSON.stringify(linhas)}`);
    assert.strictEqual((await sol(solId)).status, 'RECEBIDA');
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
