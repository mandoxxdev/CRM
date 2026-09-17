/**
 * Etapa 39, Task 5 — a INTEGRAÇÃO que cruza pela ROTA, pelo SERVIÇO e pelo JOB (D10, RN-D12,
 * RN-D14).
 *
 * Verde por unidade não prova que as partes COMPÕEM, e esta etapa é toda FIAÇÃO: o Job B varre o
 * `ALERT_REGISTRY`, que importa por require **lazy** a régua (`derivarAtraso`) do módulo CORE
 * Compras, que é a MESMA que a rota `GET /api/compras/pedidos` aplica sobre a tabela que
 * `criarPedido` escreve. Cada peça tem arquivo de unidade próprio (T1
 * `comprasPedidoAtraso.api.test.js`, T4 `alertaPedidoAtrasado.api.test.js`) e NENHUM deles percorre
 * a vida inteira de um pedido atrasado — nascer, ser listado, ser avisado, ser RECEBIDO pelas
 * portas da Etapa 37 e continuar atrasado, e então esbarrar na régua da Etapa 38.
 *
 * ⚠️ O ATALHO QUE ESTE ARQUIVO SE PROÍBE: `INSERT INTO pedidos_compra` a mão. Os arquivos de
 * unidade inserem direto de propósito (fixture barato), mas aqui o pedido nasce por
 * `pedidoCompraService.criarPedido` — o SERVIÇO real —, porque é ele que gera o `numero` que o
 * assunto do e-mail do BLOCO C afirma, e foi o INSERT a mão que escondeu defeito na Etapa 37.
 *
 * ⚠️ NENHUMA DATA LITERAL. Todas derivam de `hojeLocalISO()`, a MESMA função que a rota e a entrada
 * do registro usam: um fixture `'2026-09-15'` escrito a mão está atrasado hoje e não está amanhã, e
 * o arquivo viraria falso-verde sem ninguém notar (R3 do design).
 *
 * ── O QUE O BLOCO E PROVA, E POR QUE ELE TEM DUAS METADES ────────────────────────────────────
 * O plano original mandava, no passo 9, fechar o ciclo com `PUT … status: 'recebido'` **no pedido
 * do BLOCO D**. Medido na revisão (Fase 2, C1): `atualizarPedido` recusa com 400 quando há linha
 * recebida OU documento vinculado (`pedidoCompraService.js:425-431`), e o pedido do BLOCO D tem as
 * duas coisas. Trocar por "um segundo pedido, para o PUT passar" contornaria o beco em vez de
 * medi-lo. Então:
 * - **9a** afirma o beco E A SUA SAÍDA: o `PUT` continua 400 com a literal (a guarda da Etapa 38
 *   NÃO foi afrouxada — afrouxá-la zeraria `quantidade_recebida` no DELETE+INSERT das linhas), o
 *   pedido continua atrasado depois do 400, e é o **`PATCH …/status`** da onda de correção (F4)
 *   que o tira de `?atrasados=1` — sem tocar em nenhuma linha de item.
 * - **9b** é a metade positiva pelo caminho normal: um pedido atrasado e SEM recebimento nenhum
 *   fecha o ciclo por PUT.
 * - **9c** repete a saída pelo SERVIÇO (`alterarStatusPedido`), sem HTTP: a Reposição e a
 *   importação chamam o serviço direto e a porta nova tem de ser alcançável do mesmo jeito.
 *
 * ⚠️ **ESTA PROSA MUDOU NA ONDA DE CORREÇÃO, e o que ela dizia estava certo para o código de
 * então:** até `fc84e09` o 9a afirmava que o pedido recebido com atraso ficava atrasado **para
 * sempre**, porque não havia gesto de tela nenhum que escrevesse `status` num pedido com
 * recebimento. O achado I1 da revisão final julgou que isso não é canto raro — é o caminho normal
 * de TODO pedido que o almoxarifado recebe depois da data prometida —, e a F4 abriu a porta. Agora
 * é **"atrasado até o PATCH"**: o passo 8 continua mostrando que RECEBER não muda o atraso (a
 * limitação D6 segue de pé, e é fatia da feature 08 fazer o `processar` gravar `status`), e o 9a
 * mostra que o usuário **agora consegue** mudá-lo à mão. Se um dia a 08 fizer o `processar` gravar
 * `status`, é o **passo 8** que cai — e o aviso é de que a limitação acabou, não de que quebrou.
 *
 * ⚠️ O 9a e o 9c DEVOLVEM o pedido do BLOCO D para `pendente` no fim, e isso é medição, não
 * higiene: o BLOCO F conta `duplicadas: 1` justamente porque aquele pedido continua na régua. O
 * ida-e-volta ainda prova, de graça, que a porta escreve nos DOIS sentidos.
 *
 * ⚠️ O TERCEIRO PEDIDO DO BLOCO E (previsão = HOJE) não é enfeite: sem ele, trocar `<` por `<=` em
 * `derivarAtraso` não derruba NENHUM passo desta integração (ontem continua sendo ontem) e a
 * sabotagem 1 viraria "nada cai" por falta de cenário, não por robustez. Medido.
 *
 * ⚠️ TODA asserção sobre a fila filtra por `evento`, NUNCA por total global (mesma nota de
 * `alertaRegistro.api.test.js:6-8`): o harness semeia materiais/ferramentas que caem
 * automaticamente em outras das 12 entradas do registro, e um contador global mediria outro alerta.
 *
 * Executar: cd server && node tests/api/comprasPedidoAtrasoIntegracao.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const queueService = require('../../services/almoxarifado/notificationQueueService');
const pedidoCompraService = require('../../services/compras/pedidoCompraService');
const { hojeLocalISO } = require('../../services/compras/pedidoCompraService');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

// Nenhum id de fixture `1`; a numeracao segue os demais arquivos de integracao da base.
const ADMIN = { id: 90, nome: 'Admin Int E39', role: 'admin', is_superadmin: 1, email: 'admin@test.com' };
const ALMOXARIFE = { id: 91, nome: 'Almoxarife Int E39', role: 'usuario', perfil_almoxarifado: 'ALMOXARIFE' };

/** A literal da regua da Etapa 38 (`pedidoCompraService.js:180`), COM acentos, congelada aqui. */
const jaTeveRecebimento = (numero) => `Pedido de compra ${numero} já teve recebimento — não pode mais ser editado`;

