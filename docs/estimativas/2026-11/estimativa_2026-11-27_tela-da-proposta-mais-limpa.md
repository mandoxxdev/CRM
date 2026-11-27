# Estimativa 27/11/2026 — tela da proposta mais limpa

Pedido (print da Nova proposta): "Ficou otimo, agora queria melhorar essa pagina sabe? to achando ela feia e confusa, muita informacao".

| # | Tarefa | Execucao estimada | Regua horas.js | Informado | Etapa/plano | Regua usada | Execucao medida | Realizado | Commits |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Reorganizar a tela da proposta | 1h30 | tela grande sem motor (so layout) | 1h30 | — | Compras: alteracao de cadastro (~1h a 1h30) | — | — | — |

Medido antes: PropostaForm.js tem 5 secoes (Dados gerais com 9 campos + 3 dicas; Cliente de fora do Brasil, sempre aberta, com 5 campos e
paragrafo; Pipeline e dashboard com 8 campos + 2 dicas; Itens; PDF). Os itens vinham depois de 3 secoes. So layout: mesmo estado, mesmo
payload (montarPayloadProposta).

Medir no fechamento:
`node .claude/skills/relatorio-semanal/scripts/horas.js --desde 2026-11-27 --ate 2026-11-27 --grupos "Tela da proposta=tela da proposta|proposta mais limpa"`
