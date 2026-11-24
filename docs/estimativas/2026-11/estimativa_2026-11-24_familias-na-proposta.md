# Estimativa 24/11/2026 — Escolha de família e produtos na proposta

Pedido do Matheus (Comercial), 24/11/2026, com print: (1) *"Essa tela de seleção de equipamentos na proposta está um lixo"* — o passo
"Escolher família" do `SelecaoProdutosPremium` com cartões achatados (foto espremida, nome sumido, inicial cortada); (2) *"Mesmo com o
projeto conceitual cadastrado no meu sistema, não sobe para cá"* — a família PROJETO CONCEITUAL - TINTAS abre com "0 produtos".

| # | Tarefa | Execução estimada | Régua horas.js | Informado | Etapa/plano | Régua usada | Execução medida | Realizado | Commits |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Tela de escolher família legível com muitas famílias | 45min | 45min | 45min | — | Ajuste de tela com teste no navegador (~30-45min) | — | — | — |
| 2 | Produtos que não aparecem na família | 1h30 | 1h30 | 1h30 | — | Regra + rota + tela + teste (~1h a 1h30) | — | — | — |
| 3 | Preço do item da proposta editável | 45min | 45min | 45min | — | Campo + regra de aprovação + teste | — | — | — |
| 4 | Proposta de Projeto Conceitual igual ao modelo da empresa | 1h30 | 1h30 | 1h30 | — | Ramo novo do template + modelo + testes | — | — | — |
| 5 | Ajustes na proposta em inglês e espanhol | 1h | 1h | 1h | `docs/superpowers/plans/2026-11-24-propostas-etapa1-proposta-bilingue.md` | Correção da entrega bilíngue | — | — | — |

**Revisado (24/11/2026, tarde):** chegaram no meio do trabalho — (3) *"devo poder mudar manualmente o preço"*; (4) *"não consegue seguir
exatamente minha proposta? … Somente nesse caso, o restante das propostas não mexa"*; (5) a apresentação passando do rodapé, *"totalmente
errado os espaçamentos"* e *"a tradução não está automática!!!!!"* — defeitos da entrega bilíngue da manhã.

## Como foi medido

- (1) Hipótese: a grade tem `max-height` e o cartão `overflow: hidden` (mínimo automático 0) — o navegador encolhe as linhas para caber em
  vez de rolar. Com 13 famílias cabia; com 19 (4 linhas) não. O teste `server/tests/catalogoFamiliaVitrine.test.js` usa 8 e não pega.
- (2) O produto liga à família pelo NOME (texto em `produtos.familia`); `PUT /api/familias/:id` renomeia só a família — o produto fica com o
  nome antigo e o filtro de `GET /api/produtos?familia=` não o acha. Também: `normalizarFamiliaComparacao` (index.js) tem o regex dos
  acentos sem colchetes (`/̀-ͯ/`) — não tira acento. Os dados do usuário não estão nesta máquina (bancos locais de setembro):
  a causa exata do caso dele não pode ser confirmada aqui — daí o aviso na tela que diz o motivo.

## Medir no fechamento

```
node .claude/skills/relatorio-semanal/scripts/horas.js --desde 2026-11-24 --ate 2026-11-24 --grupos "Familias=[Ff]am[ií]lia"
```
