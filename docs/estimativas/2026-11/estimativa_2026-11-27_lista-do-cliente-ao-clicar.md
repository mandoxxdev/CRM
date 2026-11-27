# Estimativa 27/11/2026 — lista do cliente ao clicar

Pedido (print do campo de busca vazio, com o cursor): "ao clicar deve abrir um menu sabe".

| # | Tarefa | Execucao estimada | Regua horas.js | Informado | Etapa/plano | Regua usada | Execucao medida | Realizado | Commits |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Abrir a lista ao clicar | 30min | ajuste pontual de tela (~10-20 min), minimo 30 | 30min | — | 5e21469 (o campo de busca) | ~15min | 15min | 3e3424c |

Medido antes: SeletorCliente so abre ao digitar (MINIMO_BUSCA_CLIENTE = 2). O servidor ja aceita `limite` sem `search` (os primeiros em
ordem de razao social).

Medir no fechamento:
`node .claude/skills/relatorio-semanal/scripts/horas.js --desde 2026-11-27 --ate 2026-11-27 --grupos "Lista ao clicar=lista do cliente ao clicar|abre a lista"`

Fechamento: horas.js deu 3e3424c ~4min e c62a3e0 ~30min; o de c62a3e0 conta desde o envio anterior (b005a93), inclusive a espera pela mensagem do usuario. Execucao desta: ~15 min.
