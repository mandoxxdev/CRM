# Etapa 91 — a inversão inspeção × Aprovar (C131, feature 07 com a 09, a 08 e a 04)

> Status: **Fase 2 — plano revisto (0 bloqueantes, 6 importantes, 10 menores; ver a seção "Fase 2 — revisão do plano"
> no fim, que vale sobre o texto), nada de código commitado.** Próximo passo: **T0**. HEAD de partida: `5197b418`
> (main, árvore limpa); plano da Fase 1 em `14855ab7`.
> Origem: "Próxima tarefa detalhada — Etapa 91" de
> `docs/superpowers/plans/2026-10-02-almoxarifado-etapa77-reserva-requisicao-so-pela-requisicao.md:711-755`, o aviso
> **C131** (`docs/almoxarifado-novidades-por-etapa.md:7049`) e a **B403** (`:5512`, que deixou a C131 "para depois" na 76).
>
> **Numeração:** desde a unificação de 2026-10-07 a numeração de etapas é **uma só** para todos os módulos; as Etapas
> 78 a 90 foram do lote de Compras/núcleo (`docs/compras-novidades-por-etapa.md`, B18). Por isso esta é a **91**, não a
> 78. As letras do documento do almoxarifado continuam a **sequência dele**: última **B418**, última **C141**, última
> **A41** (Etapa 77) — esta etapa usa **B419–B428**, **C142–C144** e **A42**.

**Escopo desta etapa:**
1. **C131 — a fila não se inverte mais quando uma aprovação cai no meio de uma liberação** (Opção A, B419). Uma trava
   por material começa **antes** do movimento do motor que põe saldo no disponível e só termina **depois** da
   distribuição, nas três portas que liberam (nota, inspeção, não conformidade que aceita); e as três portas que
   aprovam (`/aprovar`, `/aprovar-valor`, aprovação automática) seguram a trava de **todos** os materiais da requisição
   em volta de `prepararPosAprovacao` **e** do `UPDATE` guardado.
2. **C142 (novo) — a janela ENTRADA_COMPRA → QUARENTENA do material crítico** fecha com a mesma trava da nota: uma
   aprovação no meio não reserva mais o material que está indo para a inspeção (disponível −4).
3. **C141 — o cancelamento pelos outros módulos** (`PUT /api/requisicoes-material/:id/cancelar`) passa a soltar as
   reservas pela `reservationService.liberarReservasDaRequisicao`, como o cancelamento do almoxarifado.
4. **D(77) — `reserva_id` em movimento que não é saída** é recusado pelo motor com literal (exceto os lançamentos
   internos `RESERVA`/`LIBERACAO_RESERVA`).

**Fora (declarado, ver "O que fica de fora"):** C139 (reserva manual alheia — decisão de regra sem dado de uso, B412);
o salto **sequencial** da fila (entrada avulsa + aprovação depois — B397/C135/D(74), não é corrida); a saída avulsa, a
reserva manual e a separação **dentro** da janela (não pegam a trava); mais de um processo (C132); cancelar requisição
já reservada pelos outros módulos.

**Toque no cliente:** nenhum (respostas inalteradas). **Toque em Compras:** nenhum. **Motor (`stockService`):** só a
T4 (D(77)); as tasks da Opção A **não mudam uma linha** de `stockService.js` (medido por `git diff --stat` em cada uma).

## Fase 0 — medido (2026-10-08)

Relatório completo: `e91-fase0.md` no scratchpad da sessão; sondas `sonda91-lib.js` (harness real + usuário **por
requisição** + instrumentação), `sonda91-c131.js` (três portas × quatro modos), `sonda91-extras.js` (janela da
QUARENTENA, C141, D(77)), `sonda91-b-fila.js` (o estado que a Opção B mudaria). Perfis reais conferidos por log: o
serviço recebeu `QUALIDADE` na inspeção/NC, `GESTOR` no `/aprovar`, `ALMOXARIFE` na nota.

### 1. A inversão, pelas rotas — sistemática

Cenário: R1 (mais antiga) `AGUARDANDO_ESTOQUE` precisa de 4; R3 (mais nova) `PENDENTE` pede 4; chegam/liberam 4.
Fila certa: R1=4, R3=0. Invertida: R1=0, R3=4 (`TOTALMENTE_RESERVADA`).

| porta (liberação) | concorrente, liberação 1º | concorrente, aprovação 1º | janela (aprovação disparada quando o movimento do motor resolve) | controle (aprovação depois) |
|---|---|---|---|---|
| inspeção aprova 4 (`DECISAO_INSPECAO`) | **INVERTIDA 8/8** | **INVERTIDA 8/8** | **INVERTIDA 8/8** | certa 8/8 |
| NC `ACEITAR` (`DESBLOQUEIO`) | **INVERTIDA 8/8** | **INVERTIDA 8/8** | **INVERTIDA 8/8** | certa 8/8 |
| nota não crítica (`ENTRADA_COMPRA`) | **INVERTIDA 8/8** | **INVERTIDA 8/8** | **INVERTIDA 8/8** | certa 8/8 |

Nada se perde (material `q=4 r=4`): vai para a requisição errada. Ordem medida na inspeção: `MOTOR.DECISAO_INSPECAO →
APROVAR.criarReserva → INSPECAO.entra distribuição → sai reservas=0` — a distribuição nem chega à trava: o teto
(`min(qtd, disponível)`) é lido **fora** dela (`reservaChegadaService.js:428-433`) e dá 0.

### 2. A janela ENTRADA_COMPRA → QUARENTENA (achado novo — vira **C142**)

`darEntradaEstoque` faz dois movimentos para o item crítico: `ENTRADA_COMPRA` (`receiptService.js:1397` — o físico sobe
e fica **livre**) e depois `QUARENTENA` (`:1538` — soma em `quantidade_em_inspecao` **sem guarda de disponível**,
`stockService.js:1446-1451`). Uma aprovação no meio reservou 4 do material que ia para a inspeção em 2/8, 1/12 e 1/16
rodadas (intermitente, ~10%): material `q=4 r=4 i=4`, **disponível −4**; se a Qualidade depois **reprova** os 4, R3
fica `TOTALMENTE_RESERVADA` com 4 "reservados" de material **reprovado**. Controle (aprovação depois): R3=0, disp. 0.

### 3. As seis portas e a trava

`comLockDoMaterial` (`reservaChegadaService.js:221-235`) é privado do módulo, FIFO por promessa e **não reentrante**
(pegar o mesmo material de dentro trava para sempre — `sonda76r-reentrante.js`). Pegam a trava hoje:
`distribuirParaQuemEspera` (`:296`) e `recalcularStatusSobTrava` (`:255`, vários materiais, `DISTINCT`, crescente —
chamado por `recalcularTocadas` no `finally` das duas distribuições, por `recalcularRequisicoesDasReservas` (rota de
liberar `extended.js:958` e job `reservationService.js:195`) e pelo estorno `stockService.js:2930`). **Nenhuma porta de
aprovação pega.**

- **Liberação 1 — nota:** `processarNota` (`receiptService.js:1676`) e o ramo direto de `aprovarRecebimento` (`:1749`;
  também `avancarWorkflow` `:971` delega para `processarNota`) → `concluirProcessamentoNota` (`:1700`) /
  `concluirAprovacaoDireta` (`:1770`) → `darEntradaEstoque` (`:1253`) → `ENTRADA_COMPRA` (`:1397`, livre aqui) e, se
  crítico, `QUARENTENA` (`:1538`) → conta a pagar, `UPDATE` PROCESSADO, auditoria, `fecharSolicitacoesDoPedido` →
  `reservarChegadaSemFalhar` (`:84`) → `rcs.reservarChegadaParaQuemEspera` → trava → `finally recalcularTocadas` →
  aviso (`avisarEntradaConfirmadaSemFalhar`).
- **Liberação 2 — inspeção:** `POST /recebimentos/itens/:itemId/inspecionar` (`extended.js:1069`, `inspecionar`) →
  `decidirInspecao` (`inspectionService.js:182`) → claim do item (`:254`) → `DECISAO_INSPECAO` (`:273`, livre aqui) →
  `INSERT inspecoes`, medidas, alerta de reprovado, `abrirNaoConformidadeDeInspecao` → `rcs.aposLiberacaoSemFalhar`
  (`:374`) → teto **fora** da trava → `distribuirParaQuemEspera` → `finally recalcularTocadas` → `avisarLiberacao`.
- **Liberação 3 — NC que aceita:** `POST /nao-conformidades/:id/decidir` (`extended.js:1171`) →
  `decidirNaoConformidade` (`nonConformityService.js:887`) → `efeitoPrevisto` → claim da NC (`:923`) →
  `executarLiberacao` (`:933`/`:989`) → claim da inspeção → `stockService.registrarMovimentacao(DESBLOQUEIO)` (`:1013`,
  livre aqui) → auditoria → `aposLiberacaoSemFalhar` (`:968`) → a mesma cadeia da inspeção.
- **Aprovação 4 — `/aprovar`** (`routes/almoxarifado.js:3437`): `exigirSemPendenciaAberta` →
  `requisitionService.prepararPosAprovacao` (`:3491`) → `UPDATE` guardado (`:3497-3499`) → perdeu: `desfazerReservas`
  (`:3504`).
- **Aprovação 5 — `/aprovar-valor`** (`:3577`): `aprovarValor` grava `APROVADO` → `prepararPosAprovacao` (`:3599`) →
  `UPDATE … AND status='APROVADO'` → perdeu: `desfazerReservas` (`:3608`).
- **Aprovação 6 — `tentarAprovacaoAutomatica`** (`:3273`; de `POST /requisicoes` `:3340` e `/enviar` `:3418`):
  `prepararPosAprovacao` (`:3292`) → `UPDATE` (`:3300`) → perdeu ou falhou: `desfazerReservas` (`:3305`/`:3309`).

**O que trava se embrulhado como está:** a porta de liberação embrulhada do motor até `aposLiberacaoSemFalhar` /
`reservarChegadaParaQuemEspera` trava **duas vezes** (a distribuição pega o mesmo material de novo; o `recalcularTocadas`
pega os materiais da requisição tocada, possivelmente menores que o segurado). A aprovação embrulhada
(`prepararPosAprovacao` + `UPDATE` + `desfazerReservas`) é **segura**: `criarReserva`, `liberarReserva` e
`registrarMovimentacao` nunca pegam a trava. O miolo da nota (de `darEntradaEstoque` a `fecharSolicitacoesDoPedido`) é
seguro: `purchaseService` não requer o `rcs` e a compensação de `darEntradaEstoque` é `dbRun`, não estorno.

### 4. Opções medidas (a decisão está na B419–B421)

- **(A)** trava antes do movimento do motor até a distribuição (liberação) **e** em volta de `prepararPosAprovacao` +
  `UPDATE` (aprovação). As **duas metades** são necessárias: só a liberação deixa o aprovador sem trava ler o saldo livre;
  só a aprovação é a medição da B403 (6/6 ainda invertida). Fecha também a janela da QUARENTENA (contra quem pega a
  trava). Motor: 0 linhas.
