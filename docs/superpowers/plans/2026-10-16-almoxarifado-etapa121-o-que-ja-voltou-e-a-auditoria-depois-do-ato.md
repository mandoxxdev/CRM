# Almoxarifado — Etapa 121: o que já voltou não se devolve de novo, e a Auditoria depois do ato não desfaz o ato (plano)

> Origem: "Próxima tarefa detalhada — Etapa 121" do plano da 120 (**C253**, **C252**). Design com a Fase 0 medida:
> `docs/superpowers/specs/2026-10-16-almoxarifado-etapa121-o-que-ja-voltou-e-a-auditoria-depois-do-ato-design.md`.
>
> **Numeração** (conferida com `grep -oE` em `docs/almoxarifado-novidades-por-etapa.md` em 2026-10-16): última B **B782**,
> último C **C253**, última A **A68**. Esta etapa: **B783+**, **C254+**, **A69+**. Worktree `CRM-wt-e121`, branch `etapa-e121`
> (a partir da main `9d78a820`); nenhuma outra etapa em paralelo.

> **Divergência registrada (Fase 2):** a T1 foi escrita (TDD) antes da revisão do plano — a ordem da skill pede o contrário; a
> revisão fresca (um agente, sondas `e121r-retrabalho.js`, `e121r-arquivos.js`, não versionadas) leu a T1 já pronta. Achou **0
> Critical, 5 Important, 2 Minor**, dois reproduzidos. **I1 (reproduzido)** — a régua da T1 descontava duas vezes a mesma peça
> quando a devolução que cita S **não levou série** (RETRABALHO, SUCATA sem série, a devolução sem série da B755) e a peça
> voltou depois por uma Entrada: S de 2, RETRABALHO 1, Entrada V1 → *"restam 0"* com V2 ainda fora (antes da T1: 1, certo) →
> a conta vira `restante = q − MAX(devolvida, devolvidas_com_série + voltaram)` (**RN-04b**, **B785**). **I2 (reproduzido)** —
> a calibração e a ocorrência de ferramenta também **apagam o arquivo** (o catch da rota) → movidas para "perde o que já valeu",
> a RN-12 confere o arquivo no disco. **I3** — a premissa da D7 ("some só da tela de Auditoria") é falsa onde a trilha é lida como
> estado: a reabertura do pedido no estorno da nota lê a `STATUS_AUTOMATICO_RECEBIDO` (`receiptService:2311`) e o relatório de
> fornecedor lê a `FINALIZAR_CONFERENCIA` (`reportService:398`) — sem a linha, o pedido não reabre e o recebimento fica "não
> conferido" (igual a hoje para aquele item; declarado, **B784**). **I4** — `auditarExcedenteAutorizado` é compartilhado entre a
> criação (578, corrigir) e a conferência (729, fica fatal) → mudar os **chamadores** da criação, não o helper; a RN-14 ganha a
> guarda da 729. **I5** — o rótulo da tela perdia o "devolvido" quando havia os dois → RN-08t refeita. **M1** — a T7 diz
> `devolucao/CRIACAO` (só `CRIACAO` pegaria a de série, dentro do motor). **M2** — a 729 grava a Auditoria antes do ato, num laço
> (falha no 2º item deixa a do 1º) — fora do escopo, declarado em D (121).

## Regras de negócio

"Auditoria falhando" = o `INSERT INTO auditoria_log_almoxarifado` com a `entidade` e a `acao` citadas forçado a falhar uma vez
(gancho no `db.run`, molde `lancamentoQueValeu.api.test.js`). "Desligar a série" = `PUT /materiais/:id` com
`controle_serie: false` pelo Administrador (200). Material com série; **S** = a Saída de 2 com V1 e V2 depois de uma Entrada de 2.

**C253 — a devolução não devolve de novo o que já voltou por outra entrada (B783).** Testes em
`server/tests/api/devolucaoDoQueVoltou.api.test.js`.

- **RN-01 — todas voltaram, desligada.** Entrada avulsa V1, V2 → desliga → `GET /devolucoes/saidas-elegiveis` dá S com
  `saldo_devolvivel: 0`, `quantidade_reentrada: 2`, `quantidade_devolvida: 0`; `POST /devolucoes` ESTOQUE 2 citando S → **400**
  *"Devolução acima do entregue: a saída ⟨S⟩ entregou 2, já foram devolvidos 0, 2 já voltaram ao estoque por uma entrada que não
  cita esta saída e restam 0"*, físico 2, nenhuma linha de devolução.
- **RN-02 — ligada.** O mesmo sem desligar (as séries informadas) → a lista dá 0 e a recusa é a mesma literal (antes da
  conferência das séries).
