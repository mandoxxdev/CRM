# Almoxarifado Etapa 16 — Alertas operacionais: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Registro declarativo de alertas (fonte única), 7 alertas novos pela fila e
varredura diária existentes, e a central de alertas ao vivo no front.

**Architecture:** `alertRegistry.js` declara cada alerta (condição `listar`, dedupe, config
de dias, textos); `varrerAlertasRegistrados` itera o registro e `enfileirar`a pela fila da
Etapa 12 (dedupe segura repetição); `GET /alertas/central` avalia o MESMO registro ao vivo
para a tela nova, gateada pela ação nova `ver_alertas`. A máquina do mínimo/zerado NÃO é
tocada.

**Tech Stack:** Express + SQLite, fila `notificationQueueService` (Etapa 12), React CRA.

**Spec:** `docs/superpowers/specs/2026-08-28-almoxarifado-etapa16-alertas-design.md`

## Global Constraints

- Harness `server/tests/helpers/testApp.js` com `requirePermission` REAL; testes só em
  `server/tests/api/*.api.test.js` com runner próprio.
- Teste que passa de primeira exige controle positivo (sabotagem medida).
- Commits em português sem acento, um assunto por commit, NUNCA `git add -A` na raiz.
- Mensagens literais dos contratos — teste compara texto exato.
- Client: `CI=true` build sem warning.
- **Motor de estoque, `alertService` (mínimo/zerado) e a máquina de estados existentes NÃO
  são tocados.**

## Regras de negócio (RN)

(Enunciado completo e cenários no design; IDs iguais lá e nos testes.)

| ID | Resumo |
|---|---|
| RN-01 | Registro é fonte única: varredura e central usam o MESMO `listar` |
| RN-02 | Varredura 2× no mesmo estado → 0 notificações novas (dedupe estável) |
| RN-03 | `alertas_estoque_notificar_email='0'` → varredura não enfileira nada |
| RN-04 | Central gateada por `ver_alertas` [ADMINISTRADOR, ALMOXARIFE, GESTOR, COMPRAS] |
| RN-05 | Central é ao vivo (condição resolvida some da central; a fila não encolhe) |
| RN-06 | Configs de dias validam inteiro ≥ 1 nos dois lados, mensagem literal C4 |
| RN-07 | Material de cliente fora de sem-consumo/excessivo; DENTRO do sem-endereço (régua e porquê do relatório homônimo — correção da revisão) |

## Contratos congelados

### C1 — `GET /api/almoxarifado/alertas/central`

Gate: `requirePermission('ver_alertas')`. Resposta 200:

```json
{ "alertas": [ { "chave": "CALIBRACAO_VENCENDO", "titulo": "...", "descricao": "...",
                 "dias": 30, "total": 3, "linhas": [ {<objeto cru da condição>} ] } ] }
```

- Ordem do array = ordem do `ALERT_REGISTRY`. `linhas` limitado a **50** (o `total` é o número
  cheio). `dias: null` quando o alerta não usa janela. 403 = padrão do `requirePermission`.
- Erro num `listar` individual não derruba a central: a entrada vem com
  `{ chave, titulo, erro: true, total: 0, linhas: [] }` e os demais alertas respondem
  (decisão: central parcial honesta em vez de 500 total).

### C2 — entrada do `ALERT_REGISTRY`

```js
{ chave, titulo, descricao,
  configDias: { chave, default } | null,
  listar: async (db, { dias }) => linhas,          // AO VIVO; a MESMA para varredura e central
  dedupeChave: (linha) => string,                   // estável (tabela C3)
  assunto: (linha) => string, corpo: (linha) => string }
```

### C3 — eventos e dedupe (1 alerta por...)

