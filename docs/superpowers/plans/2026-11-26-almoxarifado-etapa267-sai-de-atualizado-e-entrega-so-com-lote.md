# Etapa 267 — O "Sai de" se atualiza depois de uma recusa (C473) e a entrega com só o lote respeita a separação de outra requisição (C471)

> Itens **14** e **15** da estimativa da semana (`docs/estimativas/2026-11/estimativa_2026-11-23_almoxarifado-semana.md` — 45 min + 1h30; não
> refeita: a Fase 0 confirmou os dois do tamanho estimado). A "próxima tarefa detalhada" do plano da 266.
> **Fatia visível:** nas janelas de **Separar** e de **Entregar**, quando a confirmação é recusada porque outra pessoa separou da mesma
> prateleira, a lista do **Sai de** passa a mostrar a sobra nova (e, na separação, a sugestão da Fila é refeita) sem fechar e reabrir.

## Fase 0 — medido (sonda `server/tests/api/zzsonda267.api.test.js`, apagada antes do commit, sobre `cbbd9ed7`)

### Item 15 (C471, B1341) — confirmado

Material com controle de lote, padrão *XP-01* (L2 9). Lote *L1*: *XB-01* 4 e *XB-02* 2. R1 separou 4 de *XB-01/L1*; R2 separou 2 no automático.
R2 entrega 2 escolhendo **só o lote** *L1* (`lote_id` sem `localizacao_origem_id`) → **200, e saiu de *XB-01*** (XB-01 2, XB-02 2). A entrega de R1
pelo par → **400** *"E200-1: O saldo em XB-01 (2) não cobre a quantidade (4) — a saída tiraria de outros endereços"*. Com R2 pedindo **4** (só 2
livres no lote) → **200**, XB-01 0, XB-02 2: levou as 4 de R1.

- **Por quê:** o só lote vai ao motor sem endereço (`baixar` com `lote_id`, origem não estrita) e o claim do lote drena a padrão e depois a maior
  linha; a conferência do só lote (`checarOrigemItem`) olha só o físico do lote; a conferência do lote da 218 (`guardadoNoLoteDeOutras`) só roda
  com peça presa no lote.
- **Pela tela o só lote quase não chega:** a janela de entrega sempre manda o endereço junto com o lote (`lerValorOrigem` exige endereço). Chega
  pela API e — o caso da tela — pela entrega de **série** com o **Sai de** no automático (o lote vem das séries, `loteId = loteSeries`).
  Séries ficam fora desta etapa (B1633).

### Item 14 (C473) — confirmado

`RequisicoesList.js`: os saldos por endereço (`GET /estoque/:material/saldos?requisicao_id=`) são lidos no efeito da chave
`materiaisEntregaKey` (abrir a janela); a sugestão (`GET /requisicoes/:id/sugestao-coleta`) no efeito da `sugestaoKey`. Na recusa,
`handleSeparacao` só mostra o toast (o 409/403 de alçada fecha) e `entregarItens` só relê as **séries** (`recarregarSeriesEntrega`). Nada relê o
**Sai de** nem a sugestão: o número é o de quando a janela abriu, e a opção recusada continua escolhida com o número velho.

## Decisões

- **B1631 (item 14)** — a releitura dispara só na recusa **por saldo**: toda frase de saldo do servidor termina em *"não cobre a quantidade"* — a
  do separado de outras (*"… já está separado dali para outra requisição …; sobra 2, que não cobre a quantidade (4) …"*), a do lote (*"… já
  separadas dele …; não cobre a quantidade (4)"*) e a física (*"O saldo em XB-01 (2) não cobre a quantidade (4) …"*, também dentro do envelope
  *"não serve mais"*). *(Fase 2: a primeira redação casava só a frase do separado de outras — deixava de fora a física, que é justamente a que a
  Fase 0 mediu para R1, e o singular "já separada dele".)* **Descartado:** reler em toda recusa — a recusa por
  motivo, quantidade ou permissão não muda saldo e refazer a sugestão nesses casos trocaria a pré-seleção sem razão. **Reversível** (uma
  expressão na tela).
