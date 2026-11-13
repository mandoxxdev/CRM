# Estimativa 12/11/2026 — cadastro de material: tipo de material e fornecedores

Pedido: `specs/modulo-almoxarifado/01-cadastros-materiais/pedido-2026-11-12/README.md` (mensagens da compradora + imagens).
Fora da estimativa até haver resposta: img4 (número de série + número de controle/etiqueta obrigatórios — tela desconhecida) e a
junção de Especificações/Observações (pedido ambíguo).

| # | Tarefa | Execução estimada | Fator | Informado | Etapa/plano | Régua usada | Execução medida | Realizado | Commits |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Tipo de Material de uma lista | 1h | média (30 + 1h), revisada em 13/11: a restrição de endereço compara o tipo (era pequena, 1h30) | 2h30 | — | categoria virou lista (Etapa 26); fornecedor em maiúsculas ~20-30 min | — | — | — |
| 2 | Vários fornecedores por material | 1h30 | várias telas + cadastro novo (30 + 1h30) | 3h30 | Etapa 212 | endereço do destino na Frota ~1h30 | 0,4 h (horas.js, `Etapa 212`) | 2h30 (0,4 h + 2h da tabela: o André ainda não testou) | `f59c0551` `db55113a` `e74bcb05` |
| 3 | Código do fornecedor na cotação e no pedido | 1h | média + impressão (30 + 1h + 30) | 3h | Etapa 213 | OS digitada no pedido ~30-45 min, duas telas | 0,7 h (horas.js, `Etapa 213`) | 3h (0,7 h + 2h da tabela, arred.: o André ainda não testou) | `86ab0eb4` `7a8e6f5b` |
| 4 | Histórico de preços por fornecedor | 45 min | média (30 + 1h) | 2h30 (2h15 arred.) | Etapa 214 | materiais no Compras ~30-45 min | 1,3 h (horas.js, `Etapa 214`) | 3h (1,3 h + 1h30 da tabela, arred.: o André ainda não testou) | `8ec674b0` `bd9209c4` |
| 5 | Tirar o campo Aplicação | 15 min | ajuste pontual (15 + 15) | 45 min | — | ajuste pontual de tela | — | — | — |

Ordem de execução: 2 → 3 → 4 (o 3 e o 4 dependem da lista do 2); 1 e 5 são independentes. O 5 só depois da confirmação do Matheus.

Medição no fechamento:
```
--grupos "Tipo de material=tipo de material;Fornecedores do material=fornecedores do material|material x fornecedor;Codigo do fornecedor no pedido=codigo do fornecedor;Historico de precos=historico de precos;Aplicacao=aplicacao"
```
