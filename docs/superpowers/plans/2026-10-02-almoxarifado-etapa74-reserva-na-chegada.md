# Etapa 74 — a requisição que esperava fica com o material que chegou (C121, feature 07 com a 08 e a 19)

> Status: **EM EXECUÇÃO — 2026-10-02.** Fases 0, 1 e 2 feitas; tronco T0→T4 sequencial num agente só (a Fase 2
> moveu a T4 para o tronco). Ver as marcas nas Tasks.
> Origem: "Próxima tarefa detalhada — Etapa 74" de
> `docs/superpowers/plans/2026-10-02-almoxarifado-etapa73-requisicao-espera-compra.md:595-635` e o aviso **C121** de
> `docs/almoxarifado-novidades-por-etapa.md:6450`.

**Escopo desta etapa:**
1. **C121** — quando a nota dá entrada (`processarNota` e o ramo direto de `aprovarRecebimento`), o que entrou **livre**
   é reservado para as requisições que **já esperavam** aquele material, na ordem da fila de separação (urgência →
   necessidade → mais antiga). Quem é aprovado **depois** (pelas três portas, inclusive a aprovação automática) só leva
   o que sobrou.
2. **O status acompanha a reserva:** a requisição que ganhou reserva sai de `AGUARDANDO_*`/`APROVADO` para
   `PARCIALMENTE_RESERVADA`/`TOTALMENTE_RESERVADA` (setas novas em `TRANSICOES`, reabrindo a B362 de propósito).
3. **O e-mail da Etapa 70 diz a verdade:** quem ganhou reserva lê quanto ficou reservado para ela; quem não ganhou nada
   e não tem nada livre para separar não recebe *"chegou material"*.
4. **O estorno da entrada (Etapa 71) desfaz a reserva que a própria nota criou** — só o necessário, só as da chegada
   daquela nota — e o status das requisições volta a ser recalculado.
5. **O painel de requisições abertas** passa a listar `PARCIALMENTE/TOTALMENTE_RESERVADA` (achado da Fase 0, Surpresa 4:
   hoje elas somem do painel — e esta etapa empurra mais requisições para esses status).

**Fora (declarado, ver "O que fica de fora"):** reservar quando a **inspeção libera** o material retido (a mesma C121
por outra porta — medido, Surpresa 3); reservar em entradas que não são nota (ENTRADA manual, devolução, transferência,
ajuste); recalcular o status quando alguém **libera à mão** uma reserva de requisição (Surpresa 2, anterior); tela nova.

**Toque no cliente:** **nenhum** (medido — Fase 0 §6: o banner da 73 continua dizendo a verdade).
**Toque em Compras:** nenhum.

## Fase 0 — medido (2026-10-02)

Sonda executada: `sonda74-c121.js` (scratchpad da sessão), pelas rotas reais com o harness `testApp.js`
(`requirePermission` real; solicitante e aprovador distintos; tabela `usuarios` criada para o e-mail sair). Réguas de
ausência testadas contra caso que existe antes de concluir: `grep -n "requisicao_id" schema.js` acha a coluna da
reserva (`:1319`) e **não** há `recebimento_id` em `reservas_material_almoxarifado` (`grep -n "recebimento_id"
schema.js | grep -i reserv` → vazio); `grep -rn "avisarEntradaConfirmada"` acha o único chamador
(`receiptService.js:67`) — e nenhum em `inspectionService`.

### 1. A C121 reproduzida (sonda, bloco A e C)

```
A1 R1 (6) NORMAL                         "AGUARDANDO_ESTOQUE reservas=[]"      (pedido avulso, sem solicitacao)
A1 R2 (3) URGENTE, criada depois         "AGUARDANDO_ESTOQUE reservas=[]"
A2 nota de 4: status R1/R2               ["AGUARDANDO_ESTOQUE","AGUARDANDO_ESTOQUE"]   saldo q=4 r=0, nenhuma reserva
A2 fila                                  R2 em #0, R1 em #1 (urgencia antes da antiguidade), as duas SEPARAR
A2 e-mail a R1 e a R2                    os DOIS dizem "entrou 4 PC" — 4 prometidos a 9 pendentes; literal
                                         "O material ainda não está reservado para a sua requisição — ..."
A3 R3 (4) aprovada DEPOIS                "TOTALMENTE_RESERVADA reservas=[4]"   (reserva no nome do APROVADOR, B361)
A3 fila                                  R1 e R2 AGUARDANDO_SALDO; R3 SEPARAR
A4 separar 4 de R1                       400 "Sonda S74-A: não é possível separar 4 PC. Máximo: 0 (pendente: 6, disponível: 0)"
C1 Q1 (5) espera; nota de 5; aprovacao automatica LIGADA
C2 Q2 criada                             resposta "TOTALMENTE_RESERVADA" (automatica), reserva de 5 para Q2
C2 Q1                                    AGUARDANDO_ESTOQUE, fila AGUARDANDO_SALDO   <- a C121 sem ninguem aprovar
```

### 2. Onde pendurar

| Onde | O que há hoje |
|---|---|
| `receiptService.js:1681-1730` `concluirProcessamentoNota` | `darEntradaEstoque` → conta a pagar (só se ainda dono da marca) → `UPDATE ... 'PROCESSADO'` → auditoria → `fecharSolicitacoesDoPedido` (try/warn) → **`avisarEntradaConfirmadaSemFalhar`** (último passo) |
| `receiptService.js:1749-1777` `concluirAprovacaoDireta` | `darEntradaEstoque` → `UPDATE ... 'APROVADO'` → `fecharSolicitacoesDoPedido` → **aviso** |
| `receiptService.js:1733-1737` | `aprovarRecebimento` de nota em `EM_ENTRADA_NF`/`ENCAMINHADO_FATURAMENTO` **delega** a `processarNota` (não chega ao ramo direto: um gancho por ramo não duplica) |
| `receiptService.js:65-71` `avisarEntradaConfirmadaSemFalhar` | o molde do best-effort: try/`console.warn` com literal, nunca muda a resposta |
| Marca de processamento (Etapa 70 T0b) | os dois `concluir*` rodam **dentro** do claim; o perdedor de dois cliques toma 409 antes |

**Antes do aviso, não depois** (decisão D1): o aviso lê o banco; se a reserva viesse depois, o e-mail diria *"ainda
não está reservado"* para quem acabou de ganhar a reserva. Mas, posta antes **sem mexer no aviso**, o critério da 70
(`receiptNotificationService.js:214-225`: pendente = separação − **reservado ATIVO do item**) zera o pendente de quem
ganhou tudo e o solicitante **não recebe e-mail nenhum**. Por isso a T2 muda o aviso junto (D7).

### 3. Quem espera, quanto leva, em que ordem

- **Quem:** o aviso da 70 já define, por item: requisição ativa em `STATUS_QUE_ESPERAM` (`PODE_SEPARAR − EM_SEPARACAO`
  = `APROVADO`, `AGUARDANDO_ESTOQUE`, `AGUARDANDO_COMPRA`, `PARCIALMENTE_RESERVADA`, `TOTALMENTE_RESERVADA`,
  `PARCIALMENTE_ATENDIDA`; `receiptNotificationService.js:46`), com pendente − hold ATIVO do item > 1e-9. Reaproveitar
  a mesma régua (uma régua para "quem esperava", D2). `APROVADO` sem reserva existe (A37 (3): aprovadas pela automática
  antes da 73) e `TOTALMENTE_RESERVADA` **sem hold** também (Surpresa 2) — as duas se corrigem sozinhas pela régua.
- **Quanto:** a reserva da aprovação já tem a régua idempotente (`requisitionService.js:162-220`,
  `reservarItensAprovacao`: falta = `pendenteEntrega` − hold ATIVO do item; reserva `min(falta, livre)`). **Mas ela
  reserva todos os itens da requisição pelo disponível global** — para a chegada, o teto é **o que entrou livre desta
  nota** daquele material (D4), senão a nota distribuiria saldo que veio de ajuste/devolução.
