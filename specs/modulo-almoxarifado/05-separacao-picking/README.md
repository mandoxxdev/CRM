# 05 — Separação e Picking

> **Status:** 🟡 **com dono, segunda conferência, origem por item na SEPARAÇÃO e na ENTREGA, divergência registrada, SÉRIE na entrega, TROCA da origem separada registrada NA ENTREGA E NA SEPARAÇÃO e FILA DE SEPARAÇÃO** — **Etapa 65 (2026-10-01, `5290ba8`, `7d2a160` + fix-rounds `75ff9a5` e `4512b16`)**: a rodada de separação que apaga a origem planejada (separado pendente de A, rodada nova de outro par, em automático ou de vários pares) grava a troca em `substituicoes_origem_requisicao` com `momento = 'SEPARACAO'` e `separacao_id`; a janela de separação parte da planejada no "Sai de" quando ela cobre a quantidade sugerida, avisa a troca e pede "Motivo da troca (opcional)". **O que falta para 🟢:** lista de separação como entidade, agrupamento/rota de picking, substituição de lote com registro (falta a troca de **série**), transferência para localização de kit e kits. Antes: **Etapa 64 (2026-10-01, `fb06142`, `88d943a` + fix-round `42d7526`)**: `GET /api/almoxarifado/fila-separacao` (gate `separar_emitir`, só leitura) e a tela "Fila de separação": as requisições com trabalho, na ordem acionável → urgência → necessidade → mais antiga, com `etapas[]` por requisição (Separar só com separável agora, Entregar só com entregável agora, conferência conforme o estado, aprovação de valor avaliada na hora) e o que falta por item. **O que falta para 🟢:** lista de separação como entidade, agrupamento/rota de picking, a troca registrada também **na separação**, transferência para localização de kit e kits. Antes: **Etapa 63 (2026-10-01, `3e022eb`, `e7f3afa` + fix-round `4f008f2`)**: a entrega que sai de outro endereço ou lote que não o separado deixa registro (tabela `substituicoes_origem_requisicao`, motivo opcional, bloco "Substituições" no detalhe); acima do separado pendente a baixa se divide (o pendente sai da planejada, o excedente pelo automático). **O que falta para 🟢:** lista de separação como entidade, agrupamento/rota de picking, a troca registrada também **na separação**, transferência para localização de kit, kits e a tela de fila. Antes: **Etapa 61 (2026-09-30, `6ba7429`, `d74e5a8` + fix-round `77d084c`)**: a entrega de material com série exige e baixa as séries escolhidas (o registro por item fica completo); a exclusão da requisição as devolve. **O que falta para 🟢:** lista de separação como entidade, agrupamento/rota de picking, substituição de lote com registro, transferência para localização de kit, kits e a tela de fila. Antes: **Etapa 60 (2026-09-30, `eea0687`, `0486b9c` + fix-round 1125a0f)**: cada rodada de separação grava, por item, quanto dava para separar, se ficou abaixo (divergente) e o motivo — **opcional**; a janela pede o motivo abaixo do possível e o conferente lê no bloco "Separação". **Só registro** (**B238**). Antes: **Etapa 59 (2026-09-30, `11dcdb5`, `29eb434` + fix-round e2b7dab)**: a separação registra, por item, o endereço e o lote de onde sai ("Sai de"), conferidos como na entrega; o item guarda a **origem planejada** e a entrega — inclusive a de **um clique** — sai dali, até o separado ainda não entregue (fecha o **C80**). Antes: **Etapa 58 (2026-09-30, `cec2b56`, `d18019f` + fix-round e9bca72)**: a entrega de requisição escolhe, por item, o endereço e o lote de onde sai ("Sai de"), com confirmação por leitura opcional; a origem escolhida é estrita; a exclusão da requisição devolve ao lote e ao endereço de cada saída. Antes: **Etapa 28 (2026-08-29, `9cef003..62cb2b1`)**: cada rodada de separação é registrada com autor (`separacoes_requisicao_almoxarifado`, append-only), a separação e a liberação auditam, e a **segunda conferência (conferente ≠ separador, em QUALQUER rodada)** existe com a barreira repetida no `WHERE` do claim; com material crítico ainda na caixa ela é **obrigatória** para liberar e para entregar. **O que falta para 🟢:** lista de separação como entidade, agrupamento/rota de picking, registro por item com localização lida e lote retirado **na SEPARAÇÃO** (pago na separação e na entrega — Etapas 58 e 59; o que falta do item é a **série**), **série por item** (a entrega de material com série ainda sai sem escolher as séries — ver a próxima tarefa no plano da Etapa 60), substituição de lote, transferência para localização de kit (exige estender `TIPOS_LOCALIZACAO`), kits, e a tela de fila. Antes: 🟡 básico — a separação simples por item existe e foi endurecida pelas Etapas 3/4/6 (permissão `separar_emitir`, liberação para retirada, parcialidade acumulada); lista de separação como entidade, conferência dupla, rota de picking e kits continuam não existindo · **Spec original:** seção 12
> **Última atualização:** 2026-10-08 (**Etapa 92** — a separação **reivindica** a requisição antes de gravar: `UPDATE … SET status='EM_SEPARACAO' WHERE id=? AND status IN (PODE_SEPARAR)` depois da passada de validação; perdeu (cancelada no meio) → o 400 de sempre e nada gravado; a falha de banco depois de reivindicar, sem rodada gravada, devolve o status lido — só se nenhuma rodada nova entrou (RN-09). `6a0b529c`, Fase 5 `f3b2b4fb`. O status continua 🟡 pelos mesmos motivos — ver o bloco "Etapa 92" no fim; esta etapa não mexe no que falta para 🟢.) Antes: 2026-10-01 (**Etapa 65 fechada** — a troca de origem na separação fica registrada; o item "Substituição de lote com registro" continua [ ] só pela série; ver o bloco "Etapa 65" no fim). Antes: 2026-10-01 (**Etapa 64 fechada** — a fila de separação do almoxarife; o item "Tela de listas de separação" vira [x]; ver o bloco "Etapa 64" no fim). Antes: 2026-10-01 (**Etapa 63 fechada** — a troca da origem separada fica registrada na entrega; ver o bloco "Etapa 63" no fim). Antes: 2026-09-30 (**Etapa 61 fechada** — a série por item na entrega; o registro por item vira [x]; ver o bloco "Etapa 61" no fim). Antes: 2026-09-30 (**Etapa 60 fechada** — separar menos do que dava passa a deixar registro, com motivo opcional; ver o bloco "Etapa 60" no fim). Antes: 2026-09-30 (**Etapa 59 fechada** — a separação diz de onde cada item sai, e a entrega de um clique usa; ver o bloco "Etapa 59" no fim). Antes: 2026-09-30 (**Etapa 58 fechada** — a entrega de requisição diz de onde cada item sai). Antes: 2026-08-29 (**Etapa 28 fechada, `9cef003..62cb2b1`** — ver o bloco "Etapa 28" no fim: o "responsável pela separação" e a "segunda conferência" estão pagos; a **régua de obrigatoriedade** é decisão minha (letra **B62**), e a revisão adversarial achou que a **escrita parcial** do laço de separação — anterior à etapa — deixava item gravado sem rodada, furando a barreira; virou tudo-ou-nada em `5a3d593`). Antes: 2026-08-29 (**Fase 0 da Etapa 28, medida no código**: esta spec afirmava
> que `TIPOS_LOCALIZACAO` já contemplava "Reservado"/"Kit"/"Aguardando retirada" — **ESTAVA
> ERRADO**, ver a correção abaixo; e a medição achou o **bloqueio real** de três itens do
> checklist, que a spec não nomeava: **a separação não tem autor e não deixa rastro**. Nenhum item
> mudou de estado.) Antes: 2026-08-11 (auditoria spec×código — esta spec estava congelada em 2026-08-02, anterior às Etapas 3, 4 e 6, e não refletia nada do que elas mudaram aqui)

