/**
 * Servico do PEDIDO DE COMPRA — o modulo core Compras passa a conseguir criar um (Etapa 38, T2).
 *
 * ── O FURO QUE ISTO FECHA, medido na Fase 0 contra o dump de producao de 161 MB ───────────────
 * `COUNT(pedidos_compra) = 0` e **nao existia codigo de aplicacao que inserisse um pedido**:
 * `server/index.js:20002` era `app.get`, sem `app.post`/`app.put` para `/api/compras/pedidos` em
 * lugar nenhum, e o botao "Novo Pedido" da tela caia no `path="*"` do `App.js`. O unico escritor de
 * producao de `itens_pedido_compra` era o acumulador da Etapa 37 (`receiptService.js:1246`), que so
 * sabe SUBTRAIR de uma linha que ninguem criava. Resultado: a Etapa 37 inteira — recebimento contra
 * pedido, saldo, excedente autorizado — era **inalcancavel por um clique em qualquer ambiente**.
 *
 * ── A ROTA NAO FAZ SQL ─────────────────────────────────────────────────────────────────────────
 * Tudo aqui, por dois motivos concretos: a Task 6 (botao "Gerar pedido" da Reposicao) e a Task 4
 * (importacao de planilha) chamam `criarPedido` **direto**, sem passar por HTTP, e a Task 7 exige o
 * roteiro rodando pelas DUAS pontas — pela rota e pelo servico. Handler com SQL dentro nao tem como
 * ser chamado das duas.
 *
 * ── AS QUATRO DECISOES QUE ESTA FUNCAO CONGELA ────────────────────────────────────────────────
 *
 * 1. **`numero` e GERADO, nunca digitado** — `inserirComNumeroUnico(db, 'PC', …)` da Etapa 31. O
 *    comentario daquele helper avisava que embrulhar `pedidos_compra.numero` nele seria errado
 *    PORQUE o numero do pedido era digitado pelo comprador (e o retry reescreveria em silencio a
 *    escolha de uma pessoa). Este servico satisfaz a condicao que o aviso exige: **nao ha campo de
 *    numero na entrada**, entao nao ha escolha humana a reescrever. O comentario de `numeroDoc.js`
 *    foi corrigido nesta mesma passada dizendo que a afirmacao era verdadeira **ate esta etapa** —
 *    apagar em silencio faria o proximo leitor confiar nela de novo.
 *    Descartado: `numero` digitado com 409 na colisao (devolve ao comprador um erro que ele nao
 *    tem como resolver sozinho e reintroduz a colisao que a Etapa 31 fechou).
 *
 * 2. **`valor_total` e DERIVADO** da soma `quantidade × valor_unitario`, num `UPDATE` apos os
 *    itens. A lista de Compras mostra esse numero em destaque; aceita-lo do payload faria a tela
 *    exibir um total que nao bate com item nenhum. Descartado: confiar no payload.
 *
 * 3. **`quantidade_recebida` NAO e escrita aqui — nem como `0`.** E a coluna da Etapa 37, que so se
 *    move dentro do claim de `darEntradaEstoque` (decisao 5 de la). Ela nasce `0` pelo DEFAULT do
 *    DDL. ⚠️ Medido pela sabotagem 6 desta task: escrever `0` explicitamente **nao derruba nenhuma
 *    assercao** (o valor e o mesmo), entao a protecao real e esta proibicao escrita — a suite nao
 *    distingue "nao escreve" de "escreve 0". Nao "simplifique" o INSERT incluindo a coluna.
 *
 * 4. **O vinculo com a solicitacao de reposicao e NAO-FATAL** (RN-C13): `vincularPedidoCompra` roda
 *    DEPOIS do INSERT, em `try/catch`, e uma falha vira `vinculo_solicitacao: 'falhou'` + `warn`,
 *    com **201 assim mesmo**. O pedido ja existe no banco quando o vinculo e tentado; derrubar a
 *    resposta faria o comprador ver um erro e criar o pedido de novo — duplicando pedido real por
 *    causa de uma solicitacao que alguem cancelou no meio.
 *
 * 5. **O vinculo tem GATE DE PERFIL, e ele e CONDICIONAL** (fix 1 da Task 2, decisao do
 *    controlador revertendo a decisao 10 do design). Escrever em
 *    `solicitacoes_compra_almoxarifado` e operacao que o almoxarifado gateia por
 *    `gerenciar_reposicao` (`extended.js:1743`) — mas aquele gate vive na **rota** daquele modulo,
 *    e este servico chama `purchaseService.vincularPedidoCompra` **direto**. Sem checagem,
 *    qualquer usuario do modulo `compras` — inclusive o `PRODUCAO` do fallback de
 *    `getPerfilFromUser` — virava uma solicitacao para `VINCULADO` pela porta de Compras, e o
 *    caminho era alcancavel pela UI (botao "Gerar pedido" da Reposicao, Task 6). Medido pelo
 *    cenario (11): antes do fix, **201 com a solicitacao em `VINCULADO`**.
 *    A checagem e `can(user, 'gerenciar_reposicao')` e roda **ANTES de qualquer escrita, cabecalho
 *    incluido** — recusar depois do INSERT deixaria pedido gravado por uma chamada que foi negada.
 *    ⚠️ **Condicional de proposito:** so vale quando veio `solicitacao_id`. `POST` sem vinculo
 *    continua com a camada do modulo apenas — o modulo core Compras **nao ganha** camada de perfil
 *    propria aqui, e essa parte da decisao 10 continua de pe. Descartado: inventar perfis de
 *    Compras (`ACAO_PERFIS` proprio) para gatear a porta inteira — decidir os perfis do modulo e
 *    etapa propria, e gatear a criacao do pedido por perfil do **almoxarifado** barraria o
 *    comprador no seu proprio modulo.
 *
 * ── AS DUAS PERNAS DA REGUA DE EDICAO E EXCLUSAO (Task 3, RN-C07 e RN-C08) ────────────────────
 *
 * `atualizarPedido` e `excluirPedido` **perguntam ao recebimento** antes de mexer no pedido, e a
 * pergunta tem DUAS pernas, porque elas medem coisas diferentes:
 *
 * - **Perna 1** — alguma linha com `COALESCE(quantidade_recebida, 0) > 0`: material que JA ENTROU
 *   no estoque. Reinserir as linhas apagaria essa conta (perda de dado de estoque, irreversivel
 *   sem SQL na mao), e apagar o pedido jogaria fora o documento que explica o saldo.
 *
 * - **Perna 2** — existe `recebimentos_material_almoxarifado WHERE pedido_compra_id = ?`: o
 *   recebimento **criado e nao processado**. Pela RN-23 da Etapa 37 criar documento **nao consome
 *   saldo**, entao esse recebimento tem `quantidade_recebida` ainda **0** na linha do pedido e
 *   **passa pela perna 1**.
 *
 * ⚠️ **A perna 2 no `PUT` e o achado mais caro da revisao desta etapa, e foi MEDIDO por sonda
 * executada antes de existir codigo:** o `PUT` apaga e reinsere as linhas, e os ids novos nao sao
 * os antigos. O recebimento aberto guarda `pedido_item_id` (`schema.js:1306`, INTEGER **sem FK**
 * de proposito) apontando para a linha **antiga**. Ao processar, o acumulador da 37 e
 * `UPDATE itens_pedido_compra … WHERE id = ?` (`receiptService.js:1261-1268`) e **0 linhas
 * alteradas nao e erro em SQLite**: nao ha excecao, o `catch` nao dispara e nao sai nem `warn`. A
 * sonda mediu o fim da historia com o `PUT` de uma perna so: `processar` respondeu **200**, o
 * estoque do material foi para **6** e a linha do pedido ficou `quantidade_recebida = 0` com
 * `saldo_pendente = 10` — o pedido **ABERTO com o saldo cheio, para sempre**, oferecendo de novo
 * ao operador um material que ja chegou. Por isso o `PUT` tem as **duas** pernas, nao so a
 * primeira. Cenario (4b) de `comprasPedidoEditarExcluir.api.test.js`.
 *
 * As duas portas dao a **MESMA** frase ("ja teve recebimento") porque o fato e um so; o sufixo
 * difere porque a acao recusada difere ("nao pode mais ser editado" / "nao pode ser excluido"), e
 * o status difere por contrato: **400** no `PUT`, **409** no `DELETE`.
 *
 * Descartado: medir **so** a perna 1 (deixa apagar/editar o pedido debaixo de um recebimento
 * aberto — os dois danos acima); e `ON DELETE CASCADE` no DDL de `itens_pedido_compra` (e tabela
 * **core**, mexer no DDL dela e migration de outro modulo, e a Etapa 37 deixou `pedido_item_id`
 * sem FK **de proposito** — o recebimento continua historico valido depois de o Compras apagar a
 * linha). `excluirPedido` apaga os **filhos primeiro** e em codigo de aplicacao.
 *
 * Testes: `server/tests/api/comprasPedidoCriar.api.test.js` (Task 2),
 *         `server/tests/api/comprasPedidoEditarExcluir.api.test.js` (Task 3)
 * Plano:  `docs/superpowers/plans/2026-09-16-crm-etapa38-pedido-de-compra.md` (Tasks 2 e 3)
 */