- **RN-03 — parcial.** Só V1 voltou → desliga → a lista dá 1; devolver 2 → *"…, 1 já voltou ao estoque por uma entrada que não
  cita esta saída e restam 1"*; devolver 1 → 201, físico 2.
- **RN-04 — a devolução avulsa conta.** Devolução sem citar S com V1, V2 → desliga → devolver 2 citando S → 400 (a literal da
  RN-01).
- **RN-04b — a devolução sem série não conta duas vezes (Fase 2, I1).** S de 2 → devolução RETRABALHO 1 citando S (as séries
  ficam *Entregue*) → Entrada V1 → a lista dá 1 e devolver 1 citando S → 201; e o caso misto: devolução citando S **com** V1 →
  Entrada avulsa V2 → a lista dá 0. Fórmula: `restante = q − MAX(devolvida_viva, devolvidas_com_série + voltaram)`.
- **RN-05 — não regride.** (a) a devolução que cita S com V1 conta uma vez só (lista 1, `quantidade_reentrada` 0; a literal de
  sempre *"…, já foram devolvidos 1 e restam 1"*); (b) a devolução que cita S com V1, V2 desfeita pelo livro, desliga → devolve 2,
  físico 2; (c) material sem série: a conta de sempre.
- **RN-06 — o falso negativo da Fase 2 da 120.** Volta → estorno da volta com a série ligada (séries *Estornada*) → nova Entrada
  V1, V2 → desliga → devolver 2 → 400 (a literal da RN-01), físico 2.
- **RN-06b — declarado.** A volta estornada sem nova entrada (ligada) e a volta estornada com a série desligada (C225) continuam
  contando → 400, físico 0 (o material está fora; o acerto é um Ajuste). Recusar nunca conta em dobro.
- **RN-07 — no mesmo comando.** A linha da volta gravada entre a validação e o `INSERT` (gancho) → 400 com a literal da RN-01,
  nenhuma linha, físico 0.
