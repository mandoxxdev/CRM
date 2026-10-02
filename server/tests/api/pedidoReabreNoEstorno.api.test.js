/**
 * Etapa 71, T2 (RN-01..RN-08, RN-10 + os achados da Fase 2) — o PEDIDO DE COMPRA QUE REABRE quando a
 * entrada da nota e estornada.
 *
 * ── O BECO QUE ESTE ARQUIVO FECHA (B161, revogada em parte) ──────────────────────────────────
 * Ate a 71, estornar no livro a `ENTRADA_COMPRA` de uma nota contra pedido revertia o SALDO e nao
 * tocava em mais nada: a linha do pedido continuava dizendo que os 10 chegaram, o pedido continuava
 * `recebido` e — pior que "sem sinal" (Surpresa 1 da Fase 0) — a nota seguinte com os 10 que
 * faltam tomava 400 "maior que o saldo do pedido (0)" e so passava com autorizacao de EXCEDENTE.
 *
 * O contrato: o gancho mora no MOTOR (`cancelarMovimentacao`), depois do claim e da auditoria do
 * cancelamento, nao-fatal; desconta `mov.quantidade` da linha do pedido DO ITEM (pelo vinculo da T1,
 * ou pelo par recebimento+material para o legado, com adocao) e reabre o pedido que a conta tinha
 * fechado, para o status de antes do fechamento automatico.
 *
 * ── POR QUE ROTA E SERVICO ───────────────────────────────────────────────────────────────────
 * O estorno entra por mais de uma porta (a rota do livro e chamadores internos). Um gancho na ROTA
 * passaria em todos os cenarios pela rota e deixaria o servico chamado direto sem desconto — por isso
 * (2b), (4) e (6c) entram por `stockService.cancelarMovimentacao` e o resto pela rota.
 *
 * Executar: cd server && node tests/api/pedidoReabreNoEstorno.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const receiptService = require('../../services/almoxarifado/receiptService');
const stockService = require('../../services/almoxarifado/stockService');
const alertRegistry = require('../../services/almoxarifado/alertRegistry');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

const ADMIN = { id: 271, nome: 'Admin E71 T2', role: 'admin', is_superadmin: 1, email: 'admin@test.com' };

function capturarWarn(fn) {
  const original = console.warn;
  const linhas = [];
  console.warn = (...args) => { linhas.push(args.join(' ')); };
  return Promise.resolve().then(fn).finally(() => { console.warn = original; }).then((valor) => ({ linhas, valor }));
}

(async () => {
  const { app, db, setUser, close } = await createTestApp({ user: ADMIN });

  const forn = await dbRun(db,
    "INSERT INTO fornecedores (razao_social, cnpj, status) VALUES ('Fornecedor E71 T2','71000222000171','ativo')");

  let seq = 0;
  async function novoMaterial({ unidade = 'PC', critico = 0 } = {}) {
    seq += 1;
    return (await dbRun(db, `INSERT INTO materiais_almoxarifado
      (codigo, nome, unidade, quantidade_atual, ativo, material_critico) VALUES (?,?,?,0,1,?)`,
    [`MAT-E71T2-${String(seq).padStart(3, '0')}`, `Chapa E71 T2 ${seq}`, unidade, critico])).lastID;
  }

  // Previsao FIXA no passado (nunca o "hoje" do JS — UTC perto da meia-noite muda o dia).
  async function novoPedido(itens, { status = 'pendente', previsao = null } = {}) {
    const r = await request(app).post('/api/compras/pedidos').send({
      fornecedor_id: forn.lastID, status, previsao_entrega: previsao, itens,
    });
    assert.strictEqual(r.status, 201, `fixture: POST do pedido ${r.status} ${JSON.stringify(r.body)}`);
    const linhas = await dbAll(db, 'SELECT id FROM itens_pedido_compra WHERE pedido_id = ? ORDER BY id', [r.body.id]);
    return { pedido: r.body, linhas: linhas.map((l) => l.id) };
  }

  const itemDaTela = (materialId, linhaId, qtd) => ({
    material_id: materialId, pedido_item_id: linhaId, quantidade: qtd, quantidade_recebida: qtd,
  });

  let nf = 0;
  /** As seis portas reais ate PROCESSADO. Devolve o id do recebimento. */
  async function receber(pedido, itens, { notaFiscal } = {}) {
    setUser(ADMIN);
    nf += 1;
    const numeroNf = notaFiscal || `NF-E71T2-${nf}`;
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
      nota_fiscal: numeroNf, fornecedor_id: forn.lastID, fornecedor_nome: 'Fornecedor E71 T2',
      data_emissao_nf: '2026-09-01', data_entrada_nf: '2026-09-02', valor_total_nota: 100, itens,
    });
    assert.strictEqual(fiscal.status, 200, `PUT /fiscal: ${JSON.stringify(fiscal.body)}`);
    const p = await request(app).post(`/api/almoxarifado/recebimentos/${recId}/workflow`).send({ acao: 'processar' });
    assert.strictEqual(p.status, 200, `processar: ${JSON.stringify(p.body)}`);
    return recId;
  }

  const entradasDe = (recId) => dbAll(db, `SELECT id, material_id, quantidade FROM movimentacoes_almoxarifado
    WHERE recebimento_id = ? AND tipo = 'ENTRADA_COMPRA' ORDER BY id`, [recId]);
  const movDoItem = async (recId, linhaId) => (await dbGet(db, `SELECT movimentacao_entrada_id AS m
    FROM recebimentos_material_itens_almoxarifado WHERE recebimento_id = ? AND pedido_item_id = ?`, [recId, linhaId])).m;
  const estornarPelaRota = (movId, motivo = 'lancado errado') => request(app)
    .post(`/api/almoxarifado/movimentacoes/${movId}/cancelar`).send({ motivo });
  const estornarPeloServico = (movId, motivo = 'lancado errado') => stockService
    .cancelarMovimentacao(db, ADMIN, movId, motivo);

  const statusDe = async (id) => (await dbGet(db, 'SELECT status FROM pedidos_compra WHERE id = ?', [id])).status;
  const recebidaDa = async (linhaId) => (await dbGet(db,
    'SELECT quantidade_recebida AS q FROM itens_pedido_compra WHERE id = ?', [linhaId])).q;
  const saldoAtual = async (materialId) => (await dbGet(db,
    'SELECT quantidade_atual AS q FROM materiais_almoxarifado WHERE id = ?', [materialId])).q;
  const trilhaDo = (pedidoId) => dbAll(db, `SELECT acao, dados_anteriores, dados_novos, justificativa
    FROM auditoria_log_almoxarifado WHERE entidade = 'pedido_compra' AND entidade_id = ? ORDER BY id`, [pedidoId]);
  const situacaoDe = async (pedidoId) => (await receiptService.situacaoDosPedidosCompra(db))
    .find((l) => l.id === pedidoId);
  const emPendentes = async (pedido) => (await request(app)
    .get(`/api/almoxarifado/recebimentos-aux/pedidos-compra?pendentes=1&search=${encodeURIComponent(pedido.numero)}`))
    .body.some((p) => p.id === pedido.id);
  const emAtrasados = async (pedidoId) => {
    const r = await request(app).get('/api/compras/pedidos?atrasados=1');
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    return r.body.some((p) => p.id === pedidoId);
  };
  const noCartao = async (chave, pedidoId) => {
    const cartao = (await alertRegistry.montarCentral(db)).alertas.find((a) => a.chave === chave);
    assert.ok(cartao && !cartao.erro, `cartao ${chave}: ${JSON.stringify(cartao)}`);
    return cartao.linhas.some((l) => l.id === pedidoId);
  };
  const itensOferecidos = async (pedidoId) => (await request(app)
    .get(`/api/almoxarifado/recebimentos-aux/pedidos-compra/${pedidoId}/itens`)).body;

  // ── (1) RN-01 o estorno desconta a linha (pela ROTA) ──────────────────────────────────────────
  await test('(1) RN-01 pela rota: pedido de 10 recebido 6 -> estorno -> linha 0, ?pendentes e itens oferecem 10, trilha RECEBIDO_ESTORNADO', async () => {
    const mat = await novoMaterial();
    const { pedido, linhas } = await novoPedido([{ material_id: mat, quantidade: 10, valor_unitario: 1 }]);
    const recId = await receber(pedido, [itemDaTela(mat, linhas[0], 6)]);
    assert.strictEqual(await recebidaDa(linhas[0]), 6, 'fixture: a linha tinha de somar 6');
    const [mov] = await entradasDe(recId);

    const r = await estornarPelaRota(mov.id);
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.strictEqual(r.body.success, true);
    assert.ok(Number.isInteger(r.body.estorno_id), JSON.stringify(r.body));
    assert.deepStrictEqual(r.body.pedido_compra, {
      id: pedido.id, numero: pedido.numero, pedido_item_id: linhas[0], quantidade_estornada: 6,
      situacao_antes: 'PARCIAL', situacao_depois: 'ABERTO', saldo_pendente: 10,
      status_anterior: 'pendente', status: 'pendente', reaberto: false,
    }, `contrato da resposta: ${JSON.stringify(r.body)}`);

    assert.strictEqual(await recebidaDa(linhas[0]), 0, 'a linha do pedido nao foi descontada');
    assert.strictEqual(await saldoAtual(mat), 0, 'o saldo do material tinha de voltar a 0');
    assert.ok(await emPendentes(pedido), 'o pedido descontado nao voltou a ?pendentes=1');
    const oferecidos = await itensOferecidos(pedido.id);
    assert.strictEqual(oferecidos.length, 1, JSON.stringify(oferecidos));
    assert.strictEqual(oferecidos[0].saldo_pendente, 10, JSON.stringify(oferecidos));

    const trilha = await trilhaDo(pedido.id);
    const est = trilha.filter((t) => t.acao === 'RECEBIDO_ESTORNADO');
    assert.strictEqual(est.length, 1, JSON.stringify(trilha));
    assert.deepStrictEqual(JSON.parse(est[0].dados_anteriores), { pedido_item_id: linhas[0], quantidade_recebida: 6 });
    assert.deepStrictEqual(JSON.parse(est[0].dados_novos),
      { quantidade_recebida: 0, movimentacao_id: mov.id, recebimento_id: recId });
    assert.strictEqual(est[0].justificativa, `Estorno da movimentação #${mov.id} descontou 6 do pedido`);
    assert.ok(!trilha.some((t) => t.acao === 'STATUS_AUTOMATICO_REABERTO'), 'reabriu um pedido que nao estava fechado');
  });

  await test('(1b) RN-01 metade negativa: ENTRADA_COMPRA manual (v2) e de nota SEM pedido nao tocam pedido nem trilha', async () => {
    const mat = await novoMaterial();
    const { pedido, linhas } = await novoPedido([{ material_id: mat, quantidade: 10, valor_unitario: 1 }]);
    await receber(pedido, [itemDaTela(mat, linhas[0], 4)]);
    const trilhaAntes = (await trilhaDo(pedido.id)).length;

    setUser(ADMIN);
    const manual = await request(app).post('/api/almoxarifado/movimentacoes/v2').send({
      material_id: mat, tipo: 'ENTRADA_COMPRA', quantidade: 3, justificativa: 'manual', motivo: 'manual',
    });
    assert.strictEqual(manual.status, 201, JSON.stringify(manual.body));
    const rManual = await estornarPelaRota(manual.body.id);
    assert.strictEqual(rManual.status, 200, JSON.stringify(rManual.body));
    assert.ok(!('pedido_compra' in rManual.body), `estorno manual ganhou pedido_compra: ${JSON.stringify(rManual.body)}`);

    const avulsa = await request(app).post('/api/almoxarifado/recebimentos').send({
      tipo_recebimento: 'NOTA_FISCAL', nota_fiscal: 'NF-E71T2-AVULSA',
      itens: [{ material_id: mat, quantidade: 2, quantidade_recebida: 2 }],
    });
    assert.strictEqual(avulsa.status, 201, JSON.stringify(avulsa.body));
    assert.strictEqual((await request(app).post(`/api/almoxarifado/recebimentos/${avulsa.body.id}/aprovar`).send({})).status, 200);
    const [movAvulsa] = await entradasDe(avulsa.body.id);
    assert.ok(movAvulsa, 'fixture: a nota avulsa tinha de gerar ENTRADA_COMPRA');
    const rAvulsa = await estornarPelaRota(movAvulsa.id);
    assert.strictEqual(rAvulsa.status, 200, JSON.stringify(rAvulsa.body));
    assert.ok(!('pedido_compra' in rAvulsa.body), `nota sem pedido ganhou pedido_compra: ${JSON.stringify(rAvulsa.body)}`);

    assert.strictEqual(await recebidaDa(linhas[0]), 4, 'um estorno sem pedido mexeu na linha do pedido');
    assert.strictEqual((await trilhaDo(pedido.id)).length, trilhaAntes, 'um estorno sem pedido gravou trilha no pedido');
  });

  // ── (2) RN-02 reabre o que a conta tinha fechado ─────────────────────────────────────────────
  await test('(2) RN-02 pela rota: pedido enviado com previsao vencida -> nota de 10 fecha -> estorno -> volta a enviado, atrasado e no cartao', async () => {
    const mat = await novoMaterial();
    const { pedido, linhas } = await novoPedido([{ material_id: mat, quantidade: 10, valor_unitario: 1 }],
      { status: 'enviado', previsao: '2026-01-01' });
    assert.strictEqual(await emAtrasados(pedido.id), true, 'fixture: o pedido tinha de nascer atrasado');
    const recId = await receber(pedido, [itemDaTela(mat, linhas[0], 10)]);
    assert.strictEqual(await statusDe(pedido.id), 'recebido', 'fixture: a nota de 10 tinha de fechar o pedido');
    assert.strictEqual(await emAtrasados(pedido.id), false, 'fixture: o pedido fechado saiu dos atrasados');

    const [mov] = await entradasDe(recId);
    const r = await estornarPelaRota(mov.id);
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.strictEqual(r.body.pedido_compra.reaberto, true, JSON.stringify(r.body));
    assert.strictEqual(r.body.pedido_compra.status_anterior, 'recebido');
    assert.strictEqual(r.body.pedido_compra.status, 'enviado');
    assert.strictEqual(r.body.pedido_compra.situacao_antes, 'RECEBIDO');
    assert.strictEqual(r.body.pedido_compra.situacao_depois, 'ABERTO');
    assert.strictEqual(r.body.pedido_compra.saldo_pendente, 10);

    assert.strictEqual(await statusDe(pedido.id), 'enviado',
      'o pedido nao voltou ao status de antes do fechamento automatico (o enviado virou outra coisa)');
    assert.strictEqual(await emAtrasados(pedido.id), true, 'o pedido reaberto nao voltou a ?atrasados=1');
    assert.strictEqual(await noCartao('PEDIDO_COMPRA_ATRASADO', pedido.id), true, 'o cartao do atrasado nao voltou');
    assert.ok(await emPendentes(pedido), 'o pedido reaberto nao voltou a ?pendentes=1');

    const reab = (await trilhaDo(pedido.id)).filter((t) => t.acao === 'STATUS_AUTOMATICO_REABERTO');
    assert.strictEqual(reab.length, 1);
    assert.deepStrictEqual(JSON.parse(reab[0].dados_anteriores), { status: 'recebido' });
    assert.deepStrictEqual(JSON.parse(reab[0].dados_novos), { status: 'enviado' });
    assert.strictEqual(reab[0].justificativa, `Estorno da movimentação #${mov.id} reabriu o pedido`);
  });

  await test('(2b) RN-02 pelo SERVICO: pedido fechado a mao com a conta fechando (sem trilha automatica) reabre para pendente', async () => {
    const mat = await novoMaterial();
    const { pedido, linhas } = await novoPedido([{ material_id: mat, quantidade: 5, valor_unitario: 1 }]);
    assert.strictEqual((await request(app).patch(`/api/compras/pedidos/${pedido.id}/status`).send({ status: 'aprovado' })).status, 200);
    assert.strictEqual((await request(app).patch(`/api/compras/pedidos/${pedido.id}/status`).send({ status: 'recebido' })).status, 200);
    const recId = await receber(pedido, [itemDaTela(mat, linhas[0], 5)]);
    assert.ok(!(await trilhaDo(pedido.id)).some((t) => t.acao === 'STATUS_AUTOMATICO_RECEBIDO'),
      'fixture: o fechamento foi a mao, nao pode haver trilha automatica');

    const [mov] = await entradasDe(recId);
    const r = await estornarPeloServico(mov.id);
    assert.strictEqual(r.success, true);
    assert.strictEqual(r.pedido_compra.reaberto, true, JSON.stringify(r));
    assert.strictEqual(await statusDe(pedido.id), 'pendente',
      'sem trilha do fechamento automatico o destino e pendente');
    assert.strictEqual(await recebidaDa(linhas[0]), 0);
  });

  // ── (3) RN-03 nao atropela o comprador ───────────────────────────────────────────────────────
  await test('(3) RN-03 pedido cancelado com nota processada: estorno desconta a linha e o status fica cancelado', async () => {
    const mat = await novoMaterial();
    const { pedido, linhas } = await novoPedido([{ material_id: mat, quantidade: 8, valor_unitario: 1 }]);
    const recId = await receber(pedido, [itemDaTela(mat, linhas[0], 8)]);
    assert.strictEqual((await request(app).patch(`/api/compras/pedidos/${pedido.id}/status`).send({ status: 'cancelado' })).status, 200);
    const [mov] = await entradasDe(recId);
    const r = await estornarPelaRota(mov.id);
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.strictEqual(r.body.pedido_compra.reaberto, false, JSON.stringify(r.body));
    assert.strictEqual(r.body.pedido_compra.status, 'cancelado');
    assert.strictEqual(await statusDe(pedido.id), 'cancelado', 'o estorno ressuscitou um pedido cancelado');
    assert.strictEqual(await recebidaDa(linhas[0]), 0, 'a linha do pedido cancelado tinha de ser descontada mesmo assim');
  });

  await test('(3b) RN-03 pedido de 20 marcado recebido a mao com a conta ABERTA: nota de 5, estorno -> continua recebido, linha 0', async () => {
    const mat = await novoMaterial();
    const { pedido, linhas } = await novoPedido([{ material_id: mat, quantidade: 20, valor_unitario: 1 }]);
    assert.strictEqual((await request(app).patch(`/api/compras/pedidos/${pedido.id}/status`).send({ status: 'recebido' })).status, 200);
    const recId = await receber(pedido, [itemDaTela(mat, linhas[0], 5)]);
    const [mov] = await entradasDe(recId);
    const r = await estornarPelaRota(mov.id);
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.strictEqual(r.body.pedido_compra.situacao_antes, 'PARCIAL');
    assert.strictEqual(r.body.pedido_compra.reaberto, false);
    assert.strictEqual(await statusDe(pedido.id), 'recebido',
      'o estorno rebaixou um pedido que o comprador fechou com a conta ja aberta');
    assert.strictEqual(await recebidaDa(linhas[0]), 0);
  });

  // ── (4) RN-04 parcial e total, pelo SERVICO ──────────────────────────────────────────────────
  await test('(4) RN-04 pelo servico: 6 + 4 fecham; estorno da de 4 reabre PARCIAL (cartao de parcial); da de 6 -> ABERTO sem 2a reabertura', async () => {
    const mat = await novoMaterial();
    const { pedido, linhas } = await novoPedido([{ material_id: mat, quantidade: 10, valor_unitario: 1 }], { status: 'aprovado' });
    const rec6 = await receber(pedido, [itemDaTela(mat, linhas[0], 6)]);
    const rec4 = await receber(pedido, [itemDaTela(mat, linhas[0], 4)]);
    assert.strictEqual(await statusDe(pedido.id), 'recebido', 'fixture: 6 + 4 tinha de fechar');

    const r4 = await estornarPeloServico((await entradasDe(rec4))[0].id);
    assert.strictEqual(r4.pedido_compra.reaberto, true, JSON.stringify(r4));
    assert.strictEqual(await statusDe(pedido.id), 'aprovado');
    const sit = await situacaoDe(pedido.id);
    assert.strictEqual(sit.situacao_recebimento, 'PARCIAL', JSON.stringify(sit));
    assert.strictEqual(sit.saldo_pendente, 4, JSON.stringify(sit));
    assert.strictEqual(await noCartao('PEDIDO_COMPRA_PARCIAL', pedido.id), true, 'o reaberto parcial nao entrou no cartao de parcial');

    const r6 = await estornarPeloServico((await entradasDe(rec6))[0].id);
    assert.strictEqual(r6.pedido_compra.reaberto, false, 'o pedido ja reaberto foi "reaberto" de novo');
    assert.strictEqual(r6.pedido_compra.situacao_depois, 'ABERTO');
    assert.strictEqual(r6.pedido_compra.saldo_pendente, 10);
    assert.strictEqual(await noCartao('PEDIDO_COMPRA_PARCIAL', pedido.id), false, 'o ABERTO continuou no cartao de parcial');
    assert.ok(await emPendentes(pedido));
    const trilha = await trilhaDo(pedido.id);
    assert.strictEqual(trilha.filter((t) => t.acao === 'STATUS_AUTOMATICO_REABERTO').length, 1, JSON.stringify(trilha));
    assert.strictEqual(trilha.filter((t) => t.acao === 'RECEBIDO_ESTORNADO').length, 2, JSON.stringify(trilha));
  });

  // ── (5) RN-05 uma vez so ─────────────────────────────────────────────────────────────────────
  await test('(5) RN-05 segundo estorno -> 400 "Movimentação já cancelada" e a linha nao muda', async () => {
    const mat = await novoMaterial();
    const { pedido, linhas } = await novoPedido([{ material_id: mat, quantidade: 10, valor_unitario: 1 }]);
    const recA = await receber(pedido, [itemDaTela(mat, linhas[0], 3)]);
    await receber(pedido, [itemDaTela(mat, linhas[0], 3)]);
    const [mov] = await entradasDe(recA);
    assert.strictEqual((await estornarPelaRota(mov.id)).status, 200);
    assert.strictEqual(await recebidaDa(linhas[0]), 3);
    const de2 = await estornarPelaRota(mov.id);
    assert.strictEqual(de2.status, 400, JSON.stringify(de2.body));
    assert.strictEqual(de2.body.error, 'Movimentação já cancelada');
    assert.strictEqual(await recebidaDa(linhas[0]), 3, 'o segundo estorno descontou de novo');
  });

  await test('(5b) RN-05 Promise.all de dois estornos da mesma movimentacao: um 200, um 400, linha descontada UMA vez', async () => {
    const mat = await novoMaterial();
    const { pedido, linhas } = await novoPedido([{ material_id: mat, quantidade: 10, valor_unitario: 1 }]);
    const recA = await receber(pedido, [itemDaTela(mat, linhas[0], 4)]);
    await receber(pedido, [itemDaTela(mat, linhas[0], 4)]);
    const [mov] = await entradasDe(recA);
    const rs = await Promise.all([estornarPelaRota(mov.id, 'corrida 1'), estornarPelaRota(mov.id, 'corrida 2')]);
    assert.deepStrictEqual(rs.map((r) => r.status).sort(), [200, 400], JSON.stringify(rs.map((r) => r.body)));
    assert.strictEqual(await recebidaDa(linhas[0]), 4, 'a corrida descontou duas vezes');
    assert.strictEqual((await trilhaDo(pedido.id)).filter((t) => t.acao === 'RECEBIDO_ESTORNADO').length, 1);
  });

  // ── (6) RN-06 a linha certa ──────────────────────────────────────────────────────────────────
  async function notaDoMesmoMaterial(qtdA, qtdB) {
    const mat = await novoMaterial();
    const { pedido, linhas } = await novoPedido([
      { material_id: mat, quantidade: qtdA, valor_unitario: 1 },
      { material_id: mat, quantidade: qtdB, valor_unitario: 2 },
      // Uma terceira linha de outro material mantem o pedido aberto: o cenario mede a LINHA, nao a reabertura.
      { material_id: await novoMaterial(), quantidade: 1, valor_unitario: 1 },
    ]);
    const recId = await receber(pedido, [itemDaTela(mat, linhas[0], qtdA), itemDaTela(mat, linhas[1], qtdB)]);
    return { mat, pedido, linhas, recId };
  }

  await test('(6) RN-06 pelo vinculo: dois itens do mesmo material (3 e 5) -> estornar a do item da linha 5 desconta a 5, nao a 3', async () => {
    const { linhas, recId } = await notaDoMesmoMaterial(3, 5);
    const movDa5 = await movDoItem(recId, linhas[1]);
    assert.ok(movDa5, 'fixture: o vinculo da T1 tinha de existir');
    const r = await estornarPelaRota(movDa5);
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.strictEqual(r.body.pedido_compra.pedido_item_id, linhas[1]);
    assert.strictEqual(await recebidaDa(linhas[1]), 0, 'a linha 5 nao foi descontada');
    assert.strictEqual(await recebidaDa(linhas[0]), 3, 'o estorno da linha 5 descontou a linha 3');
  });

  await test('(6b) RN-06 fallback (vinculo apagado), quantidades DIFERENTES: escolhe pela quantidade e o item adota o vinculo', async () => {
    const { linhas, recId } = await notaDoMesmoMaterial(3, 5);
    const movDa5 = await movDoItem(recId, linhas[1]);
    await dbRun(db, 'UPDATE recebimentos_material_itens_almoxarifado SET movimentacao_entrada_id = NULL WHERE recebimento_id = ?', [recId]);
    const r = await estornarPelaRota(movDa5);
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.strictEqual(await recebidaDa(linhas[1]), 0, 'o fallback nao achou o item pela quantidade');
    assert.strictEqual(await recebidaDa(linhas[0]), 3);
    assert.strictEqual(await movDoItem(recId, linhas[1]), movDa5, 'o item escolhido nao adotou o vinculo');
    assert.strictEqual(await movDoItem(recId, linhas[0]), null, 'o outro item adotou um vinculo que nao e dele');
  });

  await test('(6c) RN-06 fallback pelo SERVICO, quantidades IGUAIS: o de menor id, e o segundo estorno cai no OUTRO item (adocao)', async () => {
    const { linhas, recId } = await notaDoMesmoMaterial(4, 4);
    const [movA, movB] = await entradasDe(recId);
    await dbRun(db, 'UPDATE recebimentos_material_itens_almoxarifado SET movimentacao_entrada_id = NULL WHERE recebimento_id = ?', [recId]);
    const r1 = await estornarPeloServico(movB.id);
    assert.strictEqual(r1.pedido_compra.pedido_item_id, linhas[0], 'iguais: o de menor id');
    assert.strictEqual(await recebidaDa(linhas[0]), 0);
    assert.strictEqual(await recebidaDa(linhas[1]), 4);
    const r2 = await estornarPeloServico(movA.id);
    assert.strictEqual(r2.pedido_compra.pedido_item_id, linhas[1],
      'o segundo estorno caiu no mesmo item do primeiro — o fallback nao adotou o vinculo');
    assert.strictEqual(await recebidaDa(linhas[1]), 0);
  });

  await test('(6d) RN-06 fallback sem item: aviso com a literal, estorno 200 sem pedido_compra, linha intacta', async () => {
    const { linhas, recId } = await notaDoMesmoMaterial(2, 6);
    const [mov] = await entradasDe(recId);
    await dbRun(db, `UPDATE recebimentos_material_itens_almoxarifado
      SET movimentacao_entrada_id = NULL, entrada_estoque_em = NULL WHERE recebimento_id = ?`, [recId]);
    const { linhas: log, valor: r } = await capturarWarn(() => estornarPelaRota(mov.id));
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.ok(!('pedido_compra' in r.body), JSON.stringify(r.body));
    assert.ok(log.includes(`[recebimento] estorno da movimentacao ${mov.id}: item do recebimento ${recId} nao encontrado — pedido nao descontado`),
      `literal do aviso: ${JSON.stringify(log)}`);
    assert.strictEqual(await recebidaDa(linhas[0]), 2);
    assert.strictEqual(await recebidaDa(linhas[1]), 6);
  });

  await test('(6e) Fase 2: a adocao do vinculo legado que PERDE a corrida (changes 0) nao desconta o item alheio', async () => {
    const { linhas, recId } = await notaDoMesmoMaterial(3, 5);
    const movDa5 = await movDoItem(recId, linhas[1]);
    await dbRun(db, 'UPDATE recebimentos_material_itens_almoxarifado SET movimentacao_entrada_id = NULL WHERE recebimento_id = ?', [recId]);
    // Logo DEPOIS da leitura dos candidatos, "outro estorno" adota o item da linha 5.
    const original = db.all;
    db.all = function allInterceptado(sql, params, cb) {
      return original.call(db, sql, params, (err, rows) => {
        if (typeof sql === 'string' && sql.includes('AND movimentacao_entrada_id IS NULL')) {
          db.all = original;
          return dbRun(db, `UPDATE recebimentos_material_itens_almoxarifado SET movimentacao_entrada_id = 999999
            WHERE recebimento_id = ? AND pedido_item_id = ?`, [recId, linhas[1]]).then(() => cb(err, rows));
        }
        return cb(err, rows);
      });
    };
    let resultado;
    try { resultado = await capturarWarn(() => estornarPelaRota(movDa5)); } finally { db.all = original; }
    const { valor: r } = resultado;
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.ok(!('pedido_compra' in r.body), `descontou um item que outro estorno ja tinha adotado: ${JSON.stringify(r.body)}`);
    assert.strictEqual(await recebidaDa(linhas[1]), 5);
    assert.strictEqual(await recebidaDa(linhas[0]), 3);
  });

  // ── (7) RN-07 best-effort ────────────────────────────────────────────────────────────────────
  await test('(7) RN-07 trigger RAISE(ABORT) no UPDATE da linha: estorno 200, saldo revertido, linha intacta, aviso com a literal', async () => {
    const mat = await novoMaterial();
    const { pedido, linhas } = await novoPedido([{ material_id: mat, quantidade: 10, valor_unitario: 1 }]);
    const recId = await receber(pedido, [itemDaTela(mat, linhas[0], 7)]);
    const [mov] = await entradasDe(recId);
    await dbRun(db, `CREATE TRIGGER e71_trava_linha BEFORE UPDATE OF quantidade_recebida ON itens_pedido_compra
      BEGIN SELECT RAISE(ABORT, 'trava de teste E71'); END`);
    let resultado;
    try {
      resultado = await capturarWarn(() => estornarPelaRota(mov.id));
    } finally {
      await dbRun(db, 'DROP TRIGGER IF EXISTS e71_trava_linha');
    }
    const { linhas: log, valor: r } = resultado;
    assert.strictEqual(r.status, 200, `a falha do pedido derrubou o estorno: ${JSON.stringify(r.body)}`);
    assert.ok(!('pedido_compra' in r.body), JSON.stringify(r.body));
    assert.strictEqual(await saldoAtual(mat), 0, 'o saldo do material tinha de ser revertido');
    assert.strictEqual(await recebidaDa(linhas[0]), 7, 'a linha mudou com o UPDATE travado?');
    assert.ok(log.some((l) => l.startsWith(`[almoxarifado] desconto do pedido de compra no estorno falhou (movimentacao ${mov.id}): `)
      && l.includes('trava de teste E71')), `literal do aviso: ${JSON.stringify(log)}`);
  });

  await test('(7b) Fase 2: a trilha RECEBIDO_ESTORNADO falha -> linha e status JA gravados, reabertura com trilha propria', async () => {
    const mat = await novoMaterial();
    const { pedido, linhas } = await novoPedido([{ material_id: mat, quantidade: 3, valor_unitario: 1 }], { status: 'enviado' });
    const recId = await receber(pedido, [itemDaTela(mat, linhas[0], 3)]);
    assert.strictEqual(await statusDe(pedido.id), 'recebido');
    const [mov] = await entradasDe(recId);
    await dbRun(db, `CREATE TRIGGER e71_trava_trilha BEFORE INSERT ON auditoria_log_almoxarifado
      WHEN NEW.acao = 'RECEBIDO_ESTORNADO' BEGIN SELECT RAISE(ABORT, 'trilha travada E71'); END`);
    let resultado;
    try {
      resultado = await capturarWarn(() => estornarPelaRota(mov.id));
    } finally {
      await dbRun(db, 'DROP TRIGGER IF EXISTS e71_trava_trilha');
    }
    const { valor: r, linhas: log } = resultado;
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.strictEqual(r.body.pedido_compra && r.body.pedido_compra.reaberto, true,
      `a falha da trilha engoliu o desconto/reabertura: ${JSON.stringify(r.body)}`);
    assert.strictEqual(await recebidaDa(linhas[0]), 0);
    assert.strictEqual(await statusDe(pedido.id), 'enviado');
    const trilha = await trilhaDo(pedido.id);
    assert.ok(trilha.some((t) => t.acao === 'STATUS_AUTOMATICO_REABERTO'), 'a trilha da reabertura dependia da outra');
    assert.ok(log.some((l) => l.includes('trilha travada E71')), `a falha da trilha foi calada: ${JSON.stringify(log)}`);
  });

  // ── (8) RN-08 (corrigida na Fase 2): entrada com item em inspecao e recusada ─────────────────
  await test('(8) RN-08 material critico retido, COM outro estoque disponivel: 400 com a literal, linha e status intactos; decidida a inspecao, estorna', async () => {
    const mat = await novoMaterial({ critico: 1 });
    setUser(ADMIN);
    const previa = await request(app).post('/api/almoxarifado/movimentacoes/v2').send({
      material_id: mat, tipo: 'ENTRADA', quantidade: 10, justificativa: 'estoque previo', motivo: 'estoque previo',
    });
    assert.strictEqual(previa.status, 201, JSON.stringify(previa.body));
    const { pedido, linhas } = await novoPedido([{ material_id: mat, quantidade: 4, valor_unitario: 1 }], { status: 'enviado' });
    const recId = await receber(pedido, [itemDaTela(mat, linhas[0], 4)]);
    assert.strictEqual(await statusDe(pedido.id), 'recebido');
    const [mov] = await entradasDe(recId);
    const saldoAntes = await saldoAtual(mat);

    const r = await estornarPelaRota(mov.id);
    assert.strictEqual(r.status, 400, `a entrada com 4 em inspecao foi estornada: ${JSON.stringify(r.body)}`);
    assert.strictEqual(r.body.error, 'Esta entrada tem 4 PC em inspeção — decida a inspeção antes de estornar a entrada');
    assert.strictEqual(await saldoAtual(mat), saldoAntes, 'o saldo mudou com o estorno recusado');
    assert.strictEqual(await recebidaDa(linhas[0]), 4, 'estorno recusado descontou a linha');
    assert.strictEqual(await statusDe(pedido.id), 'recebido', 'estorno recusado reabriu o pedido');
    assert.strictEqual((await dbGet(db, 'SELECT cancelado FROM movimentacoes_almoxarifado WHERE id = ?', [mov.id])).cancelado, 0);

    // Metade positiva: decidida a inspecao (aprovados os 4), o estorno passa e desconta.
    const item = await dbGet(db, 'SELECT id FROM recebimentos_material_itens_almoxarifado WHERE recebimento_id = ?', [recId]);
    const insp = await request(app).post(`/api/almoxarifado/recebimentos/itens/${item.id}/inspecionar`)
      .send({ quantidade_aprovada: 4, quantidade_reprovada: 0, resultado: 'APROVADO' });
    assert.strictEqual(insp.status, 201, JSON.stringify(insp.body));
    const ok = await estornarPelaRota(mov.id);
    assert.strictEqual(ok.status, 200, JSON.stringify(ok.body));
    assert.strictEqual(ok.body.pedido_compra.reaberto, true);
    assert.strictEqual(await recebidaDa(linhas[0]), 0);
  });

  await test('(8b) RN-08 material critico retido SEM outro estoque: a recusa e a da inspecao (literal nova), nao "material ja consumido"', async () => {
    const mat = await novoMaterial({ critico: 1 });
    const { pedido, linhas } = await novoPedido([{ material_id: mat, quantidade: 2, valor_unitario: 1 }]);
    const recId = await receber(pedido, [itemDaTela(mat, linhas[0], 2)]);
    const [mov] = await entradasDe(recId);
    const r = await estornarPeloServico(mov.id).then(() => null, (e) => e);
    assert.ok(r, 'o estorno do retido passou');
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.message, 'Esta entrada tem 2 PC em inspeção — decida a inspeção antes de estornar a entrada');
    assert.strictEqual(await recebidaDa(linhas[0]), 2);
  });

  // ── (9) Fase 2: relancar a MESMA NF depois de estornar tudo ──────────────────────────────────
  await test('(9) Fase 2: NF com todas as entradas estornadas nao bloqueia o relancamento (POST e /fiscal); com entrada viva, bloqueia', async () => {
    const mat = await novoMaterial();
    const mat2 = await novoMaterial();
    const { pedido, linhas } = await novoPedido([
      { material_id: mat, quantidade: 10, valor_unitario: 1 }, { material_id: mat2, quantidade: 10, valor_unitario: 1 },
    ]);
    const recId = await receber(pedido, [itemDaTela(mat, linhas[0], 5), itemDaTela(mat2, linhas[1], 5)],
      { notaFiscal: 'NF-E71T2-RELANCA' });
    const [movA, movB] = await entradasDe(recId);
    const itens = [itemDaTela(mat, linhas[0], 5), itemDaTela(mat2, linhas[1], 5)];
    const postMesmaNf = () => request(app).post('/api/almoxarifado/recebimentos').send({
      tipo_recebimento: 'PEDIDO_COMPRA', pedido_compra_id: pedido.id, nota_fiscal: 'NF-E71T2-RELANCA',
      fornecedor_id: forn.lastID, itens,
    });

    // O OUTRO recebimento (documento novo da mesma compra) chega ate a porta do /fiscal ANTES dos estornos.
    const outro = await request(app).post('/api/almoxarifado/recebimentos').send({
      tipo_recebimento: 'PEDIDO_COMPRA', pedido_compra_id: pedido.id, itens: [itemDaTela(mat, linhas[0], 1)],
    });
    assert.strictEqual(outro.status, 201, JSON.stringify(outro.body));
    const itensOutro = [itemDaTela(mat, linhas[0], 1)];
    assert.strictEqual((await request(app).put(`/api/almoxarifado/recebimentos/${outro.body.id}/conferir`).send({ itens: itensOutro })).status, 200);
    for (const acao of ['encaminhar_compras', 'finalizar_compras', 'iniciar_faturamento']) {
      assert.strictEqual((await request(app).post(`/api/almoxarifado/recebimentos/${outro.body.id}/workflow`).send({ acao })).status, 200);
    }
    const fiscalMesmaNf = () => request(app).put(`/api/almoxarifado/recebimentos/${outro.body.id}/fiscal`).send({
      nota_fiscal: 'NF-E71T2-RELANCA', fornecedor_id: forn.lastID, fornecedor_nome: 'Fornecedor E71 T2',
      data_emissao_nf: '2026-09-01', data_entrada_nf: '2026-09-02', valor_total_nota: 1, itens: itensOutro,
    });

    // Metade negativa primeiro: com UMA entrada viva a nota continua lancada (POST e /fiscal).
    assert.strictEqual((await estornarPelaRota(movA.id)).status, 200);
    const parcial = await postMesmaNf();
    assert.strictEqual(parcial.status, 409, `com entrada viva a NF tinha de continuar bloqueada: ${JSON.stringify(parcial.body)}`);
    const fiscalParcial = await fiscalMesmaNf();
    assert.strictEqual(fiscalParcial.status, 409, `/fiscal com entrada viva: ${JSON.stringify(fiscalParcial.body)}`);

    assert.strictEqual((await estornarPelaRota(movB.id)).status, 200);
    const fiscal = await fiscalMesmaNf();
    assert.strictEqual(fiscal.status, 200, `o /fiscal ainda ve a NF estornada como duplicada: ${JSON.stringify(fiscal.body)}`);
    // E agora a NF tem dono de novo: o documento EM ANDAMENTO (sem entrada nenhuma) bloqueia um terceiro.
    const terceiro = await postMesmaNf();
    assert.strictEqual(terceiro.status, 409, `o documento em andamento nao segurou a NF: ${JSON.stringify(terceiro.body)}`);
    assert.ok(terceiro.body.error.includes(outro.body.numero), JSON.stringify(terceiro.body));
  });

  await test('(9b) Fase 2: o POST de um recebimento novo com a NF cuja unica entrada foi estornada passa (201)', async () => {
    const mat = await novoMaterial();
    const { pedido, linhas } = await novoPedido([{ material_id: mat, quantidade: 10, valor_unitario: 1 }]);
    const recId = await receber(pedido, [itemDaTela(mat, linhas[0], 10)], { notaFiscal: 'NF-E71T2-RELANCA-B' });
    const post = () => request(app).post('/api/almoxarifado/recebimentos').send({
      tipo_recebimento: 'PEDIDO_COMPRA', pedido_compra_id: pedido.id, nota_fiscal: 'NF-E71T2-RELANCA-B',
      fornecedor_id: forn.lastID, itens: [itemDaTela(mat, linhas[0], 10)],
    });
    const antes = await post();
    assert.strictEqual(antes.status, 409, `fixture: com a entrada viva a NF tinha de bloquear: ${JSON.stringify(antes.body)}`);
    assert.strictEqual((await estornarPelaRota((await entradasDe(recId))[0].id)).status, 200);
    const relanca = await post();
    assert.strictEqual(relanca.status, 201, `relancar a NF estornada foi recusado: ${JSON.stringify(relanca.body)}`);
  });

  await test('(9c) Fase 2: documento que falhou no meio (item 1 entrou e foi estornado, item 2 espera) continua dono da NF', async () => {
    const mat = await novoMaterial();
    const matSerie = await novoMaterial();
    await dbRun(db, 'UPDATE materiais_almoxarifado SET controle_serie = 1 WHERE id = ?', [matSerie]);
    setUser(ADMIN);
    const base = await request(app).post('/api/almoxarifado/recebimentos').send({
      tipo_recebimento: 'NOTA_FISCAL', nota_fiscal: 'NF-E71T2-SERIE-BASE',
      itens: [{ material_id: matSerie, quantidade: 1, quantidade_recebida: 1, series: 'SN-E71T2-DUP' }],
    });
    assert.strictEqual(base.status, 201, JSON.stringify(base.body));
    assert.strictEqual((await request(app).post(`/api/almoxarifado/recebimentos/${base.body.id}/aprovar`).send({})).status, 200);

    const { pedido, linhas } = await novoPedido([
      { material_id: mat, quantidade: 5, valor_unitario: 1 }, { material_id: matSerie, quantidade: 1, valor_unitario: 1 },
    ]);
    const itens = [itemDaTela(mat, linhas[0], 5), { ...itemDaTela(matSerie, linhas[1], 1), series: 'SN-E71T2-DUP' }];
    const criado = await request(app).post('/api/almoxarifado/recebimentos').send({
      tipo_recebimento: 'PEDIDO_COMPRA', pedido_compra_id: pedido.id, itens,
    });
    assert.strictEqual(criado.status, 201, JSON.stringify(criado.body));
    const recId = criado.body.id;
    assert.strictEqual((await request(app).put(`/api/almoxarifado/recebimentos/${recId}/conferir`).send({ itens })).status, 200);
    for (const acao of ['encaminhar_compras', 'finalizar_compras', 'iniciar_faturamento']) {
      assert.strictEqual((await request(app).post(`/api/almoxarifado/recebimentos/${recId}/workflow`).send({ acao })).status, 200);
    }
    assert.strictEqual((await request(app).put(`/api/almoxarifado/recebimentos/${recId}/fiscal`).send({
      nota_fiscal: 'NF-E71T2-MEIO', fornecedor_id: forn.lastID, fornecedor_nome: 'Fornecedor E71 T2',
      data_emissao_nf: '2026-09-01', data_entrada_nf: '2026-09-02', valor_total_nota: 6, itens,
    })).status, 200);
    const falhou = await request(app).post(`/api/almoxarifado/recebimentos/${recId}/workflow`).send({ acao: 'processar' });
    assert.strictEqual(falhou.status, 400, `fixture: a serie duplicada tinha de travar o item 2: ${JSON.stringify(falhou.body)}`);
    const entradas = await entradasDe(recId);
    assert.strictEqual(entradas.length, 1, `fixture: so o item 1 entrou: ${JSON.stringify(entradas)}`);
    assert.strictEqual((await estornarPelaRota(entradas[0].id)).status, 200);

    const outra = await request(app).post('/api/almoxarifado/recebimentos').send({
      tipo_recebimento: 'PEDIDO_COMPRA', pedido_compra_id: pedido.id, nota_fiscal: 'NF-E71T2-MEIO',
      fornecedor_id: forn.lastID, itens: [itemDaTela(mat, linhas[0], 5)],
    });
    assert.strictEqual(outra.status, 409,
      `o documento que ainda espera o reprocessamento perdeu a NF: ${JSON.stringify(outra.body)}`);
  });

  // ── (10) RN-10 a proxima nota espera o que falta ─────────────────────────────────────────────
  await test('(10) RN-10 depois do estorno, a nota dos 10 passa SEM excedente e fecha de novo (2a trilha de fechamento)', async () => {
    const mat = await novoMaterial();
    const { pedido, linhas } = await novoPedido([{ material_id: mat, quantidade: 10, valor_unitario: 1 }], { status: 'enviado' });
    const rec1 = await receber(pedido, [itemDaTela(mat, linhas[0], 10)]);
    assert.strictEqual((await estornarPelaRota((await entradasDe(rec1))[0].id)).status, 200);
    await receber(pedido, [itemDaTela(mat, linhas[0], 10)]);   // `receber` exige 201 sem autorizar_excedente
    assert.strictEqual(await statusDe(pedido.id), 'recebido');
    const acoes = (await trilhaDo(pedido.id)).map((t) => t.acao);
    assert.deepStrictEqual(acoes, ['STATUS_AUTOMATICO_RECEBIDO', 'RECEBIDO_ESTORNADO',
      'STATUS_AUTOMATICO_REABERTO', 'STATUS_AUTOMATICO_RECEBIDO'], JSON.stringify(acoes));
  });

  await test('(10b) RN-10 em KG: 0,1 + 0,2 de 0,3 fecha; estorno da de 0,2 reabre; a nota de 0,2 passa sem excedente e fecha', async () => {
    const mat = await novoMaterial({ unidade: 'KG' });
    const { pedido, linhas } = await novoPedido([{ material_id: mat, quantidade: 0.3, valor_unitario: 1 }], { status: 'enviado' });
    await receber(pedido, [itemDaTela(mat, linhas[0], 0.1)]);
    const rec2 = await receber(pedido, [itemDaTela(mat, linhas[0], 0.2)]);
    assert.strictEqual(await statusDe(pedido.id), 'recebido');
    const r = await estornarPelaRota((await entradasDe(rec2))[0].id);
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.strictEqual(r.body.pedido_compra.reaberto, true);
    assert.strictEqual(r.body.pedido_compra.saldo_pendente, 0.2);
    await receber(pedido, [itemDaTela(mat, linhas[0], 0.2)]);
    assert.strictEqual(await statusDe(pedido.id), 'recebido');
  });

  // ── (11) Fase 2: as decisoes atomicas repetem a regua no WHERE ──────────────────────────────
  //
  // A corrida estorno x processar: a decisao "fecha"/"reabre" le a soma FORA do UPDATE. Para medir a
  // janela sem threads, o `db.get` do harness e envolvido: logo DEPOIS da leitura da soma, a "outra
  // porta" muda a linha — exatamente o que a corrida faria.
  function depoisDaLeituraDaSoma(nDaLeitura, efeito) {
    const original = db.get;
    let n = 0;
    db.get = function getInterceptado(sql, params, cb) {
      return original.call(db, sql, params, (err, row) => {
        if (typeof sql === 'string' && sql.includes('saldo_por_material FROM (')) {
          n += 1;
          if (n === nDaLeitura) { db.get = original; return efeito().then(() => cb(err, row), () => cb(err, row)); }
        }
        return cb(err, row);
      });
    };
    return () => { db.get = original; };
  }

  await test('(11) corrida: a soma lida dizia "completo", o estorno desconta antes do UPDATE -> o fechamento NAO grava recebido', async () => {
    const mat = await novoMaterial();
    const { pedido, linhas } = await novoPedido([{ material_id: mat, quantidade: 5, valor_unitario: 1 }]);
    const recId = await receber(pedido, [itemDaTela(mat, linhas[0], 2)]);
    // Estado de partida: a linha completa e o status ainda pendente (o fechamento ainda nao rodou).
    await dbRun(db, 'UPDATE itens_pedido_compra SET quantidade_recebida = 5 WHERE id = ?', [linhas[0]]);
    const restaurar = depoisDaLeituraDaSoma(1, () => dbRun(db,
      'UPDATE itens_pedido_compra SET quantidade_recebida = 2 WHERE id = ?', [linhas[0]]));
    try {
      await receiptService.fecharPedidosCompletos(db, ADMIN, recId);
    } finally { restaurar(); }
    assert.strictEqual(await statusDe(pedido.id), 'pendente',
      'o fechamento gravou recebido com a conta ja aberta — o WHERE nao repete a regua');
    // Metade positiva: sem a corrida, o mesmo estado fecha.
    await dbRun(db, 'UPDATE itens_pedido_compra SET quantidade_recebida = 5 WHERE id = ?', [linhas[0]]);
    await receiptService.fecharPedidosCompletos(db, ADMIN, recId);
    assert.strictEqual(await statusDe(pedido.id), 'recebido');
  });

  await test('(11b) corrida inversa: a soma "depois" dizia aberto, outra nota completa antes do UPDATE -> o estorno NAO reabre', async () => {
    const mat = await novoMaterial();
    const { pedido, linhas } = await novoPedido([{ material_id: mat, quantidade: 6, valor_unitario: 1 }], { status: 'enviado' });
    const recId = await receber(pedido, [itemDaTela(mat, linhas[0], 6)]);
    assert.strictEqual(await statusDe(pedido.id), 'recebido');
    const [mov] = await entradasDe(recId);
    // 1a leitura = "antes", 2a = "depois": depois da 2a, a outra nota repoe os 6.
    const restaurar = depoisDaLeituraDaSoma(2, () => dbRun(db,
      'UPDATE itens_pedido_compra SET quantidade_recebida = 6 WHERE id = ?', [linhas[0]]));
    let r;
    try { r = await estornarPeloServico(mov.id); } finally { restaurar(); }
    assert.strictEqual(r.pedido_compra.reaberto, false, JSON.stringify(r));
    assert.strictEqual(await statusDe(pedido.id), 'recebido', 'o estorno reabriu um pedido que a outra nota completou');
  });

  await close();
  console.log(`\npedidoReabreNoEstorno: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
