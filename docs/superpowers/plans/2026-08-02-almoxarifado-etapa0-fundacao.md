# Almoxarifado Etapa 0 — Fundação Técnica — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remover os riscos estruturais do módulo almoxarifado: criar harness de testes de API, corrigir bug de import, unificar DDL, fazer a rota v1 de movimentação passar pelo motor v2 (com auditoria), endurecer `safeAlter` e corrigir checagem de permissão inconsistente.

**Architecture:** O servidor é Express 4.18 + sqlite3 (SQL cru, callbacks) num monólito `server/index.js` que injeta dependências nos registradores de rota (`require('./routes/almoxarifado')(app, db, authenticateToken, PERSISTENT_DATA_DIR, checkModulePermission)` — `server/index.js:22941-22944`). O harness monta um `express()` novo com SQLite `:memory:` + `initSchema` e stubs de auth injetados por esses mesmos parâmetros. A unificação de movimentação é server-side: o handler v1 delega para `stockService.registrarMovimentacao`, mantendo o contrato do frontend.

**Tech Stack:** Node.js, Express 4.18, sqlite3 5.1.6, supertest (novo, devDependency), runner de testes caseiro do repositório (script Node + `assert`, sem jest/mocha).

## Global Constraints

- Backend real é `server/`; frontend real é `client/`. As pastas `backend/` e `src/` da raiz são código morto — nunca tocar.
- Padrão de teste do repositório: script Node autônomo com helper `test(nome, fn)`, `assert` nativo, contadores `passed/failed`, `process.exit(failed > 0 ? 1 : 0)`. Referência: `server/tests/almoxarifado.test.js:24-35`. NÃO introduzir jest/mocha/vitest.
- Única dependência nova permitida: `supertest` (devDependency de `server/`).
- Mensagens de erro de API em português, formato `{ error: '...' }` (padrão existente).
- SQLite em testes: `new sqlite3.Database(':memory:')` + `initSchema(db)` de `server/services/almoxarifado/schema.js`.
- Commits pequenos, um por task, mensagem em português no estilo do repositório (ex.: `Almoxarifado: harness de testes de API`).
- O banco de produção (`server/data/database.sqlite`) NUNCA é tocado por testes.
- Rodar sempre a suíte existente também: `cd server && npm run test:almoxarifado` deve continuar passando ao fim de cada task.

## Fatos do código que este plano usa (verificados em 2026-08-02)

| Fato | Onde |
|---|---|
| Registro das rotas com DI | `server/index.js:22941` (`requisicoesMaterial`), `:22944` (`almoxarifado`) |
| Assinatura do registrador principal | `server/routes/almoxarifado.js:32` — `module.exports = function (app, db, authenticateToken, PERSISTENT_DATA_DIR, checkModulePermission)` |
| Auth em bloco | `server/routes/almoxarifado.js:135-138` — `app.use('/api/almoxarifado', ...almoxMiddleware)` |
| Extended registrada de dentro do principal, num callback do sqlite | `server/routes/almoxarifado.js:1993-1998` — `db.run('SELECT 1', [], () => require('./almoxarifado/extended')(app, db, authenticateToken))` |
| Assinatura da extended | `server/routes/almoxarifado/extended.js:36` — `function registerExtendedRoutes(app, db, authenticateToken)` |
| Job de lembretes sem unref | `server/routes/almoxarifado.js:2000-2007` — `setTimeout(runReminderJob, 30*1000)` + `setInterval(..., 1h)` |
| DDL duplicado (13 blocos) | `server/routes/almoxarifado.js` linhas 55, 81, 100, 115, 848, 882, 909, 938, 989, 996, 1008, 1031, 1068 |
| Todas as 13 tabelas também existem em | `server/services/almoxarifado/schema.js` (`ensureBaseTables` + `initSchema`) |
| Rota v1 de movimentação | `server/routes/almoxarifado.js:573-636` — INSERT + UPDATE manuais, sem auditoria, sem transação |
| Motor v2 | `server/services/almoxarifado/stockService.js:135-254` — `registrarMovimentacao(db, user, params)`; params: `material_id, tipo, quantidade, motivo, referencia, observacoes, localizacao_origem_id, localizacao_destino_id, lote, projeto_id, os_id, cliente_id, documento_vinculado, justificativa, reserva_id, recebimento_id, requisicao_id`; retorna `{ id, saldo_anterior, saldo_posterior }` |
| v2 exige p/ SAÍDA: `os_id \|\| projeto_id \|\| justificativa \|\| referencia` | `stockService.js:171-173` |
| v2 exige p/ AJUSTE: `justificativa \|\| can(user,'ajustar_estoque')` | `stockService.js:176-178` |
| v2 rejeita material inativo com **400** (v1 respondia 404) | `stockService.js:148` |
| v2 valida saldo pelo **disponível** (físico − reservado − bloqueado − inspeção); v1 validava só físico | `stockService.js:17-22,161-163` |
| Bug: `purchaseService` usado sem import | `server/routes/almoxarifado/extended.js:294,300` (imports do arquivo: linhas 4-15 — não inclui purchaseService) |
| `safeAlter` engole qualquer erro | `server/services/almoxarifado/schema.js:62-64` |
| Checagem inconsistente `req.user.role !== 'admin'` | `server/routes/almoxarifado/extended.js:358,368` |
| Helper correto | `canConfigureAlmox(user)` de `server/services/systemPermissions.js` (já importado na extended.js:4) |
| Front envia na movimentação | `client/src/components/almoxarifado/MovimentacoesAlmoxarifado.js:95` — `{ material_id, tipo, quantidade, motivo, referencia, observacoes }`; `motivo` NÃO é required no form (linha 269) |
| Entrada/saída rápida também posta na v1 | `client/src/components/almoxarifado/MateriaisAlmoxarifado.js:102-106` |
| `requirePermission(acao)` usa `req.user.perfil_almoxarifado` (real, sem stub) | `server/services/almoxarifado/permissions.js:49` |
| Perfis para testes | `const { PERFIS } = require('../services/almoxarifado/permissions')` — padrão em `almoxarifado.test.js:20-22` |

