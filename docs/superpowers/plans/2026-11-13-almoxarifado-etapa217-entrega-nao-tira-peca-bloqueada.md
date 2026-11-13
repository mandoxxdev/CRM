# Etapa 217 — a entrega e o automático não tiram a peça bloqueada do lote (C466, 2ª parte; C503)

> Usando a skill `desenvolver-etapa`. Ponto de partida: a "Próxima tarefa detalhada" de
> `docs/superpowers/plans/2026-11-07-almoxarifado-etapa209-bloqueio-sabe-o-lote.md` (`:434-469`). Estimativa já commitada: item 9 de
> `docs/estimativas/2026-11/estimativa_2026-11-05_almoxarifado-proximas-2.txt` (`:36-38`, **4h a 5h**). Numeração: 211 a 216 foram do
> Compras (`ls docs/superpowers/plans | sort | tail`), a 217 é a próxima livre. Números de linha medidos hoje sobre `b4c1bcd3`.

## Objetivo (em linguagem simples)

Uma peça volta de uma obra com suspeita e vai para a **quarentena** no lote L1. Desde a Etapa 209 o sistema sabe que ela é do L1 — mas
quem escolhe de que lote a entrega automática tira (o "automático", pelo vencimento mais próximo) ainda olha só o saldo do lote: o L1
tem 1 na prateleira, então ele tira do L1 justamente a peça que está em quarentena, e o L1 fica "vazio" com 1 bloqueado nele. O mesmo
com a peça **reprovada na inspeção** (o lote dela continua ATIVO) e com a peça que está **num terceiro** (remessa enviada — o saldo do
lote não muda quando ela sai). Depois desta etapa:

- o **automático** desconta de cada lote o que está bloqueado **nele** (quarentena, reprovação e terceiros) e tira do lote seguinte;
- a **aprovação** e a **separação** (a conta do lote impedido da 205) também passam a saber em que lote está o bloqueado: quando a peça
  bloqueada está num lote **bom**, o desconto do lote impedido deixa de ficar menor que o certo (fim do preço declarado da B1370/D (206)).

Fatia visível: nenhuma tela nova (B1440). O que muda na tela é o **número** — a fila de separação e a janela Separar passam a mostrar o
separável certo quando a peça bloqueada está num lote bom e há lote impedido, e a entrega deixa de oferecer/tirar a peça da quarentena.

## Fase 0 — medido em 2026-11-13 (sobre `b4c1bcd3`)

### Os dois leitores

1. **`loteImpedidoSql(m)`** (`server/services/almoxarifado/loteImpedido.js:46-60`) — o desconto do lote impedido da 205. Conta:
   `max(0, Σ_{L impedido} max(0, saldo_L − insp_L) − bloqueada − em_terceiros − inspeção sem recebimento)` (`:57`). A `bloqueada` e a
   `em_terceiros` do material são supostas **dentro** do lote impedido (B1370): nunca desconta a mais, mas desconta **a menos** quando a
   peça bloqueada está num lote bom (D (206)). Usada pelas quatro leituras da aprovação e da separação: `saldoDisponivelParaItem`
   (`requisitionService.js:528`), a fila (`:1114`), `calcularStatusPosAprovacao` (`requisitionStateMachine.js:279`) e o detalhe
   (`routes/almoxarifado.js:4023`). Só `controle_lote = 1` (B1371).
2. **`lotesParaOAutomatico(db, materialId, saiu, fica)`** (`requisitionService.js:1953-2010`) — o livre de cada lote elegível para o
   automático: `saldo − em inspeção no lote` (`:1995`), ou, com parte guardada no lote, `Σ livre das linhas − insp` (`:2004`). **Não**
   desconta bloqueio. Chamada pela entrega (`:2790`) e pela conferência da 206 (`cabeDoAutomaticoPeloLote` `:2109`, que alimenta
   `conferirAutomaticoPeloLote` e `tetoDaEntregaPeloLote`). **Não é exportada** (a RN-209.09 testou a entrada dela, `listarLotesDoMaterial`).

### As três parcelas do bloqueado do lote (medidas — batem com a "próxima tarefa" da 209)

| Parcela | Onde mora o lote | Escreve no material | Sai quando |
|---|---|---|---|
| **Quarentena/avulso** | o livro: `bloqueioPorLote.bloqueadoDoLoteSql(m, L)` (Σ `BLOQUEIO` − Σ `DESBLOQUEIO` com `lote_id = L`, `cancelado = 0`) | `quantidade_bloqueada` (motor `:1662-1725`) | `DESBLOQUEIO` com o lote (guardas M1/M2/M3 da 209) |
| **Reprovação da inspeção** | o documento: `inspecoes_recebimento_almoxarifado.quantidade_reprovada` → `recebimento_item_id` → `recebimentos_material_itens_almoxarifado.lote_id` (`schema.js:1711-1778`) | `quantidade_bloqueada` (`DECISAO_INSPECAO`, motor `:1752-1779`, sob a trava do material — `inspectionService.js:282`) | um dos três carimbos: `liberacao_nc_em` (NC aceita, `nonConformityService.js:1038`), `devolucao_fornecedor_em` (`:1620`), `sucateamento_em` (`scrapDisposalService.js:461`) |
| **Em terceiros** | o item da remessa: `itens_remessa_terceiro_almoxarifado (quantidade − quantidade_retornada)` com `lote_id` e `enviado_em IS NOT NULL` (`schema.js:2241-2253`) | `quantidade_em_terceiros` (`REMESSA_TERCEIRO`, motor `:1780-1798`) — o **saldo do lote não muda** (`saldoPosterior = saldoAnterior`) | `quantidade_retornada` cobre retorno, perda/consumo e encerramento (`thirdPartyService.js:472`, `:633-640` — "liquidada"), cancelamento (`:692`), e volta na reversão do consumo (`:795`) |

