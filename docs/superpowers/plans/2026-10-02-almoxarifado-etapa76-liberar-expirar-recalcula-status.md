# Etapa 76 — liberar à mão ou deixar vencer a reserva de uma requisição recalcula o status dela (C127, feature 07 com a 04)

> Status: **PLANO (Fases 0 e 1) — 2026-10-02.** Nada de código de produção escrito; nada commitado.
> Origem: "Próxima tarefa detalhada — Etapa 76" de
> `docs/superpowers/plans/2026-10-02-almoxarifado-etapa75-inspecao-libera-reserva.md:724-768` e o aviso **C127** de
> `docs/almoxarifado-novidades-por-etapa.md:6786`.

**Escopo desta etapa:**
1. **C127** — quando alguém **libera à mão** (tela **Reservas**, `POST /reservas/:id/liberar`, total ou parcial) a
   reserva de uma requisição, o status da requisição é recalculado pela mesma régua da 74 (`recalcularStatusDeReserva`):
   *Totalmente Reservada* sem nada seguro deixa de existir.
2. **A mesma coisa pela outra porta:** quando a reserva **vence** (`POST /reservas/processar-expiracao`, config
   `reserva_dias_validade`), o status das requisições donas é recalculado, uma vez por requisição, depois do lote.
3. **O recálculo dessas duas portas roda sob a trava por material da Etapa 75 (B394)** — a Fase 0 mediu que o
   `WHERE status = <lido>` sozinho não basta (Surpresa 2).

**Fora (declarado, ver "O que fica de fora"):** redistribuir o liberado para a fila (D2); a saída genérica que consome a
reserva de uma requisição (Surpresa 1 — C novo, candidata da 77); a inversão inspeção × **Aprovar** (C131 — custo
medido, fica para a 77); estender a trava ao recálculo da 74/75 e do estorno (D3); corrigir o passado (D9); chave nova
nas respostas; tela.

**Toque no cliente:** **nenhum** (D4 — a resposta da liberação e a do job não mudam; o texto do modal da tela Reservas
continua verdadeiro). **Toque em Compras:** nenhum.

## Fase 0 — medido (2026-10-02)

Sondas executadas pelas rotas reais com o harness `testApp.js` (`requirePermission` real), no scratchpad da sessão:
`sonda76-c127.js` (as portas), `sonda76-c127b.js` (parcial, dois itens, saída genérica), `sonda76-corrida.js` (o
recálculo sem trava × a nota), `sonda76-c131.js` (a ordem dos eventos na corrida inspeção × aprovar). Régua de ausência
testada contra caso que existe: `grep -c RESERVADA` dá 14 em `requisicaoReservaAutomatica` (existe) e **0** nos três
testes que passam por liberar/expirar (`reservaCicloIntegracao`, `reservaConsumo`, `reservaTransferenciaExpiracao`) —
nenhum deles afirma status de requisição depois de liberar/expirar (não devem cair).

### 1. A C127 reproduzida (sonda `sonda76-c127.js`)

```
A1 aprovar R(4), saldo 4                       200 TOTALMENTE_RESERVADA   reserva 1 ATIVA 4
A2 POST /reservas/1/liberar (total)            200 {"success":true,"reserva_id":1,"quantidade_liberada":4,"status":"LIBERADA"}
A2 status relido                               TOTALMENTE_RESERVADA   <- nada seguro (reserva LIBERADA, material q=4 r=0)
A2 fila de separação                           etapas=["SEPARAR"]      <- a fila diz a verdade (lê o saldo, não o status)
A3 recalcularStatusDeReserva(R) (o que daria)  TOTALMENTE_RESERVADA -> APROVADO

B  liberar 2 de 4 (parcial)                    200 status ATIVA; requisição TOTALMENTE_RESERVADA; recálculo daria PARCIALMENTE_RESERVADA
C  dois itens, libera a reserva de um          TOTALMENTE_RESERVADA; recálculo daria PARCIALMENTE_RESERVADA

D1 reserva_dias_validade = 1, aprovar R(4)     TOTALMENTE_RESERVADA, reserva com expira_em 2026-10-03  <- a da APROVAÇÃO também vence
D2 POST /reservas/processar-expiracao (ref. 2099-01-01)   200 {processadas 1, erros [], chaves [success, processadas, liberadas, erros]}
D2 status relido                               TOTALMENTE_RESERVADA   <- reserva EXPIRADA, q=4 r=0
D3 requisição de 2 itens, as duas expiram no mesmo lote    processadas 2, status TOTALMENTE_RESERVADA

E  liberar a reserva de uma PARCIALMENTE_ATENDIDA          status PARCIALMENTE_ATENDIDA (fora do conjunto — certo)
J  liberar a reserva de uma EM_SEPARACAO                   status EM_SEPARACAO (fora do conjunto — certo)
F  POST /reservas com requisicao_id no body    o vínculo é ignorado (a reserva nasce MANUAL); liberar não toca requisição
H  PUT /reservas/:id/transferir                200; requisicao_id continua; status TOTALMENTE_RESERVADA (o hold continua — certo)
I  cancelar a requisição reservada             CANCELADO; reserva LIBERADA (status terminal — o recálculo seria irrelevante)
K  liberar à mão, outra requisição leva o saldo, recálculo atrasado   TOTALMENTE_RESERVADA -> AGUARDANDO_ESTOQUE
```

### 2. As portas que tiram reserva de requisição (régua: chamadores de `stockService.liberarReserva` + escritores de `quantidade_utilizada`)

