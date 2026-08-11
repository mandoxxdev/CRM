# Almoxarifado Etapa 6b — Números de Série: plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** acender a flag `controle_serie` — material com a flag exige 1 número de série por unidade na entrada e na saída, com rastreabilidade por unidade e invariante `COUNT(séries presentes) == quantidade_atual` coberto por teste.

**Architecture:** tabela `series_almoxarifado` (1 linha = 1 unidade; SEM `serie_id` na tabela de saldo) + `seriesService` dono único da tabela (molde: `lotService`) + enforcement no motor (`stockService.registrarMovimentacao`) com o mesmo alcance e as mesmas isenções declaradas do `controle_lote`. Design aprovado: `docs/superpowers/specs/2026-08-11-almoxarifado-etapa6b-series-design.md`.

**Tech Stack:** Express + sqlite3 (sem transações — compensação explícita é o idioma do motor), Zod via `validate(schema)`, testes de API com supertest + harness `server/tests/helpers/testApp.js` (runner artesanal: `test()`, contador, `process.exit`), React CRA com testes `createRoot` + mocks (sem @testing-library).

## Global Constraints

- Commits em português, corpo **sem acento**, explicando o porquê; um commit por assunto.
- Chave não declarada no schema Zod é **descartada em silêncio** (`validation.js` troca `req.body` pelo parsed) — todo campo novo de API precisa entrar no schema correspondente.
- O motor não tem transações: todo efeito multi-passo segue o padrão claim-no-WHERE + compensação explícita (modelo: `claimSaldoDoLote` e sua compensação em `stockService`).
- `seriesService` é o **único** escritor de `series_almoxarifado`. Toda mutação audita com `entidade: 'serie'` via `registrarAuditoria` (mesmos campos do `lotService`).
- Permissões: **nenhuma ação nova** em `ACAO_PERFIS` — `visualizar` lê, `movimentar` move, `inspecionar` bloqueia/desbloqueia, `receber_material` cria via nota.
- Status de série: `EM_ESTOQUE`, `BLOQUEADA`, `ENTREGUE`, `SUCATEADA`, `ESTORNADA`. "Presente" ≡ `IN ('EM_ESTOQUE','BLOQUEADA')`; elegível para saída ≡ `= 'EM_ESTOQUE'`.
- Isenções (declaradas, não implícitas): os 4 fluxos internos (`requisitionService.js` entrega/estorno-exclusão, `returnService.js` devolução/sucata) e a transferência **não** exigem série — espelho exato do `exigeLote`.
- Teste que passa de primeira exige **controle positivo** (regra da casa — já falhou 3x no projeto).
- Suítes: `cd server && npm run test:api` · client: `cd client && CI=true npx react-scripts test --watchAll=false` e `CI=true npx react-scripts build`.

## Mapa de arquivos

| Arquivo | Papel nesta etapa |
|---|---|
| `server/services/almoxarifado/schema.js` | CREATE TABLE `series_almoxarifado` + índices; `safeAlter` de `series` no item de recebimento |
| `server/services/almoxarifado/seriesService.js` | **novo** — dono da tabela |
| `server/services/almoxarifado/stockService.js` | resolução/exigência/efeitos/compensação de série em `registrarMovimentacao` e `cancelarMovimentacao` |
| `server/services/almoxarifado/schemas.js` | `series`/`serie_ids` no `MovimentacaoSchema` |
| `server/routes/almoxarifado.js` | v1 declara `exigeSerie: true` |
| `server/routes/almoxarifado/extended.js` | v2 declara `exigeSerie: true`; rotas GET séries / PUT status |
| `server/services/almoxarifado/receiptService.js` | pré-checagem de cardinalidade; repassa séries ao motor; griffa origem |
| `server/tests/helpers/serieInvariante.js` | **novo** — helper do invariante |
| `server/tests/api/serie*.api.test.js` | 5 arquivos novos de teste (descobertos pelo runner automaticamente) |
| `client/src/components/almoxarifado/MovimentacoesAlmoxarifado.js` | textarea entrada + seletor saída + limpeza/payload |
| `client/src/components/almoxarifado/RecebimentosAlmoxarifado.js` | textarea de séries por item |
| `client/src/components/almoxarifado/LotesAlmoxarifado.js` | aba Séries + bloquear/desbloquear |
| `client/src/components/almoxarifado/MaterialAlmoxarifadoForm.js` | hint na flag |
| `client/src/components/almoxarifado/ExtratoMaterialModal.js` | KPI "Séries em estoque" |
| specs/guia/plano | fechamento de documentação (Task 12) |

---

### Task 1: Tabela + `seriesService` núcleo (leitura e entrada)

**Files:**
- Modify: `server/services/almoxarifado/schema.js` (logo após o bloco de `lotes_almoxarifado` / índice `idx_saldo_almox_chave`)
- Create: `server/services/almoxarifado/seriesService.js`
- Test: `server/tests/api/serieService.api.test.js`

**Interfaces:**
- Produces: `STATUS_SERIE`, `getSerie(db, id)`, `getSeriePorNumero(db, materialId, numero)`, `listarSeriesDoMaterial(db, materialId, { status })`, `entradaSeries(db, user, { material_id, numeros, lote_id, localizacao_id, movimentacao_id }) → afetadas[]` (cada item `{ acao: 'CRIACAO'|'REATIVACAO', anterior|null, linha }`), `desfazerEntrada(db, afetadas)`.

- [ ] **Step 1: schema — criar a tabela e os índices**

Em `schema.js`, depois do índice `idx_saldo_almox_chave` (fim do bloco de lotes):

```js
    // Etapa 6b: series_almoxarifado — registro de posse por unidade fisica (1 linha = 1
    // unidade). NAO existe serie_id em estoque_saldo_almoxarifado (decisao de design da 6b):
    // o saldo agregado continua em quantidade_atual + estoque_saldo; o invariante
    // COUNT(series presentes) == quantidade_atual e coberto por teste
    // (tests/helpers/serieInvariante.js).
    await dbRun(db, `CREATE TABLE IF NOT EXISTS series_almoxarifado (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      material_id INTEGER NOT NULL,
      numero TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'EM_ESTOQUE',
      status_motivo TEXT,
      lote_id INTEGER,
      localizacao_id INTEGER,
      recebimento_id INTEGER,
      recebimento_item_id INTEGER,
      movimentacao_entrada_id INTEGER,
      movimentacao_saida_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      created_por INTEGER,
      updated_at DATETIME,
      UNIQUE (material_id, numero),
      FOREIGN KEY (material_id) REFERENCES materiais_almoxarifado(id),
      FOREIGN KEY (lote_id) REFERENCES lotes_almoxarifado(id),
      FOREIGN KEY (localizacao_id) REFERENCES localizacoes_almoxarifado(id)
    )`);
    await dbRun(db, `CREATE INDEX IF NOT EXISTS idx_series_almox_material_status
      ON series_almoxarifado (material_id, status)`);
```

Tabela nova sem backfill → **não** usa o ledger de migração (não há série legada).

- [ ] **Step 2: teste que falha — `serieService.api.test.js`**

Molde do arquivo: `loteControleObrigatorio.api.test.js` (docstring com o porquê, `let passed/failed`, `function test(name, fn)`, IIFE com `createTestApp({ user: ADMIN })`, `close()` + `process.exit`). Fixture `novoMaterial(db, { controle_serie = 1, qtd = 0 } = {})` com INSERT direto (copiar o helper existente acrescentando a coluna `controle_serie`). Casos:

