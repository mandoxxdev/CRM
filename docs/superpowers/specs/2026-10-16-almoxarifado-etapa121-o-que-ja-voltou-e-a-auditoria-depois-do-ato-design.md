# Almoxarifado — Etapa 121: o que já voltou não se devolve de novo, e a Auditoria depois do ato não desfaz o ato (design)

> Origem: "Próxima tarefa detalhada — Etapa 121" do plano da 120 (**C253** e **C252**). Worktree `CRM-wt-e121`, branch
> `etapa-e121` (a partir da main `9d78a820`). Numeração conferida com `grep -oE` em `docs/almoxarifado-novidades-por-etapa.md`
> (2026-10-16): última B **B782**, último C **C253**, última A **A68** → esta etapa **B783+**, **C254+**, **A69+**.

## Fase 0 — C253, medido (sondas `server/tests/sonda/e121fase0.js` e `e121fase0b.js`, não versionadas)

Material com série; Entrada 2 (V1, V2) → Saída **S** das duas → ...

| # | Cenário | Hoje (medido) |
|---|---|---|
| 1 | Entrada avulsa V1, V2 → desliga → `POST /devolucoes` ESTOQUE 2 citando S | **201, físico 4**; `saidas-elegiveis` oferece S com `saldo_devolvivel: 2`, `series: []` |
| 2 | o mesmo com a série **ligada** | a lista oferece 2; a devolução recusa só pela cardinalidade (*"informe 2 número(s) de série…"*) — com as séries informadas, *"A série V1 não saiu na saída…"* |
| 3 | Entrada avulsa V1, V2 → estorno dela (ligada: as séries ficam *Estornada*, físico 0) → nova Entrada V1, V2 (a linha dela tem `saida_anterior_id` NULL, porque a série estava *Estornada*) → desliga → devolução 2 de S | **201, físico 4** — o falso negativo previsto na Fase 2 da 120 existe |
| 4 | devolução **avulsa** (sem citar S) com V1, V2 → desliga → devolução 2 citando S | **201, físico 4** (a linha da reativação da devolução avulsa cita S; a devolução não cita) |
| 5 | devolução citando S com V1, V2 → estorno da entrada dela (as séries voltam a *Entregue* em S, Etapa 117) → desliga → devolução 2 de S | 201, físico 2 — **correto** (a linha da reativação da devolução estornada continua citando S: não pode contar) |
| 6 | Entrada avulsa V1, V2 → desliga → estorno dela (C225: séries *Em estoque*, físico 0) → devolução 2 de S | 201, físico 2 |
| 7 | só V1 volta → desliga → devolução 2 de S | 201, físico 3 (uma peça a mais) |
| 8 | Entrada v2 do **tipo** `ENTRADA_DEVOLUCAO` com V1, V2 (sem devolução) | grava a linha citando S, `referencia` NULL |

**Conclusão:** a conta do restante da saída (`validarSaidaOriginal`, o `INSERT … WHERE EXISTS` e o `saldo_devolvivel` da lista)
precisa descontar as séries que voltaram **por uma entrada que não é a de uma devolução que cita S**. Contar a linha da entrada
**estornada** também (caso 3); o preço é o caso 6 e o "estorno sem nova entrada" do caso 3 — a recusa com o material de fato fora,
conservadora, a mesma família da RN-08b da 120.

## Decisões (C253)

- **D1 — a régua.** `seriesQueVoltaramSql(saida)` em `devolucaoViva.js`: `COUNT(DISTINCT serie_id)` das linhas de
  `series_entrada_anterior_almoxarifado` com `saida_anterior_id = S` cuja entrada **não** é a `ENTRADA_DA_DEVOLUCAO_SQL` de uma
  devolução com `movimentacao_saida_id = S` (viva, já conta como devolvida; estornada, a série voltou a S). **Descartado:** filtrar
  pelo status atual da série (uma série que voltou e saiu de novo por outra saída S2 estaria *Entregue* — não contaria, e S e S2
  devolveriam a mesma peça); filtrar a entrada estornada (caso 3); excluir pelo tipo `ENTRADA_DEVOLUCAO` (caso 8: a Entrada v2
  digitada com esse tipo escaparia).