| Porta | Onde | Recalcula hoje? | Vale para a etapa? |
|---|---|---|---|
| **Liberar à mão** (`POST /reservas/:id/liberar`, gate `reservar`) | `routes/almoxarifado/extended.js:933-940` → `stockService.liberarReserva` (`stockService.js:3008-3058`) | **não** (A2, B, C) | **sim** — D1 |
| **Expiração** (`POST /reservas/processar-expiracao`, gate `configurar`) | `extended.js:956-961` → `reservationService.processarExpiracao` (`reservationService.js:106-161`; `liberarReserva` com `statusFinal: 'EXPIRADA'` `:121-125`; ramo sem saldo restante `:130-135`) | **não** (D2, D3) | **sim** — D1, D6 |
| Cancelar / excluir / encerrar / rejeitar por valor | `reservationService.liberarReservasDaRequisicao` `:176-207`, chamada em `routes/almoxarifado.js:3666, 3862, 3969` e `requisitionService.js:1396` | não — e não precisa: a requisição vai a status terminal (`CANCELADO`/`ENCERRADA`/`REJEITADO`), fora de `STATUS_RECALCULAVEIS` (I) | não |
| Aprovação que perdeu o UPDATE guardado | `requisitionService.desfazerReservas` `:261-275` (`routes/almoxarifado.js:3460`) | não — quem venceu grava o status | não |
| Desfazer da distribuição (saiu da espera / excesso) | `reservaChegadaService.liberarSemFalhar` `:68-79`, chamada **dentro** de `distribuirSemLock` (sob a trava do material) | sim, pelo `recalcularTocadas` no `finally` (`:177`, `:371`) | não — já tratado (74/75) |
| Estorno da entrada | `reservaChegadaService.liberarParaEstorno` `:405-470` → `stockService.recalcularStatusAposEstorno` `:2900-2909` | sim (74) | não |
| Transferência | `reservationService.transferirReserva` `:46-94` — só troca o dono; `requisicao_id` fica (H) | n/a — o hold não muda | não |
| **Saída genérica com `reserva_id`** (`POST /movimentacoes/v2`, gate `movimentar`) | `stockService.js:1021` (`consumindoReserva`) e `:1619-1675` — **sem checar a origem da reserva** | **não** (Surpresa 1) | **não** — D7, C novo |

### 3. O que o recálculo dá

`reservaChegadaService.recalcularStatusDeReserva` (`reservaChegadaService.js:119-138`): só parte de
`STATUS_RECALCULAVEIS` (`:47-48` — `APROVADO`, `AGUARDANDO_ESTOQUE`, `AGUARDANDO_COMPRA`, `*_RESERVADA`); com hold em
algum item pendente → `TOTALMENTE`/`PARCIALMENTE`; sem hold nenhum →
`requisitionStateMachine.calcularStatusPosAprovacao` (`requisitionStateMachine.js:140-183`: `APROVADO` se **algum** item
tem disponível > 0; senão `AGUARDANDO_COMPRA` com solicitação a caminho; senão `AGUARDANDO_ESTOQUE`); grava só se
`validarTransicao` aceita e `WHERE status = <lido>`. As setas existem desde a 74: `TOTALMENTE_RESERVADA →
PARCIALMENTE_RESERVADA | AGUARDANDO_* | APROVADO` e `PARCIALMENTE_RESERVADA → AGUARDANDO_* | APROVADO`
(`requisitionStateMachine.js:63-66`). **Nenhuma seta nova.**

**O ponto 2 da "próxima tarefa" da 75 respondido:** depois de uma liberação **total**, o liberado está no disponível na
hora do recálculo — o resultado é sempre `APROVADO` (A3), que é a verdade ("aprovada, com saldo, sem reserva"; a fila diz
`SEPARAR`). `AGUARDANDO_*` só sai se o saldo sumiu antes do recálculo (K). `EM_SEPARACAO`/`PARCIALMENTE_ATENDIDA` não
regridem (E, J).

### 4. Quem lê o status

- **Tela Requisições** (rótulo e filtro) e o **painel** *Requisições Abertas* (`routes/almoxarifado.js:4040-4064`, lista
  `*_RESERVADA` desde a 74 — B376) — são os que mentem hoje.
- **E-mail** da chegada/liberação: `Situação da requisição: <SITUACAO_REQUISICAO[status]>`; a lista de quem espera
  (`STATUS_QUE_ESPERAM`, `receiptNotificationService.js`) inclui `APROVADO` e `*_RESERVADA` — a requisição continua
  recebendo e-mail com o status certo.
- **Fila de separação** (`requisitionService.listarFilaSeparacao` `:426-480`): **não** depende do rótulo — lê saldo e
  hold (A2: `SEPARAR`). O status só decide a pertença a `PODE_SEPARAR`, que contém todos os recalculáveis.
- **Alerta** `REQUISICAO_ATRASADA` (`alertRegistry.js:526-547`): escreve `Status: <status>` no corpo.
- **A distribuição da 74/75**: candidatas por `PODE_SEPARAR` — `APROVADO` continua candidata (a próxima nota reserva de
  novo para ela, e o recálculo dela a leva a `*_RESERVADA` — seta `APROVADO → *_RESERVADA` existe).

### 5. A trava (B394) e o recálculo — o `WHERE status = <lido>` não basta (sonda `sonda76-corrida.js`)

R(8) aprovada com 4 (`PARCIALMENTE_RESERVADA`), reserva liberada à mão (hold 0, status mentindo). O recálculo é chamado
e **segurado** dentro de `calcularStatusPosAprovacao` (leu hold 0); nesse intervalo uma nota de 4 do mesmo material é
processada — a 74 reserva 4 para R e o recálculo dela não muda nada (status já `PARCIALMENTE`, hold 4 de 8). Solto o
portão:

```
rodada 1: antes PARCIALMENTE_RESERVADA | nota 200, depois da nota PARCIALMENTE_RESERVADA | recálculo atrasado gravou PARCIALMENTE_RESERVADA -> APROVADO | FIM APROVADO hold 4
rodada 2: idem    rodada 3: idem        (3/3)
```

O recálculo atrasado grava a leitura velha porque o status lido **não mudou** — a guarda só detecta mudança de status,
não de hold. Com a trava do material, a nota espera o recálculo terminar (ou o contrário), e o último a escrever leu o
hold certo. Por isso D3. **A mesma janela existe hoje** no recálculo da 74/75 (`recalcularTocadas` roda no `finally`,
**fora** da trava, `reservaChegadaService.js:174-178`) e no do estorno (`stockService.js:2900`) — não medida por sonda
nesta etapa; declarada (D3, C novo).

**Por que o gancho NÃO pode ficar no motor (`liberarReserva`):** `liberarSemFalhar` chama `liberarReserva` **dentro** de
`distribuirSemLock`, que já segura a trava do material (`reservaChegadaService.js:229-231`). A trava é uma fila de
promises **não reentrante** (`comLockDoMaterial`, `:212-227`): um recálculo sob a trava chamado de dentro do motor
esperaria a si mesmo — **deadlock** no desfazer de excesso da 74/75. O gancho fica nas duas portas (rota e job), que
nunca rodam sob a trava.

