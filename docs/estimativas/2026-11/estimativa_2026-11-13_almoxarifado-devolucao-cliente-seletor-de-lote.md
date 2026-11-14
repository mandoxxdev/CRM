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
| 1 | A janela de devolução ao cliente pede o lote (seletor com saldo/validade/situação; séries filtradas pelo lote) (D (235) 1) | 45 min | análise 15 min (a tarefa já vem detalhada no plano da 235, sem decisão com quem pediu) + teste 1 h (média: lote com e sem série) | 2h | 236 | 235 (servidor + tela) mediu 0,8 h com o fechamento; aqui só a tela | 0,9 h (~51 min, com o fechamento ~38 min) | 2h30 (51 min + análise 15 min + teste 1 h = 2h06, arredondado na unidade de 30 min; a parte do André é a da tabela — não informada por ele) | 76df58b0, c31d2472, 5f5c1af4, 9028e544, 759fe445 e o do estimado × realizado |

Incerteza: baixa (servidor e lista de lotes prontos; molde do seletor em Movimentações).

Medição no fechamento:
```
--grupos "E236=Etapa 236|Estimativa: almoxarifado - devolucao ao cliente de material com lote"
```

No fechamento: execução medida 0,9 h (horas.js --grupos "E236=…", 13/11), quase metade na documentação (~38 min). A Fase 2 achou o lote do material anterior indo junto ao trocar de material e o pedido de séries que sumia com o controle de lote; a Fase 5 não achou defeito de produção e fechou cinco lacunas de teste. O realizado passou 30 min do estimado pelo arredondamento (2h06 → 2h30). Conclusão: `conclusao_2026-11-13_almoxarifado-devolucao-cliente-seletor-de-lote.txt`.
