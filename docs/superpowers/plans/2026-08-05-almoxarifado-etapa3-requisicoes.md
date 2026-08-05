# Almoxarifado Etapa 3 — Requisições Ponta a Ponta — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Requisições com máquina de estados completa (rascunho→…→encerrada), criação unificada com Zod (fecha o bug de quantidade ≤ 0), entrega/estorno passando pelo motor de estoque (fecha o bypass de SQL cru), aprovações com regras fixas (segregação, motivo, emergencial) e as ações novas no frontend.

**Architecture:** Design aprovado em `docs/superpowers/specs/2026-08-05-almoxarifado-etapa3-requisicoes-design.md` (LER PRIMEIRO — máquina de estados, dados, regras). Padrões da casa: máquina de estados declarativa (como `movementRules.js`), Zod via `validate(schema)`, colunas via `safeAlter`, PUT preserve-when-omitted (regra sistêmica da Etapa 2), motor único (`stockService.registrarMovimentacao`).

**Tech Stack:** Node/Express/sqlite3, Zod 4, supertest + `createTestApp`, React CRA (`client/`).

## Global Constraints

- Branch `desenvolvimento-almoxarifado`; nunca main. `backend/` e `src/` raiz = código morto.
- DDL/colunas SÓ em `server/services/almoxarifado/schema.js` (safeAlter). Runner caseiro; testes de API em `server/tests/api/*.api.test.js` com `createTestApp`.
- Zod em TODA rota tocada/criada; erros `{ error }` em português. **PUTs: preserve-when-omitted (undefined preserva; null explícito limpa)** — 5 ocorrências dessa classe de bug na Etapa 2; reviewers vão caçar isso.
- Regressão por task: `cd server && npm run test:api && npm run test:almoxarifado` verdes (17+ arquivos / 43 testes atuais).
- Commits 1/task, português, corpo terminando com `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

## Fatos do código (verificados 2026-08-05)

| Fato | Onde |
|---|---|
| Rotas de requisição do almoxarifado | `server/routes/almoxarifado.js`: GET lista :1685, aprovacoes-valor :1707, GET :id :1719, POST :1745, aprovar :1854, rejeitar :1866, aprovar-valor :1879, rejeitar-valor :1889, separacao/separar :1906-1908, entregar :1911, cancelar :1919, DELETE :1940, lembretes :1951, dashboard :1962 |
| Rota cross-módulo | `server/routes/requisicoesMaterial.js`: POST :308 (gera nº REQ-xxxxxx, whitelist por setor via `validateMateriaisParaSetor`, dispara notificação + purchase notify + avaliação de valor; **NÃO valida quantidade > 0** — itens gravados em :386-390) |
| Serviço de atendimento | `server/services/almoxarifado/requisitionService.js` (LIDO INTEGRAL): helpers num/getEntregue/getSeparado/maxSeparar/maxEntregar/normalizarItem; `separarRequisicao` :72-120 (status gate ['APROVADO','EM_SEPARACAO','PARCIALMENTE_ATENDIDA'], bloqueio por valor via `valueApprovalService.verificarBloqueioLiberacao`); `entregarRequisicao` :122-209 (**SQL cru read-then-write :164-175**: UPDATE quantidade_atual + INSERT movimentação tipo 'SAIDA' com motivo `Requisição <numero>`, referencia os_referencia, requisicao_id; valida por ESTOQUE FÍSICO via maxEntregar; status→ENTREGUE/PARCIALMENTE_ATENDIDA); `excluirRequisicao` :211-259 (**SQL cru ENTRADA :233-242**, seta ativo=0/CANCELADO) |
| Status atuais em uso | PENDENTE, AGUARDANDO_APROVACAO_VALOR, APROVADO, REJEITADO, EM_SEPARACAO, PARCIALMENTE_ATENDIDA, ENTREGUE, CANCELADO |
| Colunas atuais de requisicoes_almoxarifado | numero UNIQUE, solicitante_*, departamento, setor, os_referencia, urgencia, status, aprovador_*, rejeicao_motivo, projeto_id, cliente_id, equipamento, prioridade, data_necessidade, data_entrega, justificativa, modulo_origem, valor_total, requer_aprovacao_valor, aprovador_valor_*, ultimo_lembrete_enviado, ativo (`schema.js` blocos de requisição) |
| Motor | `stockService.registrarMovimentacao(db, user, params)` — atômico (RETURNING), auditoria, disponível, restrições de localização (E2-T2), regras de vínculo (SAIDA aceita justificativa/referencia), params incl. requisicao_id/os_id/projeto_id/cliente_id/centro_custo_id; retorna `{id, saldo_anterior, saldo_posterior}` |
| `getSaldoDisponivel(material)` = físico − reservado − bloqueado − inspeção | `stockService.js` topo |
| Aprovar/rejeitar atuais | handlers :1854/:1866 — UPDATE direto de status + aprovador_id/nome; **sem segregação, rejeitar sem motivo obrigatório** (verificar na implementação) |
| Notificações | `requisitionNotificationService` (criação), `requisitionPurchaseNotifyService` (itens sem estoque→Compras), `requisitionReminderService` (job 1h), `requisitionValueApprovalService` (limite por valor) |
| `solicitacoes_compra_almoxarifado` | material_id, status (pendente = sem pedido vinculado) — p/ regra AGUARDANDO_COMPRA |
| Auditoria | `registrarAuditoria(db, {entidade, entidade_id, acao, usuario_*, dados_*, justificativa})` de `services/almoxarifado/audit.js` |
| Front | `RequisicoesList.js` (1080 L: ações aprovar/rejeitar/separação/entregar/valor/excluir; badges por status), `RequisicaoForm.js` (industrial), `RequisicaoMaterialCesta.js` (cesta), `AlmoxPageHeader.js` (REQUISICAO_FLOW Criar→Aprovar→Separar→Entregar), config 10 módulos em `requisicoesMaterialConfig.js` |
| Centros de custo | `GET /almoxarifado/centros-custo` (E2-T1) p/ select |
| Harness | `createTestApp` → `{app, db, setUser, close}`; admin default; rotas de requisição do almoxarifado sob módulo (stub libera); `/api/requisicoes-material` sem gate de módulo |

## Decisões fechadas no design (não rediscutir)

Máquina de estados exata, tipos (14, default CONSUMO), colunas novas, regra AGUARDANDO_ESTOQUE/COMPRA na aprovação, confirmação como campos (não status), encerrar cancela pendências. Fora: anexos, assinatura, BOM/OP, reservas, lote/série.

---

### Task 1: Criação unificada com Zod + bug quantidade ≤ 0 + campos novos

**Files:**
- Create: `server/services/almoxarifado/requisitionCreateService.js`
- Modify: `server/services/almoxarifado/schema.js` (safeAlters: tipo_requisicao TEXT DEFAULT 'CONSUMO', centro_custo_id INTEGER, local_entrega TEXT, recebimento_confirmado_por INTEGER, recebimento_confirmado_em DATETIME, encerrado_por INTEGER, encerrado_em DATETIME; export `TIPOS_REQUISICAO` array com os 14 valores do design)
- Modify: `server/services/almoxarifado/schemas.js` (+`RequisicaoSchema`)
- Modify: `server/routes/almoxarifado.js:1745` e `server/routes/requisicoesMaterial.js:308` (ambas delegam ao serviço; contratos de resposta preservados)
- Test: `server/tests/api/requisicaoCriacao.api.test.js`

**Interfaces:**
- `createRequisicao(db, user, payload, { modulo, skipNotificacoes })` → `{ id, numero, status }`. Payload: setor, itens[{material_id, quantidade, observacoes}], tipo_requisicao?, centro_custo_id?, local_entrega?, projeto_id?, cliente_id?, os_referencia?, urgencia?, prioridade?, data_necessidade?, justificativa?, equipamento?, salvar_rascunho?. Valida: itens ≥1; **quantidade > 0**; material existe/ativo; whitelist por setor (reusar `validateMateriaisParaSetor` de `sectorMaterialService`); `tipo_requisicao ∈ TIPOS_REQUISICAO`; **EMERGENCIAL exige justificativa** (400 'Requisição emergencial exige justificativa'). `salvar_rascunho` → status RASCUNHO e NENHUM e-mail; senão fluxo atual (PENDENTE + notificação + purchase notify + avaliação de valor — mover as chamadas para dentro do serviço).
- `RequisicaoSchema` (Zod): usar `numFromForm` p/ ids/quantidades (lição E2-T4 — forms mandam strings); `itens: z.array(...).min(1)`; quantidade `z.number().gt(0, 'quantidade deve ser maior que zero')`.

- [ ] **Step 1 (RED):** testes — quantidade 0/negativa → 400 nas DUAS rotas (`/api/almoxarifado/requisicoes` e `/api/requisicoes-material`); sem itens → 400; EMERGENCIAL sem justificativa → 400 / com justificativa → 201; `salvar_rascunho: true` → 201 status RASCUNHO e (assert) NENHUMA linha em `requisicao_lembretes_log`/sem side effects verificáveis; criação normal → 201 PENDENTE com numero `REQ-`; campos novos persistidos (SELECT confirma tipo_requisicao/centro_custo_id/local_entrega); payload estilo form (strings) aceito.
- [ ] **Step 2:** rodar → RED (quantidade 0 passa hoje na rota cross-módulo; campos inexistentes).
- [ ] **Step 3:** implementar (extrair a lógica comum do POST :1745 e do POST :308 — numeração, INSERT, itens, notificações — para o serviço; as rotas ficam finas com `validate(RequisicaoSchema)`).
- [ ] **Step 4:** GREEN + regressão (suites de requisição existentes em `almoxarifado.test.js` intactas).
- [ ] **Step 5:** Commit — `Almoxarifado: criacao de requisicao unificada com Zod (quantidade > 0, tipos, rascunho)`

---

### Task 2: Máquina de estados + status novos

**Files:**
- Create: `server/services/almoxarifado/requisitionStateMachine.js`
- Modify: `server/routes/almoxarifado.js` (handlers aprovar/separação/entregar/cancelar usam o validador; rotas novas enviar/liberar-retirada)
- Modify: `server/services/almoxarifado/requisitionService.js` (gates de status via máquina)
- Test: `server/tests/api/requisicaoEstados.api.test.js`

**Interfaces:**
- `TRANSICOES` conforme o design (copiar exatamente); `validarTransicao(statusAtual, novoStatus)` → `{ok}|{ok:false, erro}`; `podeSepararDe(status)` etc. helpers.
- `POST /api/almoxarifado/requisicoes/:id/enviar` — RASCUNHO→PENDENTE, dispara as notificações que o rascunho pulou (reusar `createRequisicao`'s notification block — extrair `dispararNotificacoesCriacao(db, requisicaoId)` no createService T1).
- `PUT /api/almoxarifado/requisicoes/:id/liberar-retirada` — EM_SEPARACAO→PRONTA_PARA_RETIRADA; exige ≥1 item com quantidade_separada > 0 (400 senão).
- Regra pós-aprovação (no handler aprovar): calcular disponível dos itens (`getSaldoDisponivel`); se NENHUM item tem disponível > 0 → status vira AGUARDANDO_COMPRA (se existe `solicitacoes_compra_almoxarifado` com status pendente p/ algum material) senão AGUARDANDO_ESTOQUE; senão APROVADO normal. Separação permitida a partir de APROVADO/AGUARDANDO_* (máquina).
- Entregar aceita também a partir de PRONTA_PARA_RETIRADA.

- [ ] **Step 1 (RED):** testes — entregar PENDENTE → 400; separar RASCUNHO → 400; enviar rascunho → PENDENTE; aprovar requisição sem estoque em nada → AGUARDANDO_ESTOQUE; com solicitação de compra pendente → AGUARDANDO_COMPRA; separar de AGUARDANDO_ESTOQUE → ok; liberar-retirada sem separado → 400 / com separado → PRONTA_PARA_RETIRADA; entregar de PRONTA → ok; transição direta inválida (ex. PUT status? não existe rota — testar via ações).
- [ ] **Step 2-4:** RED → implementar → GREEN + regressão.
- [ ] **Step 5:** Commit — `Almoxarifado: maquina de estados de requisicao (rascunho, aguardando estoque/compra, pronta p/ retirada)`

---

### Task 3: Entrega e estorno via motor (fecha o bypass)

**Files:**
- Modify: `server/services/almoxarifado/requisitionService.js` (:145-175 entrega; :224-244 estorno; maxSeparar/maxEntregar por disponível)
- Test: `server/tests/api/requisicaoEntregaMotor.api.test.js`

**Interfaces:**
- `entregarRequisicao`: substituir o UPDATE+INSERT cru por `stockService.registrarMovimentacao(db, user, { material_id, tipo: 'SAIDA', quantidade, motivo: 'Requisição <numero>', referencia: os_referencia||numero, justificativa: 'Entrega requisição <numero>', requisicao_id, projeto_id: reqRow.projeto_id, cliente_id: reqRow.cliente_id, centro_custo_id: reqRow.centro_custo_id })` — o motor cuida de atomicidade/auditoria/disponível/localização; capturar erro do motor e propagar com contexto do item (nome do material na mensagem). O parâmetro `alertService` do serviço fica redundante para entregas (motor já dispara) — remover a chamada duplicada da entrega e manter no estorno? NÃO: o motor dispara em ambos; remover o bloco alertService de entregar E excluir (documentar).
- `excluirRequisicao`: estorno via motor `tipo: 'ENTRADA'` com motivo `Estorno exclusão requisição <numero>` e requisicao_id.
- `maxSeparar`/`maxEntregar` e `carregarItensRequisicao`: passar a expor/usar **disponível** (`quantidade_atual − reservada − bloqueada − em_inspecao`) no lugar do físico (SELECT ganha as colunas; helper `disponivelDe(materialRow)`). Front usa `saldo_atual` retornado — manter o nome do campo com o valor do disponível (documentar mudança semântica).
- ⚠️ Interações: motor valida regra de vínculo SAIDA ('qualquer' — justificativa sempre presente aqui, ok); localização: entrega sem localização explícita usa `localizacao_padrao_id` do material — se estiver BLOQUEADA (E2), entrega falha 400 (comportamento NOVO e correto; testar).

- [ ] **Step 1 (RED):** testes — entrega grava movimentação com auditoria (`auditoria_log_almoxarifado` entidade movimentacao) e saldo por localização padrão atualizado; entrega maior que DISPONÍVEL (com reserva de terceiro) → 400 e nada muda (hoje passa — RED prova); entregas concorrentes não estouram (2× Promise.all no mesmo item, uma falha); exclusão estorna via motor (movimentação ENTRADA auditada); entrega p/ material com localização padrão bloqueada → 400.
- [ ] **Step 2-4:** RED → implementar → GREEN + regressão (**atenção**: testes antigos de entrega parcial em `almoxarifado.test.js` — o serviço agora exige mais colunas no SELECT; rodar e ajustar SÓ se assertarem o contrato antigo do físico).
- [ ] **Step 5:** Commit — `Almoxarifado: entrega e estorno de requisicao pelo motor de estoque (auditoria, disponivel, atomicidade)`

---

### Task 4: Aprovações — regras fixas

**Files:**
- Modify: `server/routes/almoxarifado.js` (handlers :1854/:1866/:1879/:1889)
- Modify: `server/services/almoxarifado/requisitionValueApprovalService.js` (segregação na lane de valor, se o handler não centralizar)
- Test: `server/tests/api/requisicaoAprovacao.api.test.js`

**Interfaces:**
- Segregação: nas rotas aprovar e aprovar-valor, `if (Number(req.user.id) === Number(reqRow.solicitante_id)) → 403 'Solicitante não pode aprovar a própria requisição'` (aplicar TAMBÉM em rejeitar? NÃO — rejeitar a própria é legítimo (desistência); documentar).
- Rejeitar (`:1866` e `:1889`): motivo obrigatório → 400 'Motivo da rejeição é obrigatório' (Zod inline `z.object({ motivo: z.string().min(1) })`; gravar em rejeicao_motivo — verificar nome real da coluna).
- Auditoria: aprovar/rejeitar/aprovar-valor/rejeitar-valor registram `registrarAuditoria` entidade 'requisicao', acao APROVACAO/REJEICAO/APROVACAO_VALOR/REJEICAO_VALOR com justificativa=motivo quando houver.
- [ ] **Step 1 (RED):** testes — aprovar a própria → 403 (setUser com id == solicitante_id); aprovar de outro usuário → 200; idem lane valor; rejeitar sem motivo → 400 / com motivo → 200 e motivo gravado; decisões auditadas (SELECT auditoria).
- [ ] **Step 2-4:** RED → implementar → GREEN + regressão.
- [ ] **Step 5:** Commit — `Almoxarifado: aprovacoes com segregacao, rejeicao justificada e auditoria`

---

### Task 5: Confirmação de recebimento, encerramento e copiar

**Files:**
- Modify: `server/routes/almoxarifado.js` (3 rotas novas)
- Modify: `server/services/almoxarifado/requisitionCreateService.js` (copiar reusa criação)
- Test: `server/tests/api/requisicaoCicloFinal.api.test.js`

**Interfaces:**
- `PUT /requisicoes/:id/confirmar-recebimento` — SÓ o solicitante (`req.user.id === solicitante_id` senão 403); status ∈ {ENTREGUE, PARCIALMENTE_ATENDIDA, ENCERRADA}; seta recebimento_confirmado_por/em; idempotente (segunda chamada 400 'já confirmado').
- `PUT /requisicoes/:id/encerrar` — perfil `aprovar_requisicao` (requirePermission — importar o helper usado na extended? as rotas v1 não usam requirePermission; usar `can(req.user,'aprovar_requisicao')` de permissions.js com 403); de ENTREGUE/PARCIALMENTE_ATENDIDA → ENCERRADA (máquina T2); body motivo opcional; seta encerrado_por/em; **entregar após encerrada → 400** (gate da máquina em entregarRequisicao).
- `POST /requisicoes/:id/copiar` — cria NOVO RASCUNHO via `createRequisicao` com os mesmos itens (quantidade_solicitada, sem entregues), tipo/vínculos/setor copiados, solicitante = req.user; retorna novo id/numero.
- [ ] **Step 1 (RED):** testes — confirmar por outro usuário → 403; pelo solicitante → 200 e campos setados; confirmar duas vezes → 400; encerrar PARCIALMENTE_ATENDIDA → ENCERRADA e entregar depois → 400; encerrar por perfil PRODUCAO → 403; copiar → novo RASCUNHO com itens iguais e entregues zerados.
- [ ] **Step 2-4:** RED → implementar → GREEN + regressão.
- [ ] **Step 5:** Commit — `Almoxarifado: confirmacao de recebimento, encerramento e copiar requisicao`

---

### Task 6: Front — RequisicoesList com o ciclo completo

**Files:**
- Modify: `client/src/components/almoxarifado/RequisicoesList.js`
- Modify: `client/src/components/almoxarifado/AlmoxPageHeader.js` (REQUISICAO_FLOW + getRequisicaoStepIndex com os status novos)

**Interfaces:** consome as rotas T2/T4/T5. Badges/cores para RASCUNHO, AGUARDANDO_ESTOQUE, AGUARDANDO_COMPRA, PRONTA_PARA_RETIRADA, ENCERRADA (paleta `almox-badge-*` existente); coluna/filtro de `tipo_requisicao` (labels amigáveis); ações condicionais por status+papel: Enviar (RASCUNHO, solicitante/almoxarife), Liberar retirada (EM_SEPARACAO), Confirmar recebimento (ENTREGUE/PARCIAL, só quando `user.id === solicitante_id`), Encerrar (ENTREGUE/PARCIAL), Copiar (qualquer não-rascunho); modais de confirmação simples (padrão do estorno E1-T9); erros do servidor no toast. Stepper: Criar→Aprovar→Separar→Retirada→Entregar→Encerrar.
- [ ] **Step 1:** implementar. **Step 2:** `cd client && npm run build` + regressão server. **Step 3:** Commit — `Almoxarifado: lista de requisicoes com ciclo completo (rascunho a encerramento)`

---

### Task 7: Front — forms com tipo, vínculos e rascunho

**Files:**
- Modify: `client/src/components/almoxarifado/RequisicaoForm.js`
- Modify: `client/src/components/almoxarifado/RequisicaoMaterialCesta.js`

**Interfaces:** campo Tipo (select 14, default Consumo; labels amigáveis num map compartilhável no próprio arquivo), Centro de custo (`GET /almoxarifado/centros-custo`, opcional), Local de entrega (texto), botão "Salvar rascunho" ao lado de Enviar (`salvar_rascunho: true`); quando tipo = EMERGENCIAL, campo Justificativa vira obrigatório (required + hint). Cesta: versão mínima (tipo + rascunho; centro de custo/local de entrega só no form industrial — documentar no report).
- [ ] **Step 1:** implementar. **Step 2:** build + regressão. **Step 3:** Commit — `Almoxarifado: forms de requisicao com tipo, centro de custo, local de entrega e rascunho`

---

### Task 8: Specs + guia + fechamento

**Files:**
- Modify: `specs/modulo-almoxarifado/04-requisicoes/README.md`, `specs/modulo-almoxarifado/06-aprovacoes/README.md`, `specs/modulo-almoxarifado/README.md`
- Modify: `docs/almoxarifado-guia-etapas-e-testes.md` (seção Etapa 3: de "planejada" para "entregue" + roteiro de teste manual do ciclo completo)

Marcar `[x]` só com teste real (verificar); registrar decisões (aprovações fixas, tipos fluxo único, confirmação como campos); NÃO marcar o que ficou fora (anexos, reservas, BOM, assinatura, lote/série). Atualizar guia com roteiro: criar rascunho→enviar→aprovar (com outro usuário! testar segregação)→separar→liberar retirada→entregar→confirmar (como solicitante)→encerrar; casos de erro (aprovar a própria, rejeitar sem motivo, entregar com reserva de terceiro). Regressão completa (4 suites) + build client.
- [ ] **Step 1:** editar. **Step 2:** regressão. **Step 3:** Commit — `Almoxarifado: specs e guia atualizados (etapa 3 entregue)`

---

## Self-Review (feito na escrita)

1. **Cobertura das 11 regras do design:** quantidade>0 T1 · segregação T4 · rejeição motivo T4 · emergencial T1 · transições T2 · entrega via motor T3 · disponível T3 · encerrar T5 · confirmação T5 · copiar T5 · compat suites em toda task.
2. **Consistência:** `requisitionCreateService.createRequisicao`/`dispararNotificacoesCriacao` (T1) consumidos por T2 (enviar) e T5 (copiar); `TRANSICOES`/`validarTransicao` (T2) usados por T3/T5; `TIPOS_REQUISICAO` (T1) usado por T7.
3. **Riscos mapeados:** entrega bloqueada por localização padrão bloqueada é mudança de comportamento correta (testada T3); `saldo_atual` no front passa a ser disponível (semântica documentada T3); duas rotas de criação mantêm contratos de resposta (T1).
