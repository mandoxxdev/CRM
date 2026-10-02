/**
 * Etapa 42, T5 — a INTEGRAÇÃO que percorre a CADEIA INTEIRA que as Etapas 38–42 construíram.
 *
 * ── POR QUE ESTE ARQUIVO EXISTE, se cada peça já tem suíte de unidade ────────────────────────
 * Verde por unidade não prova que as partes COMPÕEM, e esta etapa é o último elo de uma cadeia de
 * QUATRO etapas em módulos DIFERENTES:
 *
 *   cotação (Etapa 40/41, módulo Compras)
 *     -> `gerar-pedido` (Etapa 41) — o pedido nasce da cotação, com número gerado
 *       -> recebimento contra pedido (Etapa 37, módulo Almoxarifado) — parcial, e depois o resto
 *         -> `quantidade_recebida` na linha (Etapa 37)
 *           -> situação derivada `PARCIAL`/`RECEBIDO` (Etapa 37)
 *             -> alerta de pedido parcial (Etapa 42, T3) — feature 20
 *             -> `pedidos_compra.status = 'recebido'` (Etapa 42, T2)
 *               -> `derivarAtraso` (Etapa 39) tira o pedido de `?atrasados=1`
 *
 * Nenhuma suíte de unidade atravessa isso: `comprasPedidoStatusAutomatico` (T2) parte de um pedido
 * criado pela rota de Compras, `alertaPedidoParcial` (T3) parte de linhas escritas direto, e
 * `comprasCotacaoPedidoIntegracao` (Etapa 41) para no pedido recém-gerado com saldo cheio. O
 * cenário (1) daqui é o único lugar onde um pedido **gerado de uma cotação** é recebido em DUAS
 * remessas e a aba Compras, a central de alertas e a trilha de auditoria são consultadas nos DOIS
 * estados intermediários.
 *
 * ── A EXIGÊNCIA DA FASE 1 DA SKILL: OS DOIS CAMINHOS ────────────────────────────────────────
 * Onde a feature depende de FIAÇÃO, um cenário tem de entrar **pela rota** e outro **pelo serviço**.
 * Aqui: o cenário (1) entra pela ROTA (HTTP, as seis portas do recebimento); o cenário RN-E06 de
 * `comprasPedidoStatusAutomatico` entra pelo SERVIÇO (`darEntradaEstoque` pelo ramo de `/aprovar`
 * que NÃO delega). O cenário (2) daqui fecha a terceira ponta: o JOB (`varrerAlertasRegistrados`),
 * que não tem `req` nem `user`.
 *
 * ⚠️ NENHUMA DATA LITERAL: a previsão de entrega deriva de `hojeLocalISO()`, a MESMA função da
 * régua — um `'2026-09-15'` escrito à mão está atrasado hoje e não está amanhã, e o arquivo viraria
 * falso-verde sem ninguém notar (a lição R3 da Etapa 39).
 *
 * ⚠️ TODA asserção sobre a fila filtra por `evento`: o harness semeia materiais que caem
 * automaticamente em outras entradas do registro, e um contador global mediria outro alerta.
 *
 * Executar: cd server && node tests/api/recebimentoFechaPedidoIntegracao.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const queueService = require('../../services/almoxarifado/notificationQueueService');
const alertRegistry = require('../../services/almoxarifado/alertRegistry');
const cotacaoService = require('../../services/compras/cotacaoService');
const { hojeLocalISO } = require('../../services/compras/pedidoCompraService');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

const ADMIN = { id: 150, nome: 'Admin E42 T5', role: 'admin', is_superadmin: 1, email: 'admin@test.com' };

function diasDeHoje(n) {
  const [a, m, d] = hojeLocalISO().split('-').map(Number);
  const dt = new Date(a, m - 1, d + n);
  return [dt.getFullYear(), String(dt.getMonth() + 1).padStart(2, '0'),
    String(dt.getDate()).padStart(2, '0')].join('-');
}

(async () => {
  const { app, db, close } = await createTestApp({ user: ADMIN });

  // `gerarContaPagar` insere aqui no `processar`. Subconjunto minimo das colunas do INSERT dele.
  await dbRun(db, `CREATE TABLE IF NOT EXISTS contas_pagar (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    descricao TEXT NOT NULL, fornecedor TEXT, valor REAL NOT NULL, data_vencimento DATE,
    data_pagamento DATE, status TEXT DEFAULT 'pendente', categoria TEXT, observacoes TEXT
  )`);

  // O alerta so sai com destinatario e com o toggle mestre ligado — o cenario (2) mede o caminho
  // feliz, e o desligado ja tem cenario proprio na suite de unidade do alerta.
  const setConfig = (chave, valor) => dbRun(db,
    'UPDATE configuracoes_almoxarifado SET valor = ? WHERE chave = ?', [valor, chave]);
  await setConfig('alertas_estoque_emails', 'compras@gmp.ind.br');
  await setConfig('alertas_estoque_notificar_email', '1');

  const forn = await dbRun(db, `INSERT INTO fornecedores (razao_social, cnpj, status)
    VALUES ('Acos Vale E42 T5','80.880.880/0001-80','ativo')`);
  const material = (await dbRun(db, `INSERT INTO materiais_almoxarifado
    (codigo, nome, unidade, quantidade_atual, ativo) VALUES ('MAT-E42-INT','Chapa E42 Integracao','KG',0,1)`)).lastID;

  const naListaCompras = async (qs, id) => (await request(app).get(`/api/compras/pedidos${qs || ''}`))
    .body.find((p) => p.id === id);
  const statusCore = async (id) => (await dbGet(db,
    'SELECT status FROM pedidos_compra WHERE id = ?', [id])).status;
  // Etapa 71, Fase 5: a porta manual (PATCH ./status) passou a gravar STATUS_MANUAL_ALTERADO; o
  // PATCH da fixture do (1) nao e o fato medido — esta trilha e a do fechamento automatico.
  const trilhaDoPedido = (id) => dbAll(db, `SELECT acao, usuario_nome FROM auditoria_log_almoxarifado
    WHERE entidade = 'pedido_compra' AND entidade_id = ? AND acao <> 'STATUS_MANUAL_ALTERADO' ORDER BY id`, [id]);
  const cartaoParcial = async () => (await alertRegistry.montarCentral(db)).alertas
    .find((a) => a.chave === 'PEDIDO_COMPRA_PARCIAL');
  const filaParcial = () => dbAll(db,
    "SELECT assunto, corpo_texto, hash_dedupe, status FROM fila_notificacoes_almoxarifado WHERE evento = 'PEDIDO_COMPRA_PARCIAL' ORDER BY id");

  /** As SEIS PORTAS do recebimento contra pedido, pela ROTA, ate PROCESSADO. */
  async function receberPelaRota(pedidoId, linhaId, quantidade, tag) {
    const itens = [{
      material_id: material, pedido_item_id: linhaId,
      quantidade, quantidade_recebida: quantidade,
    }];
    const criado = await request(app).post('/api/almoxarifado/recebimentos').send({
      tipo_recebimento: 'PEDIDO_COMPRA', pedido_compra_id: pedidoId, itens,
    });
    assert.strictEqual(criado.status, 201, `POST /recebimentos (${tag}): ${JSON.stringify(criado.body)}`);
    const recId = criado.body.id;
    assert.strictEqual((await request(app).put(`/api/almoxarifado/recebimentos/${recId}/conferir`)
      .send({ itens })).status, 200, `conferir (${tag})`);
    for (const acao of ['encaminhar_compras', 'finalizar_compras', 'iniciar_faturamento']) {
      assert.strictEqual((await request(app).post(`/api/almoxarifado/recebimentos/${recId}/workflow`)
        .send({ acao })).status, 200, `workflow ${acao} (${tag})`);
    }
    assert.strictEqual((await request(app).put(`/api/almoxarifado/recebimentos/${recId}/fiscal`).send({
      nota_fiscal: `NF-E42INT-${tag}-${recId}`, fornecedor_id: forn.lastID,
      fornecedor_nome: 'Acos Vale E42 T5', data_emissao_nf: diasDeHoje(-2),
      data_entrada_nf: diasDeHoje(-1), valor_total_nota: quantidade * 5, itens,
    })).status, 200, `fiscal (${tag})`);
    const proc = await request(app).post(`/api/almoxarifado/recebimentos/${recId}/workflow`)
      .send({ acao: 'processar' });
    assert.strictEqual(proc.status, 200, `processar (${tag}): ${JSON.stringify(proc.body)}`);
    return recId;
  }

  let PEDIDO; let LINHA; let COTACAO;

  // ── (1) A CADEIA INTEIRA, PELA ROTA ────────────────────────────────────────────────────────
  await test('(1) cotacao -> gerar-pedido -> recebimento PARCIAL (nao fecha) -> o resto (fecha) -> status recebido, atraso 0 e UMA linha de trilha', async () => {
    // Passo 1 — a cotacao da Etapa 41, com a previsao de ONTEM no pedido que ela vai gerar.
    COTACAO = await cotacaoService.criarCotacao(db, {
      numero: 'COT-E42-INT-001', fornecedor_id: forn.lastID,
      itens: [{ material_id: material, quantidade: 10, valor_unitario: 5 }],
    });
    // Passo 2 — o pedido NASCE da cotacao (a porta da Etapa 41), nao de um INSERT a mao.
    PEDIDO = await cotacaoService.gerarPedidoDaCotacao(db, COTACAO.id, ADMIN);
    assert.ok(/^PC-[A-Z0-9]+$/.test(PEDIDO.numero), `numero fora do molde gerado: ${PEDIDO.numero}`);
    // A previsao vencida entra pela porta de edicao do pedido (o pedido gerado nasce sem ela), que e
    // o gesto real do comprador depois de negociar o prazo.
    assert.strictEqual((await request(app).patch(`/api/compras/pedidos/${PEDIDO.id}/status`)
      .send({ status: 'aprovado' })).status, 200, 'fixture: PATCH de status');
    await dbRun(db, 'UPDATE pedidos_compra SET previsao_entrega = ? WHERE id = ?',
      [diasDeHoje(-3), PEDIDO.id]);

    LINHA = (await dbGet(db,
      'SELECT id FROM itens_pedido_compra WHERE pedido_id = ? ORDER BY id LIMIT 1', [PEDIDO.id])).id;

    // Passo 3 — o pedido esta ATRASADO e ABERTO, o estado de partida.
    const partida = await naListaCompras('', PEDIDO.id);
    assert.strictEqual(partida.atrasado, 1, `fixture: o pedido tinha de estar atrasado: ${JSON.stringify(partida)}`);
    assert.strictEqual(partida.status, 'aprovado', JSON.stringify(partida));

    // Passo 4 — PRIMEIRA remessa: 4 de 10. NAO fecha.
    await receberPelaRota(PEDIDO.id, LINHA, 4, 'P1');
    assert.strictEqual(await statusCore(PEDIDO.id), 'aprovado',
      'o recebimento PARCIAL fechou o pedido — o gancho esta decidindo por linha ou ignorando o total');
    const meio = await naListaCompras('', PEDIDO.id);
    assert.strictEqual(meio.atrasado, 1, 'o pedido parcial e atrasado tinha de continuar atrasado');
    assert.strictEqual((await trilhaDoPedido(PEDIDO.id)).length, 0,
      'auditou um fechamento que nao aconteceu');
    // A metade POSITIVA do passo: a remessa parcial ACONTECEU (senao "nao fechou" seria vacuidade).
    const linhaMeio = await dbGet(db,
      'SELECT quantidade, quantidade_recebida FROM itens_pedido_compra WHERE id = ?', [LINHA]);
    assert.strictEqual(linhaMeio.quantidade_recebida, 4, JSON.stringify(linhaMeio));

    // Passo 5 — SEGUNDA remessa: os 6 que faltavam. FECHA.
    await receberPelaRota(PEDIDO.id, LINHA, 6, 'P2');
    assert.strictEqual(await statusCore(PEDIDO.id), 'recebido',
      'a segunda remessa completou o pedido e o status nao acompanhou (RN-E01)');

    // Passo 6 — os TRES elos da RN-E10, pela ROTA: status gravado -> regua -> filtro.
    const fim = await naListaCompras('', PEDIDO.id);
    assert.strictEqual(fim.status, 'recebido', JSON.stringify(fim));
    assert.strictEqual(fim.atrasado, 0, `o pedido fechado continua acusando atraso: ${JSON.stringify(fim)}`);
    assert.strictEqual(fim.dias_atraso, null, 'sem atraso o campo e null, nunca 0');
    assert.ok(!(await request(app).get('/api/compras/pedidos?atrasados=1')).body.some((p) => p.id === PEDIDO.id),
      '?atrasados=1 continua trazendo o pedido que o almoxarifado ja fechou');
    assert.strictEqual(fim.situacao_recebimento, undefined,
      'a rota de Compras nao devolve a situacao derivada do almoxarifado (ela vive no aux)');

    // Passo 7 — UMA linha de trilha para UM fato, com o autor de quem processou a nota (RN-E07).
    const trilha = await trilhaDoPedido(PEDIDO.id);
    assert.strictEqual(trilha.length, 1, `esperava 1 linha de trilha, veio ${trilha.length}`);
    assert.strictEqual(trilha[0].acao, 'STATUS_AUTOMATICO_RECEBIDO', JSON.stringify(trilha[0]));
    assert.strictEqual(trilha[0].usuario_nome, ADMIN.nome, JSON.stringify(trilha[0]));

    // Passo 8 — o aux do ALMOXARIFADO concorda, e o pedido sai de `?pendentes=1`.
    const aux = (await request(app)
      .get(`/api/almoxarifado/recebimentos-aux/pedidos-compra?search=${encodeURIComponent(PEDIDO.numero)}`))
      .body.find((p) => p.id === PEDIDO.id);
    assert.strictEqual(aux.situacao_recebimento, 'RECEBIDO', JSON.stringify(aux));
    assert.strictEqual(aux.saldo_pendente, 0, JSON.stringify(aux));
    assert.strictEqual(aux.status, 'recebido', 'o aux ecoa o status CORE, e ele agora esta fechado');
  });

  // ── (2) O ALERTA DE PARCIAL, PELO JOB — e o pedido fechado SAI dele ────────────────────────
  await test('(2) RN-E09 o pedido PARCIAL entra na central e na fila pelo JOB; depois de fechado, sai da central', async () => {
    // Um SEGUNDO pedido, gerado de uma SEGUNDA cotacao, para medir o alerta com o do cenario (1) ja
    // fechado — assim "o fechado saiu" e afirmado contra uma populacao que NAO esta vazia.
    const cot2 = await cotacaoService.criarCotacao(db, {
      numero: 'COT-E42-INT-002', fornecedor_id: forn.lastID,
      itens: [{ material_id: material, quantidade: 8, valor_unitario: 5 }],
    });
    const pedido2 = await cotacaoService.gerarPedidoDaCotacao(db, cot2.id, ADMIN);
    const linha2 = (await dbGet(db,
      'SELECT id FROM itens_pedido_compra WHERE pedido_id = ? ORDER BY id LIMIT 1', [pedido2.id])).id;

    await receberPelaRota(pedido2.id, linha2, 3, 'A1');

    // A CENTRAL: o parcial esta la; o do cenario (1), fechado, NAO esta.
    const cartao = await cartaoParcial();
    assert.ok(cartao, 'a central nao tem o cartao PEDIDO_COMPRA_PARCIAL — a entrada do registro (T3) nao existe');
    assert.strictEqual(cartao.erro, undefined,
      `o listar da entrada lancou (require de topo capturando {} mid-load?): ${JSON.stringify(cartao)}`);
    const ids = cartao.linhas.map((l) => l.id);
    assert.ok(ids.includes(pedido2.id), `o pedido parcial ${pedido2.numero} nao esta no alerta`);
    assert.ok(!ids.includes(PEDIDO.id),
      'o pedido JA FECHADO continua no alerta de parcial — a populacao nao esta filtrando por situacao');

    // O JOB: `varrerAlertasRegistrados` sem `req` e sem `user` — e assim que ele roda em producao
    // (`setInterval` de 24h em `routes/almoxarifado.js`). O resultado e filtrado por CHAVE, nunca
    // por total global: o harness semeia materiais/ferramentas que caem automaticamente em outras
    // entradas do registro, e um contador global mediria outro alerta (mesma nota do arquivo irmao).
    const antes = (await filaParcial()).length;
    const varredura = await queueService.varrerAlertasRegistrados(db);
    const r = varredura.find((x) => x.chave === 'PEDIDO_COMPRA_PARCIAL');
    assert.ok(r, `a varredura nao devolveu entrada para PEDIDO_COMPRA_PARCIAL: ${JSON.stringify(varredura.map((x) => x.chave))}`);
    assert.ok(r.enfileiradas >= 1, `o job nao enfileirou nada: ${JSON.stringify(r)}`);
    const fila = await filaParcial();
    assert.ok(fila.length > antes, 'a fila nao cresceu');
    const doPedido2 = fila.find((l) => l.assunto.includes(pedido2.numero));
    assert.ok(doPedido2, `nenhuma linha da fila menciona ${pedido2.numero}: ${JSON.stringify(fila.map((l) => l.assunto))}`);
    assert.ok(/^\[Compras\] /.test(doPedido2.assunto),
      `o assunto tem de levar o prefixo [Compras]: ${doPedido2.assunto}`);
    assert.ok(/^Saldo pendente: 5$/m.test(doPedido2.corpo_texto),
      `o corpo tinha de dizer o saldo que falta (5): ${JSON.stringify(doPedido2.corpo_texto)}`);

    // E o FECHAMENTO tira o pedido do alerta: recebe o resto e a central esvazia aquela linha.
    await receberPelaRota(pedido2.id, linha2, 5, 'A2');
    assert.strictEqual(await statusCore(pedido2.id), 'recebido', 'o pedido 2 nao fechou');
    const depois = await cartaoParcial();
    assert.ok(!depois.linhas.map((l) => l.id).includes(pedido2.id),
      'o pedido que acabou de fechar continua no alerta de parcial');
  });

  await close();
  console.log(`\nrecebimentoFechaPedidoIntegracao: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