- **B1632 (item 14)** — na separação, a releitura **refaz a pré-seleção** só do item cujo **Sai de** ainda é o que a sugestão escolheu (o
  almoxarife não mexeu); o que ele trocou fica (RN-189.05), e o item com planejada fica na regra da 65. As quantidades ficam. Na entrega não há
  sugestão: só a lista se atualiza e a escolha fica (a opção recusada passa a mostrar a sobra nova). **Descartado:** (a) zerar todas as escolhas
  (como reabrir — perde o que o almoxarife fez); (b) só reler a lista sem refazer a sugestão (a opção recusada continua escolhida e o próximo
  clique é recusado de novo). **Reversível.**
- **B1633 (item 15)** — a entrega com **só o lote** (lote sem endereço) de material com controle de lote, **sem série**: (1) a conferência do lote da
  218 passa a rodar também sem peça presa quando há parte guardada no lote (de outras requisições, ou que fica de outras peças desta) — se o lote
  não cobre, 400 antes de qualquer baixa com a **mesma frase** da 218; (2) a baixa sai pelas prateleiras do lote descontando a parte guardada de
  cada uma (o livre por prateleira do automático, `lotesParaOAutomatico`), uma SAÍDA por prateleira com o endereço. Lote sem guarda que conte:
  como hoje. *(Fase 2: a primeira redação dizia "as prateleiras usáveis não cobrem: como hoje (tudo ou como hoje, o molde da B1398)" — **estava
  errado**: a conferência do lote passava, a baixa não cobria e o motor levava a guarda da outra requisição, o C471 de volta — com o livre em
  prateleira bloqueada ou sem endereço, com a parte que fica do próprio item (troca 0) e com o estrito desta entrega na mesma prateleira. Agora
  (3) a conferência lê a mesma conta da baixa — o livre por prateleira menos o que os estritos desta entrega pedem de cada uma menos o que os só
  lote anteriores do mesmo lote pedem — e recusa antes de qualquer baixa com uma frase nova (RN-267.13).)* **Série com só lote** (o lote vindo das séries, Sai de automático): como hoje — as séries dizem quais peças, não de qual
  prateleira; fica na **D (267)**. **Descartado:** (a) recusar sempre que o motor iria à prateleira guardada sem tentar as outras (o almoxarife
  escolheu o lote, não a prateleira — sair da livre é o que ele quis); (b) mudar o claim do motor (todas as saídas usam; a entrega já sabe a
  guarda). **Reversível** (uma condição na conferência e um desvio na passada 1).

## Regras de negócio

### Item 14 — o "Sai de" relido na recusa (tela)

- **RN-267.01** Janela de separação: **Confirmar Separação** recusado (400) com uma frase de saldo (B1631) → a janela continua aberta, o toast
  mostra a mensagem do servidor, e a lista do **Sai de** de cada material da janela é relida (`GET /almoxarifado/estoque/:material/saldos?
  requisicao_id=<id>`): a opção passa a dizer a sobra (*"XB-01 — lote L1 (sobra 2 de 6; 4 para outras)"*, rótulo da 201). As quantidades ficam.
- **RN-267.02** Na mesma recusa a sugestão é relida (`GET /requisicoes/:id/sugestao-coleta`) e o item **sem planejada** cujo **Sai de** ainda é o
  que a pré-seleção escolheu (ou ficou em automático porque a sugestão não cobria, sem o almoxarife mexer) é decidido de novo com a sugestão nova
  (o par novo vem escolhido, com a frase *"Sugerido pela fila de separação. Se pegou de outro endereço, troque aqui."*; sem par, automático e a
  frase da sugestão). Item que o almoxarife trocou à mão: a escolha dele fica (RN-189.05). Item com planejada: regra da 65, sem mudança.
- **RN-267.03** Janela de entrega: **Confirmar Entrega** recusado com a frase do separado de outras (E1 da 200 ou a do lote da 218) → a lista do
  **Sai de** é relida como na RN-267.01; a escolha e as quantidades ficam. As séries continuam relidas como hoje.
- **RN-267.04** Outra recusa (motivo, quantidade, *"não cobre"*): como hoje, sem releitura. 409 e 403 de alçada: fecham a janela, como hoje.
  Falha da releitura (rede): a lista anterior fica, sem aviso novo. Janela fechada ou reaberta durante a releitura: a resposta é descartada.

### Item 15 — o só lote respeita a separação de outra requisição (motor da entrega)

