# Estimativa 27/11/2026 — sucateamento depois da liberacao (C559) e entrega dos dois itens do lote (C560)

Origem: a "proxima tarefa detalhada" do plano da Etapa 274 (fora da estimativa de 23/11). Etapa 275.

| # | Tarefa | Execucao estimada | Regua horas.js | Informado | Etapa/plano | Regua usada | Execucao medida | Realizado | Commits |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Sucateamento da reprovacao depois do "Sem lote" (C559) — conserto no molde da 274 | 45min | fatia de motor do almoxarifado (Etapa 274: 2 itens em ~50 min) | 45min | 275 | a conferencia da NC da 274 (B1655) | — | — | — |
| 2 | Entrega dos dois itens da mesma requisicao no caso do lote (C560) — medir; consertar ou provar | 30min | sonda + teste (Etapa 274 item 2: ~20 min) | 30min | 275 | a E2 da 273 | — | — | — |

Medido antes de estimar (27/11, sonda executada sobre `73de3d13`):
- (1) C559 REPRODUZIDO: L1 4 + 1, L2 4; reprovacao de 2 no L1 liberada pelo "Sem lote"; 4 bloqueadas no L2; NC SUCATEAR -> solicitar ->
  duas assinaturas -> APROVADO: L1 3 (2 pecas livres sucateadas), bloqueado 2 com as 4 do L2 ainda bloqueadas pelo livro. Com o estorno da
  entrada do L1 a solicitacao ja recusa (SEM_SALDO_LOTE); sem bloqueio em lote, a solicitacao recusa ("ja havia saido do bloqueio").
- (2) C560 deduzido na Fase 2 da 274, nunca executado: medir primeiro.

Medir no fechamento:
`node .claude/skills/relatorio-semanal/scripts/horas.js --desde 2026-11-27 --ate 2026-11-27 --grupos "Sucateamento=sucateamento depois da liberacao;Entrega=entrega dos dois itens do lote"`
(commits comuns — plano, fechamento — rateados pela execucao estimada.)
