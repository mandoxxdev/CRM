# 07 — Reservas de Estoque

> **Status:** 🟢 Etapa 4 completa — backend (2026-08-05) e tela (2026-08-06) ·
> **Spec original:** seção 7
> **Última atualização:** 2026-10-08 (**Etapa 77** — a reserva de origem `REQUISICAO` só é consumida pela entrega da
> própria requisição (o motor recusa a saída genérica com 400, C136) e só é liberada à mão por quem pediu a requisição —
> enquanto ela se cancela — ou pela ação nova `liberar_reserva_requisicao` [ADMINISTRADOR, ALMOXARIFE] (C137); reserva de
> requisição não se transfere; `GET /reservas` diz número, solicitante e status da requisição; a tela mostra o número,
> barra o Liberar antes do modal e esconde o Transferir nessas linhas. `413dec88`, `4c7dc181`, `db2e294c` (merge
> `bdeefda4`), `6476f63d`, Fase 5 `a5245acc`/`198f09f4`, fechamento `2201eb1f`. Continua 🟢. **A linha "Consumo contra
> reserva" de "O que já existe" estava incompleta** — corrigida à vista abaixo. Fora: a reserva manual alheia (C139), o
> cancelamento pelos outros módulos que não solta a reserva (C141), a C131 — Etapa 91.)
> Antes: 2026-10-02 (**Etapa 76** — liberar à mão (tela Reservas, total ou parcial) ou a reserva vencer
> (`processar-expiracao`) recalcula o status da requisição dona, pela régua da 74 e sob a trava por material de todos os
> materiais dela; a revisão estendeu a trava ao recálculo da chegada/liberação e do estorno; `4f51cdbd`, `a3f3195f`,
> `66aa8e31`, `6d7c09cc`, Fase 5 `eb642441`. Continua 🟢; fora: o liberado não é redistribuído (C135), a saída
> genérica que consome reserva de requisição (C136) e quem pode liberar reserva alheia (C137) — Etapa 77.)
> Antes: 2026-10-02 (**Etapa 75** — a inspeção que aprova e a não conformidade que aceita reservam o
> que liberaram para quem esperava, pelo mesmo miolo da 74 com o teto de cada porta; o solicitante é avisado; a conta
> do "quanto falta" dos dois e-mails passou a ser a da reserva; a distribuição de um material é serializada (trava em
> processo); `1b2a6959`, `f149977b`, `c4d9212c`, `c8c089cb`, `82b7fd75`, Fase 5 `655d75b8`/`936179b2`/`18405a2e`.
> Continua 🟢; ~~falta liberar à mão / expirar recalcular o status — C127, Etapa 76~~ (*paga na Etapa 76*).)
> Antes: 2026-10-02 (**Etapa 74** — a nota que dá entrada reserva o que chegou para quem esperava, na
> ordem da fila de separação; o status acompanha a reserva (setas novas); o estorno da entrada solta só o necessário;
> `/encerrar` e `/rejeitar-valor` passam a liberar reservas; `5462b68c`, `63e377e1`, `21f9306b`, `9af1691a`,
> `00a5ff18`, `6792c8e0`, Fase 5 `65d9bc8f`/`eaef9ed1`. A linha da tabela de regras sobre a aprovação por valor sem
> saldo **estava errada** desde a Etapa 73 — corrigida à vista. Continua 🟢; a inspeção que libera o retido ainda não
> reserva — C126, Etapa 75.)
> Antes: 2026-10-02 (**Etapa 73** — a aprovação automática passou a reservar como as outras duas
> portas; a linha "Reserva automática ao aprovar requisição" estava errada para ela e foi corrigida à vista;
> `6fc7122a`, Fase 5 `5ea57d03`/`851ef2cf`. Continua 🟢; falta reservar o que chega para quem esperava — C121, Etapa 74.)
> Antes: 2026-08-11 (auditoria spec×código)
> **Design da etapa:** `docs/superpowers/specs/2026-08-05-almoxarifado-etapa4-reservas-design.md`

> ⚠️ **Correção de uma afirmação errada que estava aqui.** Este arquivo dizia
> *"backend pronto"* e listava, em "o que já existe", *"consumo baixa reserva"*. **Não era
> verdade**: `reserva_id` era apenas uma coluna gravada na movimentação, sem nenhuma lógica
> atrás. Como `criarReserva` soma em `quantidade_reservada` e o disponível subtrai isso,
> reservar 10 unidades tornava as 10 indisponíveis para **todos, inclusive quem reservou** —
> não havia caminho de consumo. A Etapa 4 fechou isso (commit `0e37dea`).

## Objetivo

Reserva automática pós-aprovação, reserva manual, por projeto/OS/lote, com expiração, transferência entre projetos e efeito real no disponível.

