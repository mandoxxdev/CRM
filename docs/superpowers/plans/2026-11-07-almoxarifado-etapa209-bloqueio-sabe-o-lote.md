# Etapa 209 — o bloqueio passa a saber o lote (C466, 1ª parte)

> Usando a skill `desenvolver-etapa`. **Só Fase 0 + Fase 1 nesta sessão (2026-11-06); a execução fica para a próxima semana** — este
> plano tem de bastar para retomar sem reler o código. Ponto de partida: a "Próxima tarefa detalhada" de
> `docs/superpowers/plans/2026-11-06-almoxarifado-etapa208-sai-de-respeita-guarda-do-irmao.md` (`:396-414`) e o **C466** em
> `docs/almoxarifado-novidades-por-etapa.md` (`:39222`, `:14023`, `:19792`). Estimativa já commitada: item 8 de
> `docs/estimativas/2026-11/estimativa_2026-11-05_almoxarifado-proximas-2.txt` (`:32-34`, **4h30 a 5h30**). O item 9 (a entrega e o
> automático não tiram a peça bloqueada do lote, `:36-38`) é **outra etapa** — a fronteira está na seção "Fronteira com o item 9".
> Números de linha medidos hoje sobre `f3f0b6af`.

## Objetivo (em linguagem simples)

Uma peça volta de uma obra com suspeita e é devolvida para a **quarentena**. Hoje o sistema sabe que o material tem "1 bloqueado", mas não
sabe **de qual lote** é essa peça — a devolução até sabe (herda o lote da saída), mas o bloqueio grava só no total do material. Depois desta
etapa, o bloqueio da quarentena fica gravado com o lote; a **liberação** (Desbloquear, na tela de Inspeções) pergunta de qual lote está
liberando quando o material tem bloqueio por lote; e o **descarte** da peça em quarentena (liberar daquele lote e sucatear do mesmo lote)
fica rastreável lote a lote. Nenhuma conta de disponível muda nesta etapa: só passa a existir o dado que a 2ª parte (item 9) vai usar.

Fatia visível: na janela **Desbloquear material**, material com controle de lote ganha o campo **Lote** com o que está bloqueado em cada um
(*"L1 — 2 bloqueado(s)"*, *"Sem lote — 3"*).

## Fase 0 — medido em 2026-11-06 (sobre `f3f0b6af`)

### Onde o bloqueio mora hoje

- `materiais_almoxarifado.quantidade_bloqueada` e `quantidade_em_terceiros` — um número por material (`schema.js:1337`, `:1400`). Nenhuma
  tabela guarda bloqueio por lote. `lotes_almoxarifado` (`schema.js:1512-1535`) só tem status/validade; `lotService.js:1-10` declara que ele é
  o **único dono** da tabela de lotes e que mudar status de lote **não** é movimentação.
