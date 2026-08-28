# Etapa 22 — A trilha ganha leitor (plano de implementação)

> **For agentic workers:** REQUIRED SUB-SKILL: use `superpowers:subagent-driven-development`
> para executar task a task. Os passos usam checkbox (`- [ ]`) para rastreio.

**Goal:** dar leitor à trilha de auditoria do almoxarifado — filtros que respondem "quem mexeu
nisto, quando", índices para a tabela aguentar isso, e a tela que consome.

**Architecture:** dois módulos puros novos — `auditLabels.js` (rótulos, grupos de sinônimo e a
régua de **leitura** do de/para) e `auditFiltros.js` (validação de data e conversão da janela
para UTC); a rota existente ganha quatro filtros e passa a devolver rótulo e de/para **já
calculados**; uma rota de opções alimentada pelo banco; e uma tela React nova contra contrato
congelado, que não traduz nem calcula nada por conta própria.

**Tech Stack:** Express + SQLite (`server/`), React CRA (`client/`).

**Spec:** `docs/superpowers/specs/2026-08-28-almoxarifado-etapa22-tela-de-auditoria-design.md`

## Global Constraints

Valem para **todas** as tasks. Cada uma foi aprendida por falha nesta base:

1. **`python` NÃO EXISTE nesta máquina.** Heredoc de python vira no-op silencioso. Use `sed`
   (contando a âncora antes: `grep -cF '<ancora>' arquivo` **tem de dar exatamente 1**) ou a
   ferramenta Edit.
2. **COMMITE ANTES DE SABOTAR.** Três vezes nesta sessão um `git checkout` de restauração
   apagou correções ainda não commitadas.
3. **Controle positivo obrigatório**, com `md5sum` antes / depois da sabotagem / depois de
   restaurar, e `git diff --stat` vazio no fim. **Sabotagem que não derruba nenhum teste é um
   achado**, não um detalhe: diga qual asserção falta.
4. **Vermelho por asserção, não por `MODULE_NOT_FOUND`.** Crie stub permissivo primeiro e
   confirme que cada cenário sabe falhar.
5. **Nunca `git add -A`** — há artefatos de runtime em `server/data/` e `server/uploads/`.
6. Commit em **português**, corpo **sem acento**, explicando **por quê**. Mensagem em arquivo do
   scratchpad + `git commit -F` (aspas dentro de `-m` já quebraram commits aqui).
7. Testes descobertos só em `server/tests/api/*.api.test.js`; cada arquivo tem runner próprio
   (`test()`, contador, `process.exit`). Harness: `server/tests/helpers/testApp.js`, com
   `requirePermission` **real**.
8. Cliente: `CI=true` faz warning virar erro — variável não usada quebra o build.

## Regras de negócio

| RN | Enunciado | Onde é provada |
|---|---|---|
| RN-01 | A tela tem o mesmo gate do dado (`configurar`) | teste de gate + menu `adminOnly` |
| RN-02 | Quatro filtros novos combináveis (`usuario_id`, `acao`, `data_inicio`, `data_fim`) | `auditoriaFiltros` |
| RN-03 | Data **inválida** é **400** — inclusive `2026-02-30`, que o JS e o SQLite aceitam e rolam para março | `auditFiltros` + `auditoriaFiltros` |
| RN-04 | Período inclusivo nos dois extremos **no fuso de quem pergunta** (`created_at` é gravado em UTC) | `auditFiltros` + `auditoriaFiltros` |
| RN-05 | Os selects vêm do banco (`/auditoria/opcoes`) | `auditoriaFiltros` |
| RN-06 | Sinônimo não divide a lista (`CRIACAO`+`CRIAR` = "Criação") | `auditLabels` |
| RN-07 | O de/para vem do servidor por `auditLabels.alteracoesDaLinha` — **`configDiff.calcularDiff` NÃO serve** (apaga a mudança do segredo e fabrica alteração) | `auditLabels` + integração |
| RN-08 | Segredo não desmascara na tela | integração |
| RN-09 | A trilha é somente leitura | declarada; nenhuma rota de escrita criada |

## Contratos congelados

