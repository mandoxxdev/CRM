/**
 * Etapa 72, Fase 5 — O LIVRO DE ATRIBUICAO (`solicitacao_compra_recebimentos`).
 *
 * ── O DEFEITO QUE ESTE ARQUIVO FECHA (revisao da Fase 5, sondas sonda72f-a/b) ───────────────────
 * Ate a Fase 5 o recebido de cada solicitacao era CALCULADO a cada leitura: o recebido do par
 * (pedido, material) rateado em ordem de id entre as VINCULADO de hoje, cada uma enxergando so o que
 * passou do retrato `recebido_no_vinculo`. Quatro achados, uma raiz (o calculo muda de dono quando o
 * conjunto muda):
 *   - (S1, M)  o rateio guloso sub-creditava a solicitacao ligada depois (B recebia 5 de 15 dela);
 *   - (S2, I3) vincular a pedido cujo material ja estava completo criava "a caminho" fantasma;
 *   - (S3, I1) a irma CANCELADA passava o que recebeu para a outra (compra em dobro);
 *   - (S4, I2) o estorno de uma nota ANTERIOR ao vinculo reabria a solicitacao cujo material chegou.
 * (S6) e a regressao guardada: o estorno so desfaz o que a movimentacao estornada atribuiu.
 *
 * ── A REGRA ─────────────────────────────────────────────────────────────────────────────────────
 * Na entrada da nota, o que entrou do material e ATRIBUIDO as VINCULADO do par em ordem de id, cada
 * uma ate o que falta para ela, uma linha por (solicitacao, movimentacao); o resto nao e de ninguem.
 * O recebido da solicitacao e SUM do livro, nunca recalculado. O estorno da movimentacao M grava a
 * linha negativa das linhas de M (so as dela). Cancelar nao move nada no livro.
 *
 * ── POR QUE ROTA E SERVICO ──────────────────────────────────────────────────────────────────────
 * A nota entra pelas seis portas reais (o livro e escrito no gancho do recebimento); o estorno entra
 * pela rota do livro E pelo `stockService.cancelarMovimentacao`; o vinculo pela rota e pelo
 * `purchaseService.vincularPedidoCompra`; a idempotencia do livro (gancho rodando duas vezes,
 * estorno chamado duas vezes) so e alcancavel pelo servico.
 *
 * Executar: cd server && node tests/api/solicitacaoLivroAtribuicao.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const stockService = require('../../services/almoxarifado/stockService');
const purchaseService = require('../../services/almoxarifado/purchaseService');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

const ADMIN = { id: 274, nome: 'Admin E72 F5', role: 'admin', is_superadmin: 1, email: 'admin@test.com' };

(async () => {
  const { app, db, setUser, close } = await createTestApp({ user: ADMIN });

  const forn = await dbRun(db,
    "INSERT INTO fornecedores (razao_social, cnpj, status) VALUES ('Fornecedor E72 F5','72000555000175','ativo')");

  let seq = 0;
  async function novoMaterial(minimo = 0) {
    seq += 1;
    return (await dbRun(db, `INSERT INTO materiais_almoxarifado
      (codigo, nome, unidade, quantidade_atual, quantidade_minima, quantidade_maxima, ativo, fornecedor_id)
      VALUES (?,?,'PC',0,?,0,1,?)`,
    [`MAT-E72F5-${String(seq).padStart(3, '0')}`, `Arruela E72 F5 ${seq}`, minimo, forn.lastID])).lastID;
  }
  const nomeDe = async (id) => (await dbGet(db, 'SELECT nome FROM materiais_almoxarifado WHERE id = ?', [id])).nome;

  const solicitacao = async (materialId, quantidade) => (await dbRun(db,
    `INSERT INTO solicitacoes_compra_almoxarifado (material_id, quantidade, motivo, status)
     VALUES (?,?,'PONTO_REPOSICAO','PENDENTE')`, [materialId, quantidade])).lastID;

  async function novoPedido(itens, solicitacaoId) {
    setUser(ADMIN);
    const corpo = { fornecedor_id: forn.lastID, status: 'pendente', itens };
    if (solicitacaoId) corpo.solicitacao_id = solicitacaoId;
    const r = await request(app).post('/api/compras/pedidos').send(corpo);
    assert.strictEqual(r.status, 201, `fixture: POST do pedido ${r.status} ${JSON.stringify(r.body)}`);
    const linhas = await dbAll(db, 'SELECT id, material_id FROM itens_pedido_compra WHERE pedido_id = ? ORDER BY id',
      [r.body.id]);
    return { pedido: r.body, linhaDe: (m) => linhas.find((l) => l.material_id === m).id };
  }

  const vincularPelaRota = (solicitacaoId, pedidoId) => {
    setUser(ADMIN);
    return request(app).post(`/api/almoxarifado/compras/solicitacoes/${solicitacaoId}/vincular-pedido`)
      .send({ pedido_compra_id: pedidoId });
  };
  async function vincular(solicitacaoId, pedidoId) {
    const r = await vincularPelaRota(solicitacaoId, pedidoId);
    assert.strictEqual(r.status, 200, `fixture: vincular-pedido ${JSON.stringify(r.body)}`);
  }

  const it = (m, l, q) => ({ material_id: m, pedido_item_id: l, quantidade: q, quantidade_recebida: q });
  let nf = 0;
  /** As seis portas reais ate PROCESSADO. Devolve { recId, movId }. */
  async function receber(pedido, itens) {
    setUser(ADMIN);
    nf += 1;
    const c = await request(app).post('/api/almoxarifado/recebimentos').send({
      tipo_recebimento: 'PEDIDO_COMPRA', pedido_compra_id: pedido.id, itens,
    });
    assert.strictEqual(c.status, 201, `POST /recebimentos: ${JSON.stringify(c.body)}`);
    const recId = c.body.id;
    assert.strictEqual((await request(app).put(`/api/almoxarifado/recebimentos/${recId}/conferir`).send({ itens })).status, 200);
    for (const acao of ['encaminhar_compras', 'finalizar_compras', 'iniciar_faturamento']) {
      const r = await request(app).post(`/api/almoxarifado/recebimentos/${recId}/workflow`).send({ acao });
      assert.strictEqual(r.status, 200, `workflow ${acao}: ${JSON.stringify(r.body)}`);
    }
    const f = await request(app).put(`/api/almoxarifado/recebimentos/${recId}/fiscal`).send({
      nota_fiscal: `NF-E72F5-${nf}`, fornecedor_id: forn.lastID, fornecedor_nome: 'Fornecedor E72 F5',
      data_emissao_nf: '2026-09-01', data_entrada_nf: '2026-09-02', valor_total_nota: 100, itens,
    });
    assert.strictEqual(f.status, 200, `PUT /fiscal: ${JSON.stringify(f.body)}`);
    const p = await request(app).post(`/api/almoxarifado/recebimentos/${recId}/workflow`).send({ acao: 'processar' });
    assert.strictEqual(p.status, 200, `processar: ${JSON.stringify(p.body)}`);
    const mov = await dbGet(db, "SELECT id FROM movimentacoes_almoxarifado WHERE recebimento_id = ? AND tipo = 'ENTRADA_COMPRA'",
      [recId]);
    return { recId, movId: mov.id };
  }

  const estornarPelaRota = (movId) => {
    setUser(ADMIN);
    return request(app).post(`/api/almoxarifado/movimentacoes/${movId}/cancelar`).send({ motivo: 'lancado errado' });
  };
  const sol = (id) => dbGet(db, 'SELECT id, status, pedido_compra_id FROM solicitacoes_compra_almoxarifado WHERE id = ?', [id]);
  const statusDe = async (...ids) => Promise.all(ids.map(async (id) => (await sol(id)).status));
  /** O livro de uma solicitacao: [[movimentacao_id, quantidade], ...] na ordem de gravacao. */
  const livro = async (solId) => (await dbAll(db, `SELECT movimentacao_id, quantidade FROM solicitacao_compra_recebimentos
    WHERE solicitacao_id = ? ORDER BY id`, [solId])).map((l) => [l.movimentacao_id, l.quantidade]);
  const regraDe = async (solId) => (await dbAll(db, `SELECT dados_novos FROM auditoria_log_almoxarifado
    WHERE entidade = 'solicitacao_compra' AND entidade_id = ? AND acao = 'RECEBIDA' ORDER BY id`, [solId]))
    .map((t) => JSON.parse(t.dados_novos).regra);
  const reabertasDe = async (solId) => (await dbAll(db, `SELECT id FROM auditoria_log_almoxarifado
    WHERE entidade = 'solicitacao_compra' AND entidade_id = ? AND acao = 'REABERTA'`, [solId])).length;
  const posicao = async (solId) => {
    const [p] = await purchaseService.posicaoDasSolicitacoes(db, { solicitacao_ids: [solId] });
    return p ? { atribuido: p.recebido_atribuido, a_caminho: p.a_caminho } : null;
  };
  async function sugestaoDe(materialId) {
    setUser(ADMIN);
    const r = await request(app).get('/api/almoxarifado/reposicao/sugestoes');
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    for (const g of r.body.fornecedores) {
      const i = g.itens.find((x) => x.material_id === materialId);
      if (i) return { a_caminho: i.a_caminho, disponivel: i.disponivel, sugerida: i.quantidade_sugerida };
    }
    return null;
  }
  async function linhaDoRelatorio(solId) {
    setUser(ADMIN);
    const r = await request(app).get('/api/almoxarifado/relatorios/solicitacoes-compra');
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    const l = r.body.find((x) => x.id === solId);
    return l ? { recebido_no_pedido: l.recebido_no_pedido, a_caminho: l.a_caminho } : null;
  }

  // ── (S1) achado M: a solicitacao ligada depois recebe o que chegou depois dela ─────────────────
  await test('(S1) pedido 30: A10, nota de 5, B10 ligada, nota de 15 -> livro A [5, 5], B [10]; as duas RECEBIDA (SOLICITADO_RECEBIDO)', async () => {
    const m = await novoMaterial();
    const a = await solicitacao(m, 10);
    const { pedido, linhaDe } = await novoPedido([{ material_id: m, quantidade: 30, valor_unitario: 1 }], a);
    const n1 = await receber(pedido, [it(m, linhaDe(m), 5)]);
    assert.deepStrictEqual(await posicao(a), { atribuido: 5, a_caminho: 5 });
    const b = await solicitacao(m, 10);
    await vincular(b, pedido.id);
    assert.deepStrictEqual(await posicao(b), { atribuido: 0, a_caminho: 10 }, 'os 5 de antes do vinculo contaram para B');
    const n2 = await receber(pedido, [it(m, linhaDe(m), 15)]);
    assert.deepStrictEqual(await livro(a), [[n1.movId, 5], [n2.movId, 5]]);
    assert.deepStrictEqual(await livro(b), [[n2.movId, 10]], 'B foi sub-creditada (o rateio guloso dava 5)');
    assert.deepStrictEqual(await statusDe(a, b), ['RECEBIDA', 'RECEBIDA']);
    assert.deepStrictEqual([await regraDe(a), await regraDe(b)], [['SOLICITADO_RECEBIDO'], ['SOLICITADO_RECEBIDO']]);
    assert.strictEqual((await dbGet(db, 'SELECT status FROM pedidos_compra WHERE id = ?', [pedido.id])).status, 'pendente');
  });

  await test('(S1-servico) o gancho rodando de novo para o mesmo recebimento nao atribui em dobro nem fecha de novo', async () => {
    const m = await novoMaterial();
    const a = await solicitacao(m, 10);
    const { pedido, linhaDe } = await novoPedido([{ material_id: m, quantidade: 30, valor_unitario: 1 }], a);
    const n1 = await receber(pedido, [it(m, linhaDe(m), 4)]);
    assert.deepStrictEqual(await purchaseService.fecharSolicitacoesDoPedido(db, ADMIN, pedido.id, { recebimentoId: n1.recId }), []);
    assert.deepStrictEqual(await livro(a), [[n1.movId, 4]], 'a segunda passada do gancho atribuiu de novo');
    // Sem recebimentoId o servico so avalia: a linha somada a mao nao vira livro.
    await dbRun(db, 'UPDATE itens_pedido_compra SET quantidade_recebida = 14 WHERE id = ?', [linhaDe(m)]);
    assert.deepStrictEqual(await purchaseService.fecharSolicitacoesDoPedido(db, ADMIN, pedido.id), []);
    assert.deepStrictEqual(await posicao(a), { atribuido: 4, a_caminho: 6 }, 'o recebido do par virou recebido da solicitacao');
  });

  await test('(S1-aprovar) a segunda porta (/aprovar direto) tambem escreve o livro: 10 de 10 pedidos num pedido de 20 fecha', async () => {
    const m = await novoMaterial();
    const a = await solicitacao(m, 10);
    const { pedido, linhaDe } = await novoPedido([{ material_id: m, quantidade: 20, valor_unitario: 1 }], a);
    setUser(ADMIN);
    const itens = [it(m, linhaDe(m), 10)];
    const c = await request(app).post('/api/almoxarifado/recebimentos').send({
      tipo_recebimento: 'PEDIDO_COMPRA', pedido_compra_id: pedido.id, itens,
    });
    assert.strictEqual(c.status, 201, JSON.stringify(c.body));
    const ap = await request(app).post(`/api/almoxarifado/recebimentos/${c.body.id}/aprovar`).send({});
    assert.strictEqual(ap.status, 200, JSON.stringify(ap.body));
    assert.strictEqual((await dbGet(db, 'SELECT status FROM recebimentos_material_almoxarifado WHERE id = ?', [c.body.id])).status,
      'APROVADO', 'fixture: o /aprovar tinha de cair no ramo direto');
    assert.strictEqual((await livro(a)).length, 1, 'o ramo direto nao escreveu o livro');
    assert.deepStrictEqual([(await sol(a)).status, await regraDe(a)], ['RECEBIDA', ['SOLICITADO_RECEBIDO']]);
  });

  // ── (S2) achado I3: vincular a pedido cujo material ja completou ───────────────────────────────
  await test('(S2) rota e servico: vincular a pedido com o material ja completo -> 400 com a literal; a solicitacao segue PENDENTE', async () => {
    const x = await novoMaterial(15);
    const y = await novoMaterial();
    const { pedido, linhaDe } = await novoPedido([
      { material_id: x, quantidade: 10, valor_unitario: 1 }, { material_id: y, quantidade: 10, valor_unitario: 1 },
    ]);
    await receber(pedido, [it(x, linhaDe(x), 10)]);
    const s = await solicitacao(x, 10);
    const literal = `O pedido ${pedido.numero} já recebeu todo o ${await nomeDe(x)}: vincule a solicitação a outro pedido`;
    const r = await vincularPelaRota(s, pedido.id);
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, literal);
    await assert.rejects(purchaseService.vincularPedidoCompra(db, s, pedido.id),
      (e) => e.status === 400 && e.message === literal);
    assert.deepStrictEqual(await sol(s), { id: s, status: 'PENDENTE', pedido_compra_id: null });
    // Controle: o material Y do mesmo pedido ainda tem saldo -> vincula.
    const sy = await solicitacao(y, 10);
    await vincular(sy, pedido.id);
    assert.strictEqual((await sol(sy)).status, 'VINCULADO');
  });

  await test('(S2-legado) VINCULADO de antes da Fase 5 a pedido com o material completo: a_caminho 0, a sugestao pede o que falta', async () => {
    const x = await novoMaterial(15);
    const y = await novoMaterial();
    const { pedido, linhaDe } = await novoPedido([
      { material_id: x, quantidade: 10, valor_unitario: 1 }, { material_id: y, quantidade: 10, valor_unitario: 1 },
    ]);
    await receber(pedido, [it(x, linhaDe(x), 10)]);
    const s = await solicitacao(x, 10);
    await dbRun(db, "UPDATE solicitacoes_compra_almoxarifado SET status = 'VINCULADO', pedido_compra_id = ? WHERE id = ?",
      [pedido.id, s]);
    assert.deepStrictEqual(await posicao(s), { atribuido: 0, a_caminho: 0 }, 'a caminho fantasma de um pedido que ja entregou tudo');
    assert.deepStrictEqual(await sugestaoDe(x), { a_caminho: 0, disponivel: 10, sugerida: 5 });
  });

  // ── (S3) achado I1: a irma cancelada nao passa o que recebeu ───────────────────────────────────
  await test('(S3) rota: A10 + B10 no pedido de 30, nota de 5 (de A), cancela A -> B segue com 0 atribuido e 10 a caminho', async () => {
    const m = await novoMaterial(25);
    const a = await solicitacao(m, 10);
    const b = await solicitacao(m, 10);
    const { pedido, linhaDe } = await novoPedido([{ material_id: m, quantidade: 30, valor_unitario: 1 }], a);
    await vincular(b, pedido.id);
    const n1 = await receber(pedido, [it(m, linhaDe(m), 5)]);
    assert.deepStrictEqual([await posicao(a), await posicao(b)], [{ atribuido: 5, a_caminho: 5 }, { atribuido: 0, a_caminho: 10 }]);
    setUser(ADMIN);
    const c = await request(app).post(`/api/almoxarifado/compras/solicitacoes/${a}/cancelar`).send({ motivo: 'nao precisa mais' });
    assert.strictEqual(c.status, 200, JSON.stringify(c.body));
    assert.deepStrictEqual(await posicao(b), { atribuido: 0, a_caminho: 10 }, 'B herdou o que A recebeu (I1)');
    assert.deepStrictEqual(await linhaDoRelatorio(b), { recebido_no_pedido: 0, a_caminho: 10 });
    assert.deepStrictEqual(await livro(a), [[n1.movId, 5]], 'cancelar mexeu no livro');
    assert.deepStrictEqual(await sugestaoDe(m), { a_caminho: 10, disponivel: 5, sugerida: 10 });
    // O que chega depois e de B, nunca da cancelada.
    const n2 = await receber(pedido, [it(m, linhaDe(m), 10)]);
    assert.deepStrictEqual(await livro(b), [[n2.movId, 10]]);
    assert.deepStrictEqual(await statusDe(a, b), ['CANCELADA', 'RECEBIDA']);
  });

  await test('(S3-servico) cancelarSolicitacao pelo servico tambem nao move o livro', async () => {
    const m = await novoMaterial();
    const a = await solicitacao(m, 10);
    const b = await solicitacao(m, 10);
    const { pedido, linhaDe } = await novoPedido([{ material_id: m, quantidade: 30, valor_unitario: 1 }], a);
    await vincular(b, pedido.id);
    await receber(pedido, [it(m, linhaDe(m), 8)]);
    await purchaseService.cancelarSolicitacao(db, ADMIN, a, 'nao precisa mais');
    assert.deepStrictEqual(await posicao(b), { atribuido: 0, a_caminho: 10 });
  });

  // ── (S4) achado I2: o estorno da nota anterior ao vinculo nao reabre ninguem ────────────────────
  async function cenarioS4() {
    const m = await novoMaterial();
    const { pedido, linhaDe } = await novoPedido([{ material_id: m, quantidade: 20, valor_unitario: 1 }]);
    const n1 = await receber(pedido, [it(m, linhaDe(m), 10)]);
    const a = await solicitacao(m, 10);
    await vincular(a, pedido.id);
    const n2 = await receber(pedido, [it(m, linhaDe(m), 10)]);
    assert.strictEqual((await sol(a)).status, 'RECEBIDA', 'fixture: os 10 dela chegaram e nao fechou');
    assert.deepStrictEqual(await livro(a), [[n2.movId, 10]], 'fixture: a nota de antes do vinculo entrou no livro dela');
    return { m, a, pedido, n1, n2 };
  }

  await test('(S4) rota: pedido 20, nota de 10 sem solicitacao, A10 ligada, nota de 10 (dela); estorno da PRIMEIRA -> nao reabre A', async () => {
    const { a, n1, n2 } = await cenarioS4();
    const r = await estornarPelaRota(n1.movId);
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.strictEqual(r.body.pedido_compra.reaberto, true, 'fixture: o pedido tinha de reabrir');
    assert.deepStrictEqual(r.body.pedido_compra.solicitacoes_reabertas, [], 'reabriu a solicitacao cujo material chegou (I2)');
    assert.strictEqual((await sol(a)).status, 'RECEBIDA');
    assert.strictEqual(await reabertasDe(a), 0);
    assert.deepStrictEqual(await livro(a), [[n2.movId, 10]], 'o estorno de uma nota sem linha mexeu no livro');
    // Controle: o estorno da nota DELA reabre.
    const r2 = await estornarPelaRota(n2.movId);
    assert.deepStrictEqual(r2.body.pedido_compra.solicitacoes_reabertas, [a]);
    assert.deepStrictEqual(await posicao(a), { atribuido: 0, a_caminho: 10 });
  });

  await test('(S4-servico) stockService.cancelarMovimentacao da nota anterior ao vinculo: solicitacoes_reabertas []', async () => {
    const { a, n1 } = await cenarioS4();
    const r = await stockService.cancelarMovimentacao(db, ADMIN, n1.movId, 'lancado errado');
    assert.deepStrictEqual(r.pedido_compra.solicitacoes_reabertas, []);
    assert.strictEqual((await sol(a)).status, 'RECEBIDA');
  });

  // ── (S6) o estorno desfaz so o que a movimentacao estornada atribuiu ────────────────────────────
  await test('(S6) sol10 pedido20: nota 10 (fecha), nota 10 (de ninguem); estorno da 2a nao reabre, da 1a reabre com 10 a caminho', async () => {
    const m = await novoMaterial();
    const a = await solicitacao(m, 10);
    const { pedido, linhaDe } = await novoPedido([{ material_id: m, quantidade: 20, valor_unitario: 1 }], a);
    const n1 = await receber(pedido, [it(m, linhaDe(m), 10)]);
    assert.deepStrictEqual(await regraDe(a), ['SOLICITADO_RECEBIDO']);
    const n2 = await receber(pedido, [it(m, linhaDe(m), 10)]);
    assert.deepStrictEqual(await livro(a), [[n1.movId, 10]], 'o que sobra nao e de ninguem — e foi para a RECEBIDA');
    const e2 = await estornarPelaRota(n2.movId);
    assert.deepStrictEqual(e2.body.pedido_compra.solicitacoes_reabertas, []);
    assert.strictEqual((await sol(a)).status, 'RECEBIDA');
    const e1 = await estornarPelaRota(n1.movId);
    assert.deepStrictEqual(e1.body.pedido_compra.solicitacoes_reabertas, [a]);
    assert.deepStrictEqual(await livro(a), [[n1.movId, 10], [n1.movId, -10]], 'o estorno tem de NEGATIVAR (o rastro fica)');
    assert.deepStrictEqual(await posicao(a), { atribuido: 0, a_caminho: 10 });
  });

  await test('(S6-servico) reabrirSolicitacoesDoMaterial chamada de novo para a mesma movimentacao nao negativa em dobro', async () => {
    const m = await novoMaterial();
    const a = await solicitacao(m, 10);
    const { pedido, linhaDe } = await novoPedido([{ material_id: m, quantidade: 20, valor_unitario: 1 }], a);
    const n1 = await receber(pedido, [it(m, linhaDe(m), 10)]);
    await stockService.cancelarMovimentacao(db, ADMIN, n1.movId, 'lancado errado');
    assert.deepStrictEqual(await purchaseService.reabrirSolicitacoesDoMaterial(db, ADMIN,
      { pedidoId: pedido.id, materialId: m, movimentacaoId: n1.movId, quantidadeDescontada: 0 }), []);
    assert.deepStrictEqual(await livro(a), [[n1.movId, 10], [n1.movId, -10]]);
    assert.deepStrictEqual(await posicao(a), { atribuido: 0, a_caminho: 10 });
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
