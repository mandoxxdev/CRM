# Estimativa 2026-10-29 — Frota: endereço do destino, destino na viagem do gestor, origem GMP, botão de ajuda

> **Feita depois de começar.** A regra da estimativa prévia entrou no CLAUDE.md em 29/10, com a Etapa 9 já em execução (plano
> `d7ba0b09`, servidor e tela já mesclados) e o item 4 já feito (`d5a9d565`). Os valores abaixo foram fixados **antes** de medir o
> gasto, pela régua da skill — não foram ajustados ao que já tinha sido gasto.

| # | Tarefa | Estimado | Etapa/plano | Régua usada | Gasto | Commits |
|---|---|---|---|---|---|---|
| 1 | Destino com endereço completo (CEP ou à mão) | 1h30 | Frota Etapa 9 — `docs/superpowers/plans/2026-10-29-frotas-etapa9-endereco-do-destino.md`, spec 23 | etapa média (destinos da Etapa 8 ~2h a 2h30, dividido entre 1 e 2) | — | — |
| 2 | Destino da lista na Nova Viagem do gestor | 1h | idem | mudança pequena com regra (~1 h) | — | — |
| 3 | Origem com o endereço da GMP | 30 min | idem (RN-F9.21–24) | ajuste pontual de tela | — | — |
| 4 | Retirar o botão de ajuda "?" | 30 min | avulso | ajuste pontual (é o próprio exemplo da régua) | — | `d5a9d565`, `9a5f244d` |

Os itens 1 a 3 saem nos mesmos commits ("Frota Etapa 9"); o gasto será medido junto e repartido pela proporção estimada.

Medição no fechamento:
```
node .claude/skills/relatorio-semanal/scripts/horas.js --desde 2026-10-29 --ate 2026-10-29 --grupos "Etapa9=Frota Etapa 9;Ajuda=botao de ajuda|HelpGuide"
```