// hoje + N dias, em data LOCAL, pela MESMA regua do servidor. Nao usa toISOString (UTC).
function diasDeHoje(n) {
  const [a, m, d] = hojeLocalISO().split('-').map(Number);
  const dt = new Date(a, m - 1, d + n);
  return [dt.getFullYear(), String(dt.getMonth() + 1).padStart(2, '0'),
    String(dt.getDate()).padStart(2, '0')].join('-');
}

(async () => {
  const { app, db, setUser, close } = await createTestApp({ user: ADMIN });

  // `gerarContaPagar` insere aqui no `processar` do BLOCO D. Subconjunto minimo das colunas do
  // INSERT dele (molde: recebimentoContraPedidoIntegracao.api.test.js:97).
  await dbRun(db, `CREATE TABLE IF NOT EXISTS contas_pagar (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    descricao TEXT NOT NULL, fornecedor TEXT, valor REAL NOT NULL, data_vencimento DATE,
    data_pagamento DATE, status TEXT DEFAULT 'pendente', categoria TEXT, observacoes TEXT
  )`);

  // O alerta so sai com destinatario e com o toggle mestre ligado (RN-D09) — o BLOCO C mede o
  // caminho FELIZ; o desligado ja e cenario (6) da T4.
  const setConfig = (chave, valor) => dbRun(db,
    'UPDATE configuracoes_almoxarifado SET valor = ? WHERE chave = ?', [valor, chave]);
  await setConfig('alertas_estoque_emails', 'compras@gmp.ind.br');
  await setConfig('alertas_estoque_notificar_email', '1');

  // `validarDadosProcessamento` exige fornecedor para processar, e o `POST` por pedido herda o
  // fornecedor DO PEDIDO — entao o pedido nasce com um fornecedor de verdade.
  const forn = await dbRun(db, `INSERT INTO fornecedores (razao_social, cnpj)
    VALUES ('Acos Vale E39 T5','79.779.779/0001-79')`);

  let seq = 0;
  async function novoMaterial() {
    seq += 1;
    const codigo = `E39-T5-${String(seq).padStart(3, '0')}`;
    const m = await dbRun(db, `INSERT INTO materiais_almoxarifado
      (codigo, nome, unidade, quantidade_atual, ativo) VALUES (?,?,'UN',0,1)`,
    [codigo, `Chapa integracao atraso ${seq}`]);
    return { id: m.lastID, codigo };
  }

  /**
   * O pedido nasce pelo SERVICO REAL. Devolve o objeto relido (com `itens`, cada um com `id`), e o
   * `numero` e o GERADO por `inserirComNumeroUnico` — `PC-<carimbo base36><8 aleatorios>`, longo o
   * bastante para que o `?search=` (que e `numero LIKE '%x%'`) case exatamente um pedido.
   */
  async function novoPedidoPeloServico({ previsao, status = 'pendente', quantidade = 10 }) {
    const mat = await novoMaterial();
    const pedido = await pedidoCompraService.criarPedido(db, {
      fornecedor_id: forn.lastID,
      previsao_entrega: previsao,
      status,
      itens: [{ material_id: mat.id, quantidade, valor_unitario: 4 }],
    }, ADMIN);
    return { pedido, mat };
  }

  // ── Leituras, todas pelas ROTAS reais ────────────────────────────────────────────────────────
  const listar = (qs) => request(app).get(`/api/compras/pedidos${qs || ''}`);
  const naLista = async (qs, id) => (await listar(qs)).body.find((p) => p.id === id);
  const listarAux = (qs) => request(app)
    .get(`/api/almoxarifado/recebimentos-aux/pedidos-compra${qs || ''}`);
  const criarRecebimento = (body) => request(app).post('/api/almoxarifado/recebimentos').send(body);
  const conferir = (id, body) => request(app)
    .put(`/api/almoxarifado/recebimentos/${id}/conferir`).send(body);
  const fiscal = (id, body) => request(app)
    .put(`/api/almoxarifado/recebimentos/${id}/fiscal`).send(body);
  const workflow = (id, acao) => request(app)
    .post(`/api/almoxarifado/recebimentos/${id}/workflow`).send({ acao });

  /** O payload LITERAL da tela de recebimento (`RecebimentosAlmoxarifado.js:595-601`). */
  const itemDaTela = (materialId, pedidoItemId, quantidade) => ({
    material_id: materialId, pedido_item_id: pedidoItemId,
    quantidade, quantidade_recebida: quantidade,
  });

  const filaPorEvento = (evento) => dbAll(db,
    'SELECT * FROM fila_notificacoes_almoxarifado WHERE evento = ? ORDER BY id ASC', [evento]);
  const statusCoreDoPedido = async (id) => (await dbGet(db,
    'SELECT status FROM pedidos_compra WHERE id = ?', [id])).status;
  function resultadoDe(resultados, chave) {
    const r = resultados.find((x) => x.chave === chave);
    assert.ok(r, `varredura nao devolveu entrada para ${chave}: ${JSON.stringify(resultados)}`);
    return r;
  }
  /** O corpo do `PUT`, no formato que a tela de edicao manda (o MESMO schema do `POST`). */
  const corpoDoPut = (pedido, extras) => ({
    fornecedor_id: pedido.fornecedor_id,
    data_pedido: pedido.data_pedido || null,
    previsao_entrega: pedido.previsao_entrega,
    itens: pedido.itens.map((i) => ({
      material_id: i.material_id, quantidade: i.quantidade, valor_unitario: i.valor_unitario,
    })),
    ...extras,
  });

  const PREVISAO_HIST = diasDeHoje(-1);
  let HIST; let MAT_HIST; let FUTURO; let RECEBIMENTO_ID;
  let filaDepoisDoBlocoC;

  // ─────────────────────────────────────────────────────────────────────────────────────────────
  // BLOCO A — o pedido nasce ATRASADO, pelo SERVICO real
  // ─────────────────────────────────────────────────────────────────────────────────────────────
  await test('(A) o pedido nasce pelo SERVICO real, com numero GERADO e a previsao de ontem gravada', async () => {
    const criado = await novoPedidoPeloServico({ previsao: PREVISAO_HIST, status: 'pendente' });
    HIST = criado.pedido; MAT_HIST = criado.mat;

    assert.ok(HIST.id, `criarPedido tinha de resolver com o pedido: ${JSON.stringify(HIST)}`);
    // O `numero` e o que o assunto do e-mail do BLOCO C afirma — um INSERT a mao o deixaria a
    // cargo do fixture e o BLOCO C mediria a propria string que ele escreveu.
    assert.ok(/^PC-[A-Z0-9]+$/.test(HIST.numero), `numero fora do molde gerado: ${HIST.numero}`);
    assert.strictEqual(HIST.previsao_entrega, PREVISAO_HIST, JSON.stringify(HIST));
    assert.strictEqual(HIST.status, 'pendente', JSON.stringify(HIST));
    assert.strictEqual(HIST.itens.length, 1, `o pedido nasceu sem linha: ${JSON.stringify(HIST.itens)}`);
    // METADE QUE MEDE O DANO: o atraso e DERIVADO na leitura — o servico nao grava nada disso.
    const linhaCrua = await dbGet(db, 'SELECT * FROM pedidos_compra WHERE id = ?', [HIST.id]);
    assert.ok(!('atrasado' in linhaCrua), 'criarPedido passou a GRAVAR `atrasado` — a derivacao virou coluna');
  });

  // ─────────────────────────────────────────────────────────────────────────────────────────────
  // BLOCO B — pela ROTA
  // ─────────────────────────────────────────────────────────────────────────────────────────────
  await test('(B) pela ROTA: a linha traz atrasado 1 / dias_atraso 1, e ?atrasados=1 deixa o de AMANHA de fora', async () => {
    const linha = await naLista('', HIST.id);
    assert.ok(linha, `o pedido ${HIST.numero} sumiu da listagem`);
    assert.strictEqual(linha.atrasado, 1, `esperava atrasado 1, veio ${JSON.stringify(linha.atrasado)}`);
    assert.strictEqual(linha.dias_atraso, 1, `esperava dias_atraso 1, veio ${JSON.stringify(linha.dias_atraso)}`);

    FUTURO = (await novoPedidoPeloServico({ previsao: diasDeHoje(1), status: 'pendente' })).pedido;
    // Metade positiva: o de amanha EXISTE na listagem cheia — sem isto, "nao esta em ?atrasados=1"
    // seria satisfeito por um pedido que nao foi criado.
    const linhaFuturo = await naLista('', FUTURO.id);
    assert.ok(linhaFuturo, `o pedido ${FUTURO.numero} sumiu da listagem cheia`);
    assert.strictEqual(linhaFuturo.atrasado, 0, `previsao de amanha: veio ${JSON.stringify(linhaFuturo.atrasado)}`);

    const filtrados = (await listar('?atrasados=1')).body;
    assert.ok(filtrados.some((p) => p.id === HIST.id),
      `?atrasados=1 perdeu o pedido atrasado ${HIST.numero}`);
    assert.ok(!filtrados.some((p) => p.id === FUTURO.id),
      `?atrasados=1 trouxe o pedido de AMANHA ${FUTURO.numero}`);
    assert.ok(filtrados.every((p) => p.atrasado === 1),
      `?atrasados=1 devolveu linha com atrasado != 1: ${JSON.stringify(filtrados.map((p) => p.atrasado))}`);
  });

  // ─────────────────────────────────────────────────────────────────────────────────────────────
  // BLOCO C — pelo JOB
  // ─────────────────────────────────────────────────────────────────────────────────────────────
  await test('(C) pelo JOB: a varredura enfileira UM alerta, com o numero GERADO no assunto e o id no payload', async () => {
    await queueService.varrerAlertasRegistrados(db);
    const fila = await filaPorEvento('PEDIDO_COMPRA_ATRASADO');
    assert.strictEqual(fila.length, 1, `esperava 1 alerta, veio ${fila.length}: `
      + JSON.stringify(fila.map((l) => l.assunto)));
    assert.ok(fila[0].assunto.includes(HIST.numero),
      `o assunto tinha de trazer o numero GERADO ${HIST.numero}: ${JSON.stringify(fila[0].assunto)}`);
    const payload = JSON.parse(fila[0].payload);
    assert.strictEqual(payload.pedido_compra_id, HIST.id, `o alerta saiu para outro pedido: ${fila[0].payload}`);
    assert.strictEqual(payload.dias_atraso, 1, fila[0].payload);
    filaDepoisDoBlocoC = fila.map((l) => ({ id: l.id, hash_dedupe: l.hash_dedupe }));
  });

  // ─────────────────────────────────────────────────────────────────────────────────────────────
  // BLOCO D — RN-D12: receber pelas portas REAIS da Etapa 37 NAO muda o atraso
  // ─────────────────────────────────────────────────────────────────────────────────────────────
  await test('(D) RN-D12: o pedido e RECEBIDO pelas portas da Etapa 37 e CONTINUA atrasado na aba Compras', async () => {
    const linhaPedido = HIST.itens[0].id;
    const criado = await criarRecebimento({
      tipo_recebimento: 'PEDIDO_COMPRA', pedido_compra_id: HIST.id,
      itens: [itemDaTela(MAT_HIST.id, linhaPedido, 10)],
    });
    assert.strictEqual(criado.status, 201, JSON.stringify(criado.body));
    RECEBIMENTO_ID = criado.body.id;

    // As portas REAIS, nenhum UPDATE de status a mao. O eco da quantidade JA GRAVADA e o que as
    // duas telas mandam (painel de conferencia e modal de NF).
    const itens = [itemDaTela(MAT_HIST.id, linhaPedido, 10)];
    setUser(ALMOXARIFE);
    const conf = await conferir(RECEBIMENTO_ID, { itens });
    assert.strictEqual(conf.status, 200, `PUT /conferir: ${JSON.stringify(conf.body)}`);
    setUser(ADMIN);
    for (const acao of ['encaminhar_compras', 'finalizar_compras', 'iniciar_faturamento']) {
      const r = await workflow(RECEBIMENTO_ID, acao);
      assert.strictEqual(r.status, 200, `workflow ${acao}: ${JSON.stringify(r.body)}`);
    }
    const nf = await fiscal(RECEBIMENTO_ID, {
      nota_fiscal: `NF-E39T5-${RECEBIMENTO_ID}`, fornecedor_id: forn.lastID,
      fornecedor_nome: 'Acos Vale E39 T5', data_emissao_nf: diasDeHoje(-2),
      data_entrada_nf: diasDeHoje(-1), valor_total_nota: 40, itens,
    });
    assert.strictEqual(nf.status, 200, `PUT /fiscal: ${JSON.stringify(nf.body)}`);
    const processado = await workflow(RECEBIMENTO_ID, 'processar');
    assert.strictEqual(processado.status, 200, `workflow processar: ${JSON.stringify(processado.body)}`);

    // Passo 7 — o ALMOXARIFADO ja considera o pedido inteiro recebido.
    const aux = (await listarAux(`?search=${encodeURIComponent(HIST.numero)}`)).body;
    assert.strictEqual(aux.length, 1, `?search=${HIST.numero} devolveu ${aux.length} linha(s)`);
    assert.strictEqual(aux[0].id, HIST.id, JSON.stringify(aux[0]));
    assert.strictEqual(aux[0].situacao_recebimento, 'RECEBIDO',
      `o almoxarifado tinha de ver RECEBIDO: ${JSON.stringify(aux[0])}`);

    // ⚠️ PASSO 8 — O QUE TRANSFORMA A LIMITACAO D6 EM REGUA. O `status` do CORE continua
    // `pendente` (o `processar` da 37 NAO o escreve), entao a regua de atraso continua valendo.
    assert.strictEqual(await statusCoreDoPedido(HIST.id), 'pendente',
      'o `processar` da Etapa 37 passou a gravar `status` no pedido CORE — a limitacao D6 acabou, '
      + 'e a RN-D12 precisa ser reescrita (nao e este teste que esta errado)');
    const linha = await naLista('', HIST.id);
    assert.strictEqual(linha.atrasado, 1,
      'receber o pedido INTEIRO pelo almoxarifado apagou o atraso na aba Compras — se isso foi '
      + 'intencional (feature 08), a RN-D12 mudou');
    assert.strictEqual(linha.dias_atraso, 1, `esperava dias_atraso 1, veio ${JSON.stringify(linha.dias_atraso)}`);
  });

  // ─────────────────────────────────────────────────────────────────────────────────────────────
  // BLOCO E — o status fecha o ciclo: 9a o BECO, 9b a saida, e a FRONTEIRA
  // ─────────────────────────────────────────────────────────────────────────────────────────────
  await test('(E.9a) RN-D12 o PUT do pedido JA RECEBIDO continua 400 — e agora o PATCH .../status tira o pedido do atraso', async () => {
    const put = await request(app).put(`/api/compras/pedidos/${HIST.id}`)
      .send(corpoDoPut(HIST, { status: 'recebido' }));
    assert.strictEqual(put.status, 400, `esperava 400 da RN-C07: ${put.status} ${JSON.stringify(put.body)}`);
    assert.strictEqual(put.body.error, jaTeveRecebimento(HIST.numero),
      `literal da RN-C07 divergiu: ${JSON.stringify(put.body.error)}`);

    // O par do passo 8, ainda de pe: receber nao muda o atraso, e o PUT tambem nao consegue
    // muda-lo — e nao pode mesmo, porque ele faz DELETE+INSERT das linhas e zeraria os 10
    // recebidos do BLOCO D (o `INSERT` omite `quantidade_recebida`, que e `REAL DEFAULT 0`).
    const linha = await naLista('', HIST.id);
    assert.strictEqual(linha.atrasado, 1,
      `depois do 400 o pedido tinha de continuar atrasado: ${JSON.stringify(linha)}`);
    assert.ok((await listar('?atrasados=1')).body.some((p) => p.id === HIST.id),
      'depois do 400 o pedido tinha de continuar dentro de ?atrasados=1');
    assert.strictEqual(await statusCoreDoPedido(HIST.id), 'pendente',
      'o PUT recusado NAO pode ter escrito o status');

    // ── A SAIDA, aberta pela onda de correcao (F4) ────────────────────────────────────────────
    const recebidoAntes = await dbGet(db,
      'SELECT id, quantidade_recebida FROM itens_pedido_compra WHERE pedido_id = ? ORDER BY id LIMIT 1', [HIST.id]);
    assert.ok(recebidoAntes.quantidade_recebida > 0,
      `fixture: a linha do BLOCO D tinha de ter recebido > 0, veio ${JSON.stringify(recebidoAntes)}`);

    const patch = await request(app).patch(`/api/compras/pedidos/${HIST.id}/status`).send({ status: 'recebido' });
    assert.strictEqual(patch.status, 200, `o PATCH devia passar no pedido recebido: ${patch.status} ${JSON.stringify(patch.body)}`);
    assert.strictEqual(await statusCoreDoPedido(HIST.id), 'recebido', 'o PATCH nao escreveu o status');
    const semAtraso = await naLista('', HIST.id);
    assert.strictEqual(semAtraso.atrasado, 0, `o PATCH nao tirou o pedido do atraso: ${JSON.stringify(semAtraso)}`);
    assert.ok(!(await listar('?atrasados=1')).body.some((p) => p.id === HIST.id),
      '?atrasados=1 continua trazendo o pedido cujo status ja foi corrigido');

    // ⚠️ E A ASSERCAO QUE SEPARA ESTA PORTA DE UM `PUT` DISFARCADO: o recebimento fica INTACTO.
    // Se ela cair, o `?pendentes=1` da Etapa 37 volta a mostrar o pedido ABERTO com o saldo
    // inteiro e o operador recebe o mesmo material duas vezes.
    const recebidoDepois = await dbGet(db,
      'SELECT id, quantidade_recebida FROM itens_pedido_compra WHERE pedido_id = ? ORDER BY id LIMIT 1', [HIST.id]);
    assert.deepStrictEqual(recebidoDepois, recebidoAntes,
      'o PATCH tocou em itens_pedido_compra — id ou quantidade_recebida mudaram');

    // Volta para `pendente`: o BLOCO F conta `duplicadas: 1` porque este pedido segue na regua, e
    // o ida-e-volta prova de graca que a porta escreve nos DOIS sentidos.
    const volta = await request(app).patch(`/api/compras/pedidos/${HIST.id}/status`).send({ status: 'pendente' });
    assert.strictEqual(volta.status, 200, JSON.stringify(volta.body));
    assert.strictEqual((await naLista('', HIST.id)).atrasado, 1,
      'voltar para `pendente` tinha de devolver o pedido ao atraso');
  });

  let LIMPO;
  await test('(E.9b) a METADE POSITIVA: pedido atrasado e SEM recebimento fecha o ciclo por PUT status=recebido', async () => {
    LIMPO = (await novoPedidoPeloServico({ previsao: diasDeHoje(-2), status: 'pendente' })).pedido;
    // Metade positiva do proprio cenario: antes do PUT ele ESTA atrasado — sem isto, "atrasado 0
    // depois" seria satisfeito por um pedido que nunca atrasou.
    const antes = await naLista('', LIMPO.id);
    assert.strictEqual(antes.atrasado, 1, `o pedido limpo tinha de nascer atrasado: ${JSON.stringify(antes)}`);
    assert.strictEqual(antes.dias_atraso, 2, `esperava dias_atraso 2, veio ${JSON.stringify(antes.dias_atraso)}`);

    const put = await request(app).put(`/api/compras/pedidos/${LIMPO.id}`)
      .send(corpoDoPut(LIMPO, { status: 'recebido' }));
    assert.strictEqual(put.status, 200, `esperava 200: ${put.status} ${JSON.stringify(put.body)}`);
    assert.strictEqual(put.body.status, 'recebido', JSON.stringify(put.body));

    // Passo 10 — e ESTA a assercao que a sabotagem 3 derruba.
    const depois = await naLista('', LIMPO.id);
    assert.strictEqual(depois.atrasado, 0,
      `status 'recebido' tinha de tirar o pedido do atraso, veio ${JSON.stringify(depois.atrasado)} `
      + '(STATUS_PEDIDO_FORA_DO_ATRASO perdeu `recebido`?)');
    assert.strictEqual(depois.dias_atraso, null,
      `esperava dias_atraso null, veio ${JSON.stringify(depois.dias_atraso)}`);
    assert.ok(!(await listar('?atrasados=1')).body.some((p) => p.id === LIMPO.id),
      '?atrasados=1 continua trazendo o pedido ja recebido');
  });

  await test('(E.9c) F4 a mesma saida PELO SERVICO, sem HTTP: alterarStatusPedido tira o pedido recebido do atraso', async () => {
    // A Reposicao e a importacao chamam `pedidoCompraService` DIRETO, sem passar por rota — a
    // porta nova tem de ser alcancavel do mesmo jeito que `criarPedido`/`atualizarPedido`, senao
    // metade dos chamadores do modulo fica sem a saida do beco.
    const antes = await dbAll(db,
      'SELECT id, quantidade_recebida FROM itens_pedido_compra WHERE pedido_id = ? ORDER BY id', [HIST.id]);
    assert.ok(antes.some((l) => l.quantidade_recebida > 0),
      `fixture: o pedido do BLOCO D tinha de ter linha recebida: ${JSON.stringify(antes)}`);
    assert.strictEqual((await naLista('', HIST.id)).atrasado, 1,
      'fixture: o pedido tinha de estar atrasado de novo depois do 9a');

    const r = await pedidoCompraService.alterarStatusPedido(db, HIST.id, 'cancelado');
    assert.deepStrictEqual(r, { id: HIST.id, numero: HIST.numero, status: 'cancelado' }, JSON.stringify(r));
    assert.strictEqual((await naLista('', HIST.id)).atrasado, 0,
      'o servico nao tirou o pedido do atraso');
    assert.deepStrictEqual(
      await dbAll(db, 'SELECT id, quantidade_recebida FROM itens_pedido_compra WHERE pedido_id = ? ORDER BY id', [HIST.id]),
      antes, 'o servico tocou em itens_pedido_compra');

    // Restaura, pelo mesmo motivo do 9a: o BLOCO F conta `duplicadas: 1` com este pedido na regua.
    await pedidoCompraService.alterarStatusPedido(db, HIST.id, 'pendente');
    assert.strictEqual((await naLista('', HIST.id)).atrasado, 1, JSON.stringify(await naLista('', HIST.id)));
  });

  let HOJE_PEDIDO;
  await test('(E.fronteira) RN-D05b previsao = HOJE nao esta atrasado, nem na rota nem no filtro', async () => {
    // Sem este pedido, `<` -> `<=` nao derruba nada nesta integracao (ontem continua sendo ontem) e
    // a sabotagem 1 viraria "nada cai" por falta de cenario. Medido.
    HOJE_PEDIDO = (await novoPedidoPeloServico({ previsao: hojeLocalISO(), status: 'pendente' })).pedido;
    const linha = await naLista('', HOJE_PEDIDO.id);
    assert.ok(linha, `o pedido ${HOJE_PEDIDO.numero} sumiu da listagem`);
    assert.strictEqual(linha.atrasado, 0,
      `vence HOJE virou atrasado: veio ${JSON.stringify(linha.atrasado)} (\`<=\` no lugar de \`<\`?)`);
    assert.strictEqual(linha.dias_atraso, null,
      `esperava dias_atraso null, veio ${JSON.stringify(linha.dias_atraso)}`);
    assert.ok(!(await listar('?atrasados=1')).body.some((p) => p.id === HOJE_PEDIDO.id),
      '?atrasados=1 trouxe o pedido que vence HOJE');
  });

  // ─────────────────────────────────────────────────────────────────────────────────────────────
  // BLOCO F — a varredura de novo: fila e HISTORICO, nao estado
  // ─────────────────────────────────────────────────────────────────────────────────────────────
  await test('(F) RN-D10/RN-D14 a segunda varredura nao enfileira nada novo e NAO apaga a linha antiga', async () => {
    const r = resultadoDe(await queueService.varrerAlertasRegistrados(db), 'PEDIDO_COMPRA_ATRASADO');
    // `duplicadas: 1` e o pedido do BLOCO D, que continua atrasado e ja foi avisado (RN-D10: UM
    // aviso por pedido, para sempre — nao por dia de atraso). Os outros tres estao fora da regua:
    // o de amanha, o que virou 'recebido' no 9b e o que vence hoje.
    assert.deepStrictEqual({ enfileiradas: r.enfileiradas, duplicadas: r.duplicadas },
      { enfileiradas: 0, duplicadas: 1 }, JSON.stringify(r));

    const fila = await filaPorEvento('PEDIDO_COMPRA_ATRASADO');
    assert.deepStrictEqual(fila.map((l) => ({ id: l.id, hash_dedupe: l.hash_dedupe })), filaDepoisDoBlocoC,
      'a fila e HISTORICO, nao estado: as linhas antigas tem de continuar identicas');
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
