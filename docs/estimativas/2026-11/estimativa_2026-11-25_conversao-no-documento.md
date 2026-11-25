# Estimativa 25/11/2026 — conversao a partir do real no documento

Pedido (print do quadro "US$ 128.990,00"): "Eu coloquei 128 mil reais e na proposta aparece assim como em dolar, nao esta convertendo".

| # | Tarefa | Execucao estimada | Regua horas.js | Informado | Etapa/plano | Regua usada | Execucao medida | Realizado | Commits |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Valores em reais, convertidos no documento | 1h | media: documento + cadastro + lista + painel | 1h | — | e884ab8 / f1c0fc4 (mesma area) | ~14min | 15min | b8208d2 |

Medido antes: todo valor do documento passa por moedaBRL/moedaTr (propostaPremiumV2.js, 14 usos) -> um ponto de conversao. O painel
multiplica pela cotacao (cambio.valorEmReaisSql) — com o valor gravado em reais isso converte duas vezes; volta a somar o gravado.

Medir no fechamento:
`node .claude/skills/relatorio-semanal/scripts/horas.js --desde 2026-11-25 --ate 2026-11-25 --grupos "Conversao=convertid|a partir do real"`

Fechamento: horas.js eb06e0b ~1min + b8208d2 ~13min. O exemplo do .txt dizia US$ 22.022,08; a conta certa e 22.022,09 (corrigido, o teste acusou).
