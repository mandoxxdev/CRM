# Estimativa 25/11/2026 — Movimento das telas (referência TikTok "Dashboard V14")

Pedido do P.O. ao vivo, 25/11/2026, comparando de novo com o vídeo de referência: *"as animações do vídeo do TikTok que eu te
mandei, aqui não tá assim. Tem que ter mais animações e etc, assim fica muito feio"*. **Registrada depois de executar** — a rodada foi
pedida e feita no mesmo fluxo da revisão ao vivo, sem passar por aqui antes; fica o registro para o estimado × realizado não ter buraco.
Vídeo revisto quadro a quadro antes de fazer (viewer temporário em `client/public/_rev`, apagado).

| # | Tarefa | Execução estimada | Régua horas.js | Informado | Etapa/plano | Régua usada | Execução medida | Realizado | Commits |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Números dos painéis que contam até o valor | 1h | 1h | 1h | `docs/TEMA_APPLE.md` (quarta rodada) | Motor por DOM + teste com relógio de quadros (porte "média") | rateio de 0,6 h | 15min | `d49c2187` |
| 2 | Entrada em cascata de todas as telas | 1h | 1h | 1h | idem | Folha CSS genérica por padrão de classe (como a varredura de 24/11) | rateio de 0,6 h | 15min | `d49c2187` |
| 3 | Marcador do menu que desliza | 45min | 45min | 45min | idem | Gancho de medição + CSS nos dois shells | rateio de 0,6 h | 15min | `d49c2187`, `38faf3ff` |
| 4 | Troca de tema mais rápida e resposta ao toque | 30min | 30min | 30min | idem | Ajuste de duração + hover/active | rateio de 0,6 h | 15min | `d49c2187` |

## Fechamento (25/11/2026)

`horas.js --desde 2026-11-25 --ate 2026-11-25 --grupos "Movimento=Movimento da referencia|Pilula do menu no escuro"` mediu **0,6 h**
para o pacote, rateado pela execução estimada e arredondado para cima por tarefa (total 1h). **Por baixo:** a rodada inteira foi um
commit só no fim (o medidor conta o intervalo entre commits e dá ~30 min para um commit isolado). O relógio de parede foi mais que o
dobro: revisão do vídeo, três rodadas de medição no painel (que estava com a renderização pausada — ver memória
`preview-pane-hidden-raf-timers`), remoção dos dois contadores antigos e o teste automatizado. Mesma lição da proposta bilíngue:
**commitar por tarefa**.

## Medir no fechamento

```
node .claude/skills/relatorio-semanal/scripts/horas.js --desde 2026-11-25 --ate 2026-12-31 --grupos "Movimento=Movimento da referencia|Pilula do menu|[Cc]ascata|[Cc]ontagem|motorDeMovimento"
```
