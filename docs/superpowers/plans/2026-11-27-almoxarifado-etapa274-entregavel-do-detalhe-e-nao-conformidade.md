# Etapa 274 — O entregável do detalhe e da Fila no caso da guarda de outra caixa (D (273) 2) e a não conformidade depois da liberação pelo "Sem lote" (C557)

> Fora da estimativa de 23/11. Estimativa própria:
> `docs/estimativas/2026-11/estimativa_2026-11-27_entregavel-do-detalhe-e-nao-conformidade.md` (45 min + 30 min), commit `5a55b57c`.
> Features: `specs/modulo-almoxarifado/05-separacao-entrega` (o entregável) e `10-lotes-series-etiquetas` / `06-inspecao-qualidade` (a NC).
> Etapa anterior: 273.

## Fase 0 — medido antes de prometer (sobre `6620f448`)

**A — D (273) 2. Medido no código.** `requisitionService.tetoDaEntregaPeloLote` devolve `null` sem `lote_impedido` e a Fila nem o chama sem ele
(`listarFilaSeparacao`, laço dos `tetosLote`). A E2 da 273 (`conferirAutomaticoPeloLote` → `outrasCaixasNoMaterial`) recusa justamente **sem**
lote impedido. Cenário da Fase 5 da 273: L1 3 em A01 guardadas pela R1 + 1 em B01 bloqueada; R2 de 1 separada sem origem → o detalhe e a Fila da
R2 mostram entregável 1 e a porta recusa com a E2.

**B — C557. Sonda executada (cópia do harness da 273, NC automática da inspeção, decisão DEVOLVER, `registrarExecucao`).** Três variantes:
1. *(o C557 como escrito)* L1 4 + 1, L2 4; reprovação de 2 no L1 liberada pelo "Sem lote"; bloquear 4 do L2; estornar a entrada de 4 do L1 (passa
   desde a 273); executar a NC → **400** do motor *"Saldo insuficiente no lote L1. Disponível: 1 UN"*, **nada se move** (claims desfeitos).
   O C557 dizia "pode tentar tirar do lote peças que ele não tem" — tenta, mas o motor recusa: **não há negativo**. A recusa é a frase crua do
   motor, que não diz que a reprovação já foi liberada.
2. *(variante nova, sem estorno — o furo real)* L1 4 + 1, L2 4; reprovação de 2 liberada pelo "Sem lote"; bloquear 4 do L2; executar a NC →
   **200** `BAIXADA`: 2 saem do L1 (peças que já estavam livres) e o bloqueado do material cai de 4 para 2 **com as 4 do L2 ainda bloqueadas pelo
   livro** (bloqueado 2 < Σ por lote 4). A devolução tira a reprovação "sem lote" de um bloqueado que é todo do L2.
3. *(estorno antes do bloqueio do L2)* igual à 1: 400 do motor, nada se move.

A causa de 2 é a mesma do C501 (Etapa 249) na liberação: a reprovação mora no bloqueado **sem lote**, e o "Sem lote" já a tirou; a liberação pela
NC confere isso desde a 249 (`SEM_LOTE_INSUFICIENTE`, frase própria), a devolução não.

## Regras de negócio

- **RN-274.01** — O entregável do detalhe (`quantidade_entregavel`, `saldo_entregavel`) e da Fila (`entregavel`) de um item de material com controle
  de lote e sem série, **sem** lote impedido, passa pelo teto da conferência (`tetoDaEntregaPeloLote`) quando o material tem um lote com parte
  guardada que o automático pula (o mesmo gatilho da E2: `outrasCaixasNoMaterial`, com o item entregando sozinho — `parteQueFica` 0 dele).
  Cenário: o de cima → detalhe e Fila da R2 mostram **0** (a porta recusa 1 com a E2).
- **RN-274.02** — O que cabe continua: R2 pede 2 e o L2 tem 1 livre → entregável **1** (a porta aceita 1, recusa 2 com a E2 "entregue 1 un a menos").
- **RN-274.03** — Sem o gatilho, nada muda: B01 livre → entregável 1 (o número de antes; a porta aceita). Guarda num lote **sem** prateleira
  bloqueada nem linha sem endereço → o número de antes (B1640).
