# Etapa 136 (spec 05 + núcleo): a ordem das baixas da entrega (D (135)) e quatro pequenas do cadastro de usuários — design

> Origem: "Próxima tarefa detalhada — Etapa 136" do plano da 135
> (`docs/superpowers/plans/2026-10-16-almoxarifado-etapa135-o-entregavel-de-irmaos.md`). Plano:
> `docs/superpowers/plans/2026-10-17-almoxarifado-etapa136-a-ordem-das-baixas.md`.

## Fase 0 — o que foi medido (sonda `scratchpad/e136/sonda-f0.js`, `testApp` real, rota `PUT /entregar`)

**Reproduzido.** A D (135) dizia "a recusa do motor por endereço ainda pode vir depois da primeira baixa" e pedia medir com o item 1 na
segunda rodada. A sonda mostra que **nem precisa de segunda rodada** — o caso mais comum é a primeira:

| Caso | Estado | `PUT /entregar` | Depois |
|---|---|---|---|
| **V1** | A 3, B 2; reservados 2 + 2; item 1 separado **sem origem**, item 2 separado **de A** | 400 *"E136-3: O saldo em E136-A-1 (1) não cobre a quantidade (2) — a saída tiraria de outros endereços"* | **físico 3, item 1 entregue 2, uma saída** — metade da entrega feita |
| V1b | o mesmo, sem reserva | 400, a mesma | físico 3, item 1 entregue 2 |
| V2 | a ordem inversa (o planejado é o item 1) | 200 *ENTREGUE* | A 1, B 0 |
| **V3** | o caso da D (135): item 1 na segunda rodada sem origem, item 2 de A | 400, a mesma | item 1 entregue 4, item 2 0 |
| **V4** | A é o endereço **padrão** (3), B 5 — o automático prefere o padrão | 400, a mesma | físico 6, item 1 entregue 2 |
| V5 | lote: item 2 de (A, L1), item 1 sem origem | 200 (o automático sem lote não toca linha de lote — B204) | a linha sem endereço fica −2 (anterior, B204) |
| **V6** | item 1 planejado em B com **excedente** automático, item 2 de A | 400, a mesma | item 1 entregue 3,5 |
| **V7** | lote L em A 3 e B 2; item 1 com **lote escolhido sem endereço**, item 2 de (A, L) | 400, a mesma | item 1 baixado |
| **V7b** | L só em A (2); item 1 lote L sem endereço 2, item 2 de (A, L) 2 — **não cabe** | 400 *"O saldo em A (0)…"* | **item 1 baixado** — a prévia aceitou os dois |
| V8 | dois automáticos | 200 | — |

**Causa.** A prévia (`checarOrigemItem` com `pedidoPorOrigem`) soma o que cada endereço/lote **escolhido** vai dar, mas o laço de baixa
roda **item a item**: o pedaço automático (sem origem) de um item tira do endereço padrão e depois do de mais saldo
(`claimSaldoSemLote`/`claimSaldoDoLote`) — e esse endereço pode ser a origem planejada de um irmão que vem **depois** no laço. O pedaço
"só lote" (lote sem endereço) faz o mesmo dentro do lote. A recusa estrita do motor (`origemEstrita`) sai então no irmão, com o primeiro já
baixado. V7b é a segunda forma: a prévia confere o "só lote" e o (endereço, lote) em chaves separadas, e os dois juntos não cabem.

## A decisão (B877) — reordenar as baixas, não recusar e não mexer no motor

As baixas da mesma entrega rodam em **três passadas**, cada uma na ordem do laço: (0) os pedaços **com endereço** (a origem planejada ou a
escolhida — estritos), (1) os pedaços **com lote e sem endereço**, (2) os **automáticos**. Dentro de um item a ordem dos pedaços não muda
(o com-origem já vinha antes do automático — as séries continuam se dividindo na mesma ordem). Com os estritos primeiro, nenhum automático
chega antes deles ao endereço; e a prévia já garante que os estritos cabem juntos (`pedidoPorOrigem`). Para o V7b, a prévia passa a contar,
no "só lote", o que os estritos do mesmo lote vão levar (a recusa de hoje, *"Saldo insuficiente no lote ⟨L⟩. Disponível: ⟨d⟩"*, antes de
qualquer baixa).

**Descartados:** (i) simular na prévia a escolha de endereço do automático e **recusar** — V1 é uma entrega que cabe (A dá 2 ao item 2, B
dá 2 ao item 1); recusar mandaria o almoxarife "escolher de onde sai" sem motivo; (ii) o automático do irmão **excluir** os endereços
planejados (opção nova no motor) — o motor é lido por todas as portas de saída, e o resto (o que não cabe fora deles) ainda negativaria ou
recusaria depois da primeira baixa; (iii) reordenar só os **itens** (planejados primeiro) — não resolve V6 (o excedente automático do
próprio item planejado).

**Por que a ordem não muda o que o motor aceita** (o disponível): a guarda da entrega é `disponível ≥ q` só para o pedaço sem reserva; o
pedaço da reserva baixa físico e reservado juntos e não mexe no disponível. A soma do que sai sem reserva é a mesma em qualquer ordem, e
cada guarda intermediária é implicada pela última — a ordem não muda a aceitação. A leitura fresca do laço (a E1 de antes da baixa) passa a
rodar para todos os itens **antes da primeira baixa** (lê o mesmo que a prévia lia sem os irmãos — mais frouxa que a prévia, que continua
sendo quem decide; não recusa o que a prévia aceitou).

**Residual declarado (D (136)):** o pedaço automático de um item **com série** leva o lote das séries (`claimSaldoDoLote`) e não é contado
na prévia — anterior, não reproduzido.

## Núcleo — medido no código (`index.js`, `services/systemPermissions.js`)

- **C289** — `POST /api/usuarios` com senha número: `senha.length` é `undefined`, a conferência dos 6 passa e `bcrypt.hashSync` lança no
  handler → 500. **No `PUT`** a mesma senha número chega ao `hashSync` **dentro do callback do `db.get`** — fora do alcance do Express, sem
  `uncaughtException` no `index.js`: a leitura é que **derruba o servidor** (a medir no teste vermelho; vira C nova se reproduzir).
- **C288** — `PUT` com `ativo: ""` → `COALESCE("", ativo)` grava `""`.
- **C287** — `POST` com `ativo: "true"` ou `2` grava cru.
- **C285** — `wouldRemoveLastSuperAdmin` conta num `SELECT` e o `UPDATE` grava depois; duas requisições cruzadas passam as duas.

Decisões (B878–B881) no plano.
