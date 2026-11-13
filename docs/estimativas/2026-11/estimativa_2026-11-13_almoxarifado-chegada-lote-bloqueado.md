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
| 1 | Material que chega em lote bloqueado não fica reservado para quem espera (C478) | 1h | estoque/saldo (análise 1h + teste 2h) | 4h | 219 (plano `b069fc5d`) | Etapa 218 (mesmo motor, regra maior: literal, tela, entrega) mediu 1,2 h; 217 mediu 1,1 h. Esta troca o teto em pontos já centralizados | 1 h (horas.js --grupos "E219=…", 13/11) → 1h | 4h (1h + análise 1 h + teste 2 h, da tabela — não informado pelo André). No estimado; a revisão achou e registrou uma corrida anterior (bloquear o lote no meio de uma reserva, C523), sem consertar | d365771e, b069fc5d, 3ac80e47, 2ec31628, a6323899, f15ed607 e a verificação |

Medição no fechamento:
```
--grupos "E219=Etapa 219|Estimativa: almoxarifado - material que chega"
```
(A regex também pega o commit da estimativa, cujo assunto não diz "Etapa 219".) A régua do passo 2 continua valendo: execução estimada 1h,
medida 1 h.
