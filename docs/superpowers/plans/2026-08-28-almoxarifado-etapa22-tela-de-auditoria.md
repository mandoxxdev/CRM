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
  **Acrescentado pela execução da Task 2:** o fuso do recorte é **constante do módulo**
  (`FUSO_PADRAO = 'America/Sao_Paulo'`, terceiro parâmetro opcional de `janelaUtc`), **nunca
  `process.env.TZ`**. O contrato era omisso e a leitura óbvia — `new Date(ano, mes-1, dia)`, que
  usa o fuso do processo — passaria em qualquer máquina de dev brasileira e viraria **no-op num
  contêiner com `TZ=UTC`**, ressuscitando a RN-04 em produção com o teste verde. Há cenário que
  troca o `TZ` do processo para `UTC` e `Asia/Tokyo` e exige a mesma janela.

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
**Precisão da Task 2:** `verbos` traz só os verbos do grupo que **estão no banco**, não os do
grupo inteiro. O exemplo acima mostra `["CRIACAO","CRIAR"]` porque a base tem os dois; num banco
que só gravou `CRIAR`, a opção "Criação" sai com `["CRIAR"]`. Mandar o verbo ausente não mudaria
resultado nenhum e faria a rota afirmar que existe no log o que não existe.
`entidades` e `acoes` saem ordenados por `rotulo` (`localeCompare('pt-BR')`) — a tela não
reordena.
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

**ENTREGUE em `8c6ffbe`.** Três detalhes que a Task 2 e a Task 3 precisam saber e que o
contrato não dizia:
1. **`de`/`para` saem CRUS, sem `String()`.** Número continua número, `false` continua `false`,
   array continua array. Quem renderiza é a tela — coagir aqui apagaria a diferença entre `0` e
   `'0'` numa trilha de auditoria. `0` e `false` **não** viram `null`.
2. **Campo de contexto APARECE, com `de: null`.** Não há filtro de igualdade, de propósito: é
   ele que faria a troca de senha mascarada sumir (RN-07, defeito 1). Consequência aceita e já
   antecipada pela Task 4: a foto de material sai com `codigo` e `nome` como `null → valor`.
3. **Lado malformado conta como vazio.** JSON quebrado, array ou escalar em `dados_*` viram
   `{}` — uma linha estragada não pode derrubar a listagem inteira.

**Congelamento em PROFUNDIDADE** (achado A8): `Object.freeze` é raso, então
`GRUPOS_ACAO[0].verbos.push('X')` funcionaria e o cenário do teste passaria verde com o array
mutável — justamente o que a Task 2 consome. Congele cada `verbos` e cada entrada, não só o
array externo.

---

### Task 1 (tronco): rótulos, régua de leitura e índices — **FEITA** (`8c6ffbe`)

> **Placar real:** `auditLabels.api.test.js` **14 passed, 0 failed**; `npm run test:api`
> **144/144 arquivos** (143 do baseline + o novo); `test:almoxarifado` 42/0, `test:validation`
> 4/0, `test:safealter` 3/0, `test:sqlite` 3/0.
> **Medição fechada:** a união das três fontes dá **68 verbos**, todos com rótulo — 45 da
> varredura com guarda (91 ocorrências, menor token com **5** caracteres), 18 de
> `movementTypes`, 5 de `transicoes` e `CONTAGEM`/`RECONTAGEM`.

**Files:** Create `server/services/almoxarifado/auditLabels.js`; Modify
`server/services/almoxarifado/schema.js`; Test `server/tests/api/auditLabels.api.test.js`.

**Interfaces:** Produces C3 — a Task 2 consome `GRUPOS_ACAO`, `rotularEntidade`, `rotularAcao`
e `alteracoesDaLinha`.