- **O retido não entra:** `darEntradaEstoque` registra `QUARENTENA` e soma em `quantidade_em_inspecao` do material e do
  item (`receiptService.js:1518-1534`); `disponivelSql` desconta `quantidade_em_inspecao` (`availabilitySql.js`,
  `COLUNAS_RETENCAO`). Sonda D2: nota de 4 retida → `q=4 i=4`, T2 aprovada depois → `AGUARDANDO_ESTOQUE`, nenhuma reserva.
  O aviso da 70 já soma "o que entrou livre" por material (`receiptNotificationService.js:204-209`) — mesma conta.
- **Ordem:** a fila da 64 (`requisitionService.js:503-511`) ordena por `acionavel` → urgência (`CRITICO`, `URGENTE`,
  resto; `UPPER` por legado) → `data_necessidade` (sem data por último) → `created_at` → `id`. Na chegada `acionavel`
  não se aplica (todas estão esperando); o resto é a régua (D3). Medido (A2): a fila **já** põe a URGENTE nova antes da
  NORMAL antiga — reservar em outra ordem faria a fila e a reserva discordarem.

### 4. O status e quem o lê

`TRANSICOES` (`requisitionStateMachine.js:39-62`): `AGUARDANDO_*` só saem para `EM_SEPARACAO`/`CANCELADO`;
`PARCIALMENTE_RESERVADA`/`TOTALMENTE_RESERVADA` só para `EM_SEPARACAO`/`CANCELADO`. As três portas da 73 gravam o status
final por `UPDATE` direto (B362: sem seta declarada). A chegada precisa de `AGUARDANDO_* → *_RESERVADA`,
`APROVADO → *_RESERVADA` (já existe), `PARCIALMENTE_RESERVADA → TOTALMENTE_RESERVADA`; o estorno precisa de
`*_RESERVADA → AGUARDANDO_*` e `*_RESERVADA → APROVADO`.

Quem lê o status (régua: `grep -rn "AGUARDANDO_COMPRA\|TOTALMENTE_RESERVADA"` fora de `tests/` e da máquina):

| Leitor | Efeito de a requisição ir a `*_RESERVADA` na chegada |
|---|---|
| Fila de separação 64 (`listarFilaSeparacao`) | nenhum na etapa: decide `SEPARAR` pelo saldo **+ o hold do próprio item** (`:437`) — a reservada passa a `SEPARAR`, as outras a `AGUARDANDO_SALDO` (o certo) |
| `PODE_SEPARAR` | inclui os dois `*_RESERVADA` — separar continua possível |
| Alerta `REQUISICAO_ATRASADA` (`alertRegistry.js:32-33`) | conjunto derivado de `Object.keys(TRANSICOES)` — inclui os dois |
| Indicadores 67 (`reportService.js`) | não distinguem |
| `receiptNotificationService.SITUACAO_REQUISICAO` | já tem os rótulos dos dois |
| Banner do detalhe (`RequisicoesList.js:1650-1668`, T3 da 73) | `*_RESERVADA` mostra as literais de reserva (verdadeiras); o *"Chegou material… ainda não está reservado"* só aparece em `AGUARDANDO_*` com saldo — o que, depois desta etapa, só acontece quando o material chegou por **outra porta** (ajuste, devolução, inspeção liberada) ou a reserva falhou: continua verdade. **Sem mudança no cliente.** |
| **Painel `GET /dashboard/requisicoes` (`routes/almoxarifado.js:4031-4035`)** | **a lista `abertas` não tem `PARCIALMENTE/TOTALMENTE_RESERVADA`** — Surpresa 4 |

### 5. O motor de reserva

`stockService.criarReserva` (`stockService.js:2807-2869`): hold atômico (`UPDATE ... WHERE disponível >= q RETURNING`),
`opcoes.sistema` dispensa o perfil, `origem = 'REQUISICAO'` quando há `requisicao_id` (o que a entrega consome:
`requisitionService.js:1100-1130`), dono = `user` (`solicitante_id`/`_nome`, B361). **Sem lote nem série** na reserva
(`schema.js:1282-1321`): o lote é escolhido na separação — a chegada não muda isso. **Material de cliente:** a reserva
não olha o dono (C124; a regra vale na saída). `liberarReserva` (`:2886`) aceita quantidade parcial.

### 6. O estorno da entrada (Etapa 71) — sonda, bloco B

```
B1 estorno da ENTRADA_COMPRA de 4, com os 4 reservados por R3       400 "Não é possível estornar: saldo disponível insuficiente (material já consumido)"
B2 liberar a reserva de R3 (POST /reservas/:id/liberar)              200 — e R3 continua "TOTALMENTE_RESERVADA" sem hold   <- Surpresa 2
B2 estorno depois                                                    200, pedido de 10 volta a ABERTO, saldo 0
```
O ramo de entrada de `cancelarMovimentacao` (`stockService.js:2452-2466`) debita com guarda de **disponível**
(`quantidade_atual − reservada − ...`): qualquer reserva sobre o que chegou faz o estorno recusar, com uma literal que
diz *"material já consumido"* quando ele está só reservado. Com a reserva na chegada, **toda** nota que atendeu alguém
passaria a ser inestornável até alguém liberar à mão — e liberar à mão deixa o status mentindo (B2). O gancho do pedido
da 71 (`estornarEntradaNoPedido`, `:2761-2768`) roda depois do claim e da auditoria, não-fatal, `require` lazy.

### 7. O e-mail da Etapa 70 — sonda, bloco A2

```
Chegou ao estoque material que a sua requisição aguardava.
Requisição: REQ-...      Situação da requisição: Aguardando estoque
Materiais que chegaram:
- S74-A — Sonda S74-A: entrou 4 PC (pendente na requisição: 6 PC)
O material ainda não está reservado para a sua requisição — a separação é feita pelo almoxarifado.
```
R1 (6) e R2 (3) recebem os dois *"entrou 4"* — o e-mail promete 4 a 9 pendentes. Testes que prendem a literal:
`recebimentoAvisoEntrada.api.test.js:144,318` (função pura `montarAvisoRequisitante`). Testes que prendem "a chegada não
muda nada": `recebimentoAvisoEntradaIntegracao.api.test.js:257` (*"a requisicao avisada continua como estava e e
SEPARAVEL"*) e `requisicaoEsperaCompraIntegracao.api.test.js:200-231` (RN-08 da 73, *"a chegada nao muda o status"*).
`requisicaoAguardandoCompraVinculada` RN-02 (`:135-149`) **não** é afetado (nenhuma requisição espera quando a nota entra).

### 8. Corridas

- **Nota × `/aprovar` (ou automática) do mesmo material:** as duas passam por `criarReserva` (atômica). Quem chega
  primeiro leva; o perdedor do lado da aprovação cai no recálculo da 73 (`prepararPosAprovacao`, `5ea57d03`) e fica
  `AGUARDANDO_*`; o perdedor do lado da chegada simplesmente não reserva (best-effort) e fica como estava. A ordem pode
  inverter (a aprovada depois pode ganhar uma corrida de milissegundos) — declarado, não corrigido (exigiria trava
  entre o recebimento e a aprovação).
- **Nota × cancelamento/exclusão da requisição:** o cancelamento libera as reservas ATIVAS da requisição
  (`reservationService.js:173-204`) **no instante em que roda**; uma reserva criada pela chegada logo depois ficaria
  órfã numa requisição `CANCELADO`. Contrato: reler depois de reservar e desfazer (RN-09).
- **Dois cliques em processar:** a marca da 70 já serializa (409); a retomada após falha parcial roda o gancho de novo —
  idempotente pela régua (falta − hold).

### Surpresas da medição

