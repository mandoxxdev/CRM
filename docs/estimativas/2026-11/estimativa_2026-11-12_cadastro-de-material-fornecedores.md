# Estimativa 12/11/2026 — cadastro de material: tipo de material e fornecedores

Pedido: `specs/modulo-almoxarifado/01-cadastros-materiais/pedido-2026-11-12/README.md` (mensagens da compradora + imagens).
Fora da estimativa até haver resposta: img4 (número de série + número de controle/etiqueta obrigatórios — tela desconhecida) e a
junção de Especificações/Observações (pedido ambíguo).

| # | Tarefa | Execução estimada | Fator | Informado | Etapa/plano | Régua usada | Execução medida | Realizado | Commits |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Tipo de Material de uma lista | 45 min | pequena com regra (15 + 30) | 1h30 | — | categoria virou lista (Etapa 26); fornecedor em maiúsculas ~20-30 min | — | — | — |
| 2 | Vários fornecedores por material | 1h30 | várias telas + cadastro novo (30 + 1h30) | 3h30 | — | endereço do destino na Frota ~1h30 | — | — | — |
| 3 | Código do fornecedor na cotação e no pedido | 1h | média + impressão (30 + 1h + 30) | 3h | — | OS digitada no pedido ~30-45 min, duas telas | — | — | — |
| 4 | Histórico de preços por fornecedor | 45 min | média (30 + 1h) | 2h30 (2h15 arred.) | — | materiais no Compras ~30-45 min | — | — | — |
| 5 | Tirar o campo Aplicação | 15 min | ajuste pontual (15 + 15) | 45 min | — | ajuste pontual de tela | — | — | — |

Ordem de execução: 2 → 3 → 4 (o 3 e o 4 dependem da lista do 2); 1 e 5 são independentes. O 5 só depois da confirmação do Matheus.

Medição no fechamento:
```
--grupos "Tipo de material=tipo de material;Fornecedores do material=fornecedores do material|material x fornecedor;Codigo do fornecedor no pedido=codigo do fornecedor;Historico de precos=historico de precos;Aplicacao=aplicacao"
```