const { dbRun, dbGet, dbAll } = require('../almoxarifado/db');
const {
  extrairDoRow, normalizarChavesDaLinha, valorCruDoRow, numeroDaPlanilha,
} = require('./planilhaCompras');
const { inserirComNumeroUnico } = require('../almoxarifado/numeroDoc');
const purchaseService = require('../almoxarifado/purchaseService');
const { can, getPerfilFromUser } = require('../almoxarifado/permissions');

/** Molde de erro traduzido (mesmo `erro()` dos servicos do almoxarifado: a rota le `.status`). */
const erro = (msg, status = 400) => Object.assign(new Error(msg), { status });

/**
 * 403 no MESMO shape de `requirePermission` (`permissions.js`): `{ error, acao, perfil }`.
 *
 * Reusar o shape nao e cosmetica — a tela do almoxarifado ja sabe ler `acao` e `perfil` para dizer
 * ao usuario QUAL permissao falta e com que perfil ele entrou. Um 403 so com `error` obrigaria o
 * client a tratar duas formas para o mesmo fato, e a segunda seria a mais pobre.
 */
const erroPermissao = (user, acao) => Object.assign(
  new Error('Sem permissão para esta operação'),
  { status: 403, acao, perfil: getPerfilFromUser(user) },
);

/** Colunas do cabecalho que o payload pode preencher — `numero` e `valor_total` NAO estao aqui. */
const COLUNAS_CABECALHO = ['data_pedido', 'previsao_entrega', 'status', 'observacoes'];

/**
 * As literais da regua, UMA por fato (contratos 3 e 4 do plano).
 *
 * `PEDIDO_NAO_ENCONTRADO` e a MESMA frase de `routes/almoxarifado/extended.js` (rota de itens da
 * Etapa 37) e de `purchaseService:62` — inventar uma segunda ("Pedido nao existe") daria duas
 * frases para um fato so, e a tela teria de tratar as duas.
 */
const PEDIDO_NAO_ENCONTRADO = 'Pedido de compra não encontrado';
const jaTeveRecebimentoEdicao = (numero) => `Pedido de compra ${numero} já teve recebimento — não pode mais ser editado`;
const jaTeveRecebimentoExclusao = (numero) => `Pedido de compra ${numero} já teve recebimento — não pode ser excluído`;

/** Perna 1 da regua: alguma linha deste pedido com material JA RECEBIDO (entrada fisica feita). */
async function linhaComRecebimento(db, pedidoId) {
  return dbGet(db, `SELECT id FROM itens_pedido_compra
    WHERE pedido_id = ? AND COALESCE(quantidade_recebida, 0) > 0 LIMIT 1`, [pedidoId]);
}