## Objetivo

Listas de separação agrupadas, rota de picking, conferência dupla, montagem e identificação de kits.

## O que já existe

- Separação simples por item dentro da requisição: `PUT /requisicoes/:id/separacao` + alias `PUT /requisicoes/:id/separar` (`routes/almoxarifado.js`), ambos hoje sob `requirePermission('separar_emitir')` (perfis ADMIN/ALMOXARIFE) — esta spec não mencionava permissão. Grava `quantidade_separada` (acumulando em múltiplas rodadas, com teto `maxSeparar`), bloqueia separar acima do teto e sem aprovação de valor (`requisitionService.js`).
- Front: ação "Separação" em `RequisicoesList.js` com quantidades por item.
- ~~Localização virtual: `TIPOS_LOCALIZACAO` já contempla tipos que servem para "Reservado"/"Kit"/"Aguardando retirada" (validar na implementação).~~
  > **ISTO ESTAVA ERRADO, e o erro é do tipo que faz alguém começar a implementar e travar no meio**
  > (medido na Fase 0 da Etapa 28, 2026-08-29). A lista completa de `TIPOS_LOCALIZACAO`
  > (`server/services/almoxarifado/schema.js:21-26`) é: *Almoxarifado, Rua, Prateleira, Gaveta,
  > Box, Área externa, Área de corte, Área de montagem, Área de elétrica, Área de pintura, Área de
  > expedição, Área de materiais do cliente, Área de quarentena/inspeção*. **Não existe
  > "Reservado", não existe "Kit", não existe "Aguardando retirada".** O que a spec chamava de
  > "validar na implementação" é, na verdade, **estender o enum** — que é exportado
  > (`schema.js:2046`) e servido ao front como `localizacoes_tipos` (`extended.js:151`), ou seja,
  > **mudança de contrato de API**, não conferência. O item de checklist que depende disto é o
  > "Transferir material separado para localização Aguardando retirada/Kit".
  > **A afirmação errada fica à vista, riscada**, em vez de apagada: é a quarta vez nesta base que
  > uma spec afirma algo sobre a existência de código sem medir, e a segunda no sentido inverso
  > (as três anteriores diziam que algo **não** existia quando existia; esta diz que existe e não
  > existe).
- ~~**A separação NÃO TEM AUTOR e NÃO DEIXA RASTRO**~~ **PAGO na Etapa 28 (`f298536`)** — ver o bloco no fim. O texto abaixo fica como estava, porque é a medição que definiu a etapa: (medido na Fase 0 da Etapa 28, 2026-08-29 —
  esta spec não nomeava o fato, e ele é o **bloqueio real** de três itens do checklist):
  `requisitionService.separarRequisicao(db, requisicaoId, itensSeparados)` (`:189`) **não recebe
  `user`**, e o handler da rota (`routes/almoxarifado.js:3301`, `handleSeparacao`) **não repassa
  `req.user`**; `requisitionService.js` tem **zero** ocorrências de `registrarAuditoria`/`auditar`
  (contado); `auditLabels.js` tem **zero** ocorrências de `SEPARA` — não existe verbo de
  separação no vocabulário da trilha. Consequência: **não há como saber quem separou uma
  requisição**, nem pela trilha nem pela tabela. O contraste é dentro do mesmo arquivo de rotas:
  `/confirmar-recebimento` e `/rejeitar-valor` auditam; `/separacao` e `/liberar-retirada` não.
- **Armadilha de segunda porta, medida e nomeada:** existe `conferencias_almoxarifado` com
  `dupla_contagem`, `contado_por_id`/`recontado_por_id` e `modo_cego` (`schema.js:1876-1891`).
  **Não serve para o item "Segunda conferência" desta spec:** é conferência de **inventário**
  (feature 10, `tipo DEFAULT 'GERAL'`, tela `ConferenciaEstoque.js`), sem nenhuma ligação com
  requisição ou separação. Está escrito aqui para ninguém "descobrir" a tabela no meio da etapa e
  achar que o item já está meio pronto — mesmo cuidado que a spec 09 tomou com `padroes_qualidade`.

## Checklist

