# Estimativa 23/11/2026 — almoxarifado e cadastro de material, semana de 23/11 (27h30)

Pedido do André (23/11/2026): "já começar o planejamento e desenvolvimento dessa semana". Régua da skill `estimativa-de-tarefas`
(passo 3, 18/11/2026): tempo informado = execução prevista na régua do `horas.js`, **sem** a parte fixa de análise + teste.

Régua conferida em 23/11/2026 com `node .claude/skills/relatorio-semanal/scripts/horas.js --desde 2026-11-18 --ate 2026-11-21 --grupos
"E250=Etapa 250;E251=Etapa 251;E252=Etapa 252;E253=Etapa 253;E254=Etapa 254|C548;E255=Etapa 255;E256=Etapa 256;E257=Etapa 257;E258=Etapa
258;E259=Etapa 259"`: E250 0,7 h (2 itens de tela) · E251 1,1 h (2) · E252 0,9 h (3) · E253 0,6 h (2) · E254 1,2 h (2) · E255 0,8 h (filtros
da Fila, tela) · E256 0,8 h · E257 0,8 h · E258 1,4 h · E259 0,6 h (motor/estorno, 1 item cada). Na semana de 18/11 o estimado por item
(45 min a 1h30) ficou ~40% acima do realizado (25h estimadas para 17h45 realizadas nos 24 itens feitos); mantida a régua (fatia de tela
45 min a 1h; motor/trava/estorno 1h15 a 1h30), porque vários itens desta semana são de motor com sonda ainda não executada.

Partes: **Cadastro de material 1h15 · Almoxarifado 26h15 = 27h30.** Dependem de resposta (fora do total): 3h (os itens 24 a 26 da estimativa
de 18/11, repetidos com o mesmo texto e tempo; a empresa ainda não respondeu).

Fontes, na ordem pedida: (a) letra C/D de `docs/almoxarifado-novidades-por-etapa.md`; (b) mapa `specs/modulo-almoxarifado/README.md`
(feature 05: agrupamento da Fila, C486, C498); (c) cadastro no Compras (`specs/modulo-compras/README.md` — a fila de 12/11 está toda feita,
exceto os três que esperam resposta; o item 1 abaixo foi achado no código).

## Tabela

