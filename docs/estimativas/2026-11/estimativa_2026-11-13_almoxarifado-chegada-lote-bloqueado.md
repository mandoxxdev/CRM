# Estimativa 13/11/2026 — almoxarifado: material que chega em lote bloqueado (C478)

Origem: "Próxima tarefa detalhada" do plano da Etapa 218 (`docs/superpowers/plans/2026-11-13-almoxarifado-etapa218-*.md`).

Medido no código antes de estimar: o teto das três portas mora em dois pontos de `reservaChegadaService.js` (`distribuirSemLock`
`:363-367` e o teto da liberação `:551-556`, que serve à inspeção, à não conformidade e à OS encerrada); a reserva da OS lê o livre
de caixa em `reservaDaOs.reservarParaOsSobTrava` (`:188-190`); o aviso de entrada e o de liberação leem `disponivelSql()` em
`receiptNotificationService.js` (`:366`, `:444`). A régua pronta é `loteImpedido.loteImpedidoSql` (205 + 217), com o molde de
`requisitionStateMachine.calcularStatusPosAprovacao` (`:279`). Todas as portas já rodam sob a trava do material (Etapa 91): sem
trava nova.

| # | Tarefa | Execução estimada | Fator | Informado | Etapa/plano | Régua usada | Execução medida | Realizado | Commits |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Material que chega em lote bloqueado não fica reservado para quem espera (C478) | 1h | estoque/saldo (análise 1h + teste 2h) | 4h | 219 | Etapa 218 (mesmo motor, regra maior: literal, tela, entrega) mediu 1,2 h; 217 mediu 1,1 h. Esta troca o teto em pontos já centralizados | — | — | — |

Medição no fechamento:
```
--grupos "E219=Etapa 219"
```