### 6. Surpresas da medição

1. **A saída genérica consome a reserva de uma requisição** (`sonda76-c127b.js`, G): `POST /movimentacoes/v2`
   `{tipo: 'SAIDA', quantidade: 4, reserva_id: <reserva da R>, justificativa}` → **201**; a reserva fica `CONSUMIDA
   4-4`; a requisição continua `TOTALMENTE_RESERVADA` com o item **ainda pendente 4** (nada foi entregue a ela) — o
   recálculo daria `AGUARDANDO_ESTOQUE`. O motor não olha `origem`/`requisicao_id` da reserva consumida
   (`stockService.js:1021`, `:1619-1630`). O material saiu "pela requisição" sem a requisição saber; ela depois separa
   de novo do disponível. É pior que a C127 (some material, não só o rótulo) e a pergunta certa é de **contrato** (a
   saída genérica pode consumir reserva de requisição?), não de rótulo — D7, C novo, candidata da 77.
2. **O `WHERE status = <lido>` não basta** (§5) — a trava é necessária, e a janela também existe nos recálculos da 74/75.
3. **C131 — a trava no `/aprovar` NÃO desinverte a fila** (`sonda76-c131.js`, 6/6 rodadas): instrumentando
   `stockService.criarReserva` e `reservarLiberacaoParaQuemEspera`, a ordem é sempre
   `APROVAR.criarReserva → INSPECAO.entra liberacao (q=4 r=4 i=0) → INSPECAO.sai liberacao reservas=0`. O `/aprovar` reserva
   **antes de a inspeção entrar no gancho** — o saldo já está no disponível desde o `DECISAO_INSPECAO` do motor, e a
   trava só começa na distribuição. Pôr o `/aprovar` na trava não muda nada: ele a pegaria primeiro. Consertar exige que
   **as três portas de liberação** (nota, inspeção, NC) peguem a trava **antes** do movimento do motor que põe o saldo no
   disponível, e que **as três portas de aprovação** (`/aprovar`, `/aprovar-valor`, automática) peguem a trava de
   **todos** os materiais da requisição em ordem. Seis portas, trava multimaterial, motor no meio — não é task pequena
   (D8: fica para a 77). *(Um evento de marcação da 1ª versão da sonda — `ownerRules.saidaPassaNaRegraDoDono` — foi
   descartado: é chamado também fora da distribuição e confundia a ordem.)*
4. **A reserva da APROVAÇÃO também vence** quando `reserva_dias_validade` está ligada (D1: `expira_em` = amanhã) — não só
   a da chegada, como o C127 sugeria. Com a config ligada, toda requisição reservada vira mentira em N dias até a 76.
5. **Quem não tem perfil libera a reserva de qualquer requisição:** `reservar` inclui `PRODUCAO`
   (`permissions.js:103`), e `getPerfilFromUser` cai em `PRODUCAO`. Anterior, fora do escopo (decisão de perfil da
   Etapa 4); registrar no fechamento se nenhum C o nomeia.
6. O modal da tela Reservas diz *"requisição #<requisicao_id>"* — o **id**, não o número (`ReservasAlmoxarifado.js:518`).
   Anterior, cosmético, fora.

### 7. Ciclo de `require`

`requisitionService` requer `reservationService` no topo (`requisitionService.js:12`) e `reservaChegadaService` requer
`requisitionService` no topo (`reservaChegadaService.js:28`). `reservationService` requerer `reservaChegadaService` no
topo fecharia o ciclo `reservationService → reservaChegadaService → requisitionService → reservationService` (objeto
parcial). **O require no job é LAZY**, dentro da função (o molde da 75). A rota (`extended.js`) pode requerer no topo
(rotas carregam depois dos serviços), pelo objeto.

## Decisões reversíveis (letra B do documento de novidades; última usada: B395)

- **D1 (B396) — duas portas: a liberação à mão (rota) e a expiração (job); o gancho fica nas portas, não no motor.**
  Descartados: (a) dentro de `stockService.liberarReserva` — deadlock com a trava (§5: `liberarSemFalhar` roda sob a
  trava do mesmo material) e recálculo duplicado em portas que já recalculam (estorno, distribuição) ou não precisam
  (cancelar/excluir/encerrar/rejeitar → status terminal; aprovação perdedora → quem venceu grava); (b) tocar
  `liberarReservasDaRequisicao` — status terminal, irrelevante (sonda I).
- **D2 (B397) — só o recálculo; o liberado NÃO é redistribuído para a fila.** Descartado: chamar o miolo da 74/75 com o
  liberado — se a dona ainda é a primeira da fila (o caso comum: ela continua esperando), o miolo devolveria a reserva a
  ela mesma e **anularia o gesto de quem liberou**; na expiração, a reserva renasceria a cada vencimento. Consequência
  declarada: a R2 que esperava o mesmo material continua `AGUARDANDO_*` com saldo livre (sonda A': a fila mostra
  `SEPARAR` para as duas) — o mesmo de hoje quando o saldo chega por ajuste/devolução; o aviso "chegou" (manual 9.7)
  cobre.
- **D3 (B398) — o recálculo dessas duas portas roda sob a trava por material (B394) de TODOS os materiais da
  requisição, em ordem crescente de `material_id`, numa função nova.** Medido (§5): sem a trava, 3/3 rodadas gravaram
  `APROVADO` com hold 4. Os chamadores da 74/75 (`recalcularTocadas`) e do estorno continuam com o recálculo sem trava —
  janela declarada (C novo). Descartados: (a) só o `WHERE status = <lido>` (não basta, §5); (b) pôr a trava dentro de
  `recalcularStatusDeReserva` para todos os chamadores — reabre o contrato da 74/75 sem sonda própria daquela janela;
  vira uma linha por chamador quando for medida (candidata); (c) só a trava do material da reserva liberada — numa
  requisição de dois materiais, a nota do outro material corre com o recálculo (a T0 prova com o RN-07 (b)).
  **Ordem crescente:** só o recálculo pega mais de uma trava; a distribuição segura uma e não pede outra — sem ciclo
  possível. Declarado redundante por construção (nenhum teste consegue derrubá-la hoje — G85).