**Achado 1 — a reprovação não muda o status do lote.** `decidirInspecao` não toca `lotes_almoxarifado` (`grep REPROVADO
inspectionService.js` só acha o alerta, `:405`): a peça reprovada fica num lote **ATIVO** e, hoje, o automático pode tirá-la. A 2ª parte
corrige isso também (RN-217.02) — não só a quarentena.

**Achado 2 — terceiros: a peça fora continua no saldo do lote.** `REMESSA_TERCEIRO` só soma `quantidade_em_terceiros`; a linha do lote
não desce. O automático pode tirar do L1 a peça que está no terceiro (RN-217.03).

**Achado 3 — as janelas sem trava produzem soma por lote MAIOR que o total, nunca o contrário que importe.** O carimbo `enviado_em` do
item da remessa (`thirdPartyService.js:263`) e o da NC (`nonConformityService.js:1038`) são gravados **antes** do motor, fora da trava; o
`quantidade_retornada` do retorno (`:472`) também. Numa leitura no meio: (a) envio — o item já conta e o `em_terceiros` ainda não → Σ
terceiros por lote > total (cai na regra da família, B1436: a família inteira volta para o material, como hoje); (b) retorno/NC — a parcela
do lote já caiu e o total ainda não → sobra no "resto do material" (desconto como hoje). Nenhum dos dois faz o automático tirar peça
bloqueada que hoje ele não tiraria.

**Achado 4 — quem mais escolhe lote não passa por estes leitores (fora).** A separação com lote escolhido ("Sai de", `requisitionService.js
:1381-1392` e a aceitação `:1595-1625`) e a entrega pela origem planejada conferem o **saldo físico** do par (lote, endereço) — nem a
inspeção por lote descontam. Escolha **manual** da pessoa; vira **C513** (fora, registrado).

### Quem depende do número de hoje (o que muda de propósito)

- `bloqueioSabeOLote.api.test.js:239-247` — **RN-209.09** afirma `com lote == sem lote` em `loteImpedidoSql`, `saldoDisponivelParaItem` e
  `listarLotesDoMaterial`. Com L1 2 em quarentena e L2 BLOQUEADO 4, passa a dar `lote_impedido` **4** (com) × **2** (sem). Reescrito como
  mudança de regra (RN-217.10), não apagado.
- `bloqueioSabeOLote.api.test.js:249-264` — o cenário C504 (L1 vazio com 2 bloqueados no livro): continua `com == sem` — é o clamp por lote
  (RN-217.05). Fica, com o automático acrescentado.
- `entregaAutomaticaPeloLote.api.test.js:357-376` — **"[C466, limitação documentada]"**: o R2 automático tira do L1 a peça da quarentena
  (`[['SAIDA', null, 'L1', 1]]`). Passa a tirar do **L2** (RN-217.01). Reescrito como mudança de regra.
- A suíte da 205 (`loteImpedido*.api.test.js`) escreve `quantidade_bloqueada`/`em_terceiros` direto por SQL (sem livro, sem inspeção, sem
  remessa) — nenhuma parcela por lote, então os números **não mudam** (o sorteio de 150 materiais inclusive). A da 206 (`entregaLoteImpedido`)
  usa lotes REPROVADO/BLOQUEADO por status, sem bloqueio — não muda. A RN-205.02 h pela rota (quarentena num lote que vence depois) dá 0
  com e sem a etapa (o lote impedido é o próprio lote da quarentena).

### Travas

Só leitura. Os leitores rodam onde já rodavam: a aprovação sob `comTravaDaRequisicao` (por material), a separação e a entrega sob as duas
travas (por requisição → por material), a fila e o detalhe sem trava (como hoje, informação). Os escritores das parcelas: quarentena pelo
motor (sob `naTravaDoMaterial`), reprovação sob `comLockDoMaterial` (`inspectionService.js:282`; o `INSERT` da inspeção vem depois do motor,
dentro da seção), terceiros e carimbos da NC com o claim do documento fora da trava (Achado 3). **Nenhuma trava nova** (B1437).

## Caminhos

- **(escolhido) Um fragmento SQL do "retido do lote", usado pelos dois leitores.** `retidoDoLote.js`: `retidoDoLoteSql(m, l)` = as três
  parcelas, cada família só se a soma dela por lote couber no total do material (B1436), limitado ao físico livre do lote (B1435). O
  `loteImpedidoSql` subtrai o retido do lote impedido e passa a descontar do material só o **resto** (total − Σ retido de todos os lotes);
  `lotesParaOAutomatico` lê o mesmo fragmento por `retidoPorLote(db, m)` (uma consulta) e o tira do livre de cada lote. **Uma régua só** — a
  mesma expressão nos dois. Reverter = os dois leitores deixam de chamar o módulo.
- **(descartado) Calcular as parcelas em JS no automático e em SQL na 205.** Duas implementações da mesma regra (a lição da 205: a fila e o
  modal tinham de bater com a porta). O teste de equivalência (RN-217.09) seria a única cola.
- **(descartado) Gravar o bloqueado por lote numa tabela (ou mudar o status do lote na reprovação).** Segundo escritor da mesma retenção (a
  B1416/B1418 da 209 já descartaram); mudar o status do lote na reprovação travaria a parte **aprovada** do mesmo lote.