---

### Task 1: Harness de testes de API (`createTestApp`) + smoke test

**Files:**
- Create: `server/tests/helpers/testApp.js`
- Create: `server/tests/api/smoke.api.test.js`
- Create: `server/tests/api/run-all.js`
- Modify: `server/routes/almoxarifado.js:2006-2007` (unref dos timers)
- Modify: `server/package.json` (devDependency `supertest`, script `test:api`)

**Interfaces:**
- Produces: `createTestApp(options) => Promise<{ app, db, setUser(user), close() }>` — `app` é um Express com TODAS as rotas de almoxarifado + requisições-material montadas sobre um SQLite `:memory:` já inicializado por `initSchema`. `setUser(user)` troca o usuário autenticado do stub (objeto como `{ id: 1, nome: 'Admin', role: 'admin' }` ou `{ id: 2, nome: 'Almox', role: 'user', perfil_almoxarifado: 'ALMOXARIFE' }`); `setUser(null)` simula não autenticado (401). `close()` fecha o banco.
- Todas as tasks seguintes consomem `createTestApp`.

- [ ] **Step 1: Instalar supertest**

```
cd server && npm install --save-dev supertest
```

- [ ] **Step 2: Neutralizar os timers do job de lembretes (permite o processo de teste encerrar)**

Em `server/routes/almoxarifado.js:2006-2007`, trocar:

```js
  setTimeout(runReminderJob, 30 * 1000);
  setInterval(runReminderJob, REMINDER_INTERVAL_MS);
```

por:

```js
  setTimeout(runReminderJob, 30 * 1000).unref();
  setInterval(runReminderJob, REMINDER_INTERVAL_MS).unref();
```

(`unref()` não muda nada em produção — o servidor vive pelo `app.listen`; em testes, deixa o processo sair quando a suíte termina.)

- [ ] **Step 3: Escrever o harness**

Criar `server/tests/helpers/testApp.js`:

```js
/**
 * Harness de testes de API do almoxarifado.
 * Monta um express() real com as rotas de produção sobre SQLite :memory:.
 * Auth é substituída por stub injetado via os parâmetros de DI dos registradores.
 */
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const os = require('os');
const path = require('path');
const fs = require('fs');
const { initSchema } = require('../../services/almoxarifado/schema');
const { dbRun } = require('../../services/almoxarifado/db');

async function createTestApp(options = {}) {
  const app = express();
  app.use(express.json());

  const db = new sqlite3.Database(':memory:');
  await initSchema(db);

  // Diretório temporário para uploads (multer do módulo exige um PERSISTENT_DATA_DIR)
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'almox-test-'));

  // Stub de autenticação: usuário trocável por teste; null => 401
  let currentUser = options.user !== undefined ? options.user : { id: 1, nome: 'Admin Teste', role: 'admin' };
  const fakeAuth = (req, res, next) => {
    if (!currentUser) return res.status(401).json({ error: 'Token não fornecido' });
    req.user = { ...currentUser };
    next();
  };
  // Camada 2 (permissão de módulo) liberada no harness; a camada 3
  // (requirePermission por perfil) roda o código REAL das rotas extended.
  const fakeCheckModulePermission = () => (req, res, next) => next();

  require('../../routes/almoxarifado')(app, db, fakeAuth, dataDir, fakeCheckModulePermission);
  require('../../routes/requisicoesMaterial')(app, db, fakeAuth);

  // O registrador principal agenda a extended num callback do sqlite
  // (almoxarifado.js:1995). Um roundtrip garante que ela já registrou.
  await dbRun(db, 'SELECT 1');

  return {
    app,
    db,
    setUser(user) { currentUser = user; },
    close() {
      return new Promise((resolve) => db.close(() => resolve()));
    },
  };
}

module.exports = { createTestApp };
```

- [ ] **Step 4: Escrever o smoke test (falha enquanto o harness não funciona)**

Criar `server/tests/api/smoke.api.test.js`:

