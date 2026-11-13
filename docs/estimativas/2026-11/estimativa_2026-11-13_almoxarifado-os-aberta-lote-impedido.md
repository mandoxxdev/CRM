# Estimativa 13/11/2026 — almoxarifado: a fila da OS aberta recebe só o que pode sair (C520)

Origem: "Próxima tarefa detalhada" do plano da Etapa 229 (`docs/superpowers/plans/2026-11-13-almoxarifado-etapa229-liberacao-lote-impedido.md`).

Medido no código antes de estimar (sobre `60393569`):

- `reservaChegadaService.distribuirParaOs` (`:509`): a fila da OS vai pelo miolo com `semDescontoDoLote: true` (B1455) e com o teto
  inteiro; o resto (`teto - usado`) vira a reserva da OS (`reservaDaOs.reservarParaOsSobTrava`, teto pelo livre de caixa).
- Quem chama: a nota (`reservarChegadaParaQuemEspera`, `:271-279` — com OS, `livre = livreTotal`, sem tirar o item em lote impedido) e a
  liberação da inspeção/NC (`reservarLiberacaoParaQuemEspera`, `:611`, ramo `if (os)` antes do lote do item, B1510).
- O risco que a B1455 apontou: sem o desconto, a requisição da OS que já esperava ficaria sem reserva e a peça presa na reserva da OS (só a
  aprovação converte, `requisitionService.converterReservasDaOs`). A liberação do lote (Etapa 220, `reservarLoteLiberadoSobTrava`)
  distribui só para a fila geral e não converte a reserva da OS — precisa converter, senão fica pior que hoje.
- Testes que mudam de propósito: `chegadaLoteImpedido` RN-219.07, `liberacaoLoteImpedido` RN-229.06, conferir `estornoLoteImpedido`
  RN-228.11/.16 (B1508).
- Fatia visível: a definir no plano (a requisição da OS deixa de aparecer *Reservada* com peça que não sai).
- Sem migration, sem rota nova, sem perfil; tudo sob a trava do material que as portas já seguram.

| # | Tarefa | Execução estimada | Fator | Informado | Etapa/plano | Régua usada | Execução medida | Realizado | Commits |
|---|---|---|---|---|---|---|---|---|---|
| 1 | A fila da OS aberta recebe só o que pode sair; liberar o lote passa a reserva da OS para a requisição dela (C520) | 1h | estoque/saldo, travas (análise 1h + teste 2h) | 4h | 230 | 228: 0,7 h; 229: 0,7 h (portas do motor com régua pronta); esta tem duas pontas (a chegada e a liberação do lote) | 0,9 h (horas.js --grupos "E230=…", 13/11) → 1h | 4h (1h + análise 1 h + teste 2 h, da tabela — não informado pelo André) | 240eb83b, 92fe4b45, 59a5ae94, de2bd342, 7068adad e este |

Incerteza: média — a conversão na liberação do lote é peça nova (reaproveita `distribuirParaOs` e a liberação de reserva); se a Fase 2
mostrar que o estorno (B1508) também muda, reestimar.

Medição no fechamento:
```
--grupos "E230=Etapa 230|Estimativa: almoxarifado - a requisicao da OS"
```

No fechamento: execução estimada 1h, medida 0,9 h — a régua das etapas do motor com régua pronta continua honesta (a Fase 5 desta, com uma correção, ficou dentro). Conclusão: `conclusao_2026-11-13_almoxarifado-os-aberta-lote-impedido.txt`.
