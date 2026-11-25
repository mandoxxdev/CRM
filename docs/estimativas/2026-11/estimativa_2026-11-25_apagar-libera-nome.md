# Estimativa 25/11/2026 — Apagar libera o nome

Pedido do Matheus (Comercial), 25/11/2026, com print de Famílias – Moinhos: *"Quando eu apago um item, ele parece ser um remove soft
sabe? daí não consigo cadastrar outras coisas com o mesmo nome... uma hora ou outra vou ter que apagar algo"*.

| # | Tarefa | Execução estimada | Régua horas.js | Informado | Etapa/plano | Régua usada | Execução medida | Realizado | Commits |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Cadastrar de novo o que foi apagado | 1h | 1h | 1h | — | 3 rotas + teste de API (~1h) | — | — | — |

## Como foi medido

- `familias_produto.nome` e `produtos.codigo` são UNIQUE e apagar é `ativo = 0`. O cadastro de família já reativava a apagada; renomear
  e clonar recusavam ("pertence a uma família apagada", "Já existe uma família INATIVA"); produto recusava ("Código já cadastrado").
- Produto: as propostas ligam o item pelo CÓDIGO (`proposta_itens.codigo_produto = produtos.codigo`) — o código do apagado não pode
  mudar; o cadastro reaproveita a linha.

## Medir no fechamento

```
node .claude/skills/relatorio-semanal/scripts/horas.js --desde 2026-11-25 --ate 2026-11-25 --grupos "L=[Aa]pagar|[Aa]pagad"
```
