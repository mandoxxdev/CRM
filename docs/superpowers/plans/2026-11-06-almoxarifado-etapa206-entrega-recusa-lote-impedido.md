# Etapa 206 — a entrega recusa lote impedido (almoxarifado)

> partida: "Próxima tarefa detalhada" de `docs/superpowers/plans/2026-11-06-almoxarifado-etapa205-lote-impedido-na-aprovacao-e-separacao.md`
> (`:391` em diante), conferida contra o código em `9a5611a0` — bate, com **dois achados a mais** (abaixo: o lote planejado impedido já
> recusa antes de baixar; a conferência tem de descontar o que as passadas 0/1 tiram à mão do mesmo lote). Item 7 do 2º pacote
> (`docs/estimativas/2026-11/estimativa_2026-11-05_almoxarifado-proximas-2.txt:28-30`, **4h a 4h30**, estimativa já commitada).
> 2ª parte do **C464**; tira a causa do **C484**. Mexe em quem tira saldo do estoque (a entrega) — tronco, sob as travas que a entrega já
> segura. Sem tela nova; a fatia visível é a mensagem e o número da janela de entrega.

## Objetivo (em linguagem simples)

Quando o material da requisição só tem saldo em lote bloqueado, reprovado ou vencido, a entrega hoje passa: o que nenhum lote bom cobre sai
como *"Sem lote atribuído"*, que fica negativo, e o lote ruim continua cheio. O estoque por lote deixa de bater e o material trava na conta de
aprovação/separação (C484). Depois desta etapa, a entrega **recusa** antes de baixar qualquer coisa, dizendo **qual lote** está impedido, **por
quê** (bloqueado, reprovado, vencido em tal data) e **quanto** — e o que fazer: liberar o lote ou entregar a menos. A janela de entrega e a fila
passam a oferecer só o que dá para entregar.

**Fronteira:** material **sem** controle de lote não muda (B204/B1371). As telas de saldo não mudam (C481). O negativo que já existe no banco
fica (C487).

## Fase 0 — medido em 2026-11-06 (sobre `9a5611a0`)

### O caminho da entrega (`server/services/almoxarifado/requisitionService.js`)

- `entregarRequisicao` (`:1960-1963`) = `serializarNaRequisicao` → `comTravaDaRequisicao` → `entregarSemTrava` (`:1965`). Tudo abaixo roda
  **dentro** das duas travas (Etapa 95). Rota: `PUT /api/almoxarifado/requisicoes/:id/entregar` (`server/routes/almoxarifado.js:4785`,
  chamada em `:4787`).
- **Antes de qualquer baixa**, em ordem: crítico só até a caixa (`:1994-2008`); séries (`:2018-2047`); origem/lote por item
  (`validarOrigemDaEntrega` `:2061`, que chama `checarOrigemItem` `:1329`) — enche `origemPorItem` (`qtdComOrigem` = a parte que sai com
  origem), `origemGuardada` (`saiDaOrigem`, `parteQueFica`) e `pedidoPorOrigem`; o caso (c) da 200 (`:2156-2190`); o "só lote" (`:2195-2213`);
  **a prévia** (`:2216-2242`: por item, `saldoAjustadoPelosIrmaos(saldoDisponivelParaItem)` + `entregavelPeloMotor` + `maxEntregar(…,
  tetoDaLeitura)` em `:2228`, recusa E1 *"não é possível entregar … Máximo: …"* em `:2229-2236`); `algoAEntregar` (`:2243`); e **só então a
  alçada de valor** `verificarBloqueioLiberacao` (`:2249`) — que **grava** status e manda e-mail (Etapa 94, B464: recusa tem de vir antes dela).
- Depois da alçada: a leitura fresca por item (`:2267-2297`, mesma conta da prévia, E1 em `:2284-2295`), os `planos` (`:2267-2363`; pedaços
  `comOrigem` passada 0/1 e automáticos passada 2, `controleLote` lido em `:2356`), e as três passadas (`:2458-2480`).
- **Onde o negativo nasce:** passada 2, parte automática de material `controleLote` sem série (`:2465`):
  `dividirPorLotes(await lotesParaOAutomatico(...))` (`:2466`) e **`if (resto > Q.QTD_FOLGA) await baixar(plano, baixa, resto, null)`
  (`:2473`)**. `baixar` (`:2379`) chama o motor com `lote_id` ausente → `stockService.claimSaldoSemLote` (`stockService.js:467`): drena primeiro
  as linhas **sem lote com saldo positivo**, e só o que sobra vai para a linha sem lote, que fica negativa. Material sem controle: `:2477`.
- `lotesParaOAutomatico(db, materialId, saiuDaOrigemPorItem, parteQueFicaPorItem)` (`:1900-1958`): lotes `elegivel` de
  `lotService.listarLotesDoMaterial` (`lotService.js:524-559`, `elegivel` em `:541`), saldo menos o em inspeção do lote e menos a **parte
  guardada** das caixas vivas (por par lote/endereço, B1329). É a régua do automático — a conferência nova a reusa, não a duplica.

