# 04 — Requisições de Materiais

> **Status:** 🟢 — Etapa 3 entregue (2026-08-05); ciclo ponta a ponta rascunho→entrega→confirmação→encerramento · **Spec original:** seção 5
> **Etapa 31 (2026-08-31, `1e6c9a9..67b6758`) — o NÚMERO deste documento mudou de forma, e só ele.** O `REQ-` era montado com os **últimos dígitos** do milissegundo mais um sorteio de 0 a 99, e por isso o carimbo **repetia** a cada **16,7 minutos** (era `slice(-6)`, o pior dos quatro). Agora vem do gerador único `services/almoxarifado/numeroDoc.js` (relógio inteiro em base36 + 8 aleatórios), com retry na colisão. **Nada mais desta feature mudou** — nem status, nem checklist, nem comportamento: o número passa de 12–14 caracteres só com dígitos para 20 com letras, os antigos **não** foram migrados e continuam legíveis (RN-05, testada). Furo **C41** das novidades.
> **Etapa 34 (2026-09-16, `746a106..054f727`) — o painel de detalhe da requisição ganhou ANEXOS.**
> Bloco "Anexos" no fim do painel, depois dos botões de ação, entidade `requisicao` com o `id` do
> **detalhe carregado** (não o da URL) — `d5578e6`, `a88d715`, `c5d9e99`. **Só no modo
> almoxarifado** (decisão **B71**): nas telas cross-módulo `/<modulo>/requisicoes-material` o bloco
> não aparece. Zero linhas de servidor. A frase "plugar aqui é uma linha", que esta spec repetia
> desde a Etapa 32, **estava errada** — ver a correção no item de checklist de anexos, que também
> registra o defeito **pré-existente** descoberto aqui (o clique carrega o detalhe 2x).
> **Última atualização:** 2026-09-16 (Etapa 34 — anexos no painel; antes: 2026-08-11, auditoria spec×código)

## Objetivo

Fluxo completo: rascunho → aprovação → disponibilidade → reserva → separação → conferência → entrega → confirmação → encerramento, com os 15 status e 14 tipos da spec.

## O que já existe

- Tabelas `requisicoes_almoxarifado` + `itens_requisicao_almoxarifado` (com `quantidade_solicitada/atendida/separada/entregue` — entrega parcial funciona).
- Duas APIs: `/api/almoxarifado/requisicoes` (`routes/almoxarifado.js` — `GET`/`POST /requisicoes`, `GET /:id`, e as ações `/enviar`, `/aprovar`, `/rejeitar`, `/aprovar-valor`, `/rejeitar-valor`, `/separacao` (+alias `/separar`), `/liberar-retirada`, `/entregar`, `/confirmar-recebimento`, `/encerrar`, `/copiar`, `/cancelar`, `DELETE` administrativa) e `/api/requisicoes-material` (`routes/requisicoesMaterial.js`, cross-módulo com whitelist por setor e sanitização de campos).
- Fluxo implementado: criar → aprovar/rejeitar → separação → entregar (parcial ok) → cancelar; delete admin com estorno de estoque.
- Aprovação por valor (`requisitionValueApprovalService.js`, limite configurável, aprovar-valor/rejeitar-valor).
- Notificações: e-mail ao almoxarifado na criação, e-mail a Compras para itens sem estoque, lembretes a cada 1 h (`requisitionReminderService.js`, log em `requisicao_lembretes_log`).
- Disponibilidade em lote: `POST /requisicoes-material/disponibilidade` + badge no front.
- Front: `RequisicoesList.js` (1.080 L, ações completas), `RequisicaoForm.js` (industrial), `RequisicaoMaterialCesta.js` (administrativa), configurado para 10 módulos-origem (`requisicoesMaterialConfig.js`).
- Campos existentes: solicitante, departamento, setor, os_referencia (texto), urgencia, prioridade, data_necessidade, justificativa, projeto_id, cliente_id, equipamento, valor_total; + Etapa 3: `tipo_requisicao`, `centro_custo_id`, `local_entrega`, `recebimento_confirmado_por/em`, `encerrado_por/em`.
- Testes de serviço: separação/entrega parcial em múltiplas rodadas, exclusão com estorno, lembretes, liberação por valor, filtro por setor.
- **Etapa 3 (2026-08-05) — item mais importante: entrega e estorno passaram a baixar/estornar estoque pelo motor (`stockService.registrarMovimentacao`)**, fechando o bypass de SQL cru anotado desde a Etapa 1 (`requisitionService.entregarRequisicao/excluirRequisicao`). Ganho: atomicidade (sem race condition entre entregas concorrentes do mesmo material), auditoria (toda baixa/estorno grava linha em `auditoria_log_almoxarifado`), saldo por localização (padrão do material, com bloqueio de localização respeitado) e vínculos estruturados na movimentação (`requisicao_id`, `projeto_id`, `centro_custo_id`; OS continua só como referência em texto — a requisição não tem `os_id`, só `os_referencia`). `maxEntregar` e o GET de detalhe passaram a calcular pelo **disponível** (físico − reservado/bloqueado/inspeção), não mais pelo físico — semântica nova de `saldo_atual` no front.
- **Etapa 4 (2026-08-06) — mudança que esta spec não contava (registrada na auditoria de 2026-08-11):** a entrega passou a **consumir a reserva da própria requisição**, dividindo a saída entre reserva e excedente sem reserva (`requisitionService.entregarRequisicao`); e separar/entregar somam o hold da própria requisição ao disponível — a própria reserva não barra mais a separação/entrega da requisição dona. Detalhes, decisões e testes na feature 07.
- Decisões de escopo confirmadas (ver `docs/superpowers/specs/2026-08-05-almoxarifado-etapa3-requisicoes-design.md`): aprovações ficam com regras fixas declarativas em código (tabela configurável fica para demanda real — ver feature 06); tipo de requisição é campo único de fluxo operacional único (fluxos específicos de EPI/ferramenta vêm com as features donas); confirmação de recebimento não é status novo, são campos (`recebimento_confirmado_por/em`) setáveis pelo solicitante em ENTREGUE/PARCIALMENTE_ATENDIDA/ENCERRADA.

