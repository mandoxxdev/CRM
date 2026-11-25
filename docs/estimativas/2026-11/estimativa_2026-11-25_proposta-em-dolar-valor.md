# Estimativa 25/11/2026 — proposta em dolar: valor e moeda

Pedido (print do quadro "Valor Total dos Servicos US$ 0,00"): "o valor nao esta subindo aqui, la no painel gerencial tambem nao esta ficando certo, fica aparecendo em real".

| # | Tarefa | Execucao estimada | Regua horas.js | Informado | Etapa/plano | Regua usada | Execucao medida | Realizado | Commits |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Valor digitado no item de catalogo nao some ao reabrir | 45min | mudanca pequena com regra (~20-30 min) + teste de tela | 45min | — (correcao) | e884ab8 (proposta em dolar, 2h estimadas) | — | — | — |
| 2 | Cadastro e painel na moeda da proposta | 1h | ajuste de varias telas sem motor | 1h | — | idem | — | — | — |

Causa do 1 (medida antes de estimar): `PropostaForm.js` ao carregar troca o `valor_unitario` do item de catalogo pelo `preco_tabela`
("preco de catalogo volta ao valor de tabela"), regra anterior a 24/11 (item editavel). Projeto Conceitual tem tabela 0 -> salvar de novo grava 0.

Medir no fechamento:
`node .claude/skills/relatorio-semanal/scripts/horas.js --desde 2026-11-25 --ate 2026-11-25 --grupos "Valor=valor digitado|reabrir;Moeda=moeda da proposta|painel em reais"`
