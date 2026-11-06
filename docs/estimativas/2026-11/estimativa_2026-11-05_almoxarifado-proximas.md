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
| 2 | Nota com o mesmo lote e outra validade | média + decisão de regra | 1h | 1h | 1h | 3h | 194 (o número 192 já era do Compras; plano `ce606d41`) | 1,2 h (horas.js --grupos "Recebimento lote=Etapa 194", 05/11) → 1h15 | 3h15 (1h15 + análise 1 h + teste 1 h, da tabela — não informado pelo André) | ce606d41, e6308090, 32ff286a, e8803937, 57bdb6b2, 77102677 + fechamento |
| 3 | Separação: quantidades não se perdem | ajuste de tela | 15 min | 30 min | 15 min | 1h | 195 — C454 (+ C452, código morto na mesma tela, entra junto) | 0,4 h (horas.js --grupos "E195=Etapa 195", 05/11) → 30 min | 1h (30 min + análise 15 min + teste 15 min, da tabela — não informado pelo André) | f8398b40, 650db899, bdc2eb74, 727792a3, 69d9d40f |
| 4 | Separar em duas vezes — local de onde sai | motor | 1h | **3h** (revisado: era 1h) | 2h | **6h** (revisado em 05/11: era 4h) | 196 — C453 (plano `4c602925`) | 1,9 h (horas.js --grupos "E196=Etapa 196", 05/11) → 2h | 5h (2h + análise 1 h + teste 2 h, da tabela — não informado pelo André) | 4c602925 … 4ba2e9b4, fa930a16 |
| 5 | Separar em duas vezes — material com lote | motor | 1h | 1h a 2h | 2h | 4h a 5h | 197 — C451 / B204 (+ C462) | 2,5 h (horas.js --grupos "E197=Etapa 197", 05/11) → 2h30 | 5h30 (2h30 + análise 1 h + teste 2 h, da tabela — não informado pelo André). Estouro de 30 min: dois fix-rounds da Fase 5 (o endereço guardado de outra requisição; a parte da própria) | 7f099fae … 1ed41bb8, 034e9269 |
| 6 | Entrega recusada com separado de outra requisição | motor (leitura sob trava) | 1h | 1h | 2h | 4h | 198 — C449 (plano `0affc3df`) | 1,3 h (horas.js --grupos "E198=Etapa 198", 05/11) → 1h30 | 4h30 (1h30 + análise 1 h + teste 2 h, da tabela — não informado pelo André) | 0affc3df … 75da9211, d0b97689 |
| 7 | Materiais de clientes: número com vírgula | ajuste de tela | 15 min | 15 min | 15 min | 45 min | 199 — C448 (plano `3f5b8690`) | ~15 min (pacote 199: 0,2 h no horas.js para os dois itens) | 45 min (15 + análise 15 + teste 15, da tabela) | eb3a48c3 |
| 8 | Termo de ferramenta: espaços do texto | ajuste + impressão | 15 min | 15 min | 45 min | 1h15 | 199 — C447 (plano `3f5b8690`) | ~15 min (pacote 199) | 1h15 (15 + análise 15 + teste 45, da tabela) | 0da1e81b, 41b7fa28 |

Total: 24h a 25h (revisado em 05/11: o item 4 passou de 4h para 6h — o plano `4c602925` mediu ~3h de execução: coluna nova com a quantidade da origem, separação, entrega, devolução e as contas da fila; não há corte que caiba em 1h sem a janela de entrega passar a recusar o que hoje entrega).

Fora da estimativa: o item 9 da fila (features 01, 05, 06, 16, 21, 22, 23, 25) depende de resposta da empresa — não dá para medir
antes das respostas. Antes do item 1, as suítes completas têm de rodar (não rodaram depois do fix-round da 190, `4fcdcb27`); o tempo
está dentro da análise do item 1.

Medição no fechamento:
```
node .claude/skills/relatorio-semanal/scripts/horas.js --desde <inicio> --ate <fim> --grupos "Validade=Etapa 191|validade do lote;Recebimento lote=Etapa 192|mesmo lote;Janela separacao=C454|C452;Origem separacao=C453;Lote separacao=C451|B204;Entrega separado=C449;Virgula clientes=C448;Termo espacos=C447"
```