/**
 * Perna 2 da regua: existe documento de recebimento apontando para este pedido — inclusive o
 * CRIADO E NAO PROCESSADO, que pela RN-23 da Etapa 37 nao mexeu em `quantidade_recebida` nenhuma.
 *
 * ⚠️ A GUARDA DE TABELA AUSENTE NAO E PARANOIA: `recebimentos_material_almoxarifado` e do
 * ALMOXARIFADO e este e o modulo CORE Compras. Num banco que nunca subiu o modulo do almoxarifado
 * (o `initSchema` dele e que cria a tabela) a consulta morreria com `no such table` e **todo**
 * `DELETE`/`PUT` de pedido responderia 500. E o mesmo `SELECT name FROM sqlite_master` que
 * `listarPedidosCompraAux` faz do lado de la (`receiptService.js:1475`) para o caso simetrico.
 *
 * UMA funcao para as duas portas de proposito: duas copias da mesma pergunta divergiriam na
 * primeira edicao (e a re-revisao da Etapa 37 apontou justamente duplicacao de agregado como
 * smell). Quem quiser provar que as pernas medem coisas diferentes derruba o `if` de CADA porta —
 * e e assim que as sabotagens 3 e 5 da Task 3 foram feitas.
 */
async function recebimentoVinculadoAoPedido(db, pedidoId) {
  const tabela = await dbGet(db,
    "SELECT name FROM sqlite_master WHERE type='table' AND name='recebimentos_material_almoxarifado'");
  if (!tabela) return null;
  return dbGet(db,
    'SELECT id FROM recebimentos_material_almoxarifado WHERE pedido_compra_id = ? LIMIT 1', [pedidoId]);
}

/** Guarda de banco compartilhada pelo `POST` e pelo `PUT`: o fornecedor tem de existir. */
async function assertFornecedor(db, fornecedorId) {
  const fornecedor = await dbGet(db, 'SELECT id FROM fornecedores WHERE id = ?', [fornecedorId]);
  if (!fornecedor) throw erro('Fornecedor não encontrado');
}

/**
 * Le o pedido com o `fornecedor_nome` e as linhas, no formato que a rota devolve e a tela consome.
 * `ORDER BY id` nas linhas: a ordem em que foram lancadas e a que o comprador digitou.
 */
async function relerPedido(db, pedidoId) {
  const pedido = await dbGet(db, `SELECT p.*, f.razao_social as fornecedor_nome
    FROM pedidos_compra p
    LEFT JOIN fornecedores f ON p.fornecedor_id = f.id
    WHERE p.id = ?`, [pedidoId]);
  if (!pedido) return null;
  pedido.itens = await dbAll(db, `SELECT id, material_id, codigo, descricao, quantidade,
      valor_unitario, unidade, quantidade_recebida
    FROM itens_pedido_compra WHERE pedido_id = ? ORDER BY id`, [pedidoId]);
  return pedido;
}

/**
 * Resolve TODOS os materiais ANTES de qualquer INSERT.
 *
 * A ordem importa e nao e estilo: SQLite aqui roda sem transacao, entao descobrir na quarta linha
 * que o material nao existe deixaria o cabecalho e tres itens gravados, com o pedido visivel na
 * tela do comprador e incompleto. Recusar antes de escrever e o que faz o cenario (7) poder afirmar
 * `COUNT(pedidos_compra)` inalterado.
 *
 * Os campos copiados sao os que a Etapa 37 LE: `codigo`/`descricao` aparecem na linha da tela de
 * recebimento e `unidade` na conferencia. `descricao` vem de `materiais_almoxarifado.nome` (a
 * coluna `NOT NULL`), com fallback para `descricao` — nunca o contrario: `descricao` e quase sempre
 * nula no cadastro e a linha do pedido sairia em branco.
 */
async function resolverItens(db, itens) {
  const resolvidos = [];
  for (const item of itens) {
    const material = await dbGet(db,
      'SELECT id, codigo, nome, descricao, unidade FROM materiais_almoxarifado WHERE id = ?', [item.material_id]);
    if (!material) throw erro('Material não encontrado');
    resolvidos.push({
      material_id: material.id,
      codigo: material.codigo || null,
      descricao: material.nome || material.descricao || null,
      unidade: material.unidade || 'UN',
      quantidade: item.quantidade,
      valor_unitario: item.valor_unitario == null ? 0 : item.valor_unitario,
    });
  }
  return resolvidos;
}

/**
 * Cria o pedido de compra com as linhas. Entrada JA validada pelo `PedidoCompraCreateSchema`
 * (`validate()` na rota) — aqui ficam so as guardas que o Zod nao pode dar, porque dependem do
 * banco: fornecedor e material existirem.
 *
 * @param {object} db     sqlite3.Database
 * @param {object} dados  `req.body` parseado: { fornecedor_id, itens[], status?, data_pedido?,
 *                        previsao_entrega?, observacoes?, solicitacao_id? }
 * @param {object} user   usuario autenticado (usado no `warn` do vinculo; o core nao tem auditoria)
 * @returns {Promise<object>} o pedido relido, com `itens` e — se veio `solicitacao_id` —
 *                            `vinculo_solicitacao: 'ok' | 'falhou'`
 */