| Evento | Fonte | Config dias | dedupe_chave |
|---|---|---|---|
| `CALIBRACAO_VENCENDO` | `toolService.painelCalibracoes(db, dias)` → `[...vencidas, ...a_vencer]` | `alerta_calibracao_dias` (novo, 30) | `calibracao-<id>-<data_validade ?? 'sem-calibracao'>` |
| `ESTOQUE_SEM_CONSUMO` | `purchaseService.estoqueParado(db,'SEM_CONSUMO').itens` | `reposicao_dias_sem_consumo` (existente; NÃO semear de novo) | `sem-consumo-<material_id>-<AAAA-MM>` |
| `ESTOQUE_EXCESSIVO` | `purchaseService.estoqueParado(db,'EXCESSO').itens` | — | `excessivo-<material_id>-<AAAA-MM>` |
| `QUARENTENA_PARADA` | `inspectionService.listarInspecoesPendentes(db)` filtrado por `data_entrada` mais velha que `dias` | `alerta_quarentena_dias` (novo, 7) | `quarentena-<item_id>` |
| `MATERIAL_SEM_ENDERECO` | **a régua REAL do relatório** (`extended.js:1330-1343`): material `ativo=1` com `localizacao_padrao_id IS NULL` e `NOT EXISTS` saldo endereçado — **extrair a query para função compartilhada** usada pelo relatório E pelo registro (fonte única). **Inclui material de cliente de propósito** (comentário classe C no próprio relatório). **1 linha AGREGADA** `{ total, materiais: [até 20] }` | — | `sem-endereco-<AAAA>-W<semana ISO>` |
| `REQUISICAO_ATRASADA` | SQL: `date(data_necessidade) < date('now')` AND `COALESCE(ativo,1)=1` AND status no conjunto **DERIVADO** de `requisitionStateMachine.TRANSICOES`: `Object.keys(TRANSICOES)` menos `['RASCUNHO','ENTREGUE','ENCERRADA','CANCELADO','REJEITADO']` — literais do banco são masculinos (`APROVADO`), e os `AGUARDANDO_*`/`*_RESERVADA` são exatamente onde requisição atrasa. NUNCA hardcodar a lista (achado Crítico da revisão: `'APROVADA'` não existe e teste+SQL errariam juntos) | — | `req-atrasada-<requisicao_id>` |
| `RESERVA_PARADA` | SQL: reservas `status='ATIVA'` com `julianday('now')-julianday(created_at) > dias` OR `date(expira_em) < date('now')` | `alerta_reserva_parada_dias` (novo, 30) | `reserva-parada-<reserva_id>` |

Notas amarradas: `estoqueParado` já filtra `proprietario_cliente_id IS NULL` e `ativo=1`
(purchaseService.js:444) — RN-07 vem de graça nesses dois; o SQL de sem-endereço repete o
filtro explicitamente. `painelCalibracoes` devolve `dias_restantes` e inclui ferramenta que
NUNCA calibrou (`data_validade` null) em `vencidas` — o dedupe usa `'sem-calibracao'` nesse
caso. `varrerAlertasRegistrados(db)` devolve
`[{ chave, enfileiradas, duplicadas, sem_destinatario }]` para teste/log.

### C4 — configs novas e validação

Semear em `schema.js` (junto das configs, `INSERT OR IGNORE` — chave não semeada é
ineditável): `alerta_calibracao_dias`='30', `alerta_quarentena_dias`='7',
`alerta_reserva_parada_dias`='30'.

**Armadilha (corrigida pela revisão do plano):** `PREFIXOS_DIAS` em `routes/almoxarifado.js`
(PUT /configuracoes, linha ~1895) é `['reposicao_', 'alerta_lote_']` — as chaves novas NÃO
cairiam na validação. A primeira versão deste plano afirmava que ampliar para `'alerta_'`
pegaria `alertas_estoque_emails` por engano — **estava errada**: `'alertas_'` NÃO começa com
`'alerta_'` (o `_` na 7ª posição não casa com o `s`). Correção: **trocar `'alerta_lote_'`
pelo prefixo único `'alerta_'`** (cobre `alerta_lote_vencendo_dias` e as 3 chaves novas;
nenhuma chave `alertas_*` é atingida). O mesmo racional vale para o espelho do client
(Task 3). Mensagem literal (existente, conferida caractere a caractere em
`routes/almoxarifado.js:1911`):
`Configuração "<chave>" deve ser um número de dias maior que zero`.

### C5 — ação de perfil nova

`permissions.js`, `ACAO_PERFIS`: `ver_alertas: [ADMINISTRADOR, ALMOXARIFE, GESTOR, COMPRAS]`
(comentário: central expõe número de estoque e valor parado — PRODUCAO/ENGENHARIA/CONSULTA
fora, lição G1). Entra automaticamente em `GET /minhas-permissoes`.

## Sort topológico

