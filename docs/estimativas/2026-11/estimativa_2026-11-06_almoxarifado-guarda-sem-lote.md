# Estimativa 2026-11-06 — a entrega não leva a guarda sem lote de outro item (C490)

Achado da 3ª revisão da Fase 5 da Etapa 206 (anterior à 206, vem da 196), registrado como **C490** em
`docs/almoxarifado-novidades-por-etapa.md` e como "Próxima tarefa detalhada" do plano
`docs/superpowers/plans/2026-11-06-almoxarifado-etapa206-entrega-recusa-lote-impedido.md`. Não estava no 2º pacote: entra antes dos itens 8 e 9
dele porque atinge o caso comum (material sem controle de lote). Cenário: sem controle de lote, A=3, B=2; item 1 separou 3 sem origem, item 2
separou 2 de A; entregar os 3 do item 1 leva todo A; a próxima entrega do item 2 → 400 "a origem da separação (…) não serve mais".

Régua: Etapas 196 (2h de execução), 197 (2h30), 206 (2h) — motor da entrega. A parte do André pela tabela do passo 3 (estoque/saldo: 1h + 2h).

| # | Tarefa | Porte | Análise | Execução | Teste e conferência | Informado | Etapa/plano | Execução medida | Realizado | Commits |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Entrega não leva a guarda sem lote de outro item (C490) | motor | 1h | 1h a 1h30 | 2h | 4h a 4h30 | — | — | — | — |

Medição no fechamento:
```
node .claude/skills/relatorio-semanal/scripts/horas.js --desde 2026-11-06 --ate <fim> --grupos "Guarda sem lote=Etapa 207|C490"
```