```js
test('entradaSeries cria N series EM_ESTOQUE e devolve as acoes', async () => {
  const mat = await novoMaterial(db);
  const afetadas = await seriesService.entradaSeries(db, ADMIN, {
    material_id: mat, numeros: ['SN-1', 'SN-2'],
  });
  assert.strictEqual(afetadas.length, 2);
  assert.strictEqual(afetadas[0].acao, 'CRIACAO');
  const linha = await dbGet(db, 'SELECT * FROM series_almoxarifado WHERE material_id = ? AND numero = ?', [mat, 'SN-1']);
  assert.strictEqual(linha.status, 'EM_ESTOQUE');
});

test('entrada de serie ja em estoque falha sem efeito nas demais', async () => {
  const mat = await novoMaterial(db);
  await seriesService.entradaSeries(db, ADMIN, { material_id: mat, numeros: ['SN-DUP'] });
  await assert.rejects(
    () => seriesService.entradaSeries(db, ADMIN, { material_id: mat, numeros: ['SN-NOVA', 'SN-DUP'] }),
    (e) => /ja esta em estoque/.test(e.message) && e.status === 400
  );
  // compensacao: a SN-NOVA criada antes da falha nao pode sobrar
  const sobra = await dbGet(db, 'SELECT 1 AS x FROM series_almoxarifado WHERE material_id = ? AND numero = ?', [mat, 'SN-NOVA']);
  assert.strictEqual(sobra, undefined);
});

test('numeros repetidos na propria lista falham antes de qualquer efeito', async () => {
  const mat = await novoMaterial(db);
  await assert.rejects(
    () => seriesService.entradaSeries(db, ADMIN, { material_id: mat, numeros: ['SN-X', 'SN-X'] }),
    (e) => /repetid/.test(e.message)
  );
});

test('reativacao: serie ENTREGUE volta a EM_ESTOQUE na reentrada', async () => {
  const mat = await novoMaterial(db);
  await seriesService.entradaSeries(db, ADMIN, { material_id: mat, numeros: ['SN-R'] });
  await dbRun(db, "UPDATE series_almoxarifado SET status = 'ENTREGUE' WHERE material_id = ? AND numero = ?", [mat, 'SN-R']);
  const afetadas = await seriesService.entradaSeries(db, ADMIN, { material_id: mat, numeros: ['SN-R'] });
  assert.strictEqual(afetadas[0].acao, 'REATIVACAO');
  assert.strictEqual(afetadas[0].linha.status, 'EM_ESTOQUE');
});

test('listarSeriesDoMaterial filtra por status e traz lote_codigo', async () => {
  const mat = await novoMaterial(db);
  await seriesService.entradaSeries(db, ADMIN, { material_id: mat, numeros: ['SN-L1', 'SN-L2'] });
  await dbRun(db, "UPDATE series_almoxarifado SET status = 'BLOQUEADA' WHERE material_id = ? AND numero = ?", [mat, 'SN-L2']);
  const todas = await seriesService.listarSeriesDoMaterial(db, mat);
  assert.strictEqual(todas.length, 2);
  const soEstoque = await seriesService.listarSeriesDoMaterial(db, mat, { status: 'EM_ESTOQUE' });
  assert.strictEqual(soEstoque.length, 1);
  assert.strictEqual(soEstoque[0].numero, 'SN-L1');
});

test('auditoria: criacao grava entidade=serie', async () => {
  const mat = await novoMaterial(db);
  await seriesService.entradaSeries(db, ADMIN, { material_id: mat, numeros: ['SN-A'] });
  const aud = await dbGet(db, "SELECT * FROM auditoria_log_almoxarifado WHERE entidade = 'serie' AND acao = 'CRIACAO' ORDER BY id DESC LIMIT 1");
  assert.ok(aud, 'auditoria de criacao de serie ausente');
});
```

- [ ] **Step 3: rodar e ver falhar** — `cd server && node tests/api/serieService.api.test.js`. Esperado: falha com "Cannot find module .../seriesService".

- [ ] **Step 4: implementar `seriesService.js` (parte de entrada/leitura)**

```js
/**
 * Dono unico de series_almoxarifado (Etapa 6b). Molde: lotService — guarda no WHERE,
 * justificativa obrigatoria onde ha decisao humana, auditoria com entidade='serie'.
 * Serie e 1 linha por unidade fisica: nao existe quantidade aqui. "Presente no estoque"
 * significa status EM_ESTOQUE ou BLOQUEADA; so EM_ESTOQUE e elegivel para saida.
 */
const { dbGet, dbAll, dbRun } = require('./db');
const { registrarAuditoria } = require('./audit');

const STATUS_SERIE = ['EM_ESTOQUE', 'BLOQUEADA', 'ENTREGUE', 'SUCATEADA', 'ESTORNADA'];
const STATUS_PRESENTES = ['EM_ESTOQUE', 'BLOQUEADA'];

function erro(msg, status = 400) {
  const e = new Error(msg);
  e.status = status;
  return e;
}

async function getSerie(db, id) {
  return dbGet(db, 'SELECT * FROM series_almoxarifado WHERE id = ?', [id]);
}

async function getSeriePorNumero(db, materialId, numero) {
  return dbGet(db, 'SELECT * FROM series_almoxarifado WHERE material_id = ? AND numero = ?',
    [materialId, String(numero).trim()]);
}

async function listarSeriesDoMaterial(db, materialId, { status } = {}) {
  const where = ['s.material_id = ?'];
  const params = [materialId];
  if (status) { where.push('s.status = ?'); params.push(status); }
  return dbAll(db, `
    SELECT s.*, lt.codigo AS lote_codigo, loc.nome AS localizacao_nome
      FROM series_almoxarifado s
      LEFT JOIN lotes_almoxarifado lt ON lt.id = s.lote_id
      LEFT JOIN localizacoes_almoxarifado loc ON loc.id = s.localizacao_id
     WHERE ${where.join(' AND ')}
     ORDER BY s.numero`, params);
}

/**
 * Entrada de N series. Para cada numero: nao existe -> cria EM_ESTOQUE; existe fora do
 * estoque (ENTREGUE/SUCATEADA/ESTORNADA) -> reativa com guarda no WHERE; existe presente ->
 * erro 400 (e desfaz o que esta chamada ja tinha feito — nao ha transacao, a compensacao
 * e explicita como no resto do motor).
 * Devolve afetadas[] = { acao, anterior, linha } para o chamador poder compensar depois.
 */
async function entradaSeries(db, user, { material_id, numeros, lote_id = null, localizacao_id = null, movimentacao_id = null }) {
  const lista = (numeros || []).map((n) => String(n).trim()).filter(Boolean);
  const unicos = new Set(lista);
  if (unicos.size !== lista.length) {
    throw erro('numeros de serie repetidos na lista informada');
  }
  const afetadas = [];
  for (const numero of lista) {
    const existente = await getSeriePorNumero(db, material_id, numero);
    if (!existente) {
      const linha = await dbGet(db, `
        INSERT INTO series_almoxarifado
          (material_id, numero, status, lote_id, localizacao_id, movimentacao_entrada_id, created_por)
        VALUES (?, ?, 'EM_ESTOQUE', ?, ?, ?, ?) RETURNING *`,
        [material_id, numero, lote_id, localizacao_id, movimentacao_id, user?.id || null]);
      afetadas.push({ acao: 'CRIACAO', anterior: null, linha });
      await registrarAuditoria(db, {
        entidade: 'serie', entidade_id: linha.id, acao: 'CRIACAO',
        usuario_id: user?.id, usuario_nome: user?.nome || user?.email,
        dados_novos: { numero, material_id, status: 'EM_ESTOQUE', lote_id },
      });
      continue;
    }
    if (STATUS_PRESENTES.includes(existente.status)) {
      await desfazerEntrada(db, afetadas);
      throw erro(`serie ${numero} ja esta em estoque`);
    }
    const linha = await dbGet(db, `
      UPDATE series_almoxarifado
         SET status = 'EM_ESTOQUE', status_motivo = NULL, lote_id = ?, localizacao_id = ?,
             movimentacao_entrada_id = ?, movimentacao_saida_id = NULL,
             updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND status = ? RETURNING *`,
      [lote_id, localizacao_id, movimentacao_id, existente.id, existente.status]);
    if (!linha) {
      await desfazerEntrada(db, afetadas);
      throw erro(`serie ${numero} mudou durante a operacao — tente novamente`, 409);
    }
    afetadas.push({ acao: 'REATIVACAO', anterior: existente, linha });
    await registrarAuditoria(db, {
      entidade: 'serie', entidade_id: linha.id, acao: 'REATIVACAO',
      usuario_id: user?.id, usuario_nome: user?.nome || user?.email,
      dados_anteriores: { status: existente.status },
      dados_novos: { status: 'EM_ESTOQUE', lote_id },
    });
  }
  return afetadas;
}

/** Compensacao da entradaSeries: apaga criadas, restaura reativadas. */
async function desfazerEntrada(db, afetadas) {
  for (const a of [...afetadas].reverse()) {
    if (a.acao === 'CRIACAO') {
      await dbRun(db, 'DELETE FROM series_almoxarifado WHERE id = ?', [a.linha.id]);
    } else {
      await dbRun(db, `
        UPDATE series_almoxarifado
           SET status = ?, status_motivo = ?, lote_id = ?, localizacao_id = ?,
               movimentacao_entrada_id = ?, movimentacao_saida_id = ?,
               updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [a.anterior.status, a.anterior.status_motivo, a.anterior.lote_id,
         a.anterior.localizacao_id, a.anterior.movimentacao_entrada_id,
         a.anterior.movimentacao_saida_id, a.linha.id]);
    }
  }
}