- [x] **Step 1: teste que falha.** Cenários: (a) `rotularAcao('CRIACAO')` e `rotularAcao('CRIAR')`
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
- [x] **Step 2: cobertura do vocabulário — a parte que a Fase 2 reescreveu.**
  A varredura ingênua **não serve** e o executor não deve "consertá-la" afrouxando: ela é ao
  mesmo tempo **ruidosa e cega** (achado A2, reproduzido).
  - Ruído: `grep -rhoP "acao: '\K[A-Z_]+"` casa o final de outros identificadores —
    `localiz**acao: '**A...'` vira `A`, `motivoMovimentacao: 'E...'` vira `E`/`L`.
    A varredura correta tem guarda de fronteira: `grep -rhoP "(?<![A-Za-z_])acao: '\K[A-Z_]+"`
    → **45 verbos, 91 ocorrências, nenhum token com menos de 4 caracteres**.
  - Cegueira: **~25 verbos não são literais** e a varredura nunca os vê —
    `stockService.js:1368` audita `acao: tipo` (os **18** de `movementTypes.js`, a maior
    produtora de linhas do módulo), `receiptService.js:238` faz `acao.toUpperCase()` (as chaves
    de `transicoes`, `receiptService.js:205-216`), e `routes/almoxarifado.js:1286` dá
    `CONTAGEM`/`RECONTAGEM`.
    **Correção da execução: `transicoes` tem 6 chaves, não 5 — o plano dizia "as 5 chaves de
    `transicoes`" e isso estava errado.** O número 5 é o certo, mas por outro motivo: a sexta
    chave, `processar`, **nunca chega** ao `acao.toUpperCase()` — ela cai no
    `handler: 'processar'` e faz `return processarNota(...)` **antes** do `registrarAuditoria`,
    e a linha dela é gravada lá com o literal `'PROCESSAR_NOTA'`
    (`receiptService.js:691`), que a varredura já enxerga. Quem lesse "as 5 chaves" iria
    procurar cinco chaves no fonte, achar seis, e não saber qual sobra. Por isso o teste
    **extrai as chaves do fonte e afirma que são exatamente 6**, descartando `processar` com o
    motivo escrito: assim, uma transição nova derruba o teste em vez de virar verbo sem rótulo.
  - Portanto o cenário de cobertura une **três fontes**: (1) a varredura com guarda, exigindo
    `>= 45` e com canário `nenhum token com length < 4`; (2) `require('./movementTypes')` +
    as chaves de `transicoes` em maiúscula + `['CONTAGEM','RECONTAGEM']`, com comentário
    apontando cada call site dinâmico; (3) a asserção de que **todo** verbo dessa união tem
    rótulo. A guarda antiga (">= 20 verbos") **passava nos dois defeitos ao mesmo tempo** —
    45 > 20 com ruído dentro e um terço faltando.
  - `entidade: '<nome>'` está limpo: 25 distintos, **nenhum dinâmico** (verificado).
- [x] **Step 3: implementar.** Grupos que a medição exige: `CRIACAO`+`CRIAR` → "Criação";
  `EDICAO`+`ATUALIZACAO`+`ATUALIZAR` → "Edição"; **`EXCLUSAO`+`DESATIVACAO` → "Exclusão"**.
  **A justificativa anterior deste passo ESTAVA ERRADA** (achado A7): ela dizia para **não**
  agrupar porque "desativar é `ativo = 0` e é reversível por `REATIVACAO`". Medido: **os dois
  são `ativo = 0`** (`EXCLUSAO` em tipo_material `:1765`, localizacao `:1973`, setor `:2136`,
  familia `:2374`; `DESATIVACAO` em material `:635`), e a reversibilidade aponta para o verbo
  **oposto** ao que a frase dizia — `REATIVACAO` existe para `localizacao` e `serie`, que
  recebem **`EXCLUSAO`**, e **não** existe para `material`, o único que recebe `DESATIVACAO`.
  São o mesmo ato com nome diferente por entidade: é exatamente o caso de sinônimo que a RN-06
  trata. (A inconsistência do vocabulário continua visível na legenda secundária da linha.)
- [x] **Step 4: índices** em `schema.js`, ao lado dos 12 existentes, padrão
  `CREATE INDEX IF NOT EXISTS`: `idx_auditoria_almox_created (created_at)`,
  `idx_auditoria_almox_entidade (entidade, entidade_id)`,
  `idx_auditoria_almox_usuario (usuario_id)`. Prove com
  `SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='auditoria_log_almoxarifado'`
  — asserção de **exatamente 3** (verificado que não há `sqlite_autoindex_*` inflando a
  contagem: a tabela não tem `UNIQUE` e o PK é o rowid).