async function criarPedido(db, dados, user) {
  // ⚠️ ANTES DE QUALQUER ESCRITA, cabecalho incluido (decisao 5 do cabecalho deste arquivo). Nao e
  // detalhe de ordem: recusar o vinculo depois do INSERT deixaria um pedido gravado por uma
  // chamada que foi NEGADA, e o cenario (11) afirma `COUNT(pedidos_compra)` inalterado.
  const querVincular = dados.solicitacao_id !== undefined && dados.solicitacao_id !== null;
  if (querVincular && !can(user, 'gerenciar_reposicao')) throw erroPermissao(user, 'gerenciar_reposicao');

  await assertFornecedor(db, dados.fornecedor_id);

  const itensResolvidos = await resolverItens(db, dados.itens);

  // `status` so entra na lista de colunas quando VEIO: bindar `null` sobrescreveria o
  // `DEFAULT 'pendente'` do DDL com NULL, e a tela de Compras filtra por essa coluna.
  const colunas = ['numero', 'fornecedor_id'];
  const valores = [null, dados.fornecedor_id];
  for (const col of COLUNAS_CABECALHO) {
    if (dados[col] !== undefined && dados[col] !== null) { colunas.push(col); valores.push(dados[col]); }
  }

  // O `numero` e gerado DENTRO do retry (Etapa 31): o `fn` contem APENAS o INSERT do cabecalho, e
  // nada e escrito entre a geracao e ele — se o UNIQUE recusar, a tentativa seguinte repete o
  // INSERT inteiro com numero novo, e repetir os itens aqui gravaria linha duplicada.
  const { numero, resultado } = await inserirComNumeroUnico(db, 'PC', async (numeroGerado) => {
    valores[0] = numeroGerado;
    return dbRun(db, `INSERT INTO pedidos_compra (${colunas.join(', ')}) VALUES (${colunas.map(() => '?').join(', ')})`, valores);
  });
  const pedidoId = resultado.lastID;

  // ⚠️ O LACO QUE A ETAPA INTEIRA EXISTE PARA GARANTIR. O modo de falha desta etapa e o `201 ok`
  // com o pedido VAZIO: sem estas linhas a porta responde criado e o recebimento nao encontra nada
  // para receber. `quantidade_recebida` NAO esta na lista de colunas, de proposito (decisao 3 do
  // cabecalho) — ela nasce 0 pelo DEFAULT do DDL da Etapa 37.
  for (const item of itensResolvidos) {
    await dbRun(db, `INSERT INTO itens_pedido_compra
      (pedido_id, material_id, codigo, descricao, quantidade, valor_unitario, unidade)
      VALUES (?,?,?,?,?,?,?)`,
    [pedidoId, item.material_id, item.codigo, item.descricao, item.quantidade, item.valor_unitario, item.unidade]);
  }

  // `valor_total` DERIVADO — a soma das linhas que acabaram de entrar, nunca o do payload.
  const total = itensResolvidos.reduce((soma, i) => soma + (i.quantidade * i.valor_unitario), 0);
  await dbRun(db, 'UPDATE pedidos_compra SET valor_total = ? WHERE id = ?', [total, pedidoId]);

  const pedido = await relerPedido(db, pedidoId);

  if (querVincular) {
    try {
      await purchaseService.vincularPedidoCompra(db, dados.solicitacao_id, pedidoId);
      pedido.vinculo_solicitacao = 'ok';
    } catch (e) {
      // NAO-FATAL por decisao (item 4 do cabecalho): o pedido JA existe, e derrubar a resposta
      // faria o comprador cria-lo de novo. O `warn` leva os tres ids porque e a unica pista que
      // sobra de uma solicitacao que ficou sem pedido.
      console.warn(`[compras] vinculo da solicitacao ${dados.solicitacao_id} ao pedido ${numero} `
        + `(id ${pedidoId}, usuario ${user?.nome || user?.email || 'desconhecido'}) falhou: ${e.message}`);
      pedido.vinculo_solicitacao = 'falhou';
    }
  }

  return pedido;
}

/**
 * RN-C06 — le UM pedido, com o fornecedor resolvido e as linhas. E o que a tela de edicao carrega.
 *
 * ⚠️ OS DERIVADOS NAO SAO DAQUI. `saldo_pendente` e `situacao_recebimento` sao calculados por
 * `derivarRecebimentoDoPedido` (`services/almoxarifado/receiptService.js`), que **nao e exportada**
 * — e aquele arquivo e contrato de NAO-TOQUE nesta etapa. Recalcular a conta aqui daria uma segunda
 * formula de saldo do pedido, que divergiria da do almoxarifado na primeira edicao; quem precisa do
 * derivado consulta a rota que ja o publica
 * (`GET /api/almoxarifado/recebimentos-aux/pedidos-compra/:id/itens`), e o cenario (1) do teste
 * cruza as duas leituras pelo `id` da linha para provar que e o MESMO objeto. O que esta porta
 * devolve por linha inclui `quantidade_recebida` crua, que e o que a tela precisa para saber se o
 * pedido ainda e editavel.
 */
async function obterPedido(db, pedidoId) {
  const pedido = await relerPedido(db, pedidoId);
  if (!pedido) throw erro(PEDIDO_NAO_ENCONTRADO, 404);
  return pedido;
}

/**
 * RN-C07 — edita o pedido e SUBSTITUI as linhas, se e somente se o recebimento permitir.
 *
 * A ORDEM DAS OPERACOES E A REGRA, nao estilo (nao ha transacao neste modulo):
 *   1. 404 se o pedido nao existe;
 *   2. as DUAS pernas da regua (cabecalho deste arquivo) — recusa ANTES de qualquer escrita;
 *   3. fornecedor e materiais resolvidos — tambem antes, senao um material inexistente na quarta
 *      linha deixaria o pedido com o cabecalho novo e as linhas velhas apagadas;
 *   4. UPDATE do cabecalho, DELETE + INSERT das linhas, UPDATE do `valor_total` derivado.
 *
 * SO OS CAMPOS PRESENTES no payload sao escritos no cabecalho (`undefined`/`null` nao mexem na
 * coluna): o formulario da Task 5 manda o registro inteiro e limpar um campo de texto manda `''`,
 * que **e** presente e grava vazio — enquanto um chamador de servico com payload parcial (Task 6)
 * nao apaga o que nao conhece. `numero` **nao** e editavel (e do servidor desde a Task 2) e
 * `solicitacao_id`, se vier, e IGNORADO: vincular solicitacao e ato da criacao, e e la que vive o
 * gate de `gerenciar_reposicao` (fix 1 da Task 2) — aceitar o vinculo aqui abriria a mesma escrita
 * em tabela do almoxarifado por uma porta sem gate.
 *
 * ⚠️ `quantidade_recebida` NAO e escrita: as linhas novas nascem 0 pelo DEFAULT do DDL. Isso e
 * seguro exatamente porque a regua acima ja garantiu que **nao havia** recebimento nenhum.
 */