| # | Tarefa | Execução estimada | Régua horas.js | Informado | Origem | Medido no código (23/11) — onde mexer | Execução medida | Realizado | Commits |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Busca e lista de materiais com os fornecedores cadastrados | 1h15 | cadastro no Compras (E212 0,9 h; E216 0,6 h) | 1h15 | Compras, fila de 12/11 (img5: "fornecedor principal" absorvido pelo relacionamento, Etapa 212) | `server/routes/almoxarifado.js:476` — a busca casa `m.fornecedor_principal` (texto antigo), não `itens_fornecedor` (nome do fornecedor, `codigo_fornecedor`); `TabelaMateriais.js:190` mostra `m.fornecedor_principal` sob o nome (o formulário já escondeu o campo na 212, `MaterialAlmoxarifadoForm.js:1179`). Lista compartilhada por Compras e Almoxarifado | ~16 min (rateio) | 30 min | `14af4e46`, `3315a2b0` |
| 2 | Projeto na requisição | 1h15 | fatia de tela + rota de leitura (E255 0,8 h) | 1h15 | B1598, D (255) 3 | `requisitionCreateService.js:197,292,301` já grava `projeto_id`; `RequisicaoForm.js` não tem o campo (só OS, l. 51-70, e centro de custo); não há rota aux de projetos no portão do almoxarifado. Atenção: `projeto_id` entra na guarda do dono (`ownerRules`) — material de cliente para projeto de outro cliente | ~16 min (rateio) | 30 min | `5ca40351`, `af583d26`, `682fb1ae`, `3f18085e`, `60f72369`, `efdfa465` |
| 3 | Fila de separação agrupada por setor ou por projeto | 1h30 | fatia de tela (E255 0,8 h) + a revisão da ordem | 1h30 | feature 05, item "Agrupamento" `[ ]` (B1600, D (255) 1) | `FilaSeparacao*` da 255 (filtros no cliente); caminho reversível da B1600: agrupar só por setor/projeto (localização repetiria a requisição), opção desligada por padrão, ordem de urgência dentro do bloco | ~19 min (rateio) | 30 min | `45b4fff3` |
| 4 | Histórico diz de quais prateleiras a peça saiu | 1h | fatia de tela + leitura | 1h | D (252) 1 (a saída automática sem endereço no histórico), registro das Etapas 256/257 | `ajuste_linhas_drenadas_almoxarifado` (schema.js:1605-1616) só é lida pelo estorno; o histórico (`MovimentacoesAlmoxarifado.js`, lista de movimentações) não a junta. Movimento antigo sem linha: como hoje | — | — | — |
| 5 | Estorno de ajuste de prateleira respeita a contagem mais recente | 1h15 | motor/estorno (E258 1,4 h) | 1h15 | D (258) 5 — a próxima do plano da 259 | `stockService.cancelarMovimentacao`, ramo `AJUSTE` com `localizacao_destino_id`; sonda da Fase 5 da 258 já executada (A 5; Ajuste de A para 3; Ajuste do total para 7; estorno do primeiro → 9). Molde: `estornoAjusteForaDeOrdem.api.test.js` | — | — | — |
| 6 | Estorno da devolução para quarentena desfaz o bloqueio | 1h15 | motor/estorno | 1h15 | C239 (B761) | `stockService.js:3294` lê `devolucaoDaEntrada` só para Sucata e séries; destino Quarentena não desfaz o `BLOQUEIO` com a mesma `referencia DEV-<n>`. Caminho reversível: estornar a perna de bloqueio junto, sob a trava, ou recusar mandando estornar o bloqueio antes — decidir na Fase 0 por sonda | — | — | — |
| 7 | Estorno da devolução de uma requisição já excluída | 1h | motor/estorno (guarda antes do claim) | 1h | C552 | mesmo ramo do item 6 (`stockService.js:3286-3303`): nenhuma conferência da requisição da saída citada (`movimentacao_saida_id`) estar excluída. Recusa antes do claim | — | — | — |
| 8 | Saída e perda com lote respeitam as peças bloqueadas do lote | 1h15 | motor (a régua de lote existe: `retidoDoLote`/`bloqueioPorLote`) | 1h15 | C546, D (249) 1 | `stockService.js` não usa `retidoDoLote` nem `bloqueioPorLote` (só `requisitionService`, `reservaChegadaService`, `lotService`); a guarda da Saída/Perda com `lote_id` olha o bloqueado do material. Fatia visível: o seletor de lote já diz o livre (Etapa 241) — somar as bloqueadas | — | — | — |
| 9 | Estorno da entrada de um lote com peças bloqueadas | 1h | motor/estorno | 1h | C547, D (249) 1 | ramo de entrada do `cancelarMovimentacao`: não confere `bloqueadoDoLoteSql` do lote estornado. Recusa com o caminho (Desbloquear escolhendo o lote) | — | — | — |
| 10 | Transferência de peça com número de série | 1h30 | tela + motor | 1h30 | C76, B1584 (D (252) 3) | `extended.js:927` (`/transferencias`) e o ramo `TRANSFERENCIA` do motor não leem `serie_ids`; `MovimentacoesAlmoxarifado.js:88-98` diz que a tela não pede série na transferência; `series_almoxarifado.localizacao_id` existe (schema.js:1569). Faz o endereço da série confiável para o item 11 | — | — | — |
| 11 | Saída de peça com número de série sai da prateleira da série | 1h30 | motor (molde `fatiasDaSerieSemLote`, Etapa 252) | 1h30 | C545, D (252) 2, D (259) 3 | `requisitionService.js:2290-2310` já fatia por endereço da série só na entrega sem lote; a Saída avulsa (`registrarMovimentacao`, ramo de saída) baixa a padrão/maior linha. Depende do item 10 (B1584: endereço só vale quando bate com o saldo) | — | — | — |
| 12 | Entrega confere o lote das séries antes de começar | 1h15 | motor (conferência antes da 1ª baixa) | 1h15 | C486 (feature 05, falta para 🟢) | `requisitionService.js:2414,2543` — item com série fora da conferência de lote impedido; o motor recusa só na baixa, depois de outros itens saírem | — | — | — |
| 13 | Dica da Fila não manda duas requisições ao mesmo lugar | 1h15 | fatia de leitura (Fila, E250 0,7 h) | 1h15 | D (250) 4, B1255, C449 (resto) | `sugestaoDeColeta.js` RN-188.03: os irmãos da mesma requisição descontam o sugerido; entre requisições, não (B1255). Função pura — descontar na ordem da fila | — | — | — |
| 14 | Lista "Sai de" atualizada depois de uma recusa | 45 min | fatia de tela | 45 min | C473 (conserto medido "~30 min, só tela") | janelas de separação e de entrega: a lista de saldos por endereço é lida ao abrir; molde da releitura na recusa: Etapa 246 (C538) | — | — | — |
| 15 | Entrega escolhendo só o lote respeita a separação de outra requisição | 1h30 | motor (C471 dizia ~2h na régua antiga) | 1h30 | C471, B1341 | entrega com `lote_id` e sem endereço: o motor tira do endereço de mais saldo do lote sem descontar o separado de outra requisição (a régua da caixa existe — `caixaSql`/B1326) | — | — | — |
| 16 | "Sai de" com lote desconta o que está separado sem lote | 1h15 | motor + rótulo | 1h15 | C498, B1410 (feature 05, falta para 🟢) | `requisitionService.js:2144` — a guarda casa o lote exato. Caminho reversível: a parte separada sem lote ocupa o endereço inteiro (desconta do total do endereço, não de um lote); "não medido" no C498 — reestimar na Fase 0.5 se a sonda mostrar mais | — | — | — |
| 17 | Janela de entrega limita a quantidade de outra prateleira | 45 min | fatia de tela | 45 min | D (251) 1, B1579 | a divisão do entregável (Etapa 251) supõe a saída da prateleira separada; com outro endereço no "Sai de" a janela aceita mais e a entrega recusa sem baixar | — | — | — |
| 18 | Entrega com o lote ainda em inspeção | 1h15 | motor | 1h15 | C485, B1386 | `requisitionService.js:2607` (`if (!impedidos.length) continue` — falta sem lote impedido sai sem lote, negativa). Caminho reversível: tratar a falta vinda de inspeção como a do lote impedido (sai o que cobre, diz o resto); a parte guardada de outra caixa (Etapa 197) fica como está se a sonda mostrar regressão — declarar | — | — | — |
| 19 | Separar de duas prateleiras — 1ª parte (guardar e mostrar) | 1h30 | motor + tela (coluna/tabela nova por item) | 1h30 | C461, B1313 caminho (b), B1254 | o item guarda uma origem só (`origem_separacao_id` + quanto saiu dela, Etapa 196); a 2ª rodada de outro endereço escolhido vai para o automático (B1316) | — | — | — |
| 20 | Separar de duas prateleiras — 2ª parte (a entrega sai de cada uma) | 2h | motor/entrega sob as duas travas | 2h | C461 | ramo de entrega `baixa.comOrigem` (`requisitionService.js` ~3245) — uma baixa por origem; exclusão e devolução leem o registro das Etapas 257/259 (já por linha) | — | — | — |
| 21 | Entrada num lote vencido avisa | 1h | fatia de tela + frase | 1h | C457 (B1282), C460 | `MovimentacoesAlmoxarifado.js:664` mostra o texto do servidor só com data digitada; `lotService.js:51` (`CONFLITO`) imprime a validade em branco do lote antigo como data vazia | — | — | — |
| 22 | Devolução depois de uma exclusão interrompida | 1h15 | motor (régua única de `devolucaoViva.js`, cinco contas) | 1h15 | C553 (o item 3 do fim do plano da 259) | `devolucaoViva.js` não conta a ENTRADA parcial da exclusão (B1609). Só com falha inesperada — por isso por último | — | — | — |
| 23 | Tirar o campo Aplicação — **depende de resposta** | 30 min | tirar um campo | 30 min | item 24 de 18/11 (fila do Compras, 7) | `MaterialAlmoxarifadoForm.js:934-938`; a coluna `aplicacao` fica | — | — | — |
| 24 | Nº de série + nº de controle (etiqueta) obrigatórios — **depende de resposta** | 1h30 | cadastro + obrigatório | 1h30 | item 25 de 18/11 (fila do Compras, 9) | `FerramentasAlmoxarifado.js:296,306,1048` | — | — | — |
| 25 | Especificações/Observações — **depende de resposta** | 1h | cadastro | 1h | item 26 de 18/11 (fila do Compras, 10) | `MaterialAlmoxarifadoForm.js:939-948` | — | — | — |

