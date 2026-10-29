# Estimativa 2026-10-29 — Frota: endereço do destino, destino na viagem do gestor, origem GMP, botão de ajuda

> **Feita depois de começar.** A regra da estimativa prévia entrou no CLAUDE.md em 29/10, com a Etapa 9 já em execução (plano
> `d7ba0b09`, servidor e tela já mesclados) e o item 5 já feito (`d5a9d565`). Valores fixados pela régua da skill, não ajustados ao
> gasto.
>
> **Revisada no mesmo dia** (pedido do André, "recalcule o tempo"): a 1ª versão (3h30, `78e93c18`) informava só a execução. A skill
> passou a somar a parte do André (`9e5fb556`): informado = execução × 2 (× 2,5 com celular) + 30 min de análise, mínimo 1 h,
> arredondado para cima; acima de 4 h, dividir — por isso o antigo item 1 virou 1 e 2.

| # | Tarefa | Execução estimada | Fator | Informado | Etapa/plano | Régua usada | Execução medida | Realizado | Commits |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Endereço do destino — celular do motorista | 1h | ×2,5 (celular) + 30 min | 3h | Frota Etapa 9, `docs/superpowers/plans/2026-10-29-frotas-etapa9-endereco-do-destino.md`, spec 23 | mudança pequena com regra (~1 h) | — | — | — |
| 2 | Endereço do destino — tela de Destinos | 30 min | ×2 + 30 min | 1h30 | idem | ajuste pontual de tela | — | — | — |
| 3 | Destino da lista na Nova Viagem do gestor | 1h | ×2 + 30 min | 2h30 | idem | mudança pequena com regra | — | — | — |
| 4 | Origem com o endereço da GMP | 30 min | ×2 + 30 min | 1h30 | idem (RN-F9.21–24) | ajuste pontual de tela | — | — | — |
| 5 | Retirar o botão de ajuda "?" | 30 min | ×2 + 30 min | 1h30 | avulso | ajuste pontual (o exemplo da régua) | 30 min (parcial, `horas.js` 29/10) | — | `d5a9d565`, `9a5f244d` |

Itens 1 a 4 saem nos mesmos commits ("Frota Etapa 9"); a execução medida será repartida pela proporção estimada.
Execução medida até 29/10 15:45 (por baixo, só o que já foi commitado): Etapa 9 ~0,6 h; botão de ajuda ~0,5 h.

Medição no fechamento:
```
node .claude/skills/relatorio-semanal/scripts/horas.js --desde 2026-10-29 --ate 2026-10-29 --grupos "Etapa9=Frota Etapa 9;Ajuda=botao de ajuda|HelpGuide"
```
