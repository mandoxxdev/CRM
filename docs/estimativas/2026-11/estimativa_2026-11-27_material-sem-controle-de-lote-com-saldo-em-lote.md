# Estimativa 27/11/2026 — material sem controle de lote com saldo em lote (C558)

Origem: a "proxima tarefa detalhada" do plano da Etapa 275 (fora da estimativa de 23/11). Etapa 276.

| # | Tarefa | Execucao estimada | Regua horas.js | Informado | Etapa/plano | Regua usada | Execucao medida | Realizado | Commits |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Entrega de material sem controle de lote com saldo em lote pela prateleira bloqueada (C558) — medir; consertar no molde da 273/275 ou provar | 45min | fatia de motor do almoxarifado (Etapa 275: 2 itens em ~52 min; Etapa 274: ~50 min) | 45min | 276 | a E2 da 273 e a conferencia da 275 | — | — | — |

Medido antes de estimar (27/11, leitura sobre `fd01eb8d`): a parte automatica da entrega de material SEM controle de lote sai sempre pelo
"sem lote" (`baixarSemLote`), e a conferencia do automatico (`conferirAutomaticoPeloLote`) pula esse material (`controleLote` falso). A
sonda pelas portas vem antes do plano.

Medir no fechamento:
`node .claude/skills/relatorio-semanal/scripts/horas.js --desde 2026-11-27 --ate 2026-11-27 --grupos "SemControle=material sem controle de lote com saldo em lote"`