Os caminhos reversíveis dos itens 23 a 25 sem resposta estão no `.md` de 18/11 ("Os que dependem de resposta"). **Não começar sem a resposta**
(plano da 259, próxima tarefa 1).

## Ordem de execução (pacotes de 1 a 3 itens por etapa)

1. **Item 1** (Compras, tela — fatia visível de saída).
2. **Itens 2 e 3** (requisição e Fila — tela; o 3 usa o projeto do 2).
3. **Itens 4 e 5** (o histórico com as prateleiras; o estorno do ajuste de prateleira — a próxima do plano da 259).
4. **Itens 6 e 7** (estorno da entrada da devolução — o mesmo ramo do `cancelarMovimentacao`).
5. **Itens 8 e 9** (o bloqueado do lote na Saída/Perda e no estorno da entrada — a mesma régua `bloqueioPorLote`).
6. **Item 10** (transferência com série — motor antes da tela do 11).
7. **Itens 11 e 12** (a baixa da série pelo endereço; a conferência do lote das séries na entrega).
8. **Itens 13 e 14** (a dica da Fila e a releitura do "Sai de" — tela/leitura).
9. **Itens 15 e 16** (o separado de outros no "Sai de" com lote — motor da entrega).
10. **Itens 17 e 18** (a janela de entrega com outra prateleira; a falta em inspeção).
11. **Item 19**, depois **item 20** (duas prateleiras por item — motor antes da entrega).
12. **Itens 21 e 22** (aviso do lote vencido; a devolução depois da exclusão interrompida).