### Achado 1 — o lote planejado impedido já recusa antes de baixar (brief, ponto 4)

`checarOrigemItem` confere o lote explícito (`:1342-1356`): `status <> 'ATIVO'` → *"Lote ⟨código⟩ esta ⟨bloqueado|reprovado⟩ e nao pode ser
utilizado"* (`:1347-1349`); vencido sem liberação → a literal do motor (`:1350-1354`). Para a origem **planejada** (passada 0 da 196),
`validarOrigemDaEntrega` embrulha: *"⟨material⟩: a origem da separação (⟨end⟩) não serve mais (Lote L1 esta bloqueado e nao pode ser
utilizado) — entregue escolhendo de onde sai"* (`:2069-2073`). Roda no laço das origens, **antes da prévia** — nada baixa. O que falta é o
passo seguinte: "escolhendo de onde sai" com `origem_automatica: true` cai no automático, que hoje vai sem lote. **A conferência nova cobre
isso; a recusa da planejada fica como está** (B1389).

### Achado 2 — as passadas 0/1 tiram do mesmo lote antes do automático

O automático roda **depois** dos pedaços com origem. Para a origem **guardada** que a entrega usa (`saiDaOrigem`), ler `lotesParaOAutomatico`
antes das baixas dá o mesmo que depois (o saldo do lote cai `q` e a parte guardada descontada cai `q`). Para a origem **escolhida à mão** (caso
(c), "só lote" — `saiDaOrigem` falso), o saldo do lote cai e a parte guardada não: lida antes, a régua sobra `q` a mais. A conferência desconta
esses pedaços do lote em que saem (e os com `loteId` nulo, do sem lote positivo). Sem isso: L1 ATIVO 4 em A, item 1 tira 3 de (A, L1) à mão,
item 2 automático 2, L2 bloqueado 5 → a prévia veria 4 livres, passaria, e a baixa deixaria sem lote −1 (RN-206.09).

### O detalhe e a fila (o Achado 1 da 205, agora na entrega)

- **Detalhe** — `GET /api/almoxarifado/requisicoes/:id`, a consulta traz `lote_impedido` (`routes/almoxarifado.js:3985`) e `normalizarItem`
  (`requisitionService.js:278-341`) já calcula `tetoSeparavel` com ele (`:304-307`), mas o **entregável** usa o `teto` de hoje: `entregavelSozinho`
  (`:310-311`, `maxEntregar(item, entregavelPeloMotor(estoque − reservaItem, …), teto)`) e a segunda rodada `saldo_entregavel: caixa + teto`
  (`:323`). A janela de entrega e o botão de um clique leem `quantidade_entregavel`/`saldo_entregavel`.
- **Fila** — `listarFilaSeparacao`, coluna `lote_impedido` (`:1100`) usada só no `teto` (`:1141`); `entregavel` (`:1158-1159`) não desconta.
- Sem mudar os dois, a janela vem com 6 e a entrega recusa os 6 — o gesto posterior recusando o anterior.

### Quem depende do comportamento de hoje (vermelho de propósito)

- `server/tests/api/loteImpedidoIntegracao.api.test.js`: `:156` `[RN-205.10]` (entrega de 6 sai sem lote, −6), `:179` `[RN-205.10, segunda
  rodada]` (−10), `:198` `[Fase 5 P1 desfeito]` e `:223` `[… cenario do revisor]` — os dois últimos **montam o negativo pela entrega**; passam a
  montá-lo por SQL (o negativo legado continua existindo; o que testam é a conta da 205, não a entrega).
- `server/tests/api/entregaAutomaticaPeloLote.api.test.js` RN-197.03 (`naoElegivel` `:201-213`, testes `:214` e `:217`): esperam
  `['SAIDA', null, null, 2]` e `ZP-01/-=-2`. Viram a recusa (RN-206.01/.03). O `:220` (vencido **com** liberação) e o `:233` (RN-197.04, sem
  controle) **continuam verdes** — são controles da fronteira.
- `loteImpedido.api.test.js` RN-205.02 (i, j, l) já montam o negativo por SQL — não mudam.
- A varredura completa (`npm run test:api`) roda na T1 com a conferência ligada; quebra fora desta lista entra no plano antes de editar.

## Decisões (letra B — reversíveis; livres depois de B1382, conferido: o maior hoje é B1382; C a partir de C485 — C482 e C483 ficaram
reservados sem uso na 205, o maior usado é C484)

