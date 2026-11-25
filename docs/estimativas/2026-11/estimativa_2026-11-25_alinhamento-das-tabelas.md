# Estimativa 25/11/2026 — Alinhamento das tabelas

Pedido do Matheus (Comercial), 25/11/2026, com print da lista de Clientes: *"a diagramação deve ser a mesma, ex: A.A começa um pouco
para esquerda e Acor mais para direita, você deve seguir padrão de espaçamentos em todas as páginas"*.

| # | Tarefa | Execução estimada | Régua horas.js | Informado | Etapa/plano | Régua usada | Execução medida | Realizado | Commits |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Lista de Clientes alinhada e botões de ação visíveis em todas as tabelas | 45min | 45min | 45min | — | CSS + teste no navegador (~30-45min) | — | — | — |

## Como foi medido

- Inicial 48px x logo 72px (24px de diferença no começo do nome); CNPJ sem `nowrap`; o tema força os botões de ação a 30px e a regra
  geral `.btn-icon { padding: 12px }` deixa 6px para o ícone (4px de largura medidos) — em toda tabela com `.action-buttons`.

## Medir no fechamento

```
node .claude/skills/relatorio-semanal/scripts/horas.js --desde 2026-11-25 --ate 2026-11-25 --grupos "T=[Tt]abelas|[Cc]lientes alinhad"
```