```js
/**
 * Smoke test do harness de API do almoxarifado.
 * Executar: node server/tests/api/smoke.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');

let passed = 0;
let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

(async () => {
  const { app, setUser, close } = await createTestApp();

  await test('GET /api/almoxarifado/materiais retorna 200 com lista', async () => {
    const res = await request(app).get('/api/almoxarifado/materiais');
    assert.strictEqual(res.status, 200);
    assert.ok(Array.isArray(res.body));
  });

  await test('GET /api/almoxarifado/meta/tipos-material (rota extended) retorna 200', async () => {
    const res = await request(app).get('/api/almoxarifado/meta/tipos-material');
    assert.strictEqual(res.status, 200);
    assert.ok(Array.isArray(res.body.tipos));
  });

  await test('sem usuário autenticado retorna 401', async () => {
    setUser(null);
    const res = await request(app).get('/api/almoxarifado/materiais');
    assert.strictEqual(res.status, 401);
    setUser({ id: 1, nome: 'Admin Teste', role: 'admin' });
  });

  await test('GET /api/requisicoes-material/setores retorna 200', async () => {
    const res = await request(app).get('/api/requisicoes-material/setores');
    assert.strictEqual(res.status, 200);
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
```

- [ ] **Step 5: Rodar e iterar até passar**

Run: `cd server && node tests/api/smoke.api.test.js`
Expected: primeiro run pode falhar (ex.: rota extended ainda não registrada, dir de upload, ordem de middleware). Corrigir o harness — NÃO os arquivos de rota (exceto se um defeito de rota for confirmado; aí registrar no README da fundação). Ao final: `4 passed, 0 failed` e o processo ENCERRA sozinho (valida o unref do Step 2).

- [ ] **Step 6: Criar o runner agregado**

Criar `server/tests/api/run-all.js`:

```js
/** Roda todos os *.api.test.js desta pasta em sequência. */
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const dir = __dirname;
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.api.test.js')).sort();
let failed = 0;
for (const f of files) {
  console.log(`\n━━ ${f} ━━`);
  const r = spawnSync(process.execPath, [path.join(dir, f)], { stdio: 'inherit' });
  if (r.status !== 0) failed++;
}
console.log(`\n${files.length - failed}/${files.length} arquivos de teste OK`);
process.exit(failed > 0 ? 1 : 0);
```

Em `server/package.json`, adicionar ao bloco `scripts`:

```json
"test:api": "node tests/api/run-all.js"
```

- [ ] **Step 7: Rodar tudo**

Run: `cd server && npm run test:api && npm run test:almoxarifado`
Expected: ambos com exit 0.

- [ ] **Step 8: Commit**

```bash
git add server/tests/helpers/testApp.js server/tests/api/ server/routes/almoxarifado.js server/package.json server/package-lock.json
git commit -m "Almoxarifado: harness de testes de API (supertest + sqlite em memoria)"
```

---

### Task 2: Corrigir bug — `purchaseService` sem import na extended.js

**Files:**
- Create: `server/tests/api/comprasMinimos.api.test.js`
- Modify: `server/routes/almoxarifado/extended.js` (1 linha de import)

**Interfaces:**
- Consumes: `createTestApp` da Task 1.
- Contexto: `extended.js:294` chama `purchaseService.verificarEstoqueMinimo(db)` e `:300` chama `purchaseService.vincularPedidoCompra(...)`, mas o arquivo nunca importa `purchaseService` — as duas rotas respondem 500 (`ReferenceError`) hoje. O serviço existe em `server/services/almoxarifado/purchaseService.js` e exporta essas duas funções.

- [ ] **Step 1: Escrever o teste que reproduz o bug**

Criar `server/tests/api/comprasMinimos.api.test.js` (mesmo esqueleto de runner do smoke test — copiar o helper `test` e o IIFE):

```js
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

(async () => {
  const { app, close } = await createTestApp(); // admin default tem permissão 'configurar'

  await test('POST /compras/verificar-minimos responde 200 (bug do import do purchaseService)', async () => {
    const res = await request(app).post('/api/almoxarifado/compras/verificar-minimos');
    assert.strictEqual(res.status, 200);
    assert.ok('criadas' in res.body);
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
```

- [ ] **Step 2: Rodar para ver falhar**

Run: `cd server && node tests/api/comprasMinimos.api.test.js`
Expected: FAIL — status 500 com `purchaseService is not defined`.

- [ ] **Step 3: Corrigir o import**

Em `server/routes/almoxarifado/extended.js`, junto aos requires (após a linha 15, `sectorMaterialService`):

```js
const purchaseService = require('../../services/almoxarifado/purchaseService');
```

- [ ] **Step 4: Rodar para ver passar**

Run: `cd server && node tests/api/comprasMinimos.api.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/routes/almoxarifado/extended.js server/tests/api/comprasMinimos.api.test.js
git commit -m "Almoxarifado: corrige import ausente do purchaseService (rotas de compras por minimo quebradas)"
```

---

### Task 3: DDL único — schema só em `services/almoxarifado/schema.js`

**Files:**
- Modify: `server/routes/almoxarifado.js` (remover os 13 blocos `db.run(CREATE TABLE ...)`; adicionar chamada a `initSchema`)
- Create: `server/tests/api/schemaUnico.api.test.js`

