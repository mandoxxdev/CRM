/**
 * Etapa 37, Task 7 — a INTEGRAÇÃO que cruza galhos: recebimento CONTRA PEDIDO DE COMPRA, pela
 * ROTA e pelo SERVIÇO.
 *
 * Esta etapa espalhou QUATRO guardas por TRES portas de escrita e DOIS caminhos de entrada
 * fisica, e cada peca tem arquivo de unidade proprio:
 * - `recebimentoExcedentePedido.api.test.js` (T2) mede a regua do `POST` contra o saldo do pedido,
 *   com a `quantidade_recebida` da linha do pedido escrita por `dbRun` DIRETO;
 * - `pedidoSaldoRecebido.api.test.js` (T3) mede o acumulador dentro do claim de
 *   `darEntradaEstoque`, com pedidos que nascem virgens;
 * - `pedidosCompraSaldoAux.api.test.js` (T4) mede a derivacao da situacao na LEITURA.
 *
 * Nenhum dos tres percorre a HISTORIA INTEIRA de um pedido — criar, conferir, faturar, processar,
 * receber de novo, autorizar excedente, processar de novo — e e nela que a fiacao entre os troncos
 * aparece. A Etapa 25 desta base mediu **12 cenarios de unidade verdes e 4 de integracao
 * vermelhos** porque `req.user` e reatribuido pelo `auth` que cada rota redeclara: verde por
 * unidade nao prova que as partes COMPOEM.
 *
 * ⚠️ O ATALHO QUE ESTE ARQUIVO SE PROIBE. Entre CRIAR e PROCESSAR existem TRES portas que LEEM a
 * quantidade do item (`PUT /:id/conferir`, `PUT /:id/fiscal` e `validarDadosProcessamento`), e o
 * `POST` desta etapa passou a CRIAR documentos que nascem com `recebida > esperada` (excedente
 * autorizado na criacao) — populacao que antes so existia por autorizacao no `/conferir`. Ir de
 * "criar" a "processar" com um UPDATE de status a mao foi EXATAMENTE o atalho que escondeu o
 * Critical da Etapa 36 (o documento excedente TRAVAVA no `/fiscal`). Aqui o roteiro vai ate o
 * ultimo gesto, pelo workflow REAL, e o documento nascido excedente atravessa as tres portas.
 *
 * ⚠️ POR QUE EXISTE O BLOCO PELO SERVICO (E). As quatro guardas desta etapa moram no SERVICO
 * (`assertSaldoDoPedidoPermitido`, `assertAutorizacaoExcedente`, as duas literais da RN-25) e o
 * acumulador tambem (dentro de `darEntradaEstoque`). Se alguem, amanha, mover a regua do saldo
 * para a ROTA (por parecer mais simples), os blocos A-D continuam VERDES e o E fica VERMELHO — e
 * o achado e que `criarRecebimento` e `darEntradaEstoque` tem outros chamadores potenciais
 * (`aprovarRecebimento`, `processarNota`, importador, script de migracao). O bloco E tambem e o
 * unico lugar em que o `can()` do excedente e exercitado com um usuario passado como OBJETO, sem
 * `req.user` nenhum no caminho.
 *
 * ⚠️ MODO DE FALHA DESTE ARQUIVO: o TESTE VAZIO por acoplamento. O roteiro esta em CINCO blocos e
 * nao em um, porque as sabotagens desta task tem de cair em pontos DIFERENTES e num `test()` unico
 * a primeira assercao a estourar esconderia as outras:
 * - (A) e o territorio do ACUMULADOR e da fiacao `pedido_item_id` (sabotagens 1 e 3);
 * - (B) e o territorio da REGUA do `POST` e da posicao dela em relacao ao INSERT (sabotagem 2);
 * - (C) e o territorio da RN-23 (documento aberto nao consome saldo);
 * - (D) e o territorio da CAMADA 2 (`receber_material`), com documento/pedido proprios;
 * - (E) e o territorio do SERVICO, com banco proprio de pedido.
 * Os blocos A, B e C compartilham o MESMO pedido de proposito: e a historia dele que se mede, e
 * quebrar o pedido em tres apagaria justamente o que os arquivos de unidade nao cobrem.
 *
 * ⚠️ DIVERGENCIA DECLARADA em relacao ao passo 7/7b do roteiro do plano. O plano pedia "um
 * TERCEIRO recebimento, criado e nao processado" e "um QUARTO, criado ANTES de o terceiro
 * processar, contra o saldo que o terceiro ainda nao consumiu -> 201 os DOIS". No pedido da
 * historia (A/B) o saldo depois do passo 6 e **-1** (recebeu 11 de 10, por excedente autorizado):
 * ali QUALQUER quantidade e excedente e os dois POST mediriam a FLAG, nao a regra. Entao o bloco C
 * mede a regra num pedido PROPRIO de saldo limpo (dois recebimentos de 10 contra um pedido de 10,
 * nenhum processado -> 201 os dois, a linha continua 0) E TAMBEM afirma, no pedido da historia,
 * que um recebimento novo criado com a flag nao move a conta ate a entrada fisica. As duas metades
 * juntas e que impedem a proxima sessao de ler a etapa como "o pedido nao pode receber mais do que
 * pediu": ele pode, e o que a etapa governa e QUEM autoriza e QUANDO a conta anda.
 *
 * Executar: cd server && node tests/api/recebimentoContraPedidoIntegracao.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const receiptService = require('../../services/almoxarifado/receiptService');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

// (iii) Nenhum id de fixture `1`; a numeracao segue `recebimentoPortasIntegracao` (Etapa 36) e
// `recebimentoExcedentePedido` (T2), e todo id de pedido/linha/item/recebimento e LIDO do banco.
const ADMIN = { id: 80, nome: 'Admin Int E37', role: 'admin' };
const ALMOXARIFE = { id: 81, nome: 'Almoxarife Int E37', role: 'usuario', perfil_almoxarifado: 'ALMOXARIFE' };
const COMPRAS = { id: 82, nome: 'Compras Int E37', role: 'usuario', perfil_almoxarifado: 'COMPRAS' };
const GESTOR = { id: 83, nome: 'Gestor Int E37', role: 'usuario', perfil_almoxarifado: 'GESTOR' };
const SEM_PERFIL = { id: 84, nome: 'Chao de Fabrica Int E37', role: 'usuario' }; // cai em PRODUCAO

// As literais das guardas, congeladas. O sufixo e o MESMO das tres portas desde o fix-round da
// Etapa 36 (achado F3): ele NOMEIA quem autoriza, em vez de mandar o ALMOXARIFE marcar uma caixa
// que ele nunca ve.
const SUFIXO = ' — a autorização de excedente é de Compras ou do Administrador';
const acimaDoSaldo = (recebida, saldo, codigo) => `Quantidade recebida (${recebida}) maior que o `
  + `saldo do pedido (${saldo}) para o material ${codigo}${SUFIXO}`;
const semPermissao = (perfil) => 'Autorizar recebimento acima do pedido exige a permissão '
  + `"autorizar_excedente" (seu perfil: ${perfil}).`;

(async () => {
  const { app, db, setUser, close } = await createTestApp({ user: ADMIN });

  // `gerarContaPagar` insere aqui no `processar`. Subconjunto minimo das colunas do INSERT dele
  // (molde: recebimentoExcedentePedido.api.test.js:76).
  await dbRun(db, `CREATE TABLE IF NOT EXISTS contas_pagar (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    descricao TEXT NOT NULL, fornecedor TEXT, valor REAL NOT NULL, data_vencimento DATE,
    data_pagamento DATE, status TEXT DEFAULT 'pendente', categoria TEXT, observacoes TEXT
  )`);

  // `validarDadosProcessamento` exige fornecedor (CNPJ OU nome) para processar, e o `POST` por
  // pedido herda o fornecedor DO PEDIDO — entao o pedido nasce com um fornecedor de verdade.
  const forn = await dbRun(db, `INSERT INTO fornecedores (razao_social, cnpj)
    VALUES ('Forn Int E37','79.779.779/0001-79')`);

  let seq = 0;
  async function novoMaterial() {
    seq += 1;
    const codigo = `E37-T7-${seq}`;
    const m = await dbRun(db, `INSERT INTO materiais_almoxarifado
      (codigo, nome, unidade, quantidade_atual, ativo) VALUES (?,?,'UN',0,1)`,
    [codigo, `Chapa integracao ${seq}`]);
    return { id: m.lastID, codigo };
  }

  /**
   * Pedido de compra. `status` vai EXPLICITO e no vocabulario MINUSCULO da tela de Compras
   * (`client/src/components/Compras.js`): e ele que o bloco A afirma INTACTO depois de a historia
   * inteira rodar. `tag` entra no NUMERO para que cada bloco consulte a rota aux com `?search=` e
   * afirme sobre o SEU conjunto, sem depender do `LIMIT 50`.
   */
  async function novoPedido(linhas, opcoes = {}) {
    seq += 1;
    const numero = `PC-E37T7-${opcoes.tag || 'X'}-${seq}`;
    const p = await dbRun(db, `INSERT INTO pedidos_compra (numero, fornecedor_id, status)
      VALUES (?,?,?)`, [numero, forn.lastID, opcoes.status || 'aprovado']);
    const ids = [];
    for (const l of linhas) {
      const r = await dbRun(db, `INSERT INTO itens_pedido_compra
        (pedido_id, material_id, codigo, descricao, quantidade, valor_unitario, unidade)
        VALUES (?,?,?,?,?,?,'UN')`,
      [p.lastID, l.material_id, l.codigo || null, l.descricao || 'Linha do pedido',
        l.quantidade, l.valor_unitario != null ? l.valor_unitario : 10]);
      ids.push(r.lastID);
    }
    return { id: p.lastID, numero, linhas: ids };
  }

  /**
   * O payload LITERAL da tela nova (T5, `RecebimentosAlmoxarifado.js:595-601`): `pedido_item_id` +
   * `material_id` + `quantidade` + `quantidade_recebida`, e **sem `quantidade_esperada`** — a
   * esperada nasce do SALDO, no servidor. Montar o payload aqui com uma forma DIFERENTE da tela
   * faria o arquivo medir uma porta que nenhum usuario atravessa.
   */
  const itemDaTela = (materialId, pedidoItemId, quantidade) => ({
    material_id: materialId, pedido_item_id: pedidoItemId,
    quantidade, quantidade_recebida: quantidade,
  });
  const criar = (body) => request(app).post('/api/almoxarifado/recebimentos').send(body);
  const conferir = (id, body) => request(app)
    .put(`/api/almoxarifado/recebimentos/${id}/conferir`).send(body);
  const fiscal = (id, body) => request(app)
    .put(`/api/almoxarifado/recebimentos/${id}/fiscal`).send(body);
  const workflow = (id, acao) => request(app)
    .post(`/api/almoxarifado/recebimentos/${id}/workflow`).send({ acao });
  const listarPedidos = (qs) => request(app)
    .get(`/api/almoxarifado/recebimentos-aux/pedidos-compra${qs || ''}`);
  const itensDoPedido = (id) => request(app)
    .get(`/api/almoxarifado/recebimentos-aux/pedidos-compra/${id}/itens`);

  // ⚠️ MODO DE FALHA 3 DESTA ETAPA: todo numero e LIDO pelo id que o INSERT devolveu e AFIRMADO —
  // nunca "nao deu erro", nunca "o campo existe".
  const recebidaDaLinha = async (linhaId) => (await dbGet(db,
    'SELECT quantidade_recebida FROM itens_pedido_compra WHERE id = ?', [linhaId])).quantidade_recebida;
  const estoqueDoMaterial = async (matId) => (await dbGet(db,
    'SELECT quantidade_atual FROM materiais_almoxarifado WHERE id = ?', [matId])).quantidade_atual;
  const statusCoreDoPedido = async (pedidoId) => (await dbGet(db,
    'SELECT status FROM pedidos_compra WHERE id = ?', [pedidoId])).status;
  const contarRecebimentos = async () => (await dbGet(db,
    'SELECT COUNT(*) AS n FROM recebimentos_material_almoxarifado')).n;
  const statusDo = async (recId) => (await dbGet(db,
    'SELECT status FROM recebimentos_material_almoxarifado WHERE id = ?', [recId])).status;
  const itensDo = (recId) => dbAll(db, `SELECT id, material_id, quantidade_esperada,
    quantidade_recebida, pedido_item_id FROM recebimentos_material_itens_almoxarifado
    WHERE recebimento_id = ? ORDER BY id`, [recId]);
  const auditoriaExcedente = (itemId) => dbAll(db, `SELECT * FROM auditoria_log_almoxarifado
    WHERE entidade = 'recebimento_item' AND acao = 'EXCEDENTE_AUTORIZADO' AND entidade_id = ?`,
  [itemId]);
  const naRotaAux = async (qs, pedidoId) => (await listarPedidos(qs)).body.find((p) => p.id === pedidoId);

  /**
   * As TRES portas entre criar e processar, pelo workflow REAL. `itens` (o eco da quantidade JA
   * GRAVADA) e obrigatorio nos dois PUT porque e o que as telas mandam: o painel de conferencia
   * reenvia a contagem e o modal de NF reenvia os itens, e NENHUM dos dois tem caixa de
   * autorizacao de excedente. Se qualquer um dos dois responder 400 num documento nascido
   * excedente, o furo e o F1/R1 da Etapa 36 numa porta nova — e o conserto e na REGRA, nas duas
   * portas, nao aqui.
   */
  async function atravessarAsTresPortas(recId, itens, { conferenteComoAlmoxarife } = {}) {
    if (conferenteComoAlmoxarife) setUser(ALMOXARIFE);
    const conf = await conferir(recId, { itens });
    assert.strictEqual(conf.status, 200,
      `PUT /conferir ecoando a quantidade GRAVADA nao e ato novo de autorizacao: ${
        JSON.stringify(conf.body)}`);
    if (conferenteComoAlmoxarife) setUser(ADMIN);

    for (const acao of ['encaminhar_compras', 'finalizar_compras', 'iniciar_faturamento']) {
      const r = await workflow(recId, acao);
      assert.strictEqual(r.status, 200, `workflow ${acao}: ${JSON.stringify(r.body)}`);
    }

    const nf = await fiscal(recId, {
      nota_fiscal: `NF-E37T7-${recId}`, fornecedor_id: forn.lastID,
      fornecedor_nome: 'Forn Int E37', data_emissao_nf: '2026-09-10',
      data_entrada_nf: '2026-09-11', valor_total_nota: 600, itens,
    });
    assert.strictEqual(nf.status, 200,
      `PUT /fiscal ecoando a quantidade GRAVADA (o modal nao tem caixa de autorizacao): ${
        JSON.stringify(nf.body)}`);

    return workflow(recId, 'processar');
  }

  // A historia inteira (blocos A, B e C-segunda-metade) corre sobre UM pedido: e a fiacao entre os
  // troncos que se mede, e tres pedidos separados voltariam a ser tres testes de unidade.
  const MAT = await novoMaterial();
  const PEDIDO = await novoPedido([{ material_id: MAT.id, quantidade: 10, codigo: 'LINHA-HIST' }],
    { tag: 'A', status: 'aprovado' });
  const LINHA = PEDIDO.linhas[0];

  // ───────────────────────────────────────────────────────────────────────────────────────────────
  // BLOCO A — passos 1 e 2: do `POST` da TELA ate a entrada fisica, e o saldo andando SO ali.
  // Territorio do ACUMULADOR (T3) e da fiacao `pedido_item_id` (T2): as sabotagens 1 e 3 caem aqui.
  // ───────────────────────────────────────────────────────────────────────────────────────────────
  await test('(A) pela ROTA: pedido de 10, recebimento de 6 pela TELA, e o saldo so anda na entrada fisica', async () => {
    const criado = await criar({
      tipo_recebimento: 'PEDIDO_COMPRA', pedido_compra_id: PEDIDO.id,
      itens: [itemDaTela(MAT.id, LINHA, 6)],
    });
    assert.strictEqual(criado.status, 201, JSON.stringify(criado.body));
    const recId = criado.body.id;

    // A esperada GRAVADA e o SALDO (10) e a recebida e 6 — e essa DIFERENCA e o que faz a
    // sabotagem "somar a esperada" legivel: ela faria o pedido e o estoque discordarem em 4.
    const [item] = await itensDo(recId);
    assert.strictEqual(item.quantidade_esperada, 10, 'a esperada nasce do SALDO do pedido');
    assert.strictEqual(item.quantidade_recebida, 6, 'a recebida e o que a tela digitou');

    // passo 1b — ANTES de processar: a conta do pedido NAO andou e a rota aux continua oferecendo
    // o pedido inteiro. Criar documento nao consome saldo (RN-23).
    assert.strictEqual(await recebidaDaLinha(LINHA), 0,
      'criar o recebimento nao pode somar no pedido — a soma e da entrada FISICA');
    const antesDeProcessar = await naRotaAux('?pendentes=1&search=E37T7-A', PEDIDO.id);
    assert.ok(antesDeProcessar,
      `documento aberto nao tira o pedido de ?pendentes=1 — o pedido ${PEDIDO.numero} tem de estar la`);
    assert.strictEqual(antesDeProcessar.saldo_pendente, 10,
      'o saldo lido tem de ser 10: contar documento ABERTO como saldo consumido e etapa propria, '
      + 'declarada em "NAO cobre"');
    assert.strictEqual(antesDeProcessar.situacao_recebimento, 'ABERTO');
    const estoqueAntes = await estoqueDoMaterial(MAT.id);

    // passo 2 — O CAMINHO COMPLETO: `/conferir` (como ALMOXARIFE, sem flag), os tres avancos de
    // workflow, `/fiscal` e `processar`. Nenhum UPDATE de status a mao.
    const proc = await atravessarAsTresPortas(recId, [{ id: item.id, quantidade_recebida: 6 }],
      { conferenteComoAlmoxarife: true });
    assert.strictEqual(proc.status, 200, JSON.stringify(proc.body));
    assert.strictEqual(await statusDo(recId), 'PROCESSADO');

    // A FIACAO entre os dois troncos: o pedido soma o MESMO numero que moveu estoque.
    assert.strictEqual(await recebidaDaLinha(LINHA), 6,
      'a linha do pedido tem de somar os 6 que entraram no estoque — 0 aqui e o acumulador sem '
      + 'achar a linha (fiacao `pedido_item_id`), 10 e o acumulador somando a ESPERADA');
    assert.strictEqual(await estoqueDoMaterial(MAT.id) - estoqueAntes, 6,
      'as DUAS contas tem de concordar');

    // E a LEITURA (T4) tem de dizer a mesma coisa que as duas escritas: 4 pendentes, PARCIAL.
    const depois = await naRotaAux('?pendentes=1&search=E37T7-A', PEDIDO.id);
    assert.ok(depois, 'com 4 pendentes o pedido CONTINUA em ?pendentes=1');
    assert.strictEqual(depois.quantidade_pedida, 10);
    assert.strictEqual(depois.quantidade_recebida, 6);
    assert.strictEqual(depois.saldo_pendente, 4);
    assert.strictEqual(depois.situacao_recebimento, 'PARCIAL',
      'sem esta palavra a tela nao distingue "falta receber" de "nada chegou"');

    const linhasOferecidas = await itensDoPedido(PEDIDO.id);
    assert.strictEqual(linhasOferecidas.status, 200, JSON.stringify(linhasOferecidas.body));
    assert.strictEqual(linhasOferecidas.body.length, 1);
    assert.strictEqual(linhasOferecidas.body[0].id, LINHA, '`id` e o id da LINHA do pedido');
    assert.strictEqual(linhasOferecidas.body[0].saldo_pendente, 4);
    assert.strictEqual(linhasOferecidas.body[0].saldo_pendente_material, 4,
      'com uma linha por material o agregado da regua e o saldo da linha — e e o numero que a '
      + 'tela usa para limitar o input ANTES de o operador tomar 400');

    // O CONTRATO CORE: nada desta etapa escreve em `pedidos_compra`.
    assert.strictEqual(await statusCoreDoPedido(PEDIDO.id), 'aprovado',
      'a situacao do recebimento e DERIVADA na leitura; gravar `RECEBIDO` na tabela core pintaria '
      + 'a tela de Compras de cinza com a palavra crua');
  });

  // ───────────────────────────────────────────────────────────────────────────────────────────────
  // BLOCO B — passos 3 a 6: o MESMO gesto com TRES respostas, e o documento nascido excedente
  // atravessando as tres portas ate PROCESSADO. Territorio da REGUA do `POST` e da POSICAO dela
  // em relacao ao INSERT do cabecalho: a sabotagem 2 cai aqui.
  //
  // ⚠️ A ORDEM 3 -> 4 -> 5 E O PONTO: o MESMO POST, no MESMO pedido, com TRES respostas, mudando
  // SO a flag e o perfil — 400 (falta intencao), 403 (falta autoridade) e 201. Nenhum arquivo de
  // unidade cobre isso na sequencia, porque cada um monta o seu proprio usuario.
  // ───────────────────────────────────────────────────────────────────────────────────────────────
  let itemExcedente = null;
  await test('(B) pela ROTA: saldo 4 e POST de 5 — 400, 403 e 201, e o documento excedente chega a PROCESSADO', async () => {
    const corpo = {
      tipo_recebimento: 'PEDIDO_COMPRA', pedido_compra_id: PEDIDO.id,
      itens: [itemDaTela(MAT.id, LINHA, 5)],
    };
    const antes = await contarRecebimentos();

    // passo 3 — sem flag, como ALMOXARIFE: 400 com a literal do SALDO (nao a da esperada).
    setUser(ALMOXARIFE);
    const p3 = await criar(corpo);
    assert.strictEqual(p3.status, 400, JSON.stringify(p3.body));
    assert.strictEqual(p3.body.error, acimaDoSaldo(5, 4, MAT.codigo),
      'a regua e o SALDO do pedido (4), agregado por material — nao a esperada do payload');
    // ⚠️ A ASSERCAO DE POSICAO: nao ha transacao neste modulo, entao a regua TEM de recusar ANTES
    // do `inserirComNumeroUnico`. Com ela depois do INSERT o 400 continua saindo e SO esta
    // contagem acusa o documento fantasma.
    assert.strictEqual(await contarRecebimentos(), antes,
      'passo 3: a recusa tem de acontecer ANTES do INSERT do cabecalho');

    // passo 4 — MESMO gesto COM a flag, ainda ALMOXARIFE: 403 nomeando a ACAO. A assercao negativa
    // de permissao so e prova porque o 201 do passo 5 mora no MESMO `test()` — `can()` devolve
    // false para acao que nao conhece, entao esta metade ficaria verde pelo motivo errado.
    const p4 = await criar({ ...corpo, autorizar_excedente: true });
    assert.strictEqual(p4.status, 403, JSON.stringify(p4.body));
    assert.strictEqual(p4.body.error, semPermissao('ALMOXARIFE'));
    assert.strictEqual(await contarRecebimentos(), antes, 'passo 4: o 403 nao cria documento');
    assert.strictEqual(await recebidaDaLinha(LINHA), 6, 'passo 4: a conta do pedido nao mexeu');

    // passo 5 — MESMO gesto, COMPRAS: 201 e UMA linha de trilha.
    setUser(COMPRAS);
    const p5 = await criar({ ...corpo, autorizar_excedente: true });
    assert.strictEqual(p5.status, 201, JSON.stringify(p5.body));
    setUser(ADMIN);
    const recId = p5.body.id;
    const [item] = await itensDo(recId);
    itemExcedente = item.id;
    assert.strictEqual(item.quantidade_esperada, 4, 'o documento nasce esperada 4 / recebida 5');
    assert.strictEqual(item.quantidade_recebida, 5);
    assert.strictEqual(item.pedido_item_id, LINHA);
    const trilha = await auditoriaExcedente(item.id);
    assert.strictEqual(trilha.length, 1,
      'UMA linha EXCEDENTE_AUTORIZADO por item excedente — duas seria a trilha inflada que a '
      + 'Etapa 36 pagou, e zero seria excedente sem rastro');
    assert.strictEqual(trilha[0].usuario_id, COMPRAS.id);

    // passo 5b — A POPULACAO DO CRITICAL DA 36: `recebida (5) > esperada (4)`. As duas portas
    // ECOAM 5 sem flag nenhuma, porque a regra pos-onda barra so o AUMENTO sobre a gravada.
    const proc = await atravessarAsTresPortas(recId, [{ id: item.id, quantidade_recebida: 5 }],
      { conferenteComoAlmoxarife: true });
    assert.strictEqual(proc.status, 200, JSON.stringify(proc.body));
    assert.strictEqual(await statusDo(recId), 'PROCESSADO');
    assert.strictEqual((await auditoriaExcedente(item.id)).length, 1,
      'ecoar a quantidade GRAVADA nao e ato novo de autorizacao: a trilha continua com UMA linha '
      + '(remarcar a caixa a cada save foi a auditoria inflada da Etapa 36)');

    // passo 6 — a conta do pedido fecha em 11 de 10, e a LEITURA faz o clamp.
    assert.strictEqual(await recebidaDaLinha(LINHA), 11, '6 + 5 = 11: o acumulador SOMA');
    assert.strictEqual(await estoqueDoMaterial(MAT.id), 11);
    const lido = await naRotaAux('?search=E37T7-A', PEDIDO.id);
    assert.strictEqual(lido.quantidade_recebida, 11);
    assert.strictEqual(lido.saldo_pendente, 0,
      'sem o clamp da T4 a rota devolveria -1 e a tela escreveria "Saldo pendente: -1"');
    assert.strictEqual(lido.situacao_recebimento, 'RECEBIDO');

    // passo 8 — `?pendentes=1` nao traz mais este pedido; SEM o filtro, traz (a metade positiva,
    // sem a qual "nao traz" passaria com a rota devolvendo lista vazia).
    assert.strictEqual(await naRotaAux('?pendentes=1&search=E37T7-A', PEDIDO.id), undefined,
      'pedido com saldo 0 nao e pendencia');
    assert.ok(await naRotaAux('?search=E37T7-A', PEDIDO.id),
      'sem o filtro o pedido CONTINUA aparecendo — quem some e so com ?pendentes=1');
    const vazio = await itensDoPedido(PEDIDO.id);
    assert.strictEqual(vazio.status, 200, `pedido quitado nao e 404: ${JSON.stringify(vazio.body)}`);
    assert.deepStrictEqual(vazio.body, [],
      'a linha excedida nao tem o que receber; com o saldo em -1 ela voltaria a ser oferecida');

    assert.strictEqual(await statusCoreDoPedido(PEDIDO.id), 'aprovado',
      'nem o excedente autorizado escreve em `pedidos_compra`');
  });

  // ───────────────────────────────────────────────────────────────────────────────────────────────
  // BLOCO C — passos 7 e 7b (RN-23): O SALDO SO CONTA A ENTRADA FISICA, afirmado nas duas
  // direcoes. Ver a DIVERGENCIA DECLARADA no cabecalho: a primeira metade usa pedido PROPRIO de
  // saldo limpo (no pedido da historia o saldo e -1 e os dois POST mediriam a flag, nao a regra);
  // a segunda metade volta ao pedido da historia para o passo 7 literal.
  // ───────────────────────────────────────────────────────────────────────────────────────────────
  await test('(C) pela ROTA: dois recebimentos de 10 contra um pedido de 10 sao 201 os DOIS — o saldo so anda na entrada', async () => {
    const mat = await novoMaterial();
    const pedido = await novoPedido([{ material_id: mat.id, quantidade: 10 }], { tag: 'C' });
    const corpo = {
      tipo_recebimento: 'PEDIDO_COMPRA', pedido_compra_id: pedido.id,
      itens: [itemDaTela(mat.id, pedido.linhas[0], 10)],
    };

    const um = await criar(corpo);
    assert.strictEqual(um.status, 201, JSON.stringify(um.body));
    const dois = await criar(corpo);
    assert.strictEqual(dois.status, 201,
      'o SEGUNDO documento de 10 e legitimo: o primeiro nao entrou no estoque e nao consumiu '
      + `saldo — ${JSON.stringify(dois.body)}`);
    assert.strictEqual(await recebidaDaLinha(pedido.linhas[0]), 0,
      'DOIS documentos abertos de 10 e a linha do pedido continua 0');

    // Agora um deles entra fisicamente: a conta anda 10, e SO por causa dele.
    const [itemUm] = await itensDo(um.body.id);
    const proc = await atravessarAsTresPortas(um.body.id, [{ id: itemUm.id, quantidade_recebida: 10 }]);
    assert.strictEqual(proc.status, 200, JSON.stringify(proc.body));
    assert.strictEqual(await recebidaDaLinha(pedido.linhas[0]), 10,
      'o primeiro processado soma 10');
    assert.strictEqual(await statusDo(dois.body.id), 'RECEBIDO',
      'controle: o segundo continua PARADO (nao existe status CANCELADO de recebimento — medido; '
      + 'este e o equivalente alcancavel)');
    assert.strictEqual(await estoqueDoMaterial(mat.id), 10);

    // passo 7 LITERAL, no pedido da historia: um recebimento NOVO, criado com a flag (o saldo la e
    // -1) e NAO processado, nao move a conta.
    setUser(COMPRAS);
    const terceiro = await criar({
      tipo_recebimento: 'PEDIDO_COMPRA', pedido_compra_id: PEDIDO.id, autorizar_excedente: true,
      itens: [itemDaTela(MAT.id, LINHA, 2)],
    });
    setUser(ADMIN);
    assert.strictEqual(terceiro.status, 201,
      `pedido pode receber acima do pedido COM autorizacao: ${JSON.stringify(terceiro.body)}`);
    assert.strictEqual(await recebidaDaLinha(LINHA), 11,
      'passo 7: documento criado e nao processado NAO muda a conta do pedido (continua 11)');
    assert.strictEqual(await estoqueDoMaterial(MAT.id), 11, 'e nao move estoque');
  });

  // ───────────────────────────────────────────────────────────────────────────────────────────────
  // BLOCO D — a CAMADA 2 continua na frente de TUDO. Pedido PROPRIO, para que a sabotagem de
  // permissao caia SO aqui e nada do que este bloco tenta possa sujar a historia dos blocos A-C.
  // ───────────────────────────────────────────────────────────────────────────────────────────────
  await test('(D) pela ROTA: GESTOR com a flag e SEM_PERFIL tomam 403 de receber_material, ANTES do servico', async () => {
    const mat = await novoMaterial();
    const pedido = await novoPedido([{ material_id: mat.id, quantidade: 10 }], { tag: 'D' });
    const antes = await contarRecebimentos();
    // Payload EXCEDENTE de proposito (11 contra saldo 10) e COM a flag: se a camada 2 saisse da
    // frente, a resposta seria 403 do SERVICO (`autorizar_excedente`) ou 201 — nunca este 403.
    // Afirmar a ACAO e o que prova que o gate veio ANTES do `validate` e antes do servico.
    const corpo = {
      tipo_recebimento: 'PEDIDO_COMPRA', pedido_compra_id: pedido.id, autorizar_excedente: true,
      itens: [itemDaTela(mat.id, pedido.linhas[0], 11)],
    };

    for (const [u, perfilEsperado] of [[GESTOR, 'GESTOR'], [SEM_PERFIL, 'PRODUCAO']]) {
      setUser(u);
      const res = await criar(corpo);
      assert.strictEqual(res.status, 403, `${u.nome}: ${JSON.stringify(res.body)}`);
      assert.strictEqual(res.body.acao, 'receber_material',
        `${u.nome}: o 403 e da CAMADA 2 e a mensagem tem de nomear \`receber_material\` — o 403 do `
        + 'SERVICO nomearia `autorizar_excedente`, e distinguir os dois e o mapa de qual camada '
        + 'recusou o que');
      assert.strictEqual(res.body.perfil, perfilEsperado,
        `${u.nome}: getPerfilFromUser faz fallback para PRODUCAO — sem perfil nao e "sem acesso"`);
    }
    setUser(ADMIN);

    assert.strictEqual(await contarRecebimentos(), antes, 'o 403 nao pode ter criado documento');
    assert.strictEqual(await recebidaDaLinha(pedido.linhas[0]), 0, 'nem somado no pedido');

    // A metade POSITIVA, sem a qual os dois 403 acima passariam com a rota morta: o ADMIN
    // atravessa o MESMO payload (excedente + flag) com 201.
    const ok = await criar(corpo);
    assert.strictEqual(ok.status, 201,
      `o MESMO gesto com quem tem a porta E a acao TEM de passar: ${JSON.stringify(ok.body)}`);
  });

  // ───────────────────────────────────────────────────────────────────────────────────────────────
  // BLOCO E — pelo SERVICO, sem `supertest`: as guardas desta etapa e o acumulador existem SEM a
  // rota. E o cenario que fica vermelho se alguem mover a regua do saldo para a camada da rota,
  // enquanto A-D continuam verdes.
  // ───────────────────────────────────────────────────────────────────────────────────────────────
  await test('(E) pelo SERVICO: a regua do saldo, o `can()` do excedente e o acumulador nao dependem da rota', async () => {
    const mat = await novoMaterial();
    const pedido = await novoPedido([{ material_id: mat.id, quantidade: 10 }], { tag: 'E' });
    const linha = pedido.linhas[0];
    const corpo = (quantidade, extra) => ({
      tipo_recebimento: 'PEDIDO_COMPRA', pedido_compra_id: pedido.id,
      itens: [itemDaTela(mat.id, linha, quantidade)], ...extra,
    });

    // (1) `criarRecebimento` DIRETO, com o usuario passado como OBJETO: resolve, e o item nasce
    // esperada 10 / recebida 6 — a mesma forma que a rota produziu no bloco A.
    const primeiro = await receiptService.criarRecebimento(db, ADMIN, corpo(6));
    assert.ok(primeiro.id, 'criarRecebimento direto tem de resolver');
    const [itemUm] = await itensDo(primeiro.id);
    assert.strictEqual(itemUm.quantidade_esperada, 10, 'a esperada do SALDO nasce no SERVICO');
    assert.strictEqual(itemUm.quantidade_recebida, 6);
    assert.strictEqual(itemUm.pedido_item_id, linha,
      'a fiacao `pedido_item_id` e do servico: sem ela o acumulador abaixo nao acha a linha');
    assert.strictEqual(await recebidaDaLinha(linha), 0, 'criar nao soma, nem pelo servico');

    // (2) `darEntradaEstoque` DIRETO — o OUTRO caminho de entrada fisica (o mesmo que
    // `aprovarRecebimento` usa). O acumulador mora AQUI, e nao em `processarNota`: some-lo la
    // deixaria este caminho creditando estoque sem contar ao pedido.
    const rec = await dbGet(db,
      'SELECT * FROM recebimentos_material_almoxarifado WHERE id = ?', [primeiro.id]);
    await receiptService.darEntradaEstoque(db, ADMIN, rec, primeiro.id, {});
    assert.strictEqual(await recebidaDaLinha(linha), 6,
      'a entrada fisica pelo SERVICO tem de mover a linha do pedido');
    assert.strictEqual(await estoqueDoMaterial(mat.id), 6, 'e o estoque, com o MESMO numero');

    // (3) A REGUA DO SALDO mora no SERVICO: 5 contra o saldo de 4 REJEITA com 400 e a literal —
    // sem rota, sem `req.user`, sem `validate`.
    const docsAntes = await contarRecebimentos();
    await assert.rejects(
      () => receiptService.criarRecebimento(db, ADMIN, corpo(5)),
      (e) => {
        assert.strictEqual(e.status, 400, `status errado: ${e.status} — ${e.message}`);
        assert.strictEqual(e.message, acimaDoSaldo(5, 4, mat.codigo));
        return true;
      },
      'a regua do saldo do pedido mora no SERVICO: sem a rota ela TEM de continuar existindo');
    assert.strictEqual(await contarRecebimentos(), docsAntes,
      'a recusa do servico e ANTES do INSERT do cabecalho');

    // (4) O `can()` do excedente tambem: COM a flag e um usuario de perfil ALMOXARIFE passado como
    // OBJETO, o servico responde 403 nomeando a ACAO. Pela rota o ALMOXARIFE chega aqui; o GESTOR
    // nao (a camada 2 o para antes), e por isso este e o UNICO lugar em que
    // `can(GESTOR, 'autorizar_excedente')` e exercitado de verdade.
    for (const u of [ALMOXARIFE, GESTOR]) {
      const perfil = u.perfil_almoxarifado;
      await assert.rejects(
        () => receiptService.criarRecebimento(db, u, corpo(5, { autorizar_excedente: true })),
        (e) => {
          assert.strictEqual(e.status, 403, `${perfil}: status errado ${e.status} — ${e.message}`);
          assert.strictEqual(e.message, semPermissao(perfil));
          return true;
        },
        `${perfil} nao tem a acao: o SERVICO TEM de recusar, nomeando a acao`);
      assert.strictEqual(await contarRecebimentos(), docsAntes, `${perfil}: nada foi criado`);
      assert.strictEqual(await recebidaDaLinha(linha), 6, `${perfil}: a conta do pedido nao mexeu`);
    }

    // (5) A METADE POSITIVA do `can()` NESTA camada: COMPRAS, com a flag, cria o excedente e a
    // trilha nasce. Sem ela, um `throw` incondicional passaria as quatro rejeicoes acima com
    // louvor — e `can()` devolve false para acao que nao conhece.
    const excedente = await receiptService.criarRecebimento(db, COMPRAS,
      corpo(5, { autorizar_excedente: true }));
    assert.ok(excedente.id, 'COMPRAS tem a acao: a chamada resolve');
    const [itemDois] = await itensDo(excedente.id);
    assert.strictEqual(itemDois.quantidade_esperada, 4, 'a esperada e o saldo (4)');
    assert.strictEqual(itemDois.quantidade_recebida, 5);
    assert.strictEqual((await auditoriaExcedente(itemDois.id)).length, 1,
      'a trilha do excedente e escrita pelo SERVICO, nao pela rota');

    // (6) E o acumulador fecha a conta pelo servico tambem: 6 + 5 = 11, o clamp da leitura em 0.
    const rec2 = await dbGet(db,
      'SELECT * FROM recebimentos_material_almoxarifado WHERE id = ?', [excedente.id]);
    await receiptService.darEntradaEstoque(db, ADMIN, rec2, excedente.id, {});
    assert.strictEqual(await recebidaDaLinha(linha), 11, 'o acumulador SOMA (`+ ?`)');
    assert.strictEqual(await estoqueDoMaterial(mat.id), 11);

    // (7) As DUAS literais da RN-25, pelo servico: sao elas que distinguem o pedido QUITADO do
    // pedido cujo Compras ainda NAO LANCOU as linhas — e nenhuma das duas e 'Inclua ao menos um
    // item', que e a recusa do caminho NF e nao explica nada ao operador do pedido.
    await assert.rejects(
      () => receiptService.criarRecebimento(db, ADMIN,
        { tipo_recebimento: 'PEDIDO_COMPRA', pedido_compra_id: pedido.id }),
      (e) => {
        assert.strictEqual(e.status, 400, `status errado: ${e.status} — ${e.message}`);
        assert.strictEqual(e.message, `Pedido de compra ${pedido.numero} já foi recebido por completo`);
        return true;
      },
      'pedido quitado, POST sem itens: literal propria, pelo servico');

    const semLinhas = await novoPedido([], { tag: 'E' });
    await assert.rejects(
      () => receiptService.criarRecebimento(db, ADMIN,
        { tipo_recebimento: 'PEDIDO_COMPRA', pedido_compra_id: semLinhas.id }),
      (e) => {
        assert.strictEqual(e.status, 400, `status errado: ${e.status} — ${e.message}`);
        assert.strictEqual(e.message,
          `Pedido de compra ${semLinhas.numero} não tem itens lançados no módulo Compras`);
        return true;
      },
      'dizer "recebido por completo" a um pedido que o Compras nao preencheu e MENTIRA');
  });

  await close();
  console.log(`\n${passed} passou, ${failed} falhou`);
  process.exit(failed ? 1 : 0);
})();