## Checklist

### Validações e correções (fazer primeiro — bugs conhecidos)
- [x] `POST /requisicoes-material` **não validava `quantidade > 0`** — corrigido (Etapa 3, Task 1): `RequisicaoSchema` (Zod) valida quantidade > 0 nas duas rotas via `requisitionCreateService`
- [x] Validar material ativo e existente em cada item (Etapa 3, Task 1)
- [x] Unificar as duas rotas de criação num serviço único (Etapa 3, Task 1): `requisitionCreateService.createRequisicao(db, user, payload, { modulo })` consumido por `routes/almoxarifado.js` e `routes/requisicoesMaterial.js`

### Status faltantes (spec 5.4)
- [x] `RASCUNHO` (Etapa 3, Task 2 — `salvar_rascunho: true` na criação; rota `POST /:id/enviar` para RASCUNHO→PENDENTE)
- [x] `AGUARDANDO_ESTOQUE` / `AGUARDANDO_COMPRA` (Etapa 3, Task 2 — setados automaticamente na aprovação quando nenhum item tem disponível > 0; COMPRA quando há solicitação de compra pendente, senão ESTOQUE)
- [x] `PARCIALMENTE_RESERVADA` / `TOTALMENTE_RESERVADA` — **backend entregue na Etapa 4 (2026-08-05/06)**: `requisitionStateMachine` é dono das strings, e os status são gravados nas lanes `/aprovar` e `/aprovar-valor` junto com a reserva automática (ver feature 07). **Front só fechou em 2026-08-11 (`92fe236`)**: a Etapa 4 tinha deixado a tela de requisições sem esses status — badge cru, filtro sem as opções, botões "Iniciar Separação"/"Cancelar Requisição" invisíveis, stepper no fallback "Criar" — apesar de o item de front constar completo (ver nota na seção Frontend)
- [x] `PRONTA_PARA_RETIRADA` (Etapa 3, Task 2 — `PUT /:id/liberar-retirada`, exige ≥1 item separado)
- [x] `ENCERRADA` (Etapa 3, Task 5 — `PUT /:id/encerrar`, perfil `aprovar_requisicao`, bloqueia novas entregas e registra `encerrado_por/em`)
- [x] Máquina de estados explícita com transições válidas (Etapa 3, Task 2 — `requisitionStateMachine.js`, mesmo padrão do `movementRules`; transição inválida → 400)