> **Todos os contratos abaixo foram corrigidos pela revisão da Fase 2** (10 achados, dois
> críticos). Onde a versão anterior estava errada, o texto **diz que estava** — não apague:
> o executor lê isto antes do código e a versão errada já circulou.

**C1 — `GET /api/almoxarifado/auditoria`** (gate `configurar`, já existente)

Query: `entidade`, `entidade_id`, `usuario_id`, `acao`, `data_inicio`, `data_fim`, `limite`
(1..1000, default 200), `offset`.

- **`acao` é UM parâmetro só, string com vírgulas** (`acao=CRIACAO,CRIAR`) — nunca
  `acao[]=...`. Motivo medido (achado A5): `client/src/services/api.js` é um `axios.create()`
  **sem `paramsSerializer`**, então mandar array vira `acao[]=A&acao[]=B`, o parser `extended`
  do Express entrega **array** em `req.query.acao`, e um `.split(',')` em cima estoura
  `TypeError` → 500. A rota normaliza defensivamente mesmo assim:
  `Array.isArray(q.acao) ? q.acao : String(q.acao).split(',')`.
- **O SQL do `IN` monta um placeholder por valor:**
  ```js
  const verbos = (Array.isArray(q.acao) ? q.acao : String(q.acao || '').split(','))
    .map((v) => v.trim()).filter(Boolean);
  if (verbos.length) {
    sql += ` AND acao IN (${verbos.map(() => '?').join(',')})`;
    params.push(...verbos);
  }
  ```
  **Isto está no contrato porque o modo de falha é silencioso** (achado A5, reproduzido):
  `WHERE acao IN (?)` com o parâmetro `'CRIACAO,CRIAR'` devolve **zero linhas sem erro**. Numa
  auditoria, zero em silêncio é o pior resultado possível — é a mesma razão de existir da
  RN-03. Precedente correto na base: `stockService.js:1363`.
- **Datas (RN-03 + RN-04).** Validação **antes** do `COUNT`, por `auditFiltros.validarData`:
  formato `AAAA-MM-DD` **e** ida-e-volta (`new Date(v+'T00:00:00Z').toISOString().slice(0,10)
  === v`). Falhou → **400** `{ "error": "Data inválida: use uma data real no formato AAAA-MM-DD" }`.
  Lançar com `Object.assign(new Error(msg), { status: 400 })` — o `handleError` do
  `extended.js:58-61` já devolve `err.status || 500` + `{ error: err.message }` (verificado).
  O `Date.parse` sozinho **não serve**: `'2026-02-30'` é válido em JS e o SQLite rola para
  `'2026-03-03'`, alargando a janela em silêncio (achado A6).
- **A janela vai para UTC antes do SQL** (`auditFiltros.janelaUtc`), porque `created_at` é
  gravado por `CURRENT_TIMESTAMP`, que é **UTC**, e quem filtra pensa em dia de Brasília
  (achado A4). `created_at >= ?` / `created_at < ?` com os limites já convertidos — **não**
  use `date(?, '+1 day')` cru no SQL.

Resposta 200 (**forma inalterada**, congelada na Etapa 18):
```json
{ "total": 0, "limite": 200, "offset": 0, "truncado": false, "itens": [] }
```
Cada item traz as 10 colunas da tabela (`id, entidade, entidade_id, acao, usuario_id,
usuario_nome, dados_anteriores, dados_novos, justificativa, created_at`; `dados_*` seguem
**string JSON ou null**, como no banco) **mais três campos derivados**:

```json
{ "acao_rotulo": "Criação", "entidade_rotulo": "Material",
  "alteracoes": [{ "campo": "foto", "de": null, "para": "x.png" }] }
```

**Os três campos derivados são correção do achado A9.** O design prometia "a tela não repete
tradução nenhuma" e o contrato entregava um item sem rótulo, obrigando a tela a remontar o mapa
a partir de `/opcoes` — e a depender de `/opcoes` ter carregado antes de qualquer linha
renderizar. Com o cálculo no servidor, a Task 3 volta a ser galho de verdade.

**C2 — `GET /api/almoxarifado/auditoria/opcoes`** (mesmo gate)

