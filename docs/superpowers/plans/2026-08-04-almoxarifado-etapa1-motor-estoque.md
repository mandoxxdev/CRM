# Almoxarifado Etapa 1 — Motor de Estoque — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tornar o motor de movimentação confiável e completo: vínculo obrigatório por tipo (regra crítica spec 13.3), saída emergencial com regularização, saldo atômico sob concorrência, estorno correto, custo médio calculado, ajuste por localização, livro com filtros + extrato do item, e o frontend passando a usar o payload rico da v2 com tela de estorno.

**Architecture:** Todas as regras entram no motor único (`stockService.registrarMovimentacao`) que a Etapa 0 consolidou — a rota v1 delega para ele, então as regras valem para as duas rotas automaticamente. Regras de vínculo por tipo viram um módulo declarativo (`movementRules.js`). Validação de shape com Zod (`validate(schema)`, padrão da fundação). Frontend migra o form para `POST /movimentacoes/v2`.

**Tech Stack:** Node/Express 4.18, sqlite3 (SQL cru), Zod 4 (`services/almoxarifado/validation.js`), supertest + harness `createTestApp`, React CRA no `client/`.

## Global Constraints

- Branch de trabalho: **`desenvolvimento-almoxarifado`** (todos os commits nela; NÃO criar branch nova, NÃO commitar na main).
- Backend real é `server/`; frontend real é `client/`. As pastas `backend/` e `src/` da raiz são código morto — nunca tocar.
- Padrão de teste: runner caseiro (script Node, `test(nome, fn)`, `assert`, exit code). Testes de API em `server/tests/api/*.api.test.js` (auto-descobertos por `npm run test:api`), usando `createTestApp` de `server/tests/helpers/testApp.js` → `{ app, db, setUser(user), close() }`; usuário default `{ id: 1, nome: 'Admin Teste', role: 'admin' }` (mapeia para perfil ADMINISTRADOR).
- Validação de entrada: **Zod** via `validate(schema)` de `server/services/almoxarifado/validation.js` — toda rota tocada/criada neste plano adota; resposta de erro `{ error: 'Dados inválidos — <path>: <msg>' }` com status 400.
- Mudanças de schema: DDL/colunas só em `server/services/almoxarifado/schema.js` (`safeAlter` para colunas novas — ele propaga erros reais desde a Etapa 0). NENHUM `CREATE TABLE`/`ALTER` em arquivos de rota (teste-guarda existente falha).
- Mensagens de erro em português no formato `{ error }`.
- Ao final de CADA task: `cd server && npm run test:api && npm run test:almoxarifado` verdes.
- Commits pequenos, um por task, mensagem em português (`Almoxarifado: ...`), corpo terminando com `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

## Fatos do código (verificados em 2026-08-04)

| Fato | Onde |
|---|---|
| Motor: `registrarMovimentacao(db, user, params)` | `server/services/almoxarifado/stockService.js:135-260` — valida user/quantidade/material ativo; listas `tiposEntrada`/`tiposSaida`/`tiposAjuste` em `:154-156`; SAÍDA exige `os_id \|\| projeto_id \|\| justificativa \|\| referencia` (`:171-173`); AJUSTE exige `justificativa \|\| can(user,'ajustar_estoque')` (`:176-178`); tipos sem efeito no saldo: `['TRANSFERENCIA','BLOQUEIO','DESBLOQUEIO','RESERVA','LIBERACAO_RESERVA']` (`:204`); AJUSTE sincroniza localização padrão (fix Etapa 0, `:224-229`); INSERT do movimento `:226+`; auditoria `:240+`; retorna `{ id, saldo_anterior, saldo_posterior }` |
| ⚠️ Saldo é read-then-write: lê `quantidade_atual`, valida, depois UPDATE — **janela de corrida** entre duas saídas concorrentes | `stockService.js:151` (leitura) e `:208-209` (UPDATE) |
| `cancelarMovimentacao(db, user, movimentoId, motivo)` — **defeituosa**: ajusta saldo manualmente, depois registra um AJUSTE com `quantidade = novoSaldo` (confuso no livro); NÃO reverte saldo por localização; cancelar TRANSFERENCIA/BLOQUEIO não reverte nada | `stockService.js:256-292` |
| `TIPOS_MOVIMENTO` (20 tipos) | `server/services/almoxarifado/schema.js:38-43` |
| `custo_medio` NUNCA é escrito — só lido (valor de estoque, custo de requisição) | leituras: `stockService.js:353`, `reportService.js:6`, `requisitionService.js:66`, `requisitionValueApprovalService.js:63`; coluna: `schema.js:356` |
| `syncMaterialTotals` só atualiza o material se `saldos.total > 0` — ajustar a única localização para 0 não propagaria | `stockService.js:24-38` |
| `getSaldoDisponivel` = físico − reservado − bloqueado − inspeção | `stockService.js:17-22` |
| Reservas: `criarReserva`/`liberarReserva` registram movimentos RESERVA/LIBERACAO_RESERVA (sem efeito no saldo físico) | `stockService.js:294-348` |
| Rotas v1: `GET /api/almoxarifado/movimentacoes` (filtros material_id/tipo/data_inicio/data_fim/limit) e `POST` (delegação) | `server/routes/almoxarifado.js:476` e `:501` |
| Rotas v2: `POST /movimentacoes/v2` (`requirePermission('movimentar')` = ADMIN/ALMOXARIFE), `POST /movimentacoes/:id/cancelar` (`ajustar_estoque` = ADMIN/GESTOR), `POST /transferencias`, reservas | `server/routes/almoxarifado/extended.js:100-146` |
| Padrão de rota auxiliar sem gate de outro módulo | `extended.js:205-215` (`/recebimentos-aux/...`) |
| Colunas já existentes na movimentação: projeto_id, os_id, cliente_id, lote, localizacao_origem/destino_id, documento_vinculado, justificativa, cancelado, cancelado_por/em, cancelamento_motivo, movimento_estorno_id, reserva_id, recebimento_id, requisicao_id | `schema.js` (bloco v3 de safeAlters da movimentação) |
| `permite_saldo_negativo`: flag do material OU config `permite_saldo_negativo_global='1'` | `stockService.js:150` |
| Zod helper: `validate(schema)` substitui `req.body` pelo parseado; `formatZodError` | `server/services/almoxarifado/validation.js` |
| Front do livro/form: 4 tipos, campos material/tipo/quantidade/motivo/referencia/observações; hint de disponível na SAÍDA; filtros tipo/datas; POST em `/almoxarifado/movimentacoes` | `client/src/components/almoxarifado/MovimentacoesAlmoxarifado.js` (310 linhas, lido integral) |
| Select de projetos: `GET /api/projetos` existe (id, nome, cliente_nome) | `server/index.js:5304` |
| Lista de OS só existe sob o módulo operacional (`GET /api/operacional/ordens-servico`, gate `checkModulePermission('operacional')`) — almoxarifado precisa de um aux próprio | `server/index.js:20683` |
| Tabela `ordens_servico`: colunas incluem `numero_os`, `status`, `cliente_id` | `server/index.js:19150+` |
| Centro de custo: NÃO existe nada no almoxarifado (só frotas tem coluna TEXT) | grep em `server/` |
| Concorrência SQLite: `wrapDatabase` com retry de BUSY; teste de referência | `server/services/sqliteConcurrency.js`, `server/tests/sqliteConcurrency.test.js` |

## Decisões de design (fechadas neste plano)

1. **Centro de custo** = cadastro mínimo próprio (`centros_custo_almoxarifado`: codigo UNIQUE, nome, ativo) + coluna `centro_custo_id` na movimentação. Tabela própria (e não TEXT como frotas) porque a spec 25/27 pede relatórios por centro de custo.
2. **Matriz de vínculo por tipo** (`movementRules.js`): `SAIDA_PRODUCAO/SAIDA_MONTAGEM/SAIDA_ASSISTENCIA` exigem `os_id || projeto_id`; `SAIDA` (avulsa) exige `os_id || projeto_id || centro_custo_id || justificativa` (compatível com hoje — motivo vira justificativa na delegação v1); `AJUSTE/AJUSTE_POSITIVO/AJUSTE_NEGATIVO/SUCATA/PERDA` exigem justificativa; entradas/DEVOLUCAO sem exigência. Emergencial (`emergencial: true` + justificativa) bypassa o vínculo e marca `regularizacao_pendente=1`.
3. **Atomicidade**: a validação de disponível vira UPDATE condicional (`WHERE ... >= ?`) — `changes === 0` ⇒ 400. Elimina a corrida sem BEGIN/COMMIT (uma statement é atômica no SQLite).
4. **Estorno**: novo tipo `ESTORNO` no livro; efeito = inverso do movimento original (entrada⇒baixa com guarda de disponível, saída⇒devolve, AJUSTE⇒restaura `saldo_anterior`, TRANSFERENCIA⇒move de volta, BLOQUEIO⇔DESBLOQUEIO); reverte também o saldo por localização; RESERVA/LIBERACAO_RESERVA e ESTORNO não são estornáveis (400). Original ganha `cancelado=1` + `movimento_estorno_id`.
5. **Custo médio**: média ponderada na entrada com custo informado: `((saldoAnterior*custoMedioAtual)+(qtd*custo))/(saldoAnterior+qtd)`; se `saldoAnterior<=0` ⇒ custo informado. Atualiza também `custo_unitario` (último custo). Sem custo informado ⇒ não altera.
6. **AJUSTE por localização**: `localizacao_destino_id` no AJUSTE define o saldo DAQUELA localização = quantidade e recalcula o total do material (`syncMaterialTotals` corrigido para aceitar total 0); sem localização ⇒ comportamento atual.
7. **Front migra para v2**: o form passa a chamar `POST /movimentacoes/v2` (payload rico). Consequência intencional: usuários com perfil CONSULTA/COMPRAS perdem o botão de movimentar (a v2 exige perfil `movimentar` = ADMIN/ALMOXARIFE) — correto pela spec 28.
8. Tipos no form continuam os 4 amigáveis nesta etapa; os tipos específicos (SAIDA_PRODUCAO etc.) ficam prontos no motor com testes e entram no front quando requisições/produção integrarem (features 04/22).

---

### Task 1: Centro de custo — cadastro mínimo + coluna na movimentação

**Files:**
- Modify: `server/services/almoxarifado/schema.js` (CREATE TABLE em `initSchema` + safeAlter da coluna)
- Modify: `server/routes/almoxarifado/extended.js` (3 rotas novas)
- Create: `server/services/almoxarifado/schemas.js` (schemas Zod compartilhados — nasce aqui, cresce nas tasks seguintes)
- Test: `server/tests/api/centroCusto.api.test.js`

**Interfaces:**
- Produces: tabela `centros_custo_almoxarifado(id, codigo UNIQUE NOT NULL, nome NOT NULL, ativo DEFAULT 1, created_at)`; coluna `movimentacoes_almoxarifado.centro_custo_id INTEGER`; rotas `GET /api/almoxarifado/centros-custo` (lista; `?todos=1` inclui inativos), `POST /api/almoxarifado/centros-custo` (gate `requirePermission('configurar')`), `PUT /api/almoxarifado/centros-custo/:id` (idem; permite `ativo:0`); export `CentroCustoSchema` em `schemas.js`.
- Consumido por: Tasks 2 (regra de vínculo), 7 (filtro do livro), 8 (select no form).

- [ ] **Step 1: Escrever o teste que falha**

Criar `server/tests/api/centroCusto.api.test.js`:

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

  let ccId;
  await test('POST cria centro de custo', async () => {
    const res = await request(app).post('/api/almoxarifado/centros-custo')
      .send({ codigo: 'CC-100', nome: 'Manutenção Industrial' });
    assert.strictEqual(res.status, 201, JSON.stringify(res.body));
    ccId = res.body.id;
    assert.ok(ccId > 0);
  });

  await test('codigo duplicado retorna 400/409', async () => {
    const res = await request(app).post('/api/almoxarifado/centros-custo')
      .send({ codigo: 'CC-100', nome: 'Outro' });
    assert.ok([400, 409].includes(res.status), `status ${res.status}`);
  });

  await test('payload invalido (sem codigo) retorna 400 Zod', async () => {
    const res = await request(app).post('/api/almoxarifado/centros-custo')
      .send({ nome: 'Sem código' });
    assert.strictEqual(res.status, 400);
    assert.ok(res.body.error.includes('codigo'), res.body.error);
  });

  await test('GET lista apenas ativos por padrao', async () => {
    await request(app).post('/api/almoxarifado/centros-custo')
      .send({ codigo: 'CC-200', nome: 'Inativar' });
    const lista1 = await request(app).get('/api/almoxarifado/centros-custo');
    const cc200 = lista1.body.find((c) => c.codigo === 'CC-200');
    await request(app).put(`/api/almoxarifado/centros-custo/${cc200.id}`).send({ ativo: 0 });
    const lista2 = await request(app).get('/api/almoxarifado/centros-custo');
    assert.ok(!lista2.body.some((c) => c.codigo === 'CC-200'), 'inativo não deveria aparecer');
    const lista3 = await request(app).get('/api/almoxarifado/centros-custo?todos=1');
    assert.ok(lista3.body.some((c) => c.codigo === 'CC-200'), 'todos=1 deveria incluir inativo');
  });

  await test('POST sem perfil de configuracao retorna 403', async () => {
    setUser({ id: 9, nome: 'Produção', role: 'user', perfil_almoxarifado: 'PRODUCAO' });
    const res = await request(app).post('/api/almoxarifado/centros-custo')
      .send({ codigo: 'CC-300', nome: 'Não pode' });
    assert.strictEqual(res.status, 403);
    setUser({ id: 1, nome: 'Admin Teste', role: 'admin' });
  });

  await test('movimentacao aceita centro_custo_id (coluna existe)', async () => {
    const { dbRun } = require('../../services/almoxarifado/db');
    const { db } = { db: null }; // placeholder p/ lint — usar o db do harness abaixo
    // (o harness expõe db; ver linha de criação acima)
    assert.ok(true);
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
```