- **(descartado) Clamp proporcional entre lotes quando a soma passa do total.** Escolheria um lote arbitrário para "perdoar"; a regra da
  família (tudo ou nada por família, B1436) é previsível e cai, no pior caso, no número de hoje.

## Decisões (letra B — reversíveis; livres depois de **B1433**, conferido por `grep` em `docs` e `specs`: o maior é B1433 (Etapa 210); C a
partir de **C513** (o maior é C512); A a partir de **A114** (o maior é A113))

- **B1434 — o retido do lote é a soma das três parcelas** (quarentena/avulso pelo livro, reprovação pelo documento da inspeção, terceiros
  pelo item da remessa), cada uma `≥ 0` (a quarentena por `MAX(0, …)`: um lote com soma do livro negativa não "devolve" peça a ninguém).
- **B1435 — limite por lote (clamp B1421, 1ª metade):** o retido do lote nunca passa do físico livre dele, `MAX(0, saldo_L − inspeção_L)`.
  O que o limite tira volta para o **resto do material** (o desconto de hoje): no cenário C504 (o livro diz L1 2 com o L1 vazio) o L1 retém
  0 e as 2 continuam descontadas do material, como hoje.
- **B1436 — limite por família (clamp B1421, 2ª metade): tudo ou nada.** Família "bloqueada": a quarentena vale se `Σ_lotes quarentena ≤
  quantidade_bloqueada`; a reprovação vale se `Σ quarentena + Σ reprovação ≤ quantidade_bloqueada` (a quarentena primeiro: o livro é guardado
  pelas M1/M2/M3 da 209, a reprovação pode estar velha — C501: uma liberação avulsa "sem lote" que comeu a parcela da reprovação não carimba
  a inspeção). Família "terceiros": vale se `Σ terceiros por lote ≤ quantidade_em_terceiros`. Família que não cabe → retém 0 em todo lote e o
  total dela volta inteiro para o resto do material (= o número de hoje). Folga `Q.QTD_FOLGA` na comparação. Descartados: clamp proporcional
  (ver "Caminhos"); confiar no documento acima do total (descontaria peça que já saiu).
- **B1437 — sem trava nova** (só leitura, dentro das seções que já existem; Achado 3).
- **B1438 — a conta nova da 205** (reversão do preço declarado da B1370 / D (206)): `lote_impedido = MAX(0, Σ_{L impedido} MAX(0, MAX(0,
  saldo_L − insp_L) − retido_L) − resto − inspeção sem recebimento)`, com `resto = MAX(0, bloqueada + em_terceiros − Σ_{todos os lotes}
  retido_L)`. Sem nenhuma parcela por lote (`retido = 0` em todo lote) é **byte a byte** a conta de hoje. Com a peça bloqueada num lote bom,
  o desconto sobe até o certo; com ela no lote impedido, fica igual.
- **B1439 — o automático desconta o retido no nível do lote**, como a inspeção (não se sabe em que endereço a peça está): sem guarda,
  `saldo − insp − retido`; com guarda, `Σ livre das linhas − insp − retido`. `lotesParaOAutomatico` passa a ser **exportada** (teste).
- **B1440 — sem tela.** A fatia visível é o número (a fila, o modal de separação, o entregável e a entrega), como a B1374 da 205.
  Descartado nesta etapa: o aviso *"⟨n⟩ em quarentena no lote L1"* na janela de entrega — pede rota e tela, não cabe no teto de 5h; fica
  como **C514**.
- **B1441 — a frase da recusa da entrega (206) não muda.** A lista *"Em lote impedido: L2 (bloqueado, 3 un)"* continua mostrando o saldo do
  lote impedido menos a inspeção — é informação ("onde está o que não pode sair"); o retido nele também não pode sair.

### Fora (C novos)

- **C513** — a escolha **manual** do lote ("Sai de" na separação e na entrega com origem planejada) confere o saldo físico do par, sem
  descontar inspeção nem bloqueio por lote (Achado 4): a pessoa pode escolher a peça da quarentena à mão.
- **C514** — o aviso na tela de entrega dizendo quantas peças do lote estão em quarentena/reprovadas/em terceiros (B1440).
- Seguem abertos: C491, C478, C486, C495, C497, C498, C500, C501 (a literal da NC), C502.

### A (rodar em produção, antes do deploy)

- **A114** — medir quantos lotes vão mudar de número (consulta; sem migração):
  `SELECT COUNT(DISTINCT ri.lote_id) FROM inspecoes_recebimento_almoxarifado i JOIN recebimentos_material_itens_almoxarifado ri ON ri.id =
  i.recebimento_item_id WHERE COALESCE(i.quantidade_reprovada,0) > 0 AND ri.lote_id IS NOT NULL AND i.liberacao_nc_em IS NULL AND
  i.devolucao_fornecedor_em IS NULL AND i.sucateamento_em IS NULL;` e `SELECT COUNT(*) FROM itens_remessa_terceiro_almoxarifado WHERE
  lote_id IS NOT NULL AND enviado_em IS NOT NULL AND quantidade - COALESCE(quantidade_retornada,0) > 0;` (a quarentena por lote só existe
  desde a 209 — a A112 confere). Zero nas duas: nenhuma tela muda de número no deploy.

## Regras de negócio

Montagem padrão: material **com** controle de lote, unidade `UN`/`un`, lotes por Entrada v2, validades relativas a hoje (`diaLocal`).