| Task | Tipo | Depende de |
|---|---|---|
| 1. Registro + varredura + configs (backend) | **tronco** | — |
| 2. Central: ação `ver_alertas` + GET (backend) | **tronco** | Task 1 (consome o registro) |
| 3. Tela da central + configs no front | **galho** | contratos C1/C4 **+ Task 1** (ver nota) |
| 4. Integração: jornada condição→varredura→fila→central | integração | Tasks 1+2 |

Task 3 pode rodar em paralelo com a Task 2 (contrato C1 congelado); backend é sequencial.
**Nota (achado da revisão):** a T3 tem dependência REAL da T1 além do contrato — o teste de
paridade `configuracoesGerais.api.test.js` lê o arquivo da tela e reprova campo novo sem
seed+leitor no servidor; adicionar os 3 campos no client antes dos seeds da T1 deixa o
`test:api` vermelho. Ordem: T1 → (T2 ∥ T3) → T4.

---

### Task 1 (tronco): registro, varredura e configs

**Files:**
- Create: `server/services/almoxarifado/alertRegistry.js`
- Modify: `server/services/almoxarifado/notificationQueueService.js` (função
  `varrerAlertasRegistrados` + export), `server/services/almoxarifado/schema.js` (3 configs),
  `server/routes/almoxarifado.js` (PREFIXOS_DIAS ~1895 → prefixo `'alerta_'`; Job B
  ~2838-2848 inclui a varredura nova no `Promise.all`),
  `server/routes/almoxarifado/extended.js` (SÓ a extração da query do relatório
  `materiais-sem-endereco` (~1330-1343) para a função compartilhada — o GET da central é da
  Task 2)
- Test: `server/tests/api/alertaRegistro.api.test.js`

**Interfaces:**
- Consumes: `enfileirar` (notificationQueueService.js:63 — devolve
  `{enfileirada, id}|{enfileirada:false, motivo}`), `toolService.painelCalibracoes`,
  `purchaseService.estoqueParado`, `inspectionService.listarInspecoesPendentes`,
  `alertService.getConfigValue`/`parseList` (destinatários e toggle — mesmos guards das
  varreduras da Etapa 12: ver `varrerLotesVencendo:481` como molde), `dbAll`.
- Produces: C2 (`ALERT_REGISTRY`, `resolverDias(db, entrada)`), C3,
  `varrerAlertasRegistrados(db)` → `[{chave, enfileiradas, duplicadas, sem_destinatario}]`.

- [ ] **Step 1: teste que falha primeiro** — cenários (molde de setup: inserts diretos como
  nos testes de `requisicaoEntregaMotor`/`toolOcorrencia`; configurar
  `alertas_estoque_emails=["a@b.c"]` e o toggle antes):
  1. calibração vencida (ferramenta `exige_calibracao=1` + calibração `data_validade`
     ontem) → varredura enfileira `CALIBRACAO_VENCENDO`; RN-02: 2ª varredura → duplicadas=1,
     enfileiradas=0.
  2. requisição com `data_necessidade` ontem em status `APROVADO` (literal masculino do
     banco!) → `REQUISICAO_ATRASADA` enfileirada; outra em `AGUARDANDO_COMPRA` atrasada →
     também enfileirada; e uma **SEGUNDA requisição, distinta,** já `ENTREGUE` e atrasada →
     NÃO enfileira. (Achado da revisão: usar a MESMA requisição no negativo seria
     falso-verde — o dedupe `req-atrasada-<id>` mascararia o filtro de status. A prova do
     negativo é por requisição nova, e a Task 4 reprova pelo lado da central, sem dedupe.)
  3. reserva ATIVA com `created_at` 40 dias atrás (config 30) → `RESERVA_PARADA`; reserva
     de 10 dias → não.
  4. material sem endereço (material `ativo=1` com `localizacao_padrao_id IS NULL` e sem
     saldo endereçado — a régua REAL do relatório) → 1 notificação AGREGADA com `total` no
     corpo; material de cliente na mesma condição **CONTA** (RN-07 corrigida — mesma régua
     do relatório); material de cliente parado há 400 dias NÃO aparece em
     `ESTOQUE_SEM_CONSUMO` (RN-07, lado consumo).
     **Nota (achado da revisão):** materiais semeados sem movimentação caem AUTOMATICAMENTE
     em `sem_consumo`/`obsoleto` (`antigaOuNunca(null) === true`) — TODAS as asserções da
     suíte devem filtrar por `evento`/chave, NUNCA por total global da fila.
  5. material `quantidade_maxima=5, quantidade_atual=10` → `ESTOQUE_EXCESSIVO` (evento e
     dedupe do C3).
  6. quarentena: item com `quantidade_em_inspecao>0` e recebimento `created_at` 10 dias
     atrás (config 7) → `QUARENTENA_PARADA`; recebimento de ontem → não.
  7. RN-03: toggle `alertas_estoque_notificar_email='0'` → varredura devolve tudo zerado e
     fila vazia.
  8. C4: `PUT /configuracoes` com `alerta_calibracao_dias=0` → 400
     `Configuração "alerta_calibracao_dias" deve ser um número de dias maior que zero`;
     `=45` → 200 e a varredura passa a usar 45.
