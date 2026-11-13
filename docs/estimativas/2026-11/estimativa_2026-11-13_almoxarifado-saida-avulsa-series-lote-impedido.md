# Estimativa 13/11/2026 — almoxarifado: a saída avulsa não deixa marcar série de lote impedido (D (232) 1)

Origem: "Próxima tarefa detalhada" do plano da Etapa 232 (`docs/superpowers/plans/2026-11-13-almoxarifado-etapa232-entrega-series-lote-impedido.md`,
`:171-192`). Teto pedido: 3 h.

Medido no código antes de estimar (sobre `8926323c`):

- **A lista da tela.** `MovimentacoesAlmoxarifado.js:1217-1238`: SAIDA e PERDA (`TIPOS_SAIDA_LOTE`, `:95`) listam as séries `EM_ESTOQUE`
  filtradas só por `form.lote_id`; com o lote em branco aparecem as de todos os lotes. O ajuste negativo (`:1285-1308`) tem lista própria.
  O seletor de lote já apaga o lote que o tipo não aceita (`loteDisponivelParaTipo`, `:120`: SAIDA por `elegivel`, PERDA só por status).
- **A régua do motor por tipo** (`stockService.js:1569-1607`): com lote informado, status ≠ ATIVO recusa em toda saída; vencido sem
  liberação recusa só fora dos `tiposDescarte` (SUCATA, PERDA, AJUSTE_NEGATIVO, …). O AJUSTE (`tiposAjuste`) não tem guarda de lote.
- **Sonda executada (premissa do plano da 232 errada):** com o lote em branco o motor **não** olha o lote das séries. Material sem
  controle de lote, séries em L2 bloqueado/reprovado/vencido: SAIDA e PERDA sem `lote_id` → **201** (a série sai). Com controle de lote,
  o lote em branco é recusado por "exige lote" (não pelo lote impedido). O ajuste negativo baixa série de qualquer lote → 201.
  O plano da 232 dizia "marcadas, o motor recusa (`stockService.js:~1571`)" — vale só com o lote escolhido.
- **Conclusão:** apagar só na tela deixaria a tela mais estrita que o servidor; a porta manual (rota v2/v1) passa a checar o lote das
  séries quando o lote vem em branco (a mesma régua e as mesmas mensagens), por opção declarada só pelas rotas manuais. A tela apaga pela
  mesma régua por tipo. Ajuste: não muda (o motor aceita).
- Sem banco, sem coluna nova, sem perfil; a listagem `/series` já traz a situação (B1523, Etapa 232).

| # | Tarefa | Execução estimada | Fator | Informado | Etapa/plano | Régua usada | Execução medida | Realizado | Commits |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Na saída avulsa, as séries que o tipo não pode baixar vêm apagadas, e a porta manual recusa a série de lote impedido com o lote em branco (D (232) 1) | 1 h | média (análise 30 min + 30 min de decisão de regra por tipo + teste 1 h) | 3h | 233 | 232 (mesmo molde, servidor aditivo + tela) mediu 0,8 h; aqui há guarda nova no motor | 0,7 h (~43 min, sem o fechamento) | 3h (43 min + análise 30 min + decisão de regra 30 min + teste 1 h = 2h43, arredondado na unidade de 30 min; a parte do André é a da tabela — não informada por ele) | 1111ea13, b3fc7a0a, 3ec94b9f, 308ef6b6 e os de fechamento |

Incerteza: baixa a média — o risco é algum chamador interno mandar série de lote impedido sem lote (por isso a guarda vale só para quem
declara a opção: as rotas manuais).

Medição no fechamento:
```
--grupos "E233=Etapa 233|Estimativa: almoxarifado - saida avulsa"
```

No fechamento: execução medida 0,7 h (horas.js --grupos "E233=…", 13/11), quase toda na Fase 5 (~32 min: o rótulo da Perda e cinco cenários de teste). A estimativa de execução (1 h) ficou acima do medido; o realizado bate com o estimado (3h) porque a parte de análise e teste é a da tabela. Conclusão: `conclusao_2026-11-13_almoxarifado-saida-avulsa-series-lote-impedido.txt`.