**Interfaces:**
- Consumes: `createTestApp` (que já inicializa APENAS via `initSchema` — é exatamente o cenário que queremos provar).
- Contexto: os 13 blocos ficam nas linhas 55, 81, 100, 115, 848, 882, 909, 938, 989, 996, 1008, 1031, 1068 de `routes/almoxarifado.js`. Todas as 13 tabelas já são criadas por `schema.js` (`ensureBaseTables` + `initSchema`).

- [ ] **Step 1: Diff de segurança antes de apagar**

Para cada um dos 13 `CREATE TABLE` de `routes/almoxarifado.js`, comparar coluna a coluna com a versão em `services/almoxarifado/schema.js`. Se alguma coluna existir SÓ na versão da rota, adicioná-la ao `schema.js` (via `safeAlter` no `initSchema`) ANTES de apagar. Registrar no commit o resultado do diff (esperado: schema.js é superconjunto — foi escrito copiando as tabelas da rota).

- [ ] **Step 2: Escrever o teste-guarda**

Criar `server/tests/api/schemaUnico.api.test.js` (mesmo esqueleto de runner):

```js
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

(async () => {
  const { app, db, close } = await createTestApp();

  await test('routes/almoxarifado.js nao contem mais DDL (CREATE TABLE)', async () => {
    const src = fs.readFileSync(path.join(__dirname, '../../routes/almoxarifado.js'), 'utf8');
    assert.ok(!src.includes('CREATE TABLE'), 'DDL ainda presente no arquivo de rotas');
  });

  await test('app inicializado só com initSchema atende o CRUD de material', async () => {
    const fam = await request(app).post('/api/almoxarifado/familias')
      .send({ codigo: 'FAM1', nome: 'Família Teste' });
    assert.strictEqual(fam.status, 201, JSON.stringify(fam.body));
    const mat = await request(app).post('/api/almoxarifado/materiais')
      .send({ codigo: 'MAT-001', nome: 'Material Teste', familia_id: fam.body.id, unidade: 'UN' });
    assert.strictEqual(mat.status, 201, JSON.stringify(mat.body));
    const lista = await request(app).get('/api/almoxarifado/materiais');
    assert.strictEqual(lista.status, 200);
    assert.strictEqual(lista.body.length, 1);
  });

  await test('demais telas principais respondem (conferencias, requisicoes, configuracoes)', async () => {
    for (const rota of ['/api/almoxarifado/conferencias', '/api/almoxarifado/requisicoes', '/api/almoxarifado/configuracoes']) {
      const res = await request(app).get(rota);
      assert.strictEqual(res.status, 200, `${rota} -> ${res.status}`);
    }
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
```

Nota de implementação: se `POST /familias` ou `POST /materiais` retornarem status/formato diferente do assumido (ex.: 200 em vez de 201, ou id em outro campo), ajustar o TESTE ao contrato real observado — o objetivo desta task é o schema, não mudar contrato de rota.

- [ ] **Step 3: Rodar para ver falhar**

Run: `cd server && node tests/api/schemaUnico.api.test.js`
Expected: FAIL no teste-guarda (`DDL ainda presente`).

- [ ] **Step 4: Remover o DDL e apontar para o initSchema**

Em `server/routes/almoxarifado.js`:
1. Apagar os 13 blocos `db.run(\`CREATE TABLE IF NOT EXISTS ...\`)` (com seus callbacks de log).
2. No topo do corpo do `module.exports`, antes do `app.use('/api/almoxarifado', ...)`, adicionar:

```js
  const { initSchema } = require('../services/almoxarifado/schema');
  initSchema(db).catch((e) => console.error('❌ Erro no schema do almoxarifado:', e.message));
```

(A extended já roda `runInitSchemaWithRetry` — redundância intencional e barata; o sqlite serializa a fila, e o harness aguarda `initSchema` explicitamente.)

- [ ] **Step 5: Rodar tudo para ver passar**

Run: `cd server && npm run test:api && npm run test:almoxarifado`
Expected: tudo verde.

- [ ] **Step 6: Fumaça manual no servidor real (banco de dev)**

Run: `cd server && timeout 15 node index.js` (ou iniciar e matar após o boot)
Expected: boot sem erros de tabela; logs "✅" normais.

- [ ] **Step 7: Commit**

```bash
git add server/routes/almoxarifado.js server/services/almoxarifado/schema.js server/tests/api/schemaUnico.api.test.js
git commit -m "Almoxarifado: DDL unico no schema.js (remove duplicacao das rotas)"
```

---

### Task 4: Movimentação v1 delega para o motor v2 (auditoria garantida)

**Files:**
- Create: `server/tests/api/movimentacoes.api.test.js`
- Modify: `server/routes/almoxarifado.js:573-636` (handler `POST /api/almoxarifado/movimentacoes`)
- Modify: `client/src/components/almoxarifado/MovimentacoesAlmoxarifado.js` (campo motivo vira required no form)
- Modify: `client/src/components/almoxarifado/MateriaisAlmoxarifado.js` (idem no modal rápido)