- **RN-267.10** Entrega (`PUT /requisicoes/:id/entregar`) de item **sem série** com `lote_id` e **sem** `localizacao_origem_id`, material com
  controle de lote, lote com parte guardada que conta (de outra caixa viva, ou a que fica de outra peça desta requisição): a baixa sai pelas
  prateleiras do lote, cada uma com o livre dela (saldo da linha − parte guardada ali), na ordem padrão → maior saldo → id, sem a linha sem endereço
  e sem prateleira bloqueada — uma SAÍDA por prateleira, com o endereço. Cenário: *L1* em *XB-01* 4 (R1 separou 4 de lá) e *XB-02* 2; R2 entrega 2
  só *L1* → 200, sai de *XB-02* (XB-01 4, XB-02 0); R1 entrega pelo par → 200.
- **RN-267.11** O lote não cobre depois de descontar a guarda → **400 antes de qualquer baixa**, nada gravado, com a frase da 218 (letra por
  letra): *"⟨material⟩: no lote L1 há 6 PC, mas só 2 podem sair nesta entrega: 4 PC já separadas dele para outras requisições ou outras peças
  desta; não cobre a quantidade (4). Escolha outro lote ou deixe "Qualquer endereço (automático)""*. Com outro item da mesma entrega saindo do
  mesmo lote por endereço, a parcela *"⟨n⟩ PC já pedidas nesta entrega"* entra (a régua da 218). Lote **sem** guarda que conte: nenhuma
  conferência nova.
- **RN-267.12** Lote sem guarda que conte → como hoje (uma SAÍDA pelo lote; o motor escolhe a linha) — o livro igual ao de antes.
- **RN-267.13 (reescrita na Fase 2)** Guarda que conta, a conferência do lote passa, mas as prateleiras livres não cobrem (o livre está em prateleira
  bloqueada ou na linha sem endereço; a parte que fica do próprio item; o que os estritos desta entrega ou os só lote anteriores do mesmo lote
  levam) → **400 antes de qualquer baixa**, nada gravado: *"⟨material⟩: no lote L1 só 0 podem sair de prateleira livre nesta entrega — o resto do
  lote está separado para outras requisições ou outras peças desta, em prateleira bloqueada ou sem endereço; não cobre a quantidade (2). Escolha a
  prateleira no "Sai de" ou deixe "Qualquer endereço (automático)""* (singular *"só 1 pode"*). Vale também com saldo negativo permitido (como a E1
  da 200). Na baixa, cada pedaço (excedente e reservas) lê o livre de novo — a conferência garante o total.
- **RN-267.14** Com série: como hoje (B1633, D (267)).
- **RN-267.15 (integração, rota e serviço)** R1 separa 4 de *XB-01/L1* pela rota da tela (`PUT /separacao`); R2 separa 2 no automático; R2 entrega 2
  só *L1* → 200 de *XB-02*; R1 entrega no um clique (a planejada) → 200; o livro: SAÍDA 2 de *XB-02/L1* e SAÍDA 4 de *XB-01/L1*. O mesmo pelo
  serviço (`separarRequisicao`/`entregarRequisicao`).
- **RN-267.16 (corrida, serviço)** R1 separa 4 de *XB-01/L1* e R2 entrega 4 só *L1* ao mesmo tempo (10×, alternando): nunca as duas passam
  com a parte guardada maior que o físico do par (as duas travas por material serializam).

## Contratos (congelados)

- `PUT /api/almoxarifado/requisicoes/:id/entregar` — sem campo novo. Nova recusa (RN-267.11) reusa a frase da 218 (`fraseLivreDoLote`, gesto
  `entrega`) com o conselho de hoje. O livro do só lote com guarda: N SAÍDAS com `localizacao_origem_id` (antes 1 sem).
- `requisitionService.memoLotesComPecaPresa(db)` → a função devolvida aceita `(materialId, loteId, { mesmoSemPeca })`; sem a opção, igual a hoje.
- Função nova interna `fatiasDoSoLote(db, materialId, loteId, quantidade, saiu, fica)` → `[{ localizacao_id, quantidade }]` ou `null` (como hoje).
- Tela: nenhuma rota nova; `RequisicoesList.js` ganha `relerJanelaNaRecusa(modal)` e a expressão `recusaPorSeparadoDeOutras(msg)` (exportada
  para o teste).

## Tasks (sort topológico)