1. **O e-mail da 70 promete o mesmo material a todos** (A2): 4 que chegaram anunciados a R1 (6) e a R2 (3). Com a
   reserva antes do aviso **e sem mudar o aviso**, o efeito seria o oposto: quem ganhou tudo **não receberia e-mail**
   (o critério desconta o hold do item). O aviso tem de mudar junto — T2.
2. **Liberar à mão uma reserva de requisição não recalcula o status** (B2): R3 fica `TOTALMENTE_RESERVADA` sem nada
   seguro. Anterior (Etapa 4). Não corrigido aqui (C127); a régua da chegada reserva de novo para ela na próxima nota.
3. **A inspeção que libera o material retido não reserva para quem esperava nem avisa** (D3/D4): T1 esperava, a
   inspeção aprovou os 4, T3 aprovada depois levou os 4. É a C121 por outra porta. Fora desta etapa (C126, candidata da 75).
4. **O painel de requisições abertas não lista as reservadas** (E1): `abertas` só tem `PENDENTE`, `APROVADO`,
   `EM_SEPARACAO`, `PARCIALMENTE_ATENDIDA`, `AGUARDANDO_*`, `PRONTA_PARA_RETIRADA`, `AGUARDANDO_APROVACAO_VALOR`. Desde a
   Etapa 4 a aprovada com reserva some do painel; esta etapa faria a requisição **sumir no momento em que o material
   chega**. Corrigido aqui (T4, B376).
5. **A spec 07 está desatualizada na tabela de regras** (`specs/modulo-almoxarifado/07-reservas/README.md`, linha
   *"Aprovação por valor sem saldo continua APROVADO (regressão)"*): o teste foi renomeado na 73 para *"[aprovar-valor]
   sem saldo nenhum vai a AGUARDANDO_ESTOQUE e não cria reserva (Etapa 73; era APROVADO)"*
   (`reservaPontasFaltantes.api.test.js:133`). Corrigir à vista no fechamento (T6), dizendo que estava errada.
6. **Recusa enganosa no estorno** (B1): *"material já consumido"* quando o saldo está só reservado. A literal é contrato
   da 71 e fica; a etapa evita o caso para as reservas **da chegada** (D8).

## Decisões reversíveis (letra B do documento de novidades; última usada: B366)

- **D1 (B367) — o gancho fica nos dois `concluir*`, depois de `fecharSolicitacoesDoPedido` e ANTES do aviso, dentro da
  marca de processamento, best-effort.** Falha vira `console.warn` com literal e a nota segue `PROCESSADO`/`APROVADO`.
  Descartados: (a) depois do aviso (o e-mail mentiria); (b) dentro de `darEntradaEstoque`, por item (rodaria antes do
  status terminal — uma nota recusada depois deixaria reserva de material que "não entrou"); (c) recusar a nota se a
  reserva falhar (a nota nunca deixa de entrar por causa de reserva).
- **D2 (B368) — "quem esperava" é a régua do aviso da 70** (`STATUS_QUE_ESPERAM`, por item, pendente − hold ATIVO do
  item > 1e-9), e "quanto falta" é a régua da reserva da aprovação (`pendenteEntrega` − hold ATIVO do item). `EM_SEPARACAO`
  fica de fora (a separação já está acontecendo, como na 70). Descartados: (a) só `AGUARDANDO_*` (deixaria de fora a
  `APROVADO` sem reserva da A37 e a `PARCIALMENTE_RESERVADA` que espera o resto); (b) incluir `EM_SEPARACAO` (o almoxarife
  está com ela; reservar no meio mudaria o máximo separável dela e dos outros sem ninguém pedir).
- **D3 (B369) — a ordem é a da fila de separação sem o "acionável": urgência (CRÍTICO > URGENTE > o resto) → data de
  necessidade (sem data por último) → criação mais antiga → número.** Uma função só, extraída da fila da 64 e usada
  pelas duas. Descartados: (a) data de aprovação (a fila não usa; duas réguas de "quem é primeiro"); (b) FIFO puro sem
  urgência (a CRÍTICA de linha parada esperaria a NORMAL antiga); (c) rateio proporcional (ninguém completa, todo mundo
  espera a próxima nota).
- **D4 (B370) — o teto é o que entrou LIVRE desta nota, por material, e o disponível na hora.** Para cada material da
  nota: `distribuível = min(soma do que entrou livre nesta nota, disponível do material lido agora)`; cada requisição,
  na ordem, leva `min(falta do item, distribuível restante)` por `criarReserva` (atômica — se perder para uma corrida,
  o item fica sem reserva e o laço segue). O retido para inspeção não entra (o aviso da 70 faz a mesma conta).
  Descartados: (a) o disponível global (a nota distribuiria saldo de ajuste/devolução que nada tem com ela); (b) reservar
  todos os itens da requisição como `reservarItensAprovacao` faz (a chegada de A reservaria B, que não chegou).
- **D5 (B371) — o status acompanha a reserva, e a máquina ganha as setas.** Depois de reservar, cada requisição tocada
  é recalculada: todo item com pendente de entrega tem hold ≥ pendente → `TOTALMENTE_RESERVADA`; algum hold →
  `PARCIALMENTE_RESERVADA`; `PARCIALMENTE_ATENDIDA` **mantém** o status (já passou da separação; o hold é consumido na
  entrega). `UPDATE ... WHERE id = ? AND status = <lido>` (não sobrescreve quem mexeu no meio). Setas novas em
  `TRANSICOES`: `AGUARDANDO_ESTOQUE`/`AGUARDANDO_COMPRA → PARCIALMENTE_RESERVADA/TOTALMENTE_RESERVADA`,
  `PARCIALMENTE_RESERVADA → TOTALMENTE_RESERVADA`, e para o estorno `PARCIALMENTE_RESERVADA/TOTALMENTE_RESERVADA →
  AGUARDANDO_ESTOQUE/AGUARDANDO_COMPRA/APROVADO/PARCIALMENTE_RESERVADA`. **Reabre a B362 de propósito** (agora há
  escritor fora das portas de aprovação). Descartados: (a) manter o status e só reservar (*"Aguardando compra"* com o
  material seguro — o rótulo mentiria ao contrário); (b) status por item (outra máquina).
- **D6 (B372) — a reserva da chegada é uma reserva de requisição comum, marcada com a nota.** Coluna nova
  `reservas_material_almoxarifado.recebimento_id INTEGER` (`safeAlter`), `origem = 'REQUISICAO'` (a entrega consome
  como qualquer outra), `requisicao_id`/`item_requisicao_id`, `data_necessidade` da requisição, `sistema: true`, dono =
  **quem processou a nota** (o `user` do `processarNota`/`aprovarRecebimento` — como a B361). Descartados: (a) marcar só
  pela observação em texto (o estorno teria de casar por texto); (b) dono = o solicitante da requisição (o motor grava a
  trilha com o `user` da chamada; um "usuário de outro" na trilha seria falso).
- **D7 (B373) — o e-mail da 70 conta a reserva.** O "pendente" do aviso não desconta o hold criado **por esta nota**
  (desconta os demais, como hoje); cada linha de material ganha *"reservado para a sua requisição: N"* quando N > 0, e a
  frase final passa a ter três formas (contrato). Recebe o e-mail quem ganhou reserva nesta nota **ou** ainda tem
  saldo livre daquele material para separar; quem esperava e não ganhou nada, com o saldo todo reservado a outras, **não**
  recebe (será avisado na próxima nota). O aviso da nota (à lista de Compras) não muda. Descartados: (a) manter o
  e-mail como está (diria *"ainda não está reservado"* a quem ganhou, e não sairia para quem ganhou tudo — Surpresa 1);
  (b) avisar todos os que esperavam (prometeria material que foi para outra requisição — o defeito medido em A2).