module.exports = {
  STATUS_SERIE,
  STATUS_PRESENTES,
  getSerie,
  getSeriePorNumero,
  listarSeriesDoMaterial,
  entradaSeries,
  desfazerEntrada,
};
```

- [ ] **Step 5: rodar e ver passar** — `node tests/api/serieService.api.test.js` → `6 passed, 0 failed`. Controle positivo: comentar temporariamente a checagem `STATUS_PRESENTES.includes(existente.status)` e ver o teste de duplicata falhar; restaurar.

- [ ] **Step 6: commit**

```bash
git add server/services/almoxarifado/schema.js server/services/almoxarifado/seriesService.js server/tests/api/serieService.api.test.js
git commit -m "Almoxarifado Etapa 6b: tabela series_almoxarifado e seriesService (entrada e leitura)"
```

---

### Task 2: `seriesService` — saída (claim), estorno e bloqueio

**Files:**
- Modify: `server/services/almoxarifado/seriesService.js`
- Test: `server/tests/api/serieService.api.test.js` (mesmos arquivo e runner)

**Interfaces:**
- Consumes: Task 1 (`getSerie`, `entradaSeries`).
- Produces: `claimSaidaSeries(db, user, { material_id, serie_ids, lote_id, tipo, movimentacao_id }) → claimed[]`, `desfazerSaida(db, claimed)`, `reverterSaida(db, user, movimentacaoId) → n`, `reverterEntrada(db, user, movimentacaoId) → n`, `mudarStatusSerie(db, user, serieId, novoStatus, justificativa) → linha`, `contarPresentes(db, materialId) → n`.

- [ ] **Step 1: testes que falham (acrescentar ao arquivo da Task 1)**

```js
test('claimSaidaSeries marca ENTREGUE e SUCATA marca SUCATEADA', async () => {
  const mat = await novoMaterial(db);
  const [a, b] = await seriesService.entradaSeries(db, ADMIN, { material_id: mat, numeros: ['SN-S1', 'SN-S2'] });
  const claimed = await seriesService.claimSaidaSeries(db, ADMIN, { material_id: mat, serie_ids: [a.linha.id], tipo: 'SAIDA' });
  assert.strictEqual(claimed[0].linha.status, 'ENTREGUE');
  const claimed2 = await seriesService.claimSaidaSeries(db, ADMIN, { material_id: mat, serie_ids: [b.linha.id], tipo: 'SUCATA' });
  assert.strictEqual(claimed2[0].linha.status, 'SUCATEADA');
});

test('claim de serie BLOQUEADA falha e desfaz os claims parciais', async () => {
  const mat = await novoMaterial(db);
  const [a, b] = await seriesService.entradaSeries(db, ADMIN, { material_id: mat, numeros: ['SN-B1', 'SN-B2'] });
  await dbRun(db, "UPDATE series_almoxarifado SET status = 'BLOQUEADA' WHERE id = ?", [b.linha.id]);
  await assert.rejects(
    () => seriesService.claimSaidaSeries(db, ADMIN, { material_id: mat, serie_ids: [a.linha.id, b.linha.id], tipo: 'SAIDA' }),
    (e) => /SN-B2/.test(e.message) && /BLOQUEADA/.test(e.message)
  );
  const aDepois = await seriesService.getSerie(db, a.linha.id);
  assert.strictEqual(aDepois.status, 'EM_ESTOQUE', 'claim parcial nao foi desfeito');
});

test('claim exige pertencer ao lote informado quando lote_id vem junto', async () => {
  const mat = await novoMaterial(db);
  const lote = await lotService.criarOuObterLote(db, ADMIN, { material_id: mat, codigo: 'L-1' });
  const [a] = await seriesService.entradaSeries(db, ADMIN, { material_id: mat, numeros: ['SN-LT'], lote_id: lote.id });
  await assert.rejects(
    () => seriesService.claimSaidaSeries(db, ADMIN, { material_id: mat, serie_ids: [a.linha.id], lote_id: lote.id + 999, tipo: 'SAIDA' }),
    (e) => /nao pertence ao lote/.test(e.message)
  );
});

test('reverterSaida devolve a EM_ESTOQUE; reverterEntrada marca ESTORNADA', async () => {
  const mat = await novoMaterial(db);
  const [a] = await seriesService.entradaSeries(db, ADMIN, { material_id: mat, numeros: ['SN-E1'], movimentacao_id: 777 });
  await seriesService.claimSaidaSeries(db, ADMIN, { material_id: mat, serie_ids: [a.linha.id], tipo: 'SAIDA', movimentacao_id: 888 });
  const n1 = await seriesService.reverterSaida(db, ADMIN, 888);
  assert.strictEqual(n1, 1);
  assert.strictEqual((await seriesService.getSerie(db, a.linha.id)).status, 'EM_ESTOQUE');
  const n2 = await seriesService.reverterEntrada(db, ADMIN, 777);
  assert.strictEqual(n2, 1);
  assert.strictEqual((await seriesService.getSerie(db, a.linha.id)).status, 'ESTORNADA');
});

test('mudarStatusSerie exige justificativa, so alterna EM_ESTOQUE<->BLOQUEADA e detecta corrida', async () => {
  const mat = await novoMaterial(db);
  const [a] = await seriesService.entradaSeries(db, ADMIN, { material_id: mat, numeros: ['SN-BLQ'] });
  await assert.rejects(() => seriesService.mudarStatusSerie(db, ADMIN, a.linha.id, 'BLOQUEADA', ''), /justificativa/i);
  await assert.rejects(() => seriesService.mudarStatusSerie(db, ADMIN, a.linha.id, 'ENTREGUE', 'x'), /invalido/i);
  const blq = await seriesService.mudarStatusSerie(db, ADMIN, a.linha.id, 'BLOQUEADA', 'suspeita de dano');
  assert.strictEqual(blq.status, 'BLOQUEADA');
  assert.strictEqual((await seriesService.contarPresentes(db, mat)), 2 - 0); // SN-BLQ bloqueada continua presente
});
```

(No último assert, ajuste o número esperado ao total de séries presentes criadas no próprio teste.)

- [ ] **Step 2: rodar e ver falhar** — funções inexistentes.

- [ ] **Step 3: implementar (acrescentar ao `seriesService.js` e ao `module.exports`)**

```js
/**
 * Claim atomico de saida, uma serie por vez, com a pre-condicao inteira no WHERE
 * (padrao liberarBloqueioPorCertificado do lotService). Falha em qualquer serie desfaz
 * os claims ja feitos desta chamada e nomeia a serie e o motivo.
 */
async function claimSaidaSeries(db, user, { material_id, serie_ids, lote_id = null, tipo, movimentacao_id = null }) {
  const statusDestino = ['SUCATA', 'PERDA'].includes(tipo) ? 'SUCATEADA' : 'ENTREGUE';
  const claimed = [];
  for (const id of serie_ids) {
    const linha = await dbGet(db, `
      UPDATE series_almoxarifado
         SET status = ?, movimentacao_saida_id = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND material_id = ? AND status = 'EM_ESTOQUE'
         AND (? IS NULL OR lote_id = ?)
       RETURNING *`,
      [statusDestino, movimentacao_id, id, material_id, lote_id, lote_id]);
    if (!linha) {
      await desfazerSaida(db, claimed);
      const atual = await getSerie(db, id);
      if (!atual) throw erro(`serie id ${id} nao existe`);
      if (Number(atual.material_id) !== Number(material_id)) throw erro(`serie ${atual.numero} nao pertence a este material`);
      if (lote_id != null && Number(atual.lote_id) !== Number(lote_id)) throw erro(`serie ${atual.numero} nao pertence ao lote informado`);
      throw erro(`serie ${atual.numero} nao esta disponivel (status ${atual.status})`);
    }
    claimed.push({ linha });
    await registrarAuditoria(db, {
      entidade: 'serie', entidade_id: linha.id, acao: 'SAIDA',
      usuario_id: user?.id, usuario_nome: user?.nome || user?.email,
      dados_anteriores: { status: 'EM_ESTOQUE' },
      dados_novos: { status: statusDestino, movimentacao_id },
    });
  }
  return claimed;
}

/** Compensacao do claim: enquanto EM_ESTOQUE, movimentacao_saida_id e sempre NULL. */
async function desfazerSaida(db, claimed) {
  for (const c of [...claimed].reverse()) {
    await dbRun(db, `
      UPDATE series_almoxarifado
         SET status = 'EM_ESTOQUE', movimentacao_saida_id = NULL, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`, [c.linha.id]);
  }
}

/** Estorno de saida: series daquela movimentacao voltam a EM_ESTOQUE. */
async function reverterSaida(db, user, movimentacaoId) {
  const linhas = await dbAll(db, `
    SELECT * FROM series_almoxarifado
     WHERE movimentacao_saida_id = ? AND status IN ('ENTREGUE','SUCATEADA')`, [movimentacaoId]);
  for (const s of linhas) {
    await dbRun(db, `
      UPDATE series_almoxarifado
         SET status = 'EM_ESTOQUE', movimentacao_saida_id = NULL, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND status = ?`, [s.id, s.status]);
    await registrarAuditoria(db, {
      entidade: 'serie', entidade_id: s.id, acao: 'ESTORNO_SAIDA',
      usuario_id: user?.id, usuario_nome: user?.nome || user?.email,
      dados_anteriores: { status: s.status }, dados_novos: { status: 'EM_ESTOQUE' },
    });
  }
  return linhas.length;
}

