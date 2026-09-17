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
  extrairDoRow, normalizarChavesDaLinha, valorCruDoRow, numeroDaPlanilha, dataDaPlanilha,
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

/** As duas colunas `DATE` do cabecalho — ver `camposDoCabecalho`. */
const COLUNAS_DATA = ['data_pedido', 'previsao_entrega'];

/**
 * Os campos do cabecalho que ESTA chamada escreve, com uma regra a mais para as colunas `DATE`.
 *
 * ── POR QUE `''` NAO PODE CHEGAR AO `INSERT` (onda de correcao, F3: achados I1/UX e I2/RN) ────
 * A guarda original pulava `undefined` e `null` e **nao** pulava `''` — e o formulario manda `''`
 * SEMPRE (`PedidoCompraForm.js:85` nasce vazio e o payload inclui o campo sem condicao). Sonda
 * executada: gravava TEXT `''` numa coluna declarada `DATE`, e o efeito nao e cosmetico:
 * `WHERE previsao_entrega < date('now')` **inclui** `''` (o alerta de atraso, que e etapa propria,
 * nasceria acusando justamente os pedidos SEM previsao) e `WHERE previsao_entrega IS NULL` **nao**
 * o pega. Na migracao para Postgres do roadmap, `date` recusa `''` com erro de sintaxe.
 *
 * `''` numa coluna de data vira **NULL** (e nao "campo ausente") de proposito: no `PUT` e assim que
 * o comprador LIMPA a previsao pela tela. Para `observacoes`/`status`, `''` continua sendo valor
 * presente — limpar um texto e apaga-lo, e essa parte do contrato da Task 3 nao muda.
 *
 * O schema (`schemas.js`) ja faz `'' -> null` na porta HTTP; esta e a mesma regra para quem chama o
 * SERVICO direto (importacao da T4, Reposicao da T6). Duas entradas, duas guardas.
 */
function camposDoCabecalho(dados) {
  const campos = [];
  for (const col of COLUNAS_CABECALHO) {
    const bruto = dados[col];
    // AUSENTE nunca mexe na coluna — e o que permite ao chamador de servico com payload parcial
    // (Reposicao, importacao) nao apagar o que ele nao conhece.
    if (bruto === undefined) continue;
    const ehData = COLUNAS_DATA.includes(col);
    // ⚠️ NUMA COLUNA DE DATA, `''` e `null` significam a MESMA coisa — LIMPAR —, e as duas gravam
    // NULL. E o gesto da tela: o schema converte o `''` do `<input type="date">` vazio em `null`
    // (`schemas.js`), entao se `null` fosse tratado como "ausente" o comprador NAO CONSEGUIRIA
    // apagar uma previsao pelo `PUT` — o campo voltaria com o valor antigo e ninguem entenderia.
    if (ehData) { campos.push([col, bruto === '' ? null : bruto]); continue; }
    // Fora das datas, `null` continua sendo "nao mexe": `status = NULL` sobrescreveria o
    // `DEFAULT 'pendente'` do DDL, e a tela de Compras filtra por essa coluna.
    if (bruto === null) continue;
    campos.push([col, bruto]);
  }
  return campos;
}

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