## O que já existe

- Tabela `reservas_material_almoxarifado` (`schema.js:569`): material, quantidade, quantidade_utilizada, projeto_id, os_id, cliente_id, equipamento, submontagem, status.
- Rotas (`routes/almoxarifado/extended.js`) — 5, sob `/api/almoxarifado`:
  `GET /reservas` (filtros `status`/`material_id`/`projeto_id` + campo derivado `saldo`) ·
  `POST /reservas` (`reservar`) · `POST /reservas/:id/liberar` (`reservar`; **+ desde a Etapa 77, para reserva de
  requisição: ser quem pediu a requisição — enquanto ela se cancela — ou ter `liberar_reserva_requisicao`**, checado
  por `reservationService.assertPodeLiberarReserva`, `413dec88`/`a5245acc`) ·
  `PUT /reservas/:id/transferir` (`reservar_outra_os`; **reserva de requisição → 400 desde a Etapa 77**, `a5245acc`) ·
  `POST /reservas/processar-expiracao` (`configurar`).
- `quantidade_reservada` no material e no saldo por localização; mapa 2D exibe reservas.
- **Consumo contra reserva** (`0e37dea`): saída com `reserva_id` valida contra a própria reserva
  (não contra o disponível), reivindica a reserva em UPDATE condicional, baixa físico+reservado
  juntos e marca `CONSUMIDA` ao zerar. Sem transação no serviço → compensação explícita.
  > ⚠️ **Esta linha estava incompleta até a Etapa 77** — corrigida à vista, não apagada. Ela valia **também para reserva
  > de requisição**: qualquer saída da `POST /movimentacoes/v2` (SAIDA, SAIDA_PRODUCAO, PERDA, AJUSTE_NEGATIVO…) citando o
  > `reserva_id` de uma reserva de origem `REQUISICAO` a consumia, e a requisição seguia `TOTALMENTE_RESERVADA` com
  > entregue 0 — era a **C136**. Desde `4c7dc181` (+ `198f09f4`) o motor recusa com 400 *"A reserva ⟨id⟩ é da requisição
  > ⟨número⟩ — o material reservado para ela só sai pela entrega da requisição (tela Requisições), não por movimentação
  > avulsa"*; a exceção é a marca `requisicaoDaEntrega` no 4º argumento de `registrarMovimentacao`, passada só por
  > `requisitionService.entregarRequisicao` e conferida contra o `requisicao_id` da reserva. A reserva **manual** continua
  > consumível pela v2. **E o estorno não reativa a reserva** (medido na Fase 5 da 77): `cancelarMovimentacao` não tem
  > ramo de reserva para estorno de saída — o material volta ao disponível e a reserva fica `CONSUMIDA`.
- **Reserva na aprovação** (`6690c1a`): `requisitionService.reservarItensAprovacao`; status
  `PARCIALMENTE_RESERVADA`/`TOTALMENTE_RESERVADA` na máquina de estados.
- `reservationService.js`: listagem com filtros, transferência, expiração e
  `liberarReservasDaRequisicao` (usada no cancelamento).
- Testes de serviço: reserva e transferência em `almoxarifado.test.js`.

## Checklist

### Backend
- [x] Reserva automática ao aprovar requisição (liga 04→07; status `PARCIALMENTE/TOTALMENTE_RESERVADA`) — `6690c1a`
  > ⚠️ **Esta linha estava errada até a Etapa 73** — corrigida à vista, não apagada. Valia para o `/aprovar` (Etapa 4) e o
  > `/aprovar-valor` (Task 6), **não** para a terceira porta: a **aprovação automática** (`tentarAprovacaoAutomatica`,
  > configuração `aprovacao_automatica`) gravava `APROVADO` com e sem saldo e **não reservava nada** (C122). Desde
  > `6fc7122a` as três portas passam pela mesma `requisitionService.prepararPosAprovacao`: reserva + status
  > (`*_RESERVADA` ou `AGUARDANDO_*`), com o gate de regras conferido antes de reservar. Fase 5 (`5ea57d03`, `851ef2cf`):
  > o perdedor de duas aprovações simultâneas pelo último saldo deixa de ficar `APROVADO` sem reserva (recalcula), a
  > falha no meio da reserva desfaz as próprias reservas (a automática fica `PENDENTE`, 201) e a reserva desconta o hold
  > ATIVO que o item já tem (idempotente). Não reserva o que **chega** para quem esperava — C121, Etapa 74.