- **RN-217.01 — o automático não tira a peça da quarentena (C503).** L1 (vence em 5 dias) 3 em B01, L2 (45 dias) 3 em P01. R1 de 3 entregue
  pelo automático (sai L1 3); devolução de 1 para **Quarentena** citando a saída (volta para L1 em B01, `BLOQUEIO` com L1). R2 de 1 entregue
  pelo automático → sai do **L2**: livro `[['SAIDA', null, 'L2', 1]]`; L1 fica com 1 (a peça bloqueada), L2 com 2. (a) pela rota (o teste da
  197 reescrito); (b) pelo serviço: `lotesParaOAutomatico` → `[{ L2, 3 }]` (o L1 some: livre 0).
- **RN-217.02 — nem a peça reprovada na inspeção.** L1 (5 dias) 5 com item de recebimento do L1 em inspeção 5; inspeção decide aprovada 3,
  reprovada 2 (`decidirInspecao`, o lote continua ATIVO); L2 (45 dias) 5. `lotesParaOAutomatico` → L1 **3**, L2 5 (hoje L1 5). Depois de um
  dos carimbos (NC aceita — `liberacao_nc_em`; ou `devolucao_fornecedor_em`; ou `sucateamento_em`), a parcela some: (b) com `liberacao_nc_em`
  + o `DESBLOQUEIO` da liberação → L1 5.
- **RN-217.03 — nem a peça que está no terceiro.** L1 (5 dias) 5, L2 (45 dias) 5; remessa com 2 do L1 **enviada** → `lotesParaOAutomatico`
  → L1 **3** (o saldo do lote continua 5); item criado e **não enviado** → L1 5; retorno de 2 → L1 5.
- **RN-217.04 — a aprovação e a separação descontam o certo (reversão do D (206)).** L1 ATIVO: entrada 4, saída 2, devolução das 2 para
  Quarentena (L1 4, 2 bloqueadas nele); L2 BLOQUEADO 6. `saldoDisponivelParaItem`: `disponivel` 8 (igual), `lote_impedido` **6** (hoje 4),
  `disponivel_liberado` **2** (hoje 4). (a) aprovação pela rota de uma requisição de 4 → reserva **2**, `PARCIALMENTE_RESERVADA`; (b) a fila
  e o detalhe mostram separável 2; (c) separar 3 → 400 com a literal da 205 (*"… não é possível separar 3 un. … Não entram 6 un em lote
  bloqueado, reprovado ou vencido."*, o número do impedido é o novo). A peça bloqueada **no lote impedido** (devolução para Quarentena de um
  lote que depois é bloqueado): número igual ao de hoje.
- **RN-217.05 — limite por lote (B1435, C504).** O cenário C504 da 209 (o livro diz L1 2, o L1 vazio, L2 5): `loteImpedidoSql`,
  `saldoDisponivelParaItem` e `lotesParaOAutomatico` iguais com e sem o lote no `BLOQUEIO` (as 2 voltam para o material, como hoje).
- **RN-217.06 — limite por família, bloqueada (B1436).** Reprovação de 3 no L2 (ATIVO) + quarentena de 2 no L1: total 5, os dois lotes
  retêm. Liberação avulsa "sem lote" de 3 (a M1 deixa: a reprovação conta como sem lote) → total 2 < 5: a reprovação **deixa de reter** no
  L2 (vale o livro: L1 continua retendo 2). Controle: a quarentena sozinha acima do total (o livro diz 2, o total 1 por SQL) → nenhum lote
  retém.
- **RN-217.07 — limite por família, terceiros (B1436).** Item enviado de 2 no L1 com `quantidade_em_terceiros` 1 (SQL) → o L1 não retém
  nada de terceiros; com 2 → retém 2.
- **RN-217.08 — sem controle de lote nada muda.** `loteImpedidoSql` = 0 (B1371); o automático não roda (a entrega de material sem controle
  de lote não escolhe lote). E material com controle de lote **sem** nenhuma parcela por lote: os números da 205 e da 197 são os de hoje
  (as suítes da 205/206/207/208 verdes sem edição).
- **RN-217.09 — uma régua só (sorteio).** 120 materiais sorteados (lotes ATIVO/BLOQUEADO/REPROVADO/vencido com saldo; quarentena por lote no
  livro; reprovação por inspeção com e sem carimbo; remessa enviada e não enviada; bloqueada/em terceiros do material às vezes abaixo da soma
  por lote): `loteImpedidoSql` e `lotesParaOAutomatico` iguais a um modelo em JS das B1434-B1438 — e `lote_impedido ≥` o de hoje sempre que as
  famílias cabem.
- **RN-217.10 — a RN-209.09 muda de propósito.** O cenário da RN-209.09 (L1 5 e L2 4 BLOQUEADO; sai 3 de L1; voltam 2 para Quarentena):
  com o lote no `BLOQUEIO`, `lote_impedido` **4** e `disponivel_liberado` **2**, o automático vê L1 **2**; com o `BLOQUEIO` sem lote (o mesmo
  livro com `lote_id` NULL), os números de hoje (2, 4, L1 4). Registrado como mudança de regra.
- **RN-217.11 — a entrega recusa quando só sobra a peça bloqueada e há lote impedido (a conferência da 206 com a régua nova).** L1 ATIVO 2
  todo em quarentena (entrada 2, saída 2, volta 2 para Quarentena) e L2 BLOQUEADO 3; requisição de 1 já com reserva (montada direto, como
  nos testes da 206) → `entregar` 1 → **400** com a literal da 206 (*"… faltam 1 un em lote que pode sair. Em lote impedido: L2 (bloqueado, 3
  un). …"*), nada baixado. Hoje: sai do L1 a peça da quarentena.