/** Estorno de entrada: series ainda EM_ESTOQUE daquela movimentacao viram ESTORNADA. */
async function reverterEntrada(db, user, movimentacaoId) {
  const linhas = await dbAll(db, `
    SELECT * FROM series_almoxarifado
     WHERE movimentacao_entrada_id = ? AND status = 'EM_ESTOQUE'`, [movimentacaoId]);
  for (const s of linhas) {
    await dbRun(db, `
      UPDATE series_almoxarifado
         SET status = 'ESTORNADA', status_motivo = 'Entrada estornada', updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND status = 'EM_ESTOQUE'`, [s.id]);
    await registrarAuditoria(db, {
      entidade: 'serie', entidade_id: s.id, acao: 'ESTORNO_ENTRADA',
      usuario_id: user?.id, usuario_nome: user?.nome || user?.email,
      dados_anteriores: { status: 'EM_ESTOQUE' }, dados_novos: { status: 'ESTORNADA' },
    });
  }
  return linhas.length;
}

/** Bloqueio/desbloqueio avulso — decisao humana: justificativa obrigatoria. */
async function mudarStatusSerie(db, user, serieId, novoStatus, justificativa) {
  if (!justificativa || !String(justificativa).trim()) {
    throw erro('justificativa e obrigatoria para mudar o status da serie');
  }
  if (!['BLOQUEADA', 'EM_ESTOQUE'].includes(novoStatus)) {
    throw erro(`status invalido para esta operacao: ${novoStatus}`);
  }
  const atual = await getSerie(db, serieId);
  if (!atual) throw erro('serie nao encontrada', 404);
  const transicaoOk = (atual.status === 'EM_ESTOQUE' && novoStatus === 'BLOQUEADA')
    || (atual.status === 'BLOQUEADA' && novoStatus === 'EM_ESTOQUE');
  if (!transicaoOk) {
    throw erro(`transicao invalida: ${atual.status} -> ${novoStatus}`);
  }
  const linha = await dbGet(db, `
    UPDATE series_almoxarifado
       SET status = ?, status_motivo = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND status = ? RETURNING *`,
    [novoStatus, String(justificativa).trim(), serieId, atual.status]);
  if (!linha) throw erro('status da serie mudou durante a operacao — recarregue', 409);
  await registrarAuditoria(db, {
    entidade: 'serie', entidade_id: linha.id, acao: 'MUDANCA_STATUS',
    usuario_id: user?.id, usuario_nome: user?.nome || user?.email,
    dados_anteriores: { status: atual.status, status_motivo: atual.status_motivo },
    dados_novos: { status: novoStatus, status_motivo: linha.status_motivo },
    justificativa: String(justificativa).trim(),
  });
  return linha;
}

async function contarPresentes(db, materialId) {
  const r = await dbGet(db, `
    SELECT COUNT(*) AS n FROM series_almoxarifado
     WHERE material_id = ? AND status IN ('EM_ESTOQUE','BLOQUEADA')`, [materialId]);
  return r.n;
}
```

Exportar tudo. `lotService` entra nos requires do teste.

- [ ] **Step 4: rodar e ver passar**; controle positivo: inverter temporariamente a condição do lote no WHERE (`lote_id != ?`) e ver o teste do lote falhar; restaurar.

- [ ] **Step 5: commit**

```bash
git add server/services/almoxarifado/seriesService.js server/tests/api/serieService.api.test.js
git commit -m "Almoxarifado Etapa 6b: claim de saida, estorno e bloqueio de series"
```

---

### Task 3: motor — exigência e efeito de ENTRADA (+ Zod + rotas v1/v2 declaram `exigeSerie`)

**Files:**
- Modify: `server/services/almoxarifado/stockService.js` (`registrarMovimentacao`)
- Modify: `server/services/almoxarifado/schemas.js` (`MovimentacaoSchema`)
- Modify: `server/routes/almoxarifado.js` (v1, bloco que já declara `exigeLote: true`)
- Modify: `server/routes/almoxarifado/extended.js` (v2, `POST /movimentacoes/v2`)
- Create: `server/tests/helpers/serieInvariante.js`
- Test: `server/tests/api/serieControleObrigatorio.api.test.js`

**Interfaces:**
- Consumes: Task 1/2 (`entradaSeries`, `desfazerEntrada`).
- Produces: `registrarMovimentacao` aceita `params.series` (entrada, strings) e `params.serie_ids` (saída, ids — efeito na Task 4) e a opção `opcoes.exigeSerie`; helper de teste `assertInvarianteSerie(db, materialId)`.

- [ ] **Step 1: helper do invariante**

```js
// server/tests/helpers/serieInvariante.js
const assert = require('assert');
const { dbGet } = require('../../services/almoxarifado/db');

/**
 * O invariante da Etapa 6b: para material com controle_serie,
 * COUNT(series presentes) == quantidade_atual. E a defesa contra a
 * quarta reencarnacao da "coluna que diverge em silencio".
 */
async function assertInvarianteSerie(db, materialId) {
  const m = await dbGet(db, 'SELECT quantidade_atual FROM materiais_almoxarifado WHERE id = ?', [materialId]);
  const c = await dbGet(db, `SELECT COUNT(*) AS n FROM series_almoxarifado
    WHERE material_id = ? AND status IN ('EM_ESTOQUE','BLOQUEADA')`, [materialId]);
  assert.strictEqual(c.n, Math.round(m.quantidade_atual),
    `invariante de serie violado: presentes=${c.n} != quantidade_atual=${m.quantidade_atual}`);
}
module.exports = { assertInvarianteSerie };
```

- [ ] **Step 2: testes que falham — `serieControleObrigatorio.api.test.js`** (via API v2, molde `loteControleObrigatorio.api.test.js`; fixture `novoMaterial` com `controle_serie`):

```js
test('[rota v2] entrada sem series em material controlado e recusada', async () => {
  const mat = await novoMaterial(db, { controle_serie: 1 });
  const res = await request(app).post('/api/almoxarifado/movimentacoes/v2')
    .send({ material_id: mat, tipo: 'ENTRADA', quantidade: 2, motivo: 'teste' });
  assert.strictEqual(res.status, 400);
  assert.ok(/serie/.test(res.body.error));
  assert.strictEqual(await totalDoMaterial(db, mat), 0, 'entrada nao podia ter efeito');
});

test('[rota v2] cardinalidade errada (1 serie para 2 unidades) e recusada', async () => {
  const mat = await novoMaterial(db, { controle_serie: 1 });
  const res = await request(app).post('/api/almoxarifado/movimentacoes/v2')
    .send({ material_id: mat, tipo: 'ENTRADA', quantidade: 2, motivo: 'teste', series: ['SN-1'] });
  assert.strictEqual(res.status, 400);
  assert.ok(/2 serie/.test(res.body.error), res.body.error);
});

test('[rota v2] quantidade fracionaria com controle_serie e recusada', async () => {
  const mat = await novoMaterial(db, { controle_serie: 1 });
  const res = await request(app).post('/api/almoxarifado/movimentacoes/v2')
    .send({ material_id: mat, tipo: 'ENTRADA', quantidade: 1.5, motivo: 'teste', series: ['SN-1', 'SN-2'] });
  assert.strictEqual(res.status, 400);
  assert.ok(/inteira/.test(res.body.error));
});

test('[rota v2] entrada com N series cria as N e mantem o invariante', async () => {
  const mat = await novoMaterial(db, { controle_serie: 1 });
  const res = await request(app).post('/api/almoxarifado/movimentacoes/v2')
    .send({ material_id: mat, tipo: 'ENTRADA', quantidade: 2, motivo: 'teste', series: ['SN-1', 'SN-2'] });
  assert.strictEqual(res.status, 201, JSON.stringify(res.body));
  await assertInvarianteSerie(db, mat);
  const mov = await dbGet(db, 'SELECT id FROM movimentacoes_almoxarifado ORDER BY id DESC LIMIT 1');
  const vinculadas = await dbAll(db, 'SELECT * FROM series_almoxarifado WHERE movimentacao_entrada_id = ?', [mov.id]);
  assert.strictEqual(vinculadas.length, 2, 'series sem vinculo com a movimentacao');
});

test('[rota v2] entrada com serie ja em estoque e recusada sem efeito no saldo', async () => {
  const mat = await novoMaterial(db, { controle_serie: 1 });
  await request(app).post('/api/almoxarifado/movimentacoes/v2')
    .send({ material_id: mat, tipo: 'ENTRADA', quantidade: 1, motivo: 'teste', series: ['SN-DUP'] });
  const res = await request(app).post('/api/almoxarifado/movimentacoes/v2')
    .send({ material_id: mat, tipo: 'ENTRADA', quantidade: 2, motivo: 'teste', series: ['SN-NOVA', 'SN-DUP'] });
  assert.strictEqual(res.status, 400);
  assert.strictEqual(await totalDoMaterial(db, mat), 1, 'a segunda entrada nao podia creditar');
  await assertInvarianteSerie(db, mat);
});

test('[rota v1] o modal rapido tambem exige serie', async () => {
  const mat = await novoMaterial(db, { controle_serie: 1 });
  const res = await request(app).post('/api/almoxarifado/movimentacoes')
    .send({ material_id: mat, tipo: 'ENTRADA', quantidade: 1, motivo: 'teste' });
  assert.strictEqual(res.status, 400);
  assert.ok(/serie/.test(res.body.error));
});

