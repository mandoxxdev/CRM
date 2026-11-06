# Etapa 200 — Entrega com "Sai de" escolhido à mão respeita o que outra requisição separou dali

> **Tronco (motor da requisição, leitura sob trava).** Estimativa enviada: item 1 de
> `docs/estimativas/2026-11/estimativa_2026-11-05_almoxarifado-proximas-2.txt` (**4h30**: análise 1h, execução 1h30, teste 2h). Fecha o
> **C468** (`docs/almoxarifado-novidades-por-etapa.md`: *"contorna a recusa da 198: automático na separação + 'Sai de' à mão na entrega"*).
> Plano medido sobre `099a6820` (linhas abaixo são de hoje). Spec: `specs/modulo-almoxarifado/05-separacao-picking/README.md` (status da 198
> no topo, `:3`). Ponto de partida: Etapa 198 (`docs/superpowers/plans/2026-11-05-almoxarifado-etapa198-separado-de-outras-requisicoes.md`,
> commits `2fa621de..d0b97689`).

## Objetivo (em linguagem simples)

Há 6 peças no endereço XB-01 (lote L1) e 9 em XP-01 (lote L2). A requisição R1 separou 4 de XB-01. A R2 separou 4 sem escolher de onde
(automático). Na **entrega** de R2, o almoxarife escolhe à mão **"Sai de: XB-01"** — e o sistema **aceita**, tirando dali as peças que estavam
separadas para R1. Quem leva a culpa é R1: a entrega dela é recusada com *"a origem da separação (XB-01) não serve mais…"*. Passa a ser
recusado **na entrega de R2, na hora**, dizendo quanto há em XB-01, quanto está separado para R1 e quanto sobra.

## Fase 0 — medido em 2026-11-05 (sobre `099a6820`)

### A régua que a 198 deixou pronta (`server/services/almoxarifado/requisitionService.js`)

- `parteOrigemSql` / `PARTE_ORIGEM_SQL` (`:69-74`) — a parte da origem do item, limitada à caixa; `quantidade_origem_separacao` NULL = a caixa
  inteira (RN-196.10).
- `caixaVivaSql` (`:82-87`) — `COALESCE(r.ativo,1)=1 AND r.status IN STATUS_COM_CAIXA` (`requisitionStateMachine.js:116`).
- `parteGuardadaDeOutras(db, materialId, origemId, loteId, requisicaoId)` (`:94-104`) → `{ q, numeros }`; exclui `requisicao_id = esta`.
- `checarOrigemItem(db, item, { origemId, loteId, lidoNorm }, qty, pedidoPorOrigem, outras = null)` (`:1229`): soma o par (`:1257-1259`),
  `saldo = físico − jaPedido` (`:1261-1264`), literal física (`:1265-1270`, precedência), e a **C1** (`:1271-1282`) só com `outras`. O texto
  da C1 é **da separação**: *"… para esta separação …"* e *"Escolha outro endereço ou reabra a janela para ver a sugestão atual"* (`:1281`).
- Na separação, o memo por chamada `outrasDoPar` (`:1401-1406`) e a chamada com `outrasAqui` (`:1512-1514`).

### A entrega, os três casos (`entregarSemTrava`, `:1869`; envelope `entregarRequisicao` `:1864-1867`: `serializarNaRequisicao` → `comTravaDaRequisicao`)

`validarOrigemDaEntrega` (`:1960-1976`) chama `checarOrigemItem(…, pedidoPorOrigem)` **sem** `outras` (`:1963`). No laço (`:1981-2053`):