- **D8 (B374) — o estorno da entrada libera a reserva que a própria nota criou, só o necessário.** No motor, antes do
  claim do estorno de `ENTRADA_COMPRA` com `recebimento_id`: se o disponível não cobre a quantidade e **o disponível +
  o saldo das reservas da chegada desta nota (deste material)** cobre, libera dessas reservas só o que falta, **da última
  na ordem de prioridade para a primeira**; se nem assim cobre, não toca em nada e a recusa é a de hoje (literal da 71
  inalterada). Depois do estorno (dê certo ou não), o status das requisições que perderam reserva é recalculado (com o
  pedido já reaberto, para `AGUARDANDO_COMPRA` contar a compra que volta a vir). Reservas de outras origens (aprovação,
  manual) **nunca** são tocadas pelo estorno. Descartados: (a) recusar o estorno com literal nova pedindo para liberar
  à mão (operação manual a cada estorno, e liberar à mão deixa o status mentindo — Surpresa 2); (b) liberar todas as
  reservas da chegada (tiraria de quem não precisava perder); (c) recriar as reservas se o estorno falhar depois de
  liberar (compensação sem transação; o estado "liberado" é o de antes desta etapa — declarado).
- **D9 (B375) — material de cliente: a chegada reserva como a aprovação, sem olhar o dono** (C124 passa a valer também
  aqui). Descartado: só a chegada respeitar o dono (a aprovação feita depois, sem OS, levaria o mesmo material — o
  contrário do que a etapa quer).
- **D10 (B376) — o painel de requisições abertas inclui `PARCIALMENTE_RESERVADA` e `TOTALMENTE_RESERVADA`.** Descartado:
  deixar como está (a requisição sumiria do painel exatamente quando o material chega).
- **D11 (B377) — sem correção do passado.** Requisições que esperavam antes do deploy ganham reserva na **próxima** nota
  do material; nada retroativo. Descartado: reservar no boot o saldo livre para quem espera (disputa saldo que pode ter
  dono informal; a B364 pelo mesmo motivo).

## Regras de negócio

- **RN-01 (quem esperava fica com o que chegou)** — material sem saldo; R1 (6) aprovada → `AGUARDANDO_*`; nota de 4
  processada → **uma reserva ATIVA de 4 para o item de R1**, com `recebimento_id` da nota e `origem = 'REQUISICAO'`; R1
  `PARCIALMENTE_RESERVADA`; disponível 0. *Metade positiva:* R3 (4) aprovada **depois** pelo `/aprovar` →
  `AGUARDANDO_*`, `reservas: []`; `PUT /separar` de 4 em R1 → 200; em R3 → 400 *"… Máximo: 0 …"*.
- **RN-02 (a ordem é a da fila)** — R1 NORMAL (criada antes, 6), R2 URGENTE (criada depois, 3); nota de 4 → R2 leva 3
  (`TOTALMENTE_RESERVADA`), R1 leva 1 (`PARCIALMENTE_RESERVADA`). Mesma urgência: a de `data_necessidade` mais cedo
  primeiro; sem data, a criada antes. *Positiva da régua única:* a ordem de `GET /fila-separacao` antes da nota é a
  mesma ordem em que as reservas foram dadas.
- **RN-03 (o retido não se reserva)** — material crítico com `inspecao_material_critico = '1'`, R espera; nota de 4 →
  nenhuma reserva, R continua `AGUARDANDO_*`, `quantidade_em_inspecao` 4. *Positiva:* na mesma nota, um material comum
  esperado por outra requisição é reservado.
- **RN-04 (só o que esta nota trouxe)** — R espera 10; nota de 4 → reserva 4 (não mais). R' espera 3; nota de 10 →
  reserva 3; sobram 7 livres e uma requisição aprovada depois reserva desses 7. Material com saldo livre prévio de 2
  (entrada manual depois da aprovação de R) e nota de 4 → reserva 4 (não 6).
- **RN-05 (a aprovação automática não toma mais)** — `aprovacao_automatica = '1'`; Q1 (5) esperando; nota de 5 → Q1
  `TOTALMENTE_RESERVADA` com a reserva de 5; Q2 (5) criada depois → resposta e banco `AGUARDANDO_*`, nenhuma reserva.
- **RN-06 (o status acompanha)** — `AGUARDANDO_COMPRA` com tudo coberto → `TOTALMENTE_RESERVADA`; requisição de dois
  materiais `PARCIALMENTE_RESERVADA` (A reservado na aprovação, B esperando) → chega B → `TOTALMENTE_RESERVADA`;
  `PARCIALMENTE_ATENDIDA` ganha a reserva e **mantém** o status; `APROVADO` sem reserva (legado A37) → `*_RESERVADA`.
  *Negativa:* `EM_SEPARACAO` não ganha reserva; `CANCELADO`/`REJEITADO`/`ativo = 0` não ganham.
- **RN-07 (best-effort)** — `criarReserva` forçado a lançar (monkeypatch pelo objeto do módulo) → `/processar` 200,
  recebimento `PROCESSADO`, estoque creditado, nenhuma reserva órfã, `console.warn` com a literal do contrato, o aviso
  sai (com a frase de "ainda não está reservado"). O mesmo no ramo direto (`POST /recebimentos/:id/aprovar`).
- **RN-08 (idempotente)** — retomada de nota após falha parcial (o molde de `recebimentoAvisoEntradaRotas` RN-03) → a
  segunda passada não reserva em dobro (soma das reservas do item ≤ falta); dois `processar` simultâneos → [200, 409] e
  um só conjunto de reservas.
- **RN-09 (cancelada no meio)** — pelo serviço, determinístico: a requisição é cancelada entre a leitura de quem espera
  e a reserva (monkeypatch de `criarReserva` que cancela antes de delegar) → a reserva criada é desfeita (`LIBERADA`),
  nenhum hold ATIVO de requisição `CANCELADO`, disponível de volta.
- **RN-10 (o e-mail diz a verdade)** — com `usuarios`: R2 ganhou 3 de 3 → linha *"entrou 4 PC (pendente na requisição:
  3 PC; reservado para a sua requisição: 3 PC)"* e a frase final **L1**; R1 ganhou 1 de 6 → linha com *"reservado …: 1
  PC"* e **L1**; requisição de dois materiais em que um ganhou e o outro não (saldo livre sobrando) → **L2**; nota cuja
  reserva falhou (RN-07) → a literal de hoje (**L0**). *Negativa:* R4 esperava, a nota foi toda para R1/R2 e não sobrou
  nada livre → **nenhum** e-mail para R4.
- **RN-11 (o estorno desfaz o que a nota fez)** — nota de 4 reservada a R1; estorno da `ENTRADA_COMPRA` (`POST
  /movimentacoes/:id/cancelar`) → 200; a reserva de R1 `LIBERADA` com o motivo do contrato; R1 volta a
  `AGUARDANDO_COMPRA` (o pedido reabriu) ; saldo 0; nenhum hold ATIVO. *Só o necessário:* nota de 4 reservada 3 a R2 e
  1 a R1, mais 3 livres de entrada manual → estorno libera só 1, **de R1** (a última na ordem); R2 intacta. *Negativa:*
  os 4 reservados a R3 pela aprovação (não pela chegada) → 400 com a literal de hoje, nada liberado. *Negativa:* R1 já
  entregou 2 dos 4 (reserva parcialmente consumida) e não há outro saldo → 400 com a literal de hoje, reservas intactas.
- **RN-12 (corrida nota × aprovação)** — `Promise.all([processar a nota de 4, /aprovar de R3 (4)])`, R1 (4) esperando,
  6 rodadas com material novo: soma das reservas ATIVAS ≤ 4; nenhuma requisição `*_RESERVADA` sem hold; nenhuma
  `APROVADO` sem hold; o status respondido pelo `/aprovar` é o gravado. (Quem leva pode variar — declarado.)
