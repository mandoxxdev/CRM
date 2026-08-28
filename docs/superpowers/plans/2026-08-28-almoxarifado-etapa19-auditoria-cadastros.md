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
- **Usuário do harness:** `canConfigureAlmox` **NÃO** aceita `role: 'admin'` (só
  `is_superadmin` ou `admin_modulos` com almoxarifado). O usuário default de `createTestApp`
  (`{id:1, role:'admin'}`) toma **403** em todas as rotas 1-12, na `PUT /configuracoes` e na
  de permissões de setor. Os testes desta etapa precisam de `setUser` com
  `is_superadmin: true` (precedente: `tests/api/materialCompleto.api.test.js:26`). Já o
  `GET /auditoria` usa `requirePermission('configurar')` e **passa** com `role:'admin'`.
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
// que mudaram.
//
// DOMINIO DE ITERACAO: Object.keys(NOVOS), nunca a uniao (achado A3 da revisao, BLOQUEANTE).
// Na rota 13 o `anteriores` vem de um SELECT SEM WHERE — a tabela inteira, ~45 chaves — e o
// payload tem 18. Iterar a uniao reportaria ~27 chaves "removidas" em TODO save: exatamente
// o ruido que a RN-04 existe para matar. Chave presente em `anteriores` e ausente em `novos`
// e IGNORADA (as tres rotas so escrevem o que recebem).
//
// COMPARACAO: String(anterior) !== String(novo), com os dois lados JA na forma persistida.
// (Correcao do achado A6: a justificativa original dizia "o front manda number" — FALSO, o
// front manda `String(configs[chave] ?? '')`. O unico produtor de valores TIPADOS e a rota
// 15, e para ela String() e errado: String([]) === '' contra '[]' na coluna, String(false)
// === 'false' contra '0', e reordenar a mesma lista de aprovadores pareceria mudanca. Por
// isso a rota 15 normaliza ANTES de chamar — ver C4 #15.)
//
// Chave secreta que mudou entra nos dois lados como '(alterado)' — nunca o valor (RN-05).
// Chave que nao existia em `anteriores` entra com anteriores[chave] = null.
// Sem mudanca nenhuma -> { anteriores: {}, novos: {} } (o chamador nao audita).
```

Exportar `calcularDiff` e `CHAVES_SECRETAS`. **Assinatura de DOIS argumentos** e
`CHAVES_SECRETAS` **sempre aplicada** (achado A8: o design propunha um 3º argumento
opcional; como `alertas_smtp_pass` é chave semeada, ela passa na guarda de `conhecidas` e
**pode ser gravada pela rota 13 também** — mascaramento opt-in deixaria a RN-05 com um
buraco que o teste, que só exercita a rota 14, não pegaria).

### C2 — cadastros (`entidade`/`acao`/de-para)

| # | Rota (linha no HEAD `8f73701`) | entidade | acao | `dados_anteriores` | `entidade_id` |
|---|---|---|---|---|---|
| 1 | POST `/tipos-material` :1534 | `tipo_material` | `CRIACAO` | null | `r.id` do SELECT que a rota já faz (:1544) — **NÃO `this.lastID`**: aquele callback é arrow e não tem `this` (achado A9) |
| 2 | PUT `/tipos-material/:id` :1548 | `tipo_material` | `EDICAO` | **SELECT novo** antes do UPDATE | `req.params.id` |
| 3 | DELETE `/tipos-material/:id` :1561 | `tipo_material` | `EXCLUSAO` | **SELECT novo** (`{ ativo, nome }`) | `req.params.id` |
| 4 | POST `/localizacoes` :1617 | `localizacao` | `CRIACAO` **ou `REATIVACAO`** | null na criação; a linha inativa na reativação (ampliar o `SELECT id, ativo` da :1633 para `SELECT *`) | `existente.id` na reativação; na criação, `r.id` do SELECT de :1666 (arrow — sem `this`) |
| 5 | PUT `/localizacoes/:id` :1673 | `localizacao` | `EDICAO` | ampliar o `SELECT bloqueada, tipos_material_permitidos` (:1698) para `SELECT *` | `req.params.id` |
| 6 | DELETE `/localizacoes/:id` :1724 | `localizacao` | `EXCLUSAO` | **SELECT novo** (a leitura atual é de saldo) | `req.params.id` |
| 7 | POST `/setores` :1762 | `setor` | `CRIACAO` | null | `r.id` do SELECT de :1778-1782 (arrow). **Atenção:** esse `r` carrega o derivado `qtd_localizacoes` — decidir se entra no log (recomendado: filtrar, é contagem, não cadastro) |
| 8 | PUT `/setores/:id` :1786 | `setor` | `EDICAO` | ampliar `SELECT nome` (:1795) para `SELECT *` | `req.params.id` |
| 9 | DELETE `/setores/:id` :1836 | `setor` | `EXCLUSAO` | ampliar `SELECT nome` (:1838) para `SELECT *` | `req.params.id` |
| 10 | POST `/familias` :1942 | `familia` | `CRIACAO` | null | `r.id` do SELECT de :1958 (arrow) |
| 11 | PUT `/familias/:id` :1983 | `familia` | `EDICAO` | ampliar `SELECT parent_id, ativo, categoria_id` (:1998) para `SELECT *` | `familiaId` |
| 12 | DELETE `/familias/:id` :2050 | `familia` | `EXCLUSAO` | **SELECT novo** (as leituras atuais são contagens) | `req.params.id` |
| 18 | POST `/centros-custo` (extended :124) | `centro_custo` | `CRIACAO` | null | `r.lastID` |
| 19 | PUT `/centros-custo/:id` (:135) | `centro_custo` | `EDICAO` | **de graça** (`SELECT *` já existe, var `atual`) | `Number(req.params.id)` |
| 20 | POST `/almoxarifados` (:273) | `almoxarifado` | `CRIACAO` | null | `r.lastID` |
| 21 | PUT `/almoxarifados/:id` (:285) | `almoxarifado` | `EDICAO` | **de graça** (`SELECT *` já existe, var `atual`) | `Number(req.params.id)` |

**RN-08 no #8 (corrigido pelo achado A1, BLOQUEANTE):** o cascata
`UPDATE localizacoes_almoxarifado SET setor=?` (:1808-1809) tem callback **ARROW** (`() => {}`)
— `this.changes` ali seria `undefined` e o log gravaria `localizacoes_renomeadas: undefined`.
Trocar por `function (cascErr) { const renomeadas = this.changes; ... }`.

**E há DOIS caminhos:** quando `atual.nome === nome.trim()` o cascata **nem roda** (:1807).
A auditoria de `EDICAO` do setor tem de acontecer nos dois — no caminho sem rename, com
`localizacoes_renomeadas: 0`. Pôr a auditoria só dentro do cascata faria uma edição que não
muda o nome deixar de auditar.

### C3 — RN-03: 404 nas 4 rotas que hoje respondem 200 para id inexistente

`#2`, `#3`, `#6`, `#12`. Nos callbacks de `db.run` (que são `function` — o `this` existe,
verificado), `this.changes === 0` → **404**. Literais **lidos do código** (achado A14: a
versão anterior deste plano citou `'Tipo de material não encontrado'` como se já existisse —
**não existe**, o grep volta vazio):