/**
 * TERCEIRA PONTA DO `DELETE`, e ela foi criada por esta etapa: a SOLICITACAO da reposicao.
 *
 * ── O QUE ESTAVA FURADO (achado I1 da revisao final, reproduzido por sonda executada) ─────────
 * `criarPedido` com `solicitacao_id` poe a solicitacao em `VINCULADO` com `pedido_compra_id = N`.
 * `excluirPedido` apagava o pedido N e **nao tocava** na solicitacao: ela ficava `VINCULADO`
 * apontando para um id que nao existe mais. Consequencias tracadas nas duas pontas:
 * - `ReposicaoAlmoxarifado.js:849` so oferece "Gerar pedido" em `status === 'PENDENTE'`, entao a
 *   solicitacao pendurada **nao tinha mais como virar outro pedido**;
 * - `:839` pinta o badge VERDE para `VINCULADO` — a tela AFIRMAVA que ela tem pedido, e nao tinha;
 * - `purchaseService.fecharSolicitacoesDoPedido` nunca dispara para um pedido inexistente, entao
 *   ela **nunca** chegaria a `RECEBIDA`;
 * - a unica recuperacao era o almoxarife CANCELAR a solicitacao e esperar a reposicao regerar, e
 *   nada na tela dizia isso.
 *
 * ── A DECISAO: liberar, nao recusar ───────────────────────────────────────────────────────────
 * O `DELETE` devolve a solicitacao ao pipeline (`PENDENTE`, `pedido_compra_id = NULL`) e a resposta
 * conta quantas (`solicitacoes_liberadas`). Descartado: uma TERCEIRA perna de 409 recusando o
 * `DELETE` — forcaria o comprador a cancelar a solicitacao do almoxarifado para poder desfazer um
 * pedido que ele acabou de criar errado, e cancelar e ato de outro modulo e de outro perfil.
 *
 * ⚠️ `AND status NOT IN ('RECEBIDA','CANCELADA')`: estado TERMINAL nao ressuscita. Uma solicitacao
 * `CANCELADA` que aponte para este pedido voltaria a `PENDENTE` e a reposicao ofereceria de novo
 * um pedido que o almoxarife tinha cancelado a mao. `RECEBIDA` e inalcancavel por aqui (para
 * chegar la houve recebimento processado, e a perna 2 da regua recusa o `DELETE` para sempre) —
 * a clausula cobre as duas pelo mesmo motivo: o ponteiro pendurado de uma linha terminal e
 * HISTORICO, e o que esta perna conserta e o ciclo travado, nao a coluna.
 *
 * ⚠️ A GUARDA DE TABELA AUSENTE, pelo mesmo motivo de `recebimentoVinculadoAoPedido`: este e o
 * modulo CORE e `solicitacoes_compra_almoxarifado` e do almoxarifado. Num banco que nunca subiu o
 * modulo, todo `DELETE` de pedido responderia 500 `no such table`.
 */
async function liberarSolicitacoesDoPedido(db, pedidoId) {
  const tabela = await dbGet(db,
    "SELECT name FROM sqlite_master WHERE type='table' AND name='solicitacoes_compra_almoxarifado'");
  if (!tabela) return 0;
  const r = await dbRun(db, `UPDATE solicitacoes_compra_almoxarifado
    SET status = 'PENDENTE', pedido_compra_id = NULL
    WHERE pedido_compra_id = ? AND status NOT IN ('RECEBIDA','CANCELADA')`, [pedidoId]);
  return r.changes || 0;
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
  for (const [col, valor] of camposDoCabecalho(dados)) { colunas.push(col); valores.push(valor); }

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
  // Etapa 39, onda de correcao F4 — `teve_recebimento` e o que a TELA precisa saber ANTES de
  // montar o formulario de edicao. Ate aqui ela so tinha `quantidade_recebida` por linha, que e a
  // perna 1 da regua e NAO cobre a perna 2 (documento de recebimento criado e ainda nao
  // processado, que pela RN-23 da Etapa 37 nao mexeu em `quantidade_recebida` nenhuma): o
  // comprador preenchia o formulario inteiro, clicava em Salvar e so entao levava o 400.
  //
  // ⚠️ DERIVADO das MESMAS duas funcoes que a guarda do `PUT`/`DELETE` chama, nunca uma terceira
  // consulta parecida — se as pernas divergissem, a tela habilitaria o que o servidor recusa (ou
  // o contrario, que e pior: campo desabilitado sem motivo). Quem decide continua sendo o backend.
  // 0|1 NUMERO, nao boolean: e o mesmo contrato de `atrasado`/`dias_atraso` da rota de listagem, e
  // o SQLite nao tem boolean.
  const linhaRecebida = await linhaComRecebimento(db, pedido.id);
  const documentoVinculado = await recebimentoVinculadoAoPedido(db, pedido.id);
  return { ...pedido, teve_recebimento: (linhaRecebida || documentoVinculado) ? 1 : 0 };
}