- **D4 (B399) — respostas inalteradas e cliente intocado.** `POST /reservas/:id/liberar` continua `{success,
  reserva_id, quantidade_liberada, status}`; o job continua `{success, processadas, liberadas, erros}`. O texto do modal
  (*"Liberar devolve o saldo ao disponível geral e a entrega dessa requisição volta a disputar estoque com as demais."*)
  continua verdadeiro. Descartado: chave `status_requisicao` na resposta + toast (exigiria tela para valer algo — o
  mesmo descarte da D5 da 75).
- **D5 (B400) — best-effort.** A liberação e a expiração nunca caem por causa do recálculo (o saldo já voltou ao
  disponível; o recálculo é efeito). Falha vira `console.warn` com literal do contrato. Descartado: fatal (a liberação
  seria desfeita por causa de um rótulo).
- **D6 (B401) — a expiração recalcula depois do lote, uma vez por requisição, só das reservas que de fato expiraram**
  (`liberadas`, inclusive as do ramo sem saldo restante — inofensivo). Descartados: (a) recalcular dentro do laço (N
  recálculos da mesma requisição, e o primeiro veria a segunda reserva ainda ATIVA); (b) recalcular as `vencidas`
  (inclui as que falharam — reserva ainda ATIVA, recálculo inútil).
- **D7 (B402) — a saída genérica que consome a reserva de uma requisição fica de fora** (Surpresa 1 → C novo,
  candidata da 77 com a C131). Descartados agora: (a) recalcular no motor depois do consumo (o rótulo ficaria certo
  mas o defeito é o material sair sem a requisição saber — a decisão é recusar a saída genérica contra reserva de
  origem `REQUISICAO` ou não, mudança de contrato); (b) recusar já (mudança de contrato do `/movimentacoes/v2` sem medir
  quem usa).
- **D8 (B403) — a C131 fica para a 77.** Custo medido (Surpresa 3): a trava teria de começar **antes** do movimento do
  motor nas três portas de liberação e cobrir todos os materiais nas três portas de aprovação. Descartado: "pôr o
  `/aprovar` na trava" (a sonda prova que não desinverte — o `/aprovar` pega a trava primeiro).
- **D9 (B404) — sem correção do passado.** Requisições que hoje já mentem (`*_RESERVADA` sem hold, de liberações e
  expirações anteriores) **não** são recalculadas no deploy; a próxima liberação, expiração, nota, inspeção ou NC que as
  tocar corrige. A consulta **A40** acha as que mentem. Descartado: recalcular no boot (o mesmo da B377/B391).
- **D10 (B405) — o recálculo é o da 74, sem regra nova.** Mesma `recalcularStatusDeReserva`, mesmo conjunto, mesma
  máquina. Descartado: uma régua própria para liberação (duas réguas do mesmo rótulo).
- **B406 — Etapa 75, incidente: `docs/bkp_bancoprod.md`** (guia local de backup do banco de produção, com host do
  servidor e usuário SSH — sem senhas) entrou por engano no commit `0993f9ca` por um `git add docs/` e foi empurrado;
  removido do topo em `1e84729e` e excluído localmente (`.git/info/exclude`). Continua no histórico do branch.
  **Escolhido:** remover do topo (reversível). **Descartado:** reescrever o histórico com force push (destrutivo,
  decisão do dono do repositório — recomendado se o repositório for público ou compartilhado). *(O fork de fechamento
  transcreve esta entrada para a letra B do documento de novidades.)*

## Regras de negócio

- **RN-01 (liberar à mão tudo recalcula)** — material com 4, R(4) aprovada → `TOTALMENTE_RESERVADA`; `POST
  /reservas/:id/liberar` sem quantidade → **200, corpo com as mesmas quatro chaves de hoje** (`success`, `reserva_id`,
  `quantidade_liberada`, `status: 'LIBERADA'`); R relida → **`APROVADO`**; nenhuma reserva nova criada (D2). *Metade
  positiva:* R2(4) aprovada antes da liberação → `AGUARDANDO_ESTOQUE`, e depois da liberação **continua**
  `AGUARDANDO_ESTOQUE` sem reserva (só a dona é recalculada).
- **RN-02 (liberar parte recalcula)** — R(4) `TOTALMENTE`; liberar 2 → reserva `ATIVA` com 2; R → **`PARCIALMENTE_RESERVADA`**.
  Dois itens (4 e 3), liberar a reserva do segundo → **`PARCIALMENTE_RESERVADA`**. *Metade positiva:* liberar 2 de uma R
  `PARCIALMENTE_RESERVADA` que continua com hold → continua `PARCIALMENTE_RESERVADA`.
- **RN-03 (a expiração recalcula, uma vez por requisição)** — `reserva_dias_validade = '1'`, R(4) aprovada →
  `TOTALMENTE`, `expira_em` preenchido; `POST /reservas/processar-expiracao` `{referencia: '2099-01-01'}` → 200, **corpo
  com as mesmas chaves**, `processadas` 1; R → **`APROVADO`**. Requisição de dois itens com as duas reservas vencidas → um
  recálculo só (espião: `recalcularStatusSobTrava` chamado **uma** vez para ela), status `APROVADO`. Só uma das duas
  vencida (`expira_em` da outra nulo) → **`PARCIALMENTE_RESERVADA`**. Uma reserva cuja liberação falha
  (`stockService.liberarReserva` forçado a lançar para ela) → aparece em `erros`; a requisição **dela** não é
  recalculada (continua o status de antes), a da outra reserva do lote é.
- **RN-04 (fora do conjunto não muda)** — liberar à mão / expirar a reserva de uma requisição `PARCIALMENTE_ATENDIDA`
  ou `EM_SEPARACAO` → status inalterado. Reserva **manual** (sem requisição) liberada e expirada → nenhuma requisição
  tocada (espião: zero chamadas ao recálculo), resposta como hoje.
- **RN-05 (best-effort)** — `reservaChegadaService.recalcularStatusSobTrava` forçado a lançar (monkeypatch pelo objeto):
  liberar → 200 com o corpo de hoje, reserva `LIBERADA`, saldo devolvido, `console.warn` com a literal do contrato;
  job → 200, `processadas` certo, `erros` **vazio** (o recálculo não é erro de reserva). E o próprio gancho
  (`recalcularRequisicoesDasReservas`) forçado a lançar → a rota e o job continuam respondendo 200 (o `try` das portas).
