# Estimativa 13/11/2026 — almoxarifado: o extrato diz quanto está em lote impedido (C481, 1ª parte)

Origem: "Próxima tarefa detalhada" do plano da Etapa 221 (`docs/superpowers/plans/2026-11-13-almoxarifado-etapa221-*.md`).

Medido no código antes de estimar (sobre `f06103e8`): o extrato é uma rota só, `GET /api/almoxarifado/materiais/:id/extrato`
(`routes/almoxarifado/extended.js:1050`), que lê o material com `m.*` + `disponivelSql('m')`; a régua pronta é
`loteImpedido.loteImpedidoSql('m')` (205 + 217, 0 sem `controle_lote`, "hoje" de Brasília por padrão) — entra como uma coluna a mais no
mesmo `SELECT`, um material por chamada. A tela é o `ExtratoMaterialModal.js` (os cartões de saldo em `:139-185`), aberta de quatro telas
(Materiais, Movimentações, Sobras, Reservas). O formulário **Nova Reserva** (`ReservasAlmoxarifado.js:511-522`) mostra o aviso fixo da
B1472 para todo material com controle de lote; o material dele vem de `/estoque` (todos os materiais — a régua por material lá é cara,
fica fora). Sem migration, sem trava (só leitura), sem perfil novo. A fatia visível: o cartão novo no extrato e o número no formulário.

| # | Tarefa | Execução estimada | Fator | Informado | Etapa/plano | Régua usada | Execução medida | Realizado | Commits |
|---|---|---|---|---|---|---|---|---|---|
| 1 | O extrato e a reserva mostram quanto está em lote bloqueado, reprovado ou vencido (C481, 1ª parte) | 1h15 | média (análise 30 min + teste 1 h) + 15 min de arredondamento | 3h | 222 | Etapa 221 mediu 0,8 h (uma porta, com tela pequena); 220 1,4 h. Aqui: um campo de leitura + duas telas | 0,7 h (horas.js --grupos "E222=…", 13/11) → 45 min | 2h30 (45 min + análise 30 min + teste 1 h, da tabela — não informado pelo André) | 75f8201d, a7472f1e, 6224f8d1, 559cb459, 7ee7530a, 52cc0035, 7cd9920e, e5f94021 e este |

Incerteza: a execução pode subir se a revisão achar o número do extrato divergente do que a aprovação desconta (a régua é a mesma — não
deveria). Não foi quebrada: 3h não passa do teto da skill. A lista `/estoque` (todas as telas de saldo) fica para a 2ª parte do C481.

Medição no fechamento:
```
--grupos "E222=Etapa 222|Estimativa: almoxarifado - extrato"
```

No fechamento: execução estimada 1h15, medida 0,7 h (com a revisão da Fase 2 e as duas da Fase 5 em paralelo). Para etapa de leitura com duas telas pequenas, 45 min a 1 h de execução é a medida honesta.