- **D2 — só a devolução usa a régua.** O estorno da saída e a exclusão da requisição já recusam por outra via (B779, B780); a régua
  "viva" (`DEVOLUCAO_VIVA_SQL`) continua sendo só a da devolução viva. **Descartado:** pôr a volta por outra entrada dentro de
  `DEVOLUCAO_VIVA_SQL` (mudaria as cinco contas, e no estorno da saída a mensagem diria "voltou pela devolução").
- **D3 — vale com a série ligada ou desligada.** Ligada, a devolução já recusava (pela conferência das séries), mas a lista
  oferecia devolver 2. Agora as duas pontas dizem o mesmo número.
- **D4 — a literal.** Sem volta por outra entrada, a de sempre (*"Devolução acima do entregue: a saída ⟨S⟩ entregou ⟨q⟩, já foram
  devolvidos ⟨d⟩ e restam ⟨r⟩"*). Com ela: *"Devolução acima do entregue: a saída ⟨S⟩ entregou ⟨q⟩, já foram devolvidos ⟨d⟩, ⟨v⟩
  já voltaram (já voltou) ao estoque por uma entrada que não cita esta saída e restam ⟨r⟩"*. **Descartado:** a literal de sempre
  com o restante descontado ("devolvidos 0 e restam 0" de uma saída de 2 não fecha a conta para quem lê).
- **D5 — a lista ganha `quantidade_reentrada`** (campo novo, aditivo) e a tela diz *"⟨v⟩ já voltaram ao estoque por outra
  entrada"* em vez de *"já devolvido por inteiro"*.
- **D6 — legado** (a linha sem `saida_anterior_id`, antes da 120): não é vista — a **A68** já lista essas saídas.

## Fase 0 — C252, medido (quatro medidores em paralelo, sondas `server/tests/sonda/e121m-{A,B,C,D}-*.js`, não versionadas)

Método da Fase 0 da 120: cada chamada a `registrarAuditoria` lida até a rota, com o `INSERT INTO auditoria_log_almoxarifado` da
`entidade`/`acao` forçado a falhar uma vez (gancho no `db.run`) nas que deixam dúvida. **110 chamadas** (a 120 contou 115 linhas
com o `grep` — incluía `require`s e comentários): `routes/almoxarifado.js` 25 + `routes/requisicoesMaterial.js` 1 (A);
`toolService` 12, `seriesService` 12, `lotService` 4, `anexoService` 2, `materialService` 1, `motivoMovimentacao` 1 (o wrapper),
`ownerRules` 3 (B — 35 com o wrapper contado pelos chamadores); `receiptService` 8, `purchaseService` 5, `nonConformityService` 5,
`reservationService` 2, `requisitionService` 3, `deliverySignatureService` 1, `notificationQueueService` 1, `stockService` 2 (C);
`scrapDisposalService` 7, `thirdPartyService` 6, `scrapService` 2, `returnService` 3, `routes/almoxarifado/extended.js` 4 (D).

**Nenhum catch usa a falha da Auditoria para desfazer o ato** (medido nas quatro fatias). As que ficam: as de dentro do motor
**antes** do livro (séries, lote, material de cliente — o catch amplo do motor compensa e repetir funciona, medido), as já
não-fatais (59, entre `try/catch` e `.catch`) e a do excedente na conferência (`receiptService:729`, antes do `UPDATE`).

**As que derrubam a resposta com o ato feito — 49** (A 10, B 18, C 12, D 9), por consequência de repetir:

| Consequência medida | Portas |
|---|---|
| **Duplica** | cópia de requisição; regra de aprovação; criação do recebimento (três auditorias no mesmo fluxo: 578, 590, 600); retalho; devolução **avulsa** (físico 20 → 23 → 26); solicitação de sucateamento; calibração de ferramenta; material com `codigo_auto` (FB-001 e FB-002, duas Entradas de saldo inicial); sugestão de compra (sem dedupe, lida) |
| **Perde o que já valeu** | processar a nota (`receiptService:1781`: estoque entrou e nota *Processado*, mas a reserva para quem espera **não nasce** e as solicitações não fecham; repetir → *"Nota já processada"* — o pior); destino do sucateamento (o catch da rota **apaga o comprovante** que a linha cita); assinatura de entrega (idem, o arquivo); reenviar notificação (volta a *Pendente* e não envia na hora); verificar mínimos (o laço para no primeiro) |
| **Recusa ao repetir** ("falhou" e depois "não pode") | aprovar / rejeitar / aprovar valor / rejeitar valor / aprovar regra / confirmar recebimento / encerrar requisição; workflow do recebimento; cancelar solicitação de compra; NC manual (409); aprovar / rejeitar / cancelar sucateamento; regularizar movimentação; empréstimo, devolução, bloqueio, desbloqueio, manutenção, reencontro e ocorrência de ferramenta; status de série, regularizar séries; status do lote |
| **Inofensivo ao repetir** (mas a tela diz erro) | editar regra; editar ferramenta; criação de ferramenta (409); transferir reserva; editar sobra; liberar vencimento e certificado do lote; fim de manutenção |

**E três que não são "depois do ato" mas param um desfazer no meio** (`seriesService:108`, `125`, `190` — a auditoria da
`COMPENSACAO` dentro de `desfazerEntrada`/`desfazerSaida`): com ela falhando, o desfazer para — medido: 500 em vez do 400 do
negócio e **físico 1 com 2 séries presentes**. **Duas que mascaram o erro original** (`returnService:340`, `357`, no catch das
pernas da devolução: o 400 *"exige lote"* vira 500). **Três contidas que pulam o resto de um laço** (`purchaseService:450`
`RECEBIDA`, `receiptService:2229` `STATUS_AUTOMATICO_RECEBIDO`, `nonConformityService:651` `NC_CANCELADA` automático).

## Decisões (C252)

- **D7 — a Auditoria do ato é não-fatal nas 49**, pelo mesmo helper: `audit.registrarAuditoriaDoAto(db, payload)` —
  `try { registrarAuditoria } catch { console.warn('[almoxarifado] auditoria do ato falhou (⟨entidade⟩ ⟨id⟩, ⟨acao⟩): ⟨msg⟩') }`.
  O ato fica gravado com quem e quando na própria tabela dele; some só da tela de Auditoria (como a B778). **Descartado:** manter
  o erro (medido: não protege ninguém); desfazer o ato quando a Auditoria falha (sem transação; o desfazer também pode falhar);
  gravar a Auditoria antes do ato (registro falso se o ato falhar); corrigir só as que duplicam (as que "recusam ao repetir" e a
  nota processada sem reserva deixam o usuário sem saber se valeu).
- **D8 — o desfazer das séries** (`seriesService` 108, 125, 190) usa o mesmo helper: a Auditoria do desfazer não pode parar o
  desfazer. **Descartado:** auditar depois do laço (perde a linha por série).
- **D9 — as duas que mascaram** (`returnService` 340, 357) usam o helper e o `throw e` original continua.
- **D10 — as três contidas em laço** usam o helper (o item seguinte não fica para trás). Fora do critério estrito da C252 (não
  chegam à resposta), mas a mesma forma e o mesmo custo.
- **D11 — ficam fatais, de propósito:** as de dentro do motor antes do livro (séries, lote, material de cliente — o motor
  compensa — medido: 500 sem nada gravado, e repetir funciona) e a do excedente na conferência (antes do `UPDATE`).