- **(B)** só a aprovação, consciente da fila (reserva `min(falta, disponível − Σ falta de quem está à frente)`): ~40–60
  linhas, um seam só — **mas muda uma regra que vale sem corrida** (`sonda91-b-fila.js`: R1 espera 4, uma `ENTRADA` ou
  `DEVOLUCAO` avulsa de 4 entra (não distribui, D(74)), o GESTOR aprova R3 → **hoje R3 leva 4**; em B, R3 ficaria com 0 e
  os 4 **parados**, porque nada os entrega a R1 — B397/C135) e **não fecha** a janela da QUARENTENA.
- **(C)** deixar para o Postgres (B403): `FOR UPDATE` não resolve sozinho — a inversão é **entre** comandos (o movimento
  do motor, depois a distribuição). O Postgres exige a mesma reestruturação (transação do movimento até a distribuição
  com `SELECT … FOR UPDATE` / advisory lock no começo, e a aprovação pegando as mesmas linhas). É a Opção A com outra
  primitiva; adiar deixa C131 e a QUARENTENA abertas até a migração.

### 5. Candidatas menores (medidas)

- **C141:** `PUT /api/requisicoes-material/:id/cancelar` pelo solicitante: de `APROVADO` → 200, `CANCELADO`, reserva
  **ainda `ATIVA` 4** (r=4, disponível 0); de `PENDENTE` → o mesmo (no fluxo real essa janela se cura: o `UPDATE`
  perdedor da aprovação desfaz as próprias reservas); de `TOTALMENTE_RESERVADA`/`PARCIALMENTE_RESERVADA` → 400 *"não pode
  ser cancelada"* (limitação de contrato, fica de fora).
- **D(77):** pela v2 com o `reserva_id` de uma reserva de requisição: `ENTRADA` 201, `AJUSTE` 201, `DEVOLUCAO` 201 — o
  livro grava a coluna e a reserva fica intocada (`ATIVA 4-0`). `TRANSFERENCIA` deu 400 só por falta de origem/destino
  (não medida com eles); `BLOQUEIO` não é aceito pela v2.

### 6. Releitura do código — o que a Fase 0 disse e não confere (registrado, não escondido)

1. **"12 arquivos fazem monkeypatch de `reservarLiberacaoParaQuemEspera`, `reservarChegadaParaQuemEspera`,
   `aposLiberacaoSemFalhar`, `recalcularStatusSobTrava`, `prepararPosAprovacao`, `criarReserva`" — a contagem bate, a
   lista não.** Medido (`grep -nE "\.(nome)\s*=[^=]" tests/api/*.js`): **ninguém** faz monkeypatch de
   `reservarLiberacaoParaQuemEspera` nem de `aposLiberacaoSemFalhar` (são **chamadas** direto em testes de serviço —
   `inspecaoReservaLiberacao:406-420`, `inspecaoReservaLiberacaoAviso:215,259`). Os nomes realmente trocados são:
   `stockService.criarReserva` (7 arquivos), `reservaChegadaService.reservarChegadaParaQuemEspera`
   (`recebimentoReservaChegada:380,490`), `rcs.recalcularStatusSobTrava` (4), `rcs.recalcularRequisicoesDasReservas` (2),
   `requisitionService.prepararPosAprovacao` (`requisicaoPosAprovacaoPortas:152`),
   `receiptNotificationService.avisarLiberacao` (`inspecaoReservaLiberacaoAviso`) e
   `stockService.registrarMovimentacao` (`naoConformidadeLiberacao`, `naoConformidadeLiberacaoRotas` — o rollback da NC,
   que agora roda **dentro** da trava). A lista de costuras da T2 usa a lista medida.
2. **"Conferir o INSERT do estorno em `:2047`" (D(77))** — `:2044-2058` é o `INSERT` do próprio `registrarMovimentacao`,
   não do estorno. O estorno grava o livro em `stockService.js:2740` **sem** a coluna `reserva_id` e não passa pelo
   `registrarMovimentacao` — não há o que isentar ali.
3. **"Recusar no motor cobre a v1 `/movimentacoes`"** — a v1 (`routes/almoxarifado.js:1004-1006`) desestrutura o body
   **sem** `reserva_id` e só aceita ENTRADA/SAIDA/AJUSTE/DEVOLUCAO: nunca carrega a coluna. O motor cobre a **v2**, a
   **`/transferencias`** (repassa o body cru, `extended.js:873-874`) e todo chamador de serviço futuro.
4. **"A opção A fecha a janela da QUARENTENA"** — só contra **quem pega a trava** (as portas de aprovação e a
   distribuição). Uma `SAIDA` avulsa pela v2 **sem** `reserva_id`, uma reserva **manual** (`POST /reservas`) ou uma
   separação no meio da janela continuam levando o saldo livre (não pegam a trava). Declarado (letra D (91)); o conserto
   de raiz — o item crítico **entrar retido** num movimento só — muda o motor e fica como candidata.
5. **A janela da QUARENTENA é intermitente (~10%) na sonda** — não serve como vermelho reprodutível. A T2 usa o
   **portão limitado** (abaixo), que segura a continuação da nota depois do `ENTRADA_COMPRA` até a aprovação responder:
   sem a trava, inverte 100%; com a trava, a aprovação espera e o portão abre pelo tempo.
6. **NC: o material só é conhecido depois do Passo 1** (`efeitoPrevisto`), então a seção crítica da NC começa no claim
   da NC (Passo 2), e só quando `previsto.efeito === 'LIBERAVEL'` — não "no começo da porta".
7. **Confirmado (não é dúvida):** nenhuma rota troca o `material_id` de um item de requisição depois de criado (`grep
   "SET material_id"` em `services`/`routes` → 0), então ler os materiais da requisição **antes** de pegar a trava é
   estável; e nenhuma porta de liberação chama outra porta (o `abrirNaoConformidadeDeInspecao` só abre, não decide — sem
   reentrada na trava da inspeção).

## Decisões reversíveis (letra B do documento de novidades; última usada: B418)

- **D1 (B419) — Opção A: a trava vai do movimento do motor até a distribuição nas três portas que liberam, e em volta
  de `prepararPosAprovacao` + `UPDATE` guardado (+ o `desfazerReservas` de quem perde) nas três que aprovam.** A nota
  pega a trava de **todos** os materiais dela (`DISTINCT`, crescente) — inclusive os críticos, o que fecha a janela da
  QUARENTENA (C142); a inspeção, a do material do item; a NC, a do material da inspeção. A aprovação pega a de **todos**
  os materiais da requisição. O `UPDATE` guardado fica **dentro**: sem ele, "aprovação primeiro, R3 ainda `PENDENTE`
  durante a distribuição" deixaria a sobra parada (R3 não é candidata) — um C135 por corrida. **Substitui a B403.**
- **D2 (B420) — descartada a Opção B (aprovação consciente da fila).** Muda uma regra que vale sem corrida
  (`sonda91-b-fila`: hoje R3 leva os 4 que entraram avulsos; em B ficariam parados — B397/C135), e não fecha a janela da
  QUARENTENA. Reabrir a B397 ("a aprovação distribui para quem espera à frente") desfaria o gesto da liberação.
- **D3 (B421) — descartada a Opção C (Postgres).** A trava de linha sozinha não conserta (cada comando já é atômico; a
  inversão é entre comandos). O trabalho estrutural de A (onde a seção começa e termina, o que sai dela, a ordem
  crescente) é o mesmo no Postgres — só `comLockDosMateriais` vira `SELECT … FOR UPDATE ORDER BY id` /
  `pg_advisory_xact_lock`. Adiar não economiza nada e deixa C131 e C142 abertas.
- **D4 (B422) — a trava sai para um módulo sem dependências, `services/almoxarifado/travaPorMaterial.js`, com UM `Map`
  só.** O `rcs` passa a usá-lo (a fila da 75/76 e a das portas são **a mesma**). Descartado: exportar `comLockDoMaterial`
  do `rcs` — o `requisitionService` precisaria dele e `rcs → requisitionService` já existe no topo (ciclo; requires
  preguiçosos espalhados). Descartado também: um `Map` por módulo (as portas não esperariam o recálculo da 76).
- **D5 (B423) — o recálculo da 76 e o aviso da 75 saem da seção crítica: rodam DEPOIS de soltar a trava.** A trava não é
  reentrante, e o recálculo pega os materiais da requisição tocada — possivelmente menores que o segurado (quebraria a
  ordem crescente). Ordem dos efeitos preservada: distribuição → recálculo → aviso. Descartado: recálculo dentro sem
  trava própria (a sonda76f mostrou o `UPDATE` atrasado gravando status velho).
- **D6 (B424) — as seções ficam longas e a ordem dos efeitos não muda.** A da inspeção cobre o `INSERT`, as medidas, o
  alerta de reprovado e a abertura da NC; a da nota cobre a conta a pagar, o `UPDATE`, a auditoria e
  `fecharSolicitacoesDoPedido`. Só operações do **mesmo material** esperam. Descartado: reordenar (alerta/NC/conta
  depois da distribuição) para encurtar — muda ordem de efeito colateral que os testes da 17/43/70 prendem.
- **D7 (B425) — os nomes exportados continuam sendo a porta; o "já sob a trava" é uma opção, não um nome novo.**
  `reservarChegadaParaQuemEspera`, `reservarLiberacaoParaQuemEspera` e `aposLiberacaoSemFalhar` ganham `opcoes = {
  sobTrava, pendencia }`; as portas chamam **os mesmos nomes pelo objeto do módulo** e, depois de soltar a trava,
  `rcs.concluirPendencia`. Sem opção, cada uma pega a trava sozinha como hoje (e o teto passa a ser lido **sob** a trava
  também nesse caminho). Descartado: funções novas `distribuirChegadaSobTrava`/`distribuirLiberacaoSobTrava` chamadas
  pelas portas — os monkeypatches dos testes deixariam de morder **em silêncio** (a armadilha do teste vazio).
- **D8 (B426) — C141: a rota dos outros módulos vira `async`, mantém o `UPDATE` guardado e os status aceitos
  (`PENDENTE`, `APROVADO`), e depois solta as reservas por `liberarReservasDaRequisicao` + auditoria `CANCELAMENTO`, as
  duas best-effort** (molde de `routes/almoxarifado.js:3983-4021`). Resposta e literal de recusa inalteradas.
  Descartado: aceitar cancelar requisição já reservada por lá (muda o contrato da outra porta — fica de fora).
- **D9 (B427) — D(77): a recusa mora no motor e vale para qualquer origem de reserva.** `reserva_id` num tipo que não é
  saída → 400, exceto `RESERVA`/`LIBERACAO_RESERVA` (os lançamentos internos de `criarReserva`/`liberarReserva`, que a
  v2 nem aceita — `TIPOS_RETENCAO`). Descartados: só na v2 (a `/transferencias` repassa o body cru); só para reserva de
  requisição (uma `ENTRADA` citando reserva **manual** também é coluna mentirosa no livro).
- **D10 (B428) — C139 fica de fora.** O código seria pequeno (~15 linhas + a tela), mas muda o que PRODUCAO/ENGENHARIA
  fazem hoje sem dado de uso (B412). Continua candidata.

