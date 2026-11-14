# Estimativa 13/11/2026 — almoxarifado: a janela de devolução ao cliente ganha o seletor de lote (D (235) 1)

Origem: "Próxima tarefa detalhada" do plano da Etapa 235 (`docs/superpowers/plans/2026-11-13-almoxarifado-etapa235-devolucao-cliente-lote-das-series.md`,
`:183-206`). Teto pedido: 2h.

Medido no código antes de estimar (sobre `cb81f004`):

- **A janela** (`client/src/components/almoxarifado/MateriaisClienteAlmoxarifado.js:40,62-63,105,264-268`): material com `controle_lote === 1`
  mostra `#dev-exige-lote` (*"Este material tem controle por lote: a devolução pede o lote, e esta janela ainda não o oferece."*) e não envia.
- **A rota** (`server/routes/almoxarifado/extended.js:956-993`) já aceita `lote_id` (`DevolucaoClienteSchema`, `z.number().int().positive()`)
  e declara `exigeLote: true, exigeSerie: true, lotePelasSeries: true`. **Nada muda no servidor.**
- **A lista de lotes** (`GET /almoxarifado/materiais/:id/lotes?com_saldo=1`, `lotService.listarLotesDoMaterial:593`) já traz `status`,
  `vencido`, `vencimento_liberado`, `elegivel` (status ATIVO e, se vencido, liberado — a régua da Saída, que é a da devolução ao cliente:
  `DEVOLUCAO_CLIENTE` não é descarte, B1537), `saldo` e `data_validade`, em ordem FEFO. Responde a pergunta da Fase 0 do plano: sim, diz a
  situação.
- **Séries com lote:** a lista de séries traz `lote_id`; Movimentações filtra pelo lote escolhido (`MovimentacoesAlmoxarifado.js:417,1250`).
- Trabalho: só tela — seletor no modal, filtro das séries pelo lote, `lote_id` no corpo, tirar a `#dev-exige-lote` e o teste dela; testes de
  tela (RTL) e um teste de API que prove o contrato consumido (devolução com `lote_id` pela rota, lote vencido recusado).

| # | Tarefa | Execução estimada | Fator | Informado | Etapa/plano | Régua usada | Execução medida | Realizado | Commits |
|---|---|---|---|---|---|---|---|---|---|
| 1 | A janela de devolução ao cliente pede o lote (seletor com saldo/validade/situação; séries filtradas pelo lote) (D (235) 1) | 45 min | análise 15 min (a tarefa já vem detalhada no plano da 235, sem decisão com quem pediu) + teste 1 h (média: lote com e sem série) | 2h | 236 | 235 (servidor + tela) mediu 0,8 h com o fechamento; aqui só a tela | — | — | — |

Incerteza: baixa (servidor e lista de lotes prontos; molde do seletor em Movimentações).

Medição no fechamento:
```
--grupos "E236=Etapa 236|Estimativa: almoxarifado - devolucao ao cliente de material com lote"
```
