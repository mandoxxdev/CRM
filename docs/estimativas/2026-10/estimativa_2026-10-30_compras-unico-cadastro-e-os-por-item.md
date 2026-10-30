# Estimativa 2026-10-30 — Cadastro de material só no Compras; OS por item do pedido

Pedido do André (30/10, depois da Etapa 192): "7 - Apenas compras cadastra materiais, almoxarifado só visualiza e libera. Então vamos
retirar a tela de cadastro de materiais do almoxarifado e apenas o compras fará isso." e "8 - podemos incluir manualmente em cada item,
pois teremos as informações da OS na liberação do material. Precisamos da informação no pedido, apenas para justificar a compra".
O 8 substitui o plano de 25 h (`docs/superpowers/plans/2026-10-30-compras-varias-os-no-pedido-planejamento.md`): sem reserva por OS no
recebimento, não toca o almoxarifado.

Medido: o Almoxarifado cria material também em `SobrasAlmoxarifado.js:320` e `RemessasTerceirosAlmoxarifado.js:314` (fluxos de
operação, ficam); a tela de cadastro está em `MateriaisAlmoxarifado.js` (Novo, Editar, Inativar, Reativar), `MaterialAlmoxarifadoForm.js`
(foto), `AlmoxarifadoDashboard.js:227/238` e `ConfiguracoesAlmoxarifado.js:723/866/925` (atalhos). O Compras (Etapa 192) não tem foto
nem inativar; o gate aceita também Almoxarife/Engenharia/Administrador do almoxarifado.

| # | Tarefa | Porte | Análise | Execução | Teste e conferência | Informado | Execução medida | Realizado | Commits |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Almoxarifado só consulta materiais | várias telas + decisão | 30 + 30 min | 1h | 1h30 | 3h30 | rateada (ver abaixo) | 3h30 | `d08fe42d`, Fase 5 `1bf416a6` `ef76ab8a` `a3c9ab8c` `262c6bd5` |
| 2 | Compras completa o cadastro (foto, inativar, só o Compras) | média + perfil + decisão | 30 + 30 min | 1h | 1h + 30 min | 3h30 | rateada | 3h30 | `19c69056`, Fase 5 `4aff81aa` `d750afd2` `417600ed` `400547b3` |
| 3 | OS por item do pedido | média + impressão | 30 min | 1h | 1h + 30 min | 3h | rateada | 3h | `6a944fb5`, `506abcb4`, `d378f91d`, Fase 5 `a156987d` `7f6c5f8e` |

Medição no fechamento:
```
node .claude/skills/relatorio-semanal/scripts/horas.js --desde 2026-10-30 --ate 2026-10-31 --grupos "So consulta=so consulta|Etapa 193.*A;Compras cadastra=Compras completa|Etapa 193.*C;OS por item=OS por item|Etapa 193.*O"
```

## Fechamento (2026-10-30)

Execução medida (`horas.js`, commits `ae1c519f`…`cf834c27`): **~2,4 h** no total; os dois galhos rodaram em paralelo, então a medida
por commit não separa as tarefas (ex.: `6a944fb5` ~0 min, `506abcb4` ~52 min). Rateada pela execução estimada (2,4 h ÷ 3 h ≈ 0,8 h por
tarefa), somada à parte do André **estimada** (não informada: 2h30, 2h30 e 2h) e arredondada para cima em 30 min. A Fase 5 (5 correções
+ 5 testes) está dentro das três. Realizado total: **10h**, igual ao estimado.