async function atualizarPedido(db, pedidoId, dados) {
  const pedido = await dbGet(db, 'SELECT id, numero FROM pedidos_compra WHERE id = ?', [pedidoId]);
  if (!pedido) throw erro(PEDIDO_NAO_ENCONTRADO, 404);

  const linhaRecebida = await linhaComRecebimento(db, pedido.id);
  const documentoVinculado = await recebimentoVinculadoAoPedido(db, pedido.id);
  if (linhaRecebida || documentoVinculado) throw erro(jaTeveRecebimentoEdicao(pedido.numero));

  await assertFornecedor(db, dados.fornecedor_id);
  const itensResolvidos = await resolverItens(db, dados.itens);

  const sets = ['fornecedor_id = ?'];
  const valores = [dados.fornecedor_id];
  for (const col of COLUNAS_CABECALHO) {
    if (dados[col] !== undefined && dados[col] !== null) { sets.push(`${col} = ?`); valores.push(dados[col]); }
  }
  const total = itensResolvidos.reduce((soma, i) => soma + (i.quantidade * i.valor_unitario), 0);
  sets.push('valor_total = ?'); valores.push(total);
  sets.push('updated_at = CURRENT_TIMESTAMP');
  valores.push(pedido.id);
  await dbRun(db, `UPDATE pedidos_compra SET ${sets.join(', ')} WHERE id = ?`, valores);

  // SUBSTITUICAO, nao merge: a tela manda a lista inteira e um `UPDATE` linha a linha exigiria que
  // o client mandasse os ids e acertasse o que sumiu — e um item removido na tela ficaria no banco.
  await dbRun(db, 'DELETE FROM itens_pedido_compra WHERE pedido_id = ?', [pedido.id]);
  for (const item of itensResolvidos) {
    await dbRun(db, `INSERT INTO itens_pedido_compra
      (pedido_id, material_id, codigo, descricao, quantidade, valor_unitario, unidade)
      VALUES (?,?,?,?,?,?,?)`,
    [pedido.id, item.material_id, item.codigo, item.descricao, item.quantidade, item.valor_unitario, item.unidade]);
  }

  return relerPedido(db, pedido.id);
}

/**
 * RN-C08 — exclui o pedido, se e somente se o recebimento permitir, e leva as LINHAS junto.
 *
 * ⚠️ OS FILHOS PRIMEIRO, e por dois motivos, nao um: no harness (`foreign_keys = 0`) apagar so a
 * cabeca deixa **linha orfa** — medido por sonda contra o codigo de hoje: o `DELETE` generico
 * respondeu `200 'Item excluído com sucesso'` e sobrou `itens_pedido_compra` apontando para pedido
 * inexistente. Em PRODUCAO a FK esta **ON** (`sqliteConcurrency.js:50`) e `itens_pedido_compra`
 * declara `FOREIGN KEY (pedido_id)` (`schema.js:1319`): la o mesmo `DELETE` **falha** com
 * `FOREIGN KEY constraint failed` -> 500 `'Erro ao excluir item'` e o pedido nao sai nunca. Dois
 * sintomas do mesmo defeito, um conserto.
 *
 * Sem transacao (o modulo nao tem): se o `DELETE` do cabecalho falhasse depois do dos itens, o
 * pedido ficaria sem linhas. Assumido de propósito — o inverso (cabeca apagada, filhos vivos) e o
 * que corrompe a leitura do almoxarifado, e a regua acima ja garantiu que **nada** foi recebido
 * contra este pedido, entao nao ha conta de estoque a perder.
 */
async function excluirPedido(db, pedidoId) {
  const pedido = await dbGet(db, 'SELECT id, numero FROM pedidos_compra WHERE id = ?', [pedidoId]);
  if (!pedido) throw erro(PEDIDO_NAO_ENCONTRADO, 404);

  const linhaRecebidaNoDelete = await linhaComRecebimento(db, pedido.id);
  const documentoVinculadoNoDelete = await recebimentoVinculadoAoPedido(db, pedido.id);
  if (linhaRecebidaNoDelete || documentoVinculadoNoDelete) throw erro(jaTeveRecebimentoExclusao(pedido.numero), 409);

  await dbRun(db, 'DELETE FROM itens_pedido_compra WHERE pedido_id = ?', [pedido.id]);
  await dbRun(db, 'DELETE FROM pedidos_compra WHERE id = ?', [pedido.id]);
  return { message: 'Pedido de compra excluído com sucesso' };
}

/**
 * RN-C09 — a BUSCA DE MATERIAL do modulo core Compras. Somente leitura, quatro colunas.
 *
 * ⚠️ POR QUE ELA EXISTE EM COMPRAS, tendo o almoxarifado uma igual: `app.use('/api/almoxarifado',
 * authenticateToken, checkModulePermission('almoxarifado'))` (`routes/almoxarifado.js:282-285`)
 * barra o PREFIXO INTEIRO antes de qualquer handler. Um comprador com o modulo `compras` e sem o
 * modulo `almoxarifado` toma 403 em `GET /api/almoxarifado/materiais` sem nunca chegar na rota, e
 * o formulario de pedido (Task 5) nao teria como escolher material. Descartado: alargar a permissao
 * do modulo almoxarifado para o comprador — daria a ele o modulo INTEIRO (estoque, movimentacao,
 * requisicao, inventario) para resolver um `<select>`.
 *
 * ⚠️ `descricao` e `COALESCE(nome, descricao)`, nesta ordem (contrato 6): em
 * `materiais_almoxarifado` quem e `NOT NULL` e **`nome`** (`schema.js:298-299`) e `descricao` e
 * quase sempre nula no cadastro real. Selecionar `descricao` crua devolveria opcoes EM BRANCO no
 * `<select>`. E a mesma ordem que `resolverItens` usa ao copiar a linha do pedido, e a mesma que o
 * resto do modulo le (`m.nome as material_nome`, `receiptService.js:100`).
 *
 * `LIMIT 50` porque o destino e um `<select>`/autocomplete: sem ele a tela carregaria o cadastro
 * inteiro. `ativo = 1` porque material desativado nao deve entrar em pedido novo — e a importacao
 * (abaixo) aplica a MESMA regra, senao a planilha compraria o que a tela nao oferece.
 */
