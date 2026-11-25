# Estimativa 25/11/2026 — Tela de grupos de Produtos

Pedido do Matheus (Comercial), 25/11/2026, com print da tela Produtos: *"Essa parte de produtos está um lixo tudo bugado"*.

| # | Tarefa | Execução estimada | Régua horas.js | Informado | Etapa/plano | Régua usada | Execução medida | Realizado | Commits |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Cartões dos grupos de Produtos legíveis e no lugar | 1h | 1h | 1h | — | Ajuste de CSS com teste no navegador (~45min-1h) | ~0,2 h (1 commit; o medidor da ~10 min para commit isolado) | 15min | `6d286c37` |

## Como foi medido

- `client/src/styles/apple-telas.css` tem duas passadas sobre `.grupo-card`: a segunda (foto no cartão inteiro, texto branco sobre
  escurecimento) e a primeira, que vem DEPOIS no arquivo e ganha (`.grupo-card-body` transparente) — nome branco sobre branco. O cabeçalho
  é `position: absolute` e o cartão não declara `position: relative` aqui: a foto se posiciona fora do cartão.

## Fechamento (25/11/2026, por esta sessao)

A sessao que escreveu a estimativa (08:19) nao chegou ao codigo; esta sessao executou. Alem dos dois achados acima, a medicao mostrou um
terceiro: `min-height: 280px` do CSS base com `aspect-ratio: 4/3` — num item de grade com aspect-ratio o `stretch` vira `start`, a altura
ia a 280 e a largura a 373px numa coluna de 301 (o vazamento e a sobreposicao). Bloco reescrito como uma passada so com `:not(#_)`.
Medido depois: 296x222 em colunas de 305, nome branco sobre degrade, duas colunas de 150px no celular. Realizado pelo medidor: 15min
(um commit isolado); estimado 1h.

## Medir no fechamento

```
node .claude/skills/relatorio-semanal/scripts/horas.js --desde 2026-11-25 --ate 2026-11-25 --grupos "P=[Gg]rupos de [Pp]rodutos|[Tt]ela de [Pp]rodutos"
```