- `'Localização não encontrada'` (já em :1701) → #6
- `'Família não encontrada'` (já em :1922/:2000) → #12
- #2 e #3: **não há literal para tipo de material no módulo** — criar
  `'Tipo de material não encontrado'`, acentuado, no molde dos irmãos.

Sem linha alterada, **não audita**.

**Limitação a declarar (achado do revisor; não corrigir aqui):** em SQLite um UPDATE em linha
existente conta `changes = 1` mesmo sem mudar valor. Então `DELETE` numa linha **já inativa**
segue respondendo 200 e passará a auditar um `EXCLUSAO` que não excluiu nada. Só id
**inexistente** cai no 404. Corrigir exigiria checar `ativo` antes — fora do escopo, mas
**nomeado no fechamento**.

> Mudança de comportamento deliberada: hoje essas rotas mentem sucesso. Conferir se algum
> teste existente depende do 200 (a medição diz que **não há teste nenhum** para
> tipos-material e setores; `restricoesEndereco` e `subfamilias` cobrem os DELETEs — o
> executor roda os dois antes e depois).

### C4 — configurações

| # | Rota | entidade | acao | Carga |
|---|---|---|---|---|
| 13 | PUT `/configuracoes` :2096 | `configuracao` | `EDICAO` | diff do C1. **Trocar o `SELECT chave` da :2107 por `SELECT chave, valor`** — verificado que não quebra a validação (`existentes` só alimenta o Set de chaves conhecidas). `entidade_id: null` (a coluna é INTEGER, a chave é TEXT). **`dados_novos` guarda `String(valor)`, o que foi de FATO escrito** (achado A7: a rota persiste `String(valor)`; logar o valor cru do body faria um `null` do payload virar `null` no log e a string `null` na coluna — numa etapa cujo tema é o log não mentir, seria o próprio defeito). Diff vazio → **não audita** |
| 14 | PUT `/configuracoes/alertas-estoque` :2180 | `configuracao` | `EDICAO` | **SELECT novo** `WHERE chave IN (...)` montado a partir do próprio array `upserts` (:2211-2236), **depois de montado e antes do `Promise.all`** (:2243). Os dois segredos entram no `upserts` **condicionalmente** (`shouldUpdateSecret`, :2231/:2234) — o conjunto de chaves varia por request. Diff do C1 com máscara (RN-05) |
| 15 | PUT `/configuracoes/liberacao-valor` :2289 | `configuracao` | `EDICAO` | **`valueApprovalService.getConfig(db)`** — é esse o nome da variável no arquivo (:22); a versão anterior escrevia `requisitionValueApprovalService`, que daria `ReferenceError` (achado A5). Chamar `getConfig` **nos DOIS lados**: o retorno de `saveConfig` é `getConfigForApi`, de shape DIFERENTE (traz `aprovadores` e `souAprovador` a mais) — diffar um contra o outro logaria chaves novas em todo save. **Normalizar para a forma persistida antes de diffar** (achado A6). Auditar **na rota** (o serviço recebe só `userName`) |
| 16 | PUT `/configuracoes/estoques-minimos` :2300 | `material` | **`ATUALIZACAO`** | **um SELECT em lote** (`WHERE id IN (...)`, com `ids.filter(Boolean)`) antes do `Promise.all` — os callbacks dele são arrow, sem `this`; **uma linha por material que mudou de fato** (RN-06), de/para dos 4 campos. **Comparação por `Number()`**, não `String()` (o front manda `parseFloat`/`parseInt` contra colunas numéricas); coluna `NULL` vs payload `0` **É** mudança real (o UPDATE grava 0) |
| 17 | PUT `/configuracoes/tipos-material` :2327 | `material` | **`ATUALIZACAO`** | idem, campo `tipo_material_id`. **Rota órfã** (zero chamadores no client, confirmado) — auditar mesmo assim e **nomear na spec** como candidata a remoção |

