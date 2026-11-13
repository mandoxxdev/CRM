# Estimativa 13/11/2026 — almoxarifado: estornar a entrada boa não deixa a reserva coberta só por lote impedido (C521)

Origem: "Próxima tarefa detalhada" do plano da Etapa 227 (`docs/superpowers/plans/2026-11-13-almoxarifado-etapa227-saldo-por-lote-vencido.md`).

Medido no código antes de estimar (sobre `7aacca26`):

- `reservaChegadaService.liberarParaEstorno` (`reservaChegadaService.js:757`): solta primeiro a reserva da OS (`:762`, não muda), lê
  `disponivelSql()` do material (`:763`) e sai sem soltar nada se `disp >= qtd` (`:765`). O saldo de lote impedido está dentro do `disp`:
  com 3 num lote bom reservadas para R1 e 4 num lote bloqueado, o estorno dos 3 não solta nada. A conta de quanto soltar (`falta = qtd − disp`,
  `:786`) também.
- A régua pronta: `loteImpedido.loteImpedidoSql('m')` e `predicadoLoteImpedidoSql('l')` (o lote da própria entrada, `mov.lote_id`).
- Chamada por `stockService.cancelarMovimentacao` (`:3064`), fora da trava do material (soltar sem distribuir não pega — B441); a recriação
  (`recriarAposEstornoRecusado`, `:869`) refaz o que foi solto se o estorno falhar — passa por `criarReserva`, que desde a 221 compara com o
  que pode sair (conferir que a recriação continua cabendo).
- Sem migration, sem rota nova, sem perfil, sem tela obrigatória. Uma expressão no motor + cenários (lote bom com o resto bloqueado, lote
  bom com o resto bom, entrada do próprio lote bloqueado, recriação após recusa).

| # | Tarefa | Execução estimada | Fator | Informado | Etapa/plano | Régua usada | Execução medida | Realizado | Commits |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Estornar a entrada boa solta a reserva que só o lote impedido cobriria (C521) | 1h | estoque/saldo, estorno (análise 1h + teste 2h) | 4h | 228 | Etapa 221 (uma porta do motor, régua pronta) mediu 0,8 h; 219 ~1 h; 220 1,4 h | — | — | — |

Incerteza: baixa — a régua e os testes de molde (`chegadaLoteImpedido`, `recebimentoReservaChegadaEstorno`) existem.

Medição no fechamento:
```
--grupos "E228=Etapa 228|Estimativa: almoxarifado - estorno"
```