- [ ] **Step 2: rodar e ver falhar** (`node tests/api/alertaRegistro.api.test.js`).
- [ ] **Step 3: implementar** — `alertRegistry.js` com as 7 entradas C3 (SQL de
  requisição/reserva/sem-endereço escrito no registro; os demais delegando às funções
  existentes); `varrerAlertasRegistrados` com o toggle e destinatários no molde de
  `varrerLotesVencendo`; configs no schema; PREFIXOS_DIAS; Job B.
- [ ] **Step 4: verde + controle positivo** — sabotar o dedupe de `RESERVA_PARADA` para
  incluir `Date.now()` e ver RN-02 falhar; reverter. `npm run test:api` inteiro.
- [ ] **Step 5: commit** — `Almoxarifado Etapa 16 Task 1: registro de alertas e varredura pela fila`.

### Task 2 (tronco): ação `ver_alertas` + GET central

**Files:**
- Modify: `server/services/almoxarifado/permissions.js` (C5),
  `server/routes/almoxarifado/extended.js` (GET `/api/almoxarifado/alertas/central`)
- Test: `server/tests/api/alertaCentral.api.test.js`

**Interfaces:** Consumes: `ALERT_REGISTRY`/`resolverDias` (Task 1), `requirePermission`.
Produces: C1.

- [ ] **Step 1: teste que falha** — matriz de 8 perfis (RN-04; usuários com `role:'usuario'`,
  NUNCA `role:'admin'` — getPerfilFromUser resolve admin antes do perfil); shape C1 (ordem =
  registro, `dias` certo por alerta, `total` vs `linhas` com >50 linhas de requisição
  atrasada — total cheio, linhas 50); RN-05 (condição criada aparece; resolvida some;
  a fila NÃO encolhe); RN-01 (o `total` da central bate com `enfileiradas+duplicadas` da
  varredura no mesmo estado); **`erro:true` VERSIONADO** (achado da revisão): a lógica da
  central vive em `montarCentral(db, registro = ALERT_REGISTRY)` exportada com o registro
  **injetável** — o teste passa um registro com um `listar` que lança e prova central 200,
  entrada `{chave, titulo, erro:true, total:0, linhas:[]}` e as demais entradas respondendo.
- [ ] **Step 2: rodar e ver falhar.**
- [ ] **Step 3: implementar; verde; controle positivo** — sabotar `ver_alertas` incluindo
  PRODUCAO e ver a matriz falhar; reverter. (O `erro:true` já tem teste versionado via
  registro injetável — Step 1; nenhuma sabotagem manual necessária aqui.)
- [ ] **Step 4: `npm run test:api`; commit** — `Almoxarifado Etapa 16 Task 2: central de alertas gateada por ver_alertas`.

### Task 3 (galho): tela da central + configs no front

