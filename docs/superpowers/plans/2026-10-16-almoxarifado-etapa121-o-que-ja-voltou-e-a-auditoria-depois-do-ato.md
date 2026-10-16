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
> a conta ia virar `restante = q − MAX(devolvida, devolvidas_com_série + voltaram)` — **escrito, medido e DESCARTADO** (ver a
> RN-04b: o MAIOR devolve em dobro quando a peça que voltou é a outra; a SOMA fica, conservadora — **B785**; o achado do I1 é
> real, a correção sugerida pela revisão é que estava errada). **I2 (reproduzido)** —
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
- **RN-04b — declarado: a devolução sem série e a volta de uma peça SOMAM (Fase 2, I1; B785).** S de 2 → devolução RETRABALHO 1
  citando S (as séries ficam *Entregue*) → Entrada V1 → a lista dá **0** e devolver V2 citando S → **400** *"…, já foram devolvidos
  1, 1 já voltou ao estoque por uma entrada que não cita esta saída e restam 0"*; a devolução **avulsa** de V2 → 201. Misto:
  devolução citando S com V1 → Entrada avulsa V2 → a lista dá 0. *(Esta RN dizia "a lista dá 1 e devolver 1 citando S → 201",
  com `MAX(devolvida, devolvidas_com_série + voltaram)` — **estava errada**: não há como saber se V1 é a peça do retrabalho; se
  for a outra, nada está fora e o MAIOR devolveria em dobro. Medido: o MAIOR também deixava a RN-03 devolver uma peça a mais.)*
- **RN-04c — nunca negativo (Fase 5, r3).** RETRABALHO das 2 → Entrada V1 → a lista dá 0 (não −1) e a recusa diz *"restam 0"*.
- **RN-05 — não regride.** (a) a devolução que cita S com V1 conta uma vez só (lista 1, `quantidade_reentrada` 0; a literal de
  sempre *"…, já foram devolvidos 1 e restam 1"*); (b) a devolução que cita S com V1, V2 desfeita pelo livro, desliga → devolve 2,
  físico 2; (c) material sem série: a conta de sempre.
- **RN-06 — o falso negativo da Fase 2 da 120.** Volta → estorno da volta com a série ligada (séries *Estornada*) → nova Entrada
  V1, V2 → desliga → devolver 2 → 400 (a literal da RN-01), físico 2.
- **RN-06b — declarado.** A volta estornada sem nova entrada (ligada) e a volta estornada com a série desligada (C225) continuam
  contando → 400, físico 0 (o material está fora; o acerto é um Ajuste). Recusar nunca conta em dobro.
- **RN-07 — no mesmo comando.** A linha da volta gravada entre a validação e o `INSERT` (gancho) → 400 com a literal da RN-01,
  nenhuma linha, físico 0.
- **RN-09..RN-09d — sob a trava (Fase 5, r2; B786).** A devolução para Estoque roda as pernas sob `naTravaDoMaterial` e relê
  ali o controle de série e o que já voltou da saída citada. Com o gancho segurando a resposta do `INSERT` e, do contexto do teste,
  uma Entrada das séries + o desligar: citando S com V1, V2 → 400 *"O controle por número de série do material ⟨código⟩ foi
  desligado enquanto a devolução era gravada — nada foi gravado. Registre a devolução de novo."*, físico 2 (RN-09); avulsa com V1
  → a mesma, físico 1 (RN-09b); citando S sem série (desligada; religa, Entrada, desliga no meio) → 400 *"A saída ⟨S⟩ mudou
  enquanto a devolução era gravada — nada foi gravado. Tente de novo."* (RN-09c); os gestos logo depois da releitura esperam a
  trava → 201 com as séries, a Entrada 400, físico 2 (RN-09d).
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

- [x] **T1 — tronco (C253, devolução)** `b5f43da1`, Fase 2 `db5559d4`, Fase 5 `c52e5484` — `devolucaoViva.seriesQueVoltaramSql`, `returnService` (validação, `INSERT`, lista).
  RN-01..RN-08.
- [x] **T1b — galho (C253, tela)** `02704ce4`, Fase 2 `91027cbb`, Fase 5 `691f034c` — `DevolucoesAlmoxarifado.js` (rótulo). RN-08t. Contra o contrato (`quantidade_reentrada`).
- [x] **T2 — tronco (C252, helper)** `931bb1a2`, Fase 5 `47395cee` (RN-14b, RN-14c) — `audit.registrarAuditoriaDoAto`. RN-09, RN-14.
- [x] **T3 — galho (C252 A)** `e50f8f7d` (worktree `CRM-wt-e121-g3`, entrou por cherry-pick) — `routes/almoxarifado.js`. RN-10.
- [x] **T4 — galho (C252 C)** `66eafc59` (worktree g4, cherry-pick) — `receiptService`, `purchaseService`, `nonConformityService`, `reservationService`,
  `deliverySignatureService`, `notificationQueueService`. RN-11.