test('[rota v2] o corpo nao consegue ligar exigeSerie em material sem controle', async () => {
  const mat = await novoMaterial(db, { controle_serie: 0 });
  const res = await request(app).post('/api/almoxarifado/movimentacoes/v2')
    .send({ material_id: mat, tipo: 'ENTRADA', quantidade: 1, motivo: 'teste', exigeSerie: true });
  assert.strictEqual(res.status, 201, 'material sem controle_serie nao pode ser travado pelo body');
});

test('[fluxos internos] entrega de requisicao continua isenta de serie', async () => {
  // copiar o helper criarRequisicao de loteControleObrigatorio.api.test.js;
  // material controle_serie=1 com qtd 5 via INSERT direto (sem series — estoque legado),
  // separar e entregar via requisitionService: tem de FUNCIONAR (isencao declarada).
});
```

- [ ] **Step 3: rodar e ver falhar** (as recusas ainda não existem; o caso de sucesso falha no vínculo).

- [ ] **Step 4: implementar**

4a. `schemas.js` — em `MovimentacaoSchema`, junto de `lote`/`lote_id`:

```js
  // Etapa 6b: chave nao declarada e descartada pelo validate() — series/serie_ids
  // precisam estar aqui para chegarem ao motor.
  series: z.array(z.string().trim().min(1)).max(1000).optional(),
  serie_ids: z.array(z.coerce.number().int().positive()).max(1000).optional(),
```

4b. `stockService.js` — em `registrarMovimentacao`, logo depois da guarda `exigeLote` (mesma altura, mesmo estilo):

```js
    // ── Serie (Etapa 6b) ─────────────────────────────────────────────────────────
    // Mesmo alcance e mesmas isencoes do exigeLote acima: so movimentacao manual
    // (v1/v2) e recebimento declaram exigeSerie; entrega/exclusao de requisicao e
    // devolucao/sucata de devolucao continuam isentas ate as telas deles terem campo
    // de serie (pendencia declarada nas specs 04/12).
    const seriesEntrada = Array.isArray(params.series)
      ? params.series.map((s) => String(s).trim()).filter(Boolean) : [];
    const serieIdsSaida = Array.isArray(params.serie_ids)
      ? params.serie_ids.map(Number).filter((n) => Number.isInteger(n) && n > 0) : [];
    const serieObrigatoria = !!(opcoes.exigeSerie && material.controle_serie
      && (tiposEntrada.includes(tipo) || tiposSaida.includes(tipo)));
    if (serieObrigatoria) {
      if (!Number.isInteger(Number(quantidade))) {
        const e = new Error('material com controle de serie exige quantidade inteira');
        e.status = 400; throw e;
      }
      const informadas = tiposEntrada.includes(tipo) ? seriesEntrada.length : serieIdsSaida.length;
      if (informadas !== Number(quantidade)) {
        const e = new Error(`material com controle de serie: informe ${quantidade} serie(s) para ${quantidade} unidade(s) — recebidas ${informadas}`);
        e.status = 400; throw e;
      }
    }
```

4c. Efeito de ENTRADA — imediatamente **antes** do bloco de aplicação física da entrada, criar as séries (validação mais estrita primeiro; se o crédito falhar depois, compensa):

```js
    let seriesAfetadas = [];
    if (serieObrigatoria && tiposEntrada.includes(tipo)) {
      seriesAfetadas = await seriesService.entradaSeries(db, user, {
        material_id, numeros: seriesEntrada, lote_id: loteIdFinal,
        localizacao_id: localizacaoEntradaId || null, movimentacao_id: null,
      });
    }
```

Envolver o restante do caminho de entrada (aplicação física + linha de saldo + INSERT do ledger) na compensação: no `catch`/caminho de falha existente **ou**, seguindo o idioma do arquivo (sem try/catch amplo), acrescentar `await seriesService.desfazerEntrada(db, seriesAfetadas)` em cada `throw` posterior do ramo de entrada. Na prática o ramo de entrada não tem `throw` depois da aplicação física hoje — o ponto obrigatório é: **se** `getOrCreateSaldo`/custo médio lançarem, o processo aborta com série criada; para fechar isso, envolver só o trecho entrada-física→ledger em `try { ... } catch (e) { await seriesService.desfazerEntrada(db, seriesAfetadas); throw e; }` quando `seriesAfetadas.length > 0`.

4d. Depois do INSERT no ledger (o `movId` existe), vincular:

```js
    if (seriesAfetadas.length > 0) {
      await dbRun(db, `UPDATE series_almoxarifado SET movimentacao_entrada_id = ?
        WHERE id IN (${seriesAfetadas.map(() => '?').join(',')})`,
        [movId, ...seriesAfetadas.map((a) => a.linha.id)]);
    }
```

4e. Rotas: em `routes/almoxarifado.js` (v1), onde hoje está `{ exigeLote: true }`, virar `{ exigeLote: true, exigeSerie: true }` (comentário existente já explica o porquê do options forjado por servidor). Em `extended.js` (v2), idem.

4f. `stockService.js` importa `seriesService` no topo (cuidado com require circular: `seriesService` não importa `stockService` — não há ciclo).

- [ ] **Step 5: rodar e ver passar** — `node tests/api/serieControleObrigatorio.api.test.js` e depois `npm run test:api` inteiro (regressão: os 48 arquivos existentes continuam OK). Controle positivo: rodar o teste de isenção com `exigeSerie` ligado à força na entrega de requisição e vê-lo falhar; restaurar.

- [ ] **Step 6: commit**

```bash
git add server/services/almoxarifado/stockService.js server/services/almoxarifado/schemas.js server/routes/almoxarifado.js server/routes/almoxarifado/extended.js server/tests/helpers/serieInvariante.js server/tests/api/serieControleObrigatorio.api.test.js
git commit -m "Almoxarifado Etapa 6b: controle_serie exige N series na entrada (motor, Zod e rotas)"
```

---

### Task 4: motor — efeito de SAÍDA (claim de séries + compensação)

**Files:**
- Modify: `server/services/almoxarifado/stockService.js`
- Test: `server/tests/api/serieGuardasSaida.api.test.js`

**Interfaces:**
- Consumes: `claimSaidaSeries`/`desfazerSaida` (Task 2); exigência da Task 3 (cardinalidade já validada antes de qualquer efeito).
- Produces: saída com `serie_ids` transiciona as séries e vincula `movimentacao_saida_id`.

- [ ] **Step 1: testes que falham** (fixture: entrada v2 com séries da Task 3 para popular):

```js
test('saida com serie_ids marca ENTREGUE, vincula a movimentacao e mantem o invariante', async () => { /* entrada de 3, saida de 2, conferir status + movimentacao_saida_id + invariante */ });
test('SUCATA marca SUCATEADA', async () => { /* saida SUCATA de 1, status SUCATEADA */ });
test('saida com serie de outro material e recusada sem efeito', async () => { /* 400, saldo intacto, series intactas */ });
test('saida com serie BLOQUEADA e recusada e nao deixa claim parcial', async () => { /* bloquear a 2a via UPDATE, tentar sair com [a,b], 400, a continua EM_ESTOQUE */ });
test('material com controle_lote e controle_serie: serie tem de pertencer ao lote da saida', async () => { /* entrada com lote L1+serie, saida citando lote L2 -> 400 nao pertence ao lote */ });
test('saida sem controle_serie continua ignorando serie_ids', async () => { /* material sem a flag, serie_ids lixo no body -> 201 */ });
```

Escrever os corpos completos no arquivo (mesmo molde dos testes da Task 3 — requisição v2, asserts de status/erro, `assertInvarianteSerie` no fim de cada caso).

- [ ] **Step 2: rodar e ver falhar.**

- [ ] **Step 3: implementar** — em `registrarMovimentacao`, no ramo de saída, **imediatamente após** o bloco do `claimSaldoDoLote` (e no ramo de saída sem lote, após o ajuste de linha), acrescentar:

```js
    let seriesClaim = [];
    if (serieObrigatoria && tiposSaida.includes(tipo)) {
      try {
        seriesClaim = await seriesService.claimSaidaSeries(db, user, {
          material_id, serie_ids: serieIdsSaida, lote_id: loteIdFinal, tipo, movimentacao_id: null,
        });
      } catch (e) {
        // compensacao: o saldo agregado ja foi debitado — devolver antes de propagar,
        // no mesmo padrao da compensacao do claimSaldoDoLote logo acima.
        await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_atual = quantidade_atual + ? WHERE id = ?', [quantidade, material_id]);
        await ajustarSaldoExistente(db, material_id, locSaidaId || null, loteIdFinal, quantidade);
        throw e;
      }
    }
