# Estimativa 25/11/2026 — valor unitario do item da proposta

Pedido (print do campo "Valor unitario" com 0,65): "nao consigo digitar o valor aqui".

| # | Tarefa | Execucao estimada | Regua horas.js | Informado | Etapa/plano | Regua usada | Execucao medida | Realizado | Commits |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Valor do item no formato brasileiro | 30min | ajuste pontual de tela (~10-20 min) | 30min | — (correcao) | campo de acessorio (formatarMoedaBR/digitadoParaValor) | — | — | — |

Causa (reproduzida no navegador antes de estimar): o campo e `type="number"`; no Chrome em pt-BR "23.550,00" vira 23.55 (o ponto
e lido como decimal). Os outros campos de valor do sistema usam a mascara de caixa registradora de `utils/moeda.js`.

Medir no fechamento:
`node .claude/skills/relatorio-semanal/scripts/horas.js --desde 2026-11-25 --ate 2026-11-25 --grupos "Valor do item=valor do item|valor unitario"`