- [x] **Step 5: controle positivo** (commitado antes, `8c6ffbe`): apagar `'CRIAR'` do grupo →
  caíram exatamente os três previstos, (a), (b) e o de cobertura, este nomeando `["CRIAR"]`
  (11 passed / 3 failed). Segunda sabotagem, `alteracoesDaLinha` iterando só
  `Object.keys(nov)` → caiu o cenário do `status` perdido, **e também** o `(e3)` de `nov=null`
  (12 passed / 2 failed). `md5sum` conferido antes / depois / restaurado nas duas, e
  `git diff --stat` vazio no fim.
  **Terceira sabotagem, acrescentada pela execução e não prevista no plano — e ela é
  necessária.** As duas do plano deixam o cenário do **segredo** `(e2)` verde: iterar só
  `Object.keys(nov)` **não** reproduz o defeito 1 da RN-07, porque quando a senha muda a chave
  está nos **dois** lados. O que apaga o segredo é a **outra** metade do `calcularDiff`, o
  `if (String(bruto) === String(novo)) continue`. Sem um controle para ele, a asserção que
  guarda o achado mais grave da revisão ficaria **não provada**. Sabotagem: acrescentar
  `.filter((c) => String(ant[c]) !== String(nov[c]))` → `(e2)` cai com a mensagem "a troca de
  senha sumiu da leitura", sobrando só `alertas_dias` (e `(e4)` cai junto). Restaurado.
- [x] **Step 6: `npm run test:api` (144/144); commit `8c6ffbe`.**

---

### Task 2 (tronco): filtros, validação, janela e opções — **FEITA** (`8dda8de`, `71582ec`)

> **Placar real:** `auditoriaFiltros.api.test.js` **36 passed, 0 failed**; `npm run test:api`
> **145/145 arquivos** (144 do baseline da Task 1 + o novo); `test:almoxarifado` 42/0,
> `test:validation` 4/0, `test:safealter` 3/0, `test:sqlite` 3/0.

**Files:** Create `server/services/almoxarifado/auditFiltros.js`; Modify
`server/routes/almoxarifado/extended.js:1337`; Test `server/tests/api/auditoriaFiltros.api.test.js`.

**Interfaces:** Consumes C3. Produces C1 e C2.

**O QUE A TASK 3 PRECISA SABER e o contrato não dizia:**

1. **`janelaUtc` NÃO usa o fuso do processo — e isso é divergência deliberada do plano.** O
   Step 1 abaixo só exigia o cenário "com `TZ=America/Sao_Paulo`", e `new Date(ano, mes-1, dia)`
   teria resolvido de graça. **Não serve:** o default da maioria dos contêineres é `TZ=UTC`, e
   lá esse atalho vira **no-op** — a RN-04 volta a falhar em produção com o teste verde na
   máquina do dev, que é exatamente a classe de falha silenciosa desta etapa. O fuso é constante
   do módulo (`FUSO_PADRAO = 'America/Sao_Paulo'`, terceiro parâmetro opcional), o offset sai do
   `Intl` (horário de verão respeitado por data) e há cenário que troca o `TZ` do processo para
   `UTC` e `Asia/Tokyo` provando que a janela não se mexe.
2. **`GET /auditoria/opcoes` devolve em `verbos` só os verbos PRESENTES no banco**, não todos os
   do grupo. Mandar os ausentes não mudaria resultado nenhum e faria a rota afirmar que existe
   no banco o que não existe. Consequência para a tela: o `verbos` que ela recebe é exatamente o
   que ela deve mandar de volta em `acao`, juntado por vírgula — sem consultar `auditLabels`.
3. **`entidades` e `acoes` vêm ordenados por `rotulo`** (`localeCompare('pt-BR')`), `usuarios`
   por nome. A tela não precisa reordenar.
4. **`alteracoes: []` é resultado legítimo e frequente** — há call sites que não gravam nenhum
   dos dois lados. A tela mostra "sem detalhes registrados", nunca área em branco (já previsto
   na Task 3 Step 1).