- **RN-13 (o painel não perde a reservada)** — `GET /api/almoxarifado/dashboard/requisicoes` → `abertas` contém
  requisição `TOTALMENTE_RESERVADA` e `PARCIALMENTE_RESERVADA` (ordem de sempre: urgência, criação).
- **RN-14 (material de cliente — preso como está)** — material com `proprietario_cliente_id`, requisição sem OS
  esperando → a chegada reserva (como a aprovação, C124); a entrega continua exigindo a OS do cliente (regra do dono na
  saída, inalterada).

## Contrato (congelado)

### Serviço novo — `services/almoxarifado/reservaChegadaService.js` (T1)

Requer no topo: `./db`, `./stockService`, `./requisitionStateMachine`, `./requisitionService` (pelo **objeto** do
módulo — os testes fazem monkeypatch de `stockService.criarReserva`). Ninguém do lado deles o requer no topo
(`receiptService` o requer no topo; `stockService` o requer **lazy**, dentro do estorno). Carga fria nas duas ordens.

```
reservarChegadaParaQuemEspera(db, user, recebimentoId)
  -> { reservas: [{ requisicao_id, item_id, material_id, reserva_id, quantidade }],
       status: [{ requisicao_id, de, para }] }
```
1. Itens da nota com `entrada_estoque_em IS NOT NULL`, quantidade pelo `QTD_DO_ITEM_SQL` (o da 70, exportado de
   `receiptNotificationService`), **livre** = os de `COALESCE(quantidade_em_inspecao,0) <= 1e-9`; soma por material.
2. Por material com livre > 1e-9: `distribuivel = min(livre, disponível do material agora)` (`disponivelSql`).
3. Candidatos: itens de requisições ativas em `STATUS_QUE_ESPERAM` desse material com `falta = pendenteEntrega −
   reservado ATIVO do item (origem REQUISICAO)` > 1e-9, ordenados por `requisitionService.compararPrioridade` (T0).
4. Para cada um, enquanto `distribuivel > 1e-9`: `q = min(falta, distribuivel)`; `stockService.criarReserva(db, user,
   { material_id, quantidade: q, projeto_id, os_id, os_referencia, cliente_id, data_necessidade, observacoes:
   'Reserva na chegada do recebimento <REC> — requisição <REQ>' }, { sistema: true, requisicao_id, item_requisicao_id,
   recebimento_id, motivo: 'Reserva na chegada — recebimento <REC>' })`. Falha de um item → `console.warn('[almoxarifado-
   reservas] Falha ao reservar na chegada o item <id> da requisição <id>: <msg>')` e segue. Sucesso → `distribuivel -= q`.
5. **Releitura (RN-09):** depois de cada reserva, `SELECT status, ativo` da requisição; se não está mais em
   `STATUS_QUE_ESPERAM` ou `ativo = 0` → `liberarReserva` dela com `motivo: 'Requisição saiu da espera durante a
   reserva na chegada'`, `motivoMovimentacao: 'Liberação de reserva na chegada desfeita'`, e devolve `q` ao distribuível.
6. Status (D5): por requisição tocada, `recalcularStatusDeReserva(db, requisicaoId)` (exportada; usada também pelo
   estorno): lê itens e holds; `PARCIALMENTE_ATENDIDA` não muda; senão TOTAL/PARCIAL pelos holds, ou — sem hold
   nenhum — `calcularStatusPosAprovacao` (`AGUARDANDO_*`/`APROVADO`); grava com `UPDATE ... WHERE id = ? AND status =
   <lido>` só se mudou.

Erro de banco fora do try por item **lança** (quem chama engole). Não grava auditoria nova (a trilha é a movimentação
`RESERVA` que o motor já grava).

### Gancho no recebimento (T1) — `receiptService.js`

```
async function reservarChegadaSemFalhar(db, user, recebimentoId) {
  try { await reservaChegadaService.reservarChegadaParaQuemEspera(db, user, recebimentoId); }
  catch (e) { console.warn(`[recebimento] reserva na chegada falhou (recebimento ${recebimentoId}): ${e.message}`); }
}
```
Chamado em `concluirProcessamentoNota` e `concluirAprovacaoDireta` **imediatamente antes** de
`avisarEntradaConfirmadaSemFalhar`. Respostas de `/processar`, `/workflow processar` e `/aprovar` **inalteradas**
(nenhuma chave nova).

### Motor (T0)

- `stockService.criarReserva`: grava `opcoes.recebimento_id || null` na coluna nova (só pelo 4º argumento — nunca do
  body, mesmo motivo de `requisicao_id`).
- `schema.js`: `safeAlter('ALTER TABLE reservas_material_almoxarifado ADD COLUMN recebimento_id INTEGER')`, junto das
  colunas da Etapa 4, com comentário (Etapa 74, B372).
- `requisitionStateMachine.TRANSICOES`: as setas da D5. `PODE_SEPARAR`/`PODE_ENTREGAR` **inalterados**.
- `requisitionService.compararPrioridade(a, b)` (nova, exportada): urgência (`UPPER`, CRITICO 1, URGENTE 2, resto 3) →
  `data_necessidade` (nula por último) → `created_at` → `id`. `listarFilaSeparacao` passa a ordenar por
  `(b.acionavel − a.acionavel) || compararPrioridade(a, b)` — **mesma ordem de hoje** (os testes da 64 passam sem edição).

### Aviso da 70 (T2) — `receiptNotificationService.js`

- Na consulta de quem espera (`:214-225`), o hold descontado do pendente passa a excluir `rs.recebimento_id = <esta
  nota>`; a consulta traz também `reservado_nesta_nota` por item (soma das reservas ATIVAS ou já consumidas com
  `recebimento_id = <esta nota>` do item).
- Avisáveis: requisições com material que entrou livre **e** (`reservado_nesta_nota > 1e-9` em algum material **ou**
  disponível atual do material > 1e-9).
- `montarAvisoRequisitante(dados)`: `materiais[i].reservado` (número, 0 quando não houve). Linha com reserva:
  `- <cod> — <nome>: entrou <q un> (pendente na requisição: <p un>; reservado para a sua requisição: <r un>)`; sem
  reserva: a linha de hoje. Frase final:
  - **L1** (todo material listado com `reservado > 0`): `O material indicado como reservado fica guardado para a sua
    requisição — outra requisição não pode levá-lo. A separação é feita pelo almoxarifado.`
  - **L2** (algum com e algum sem): `Só o material indicado como reservado fica guardado para a sua requisição; o
    restante ainda não está reservado — a separação é feita pelo almoxarifado.`
  - **L0** (nenhum): a literal de hoje, `O material ainda não está reservado para a sua requisição — a separação é feita
    pelo almoxarifado.`
- Assunto, dedupe, payload, link e o aviso da nota (`montarAvisoNota`): **inalterados**.

### Estorno (T3) — `stockService.cancelarMovimentacao` + `reservaChegadaService.liberarParaEstorno`

`liberarParaEstorno(db, user, mov) -> requisicaoIds[]` (exportada), chamada **lazy** no motor quando `mov.tipo ===
'ENTRADA_COMPRA' && mov.recebimento_id`, **depois** das guardas de inspeção/reprovado/série e **antes** do claim:
1. `disp` = disponível do material; se `disp >= mov.quantidade − 1e-9` → `[]`.
2. Reservas ATIVAS com `recebimento_id = mov.recebimento_id AND material_id = mov.material_id`, saldo `q − utilizada`,
   em ordem **inversa** de `compararPrioridade` das requisições; se `disp + Σsaldo < mov.quantidade − 1e-9` → `[]`
   (a recusa de hoje acontece no ramo de entrada, intacta).
3. Libera, uma a uma, `min(saldo, falta)` com `liberarReserva(..., qtd, { statusFinal: 'LIBERADA', motivo: 'Estorno da
   entrada do recebimento <REC>', motivoMovimentacao: 'Liberação por estorno da entrada' })` até cobrir.