- [x] **Reserva na chegada para quem esperava (Etapa 74, C121)** — base `5462b68c` (coluna
  `reservas_material_almoxarifado.recebimento_id`, setas novas na máquina, `requisitionService.compararPrioridade`),
  reserva `63e377e1` (`reservaChegadaService.reservarChegadaParaQuemEspera`, gancho nos dois `concluir*` do recebimento,
  antes do aviso da 70), e-mail `21f9306b`, estorno + `/encerrar` + `/rejeitar-valor` `9af1691a`, painel `00a5ff18`,
  integração `6792c8e0`, revisão do código `65d9bc8f` (estorno repetido/recusado não leva a reserva — recriação) e
  `eaef9ed1` (recusa diz quem segura o reservado). **Escopo:** só a **nota de compra** (processar e aprovar direto); a
  ordem é a da fila de separação; o teto é o que entrou livre desta nota; candidatas = `PODE_SEPARAR` (EM_SEPARACAO
  inclusa); puladas a de liberação por valor bloqueante e a de material de cliente sem o projeto do dono; o status só é
  recalculado (pela máquina) em quem ficou com reserva desta chamada. **Fica de fora:** ~~a inspeção que libera o retido
  (C126, Etapa 75)~~ (*paga na Etapa 75 — item abaixo*); entradas que não são nota; ~~recalcular status ao liberar à
  mão/expirar (C127)~~ (*paga na Etapa 76 — item abaixo*); backfill (B377).
- [x] **Reserva na liberação da inspeção e da não conformidade (Etapa 75, C126)** — miolo único com teto injetado e a
  retomada que não reconta o inspecionado `1b2a6959` (`distribuirParaQuemEspera`, `NOT EXISTS` na linha da inspeção —
  B390), a inspeção `f149977b` (`reservarLiberacaoParaQuemEspera` + gancho em `decidirInspecao`, só com aprovado > 0),
  a não conformidade `c4d9212c` (gancho em `decidirNaoConformidade`, só com efeito `LIBERADA`), o aviso ao solicitante
  `c8c089cb` (mesmo evento da 70, dedupe por documento), integração `82b7fd75`, revisão do código `655d75b8` (régua
  única `faltaDoItem` nos dois avisos — B393), `936179b2` (trava por material em processo — B394) e `18405a2e` (o aviso
  segue a regra do dono — B395). **Escopo:** duas portas — a decisão da inspeção (a parte aprovada) e a NC que aceita
  (`ACEITAR`/`ACEITAR_SOB_DESVIO`); teto = o que a decisão liberou, limitado ao disponível; a reserva leva o
  `recebimento_id` da nota (o estorno da entrada a solta pela B374); dono = quem decidiu, pelo sistema (QUALIDADE não tem
  `reservar`); best-effort — a decisão nunca cai por causa da reserva; respostas inalteradas. **Fica de fora:** o
  desbloqueio avulso e o estorno de bloqueio avulso (B383); a aprovação no mesmo instante da decisão inverte a fila
  (C131 — o `/aprovar` não passa pela trava); a trava vale para um processo só (C132, Postgres troca por trava no
  banco); backfill (B391).
- [x] **`/encerrar` e `/rejeitar-valor` liberam as reservas da requisição** — `9af1691a` (defeito anterior: terminavam a
  requisição com a reserva ATIVA presa; as do passado: A38 (1)).
- [x] **Liberar à mão ou a reserva vencer recalcula o status da requisição (Etapa 76, C127)** — base `4f51cdbd`
  (`reservaChegadaService.recalcularStatusSobTrava` — a régua `recalcularStatusDeReserva` da 74 sob a trava por material
  de **todos** os materiais da requisição, em ordem crescente — e `recalcularRequisicoesDasReservas`, que nunca lança),
  a rota `a3f3195f` (gancho em `POST /reservas/:id/liberar`, depois da liberação, best-effort), o job `66aa8e31` (gancho
  em `reservationService.processarExpiracao`, depois do lote, uma vez por requisição, só das que venceram; `require`
  lazy por causa do ciclo), integração `6d7c09cc`, revisão do código `eb642441` (o recálculo da chegada/liberação 74/75
  e o do estorno também passam pela trava — B398). **Escopo:** duas portas (liberar à mão, total ou parcial; vencer);
  liberar tudo → `APROVADO`, parte → `PARCIALMENTE_RESERVADA`; `EM_SEPARACAO`/`PARCIALMENTE_ATENDIDA` não mudam; nenhuma
  seta nova; respostas e cliente inalterados (B399). **Fica de fora:** redistribuir o liberado para quem esperava (B397 —
  C135); a saída genérica que consome reserva de requisição (C136) e o perfil `PRODUCAO` que libera reserva alheia (C137)
  — candidatos da Etapa 77 (*pagos na Etapa 77 — item abaixo*); a inversão inspeção × aprovar (C131 — custo medido,
  B403); o passado (B404, A40); aviso ao solicitante que perdeu a reserva.
