# Etapa 22 — A trilha ganha leitor (plano de implementação)

> **For agentic workers:** REQUIRED SUB-SKILL: use `superpowers:subagent-driven-development`
> para executar task a task. Os passos usam checkbox (`- [ ]`) para rastreio.

**Goal:** dar leitor à trilha de auditoria do almoxarifado — filtros que respondem "quem mexeu
nisto, quando", índices para a tabela aguentar isso, e a tela que consome.

**Architecture:** uma função pura nova (`auditLabels.js`) como fonte única dos rótulos e dos
grupos de sinônimo; a rota existente ganha quatro filtros e validação de data; uma rota de
opções alimentada pelo banco; e uma tela React nova contra contrato congelado.

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
| RN-03 | Data malformada é **400**, não filtro ignorado | `auditoriaFiltros` |
| RN-04 | Período inclusivo nos dois extremos (`data_fim` + 1 dia) | `auditoriaFiltros` |
| RN-05 | Os selects vêm do banco (`/auditoria/opcoes`) | `auditoriaFiltros` |
| RN-06 | Sinônimo não divide a lista (`CRIACAO`+`CRIAR` = "Criação") | `auditLabels` |
| RN-07 | O de/para mostra os campos alterados, via `configDiff.calcularDiff` | tela + integração |
| RN-08 | Segredo não desmascara na tela | integração |
| RN-09 | A trilha é somente leitura | declarada; nenhuma rota de escrita criada |

## Contratos congelados

**C1 — `GET /api/almoxarifado/auditoria`** (gate `configurar`, já existente)

Query: `entidade`, `entidade_id`, `usuario_id`, `acao`, `data_inicio`, `data_fim`, `limite`
(1..1000, default 200), `offset`.

- **`acao` aceita valor único OU lista separada por vírgula** (`acao=CRIACAO,CRIAR`) — é assim
  que a RN-06 é cumprida sem o backend precisar saber o que é rótulo. Vazio entre vírgulas é
  ignorado; lista só com vazios equivale a não filtrar.
- `data_inicio`/`data_fim`: `AAAA-MM-DD`. Fora do formato **ou** data impossível
  (`2026-13-45`) → **400** `{ "error": "Data inválida: use o formato AAAA-MM-DD" }`.
- `data_fim` é **inclusivo**: a régua é `created_at < date(data_fim, '+1 day')`.

Resposta 200 (**forma inalterada**, congelada na Etapa 18):
```json
{ "total": 0, "limite": 200, "offset": 0, "truncado": false, "itens": [] }
```
Cada item: `{ id, entidade, entidade_id, acao, usuario_id, usuario_nome, dados_anteriores,
dados_novos, justificativa, created_at }` — `dados_*` são **string JSON ou null**, como estão
no banco; a rota **não** faz parse (quem faz é a tela).

**C2 — `GET /api/almoxarifado/auditoria/opcoes`** (mesmo gate)

```json
{
  "entidades": [{ "valor": "material", "rotulo": "Material" }],
  "acoes":     [{ "rotulo": "Criação", "verbos": ["CRIACAO", "CRIAR"] }],
  "usuarios":  [{ "id": 7, "nome": "Admin Foto" }]
}
```
Só valores **realmente presentes** no banco (`SELECT DISTINCT`). Verbo sem rótulo no mapa entra
com `rotulo` = o próprio verbo (nunca some da lista — sumir esconderia atos).
`usuarios`: `DISTINCT usuario_id, usuario_nome` com `usuario_id NOT NULL`, ordenado por nome.

**C3 — `services/almoxarifado/auditLabels.js`**

```js
ROTULOS_ENTIDADE      // { material: 'Material', conferencia: 'Conferência', ... }
GRUPOS_ACAO           // [{ rotulo: 'Criação', verbos: ['CRIACAO', 'CRIAR'] }, ...]
rotularEntidade(v)    // -> string (o próprio valor se não mapeado)
rotularAcao(v)        // -> string (o próprio valor se não mapeado)
verbosDoGrupo(rotulo) // -> string[] ([] se o rótulo não existe)
```
Objetos **congelados** (`Object.freeze`), como `ALERT_REGISTRY`.

