# Estimativa 2026-11-05 — próximas alterações do Almoxarifado

Pedido do André (05/11): "Gere as estimativas de tempo das proximas alterações do almoxarifado então para que possamos ter uma ideia
de quantas horas trabalharemos na sequencia e o que será entregue".

**O módulo continua pausado** (`docs/superpowers/plans/2026-10-23-almoxarifado-pausa-e-retomada.md`). Esta estimativa só mede a fila
da seção 4 daquele plano; nada foi retomado. Conferido no `git log --since=2026-10-23`: nenhum item da fila foi feito depois da pausa
(só a Etapa 193 do Compras mexeu no cadastro de material).

Régua de execução: etapas do almoxarifado de 20 a 23/10, cada uma com Fase 2, TDD, Fase 5 e fechamento, mediram 1 h a 1,6 h
(`horas.js --desde 2026-10-20 --ate 2026-10-23 --grupos "E186=Etapa 186;...;E190=Etapa 190"`: 182 1,6 h; 184 1 h; 185 1 h; 186 1,3 h;
187 1,1 h; 188 1,3 h; 189 1,5 h; 190 1 h). A parte do André vem da tabela do passo 3 da skill, pelo porte.

| # | Tarefa | Porte | Análise | Execução | Teste e conferência | Informado | Etapa/plano | Execução medida | Realizado | Commits |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Corrigir a validade de um lote | média + decisão de regra + perfis | 1h | 1h30 | 1h30 | 4h | 191 (plano `c0cce170`, Fase 2 pendente) | 2 h (horas.js --grupos "Validade=Etapa 191\|validade do lote", 05 a 07/11) | 4h30 (2 h + análise 1 h + teste 1h30, da tabela — não informado pelo André) | 018f8a35, 3b43a0a1, 4fcf13b4, 140dbb77, d5f3376a, 699e87c3, c64fb881 + fechamento |
| 2 | Nota com o mesmo lote e outra validade | média + decisão de regra | 1h | 1h | 1h | 3h | 192 candidata (cenário 16 da 190) | — | — | — |
| 3 | Separação: quantidades não se perdem | ajuste de tela | 15 min | 30 min | 15 min | 1h | C454 (+ C452, código morto na mesma tela, entra junto) | — | — | — |
| 4 | Separar em duas vezes — local de onde sai | motor | 1h | 1h | 2h | 4h | C453 | — | — | — |
| 5 | Separar em duas vezes — material com lote | motor | 1h | 1h a 2h | 2h | 4h a 5h | C451 / B204 | — | — | — |
| 6 | Entrega recusada com separado de outra requisição | motor (leitura sob trava) | 1h | 1h | 2h | 4h | C449 | — | — | — |
| 7 | Materiais de clientes: número com vírgula | ajuste de tela | 15 min | 15 min | 15 min | 45 min | C448 | — | — | — |
| 8 | Termo de ferramenta: espaços do texto | ajuste + impressão | 15 min | 15 min | 45 min | 1h15 | C447 (pouco ganho; último da fila) | — | — | — |

Total: 22h a 23h.

Fora da estimativa: o item 9 da fila (features 01, 05, 06, 16, 21, 22, 23, 25) depende de resposta da empresa — não dá para medir
antes das respostas. Antes do item 1, as suítes completas têm de rodar (não rodaram depois do fix-round da 190, `4fcdcb27`); o tempo
está dentro da análise do item 1.

Medição no fechamento:
```
node .claude/skills/relatorio-semanal/scripts/horas.js --desde <inicio> --ate <fim> --grupos "Validade=Etapa 191|validade do lote;Recebimento lote=Etapa 192|mesmo lote;Janela separacao=C454|C452;Origem separacao=C453;Lote separacao=C451|B204;Entrega separado=C449;Virgula clientes=C448;Termo espacos=C447"
```