- **RN-08 — legado.** A linha sem `saida_anterior_id` → devolve como antes (201, físico 4) — a **A68** acha.
- **RN-08t — a tela.** A saída com `quantidade_reentrada > 0` diz *"⟨v⟩ já voltaram ao estoque por outra entrada"* (ou *"1 já
  voltou …"*) e não *"já devolvido por inteiro"*; com saldo, *"devolvível ⟨r⟩ · ⟨v⟩ já voltou …"*;
  com devolução também, *"devolvido ⟨d⟩ · ⟨v⟩ já voltou …"* (`DevolucoesAlmoxarifado.test.js`).

**C252 — a Auditoria do ato não derruba o ato (B784).** O helper `audit.registrarAuditoriaDoAto(db, payload)`: grava como
`registrarAuditoria`; se o banco falhar, `console.warn` *"[almoxarifado] auditoria do ato falhou (⟨entidade⟩ ⟨id⟩, ⟨acao⟩):
⟨msg⟩"* e segue. Em cada porta: com a Auditoria falhando, a resposta é a de sempre (status e corpo), o ato está gravado **uma
vez**, e o que vem depois roda.

- **RN-09 — o helper** (`auditoriaDoAto.api.test.js`): grava a linha; com o `INSERT` falhando resolve `false`, não lança, e o log
  tem a literal; com a linha gravada resolve `true`.
- **RN-10 — requisição e regras** (`routes/almoxarifado.js`, 10; `auditoriaDoAtoRequisicao.api.test.js`): aprovar (200,
  reservas), rejeitar, aprovar valor, rejeitar valor, aprovar regra, confirmar recebimento, encerrar (200, reservas soltas, a
  trava solta), copiar (201, **um** rascunho novo), criar regra (201, **uma** regra), editar regra.
- **RN-11 — recebimento, compras, NC, reserva, assinatura, fila** (12 + 3 laços; `auditoriaDoAtoRecebimento.api.test.js`):
  criar recebimento (as três auditorias: excedente autorizado, excedente do saldo do pedido, criação — **um** documento; os
  **chamadores** 578 e 590 de `auditarExcedenteAutorizado`, não o helper, que a conferência 729 usa fatal — Fase 2, I4);
  workflow; **processar a nota** (200, a reserva da requisição que esperava **nasce**, as solicitações fecham); cancelar
  solicitação; verificar mínimos (os dois materiais ganham solicitação); sugestão de compra; NC manual (201, uma NC);
  transferir reserva; assinatura de entrega (201, **o arquivo fica no disco**); reenviar notificação (200, envia na hora); e os
  três laços (`RECEBIDA` do primeiro item não pula o segundo; `STATUS_AUTOMATICO_RECEBIDO`; `NC_CANCELADA` automática).
- **RN-12 — ferramenta, série, lote, material** (18 + 3 desfazer; `auditoriaDoAtoCadastros.api.test.js`): as 12 de ferramenta
  (calibração: **uma** linha e **o certificado no disco**; ocorrência: **a foto no disco** — Fase 2, I2); status de série; regularizar séries; as três de lote; criar material (com `codigo_auto`: **um**
  material, **uma** Entrada de saldo inicial); e o desfazer das séries com a Auditoria da `COMPENSACAO` falhando → a recusa de
  negócio de sempre (400) e o invariante intacto (físico = séries presentes).
- **RN-13 — sucateamento, retalho, devolução, regularização** (9 + 2; `auditoriaDoAtoSucata.api.test.js`): solicitar (**uma**),
  aprovar, rejeitar, cancelar, registrar destino (200, **o comprovante fica no disco**); editar sobra; gerar retalho (201, **uma**
  sobra, origem baixada uma vez); devolução avulsa (201, físico +3 uma vez, nenhuma `ESTADO_PARCIAL`); regularizar movimentação;
  e as duas que mascaravam (a `COMPENSACAO` e a `ESTADO_PARCIAL` da devolução falhando → o 400 original do motor, não 500).
- **RN-14 — ficam fatais, de propósito** (no arquivo do helper): a Auditoria de série dentro do motor antes do livro (Entrada com
  série, `serie/CRIACAO` falhando → 500, nada gravado, repetir → 201) — guarda de que o helper não foi espalhado onde o motor
  compensa; e a do excedente na **conferência** (`receiptService:729`, antes do `UPDATE`) com a Auditoria falhando → 500 e nada
  gravado (Fase 2, I4 — o teste fica na T4, que mexe no arquivo).

## Contrato congelado

Nenhum corpo de resposta muda, exceto o campo **novo** `quantidade_reentrada` em `GET /devolucoes/saidas-elegiveis` (aditivo).
Literal nova só a da RN-01/RN-03 (a de sempre continua sem a volta por fora). Log: *"[almoxarifado] auditoria do ato falhou
(⟨entidade⟩ ⟨id⟩, ⟨acao⟩): ⟨msg⟩"*. Schema: nenhum.

## Tasks (sort topológico)

- [ ] **T1 — tronco (C253, devolução)** — `devolucaoViva.seriesQueVoltaramSql`, `returnService` (validação, `INSERT`, lista).
  RN-01..RN-08.
- [ ] **T1b — galho (C253, tela)** — `DevolucoesAlmoxarifado.js` (rótulo). RN-08t. Contra o contrato (`quantidade_reentrada`).
- [ ] **T2 — tronco (C252, helper)** — `audit.registrarAuditoriaDoAto`. RN-09, RN-14.
- [ ] **T3 — galho (C252 A)** — `routes/almoxarifado.js`. RN-10.
- [ ] **T4 — galho (C252 C)** — `receiptService`, `purchaseService`, `nonConformityService`, `reservationService`,
  `deliverySignatureService`, `notificationQueueService`. RN-11.
- [ ] **T5 — galho (C252 B)** — `toolService`, `seriesService`, `lotService`, `materialService`. RN-12.
- [ ] **T6 — galho (C252 D)** — `scrapDisposalService`, `scrapService`, `returnService` (o fim e o catch das pernas),
  `routes/almoxarifado/extended.js`. RN-13. Depende da T1 (mesmo arquivo `returnService`, regiões disjuntas).
- [ ] **T7 — integração** (cruza Recebimento, Requisições, Movimentações, Devoluções, Séries) —
  `server/tests/api/oQueJaVoltouIntegracao.api.test.js`: (i) **pela rota**: requisição de 2 de material com série esperando
  estoque → nota processada com V1, V2 e a Auditoria `PROCESSAR_NOTA` falhando → 200 e a requisição reservada (C252) → separar,
  entregar (S) → Entrada avulsa V1, V2 → desliga → a lista dá S com 0 → a devolução citando S recusa com a literal (C253) → a
  devolução **avulsa** de 1 com a Auditoria `devolucao`/`CRIACAO` falhando → 201, físico +1 uma vez (C252); (ii) **pelo serviço**:
  `returnService.registrarDevolucao` citando S lança a mesma literal, e `listarSaidasElegiveis` dá o mesmo número.
- [ ] **T8 — fechamento** (skill `fechar-etapa`).

Galhos: T3..T6 só **consomem** o helper (tronco T2) e mexem em arquivos disjuntos, cada um com o seu arquivo de teste — rodam em
paralelo, cada um na sua worktree (`CRM-wt-e121-g{3,4,5,6}`, junções de `node_modules`), e entram por cherry-pick. Mesmo critério
da Fase 3: um erro de leitura num deles não exige retrabalho no outro (a regra é a mesma, o helper já congelado).
