# Almoxarifado Etapa 19 — Auditoria de cadastros e configurações: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Os 23 endpoints de cadastro e configuração passam a deixar rastro, com o tratamento
honesto de cada classe (diff na configuração, segredo mascarado, criação × reativação, 404
onde hoje não há) — e as três correções de comportamento que a auditoria exige para não mentir.

**Architecture:** auditoria pós-escrita, best-effort (try/catch → `console.error`), sem
serviço novo. Uma função pura nova (`configDiff.js`) para o diff de configuração. Import de
`audit` **por objeto** nos dois arquivos de rota (em `extended.js` isso é mudança).

**Tech Stack:** Express + SQLite, `registrarAuditoria`, supertest.

**Spec:** `docs/superpowers/specs/2026-08-28-almoxarifado-etapa19-auditoria-cadastros-design.md`

## Global Constraints

- Os das etapas 16-18 (harness real, testes em `server/tests/api/*.api.test.js`, controle
  positivo obrigatório, commits pt sem acento no corpo, `git add` explícito).
- **Mensagens de API acentuadas** (regra sem-acento é só para commit).
- **Auditoria sempre pós-escrita**, nunca antes do efeito.
- Asserções por `entidade` + `acao` + `entidade_id`, **nunca** por contagem global da tabela.
- **Nenhuma refatoração de estilo**: os handlers de callback continuam callback (molde
  `routes/almoxarifado.js:2968-2977`); os async continuam async. Acrescentar, não reescrever.
- **As linhas citadas aqui são do HEAD `8f73701`** (a medição corrigiu um desvio de +214
  linhas em `routes/almoxarifado.js` e +24 em `extended.js` frente a briefings antigos). O
  executor confere antes de editar.

## Regras de negócio (RN) — enunciado no design

| ID | Resumo |
|---|---|
| RN-01 | Cadastros auditam criar/editar/excluir com de/para |
| RN-02 | Auditoria nunca derruba o ato (nos DOIS arquivos de rota) |
| RN-03 | Só audita o que mudou: as 4 rotas sem 404 passam a ter 404 e não auditam id inexistente |
| RN-04 | Configuração audita o DIFF, 1 linha por PUT; zero mudanças → zero linhas |
| RN-05 | Segredo nunca vai para o log (`'(alterado)'`) |
| RN-06 | Edição em lote de material audita por material alterado |
| RN-07 | Permissão de setor audita de/para completo |
| RN-08 | O cascata do rename de setor é contado e registrado |

## Contratos congelados

### C0 — import por objeto em `extended.js` (pré-requisito, BLOQUEANTE)

`extended.js:15` importa `const { registrarAuditoria } = require(...)`. **Acrescentar**
`const audit = require('../../services/almoxarifado/audit');` e usar
`audit.registrarAuditoria(...)` nas chamadas NOVAS — sem isso o stub do teste de RN-02 não
pega naquele arquivo e o teste passa verde provando nada (lição da Etapa 18, C0). As chamadas
antigas ficam como estão.

### C1 — `configDiff.js` (função pura nova)

`server/services/almoxarifado/configDiff.js`:

```js
const CHAVES_SECRETAS = ['alertas_smtp_pass', 'alertas_whatsapp_api_key'];
// calcularDiff(anteriores, novos) -> { anteriores: {...}, novos: {...} } SO com as chaves
// que mudaram (comparacao por String(valor), porque a coluna e TEXT e o front manda number).
// Chave secreta que mudou entra nos dois lados como '(alterado)' — nunca o valor (RN-05).
// Chave que nao existia antes entra com anteriores[chave] = null.
// Sem mudanca nenhuma -> { anteriores: {}, novos: {} } (o chamador nao audita).
```

Exportar `calcularDiff` e `CHAVES_SECRETAS`.

### C2 — cadastros (`entidade`/`acao`/de-para)

