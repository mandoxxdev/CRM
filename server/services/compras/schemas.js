/**
 * Schemas Zod do modulo CORE Compras (Etapa 38, Task 2) — os PRIMEIROS do core.
 *
 * Ate esta etapa o modulo Compras tinha **zero** Zod: as 23 rotas validavam na mao com
 * `if (!campo) return res.status(400)`. O `validate()` que este arquivo alimenta e o **mesmo** do
 * almoxarifado (`services/almoxarifado/validation.js`), reusado por `require` e **nao copiado**
 * (decisao 7 do design): duplicar o formatador daria duas mensagens de "Dados invalidos" que
 * divergiriam na primeira edicao, e o formato `'Dados inválidos — campo: frase'` ja e o da casa.
 *
 * ── AS TRES ARMADILHAS MEDIDAS CONTRA `zod@4.4.3`, cada uma com o que quebra sem ela ──────────
 *
 * 1. **`z.looseObject`, NUNCA `z.object`.** `validate()` substitui `req.body` por `parsed.data`, e
 *    `z.object` **descarta silenciosamente toda chave nao declarada**. Esta e a QUINTA encarnacao
 *    do mesmo defeito nesta base (`reserva_id`, `lote_id`, `series`, `nota_fiscal`).
 *    ⚠️ **O dano aqui NAO e o que o plano previu, e a sabotagem 2 mediu:** `itens` esta
 *    DECLARADO, entao com `z.object` ele sobrevive e o `POST` continua respondendo 201. Quem
 *    some sao as chaves **nao declaradas** — `solicitacao_id` (o vinculo com a reposicao vira
 *    no-op silencioso: a solicitacao fica `PENDENTE` e ninguem ve erro), `data_pedido`,
 *    `previsao_entrega` e `observacoes` (gravados como NULL). Por isso os cenarios (1) e (9) do
 *    teste afirmam esses quatro campos: sem eles a troca passaria despercebida.
 *
 * 2. **A literal tem de estar TAMBEM no construtor do tipo, nao so no refinamento.** Medido por
 *    sonda: `z.number().gt(0, MSG).safeParse('abc')` devolve `Invalid input: expected number,
 *    received string` — **em ingles** —, porque `'abc'` falha no TIPO e nunca chega ao `.gt()`.
 *    Por isso todo campo numerico aqui e `z.number({ error: MSG }).<refinamento>(…, MSG)`, com a
 *    **mesma constante** nos dois lugares. Vale igual para `z.array(…, { error: MSG }).min(1, MSG)`:
 *    sem o `error` do construtor, `itens` **ausente** (em vez de `[]`) sairia em ingles.
 *
 * 3. **Nao ha coercao, de proposito.** `quantidade: '4'` e **recusado**. `z.coerce.number` (que o
 *    recebimento do almoxarifado usa) foi descartado aqui porque este schema tambem guarda
 *    `material_id` e `fornecedor_id`, onde coagir `'abc'` para NaN ou `'0007'` para 7 esconderia
 *    payload torto vindo de import de planilha. A contrapartida esta escrita e tem dono: **o
 *    formulario (Task 5) coage com `Number()` antes do POST**, porque `<input type="number">` e
 *    `<select>` mandam STRING — sem isso a suite de API fica verde e todo submit real toma 400.
 *
 * ── POR QUE A LITERAL DA QUANTIDADE E PROPRIA, e nao a do almoxarifado ────────────────────────
 * O almoxarifado ja tem `'quantidade do item deve ser um número maior que zero'`
 * (`services/almoxarifado/schemas.js`, `QTD_ITEM_INVALIDA`). A daqui diz **"quantidade do item DO
 * PEDIDO"** para que um `grep` por qualquer uma das duas frases ache **um** dono: sao dois modulos
 * e dois schemas, e uma frase identica em dois arquivos divergiria na primeira edicao sem que
 * ninguem percebesse qual porta mudou.
 *
 * ── O QUE O SCHEMA NAO ACEITA, e por que nao e esquecimento ───────────────────────────────────
 * `numero` e `valor_total` **nao sao campos de entrada**. `numero` e GERADO pelo servidor
 * (`inserirComNumeroUnico(db, 'PC', …)`) e `valor_total` e DERIVADO da soma dos itens. Mandar
 * qualquer um dos dois no payload **nao quebra** (o `looseObject` os deixa passar) e **nao decide
 * nada** — o servico os ignora. Os cenarios (3) e (5) da Task 2 congelam isso.
 */
const { z } = require('zod');