### Backend
- [ ] Lista de separação como entidade própria (agrupa itens de 1+ requisições)
- [ ] Agrupamento por projeto / setor / localização
- [x] **Responsável pela separação — PAGO na Etapa 28 (`f298536`, RN-01/02/04):** `separarRequisicao` recebe `user`, cada rodada vira uma linha de `separacoes_requisicao_almoxarifado` (quem, quando, `itens_json`), e audita `SEPARACAO`. **Prioridade** continua fora (depende da lista de separação como entidade). Texto original: **o "responsável" é o bloqueio de fato, e ele é
  anterior a tudo neste checklist:** hoje o separador **não é gravado em lugar nenhum** (ver "O que
  já existe"). Não é um campo a somar a um fluxo pronto: é o campo sem o qual os itens
  "Segunda conferência (conferente ≠ separador)" e a regra "conferência pelo mesmo usuário da
  separação falha" **não têm como existir**
- [ ] Sugestão de rota (ordenar itens pela hierarquia de localizações)
- [x] Registro por item: localização lida, lote/série retirado, quantidade, divergência — **COMPLETO na Etapa 61** (`6ba7429`, `d74e5a8` + fix-round `77d084c`): a **série** retirada é registrada **na entrega** (a janela lista as séries em estoque do item e exige exatamente a quantidade; o servidor valida antes de qualquer baixa e dá baixa nelas). **Por que [x] com a série na ENTREGA e não na separação:** a separação é lógica (não move estoque); quem baixa a peça é a entrega, e é ali que o sistema precisa saber QUAL unidade saiu — registrar a série na separação seria uma intenção a mais, sem efeito. A **leitura de etiqueta na separação** continua fora (a leitura existe na entrega e na movimentação) — declarado, não bloqueia o item. Histórico: **PARCIAL, pago NA ENTREGA na Etapa 58** (`cec2b56` serviço, `d18019f` tela, fix-round e9bca72): cada item da entrega aceita `localizacao_origem_id`, `lote_id` e `codigo_lido_origem` (a "localização lida" é a confirmação por leitura da Etapa 56), a origem escolhida é **estrita** (recusa se não cobre) e tudo é validado antes da primeira baixa. **Continua `[ ]` por três motivos:** (1) o registro é na **entrega**, não na **separação** — a rodada de separação não guarda endereço nem lote (próxima etapa); (2) a entrega de **um clique** ("Confirmar Entrega e Baixar Estoque") não escolhe origem (**C80**); (3) **série** e **divergência** por item ficam fora (**D (58)**). **Etapa 59 (`11dcdb5`, `29eb434` + fix-round e2b7dab):** os motivos (1) e (2) estão **pagos** — a separação registra endereço e lote por item (na rodada e como origem planejada do item), e a entrega de um clique sai dali. **Continua `[ ]` só pelo motivo (3):** série e divergência por item (**D (59)**); a "localização lida" na separação (leitura de etiqueta) também fica fora. **Etapa 60 (`eea0687`, `0486b9c` + fix-round 1125a0f):** a **divergência** está paga — cada rodada registra, por item, o máximo separável na hora, se ficou abaixo e o motivo (opcional, **B238**). **Continua `[ ]` só pela SÉRIE** por item (e pela leitura de etiqueta na separação).
- [ ] Substituição de lote com registro — **PARCIAL, pago NA ENTREGA na Etapa 63** (`3e022eb` serviço, `e7f3afa` tela, fix-round `4f008f2`): quando a entrega de um item sai de outro endereço (ou de outro lote, se o separado tinha lote) que não a origem separada, ou vai pelo automático pedido, fica registrado em `substituicoes_origem_requisicao` (quanto, endereço e lote separados e de saída, movimentações, motivo opcional, autor) e o detalhe mostra o bloco "Substituições". **Continua `[ ]` por dois motivos:** (1) a troca **na separação** (uma rodada com outra origem sobre separado pendente apaga a planejada — **B237**) continua **sem registro** (**B248**); (2) trocar a **série** escolhida não conta como troca (**D (63)**). **Etapa 65** (`5290ba8` serviço, `7d2a160` tela, fix-rounds `75ff9a5` e `4512b16`): o motivo (1) está **pago** — a rodada que apaga a planejada registra a troca com `momento = 'SEPARACAO'`. **Continua `[ ]` só pelo motivo (2):** a troca de **série** (**D (63)**, **D (65)**).
- [ ] Separação parcial com saldo pendente — nota (auditoria 2026-08-11): a **parcialidade em si já funciona** (acúmulo de `quantidade_separada` em múltiplas rodadas + teto `maxSeparar`, entregue nas Etapas 3/4); o que falta deste item é a entidade lista-de-separação e o registro de divergência. **Etapa 60:** o registro de divergência está **pago** (`eea0687`, `0486b9c` + fix-round 1125a0f); continua `[ ]` pela lista de separação como entidade
- [ ] Transferir material separado para localização "Aguardando retirada"/"Kit" (movimentação v2 de transferência) — **exige estender `TIPOS_LOCALIZACAO` primeiro** (ver a correção em "O que já existe"): os três tipos que este item pressupõe **não existem** no enum. **Etapa 68 (feature 02):** `TIPOS_LOCALIZACAO` passou a 15 rótulos e a **`Área de expedição`** (que já existia) ganhou semântica de **aviso** — a tela avisa que *"a requisição não usa este endereço — a entrega baixa da origem separada"*. "Aguardando retirada" e "Kit" **continuam não existindo**, e levar o separado para a área de expedição (com a entrega baixando de lá) continua **falta desta feature** — depende da lista de separação como entidade.
- [x] **Segunda conferência (conferente ≠ separador) — PAGA na Etapa 28 (`174d388` + fix-round `5a3d593`, RN-03/05/06/07):** `PUT /requisicoes/:id/conferir-separacao`, ação própria `conferir_separacao` (ADMINISTRADOR, ALMOXARIFE), recusa quem aparece em **qualquer** rodada (403 pela mensagem; `NOT EXISTS` no `WHERE` do claim pela garantia — `claimConferencia` exportado e provado direto), 409 para segunda conferência; **obrigatória** para `liberar-retirada` e `entregar` quando há material crítico separado e não entregue (decisão **B62**); rodada nova limpa a conferência (compare-and-clear) e guarda a apagada em `dados_anteriores`. **Fica de fora, declarado:** conferência só em `EM_SEPARACAO` (**B63**); requisição separada antes da etapa não tem rodada (**C37**). Texto original: **depende do item "responsável" acima**. O
  molde já existe na base e é o mais maduro dela: a dupla assinatura **por identidade** do
  sucateamento (`scrapDisposalService.js:342`, duas ações de perfil próprias, segunda assinatura
  fechando o status num claim único). Aqui falta a primeira metade — saber quem foi o primeiro
- [ ] Kit: identificação e conteúdo
- [x] Liberar para retirada → status da requisição `PRONTA_PARA_RETIRADA` — **entregue na Etapa 3 (2026-08-05)**: rota `PUT /requisicoes/:id/liberar-retirada` (permissão `separar_emitir`), valida a transição na máquina de estados e exige ≥1 item separado, com teste de API. Estava marcado na spec 04 desde a Etapa 3 e **aqui ficou esquecido como pendente** — corrigido na auditoria de 2026-08-11

### Frontend
- [x] Tela de listas de separação (fila de trabalho do almoxarife) — **Etapa 64** (`fb06142` serviço e rota, `88d943a` tela, fix-round `42d7526`): a "Fila de separação" lista as requisições com trabalho de almoxarife, na ordem de trabalho, com as etapas de cada uma e o que falta por item. **Por que [x] sendo por requisição:** a fila de trabalho do almoxarife é o que o item pede; agrupar várias requisições numa **lista** é o item "Lista de separação como entidade própria" (Backend), que continua `[ ]` junto com o agrupamento e a rota de picking.
- [ ] Fluxo de conferência

## Regras essenciais + testes de API exigidos

| Regra | Teste |
|-------|-------|
| Separar mais que o solicitado/estoque falha | `separacao acima do estoque falha` (serviço) **e, desde a Etapa 28, na API:** `separacaoComDono.api.test.js` `[RN-01] payload misto valido+invalido -> 400 e NADA gravado` (que também prova o tudo-ou-nada) |
| ~~Material separado sai do disponível (vai para localização reservada)~~ **Superada — esta regra estava errada como mecanismo (corrigido 2026-08-11):** desde a Etapa 4 o material sai do disponível **na aprovação**, via reserva (`requisitionService.reservarItensAprovacao`); a separação não move saldo nenhum | coberto pelos testes de reserva da feature 07 (`requisicaoReservaAutomatica.api.test.js`); mover fisicamente para localização de kit fica com a lista de separação, se vier |
| Segunda conferência exige usuário diferente | **`segundaConferencia.api.test.js` `[RN-03] PESO: separador da PRIMEIRA rodada tenta conferir -> 403`** e `[RN-03] o claim sozinho segura` (Etapa 28) |
| Divergência na separação exige registro | ~~`separacao com quantidade menor exige motivo`~~ — **esta linha estava errada (corrigido na Etapa 59):** o teste citado **não existe** em `server/tests/api/`, e o serviço de separação não tem campo nem regra de motivo de divergência (medido no fechamento da 59, `grep` em `requisitionService.js`). A regra **não está implementada**; é a candidata da próxima etapa. **Etapa 60 — como ficou:** a divergência é **registrada, não exigida** (**B238**): a rodada grava `maximo`, `divergente` e `motivo_divergencia` por item; o motivo é opcional. O nome da regra ("exige registro") descreve o que o sistema faz **se** o separador escrever o porquê — o sistema **não recusa** sem ele. Testes: `separacaoDivergencia.api.test.js` (7 cenários, Etapa 60). |
| Separação com origem: o endereço (no lote) cobre esta rodada somada ao separado pendente de quem planejou o mesmo par; nada é gravado se um item falha | `separacaoOrigemPorItem.api.test.js` — `RN-01 A nao cobre…`, `RN-01 mesma origem em duas rodadas…`, `Fase 5: DOIS itens do mesmo material…` (Etapa 59) |
| A entrega sem origem usa a origem planejada até o separado pendente; `origem_automatica` a ignora; a que não serve mais recusa com o caminho | `separacaoOrigemPorItem.api.test.js` — `C80…`, `RN-03…` (três cenários) (Etapa 59) |
| Entrega com origem escolhida é estrita (recusa se o endereço/lote não cobre; nada sai pela metade quando há escolha) | `entregaOrigemPorItem.api.test.js` — `Fase 2 critico 1`, `Fase 2 critico 2`, `Tudo antes`, `Concorrencia` (Etapa 58) |
| Excluir a requisição devolve ao lote e ao endereço de cada saída | `entregaOrigemPorItem.api.test.js` — `Fase 2 critico 3`, `Fase 5: excluir com DUAS partes…` (Etapa 58) |
| A entrega que sai de outro par (endereço, ou lote quando o separado tinha lote) que não a origem separada registra a troca; sair da própria planejada não registra | `substituicaoOrigem.api.test.js` — `RN-01 separou de A, entregou de B…`, `Metade positiva…`, `Planejada SEM lote vale qualquer lote…`, `origem_automatica…` (Etapa 63) |
| Acima do separado pendente, o pendente sai da origem separada (estrita) e o excedente pelo automático — também com série+lote e cruzando a reserva | `substituicaoOrigem.api.test.js` — `Fase 2 (critico)…`, `Fase 5 (critico): material com SERIE e lote…`, `Fase 5: divisao com RESERVA parcial…` (Etapa 63) |
| A rodada de separação que apaga a origem planejada (outro par, automático, vários pares, só lote) registra a troca com momento SEPARACAO; o mesmo par, sem planejada antes ou planejada já entregue não registram; rodada recusada não registra; falha do registro não derruba a rodada | `trocaSeparacao.api.test.js` — `RN-01 separou 5 de A…`, `RN-01 rodada AUTOMATICA…`, `RN-01 varios pares…`, `Metade positiva…`, `Rodada RECUSADA…`, `Fase 5: planejada SEM lote (A, —) e rodada (A, L1) e troca…`, `Fase 5: o INSERT da troca falhando…` (Etapa 65) |

## Dependências

- 03 (movimentação v2 para transferências internas) · 04 (status novos) · 02 (localizações virtuais) · leitura de código de barras fica para Etapa 15 (API deve aceitar campos de leitura desde já).


## Etapa 28 — a separação ganha dono e segunda conferência (2026-08-29, `9cef003..62cb2b1`)

Plano: `docs/superpowers/plans/2026-08-29-almoxarifado-etapa28-separacao-com-dono.md` (RN-01 a
RN-09, contratos C1-C6, fix-round). Design: `docs/superpowers/specs/2026-08-29-almoxarifado-etapa28-separacao-com-dono-design.md`.

**Entregue:** `separacoes_requisicao_almoxarifado` (append-only, uma linha por rodada, `itens_json`);
`conferido_por_id/_nome/_em` em `requisicoes_almoxarifado`; `separarRequisicao(db, id, itens, user)`
em **duas passadas** (valida tudo, depois grava — `5a3d593`); `conferirSeparacao` +
`claimConferencia` (exportado) + `assertConferidaSeObrigatorio` + `conferenciaObrigatoria`
(`material_critico = 1 && separado − entregue > 0`); rotas `conferir-separacao` (nova),
`liberar-retirada` e `entregar` com a barreira RN-06; auditoria `SEPARACAO`,
`CONFERENCIA_SEPARACAO`, `LIBERACAO_RETIRADA`; `GET /requisicoes/:id` com `separacoes`,
`conferencia`, `conferencia_obrigatoria`; tela (`RequisicoesList.js`, `75b5d3d`).

**O que a revisão adversarial achou (Fase 5) e virou código no fix-round `5a3d593`:** (1) o laço
de `separarRequisicao` gravava item a item antes de validar o próximo — **anterior à etapa**, mas a
barreira apoiada na rodada tornou isso um furo (item gravado sem rodada → quem separou conferia);
(2) `maxEntregar` (Etapa 3) solta o teto do separado depois de entrega parcial — para **crítico**
passou a valer `qty ≤ separado − entregue`; comum mantém; (3) `itens_tocados` sem teste; (4) a
releitura da conferência antes do UPDATE tinha janela — compare-and-clear; (5) universo de
"crítico" incluía crítico já entregue; (6) o teste de corrida aceitava conferência de B sem exigir
que a rodada de B a registrasse.

**Não virou código, declarado:** requisição separada antes da etapa não tem rodada (**C37**);
`dbGet` com `UPDATE ... RETURNING` roda fora da `writeChain` (**G9**, pré-existente em todo claim).


## Etapa 58 — a entrega de requisição diz de onde cada item sai (2026-09-30)

Plano: `docs/superpowers/plans/2026-09-30-almoxarifado-etapa58-origem-na-entrega.md`.

**Por que na ENTREGA e não na separação:** a separação é **lógica** — grava quantidade separada e a rodada, **não
move estoque**. O gesto que baixa o saldo, e portanto o que pode dizer "tirei de A", é a entrega. Registrar a origem
**planejada** na separação é a próxima etapa.

**Entregue:**
- [x] Origem por item na entrega (`localizacao_origem_id`, `lote_id`, `codigo_lido_origem` em `itens_atendidos`),
  repassada a todas as baixas do item (excedente e reservada) — `cec2b56`.
- [x] Origem **estrita**: o serviço recusa se o endereço (no lote) não cobre, e o motor ganha `origemEstrita` (4º
  argumento, nunca o body) com a checagem antes e depois da baixa, contra entregas simultâneas — `cec2b56`.
- [x] Validação de **todos** os itens com escolha antes da primeira baixa (endereço, lote do material, status e
  vencimento do lote, leitura, saldo somado por material/endereço/lote) — `cec2b56` + fix-round e9bca72.
- [x] Exclusão da requisição devolve **por saída** (mesmo lote; origem se ainda aceita o material, senão a padrão),
  agrupando por material, com todas as partes validadas antes da primeira devolução — `cec2b56` + fix-round e9bca72.
  **Toca a feature 04 (requisições).**
- [x] Devolução citando a saída herda o lote dela (Estoque/Quarentena) — `cec2b56` + fix-round e9bca72.
  **Toca a feature 12 (devoluções).**
- [x] Tela: "Sai de" e "Confirmar endereço lido" por item na janela de entrega; botão **"Entregar escolhendo de onde
  sai…"** ao lado do de um clique — `d18019f`.

**Fica de fora, declarado:** a entrega de um clique sem origem (**C80**); item sem escolha continua item a item
(**C81**); a janela não marca lote bloqueado/vencido nem endereço bloqueado (**D (58)**); série e divergência por item
(**D (58)**); a herança de lote no Retrabalho não tem teste (**D (58)**).

**A Fase 0 do plano estava errada** num ponto: dizia que não havia rota "onde este material está" — **havia**
(`GET /estoque/:materialId/saldos`); a rota nova planejada caiu.

**Testes:** `server/tests/api/entregaOrigemPorItem.api.test.js` 14/14; `client/.../RequisicoesEntregaOrigem.test.js` 10/10.

## Etapa 59 — a separação diz de onde cada item sai, e a entrega de um clique usa (2026-09-30)

Plano: `docs/superpowers/plans/2026-09-30-almoxarifado-etapa59-origem-na-separacao.md`.

**Entregue:**
- [x] Origem por item na **rodada de separação** (`localizacao_origem_id`, `lote_id` em `itens_separados`),
  validada na passada 1 (tudo ou nada) com a mesma regra da entrega — agora num helper só,
  `checarOrigemItem` —, gravada em `itens_json` e no item como **origem planejada**
  (`origem_separacao_id`, `lote_separacao_id`) — `11dcdb5`.
- [x] Rodadas com origens diferentes sobre separado pendente → planejada nula (automático) — `11dcdb5` (**B237**).
- [x] Entrega sem origem usa a planejada, até o separado ainda não entregue, validada antes da primeira baixa;
  `origem_automatica: true` a ignora; falha da planejada recusa com *"… a origem da separação (X) não serve mais
  (…) — entregue escolhendo de onde sai"*; entregue todo o separado, a planejada é limpa — `11dcdb5`. **Fecha o C80.**
- [x] A checagem da separação conta o separado pendente de **todos** os itens que planejaram o mesmo par; lote sem
  endereço não vira planejada — fix-round e2b7dab.
- [x] Detalhe da requisição traz `origem_separacao_codigo` / `lote_separacao_codigo` — `11dcdb5`.
- [x] Tela: "Sai de" na separação; na entrega, a planejada pré-selecionada só até o separado pendente; "Planejada da
  separação (X)" quando a busca de endereços falha; "separado de X" no detalhe — `29eb434` + fix-round e2b7dab.

**Fica de fora, declarado:** segunda rodada "sem mexer" no Sai de apaga a planejada sem aviso (**B237**, **D (59)**);
não há reserva por endereço (**B236**, **D (59)**); leitura de etiqueta na separação; série e divergência por item.

**Testes:** `server/tests/api/separacaoOrigemPorItem.api.test.js` 11/11; `client/.../RequisicoesSeparacaoOrigem.test.js` 14/14.

## Etapa 60 — separar menos do que dava passa a deixar registro, com o porquê (2026-09-30)

Plano: `docs/superpowers/plans/2026-09-30-almoxarifado-etapa60-divergencia-na-separacao.md`.

**O desenho mudou na revisão do plano:** a primeira versão **recusava** a rodada sem motivo quando se separava menos
que o possível. A Fase 2 derrubou isso — tornaria "divergência obrigatória" o parcial legítimo que esta feature já
entrega (várias viagens, o "Sai de" com uma origem por item em cada rodada, o "Ajustar Separação"), e 111 separações
parciais da suíte seriam recusadas. Ficou **só registro, motivo opcional** (**B238**).

**Entregue:**
- [x] A rodada grava, por item (agregado — o mesmo item duas vezes no payload é uma régua só), `maximo` (o separável
  na hora), `divergente` (`quantidade < maximo`, tolerância `1e-9`) e `motivo_divergencia` (opcional, trim, até 500) em
  `itens_json` e na auditoria `SEPARACAO` — `eea0687`.
- [x] O `maximo` desconta o que **outros itens do mesmo material** separam na mesma rodada; com uma origem só na
  rodada, é limitado ao saldo nela menos o separado ainda não entregue de quem planejou o mesmo par — **inclusive de
  outras requisições**; lote sem endereço limita pelo saldo do lote. O motivo escrito **nunca** é descartado (**B239**)
  — fix-round 1125a0f.
- [x] Tela: "Motivo da divergência (opcional)" no modal de separação abaixo do máximo (a mesma régua do servidor, sem
  as outras requisições); bloco "Separação (N)" com *"⟨material⟩: separou ⟨q⟩ de ⟨máximo⟩ — ⟨motivo⟩"* / *"— sem
  motivo informado"*, uma linha por item — `0486b9c` + fix-round 1125a0f.
- [x] Os dois testes da Etapa 28 que comparavam a rodada e a auditoria com `deepStrictEqual` comparam os campos de
  antes e exigem os novos (contrato aditivo), e voltam a provar que rodada **sem** origem não carrega origem/lote.

**Fica de fora, declarado:** a divergência não recusa, não avisa, não abre não conformidade nem ajusta (**B238**,
**D (60)**); separado **sem** endereço de outra requisição não sai do "livre" (a separação não reserva) — o máximo pode
sair maior que o real (**D (60)**); quantidade 0 não fica registrada (**D (60)**); **série** por item.

**Testes:** `server/tests/api/separacaoDivergencia.api.test.js` 7/7; `separacaoComDono.api.test.js` 11/11;
`client/.../RequisicoesSeparacaoDivergencia.test.js` 12/12.

## Etapa 61 — a entrega de material com série diz QUAIS séries saem (2026-09-30)

Plano: `docs/superpowers/plans/2026-09-30-almoxarifado-etapa61-serie-na-entrega.md`. Toca também as features **04**
(entrega e exclusão de requisição) e **10** (séries — onde a pendência (a) de série é **corrigida à vista**: a
isenção da entrega era o defeito, não uma decisão de escopo).

**O defeito, medido por sonda:** material com série, entrada de 3 séries, entrega de 2 pela rota → **200**; físico
**1**, séries em estoque **3**. O invariante `séries presentes == físico` quebrava a cada entrega, e a série entregue
podia sair de novo.

**Entregue:**
- [x] A entrega exige `serie_ids` para material com série (N == quantidade, inteira; séries do material, em estoque,
  sem repetição — nem entre itens —, de um lote só; o lote da saída vem das séries e tem de bater com o escolhido ou o
  planejado), validado antes de qualquer baixa; as séries se dividem entre as baixas (excedente + reservada) e o motor
  é chamado com `exigeSerie` — `6ba7429`, fix-round `77d084c`.
- [x] A exclusão da requisição devolve **por saída**, **líquido das devoluções**, com as séries daquela saída; saída
  legada sem série volta como antes; séries que não batem com o que falta devolver → recusa antes da 1ª ENTRADA —
  `6ba7429`, fix-round `77d084c`.
- [x] Regularização das séries (`POST /materiais/:id/series/regularizar`) para o legado — ver spec 10 — `6ba7429`,
  fix-round `77d084c`.
- [x] Tela: séries na janela de entrega (contador, confirmar travado até bater, lotes misturados barrados, recarga
  após erro); regularização na aba Séries de Lotes e Séries — `d74e5a8`, fix-round `77d084c`.
- [x] O teste `serieControleObrigatorio` "entrega continua isenta de série" foi **reescrito de propósito** (a isenção
  era o defeito).

**Fica de fora, declarado:** a entrega de um clique de material com série é **recusada** (a janela escolhe);
`AJUSTE`/inventário de material com série mudam o físico sem tocar em série (**C82** — a regularização é o remédio);
transferência não move a série (**C76**); a compensação da regularização só é exercitada em corrida (**D (61)**).

**Testes:** `server/tests/api/entregaSeriePorItem.api.test.js` 15/15; `serieControleObrigatorio.api.test.js` 8/8;
`client/.../RequisicoesEntregaSerie.test.js` e `LotesRegularizarSeries.test.js`.

## Etapa 63 — a troca da origem separada fica registrada na entrega (2026-10-01)

Plano: `docs/superpowers/plans/2026-10-01-almoxarifado-etapa63-substituicao-na-entrega.md`.

**O que estava calado (Fase 0):** a separação grava a origem planejada (Etapa 59), mas a entrega que saía de outro par
(origem no payload, que vence a planejada — **B235** —, ou `origem_automatica`) não deixava rastro, e a planejada é
limpa depois da entrega total. E acima do separado pendente **tudo** saía pelo automático (o livro podia dizer "saiu de
B" do que estava na caixa tirado de A).

**Entregue:**
- [x] Registro da troca em tabela própria, só de acréscimo (`substituicoes_origem_requisicao`: planejada e saída com
  endereço e lote, ids das movimentações, motivo opcional, autor) — um por item por entrega, quantidade
  `min(entrega, separado pendente)`; planejada sem lote compara só o endereço; o lote do automático vem do livro;
  gravado num `finally` (falha no meio do item também registra) — `3e022eb`, fix-round `4f008f2`.
- [x] Acima do separado pendente a baixa se **divide**: o pendente sai da planejada (estrita), o excedente pelo
  automático; o pedaço automático de item com série leva o lote das séries — `3e022eb`, fix-round `4f008f2`.
- [x] O detalhe da requisição traz `substituicoes`; a tela mostra o bloco "Substituições (N)", pede "Motivo da troca
  (opcional)" e avisa na dica do pendente que a entrega pode ser recusada — `e7f3afa`, fix-round `4f008f2`.

**Estava errado, dito à vista:** (1) o comentário da tela que dizia que o servidor "aplicava a planejada até o pendente
e completava automático acima" — até esta etapa, acima do pendente tudo saía automático (corrigido no código); (2) a
frase do commit `3e022eb` "nada que hoje passa é recusado" — acima do pendente a parte separada agora é estrita e pode
ser recusada (**B251**, **C84**).

**Fica de fora, declarado:** a troca na separação (**B248**); a troca de série; a rastreabilidade por lote ainda não lê
a tabela (feature 10); o registro não acompanha estorno/exclusão; a janela compara o lote da opção e o servidor o das
séries (**D (63)**).

**Testes:** `server/tests/api/substituicaoOrigem.api.test.js` 7/7 (7 sabotagens, 1 verde por guarda redundante —
declarada); `client/.../RequisicoesSubstituicaoOrigem.test.js` 16/16 (9 sabotagens).

## Etapa 64 — a fila de separação do almoxarife (2026-10-01)

Plano: `docs/superpowers/plans/2026-10-01-almoxarifado-etapa64-fila-de-separacao.md`.

**O que faltava (Fase 0):** o almoxarife trabalhava em `GET /api/almoxarifado/requisicoes` (`warehouseMode` em
`RequisicoesList.js`): ordem urgência e depois **a mais nova primeiro**, só o cabeçalho — nada por item. `?minha=1` é
"as minhas como **solicitante**", não "minha fila".

**Entregue:**
- [x] `GET /api/almoxarifado/fila-separacao` (gate `separar_emitir`), `requisitionService.listarFilaSeparacao` — **só
  leitura**: uma consulta de requisições, **uma** de itens (`IN`, o mesmo disponível de `carregarItensRequisicao`, com
  a reserva da própria requisição) e uma de separadores; não chama `verificarBloqueioLiberacao` — `fb06142`.
- [x] `etapas[]` por requisição: `SEPARAR` (algum item com `maxSeparar` > 0), `AGUARDANDO_SALDO`, `CONFERIR` (só em
  `EM_SEPARACAO`), `REABRIR_SEPARACAO` (só em `PODE_SEPARAR`), `CONFERENCIA_SEM_SAIDA` (fora dele, não acionável),
  `ENTREGAR` (algum item com `entregavel` = min(separado − entregue, disponível) > 0), `APROVACAO_VALOR` (avaliação ao
  vivo e só leitura, `avaliarRequisicaoValor`); `acionavel`, `separadores`, `posso_conferir` — `fb06142`, fix-round
  `42d7526`.
- [x] Ordem: acionável primeiro; urgência (`UPPER`: CRITICO, URGENTE, resto); data de necessidade (sem data por último);
  a mais antiga primeiro (**B252**) — `fb06142`.
- [x] Tela "Fila de separação" (menu depois de "Requisições (almox.)"; grupo "Aguardando" para as não acionáveis; um
  chip por etapa; por item "a separar X (separável agora Y) · a entregar Z (entregável agora E) · disponível D ·
  separado de …"; 403 vira painel de permissão; "Abrir" → `/almoxarifado/requisicoes?id=X`) — `88d943a`, fix-round
  `42d7526`.

**Estava errado, dito à vista:** o plano (Fase 2) e o commit `fb06142` descartaram a avaliação de valor ao vivo porque
"a avaliação escreve" — **falso**: `avaliarRequisicaoValor` só lê; quem escreve é `atualizarValorRequisicao` /
`verificarBloqueioLiberacao`. E o flag gravado nunca coincidia com status separável (**B255**).

**Fica de fora, declarado (D (64)):** lista como entidade, agrupamento e rota; "Abrir" abre o detalhe, não o modal de
separar; o menu aparece para todos com acesso ao módulo; `data_necessidade` legada em `DD/MM/AAAA` ordena errado; item
serializado sem séries em estoque aparece como entregável; a avaliação de valor é uma consulta por requisição.

**Testes:** `server/tests/api/filaSeparacao.api.test.js` 11/11 (14 sabotagens, todas vermelhas);
`client/src/components/almoxarifado/FilaSeparacao.test.js` 10/10 (11 sabotagens, todas vermelhas).

## Etapa 65 — a troca de origem NA SEPARAÇÃO fica registrada (2026-10-01)

Plano: `docs/superpowers/plans/2026-10-01-almoxarifado-etapa65-troca-na-separacao.md`.

**O que estava calado (Fase 0):** `separarRequisicao` apaga a origem planejada quando uma rodada nova nomeia outro par
(ou nenhum) sobre separado ainda não entregue (**B237**) — sem registro (**B248**, **D (63)**). E a janela de separação
abria com "Sai de" automático: a segunda rodada de um clique apagava a planejada de todo item (**D (59)**).

**Entregue:**
- [x] Registro da troca na separação — `substituicoes_origem_requisicao` ganha `momento TEXT NOT NULL DEFAULT 'ENTREGA'`
  (o legado e a entrega viram `ENTREGA`) e `separacao_id`; a rodada que termina sem a planejada que o item tinha
  **antes** dela (retrato tirado antes da passada 1, não o item mutado em memória) grava uma linha `SEPARACAO`:
  quantidade = o separado pendente planejado antes da rodada; saída = o par da rodada (um par só), nula com vários pares,
  `automatica = 1` sem nenhum par; só entradas com quantidade > 0 contam; motivo opcional `motivo_substituicao` (o
  primeiro não vazio, só texto, ≤ 500); `movimentacao_ids` nulo (separar não move estoque); gravado **depois** do INSERT
  da rodada (rodada recusada não registra), best-effort com `console.warn` — `5290ba8`, fix-round `75ff9a5`.
- [x] `listarSubstituicoes` devolve `momento` (`COALESCE(..., 'ENTREGA')`) — `5290ba8`.
- [x] Tela: a linha `SEPARACAO` do bloco "Substituições" não diz "saiu de" — *"⟨cód⟩: ⟨q⟩ já separados de ⟨A⟩[ — lote
  ⟨L⟩] · nova separação ⟨de B[ — lote L] | do lote L | sem origem (automática) | de mais de uma origem⟩ — a origem
  anterior deixou de valer[ · motivo]"*; a da entrega fica igual — `7d2a160`.
- [x] Tela: o "Sai de" da separação parte da planejada (par exato) quando ela está nas opções **e cobre** a quantidade
  sugerida (`maxSeparavelNaTela`); com quantidade > 0 e outro par (inclusive automático), o aviso *"A origem da separação
  anterior (⟨A⟩[ — lote ⟨L⟩]) deixa de valer: o que já está separado passa a sair automático na entrega."* e o campo
  "Motivo da troca (opcional)" — `7d2a160`, fix-round `4512b16`.

**Estava errado, dito à vista:** a Fase 2 deste plano mandou alinhar a separação à régua da entrega ("planejada sem
lote vale qualquer lote do endereço") e o commit `5290ba8` implementou — **estava errado**: só a **comparação** da troca
da entrega (Etapa 63) pensa assim; o saldo da origem, o `pedidoSeparacao` e o motor leem (A, sem lote) como "o saldo
sem lote em A", e a entrega de um clique de (A, —) + (A, L1) passou a ser recusada (*"O saldo em A (2) não cobre a
quantidade (6)…"*). Voltou o par exato em `75ff9a5`: (A, —) → (A, L1) apaga a planejada e registra a troca. A
afirmação do teste da Etapa 63 ("Planejada SEM lote vale qualquer lote") continua certa — é da **entrega**.

**Fica de fora, declarado (D (65)):** a troca de **série** (o item "Substituição de lote com registro" continua `[ ]`);
a planejada continua **uma só** por item (caixa mista = sem planejada — **B256**); saldos que falham ao carregar, ou
clique antes de eles chegarem, abrem em automático (a rodada troca, o aviso aparece e o servidor registra).

**Testes:** `server/tests/api/trocaSeparacao.api.test.js` 12/12 (8 sabotagens, todas vermelhas na asserção certa);
`client/src/components/almoxarifado/RequisicoesTrocaSeparacao.test.js` 19/19 (9 sabotagens vermelhas; a troca da guarda
`hasOwnProperty` por "truthy" pendura num laço de render — prova a guarda, mas não por asserção; inverter a ordem do
merge é equivalente e fica verde).

## Etapa 92 — a separação reivindica a requisição antes de gravar (2026-10-08)

Plano: `docs/superpowers/plans/2026-10-08-almoxarifado-etapa92-cancelar-outros-modulos.md`.

**O que estava errado (Fase 0, medido):** `separarRequisicao` gravava `EM_SEPARACAO` só no fim, com `WHERE id=?` — um
cancelamento que entrasse entre a leitura e esse `UPDATE` respondia 200 e a separação passava por cima: a requisição
"ressuscitava" em `EM_SEPARACAO` com a reserva já solta (50/50 pelo cancelamento do almoxarifado, 10/10 pelo dos outros
módulos, com gancho; 8/70 e 4/70 sem gancho). Esta spec não dizia nada sobre a separação conferir o status ao gravar —
**omissão, não afirmação errada**; fica dito aqui.

**Entregue:**
- [x] **Reivindicação antes de gravar** — `6a0b529c` (B436): depois da passada 1 e antes de `const tocados`, `UPDATE
  requisicoes_almoxarifado SET status='EM_SEPARACAO', updated_at=…, ultimo_lembrete_enviado=NULL WHERE id=? AND status
  IN (PODE_SEPARAR)`; `changes` 0 → `console.info` I2 e 400 com `MSG_STATUS_SEPARAR` (a literal de sempre, agora
  constante). O `else` do "Iniciar Separação" sem quantidade saiu (a reivindicação faz o que ele fazia). A
  reivindicação **não** limpa a conferência (só a rodada com quantidade limpa — D3 da 28). Testes RN-03 (as duas rotas de
  cancelamento × cinco status × com/sem quantidade, e pelo serviço).
- [x] **Falha depois de reivindicar devolve o status (RN-09)** — `6a0b529c`: as gravações depois da reivindicação num
  `try/catch`; sem rodada inserida e `reqRow.status !== 'EM_SEPARACAO'` → devolve o lido com `WHERE … AND
  status='EM_SEPARACAO'` e W2; relança sempre. **Fase 5 `f3b2b4fb`:** essa devolução apagava a separação concorrente que
  venceu (B reivindica e trava; A reivindica — `EM_SEPARACAO` está em `PODE_SEPARAR` —, grava a rodada, 200; B falha e
  devolvia o status → cancelável com material na caixa; 5/5) — agora `ultimaRodadaAntes = COALESCE(MAX(id),0)` é lido
  **antes** do `reqRow` e o `UPDATE` de devolução ganha `AND NOT EXISTS (rodada com id > marca)`; a guarda não devolveu
  → sem W2, relança. RN-09 (a)–(d).

**Fica de fora, declarado (D (92)):** os `UPDATE` do *compare-and-clear* da conferência (depois da rodada) regravam
`EM_SEPARACAO` sem guarda de status — uma exclusão administrativa no meio termina com a requisição excluída (`ativo=0`)
de volta a `EM_SEPARACAO` (achado 7 da Fase 5, reproduzido), e uma *liberar-retirada*/*entrega* concorrente da mesma
requisição não foi medida — **Etapa 93**; um "Iniciar Separação" sem quantidade concorrente não grava rodada e a guarda
da devolução não o vê; a guarda `AND status='EM_SEPARACAO'` da devolução não tem teste que a derrube. O que falta para
🟢 não mudou: lista de separação como entidade, agrupamento/rota de picking, troca de **série** registrada, localização
de kit e kits.

**Testes:** `server/tests/api/separacaoNaoRessuscita.api.test.js` 33/33 (RN-03, RN-04, RN-09; controles s1–s6 da T0
todos vermelhos na asserção prevista — o s3 sem quantidade caiu em "separação 400" antes de "gancho disparou", só ordem
das asserções); `cancelarOutrosModulosIntegracao.api.test.js` jornadas B1/B2 e o par de serviço.
