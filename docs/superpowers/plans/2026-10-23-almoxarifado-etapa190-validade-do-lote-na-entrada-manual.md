# Etapa 190 — A Entrada manual grava a validade do lote

> **Status:** 📝 **plano escrito (2026-10-23, sobre `2e548a9f`). Fase 2 feita (2026-10-23, sobre `bfb7d9a1`): 0 Críticos, 2
> Importantes (I-1 preenchimento sem rede depois do livro; I-2 validade errada sem volta — RN-190.06b "lote vazio"), 8 Menores — ver
> "Emendas da Fase 2", que valem sobre o texto das RN, do contrato e das tasks. Execução não começou.**
> Feature **10** (lotes, séries e etiquetas). Corrige o **C450** (`docs/almoxarifado-novidades-por-etapa.md`, achado da revisão da
> Etapa 188, sonda `rev188-s1.js` (c) da sessão de revisão — não versionada), defeito anterior **desde `65d78fd8` (Etapa 6)**.
> **Concorrência:** outra sessão executa a **Etapa 189** em paralelo (`requisitionService.js`, `routes/almoxarifado.js`,
> `RequisicoesList.js`, `FilaSeparacao.js`, `utils/coletaTexto.js`, `utils/listaColetaPdf.js`). A 190 **não** toca nenhum deles:
> mexe em `services/almoxarifado/schemas.js`, `services/almoxarifado/stockService.js`, `services/almoxarifado/lotService.js` e
> `client/src/components/almoxarifado/MovimentacoesAlmoxarifado.js`. Mesmo assim: **a suíte roda serial** (um SQLite só) — não rodar
> `test:api` enquanto a 189 sabota produção (memória "sabotagem concorrente contamina a suíte"); a letra B da 189 usa **B1260–B1269**,
> esta usa **B1270–B1279**; a letra A ganha a **A110** (conferir no fechamento se a 189 não a tomou; se tomou, a próxima livre).
> Tamanho: **M**.

## Objetivo (em linguagem simples)

Hoje, quando alguém registra uma **Entrada** na tela de Movimentações com um lote novo (por exemplo, achou uma caixa de cola sem nota e
está regularizando), o lote nasce **sem data de validade**. A tela nem tem o campo, e se alguém mandar a data direto para o servidor, o
servidor responde "ok" e **joga a data fora sem avisar**.

Um lote sem validade é tratado como "nunca vence":

- vai para o **fim da fila** do "primeiro que vence sai primeiro" (FEFO) — a lista de lotes na Saída e a sugestão de coleta da Etapa 188
  mandam pegar os outros antes;
- **nunca** dispara o e-mail "Lote vencendo";
- **nunca** é barrado como vencido — a cola vencida sai para a produção sem ninguém perceber.

Depois desta etapa:

1. A Entrada manual tem o campo **"Validade do lote"** (opcional). A data vai para o lote.
2. Se o lote **já existe sem validade**, a Entrada preenche a validade (e avisa que ela vale também para o que já estava no lote).
3. Se o lote **já existe com outra validade**, a Entrada é **recusada** com a mensagem dizendo qual é a validade gravada — a validade é
   do lote, não de cada entrada.
4. Lote que entra **já vencido** é aceito (é um registro do que existe na prateleira), com aviso de que a saída para consumo fica
   bloqueada até liberar o vencimento.

Analogia: a caixa de leite tem a data impressa nela. Antes, quem guardava a caixa na geladeira arrancava a etiqueta da data. Agora a etiqueta
fica. Se a caixa já está na geladeira sem etiqueta, quem traz a segunda caixa igual cola a etiqueta nas duas. Se já tem etiqueta com outra
data, o sistema pergunta "é mesmo o mesmo lote?" em vez de trocar a data.

**Fora desta etapa (declarado, B1276):** corrigir a validade de um lote que **já tem** validade (rota de edição com perfil e auditoria) —
é a Etapa 191 (ver "Próxima tarefa detalhada").

## Fase 0 (medido em 2026-10-23, sobre `2e548a9f`)

**O schema descarta o campo.** `server/services/almoxarifado/schemas.js:87-142` — `MovimentacaoSchema` é `z.object({...})` sem
`data_validade`; `validate()` troca `req.body` pelo parseado e o `z.object` **descarta a chave em silêncio** (o mesmo defeito que já mordeu
`reserva_id` na Etapa 4 e `lote_id` na Etapa 6 — comentários em `:110-111` e `:121-123`). Precedente para campo que o motor julga:
`codigo_lido_origem`/`codigo_lido_destino` (`:128-129`) e `motivo_id` (`:133`) — declarados `z.unknown().optional()` "sem tipo aqui —
quem valida é o motor, que também recebe o body cru de `/transferencias`; assim as duas rotas dão a MESMA mensagem".

**As rotas que chegam ao motor:**

| Rota | Arquivo:linha | Corpo | Lote |
|---|---|---|---|
| `POST /api/almoxarifado/movimentacoes/v2` | `routes/almoxarifado/extended.js:831-843` | `validate(MovimentacaoSchema)` → `req.body` inteiro ao motor, `{ exigeLote: true, exigeSerie: true }` | `lote` (texto) ou `lote_id` |
| `POST /api/almoxarifado/transferencias` | `extended.js:870-881` | **body cru** (sem schema) + `tipo: 'TRANSFERENCIA'` | `lote`/`lote_id` existentes |
| `POST /api/almoxarifado/movimentacoes` (v1) | `routes/almoxarifado.js:1301-1333` | desestrutura 6 campos; **não carrega lote** | — (material com `controle_lote` sempre recusa) |

**O motor resolve o lote** em `services/almoxarifado/stockService.js:1265-1286` (`registrarMovimentacaoSemTrava`, que roda **dentro** de
`trava.naTravaDoMaterial` — `registrarMovimentacao`, `:1104-1107`):

- `lote_id` → `getLote`; inexistente → 400 `Lote nao encontrado`; de outro material → 400.
- `lote` (texto) → `getLotePorCodigo`; não existe e `tipo ∈ TIPOS_ENTRADA` → **`criarOuObterLote(db, user, { material_id, codigo: lote })`
  (`:1278`) — sem validade**; não existe e não é entrada → 400 `Lote nao encontrado para este material: <cód>`.
- `TIPOS_ENTRADA` (`services/almoxarifado/movementTypes.js:44-45`): `ENTRADA`, `ENTRADA_COMPRA`, `ENTRADA_MANUAL`, `ENTRADA_DEVOLUCAO`,
  `DEVOLUCAO`, `AJUSTE_POSITIVO`, `RETORNO_TRANSFORMACAO`, `ENTRADA_RETALHO`. Os que a v2 aceita são os de `TIPOS_MOVIMENTO_ROTA`
  (`schemas.js:60-62`; `RETORNO_TRANSFORMACAO`/`ENTRADA_RETALHO` são dedicados e recusados lá).
- O livro grava `INSERT INTO movimentacoes_almoxarifado` em `:2290`; a resposta é montada em `:2515-2524` (com `aviso_caixa` e
  `aviso_retencao` opcionais — o molde do aviso novo).

**`criarOuObterLote`** (`services/almoxarifado/lotService.js:46-87`): idempotente por `(material_id, codigo)`. **Lote existente → devolve o
existente sem tocar em nada** (`:56-57`), com qualquer validade (NULL ou outra) — o comentário (`:46-48`) diz que é de propósito: "o segundo
recebimento do mesmo lote não pode reescrever a validade que veio no primeiro". Lote novo: `INSERT` com `dados.data_validade || null` e
auditoria `entidade='lote', acao='CRIACAO'` (`:78-84`, `dados_novos` sem a validade). **Ninguém faz `UPDATE` de `data_validade`**: os
`UPDATE lotes_almoxarifado` existentes são status (`:103`), liberação por certificado (`:142`), liberação de vencimento (`:182`, guarda
`WHERE data_validade = ?`) e certificado (`routes/almoxarifado.js:1200`). Não há rota para criar lote nem editar validade (as rotas de lote:
`extended.js:1256` liberar-vencimento, `:1263` lista, `:1301` resumo, `:1307` status; `routes/almoxarifado.js:1192` certificado).

**Todos os caminhos que criam ou usam lote numa entrada:**

| Caminho | Onde | Cria lote? | Validade |
|---|---|---|---|
| Entrada manual (v2), tipos de entrada | `stockService.js:1278` | sim, se o código é novo | **perdida** (C450) |
| Recebimento | `receiptService.js:1755-1773` | sim, `criarOuObterLote` com `data_validade: item.data_validade_lote` | gravada **só se o lote é novo**; lote existente fica com a dele, sem aviso |
| Devolução (`returnService.js:111-141`) | `lote_id` herdado da saída ou informado | não | — (lote já existe) |
| Transferência | motor, ramo TRANSFERENCIA | não (código inexistente → 400) | — |
| Ajuste (`AJUSTE`) | motor | não (`AJUSTE` não está em `TIPOS_ENTRADA`) | — |
| `AJUSTE_POSITIVO` pela v2 | motor | sim (é tipo de entrada) | perdida, como a Entrada |
| Estorno (`cancelarMovimentacao`, `:2619`) | usa o `lote_id` do movimento | não | — |