async function buscarMateriais(db, search) {
  const termo = search == null ? '' : String(search).trim();
  const like = `%${termo}%`;
  return dbAll(db, `SELECT id, codigo, COALESCE(nome, descricao) as descricao, unidade
    FROM materiais_almoxarifado
    WHERE COALESCE(ativo, 1) = 1
      AND (? = '' OR codigo LIKE ? OR COALESCE(nome, '') LIKE ? OR COALESCE(descricao, '') LIKE ?)
    ORDER BY codigo
    LIMIT 50`, [termo, like, like, like]);
}

/**
 * ── RN-C10 e RN-C11 — A IMPORTACAO DE PEDIDOS POR PLANILHA (Task 4) ──────────────────────────
 *
 * O FURO: producao tem `COUNT(pedidos_compra) = 0`, 10 fornecedores e 3 materiais. A Task 2 deu a
 * porta de criacao de **um** pedido; carregar o que ja existe em planilha por digitacao nao vai
 * acontecer. Esta funcao recebe a planilha inteira (ja em JSON) e cria **um pedido por ordem**.
 *
 * ⚠️ CADA GRUPO PASSA PELO MESMO `criarPedido` DA TASK 2, nunca por `INSERT` direto. E exigencia
 * de escopo e tem consequencia medida: e `criarPedido` quem gera o `numero` (`PC-…`), deriva
 * `valor_total`, copia `codigo`/`descricao`/`unidade` do material e deixa `quantidade_recebida`
 * nascer 0 pelo DEFAULT. Um `INSERT` na rota daria uma SEGUNDA regra de criacao de pedido, e a
 * primeira edicao as separaria — com a importada sendo a que ninguem olha. O cenario (2) do teste
 * afirma `/^PC-/` e `valor_total` = soma justamente para que essa separacao derrube a suite.
 *
 * ⚠️ A ENTRADA E JSON, NAO `.xlsx` — e o precedente medido desta base: quem le o arquivo e o
 * NAVEGADOR (`XLSX.read` em `client/src/components/ItensFornecedor.js`, que monta `{ linhas }` e
 * faz o POST) e o servidor recebe objetos com o cabecalho em qualquer grafia, como ja faz
 * `POST /api/compras/fornecedores/:fornecedorId/itens/importar`. A literal do 400 e **copiada
 * verbatim** dela. Descartado: multer + parse de planilha no servidor (dependencia nova, e o
 * precedente ja tem um consumidor de client funcionando).
 *
 * ⚠️ LINHA RUIM VIRA `ignorados`, NUNCA linha com `material_id NULL`. As duas leituras da Etapa 37
 * (`listarPedidosCompraAux` e `carregarItensPedidoCompra`) filtram `material_id IS NOT NULL`: uma
 * linha sem material resolvido ficaria INVISIVEL ao recebimento e o pedido apareceria `ABERTO` com
 * saldo 0, sem ninguem entender por que. Melhor recusar a linha na cara do operador.
 *
 * ⚠️ NAO HA IDEMPOTENCIA (contrato 5, decisao 8 do design): `numero` e GERADO e o agrupador e da
 * planilha, entao nao existe chave para reconhecer o reenvio — **reimportar a mesma planilha cria
 * pedidos novos e duplicados**. Descartado: idempotencia por `numero` (incompativel com numero
 * gerado — o servidor nunca recebe o numero) e por hash das linhas (invisivel ao operador: o
 * segundo envio responderia "0 importados" e ele nao saberia se falhou ou se ja estava lá). O que
 * existe em troca: a resposta LISTA o que criou, e o cenario (7) do teste AFIRMA a duplicacao, para
 * que a documentacao seja verdadeira e para que um "conserto" silencioso derrube um teste.
 * O custo aceito: um duplo-clique no botao cria a planilha duas vezes, e quem reimportar tera de
 * excluir os pedidos a mao (o `DELETE` da Task 3 existe, e recusa o que ja teve recebimento).
 *
 * ⚠️ MAIS DE 50 PEDIDOS NUMA IMPORTACAO NAO APARECEM TODOS no `<select>` do recebimento:
 * `listarPedidosCompraAux` termina em `ORDER BY p.created_at DESC LIMIT 50`
 * (`receiptService.js:1518`) e `created_at` tem resolucao de 1 segundo, entao uma importacao
 * inteira EMPATA no `ORDER BY`. Esta e a primeira porta da base capaz de criar 60 pedidos num
 * clique. **Nao se conserta aqui** (a paginacao e porta da Etapa 37, arquivo de nao-toque desta
 * etapa): esta declarado no guia, na letra G do doc de novidades e o roteiro manual usa planilha
 * pequena.
 *
 * @param {object} db     sqlite3.Database
 * @param {object} corpo  `req.body`: `{ linhas: [...] }` ou `{ rows: [...] }`
 * @param {object} user   usuario autenticado (repassado a `criarPedido`)
 * @returns {Promise<{pedidos: Array<{id:number,numero:string,itens:number}>, itens:number,
 *                    ignorados: Array<{linha:number,motivo:string}>}>}
 */

/** Literal do 400, COPIADA VERBATIM do precedente (`routes/compras.js`, importacao de itens). */
const CORPO_PLANILHA_INVALIDO = 'Envie "linhas" ou "rows" com array de objetos (qualquer formato de planilha)';

/** Os quatro motivos de `ignorados` (contrato 5), UM por fato. Cada um tem cenario proprio. */
const MOTIVO_QUANTIDADE_INVALIDA = 'quantidade inválida';
const MOTIVO_SEM_CODIGO = 'linha sem código de material';
const MOTIVO_FORNECEDOR_NAO_ENCONTRADO = 'fornecedor não encontrado';