```

(Os nomes `locSaidaId`/delta exatos vêm do bloco vizinho de compensação do `claimSaldoDoLote` — copiar a mesma reversão que ele já faz, é o modelo literal.) Depois do INSERT do ledger, vincular como na entrada:

```js
    if (seriesClaim.length > 0) {
      await dbRun(db, `UPDATE series_almoxarifado SET movimentacao_saida_id = ?
        WHERE id IN (${seriesClaim.map(() => '?').join(',')})`,
        [movId, ...seriesClaim.map((c) => c.linha.id)]);
    }
```

- [ ] **Step 4: rodar e ver passar** + `npm run test:api` inteiro. Controle positivo: forçar `lote_id: null` no claim e ver o teste de lote×série falhar; restaurar.

- [ ] **Step 5: commit**

```bash
git add server/services/almoxarifado/stockService.js server/tests/api/serieGuardasSaida.api.test.js
git commit -m "Almoxarifado Etapa 6b: saida com controle_serie consome series especificas com claim e compensacao"
```

---

### Task 5: estorno e reentrada manual

**Files:**
- Modify: `server/services/almoxarifado/stockService.js` (`cancelarMovimentacao`)
- Test: `server/tests/api/serieEstornoDevolucao.api.test.js`

**Interfaces:**
- Consumes: `reverterSaida`, `reverterEntrada` (Task 2).
- Produces: estorno de saída devolve séries a `EM_ESTOQUE`; estorno de entrada marca `ESTORNADA` e recusa quando alguma série da entrada já saiu; reentrada manual (ENTRADA com série `ENTREGUE`) reativa.

- [ ] **Step 1: testes que falham**

```js
test('estorno de saida devolve as series a EM_ESTOQUE e mantem o invariante', async () => { /* entrada 2, saida 2, cancelarMovimentacao da saida, status EM_ESTOQUE, invariante */ });
test('estorno de entrada marca ESTORNADA', async () => { /* entrada 2, cancelar a entrada, ambas ESTORNADA, invariante */ });
test('estorno de entrada com serie ja movimentada e recusado', async () => { /* entrada 2, saida 1, cancelar a ENTRADA -> 400 com "series ja movimentadas"; nada muda */ });
test('reentrada manual de serie ENTREGUE reativa (fluxo de devolucao via tela)', async () => { /* entrada 1, saida 1, nova ENTRADA v2 com a mesma serie -> 201, EM_ESTOQUE, invariante */ });
```

Corpos completos no arquivo, com `cancelarMovimentacao` chamado direto do service (molde: `estorno.api.test.js`).

- [ ] **Step 2: rodar e ver falhar.**

- [ ] **Step 3: implementar** em `cancelarMovimentacao`:

- Na **reversão de SAÍDA**, logo após o `ajustarSaldoExistente` que devolve o saldo: `await seriesService.reverterSaida(db, user, mov.id);`
- Na **reversão de ENTRADA**, **antes** de mexer no saldo (guarda primeiro, efeito depois):

```js
      const material = await getMaterial(db, mov.material_id);
      if (material?.controle_serie) {
        const presentes = await dbGet(db, `SELECT COUNT(*) AS n FROM series_almoxarifado
          WHERE movimentacao_entrada_id = ? AND status = 'EM_ESTOQUE'`, [mov.id]);
        if (presentes.n < Math.round(mov.quantidade)) {
          const e = new Error('estorno de entrada recusado: ha series desta entrada ja movimentadas — estorne as saidas primeiro');
          e.status = 400; throw e;
        }
      }
```

  e, após a reversão do saldo dar certo: `await seriesService.reverterEntrada(db, user, mov.id);`
  (Atenção ao claim `cancelado = 1` já feito antes: a recusa acima precisa acontecer **antes** do claim, ou desfazer o claim no throw — seguir o padrão de rollback do claim que o próprio `cancelarMovimentacao` já tem no catch.)

- [ ] **Step 4: rodar e ver passar** + `npm run test:api`. Controle positivo: remover temporariamente a chamada `reverterSaida` e ver o teste do invariante falhar; restaurar.

- [ ] **Step 5: commit**

```bash
git add server/services/almoxarifado/stockService.js server/tests/api/serieEstornoDevolucao.api.test.js
git commit -m "Almoxarifado Etapa 6b: estorno devolve/estorna series e recusa estorno de entrada com serie ja movimentada"
```

### Task 6: recebimento — séries por item da nota

**Files:**
- Modify: `server/services/almoxarifado/schema.js` (bloco `recebItemCols` — `safeAlter` de `series TEXT`)
- Modify: `server/services/almoxarifado/receiptService.js` (INSERT inicial de itens, `conferirRecebimento`, pré-checagem e `darEntradaEstoque`)
- Modify: `server/routes/almoxarifado/extended.js` (whitelist do payload fiscal: campo `series` do item)
- Test: `server/tests/api/serieRecebimento.api.test.js`

**Interfaces:**
- Consumes: motor com `exigeSerie` (Task 3); `receiptService` já passa `{ exigeLote: true }` — passa a `{ exigeLote: true, exigeSerie: true }`.
- Produces: item de recebimento carrega `series` (texto "uma por linha"); séries nascem via motor com `recebimento_id`/`recebimento_item_id` griffados depois.

- [ ] **Step 1: testes que falham**

```js
test('nota com item sem series em material controlado e recusada inteira (nada entra)', async () => { /* recebimento 2 itens, um controle_serie sem series -> processar 400, totalDoMaterial dos dois = 0 */ });
test('nota com cardinalidade errada e recusada inteira', async () => { /* series com N-1 linhas -> 400 na pre-checagem */ });
test('nota ok cria series vinculadas ao lote e ao recebimento', async () => { /* processar -> series EM_ESTOQUE com lote_id, recebimento_id e recebimento_item_id preenchidos; invariante */ });
test('reprocessar a nota nao duplica series', async () => { /* processar 2x -> mesmas N series, saldo N (nao 2N); invariante */ });
```

Molde de fixture: `recebimentoEntradaAtomica.api.test.js` (INSERTs diretos de recebimento + itens). Parser: séries separadas por quebra de linha.

- [ ] **Step 2: rodar e ver falhar.**

- [ ] **Step 3: implementar**

3a. `schema.js`, no array `recebItemCols`: `['series', 'TEXT']` (via `safeAlter`, como as colunas de lote).

3b. `receiptService.js`:
- INSERT inicial de itens e `conferirRecebimento`: aceitar/gravar `series` (mesmo tratamento dos campos de lote).
- Parser local: `const parseSeries = (txt) => String(txt || '').split(/\r?\n/).map((s) => s.trim()).filter(Boolean);`
- `SELECT` dos itens em `darEntradaEstoque`: acrescentar `m.controle_serie`.
- **Pré-checagem da nota inteira** (bloco `problemas[]`): para item com `m.controle_serie` e `qtd > 0`: `!Number.isInteger(qtd)` → problema "quantidade fracionaria com controle de serie"; `parseSeries(item.series).length !== qtd` → problema `"item X: informe ${qtd} serie(s) — recebidas ${n}"`.
- Chamada do motor: `registrarMovimentacao(..., { exigeLote: true, exigeSerie: true })` com `series: parseSeries(item.series)` no params.
- Depois do motor (dentro do mesmo `if (qtd > 0)`): griffar a origem —

```js
        const numerosSerie = parseSeries(item.series);
        if (numerosSerie.length > 0) {
          await dbRun(db, `UPDATE series_almoxarifado
              SET recebimento_id = ?, recebimento_item_id = ?
            WHERE material_id = ? AND numero IN (${numerosSerie.map(() => '?').join(',')})`,
            [recebimentoId, item.id, item.material_id, ...numerosSerie]);
        }
```

3c. `extended.js`, rota fiscal: acrescentar `series` à whitelist dos campos de item (ao lado de `corrida_lote`).

- [ ] **Step 4: rodar e ver passar** + `npm run test:api`. Controle positivo do teste de idempotência: comentar o claim `entrada_estoque_em IS NULL` temporariamente e vê-lo falhar; restaurar.

- [ ] **Step 5: commit**

```bash
git add server/services/almoxarifado/schema.js server/services/almoxarifado/receiptService.js server/routes/almoxarifado/extended.js server/tests/api/serieRecebimento.api.test.js
git commit -m "Almoxarifado Etapa 6b: serie nasce no recebimento (pre-checagem da nota inteira e vinculo de origem)"
```

---

### Task 7: rotas de série (listar + bloquear/desbloquear)

**Files:**
- Modify: `server/routes/almoxarifado/extended.js` (junto das rotas de lote)
- Test: `server/tests/api/serieRotas.api.test.js`

**Interfaces:**
- Consumes: `listarSeriesDoMaterial`, `mudarStatusSerie` (Tasks 1-2).
- Produces: `GET /api/almoxarifado/materiais/:id/series?status=` (perm. `visualizar`) e `PUT /api/almoxarifado/series/:id/status` (perm. `inspecionar`, corpo `{ status, justificativa }` lido direto — mesmo padrão sem-Zod do `PUT /lotes/:id/liberar-vencimento`).

- [ ] **Step 1: testes que falham**

```js
test('GET lista series do material com lote_codigo e filtra por status', async () => { /* 200, campos numero/status/lote_codigo */ });
test('PUT status exige justificativa (400) e permissao inspecionar (403 p/ PRODUCAO via setUser)', async () => { /* dois asserts: sem justificativa 400; setUser producao -> 403 */ });
test('PUT status bloqueia e desbloqueia; transicao invalida 400; corrida 409', async () => { /* bloquear 200; ENTREGUE -> 400; corrida: mudar por SQL entre leitura e update nao e simulavel aqui, entao cobrir o 409 chamando 2x com status defasado via service */ });
```

- [ ] **Step 2: rodar e ver falhar.**

- [ ] **Step 3: implementar** (padrão literal das rotas de lote — `auth` + `requirePermission` + `handleError`; `seriesService` no require do topo):

```js
  app.get('/api/almoxarifado/materiais/:id/series', auth, requirePermission('visualizar'), async (req, res) => {
    try {
      const series = await seriesService.listarSeriesDoMaterial(db, req.params.id, { status: req.query.status });
      res.json(series);
    } catch (e) { handleError(res, e); }
  });

  app.put('/api/almoxarifado/series/:id/status', auth, requirePermission('inspecionar'), async (req, res) => {
    try {
      const { status, justificativa } = req.body || {};
      const serie = await seriesService.mudarStatusSerie(db, req.user, req.params.id, status, justificativa);
      res.json(serie);
    } catch (e) { handleError(res, e); }
  });