| # | Rota (linha no HEAD `8f73701`) | entidade | acao | `dados_anteriores` | `entidade_id` |
|---|---|---|---|---|---|
| 1 | POST `/tipos-material` :1534 | `tipo_material` | `CRIACAO` | null | `this.lastID` |
| 2 | PUT `/tipos-material/:id` :1548 | `tipo_material` | `EDICAO` | **SELECT novo** antes do UPDATE | `req.params.id` |
| 3 | DELETE `/tipos-material/:id` :1561 | `tipo_material` | `EXCLUSAO` | **SELECT novo** (`{ ativo, nome }`) | `req.params.id` |
| 4 | POST `/localizacoes` :1617 | `localizacao` | `CRIACAO` **ou `REATIVACAO`** | null na criação; a linha inativa na reativação (ampliar o `SELECT id, ativo` da :1633 para `SELECT *`) | `existente.id` ou `this.lastID` |
| 5 | PUT `/localizacoes/:id` :1673 | `localizacao` | `EDICAO` | ampliar o `SELECT bloqueada, tipos_material_permitidos` (:1698) para `SELECT *` | `req.params.id` |
| 6 | DELETE `/localizacoes/:id` :1724 | `localizacao` | `EXCLUSAO` | **SELECT novo** (a leitura atual é de saldo) | `req.params.id` |
| 7 | POST `/setores` :1762 | `setor` | `CRIACAO` | null | `this.lastID` |
| 8 | PUT `/setores/:id` :1786 | `setor` | `EDICAO` | ampliar `SELECT nome` (:1795) para `SELECT *` | `req.params.id` |
| 9 | DELETE `/setores/:id` :1836 | `setor` | `EXCLUSAO` | ampliar `SELECT nome` (:1838) para `SELECT *` | `req.params.id` |
| 10 | POST `/familias` :1942 | `familia` | `CRIACAO` | null | `this.lastID` |
| 11 | PUT `/familias/:id` :1983 | `familia` | `EDICAO` | ampliar `SELECT parent_id, ativo, categoria_id` (:1998) para `SELECT *` | `familiaId` |
| 12 | DELETE `/familias/:id` :2050 | `familia` | `EXCLUSAO` | **SELECT novo** (as leituras atuais são contagens) | `req.params.id` |
| 18 | POST `/centros-custo` (extended :124) | `centro_custo` | `CRIACAO` | null | `r.lastID` |
| 19 | PUT `/centros-custo/:id` (:135) | `centro_custo` | `EDICAO` | **de graça** (`SELECT *` já existe, var `atual`) | `Number(req.params.id)` |
| 20 | POST `/almoxarifados` (:273) | `almoxarifado` | `CRIACAO` | null | `r.lastID` |
| 21 | PUT `/almoxarifados/:id` (:285) | `almoxarifado` | `EDICAO` | **de graça** (`SELECT *` já existe, var `atual`) | `Number(req.params.id)` |

**RN-08 no #8:** o cascata `UPDATE localizacoes_almoxarifado SET setor=?` (:1808) hoje tem
callback vazio `() => {}`. Passa a capturar `this.changes` e o log leva
`localizacoes_renomeadas: N`. Erro do cascata continua não derrubando a rota (mesma
filosofia), mas passa a ser logado.

### C3 — RN-03: 404 nas 4 rotas que hoje respondem 200 para id inexistente

`#2`, `#3`, `#6`, `#12`. Nos callbacks de `db.run`, `this.changes === 0` → **404** com o
literal do recurso. **Ler o literal do próprio arquivo antes de escrever o teste** (o módulo
usa `'Tipo de material não encontrado'`-style; confirmar caso a caso — se não existir literal
para o recurso, usar `'<Recurso> não encontrado'` acentuado, no molde de
`'Conferência não encontrada'`). Sem linha alterada, **não audita**.

> Mudança de comportamento deliberada: hoje essas rotas mentem sucesso. Conferir se algum
> teste existente depende do 200 (a medição diz que **não há teste nenhum** para
> tipos-material e setores; `restricoesEndereco` e `subfamilias` cobrem os DELETEs — o
> executor roda os dois antes e depois).

### C4 — configurações