- [x] **A reserva de uma requisição só sai pela requisição (Etapa 77, C136 + C137)** — quem libera `413dec88` (ação
  `liberar_reserva_requisicao` = `[ADMINISTRADOR, ALMOXARIFE]` em `permissions.js`; `reservationService.assertPodeLiberarReserva`
  chamada pela rota antes de `stockService.liberarReserva`; 403 `{ error, acao }` **sem `perfil`** — B418; `GET /reservas` +
  `requisicao_numero`, `requisicao_solicitante_id`), a recusa no motor `4c7dc181` (leitura antes de qualquer escrita;
  marca `requisicaoDaEntrega` só pelo 4º argumento), a tela `db2e294c` (merge `bdeefda4`), a integração `6476f63d`, a
  revisão do código `a5245acc` (F1: o dono só libera enquanto `validarTransicao(status, 'CANCELADO').ok` — senão 403 com
  a mensagem da separação; F2: `transferirReserva` recusa origem `REQUISICAO` com 400; `GET /reservas` + `requisicao_status`)
  e `198f09f4` (RN-01 derivado de `TIPOS_SAIDA ∩ TIPOS_MOVIMENTO_ROTA`; a jornada 8 descola os ids), o fechamento
  `2201eb1f` (a tela esconde o Transferir em reserva de requisição). **Escopo:** reserva de origem `REQUISICAO` (inclui a
  da chegada/liberação 74/75); qualquer status da reserva recusa na v2 (B408); o dono é
  `requisicoes_almoxarifado.solicitante_id`, **não** `reservas.solicitante_id` (que nela é o aprovador). **Fica de fora:**
  a reserva manual alheia (B412 — C139); PERDA/AJUSTE_NEGATIVO consumindo reserva manual (limitação); a saída **sem**
  `reserva_id` em material com `permite_saldo_negativo` leva o reservado (limitação); tipos não-saída gravam `reserva_id`
  sem consumir (candidata); o GESTOR liberar reserva de requisição (B410); o cancelamento por
  `/api/requisicoes-material/:id/cancelar` não solta reserva (C141); o passado (B414, A41); a C131 (Etapa 91).
- [ ] Reserva por lote específico / número de série — **fora da Etapa 4**. Atualização (2026-08-11): a dependência de **lote** caiu — a feature 10 (lotes) foi entregue na Etapa 6 (2026-08-09/10), então reserva por lote ficou implementável; número de série continua dependendo da 6b
- [x] Data de necessidade na reserva (`data_necessidade`) — `6690c1a`. **Prioridade** ficou fora: sem demanda concreta, `data_necessidade` cobre o ordenamento útil
- [x] Expiração automática (`POST /reservas/processar-expiracao` + config `reserva_dias_validade`) — `6690c1a`. **Opt-in**: sem a config e sem `expira_em` explícito a reserva não expira, senão as reservas manuais existentes começariam a ser liberadas sozinhas. Alerta por e-mail fica com a feature 20
- [x] Transferência de reserva entre projetos (`PUT /reservas/:id/transferir`, `reservar_outra_os`) — `6690c1a`. **Só reserva manual desde a Etapa 77** (`a5245acc`): reserva de requisição → 400 *"A reserva ⟨id⟩ é da requisição ⟨número⟩ e não pode ser transferida para outra OS ou projeto"*; a tela não mostra o botão nessas linhas (`2201eb1f`)
- [x] Bloqueio de consumo por outro projeto — consequência do consumo contra reserva, com teste explícito — `0e37dea`
- [x] Consulta "quem reservou" (histórico por material) — `43cd367`. A tela filtra por material com status "Todos", mostrando solicitante, destino e o consumido de cada reserva; o extrato do material traz as ativas
- [x] Reserva parcial com registro do atendido (`quantidade_utilizada`) — `0e37dea`

