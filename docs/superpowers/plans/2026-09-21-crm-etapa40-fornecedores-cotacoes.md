# Etapa 40 — Fornecedores e Cotações ganham tela — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** os quatro caminhos mortos do módulo Compras (`/compras/fornecedores/novo`, `/compras/fornecedores/editar/:id`, `/compras/cotacoes/nova`, `/compras/cotacoes/editar/:id`) passam a abrir um formulário que grava — com as portas de servidor que isso exige (Zod nas duas de fornecedor, `GET /:id` de fornecedor, `POST`/`GET /:id`/`PUT` de cotação, 409 por cotação na exclusão de fornecedor) e sem recusar nada que o modal de `FornecedoresDoGrupo` já manda hoje.

**Architecture:** o tronco (T1) congela o contrato interno — os dois schemas Zod com as literais, os dois helpers exportados do serviço de pedido e a tabela `cotacoes` no harness. Sobre ele, **quatro galhos independentes** em worktrees: servidor-fornecedor (T2), servidor-cotação (T3), cliente-fornecedor (T4), cliente-cotação (T5). A T6 cruza os galhos pela rota e pelo serviço; a T7 fecha pela skill `fechar-etapa`. Fornecedor fica **SQL na rota + `validate()`** (como hoje); cotação ganha **`cotacaoService.js`** (como pedido).

**Tech Stack:** Express + `sqlite3` (callbacks, com `dbRun`/`dbGet`/`dbAll` promissificados em `services/almoxarifado/db.js`), `zod@4` (`z.looseObject`, `validate()` de `services/almoxarifado/validation.js`), `supertest` + runner próprio por arquivo (`server/tests/api/*.api.test.js`, harness `tests/helpers/testApp.js`); React 18 (CRA) com `react-router-dom` v6, `axios` (`services/api`), `react-toastify`, jest + `react-dom/client` sem RTL.

**Spec:** `docs/superpowers/specs/2026-09-21-crm-etapa40-fornecedores-cotacoes-design.md` (D1–D14, RN-E01…RN-E16, contratos §5). **Medições:** `.superpowers/sdd/etapa40-fase0-servidor.md` e `etapa40-fase0-cliente.md` (2026-09-21, contra `90597c7`). **BASE:** `7ccfc85`.

## Global Constraints

- **Todas as linhas citadas** (`arquivo:linha`) foram medidas em `90597c7`. Antes de editar, **reconte** com `grep -n` — a T1 desloca linhas de `schemas.js` e do harness; a T2 e a T3 deslocam `routes/compras.js`.
- **`z.looseObject`, nunca `z.object`**, em todo schema de `POST`/`PUT` (`validate()` substitui `req.body` por `parsed.data`; `z.object` faz strip silencioso — quinta encarnação do defeito nesta base).
- **Literal na construção E no refinamento** de todo campo tipado (`z.number({ error: MSG }).min(0, MSG)`): sem isso o 400 sai em inglês.
- **Sem coerção** em `fornecedor_id`/`valor_total` (`'10'` é recusado); a tela coage com `Number()` antes do `POST`.
- **Nada que `FornecedoresDoGrupo.js` manda hoje pode passar a ser recusado**: `''` em qualquer texto, `grupo_id` string numérica, `grupo_id: null`, `POST` com só 4 chaves. Cenários (1) e (2) da T2 são **caracterização escrita antes do retrofit**.
- **Gate de todas as rotas novas:** `authenticateToken, checkModulePermission('compras')` — **uma** camada, nenhum `requirePermission` (contrato de `routes/compras.js:43-45`).
- **Nenhuma rota nova é `DELETE`**, então nenhuma precisa ficar acima do genérico `:343`; ficam **junto do recurso** (fornecedor em `:534-577`, cotação em `:313-340`) por convenção declarada (`:154-158`).
- **Datas:** `dataIsoOpcional` de `schemas.js:94-101`; no client, `hojeISO` **local** (cópia de `PedidoCompraForm.js:110-114`), nunca `toISOString`.
- **Erro do servidor na tela: `role="alert"`; toast só no sucesso** (D11).
- **Cada suíte de client** põe a tela nova em `reais` do Proxy de `lazyModules` e inclui `patch` no mock do `api`; fixtures com ids fora de `{312, 355, 418-421, 640, 901, 907}`.
- **Commits:** português, corpo sem acento, um por task, `git add` de caminhos explícitos, mensagem em `…\scratchpad\msg-e40-t<N>.txt` (nome único por agente). Termina com `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- **Sabotagem:** `md5sum` antes/depois/pós-restauro, âncora contada (`grep -cF` = 1), restauro por cópia do scratchpad, **nunca `git checkout --`** antes do commit. `python3` não executa nesta máquina; `perl -0pi -e` ou `sed`. Base é LF: **medir CR com `perl -ne '$c++ if /\r/'`** depois de cada edição.
- **Teste que passa de primeira é suspeito**: cada task tem controle positivo nomeado.

---

## ⚠️ O modo de falha desta etapa: o retrofit que recusa o consumidor que já existe

A Etapa 36 mediu o `z.object` fazendo strip de `nota_fiscal` e virando todo `POST` válido em 400. O
equivalente aqui é mais silencioso: o `PUT` de fornecedor tem **três** chamadores em
`FornecedoresDoGrupo.js` (`:131`, `:167`, `:191`) que mandam `email: ''`, `grupo_id: '3'` e
`grupo_id: null`, e **nenhum teste** os cobre. Um `z.number()` em `grupo_id` ou um `z.string().email()`
passa verde na suíte nova e quebra o modal do grupo em produção. Por isso a T2 **começa** escrevendo
os quatro payloads reais como cenários **contra o código de hoje**, vê os quatro verdes, **só então**
liga o `validate()` — e os quatro têm de continuar verdes.

### Três regras herdadas, e valem para TODAS as tasks

1. **Ao medir ausência, teste a régua contra um caso que existe** (`grep pedidos/novo` antes de
   afirmar que `fornecedores/novo` não existe).
2. **Leia QUAL asserção caiu na sabotagem**, não só o placar.
3. **Marque o plano ao terminar cada task** (hash, divergências, o que o plano trazia errado).

---

## Regras de negócio — `RN-E01…RN-E16`

As dezesseis estão na seção 4 do design, com enunciado e cenário. Resumo com **quem prova cada uma**:

| RN | Enunciado curto | Prova |
|---|---|---|
| RN-E01 | `razao_social` obrigatória nas duas portas, literal `Razão social é obrigatória` | T2 (3) |
| RN-E02 | `PUT` de fornecedor é substituição total dos 7 textos (caracterizado, não mudado) | T2 (7), T4 (e) |
| RN-E03 | `grupo_id`: número/string numérica/`null`/`''`/ausente; `null` no `PUT` **limpa**; `'abc'` → 400 | T2 (4)(5), T4 (h) |
| RN-E04 | `status` no `PUT`: `ativo`/`inativo`; `POST` grava `ativo` sempre | T2 (6), T4 (e) |
| RN-E05 | inativo some do aux do almoxarifado; pedido ainda o aceita (declarado) | T6 |
| RN-E06 | `GET /fornecedores/:id` com projeção nomeada; 404 | T2 (8), T4 (e) |
| RN-E07 | `numero` da cotação obrigatório, digitado; duplicado → 409 com o número | T3 (2)(9), T5 (f) |
| RN-E08 | `fornecedor_id` int positivo; inexistente → 400 `Fornecedor não encontrado` | T3 (3), T6 |
| RN-E09 | datas `''` → `NULL`; fora do formato → 400 | T3 (4) |
| RN-E10 | `status` ∈ `STATUS_COTACAO`, default `em_analise` | T3 (1)(5) |
| RN-E11 | `valor_total` número ≥ 0, default 0 | T3 (1)(6) |
| RN-E12 | fornecedor com cotação → 409; pedido tem precedência | T2 (9), T6 |
| RN-E13 | `PUT` de cotação mesmo schema; 404 no `PUT` e no `GET` | T3 (7) |
| RN-E14 | os 4 caminhos abrem formulário; salvar navega; erro em `role="alert"` | T4 (a)(b)(d)(e)(f), T5 (a)(b)(d)(e)(f) |
| RN-E15 | recusa local sem chamar a API | T4 (c), T5 (c) |
| RN-E16 | rótulo `Nova Cotação`; opções de status por aba | T5 (b)(g) |

---

## Contratos de API congelados

Idênticos à seção 5 do design. O que cada galho consome está no bloco **Interfaces** da task.

### 1. `schemas.js` — o que a T1 exporta (nomes EXATOS)

```
FornecedorSchema, CotacaoSchema, STATUS_FORNECEDOR, STATUS_COTACAO,
RAZAO_SOCIAL_OBRIGATORIA, GRUPO_FORNECEDOR_INVALIDO, STATUS_FORNECEDOR_INVALIDO,
NUMERO_COTACAO_OBRIGATORIO, FORNECEDOR_COTACAO_OBRIGATORIO, STATUS_COTACAO_INVALIDO,
VALOR_COTACAO_NEGATIVO, DATA_COTACAO_INVALIDA, VALIDADE_COTACAO_INVALIDA
```

### 2. `pedidoCompraService.js` — o que a T1 acrescenta ao `module.exports`

```
erro(msg, status = 400)          // já existe em :113, passa a ser exportado
assertFornecedor(db, id)         // já existe em :255, passa a ser exportado; lança erro(FORNECEDOR_NAO_ENCONTRADO)
FORNECEDOR_NAO_ENCONTRADO        // 'Fornecedor não encontrado' — constante NOVA, usada por assertFornecedor
```

### 3. `cotacaoService.js` (T3)

```
criarCotacao(db, dados)         -> Promise<linha>   // 400 fornecedor; 409 numero
obterCotacao(db, id)            -> Promise<linha>   // throw erro(COTACAO_NAO_ENCONTRADA, 404)
atualizarCotacao(db, id, dados) -> Promise<linha>   // 404; 400; 409
COTACAO_NAO_ENCONTRADA = 'Cotação não encontrada'
FORNECEDOR_COM_COTACOES = 'Fornecedor possui cotações — não pode ser excluído'
numeroDuplicado(numero) => `Já existe uma cotação com o número ${numero}`
```

`linha` = `{ id, numero, fornecedor_id, fornecedor_nome, valor_total, data_cotacao, validade, status, observacoes, created_at, updated_at }`.

### 4. Rotas (T2, T3) — ver design §5.2 e §5.4. Formato do 400 de schema: `{ error: 'Dados inválidos — <campo>: <literal>' }`.

### 5. Client (T4, T5) — `data-testid`, `h1`, toasts e payloads: design §5.5, **verbatim**.

---

## Estrutura de arquivos

| Arquivo | Task | Responsabilidade |
|---|---|---|
| `server/services/compras/schemas.js` (modificar, fim do arquivo + `module.exports`) | T1 | os dois schemas e as literais |
| `server/services/compras/pedidoCompraService.js` (`:113`, `:255-258`, `module.exports :1012`) | T1 | exportar `erro`, `assertFornecedor`, `FORNECEDOR_NAO_ENCONTRADO` |
| `server/tests/helpers/testApp.js` (após o stub de `pedidos_compra`, `:100-111`) | T1 | `cotacoes` no harness |
| `server/tests/api/comprasSchemasFornecedorCotacao.api.test.js` (novo) | T1 | os schemas por `safeParse`, com as literais |
| `server/routes/compras.js` (`:534-577` fornecedor; `:402-416` genérico) | T2 | `GET /:id`, `validate()` nas duas portas, `status`, `grupo_id: null`, 409 por cotação |
| `server/tests/api/comprasFornecedorRotas.api.test.js` (novo) | T2 | 11 cenários |
| `server/services/compras/cotacaoService.js` (novo) | T3 | criar/obter/atualizar |
| `server/routes/compras.js` (`:313-340` cotação) | T3 | `POST`, `GET /:id`, `PUT` |
| `server/tests/api/comprasCotacaoRotas.api.test.js` (novo) | T3 | 9 cenários |
| `client/src/components/compras/FornecedorForm.js` (novo) | T4 | a tela |
| `client/src/routes/lazyModules.js` (após `:61`), `client/src/App.js` (após `:362`) | T4 | export lazy + 2 rotas |
| `client/src/components/compras/FornecedorForm.test.js` (novo) | T4 | 8 cenários |
| `client/src/components/compras/CotacaoForm.js` (novo) | T5 | a tela |
| `client/src/routes/lazyModules.js` (após `:63`), `client/src/App.js` (após `:374`) | T5 | export lazy + 2 rotas |
| `client/src/components/Compras.js` (`:496` rótulo; `:519-525` opções) | T5 | RN-E16 |
| `client/src/components/compras/CotacaoForm.test.js` (novo) | T5 | 7 cenários |
| `server/tests/api/comprasFornecedorCotacaoIntegracao.api.test.js` (novo) | T6 | rota + serviço |
| os 7 artefatos da `fechar-etapa` | T7 | documentação |

---

## Sort topológico

| Task | Tipo | Depende de | Toca |
|---|---|---|---|
| T1 schemas + exports + harness | **tronco** | — | `schemas.js`, `pedidoCompraService.js` (3 linhas), `testApp.js` |
| T2 servidor-fornecedor | **galho** (worktree `wt-e40-t2`) | T1 | `routes/compras.js` `:534-577` e `:402-416` |
| T3 servidor-cotação | **galho** (worktree `wt-e40-t3`) | T1 | `cotacaoService.js` (novo), `routes/compras.js` `:313-340` |
| T4 cliente-fornecedor | **galho** (worktree `wt-e40-t4`) | T1 (só o contrato; mock HTTP) | `FornecedorForm.js`, `App.js`, `lazyModules.js` |
| T5 cliente-cotação | **galho** (worktree `wt-e40-t5`) | T1 (contrato) | `CotacaoForm.js`, `App.js`, `lazyModules.js`, `Compras.js` |
| T6 integração | tronco | T2 + T3 integrados | teste novo |
| T7 fechamento | tronco | T6 | docs |

**Conflitos previstos na integração (Fase 4)** *(corrigido pela Fase 2, I3)*: T2 e T3 editam
`routes/compras.js` em blocos distantes (`:313-340` vs `:534-577`/`:402-416`), e **a linha `:60` do
`require` dos schemas é editada pela T1** (tronco) com os dois nomes — T2 e T3 **não a tocam**; a T3
acrescenta só o `require` de `cotacaoService` numa linha nova após `:61`. T4 e T5 editam `App.js` em
**dois** lugares cada: as rotas (T4 após `:362`; T5 após `:374`) **e o `import` de `./routes/lazyModules`
(`:43-46`)** — este segundo **vai conflitar** (as duas acrescentam um nome ao mesmo bloco); e
`lazyModules.js` (T4 após `:61`; T5 após `:63`) pode conflitar por adjacência. Resolução: manter as
duas inserções. **Ordem de merge T2 → T3 → T4 → T5**, rodando a suíte inteira depois de cada um, e
**recontando as âncoras da T5 depois do merge da T4** (a inserção da T4 desloca `:374` em 3 linhas).

**Worktrees com `node_modules` por junction** (D14). Para cada galho, a partir da branch, no commit da T1:

```
git worktree add ../CRM-wt-e40-tN -b e40-tN <hash-T1>
cmd /c mklink /J "..\CRM-wt-e40-tN\server\node_modules" "%CD%\server\node_modules"
cmd /c mklink /J "..\CRM-wt-e40-tN\client\node_modules" "%CD%\client\node_modules"
```

Prova de que a junction serve: `cd ../CRM-wt-e40-tN/server && node tests/api/comprasPedidoStatus.api.test.js`
tem de dar `7 passou`. Se `mklink` falhar (permissão), **fallback declarado:** T2/T3 em worktrees
com `npm ci` só em `server/` (rápido), T4/T5 **em fila** na árvore principal — registrar na retro.
Ao integrar: `git cherry-pick <hash>` na branch principal e **reescrever o hash no plano** (o do
worktree não existe fora do reflog local).

---

### Task 1: os dois schemas, os três exports e `cotacoes` no harness **(tronco)**

**Files:**
- Modify: `server/services/compras/schemas.js` (antes do `module.exports`, `:149`; e o `module.exports :149-162`)
- Modify: `server/services/compras/pedidoCompraService.js:255-258` (`assertFornecedor`), `:1012-1031` (`module.exports`)
- Modify: `server/tests/helpers/testApp.js` (após o `CREATE TABLE IF NOT EXISTS pedidos_compra`, `:100-111`)
- Test: `server/tests/api/comprasSchemasFornecedorCotacao.api.test.js` (novo)

**Interfaces:**
- Consumes: `dataIsoOpcional` (`schemas.js:97-100`), `z` (`zod`).
- Produces: os 13 exports de `schemas.js` e os 3 de `pedidoCompraService.js` listados nos contratos 1 e 2. **T2, T3, T6 importam por esses nomes.**

- [x] **Step 1: ler o DDL local de `cotacoes` que já existe** — `server/tests/api/comprasPedidoEditarExcluir.api.test.js:93-108`. O stub do harness tem de ser **compatível** com ele (mesmas colunas, `fornecedor_id` nulável, sem FK), porque `CREATE TABLE IF NOT EXISTS` faz "quem cria primeiro vence" e o harness roda antes.

- [x] **Step 2: escrever o teste dos schemas (vermelho: `FornecedorSchema is not a function`)**

`server/tests/api/comprasSchemasFornecedorCotacao.api.test.js`:

```js
/**
 * Etapa 40, Task 1 — os schemas `FornecedorSchema` e `CotacaoSchema` por `safeParse`, ANTES de
 * qualquer rota usa-los. Cada literal e afirmada VERBATIM contra a constante exportada, porque a
 * rota (T2/T3) so as repassa.
 *
 * ⚠️ Os payloads (a)-(d) sao os QUATRO que `client/src/components/FornecedoresDoGrupo.js` manda
 * hoje (`:217`, `:131`, `:167`, `:191`), copiados chave a chave. Se um deles deixar de passar,
 * o modal do grupo quebra em producao com a suite de rotas verde.
 *
 * Executar: cd server && node tests/api/comprasSchemasFornecedorCotacao.api.test.js
 */
const assert = require('assert');
const S = require('../../services/compras/schemas');

let passed = 0; let failed = 0;
function test(name, fn) {
  return Promise.resolve().then(fn).then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}
const msgs = (r) => r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');