---

### Task 1 (tronco): rótulos e índices

**Files:** Create `server/services/almoxarifado/auditLabels.js`; Modify
`server/services/almoxarifado/schema.js`; Test `server/tests/api/auditLabels.api.test.js`.

**Interfaces:** Produces C3 — a Task 2 consome `GRUPOS_ACAO`/`rotularEntidade`.

- [ ] **Step 1: teste que falha.** Cenários: (a) `rotularAcao('CRIACAO')` e
  `rotularAcao('CRIAR')` devolvem **a mesma** string; (b) `verbosDoGrupo('Criação')` traz os
  dois; (c) verbo desconhecido volta ele mesmo, **não** `undefined` nem `''`; (d)
  `Object.isFrozen(GRUPOS_ACAO)`; (e) **cobertura** — varra `routes/` e `services/` por
  `acao: '<VERBO>'` e `entidade: '<nome>'` e afirme que cada um achado tem rótulo. Este último
  é o que impede "ação nova esquece o rótulo" (molde do `alertRegistry`).
  **Cuidado com teste vazio:** a varredura já falhou nesta base com caminho errado + `2>/dev/null`
  engolindo o erro. Afirme **primeiro** que a varredura achou pelo menos 20 verbos e 15
  entidades — se achar 0, o teste passa provando nada.
- [ ] **Step 2: rodar, ver falhar, implementar, verde.** Os grupos que a medição exige, no
  mínimo: `CRIACAO`+`CRIAR` → "Criação"; `EDICAO`+`ATUALIZACAO`+`ATUALIZAR` → "Edição";
  `EXCLUSAO`+`DESATIVACAO` **NÃO se agrupam** (excluir e desativar são atos diferentes nesta
  base — desativar é `ativo = 0` e é reversível por `REATIVACAO`).
- [ ] **Step 3: índices** em `schema.js`, ao lado dos 12 existentes, padrão
  `CREATE INDEX IF NOT EXISTS` (idempotente, sem ledger):
  `idx_auditoria_almox_created (created_at)`, `idx_auditoria_almox_entidade (entidade, entidade_id)`,
  `idx_auditoria_almox_usuario (usuario_id)`.
  Prove que existem: `SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='auditoria_log_almoxarifado'`
  no teste — asserção de **3**, não "não vazio".
- [ ] **Step 4: controle positivo** (commitar antes): apague um verbo de um grupo → o cenário
  (a) **e** o de cobertura têm de cair. Reverter, verde de novo.
- [ ] **Step 5: `npm run test:api`; commit.**

---

### Task 2 (tronco): filtros, validação e opções

**Files:** Modify `server/routes/almoxarifado/extended.js:1337`;
Test `server/tests/api/auditoriaFiltros.api.test.js`.

**Interfaces:** Consumes C3. Produces C1 e C2 — a Task 3 constrói contra eles.

- [ ] **Step 1: teste que falha.** Cenários, todos gravando linhas de auditoria direto por
  `dbRun` no arranjo (a leitura é o que está sob teste, não a escrita):
  - RN-02: cada filtro isolado devolve só o esperado; `usuario_id` + `data_inicio` combinados.
  - RN-02: `acao=CRIACAO,CRIAR` devolve as linhas **dos dois** verbos.
  - RN-03: `data_inicio=ontem` → **400** com a mensagem literal; `data_fim=2026-13-45` → 400.
    **Asserção de peso:** não pode ser 200 com `itens: []` — 200 vazio numa auditoria parece
    prova de que nada aconteceu.
  - RN-04: linha gravada **agora**, consulta com `data_fim` = hoje → **aparece**. É o cenário
    que pega o erro de limite (`<= '2026-08-28'` contra `'2026-08-28 14:30:00'` excluiria o dia
    inteiro).
  - RN-05: `/opcoes` traz a entidade e o usuário gravados no arranjo, e o verbo desconhecido
    aparece com `rotulo` igual a ele mesmo.
  - RN-01: usuário sem `configurar` → **403** nas duas rotas (a de opções é nova e é onde o
    gate costuma faltar).
  - Regressão: **a forma da resposta não mudou** — `{total, limite, offset, truncado, itens}`.