**A tela** — `client/src/components/almoxarifado/MovimentacoesAlmoxarifado.js`:

- `TIPOS_FORM` (`:31-37`): Entrada, Saída, Transferência, Ajuste, Perda. `TIPOS_COM_LOTE_EXISTENTE = ['SAIDA','PERDA','TRANSFERENCIA']` (`:96`).
- Estado inicial `lote: ''`, `lote_id: ''` (`:187-188`, reset em `:518`); troca de tipo zera os dois se o tipo novo não mostra lote (`:888-909`).
- Campo: `:1136-1171` — na Entrada, `<input id="mov-lote" placeholder="Opcional">` (texto livre); na saída, `<select>` FEFO com
  `— vence <data_validade>`. **Nenhum campo de validade** (`grep -n "validade" MovimentacoesAlmoxarifado.js` → só o rótulo do select
  `:1159` e comentários; controle: o mesmo grep acha `vence`).
- Payload (`:578-610`): `if (form.tipo === 'ENTRADA' && form.lote) payload.lote = form.lote;` (`:593`); `api.post('/almoxarifado/movimentacoes/v2')`.
  Sucesso: `toast.success`, depois `aviso_caixa` e `aviso_retencao` como `toast.warn(..., { autoClose: false })` (`:611-620`); erro:
  `toast.error(err.response?.data?.error)` e **o modal fica aberto** (`:625-629`).

**As regras de validade que já existem (e que o lote sem validade escapa):**

| Regra | Onde | Lote sem validade |
|---|---|---|
| `isVencido` = `data_validade < hoje de Brasília` | `lotService.js:28-32` (Etapa 163, `diaLocal.hojeLocalISO`) | nunca vencido |
| Saída de consumo de lote vencido recusada | `stockService.js:1544-1550` (literal `Lote <cód> vencido em <data> nao pode sair para consumo. …`); descarte (`SUCATA`, `PERDA`, `AJUSTE_NEGATIVO`, …) passa | nunca barra |
| Separação com origem em lote vencido | `requisitionService.js:1162` | nunca barra |
| Liberação de vencimento | `lotService.js:171-198`; recusa `Lote nao esta vencido; nao ha vencimento para liberar` | não se aplica |
| FEFO da lista de lotes | `lotService.listarLotesDoMaterial` (`:~214-240`, nulos com `'9999-12-31'`) | por último |
| FEFO da sugestão de coleta (188) | `sugestaoDeColeta.js:42, 165-166` (`SEM_VALIDADE = '9999-12-31'`) | por último |
| E-mail "Lote vencendo" | `notificationQueueService.varrerLotesVencendo` (`:482-525`): `status='ATIVO' AND data_validade IS NOT NULL AND date(data_validade) <= hoje+dias AND vencimento_liberado_em IS NULL`, com saldo > 0; dedupe `lote-vencendo-<id>-<data_validade>` | nunca avisa |

**Fuso:** `server/services/diaLocal.js:21-25` `hojeLocalISO()` é o dia de Brasília (Etapa 163/170). Formato e calendário:
`auditFiltros.validarData` (`services/almoxarifado/auditFiltros.js:55-67`) — `typeof === 'string'`, `/^\d{4}-\d{2}-\d{2}$/` e a data existe
(`2026-02-30` recusa). É a régua desta etapa.

**Os testes que servem de molde:** `server/tests/api/loteGuardasSaida.api.test.js` (saída de lote vencido pela v2),
`lotes.api.test.js`, `loteVencimentoLiberacao.api.test.js`, `validadesNoDiaLocal.api.test.js` (virada de dia de Brasília e
`varrerLotesVencendo`), `alertasNovos.api.test.js`; na tela, `client/src/components/almoxarifado/MovimentacoesAlmoxarifado.test.js`.

**O que a documentação diz hoje (está certa até esta etapa):** `docs/almoxarifado-manual-do-sistema.md:757` — "Numa movimentação de
Entrada … Aqui ele nasce só com o código, sem validade nem corrida — é o caminho de regularização". A spec 10
(`specs/modulo-almoxarifado/10-lotes-series-etiquetas/README.md:157-160`) — "na entrada o lote continua texto livre". Nenhuma das duas
afirma que a validade é gravada — não há spec errada a corrigir; o que muda é o comportamento, e as duas frases mudam no fechamento.
A `:235` da spec 10 manda regularizar estoque antigo pelo **par Entrada com o lote + AJUSTE** — ou seja, os lotes sem validade em produção
nasceram exatamente por esse caminho (A110).

### Divergências e achados da Fase 0

1. **O recebimento também perde validade em silêncio, por outro motivo:** segunda nota do mesmo lote com validade diferente — o lote fica
   com a da primeira, sem aviso; lote criado sem validade (por Entrada) e depois recebido com validade — continua sem. É decisão antiga
   (comentário de `criarOuObterLote`), mas o segundo caso é o mesmo defeito do C450 visto pelo outro lado. **Fora desta etapa** (B1277):
   a Etapa 190 cuida só da porta manual; o recebimento é candidato a juntar-se à régua na 191 (mesma função, `preencherValidadeSeVazia`).
2. **O campo `controle_validade` do material continua morto** (spec 10 `:311`, `:349-352`) — ligar não obriga validade. Fora (B1278).
3. **`data_fabricacao` tem o mesmo buraco** na Entrada manual. Fora (B1278): ninguém lê `data_fabricacao` para decidir nada.

## Regras

| ID | Regra | Cenário |
|---|---|---|
| **RN-190.01** | `POST /movimentacoes/v2` aceita **`data_validade`** opcional. **Não é descartado em silêncio:** chega ao motor e vai para o lote. | Entrada de 10 com `lote: "L-NOVO"`, `data_validade: "2027-03-31"` → 201; `lotes_almoxarifado.data_validade = '2027-03-31'`. Sem a declaração no schema, o mesmo pedido grava NULL — o teste falha. |
| **RN-190.02** | Formato: string `AAAA-MM-DD` de data que existe (`validarData`). `""`, `null` e ausente = "não informado" (nada muda). Qualquer outra coisa → **400** `MSG.FORMATO`. | `"31/03/2027"`, `"2027-02-30"`, `20270331`, `["2027-03-31"]` → 400, nenhum lote criado, nenhuma movimentação. |
| **RN-190.03** | `data_validade` só vale em movimento de **entrada** (`TIPOS_ENTRADA`) **com lote** (`lote` ou `lote_id`). Informada em outro tipo → **400** `MSG.SO_ENTRADA`; em entrada sem lote → **400** `MSG.SEM_LOTE`. Recusa antes de qualquer efeito. Vale igual para `/transferencias` (body cru, mesma mensagem). | Saída com `data_validade` → 400 (antes: aceita e ignora). Entrada sem lote com validade → 400. |
| **RN-190.04** | **Lote novo:** nasce com a validade informada; a auditoria `CRIACAO` do lote passa a levar `data_validade` em `dados_novos`. | RN-190.01. |
| **RN-190.05** | **Lote existente sem validade:** a entrada **preenche** a validade do lote (`UPDATE … WHERE id = ? AND data_validade IS NULL`), auditoria `entidade='lote'`, `acao='VALIDADE_PREENCHIDA'`, `dados_anteriores { data_validade: null }`, `dados_novos { data_validade, movimento_id }`. A resposta traz `aviso_validade` = `MSG.AVISO_PREENCHIDA` — a validade vale também para o saldo que já estava no lote. O preenchimento é gravado **depois** do `INSERT` do livro, dentro da mesma seção da trava do material (entrada recusada não preenche). | Lote L1 sem validade com 6 un; Entrada de 4 em L1 com `2027-01-31` → 201, L1 com validade, 10 un, `aviso_validade` literal. |
| **RN-190.06** | **Lote existente com a mesma validade:** passa, sem aviso, sem auditoria nova. **Com outra validade:** **400** `MSG.CONFLITO`, antes de qualquer efeito — a validade do lote não muda pela entrada (correção é a Etapa 191). | L2 vence 2027-01-31; Entrada em L2 com `2027-01-31` → 201; com `2027-02-28` → 400 com a literal, saldo de L2 intacto. |
| **RN-190.07** | **Validade no passado é aceita** (registro do que existe na prateleira — "passado" = `< hoje de Brasília`; hoje não é passado). A resposta traz `aviso_validade` = `MSG.AVISO_VENCIDO`. O lote passa a ser vencido para todas as regras de hoje (saída de consumo barrada, liberação de vencimento disponível). Lote preenchido **e** vencido: os dois avisos, nessa ordem, separados por espaço. | Entrada de L3 com ontem → 201 + aviso; Saída de L3 → 400 `Lote L3 vencido em …`; liberar vencimento → 200; Saída → 201. |
| **RN-190.08** | Preenchimento que **perde** o `UPDATE` (alguém gravou a validade entre a leitura e a escrita — hoje nenhuma porta faz isso, mas o `WHERE` existe): a entrada fica (o livro já gravou), relê o lote; mesma data → sem aviso; outra → `aviso_validade` = `MSG.AVISO_CORRIDA`. Nunca 500, nunca sobrescreve. | Teste por gancho/sabotagem: `UPDATE` de outra validade antes do preenchimento → 201 + `MSG.AVISO_CORRIDA`, lote com a validade da outra. |
| **RN-190.09** | **O estorno** da entrada **não** desfaz a validade preenchida nem apaga o lote criado (a validade é do lote físico; o estorno desfaz quantidade). | Entrada que preencheu L1 + estorno → L1 continua com a validade. |
| **RN-190.10** | **A tela:** na Entrada, com o campo Lote preenchido, aparece **"Validade do lote"** (`<input type="date" id="mov-validade">`, opcional), com a ajuda `TEXTO_AJUDA`. Lote vazio → o campo some e o valor é zerado; trocar de tipo → zerado. O payload manda `data_validade` só com Entrada + lote + data. Sucesso com `aviso_validade` → `toast.warn(aviso, { autoClose: false })`, depois dos avisos de caixa/retenção. 400 → toast com a literal, modal aberto, nada perdido. | Ver T3. |
| **RN-190.11** | **A validade gravada entra em todas as regras de hoje** sem mudança nelas: FEFO da lista de lotes e da sugestão de coleta (188), e-mail "Lote vencendo", saída vencida recusada, separação recusada. | T4 (integração). |