- [x] **T5 — galho (C252 B)** `acc9778c` (worktree g5, cherry-pick), Fase 5 `12b92c40` (RN-12l..n) — `toolService`, `seriesService`, `lotService`, `materialService`. RN-12.
- [x] **T6 — galho (C252 D)** `897b1fb6` (worktree g6, cherry-pick), limpeza do import `f9699f63` — `scrapDisposalService`, `scrapService`, `returnService` (o fim e o catch das pernas),
  `routes/almoxarifado/extended.js`. RN-13. Depende da T1 (mesmo arquivo `returnService`, regiões disjuntas).
- [x] **T7 — integração** `15f3109f` (cruza Recebimento, Requisições, Movimentações, Devoluções, Séries) —
  `server/tests/api/oQueJaVoltouIntegracao.api.test.js`: (i) **pela rota**: requisição de 2 de material com série esperando
  estoque → nota processada com V1, V2 e a Auditoria `PROCESSAR_NOTA` falhando → 200 e a requisição reservada (C252) → separar,
  entregar (S) → Entrada avulsa V1, V2 → desliga → a lista dá S com 0 → a devolução citando S recusa com a literal (C253) → a
  devolução **avulsa** de 1 com a Auditoria `devolucao`/`CRIACAO` falhando → 201, físico +1 uma vez (C252); (ii) **pelo serviço**:
  `returnService.registrarDevolucao` citando S lança a mesma literal, e `listarSaidasElegiveis` dá o mesmo número.
- [x] **T8 — fechamento** (skill `fechar-etapa`) — o commit de documentação desta etapa (ver `git log`); CLAUDE.md `9b458ca4`.

Galhos: T3..T6 só **consomem** o helper (tronco T2) e mexem em arquivos disjuntos, cada um com o seu arquivo de teste — rodam em
paralelo, cada um na sua worktree (`CRM-wt-e121-g{3,4,5,6}`, junções de `node_modules`), e entram por cherry-pick. Mesmo critério
da Fase 3: um erro de leitura num deles não exige retrabalho no outro (a regra é a mesma, o helper já congelado).

## Execução — o que aconteceu

- **Fase 0** (sondas `e121fase0.js`, `e121fase0b.js`, não versionadas): C253 reproduzida (desligada: 201, físico 4; ligada: a lista
  oferece 2) e mais sete sequências medidas (a volta estornada ligada + nova entrada → 201, físico 4 — o falso negativo previsto na
  120 existe; a devolução avulsa das séries → físico 4; a devolução citando S desfeita → correto). C252: **quatro medidores em
  paralelo** (sondas `e121m-{A,B,C,D}-*.js`) leram as **110** chamadas até a rota — 49 derrubam a resposta com o ato feito, 3
  param um desfazer, 2 mascaram o erro, 3 pulam o resto de um laço; nenhum catch usa a falha para desfazer.
- **Fase 1 / ordem:** a T1 foi escrita (TDD) **antes** da revisão do plano — divergência registrada no topo.
- **Fase 2** — um revisor fresco, com sondas: 0 Critical, 5 Important, 2 Minor (ver o topo). Design e plano `e511c93d`.
- **TDD:** todos os testes antes do código. C253: RN-01..RN-07 vermelhos (RN-08 é legado — guarda); RN-04b, RN-04c e RN-14b/c são
  guardas (passam antes, de propósito; o controle prova cada uma). C252: T3 0/10, T4 1/16 (o 1 é a guarda da conferência), T5
  2/13 (os 2 são os controles sem falha), T6 0/11 antes; T7 com o serviço de antes cai nas três frentes.
- **Galhos em paralelo:** T3..T6 em quatro worktrees (`CRM-wt-e121-g{3,4,5,6}`), entrados por cherry-pick sem conflito. **As quatro
  suítes completas rodando ao mesmo tempo esgotaram as portas efêmeras** (`connect EADDRINUSE`, 12 a 16 mil conexões em TIME_WAIT):
  nenhuma rodada inteira de `test:api` limpa nas worktrees; cada executor rerodou os arquivos que caíram até passar, e a suíte
  inteira foi rodada **sozinha** na branch integrada (403/403, 0 EADDRINUSE) antes do commit da integração. *Lição:* galhos em
  paralelo rodam só os próprios arquivos; a suíte inteira, um por vez ou só na integração.