(async () => {
  // ── Fornecedor: os quatro payloads REAIS do modal do grupo ─────────────────────────────────
  await test('(a) POST do modal: 4 chaves, grupo_id STRING -> passa e grupo_id vira 3', () => {
    const r = S.FornecedorSchema.safeParse({ razao_social: 'ACME', nome_fantasia: '', cnpj: '', grupo_id: '3' });
    assert.ok(r.success, msgs(r));
    assert.strictEqual(r.data.grupo_id, 3);
    assert.strictEqual(r.data.nome_fantasia, '');
  });
  await test('(b) PUT editar do modal: 7 textos vazios + grupo_id string -> passa, textos ficam ""', () => {
    const r = S.FornecedorSchema.safeParse({
      razao_social: 'ACME', nome_fantasia: '', cnpj: '', contato: '', email: '', telefone: '', endereco: '', grupo_id: '7',
    });
    assert.ok(r.success, msgs(r));
    assert.strictEqual(r.data.email, '');
    assert.strictEqual(r.data.grupo_id, 7);
  });
  await test('(c) PUT remover do grupo: grupo_id null -> passa e continua null (NAO undefined)', () => {
    const r = S.FornecedorSchema.safeParse({ razao_social: 'ACME', nome_fantasia: '', cnpj: '', contato: '', email: '', telefone: '', endereco: '', grupo_id: null });
    assert.ok(r.success, msgs(r));
    assert.strictEqual(r.data.grupo_id, null);
    assert.ok('grupo_id' in r.data, 'a chave tem de sobreviver para a rota distinguir "limpar" de "nao mexer"');
  });
  await test('(d) grupo_id AUSENTE -> passa e a chave NAO existe no parsed (a rota nao mexe)', () => {
    const r = S.FornecedorSchema.safeParse({ razao_social: 'ACME' });
    assert.ok(r.success, msgs(r));
    assert.strictEqual(r.data.grupo_id, undefined);
  });
  await test('(e) RN-E01 razao_social vazia, so espacos e ausente -> a literal RAZAO_SOCIAL_OBRIGATORIA', () => {
    for (const corpo of [{ razao_social: '' }, { razao_social: '   ' }, {}]) {
      const r = S.FornecedorSchema.safeParse(corpo);
      assert.ok(!r.success, `devia recusar ${JSON.stringify(corpo)}`);
      assert.strictEqual(msgs(r), `razao_social: ${S.RAZAO_SOCIAL_OBRIGATORIA}`);
    }
    assert.strictEqual(S.RAZAO_SOCIAL_OBRIGATORIA, 'Razão social é obrigatória');
  });
  await test('(f) RN-E03 grupo_id "", 0, -2 -> null (limpa); "abc", 3.5 -> 400 com a literal', () => {
    for (const v of ['', 0, -2, 'NaN']) {
      const r = S.FornecedorSchema.safeParse({ razao_social: 'A', grupo_id: v });
      if (v === 'NaN') { assert.ok(!r.success); continue; }
      assert.ok(r.success, `${JSON.stringify(v)}: ${r.success ? '' : msgs(r)}`);
      assert.strictEqual(r.data.grupo_id, null, `grupo_id ${JSON.stringify(v)} devia virar null`);
    }
    for (const v of ['abc', 3.5, {}]) {
      const r = S.FornecedorSchema.safeParse({ razao_social: 'A', grupo_id: v });
      assert.ok(!r.success, `devia recusar grupo_id ${JSON.stringify(v)}`);
      assert.strictEqual(msgs(r), `grupo_id: ${S.GRUPO_FORNECEDOR_INVALIDO}`);
    }
  });
  await test('(g) RN-E04 status ativo/inativo passam; "x" -> literal com a lista; ausente -> undefined', () => {
    assert.ok(S.FornecedorSchema.safeParse({ razao_social: 'A', status: 'inativo' }).success);
    const r = S.FornecedorSchema.safeParse({ razao_social: 'A', status: 'x' });
    assert.ok(!r.success);
    assert.strictEqual(msgs(r), `status: ${S.STATUS_FORNECEDOR_INVALIDO}`);
    assert.strictEqual(S.STATUS_FORNECEDOR_INVALIDO, 'status do fornecedor inválido (use ativo ou inativo)');
    assert.strictEqual(S.FornecedorSchema.safeParse({ razao_social: 'A' }).data.status, undefined);
  });
  await test('(h) looseObject: chave desconhecida (cidade) SOBREVIVE ao parse', () => {
    const r = S.FornecedorSchema.safeParse({ razao_social: 'A', cidade: 'Joinville' });
    assert.strictEqual(r.data.cidade, 'Joinville');
  });
  await test('(i) textos com espacos sao trimados; null fica null', () => {
    const r = S.FornecedorSchema.safeParse({ razao_social: '  ACME  ', email: '  a@b.c ', contato: null });
    assert.strictEqual(r.data.razao_social, 'ACME');
    assert.strictEqual(r.data.email, 'a@b.c');
    assert.strictEqual(r.data.contato, null);
  });

  // ── Cotacao ────────────────────────────────────────────────────────────────────────────────
  await test('(j) cotacao minima passa; status/valor_total ausentes ficam undefined (default e do servico)', () => {
    const r = S.CotacaoSchema.safeParse({ numero: 'COT-1', fornecedor_id: 3 });
    assert.ok(r.success, r.success ? '' : msgs(r));
    assert.strictEqual(r.data.status, undefined);
    assert.strictEqual(r.data.valor_total, undefined);
  });
  await test('(k) RN-E07 numero vazio/so espacos/ausente -> NUMERO_COTACAO_OBRIGATORIO', () => {
    for (const corpo of [{ numero: '', fornecedor_id: 3 }, { numero: '  ', fornecedor_id: 3 }, { fornecedor_id: 3 }]) {
      const r = S.CotacaoSchema.safeParse(corpo);
      assert.ok(!r.success);
      assert.strictEqual(msgs(r), `numero: ${S.NUMERO_COTACAO_OBRIGATORIO}`);
    }
  });
  await test('(l) RN-E08 fornecedor_id ausente, "3", 0, 2.5 -> FORNECEDOR_COTACAO_OBRIGATORIO (sem coercao)', () => {
    for (const v of [undefined, '3', 0, 2.5]) {
      const r = S.CotacaoSchema.safeParse({ numero: 'C', fornecedor_id: v });
      assert.ok(!r.success, `devia recusar fornecedor_id ${JSON.stringify(v)}`);
      assert.strictEqual(msgs(r), `fornecedor_id: ${S.FORNECEDOR_COTACAO_OBRIGATORIO}`);
    }
  });
  await test('(m) RN-E09 datas: "" -> null; AAAA-MM-DD passa; 31/12/2026 -> literal por campo', () => {
    const ok = S.CotacaoSchema.safeParse({ numero: 'C', fornecedor_id: 1, data_cotacao: '', validade: '2026-12-31' });
    assert.strictEqual(ok.data.data_cotacao, null);
    assert.strictEqual(ok.data.validade, '2026-12-31');
    const r1 = S.CotacaoSchema.safeParse({ numero: 'C', fornecedor_id: 1, data_cotacao: '31/12/2026' });
    assert.strictEqual(msgs(r1), `data_cotacao: ${S.DATA_COTACAO_INVALIDA}`);
    const r2 = S.CotacaoSchema.safeParse({ numero: 'C', fornecedor_id: 1, validade: '31/12/2026' });
    assert.strictEqual(msgs(r2), `validade: ${S.VALIDADE_COTACAO_INVALIDA}`);
  });
  await test('(n) RN-E10 status "aprovada" (feminino) -> literal com as 4 opcoes', () => {
    const r = S.CotacaoSchema.safeParse({ numero: 'C', fornecedor_id: 1, status: 'aprovada' });
    assert.strictEqual(msgs(r), `status: ${S.STATUS_COTACAO_INVALIDO}`);
    assert.strictEqual(S.STATUS_COTACAO_INVALIDO, 'status da cotação inválido (use em_analise, aprovado, rejeitado ou cancelado)');
    assert.deepStrictEqual(S.STATUS_COTACAO, ['em_analise', 'aprovado', 'rejeitado', 'cancelado']);
  });
  await test('(o) RN-E11 valor_total "10" e -1 -> VALOR_COTACAO_NEGATIVO; 0 e 12.5 passam', () => {
    for (const v of ['10', -1]) {
      const r = S.CotacaoSchema.safeParse({ numero: 'C', fornecedor_id: 1, valor_total: v });
      assert.strictEqual(msgs(r), `valor_total: ${S.VALOR_COTACAO_NEGATIVO}`);
    }
    assert.ok(S.CotacaoSchema.safeParse({ numero: 'C', fornecedor_id: 1, valor_total: 0 }).success);
    assert.ok(S.CotacaoSchema.safeParse({ numero: 'C', fornecedor_id: 1, valor_total: 12.5 }).success);
  });

  console.log(`\n${passed} passou, ${failed} falhou`);
  process.exit(failed ? 1 : 0);
})();
```

- [x] **Step 3: rodar e ver vermelho** — `cd server && node tests/api/comprasSchemasFornecedorCotacao.api.test.js`. Esperado: os 15 caem com `S.FornecedorSchema is not a function` / `Cannot read properties of undefined (reading 'safeParse')`.

- [x] **Step 4: implementar em `schemas.js`**, entre o `PedidoStatusSchema` e o `module.exports`:

```js
/**
 * ── Etapa 40 — fornecedor e cotacao ganham schema ────────────────────────────────────────────
 *
 * `FornecedorSchema` e um RETROFIT sobre duas portas que ja existiam sem Zod (`POST`/`PUT
 * /api/compras/fornecedores`), e o contrato dele e NAO RECUSAR o que o unico consumidor de escrita
 * ja manda: `client/src/components/FornecedoresDoGrupo.js` (`:217` POST com 4 chaves; `:131`,
 * `:167`, `:191` PUT com 7 textos `''` + `grupo_id` STRING de `useParams` ou `null`). Por isso:
 *   - textos sao `z.string().nullable()` com trim, e `''` PASSA (sem `.email()`, sem regex de
 *     CNPJ — validar formato e regra nova sobre acervo, letra D da etapa);
 *   - `grupo_id` e preprocessado: numero, string numerica, `null`, `''` e ausente sao todos
 *     validos. AUSENTE fica `undefined` (o `PUT` nao mexe na coluna); `null`/`''`/`0` viram `null`
 *     (o `PUT` LIMPA — e isso conserta o botao "Remover do grupo", que mandava `null` e o servidor
 *     ignorava, `routes/compras.js:563`); qualquer outra coisa e 400 com literal propria.
 *   - `status` so faz sentido no `PUT` (o `POST` grava 'ativo' fixo e ignora a chave).
 *
 * `CotacaoSchema`: `numero` e DIGITADO (contrato de `numeroDoc.js:44-64` — `cotacoes.numero` e
 * escolha humana, nunca embrulhar em `inserirComNumeroUnico`), `fornecedor_id` sem coercao (a tela
 * coage com `Number()`, como o pedido), datas por `dataIsoOpcional`, `valor_total` e campo de
 * entrada porque nao ha itens de cotacao para somar (medido: zero `cotacao_itens` no sistema).
 */
const STATUS_FORNECEDOR = ['ativo', 'inativo'];
const RAZAO_SOCIAL_OBRIGATORIA = 'Razão social é obrigatória'; // a literal que a rota ja usava (:544/:564)
const GRUPO_FORNECEDOR_INVALIDO = 'grupo do fornecedor inválido';
const STATUS_FORNECEDOR_INVALIDO = `status do fornecedor inválido (use ${STATUS_FORNECEDOR.join(' ou ')})`;

const textoOpcional = z.preprocess(
  (v) => (v == null ? null : String(v).trim()),
  z.string().nullable(),
).optional();

const grupoIdOpcional = z.preprocess((v) => {
  if (v === null || v === '') return null;
  if (typeof v === 'number') return Number.isInteger(v) ? (v > 0 ? v : null) : String(v);
  if (typeof v === 'string' && /^\s*-?\d+\s*$/.test(v)) { const n = parseInt(v, 10); return n > 0 ? n : null; }
  return v; // string nao numerica, objeto etc.: cai no union e sai com a literal
}, z.union([z.null(), z.number().int()], { error: GRUPO_FORNECEDOR_INVALIDO })).optional();

const FornecedorSchema = z.looseObject({
  razao_social: z.string({ error: RAZAO_SOCIAL_OBRIGATORIA }).trim().min(1, RAZAO_SOCIAL_OBRIGATORIA),
  nome_fantasia: textoOpcional,
  cnpj: textoOpcional,
  contato: textoOpcional,
  email: textoOpcional,
  telefone: textoOpcional,
  endereco: textoOpcional,
  grupo_id: grupoIdOpcional,
  status: z.enum(STATUS_FORNECEDOR, { error: STATUS_FORNECEDOR_INVALIDO }).optional(),
});

const STATUS_COTACAO = ['em_analise', 'aprovado', 'rejeitado', 'cancelado'];
const NUMERO_COTACAO_OBRIGATORIO = 'número da cotação é obrigatório';
const FORNECEDOR_COTACAO_OBRIGATORIO = 'fornecedor da cotação é obrigatório';
const STATUS_COTACAO_INVALIDO = `status da cotação inválido (use ${STATUS_COTACAO.slice(0, -1).join(', ')} ou ${STATUS_COTACAO[STATUS_COTACAO.length - 1]})`;
const VALOR_COTACAO_NEGATIVO = 'valor total da cotação não pode ser negativo';
const DATA_COTACAO_INVALIDA = 'data da cotação inválida (use AAAA-MM-DD)';
const VALIDADE_COTACAO_INVALIDA = 'validade da cotação inválida (use AAAA-MM-DD)';

const CotacaoSchema = z.looseObject({
  numero: z.string({ error: NUMERO_COTACAO_OBRIGATORIO }).trim().min(1, NUMERO_COTACAO_OBRIGATORIO),
  fornecedor_id: z.number({ error: FORNECEDOR_COTACAO_OBRIGATORIO }).int(FORNECEDOR_COTACAO_OBRIGATORIO).positive(FORNECEDOR_COTACAO_OBRIGATORIO),
  valor_total: z.number({ error: VALOR_COTACAO_NEGATIVO }).min(0, VALOR_COTACAO_NEGATIVO).optional(),
  data_cotacao: dataIsoOpcional(DATA_COTACAO_INVALIDA),
  validade: dataIsoOpcional(VALIDADE_COTACAO_INVALIDA),
  status: z.enum(STATUS_COTACAO, { error: STATUS_COTACAO_INVALIDO }).optional(),
  observacoes: textoOpcional,
});
```

E no `module.exports`, acrescentar os 13 nomes: `FornecedorSchema, CotacaoSchema, STATUS_FORNECEDOR,
STATUS_COTACAO, RAZAO_SOCIAL_OBRIGATORIA, GRUPO_FORNECEDOR_INVALIDO, STATUS_FORNECEDOR_INVALIDO,
NUMERO_COTACAO_OBRIGATORIO, FORNECEDOR_COTACAO_OBRIGATORIO, STATUS_COTACAO_INVALIDO,
VALOR_COTACAO_NEGATIVO, DATA_COTACAO_INVALIDA, VALIDADE_COTACAO_INVALIDA`.

**Medido na Fase 2 (sonda 1.1, `zod@4.4.3`):** o preprocess **roda** com `undefined`, mas
`.optional()` devolve `undefined` e a chave **não entra** em `parsed.data` — o cenário (d) passa como
está, e `z.optional(z.preprocess(...))` daria o mesmo resultado. **Nada a trocar.** Com `null`, o
preprocess devolve `null` e a chave fica presente (`'grupo_id' in data` — cenário (c)).

**Também da Fase 2 (M5):** o design (RN-E03) diz que `NaN` limpa; o preprocess acima, sem a linha
abaixo, responderia 400 (`String(NaN)` cai no union). Inalcançável por JSON, mas o design e o código
têm de dizer a mesma coisa — acrescente **antes** do `typeof v === 'number'`:

```js
  if (typeof v === 'number' && Number.isNaN(v)) return null;