## Regras de negócio

Os testes levam o prefixo `[91 RN-xx]` no nome; o manual cita o mesmo ID.

- **RN-01 (inspeção × aprovação — a fila não inverte)** — material crítico com 4 retidos de uma nota; R1 (criada antes)
  `AGUARDANDO_ESTOQUE` pede 4; R3 (depois) `PENDENTE` pede 4. A QUALIDADE aprova os 4
  (`POST /recebimentos/itens/:id/inspecionar`) e o GESTOR aprova R3 (`PUT /requisicoes/:id/aprovar`) **ao mesmo tempo**,
  nos três encaixes: (a) concorrente com a inspeção disparada primeiro; (b) concorrente com a aprovação primeiro; (c)
  aprovação disparada no instante em que o `DECISAO_INSPECAO` do motor resolve (portão limitado). Em **todas** as
  rodadas: as duas respostas de sucesso (201 e 200), R1 com hold 4 e `TOTALMENTE_RESERVADA`, R3 com hold 0 e
  `AGUARDANDO_ESTOQUE`, material `q=4 r=4 i=0`; a inspeção gravada com `responsavel_id` = a QUALIDADE e R3 com
  `aprovador_id` = o GESTOR (prova de usuário por requisição).
- **RN-02 (NC que aceita × aprovação)** — o mesmo com os 4 **reprovados** na inspeção (NC aberta) e a QUALIDADE decidindo
  `ACEITAR` (`POST /nao-conformidades/:id/decidir`) contra o `/aprovar` de R3, nos três encaixes (c = no `DESBLOQUEIO`).
  Mesmo resultado: R1=4 `TOTALMENTE_RESERVADA`, R3=0 `AGUARDANDO_ESTOQUE`, material `q=4 r=4 b=0`.
- **RN-03 (nota × aprovação)** — material **não** crítico; o ALMOXARIFE processa a nota de 4
  (`POST /recebimentos/:id/processar`) contra o `/aprovar` de R3, nos três encaixes (c = no `ENTRADA_COMPRA`). R1=4,
  R3=0, material `q=4 r=4`.
- **RN-04 (a janela da QUARENTENA — C142)** — material **crítico**, ninguém esperando; R3 `PENDENTE` pede 4. O
  ALMOXARIFE processa a nota de 4 e o GESTOR aprova R3 no instante entre o `ENTRADA_COMPRA` e a `QUARENTENA` (portão
  limitado depois da sincronização do físico). R3 com hold 0 e `AGUARDANDO_ESTOQUE`; material `q=4 r=0 i=4`, disponível
  **0, nunca negativo**. Depois a QUALIDADE **reprova** os 4: R3 continua 0, material `b=4`, disponível 0.
- **RN-05 (as três portas de aprovação esperam a trava, e leem o saldo DENTRO dela)** — pelo serviço da trava: o teste
  segura `travaPorMaterial.comLockDoMaterial(m)` e dispara a porta; (a) `/aprovar`, (b) `/aprovar-valor` (R em
  `AGUARDANDO_APROVACAO_VALOR`, aprovador de valor real), (c) `POST /requisicoes` com aprovação automática ligada, (d)
  `/enviar` de um rascunho com aprovação automática — cada uma **não responde** enquanto a trava está presa (150 ms) e,
  com 4 postos no material **enquanto** presa e a trava solta, responde com a reserva de 4 (`TOTALMENTE_RESERVADA`).
  (e) Requisição com dois materiais `{m1, m2}`, trava presa só em `m2` → também espera. (f) O `UPDATE` guardado fica
  dentro: a aprovação de R3 (sem saldo) é pausada **na emissão do próprio `UPDATE requisicoes_almoxarifado SET
  status=?, aprovador_id…`** — o `db.run` embrulhado retém o comando e só o emite por `portao.then(() => origRun(sql,
  params, cb))` (técnica de `reservaRecalculoRevisaoFase5.api.test.js:110-118`), portão limitado; pausar no retorno de
  `prepararPosAprovacao` não serve, porque esse ponto fica sob a trava com ou sem o `UPDATE` dentro (corrigido na Fase 2,
  achado 9) — e a inspeção de 4 é disparada nesse instante → a inspeção espera, R3 já está `AGUARDANDO_ESTOQUE` quando ela distribui, e R3 leva
  4 (sem R1 na fila). (g) Aprovação perdedora (dois `/aprovar` do mesmo R ao mesmo tempo) → um 200, um 400 com a
  mensagem de hoje, **uma** reserva só, nenhuma trava sobrando.
- **RN-06 (sem corrida, nada muda — inclusive o que está declarado)** — (a) aprovação **depois** de a liberação
  responder, nas três portas → R1=4, R3=0 (hoje também). (b) *Declarado, não desejado (B397/D(74)):* R1 espera 4; uma
  `ENTRADA` avulsa de 4 pela v2 (não distribui); o GESTOR aprova R3 depois → **R3 leva os 4** (200
  `TOTALMENTE_RESERVADA`) — o teste prende que a etapa **não** mudou a regra; mudar é decisão (Opção B, B420).
- **RN-07 (sem deadlock: a trava não reentra, a ordem é crescente, a exceção solta)** — cada chamada embrulhada num
  prazo de 5 s (`comPrazo`, que **falha** o teste em vez de pendurar). (a) Nota com dois itens do **mesmo** material →
  responde. (b) Requisição com dois itens do mesmo material aprovada → responde. (c) Nota `{A, B}` processada ao mesmo
  tempo que a aprovação de uma requisição `{B, A}` e uma inspeção em `A` → as três respondem. *(corrigido na Fase 2,
  achado 10)* A rodada monta **a intercalação que trava quando a ordem não é crescente**: a inspeção segura `A` primeiro
  (portão limitado no `DECISAO_INSPECAO`); a nota pede `A` e espera; a aprovação pega `B` e então pede `A`. Com a ordem
  crescente a aprovação pede `A` antes de `B` e ninguém fica em ciclo. (d) Depois de cada
  cenário, `travaPorMaterial.travado(m) === false` para todo material tocado (aqui vale: ninguém mais espera no fim do
  cenário). (e) Uma exceção **dentro** da seção
  (inspeção do mesmo item duas vezes → 400 *"Item já foi decidido por outra inspeção"*; nota com item inválido → 400 de
  `darEntradaEstoque`; NC com o motor patcheado para falhar → 500 com rollback) solta a trava: o próximo `/aprovar` do
  material responde.
- **RN-08 (o recálculo e o aviso rodam depois de soltar a trava)** — na inspeção (RN-01) e na nota (RN-03), o espião em
  `rcs.recalcularStatusSobTrava` é chamado para R1 **depois de a seção da própria porta ter terminado** — prova por
  marcador: um espião na `fn` passada a `trava.comLockDoMaterial`/`comLockDosMateriais` pela porta grava "seção saiu"
  quando ela resolve, e o recálculo tem de ver o marcador já gravado. Alternativa aceita: rodar a RN-08 **sem ninguém
  esperando** a trava, e só então afirmar `travado(m) === false`. *(corrigido na Fase 2, achado 7: `travado(m)` é `true`
  enquanto alguém **espera**, então sob concorrência daria falso vermelho)*. R1 termina `TOTALMENTE_RESERVADA` (o recálculo da 76 rodou); na inspeção, o espião em
  `receiptNotificationService.avisarLiberacao` recebe o resultado com a reserva de R1 **e** o `status` já recalculado.
- **RN-09 (contratos que não mudam e costuras que continuam mordendo)** — os corpos de resposta de `/aprovar`,
  `/aprovar-valor`, `POST /requisicoes`, `/enviar`, `/inspecionar`, `/nao-conformidades/:id/decidir`,
  `/recebimentos/:id/processar` e `/recebimentos/:id/aprovar` têm **as mesmas chaves** de hoje (`deepStrictEqual` de
  `Object.keys`). Os 12 arquivos que fazem monkeypatch (§6.1) ficam verdes **sem edição**, e cada costura tem controle
  na T2 (s-costura).
- **RN-10 (C141 — o cancelamento pelos outros módulos solta as reservas)** — requisição criada por
  `POST /api/requisicoes-material` (solicitante S, sem perfil), em `APROVADO` com reserva `ATIVA` de 4 (montada pelo
  serviço — §5: estado de janela/falha) → S faz `PUT /api/requisicoes-material/:id/cancelar` → **200 `{ success: true }`**,
  `CANCELADO`, reserva `LIBERADA`, material `r=0`, uma `LIBERACAO_RESERVA` com motivo `'Liberação por cancelamento de
  requisição'`, uma linha de auditoria `CANCELAMENTO` com `dados_anteriores.status = 'APROVADO'`. (b) De `PENDENTE` com
  reserva → o mesmo. (c) Outro usuário (não S) → **400** *"Requisição não encontrada ou não pode ser cancelada"*
  (inalterado), reserva `ATIVA`. (d) `TOTALMENTE_RESERVADA` → o mesmo 400 (declarado). (e)
  *(corrigido na Fase 2, achado 1)* Dois casos: (e1) `stockService.liberarReserva` patcheado para falhar → **200**,
  `CANCELADO`, reserva **ainda `ATIVA`**, o warn de hoje do serviço (`[almoxarifado-reservas] Falha ao liberar
  reserva …`) **e** o warn **L2b** da rota (porque `erros.length > 0`); (e2)
  `reservationService.liberarReservasDaRequisicao` patcheado para **lançar** → **200**, `CANCELADO`, warn **L2**. O
  texto anterior (só e1, esperando L2) era impossível: `liberarReservasDaRequisicao` engole a falha de cada reserva e
  devolve `{ liberadas, erros }` (`reservationService.js:225-246`) — nem L2 nem 500 aconteceriam.
- **RN-11 (D(77) — `reserva_id` só numa saída)** — pela v2 (ALMOXARIFE) com o `reserva_id` de uma reserva de
  requisição: `ENTRADA`, `AJUSTE`, `DEVOLUCAO` → **400 com a literal M1**; nada mudou (sem linha nova no livro do
  material, saldo igual, reserva `ATIVA` intocada). Com uma reserva **manual** → o mesmo 400. Pela `/transferencias`
  com origem e destino válidos + `reserva_id` → 400 M1. Pelo serviço: `registrarMovimentacao({ tipo: 'ENTRADA',
  reserva_id })` → 400 M1. *Metade positiva:* `criarReserva` e `liberarReserva` continuam gravando `RESERVA` e
  `LIBERACAO_RESERVA` **com** `reserva_id` no livro; a saída com reserva manual pela v2 continua consumindo (201) e a
  com reserva de requisição continua com a M1 da 77. *Precedência:* tipo inválido, material inexistente e material
  inativo continuam com as mensagens de hoje (a checagem vem depois deles).

## Contrato (congelado)

### Literais

- **M1** (motor, 400, D(77)): `` `reserva_id só vale numa saída que consome a reserva — o tipo ${tipo} não consome reserva; tire o reserva_id do movimento` ``
  Pela v2/`/transferencias` sai `{ error: M1 }` (o `handleError` de hoje).