- **B1383 — o caminho: uma conferência nova na prévia, por material, antes da alçada.** Depois do laço da prévia (`:2242`) e antes de
  `algoAEntregar`/`verificarBloqueioLiberacao` (`:2243`/`:2249`): para cada material `controle_lote = 1`, soma a parte automática dos itens
  desta entrega (na ordem do laço) e compara com o que o automático vai achar (B1384). Passou do que cabe **e** há saldo em lote impedido (B1386)
  → 400, nada baixado, nada gravado. O `:2473` fica **como está** (rede para a corrida de B1392). **Descartados:** (a) recusar em `:2473` — as
  passadas 0/1 e as fatias anteriores já baixaram, sem transação: entrega pela metade; (b) trocar o `disponivel` do E1 pelo `disponivel_liberado`
  — a mensagem não nomearia o lote e a régua aproximada da B1370 recusaria o que o automático faria certo (bloqueada de peça num lote bom);
  (c) pôr na leitura fresca (`:2284`) — roda depois da alçada (B464); (d) exigir que a pessoa escolha o lote — contraria a decisão do cliente de
  2026-08-10 (`stockService.js:1330-1333`: lote só onde há campo).
- **B1384 — a régua do que sobra para o automático é a do próprio automático.** `cabe(m) = Σ_L max(0, saldo_L de lotesParaOAutomatico(db, m,
  new Map(), parteQueFica) − pedidoÀMão_L) + max(0, semLotePositivo(m) − pedidoComOrigemSemLote(m))`, arredondado a 1e-6, onde `pedidoÀMão_L` =
  pedaços com origem desta entrega no lote L de itens **sem** `saiDaOrigem` (Achado 2), `pedidoComOrigemSemLote` = pedaços com origem e
  `loteId` nulo, e `semLotePositivo` = `SUM(quantidade)` das linhas `lote_id IS NULL AND quantidade > 0` do material (o que
  `claimSaldoSemLote` drena antes de negativar). O `parteQueFica` é o mesmo mapa de `origemGuardada` que a passada 2 usa. **Descartado:**
  reescrever a conta em SQL (duas réguas para o mesmo automático — a da 197 já trata inspeção, parte guardada por endereço e endereço bloqueado).
- **B1385 — o saldo sem lote positivo continua saindo.** Material com controle de lote e linha sem lote > 0 (estoque de antes de ligar o
  controle): o automático tira dela depois dos lotes, como a B1323 dizia. **A B1323 fica revisada, não revogada:** só a parte que iria
  **negativa** é recusada. **Descartado:** recusar todo saldo sem lote em material com controle — travaria o estoque legado sem caminho na tela.
- **B1386 — só recusa quando o que falta está em lote impedido.** Condição: `falta = pedidoAuto − cabe > folga` **e** o material tem saldo em lote
  impedido (`Σ max(0, saldo do lote − em inspeção no lote)` dos lotes `!elegivel`, > folga). Falta sem lote impedido (p.ex. o lote bom está todo
  na parte guardada de outra caixa) segue como hoje — **C485**. **Descartado:** recusar toda falta — muda uma regra que a etapa não mediu (a
  parte guardada da 197) e a mensagem não teria lote para nomear.
- **B1387 — recusa a entrega inteira; não entrega a parte que cabe sozinha.** A regra de hoje para falta de saldo (E1, `:2229`) é a referência:
  400 com o máximo, a pessoa reenvia com menos. A literal diz quanto a menos. **Descartado:** cortar em silêncio para o que cabe — o 200 com
  menos do que foi pedido some com a diferença na tela.