/**
 * As grafias de cabecalho aceitas, por campo (contrato 5, com as variantes de acento/caixa que o
 * `normalizarChavesDaLinha` do chamador ja resolve em minuscula).
 *
 * `CHAVES_CODIGO` NAO inclui `material`/`descricao` de proposito: a resolucao aqui e por CODIGO
 * (`materiais_almoxarifado.codigo` e UNIQUE) e aceitar a coluna de descricao faria a importacao
 * casar material por texto livre — exatamente o erro que o `material_id IS NOT NULL` da Etapa 37
 * pune depois, e em silencio.
 */
const CHAVES_GRUPO = ['pedido', 'numero', 'número', 'oc', 'ordem', 'ordem de compra', 'pedido de compra'];
const CHAVES_FORNECEDOR_ID = ['fornecedor_id', 'fornecedor id', 'id do fornecedor'];
const CHAVES_FORNECEDOR_TEXTO = ['cnpj', 'fornecedor', 'razao_social', 'razao social', 'razão social', 'fornecedor_nome'];
const CHAVES_CODIGO = ['codigo', 'código', 'cod', 'sku', 'codigo_material', 'codigo do material'];
const CHAVES_QUANTIDADE = ['quantidade', 'qtd', 'qtde', 'quant', 'qtd.'];
const CHAVES_VALOR = ['valor_unitario', 'valor unitario', 'valor unitário', 'preco', 'preço',
  'preco unitario', 'preço unitario', 'preco unitário', 'preço unitário', 'preco_unitario',
  'valor', 'valor unit', 'preco unit', 'vlr'];
const CHAVES_PREVISAO = ['previsao', 'previsão', 'previsao_entrega', 'previsão_entrega',
  'entrega', 'data de entrega', 'previsao de entrega'];

/**
 * Planilha sem coluna de ordem: TUDO vira um pedido so (e a observacao diz isso).
 *
 * `Symbol` e nao string porque a chave do `Map` de grupos vem da PLANILHA: qualquer sentinela de
 * texto (`''`, `'__sem__'`) poderia colidir com uma ordem chamada assim e juntar duas ordens numa.
 * (E a primeira forma tentada foi um escape de NUL dentro da string, que o editor gravou como BYTE
 * NUL DE VERDADE no arquivo: o `grep` passou a tratar o fonte como BINARIO e a regra de ancoragem
 * das sabotagens desta base — `grep -cF '<ancora>'` — deixa de ser confiavel. Registrado aqui, em
 * palavras e sem o escape, para ninguem tentar de novo.)
 */
const SEM_AGRUPADOR = Symbol('sem-agrupador');

/**
 * O material e resolvido pelo CODIGO, e so se estiver ATIVO — a mesma regra de `buscarMateriais`.
 * Material desativado da o MESMO motivo de "nao encontrado": para o comprador o fato e um so (esse
 * codigo nao entra em pedido novo), e duas frases para um fato e o que esta base aprendeu a nao
 * fazer. `COALESCE(ativo, 1)` porque a coluna e `DEFAULT 1` e linhas antigas podem ter NULL.
 */
async function resolverMaterialPorCodigo(db, codigo) {
  return dbGet(db, `SELECT id FROM materiais_almoxarifado
    WHERE UPPER(codigo) = UPPER(?) AND COALESCE(ativo, 1) = 1`, [codigo]);
}

/**
 * Resolve o fornecedor de UMA linha: por `fornecedor_id` se vier numero, senao pelo CNPJ (somente
 * digitos dos dois lados — a planilha traz mascara e o cadastro nem sempre) ou pela razao
 * social/nome fantasia exatos, sem distincao de caixa.
 *
 * `ORDER BY id LIMIT 1` resolve o empate (dois fornecedores com a mesma razao social) pelo mais
 * antigo, de proposito e declarado: recusar a linha por ambiguidade travaria a importacao inteira
 * de quem tem cadastro duplicado, e o pedido importado e editavel (Task 3) enquanto nao houver
 * recebimento.
 */
async function resolverFornecedorDaLinha(db, row) {
  const idDaPlanilha = numeroDaPlanilha(valorCruDoRow(row, ...CHAVES_FORNECEDOR_ID));
  if (idDaPlanilha != null && Number.isInteger(idDaPlanilha) && idDaPlanilha > 0) {
    const porId = await dbGet(db, 'SELECT id FROM fornecedores WHERE id = ?', [idDaPlanilha]);
    if (porId) return porId;
  }
  const texto = extrairDoRow(row, ...CHAVES_FORNECEDOR_TEXTO);
  if (!texto) return null;
  const digitos = texto.replace(/\D/g, '');
  return dbGet(db, `SELECT id FROM fornecedores
    WHERE (? <> '' AND REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(cnpj, ''), '.', ''), '/', ''), '-', ''), ' ', '') = ?)
       OR UPPER(razao_social) = UPPER(?)
       OR UPPER(COALESCE(nome_fantasia, '')) = UPPER(?)
    ORDER BY id LIMIT 1`, [digitos, digitos, texto, texto]);
}

