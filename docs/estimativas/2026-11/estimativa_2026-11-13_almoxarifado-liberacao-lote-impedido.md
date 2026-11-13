# Estimativa 13/11/2026 — almoxarifado: a inspeção e a NC olham o lote do item que liberaram (C519)

Origem: "Próxima tarefa detalhada" do plano da Etapa 228 (`docs/superpowers/plans/2026-11-13-almoxarifado-etapa228-estorno-lote-impedido.md`).

Medido no código antes de estimar (sobre `9384951f`):

- `reservaChegadaService.reservarLiberacaoParaQuemEspera` (`:591`): `teto = min(quantidade, disponivel)` (`:603`); o miolo
  (`distribuirSemLock`) já desconta o impedido do material (B1453), mas a porta não sabe o lote do item liberado.
- Quem chama: `inspectionService.decidirInspecao` (`:441`, `ctx` sem lote; o item lido em `:197` tem `lote_id`) e
  `nonConformityService` (`:1010`; `getInspecao` já traz `ri.lote_id`). A OS encerrada (`osEncerradaService.js:92`) não tem lote.
  As duas portas rodam com `sobTrava` (Etapa 91): o lote é lido dentro da seção.
- A régua pronta: `predicadoLoteImpedidoSql` + `controle_lote = 1` (molde `livreForaDeLoteImpedido`, 219; `loteImpedidoAgora`, 220).
- O aviso (`receiptNotificationService.avisarLiberacao`, B1457 c) usa o livre do material: com o teto zerado pelo lote ainda manda
  "Material liberado" se houver livre de outra entrada — conferir e decidir.
- Fatia visível: campo aditivo na resposta da inspeção e um aviso na tela (`InspecoesAlmoxarifado.js:289`).
- Sem migration, sem rota nova, sem perfil.

| # | Tarefa | Execução estimada | Fator | Informado | Etapa/plano | Régua usada | Execução medida | Realizado | Commits |
|---|---|---|---|---|---|---|---|---|---|
| 1 | A inspeção e a NC olham o lote das peças que liberaram (C519) | 1h | estoque/saldo, travas (análise 1h + teste 2h) | 4h | 229 | 221: 0,8 h; 228: 0,7 h (uma porta do motor, régua pronta) | 0,7 h (horas.js --grupos "E229=…", 13/11) → 45 min | 3h45 (45 min + análise 1 h + teste 2 h, da tabela — não informado pelo André) | 23076563, 041d3be6, f6e9230b, 046612a0, a989fb6e, f3e17d96 e este |

Incerteza: baixa — a régua e os testes de molde (`chegadaLoteImpedido` RN-219.04, `ncReservaLiberacao*`) existem.

Medição no fechamento:
```
--grupos "E229=Etapa 229|Estimativa: almoxarifado - inspecao"
```

No fechamento: execução estimada 1h, medida 0,7 h — a régua das etapas do motor com régua pronta (221: 0,8 h; 228: 0,7 h; 229: 0,7 h) continua honesta. Conclusão: `conclusao_2026-11-13_almoxarifado-liberacao-lote-impedido.txt`.
