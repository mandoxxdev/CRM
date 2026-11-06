# Etapa 205 — lote impedido não conta na aprovação e na separação (C464, 1ª parte)

> partida: "Próxima tarefa detalhada" de `docs/superpowers/plans/2026-11-06-almoxarifado-etapa204-devolucao-acha-entregas-antigas.md`
> (`:274` em diante), conferida contra o código em `73d87280` — bate, com **três achados a mais** (abaixo: a fila e o detalhe também
> calculam o separável; o lote sem certificado de material crítico está retido duas vezes; a chegada da nota também reserva lote bloqueado).
> Item 6 do 2º pacote (`docs/estimativas/2026-11/estimativa_2026-11-05_almoxarifado-proximas-2.txt:24-26`, **4h30 a 5h**, estimativa já
> commitada). Mexe em saldo lido para **reservar** — tronco, sob as travas que as portas já seguram. Sem front (B1374).

## Objetivo (em linguagem simples)

Quando um lote é bloqueado, reprovado ou vence, o material dele continua na prateleira e o sistema continua contando esse saldo como
"disponível". Resultado: a **aprovação** reserva para a requisição um material que não pode sair, e a **separação** deixa separar esse
material. A pessoa só descobre na entrega. Depois desta etapa, em material com controle de lote, a aprovação e a separação **descontam** o
saldo dos lotes que não podem sair: a requisição fica *Parcialmente reservada* ou *Aguardando estoque*, a fila de separação mostra só o que dá
para separar, e a separação recusa dizendo quanto ficou de fora por estar em lote impedido.

**Fronteira:** a **entrega** não muda nesta etapa (item 7, outra etapa). As telas de saldo (Materiais, Estoque, relatórios) também não.

## Fase 0 — medido em 2026-11-06 (sobre `73d87280`)

### A conta de hoje

- `availabilitySql.disponivelSql` (`server/services/almoxarifado/availabilitySql.js:55-59`) = `quantidade_atual` − reservado − bloqueado −
  em inspeção − em terceiros (`COLUNAS_RETENCAO`, `:34-39`). **O status do lote não entra.** Lote: `lotes_almoxarifado.status` ∈
  `STATUS_LOTE = ['ATIVO','BLOQUEADO','REPROVADO']` (`lotService.js:23`) — **não existe status "em inspeção" de lote**; vencido não é status,
  é `data_validade < hoje de Brasília` (`lotService.isVencido`, `:160-164`; `schema.js:1509`), destravado por `vencimento_liberado_em`
  (`vencimentoLiberado`, `:356-358`).
- A régua "lote que pode sair": `listarLotesDoMaterial` (`lotService.js:524-559`), `elegivel = status === 'ATIVO' && (!vencido || liberado)`
  (`:541`), a mesma ordem do motor (`stockService.js:1547-1584`). Saldo do lote = `SUM(estoque_saldo_almoxarifado.quantidade)` do lote
  (`:526-528`). Já a usam: o automático FEFO da 197 (`requisitionService.js:1846-1848`, `lotesParaOAutomatico`, que também desconta o **em
  inspeção do lote** por `recebimentos_material_itens_almoxarifado.quantidade_em_inspecao` — `:1849-1861`), a sugestão de coleta da 188
  (`sugestaoDeColeta.js:99-103`) e a separação com lote escolhido (`requisitionService.js:1297-1307`, literais do motor).

### Quem lê o disponível para aprovar e separar (quatro leituras, não duas)

1. **`saldoDisponivelParaItem`** (`requisitionService.js:486-520`): `disponivelSql('ma')` + reserva do item + caixas + retenções. Chamadores:
   aprovação `:672` e `:690` (dentro de `reservarItensAprovacao`, `:625`; conversão da OS na condição `:684`; `aReservar` em `:704`);
   separação `:1485` (teto em `:1487`, literal da recusa em `:1505-1507`); entrega `:2138` (só `permite_negativo`), `:2170` e `:2226`
   (usam `disponivel_material` e `tetoDaLeitura` `:270-273`, que lê `saldo.disponivel`).
2. **`calcularStatusPosAprovacao`** (`requisitionStateMachine.js:274-316`; `disponivelSql` em `:277`, decisão em `:282`) — chamada por
   `prepararPosAprovacao` (`requisitionService.js:785-791`, as três portas) **e** por `reservaChegadaService.recalcularStatusDeReserva`
   (`:145`, fora da trava, só status).
3. **Fila de separação** — `listarFilaSeparacao` (`requisitionService.js:1037`): `saldo_disponivel` em `:1052`, teto em `:1094`,
   `dividirSeparavel` em `:1090`, etapa `AGUARDANDO_SALDO` em `:1123`. Rota `GET /api/almoxarifado/fila-separacao` (`routes/almoxarifado.js:4661`).
   Também alimenta o detalhe por requisição (`requisitionService.js:1188`).
4. **Detalhe da requisição** — `GET /api/almoxarifado/requisicoes/:id` (`routes/almoxarifado.js:3951`; SQL `:3965-3995`, `saldo_atual` com
   `disponivelSql`) → `normalizarItem` (`requisitionService.js:276-334`; teto `:297-299`, `saldo_separavel`/`quantidade_separavel` `:331-332`;
   o **mesmo** `teto` alimenta `saldo_entregavel` da segunda rodada `:318-320`). O modal pré-preenche com `saldo_separavel`
   (`client/src/components/almoxarifado/RequisicoesList.js:56-64`).

**Achado 1 (o brief não tinha):** as leituras 3 e 4 também calculam o separável. Mudar só a porta faria a fila dizer *Separar 10* e o modal
pré-preencher 10 para a porta recusar — o gesto posterior recusando o anterior. Entram as quatro.

### As portas e as travas

- Aprovação: `PUT /requisicoes/:id/aprovar` (`routes/almoxarifado.js:4275`, `prepararPosAprovacao` em `:4337`), `PUT /requisicoes/:id/aprovar-valor`
  (`:4441`, em `:4483`, `recusarInativo: false`) e a automática (`POST /requisicoes` `:4129` e `POST /requisicoes/:id/enviar` `:4172`, em `:4083`).
  As três seguram `comTravaDaRequisicao` (`requisitionService.js:806-830`, trava **por material**) em volta de `prepararPosAprovacao` e do
  `UPDATE`; `reservarItensAprovacao` confere `materiaisForaDaSecao` (`:628-631`).