**Interfaces:**
- Consumes: `stockService.registrarMovimentacao(db, user, params)` → `{ id, saldo_anterior, saldo_posterior }` (lança `Error` com `.status`).
- Produces: contrato HTTP do v1 preservado — `POST /api/almoxarifado/movimentacoes` com body `{ material_id, tipo ∈ [ENTRADA,SAIDA,AJUSTE,DEVOLUCAO], quantidade, motivo?, referencia?, observacoes? }` → 201 `{ id, material_id, tipo, quantidade, saldo_anterior, saldo_posterior, motivo, referencia, observacoes }`.
- **Mudanças de contrato intencionais** (documentar no commit):
  1. `motivo` passa a ser obrigatório para `SAIDA` e `AJUSTE` (spec seção 13.3: nenhuma saída sem motivo). O front ganha `required` no campo.
  2. Material inativo: 404 → **400** ("Material inativo não pode ser movimentado").
  3. Validação de saldo em SAIDA passa a usar o **disponível** (físico − reservado − bloqueado − inspeção), não só o físico.

- [ ] **Step 1: Escrever os testes (a maioria falha contra o handler atual)**

Criar `server/tests/api/movimentacoes.api.test.js` (mesmo esqueleto de runner):

```js
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

async function criarMaterial(db, codigo, qtd = 100) {
  const r = await dbRun(db,
    `INSERT INTO materiais_almoxarifado (codigo, nome, quantidade_atual, ativo) VALUES (?,?,?,1)`,
    [codigo, `Material ${codigo}`, qtd]);
  return r.lastID;
}

(async () => {
  const { app, db, close } = await createTestApp();
  const matId = await criarMaterial(db, 'MOV-001', 100);

  await test('ENTRADA v1 soma saldo e responde contrato antigo', async () => {
    const res = await request(app).post('/api/almoxarifado/movimentacoes')
      .send({ material_id: matId, tipo: 'ENTRADA', quantidade: 50, motivo: 'Compra' });
    assert.strictEqual(res.status, 201, JSON.stringify(res.body));
    assert.strictEqual(res.body.saldo_anterior, 100);
    assert.strictEqual(res.body.saldo_posterior, 150);
  });

  await test('movimentação v1 grava auditoria (regra central da Etapa 0)', async () => {
    const rows = await dbAll(db,
      `SELECT * FROM auditoria_log_almoxarifado WHERE entidade = 'movimentacao'`);
    assert.ok(rows.length >= 1, 'nenhuma linha de auditoria gravada');
  });

  await test('SAIDA com motivo baixa saldo', async () => {
    const res = await request(app).post('/api/almoxarifado/movimentacoes')
      .send({ material_id: matId, tipo: 'SAIDA', quantidade: 30, motivo: 'Consumo OS 123' });
    assert.strictEqual(res.status, 201, JSON.stringify(res.body));
    assert.strictEqual(res.body.saldo_posterior, 120);
  });

  await test('SAIDA sem motivo retorna 400 (novo contrato, spec 13.3)', async () => {
    const res = await request(app).post('/api/almoxarifado/movimentacoes')
      .send({ material_id: matId, tipo: 'SAIDA', quantidade: 1 });
    assert.strictEqual(res.status, 400);
  });

  await test('SAIDA acima do saldo retorna 400 e não altera saldo', async () => {
    const res = await request(app).post('/api/almoxarifado/movimentacoes')
      .send({ material_id: matId, tipo: 'SAIDA', quantidade: 9999, motivo: 'teste' });
    assert.strictEqual(res.status, 400);
    const m = await dbGet(db, 'SELECT quantidade_atual FROM materiais_almoxarifado WHERE id = ?', [matId]);
    assert.strictEqual(m.quantidade_atual, 120);
  });

  await test('SAIDA respeita o disponível (reserva bloqueia consumo)', async () => {
    await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_reservada = 100 WHERE id = ?', [matId]);
    const res = await request(app).post('/api/almoxarifado/movimentacoes')
      .send({ material_id: matId, tipo: 'SAIDA', quantidade: 50, motivo: 'teste' }); // físico 120, disponível 20
    assert.strictEqual(res.status, 400);
    await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_reservada = 0 WHERE id = ?', [matId]);
  });

  await test('AJUSTE define o saldo diretamente (paridade v1)', async () => {
    const res = await request(app).post('/api/almoxarifado/movimentacoes')
      .send({ material_id: matId, tipo: 'AJUSTE', quantidade: 77, motivo: 'Inventário' });
    assert.strictEqual(res.status, 201, JSON.stringify(res.body));
    assert.strictEqual(res.body.saldo_posterior, 77);
  });

  await test('DEVOLUCAO soma saldo (paridade v1)', async () => {
    const res = await request(app).post('/api/almoxarifado/movimentacoes')
      .send({ material_id: matId, tipo: 'DEVOLUCAO', quantidade: 3, motivo: 'Sobra de OS' });
    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.body.saldo_posterior, 80);
  });

  await test('tipo inválido retorna 400', async () => {
    const res = await request(app).post('/api/almoxarifado/movimentacoes')
      .send({ material_id: matId, tipo: 'TRANSFERENCIA', quantidade: 1, motivo: 'x' });
    assert.strictEqual(res.status, 400);
  });

  await test('quantidade zero/negativa retorna 400', async () => {
    for (const q of [0, -5]) {
      const res = await request(app).post('/api/almoxarifado/movimentacoes')
        .send({ material_id: matId, tipo: 'ENTRADA', quantidade: q, motivo: 'x' });
      assert.strictEqual(res.status, 400, `quantidade ${q}`);
    }
  });

  await test('material inativo retorna 400', async () => {
    const inativo = await criarMaterial(db, 'MOV-INATIVO', 10);
    await dbRun(db, 'UPDATE materiais_almoxarifado SET ativo = 0 WHERE id = ?', [inativo]);
    const res = await request(app).post('/api/almoxarifado/movimentacoes')
      .send({ material_id: inativo, tipo: 'ENTRADA', quantidade: 1, motivo: 'x' });
    assert.strictEqual(res.status, 400);
  });

  await test('livro registra saldo_anterior/saldo_posterior encadeados', async () => {
    const movs = await dbAll(db,
      `SELECT saldo_anterior, saldo_posterior FROM movimentacoes_almoxarifado
       WHERE material_id = ? AND cancelado = 0 ORDER BY id`, [matId]);
    for (let i = 1; i < movs.length; i++) {
      assert.strictEqual(movs[i].saldo_anterior, movs[i - 1].saldo_posterior,
        `quebra de encadeamento no movimento ${i}`);
    }
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
```

