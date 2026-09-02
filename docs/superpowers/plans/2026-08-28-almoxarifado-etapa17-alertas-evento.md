# Almoxarifado Etapa 17 — Alertas de evento: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** 4 alertas novos (reprovado, divergência de recebimento, divergência de inventário,
lote sem certificado) — os 3 primeiros disparando NO ATO com rede de segurança na varredura,
o quarto por varredura pura; tudo pelo registro da Etapa 16.

**Architecture:** modo evento ADITIVO — a entrada do registro mantém `listar` (central +
varredura de rede) e o helper novo `dispararAlertaRegistrado` enfileira no ato com o MESMO
dedupe (duplo disparo vira DUPLICADA). Ganchos no padrão pós-commit da casa (try/catch →
console.warn; aviso NUNCA derruba o ato).

**Tech Stack:** os mesmos da Etapa 16.

**Spec:** `docs/superpowers/specs/2026-08-28-almoxarifado-etapa17-alertas-evento-design.md`

## Global Constraints

- Os da Etapa 16 (harness real, testes `server/tests/api/*.api.test.js`, controle positivo,
  commits pt sem acento, `CI=true` sem warning) +
- **Motor de estoque e máquina do mínimo/zerado intocados.** `divergencia.js` só muda no
  HEADER (declara o consumidor novo) — a função não muda.
- Asserções de fila SEMPRE por evento/hash, nunca total global (lição da 16).
- Ganchos chamam o helper **pelo objeto do módulo**
  (`notificationQueueService.dispararAlertaRegistrado(...)`, NUNCA desestruturado) — é o que
  permite o teste RN-02 stubar a função no cache de require.

## Regras de negócio (RN) — enunciado completo no design

| ID | Resumo |
|---|---|
| RN-01 | Dedupe idêntico nos 2 caminhos: ato → enfileira; varredura no mesmo estado → DUPLICADA |
| RN-02 | Gancho nunca derruba o ato (falha → console.warn; ato responde 200/201 e grava tudo) |
| RN-03 | Reprovado dispara só com `quantidade_reprovada > 0` |
| RN-04 | Divergência de recebimento nasce do REGISTRO da quantidade recebida (conferência OU fiscal) com `divergenciaRealSql` nos 2 caminhos; flags da inspeção FORA (declarado) |
| RN-05 | Inventário: 1 aviso AGREGADO por conferência, corpo SEM impacto_financeiro (B30) |
| RN-06 | Sem certificado: varredura pura AGREGADA (1 resumo/mês), régua `COALESCE(TRIM(certificado_arquivo),'')=''` + saldo>0 |
| RN-07 | Toggle mestre governa os DOIS caminhos (gancho e varredura); a central segue ao vivo |

## Contratos congelados

### C1 — `dispararAlertaRegistrado(db, chave, linha)`

Em `notificationQueueService.js` (export novo; requires lazy — ciclo documentado em
`alertRegistry.js:9-13`). Comportamento: entrada inexistente → lança
`Error('Alerta desconhecido: <chave>')` (bug de programação, o try/catch do gancho engole e
loga); toggle mestre off → `{ enfileirada: false, motivo: 'DESLIGADO' }`; senão aplica
destinatários `alertas_estoque_emails` + `escapeHtml` linha a linha (idêntico à varredura) e
devolve o retorno de `enfileirar` (`{enfileirada:true,id}` | `{enfileirada:false,
motivo:'DUPLICADA'|'SEM_DESTINATARIO'}`).

### C2 — as 4 entradas novas do `ALERT_REGISTRY` (ordem: após as 7 existentes)