/**
 * O vocabulario de `pedidos_compra.status` — MINUSCULO, o que a tela de Compras pinta e filtra.
 *
 * ⚠️ `PARCIAL` e `RECEBIDO` (maiusculos) NAO entram aqui, e a ausencia e a regra: eles sao a
 * DERIVACAO do almoxarifado (`situacaoRecebimentoPedido`, decisao 4 da Etapa 37), calculada a
 * partir de `quantidade_recebida`. Gravar um deles nesta coluna faria o core afirmar um fato que
 * so as linhas do pedido podem dizer — e o `recebido` minusculo daqui e outra coisa: e o comprador
 * declarando o pedido encerrado.
 */
const STATUS_PEDIDO_COMPRA = ['pendente', 'aprovado', 'rejeitado', 'em_analise', 'enviado', 'recebido', 'cancelado'];

const FORNECEDOR_PEDIDO_OBRIGATORIO = 'fornecedor do pedido é obrigatório';
const ITENS_PEDIDO_VAZIO = 'inclua ao menos um item no pedido de compra';
const MATERIAL_ITEM_OBRIGATORIO = 'material do item é obrigatório';
const QTD_ITEM_PEDIDO_INVALIDA = 'quantidade do item do pedido deve ser um número maior que zero';
const VALOR_UNITARIO_ITEM_NEGATIVO = 'valor unitário do item não pode ser negativo';
const STATUS_PEDIDO_INVALIDO = `status do pedido inválido (use ${STATUS_PEDIDO_COMPRA.slice(0, -1).join(', ')} ou ${STATUS_PEDIDO_COMPRA[STATUS_PEDIDO_COMPRA.length - 1]})`;

/**
 * ── AS DUAS COLUNAS `DATE` PASSAM A SER VALIDADAS (onda de correcao, F3: achados I2/RN e I1/UX) ─
 *
 * O QUE ESTAVA FURADO, medido nas duas pontas:
 * - `previsao_entrega` e `data_pedido` NAO estavam declaradas aqui, e o `z.looseObject` as passava
 *   adiante de proposito. `criarPedido` copiava `dados[col]` para o `INSERT` **sem validar nada**:
 *   `previsao_entrega: 'blah'` respondia **201** e o `GET` devolvia `"blah"` numa coluna `DATE`.
 * - O formulario manda `''` SEMPRE (`PedidoCompraForm.js:85` nasce `''` e o payload o inclui sem
 *   condicao), e a guarda do laco do cabecalho pulava `undefined`/`null` mas **nao** `''`. Sonda
 *   executada: `previsao_entrega` gravado como TEXT `''` numa coluna `DATE` —
 *   `WHERE previsao_entrega < date('now')` **acusa** essas linhas (o alerta de atraso que e etapa
 *   propria nasceria apontando justamente os pedidos SEM previsao) e `IS NULL` **nao** as pega.
 *   E na migracao para Postgres do roadmap, `date` **recusa** `''`.
 *
 * A REGRA: `null`, ausente ou `''` -> **null**; `AAAA-MM-DD` -> passa; QUALQUER outra coisa -> 400.
 * O `z.preprocess` e o que transforma `''` em `null` ANTES do union, e e por isso que a porta HTTP
 * nunca mais grava string vazia. O servico tem a MESMA regra para quem o chama sem passar por aqui
 * (importacao, Reposicao) — duas guardas para o mesmo fato, porque sao duas entradas.
 *
 * ⚠️ REGEX, e nao `z.iso.date()`: o `z.iso.date()` do Zod 4 aceita a forma, mas a mensagem dele
 * sairia **em ingles** no caminho de tipo (a armadilha 2 do cabecalho deste arquivo), e a literal
 * tem de ser a nossa nos DOIS lugares. Descartado tambem `z.coerce.date()`: devolveria um `Date`
 * para o `INSERT`, e o driver gravaria o timestamp inteiro (ou o ISO com `T00:00:00.000Z`) numa
 * coluna que o resto do modulo le como `AAAA-MM-DD`.
 */
const RE_DATA_ISO = /^\d{4}-\d{2}-\d{2}$/;
const PREVISAO_ENTREGA_INVALIDA = 'previsão de entrega inválida (use AAAA-MM-DD)';
const DATA_PEDIDO_INVALIDA = 'data do pedido inválida (use AAAA-MM-DD)';

const dataIsoOpcional = (msg) => z.preprocess(
  (v) => (v === '' ? null : v),
  z.union([z.null(), z.string().regex(RE_DATA_ISO, msg)], { error: msg }),
).optional();