- **RN-06 (perfil — inalterado)** — QUALIDADE (sem `reservar`) → 403 na liberação, reserva `ATIVA`, status
  inalterado; ALMOXARIFE → 200 e recalcula. Não ADMINISTRADOR no job → 403 (`configurar`), nada expira.
- **RN-07 (corrida liberar à mão × nota do mesmo material)** — (a) R(8) aprovada com 4, liberada à mão com o
  `calcularStatusPosAprovacao` segurado por um portão; nota de 4 do mesmo material processada pela rota durante o
  portão (espera de até 300 ms); solto o portão → **fim: o status condiz com o hold** (`PARCIALMENTE_RESERVADA` com hold
  4), nunca `APROVADO` com hold 4. (b) O mesmo com uma requisição de **dois materiais** M1 < M2, liberando a reserva de
  M1 e a nota sendo de **M2**. *Positiva:* sem corrida, o mesmo roteiro termina igual.
- **RN-08 (transferir não recalcula — declarado)** — `PUT /reservas/:id/transferir` → 200, `requisicao_id` mantido,
  status inalterado (o hold continua). O teste existe para a mudança futura ser vista.

## Contrato (congelado)

### Serviço — `services/almoxarifado/reservaChegadaService.js` (T0)

```
recalcularStatusSobTrava(db, requisicaoId) -> {requisicao_id, de, para} | null      // exportada
```
1. `mats = SELECT DISTINCT material_id FROM itens_requisicao_almoxarifado WHERE requisicao_id = ? AND material_id IS NOT NULL
   ORDER BY material_id` (numérico crescente).
2. Pega `comLockDoMaterial` de cada um, **aninhado, em ordem crescente**; dentro do mais interno:
   `return module.exports.recalcularStatusDeReserva(db, requisicaoId)`. Sem itens → chama direto (devolve `null`).
3. Lança só erro de banco (quem chama engole). **Nunca chamar de dentro de `distribuirSemLock`** (a trava não é
   reentrante) — comentário no código.

```
recalcularRequisicoesDasReservas(db, reservaIds, rotulo) -> Array<{requisicao_id, de, para}>   // exportada; NUNCA lança
```
1. `ids` vazio/nulo → `[]`.
2. `SELECT DISTINCT requisicao_id FROM reservas_material_almoxarifado WHERE id IN (<ids>) AND requisicao_id IS NOT NULL
   AND origem = 'REQUISICAO' ORDER BY requisicao_id`. Falhou → `console.warn('[almoxarifado-reservas] recalculo do status
   apos <rotulo> falhou (reservas <ids>): <msg>')` e `[]`.
3. Para cada requisição, num `try` próprio: `r = await module.exports.recalcularStatusSobTrava(db, id)`; `r` → empilha.
   `catch` → `console.warn('[almoxarifado-reservas] recalculo do status apos <rotulo> falhou (requisicao <id>): <msg>')`.
4. `rotulo` ∈ `'liberacao manual da reserva'` | `'expiracao da reserva'` (ASCII, como os warns da 74/75).

`recalcularStatusDeReserva`, `distribuirParaQuemEspera`, `comLockDoMaterial`, `recalcularTocadas`, o estorno:
**inalterados**.

### Ganchos

- **Rota `POST /api/almoxarifado/reservas/:id/liberar` (T1, `routes/almoxarifado/extended.js:933-940`):** depois do
  `await stockService.liberarReserva(...)` que deu certo e **antes** do `res.json(result)`:
  `try { await reservaChegadaService.recalcularRequisicoesDasReservas(db, [req.params.id], 'liberacao manual da reserva'); }
  catch (e) { console.warn('[almoxarifado-reservas] recalculo do status apos liberacao manual da reserva falhou (reserva '
  + req.params.id + '): ' + e.message); }` — `reservaChegadaService` requerido no topo do `extended.js` **pelo objeto**
  (monkeypatch dos testes). Resposta: o `result` de hoje, **inalterado**. Erro da liberação: o de hoje (o gancho não
  roda).
- **Job `reservationService.processarExpiracao` (T2, `reservationService.js:106-161`):** depois do `for`, antes do
  `return`: `if (liberadas.length) { try { const rcs = require('./reservaChegadaService');
  await rcs.recalcularRequisicoesDasReservas(db, liberadas.map((l) => l.id), 'expiracao da reserva'); } catch (e) {
  console.warn('[almoxarifado-reservas] recalculo do status apos expiracao da reserva falhou: ' + e.message); } }` —
  `require` **lazy** (§7; carga fria nas duas ordens). Retorno `{ processadas, liberadas, erros }` **inalterado**.

### O que não muda (contratos que não se reabrem)

O motor (`liberarReserva`, `criarReserva`, opções no 4º argumento, `registrarMovimentacao` — inclusive o consumo
genérico da Surpresa 1); a máquina de status (nenhuma seta nova); a reserva na chegada e na liberação (74/75), a trava
por material e o recálculo deles (sem trava — D3); o estorno (B374/B381/B382); `/encerrar`, `/rejeitar-valor`, cancelar,
excluir; transferir; o cliente inteiro; as respostas das duas rotas.

## Tasks

Ordem topológica: **T0 → T1 → T2 → T3 → T4**. T0 é tronco (serviço compartilhado). T1 e T2 só **consomem** a função
da T0 e mexem em arquivos disjuntos (`extended.js` × `reservationService.js`) — seriam galhos — **mas rodam em
sequência, no mesmo agente**, por três motivos medidos nas etapas anteriores: (1) as duas sabotam produção nos
controles positivos e o SQLite de teste é um só (G84 — quem sabota produção não roda junto com outra suíte); (2) são
pequenas (um gancho cada + um teste) — a worktree custaria mais que o ganho; (3) a 75 trocou o paralelismo pelo tronco
sequencial pelo mesmo motivo, com zero retrabalho.

**Regras de paralelismo (G84, mantidas):**
- **Dois agentes nunca no mesmo arquivo.** T0: `reservaChegadaService.js` + teste novo. T1: `extended.js` + teste novo.
  T2: `reservationService.js` + teste novo. T3: só um teste novo. T4: só `docs/` e `specs/`.
- **Quem sabota produção não roda suíte junto com outra suíte na mesma árvore.** Sabotagem por `perl -0pi` com âncora
  contada = 1, backup `e76-<task>-*.bak` no scratchpad, restauro por cópia com md5 conferido, um controle de cada vez
  (memórias: base LF, nunca `\r\n`; `python3` indisponível).