Os 23 a 25 entram assim que a resposta chegar, na frente da fila.

## Fora desta estimativa (medido, não entra)

- C551 (só se aparecer na operação — plano da 259); C492 (sem conserto barato, B1398); C427 (OS reaberta — mexe no Comercial); C426
  (a OS já é escolhida da lista desde a 172).
- D (254) 1 e D (253) 3 (Ajuste/inventário sem lote com o resto em lote — o conserto exige decidir de qual lote tirar; não medido).
- Feature 05: lista de separação como entidade, kits, conferência, "Aguardando retirada" (produto, ninguém pediu); B1572 (frase do lote
  preso na separação — descartada com razão).
- Feature 01 (Compras): tabela de conversões e grupo acima de família — ninguém pediu.

## Medição no fechamento

```
node .claude/skills/relatorio-semanal/scripts/horas.js --desde 2026-11-23 --ate 2026-11-28 --grupos "Fornecedores na busca=fornecedores do material na busca|busca.*fornecedor;Projeto=projeto na requisicao|B1598;Fila agrupada=agrupa|B1600;Historico prateleiras=historico.*prateleira|D \(252\) 1;Ajuste prateleira=D \(258\) 5|ajuste de prateleira;Quarentena bloqueio=C239;Devolucao excluida=C552;Saida bloqueado lote=C546;Estorno entrada bloqueado=C547;Transferencia serie=C76|transferencia.*serie;Saida serie prateleira=C545;Entrega serie lote=C486;Dica fila=B1255|D \(250\) 4;Sai de recusa=C473;Lote sem endereco=C471;Separado sem lote=C498;Outra prateleira=D \(251\) 1|B1579;Inspecao=C485;Duas prateleiras=C461;Lote vencido=C457|C460;Exclusao interrompida=C553;Aplicacao=aplicacao;Serie e etiqueta=etiqueta;Especificacoes=especificacoes|observacoes gerais"
```

Nos commits, citar o código da origem (C/D/B) no assunto para casar com o grupo.

## Fechamento dos itens 1 a 3 (Etapa 260, 23/11/2026)

Medido com `node .claude/skills/relatorio-semanal/scripts/horas.js --desde 2026-11-23 --ate 2026-11-23 --grupos "Etapa 260=Etapa 260"`:
**0,8 h** para o pacote inteiro (plano `c5237959` ao fechamento `3315a2b0`). Os três itens rodaram juntos: rateio pelo estimado (1h15 :
1h15 : 1h30) → ~16, ~16 e ~19 min; arredondado para cima, no mínimo 30 min cada → **realizado 30 min + 30 min + 30 min = 1h30** contra
**4h** estimadas. A régua de tela (45 min a 1h por fatia) mediu acima do realizado para itens de tela que rodam juntos.
Conclusão: `conclusao_2026-11-23_fornecedores-projeto-e-fila-agrupada.txt`.