| Caso | Como o servidor vê | Onde | Conta as outras hoje? | Decisão |
|---|---|---|---|---|
| (a) planejada aplicada pelo servidor (sem chave, `origem_automatica` não `true`, item com origem e parte) | `planejada = true`, `qtdComOrigem = min(qty, parte)` | `:1999-2004` | não | **não muda** (RN-198.06, B1333) |
| (b) "Sai de" à mão **igual** à origem guardada do item (mesmo endereço; lote igual, ou planejada sem lote) | `outroPar = false` → `saiDaOrigem = true` | `:2028-2038` | não | **não muda** (B1338) |
| (c) "Sai de" à mão de **outro** par — ou item **sem** origem guardada (separado no automático) | `saiDaOrigem = false`, `origemId` preenchido | `:2028`, `:2052` | **não — é o C468** | **passa a contar** (RN-200.01) |

**Por que (b) não pode contar — medido na tela.** `client/src/components/almoxarifado/RequisicoesList.js:709-711` pré-seleciona o "Sai de" da
entrega com `valorPlanejada(item)` (`:161`) e `montarItensEntrega` (`:993-996`) manda isso como **`localizacao_origem_id` explícito**. Ou seja:
pela tela, a planejada chega ao servidor como o caso (b), não como o (a). Contar as outras em (b) traria de volta, **pela tela**, a armadilha
que a RN-198.06 evitou: no dado antigo sobrecomprometido (4 + 4 guardados em 6), as duas entregas seriam recusadas em vez de a primeira passar.
Só a opção "Planejada da separação" (busca de saldos falhou, `:705-707`) vai sem chave (caso a).

A condição do caso (c) é, no laço, exatamente **`origemId && !saiDaOrigem`** na chamada de `:2052` (o `saiDaOrigem` já está calculado em
`:2028-2038` antes dela). O só lote (`:2051`, conferido em `:2075`) tem `origemId` nulo — não entra.

### Os vizinhos (medidos)

- **Entrega dividida da 196** (item com origem e parte, qty > parte, sem escolha): a parte sai da planejada (caso a), o resto no automático.
  **Não muda.** Com "Sai de" à mão de outro par, `qtdComOrigem = qty` — a quantidade inteira é conferida contra o par escolhido (caso c).
- **FEFO por endereço da 197 (B1329):** só o automático (`lotesParaOAutomatico` `:1804`, chamado em `:2338`), que já desconta a parte guardada
  das caixas vivas. **Não muda.** Material **sem** controle de lote: o automático não desconta (B1321, fica).
- **Vários itens do mesmo par na mesma entrega:** `pedidoPorOrigem` acumula na ordem do laço (`jaPedido`, `:1261-1264`); o `outras` é o mesmo
  para os dois (memo). A conta da C1 já cobre (`saldo = físico − jaPedido`).
- **A própria requisição:** `parteGuardadaDeOutras` exclui `requisicao_id = esta` (`:98`). A parte guardada de um **irmão** (outro item da mesma
  requisição) no par escolhido, que não sai nesta entrega, não é protegida — a entrega dele depois toma *"não serve mais"* (C472, B1340).
- **Dado antigo NULL:** `PARTE_ORIGEM_SQL` → caixa inteira (a mesma régua da 198, RN-198.03).
- **Só lote à mão (lote sem endereço):** `claimSaldoDoLote` (`stockService.js:403-407`, `ORDER BY (localizacao_id IS ?) DESC, quantidade DESC`)
  escolhe o endereço sem olhar guarda — pode drenar o par de R1 do mesmo jeito. **Fora** desta etapa (B1341, C471).
- **Mesmo par acima da própria parte** (caso b com qty > parte, só escolhendo à mão — a tela não pré-seleciona acima da parte, `:701-703`): o
  excesso sai do livre **e** da parte das outras. **Fora** (C470, B1338).
- **Nada gravado na recusa:** toda a conferência de origem roda na passada de validação (`:1981-2077`), antes da prévia (`:2084-2114`), da
  alçada (`verificarBloqueioLiberacao`, `:2121`) e de qualquer baixa. A recusa nova não grava status, não manda e-mail de alçada, não baixa.
