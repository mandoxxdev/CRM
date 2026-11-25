# Estimativa 25/11/2026 — Tela de grupos de Produtos

Pedido do Matheus (Comercial), 25/11/2026, com print da tela Produtos: *"Essa parte de produtos está um lixo tudo bugado"*.

| # | Tarefa | Execução estimada | Régua horas.js | Informado | Etapa/plano | Régua usada | Execução medida | Realizado | Commits |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Cartões dos grupos de Produtos legíveis e no lugar | 1h | 1h | 1h | — | Ajuste de CSS com teste no navegador (~45min-1h) | — | — | — |

## Como foi medido

- `client/src/styles/apple-telas.css` tem duas passadas sobre `.grupo-card`: a segunda (foto no cartão inteiro, texto branco sobre
  escurecimento) e a primeira, que vem DEPOIS no arquivo e ganha (`.grupo-card-body` transparente) — nome branco sobre branco. O cabeçalho
  é `position: absolute` e o cartão não declara `position: relative` aqui: a foto se posiciona fora do cartão.

## Medir no fechamento

```
node .claude/skills/relatorio-semanal/scripts/horas.js --desde 2026-11-25 --ate 2026-11-25 --grupos "P=[Gg]rupos de [Pp]rodutos|[Tt]ela de [Pp]rodutos"
```