4. Devolve os ids das requisições tocadas. O motor, **depois** de `estornarEntradaNoPedido` (sucesso) **ou** no caminho
   de erro (antes de relançar), chama `recalcularStatusDeReserva` para cada uma, em try/`console.warn('[almoxarifado]
   recalculo do status apos estorno falhou (requisicao <id>): <msg>')`.
Resposta do estorno **inalterada** (`{ success, estorno_id, pedido_compra? }`); literais de recusa **inalteradas**.

### Painel (T4) — `routes/almoxarifado.js:4033-4034`

A lista `IN (...)` de `abertas` ganha `'PARCIALMENTE_RESERVADA','TOTALMENTE_RESERVADA'`. Nada mais (contagens, ordem,
`LIMIT 5`, chaves da resposta) muda.

### O que não muda (contratos que não se reabrem)

A fila de separação 64 (resposta e ordem — só a função de ordem é extraída); o livro de atribuição da solicitação (72);
o pedido que reabre no estorno (71) e as literais de recusa do estorno; o pós-aprovação único das três portas e a reserva
idempotente da aprovação (73); o motor de reserva (`criarReserva`/consumo contra reserva, Etapa 4) além da coluna nova;
o assunto, o dedupe e o aviso da nota da 70; o cliente inteiro.

## Tasks

Ordem topológica: **T0 → T1 → T2 → T3** (tronco, sequenciais: todas mudam produção do servidor e sabotam para o
controle positivo); **T4** (galho, worktree) **em paralelo à T2**; **T5** (integração) depois de T3 e T4; **T6**
fechamento.

**Regras de paralelismo desta etapa (G84 da 72, mantida na 73):**
- **Dois agentes nunca no mesmo arquivo.** T0: `schema.js`, `stockService.js` (só `criarReserva`),
  `requisitionStateMachine.js`, `requisitionService.js`. T1: `reservaChegadaService.js` (novo), `receiptService.js`.
  T2: `receiptNotificationService.js`. T3: `stockService.js` (só `cancelarMovimentacao`) e `reservaChegadaService.js`.
  T4: só `routes/almoxarifado.js` e um teste novo. T5: só um teste novo.
- **Executor que sabota produção não roda junto com outro que roda a suíte na mesma árvore.** T0–T3 são sequenciais na
  árvore principal. **T4 vai numa worktree própria** (junction de `node_modules`, memória do projeto) — a sabotagem
  dela (tirar o status da lista) só existe na worktree, e a worktree tem o próprio SQLite de teste; por isso roda junto
  com a T2. Não roda junto com a T3: a T3 sabota o motor de estoque, e a regra conservadora é uma sabotagem de motor
  por vez no repositório.
- **A revisão adversarial (Fase 5) só começa com a árvore quieta** (T5 commitada, worktree da T4 removida).
- Scratchpad com nome único por agente (`msg-e74-t1.txt`, `bak-e74-t3-stock.js`...).
- Executores **não** marcam este plano; o fio principal marca.

- [x] **T0 (tronco) — a base: coluna, setas, ordem.** — **FEITA `5462b68c`** (teste novo 8/8; controles: body
  forjando `recebimento_id` cai o [a]; sem urgência caem os dois [c] e o "Ordem" da 64; carga fria nas duas ordens ok;
  suíte 276/276 + 44 + 4 + 3 + 5). Divergência: o teste da 64 se chama `filaSeparacao.api.test.js` (não
  `requisicaoFilaSeparacao*`) — passou sem edição. Produção pelo contrato "Motor (T0)". Teste novo
  `server/tests/api/reservaChegadaBase.api.test.js`: (a) `criarReserva` com `opcoes.recebimento_id` grava a coluna; pelo
  `POST /reservas` com `recebimento_id` no **body** a coluna fica `NULL` (não forjável); (b) `validarTransicao` aceita
  cada seta nova e continua recusando `AGUARDANDO_ESTOQUE → ENTREGUE`; (c) `compararPrioridade` com 5 requisições
  (CRITICO nova, URGENTE, NORMAL com necessidade cedo, NORMAL sem data antiga, `urgente` minúsculo legado) dá a ordem
  esperada, e `GET /fila-separacao` com as mesmas devolve a mesma ordem. **Medir antes:** `requisicaoFilaSeparacao*`
  passa **sem edição**. Controles positivos: (1) `criarReserva` lendo `data.recebimento_id` → (a) cai; (2) tirar a
  urgência de `compararPrioridade` → (c) e um teste da 64 caem; (3) carga fria `node -e` de `requisitionService` e de
  `stockService` sem ciclo.
- [x] **T1 (tronco) — a reserva na chegada.** — **FEITA `63e377e1`** (teste novo 23/23; 10 controles positivos,
  cada um derrubando a asserção certa — teto global, ordem por criação, sem releitura, falta sem o hold, gancho sem try,
  EM_SEPARACAO fora, sem pulo de valor, sem pulo do dono, sem desfazer o excesso, recálculo sem a máquina; suíte
  277/277 + 44 + 4 + 3 + 5). **Divergências:** (a) a produção do aviso (contrato da T2) entrou NESTE commit — com o
  gancho e sem ela caíram 7 asserções da 70 (`recebimentoAvisoEntradaIntegracao` A/B e `recebimentoAvisoEntradaRotas`
  RN-01/RN-02), a Surpresa 1 medida; nenhum commit fica vermelho. (b) asserções revogadas à vista:
  `requisicaoEsperaCompraIntegracao` jornada 2 e 3 (RN-08 da 73) e `recebimentoAvisoEntradaIntegracao` (B) :221-228 e
  :257 (D4 da 70); nenhum outro teste caiu. (c) RN-14 revista pela Fase 2: a regra do dono espelha a ENTREGA, que só
  leva `projeto_id` (a tabela de requisições não tem `os_id`). (d) RN-08: o controle "sem a régua idempotente" só
  derruba com saldo sobrando (o teste foi montado assim) — com disponível 0 o teto já protegia. `reservaChegadaService.reservarChegadaParaQuemEspera` +
  `recalcularStatusDeReserva` + o gancho nos dois `concluir*`, pelo contrato. Teste novo
  `server/tests/api/recebimentoReservaChegada.api.test.js`, **pelas rotas** (nota pelas seis portas do recebimento, e o
  ramo direto `POST /recebimentos/:id/aprovar`): RN-01, RN-02, RN-03, RN-04, RN-05, RN-06, RN-07 (as duas portas),
  RN-08, RN-14; **e pelo serviço**: RN-09 (determinístico) e uma chamada direta de `reservarChegadaParaQuemEspera` numa
  nota sem nenhum item com entrada (devolve vazio, não lança). **Medir antes e citar no commit** as asserções que mudam
  (Fase 0 §7): `recebimentoAvisoEntradaIntegracao.api.test.js:257` e `requisicaoEsperaCompraIntegracao.api.test.js:200-231`
  (RN-08 da 73 deixa de valer: a chegada reserva — **revogada à vista**, com o motivo, não apagada); rodar a suíte inteira
  com o gancho e listar qualquer outro que cair (achado vai ao plano). Controles positivos: (1) sem o teto do livre da
  nota (usar o disponível global) → RN-04 cai; (2) ordem só por `created_at` → RN-02 cai; (3) sem a releitura → RN-09 cai com hold órfão; (4)
  sem a régua idempotente (não descontar o hold) → RN-08 cai com reserva em dobro; (5) sem o `try` do gancho → RN-07
  cai com 500; (6) `STATUS_QUE_ESPERAM` com `EM_SEPARACAO` → a negativa da RN-06 cai.
