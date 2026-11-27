# Estimativa 27/11/2026 — estorno do desbloqueio com lote (C504) e conferencia do lote na ordem dos itens (C555)

Origem: a "proxima tarefa detalhada" do plano da Etapa 271 (candidatos fora da estimativa de 23/11). Etapa 272.

| # | Tarefa | Execucao estimada | Regua horas.js | Informado | Etapa/plano | Regua usada | Execucao medida | Realizado | Commits |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Estorno do Desbloquear com lote confere o lote | 45min | fatia do motor/estorno (~45 min a 1h; Etapas 269-271 mediram ~1h cada) | 45min | 272 | estorno da entrada com peca presa (264) | ~22min (rateio) | 30min | 48fe26a8, 338a90c8, d22f41c4, 3942620c, 7422dfa5, 8e2dae42 |
| 2 | Conferencia do lote na entrega independe da ordem dos itens | 1h | fatia da entrega sob as travas (~1h; Etapa 268 1h) | 1h | 272 | conferencia do lote da 218/268 | ~29min (rateio) | 30min | 7ab8f156 (+ os comuns) |

Medido antes de estimar (27/11, leitura do codigo):
- (1) `stockService.cancelarMovimentacao`, ramo `DESBLOQUEIO`: o claim confere so o livre de caixa do MATERIAL; nao olha o lote do
  movimento. A conferencia do Bloquear com lote (`lotService.lotesParaBloquear`) existe e e reaproveitavel na forma crua.
- (2) `requisitionService` (entrega, conferencia do lote da 218): `jaPedido` e o prefixo (itens anteriores na ordem) e o guardado inclui a
  guarda que FICA dos outros itens — a assimetria faz a ordem decidir. A janela (`limiteDaOrigemNaEntrega`) ja usa a conta simetrica.

Medir no fechamento:
`node .claude/skills/relatorio-semanal/scripts/horas.js --desde 2026-11-27 --ate 2026-11-27 --grupos "Estorno do desbloqueio=estorno do desbloquear com lote;Lote na entrega=conferencia do lote na ordem dos itens"`
(commits comuns aos dois — plano, fechamento — rateados pela execucao estimada.)

Fechamento (27/11): horas.js mediu os commits da etapa em ~51 min (48fe26a8 ~4, 338a90c8 ~3, d22f41c4 ~2, 3942620c ~6, 7ab8f156 ~0,
7422dfa5 ~32, 8e2dae42 ~4). Os dois itens correram no mesmo pacote (o intervalo do 7422dfa5 cobre a Fase 5 dos dois e a suite), entao a
execucao foi rateada pela estimada (45/105 e 60/105): ~22 e ~29 min, arredondados para 30 min cada (minimo). Estimado 1h45, realizado 1h:
a regua de motor (~45 min a 1h por item) segue alta para correcoes que ja chegam medidas e com o caminho no plano anterior.