Nota de implementação: o último teste acima está esboçado — substituí-lo por INSERT direto: criar material via `dbRun` (padrão dos outros testes de API), `POST /movimentacoes/v2` com `centro_custo_id: ccId`, e `SELECT centro_custo_id` da movimentação criada conferindo o valor. Usar o `db` retornado pelo harness.

- [ ] **Step 2: Rodar e ver falhar** — Run: `cd server && node tests/api/centroCusto.api.test.js` — Expected: 404 nas rotas (não existem).

- [ ] **Step 3: Implementar**

Em `schema.js`, dentro de `initSchema` (junto das outras tabelas v3):

```js
  await dbRun(db, `CREATE TABLE IF NOT EXISTS centros_custo_almoxarifado (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    codigo TEXT UNIQUE NOT NULL,
    nome TEXT NOT NULL,
    ativo INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  await safeAlter(db, 'ALTER TABLE movimentacoes_almoxarifado ADD COLUMN centro_custo_id INTEGER');
```

Criar `server/services/almoxarifado/schemas.js`:

```js
/** Schemas Zod compartilhados do almoxarifado (padrão da fundação — ver validation.js). */
const { z } = require('zod');

const CentroCustoSchema = z.object({
  codigo: z.string().min(1, 'codigo é obrigatório'),
  nome: z.string().min(1, 'nome é obrigatório'),
  ativo: z.union([z.literal(0), z.literal(1)]).optional(),
});

module.exports = { CentroCustoSchema };
```

Em `extended.js` (junto das rotas de meta, com os requires no topo: `const { validate } = require('../../services/almoxarifado/validation');` e `const { CentroCustoSchema } = require('../../services/almoxarifado/schemas');`):

```js
  app.get('/api/almoxarifado/centros-custo', auth, async (req, res) => {
    try {
      const where = req.query.todos === '1' ? '1=1' : 'ativo = 1';
      res.json(await dbAll(db, `SELECT * FROM centros_custo_almoxarifado WHERE ${where} ORDER BY codigo`));
    } catch (e) { handleError(res, e); }
  });

  app.post('/api/almoxarifado/centros-custo', auth, requirePermission('configurar'), validate(CentroCustoSchema), async (req, res) => {
    try {
      const { codigo, nome } = req.body;
      const r = await dbRun(db, 'INSERT INTO centros_custo_almoxarifado (codigo, nome) VALUES (?,?)', [codigo.trim(), nome.trim()]);
      res.status(201).json({ id: r.lastID, codigo, nome, ativo: 1 });
    } catch (e) {
      if (/UNIQUE constraint/i.test(e.message)) return res.status(409).json({ error: 'Código de centro de custo já existe' });
      handleError(res, e);
    }
  });

  app.put('/api/almoxarifado/centros-custo/:id', auth, requirePermission('configurar'), validate(CentroCustoSchema.partial()), async (req, res) => {
    try {
      const atual = await dbGet(db, 'SELECT * FROM centros_custo_almoxarifado WHERE id = ?', [req.params.id]);
      if (!atual) return res.status(404).json({ error: 'Centro de custo não encontrado' });
      const { codigo = atual.codigo, nome = atual.nome, ativo = atual.ativo } = req.body;
      await dbRun(db, 'UPDATE centros_custo_almoxarifado SET codigo=?, nome=?, ativo=? WHERE id=?', [codigo, nome, ativo, req.params.id]);
      res.json({ id: Number(req.params.id), codigo, nome, ativo });
    } catch (e) { handleError(res, e); }
  });
```

E em `stockService.registrarMovimentacao`: adicionar `centro_custo_id` ao destructuring dos params e ao INSERT do movimento (coluna + placeholder + valor `centro_custo_id || null`).

- [ ] **Step 4: Rodar e ver passar** — `node tests/api/centroCusto.api.test.js` e depois `npm run test:api && npm run test:almoxarifado`.

- [ ] **Step 5: Commit** — `Almoxarifado: cadastro de centros de custo + vinculo na movimentacao`

---

### Task 2: Regras de vínculo por tipo + saída emergencial + Zod na movimentação

**Files:**
- Create: `server/services/almoxarifado/movementRules.js`
- Modify: `server/services/almoxarifado/stockService.js` (aplicar regras; remover a checagem ad-hoc de `:171-173`)
- Modify: `server/services/almoxarifado/schema.js` (colunas `emergencial`, `regularizacao_pendente`)
- Modify: `server/services/almoxarifado/schemas.js` (+`MovimentacaoSchema`, `RegularizacaoSchema`)
- Modify: `server/routes/almoxarifado/extended.js` (validate na v2 + rota `PUT /movimentacoes/:id/regularizar`)
- Test: `server/tests/api/movimentoRegras.api.test.js`

**Interfaces:**
- Consumes: `centro_custo_id` (Task 1).
- Produces: `avaliarRegrasVinculo(tipo, params) => { ok: true } | { ok: false, erro: string }` e `REGRAS_VINCULO` exportados de `movementRules.js`; params novos aceitos pelo motor: `emergencial` (bool), com efeito `emergencial=1, regularizacao_pendente=1` no movimento; rota `PUT /api/almoxarifado/movimentacoes/:id/regularizar` (body: ao menos um de `os_id|projeto_id|centro_custo_id`); filtro `pendentes_regularizacao=1` no GET do livro (implementado na Task 7 — aqui só a coluna).

- [ ] **Step 1: Escrever os testes**

Criar `server/tests/api/movimentoRegras.api.test.js` (runner padrão; helper `criarMaterial` copiado de `movimentacoes.api.test.js`):

```js
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet } = require('../../services/almoxarifado/db');

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
  const mat = await criarMaterial(db, 'REG-001', 100);

  await test('SAIDA_PRODUCAO sem OS nem projeto falha 400', async () => {
    const res = await request(app).post('/api/almoxarifado/movimentacoes/v2')
      .send({ material_id: mat, tipo: 'SAIDA_PRODUCAO', quantidade: 5, justificativa: 'só justificativa não basta' });
    assert.strictEqual(res.status, 400, JSON.stringify(res.body));
    assert.ok(/OS|projeto/i.test(res.body.error), res.body.error);
  });

  await test('SAIDA_PRODUCAO com os_id passa', async () => {
    const res = await request(app).post('/api/almoxarifado/movimentacoes/v2')
      .send({ material_id: mat, tipo: 'SAIDA_PRODUCAO', quantidade: 5, os_id: 1 });
    assert.strictEqual(res.status, 201, JSON.stringify(res.body));
  });

  await test('SAIDA avulsa passa com centro de custo (sem justificativa)', async () => {
    const cc = await request(app).post('/api/almoxarifado/centros-custo')
      .send({ codigo: 'CC-REG', nome: 'Regras' });
    const res = await request(app).post('/api/almoxarifado/movimentacoes/v2')
      .send({ material_id: mat, tipo: 'SAIDA', quantidade: 2, centro_custo_id: cc.body.id });
    assert.strictEqual(res.status, 201, JSON.stringify(res.body));
  });

  await test('SAIDA avulsa sem nenhum vinculo nem justificativa falha', async () => {
    const res = await request(app).post('/api/almoxarifado/movimentacoes/v2')
      .send({ material_id: mat, tipo: 'SAIDA', quantidade: 2 });
    assert.strictEqual(res.status, 400);
  });

  await test('SUCATA sem justificativa falha; com justificativa passa', async () => {
    const sem = await request(app).post('/api/almoxarifado/movimentacoes/v2')
      .send({ material_id: mat, tipo: 'SUCATA', quantidade: 1 });
    assert.strictEqual(sem.status, 400);
    const com = await request(app).post('/api/almoxarifado/movimentacoes/v2')
      .send({ material_id: mat, tipo: 'SUCATA', quantidade: 1, justificativa: 'Material danificado' });
    assert.strictEqual(com.status, 201, JSON.stringify(com.body));
  });

  let emergId;
  await test('emergencial sem justificativa falha; com justificativa passa e fica pendente', async () => {
    const sem = await request(app).post('/api/almoxarifado/movimentacoes/v2')
      .send({ material_id: mat, tipo: 'SAIDA_PRODUCAO', quantidade: 3, emergencial: true });
    assert.strictEqual(sem.status, 400);
    const com = await request(app).post('/api/almoxarifado/movimentacoes/v2')
      .send({ material_id: mat, tipo: 'SAIDA_PRODUCAO', quantidade: 3, emergencial: true, justificativa: 'Parada de máquina — regularizo depois' });
    assert.strictEqual(com.status, 201, JSON.stringify(com.body));
    emergId = com.body.id;
    const mov = await dbGet(db, 'SELECT emergencial, regularizacao_pendente FROM movimentacoes_almoxarifado WHERE id = ?', [emergId]);
    assert.strictEqual(mov.emergencial, 1);
    assert.strictEqual(mov.regularizacao_pendente, 1);
  });

  await test('regularizar exige um vinculo e limpa a pendencia', async () => {
    const sem = await request(app).put(`/api/almoxarifado/movimentacoes/${emergId}/regularizar`).send({});
    assert.strictEqual(sem.status, 400);
    const com = await request(app).put(`/api/almoxarifado/movimentacoes/${emergId}/regularizar`).send({ os_id: 42 });
    assert.strictEqual(com.status, 200, JSON.stringify(com.body));
    const mov = await dbGet(db, 'SELECT os_id, regularizacao_pendente FROM movimentacoes_almoxarifado WHERE id = ?', [emergId]);
    assert.strictEqual(mov.os_id, 42);
    assert.strictEqual(mov.regularizacao_pendente, 0);
  });

  await test('v1 delegada continua funcionando (SAIDA com motivo = justificativa)', async () => {
    const res = await request(app).post('/api/almoxarifado/movimentacoes')
      .send({ material_id: mat, tipo: 'SAIDA', quantidade: 1, motivo: 'Consumo bancada' });
    assert.strictEqual(res.status, 201, JSON.stringify(res.body));
  });

  await test('payload com shape invalido (quantidade string) retorna 400 Zod', async () => {
    const res = await request(app).post('/api/almoxarifado/movimentacoes/v2')
      .send({ material_id: mat, tipo: 'ENTRADA', quantidade: 'dez' });
    assert.strictEqual(res.status, 400);
    assert.ok(res.body.error.includes('quantidade'), res.body.error);
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
```

- [ ] **Step 2: Rodar e ver falhar** — SAIDA_PRODUCAO hoje passa só com justificativa (regra atual `:171` aceita justificativa para qualquer saída) → primeiro teste falha; emergencial/regularizar → 404/coluna inexistente.

- [ ] **Step 3: Implementar**

`server/services/almoxarifado/movementRules.js`:

```js
/**
 * Regra crítica de saída (spec 13.3): vínculo obrigatório por tipo de movimento.
 * vinculo:
 *   'os_ou_projeto'  → exige os_id || projeto_id
 *   'qualquer'       → exige os_id || projeto_id || centro_custo_id || justificativa
 *   'nenhum'         → sem exigência de vínculo
 * justificativa: true → exige justificativa (independente de vínculo)
 * Emergencial (emergencial=true + justificativa) bypassa o vínculo e marca regularizacao_pendente.
 */
const REGRAS_VINCULO = {
  SAIDA_PRODUCAO: { vinculo: 'os_ou_projeto' },
  SAIDA_MONTAGEM: { vinculo: 'os_ou_projeto' },
  SAIDA_ASSISTENCIA: { vinculo: 'os_ou_projeto' },
  SAIDA: { vinculo: 'qualquer' },
  AJUSTE: { vinculo: 'nenhum', justificativa: true },
  AJUSTE_POSITIVO: { vinculo: 'nenhum', justificativa: true },
  AJUSTE_NEGATIVO: { vinculo: 'nenhum', justificativa: true },
  SUCATA: { vinculo: 'nenhum', justificativa: true },
  PERDA: { vinculo: 'nenhum', justificativa: true },
};

function avaliarRegrasVinculo(tipo, params) {
  const regra = REGRAS_VINCULO[tipo];
  if (!regra) return { ok: true };
  const { os_id, projeto_id, centro_custo_id, justificativa, referencia, emergencial } = params;
  const just = justificativa || null;

  if (regra.justificativa && !just) {
    return { ok: false, erro: `${tipo} exige justificativa` };
  }
  if (emergencial) {
    if (!just) return { ok: false, erro: 'Movimentação emergencial exige justificativa' };
    return { ok: true, pendente: true };
  }
  if (regra.vinculo === 'os_ou_projeto' && !os_id && !projeto_id) {
    return { ok: false, erro: `${tipo} exige vínculo com OS ou projeto (ou use emergencial com justificativa)` };
  }
  if (regra.vinculo === 'qualquer' && !os_id && !projeto_id && !centro_custo_id && !just && !referencia) {
    return { ok: false, erro: 'Saída exige OS, projeto, centro de custo ou justificativa' };
  }
  return { ok: true };
}

module.exports = { REGRAS_VINCULO, avaliarRegrasVinculo };
```

Em `schema.js` (junto dos safeAlters da movimentação):

```js
  await safeAlter(db, 'ALTER TABLE movimentacoes_almoxarifado ADD COLUMN emergencial INTEGER DEFAULT 0');
  await safeAlter(db, 'ALTER TABLE movimentacoes_almoxarifado ADD COLUMN regularizacao_pendente INTEGER DEFAULT 0');
```

Em `stockService.registrarMovimentacao`:
- adicionar `emergencial` ao destructuring;
- substituir o bloco `if (tiposSaida.includes(tipo) && !os_id && ...)` (`:171-173`) por:

```js
  const { avaliarRegrasVinculo } = require('./movementRules');
  const regras = avaliarRegrasVinculo(tipo, { os_id, projeto_id, centro_custo_id, justificativa, referencia, emergencial });
  if (!regras.ok) throw Object.assign(new Error(regras.erro), { status: 400 });
  const regularizacaoPendente = regras.pendente ? 1 : 0;
```

(mover o require para o topo do arquivo; manter a exigência de justificativa do AJUSTE que já existe em `:176-178` — a matriz agora cobre; remover a duplicata) e incluir `emergencial ? 1 : 0` e `regularizacaoPendente` no INSERT do movimento.

Em `schemas.js`, adicionar:

```js
const MovimentacaoSchema = z.object({
  material_id: z.number().int().positive(),
  tipo: z.string().min(1),
  quantidade: z.number().gt(0, 'quantidade deve ser maior que zero'),
  motivo: z.string().optional(),
  referencia: z.string().optional(),
  observacoes: z.string().optional(),
  justificativa: z.string().optional(),
  lote: z.string().optional(),
  localizacao_origem_id: z.number().int().optional(),
  localizacao_destino_id: z.number().int().optional(),
  projeto_id: z.number().int().optional(),
  os_id: z.number().int().optional(),
  cliente_id: z.number().int().optional(),
  centro_custo_id: z.number().int().optional(),
  documento_vinculado: z.string().optional(),
  custo_unitario: z.number().gt(0).optional(),
  emergencial: z.boolean().optional(),
});

const RegularizacaoSchema = z.object({
  os_id: z.number().int().optional(),
  projeto_id: z.number().int().optional(),
  centro_custo_id: z.number().int().optional(),
}).refine((d) => d.os_id || d.projeto_id || d.centro_custo_id, {
  message: 'Informe OS, projeto ou centro de custo para regularizar',
});
```

Em `extended.js`: aplicar `validate(MovimentacaoSchema)` na `POST /movimentacoes/v2` (a validação de tipo válido continua no motor) e criar:

```js
  app.put('/api/almoxarifado/movimentacoes/:id/regularizar', auth, requirePermission('movimentar'), validate(RegularizacaoSchema), async (req, res) => {
    try {
      const mov = await dbGet(db, 'SELECT * FROM movimentacoes_almoxarifado WHERE id = ?', [req.params.id]);
      if (!mov) return res.status(404).json({ error: 'Movimentação não encontrada' });
      if (!mov.regularizacao_pendente) return res.status(400).json({ error: 'Movimentação não está pendente de regularização' });
      const { os_id = mov.os_id, projeto_id = mov.projeto_id, centro_custo_id = mov.centro_custo_id } = req.body;
      await dbRun(db, `UPDATE movimentacoes_almoxarifado SET os_id=?, projeto_id=?, centro_custo_id=?, regularizacao_pendente=0 WHERE id=?`,
        [os_id || null, projeto_id || null, centro_custo_id || null, req.params.id]);
      const { registrarAuditoria } = require('../../services/almoxarifado/audit');
      await registrarAuditoria(db, {
        entidade: 'movimentacao', entidade_id: mov.id, acao: 'REGULARIZACAO',
        usuario_id: req.user.id, usuario_nome: req.user.nome || req.user.email,
        dados_novos: { os_id, projeto_id, centro_custo_id },
      });
      res.json({ success: true });
    } catch (e) { handleError(res, e); }
  });
```

- [ ] **Step 4: Rodar e ver passar** + regressão completa (atenção: `movimentacoes.api.test.js` da Etapa 0 deve continuar 13/13 — a compat da SAIDA avulsa com motivo está garantida pela regra 'qualquer').
- [ ] **Step 5: Commit** — `Almoxarifado: regra critica de vinculo por tipo + saida emergencial com regularizacao`

---

### Task 3: Atomicidade do saldo (fecha a janela de concorrência)

**Files:**
- Modify: `server/services/almoxarifado/stockService.js:204-223` (UPDATE condicional)
- Test: `server/tests/api/concorrencia.api.test.js`

**Interfaces:**
- Produces: para tipos de saída, o decremento do saldo é um único UPDATE condicional; `changes === 0` ⇒ erro 400 "Saldo insuficiente". `saldo_posterior` passa a ser relido após o UPDATE (não calculado da leitura antiga). Entradas seguem incremento simples (`quantidade_atual = quantidade_atual + ?`).

- [ ] **Step 1: Escrever o teste**

Criar `server/tests/api/concorrencia.api.test.js` (runner padrão + `criarMaterial` como na Task 2):

```js
  const { app, db, close } = await createTestApp();

  await test('duas saidas concorrentes de 60 com saldo 100: exatamente uma falha', async () => {
    const mat = await criarMaterial(db, 'CONC-001', 100);
    const payload = { material_id: mat, tipo: 'SAIDA', quantidade: 60, justificativa: 'corrida' };
    const [a, b] = await Promise.all([
      request(app).post('/api/almoxarifado/movimentacoes/v2').send(payload),
      request(app).post('/api/almoxarifado/movimentacoes/v2').send(payload),
    ]);
    const sucessos = [a, b].filter((r) => r.status === 201).length;
    assert.strictEqual(sucessos, 1, `esperado 1 sucesso, houve ${sucessos} (${a.status}/${b.status})`);
    const m = await dbGet(db, 'SELECT quantidade_atual FROM materiais_almoxarifado WHERE id = ?', [mat]);
    assert.strictEqual(m.quantidade_atual, 40);
  });

  await test('10 saidas concorrentes de 10 com saldo 50: 5 sucessos e saldo final 0', async () => {
    const mat = await criarMaterial(db, 'CONC-002', 50);
    const reqs = Array.from({ length: 10 }, () =>
      request(app).post('/api/almoxarifado/movimentacoes/v2')
        .send({ material_id: mat, tipo: 'SAIDA', quantidade: 10, justificativa: 'corrida' }));
    const results = await Promise.all(reqs);
    const sucessos = results.filter((r) => r.status === 201).length;
    assert.strictEqual(sucessos, 5, `esperado 5 sucessos, houve ${sucessos}`);
    const m = await dbGet(db, 'SELECT quantidade_atual FROM materiais_almoxarifado WHERE id = ?', [mat]);
    assert.strictEqual(m.quantidade_atual, 0);
  });

  await test('entradas concorrentes somam corretamente', async () => {
    const mat = await criarMaterial(db, 'CONC-003', 0);
    const reqs = Array.from({ length: 8 }, () =>
      request(app).post('/api/almoxarifado/movimentacoes/v2')
        .send({ material_id: mat, tipo: 'ENTRADA', quantidade: 5 }));
    const results = await Promise.all(reqs);
    assert.ok(results.every((r) => r.status === 201));
    const m = await dbGet(db, 'SELECT quantidade_atual FROM materiais_almoxarifado WHERE id = ?', [mat]);
    assert.strictEqual(m.quantidade_atual, 40);
  });
```

- [ ] **Step 2: Rodar e ver falhar** — Expected: com o read-then-write atual, os dois primeiros testes tendem a aceitar movimentações demais (saldo negativo/duplo sucesso). Se por serialização do sqlite os testes passarem de primeira, aumentar a janela: inserir os requests com `Promise.all` está correto; validar então com 20 requisições no segundo teste. NÃO marcar GREEN sem ter visto pelo menos um FAIL do comportamento antigo.

- [ ] **Step 3: Implementar**

Em `registrarMovimentacao`, substituir o UPDATE incondicional de saída (`:208-209`) por lógica por classe de tipo:

```js
  if (!['TRANSFERENCIA', 'BLOQUEIO', 'DESBLOQUEIO', 'RESERVA', 'LIBERACAO_RESERVA'].includes(tipo)) {
    if (tiposSaida.includes(tipo)) {
      // Decremento atômico: só aplica se o disponível comportar (ou se negativo for permitido)
      const upd = await dbRun(db, `UPDATE materiais_almoxarifado
        SET quantidade_atual = quantidade_atual - ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND (? = 1 OR (quantidade_atual - COALESCE(quantidade_reservada,0) - COALESCE(quantidade_bloqueada,0) - COALESCE(quantidade_em_inspecao,0)) >= ?)`,
        [quantidade, material_id, permiteNegativo ? 1 : 0, quantidade]);
      if (!upd.changes) {
        throw Object.assign(new Error(`Saldo insuficiente. Disponível: ${await getSaldoDisponivel(material)} ${material.unidade}`), { status: 400 });
      }
    } else if (tiposEntrada.includes(tipo)) {
      await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_atual = quantidade_atual + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [quantidade, material_id]);
    } else { // AJUSTE — define valor absoluto (last-writer-wins é aceitável para ajuste)
      await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_atual = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [saldoPosterior, material_id]);
    }
    const atual = await dbGet(db, 'SELECT quantidade_atual FROM materiais_almoxarifado WHERE id = ?', [material_id]);
    saldoPosterior = atual.quantidade_atual;
    // saldo_anterior derivado do valor real pós-update:
    // entrada: anterior = posterior - qtd; saída: anterior = posterior + qtd; ajuste: manter leitura inicial
    if (tiposEntrada.includes(tipo)) saldoAnterior2 = saldoPosterior - parseFloat(quantidade);
    else if (tiposSaida.includes(tipo)) saldoAnterior2 = saldoPosterior + parseFloat(quantidade);
    else saldoAnterior2 = saldoAnterior;
    // usar saldoAnterior2 no INSERT (renomear conforme o código real — objetivo: o par gravado
    // no livro deve refletir o efeito REAL aplicado, não a leitura pré-corrida)
    ...
  }