| Chave | `listar` (ao vivo) | configDias | dedupeChave |
|---|---|---|---|
| `MATERIAL_REPROVADO` | `listarReprovados(db, { dias | inspecaoId })` — **dual-mode exportado** (a MESMA query com JOIN item→material→recebimento; `{dias}` = janela por `data_inspecao` p/ central/varredura, `{inspecaoId}` = a linha do fato p/ o gancho). Campos: `inspecao_id, material_codigo, material_nome, quantidade_reprovada, encaminhamento, recebimento_numero, nota_fiscal, data_inspecao, responsavel_nome`. payload `{inspecao_id}` | `{ chave: 'alerta_eventos_janela_dias', default: 7 }` | `` (l) => `reprovado-${l.inspecao_id}` `` |
| `DIVERGENCIA_RECEBIMENTO` | `listarDivergenciasRecebimento(db, { dias | recebimentoId })` — **dual-mode exportado**: itens `quantidade_recebida IS NOT NULL` AND `divergenciaRealSql('ri.quantidade_recebida - ri.quantidade_esperada')`; `{dias}` = janela por **`COALESCE(r.updated_at, r.created_at)`** (achado Crítico da revisão: `created_at` puro deixaria recebimento antigo conferido HOJE fora da central E da rede de segurança; o item não tem timestamp — limitação declarada), `{recebimentoId}` = os itens divergentes daquele recebimento p/ os ganchos. Campos: `item_id, material_codigo, material_nome, quantidade_esperada, quantidade_recebida, divergencia, recebimento_numero, nota_fiscal`. payload `{item_id, recebimento_id}` | idem (mesma chave) | `` (l) => `receb-diverg-${l.item_id}-${l.quantidade_recebida}` `` **(a quantidade entrou na chave no fix-round da Fase 5 — achado A1: sem ela, errar de novo e PIOR ficava calado)** |
| `DIVERGENCIA_INVENTARIO` | `listarDivergenciaConferencia(db, { dias | conferenciaId })` — dual-mode: conferências `status='CONCLUIDO'` com item `divergenciaRealSql('ic.divergencia')`, `data_fim` na janela, AGREGADO (campos: `conferencia_id, numero, data_fim, itens_divergentes`; SEM impacto_financeiro). payload `{conferencia_id}` | idem (mesma chave) | `` (l) => `inv-diverg-${l.conferencia_id}` `` |
| `LOTE_SEM_CERTIFICADO` | lotes de material `ativo=1` com `controle_certificado=1`, `certificado_arquivo IS NULL`, saldo>0 (subquery de `estoque_saldo_almoxarifado` — molde `varrerLotesVencendo`, notificationQueueService.js:492-502; filtro de saldo em JS como lá) (campos: `lote_id (l.id), codigo (do lote), material_codigo, material_nome, saldo, status`). payload `{lote_id}`. **NÃO copiar o filtro `l.status='ATIVO'` do molde** — o lote sem certificado NASCE `BLOQUEADO` (receiptService.js:471 + lotService.js:113-136); copiar o filtro cegaria o alerta para o caso principal (achado da revisão). **Fix-round da Fase 5 (achado A2, medido em 1000 e-mails): virou UMA linha AGREGADA `{ total, lotes: até 20 }`, no padrão do sem-endereço, e a régua usa `COALESCE(TRIM(certificado_arquivo),'')=''`** | `null` | `` () => `sem-certificado-${mesAtual()}` `` (1 resumo por mês) |

`listarDivergenciaConferencia(db, { dias, conferenciaId })` é exportada pelo registro: com
`dias` filtra janela (uso do `listar`); com `conferenciaId` devolve só aquela conferência
(uso do gancho) — **a MESMA query** (régua única; a conclusão de conferência é inline na
rota e sem isso nasceriam duas definições de "conferência divergente").

### C3 — config nova

`schema.js` (array de seeds, ~1823-1836): `['alerta_eventos_janela_dias', '7', 'Janela em
dias que os alertas de evento (reprovado, divergencias) mostram na central']`. Prefixo
`alerta_` já validado nos dois lados (Etapa 16) — nada a mudar em PREFIXOS_DIAS nem no
espelho client; o campo novo entra na tela de Configurações (Task 3) no padrão dos 3 da 16.

### C4 — ganchos (pontos exatos, padrão pós-commit try/catch → console.warn)