- **RN-274.04** — A guarda da própria requisição: um item com 3 separadas de (A01, L1) e outro de 1 sem origem, B01 bloqueada → o segundo mostra
  **0**; o primeiro mostra **3** (a sua guarda sai inteira e não conta — `guardaQueConta`).
- **RN-274.05** — Só leitura: nenhum campo novo, nenhuma trava; a Fila só lê a mais para o item de material com controle de lote sem série.
- **RN-274.06** — Executar a devolução ao fornecedor (NC DEVOLVER) da reprovação de uma inspeção é recusado **antes de qualquer efeito** quando o
  bloqueado **sem lote** do material não cobre a reprovação e há bloqueado em lote (parte da reprovação saiu pelo Desbloquear "Sem lote"):
  **400** com a literal L1 abaixo; a NC continua PENDENTE (decidida), a inspeção sem carimbo, nada no livro. Variante 2 da Fase 0.
- **RN-274.07** — O C557 como escrito (variante 1) passa a receber a mesma recusa L1 (antes a frase crua do motor), nada se move.
- **RN-274.08** — Sem bloqueio em lote, nada muda: a reprovação ainda bloqueada → 200 `BAIXADA` (como antes); o bloqueado drenado abaixo da
  reprovação → o "registra sem mover" de sempre (`SEM_SALDO`, RN-11 da Etapa 45).
- **RN-274.09** — A conferência roda dentro da seção da devolução (`naTravaDoMaterial`, Etapa 218), antes do claim da inspeção; o claim da NC
  (passo 2) é desfeito para PENDENTE. Fluxo: recusa → Bloquear 2 *sem lote* → executar → 200 `BAIXADA`, bloqueado volta a 4 (o do L2).

## Contratos (congelados)

`GET /api/almoxarifado/requisicoes/:id` e `GET /api/almoxarifado/fila-separacao` — **nenhum campo novo**; só o
valor de `quantidade_entregavel` / `saldo_entregavel` (detalhe) e `entregavel` (Fila) muda no caso da RN-274.01.

`POST /api/almoxarifado/nao-conformidades/:id/executar` (e `registrarExecucao`) — **L1** (400, nova):
`Não é possível devolver pela não conformidade: só ⟨s⟩ ⟨un⟩ do bloqueado está sem lote e a reprovação tem ⟨q⟩ ⟨un⟩ — parte dela pode já ter sido
liberada pelo Desbloquear (o resto do bloqueado está em lote: ⟨L2: 4⟩). Bloqueie de novo, sem lote, o que falta e registre a execução outra vez, ou
cancele a não conformidade` — o mesmo molde da frase da liberação (Etapa 249, C501), lida do código.

## Tasks

- [ ] **T1 (galho, leitura)** — A: o gatilho em `tetoDaEntregaPeloLote` + a Fila deixa de pular o item sem lote impedido. Teste
  `entregavelGuardaDeOutraCaixa.api.test.js` (detalhe pela rota, Fila pela rota, e o cruzamento detalhe = o que a porta aceita). Sabotagem.
- [ ] **T2 (tronco, NC)** — B: a conferência em `executarDevolucaoNaTrava`. Teste `ncDevolucaoDepoisDoSemLote.api.test.js` (serviço + rota, as 3
  variantes, controle e fluxo). Sabotagem.
- [ ] **T3** — Fase 5 (revisor fresco, adversarial, cenário reproduzido).
- [ ] **T4** — fechamento (`fechar-etapa`, sem 7½ e 8).

## Pontos de atenção

- A Fila chama `tetoDaEntregaPeloLote` para mais itens (uma consulta a mais por item de material com lote sem série). Só leitura, fora das travas.
- `tetoDaEntregaPeloLote` com origem impedida/não cobre (Etapa 251) continua igual; o gatilho novo só abre a porta de entrada.
- A conferência da NC lê o bloqueado por lote dentro da trava do material (a mesma régua de `bloqueioPorLote.bloqueadoPorLote` que o
  Desbloquear usa).