## Contrato (congelado)

### `POST /api/almoxarifado/movimentacoes/v2` (muda)

Payload: o de hoje + `data_validade?: string` (`"AAAA-MM-DD"`; `""`/`null` = não informado). Declarado no schema como
`data_validade: z.unknown().optional()` (o motor julga, molde `codigo_lido_*` — `/transferencias` não passa pelo schema).

Resposta 201: a de hoje + `aviso_validade?: string` (ausente quando não há aviso — molde `aviso_caixa`).

Recusas novas (400, `{ error }`), **literais** — em `lotService.MSG_VALIDADE` (exportado; o manual cita):

| Chave | Quando | Mensagem literal |
|---|---|---|
| `FORMATO` | RN-190.02 | `A validade do lote deve ser uma data no formato AAAA-MM-DD (ex.: 2027-03-31).` |
| `SO_ENTRADA` | RN-190.03, tipo fora de `TIPOS_ENTRADA` | `A validade do lote só pode ser informada numa entrada — numa saída, transferência ou ajuste o lote já existe e a validade é a dele.` |
| `SEM_LOTE` | RN-190.03, entrada sem `lote`/`lote_id` | `Informe o lote para gravar a validade — a validade é do lote.` |
| `CONFLITO` | RN-190.06 | `O lote <código> já tem validade <DD/MM/AAAA>. A validade é do lote, não da entrada: deixe o campo em branco ou informe a mesma data. Se a validade gravada está errada, peça a correção do lote.` |

Avisos (`aviso_validade`):

| Chave | Mensagem literal |
|---|---|
| `AVISO_PREENCHIDA` | `O lote <código> não tinha validade; ela foi gravada agora (<DD/MM/AAAA>) e vale também para o saldo que já estava nele.` |
| `AVISO_VENCIDO` | `O lote <código> entrou já vencido (validade <DD/MM/AAAA>). A saída para consumo fica bloqueada até liberar o vencimento na tela de Lotes e Séries.` |
| `AVISO_CORRIDA` | `A validade do lote <código> foi gravada por outra operação (<DD/MM/AAAA>) enquanto esta entrada era registrada; a entrada valeu e a validade do lote não foi alterada.` |

`<DD/MM/AAAA>` é a data do lote formatada sem fuso (só troca a ordem dos campos: `"2027-03-31"` → `31/03/2027`; nunca `new Date`).

**Ordem das recusas no motor** (todas antes de qualquer efeito, depois das que existem hoje antes da resolução do lote):
`FORMATO` → `SO_ENTRADA` → `SEM_LOTE` → (resolução do lote de hoje: `Lote nao encontrado`, outro material) → `CONFLITO`. As recusas de hoje
depois da resolução (status do lote, `exigeLote`, séries, endereço, saldo) continuam na ordem de hoje; o **lote novo** é criado como hoje
(antes dessas recusas — um lote órfão sem movimento já acontece hoje, agora ele terá a validade; ver B1275).

### `lotService` (interno, congelado para T1/T2)

- `MSG_VALIDADE` (objeto com as 7 chaves acima; as com `<…>` são funções `(codigo, dataISO) => string`).
- `validarDataValidade(valor)` → `{ informada: false }` | `{ informada: true, data: 'AAAA-MM-DD' }` | lança 400 `FORMATO`.
- `criarOuObterLote(db, user, dados)`: **sem mudança de comportamento** para lote existente (o recebimento continua igual, B1277); só a
  auditoria `CRIACAO` passa a levar `data_validade`.
- `preencherValidadeSeVazia(db, user, loteId, dataISO, { movimentoId })` → `{ preenchida: true }` | `{ preenchida: false, atual }`;
  `UPDATE lotes_almoxarifado SET data_validade = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND data_validade IS NULL RETURNING id`;
  auditoria por `registrarAuditoriaDoAto` (falha da auditoria não derruba).

### Sem mudança

`GET /materiais/:id/lotes` e `/lotes/resumo` (já devolvem `data_validade`), `PUT /lotes/:id/liberar-vencimento`, `PUT /lotes/:id/status`,
o recebimento, a v1, a devolução. Nenhuma migration.

### Frases da tela (congeladas)

- Rótulo: **`Validade do lote`**; `TEXTO_AJUDA`: **`Opcional. Se o lote já existe com validade, deixe em branco.`**

## Tasks

Ordem: **T1 (tronco) → T2 (tronco) → T3 (galho, pode começar junto com T1 contra o contrato) → T4 (integração).** T1 e T2 mexem no
motor (tronco, sequencial). T3 é tela contra o contrato congelado (mock só na fronteira HTTP), dona **só** de
`MovimentacoesAlmoxarifado.js` e do teste novo da tela. Nenhum arquivo da 189.

Controles positivos de todas as tasks: perl `-0pi` sobre base LF, âncora contada = 1, md5 antes/sabotado/restaurado (memórias
"harness: base é LF" e "python3 indisponível"); registrar o vermelho no plano. **Sabotar produção só com a 189 parada** ou em worktree
própria (memória "sabotagem concorrente contamina a suíte").

### T1 (tronco) — o campo chega ao lote novo (o "descarte em silêncio")

Arquivos: `server/services/almoxarifado/schemas.js` (declarar `data_validade: z.unknown().optional()` com comentário do C450),
`server/services/almoxarifado/lotService.js` (`MSG_VALIDADE`, `validarDataValidade`, auditoria `CRIACAO` com a validade),
`server/services/almoxarifado/stockService.js` (ler `data_validade` dos `params`; recusas `FORMATO`/`SO_ENTRADA`/`SEM_LOTE` antes da
resolução do lote; passar `data_validade` a `criarOuObterLote` em `:1278`).

Teste novo `server/tests/api/validadeLoteEntradaManual.api.test.js` (runner próprio: `test()`, contador, `process.exit`; `testApp.js` com
`requirePermission` real; usuário com perfil que tem `movimentar`):

1. `[RN-190.01] entrada pela v2 grava a validade no lote novo` — **pela rota** (`POST /api/almoxarifado/movimentacoes/v2`), lê
   `lotes_almoxarifado` direto do banco.
2. `[RN-190.01] pelo servico tambem` — `stockService.registrarMovimentacao` com `data_validade`.
3. `[RN-190.04] auditoria CRIACAO leva a validade`.
4. `[RN-190.02] formato` — `"31/03/2027"`, `"2027-02-30"`, número, array → 400 `FORMATO` literal; **nenhum** lote e **nenhuma**
   movimentação nova (contagem antes/depois). `""` e `null` → 201, lote sem validade.
5. `[RN-190.03] so entrada` — SAIDA (lote existente) com validade → 400 `SO_ENTRADA`; `POST /transferencias` com validade → 400 a mesma.
6. `[RN-190.03] sem lote` — ENTRADA sem lote com validade → 400 `SEM_LOTE`.
7. `[RN-190.03] AJUSTE_POSITIVO pela v2 com lote novo e validade -> grava` (é tipo de entrada).

**Controles positivos:**
(a) **o descarte em silêncio:** apagar a linha `data_validade` do `MovimentacaoSchema` → cai o 1 (o 2, pelo serviço, continua verde —
é a prova de que o 1 mede a rota) e o 5-v2/6 viram 201;
(b) `criarOuObterLote(db, user, { material_id, codigo: lote })` sem a validade (o código de hoje) → caem 1, 2 e 7;
(c) `validarDataValidade` sem a conferência de calendário → cai `"2027-02-30"` no 4;
(d) recusa `SO_ENTRADA` desligada → cai o 5.

### T2 (tronco) — lote existente: preencher, conferir, avisar

Arquivos: `lotService.js` (`preencherValidadeSeVazia`), `stockService.js` (recusa `CONFLITO` logo depois da resolução do lote existente;
preenchimento depois do `INSERT` do livro, `:2290`, antes da resposta; `aviso_validade` na resposta, `:2515-2524`; o aviso de vencido
compara com `diaLocal.hojeLocalISO()`).

Mesmo arquivo de teste, cenários novos:

8. `[RN-190.05] lote sem validade e preenchido` — L1 com 6 un (Entrada sem validade), Entrada de 4 em L1 com `2027-01-31` → 201,
   `aviso_validade` === literal, L1 com a data, auditoria `VALIDADE_PREENCHIDA` com `movimento_id`.
9. `[RN-190.05] entrada recusada nao preenche` — L1 sem validade, Entrada com validade e **séries erradas** num material de série (ou
   endereço bloqueado) → 400 da recusa de hoje; L1 continua sem validade.
10. `[RN-190.06] mesma validade passa sem aviso` — sem `aviso_validade`, sem auditoria nova.
11. `[RN-190.06] outra validade -> 400 CONFLITO` — literal com `DD/MM/AAAA`; saldo, livro e validade intactos. Também por `lote_id`.
12. `[RN-190.07] vencida aceita com aviso` — "ontem" de Brasília (`diaLocal.somarDiasISO(hojeLocalISO(), -1)`) → 201 + `AVISO_VENCIDO`;
    **hoje** → 201 **sem** aviso.
13. `[RN-190.07] preenchida e vencida -> os dois avisos na ordem`.
14. `[RN-190.08] corrida` — sabotagem por gancho no teste (substituir `lotService.preencherValidadeSeVazia` por uma que primeiro faz o
    `UPDATE` de outra data e depois chama a original; restaurar no `finally`) → 201 + `AVISO_CORRIDA`; a validade é a da "outra".
15. `[RN-190.09] estorno nao desfaz` — Entrada que preencheu L1 + `POST /movimentacoes/:id/cancelar` → L1 com a validade.
16. `[Recebimento intacto, B1277]` — lote criado pela Entrada sem validade, depois recebimento com `data_validade_lote` → o lote continua
    sem validade (o comportamento de hoje, fixado para a 191 mudar de propósito).

**Controles positivos:**
(a) `WHERE id = ? AND data_validade IS NULL` sem o `IS NULL` → cai o 14 (sobrescreve);
(b) recusa `CONFLITO` desligada → cai o 11;
(c) preenchimento **antes** das recusas (chamado logo após resolver o lote) → cai o 9;
(d) comparação `<=` no lugar de `<` no aviso de vencido → cai o 12 (hoje com aviso).

Rodar também, sem mudança esperada: `loteGuardasSaida`, `lotes`, `loteRotas`, `loteRecebimento`, `loteVencimentoLiberacao`,
`loteControleObrigatorio`, `validadesNoDiaLocal`.

### T3 (galho) — a tela

Arquivo: `client/src/components/almoxarifado/MovimentacoesAlmoxarifado.js` **só** + teste novo
`client/src/components/almoxarifado/MovimentacoesValidadeLote.test.js` (molde de mock de `api` de `MovimentacoesAlmoxarifado.test.js`;
mock só na fronteira HTTP, respostas do contrato).

- Estado `data_validade: ''` no form inicial (`:187`) e no reset (`:518`); zerado na troca de tipo (`:888-909`) e quando `lote` fica vazio.
- Campo logo abaixo do Lote da Entrada (`:1165-1168`), só com `form.tipo === 'ENTRADA' && form.lote.trim()`: `<label htmlFor="mov-validade">`
  **Validade do lote**, `<input type="date" id="mov-validade">`, `<small>` com `TEXTO_AJUDA`.
- Payload (`:593`): `if (form.tipo === 'ENTRADA' && form.lote && form.data_validade) payload.data_validade = form.data_validade;`
- Depois de `aviso_retencao` (`:620`): `aviso_validade` string não vazia → `toast.warn(aviso, { autoClose: false })`.

Testes:

1. `[RN-190.10] campo aparece so com Entrada e lote` — sem lote: ausente; digita lote: presente; Saída: ausente.
2. `[RN-190.10] payload leva data_validade` — `api.post` chamado com `data_validade: '2027-03-31'`.
3. `[RN-190.10] sem data, sem chave` — o payload **não** tem a chave `data_validade` (não `''`).
4. `[RN-190.10] apagar o lote zera a validade` — digita lote e data, apaga o lote, digita outro lote: o campo vem vazio; o payload sem a chave.
5. `[RN-190.10] aviso_validade vira toast.warn persistente`.
6. `[RN-190.10] 400 CONFLITO mantem o modal` — `toast.error` com a literal, o campo continua com a data.

**Controles positivos:** (a) payload sem a linha do `data_validade` → cai o 2; (b) sem zerar na troca de lote → cai o 4; (c) sem o
`toast.warn` → cai o 5. `CI=true npx react-scripts build` verde (warning vira erro).

### T4 — integração (pela rota e pelo serviço; tela pelo fluxo)

Arquivo novo `server/tests/api/validadeLoteEntradaManualIntegracao.api.test.js`. Cada cenário entra **pela rota v2** (a entrada com
validade) e confere numa **porta diferente**, existente e sem mudança:

1. `[RN-190.11] FEFO na lista` — material com lote LS (sem validade, entrada antiga) e LV (entrada nova com validade daqui a 60 dias) →
   `GET /materiais/:id/lotes`: LV antes de LS. Controle: a mesma entrada **sem** a validade → LS antes de LV (ordem por código) — prova que
   a ordem vem da validade.
2. `[RN-190.11] e-mail Lote vencendo` — alertas por e-mail ligados (molde `validadesNoDiaLocal`), `alerta_lote_vencendo_dias = 30`, entrada
   com validade em 10 dias → `varrerLotesVencendo` enfileira `LOTE_VENCENDO` com `dedupe_chave = lote-vencendo-<id>-<data>`. Controle: sem a
   validade → 0 enfileiradas.
3. `[RN-190.07/11] saida vencida recusada` — entrada com validade de ontem → `POST /movimentacoes/v2` SAIDA com `lote_id` → 400 com a literal
   `Lote <cód> vencido em …`; `PUT /lotes/:id/liberar-vencimento` → 200; SAIDA → 201.
4. `[RN-190.05/11] preencher muda a sugestao de coleta` — material com L-A (validade 2027-12-31) e L-B (sem validade) em endereços
   distintos; requisição aprovada a separar → `GET /fila-separacao`: `pegar_em` em L-A; Entrada de 1 em L-B com `2027-06-30` → a fila
   aponta L-B. (Só leitura da fila — não depende da 189; se a 189 tiver mudado o formato, ler `pegar_em` como o contrato da 188.)
5. `[RN-190.05] pelo servico` — o mesmo preenchimento por `stockService.registrarMovimentacao` (sem schema) → mesma validade e aviso.

**Tela pelo fluxo** (manual, roteiro no guia, e na letra F se não der para medir no navegador): Movimentações → Nova → Entrada → material →
Lote `L-TESTE` → aparece "Validade do lote" → data de amanhã → Registrar → tela de **Lotes e Séries**: L-TESTE com a validade; Nova →
Saída → o seletor mostra `L-TESTE — saldo … — vence <data>` na frente dos lotes sem validade.

Rodar a suíte inteira serial (os cinco comandos do CLAUDE.md), **com a 189 sem sabotagem em curso**.

### Fechamento (skill `fechar-etapa`)

- `docs/almoxarifado-novidades-por-etapa.md`: seção da Etapa 190; **C450** marcado como corrigido (com o hash), dizendo o que **não**
  foi (lotes antigos — A110; recebimento — B1277; edição — 191); letra B **B1270–B1279** (abaixo); **A110** (abaixo); limitações em D;
  verificação de tela em F.