- **L1** (`travaPorMaterial`/`rcs`, erro lançado quando a variante `sobTrava` roda sem a trava — defesa, engolido pelo
  `*SemFalhar` de quem chama): `` `distribuicao sob trava chamada sem a trava do material ${materialId}` ``. Aparece no log
  dentro das literais de hoje (*"[recebimento] reserva na chegada falhou (recebimento X): L1"*, *"[almoxarifado-reservas]
  reserva na liberacao falhou (INSPECAO X): L1"*).
- **L2** (C141, `console.warn`, a chamada **lançou**): `` `[requisicoes-material] liberacao das reservas no cancelamento falhou (requisicao ${id}): ${e.message}` ``
- **L2b** (C141, `console.warn`, a chamada **voltou com `erros.length > 0`** — corrigido na Fase 2, achado 1): `` `[requisicoes-material] liberacao das reservas no cancelamento deixou ${erros.length} reserva(s) presa(s) (requisicao ${id}): ${erros.map((x) => `${x.id}: ${x.erro}`).join('; ')}` ``
- **L3** (C141, `console.warn`): `` `[requisicoes-material] auditoria do cancelamento falhou (requisicao ${id}): ${e.message}` ``
- Nenhuma literal **de resposta** muda na Opção A (as rotas respondem igual — RN-09).

### Módulo novo — `server/services/almoxarifado/travaPorMaterial.js` (T0)

Sem nenhum `require`. Cabeçalho: **PREMISSA (C132)** — o app é **um** processo Node com **uma** conexão SQLite; a
trava é um `Map` em memória. Com mais de um processo (cluster, dois servidores) ou no Postgres, vira
`SELECT … FROM materiais_almoxarifado WHERE id = ANY(…) ORDER BY id FOR UPDATE` (ou `pg_advisory_xact_lock(material_id)`
em ordem crescente) dentro da transação que vai do movimento do motor até a distribuição — e a aprovação pega as mesmas
linhas antes de ler o disponível.

```
comLockDoMaterial(materialId, fn) -> Promise<retorno de fn>
  // FIFO por Number(materialId); NÃO reentrante (pegar de novo o mesmo material dentro de fn trava para sempre);
  // solta no finally (exceção de fn solta e relança). Corpo = o de hoje (reservaChegadaService.js:221-235).
comLockDosMateriais(materialIds, fn) -> Promise<retorno de fn>
  // Number(), descarta não finitos, DISTINCT, ordem CRESCENTE, aninha comLockDoMaterial; lista vazia -> fn() direto.
travado(materialId) -> boolean   // true enquanto alguém segura OU espera a trava do material (introspecção: testes e a guarda L1)
```

### `reservaChegadaService` (T0) — usa o módulo, mesmo `Map`

- Remove `filaPorMaterial`/`comLockDoMaterial` locais; `const trava = require('./travaPorMaterial')` no topo.
  `distribuirParaQuemEspera` → `trava.comLockDoMaterial`; `recalcularStatusSobTrava` → `trava.comLockDosMateriais`
  (comportamento igual: `DISTINCT`, crescente).
- **Novas exportadas:**
  ```
  novaPendencia() -> { distribuicoes: [], avisos: [] }
  concluirPendencia(db, user, pendencia) -> Promise<void>   // NUNCA lança
    // 1) para cada { acc, rotulos } em distribuicoes: recalcularTocadas(db, acc, rotulos)
    //    (que chama module.exports.recalcularStatusSobTrava — pega a trava de novo, por isso só DEPOIS de soltar);
    // 2) para cada { ctx, resultado } em avisos: receiptNotificationService.avisarLiberacao(db, user, ctx, resultado)
    //    com o try/console.warn e a literal de hoje (aposLiberacaoSemFalhar, "aviso da liberacao falhou (...)").
  ```
- **`reservarChegadaParaQuemEspera(db, user, recebimentoId, opcoes = {})`**
  - sem `opcoes.sobTrava`: **resultado inalterado** — pega a trava dos materiais livres da nota (`comLockDosMateriais`),
    distribui com `distribuirSemLock`, e no `finally` `concluirPendencia` de uma pendência própria (o recálculo continua
    acontecendo mesmo se a distribuição lançar, como hoje). Devolve `{ reservas, status }`.
  - com `opcoes.sobTrava` (quem chama **já segura** a trava de todos os materiais da nota): para cada material, se
    `!trava.travado(m)` lança **L1**; senão `distribuirSemLock`; registra `{ acc, rotulos }` em `opcoes.pendencia`;
    **não recalcula**. Devolve o mesmo objeto `resultado` (o `status` é preenchido depois, pelo `concluirPendencia`).
- **`reservarLiberacaoParaQuemEspera(db, user, ctx, resultado = {…}, opcoes = {})`**
  - sem `sobTrava`: pega a trava do material, **lê o teto (`min(quantidade, disponível)`) DENTRO dela** (era fora,
    `:428-433` — achado da Fase 0) e distribui; `finally` recalcula. Retorno inalterado.
  - com `sobTrava`: L1 se `!travado`; lê o teto; `distribuirSemLock`; registra em `opcoes.pendencia`; não recalcula.
- **`aposLiberacaoSemFalhar(db, user, ctx, opcoes = {})`**
  - sem `sobTrava`: inalterado (distribuição + aviso).
  - com `sobTrava`: chama `module.exports.reservarLiberacaoParaQuemEspera(db, user, ctx, resultado, opcoes)` com o
    try/warn de hoje e, **em vez de avisar**, empilha `{ ctx, resultado }` em `opcoes.pendencia.avisos`. Nunca lança.

### `requisitionService` (T1)

```
comTravaDaRequisicao(db, requisicaoId, fn) -> Promise<retorno de fn>
  // SELECT DISTINCT material_id FROM itens_requisicao_almoxarifado WHERE requisicao_id = ? AND material_id IS NOT NULL
  //   ORDER BY material_id  ->  travaPorMaterial.comLockDosMateriais(mats, fn)
```
`travaPorMaterial` requerido no topo (sem ciclo: o módulo não requer nada).

### As três portas de aprovação (T1, `routes/almoxarifado.js`)

Dentro de `requisitionService.comTravaDaRequisicao(db, id, async () => { … })`, **chamando pelo objeto do módulo**:
- **`/aprovar`:** `requisitionService.prepararPosAprovacao` → `UPDATE` guardado → perdeu: `requisitionService.desfazerReservas`
  e lê `atual`/`mensagemGateAtual`; devolve `{ venceu, statusFinal, reservas, erro400 }`. **Fora** da trava:
  auditoria e `res.json` (corpo inalterado). `exigirSemPendenciaAberta` continua **antes** (fora).
- **`/aprovar-valor`:** `aprovarValor` continua **fora** (grava `APROVADO`; nessa janela R já é candidata — inofensivo,
  `prepararPosAprovacao` desconta o hold existente). Dentro: releitura de `reqRow`, `prepararPosAprovacao`, o `UPDATE …
  AND status='APROVADO'`, o `desfazerReservas` de quem perde e a releitura do status. Fora: auditoria e resposta.
- **`tentarAprovacaoAutomatica`:** dentro: `prepararPosAprovacao` (com o try/warn de hoje), o `UPDATE` (try/warn), o
  `desfazerReservas` nas duas perdas. Retorno inalterado. *(corrigido na Fase 2, achado 2)* O `SELECT` de materiais e a
  espera da trava de `comTravaDaRequisicao` também ficam **dentro de um try**: falha ali → `return null` (a requisição
  fica `PENDENTE`, 201), mantendo a regra da Etapa 73 Fase 5 ("falha vira PENDENTE 201",
  `routes/almoxarifado.js:3290-3311`) — nunca um 500 para requisição já criada.

### As três portas de liberação (T2)

- **Inspeção** (`inspectionService.decidirInspecao`): validações, `resolverMedidas` e o cálculo das flags **fora**
  (antes); `const pend = rcs.novaPendencia()`; `trava.comLockDoMaterial(item.material_id, async () => { claim do item
  → DECISAO_INSPECAO (com a compensação de hoje) → INSERT → medidas → alerta → NC → se aprovada > 0:
  rcs.aposLiberacaoSemFalhar(db, user, ctx, { sobTrava: true, pendencia: pend }) → return <corpo de hoje> })` e, num
  `finally` em volta, `await rcs.concluirPendencia(db, user, pend)`. *(corrigido na Fase 2, achado 15 — vale para as
  três portas de liberação)* A forma é literalmente `try { return await trava.comLockDoMaterial(m, async () => { … }) }
  finally { await rcs.concluirPendencia(db, user, pend) }` (na nota, `comLockDosMateriais(mats, …)`): o `finally` fica
  **fora** da função passada à trava. Um `finally` **dentro** da `fn` roda com a trava presa e, se a distribuição tocou
  alguma requisição, o recálculo pede a mesma trava → deadlock. O `require('./reservaChegadaService')` continua
  preguiçoso (com o try de carga de hoje); `travaPorMaterial` no topo.
- **NC** (`nonConformityService.decidirNaoConformidade`): quando `previsto.efeito === 'LIBERAVEL'`, a seção começa no
  claim da NC (Passo 2) e vai até `aposLiberacaoSemFalhar(…, { sobTrava, pendencia })`, com a auditoria dentro;
  `concluirPendencia` no `finally`; `obterNaoConformidade` e o `return` fora. Os outros efeitos (sem liberação) seguem
  sem trava. `executarLiberacao` continua chamando `stockService.registrarMovimentacao` **pela propriedade** (costura do
  rollback).
- **Nota** (`receiptService.concluirProcessamentoNota` e `concluirAprovacaoDireta`): `mats = SELECT DISTINCT material_id
  FROM recebimentos_material_itens_almoxarifado WHERE recebimento_id = ? AND material_id IS NOT NULL ORDER BY
  material_id` (todos os itens — superconjunto inofensivo); `trava.comLockDosMateriais(mats, async () => {
  darEntradaEstoque → (conta a pagar, UPDATE, auditoria) → fecharSolicitacoesDoPedido → reservarChegadaSemFalhar(db,
  user, id, pend) → return <corpo> })`; `finally concluirPendencia`; **depois**, `avisarEntradaConfirmadaSemFalhar` e o
  `return` (só no sucesso, como hoje). `reservarChegadaSemFalhar` passa a chamar
  `reservaChegadaService.reservarChegadaParaQuemEspera(db, user, recebimentoId, { sobTrava: true, pendencia })` — **o
  mesmo nome, pelo objeto** (costura da 74). O 409 de `aindaDonoDoProcessamento` sai de dentro da seção (o `finally`
  da trava solta).

**Invariante de ordem (comentário em `travaPorMaterial.js` e nos três pontos):** toda aquisição de vários materiais
passa por `comLockDosMateriais` (crescente); nada pega trava segurando outra fora dessa função; recálculo e aviso
rodam fora. **Proibido** chamar, de dentro de uma seção: `recalcularStatusSobTrava`, `recalcularRequisicoesDasReservas`,
`cancelarMovimentacao`, as variantes **sem** `sobTrava`, ou outra porta.

**Nota para o comentário de cabeçalho da T2** *(acrescentado na Fase 2, achado 16)*: (i) qualquer monkeypatch futuro
que encaminhe `(db, user, id)` **sem** o `opcoes` para o original faz a porta cair na variante sem `sobTrava`, que pede a
trava de novo de dentro da seção → reentrada (deadlock). Hoje nenhum dos 12 arquivos de §6.1 faz isso (os patches de
`reservarChegadaParaQuemEspera` em `recebimentoReservaChegada.api.test.js:380,490` substituem a função inteira, sem
encaminhar). (ii) a guarda L1 (`travado(m)`) é **defesa, não prova**: `travado(m)` é `true` também quando **outro**
segura ou espera a trava, então uma chamada `sobTrava` sem a trava pode passar pela guarda sob concorrência.

### Motor — `stockService.registrarMovimentacao` (T4, D(77))

Logo depois de `const consumindoReserva = …` (`:1021`), antes do bloco da C136 e de qualquer escrita (tipo, material e
ativo já foram validados acima):
```
if (reserva_id != null && reserva_id !== '' && !tiposSaida.includes(tipo)
    && !['RESERVA', 'LIBERACAO_RESERVA'].includes(tipo)) throw 400 M1;
```
Comentário: `RESERVA`/`LIBERACAO_RESERVA` são os lançamentos internos (`:3008`, `:3079`) e a v2 não os aceita
(`TIPOS_RETENCAO`); o estorno não passa por aqui e não grava a coluna (`:2740`).

### Rota — `PUT /api/requisicoes-material/:id/cancelar` (T5, `routes/requisicoesMaterial.js:338-358`)

`async`. (1) `antes = SELECT status, numero FROM requisicoes_almoxarifado WHERE id = ? AND solicitante_id = ?` (só para
a trilha); (2) o `UPDATE` guardado **de hoje, sem mudar uma vírgula** (`WHERE id=? AND solicitante_id=? AND status IN
('PENDENTE','APROVADO')`); `changes === 0` → 400 de hoje; (3) `try { const { erros } = await
reservationService.liberarReservasDaRequisicao(db, req.user, id, 'Requisição cancelada'); if (erros.length > 0) warn
L2b } catch → warn L2` (corrigido na Fase 2, achado 1: a função engole a falha por reserva — `reservationService.js:225-246`); (4) `try {
await registrarAuditoria(db, { entidade: 'requisicao', entidade_id: Number(id), acao: 'CANCELAMENTO', usuario_id,
usuario_nome, dados_anteriores: { status: antes?.status }, dados_novos: { status: 'CANCELADO', numero: antes?.numero, via:
'requisicoes-material' }, justificativa: null }) } catch → warn L3`; (5) `res.json({ success: true })`. Requires novos no
topo: `reservationService`, `{ registrarAuditoria }` de `services/almoxarifado/audit` (sem ciclo: `requisitionService` já
é requerido ali). O arquivo é varrido pelo `saldoEmTerceiros` — nada de reescrever a conta do disponível.

### O que não muda (contratos que não se reabrem)

A distribuição (candidatas, ordem `compararPrioridade`, pulos por valor e por dono, falta relida, desfazer excesso);
o teto de cada porta; o recálculo da 76 (e as duas portas dele); a recusa da C136 (marca `requisicaoDaEntrega`); quem
libera (77); as respostas de todas as rotas tocadas (B387, B399); o motor na Opção A.

## Técnica dos testes de corrida (vale para T1, T2 e T3)

1. **Usuário por requisição** (técnica da `sonda91-lib.js`): um middleware que faz `setUser(USERS[header
   'x-teste-usuario'])` é inserido em `app._router.stack` **logo depois do `jsonParser`** — roda no mesmo tick síncrono
   em que o `fakeAuth` de cada rota copia o usuário. **Cada rodada afirma o perfil que agiu** (`inspecoes.responsavel_id`,
   `requisicoes.aprovador_id`, `nao_conformidades.decidido_por_id`) — sem isso, duas requisições concorrentes poderiam
   rodar com o mesmo usuário e a "fila certa" sair de um 403 (controle G85: tirar o middleware → as asserções de perfil
   caem).
2. **Gatilho no SQL:** `db.run/get/all` embrulhados para reconhecer o comando que põe saldo no disponível — o
   `UPDATE … quantidade_em_inspecao = COALESCE(quantidade_em_inspecao,0) - ?` (inspeção), o `… quantidade_bloqueada =
   COALESCE(quantidade_bloqueada,0) - ?` (NC), o `SET quantidade_atual = ?, updated_at` da sincronização do físico
   (nota/QUARENTENA) — e, quando ele **resolve**, disparar a aprovação (uma vez por rodada).
3. **Portão limitado** (novo nesta etapa — §6.5): o callback do comando marcado só é entregue a quem o chamou depois
   que a aprovação disparada **responder** ou **400 ms**, o que vier primeiro. Sem a trava nova, a aprovação roda inteira
   com a liberação parada no portão → inversão **determinística**; com a trava, a aprovação espera a trava, o portão
   abre pelo tempo, a liberação termina e a aprovação lê disponível 0. **O portão nunca espera sem prazo** (com a trava,
   esperar a aprovação sem prazo seria deadlock do próprio teste). *(corrigido na Fase 2, achado 11)* Cada rodada
   afirma que o gatilho disparou **exatamente uma vez** (contador), e, na versão consertada, que o portão abriu **pelo
   tempo** (registro `abriuPor: 'prazo'` vs `'aprovacao'`) — é isso que prova que a aprovação esperou a trava; um portão
   que abriu porque a aprovação respondeu, na versão consertada, é rodada sem valor. O regex do gatilho tolera espaço e
   quebra de linha: a sincronização do físico é `SET\n      quantidade_atual = ?` (`stockService.js:151-152`) — usar
   `/SET\s+quantidade_atual\s*=\s*\?/`, e o mesmo `\s+`/`\s*` nos outros dois.
4. **Modos por porta:** `conc-lib1` e `conc-apr1` (`Promise.all`, como a sonda) e `janela` (gatilho + portão); N=4
   rodadas por modo, material novo por rodada. Tudo restaurado no `finally` (`db.*`, middleware desligado por header
   ausente, monkeypatches).
5. **`comPrazo(promessa, 5000, rotulo)`** em toda chamada que pode travar: estoura → `assert.fail("<rotulo> não
   respondeu em 5 s — trava presa?")`. Um deadlock vira vermelho legível, não um processo pendurado.

## Tasks

**Ordem topológica: T0 → T1 → T2 → T3 → T4 → T5 → T6 → T7.** Todas na árvore principal, **uma por vez**: todas sabotam
produção nos controles positivos e a suíte bate no mesmo SQLite de teste (G84; memória "sabotagem concorrente contamina
a suíte"). Sabotagem por `perl -0pi` com âncora contada = 1, backup `e91-<task>-*.bak` no scratchpad, restauro por
cópia com md5 conferido, um controle de cada vez (base **LF** — nunca `\r\n`; `python3` indisponível no Git Bash).
Scratchpad com nome único (`msg-e91-t0.txt`…). Executores **não** marcam este plano; o fio principal marca.

- [x] **T0 — FEITA em `8a72c801` (2026-10-08).** `travaPorMaterial.js` + `rcs` refatorado; teste `travaPorMaterial` 8
  casos (vermelho antes: 6/8). Controles s1–s6 caíram como previsto (s1 derrubou também (5)(7)(7b)). 22 arquivos medidos
  antes/depois sem edição (os que fazem monkeypatch são **18**, não 12 — o plano contou baixo). `distribuirParaQuemEspera`
  removida (sem chamador); a distribuição da nota sem opções trava todos os materiais livres da nota de uma vez. test:api
  314/314, almoxarifado 44/0.
  Enunciado original: **T0 (tronco) — o módulo da trava e as variantes "já sob a trava".** Cria `travaPorMaterial.js`; o `rcs` passa a
  usá-lo (um `Map` só); `novaPendencia`/`concluirPendencia`; as opções `sobTrava`/`pendencia` nos três nomes; o teto da
  liberação lido sob a trava no caminho sem opção. **Nenhuma porta muda** nesta task. Teste novo
  `server/tests/api/travaPorMaterial.api.test.js`: (1) FIFO por material, materiais diferentes não esperam; (2)
  `comLockDosMateriais([900003,900001,900003])` pega 900001 e 900003 uma vez cada (ids trocados na Fase 2), em ordem crescente (registro da ordem); lista vazia chama
  `fn`; (3) exceção em `fn` solta e relança; `travado` volta a `false`; (4) **mesmo `Map`:** o teste segura
  `travaPorMaterial.comLockDoMaterial(m)` e chama `rcs.recalcularStatusSobTrava(R)` e `rcs.reservarLiberacaoParaQuemEspera`
  (sem opção) → **não resolvem** em 150 ms; resolvem depois de soltar; (5) **teto sob a trava:** segura `m` com
  disponível 0, chama `reservarLiberacaoParaQuemEspera` (sem opção, quantidade 4), põe 4 no material **enquanto** segura
  e solta → reserva 4 para R1 (hoje: 0 — **vermelho antes**). *(corrigido na Fase 2, achado 14)* O teste só põe os 4
  **depois** de a chamada ter chegado ao ponto em que leria o teto: espera o primeiro destes dois marcadores — o
  `SELECT` do disponível do material resolvido (espião em `db.get`, caminho do s2) **ou** a chamada enfileirada na trava
  (espião em `trava.comLockDoMaterial`, caminho consertado). Sem isso, no s2 o teto pode ser lido **depois** de o teste
  pôr os 4 e o controle passaria por tempo. (6) `sobTrava` **sem** a trava → o `rcs` chamado direto lança L1. A metade
  "`reservarChegadaSemFalhar` engole e loga L1" **sai da T0 e vai para a T2** (corrigido na Fase 2, achado 5): na T0
  nenhuma porta muda, e `reservarChegadaSemFalhar` só passa `sobTrava` a partir da T2; (7) `sobTrava` **com** a trava: `reservas` iguais às do caminho sem
  opção num cenário espelho, `status` vazio até `concluirPendencia`, preenchido depois; `concluirPendencia` com o
  recálculo patcheado para lançar → não lança, warn com a literal `falhaRecalculo` de hoje.
  **Medir antes e depois, sem edição:** os 12 arquivos de §6.1, `reservaLiberacaoBase` (carga fria nas duas ordens —
  agora com o módulo novo), `reservaRecalculo*`, `inspecaoReservaLiberacao*`, `recebimentoReservaChegada*`,
  `ncReservaLiberacao`, `test:almoxarifado`.
  **Controles positivos (e por que cada um consegue cair — G85):** (s1) `rcs` volta a ter `Map` próprio → **cai (4)**
  (o recálculo não espera a trava do teste). (s2) teto lido antes de pegar a trava (o código de hoje) → **cai (5)** com 0.
  (s3) `comLockDosMateriais` sem `DISTINCT` → **cai (2)** por prazo (o 3 é pego duas vezes; `comPrazo`). *(corrigido na
  Fase 2, achado 14)* O s3 deixa o material pendurado **para sempre** no `Map` compartilhado do processo; por isso (2) usa
  ids que nenhum outro caso toca (`900001`, `900003` em vez de `1`, `3`). (s4) sem o
  `soltar()` no caminho de exceção → **cai (3)**. (s5) a guarda L1 removida → **cai (6)** (distribui sem trava; (6) roda com o material **sem ninguém** segurando ou
  esperando — ver a nota do cabeçalho da T2 sobre `travado`). (s6)
  `concluirPendencia` sem o try por requisição → **cai (7)** (lança).
- [x] **T1 — FEITA em `78933bef` (2026-10-08).** `comTravaDaRequisicao` + as três portas; teste `aprovacaoEsperaTrava` 9
  casos (vermelho antes: 8/9). Controles s1–s6 caíram; **o plano errou o s1**: (g) também cai — achado novo: sem a trava,
  dois `/aprovar` simultâneos da mesma requisição com estoque terminavam **8/8 em `AGUARDANDO_ESTOQUE` sem reserva**
  (quem reservou perdia o UPDATE com guarda para quem recalculou e desfazia a própria reserva — `sonda91-t1-g.js`); com a
  trava, 8/8 `TOTALMENTE_RESERVADA`. Vai para a letra das novidades no fechamento. Falha da trava na aprovação automática
  reusa o log existente ("Falha ao aprovar automaticamente…; fica PENDENTE"). test:api 315/315, almoxarifado 44/0,
  validation 4/0, safealter 3/0, sqlite 5/0.
  Enunciado original: **T1 (tronco) — as três portas de aprovação seguram a trava de todos os materiais.** `comTravaDaRequisicao` + as
  três portas (contrato acima). Teste novo `server/tests/api/aprovacaoEsperaTrava.api.test.js`: **RN-05 (a)–(g)** pelas
  rotas, com perfis reais (GESTOR, aprovador de valor, solicitante sem perfil), e RN-09 para as quatro rotas de
  aprovação. **Vermelho antes:** (a)–(e) respondem com a trava presa (medido na Fase 0: nenhuma porta pega a trava) e
  leem disponível 0 → `AGUARDANDO_ESTOQUE`; (f) R3 fica 0 com 4 parados.
  **Medir antes e depois, sem edição:** `requisicaoPosAprovacaoPortas`, `requisicaoPosAprovacaoFalhas`,
  `requisicaoReservaAutomatica`, `integracaoAprovacoesRegra`, `requisicaoCriacao`, `requisicaoUrgencia`,
  `reservaRecalculoIntegracao`.
  **Controles positivos:** (s1) `/aprovar` sem a trava → **cai (a)** e (g) continua verde (o `UPDATE` guardado é que
  serializa dois `/aprovar`). (s2) idem `/aprovar-valor` → só (b). (s3) idem automática → (c) e (d). (s4) trava só do
  **primeiro** material → **cai (e)**. (s5) `UPDATE` guardado fora da trava → **cai (f)** — só porque (f) segura a **emissão** do `UPDATE` (ver RN-05 (f),
  corrigido na Fase 2, achado 9); com a pausa no retorno de `prepararPosAprovacao` o s5 não cairia. (s6) a porta
  chamando uma cópia local de `prepararPosAprovacao` → **cai** `requisicaoPosAprovacaoPortas` (o patch da `:152` deixa
  de morder) — costura. *(corrigido na Fase 2, achado 12)* O patch da `:152` só passa por `/aprovar-valor`
  (`requisicaoPosAprovacaoPortas.api.test.js:150-159`, `aprovarValor(id)`); o s6 aplicado em `/aprovar` ou na aprovação
  automática **não** cairia nesse arquivo. Por isso o teste novo da T1 acrescenta dois casos que patcheiam
  `requisitionService.prepararPosAprovacao` pelo objeto e afirmam que o patch **mordeu** — um por `/aprovar`, um por
  `POST /requisicoes` com aprovação automática — e o s6 é aplicado e medido nas três portas, uma de cada vez.
  *Nota:* com só a T1, a C131 **continua invertida** (é a medição da B403); a RN-01–04 é da T2.
- [x] **T2 — FEITA em `e472f26c` (2026-10-08).** Vermelho antes (com a T1 feita), 4 rodadas por modo: inspeção, NC e
  nota **INVERTIDA 4/4** em conc-lib1, conc-apr1 e janela (janela abriu pela resposta da aprovação, nunca por prazo);
  RN-04: R3 reservou o retido 4/4, disponível −4. Controles s1–s7, s-ordem e as costuras c1–c4 caíram (as quatro
  costuras morderam). Divergências: o gatilho da nota é o crédito físico (`SET quantidade_atual = quantidade_atual + ?`),
  o regex do plano disparava 0/8; conc-apr1 também invertia com a T1; s4 caiu em todos os modos; s5 não derruba RN-07(b)
  (aprovação não chama `concluirPendencia`); **um teste fora da lista mudou**: `recebimentoProcessamentoConcorrente`
  ("DONO: processamento longo perde a marca vencida") travava — o gancho esperava B processar a mesma nota de dentro da
  entrada de A, que agora segura a trava; em produção só custa tempo (a retomada de marca vencida espera a trava e A
  perde a marca com 409 como antes); o gancho passou a esperar só B pegar a marca, asserções iguais, 11/11. 29 arquivos
  medidos antes/depois sem edição. test:api 316/316, almoxarifado 44/0, validation 4/0, safealter 3/0, sqlite 5/0.
  Enunciado original: **T2 (tronco) — as três portas de liberação seguram a trava do movimento até a distribuição.** Inspeção, NC e as
  duas conclusões da nota (contrato acima). Teste novo `server/tests/api/filaLiberacaoAprovacaoCorrida.api.test.js`:
  **RN-01, RN-02, RN-03, RN-04, RN-06, RN-07, RN-08** e RN-09 para as rotas de liberação, mais o caso que saiu da T0
  (Fase 2, achado 5): `reservarChegadaSemFalhar` com `sobTrava` **sem** a trava (material sem ninguém segurando ou
  esperando) → engole e loga L1 dentro da literal de hoje. **Escrito e rodado ANTES da
  implementação, com a T1 já feita** → vermelho medido em cada porta e modo. *(corrigido na Fase 2, achado 6)* **Não prever** o resultado por modo: a
  Fase 0 mediu 8/8 **sem** a T1; com a T1 já feita a aprovação pega a trava, e em `conc-apr1` ela pode terminar antes de
  a liberação mexer no saldo (R3 já `AGUARDANDO_ESTOQUE` quando a distribuição roda → fila certa por ordem de chegada).
  Registrar o número medido de cada porta × modo; o vermelho obrigatório é o modo `janela` (portão) e a RN-04 com o
  portão. RN-07 e RN-06 verdes já — controle de que o teste não é vermelho por outra razão.
  **Medir antes e depois, sem edição:** os 12 de §6.1, `naoConformidadeLiberacao`, `naoConformidadeLiberacaoRotas`,
  `inspecaoReservaLiberacaoIntegracao`, `recebimentoReservaChegadaIntegracao`, `recebimentoAvisoEntrada*`,
  `alertaEventoGanchos`, `test:almoxarifado`; `git diff --stat -- server/services/almoxarifado/stockService.js` **vazio**.
  **Controles positivos:** (s1) inspeção sem a trava (volta a chamar `aposLiberacaoSemFalhar` sem opção depois de sair
  da seção) → **cai só RN-01**. (s2) NC sem a trava → **só RN-02**. (s3) nota sem a trava → **RN-03 e RN-04**. (s4)
  `/aprovar` sem a trava da T1 (as liberações com) → **caem RN-01–RN-04** no modo `janela`: prova das **duas metades**
  (a liberação parada no portão segura a trava, mas a aprovação não pede). (s5) `concluirPendencia` chamado **dentro** da
  seção → **cai RN-07** por prazo (a trava não reentra) e RN-08. *(corrigido na Fase 2, achado 13)* Em RN-07 (a)/(b) o
  s5 só cai se a distribuição **tocou** alguma requisição (sem tocada o recálculo não pede trava): (a) e (b) montam uma
  requisição **esperando** o material. (s6) a nota trava só os materiais **livres** (sem os
  críticos) → **cai só RN-04**. (s7) o middleware de usuário desligado → **caem as asserções de perfil** de RN-01–03.
  **Costuras (s-costura), uma a uma:** (c1) `reservarChegadaSemFalhar` chamando uma função interna em vez de
  `reservaChegadaService.reservarChegadaParaQuemEspera` → caem os casos *"banco caiu 74"* e o do patch vazio de
  `recebimentoReservaChegada`; (c2) `concluirPendencia` chamando o `recalcularStatusSobTrava` local → cai
  `reservaRecalculoRevisaoFase5 (b)`; (c3) `concluirPendencia` com `avisarLiberacao` desestruturado → cai
  `inspecaoReservaLiberacaoAviso`; (c4) a NC com `registrarMovimentacao` desestruturado → cai o rollback de
  `naoConformidadeLiberacao`. Costura que **não** cair é achado (o patch já não mordia antes) — registrar, não esconder.
  *Declarado redundante (não é controle):* a ordem crescente em `comLockDosMateriais` quando **todos** os chamadores
  passam por ela (qualquer ordem consistente não trava); o controle (s-ordem) "sem ordenar" é **medido** em RN-07 (c) —
  se não cair 3/3, vira declarado redundante com o número medido. *(corrigido na Fase 2, achado 10)* Tirar o `sort` de
  `comLockDosMateriais` **não** consegue cair: os dois chamadores já entregam a lista ordenada pelo SQL (`ORDER BY
  material_id` em `comTravaDaRequisicao` e no `SELECT` da nota; o recálculo em `reservaChegadaService.js:257`). O
  (s-ordem) passa a ser: **um** chamador invertido explicitamente (a aprovação com `ORDER BY material_id DESC` **e** sem
  o `sort` em `comLockDosMateriais`) com a intercalação de RN-07 (c) (inspeção segura `A`, nota espera `A`, aprovação
  pega `B` e espera `A`) → cai por prazo.
- [x] **T3 — FEITA em `22e79982` (2026-10-08).** `filaTravaIntegracao` 6 casos: jornada com material crítico (R3 aprovada
  na janela da QUARENTENA, R4 na da DECISAO_INSPECAO → R1 `TOTALMENTE_RESERVADA`, aviso e e-mail "reservado", separada,
  conferida, entregue, reserva `CONSUMIDA`) + dois pares serviço × rota. Verde de primeira (escrito depois da T2) —
  controles: s1 da T2 → jornada 4/5 e serviço 6; s3 da T2 → jornada 3/4/5 e serviço 7; s1 da T1 → jornada 3/4/5 e serviço
  6 (mais largo que o previsto: o `/aprovar` é a aprovação das duas janelas). R3 criada por `/api/requisicoes-material`
  com setor Comercial (setor industrial recusa material sem família). test:api 317/317, almoxarifado 44/0.
  Enunciado original: **T3 — integração das duas metades, pela ROTA e pelo SERVIÇO (A × 74 × 75 × 76).** Teste novo
  `server/tests/api/filaTravaIntegracao.api.test.js`, perfis reais, técnica de corrida acima:
  **Jornada pela rota:** material crítico M. S1 (PRODUCAO) cria R1 (4 M) pela rota; GESTOR aprova → `AGUARDANDO_ESTOQUE`.
  S3 (sem perfil) cria R3 (4 M) por `POST /api/requisicoes-material` → `PENDENTE`. ALMOXARIFE processa a nota de 4 com o
  GESTOR aprovando R3 **na janela da QUARENTENA** → R3 0 `AGUARDANDO_ESTOQUE`, M `q4 r0 i4`. S4 cria R4 pela rota
  (`PENDENTE`). QUALIDADE aprova os 4 com o GESTOR aprovando R4 **na janela do `DECISAO_INSPECAO`** → R1 4
  `TOTALMENTE_RESERVADA` (recálculo da 76), R3 0, R4 0; o aviso da liberação (espião) diz "reservado" para R1.
  ALMOXARIFE separa R1, **outra pessoa do almoxarifado faz a segunda conferência** (M é crítico: sem ela a entrega dá
  400 de `assertConferidaSeObrigatorio`, `requisitionService.js:299`, chamado em `:945` — corrigido na Fase 2, achado 4)
  e o ALMOXARIFE entrega R1 pela rota → `ENTREGUE`, a reserva `CONSUMIDA` (a marca da 77 compõe).
  **Pelo serviço:** `inspectionService.decidirInspecao` (serviço, QUALIDADE) ∥ `PUT /aprovar` (rota) e
  `receiptService.processarNota` (serviço) ∥ `POST /requisicoes` com aprovação automática (rota) → fila certa: prova que
  a trava das portas de serviço e a das rotas é **o mesmo `Map`** atravessando módulos.
  **Controles:** (s1) da T2 (inspeção sem trava) → cai a etapa R4 da jornada e o par de serviço da inspeção; (s3) da T2
  → cai a etapa da QUARENTENA e o par da nota; (s1) da T1 → cai a etapa R4.
- [x] **T4 — FEITA em `d24715c9`.** `reservaIdSoEmSaida` 11 casos (vermelho antes 6/11: v2 ENTRADA/AJUSTE/DEVOLUCAO,
  manual e `/transferencias` davam 201). Controles s1–s5 caíram (s2 sem a isenção de `RESERVA` derruba 51 arquivos; s3
  sem a de `LIBERACAO_RESERVA`, 16). São **23** arquivos que passam `reserva_id`, não 22. test:api 318/318.
  Enunciado original: **T4 (tronco — muda o motor) — D(77): `reserva_id` só numa saída.** Contrato do motor acima. Teste novo
  `server/tests/api/reservaIdSoEmSaida.api.test.js`: **RN-11** inteira, pela v2, pela `/transferencias` e pelo serviço.
  **Medir antes (o impacto da recusa) e depois, sem edição:** todos os testes que passam `reserva_id`
  (`grep -ln reserva_id tests/api/*.js` → 22 arquivos hoje; os de §2 da 77 + os da 74–77) e `test:almoxarifado`; e
  `grep -rn "reserva_id" server/services server/routes` para achar chamador de serviço que mande `reserva_id` em tipo
  não-saída (esperado: só `:3008`/`:3079`).
  **Controles:** (s1) sem a recusa → **caem** os 400 de RN-11 (201, como na Fase 0). (s2) sem a isenção de `RESERVA` →
  **cai a metade positiva** (`criarReserva` lança) **e** caem dezenas de testes de fora (toda reserva) — é o controle de
  que a isenção é necessária. (s3) sem a isenção de `LIBERACAO_RESERVA` → cai a metade positiva da liberação. (s4) a
  recusa só para reserva de **requisição** → cai o caso da reserva manual. (s5) a checagem **antes** da validação de tipo →
  cai a precedência (tipo inválido com `reserva_id` daria M1).
- [x] **T5 — FEITA em `6eedb920`.** `requisicaoCancelarOutrosModulosReserva` 6 casos (vermelho antes 4/6: reserva ficava
  `ATIVA`). Controles s1, s2, s2b, s3, s4 caíram. L3 (falha da auditoria) implementado mas **sem teste** — a rota pega
  `registrarAuditoria` por desestruturação (contrato), o teste não consegue trocá-la. test:api 319/319.
  Enunciado original: **T5 (galho por regra; executado em sequência por causa do SQLite) — C141.** Contrato da rota acima. Teste novo
  `server/tests/api/requisicaoCancelarOutrosModulosReserva.api.test.js`: **RN-10 (a)–(e)**. **Vermelho antes:** (a) e (b)
  (reserva continua `ATIVA` — medido na Fase 0) e a auditoria ausente.
  **Medir antes e depois:** os 10 arquivos que usam `/api/requisicoes-material` (`grep -ln requisicoes-material
  tests/api/*.js`), `saldoEmTerceiros` (varre este arquivo).
  **Controles:** (s1) sem a chamada de `liberarReservasDaRequisicao` → **cai (a)/(b)**. (s2) a liberação sem try (a falha
  vira 500) → **cai (e2)** — o teste patcheia a própria `liberarReservasDaRequisicao` para lançar (corrigido na Fase 2,
  achado 1: patchear `liberarReserva` nunca chega ao try da rota). (s2b) sem o ramo `erros.length > 0` → **cai (e1)**
  (o warn L2b some). (s3) o `UPDATE` sem `solicitante_id` → **cai (c)**. (s4) sem a auditoria → cai a asserção da
  trilha em (a).
- [x] **T6 — FEITA em `c53703c4`.** Jornada C (ENTRADA citando a reserva da liberação → 400 M1, nada muda) e jornada B
  (cancelar na janela do `concluirPendencia` → `CANCELADO`, nenhuma reserva `ATIVA`). Controles: s1 da T5 → só B; s1 da
  T4 → só C; s5 da T2 → o cancelamento passa e a nota estoura os 5 s (derruba também o "serviço 7" da T3). 3 execuções
  seguidas 8/8. test:api 319/319.
  Enunciado original: **T6 — integração cruzando os galhos: A × C141 × D(77) × 76 × 77, pela rota.** Acrescenta ao
  `filaTravaIntegracao.api.test.js`:
  **Jornada B (A × C141 × 76 × 77):** material não crítico M2 com 4 (v2 `ENTRADA`). S5 (sem perfil) cria R5 por `POST
  /api/requisicoes-material`; GESTOR aprova → `TOTALMENTE_RESERVADA`; S5 libera a própria reserva inteira
  (`POST /reservas/:id/liberar` — o dono, regra da 77) → recálculo da 76 → `APROVADO` (com saldo, sem reserva — B405);
  ALMOXARIFE dá `SAIDA` avulsa de 4 (sem `reserva_id`) → M2 com 0, R5 `APROVADO`. ALMOXARIFE processa uma nota de 4 de
  M2 e, **no instante em que `rcs.concluirPendencia` começa** (espião — a distribuição já reservou 4 para R5, a trava já
  foi solta, o recálculo ainda não rodou: R5 está `APROVADO` com hold 4), S5 cancela por `PUT
  /api/requisicoes-material/:id/cancelar` → 200; **R5 `CANCELADO` sem reserva `ATIVA`, M2 `r=0`** (sem a T5, a reserva
  ficaria presa: o recálculo não toca requisição cancelada). *(corrigido na Fase 2, achado 3)* Essa janela entre soltar
  a trava e recalcular **não é nova**: hoje o recálculo já roda no `finally` de `reservarChegadaParaQuemEspera`
  **depois** de `distribuirParaQuemEspera` ter soltado a trava (`reservaChegadaService.js:175-178`). A Opção A a
  **mantém** (D5) e a jornada B prova que a C141 a fecha para o cancelamento pelos outros módulos.
  **Jornada C (D(77) × 75):** no fim da jornada A da T3, o ALMOXARIFE manda `ENTRADA` de 2 pela v2 citando o
  `reserva_id` da reserva **da liberação da inspeção** (origem `REQUISICAO`, `recebimento_id`) → 400 M1, nada mudou.
  **Controles:** (s1) da T5 → cai a jornada B no "sem reserva ATIVA"; (s1) da T4 → cai a jornada C; (s5) da T2
  (`concluirPendencia` dentro da seção) → o cancelamento **passa** (a rota da C141 não pega a trava), o que cai é a
  **nota**, que não responde em 5 s (`comPrazo`: o recálculo pede a trava que a própria seção segura) — corrigido na
  Fase 2, achado 13.
- [ ] **T7 — fechamento (skill `fechar-etapa`).** Spec 07 (a C131 resolvida; **corrigir dizendo que estava errada** se
  algum texto afirma que "a trava por material serializa as liberações" como garantia contra a aprovação — a trava da 75
  nunca cobriu a aprovação); spec 09 (a decisão da inspeção e a NC seguram a trava do material); spec 08 (a nota segura
  a trava dos materiais dela; a janela da QUARENTENA); spec 04 (as três aprovações esperam a trava; o cancelamento pelos
  outros módulos solta a reserva); spec 03 (D(77) no motor); mapa `specs/modulo-almoxarifado/README.md`; guia do
  usuário (seção da etapa, Antes → Agora, roteiro clicável: duas abas, Qualidade aprova e Gestor aprova ao mesmo tempo);
  manual; novidades: **B419–B428** (a **B403** marcada "substituída pela B419"), **C131** e **C141** ✅ resolvidos,
  **C132** ganha a frase "desde a Etapa 91 a mesma trava segura as seis portas (três que liberam, três que aprovam)",
  **C142** (a janela da QUARENTENA — medida, resolvida contra aprovação/distribuição; o resto em D), **C143** (o que
  muda para quem opera: a aprovação de um material espera a nota/inspeção/NC do mesmo material terminar), **C144** (o que
  muda para quem integra: v2/`/transferencias` com `reserva_id` em tipo não-saída → 400 M1; o cancelamento pelos outros
  módulos solta a reserva e grava trilha), **A42**, limitações **(91)** em D; retro de 4 números e a **Próxima tarefa
  detalhada — Etapa 92**.

## Teste de integração — por que a T3/T6 é a única prova de três coisas

1. **A trava é FIAÇÃO entre módulos** (`receiptService`, `inspectionService`, `nonConformityService`, `routes`,
   `requisitionService`, `rcs`). Um `Map` por módulo passaria em todo teste de unidade de cada porta e falharia só
   quando uma porta de um módulo encontra a de outro — por isso há cenário **pela rota** (as seis portas HTTP) **e pelo
   serviço** (`decidirInspecao`/`processarNota` chamados direto contra rotas de aprovação).
2. **A Opção A mantém a janela** entre soltar a trava e recalcular (D5; ela já existe hoje,
   `reservaChegadaService.js:175-178` — "abre uma janela nova" estava errado, corrigido na Fase 2, achado 3): só a jornada B mostra que um gesto nessa
   janela (o cancelamento pelos outros módulos) não deixa reserva presa — e que isso depende da C141.
3. **As etapas 74–77 compõem com a trava:** recálculo da 76 depois da seção, aviso da 75 com o status certo, entrega com
   a marca da 77, D(77) contra a reserva nascida na liberação da 75.

## O que fica de fora (declarado — e por quê)

- **C139** (reserva manual alheia): decisão de regra sem dado de uso (B428/B412).
- **O salto sequencial da fila** (entrada/devolução/desbloqueio **avulsos** não distribuem; uma aprovação depois leva o
  saldo): B397/C135/D(74) — não é corrida; RN-06 (b) prende que nada mudou. Mudar é a Opção B (B420).
- **Saída avulsa sem `reserva_id`, reserva manual e separação dentro da janela** da nota/inspeção/NC: não pegam a
  trava (§6.4) — limitação **(91)** em D. Conserto de raiz da QUARENTENA (entrar retido num movimento só) muda o motor:
  candidata.
- **Mais de um processo** (C132): premissa escrita no código (`travaPorMaterial.js`) e na letra C.
- **Cancelar requisição já reservada pelos outros módulos** (400 de hoje): contrato da outra porta (B426).
- **O estorno da entrada × distribuição concorrente:** não medido nesta etapa; o estorno não pega a trava das portas
  (só a do recálculo). Candidata a sonda.
- *(acrescentados na Fase 2, achado 8)* **Estorno × aprovação tem a forma da C131:** `liberarParaEstorno`
  (`reservaChegadaService.js:483`, chamado em `stockService.js:2473`) solta a reserva da chegada **fora de qualquer
  trava**; uma aprovação no meio leva o saldo liberado e, se o estorno for recusado depois,
  `recriarAposEstornoRecusado` (`:547-575`) não acha disponível e só loga o warn. Limitação **(91)** em D; candidata.
- **A trava não tem prazo de aquisição:** uma porta pode esperar indefinidamente; o cliente desiste em 30 s
  (`client/src/services/api.js:39`), o servidor ainda conclui (200 "fantasma") e o reenvio do usuário dá 400 (já
  aprovada/decidida). Limitação **(91)** em D.
- **O `UPDATE` da separação para `EM_SEPARACAO` não tem guarda de status** (`requisitionService.js:862`, `:874`, `:881`
  — `WHERE id=?` [`AND conferido_por_id IS ?`]): uma separação em voo pode **ressuscitar** uma requisição que a C141 acabou
  de cancelar. A mesma corrida já existe hoje com o cancelamento do almoxarifado — não é introduzida pela etapa.
  Candidata.

## Letra A — consulta para produção (a confirmar no fechamento como **A42**)

**A42 — materiais com disponível negativo** (o rastro da C142 — e de qualquer outra corrida que tenha passado do saldo).
Somente leitura:

```sql
SELECT m.id, m.codigo, m.nome, m.material_critico,
       m.quantidade_atual, m.quantidade_reservada, m.quantidade_bloqueada,
       m.quantidade_em_inspecao, COALESCE(m.quantidade_em_terceiros, 0) AS em_terceiros
FROM materiais_almoxarifado m
WHERE COALESCE(m.permite_saldo_negativo, 0) = 0
  AND m.quantidade_atual - COALESCE(m.quantidade_reservada, 0) - COALESCE(m.quantidade_bloqueada, 0)
      - COALESCE(m.quantidade_em_inspecao, 0) - COALESCE(m.quantidade_em_terceiros, 0) < -1e-9
ORDER BY m.codigo;
```

O que fazer com o resultado: para cada material, a reserva `ATIVA` mais nova sobre ele é a candidata a ter levado o que
foi para a inspeção — conferir com a Qualidade e liberá-la pela tela Reservas (o dono ou o almoxarife, regra da 77).
*(A conta fica escrita à mão **só aqui, no documento**: o `saldoEmTerceiros` proíbe a réplica no código, não na doc.)*

## Próximo passo

**Fase 2** — revisão do plano por um agente fresco, com as quatro perguntas da skill (contratos e literais; RN × specs
07/09/08/04/03; independência real — aqui não há galho paralelo, e a T5 é galho só por regra; **cada RN seguida até o
último gesto**: p.ex. RN-01 → R1 `TOTALMENTE_RESERVADA` → a separação e a entrega de R1 pela rota ainda consomem a
reserva nascida sob a trava? → o estorno da nota depois da inspeção ainda solta a reserva da liberação (B374/B386)? ;
RN-05 (b) → a requisição liberada por valor que esperou a trava sai com o status certo e a trilha `APROVACAO_VALOR`? ;
RN-10 → a requisição cancelada pelos outros módulos some da fila de separação e o material volta ao disponível sem ir
para quem espera (C135)?) **e a quinta da G85: cada controle positivo acima consegue cair pelo caminho que o plano diz?**
— em especial (s4) da T2 (as duas metades) e as costuras c1–c4. Depois, T0. **(Fase 2 feita — ver a seção abaixo;
o próximo passo é a T0.)**

## Fase 2 — revisão do plano (2026-10-08): 0 bloqueantes, 6 importantes, 10 menores → plano revisto (vale sobre o texto acima)

Revisor fresco sobre o HEAD `14855ab7`. Cada achado foi conferido no código antes de entrar aqui; os pontos do texto
acima foram corrigidos **no lugar** (marcados "corrigido na Fase 2, achado N"). Nenhum achado ficou sem confirmação.

| # | peso | achado (conferido em) | mudança no plano |
|---|---|---|---|
| 1 | IMPORTANTE | RN-10 (e) / T5 (s2) impossíveis: `liberarReservasDaRequisicao` engole a falha por reserva e devolve `{ liberadas, erros }` (`reservationService.js:225-246`); patchear `stockService.liberarReserva` nunca dá L2 nem 500. | Literal nova **L2b** (rota loga quando `erros.length > 0`); RN-10 (e) vira (e1) `liberarReserva` falha → 200 + L2b, reserva ATIVA, e (e2) `liberarReservasDaRequisicao` lança → 200 + L2; contrato da rota passo (3); T5 (s2) patcheia a própria função, (s2b) novo. |
| 2 | menor | Na automática, o `SELECT` de materiais e a espera da trava ficariam dentro do try de `tentarAprovacaoAutomatica` (`routes/almoxarifado.js:3273-3311`) sem contrato para a falha. | Contrato: falha ali → `return null` (PENDENTE 201, regra da Etapa 73 Fase 5). |
| 3 | menor | A janela "soltar a trava → recalcular" não é nova: hoje o recálculo já roda no `finally` depois de a distribuição soltar a trava (`reservaChegadaService.js:175-178`). | Texto da T6 jornada B e do §2 de "Teste de integração" corrigidos ("mantém", não "abre"). |
| 4 | menor | Entregar material crítico exige a segunda conferência (`assertConferidaSeObrigatorio`, `requisitionService.js:299`, chamado em `:945`) — sem ela a jornada da T3 dá 400. | Passo de conferência por outra pessoa do almoxarifado na jornada A da T3. |
| 5 | menor | T0 teste (6): na T0 nenhuma porta muda, então só dá para provar o `rcs` direto lançando L1. | A metade "`reservarChegadaSemFalhar` engole e loga L1" foi para a T2. |
| 6 | menor | Prever "invertida em todos os modos" antes da T2 é errado com a T1 feita (`conc-apr1` pode sair certo por ordem de chegada). | T2 mede e registra por porta × modo; vermelho obrigatório só no `janela` e na RN-04. |
| 7 | IMPORTANTE | RN-08 falharia sob concorrência: `travado(m)` é `true` também enquanto alguém **espera** (contrato do módulo). | RN-08 prova por marcador "a seção da porta terminou" (espião na `fn` passada à trava), ou roda sem ninguém esperando. |
| 8 | menor | Faltava declarar: estorno × aprovação com a forma da C131 (`liberarParaEstorno` `rcs:483` fora de trava; `recriarAposEstornoRecusado` `:547-575` não acha saldo); trava sem prazo de aquisição (cliente desiste em 30 s, `client/src/services/api.js:39` → 200 fantasma, reenvio 400); `UPDATE` da separação para `EM_SEPARACAO` sem guarda de status (`requisitionService.js:862/874/881`) ressuscita requisição cancelada (corrida já existente no cancelamento do almoxarifado). | Três itens novos em "O que fica de fora", limitação (91) em D. |
| 9 | IMPORTANTE | T1 (s5) não cairia: pausar no retorno de `prepararPosAprovacao` fica sob a trava com ou sem o `UPDATE` dentro. | RN-05 (f) segura a **emissão** do `UPDATE requisicoes_almoxarifado SET status=?…` com `portao.then(() => origRun(...))` (técnica de `reservaRecalculoRevisaoFase5.api.test.js:110-118`); T1 (s5) explicado. |
| 10 | IMPORTANTE | O controle de ordem não cairia: os chamadores já fazem `ORDER BY material_id` no SQL (`reservaChegadaService.js:257`; contrato de `comTravaDaRequisicao` e da nota). | (s-ordem) inverte explicitamente um chamador (aprovação `DESC` + sem `sort`); RN-07 (c) monta a intercalação que trava (inspeção segura A; nota espera A; aprovação pega B e espera A). |
| 11 | IMPORTANTE | Rodadas com portão limitado sem prova: faltava afirmar que o gatilho disparou uma vez e que o portão abriu **pelo prazo** na versão consertada; o regex não toleraria `SET\n      quantidade_atual = ?` (`stockService.js:151-152`). | Técnica dos testes, item 3: contador = 1, `abriuPor: 'prazo'`, regex com `\s+`/`\s*`. |
| 12 | menor | T1 (s6) só cobre `/aprovar-valor` (o patch de `requisicaoPosAprovacaoPortas.api.test.js:150-159` passa só por `aprovarValor`). | Teste da T1 ganha patches de `prepararPosAprovacao` por `/aprovar` e pela automática; s6 medido nas três portas. |
| 13 | menor | T2 (s5) só cai em RN-07 (a)/(b) se a distribuição tocou alguma requisição; T6 (s5): o cancelamento passa, o que cai é a nota pelo prazo. | RN-07 (a)/(b) com requisição esperando; texto do T6 (s5) corrigido. |
| 14 | menor | T0 teste (5) podia passar no s2 por tempo; o s3 deixa material travado para sempre no `Map` compartilhado. | (5) espera o marcador (teto lido ou chamada enfileirada) antes de pôr o saldo; (2) usa ids `900001`/`900003`. |
| 15 | IMPORTANTE | Posição do `finally`: um `finally` dentro da `fn` da trava roda com a trava presa → deadlock quando há requisição tocada. | Contrato da T2: `try { await trava.comLockDosMateriais(mats, () => …) } finally { await concluirPendencia(…) }`, explícito para as três portas. |
| 16 | menor | Monkeypatch futuro que encaminhe `(db,user,id)` sem `opcoes` reentra na trava (nenhum dos 12 arquivos faz hoje — os de `recebimentoReservaChegada.api.test.js:380,490` substituem a função inteira); a guarda L1 é defesa, não prova. | Nota para o comentário de cabeçalho da T2, logo após o invariante de ordem; (s5) da T0 roda sem ninguém na trava. |

**Contagem do peso:** o achado 8 veio sem peso do revisor e foi contado como **menor** (só declara limitações, não muda
task). **Nada descartado.**
