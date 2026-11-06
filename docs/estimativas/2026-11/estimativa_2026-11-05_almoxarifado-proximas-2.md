# Estimativa 2026-11-05 — próximas alterações do Almoxarifado, 2º pacote

A fila da 1ª estimativa de 05/11 (`estimativa_2026-11-05_almoxarifado-proximas.md`, itens 1 a 8, Etapas 191 a 199) acabou. Este pacote
vem dos avisos **C** abertos que não dependem da empresa, listados no fim do plano da 199
(`docs/superpowers/plans/2026-11-05-almoxarifado-etapa199-virgula-e-espacos-do-termo.md`), cada um lido na seção C de
`docs/almoxarifado-novidades-por-etapa.md` (itens 458, 464 a 469). Ordem: o que o usuário sente primeiro (C468, C469), depois C458, C467,
C465; C464 e C466 por último, quebrados em duas partes cada (acima de 4h) e com faixa.

Régua de execução — as etapas desta semana, medidas pelo `horas.js` (pela 1ª estimativa): 191 2h; 194 1h15; 195 30 min; 196 2h; 197 2h30;
198 1h30; 199 ~30 min para dois ajustes. Estimado × medido da execução nessa fila: motor 196 3h → 2h, 197 1h-2h → 2h30, 198 1h → 1h30 (o
motor erra para os dois lados, ±1h); tela 195 30 min → 30 min, 199 15+15 → ~30 min. A parte do André vem da tabela do passo 3 da skill.

| # | Tarefa | Porte | Análise | Execução | Teste e conferência | Informado | Etapa/plano | Execução medida | Realizado | Commits |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Entrega à mão respeita o separado das outras (C468) | motor (leitura sob trava já existente) | 1h | 1h30 | 2h | 4h30 | 200 (plano `fd1daad2`) | 1,2 h (horas.js --grupos "E200=Etapa 200", 05/11) → 1h15 | 4h15 (1h15 + análise 1 h + teste 2 h, da tabela — não informado pelo André) | fd1daad2 … 5bc921e4, 80612648 |
| 2 | Separação: o local mostra quanto sobra (C469) | média (campo novo na leitura + tela) | 30 min | 1h | 1h | 2h30 | 201 (plano `855e7404`) | 1,1 h (horas.js --grupos "E201=Etapa 201", 05/11) → 1h15 | 2h45 (1h15 + análise 30 min + teste 1 h, da tabela — não informado pelo André) | 855e7404 … 298a3d72, 439105c9 |
| 3 | Movimentação por integração respeita o lote (C458) | média (sem tela; regra já existe) | 30 min | 1h | 1h | 2h30 | — | — | — | — |
| 4 | Requisição excluída limpa o local separado (C467) | pequena com regra | 15 min | 30 min | 30 min | 1h15 | — | — | — | — |
| 5 | Devolução: entregas antigas (C465, só a lista) | média (leitura + tela) | 30 min | 1h | 1h | 2h30 | — | — | — | — |
| 6 | Lote que não pode sair — aprovação e separação (C464, 1ª) | motor (disponível) | 1h | 1h30 a 2h | 2h | 4h30 a 5h | — | — | — | — |
| 7 | Lote que não pode sair — entrega (C464, 2ª) | motor | 1h | 1h a 1h30 | 2h | 4h a 4h30 | — | — | — | — |
| 8 | Quarentena — o bloqueio sabe o lote (C466, 1ª) | motor + coluna nova | 1h | 1h30 a 2h30 | 2h | 4h30 a 5h30 | — | — | — | — |
| 9 | Quarentena — a entrega não tira a peça bloqueada (C466, 2ª) | motor | 1h | 1h a 2h | 2h | 4h a 5h | — | — | — | — |

Total: 30h15 a 33h15 (itens 1 a 5: 13h15; itens 6 a 9: 17h a 20h).

## Como cada item foi medido

1. **C468** — `requisitionService.entregarSemTrava` → `validarOrigemDaEntrega` chama `checarOrigemItem` **sem** o 6º parâmetro `outras`
   (linha ~1963); a separação já passa `parteGuardadaDeOutras` (198, linha ~1404). A mudança é a mesma régua, na entrega com escolha à mão
   (não na planejada — B1333, dado antigo), dentro da seção que a entrega já segura. Mesma conta da 198, que mediu 1h30 → 1h30. Porte motor.
2. **C469** — `GET /almoxarifado/estoque/:materialId/saldos` (`stockService.consultarSaldosPorLocalizacao`, `routes/almoxarifado/extended.js`
   ~830) é lido só pelo `RequisicoesList.js` (~538) no cliente; a "Movimentação também usa" da B1335 é pelo serviço. Campo novo opcional
   (com a requisição na consulta, a parte guardada das outras pelo par) e o rótulo da opção. Só leitura, sem trava. Porte média.
3. **C458** — `POST /api/almoxarifado/movimentacoes` (`routes/almoxarifado.js` ~1387) desestrutura o corpo sem `lote_id` e chama
   `registrarMovimentacao` sem ele; a v2 repassa o corpo e recusa lote vencido. Repassar (com a validação do motor que já existe) ou aposentar
   — decisão do agente, letra B. ~10 testes já chamam a rota (`movimentacaoV1Permissao`, `loteControleObrigatorio`…). Sem tela (o modal de
   Materiais não manda lote). Porte média, não motor: a regra é a da v2, sem conta nova.
4. **C467** — `excluirSemTrava` (~2457): o estorno lê as saídas (`movimentacoes`), não a origem dos itens; limpar
   `origem_separacao_id`/`lote_separacao_id`/`quantidade_origem_separacao` é um `UPDATE` depois do estorno, sem efeito (os filtros de caixa
   viva já protegem — B1331). Cuidado: gravação depois de mexer em estoque não pode desfazer a exclusão. Porte pequena com regra.
5. **C465** — `returnService.listarSaidasElegiveis` (`limite = 30`, `ORDER BY created_at DESC`), lido por `DevolucoesAlmoxarifado.js`
   (~108). Filtro/paginação na leitura + tela; a conta do `saldo_devolvivel` não muda (tem de bater com `validarSaidaOriginal`). A parte "EPI
   e material sem controle de lote saem sem lote" (B204) fica **fora** — é produto, não conserto. Porte média.
6. e 7. **C464** — o disponível (`availabilitySql.js`) é a conta da aprovação, separação e entrega; descontar o saldo de lote que não pode
   sair (B1322) mexe nas três e nas telas de saldo que leem a mesma conta. Quebrado em dois (acima de 4h): a conta do disponível e, depois, a
   recusa na entrega. Faixa: quantas leituras usam a conta.
8. e 9. **C466** — `quantidade_bloqueada` é um total por material (coluna em `materiais_almoxarifado`), lido/gravado em 15 arquivos de
   serviço/rota (inspeção, não conformidade, sucata, terceiros, devolução, motor). Bloqueio por lote = coluna/tabela nova + os caminhos que
   bloqueiam e liberam; depois o automático da entrega (197) descontar o bloqueado do lote. Faixa: quantos caminhos precisam guardar o lote.

Medição no fechamento:
```
node .claude/skills/relatorio-semanal/scripts/horas.js --desde <inicio> --ate <fim> --grupos "Entrega a mao=C468;Sai de sobra=C469;Movimentacao antiga lote=C458;Exclusao origem=C467;Devolucao antigas=C465;Lote impedido=C464;Quarentena lote=C466"
```