- `specs/modulo-almoxarifado/10-lotes-series-etiquetas/README.md`: linha "+ Etapa 190" no topo; a frase `:157-160` ("na entrada o lote
  continua texto livre") ganha "com validade opcional desde a 190"; seção "Etapa 190" com RN, testes e hashes. Mapa
  (`specs/modulo-almoxarifado/README.md`, linha da 10).
- `docs/almoxarifado-manual-do-sistema.md:757`: trocar "nasce só com o código, sem validade nem corrida" pelo comportamento novo, com as
  literais `CONFLITO` e os avisos; `:761` ("sem sobrescrever a validade") ganha a regra da Entrada.
- `docs/almoxarifado-guia-etapas-e-testes.md`: seção da 190, "Antes → Agora", roteiro clicável, o que não cobre.
- Este plano: Execução e Próxima tarefa detalhada.

## Letra B proposta (para `docs/almoxarifado-novidades-por-etapa.md`)

*(O último usado na main é B1259 (Etapa 188); a 189 reservou **B1260 a B1269**. A 190 usa **B1270 a B1279**.)*

- **B1270 (NOVA, da Etapa 190) — a validade é julgada no motor, não no schema.** O schema declara `data_validade` sem tipo
  (`z.unknown()`), como os `codigo_lido_*` e o `motivo_id`: `/transferencias` não passa pelo schema e as duas rotas têm de dar a mesma
  mensagem. **Descartado:** `z.string().regex(...)` no schema (a v2 recusaria com a mensagem do Zod e `/transferencias` aceitaria calada).
- **B1271 (NOVA) — validade no passado é aceita, com aviso.** Entrada manual é o caminho de regularização: o lote vencido está na prateleira
  e registrar a validade real é o que faz a saída barrar. Recusar empurraria o operador a deixar em branco (o C450 de novo) ou a inventar uma
  data futura. **Descartado:** recusar data passada; aceitar sem aviso. Reversível: trocar o aviso por recusa é uma linha no motor.
- **B1272 (NOVA) — lote existente com outra validade: recusa, não sobrescreve.** A validade é do lote físico; duas entradas não podem dar
  duas validades ao mesmo lote, e trocar em silêncio mudaria o FEFO e o bloqueio do saldo que já estava lá. A literal diz a data gravada e
  manda pedir a correção. **Descartado:** manter a do lote e aceitar calado (o operador acha que gravou — o C450 de novo, num caso menor);
  sobrescrever (sem perfil, sem auditoria de correção). Reversível.
- **B1273 (NOVA) — lote existente sem validade: a entrada preenche, e avisa que vale para o saldo antigo.** É o caso de quem regularizou
  pelo par Entrada + Ajuste (spec 10 `:235`) e agora recebe mais do mesmo lote com a etiqueta na mão. O aviso existe porque o saldo antigo
  pode virar vencido e travar uma separação planejada naquele lote (a recusa da `requisitionService.js:1162` — honesta, mas surpresa).
  **Descartado:** só preencher em lote sem saldo (o lote com saldo é exatamente o que mais precisa); exigir a rota de edição (não existe;
  é a 191).
- **B1274 (NOVA) — o preenchimento grava depois do livro, dentro da trava do material, com `WHERE data_validade IS NULL`.** Entrada recusada
  não preenche; a corrida (que hoje nenhuma porta provoca) não sobrescreve nem dá 500 — a entrada vale e o aviso diz. **Descartado:**
  preencher antes do livro (entrada recusada deixaria a validade gravada); 409 depois do livro (estornaria? — a regra B447/B452 diz que
  gravação que perde depois de mexer em estoque não tenta de novo).
- **B1275 (NOVA) — o lote novo continua nascendo antes das recusas de depois da resolução, agora com a validade.** Um lote órfão (criado
  por entrada que depois foi recusada) já existe hoje; reordenar a criação mexeria no motor inteiro por um efeito sem saldo. Declarado.
- **B1276 (NOVA) — corrigir uma validade já gravada fica para a Etapa 191.** Precisa de rota com perfil (`inspecionar`, como status e
  liberação), justificativa e auditoria, e de decidir o que fazer com a liberação de vencimento já dada (ela guarda contra a data). Etapa M
  em vez de L. **Descartado:** caber aqui (dobra a etapa e mistura correção com cadastro).
- **B1277 (NOVA) — o recebimento fica como está.** Segunda nota do mesmo lote com outra validade continua mantendo a da primeira, calada;
  lote nascido sem validade (pela Entrada) e depois recebido com validade continua sem. Fixado por teste (T2 cenário 16) para a 191 mudar de
  propósito, usando a mesma `preencherValidadeSeVazia`. **Descartado:** mexer no `receiptService` nesta etapa (porta de saldo com trava e
  pré-checagem próprias; outro tamanho de revisão).
- **B1278 (NOVA) — fora: `controle_validade` obrigatório e `data_fabricacao` na Entrada.** A flag segue morta (spec 10 `:311`); fabricação
  não decide nada no sistema.
- **B1279 (NOVA) — os lotes antigos sem validade não são corrigidos pelo sistema.** A **A110** mostra quantos são; o caminho para
  corrigir é uma nova Entrada do lote com a validade (RN-190.05) — ou a rota da 191. **Descartado:** migration que "adivinha" a validade.

## Letra A proposta

**A110 (NOVA, da Etapa 190 — somente leitura, OPCIONAL — os lotes que nasceram sem validade por Entrada manual).** Conta os lotes sem
validade que **não** vieram de nota (`recebimento_id IS NULL` — nasceram pela Entrada da tela de Movimentações, C450) e quanto saldo eles
têm. Os que têm saldo e são de material perecível (cola, tinta, químico) são os que hoje saem sem barrar vencimento e vão para o fim do FEFO.

```sql
-- quantos
SELECT COUNT(*) AS lotes_sem_validade_por_entrada,
       SUM(CASE WHEN saldo > 0 THEN 1 ELSE 0 END) AS com_saldo
FROM (
  SELECT l.id,
         COALESCE((SELECT SUM(s.quantidade) FROM estoque_saldo_almoxarifado s WHERE s.lote_id = l.id), 0) AS saldo
  FROM lotes_almoxarifado l
  WHERE l.data_validade IS NULL AND l.recebimento_id IS NULL
);

-- quais (os com saldo primeiro)
SELECT l.id, l.codigo AS lote, m.codigo AS material, m.nome, l.status, l.created_at,
       COALESCE((SELECT SUM(s.quantidade) FROM estoque_saldo_almoxarifado s WHERE s.lote_id = l.id), 0) AS saldo
FROM lotes_almoxarifado l
JOIN materiais_almoxarifado m ON m.id = l.material_id
WHERE l.data_validade IS NULL AND l.recebimento_id IS NULL
ORDER BY saldo DESC, l.created_at;

-- para comparar: lotes de nota sem validade (a NF não trouxe — não é o C450)
SELECT COUNT(*) FROM lotes_almoxarifado WHERE data_validade IS NULL AND recebimento_id IS NOT NULL;
```

O que fazer com o resultado: para cada lote com saldo de material que vence, registrar uma Entrada do lote com a validade real depois do
deploy (preenche, RN-190.05) — ou esperar a correção da 191.

## Emendas da Fase 2

Revisor fresco, 2026-10-23, sobre `bfb7d9a1`. Leu o CLAUDE.md (motor e trava por material, desfazer sob a trava), o plano, a spec 10,
a B204/B205 e a seção da Etapa 170 das novidades; no código: `schemas.js:87-142`, `stockService.js` (`registrarMovimentacao` `:1104`,
resolução do lote `:1258-1286`, guarda de saída vencida `:1544-1550`, livro `:2290`, catch amplo `:2306-2380`, pós-livro não-fatal
`:2384-2525`, `cancelarMovimentacao` `:2619`), `lotService.js` (inteiro), `receiptService.js:1747-1773` e `:2115-2129` (seção da nota),
`notificationQueueService.varrerLotesVencendo`, `sugestaoDeColeta.js:42, 100, 158-166`, `extended.js:831-884`, `permissions.js:25-26, 112`
e `RecebimentosAlmoxarifado.js:1292`. Duas sondas executadas contra o código de hoje, banco em memória (`createTestApp`), sem tocar em
arquivo do repositório (scratchpad, `f2r190-s1.js` e `f2r190-s2.js`):

| Sonda | Gesto | Resultado medido |
|---|---|---|
| s1 (a) | v2 ENTRADA `lote: 'LA'`, `data_validade: '2027-03-31'` | 201, lote com validade `null` — o C450 reproduz |
| s1 (b) | v2 ENTRADA de lote novo num material de série, 1 série para 2 un | 400 da série; **lote `LORF` criado**, 0 movimentos (B1275) |
| s1 (b+) | controle: a mesma com a série certa | 201 |
| s1 (c) | v2 ENTRADA que cria `LEST` + `POST /movimentacoes/:id/cancelar` | 200; lote fica, saldo 0; livro `ENTRADA cancelado=1` + `ESTORNO cancelado=0`, **os dois com `lote_id`** |
| s1 (d) | `POST /transferencias` com `data_validade` | 201, ignorada (a RN-190.03 muda isso para 400) |
| s1 (e) | v2 SAIDA com `data_validade` | 201, ignorada |
| s1 (f) | v2 `DEVOLUCAO` (genérica) com lote novo | 201, **cria o lote** (é `TIPOS_ENTRADA`) |
| s2 (g) | lote com validade 2020 → SAIDA | 400 `Lote LV vencido em 2020-01-01 …` |
| s2 (h) | o estorno da ENTRADA desse lote vencido | 200, físico 0 — o estorno não olha validade |

**Resultado: 0 Críticos, 2 Importantes, 8 Menores. O contrato muda: duas literais novas em `MSG_VALIDADE` (`AVISO_FALHA`,
`AVISO_REDEFINIDA`) e uma ação de auditoria nova (`VALIDADE_REDEFINIDA`). A chave `aviso_validade` não muda — T3 não é afetada e pode
começar junto com T1.** As decisões entram como complemento da B1274 (I-1) e da B1272 (I-2), sem número novo (a faixa B1270–B1279 está
toda usada).

### As quatro perguntas

1. **Contrato × código — bate.** `z.unknown().optional()` tem o precedente exato (`schemas.js:128-133`); o motor recebe o body inteiro
   da v2 (`extended.js:841`) e o cru de `/transferencias` (`:883`) — as duas rotas dão a mesma mensagem. Nenhum chamador interno passa
   `data_validade` ao motor (grep: só o recebimento usa a chave, e na `criarOuObterLote` dele, fora do motor), então `SO_ENTRADA` não
   acerta fluxo interno. **Ordem:** as três recusas novas vêm depois das recusas de hoje anteriores à resolução do lote (motivo do
   cadastro, tipo, material inativo, `reserva_id`, reserva da requisição, `doBloqueado`) e antes de qualquer efeito (o primeiro efeito
   é a criação do lote em `:1278`); `CONFLITO` vem antes do saldo, do endereço e das séries. Tudo roda **dentro** da trava do material
   (o motor inteiro está em `naTravaDoMaterial`) — ver M-7. **Fuso:** "passado" = `< diaLocal.hojeLocalISO()` é a mesma régua do
   `isVencido` (Etapa 163); `DD/MM/AAAA` por troca de campos, sem `new Date`, é a lição da Etapa 170. Bate.
2. **RN × spec — batem.** Spec 10: vencimento é derivado (`isVencido`), FEFO com nulos por último (`listarLotesDoMaterial`,
   `sugestaoDeColeta.js:42`), liberação guardada pela data (`lotService.js:182`), descarte de vencido passa. A B204/B205 só toca a A110
   (M-5). A Etapa 170 só toca o formato das datas (acima). Nenhuma RN contradiz spec.
3. **T1/T2 tronco, T3 galho — sim.** T1 e T2 mexem nos mesmos dois serviços e no mesmo arquivo de teste: sequenciais. T3 consome só
   `aviso_validade` (string) e `{ error }` — as emendas acrescentam literais, não chaves. A T4.4 lê `/fila-separacao`, que é de
   `requisitionService.js` (território da 189): rodar a T4 só com a 189 commitada (M-9).
4. **RN traçada até o último gesto — dois achados (I-1, I-2).** O traço inteiro está abaixo, depois dos achados.

### I-1 (Importante) — o preenchimento depois do livro não tem rede: falha vira 500 com a entrada gravada, e o operador repete

**Onde:** RN-190.05/08 e T2 dizem "preenchimento depois do `INSERT` do livro (`:2290`), antes da resposta", e só a auditoria é
declarada não-fatal (`registrarAuditoriaDoAto`). O `UPDATE … WHERE data_validade IS NULL` e a releitura do RN-190.08 não têm rede.
Desde a Etapa 120 (C250, B778, comentário em `stockService.js:2427-2436`) **tudo o que roda depois do livro é não-fatal**, porque os 30
chamadores leem a exceção como "nada aconteceu": a Entrada repetida lançava duas vezes.

**Cenário:** Entrada de 4 em L1 (sem validade) com `2027-01-31`; o livro grava, o `UPDATE` do preenchimento lança (`SQLITE_BUSY`,
disco) → 500 → o almoxarife registra de novo → **8 entradas no livro, 4 no prédio**. Pior se o preenchimento for posto **dentro** do
`try` que termina no `INSERT` (`:2290-2305`): o catch amplo (`:2306`) desfaz o físico, a série e a linha de saldo, mas **não apaga a linha do
livro** — livro com uma entrada que não aconteceu.

**Quem desfaz:** ninguém, e é o certo. O `UPDATE` é um comando só (falhou = nada gravado); a regra do CLAUDE.md "quem desfaz subtraindo
o que acabou de creditar tem de desfazer sob a trava" fala de crédito de estoque — aqui não há crédito a desfazer, e desfazer a entrada
por causa da validade seria pior que a validade faltar (B447/B452: gravação que perde depois de mexer em estoque não tenta de novo).

**Emenda (escolhida):** o preenchimento (e a redefinição da I-2) roda **fora** do `try` do livro, junto dos passos não-fatais (depois da
auditoria do lançamento, `:2437-2448`, antes de `verificarAlerta`, `:2450`), num `try/catch` próprio: falha → `console.warn` com o id da
movimentação e `aviso_validade` = **`AVISO_FALHA`** (literal nova, em `MSG_VALIDADE`):
`A entrada foi registrada, mas a validade do lote <código> não pôde ser gravada (<DD/MM/AAAA>). Não repita a entrada; peça a correção da validade do lote.`
Teste novo **14b** (T2): `falhaSqlInjetada` no `UPDATE lotes_almoxarifado SET data_validade` → 201, `aviso_validade === AVISO_FALHA`,
**um** movimento no livro, físico +4, lote sem validade. Controle positivo (e): tirar o `try/catch` → o 14b cai com 500 e o livro com a
linha. **Descartado:** 500 (C250 de novo); desfazer a entrada (estorno automático dentro do motor, fora do padrão de toda a base);
silêncio só com log (o C450 num caso menor — o operador acha que gravou).

### I-2 (Importante) — validade digitada errada não tem volta: o estorno e a recusa deixam o lote com a data, e refazer dá `CONFLITO`

**Onde:** RN-190.06 (outra validade → 400) × RN-190.09 (o estorno não desfaz a validade) × B1275 (o lote nasce antes das recusas de
depois da resolução). Cada uma está certa sozinha; o fluxo trava.

**Cenários (sondas s1 (b) e (c), reproduzidos no estado de hoje; o desfecho é o da regra do plano):**
1. Entrada de lote novo `LORF` com `2027-03-31` num material de série, séries erradas → 400 da série; o lote **já nasceu, com a
   validade** (s1 (b): lote criado, 0 movimentos). O operador corrige as séries e percebe que a data era `2027-08-31` → **400
   `CONFLITO`** ("o lote LORF já tem validade 31/03/2027 … peça a correção") — num lote sem saldo e sem movimento nenhum.
2. Entrada que cria `LEST` com a data errada → o gestor estorna (s1 (c): 200; o lote fica com saldo 0, o livro com `ENTRADA
   cancelado=1` e `ESTORNO cancelado=0`, ambos com `lote_id`) → a nova entrada com a data certa → **400 `CONFLITO`**. O estorno, que o
   operador usa exatamente para desfazer o lançamento errado, não desfaz a parte que estava errada.

O gesto posterior (refazer a entrada) recusa o que o anterior (estorno, ou a recusa) deixou para trás. A saída que sobra é **trocar o
código do lote** — que está impresso na embalagem — ou esperar a 191. E o almoxarife nem estorna sozinho (`ajustar_estoque` é
ADMINISTRADOR/GESTOR, `permissions.js:26`).

**Emenda (escolhida, reversível) — RN-190.06b "lote vazio":** um lote **vazio** — nenhum movimento vivo com ele
(`NOT EXISTS (SELECT 1 FROM movimentacoes_almoxarifado WHERE lote_id = ? AND cancelado = 0 AND tipo <> 'ESTORNO')`), nenhuma linha de
saldo ≠ 0 com ele e nenhuma série presente (`EM_ESTOQUE`/`BLOQUEADA`) com ele — **não** dá `CONFLITO`: a entrada com outra validade a
**redefine**. A decisão "vazio?" é tomada na mesma leitura que decide o `CONFLITO` (antes de qualquer efeito, dentro da trava — nenhuma
porta põe movimento no lote fora dela); a gravação vai no mesmo ponto não-fatal da I-1:
`UPDATE lotes_almoxarifado SET data_validade = ?, vencimento_liberado_em = NULL, vencimento_liberado_por = NULL, vencimento_liberado_motivo = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND data_validade = ? RETURNING id`
(a liberação era daquela validade — mesmo raciocínio do ponto (1) da 191), auditoria `acao='VALIDADE_REDEFINIDA'` com antes/depois e
`movimento_id`, `aviso_validade` = **`AVISO_REDEFINIDA`**:
`O lote <código> estava vazio com a validade <DD/MM/AAAA antiga>; ela foi trocada por <DD/MM/AAAA nova>.`
(função `(codigo, antigaISO, novaISO)`). `UPDATE` que não casa → o mesmo tratamento do RN-190.08 (relê; `AVISO_CORRIDA` se outra).
Lote com **qualquer** movimento vivo (inclusive um que já saiu todo, saldo 0) continua `CONFLITO` — a história dele cita a validade.

Testes novos (T2): **11b** o cenário 1 (recusa de série, depois a entrada certa com outra data → 201 + `AVISO_REDEFINIDA`, lote com a
data nova); **15b** o cenário 2 (entrada, estorno, entrada com outra data → 201, data nova; e um lote **liberado** vencido, vazio,
redefinido → `vencimento_liberado_em` nulo); **11c** lote com entrada e saída total (saldo 0, movimentos vivos) → `CONFLITO`. Controle
positivo (f): a checagem de "vazio" desligada (sempre vazio) → o 11 (L2 com saldo) passa a redefinir e cai.

**Descartado:** (a) desfazer a validade no estorno da entrada que a gravou — o estorno precisaria saber quem gravou (marca nova = migration,
ou ler a auditoria, que é não-fatal e pode faltar), e seria mais um desfazer no ramo de entrada do estorno, que a Etapa 118 pôs inteiro
sob a trava; (b) apagar o lote órfão na recusa ou no estorno — o livro o cita (`lote_id` na ENTRADA cancelada e no ESTORNO); (c) declarar
e deixar para a 191 — deixa o erro mais comum (digitação) sem volta para quem lança. Reversível: tirar a RN-190.06b devolve o `CONFLITO`.

### Menores

- **M-1 — linha errada:** a recusa da separação de lote vencido está em `requisitionService.js:1192` em `bfb7d9a1` (o plano diz `:1162`,
  em "As regras de validade" e na B1273). Corrigir nas citações do fechamento.
- **M-2 — validade gravada pelo recebimento não é normalizada:** o servidor não valida `data_validade_lote` (só a tela usa
  `type="date"`, `RecebimentosAlmoxarifado.js:1292`; o eco `dataDoItem`, `receiptService.js:1254-1260`, aceita hora e `DD/MM/AAAA`). Um
  lote de nota pode ter `2027-03-31 00:00:00`. A comparação do `CONFLITO` usa `String(atual).slice(0, 10)` (a régua do `isVencido`), e o
  formatador `<DD/MM/AAAA>` só troca os campos quando o valor casa `^\d{4}-\d{2}-\d{2}`; senão mostra o texto gravado. Sem isso: falso
  `CONFLITO` com a mesma data, e uma literal que se contradiz.
- **M-3 — `SEM_LOTE` na régua do motor:** "tem lote" é `lote_id` **ou** `String(lote).trim()` (`:1273`). `lote: "   "` + validade → 400
  `SEM_LOTE` (não o silêncio de hoje). Um caso no teste 6.
- **M-4 — a v1 continua descartando calada:** `POST /movimentacoes` (v1, `routes/almoxarifado.js:1301`) desestrutura 6 campos; uma
  `data_validade` ali some sem 400. Não há destino (a v1 não carrega lote), mas a RN-190.03 diz "vale igual" — declarar na B1270 que vale
  para v2 e `/transferencias`, não para a v1.
- **M-5 — A110:** a soma de `estoque_saldo_almoxarifado` por lote é o saldo **atribuído** (B204/B205), não o físico; rotular a coluna
  "saldo atribuído ao lote" para o leitor não somar com o físico do material.
- **M-6 — a literal `SO_ENTRADA` cita "ajuste":** `AJUSTE_POSITIVO` é entrada e aceita a validade (teste 7). Trocar "ou ajuste" por "ou
  ajuste de contagem (AJUSTE)" — ou aceitar a imprecisão e dizer no manual. E declarar que a recusa de saída vencida de hoje imprime a data
  em ISO (`vencido em 2027-01-31`) enquanto as frases novas usam `DD/MM/AAAA` — não mexer na antiga nesta etapa (porta de saldo).
- **M-7 — as recusas novas rodam dentro da trava:** o motor inteiro está sob `naTravaDoMaterial`; uma data malformada espera a fila do
  material para tomar 400. Mesma situação do `motivo_id` e dos `codigo_lido_*` — aceitar e declarar na B1270 (a alternativa, validar no
  schema, é a descartada lá).
- **M-8 — preenchimento errado num lote COM saldo não tem volta até a 191:** `2025` no lugar de `2027` vence o saldo antigo na hora (a
  RN-190.07 aceita passado) e o lote não é vazio (I-2 não socorre). Paliativo: liberar o vencimento (`inspecionar`). Declarar na
  B1273/B1276 e no manual, e a 191 herda o caso como primeiro cenário.
- **M-9 — T4.4 e a 189:** ler `/fila-separacao` depois de a 189 commitar (ela mexe em `requisitionService.js`); se o formato mudou, o teste
  lê `pegar_em` pelo contrato da 188. E a suíte serial só com a 189 sem sabotagem em curso (já no plano).

### RN-190.08 — a corrida existe?

Não, hoje: os dois criadores de lote (`stockService.js:1278` e `receiptService.js:1755`) rodam sob a trava do material (o recebimento pela
`comSecaoDaNota` → `comLockDosMateriais`, `receiptService.js:2120`), e não há outro `UPDATE` de `data_validade`. O `WHERE … IS NULL` é
defesa para a 191 (rota de correção que pode não pegar a trava, como `mudarStatusLote` não pega). O teste por gancho (14) só morde se o
motor chamar `lotService.preencherValidadeSeVazia` **pelo objeto do módulo** (o `require('./lotService')` de `:1265`), não desestruturado —
manter assim; a falha seria visível (o 14 cai), não vazia.

### O traço até o último gesto (pergunta 4)

| Gesto depois da entrada com validade | Aceita o que a entrada deixou? |
|---|---|
| Estorno da entrada (`cancelarMovimentacao`) | Sim — não lê validade (s2 (h): estorna lote vencido). A validade fica (RN-190.09) → **I-2** |
| Nova entrada do mesmo lote, outra data | `CONFLITO` → correto com lote vivo; **errado com lote vazio (I-2)** |
| Nova entrada do mesmo lote, mesma data / em branco | 201, sem aviso (RN-190.06) |
| Transferência com o campo | 400 `SO_ENTRADA` (hoje 201 calado, s1 (d)); a tela não manda (T3 zera na troca de tipo) |
| Devolução (`returnService`) | Não passa o campo; herda o `lote_id` — sem efeito |
| `DEVOLUCAO`/`AJUSTE_POSITIVO` pela v2 | São entrada: criam lote (s1 (f)) e aceitam a validade — coerente com a RN-190.03 |
| `AJUSTE` (absoluto) com o campo | 400 `SO_ENTRADA` |
| Saída de consumo do lote vencido | 400 literal de hoje (s2 (g)) — RN-190.11 |
| Liberar vencimento | Guarda `WHERE data_validade = lida`; com a I-2, redefinir zera a liberação |
| E-mail "Lote vencendo" | Próxima varredura; dedupe `<id>-<data>` — redefinir (I-2) reavisa, é o certo |
| FEFO da lista e dica de coleta (188) | Leem a validade do lote na hora; lote preenchido vencido sai da dica e cai no aviso "planejada indisponível" da 188 |
| Separação / entrega com origem no lote que virou vencido | Recusa em `requisitionService.js:1192` — honesta; o aviso de preenchimento (B1273) já avisa |
| Recebimento do mesmo lote depois | Fica como está (B1277, teste 16) |

## Execução

Executada em 2026-10-23 na `main`, sequencial (T1 → T2 → T3 → T4), sobre `a4358a4d` + a 189 já commitada (`ba1c7bac`). Controles por
perl `-0pi`, âncora contada = 1, md5 antes/sabotado/restaurado (restauro por cópia de `scratchpad/e190-bak-*`, todos "OK").

- [x] **T1 — `ed1e6566`.** `schemas.js` (`data_validade: z.unknown().optional()`), `lotService.js` (`MSG_VALIDADE` com as **9**
  chaves — as 7 do contrato + `AVISO_FALHA`/`AVISO_REDEFINIDA` da Fase 2 —, `dataValidadeBR`, `validarDataValidade` sobre
  `auditFiltros.validarData`, auditoria `CRIACAO` com `data_validade`), `stockService.js` (recusas `FORMATO` → `SO_ENTRADA` →
  `SEM_LOTE` logo depois do `require('./lotService')`, antes da resolução; lote novo com a validade). Teste
  `validadeLoteEntradaManual.api.test.js` cenários 1–7: vermelho 0/7 antes, 7/7 depois. Controles:
  (a) sem a linha do schema → cai o 1 na asserção **"a validade foi descartada no caminho (C450)"** (null), o 2 (serviço) **verde**,
  3 e 7 (também pela rota) caem com a validade null, e 4/5/6 viram 201 (5: `v2 SAIDA: esperava 400, veio 201`; 6: `sem lote:
  esperava 400, veio 201`);
  (b) `criarOuObterLote` sem a validade → caem 1, 2, 7 (e o 3, a auditoria, que lê o lote criado);
  (c) `validarData(...).ok` trocado pelo regex só → cai só o 4, em `valor "2027-02-30": esperava 400, veio 201`;
  (d) `SO_ENTRADA` desligada → cai só o 5, em `v2 SAIDA: esperava 400, veio 201`.
  **Divergências:** M-3 coberto no teste 6 (`lote: "   "` → `SEM_LOTE`); teste 4 ganhou `'2027-3-31'` e `' 2027-03-31'`; teste 5 ganhou
  `AJUSTE` (absoluto) com a validade → `SO_ENTRADA` e um controle interno (a mesma SAIDA e a mesma transferência **sem** a validade →
  201, prova que o 400 é da validade). Usuário: ADMIN superadmin (o `requirePermission` real; `movimentar` e `ajustar_estoque`).
- [x] **T2 — `267d668e`.** `lotService.js`: `preencherValidadeSeVazia` (`UPDATE … WHERE id = ? AND data_validade
  IS NULL RETURNING id`; perdeu → `{ preenchida: false, atual }`), `loteEstaVazio` (movimento vivo não-ESTORNO, saldo ≠ 0, série
  `EM_ESTOQUE`/`BLOQUEADA`) e `redefinirValidadeDoLoteVazio` (`WHERE data_validade = antiga`, zera as três colunas da liberação de
  vencimento), auditorias `VALIDADE_PREENCHIDA`/`VALIDADE_REDEFINIDA` por `registrarAuditoriaDoAto`. `stockService.js`: a decisão
  (preencher / nada / redefinir o vazio / 400 `CONFLITO`) logo depois da resolução do lote, antes de qualquer efeito; a gravação depois
  da auditoria do lançamento, **fora** do `try` do livro, num `try/catch` próprio (I-1: falha → `console.warn` com o id +
  `AVISO_FALHA`); `aviso_validade` = avisos unidos por espaço. Teste: cenários 8–16 + 11b, 11c, 14b, 15b e o 5 da T4 adiantado
  ("pelo serviço"): antes da implementação 11 dos 14 novos vermelhos; os 3 que passaram de primeira são os que fixam o que **não**
  muda (9 — recusa não preenche, com dente pelo controle (c); 10 — mesma validade sem aviso; 16 — recebimento intacto, B1277; os dois
  últimos sem controle prescrito); 21/21 depois. Controles: (a) sem o `IS NULL` → cai só o 14, em `AVISO_PREENCHIDA` no lugar de `AVISO_CORRIDA` (sobrescreveu);
  (b) `CONFLITO` desligada → caem o 11 (`por codigo: esperava 400, veio 201 … "estava vazio"`) e o 11c; (c) preenchimento chamado logo
  depois de resolver o lote → cai o 9 em **"a entrada recusada preencheu a validade"** (e 8, 13, 14, 14b, 5-T4 junto); (d) `<=` no aviso
  de vencido → cai só o 12, em **"hoje (2026-10-23) avisou como vencido"**; (e) `catch` que relança (= sem o `try`) → cai só o 14b,
  `500 {"error":"SQLITE_BUSY: falha injetada pelo teste e190"}`; (f) "vazio" sempre verdadeiro → caem o 11 e o 11c (redefinem).
  **Divergências:** (1) `auditLabels.js` ganhou os rótulos `Validade preenchida`/`Validade redefinida` — o plano não listava o arquivo,
  e o `auditLabels.api.test.js` (cobertura do vocabulário) caiu com os dois verbos sem rótulo; ele também pegou `acao: 'PREENCHER'` do
  objeto interno do motor, renomeado para `modo`. (2) O 14b injeta a falha **no processo** (`db.run`/`db.get` do teste trocados para o
  `UPDATE lotes_almoxarifado SET data_validade`), não pelo preload `falhaSqlInjetada.js` (que é para o `index.js` filho) — mesma
  regex, mesmo efeito. (3) O 14 segue o molde do CLAUDE.md: o gancho só sinaliza e segura; o `UPDATE` concorrente roda do contexto do
  teste; o teste confere `chamado === 1` (a chamada pelo objeto do módulo). (4) **Aviso de vencido também na "mesma validade"**: a
  RN-190.07 diz "validade no passado → `AVISO_VENCIDO`" e a RN-190.06 diz "mesma validade passa sem aviso"; no caso raro "lote vivo já
  vencido + a mesma data no passado" o motor **avisa** (a entrada está pondo saldo num lote cuja saída está barrada — é exatamente o
  que o aviso existe para dizer). O teste 10 usa data futura e continua sem aviso. Reversível: uma condição no motor. (5) O 15b
  confere também `vencimento_liberado_por` e `_motivo` nulos. (6) O 14b confere que o log cita o id da movimentação.
  Rodados sem mudança, um por vez: `loteGuardasSaida` 39/39, `lotes` 8/8, `loteRotas` 9/9, `loteRecebimento` 9/9,
  `loteVencimentoLiberacao` 8/8, `loteControleObrigatorio` 12/12, `validadesNoDiaLocal` 10/10, `auditLabels` 14/14.