- **A revisão adversarial (Fase 5) só começa com a T3 commitada** e a árvore quieta.
- Scratchpad com nome único (`msg-e76-t0.txt`…). Executores **não** marcam este plano; o fio principal marca.

- [ ] **T0 (tronco) — o recálculo sob a trava, e a função das portas.** Pelo contrato "T0". Teste novo
  `server/tests/api/reservaRecalculoBase.api.test.js`, **pelo serviço** (a liberação feita direto em
  `stockService.liberarReserva`, sem o gancho das portas, para isolar a função):
  (a) R `TOTALMENTE`, liberar a reserva, `recalcularRequisicoesDasReservas(db, [id], 'teste')` → `[{de:
  'TOTALMENTE_RESERVADA', para: 'APROVADO'}]`, R `APROVADO`; (b) reserva manual → `[]` e **espião** em
  `recalcularStatusSobTrava` com **zero** chamadas; (c) duas reservas da mesma requisição na lista → **uma** chamada do
  espião; (d) `PARCIALMENTE_ATENDIDA` → `[]`, status igual; (e) `recalcularStatusSobTrava` forçado a lançar → a função
  devolve `[]`, **não lança**, warn com a literal `recalculo do status apos teste falhou (requisicao <id>)`; (f) RN-07 (a)
  pelo serviço (o portão no `requisitionStateMachine.calcularStatusPosAprovacao` pelo objeto — o recálculo o chama pelo
  objeto, `reservaChegadaService.js:133`; a nota pela rota `POST /recebimentos/:id/processar`); (g) RN-07 (b), dois
  materiais; (h) carga fria `node -e` de `reservaChegadaService`, `reservationService`, `requisitionService` nas três
  ordens. Toda espera concorrente com `comLimite` (15 s — uma trava que não solta prende a suíte em vez de falhar).
  **Medir antes:** os testes da 74/75 (`recebimentoReservaChegada*`, `reservaChegadaBase`, `reservaLiberacao*`,
  `inspecaoReservaLiberacao*`, `ncReservaLiberacao`) passam **sem edição**.
  **Controles positivos (e por que cada um cai):**
  (s1) `recalcularStatusSobTrava` sem trava (o corpo vira `return module.exports.recalcularStatusDeReserva(db, id)`) →
  **cai (f)**: sem a trava a nota não espera o portão, reserva 4 e recalcula sem mudar o status (já `PARCIALMENTE`); o
  recálculo segurado grava a leitura velha (hold 0 → `APROVADO`) — exatamente a `sonda76-corrida.js` (3/3). A asserção
  "status condiz com o hold" vê `APROVADO` com hold 4.
  (s2) trava só do **primeiro** material (`mats.slice(0, 1)`) → **cai (g)**, e só ela: a nota é do M2, que ficou fora da
  trava — o mesmo mecanismo do s1 no segundo material. (f) continua verde (um material só) — prova que (g) mede outra
  coisa.
  (s3) sem o `try` por requisição em `recalcularRequisicoesDasReservas` (o `catch` relança) → **cai (e)**: a exceção do
  monkeypatch escapa e a asserção "não lança" falha.
  (s4) sem o filtro `requisicao_id IS NOT NULL AND origem = 'REQUISICAO'` → **cai (b)**: a reserva manual devolve um
  `requisicao_id` nulo e o espião conta 1 chamada (com `null`). *Atenção (G85):* sem o espião (b) **não** cairia — o
  recálculo de `null` devolve `null` e o resultado continua `[]`; por isso a asserção é sobre o espião, não sobre o
  retorno.
  (s5) sem o `DISTINCT` → **cai (c)**: duas linhas da mesma requisição, o espião conta 2.
  *Declarado redundante por construção (não é controle):* a ordem crescente das travas (D3) — nenhum outro chamador
  pega duas travas, então inverter a ordem não produz ciclo que um teste veja.
- [ ] **T1 — liberar à mão recalcula.** O gancho na rota, pelo contrato. Teste novo
  `server/tests/api/reservaLiberarRecalculaStatus.api.test.js`, **pela rota** (`POST /reservas/:id/liberar`, gate real,
  usuários por perfil — ALMOXARIFE libera, QUALIDADE não): RN-01 (com a metade positiva da R2 e
  `deepStrictEqual(Object.keys(body).sort(), ['quantidade_liberada','reserva_id','status','success'])`), RN-02 (as três),
  RN-04 (rota: `PARCIALMENTE_ATENDIDA`, `EM_SEPARACAO`, manual), RN-05 (rota: `recalcularStatusSobTrava` lançando; o
  gancho inteiro lançando), RN-06 (liberação), RN-07 (a) **pela rota** (a liberação sem `await` até o portão; a nota com
  `Promise.race` de 300 ms; abre o portão; `await` das duas), RN-08. **Medir antes:** `reservaConsumo`,
  `reservaTransferenciaExpiracao`, `reservaCicloIntegracao` e o cliente `ReservasAlmoxarifado.test.js` verdes sem
  edição.
  **Controles (e por que caem):**
  (s1) gancho removido da rota → **cai RN-01** na asserção do status (`TOTALMENTE_RESERVADA` ≠ `APROVADO` — a C127
  reproduzida, sonda A2) e as três do RN-02.
  (s2) a rota chama `recalcularStatusDeReserva` (sem trava) no lugar de `recalcularRequisicoesDasReservas` → **cai
  RN-07 (a) pela rota** (o mecanismo do s1 da T0) — e o RN-01 continua verde (prova que o RN-07 mede a trava, não a
  existência do recálculo). *Para isto a rota precisa ler o `requisicao_id` da reserva na sabotagem — o executor escreve
  a sabotagem com essa leitura.*
  (s3) gancho sem o `try` da rota e `recalcularRequisicoesDasReservas` forçado a lançar → **cai RN-05 (gancho
  lançando)** com 500 (o `handleError` da rota). Com só o `recalcularStatusSobTrava` lançando, **não** cai (o `try`
  interno da T0 segura) — o teste tem as duas variantes justamente para isso; a sabotagem é medida contra a segunda.
  (s4) gancho **depois** do `res.json` sem `await` (fire-and-forget) → **não é controle confiável** (pode passar por
  ordem de microtarefas) — não usar; declarado.