1. `inspectionService.decidirInspecao` — após o INSERT da inspeção (~131, antes do return):
   se `reprovada > 0`, buscar a linha por `listarReprovados(db, { inspecaoId: ins.lastID })`
   e disparar. (Correção da revisão: a versão anterior mandava "montar a linha dos dados
   locais" — os campos do C2 NÃO estão carregados ali; o dual-mode é a régua única.)
2. **DOIS pontos** em `receiptService` (correção da revisão: a UI nunca chama a rota de
   conferir — o fluxo real escreve `quantidade_recebida` por `PUT /recebimentos/:id/fiscal`
   → **`salvarDadosFiscal`**): após o loop de UPDATE de `conferirRecebimento` (~155-165) E
   após o de `salvarDadosFiscal` (~279-308), o MESMO bloco: buscar
   `listarDivergenciasRecebimento(db, { recebimentoId })` e disparar por item retornado.
   NUNCA refazer a comparação em JS (segunda régua) — a query compartilhada é a régua.
   **(Correção da Task 2: este contrato dizia `atualizarDadosFiscais`, função que NÃO EXISTE
   no código — o nome real é `salvarDadosFiscal`, `receiptService.js:213`. O ponto do gancho
   estava certo; só o nome estava errado. Corrigido aqui e no design para o próximo não
   procurar uma função inexistente.)**
3. `routes/almoxarifado.js` PUT `/conferencias/:id/concluir` — junto do gancho existente da
   linha ~1208: `listarDivergenciaConferencia(db, { conferenciaId: id })` → se veio linha,
   dispara `DIVERGENCIA_INVENTARIO`.

## Sort topológico

| Task | Tipo | Depende de |
|---|---|---|
| 1. Registro: 4 entradas + helper + config (backend) | **tronco** | — |
| 2. Ganchos nos 3 atos (backend) | **tronco** | Task 1 |
| 3. Colunas das 4 chaves no client + campo de config | **galho** | contratos C2/C3 **+ Task 1 no repositório** (o teste de paridade `configuracoesGerais.api.test.js` lê o arquivo da tela e exige seed+leitor do servidor; e não mudar a FORMA literal do bloco `const CAMPOS = [...]` — o parser do teste depende dela) |
| 4. Integração: jornada ato→fila→central→varredura | integração | Tasks 1+2 |

---

### Task 1 (tronco): 4 entradas + `dispararAlertaRegistrado` + config

**Files:**
- Modify: `server/services/almoxarifado/alertRegistry.js` (4 entradas +
  `listarDivergenciaConferencia` export), `server/services/almoxarifado/notificationQueueService.js`
  (helper C1 + export), `server/services/almoxarifado/schema.js` (seed C3),
  `server/services/almoxarifado/divergencia.js` (SÓ o header: declarar o consumidor novo)
- Test: `server/tests/api/alertaEvento.api.test.js`

**Interfaces:** Consumes: `divergenciaRealSql`/`EPSILON_DIVERGENCIA` de `divergencia.js`;
molde de subquery de saldo de lote em `notificationQueueService.js:492-502`; `mesAtual()` e
`resolverDias` do próprio registro; `enfileirar`. Produces: C1, C2, C3.

- [x] **Step 1: teste que falha** (c1cd0a1) — cenários (setup por INSERT direto nos moldes dos testes
  da 16; asserções por evento/hash):
  1. `LOTE_SEM_CERTIFICADO`: lote de material com
     `controle_certificado=1` sem certificado e COM saldo → varredura enfileira — **o lote
     do cenário nasce com `status='BLOQUEADO'`** (o caso principal real; controle positivo
     contra a cópia cega do filtro `status='ATIVO'` do molde — achado da revisão); mesmo lote
     com `certificado_arquivo` preenchido → fora; lote sem saldo → fora; material de
     cliente? (o lote herda material — material de cliente com controle de certificado
     ENTRA ou sai? DECISÃO: entra — certificado é rastreabilidade, dono não importa;
     registrar); RN-06 re-lembrete: dedupe carrega o mês.
  2. `MATERIAL_REPROVADO` via `listar`: inspeção com `quantidade_reprovada>0` de ontem →
     na central/listar; com `quantidade_reprovada=0` → fora (RN-03 lado listar); com
     `data_inspecao` 10 dias atrás e janela 7 → fora; janela configurada para 15 via PUT →
     dentro.
  3. `DIVERGENCIA_RECEBIMENTO` via `listar`: item `esperada=10, recebida=8` → dentro;
     `recebida=10` → fora; `recebida NULL` → fora; `recebida=10.0000000001` → FORA
     (float-safe, prova que usa `divergenciaRealSql`); recebimento CRIADO 30 dias atrás mas
     com `updated_at` de hoje → DENTRO da janela 7 (a régua é COALESCE(updated_at,
     created_at) — achado Crítico da revisão); modo `{recebimentoId}` devolve os mesmos
     itens.
  4. `DIVERGENCIA_INVENTARIO` via `listar`: conferência CONCLUIDO com 2 itens divergentes →
     UMA linha com `itens_divergentes=2` (RN-05 agregação) e SEM campo `impacto_financeiro`;
     conferência EM_ANDAMENTO → fora; divergência 0 em todos → fora.
  5. C1: `dispararAlertaRegistrado(db, 'MATERIAL_REPROVADO', linha)` → `{enfileirada:true}`
     e a fila tem o evento; repetir com a MESMA linha → `DUPLICADA`; chave inexistente →
     lança `Alerta desconhecido: X`; toggle off → `{enfileirada:false, motivo:'DESLIGADO'}`
     e fila intacta (RN-07 lado gancho).
  6. RN-01: disparar no "ato" (helper) e depois `varrerAlertasRegistrados` no mesmo estado →
     a entrada reporta `duplicadas>=1, enfileiradas=0` para aquele evento.
- [x] **Step 2: rodar e ver falhar** (c1cd0a1) — vermelho real medido: **0 passed, 6 failed**
  (`listarReprovados/listarDivergenciasRecebimento/listarDivergenciaConferencia is not a
  function`; a varredura não devolvia entrada para `LOTE_SEM_CERTIFICADO`).
- [x] **Step 3: implementar** (c1cd0a1) — entradas na ordem C2; `divergencia.js` no topo do
  registro (só constantes/fórmula, sem ciclo — os requires lazy das entradas antigas ficaram
  como estavam); os 3 `listar` dual-mode exportados; helper C1 espelhando os guards da
  varredura.
- [x] **Step 4: verde + controle positivo** (c1cd0a1) — `alertaEvento.api.test.js` **6/6**.
  Sabotagem medida: `divergenciaRealSql` do `listar` de recebimento trocado por
  `ri.quantidade_recebida != ri.quantidade_esperada` → **5 passed, 1 failed**, exatamente o
  cenário 3 na asserção `10.0000000001 NAO pode listar`; revertido e verde de novo.
  `npm run test:api` → **129/129 arquivos OK** (inclui `configuracoesGerais` 15/15,
  `alertaRegistro` 10/10 e `alertaCentral` 5/5 da Etapa 16).
- [x] **Step 5: commit** (c1cd0a1) — `Almoxarifado Etapa 17 Task 1: 4 entradas de alerta e o
  disparo no ato`.

### Task 2 (tronco): ganchos nos 3 atos

**Files:**
- Modify: `server/services/almoxarifado/inspectionService.js` (gancho C4.1),
  `server/services/almoxarifado/receiptService.js` (gancho C4.2),
  `server/routes/almoxarifado.js` (gancho C4.3, junto de ~1208)
- Test: `server/tests/api/alertaEventoGanchos.api.test.js`

**Interfaces:** Consumes: C1 (SEMPRE via objeto do módulo — constraint global), rotas reais
`POST /recebimentos/itens/:itemId/inspecionar`, `PUT /recebimentos/:id/conferir`,
`PUT /conferencias/:id/concluir`. Produces: os 3 atos disparando.

- [x] **Step 1: teste que falha** (8eeaeea) — `alertaEventoGanchos.api.test.js`, 6 cenários (os 5
  do plano + o **2b** separado para a rota `/fiscal`, que é o achado Crítico). Por ato, pela
  ROTA real:
  1. inspecionar com reprovação → 200/201 do ato E `MATERIAL_REPROVADO` na fila (payload com
     a inspeção); inspecionar aprovando tudo → nada na fila (RN-03).
  2. conferir recebimento com item divergente → fila com `receb-diverg-<item_id>`; conferir
     sem divergência → nada.
  3. concluir conferência com divergência → UMA linha `inv-diverg-<id>`; concluir sem
     divergência → nada.
  4. **RN-02 versionado**: stubar
     `notificationQueueService.dispararAlertaRegistrado = () => { throw new Error('boom') }`
     (guardar e restaurar no finally) → repetir o ato 1 → o ato AINDA responde sucesso e
     grava a inspeção; fila sem o evento. (Funciona porque os ganchos chamam pelo objeto do
     módulo — se alguém desestruturar, este teste quebra e denuncia.)
  5. RN-07 ponta a ponta: toggle off → ato dispara nada; ligar → ato seguinte dispara.
- [x] **Step 2: rodar e ver falhar; implementar; verde** (8eeaeea) — vermelho real medido:
  **0 passed, 6 failed**, os seis na asserção "TINHA de enfileirar" (o ato acontecia, o aviso
  não). Implementados os 3 ganchos no padrão try/catch → `console.warn`
  (molde `stockService.js:1374-1405`), todos chamando o helper **pelo objeto do módulo** e
  buscando a linha pelo `listar` dual-mode. O ponto 2 do C4 é **`salvarDadosFiscal`** — o
  plano/design chamavam a função de `atualizarDadosFiscais`, nome que não existe no código
  (a rota `PUT /recebimentos/:id/fiscal` chama `receiptService.salvarDadosFiscal`); o **ponto**
  é o do plano, só o nome estava errado. Verde: **6/6**.
- [x] **Step 3: controle positivo** (8eeaeea) — **a sabotagem prescrita no plano é um no-op, e
  isso foi medido**: remover só o `if (reprovada > 0)` do gancho 1 deixa RN-03 **verde** (6/6),
  porque o `WHERE i.quantidade_reprovada > 0` do `listarReprovados` já barra; remover só o
  filtro da query também deixa verde (6/6), porque a guarda já barra. As duas defesas são
  independentemente suficientes. A sabotagem que prova a asserção: **as duas juntas fora** →
  **5 passed, 1 failed**, exatamente `RN-03: aprovacao total NAO pode enfileirar` (`1 !== 0`).
  Revertidas as duas (`git diff` de `alertRegistry.js` vazio); redundância declarada em
  comentário no `inspectionService`. `npm run test:api` → **130/130 arquivos OK**.
- [x] **Step 4: commit** (8eeaeea) — `Almoxarifado Etapa 17 Task 2: os tres atos passam a avisar`.

### Task 3 (galho): colunas das 4 chaves + campo de config no client

**Files:**
- Modify: `client/src/components/almoxarifado/AlertasAlmoxarifado.js` (COLUNAS_POR_CHAVE),
  `client/src/components/almoxarifado/AlertasAlmoxarifado.test.js` (fixture + asserts),
  `client/src/components/almoxarifado/ConfiguracoesAlmoxarifado.js` (campo
  `alerta_eventos_janela_dias`, padrão dos 3 da 16 — o prefixo já valida),
  `client/src/components/almoxarifado/ConfiguracoesGerais.test.js` (fixture da chave nova)

**Interfaces:** Consumes: C2 (campos por chave — colunas: reprovado
material/qtd reprovada/encaminhamento/recebimento/data; divergência receb.
material/esperada/recebida/divergência/recebimento; inventário
conferência/data/itens divergentes; sem certificado lote/material/saldo/status), C3.

- [ ] **Step 1: teste que falha** (fixture com as 4 chaves novas; colunas amigáveis
  renderizam; datas por `formatData` — DATE puro já é UTC-safe desde a 16); campo de config
  novo recusa 0 antes do submit.
- [ ] **Step 2: implementar; suíte client + build `CI=true`; commit** —
  `Almoxarifado Etapa 17 Task 3: colunas das 4 chaves na central`.

### Task 4 (integração): jornada ato→fila→central→varredura

**Files:** Test: `server/tests/api/alertaEventoJornada.api.test.js`

- [x] **Step 1: jornada** (e1f65c8) — `alertaEventoJornada.api.test.js`, 5 passos, **tudo por
  rota real**: `POST /recebimentos` de material crítico → workflow inteiro
  (`iniciar_conferencia` → `PUT /fiscal` → `finalizar_conferencia` → `encaminhar_compras` →
  `finalizar_compras` → `iniciar_faturamento`) → `POST /recebimentos/:id/processar` (entra
  RETIDO em quarentena) → `POST /recebimentos/itens/:itemId/inspecionar` reprovando 3 de 10 →
  fila tem `MATERIAL_REPROVADO` pelo hash E `GET /alertas/central` mostra o cartão (total≥1,
  `dias`=7, linha com a inspeção) → `varrerAlertasRegistrados` → `duplicadas>=1,
  enfileiradas=0` (RN-01) → `UPDATE data_inspecao` para -30 dias → central zera o cartão (ao
  vivo) e a fila **mantém** a linha (RN-05 da Etapa 16). Âncoras anti-falso-verde: o material
  sai com `quantidade_bloqueada=3` e `quantidade_em_inspecao=0` (o motor rodou; não houve
  INSERT na mão) e o recebimento **sem** divergência atravessa os 2 pontos de gancho sem
  enfileirar `DIVERGENCIA_RECEBIMENTO` (a jornada não gera aviso falso no caminho).
- [x] **Step 2: verde + controle positivo + commit** (e1f65c8) — **5/5 de primeira**, então
  controle positivo obrigatório: sabotar a janela do `listarReprovados` trocando
  `AND i.data_inspecao >= datetime('now','-'||?||' days')` por um predicado que ignora o
  parâmetro (`AND (? IS NOT NULL)`) → **4 passed, 1 failed**, exatamente o passo 5
  (`1 !== 0` no total do cartão) e nada mais — a sabotagem derrubou de verdade, ao contrário
  da prescrita na Task 2. Revertido, `git diff` de `alertRegistry.js` vazio.
  `npm run test:api` → **131/131 arquivos OK**.

---

## Self-review do plano (feito na escrita)

- As 4 entradas, o helper, os 3 ganchos, o client e a jornada cobrem o design; RN-01..07
  têm teste nomeado. Os literais das chaves valem como escritos na tabela C2.
- T1→T2 sequencial (ganchos consomem o helper); T3 paralela a T2 por contrato; T4 depois.
- Decisão nova tomada na escrita (registrar na letra B): material de CLIENTE com controle
  de certificado ENTRA no alerta de sem-certificado (certificado é rastreabilidade do lote,
  não propriedade) — coerente com B29 (sem-endereço).
- Risco declarado: o gancho 2 roda por item conferido — conferência com N itens divergentes
  gera N disparos de UMA vez (não é o caso do inventário: recebimento tem poucos itens; o
  agregado lá não se justifica — declarado).

## Execução (estado)

- [x] Fase 2 — revisão do plano por agente fresco (2026-08-28): 7 achados, todos acatados.
  **2 Críticos:** o gancho da divergência estava SÓ na rota de conferir, que a UI nunca
  chama (o fluxo real escreve `quantidade_recebida` pelo `/fiscal` → gancho nos DOIS
  métodos); janela por `created_at` puro quebrava a rede de segurança para recebimento
  antigo (→ `COALESCE(updated_at, created_at)`, limitação declarada). **2 Importantes:**
  "dados locais" dos ganchos 1 e 2 NÃO existiam no escopo (→ dual-mode por id nos três
  `listar` de evento — régua única e dado completo). **1 Importante de teste:** lote sem
  certificado NASCE BLOQUEADO — cenário explícito contra a cópia cega do filtro
  `status='ATIVO'` do molde. Menores: payloads declarados no C2; dependência T3→T1 pelo
  teste de paridade (e a forma literal do bloco CAMPOS). O revisor confirmou: cadeia de
  requires, stub do RN-02, fixture do client (só o assert de ordem precisa acompanhar) e
  todos os literais/linhas citados.
- [x] Task 1 (tronco) — c1cd0a1. Vermelho inicial 0/6; verde `alertaEvento.api.test.js` 6/6;
  controle positivo do `divergenciaRealSql` (`!=` cru) derrubou só o cenário float (5/6) e foi
  revertido; `npm run test:api` **129/129 arquivos OK**. Entregue: C1
  (`dispararAlertaRegistrado`, exportado — os ganchos da Task 2 devem chamá-lo **pelo objeto do
  módulo**), C2 (as 4 entradas + os 3 `listar` dual-mode exportados do `alertRegistry`) e C3
  (seed `alerta_eventos_janela_dias`='7', já editável pelo PUT via prefixo `alerta_` — o campo
  na tela é da Task 3). `divergencia.js` mudou **só no header** (consumidor novo declarado).
- [x] Task 2 (tronco) — 8eeaeea. Vermelho inicial **0 passed, 6 failed**; verde
  `alertaEventoGanchos.api.test.js` **6/6**; `npm run test:api` **130/130 arquivos OK**.
  Entregue: os 3 ganchos do C4 disparando no ato —
  `inspectionService.decidirInspecao` (MATERIAL_REPROVADO, RN-03),
  `receiptService.conferirRecebimento` **e** `receiptService.salvarDadosFiscal`
  (DIVERGENCIA_RECEBIMENTO, RN-04, via o helper local `avisarDivergenciasDoRecebimento`) e
  `PUT /conferencias/:id/concluir` em `routes/almoxarifado.js` (DIVERGENCIA_INVENTARIO, RN-05).
  Todos chamam `notificationQueueService.dispararAlertaRegistrado` **pelo objeto do módulo**
  (RN-02 versionado: com o helper stubado lançando, a rota responde 201, a inspeção fica
  gravada e o motor ainda bloqueia o reprovado) e buscam a linha pelo `listar` dual-mode por id.
  Correção de contrato: `atualizarDadosFiscais` não existe — o nome real é `salvarDadosFiscal`
  (C4 e design corrigidos). Controle positivo: a sabotagem prescrita (tirar o
  `if (reprovada > 0)`) é **no-op** — a guarda e o `WHERE quantidade_reprovada > 0` do
  `listarReprovados` são independentemente suficientes; RN-03 só cai com as duas fora
  (**5/6**, `1 !== 0` em "aprovacao total NAO pode enfileirar"). Revertido, `alertRegistry.js`
  intocado. `divergencia.js` e o motor de estoque seguem intocados nesta task.
- [ ] Task 3 (galho)
- [x] Task 4 (integração) — e1f65c8. `alertaEventoJornada.api.test.js` **5/5 de primeira**;
  `npm run test:api` **131/131 arquivos OK**. Entregue: a jornada ato→fila→central→varredura
  ponta a ponta, **toda por rota real** (workflow fiscal completo até
  `POST /recebimentos/:id/processar`, depois `inspecionar` reprovando 3 de 10). Prova a
  COMPOSIÇÃO, não as peças: o mesmo hash de dedupe serve o ato e a varredura (RN-01:
  `duplicadas>=1, enfileiradas=0`), a central é **ao vivo** (a inspeção envelhecida para -30
  dias zera o cartão) e a fila é **histórico** (a linha fica — RN-05 da Etapa 16). Âncoras
  contra teste vazio: `quantidade_bloqueada=3` + `quantidade_em_inspecao=0` no material (motor
  real) e zero `DIVERGENCIA_RECEBIMENTO` no recebimento sem divergência. Controle positivo
  (verde de primeira): ignorar o parâmetro `dias` no `listarReprovados` derruba **só** o passo
  final (**4/5**, `1 !== 0`); revertido. Nenhum arquivo de produção mudou nesta task.
- [x] Task 3 (galho) — commit `454c601`, merge `30385a5`. Base da worktree nasceu errada
  (`5dadd59`) pela TERCEIRA vez nesta sessão e a checagem obrigatória pegou antes do código.
  Colunas das 4 chaves espelhando os campos REAIS do `listar` (o executor leu o registro em
  vez do plano — e por isso incluiu `responsavel_nome` e o `status` do lote, que o plano não
  listava); `divergencia` renderizada como veio do servidor (sem segunda régua em JS);
  inventário sem coluna de valor (B30). Controle positivo do parser de paridade medido —
  com nota de honestidade: a primeira tentativa rodou contra o repo principal e **provava
  nada**; refeita dentro da worktree, a paridade caiu para 12/15 com a chave sabotada.
  Client 527/527 em 36 suítes; build zero warning.
- [x] Fase 4 — merge do galho (`30385a5`) + suíte completa serial na branch (2026-08-28):
  `test:api` **131/131**, `test:almoxarifado` **42/0**, `test:validation` **4/0**,
  `test:safealter` **3/0**, `test:sqlite` **3/0**; client **527 testes em 36 suítes**,
  build `CI=true` exit 0.
- [x] Fase 5 — revisão adversarial (2 lentes, 2026-08-28). **Backend: Needs-fix-round leve**
  — A1 (divergência NOVA e pior no mesmo item nunca re-alertava: a central dizia "faltam 8" e
  o único e-mail dizia outra coisa → a quantidade ENTROU no dedupe), A2 (volume MEDIDO: 1000
  lotes = 1000 e-mails/mês → alerta de lote virou resumo mensal agregado, no precedente do
  sem-endereço da E16; o volume por item da divergência de recebimento fica declarado), A3
  (**a spec afirmava "o dedupe segura o e-mail" e ele reproduziu que é FALSO** — transição de
  workflow bumpa `updated_at` e ressuscita divergência antiga nunca avisada: frase corrigida
  dizendo que estava errada), A4 (`TRIM/COALESCE` na régua do certificado), A5 (terceiro
  escritor declarado), A6 (RN-01/RN-02 versionados para os outros dois ganchos).
  **Front/costura: Needs-fix-round pequeno** — a asserção de escape do
  `dispararAlertaRegistrado` **não sabia falhar** (fixture sem caractere especial e o `<p>`
  vinha do wrapper): fixture hostil + asserts de `&lt;script&gt;`, com controle positivo
  medido (sabotei o `escapeHtml` do helper → vermelho; md5 restaurado). Refutado com
  sabotagem real por eles: dual-mode é a mesma query byte a byte, dedupe idêntico nos dois
  caminhos, os 3 ganchos têm rede, costura campo a campo, B30 respeitado.
  Revalidação: server **131/131** (evento 6/6, ganchos 8/8), client **527/527**, build exit 0.
- [x] Fase 6 — fechar-etapa (2026-08-28): 7 artefatos (novidades com a seção da etapa,
  B30-B32, C20 e F10c; spec 20 com os 4 itens marcados por hash e o modo evento declarado —
  a feature vira 🟢 no viável, restando só os 3 sem dado; mapa com cabeçalho, linha da 20 e
  seção da etapa; guia com roteiro clicável dos 4 alertas; este plano; manual com os 4
  alertas na tabela da central, o parágrafo do disparo no ato e a janela nova nas configs).

## Retro (4 números — medida no fechamento)

- Rodadas de correção até verde: **1** (fix round único `e51ca79`; nenhum teste falhou 2×).
  Fora do ciclo: 1 interrupção por limite de sessão no meio da Task 1, retomada pelo mesmo
  executor com inventário do que faltava — sem retrabalho.
- Achados da revisão: **reais 7 / ruído 0** — 2 na revisão do PLANO (gancho na rota que a UI
  nunca chama; janela por `created_at` cegando recebimento antigo — os dois teriam virado
  defeito de produção) e 5 na ADVERSARIAL (dedupe que calava a divergência nova e pior;
  1000 e-mails/mês no alerta de lote; afirmação falsa na spec; asserção de escape que não
  sabia falhar; RN-01/RN-02 sem versão para 2 dos 3 ganchos). Todos reproduzidos com sonda.
- Paralelismo real: **T2 ∥ T3 e depois T4 ∥ T3 (2 execuções simultâneas), zero retrabalho
  entre elas.** A worktree do galho nasceu na base errada pela 3ª vez e a checagem
  obrigatória pegou antes do código; o executor da T3 também pegou sozinho que seu controle
  positivo rodara contra o repo principal — e refez.
- Defeito que escapou (preencher na etapa seguinte): —
- (Da retro da Etapa 16: **nenhum defeito escapado descoberto durante a 17** — as suítes da
  16 seguiram verdes, e o alerta de lote da 16 nem foi tocado.)

## Próxima tarefa detalhada — a próxima frente sai do mapa

Modo contínuo segue. Candidatas, na ordem recomendada:

1. **Feature 23 — a conferência de inventário não audita** (buraco real nomeado no mapa
   desde 2026-08-11). Ponto de atenção: `PUT /conferencias/:id/concluir` é a MESMA rota que
   escreve saldo por fora do motor em `aplicar_ajustes` (pendência antiga da spec 03/13) e
   agora também tem 2 ganchos pós-commit (alerta de mínimo e `DIVERGENCIA_INVENTARIO`) — é
   a rota mais carregada do módulo, mexer nela pede revisão de plano caprichada.
2. **Pendências herdadas, todas nomeadas:** `z.regex` na `data_necessidade` (C19), coluna da
   transição de inspeção para matar o falso positivo da quarentena (C18), G7 (multer 500 nas
   5 rotas de upload, da E15), e os 3 alertas sem dado (cada um exige mudança na feature
   dona: data da transição p/ retirada, saldo de pedido, orçamento de projeto).
3. **Restos declarados da 21/22** (PDF de relatório; BOM/OP bloqueados por dependência).

O que a próxima sessão NÃO precisa reabrir: o registro de alertas e seus dois modos, a fila
da 12, a central, e as fontes únicas (`divergencia.js`, `disponivelSql`, `custoUnitarioSql`,
`consumoSql`, `movementTypes`). Decisões B em aberto: B5-B24 antigas + B25-B32.