| # | Rota | entidade | acao | Carga |
|---|---|---|---|---|
| 13 | PUT `/configuracoes` :2096 | `configuracao` | `EDICAO` | diff do C1. **Trocar o `SELECT chave` da :2107 por `SELECT chave, valor`** (o de/para sai de graça, sem query nova). `entidade_id: null` (a coluna é INTEGER, a chave é TEXT). Diff vazio → **não audita** |
| 14 | PUT `/configuracoes/alertas-estoque` :2180 | `configuracao` | `EDICAO` | **SELECT novo** das chaves que a rota grava, antes dos upserts; diff do C1 com máscara (RN-05) |
| 15 | PUT `/configuracoes/liberacao-valor` :2289 | `configuracao` | `EDICAO` | `requisitionValueApprovalService.getConfig(db)` **antes** (função pronta) + diff. Auditar **na rota** (o serviço recebe só `userName`, não `req.user`) |
| 16 | PUT `/configuracoes/estoques-minimos` :2300 | `material` | `EDICAO` | **um SELECT em lote** (`WHERE id IN (...)`) antes do `Promise.all`; **uma linha por material que mudou de fato** (RN-06), com de/para dos 4 campos |
| 17 | PUT `/configuracoes/tipos-material` :2327 | `material` | `EDICAO` | idem, campo `tipo_material_id`. **Rota órfã** (sem chamador no client) — auditar mesmo assim e **nomear na spec** como candidata a remoção |

### C5 — permissões de setor (extended)

| # | Rota | entidade | acao | Carga |
|---|---|---|---|---|
| 22 | PUT `/setores-requisicao/:id/permissoes` :1501 | `setor_permissao` | `EDICAO` | `getPermissoesSetor` (exportada) **antes** e depois; de/para completo; `entidade_id` = id do setor |
| 23 | POST `.../permissoes/bulk-tipo` :1513 | `setor_permissao` | `INCLUSAO_EM_LOTE` | idem + `{ tipo_uso, incluidas: N }` (a operação é aditiva, nunca remove) |

Auditar **na rota**, não no serviço (o serviço não recebe `user`; mudar as duas assinaturas
seria refatoração fora do escopo — e `extended.js:252` já tem o precedente de auditar na
rota por esse motivo).

## Sort topológico

| Task | Tipo | Depende de |
|---|---|---|
| 1. `configDiff.js` + as 5 rotas de configuração + RN-06 | **tronco** | — |
| 2. Os 12 cadastros de `routes/almoxarifado.js` + RN-03 + RN-08 | **tronco** | — (mesmo arquivo da T1 → serializar) |
| 3. `extended.js`: C0 + centros de custo + almoxarifados + permissões | **galho** | C0/C2/C5 (arquivo diferente) |
| 4. Jornada: o log de uma mudança de regra de negócio | integração | Tasks 1+2 |

T1 e T2 tocam `routes/almoxarifado.js` — sequenciais. T3 é `extended.js`, paralelizável.

---

### Task 1 (tronco): `configDiff` + as 5 rotas de configuração

**Files:**
- Create: `server/services/almoxarifado/configDiff.js`
- Modify: `server/routes/almoxarifado.js` (rotas 13-17)
- Test: `server/tests/api/auditoriaConfiguracoes.api.test.js`

- [ ] **Step 1: teste que falha** — RN-04 (18 chaves com 1 alterada → 1 linha com 1 chave no
  de/para; **zero alterações → zero linhas**); RN-05 (mudar `alertas_smtp_pass` → o log diz
  `'(alterado)'` e **não** contém o valor — asserção negativa explícita); RN-06 (estoques
  mínimos de 3 materiais, 2 alterados → 2 linhas `material`, com de/para dos campos);
  liberacao-valor auditando; e o teste da função pura `calcularDiff` (casos: chave nova,
  chave removida do payload, valor numérico vs string, segredo).
- [ ] **Step 2: rodar e ver falhar.**
- [ ] **Step 3: implementar** (`configDiff.js` primeiro; depois as rotas, trocando o
  `SELECT chave` por `SELECT chave, valor` na 13).
- [ ] **Step 4: verde + controle positivo** — sabotar a máscara de segredo (deixar passar o
  valor) e ver o cenário RN-05 falhar; reverter. `npm run test:api` inteiro — atenção
  especial a `configuracoesGerais.api.test.js` (13 casos, é o que mais pode quebrar).
- [ ] **Step 5: commit** — `Almoxarifado Etapa 19 Task 1: configuracao passa a registrar o diff`.

### Task 2 (tronco): os 12 cadastros + 404 + cascata contado

**Files:**
- Modify: `server/routes/almoxarifado.js` (rotas 1-12)
- Test: `server/tests/api/auditoriaCadastros.api.test.js`