- [ ] **Step 2: implementar.** `data_fim` inclusivo via `created_at < date(?, '+1 day')`.
  Validação: regex `/^\d{4}-\d{2}-\d{2}$/` **e** data real (`Number.isNaN(Date.parse(v))`
  pega `2026-13-45`, que passa no regex). A validação roda **antes** do `COUNT`.
- [ ] **Step 3: controle positivo** (commitar antes): trocar `< date(?, '+1 day')` por
  `<= ?` → o cenário RN-04 tem de ficar vermelho. Reverter.
- [ ] **Step 4: `npm run test:api`; commit.**

---

### Task 3 (galho): a tela

**Files:** Create `client/src/components/almoxarifado/AuditoriaAlmoxarifado.js` e
`AuditoriaAlmoxarifado.test.js`; Modify `client/src/routes/lazyModules.js`,
`client/src/App.js`, `client/src/components/Layout.js`.

**Interfaces:** Consumes C1 e C2 (**contra o contrato congelado, com mock de JSON na fronteira
HTTP** — é a única fronteira onde mock é legítimo nesta base).

- [ ] **Step 1: teste que falha** (`react-scripts test`): filtro de período dispara nova busca
  com os params certos; `truncado: true` mostra o aviso de corte; expandir uma linha mostra o
  de/para; sem linhas mostra "nenhum registro **para os filtros aplicados**" (nunca "não há
  registros" — a diferença importa numa auditoria).
- [ ] **Step 2: implementar.** Molde: `AlertasAlmoxarifado.js` (Etapa 16). O de/para usa
  `configDiff.calcularDiff` — **importe o módulo, não desestruture** (a Etapa 20 quebrou as
  três rotas de configuração exatamente por isso). Se o módulo do servidor não for importável
  pelo client, **copie a chamada, não a lógica**: replique via um utilitário em
  `client/src/utils/` que faça a MESMA comparação e diga no comentário quem é a fonte.
  Datas: `created_at` é DATETIME, então `toLocaleString('pt-BR')` — **não** repita o bug de
  DATE-only da Etapa 16 (aquele tratamento é para `AAAA-MM-DD` puro).
- [ ] **Step 3:** rota lazy + `<Route path="auditoria">` + menu com **`adminOnly`**.
- [ ] **Step 4: controle positivo; `CI=true` test e build; commit.**

---

### Task 4 (integração, cruza os galhos)

**Files:** Test `server/tests/api/auditoriaFluxoCompleto.api.test.js`.

- [ ] **Step 1:** escrever de verdade por uma rota real instrumentada (trocar a foto de um
  material — `POST /materiais/:id/foto`, instrumentada na Etapa 20), depois **ler pela C1** com
  `usuario_id` + `data_inicio`/`data_fim` de hoje, e conferir que o item traz o de/para do
  arquivo. Prova que a trilha fecha ponta a ponta, o que verde por unidade não prova.
- [ ] **Step 2:** RN-08 — gravar uma configuração secreta pelo PUT real e conferir que o item
  lido traz `'(alterado)'`, **e** afirmar que o valor real **não** aparece em nenhum lugar do
  corpo da resposta (asserção negativa sobre o JSON inteiro).
- [ ] **Step 3: suíte completa (os cinco comandos); commit.**

---

## Próxima tarefa detalhada (para retomar sem reler o código)

Se a execução parar aqui, o próximo passo é a **Fase 2**: despachar um agente fresco com este
plano + o design e três perguntas — os contratos cobrem os casos de erro e as mensagens
literais? As RN batem com a spec? A Task 3 é galho de verdade (só consome C1/C2)? Cinco tasks
seguidas nesta base acharam defeito em código que o plano trazia pronto, e a Fase 2 é o passo
de maior retorno medido do fluxo.