- **RN-217.12 — integração (rota e serviço).** (a) **Rota:** Entrada L1 e L2 → requisição R1 aprovada, separada, entregue (L1) → `POST
  /devolucoes` Quarentena → `GET /bloqueado-por-lote` (L1 1) → requisição R2: aprovar (`PUT /aprovar`), fila (`GET /fila-separacao`),
  separar, entregar → livro sai L2. (b) **Serviço:** a mesma montagem por `registrarDevolucao`, `saldoDisponivelParaItem`,
  `lotesParaOAutomatico` e `entregarRequisicao`.

## Contrato (congelado)

### Serviço novo — `server/services/almoxarifado/retidoDoLote.js`

```js
// m = apelido de materiais_almoxarifado (colunas id, quantidade_bloqueada, quantidade_em_terceiros); l = apelido de lotes_almoxarifado.
quarentenaDoLoteSql(m, l)   // MAX(0, bloqueioPorLote.bloqueadoDoLoteSql(`${m}.id`, `${l}.id`))
reprovadoDoLoteSql(l)       // Σ quantidade_reprovada das inspeções de itens de recebimento com lote_id = l.id, sem nenhum dos três carimbos
terceirosDoLoteSql(m, l)    // Σ MAX(0, quantidade − quantidade_retornada) dos itens de remessa do material com lote_id = l.id e enviado_em
retidoDoLoteSql(m, l)       // MIN(bruto, MAX(0, saldo_L − insp_L)), bruto = as parcelas das famílias que cabem (B1434-B1436); entre parênteses
retidoComLoteSql(m)         // Σ retidoDoLoteSql sobre todos os lotes do material; entre parênteses
async retidoPorLote(db, materialId) // -> Map<lote_id, retido> (só > folga) — UMA consulta com retidoDoLoteSql
```

Sem `require` de `stockService` nem de `requisitionService` (só `quantidade`, `db`, `bloqueioPorLote`): o `loteImpedido.js` o importa e o
`requisitionStateMachine` importa o `loteImpedido` (sem ciclo). Apelidos internos únicos (`rdl_*`). Quantidades por `Q.qtdSql`.

### `loteImpedido.js` — `loteImpedidoSql(m, hoje)`

A conta da B1438. Assinatura, apelidos de entrada e `CASE controle_lote` inalterados; `predicadoLoteImpedidoSql` e `fraseLoteImpedido`
inalterados.

### `requisitionService.js` — `lotesParaOAutomatico`

B1439; retorno inalterado (`[{ lote_id, saldo, linhas? }]`, só `saldo > folga`). Exportada.

### Literais

Nenhuma nova. As da 205 (*"Não entram N un em lote bloqueado, reprovado ou vencido."*) e da 206 (`fraseEntregaLoteImpedido`) mudam só de
**número**, onde a regra muda. Nenhuma rota nova, nenhuma coluna, nenhuma migração (sem prova de primeiro boot).

## Tasks

| T | Tipo | O quê | Depende |
|---|---|---|---|
| T0 | tronco | Testes vermelhos: `server/tests/api/bloqueadoDoLote.api.test.js` (RN-217.01 b, .02-.09, .11, .12) + reescrever RN-209.09 (→ RN-217.10) em `bloqueioSabeOLote` e o "[C466, limitação documentada]" (→ RN-217.01 a) em `entregaAutomaticaPeloLote`. Vermelho real (número), não erro de import | — |
| T1 | tronco | `retidoDoLote.js` (contrato) | T0 |
| T2 | tronco | `loteImpedidoSql` com o retido (B1438) | T1 |
| T3 | tronco | `lotesParaOAutomatico` com o retido (B1439) + export | T1 |
| T4 | tronco | integração RN-217.12 pela rota e pelo serviço (no arquivo do T0) + regressão: as suítes 197/205/206/207/208/209 | T2, T3 |

**Sem galhos:** tudo é a mesma regra compartilhada (uma régua para aprovação, separação e automático) — o critério da Fase 3 manda tronco.
Execução em série na árvore principal (sem worktree, nada concorrente para a sabotagem contaminar).

### Controles positivos (um por vez; cópia no scratchpad, `perl`/Edit, restauro por cópia e `cmp`)

1. retido sem a parcela da reprovação → RN-217.02 vermelha.
2. retido sem a parcela de terceiros → RN-217.03 vermelha.
3. retido sem o filtro `enviado_em` → RN-217.03 (item não enviado) vermelha.
4. retido sem os carimbos → RN-217.02 b vermelha.
5. retido sem o limite por lote (B1435) → RN-217.05 vermelha.
6. retido sem a regra da família (B1436) → RN-217.06/.07 vermelhas.
7. `loteImpedidoSql` com o resto antigo (total inteiro, sem descontar o atribuído) → RN-217.04/.10 vermelhas.
8. `lotesParaOAutomatico` sem o retido → RN-217.01/.02/.03/.11 vermelhas.

## Cabe em 4h a 5h?

Análise e plano ~1h (feito). Testes (T0, controles, regressão) ~2h. Código (T1-T3) ~1h: um módulo de SQL, uma conta trocada, duas linhas no
automático. **Cabe**, sem folga para tela (B1440). Corte pré-decidido se a T0 passar de 2h30: o sorteio (RN-217.09) cai para 40 materiais.

## Pontos de atenção