- [x] **T2 (tronco) — o e-mail diz a verdade.** — **FEITA**: produção em `63e377e1` (ver T1), testes de rota
  `21f9306b` (5/5) + L0/L1/L2 da função pura em `recebimentoAvisoEntrada` (`:144`/`:318` sem edição). Controles: hold
  desta nota descontado → 4 caem; sem filtro das linhas → R4 recebe; L1 trocada → cai (rota e pura). Suíte 278/278. `receiptNotificationService` pelo contrato. Testes: em
  `recebimentoAvisoEntrada.api.test.js` (função pura) as três frases L0/L1/L2 e a linha com *"reservado para a sua
  requisição"* — as duas asserções de `:144,:318` **continuam** (são o caso L0) sem edição; teste novo
  `server/tests/api/recebimentoReservaChegadaAviso.api.test.js` pelas rotas com `usuarios`: RN-10 inteira (L1 para quem
  ganhou tudo **e** para quem ganhou parte; L2; L0 com a reserva forçada a falhar; R4 sem e-mail). Controles: (1) voltar
  a descontar o hold desta nota → quem ganhou tudo fica sem e-mail (RN-10 cai); (2) sem o filtro de avisáveis → R4
  recebe (cai); (3) literal trocada → cai. Suíte do servidor inteira.
- [x] **T3 (tronco) — o estorno desfaz o que a nota fez.** — **FEITA `9af1691a`** (teste novo 9/9, inclui o
  `/encerrar` e o `/rejeitar-valor` da Fase 2; os testes da 71 passaram sem edição; controles: liberar tudo, sem o
  filtro de `recebimento_id`, sem recálculo, recálculo antes do pedido reabrir, sem o filtro "nada separado",
  `/encerrar` e `/rejeitar-valor` sem liberar — todos caem na asserção certa; suíte 279/279 + 44 + 4 + 3 + 5).
  **Divergência:** o controle "sem o filtro nada separado" passou no primeiro teste (EM_SEPARACAO já fica fora pela
  lista de status) — acrescentado o caso PARCIALMENTE_ATENDIDA com 2 na caixa, que cai. `liberarReservasDaRequisicao`
  ganhou `opcoes.motivoMovimentacao` (o livro diz "encerramento"/"rejeição de valor", não "cancelamento"). `liberarParaEstorno` + as duas chamadas no motor, pelo
  contrato. Teste novo `server/tests/api/recebimentoReservaChegadaEstorno.api.test.js`, pela rota `POST
  /movimentacoes/:id/cancelar`: RN-11 inteira (as duas negativas com a literal de hoje lida do código, e o "só o
  necessário, da última na ordem"). **Medir antes** que os testes da 71 (`recebimentoEstorno*`, `estornoEntrada*` —
  `grep -ln "movimentacoes/.*cancelar" tests/api`) passam sem edição. Controles: (1) liberar todas as reservas da chegada
  → o "só o necessário" cai; (2) liberar também reservas sem `recebimento_id` → a negativa de R3 cai; (3) sem o
  recálculo do status → R1 fica `PARCIALMENTE_RESERVADA` sem hold e cai; (4) recalcular **antes** do
  `estornarEntradaNoPedido` → R1 vai a `AGUARDANDO_ESTOQUE` e cai (prova a ordem).
- [x] **T4 — o painel não perde a reservada.** — **FEITA `00a5ff18`** no tronco, sequencial (Fase 2), sem worktree
  (teste RN-13 novo; os 5 de lá sem edição; controle: sem TOTALMENTE_RESERVADA → cai; suíte 279/279). Comentário de
  `RequisicoesList.js:168` (item da T6) feito em `e96b7392` — client 74 suítes/1155 testes, build CI ok.
- (texto original da T4:) **T4 (galho, worktree, em paralelo à T2) — o painel não perde a reservada.** Pelo contrato. Teste no
  `requisicaoDashboard.api.test.js` (RN-13), os de lá sem edição. Controle: tirar `TOTALMENTE_RESERVADA` da lista → cai.
  Commit na branch da worktree; o fio principal faz o merge depois da T2.
- [ ] **T5 (integração, cruza T1 × T2 × T3 × T4) — a jornada de quem espera.** Arquivo
  `server/tests/api/recebimentoReservaChegadaIntegracao.api.test.js`, só pelas portas reais: material com mínimo →
  `verificar-minimos` → pedido com `solicitacao_id` → R1 (NORMAL, 6) e R2 (URGENTE, 3) aprovadas → `AGUARDANDO_COMPRA` →
  nota de 4 de 10 pelas seis portas → R2 `TOTALMENTE_RESERVADA` (3), R1 `PARCIALMENTE_RESERVADA` (1), e-mails L1 nos
  dois → R3 aprovada depois → `AGUARDANDO_COMPRA` sem reserva, e `GET /dashboard/requisicoes` lista R1 e R2 →
  `GET /fila-separacao`: R2 e R1 `SEPARAR`, R3 `AGUARDANDO_SALDO` → separar e entregar R2 → a reserva de R2 `CONSUMIDA`
  (a entrega consome a reserva da chegada como a da aprovação) → nota de 6 → R1 recebe os 5 que faltam
  (`TOTALMENTE_RESERVADA`), R3 recebe 1 → separar/entregar R1. **Segundo cenário (estorno):** R1 esperando, nota de 4
  reservada a R1 → estorno da entrada → 200, reserva `LIBERADA`, R1 `AGUARDANDO_COMPRA`, pedido reaberto
  (`pedido_compra.reaberto`/`situacao_depois`), solicitação de volta a `VINCULADO`; nova nota de 4 → R1 reservada de novo.
  **Terceiro (automática):** RN-05 pelas rotas, com o painel. Controles positivos: (s1) gancho desligado (comentar a
  chamada nos dois `concluir*`) → a jornada cai na primeira asserção de reserva; (s2) ordem só por criação → cai em
  R2/R1; (s3) estorno sem `liberarParaEstorno` → o segundo cenário cai com a literal *"material já consumido"*; (s4) a
  entrega sem consumir reserva com `recebimento_id` não existe como sabotagem (o motor não distingue) — no lugar,
  conferir pela trilha que a movimentação de entrega cita o `reserva_id` da chegada. Só roda com a T4 já mergeada.
- [ ] **T6 — fechamento (skill `fechar-etapa`).** Novidades: seção da 74 (Antes → Agora, cenários com as literais
  lidas do código, o que não cobre); **B367–B377**; **C121 marcado resolvido**; **C124** ganha "vale também na
  chegada"; **C126** (a inspeção que libera não reserva nem avisa — Surpresa 3, candidata da 75), **C127** (liberar à
  mão não recalcula o status — Surpresa 2), **C128** (o que muda para quem opera: a requisição muda de status quando a
  nota chega; o e-mail; o estorno libera; quem integra e lia `AGUARDANDO_*` estável); D (74); F (74); **RN-08 da 73
  revogada à vista**. Spec 07 (cabeçalho, item novo "Reserva na chegada para quem esperava" com os hashes, a linha da
  tabela de regras **corrigida dizendo que estava errada** — Surpresa 5 — e as linhas novas da tabela); spec 04 (status:
  setas novas); spec 08 (o gancho); mapa (linhas 04, 07, 08); guia (cabeçalho "74 ENTREGUE · 75 começando", seção da 74
  com roteiro: aprovar sem saldo → processar nota → a requisição vira *Parcialmente/Totalmente reservada* → aprovar
  outra → fica esperando; estorno → volta); manual (9.3 reservas: a chegada; 10.1 o e-mail). Retro de 4 números.
  **Próxima tarefa detalhada — Etapa 75** (candidata: C126, a inspeção que libera reserva para quem esperava, com o
  aviso da 70 — o mesmo gancho, por outra porta).

## O que fica de fora (declarado — e por quê)

- **A inspeção que libera o retido não reserva nem avisa** (Surpresa 3, C126): outra porta, com outro gancho
  (`inspectionService.decidirInspecao`) e as regras de reprovação/NC no caminho — Etapa 75.