- **Travas:** a entrega já roda sob `serializarNaRequisicao` → `comTravaDaRequisicao` (por material, Etapa 95, B476); a separação de outra
  requisição do mesmo material pega a mesma trava por material — as duas são uma depois da outra e a leitura nova é **dentro** da seção.
  Nenhuma porta nova, nenhuma trava nova (CLAUDE.md, "Trava por material").
- **A tela:** a janela de entrega fecha só no sucesso (`RequisicoesList.js:1028`); no erro, `toast.error(err.response?.data?.error)` (`:1044`)
  com a **janela aberta** e as escolhas mantidas. A fatia visível é a **mensagem**. O rótulo do "Sai de" da entrega (`rotuloOrigem`, `:148`)
  mostra o físico do par, como o da separação — mesmo assunto do C469 (o campo novo no `/saldos`), **não** entra.
- **Rota:** `PUT /api/almoxarifado/requisicoes/:id/entregar` (`server/routes/almoxarifado.js:4758`).

### Testes que podem afirmar o defeito

Grep por `C468` em `server/tests/`: **0**. Os candidatos (duas requisições, uma com origem guardada, a outra escolhendo o mesmo par à mão na
entrega) só se acham rodando a suíte depois da T1 — o mesmo critério da 198 (lá: só um). Os da 198 que tocam a entrega: RN-198.06
(`separacaoSeparadoDeOutras.api.test.js:276`, caso a — não muda), T3 rota/serviço (`:415`, `:444` — R2 entrega pela planejada, caso a/b —
não muda), `preSelecaoColetaIntegracao.api.test.js:312` (R2 no automático — não muda).

## Caminhos

- **Escolhido — recusar só no caso (c)**, com a régua da 198 (`parteGuardadaDeOutras`, memo por chamada, `checarOrigemItem` com `outras`) e
  uma literal da entrega no molde da C1 (B1338, B1339). Reversível: uma condição a mais na chamada de `:2052`, sem dado novo.
- **Descartado — contar em todo "Sai de" à mão (b + c):** a tela manda a planejada como escolha explícita (`:709-711`) — no dado antigo
  prenderia as duas requisições pela tela (o que a RN-198.06 evitou).
- **Descartado — contar também na planejada (a):** idem, já descartado na 198 (B1333).
- **Descartado — reusar a C1 textual:** diz *"para esta separação"* e *"reabra a janela para ver a sugestão atual"* — errado no gesto da entrega.
- **Cortado — mesmo par acima da parte (C470), só lote à mão (C471), irmão da mesma requisição (C472):** cada um é outro caso com teste próprio;
  juntos não cabem nas 4h30 (abaixo).

## Regras

- **RN-200.01 — a entrega com "Sai de" de outro par recusa o que está separado ali para outras requisições.** Entrada com
  `localizacao_origem_id` que **não** é a origem guardada do item (outro endereço; mesmo endereço com outro lote quando a guardada tem lote;
  ou item sem origem guardada): 400 E1 quando `físico do par − já pedido nesta entrega ≥ qty` e `− parte guardada das outras caixas vivas < qty`.
  **Nada gravado:** status, `quantidade_entregue`, saldos, livro, trocas e alçada iguais. *Cenário (o C468):* XB-01/L1 6, XP-01/L2 9; R1 separa
  4 de XB-01/L1; R2 separa 4 no automático; R2 entrega 4 com "Sai de" XB-01/L1 → 400 E1 (há 6, 4 separados para R1, sobra 2). *Variante:* R2
  guardou XP-01/L2 e escolhe XB-01/L1 (outro par) → a mesma E1.
- **RN-200.02 — o que sobra, cabe; e a outra entrega passa.** R2 entrega 2 de XB-01/L1 → 200; depois R1 entrega pela planejada → 200; XB-01/L1
  0. *Fronteira:* 2,000001 → E1 (folga `1e-9` de hoje).
- **RN-200.03 — precedência.** Se o físico sozinho não cobre (R2 pede 7 de XB-01/L1 6), vale a literal de **hoje**
  (*"⟨material⟩: O saldo em XB-01 (6) não cobre a quantidade (7) — a saída tiraria de outros endereços"*), inalterada.
