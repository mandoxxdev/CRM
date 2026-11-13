# Estimativa 13/11/2026 — almoxarifado: a entrega não deixa marcar série de lote impedido (D (231) 1)

Origem: "Próxima tarefa detalhada" do plano da Etapa 231 (`docs/superpowers/plans/2026-11-13-almoxarifado-etapa231-entrega-origem-lote-impedido.md`,
`:193-214`).

Medido no código antes de estimar (sobre `a0c5a30d`):

- **A lista de séries da entrega.** `RequisicoesList.js`: `seriesDoLote(info, loteId)` (`:374`) mostra todas as séries `EM_ESTOQUE` quando o
  "Sai de" não tem lote (`__escolher__`, automático, em branco, "Planejada da separação" sem saldos); `seriesDoItem` (`:1286`) e
  `entregaSeriesPendente` (`:1302`) seguram o Confirmar pela contagem; o checkbox é desenhado em `:2882-2896`.
- **A série não diz a situação do lote.** `GET /materiais/:id/series` (`extended.js:1387`) → `seriesService.listarSeriesDoMaterial`
  (`seriesService.js:31`) traz `lote_codigo` e nada mais do lote. Cruzar com as linhas de saldo da janela falha quando a série está num lote
  sem linha de saldo positiva — o servidor ganha os quatro campos aditivos da 231 (`lote_status`, `lote_validade`, `lote_esta_impedido`,
  `lote_vencido_sem_liberacao`, régua `predicadoLoteImpedidoSql` da 224). A tela usa `situacaoDoLote` (as palavras do extrato).
- **A separação não tem lista de séries** (só a entrega busca `/series`, Etapa 61). Celular: sem entrega (Etapa 231, Fase 0 item 7).
- Sem banco, sem trava, sem perfil, a porta `/entregar` não muda.

| # | Tarefa | Execução estimada | Fator | Informado | Etapa/plano | Régua usada | Execução medida | Realizado | Commits |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Na entrega, as séries de lote impedido vêm apagadas com a situação, e não contam para o Confirmar (D (231) 1) | 45 min | média (análise 30 min + teste 1 h) | 2h15 → 2h30 (arredondado na unidade de 30 min) | 232 | 231 (mesma janela, servidor aditivo + tela) mediu 0,7 h | 0,8 h (~48 min) | 2h30 (48 min + análise 30 min + teste 1 h = 2h18, arredondado; a parte do André é a da tabela — não informada por ele) | 46900440, a78a80ec, 533349da, 7aa1f239, 29201ab2, d7e9074d e o de estimado x realizado |

Incerteza: baixa — o risco é a série marcada antes de o lote ser bloqueado (o reler das séries precisa desmarcar a que ficou impedida).

Medição no fechamento:
```
--grupos "E232=Etapa 232|Estimativa: almoxarifado - entrega nao deixa marcar serie"
```

No fechamento: execução medida 0,8 h (horas.js --grupos "E232=…", 13/11). O estimado de execução (45 min) ficou próximo do medido (~48
min); a maior parte foi a Fase 5 (cenários de teste que faltavam, ~29 min). Realizado 2h30 contra 2h30 estimado. Conclusão:
`conclusao_2026-11-13_almoxarifado-entrega-series-lote-impedido.txt`.