```

**E (I3):** ainda na T1, acrescente `FornecedorSchema, CotacaoSchema` ao `require` de
`routes/compras.js:60` — `const { PedidoCompraCreateSchema, PedidoStatusSchema, FornecedorSchema, CotacaoSchema } = require('../services/compras/schemas');`.
Os dois nomes existem depois deste step; `require` de nome ainda não usado não quebra nada, e é o
que evita T2 e T3 reescreverem a mesma linha em paralelo. Inclua o arquivo no `git add` do Step 9.

- [x] **Step 5: `pedidoCompraService.js`** — em `:255-258`, extrair a literal:

```js
const FORNECEDOR_NAO_ENCONTRADO = 'Fornecedor não encontrado';
/** Guarda de banco compartilhada pelo `POST` e pelo `PUT` (e, desde a Etapa 40, pela cotacao): o fornecedor tem de existir. */
async function assertFornecedor(db, fornecedorId) {
  const fornecedor = await dbGet(db, 'SELECT id FROM fornecedores WHERE id = ?', [fornecedorId]);
  if (!fornecedor) throw erro(FORNECEDOR_NAO_ENCONTRADO);
}
```

e no `module.exports` (`:1012-1031`) acrescentar `erro, assertFornecedor, FORNECEDOR_NAO_ENCONTRADO`.
Rode `node tests/api/comprasPedidoCriar.api.test.js` — a literal não mudou, tem de seguir verde.

- [x] **Step 6: `cotacoes` no harness** — em `testApp.js`, logo após o stub de `pedidos_compra` (`:100-111`):

```js
  // `cotacoes` é tabela CORE (`server/index.js:19244`). Entra no harness na Etapa 40 porque a
  // etapa cria as portas de escrita dela; até aqui só `comprasPedidoEditarExcluir.api.test.js:93-108`
  // a declarava, com DDL local — que vira no-op com este stub (mesma forma: SEM a FK para
  // `fornecedores` e com `fornecedor_id` NULÁVEL, pelos mesmos motivos do stub de `pedidos_compra`).
  await dbRun(db, `CREATE TABLE IF NOT EXISTS cotacoes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    numero TEXT UNIQUE,
    fornecedor_id INTEGER,
    valor_total REAL DEFAULT 0,
    data_cotacao DATE,
    validade DATE,
    status TEXT DEFAULT 'em_analise',
    observacoes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
```

- [x] **Step 7: rodar** — o arquivo novo (`15 passou, 0 falhou`), `comprasPedidoEditarExcluir.api.test.js`
(**13** — medido na Fase 2; o (8) usa a tabela agora vinda do harness), `comprasPedidosRotas` (5),
`comprasPedidoCriar`, depois `npm run test:api` (esperado **188/188**).

- [x] **Step 8: sabotagens** (md5 antes/depois/pós-restauro):

| # | Sabotagem | Âncora | Cai |
|---|---|---|---|
| 1 | `grupoIdOpcional`: `if (v === null \|\| v === '') return null;` → `return undefined;` | 1 ocorrência | **(c)** `null` virou undefined; **(f)** `''` |
| 2 | `z.looseObject` → `z.object` no `FornecedorSchema` | contar: são 2 `looseObject` novos + 2 antigos | **(h)** `cidade` sumiu |
| 3 | `STATUS_COTACAO` sem `'cancelado'` | 1 | **(n)** `deepStrictEqual` e a literal |
| 4 | remover `.trim()` de `razao_social` | 1 | **(e)** `'   '` passou; **(i)** |
| 5 | `valor_total: z.number().min(0)` sem `{ error }` | 1 | **(o)** `'10'` sai em inglês |

- [x] **Step 9: commit** — `git add server/services/compras/schemas.js server/services/compras/pedidoCompraService.js server/routes/compras.js server/tests/helpers/testApp.js server/tests/api/comprasSchemasFornecedorCotacao.api.test.js`. Mensagem em `msg-e40-t1.txt`: o que existia (duas portas sem Zod com um único `if`; zero código de cotação; harness sem `cotacoes`), o que os quatro payloads do modal exigem do schema, por que `null` limpa (o botão que não removia), e o descartado (email/CNPJ, `z.number()` puro em `grupo_id`, número gerado).

#### ✅ Task 1 FECHADA — `008a041` (Compras Etapa 40 T1: FornecedorSchema e CotacaoSchema, erro/assertFornecedor exportados e cotacoes no harness)

**Números lidos (não previstos):**

| Suíte | Antes (Step 3) | Depois |
|---|---|---|
| `comprasSchemasFornecedorCotacao.api.test.js` | `0 passou, 15 falhou` — todos com `Cannot read properties of undefined (reading 'safeParse')` | **`15 passou, 0 falhou`** |
| `comprasPedidoEditarExcluir.api.test.js` | — | **13 passou** (o DDL local de `cotacoes` virou no-op sobre o stub do harness) |
| `comprasPedidosRotas.api.test.js` | — | **5 passou** |
| `comprasPedidoCriar.api.test.js` | — | **13 passou** (a literal `Fornecedor não encontrado` não mudou, só foi extraída) |
| `npm run test:api` | — | **188/188 arquivos de teste OK** |

`zod@4.4.3` confirmado por `require('zod/package.json').version`. CR = 0 nos cinco arquivos tocados
depois de cada edição.

**Sabotagens (md5 de `schemas.js` antes `a2e42458…`, sabotado ≠, pós-restauro `a2e42458…` nas cinco;
restauro por `cp` do scratchpad; âncora contada com `grep -cF` = 1 nas cinco):**

| # | Sabotagem | Placar | QUAL asserção caiu |
|---|---|---|---|
| 1 | `if (v === null \|\| v === '') return null;` → `return undefined;` | 13/2 | **(c)** `grupo_id: grupo do fornecedor inválido` (o `undefined` do preprocess caiu no union em vez de sair como ausente); **(f)** `"": grupo_id: grupo do fornecedor inválido` |
| 2 | `const FornecedorSchema = z.looseObject({` → `z.object({` | 14/1 | **(h)** `cidade`: `+ undefined / - 'Joinville'` (strip silencioso) |
| 3 | `'rejeitado', 'cancelado']` → `'rejeitado']` | 14/1 | **(n)** a literal: `+ '…(use em_analise, aprovado ou rejeitado)' / - '…(use em_analise, aprovado, rejeitado ou cancelado)'` — caiu no `strictEqual` da literal antes de chegar ao `deepStrictEqual` da lista |
| 4 | remover `.trim()` de `razao_social` | 13/2 | **(e)** `devia recusar {"razao_social":"   "}`; **(i)** `razao_social` veio `'  ACME  '` |
| 5 | `valor_total: z.number().min(0).optional()` sem `{ error }` | 14/1 | **(o)** `+ 'valor_total: Invalid input: expected number, received string' / - 'valor_total: valor total da cotação não pode ser negativo'` — a armadilha 2 do cabeçalho de `schemas.js`, em inglês, medida |

Controle positivo: os cinco cortes cortaram **exatamente** o cenário que a tabela do Step 8 previa, e
o arquivo voltou a `15 passou` com o md5 original depois do último restauro.

**Divergências entre o plano e o que o código exigiu:**

1. **O teste do plano tinha um bug, não o schema.** `msgs(r)` era `r.error.issues.map(…)` sem guarda, e
   `assert.ok(r.success, msgs(r))` avalia o segundo argumento **antes** de olhar o primeiro — nos quatro
   cenários verdes do modal (a)–(d) `r.error` é `undefined` e o teste caía com
   `Cannot read properties of undefined (reading 'issues')` (`11 passou, 4 falhou` na primeira rodada
   verde do schema). O cenário (j) já usava `r.success ? '' : msgs(r)`; a guarda foi para dentro de
   `msgs` (`r.success ? '' : …`) para todos os call sites. Registrado no teste e na mensagem do commit.
2. **Contagem da âncora da sabotagem 2:** o plano dizia "são 2 `looseObject` novos + 2 antigos";
   `grep -cF 'z.looseObject' schemas.js` dá **7** — 4 construções + 3 menções em comentário (o
   cabeçalho do arquivo e o comentário do `PedidoStatusSchema`). Âncora usada:
   `const FornecedorSchema = z.looseObject({` (1 ocorrência).
3. **Mensagem do vermelho do Step 3:** o plano previa `FornecedorSchema is not a function` **ou**
   `Cannot read properties of undefined (reading 'safeParse')`; saiu só a segunda, nos 15.
4. **`comprasPedidoCriar`** não tinha número no plano; medido: **13 passou**.
5. Linhas citadas (`:60`, `:113`, `:255-258`, `:1012-1031`, `:100-111`, `:93-108`, `index.js:19244`)
   **bateram** todas em `90597c7`/`84ace0b` — nenhuma reconta necessária antes da edição. Depois da T1,
   `schemas.js` cresceu 82 linhas (o `module.exports` agora começa em `:217`), `testApp.js` 17 linhas
   (o stub de `cotacoes` ocupa `:113-128`; o que vinha depois desloca +17) e `pedidoCompraService.js`
   11 linhas (`FORNECEDOR_NAO_ENCONTRADO` em `:254`, `assertFornecedor` em `:256-259`; `module.exports` em `:1013-1038`). **T2 e T3 recontem**
   `routes/compras.js` antes de editar — a T1 só mudou a `:60`, sem deslocar nada.
6. Não houve conflito de DDL: o stub do harness e o DDL local de `comprasPedidoEditarExcluir:93-108`
   são idênticos coluna a coluna (Step 1 conferido por leitura), e a produção (`index.js:19244-19256`)
   difere só pelo `NOT NULL` + FK em `fornecedor_id`, omitidos de propósito (mesma razão do stub de
   `pedidos_compra`).

---

### Task 2: as portas de fornecedor — `GET /:id`, Zod nas duas, `status`, `null` limpa, 409 por cotação **(galho, worktree `wt-e40-t2`)**

**Files:**
- Modify: `server/routes/compras.js:60` (require dos schemas), `:402-416` (bloco do 409 no genérico), `:534-577` (as duas portas; inserir o `GET /:id` **antes** do `PUT`)
- Test: `server/tests/api/comprasFornecedorRotas.api.test.js` (novo)

**Interfaces:**
- Consumes: `FornecedorSchema`, `RAZAO_SOCIAL_OBRIGATORIA`, `GRUPO_FORNECEDOR_INVALIDO`, `STATUS_FORNECEDOR_INVALIDO` (T1); `validate` (`:59`); `FORNECEDOR_COM_COTACOES` — **como a T3 roda em paralelo, a T2 escreve a literal inline** `'Fornecedor possui cotações — não pode ser excluído'` no genérico, e a T6 afirma que `cotacaoService.FORNECEDOR_COM_COTACOES` é igual (a igualdade é o contrato; duplicar a string é o custo do paralelismo, declarado).
- Produces: `GET /api/compras/fornecedores/:id` (projeção nomeada), `POST`/`PUT` validados, 409 por cotação. **T4 e T6 consomem.**

- [x] **Step 1: escrever a CARACTERIZAÇÃO primeiro** — cenários (1) e (2) contra o código de hoje, verdes **antes** de qualquer edição:

```js
/**
 * Etapa 40, Task 2 — as portas de fornecedor. RN-E01, RN-E02, RN-E03, RN-E04, RN-E06, RN-E12.
 *
 * ⚠️ (1) e (2) foram escritos e rodados ANTES do retrofit de Zod, contra o codigo de hoje: sao os
 * quatro payloads reais de `FornecedoresDoGrupo.js` (`:217`, `:131`, `:167`, `:191`). O retrofit
 * so esta certo se os dois continuarem verdes sem mudar uma linha deles.
 *
 * Executar: cd server && node tests/api/comprasFornecedorRotas.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet } = require('../../services/almoxarifado/db');
const { RAZAO_SOCIAL_OBRIGATORIA, GRUPO_FORNECEDOR_INVALIDO, STATUS_FORNECEDOR_INVALIDO } = require('../../services/compras/schemas');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}
const ADMIN = { id: 97, nome: 'Admin E40 T2', role: 'admin', is_superadmin: 1, email: 'admin@test.com' };
const LITERAL_409_PEDIDO = 'Fornecedor possui pedidos de compra — não pode ser excluído';
const LITERAL_409_COTACAO = 'Fornecedor possui cotações — não pode ser excluído';

(async () => {
  const { app, db, close } = await createTestApp({ user: ADMIN });
  // `grupos_compras` nao esta no harness (core): DDL local, mesma forma de comprasPedidosRotas.api.test.js
  await dbRun(db, `CREATE TABLE IF NOT EXISTS grupos_compras (
    id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT NOT NULL, numero INTEGER, ordem INTEGER DEFAULT 0,
    ativo INTEGER DEFAULT 1, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
  const grupo = await dbRun(db, "INSERT INTO grupos_compras (nome, numero) VALUES ('Grupo E40', 40)");
  const grupoId = grupo.lastID;
  const linha = (id) => dbGet(db, 'SELECT * FROM fornecedores WHERE id = ?', [id]);
  const post = (corpo) => request(app).post('/api/compras/fornecedores').send(corpo);
  const put = (id, corpo) => request(app).put(`/api/compras/fornecedores/${id}`).send(corpo);
  const get = (id) => request(app).get(`/api/compras/fornecedores/${id}`);
  const SETE = { razao_social: 'ACME E40', nome_fantasia: '', cnpj: '', contato: '', email: '', telefone: '', endereco: '' };

  await test('(1) CARACTERIZACAO: o POST do modal (4 chaves, grupo_id STRING) -> 201 e a linha de hoje', async () => {
    const r = await post({ razao_social: 'Modal E40', nome_fantasia: '', cnpj: '', grupo_id: String(grupoId) });
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    assert.deepStrictEqual(Object.keys(r.body).sort(), ['grupo_id', 'id', 'nome_fantasia', 'razao_social']);
    const l = await linha(r.body.id);
    assert.strictEqual(l.grupo_id, grupoId);
    assert.strictEqual(l.status, 'ativo');
    assert.strictEqual(l.nome_fantasia, '');
    assert.strictEqual(l.contato, null);
  });

  await test('(2) CARACTERIZACAO: os 3 PUT do modal (7 textos "" + grupo_id string) -> 200 { message }', async () => {
    const r0 = await post({ razao_social: 'Tres PUT' });
    const id = r0.body.id;
    for (const corpo of [
      { ...SETE, grupo_id: String(grupoId) },              // editar
      { ...SETE, telefone: '(47) 9', grupo_id: String(grupoId) }, // vincular
    ]) {
      const r = await put(id, corpo);
      assert.strictEqual(r.status, 200, JSON.stringify(r.body));
      assert.deepStrictEqual(r.body, { message: 'Fornecedor atualizado' });
    }
    assert.strictEqual((await linha(id)).grupo_id, grupoId);
  });
```

- [x] **Step 2: rodar (1)(2) — VERDES contra o código de hoje.** Se algum cair, o payload copiado está errado: corrija o **teste**, não o código.

- [x] **Step 3: acrescentar os cenários (3)–(11), rodar e ver vermelho** (o (4) é o que mais importa — é o defeito do botão):

```js
  await test('(3) RN-E01 razao_social so espacos -> 400 "Dados inválidos — razao_social: …" nas DUAS portas', async () => {
    const r = await post({ razao_social: '   ' });
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.body.error, `Dados inválidos — razao_social: ${RAZAO_SOCIAL_OBRIGATORIA}`);
    const r0 = await post({ razao_social: 'Para editar' });
    const r2 = await put(r0.body.id, { razao_social: '' });
    assert.strictEqual(r2.status, 400);
    assert.strictEqual(r2.body.error, `Dados inválidos — razao_social: ${RAZAO_SOCIAL_OBRIGATORIA}`);
  });

  await test('(4) RN-E03 PUT com grupo_id null LIMPA a coluna (o botao "Remover do grupo" passa a remover)', async () => {
    const r0 = await post({ razao_social: 'No grupo', grupo_id: grupoId });
    assert.strictEqual((await linha(r0.body.id)).grupo_id, grupoId, 'fixture');
    const r = await put(r0.body.id, { ...SETE, grupo_id: null });   // o payload EXATO de :191-200
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.strictEqual((await linha(r0.body.id)).grupo_id, null, 'grupo_id null tinha de LIMPAR — antes era no-op (routes/compras.js:563)');
    // '' tambem limpa (a tela nova manda '' na opcao "Sem grupo")
    await put(r0.body.id, { ...SETE, grupo_id: grupoId });
    const r2 = await put(r0.body.id, { ...SETE, grupo_id: '' });
    assert.strictEqual(r2.status, 200);
    assert.strictEqual((await linha(r0.body.id)).grupo_id, null);
  });

  await test('(5) RN-E03 grupo_id AUSENTE nao mexe; "abc" -> 400 literal', async () => {
    const r0 = await post({ razao_social: 'Fica no grupo', grupo_id: grupoId });
    const r = await put(r0.body.id, { ...SETE });
    assert.strictEqual(r.status, 200);
    assert.strictEqual((await linha(r0.body.id)).grupo_id, grupoId, 'sem a chave, a coluna nao muda');
    const r2 = await put(r0.body.id, { ...SETE, grupo_id: 'abc' });
    assert.strictEqual(r2.status, 400);
    assert.strictEqual(r2.body.error, `Dados inválidos — grupo_id: ${GRUPO_FORNECEDOR_INVALIDO}`);
  });

  await test('(6) RN-E04 status: PUT inativo grava; POST ignora status; "x" -> 400', async () => {
    const r0 = await post({ razao_social: 'Vai inativar', status: 'inativo' });
    assert.strictEqual(r0.status, 201);
    assert.strictEqual((await linha(r0.body.id)).status, 'ativo', 'o POST grava ativo SEMPRE');
    const r = await put(r0.body.id, { ...SETE, status: 'inativo' });
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.strictEqual((await linha(r0.body.id)).status, 'inativo');
    const r2 = await put(r0.body.id, { ...SETE });
    assert.strictEqual(r2.status, 200);
    assert.strictEqual((await linha(r0.body.id)).status, 'inativo', 'sem a chave, status nao muda');
    const r3 = await put(r0.body.id, { ...SETE, status: 'x' });
    assert.strictEqual(r3.status, 400);
    assert.strictEqual(r3.body.error, `Dados inválidos — status: ${STATUS_FORNECEDOR_INVALIDO}`);
  });

  await test('(7) RN-E02 CARACTERIZACAO: PUT so com razao_social zera os outros seis', async () => {
    const r0 = await post({ razao_social: 'Cheio', nome_fantasia: 'NF', cnpj: '1', contato: 'C', email: 'e@x', telefone: 't' });
    await put(r0.body.id, { ...SETE, endereco: 'Rua 1' });
    assert.strictEqual((await linha(r0.body.id)).endereco, 'Rua 1', 'fixture');
    const r = await put(r0.body.id, { razao_social: 'Cheio' });
    assert.strictEqual(r.status, 200);
    const l = await linha(r0.body.id);
    assert.strictEqual(l.nome_fantasia, ''); assert.strictEqual(l.email, null); assert.strictEqual(l.endereco, null);
  });

  await test('(8) RN-E06 GET /:id devolve a linha SEM planilha_*; 404 para id inexistente e nao numerico', async () => {
    const r0 = await post({ razao_social: 'Com planilha', cnpj: '99' });
    await dbRun(db, "UPDATE fornecedores SET planilha_dados = '{\"x\":1}', planilha_nome = 'p.xlsx', endereco = 'Rua 2' WHERE id = ?", [r0.body.id]);
    const r = await get(r0.body.id);
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.strictEqual(r.body.razao_social, 'Com planilha');
    assert.strictEqual(r.body.endereco, 'Rua 2');
    assert.strictEqual(r.body.status, 'ativo');
    assert.ok(!('planilha_dados' in r.body) && !('planilha_nome' in r.body) && !('planilha_atualizado_em' in r.body),
      `a projecao tinha de excluir planilha_*: ${Object.keys(r.body)}`);
    const r404 = await get(999999);
    assert.strictEqual(r404.status, 404);
    assert.deepStrictEqual(r404.body, { error: 'Fornecedor não encontrado' });
    const rNaN = await get('abc');
    assert.strictEqual(rNaN.status, 404);
  });

  await test('(9) RN-E12 fornecedor com cotacao -> 409 literal; com pedido E cotacao vale a de PEDIDO; sem nada -> 200', async () => {
    const r0 = await post({ razao_social: 'Cotado' });
    const id = r0.body.id;
    await dbRun(db, "INSERT INTO cotacoes (numero, fornecedor_id) VALUES ('COT-E40-T2', ?)", [id]);
    const r = await request(app).delete(`/api/compras/fornecedores/${id}`);
    assert.strictEqual(r.status, 409, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, LITERAL_409_COTACAO);
    await dbRun(db, "INSERT INTO pedidos_compra (numero, fornecedor_id) VALUES ('PC-E40-T2', ?)", [id]);
    const r2 = await request(app).delete(`/api/compras/fornecedores/${id}`);
    assert.strictEqual(r2.status, 409);
    assert.strictEqual(r2.body.error, LITERAL_409_PEDIDO, 'com os dois, a literal de pedido tem precedencia');
    await dbRun(db, "DELETE FROM pedidos_compra WHERE fornecedor_id = ?", [id]);
    await dbRun(db, "DELETE FROM cotacoes WHERE fornecedor_id = ?", [id]);
    const r3 = await request(app).delete(`/api/compras/fornecedores/${id}`);
    assert.strictEqual(r3.status, 200);
    assert.strictEqual(await linha(id), undefined);
  });

  await test('(10) looseObject: POST com cidade (chave que a rota ignora) -> 201 e cidade continua NULL', async () => {
    const r = await post({ razao_social: 'Com cidade', cidade: 'Joinville' });
    assert.strictEqual(r.status, 201);
    assert.strictEqual((await linha(r.body.id)).cidade, null);
  });

  await test('(11) o 400 de schema tem SEMPRE o prefixo "Dados inválidos — " (e o corpo e { error })', async () => {
    const r = await post({});
    assert.strictEqual(r.status, 400);
    assert.ok(r.body.error.startsWith('Dados inválidos — '), r.body.error);
    assert.deepStrictEqual(Object.keys(r.body), ['error']);
  });

  await close();
  console.log(`\n${passed} passou, ${failed} falhou`);
  process.exit(failed ? 1 : 0);
})();
```

Esperado no vermelho: (3) cai (a literal antiga é `'Razão social é obrigatória'` **sem** o prefixo
`Dados inválidos —`); (4) cai em *"grupo_id null tinha de LIMPAR"*; (5) `'abc'` responde 200 hoje;
(6) `inativo` não grava; (8) 404 sem JSON (`r.body` = `{}`); (9) o 409 por cotação sai como 200 no
harness (FK desligada) — **leia qual asserção**; (10) 201 já hoje (verde — é caracterização, e o
(h) da T1 é quem guarda o `looseObject`); (11) cai pelo prefixo.

- [x] **Step 4: implementar** — em `routes/compras.js`:

(a) `:60` **já traz `FornecedorSchema`** desde a T1 (Fase 2, I3) — **não edite essa linha**. E use
`pedidoCompraService.FORNECEDOR_NAO_ENCONTRADO` (já `require` em `:61`) nos dois 404 abaixo, em vez da
string inline (M3): a constante existe para a frase ter **um** dono.

(b) o `GET /:id`, **antes** do `PUT` (`:553`), e as duas portas com `validate(FornecedorSchema)`:

```js
// Etapa 40, Task 2 (RN-E06): a linha de UM fornecedor, para o formulario de edicao. Projecao NOMEADA
// e nao `SELECT *`: `planilha_dados` e o JSON inteiro da planilha do fornecedor (`index.js:19272`), e
// a licao da F3 da Etapa 39 vale aqui — a coluna que ninguem le nao viaja. `cidade`/`estado`/`cep`
// viajam porque existem na DDL, mesmo sem consumidor (a tela nao os mostra, declarado).
app.get('/api/compras/fornecedores/:id', authenticateToken, checkModulePermission('compras'), (req, res) => {
  db.get(`SELECT id, razao_social, nome_fantasia, cnpj, contato, email, telefone, endereco, cidade, estado, cep,
                 status, grupo_id, foto, created_at, updated_at
          FROM fornecedores WHERE id = ?`, [req.params.id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: pedidoCompraService.FORNECEDOR_NAO_ENCONTRADO });
    res.json(row);
  });
});

// Criar fornecedor (opcional: grupo_id para já homologar no grupo).
// Etapa 40, Task 2: `validate(FornecedorSchema)` na frente — RN-E01 pelo schema (mesma literal de
// antes, agora com o prefixo da casa), textos trimados, `grupo_id` ja resolvido para numero|null.
// `status` e IGNORADO aqui de proposito (RN-E04): fornecedor nasce 'ativo'.
app.post('/api/compras/fornecedores', authenticateToken, checkModulePermission('compras'),
  validate(FornecedorSchema), (req, res) => {
  const body = req.body;
  const nome_fantasia = body.nome_fantasia || '';
  const cnpj = body.cnpj || '';
  const contato = body.contato || null;
  const email = body.email || null;
  const telefone = body.telefone || null;
  const endereco = body.endereco || null;
  const grupo_id = body.grupo_id == null ? null : body.grupo_id;
  db.run('INSERT INTO fornecedores (razao_social, nome_fantasia, cnpj, contato, email, telefone, endereco, grupo_id, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [body.razao_social, nome_fantasia, cnpj, contato, email, telefone, endereco, grupo_id, 'ativo'], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.status(201).json({ id: this.lastID, razao_social: body.razao_social, nome_fantasia, grupo_id });
  });
});

// Atualizar fornecedor. SUBSTITUICAO TOTAL dos sete textos (RN-E02, caracterizado — a tela de
// edicao reenvia todos). `grupo_id` e `status` so entram no UPDATE quando vieram no corpo
// (`!== undefined`): ausente = nao mexe. E `grupo_id: null` LIMPA (RN-E03) — ate a Etapa 40 o
// `!= null` daqui tratava null como ausente, e o botao "Remover do grupo" de
// `FornecedoresDoGrupo.js:188-200` respondia sucesso sem remover nada (sonda da Fase 0).
app.put('/api/compras/fornecedores/:id', authenticateToken, checkModulePermission('compras'),
  validate(FornecedorSchema), (req, res) => {
  const id = req.params.id;
  const body = req.body;
  const updates = ['razao_social = ?', 'nome_fantasia = ?', 'cnpj = ?', 'contato = ?', 'email = ?', 'telefone = ?', 'endereco = ?', 'updated_at = CURRENT_TIMESTAMP'];
  const params = [body.razao_social, body.nome_fantasia || '', body.cnpj || '', body.contato || null, body.email || null, body.telefone || null, body.endereco || null];
  if (body.grupo_id !== undefined) { updates.push('grupo_id = ?'); params.push(body.grupo_id); }
  if (body.status !== undefined) { updates.push('status = ?'); params.push(body.status); }
  params.push(id);
  db.run('UPDATE fornecedores SET ' + updates.join(', ') + ' WHERE id = ?', params, function(err) {
    if (err) return res.status(500).json({ error: err.message });
    if (this.changes === 0) return res.status(404).json({ error: pedidoCompraService.FORNECEDOR_NAO_ENCONTRADO });
    res.json({ message: 'Fornecedor atualizado' });
  });
});
```

⚠️ O `POST` passa a gravar `endereco` (era ignorado — Fase 0 servidor §1.2). É o único acréscimo de
coluna no `POST`, e está no cenário (1)? **Não**: o (1) não manda `endereco`. Acrescente ao (10):
`POST { razao_social, endereco: 'Rua 3' }` → linha com `endereco = 'Rua 3'`.

(c) o 409 por cotação, no bloco `:405-416`, e o comentário `:402-403` **reescrito**:

```js
   * Nenhum outro ramo do generico muda: `pedidos` aqui esta sombreado pela rota propria da Task 3.
   *
   * ⚠️ CORRECAO DA ETAPA 40 — este paragrafo dizia "`cotacoes` tem a MESMA FK e continua com
   * `COUNT = 0` (sem porta de criacao, sem risco)". Era VERDADE ate a Etapa 39 e DEIXOU DE SER: a
   * Etapa 40 criou `POST /api/compras/cotacoes`, entao uma cotacao apontando para o fornecedor volta
   * a fazer o `DELETE` cru cair na FK em producao (500 'Erro ao excluir item'). A segunda contagem
   * abaixo (RN-E12) fecha isso do mesmo jeito da F5: 409 ANTES do DELETE, mesma frase no harness e
   * em producao. Pedido e checado PRIMEIRO — com os dois vinculos, a literal e a de pedido.
   */
  if (tipo === 'fornecedores') {
    return db.get('SELECT COUNT(*) AS n FROM pedidos_compra WHERE fornecedor_id = ?', [idNum], (err, row) => {
      if (err) { console.error('Erro ao checar pedidos do fornecedor:', err); return res.status(500).json({ error: 'Erro ao excluir item' }); }
      if ((row && row.n) > 0) return res.status(409).json({ error: 'Fornecedor possui pedidos de compra — não pode ser excluído' });
      return db.get('SELECT COUNT(*) AS n FROM cotacoes WHERE fornecedor_id = ?', [idNum], (err2, row2) => {
        if (err2) { console.error('Erro ao checar cotacoes do fornecedor:', err2); return res.status(500).json({ error: 'Erro ao excluir item' }); }
        if ((row2 && row2.n) > 0) return res.status(409).json({ error: 'Fornecedor possui cotações — não pode ser excluído' });
        return apagar();
      });
    });
  }