- **B1388 — a literal** (contrato abaixo): o material na frente (molde das recusas da entrega), o item, quanto falta, cada lote impedido com o
  motivo e o saldo, e o que fazer. Motivo pela régua do motor (`stockService.js:1547-1584`): o **status** primeiro (`bloqueado`, `reprovado`,
  minúsculo como o motor); se `ATIVO`, `vencido em DD/MM/AAAA` (data em formato de tela, não o ISO do motor — a frase é para o almoxarife).
  Lotes na ordem de `listarLotesDoMaterial`; lote com saldo ≤ folga fica de fora. **Descartado:** reusar a literal do motor (*"Lote X esta
  bloqueado e nao pode ser utilizado"*) — fala de um lote só e não diz que a entrega toda foi recusada nem quanto.
- **B1389 — lote planejado impedido: a recusa de hoje fica** (Achado 1, `:2069-2073`, literal byte a byte). O "entregue escolhendo de onde sai"
  com automático cai na B1383.
- **B1390 — detalhe e fila descontam o lote impedido do entregável.** `normalizarItem`: `entregavelSozinho = maxEntregar(item,
  entregavelPeloMotor(...) − loteImpedido, tetoSeparavel)` e a segunda rodada `saldo_entregavel: caixa + tetoSeparavel`; fila `:1158`:
  `max(0, entregavelPeloMotor(...) − lote_impedido)`. É a conta aproximada da B1370 (assume a bloqueada dentro do lote impedido): no pior caso
  promete **mais** do que a porta aceita quando a bloqueada é de peça num lote bom — preço declarado, **D (206)**. **Descartado:** chamar
  `lotesParaOAutomatico` por linha do detalhe e da fila (três consultas por item; o detalhe não sabe o que os irmãos vão tirar à mão).
- **B1391 — `permite_saldo_negativo` não isenta.** O saldo existe; está em lote impedido. Negativar o sem lote com o lote cheio é o defeito, com
  ou sem a permissão. **Descartado:** isentar — o material com negativo permitido continuaria gerando o C484.
- **B1392 — sem trava nova.** A conferência roda dentro das duas travas que a entrega já segura. Mudar o status do lote não pega trava (B1375):
  bloquear um lote entre a prévia e a passada 2 faz a passada 2 (que relê os lotes) mandar a diferença para o sem lote, como hoje — janela de
  milissegundos, declarada em **D (206)**. **Descartado:** pegar a trava do material em `mudarStatusLote` — outra porta, outra etapa.
- **B1393 — corte se estourar 4h30 em mais de 30 min:** a RN-206.09 (origem à mão + automático do mesmo lote) sai — a conferência passa a tratar
  todo pedaço com origem como tirando do elegível (conservador: pode recusar a mais, nunca negativar) — e vira **C488**.

### Fora (C novos)

- **C485** — o automático de material com lote ainda negativa o sem lote quando o lote bom está todo na parte guardada de outra caixa (sem lote
  impedido; B1386).
- **C486** — série em lote impedido: a validação das séries (`:2018-2047`) não olha o lote; o motor recusa na baixa da passada 2 — com vários
  itens, depois de outros baixados.
- **C487** — o negativo sem lote que já existe (C484) não some: a etapa só para de criar. Regulariza-se por **Ajuste** com localização (a Etapa
  51 absorve a linha sem lote negativa, `stockService.js` RN-04). O guia diz isso.
- **C488** — reservado para o corte da B1393.

## Regras de negócio

Montagem padrão: material **com** controle de lote, não crítico, sem série, unidade `un`; lotes por Entrada v2; status por `mudarStatusLote`;
validade **relativa** a hoje (`diaLocal`); requisição separada **sem origem** (caixa automática) antes de tornar o lote impedido (o caso que chega
à entrega — molde do helper `naoElegivel`, `entregaAutomaticaPeloLote.api.test.js:201`). "Nada baixado" = livro da requisição vazio, retrato das
linhas igual ao de antes, `quantidade_entregue` 0, status igual, nenhuma linha em `substituicoes_origem_requisicao`.

- **RN-206.01 — a entrega que tiraria de lote impedido recusa, nada baixado.** L1 ATIVO 2, L2 BLOQUEADO 3 (depois de separar 4) → `PUT /entregar`
  de 4 → 400 com a literal: `⟨nome⟩: não é possível entregar 4 un — faltam 2 un em lote que pode sair. Em lote impedido: L2 (bloqueado, 3 un).
  Libere o lote (mude o status ou libere o vencimento) ou entregue 2 un a menos.` Nada baixado. **Controle positivo:** sem a conferência (sabotagem
  de posição: `return` no começo do helper), o 200 de hoje com sem lote −2.
- **RN-206.02 — a parte que cabe sai.** A mesma montagem, entrega de 2 → 200, `['SAIDA', null, 'L1', 2]`, L2 3 intacto, nenhuma linha sem lote
  negativa.
- **RN-206.03 — vencido e reprovado.** (a) L2 ATIVO vencido há 3 dias sem liberação → `L2 (vencido em DD/MM/AAAA, 3 un)` (a data de `dia(-3)`
  formatada); (b) L2 REPROVADO → `L2 (reprovado, 3 un)`; (c) L2 BLOQUEADO **e** vencido → `bloqueado` (o status primeiro); (d) vencido **com**
  liberação → 200, sai de L2 (o RN-197.03 cenário 2 continua verde); (e) dois lotes impedidos → os dois, na ordem de `listarLotesDoMaterial`,
  separados por `, `.
- **RN-206.04 — o sem lote positivo continua saindo (B1385).** L2 BLOQUEADO 3 + linha sem lote +2 (entrada com o controle desligado, depois
  ligado): entrega de 2 → 200, `['SAIDA', null, null, 2]`, sem lote 0 (não negativo); entrega de 3 → 400 `faltam 1 un`.
- **RN-206.05 — sem controle de lote nada muda.** RN-197.04 (`entregaAutomaticaPeloLote.api.test.js:233`) continua verde: sem lote −3, L1 intacto.
- **RN-206.06 — a reserva de antes do bloqueio (B1372).** L1 ATIVO 10, R1 de 6 aprovada (reserva 6), separa 6, L1 → BLOQUEADO: entrega de 6 →
  400 `faltam 6 un … L1 (bloqueado, 10 un) … entregue 6 un a menos`; a reserva continua ATIVA 6. `PUT /lotes/:id/status` L1 → ATIVO → a mesma
  entrega → 200, sai de L1. (Substitui o `[RN-205.10]` `:156`; o da segunda rodada `:179` vira o mesmo com entrega parcial **antes** do bloqueio.)
- **RN-206.07 — a origem planejada em lote impedido (B1389).** Separa 4 de (A, L1), L1 → BLOQUEADO, L2 ATIVO 4 em B: (a) entrega de um clique →
  400 com a literal de hoje (`a origem da separação (A) não serve mais (Lote L1 esta bloqueado e nao pode ser utilizado) — entregue escolhendo de
  onde sai`), nada baixado; (b) `origem_automatica: true` → 200, sai de L2, substituição registrada; (c) sem L2 → 400 com a literal da RN-206.01
  (`L1 (bloqueado, 4 un)`).
- **RN-206.08 — irmãos do mesmo material.** Dois itens, 2 e 2, L1 ATIVO 3, L2 BLOQUEADO 3 → 400 no **segundo** item (`não é possível entregar 2
  un — faltam 1 un`), nada baixado — nem o primeiro.
- **RN-206.09 — origem à mão no mesmo lote (Achado 2).** L1 ATIVO 4 em A, L2 BLOQUEADO 5: item 1 sai de (A, L1) 3 escolhido à mão, item 2
  automático 2 → 400 no item 2 (`faltam 1 un`). **Controle positivo:** sem o desconto `pedidoÀMão_L`, a prévia passa e a baixa deixa sem lote −1.
- **RN-206.10 — precedência e alçada.** (a) Pedido acima do máximo do E1 → a literal E1 de hoje, byte a byte (a nova não aparece); (b) requisição
  acima do limite de valor com a montagem da RN-206.01 → 400 da literal nova, status **não** vira `AGUARDANDO_APROVACAO_VALOR`, nenhuma
  notificação (a conferência vem antes de `verificarBloqueioLiberacao`).
- **RN-206.11 — detalhe e fila batem com a porta (B1390).** Montagem da RN-206.01: `GET /requisicoes/:id` → `quantidade_entregavel` 2,
  `saldo_entregavel` 2; `GET /fila-separacao` → `entregavel` 2. RN-206.06 bloqueada: 0 e 0. Segunda rodada (R de 10, reserva 6, entrega 2 antes,
  depois L1 bloqueado): `saldo_entregavel` = caixa + `tetoSeparavel` (não `caixa + teto`). Sem lote impedido: os números de hoje, byte a byte.
- **RN-206.12 — `permite_saldo_negativo` não isenta (B1391).** RN-206.01 com o material `permite_saldo_negativo = 1` → o mesmo 400.

## Contrato (congelado)

### Rota

`PUT /api/almoxarifado/requisicoes/:id/entregar` — payload, 200 e os outros códigos **sem mudança**. Recusa nova: **400**, `{ error: <literal> }`
(o formato de erro de hoje da rota).

### Literal (`requisitionService.js`, nova função exportada)

```js
// qu(q, un) = [Q.qtd(q), un].filter(x => x !== undefined && x !== null && x !== '').join(' ')
// motivoDoLote(l) = l.status !== 'ATIVO' ? String(l.status).toLowerCase() : `vencido em ${dd}/${mm}/${aaaa}`  // de substr(data_validade,0,10)
fraseEntregaLoteImpedido(nomeMaterial, qtyDoItem, unidade, falta, impedidos /* [{ codigo, status, data_validade, quantidade }] */) =>
  `${nomeMaterial}: não é possível entregar ${qu(qtyDoItem, unidade)} — faltam ${qu(falta, unidade)} em lote que pode sair. `
  + `Em lote impedido: ${impedidos.map((l) => `${l.codigo} (${motivoDoLote(l)}, ${qu(l.quantidade, unidade)})`).join(', ')}. `
  + `Libere o lote (mude o status ou libere o vencimento) ou entregue ${qu(falta, unidade)} a menos.`
```

Os testes importam `fraseEntregaLoteImpedido` (não redigitam).

### Conferência (nova, `requisitionService.js`, perto de `lotesParaOAutomatico`)

```js
// Le, nao grava. Roda na previa, dentro das duas travas. Devolve null (cabe) ou { item, falta, impedidos } do primeiro item, na ordem do laco,
// em que a soma da parte automatica do material passa de `cabe` (B1384) com saldo em lote impedido (B1386).
async function conferirAutomaticoPeloLote(db, itensDaEntrega /* [{ item, qty, qtdComOrigem, saiDaOrigem, origemLoteId, temSerie }] */,
  parteQueFicaPorItem /* Map */, pedidoPorOrigem /* Map 'm|origem|lote' -> q */)
```

- Parte automática do item = `qty − qtdComOrigem` (0 quando ≤ folga); entra só material `controle_lote = 1` e item **sem** série (`!seriesPorItem.has`).
- `impedidos` = `listarLotesDoMaterial(db, m, { apenasComSaldo: true })` com `!elegivel`, `quantidade = max(0, saldo − em inspeção no lote)`
  (a mesma régua do desconto da 197), > folga.
- Chamada uma vez depois do laço da prévia (`:2242`), antes de `algoAEntregar` (`:2243`). O resultado não nulo vira
  `Object.assign(new Error(fraseEntregaLoteImpedido(...)), { status: 400 })`.

### Detalhe e fila

| Leitor | Antes | Agora |
|---|---|---|
| `normalizarItem` `entregavelSozinho` `:310-311` | `maxEntregar(item, entregavelPeloMotor(...), teto)` | `maxEntregar(item, entregavelPeloMotor(...) − loteImpedido, tetoSeparavel)` |
| `normalizarItem` segunda rodada `:323` | `caixa + teto` | `caixa + tetoSeparavel` |
| fila `entregavel` `:1158-1159` | `max(0, entregavelPeloMotor(...))` | `max(0, entregavelPeloMotor(...) − num(i.lote_impedido))` |
| `saldo_atual`, `disponivel` (fila), separável | — | **sem mudança** |

Se `teto` ficar sem uso em `normalizarItem`, sai (sem variável morta). Material sem controle: `lote_impedido` é 0 (o `CASE` do `loteImpedidoSql`)
— os números de hoje.

## Tasks

Todas **tronco** e sequenciais: T1 e T2 mexem em `requisitionService.js` na mesma regra (o que a entrega pode tirar); erro de interpretação na T1
exige retrabalho na T2. Sem worktree, sem galho.

- **T0 (tronco) — SDD: os testes que fixam o de hoje viram a regra nova.** Editar **antes** do código: `loteImpedidoIntegracao` `:156` e `:179`
  (viram RN-206.06/RN-206.11 segunda rodada), `:198` e `:223` (o negativo por SQL: `UPDATE`/`INSERT` em `estoque_saldo_almoxarifado` +
  `quantidade_atual`, molde RN-205.02 i/j/l de `loteImpedido.api.test.js:199-215`); `entregaAutomaticaPeloLote` `:214`/`:217` (viram
  RN-206.01/.03 a). Rodar: os quatro de entrega vermelhos (a feature não existe), os dois do C484 verdes (provam que o negativo por SQL monta a mesma
  conta). ~30 min.
- **T1 (tronco) — a conferência e a literal.** `conferirAutomaticoPeloLote` + `fraseEntregaLoteImpedido` + a chamada na prévia. Testes em
  `server/tests/api/entregaLoteImpedido.api.test.js` (novo): RN-206.01 a .10 e .12, pela **rota**. **Controles positivos:** (i) `return null` no
  começo da conferência → RN-206.01/.06/.08 vermelhos com 200 e sem lote negativo; (ii) tirar o `− pedidoÀMão_L` → RN-206.09 vermelho; (iii)
  tirar o `semLotePositivo` → RN-206.04 vermelho (recusa os 2); (iv) mover a chamada para depois de `verificarBloqueioLiberacao` → RN-206.10 b
  vermelho (status gravado). Depois: `npm run test:api` inteiro — quebra fora da lista da Fase 0 vai para o plano antes de editar. ~1h15.
- **T2 (tronco, depois da T1) — detalhe e fila.** `normalizarItem` e `listarFilaSeparacao` (contrato acima). Testes no mesmo arquivo: RN-206.11.
  **Sabotagem de posição:** tirar o desconto só da fila → RN-206.11 vermelho na fila com o detalhe verde (são leituras separadas). ~30 min.
- **T3 (integração, rota E serviço) — `server/tests/api/entregaLoteImpedidoIntegracao.api.test.js`.** Pela **rota**: Entrada v2 L1 2 e L2 3 →
  `POST /requisicoes` 4 → aprovar (reserva 4 — antes do bloqueio) → `PUT /requisicoes/:id/separacao` 4 → `PUT /lotes/:id/status` L2 BLOQUEADO →
  `GET /requisicoes/:id` (`quantidade_entregavel` 2) → `GET /fila-separacao` (`entregavel` 2) → `PUT /entregar` 4 (400, literal) → `PUT /entregar`
  2 (200, sai de L1) → L2 volta a ATIVO → `PUT /entregar` 2 (200, sai de L2) → nenhuma linha sem lote negativa no fim; requisição atendida. O
  **mesmo** pelo **serviço** (`prepararPosAprovacao` sob `comTravaDaRequisicao` → `separarRequisicao` → `entregarRequisicao` com a recusa e as
  duas entregas), mesmos números e mesmo livro. ~30 min.
- **F2 — revisor fresco** antes da T0, com as quatro perguntas da `desenvolver-etapa` (a quarta: cada RN até o último gesto — aprovar → separar →
  bloquear → janela de entrega → entregar → liberar o lote → entregar de novo → devolver/estornar a entrega de lote).
- **Fase 5** — revisão adversarial (correção da RN, "passaria com a feature quebrada?").
- **T4 — fechamento** (`fechar-etapa`): specs `10-lotes-series-etiquetas` (C464 fechado), `05-separacao-picking` (a entrega) e `07-reservas` (B1323 revisada); mapa; guia (Antes → Agora:
  *"a entrega tirava de lote bloqueado e deixava 'Sem lote atribuído' negativo"*; como regularizar o negativo antigo, C487); manual; novidades
  B1383–B1393, C485–C487 (+C488 se o corte), D (206), F (206), o C484 anotado ("para de nascer"); plano; estimado × gasto do item 7.

## Cabe nas 4h–4h30?

Análise e plano ~1h (esta). Execução: T0 30 min + T1 1h15 + T2 30 + T3 30 ≈ **2h45**, das quais ~2h são testes. Com F2, Fase 5 e fechamento
apertados (~45 min), fecha em **~4h30** — no teto, sem folga. O risco é a T1 (a régua do Achado 2 e os controles). Se estourar em mais de 30 min,
corta-se a RN-206.09 (B1393 → C488); a conferência, a literal e o detalhe/fila ficam — sem o detalhe a janela promete o que a porta recusa.

## Pontos de atenção

- **A conferência não pode gravar nada** e tem de vir antes de `verificarBloqueioLiberacao` (`:2249`) — B464; RN-206.10 b pega.
- **Reuse `lotesParaOAutomatico`** com `new Map()` no `saiuDaOrigemPorItem` (antes das baixas nada saiu) e o mesmo `parteQueFicaPorItem` que a
  passada 2 usa (construído de `origemGuardada`, `:2451-2454` — hoje é uma closure sobre `origemGuardada`, já cheio na prévia).
- **A ordem do laço** decide o item da mensagem (RN-206.08): acumule a parte automática por material na ordem de `itens`.
- **`saldoAjustadoPelosIrmaos` não muda** — a conferência é uma passada à parte, por material.
- **O E1 vem primeiro** (RN-206.10 a): a conferência só roda se a prévia inteira passou.
- **Série fora** (`!seriesPorItem.has(item.id)`, a mesma condição de `:2465`) — C486.
- **Data da literal:** `data_validade` pode vir com hora (`substr(0, 10)`, a régua de `isVencido`). Teste com `dia(-3)` relativo, nunca data fixa.
- **O detalhe já traz `lote_impedido`** (`routes/almoxarifado.js:3985`) e a fila também (`:1100`) — nenhuma consulta nova.
- **Testes de corrida:** nenhum gesto novo concorrente (B1392). Não precisa de gancho.
- `mudarStatusLote` exige justificativa; rotas `PUT /api/almoxarifado/lotes/:id/status` e `PUT /lotes/:id/liberar-vencimento`
  (`routes/almoxarifado/extended.js`, `requirePermission('inspecionar')`).

## Fase 2 — correções do revisor fresco (2026-11-06) — **MANDAM sobre o texto acima onde divergem**

Revisor fresco sobre `7f210f62`: 1 trava, 2 importantes, 4 menores, todos aceitos. Confirmado: a ordem das recusas (crítico → séries → origem →
caso (c) → só lote → E1 → **nova** → alçada) é coerente; o RN-197.03 refeito ainda prova "lote não elegível nunca sai"; a RN-205.10 passa a
provar a recusa; o fluxo recusa → entregar a menos → PARCIALMENTE_ATENDIDA → L2 ATIVO → entrega → exclusão fecha.

1. **[TRAVA] A conta da B1384 partia de `pedidoPorOrigem`, que não mede o que sai de cada lote.** (a) conta em dobro: a semeadura do "só lote"
   (`requisitionService.js:2203-2208`) soma os estritos de novo na chave `m|null|L` (item 1 tira 2 de (A, L1) à mão + item 2 "só lote" L1 2 + item 3
   automático 1; L1 5, L2 BLOQUEADO 3 → soma 6, sai 4 → recusa o item 3 que a baixa cumpriria: regressão). (b) com o mesmo par da origem e q > parte
   (`qtdComOrigem = qty` sem limite à parte, `:2104`, `:2141`): caixa 4, parte 2 em (A, L1), pessoa escolhe (A, L1) para os 4; A 5 em L1, L2 BLOQUEADO 3,
   item 2 automático 2 → a conferência passa, e depois da passada 0 a guarda vira `max(0, 2 − 4) = 0` (`:1922`), o livre é 1 e nasce **sem lote −1**.
   **B1384 e contrato passam a ser:** usar `origemPorItem` + `origemGuardada`:
   `cabe(m) = Σ_L max(0, saldo_L de lotesParaOAutomatico(db, m, saiuSimulado, parteQueFica) − pedido_L) + max(0, semLotePositivo − pedidoComOrigemSemLote)`,
   com `pedido_L` = Σ `qtdComOrigem` de **todo** item de `origemPorItem` com `loteId = L` (com ou sem `saiDaOrigem`) e `saiuSimulado` = Map(item →
   `qtdComOrigem`) dos itens com `origemGuardada.saiDaOrigem` (o mesmo valor que `saiuDaOrigemPorItem()` passa na passada 2). **RN-206.09b**: o
   cenário (b), controle positivo com o `new Map()` de hoje; e o cenário (a) como regressão (passa).
2. **[IMPORTANTE] B1390, piso no entregável:** `maxEntregar(item, Math.max(0, entregavelPeloMotor(...) − loteImpedido), tetoSeparavel)` (sem piso dava
   −10 com o legado do C484 e o modal pré-preenchia −10, `:187`). Teste **RN-206.11 (d)**: o negativo montado por SQL → 0.
3. **[IMPORTANTE] T0 de `loteImpedidoIntegracao.api.test.js:198-205` e `:223-229`:** tirar a R1 inteira (criar, aprovar, separar e entregar) e montar só
   `entrar(L1 10)` + `INSERT … lote_id NULL, -6` + `UPDATE quantidade_atual −6` + o status — senão a reserva 6 e a caixa ficam vivas e `[9,10,-1]` /
   `[10,6,4]` quebram. A premissa `linhas(m)` fica igual.
4. **[MENOR]** `parteQueFicaPorItem` (`const` em `:2451`) chamado em `:2242` dá ReferenceError (TDZ): subir a declaração para antes da prévia, ou montar
   o Map ali a partir de `origemGuardada`.
5. **[MENOR] Literal:** o `falta` é o **total do material** (`Σ auto − cabe`), mantendo o primeiro item que cruza; quando `falta = qty` (RN-206.07c), a
   frase final diz "nada sai deste material" no lugar de "entregue N un a menos". Ao lado do C485, registrar que inspeção/parte guardada fora da
   trava também mantêm o negativo.
6. **[MENOR]** os dois testes de `:156`/`:179` editados na T0 afirmam o detalhe 0, que só a T2 entrega — vermelhos **esperados** entre a T1 e a T2.
7. **[MENOR] D (206) e guia:** o "Sai de" (`/estoque/:id/saldos`, `extended.js:834`) continua oferecendo o lote bloqueado (escolhê-lo dá a literal do
   motor); a fila cai em `AGUARDANDO_SALDO` (`:1181-1184`) com o saldo inteiro em lote bloqueado — coerentes com a porta, declarados.

**Tamanho:** a trava soma ~30 min → ~5h (estimado 4h a 4h30). Diferença < 1 h do teto: sem reestimar; a conclusão diz por quê se passar.

## Execução

- [ ] F2 — revisor fresco do plano (antes da T0)
- [ ] T0 — SDD: os seis testes que fixam o de hoje viram a regra nova (quatro vermelhos, dois do C484 por SQL verdes)
- [ ] T1 — `conferirAutomaticoPeloLote` + `fraseEntregaLoteImpedido` na prévia (RN-206.01 a .10, .12) + `test:api` inteiro
- [ ] T2 — detalhe e fila descontam o lote impedido do entregável (RN-206.11)
- [ ] T3 — integração pela rota e pelo serviço
- [ ] Fase 5 — revisão adversarial
- [ ] T4 — fechamento (`fechar-etapa`) + suíte completa (os cinco comandos) + estimado × gasto do item 7

## Próxima tarefa detalhada

**T0 desta etapa** (depois da F2): editar os seis testes listados em "Quem depende do comportamento de hoje", na ordem:

1. `server/tests/api/entregaAutomaticaPeloLote.api.test.js:201-218` — o helper `naoElegivel` passa a esperar
   `assert.rejects` com status 400 e `fraseEntregaLoteImpedido(nome, 4, 'un', 2, [{ codigo: 'L2', status, data_validade, quantidade: 3 }])`,
   livro `[]` e retrato igual ao de antes da entrega (`ZP-01/L1=2`, `ZP-01/L2=3`). Enquanto a função não existe, o teste importa e falha por
   `undefined` — vermelho certo.
2. `server/tests/api/loteImpedidoIntegracao.api.test.js:156` e `:179` → RN-206.06 e RN-206.11 (segunda rodada): a entrega recusa; o detalhe dá 0
   (e `caixa + tetoSeparavel` na segunda rodada).
3. `server/tests/api/loteImpedidoIntegracao.api.test.js:198` e `:223` → o negativo montado por SQL (`INSERT INTO estoque_saldo_almoxarifado
   (material_id, localizacao_id, lote_id, quantidade) VALUES (?, ?, NULL, -6)` + `UPDATE materiais_almoxarifado SET quantidade_atual =
   quantidade_atual - 6`), as asserções da 205 iguais.

Depois, a T1 com o contrato acima. **Se sobrar tempo depois do fechamento:** **C478** (as três portas que distribuem para quem espera reservam
lote impedido — o mesmo fragmento no teto de `reservaChegadaService.reservarChegadaParaQuemEspera`/`distribuirSemLock`) ou **C486** (série em
lote impedido recusar antes da primeira baixa — é uma conferência de `lotService.listarLotesDoMaterial` no laço das séries, `:2018-2047`).