5. O item continua trazendo `dados_anteriores`/`dados_novos` como **string JSON crua**; a tela
   não deve parseá-los para montar o de/para — `alteracoes` já vem pronto.

- [x] **Step 1: `auditFiltros.js` com teste próprio primeiro.** `validarData(v)` → `{ ok }`
  recusando `'ontem'`, `'2026-13-45'`, `'2026-02-30'` e `'2026-04-31'`, aceitando `'2026-08-28'`.
  `janelaUtc(inicio, fim)` → `{ de, ate }` em `'AAAA-MM-DD HH:MM:SS'` UTC, com `ate` = início do
  dia seguinte ao `fim` (inclusivo). **Cenário que prova o fuso:** com `TZ=America/Sao_Paulo`,
  `janelaUtc('2026-08-28','2026-08-28')` tem de conter `'2026-08-29 00:30:00'` (o ato das 21:30
  local) e **não** conter `'2026-08-29 03:30:00'` (00:30 do dia 29 local).
- [x] **Step 2: teste da rota que falha.** Todas as linhas de arranjo gravadas por `dbRun`
  **com `created_at` explícito** — nunca `CURRENT_TIMESTAMP` (achado A4: usar o relógio deixa o
  cenário verde de dia e vermelho entre 21h e meia-noite, e a próxima sessão depura o SQL em
  vez do fuso). Cenários: cada filtro isolado; `usuario_id` + `data_inicio` combinados;
  `acao=CRIACAO,CRIAR` trazendo **os dois**; RN-03 (**400** com a mensagem literal, e a
  asserção de peso de que **não** é 200 com `itens: []`); RN-04 (ato às 21:30 local aparece no
  filtro do dia local); RN-05 (`/opcoes` reflete o arranjo e o verbo sem rótulo sai com o
  próprio nome); RN-01 (**403** nas duas rotas para usuário sem `configurar` — a de opções é
  nova e é onde o gate costuma faltar); regressão da **forma** da resposta; e um cenário para
  os **três campos derivados** (`acao_rotulo`, `entidade_rotulo`, `alteracoes`).
- [x] **Step 3: implementar** conforme C1 (placeholders no `IN`, validação antes do `COUNT`,
  janela em UTC, campos derivados no `.map` dos itens).
- [x] **Step 4: controle positivo** (commitado antes, `8dda8de`). Os três alvos do plano
  bateram; o **stub permissivo** do Step 1 deu **6 passed / 29 failed**, todos por asserção.
  1. `IN (?)` com a string única → **31/4**. Caiu o alvo previsto (`acao=CRIACAO,CRIAR`, com a
     mensagem `veio []`) **e mais três** que o plano não listava e que são o mesmo defeito visto
     de outro ângulo: o de espaços/vazio na lista, o de `acao` como array e o de `acao_rotulo`
     colapsado. Nenhum deles sobra: os três só existem porque o `IN` correto é pré-requisito.
  2. Janela sem conversão de fuso (`janelaUtc(..., 'UTC')` na rota) → **33/2**. Caiu o alvo
     (`o ato das 21:30 APARECE no filtro do dia 28`) e o do conjunto exato do dia. **O cenário
     irmão — "o ato das 00:30 do dia 29 NÃO aparece" — continua verde, e está certo assim:** ele
     guarda o limite **superior**, que a janela UTC também exclui, por outro motivo. Os dois
     juntos é que fecham a RN-04; sozinho, nenhum dos dois prova a conversão.
  3. `validarData` reduzida ao `Date.parse` → **31/5**. Caíram os dois cenários unitários e os
     três de rota; e o `2026-04-31` também passa no `Date.parse` do Node 24, não só o
     `2026-02-30` — o plano só previa o de fevereiro.
  `md5sum` conferido antes / depois / restaurado nas três, e `git diff --stat` vazio no fim.
  **Achado do próprio controle (commit `71582ec`):** na sabotagem 3 o `test()` único do
  `validarData` caía na **primeira** asserção do laço e o vermelho dizia só
  `deveria recusar "2026-8-28"` — um defeito de **formato**. O 30 de fevereiro, que é o achado
  que a RN-03 existe para guardar, tinha asserção mas **a mensagem dela era engolida**. Não era
  asserção faltando, era diagnóstico enganoso: manda depurar o regex em vez do calendário.
  Separado em dois cenários (formato / data inexistente); a sabotagem foi refeita e agora o
  segundo se nomeia (`30 de fevereiro passou`), com **31/5**.
