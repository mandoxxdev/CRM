# Estimativa 27/11/2026 — fundo liso

Pedido (print do Dashboard no celular): "eu acho a tematica horrivel do app sabe? tipo assim, esse fundo meio colorido sei la".

| # | Tarefa | Execucao estimada | Regua horas.js | Informado | Etapa/plano | Regua usada | Execucao medida | Realizado | Commits |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Fundo liso (celular e computador) + valor do painel sem quebrar | 45min | ajuste de tela so de CSS | 45min | — | 30fa433 (celular clean) | — | — | — |

Medido antes: no celular, FundoAppMobile (.agfx, app-glass.css) desenha 3 blobs com blur 46px e opacidade .5, animados; no computador,
.layout::before/::after (Layout.css) e .glass-bg-orbs (glassmorphism.css) sao dois orbs azul/roxo fracos. O .summary-value do painel no
celular quebra no meio ("R$ 17.015." / "772").

Medir no fechamento:
`node .claude/skills/relatorio-semanal/scripts/horas.js --desde 2026-11-27 --ate 2026-11-27 --grupos "Fundo=fundo liso|sem manchas"`