- [ ] **Step 2: Rodar para ver falhar**

Run: `cd server && node tests/api/movimentacoes.api.test.js`
Expected: FAIL em pelo menos: auditoria (v1 não grava), SAIDA sem motivo (v1 aceita), disponível com reserva (v1 só olha físico), material inativo (v1 responde 404).

- [ ] **Step 3: Reescrever o handler v1 como delegação**

Substituir o handler completo de `POST /api/almoxarifado/movimentacoes` (`server/routes/almoxarifado.js:573-636`) por:

```js
  // POST /api/almoxarifado/movimentacoes — registrar movimento
  // Compat v1: contrato antigo, motor novo (stockService = validações + auditoria + saldo por localização)
  app.post('/api/almoxarifado/movimentacoes', async (req, res) => {
    const { material_id, tipo, quantidade, motivo, referencia, observacoes } = req.body;

    if (!['ENTRADA', 'SAIDA', 'AJUSTE', 'DEVOLUCAO'].includes(tipo)) {
      return res.status(400).json({ error: 'Tipo inválido. Use ENTRADA, SAIDA, AJUSTE ou DEVOLUCAO' });
    }
    if ((tipo === 'SAIDA' || tipo === 'AJUSTE') && !motivo) {
      return res.status(400).json({ error: 'Motivo é obrigatório para saída e ajuste' });
    }

    try {
      const result = await stockService.registrarMovimentacao(db, req.user, {
        material_id, tipo, quantidade, motivo, referencia, observacoes,
        justificativa: motivo || null,
      });
      res.status(201).json({
        id: result.id, material_id, tipo, quantidade,
        saldo_anterior: result.saldo_anterior, saldo_posterior: result.saldo_posterior,
        motivo, referencia, observacoes,
      });
    } catch (e) {
      res.status(e.status || 500).json({ error: e.message });
    }
  });
```

(O `stockService` já cuida de: quantidade > 0, material inativo, disponível, saldo negativo, atualização de `estoque_saldo_almoxarifado`, auditoria e verificação de alerta pós-movimentação — `stockService.js:142-251`. O mapeamento `justificativa: motivo` satisfaz as exigências do motor para SAIDA/AJUSTE.)

- [ ] **Step 4: Rodar para ver passar**

Run: `cd server && node tests/api/movimentacoes.api.test.js`
Expected: PASS todos.

- [ ] **Step 5: Front — motivo obrigatório nos dois formulários**

Em `client/src/components/almoxarifado/MovimentacoesAlmoxarifado.js` (~linha 269), adicionar `required` ao input de motivo quando tipo for SAIDA/AJUSTE (o form já usa validação nativa):

```jsx
<input className="almox-input" value={form.motivo}
  onChange={e => setForm(f => ({ ...f, motivo: e.target.value }))}
  required={form.tipo === 'SAIDA' || form.tipo === 'AJUSTE'} />
```

E marcar o label com asterisco condicional seguindo o padrão do próprio form (`<span className="required">*</span>`). Aplicar o mesmo no modal rápido de `MateriaisAlmoxarifado.js` (campo `movMotivo`, POST na linha 102).

- [ ] **Step 6: Regressão completa**

Run: `cd server && npm run test:api && npm run test:almoxarifado`
Expected: tudo verde.

- [ ] **Step 7: Commit**

