# Etapa 191 — Corrigir a validade de um lote que já tem saldo

> **Status:** 📝 **plano escrito (2026-10-23, sobre `1ccb47f4` + o fix-round da Fase 5 da 190 ainda não commitado na árvore).
> Fase 2 não feita. Execução não começou.**
> Feature **10** (lotes, séries e etiquetas). Herda a **B1276** (corrigir validade fica para a 191), o **M-8** da Fase 2 da 190
> (preenchimento errado num lote com saldo não tem volta) e o **Menor 4** da Fase 5 da 190 (ano digitado errado deixava o lote preso —
> a 190 fechou a porta de entrada com a literal `ANO`, B1280; o que já entrou errado continua preso até esta etapa).
> **Concorrência:** outra sessão está **fechando a Etapa 190** agora (`docs/almoxarifado-novidades-por-etapa.md`, specs, manual, guia,
> plano da 190, `stockService.js`, `lotService.js`). **A execução da 191 só começa depois do commit de fechamento da 190**: a T1 mexe em
> `lotService.js` (mesmo arquivo) e reaproveita `MSG_VALIDADE.ANO`, que hoje só existe na árvore de trabalho da 190. Primeiro passo da T1:
> `git log -1 -- server/services/almoxarifado/lotService.js` tem de mostrar o fechamento da 190 e `grep -n "ANO:" lotService.js` tem de
> achar a chave — senão, parar e esperar (não copiar a frase).
> **Letra B:** quando este plano foi escrito a novidades ia até **B1269** commitado; a 190 reservou **B1270–B1279** e o fix-round da Fase 5
> dela já usa **B1280/B1281** (na árvore, não commitado). Esta etapa usa **B1290–B1299** — conferir no fechamento se a 190 não passou de
> B1289; se passou, renumerar a partir do próximo livre. Letra A: nenhuma nova.
> Tamanho: **M**.

## Objetivo (em linguagem simples)

Hoje a validade de um lote, depois de gravada, **não muda mais** — a não ser que o lote esteja vazio (a "redefinição" da Etapa 190, que
só vale para lote sem saldo e sem movimento).

O problema: quem digita `2025` no lugar de `2027` numa Entrada (ou recebe uma nota com a data errada) cria um lote que o sistema acha
**vencido**. A cola boa fica **barrada** na saída, a separação recusa, o e-mail "Lote vencendo" dispara e o lote vai para a frente da
fila "primeiro que vence sai primeiro". Ou o contrário: `2027` no lugar de `2025`, e a cola **vencida** sai para a produção. O único
remendo hoje é "liberar o vencimento" (que não conserta a data, só assina "pode usar mesmo vencido") ou trocar o código do lote — que
está impresso na embalagem.

Depois desta etapa:

1. Na tela **Lotes e Séries**, quem tem o perfil de qualidade/almoxarife (a ação `inspecionar` — a mesma de bloquear lote e liberar
   vencimento) vê o botão **"Corrigir validade"** em cada lote.
2. Ele informa a data certa e **por que** está corrigindo. O sistema grava, registra na auditoria **a data antiga, a nova e o motivo**.
3. Tudo o que depende da validade passa a usar a data nova na hora: a saída barrada (ou liberada), a fila FEFO, a dica de coleta e o
   e-mail de vencendo.
4. Se o lote tinha o vencimento **liberado**, a liberação **cai** (ela era da data antiga) — e a resposta avisa.
5. A resposta também avisa se o lote ficou vencido, se há itens de requisição já separados dele esperando entrega (a entrega vai
   recusar), e que as etiquetas já impressas mostram a data antiga.

Analogia: a etiqueta de validade colada na caixa estava errada. Antes, só dava para arrancar se a caixa estivesse vazia. Agora o
responsável pela qualidade pode trocar a etiqueta de uma caixa cheia — mas assina o livro dizendo "era 10/03/2025, é 10/03/2027,
porque a nota diz 2027".

**Fora desta etapa (declarado, B1296):** o **recebimento** continua como está — segunda nota do mesmo lote com outra validade mantém a
da primeira, calada; lote nascido sem validade e depois recebido com validade continua sem. O remédio para o resultado desses dois casos
passa a existir (esta rota); a mudança da porta do recebimento é candidata à Etapa 192.

## Fase 0 (medido em 2026-10-23, sobre `1ccb47f4` + árvore da 190)

> As linhas de `lotService.js` e `stockService.js` são da árvore de trabalho com o fix-round da Fase 5 da 190 (+8 linhas no
> `lotService.js` antes de `:66`). **Remedir na T1** depois do commit da 190.

**O dono da tabela.** `server/services/almoxarifado/lotService.js` é o único escritor de `lotes_almoxarifado` (cabeçalho `:1-11`).
Os `UPDATE` de `data_validade` existentes, todos da Etapa 190:

| Função | Linha | Guarda | Quando |
|---|---|---|---|
| `preencherValidadeSeVazia` | `:150-165` | `WHERE id = ? AND data_validade IS NULL` | Entrada manual em lote sem validade (RN-190.05) |
| `redefinirValidadeDoLoteVazio` | `:185-200` | `WHERE id = ? AND data_validade = ?` (a lida); **zera** `vencimento_liberado_em/_por/_motivo` | Entrada em lote **vazio** com outra validade (RN-190.06b) |
| `loteEstaVazio` | `:171-178` | — (leitura) | movimento vivo não-ESTORNO, saldo ≠ 0, série `EM_ESTOQUE`/`BLOQUEADA` |

Os dois são chamados **só pelo motor** (`stockService.js:1312` decide, `:2495-2496` grava, depois do livro, num `try/catch` próprio —
I-1 da 190), **dentro** de `registrarMovimentacao` (`:1104`), que roda inteiro sob `trava.naTravaDoMaterial`. Lote com saldo e outra
validade → 400 `MSG_VALIDADE.CONFLITO` (`:45`), cuja literal termina com **"Se a validade gravada está errada, peça a correção do
lote."** — e hoje **não há** a quem pedir: não existe rota que mude `data_validade` (grep `lotes/:id/validade` em `server/routes` e
`client/src` → 0; controle: o mesmo grep com `liberar-vencimento` acha `extended.js:1256` e `LotesAlmoxarifado.js:295`).

**As literais reaproveitáveis** (`lotService.js:38-60`, `MSG_VALIDADE`): `FORMATO` (`AAAA-MM-DD` de data que existe — `validarData` de
`auditFiltros.js:55-67`), `ANO` (fix-round da 190, B1280: ano fora de 2000–2100), e o formatador `dataValidadeBR` (`:31-35`, troca os
campos sem `new Date`; valor que não casa `^\d{4}-\d{2}-\d{2}` sai como gravado — M-2 da 190). `validarDataValidade` (`:66-73`) devolve
`{ informada: false }` para `""`/`null`/ausente — na rota de correção isso tem de virar recusa (a correção exige data).