- Separação: `PUT /requisicoes/:id/separar` (`routes/almoxarifado.js:4678`), sob a trava por requisição e, por dentro, `comTravaDaRequisicao`
  (CLAUDE.md, Etapa 95). A leitura nova roda **dentro** das seções que já existem — nenhuma porta nova.
- Quem muda o status do lote (`lotService.mudarStatusLote` `:289-314`, `liberarVencimento` `:367`, liberação por certificado `:316-345`)
  **não** pega trava e **não** distribui.

### Achado 2 — o mesmo saldo retido duas vezes

O recebimento de material **sem certificado** cria o lote `BLOQUEADO` (`receiptService.js:1773`) e, se o material é crítico, o mesmo `qtd` vai
para `QUARENTENA` → `quantidade_em_inspecao` do material (`:1932-1946`, `stockService.js:1696-1701`). A reprovação da inspeção passa o retido
para `quantidade_bloqueada` **sem lote** (`stockService.js:1702-1722`). Descontar o saldo bruto do lote impedido **por cima** do
`disponivelSql` tiraria duas vezes: lote L1 ATIVO 10 + L2 sem certificado 10 em inspeção → disponível hoje 10 (certo), bruto daria 0. A
conta tem de abater o que já está retido (B1370).

### Achado 3 — a chegada da nota também reserva lote bloqueado (fora)

`reservaChegadaService.reservarChegadaParaQuemEspera` (`:205-245`) conta como livre o item da nota que não ficou em inspeção — inclusive o que
entrou em lote `BLOQUEADO` por falta de certificado — e reserva para quem espera. Não é aprovação nem separação: **C478**, fora.

### Quem depende do contrato de hoje

- A literal da separação (`requisitionService.js:1505-1507`) é conferida por regex em 6 arquivos (`grep -rln "não é possível separar"
  server/tests/api`), p.ex. `ajusteEnderecoCaixa.api.test.js:182` (`/Máximo: 2 /`). O sufixo novo só aparece com lote impedido (nenhum
  desses tem) e vem **depois** do parêntese — as regex continuam casando.
- Molde de testes com lote: `server/tests/api/entregaAutomaticaPeloLote.api.test.js` (validades **relativas** a hoje por `diaLocal`, helpers
  `material`/`entrar`/`loteId`/`validade` `:83-95`, usuários por header).

## Decisões (letra B — reversíveis; livres depois de B1367, conferido: o maior hoje é B1367; C a partir de C478, o maior hoje é C477)

- **B1368 — o caminho: dois campos novos, nada muda de nome.** `saldoDisponivelParaItem` passa a devolver também `lote_impedido` (o desconto,
  B1370) e `disponivel_liberado` (= `disponivel − lote_impedido`); **`disponivel` e `disponivel_material` ficam byte a byte**. A aprovação e a
  separação passam a ler `disponivel_liberado`; a entrega continua lendo os de sempre. As leituras 2, 3 e 4 ganham o mesmo fragmento SQL.
  **Descartados:** (a) mudar `disponivelSql` — 36 pontos em 21 arquivos, todas as telas de saldo, o motor e a entrega de uma vez; (b) mudar o
  `disponivel` da função — atinge a entrega (`tetoDaLeitura`, `:270`), antecipando o item 7 sem a mensagem que nomeia o lote: a segunda rodada
  passaria a recusar sem dizer por quê; (c) parâmetro opt-in na função — dois formatos de retorno para o mesmo nome.
- **B1369 — "impedido" é o contrário de `elegivel`:** `status <> 'ATIVO'` (BLOQUEADO, REPROVADO), **ou** vencido (`substr(data_validade,1,10) <
  hoje de Brasília`) **sem** `vencimento_liberado_em`. Vencido **com** liberação conta como disponível (é para isso que a liberação existe,
  B1322). **Lote em inspeção:** não há status de lote para isso; o retido em inspeção já é retenção do material (`quantidade_em_inspecao`) e já sai
  do `disponivelSql` — nada a acrescentar (só não pode ser descontado de novo, B1370). Quarentena sem lote é a **C466**, fora.
- **B1370 — a conta, sem tirar duas vezes:** `lote_impedido = max(0, Σ_{lotes impedidos do material} max(0, saldo do lote − em inspeção no lote)
  − quantidade_bloqueada do material)`, arredondado a 1e-6. O "em inspeção no lote" é a régua da 197 (`recebimentos_material_itens_almoxarifado
  .quantidade_em_inspecao` por `lote_id`). A bloqueada do material (quarentena, reprovação de inspeção) não sabe o lote: a conta assume que ela
  está **dentro** do lote impedido — nunca desconta mais do que o certo. **Preço declarado:** quando a bloqueada é de peça num lote que pode sair,
  o desconto fica menor que o real (no pior caso, igual ao de hoje — nunca pior). Exato só com o lote da peça bloqueada (**C466**, itens 8/9).
  **Descartados:** o saldo bruto (Achado 2: zera a aprovação do lote bom de material crítico sem certificado); abater também `em_terceiros`
  (não está no prédio, não está em lote nenhum).
- **B1371 — só material com controle de lote** (`materiais_almoxarifado.controle_lote = 1`), o gatilho da 197 (B1321). Material sem controle com
  lote legado bloqueado: nada muda — a entrega dele não escolhe lote.
- **B1372 — a reserva que já existe não é revogada.** Requisição aprovada antes da etapa (ou antes de o lote ser bloqueado) mantém a reserva
  ATIVA; a reaprovação idempotente (Etapa 73) não mexe nela; o teto da separação mantém a parte própria (`max(0, r − c)`, `tetoSeparacao`
  `:375-378`) e só o livre (a parte dividida) desconta. Bloquear um lote não solta reserva de ninguém. **Descartado:** soltar a reserva coberta só
  por lote impedido — é gesto de outra porta (mudar status do lote), que não pega trava nem conhece requisição.