- [x] **T3 — `e1a24cc3`.** `MovimentacoesAlmoxarifado.js`: `TEXTO_AJUDA_VALIDADE`, `data_validade: ''` no estado
  inicial e no `openModal`, zerada na troca de tipo e quando o Lote fica vazio (`v.trim()`), campo `#mov-validade` (`type="date"`,
  rótulo "Validade do lote", `<small>` com a ajuda) logo abaixo do Lote só com Entrada + lote, payload só com Entrada + lote + data,
  `toast.warn(aviso_validade, { autoClose: false })` depois de `aviso_caixa`/`aviso_retencao`. Teste novo
  `MovimentacoesValidadeLote.test.js`, 8 casos (os 6 do plano + "trocar de tipo zera" + "sem aviso_validade: só o sucesso"): 7/8
  vermelhos antes (o "sem data, sem chave" passa de primeira — é guarda do que não pode mudar), 8/8 depois; `Movimentacoes*` 7
  suítes, 110/110. Controles: (a) sem a linha do payload → cai só o 2, em `toMatchObject({ … data_validade: '2027-03-31' })`;
  (b) sem zerar na troca de lote → cai só o 4, em `expect(campoValidade().value).toBe('')`; (c) sem o `toast.warn` → cai só o 5, em
  `expect(toast.warn).toHaveBeenCalledTimes(2)`. **Divergência:** a primeira tentativa de editar a tela por `perl -0pi` com
  `\x{…}` re-codificou o arquivo inteiro (`Wide character`, diff de 607 linhas) — desfeita por `git checkout` do arquivo (md5 de
  volta ao de antes, `f647c1cc…`) e refeita com o Edit; CR = 0 no fim.
