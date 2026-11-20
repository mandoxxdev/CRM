# Estimativa 20/11/2026 — o estorno da Saída devolve às prateleiras de onde a baixa saiu (C544) (1h15)

Etapa 257, item único. É a "próxima tarefa detalhada" (item 2) do plano da Etapa 256: o aviso **C544** (Etapa 239).
Os itens 24-26 da estimativa de 18/11 continuam esperando resposta e não entram aqui.

**Medido (20/11), sonda executada sobre o HEAD `3c478876`:**
- Sem lote, padrão *A* 3 e *B* 5, Saída de 6 sem origem → *A* 0, *B* 2; **estorno → *A* 6, *B* 2** (certo: *A* 3, *B* 5).
- Padrão *P* vazia, *A* 4 e *B* 4, Saída de 6 → *A* 0, *B* 2; **estorno → *A* 0, *B* 2, *P* 6** (certo: *A* 4, *B* 4, *P* 0).
- Ida: `registrarMovimentacaoSemTrava`, ramo de saída — o rastreador `saldoLinhasSaidaParaReverter` já tem as linhas baixadas
  (`claimSaldoDoLote` com lote, `claimSaldoSemLote` sem lote, a linha única do material que permite negativo). Ninguém grava.
- Estorno: `cancelarMovimentacao`, ramo de saída — `loc = mov.localizacao_origem_id || material.localizacao_padrao_id` e
  `ajustarSaldoExistente` numa chave só (a pendência "o endereçamento pode consolidar" da spec 10).
- Banco: a tabela da Etapa 256 (`ajuste_linhas_drenadas_almoxarifado`, chave `movimentacao_id`) serve sem mudança — nada de coluna nova.
- Todas as saídas passam pelo motor (saída avulsa, entrega de requisição, consumo, lote, série): um ponto de gravação e um de devolução
  cobrem todas — não precisa fatiar.

Régua: a Etapa 256 (mesma família, mesmo molde, motor com revisão do plano e revisão final com sonda) mediu 0,8 h pelo `horas.js`;
esta tem a mesma forma com um pouco mais de casos (lote, série, entrega): **1h15**.

| # | Tarefa | Execução estimada | Régua horas.js | Informado | Etapa/plano | Régua usada | Execução medida | Realizado | Commits |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Estornar uma saída devolve as peças às prateleiras de onde saíram | 1h15 | motor/estorno (E256 C549 0,8 h) | 1h15 | Etapa 257 (`2026-11-20-almoxarifado-etapa257-estorno-saida-devolve-prateleira.md`) | — | — | — | — |

## Medição no fechamento

```
node .claude/skills/relatorio-semanal/scripts/horas.js --desde 2026-11-20 --ate 2026-11-21 --grupos "Estorno da saida=Etapa 257|estorno da saida"
```