- [x] **T1 (tronco, motor)** — (hash no commit do T1; 13/13; sabotagens: desvio da passada 1 → 5 caem; `mesmoSemPeca` → 3; o pulo "sem guarda"
  → 3; a conferência das prateleiras → 3; o desconto do estrito → 1; o do só lote anterior → 1) — RN-267.10..16: `requisitionService.js` (a conferência do lote na passada da 218 para o só lote; `fatiasDoSoLote` na
  passada 1). Testes: `server/tests/api/entregaSoLoteRespeitaSeparado.api.test.js` (rota + serviço + corrida). Atualizar o RN-200.07 de
  `entregaSaiDeRespeitaSeparado.api.test.js` (ele registrava o C471: *"so lote: tira de XB-01 sem olhar a guarda"*). Controle positivo: tirar o
  desvio da passada 1 (RN-267.10/15 caem: sai de XB-01); tirar o `mesmoSemPeca` (RN-267.11 cai: 200).
- [x] **T2 (galho, tela; independente do T1 — contrato de mensagens já existente)** — `cb16239e` (8/8; sabotagens: a chamada da separação → 3
  caem, a da entrega → 1, "não mexeu" → 1, `doAlmoxarife` → 1, a expressão → 1, a sugestão nova → 3) — RN-267.01..04: `RequisicoesList.js` +
  `client/src/components/almoxarifado/RequisicoesSaiDeReleNaRecusa.test.js`. Controle positivo: tirar a chamada na recusa da separação e da entrega;
  tirar a condição do "não mexeu" (o trocado à mão é reescolhido); trocar a expressão (a recusa do lote não relê).
- [ ] **T3** — Fase 5; documentos (`fechar-etapa`), suítes, estimativa.

## Fase 2 (revisor fresco, uma passada, sobre o plano `9574960b`)

- **(1) importante, absorvido** — conferência passa e baixa não cobre: o "como hoje" da RN-267.13 levava a guarda de outra requisição (o C471 de
  volta) com a parte que fica do próprio item (troca 0), com prateleira bloqueada ou linha sem endereço. → RN-267.13 reescrita: a conferência lê a
  mesma conta da baixa e recusa antes (frase nova). Testes `[RN-267.13]`, `[RN-267.13 parte que fica]`, `[RN-267.13 ja pedido]`, `[RN-267.13 dois so
  lote]` (os dois últimos vieram do controle positivo: sem eles, tirar o desconto do estrito e o do só lote anterior não derrubava nada).
- **(2) importante, absorvido** — a baixa dividida em pedaços pela reserva: cada pedaço lê o livre de novo; com a conferência garantindo o total,
  o "como hoje" na baixa fica só como defesa (inalcançável no que foi medido).
- **(3) importante, absorvido** — a expressão da tela deixava de fora a recusa física *"O saldo em X (2) não cobre a quantidade (4)"* (a da Fase 0)
  e o singular *"já separada dele"*. → B1631: a régua é *"não cobre a quantidade"*, que toda frase de saldo tem.
- **(4) menor, absorvido** — a releitura com a sequência da abertura descartaria uma carga ainda em curso → sequência própria (`releituraSeqRef`).
- **menores registrados:** o exemplo do rótulo na RN-267.01 (*"sobra 2 de 6"* é o do cenário de 6 na prateleira); saldo negativo permitido — a
  conferência vale (dito na RN-267.13); a troca do próprio item "só pelo lote" continua sem endereço no registro (RN-252.03, intencional); o item com
  planejada recusado na própria planejada não é decidido de novo (regra da 65 — a lista relida mostra a sobra).
- T1 e T2 independentes: confirmado (T2 lê frases que já existiam).

## Pontos de atenção

- A conferência e a baixa rodam sob as duas travas da entrega (requisição → material); nada novo pega trava. `lotesParaOAutomatico` é lido na
  passada 1 depois da passada 0 (leitura fresca), como o automático lê na 2.
- A parte que **fica** do próprio item conta no livre por prateleira (`guardaQueConta`, como o automático) e **não** conta na conferência do lote
  (a 218 exclui a do próprio item — B1446); com a parte que fica = parte − troca, a conferência e a baixa não se contradizem no caso medido.
- Na tela, a pré-seleção roda num efeito que depende de `sugestaoSeparacao`, `preSelecao`, `origensSeparacao` e `saldosEntrega`: a releitura
  aplica os quatro de uma vez (depois das duas leituras) para o efeito decidir com a lista nova.
- Testes antigos do só lote podem mudar de prateleira esperada — conferir caso a caso que a expectativa antiga era a do C471.