- **RN-200.04 — a origem guardada do próprio item não desconta (casos a e b).** Dado antigo 4 + 4 guardados em XB-01/L1 (6), semeado por SQL:
  (a) sem chave → como a RN-198.06 (R1 200, R2 400 *"não serve mais"*); (b) R2 manda `localizacao_origem_id` = XB-01, `lote_id` = L1 (o que a
  tela manda) **primeiro** → 200; R1 depois pela planejada → 400 *"não serve mais"* (quem entrega primeiro leva — RN-198.06 pela tela);
  (b') guardada **sem lote** e "Sai de" no mesmo endereço com um lote → mesmo par, não desconta.
- **RN-200.05 — a mesma régua de caixa viva da 198.** Não comprometem: requisição **excluída** (`ativo = 0`) e **cancelada legada** (por SQL,
  `CANCELADO`, `ativo = 1`); compromete pela **parte** (R1 separou 3 do par e 3 no automático → 3) e o **NULL legado** pela caixa inteira.
- **RN-200.06 — a própria requisição não é "outra"; vários itens somam.** (i) R2 com dois itens do material: o item 1 guardou 2 em XB-01/L1, o
  item 2 (automático) entrega com "Sai de" XB-01/L1 — só a parte de R1 entra em `outras`. (ii) R1 guardou 4; R2 entrega dois itens, 1 + 2 de
  XB-01/L1 → o segundo toma E1 com *"(já contando 1 desta entrega)"* (há 5, 4, sobra 1 < 2).
- **RN-200.07 — automático, planejada e só lote não mudam.** R2 entrega 4 no automático → 200 (197: 2 de L1 + 2 de L2); R2 só lote L1 → 200
  (comportamento de hoje, **registra o C471**, não o aprova).
- **RN-200.08 — duas ao mesmo tempo.** R1 separa 4 de XB-01/L1 e R2 (separada no automático) entrega 4 com "Sai de" XB-01/L1, disparadas
  juntas do contexto do teste (`Promise.all`, 10 repetições com material novo): **nunca** as duas 200; depois, a parte guardada no par ≤ físico
  do par.
- **RN-200.09 — o caso do item, ponta a ponta** (integração). Pela rota e pelo serviço: R1 separa de XB-01/L1 (`PUT …/separacao`, a da tela);
  R2 separa no automático; R2 entrega com "Sai de" XB-01/L1 → 400 E1; R2 entrega com "Sai de" XP-01/L2 → 200 (sem troca: R2 não tinha
  origem); R1 entrega mandando o mesmo par, como a tela (`localizacao_origem_id` XB-01, `lote_id` L1) → 200; XB-01/L1 2, XP-01/L2 5, nenhuma
  linha sem lote, nenhuma troca, o livro com as duas SAÍDAs por endereço/lote.

## Contrato congelado

**`PUT /api/almoxarifado/requisicoes/:id/entregar`** — payload, perfis e respostas de sucesso **inalterados**. Recusa nova, só no caso (c):

- **400 E1** (`error`):
  `` `${material_nome}: em ${cod} há ${saldo}${contando} para esta entrega, mas ${outras} ${plural ? 'já estão separados dali para outras requisições' : 'já está separado dali para outra requisição'} (${numeros}); sobra ${sobra}, que não cobre a quantidade (${qty}). Escolha outro endereço ou deixe "Qualquer endereço (automático)"` ``
  - `cod`, `saldo`, `outras`, `numeros`, `sobra`, `plural` e o arredondamento (`Math.round(x * 1e6) / 1e6`) **como na C1** (`:1271-1282`);
  - `contando` = `` ` (já contando ${jaPedido} desta entrega)` `` quando `jaPedido > 1e-9`, senão `''`;
  - o prefixo `${material_nome}: ` vem do `validarOrigemDaEntrega` (caso c nunca é `planejada`, então nunca vira *"não serve mais"*).
  - Exemplo (RN-200.01): *"E200-1: em XB-01, lote L1 há 6 para esta entrega, mas 4 já está separado dali para outra requisição (REQ-0001);
    sobra 2, que não cobre a quantidade (4). Escolha outro endereço ou deixe "Qualquer endereço (automático)""*.
- **Precedência:** literal física de hoje primeiro (`saldo < qty`); a E1 só com `saldo ≥ qty` e `saldo − outras < qty`.
- **Ordem com as outras recusas:** depois do status (`:1876`), do crítico (`:1891-1912`) e das séries (`:1921-1955`); na passada de origem, na
  ordem dos itens; antes da prévia/`Máximo:` (`:2084-2114`) e da alçada (`:2121`).
- Casos (a), (b), automático e só lote: **inalterados, bit a bit**.

**`PUT …/separar` / `…/separacao`** — **inalterado**: a C1 sai igual, letra por letra (os 23 cenários de `separacaoSeparadoDeOutras` provam).

**Interno (serviço):**
- `mensagemSeparadoDeOutras({ gesto, cod, saldo, jaPedido, outrasQ, numeros, qty })` — a frase única das duas literais; `gesto` `'separacao'`
  (C1) ou `'entrega'` (E1). Sai do corpo de `checarOrigemItem` (`:1273-1281`), não é cópia.
- `checarOrigemItem(…, outras = null)` — `outras` passa a aceitar `{ q, numeros, gesto }`; sem `gesto` = `'separacao'` (a separação não muda).
- `memoParteGuardadaDeOutras(db, requisicaoId)` → `(materialId, origemId, loteId) => Promise<{ q, numeros }>` — o memo de `:1401-1406`
  extraído; a separação e a entrega usam o mesmo.
- `validarOrigemDaEntrega(item, ctx, qtdComOrigem, planejada, contarOutras = false)`; a chamada de `:2052` passa
  `contarOutras = !!origemId && !saiDaOrigem`; a do só lote (`:2075`) não passa.

## Tasks (sort topológico)

- **T1 — tronco — a entrega conta as outras no caso (c)** (`requisitionService.js` só).
  1. Extrair `mensagemSeparadoDeOutras` e `memoParteGuardadaDeOutras`; a separação passa a usá-los (mecânico — `separacaoSeparadoDeOutras`
     23/23 sem edição prova).
  2. `validarOrigemDaEntrega` com `contarOutras`; `outras` com `gesto: 'entrega'`; a chamada de `:2052`.
  3. Rodar `npm run test:api` inteiro; todo vermelho novo é medido e reescrito **no mesmo commit** com o comentário *"Etapa 200 (RN-200.01):
     era 200 na entrega à mão e 400 na entrega da outra (C468)"* — ou vira achado no plano.
  *Controles (cada um tem de derrubar o que diz):* (i) `contarOutras` sempre `false` → caem RN-200.01/02 fronteira/05/06/08/09; (ii) sempre
  `true` (inclui a e b) → cai RN-200.04 (b) e (b'); (iii) só `!planejada` em vez de `!saiDaOrigem` → cai RN-200.04 (b); (iv) `gesto` ignorado
  (C1 na entrega) → cai a literal E1 de RN-200.01; (v) `entregarRequisicao` sem `comTravaDaRequisicao` → cai RN-200.08.
  *Estimativa:* 40 min.
- **T2 — tronco — os testes das regras**, arquivo novo `server/tests/api/entregaSaiDeRespeitaSeparado.api.test.js` (molde de setup:
  `separacaoSeparadoDeOutras.api.test.js:26-138` — `cenario`, `req`, `separar`, `entregar`, `saldoDe`, `trocas`, `semLoteNaoZero`; validades
  relativas `dia(n)`; **estoque em outro endereço em todo cenário da E1**, senão o teto do item bate antes — lição da Fase 2 da 198).
  - **pela rota** (`PUT …/entregar`): RN-200.01 (+ variante outro par), .02 (+ fronteira e a entrega de R1 depois), .03, .04 (a, b, b'), .05
    (excluída pelo `DELETE`, cancelada legada por SQL, parte limitada, NULL legado por SQL), .06 (i, ii), .07;
  - **pelo serviço** (`requisitionService.entregarRequisicao` direto): RN-200.01 (a mesma E1) e RN-200.08 (`Promise.all`, 10×, do contexto do
    teste — sem gancho).
  *Controles:* os cinco da T1, cada sabotagem rodada e anotada (quais caem); harness `perl -0pi` com âncora única sobre base LF, md5 antes →
  sabotado → restaurado igual. *Estimativa:* 1h15.
- **T3 — tronco (fecha) — integração** (RN-200.09) no arquivo da T2: pela **rota** (`PUT …/separacao` + `PUT …/entregar` com o payload que
  `montarItensEntrega` monta) e pelo **serviço** (`separarRequisicao` / `entregarRequisicao`). *Controle:* sabotagem (i) → o fluxo volta ao C468
  (R2 200 em XB-01, R1 400 *"não serve mais"*). *Estimativa:* 25 min.

Ordem: **T1 → T2 → T3**, um executor (tudo mexe na régua compartilhada da entrega). Nenhum galho; nenhuma tela (`client/` intocado).

## Letra B proposta (para `docs/almoxarifado-novidades-por-etapa.md`, a partir de B1338)

- **B1338** — a entrega desconta o separado das outras **só** quando o "Sai de" escolhido não é a origem guardada do item (outro par, ou item sem
  origem) (RN-200.01/04). **Descartado:** descontar em todo "Sai de" à mão — a tela manda a planejada como escolha explícita e, no dado antigo,
  prenderia as duas requisições. O mesmo par **acima** da própria parte fica (C470).
- **B1339** — literal própria da entrega (E1), no molde da C1, com *"para esta entrega"* e *"Escolha outro endereço ou deixe 'Qualquer endereço
  (automático)'"*; uma frase só no código para as duas. **Descartado:** reusar a C1 (fala em separação e em reabrir a janela); prometer que o
  automático desconta (não vale para material sem controle de lote, B1321).
- **B1340** — a própria requisição não é "outra": itens dela no mesmo par somam pelo já pedido nesta entrega; a parte guardada de um irmão que
  não sai agora não é protegida (C472). **Descartado:** semear o já pedido com a parte dos irmãos (tem de excluir o próprio item e muda a conta
  dos casos a/b — mais cenários do que cabe).
- **B1341** — automático, planejada e só lote não mudam (RN-200.07). **Descartado:** conferir o só lote (o motor escolhe o endereço por
  `claimSaldoDoLote`, sem guarda; mexer é no motor, que todas as saídas leem — C471).
- **B1342** — sem mudança de tela: a fatia visível é a mensagem, que aparece com a janela de entrega aberta. **Descartado:** o "Sai de" da
  entrega mostrar o que sobra (o mesmo campo novo no `/saldos` do C469).

## Letra C proposta (a partir de C470)

- **C468** — vira **resolvido** para o "Sai de" de outro par; o resto foi para C470–C472.
- **C470** — na entrega, o "Sai de" igual à origem guardada do item, com quantidade **acima** da parte guardada dele, ainda tira o excesso do que
  outra requisição separou ali (só escolhendo à mão; a tela não pré-seleciona acima da parte).
- **C471** — a entrega com só o **lote** escolhido (sem endereço) tira do endereço de mais saldo do lote sem olhar o que está separado ali para
  outra requisição.
- **C472** — a entrega com "Sai de" à mão não protege a parte guardada de **outro item da mesma requisição** no mesmo par; a entrega desse item
  depois toma *"não serve mais"*.
- **C469** — ganha a frase: o "Sai de" da **entrega** também mostra o físico do par (mesmo campo).

## O que não cobre

C470, C471, C472; o rótulo do "Sai de" (C469); material sem controle de lote no automático (B1321); a guarda *"não serve mais"* da planejada
continua (dado antigo; estoque que saiu do endereço depois — B1333).

## Cabe em 4h30?

**Sim, justo, com os cortes acima.** Análise 1h (este plano + Fase 2). Execução ~40 min (T1) + fechamento/documentação ~50 min = 1h30. Teste
~1h40 (T2 + T3) mais a suíte e as sabotagens — dentro das 2h. Risco de estouro: a suíte achar testes que afirmam a entrega à mão no par
comprometido (só medido depois da T1); passando de 3, a reescrita entra na conta e o estouro é registrado no fechamento. Fazer C470 junto
custaria +45 min a 1h (conta do excesso sobre a parte e o dado antigo); C471 é motor (+2h) — **não** cabem.

## Fase 2 — revisão do plano (a fazer, revisor fresco)

As quatro perguntas da skill, com atenção a: (a) a E1 ser alcançável sem a literal física a esconder (estoque em outro endereço nos
cenários); (b) a condição `origemId && !saiDaOrigem` cobrir o item **sem** origem guardada (o `saiDaOrigem` nasce `planejada = false`) e não
pegar o caso (b) com a planejada sem lote; (c) seguir cada RN até o último gesto: a entrega de R1 depois da recusa de R2, a devolução e a
exclusão de R2 (a recusa não grava nada que elas leiam); (d) a extração de `mensagemSeparadoDeOutras` não mudar a C1 em nenhum caractere.

## Fase 2 — correções do revisor fresco (2026-11-05) — **MANDAM sobre o texto acima onde divergem**

Revisor fresco sobre `fd1daad2`: 0 trava, 1 importante, 2 menores, todos aceitos. Confirmado: E1 bem formada (plural, números ordenados `:102`,
prefixo uma vez só — o item (c) nunca é `planejada`, `:1966-1969`); "desta entrega" é o certo (o `pedidoPorOrigem` começa vazio, `:1959`); a C1 não
muda se o `gesto` decide os dois pedaços ("desta requisição"/"desta entrega" e "para esta separação"/"para esta entrega"); a condição
`!!origemId && !saiDaOrigem` cobre exatamente o (c) (o K1 da 196 zera `origemId` e cai no só lote — C471); a tela nunca manda o (c) sozinha
(`RequisicoesList.js:695-711`); a conta nova roda sob `comTravaDaRequisicao`; a recusa vem antes da prévia (`:2084`) e da alçada (`:2121`).

1. **[IMPORTANTE] O C468 voltava conforme a ordem dos itens.** XB-01/L1 com 4 (e estoque em outro endereço); R1 guardou 2 ali; R2 tem item A (id
   menor, automático, "Sai de" XB-01/L1 à mão, 2) e item B (id maior, guardou 2 ali, vai pela pré-seleção — caso b, 2). A conferido primeiro: 4 −
   2 de R1 = 2, cabe; B: 4 − 2 = 2, cabe → o par vai a 0 e R1 toma "não serve mais". Com os ids trocados, A toma a E1. **T1.2 passa a ser:** no caso
   (c), `checarOrigemItem` faz só a conta física (sem `outras`); a E1 sai de **uma passada depois do laço** e antes do "só lote", com
   `pedidoPorOrigem` completo: para cada item (c), `ja = pedidoPorOrigem.get(chave) − qtdComOrigem` e o físico do par; E1 se
   `físico − ja − outras.q < qtdComOrigem` (e `outras.q > 1e-9`), com `contando = ja`. Nenhuma literal de (a)/(b) muda de lugar. **RN-200.06 (iii):**
   o cenário acima, nas duas ordens de id → E1 no item A nas duas. **Controle (vi):** a conta dentro do laço → cai a (iii) na ordem A antes de B.
   +15–20 min na T1.
2. **[MENOR] RN-200.08 (corrida):** alternar quem é lançado primeiro (par/ímpar das 10 repetições) e registrar no plano quantas terminaram em cada
   ordem — senão o `Promise.all` vira sequencial e o controle (v) só cai por sorte.
3. **[MENOR] B1338** ganha: "vale também com `serie_ids` (as séries não dizem de qual caixa são); o K1 (só lote) fica fora (C471)".

## Execução

- [x] **T1** — `d7ff9a39`. `memoParteGuardadaDeOutras` e `mensagemSeparadoDeOutras` extraídos (a separação usa os dois; C1 igual —
  `separacaoSeparadoDeOutras` 23/23 e `preSelecaoColetaIntegracao` 9/9 sem edição). `validarOrigemDaEntrega(…, contarOutras)` só confere o
  físico e marca o item (c) (`!!origemId && !saiDaOrigem`); a E1 sai de **uma passada depois do laço**, antes do só lote, com
  `ja = pedidoPorOrigem.get(par) − qtdComOrigem` (Fase 2, item 1). `npm run test:api` depois da T1: **586/586** — nenhum teste antigo
  afirmava a entrega à mão no par comprometido (0 reescritas).
- [x] **T2** — `943a486e`. `server/tests/api/entregaSaiDeRespeitaSeparado.api.test.js`, 19 cenários. **Vermelho** contra o serviço de
  `e22db079`: 11/19 caem (os 8 que passam são os que não mudam: .03, .04 a/b/b', .05 excluída/cancelada, .06 (i), .07).
- [x] **T3** — `71783dc8`. RN-200.09 pela rota (`PUT …/separacao` + `PUT …/entregar` com o payload de `montarItensEntrega`) e pelo serviço.
  Arquivo: **21/21**.
- **Controles** (perl `-0pi` sobre base LF, âncora `grep -cF` = 1, md5 `64cf3e5b…` antes → sabotado → restaurado igual por cópia):
  (i) `contarOutras` sempre `false` → 11/19 caem (.01 ×3, .02, .05 parte/NULL, .06 ii/iii ×2, serviço, corrida "volta 0: as duas passaram");
  na T3 os dois RN-200.09 caem na entrega de R2 em XB-01/L1 (200 em vez de 400 — o C468); (ii) sempre `true` → .04 a, b, b' (E1 no lugar);
  (iii) `!planejada` → .04 b e b'; (iv) `gesto` da separação → as 11 literais E1; (v) `entregarRequisicao` sem `comTravaDaRequisicao` → só a
  corrida (volta 0, as duas passaram); (vi) a conta dentro do laço → .06 (iii) A antes de B (200) e .06 (ii) (contando 1 em vez de 2).
- **Corrida RN-200.08** (alternando quem é lançado primeiro, par/ímpar): **separação venceu 5, entrega venceu 5** — em todas as 10 voltas
  venceu a lançada primeiro (a trava serializa na ordem de chegada); nunca as duas.
- **Divergência do texto anterior (a Fase 2 manda):** RN-200.06 (ii) — com a passada depois do laço, a E1 cai no **primeiro** item
  (*"há 4 (já contando 2 desta entrega) … sobra 0, que não cobre a quantidade (1)"*), não no segundo com "já contando 1". As duas formas
  recusam a mesma entrega; a nova vê o pedido completo dos irmãos. O controle (iii) derruba também o (b'), além do (b) previsto.
- **Suítes finais (serial, sobre `71783dc8`):** `test:api` **587/587** arquivos; `test:almoxarifado` 44/0; `test:validation` 4/0;
  `test:safealter` 3/0; `test:sqlite` 16/0. `client/` intocado.

## Próxima tarefa detalhada

*(a preencher no fechamento — candidato: item 2 do 2º pacote, C469, "o local mostra quanto realmente sobra", 2h30.)*