- [x] **Step 5: `npm run test:api` (145/145); commits `8dda8de` e `71582ec`.**

---

### Task 3 (galho): a tela — **FEITA** (`0a57fe1`)

> **Placar real:** `AuditoriaAlmoxarifado.test.js` **15 passed, 0 failed**; suíte inteira do
> client **546/546 em 37 arquivos** (531/36 do baseline + os 15 novos); `CI=true
> npx react-scripts build` **limpo** (nenhum warning, e `CI=true` faz warning virar erro).

**Files:** Create `client/src/components/almoxarifado/AuditoriaAlmoxarifado.js` e
`AuditoriaAlmoxarifado.test.js`; Modify `client/src/routes/lazyModules.js`,
`client/src/App.js`, `client/src/components/Layout.js`.

**Interfaces:** Consumes C1 e C2 (**mock de JSON na fronteira HTTP** — a única fronteira onde
mock é legítimo nesta base). A tela **não calcula de/para nem traduz rótulo**: os dois vêm
prontos do servidor.

- [x] **Step 1: teste que falha:** filtro de período dispara nova busca com os params certos
  (**`acao` como string com vírgulas, nunca array** — ver C1/A5); `truncado: true` mostra o
  aviso de corte; expandir mostra as `alteracoes`; `alteracoes: []` mostra "sem detalhes
  registrados" (não uma área em branco); lista vazia mostra "nenhum registro **para os filtros
  aplicados**" (nunca "não há registros" — a diferença importa numa auditoria).
  **Executado com stub permissivo primeiro** (componente que renderiza uma `div` vazia): 14
  vermelhos por **asserção**, nenhum `MODULE_NOT_FOUND`. O 15º passava **vazio** com o stub —
  era o "truncado: false não mostra aviso de corte", que uma tela que não renderiza nada também
  satisfaz. Corrigido no mesmo passo com a metade positiva do par (`linha(101)` tem de existir),
  senão o cenário seria exatamente o "teste vazio" que o CLAUDE.md manda desconfiar.
  Cenários acrescentados além dos cinco do plano, cada um por um modo de falha próprio da tela:
  RN-06 (o verbo cru continua visível como legenda secundária — o grupo "Criação" não pode
  **esconder** que a linha foi gravada com `CRIAR`); RN-08 (segredo `'(alterado)'` dos dois
  lados aparece e não desmascara); `de: null` vira travessão e não a string `"null"`; **400** de
  data inválida cai no painel de erro e **não** no estado vazio (senão a RN-03 do servidor
  chegaria ao usuário como "nada aconteceu", que é o defeito que ela existe para matar); 403 de
  perfil idem; e o gate visual sem `configurar` não chega a chamar a rota.
- [x] **Step 2: implementar.** Molde: `AlertasAlmoxarifado.js` (Etapa 16).
  **Data — o passo anterior deste plano mandava o ERRADO** (achado A3): dizia
  "`toLocaleString('pt-BR')`, não repita o bug de DATE-only da Etapa 16", quando o molde que ele
  manda copiar faz o oposto e está certo (`AlertasAlmoxarifado.js:62-64`): o timestamp do SQLite
  vem em **UTC sem sufixo**, e sem o `'Z'` o V8 lê como hora local. Reproduzido:
  `'2026-08-29 01:30:00'` sai como **29/08 01:30** (dia errado) em vez de 28/08 22:30. Use
  `replace(' ', 'T') + 'Z'` antes de formatar — numa tela cuja pergunta é "quem mexeu nisto
  **ontem**", errar o dia é defeito de correção, não de formatação.
  **Detalhe que a execução teve de resolver e o plano não previa: o cenário da data só sabe
  falhar num fuso ≠ UTC.** Em UTC as duas leituras (com e sem `'Z'`) coincidem e o teste passaria
  provando nada. O arquivo fixa `process.env.TZ = 'America/Sao_Paulo'` **antes de qualquer
  `Date`** (Node reconfigura o V8 ao setar a variável em runtime) e o cenário abre com uma
  guarda — `getTimezoneOffset() !== 0` — para que uma máquina em UTC **derrube** o teste em vez
  de deixá-lo verde e vazio.