- **Controles positivos** (cada um com âncora contada, md5 e restauro por cópia): C253 — sem o desconto na validação, no `INSERT`,
  na lista, sem excluir a devolução de S, o MAIOR no lugar da soma; C252 — cada porta revertida derruba o seu teste (T3: 3, T4: 7,
  T5: 7, T6: 6, mais os da Fase 5); a integração — `PROCESSAR_NOTA` fatal, a validação sem desconto, a `CRIACAO` fatal.
- **Fase 5** — três revisores frescos em paralelo, cada um na sua worktree (removidas). **Regra (r1):** 1 Important (o desfazer
  do estorno com a Auditoria falhando parava no meio — movimentação presa como cancelada sem estorno; anterior, da 118) e 1 Minor
  (o estoque mínimo em lote perdia a trilha dos seguintes) → `12b92c40`; e o plano dizia a fórmula descartada na RN-04b →
  corrigido aqui. **Concorrência (r2):** 1 Important reproduzido, anterior (a devolução creditando sem série com a Entrada e o
  desligar no meio, 8/300; 20/20 com gancho) → **B786** `c52e5484` + CLAUDE.md `9b458ca4`; 1 Minor anterior (o `/aprovar` cujo
  `UPDATE` de status falha deixa as reservas ativas) → declarado, **C254**; nenhuma trava presa nem deadlock nas corridas da C252.
  **Sabotagem (r3):** 96 sabotagens (94 válidas): 87 vermelhas pela asserção certa, 2 equivalentes (`COUNT(DISTINCT)` × `COUNT(*)`;
  o `Number()` do rótulo), **5 sem prova** → RN-04c (as duas guardas de "nunca negativo"), RN-14b e RN-14c (série dentro do motor
  fica fatal) `47395cee`, e o rótulo sem volta por fora `691f034c`. Cada uma com o controle medido.
- **Suíte final (medida, depois de `9b458ca4`):** `test:api` **403/403** arquivos (0 EADDRINUSE); `test:almoxarifado` **44/0**;
  `test:validation` 4/0, `test:safealter` 3/0, `test:sqlite` 10/0; client **115** suítes / **1630** testes; `CI=true build`
  *Compiled successfully*. Sem migração (nenhum schema mudou).
- **Divergências do plano:** (1) a T1 antes da Fase 2; (2) a correção sugerida pela Fase 2 para o I1 (o MAIOR) estava errada — a
  RN-04b virou declaração (soma); (3) a Fase 5 trouxe a trava na devolução para Estoque (B786), os dois desfazeres do estorno e o
  lote de mínimos (fora das 49 medidas — a medição da fatia B não leu `desfazerReverterSaida/Entrada` como "desfazer" e a da A
  contou `auditarLoteMaterial` como já protegido pelo `.catch` de fora).

## Retro (4 números)

1. **Rodadas de correção até verde:** **1** de redesenho na Fase 2 (a RN-04b e o rótulo) e **1** no código (Fase 5). Nenhum teste
   antigo mudou de comportamento esperado.
2. **Achados da revisão:** Fase 2 — **5 Important + 2 Minor, todos reais** (a correção sugerida para um deles, não). Fase 5 —
   **3** de produção corrigidos (r1 ×2, r2 ×1), **1** declarado (C254), **5** sabotagens sem prova → teste, **2** equivalentes,
   **0** ruído.
3. **Paralelismo:** **4** galhos em paralelo de fato (T3..T6), **0** retrabalho de código; **1** custo de ambiente (portas
   esgotadas pelas quatro suítes simultâneas). Quatro medidores em paralelo na Fase 0 e três revisores na Fase 5.
4. **Defeito que escapou:** *(preencher na Etapa 122)*. **Da Etapa 120:** **nenhum defeito introduzido por ela** — a régua nova
   da 121 se apoia na coluna `saida_anterior_id` da 120 e ela se comportou como descrita. Um erro de **medição**: a "próxima
   tarefa" da 120 contou **115** chamadas à Auditoria com `grep` (somava `require`s e comentários — são **110**), e a fatia B da
   121 deixou de fora dois desfazeres que a r1 achou; não mudou decisão nenhuma.

## Próxima tarefa detalhada — Etapa 122

*(A série desta etapa foi B783–B787, C254–C255, A69 — a 122 começa em **B788**, **C256**, **A70**; confira com `grep -oE` antes.)*