```

Nota de implementação: o esqueleto acima mostra a intenção — na implementação real, declarar `let saldoAnteriorReal` antes do bloco e usá-lo no INSERT no lugar de `saldoAnterior` para entrada/saída (o encadeamento do livro sob concorrência é validado pelo teste existente `livro registra saldo_anterior/saldo_posterior encadeados`). A pré-validação `disponivel < quantidade` de `:161-163` PERMANECE (mensagem de erro amigável no caminho não-concorrente); o UPDATE condicional é a defesa final. A checagem pós-hoc `saldoPosterior < 0` de `:205-207` pode ser removida para os tipos cobertos pelo UPDATE condicional.

- [ ] **Step 4: Rodar e ver passar** + regressão completa (incl. `movimentacoes.api.test.js` — encadeamento do livro).
- [ ] **Step 5: Commit** — `Almoxarifado: saldo atomico sob concorrencia (UPDATE condicional no motor)`

---

### Task 4: Estorno correto

**Files:**
- Modify: `server/services/almoxarifado/schema.js` (adicionar `'ESTORNO'` a `TIPOS_MOVIMENTO`, linha 38-43)
- Modify: `server/services/almoxarifado/stockService.js:256-292` (reescrever `cancelarMovimentacao`)
- Modify: `server/routes/almoxarifado/extended.js` (validate no body do cancelar: `z.object({ motivo: z.string().min(1, 'motivo é obrigatório') })` — inline ou em schemas.js como `CancelamentoSchema`)
- Test: `server/tests/api/estorno.api.test.js`

**Interfaces:**
- Consumes: atomicidade da Task 3.
- Produces: `cancelarMovimentacao(db, user, movimentoId, motivo)` → `{ success: true, estorno_id }`; efeito inverso real (incl. localizações); movimento novo tipo `ESTORNO` com `quantidade = quantidade original` e `documento_vinculado = 'ESTORNO-<idOriginal>'`; original com `cancelado=1, movimento_estorno_id`. Recusa: mov inexistente (404), já cancelado (400), tipo `ESTORNO` (400), tipos `RESERVA`/`LIBERACAO_RESERVA` (400 — usar liberação de reserva).

- [ ] **Step 1: Escrever os testes**

Criar `server/tests/api/estorno.api.test.js` (runner + criarMaterial; criar também uma localização para o caso de transferência):

```js
  const { app, db, close } = await createTestApp();

  await test('estorno de ENTRADA baixa o saldo e vincula os movimentos', async () => {
    const mat = await criarMaterial(db, 'EST-001', 100);
    const ent = await request(app).post('/api/almoxarifado/movimentacoes/v2')
      .send({ material_id: mat, tipo: 'ENTRADA', quantidade: 50 });
    const est = await request(app).post(`/api/almoxarifado/movimentacoes/${ent.body.id}/cancelar`)
      .send({ motivo: 'Lançamento errado' });
    assert.strictEqual(est.status, 200, JSON.stringify(est.body));
    const m = await dbGet(db, 'SELECT quantidade_atual FROM materiais_almoxarifado WHERE id = ?', [mat]);
    assert.strictEqual(m.quantidade_atual, 100);
    const orig = await dbGet(db, 'SELECT cancelado, movimento_estorno_id FROM movimentacoes_almoxarifado WHERE id = ?', [ent.body.id]);
    assert.strictEqual(orig.cancelado, 1);
    const estMov = await dbGet(db, 'SELECT tipo, quantidade FROM movimentacoes_almoxarifado WHERE id = ?', [orig.movimento_estorno_id]);
    assert.strictEqual(estMov.tipo, 'ESTORNO');
    assert.strictEqual(estMov.quantidade, 50);
  });

  await test('estorno de SAIDA devolve o saldo', async () => {
    const mat = await criarMaterial(db, 'EST-002', 100);
    const sai = await request(app).post('/api/almoxarifado/movimentacoes/v2')
      .send({ material_id: mat, tipo: 'SAIDA', quantidade: 30, justificativa: 'x' });
    await request(app).post(`/api/almoxarifado/movimentacoes/${sai.body.id}/cancelar`).send({ motivo: 'devolver' });
    const m = await dbGet(db, 'SELECT quantidade_atual FROM materiais_almoxarifado WHERE id = ?', [mat]);
    assert.strictEqual(m.quantidade_atual, 100);
  });

  await test('estorno de AJUSTE restaura o saldo anterior', async () => {
    const mat = await criarMaterial(db, 'EST-003', 80);
    const aj = await request(app).post('/api/almoxarifado/movimentacoes/v2')
      .send({ material_id: mat, tipo: 'AJUSTE', quantidade: 55, justificativa: 'inventário' });
    await request(app).post(`/api/almoxarifado/movimentacoes/${aj.body.id}/cancelar`).send({ motivo: 'inventário errado' });
    const m = await dbGet(db, 'SELECT quantidade_atual FROM materiais_almoxarifado WHERE id = ?', [mat]);
    assert.strictEqual(m.quantidade_atual, 80);
  });

  await test('estorno de TRANSFERENCIA devolve o saldo para a origem', async () => {
    const locA = (await dbRun(db, `INSERT INTO localizacoes_almoxarifado (codigo, descricao) VALUES ('EST-A','A')`)).lastID;
    const locB = (await dbRun(db, `INSERT INTO localizacoes_almoxarifado (codigo, descricao) VALUES ('EST-B','B')`)).lastID;
    const mat = await criarMaterial(db, 'EST-004', 40);
    await dbRun(db, `INSERT INTO estoque_saldo_almoxarifado (material_id, localizacao_id, quantidade) VALUES (?,?,40)`, [mat, locA]);
    const tr = await request(app).post('/api/almoxarifado/transferencias')
      .send({ material_id: mat, quantidade: 15, localizacao_origem_id: locA, localizacao_destino_id: locB });
    assert.strictEqual(tr.status, 201, JSON.stringify(tr.body));
    await request(app).post(`/api/almoxarifado/movimentacoes/${tr.body.id}/cancelar`).send({ motivo: 'voltar' });
    const sa = await dbGet(db, 'SELECT quantidade FROM estoque_saldo_almoxarifado WHERE material_id=? AND localizacao_id=?', [mat, locA]);
    const sb = await dbGet(db, 'SELECT quantidade FROM estoque_saldo_almoxarifado WHERE material_id=? AND localizacao_id=?', [mat, locB]);
    assert.strictEqual(sa.quantidade, 40);
    assert.strictEqual(sb.quantidade, 0);
  });

  await test('estorno duplo falha; estornar um ESTORNO falha; sem motivo falha', async () => {
    const mat = await criarMaterial(db, 'EST-005', 10);
    const ent = await request(app).post('/api/almoxarifado/movimentacoes/v2')
      .send({ material_id: mat, tipo: 'ENTRADA', quantidade: 5 });
    const semMotivo = await request(app).post(`/api/almoxarifado/movimentacoes/${ent.body.id}/cancelar`).send({});
    assert.strictEqual(semMotivo.status, 400);
    const ok = await request(app).post(`/api/almoxarifado/movimentacoes/${ent.body.id}/cancelar`).send({ motivo: 'x' });
    assert.strictEqual(ok.status, 200);
    const duplo = await request(app).post(`/api/almoxarifado/movimentacoes/${ent.body.id}/cancelar`).send({ motivo: 'de novo' });
    assert.strictEqual(duplo.status, 400);
    const doEstorno = await request(app).post(`/api/almoxarifado/movimentacoes/${ok.body.estorno_id}/cancelar`).send({ motivo: 'estorno do estorno' });
    assert.strictEqual(doEstorno.status, 400);
  });

  await test('estorno de entrada ja consumida falha com saldo insuficiente', async () => {
    const mat = await criarMaterial(db, 'EST-006', 0);
    const ent = await request(app).post('/api/almoxarifado/movimentacoes/v2')
      .send({ material_id: mat, tipo: 'ENTRADA', quantidade: 20 });
    await request(app).post('/api/almoxarifado/movimentacoes/v2')
      .send({ material_id: mat, tipo: 'SAIDA', quantidade: 15, justificativa: 'consumo' });
    const est = await request(app).post(`/api/almoxarifado/movimentacoes/${ent.body.id}/cancelar`).send({ motivo: 'cancelar compra' });
    assert.strictEqual(est.status, 400, JSON.stringify(est.body));
  });