- `movimentacoes_almoxarifado` **já tem** `lote_id` e `lote` — o `INSERT` do livro grava `loteIdFinal` em **todo** tipo
  (`stockService.js:2324-2339`), inclusive `BLOQUEIO`/`DESBLOQUEIO`. O motor resolve o lote antes de qualquer efeito
  (`stockService.js:1278-1301`: lote inexistente → *"Lote nao encontrado"*; de outro material → *"O lote informado pertence a outro
  material"*) e **não** aplica as guardas de status/validade do lote fora de `tiposSaida` (`:1545-1560`). Índice
  `(material_id, cancelado, tipo)` em `schema.js:3143`.
- Hoje **nenhum** caminho manda `lote_id` num `BLOQUEIO`/`DESBLOQUEIO` (medido abaixo); a v1 (`routes/almoxarifado.js:1391`) só aceita
  `ENTRADA/SAIDA/AJUSTE/DEVOLUCAO` e a v2 exclui os de retenção (`schemas.js:28-60`). Então, no código, todo `BLOQUEIO`/`DESBLOQUEIO` do
  livro tem `lote_id IS NULL` — **a conferir em produção (A112)**.

### Todos os caminhos que escrevem `quantidade_bloqueada` / `quantidade_em_terceiros` — e se conhecem o lote

| # | Caminho | Escrita | Conhece o lote? | O que esta etapa faz |
|---|---|---|---|---|
| 1 | Devolução → **Quarentena**: `ENTRADA_DEVOLUCAO` + `BLOQUEIO` interno | `returnService.js:333-337` → motor `stockService.js:1679` | **Sim** — `loteFinalId` (`returnService.js:140-141`, herda o `lote_id` da saída citada; a `ENTRADA_DEVOLUCAO` já o usa em `:329`), mas **não passa** para o `BLOQUEIO` | **passa `lote_id: loteFinalId`** (T2) |
| 2 | **Bloqueio avulso** (Inspeções → Bloquear), `POST /materiais/:id/bloquear` | `extended.js:1263-1266` → `inspectionService.js:487-502` → motor `:1662-1677` (claim `:1670`) | Não (o corpo só tem quantidade e justificativa) | **não muda** — continua sem lote (C500) |
| 3 | **Desbloqueio avulso** — a **liberação** da quarentena, `POST /materiais/:id/desbloquear` | `extended.js:1268-1271` → `inspectionService.js:504-515` → motor `:1684-1697` (claim `:1688`) | Não | **aceita `lote_id` opcional** (T4) e o motor confere o lote (T3) |
| 4 | Liberação por NC (`DESBLOQUEIO`, `MOTIVO_LIBERACAO`) | `nonConformityService.js:1054-1063` → motor `:1684` | Sim pelo documento (inspeção → item do recebimento `lote_id`), não pelo movimento | **não muda** (vai sem lote; cai no "sem lote" — ver RN-209.05 e C501) |
| 5 | Inspeção reprovada: `DECISAO_INSPECAO` / `REPROVACAO_INSPECAO` (em inspeção → bloqueada) | `inspectionService.js:321-327` → motor `:1703-1745` | Sim pelo documento (`inspecoes_recebimento` → `recebimentos_material_itens_almoxarifado.lote_id`), não pelo movimento | **não muda** — o item 9 lê pelo documento (B1418) |
| 6 | Devolução ao fornecedor do reprovado (`DEVOLUCAO_FORNECEDOR`, `baixandoBloqueado`) | `nonConformityService.js:1650-1653` (com `lote_id`) → motor `:1252`, claim `:2000-2012`, compensação `:1863-1872` | Sim (passa `lote_id`) | **não muda** (baixa a parcela da inspeção, não a da quarentena — C502) |
| 7 | **Descarte do reprovado** (`SUCATA` com `doBloqueado`) | `scrapDisposalService.js:476-490` (com `lote_id`, `exigeLote`) → motor (mesmo claim) | Sim | **não muda** (idem 6) |
| 8 | **Descarte da peça em quarentena** | não existe porta direta: o motor recusa saída do bloqueado (`stockService.js:1615-1620`, *"Material bloqueado não pode ser utilizado"*). Hoje é **Desbloquear + Sucata/Perda** | — | passa a ser **Desbloquear do lote L + Sucata do lote L** (RN-209.07): o descarte fica rastreável porque a liberação sabe o lote |
| 9 | Estorno do `BLOQUEIO` (livro) | `stockService.js:3509-3526` (claim `:3517`), desfazer `compensarBloqueada` `:3149-3153` | Sim — `mov.lote_id` (passa a vir preenchido pelo #1) | **ganha a guarda do lote** (M3, T3) |
| 10 | Estorno do `DESBLOQUEIO` (livro; o de NC é recusado em `:2773`) | `stockService.js:3527-3541` | Sim — `mov.lote_id` | **não muda** (o `cancelado = 1` já devolve ao lote — RN-209.06 a) |
| 11 | Catch do motor (falha depois do efeito) | `stockService.js:2369-2375` (`retencaoAplicada`) | — | **não muda** (o livro não gravou a linha → a soma por lote não mudou) |
| 12 | `REMESSA_TERCEIRO` / `RETORNO_TERCEIRO` | `thirdPartyService.js:269-273` (com `lote_id`) → motor `:1746-1783` | **Sim** — `itens_remessa_terceiro_almoxarifado.lote_id` (`schema.js:2237-2249`) e `quantidade_retornada` por item | **não muda** — o item 9 lê pelo item da remessa (B1418) |
| 13 | `PERDA_TERCEIRO` / `CONSUMO_TERCEIRO` (`baixandoTerceiro`) | motor `:1966-1982`, compensação `:1848-1857` | Sim (pelo item) | **não muda** |
| 14 | Reverter consumo da remessa | `thirdPartyService.js:788-792` (escreve `em_terceiros` direto) | Sim (pelo item) | **não muda** |

**Achado 1 — o lote só se perde em dois lugares: o `BLOQUEIO` da devolução (#1) e a liberação avulsa (#3).** Inspeção reprovada (#5-7) e
terceiros (#12-14) **já sabem o lote** — no documento (inspeção → item do recebimento; item da remessa), não no material. Gravar de novo seria
um segundo escritor da mesma retenção (a lição da Etapa 5, `lotService.js:4-5`). Esta etapa escreve só onde o lote se perdia; o item 9 lê os
três: quarentena pelo livro (o helper desta etapa), reprovado pela inspeção, terceiros pela remessa.

**Achado 2 — o estorno do `BLOQUEIO` sabe o lote mas não confere.** Hoje a guarda é só do material (`:3517`). Com o lote no livro: bloqueio
L1 2 + bloqueio avulso 2 (sem lote) → desbloqueio de L1 2 → estorno do `BLOQUEIO` de L1 passa no material (há 2) e a soma de L1 fica −2.
Precisa da guarda do lote (M3).

**Achado 3 — a ordem do claim no estorno.** O claim `cancelado = 1` (`stockService.js:3041`) roda **antes** do ramo do tipo (`:3509`) — a
soma por lote lida dentro do ramo **já exclui** o próprio `BLOQUEIO`. A guarda M3 é então `bloqueadoDoLote(L) >= −folga` (equivalente a
"o lote tem o que este bloqueio pôs"). **Conferir na T3 com um `console.log` descartável** antes de escrever a guarda.

**Achado 4 — a liberação avulsa não sabe o lote e a tela não manda.** `InspecoesAlmoxarifado.js:303-319` posta `{ quantidade,
justificativa }` em `/materiais/:id/bloquear|desbloquear` (`:315-317`); a janela (`:574-610`) tem só material, quantidade e justificativa.
Sem um campo de lote na tela, a guarda RN-209.05 trancaria a liberação da quarentena — **o campo é obrigatório nesta etapa**, não enfeite.

### Quem lê (não muda nesta etapa — é o item 9)

- `loteImpedido.js:46-60` (`loteImpedidoSql`): abate `quantidade_bloqueada` e `quantidade_em_terceiros` **do material** (`:57`) da soma dos
  lotes impedidos (D (206): desconto menor que o real).
- `requisitionService.js:1953` (`lotesParaOAutomatico`): desconta inspeção por lote (Etapa 197), **não** bloqueio.
- `availabilitySql.js:36-38`, `stockAvailabilityService.js:43-49`, `materialService.js:752-754`, `requisitionService.js:460`, `:524-525`,
  `reportService.js:200`, `routes/almoxarifado.js:1659-1683` — todos no material. Nenhum muda.

### Travas

O motor inteiro roda sob `naTravaDoMaterial` desde a Etapa 97 (B494) — `BLOQUEIO`/`DESBLOQUEIO` avulsos e o da NC incluídos; as pernas da
devolução para Quarentena rodam sob **uma** trava (`returnService.js:287-292`, `:380-381`); o estorno roda do efeito ao livro sob a trava
(Etapa 118, CLAUDE.md). As guardas novas (M1, M2, M3) leem a soma por lote **dentro** dessas seções — nenhuma porta nova, nenhuma trava nova.
A guarda vai também no `WHERE` do claim (molde do motor), não só lida antes.

## Caminhos

- **(escolhido) O lote no movimento + soma derivada do livro.** O `BLOQUEIO` da quarentena e o `DESBLOQUEIO` avulso passam a gravar
  `lote_id` na coluna que já existe; "bloqueado do lote L" = Σ `BLOQUEIO` − Σ `DESBLOQUEIO` com `lote_id = L` e `cancelado = 0`. **Sem
  migração, sem tabela, sem backfill:** o estorno já marca `cancelado = 1` (soma corrige sozinha), o catch do motor não grava a linha (soma
  não muda), dado antigo tem `lote_id IS NULL` (fica "sem lote"). Reverter = deixar de passar `lote_id` e apagar o helper; as linhas com lote
  continuam válidas como histórico. Material continua sendo a fonte do **total**; o lote é um detalhamento.
- **(descartado) Tabela `bloqueios_lote_almoxarifado (material_id, lote_id, quantidade)`.** Oito pontos de escrita a manter em par com o
  material (motor `BLOQUEIO`/`DESBLOQUEIO`, catch `:2369`, os dois ramos do estorno e o `compensarBloqueada`, e — para ficar coerente — NC,
  descarte do reprovado e inspeção), migração com prova de primeiro boot e backfill (letra A). É o "dois escritores da mesma retenção" da
  Etapa 5. Mais caro e menos reversível.
- **(descartado) Coluna `quantidade_bloqueada` em `lotes_almoxarifado`.** Quebra o "dono único" de `lotService.js:4-5` (o motor passaria a
  escrever em lotes) e tem os mesmos oito pontos de escrita.
- **(descartado) A soma derivada incluir já a reprovação e os terceiros.** Eles já sabem o lote pelo documento; incluir é trabalho de leitor
  (item 9) e engordaria esta etapa sem dado novo (B1418).

## Decisões (letra B — reversíveis; livres depois de **B1415**, conferido por `grep` em `docs` e `specs`: nenhuma B1416+; C a partir de **C500**; A a partir de **A112** — `C499` ficou sem uso na 208 mas é citado, não reusar)

- **B1416 — onde guardar o lote:** no `lote_id` do próprio movimento `BLOQUEIO`/`DESBLOQUEIO` + soma derivada do livro (`bloqueioPorLote.js`).
  Descartados: tabela nova e coluna em lotes (ver "Caminhos").
- **B1417 — a liberação sem lote só tira do "sem lote".** `DESBLOQUEIO` sem `lote_id` só passa se `quantidade_bloqueada − Σ (bloqueado por
  lote) ≥ q`; senão 400 M1, que **nomeia os lotes**. Descartados: (a) tirar automaticamente do lote mais antigo (o sistema adivinharia qual
  peça foi liberada — exatamente o que a etapa existe para não fazer; e um `DESBLOQUEIO` com dois lotes exigiria duas linhas no livro);
  (b) não conferir (a soma por lote ficaria maior que o total do material, e o item 9 descontaria peça que já saiu da quarentena).
- **B1418 — reprovação e terceiros ficam como estão (já sabem o lote no documento).** O item 9 lê `inspecoes_recebimento` (reprovada sem os
  três carimbos `liberacao_nc_em`/`devolucao_fornecedor_em`/`sucateamento_em`) e `itens_remessa_terceiro_almoxarifado` (`quantidade −
  quantidade_retornada`, enviados). Descartado: gravar o lote também nesses movimentos (segundo escritor).
- **B1419 — o bloqueio avulso continua sem lote.** Na tela de Inspeções, Bloquear não ganha o campo; o que ele bloqueia é "sem lote".
  Descartado nesta etapa: lote opcional no bloqueio avulso (precisaria da guarda "o lote tem saldo livre para bloquear" — regra nova do motor
  que não é desta fatia). Vira **C500**.
- **B1420 — a ordem das recusas do `DESBLOQUEIO`:** lote inválido (literais do motor, `:1281-1298`) → total do material (literal de hoje,
  `:1693`) → M2 (com lote) ou M1 (sem lote). Os testes de hoje que esperam *"Quantidade bloqueada insuficiente: N"* não mudam.
- **B1421 — o leitor não clampa; o helper devolve o que o livro diz e `sem_lote = MAX(0, total − Σ lotes)`.** Se um caso de borda (C502) deixar
  Σ lotes > total, o GET mostra os lotes como estão e sem lote 0; o item 9 decide o clamp (o lado seguro é descontar o menor dos dois).
- **B1422 — `lote_id` inválido no desbloqueio avulso:** o serviço converte com `Number`; não inteiro positivo → 400 *"lote_id deve ser um
  número inteiro positivo"*; inteiro de lote inexistente ou de outro material → as literais do motor. Vazio/`null`/ausente = sem lote.

### Fora (C novos)

- **C500** — o bloqueio avulso não tem lote (B1419): uma peça bloqueada à mão fica "sem lote".
- **C501** — a liberação por NC (`DESBLOQUEIO` sem lote) passa pela M1: se uma liberação avulsa sem lote já tiver comido a parcela da
  reprovação, a NC recebe *"Informe o lote…"* (literal pensada para a tela de Inspeções) e desfaz a decisão (RN-02 da 44). Antes, a NC
  passava comendo a parcela da quarentena. Borda; a literal fica estranha mas o efeito é o certo.
- **C502** — a devolução ao fornecedor e o descarte do reprovado (`baixandoBloqueado`) baixam o total sem conferir a parcela por lote da
  quarentena: no mesmo caso de borda do C501, Σ lotes pode ficar maior que o total (B1421).
- **C503** — a estimativa já previa: o automático e a entrega ainda tiram a peça bloqueada do lote (item 9; esta etapa não muda leitor).

### A (rodar em produção, antes do deploy)

- **A112** — conferir que nenhum bloqueio antigo tem lote (senão passaria a contar por lote sem ninguém ter decidido):
  `SELECT tipo, COUNT(*) FROM movimentacoes_almoxarifado WHERE tipo IN ('BLOQUEIO','DESBLOQUEIO') AND lote_id IS NOT NULL GROUP BY tipo;`
  Esperado: **zero linhas** (no código nenhum caminho grava, Fase 0). Se vier algo, anotar e decidir antes de subir (o reversível é
  `UPDATE … SET lote_id = NULL` só dessas linhas, guardando os ids). Não há migração de schema nesta etapa (sem prova de primeiro boot).

## Regras de negócio

- **RN-209.01 — a quarentena grava o lote.** Devolução para `QUARENTENA` citando uma saída do lote L1 (material com controle de lote): o
  livro tem `ENTRADA_DEVOLUCAO` e `BLOQUEIO`, **os dois com `lote_id` = L1**; `bloqueadoPorLote` → `{ total: q, sem_lote: 0, lotes: [{ L1, q }] }`;
  `quantidade_bloqueada` sobe q como hoje. (a) pela rota `POST /api/almoxarifado/devolucoes`; (b) pelo serviço `registrarDevolucao`;
  (c) com `lote_id` informado no corpo (vence o herdado, `:141`) → o `BLOQUEIO` usa o informado.
- **RN-209.02 — sem lote continua sem lote.** Material sem controle de lote, saída sem lote: `BLOQUEIO` com `lote_id NULL`, tudo em `sem_lote`.
  Destinos `ESTOQUE`, `SUCATA`, `RETRABALHO`: nada muda (nenhum `BLOQUEIO`).
- **RN-209.03 — dado antigo fica "sem lote" e não quebra nada.** `BLOQUEIO` gravado sem lote (o avulso, ou linha antiga): conta em
  `sem_lote`; o desbloqueio sem lote dele passa como hoje.
- **RN-209.04 — liberar do lote.** `POST /materiais/:id/desbloquear` com `lote_id` = L1: (a) `q ≤ bloqueado(L1)` → 200, `DESBLOQUEIO` com
  `lote_id` = L1, total e L1 descem q; (b) `q > bloqueado(L1)` (com o total cobrindo) → 400 **M2**, nada gravado; (c) lote de outro material /
  inexistente → as literais do motor; (d) `lote_id: "x"` → 400 B1422.
- **RN-209.05 — liberar sem lote só do "sem lote".** Total 5 = L1 2 + sem lote 3: sem `lote_id`, q = 3 → 200 (sem lote 0, L1 2); q = 4 → 400
  **M1**, nada gravado; total insuficiente (q = 6) → a literal de hoje (B1420). Material sem nenhum bloqueio por lote: igual a hoje em tudo.
- **RN-209.06 — o estorno respeita o lote.** (a) estornar o `DESBLOQUEIO` de L1 → L1 volta (pelo `cancelado = 1`), sem guarda nova;
  (b) estornar o `BLOQUEIO` de L1 com L1 intacto → 200, L1 0, total desce; (c) L1 2 + sem lote 2, desbloqueia L1 2, estorna o `BLOQUEIO` de
  L1 → 400 **M3**, o `BLOQUEIO` continua vivo (`cancelado = 0`, sem linha `ESTORNO`, total 2 = sem lote 2) — controle: sem a guarda, 200 e
  L1 = −2.
- **RN-209.07 — o descarte da peça em quarentena fica no lote.** Devolução Q do lote L1 (2) → desbloquear L1 2 → `SUCATA` do lote L1 2 (porta
  de sempre) → saldo do lote L1 desce 2, bloqueado L1 0; o livro tem as quatro linhas com L1. (integração, rota).
- **RN-209.08 — `GET /materiais/:id/bloqueado-por-lote`** devolve o contrato abaixo; `visualizar` basta (a tela de Inspeções); material
  inexistente → 404.
- **RN-209.09 — quem lê não muda.** Com L1 2 bloqueado por quarentena, `loteImpedidoSql` e `lotesParaOAutomatico` dão **o mesmo número**
  que com o mesmo bloqueio sem lote (regressão explícita); as suítes da 197 e da 205 verdes sem edição.
- **RN-209.10 — corrida.** Dois desbloqueios simultâneos de L1 (bloqueado L1 2, total 4) pedindo 2 cada → um 200, um 400 M2; total 2, L1 0
  (o motor já serializa por `naTravaDoMaterial`; o teste prova que a guarda é lida dentro da seção).
- **RN-209.11 — reprovação, NC e terceiros não mudam.** `DECISAO_INSPECAO`, liberação/devolução/descarte por NC e remessas: suítes de hoje
  verdes sem edição; os movimentos deles continuam sem `lote_id` onde não tinham.
- **RN-209.12 — a tela.** Janela **Desbloquear material**: material com controle de lote → campo **Lote** (obrigatório escolher uma opção)
  com as opções do GET (`"L1 — 2 bloqueado(s)"` por lote com quantidade, e `"Sem lote — N"` quando N > 0); manda `lote_id` (ou nada, para
  "Sem lote"). Material sem controle de lote: a janela de hoje. **Bloquear** não muda (B1419).

## Contrato (congelado)

### Serviço novo — `server/services/almoxarifado/bloqueioPorLote.js`

```js
// Soma derivada do livro. Parcela "quarentena/avulso": BLOQUEIO (+) e DESBLOQUEIO (-) com lote_id e cancelado = 0.
bloqueadoDoLoteSql(materialExpr, loteExpr) // -> '(COALESCE((SELECT SUM(CASE WHEN bpl.tipo = \'BLOQUEIO\' THEN bpl.quantidade ELSE -bpl.quantidade END)
                                           //     FROM movimentacoes_almoxarifado bpl WHERE bpl.material_id = <m> AND bpl.lote_id = <l>
                                           //     AND bpl.cancelado = 0 AND bpl.tipo IN (\'BLOQUEIO\',\'DESBLOQUEIO\')), 0))'
bloqueadoComLoteSql(materialExpr)          // -> Σ de todos os lotes do material (mesmo filtro, lote_id IS NOT NULL)
async bloqueadoPorLote(db, materialId)     // -> { material_id, total, sem_lote, lotes: [{ lote_id, codigo, quantidade }] }
                                           //    total = quantidade_bloqueada; sem_lote = MAX(0, total - Σ); lotes com quantidade > folga,
                                           //    ORDER BY codigo, id; quantidades por Q.qtd
```

`cancelado` é a coluna do claim do estorno (`stockService.js:3041`, volta a 0 em `:3166` se falhar). Usar `Q.qtdSql` no `SUM` (molde
`loteImpedido.js`). Sem `require` de `stockService` (o motor importa este arquivo).

### Motor — `stockService.js`

- `:1684` ramo `DESBLOQUEIO`: depois do claim de hoje (`:1687-1697`, inalterado), **no mesmo `WHERE`** a condição extra:
  - com `loteIdFinal`: `AND ${bloqueadoDoLoteSql('materiais_almoxarifado.id', loteIdFinal)} >= ? ${Q.FOLGA_SQL}`;
  - sem: `AND COALESCE(quantidade_bloqueada,0) - ${bloqueadoComLoteSql('materiais_almoxarifado.id')} >= ? ${Q.FOLGA_SQL}`.
  Se o claim falhar, reler para escolher a literal: total < q → a de hoje; senão M2/M1.
- `:3509` estorno do `BLOQUEIO`: se `mov.lote_id`, antes do claim do material, `bloqueadoDoLote(L) >= −folga` (Achado 3), senão M3.
- `returnService.js:333-337`: `lote_id: loteFinalId || undefined` no `BLOQUEIO`.
- `inspectionService.js:504-515` (`desbloquearMaterial`): `lote_id` opcional (B1422) repassado ao motor.

### Literais (novas)

- **M1** (`DESBLOQUEIO` sem lote, o "sem lote" não cobre), 400:
  `` `Informe o lote: só ${Q.qtd(semLote)} ${un} bloqueado(s) sem lote — o resto está em lote (${lista})` `` com `lista` =
  `` lotes.map(l => `${l.codigo}: ${Q.qtd(l.quantidade)}`).join('; ') `` (ex.: *"Informe o lote: só 3 UN bloqueado(s) sem lote — o resto está
  em lote (L1: 2)"*).
- **M2** (`DESBLOQUEIO` com lote acima do lote), 400:
  `` `Quantidade bloqueada insuficiente no lote ${codigo}: ${Q.qtd(noLote)} ${un}` ``.
- **M3** (estorno do `BLOQUEIO` cujo lote já foi liberado), 400:
  `` `Não é possível estornar: o bloqueio do lote ${codigo} já foi desfeito (bloqueado no lote: ${Q.qtd(MAX(0, noLote + q))} ${un})` ``
  — `noLote` lido já sem o próprio bloqueio (Achado 3), então o número mostrado é o que o lote tinha antes do estorno.
- **B1422**, 400: *"lote_id deve ser um número inteiro positivo"*.
- Inalteradas: *"Quantidade bloqueada insuficiente: N"* (`:1693`), *"Lote nao encontrado"*, *"O lote informado pertence a outro material"*,
  *"Não é possível estornar: o bloqueio já foi desfeito (quantidade bloqueada: N)"* (`:3522`).

### Rota nova — `server/routes/almoxarifado/extended.js` (junto de `:1263-1271`)

`GET /api/almoxarifado/materiais/:id/bloqueado-por-lote`, `auth`, `requirePermission('visualizar')` →
`200 { material_id: 7, total: 5, sem_lote: 3, lotes: [{ lote_id: 12, codigo: "L1", quantidade: 2 }] }`; material inexistente → `404
{ error: "Material não encontrado" }` (usar o `handleError` da rota). `POST /materiais/:id/desbloquear` passa a aceitar `lote_id` (sem Zod
hoje — validação no serviço, B1422); `POST /materiais/:id/bloquear` ignora `lote_id` como hoje.

### Tela — `client/src/components/almoxarifado/InspecoesAlmoxarifado.js`

`ajusteForm` (`:148`) ganha `lote_id: ''`; ao escolher o material na janela de **Desbloquear** (`:589`) com `controle_lote`, `GET
/almoxarifado/materiais/:id/bloqueado-por-lote` e o `<select>` **Lote** (label `Lote`, opção vazia *"Selecione o lote"*, opções
`` `${codigo} — ${quantidade} bloqueado(s)` `` e `` `Sem lote — ${sem_lote}` `` com valor `"SEM_LOTE"`); o envio (`:316-317`) põe `lote_id`
só quando a opção é um lote. Sem opção escolhida → `toast.error('Selecione o lote')`. Erro do servidor → `toast.error` com a literal (padrão da
tela).

## Fronteira com o item 9 (não fechar a porta)

O item 9 troca o desconto do material em `loteImpedido.js:57` e acrescenta o do bloqueio em `lotesParaOAutomatico` (`requisitionService.js:1953`)
pelo **bloqueado do lote** = quarentena (`bloqueadoDoLoteSql`, desta etapa) + reprovado da inspeção (pelo documento) + em terceiros (pelo item
da remessa), com o clamp de B1421. Esta etapa **não** muda nenhum leitor (RN-209.09) e entrega o helper com a assinatura acima para ele compor.
Não renomear `bloqueadoDoLoteSql` sem atualizar a "Próxima tarefa detalhada".

## Tasks

| T | Tipo | O quê | Depende |
|---|---|---|---|
| T0 | tronco | Testes vermelhos: `server/tests/api/bloqueioSabeOLote.api.test.js` (RN-209.01 a .10; o runner próprio do molde `quarentenaMotor.api.test.js`) — confirmar vermelho real em cada RN, não erro de import | — |
| T1 | tronco | `bloqueioPorLote.js` (contrato acima) | T0 |
| T2 | tronco | `returnService.js:333-337` passa `lote_id` | T1 |
| T3 | tronco | motor: `DESBLOQUEIO` M1/M2 no `WHERE` (`:1684`) + estorno do `BLOQUEIO` M3 (`:3509`; conferir o Achado 3 primeiro) | T1 |
| T4 | tronco | `inspectionService.desbloquearMaterial` aceita `lote_id` (B1422) | T3 |
| T5 | galho | rota `GET /materiais/:id/bloqueado-por-lote` (consome T1, estável) | T1 |
| T6 | galho | tela: o campo Lote na janela Desbloquear + teste de cliente (mock só do HTTP, contra o contrato) | contrato |
| T7 | tronco | integração: RN-209.07 **pela rota** (devolução → GET → desbloquear L1 → `POST /movimentacoes/v2` SUCATA L1) **e pelo serviço** (`registrarDevolucao` → `inspectionService.desbloquearMaterial` → `registrarMovimentacao`) | T2-T5 |

T5 e T6 podem ir em paralelo **depois** de T1 (T6 só contra o contrato). Galho de backend em worktree isolada se for em paralelo (SQLite
único). Sem migração → sem prova de primeiro boot.

### Controles positivos (cada um quebra de propósito e exige vermelho)

1. T2 sem o `lote_id` no `BLOQUEIO` → RN-209.01 vermelha (`lotes` vazio, `sem_lote` = q).
2. T3 sem a condição do lote no `WHERE` → RN-209.04 (b) e RN-209.10 vermelhas (200 e L1 negativo).
3. T3 sem a condição do "sem lote" → RN-209.05 (q = 4 passa).
4. T3 sem M3 → RN-209.06 (c) passa com 200 e L1 = −2.
5. Helper sem `cancelado = 0` → RN-209.06 (a)/(b) vermelhas.
6. RN-209.09: trocar o `BLOQUEIO` da devolução para sem lote não pode mudar o número de `loteImpedidoSql` — o teste compara os dois estados;
   controle: somar `bloqueadoComLoteSql` no `loteImpedidoSql` (sabotagem) → vermelho.

Restauro da sabotagem por `git checkout -- <arquivo>` (ou cópia com md5); um controle por vez; LF (memória "harness: base é LF").

## Cabe em 4h30 a 5h30?

Análise e este plano: ~1h (feito). Testes (T0, T7, controles, regressão da 197/205): ~2h. Código (T1-T6): ~1h30 a 2h — o helper é SQL de uma
consulta; o motor ganha duas condições e uma guarda; a tela, um `<select>`. **Cabe no teto (5h30), sem folga.** Corte pré-decidido, se a T3
passar de 1h: a guarda M3 do estorno sai para o item 9 como **C504** (o estorno do bloqueio por lote passaria a poder deixar o lote negativo —
declarado no guia) e o resto fica. **Não cortar** o campo da tela: sem ele a RN-209.05 tranca a liberação da quarentena por lote (Achado 4).

## Pontos de atenção

- **Fase 2 antes de executar** (revisor fresco, as quatro perguntas da skill; em especial: seguir a devolução Q → liberação → descarte, e a NC
  depois de uma liberação avulsa — C501).
- O helper **não** pode importar `stockService` (ciclo). `Q` de `quantidade.js`/o mesmo de `loteImpedido.js`.
- Quantidade em ponto flutuante: `Q.qtdSql` no `SUM`, `Q.FOLGA_SQL` nas condições, `Q.qtd` nas literais.
- O teste de corrida (RN-209.10) **sem gancho**: `Promise.all` de dois `desbloquearMaterial` — o motor serializa. Se usar gancho, dispare o gesto
  concorrente do contexto do teste (CLAUDE.md, `AsyncLocalStorage`).
- `quantidade_bloqueada` do material continua sendo escrita pelos mesmos lugares; nenhuma coluna nova, nenhum `safeAlter`.
- Os testes de hoje que fazem `DESBLOQUEIO` sem lote depois de um `BLOQUEIO` da devolução **com material de lote** (se houver) passam a
  receber M1 — **procurar na T0** (`grep -l "QUARENTENA" server/tests/api/*.api.test.js` e cruzar com `desbloquear`); cada um reescrito com o
  `lote_id`, registrado como mudança de regra, não em silêncio.

## Fase 2 — correções do revisor fresco (2026-11-06) — **MANDAM sobre o texto acima onde divergem**

Revisor fresco sobre `5708b830`: 1 trava, 2 importantes, 5 menores, todos aceitos. Confirmado: a 205 (`loteImpedido.js:57`) e a 197
(`lotesParaOAutomatico`) continuam lendo o material — nenhum número de tela muda; a liberação avulsa de hoje continua aceita (sem bloqueio por
lote: igual; bloqueio antigo: cai em "Sem lote"), salvo o caso da trava abaixo; T5 e T6 são galhos independentes depois da T1; perfil da rota ok
(`desbloquear` pede `ajustar_estoque`, `extended.js:1268`; o GET pede `visualizar`).

1. **[TRAVA] RN-209.12:** a janela Desbloquear chama `GET /bloqueado-por-lote` para **todo** material escolhido; o campo Lote aparece quando
   `lotes.length > 0`, com ou sem `controle_lote`; sem lotes, a janela fica como hoje; se o GET falhar, fica como hoje e o servidor decide (M1). (Um
   material com `controle_lote = 0` pode sair com lote — Etapa 58 — e a devolução para Quarentena herda o lote, `returnService.js:139-140`; com o campo
   só para `controle_lote`, a peça ficava presa na quarentena.) **RN-209.02b:** material sem controle de lote, saída com L1, devolução para Quarentena
   → `BLOQUEIO` com L1 → a tela mostra o campo. Teste de cliente dos dois casos.
2. **[IMPORTANTE] Estorno da `ENTRADA_DEVOLUCAO` da Quarentena** (`stockService.js:3210-3240`) não estorna o `BLOQUEIO`: linha 15 na tabela da Fase 0
   — "não muda: o `BLOQUEIO` continua vivo; a soma bate com o total, mas o lote pode ficar com bloqueado maior que o saldo dele (**C504**)". Na
   Fronteira com o item 9: "o que o limite tira de um lote volta para o desconto do material, junto com o sem lote — nunca some". Um teste da RN-209.09
   com o cenário (L1 0 e L2 5; voltam 2 de L1; estorno → físico 5 todo em L2, a soma diz L1 2 bloqueado).
3. **[IMPORTANTE] RN-209.06 (a):** o estorno do DESBLOQUEIO de um lote (`stockService.js:3527-3541`) "aceita como hoje; L1 pode ficar com bloqueado maior
   que o saldo (C504, o limite do item 9)".
4. **[MENOR] Guarda M3:** fica **lida antes do claim do material** (não no `WHERE`); ordem das recusas: total insuficiente → a literal de hoje (`:3522`);
   total cobre e o lote não → M3.
5. **[MENOR]** `bloqueadoDoLoteSql('materiais_almoxarifado.id', '?')` com o valor como parâmetro.
6. **[MENOR]** com `lotes: []` e `sem_lote: 0`, a tela não exige o campo (só exige quando há opção) — senão "Selecione o lote" esconde a mensagem do
   servidor.
7. **[MENOR] Guia:** material com controle de lote só com bloqueio antigo → um clique a mais em "Sem lote — N"; a opção "Sem lote — N" inclui a parcela
   da inspeção reprovada (que tem lote pelo documento — C501).
8. **[MENOR] Execução:** os controles positivos que sabotam `stockService.js`/`returnService.js` só depois de integrar a T5 (sabotagem concorrente
   contamina a suíte do galho aberto).

## Execução

- [x] Fase 2 — revisor fresco sobre este plano; correções registradas numa seção "Fase 2" acima da Execução (mandam sobre o texto) — feita em 06/11 (1 trava, 2 importantes, 5 menores; bloco "Fase 2 — correções").
- [x] T0 — testes vermelhos + varredura M1 — `0999f06f`. Dois arquivos: `server/tests/api/bloqueioSabeOLote.api.test.js` (13 testes da fatia
  T1+T2: RN-209.01 a/b/c, .02, .02b, .03, .06 b, .09 e o cenário do estorno da `ENTRADA_DEVOLUCAO`/C504; no código de `c2b66af0` **0/13**, cada
  um por motivo real — o livro com `BLOQUEIO.lote_id` null, ou o módulo ausente só nos que não têm livro a conferir) e
  `server/tests/api/bloqueioSabeOLote.pendente-t3.js` (11 testes de T3/T4/T5/T7: RN-209.04 a-d, .05, .06 a/c, .08, .10, .07 rota e serviço) —
  **fora do runner de propósito** (`run-all.js` só descobre `*.api.test.js`), para o `test:api` não ficar vermelho. Varredura M1: **nenhum** teste
  de hoje faz desbloqueio sem lote depois de uma devolução para Quarentena com lote (`devolucaoVinculo`, `entregaAutomaticaPeloLote`,
  `loteImpedido` devolvem com lote e não desbloqueiam; `bloqueioGuardas` devolve sem saída citada, logo sem lote) — a T3 não reescreve nenhum.
  **O plano estava errado na T7:** `POST /movimentacoes/v2` **recusa** `SUCATA` (tipo dedicado, `schemas.js:72` — dupla aprovação na aba
  Sucateamentos). A RN-209.07 pela rota usa `PERDA` na v2; pelo serviço, `registrarMovimentacao` `SUCATA` direto no motor.
  RN-209.09 compara `loteImpedidoSql`, `saldoDisponivelParaItem` e `listarLotesDoMaterial` (a entrada de `lotesParaOAutomatico`, que não é
  exportada) com o `BLOQUEIO` com L1 e com `lote_id` zerado por `UPDATE` só da linha do livro.
- [x] T1 — `bloqueioPorLote.js` — `9a3dcad9` + fix `8ff95f59`: a consulta do material passava `bloqueadoComLoteSql('id')` sem apelido e, dentro da
  subconsulta, `id` era o `bpl.id` do livro (soma com lote 0, `sem_lote` = total). Invisível na T1 (nenhum `BLOQUEIO` tinha lote), pego pelos
  testes da T2. **Para o item 9: `materialExpr` sempre qualificada.**
- [x] T2 — `returnService` passa o lote ao `BLOQUEIO` (`lote_id: loteFinalId || undefined`, dentro das mesmas pernas sob `naTravaDoMaterial`) —
  `e10f8c04`. `bloqueioSabeOLote` **13/13**. Controles positivos (um por vez, `perl -0pi` sobre LF, âncora = 1, restauro por cópia, md5
  conferido): **(1)** sem o `lote_id` no `BLOQUEIO` → 8 vermelhos (RN-209.01 a/b/c, .02b, .03, .06 b, .09 ×2 — premissa/livro); **(5)** helper sem
  `cancelado = 0` → RN-209.06 b vermelho (L1 2 depois do estorno); **(6)** `loteImpedidoSql` somando `bloqueadoComLoteSql` → RN-209.09 (o
  primeiro) vermelho (`lote_impedido` 4 × 2). O cenário C504 não cai no (6) porque nenhum lote dele é impedido — quem carrega o controle é o
  primeiro. Fase 2 item 8 (sabotagem só depois da T5): não havia galho aberto (execução em série, sem worktree), então o controle (1) em
  `returnService.js` rodou já; nada concorrente para contaminar.
- **Onde parou (sessão de 06/11, 1ª fatia — superado pelo "Onde parou" da 2ª fatia, abaixo da T4):** T0, T1, T2 fechadas e commitadas; `test:api` **603/603 arquivos OK** e `test:almoxarifado` **44 passou, 0 falhou** (sobre `e10f8c04`; o pendente fora do runner).
  **A próxima sessão começa pela T3:** (1) rodar `cd server && node tests/api/bloqueioSabeOLote.pendente-t3.js` — hoje **1/11** (só a RN-209.06 a
  passa, e **por acaso**: o desbloqueio ainda ignora `lote_id`, então o `DESBLOQUEIO` sai sem lote; ela só prova algo depois da T4); (2) conferir o
  Achado 3 com `console.log` descartável no ramo do estorno do `BLOQUEIO` (`stockService.js` ~`:3509`); (3) M1/M2 no `WHERE` do `DESBLOQUEIO`
  com `bloqueadoDoLoteSql('materiais_almoxarifado.id', '?')` (Fase 2 item 5) e M3 **lida antes** do claim do material, ordem total → M3 (Fase 2
  item 4); (4) T4 (`lote_id` em `desbloquearMaterial`, B1422) e T5 (rota GET); (5) com T3-T5 verdes, **mover** os testes do `pendente-t3.js` para
  `bloqueioSabeOLote.api.test.js` e apagar o pendente — não deixar teste fora do runner.
- [x] T3 — motor: M1/M2 no `DESBLOQUEIO`, M3 no estorno do `BLOQUEIO` — `7b8e8f7b`. **Achado 3 conferido** (log descartável no ramo
  do estorno do `BLOQUEIO`, arquivo restaurado por cópia com md5): o ramo vê `cancelado = 1` no próprio movimento, então a soma do lote já o
  exclui e a guarda é `noLote >= −folga`. `DESBLOQUEIO`: condição do lote no mesmo `WHERE` do claim, `bloqueadoDoLoteSql('materiais_almoxarifado.id',
  '?')` com o lote como parâmetro (com lote) ou `quantidade_bloqueada − bloqueadoComLoteSql(...)` (sem lote); claim falhou → relê
  (`bloqueadoPorLote`) e escolhe: total < q → a literal de hoje; senão M2/M1 (B1420). Estorno do `BLOQUEIO` com `mov.lote_id`: M3 **lida antes**
  do claim do material, dentro do ramo sob a trava; total insuficiente → segue para a literal de hoje; total cobre e o lote não → M3
  (Fase 2 item 4). `stockService` passa a importar `bloqueioPorLote` (sem ciclo). Movida para o runner: RN-209.05. Controle **(3)** (sem a
  condição do "sem lote") → RN-209.05 vermelha na q = 4 (200 em vez de M1). Vizinhos verdes: `bloqueioGuardas`, `estorno`, `inspecaoDecisao`,
  `inspecaoRotas`, `movimentacoes`, `portasAvulsasCaixa`, `remessaTerceiroMotor`, `naoConformidadeLiberacao(+Rotas)`, `quantidadeArredondada`,
  `filaLiberacaoAprovacaoCorrida`. Varredura dos testes antigos (`QUARENTENA` × desbloqueio; literais *"Quantidade bloqueada
  insuficiente"*/*"bloqueio já foi desfeito"*): nenhum precisou mudar — confirma a varredura M1 da T0.
- [x] T4 — `desbloquearMaterial` aceita `lote_id` (B1422) — `cc4da040`. Movidos para `bloqueioSabeOLote.api.test.js` (**22/22**): RN-209.04
  a-d, .06 a/c, .10, .07 serviço. **O teste do T0 estava errado na RN-209.06 c:** esperava *"bloqueado no lote: 2"*, mas o contrato da M3 é
  `MAX(0, noLote + q)` = o que o lote tinha antes do estorno, e ali L1 já tinha sido todo liberado (0). Corrigido para 0 (o contrato manda).
  Controles: **(2)** sem a condição do lote no `WHERE` → RN-209.04 b (200 em vez de M2) e RN-209.10 (dois `fulfilled`) vermelhas; **(4)** sem a
  M3 → RN-209.06 c vermelha (200, estorno feito); serviço sem repassar `lote_id` → 7 vermelhos. As 14 suítes que chamam o desbloqueio, verdes.
  RN-209.06 (a) aceita como hoje (o lote pode ficar com bloqueado maior que o saldo dele — **C504**, Fase 2 item 3).
- **Onde parou (sessão de 06/11, 2ª fatia):** T3 e T4 fechadas e commitadas; `test:api` **603/603 arquivos OK** e `test:almoxarifado` **44 passou, 0 falhou** (sobre `cc4da040`; o pendente fora do runner). No `pendente-t3.js` ficam **só dois**
  testes, os que chamam o GET: RN-209.08 e RN-209.07 pela rota (vermelhos reais: 404). **A próxima sessão começa pela T5:** (1) rodar
  `cd server && node tests/api/bloqueioSabeOLote.pendente-t3.js` (0/2, 404); (2) criar `GET /api/almoxarifado/materiais/:id/bloqueado-por-lote`
  em `server/routes/almoxarifado/extended.js` junto do `desbloquear` (~`:1268`), `auth` + `requirePermission('visualizar')`, chamando
  `bloqueioPorLote.bloqueadoPorLote(db, req.params.id)`; `null` → 404 `{ error: 'Material não encontrado' }` (pelo `handleError` da rota);
  (3) mover os dois testes para `bloqueioSabeOLote.api.test.js` (os helpers `quarentena`/`desbloquear` já estão lá) e **apagar** o pendente;
  (4) T6 (tela, contra o contrato, com a Fase 2 itens 1 e 6) e T7; os controles (1), (5), (6) já rodaram na T2, os (2), (3), (4) na T3/T4.
- **Onde parou (2ª fatia):** superado pelo "Onde parou" da 3ª fatia, abaixo da T5.
- [x] T5 — rota `GET /materiais/:id/bloqueado-por-lote` — `4bdf0a09`. Em `extended.js`, junto do `desbloquear`: `auth` +
  `requirePermission('visualizar')`, chama `bloqueioPorLote.bloqueadoPorLote(db, req.params.id)`; `null` → 404 `{ error: 'Material não encontrado' }`
  (inline, como as outras rotas de material do arquivo; erro inesperado pelo `handleError`). Id em texto não casa com material → o mesmo 404
  (o contrato só pede o 404; descartado um 400 à parte). Vermelho real antes: **0/2** (404). Os dois testes (RN-209.08 e .07 pela rota)
  movidos para `bloqueioSabeOLote.api.test.js` (**24/24**) e o `pendente-t3.js` **apagado** — nenhum teste fora do runner. Controle positivo
  (perl sobre base LF, âncora = 1, md5 conferido e restaurado por cópia): gate trocado → 403, os dois caem; rota sem chamar o helper → 404, os
  dois caem. `test:api` **603/603 arquivos OK** (sobre a T5).
- **Onde parou (sessão de 06/11, 3ª fatia):** T0-T5 fechadas e commitadas. **A próxima sessão começa pela T6** (tela, `client/`, contra o
  contrato): a janela Desbloquear chama `GET /almoxarifado/materiais/:id/bloqueado-por-lote` para **todo** material escolhido (Fase 2 item 1,
  a TRAVA da RN-209.12 — com ou sem `controle_lote`); o campo **Lote** aparece quando `lotes.length > 0`; sem lotes (ou GET falhou), a janela
  fica como hoje e o servidor decide (M1); com `lotes: []` e `sem_lote: 0` **não exige** o campo (item 6); teste de cliente dos dois casos
  (com e sem `controle_lote`, RN-209.02b). Depois **T7** (integração pela rota e pelo serviço — a RN-209.07 pelas duas portas já está verde no
  arquivo; conferir o que falta da T7 contra o plano), os controles finais 1-6, as suítes completas **incluindo o cliente** (`CI=true` test e
  build), a Fase 5 (revisores frescos) e o fechamento (`fechar-etapa`).
- [x] T6 — tela: campo Lote no Desbloquear + teste de cliente — `b073fb93`. `InspecoesAlmoxarifado` **42/42** (9 novos: com e sem
  `controle_lote`/RN-209.02b, "Sem lote" sem `lote_id`, `lotes: []` não exige, GET falhou → M1 literal, troca de material, Bloquear sem GET);
  controles: GET só com `controle_lote` → (2)(5)(7) vermelhos; POST sem `lote_id` → (1)(2); exigir o campo sem lotes → (5)(5b)(6) + o teste
  antigo do desbloquear; restauro por cópia, `cmp` ok. Build `CI=true` ok.
- [x] T7 — integração pela rota e pelo serviço (RN-209.07) — já verde: pelo serviço em `cc4da040` (registrarDevolucao → desbloquearMaterial(L1) → SUCATA L1), pela rota em `4bdf0a09` (devolução → GET → desbloquear L1 → PERDA L1 na v2), no `bloqueioSabeOLote.api.test.js`
- [x] Controles positivos 1-6 — (1), (5), (6) na T2 (`e10f8c04`); (3) na T3 (`7b8e8f7b`); (2), (4) na T4 (`cc4da040`); os da rota na T5
  (`4bdf0a09`) e os da tela na T6 (`b073fb93`); os dois da Fase 5 em `fa50fae9` (abaixo). **Não refeitos em bloco no fim:** cada um rodou
  sobre o código da sua task e nenhum arquivo de produção sabotado mudou depois, salvo o `stockService.js` na Fase 5 — e ali a sabotagem nova
  (guarda do sem lote desligada) derrubou o cenário novo.
- [x] Suítes: `test:api` 610/610, `test:almoxarifado` 44/0, validation 4/0, safealter 3/0, sqlite 16/0, cliente 223/223 (2999), `build` OK (em `fa50fae9`)
  no fechamento** (fora deste commit de documentação); os números entram na linha "Verificação final", abaixo.
- [x] Fase 5 — revisão fresca, 4 lentes (correção da RN; "este teste passaria com a feature quebrada?"; trava/estorno; cliente) — `fa50fae9`.
  **2 achados reais, os dois corrigidos:**
  1. **[MÉDIO, defeito]** o estorno de um `BLOQUEIO` **sem** lote só conferia o total. L1 2 (quarentena) + sem lote 2, desbloquear "sem
     lote" 2 e estornar o bloqueio avulso passava: as 2 peças de L1 voltavam ao disponível sem ninguém liberar, e o livro seguia dizendo L1 2
     bloqueado. Agora o claim tem a guarda M1 (`total − Σ lotes ≥ q`, no `WHERE`); recusa *"Não é possível estornar: o bloqueio sem lote já foi
     desfeito (bloqueado sem lote: N UN)"* (só quando o total cobre — senão a literal de sempre). Cenário **RN-209.06 d** com a metade positiva
     (sem desbloquear o sem lote, o estorno passa); controle: guarda desligada → o cenário cai. Registrado como ampliação da **B1417**.
  2. **[BAIXO, teste]** nenhum teste provava que a resposta atrasada do GET do material anterior é ignorada na troca de material. Cenário
     **(7b)** em `InspecoesAlmoxarifado.test.js`; controle: sem o `if (!ehUltimo())` → vermelho.
  Concorrência e cliente sem outro achado. `bloqueioSabeOLote` **25/25**; `InspecoesAlmoxarifado` **43/43**.
- [x] Fechamento (`fechar-etapa`): novidades (seção da 209, B1416–B1422, C500–C504, A112, D (209), F (209), C466 anotado), spec 10 e 12,
  mapa (e o cabeçalho dele, que tinha parado na 191), guia, manual (15.3, 12.6, 6.10), este plano e o de pausa — commit "Etapa 209:
  fechamento". **O estimado × gasto não foi feito aqui** (fica com o André, como na 207 e na 208).
- Verificação final (medida, em `fa50fae9`): `test:api` 610/610, `test:almoxarifado` 44/0, validation 4/0, safealter 3/0, sqlite 16/0; tela inteira 223/223 suítes (2999 testes); build OK

### Divergências do plano (registradas no fechamento)

- **C504** não estava na lista original (C500–C503); nasceu na Fase 2 (itens 2 e 3: o estorno da `ENTRADA_DEVOLUCAO` e o do `DESBLOQUEIO`)
  — **usado**. O corte pré-decidido da M3 (que também se chamaria C504) **não foi preciso**: a M3 entrou na T3.
- **T7:** o plano mandava `SUCATA` pela `POST /movimentacoes/v2` — **estava errado** (a v2 recusa `SUCATA`, tipo dedicado); pela rota foi
  `PERDA`, pelo serviço `SUCATA` direto no motor (T0).
- **RN-209.06 c:** o teste do T0 esperava *"bloqueado no lote: 2"*; o contrato da M3 (`MAX(0, noLote + q)`) dá **0** ali — o teste estava
  errado, corrigido na T4.
- **T1:** `bloqueadoComLoteSql('id')` sem apelido lia o `id` do livro (fix `8ff95f59`).
- **Fase 5:** a regra "liberar sem lote só do sem lote" (B1417) não cobria o **estorno** do bloqueio sem lote — o plano só previa a guarda
  do lote (M3) no estorno. Ampliada em `fa50fae9`.
- **T5:** id em texto → o mesmo 404 (descartado um 400 à parte).

### Retro (4 números)

- **Rodadas até verde na Fase 5:** 1.
- **Achados reais:** 2 (1 defeito médio no estorno do bloqueio sem lote + 1 lacuna de teste na tela); **0 regressões**.
- **Paralelismo:** nenhum na execução (T5 e T6 eram galhos, rodaram em sequência na mesma árvore; a sessão foi cortada em três fatias
  pelo teto de horas).
- **Defeito que escapou da 208:** nenhum conhecido.

## Próxima tarefa detalhada

*(Conferida no fechamento, sobre `fa50fae9`. Escolhida pela ordem do CLAUDE.md: é a "próxima" que este plano já trazia e o item seguinte da
fila estimada de 05/11 (`estimativa_2026-11-05_almoxarifado-proximas-2.txt`, item 9 — o último do 2º pacote). Números de linha a remedir
na Fase 0: a 209 mexeu em `stockService.js` (ramos `DESBLOQUEIO` ~`:1700` e estorno do `BLOQUEIO` ~`:3540-3580`), mas **não** em
`loteImpedido.js` nem em `requisitionService.js`.)*

**O que já está pronto e não precisa reabrir:** `services/almoxarifado/bloqueioPorLote.js` — `bloqueadoDoLoteSql(materialExpr, loteExpr)`
(a parcela quarentena/avulso do lote, já sem os estornados), `bloqueadoComLoteSql(materialExpr)` e `bloqueadoPorLote(db, id)`. **A
`materialExpr` tem de vir qualificada** (`materiais_almoxarifado.id`, nunca `id` solto — o fix `8ff95f59`). Os parâmetros podem ser `'?'`.
O helper não importa `stockService` (o motor o importa). As guardas M1/M2/M3 e a do estorno sem lote ficam como estão.

**O item 9 do 2º pacote — a entrega e o automático não tiram a peça bloqueada do lote (C466, 2ª parte; C503)**, estimado em
`docs/estimativas/2026-11/estimativa_2026-11-05_almoxarifado-proximas-2.txt` (`:36-38`, **4h a 5h**).

- **O que muda:** o desconto do bloqueio sai do material e vai para o lote. Em `loteImpedido.js:57` (`loteImpedidoSql`) o `quantidade_bloqueada`
  e o `quantidade_em_terceiros` do material saem da conta do lote impedido e entram, por lote, as três parcelas; em `requisitionService.js:1953`
  (`lotesParaOAutomatico`), o livre de cada lote passa a descontar o bloqueado **dele** (hoje só desconta inspeção, Etapa 197).
- **As três parcelas do bloqueado do lote L** (medidas nesta etapa):
  1. quarentena/avulso por lote — `bloqueadoDoLoteSql(m, L)` de `bloqueioPorLote.js` (esta etapa);
  2. reprovação da inspeção — Σ `inspecoes_recebimento_almoxarifado.quantidade_reprovada` com `recebimento_item_id` → item com `lote_id = L`
     e `liberacao_nc_em`, `devolucao_fornecedor_em`, `sucateamento_em` todos `NULL` (os três carimbos do claim em `scrapDisposalService.js:461-462`);
  3. em terceiros — Σ `itens_remessa_terceiro_almoxarifado (quantidade − quantidade_retornada)` com `lote_id = L` e `enviado_em IS NOT NULL`
     (conferir se `quantidade_retornada` já cobre `PERDA_TERCEIRO`/`CONSUMO_TERCEIRO` — `thirdPartyService.js:394-420`).
  O que sobrar do total do material sem lote (bloqueio avulso C500, linhas antigas) continua descontado do material como hoje.
- **Clamp (B1421):** o bloqueado do lote nunca maior que o saldo do lote nem, somado, maior que o total do material (C501/C502, e o
  **C504**: depois do estorno da `ENTRADA_DEVOLUCAO` da Quarentena ou do `DESBLOQUEIO` de um lote, o livro pode dizer L1 2 bloqueado com o
  L1 já vazio). O que o clamp tira de um lote **volta para o desconto do material**, junto com o "sem lote" — nunca some. Cenário pronto em
  `bloqueioSabeOLote.api.test.js` ("[RN-209.09, Fase 2 item 2, C504]").
- **Regressão a manter:** a RN-209.09 de hoje afirma que `loteImpedidoSql`, `saldoDisponivelParaItem` e os lotes do automático **não mudam**
  com o lote no `BLOQUEIO` — a 2ª parte muda isso **de propósito**: reescrever esse teste como mudança de regra (registrada), não apagar.
- **Estimativa:** 4h a 5h (item 9). Fatia visível: a janela de entrega/Fila mostrar *"⟨n⟩ em quarentena no lote L1"* (a medir na Fase 0 se
  cabe no teto).
- **Pontos de atenção:** a 205 e a 197 têm suítes próprias que vão mudar de número de propósito (registrar como reversão do D (206), não em
  silêncio); a régua tem de ser a mesma na separação, na aprovação e no automático (RN-205.xx); roda sob as travas que já existem (só leitura).
  Vizinhos baratos que seguem abertos: **C491**, **C478**, **C486**, **C495**, **C497**, **C498**, **C500**.