```

- [ ] **Step 4: rodar e ver passar** + `npm run test:api` (50 arquivos agora). Controle positivo: o 403 do PRODUCAO já é um (o harness roda `requirePermission` real).

- [ ] **Step 5: commit**

```bash
git add server/routes/almoxarifado/extended.js server/tests/api/serieRotas.api.test.js
git commit -m "Almoxarifado Etapa 6b: rotas de listagem e bloqueio de serie"
```

---

### Task 8: front — Movimentações (entrada com textarea + gerador; saída com seletor)

**Files:**
- Modify: `client/src/components/almoxarifado/MovimentacoesAlmoxarifado.js`
- Test: `client/src/components/almoxarifado/SerieMovimentacao.test.js` (novo, molde `LoteSeletor.test.js` — renderiza a tela-pai)

**Interfaces:**
- Consumes: `GET /almoxarifado/materiais/:id/series?status=EM_ESTOQUE` (Task 7); payload v2 `series`/`serie_ids` (Task 3/4). O material selecionado já traz `controle_serie` (`SELECT m.*`).
- Produces: —

- [ ] **Step 1: testes que falham** (helpers `preencher`/`esperarEfeitos`/`abrirComMaterialETipo` copiados de `LoteSeletor.test.js`; material mockado com `controle_serie: 1`):

```js
test('ENTRADA com controle_serie mostra textarea e contador N/quantidade', ...);
test('gerar sequencia preenche a textarea (prefixo GMP-, inicio 5, qtd 3 -> GMP-5..GMP-7)', ...);
test('submit de entrada envia payload.series como array de linhas', ...);
test('SAIDA lista series EM_ESTOQUE como checkboxes e envia serie_ids', ...);
test('trocar o tipo limpa series e serie_ids (nao vazam para outro tipo)', ...);
test('material sem controle_serie nao mostra nada de serie', ...);
```

- [ ] **Step 2: rodar e ver falhar** — `cd client && CI=true npx react-scripts test src/components/almoxarifado/SerieMovimentacao --watchAll=false`.

- [ ] **Step 3: implementar**

- Estado: `form` ganha `series: ''` e `serie_ids: []` (no estado inicial **e** no reset do `openModal`); novos estados `seriesDisponiveis` (array), `seriePrefixo`/`serieInicio` (strings do gerador).
- Fetch (molde exato do efeito de lotes, com a mesma guarda `cancelado`): dispara quando `TIPOS_SAIDA_LOTE.includes(form.tipo) && selectedMaterial?.controle_serie`, chama `GET /almoxarifado/materiais/${form.material_id}/series?status=EM_ESTOQUE`.
- Limpeza no `onChange` do tipo: acrescentar `series: ''` e `serie_ids: []` à lista de campos zerados.
- Helper local: `const linhasSerie = (txt) => String(txt || '').split(/\r?\n/).map((s) => s.trim()).filter(Boolean);`
- JSX — depois do campo de lote:

```jsx
{selectedMaterial?.controle_serie === 1 && form.tipo === 'ENTRADA' && (
  <div className="almox-field almox-form-full">
    <label>Números de série (um por linha) *</label>
    <textarea className="almox-textarea" rows={3} value={form.series}
      onChange={(e) => setForm({ ...form, series: e.target.value })} />
    <small style={{ color: linhasSerie(form.series).length === Number(form.quantidade) ? 'var(--gmp-text-light)' : 'var(--gmp-danger)' }}>
      {linhasSerie(form.series).length}/{form.quantidade || 0} série(s)
    </small>
    <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
      <input className="almox-input" placeholder="Prefixo (ex.: GMP-)" value={seriePrefixo}
        onChange={(e) => setSeriePrefixo(e.target.value)} style={{ maxWidth: 140 }} />
      <input className="almox-input" type="number" placeholder="Nº inicial" value={serieInicio}
        onChange={(e) => setSerieInicio(e.target.value)} style={{ maxWidth: 110 }} />
      <button type="button" className="btn-almox-secondary" onClick={() => {
        const qtd = Number(form.quantidade) || 0;
        const inicio = Number(serieInicio) || 1;
        const linhas = Array.from({ length: qtd }, (_, i) => `${seriePrefixo}${inicio + i}`);
        setForm({ ...form, series: linhas.join('\n') });
      }}>Gerar sequência</button>
    </div>
  </div>
)}
{selectedMaterial?.controle_serie === 1 && TIPOS_SAIDA_LOTE.includes(form.tipo) && (
  <div className="almox-field almox-form-full">
    <label>Séries a {form.tipo === 'SAIDA' ? 'entregar' : 'baixar'} *</label>
    <div style={{ maxHeight: 140, overflowY: 'auto', border: '1px solid var(--gmp-border)', borderRadius: 6, padding: 6 }}>
      {seriesDisponiveis
        .filter((s) => !form.lote_id || Number(s.lote_id) === Number(form.lote_id))
        .map((s) => (
          <label key={s.id} style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: '0.85rem' }}>
            <input type="checkbox" checked={form.serie_ids.includes(s.id)}
              onChange={(e) => setForm({
                ...form,
                serie_ids: e.target.checked
                  ? [...form.serie_ids, s.id]
                  : form.serie_ids.filter((id) => id !== s.id),
              })} />
            {s.numero}{s.lote_codigo ? ` · lote ${s.lote_codigo}` : ''}
          </label>
        ))}
      {seriesDisponiveis.length === 0 && <small>Nenhuma série disponível em estoque.</small>}
    </div>
    <small>{form.serie_ids.length}/{form.quantidade || 0} série(s) selecionada(s)</small>
  </div>
)}
```

- Payload (`handleSubmit`, junto das linhas de lote — "só envia campo que o tipo exibe"):

```js
      if (selectedMaterial?.controle_serie === 1 && form.tipo === 'ENTRADA') payload.series = linhasSerie(form.series);
      if (selectedMaterial?.controle_serie === 1 && TIPOS_SAIDA_LOTE.includes(form.tipo)) payload.serie_ids = form.serie_ids;