```json
{
  "entidades": [{ "valor": "material", "rotulo": "Material" }],
  "acoes":     [{ "rotulo": "Criação", "verbos": ["CRIACAO", "CRIAR"] }],
  "usuarios":  [{ "id": 7, "nome": "Admin Foto" }]
}
```
Só valores **realmente presentes** (`SELECT DISTINCT`). Verbo sem rótulo entra com `rotulo` = o
próprio verbo (nunca some — sumir esconderia atos). `usuarios`: `DISTINCT usuario_id,
usuario_nome` com `usuario_id NOT NULL`, ordenado por nome.
Verificado pela Fase 2: **não há colisão de rota** — `app.get('/api/almoxarifado/auditoria')`
casa caminho exato e não captura `/auditoria/opcoes`, em qualquer ordem de registro. E o
`req.user` está sempre populado (`almoxarifado.js:199-202` aplica `authenticateToken` ao
prefixo inteiro), então `auth` na rota é redundância de consistência, não requisito.

**C3 — `services/almoxarifado/auditLabels.js`**

```js
ROTULOS_ENTIDADE            // { material: 'Material', conferencia: 'Conferência', ... }
GRUPOS_ACAO                 // [{ rotulo: 'Criação', verbos: ['CRIACAO', 'CRIAR'] }, ...]
rotularEntidade(v)          // -> string (o próprio valor se não mapeado)
rotularAcao(v)              // -> string (o próprio valor se não mapeado)
verbosDoGrupo(rotulo)       // -> string[] ([] se o rótulo não existe)
alteracoesDaLinha(ant, nov) // -> [{ campo, de, para }]  (RN-07, régua de LEITURA)
```

