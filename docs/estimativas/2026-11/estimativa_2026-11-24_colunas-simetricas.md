# Estimativa 24/11/2026 — Colunas simétricas na proposta em duas línguas

Pedido do Matheus (Comercial), 24/11/2026, com print da proposta em espanhol: *"Nesse caso aqui, que os espaços ficam diferentes na
tradução, tem que sempre forçar a ficar parecido ambos sabe? para dar simetria"*.

| # | Tarefa | Execução estimada | Régua horas.js | Informado | Etapa/plano | Régua usada | Execução medida | Realizado | Commits |
|---|---|---|---|---|---|---|---|---|---|
| 1 | As duas colunas terminam na mesma altura | 1h | 1h | 1h | `docs/superpowers/plans/2026-11-24-propostas-etapa1-proposta-bilingue.md` | Script no template + medição no navegador + teste (~45min-1h) | — | — | — |

## Como foi medido

- Cada par (`.bi-par`) é uma linha de grade: a altura é a da metade mais alta. Caminho: depois da paginação, reduzir a escala (`zoom`) da
  metade mais alta até caber na altura da outra, com piso de 85%. Só diminui altura: não cria transbordo de página.

## Medir no fechamento

```
node .claude/skills/relatorio-semanal/scripts/horas.js --desde 2026-11-24 --ate 2026-11-24 --grupos "Simetria=simetric|mesma altura"
```