/**
 * Etapa 39, onda de correcao F4 (achado I1 da revisao de regra de negocio) — a ÚNICA saida do beco
 * da RN-D12: escrever `status` sem tocar em NENHUMA linha de item.
 *
 * ── O BECO ────────────────────────────────────────────────────────────────────────────────────
 * Todo pedido recebido pelo almoxarifado depois da data prometida fica "Atrasado" PARA SEMPRE: o
 * `processar` da Etapa 37 nao escreve `pedidos_compra.status` (decisao 4 da E37, RN-24), entao o
 * CORE continua `pendente`, o badge cresce sem teto, o pedido mora dentro de `?atrasados=1` (que e
 * a feature-titulo da etapa) e o cartao da central nunca esvazia. E o usuario NAO tinha gesto de
 * tela que corrigisse: o `PUT` com `status:'recebido'` bate na guarda da Etapa 38 e volta 400.
 *
 * ── POR QUE UMA PORTA NOVA E NAO AFROUXAR A GUARDA ────────────────────────────────────────────
 * `atualizarPedido` faz, incondicionalmente e DEPOIS da guarda, `DELETE FROM itens_pedido_compra`
 * + `INSERT` das linhas — e o `INSERT` omite `quantidade_recebida`, que e `REAL DEFAULT 0`. Um
 * `PUT` que apenas pulasse a guarda, mesmo com corpo "so status", zeraria o recebido: o
 * `?pendentes=1` da Etapa 37 voltaria a mostrar o pedido ABERTO com o saldo inteiro, o operador
 * receberia o mesmo material DUAS vezes (estoque dobrado, conta a pagar duplicada) e os ids de
 * linha novos deixariam o acumulador da 37 fazendo `UPDATE … WHERE id = ?` em 0 linhas — que em
 * SQLite nao e erro, nao lanca e nao loga. Reproduzido pelo revisor; e o achado C1 da Etapa 38
 * voltando inteiro.
 *
 * Havia ainda um obstaculo de contrato: o `PUT` usa o `PedidoCompraCreateSchema`, que exige
 * `fornecedor_id` e `itens.min(1)` — "corpo que muda so o status" NAO e detectavel por quais
 * chaves vieram. Seria codigo novo de comparacao de multiconjunto, nao um relaxamento.
 *
 * ── O CONTRATO DESTA FUNCAO ───────────────────────────────────────────────────────────────────
 * UM `UPDATE` de UMA coluna (mais `updated_at`), permitido COM ou SEM recebimento — e essa
 * permissao e o ponto: o pedido preso no beco e, por definicao, um pedido COM recebimento.
 * `itens_pedido_compra` nao e lida nem escrita aqui, e e isso que torna a saida reversivel.
 * 404 `Pedido de compra não encontrado` (a MESMA literal das outras portas). Resposta enxuta
 * `{ id, numero, status }`: quem precisa do pedido inteiro ja tem o `GET /:id`, e devolver o
 * `relerPedido` daria a impressao de que esta porta escreve mais do que escreve.
 *
 * ⚠️ A VALIDACAO DO `status` E DA PORTA (Zod, `STATUS_PEDIDO_COMPRA`), nao daqui — mesma divisao
 * do `criarPedido`/`atualizarPedido`. Nao ha segunda lista de 7 status neste arquivo de proposito:
 * duas listas divergiriam na primeira edicao e a literal do 400 sairia diferente em cada porta.
 */
