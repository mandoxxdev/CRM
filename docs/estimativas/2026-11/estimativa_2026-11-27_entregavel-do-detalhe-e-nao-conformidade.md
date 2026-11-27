# Estimativa 27/11/2026 — entregavel do detalhe e da Fila (D (273) 2) e nao conformidade depois da liberacao (C557)

Origem: a "proxima tarefa detalhada" do plano da Etapa 273 (fora da estimativa de 23/11). Etapa 274.

| # | Tarefa | Execucao estimada | Regua horas.js | Informado | Etapa/plano | Regua usada | Execucao medida | Realizado | Commits |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Detalhe e Fila mostram o entregavel que a entrega aceita (E2 da 273) | 45min | fatia de tela/leitura do almoxarifado (Etapa 273: 2 itens em ~55 min; 272: ~1h) | 45min | 274 | o teto da 206 (Fase 5, R1) | — | — | — |
| 2 | NC depois da liberacao pelo "Sem lote" (C557) — reproduzir; consertar ou provar | 30min | sonda + teste do estorno (Etapa 273 item 1: ~22 min) | 30min | 274 | o C556 da 273 | — | — | — |

Medido antes de estimar (27/11, leitura do codigo sobre `6620f448`):
- (1) `tetoDaEntregaPeloLote` (requisitionService) devolve null sem `lote_impedido`, e a Fila nem chama sem ele; a E2 da 273
  (`conferirAutomaticoPeloLote` -> `outrasCaixasNoMaterial`) recusa sem lote impedido. Caminho: o mesmo gatilho (`outrasCaixasNoMaterial`
  com o item entregando sozinho) abre o teto pela mesma `cabeDoAutomaticoPeloLote`. So leitura; nenhum campo novo.
- (2) C557 deduzido na Fase 2 da 273, nunca executado: reproduzir primeiro.

Medir no fechamento:
`node .claude/skills/relatorio-semanal/scripts/horas.js --desde 2026-11-27 --ate 2026-11-27 --grupos "Entregavel=entregavel do detalhe e da fila;NC=nao conformidade depois da liberacao"`
(commits comuns — plano, fechamento — rateados pela execucao estimada.)