- [ ] **Step 1: teste que falha** — por recurso: criar/editar/excluir auditando com de/para
  (RN-01); **RN-03**: id inexistente nas 4 rotas → 404 e **zero linhas**; **REATIVACAO**:
  criar localização, excluir, criar de novo com o mesmo código → a 2ª vez audita
  `REATIVACAO` com `dados_anteriores` (não `CRIACAO`); **RN-08**: renomear setor que tem 2
  localizações → o log traz `localizacoes_renomeadas: 2`; RN-02 por stub.
- [ ] **Step 2: rodar e ver falhar; implementar; verde.**
- [ ] **Step 3: controle positivo** — sabotar o ramo de reativação (auditar sempre
  `CRIACAO`) e ver o cenário falhar; reverter. `npm run test:api` inteiro — conferir
  `restricoesEndereco` e `subfamilias` (cobrem DELETEs que passam a ter 404).
- [ ] **Step 4: commit** — `Almoxarifado Etapa 19 Task 2: os cadastros passam a deixar rastro`.

### Task 3 (galho): `extended.js` — C0, centros de custo, almoxarifados, permissões

**Files:**
- Modify: `server/routes/almoxarifado/extended.js`
- Test: `server/tests/api/auditoriaPermissoesSetor.api.test.js` (cobre os 3 blocos)

- [ ] **Step 1: teste que falha** — centros de custo e almoxarifados (criação/edição com
  de/para, aproveitando o `SELECT *` que já existe); RN-07 (permissões: de/para completo,
  e o bulk com `incluidas: N`); **RN-02 no `extended.js`** por stub — é o teste que prova
  o C0 (se alguém deixar o import desestruturado, ele passa verde sem provar nada: por isso
  o teste deve **também** assertar que a fila/linha NÃO foi criada quando o stub lança).
- [ ] **Step 2: implementar (C0 primeiro); verde; controle positivo** — remover o C0 (voltar
  ao desestruturado) e conferir que o teste de RN-02 **passa a mentir** (fica verde sem o
  stub pegar) — este é o controle positivo mais importante da task: se o teste continuar
  verde com o import errado, ele não serve. Reverter.
- [ ] **Step 3: `npm run test:api`; commit** — `Almoxarifado Etapa 19 Task 3: extended audita cadastros e permissoes de setor`.

### Task 4 (integração): a jornada de uma mudança de regra

**Files:** Test: `server/tests/api/auditoriaConfiguracaoJornada.api.test.js`

- [ ] **Step 1: jornada** — administrador muda a **tolerância de inventário** pela rota real
  de configurações (o valor que governa a recontagem obrigatória) → o log registra o de/para
  daquela chave, e só dela → uma conferência conclui usando a tolerância nova (o efeito da
  mudança é observável) → `GET /auditoria?entidade=configuracao` (como ADMIN) devolve a
  linha, com o `total`/`truncado` do formato da Etapa 18. Prova que "quem mudou a regra do
  jogo" ficou registrado — que é o motivo desta etapa existir.
- [ ] **Step 2: rodar; controle positivo** (remover a auditoria da rota 13 e ver a jornada
  falhar); reverter; `npm run test:api`; commit —
  `Almoxarifado Etapa 19 Task 4: jornada da mudanca de regra auditada`.

---

## Self-review do plano (feito na escrita)

- Cobertura: os 23 endpoints estão nos C2/C4/C5; RN-01..08 têm task e teste.
- T1→T2 serializados (mesmo arquivo); T3 paralelo (arquivo diferente); T4 depois.
- Risco declarado: `configuracoesGerais.api.test.js` (13 casos) é o teste mais provável de
  quebrar — a T1 tem de rodá-lo explicitamente.
- Risco declarado 2: a RN-03 muda comportamento de 4 rotas (200 → 404). A medição diz que
  não há teste para tipos-material/setores, mas o executor **confere rodando** antes e depois.
- O que NÃO entra: as corridas medidas (whitelist sem transação, config sem transação, TOCTOU
  da reativação), a remoção da rota órfã e a normalização das ações antigas — todas
  declaradas no design e no fechamento.

## Execução (estado)

- [ ] Fase 2 — revisão do plano por agente fresco
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