- `materialExpr` **qualificada** sempre (o fix `8ff95f59` da 209): dentro do fragmento, `id` solto é o do livro.
- O fragmento roda por linha nas leituras da fila/detalhe: subconsultas aninhadas, mas só para materiais com `controle_lote = 1` (o `CASE`).
- Os testes da 205 escrevem `quantidade_bloqueada` direto — sem livro: retido 0, conta de hoje (o sorteio da 205 continua valendo).
- Teste de corrida: não há porta nova; nenhum.

## Fase 2 — correções do revisor fresco (2026-11-13) — **MANDAM sobre o texto acima onde divergem**

Revisor fresco sobre `cf346c35`: **0 trava, 3 importantes, 5 menores**. Confirmado contra o código: a remessa não baixa o lote
(`stockService.js:1780-1798`); `quantidade_retornada` cobre retorno, encerramento, cancelamento e a reversão (`thirdPartyService.js:472`,
`:640`, `:692`, `:795`); a reprovação não muda o status do lote; os três carimbos. **Provado:** sem retido, a B1438 é a conta de hoje
(com bloqueada + terceiros ≥ 0); com as famílias cabendo, `novo = hoje + Σ_{lotes bons} retido ≥ hoje`; e `disponível − o que o
automático cobre = lote_impedido` novo — aprovação, separação e entrega leem a mesma régua (nenhum gesto posterior recusa o que o
anterior aceitou, salvo o I1 abaixo).

1. **[IMPORTANTE] B1439 com parte guardada:** o retido sai do livre do **lote** (`Σ livre das linhas − insp − retido`), **não** do livre
   usável por endereço — senão, com a peça da quarentena numa linha que o automático já não usa (endereço bloqueado), descontava duas
   vezes (L1 0 em vez de 1) e, com lote impedido, a conferência da 206 recusava o que a aprovação reservou. **RN-217.13** (a: guarda no
   mesmo endereço; b: a peça numa linha bloqueada). O código já fazia assim (o retido soma à inspeção, que só entra no livre do lote).
2. **[IMPORTANTE] Reserva feita antes do deploy cobrindo a peça bloqueada.** A separação mantém a parte própria (B1372 da 205), mas a
   entrega recusa (a 206) quando o automático não cobre e há lote impedido — o mesmo caminho da RN-205.10 → RN-206.06 (lote bloqueado
   depois da aprovação). Registrado como **C515** com o que fazer (liberar o lote, ou entregar a menos); a **A114** ganha a consulta das
   reservas ativas de material com retido por lote.
3. **[IMPORTANTE] Custo da consulta.** Sem índice em `inspecoes_recebimento_almoxarifado(recebimento_item_id)` e em
   `itens_remessa_terceiro_almoxarifado(lote_id)`, o fragmento varria a tabela (ou montava índice automático) por lote. **Dois
   `CREATE INDEX IF NOT EXISTS`** em `schema.js` (precedente: o `idx_receb_itens_almox_lote` da 205, B1380) — não é migração de dado.
   Medido (100 materiais): 20 lotes por material → 80 ms; 50 lotes → 500 ms (a leitura cresce com lotes²; 50 lotes ativos num material
   é raro) — **D (217)**.
4. **[MENOR] "byte a byte"** só com bloqueada + terceiros ≥ 0 (B1438 corrigida no código e aqui).
5. **[MENOR] Material com saldo negativo permitido** e sem lote impedido: o que o lote retém deixa de ser tirado dele e vai para a linha
   "Sem lote atribuído" negativa (antes saía a peça da quarentena do L1). É o comportamento da 197 para o que os lotes não cobrem;
   registrado em **D (217)**.
6. **[MENOR] Achado 3 tem mais uma janela:** encerrar/cancelar a remessa rodam o motor antes de gravar `quantidade_retornada`; no meio,
   o item ainda retém no lote o que já não está lá (desconto a mais por um instante — recusa segura, nunca peça bloqueada saindo).
7. **[MENOR] A soma da família é das PARCELAS** (`Σ MAX(0, livro do lote)`), nunca a líquida `bloqueadoComLoteSql` — **o sorteio
   RN-217.09 pegou isso de verdade** (lote com livro −1 abatia o de outro; o retido total passava do total e o impedido caía abaixo do
   de hoje). Corrigido.
8. **[MENOR]** RN-217.10: `listarLotesDoMaterial` **não** muda (alimenta o "Sai de", C513); o número do automático vem de
   `lotesParaOAutomatico` — o teste reescrito confere os dois.

### Divergência do contrato (registrada): o fragmento virou tabela derivada

A 1ª versão (`retidoDoLoteSql(m, l)` por lote + `retidoComLoteSql(m)` = Σ dela, com as somas das famílias por subconsulta dentro de cada
lote) **estourou a pilha do analisador do SQLite** (`SQLITE_ERROR: parser stack overflow`) nas leituras da fila, do detalhe e da entrega
(20 testes da 197 em 500). Contrato novo de `retidoDoLote.js`: **`lotesComRetidoSql(m, colunas)`** — uma tabela derivada com uma linha
por lote do material (`lote_id`, `fis`, `quar`, `repr`, `terc`, `ret` e as colunas extras pedidas), as famílias por `SUM(...) OVER ()`
sobre as mesmas linhas; `retidoPorLote(db, id)` lê a mesma tabela (`json_group_array`); as parcelas (`quarentenaDoLoteSql`,
`reprovadoDoLoteSql`, `terceirosDoLoteSql`, `fisicoLivreDoLoteSql`) continuam exportadas. `loteImpedidoSql` agrega a tabela com a coluna
`imp` (o predicado da 205) numa passada só. A régua é a mesma; o texto SQL é que mudou.

