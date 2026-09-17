/**
 * Etapa 38, Task 7 — a INTEGRAÇÃO que cruza os galhos: o pedido de compra nasce no CORE Compras e
 * o recebimento da Etapa 37 finalmente tem o que receber. Pela ROTA e pelo SERVIÇO.
 *
 * ── O ACEITE DA ETAPA, e por que ele e um arquivo e nao uma frase ─────────────────────────────
 * A Fase 0 mediu `COUNT(pedidos_compra) = 0` no dump de producao de 161 MB e **nenhum codigo de
 * aplicacao que inserisse um pedido**. A Etapa 37 inteira — sete arquivos de teste, duas colunas de
 * migration, tres portas com regua de saldo, um `<select>` novo — era **inalcancavel por um clique
 * em qualquer ambiente**, porque o roteiro de teste manual dela (`plano da 37:~1806`) comeca com
 * *"criar pedido no modulo Compras"*. Este arquivo executa esse roteiro inteiro, do primeiro POST
 * ao 409 da lixeira, e e ele que transforma "a 37 deixou de ser inerte" de promessa em numero.
 *
 * ── ⚠️ POR QUE NAO BASTAM OS ARQUIVOS DE UNIDADE DAS T2-T6 ───────────────────────────────────
 * Cada peca ja tem arquivo proprio, e todos verdes:
 * - `comprasPedidoCriar.api.test.js` (T2) mede o `POST` com fixtures do PROPRIO Compras;
 * - `comprasPedidoEditarExcluir.api.test.js` (T3) mede a regua com a `quantidade_recebida` escrita
 *   por `dbRun` DIRETO, ou com um recebimento aberto criado so para isso;
 * - `comprasPedidoImportar.api.test.js` (T4) mede a planilha;
 * - do lado da 37, `pedidosCompraSaldoAux` e `pedidoSaldoRecebido` medem a leitura e o acumulador
 *   contra pedidos inseridos **na mao**.
 * Nenhum deles percorre a HISTORIA de um pedido que **nasceu pela porta nova** — criar, aparecer no
 * `?pendentes=1`, receber parcial, processar, tomar 400/403/201 no excedente, e so entao descobrir
 * que nao pode mais ser editado nem excluido. A Etapa 25 desta base mediu **12 cenarios de unidade
 * verdes e 4 de integracao vermelhos**: verde por unidade nao prova que as partes COMPOEM.
 *
 * ── ⚠️ O QUE O BLOCO D2 MEDE, E QUE NENHUMA TASK SOZINHA VE ───────────────────────────────────
 * O `PUT` **apaga e reinsere** as linhas do pedido, e os ids novos nao sao os antigos. Um
 * recebimento CRIADO E NAO PROCESSADO guarda `pedido_item_id` (INTEGER **sem FK**, de proposito na
 * 37) apontando para a linha **antiga** — e pela RN-23 a `quantidade_recebida` da linha do pedido
 * ainda e **0**, entao ele PASSA pela perna 1 da regua. Se so a perna 1 existisse, o `PUT` seria
 * aceito, e ao processar o acumulador da 37 (`receiptService.js:1261`,
 * `UPDATE itens_pedido_compra … WHERE id = ?`) alteraria **ZERO linhas — e zero linhas NAO e erro
 * em SQLite**: sem excecao, sem `warn`. O material entraria no estoque e o pedido ficaria `ABERTO`
 * com o saldo CHEIO, para sempre. O D2 nao para no 400: ele **processa depois** e afirma que a
 * linha somou **6, e nao 0**. E esse ultimo numero que prova a composicao.
 *
 * ── ⚠️ POR QUE EXISTE O BLOCO E (pelo SERVICO) ───────────────────────────────────────────────
 * As duas reguas do pedido (RN-C07/RN-C08) moram no SERVICO, nao na rota — e `criarPedido` tem
 * OUTROS chamadores sem HTTP: a importacao de planilha (T4) e o "Gerar pedido" da Reposicao (T6).
 * Se alguem, amanha, mover a regua para o handler (por parecer mais simples), os blocos A-D2
 * continuam VERDES e o E fica VERMELHO. A regra vale nas DUAS entradas, e e isso que o E congela.
 *
 * ── ⚠️ MODO DE FALHA DESTE ARQUIVO: o teste vazio por acoplamento ────────────────────────────
 * O roteiro esta em SEIS blocos e nao num `test()` unico porque as sabotagens desta task tem de
 * cair em pontos DIFERENTES, e num bloco so a primeira assercao a estourar esconderia as outras.
 * Os blocos A-D compartilham o MESMO pedido de proposito: e a historia dele que se mede, e
 * quebra-la em quatro pedidos voltaria a ser teste de unidade. Todo cenario tem metade POSITIVA
 * (uma afirmacao sobre dado que existe), para que um banco vazio nao possa passar.
 *
 * ⚠️ GATE: o modulo core Compras tem **UMA** camada de autorizacao (`authenticateToken` +
 * `checkModulePermission('compras')`, medido nas 26 rotas), e o harness libera a camada 2 — entao
 * nao ha 403 de perfil a medir nas portas de Compras. Ja o `POST` do ALMOXARIFADO roda
 * `requirePermission` **real** no harness, e e por isso que o bloco C consegue medir 400/403/201
 * com tres usuarios diferentes na MESMA chamada.
 *
 * Executar: cd server && node tests/api/comprasPedidoIntegracao.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const receiptService = require('../../services/almoxarifado/receiptService');
const pedidoCompraService = require('../../services/compras/pedidoCompraService');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

// (iii) das regras herdadas: nenhum id de fixture escrito a mao — todos LIDOS do `INSERT` ou da
// resposta do `POST`. Usuarios numerados a partir do 90 (a T7 da Etapa 37 usou 80-84, a T2/T3 desta
// etapa usaram 64-68).
const ADMIN = { id: 90, nome: 'Admin Int E38', role: 'admin' };
const ALMOXARIFE = { id: 91, nome: 'Almoxarife Int E38', role: 'usuario', perfil_almoxarifado: 'ALMOXARIFE' };
const COMPRAS = { id: 92, nome: 'Compras Int E38', role: 'usuario', perfil_almoxarifado: 'COMPRAS' };
// Onda de correcao, F8: usuario SEM perfil de almoxarifado — `getPerfilFromUser` faz fallback para
// PRODUCAO, que NAO tem `gerenciar_reposicao`. E o usuario do bloco E2.
const SEM_PERFIL = { id: 93, nome: 'Producao Int E38', role: 'usuario' };

// ── As literais dos DOIS modulos, congeladas em constante: o `grep` de uma frase acha o dono e o
// teste na mesma varredura, e a igualdade literal e o que impede "a mensagem mudou e ninguem viu".
// Do CORE Compras (contratos 3 e 4 do plano da 38):
const jaRecebeuEdicao = (numero) => `Pedido de compra ${numero} já teve recebimento — não pode mais ser editado`;
const jaRecebeuExclusao = (numero) => `Pedido de compra ${numero} já teve recebimento — não pode ser excluído`;
const EXCLUIDO = 'Pedido de compra excluído com sucesso';
// Do ALMOXARIFADO (Etapa 37, fix-round da 36 — o sufixo NOMEIA quem autoriza):
const SUFIXO = ' — a autorização de excedente é de Compras ou do Administrador';
const acimaDoSaldo = (recebida, saldo, codigo) => `Quantidade recebida (${recebida}) maior que o `
  + `saldo do pedido (${saldo}) para o material ${codigo}${SUFIXO}`;
const semPermissao = (perfil) => 'Autorizar recebimento acima do pedido exige a permissão '
  + `"autorizar_excedente" (seu perfil: ${perfil}).`;

(async () => {
  const { app, db, setUser, close } = await createTestApp({ user: ADMIN });

  // `gerarContaPagar` insere aqui no `processar` (com guarda de tabela ausente, entao sem esta
  // tabela o passo silenciosamente nao aconteceria). Subconjunto minimo das colunas do INSERT dele.
  await dbRun(db, `CREATE TABLE IF NOT EXISTS contas_pagar (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    descricao TEXT NOT NULL, fornecedor TEXT, valor REAL NOT NULL, data_vencimento DATE,
    data_pagamento DATE, status TEXT DEFAULT 'pendente', categoria TEXT, observacoes TEXT
  )`);

  // `validarDadosProcessamento` exige fornecedor (CNPJ OU nome) para processar, e o recebimento por
  // pedido herda o fornecedor DO PEDIDO — entao o fornecedor do pedido e de verdade.
  const forn = await dbRun(db, `INSERT INTO fornecedores (razao_social, cnpj, status)
    VALUES ('Fornecedor Integracao E38 T7','88.188.188/0001-88','ativo')`);
  const fornecedorId = forn.lastID;

  let seq = 0;
  async function novoMaterial() {
    seq += 1;
    const codigo = `E38-T7-${seq}`;
    const m = await dbRun(db, `INSERT INTO materiais_almoxarifado
      (codigo, nome, unidade, quantidade_atual, ativo) VALUES (?,?,'UN',0,1)`,
    [codigo, `Chapa integracao E38 ${seq}`]);
    return { id: m.lastID, codigo, nome: `Chapa integracao E38 ${seq}` };
  }

  // ── Todo pedido nasce pela PORTA REAL da Task 2 (`POST /api/compras/pedidos`), nunca por
  // `INSERT` na mao: e o pedido que o comprador consegue criar de fato que tem de atravessar a 37.
  const payloadPedido = (itens, extra = {}) => ({ fornecedor_id: fornecedorId, itens, ...extra });
  async function novoPedidoPelaRota(itens, extra = {}) {
    const r = await request(app).post('/api/compras/pedidos').send(payloadPedido(itens, extra));
    assert.strictEqual(r.status, 201, `fixture: POST do pedido falhou ${r.status} ${JSON.stringify(r.body)}`);
    return r.body;
  }

  /**
   * O payload LITERAL da tela da Etapa 37 (`RecebimentosAlmoxarifado.js:595-601`): `pedido_item_id`
   * + `material_id` + `quantidade` + `quantidade_recebida`, e **sem `quantidade_esperada`** — a
   * esperada nasce do SALDO, no servidor. Montar aqui uma forma DIFERENTE da tela faria o arquivo
   * medir uma porta que nenhum usuario atravessa.
   */
  const itemDaTela = (materialId, pedidoItemId, quantidade) => ({
    material_id: materialId, pedido_item_id: pedidoItemId,
    quantidade, quantidade_recebida: quantidade,
  });
  const criarRecebimento = (body) => request(app).post('/api/almoxarifado/recebimentos').send(body);
  const listarPedidosAux = (qs) => request(app)
    .get(`/api/almoxarifado/recebimentos-aux/pedidos-compra${qs || ''}`);
  const itensDoPedidoAux = (id) => request(app)
    .get(`/api/almoxarifado/recebimentos-aux/pedidos-compra/${id}/itens`);

  // ⚠️ Todo numero e LIDO pelo id que o INSERT/POST devolveu e AFIRMADO — nunca "nao deu erro".
  const recebidaDaLinha = async (linhaId) => (await dbGet(db,
    'SELECT quantidade_recebida FROM itens_pedido_compra WHERE id = ?', [linhaId])).quantidade_recebida;
  const estoqueDoMaterial = async (matId) => (await dbGet(db,
    'SELECT quantidade_atual FROM materiais_almoxarifado WHERE id = ?', [matId])).quantidade_atual;
  const idsDasLinhas = async (pedidoId) => (await dbAll(db,
    'SELECT id FROM itens_pedido_compra WHERE pedido_id = ? ORDER BY id', [pedidoId])).map((l) => l.id);
  const contarItens = async (pedidoId) => (await dbGet(db,
    'SELECT COUNT(*) as n FROM itens_pedido_compra WHERE pedido_id = ?', [pedidoId])).n;
  const contarPedidoPorId = async (pedidoId) => (await dbGet(db,
    'SELECT COUNT(*) as n FROM pedidos_compra WHERE id = ?', [pedidoId])).n;
  // Onda de correcao, F8: o COUNT GLOBAL, para o bloco E2 poder afirmar que o 403 nao gravou nada
  // (aqui o escopo certo e o global — o pedido negado nao tem id para escopar).
  const contarPedidos = async () => (await dbGet(db, 'SELECT COUNT(*) as n FROM pedidos_compra')).n;
  const contarRecebimentos = async () => (await dbGet(db,
    'SELECT COUNT(*) AS n FROM recebimentos_material_almoxarifado')).n;
  const statusDoRecebimento = async (recId) => (await dbGet(db,
    'SELECT status FROM recebimentos_material_almoxarifado WHERE id = ?', [recId])).status;
  const itensDoRecebimento = (recId) => dbAll(db, `SELECT id, material_id, quantidade_esperada,
    quantidade_recebida, pedido_item_id FROM recebimentos_material_itens_almoxarifado
    WHERE recebimento_id = ? ORDER BY id`, [recId]);
  const auditoriaExcedente = (itemId) => dbAll(db, `SELECT * FROM auditoria_log_almoxarifado
    WHERE entidade = 'recebimento_item' AND acao = 'EXCEDENTE_AUTORIZADO' AND entidade_id = ?`,
  [itemId]);
  const statusCoreDoPedido = async (pedidoId) => (await dbGet(db,
    'SELECT status FROM pedidos_compra WHERE id = ?', [pedidoId])).status;

  /**
   * ⚠️ O `search` de TODA consulta a rota aux e o NUMERO do pedido, e nao e enfeite: a consulta
   * termina em `ORDER BY p.created_at DESC LIMIT 50` e este arquivo cria mais de dez pedidos. Sem
   * o recorte, um bloco passaria a afirmar sobre o conjunto dos outros.
   */
  const naRotaAux = async (numero, qs, pedidoId) => (await listarPedidosAux(
    `?search=${encodeURIComponent(numero)}${qs || ''}`)).body.find((p) => p.id === pedidoId);

  /**
   * As TRES portas entre criar e processar, pelo WORKFLOW REAL — nunca um `UPDATE` de status a mao.
   * Ir de "criar" a "processar" por atalho foi EXATAMENTE o que escondeu o Critical da Etapa 36 (o
   * documento excedente TRAVAVA no `/fiscal`). `itens` e o eco da quantidade JA GRAVADA, que e o
   * que as duas telas mandam.
   */
  async function processarPeloWorkflow(recId, itens, valorNota) {
    const conf = await request(app).put(`/api/almoxarifado/recebimentos/${recId}/conferir`).send({ itens });
    assert.strictEqual(conf.status, 200, `PUT /conferir: ${JSON.stringify(conf.body)}`);
    for (const acao of ['encaminhar_compras', 'finalizar_compras', 'iniciar_faturamento']) {
      const r = await request(app).post(`/api/almoxarifado/recebimentos/${recId}/workflow`).send({ acao });
      assert.strictEqual(r.status, 200, `workflow ${acao}: ${JSON.stringify(r.body)}`);
    }
    const nf = await request(app).put(`/api/almoxarifado/recebimentos/${recId}/fiscal`).send({
      nota_fiscal: `NF-E38T7-${recId}`, fornecedor_id: fornecedorId,
      fornecedor_nome: 'Fornecedor Integracao E38 T7', data_emissao_nf: '2026-09-10',
      data_entrada_nf: '2026-09-11', valor_total_nota: valorNota, itens,
    });
    assert.strictEqual(nf.status, 200, `PUT /fiscal: ${JSON.stringify(nf.body)}`);
    return request(app).post(`/api/almoxarifado/recebimentos/${recId}/workflow`).send({ acao: 'processar' });
  }

  // A historia inteira (blocos A a D) corre sobre UM pedido: e a fiacao entre os troncos que se
  // mede, e quatro pedidos separados voltariam a ser quatro testes de unidade.
  const MAT = await novoMaterial();
  let PEDIDO = null;      // preenchido no bloco A
  let LINHA = null;

  // ═══════════════════════════════════════════════════════════════════════════════════════════════
  // BLOCO A — o pedido NASCE pela porta do Compras e a Etapa 37 passa a enxerga-lo.
  // Territorio da fiacao `material_id` (sabotagem 1).
  // ═══════════════════════════════════════════════════════════════════════════════════════════════
  await test('(A) o pedido nasce no Compras e APARECE no ?pendentes=1 da Etapa 37 com o saldo certo', async () => {
    // passo 1 — POST /api/compras/pedidos: fornecedor + 1 item de 10 a 7 -> 201 com numero PC-…
    PEDIDO = await novoPedidoPelaRota([{ material_id: MAT.id, quantidade: 10, valor_unitario: 7 }]);
    assert.ok(PEDIDO.id, 'a resposta do POST tem de trazer o id do pedido');
    assert.match(PEDIDO.numero || '', /^PC-[0-9A-Z]+$/, `numero fora do formato: ${PEDIDO.numero}`);
    [LINHA] = await idsDasLinhas(PEDIDO.id);
    assert.ok(LINHA, 'o 201 nao prova nada: a LINHA do item tem de existir no banco');

    // passo 2 — a lista do proprio Compras acha o pedido pelo numero, com o `valor_total` DERIVADO
    // da soma das linhas (10 x 7), nunca o do payload.
    const lista = await request(app).get(`/api/compras/pedidos?search=${encodeURIComponent(PEDIDO.numero)}`);
    assert.strictEqual(lista.status, 200, `GET da lista: ${JSON.stringify(lista.body)}`);
    assert.strictEqual(lista.body.length, 1, `esperava 1 linha na lista, vieram ${lista.body.length}`);
    assert.strictEqual(lista.body[0].id, PEDIDO.id, 'a linha da lista nao e o pedido criado');
    assert.strictEqual(lista.body[0].valor_total, 70, `10 x 7 = 70, veio ${lista.body[0].valor_total}`);
    assert.strictEqual(lista.body[0].fornecedor_nome, 'Fornecedor Integracao E38 T7',
      'o fornecedor nao resolveu no JOIN da lista');

    // ⇐ passo 3 — O PASSO QUE PROVA QUE A ETAPA 37 DEIXOU DE SER INERTE. Ate a Task 2 nao havia
    // pedido nenhum para esta rota devolver, em nenhum ambiente, producao incluida.
    const aux = await naRotaAux(PEDIDO.numero, '&pendentes=1', PEDIDO.id);
    assert.ok(aux, 'o pedido criado pela porta NOVA tem de aparecer em ?pendentes=1 da Etapa 37');
    assert.strictEqual(aux.quantidade_pedida, 10, `quantidade_pedida deveria ser 10, veio ${aux.quantidade_pedida}`);
    assert.strictEqual(aux.quantidade_recebida, 0, `quantidade_recebida deveria ser 0, veio ${aux.quantidade_recebida}`);
    assert.strictEqual(aux.saldo_pendente, 10, `saldo_pendente deveria ser 10, veio ${aux.saldo_pendente}`);
    assert.strictEqual(aux.situacao_recebimento, 'ABERTO',
      `sem esta palavra a tela nao distingue "falta receber" de "nada chegou": veio ${aux.situacao_recebimento}`);
    assert.strictEqual(aux.fornecedor_nome, 'Fornecedor Integracao E38 T7', 'fornecedor_nome nao resolveu no aux');

    // passo 4 — as LINHAS que a tela de recebimento carrega. `material_id` resolvido e o que torna
    // a linha VISIVEL (o recorte `material_id IS NOT NULL` das DUAS leituras da 37).
    const linhas = await itensDoPedidoAux(PEDIDO.id);
    assert.strictEqual(linhas.status, 200, `itens aux: ${JSON.stringify(linhas.body)}`);
    assert.strictEqual(linhas.body.length, 1, `esperava 1 linha com saldo, vieram ${linhas.body.length}`);
    assert.strictEqual(linhas.body[0].id, LINHA, '`id` da linha do aux tem de ser o id da LINHA do pedido');
    assert.strictEqual(linhas.body[0].saldo_pendente, 10, 'saldo da linha errado');
    assert.strictEqual(linhas.body[0].saldo_pendente_material, 10,
      'e o TETO que a porta do recebimento aceita — a tela limita o input por ele');
    assert.strictEqual(linhas.body[0].valor_unitario, 7,
      'o preco da linha (U1 da Etapa 37, base do custo medio) nao chegou ao recebimento');
  });

  // ═══════════════════════════════════════════════════════════════════════════════════════════════
  // BLOCO B — o recebimento PARCIAL, pela forma da TELA da Etapa 37, ate a entrada fisica.
  // ═══════════════════════════════════════════════════════════════════════════════════════════════
  await test('(B) recebimento parcial de 6 pela TELA: o saldo so anda na entrada fisica, e as duas contas concordam', async () => {
    // passo 5 — o payload IDENTICO ao que `RecebimentosAlmoxarifado` monta.
    const criado = await criarRecebimento({
      tipo_recebimento: 'PEDIDO_COMPRA', pedido_compra_id: PEDIDO.id,
      itens: [itemDaTela(MAT.id, LINHA, 6)],
    });
    assert.strictEqual(criado.status, 201, JSON.stringify(criado.body));
    const recId = criado.body.id;

    const [item] = await itensDoRecebimento(recId);
    assert.strictEqual(item.quantidade_esperada, 10, 'a esperada nasce do SALDO do pedido (10)');
    assert.strictEqual(item.quantidade_recebida, 6, 'a recebida e o que a tela digitou');
    assert.strictEqual(item.pedido_item_id, LINHA,
      'o elo `pedido_item_id` e o que o acumulador da 37 usa para achar a linha do pedido');
    // RN-23: CRIAR documento nao consome saldo.
    assert.strictEqual(await recebidaDaLinha(LINHA), 0,
      'criar o recebimento nao pode somar no pedido — a soma e da entrada FISICA');
    const estoqueAntes = await estoqueDoMaterial(MAT.id);

    // passo 6 — o caminho COMPLETO: conferir, tres avancos de workflow, NF e processar.
    const proc = await processarPeloWorkflow(recId, [{ id: item.id, quantidade_recebida: 6 }], 42);
    assert.strictEqual(proc.status, 200, JSON.stringify(proc.body));
    assert.strictEqual(await statusDoRecebimento(recId), 'PROCESSADO');

    // A FIACAO entre os dois troncos: o pedido soma o MESMO numero que moveu estoque.
    assert.strictEqual(await recebidaDaLinha(LINHA), 6,
      'a linha do pedido tem de somar os 6 que entraram no estoque — 0 aqui e o acumulador sem '
      + 'achar a linha (fiacao `pedido_item_id`), 10 e o acumulador somando a ESPERADA');
    assert.strictEqual(await estoqueDoMaterial(MAT.id) - estoqueAntes, 6, 'as DUAS contas tem de concordar');

    // E a LEITURA tem de dizer a mesma coisa que as duas escritas.
    const aux = await naRotaAux(PEDIDO.numero, '&pendentes=1', PEDIDO.id);
    assert.ok(aux, 'com 4 pendentes o pedido CONTINUA em ?pendentes=1');
    assert.strictEqual(aux.quantidade_recebida, 6);
    assert.strictEqual(aux.saldo_pendente, 4, `saldo_pendente deveria ser 4, veio ${aux.saldo_pendente}`);
    assert.strictEqual(aux.situacao_recebimento, 'PARCIAL', `veio ${aux.situacao_recebimento}`);
    const linhas = await itensDoPedidoAux(PEDIDO.id);
    assert.strictEqual(linhas.body.length, 1, 'a linha com saldo 4 continua sendo oferecida');
    assert.strictEqual(linhas.body[0].saldo_pendente_material, 4,
      'o TETO da porta caiu para 4 — e o numero com que a tela limita o proximo input');

    // O CONTRATO CORE: nenhuma linha da Etapa 38 escreve em `pedidos_compra.status`, e a 37
    // tampouco — a situacao e DERIVADA na leitura.
    assert.strictEqual(await statusCoreDoPedido(PEDIDO.id), 'pendente',
      'gravar PARCIAL/RECEBIDO na tabela core pintaria a tela de Compras com a palavra crua');
  });

  // ═══════════════════════════════════════════════════════════════════════════════════════════════
  // BLOCO C — o excedente, as TRES respostas. O MESMO gesto, no MESMO pedido, mudando SO a flag e o
  // perfil: 400 (falta intencao), 403 (falta autoridade) e 201. Nenhum arquivo de unidade cobre a
  // sequencia, porque cada um monta o seu proprio usuario.
  // ═══════════════════════════════════════════════════════════════════════════════════════════════
  await test('(C) saldo 4 e POST de 5: 400 pela regua, 403 pela permissao e 201 com UMA linha de auditoria', async () => {
    const corpo = {
      tipo_recebimento: 'PEDIDO_COMPRA', pedido_compra_id: PEDIDO.id,
      itens: [itemDaTela(MAT.id, LINHA, 5)],
    };
    const docsAntes = await contarRecebimentos();

    // passo 7 — ALMOXARIFE, sem flag: 400 com a literal do SALDO (nao a da esperada).
    setUser(ALMOXARIFE);
    const p7 = await criarRecebimento(corpo);
    assert.strictEqual(p7.status, 400, JSON.stringify(p7.body));
    assert.strictEqual(p7.body.error, acimaDoSaldo(5, 4, MAT.codigo),
      'a regua e o SALDO do pedido (4), agregado por material — nao a esperada do payload');
    // ⚠️ ASSERCAO DE POSICAO: nao ha transacao neste modulo, entao a recusa TEM de vir ANTES do
    // INSERT do cabecalho. Com a regua depois do INSERT o 400 continua saindo e SO esta contagem
    // acusa o documento fantasma.
    assert.strictEqual(await contarRecebimentos(), docsAntes,
      'passo 7: a recusa tem de acontecer ANTES do INSERT do cabecalho');

    // passo 8 — MESMO gesto COM a flag, ainda ALMOXARIFE: 403 nomeando a ACAO.
    const p8 = await criarRecebimento({ ...corpo, autorizar_excedente: true });
    assert.strictEqual(p8.status, 403, JSON.stringify(p8.body));
    assert.strictEqual(p8.body.error, semPermissao('ALMOXARIFE'));
    assert.strictEqual(await contarRecebimentos(), docsAntes, 'passo 8: o 403 nao cria documento');
    assert.strictEqual(await recebidaDaLinha(LINHA), 6, 'passo 8: a conta do pedido nao mexeu');

    // passo 9 — MESMO gesto, COMPRAS: 201 e UMA linha de trilha. Esta metade POSITIVA e o que
    // impede as duas recusas acima de passarem pelo motivo errado (`can()` devolve false para acao
    // que nao conhece, e um `throw` incondicional passaria nas duas).
    setUser(COMPRAS);
    const p9 = await criarRecebimento({ ...corpo, autorizar_excedente: true });
    assert.strictEqual(p9.status, 201, JSON.stringify(p9.body));
    setUser(ADMIN);
    const [item] = await itensDoRecebimento(p9.body.id);
    assert.strictEqual(item.quantidade_esperada, 4, 'o documento nasce esperada 4 / recebida 5');
    assert.strictEqual(item.quantidade_recebida, 5);
    const trilha = await auditoriaExcedente(item.id);
    assert.strictEqual(trilha.length, 1,
      'UMA linha EXCEDENTE_AUTORIZADO por item excedente — duas seria a trilha inflada que a Etapa '
      + '36 pagou, e zero seria excedente sem rastro');
    assert.strictEqual(trilha[0].usuario_id, COMPRAS.id, 'a trilha tem de nomear QUEM autorizou');

    // E o documento nascido excedente NAO moveu conta nenhuma (ele nao foi processado).
    assert.strictEqual(await recebidaDaLinha(LINHA), 6,
      'passo 9: documento criado e nao processado NAO muda a conta do pedido');
  });

  // ═══════════════════════════════════════════════════════════════════════════════════════════════
  // BLOCO D — o pedido agora SE DEFENDE (RN-C07 / RN-C08). Este e o momento em que as duas etapas
  // se encontram: o pedido do Compras deixou de ser editavel porque o ALMOXARIFADO recebeu contra
  // ele, e nenhuma linha da 38 escreveu nas tabelas da 37 para descobrir isso.
  // ═══════════════════════════════════════════════════════════════════════════════════════════════
  await test('(D) com recebimento processado, o PUT e 400 e o DELETE e 409 — e nada do pedido muda', async () => {
    const idsAntes = await idsDasLinhas(PEDIDO.id);

    // passo 10 — PUT
    const put = await request(app).put(`/api/compras/pedidos/${PEDIDO.id}`)
      .send(payloadPedido([{ material_id: MAT.id, quantidade: 99, valor_unitario: 1 }]));
    assert.strictEqual(put.status, 400, `esperava 400, veio ${put.status} ${JSON.stringify(put.body)}`);
    assert.strictEqual(put.body.error, jaRecebeuEdicao(PEDIDO.numero), 'literal do 400 divergente');
    // ⚠️ O status 400 nao prova que nada foi escrito: reinserir as linhas APAGARIA a
    // `quantidade_recebida` acumulada pela Etapa 37 — perda de dado de estoque, irreversivel.
    const linha = await dbGet(db,
      'SELECT quantidade, quantidade_recebida FROM itens_pedido_compra WHERE id = ?', [LINHA]);
    assert.ok(linha, 'a linha nao pode ter sido apagada pelo PUT recusado');
    assert.strictEqual(linha.quantidade, 10, `a quantidade tinha de continuar 10, veio ${linha.quantidade}`);
    assert.strictEqual(linha.quantidade_recebida, 6,
      `a recebida tinha de continuar 6, veio ${linha.quantidade_recebida} — o PUT apagou dado da E37`);
    assert.deepStrictEqual(await idsDasLinhas(PEDIDO.id), idsAntes,
      'os ids das linhas tem de ser os MESMOS: o PUT recusado nao pode ter reinserido nada');

    // passo 11 — DELETE
    const del = await request(app).delete(`/api/compras/pedidos/${PEDIDO.id}`);
    assert.strictEqual(del.status, 409, `esperava 409, veio ${del.status} ${JSON.stringify(del.body)}`);
    assert.strictEqual(del.body.error, jaRecebeuExclusao(PEDIDO.numero), 'literal do 409 divergente');
    assert.strictEqual(await contarPedidoPorId(PEDIDO.id), 1, 'o 409 apagou o pedido mesmo assim');
    assert.strictEqual(await contarItens(PEDIDO.id), 1, 'o 409 nao pode ter apagado as linhas');
    // E o pedido continua visivel na 37 com o saldo intacto — o 409 nao e um efeito colateral.
    const aux = await naRotaAux(PEDIDO.numero, '&pendentes=1', PEDIDO.id);
    assert.ok(aux, 'o pedido recusado pelo DELETE tem de continuar pendente na Etapa 37');
    assert.strictEqual(aux.saldo_pendente, 4, 'e com o MESMO saldo de antes das duas recusas');

    // METADE POSITIVA no mesmo test(): um pedido LIMPO, criado pela mesma porta, aceita o MESMO PUT
    // e o MESMO DELETE. Sem ela, uma regua que recusasse TODO pedido passaria neste cenario.
    const limpo = await novoPedidoPelaRota([{ material_id: MAT.id, quantidade: 3, valor_unitario: 2 }]);
    const putOk = await request(app).put(`/api/compras/pedidos/${limpo.id}`)
      .send(payloadPedido([{ material_id: MAT.id, quantidade: 99, valor_unitario: 1 }]));
    assert.strictEqual(putOk.status, 200, `pedido sem recebimento tem de aceitar o PUT: ${JSON.stringify(putOk.body)}`);
    const gravado = await dbGet(db, 'SELECT quantidade FROM itens_pedido_compra WHERE pedido_id = ?', [limpo.id]);
    assert.strictEqual(gravado.quantidade, 99, 'o PUT aceito tem de ter gravado a quantidade nova');
    const delOk = await request(app).delete(`/api/compras/pedidos/${limpo.id}`);
    assert.strictEqual(delOk.status, 200, `pedido sem recebimento tem de aceitar o DELETE: ${JSON.stringify(delOk.body)}`);
    assert.strictEqual(delOk.body.message, EXCLUIDO, 'literal do 200 divergente');
    assert.strictEqual(await contarItens(limpo.id), 0,
      'as linhas tem de sumir junto — orfao no harness, 500 por FK em producao');
  });

  // ═══════════════════════════════════════════════════════════════════════════════════════════════
  // BLOCO D2 — O RECEBIMENTO ABERTO TAMBEM DEFENDE O PEDIDO (a perna 2 da regua).
  //
  // ⚠️ E A COMPOSICAO QUE NENHUMA TASK SOZINHA VE, e o ultimo numero deste bloco e a prova: sem a
  // 2a perna do `PUT`, as linhas ganhariam ids NOVOS, o `pedido_item_id` do recebimento aberto
  // ficaria apontando para o vazio e o acumulador da 37 (`receiptService.js:1261`) alteraria ZERO
  // linhas — SEM ERRO, porque 0 linhas nao e erro em SQLite. O material entraria no estoque e o
  // pedido ficaria ABERTO com o saldo cheio, para sempre.
  // ═══════════════════════════════════════════════════════════════════════════════════════════════
  await test('(D2) recebimento CRIADO E NAO PROCESSADO: PUT 400, DELETE 409, e ao processar a linha soma 6 — nao 0', async () => {
    const mat = await novoMaterial();
    const pedido = await novoPedidoPelaRota([{ material_id: mat.id, quantidade: 10, valor_unitario: 5 }]);
    const idsAntes = await idsDasLinhas(pedido.id);
    const linhaId = idsAntes[0];

    const doc = await criarRecebimento({
      tipo_recebimento: 'PEDIDO_COMPRA', pedido_compra_id: pedido.id,
      itens: [itemDaTela(mat.id, linhaId, 6)],
    });
    assert.strictEqual(doc.status, 201, JSON.stringify(doc.body));
    const recId = doc.body.id;
    // Pela RN-23 este documento PASSA pela perna 1: a linha do pedido ainda esta em 0.
    assert.strictEqual(await recebidaDaLinha(linhaId), 0,
      'fixture: um recebimento nao processado deixa a linha do pedido em 0 — e por isso que este '
      + 'cenario mede a perna 2, e nao a perna 1');

    // passo 10b — o PUT recusa com a MESMA literal, e os ids das linhas continuam os MESMOS.
    const put = await request(app).put(`/api/compras/pedidos/${pedido.id}`)
      .send(payloadPedido([{ material_id: MAT.id, quantidade: 3, valor_unitario: 1 }]));
    assert.strictEqual(put.status, 400, `esperava 400, veio ${put.status} ${JSON.stringify(put.body)}`);
    assert.strictEqual(put.body.error, jaRecebeuEdicao(pedido.numero),
      'a literal e a MESMA da perna 1: "ja teve recebimento" inclui o criado e nao processado');
    assert.deepStrictEqual(await idsDasLinhas(pedido.id), idsAntes,
      'os ids das linhas tem de ser os MESMOS — sao eles que o `pedido_item_id` do recebimento aponta');
    const elo = await dbGet(db, `SELECT pedido_item_id FROM recebimentos_material_itens_almoxarifado
      WHERE recebimento_id = ?`, [recId]);
    assert.strictEqual(elo.pedido_item_id, linhaId, 'o elo do recebimento tem de continuar valido');

    // passo 11b — e o DELETE tambem recusa, SO pela perna 2 (a recebida da linha e 0). E o dano que
    // ela evita: apagar o pedido debaixo de um recebimento aberto deixaria o operador conferindo
    // uma nota contra nada.
    const del = await request(app).delete(`/api/compras/pedidos/${pedido.id}`);
    assert.strictEqual(del.status, 409, `esperava 409, veio ${del.status} ${JSON.stringify(del.body)}`);
    assert.strictEqual(del.body.error, jaRecebeuExclusao(pedido.numero), 'literal do 409 divergente');
    assert.strictEqual(await contarPedidoPorId(pedido.id), 1, 'o 409 da perna 2 apagou o pedido mesmo assim');
    assert.strictEqual(await recebidaDaLinha(linhaId), 0,
      'a recebida continua 0: o que recusou os dois gestos foi o DOCUMENTO, nao a quantidade');

    // ⇐ E AGORA O NUMERO QUE PROVA A COMPOSICAO. Processado o recebimento, o acumulador acha a
    // linha porque ela nunca foi reinserida.
    const [item] = await itensDoRecebimento(recId);
    const estoqueAntes = await estoqueDoMaterial(mat.id);
    const proc = await processarPeloWorkflow(recId, [{ id: item.id, quantidade_recebida: 6 }], 30);
    assert.strictEqual(proc.status, 200, JSON.stringify(proc.body));
    assert.strictEqual(await recebidaDaLinha(linhaId), 6,
      'a linha tinha de somar 6: ZERO aqui e o acumulador da 37 alterando 0 linhas SEM ERRO, que e '
      + 'exatamente o dano que a 2a perna do PUT evita');
    assert.strictEqual(await estoqueDoMaterial(mat.id) - estoqueAntes, 6,
      'e o estoque tem de ter andado o MESMO tanto');
    const aux = await naRotaAux(pedido.numero, '&pendentes=1', pedido.id);
    assert.ok(aux, 'com 4 pendentes o pedido continua em ?pendentes=1');
    assert.strictEqual(aux.saldo_pendente, 4, `saldo_pendente deveria ser 4, veio ${aux.saldo_pendente}`);
    assert.strictEqual(aux.situacao_recebimento, 'PARCIAL',
      'se o acumulador tivesse errado a linha, o pedido ficaria ABERTO com o saldo CHEIO para sempre');
  });

  // ═══════════════════════════════════════════════════════════════════════════════════════════════
  // BLOCO E — pelo SERVICO, sem HTTP. `criarPedido` tem chamadores sem rota (a importacao de
  // planilha da T4 e o "Gerar pedido" da Reposicao da T6), e as duas reguas moram no servico. Se
  // alguem mover qualquer uma delas para o handler, os blocos A-D2 continuam verdes e este cai.
  // ═══════════════════════════════════════════════════════════════════════════════════════════════
  await test('(E) pelo SERVICO: criarPedido grava as linhas, o recebimento se vincula e excluirPedido lanca 409', async () => {
    const mat = await novoMaterial();

    // passo 12 — `criarPedido(db, dados, user)` DIRETO, sem `validate()`, sem `req`, com o usuario
    // passado como OBJETO. O `201` da rota nao existe aqui: o que se afirma e a LINHA gravada.
    const pedido = await pedidoCompraService.criarPedido(db, {
      fornecedor_id: fornecedorId,
      itens: [{ material_id: mat.id, quantidade: 8, valor_unitario: 3 }],
    }, ADMIN);
    assert.ok(pedido.id, 'criarPedido pelo servico tem de resolver com o pedido');
    assert.match(pedido.numero || '', /^PC-[0-9A-Z]+$/, `numero fora do formato: ${pedido.numero}`);
    const linhas = await dbAll(db, `SELECT id, material_id, codigo, descricao, quantidade,
      valor_unitario, unidade, quantidade_recebida FROM itens_pedido_compra WHERE pedido_id = ?`, [pedido.id]);
    assert.strictEqual(linhas.length, 1, `esperava 1 linha gravada, vieram ${linhas.length}`);
    assert.strictEqual(linhas[0].material_id, mat.id, 'o `material_id` e o que torna a linha visivel a Etapa 37');
    assert.strictEqual(linhas[0].codigo, mat.codigo, 'o codigo tem de ser COPIADO do material');
    assert.strictEqual(linhas[0].descricao, mat.nome, 'a descricao vem de materiais_almoxarifado.nome');
    assert.strictEqual(linhas[0].quantidade, 8);
    assert.strictEqual(linhas[0].quantidade_recebida, 0,
      'a coluna da Etapa 37 nasce 0 pelo DEFAULT do DDL — o servico nunca a escreve');
    const cab = await dbGet(db, 'SELECT valor_total FROM pedidos_compra WHERE id = ?', [pedido.id]);
    assert.strictEqual(cab.valor_total, 24, `8 x 3 = 24, veio ${cab.valor_total}`);
    const linhaId = linhas[0].id;

    // passo 13 — `receiptService.criarRecebimento(db, user, dados)` DIRETO contra o pedido que o
    // SERVICO do Compras acabou de criar: os dois troncos se encontram sem HTTP em lugar nenhum.
    const rec = await receiptService.criarRecebimento(db, ADMIN, {
      tipo_recebimento: 'PEDIDO_COMPRA', pedido_compra_id: pedido.id,
      itens: [itemDaTela(mat.id, linhaId, 5)],
    });
    assert.ok(rec.id, 'criarRecebimento pelo servico tem de resolver');
    const [itemRec] = await itensDoRecebimento(rec.id);
    assert.strictEqual(itemRec.quantidade_esperada, 8,
      'a esperada nasce do SALDO do pedido criado pelo servico do Compras (8)');
    assert.strictEqual(itemRec.pedido_item_id, linhaId, 'o elo entre os dois modulos, sem rota nenhuma');
    assert.strictEqual(await recebidaDaLinha(linhaId), 0, 'criar nao soma, nem pelo servico');

    // passo 14 — ⇐ A REGRA VALE NAS DUAS ENTRADAS. `excluirPedido` lanca com `status` 409 e a
    // literal; `atualizarPedido` lanca com 400 e a dele. Quem chamar o servico direto (importacao,
    // Reposicao, script de migracao) topa com a MESMA regua da rota.
    await assert.rejects(
      () => pedidoCompraService.excluirPedido(db, pedido.id),
      (e) => {
        assert.strictEqual(e.status, 409, `status errado: ${e.status} — ${e.message}`);
        assert.strictEqual(e.message, jaRecebeuExclusao(pedido.numero));
        return true;
      },
      'a regua da exclusao mora no SERVICO: sem a rota ela TEM de continuar existindo');
    assert.strictEqual(await contarPedidoPorId(pedido.id), 1, 'a recusa do servico apagou o pedido mesmo assim');
    assert.strictEqual(await contarItens(pedido.id), 1, 'nem as linhas');

    await assert.rejects(
      () => pedidoCompraService.atualizarPedido(db, pedido.id, {
        fornecedor_id: fornecedorId, itens: [{ material_id: mat.id, quantidade: 1, valor_unitario: 1 }],
      }),
      (e) => {
        assert.strictEqual(e.status, 400, `status errado: ${e.status} — ${e.message}`);
        assert.strictEqual(e.message, jaRecebeuEdicao(pedido.numero));
        return true;
      },
      'a regua da edicao tambem mora no SERVICO');
    assert.deepStrictEqual(await idsDasLinhas(pedido.id), [linhaId],
      'a recusa do servico nao pode ter reinserido a linha');

    // METADE POSITIVA no mesmo test(): um pedido criado pelo MESMO servico, SEM recebimento, e
    // editavel e excluivel por ele. Sem ela, um `throw` incondicional passaria nas duas rejeicoes.
    const limpo = await pedidoCompraService.criarPedido(db, {
      fornecedor_id: fornecedorId,
      itens: [{ material_id: mat.id, quantidade: 2, valor_unitario: 4 }],
    }, ADMIN);
    const editado = await pedidoCompraService.atualizarPedido(db, limpo.id, {
      fornecedor_id: fornecedorId, itens: [{ material_id: mat.id, quantidade: 9, valor_unitario: 4 }],
    });
    assert.strictEqual(editado.itens.length, 1, 'o PUT pelo servico devolve as linhas novas');
    assert.strictEqual(editado.itens[0].quantidade, 9, 'o pedido limpo TEM de aceitar a edicao');
    const resultado = await pedidoCompraService.excluirPedido(db, limpo.id);
    assert.strictEqual(resultado.message, EXCLUIDO, 'literal do sucesso divergente');
    assert.strictEqual(await contarPedidoPorId(limpo.id), 0, 'o pedido limpo tinha de sumir');
    assert.strictEqual(await contarItens(limpo.id), 0, 'e as linhas junto');
  });

  // ═══════════════════════════════════════════════════════════════════════════════════════════════
  // BLOCO E2 — ONDA DE CORRECAO, F8: o gate condicional de `gerenciar_reposicao` NUNCA foi
  // exercitado pela entrada de SERVICO.
  //
  // O gate (fix 1 da Task 2) mora em `criarPedido`, **nao na rota** — e e a Task 6 (botao "Gerar
  // pedido" da Reposicao) e a importacao que chamam o servico direto. O cenario (11) de
  // `comprasPedidoCriar` o mede pela ROTA; nenhum cenario o media pelo SERVICO, e mover a checagem
  // para o handler (por parecer o lugar "certo" de uma regra de permissao) deixaria os dois
  // chamadores sem gate com a suite INTEIRA verde. E o mesmo argumento do bloco E para as duas
  // pernas da regua, aplicado a terceira regra que vive no servico.
  // ═══════════════════════════════════════════════════════════════════════════════════════════════
  await test('(E2) pelo SERVICO: solicitacao_id sem `gerenciar_reposicao` lanca 403 ANTES de qualquer escrita', async () => {
    const mat = await novoMaterial();
    const sol = await dbRun(db, `INSERT INTO solicitacoes_compra_almoxarifado
      (material_id, quantidade, motivo, status) VALUES (?,?,'ESTOQUE_MINIMO','PENDENTE')`, [mat.id, 9]);

    const pedidosAntes = await contarPedidos();
    await assert.rejects(
      () => pedidoCompraService.criarPedido(db, {
        fornecedor_id: fornecedorId,
        itens: [{ material_id: mat.id, quantidade: 9, valor_unitario: 2 }],
        solicitacao_id: sol.lastID,
      }, SEM_PERFIL),
      (e) => {
        assert.strictEqual(e.status, 403, `status errado: ${e.status} — ${e.message}`);
        assert.strictEqual(e.acao, 'gerenciar_reposicao', `acao errada: ${e.acao}`);
        // O corpo tem o MESMO shape de `requirePermission` (`permissions.js:200`), e e isso que
        // permite a tela dizer QUAL permissao falta e com que perfil o usuario entrou.
        assert.strictEqual(e.perfil, 'PRODUCAO', `perfil errado: ${e.perfil} (o fallback e PRODUCAO)`);
        assert.strictEqual(e.message, 'Sem permissão para esta operação', 'literal do 403 divergente');
        return true;
      },
      'o gate do vinculo mora no SERVICO: sem a rota ele TEM de continuar existindo');

    // ⚠️ AS ASSERCOES QUE MEDEM O DANO: o 403 vem ANTES da primeira escrita — nenhum pedido
    // gravado (recusar depois do INSERT deixaria pedido criado por uma chamada NEGADA) e a
    // solicitacao intacta em PENDENTE.
    assert.strictEqual(await contarPedidos(), pedidosAntes,
      'o 403 do gate nao pode ter gravado pedido nenhum');
    const depois = await dbGet(db,
      'SELECT status, pedido_compra_id FROM solicitacoes_compra_almoxarifado WHERE id = ?', [sol.lastID]);
    assert.strictEqual(depois.status, 'PENDENTE', `a solicitacao virou ${depois.status} sem permissao`);
    assert.strictEqual(depois.pedido_compra_id, null, 'a solicitacao ficou apontando para um pedido');

    // METADE POSITIVA 1: o MESMO usuario, o MESMO payload SEM `solicitacao_id`, CRIA — o gate e
    // CONDICIONAL por contrato (o core Compras nao ganha camada de perfil propria nesta etapa).
    const semVinculo = await pedidoCompraService.criarPedido(db, {
      fornecedor_id: fornecedorId,
      itens: [{ material_id: mat.id, quantidade: 9, valor_unitario: 2 }],
    }, SEM_PERFIL);
    assert.ok(semVinculo.id, 'o MESMO usuario tem de criar pedido SEM vinculo');
    assert.strictEqual(await contarItens(semVinculo.id), 1, 'e com a linha gravada');
    assert.strictEqual(await contarPedidos(), pedidosAntes + 1, 'e o COUNT tem de ter andado UM');

    // METADE POSITIVA 2: com perfil COMPRAS (`gerenciar_reposicao` = [ADMINISTRADOR, GESTOR,
    // COMPRAS]) o MESMO vinculo passa — senao "recusa todo vinculo" passaria neste cenario.
    const comPermissao = await pedidoCompraService.criarPedido(db, {
      fornecedor_id: fornecedorId,
      itens: [{ material_id: mat.id, quantidade: 9, valor_unitario: 2 }],
      solicitacao_id: sol.lastID,
    }, COMPRAS);
    assert.strictEqual(comPermissao.vinculo_solicitacao, 'ok',
      `esperava vinculo 'ok', veio ${comPermissao.vinculo_solicitacao}`);
    const vinculada = await dbGet(db,
      'SELECT status, pedido_compra_id FROM solicitacoes_compra_almoxarifado WHERE id = ?', [sol.lastID]);
    assert.strictEqual(vinculada.status, 'VINCULADO', `solicitacao ficou ${vinculada.status}`);
    assert.strictEqual(vinculada.pedido_compra_id, comPermissao.id, 'o vinculo nao aponta para o pedido criado');
  });

  await close();
  console.log(`\n${passed} passou, ${failed} falhou`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