`alteracoesDaLinha`: aceita **string JSON, objeto ou null** nos dois lados; percorre a **união**
das chaves (`ant` ∪ `nov`); `de`/`para` recebem `null` quando a chave falta de um lado; **não
remascara nada**; devolve `[]` quando os dois lados são vazios (a tela mostra "sem detalhes
registrados" — há call sites que gravam nenhum dos dois, `receiptService.js:236-239`).
**Não use `configDiff.calcularDiff`** — ela itera só `Object.keys(novos)` de propósito
(`configDiff.js:9-13`), o que **apaga a mudança do segredo** (os dois lados valem `'(alterado)'`
e a chave some) e **fabrica alterações** a partir de campos de contexto. É o achado A1, o mais
grave da revisão, e está detalhado na RN-07 do design.

**Congelamento em PROFUNDIDADE** (achado A8): `Object.freeze` é raso, então
`GRUPOS_ACAO[0].verbos.push('X')` funcionaria e o cenário do teste passaria verde com o array
mutável — justamente o que a Task 2 consome. Congele cada `verbos` e cada entrada, não só o
array externo.

---

### Task 1 (tronco): rótulos, régua de leitura e índices

**Files:** Create `server/services/almoxarifado/auditLabels.js`; Modify
`server/services/almoxarifado/schema.js`; Test `server/tests/api/auditLabels.api.test.js`.

**Interfaces:** Produces C3 — a Task 2 consome `GRUPOS_ACAO`, `rotularEntidade`, `rotularAcao`
e `alteracoesDaLinha`.

- [ ] **Step 1: teste que falha.** Cenários: (a) `rotularAcao('CRIACAO')` e `rotularAcao('CRIAR')`
  devolvem **a mesma** string; (b) `verbosDoGrupo('Criação')` traz os dois; (c) verbo
  desconhecido volta ele mesmo, **não** `undefined` nem `''`; (d) congelamento **profundo** —
  `GRUPOS_ACAO[0].verbos.push('X')` tem de lançar em strict mode (ou não alterar o array);
  (e) `alteracoesDaLinha` nos cinco casos que a revisão reproduziu:
  - `ant={status:'PENDENTE'}`, `nov={numero:'REQ-1'}` → **duas** entradas
    (`status: PENDENTE → null` e `numero: null → REQ-1`). A entrada de `status` é a que
    `calcularDiff` perdia.
  - os dois lados com `'(alterado)'` na mesma chave → a chave **aparece** (não some).
  - `nov=null` → `[]`; os dois vazios → `[]`.
  - entrada com string JSON crua (é como vem do banco) funciona igual à com objeto.
  - **nenhum valor é remascarado** — o que estiver gravado sai como está.
- [ ] **Step 2: cobertura do vocabulário — a parte que a Fase 2 reescreveu.**
  A varredura ingênua **não serve** e o executor não deve "consertá-la" afrouxando: ela é ao
  mesmo tempo **ruidosa e cega** (achado A2, reproduzido).
  - Ruído: `grep -rhoP "acao: '\K[A-Z_]+"` casa o final de outros identificadores —
    `localiz**acao: '**A...'` vira `A`, `motivoMovimentacao: 'E...'` vira `E`/`L`.
    A varredura correta tem guarda de fronteira: `grep -rhoP "(?<![A-Za-z_])acao: '\K[A-Z_]+"`
    → **45 verbos, 91 ocorrências, nenhum token com menos de 4 caracteres**.
  - Cegueira: **~25 verbos não são literais** e a varredura nunca os vê —
    `stockService.js:1368` audita `acao: tipo` (os **18** de `movementTypes.js`, a maior
    produtora de linhas do módulo), `receiptService.js:238` faz `acao.toUpperCase()` (as **5**
    chaves de `transicoes`, `receiptService.js:204-213`), e `routes/almoxarifado.js:1286` dá
    `CONTAGEM`/`RECONTAGEM`.
  - Portanto o cenário de cobertura une **três fontes**: (1) a varredura com guarda, exigindo
    `>= 45` e com canário `nenhum token com length < 4`; (2) `require('./movementTypes')` +
    as chaves de `transicoes` em maiúscula + `['CONTAGEM','RECONTAGEM']`, com comentário
    apontando cada call site dinâmico; (3) a asserção de que **todo** verbo dessa união tem
    rótulo. A guarda antiga (">= 20 verbos") **passava nos dois defeitos ao mesmo tempo** —
    45 > 20 com ruído dentro e um terço faltando.
  - `entidade: '<nome>'` está limpo: 25 distintos, **nenhum dinâmico** (verificado).
- [ ] **Step 3: implementar.** Grupos que a medição exige: `CRIACAO`+`CRIAR` → "Criação";
  `EDICAO`+`ATUALIZACAO`+`ATUALIZAR` → "Edição"; **`EXCLUSAO`+`DESATIVACAO` → "Exclusão"**.
  **A justificativa anterior deste passo ESTAVA ERRADA** (achado A7): ela dizia para **não**
  agrupar porque "desativar é `ativo = 0` e é reversível por `REATIVACAO`". Medido: **os dois
  são `ativo = 0`** (`EXCLUSAO` em tipo_material `:1765`, localizacao `:1973`, setor `:2136`,
  familia `:2374`; `DESATIVACAO` em material `:635`), e a reversibilidade aponta para o verbo
  **oposto** ao que a frase dizia — `REATIVACAO` existe para `localizacao` e `serie`, que
  recebem **`EXCLUSAO`**, e **não** existe para `material`, o único que recebe `DESATIVACAO`.
  São o mesmo ato com nome diferente por entidade: é exatamente o caso de sinônimo que a RN-06
  trata. (A inconsistência do vocabulário continua visível na legenda secundária da linha.)
- [ ] **Step 4: índices** em `schema.js`, ao lado dos 12 existentes, padrão
  `CREATE INDEX IF NOT EXISTS`: `idx_auditoria_almox_created (created_at)`,
  `idx_auditoria_almox_entidade (entidade, entidade_id)`,
  `idx_auditoria_almox_usuario (usuario_id)`. Prove com
  `SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='auditoria_log_almoxarifado'`
  — asserção de **exatamente 3** (verificado que não há `sqlite_autoindex_*` inflando a
  contagem: a tabela não tem `UNIQUE` e o PK é o rowid).
- [ ] **Step 5: controle positivo** (commitar antes): apague `'CRIAR'` do grupo → caem os
  cenários (a), (b) **e** o de cobertura (`'CRIAR'` é literal em `purchaseService.js:33,381`).
  Segunda sabotagem: faça `alteracoesDaLinha` iterar só `Object.keys(nov)` → o cenário do
  `status` perdido tem de cair. Reverter, verde de novo.
- [ ] **Step 6: `npm run test:api`; commit.**

---

### Task 2 (tronco): filtros, validação, janela e opções

**Files:** Create `server/services/almoxarifado/auditFiltros.js`; Modify
`server/routes/almoxarifado/extended.js:1337`; Test `server/tests/api/auditoriaFiltros.api.test.js`.

**Interfaces:** Consumes C3. Produces C1 e C2.

- [ ] **Step 1: `auditFiltros.js` com teste próprio primeiro.** `validarData(v)` → `{ ok }`
  recusando `'ontem'`, `'2026-13-45'`, `'2026-02-30'` e `'2026-04-31'`, aceitando `'2026-08-28'`.
  `janelaUtc(inicio, fim)` → `{ de, ate }` em `'AAAA-MM-DD HH:MM:SS'` UTC, com `ate` = início do
  dia seguinte ao `fim` (inclusivo). **Cenário que prova o fuso:** com `TZ=America/Sao_Paulo`,
  `janelaUtc('2026-08-28','2026-08-28')` tem de conter `'2026-08-29 00:30:00'` (o ato das 21:30
  local) e **não** conter `'2026-08-29 03:30:00'` (00:30 do dia 29 local).
- [ ] **Step 2: teste da rota que falha.** Todas as linhas de arranjo gravadas por `dbRun`
  **com `created_at` explícito** — nunca `CURRENT_TIMESTAMP` (achado A4: usar o relógio deixa o
  cenário verde de dia e vermelho entre 21h e meia-noite, e a próxima sessão depura o SQL em
  vez do fuso). Cenários: cada filtro isolado; `usuario_id` + `data_inicio` combinados;
  `acao=CRIACAO,CRIAR` trazendo **os dois**; RN-03 (**400** com a mensagem literal, e a
  asserção de peso de que **não** é 200 com `itens: []`); RN-04 (ato às 21:30 local aparece no
  filtro do dia local); RN-05 (`/opcoes` reflete o arranjo e o verbo sem rótulo sai com o
  próprio nome); RN-01 (**403** nas duas rotas para usuário sem `configurar` — a de opções é
  nova e é onde o gate costuma faltar); regressão da **forma** da resposta; e um cenário para
  os **três campos derivados** (`acao_rotulo`, `entidade_rotulo`, `alteracoes`).
- [ ] **Step 3: implementar** conforme C1 (placeholders no `IN`, validação antes do `COUNT`,
  janela em UTC, campos derivados no `.map` dos itens).
- [ ] **Step 4: controle positivo** (commitar antes), com alvo e resultado previstos:
  (1) trocar o `IN` por `IN (?)` com a string única → o cenário de `acao=CRIACAO,CRIAR` cai;
  (2) tirar a conversão de fuso (comparar direto com a data crua) → o cenário RN-04 cai;
  (3) trocar `validarData` pelo `Date.parse` sozinho → o cenário do 30 de fevereiro cai.
- [ ] **Step 5: `npm run test:api`; commit.**

---

### Task 3 (galho): a tela

**Files:** Create `client/src/components/almoxarifado/AuditoriaAlmoxarifado.js` e
`AuditoriaAlmoxarifado.test.js`; Modify `client/src/routes/lazyModules.js`,
`client/src/App.js`, `client/src/components/Layout.js`.

**Interfaces:** Consumes C1 e C2 (**mock de JSON na fronteira HTTP** — a única fronteira onde
mock é legítimo nesta base). A tela **não calcula de/para nem traduz rótulo**: os dois vêm
prontos do servidor.

- [ ] **Step 1: teste que falha:** filtro de período dispara nova busca com os params certos
  (**`acao` como string com vírgulas, nunca array** — ver C1/A5); `truncado: true` mostra o
  aviso de corte; expandir mostra as `alteracoes`; `alteracoes: []` mostra "sem detalhes
  registrados" (não uma área em branco); lista vazia mostra "nenhum registro **para os filtros
  aplicados**" (nunca "não há registros" — a diferença importa numa auditoria).
- [ ] **Step 2: implementar.** Molde: `AlertasAlmoxarifado.js` (Etapa 16).
  **Data — o passo anterior deste plano mandava o ERRADO** (achado A3): dizia
  "`toLocaleString('pt-BR')`, não repita o bug de DATE-only da Etapa 16", quando o molde que ele
  manda copiar faz o oposto e está certo (`AlertasAlmoxarifado.js:62-64`): o timestamp do SQLite
  vem em **UTC sem sufixo**, e sem o `'Z'` o V8 lê como hora local. Reproduzido:
  `'2026-08-29 01:30:00'` sai como **29/08 01:30** (dia errado) em vez de 28/08 22:30. Use
  `replace(' ', 'T') + 'Z'` antes de formatar — numa tela cuja pergunta é "quem mexeu nisto
  **ontem**", errar o dia é defeito de correção, não de formatação.
- [ ] **Step 3:** rota lazy + `<Route path="auditoria">` + item de menu com **`adminOnly`**
  (verificado que `canConfigureModule` espelha o `getPerfilFromUser` do backend, então admin de
  módulo com `role='usuario'` vê o item **e** passa no gate).
- [ ] **Step 4: controle positivo com alvo definido** (achado A10 — "controle positivo" sem
  alvo vira `md5sum` cerimonial): troque o `params` do fetch por objeto vazio → o cenário
  "filtro de período dispara nova busca com os params certos" tem de ficar vermelho.
- [ ] **Step 5:** `CI=true` test e build; commit.

---

### Task 4 (integração, cruza os galhos)

**Files:** Test `server/tests/api/auditoriaFluxoCompleto.api.test.js`.

- [ ] **Step 1:** escrever de verdade por uma rota real instrumentada — trocar a foto de um
  material (`POST /materiais/:id/foto`, Etapa 20) — e **ler pela C1** com `usuario_id` +
  período do dia, conferindo as `alteracoes`. **Asserção que a versão anterior não tinha:** a
  linha grava `dados_novos: { foto, codigo, nome }` contra `dados_anteriores: { foto }`, então
  o teste precisa afirmar o **conjunto inteiro** de `alteracoes` — conferir só o campo `foto`
  deixaria passar `codigo` e `nome` renderizados como alteração que não houve (achado A1).
- [ ] **Step 2:** RN-08 — gravar uma configuração secreta pelo PUT real e conferir que o item
  traz `'(alterado)'` **nas `alteracoes`, não só no JSON cru** (era assim que a versão anterior
  deixava o buraco passar), e que o valor real não aparece em lugar nenhum do corpo.
- [ ] **Step 3:** `SELECT DISTINCT acao FROM auditoria_log_almoxarifado` depois dos atos
  escritos, afirmando que **todo verbo gravado tem rótulo** — é a terceira perna da cobertura
  do vocabulário (Task 1 Step 2), a única que vê os verbos dinâmicos em uso real.
- [ ] **Step 4: suíte completa (os cinco comandos); commit.**

---

## O que a Fase 2 refutou (não mexer)

A revisão checou e considerou **corretos**: a ausência de colisão entre `/auditoria` e
`/auditoria/opcoes`; `req.user` sempre populado pelo `app.use` do prefixo; nenhuma armadilha de
`this` (o `db.js:7` usa `function`, não arrow); o controle positivo da janela de data; a
asserção de exatamente 3 índices; o `adminOnly` espelhando o backend; a forma da resposta e os
6 testes existentes que chamam a rota (nenhum passa data, então a validação nova não os quebra);
e todas as afirmações factuais da Fase 0 do design (zero índices, 12 no schema, nenhum
consumidor no client, os sinônimos coexistindo).

**Não verificado pela revisão, declarado:** o baseline verde das cinco suítes; o volume real do
G8; se `(created_at)` sozinho é usado pelo `ORDER BY created_at DESC, id DESC` ou se
`(created_at, id)` seria melhor; e a serialização do axios ponta a ponta (deduzida da versão e
da ausência de `paramsSerializer`, não reproduzida contra a rota).