> **Por que `ATUALIZACAO` e não `EDICAO` nos #16/#17 (achado A2, BLOQUEANTE):** `material`
> **não é entidade nova** — o CRUD v1 e a Etapa 18 já auditam com `ATUALIZACAO` (:484),
> `DESATIVACAO` (:534) e `CRIACAO` (`materialService.js:266`). Usar `EDICAO` partiria o
> histórico do material em dois verbos e quem consultasse por ação receberia metade. O design
> mandava congelar `CRIACAO`/`EDICAO`/`EXCLUSAO` como majoritários — **não se aplica aqui**, e
> medido: `EDICAO` aparece 1 vez no módulo inteiro, `ATUALIZACAO` 1, `ATUALIZAR` 1; não há
> majoritário a congelar. **Regra desta etapa:** consistência DENTRO da entidade ganha de
> consistência entre entidades. `EDICAO` fica só para as entidades novas.

### C5 — permissões de setor (extended)

| # | Rota | entidade | acao | Carga |
|---|---|---|---|---|
| 22 | PUT `/setores-requisicao/:id/permissoes` :1501 | `setor_permissao` | `EDICAO` | `getPermissoesSetor` (exportada) **antes** e depois; de/para completo; `entidade_id` = id do setor |
| 23 | POST `.../permissoes/bulk-tipo` :1513 | `setor_permissao` | `INCLUSAO_EM_LOTE` (**verbo novo — declarar junto da dívida das ações no fechamento**) | idem + `{ tipo_uso, incluidas: N }`. **`incluidas` NÃO existe no retorno** do serviço (ele devolve a lista completa — achado A12): derivar `depois.length - antes.length`, válido porque a operação é **puramente aditiva** |

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

