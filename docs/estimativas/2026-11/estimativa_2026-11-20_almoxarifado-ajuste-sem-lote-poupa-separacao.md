# Estimativa 20/11/2026 — Ajuste sem lote que poupa a caixa separada (C548) (45 min)

Etapa 254, item 1. O C548 não tinha linha na estimativa de 18/11 (achado na revisão final da Etapa 253). O item 2 da Etapa 254 (o item
27 da estimativa de 18/11, *cadastro a completar*) já tem a linha dele lá e é medido por ela.

**Medido no código (20/11):** `stockService.syncSaldoLocalizacaoPadrao`, `drenar` do AJUSTE sem localização: com lote, duas passadas
(primeiro a parte não guardada pela caixa viva, `parteGuardadaDeOutrasPorPar`); **sem lote, a passada única da Etapa 51** (a maior linha
primeiro, a da caixa inclusive). A régua `parteGuardadaDeOutrasPorPar` já devolve os pares sem lote (chave `origem|`), então o conserto é
estender as duas passadas ao ramo sem lote. Só a ida (o estorno sem lote não drena). A sonda (teste vermelho) vem antes do código.

Régua: fatia do almoxarifado no motor (estimativa-de-tarefas, passo 3: ~1h15 a 1h30) — mas é a extensão de um conserto que já existe no
ramo com lote (Etapa 253, Fase 5: 0,4 h para o item 18 inteiro), então **45 min**, como o C548 já dizia.

| # | Tarefa | Execução estimada | Régua horas.js | Informado | Etapa/plano | Régua usada | Execução medida | Realizado | Commits |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Ajuste sem lote poupa a prateleira separada (C548) | 45 min | motor, extensão da Etapa 253 | 45 min | Etapa 254 (`2026-11-20-almoxarifado-etapa254-ajuste-poupa-caixa-e-cadastro-a-completar.md`) | fatia do motor | — | — | — |

## Medição no fechamento

```
node .claude/skills/relatorio-semanal/scripts/horas.js --desde 2026-11-20 --ate 2026-11-21 --grupos "C548=C548;Sobra e remessa=cadastro a completar"
```

Pacote: os dois itens rodam na mesma sessão; se os commits citarem os dois, rateie pela proporção do estimado (45 min : 1h30).