### Funcionalidades faltantes (spec 5.5)
- [x] Tipo de requisição (14 tipos — spec 5.1) como campo estruturado (Etapa 3, Task 1 — `tipo_requisicao`, campo único com fluxo operacional único; decisão de escopo: fluxos específicos de EPI/ferramenta vêm com as features donas)
- [x] Campos: centro de custo, local de entrega (Etapa 3, Task 1 — `centro_custo_id`, `local_entrega`)
- [ ] Campos: ordem de produção (vínculo estruturado — hoje só via `tipo_requisicao = ORDEM_PRODUCAO`), gestor responsável
- [x] Anexos (desenho/documento — `anexos_documento_almoxarifado` já existe) — **`d5578e6`** + **`a88d715`** + **`c5d9e99`** (Etapa 34, 2026-09-16): bloco **Anexos** inline no fim do painel de detalhe, **depois** dos botões de ação, entidade `requisicao` com `detalhe.id` (o id do detalhe **carregado**, não o `selectedId` da URL — abrir outra requisição com o painel antigo na tela penduraria o arquivo no registro errado). **Aparece só no modo almoxarifado** (`a88d715`, decisão **B71**): a mesma `RequisicoesList.js` roda em seis módulos (comercial, frota, compras, financeiro, fábrica, engenharia) que não têm permissão do módulo, e ali o bloco pedia `GET /api/almoxarifado/anexos` → 403 "Acesso negado ao módulo" em vermelho dentro do painel, formulário de upload morto e uma linha de auditoria de acesso negado **por painel aberto**. *Era fora da Etapa 3 — deixou de ser.*
      **Etapa 32 (`e708125..fd71958`): o MECANISMO existe, está testado, e falta SÓ o plug desta
      tela.** A entidade é `requisicao`, já no mapa fechado do serviço.
      A `anexos_documento_almoxarifado` era **órfã** — zero leitor, zero escritor, sem índice —,
      e virou `services/almoxarifado/anexoService.js` (mapa fechado de seis entidades,
      existência do registro-pai verificada, soft delete, auditoria) mais as rotas
      `POST/GET/DELETE /almoxarifado/anexos` e `GET /almoxarifado/anexos/:id/arquivo`, esta com
      **download autenticado** — o arquivo NÃO é servido estaticamente. No client existe o
      componente genérico `client/src/components/almoxarifado/AnexosDocumento.js`.
      **Plugar aqui é uma linha** — `<AnexosDocumento entidade="CHAVE" entidadeId={id} />` — mais
      dois cenários de teste. **Ponto de atenção medido na Etapa 32:** confira QUANDO o `id`
      existe nesta tela. Na inspeção o plug teve de ir para a aba Histórico, porque a linha só
      nasce **depois** da decisão — anexar antes penduraria o arquivo num id inexistente.

      **⚠️ Correção da Etapa 34 (2026-09-16, `746a106..054f727`).** O parágrafo acima dizia que
      **"plugar aqui é uma linha"**; isso **ESTAVA ERRADO**. O certo, medido no design `6ccaf40` e
      confirmado na execução: esta tela era uma das **duas** (com Recebimentos) que tinham painel
      onde plugar inline — as outras três (Materiais, Devoluções, item de remessa) não tinham casa
      nenhuma e precisaram de uma casca de modal (`AnexosModal`, `746a106`) e de um botão por
      linha. E nem aqui foi uma linha, por **dois** motivos que só a execução mostrou: (1) o corpo
      do painel vivia dentro do ternário de `loadingDetalhe` (`RequisicoesList.js:876`), então ele
      **desmonta a cada refetch** — foco da janela, que é exatamente o que acontece ao FECHAR o
      diálogo de escolher arquivo; troca de filtro; ação de workflow — e o arquivo recém-escolhido
      sumia, mais um GET de anexos extra; o bloco teve de sair do ternário (`c5d9e99`); (2) a tela
      roda em seis módulos sem permissão do almoxarifado, e o bloco precisou do gate por
      `warehouseMode` (`a88d715`, B71). O texto da Etapa 32 fica acima **de propósito** — o
      mecanismo que ele descreve continua exato; errada era só a estimativa do custo do plug.

      **Defeito PRÉ-EXISTENTE descoberto ao medir isto (não é da Etapa 34, e continua aberto):**
      abrir o detalhe **pelo clique** carrega a requisição **duas vezes**. `abrirDetalhe` chama
      `syncSearchParams`, que reescreve `?id=` na URL, e isso reacende o efeito de deep-link
      (`RequisicoesList.js:166-181`), que chama `abrirDetalhe` de novo — dois `GET` de detalhe por
      clique, desde que o deep-link existe. Com o `c5d9e99` o **bloco de anexos** não remonta mais,
      mas o detalhe continua vindo 2x. É o item **(a) da Etapa 35**. Régua pronta: o cenário
      "RN-02: sem detalhe aberto não consulta anexos" (`RequisicoesList.test.js:528`) já mede o
      caminho do clique e já trava a **relação** (uma consulta de anexos por carga do detalhe,
      contagem `=== 1`); o que ele **não** trava é o número de `GET /almoxarifado/requisicoes/55`,
      hoje **2**, documentado no comentário do próprio cenário. Endurecer é contar esse GET e
      exigir `=== 1`.