```

- [ ] **Step 2: Rodar e ver falhar** — a implementação atual falha em: quantidade do movimento de estorno (grava `novoSaldo`, não a quantidade original), tipo (AJUSTE, não ESTORNO), transferência (não reverte), entrada consumida (não valida disponível).

- [ ] **Step 3: Implementar**

Reescrever `cancelarMovimentacao` em `stockService.js`:

```js
async function cancelarMovimentacao(db, user, movimentoId, motivo) {
  if (!motivo) throw Object.assign(new Error('Justificativa obrigatória para cancelamento'), { status: 400 });
  const mov = await dbGet(db, 'SELECT * FROM movimentacoes_almoxarifado WHERE id = ?', [movimentoId]);
  if (!mov) throw Object.assign(new Error('Movimentação não encontrada'), { status: 404 });
  if (mov.cancelado) throw Object.assign(new Error('Movimentação já cancelada'), { status: 400 });
  if (mov.tipo === 'ESTORNO') throw Object.assign(new Error('Estorno não pode ser estornado'), { status: 400 });
  if (['RESERVA', 'LIBERACAO_RESERVA'].includes(mov.tipo)) {
    throw Object.assign(new Error('Use a liberação de reserva para desfazer reservas'), { status: 400 });
  }

  const tiposEntrada = ['ENTRADA', 'ENTRADA_COMPRA', 'ENTRADA_MANUAL', 'ENTRADA_DEVOLUCAO', 'DEVOLUCAO', 'AJUSTE_POSITIVO'];
  const tiposSaida = ['SAIDA', 'SAIDA_PRODUCAO', 'SAIDA_MONTAGEM', 'SAIDA_ASSISTENCIA', 'AJUSTE_NEGATIVO', 'SUCATA', 'PERDA'];
  const material = await getMaterial(db, mov.material_id);
  const saldoAntes = material.quantidade_atual;
  let saldoDepois = saldoAntes;

  if (tiposEntrada.includes(mov.tipo)) {
    // Reverter entrada = saída com guarda de disponível (a mercadoria pode já ter sido consumida)
    const permiteNegativo = material.permite_saldo_negativo || (await getConfig(db, 'permite_saldo_negativo_global')) === '1';
    const upd = await dbRun(db, `UPDATE materiais_almoxarifado
      SET quantidade_atual = quantidade_atual - ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND (? = 1 OR (quantidade_atual - COALESCE(quantidade_reservada,0) - COALESCE(quantidade_bloqueada,0) - COALESCE(quantidade_em_inspecao,0)) >= ?)`,
      [mov.quantidade, mov.material_id, permiteNegativo ? 1 : 0, mov.quantidade]);
    if (!upd.changes) throw Object.assign(new Error('Não é possível estornar: saldo disponível insuficiente (material já consumido)'), { status: 400 });
    saldoDepois = saldoAntes - mov.quantidade;
    // reverter localização da entrada original
    const loc = mov.localizacao_destino_id || material.localizacao_padrao_id;
    if (loc) {
      const saldo = await getOrCreateSaldo(db, mov.material_id, loc, mov.lote);
      await dbRun(db, 'UPDATE estoque_saldo_almoxarifado SET quantidade = quantidade - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [mov.quantidade, saldo.id]);
    }
  } else if (tiposSaida.includes(mov.tipo)) {
    await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_atual = quantidade_atual + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [mov.quantidade, mov.material_id]);
    saldoDepois = saldoAntes + mov.quantidade;
    const loc = mov.localizacao_origem_id || material.localizacao_padrao_id;
    if (loc) {
      const saldo = await getOrCreateSaldo(db, mov.material_id, loc, mov.lote);
      await dbRun(db, 'UPDATE estoque_saldo_almoxarifado SET quantidade = quantidade + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [mov.quantidade, saldo.id]);
    }
  } else if (mov.tipo === 'AJUSTE') {
    await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_atual = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [mov.saldo_anterior, mov.material_id]);
    saldoDepois = mov.saldo_anterior;
    await syncSaldoLocalizacaoPadrao(db, mov.material_id);
  } else if (mov.tipo === 'TRANSFERENCIA') {
    const origem = await getOrCreateSaldo(db, mov.material_id, mov.localizacao_origem_id, mov.lote);
    const destino = await getOrCreateSaldo(db, mov.material_id, mov.localizacao_destino_id, mov.lote);
    if (destino.quantidade < mov.quantidade) {
      throw Object.assign(new Error('Não é possível estornar: o destino não tem mais o saldo transferido'), { status: 400 });
    }
    await dbRun(db, 'UPDATE estoque_saldo_almoxarifado SET quantidade = quantidade - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [mov.quantidade, destino.id]);
    await dbRun(db, 'UPDATE estoque_saldo_almoxarifado SET quantidade = quantidade + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [mov.quantidade, origem.id]);
  } else if (mov.tipo === 'BLOQUEIO') {
    await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_bloqueada = MAX(0, COALESCE(quantidade_bloqueada,0) - ?), updated_at = CURRENT_TIMESTAMP WHERE id = ?', [mov.quantidade, mov.material_id]);
  } else if (mov.tipo === 'DESBLOQUEIO') {
    await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_bloqueada = COALESCE(quantidade_bloqueada,0) + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [mov.quantidade, mov.material_id]);
  }

  const r = await dbRun(db, `INSERT INTO movimentacoes_almoxarifado
    (material_id, tipo, quantidade, saldo_anterior, saldo_posterior, motivo, referencia, observacoes,
     usuario_id, usuario_nome, localizacao_origem_id, localizacao_destino_id, lote, unidade,
     projeto_id, os_id, cliente_id, documento_vinculado, justificativa)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [
    mov.material_id, 'ESTORNO', mov.quantidade, saldoAntes, saldoDepois,
    `Estorno mov. #${movimentoId}`, mov.referencia, null,
    user.id, user.nome || user.email,
    mov.localizacao_destino_id, mov.localizacao_origem_id, mov.lote, mov.unidade,
    mov.projeto_id, mov.os_id, mov.cliente_id, `ESTORNO-${movimentoId}`, motivo,
  ]);

  await dbRun(db, `UPDATE movimentacoes_almoxarifado SET cancelado = 1, cancelado_por = ?, cancelado_em = CURRENT_TIMESTAMP,
    cancelamento_motivo = ?, movimento_estorno_id = ? WHERE id = ?`, [user.id, motivo, r.lastID, movimentoId]);

  await registrarAuditoria(db, {
    entidade: 'movimentacao', entidade_id: movimentoId, acao: 'CANCELAMENTO',
    usuario_id: user.id, usuario_nome: user.nome || user.email, justificativa: motivo,
    dados_novos: { estorno_id: r.lastID },
  });

  return { success: true, estorno_id: r.lastID };
}
```

Adicionar `'ESTORNO'` ao array `TIPOS_MOVIMENTO` em `schema.js:38-43`. Na rota de cancelar (`extended.js:107`), aplicar `validate(CancelamentoSchema)` com `CancelamentoSchema = z.object({ motivo: z.string().min(1, 'motivo é obrigatório') })` exportado de `schemas.js`.

- [ ] **Step 4: Rodar e ver passar** + regressão (o teste antigo de estorno em `almoxarifado.test.js` pode asserir o comportamento velho — se falhar, ATUALIZAR o teste antigo para o contrato novo e documentar no report).
- [ ] **Step 5: Commit** — `Almoxarifado: estorno correto (tipo ESTORNO, reverte localizacoes e transferencias)`

---

### Task 5: Custo médio na entrada

**Files:**
- Modify: `server/services/almoxarifado/stockService.js` (cálculo no bloco de entrada)
- Test: `server/tests/api/custoMedio.api.test.js`

**Interfaces:**
- Consumes: `custo_unitario` já aceito no `MovimentacaoSchema` (Task 2).
- Produces: entrada com `custo_unitario` informado atualiza `materiais_almoxarifado.custo_medio` (média ponderada) e `custo_unitario` (último custo). Sem custo informado, nada muda.

- [ ] **Step 1: Escrever os testes**

Criar `server/tests/api/custoMedio.api.test.js` (runner + criarMaterial com parâmetro de custo inicial 0):

```js
  await test('primeira entrada com custo define o custo medio', async () => {
    const mat = await criarMaterial(db, 'CM-001', 0);
    await request(app).post('/api/almoxarifado/movimentacoes/v2')
      .send({ material_id: mat, tipo: 'ENTRADA', quantidade: 10, custo_unitario: 20 });
    const m = await dbGet(db, 'SELECT custo_medio, custo_unitario FROM materiais_almoxarifado WHERE id = ?', [mat]);
    assert.strictEqual(m.custo_medio, 20);
    assert.strictEqual(m.custo_unitario, 20);
  });

  await test('segunda entrada pondera: (10*20 + 10*40) / 20 = 30', async () => {
    const mat = await criarMaterial(db, 'CM-002', 0);
    await request(app).post('/api/almoxarifado/movimentacoes/v2')
      .send({ material_id: mat, tipo: 'ENTRADA', quantidade: 10, custo_unitario: 20 });
    await request(app).post('/api/almoxarifado/movimentacoes/v2')
      .send({ material_id: mat, tipo: 'ENTRADA', quantidade: 10, custo_unitario: 40 });
    const m = await dbGet(db, 'SELECT custo_medio, custo_unitario FROM materiais_almoxarifado WHERE id = ?', [mat]);
    assert.strictEqual(m.custo_medio, 30);
    assert.strictEqual(m.custo_unitario, 40); // último custo
  });

  await test('entrada sem custo nao altera custo medio', async () => {
    const mat = await criarMaterial(db, 'CM-003', 0);
    await request(app).post('/api/almoxarifado/movimentacoes/v2')
      .send({ material_id: mat, tipo: 'ENTRADA', quantidade: 10, custo_unitario: 20 });
    await request(app).post('/api/almoxarifado/movimentacoes/v2')
      .send({ material_id: mat, tipo: 'ENTRADA', quantidade: 10 });
    const m = await dbGet(db, 'SELECT custo_medio FROM materiais_almoxarifado WHERE id = ?', [mat]);
    assert.strictEqual(m.custo_medio, 20);
  });

  await test('saida nao altera custo medio', async () => {
    const mat = await criarMaterial(db, 'CM-004', 0);
    await request(app).post('/api/almoxarifado/movimentacoes/v2')
      .send({ material_id: mat, tipo: 'ENTRADA', quantidade: 10, custo_unitario: 20 });
    await request(app).post('/api/almoxarifado/movimentacoes/v2')
      .send({ material_id: mat, tipo: 'SAIDA', quantidade: 5, justificativa: 'x' });
    const m = await dbGet(db, 'SELECT custo_medio FROM materiais_almoxarifado WHERE id = ?', [mat]);
    assert.strictEqual(m.custo_medio, 20);
  });

  await test('entrada com saldo anterior negativo/zero usa o custo informado', async () => {
    const mat = await criarMaterial(db, 'CM-005', 0);
    await dbRun(db, 'UPDATE materiais_almoxarifado SET custo_medio = 99 WHERE id = ?', [mat]); // custo antigo com saldo zero
    await request(app).post('/api/almoxarifado/movimentacoes/v2')
      .send({ material_id: mat, tipo: 'ENTRADA', quantidade: 10, custo_unitario: 15 });
    const m = await dbGet(db, 'SELECT custo_medio FROM materiais_almoxarifado WHERE id = ?', [mat]);
    assert.strictEqual(m.custo_medio, 15);
  });
