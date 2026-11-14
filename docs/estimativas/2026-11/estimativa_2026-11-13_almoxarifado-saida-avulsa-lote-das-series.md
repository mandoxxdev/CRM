# Estimativa 13/11/2026 — almoxarifado: a saída avulsa com série grava o lote das séries (D (233) 2)

Origem: "Próxima tarefa detalhada" do plano da Etapa 233 (`docs/superpowers/plans/2026-11-13-almoxarifado-etapa233-saida-avulsa-series-lote-impedido.md`,
`:176-196`). Teto pedido: 3 h (cabendo o conserto do motor; o acerto das saídas antigas fica como consulta na letra A, sem alteração
automática de dado).

Medido no código antes de estimar (sobre `96db190f`):

- **Sonda executada (rota v2 real, `zzSonda234`, apagada):** material sem controle de lote, A1/A2 em L1 e B1/B2 em L2. SAIDA `[B1]` sem
  `lote_id` → 201, o livro grava `lote_id` NULL, a linha `lote_id NULL` vai a −1, L2 continua com 2 e `GET /lotes/resumo` diz
  `{ fisico: 3, soma_lotes: 4, sem_lote_atribuido: -1 }`. SAIDA `[A1, B2]` em branco → 201, "sem lote" −3, `soma_lotes` 4 com físico 1.
- **O estorno de uma SAIDA com `lote_id`** devolve ao lote (sonda: L3 volta a 2, `soma_lotes` = físico, série `EM_ESTOQUE` no L3) — gravar
  o lote certo na saída não exige mexer no estorno.
- **O motor** (`stockService.js:1347-1371`) resolve o lote antes de tudo (`loteIdFinal`) e o usa no claim do lote (`claimSaldoDoLote`),
  no claim das séries e no livro. A régua `lotePelasSeries` (B1527, Etapa 233, `:1624-1631`) já lê os lotes das séries dentro da trava.
  O passo é, com **um** lote só, usá-lo como o lote resolvido; com lotes diferentes, recusar (a entrega de requisição já recusa).
- **A tela** (`MovimentacoesAlmoxarifado.js`, lista de séries da Saída/Perda) já tem `lote_id`/`lote_codigo` de cada série: a frase
  nova é de leitura, sem chamada nova.
- Sem coluna nova, sem perfil, sem celular (o celular não tem saída avulsa com série).

| # | Tarefa | Execução estimada | Fator | Informado | Etapa/plano | Régua usada | Execução medida | Realizado | Commits |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Na saída avulsa com o lote em branco, a peça sai do lote dela (o motor deriva o lote das séries; lotes diferentes recusados; frase na tela; consulta das saídas antigas na letra A) (D (233) 2) | 1 h | média (análise 30 min + 30 min de decisão de regra: lotes diferentes + teste 1 h) | 3h | 234 | 233 (mesma régua, servidor + tela) mediu 0,7 h; aqui o lote muda a linha de saldo baixada | 0,8 h (~51 min, com o fechamento) | 3h (51 min + análise 30 min + decisão de regra 30 min + teste 1 h = 2h51, arredondado na unidade de 30 min; a parte do André é a da tabela — não informada por ele) | fc5ed3be, ff467bd7, 113b07e3, 8897c09e, 17b8d71d e o do estimado × realizado |

Incerteza: média — é mudança na linha de saldo baixada; o risco é a linha do lote não cobrir a quantidade (dado antigo), o que o claim do
lote já recusa com a mensagem de saldo do lote.

Medição no fechamento:
```
--grupos "E234=Etapa 234|Estimativa: almoxarifado - saida avulsa grava o lote"
```

No fechamento: execução medida 0,8 h (horas.js --grupos "E234=…", 13/11), quase toda no fechamento da documentação (~36 min); a Fase 5 achou um caso real (a série regularizada com lote sem a peça no saldo dele) e cinco lacunas de teste. A estimativa de execução (1 h) ficou perto do medido; o realizado bate com o estimado (3h). Conclusão: `conclusao_2026-11-13_almoxarifado-saida-avulsa-lote-das-series.txt`.