```

- [x] **Step 5: rodar** — o arquivo (**11 passou**); `comprasPedidoEditarExcluir.api.test.js` (**13** — o cenário (12) é a F5 e tem de seguir verde); `comprasPedidosRotas` (5); depois `npm run test:api`.

- [x] **Step 6: sabotagens**

| # | Sabotagem | Âncora (`grep -cF` = 1) | Cai |
|---|---|---|---|
| 1 | `if (body.grupo_id !== undefined)` → `if (body.grupo_id != null)` | `if (body.grupo_id !== undefined) { updates.push('grupo_id = ?')` | **(4)** *"grupo_id null tinha de LIMPAR"* — é o controle positivo do defeito |
| 2 | tirar `validate(FornecedorSchema),` do `PUT` | `validate(FornecedorSchema), (req, res) => {\n  const id` | **(3)** segunda metade, **(5)** `'abc'`, **(6)** `'x'` |
| 3 | trocar a projeção do `GET /:id` por `SELECT *` | `SELECT id, razao_social, nome_fantasia, cnpj, contato, email, telefone, endereco, cidade` | **(8)** `planilha_*` viajou |
| 4 | inverter a ordem: checar `cotacoes` antes de `pedidos_compra` | as duas linhas `SELECT COUNT(*) AS n FROM` | **(9)** *"a literal de pedido tem precedencia"* |
| 5 | `if (body.status !== undefined)` → remover a linha | 1 | **(6)** `inativo` não grava |

- [x] **Step 7: commit** — `git add server/routes/compras.js server/tests/api/comprasFornecedorRotas.api.test.js`. Mensagem em `msg-e40-t2.txt`: o defeito do botão (com a linha `:563` e a sonda), o retrofit sem recusar o modal (cenários (1)(2) como prova), a projeção sem `planilha_*`, o 409 por cotação e o comentário que era verdade até a 39; descartado: `PATCH /status` próprio, traduzir a FK no `catch`.

#### ✅ Task 2 FECHADA — `6795b39` (Compras Etapa 40 T2: GET /fornecedores/:id, Zod nas duas portas, status e grupo_id null limpa, 409 por cotacao)

> Hash medido na worktree `wt-e40-t2` (branch `e40-t2`, base `07d6893`). **Será reescrito no
> cherry-pick para o tronco** — a T6 deve citar o hash novo.

**Números lidos (não previstos):**

| Suíte | Step 2 (caracterização, código antigo) | Step 3 (vermelho) | Step 5 (verde) |
|---|---|---|---|
| `comprasFornecedorRotas.api.test.js` | **`2 passou, 0 falhou`** — (1) e (2) verdes contra `07d6893`, sem edição na rota | `3 passou, 8 falhou` — verdes (1), (2), (7) | **`11 passou, 0 falhou`** |
| `comprasPedidoEditarExcluir.api.test.js` | — | — | **13 passou** (o (12) da F5 seguiu verde) |
| `comprasPedidosRotas.api.test.js` | — | — | **5 passou** |
| `npm run test:api` | — | — | **189/189 arquivos de teste OK** (188 da T1 + este arquivo) |

CR = 0 em `routes/compras.js`, no teste e no plano depois de cada edição (`git ls-files --eol`: `i/lf w/lf` nos dois arquivos commitados).

**Qual asserção caiu no vermelho do Step 3** (o plano previa; lido):
(3) `+ 'Razão social é obrigatória' / - 'Dados inválidos — razao_social: …'`; (4) *"grupo_id null tinha de LIMPAR"* `1 !== null`;
(5) `200 !== 400` no `'abc'`; (6) `'ativo' !== 'inativo'`; (8) `404 !== 200` com `r.body = {}`; (9) `200 !== 409` com
`{"message":"Item excluído com sucesso"}` (FK desligada no harness, como previsto); (10) `null !== 'Rua 3'` — *"o POST tinha de gravar endereco"*
(a régua do `endereco` que o Step 4 manda acrescentar); (11) `Razão social é obrigatória` sem o prefixo.

**Sabotagens** (md5 de `routes/compras.js` antes `11ab9ac5…`; sabotado ≠ nas cinco — `42593b21`, `e93131da`, `557abdba`, `a608755f`, `d78f3fde`;
pós-restauro `11ab9ac5…` nas cinco; restauro por `cp` do scratchpad; âncora contada = 1 nas cinco):

| # | Sabotagem | Placar | QUAL asserção caiu |
|---|---|---|---|
| 1 | `if (body.grupo_id !== undefined)` → `!= null` | 10/1 | **(4)** *"grupo_id null tinha de LIMPAR — antes era no-op (routes/compras.js:563)"* — o controle positivo do defeito do botão |
| 2 | tirar `validate(FornecedorSchema),` do `PUT` (âncora multilinha `…(req, res) => {\n  const id`, contada com perl = 1; a de uma linha dá 2 por causa do `POST`) | 7/4 | **(3)** segunda metade `200 !== 400`; **(5)** `'abc'` `200 !== 400`; **(6)** `'x'` `200 !== 400`; **e (4)** `'' !== null` — sem o preprocess, `grupo_id: ''` grava a string vazia em vez de limpar (o plano não previa esta quarta queda) |
| 3 | projeção do `GET /:id` → `SELECT *` | 10/1 | **(8)** *"a projecao tinha de excluir planilha_*"* — as chaves listadas incluíram `planilha_dados, planilha_nome, planilha_atualizado_em` |
| 4 | trocar `pedidos_compra` ↔ `cotacoes` nas duas linhas `SELECT COUNT(*)` (as literais ficaram no lugar) | 10/1 | **(9)** — mas na **primeira** asserção da literal (`+ '…pedidos de compra…' / - '…cotações…'`), não na de precedência: com só a cotação vinculada, a primeira contagem já responde com a frase de pedido. A ordem das frases é o que o teste guarda |
| 5 | remover a linha `if (body.status !== undefined) …` | 10/1 | **(6)** `'ativo' !== 'inativo'` — `inativo` não gravou |

Controle positivo: cada corte derrubou o cenário previsto (e, no 2, um a mais); `11 passou` com md5 `11ab9ac5…` depois do último restauro.

**Divergências entre o plano e o que o código exigiu:**

1. **Sabotagem 2 derruba QUATRO cenários, não três**: sem o `validate()` no `PUT`, `grupo_id: ''` (segunda metade do (4)) chega cru e o `!== undefined` grava `''` na coluna — `'' !== null`. Não é defeito: é a prova de que o `''`→`null` mora no preprocess do schema, não na rota.
2. **Sabotagem 4 cai na primeira asserção do (9), não na de precedência.** O plano dizia *"a literal de pedido tem precedencia"*; trocar só as tabelas do `SELECT COUNT(*)` deixa a frase de pedido na primeira contagem, então já o cenário "só cotação" recebe a frase errada. Trocar os blocos inteiros (frase junto) seria o corte que derruba só a precedência; o de tabelas derruba antes. Ambos derrubam (9).
3. **Âncora da sabotagem 2 é multilinha por necessidade**: `validate(FornecedorSchema), (req, res) => {` sozinho dá `grep -cF` = 2 (POST e PUT); com `\n  const id` = 1 (perl `-0`).
4. **(10) fica vermelho no Step 3**, não verde como o plano dizia — por causa do acréscimo de `endereco` que o próprio Step 4 manda pôr no (10). Sem o acréscimo, seria verde (caracterização).
5. **Comentário do 409** ganhou uma frase além do texto do plano: *"A literal de cotacao esta inline aqui porque a T3 … roda em paralelo; a T6 afirma a igualdade"* — para quem ler a rota sem o plano saber por que a string não vem do serviço.
6. Linhas citadas (`:60`, `:402-403`, `:405-416`, `:534-577`, `:553`, `:563`) **bateram** todas em `07d6893`. Depois da T2, `routes/compras.js` cresceu **28** linhas (753 → 781): o bloco do genérico `:402-433`, o `GET /:id` em `:551-563`, `POST` em `:565-584`, `PUT` em `:586-605`. **T3 reconte** antes de inserir as portas de cotação (o cherry-pick deslocará o que vier depois de `:402`).
7. Nada foi descartado além do que o plano já descartava (`PATCH /status`, FK no `catch`). `cidade`/`estado`/`cep` viajam no `GET /:id` como o design §5.2 manda, sem consumidor.

---

### Task 3: `cotacaoService.js` e as três portas de cotação **(galho, worktree `wt-e40-t3`)**

**Files:**
- Create: `server/services/compras/cotacaoService.js`
- Modify: `server/routes/compras.js:60` (require), `:313-340` (após o `GET /api/compras/cotacoes`, antes do genérico `:343`)
- Test: `server/tests/api/comprasCotacaoRotas.api.test.js` (novo)

**Interfaces:**
- Consumes: `CotacaoSchema`, `STATUS_COTACAO` e as 6 literais (T1); `erro`, `assertFornecedor`, `FORNECEDOR_NAO_ENCONTRADO` de `pedidoCompraService` (T1); `dbRun`, `dbGet` de `services/almoxarifado/db`.
- Produces: contrato 3 (`criarCotacao`, `obterCotacao`, `atualizarCotacao`, `COTACAO_NAO_ENCONTRADA`, `FORNECEDOR_COM_COTACOES`, `numeroDuplicado`) e as rotas do design §5.4. **T5 e T6 consomem.**

- [x] **Step 1: escrever o teste (vermelho: 404 sem JSON nas três portas)**

```js
/**
 * Etapa 40, Task 3 — `POST`/`GET /:id`/`PUT` de cotacao. RN-E07…RN-E11, RN-E13.
 * O DELETE continua pelo generico e o cenario (8) prova que a promocao de `cotacoes` ao harness
 * (T1) nao mudou a forma que o cenario (8) de comprasPedidoEditarExcluir ja media.
 *
 * Executar: cd server && node tests/api/comprasCotacaoRotas.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet } = require('../../services/almoxarifado/db');
const S = require('../../services/compras/schemas');
const { FORNECEDOR_NAO_ENCONTRADO } = require('../../services/compras/pedidoCompraService');
const cotacaoService = require('../../services/compras/cotacaoService');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}
const ADMIN = { id: 98, nome: 'Admin E40 T3', role: 'admin', is_superadmin: 1, email: 'admin@test.com' };

(async () => {
  const { app, db, close } = await createTestApp({ user: ADMIN });
  const fA = (await dbRun(db, "INSERT INTO fornecedores (razao_social, status) VALUES ('Forn A E40', 'ativo')")).lastID;
  const fB = (await dbRun(db, "INSERT INTO fornecedores (razao_social, status) VALUES ('Forn B E40', 'inativo')")).lastID;
  const post = (c) => request(app).post('/api/compras/cotacoes').send(c);
  const put = (id, c) => request(app).put(`/api/compras/cotacoes/${id}`).send(c);
  const get = (id) => request(app).get(`/api/compras/cotacoes/${id}`);
  let seq = 0; const num = () => `COT-E40-${String(++seq).padStart(3, '0')}`;

  await test('(1) POST minimo -> 201, status em_analise, valor_total 0, fornecedor_nome, datas null', async () => {
    const n = num();
    const r = await post({ numero: n, fornecedor_id: fA });
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    assert.strictEqual(r.body.numero, n);
    assert.strictEqual(r.body.status, 'em_analise');
    assert.strictEqual(r.body.valor_total, 0);
    assert.strictEqual(r.body.fornecedor_nome, 'Forn A E40');
    assert.strictEqual(r.body.data_cotacao, null);
    assert.strictEqual(r.body.validade, null);
    assert.ok(r.body.id > 0);
    const g = await get(r.body.id);
    assert.deepStrictEqual(g.body, r.body, 'POST e GET devolvem a MESMA linha');
  });

  await test('(2) RN-E07 numero duplicado -> 409 com o numero na frase (POST e PUT de OUTRO id); o proprio id -> 200', async () => {
    const n = num();
    const a = await post({ numero: n, fornecedor_id: fA });
    const r = await post({ numero: n, fornecedor_id: fA });
    assert.strictEqual(r.status, 409, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, `Já existe uma cotação com o número ${n}`);
    const b = await post({ numero: num(), fornecedor_id: fA });
    const r2 = await put(b.body.id, { numero: n, fornecedor_id: fA });
    assert.strictEqual(r2.status, 409);
    assert.strictEqual(r2.body.error, `Já existe uma cotação com o número ${n}`);
    const r3 = await put(a.body.id, { numero: n, fornecedor_id: fA, valor_total: 5 });
    assert.strictEqual(r3.status, 200, 'o proprio id com o mesmo numero nao e duplicata');
    assert.strictEqual(r3.body.valor_total, 5);
    // numero com espacos em volta e o MESMO numero (trim antes de comparar)
    const r4 = await post({ numero: `  ${n} `, fornecedor_id: fA });
    assert.strictEqual(r4.status, 409);
  });

  await test('(3) RN-E08 fornecedor_id ausente/"3"/0 -> 400 literal do schema; inexistente -> 400 Fornecedor não encontrado; INATIVO e aceito', async () => {
    for (const v of [undefined, '3', 0]) {
      const r = await post({ numero: num(), fornecedor_id: v });
      assert.strictEqual(r.status, 400, JSON.stringify(v));
      assert.strictEqual(r.body.error, `Dados inválidos — fornecedor_id: ${S.FORNECEDOR_COTACAO_OBRIGATORIO}`);
    }
    const r = await post({ numero: num(), fornecedor_id: 999999 });
    assert.strictEqual(r.status, 400);
    assert.deepStrictEqual(r.body, { error: FORNECEDOR_NAO_ENCONTRADO });
    const r2 = await post({ numero: num(), fornecedor_id: fB });
    assert.strictEqual(r2.status, 201, 'inativo aceito — RN-E05/D5, declarado');
  });

  await test('(4) RN-E09 datas: "" -> NULL gravado; 31/12/2026 -> 400 por campo', async () => {
    const r = await post({ numero: num(), fornecedor_id: fA, data_cotacao: '', validade: '2026-12-31' });
    assert.strictEqual(r.status, 201);
    const l = await dbGet(db, 'SELECT data_cotacao, validade FROM cotacoes WHERE id = ?', [r.body.id]);
    assert.strictEqual(l.data_cotacao, null);
    assert.strictEqual(l.validade, '2026-12-31');
    const r1 = await post({ numero: num(), fornecedor_id: fA, data_cotacao: '31/12/2026' });
    assert.strictEqual(r1.body.error, `Dados inválidos — data_cotacao: ${S.DATA_COTACAO_INVALIDA}`);
    const r2 = await post({ numero: num(), fornecedor_id: fA, validade: '31/12/2026' });
    assert.strictEqual(r2.body.error, `Dados inválidos — validade: ${S.VALIDADE_COTACAO_INVALIDA}`);
  });

  await test('(5) RN-E10 status "aprovada" -> 400 literal; "aprovado" grava', async () => {
    const r = await post({ numero: num(), fornecedor_id: fA, status: 'aprovada' });
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.body.error, `Dados inválidos — status: ${S.STATUS_COTACAO_INVALIDO}`);
    const r2 = await post({ numero: num(), fornecedor_id: fA, status: 'aprovado' });
    assert.strictEqual(r2.body.status, 'aprovado');
  });

  await test('(6) RN-E11 valor_total "10" e -1 -> 400; 12.5 grava', async () => {
    for (const v of ['10', -1]) {
      const r = await post({ numero: num(), fornecedor_id: fA, valor_total: v });
      assert.strictEqual(r.status, 400, JSON.stringify(v));
      assert.strictEqual(r.body.error, `Dados inválidos — valor_total: ${S.VALOR_COTACAO_NEGATIVO}`);
    }
    const r = await post({ numero: num(), fornecedor_id: fA, valor_total: 12.5 });
    assert.strictEqual(r.body.valor_total, 12.5);
  });

  await test('(7) RN-E13 PUT troca o fornecedor -> fornecedor_nome novo; PUT e GET de id inexistente -> 404', async () => {
    const a = await post({ numero: num(), fornecedor_id: fA, observacoes: 'antes' });
    const r = await put(a.body.id, { numero: a.body.numero, fornecedor_id: fB, status: 'rejeitado', observacoes: 'depois' });
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.strictEqual(r.body.fornecedor_nome, 'Forn B E40');
    assert.strictEqual(r.body.status, 'rejeitado');
    assert.strictEqual(r.body.observacoes, 'depois');
    const r404 = await put(999999, { numero: 'X', fornecedor_id: fA });
    assert.strictEqual(r404.status, 404);
    assert.deepStrictEqual(r404.body, { error: 'Cotação não encontrada' });
    const g404 = await get(999999);
    assert.strictEqual(g404.status, 404);
    assert.deepStrictEqual(g404.body, { error: 'Cotação não encontrada' });
    // PUT de fornecedor inexistente -> 400, e a linha NAO muda
    const r400 = await put(a.body.id, { numero: a.body.numero, fornecedor_id: 999999 });
    assert.strictEqual(r400.status, 400);
    assert.strictEqual((await get(a.body.id)).body.fornecedor_id, fB);
  });

  await test('(8) DELETE pelo generico continua 200 e a linha some', async () => {
    const a = await post({ numero: num(), fornecedor_id: fA });
    const r = await request(app).delete(`/api/compras/cotacoes/${a.body.id}`);
    assert.strictEqual(r.status, 200);
    assert.strictEqual((await get(a.body.id)).status, 404);
  });

  await test('(9) RN-E07 numero so espacos -> 400 literal do schema', async () => {
    const r = await post({ numero: '   ', fornecedor_id: fA });
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.body.error, `Dados inválidos — numero: ${S.NUMERO_COTACAO_OBRIGATORIO}`);
  });

  await test('(10) pelo SERVICO: criarCotacao com fornecedor apagado -> erro 400 com a literal; numeroDuplicado e a mesma frase da rota', async () => {
    const fC = (await dbRun(db, "INSERT INTO fornecedores (razao_social) VALUES ('Some')")).lastID;
    await dbRun(db, 'DELETE FROM fornecedores WHERE id = ?', [fC]);
    let e;
    try { await cotacaoService.criarCotacao(db, { numero: num(), fornecedor_id: fC }); } catch (x) { e = x; }
    assert.ok(e, 'devia lancar');
    assert.strictEqual(e.status, 400);
    assert.strictEqual(e.message, FORNECEDOR_NAO_ENCONTRADO);
    assert.strictEqual(cotacaoService.numeroDuplicado('Z'), 'Já existe uma cotação com o número Z');
    assert.strictEqual(cotacaoService.FORNECEDOR_COM_COTACOES, 'Fornecedor possui cotações — não pode ser excluído');
  });

  await close();
  console.log(`\n${passed} passou, ${failed} falhou`);
  process.exit(failed ? 1 : 0);
})();
```

- [x] **Step 2: rodar e ver vermelho** — `Cannot find module '../../services/compras/cotacaoService'`. Crie o arquivo vazio exportando `{}` e rode de novo: (1)–(9) caem com `404` sem JSON (`r.body = {}`), (10) com `criarCotacao is not a function`.

- [x] **Step 3: `cotacaoService.js`**

```js
/**
 * Etapa 40, Task 3 — a cotacao de compra (cabecalho: `cotacoes`, `server/index.js:19244-19256`).
 *
 * E o MESMO molde do pedido (`pedidoCompraService.js`): a rota nao faz SQL, o servico lanca
 * `erro(msg, status)` e a rota traduz `e.status`. `erro`, `assertFornecedor` e a literal de
 * fornecedor sao IMPORTADOS de la (Task 1), nao copiados — duas frases "Fornecedor não encontrado"
 * divergiriam na primeira edicao.
 *
 * `numero` e DIGITADO (contrato de `numeroDoc.js:44-64`; D6 do design) e `UNIQUE` na DDL. O 409 e
 * checado ANTES do INSERT/UPDATE (`SELECT id … WHERE numero = ? AND id <> ?`) E traduzido no catch
 * de `SQLITE_CONSTRAINT … cotacoes.numero`: sao duas guardas porque a corrida entre o SELECT e o
 * INSERT existe (sem transacao, como o resto desta base ate o Postgres).
 *
 * Nao ha itens de cotacao (zero `cotacao_itens` no sistema, medido): `valor_total` e campo de
 * entrada (D8), default 0.
 */
const { dbRun, dbGet } = require('../almoxarifado/db');
const { erro, assertFornecedor } = require('./pedidoCompraService');

const COTACAO_NAO_ENCONTRADA = 'Cotação não encontrada';
const FORNECEDOR_COM_COTACOES = 'Fornecedor possui cotações — não pode ser excluído';
const numeroDuplicado = (numero) => `Já existe uma cotação com o número ${numero}`;

const SELECT_LINHA = `SELECT c.id, c.numero, c.fornecedor_id, f.razao_social AS fornecedor_nome, c.valor_total,
  c.data_cotacao, c.validade, c.status, c.observacoes, c.created_at, c.updated_at
  FROM cotacoes c LEFT JOIN fornecedores f ON f.id = c.fornecedor_id`;

async function obterCotacao(db, id) {
  const linha = await dbGet(db, `${SELECT_LINHA} WHERE c.id = ?`, [id]);
  if (!linha) throw erro(COTACAO_NAO_ENCONTRADA, 404);
  return linha;
}

/** Normaliza o corpo JA validado pelo `CotacaoSchema` para as colunas da tabela. */
function colunas(dados) {
  return {
    numero: String(dados.numero).trim(),
    fornecedor_id: dados.fornecedor_id,
    valor_total: dados.valor_total == null ? 0 : dados.valor_total,
    data_cotacao: dados.data_cotacao || null,
    validade: dados.validade || null,
    status: dados.status || 'em_analise',
    observacoes: dados.observacoes == null ? null : dados.observacoes,
  };
}

async function assertNumeroLivre(db, numero, idAtual) {
  const outra = await dbGet(db, 'SELECT id FROM cotacoes WHERE numero = ? AND id <> ?', [numero, idAtual || 0]);
  if (outra) throw erro(numeroDuplicado(numero), 409);
}

const traduzUnique = (e, numero) => (
  /SQLITE_CONSTRAINT.*cotacoes\.numero/.test(e && e.message) ? erro(numeroDuplicado(numero), 409) : e
);

async function criarCotacao(db, dados) {
  const c = colunas(dados);
  await assertFornecedor(db, c.fornecedor_id);
  await assertNumeroLivre(db, c.numero, null);
  let r;
  try {
    r = await dbRun(db, `INSERT INTO cotacoes (numero, fornecedor_id, valor_total, data_cotacao, validade, status, observacoes)
      VALUES (?, ?, ?, ?, ?, ?, ?)`, [c.numero, c.fornecedor_id, c.valor_total, c.data_cotacao, c.validade, c.status, c.observacoes]);
  } catch (e) { throw traduzUnique(e, c.numero); }
  return obterCotacao(db, r.lastID);
}

async function atualizarCotacao(db, id, dados) {
  await obterCotacao(db, id); // 404 antes de qualquer validacao de negocio
  const c = colunas(dados);
  await assertFornecedor(db, c.fornecedor_id);
  await assertNumeroLivre(db, c.numero, id);
  try {
    await dbRun(db, `UPDATE cotacoes SET numero = ?, fornecedor_id = ?, valor_total = ?, data_cotacao = ?, validade = ?,
      status = ?, observacoes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [c.numero, c.fornecedor_id, c.valor_total, c.data_cotacao, c.validade, c.status, c.observacoes, id]);
  } catch (e) { throw traduzUnique(e, c.numero); }
  return obterCotacao(db, id);
}

module.exports = {
  criarCotacao, obterCotacao, atualizarCotacao,
  COTACAO_NAO_ENCONTRADA, FORNECEDOR_COM_COTACOES, numeroDuplicado,
};
```

⚠️ Confirme que `dbRun` de `services/almoxarifado/db.js` resolve com `{ lastID, changes }` (é o que
`pedidoCompraService` usa — leia `criarPedido`). Se resolver com o `this` do sqlite, o nome é o mesmo.

- [x] **Step 4: as rotas**, em `routes/compras.js` após o `GET /api/compras/cotacoes` (`:340`) e **antes** do genérico:

```js
// ── Cotacao de compra — criacao, leitura por id e edicao (Etapa 40, Task 3) ──────────────────────
// Mesmo molde das portas de pedido (:169-230): `validate(CotacaoSchema)` na frente, a rota nao faz
// SQL e traduz `e.status` do servico (400 fornecedor/schema, 404 nao existe, 409 numero repetido).
// Nenhuma e DELETE, entao a posicao em relacao ao generico `/:tipo/:id` e convencao, nao
// comportamento (Fase 0 servidor §1.1); ficam aqui por ser o bloco do recurso.
const cotacaoService = require('../services/compras/cotacaoService');
const respondeErro = (res, e) => res.status(e.status || 500).json({ error: e.message });

app.post('/api/compras/cotacoes', authenticateToken, checkModulePermission('compras'),
  validate(CotacaoSchema), async (req, res) => {
    try { res.status(201).json(await cotacaoService.criarCotacao(db, req.body)); }
    catch (e) { respondeErro(res, e); }
  });
app.get('/api/compras/cotacoes/:id', authenticateToken, checkModulePermission('compras'), async (req, res) => {
  try { res.json(await cotacaoService.obterCotacao(db, req.params.id)); }
  catch (e) { respondeErro(res, e); }
});
app.put('/api/compras/cotacoes/:id', authenticateToken, checkModulePermission('compras'),
  validate(CotacaoSchema), async (req, res) => {
    try { res.json(await cotacaoService.atualizarCotacao(db, req.params.id, req.body)); }
    catch (e) { respondeErro(res, e); }
  });
```

`:60` **já traz `CotacaoSchema`** desde a T1 (Fase 2, I3) — **não edite essa linha**. O `require` de
`cotacaoService` vai numa **linha nova após `:61`** (o `require` de `pedidoCompraService`), no topo com
os outros; o bloco acima o mostra junto só para leitura. `respondeErro` fica onde o bloco mostra.

- [x] **Step 5: rodar** — o arquivo (**10 passou**); `comprasPedidoEditarExcluir` (**13**); `npm run test:api`.

- [x] **Step 6: sabotagens**

| # | Sabotagem | Âncora | Cai |
|---|---|---|---|
| 1 | `assertNumeroLivre`: `AND id <> ?` → remover | 1 | **(2)** *"o proprio id com o mesmo numero nao e duplicata"* |
| 2 | `colunas`: `status: dados.status \|\| 'em_analise'` → `dados.status` | 1 | **(1)** `status` veio `null` |
| 3 | `criarCotacao`: remover `await assertFornecedor(...)` | 1 no criar | **(3)** inexistente → 201; **(10)** |
| 4 | `obterCotacao`: `erro(COTACAO_NAO_ENCONTRADA, 404)` → `400` | 1 | **(7)** os dois 404 |
| 5 | `traduzUnique` + `assertNumeroLivre` — só a segunda guarda removida | — | **nada cai, e é previsto**: a primeira guarda cobre o caso sem corrida. Declare (letra G): a tradução do `UNIQUE` só é exercida por corrida. |

- [x] **Step 7: commit** — `git add server/services/compras/cotacaoService.js server/routes/compras.js server/tests/api/comprasCotacaoRotas.api.test.js`. Mensagem em `msg-e40-t3.txt`.

#### ✅ Task 3 FECHADA — `29dd6a8` (Compras Etapa 40 T3: cotacaoService e as portas POST, GET /:id e PUT de cotacao)

> Hash medido na branch `e40-t3` (worktree `wt-e40-t3`, base `07d6893`). **Será reescrito no
> cherry-pick para o tronco** — quem integrar atualiza este cabeçalho com o hash novo.

**Números lidos (não previstos):**

| Suíte | Step 2a (sem módulo) | Step 2b (`module.exports = {}`) | Só serviço, sem rotas | Depois (Step 5) |
|---|---|---|---|---|
| `comprasCotacaoRotas.api.test.js` | `Cannot find module '../../services/compras/cotacaoService'` | **`0 passou, 10 falhou`** | `1 passou, 9 falhou` (só a (10), pelo serviço) | **`10 passou, 0 falhou`** |
| `comprasPedidoEditarExcluir.api.test.js` | — | — | — | **`13 passou, 0 falhou`** |
| `npm run test:api` | — | — | — | **`189/189 arquivos de teste OK`** (188 + este) |

`dbRun` de `services/almoxarifado/db.js:5-12` resolve `{ lastID, changes }` — conferido por
leitura antes de usar `r.lastID`. CR = 0 nos três arquivos depois de cada edição; `git ls-files
--eol` mostra `i/lf w/lf` nos três. Posições recontadas antes de editar `routes/compras.js`: o
`require` novo ficou em `:63` (linha nova após o de `pedidoCompraService`, `:61`, com um comentário
em `:62`; a `:60` não foi tocada); `respondeErro` em `:349`, as três rotas em `:351-364`, o genérico
`DELETE /:tipo/:id` desceu para `:367`.

**Sabotagens** (md5 de `cotacaoService.js` antes `49a6cedf`, sabotado ≠ nas cinco, pós-restauro
`49a6cedf` nas cinco; restauro por `cp` do scratchpad; âncora contada = 1 nas cinco; roteiro em
`scratchpad/sab-e40-t3.sh`):

| # | Sabotagem | Placar | QUAL asserção caiu |
|---|---|---|---|
| 1 | `assertNumeroLivre`: `WHERE numero = ? AND id <> ?` → `WHERE numero = ?` | 8/2 | **(2)** `o proprio id com o mesmo numero nao e duplicata` (o `PUT` do próprio id veio 409); **(7)** também — o `PUT` que troca o fornecedor mantém o `numero` e caiu com `{"error":"Já existe uma cotação com o número COT-E40-017"}` (o plano previa só a (2)) |
| 2 | `colunas`: `status: dados.status \|\| 'em_analise'` → `dados.status` | 9/1 | **(1)** `status` veio `null` (o `INSERT` manda `NULL` explícito, então o `DEFAULT` da DDL não socorre) |
| 3 | `criarCotacao`: `await assertFornecedor(...)` removido (âncora = as duas linhas de guarda, para não pegar o do `atualizarCotacao`) | 8/2 | **(3)** `fornecedor_id: 999999` veio 201 em vez de 400; **(10)** `devia lancar` |
| 4 | `obterCotacao`: `erro(COTACAO_NAO_ENCONTRADA, 404)` → `400` | 8/2 | **(7)** `r404.status` 400 ≠ 404; **(8)** também — o `GET` depois do `DELETE` veio 400 (o plano previa só a (7)) |
| 5 | `traduzUnique`: o `.test(...)` do `SQLITE_CONSTRAINT … cotacoes.numero` → `false` (segunda guarda nunca traduz) | 10/0 | **nada caiu, e é PREVISTO**: a primeira guarda (`assertNumeroLivre`) cobre todo caso sem corrida; a tradução do `UNIQUE` só é exercida por corrida entre o `SELECT` e o `INSERT`. Declarado no cabeçalho do serviço; vai para a **letra G** do fechamento. |

Controle positivo: as sabotagens 1–4 cortaram **exatamente** o cenário que a tabela do Step 6
previa (duas delas cortaram um cenário a mais, listado acima), e o arquivo voltou a `10 passou`
com o md5 original depois do último restauro.

**Divergências entre o plano e o que o código exigiu:**

1. **Vermelho do Step 2b para a (10):** o plano previa `criarCotacao is not a function`; saiu
   `Expected values to be strictly equal` — o cenário tem `try { … } catch (x) { e = x; }` em volta
   da chamada, então o `TypeError` é capturado e quem cai é `assert.strictEqual(e.status, 400)`
   (`undefined ≠ 400`). O teste está certo; a previsão do plano é que ignorava o `catch`.
2. **Sabotagem 1 corta dois cenários, não um:** a (7) faz `PUT` mantendo o próprio `numero`
   (troca só o fornecedor), então sem o `AND id <> ?` ela também vira 409. Sinal positivo: o
   cenário (7) é uma segunda régua da mesma regra.
3. **Sabotagem 4 corta dois cenários, não um:** a (8) mede `404` no `GET` depois do `DELETE` e
   também caiu. Mesma leitura.
4. **Âncora da sabotagem 3:** `await assertFornecedor(db, c.fornecedor_id);` sozinho tem **2**
   ocorrências (criar e atualizar); a âncora usada foi o par de linhas
   `assertFornecedor` + `assertNumeroLivre(db, c.numero, null)` (1 ocorrência, o `null` só existe
   no `criarCotacao`).
5. **Âncora da sabotagem 1:** `WHERE numero = ? AND id <> ?` tem **2** ocorrências (a segunda no
   cabeçalho de comentário do serviço); a âncora usada foi a linha inteira com `[numero, idAtual || 0]`
   (1 ocorrência).
6. **Heredoc do Bash quebrou** ao escrever o teste (`unexpected EOF while looking for matching`)
   — o arquivo foi escrito com o Write tool; conteúdo idêntico ao bloco do Step 1.
7. O bloco do Step 4 mostra o `require` de `cotacaoService` dentro do bloco das rotas "só para
   leitura"; ficou no topo, em `:63`, como o plano manda. `comprasPedidosRotas` e
   `comprasPedidoCriar` não foram rodados isolados (o plano não os pede para a T3); os dois estão
   dentro do `189/189`.

---

### Task 4: `FornecedorForm` — a tela, as duas rotas e a suíte **(galho, worktree `wt-e40-t4`)**

**Files:**
- Create: `client/src/components/compras/FornecedorForm.js`
- Modify: `client/src/routes/lazyModules.js` (após `:61`, o export de `PedidoCompraForm`), `client/src/App.js` (após `:362`, o `pedidos/editar/:id`)
- Test: `client/src/components/compras/FornecedorForm.test.js` (novo)

**Interfaces:**
- Consumes (mock HTTP, contrato congelado): `GET /compras/fornecedores/:id` → linha (§5.2); `GET /compras/grupos` → `[{ id, nome }]`; `POST /compras/fornecedores` → `201 { id, … }`; `PUT /compras/fornecedores/:id` → `200 { message }`; `DELETE /compras/fornecedores/:id` → `409 { error: 'Fornecedor possui cotações — não pode ser excluído' }`.
- Produces: rotas `fornecedores/novo` e `fornecedores/editar/:id`; `data-testid` do design §5.5.

- [x] **Step 1: o teste (vermelho: a rota cai no `*` e o `h1` é "Compras")**

Cabeçalho, mocks e helpers **copiados** de `PedidoCompraForm.test.js:44-112` e `:188-304` (`api` com
`patch`; Proxy com `reais = { Compras, FornecedorForm: require('./FornecedorForm').default, Layout }`;
os cinco `jest.mock` de barreiras; `renderizarEm`, `clicar`, `digitar`, `selecionar`, `texto`,
`porTestId`, `alertas`, `linkPorTexto`). `submeter()` procura `form[data-testid="fornecedor-form"]`.
Fixtures (ids fora do conjunto ocupado):

```js
const GRUPOS = [{ id: 71, nome: 'Aços' }, { id: 72, nome: 'Fixadores' }];
const FORNECEDOR_530 = {
  id: 530, razao_social: 'Metalúrgica Norte', nome_fantasia: 'MetNorte', cnpj: '11222333000144',
  contato: 'Ana', email: 'ana@metnorte.com', telefone: '(47) 99999-1111', endereco: 'Rua A, 10',
  cidade: null, estado: null, cep: null, status: 'ativo', grupo_id: 72, foto: null,
  created_at: '2026-09-01 10:00:00', updated_at: '2026-09-01 10:00:00',
};
const LISTA = [{ id: 530, razao_social: 'Metalúrgica Norte', nome_fantasia: 'MetNorte', cnpj: '11222333000144', contato: 'Ana', email: 'ana@metnorte.com', telefone: '(47) 99999-1111', status: 'ativo' }];
const LITERAL_409_COTACAO = 'Fornecedor possui cotações — não pode ser excluído';
```

`beforeEach` (`api.get`): `/compras/fornecedores` → `LISTA`; `/compras/grupos` → `GRUPOS`;
`/compras/fornecedores/530` → `FORNECEDOR_530`; `/compras/pedidos` e `/compras/cotacoes` → `[]`;
resto rejeita. `api.post` → `{ data: { id: 531, razao_social: 'Nova', nome_fantasia: '', grupo_id: null } }`;
`api.put` → `{ data: { message: 'Fornecedor atualizado' } }`.

Cenários:

```js
test('(a) /compras/fornecedores/novo renderiza "Novo fornecedor" e o form (nao volta para a lista)', async () => {
  await renderizarEm('/compras/fornecedores/novo');
  expect(texto()).toContain('Novo fornecedor');
  expect(porTestId('fornecedor-form')).not.toBeNull();
  expect(texto()).not.toContain('Gestão de fornecedores, pedidos e cotações');
  expect(porTestId('fornecedor-status')).toBeNull(); // status so na edicao
});

test('(b) "Novo Fornecedor" da aba e o lapis da linha chegam ao formulario', async () => {
  await renderizarEm('/compras/fornecedores');
  await clicar(linkPorTexto('Novo Fornecedor'));
  expect(texto()).toContain('Novo fornecedor');
  await act(async () => { root.unmount(); }); container.remove();
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  await renderizarEm('/compras/fornecedores');
  await clicar(container.querySelector('a[title="Editar"]'));
  expect(texto()).toContain('Editar fornecedor');
  expect(api.get.mock.calls.filter(([u]) => u === '/compras/fornecedores/530')).toHaveLength(1);
});

test('(c) RN-E15 submit sem razao social -> alerta local, POST nao chamado', async () => {
  await renderizarEm('/compras/fornecedores/novo');
  await submeter();
  expect(alertas()).toContain('Razão social é obrigatória');
  expect(api.post).not.toHaveBeenCalled();
});

test('(d) RN-E14 POST exato: 7 textos + grupo_id, e navega para a aba com toast', async () => {
  await renderizarEm('/compras/fornecedores/novo');
  digitar(porTestId('fornecedor-razao'), 'Parafusos Norte');
  digitar(porTestId('fornecedor-email'), 'x@y.z');
  await selecionar(porTestId('fornecedor-grupo'), '71');
  await submeter();
  expect(api.post.mock.calls).toHaveLength(1);
  expect(api.post.mock.calls[0]).toEqual(['/compras/fornecedores', {
    razao_social: 'Parafusos Norte', nome_fantasia: '', cnpj: '', contato: '', email: 'x@y.z', telefone: '', endereco: '', grupo_id: '71',
  }]);
  expect(toast.success).toHaveBeenCalledWith('Fornecedor salvo');
  expect(texto()).toContain('Gestão de fornecedores, pedidos e cotações'); // voltou para a lista
});

test('(e) RN-E02/E04/E06 edicao: GET /:id preenche, PUT manda TODOS os campos + status', async () => {
  await renderizarEm('/compras/fornecedores/editar/530');
  expect(porTestId('fornecedor-razao').value).toBe('Metalúrgica Norte');
  expect(porTestId('fornecedor-grupo').value).toBe('72');
  expect(porTestId('fornecedor-status').value).toBe('ativo');
  await selecionar(porTestId('fornecedor-status'), 'inativo');
  await submeter();
  expect(api.put.mock.calls).toHaveLength(1);
  expect(api.put.mock.calls[0]).toEqual(['/compras/fornecedores/530', {
    razao_social: 'Metalúrgica Norte', nome_fantasia: 'MetNorte', cnpj: '11222333000144', contato: 'Ana',
    email: 'ana@metnorte.com', telefone: '(47) 99999-1111', endereco: 'Rua A, 10', grupo_id: '72', status: 'inativo',
  }]);
  expect(toast.success).toHaveBeenCalledWith('Fornecedor salvo');
});

test('(f) 400 do servidor vai para role=alert com a literal, sem toast de erro', async () => {
  api.post.mockImplementation(() => Promise.reject({ response: { status: 400, data: { error: 'Dados inválidos — grupo_id: grupo do fornecedor inválido' } } }));
  await renderizarEm('/compras/fornecedores/novo');
  digitar(porTestId('fornecedor-razao'), 'X');
  await submeter();
  expect(alertas()).toContain('Dados inválidos — grupo_id: grupo do fornecedor inválido');
  expect(toast.error).not.toHaveBeenCalled();
  expect(texto()).toContain('Novo fornecedor'); // continua na tela
});

test('(g) a lixeira da aba Fornecedores mostra a literal do 409 por cotacao', async () => {
  const confirmOriginal = window.confirm; window.confirm = jest.fn(() => true);
  api.delete.mockImplementation(() => Promise.reject({ response: { status: 409, data: { error: LITERAL_409_COTACAO } } }));
  try {
    await renderizarEm('/compras/fornecedores');
    await clicar(container.querySelector('button[title="Excluir"]'));
    expect(api.delete.mock.calls[0][0]).toBe('/compras/fornecedores/530');
    expect(toast.error).toHaveBeenCalledWith(LITERAL_409_COTACAO);
    expect(texto()).toContain('Metalúrgica Norte');
    // metade positiva
    api.delete.mockImplementation(() => Promise.resolve({ data: { message: 'Item excluído com sucesso' } }));
    await clicar(container.querySelector('button[title="Excluir"]'));
    expect(toast.success).toHaveBeenCalledTimes(1);
  } finally { window.confirm = confirmOriginal; }
});

test('(h) RN-E03 "Sem grupo" viaja como grupo_id "" (o servidor limpa)', async () => {
  await renderizarEm('/compras/fornecedores/editar/530');
  await selecionar(porTestId('fornecedor-grupo'), '');
  await submeter();
  expect(api.put.mock.calls[0][1].grupo_id).toBe('');
});
```

- [x] **Step 2: rodar** — `cd client && CI=true npx react-scripts test --watchAll=false src/components/compras/FornecedorForm.test.js`. Esperado: (a)–(h) caem (a rota não existe; `require('./FornecedorForm')` falha primeiro — crie o arquivo com `export default () => null` para ver as asserções cairem uma a uma).

- [x] **Step 3: a tela**

```jsx
/**
 * Etapa 40, Task 4 — criacao e edicao de FORNECEDOR (`/compras/fornecedores/novo`,
 * `/compras/fornecedores/editar/:id`). Ate esta etapa os dois caminhos caiam no `path="*"` e
 * voltavam para a lista (Fase 0 cliente §2.2).
 *
 * Molde: `PedidoCompraForm.js` — erro do servidor em `role="alert"`, toast so no sucesso, CSS de
 * `../Compras.css`. Regras que esta tela conhece do servidor (RN-E02/E03/E04):
 *   - o `PUT` e SUBSTITUICAO TOTAL dos sete textos: o payload manda TODOS, sempre;
 *   - `grupo_id` viaja como STRING do `<select>` (`''` = "Sem grupo", e o servidor LIMPA);
 *   - `status` so existe na edicao (o servidor grava 'ativo' na criacao e ignora a chave).
 * Sem foto (fica no modal de Fornecedores homologados) e sem cidade/estado/cep (colunas sem
 * consumidor) — declarado no design (D12, secao 8).
 */
import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { FiArrowLeft, FiSave } from 'react-icons/fi';
import api from '../../services/api';
import { toast } from 'react-toastify';
import { formatarErroPermissao } from '../../utils/permissaoErro';
import { mascararTelefoneDigitando } from '../../utils/telefone';
import '../Compras.css';

const LITERAL_RAZAO = 'Razão social é obrigatória';
const CAMPOS = ['razao_social', 'nome_fantasia', 'cnpj', 'contato', 'email', 'telefone', 'endereco'];

function mensagemDeErro(erro, fallback) {
  const data = erro?.response?.data;
  return formatarErroPermissao(data) || data?.error || fallback;
}

const FornecedorForm = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const edicao = Boolean(id);
  const [form, setForm] = useState({ razao_social: '', nome_fantasia: '', cnpj: '', contato: '', email: '', telefone: '', endereco: '' });
  const [grupoId, setGrupoId] = useState('');
  const [status, setStatus] = useState('ativo');
  const [grupos, setGrupos] = useState([]);
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(edicao);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    let vivo = true;
    api.get('/compras/grupos')
      .then((res) => { if (vivo) setGrupos(res.data || []); })
      .catch(() => { if (vivo) setGrupos([]); }); // grupo e opcional: sem lista, o select fica so com "Sem grupo"
    return () => { vivo = false; };
  }, []);

  useEffect(() => {
    if (!edicao) return undefined;
    let vivo = true;
    api.get(`/compras/fornecedores/${id}`)
      .then((res) => {
        if (!vivo) return;
        const f = res.data || {};
        setForm(Object.fromEntries(CAMPOS.map((c) => [c, f[c] == null ? '' : String(f[c])])));
        setGrupoId(f.grupo_id == null ? '' : String(f.grupo_id));
        setStatus(f.status || 'ativo');
      })
      .catch((e) => { if (vivo) setErro(mensagemDeErro(e, 'Não foi possível carregar o fornecedor.')); })
      .finally(() => { if (vivo) setCarregando(false); });
    return () => { vivo = false; };
  }, [id, edicao]);

  const campo = (nome) => (ev) => {
    const valor = nome === 'telefone' ? mascararTelefoneDigitando(ev.target.value) : ev.target.value;
    setForm((f) => ({ ...f, [nome]: valor }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErro('');
    if (!form.razao_social.trim()) { setErro(LITERAL_RAZAO); return; }
    const payload = { ...form, grupo_id: grupoId };
    if (edicao) payload.status = status;
    setSalvando(true);
    try {
      if (edicao) await api.put(`/compras/fornecedores/${id}`, payload);
      else await api.post('/compras/fornecedores', payload);
      toast.success('Fornecedor salvo');
      navigate('/compras/fornecedores');
    } catch (err) {
      setErro(mensagemDeErro(err, 'Não foi possível salvar o fornecedor.'));
    } finally {
      setSalvando(false);
    }
  };

  const rotulo = { razao_social: 'Razão social', nome_fantasia: 'Nome fantasia', cnpj: 'CNPJ', contato: 'Contato', email: 'E-mail', telefone: 'Telefone', endereco: 'Endereço' };
  const testId = { razao_social: 'fornecedor-razao', nome_fantasia: 'fornecedor-fantasia', cnpj: 'fornecedor-cnpj', contato: 'fornecedor-contato', email: 'fornecedor-email', telefone: 'fornecedor-telefone', endereco: 'fornecedor-endereco' };

  return (
    <div className="compras">
      <div className="page-header">
        <div>
          <Link to="/compras/fornecedores" className="btn-secondary" style={{ marginBottom: 8, display: 'inline-flex' }}>
            <FiArrowLeft /> Voltar para fornecedores
          </Link>
          <h1>{edicao ? 'Editar fornecedor' : 'Novo fornecedor'}</h1>
        </div>
      </div>

      {erro && (
        <div role="alert" style={{ background: 'rgba(231, 76, 60, 0.12)', color: '#c0392b', border: '1px solid #e74c3c', borderRadius: 8, padding: '10px 14px', marginBottom: 16 }}>
          {erro}
        </div>
      )}

      {carregando ? <div className="loading">Carregando...</div> : (
        <form data-testid="fornecedor-form" onSubmit={handleSubmit}>
          <div className="filters" style={{ flexWrap: 'wrap', gap: 12 }}>
            {CAMPOS.map((nome) => (
              <label key={nome} style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: nome === 'endereco' ? '100%' : 220 }}>
                {rotulo[nome]}{nome === 'razao_social' ? ' *' : ''}
                {/* `type="text"` TAMBEM no e-mail (Fase 2, M9): `type="email"` faria o navegador
                    bloquear o submit com tooltip nativa, e o servidor NAO valida formato (D3) —
                    o modal de FornecedoresDoGrupo, na mesma porta, aceita qualquer texto. */}
                <input data-testid={testId[nome]} type="text" value={form[nome]} onChange={campo(nome)} />
              </label>
            ))}
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              Grupo
              <select data-testid="fornecedor-grupo" value={grupoId} onChange={(ev) => setGrupoId(ev.target.value)} className="filter-select">
                <option value="">Sem grupo</option>
                {grupos.map((g) => <option key={g.id} value={g.id}>{g.nome}</option>)}
              </select>
            </label>
            {edicao && (
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                Status
                <select data-testid="fornecedor-status" value={status} onChange={(ev) => setStatus(ev.target.value)} className="filter-select">
                  <option value="ativo">Ativo</option>
                  <option value="inativo">Inativo</option>
                </select>
              </label>
            )}
          </div>
          <div className="header-actions">
            <button type="submit" className="btn-premium" disabled={salvando}>
              <FiSave /> {salvando ? 'Salvando...' : 'Salvar fornecedor'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
};

export default FornecedorForm;
```

⚠️ Confirme o nome do export de `client/src/utils/telefone.js` (`mascararTelefoneDigitando`, Fase 0
cliente §4) por `grep -n "export" client/src/utils/telefone.js` antes de importar.

**RN-E05 até o último gesto (Fase 2, I4 — registrar, não codar aqui):** um fornecedor **inativado**
por esta tela continua aparecendo no `<select>` "Adicionar existente" de `FornecedoresDoGrupo.js`
(`:72`, lista sem filtro) e pode ser vinculado com `PUT` 200 + toast de sucesso — e **não aparece** no
grupo, porque `GET /grupos/:id/fornecedores` filtra `status='ativo'` (`routes/compras.js:528`). É
sucesso silencioso da mesma classe do "Remover do grupo" que esta etapa conserta, e era inalcançável
antes dela (nenhuma porta escrevia `status`). Fica em **letra C/G** e no roteiro do guia (T7); o
conserto de uma linha (`FornecedoresDoGrupo.js:154`, filtrar `status !== 'inativo'`) fica **fora**
porque o arquivo não tem suíte — decisão reversível, registrada na letra B.

- [x] **Step 4: rotas e lazy**

`lazyModules.js`, após `:61`:
```js
// Etapa 40, Task 4: a tela de fornecedor — mesmo motivo do PedidoCompraForm acima.
export const FornecedorForm = page(() => import('../components/compras/FornecedorForm'));
```
`App.js:43-45` — acrescentar `FornecedorForm` ao import de `./routes/lazyModules`. Após `:362`:
```jsx
            {/* Etapa 40, Task 4: os dois caminhos da aba Fornecedores que caiam no `*` */}
            <Route path="fornecedores/novo" element={<FornecedorForm />} />
            <Route path="fornecedores/editar/:id" element={<FornecedorForm />} />
```

- [x] **Step 5: rodar** — o arquivo (8), depois `PedidoCompraForm.test.js` (25) e `Compras.test.js` (9), depois a suíte inteira (`CI=true npx react-scripts test --watchAll=false`, esperado **50 suítes**) e `CI=true npx react-scripts build`.

- [x] **Step 6: sabotagens**

| # | Sabotagem | Cai |
|---|---|---|
| 1 | payload do `PUT` sem `endereco` (`const { endereco, ...resto } = form`) | **(e)** `toEqual` do payload |
| 2 | `if (edicao) payload.status = status;` → sempre | **(d)** `toEqual` (chave `status` a mais) |
| 3 | `setErro(LITERAL_RAZAO); return;` → só `return` | **(c)** `alertas()` vazio |
| 4 | `toast.error(...)` no `catch` em vez de `setErro` | **(f)** |
| 5 | rota `fornecedores/editar/:id` removida | **(b)** segunda metade, **(e)**, **(h)** |

- [x] **Step 7: commit** — `git add client/src/components/compras/FornecedorForm.js client/src/components/compras/FornecedorForm.test.js client/src/routes/lazyModules.js client/src/App.js`. Mensagem em `msg-e40-t4.txt`.

#### ✅ Task 4 FECHADA — `23b86f3` (Compras Etapa 40 T4: FornecedorForm, rotas fornecedores/novo e editar/:id e suite de 8 cenarios)

> Hash medido na branch `e40-t4` (worktree `wt-e40-t4`, base `07d6893`). **Será reescrito no
> cherry-pick para o tronco** — quem integrar (T6) atualiza este cabeçalho com o hash novo.

**Números lidos (não previstos):**

| Suíte | Vermelho (Step 2) | Depois |
|---|---|---|
| `FornecedorForm.test.js` | sem o arquivo: `Cannot find module './FornecedorForm'` (0 total); com `export default () => null`: **`7 falhou, 1 passou`** — (a) caiu em `toContain('Novo fornecedor')` com o texto da lista; (e) em `porTestId('fornecedor-razao').value` de `null` | **`8 passou`** |
| `PedidoCompraForm.test.js` + `Compras.test.js` | — | **`34 passou`** (25 + 9) |
| suíte inteira do client | — | **`50 suítes, 761 testes`** |
| `CI=true npx react-scripts build` | — | **`Compiled successfully.`** (ESLint desligado no build; imports revisados à mão: todos usados) |

CR = 0 nos quatro arquivos depois de cada edição e depois de cada restauro.

**Sabotagens (md5 de `FornecedorForm.js` antes `36679e96…`, sabotado ≠, pós-restauro `36679e96…`
nas quatro; `App.js` antes `9eddefd5…`, pós-restauro `9eddefd5…`; restauro por `cp` do scratchpad;
âncora contada com `grep -cF` = 1 nas cinco):**

| # | Sabotagem | Placar | QUAL asserção caiu |
|---|---|---|---|
| 1 | `const { endereco, ...resto } = form; const payload = { ...resto, … }` | 6/2 | **(e)** `toEqual` do `PUT`: `- Expected -1` (chave `endereco`); **(d)** também — o `POST` usa o mesmo `payload` |
| 2 | `if (edicao) payload.status = status;` → `payload.status = status;` | 7/1 | **(d)** `toEqual` do `POST`: `+ Received +1  "status": "ativo"` |
| 3 | `{ setErro(LITERAL_RAZAO); return; }` → `{ return; }` | 7/1 | **(c)** `alertas()`: `Expected substring: "Razão social é obrigatória" / Received string: ""` |
| 4 | `setErro(mensagemDeErro(err, …))` → `toast.error(mensagemDeErro(err, …))` | 7/1 | **(f)** `alertas()`: `Expected substring: "Dados inválidos — grupo_id: …" / Received string: ""` (e `toast.error` chamado) |
| 5 | `<Route path="fornecedores/editar/:id" …/>` removida | 5/3 | **(b)** segunda metade: `Expected substring: "Editar fornecedor"`, recebeu o texto da lista; **(e)** e **(h)** `porTestId(...)` de `null` |

Controle positivo: os cinco cortes derrubaram o cenário previsto na tabela do Step 6 (o corte 1
derrubou **(d) além de (e)**, ver divergência 2), e o arquivo voltou a `8 passou` com o md5 original
depois do último restauro, antes do commit.

**Divergências entre o plano e o que o código exigiu:**

1. **(g) já era verde contra o código de hoje** (`7 falhou, 1 passou` com o stub nulo; o plano dizia
   "(a)–(h) caem"). É caracterização do `handleDelete` de `Compras.js:165`, que desde a Etapa 38
   mostra a literal do servidor — nenhuma das cinco sabotagens o derruba porque ele não mede a tela
   nova, mede o contrato do 409 por cotação que a T2/T3 entregam. Fica na suíte como régua do
   contrato, declarado no commit.
2. **Sabotagem 1 derruba (d) e (e)**, não só (e): `POST` e `PUT` montam o mesmo `payload`; tirar
   `endereco` tira dos dois.
3. **Incidente do harness, registrado para não repetir:** um `perl -pi` para alargar o `grep` do
   script de sabotagem quebrou a citação da linha; o `bash` abortou **antes do `cp` de restauro** e os
   cortes 2, 3 e 4 se **empilharam** em `FornecedorForm.js` (o "md5 antes" do corte 3 era o "sabotado"
   do 2), e `App.js` ficou sem a rota. Restauro por `sab2.bak` (form) e `sab5.bak` (App.js), md5
   conferido igual ao limpo (`36679e96…` / `9eddefd5…`), `git diff` reconferido com só as 6 linhas
   da task, e os cortes 2–5 rodados de novo com **guarda de md5 entre rodadas**. Lição: `bash -n` no
   script depois de qualquer edição, e o restauro tem de ser `trap`/guardado, não a última linha.
4. **Heredoc com acento não passa pelo Bash tool desta máquina** (`unexpected EOF while looking for
   matching '''` num `<<'EOF'` de 266 linhas) — o arquivo de teste e a tela foram escritos com o
   Write tool; só as edições ASCII (`lazyModules.js`, `App.js`) foram por `perl -0pi`.
5. Linhas citadas **bateram**: `lazyModules.js:61` (export de `PedidoCompraForm`), `App.js:45`
   (`PedidoCompraForm,` no import) e `:360-362` (a `<Route path="pedidos/editar/:id">`, fechando em
   `:362`). Exports confirmados antes de importar: `mascararTelefoneDigitando` (`telefone.js:14`) e
   `formatarErroPermissao` (`permissaoErro.js:135`). Depois da T4, `App.js` cresceu 4 linhas (as rotas
   novas em `:364-366`; o que vinha depois desloca +4) e `lazyModules.js` 2 (`FornecedorForm` em `:63`).
   **T5 reconta** os dois antes de editar.
6. **RN-E05 (fornecedor inativado ainda aparece no "Adicionar existente" do grupo)** não foi codado,
   como o plano manda — continua para a letra B/C e o roteiro do guia (T7).

---

### Task 5: `CotacaoForm` — a tela, as duas rotas, o rótulo e o status por aba **(galho, worktree `wt-e40-t5`)**

**Files:**
- Create: `client/src/components/compras/CotacaoForm.js`
- Modify: `client/src/routes/lazyModules.js` (após `:63`, `FornecedoresDoGrupo`), `client/src/App.js` (após `:374`, `fornecedores-homologados/fornecedor/:fornecedorId`), `client/src/components/Compras.js:496` (rótulo) e `:519-525` (opções)
- Test: `client/src/components/compras/CotacaoForm.test.js` (novo)

**Interfaces:**
- Consumes (mock HTTP): `GET /compras/fornecedores` → lista (`razao_social`); `GET /compras/cotacoes/:id` → linha (§5.4); `POST /compras/cotacoes` → `201` linha; `PUT` → `200` linha; `409 { error: 'Já existe uma cotação com o número X' }`.
- Produces: rotas `cotacoes/nova` e `cotacoes/editar/:id`; rótulo `Nova Cotação`; `<select>` de status por aba.

- [x] **Step 1: o teste** — mesmo cabeçalho da T4 (com `CotacaoForm` em `reais`). Fixtures:

```js
const FORNECEDORES = [{ id: 355, razao_social: 'Parafusos Sul', status: 'ativo' }, { id: 312, razao_social: 'Aços Vale Ltda', status: 'ativo' }];
const COTACAO_760 = { id: 760, numero: 'COT-2026-760', fornecedor_id: 312, fornecedor_nome: 'Aços Vale Ltda', valor_total: 1500.5,
  data_cotacao: '2026-09-10', validade: '2026-10-10', status: 'em_analise', observacoes: 'frete incluso', created_at: '2026-09-10 09:00:00', updated_at: '2026-09-10 09:00:00' };
const LISTA = [{ ...COTACAO_760 }];
```

`api.get`: `/compras/fornecedores` → `FORNECEDORES`; `/compras/cotacoes` → `LISTA`; `/compras/cotacoes/760` → `COTACAO_760`; `/compras/pedidos` → `[]`; resto rejeita. `api.post` → `{ data: { ...COTACAO_760, id: 761, numero: 'COT-2026-761' } }`; `api.put` → `{ data: COTACAO_760 }`.

Cenários:

```js
test('(a) /compras/cotacoes/nova renderiza "Nova cotação" e o form, com a data de hoje LOCAL', async () => {
  // controle de fuso, como Compras.test.js:197-202: o globalSetup fixa America/Sao_Paulo
  expect(new Date().getTimezoneOffset()).toBe(180);
  await renderizarEm('/compras/cotacoes/nova');
  expect(texto()).toContain('Nova cotação');
  const hoje = new Date();
  const esperado = [hoje.getFullYear(), String(hoje.getMonth() + 1).padStart(2, '0'), String(hoje.getDate()).padStart(2, '0')].join('-');
  expect(porTestId('cotacao-data').value).toBe(esperado);
  expect(porTestId('cotacao-status').value).toBe('em_analise');
});

test('(b) RN-E16 o botao da aba diz "Nova Cotação" e chega ao form; o lapis tambem', async () => {
  await renderizarEm('/compras/cotacoes');
  expect(linkPorTexto('Novo Cotação')).toBeUndefined();
  await clicar(linkPorTexto('Nova Cotação'));
  expect(texto()).toContain('Nova cotação');
  await act(async () => { root.unmount(); }); container.remove();
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  await renderizarEm('/compras/cotacoes');
  await clicar(container.querySelector('a[title="Editar"]'));
  expect(texto()).toContain('Editar cotação');
  expect(porTestId('cotacao-numero').value).toBe('COT-2026-760');
});

test('(c) RN-E15 sem numero -> alerta; com numero e sem fornecedor -> alerta; POST nao chamado', async () => {
  await renderizarEm('/compras/cotacoes/nova');
  await submeter();
  expect(alertas()).toContain('Número da cotação é obrigatório');
  digitar(porTestId('cotacao-numero'), 'COT-1');
  await submeter();
  expect(alertas()).toContain('Fornecedor da cotação é obrigatório');
  expect(api.post).not.toHaveBeenCalled();
});

test('(d) RN-E14 POST com Number() nos numericos e navega com toast', async () => {
  await renderizarEm('/compras/cotacoes/nova');
  digitar(porTestId('cotacao-numero'), 'COT-1');
  await selecionar(porTestId('cotacao-fornecedor'), '312');
  digitar(porTestId('cotacao-valor'), '99.9');
  digitar(porTestId('cotacao-validade'), '2026-12-01');
  await submeter();
  const [url, corpo] = api.post.mock.calls[0];
  expect(url).toBe('/compras/cotacoes');
  expect(corpo.fornecedor_id).toBe(312);
  expect(corpo.valor_total).toBe(99.9);
  expect(corpo.numero).toBe('COT-1');
  expect(corpo.validade).toBe('2026-12-01');
  expect(corpo.status).toBe('em_analise');
  expect(typeof corpo.data_cotacao).toBe('string');
  expect(toast.success).toHaveBeenCalledWith('Cotação salva');
  expect(texto()).toContain('Gestão de fornecedores, pedidos e cotações');
});

test('(e) RN-E13 edicao: GET /:id preenche e o PUT manda o cabecalho inteiro', async () => {
  await renderizarEm('/compras/cotacoes/editar/760');
  expect(porTestId('cotacao-fornecedor').value).toBe('312');
  expect(porTestId('cotacao-valor').value).toBe('1500.5');
  await selecionar(porTestId('cotacao-status'), 'aprovado');
  await submeter();
  expect(api.put.mock.calls[0]).toEqual(['/compras/cotacoes/760', {
    numero: 'COT-2026-760', fornecedor_id: 312, valor_total: 1500.5, data_cotacao: '2026-09-10', validade: '2026-10-10', status: 'aprovado', observacoes: 'frete incluso',
  }]);
});

test('(f) 409 do numero vai para role=alert com a literal', async () => {
  api.post.mockImplementation(() => Promise.reject({ response: { status: 409, data: { error: 'Já existe uma cotação com o número COT-1' } } }));
  await renderizarEm('/compras/cotacoes/nova');
  digitar(porTestId('cotacao-numero'), 'COT-1');
  await selecionar(porTestId('cotacao-fornecedor'), '355');
  await submeter();
  expect(alertas()).toContain('Já existe uma cotação com o número COT-1');
  expect(toast.error).not.toHaveBeenCalled();
});

test('(g) RN-E16 o select de status mostra so as opcoes da aba, e trocar de aba SEM remontar nao leva o filtro junto', async () => {
  // ⚠️ SEM remontar a raiz entre as abas (Fase 2, I1): as tres rotas renderizam o MESMO <Compras/>
  // e o state sobrevive a troca. O stub do Layout deste arquivo tem dois <Link> justamente para
  // navegar como o menu navega.
  const select = () => porTestId('filtro-status');
  const opcoes = () => [...select().querySelectorAll('option')].map((o) => o.value);
  const chamadas = (url) => api.get.mock.calls.filter(([u]) => u === url);
  await renderizarEm('/compras/fornecedores');
  expect(opcoes()).toEqual(['', 'ativo', 'inativo']);
  await selecionar(select(), 'inativo');
  expect(chamadas('/compras/fornecedores').at(-1)[1].params.status).toBe('inativo');
  await clicar(linkPorTexto('ir-cotacoes'));
  expect(opcoes()).toEqual(['', 'em_analise', 'aprovado', 'rejeitado', 'cancelado']);
  expect(select().value).toBe('');
  expect(chamadas('/compras/cotacoes').at(-1)[1].params.status).toBe('');
});
```

Para o (g): o stub do `Layout` no Proxy deste arquivo ganha dois links —
`Layout: () => ReactMock.createElement(ReactMock.Fragment, null, ReactMock.createElement(Link, { to: '/compras/cotacoes' }, 'ir-cotacoes'), ReactMock.createElement(Link, { to: '/compras/fornecedores' }, 'ir-fornecedores'), ReactMock.createElement(Outlet))`
(com `const { Outlet, Link } = require('react-router-dom')`). E o `<select>` de status de `Compras.js`
(`:513`) ganha `data-testid="filtro-status"`. Confira antes que `loadData` manda `params: { search, status }`
(`:62-64`, `:79-81`) — o `[1].params.status` da asserção depende dessa forma.

- [x] **Step 2: rodar e ver vermelho** (arquivo vazio exportando `() => null` para chegar às asserções).

- [x] **Step 3: a tela**

```jsx
/**
 * Etapa 40, Task 5 — criacao e edicao de COTACAO (`/compras/cotacoes/nova`, `/compras/cotacoes/editar/:id`).
 * Cabecalho so (nao ha itens de cotacao no sistema — D1/D8): numero DIGITADO (e o numero do
 * documento do fornecedor), fornecedor, datas, valor total, status e observacoes.
 * Molde: `PedidoCompraForm.js` — `Number()` antes do POST (o Zod do servidor nao coage), `hojeISO`
 * LOCAL (RN-D03 da Etapa 39), erro em `role="alert"`, toast so no sucesso.
 */
import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { FiArrowLeft, FiSave } from 'react-icons/fi';
import api from '../../services/api';
import { toast } from 'react-toastify';
import { formatarErroPermissao } from '../../utils/permissaoErro';
import '../Compras.css';

// O vocabulario de `STATUS_COTACAO` do servidor, na mesma ordem; rotulos iguais aos do filtro da aba.
export const STATUS_COTACAO = [
  { valor: 'em_analise', label: 'Em Análise' },
  { valor: 'aprovado', label: 'Aprovado' },
  { valor: 'rejeitado', label: 'Rejeitado' },
  { valor: 'cancelado', label: 'Cancelado' },
];

const hojeISO = () => {
  const agora = new Date();
  return [agora.getFullYear(), String(agora.getMonth() + 1).padStart(2, '0'), String(agora.getDate()).padStart(2, '0')].join('-');
};
function mensagemDeErro(erro, fallback) {
  const data = erro?.response?.data;
  return formatarErroPermissao(data) || data?.error || fallback;
}

const CotacaoForm = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const edicao = Boolean(id);
  const [fornecedores, setFornecedores] = useState([]);
  const [numero, setNumero] = useState('');
  const [fornecedorId, setFornecedorId] = useState('');
  const [dataCotacao, setDataCotacao] = useState(hojeISO());
  const [validade, setValidade] = useState('');
  const [valorTotal, setValorTotal] = useState('');
  const [status, setStatus] = useState('em_analise');
  const [observacoes, setObservacoes] = useState('');
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(edicao);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    let vivo = true;
    api.get('/compras/fornecedores')
      .then((res) => { if (vivo) setFornecedores(res.data || []); })
      .catch(() => { if (vivo) setErro('Não foi possível carregar os fornecedores.'); });
    return () => { vivo = false; };
  }, []);

  useEffect(() => {
    if (!edicao) return undefined;
    let vivo = true;
    api.get(`/compras/cotacoes/${id}`)
      .then((res) => {
        if (!vivo) return;
        const c = res.data || {};
        setNumero(c.numero || '');
        setFornecedorId(c.fornecedor_id == null ? '' : String(c.fornecedor_id));
        setDataCotacao((c.data_cotacao || '').slice(0, 10));
        setValidade((c.validade || '').slice(0, 10));
        setValorTotal(c.valor_total == null ? '' : String(c.valor_total));
        setStatus(c.status || 'em_analise');
        setObservacoes(c.observacoes || '');
      })
      .catch((e) => { if (vivo) setErro(mensagemDeErro(e, 'Não foi possível carregar a cotação.')); })
      .finally(() => { if (vivo) setCarregando(false); });
    return () => { vivo = false; };
  }, [id, edicao]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErro('');
    if (!numero.trim()) { setErro('Número da cotação é obrigatório'); return; }
    if (!fornecedorId) { setErro('Fornecedor da cotação é obrigatório'); return; }
    const payload = {
      numero: numero.trim(),
      fornecedor_id: Number(fornecedorId),
      valor_total: Number(valorTotal) || 0,
      data_cotacao: dataCotacao,
      validade,
      status,
      observacoes,
    };
    setSalvando(true);
    try {
      if (edicao) await api.put(`/compras/cotacoes/${id}`, payload);
      else await api.post('/compras/cotacoes', payload);
      toast.success('Cotação salva');
      navigate('/compras/cotacoes');
    } catch (err) {
      setErro(mensagemDeErro(err, 'Não foi possível salvar a cotação.'));
    } finally {
      setSalvando(false);
    }
  };

  const coluna = { display: 'flex', flexDirection: 'column', gap: 4 };
  return (
    <div className="compras">
      <div className="page-header">
        <div>
          <Link to="/compras/cotacoes" className="btn-secondary" style={{ marginBottom: 8, display: 'inline-flex' }}>
            <FiArrowLeft /> Voltar para cotações
          </Link>
          <h1>{edicao ? 'Editar cotação' : 'Nova cotação'}</h1>
          <p>O número é o do documento do fornecedor e tem de ser único.</p>
        </div>
      </div>
      {erro && (
        <div role="alert" style={{ background: 'rgba(231, 76, 60, 0.12)', color: '#c0392b', border: '1px solid #e74c3c', borderRadius: 8, padding: '10px 14px', marginBottom: 16 }}>
          {erro}
        </div>
      )}
      {carregando ? <div className="loading">Carregando...</div> : (
        <form data-testid="cotacao-form" onSubmit={handleSubmit}>
          <div className="filters" style={{ flexWrap: 'wrap', gap: 12 }}>
            <label style={coluna}>Número *<input data-testid="cotacao-numero" type="text" value={numero} onChange={(ev) => setNumero(ev.target.value)} /></label>
            <label style={coluna}>Fornecedor *
              <select data-testid="cotacao-fornecedor" value={fornecedorId} onChange={(ev) => setFornecedorId(ev.target.value)} className="filter-select">
                <option value="">Selecione o fornecedor</option>
                {fornecedores.map((f) => <option key={f.id} value={f.id}>{f.razao_social}</option>)}
              </select>
            </label>
            <label style={coluna}>Data<input data-testid="cotacao-data" type="date" value={dataCotacao} onChange={(ev) => setDataCotacao(ev.target.value)} /></label>
            <label style={coluna}>Validade<input data-testid="cotacao-validade" type="date" value={validade} onChange={(ev) => setValidade(ev.target.value)} /></label>
            <label style={coluna}>Valor total<input data-testid="cotacao-valor" type="number" step="0.01" min="0" value={valorTotal} onChange={(ev) => setValorTotal(ev.target.value)} /></label>
            <label style={coluna}>Status
              <select data-testid="cotacao-status" value={status} onChange={(ev) => setStatus(ev.target.value)} className="filter-select">
                {STATUS_COTACAO.map((s) => <option key={s.valor} value={s.valor}>{s.label}</option>)}
              </select>
            </label>
          </div>
          <label style={{ display: 'block', margin: '12px 0' }}>Observações
            <textarea data-testid="cotacao-observacoes" value={observacoes} onChange={(ev) => setObservacoes(ev.target.value)} rows={2} style={{ width: '100%' }} />
          </label>
          <div className="header-actions">
            <button type="submit" className="btn-premium" disabled={salvando}><FiSave /> {salvando ? 'Salvando...' : 'Salvar cotação'}</button>
          </div>
        </form>
      )}
    </div>
  );
};

export default CotacaoForm;
```

- [x] **Step 4: rotas, lazy, rótulo e opções por aba**

`lazyModules.js`, após `:63`: `export const CotacaoForm = page(() => import('../components/compras/CotacaoForm'));`
`App.js:43-45`: acrescentar `CotacaoForm` ao import. Após `:374`:
```jsx
            {/* Etapa 40, Task 5: os dois caminhos da aba Cotações que caiam no `*` */}
            <Route path="cotacoes/nova" element={<CotacaoForm />} />
            <Route path="cotacoes/editar/:id" element={<CotacaoForm />} />
```
`Compras.js:496`: `Novo {…}` → `{activeSection === 'fornecedores' ? 'Novo Fornecedor' : activeSection === 'pedidos' ? 'Novo Pedido' : 'Nova Cotação'}`.
`Compras.js:519-525`: as opções passam a vir de um mapa por aba:
```jsx
const OPCOES_STATUS = {
  fornecedores: [['ativo', 'Ativo'], ['inativo', 'Inativo']],
  pedidos: [['pendente', 'Pendente'], ['aprovado', 'Aprovado'], ['rejeitado', 'Rejeitado'], ['em_analise', 'Em Análise'], ['enviado', 'Enviado'], ['recebido', 'Recebido'], ['cancelado', 'Cancelado']],
  cotacoes: [['em_analise', 'Em Análise'], ['aprovado', 'Aprovado'], ['rejeitado', 'Rejeitado'], ['cancelado', 'Cancelado']],
};
// … no <select>:
<option value="">Todos os status</option>
{(OPCOES_STATUS[activeSection] || []).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
```
⚠️ **Ao trocar de aba, `<Compras/>` NÃO remonta** (Fase 2, sonda 1.6: as três rotas renderizam o
mesmo elemento, e o React Router v6 preserva o state). Com `filterStatus='inativo'` vindo da aba
Fornecedores, a aba Cotações mandaria `GET /compras/cotacoes?status=inativo` (lista vazia) enquanto o
`<select>`, sem `<option value="inativo">`, **exibiria "Todos os status"** — pior que hoje. **Não use
efeito nem `setState` no render.** Derive:

```jsx
const statusValido = (OPCOES_STATUS[activeSection] || []).some(([v]) => v === filterStatus) ? filterStatus : '';
```

e use `statusValido` **nos dois lugares**: no `value` do `<select>` (`:515`) **e** nos três
`params.status` de `loadData` (`:63`, `:73-74`, `:80`) — o `useEffect` de `loadData` continua
dependendo de `filterStatus`, sem requisição dupla.

- [x] **Step 5: rodar** — o arquivo (7); `PedidoCompraForm.test.js` (25 — o (i) usa `'Novo Pedido'`, que continua); `Compras.test.js` (9); suíte inteira; build.

- [x] **Step 6: sabotagens**

| # | Sabotagem | Cai |
|---|---|---|
| 1 | `fornecedor_id: fornecedorId` (sem `Number`) | **(d)** `toBe(312)` recebe `'312'`; **(e)** |
| 2 | `hojeISO` → `new Date().toISOString().slice(0,10)` | **(a)** só entre 21h e 0h local — **declare** se rodou fora da janela (a proteção é a RN-D03 e o comentário) |
| 3 | rótulo de volta para `'Novo Cotação'` | **(b)** |
| 4 | `OPCOES_STATUS.cotacoes` com `'pendente'` | **(g)** |
| 5 | `if (!fornecedorId)` removido | **(c)** segunda metade |
| 6 | `statusValido` → `filterStatus` nos `params` de `loadData` (deixando o `value` do select) | **(g)** *"params.status … toBe('')"* recebe `'inativo'` — é o controle positivo do I1 da Fase 2 |

- [x] **Step 7: commit** — `git add client/src/components/compras/CotacaoForm.js client/src/components/compras/CotacaoForm.test.js client/src/routes/lazyModules.js client/src/App.js client/src/components/Compras.js`. Mensagem em `msg-e40-t5.txt`.

#### ✅ Task 5 FECHADA — `b692413` (Compras Etapa 40 T5: CotacaoForm, rotas cotacoes/nova e editar/:id, rotulo Nova Cotacao e status por aba)

> Hash medido na branch `e40-t5` (worktree `CRM-wt-e40-t5`, base `07d6893`). **Será reescrito no
> cherry-pick para o tronco** — quem integrar troca o hash aqui e no mapa da T6.

**Números lidos (não previstos):**

| Suíte | Antes (Step 2, `CotacaoForm = () => null`) | Depois |
|---|---|---|
| `CotacaoForm.test.js` | `7 failed, 7 total` (os 7 cenários; a rota caía no `*` e o `h1` era "Compras") | **`7 passed`** |
| `PedidoCompraForm.test.js` | — | **`25 passed`** (o (i) com `'Novo Pedido'` continua verde: o rótulo agora é a string inteira por aba) |
| `Compras.test.js` | — | **`9 passed`** |
| Suíte inteira do client | — | **`50 passed` suítes / `760 passed` testes** |
| `CI=true npx react-scripts build` | — | **`Compiled successfully.`** |

CR = 0 nos cinco arquivos tocados depois de cada edição (medido com `perl -ne '$c++ if /\r/'`).
Controle de fuso do (a): `getTimezoneOffset() === 180` passou (o `globalSetup` fixa America/Sao_Paulo).
ESLint (`npx eslint` nos cinco arquivos — o build **não** o roda): 0 erros, 9 warnings, **todos
pré-existentes** em linhas não tocadas (`FiDollarSign`/`FiCalendar`/`FiTrendingUp`/`FiTrendingDown`
e `tabs` nunca usados, `default-case` ×2, `exhaustive-deps` ×2 em `Compras.js:71` e `App.js:166`).
Nenhum import novo sem uso.

**Sabotagens (md5 de `CotacaoForm.js` antes `2d8c7fc9…`, `Compras.js` antes `457590d0…`; sabotado ≠
nas seis; pós-restauro igual ao original nas seis; restauro por `cp` do scratchpad; âncora contada
com `grep -cF` = 1 nas cinco primeiras e **4** na sexta, ver divergência 2). Rodadas às **21:18 local**:**

| # | Sabotagem | Placar | QUAL asserção caiu |
|---|---|---|---|
| 1 | `fornecedor_id: Number(fornecedorId)` → `fornecedor_id: fornecedorId` | 5/2 | **(d)** `expect(corpo.fornecedor_id).toBe(312)` — `Expected: 312 / Received: "312"`; **(e)** `toEqual` do `PUT` (`- Expected 1 / + Received 1`, o `fornecedor_id` como string) |
| 2 | `hojeISO` → `new Date().toISOString().slice(0, 10)` | 6/1 | **(a)** `expect(porTestId('cotacao-data').value).toBe(esperado)` — `Expected: "2026-09-21" / Received: "2026-09-22"`. **Rodou DENTRO da janela 21h–0h** (21:18 local, UTC já era dia 22), então caiu de verdade; fora da janela passaria e a proteção seria só a RN-D03 e o comentário |
| 3 | `'Nova Cotação'` → `'Novo Cotação'` em `Compras.js` | 6/1 | **(b)** `expect(linkPorTexto('Novo Cotação')).toBeUndefined()` — recebeu o `<a class="btn-premium" href="/compras/cotacoes/nova">…Novo Cotação…</a>` |
| 4 | `OPCOES_STATUS.cotacoes` com `['pendente', 'Pendente']` na frente | 6/1 | **(g)** `expect(opcoes()).toEqual(['', 'em_analise', 'aprovado', 'rejeitado', 'cancelado'])` — `+ Received + 1` (`'pendente'`) |
| 5 | linha `if (!fornecedorId) { setErro(…); return; }` removida | 6/1 | **(c)** `expect(alertas()).toContain('Fornecedor da cotação é obrigatório')` — `Received string: ""` (o form seguiu para o `POST`) |
| 6 | `status: statusValido` → `status: filterStatus` nos 4 `params` (o `value` do select ficou em `statusValido`) | 6/1 | **(g)** `expect(chamadas('/compras/cotacoes').at(-1)[1].params.status).toBe('')` — `Expected: "" / Received: "inativo"`. É o controle positivo do I1 da Fase 2: o select mostrava "Todos" e a requisição ia com `inativo` |

Controle positivo: os seis cortes cortaram **exatamente** o cenário que a tabela do Step 6 previa; os
dois arquivos voltaram ao md5 original e a suíte a `7 passed` depois do último restauro.

**Divergências entre o plano e o que o código exigiu:**

1. **Linhas citadas bateram todas** em `07d6893`: `Compras.js:496` (rótulo), `:513-525` (select),
   `:63`/`:73-74`/`:80` (`params.status`), `lazyModules.js:63` (`FornecedoresDoGrupo`),
   `App.js:43-46` (import) e `:374` (`ItensFornecedor`). Depois da T5: `Compras.js` cresceu **+24**
   linhas (`OPCOES_STATUS` em `:15-23` com o comentário, `statusValido` em `:49-54`, o `<select>`
   agora abre em `:530` com o `data-testid` em `:531`), `App.js` **+4** (as duas rotas em
   `:376-378`), `lazyModules.js` **+2** (`CotacaoForm` em `:65`) — medido depois do commit.
   **T6 reconta** antes de citar qualquer linha desses três.
2. **Âncora da sabotagem 6 conta 4, não 1**: são os quatro `params.status` de `loadData`
   (fornecedores, pedidos ×2 com/sem `atrasados`, cotações) — o plano diz "três" em `:63`, `:73-74`,
   `:80`, mas `:73-74` são **duas** linhas com `status:`. A sabotagem trocou os 4 (`/g`) de
   propósito: é a forma que o I1 da Fase 2 descreve.
3. **A sabotagem 2 caiu porque rodou às 21:18 local** — dentro da janela que o plano avisava. Fora
   dela o placar seria 7/0 e a linha da tabela teria de dizer "não cai".
4. **Asserções acrescentadas aos cenários do plano** (nenhuma removida): (a) `cotacao-form` presente
   e o subtítulo da lista ausente; (b) `GET /compras/cotacoes/760` chamado exatamente 1 vez;
   (c) o primeiro alerta é **substituído** (não acumulado) pelo segundo; (d) `api.post` chamado
   1 vez; (e) `toast.success('Cotação salva')`; (f) `toast.success` **não** chamado e o `h1`
   continua "Nova cotação" (ficou no form). O código de `CotacaoForm.js` é o do Step 3 verbatim,
   mais um comentário em `hojeISO` dizendo por que não é `toISOString`.
5. **`Compras.js` ganhou comentários** onde o plano só trazia código: em `OPCOES_STATUS` (por que
   por aba) e em `statusValido` (por que derivado e usado nos dois lugares). `FiFilter` continua
   usado (o ícone ao lado do select não mudou).
6. **Ferramenta:** o heredoc do Bash quebrou ao gravar o teste com acentos (`unexpected EOF while
   looking for matching ''`) e a sessão da API resetou no meio; a task foi retomada do Step 1 com a
   worktree limpa e os arquivos gravados pelo Write tool (LF confirmado). Sem efeito no resultado.
7. **Fronteira HTTP 100% mockada**, como o plano manda: nada aqui prova o servidor da T3 —
   `POST`/`PUT`/`GET /:id` de cotação são do contrato §5.4 e a T6 é quem cruza.

---

### Task 6: a integração que cruza os galhos — pela ROTA e pelo SERVIÇO **(tronco, depois de integrar T2–T5)**

**Files:**
- Test: `server/tests/api/comprasFornecedorCotacaoIntegracao.api.test.js` (novo)
- Modify: `server/routes/compras.js` (o 409 por cotação no genérico — trocar a string inline que a T2 escreveu por `cotacaoService.FORNECEDOR_COM_COTACOES`, agora que a T3 está integrada e `cotacaoService` já é `require` do arquivo; Fase 2, M3)

**Interfaces:** consome tudo de T1–T3 e a rota aux do almoxarifado `GET /api/almoxarifado/recebimentos-aux/fornecedores` (`routes/almoxarifado/extended.js:1147`, gate só `auth`; devolve `[{ id, razao_social, nome_fantasia, cnpj }]` com `WHERE status='ativo'`, `LIMIT 50`).

- [x] **Step 1: o teste**

```js
/**
 * Etapa 40, Task 6 — o fluxo inteiro cruzando fornecedor (T2) e cotacao (T3), pela rota e pelo
 * servico, incluindo o que RN-E05 DECLARA (pedido aceita fornecedor inativo) e a precedencia do 409.
 * Executar: cd server && node tests/api/comprasFornecedorCotacaoIntegracao.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet } = require('../../services/almoxarifado/db');
const cotacaoService = require('../../services/compras/cotacaoService');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}
const ADMIN = { id: 99, nome: 'Admin E40 T6', role: 'admin', is_superadmin: 1, email: 'admin@test.com' };

(async () => {
  const { app, db, close } = await createTestApp({ user: ADMIN });
  const material = (await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, ativo)
    VALUES ('MAT-E40-T6', 'Chapa E40', 'PC', 0, 1)`)).lastID;

  await test('(A) o fluxo pela ROTA: cria -> cota -> 409 por cotacao -> inativa -> aux esconde, pedido aceita -> apaga cotacao -> 409 por pedido -> apaga pedido -> 200', async () => {
    // (1) o payload EXATO da tela nova (T4), grupo vazio
    const f = await request(app).post('/api/compras/fornecedores').send({
      razao_social: 'Integração E40', nome_fantasia: '', cnpj: '55666777000188', contato: '', email: '', telefone: '', endereco: 'Rua I', grupo_id: '',
    });
    assert.strictEqual(f.status, 201, JSON.stringify(f.body));
    const fid = f.body.id;
    const l0 = await dbGet(db, 'SELECT grupo_id, endereco FROM fornecedores WHERE id = ?', [fid]);
    assert.strictEqual(l0.grupo_id, null);
    assert.strictEqual(l0.endereco, 'Rua I', 'o POST passou a gravar endereco (era ignorado ate a 39) — Fase 2, M7');
    // (2) o payload EXATO da tela de cotacao (T5)
    const c = await request(app).post('/api/compras/cotacoes').send({
      numero: 'COT-E40-INT', fornecedor_id: fid, valor_total: 99.9, data_cotacao: '2026-09-21', validade: '', status: 'em_analise', observacoes: '',
    });
    assert.strictEqual(c.status, 201, JSON.stringify(c.body));
    assert.strictEqual(c.body.fornecedor_nome, 'Integração E40');
    // (3) RN-E12
    const d1 = await request(app).delete(`/api/compras/fornecedores/${fid}`);
    assert.strictEqual(d1.status, 409);
    assert.strictEqual(d1.body.error, cotacaoService.FORNECEDOR_COM_COTACOES, 'a rota usa a CONSTANTE do servico (Fase 2, M3): identidade, nao igualdade');
    // (4) RN-E04 + RN-E05: inativa pelo PUT da tela (todos os campos), aux esconde, pedido aceita
    // CONTROLE POSITIVO PRIMEIRO (Fase 2, I2): o ATIVO tem de aparecer no aux, senao a negativa
    // abaixo passaria com o aux devolvendo [] por qualquer motivo (tableExists, LIMIT 50, regressao).
    const aux0 = await request(app).get('/api/almoxarifado/recebimentos-aux/fornecedores');
    assert.strictEqual(aux0.status, 200, JSON.stringify(aux0.body));
    assert.ok((aux0.body || []).some((x) => x.id === fid), 'controle positivo: ATIVO tem de aparecer no aux antes de inativar');
    const p = await request(app).put(`/api/compras/fornecedores/${fid}`).send({
      razao_social: 'Integração E40', nome_fantasia: '', cnpj: '55666777000188', contato: '', email: '', telefone: '', endereco: 'Rua I', grupo_id: '', status: 'inativo',
    });
    assert.strictEqual(p.status, 200, JSON.stringify(p.body));
    const aux = await request(app).get('/api/almoxarifado/recebimentos-aux/fornecedores');
    assert.strictEqual(aux.status, 200, JSON.stringify(aux.body));
    assert.ok(!(aux.body || []).some((x) => x.id === fid), 'fornecedor inativo NAO pode aparecer no seletor do recebimento (a negativa so vale por causa do aux0 acima)');
    const ped = await request(app).post('/api/compras/pedidos').send({ fornecedor_id: fid, itens: [{ material_id: material, quantidade: 1 }] });
    assert.strictEqual(ped.status, 201, 'RN-E05: o pedido continua aceitando fornecedor inativo (declarado, D5)');
    // (5) precedencia e liberacao
    const d2 = await request(app).delete(`/api/compras/fornecedores/${fid}`);
    assert.strictEqual(d2.body.error, 'Fornecedor possui pedidos de compra — não pode ser excluído', 'com pedido E cotacao, vale a de pedido');
    assert.strictEqual((await request(app).delete(`/api/compras/cotacoes/${c.body.id}`)).status, 200);
    const d3 = await request(app).delete(`/api/compras/fornecedores/${fid}`);
    assert.strictEqual(d3.status, 409);
    assert.strictEqual(d3.body.error, 'Fornecedor possui pedidos de compra — não pode ser excluído');
    assert.strictEqual((await request(app).delete(`/api/compras/pedidos/${ped.body.id}`)).status, 200);
    const d4 = await request(app).delete(`/api/compras/fornecedores/${fid}`);
    assert.strictEqual(d4.status, 200, JSON.stringify(d4.body));
    assert.strictEqual(await dbGet(db, 'SELECT id FROM fornecedores WHERE id = ?', [fid]), undefined);
  });

  await test('(B) pelo SERVICO: a cotacao nasce e e editada sem passar pela rota, e o GET /:id da rota le o mesmo', async () => {
    const fid = (await dbRun(db, "INSERT INTO fornecedores (razao_social) VALUES ('Servico E40')")).lastID;
    const c = await cotacaoService.criarCotacao(db, { numero: 'COT-E40-SRV', fornecedor_id: fid });
    assert.strictEqual(c.status, 'em_analise');
    const c2 = await cotacaoService.atualizarCotacao(db, c.id, { numero: 'COT-E40-SRV', fornecedor_id: fid, status: 'aprovado', valor_total: 1 });
    assert.strictEqual(c2.status, 'aprovado');
    const g = await request(app).get(`/api/compras/cotacoes/${c.id}`);
    assert.deepStrictEqual(g.body, c2);
    // e a guarda do 409 do fornecedor enxerga a cotacao criada pelo servico
    const d = await request(app).delete(`/api/compras/fornecedores/${fid}`);
    assert.strictEqual(d.status, 409);
  });

  await test('(C) o "Remover do grupo" de FornecedoresDoGrupo, ponta a ponta: POST com grupo, PUT com null, grupo some', async () => {
    await dbRun(db, `CREATE TABLE IF NOT EXISTS grupos_compras (id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT NOT NULL, numero INTEGER, ordem INTEGER DEFAULT 0, ativo INTEGER DEFAULT 1, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
    const g = (await dbRun(db, "INSERT INTO grupos_compras (nome) VALUES ('G E40')")).lastID;
    const f = await request(app).post('/api/compras/fornecedores').send({ razao_social: 'Do grupo', nome_fantasia: '', cnpj: '', grupo_id: String(g) });
    assert.strictEqual((await dbGet(db, 'SELECT grupo_id FROM fornecedores WHERE id = ?', [f.body.id])).grupo_id, g);
    const r = await request(app).put(`/api/compras/fornecedores/${f.body.id}`).send({
      razao_social: 'Do grupo', nome_fantasia: '', cnpj: '', contato: '', email: '', telefone: '', endereco: '', grupo_id: null,
    });
    assert.strictEqual(r.status, 200);
    assert.strictEqual((await dbGet(db, 'SELECT grupo_id FROM fornecedores WHERE id = ?', [f.body.id])).grupo_id, null);
  });

  await close();
  console.log(`\n${passed} passou, ${failed} falhou`);
  process.exit(failed ? 1 : 0);
})();
```

- [x] **Step 2: rodar** — (A)(B)(C) verdes de primeira é **esperado** (é integração de código já testado). Controles positivos rodados **aqui**: (i) a sabotagem 4 da T2 (ordem das contagens) tem de derrubar (A) em *"vale a de pedido"*; (ii) trocar `'ativo'` por `'inativo'` no `WHERE` de `listarFornecedoresAux` (`receiptService.js:1613-1614`) tem de derrubar (A) no **controle positivo** (`aux0`), não na negativa — se cair na negativa, o `aux0` não está antes do `PUT`.

- [x] **Step 3: os cinco comandos** (`test:api` esperado **191/191**: 187 + 4 arquivos novos — T1, T2, T3, T6; client **51 suítes**), `git status` limpo.

- [x] **Step 4: commit** — `git add server/tests/api/comprasFornecedorCotacaoIntegracao.api.test.js server/routes/compras.js`. Mensagem em `msg-e40-t6.txt`.

#### ✅ Task 6 FECHADA — `d64ede0` (Compras Etapa 40 T6: integracao fornecedor x cotacao pela rota e pelo servico, 409 do generico usa a constante)

> Feita no **tronco** (`desenvolvimento-almoxarifado`), sobre `fb2da89`, com T1–T5 já integradas
> (T2 `6795b39`, T3 `29dd6a8`, T4 `23b86f3`, T5 `b692413`). Hash definitivo, sem cherry-pick.

**Números lidos (não previstos):**

| Suíte | Resultado |
|---|---|
| `comprasFornecedorCotacaoIntegracao.api.test.js` | **`3 passou, 0 falhou`** de primeira — esperado (integração de código já testado); por isso os dois controles positivos abaixo |
| `npm run test:api` | **`191/191 arquivos de teste OK`** (190 + este arquivo; bateu com o previsto) |
| `npm run test:almoxarifado` | **42 passou, 0 falhou** |
| `test:validation` / `test:safealter` / `test:sqlite` | **4 / 3 / 5** passed, 0 failed |
| client `react-scripts test` | **51 suítes, 768 testes**, 0 falhas |
| client `CI=true build` | `Compiled successfully.` |

CR = 0 em `routes/compras.js`, no teste e no plano depois de cada edição (`git ls-files --eol`: `i/lf w/lf`
nos dois arquivos commitados). `git status` só com os 3 untracked pré-existentes (`docs/bkp_bancoprod.md`,
`server/data/database.sqlite.bak`, `server/nodemon.json`), não adicionados.

Posições recontadas antes de editar `routes/compras.js`: `require` de `cotacaoService` já em `:63` (topo,
logo após o de `pedidoCompraService` em `:61`); `respondeErro` em `:349`; rotas de cotação em `:351-364`;
o bloco do 409 do genérico em `:437-457`, com a literal inline de cotação em `:452` (agora
`cotacaoService.FORNECEDOR_COM_COTACOES`). Nenhum `require` precisou ser movido.

**Controles positivos** (md5 antes/sabotado/pós-restauro; restauro por `cp` do scratchpad; âncoras contadas
com `grep -cF` = 1 cada; roteiro num único comando Bash com `perl -pi -e`):

| # | Sabotagem | md5 antes → sabotado → pós-restauro | Placar | QUAL asserção caiu |
|---|---|---|---|---|
| (i) | inverter a ordem dos **dois blocos inteiros** de contagem no genérico (tabela **e** literal juntas: cotação checada primeiro, pedido depois) | `af11e802` → `e3d42cc5` → `af11e802` | 2/1 | **(A)** *"com pedido E cotacao, vale a de pedido"* — o `d1` (só cotação) continuou certo; a queda foi exatamente na precedência |
| (ii) | `const params = ['ativo'];` → `['inativo']` em `listarFornecedoresAux` (`receiptService.js:1614`, posição bateu) | `e54df637` → `59dabbe0` → `e54df637` | 2/1 | **(A)** *"controle positivo: ATIVO tem de aparecer no aux antes de inativar"* — o `aux0`, **não** a negativa; prova que o controle positivo está antes do `PUT` |

(B) e (C) seguiram verdes nas duas sabotagens, como devem (nenhuma toca o serviço nem o `grupo_id`).
Depois do último restauro, `3 passou` com os md5 originais.

**Divergências entre o plano e o que o código exigiu:**

1. **A sabotagem (i) não é literalmente "a sabotagem 4 da T2".** A T2 trocou só as **tabelas** dos dois
   `SELECT COUNT(*)` e, como a própria T2 registrou, isso derruba a **primeira** literal (só cotação
   vinculada já recebe a frase de pedido) — aqui cairia no `d1` (*"a rota usa a CONSTANTE do servico"*),
   não em *"vale a de pedido"*. Para derrubar a precedência, como o Step 2 pede, a sabotagem tem de
   inverter os **blocos inteiros** (tabela + literal). Foi o que se fez; a asserção prevista caiu.
2. **O `require` de `cotacaoService` já estava no topo** (`:63`, posto pela T3) — o passo condicional
   "se estiver abaixo do genérico, mova" não se aplicou.
3. **O comentário do 409** deixou de dizer que a literal "está inline porque a T3 roda em paralelo" e
   passou a dizer onde a constante mora e por que um dia foi inline (histórico útil para quem ler o
   `git blame`).
4. **A frase de pedido continua literal na rota** (`'Fornecedor possui pedidos de compra — não pode ser
   excluído'`, `:444`) — o plano só manda trocar a de cotação; `pedidoCompraService` não exporta essa
   constante e o teste (A)/(5) e a T2 (9) a guardam por texto. Fica como está; candidata a **letra B**
   no fechamento se se quiser simetria.
5. Nada foi descartado. Nenhuma spec estava errada no trecho que a T6 tocou.

---

### Task 7: fechamento (use a skill `fechar-etapa`)

**Files (os 7 artefatos + os planos):** `docs/almoxarifado-novidades-por-etapa.md`,
`docs/almoxarifado-guia-etapas-e-testes.md`, `docs/almoxarifado-manual-do-sistema.md`,
`specs/modulo-compras/README.md` (`:45-56`: as três abas — as duas linhas ❌ viram ✅ com hash),
`specs/modulo-almoxarifado/22-integracoes/README.md:211` (o item "fora do escopo, declarado" vira
`[x]` com os hashes), `specs/modulo-almoxarifado/README.md` (linha da 22 e "Última atualização"), este
plano, o design (seção "O que foi executado", com o que este design previu errado) e a **retro nº 4
do plano da 39** (defeito escapado — preencher com o que a Fase 0 desta etapa achou de ERRADO no
handoff da 39: as quatro correções da seção 11 do design).

- [ ] **Step 1: medir as letras** (`grep -o "\*\*A[0-9]\+" …` para A, B, C, F, G) — a 39 fechou em A15 · B122 · C53 · F13 · G43.
- [ ] **Step 2: novidades** — seção da Etapa 40 antes de `## Onde estamos`, com Antes → Agora, os cenários com literal (design §6), "NÃO cobre" (design §8); letras: **A** (as duas consultas do design §9 — a A(i) com `WHERE status IS NULL OR status NOT IN ('ativo','inativo')`, Fase 2 M6), **B123–B137** (D1–D14 **mais** a decisão de deixar o "Adicionar existente" com inativo fora, I4), **C54** ("Remover do grupo" não removia — e a partir de agora remove) e **C55** (inativo pode ser "adicionado" a um grupo e não aparece — I4), **G44+** (lista `SELECT *`; `assertFornecedor` sem status; tradução do `UNIQUE` só por corrida; `dataIsoOpcional` aceita `2026-13-45` — regra de forma, não de calendário, vale para pedido e cotação, M8; as frases de recusa local da tela de cotação e as do servidor diferem na inicial porque o client não importa o servidor, M4). E o item da 40 em "Onde estamos".
- [ ] **Step 3: specs** — `modulo-compras/README.md` linhas das abas; `22-integracoes/README.md:211`; mapa.
- [ ] **Step 4: guia** — seção da Etapa 40 com roteiro clicável (criar fornecedor → editar → inativar → ver sumir do recebimento; criar cotação → repetir número → 409; lixeira com cotação; e o aviso *"inativo some do grupo e da lista de disponíveis do recebimento; para tirá-lo de um grupo use a tela de edição, Sem grupo"*) e o cabeçalho "Onde o desenvolvimento está".
- [ ] **Step 5: manual** — enxertar em "Compras": como cadastrar/editar fornecedor, o que Inativo faz, cotação (número único, o que cada status significa), a frase literal de cada recusa.
- [ ] **Step 6: este plano** — tasks com hash (**os hashes pós-cherry-pick**, conferidos com `git merge-base --is-ancestor`), divergências, retro de 4 números, **próxima tarefa detalhada** (pela ordem do `CLAUDE.md`: o que este fechamento nomear como "falta para 🟢"; senão o mapa — medir antes).
- [ ] **Step 7: verificação medida** (os cinco comandos, números reais) e **commit** (`msg-e40-t7.txt`).
- [ ] **Step 8: emendar na próxima etapa** no mesmo turno (Passo 8 da `fechar-etapa`).

---

## Self-review

**1. Cobertura da spec:** D1 (T1–T5), D2 (T2 §GET), D3 (T1 schema + T2 (1)(2)), D4 (T2 (4)), D5 (T2 (6), T6 (A)), D6 (T3 (2)(9)), D7 (T1 (n), T5 (g)), D8 (T3 (1)(6)), D9 (T3 service), D10 (T2 §409, T6), D11 (T4 (f), T5 (f)), D12 (T4 tela), D13 (T1 Step 6), D14 (sort topológico). RN-E01…E16: tabela no topo, cada uma com task. Design §8 (fora): nada aqui os implementa. Design §9 letras: T7.

**2. Placeholders:** nenhum "TBD"/"similar a"; cada task traz código e teste. O único "confirme antes" é o nome do export de `utils/telefone.js` (T4) e o shape de `dbRun` (T3) — são verificações de 10 segundos, não lacunas.

**3. Consistência de nomes:** `FornecedorSchema`/`CotacaoSchema` (T1) ↔ `require` em T2/T3; `erro`/`assertFornecedor`/`FORNECEDOR_NAO_ENCONTRADO` (T1) ↔ T3 `cotacaoService` e teste (3); `criarCotacao`/`obterCotacao`/`atualizarCotacao`/`FORNECEDOR_COM_COTACOES`/`numeroDuplicado` (T3) ↔ T6; `data-testid` de T4/T5 ↔ design §5.5; literal do 409 por cotação idêntica em T2 (inline), T3 (export) e T6 (`assert` de igualdade); `Dados inválidos — ` como prefixo em T2 (11) e T3.

**4. O que a Fase 2 precisa refutar** (quatro perguntas): (i) o `grupoIdOpcional` com `undefined` — o cenário (d) da T1 depende de o `optional()` externo curto-circuitar; (ii) `looseObject` + `preprocess` em `textoOpcional`: `null` explícito no `PUT` vira `null` e a rota grava `''` para `nome_fantasia`/`cnpj` — igual a hoje? (T2 (2) prova); (iii) o `POST` passa a gravar `endereco` — algum consumidor depende de ele ser ignorado? (Fase 0: não); (iv) **cada RN traçada até o último gesto**: inativar fornecedor → aux esconde → mas `PedidoCompraForm` lista **todos** (`:160-166`, sem filtro de status) e `GET /grupos/:id/fornecedores` filtra `ativo` — o comprador pode escolher um inativo no pedido e não o verá no grupo; é o D5 declarado, e a Fase 2 decide se vira RN ou fica em G.

---

## Retro de 4 números (preencher na T7)

1. **Rodadas de correção até verde:** …
2. **Achados da revisão (Fase 2 + Fase 5):** reais … / ruído …
3. **Paralelismo:** quatro galhos em worktrees com junction — funcionou? Custo de integração (conflitos em `App.js`/`lazyModules.js`)?
4. **Defeito escapado:** *(em branco — quem fechar a Etapa 41 preenche olhando para trás.)*