- [x] **Step 1: teste que falha** (`a02125d`) — RN-04 (18 chaves com 1 alterada → 1 linha com 1
  chave no de/para; **zero alterações → zero linhas**); RN-05 (mudar `alertas_smtp_pass` → o log
  diz `'(alterado)'` e **não** contém o valor — asserção negativa sobre o texto CRU de todas as
  linhas, não sobre o objeto parseado); RN-06 (estoques mínimos de 3 materiais, 2 alterados → 2
  linhas `material`, com de/para dos campos); liberacao-valor auditando; e o teste da função pura
  `calcularDiff` (casos: chave nova, chave removida do payload, valor numérico vs string,
  segredo). **E RN-02 nesta task também**: stub de `audit.registrarAuditoria` com as três
  asserções (flag `chamado` + o PUT responde 200 e gravou + zero linhas).
  20 cenários em `server/tests/api/auditoriaConfiguracoes.api.test.js`.
- [x] **Step 2: rodar e ver falhar** (`a02125d`) — **5 passed, 15 failed**. Os 5 verdes são a
  guarda de 403/18-chaves e os cenários "zero linhas", que passam trivialmente enquanto nada
  audita — por isso cada um está pareado com um cenário positivo no mesmo arquivo.
- [x] **Step 3: implementar** (`a02125d`) — `configDiff.js` primeiro; depois as rotas 13-17,
  com o `SELECT chave` → `SELECT chave, valor` na 13.
- [x] **Step 4: verde + controle positivo** (`a02125d`) — **20/0**. Sabotagem: a máscara de
  segredo deixando o valor passar → **18/2**, os DOIS cenários de RN-05 vermelhos (o da função
  pura e o de API), com a senha aparecendo na própria mensagem de falha; revertido e `git diff`
  limpo. `configuracoesGerais.api.test.js` rodado explicitamente: **15/0**, inalterado.
  `npm run test:api` inteiro: **135/135 arquivos OK**. Também `test:almoxarifado` 42/0,
  `test:validation` 4/0, `test:safealter` 3/0, `test:sqlite` 3/0.
- [x] **Step 5: commit** (`a02125d`) — `Almoxarifado Etapa 19 Task 1: configuracao passa a registrar o diff`.

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
- Test: `server/tests/api/auditoriaExtended.api.test.js` (cobre os 3 blocos: centros de
  custo, almoxarifados e permissões de setor — o nome anterior, `auditoriaPermissoesSetor`,
  escondia 2/3 do conteúdo)

- [ ] **Step 1: teste que falha** — centros de custo e almoxarifados (criação/edição com
  de/para, aproveitando o `SELECT *` que já existe); RN-07 (permissões: de/para completo, e o
  bulk com `incluidas` derivado); **RN-02 no `extended.js`** por stub. O stub precisa de
  **TRÊS** asserções juntas (achado A4 — sem a primeira, uma rota que simplesmente NÃO audita
  também passa verde):
  1. `let chamado = false` dentro do stub e `assert.ok(chamado, 'o stub TEM de ter sido
     alcançado')` — molde real na base: `tests/api/alertasNovos.api.test.js:151-159`;
  2. o ato responde 200/201 e gravou;
  3. nenhuma linha de auditoria foi criada.
- [ ] **Step 2: implementar (C0 primeiro); verde; controle positivo** — voltar o import ao
  desestruturado e conferir que o teste de RN-02 **FICA VERMELHO** na asserção "nenhuma linha
  de auditoria" (sem o C0 o `registrarAuditoria` real roda e cria a linha). *(Correção do
  achado A4: a versão anterior deste plano dizia que o teste "passaria a mentir, ficando
  verde" — está errado, e um executor seguindo aquilo concluiria que o teste está quebrado e
  apagaria justamente a asserção que o torna não-vazio.)* Reverter.
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
- Risco declarado: `configuracoesGerais.api.test.js` (**15** casos) é o teste mais provável
  de quebrar — a T1 tem de rodá-lo explicitamente. O revisor rodou os três que o plano cita:
  `restricoesEndereco` 12/0, `subfamilias` 23/0, `configuracoesGerais` 15/0 — e confirmou que
  **nenhum** depende do 200 que a RN-03 troca por 404.
