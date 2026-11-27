# Estimativa 27/11/2026 — estorno do desbloqueio com lote (C504) e conferencia do lote na ordem dos itens (C555)

Origem: a "proxima tarefa detalhada" do plano da Etapa 271 (candidatos fora da estimativa de 23/11). Etapa 272.

| # | Tarefa | Execucao estimada | Regua horas.js | Informado | Etapa/plano | Regua usada | Execucao medida | Realizado | Commits |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Estorno do Desbloquear com lote confere o lote | 45min | fatia do motor/estorno (~45 min a 1h; Etapas 269-271 mediram ~1h cada) | 45min | 272 | estorno da entrada com peca presa (264) | — | — | — |
| 2 | Conferencia do lote na entrega independe da ordem dos itens | 1h | fatia da entrega sob as travas (~1h; Etapa 268 1h) | 1h | 272 | conferencia do lote da 218/268 | — | — | — |

Medido antes de estimar (27/11, leitura do codigo):
- (1) `stockService.cancelarMovimentacao`, ramo `DESBLOQUEIO`: o claim confere so o livre de caixa do MATERIAL; nao olha o lote do
  movimento. A conferencia do Bloquear com lote (`lotService.lotesParaBloquear`) existe e e reaproveitavel na forma crua.
- (2) `requisitionService` (entrega, conferencia do lote da 218): `jaPedido` e o prefixo (itens anteriores na ordem) e o guardado inclui a
  guarda que FICA dos outros itens — a assimetria faz a ordem decidir. A janela (`limiteDaOrigemNaEntrega`) ja usa a conta simetrica.

Medir no fechamento:
`node .claude/skills/relatorio-semanal/scripts/horas.js --desde 2026-11-27 --ate 2026-11-27 --grupos "Estorno do desbloqueio=estorno do desbloquear com lote;Lote na entrega=conferencia do lote na ordem dos itens"`
(commits comuns aos dois — plano, fechamento — rateados pela execucao estimada.)
