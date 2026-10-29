# Estimativa 2026-10-29 — Frota: B97, aviso do destino renomeado na Editar Viagem

Item 2(d) da "Próxima tarefa detalhada" do plano da Etapa 9. Só tela: `DestinoDaViagemGestor` em
`client/src/components/frotas/DestinoGestor.js` ganha uma nota quando a opção de mesmo id tem nome diferente do gravado na viagem.
A regra (a viagem guarda o nome da hora, B97) não muda.

| # | Tarefa | Execução estimada | Fator | Informado | Etapa/plano | Régua usada | Execução medida | Realizado | Commits |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Aviso de destino renomeado | 30 min | ×2 + 30 min | 1h30 | avulso (backlog 2d) | ajuste pontual de tela | — | — | — |

Medição no fechamento:
```
node .claude/skills/relatorio-semanal/scripts/horas.js --desde 2026-10-29 --ate 2026-10-30 --grupos "B97=renomeado"
```