## Fase 5 — revisão adversarial (3 revisores frescos: regra, travas/fluxos, "o teste passaria com a feature quebrada?")

1. **[ALTO, defeito real, reproduzido] O envio da remessa caía no meio da entrega.** `enviarRemessa` gravava o `enviado_em` do item
   **fora** da trava do material e só depois chamava o motor. Desde a 217 o item enviado retém no lote dele; com folga na família (uma
   remessa sem lote já fora), o claim entrava entre a conferência da 206 e a baixa da entrega: a conferência aceitou 10 (L1 5 + L2 5), a
   baixa viu L1 3 e mandou 2 **sem lote** — *"Sem lote atribuído"* **−2** (script do revisor; regressão da 217: antes o automático
   ignorava terceiros). **Conserto (B1442):** o claim, o motor e a compensação do item numa seção só, `naTravaDoMaterial(item.material_id)`
   (o motor já roda sob ela — aninha; molde Etapas 97/121; regra do CLAUDE.md: porta que muda o que outra lê para entregar pega a trava).
   Descartado: ler o retido uma vez por entrega e reusar na baixa (fechava este caso mas deixava a porta fora da trava, contra a regra).
   Teste **RN-217.14** (gancho só sinaliza; o envio disparado do contexto do teste): o claim espera; a entrega sai L1 5 + L2 5; nenhuma
   linha negativa. Controle: sem a trava → vermelho pela asserção do claim (`enviado_em` gravado no meio).
2. **[BAIXO, registrado] Reprovação velha volta a reter** (C501 ampliado → **C516**): liberar pelo **Desbloquear** "sem lote" o que é da
   reprovação não carimba a inspeção; um bloqueio avulso **depois** faz a família caber de novo e o lote volta a reter — desconto a mais
   (recusa segura). O caminho certo é a não conformidade.
3. **[BAIXO, registrado em D (217)]** os carimbos de devolução ao fornecedor e sucateamento são gravados antes do motor, fora da trava:
   na janela a parcela some e o automático pode tirar a peça reprovada — **não** é regressão (antes da 217 sempre podia).
4. **[Teste] Regras cobertas só pelo sorteio** (o modelo reescreve a regra em JS): ordem das famílias, limite pelo físico **livre**,
   `MAX(0, …)` do lote com livro negativo e a **folga** (sobrevivia: todos os cenários eram inteiros). Quatro cenários determinísticos
   novos — **RN-217.06 b**, **RN-217.05 b**, **[B1434]** (com um lote impedido, para o número aparecer) e **[B1436] frações**
   (0,1 + 0,2 = 0.30000000000000004). Controles (10)-(13) abaixo, cada um derrubando o seu.
5. **[Teste] O detalhe** (RN-217.11 b): `lote_impedido` 3 e entregável 0. O teto pelo automático (`tetoDaEntregaPeloLote`) dá o mesmo
   número **por construção** (disponível − o que o automático cobre = `lote_impedido`, provado na Fase 2) — não é observável à parte.

Sem achado: deadlock/reentrância (só leitura; o envio aninha), duplo desconto (a reprovação não grava `BLOQUEIO`), material sem lotes,
lote com saldo negativo, frações (`MAX(0, fis − ret)` absorve o arredondamento).

### Controles positivos executados (script `e217-sabotagem.js` no scratchpad: cópia, âncora = 1, restauro por cópia, md5 igual)

| # | Sabotagem | Caiu |
|---|---|---|
| 1 | reprovação zerada | RN-217.02, .02 b, .06, sorteio |
| 2 | terceiros zerado | RN-217.03, .07, sorteio |
| 3 | sem o filtro `enviado_em` | RN-217.03 (o 2º item não enviado — asserção acrescentada; antes só o sorteio), sorteio |
| 4 | sem os carimbos | RN-217.02 b (`devolucao_fornecedor_em`), sorteio |
| 5 | sem o limite por lote | RN-217.05 (C504 com L3), sorteio |
| 6 | famílias sempre cabem | RN-217.06, .07, sorteio |
| 7 | `loteImpedidoSql` sem descontar o atribuído do resto | RN-217.04, .04 a-c, .04 d, .10, [B1434], .11 b, sorteio |
| 8 | automático sem o retido | 15 do arquivo novo + RN-217.01 a (197) |
| 9 | retido também no livre por endereço | RN-217.13 b |
| 10 | reprovação conferida sem a quarentena | RN-217.06 b, sorteio |
| 11 | limite pelo saldo cru (sem a inspeção) | RN-217.05 b, sorteio |
| 12 | sem `MAX(0, …)` da quarentena | [B1434], sorteio |
| 13 | sem a folga | [B1436] frações |
| 14 | envio sem a trava | RN-217.14 |

## Execução

- [x] Fase 0 + Fase 1 — este plano — `cf346c35`.
- [x] Fase 2 — revisor fresco: 0 trava, 3 importantes, 5 menores, todos aceitos (bloco "Fase 2 — correções").
- [x] T0 — testes vermelhos (`bloqueadoDoLote.api.test.js` 12/15 vermelhos por número; RN-209.09 → RN-217.10 e o "[C466, limitação
  documentada]" da 197 → RN-217.01 a, vermelhos pelo número) — no commit do código `e2a43f20` (sem commit de teste vermelho: o `test:api` não
  fica vermelho na `main`).