- [x] **Emenda da T2 achada na T4 — `1136652b`.** O controle (b) da T4 (preenchimento que sempre perde o `UPDATE`) mostrou um terceiro
  desfecho que o RN-190.08 não previa: `UPDATE` perdido com o lote **ainda sem validade** (ou apagado) — o motor caía no ramo da corrida
  e respondia `A validade do lote L-B foi gravada por outra operação () …`, data vazia e afirmação falsa. Hoje nenhuma porta chega aí (o
  `IS NULL` só perde para quem gravou uma validade), mas é o caso da I-1 visto do outro lado: agora sai `AVISO_FALHA` + log. Teste
  **14c** (gancho devolve `{ preenchida: false, atual: null }`); controle (g): sem o ramo novo cai o 14c com a frase da corrida e o
  "()". Arquivo T2: 22/22.
- [x] **T4 — hash no fechamento deste plano (próximo commit).** `validadeLoteEntradaManualIntegracao.api.test.js`, 5 cenários, cada um
  entrando pela **rota v2** e conferindo noutra porta sem mudança, cada um com o próprio controle "a mesma entrada **sem** a validade":
  (1) `GET /materiais/:id/lotes` → `['LV','LS']` (controle `['LS','LV']`); (2) `varrerLotesVencendo` → 1 `LOTE_VENCENDO` com
  `hash_dedupe = sha256('LOTE_VENCENDO|lote-vencendo-<id>-<hoje+10>')` (controle: 0 para o lote sem validade); (3) SAIDA → 400
  `Lote L-VENC vencido em <ontem> nao pode sair para consumo.…`, `PUT /lotes/:id/liberar-vencimento` → 200, SAIDA → 201 (controle: o
  mesmo lote sem validade sai direto); (4) `GET /fila-separacao` → `pegar_em` `['L-A', ZA, '2027-12-31']`; Entrada de 1 em L-B com
  `2027-06-30` (+ `AVISO_PREENCHIDA`) → `['L-B', ZB, '2027-06-30']` (rodou com a 189 commitada, `ba1c7bac`; o formato de `pegar_em` é o
  da 188); (5) pelo serviço → o mesmo aviso e a mesma validade. **Passou de primeira (5/5)** — a implementação já existia; controles
  positivos: (a) sem a linha do schema → caem 1–4 (FEFO `['LS','LV']`; e-mail `0 !== 1`; saída `201 !== 400`; fila `lote_validade
  null`), o 5 (serviço) **verde** — a prova de que os quatro medem a rota; (b) preenchimento que sempre perde → caem 4 e 5 (e expôs a
  emenda acima). Rodados junto, um por vez: `filaSugestaoColetaIntegracao` 6/6, `preSelecaoColetaIntegracao` 7/7, `sugestaoDeColeta`
  36/36. **Tela pelo fluxo:** não medida no navegador nesta sessão (roteiro no plano, para a letra F no fechamento).
  **Achado para o fechamento:** `filaSugestaoColetaIntegracao.api.test.js` (188) tem o comentário "A entrada manual nao grava a validade
  do lote (Execucao, T2): grava aqui." — falso desde esta etapa; o teste continua certo (grava por `UPDATE` direto), só o comentário
  envelheceu. Não mexido (arquivo da 188, fora das tasks).

