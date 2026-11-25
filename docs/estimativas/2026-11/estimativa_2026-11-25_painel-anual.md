# Estimativa 25/11/2026 — Painel por ano

Pedido do Matheus (Comercial), 25/11/2026, com print do Dashboard Executivo: *"Esses filtros aqui, devem ser todos anuais sabe? pq agora
estamos no fim de 2026, deve resetar em 2027"*.

| # | Tarefa | Execução estimada | Régua horas.js | Informado | Etapa/plano | Régua usada | Execução medida | Realizado | Commits |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Painel do Comercial mostrando o ano corrente | 1h30 | 1h30 | 1h30 | — | Tela + 2 rotas + testes (~1h a 1h30) | — | — | — |

## Como foi medido

- O painel abria SEM período (desde sempre); o filtro De/Até só valia se aplicado à mão. `/dashboard/historico` (Tendências Mensais)
  ignorava o período (12 meses fixos) e `/dashboard/vendas` ignorava qualquer filtro.

## Medir no fechamento

```
node .claude/skills/relatorio-semanal/scripts/horas.js --desde 2026-11-25 --ate 2026-11-25 --grupos "A=[Pp]ainel"
```
