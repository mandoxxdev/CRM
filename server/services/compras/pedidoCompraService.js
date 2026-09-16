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
 * Testes: `server/tests/api/comprasPedidoCriar.api.test.js`
 * Plano:  `docs/superpowers/plans/2026-09-16-crm-etapa38-pedido-de-compra.md` (Task 2)
 */
const { dbRun, dbGet, dbAll } = require('../almoxarifado/db');
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

  const fornecedor = await dbGet(db, 'SELECT id FROM fornecedores WHERE id = ?', [dados.fornecedor_id]);
  if (!fornecedor) throw erro('Fornecedor não encontrado');

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

module.exports = { criarPedido, relerPedido };