**Liberação de vencimento** — `liberarVencimento` (`:284-317`): justificativa obrigatória → 404 `Lote nao encontrado` → recusa `Lote nao
esta vencido; nao ha vencimento para liberar` → `UPDATE … SET vencimento_liberado_em = CURRENT_TIMESTAMP, vencimento_liberado_por = ?,
vencimento_liberado_motivo = ? WHERE id = ? AND data_validade = ?` (**guarda contra a data lida**: a liberação é de uma validade) → 409
`O lote mudou durante a operacao. Recarregue e tente de novo.` → auditoria `LIBERACAO_VENCIMENTO`. `vencimentoLiberado` (`:273-275`) só
olha `vencimento_liberado_em`; `isVencido` (`:80-84`) só olha `data_validade < hoje de Brasília` — eixos independentes.
**Quem pode liberar:** `PUT /api/almoxarifado/lotes/:id/liberar-vencimento` com `requirePermission('inspecionar')`
(`routes/almoxarifado/extended.js:1256`). `inspecionar` = `ADMINISTRADOR, ALMOXARIFE, QUALIDADE` (`permissions.js:112`; a QUALIDADE
entrou na Etapa 24 justamente para decidir "inspeção de recebimento, vencimento de lote, status de lote e status de série",
`permissions.js:14-17`). `ajustar_estoque` = `ADMINISTRADOR, GESTOR` (`:26`) — **não** tem QUALIDADE nem ALMOXARIFE. O 403 é
`{ error: 'Sem permissão para esta operação', acao, perfil }` (`permissions.js:292`).

**As outras rotas de lote** (`extended.js`): `GET /materiais/:id/lotes` (`:1263`, `visualizar`, `listarLotesDoMaterial` — devolve `l.*`
com `data_validade`, `vencimento_liberado_*`, `vencido`, `elegivel`), `GET /materiais/:id/lotes/resumo` (`:1301`), `PUT /lotes/:id/status`
(`:1307`, `inspecionar`, `mudarStatusLote` — justificativa → 404 → `UPDATE … WHERE status = lido` → 409). O `handleError` da rota
(`extended.js:104-107`) devolve `err.status || 500` com `{ error: err.message }`. `mudarStatusLote` e `liberarVencimento` **não** pegam a
trava por material.

**Auditoria.** `registrarAuditoriaDoAto` (falha vai ao log, não derruba — Etapa 121, C252). Vocabulário em
`server/services/almoxarifado/auditLabels.js:242-244`: `LIBERACAO_VENCIMENTO` → "Liberação por vencimento", `VALIDADE_PREENCHIDA` →
"Validade preenchida", `VALIDADE_REDEFINIDA` → "Validade redefinida". `tests/api/auditLabels.api.test.js` varre o código e **cai** se um
verbo novo não tiver rótulo (foi o que pegou a 190, divergência (1) da T2) — é o controle positivo natural da auditoria nova.

**Quem lê a validade (a jusante), e se lê sob a trava:**

| Leitor | Onde | Sob a trava do material? | Efeito da correção |
|---|---|---|---|
| Saída de consumo de lote vencido | `stockService.js:1576-1580` (literal `Lote <cód> vencido em <data ISO> nao pode sair para consumo. …`) | sim (motor inteiro) | barra / deixa passar |
| Separação e entrega com origem em lote vencido | `requisitionService.js:1191-1195` (`checarOrigemItem`, chamada por `separarSemTrava` `:1436` e `entregarSemTrava` `:1788`) | sim (`comTravaDaRequisicao`, Etapa 95) | separação planejada no lote pode passar a recusar na entrega |
| Entrada manual com validade (190) | `stockService.js:1269-1320` decide; `:2495` grava | sim | `CONFLITO` / preencher / redefinir |
| FEFO da lista de lotes | `lotService.listarLotesDoMaterial` `:326-366` (nulos = `9999-12-31`) | não (leitura) | reordena |
| Dica de coleta (188/189) | `sugestaoDeColeta.js:100-102` via `requisitionService.lerDadosDaColeta` `:309-353` ("Sem trava: só lê", RN-188.07) | não | troca o `pegar_em` |
| E-mail "Lote vencendo" | `notificationQueueService.varrerLotesVencendo` `:482-525` — `ATIVO`, validade ≤ hoje+dias, `vencimento_liberado_em IS NULL`, saldo > 0; dedupe `lote-vencendo-<id>-<data_validade>` | não | data nova = chave nova = reavisa; **o item já enfileirado com a data antiga não é revalidado** |
| Relatório saldo por lote | `reportService.js:43` | não | mostra a nova |
| Etiqueta impressa | `client/src/utils/etiquetasPdf.js:36` (`· Val DD/MM/AAAA`) | — (papel) | **a impressa fica errada** |

