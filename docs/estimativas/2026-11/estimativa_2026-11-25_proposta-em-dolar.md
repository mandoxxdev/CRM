# Estimativa 25/11/2026 — Proposta em dólar ou euro

Pedido do Matheus (Comercial), 25/11/2026, com print da lista de propostas (ETEX PERU, "R$ 23.550,00"): *"Essa proposta eu coloquei em
dólar e aqui está em real, e acredito que no dash tenha subido em real, tem que ter um fator de conversão de moeda"*.

| # | Tarefa | Execução estimada | Régua horas.js | Informado | Etapa/plano | Régua usada | Execução medida | Realizado | Commits |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Valor na moeda da proposta e conversão para real no painel | 2h | 2h | 2h | — | Coluna + serviço de cotação + rotas + tela + testes (~1h30-2h) | — | — | — |

## Como foi medido

- `propostas.moeda` existe desde a etapa bilíngue; a lista formata tudo em R$ e o painel soma `valor_total` sem olhar a moeda.
- Cotação: PTAX do Banco Central (`olinda.bcb.gov.br`, gratuita, sem chave) — testada em 25/11/2026: USD 5,8573, EUR 6,4260
  (fechamento de 24/11).

## Medir no fechamento

```
node .claude/skills/relatorio-semanal/scripts/horas.js --desde 2026-11-25 --ate 2026-11-25 --grupos "M=[Dd][oó]lar|[Cc]ota[cç][aã]o|[Mm]oeda"
```