async function alterarStatusPedido(db, pedidoId, status) {
  const pedido = await dbGet(db, 'SELECT id, numero FROM pedidos_compra WHERE id = ?', [pedidoId]);
  if (!pedido) throw erro(PEDIDO_NAO_ENCONTRADO, 404);
  await dbRun(db, 'UPDATE pedidos_compra SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    [status, pedido.id]);
  return { id: pedido.id, numero: pedido.numero, status };
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
 * SO OS CAMPOS PRESENTES no payload sao escritos no cabecalho — quem decide e `camposDoCabecalho`:
 * `undefined` nunca mexe na coluna (e o que protege o chamador de servico com payload parcial, como
 * a Task 6), `''` num campo de TEXTO grava vazio (limpar a observacao pela tela), e `''`/`null`
 * numa coluna de DATA gravam **NULL**.
 *
 * ⚠️ Esta ultima frase CORRIGE o que este comentario dizia ate a onda de correcao ("`undefined`/
 * `null` nao mexem na coluna"): virou falsa no F3 e a diferenca e visivel na tela. Com `null`
 * tratado como ausente, o comprador NAO conseguiria apagar uma previsao de entrega — o
 * `<input type="date">` vazio manda `''`, o schema o converte em `null`, e o `PUT` devolveria o
 * valor ANTIGO sem erro nenhum. `numero` **nao** e editavel (e do servidor desde a Task 2) e
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
  for (const [col, valor] of camposDoCabecalho(dados)) { sets.push(`${col} = ?`); valores.push(valor); }
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
 * RN-C08 — exclui o pedido, se e somente se o recebimento permitir, e leva as LINHAS junto — e
 * LIBERA a solicitacao da reposicao (`liberarSolicitacoesDoPedido`, achado I1 da revisao final:
 * antes disso a solicitacao ficava `VINCULADO` apontando para o pedido apagado e nunca mais virava
 * pedido nenhum).
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
  // ⚠️ AS SOLICITACOES ANTES DO CABECALHO, e a ordem e a mesma regra dos filhos: em PRODUCAO a FK
  // esta ON e a sequencia itens -> solicitacoes -> cabecalho e a unica que nao deixa nada
  // apontando para um pedido que ja nao existe no meio do caminho.
  const solicitacoesLiberadas = await liberarSolicitacoesDoPedido(db, pedido.id);
  await dbRun(db, 'DELETE FROM pedidos_compra WHERE id = ?', [pedido.id]);
  return {
    message: 'Pedido de compra excluído com sucesso',
    // A contagem sai na resposta porque apagar um pedido MUDA o estado de outro modulo: quem clicou
    // na lixeira precisa saber que a solicitacao da reposicao voltou para a fila.
    solicitacoes_liberadas: solicitacoesLiberadas,
  };
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
 *                    ignorados: Array<{linha:number,motivo:string}>,
 *                    avisos: Array<{linha:number,campo:string,motivo:string}>}>}
 *          `ignorados` = a linha NAO entrou; `avisos` = a linha entrou com um campo em branco
 *          (onda de correcao, F3).
 */

/** Literal do 400, COPIADA VERBATIM do precedente (`routes/compras.js`, importacao de itens). */
const CORPO_PLANILHA_INVALIDO = 'Envie "linhas" ou "rows" com array de objetos (qualquer formato de planilha)';

/** Os quatro motivos de `ignorados` (contrato 5), UM por fato. Cada um tem cenario proprio. */
const MOTIVO_QUANTIDADE_INVALIDA = 'quantidade inválida';
const MOTIVO_SEM_CODIGO = 'linha sem código de material';
const MOTIVO_FORNECEDOR_NAO_ENCONTRADO = 'fornecedor não encontrado';

/**
 * ── `avisos`: A LINHA ENTROU, MAS UM CAMPO NAO FOI ENTENDIDO (onda de correcao, F3) ────────────
 *
 * Terceiro array da resposta, ao lado de `pedidos` e `ignorados`, e a separacao e a regra: a data e
 * INFORMATIVA. Recusar a linha porque a celula de previsao veio `'a combinar'` jogaria fora o item
 * comprado — e mandar a celula crua para a coluna `DATE` era o defeito que o F3 conserta. Entao a
 * linha entra, o campo vira `null`, e o operador **sabe qual celula arrumar**.
 *
 * Um motivo por CAMPO, e o `campo` vem na entrada: a tela lista `{linha, campo, motivo}` e o
 * comprador acha a celula na planilha dele sem adivinhar.
 */
const AVISO_PREVISAO_NAO_RECONHECIDA = 'previsão de entrega não reconhecida (use AAAA-MM-DD ou DD/MM/AAAA)';
const AVISO_DATA_PEDIDO_NAO_RECONHECIDA = 'data do pedido não reconhecida (use AAAA-MM-DD ou DD/MM/AAAA)';

/**
 * HOJE, no FUSO DO NEGOCIO (`America/Sao_Paulo`) — o `data_pedido` de quem importa sem coluna de
 * data, e o `hoje` da regua de atraso (`derivarAtraso`).
 *
 * ⚠️ NAO e `new Date().toISOString().slice(0,10)` e nao e o `date('now')` do SQLite: os dois dao
 * **UTC**, e no fuso do Brasil (UTC-3) uma importacao feita depois das 21h gravaria o pedido com a
 * data de AMANHA. A coluna e lida por gente (a aba Pedidos mostra `Data Pedido`), entao o dia tem
 * de ser o dia de quem clicou.
 *
 * ⚠️ ESTA FUNCAO NAO USA MAIS OS GETTERS LOCAIS (`getFullYear`/`getMonth`/`getDate`), e o motivo e
 * medido, nao estetico (achado C1 da revisao final da Etapa 39). O comentario antigo dizia "data
 * LOCAL do servidor" e a premissa era que o servidor roda no fuso do Brasil — **em producao ele nao
 * roda**: o runtime e `node:20-alpine` (`Dockerfile:24`) **sem `tzdata` e sem `ENV TZ`**, e a
 * `DEPLOY_COOLIFY.md:137` diz com todas as letras que nao ha variavel de ambiente a configurar.
 * Sem base de fusos e sem `TZ`, o Node resolve o fuso local como **UTC** — e ai os getters locais
 * viravam, caractere por caractere, o `toISOString().slice(0,10)` que o paragrafo acima proibe.
 * Consequencia reproduzida: as 21:30 BRT de 16/09 o contêiner ja acha que e 17/09, e um pedido que
 * vence HOJE aparece "Atrasado ha 1 dia" na aba, entra no filtro `Só atrasados`, sai no Excel que
 * vai para o fornecedor e dispara e-mail — que, pelo dedupe, e o UNICO que aquele pedido geraria.
 *
 * O recorte agora e por `Intl.DateTimeFormat` com `timeZone: FUSO_PADRAO`, cuja base de fusos vem
 * do **ICU embutido no Node**, nao do sistema de arquivos: a regua passa a independer do relogio e
 * do `TZ` do processo. `en-CA` porque e o locale cujo formato numerico ja e `AAAA-MM-DD`.
 * O `ENV TZ=America/Sao_Paulo` + `tzdata` do `Dockerfile` continua sendo feito (belt-and-braces,
 * para logs e para qualquer outro `new Date()` do processo), mas esta funcao nao depende dele.
 *
 * ⚠️ `require` LAZY de `auditFiltros`: mesma convencao do `alertRegistry`, e aqui ha um motivo a
 * mais — este e o modulo CORE Compras requerendo uma constante do ALMOXARIFADO. Medido hoje o ciclo
 * NAO fecha (`auditFiltros` nao requer nada), mas o require de topo e que congelaria a ordem de
 * carga entre os dois modulos. O custo do lazy e o cache do `require`, ou seja, nenhum.
 */
function hojeLocalISO(agora = new Date()) {
  const { FUSO_PADRAO } = require('../almoxarifado/auditFiltros');
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: FUSO_PADRAO, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(agora);
}

/** `AAAA-MM-DD` -> instante UTC de meia-noite, para subtrair data-only de data-only. */
const meiaNoiteUTC = (iso) => {
  const [ano, mes, dia] = iso.split('-').map(Number);
  return Date.UTC(ano, mes - 1, dia);
};

/**
 * Etapa 39 (D3, RN-D04/RN-D05/RN-D11) — a régua ÚNICA de atraso do sistema.
 *
 * DOIS consumidores, e é por isso que ela mora aqui e não na rota: `GET /api/compras/pedidos`
 * (routes/compras.js) e a entrada PEDIDO_COMPRA_ATRASADO do `alertRegistry` do almoxarifado.
 * Escrever a lista de status duas vezes é o erro que a RN-D11 existe para pegar — a tela diria
 * "atrasado" para um conjunto e o e-mail sairia para outro, e ninguém cruzaria os dois.
 *
 * ⚠️ `hoje` vem de `hojeLocalISO`, que recorta o dia em `America/Sao_Paulo` por `Intl` — NUNCA
 * `date('now')` do SQLite, nem `toISOString()`, nem os getters locais de `Date` (o contêiner de
 * produção não tem `TZ`: ver o cabeçalho de `hojeLocalISO`). Os três dão UTC lá, e no fuso do
 * Brasil acusariam atraso ~3h antes da meia-noite local. As 4 varreduras
 * da feature 20 que ainda usam `date('now')` estão nomeadas no design (seção 8) e NÃO são
 * consertadas aqui — esta entrada apenas não as imita.
 *
 * ⚠️ `<` e não `<=`: "vence hoje" NÃO está atrasado (RN-D05b). Mesmo precedente de
 * `FerramentasAlmoxarifado.js:416-422` (achado F4 da revisão de branch).
 *
 * `dias_atraso` é `null` — nunca 0 — quando não há atraso: "0 dias de atraso" e "não atrasado"
 * não podem ser o mesmo valor, ou o badge da tela renderiza "Atrasado há 0 dias".
 *
 * ⚠️ O guarda de `previsao_entrega` é a REGEX, e não um `IS NOT NULL`: a base tem linhas com a
 * string VAZIA gravada numa coluna `DATE` (até a onda F3 da Etapa 38 o formulário mandava `''`
 * sempre). `''` e `null` são o mesmo caso aqui — sem previsão, sem atraso.
 */
const STATUS_PEDIDO_FORA_DO_ATRASO = ['recebido', 'cancelado', 'rejeitado'];

function derivarAtraso(pedido, hoje = hojeLocalISO()) {
  const semAtraso = { atrasado: 0, dias_atraso: null };
  if (!pedido) return semAtraso;
  const previsao = String(pedido.previsao_entrega || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(previsao)) return semAtraso;
  if (STATUS_PEDIDO_FORA_DO_ATRASO.includes(String(pedido.status || '').toLowerCase())) return semAtraso;
  if (!(previsao < hoje)) return semAtraso;
  return {
    atrasado: 1,
    dias_atraso: Math.round((meiaNoiteUTC(hoje) - meiaNoiteUTC(previsao)) / 86400000),
  };
}

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
// ⚠️ `'previsão entrega'`/`'previsao entrega'` estao aqui por causa do F6: e a grafia EXATA do
// cabecalho que o "Exportar Excel" da aba Pedidos produz (`Compras.js`), e sem elas o proprio
// export do CRM nao se reimportaria com a previsao — o arquivo que o operador tem em maos.
/**
 * ── A COLUNA DE DATA DO PEDIDO (onda de correcao, F7 — achado I4/UX) ──────────────────────────
 *
 * `data_pedido` NAO era passada no `criarPedido` da importacao e nao havia lista de grafias para
 * ela: o DDL nao tem DEFAULT (`index.js:19235`: `data_pedido DATE`), entao a coluna ficava **NULL**
 * e `Compras.js:273` renderizava `'-'`. Uma importacao de 60 pedidos produzia 60 linhas com
 * "Data Pedido: -" na aba e no Excel — no caso que a Task 4 existe para atender (carga do acervo),
 * onde a data ANTIGA de cada ordem e justamente o que importa saber. A unica ordenacao da lista e
 * `created_at DESC`, que o operador nao ve.
 *
 * `emissao`/`emissão` estao na lista porque e como a planilha de compras costuma chamar a coluna.
 */
const CHAVES_DATA_PEDIDO = ['data', 'data_pedido', 'data do pedido', 'data pedido',
  'emissao', 'emissão', 'data de emissao', 'data de emissão'];
const CHAVES_PREVISAO = ['previsao', 'previsão', 'previsao_entrega', 'previsão_entrega',
  'entrega', 'data de entrega', 'previsao de entrega', 'previsão de entrega',
  'previsao entrega', 'previsão entrega'];

/**
 * ⚠️ A CHAVE DO GRUPO E O PAR (ORDEM DA PLANILHA, FORNECEDOR RESOLVIDO) — achado C1 da revisao
 * final desta etapa, reproduzido por sonda executada DUAS vezes.
 *
 * Ate a onda de correcao a chave era SO o agrupador da planilha e o fornecedor do grupo era "a
 * primeira linha que conseguisse resolver": duas linhas da MESMA OC (ou de uma planilha sem coluna
 * de ordem, que caia toda no `SEM_AGRUPADOR`) com fornecedores DIFERENTES viravam **um** pedido, do
 * fornecedor da primeira, com `ignorados: []` — sucesso total na cara do operador. E o erro
 * PROPAGAVA para o financeiro: `receiptService.js:376` grava o `fornecedor_id` do pedido no
 * cabecalho do recebimento e a conta a pagar da Etapa 8/37 nasce dele, entao material da BETA era
 * recebido e lancado a pagar PARA A ACME, sem um sinal em nenhuma das duas telas.
 *
 * Mapa de mapas, e nao chave de texto concatenada (`ordem|id`), pelo MESMO motivo que o
 * `SEM_AGRUPADOR` abaixo e `Symbol`: a ordem vem da planilha e uma ordem chamada `'OC-1|3'`
 * colidiria com o par (OC-1, fornecedor 3). O mapa externo guarda a ordem de aparicao das ORDENS
 * (que e a ordem da resposta, afirmada pelo cenario 2) e o interno a dos fornecedores dentro dela.
 *
 * Descartado: recusar a planilha inteira com 400 quando houver mistura (perde 300 linhas boas por
 * causa de uma), e manter a heranca de fornecedor do grupo com aviso (o dano e no dado gravado, nao
 * na mensagem).
 *
 * ⚠️ O CUSTO ACEITO, declarado: a planilha que traz o CNPJ **so na primeira linha da ordem** deixa
 * as outras em `ignorados` com `fornecedor não encontrado`, porque linha nenhuma herda o fornecedor
 * de outra. Era o caso que a heranca servia — e nao ha como distinguir "celula em branco" de
 * "fornecedor divergente" sem adivinhar qual das duas o operador quis. Recusar a linha e visivel e
 * reversivel (ele preenche a coluna e reimporta); gravar o pedido no fornecedor errado, nao.
 */

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
  // `avisos` e IRMAO de `ignorados`, nao substituto: a linha do aviso ENTROU no pedido (ver o
  // comentario de AVISO_PREVISAO_NAO_RECONHECIDA).
  const avisos = [];
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
    // mede exatamente isso: `pedidos.length` iria de 2 para 5). Ele e METADE da chave: a outra e o
    // fornecedor resolvido DA LINHA (achado C1 — ver o comentario da chave de grupo acima).
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

    // ⚠️ FORNECEDOR POR LINHA, nunca herdado do grupo (achado C1 — ver o comentario da chave de
    // grupo acima). Fica DEPOIS da resolucao do material de proposito: a precedencia dos motivos
    // de `ignorados` e a mesma de antes da correcao (codigo, quantidade, material, fornecedor), e
    // o cenario (4) a congela linha por linha.
    const fornecedor = await resolverFornecedorDaLinha(db, row);
    if (!fornecedor) {
      ignorados.push({ linha: numeroDaLinha, motivo: MOTIVO_FORNECEDOR_NAO_ENCONTRADO });
      continue;
    }

    // ⚠️ A DATA E LIDA CRUA e convertida aqui (`dataDaPlanilha`), nunca por `extrairDoRow`: aquele
    // devolve String, e a celula de data do `.xlsx` chega como SERIAL NUMERICO (45000) porque o
    // client le a planilha com `raw` no default. `'45000'` na coluna `DATE` era o achado I2.
    // Nao reconhecida -> `null` + AVISO (a linha entra: a data e informativa).
    const previsaoCrua = valorCruDoRow(row, ...CHAVES_PREVISAO);
    const previsaoDaLinha = dataDaPlanilha(previsaoCrua);
    if (previsaoCrua != null && previsaoDaLinha == null) {
      avisos.push({ linha: numeroDaLinha, campo: 'previsao_entrega', motivo: AVISO_PREVISAO_NAO_RECONHECIDA });
    }

    // A DATA DO PEDIDO, pela mesma regra (F7): a planilha do acervo traz a data ANTIGA da ordem, e
    // e ela que o operador precisa ver na lista. Nao reconhecida -> AVISO e a linha entra.
    const dataPedidoCrua = valorCruDoRow(row, ...CHAVES_DATA_PEDIDO);
    const dataPedidoDaLinha = dataDaPlanilha(dataPedidoCrua);
    if (dataPedidoCrua != null && dataPedidoDaLinha == null) {
      avisos.push({ linha: numeroDaLinha, campo: 'data_pedido', motivo: AVISO_DATA_PEDIDO_NAO_RECONHECIDA });
    }

    if (!grupos.has(chaveGrupo)) grupos.set(chaveGrupo, new Map());
    const porFornecedor = grupos.get(chaveGrupo);
    if (!porFornecedor.has(fornecedor.id)) {
      porFornecedor.set(fornecedor.id, { chave: chaveGrupo, fornecedorId: fornecedor.id, linhas: [] });
    }
    porFornecedor.get(fornecedor.id).linhas.push({
      numeroDaLinha,
      row,
      previsao: previsaoDaLinha,
      dataPedido: dataPedidoDaLinha,
      item: { material_id: material.id, quantidade, valor_unitario: valorUnitario },
    });
  }

  const pedidos = [];
  let itensImportados = 0;

  // Laco de DOIS niveis: a ordem da planilha por fora, o fornecedor por dentro (ver o comentario
  // da chave de grupo). Duas linhas da mesma OC com fornecedores diferentes viram DOIS pedidos, e
  // os dois registram a MESMA ordem de origem em `observacoes` — e a unica pista de qual linha da
  // planilha virou qual `PC-…`.
  for (const porFornecedor of grupos.values()) {
    for (const grupo of porFornecedor.values()) {
      // A previsao do grupo e a PRIMEIRA linha que trouxe uma data valida (a planilha costuma
      // repeti-la ou traze-la so na primeira linha da ordem); as ja convertidas para
      // `AAAA-MM-DD` — nunca a celula crua.
      const previsao = grupo.linhas.map((l) => l.previsao).find((v) => v) || null;
      // ⚠️ SEM COLUNA DE DATA O PEDIDO NASCE COM A DE HOJE, nunca NULL (F7): `data_pedido` nao tem
      // DEFAULT no DDL, e NULL virava "Data Pedido: -" em toda linha importada.
      const dataPedido = grupo.linhas.map((l) => l.dataPedido).find((v) => v) || hojeLocalISO();
      // A observacao registra o agrupador da planilha: e a UNICA pista de qual ordem virou qual
      // `PC-…` depois da importacao, e o roteiro de teste manual confere por ela.
      const observacoes = grupo.chave === SEM_AGRUPADOR
        ? 'Importado de planilha (sem coluna de pedido)'
        : `Planilha: ${grupo.chave}`;

      try {
        const pedido = await criarPedido(db, {
          fornecedor_id: grupo.fornecedorId,
          itens: grupo.linhas.map((l) => l.item),
          observacoes,
          data_pedido: dataPedido,
          ...(previsao ? { previsao_entrega: previsao } : {}),
        }, user);
        pedidos.push({ id: pedido.id, numero: pedido.numero, itens: (pedido.itens || []).length });
        itensImportados += (pedido.itens || []).length;
      } catch (e) {
        // Caminho de defesa, nao caminho de contrato: fornecedor e materiais do grupo acabaram de
        // ser resolvidos, entao as guardas de `criarPedido` ja passaram. Se ainda assim ele recusar
        // (um material apagado no meio da importacao, uma coluna que mudou), o grupo vira
        // `ignorados` com a mensagem do servico — e os OUTROS grupos continuam. Derrubar a resposta
        // inteira faria o operador perder o que ja gravou e reimportar tudo (e sem idempotencia,
        // duplicando).
        for (const l of grupo.linhas) ignorados.push({ linha: l.numeroDaLinha, motivo: e.message });
      }
    }
  }

  // `ignorados` sai na ORDEM DA PLANILHA: as recusas de linha nascem no primeiro laco e as de
  // grupo (fornecedor) no segundo, entao sem esta ordenacao a lista sairia fora de ordem e o
  // operador teria de caçar as linhas na planilha dele.
  ignorados.sort((a, b) => a.linha - b.linha);
  // Mesma regra para os avisos: a lista sai na ordem da planilha do operador.
  avisos.sort((a, b) => a.linha - b.linha);

  return { pedidos, itens: itensImportados, ignorados, avisos };
}

module.exports = {
  criarPedido,
  relerPedido,
  obterPedido,
  atualizarPedido,
  alterarStatusPedido,
  excluirPedido,
  buscarMateriais,
  importarPedidos,
  PEDIDO_NAO_ENCONTRADO,
  CORPO_PLANILHA_INVALIDO,
  MOTIVO_QUANTIDADE_INVALIDA,
  MOTIVO_SEM_CODIGO,
  MOTIVO_FORNECEDOR_NAO_ENCONTRADO,
  AVISO_PREVISAO_NAO_RECONHECIDA,
  AVISO_DATA_PEDIDO_NAO_RECONHECIDA,
  hojeLocalISO,
  derivarAtraso,
  STATUS_PEDIDO_FORA_DO_ATRASO,
};