## Próxima tarefa detalhada

*(preencher no fechamento.)* Rascunho do que o fechamento deve confirmar: **Etapa 191 — corrigir a validade de um lote** (B1276, B1277).
Rota `PUT /api/almoxarifado/lotes/:id/validade` com `requirePermission('inspecionar')` (o perfil de `status` e `liberar-vencimento`,
`extended.js:1256, :1307`), corpo `{ data_validade: 'AAAA-MM-DD' | null, justificativa }`, `lotService.MSG_VALIDADE.FORMATO` reaproveitada,
`UPDATE … WHERE id = ? AND data_validade IS ?` (guarda contra a lida), auditoria `acao='CORRECAO_VALIDADE'` com antes/depois e
justificativa. Pontos de atenção: (1) lote com `vencimento_liberado_em` — a liberação guarda contra a data (`lotService.js:182`); corrigir
a data deve **anular** a liberação (a liberação era daquela validade) e dizer isso na resposta; (2) a dedupe do e-mail é por
`<id>-<data>` — a correção reavisa, é o certo; (3) separação planejada num lote que a correção venceu passa a recusar na entrega
(`requisitionService.js:1162`) — aviso; (4) o recebimento passa a usar `preencherValidadeSeVazia` (o cenário 16 da T2 muda de propósito) e
a recusar ou avisar a nota com outra validade (decidir: a nota é documento fiscal, recusar travaria o processamento — provavelmente aviso);
(5) botão "Corrigir validade" na tela de Lotes e Séries (`LotesAlmoxarifado.js`).
