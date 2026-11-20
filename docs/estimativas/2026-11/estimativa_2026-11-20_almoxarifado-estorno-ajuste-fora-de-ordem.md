# Estimativa 20/11/2026 — o estorno do Ajuste sem localização fora de ordem (C550) (1h15)

Etapa 258, item único. É a "próxima tarefa detalhada" (item 2) do plano da Etapa 257: o aviso **C550** (achado da Fase 2 da 257).
Os itens 24-26 da estimativa de 18/11 continuam esperando resposta e não entram aqui.

**Medido (20/11), sonda executada sobre o HEAD `e904ba73` (`scratchpad/sab-258-sonda.js`, pela rota):**
- C550: padrão *A* 3, *B* 5; Saída de 6 (*A* 0, *B* 2); Ajuste para 1 (*A* 0, *B* 1); estorno da Saída (total 7, *A* 3, *B* 4); **estorno do
  Ajuste → total 2, *A* −2, *B* 4** (certo: total 8, *A* 3, *B* 5). Material sem negativo.
- Entrada depois do Ajuste: *A* 3; Ajuste para 1; Entrada de 5 em *B*; **estorno do Ajuste → total 3, *A* −2, *B* 5** (certo: 8, *A* 3, *B* 5).
- Ajuste para cima e saída depois: *A* 2; Ajuste para 10; Saída de 9; **estorno → total 2, *A* 2** (inventa 8 peças; pela diferença daria −7).
- Ajuste para cima, saída da padrão: *A* 2, *B* 5; Ajuste para 10 (*A* 5); Saída de 5 de *A*; **estorno → total 7** (inventa 5; pela diferença
  total 2 e, sem drenar, *A* −3).
- Sem movimento depois: os dois cálculos dão o mesmo (total 3, *A* 3).
- Causa: `cancelarMovimentacao`, ramo `AJUSTE` sem localização: `UPDATE … SET quantidade_atual = saldo_anterior` (valor fixo) e o resíduo na
  padrão por `syncSaldoLocalizacaoPadrao` (sem lote não drena). O ramo com localização já estorna por diferença.

Régua: as Etapas 256 e 257 (mesma família: estorno no motor, Fase 2 e Fase 5 com sonda) mediram 0,8 h e 0,9 h pelo `horas.js`; esta
reescreve o manual em três lugares e muda um teste que afirmava o defeito: **1h15**.

| # | Tarefa | Execução estimada | Régua horas.js | Informado | Etapa/plano | Régua usada | Execução medida | Realizado | Commits |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Estornar um ajuste desfaz só a diferença que ele fez | 1h15 | motor/estorno (E256 0,8 h; E257 0,9 h) | 1h15 | Etapa 258 (`2026-11-20-almoxarifado-etapa258-estorno-ajuste-fora-de-ordem.md`) | fatia do almoxarifado no motor | 1,5 h (horas.js 20/11, grupo "Etapa 258|Estimativa: estorno do ajuste fora de ordem") | 1h30 | `4f4240bd`, `6b968923`, `8f0ce1f5`, `3dc41e84`, `1663f022`, `9e9bab9c` |

## Medição no fechamento

```
node .claude/skills/relatorio-semanal/scripts/horas.js --desde 2026-11-20 --ate 2026-11-21 --grupos "Estorno do ajuste fora de ordem=Etapa 258|Estimativa: estorno do ajuste fora de ordem"
```

**Etapa 258 (20/11):** não revisada. Medido 1,5 h (~89 min, arredondado para 1h30) — 15 min acima do estimado: a revisão do plano e a
revisão final acharam dois casos novos que viraram regra (o ajuste mais recente que trava o estorno, a guarda do bloqueado no material que
aceita negativo). A régua do grupo foi trocada para não pegar um commit da 257 cujo assunto também diz "ajuste fora de ordem". A suíte do
servidor inteira (duas vezes, ~45 min de relógio cada, sem commit no meio) não entra no horas.js.
