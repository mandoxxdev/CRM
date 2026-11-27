# Estimativa 27/11/2026 — entregavel do detalhe e da Fila (D (273) 2) e nao conformidade depois da liberacao (C557)

Origem: a "proxima tarefa detalhada" do plano da Etapa 273 (fora da estimativa de 23/11). Etapa 274.

| # | Tarefa | Execucao estimada | Regua horas.js | Informado | Etapa/plano | Regua usada | Execucao medida | Realizado | Commits |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Detalhe e Fila mostram o entregavel que a entrega aceita (E2 da 273) | 45min | fatia de tela/leitura do almoxarifado (Etapa 273: 2 itens em ~55 min; 272: ~1h) | 45min | 274 | o teto da 206 (Fase 5, R1) | ~30min (rateio) | 30min | 6afe38eb (+ os comuns) |
| 2 | NC depois da liberacao pelo "Sem lote" (C557) — reproduzir; consertar ou provar | 30min | sonda + teste do estorno (Etapa 273 item 1: ~22 min) | 30min | 274 | o C556 da 273 | ~20min (rateio) | 30min | 75262048, 30eb19ba (+ os comuns) |

Medido antes de estimar (27/11, leitura do codigo sobre `6620f448`):
- (1) `tetoDaEntregaPeloLote` (requisitionService) devolve null sem `lote_impedido`, e a Fila nem chama sem ele; a E2 da 273
  (`conferirAutomaticoPeloLote` -> `outrasCaixasNoMaterial`) recusa sem lote impedido. Caminho: o mesmo gatilho (`outrasCaixasNoMaterial`
  com o item entregando sozinho) abre o teto pela mesma `cabeDoAutomaticoPeloLote`. So leitura; nenhum campo novo.
- (2) C557 deduzido na Fase 2 da 273, nunca executado: reproduzir primeiro.

Medir no fechamento:
`node .claude/skills/relatorio-semanal/scripts/horas.js --desde 2026-11-27 --ate 2026-11-27 --grupos "Entregavel=entregavel do detalhe e da fila;NC=nao conformidade depois da liberacao"`
(commits comuns — plano, fechamento — rateados pela execucao estimada.)

Fechamento (27/11): horas.js mediu os commits da etapa em ~50 min (5a55b57c ~3, 77ca403d ~3, 6afe38eb ~4, 75262048 ~3, 30eb19ba ~6,
1bfc25d8 ~31). Rateado pela estimada (45/75 e 30/75): ~30 e ~20 min; o item 2 arredondado para o minimo de 30 min. O item 2 mudou de natureza
(o aviso estava errado no efeito e a sonda achou a variante real, que virou conserto; a revisao final achou mais um ponto, consertado) e coube
no estimado. Estimado 1h15, realizado 1h.