- [ ] **T2 — a expiração recalcula.** O gancho no job, pelo contrato. Teste novo
  `server/tests/api/reservaExpiracaoRecalculaStatus.api.test.js`, **pela rota** do job (ADMINISTRADOR) e **pelo serviço**
  (`reservationService.processarExpiracao` direto, com `referencia`): RN-03 inteira (as quatro), RN-04 (job:
  `EM_SEPARACAO` e manual), RN-05 (job), RN-06 (job, não-admin 403), e o corpo com as mesmas chaves. **Espião** em
  `reservaChegadaService.recalcularRequisicoesDasReservas` (pelo objeto). **Medir antes:** `reservaTransferenciaExpiracao`,
  `reservaCicloIntegracao` verdes sem edição.
  **Controles (e por que caem):**
  (s1) gancho removido → **cai RN-03** na asserção `APROVADO` (sonda D2: fica `TOTALMENTE_RESERVADA`).
  (s2) gancho dentro do laço (uma chamada por reserva) → **cai a asserção do espião** "uma chamada por lote, com os
  ids das duas reservas" (2 ≠ 1). O status final continuaria certo — por isso a asserção é no espião (G85).
  (s3) gancho com `vencidas` no lugar de `liberadas` → **cai a asserção do espião** sobre os ids recebidos no caso da
  reserva que falhou (o id dela aparece). O status **não** cairia (a reserva que falhou continua ATIVA e o recálculo da
  dona não muda nada) — por isso, de novo, o espião.
  (s4) gancho sem o `try` do job e o espião forçado a lançar → **cai RN-05 (job)**: o job responde 500 em vez de 200.
  (s5) `require('./reservaChegadaService')` movido para o topo de `reservationService.js` → **cai (h) da T0** (carga
  fria com `requisitionService` primeiro: `reservaChegadaService.requisitionService` parcial) — *medir na T2: se a carga
  fria NÃO cair, o ciclo é inofensivo nesta ordem e o controle é declarado inalcançável, não forçado.*
- [ ] **T3 (integração, cruza T1 × T2 × 74) — a jornada de quem perde e ganha a reserva.** Arquivo
  `server/tests/api/reservaRecalculoIntegracao.api.test.js`, só pelas portas reais e com **usuários reais por perfil**
  (solicitante sem perfil = PRODUCAO; GESTOR aprova; ALMOXARIFE libera, separa e entrega; COMPRAS recebe a nota;
  ADMINISTRADOR roda o job): material com 4 → R1 (URGENTE, 4) aprovada → `TOTALMENTE_RESERVADA`; R2 (NORMAL, 4) aprovada
  → `AGUARDANDO_ESTOQUE` → ALMOXARIFE libera a reserva de R1 pela tela (rota) → R1 `APROVADO`, R2 continua
  `AGUARDANDO_ESTOQUE`, fila: as duas `SEPARAR` → painel *Requisições Abertas* lista R1 como `APROVADO` → nota de 4 pelas
  portas do recebimento → a 74 reserva para R1 (URGENTE) → R1 `TOTALMENTE_RESERVADA` de novo; R2 **não** ganha nada (teto da 74: só os 4 desta nota) e continua `AGUARDANDO_ESTOQUE` com os 4 liberados livres no
  estoque (D2, declarado) → config `reserva_dias_validade = '1'` → R3 (4) aprovada → **leva os 4 livres** (a
  consequência da D2: a dona liberada não os pegou de volta, e a R2 que esperava não é redistribuída) → job com `referencia` futura → **as reservas de R1 e R3 expiram**; R1 e R3 →
  `APROVADO`; R2 `AGUARDANDO_ESTOQUE` (sem reserva, nada muda) → ALMOXARIFE separa e entrega R1 do disponível →
  `ENTREGUE`. *Corrida pela rota:* fica na T1 (RN-07); aqui não.
  **Controles:** (s1) gancho da rota desligado → cai no passo "R1 `APROVADO`" depois da liberação; (s2) gancho do job
  desligado → cai no passo das expirações; (s3) a 74 desligada (`reservarChegadaParaQuemEspera` devolvendo vazio) → cai
  em "R1 `TOTALMENTE_RESERVADA` de novo" — prova que a jornada cruza a 74 de verdade e que `APROVADO` é candidata.