**Files:**
- Create: `client/src/components/almoxarifado/AlertasAlmoxarifado.js` (+ teste)
- Modify: `client/src/routes/lazyModules.js`, `client/src/App.js` (route `alertas`),
  `client/src/components/Layout.js` (item `{ path: '/almoxarifado/alertas',
  icon: FiAlertTriangle, label: 'Alertas' }` antes de Notificações),
  `client/src/components/almoxarifado/ConfiguracoesAlmoxarifado.js` (3 campos novos de dias
  no padrão dos campos `reposicao_*` existentes (~linha 2701) **E o espelho client de
  `PREFIXOS_DIAS` em `handleSalvar` (~linhas 2756-2757): trocar `'alerta_lote_'` por
  `'alerta_'`, a MESMA decisão do C4** — sem isso o front não barra `0` e a RN-06 "nos dois
  lados" falha (achado da revisão))

**Interfaces:** Consumes: C1 (mock de fronteira HTTP), C4,
`useAlmoxPermissoes().pode('ver_alertas')`, padrão de painel-de-permissão-por-aba da tela de
Reposição (`ReposicaoAlmoxarifado.js` — o Critical da E11: 403 nunca vira tela vazia).

- [ ] **Step 1: teste que falha** — com fetch mockado no contrato C1: um cartão por alerta na
  ordem, badge `total`, `dias` exibido quando não-null, expandir mostra linhas, entrada com
  `erro:true` mostra aviso de erro (não some), 403 renderiza painel de sem-permissão (mock
  rejeitando com response.status 403), NUNCA "nenhum alerta" no 403; configs: os 3 campos
  aparecem e recusam 0 antes do submit.
- [ ] **Step 2: implementar; suíte client + build `CI=true`; commit** —
  `Almoxarifado Etapa 16 Task 3: tela da central de alertas`.

### Task 4 (integração): jornada real

**Files:** Test: `server/tests/api/alertaJornada.api.test.js`

- [ ] **Step 1: jornada** — semear 3 condições reais (calibração vencida; requisição
  atrasada; reserva parada) → `varrerAlertasRegistrados` → fila com os 3 eventos
  (`dbAll` na `fila_notificacoes_almoxarifado`) → `GET /alertas/central` com os 3 totais ≥1 →
  resolver a requisição (entregar de verdade pela rota, motor real) → central mostra
  requisição atrasada a menos; a fila NÃO encolheu (RN-05) → 2ª varredura → 0 novas (RN-02
  ponta a ponta).
- [ ] **Step 2: rodar; controle positivo se passar de primeira** (sabotar o status-set do
  SQL de requisição atrasada incluindo `'ENTREGUE'` e ver o passo "a menos" falhar;
  reverter). `npm run test:api` inteiro; commit —
  `Almoxarifado Etapa 16 Task 4: jornada de integracao dos alertas`.

---

## Self-review do plano (feito na escrita)

- Cobertura: registro (T1), varredura+7 alertas (T1), central back (T2), central front +
  configs (T3), jornada (T4); RN-01..07 têm teste nomeado. Correção da spec 20 (cortado/
  regra-do-motor) fica para a Fase 6 — fechar-etapa, não é task de executor.
- Sequência de tronco 1→2 porque a central consome o registro; T3 paraleliza com T2 por
  contrato congelado.
- Nenhum toque no motor de estoque nem no `alertService` (mínimo/zerado) — restrição global.
- Risco declarado: `estoqueParado` faz `slice(0,500)` — para a central isso é teto de
  linhas antes do nosso corte de 50; aceitável e declarado. O `listar` de sem-consumo/
  excessivo usa `.itens` (já filtrado por tipo).

## Execução (estado)

- [x] Fase 2 — revisão do plano por agente fresco (2026-08-28): 8 achados + 1 bloco de
  confirmações. **2 Críticos acatados:** status de requisição com literais inexistentes
  (`APROVADA` → derivar de `requisitionStateMachine`, incluindo os `AGUARDANDO_*` — teste e
  SQL errariam juntos, falso-verde de produção) e régua do sem-endereço divergente do
  relatório homônimo (adotada a régua REAL por função compartilhada; material de cliente
  ENTRA de propósito — RN-07 corrigida no design dizendo que estava errada). Demais:
  negativo de requisição atrasada por SEGUNDA requisição (dedupe mascarava o filtro),
  justificativa falsa do prefixo corrigida (prefixo único `'alerta_'` é seguro — `alertas_`
  não casa), espelho client de PREFIXOS_DIAS na T3, dependência T3→T1 pelo teste de
  paridade das configs, `erro:true` versionado via registro injetável, asserções sempre por
  evento (materiais de teste caem em sem_consumo automaticamente). A revisão foi
  interrompida pelo limite de sessão no meio e retomada com contexto intacto.
- [ ] Task 1 (tronco)
- [ ] Task 2 (tronco)
- [ ] Task 3 (galho)
- [ ] Task 4 (integração)
- [ ] Fase 4 — suíte completa serial
- [ ] Fase 5 — revisão adversarial (2 lentes)
- [ ] Fase 6 — fechar-etapa + retro

## Retro (4 números — preencher no fechamento)

- Rodadas de correção até verde: —
- Achados da revisão: reais — / ruído —
- Paralelismo real: —
- Defeito que escapou (preencher na etapa seguinte): —