- [x] Copiar requisição anterior (Etapa 3, Task 5 — `POST /:id/copiar`, gera novo RASCUNHO fiel com os mesmos itens/tipo/vínculos, sem quantidades entregues)
- [ ] Importar itens de lista técnica / ordem de produção (depende da feature 22) — fora da Etapa 3
- [x] Confirmação de recebimento pelo solicitante (fecha o ciclo) (Etapa 3, Task 5 — `PUT /:id/confirmar-recebimento`, só o solicitante, sem bypass de admin; campos `recebimento_confirmado_por/em`)
- [ ] Registrar lote/série entregue por item — **a dependência caiu (2026-08-11)**: a feature 10 (lotes) foi entregue na Etapa 6 (2026-08-09/10), então o item ficou implementável. Atenção: a entrega por requisição está deliberadamente **isenta** de `controle_lote` (decisão do review final de 2026-08-10 — ver spec 10); registrar lote na entrega exigiria dar à tela um campo de lote
- [x] Cancelar saldo não utilizado — coberto pelo encerramento (Etapa 3, Task 5: `ENCERRADA` bloqueia novas entregas a partir de ENTREGUE/PARCIALMENTE_ATENDIDA)
- [ ] Reprogramar saldo pendente (redistribuir/ajustar fino, além do cancelamento simples do encerramento) — fora da Etapa 3
- [ ] Assinatura digital na retirada (Etapa 15 — mobilidade; deixar campo previsto)
- [ ] Encerramento com e-mail de resumo — não implementado (`/encerrar` só audita e muda status, sem notificação)
- [ ] Rascunho nos módulos consumidores (rotas enviar/cancelar em /requisicoes-material + botões) — hoje exclusivo do almoxarifado

### Frontend
- [x] Novos status no `RequisicoesList.js` + `AlmoxPageHeader.js` (stepper `REQUISICAO_FLOW`) (Etapa 3, Task 6 — badges/filtros dos status e tipos novos, stepper com 6 passos). **Nota (2026-08-11): este item constava completo, mas ficou incompleto depois da Etapa 4** — os status `PARCIALMENTE/TOTALMENTE_RESERVADA` não entraram nas telas (badge cru, filtro sem as opções, botões "Iniciar Separação"/"Cancelar Requisição" invisíveis nesses status, stepper caindo no fallback "Criar"). Fechado em `92fe236`, com teste novo `client/src/components/almoxarifado/RequisicoesList.test.js` (badge, filtro, stepper, botões; controle positivo rodado)
- [x] Botão "copiar requisição" · confirmação de recebimento pelo solicitante (Etapa 3, Task 6)
- [ ] Anexos no form — fora da Etapa 3, e **continua desmarcado DE PROPÓSITO depois da Etapa 34**. Não é esquecimento: a 34 entregou o bloco de anexos no **painel de detalhe** (item "Anexos (desenho/documento)" acima, `d5578e6`), e anexar **durante a criação** foi cortado com motivo escrito — **RN-01 do design `6ccaf40`: o bloco só existe onde o registro já tem `id`**. No formulário a requisição ainda não foi gravada, então o arquivo seria pendurado num id inexistente. Fazer isso exige upload em duas fases (guardar o arquivo antes do registro e adotá-lo depois) ou um rascunho gravado antes do envio — **mudança de contrato do servidor**, etapa própria. Hoje o caminho é: gravar a requisição, abrir o detalhe, anexar

## Regras essenciais + testes de API exigidos