- [x] T1 — `retidoDoLote.js` — `e2a43f20` (**divergência:** o contrato virou tabela derivada — *parser stack overflow*, ver acima).
- [x] T2 — `loteImpedidoSql` (B1438) — `e2a43f20`. O EXPLAIN da 205 reescrito (aceita o SCAN da tabela derivada; índices novos).
- [x] T3 — `lotesParaOAutomatico` + export (B1439) — `e2a43f20`.
- [x] T4 — integração RN-217.12 pela rota e pelo serviço — `e2a43f20`; regressão 197/205/206/207/208/209 verde (vizinhas rodadas uma a uma e
  depois na suíte inteira).
- [x] Fase 5 — 3 revisores; 1 defeito real (o envio de remessa no meio da entrega, B1442) e 5 lacunas de teste, todos corrigidos — `cad6da56` (trava; testes em `e2a43f20`).
- [x] Fechamento (`fechar-etapa`) — novidades, specs 10 e 05, mapa, guia, manual, este plano, a estimativa.
- Verificação final (medida, sobre a árvore de `e2a43f20`, serial): `test:api` **611/611 arquivos OK**; `test:almoxarifado` **44 passou, 0
  falhou**; validation **4/0**, safealter **3/0**, sqlite **16/0**; cliente **223/223 suítes, 2999/2999 testes**; `build` **Compiled
  successfully**. `bloqueadoDoLote` **23/23**. (Uma 1ª rodada do `test:api` foi interrompida: as sabotagens da Fase 5 rodaram por cima dela —
  a memória "sabotagem concorrente contamina a suíte"; refeita do zero depois do último conserto.)

### Divergências do plano

- **Contrato de `retidoDoLote.js`:** `retidoDoLoteSql`/`retidoComLoteSql` → `lotesComRetidoSql` (tabela derivada) — *parser stack overflow*.
- **A soma da família:** o plano dizia "a soma crua do livro" (`bloqueadoComLoteSql`); estava errado — o sorteio pegou (Fase 2 M7).
- **Índices novos** (o plano dizia "nenhuma coluna, nenhuma migração"): dois `CREATE INDEX IF NOT EXISTS`, sem dado novo.
- **`thirdPartyService.enviarRemessa`** ganhou a trava (Fase 5, B1442) — o plano afirmava "nenhuma trava nova" (B1437): continua sem trava
  **nova**, mas uma porta que não pegava passou a pegar a que existe.
- **RN-217.13 e .14** não existiam no plano (Fase 2 I1 e Fase 5).
- **A estimativa:** a fatia visível prevista ("⟨n⟩ em quarentena no lote L1") não entrou (B1440, C514).

### Retro (4 números)

- **Rodadas até verde na Fase 5:** 1.
- **Achados reais:** Fase 2: 3 importantes + 5 menores (1 deles — a soma da família — confirmado pelo sorteio). Fase 5: **1 defeito real**
  (ALTO, o envio de remessa no meio da entrega, reproduzido) + 5 lacunas de teste (folga sobrevivia, três regras só no sorteio, o detalhe);
  2 BAIXOS registrados sem código (C516, D (217)). **0 ruído.**
- **Paralelismo:** nenhum galho (tudo tronco); 3 revisores em paralelo na Fase 5.
- **Defeito que escapou da 209:** nenhum conhecido.

## Próxima tarefa detalhada

*(Escolhida pela ordem do CLAUDE.md: o 2º pacote da estimativa de 05/11 acabou com esta etapa; o que esta etapa nomeou como "falta" é o
**C513**. Ainda **sem estimativa** — começa pela Fase 0.5.)*

**O "Sai de" (escolha manual do lote) também deixa de fora a peça bloqueada (C513).**

- **Onde:** `requisitionService.checarOrigemItem` (`server/services/almoxarifado/requisitionService.js` ~`:1354-1400`, a separação e a
  entrega com origem/lote escolhidos) confere `SUM(estoque_saldo)` do par (lote, endereço) menos o já pedido e a parte guardada de outras
  (`mensagemSeparadoDeOutras`); a aceitação da separação (~`:1595-1625`, `regua.saldoOrigem`) idem. Nenhuma das duas desconta a inspeção do lote
  nem o retido.
- **O que está pronto e não reabre:** `retidoDoLote.retidoPorLote(db, materialId)` → `Map<lote_id, retido>` (o retido já limitado ao físico
  livre do lote e com as regras de família); a mesma régua do automático e da 205 (`lotesComRetidoSql`).
- **A decisão a tomar (letra B):** o retido é do **lote**, não do endereço. Proposta reversível: com lote escolhido, além do par, conferir o
  lote inteiro — `saldo do lote − inspeção do lote − retido do lote − o já pedido nesse lote ≥ q` — e recusar com literal nova que nomeie a
  peça bloqueada (ex.: *"Lote L1: só ⟨n⟩ un podem sair — ⟨r⟩ estão bloqueadas nele (quarentena, reprovação ou terceiro)"*). Sem lote
  escolhido (só endereço), nada muda.
- **Pontos de atenção:** a separação e a entrega rodam sob as duas travas (requisição → material) — a leitura entra nelas, sem trava nova;
  a entrega com origem planejada (`origemGuardada`/`saiDaOrigem`) não pode passar a recusar a origem que a separação aceitou antes do deploy
  (o "gesto posterior que recusa o anterior" — decidir se a planejada vale como está ou recusa com "não serve mais"); o `GET` do detalhe e a
  janela de entrega leem o mesmo saldo do par (`consultarSaldosPorLocalizacao`, C469) — mostrar o livre do lote ali é a fatia visível.
- **Vizinhos baratos que seguem abertos:** C514 (o aviso na tela), C515, C516, C491, C478, C486, C495, C497, C498, C500.
