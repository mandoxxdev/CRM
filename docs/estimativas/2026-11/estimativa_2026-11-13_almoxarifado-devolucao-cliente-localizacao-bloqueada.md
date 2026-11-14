# Estimativa 13/11/2026 — almoxarifado: a devolução ao cliente avisa a localização padrão bloqueada (C543)

Origem: pedido do André (pouco tempo; teto de 45 min a 1 h). Candidatos medidos (sobre `da1b8d19`):

- **Próxima tarefa detalhada da 236 (resto da D (233) 3, fluxos internos):** quatro serviços do motor (devolução Quarentena/Sucata,
  sucateamento, NC), travas e estorno de cada um — porte "estoque/saldo, travas, estorno" (3 h ou mais). Não cabe.
- **C543 corrigida no motor:** a recusa vem de `validarLocalizacaoParaMovimento(resolveLocalizacaoSaida(...))` (`stockService.js:1565`),
  que vale para **toda** saída sem origem (Movimentações também). Mudar a regra = motor + todas as saídas. Não cabe.
- **C542 (saldo do lote x livre):** mexe no que a lista de lotes conta (reserva/ajuste no "sem lote") — régua do motor. Não cabe.
- **Escolhido — a fatia visível da C543:** `posicaoPorCliente` (`clienteEstoqueService.js:88`) ganha o código e o bloqueio da
  localização padrão de cada item (campos novos, só leitura); a janela Devolver (`MateriaisClienteAlmoxarifado.js`) mostra o aviso e apaga
  o Confirmar. Sem migration, sem trava, sem rota nova, sem mudar o motor.

| # | Tarefa | Execução estimada | Fator | Informado | Etapa/plano | Régua usada | Execução medida | Realizado | Commits |
|---|---|---|---|---|---|---|---|---|---|
| 1 | A janela de devolução ao cliente avisa que a localização padrão está bloqueada (C543) | 30 min | ajuste pontual de tela (análise 15 min + teste 15 min) | 1h | 237 | 222–227 mediram 0,6 a 0,7 h com fechamento; aqui um campo de leitura + um aviso | — | — | — |

Incerteza: baixa. Medição no fechamento:
```
--grupos "E237=Etapa 237|Estimativa: almoxarifado - devolucao ao cliente avisa"
```