```bash
git add server/routes/almoxarifado.js server/tests/api/movimentacoes.api.test.js client/src/components/almoxarifado/MovimentacoesAlmoxarifado.js client/src/components/almoxarifado/MateriaisAlmoxarifado.js
git commit -m "Almoxarifado: movimentacao v1 delega ao motor v2 (auditoria, disponivel, motivo obrigatorio em saida/ajuste)"
```

---

### Task 5: `safeAlter` estrito

**Files:**
- Create: `server/tests/safeAlter.test.js` (teste de serviço — não precisa de API)
- Modify: `server/services/almoxarifado/schema.js:62-64` (+ exportar `safeAlter`)

**Interfaces:**
- Produces: `safeAlter(db, sql)` — engole APENAS "duplicate column name"; qualquer outro erro loga (`console.error`) e propaga. Exportado em `module.exports` para teste.
- Segurança: `initSchema` é chamado em produção dentro de `runInitSchemaWithRetry` (`extended.js:22-34`), que já captura falha definitiva sem derrubar o boot — propagar erro de ALTER é seguro.

- [ ] **Step 1: Escrever o teste**

Criar `server/tests/safeAlter.test.js`:

```js
const sqlite3 = require('sqlite3').verbose();
const assert = require('assert');
const { dbRun } = require('../services/almoxarifado/db');
const { safeAlter } = require('../services/almoxarifado/schema');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

(async () => {
  const db = new sqlite3.Database(':memory:');
  await dbRun(db, 'CREATE TABLE t (id INTEGER PRIMARY KEY, nome TEXT)');

  await test('coluna duplicada é engolida silenciosamente', async () => {
    await safeAlter(db, 'ALTER TABLE t ADD COLUMN nome TEXT'); // não deve lançar
  });

  await test('ALTER com erro real propaga (tabela inexistente)', async () => {
    let threw = false;
    try { await safeAlter(db, 'ALTER TABLE tabela_que_nao_existe ADD COLUMN x TEXT'); }
    catch (e) { threw = true; }
    assert.ok(threw, 'erro de ALTER foi engolido');
  });

  await test('ALTER com sintaxe inválida propaga', async () => {
    let threw = false;
    try { await safeAlter(db, 'ALTER TABEL t ADD COLUMN y TEXT'); }
    catch (e) { threw = true; }
    assert.ok(threw);
  });

  db.close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
```

- [ ] **Step 2: Rodar para ver falhar**

Run: `cd server && node tests/safeAlter.test.js`
Expected: FAIL — `safeAlter` não é exportado ainda; após exportar, os testes de propagação falham (engole tudo).

- [ ] **Step 3: Implementar**

Em `server/services/almoxarifado/schema.js:62-64`, substituir:

```js
async function safeAlter(db, sql) {
  try { await dbRun(db, sql); } catch (e) { /* duplicate column */ }
}
```

por:

```js
async function safeAlter(db, sql) {
  try {
    await dbRun(db, sql);
  } catch (e) {
    if (/duplicate column name/i.test(e.message)) return;
    console.error('[almoxarifado-schema] ALTER falhou:', sql.trim().slice(0, 80), '—', e.message);
    throw e;
  }
}
```

E adicionar `safeAlter` ao `module.exports` do arquivo.

- [ ] **Step 4: Rodar para ver passar + regressão**

Run: `cd server && node tests/safeAlter.test.js && npm run test:api && npm run test:almoxarifado`
Expected: tudo verde (se `initSchema` tiver algum ALTER latente quebrado que hoje falha em silêncio, ele vai aparecer AGORA nos testes — corrigir o ALTER, é exatamente o objetivo).

- [ ] **Step 5: Adicionar `test:safealter` ao package.json e commit**

```json
"test:safealter": "node tests/safeAlter.test.js"
```

```bash
git add server/services/almoxarifado/schema.js server/tests/safeAlter.test.js server/package.json
git commit -m "Almoxarifado: safeAlter so engole coluna duplicada; outros erros de ALTER propagam"
```

---

### Task 6: Corrigir checagem de permissão dos setores-requisição

**Files:**
- Create: `server/tests/api/permissoesSetores.api.test.js`
- Modify: `server/routes/almoxarifado/extended.js:358,368`

**Interfaces:**
- Consumes: `canConfigureAlmox(user)` de `services/systemPermissions.js` (já importado em `extended.js:4`) — retorna true para super admin (`is_superadmin`), admin de sistema (`role='admin'`) ou admin do módulo almoxarifado (`admin_modulos` contém `'almoxarifado'`).
- Contexto: hoje `PUT /setores-requisicao/:id/permissoes` e `POST .../bulk-tipo` usam `req.user.role !== 'admin'` → super admins e admins do módulo sem `role='admin'` recebem 403 indevido.

- [ ] **Step 1: Escrever o teste**

Criar `server/tests/api/permissoesSetores.api.test.js` (mesmo esqueleto de runner). Preparação: obter um setor válido via `GET /api/almoxarifado/setores-requisicao` (o serviço faz seed automático — `sectorMaterialService.ensureSetoresRequisicao`).