### Frontend
- [x] **Tela de reservas** (`ReservasAlmoxarifado.js`, rota `/almoxarifado/reservas`, menu "Reservas") — `43cd367`. Lista com filtros de status/material/projeto, criação, liberação total ou parcial com motivo, transferência entre projetos/OS e o botão do job de expiração (só `configurar`). Testes: `client/src/components/almoxarifado/ReservasAlmoxarifado.test.js` (10 casos na Etapa 4; **22** depois da Etapa 77 — RN-10, F1 e o Transferir ausente em reserva de requisição, `db2e294c`/`a5245acc`/`2201eb1f`)
- [x] Indicador de reservas no detalhe do material (`ExtratoMaterialModal`) — `43cd367`. A tabela de reservas ativas passou a mostrar saldo, origem (REQ #id ou MANUAL) e os prazos, além de quem reservou e o vínculo que já tinha
- ⚠️ **Ressalva (auditoria de 2026-08-11) — a Etapa 4 constava completa com um buraco de front na tela vizinha.** O item de tela desta spec cobria a tela de **reservas**, que estava ok; mas os status `PARCIALMENTE/TOTALMENTE_RESERVADA` que esta feature introduziu **não existiam na tela de requisições**: `RequisicoesList.js` mostrava o badge cru, o filtro não tinha as opções e os botões "Iniciar Separação"/"Cancelar Requisição" ficavam invisíveis nesses status; `AlmoxPageHeader.js` caía no fallback "Criar" do stepper. Corrigido em `92fe236`, com teste novo `client/src/components/almoxarifado/RequisicoesList.test.js` (badge, filtro, stepper, botões; controle positivo rodado)

### Decisões da tela (não mexer sem ler)

Três coisas que parecem detalhe e não são — cada uma faz a tela **mentir sobre saldo**:

1. **Mostra `saldo` (quantidade − utilizada), não `quantidade`.** Reserva consumida pela metade
   é o caso normal desde que a entrega passou a baixar contra a reserva.
2. **O disponível vem de `GET /almoxarifado/estoque`, não de `/materiais`.** Só o primeiro traz
   `quantidade_disponivel` calculado pelo servidor; `/materiais` devolve o **físico**. Oferecer
   físico como disponível numa tela de reserva convida a reservar saldo já reservado. Não
   recalcular a fórmula no front — seria uma segunda fonte de verdade.
3. **Transferir envia os quatro campos de dono sempre, inclusive vazios.** O servidor trata
   `undefined` como "manter" e `''` como "limpar" (`transferirReserva`, CAMPOS_DONO). Enviar só
   o preenchido faz trocar de projeto para OS **manter o projeto antigo junto**.

As três têm teste; as três foram validadas por mutação (controle positivo).

### Pendências desta feature — RESOLVIDAS (`ad0c831`)

Eram a mesma classe: rota que alterava a requisição sem passar pelo hold. As duas foram
fechadas na Task 6; ficam registradas porque explicam decisões do código atual.

- [x] **A lane `/aprovar-valor` agora reserva.** O serviço é `requisitionValueApprovalService.js`
  (esta spec já disse `valueApprovalService.js`, que **não existe** — corrigido em `7ab91e3`).
  `aprovarValor` continua gravando `APROVADO`; a reserva acontece **depois** dele, na rota, e
  sobrescreve o status para `PARCIALMENTE/TOTALMENTE_RESERVADA`. Depois e não dentro porque a
  segregação e a validação de status vivem no serviço, e não faz sentido segurar saldo de uma
  aprovação que vai ser recusada. Sem nada a reservar, o `APROVADO` permanece.
- [x] **Excluir requisição libera as reservas.** `excluirRequisicao` (soft delete
  `ativo=0, status='CANCELADO'`) passou a chamar `reservationService.liberarReservasDaRequisicao`,
  que agora tem dois chamadores — antes só o `/cancelar`. Best-effort: falha ao liberar não
  desfaz a exclusão. A justificativa da exclusão vira o motivo da liberação.

A máquina de estados ganhou `PARCIALMENTE/TOTALMENTE_RESERVADA` como destinos de
`AGUARDANDO_APROVACAO_VALOR` — sem essas setas o hold nasceria e o status seria recusado.

## Regras essenciais + testes de API exigidos

Todos em `server/tests/api/`, rodam com `npm run test:api`. *(Esta linha dizia "**51 casos** em 5 arquivos" — a contagem da Etapa 4, que envelheceu a cada etapa; saiu daqui. Os três arquivos da Etapa 77, medidos no fechamento: `reservaLiberarSoQuemPode` 22, `reservaRequisicaoSoPelaEntrega` 17, `reservaRequisicaoPortaIntegracao` 12.)*
Os nomes abaixo são os reais — copiáveis para localizar o caso.

| Regra | Arquivo · teste |
|-------|-----------------|
| Reservar acima do disponível falha | `reservaConsumo` · *reservar acima do disponível → erro* |
| Reserva reduz o disponível imediatamente, sem tocar no físico | `reservaConsumo` · *após reservar, disponível cai e o físico permanece* |
| Saída de outro projeto não consome reserva alheia | `reservaConsumo` · *saída SEM reserva_id não consome reserva de terceiro* |
| Saída **com** `reserva_id` consome a própria reserva e não é barrada pelo disponível | `reservaConsumo` · *saída COM reserva_id consome a reserva e NÃO é barrada pelo disponível* |
| Consumo acima do saldo da reserva falha sem efeito colateral | `reservaConsumo` · *consumir mais que o saldo da reserva → 400 e nada muda* |
| Reserva totalmente consumida vira CONSUMIDA | `reservaConsumo` · *reserva totalmente consumida vira CONSUMIDA e libera o reservado* |
| Consumo deixa rastro (`reserva_id` na movimentação) | `reservaConsumo` · *a movimentação de consumo fica registrada com o reserva_id (rastro)* |
| Liberação devolve ao disponível e registra quem/quando/por quê | `reservaConsumo` · *liberar reserva devolve ao disponível* · `reservaTransferenciaExpiracao` · *liberar grava liberado_por, liberado_em e motivo_liberacao* |
| Aprovação de requisição reserva automaticamente | `requisicaoReservaAutomatica` · *[aprovar] saldo total em todos os itens -> TOTALMENTE_RESERVADA com uma reserva por item* |
| Aprovação com saldo parcial reserva só o disponível | `requisicaoReservaAutomatica` · *[aprovar] saldo parcial -> PARCIALMENTE_RESERVADA e reserva só do disponível* |
| Sem saldo nenhum, segue para AGUARDANDO_ESTOQUE/COMPRA (não regride) | `requisicaoReservaAutomatica` · *[aprovar] nenhum item com saldo -> AGUARDANDO_ESTOQUE e nenhuma reserva (regressão)* |
| Entrega consome a reserva da própria requisição, debitando uma vez só | `requisicaoReservaAutomatica` · *[entregar] consome a reserva da requisição: CONSUMIDA e disponível debitado UMA vez* |
| Entrega acima do reservado divide a saída (reserva + excedente) | `requisicaoReservaAutomatica` · *[entregar] quantidade acima da reserva: consome a reserva + o excedente sem reserva* |
| Transferência muda dono sem mover saldo; exige `reservar_outra_os` | `reservaTransferenciaExpiracao` · *transferir muda o dono da reserva e NÃO move saldo nenhum* · *transferir exige reservar_outra_os: perfil sem a permissão → 403 e nada muda* |
| Expiração libera vencidas, marca EXPIRADA e devolve ao disponível | `reservaTransferenciaExpiracao` · *expiração libera só as vencidas, marca EXPIRADA e devolve ao disponível* |
| Expiração é **opt-in** (sem config e sem `expira_em`, não expira) | `reservaCicloIntegracao` · *sem config e sem valor explícito, a reserva NÃO ganha expira_em (opt-in)* |
| Cancelar requisição libera as reservas dela | `reservaCicloIntegracao` · *cancelar requisição libera as reservas dela e devolve ao disponível* |
| Cancelar não mexe em reserva manual de terceiro | `reservaCicloIntegracao` · *cancelar NÃO mexe em reserva manual de outro dono do mesmo material* |
| Idempotência: liberar/consumir reserva já finalizada → 400 | `reservaConsumo` · *consumir reserva já CONSUMIDA → 400* · `reservaTransferenciaExpiracao` · *liberar reserva já liberada → 400 (idempotência)* · *expiração é idempotente: rodar de novo não libera nem desconta duas vezes* |
| Aprovação **por valor** também reserva | `reservaPontasFaltantes` · *[aprovar-valor] com saldo total reserva os itens e derruba o disponível* |
| ~~Aprovação por valor sem saldo continua APROVADO (regressão)~~ — **esta linha estava errada desde a Etapa 73** (corrigida à vista, não apagada): o teste foi renomeado e a regra mudou (B359). O certo: **aprovação por valor sem saldo vai a AGUARDANDO_ESTOQUE/COMPRA e não cria reserva** | `reservaPontasFaltantes` · *[aprovar-valor] sem saldo nenhum vai a AGUARDANDO_ESTOQUE e não cria reserva (Etapa 73; era APROVADO)* |
| **Etapa 74** — a nota reserva o que chegou livre para quem esperava (`recebimento_id`, origem REQUISICAO, dono = quem processou); status `*_RESERVADA` | `recebimentoReservaChegada` · *[RN-01] nota de 4 pelas seis portas: UMA reserva ATIVA de 4 para o item de R1…* |
| A ordem é a da fila de separação (urgência → necessidade → mais antiga) | `recebimentoReservaChegada` · *[RN-02] R1 NORMAL (6, antes) e R2 URGENTE (3, depois)…* · *[RN-02] mesma urgencia…* |
| Retido para inspeção não se reserva; só o que **esta** nota trouxe livre | `recebimentoReservaChegada` · *[RN-03]…* · *[RN-04] so o que ESTA nota trouxe…* · *[RN-04] saldo livre previo…* |
| A aprovação automática criada depois não toma | `recebimentoReservaChegada` · *[RN-05] aprovacao automatica ligada…* |
| O status acompanha pela máquina; EM_SEPARACAO ganha sem mudar status; terminais não ganham | `recebimentoReservaChegada` · *[RN-06]…* (três cenários) |
| Pulada: liberação por valor bloqueante; material de cliente sem o projeto do dono | `recebimentoReservaChegada` · *[Fase 2] candidata com avaliacao de valor…* · *[RN-14 revista] material de cliente…* |
| Idempotente; corrida no meio desfaz o excesso; cancelada no meio desfeita | `recebimentoReservaChegada` · *[RN-08]…* (três) · *[Fase 2] corrida no meio…* · *[RN-09] cancelada entre a leitura e a reserva…* |
| O estorno da entrada solta só o necessário, da última na ordem, e só de quem não separou | `recebimentoReservaChegadaEstorno` · *[RN-11]…* · *[RN-11, Fase 2]…* |
| O estorno que não acontece não leva a reserva (repetido, lote, falha depois, corrida) | `recebimentoReservaChegadaEstorno` · *[Fase 5]…* (quatro) |
| A recusa do estorno diz quem segura o material reservado | `recebimentoReservaChegadaEstorno` · *[Fase 5] recusa por material RESERVADO (nao consumido) diz quem segura…* |
| `/encerrar` e `/rejeitar-valor` liberam as reservas | `recebimentoReservaChegadaEstorno` · *[Fase 2] /encerrar…* · *[Fase 2] /rejeitar-valor…* |
| Ponta a ponta | `recebimentoReservaChegadaIntegracao` (11 cenários, pelas rotas) |
| **Etapa 75** — a inspeção que aprova reserva o aprovado para quem esperava, na ordem da fila (resposta inalterada) | `inspecaoReservaLiberacao` · *[RN-01] quem esperava fica com o que a inspecao aprovou…* · *[RN-02] R1 NORMAL (6, antes) e R2 URGENTE (3, depois)…* |
| Só o que esta decisão liberou — nunca o reprovado nem saldo alheio | `inspecaoReservaLiberacao` · *[RN-03]…* (três: 3/1, entrada manual 1/3, reprovação total) |
| A NC que aceita reserva; as outras decisões e o `SEM_BLOQUEIO` não | `ncReservaLiberacao` · *[RN-04]…* |
| Best-effort; uma vez por decisão; a Qualidade reserva pelo sistema | `inspecaoReservaLiberacao` · *[RN-06]…* · *[RN-07]…* · *[RN-08]…* · `ncReservaLiberacao` · *[RN-06]…* · *[RN-07]…* |
| O desbloqueio avulso não reserva (declarado) | `inspecaoReservaLiberacao` · *[RN-11] desbloqueio avulso do reprovado NAO reserva…* |
| A retomada da nota não reconta o item inspecionado (B390) | `reservaLiberacaoBase` · *[RN-07/D8]…* (serviço e rota) |
| O e-mail da liberação diz a verdade (L1/L0, dedupe por documento, toggle) | `inspecaoReservaLiberacaoAviso` · *[RN-09]…* (oito) · *[Fase 2] resultado PARCIAL…* |
| Régua única do "quanto falta" nos dois e-mails (B393) | `reservaLiberacaoRevisaoFase5` · *[regua 75]…* · *[regua 74]…* · *[regua = miolo]…* |
| Duas liberações (ou duas notas) do mesmo material ao mesmo tempo não zeram a fila (B394) | `reservaLiberacaoRevisaoFase5` · corridas 75 e 74 (5 rodadas) · *[corrida] o lock solta quando a distribuicao LANCA…* |
| O e-mail segue a regra do dono (B395) | `reservaLiberacaoRevisaoFase5` · *[dono 75]…* · *[dono 74]…* |
| Ponta a ponta (perfis reais: a Qualidade decide) | `inspecaoReservaLiberacaoIntegracao` (13 cenários, pelas rotas) |
| **Etapa 76** — liberar à mão tudo → `APROVADO`; parte → `PARCIALMENTE_RESERVADA`; resposta inalterada | `reservaLiberarRecalculaStatus` · *[RN-01]…* · *[RN-02]…* (três) |
| A reserva vencida recalcula, uma vez por requisição, depois do lote; a que falhou não é recalculada | `reservaExpiracaoRecalculaStatus` · *[RN-03]…* (quatro) |
| Fora do conjunto não muda (EM_SEPARACAO, PARCIALMENTE_ATENDIDA); reserva manual não toca requisição | `reservaLiberarRecalculaStatus` · *[RN-04]…* (três) · `reservaExpiracaoRecalculaStatus` · *[RN-04]…* (três) |
| Best-effort: o recálculo nunca derruba a liberação nem o job | `reservaLiberarRecalculaStatus` · *[RN-05]…* · `reservaExpiracaoRecalculaStatus` · *[RN-05]…* · `reservaRecalculoBase` · *(e)…* |
| O recálculo roda sob a trava (corrida com a nota do mesmo material; dois materiais; dois itens do mesmo material não travam) | `reservaRecalculoBase` · *(f)…* · *(g)…* · *(i)…* · `reservaLiberarRecalculaStatus` · *[RN-07]…* |
| O recálculo da chegada/liberação e do estorno também sob a trava (B398) | `reservaRecalculoRevisaoFase5` · *(a)…* · *(b)…* · *(c)…* |
| Perfil inalterado (QUALIDADE não libera; job só ADMINISTRADOR); ~~transferir não recalcula (declarado)~~ — desde a Etapa 77 a transferência de reserva de requisição é **400** (o RN-08 foi editado, com o porquê) | `reservaLiberarRecalculaStatus` · *[RN-06]…* · *RN-08 transferir reserva de requisicao: 400 desde a Etapa 77 (F2)…* · `reservaExpiracaoRecalculaStatus` · *[RN-06]…* |
| Ponta a ponta (liberar, nota, vencer, separar, entregar — perfis reais) | `reservaRecalculoIntegracao` (7 cenários, pelas rotas) |
| **Etapa 77** — a v2 com o `reserva_id` de uma reserva de requisição: 400 M1 e nada mudou, em todo tipo de saída da v2 e no parcial; a manual pela v2 consome | `reservaRequisicaoSoPelaEntrega` · *[RN-01] v2 ⟨tipo⟩ com o reserva_id da requisicao: 400 M1, nada mudou* · *[RN-01] v2 SAIDA parcial…* · *[RN-01] metade positiva: reserva MANUAL pela v2 -> 201 CONSUMIDA…* |
| A entrega da própria requisição continua consumindo (e divide com o excedente) | `reservaRequisicaoSoPelaEntrega` · *[RN-02] entrega pela rota (ALMOXARIFE)…* · *[RN-02] entrega maior que a reserva…* |
| A marca é do 4º argumento e da requisição certa; o `params` não abre | `reservaRequisicaoSoPelaEntrega` · *[RN-03] (a)…* a *(d)…* |
| Precedência: inexistente / outro material → a mensagem de hoje; já LIBERADA → M1 | `reservaRequisicaoSoPelaEntrega` · *[RN-04]…* (três) |
| Quem libera reserva de requisição: quem pediu (sem perfil, parte), ALMOXARIFE, ADMINISTRADOR de perfil e admin de sistema | `reservaLiberarSoQuemPode` · *[RN-05] (a)…* a *(e)…* |
| A lista negativa: sem perfil, PRODUCAO e ENGENHARIA que não pediram → 403 M2; GESTOR/COMPRAS/CONSULTA/QUALIDADE → 403 `reservar`; o mapa; o aprovador não é o dono; permissão antes do estado | `reservaLiberarSoQuemPode` · *[RN-06] (a)…* a *(g)…* |
| O dono só libera enquanto a requisição se cancela (F1); almoxarife/administrador ainda liberam; não-dono continua M2 | `reservaLiberarSoQuemPode` · *[F1] o dono (sem a acao) com a requisicao ⟨estado⟩: 403 M3…* · *[F1] metade positiva…* · *[F1] nao-dono…* |
| Reserva de requisição não se transfere; a manual sim (F2) | `reservaLiberarSoQuemPode` · *[F2] GESTOR transferindo a reserva da requisicao…: 400, nada muda* · *[F2] metade positiva…* |
| A reserva manual não mudou; o job de expiração vence reserva de requisição como antes | `reservaLiberarSoQuemPode` · *[RN-07]…* (duas) |
| `GET /reservas` diz número e solicitante da requisição; `minhas-permissoes` traz a ação nova | `reservaLiberarSoQuemPode` · *[RN-08]…* · *[RN-09]…* |
| Ponta a ponta (v2 recusada, liberar por perfil, dono libera parte, entrega consome, reserva da chegada — perfis reais) | `reservaRequisicaoPortaIntegracao` (12 cenários, pelas rotas) |
| Excluir requisição libera as reservas dela | `reservaPontasFaltantes` · *excluir requisição libera as reservas dela e devolve ao disponível* |
| Excluir não toca reserva manual de terceiro | `reservaPontasFaltantes` · *excluir NÃO mexe em reserva manual de outro dono do mesmo material* |

## Dependências

- 03 (fórmula de disponível) · 04 (gancho pós-aprovação) · 10 (reserva por lote/série).
