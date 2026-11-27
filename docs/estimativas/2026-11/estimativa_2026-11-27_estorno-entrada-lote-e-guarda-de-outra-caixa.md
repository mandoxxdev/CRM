# Estimativa 27/11/2026 — estorno da entrada de lote com reprovacao (C556) e guarda de outra caixa (C485)

Origem: a "proxima tarefa detalhada" do plano da Etapa 272 (candidatos fora da estimativa de 23/11). Etapa 273.

| # | Tarefa | Execucao estimada | Regua horas.js | Informado | Etapa/plano | Regua usada | Execucao medida | Realizado | Commits |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Estorno da entrada de lote nao conta reprovacao ja liberada | 30min | fatia do motor/estorno ja medida (Etapa 272 item 1: ~22 min) | 30min | 273 | o teto da Fase 5 da 272 | ~22min (rateio) | 30min | 858e1911, 803f059d, 908bccae, 7c28f9f9 |
| 2 | Entrega com o lote que falta na parte guardada de outra caixa | 45min | fatia da entrega (Etapa 272 item 2: ~29 min; 269: ~1h) | 45min | 273 | a prova do C485 da 269 (a metade da inspecao estava errada) | ~33min (rateio) | 45min | 6b7ab65e, b0876c15 (+ os comuns) |

Medido antes de estimar (27/11, sondas executadas numa copia do harness, sobre `a4850e27`):
- (1) C556 REPRODUZIDO: L1 4 + 1, L2 4; reprovacao de 2 no L1 ja liberada pelo "Sem lote"; bloquear 4 do L2; estornar a entrada de 4 do
  L1 -> 400 *"o lote L1 tem 2 UN presas nele (2 reprovadas na inspecao) ... Libere 1 UN do lote L1 (a reprovacao pela nao conformidade)"*.
  Sem o bloqueio do L2 -> 200. A causa: `recusaDoEstornoDeEntradaDoLoteBloqueado` limita a reprovacao por `total - bloqueado DESTE lote`.
- (2) C485 (outra caixa) NAO reproduzido em 3 sondas: com R1 guardando o L1 inteiro, R2 nem separa (disponivel 0, com e sem saldo
  negativo permitido); com R2 separada antes e R1 guardando depois, mais uma transferencia de 2, a entrega de R2 sai do que nao esta
  guardado, sem negativo. Caminho: provar por cenario (as portas de hoje) e corrigir o aviso; se alguma porta reproduzir, recusar antes
  da baixa.

Medir no fechamento:
`node .claude/skills/relatorio-semanal/scripts/horas.js --desde 2026-11-27 --ate 2026-11-27 --grupos "Estorno da entrada=estorno da entrada de lote com reprovacao;Outra caixa=guarda de outra caixa"`
(commits comuns aos dois — plano, fechamento — rateados pela execucao estimada.)

Fechamento (27/11): horas.js mediu os commits da etapa em ~55 min (858e1911 ~5, 803f059d ~1, 908bccae ~11, 6b7ab65e ~0, b0876c15 ~7,
7c28f9f9 ~31). Rateado pela estimada (30/75 e 45/75): ~22 e ~33 min, arredondados para 30 e 45 min. O item 2 mudou de natureza no meio (a
revisao do plano achou o caminho que as sondas nao acharam e ele virou conserto, nao so prova), e mesmo assim coube no estimado. Estimado
1h15, realizado 1h15.