| Regra | Teste |
|-------|-------|
| Item com quantidade ≤ 0 é rejeitado (nas 2 rotas) | `[almoxarifado]`/`[requisicoes-material] quantidade 0 rejeitada — 400 (bug conhecido fechado)` + `quantidade negativa rejeitada — 400` (`requisicaoCriacao.api.test.js`) |
| Material inexistente/inativo é rejeitado | `[…] material inexistente/inativo — 400` (`requisicaoCriacao.api.test.js`) |
| Setor só requisita material da sua whitelist | regra mantida (whitelist em `requisicoesMaterialConfig.js`), coberta em `almoxarifado.test.js` (Filtro por setor); sem teste de API dedicado a "material fora do setor" nesta etapa |
| Transição de status inválida é rejeitada | `[separacao] RASCUNHO -> 400`, `[entregar] PENDENTE -> 400` (`requisicaoEstados.api.test.js`) |
| Entrega grava movimentação via motor (auditoria + disponível + localização) | `[entregar] grava movimentação SAIDA auditada e atualiza saldo por localização padrão` (`requisicaoEntregaMotor.api.test.js`) |
| Entrega bloqueada pelo disponível quando há reserva de terceiro | `[entregar] bloqueado pelo DISPONÍVEL quando há reserva de terceiro` (`requisicaoEntregaMotor.api.test.js`) |
| Entrega respeita localização bloqueada | `[entregar] localização padrão bloqueada → 400, saldo intacto` (`requisicaoEntregaMotor.api.test.js`) |
| Entregas concorrentes do mesmo material não estouram o saldo | `[entregar] entregas concorrentes de requisições distintas no mesmo material: só uma passa` (`requisicaoEntregaMotor.api.test.js`) |
| Delete/exclusão estorna estoque entregue pelo motor | `[excluir] estorna via motor: movimentação ENTRADA auditada e saldo restaurado` (`requisicaoEntregaMotor.api.test.js`) |
| Requisição acima do limite exige aprovação de valor | `Liberação por valor — acima do limite fica aguardando aprovação` (`almoxarifado.test.js`, suíte existente) |
| Encerramento bloqueia novas entregas e registra responsável | `[encerrar] perfil aprovar_requisicao (admin) em ENTREGUE -> 200 ENCERRADA, campos setados, auditado` + `[encerrar] PARCIALMENTE_ATENDIDA -> ENCERRADA e entregar depois -> 400` (`requisicaoCicloFinal.api.test.js`) |
| Confirmação de recebimento só pelo solicitante (sem bypass de admin) | `[confirmar-recebimento] outro usuário -> 403` + `admin que NÃO é o solicitante -> 403` + `pelo solicitante em ENTREGUE -> 200` (`requisicaoCicloFinal.api.test.js`) |
| Copiar gera RASCUNHO fiel (itens/tipo/vínculos), entregues zerados | `[copiar] gera novo RASCUNHO fiel (itens/tipo/vínculos), entregues zerados` (`requisicaoCicloFinal.api.test.js`) |
| Compat: fluxo criar→aprovar→separar→entregar continua verde | suítes existentes (`almoxarifado.test.js`, `test:api` completo — 22/22 arquivos) |

## Dependências

- 00 (harness) · 06 (motor de aprovações — segregação/emergencial/auditoria entregues na Etapa 3; regras configuráveis por tipo/valor/quantidade/projeto ficam para demanda real) · 07 (reservas para os status de reserva — Etapa 4) · 10 (lote/série na entrega).

## Entregue na Etapa 3 (2026-08-05)

Plano em `.superpowers/sdd/2026-08-05-almoxarifado-etapa3-requisicoes/` (8 tasks). Principais arquivos:

- Backend: `server/services/almoxarifado/requisitionCreateService.js` (criação unificada, Zod), `server/services/almoxarifado/requisitionStateMachine.js` (máquina de estados), `server/services/almoxarifado/requisitionService.js` (entrega/estorno via motor), `server/services/almoxarifado/schemas.js` (`RequisicaoSchema`, `EncerramentoSchema`), `server/routes/almoxarifado.js` e `server/routes/requisicoesMaterial.js` (rotas `/enviar`, `/liberar-retirada`, `/confirmar-recebimento`, `/encerrar`, `/copiar`, aprovar/rejeitar revisados para segregação).
- Frontend: `client/src/components/almoxarifado/RequisicoesList.js`, `RequisicaoForm.js`, `RequisicaoMaterialCesta.js`, `AlmoxPageHeader.js` (stepper), `requisicaoLabels.js` (labels compartilhados de tipo/status).
- Testes novos: `server/tests/api/requisicaoCriacao.api.test.js`, `requisicaoEstados.api.test.js`, `requisicaoEntregaMotor.api.test.js`, `requisicaoAprovacao.api.test.js`, `requisicaoCicloFinal.api.test.js`. Regressão completa verde: `test:api` (22/22 arquivos), `test:almoxarifado` (43), `test:validation` (4), `test:safealter` (3) + build do client.
- Não entregue nesta etapa (registrado como fora de escopo): anexos da requisição, assinatura digital (Etapa 15), importar de BOM/OP (feature 22), reserva automática e status de reserva (Etapa 4 — feature 07), lote/série na entrega (feature 10), tabela de regras de aprovação configurável + UI (feature 06 — fica para demanda real), transação atômica no loop de entrega com múltiplos itens (mid-loop partial failure documentado, não corrigido), encerramento com e-mail de resumo.