async function importarPedidos(db, corpo, user) {
  // A MESMA guarda e a MESMA literal do precedente: corpo sem `linhas`/`rows`, com valor que nao e
  // array, ou com array vazio -> 400. Zod ficou FORA desta porta de proposito: o payload e uma
  // planilha de forma desconhecida (e por isso ha 7 listas de grafias acima), e um schema aqui
  // responderia `'Dados inválidos — …'` no lugar da literal congelada que o client ja mostra.
  const linhas = (corpo && (corpo.linhas || corpo.rows)) || null;
  if (!Array.isArray(linhas) || linhas.length === 0) throw erro(CORPO_PLANILHA_INVALIDO);

  const ignorados = [];
  // `Map` e nao objeto: a ordem de insercao e a ordem das ORDENS na planilha, e e ela que a
  // resposta devolve (o cenario (2) afirma `pedidos[0]` = OC-A, a primeira que apareceu).
  const grupos = new Map();

  for (let i = 0; i < linhas.length; i++) {
    const numeroDaLinha = i + 1; // 1-based: a linha 1 e a PRIMEIRA DE DADOS — o cabecalho foi
    // consumido pelo `XLSX` do navegador e nunca chega aqui. E o numero que a resposta devolve em
    // `ignorados`, e o guia diz ao operador que ele conta a partir da primeira linha de dados.
    const row = normalizarChavesDaLinha(linhas[i]);

    // ⚠️ O AGRUPADOR E A COLUNA DA PLANILHA, nunca o `numero` gerado: o `PC-…` sai do servidor
    // DEPOIS, um por grupo — agrupar por ele daria um pedido por LINHA (e a sabotagem 2 desta task
    // mede exatamente isso: `pedidos.length` iria de 2 para 5).
    const chaveGrupo = extrairDoRow(row, ...CHAVES_GRUPO) || SEM_AGRUPADOR;

    const codigo = extrairDoRow(row, ...CHAVES_CODIGO);
    if (!codigo) { ignorados.push({ linha: numeroDaLinha, motivo: MOTIVO_SEM_CODIGO }); continue; }

    // ⚠️ QUANTIDADE LIDA CRUA (`valorCruDoRow` + `numeroDaPlanilha`), NUNCA por `extrairDoRow` +
    // `parsePrecoBackend`: aqueles dois sao de PRECO em pt-BR e transformariam `1.5` em **15** na
    // coluna que a Etapa 37 le como `quantidade_pedida`. Cenario (6) do teste.
    const quantidade = numeroDaPlanilha(valorCruDoRow(row, ...CHAVES_QUANTIDADE));
    if (quantidade == null || !(quantidade > 0)) {
      ignorados.push({ linha: numeroDaLinha, motivo: MOTIVO_QUANTIDADE_INVALIDA }); continue;
    }

    const material = await resolverMaterialPorCodigo(db, codigo);
    if (!material) {
      ignorados.push({ linha: numeroDaLinha, motivo: `material não encontrado pelo código ${codigo}` });
      continue;
    }

    // Preco AUSENTE nao recusa a linha (pedido sem preco fechado e caso real, decisao da Task 2) —
    // vira 0, e a tela avisa que sem preco o custo medio do material nao e alimentado no
    // recebimento. Negativo tambem vira 0: `PedidoCompraItemSchema` recusaria o grupo INTEIRO por
    // uma celula, e perder 30 linhas boas por um sinal de menos e pior que zerar uma.
    const valorLido = numeroDaPlanilha(valorCruDoRow(row, ...CHAVES_VALOR));
    const valorUnitario = valorLido != null && valorLido > 0 ? valorLido : 0;

    if (!grupos.has(chaveGrupo)) grupos.set(chaveGrupo, { chave: chaveGrupo, linhas: [] });
    grupos.get(chaveGrupo).linhas.push({
      numeroDaLinha,
      row,
      item: { material_id: material.id, quantidade, valor_unitario: valorUnitario },
    });
  }

  const pedidos = [];
  let itensImportados = 0;

  for (const grupo of grupos.values()) {
    // O fornecedor e do GRUPO, resolvido pela PRIMEIRA linha que consiga resolve-lo: e comum a
    // planilha trazer o CNPJ so na primeira linha da ordem e deixar as outras em branco. Se
    // nenhuma resolver, o grupo nao nasce e TODAS as suas linhas aparecem em `ignorados` — uma
    // entrada por linha, para o operador achar cada uma na planilha dele.
    let fornecedor = null;
    for (const l of grupo.linhas) {
      fornecedor = await resolverFornecedorDaLinha(db, l.row);
      if (fornecedor) break;
    }
    if (!fornecedor) {
      for (const l of grupo.linhas) {
        ignorados.push({ linha: l.numeroDaLinha, motivo: MOTIVO_FORNECEDOR_NAO_ENCONTRADO });
      }
      continue;
    }

    const previsao = grupo.linhas.map((l) => extrairDoRow(l.row, ...CHAVES_PREVISAO)).find((v) => v) || null;
    // A observacao registra o agrupador da planilha: e a UNICA pista de qual ordem virou qual
    // `PC-…` depois da importacao, e o roteiro de teste manual confere por ela.
    const observacoes = grupo.chave === SEM_AGRUPADOR
      ? 'Importado de planilha (sem coluna de pedido)'
      : `Planilha: ${grupo.chave}`;

    try {
      const pedido = await criarPedido(db, {
        fornecedor_id: fornecedor.id,
        itens: grupo.linhas.map((l) => l.item),
        observacoes,
        ...(previsao ? { previsao_entrega: previsao } : {}),
      }, user);
      pedidos.push({ id: pedido.id, numero: pedido.numero, itens: (pedido.itens || []).length });
      itensImportados += (pedido.itens || []).length;
    } catch (e) {
      // Caminho de defesa, nao caminho de contrato: fornecedor e materiais do grupo acabaram de ser
      // resolvidos, entao as guardas de `criarPedido` ja passaram. Se ainda assim ele recusar (um
      // material apagado no meio da importacao, uma coluna que mudou), o grupo vira `ignorados` com
      // a mensagem do servico — e os OUTROS grupos continuam. Derrubar a resposta inteira faria o
      // operador perder o que ja gravou e reimportar tudo (e sem idempotencia, duplicando).
      for (const l of grupo.linhas) ignorados.push({ linha: l.numeroDaLinha, motivo: e.message });
    }
  }

  // `ignorados` sai na ORDEM DA PLANILHA: as recusas de linha nascem no primeiro laco e as de
  // grupo (fornecedor) no segundo, entao sem esta ordenacao a lista sairia fora de ordem e o
  // operador teria de caçar as linhas na planilha dele.
  ignorados.sort((a, b) => a.linha - b.linha);

  return { pedidos, itens: itensImportados, ignorados };
}

module.exports = {
  criarPedido,
  relerPedido,
  obterPedido,
  atualizarPedido,
  excluirPedido,
  buscarMateriais,
  importarPedidos,
  PEDIDO_NAO_ENCONTRADO,
  CORPO_PLANILHA_INVALIDO,
  MOTIVO_QUANTIDADE_INVALIDA,
  MOTIVO_SEM_CODIGO,
  MOTIVO_FORNECEDOR_NAO_ENCONTRADO,
};