- **Entradas que não são nota** (ENTRADA manual, devolução, transferência, ajuste, retorno de terceiro): o gatilho
  desta etapa é a nota de compra que alguém esperava; as outras não têm "quem esperava" ligado a elas.
- **Liberar reserva à mão não recalcula o status** (Surpresa 2, C127): anterior, outra rota; a chegada se autocorrige.
- **Trava entre o recebimento e a aprovação** (corrida, Fase 0 §8): a ordem pode inverter numa corrida de
  milissegundos; sem transação, fica para a migração Postgres.
- **Recriar a reserva quando o estorno falha depois de liberar** (D8 (c)).
- **Backfill** (D11).
- **Tela nova ou coluna "reservado na chegada" na tela de Reservas**: a observação da reserva já diz a nota.

## Letra A — consulta para produção (candidata A38, a confirmar no fechamento)

Antes do deploy, o tamanho do que vai mudar na primeira nota de cada material:
```sql
-- requisicoes que esperam hoje, por material, com o que falta (a regua D2)
SELECT ir.material_id, r.id, r.numero, r.status, r.urgencia, r.created_at,
  MAX(0, COALESCE(ir.quantidade_solicitada,0) - COALESCE(ir.quantidade_entregue, ir.quantidade_atendida, 0)) -
  COALESCE((SELECT SUM(x.quantidade - COALESCE(x.quantidade_utilizada,0)) FROM reservas_material_almoxarifado x
            WHERE x.item_requisicao_id = ir.id AND x.status = 'ATIVA' AND x.origem = 'REQUISICAO'), 0) AS falta
FROM itens_requisicao_almoxarifado ir JOIN requisicoes_almoxarifado r ON r.id = ir.requisicao_id
WHERE COALESCE(r.ativo,1) = 1
  AND r.status IN ('APROVADO','AGUARDANDO_ESTOQUE','AGUARDANDO_COMPRA','PARCIALMENTE_RESERVADA','TOTALMENTE_RESERVADA','PARCIALMENTE_ATENDIDA')
ORDER BY ir.material_id, r.created_at;
```

## Divergências do plano (registradas, não escondidas)

1. **A produção do aviso (T2) entrou no commit da T1** (`63e377e1`): o gancho sem o aviso derrubava 7 asserções da 70.
2. **A regra do dono espelha a entrega** (só `projeto_id`): `requisicoes_almoxarifado` não tem `os_id`; a reserva da
   chegada também grava `os_id` NULL (como a da aprovação).
3. **Literais novas não previstas no contrato:** excesso desfeito → motivo `Reserva na chegada acima do pendente —
   excesso desfeito`; liberação na chegada (RN-09 e excesso) → livro `Liberação de reserva na chegada desfeita`;
   falha de liberação → `[almoxarifado-reservas] Falha ao desfazer a reserva <id> da chegada: <msg>`; recálculo na
   chegada falhou → `[almoxarifado-reservas] recalculo do status apos a reserva na chegada falhou (requisicao <id>): <msg>`;
   estorno sem conseguir liberar → `[almoxarifado] liberacao das reservas da chegada no estorno falhou (movimentacao <id>): <msg>`;
   `/encerrar` → `Requisição encerrada` / `Liberação por encerramento de requisição`; `/rejeitar-valor` →
   `Requisição rejeitada por valor` / `Liberação por rejeição de valor da requisição`.
4. **O recálculo da chegada roda num `finally`**: mesmo com erro de banco no meio, as requisições já tocadas têm o
   status recalculado antes de relançar.
5. **O e-mail não vai a EM_SEPARACAO** (a lista da 70 fica), embora ela ganhe reserva na chegada — declarado.
6. **O estorno também recalcula no claim perdido** (duplo clique): a liberação já aconteceu antes do claim.

## Fase 2 — revisão do plano: 2 críticos, 9 importantes, 9 menores → plano revisto (vale sobre o texto acima)

- **CRÍTICO — o recálculo de status ignorava a máquina** (sonda `sonda74r-orfas.js`): (a) requisição cancelada no meio
  "tocada" → gravava `AGUARDANDO_ESTOQUE` sobre `CANCELADO` (ressuscitava); (b) estorno numa `EM_SEPARACAO` →
  regressão para `AGUARDANDO_*` com separado > 0. → **o recálculo só parte de {APROVADO, AGUARDANDO_*, *_RESERVADA}** e
  grava só se `validarTransicao(lido, novo)` aceitar, com `WHERE status = <lido>`.
- **IMPORTANTE — "tocada" indefinida**: → tocada = **ficou com ≥ 1 reserva VIVA desta chamada**; sem hold, o status
  NÃO muda (o banner "Chegou material… não está reservado" continua verdadeiro no caso "a reserva falhou").
- **IMPORTANTE — o e-mail L2 prometia material de outra requisição**: → as LINHAS do aviso também são filtradas: só
  material com `reservado > 0` para esta requisição ou com disponível livre > 0.
- **IMPORTANTE — duas notas do mesmo material (ou nota × `/aprovar-valor`) reservam em dobro**: → a falta é **relida
  imediatamente antes de cada `criarReserva`**, e depois relê a soma dos holds ATIVOS do item: se passar do pendente,
  libera o excesso da reserva que esta chamada criou.
- **IMPORTANTE — reservas presas em status terminal** (sonda): `/encerrar` (PARCIALMENTE_ATENDIDA → ENCERRADA) e
  `/rejeitar-valor` (→ REJEITADO) não liberam reservas (anterior à 74, mas a 74 passa a criar o hold sozinha). →
  **T3 corrige os dois**: liberam as reservas ATIVAS `origem='REQUISICAO'` da requisição (molde do cancelamento).
- **IMPORTANTE — liberação por valor**: candidato cuja avaliação de valor AO VIVO bloqueia (`avaliarRequisicaoValor`,
  a mesma da fila da 64) é **pulado** na chegada (não reserva o que vai ficar preso); `AGUARDANDO_APROVACAO_VALOR` fica
  fora (já não está em `PODE_SEPARAR`) — declarado (letra B/C).
- **IMPORTANTE — estorno (B374)**: (a) só libera reservas da chegada de requisições em `STATUS_QUE_ESPERAM` **sem nada
  separado**; se o que pode ser liberado não cobrir o estorno, a recusa de hoje (sem mexer em quem já separou); (b) o
  duplo clique (liberar antes do claim) → declarado (C), não corrigido; (c) reservas por recebimento+material, não por
  movimentação → declarado.
- **IMPORTANTE — material de cliente**: candidato que não passaria nas `ownerRules` (cliente da OS/projeto ≠ dono) é
  **pulado** — a B375 foi revista (não repetir a C124 de propósito).
- **IMPORTANTE — EM_SEPARACAO excluída perdia a próxima nota**: → **EM_SEPARACAO entra como candidata** (o hold do
  item soma de volta no separável dele); o recálculo de status NÃO a toca (fora do conjunto acima).
- Menores: régua da falta = **pendente de ENTREGA − hold do item** (protege o separado ainda não entregue; o aviso da 70
  segue pela de separação — diferença declarada); desempate por `item.id`; reserva da chegada nasce com `expira_em` se
  a config estiver ligada e a expiração não recalcula status → na C127; dono da reserva = quem processou a nota
  (declarado: a tela de Reservas mostra o faturista); comentário de `RequisicoesList.js:168` ajustado na T6; banner
  PARCIALMENTE_RESERVADA inexato → declarado; asserções que caem também em
  `requisicaoEsperaCompraIntegracao.api.test.js:251` e `:257` (listar na T1).
- **Paralelismo revisto**: a T4 toca `routes/almoxarifado.js`, o mesmo arquivo do conserto de `/encerrar` (T3) → a T4
  roda NO MESMO agente do tronco, sequencial. Revisão adversarial só depois, com a árvore quieta.