**Reserva não lê lote.** A reserva é por material (saldo global — regra do CLAUDE.md; a spec 10 lista "reserva por lote/série
inexistente" como pendência aberta, `specs/modulo-almoxarifado/README.md:1365`). A aprovação não consulta `data_validade`. Ou seja: a
validade **não** entra no "disponível para reservar" — ela decide **qual lote pode sair**, lido sob a trava pela saída, pela separação e
pela entrega.

**Séries.** `series_almoxarifado` tem `lote_id` (`schema.js:~1565`) e **nenhuma** coluna de validade (grep `data_validade` em
`seriesService.js` → 0). A série herda a validade pelo lote: a correção não toca série nenhuma.

**O recebimento.** `receiptService.js:1747-1773`: dentro de `comSecaoDaNota` (`:2115`, sob `comLockDosMateriais`), `criarOuObterLote`
com `data_validade: item.data_validade_lote`. `criarOuObterLote` (`lotService.js:101-142`) devolve o existente **sem tocar** (comentário
`:97-100`, de propósito). Fixado pelo cenário **16** de `validadeLoteEntradaManual.api.test.js` (190, B1277) "para a 191 mudar de
propósito". **Esta etapa não muda** (B1296): o 16 continua verde, e isso é conferido.

**A tela** — `client/src/components/almoxarifado/LotesAlmoxarifado.js` (862 linhas): ícones de `react-icons/fi` (`:5`);
`useAlmoxPermissoes()` → `{ pode, bloquearSeNaoPode }` (`:103`); a coluna de validade (`:472-498`, `formatData` de `:78` com `T12:00:00`,
badge `VENCIDO`/`VENCIDO (liberado)` e "Liberado por usuário #…"); a coluna de ações (`:512-530`): "Mudar status" (`FiSliders`,
`bloquearSeNaoPode('inspecionar')`), "Liberar vencimento" (`FiUnlock`, só `l.vencido`), "Anexar certificado", "Imprimir etiqueta"; modal
de liberar vencimento (`:749-782`) e o handler `confirmarVencimento` (`:291-305`: `api.put`, `toast.success`, `setVencimentoTarget(null)`,
`loadLotes()`; erro → `toast.error(err.response?.data?.error || …)`, modal aberto). O hook (`client/src/hooks/useAlmoxPermissoes.js:60-84`):
`pode` devolve **true** enquanto carrega ou se a carga falhou (falha aberto); `bloquearSeNaoPode` mostra o texto do 403. Os irmãos
mostram o botão sempre e barram no clique; `pode('ajustar_estoque') && …` (`:577`, `:646`) é o precedente de **esconder**.
Testes da tela: `LotesAlmoxarifado.test.js` (mock de `api`, `react-toastify` e `useAlmoxPermissoes` em `:21-40`).

**Os moldes de teste:** `loteVencimentoLiberacao.api.test.js` (runner, `ADMIN` e `PRODUCAO` com `perfil_almoxarifado`, `loteVencido`),
`loteRotas.api.test.js`, `validadeLoteEntradaManual.api.test.js` e `…Integracao.api.test.js` (190), `travaPorMaterial.api.test.js` e
`exclusaoSerieQueVoltou.api.test.js` RN-15 (corrida: o gesto concorrente sai do **contexto do teste**, nunca de dentro da seção — senão
herda o `AsyncLocalStorage` e passa direto pela trava).

### Divergências e achados da Fase 0

1. **A literal da 190 manda "pedir a correção" a uma porta que não existe** (`CONFLITO` `:45-46` e `AVISO_FALHA`). Com a 191 a porta
   existe — as duas frases passam a nomear o botão (RN-191.11, B1298). Não é spec errada; é frase que envelhece com esta etapa.
2. **O rascunho da 190 chamava a auditoria de `CORRECAO_VALIDADE`.** Este plano usa **`VALIDADE_CORRIGIDA`**, na família de
   `VALIDADE_PREENCHIDA`/`VALIDADE_REDEFINIDA` (a tela de auditoria agrupa por rótulo; o nome segue o vizinho).
3. **O rascunho aceitava `data_validade: null` (apagar a validade).** Este plano **recusa** (B1293): apagar tira o lote de todas as
   regras de vencimento, e nenhum caso medido pede isso.
4. **O rascunho citava `requisitionService.js:1162`** para a recusa da entrega — está em **`:1191`** (M-1 da 190, ainda vale).
5. **E-mail já enfileirado não é revalidado** (`varrerLotesVencendo` só enfileira; o envio não relê o lote). Um aviso de vencendo com a
   data errada que já está na fila sai mesmo depois da correção. Declarado (B1297), não corrigido.

## Regras

| ID | Regra | Cenário |
|---|---|---|
| **RN-191.01** | `PUT /api/almoxarifado/lotes/:id/validade` corrige a validade de **qualquer** lote existente — com saldo, sem saldo, com histórico, sem validade, de qualquer status (`ATIVO`, `BLOQUEADO`, `REPROVADO`), de material ativo ou inativo. Grava a data e responde 200 com o lote atualizado. | L1 com 10 un, validade `2025-03-10` (errada) → PUT `{ data_validade: '2027-03-10', validade_vista: '2025-03-10', justificativa: 'NF diz 2027' }` → 200, `lote.data_validade = '2027-03-10'`, saldo 10 intacto. |
| **RN-191.02** | **Permissão:** `requirePermission('inspecionar')` (ADMINISTRADOR, ALMOXARIFE, QUALIDADE) — a mesma de liberar vencimento e mudar status do lote. Sem a ação → 403 do `requirePermission` real, nada gravado, nenhuma auditoria. | PRODUCAO (fallback) → 403; GESTOR (tem `ajustar_estoque`, não `inspecionar`) → 403; QUALIDADE → 200. |
| **RN-191.03** | **Data:** obrigatória (ausente, `""`, `null` → 400 `OBRIGATORIA`); formato e calendário de `validarDataValidade` (→ 400 `FORMATO`); ano 2000–2100 (→ 400 `ANO`). **Data no passado é aceita** (o lote fica vencido — RN-191.07). Não existe "apagar a validade" (B1293). | `null` → `OBRIGATORIA`; `"10/03/2027"`, `"2027-02-30"`, `20270310` → `FORMATO`; `"0202-03-10"` → `ANO`; ontem → 200 + aviso. |
| **RN-191.04** | **Justificativa** obrigatória (`String(...).trim()` não vazio) → 400 `JUSTIFICATIVA`. Vai para a auditoria e para nada mais. | `"   "` → 400. |
| **RN-191.05** | **`validade_vista`** (a validade que a tela mostrava: `"AAAA-MM-DD"` ou `null` para lote sem validade) é **obrigatória** como chave (ausente → 400 `VISTA_OBRIGATORIA`). Comparada com a gravada por `String(gravada).slice(0, 10)` (régua do `isVencido`; `null` só casa `null`). Diferente → **409 `MUDOU`** com a validade de agora — ninguém corrige por cima de uma correção que não viu. | Duas abas abertas em L1 (`2025-03-10`); a primeira corrige para `2027-03-10`; a segunda manda `validade_vista: '2025-03-10'` → 409 "agora 10/03/2027"; nada gravado pela segunda. |
| **RN-191.06** | **Mesma data** (nova === gravada, mesma régua) → 400 `MESMA`, nada gravado, sem auditoria. | L1 `2027-03-10` → PUT `2027-03-10` → 400. |
| **RN-191.07** | **Efeito imediato em todas as regras de hoje, sem mudar nenhuma delas:** saída de consumo (`stockService.js:1576`), separação e entrega (`requisitionService.js:1191`), FEFO da lista, dica de coleta, e-mail de vencendo. Corrigir para o passado **vence** o lote; corrigir para o futuro **desvence**. | T4. |
| **RN-191.08** | **Liberação de vencimento:** se a data **muda** e o lote tinha `vencimento_liberado_em`, as três colunas da liberação são **zeradas no mesmo `UPDATE`** (a liberação era da data antiga — mesmo raciocínio da `redefinirValidadeDoLoteVazio`), e a resposta traz `AVISO_LIBERACAO_ANULADA`. Vale também quando a nova data continua no passado: liberar de novo, com nova justificativa. | L2 vencido `2025-01-10`, liberado; corrigir para `2025-01-20` → 200, `vencimento_liberado_em` nulo, saída → 400; liberar → 200; saída → 201. |
| **RN-191.09** | **Auditoria** `entidade='lote'`, `acao='VALIDADE_CORRIGIDA'`, `dados_anteriores { data_validade, vencimento_liberado_em, vencimento_liberado_por, vencimento_liberado_motivo }`, `dados_novos { data_validade, liberacao_anulada: bool }`, `justificativa`. Por `registrarAuditoriaDoAto` (falha não derruba — a correção já gravou). Rótulo **"Validade corrigida"** em `auditLabels.js`. | Linha de auditoria com antes/depois e o motivo literal. |
| **RN-191.10** | **Avisos** (`avisos: string[]` na resposta, na ordem): `AVISO_LIBERACAO_ANULADA` (se havia liberação) → `AVISO_VENCIDO` (se a nova < hoje de Brasília) → `AVISO_SEPARACAO` (se vencido **e** há itens com `lote_separacao_id` = o lote, separado − entregue > 0, requisição ativa em `STATUS_COM_CAIXA` — a régua de `lerDadosDaColeta` `:321-326`) → `AVISO_ETIQUETA` (se a validade antiga não era nula). Sem nenhum → `[]`. | L3 com 2 itens separados não entregues, corrigido para ontem → `avisos` = [VENCIDO, SEPARACAO(2), ETIQUETA]. |
| **RN-191.11** | As literais `CONFLITO` e `AVISO_FALHA` da 190 deixam de mandar "pedir a correção" e passam a nomear o botão **"Corrigir validade" na tela de Lotes e Séries**. Só texto; a regra da 190 não muda. | O 400 `CONFLITO` da Entrada cita o botão. |
| **RN-191.12** | **Trava:** a correção roda sob `trava.naTravaDoMaterial(lote.material_id)` — releitura do lote, conferências `MUDOU`/`MESMA`, `UPDATE` com guarda e auditoria dentro da seção; a contagem de separação e a resposta fora. O `UPDATE` guarda `WHERE id = ? AND data_validade IS ?` (a lida) mesmo sob a trava (defesa; não casar → 409 `MUDOU`). | Corrida: trava do material segura pelo teste (do contexto do teste) → o PUT **espera**; soltou → 200. Controle: sem a trava, o PUT termina com a trava segura. |
| **RN-191.13** | **A tela:** na aba Lotes de "Lotes e Séries", botão **"Corrigir validade"** (ícone `FiCalendar`) em todo lote, **visível só com `pode('inspecionar')`** (falha aberto: carregando/erro → visível; o backend decide) e com `bloquearSeNaoPode('inspecionar')` no clique. Modal com a validade atual, o campo de data, a justificativa e o botão "Corrigir" (desabilitado sem data ou sem justificativa). Sucesso → `toast.success`, cada aviso `toast.warn(…, { autoClose: false })`, fecha, recarrega. Erro → `toast.error` com a literal, **modal aberto, nada perdido**. | T3. |
| **RN-191.14** | **O que não muda:** o recebimento (B1296 — cenário 16 da 190 continua verde), a Entrada manual da 190 (fora o texto da RN-191.11), séries (herdam pelo `lote_id`), `PUT /lotes/:id/liberar-vencimento`, `PUT /lotes/:id/status`, nenhuma migration. | Suítes da 190 e de lote verdes sem mudança (exceto literais). |

## Contrato (congelado)

### `PUT /api/almoxarifado/lotes/:id/validade` (novo)

Gate: `auth, requirePermission('inspecionar')` (`routes/almoxarifado/extended.js`, logo depois de `PUT /lotes/:id/status`, `:1307`).
`:id` → `Number(req.params.id)` (não inteiro/inexistente → 404).

Payload:

```json
{ "data_validade": "2027-03-10", "validade_vista": "2025-03-10", "justificativa": "NF 1234 diz 03/2027" }
```

Resposta 200:

```json
{ "lote": { "...": "linha de lotes_almoxarifado depois do UPDATE (getLote)" }, "avisos": ["..."] }
```

**Ordem das recusas** (as de payload antes de ler o lote — molde `mudarStatusLote`/`liberarVencimento`; todas antes de qualquer efeito):

| # | Código | Chave (`MSG_VALIDADE`) | Quando | Mensagem literal |
|---|---|---|---|---|
| 0 | 403 | — (do `requirePermission`) | sem `inspecionar` | `Sem permissão para esta operação` |
| 1 | 400 | `OBRIGATORIA` (nova) | `data_validade` ausente, `""` ou `null` | `Informe a nova validade do lote (AAAA-MM-DD).` |
| 2 | 400 | `FORMATO` (190) | não é `AAAA-MM-DD` de data que existe | `A validade do lote deve ser uma data no formato AAAA-MM-DD (ex.: 2027-03-31).` |
| 3 | 400 | `ANO` (190, B1280) | ano fora de 2000–2100 | `A validade do lote deve ter o ano entre 2000 e 2100 — confira a data digitada (ex.: 2027-03-31).` |
| 4 | 400 | `JUSTIFICATIVA` (nova) | vazia depois do `trim` | `Informe a justificativa da correção da validade — ela fica na auditoria do lote.` |
| 5 | 400 | `VISTA_OBRIGATORIA` (nova) | chave `validade_vista` ausente (`undefined`), ou presente e nem `null` nem `AAAA-MM-DD` válido | `Informe a validade que a tela mostrava (validade_vista: AAAA-MM-DD, ou null se o lote não tinha validade).` |
| 6 | 404 | — (existente) | lote não existe (antes da trava; e de novo na releitura dentro dela) | `Lote nao encontrado` |
| 7 | 409 | `MUDOU` (nova, função `(codigo, atualISO)`) | `validade_vista` ≠ gravada; ou o `UPDATE` com guarda não casou | `A validade do lote <código> mudou enquanto a tela estava aberta (agora <DD/MM/AAAA ou "sem validade">). Recarregue e confira antes de corrigir.` |
| 8 | 400 | `MESMA` (nova, `(codigo, dataISO)`) | nova === gravada | `O lote <código> já tem a validade <DD/MM/AAAA>. Nada a corrigir.` |

Avisos (`avisos[]`, ordem fixa da RN-191.10):

| Chave | Mensagem literal |
|---|---|
| `AVISO_LIBERACAO_ANULADA` `(codigo)` | `O lote <código> tinha o vencimento liberado para a validade anterior; a liberação foi anulada. Se ele ainda pode ser usado, libere o vencimento de novo.` |
| `AVISO_CORRIGIDA_VENCIDO` `(codigo, dataISO)` | `Com a validade corrigida (<DD/MM/AAAA>), o lote <código> está vencido: a saída para consumo fica bloqueada até liberar o vencimento.` |
| `AVISO_SEPARACAO` `(codigo, n)` | `Há <n> item(ns) de requisição separado(s) do lote <código> ainda não entregue(s); a entrega vai recusar o lote vencido até liberar o vencimento ou separar de outro lote.` |
| `AVISO_ETIQUETA` `(codigo, antigaISO)` | `As etiquetas já impressas do lote <código> mostram a validade antiga (<DD/MM/AAAA>) — reimprima.` |

`<DD/MM/AAAA>` = `dataValidadeBR`. "sem validade" é o texto quando a validade de agora é `null` (só no `MUDOU`).

### `lotService` (interno, congelado para T1/T2)

- `MSG_VALIDADE` ganha `OBRIGATORIA`, `JUSTIFICATIVA`, `VISTA_OBRIGATORIA`, `MUDOU`, `MESMA`, `AVISO_LIBERACAO_ANULADA`,
  `AVISO_CORRIGIDA_VENCIDO`, `AVISO_SEPARACAO`, `AVISO_ETIQUETA`; `CONFLITO` e `AVISO_FALHA` trocam o fim (RN-191.11):
  - `CONFLITO`: `… deixe o campo em branco ou informe a mesma data. Se a validade gravada está errada, corrija-a em Lotes e Séries → "Corrigir validade".`
  - `AVISO_FALHA`: `… Não repita a entrada; corrija a validade em Lotes e Séries → "Corrigir validade".`
- `corrigirValidadeDoLote(db, user, loteId, { data_validade, validade_vista, justificativa })` → `{ lote, avisos }`. Lança `erro(msg,
  status)` com as literais acima. Payload validado **fora** da trava; `getLote` fora (para o `material_id`); depois
  `trava.naTravaDoMaterial(material_id, corrigirValidadeDoLoteSemTrava)` — `require('./travaPorMaterial')` **pelo objeto**, como
  `seriesService.js:359` (os testes espiam). Dentro: `getLote` de novo (404), `MUDOU`, `MESMA`,
  `UPDATE lotes_almoxarifado SET data_validade = ?, vencimento_liberado_em = NULL, vencimento_liberado_por = NULL, vencimento_liberado_motivo = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND data_validade IS ? RETURNING id`
  (zerar a liberação sempre que a data muda — RN-191.08; se não havia, zerar nulo é inócuo), 409 `MUDOU` se não casou, auditoria.
  Fora da seção: a contagem de separação (só se vencido), a montagem dos avisos, o `getLote` final.
- Nenhuma mudança em `criarOuObterLote`, `preencherValidadeSeVazia`, `redefinirValidadeDoLoteVazio`, `liberarVencimento`.

### Sem mudança

`GET /materiais/:id/lotes` (já devolve tudo que a tela precisa), `/lotes/resumo`, `liberar-vencimento`, `status`, `certificado`, o
motor (fora as duas literais), o recebimento, `ACAO_PERFIS` (nenhuma ação nova). Nenhuma migration.

### Frases da tela (congeladas)

- Botão (title/aria-label): **`Corrigir validade`**.
- Modal: título **`Corrigir validade`**; linha **`Lote <código> — validade atual: <DD/MM/AAAA>`** (ou **`sem validade`**); rótulo do
  campo **`Nova validade`** (`<input type="date" id="lote-validade-nova">`); rótulo **`Justificativa`**
  (`<textarea id="lote-validade-justificativa" placeholder="Por que a validade gravada está errada? (ex.: a NF diz 03/2027)">`);
  ajuda **`A validade vale para todo o saldo do lote. Se ele tinha o vencimento liberado, a liberação cai.`**; botões **`Cancelar`** e
  **`Corrigir`**.
- Sucesso: **`Validade do lote corrigida!`**. Erro sem `error` no corpo: **`Erro ao corrigir a validade do lote`**.

## Tasks

Ordem: **T1 (tronco) → T2 (tronco) → T3 (galho, pode começar junto com T1 contra o contrato) → T4 (integração).** T1 e T2 mexem em
`lotService.js` e no mesmo teste novo — sequenciais. T3 é tela contra o contrato congelado (mock só na fronteira HTTP), dona **só** de
`LotesAlmoxarifado.js` e do teste novo da tela.

**Pré-condição de todas:** a 190 commitada (ver o cabeçalho). Controles positivos: perl `-0pi` sobre base LF, âncora contada = 1, md5
antes/sabotado/restaurado (memórias "harness: base é LF" e "python3 indisponível"; **não** usar `\x{…}` no perl em arquivo com acento — a
T3 da 190 re-codificou a tela inteira assim; para o `.js` da tela, sabotar com o Edit e restaurar por `git checkout` do arquivo, md5
conferido). Registrar cada vermelho no plano. Sabotar produção só sem outra sessão rodando a suíte.

### T1 (tronco) — a rota, as recusas, a gravação e a auditoria

Arquivos: `server/services/almoxarifado/lotService.js` (chaves novas de `MSG_VALIDADE`, `corrigirValidadeDoLote` +
`…SemTrava`, export), `server/routes/almoxarifado/extended.js` (a rota), `server/services/almoxarifado/auditLabels.js`
(`{ rotulo: 'Validade corrigida', verbos: ['VALIDADE_CORRIGIDA'] }`, depois de `:244`).

Teste novo `server/tests/api/corrigirValidadeLote.api.test.js` (runner próprio; `createTestApp` com `requirePermission` real; usuários
`ADMIN`, `QUALIDADE` (`perfil_almoxarifado: 'QUALIDADE'`), `ALMOXARIFE`, `GESTOR`, `PRODUCAO`; lote com saldo montado por
`criarOuObterLote` + `registrarMovimentacao` ENTRADA, molde `loteVencimentoLiberacao`):

1. `[RN-191.01] corrige lote com saldo pela rota` — L1 10 un `2025-03-10` → 200; banco com `2027-03-10`; saldo e físico intactos;
   `lote` da resposta = linha do banco.
2. `[RN-191.01] pelo servico tambem` — `lotService.corrigirValidadeDoLote` direto.
3. `[RN-191.01] lote sem validade recebe validade` (o caso da A110) — `validade_vista: null` → 200; auditoria com antes `null`.
4. `[RN-191.01] lote BLOQUEADO, REPROVADO e de material inativo` → 200 (status intocado).
5. `[RN-191.02] quem pode` — QUALIDADE 200, ALMOXARIFE 200; **PRODUCAO 403 e GESTOR 403** com `error === 'Sem permissão para esta
   operação'` e `acao === 'inspecionar'`; banco e auditoria intocados nos 403.
6. `[RN-191.03] data` — ausente/`""`/`null` → `OBRIGATORIA`; `"10/03/2027"`, `"2027-02-30"`, `20270310`, `["2027-03-10"]` → `FORMATO`;
   `"0202-03-10"`, `"2101-01-01"` → `ANO`; cada um com o lote intocado.
7. `[RN-191.04] justificativa` — ausente, `""`, `"   "` → `JUSTIFICATIVA`.
8. `[RN-191.05] validade_vista` — ausente → `VISTA_OBRIGATORIA`; `"lixo"` → `VISTA_OBRIGATORIA`; diferente da gravada → 409 `MUDOU`
   literal com `DD/MM/AAAA`; lote sem validade e `validade_vista: '2027-01-01'` → 409 com "sem validade"; gravada `2027-03-10 00:00:00`
   (M-2, recebimento) e vista `2027-03-10` → **não** é 409 (régua `slice(0,10)`).
9. `[RN-191.06] mesma data` → 400 `MESMA`, sem auditoria nova.
10. `[RN-191.0x] ordem` — payload inválido **e** lote inexistente → 400 do payload (não 404); payload válido e lote inexistente → 404
    `Lote nao encontrado`; `/lotes/abc/validade` → 404.
11. `[RN-191.09] auditoria` — `acao = 'VALIDADE_CORRIGIDA'`, `dados_anteriores`/`dados_novos`/`justificativa` como a RN.
12. `[RN-191.08] liberacao anulada` — L2 vencido liberado → corrigir para outra data passada → 200, três colunas nulas,
    `liberacao_anulada: true` na auditoria; corrigir L1 (não liberado) → `liberacao_anulada: false`.

**Controles positivos:**
(a) **a permissão proibida concedida:** acrescentar `PERFIS.PRODUCAO` em `ACAO_PERFIS.inspecionar` → cai o 5 (PRODUCAO 200); e,
separado, trocar o gate da rota para `requirePermission('visualizar')` → cai o 5 (PRODUCAO e GESTOR 200) — prova que o 403 vem do gate da
rota e não de outro lugar;
(b) o `UPDATE` sem zerar a liberação → cai o 12;
(c) a comparação `validade_vista` sem `slice(0,10)` → cai o 8 (o caso M-2 vira 409);
(d) `validarDataValidade` usado como está (com `{ informada: false }` aceito) → cai o 6 (`null` vira 200 ou 500);
(e) o rótulo removido de `auditLabels.js` → cai `auditLabels.api.test.js` (rodar);
(f) recusas de payload depois do `getLote` → cai o 10.

### T2 (tronco) — trava, avisos e as literais da 190

Arquivos: `lotService.js` (avisos, contagem de separação com `STATUS_COM_CAIXA` de `requisitionStateMachine` — **não** importar
`requisitionService` no `lotService`, que ele mesmo importa: ciclo), as duas literais da RN-191.11.

Mesmo arquivo de teste, cenários novos:

13. `[RN-191.10] avisos na ordem` — L3 liberado, 2 itens separados não entregues (requisição aprovada + `separar` pela rota), validade
    antiga não nula, corrigido para ontem → `avisos` === `[ANULADA, VENCIDO, SEPARACAO(2), ETIQUETA]` literais.
14. `[RN-191.10] sem avisos` — lote sem validade, sem liberação, corrigido para o futuro → `[]`.
15. `[RN-191.10] hoje nao e vencido` — corrigido para hoje de Brasília → sem `AVISO_CORRIGIDA_VENCIDO` (régua `<`, não `<=`).
16. `[RN-191.10] separacao so conta o pendente` — item separado e **entregue** e requisição **cancelada** não contam.
17. `[RN-191.12] espera a trava` — o teste segura `trava.comLockDoMaterial(mat, () => portao)` **chamado do contexto do teste** (molde
    `exclusaoSerieQueVoltou` RN-15); dispara o PUT (também do contexto do teste); espera alguns ticks → o lote **não** mudou e a
    resposta não chegou; abre o portão → 200 e o lote mudou.
18. `[RN-191.12] guarda do UPDATE` — gancho em `trava.naTravaDoMaterial` (pelo objeto) que grava outra validade direto no banco antes de
    chamar a função → 409 `MUDOU` (a releitura dentro da seção pega) — e, com a releitura sabotada, o `WHERE … IS ?` pega (controle (h)).
19. `[RN-191.11] literais da 190` — `MSG_VALIDADE.CONFLITO('L', '2027-01-01')` e `AVISO_FALHA` terminam com o texto novo; a Entrada com
    outra validade num lote com saldo devolve o `CONFLITO` novo.

**Controles positivos:**
(g) sem o `naTravaDoMaterial` (chamar a `…SemTrava` direto) → cai o 17 (o PUT termina com a trava segura);
(h) sem a releitura dentro da seção (usar o lote lido fora) **e** `WHERE id = ?` sem a guarda → cai o 18 (200 sobrescrevendo);
(i) contagem de separação sem o filtro de status → cai o 16;
(j) `<=` no aviso de vencido → cai o 15.

Antes de mexer nas duas literais: `grep -rn "peça a correção" server/tests client/src` — teste que tenha a frase **escrita à mão** (em vez
de `MSG_VALIDADE.*`) muda junto, no mesmo commit, e o plano registra quais. Rodar depois, sem mudança esperada além das literais:
`validadeLoteEntradaManual` (o **16**, recebimento intacto, continua verde — B1296), `validadeLoteEntradaManualIntegracao`,
`loteVencimentoLiberacao`, `loteGuardasSaida`, `lotes`, `loteRotas`, `loteRecebimento`, `travaPorMaterial`, `auditLabels`,
`client … MovimentacoesValidadeLote.test.js`.

### T3 (galho) — a tela

Arquivo: `client/src/components/almoxarifado/LotesAlmoxarifado.js` **só** + teste novo
`client/src/components/almoxarifado/LotesCorrigirValidade.test.js` (molde de mocks de `LotesAlmoxarifado.test.js:21-40`; mock só na
fronteira HTTP, respostas do contrato).

- Import `FiCalendar` (`:5`). Estado `validadeTarget`, `validadeNova`, `validadeJustificativa`, `validadeSaving` (molde do vencimento,
  `:286-305`).
- Botão na coluna de ações (`:512-530`), entre "Liberar vencimento" e "Anexar certificado": `{pode('inspecionar') && (<button
  className="almox-btn-icon" title="Corrigir validade" aria-label="Corrigir validade" onClick={(e) => { if
  (!bloquearSeNaoPode('inspecionar', e)) return; abrirValidade(l); }}><FiCalendar /></button>)}`.
- Modal (molde `:749-782`) com as frases congeladas. `Corrigir` desabilitado sem data ou com justificativa vazia (`trim`) ou salvando.
- Envio: `api.put(\`/almoxarifado/lotes/${validadeTarget.id}/validade\`, { data_validade: validadeNova, validade_vista:
  validadeTarget.data_validade ? String(validadeTarget.data_validade).slice(0, 10) : null, justificativa: validadeJustificativa.trim() })`.
  (A `validade_vista` é a do lote **como a lista carregou** — é ela que detecta a outra aba.)
- Sucesso: `toast.success('Validade do lote corrigida!')`; `(r.data?.avisos || []).forEach((a) => toast.warn(a, { autoClose: false }))`;
  fecha; `loadLotes()`. Erro: `toast.error(err.response?.data?.error || 'Erro ao corrigir a validade do lote')`, modal aberto, campos
  mantidos.

Testes:

1. `[RN-191.13] botao so com inspecionar` — `pode` → true: o botão está em cada linha; `pode('inspecionar')` → false: ausente; os outros
   botões continuam.
2. `[RN-191.13] modal mostra a validade atual` — lote com `2025-03-10` → "validade atual: 10/03/2025"; lote sem validade → "sem validade".
3. `[RN-191.13] Corrigir desabilitado` — sem data; com data e justificativa `"   "`; habilitado com as duas.
4. `[RN-191.13] payload` — `api.put` com a URL do lote e `{ data_validade: '2027-03-10', validade_vista: '2025-03-10', justificativa:
   'NF diz 2027' }` (justificativa com espaços em volta chega aparada); lote sem validade → `validade_vista: null`.
5. `[RN-191.13] avisos viram toast.warn persistente` — resposta com 2 avisos → `toast.warn` 2×, `{ autoClose: false }`; recarrega a lista.
6. `[RN-191.13] 409 mantem o modal` — `toast.error` com a literal `MUDOU`; modal aberto, data e justificativa preservadas.

**Controles positivos:** (a) botão sem o `pode(...) &&` → cai o 1; (b) `validade_vista` mandando a nova data → cai o 4; (c) sem o
`forEach` dos avisos → cai o 5; (d) fechar o modal no `catch` → cai o 6. `CI=true npx react-scripts build` verde.

### T4 — integração (pela rota e pelo serviço; tela pelo fluxo)

Arquivo novo `server/tests/api/corrigirValidadeLoteIntegracao.api.test.js`. O lote nasce **pela rota da 190** (`POST
/movimentacoes/v2` ENTRADA com `data_validade` errada — o caminho real do erro de digitação), a correção entra **pela rota nova**, e o
efeito é conferido numa **porta diferente**, existente e sem mudança. Cada cenário com o controle "a mesma conferência **sem** a
correção":

1. `[RN-191.07] saida desbarrada` — Entrada de 10 em L-ERR com `2025-03-10` (ano errado; + `AVISO_VENCIDO` da 190) → SAIDA v2 → 400
   `Lote L-ERR vencido em 2025-03-10 …`; PUT validade `2027-03-10` → 200; SAIDA → 201. Controle: sem o PUT, a SAIDA continua 400.
2. `[RN-191.07] saida barrada` — o inverso: L-OK `2027-03-10` que devia ser `2025-03-10` → SAIDA 201; PUT → 200 + `AVISO_CORRIGIDA_VENCIDO`;
   SAIDA → 400.
3. `[RN-191.07] FEFO` — LA `2027-06-30` e LB `2027-12-31` → `GET /materiais/:id/lotes` = `[LA, LB]`; corrigir LB para `2027-01-31` →
   `[LB, LA]`.
4. `[RN-191.07] e-mail Lote vencendo` (molde `validadesNoDiaLocal`) — L com validade fora da janela → `varrerLotesVencendo` 0; corrigir
   para hoje+10 → 1 `LOTE_VENCENDO` com a dedupe `lote-vencendo-<id>-<hoje+10>`; corrigir de novo para hoje+12 → **mais 1** (chave nova).
5. `[RN-191.08] liberacao` — L vencido `2025-01-10` liberado (`PUT liberar-vencimento`) → SAIDA 201; PUT validade `2025-01-20` → 200 +
   `AVISO_LIBERACAO_ANULADA` + `AVISO_CORRIGIDA_VENCIDO`; SAIDA → 400; liberar de novo → 200; SAIDA → 201.
6. `[RN-191.07/10] separacao planejada` — requisição aprovada, separada pela rota com origem no lote L-S (`2027-…`); PUT para ontem → 200
   com `AVISO_SEPARACAO(1)`; entregar pela rota → 400 com a literal de `requisitionService.js:1191`; liberar vencimento → entregar → 200.
   E `GET /fila-separacao` de outra requisição do mesmo material deixa de sugerir L-S (`pegar_em`).
7. `[RN-191.14] pelo servico` — o 1 por `lotService.corrigirValidadeDoLote` + `stockService.registrarMovimentacao` (sem rota).

**Tela pelo fluxo** (manual, roteiro no guia; letra F se não der para medir no navegador): Lotes e Séries → material com lote de validade
errada → "Corrigir validade" → data certa + justificativa → Corrigir → o toast de sucesso e os avisos → a coluna Validade mostra a nova,
sem o badge VENCIDO → Movimentações → Nova → Saída → o seletor mostra o lote com `— vence <nova>` → Auditoria → "Validade corrigida" com
antes/depois/motivo. Com um usuário QUALIDADE (aparece) e um CONSULTA (não aparece).

Rodar a suíte inteira serial (os cinco comandos do CLAUDE.md).

### Fechamento (skill `fechar-etapa`)

- `docs/almoxarifado-novidades-por-etapa.md`: seção da 191; **M-8 da 190** e **Menor 4 da Fase 5 da 190** fechados (com hash); letra B
  **B1290–B1299** (abaixo — renumerar se a 190 passou de B1289); limitações em D (o e-mail já enfileirado, B1297; o recebimento, B1296);
  verificação de tela em F.
- `specs/modulo-almoxarifado/10-lotes-series-etiquetas/README.md`: linha "+ Etapa 191" no topo; seção com RN, testes e hashes; o mapa
  (`specs/modulo-almoxarifado/README.md:1365`).
- `docs/almoxarifado-manual-do-sistema.md`: a seção de lotes (perto da liberação de vencimento) ganha "Corrigir validade" com as
  literais; a frase da 190 que diz "peça a correção" muda junto (RN-191.11).
- `docs/almoxarifado-guia-etapas-e-testes.md`: seção da 191, "Antes → Agora", roteiro clicável, o que não cobre.
- Este plano: Execução e Próxima tarefa detalhada (candidata: Etapa 192 — o recebimento na régua da validade, B1296).

## Letra B proposta (para `docs/almoxarifado-novidades-por-etapa.md`)

*(Escrito com a novidades commitada até **B1269**; a 190 reservou **B1270–B1279** e usa **B1280/B1281** no fix-round da Fase 5, ainda
não commitado. Esta etapa usa **B1290–B1299**.)*

- **B1290 (NOVA, da Etapa 191) — a correção é `inspecionar`, não `ajustar_estoque` nem ação nova.** Corrigir a validade é decidir sobre o
  vencimento do lote — o ofício que a Etapa 24 deu à QUALIDADE com `inspecionar` (status do lote, liberação de vencimento). Corrigir para
  o futuro tem o mesmo poder que liberar o vencimento (o lote volta a sair), e quem libera já é `inspecionar`. **Descartado:**
  `ajustar_estoque` (ADMINISTRADOR/GESTOR — tiraria a QUALIDADE e o ALMOXARIFE, que são quem vê a etiqueta; daria ao GESTOR, que não
  decide vencimento); ação nova `corrigir_validade_lote` com os mesmos perfis (precedente `remessar_terceiro`: poder estreitar depois sem
  reescrever) — custa uma chave em `ACAO_PERFIS` (tronco, aparece em `minhas-permissoes` e no cadastro de perfis) sem mudar quem pode hoje.
  Reversível: trocar o gate é uma linha na rota; criar a ação depois é a mesma linha mais a chave.
- **B1291 (NOVA) — a correção pega a trava por material, sem a regra exigir.** A regra do CLAUDE.md pede a trava a quem põe saldo no
  disponível e distribui, ou o lê para reservar. A validade **não** entra no disponível para reservar (reserva é por material; a aprovação
  não lê `data_validade`). Mas ela decide **qual lote pode sair**, e os três leitores que decidem com ela — a saída do motor, a separação
  e a entrega (`checarOrigemItem`), e a Entrada da 190 (que decide `CONFLITO`/preencher/redefinir numa leitura e grava depois do livro) —
  leem **sob** a trava. Fora dela, a correção caberia entre a decisão da Entrada e a gravação (o `AVISO_CORRIDA` da 190, hoje
  inalcançável, viraria alcançável) e entre a leitura do lote na separação e o fim da seção. É o precedente do `mudarStatusSerie` (Etapa
  118, RN-10): estado lido por quem segura a trava muda sob a trava. Custo: uma correção espera a fila do material (milissegundos).
  **Descartado:** sem trava, como `mudarStatusLote` e `liberarVencimento` (o `UPDATE` único com guarda já é atômico e o resultado seria
  serializável — mas deixa vivo o caminho da corrida da 190 e obriga a próxima porta a refazer este raciocínio). Reversível: tirar o
  `naTravaDoMaterial` é uma linha.
- **B1292 (NOVA) — mudar a data sempre anula a liberação de vencimento.** A liberação é uma assinatura sobre **aquela** validade
  (`liberarVencimento` guarda `WHERE data_validade = lida`; a `redefinirValidadeDoLoteVazio` da 190 já zera). Se a nova data também está
  no passado, o motivo da liberação pode não valer (vencido há 10 dias ≠ há 2 anos): libera de novo, com nova justificativa; o aviso diz.
  **Descartado:** manter quando a nova também é passada (a assinatura passaria a cobrir um fato que ninguém olhou); manter sempre (uma
  liberação esquecida "pré-credenciaria" o vencimento futuro do lote corrigido para a frente). Reversível: uma condição no `UPDATE`.
- **B1293 (NOVA) — data passada aceita com aviso; apagar a validade recusado.** Passada: mesmo raciocínio da B1271 (registro do que está
  na prateleira). Apagar (`null`): tira o lote de todas as regras de vencimento e nenhum caso medido pede isso; o rascunho da 190 previa.
  **Descartado:** aceitar `null` (vira o C450 por outra porta); recusar passado. Reversível: aceitar `null` é tirar uma recusa.
- **B1294 (NOVA) — `validade_vista` obrigatória e 409 quando difere.** Duas pessoas corrigindo o mesmo lote em abas diferentes: sem isto a
  segunda sobrescreve a primeira sem ver. A trava não resolve (as duas correções são serializadas, mas a segunda decide com a tela velha).
  **Descartado:** última gravação vence (sobrescreve calado); `validade_vista` opcional (o cliente que esquecer volta ao "última vence").
  Reversível: tornar opcional é uma condição.
- **B1295 (NOVA) — a mesma rota dá validade a lote que não tinha.** É o caminho para os lotes da **A110** (nascidos sem validade pela
  Entrada antes da 190) que têm saldo — sem fazer uma Entrada falsa só para preencher. Auditoria `VALIDADE_CORRIGIDA` com antes `null`
  (não `VALIDADE_PREENCHIDA`, que é o ato da Entrada e leva `movimento_id`). **Descartado:** rota separada "informar validade"; chamar
  `preencherValidadeSeVazia` (sem justificativa nem perfil).
- **B1296 (NOVA) — o recebimento continua fora.** Segunda nota do mesmo lote com outra validade mantém a da primeira; lote sem validade
  recebido com validade continua sem (B1277; cenário 16 da 190 continua verde). O resultado dos dois agora tem conserto (esta rota). Mudar
  a porta é decidir o que fazer com um documento fiscal que contradiz o lote (recusar travaria o processamento da nota; avisar exige
  canal de aviso no processamento) e mexer no `receiptService` sob `comSecaoDaNota` — outro tamanho de revisão. Candidata à **Etapa 192**.
  **Descartado:** caber aqui (dobra a etapa e mistura correção manual com regra de entrada fiscal).
- **B1297 (NOVA) — o e-mail "Lote vencendo" já enfileirado com a data errada não é retirado.** A varredura só enfileira; o envio não relê o
  lote. A correção gera chave nova (reavisa com a data certa), mas não cancela o pendente. Declarado como limitação (D). **Descartado:**
  cancelar pendentes da fila pelo `payload.lote_id` (mexe no `notificationQueueService`, outro dono, por um caso raro).
- **B1298 (NOVA) — as literais `CONFLITO` e `AVISO_FALHA` da 190 passam a nomear o botão.** "Peça a correção" mandava a uma porta que não
  existia; agora existe. Só texto. **Descartado:** deixar a frase antiga (manda o operador procurar alguém em vez do botão).
- **B1299 (NOVA) — o botão some para quem não tem `inspecionar`, ao contrário dos irmãos.** Os outros botões da linha aparecem sempre e
  barram no clique; este segue o pedido ("só para quem tem a permissão") com `pode('inspecionar') &&`, o precedente de
  `pode('ajustar_estoque') &&` da mesma tela. Como `pode` falha aberto, carregando ou com erro o botão aparece e o backend decide.
  Séries: nada a fazer — herdam a validade pelo `lote_id`. **Descartado:** mostrar sempre (um CONSULTA veria um botão de correção que só
  serve para tomar 403). Reversível: tirar o `pode(...) &&`.

## Execução

*(vazia — preencher task a task: feita, hash, vermelho medido de cada controle positivo, divergências.)*

- [ ] T1 —
- [ ] T2 —
- [ ] T3 —
- [ ] T4 —

## Próxima tarefa detalhada

*(preencher no fechamento.)*