```

- [ ] **Step 2: Rodar e ver falhar** — `custo_medio` fica 0/99 (nunca é escrito).

- [ ] **Step 3: Implementar**

Em `registrarMovimentacao`, adicionar `custo_unitario: custoInformado` ao destructuring (o Zod já validou `> 0` quando presente). Após o UPDATE de entrada (Task 3), acrescentar:

```js
    if (tiposEntrada.includes(tipo) && custoInformado > 0) {
      const custoMedioAtual = (saldoAnterior > 0 ? (material.custo_medio || material.custo_unitario || 0) : 0);
      const novoCustoMedio = saldoAnterior > 0
        ? ((saldoAnterior * custoMedioAtual) + (parseFloat(quantidade) * custoInformado)) / (saldoAnterior + parseFloat(quantidade))
        : custoInformado;
      await dbRun(db, 'UPDATE materiais_almoxarifado SET custo_medio = ?, custo_unitario = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [Math.round(novoCustoMedio * 10000) / 10000, custoInformado, material_id]);
    }
```

- [ ] **Step 4: Rodar e ver passar** + regressão.
- [ ] **Step 5: Commit** — `Almoxarifado: custo medio ponderado calculado na entrada`

---

### Task 6: AJUSTE por localização + syncMaterialTotals corrigido

**Files:**
- Modify: `server/services/almoxarifado/stockService.js` (`syncMaterialTotals:24-38` e o ramo AJUSTE)
- Test: `server/tests/api/ajusteLocalizacao.api.test.js`

**Interfaces:**
- Produces: AJUSTE com `localizacao_destino_id` define o saldo daquela localização = quantidade e recalcula o total do material; `syncMaterialTotals` atualiza o material sempre que existir ao menos uma linha de saldo (mesmo com total 0).

- [ ] **Step 1: Escrever os testes**

Criar `server/tests/api/ajusteLocalizacao.api.test.js`:

```js
  await test('AJUSTE com localizacao define o saldo daquela localizacao e recalcula o total', async () => {
    const locA = (await dbRun(db, `INSERT INTO localizacoes_almoxarifado (codigo, descricao) VALUES ('AJL-A','A')`)).lastID;
    const locB = (await dbRun(db, `INSERT INTO localizacoes_almoxarifado (codigo, descricao) VALUES ('AJL-B','B')`)).lastID;
    const mat = await criarMaterial(db, 'AJL-001', 0);
    await dbRun(db, `INSERT INTO estoque_saldo_almoxarifado (material_id, localizacao_id, quantidade) VALUES (?,?,30)`, [mat, locA]);
    await dbRun(db, `INSERT INTO estoque_saldo_almoxarifado (material_id, localizacao_id, quantidade) VALUES (?,?,20)`, [mat, locB]);
    await dbRun(db, `UPDATE materiais_almoxarifado SET quantidade_atual = 50 WHERE id = ?`, [mat]);

    const res = await request(app).post('/api/almoxarifado/movimentacoes/v2')
      .send({ material_id: mat, tipo: 'AJUSTE', quantidade: 10, localizacao_destino_id: locA, justificativa: 'contagem A' });
    assert.strictEqual(res.status, 201, JSON.stringify(res.body));

    const sa = await dbGet(db, 'SELECT quantidade FROM estoque_saldo_almoxarifado WHERE material_id=? AND localizacao_id=?', [mat, locA]);
    const m = await dbGet(db, 'SELECT quantidade_atual FROM materiais_almoxarifado WHERE id=?', [mat]);
    assert.strictEqual(sa.quantidade, 10);      // só a loc A mudou
    assert.strictEqual(m.quantidade_atual, 30); // 10 (A) + 20 (B)
  });

  await test('AJUSTE de localizacao para zero propaga total zero', async () => {
    const locC = (await dbRun(db, `INSERT INTO localizacoes_almoxarifado (codigo, descricao) VALUES ('AJL-C','C')`)).lastID;
    const mat = await criarMaterial(db, 'AJL-002', 0);
    await dbRun(db, `INSERT INTO estoque_saldo_almoxarifado (material_id, localizacao_id, quantidade) VALUES (?,?,25)`, [mat, locC]);
    await dbRun(db, `UPDATE materiais_almoxarifado SET quantidade_atual = 25 WHERE id = ?`, [mat]);
    await request(app).post('/api/almoxarifado/movimentacoes/v2')
      .send({ material_id: mat, tipo: 'AJUSTE', quantidade: 0.0001, localizacao_destino_id: locC, justificativa: 'zerar' });
    // quantidade > 0 é exigido pelo schema; para zerar de fato usar o menor valor? NÃO —
    // ver Step 3: AJUSTE com localizacao aceita quantidade 0 (schema relaxado para este caso).
    assert.ok(true);
  });

  await test('AJUSTE sem localizacao mantem comportamento atual (define total)', async () => {
    const mat = await criarMaterial(db, 'AJL-003', 40);
    await request(app).post('/api/almoxarifado/movimentacoes/v2')
      .send({ material_id: mat, tipo: 'AJUSTE', quantidade: 70, justificativa: 'contagem geral' });
    const m = await dbGet(db, 'SELECT quantidade_atual FROM materiais_almoxarifado WHERE id=?', [mat]);
    assert.strictEqual(m.quantidade_atual, 70);
  });
```

Nota de design a resolver na implementação (documentar no report): zerar uma localização exige `quantidade: 0`, mas o schema global exige `> 0`. Solução: no `MovimentacaoSchema`, trocar `quantidade: z.number().gt(0)` por `z.number().min(0)` **com refinamento**: `quantidade === 0` só é válido quando `tipo === 'AJUSTE' && localizacao_destino_id` presente (usar `.superRefine`). Ajustar o segundo teste para `quantidade: 0` e asserir `sa.quantidade === 0` e `m.quantidade_atual === 0` de verdade.

- [ ] **Step 2: Rodar e ver falhar.**

- [ ] **Step 3: Implementar**

Em `syncMaterialTotals` (`:24-38`): trocar a condição `if (saldos && saldos.total > 0)` por contagem de linhas:

```js
  const linhas = await dbGet(db, 'SELECT COUNT(*) as n FROM estoque_saldo_almoxarifado WHERE material_id = ?', [materialId]);
  if (linhas && linhas.n > 0) { /* UPDATE igual ao atual, mesmo com total 0 */ }
```

No ramo `tiposAjuste` de `registrarMovimentacao`: se `localizacao_destino_id` presente:

```js
    } else if (tiposAjuste.includes(tipo) && localizacao_destino_id) {
      const saldo = await getOrCreateSaldo(db, material_id, localizacao_destino_id, lote);
      await dbRun(db, 'UPDATE estoque_saldo_almoxarifado SET quantidade = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [parseFloat(quantidade), saldo.id]);
      await syncMaterialTotals(db, material_id);
      const atual = await dbGet(db, 'SELECT quantidade_atual FROM materiais_almoxarifado WHERE id = ?', [material_id]);
      saldoPosterior = atual.quantidade_atual;
    }
```

(sem localização: ramo atual — define total + `syncSaldoLocalizacaoPadrao`). Ajustar o `MovimentacaoSchema` com o `.superRefine` descrito acima.

- [ ] **Step 4: Rodar e ver passar** + regressão (atenção ao teste de AJUSTE da Etapa 0 e ao de paridade de localização — devem continuar verdes).
- [ ] **Step 5: Commit** — `Almoxarifado: AJUSTE por localizacao com recalculo do total do material`

---

### Task 7: Livro com filtros + extrato do item + aux de OS

**Files:**
- Modify: `server/routes/almoxarifado.js:476-499` (filtros novos no GET)
- Modify: `server/routes/almoxarifado/extended.js` (rota extrato + aux OS)
- Test: `server/tests/api/livroExtrato.api.test.js`

**Interfaces:**
- Produces: `GET /api/almoxarifado/movimentacoes` ganha filtros `os_id`, `projeto_id`, `centro_custo_id`, `usuario_id`, `pendentes_regularizacao=1` (mantendo os atuais) e passa a devolver também `centro_custo_codigo/nome` (LEFT JOIN); `GET /api/almoxarifado/materiais/:id/extrato` → `{ material: {..., quantidade_disponivel}, saldos_localizacao: [...], movimentacoes: [...últimas 100], reservas: [...ativas] }`; `GET /api/almoxarifado/aux/ordens-servico` → `[{ id, numero_os, status, cliente_nome }]` (sem gate do módulo operacional — padrão recebimentos-aux).

- [ ] **Step 1: Escrever os testes**

Criar `server/tests/api/livroExtrato.api.test.js`:

```js
  await test('filtro por projeto retorna apenas movimentos do projeto', async () => {
    const mat = await criarMaterial(db, 'LIV-001', 100);
    await request(app).post('/api/almoxarifado/movimentacoes/v2')
      .send({ material_id: mat, tipo: 'SAIDA', quantidade: 5, projeto_id: 77, justificativa: 'p77' });
    await request(app).post('/api/almoxarifado/movimentacoes/v2')
      .send({ material_id: mat, tipo: 'SAIDA', quantidade: 3, justificativa: 'sem projeto' });
    const res = await request(app).get('/api/almoxarifado/movimentacoes?projeto_id=77');
    assert.strictEqual(res.status, 200);
    assert.ok(res.body.length >= 1);
    assert.ok(res.body.every((m) => m.projeto_id === 77));
  });

  await test('filtro pendentes_regularizacao', async () => {
    const mat = await criarMaterial(db, 'LIV-002', 50);
    await request(app).post('/api/almoxarifado/movimentacoes/v2')
      .send({ material_id: mat, tipo: 'SAIDA_PRODUCAO', quantidade: 2, emergencial: true, justificativa: 'urgente' });
    const res = await request(app).get('/api/almoxarifado/movimentacoes?pendentes_regularizacao=1');
    assert.ok(res.body.length >= 1);
    assert.ok(res.body.every((m) => m.regularizacao_pendente === 1));
  });

  await test('extrato do item agrega saldos, movimentacoes e reservas', async () => {
    const mat = await criarMaterial(db, 'LIV-003', 100);
    await request(app).post('/api/almoxarifado/movimentacoes/v2')
      .send({ material_id: mat, tipo: 'SAIDA', quantidade: 10, justificativa: 'x' });
    await request(app).post('/api/almoxarifado/reservas')
      .send({ material_id: mat, quantidade: 20, os_referencia: 'OS-EXTRATO' });
    const res = await request(app).get(`/api/almoxarifado/materiais/${mat}/extrato`);
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.strictEqual(res.body.material.id, mat);
    assert.strictEqual(res.body.material.quantidade_disponivel, 70); // 90 físico − 20 reservado
    assert.ok(Array.isArray(res.body.movimentacoes) && res.body.movimentacoes.length >= 2); // saída + reserva
    assert.ok(Array.isArray(res.body.reservas) && res.body.reservas.length === 1);
    assert.ok(Array.isArray(res.body.saldos_localizacao));
  });

  await test('extrato de material inexistente retorna 404', async () => {
    const res = await request(app).get('/api/almoxarifado/materiais/999999/extrato');
    assert.strictEqual(res.status, 404);
  });

  await test('aux de ordens de servico responde lista', async () => {
    await dbRun(db, `CREATE TABLE IF NOT EXISTS ordens_servico (id INTEGER PRIMARY KEY, numero_os TEXT, status TEXT, cliente_id INTEGER)`);
    await dbRun(db, `INSERT INTO ordens_servico (numero_os, status) VALUES ('OS-0001','ABERTA')`);
    const res = await request(app).get('/api/almoxarifado/aux/ordens-servico');
    assert.strictEqual(res.status, 200);
    assert.ok(res.body.some((o) => o.numero_os === 'OS-0001'));
  });
```

Nota: `ordens_servico` e `clientes` pertencem ao core (`index.js`), não ao `initSchema` do almoxarifado — o teste cria a tabela mínima antes (padrão já usado em `almoxarifado.test.js` com `clientes`). A rota aux deve tolerar a ausência da tabela em ambientes parciais (try/catch devolvendo `[]`).

- [ ] **Step 2: Rodar e ver falhar.**

- [ ] **Step 3: Implementar**

No GET do livro (`routes/almoxarifado.js:476`): adicionar aos filtros existentes:

```js
    if (os_id) { sql += ` AND m.os_id = ?`; params.push(os_id); }
    if (projeto_id) { sql += ` AND m.projeto_id = ?`; params.push(projeto_id); }
    if (centro_custo_id) { sql += ` AND m.centro_custo_id = ?`; params.push(centro_custo_id); }
    if (usuario_id) { sql += ` AND m.usuario_id = ?`; params.push(usuario_id); }
    if (pendentes_regularizacao === '1') { sql += ` AND m.regularizacao_pendente = 1`; }
```

e trocar o SELECT para incluir `LEFT JOIN centros_custo_almoxarifado cc ON m.centro_custo_id = cc.id` com `cc.codigo as centro_custo_codigo, cc.nome as centro_custo_nome` (destructuring do `req.query` atualizado).

Em `extended.js`:

```js
  app.get('/api/almoxarifado/materiais/:id/extrato', auth, async (req, res) => {
    try {
      const material = await dbGet(db, `SELECT m.*,
        (m.quantidade_atual - COALESCE(m.quantidade_reservada,0) - COALESCE(m.quantidade_bloqueada,0) - COALESCE(m.quantidade_em_inspecao,0)) as quantidade_disponivel
        FROM materiais_almoxarifado m WHERE m.id = ?`, [req.params.id]);
      if (!material) return res.status(404).json({ error: 'Material não encontrado' });
      const [saldos, movimentacoes, reservas] = await Promise.all([
        stockService.consultarSaldosPorLocalizacao(db, req.params.id),
        dbAll(db, `SELECT m.*, cc.codigo as centro_custo_codigo FROM movimentacoes_almoxarifado m
          LEFT JOIN centros_custo_almoxarifado cc ON m.centro_custo_id = cc.id
          WHERE m.material_id = ? ORDER BY m.id DESC LIMIT 100`, [req.params.id]),
        dbAll(db, `SELECT * FROM reservas_material_almoxarifado WHERE material_id = ? AND status = 'ATIVA' ORDER BY created_at DESC`, [req.params.id]),
      ]);
      res.json({ material, saldos_localizacao: saldos, movimentacoes, reservas });
    } catch (e) { handleError(res, e); }
  });

  app.get('/api/almoxarifado/aux/ordens-servico', auth, async (req, res) => {
    try {
      const rows = await dbAll(db, `SELECT os.id, os.numero_os, os.status, c.razao_social as cliente_nome
        FROM ordens_servico os LEFT JOIN clientes c ON os.cliente_id = c.id
        ORDER BY os.id DESC LIMIT 300`);
      res.json(rows);
    } catch (e) { res.json([]); } // tabela pode não existir em ambiente parcial
  });
```

- [ ] **Step 4: Rodar e ver passar** + regressão.
- [ ] **Step 5: Commit** — `Almoxarifado: livro com filtros por vinculo, extrato do item e aux de OS`

---

### Task 8: Front — formulário de movimentação rico (v2)

**Files:**
- Modify: `client/src/components/almoxarifado/MovimentacoesAlmoxarifado.js`

**Interfaces:**
- Consumes: `POST /almoxarifado/movimentacoes/v2` (payload da Task 2, incl. `custo_unitario`, `emergencial`), `GET /almoxarifado/centros-custo`, `GET /almoxarifado/aux/ordens-servico`, `GET /api/projetos` (via `api.get('/projetos')`), `GET /almoxarifado/localizacoes` (rota existente do CRUD de localizações).
- Produces: form com seção "Vínculo" e comportamento descrito abaixo. Sem testes automatizados de UI (não há runner de componente no projeto) — validação é o teste manual do Step 3 + revisão.

- [ ] **Step 1: Implementar o form**

Mudanças em `MovimentacoesAlmoxarifado.js` (manter padrões visuais `almox-*` existentes):
1. Estado do form ganha: `os_id`, `projeto_id`, `centro_custo_id`, `localizacao_origem_id`, `localizacao_destino_id`, `lote`, `custo_unitario`, `emergencial` (bool).
2. `useEffect` inicial também carrega: `api.get('/almoxarifado/centros-custo')`, `api.get('/almoxarifado/aux/ordens-servico')`, `api.get('/projetos')` (com `.catch(() => [])` — projetos podem estar vazios), `api.get('/almoxarifado/localizacoes')`.
3. Modal, nova seção **Vínculo** (abaixo de Motivo): selects OS (`numero_os — cliente_nome`), Projeto (`nome`), Centro de custo (`codigo — nome`) — todos opcionais com opção vazia "—".
4. Campos condicionais: ENTRADA → select "Localização de destino" + input "Custo unitário (R$)" (number, step 0.01, opcional); SAIDA → select "Localização de origem"; ambos → input "Lote" (texto opcional).
5. Checkbox "Saída emergencial (regularizar depois)" visível quando tipo = SAIDA; quando marcado, hint amarelo "Será exigida justificativa; a movimentação ficará pendente de regularização".
6. `handleSubmit` monta o payload v2: converte ids para `Number` quando preenchidos, `custo_unitario: parseFloat || undefined`, `justificativa: form.motivo || undefined`, e envia `api.post('/almoxarifado/movimentacoes/v2', payload)`. Manter o toast de erro exibindo `err.response?.data?.error`.
7. Tabela do livro: coluna "Vínculo" mostrando `OS #os_id` / projeto / `centro_custo_codigo` quando presentes (substituindo o 📋 referencia quando houver vínculo estruturado); badge âmbar "PENDENTE REGULARIZAÇÃO" quando `regularizacao_pendente === 1`.
8. `TIPOS` do filtro ganham `{ value: 'ESTORNO', label: 'Estorno', cls: 'ajuste' }` (só no filtro/na exibição — não no select do form).

- [ ] **Step 2: Regressão de servidor** — `cd server && npm run test:api && npm run test:almoxarifado` (nada de servidor mudou; garante branch são).

- [ ] **Step 3: Teste manual guiado** (relatar resultado no report): subir `npm run dev`; criar entrada com custo + localização; criar saída com centro de custo; tentar saída sem nenhum vínculo/motivo (erro do servidor exibido no toast); saída emergencial (badge pendente aparece no livro).

- [ ] **Step 4: Commit** — `Almoxarifado: form de movimentacao rico na v2 (vinculos, localizacao, lote, custo, emergencial)`

---

### Task 9: Front — estorno + extrato do item + atualização das specs

**Files:**
- Modify: `client/src/components/almoxarifado/MovimentacoesAlmoxarifado.js` (ação de estorno + badges)
- Create: `client/src/components/almoxarifado/ExtratoMaterialModal.js`
- Modify: `client/src/components/almoxarifado/MateriaisAlmoxarifado.js` (botão "Extrato" no material)
- Modify: `specs/modulo-almoxarifado/03-motor-estoque/README.md` + `specs/modulo-almoxarifado/README.md` (checkboxes/status)

**Interfaces:**
- Consumes: `POST /almoxarifado/movimentacoes/:id/cancelar` (body `{ motivo }`), `GET /almoxarifado/materiais/:id/extrato` (shape da Task 7).

- [ ] **Step 1: Estorno no livro**

Em `MovimentacoesAlmoxarifado.js`: coluna de ações com botão "Estornar" por linha quando `!m.cancelado && m.tipo !== 'ESTORNO' && !['RESERVA','LIBERACAO_RESERVA'].includes(m.tipo)`; abre mini-modal (padrão `almox-modal`) com textarea de motivo obrigatório; confirma → `api.post(`/almoxarifado/movimentacoes/${m.id}/cancelar`, { motivo })`, toast de sucesso/erro, recarrega a lista. Linha cancelada: opacidade reduzida + badge "ESTORNADA"; linha tipo ESTORNO: badge própria. (O servidor nega para quem não tem perfil `ajustar_estoque` — exibir o erro do servidor no toast; não esconder o botão por perfil nesta etapa.)

- [ ] **Step 2: Extrato do item**

Criar `ExtratoMaterialModal.js` (recebe `materialId`, `onClose`): busca `GET /almoxarifado/materiais/:id/extrato`; exibe: cartões físico/reservado/bloqueado/em inspeção/**disponível**; custo médio; tabela de saldos por localização; últimas movimentações (com badges de tipo/estorno); reservas ativas. Botão "Extrato" em `MateriaisAlmoxarifado.js` (na linha/card do material) e link no nome do material no livro.

- [ ] **Step 3: Teste manual guiado** (report): estornar uma entrada e conferir saldo/badges; abrir extrato de material com reserva e conferir o disponível.

- [ ] **Step 4: Atualizar specs**

Em `specs/modulo-almoxarifado/03-motor-estoque/README.md`: marcar `[x]` nos itens entregues (regra crítica, emergencial, saldo negativo/atomicidade, centro de custo, custo médio, livro com filtros, histórico do item, form v2, estorno com motivo, extrato) e atualizar a data; anotar o que ficou de fora (validações de vencido/reprovado → feature 10). Em `specs/modulo-almoxarifado/README.md`: linha da feature 03 → status refletindo a entrega; marcar os critérios de aceite atendidos.

- [ ] **Step 5: Regressão final completa** — `cd server && npm run test:api && npm run test:almoxarifado && npm run test:validation && npm run test:safealter`.

- [ ] **Step 6: Commit** — `Almoxarifado: estorno e extrato do item no front + atualizacao das specs da etapa 1`

---

## Self-Review (feito na escrita)

1. **Cobertura da spec 03-motor-estoque:** regra crítica ✓(T2) · emergencial ✓(T2) · bloqueado/quarentena na saída ✓(já no motor, testes T3/regressão; vencido/reprovado → feature 10, registrado T9) · permite_saldo_negativo ✓(T3 usa a flag na guarda) · centro de custo ✓(T1) · custo médio ✓(T5) · livro com filtros ✓(T7) · histórico do item ✓(T7) · form v2 ✓(T8) · estorno + tela ✓(T4/T9) · extrato ✓(T9) · concorrência ✓(T3) · AJUSTE por localização ✓(T6).
2. **Placeholders:** os dois esqueletos marcados com "Nota de implementação" (T1 último teste; T3 renomeação de variável; T6 superRefine) são instruções concretas de ajuste, não TBDs — o implementador tem o contrato exato.
3. **Consistência de nomes:** `avaliarRegrasVinculo`/`REGRAS_VINCULO` (T2) · `MovimentacaoSchema`/`RegularizacaoSchema`/`CancelamentoSchema`/`CentroCustoSchema` em `schemas.js` (T1/T2/T4) · rotas `/centros-custo`, `/movimentacoes/:id/regularizar`, `/materiais/:id/extrato`, `/aux/ordens-servico` usadas identicamente em T7/T8/T9.
4. **Riscos de regressão mapeados:** teste antigo de estorno em `almoxarifado.test.js` pode asserir contrato velho (T4 Step 4 instrui atualizar); testes da Etapa 0 (13 de movimentações) devem permanecer verdes em TODAS as tasks.