- Risco declarado 2: a RN-03 muda comportamento de 4 rotas (200 → 404). A medição diz que
  não há teste para tipos-material/setores, mas o executor **confere rodando** antes e depois.
- O que NÃO entra: as corridas medidas (whitelist sem transação, config sem transação, TOCTOU
  da reativação), a remoção da rota órfã e a normalização das ações antigas — todas
  declaradas no design e no fechamento.
- **24º endpoint, declarado FORA (achado A10):** `PUT /mapa/localizacoes/posicoes`
  (`extended.js:313`) escreve em `localizacoes_almoxarifado` e é gateado por
  `canConfigureAlmox`, mas grava **layout** (`pos_x`/`pos_y`), não regra de negócio. Fica de
  fora por decisão, não por omissão — a versão anterior deste plano simplesmente não o via.
- **Declarado (achado A11):** um PUT de configuração sem mudança efetiva **não audita**, mas
  a rota continua rodando os 18 UPDATEs e gravando `updated_at`/`updated_by`. O banco
  registra o toque; o log não. Aceito nesta etapa (pular UPDATE de chave inalterada mudaria
  o comportamento da rota); nomeado no fechamento.

## Execução (estado)

- [x] Fase 2 — revisão do plano por agente fresco (2026-08-28): **15 achados, 4 bloqueantes,
  todos acatados.** Os quatro: (A1) o callback do cascata do rename de setor é **arrow** —
  `this.changes` seria `undefined` e o log gravaria lixo; e o rename que não troca o nome nem
  roda o cascata, então a auditoria precisa de dois pontos; (A2) `material` não é entidade
  nova — usar `EDICAO` partiria o histórico ao meio (`ATUALIZACAO` é o verbo já usado);
  (A3) o diff percorreria a união e a rota 13 lê a **tabela inteira** — todo save reportaria
  ~27 chaves de ruído, matando a razão da RN-04; (A4) o controle positivo da Task 3 estava
  com o **resultado invertido** e o teste continuava passando se a rota simplesmente não
  auditasse. Mais: nome de módulo errado no #15 (`ReferenceError`), `this.lastID` indisponível
  nos 4 POSTs (mesma classe do A1), justificativa falsa do `String()`, `dados_novos` cru
  mentindo sobre o que está na coluna, mascaramento que precisava ser default-on, `incluidas`
  que o serviço não devolve, o gate do harness (`role:'admin'` toma 403 nas rotas do escopo),
  um 24º endpoint fora de contrato por omissão, e um literal de 404 inventado. O revisor
  confirmou que as 23 linhas citadas batem e que o `SELECT *` proposto é seguro (nenhum
  handler desestrutura a row).
- [x] Task 1 (tronco) — `a02125d`. Vermelho inicial **5/15** → verde **20/0**
  (`auditoriaConfiguracoes.api.test.js`). Controle positivo: máscara de segredo sabotada →
  **18/2** (os dois cenários de RN-05), revertido. `configuracoesGerais.api.test.js` **15/0**
  (o risco declarado do plano — não quebrou). Suíte: `test:api` **135/135 arquivos OK**,
  `test:almoxarifado` 42/0, `test:validation` 4/0, `test:safealter` 3/0, `test:sqlite` 3/0.
  **Divergências do contrato, para a Task 2 saber:**
  (a) `Number(null) === 0`, então a regra "coluna NULL vs payload 0 É mudança" do C4 #16 não
  sai de graça de uma comparação por `Number()` — está no helper `mudouNumero`, que trata o
  `null` ANTES de comparar (e `tipo_material_id`, que grava `|| null`, usa o ramo `nulavel`,
  onde null→null NÃO é mudança);
  (b) as rotas 16/17 ganharam um `.then` a mais para encaixar o SELECT em lote antes do
  `Promise.all` — o handler continua **não-async** e em cadeia de promessas, como era
  (nenhuma refatoração de estilo);
  (c) o SELECT do "antes" nas rotas 14/16/17 é `.catch(() => [])`: falha na leitura custa o
  log, nunca a escrita — se ela caísse na cadeia principal, um erro de leitura viraria 500
  numa rota que hoje grava;
  (d) `calcularDiff` ignora o par null→null (chave que não existia e continua sem valor) para
  não inventar uma "mudança" de nada — não estava escrito no C1, é consequência dele.
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
