# Estimativa 13/11/2026 — almoxarifado: o extrato diz qual lote está impedido (C528)

Origem: "Próxima tarefa detalhada" do plano da Etapa 223 (`docs/superpowers/plans/2026-11-13-almoxarifado-etapa223-listas-lote-impedido.md`).

Medido no código antes de estimar (sobre `e0bca4f1`):

- A tabela *Saldos por localização* (`client/src/components/almoxarifado/ExtratoMaterialModal.js:223-250`) lê
  `saldos_localizacao` do `GET /materiais/:id/extrato` (`routes/almoxarifado/extended.js:1067`), que chama
  `stockService.consultarSaldosPorLocalizacao` (`stockService.js:4020`) — já com `LEFT JOIN lotes_almoxarifado lt`. A mesma função
  alimenta `GET /estoque/:materialId/saldos` (`extended.js:855`), lido pelo "Sai de" da entrega (`RequisicoesList.js:601`).
- `estoque_saldo_almoxarifado` não tem `status`, `data_validade` nem `vencimento_liberado_em` (`schema.js:1489`): sem colisão com `s.*`.
- A régua `predicadoLoteImpedidoSql(l)` (`loteImpedido.js:45`) existe; com lote nulo dá verdadeiro — guardar com `lt.id IS NOT NULL`.
- Status de lote: `ATIVO`, `BLOQUEADO`, `REPROVADO` (`lotService.js:23`).
- Nenhum teste compara o conjunto exato de chaves das linhas de saldo (`deepStrictEqual(Object.keys` em `tests/api`).
- Sem migration, sem trava (leitura), sem perfil novo. Fatia visível: a situação do lote na tabela do extrato.

| # | Tarefa | Execução estimada | Fator | Informado | Etapa/plano | Régua usada | Execução medida | Realizado | Commits |
|---|---|---|---|---|---|---|---|---|---|
| 1 | A tabela de saldos do extrato mostra a situação e a validade de cada lote impedido (C528) | 45 min | média (análise 30 min + teste 1 h) | 2h15 | 224 | Etapas 222 e 223 mediram 0,7 h cada (um campo de leitura + tela pequena); aqui um campo numa função + uma coluna | 0,7 h (horas.js --grupos "E224=…", 13/11) → 45 min | 2h15 (45 min + análise 30 min + teste 1 h, da tabela — não informado pelo André) | 98b90f22, c3658f89, f09e8ec7, c7399966, e1c6cf6d, 2225b41c e este |

Incerteza: baixa — mesma régua já testada nas 222/223. Não foi quebrada: 2h15 não passa do teto da skill.

Medição no fechamento:
```
--grupos "E224=Etapa 224|Estimativa: almoxarifado - extrato diz qual lote"
```

No fechamento: execução estimada 45 min, medida 0,7 h (a Fase 2 rodou junto da T1; as duas revisões da Fase 5 junto com a suíte). Três etapas seguidas de leitura com tela pequena mediram 0,7 h: a régua de 45 min para esse porte se confirma.
