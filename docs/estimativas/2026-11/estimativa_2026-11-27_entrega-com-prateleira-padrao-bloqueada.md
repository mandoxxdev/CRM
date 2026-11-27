# Estimativa 27/11/2026 — entrega com prateleira padrao bloqueada (C561)

Origem: a "proxima tarefa detalhada" do plano da Etapa 276. Etapa 277.

| # | Tarefa | Execucao estimada | Regua horas.js | Informado | Etapa/plano | Regua usada | Execucao medida | Realizado | Commits |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Entrega de dois materiais com a padrao de um bloqueada recusa antes de baixar (C561) | 45min | fatia de motor do almoxarifado (Etapa 275: dois itens em ~52 min; Etapa 276: 45 min) | 45min | 277 | a conferencia previa da 275 (B1657) | — | — | — |

Medido antes de estimar (27/11, leitura sobre `16c32c21`): o motor (`registrarMovimentacao`) confere a localizacao padrao na SAIDA sem
origem e sem lote (`validarLocalizacaoParaMovimento(resolveLocalizacaoSaida(...))`), mesmo quando a linha sem lote que sai e outra (P01). A
entrega chama o motor item a item nas passadas 0, 1, '2p' e 2; a recusa do segundo material chega depois da baixa do primeiro.

Medir no fechamento:
`node .claude/skills/relatorio-semanal/scripts/horas.js --desde 2026-11-27 --ate 2026-11-27 --grupos "Entrega=prateleira padrao bloqueada|prateleira padrão bloqueada"`