**Como foi escolhida (mapa `specs/modulo-almoxarifado/README.md` e os C abertos, medidos em 2026-10-16):** as features 🟡
continuam 00, 01, 05, 06, 21, 22 e 23; o motor (03) está 🟢. Candidatos:

1. **C254 — o `/aprovar` cujo `UPDATE` de status falha deixa as reservas ATIVA com a requisição PENDENTE** (feature 06/07).
   **Medido** pelo revisor r2 da 121 (sonda `e121r2-aprovar-falha.js`, não versionada — recriar: requisição de 3 com saldo,
   gancho que faz falhar o `UPDATE requisicoes_almoxarifado SET status` do `/aprovar` uma vez → 500, uma reserva ATIVA, status
   PENDENTE; reaprovar não reserva em dobro, 0/10). Ponto: `routes/almoxarifado.js` ~3990–4020 — `desfazerReservas` só roda quando o
   `UPDATE` perde (`changes = 0`), não quando lança; o mesmo molde no `/aprovar-valor` (~4130) e na aprovação automática
   (`requisitionService`, ~3774). Correção candidata: `try/catch` em volta do `UPDATE` que desfaz as reservas e relança. **Não
   depende do P.O.**
2. **C255 — duas leituras tratam a linha da Auditoria como estado** (feature 08/22/21). (a) `receiptService.destinoDaReabertura`
   (~2322) lê a última de `STATUS_AUTOMATICO_RECEBIDO` / `STATUS_AUTOMATICO_REABERTO` / `STATUS_MANUAL_ALTERADO` (a última é
   gravada pelo **Compras** — core, não módulo) para decidir se o estorno da nota reabre o pedido; (b) `reportService` (~398) dá o
   recebimento como *conferido* pela `FINALIZAR_CONFERENCIA`. Desde a 121 a linha pode faltar com o ato feito (antes também, por
   outro caminho). Correção candidata: o estado numa coluna (ex.: `pedidos_compra.fechado_automaticamente_*`;
   `recebimentos.conferencia_finalizada_em`) com `safeAlter` + preenchimento a partir da Auditoria no boot (primeiro boot num banco
   novo a provar) e uma **A** para o legado; atenção: mexe na tabela de pedido do **core** (Compras) → escolher o caminho
   reversível e registrar na letra B (core vs. módulo). **Não depende do P.O.** (a escolha core × módulo é reversível).
3. **D (121), o excedente na conferência** (`receiptService` ~729): grava a Auditoria antes do ato, item a item — a falha no 2º
   item deixa a do 1º sem o ato. Pequeno: gravar depois do `UPDATE`, ou acumular e gravar no fim.
4. **C231** (a mensagem da aprovação que manda reativar o material quando a família está inativa) — pequeno, de texto.
5. **C246/C247** — só com transação de verdade (Postgres) ou um reparo no boot; o reparo automático do claim preso **depende do P.O.**
6. **Dependem do P.O.:** **B755**, **B761**/**C239**, **C224**, o resto da **C225**, **C228**, **C219**, **C230**, o reparo da **C246**.

**Escolhida: C254 + C255 (+ o excedente da D (121), se couber).**

**Contrato candidato:** C254 — o `/aprovar` (e o `/aprovar-valor`, a automática) que falha ao gravar o status responde o erro de
sempre e **não deixa reserva ATIVA** (nenhum corpo novo). C255 — o estorno da nota reabre o pedido fechado automaticamente e o
relatório dá o conferido **mesmo sem a linha da Auditoria**; nenhum corpo novo; schema: as colunas novas por `safeAlter`.

**Pontos de atenção:** a trava não é reentrante; o `/aprovar` reserva sob `comTravaDaRequisicao` e o desfazer das reservas tem de
rodar antes de soltar (CLAUDE.md); gesto concorrente em teste parte do contexto do teste; **galhos em paralelo não rodam a suíte
inteira ao mesmo tempo** (portas esgotadas — a lição da 121); molde de teste: `auditoriaDoAtoRequisicao.api.test.js` (o gancho por
`entidade`/`acao`) e `auditoriaDoAtoRecebimento.api.test.js` (RN-11n, o fechamento automático do pedido).

**O que já está pronto e não precisa reabrir:** a Auditoria do ato não-fatal em todas as portas medidas (`audit.registrarAuditoriaDoAto`);
as que ficam fatais têm teste (RN-14, RN-14b, RN-14c e a da conferência); a devolução com a régua do que voltou por fora e sob a
trava (B783–B786).
