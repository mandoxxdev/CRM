/**
 * Etapa 71, T4 (integracao, cruza o tronco T0-T2 e o modulo CORE Compras) — o PEDIDO DE COMPRA QUE
 * REABRE quando a entrada da nota e estornada, ponta a ponta, TUDO PELAS ROTAS.
 *
 * Plano: docs/superpowers/plans/2026-10-01-almoxarifado-etapa71-pedido-reabre.md (T4 e a secao
 * "Fase 2 — revisao do plano", que PREVALECE: a barreira com epsilon em KG, a recusa da inspecao no
 * motor, o relancamento da mesma NF e as duas contas a pagar declaradas).
 *
 * T0 (regua unica), T1 (vinculo item -> movimentacao) e T2 (desconto + reabertura + gancho no motor)
 * foram provados cada um no seu arquivo, com o recebimento montado por um atalho (sem
 * iniciar/finalizar conferencia). Aqui se prova que conversam numa operacao real, do jeito que a
 * tela faz:
 *
 *  - o pedido nasce pela rota de COMPRAS (`POST /api/compras/pedidos`), com DOIS materiais;
 *  - o recebimento contra o pedido (payload da tela) -> iniciar_conferencia -> PUT /conferir ->
 *    finalizar_conferencia -> encaminhar_compras -> finalizar_compras -> iniciar_faturamento ->
 *    PUT /fiscal -> POST /processar. Nenhum UPDATE de status a mao;
 *  - a ENTRADA_COMPRA e achada pelo livro (`GET /movimentacoes`) e estornada pela rota do livro
 *    (`POST /movimentacoes/:id/cancelar`) — o botao Estornar da tela de Movimentacoes;
 *  - os sinais sao lidos pelas rotas que as telas leem: `GET /api/compras/pedidos/:id`,
 *    `?atrasados=1`, `recebimentos-aux/pedidos-compra?pendentes=1`, `.../:id/itens`,
 *    `GET /alertas/central`, `GET /auditoria`.
 *
 * Fixtures fora das rotas (e so elas): a tabela CORE `contas_pagar` (o harness nao a cria; molde
 * comprasPedidoAtrasoIntegracao.api.test.js:110), para o cenario (B) poder CONTAR as duas contas.
 *
 * Executar: cd server && node tests/api/pedidoReabreIntegracao.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

const ADMIN = { id: 7140, nome: 'Admin E71T4', role: 'admin', is_superadmin: 1, email: 'admin-e71t4@x.com' };
const ALMOX = { id: 7141, nome: 'Alan Almox E71T4', role: 'usuario', perfil_almoxarifado: 'ALMOXARIFE', email: 'alan-e71t4@x.com' };
// Previsao FIXA no passado (nunca o "hoje" do JS — UTC perto da meia-noite muda o dia).
const PREVISAO_VENCIDA = '2026-01-01';

let seq = 0;

(async () => {
  console.log('\n=== Etapa 71 T4: o pedido que reabre no estorno, ponta a ponta (rotas) ===\n');
  const { app, db, setUser, close } = await createTestApp({ user: { ...ADMIN } });
  const API = '/api/almoxarifado';
  const como = (u) => { setUser({ ...u }); return request(app); };
  const ok = (r, status, oque) => {
    assert.strictEqual(r.status, status, `${oque}: esperava ${status}, veio ${r.status} ${JSON.stringify(r.body)}`);
    return r.body;
  };

  await dbRun(db, `CREATE TABLE IF NOT EXISTS contas_pagar (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    descricao TEXT NOT NULL, fornecedor TEXT, valor REAL NOT NULL, data_vencimento DATE,
    data_pagamento DATE, status TEXT DEFAULT 'pendente', categoria TEXT, observacoes TEXT
  )`);

  // Inspecao de critico ligada PELA ROTA (a mesma da tela de Configuracoes) — o cenario (D) depende.
  ok(await como(ADMIN).put(`${API}/configuracoes`).send({ inspecao_material_critico: '1' }), 200, 'PUT configuracoes');

  const forn = ok(await como(ADMIN).post('/api/compras/fornecedores')
    .send({ razao_social: 'Forn E71T4', cnpj: '71.714.714/0001-71' }), 201, 'POST fornecedor').id;
  const familia = ok(await como(ADMIN).post(`${API}/familias`).send({ nome: 'Fam E71T4' }), 201, 'POST familia').id;

  async function novoMat(rotulo, extra = {}) {
    seq += 1;
    const codigo = `E71T4-${rotulo}-${seq}`;
    const b = ok(await como(ADMIN).post(`${API}/materiais`).send({
      codigo, nome: `Material ${rotulo} ${seq}`, unidade: 'UN', familia_id: familia, ...extra,
    }), 201, `POST material ${rotulo}`);
    return { id: b.id, codigo };
  }

  async function novoPedido(itens, { status = 'enviado', previsao = null } = {}) {
    const pedido = ok(await como(ADMIN).post('/api/compras/pedidos').send({
      fornecedor_id: forn, status, previsao_entrega: previsao, itens,
    }), 201, 'POST /api/compras/pedidos');
    const linha = (mat) => pedido.itens.find((i) => i.material_id === mat.id).id;
    return { pedido, linha };
  }

  const itemDaTela = (mat, linhaId, q) => ({ material_id: mat.id, pedido_item_id: linhaId, quantidade: q, quantidade_recebida: q });

  /** POST do recebimento contra o pedido, como a tela manda (sem autorizar_excedente). */
  const postRecebimento = (pedido, itens, extra = {}) => como(ALMOX).post(`${API}/recebimentos`).send({
    tipo_recebimento: 'PEDIDO_COMPRA', pedido_compra_id: pedido.id, itens, ...extra,
  });

  /** Do recebimento criado ate PROCESSADO, pelas portas reais, com a conferencia inteira. */
  async function levarAteProcessado(rec, notaFiscal, fiscalExtra = {}) {
    const wf = async (acao) => ok(await como(ADMIN).post(`${API}/recebimentos/${rec}/workflow`).send({ acao }), 200, `workflow ${acao}`);
    await wf('iniciar_conferencia');
    const itensRec = await dbAll(db, `SELECT id, quantidade_recebida FROM recebimentos_material_itens_almoxarifado
      WHERE recebimento_id = ? ORDER BY id`, [rec]);
    ok(await como(ALMOX).put(`${API}/recebimentos/${rec}/conferir`)
      .send({ itens: itensRec.map((i) => ({ id: i.id, quantidade_recebida: i.quantidade_recebida })) }), 200, 'conferir');
    await wf('finalizar_conferencia');
    await wf('encaminhar_compras');
    await wf('finalizar_compras');
    await wf('iniciar_faturamento');
    ok(await como(ADMIN).put(`${API}/recebimentos/${rec}/fiscal`).send({
      nota_fiscal: notaFiscal, data_emissao_nf: '2026-09-28', data_entrada_nf: '2026-09-29', valor_total_nota: 100, ...fiscalExtra,
    }), 200, `PUT fiscal ${notaFiscal}`);
    const proc = ok(await como(ADMIN).post(`${API}/recebimentos/${rec}/processar`).send({}), 200, 'processar');
    assert.strictEqual(proc.status, 'PROCESSADO');
  }

  let nf = 0;
  async function receber(pedido, itens, { notaFiscal } = {}) {
    nf += 1;
    const numeroNf = notaFiscal || `NF-E71T4-${nf}`;
    const rec = ok(await postRecebimento(pedido, itens), 201, `POST recebimento ${numeroNf}`).id;
    await levarAteProcessado(rec, numeroNf);
    return rec;
  }

  // Leituras PELAS ROTAS que as telas leem.
  const statusDe = async (pedidoId) => ok(await como(ADMIN).get(`/api/compras/pedidos/${pedidoId}`), 200, 'GET pedido').status;
  const emAtrasados = async (pedidoId) => ok(await como(ADMIN).get('/api/compras/pedidos?atrasados=1'), 200, 'atrasados')
    .some((p) => p.id === pedidoId);
  const emPendentes = async (pedido) => ok(await como(ALMOX)
    .get(`${API}/recebimentos-aux/pedidos-compra?pendentes=1&search=${encodeURIComponent(pedido.numero)}`), 200, 'pendentes')
    .some((p) => p.id === pedido.id);
  const itensOferecidos = async (pedidoId) => ok(await como(ALMOX)
    .get(`${API}/recebimentos-aux/pedidos-compra/${pedidoId}/itens`), 200, 'itens do pedido');
  const noCartao = async (chave, pedidoId) => {
    const central = ok(await como(ADMIN).get(`${API}/alertas/central`), 200, 'central');
    const cartao = central.alertas.find((a) => a.chave === chave);
    assert.ok(cartao && !cartao.erro, `cartao ${chave}: ${JSON.stringify(cartao)}`);
    return cartao.linhas.some((l) => l.id === pedidoId);
  };
  /** A ENTRADA_COMPRA de um recebimento+material, achada pelo LIVRO (o que a tela de Movimentacoes lista). */
  const entradaNoLivro = async (rec, mat) => {
    const livro = ok(await como(ADMIN).get(`${API}/movimentacoes?tipo=ENTRADA_COMPRA&material_id=${mat.id}`), 200, 'GET livro');
    const achadas = livro.filter((m) => m.recebimento_id === rec);
    assert.strictEqual(achadas.length, 1, `uma ENTRADA_COMPRA do recebimento ${rec} para ${mat.codigo}: ${JSON.stringify(achadas)}`);
    return achadas[0];
  };
  const estornar = (movId, motivo = 'lancado errado') => como(ADMIN).post(`${API}/movimentacoes/${movId}/cancelar`).send({ motivo });
  const saldo = async (mat) => ok(await como(ADMIN).get(`${API}/materiais/${mat.id}`), 200, 'GET material').quantidade_atual;
  /** Trilha do pedido pela rota da auditoria, em ordem cronologica (a rota devolve DESC). */
  const trilhaDoPedido = async (pedidoId) => ok(await como(ADMIN)
    .get(`${API}/auditoria?entidade=pedido_compra&entidade_id=${pedidoId}&limite=1000`), 200, 'GET auditoria').itens.reverse();

  // ─────────────────────────────────────────────────────────────────────────────────────────────
  // (A) A cadeia inteira: pedido enviado e vencido, DOIS materiais -> nota fecha -> estorno de UMA
  // entrada -> reabre e volta aos sinais -> nota dos 10 SEM excedente -> fecha de novo.
  // ─────────────────────────────────────────────────────────────────────────────────────────────
  const A = {};
  await test('(A1) pedido enviado/vencido de MA(10)+MB(5) pela rota de Compras: atrasado e pendente; a nota inteira fecha e tira dos dois', async () => {
    A.MA = await novoMat('MA');
    A.MB = await novoMat('MB');
    Object.assign(A, await novoPedido([
      { material_id: A.MA.id, quantidade: 10, valor_unitario: 3 },
      { material_id: A.MB.id, quantidade: 5, valor_unitario: 7 },
    ], { status: 'enviado', previsao: PREVISAO_VENCIDA }));
    assert.strictEqual(await emAtrasados(A.pedido.id), true, 'fixture: o pedido tinha de nascer atrasado');
    assert.strictEqual(await emPendentes(A.pedido), true, 'fixture: o pedido sem nota tinha de estar em ?pendentes=1');

    A.rec1 = await receber(A.pedido, [itemDaTela(A.MA, A.linha(A.MA), 10), itemDaTela(A.MB, A.linha(A.MB), 5)]);
    assert.strictEqual(await statusDe(A.pedido.id), 'recebido', 'a nota inteira tinha de fechar o pedido');
    assert.strictEqual(await emAtrasados(A.pedido.id), false, 'o pedido fechado saiu dos atrasados');
    assert.strictEqual(await emPendentes(A.pedido), false, 'o pedido fechado saiu de ?pendentes=1');
    assert.deepStrictEqual(await itensOferecidos(A.pedido.id), [], 'pedido quitado: a rota de itens nao oferece nada');
    assert.strictEqual(await saldo(A.MA), 10);
    assert.strictEqual(await saldo(A.MB), 5);
    // A barreira que o estorno vai abrir: com o pedido quitado, a nota de 10 de MA e recusada.
    const barrada = await postRecebimento(A.pedido, [itemDaTela(A.MA, A.linha(A.MA), 10)]);
    assert.strictEqual(barrada.status, 400, `com o pedido quitado a nota tinha de ser recusada: ${JSON.stringify(barrada.body)}`);
  });

  await test('(A2) estorno da entrada de MA pelo livro: a resposta traz pedido_compra reaberto, de volta a enviado', async () => {
    A.movA = await entradaNoLivro(A.rec1, A.MA);
    const r = await estornar(A.movA.id);
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.strictEqual(r.body.success, true);
    assert.deepStrictEqual(r.body.pedido_compra, {
      id: A.pedido.id, numero: A.pedido.numero, pedido_item_id: A.linha(A.MA), quantidade_estornada: 10,
      situacao_antes: 'RECEBIDO', situacao_depois: 'PARCIAL', saldo_pendente: 10,
      status_anterior: 'recebido', status: 'enviado', reaberto: true,
      // Etapa 72, T2: o contrato CRESCEU — a chave existe sempre que ha pedido ([] sem solicitacao a reabrir).
      solicitacoes_reabertas: [],
    }, `contrato da resposta: ${JSON.stringify(r.body)}`);
    assert.strictEqual(await statusDe(A.pedido.id), 'enviado', 'o Compras nao mostra o pedido reaberto no status de antes');
    assert.strictEqual(await saldo(A.MA), 0, 'o saldo de MA tinha de voltar a 0');
    assert.strictEqual(await saldo(A.MB), 5, 'o estorno de MA mexeu no saldo de MB');
  });

  await test('(A3) o pedido reaberto volta aos sinais: ?atrasados=1, ?pendentes=1, cartao de atrasado e de parcial; itens oferece 10 de MA e nao reabre MB', async () => {
    assert.strictEqual(await emAtrasados(A.pedido.id), true, 'o pedido reaberto e vencido nao voltou a ?atrasados=1');
    assert.strictEqual(await emPendentes(A.pedido), true, 'o pedido reaberto nao voltou a ?pendentes=1');
    assert.strictEqual(await noCartao('PEDIDO_COMPRA_ATRASADO', A.pedido.id), true, 'o cartao de atrasado nao voltou');
    assert.strictEqual(await noCartao('PEDIDO_COMPRA_PARCIAL', A.pedido.id), true, 'MB chegou e MA nao: o cartao de parcial nao mostrou');
    const itens = await itensOferecidos(A.pedido.id);
    const de = (mat) => itens.find((i) => i.material_id === mat.id);
    assert.strictEqual(de(A.MA).saldo_pendente, 10, JSON.stringify(itens));
    assert.strictEqual(de(A.MA).saldo_pendente_material, 10, JSON.stringify(itens));
    assert.strictEqual(de(A.MA).quantidade_recebida, 0, JSON.stringify(itens));
    assert.strictEqual(de(A.MB), undefined, `o estorno de MA reabriu a linha de MB: ${JSON.stringify(itens)}`);
    assert.strictEqual(itens.length, 1, JSON.stringify(itens));
  });

  await test('(A4) nova nota de 10 de MA SEM autorizar_excedente -> processar -> o pedido fecha de novo e sai dos sinais', async () => {
    const r = await postRecebimento(A.pedido, [itemDaTela(A.MA, A.linha(A.MA), 10)]);
    assert.strictEqual(r.status, 201, `a nota dos 10 que faltam pediu excedente: ${JSON.stringify(r.body)}`);
    await levarAteProcessado(r.body.id, 'NF-E71T4-A-SEGUNDA');
    assert.strictEqual(await statusDe(A.pedido.id), 'recebido', 'a segunda nota nao fechou o pedido reaberto');
    assert.strictEqual(await emAtrasados(A.pedido.id), false);
    assert.strictEqual(await emPendentes(A.pedido), false);
    assert.strictEqual(await saldo(A.MA), 10);
  });

  await test('(A5) trilha do pedido pela rota da auditoria: fecha, estorna, reabre, fecha — com os dois rotulos novos', async () => {
    const acoes = ['STATUS_AUTOMATICO_RECEBIDO', 'RECEBIDO_ESTORNADO', 'STATUS_AUTOMATICO_REABERTO'];
    const trilha = (await trilhaDoPedido(A.pedido.id)).filter((t) => acoes.includes(t.acao));
    assert.deepStrictEqual(trilha.map((t) => t.acao), ['STATUS_AUTOMATICO_RECEBIDO', 'RECEBIDO_ESTORNADO',
      'STATUS_AUTOMATICO_REABERTO', 'STATUS_AUTOMATICO_RECEBIDO'], JSON.stringify(trilha.map((t) => t.acao)));
    const rot = (acao) => trilha.find((t) => t.acao === acao).acao_rotulo;
    assert.strictEqual(rot('RECEBIDO_ESTORNADO'), 'Recebido do pedido estornado');
    assert.strictEqual(rot('STATUS_AUTOMATICO_REABERTO'), 'Reabertura automática do pedido');
    const est = trilha.find((t) => t.acao === 'RECEBIDO_ESTORNADO');
    assert.strictEqual(est.justificativa, `Estorno da movimentação #${A.movA.id} descontou 10 do pedido`);
    assert.deepStrictEqual(JSON.parse(trilha[2].dados_novos), { status: 'enviado' });
  });

  // ─────────────────────────────────────────────────────────────────────────────────────────────
  // (B) "Lancei errado": estornar TODAS as entradas da nota e relancar a MESMA NF.
  // ─────────────────────────────────────────────────────────────────────────────────────────────
  await test('(B) lancei errado: estorno das duas entradas -> pedido aprovado, ABERTO; a MESMA NF relanca e fecha; as DUAS contas a pagar existem (declarado, D6)', async () => {
    const MC = await novoMat('MC');
    const MD = await novoMat('MD');
    const { pedido, linha } = await novoPedido([
      { material_id: MC.id, quantidade: 4, valor_unitario: 1 },
      { material_id: MD.id, quantidade: 6, valor_unitario: 1 },
    ], { status: 'aprovado' });
    const NF = 'NF-E71T4-ERRADA';
    const itens = [itemDaTela(MC, linha(MC), 4), itemDaTela(MD, linha(MD), 6)];
    const rec = await receber(pedido, itens, { notaFiscal: NF });
    assert.strictEqual(await statusDe(pedido.id), 'recebido');

    const movC = await entradaNoLivro(rec, MC);
    const movD = await entradaNoLivro(rec, MD);
    const r1 = await estornar(movC.id);
    assert.strictEqual(r1.status, 200, JSON.stringify(r1.body));
    assert.strictEqual(r1.body.pedido_compra.reaberto, true, JSON.stringify(r1.body));
    assert.strictEqual(r1.body.pedido_compra.status, 'aprovado', JSON.stringify(r1.body));
    // Metade negativa: com UMA entrada viva a NF continua lancada.
    const cedo = await postRecebimento(pedido, itens, { nota_fiscal: NF });
    assert.strictEqual(cedo.status, 409, `com entrada viva a NF tinha de continuar bloqueada: ${JSON.stringify(cedo.body)}`);

    const r2 = await estornar(movD.id);
    assert.strictEqual(r2.status, 200, JSON.stringify(r2.body));
    assert.strictEqual(r2.body.pedido_compra.situacao_depois, 'ABERTO', JSON.stringify(r2.body));
    assert.strictEqual(r2.body.pedido_compra.reaberto, false, 'o segundo estorno nao reabre de novo (o status ja nao e recebido)');
    assert.strictEqual(r2.body.pedido_compra.saldo_pendente, 10, JSON.stringify(r2.body));
    assert.strictEqual(await statusDe(pedido.id), 'aprovado');
    assert.strictEqual(await emPendentes(pedido), true);
    assert.deepStrictEqual((await itensOferecidos(pedido.id)).map((i) => i.saldo_pendente), [4, 6]);

    const relanca = await postRecebimento(pedido, itens, { nota_fiscal: NF });
    assert.strictEqual(relanca.status, 201, `relancar a NF estornada foi recusado: ${JSON.stringify(relanca.body)}`);
    await levarAteProcessado(relanca.body.id, NF);
    assert.strictEqual(await statusDe(pedido.id), 'recebido', 'a NF relancada nao fechou o pedido');
    assert.strictEqual(await saldo(MC), 4);
    assert.strictEqual(await saldo(MD), 6);
    const contas = await dbAll(db, 'SELECT id FROM contas_pagar WHERE descricao LIKE ?', [`NF ${NF} — %`]);
    assert.strictEqual(contas.length, 2,
      `D6 declarado: o estorno nao desfaz a conta a pagar, relancar deixa DUAS contas: ${JSON.stringify(contas)}`);
  });

  // ─────────────────────────────────────────────────────────────────────────────────────────────
  // (C) KG / ponto flutuante: 0,3 em 0,1 + 0,2.
  // ─────────────────────────────────────────────────────────────────────────────────────────────
  await test('(C) KG: pedido de 0,3 recebe 0,1 + 0,2 sem 400 e fecha; estorno da de 0,2 reabre com saldo 0,2 limpo; a nova de 0,2 passa e fecha', async () => {
    const MK = await novoMat('MK', { unidade: 'KG' });
    const { pedido, linha } = await novoPedido([{ material_id: MK.id, quantidade: 0.3, valor_unitario: 1 }], { status: 'enviado' });
    await receber(pedido, [itemDaTela(MK, linha(MK), 0.1)]);
    const rec2 = ok(await postRecebimento(pedido, [itemDaTela(MK, linha(MK), 0.2)]), 201,
      'a nota de 0,2 depois da de 0,1 (barreira com epsilon, T0)').id;
    await levarAteProcessado(rec2, 'NF-E71T4-KG-2');
    assert.strictEqual(await statusDe(pedido.id), 'recebido', '0,1 + 0,2 de 0,3 nao fechou');

    const r = await estornar((await entradaNoLivro(rec2, MK)).id);
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.strictEqual(r.body.pedido_compra.reaberto, true, JSON.stringify(r.body));
    assert.strictEqual(r.body.pedido_compra.saldo_pendente, 0.2, `saldo com ruido: ${JSON.stringify(r.body)}`);
    assert.strictEqual(await statusDe(pedido.id), 'enviado');
    assert.strictEqual(await emPendentes(pedido), true);
    const [oferecido] = await itensOferecidos(pedido.id);
    assert.ok(Math.abs(oferecido.saldo_pendente_material - 0.2) < 1e-9, JSON.stringify(oferecido));

    const nova = await postRecebimento(pedido, [itemDaTela(MK, linha(MK), 0.2)]);
    assert.strictEqual(nova.status, 201, `a nota de 0,2 depois do estorno tomou: ${JSON.stringify(nova.body)}`);
    await levarAteProcessado(nova.body.id, 'NF-E71T4-KG-3');
    assert.strictEqual(await statusDe(pedido.id), 'recebido');
  });

  // ─────────────────────────────────────────────────────────────────────────────────────────────
  // (D) Material critico retido: o estorno e recusado ANTES de tocar no pedido.
  // ─────────────────────────────────────────────────────────────────────────────────────────────
  await test('(D) critico retido (com outro estoque): estorno 400 com a literal, pedido intacto; inspecionado, o estorno passa e reabre', async () => {
    const MX = await novoMat('MX', { material_critico: 1 });
    // O caso que a Fase 2 achou: com OUTRO saldo do material o motor deixava passar.
    ok(await como(ADMIN).post(`${API}/movimentacoes`).send({
      material_id: MX.id, tipo: 'ENTRADA', quantidade: 10, motivo: 'saldo inicial', observacoes: 'E71T4',
    }), 201, 'entrada manual MX');
    const { pedido, linha } = await novoPedido([{ material_id: MX.id, quantidade: 4, valor_unitario: 1 }], { status: 'enviado' });
    const rec = await receber(pedido, [itemDaTela(MX, linha(MX), 4)]);
    assert.strictEqual(await statusDe(pedido.id), 'recebido');
    const mov = await entradaNoLivro(rec, MX);
    const saldoAntes = await saldo(MX);

    const r = await estornar(mov.id);
    assert.strictEqual(r.status, 400, `a entrada com 4 em inspecao foi estornada: ${JSON.stringify(r.body)}`);
    assert.strictEqual(r.body.error, 'Esta entrada tem 4 UN em inspeção — decida a inspeção antes de estornar a entrada');
    assert.strictEqual(await saldo(MX), saldoAntes, 'o estorno recusado mexeu no saldo');
    assert.strictEqual(await statusDe(pedido.id), 'recebido', 'o estorno recusado reabriu o pedido');
    assert.deepStrictEqual(await itensOferecidos(pedido.id), [], 'o estorno recusado descontou a linha');
    assert.strictEqual(await emPendentes(pedido), false);

    const item = await dbGet(db, 'SELECT id FROM recebimentos_material_itens_almoxarifado WHERE recebimento_id = ?', [rec]);
    ok(await como(ADMIN).post(`${API}/recebimentos/itens/${item.id}/inspecionar`)
      .send({ quantidade_aprovada: 4, quantidade_reprovada: 0, resultado: 'APROVADO' }), 201, 'inspecionar');
    const depois = await estornar(mov.id);
    assert.strictEqual(depois.status, 200, JSON.stringify(depois.body));
    assert.strictEqual(depois.body.pedido_compra.reaberto, true, JSON.stringify(depois.body));
    assert.strictEqual(await statusDe(pedido.id), 'enviado');
  });

  // ─────────────────────────────────────────────────────────────────────────────────────────────
  // (E) Nota AVULSA (sem pedido) do mesmo material de um pedido: o estorno nao toca pedido nenhum.
  // ─────────────────────────────────────────────────────────────────────────────────────────────
  await test('(E) nota avulsa do material MA estornada: resposta sem pedido_compra; o pedido de MA, a linha e a trilha nao mudam', async () => {
    const trilhaAntes = (await trilhaDoPedido(A.pedido.id)).length;
    const itensAntes = await itensOferecidos(A.pedido.id);
    const avulsa = ok(await como(ALMOX).post(`${API}/recebimentos`).send({
      tipo_recebimento: 'NOTA_FISCAL', fornecedor_id: forn,
      itens: [{ material_id: A.MA.id, quantidade: 3, quantidade_recebida: 3 }],
    }), 201, 'POST nota avulsa').id;
    await levarAteProcessado(avulsa, 'NF-E71T4-AVULSA', { fornecedor_id: forn, fornecedor_nome: 'Forn E71T4' });
    const mov = await entradaNoLivro(avulsa, A.MA);
    const r = await estornar(mov.id);
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.ok(!('pedido_compra' in r.body), `nota sem pedido ganhou pedido_compra: ${JSON.stringify(r.body)}`);
    assert.strictEqual(await statusDe(A.pedido.id), 'recebido');
    assert.deepStrictEqual(await itensOferecidos(A.pedido.id), itensAntes, 'a nota avulsa mexeu na linha do pedido');
    assert.strictEqual((await trilhaDoPedido(A.pedido.id)).length, trilhaAntes, 'a nota avulsa gravou trilha no pedido');
  });

  // ─────────────────────────────────────────────────────────────────────────────────────────────
  // (F) Pelo /aprovar direto (a outra porta de entrada fisica), 6 + 4: o estorno da de 4 termina no
  // cartao de PARCIAL.
  // ─────────────────────────────────────────────────────────────────────────────────────────────
  await test('(F) /aprovar direto, 6 + 4 fecham; estorno da de 4 -> reaberto, PARCIAL saldo 4, no cartao de parcial', async () => {
    const MP = await novoMat('MP');
    const { pedido, linha } = await novoPedido([{ material_id: MP.id, quantidade: 10, valor_unitario: 1 }], { status: 'aprovado' });
    const aprovarDireto = async (q) => {
      const rec = ok(await postRecebimento(pedido, [itemDaTela(MP, linha(MP), q)]), 201, `POST ${q}`).id;
      ok(await como(ADMIN).post(`${API}/recebimentos/${rec}/aprovar`).send({}), 200, `aprovar ${q}`);
      return rec;
    };
    await aprovarDireto(6);
    const rec4 = await aprovarDireto(4);
    assert.strictEqual(await statusDe(pedido.id), 'recebido');
    assert.strictEqual(await noCartao('PEDIDO_COMPRA_PARCIAL', pedido.id), false, 'fixture: fechado nao e parcial');
    const r = await estornar((await entradaNoLivro(rec4, MP)).id);
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.strictEqual(r.body.pedido_compra.reaberto, true, JSON.stringify(r.body));
    assert.strictEqual(r.body.pedido_compra.situacao_depois, 'PARCIAL');
    assert.strictEqual(r.body.pedido_compra.saldo_pendente, 4);
    assert.strictEqual(await statusDe(pedido.id), 'aprovado');
    assert.strictEqual(await noCartao('PEDIDO_COMPRA_PARCIAL', pedido.id), true, 'o reaberto parcial nao voltou ao cartao');
    assert.strictEqual((await itensOferecidos(pedido.id))[0].saldo_pendente, 4);
  });

  await close();
  console.log(`\n${passed} passou, ${failed} falhou`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
