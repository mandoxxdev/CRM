# Estimativa 13/11/2026 — almoxarifado: a reserva manual não conta o lote impedido (C479)

Origem: "Próxima tarefa detalhada" do plano da Etapa 220 (`docs/superpowers/plans/2026-11-13-almoxarifado-etapa220-*.md`).

Medido no código antes de estimar (sobre `ab4d2ff5`): a porta é uma só, `stockService.criarReservaSemTrava` (`:3813`), chamada pela rota
`POST /api/almoxarifado/reservas` (`routes/almoxarifado/extended.js:997`, `criarReserva(db, req.user, req.body)` — sem 4º argumento, então
`sistema` falso e sem `requisicao_id`). O `hold` (`:3826`) compara com `caixaSql.livreDeCaixaSql()` na manual e `disponivelSql()` na de
requisição; nenhum tira `loteImpedido.loteImpedidoSql`. Os outros quatro chamadores (`requisitionService:773`, `reservaChegadaService:446`
e `:881`, `reservaDaOs:264`, e `reservaDaOs:205` pelo `criarReservaSemTrava`) passam `sistema: true` — a aprovação e o miolo da chegada já
descontam antes de chamar, e a reserva da OS converte **sobre** o impedido de propósito (B1381). Então a régua nova vale só para
`!sistema && !requisicao_id`. A reserva já roda sob `naTravaDoMaterial` (Etapa 97) e o status do lote também (B1461): a leitura é
consistente. A frase de recusa já existe (`loteImpedido.fraseLoteImpedido`). Sem migration. A fatia visível: a recusa na tela **Reservas**
(o `toast.error` já mostra o texto do servidor) passa a dizer quanto está em lote impedido.

| # | Tarefa | Execução estimada | Fator | Informado | Etapa/plano | Régua usada | Execução medida | Realizado | Commits |
|---|---|---|---|---|---|---|---|---|---|
| 1 | A reserva manual não conta peça de lote bloqueado, reprovado ou vencido (C479) | 1h | estoque/saldo (análise 1h + teste 2h) | 4h | 221 | Etapa 220 mediu 1,4 h (com 4ª porta achada na revisão); 219 ~1 h; 217 ~1,1 h. Esta é uma porta só, com a régua e a frase prontas | — | — | — |

Incerteza: a execução pode subir se a revisão achar outra porta "manual" que não passe pela rota (hoje nenhuma: todas as outras levam
`sistema: true`). Não foi quebrada: é uma alteração só, e 4h não passa do teto da skill.

Medição no fechamento:
```
--grupos "E221=Etapa 221|Estimativa: almoxarifado - reserva manual"
```