- **B1373 — mensagens.** A aprovação **não recusa** por falta de saldo (aprova com status): o aviso é o status de hoje — *Parcialmente
  reservada* (com o aviso que `RequisicoesList` já mostra) ou *Aguardando estoque*/*Aguardando compra*. Nenhuma frase nova. A **separação** ganha
  um sufixo literal, só quando `lote_impedido > 0` (contrato abaixo). **Descartado:** aviso novo no modal/fila — pede tela; fora do tempo.
- **B1374 — sem front; a fatia visível é o número.** A fila e o modal já leem o separável do servidor (`saldo_separavel`, `separavel`): com a
  conta nova eles mostram o número certo e a etapa *Aguardando saldo* aparece sozinha. `disponivel` (fila), `saldo_atual` (detalhe) e os
  entregáveis ficam como hoje.
- **B1375 — sem trava nova.** A leitura do lote roda dentro das seções que as três portas de aprovação e a separação já seguram. Mudar o status
  do lote, liberar vencimento ou anexar certificado **não** pegam a trava: bloquear só diminui o livre (no pior caso a aprovação concorrente
  reserva o que acabou de ser bloqueado — o mesmo estado de bloquear logo depois, B1372); desbloquear aumenta o livre sem distribuir (B441).
- **B1376 — "hoje" lido na hora, por `diaLocal.hojeLocalISO()`** (`server/services/diaLocal.js:21`), embutido no SQL como literal **validada**
  (`/^\d{4}-\d{2}-\d{2}$/`, senão lança). **Descartado:** parâmetro `?` — as quatro consultas têm arrays de parâmetros diferentes e a ordem é
  frágil (o detalhe usa `db.all` com `?` posicionais).
- **B1377 — o recálculo da chegada herda a conta.** `recalcularStatusDeReserva` (`reservaChegadaService.js:145`) usa
  `calcularStatusPosAprovacao`: requisição sem hold cujo único saldo está em lote impedido não vai para *Aprovado*. Aceito (é o mesmo rótulo
  certo da aprovação). Sem teste próprio; coberto pela unidade de `calcularStatusPosAprovacao` (RN-205.04).
- **B1378 — corte se estourar 5h:** o sufixo da mensagem da separação (RN-205.08 b) sai e vira **C482**; a conta (RN-205.01 a .07, .09) fica.

### Fora (C novos)

- **C478** — a distribuição da chegada da nota (`reservaChegadaService.js:205-245`) reserva o que entrou em lote `BLOQUEADO` sem certificado
  (material não crítico: não fica em inspeção, conta como livre).
- **C479** — a reserva manual (tela Reservas, `stockService.criarReserva`) conta o saldo de lote impedido.
- **C480** — liberar o lote (certificado, `ATIVO`, liberar vencimento) não recalcula o status nem distribui: a requisição fica *Aguardando estoque*
  sem reserva até alguém separar (a separação aceita *Aguardando estoque*, `PODE_SEPARAR`, `requisitionStateMachine.js:98`).
- **C481** — as telas de saldo (as 36 leituras de `disponivelSql`) continuam mostrando como disponível o saldo de lote impedido. Informação, não
  gesto; vai à **D (205)**.

## Regras de negócio

Montagem padrão: material **com** controle de lote, não crítico, unidade `un`; lotes por Entrada v2; status do lote por `mudarStatusLote`;
validade **relativa** a hoje (`diaLocal`), nunca data fixa.

- **RN-205.01 — a régua do impedido é a de `elegivel`.** Material com oito lotes, cada um com saldo: ATIVO sem validade; ATIVO vence hoje;
  ATIVO venceu ontem; ATIVO venceu ontem **com** vencimento liberado; BLOQUEADO; REPROVADO; BLOQUEADO vencido com liberação; ATIVO vence amanhã.
  Para cada lote, "entra no desconto" (o predicado SQL do fragmento) == `!elegivel` de `listarLotesDoMaterial` — os oito, comparados lote a lote.
  (Impedidos: venceu ontem sem liberação, BLOQUEADO, REPROVADO, BLOQUEADO vencido liberado.)
- **RN-205.02 — a conta do desconto** (pelo serviço, `saldoDisponivelParaItem` do item de uma requisição qualquer do material):
  - (a) L1 ATIVO 4, L2 BLOQUEADO 6 → `lote_impedido` 6, `disponivel_liberado` 4, `disponivel` 10 (igual a hoje);
  - (b) L2 BLOQUEADO 6 inteiro em inspeção (recebimento com 6 retidos no item do L2; `quantidade_em_inspecao` do material 6) → `lote_impedido` 0,
    `disponivel` 4 (já sem os 6);
  - (c) L2 REPROVADO 6, `quantidade_bloqueada` do material 2 → `lote_impedido` 4;
  - (d) L2 BLOQUEADO com saldo −1 (linha negativa legada por SQL) e L3 BLOQUEADO 3 → `lote_impedido` 3 (o negativo não abate);
  - (e) o mesmo de (a) com `controle_lote = 0` → `lote_impedido` 0, `disponivel_liberado` = `disponivel` = 10;
  - (f) frações: L2 BLOQUEADO 0,3 com bloqueada 0,1 → 0,2 (não `0.19999999999999998`).
- **RN-205.03 — a aprovação reserva só o que pode sair, pelas três portas.** L1 ATIVO 4, L2 BLOQUEADO 6, requisição de 10:
  `PUT /aprovar` → 200, uma reserva ATIVA de **4**, status `PARCIALMENTE_RESERVADA`. O mesmo pela aprovação automática (`POST /requisicoes`
  com a regra de auto-aprovação) e por `PUT /aprovar-valor` (requisição acima do limite). Controle positivo: sem o desconto (sabotagem
  T1), a reserva volta a 10 e o status a `TOTALMENTE_RESERVADA`.
- **RN-205.04 — só lote impedido: não fica "Aprovado".** Só L2 BLOQUEADO 6, requisição de 3, sem solicitação de compra → 200, nenhuma reserva,
  status `AGUARDANDO_ESTOQUE` (hoje sai `APROVADO` sem reserva). Com solicitação de compra a caminho → `AGUARDANDO_COMPRA`. Pela unidade:
  `calcularStatusPosAprovacao` devolve `AGUARDANDO_ESTOQUE` no mesmo banco.
- **RN-205.05 — vencido conta como impedido; liberado volta a contar.** Só L1 ATIVO 5 vencido ontem → aprovação de 5 sem reserva,
  `AGUARDANDO_ESTOQUE`. `PUT /lotes/:id/liberar-vencimento` com justificativa → nova requisição de 5 reserva 5, `TOTALMENTE_RESERVADA`.
- **RN-205.06 — sem controle de lote nada muda.** Montagem de RN-205.03 com `controle_lote = 0` → reserva 10, `TOTALMENTE_RESERVADA` (igual
  hoje).
- **RN-205.07 — a reserva que já existe fica.** L1 ATIVO 10, requisição R1 de 6 aprovada (reserva 6); depois L1 → BLOQUEADO. A reserva de R1
  continua ATIVA 6; `prepararPosAprovacao` de novo em R1 (idempotente) não cria nem solta nada; o separável de R1 (porta, fila e detalhe) é **6**
  (a parte própria); uma R2 de 4 aprovada agora não reserva nada (`AGUARDANDO_ESTOQUE`).
- **RN-205.08 — a separação limita pelo que pode sair.** L1 ATIVO 4, L2 BLOQUEADO 6, requisição R de 5 em `AGUARDANDO_ESTOQUE` sem reserva
  (aprovada com estoque 0, os lotes entraram depois por Entrada v2, que não distribui):
  - (a) `PUT /separar` com 4 → 200; com 5 → 400;
  - (b) a literal do 400: `<nome>: não é possível separar 5 un. Máximo: 4 (pendente: 5, disponível: 4). Não entram 6 un em lote bloqueado,
    reprovado ou vencido.` — sem lote impedido, a literal é **a de hoje**, byte a byte (sem a segunda frase).
- **RN-205.09 — a fila e o detalhe batem com a porta.** Montagem de RN-205.08: `GET /fila-separacao` → `separavel` 4 no item, etapa `SEPARAR`;
  `GET /requisicoes/:id` → `saldo_separavel` 4 e `quantidade_separavel` 4. `disponivel` (fila) e `saldo_atual` (detalhe) continuam **10**
  (B1374). Só L2 BLOQUEADO 6: `separavel` 0 e a etapa `AGUARDANDO_SALDO`.
- **RN-205.10 — a entrega não muda (fronteira com o item 7).** R1 de RN-205.07 (reserva 6, L1 bloqueado depois, nada separado; material não
  crítico): a prévia e a gravação da entrega de 6 dão o mesmo resultado de hoje — 200, e a parte que nenhum lote elegível cobre sai sem lote
  (B1323, *"Sem lote atribuído"* −6). `saldo_entregavel` do detalhe igual ao calculado com o `teto` de hoje. É o defeito que o item 7 conserta —
  o teste o **fixa** para o item 7 encontrá-lo vermelho de propósito.

## Contrato (congelado)

### Fragmento SQL — `server/services/almoxarifado/loteImpedido.js` (novo; molde `devolucaoViva.js`: uma régua só, sem `require` do app)

```js
// requires: ./quantidade (Q) e ../diaLocal. Nada mais (requisitionStateMachine o importa: sem ciclo).
predicadoLoteImpedidoSql(aliasLote, hojeISO)        // "(<l>.status <> 'ATIVO' OR (<l>.data_validade IS NOT NULL
                                                    //   AND substr(<l>.data_validade,1,10) < '<hoje>' AND <l>.vencimento_liberado_em IS NULL))"
loteImpedidoSql(aliasMaterial, hojeISO = diaLocal.hojeLocalISO())
  // => "(CASE WHEN COALESCE(<m>.controle_lote,0) = 1 THEN ROUND(MAX(0, COALESCE((
  //       SELECT SUM(MAX(0, COALESCE((SELECT SUM(s.quantidade) FROM estoque_saldo_almoxarifado s WHERE s.lote_id = li.id), 0)
  //                       - COALESCE((SELECT SUM(ri.quantidade_em_inspecao) FROM recebimentos_material_itens_almoxarifado ri
  //                                   WHERE ri.lote_id = li.id AND COALESCE(ri.quantidade_em_inspecao,0) > 0), 0)))
  //       FROM lotes_almoxarifado li WHERE li.material_id = <m>.id AND <predicado('li')>), 0)
  //     - COALESCE(<m>.quantidade_bloqueada,0)), 6) ELSE 0 END)"
MSG_HOJE_INVALIDO = 'loteImpedidoSql: hoje inválido'  // lança Error se hojeISO não casar /^\d{4}-\d{2}-\d{2}$/
```

O arredondamento é `Q.qtdSql` (`quantidade.js:52-54`, `ROUND((expr), 6)`). Nenhuma query escreve a subtração do `disponivelSql`
à mão (a varredura de `saldoEmTerceiros.api.test.js` continua verde): o fragmento é **subtraído** de `disponivelSql(...)`, nunca o substitui.

### `saldoDisponivelParaItem(db, item)` — aditivo

Devolve tudo o que devolve hoje, igual, mais `lote_impedido: number` (≥ 0) e `disponivel_liberado: number` (= `disponivel − lote_impedido`, pode
ser < 0; quem usa já aplica `max(0, …)`).

### Quem passa a ler o liberado

| Leitor | Antes | Agora |
|---|---|---|
| `reservarItensAprovacao` `:672`, `:690` (e a condição da OS `:684`, `aReservar` `:704`) | `disponivel` | `disponivel_liberado` (destructure `disponivel_liberado: disponivel`) |
| porta da separação `:1485-1487` | `saldo.disponivel` no `tetoCom` | `saldo.disponivel_liberado` |
| `calcularStatusPosAprovacao` `:277/:282` | `disponivelSql('ma') > 0` | `disponivelSql('ma') − loteImpedidoSql('ma') > 0` |
| fila `:1052`, teto `:1094` | `saldo_disponivel` | coluna nova `lote_impedido` subtraída **só** no `teto` (não no `entregavel` `:1112`, não em `disponivel` `:1113`) |
| detalhe `routes/almoxarifado.js:3965` + `normalizarItem` `:297-299` | `estoque` | coluna nova `lote_impedido` (aditiva, como `caixa_sem_reserva_outros`); `normalizarItem` calcula `tetoSeparavel` com `estoque − lote_impedido` para `saldo_separavel`/`quantidade_separavel`/`saldo_separavel_reserva`; o `teto` de hoje continua alimentando `saldo_entregavel` (`:318-320`) e `maxEntregar` (`:303`). A coluna crua sai do JSON (como `_caixaCrua`, `:324`). |
| entrega `:2138`, `:2170`, `:2226`, `tetoDaLeitura` `:270` | — | **sem mudança** |

### Literal da separação (`requisitionService.js:1505-1507`)

```
`${item.material_nome}: não é possível separar ${qty} ${item.unidade || ''}. Máximo: ${max} (pendente: ${pend}, disponível: ${teto})`
  + (saldo.lote_impedido > 1e-9 ? `. Não entram ${Q.qtd(saldo.lote_impedido)}${item.unidade ? ` ${item.unidade}` : ''} em lote bloqueado, reprovado ou vencido.` : '')
```

Exportar a função da segunda frase (`fraseLoteImpedido(n, unidade)`) para os testes não redigitarem. Rotas e códigos HTTP: **nenhum novo**.

## Tasks

Todas **tronco** e sequenciais: as três mexem em `requisitionService.js` e na mesma conta compartilhada (regra da Fase 3: erro de interpretação
na T0 exige retrabalho nas outras). Sem worktree, sem galho.

- **T0 (tronco) — a régua e a conta.** `loteImpedido.js` (contrato acima) + `server/tests/api/loteImpedido.api.test.js`: RN-205.01 (cruzado com
  `listarLotesDoMaterial`, oito lotes) e RN-205.02 (a)–(f) pelo serviço — `saldoDisponivelParaItem` já devolvendo os dois campos novos.
  **Controle positivo:** tirar o abatimento da inspeção → (b) vermelho; tirar o `- quantidade_bloqueada` → (c) vermelho; trocar o `CASE` por
  sempre → (e) vermelho. ~45 min.
- **T1 (tronco, depois da T0) — aprovação e status.** `reservarItensAprovacao` lê o liberado; `calcularStatusPosAprovacao` desconta. Testes em
  `server/tests/api/loteImpedidoAprovacao.api.test.js`: RN-205.03 (as três portas, pela rota), RN-205.04 (rota + unidade), RN-205.05, RN-205.06,
  RN-205.07 (a parte da aprovação). **Sabotagem de posição:** tirar o desconto só em `reservarItensAprovacao` → RN-205.03 vermelho com status
  certo e reserva 10; tirar só em `calcularStatusPosAprovacao` → RN-205.04 vermelho (`APROVADO`). ~50 min.
- **T2 (tronco, depois da T1) — separação, fila e detalhe.** Porta `:1485`, fila `:1052/:1094`, detalhe `:3965` + `normalizarItem`; literal.
  Testes em `server/tests/api/loteImpedidoSeparacao.api.test.js`: RN-205.08, RN-205.09, RN-205.07 (o separável 6). **Sabotagem:** tirar o desconto
  só da fila → RN-205.09 vermelho com a porta verde (prova que são leituras separadas). ~45 min.
- **T3 (integração, rota E serviço) — `server/tests/api/loteImpedidoIntegracao.api.test.js`.** Fluxo pela **rota**: Entrada v2 em L1 (4) e L2 (6)
  → `PUT /lotes/:id/status` L2 BLOQUEADO → `POST /requisicoes` 10 → `PUT /aprovar` (reserva 4, `PARCIALMENTE_RESERVADA`) → `GET /fila-separacao`
  (`separavel` 4) → `GET /requisicoes/:id` (`quantidade_separavel` 4) → `PUT /separar` 5 (400, literal de RN-205.08 b) → `PUT /separar` 4 (200) →
  entrega 4 (200, sai de L1, livro da 197) → L2 volta a ATIVO → R2 de 6 aprovada reserva 6. O **mesmo** pelo **serviço**
  (`prepararPosAprovacao` dentro de `comTravaDaRequisicao` → `listarFilaSeparacao(db, user, { requisicaoId })` → a porta da separação →
  `entregarRequisicao`), mesmos números. Mais RN-205.10 (a entrega inalterada, fixada). ~40 min.
- **F2 — revisor fresco** com as quatro perguntas da `desenvolver-etapa` (a quarta: cada RN até o último gesto — aprovar → fila → modal → separar
  → entregar → devolver/estornar a entrega de lote).
- **T4 — fechamento** (`fechar-etapa`): specs 07-reservas, 05-separacao-picking e 10-lotes (a pendência C464 dividida: 1ª parte feita, 2ª é o
  item 7); mapa; guia (Antes → Agora: *"a aprovação reservava material de lote bloqueado"*); novidades B1368–B1378, C478–C481 (+C482 se o corte
  da B1378 acontecer) e D (205) com a C481; plano; estimado × gasto do item 6. Suíte completa (os cinco comandos).

## Cabe nas 4h30–5h?

Análise e plano ~1h (esta). Execução: T0 45 min + T1 50 + T2 45 + T3 40 ≈ **3h**, das quais ~2h são testes — o teto de 5h fecha com ~30 min de
F2 e fechamento **apertados**. Cabe no teto, não no piso. Se a T2 passar de 1h (o detalhe tem a forma mais frágil: o mesmo `teto` serve ao
separável e ao entregável), corta-se o sufixo da mensagem (B1378 → C482) e se mantém a conta nas quatro leituras — sem ela a fila e o modal
prometeriam o que a porta recusa.

## Pontos de atenção

- **Não troque o `teto` do `normalizarItem` inteiro:** ele alimenta também `saldo_entregavel` da segunda rodada (`:318-320`). Trocar ali muda a
  entrega (item 7) — RN-205.10 pega.
- **A fila tem duas contas na mesma linha** (`teto` `:1094` e `entregavel` `:1112`, ambas de `saldo_disponivel`): o desconto entra só no primeiro.
- **`disponivel_liberado` inclui a reserva do item** (como `disponivel`): no `tetoCom` continua `disponivel_liberado − reservado_para_item`.
- O fragmento roda **por linha** da fila (subselect correlacionado por material, várias requisições): conferir o tempo da fila com 200 itens na
  T2 (o molde: a fila já tem `caixaSemReservaSql` correlacionado por linha).
- Validades relativas (`diaLocal`) e o caso "vence hoje" (não vencido): a régua é `<`, não `<=` — a sabotagem é de **posição** (tirar o
  desconto), não de operador.
- `mudarStatusLote` exige justificativa e guarda o status no `WHERE`; rotas: `PUT /api/almoxarifado/lotes/:id/status`
  (`routes/almoxarifado/extended.js:1329`) e `PUT /lotes/:id/liberar-vencimento` (`:1278`), as duas `requirePermission('inspecionar')`.

## Fase 2 — correções do revisor fresco (2026-11-06) — **MANDAM sobre o texto acima onde divergem**

Revisor fresco sobre `88f18de5`: 0 trava, 4 importantes, 3 menores, todos aceitos. A F2 foi feita **antes** da T0 (a linha do checklist de Execução
que a punha depois da T3 está errada — M3). Confirmado: vencido com liberação, sem validade e saldo sem lote contam como liberado; o "hoje" é o
`diaLocal` do `isVencido`; o FEFO da 197 usa o mesmo `elegivel` e o mesmo desconto de inspeção; T0→T3 em série; a requisição aprovada antes não
passa a recusar (`max(0, r − c)` no teto, RN-205.07).

1. **[IMPORTANTE] I1 — terceiros:** `REMESSA_TERCEIRO` é retenção e não sai da linha do lote (`stockService.js:1751-1765`, `:1893`). **B1370 e contrato:**
   abater também `COALESCE(<m>.quantidade_em_terceiros,0)` junto com a bloqueada; sai da lista de descartados. Caso novo **RN-205.02 (g)**: L1 ATIVO
   4, L2 BLOQUEADO 6, `em_terceiros` 3 → `lote_impedido` 3, `disponivel_liberado` 4.
2. **[IMPORTANTE] I2 — inspeção sem recebimento** (devolução para Quarentena herda o lote, `returnService.js:140`, `:333`, e soma em
   `quantidade_em_inspecao` do material, `stockService.js:1698-1701`): no fim da conta, abater também a inspeção do material que nenhum item de
   recebimento explica: `- MAX(0, COALESCE(<m>.quantidade_em_inspecao,0) - COALESCE((SELECT SUM(ri2.quantidade_em_inspecao) FROM recebimentos_material_itens_almoxarifado ri2 JOIN lotes_almoxarifado l2 ON l2.id = ri2.lote_id WHERE l2.material_id = <m>.id AND COALESCE(ri2.quantidade_em_inspecao,0) > 0), 0))`.
   Caso novo **RN-205.02 (h)**: L1 ATIVO 4; devolução de 2 para Quarentena volta para L2 vencido sem liberação → `lote_impedido` 0.
3. **[IMPORTANTE] I3 — a frase nova da separação** (`requisitionService.js:1505`) passa a usar só o que o lote **cortou** do teto, e só quando o
   máximo fica abaixo do pendente:
   ```js
   const tetoBruto = tetoSeparacao(saldo.disponivel - saldo.reservado_para_item, saldo.reservado_para_item,
     getSeparado(item) - getEntregue(item), saldo.caixa_outras_requisicoes + irmaos.reduce((a, o) => a + caixaSemReservaDe(o, getSeparado(o)), 0));
   const cortadoPeloLote = Q.qtd(Math.max(0, tetoBruto - teto));
   const sufixo = (cortadoPeloLote > 1e-9 && max < pendenteSeparacao(item) - 1e-9) ? fraseLoteImpedido(cortadoPeloLote, item.unidade) : '';
   ```
   RN-205.08 (b) segue 6. Dois testes novos: (a) R1 com reserva 6, L1 (10) bloqueado, pede 7 → "Não entram 4 un"; (b) pendente 3, liberado 20,
   impedido 6 → a mensagem de hoje, sem a 2ª frase.
4. **[IMPORTANTE] I4 — a tela:** `lote_impedido` fica no JSON do detalhe (campo aditivo); o modal de separação (`RequisicoesList.js:2486`) ganha
   ``{Number(item.lote_impedido) > 0 && ` · Em lote bloqueado/reprovado/vencido: ${item.lote_impedido}`}`` (a literal entre crases é a frase congelada).
   Teste Jest (a linha aparece com impedido > 0; não aparece com 0) + controle. Vira task **T2b (galho de tela)**, depois da T2.
5. **C478 reescrita:** "as três portas que distribuem para quem espera (nota, inspeção/NC — `inspectionService.js:441`, `nonConformityService.js:1010`
   —, OS encerrada — `osEncerradaService.js:92`) reservam saldo de lote impedido" (`reservaChegadaService.js:365`, `:551`, `distribuirSemLock`).
6. **[MENOR] M1:** a B1370 diz que reserva e caixa contam como direito sobre o que pode sair (L1 ATIVO 4, L2 ATIVO 6, outra separou 6 de L2 sem reserva,
   L2 bloqueado → R separa 0, hoje 4); teste que fixa isso.
7. **[MENOR] M2:** no predicado SQL de vencido, `COALESCE(<l>.data_validade,'') <> ''` no lugar de `IS NOT NULL` (régua do `isVencido`, `lotService.js:161`).

**Tamanho:** I1–I4 somam ~30–45 min → ~5h30 (estimado 4h30 a 5h). Diferença < 1 h do teto: sem reestimar; a conclusão diz por quê se passar.

## Execução

- [x] F2 — revisor fresco do plano, **antes** da T0 (`422b8e90`). Esta linha estava depois da T3 e dizia "(antes da T0)": a ordem era a errada
  (M3), corrigida aqui.
- [x] T0 — `loteImpedido.js` + `saldoDisponivelParaItem` com `lote_impedido`/`disponivel_liberado` (RN-205.01, .02 a–h) — `8bebd3ce`
- [x] T1 — aprovação (três portas) e `calcularStatusPosAprovacao` (RN-205.03 a .07) — `f736cc71`
- [x] T2 — porta da separação, fila, detalhe e a literal (RN-205.07, .08, .09; I3, M1) — `82ae8664`
- [x] T2b — a linha do lote impedido no modal de separação (Fase 2 I4) — `18b41f47`
- [x] T3 — integração pela rota e pelo serviço + RN-205.10 (entrega fixada, com a segunda rodada) — `e989ec54`
- [x] Revisão "passaria com a feature quebrada?" — 2 sabotagens a mais, as duas passavam verdes e ganharam asserção: o teto inteiro do
  `normalizarItem` (segunda rodada, no `e989ec54`) e a releitura depois da conversão da reserva da OS (`33328089`)
- [x] Fase 5 — três revisões adversariais (2 revisores em paralelo no 1º fix-round, 1 no 2º): **5 achados reais + 1 regressão do próprio
  conserto**, ruído 0. Detalhe na seção "Fase 5" abaixo. `689bfa7d`, `65a19db6` (desfeito), `17fb5202`, `52fa9328`, `0516c933`, `13fe3691`.
- [x] T4 — fechamento (`fechar-etapa`): novidades (seção da 205, B1368–B1378 antes das B1379–B1382 que a Fase 5 já tinha escrito, C464
  anotado, C478–C481, C482–C483 sem uso, D (205), F (205), cabeçalho e "onde estamos"), specs 05, 07 e 10, mapa, guia, manual, este plano e
  o de pausa/retomada — o commit "Etapa 205: fechamento". O estimado × gasto do item 6 fica com o André (fora deste commit).

### Notas da execução (para o fechamento)

- **Rota da separação:** o plano diz `PUT /separar`; os testes usam `PUT /requisicoes/:id/separacao` (as duas rotas existem e chamam o mesmo
  `handleSeparacao`, `routes/almoxarifado.js:4680-4682`).
- **Divergência do contrato (M2 estendida):** a liberação do vencimento no predicado é `COALESCE(vencimento_liberado_em,'') = ''`, não
  `IS NULL` — o `elegivel` testa a verdade do campo (`''` não libera). `status` também por `COALESCE(status,'') <> 'ATIVO'` (NULL não é ATIVO).
- **I2 — a premissa do revisor estava errada em parte:** a devolução para Quarentena grava **`BLOQUEIO`** (`returnService.js:333-338`) → vai
  para `quantidade_bloqueada`, que a conta já abatia; não soma em `quantidade_em_inspecao`. O termo da I2 (inspeção do material sem item de
  recebimento) foi mantido — cobre o `QUARENTENA` sem recebimento — e tem teste próprio por SQL (RN-205.02 h); o caso pela rota da devolução
  (h, pela rota) passa pela bloqueada.
- **I4:** `lote_impedido` fica no JSON do detalhe (o contrato original mandava tirar; a Fase 2 manda manter).
- **Fila com 200 itens:** ~60 ms com 210 requisições (o fragmento por linha não pesa).
- **Quebra esperada achada pela suíte:** `entregaAutomaticaPeloLote` RN-197.03 separava 4 com só 2 em lote elegível — desde a T2 a separação
  recusa. O helper passou a separar **antes** de tornar o lote impedido (o caso que chega à entrega); livro e retrato iguais (`9bf6ccd6`).
- **Suíte (uma vez cada, serial):** `test:api` 595/596 — a 1 era a RN-197.03 acima; depois do ajuste o arquivo 33/33 (a suíte inteira não foi
  rodada de novo); `test:almoxarifado` 44/0; `test:validation` 4/0; `test:safealter` 3/0; `test:sqlite` 16/0; Jest 214 suítes, 2944/2944;
  `CI=true` build OK.

## Fase 5 — revisões adversariais (2026-11-06)

Três revisões (1º fix-round: 2 revisores em paralelo; 2º fix-round: 1 revisor fresco sobre o conserto). **5 achados reais + 1 regressão do
próprio conserto; ruído 0.**

- **P1 — material travado por negativo sem lote (real; o conserto se mostrou inseguro e foi DESFEITO).** A entrega que sai de lote impedido
  (RN-205.10) deixa *"Sem lote atribuído"* negativo e o lote cheio; a conta somava o lote cheio e ignorava o negativo (L1 10 bloqueado, sem
  lote −6, L3 ATIVO 5 → liberado −1: R2 de 5 sem reserva e a separação recusada, com 5 bons em L3). Conserto `65a19db6` (o negativo abatia o
  impedido). **Regressão achada no 2º fix-round:** o negativo é anônimo — no cenário do revisor (L1 10, R1 entrega 6 de L1 bloqueado, L1 volta a
  ATIVO, entra L2 6 bloqueado) o abatimento dava liberado 10 e a entrega tirava as 6 bloqueadas de L2 com o livro dizendo L1. **Desfeito** em
  `13fe3691`; fica a falha **segura** (promete menos do que há, nunca mais) — **C484**, **B1379** reescrita à vista. A causa (a entrega sair
  de lote impedido) é o item 7 abaixo.
- **P2 — desempenho (real).** O fragmento varria três tabelas (o saldo filtrava só por `lote_id`; os itens de recebimento sem índice por lote):
  200 leituras com 30 mil linhas de saldo e 20 mil itens, **1815 ms → 35 ms** depois do filtro por material e do índice
  `idx_receb_itens_almox_lote` — `17fb5202` (**B1380**, **A111**). Primeiro boot provado em pasta vazia (duas vezes, sem duplicar) e numa
  cópia do banco de desenvolvimento (`VACUUM INTO`): sem índice antes, com depois, 0 erros. **O que conferir em produção:** a A111.
- **P3 — lacuna de teste (real).** A régua da divergência gravada na rodada não era conferida (trocar o default do `tetoCom` pelo `disponivel`
  gravava "máximo 10, divergente" para quem separou os 4 que podia). Asserção na rota e no serviço — `689bfa7d`.
- **P4 — texto do modal (real).** *"Saldo: 10 · Em lote …: 10"* com o campo em 6 induzia 10 − 10 = 0. Unidade e *"; a reserva desta
  requisição continua valendo"* — `0516c933` (**B1382**).
- **P5 — a conversão da reserva da OS com o liberado negativo (real).** A requisição da OS ficava *Aguard. Estoque* para sempre com 4 bons
  reservados para ela. Abono `osNoImpedido` — `52fa9328` (**B1381**).

**Suítes finais** (uma vez cada, serial): `test:api` **596/596** e `test:almoxarifado` **44/0** sobre `13fe3691`; `test:validation` **4/0**,
`test:safealter` **3/0**, `test:sqlite` **16/0**, Jest **214 suítes / 2945 testes**, `CI=true` build OK sobre `0516c933` (o 2º fix-round só
mexeu no servidor e em testes do servidor). **Não verificado:** a tela clicada no navegador (F (205)); o boot no banco de produção (A111).

### Divergências do plano (resumo para quem retomar)

- A F2 veio **antes** da T0 (M3); a rota de separação dos testes é `PUT /requisicoes/:id/separacao` (a mesma `handleSeparacao`).
- O predicado usa `COALESCE(...,'')` na liberação e no status, não `IS NULL` (M2 estendida).
- A I2 partia de premissa errada em parte (a devolução para Quarentena é `BLOQUEIO`, não inspeção); o termo ficou e cobre o `QUARENTENA` sem
  recebimento.
- `lote_impedido` **fica** no JSON do detalhe (o contrato original mandava tirar; a Fase 2 I4 manda manter); a B1374 dizia "sem front" — a
  tela ganhou a linha (T2b).
- O corte da B1378 não aconteceu: o C482 ficou sem uso (e o C483 também; o aviso do 2º fix-round é o C484).
- RN-197.03 (`entregaAutomaticaPeloLote`) passou a separar antes de bloquear — quebra esperada (`9bf6ccd6`).

### Retro (4 números)

- **Rodadas de correção até verde:** 2 (1º fix-round P1–P5; 2º fix-round, que desfez o P1).
- **Achados reais da Fase 5:** 5 (P1–P5) + 1 regressão do próprio conserto (o P1, desfeito). **Ruído:** 0.
- **Paralelismo:** nenhum na execução (T0→T3 em série, tronco); 2 revisores em paralelo no 1º fix-round.
- **Defeito que escapou da 204:** nenhum conhecido.

## Próxima tarefa detalhada

**Item 7 do 2º pacote** (`docs/estimativas/2026-11/estimativa_2026-11-05_almoxarifado-proximas-2.txt:28-30`, **4h a 4h30**, já commitada):
*"Lote bloqueado, reprovado ou vencido — 2ª parte: entrega"* — a 2ª parte do **C464**, e a **causa do C484**. Quando só sobra saldo em lote
impedido, a entrega passa e a diferença vai para *"Sem lote atribuído"*, negativo (B1323). A entrega passa a recusar, dizendo qual lote está
impedido. Medido sobre `13fe3691` (sem consertar):

- **Onde a entrega cai no sem lote.** `requisitionService.entregarSemTrava` (`:1965`), laço das passadas (`:2455-2477`): na parte
  **automática** de material com `controle_lote` sem série (`!baixa.comOrigem && plano.controleLote && !seriesPorItem.has(item.id)`, `:2465`),
  `dividirPorLotes(await lotesParaOAutomatico(...), baixa.quantidade)` (`:2466`; `dividirPorLotes` `:1857`, `lotesParaOAutomatico` `:1900`, que
  já filtra `elegivel` e desconta inspeção e parte guardada) e **`if (resto > Q.QTD_FOLGA) await baixar(plano, baixa, resto, null)`
  (`:2473`) — é esta linha que cria o negativo.** `baixar` (`:2379`) chama o motor com lote `null`; o motor não exige lote na entrega
  (`stockService.js:1321-1343`, decisão do cliente de 2026-08-10: `exigeLote` só onde há campo de lote) e drena a linha sem lote, que pode
  ficar negativa.
- **A recusa tem de vir antes da primeira baixa.** As passadas 0/1 (origem da separação, "Sai de") baixam **antes** da passada do automático
  e não há transação: recusar em `:2473` deixaria a entrega meio baixada. O lugar é a conferência da requisição inteira (Etapa 135):
  `saldoAjustadoPelosIrmaos(await saldoDisponivelParaItem(...))` + `maxEntregar(item, disponivel, tetoDaLeitura(item, saldo))` (`:2224-2228`;
  o segundo caminho `:2280-2284`; `tetoDaLeitura` `:273`). Ali a parte automática que nenhum lote elegível **nem saldo sem lote positivo**
  cobre é conhecida antes de baixar. `saldoDisponivelParaItem` já devolve `lote_impedido`/`disponivel_liberado` (B1368).
- **A mensagem nomeia o lote.** Usar as literais do motor (`stockService.js:1550` *"Lote ⟨código⟩ esta ⟨bloqueado|reprovado⟩ e nao pode ser
  utilizado"*, `:1580` *"Lote ⟨código⟩ vencido em ⟨data⟩ nao pode sair para consumo. …"*) ou uma frase própria com o material na frente, no
  molde das recusas da entrega (*"⟨material⟩: não é possível entregar …"*). Ler `listarLotesDoMaterial` (que já dá `elegivel` por lote).
- **O teste que fixa o de hoje vai ficar vermelho de propósito.** `loteImpedidoIntegracao.api.test.js:156` (`[RN-205.10]`, entrega de 6 sai
  sem lote, sem lote −6) e `:179` (`[RN-205.10, segunda rodada]`, −10). Também caem: `entregaAutomaticaPeloLote.api.test.js` RN-197.03 (os dois
  testes do `naoElegivel`, `:201-218`, que esperam `['SAIDA', null, null, 2]`) e os cenários do C484 em `loteImpedidoIntegracao`
  (`[Fase 5 P1 desfeito]` e o do revisor), que **montam o negativo pela entrega** — vão precisar montá-lo por SQL (o negativo legado continua
  existindo no banco). Editar esses testes é o primeiro passo da SDD.
- **Material sem controle de lote: nada muda.** O ramo de fora (`:2477`, `baixar(plano, baixa, baixa.quantidade, null)`) não olha lote — e não
  deve (B1371). A régua de "impedido" só existe com `controle_lote = 1`.
- **Pontos de atenção.** (1) **A tela promete o que a porta recusaria** (o Achado 1 da 205, agora na entrega): o detalhe dá
  `saldo_entregavel`/`quantidade_entregavel` com o `teto` de hoje (`normalizarItem`, que alimenta a janela de entrega e o botão de um clique) —
  descontar ali também, senão a janela vem com 6 e a entrega recusa. (2) **A decisão do cliente de 2026-08-10** de não travar a entrega por
  lote (B1323 cita; `docs/almoxarifado-novidades-por-etapa.md`, buscar "2026-08-10"): recusar a contraria — o caminho reversível é recusar só a
  parte que **nenhum** lote elegível **nem** o saldo sem lote positivo cobre, e registrar em B. (3) **A reserva de antes do bloqueio** (B1372)
  é o caso que chega à entrega: a requisição separa a parte própria e só a entrega descobre — a recusa tem de dizer o que fazer (liberar o
  lote, ou devolver à prateleira e liberar a reserva). (4) **A origem da separação num lote que ficou impedido** depois de separar (passada 0):
  não medido — o motor já recusa com a literal do lote (o lote vai explícito); conferir se a entrega inteira toma 400 antes de baixar algo.
  (5) Trava: a entrega já roda sob a trava por requisição e `comTravaDaRequisicao` (Etapa 95); a leitura do lote vai dentro. (6) Depois do
  item 7 o **C484** deixa de nascer, mas o negativo antigo fica: dizer na letra C o que fazer com ele (ajuste).
- **O que está pronto e não precisa reabrir:** a régua e a conta (`loteImpedido.js`), os dois campos de `saldoDisponivelParaItem`, a aprovação,
  a separação, a fila, o detalhe do separável e o índice.
- **Se sobrar tempo:** **C478** (as três portas que distribuem para quem espera reservam lote impedido) — o mesmo fragmento no teto de
  `reservaChegadaService` (`reservarChegadaParaQuemEspera`, `distribuirSemLock`).