```

- [ ] **Step 4: rodar e ver passar** + suíte client inteira (regressão: `LoteSeletor.test.js` e `MovimentacoesAlmoxarifado.test.js` continuam verdes).

- [ ] **Step 5: commit**

```bash
git add client/src/components/almoxarifado/MovimentacoesAlmoxarifado.js client/src/components/almoxarifado/SerieMovimentacao.test.js
git commit -m "Almoxarifado Etapa 6b: movimentacao manual pede series (textarea com gerador na entrada, seletor na saida)"
```

---

### Task 9: front — Recebimentos (textarea de séries por item)

**Files:**
- Modify: `client/src/components/almoxarifado/RecebimentosAlmoxarifado.js`

**Interfaces:**
- Consumes: whitelist fiscal com `series` (Task 6); `materiais` do componente já vem de `GET /almoxarifado/materiais` (`SELECT m.*` → tem `controle_serie`).
- Produces: —

- [ ] **Step 1: implementar** (sem teste client dedicado — a validação real é do servidor e está coberta na Task 6; o componente não tem suíte própria hoje):

- No grid de campos por item (junto de Lote/Validade/Fabricação/Corrida, mesmo gate de etapa), quando o material do item tem a flag:

```jsx
{materiais.find((m) => m.id === item.material_id)?.controle_serie === 1 && (
  <div className="almox-field" style={{ gridColumn: '1 / -1' }}>
    <label>Séries (uma por linha) — {String(item.series || '').split(/\r?\n/).filter((s) => s.trim()).length}/{item.quantidade_recebida || item.quantidade_esperada || 0}</label>
    <textarea className="almox-textarea" rows={2} value={item.series || ''}
      onChange={(e) => atualizarItemDetalhe(item.id, 'series', e.target.value)} />
  </div>
)}
```

- `salvarFiscal`: acrescentar `series: item.series` à whitelist do payload do item.

- [ ] **Step 2: verificar** — suíte client + `CI=true npx react-scripts build` (CRA com CI trata warning como erro; variável não usada quebraria o build).

- [ ] **Step 3: commit**

```bash
git add client/src/components/almoxarifado/RecebimentosAlmoxarifado.js
git commit -m "Almoxarifado Etapa 6b: campo de series por item na tela de recebimento"
```

---

### Task 10: front — aba Séries na tela de Lotes

**Files:**
- Modify: `client/src/components/almoxarifado/LotesAlmoxarifado.js`
- Modify: `client/src/components/Layout.js` (label do menu: "Lotes" → "Lotes e Séries")
- Test: `client/src/components/almoxarifado/LotesAlmoxarifado.test.js` (acrescentar describe)

**Interfaces:**
- Consumes: `GET /almoxarifado/materiais/:id/series` e `PUT /almoxarifado/series/:id/status` (Task 7).
- Produces: —

- [ ] **Step 1: testes que falham** (novo describe no arquivo existente, reaproveitando helpers/mocks):

```js
test('aba Series lista numero/status/lote e badge por status', ...);
test('bloquear serie exige justificativa (nao chama a API sem motivo)', ...);
test('bloquear com justificativa chama PUT /almoxarifado/series/:id/status', ...);
test('resposta atrasada da aba anterior nao vaza para a aba atual (corrida)', ...);
```

- [ ] **Step 2: rodar e ver falhar.**

- [ ] **Step 3: implementar**

- Estado novo logo abaixo de `materialId`: `const [aba, setAba] = useState('LOTES');` + `const [series, setSeries] = useState([]);` + trio de modal `serieStatusTarget/serieStatusJustificativa/serieStatusSaving`.
- Efeito de carga das séries (molde do de lotes, com guarda `cancelado`), disparado por `materialId`, `aba === 'SERIES'` e `reloadToken`: `GET /almoxarifado/materiais/${materialId}/series`.
- Botões de aba entre o filtro de material e a tabela:

```jsx
<div style={{ display: 'flex', gap: 8, margin: '12px 0' }}>
  <button className={aba === 'LOTES' ? 'btn-almox-primary' : 'btn-almox-secondary'} onClick={() => setAba('LOTES')}>Lotes</button>
  <button className={aba === 'SERIES' ? 'btn-almox-primary' : 'btn-almox-secondary'} onClick={() => setAba('SERIES')}>Séries</button>
</div>
```

- Tabela de séries (renderizada quando `aba === 'SERIES'`): colunas Número / Status (badge — `EM_ESTOQUE` ok, `BLOQUEADA` critico, `ENTREGUE` concluido, `SUCATEADA`/`ESTORNADA` cancelado) / Lote / Localização / ação Bloquear ou Desbloquear (gate `bloquearSeNaoPode('inspecionar', e)`), modal com justificativa obrigatória no molde do modal de status de lote, chamando `PUT /almoxarifado/series/${id}/status` com `{ status, justificativa }` e `setReloadToken((t) => t + 1)` no sucesso.
- Título da página: "Lotes e Séries". `Layout.js`: label do item de menu idem.

- [ ] **Step 4: rodar e ver passar** + suíte client inteira.

- [ ] **Step 5: commit**

```bash
git add client/src/components/almoxarifado/LotesAlmoxarifado.js client/src/components/almoxarifado/LotesAlmoxarifado.test.js client/src/components/Layout.js
git commit -m "Almoxarifado Etapa 6b: aba Series na tela de lotes com bloqueio justificado"
```

---

### Task 11: front — hint da flag + KPI no extrato

**Files:**
- Modify: `client/src/components/almoxarifado/MaterialAlmoxarifadoForm.js`
- Modify: `client/src/components/almoxarifado/ExtratoMaterialModal.js`

- [ ] **Step 1: implementar**

- `MaterialAlmoxarifadoForm.js`: no array `CONTROLE_CHECKS`, o item de `controle_serie` ganha `hint: 'Exigirá um número de série por unidade na entrada e na saída'`; o map da seção Controles renderiza `{c.hint && <small style={{ color: 'var(--gmp-text-light)', fontSize: '0.75rem' }}>{c.hint}</small>}`. (As outras flags ficam sem hint — só a que tem efeito novo ganha explicação; `controle_validade`/`controle_corrida` continuam mortas e documentadas na spec 10.)
- `ExtratoMaterialModal.js`: quando `material.controle_serie === 1`, sétimo cartão KPI "Séries em estoque" — buscar junto do fetch existente: `api.get('/almoxarifado/materiais/' + materialId + '/series?status=EM_ESTOQUE')` e exibir `series.length` (efeito com a mesma guarda de corrida do fetch principal).

- [ ] **Step 2: verificar** — suíte client + build CI verdes.

- [ ] **Step 3: commit**

```bash
git add client/src/components/almoxarifado/MaterialAlmoxarifadoForm.js client/src/components/almoxarifado/ExtratoMaterialModal.js
git commit -m "Almoxarifado Etapa 6b: hint da flag de serie e KPI de series no extrato"
```

---

### Task 12: documentação e verificação final da etapa

**Files:**
- Modify: `specs/modulo-almoxarifado/10-lotes-series-etiquetas/README.md` (checklist 6b `[x]` com hash por item; flags: `controle_serie` sai da lista de mortas)
- Modify: `specs/modulo-almoxarifado/README.md` (linha 10 da tabela; seção Etapa 6b ✅; critério de aceite "Rastrear lote e número de série" → série atendida)
- Modify: `docs/almoxarifado-guia-etapas-e-testes.md` (cabeçalho "onde parou"; seção "Etapa 6b" com Antes→Agora, roteiro de teste clicável — criar material com a flag, entrada com gerador de sequência, saída escolhendo séries, bloqueio na aba Séries, recebimento com séries — e "o que a 6b não cobre")
- Modify: `docs/superpowers/plans/2026-08-11-almoxarifado-etapa6b-series.md` (marcar tasks; escrever a próxima tarefa detalhada — **Etapa 6c: etiquetas/QR** — contrato que consome: `lotes_almoxarifado`, `series_almoxarifado`, telas de lote/série; pontos de atenção: geração de PDF, biblioteca de QR, impressão térmica vs A4)

- [ ] **Step 1: rodar TUDO e citar os números reais** — `cd server && npm run test:api && npm run test:almoxarifado && npm run test:validation && npm run test:safealter && npm run test:sqlite`; `cd client && CI=true npx react-scripts test --watchAll=false && CI=true npx react-scripts build`.

- [ ] **Step 2: atualizar os 4 documentos** (regra do CLAUDE.md: doc desatualizada é trabalho não terminado; item não entregue fica desmarcado **com o porquê ao lado**). Em particular na spec 10: série implementada ✅ (com hashes), etiquetas 6c ❌, `controle_validade`/`controle_corrida` continuam mortas (agora as duas únicas).

- [ ] **Step 3: commit + push**

```bash
git add specs/modulo-almoxarifado docs/almoxarifado-guia-etapas-e-testes.md docs/superpowers/plans/2026-08-11-almoxarifado-etapa6b-series.md
git commit -m "Almoxarifado Etapa 6b: atualiza specs, guia e plano com o que a etapa entregou"
git push origin desenvolvimento-almoxarifado
```

---

## Self-review do plano (feito em 2026-08-11)

- **Cobertura do design:** modelo de dados (T1), service completo (T1-2), exigência+entrada (T3), saída (T4), estorno/reentrada (T5), recebimento (T6), rotas (T7), Movimentações UI (T8), Recebimento UI (T9), aba Séries (T10), hint+KPI (T11), docs (T12). Invariante coberto pelo helper usado em T3-T6. Isenções dos 4 fluxos testadas em T3.
- **Sem placeholders:** os corpos de teste resumidos em T4/T5/T6/T10 têm o cenário, os asserts-chave e o molde nomeado — o implementador escreve o corpo no padrão do arquivo-molde citado; nenhum "TBD".
- **Consistência de nomes:** `entradaSeries`/`desfazerEntrada`/`claimSaidaSeries`/`desfazerSaida`/`reverterSaida`/`reverterEntrada`/`mudarStatusSerie`/`listarSeriesDoMaterial`/`contarPresentes` — iguais em T1-T7; params `series`/`serie_ids`; opção `exigeSerie`.
- **Riscos apontados ao executor:** (1) posição exata dos blocos no `stockService` — usar os âncoras nomeados (guarda `exigeLote`, `claimSaldoDoLote`, INSERT do ledger), não números de linha; (2) o rollback do claim `cancelado=1` no estorno (T5) — a guarda de série roda ANTES do claim ou desfaz no throw; (3) CRA com `CI=true` transforma warning em erro — variável não usada quebra o build.