- [ ] **T4 — fechamento (skill `fechar-etapa`).** Novidades: seção da 76 (Antes → Agora; roteiro clicável: aprovar
  requisição com saldo → *Totalmente Reservada* → tela **Reservas** → liberar → a requisição vira *Aprovado*; liberar
  só parte → *Parcialmente Reservada*; ligar a validade, rodar a expiração → idem); **B396–B406** (a B406 é o incidente
  do `bkp_bancoprod.md`, transcrita deste plano); **C127 resolvido**; **C novos:** a saída genérica que consome a reserva
  de uma requisição (Surpresa 1), a janela do recálculo sem trava na 74/75 e no estorno (D3), e — se nenhum C o nomeia —
  quem não tem perfil libera reserva de qualquer requisição (Surpresa 5); **C131** atualizado com o custo medido
  (Surpresa 3); **A40** (abaixo); D (76); F (76). Spec 07 (cabeçalho, item `[x]` com hashes, linhas na tabela de
  regras/testes, o "falta" da linha 72-73 riscado à vista); spec 04 se citar C127; mapa (linhas 04 e 07); guia
  (cabeçalho "76 ENTREGUE · 77 começando", seção da 76; **as duas frases das linhas 5438 e 5497 que dizem "não muda o
  status" ficam riscadas à vista com o que a 76 mudou**); manual **9.6** (o parágrafo "Liberar à mão não muda o status
  da requisição" `docs/almoxarifado-manual-do-sistema.md:1852` é **substituído**, dizendo que estava certo até a 75) e
  **9.7** (`:1862`). Retro de 4 números. **Próxima tarefa detalhada — Etapa 77** (candidatas: C131 com o custo medido;
  a saída genérica contra reserva de requisição; a janela do recálculo sem trava).

## O que fica de fora (declarado — e por quê)

- **Redistribuir o liberado** (D2): anularia o gesto de quem liberou.
- **A saída genérica que consome a reserva de uma requisição** (D7, Surpresa 1): decisão de contrato, candidata da 77.
- **C131** (D8): seis portas e trava multimaterial antes do motor — 77.
- **A trava no recálculo da 74/75 e do estorno** (D3): janela declarada, candidata.
- **Correção do passado** (D9): a A40 acha.
- **Chave nova nas respostas, toast, texto do modal** (D4).
- **E-mail ao solicitante quando a reserva dele é liberada ou vence**: nenhuma porta hoje avisa a perda; fora (o
  aviso da 70/74/75 é de chegada).

## Letra A — consulta para produção (candidata, a confirmar no fechamento)

**A40 — requisições que hoje dizem *Reservada* sem estar** (o tamanho do C127 em produção; a 76 não corrige o passado —
D9). Somente leitura:

```sql
-- (1) *_RESERVADA sem NENHUM hold ativo
SELECT r.numero, r.status, r.updated_at
FROM requisicoes_almoxarifado r
WHERE COALESCE(r.ativo, 1) = 1
  AND r.status IN ('TOTALMENTE_RESERVADA', 'PARCIALMENTE_RESERVADA')
  AND NOT EXISTS (SELECT 1 FROM reservas_material_almoxarifado rs
                  WHERE rs.requisicao_id = r.id AND rs.status = 'ATIVA'
                    AND rs.quantidade - COALESCE(rs.quantidade_utilizada, 0) > 1e-9)
ORDER BY r.updated_at;

-- (2) TOTALMENTE_RESERVADA com algum item pendente descoberto
SELECT r.numero, ir.id AS item_id,
       ir.quantidade_solicitada - COALESCE(ir.quantidade_entregue, ir.quantidade_atendida, 0) AS pendente,
       COALESCE((SELECT SUM(rs.quantidade - COALESCE(rs.quantidade_utilizada, 0)) FROM reservas_material_almoxarifado rs
                 WHERE rs.item_requisicao_id = ir.id AND rs.status = 'ATIVA' AND rs.origem = 'REQUISICAO'), 0) AS hold
FROM requisicoes_almoxarifado r JOIN itens_requisicao_almoxarifado ir ON ir.requisicao_id = r.id
WHERE COALESCE(r.ativo, 1) = 1 AND r.status = 'TOTALMENTE_RESERVADA'
  AND ir.quantidade_solicitada - COALESCE(ir.quantidade_entregue, ir.quantidade_atendida, 0) > 1e-9
  AND COALESCE((SELECT SUM(rs.quantidade - COALESCE(rs.quantidade_utilizada, 0)) FROM reservas_material_almoxarifado rs
                WHERE rs.item_requisicao_id = ir.id AND rs.status = 'ATIVA' AND rs.origem = 'REQUISICAO'), 0)
      < ir.quantidade_solicitada - COALESCE(ir.quantidade_entregue, ir.quantidade_atendida, 0) - 1e-9;
```

O que fazer com o resultado: nada é urgente — a fila de separação já mostra o saldo de verdade; o rótulo se corrige
na próxima nota/inspeção/NC do material ou numa liberação/expiração depois do deploy.

## Próximo passo

**Fase 2** — revisão do plano por um agente fresco, com as quatro perguntas da skill (contratos e literais; RN × spec 07;
independência real de T1/T2; cada RN seguida até o último gesto — p.ex. RN-01: liberar → R `APROVADO` → a próxima nota
ainda a trata como candidata? → separar/entregar a partir de `APROVADO` aceita?) **e a quinta da G85: cada controle
positivo acima consegue cair, pelo caminho que o plano diz?** Depois, T0.

## Fase 2 — revisão do plano: 0 críticos, 3 importantes, 7 menores → plano revisto (vale sobre o texto acima)

- **IMPORTANTE — o DISTINCT dos materiais sem teste**: requisição com dois itens do MESMO material sem DISTINCT pega a
  mesma trava duas vezes, aninhada; a trava não é reentrante (`reservaChegadaService.js:213-227`) → o material fica
  travado até reiniciar o processo (notas/inspeções/NCs dele penduradas). → **T0 ganha o caso de dois itens do mesmo
  material dentro do `comLimite`, e a sabotagem "sem DISTINCT" como controle** (cai pelo limite de tempo).
- **IMPORTANTE (G85) — o s5 da T2 não derruba o (h) da T0**: o require circular com `requisitionService` carregado
  primeiro (a ordem real do app) NÃO lança — guarda um `{}` velho e só quebra em execução no `.sort(compararPrioridade)`
  com ≥ 2 candidatas (sonda `sonda76r-ciclo.js`). → **o (h) passa a rodar uma DISTRIBUIÇÃO com duas candidatas depois
  de carregar `requisitionService` primeiro** (o molde da 75, que só confere `typeof`, não prova nada aqui).
- **IMPORTANTE — a T3 falhava na expiração da R1**: `expira_em` é calculado na CRIAÇÃO da reserva
  (`stockService.js:2953-2955`); ligar `reserva_dias_validade` depois da nota deixa a reserva sem vencimento. → ligar a
  config ANTES da nota.
- **IMPORTANTE (declarar) — a não-redistribuição (D2) é a C121 por outra porta**: depois de liberar/vencer, quem
  esperava (R2) não ganha nada e uma aprovada depois leva o saldo livre; a justificativa "o aviso 'chegou' (manual 9.7)
  cobre" estava errada (é o indicador da tela de detalhe, manual 10.1 — não impede a R3). → **C nova** no fechamento +
  a alternativa "redistribuir excluindo a dona" listada como DESCARTADA (motivo: o gesto de liberar é do operador sobre
  aquela requisição; redistribuir é outra decisão — candidata junto com a C131).
- Menores: o gancho da rota recebe `result.reserva_id` (número), não `req.params.id`; no job, a asserção de "zero
  chamadas" da reserva manual é sobre `recalcularStatusSobTrava` (o espião em `recalcularRequisicoesDasReservas` conta
  1); cada metade do filtro do s4 da T0, sozinha, não cai (`origem = 'REQUISICAO'` ⇔ `requisicao_id`) — declarar e só
  sabotar as duas juntas; o portão do RN-07 segura uma vez só; o roteiro do guia diz que a R2 continua
  AGUARDANDO_ESTOQUE com saldo livre (declarado, não defeito); a Surpresa 5 (perfil PRODUCAO libera reserva de
  qualquer requisição, `permissions.js:103`) **vira C no fechamento** (não há C que a nomeie hoje).
