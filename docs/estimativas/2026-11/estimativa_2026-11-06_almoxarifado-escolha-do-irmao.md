# Estimativa 2026-11-06 — a entrega com "Sai de" respeita a guarda do irmão (C496)

Achado da Fase 5 da Etapa 207 (anterior, igual antes e depois da 207), registrado como **C496** em
`docs/almoxarifado-novidades-por-etapa.md` e como "Próxima tarefa detalhada" do plano
`docs/superpowers/plans/2026-11-06-almoxarifado-etapa207-entrega-respeita-guarda-sem-lote.md`. O caso (c) da entrega (Etapa 200) só confere outras
requisições (`memoParteGuardadaDeOutras(db, requisicaoId)`), e o mesmo par acima da parte nem entra no caso (c). Cenário: A 3, B 5; item 1 com 1
de A + 1 sem origem; item 2 com 2 de A; entregar 2 do item 1 escolhendo A → 200 e A 1; o item 2 → 400 "não serve mais".

Régua: Etapa 200 (o caso (c) com a E1, execução 1h15) — mesmo porte, reaproveita a régua e a literal. A parte do André pela tabela do passo 3
(estoque/saldo: 1h + 2h).

| # | Tarefa | Porte | Análise | Execução | Teste e conferência | Informado | Etapa/plano | Execução medida | Realizado | Commits |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Entrega com "Sai de" respeita a guarda do irmão (C496) | motor (leitura sob trava já existente) | 1h | 1h | 2h | 4h | 208 (plano `025d7109`) | 2,6 h (horas.js --grupos "E208=Etapa 208", 06/11) → 3h | 6h (3h + análise 1 h + teste 2 h, da tabela — não informado pelo André). Estouro de 2 h: a Fase 2 achou que no fluxo normal da tela a recusa caía na peça errada (adiamento da conferência física), a tela entrou, e o sorteio subiu de 400 para 2000 casos para cobrir a 2ª forma | 025d7109 … d88a53bc, 5fd09e22 |

Medição no fechamento:
```
node .claude/skills/relatorio-semanal/scripts/horas.js --desde 2026-11-06 --ate <fim> --grupos "Escolha do irmao=Etapa 208|C496"
```