/**
 * A linha do pedido. `material_id` e OBRIGATORIO e isso vem de fora do modulo: as duas leituras da
 * Etapa 37 (`listarPedidosCompraAux` e `carregarItensPedidoCompra`) filtram
 * `material_id IS NOT NULL`, entao uma linha de texto livre seria **invisivel ao recebimento** —
 * o pedido apareceria `ABERTO` com saldo 0 e ninguem entenderia por que.
 *
 * `valor_unitario` e OPCIONAL (decisao: pedido sem preco fechado e caso real), com uma
 * contrapartida declarada: preco 0 na linha desfaz a U1 da Etapa 37 — `criarRecebimento` herda o
 * preco da linha quando o payload omite e o `custo_unitario` so viaja quando `> 0`, entao o custo
 * medio do material deixa de ser alimentado. Quem avisa e a tela (Task 5); aqui nao se recusa.
 */
const PedidoCompraItemSchema = z.looseObject({
  material_id: z.number({ error: MATERIAL_ITEM_OBRIGATORIO }).int(MATERIAL_ITEM_OBRIGATORIO).positive(MATERIAL_ITEM_OBRIGATORIO),
  quantidade: z.number({ error: QTD_ITEM_PEDIDO_INVALIDA }).gt(0, QTD_ITEM_PEDIDO_INVALIDA),
  valor_unitario: z.number({ error: VALOR_UNITARIO_ITEM_NEGATIVO }).min(0, VALOR_UNITARIO_ITEM_NEGATIVO).optional(),
});

const PedidoCompraCreateSchema = z.looseObject({
  fornecedor_id: z.number({ error: FORNECEDOR_PEDIDO_OBRIGATORIO }).int(FORNECEDOR_PEDIDO_OBRIGATORIO).positive(FORNECEDOR_PEDIDO_OBRIGATORIO),
  status: z.enum(STATUS_PEDIDO_COMPRA, { error: STATUS_PEDIDO_INVALIDO }).optional(),
  // As duas colunas `DATE` do cabecalho (onda de correcao, F3 — ver o comentario acima). O `PUT`
  // usa o MESMO schema, entao a regra vale nas duas portas por construcao.
  data_pedido: dataIsoOpcional(DATA_PEDIDO_INVALIDA),
  previsao_entrega: dataIsoOpcional(PREVISAO_ENTREGA_INVALIDA),
  itens: z.array(PedidoCompraItemSchema, { error: ITENS_PEDIDO_VAZIO }).min(1, ITENS_PEDIDO_VAZIO),
});

/**
 * Etapa 39, onda de correcao F4 — o corpo de `PATCH /api/compras/pedidos/:id/status`.
 *
 * UM campo, OBRIGATORIO (aqui, ao contrario do `PedidoCompraCreateSchema`, `status` ausente nao
 * tem default possivel: a porta existe SO para muda-lo), validado pelo MESMO
 * `STATUS_PEDIDO_COMPRA` e com a MESMA literal `STATUS_PEDIDO_INVALIDO` das outras duas portas —
 * uma segunda lista de 7 status divergiria na primeira edicao e daria dois textos de 400 para o
 * mesmo fato.
 *
 * ⚠️ `z.object` e nao `z.looseObject` (os outros dois schemas deste arquivo sao loose, e o motivo
 * esta la: `validate()` SUBSTITUI `req.body` por `parsed.data`, e `itens`/`solicitacao_id`
 * sumiriam). Aqui a substituicao e justamente o que se quer: o `strip` do Zod garante que um corpo
 * com `itens`, `fornecedor_id` ou `quantidade_recebida` chegue ao servico como `{ status }` e mais
 * nada — a porta que promete "so o status" nao pode depender de o servico ignorar o resto.
 */
const PedidoStatusSchema = z.object({
  status: z.enum(STATUS_PEDIDO_COMPRA, { error: STATUS_PEDIDO_INVALIDO }),
});

module.exports = {
  STATUS_PEDIDO_COMPRA,
  PedidoCompraItemSchema,
  PedidoCompraCreateSchema,
  PedidoStatusSchema,
  FORNECEDOR_PEDIDO_OBRIGATORIO,
  ITENS_PEDIDO_VAZIO,
  MATERIAL_ITEM_OBRIGATORIO,
  QTD_ITEM_PEDIDO_INVALIDA,
  VALOR_UNITARIO_ITEM_NEGATIVO,
  STATUS_PEDIDO_INVALIDO,
  PREVISAO_ENTREGA_INVALIDA,
  DATA_PEDIDO_INVALIDA,
};