- [x] **Step 3:** rota lazy + `<Route path="auditoria">` + item de menu com **`adminOnly`**
  (verificado que `canConfigureModule` espelha o `getPerfilFromUser` do backend, então admin de
  módulo com `role='usuario'` vê o item **e** passa no gate). O item ficou **vizinho de
  "Configurações"**, os dois únicos do menu do almoxarifado que exigem `configurar`.
  Acrescentado também em `ROUTE_PREFETCH` (`/almoxarifado/auditoria`), como as demais telas.
- [x] **Step 4: controle positivo com alvo definido** (achado A10 — "controle positivo" sem
  alvo vira `md5sum` cerimonial): troque o `params` do fetch por objeto vazio → o cenário
  "filtro de período dispara nova busca com os params certos" tem de ficar vermelho.
  **Resultado: cinco sabotagens, todas commitadas depois de `0a57fe1`, todas com `md5sum`
  antes / depois / restaurado e `git diff --stat` vazio no fim** (baseline
  `97ffb10549eecdc35f064933589c1dd4`):
  1. `{ params }` → `{ params: {} }` (a do plano) → **2 vermelhos**, o previsto e mais o
     "limpar filtros volta a buscar sem nenhum deles" — que também lê os params, então cair
     junto está certo (13/2).
  2. tirar o `'Z'` do `formatDataHora` → cai **só** o cenário da data, e pela asserção do dia
     (14/1). É o achado A3 provado, não declarado.
  3. **acrescentada pela execução, e ela é a que guarda o achado A5.** As duas primeiras deixam
     o `Array.isArray` verde: trocar os params por `{}` derruba o cenário por `data_inicio`
     antes de chegar no `acao`. Sabotagem: `verbos.join(',')` → `verbos` (o array cru) → o
     cenário cai **na linha do `Array.isArray`** (`Expected: false, Received: true`), que é
     exatamente o defeito que produziria `acao[]=A&acao[]=B` e 500 na rota. Sem ela, a asserção
     mais específica desta task ficaria **não provada** (14/1).
  4. trocar a frase do estado vazio por "Nao ha registros" → cai o cenário do vocabulário,
     pelas duas metades (a frase certa ausente e a proibida presente) (14/1).
  5. `Sem detalhes registrados` → `XXX` **e** `{dados.truncado && (` → `{false && (` numa só
     rodada → caem os dois cenários correspondentes e **nenhum outro** (13/2), o que também
     mostra que eles não estão se cobrindo por acidente.
- [x] **Step 5:** `CI=true` test (546/546) e build (limpo); commit `0a57fe1`.

**Divergências do plano, e o motivo de cada uma:**
- **Paginação por `offset` não estava no plano e foi acrescentada.** Sem ela o aviso de corte é
  um beco sem saída: a tela diria "encontrei 4820 e mostro 200" sem oferecer como ver o resto,
  e o C1 já expõe `limite`/`offset`. Trocar filtro ou limpar reseta o offset para 0 — manter a
  página 4 de um resultado novo daria lista vazia sem motivo aparente, que nesta tela é
  justamente a resposta que não pode aparecer por engano.
- **A tela mostra o de/para, e não o JSON cru de `dados_anteriores`/`dados_novos`** (RN-07: "o
  de/para mostra o que mudou, não o JSON"). Considerado e descartado exibir os dois lados crus
  num toggle: reintroduziria na tela o material que a régua do servidor já leu, e é por ali que
  um "vamos só melhorar a exibição" volta a virar diff no cliente.
- **`<Route path="auditoria">` ficou sem o `ProtectedAlmoxConfigRoute`** que envolve
  `configuracoes`, como o plano especifica. O gate real é o `requirePermission('configurar')` da
  rota do C1, e a tela já barra visualmente pelo `useAlmoxPermissoes` — quem chegar pela URL vê
  o painel de sem-permissão, não uma tela vazia (RN-01).

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