```js
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

(async () => {
  const { app, setUser, close } = await createTestApp();

  const setores = await request(app).get('/api/almoxarifado/setores-requisicao');
  assert.strictEqual(setores.status, 200);
  const setorId = setores.body[0].id;

  await test('role=admin continua podendo salvar permissões', async () => {
    setUser({ id: 1, nome: 'Admin', role: 'admin' });
    const res = await request(app)
      .put(`/api/almoxarifado/setores-requisicao/${setorId}/permissoes`)
      .send({ permissoes: [] });
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
  });

  await test('super admin SEM role=admin pode salvar (bug atual: 403)', async () => {
    setUser({ id: 2, nome: 'Super', role: 'user', is_superadmin: 1 });
    const res = await request(app)
      .put(`/api/almoxarifado/setores-requisicao/${setorId}/permissoes`)
      .send({ permissoes: [] });
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
  });

  await test('admin do módulo almoxarifado pode salvar', async () => {
    setUser({ id: 3, nome: 'AdminAlmox', role: 'user', admin_modulos: ['almoxarifado'] });
    const res = await request(app)
      .post(`/api/almoxarifado/setores-requisicao/${setorId}/permissoes/bulk-tipo`)
      .send({ tipo_uso: 'industrial' });
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
  });

  await test('usuário comum recebe 403', async () => {
    setUser({ id: 4, nome: 'Comum', role: 'user' });
    const res = await request(app)
      .put(`/api/almoxarifado/setores-requisicao/${setorId}/permissoes`)
      .send({ permissoes: [] });
    assert.strictEqual(res.status, 403);
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
```

Nota: se `canConfigureAlmox` esperar `admin_modulos` como string JSON em vez de array, ajustar o objeto de teste ao formato real (verificar em `services/systemPermissions.js:62`).

- [ ] **Step 2: Rodar para ver falhar**

Run: `cd server && node tests/api/permissoesSetores.api.test.js`
Expected: FAIL nos casos de super admin e admin de módulo (403).

- [ ] **Step 3: Implementar**

Em `server/routes/almoxarifado/extended.js`, nas duas rotas (linhas 358 e 368), substituir:

```js
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Apenas administradores' });
```

por:

```js
    if (!canConfigureAlmox(req.user)) {
      return res.status(403).json({ error: 'Acesso restrito — administrador do Almoxarifado ou Super Administrador' });
    }
```

- [ ] **Step 4: Rodar para ver passar + regressão**

Run: `cd server && node tests/api/permissoesSetores.api.test.js && npm run test:api && npm run test:almoxarifado`
Expected: tudo verde.

- [ ] **Step 5: Commit**

```bash
git add server/routes/almoxarifado/extended.js server/tests/api/permissoesSetores.api.test.js
git commit -m "Almoxarifado: permissao de setores-requisicao usa canConfigureAlmox (inclui super admin e admin do modulo)"
```

---

### Task 7 (DECISÃO PENDENTE — não executar sem confirmação do usuário): SMTP hardcoded

O bloco `getEmailConfig()` em `server/index.js:2928-2937` tem credenciais SMTP em texto claro com o comentário *"HARD CODED (solicitado pelo usuário)... Mantido por solicitação explícita"*. Ou seja: já foi uma decisão consciente — **não alterar unilateralmente**.

**Recomendação a apresentar ao usuário:** ler de variáveis de ambiente com fallback para os valores atuais (comportamento idêntico se as envs não existirem):

```js
async function getEmailConfig() {
  return {
    host: process.env.SMTP_HOST || 'smtp.locaweb.com.br',
    user: process.env.SMTP_USER || 'solicitacoes@gmp.ind.br',
    pass: process.env.SMTP_PASS || 'Solicitacoes123@',
    from: process.env.SMTP_FROM || 'solicitacoes@gmp.ind.br',
  };
}
```

- [ ] Perguntar ao usuário se aprova a mudança (e se quer rotacionar a senha, já que está no histórico do git)
- [ ] Se aprovado: aplicar + smoke de envio em dev + commit `Servidor: SMTP configuravel por env com fallback`

---

## Fora de escopo desta etapa (registrado para não esquecer)

- Migrar o frontend para o payload rico da v2 (localização/lote/projeto/OS) — feature 03.
- Testes da camada 2 de permissão (`checkModulePermission` real) — feature 23; o harness a stuba.
- Adoção de `express-validator` — decisão adiada; validações desta etapa seguem o padrão manual.
- `cancelarMovimentacao` tem lógica de estorno confusa (`stockService.js:256-292`) — revisar na feature 03.

## Self-review (feito na escrita do plano)

- Cobertura: todos os itens 0.1–0.5 do `specs/modulo-almoxarifado/00-fundacao-tecnica/README.md` têm task (0.1→T1, 0.2→T3, 0.3→T4, 0.4→T5 + ledger já documentado, 0.5→T6+T7). Bug novo do `purchaseService` → T2.
- O item "v1 retorna 410" do README da fundação foi decidido aqui como **delegação** (opção mais segura, sem mudança no front) — atualizar o README da fundação ao concluir a T4.
- Tipos/assinaturas conferidos contra o código real em 2026-08-02 (tabela de fatos acima).
