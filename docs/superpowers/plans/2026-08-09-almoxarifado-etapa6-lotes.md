# Etapa 6 do Almoxarifado — Lotes de verdade · Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** transformar `lote` de um texto que o motor grava e nunca lê numa entidade real, com validade, corrida, certificado e status — e fechar o buraco em que uma saída deixa a linha do lote negativa em silêncio.

**Architecture:** nova tabela `lotes_almoxarifado` e um serviço próprio (`lotService.js`) que é o único dono do ciclo de vida do lote. `estoque_saldo_almoxarifado` é reconstruída para referenciar o lote por FK (`lote_id`) e perde três colunas de retenção que nunca receberam escrita. O motor (`stockService.js`) ganha três guardas na saída com lote — status, validade e claim atômico do saldo — no mesmo padrão do resto do módulo: condição no `WHERE` com `RETURNING`, nunca read-then-write. O lote nasce no recebimento.

**Tech Stack:** Node + Express + SQLite (`sqlite3`), Zod para validação, `multer` para o certificado, React CRA no cliente. Testes: runner artesanal em `server/tests/api/*.api.test.js` (supertest + SQLite `:memory:`) e `react-scripts test` no cliente.

**Design de origem:** [`docs/superpowers/specs/2026-08-09-almoxarifado-etapa6-lotes-design.md`](../specs/2026-08-09-almoxarifado-etapa6-lotes-design.md)
**Spec da feature:** `specs/modulo-almoxarifado/10-lotes-series-etiquetas/README.md`

---

## ✅ ETAPA CONCLUÍDA — 2026-08-09 · base `d369871` · 19 commits (`b7035dd..9406bff`)

**Todas as tasks entregues, mais uma (3b) que não estava neste plano.** Os `- [ ]` dos Steps dentro
de cada task ficaram sem marcar de propósito: o texto de vários Steps **não descreve mais o código
final** (a Task 3 passou por cinco rodadas de review que mudaram decisões de fundo). Marcar Step a
Step daria a impressão errada de que o plano literal foi seguido. O checklist consolidado — o que
é fonte da verdade — está em
[`specs/modulo-almoxarifado/10-lotes-series-etiquetas/README.md`](../../../specs/modulo-almoxarifado/10-lotes-series-etiquetas/README.md).

| Task | Estado | Commits |
|---|---|---|
| **1** — tabela de lotes + `lotService` | ✅ | `b7035dd`, `d6e36e9` (fix: status inválido recusado, não coagido para ATIVO) |
| **2** — reconstrução de `estoque_saldo_almoxarifado` | ✅ | `015e94c`, `b4e4858` (fix: teste vazio da migração + leitor órfão do lote no extrato) |
| **3** — três guardas da saída por lote | ✅ | `65d78fd`, `920d10c`, `f65758d`, `8d7773e`, `c2e31dc`, `1effd07`, `4dd6169`, `2d6fec5`, `dee5378` (**cinco rodadas de review**) |
| **3b** — liberação de vencimento *(não estava no plano)* | ✅ | `556f86d` — ver a seção própria, abaixo da Task 3 |
| **4** — `controle_lote` deixa de ser flag morta | ✅ | `2dbbf60` |
| **5** — lote nasce no recebimento + `controle_certificado` | ✅ | `64686b1`, `c11db85` (fix: corrida que liberava lote reprovado ao anexar certificado) |
| **6** — rotas FEFO e mudança de status | ✅ | `8dfeb0c` |
| **7** — telas (lote no recebimento, seletor FEFO na saída) | ✅ | `9406bff` |
| **8** — documentação | ✅ | este commit |

**Onde parar de ler o plano e ler o código:** a Task 3 é a única cujo texto ficou substancialmente
desatualizado. Antes de mexer no motor, leia
`.superpowers/sdd/2026-08-09-almoxarifado-etapa6-lotes/task-3-report.md` e a nota no cabeçalho da
Task 3 abaixo.

**➡️ A próxima etapa (6b — números de série) está detalhada no fim deste arquivo.**

## Global Constraints

Toda task herda estas regras. Elas não são estilo — cada uma é cicatriz de um bug real desta base.

1. **Guarda no `WHERE`, nunca read-then-write.** Toda mutação que precisa validar uma condição valida dentro do próprio `UPDATE`, com `RETURNING`, e trata "não casou" como erro. Exemplo canônico no repo: `stockService.js:299-307` (DESBLOQUEIO).
2. **Nunca `MAX(0, …)`.** Saturar em silêncio devolve menos do que o pedido sem ninguém saber. Foi bug corrigido duas vezes aqui (`liberarReserva` e `DESBLOQUEIO`).
3. **Nunca crie coluna que ninguém escreve.** É o padrão que mordeu três vezes neste módulo (`reserva_id`, `expira_em`, `quantidade_em_inspecao`). Se uma coluna não vai ser escrita nesta etapa, ela não entra — e as que já existem sem escritor **saem**.
4. **`VENCIDO` não é status gravado.** Vencimento é sempre derivado de `data_validade < date('now')`. Não crie coluna, flag ou cron para isso.
5. **Todo teste tem de falhar antes de passar.** Se um teste passar de primeira, mute o código de produção para provar que ele sabe falhar, e diga no relatório o que mutou. Esta base já teve três testes vazios.
6. **`requirePermission` vem ANTES do `multer`.** Invertido, o arquivo é gravado em disco antes do 403. Motivo documentado em `routes/almoxarifado.js:576-578`, coberto por `permissoesRotas.api.test.js`.
7. **Nenhuma ação nova em `ACAO_PERFIS`.** Reaproveite: `visualizar` (ler), `receber_material` (criar lote / anexar certificado), `inspecionar` (bloquear/reprovar/liberar), `editar_material` (editar dados do lote).
8. **Almoxarifado é área física dentro do mesmo site, não filial.** Saldo global por material é correto e intencional. Não segregue saldo por almoxarifado.
9. **Commits em português, sem acento no corpo**, explicando **por quê** (qual era o bug, qual a consequência, o que foi decidido e descartado). Um commit por assunto. **Nunca `git add -A`** — há artefatos de runtime em `server/data/` e `server/uploads/`.
10. **A guarda de saldo negativo por lote só vale quando há lote e quando o material não permite saldo negativo.** Materiais com `permite_saldo_negativo` (ou a config global) continuam podendo ficar negativos — inclusive por lote. Tornar a guarda incondicional quebraria `restricoesEndereco.api.test.js:213`, que insere saldo −10 de propósito.

**Comandos de teste** (rodar da raiz do repo):

```bash
cd server && npm run test:api
cd server && npm run test:almoxarifado
cd server && npm run test:validation && npm run test:safealter && npm run test:sqlite
cd client && CI=true npx react-scripts test --watchAll=false
cd client && CI=true npx react-scripts build
```

Um único arquivo de teste roda direto: `cd server && node tests/api/lotes.api.test.js`.

## Estrutura de arquivos

| Arquivo | Responsabilidade | Task |
|---|---|---|
| `server/services/almoxarifado/lotService.js` **(novo)** | Único dono do ciclo de vida do lote: criar/obter, mudar status com auditoria, listar em ordem FEFO, derivar `vencido` | 1, 6 |
| `server/services/almoxarifado/schema.js` | DDL de `lotes_almoxarifado`; migração de reconstrução de `estoque_saldo_almoxarifado`; `lote_id` em movimentações e itens de recebimento | 1, 2, 5 |
| `server/services/almoxarifado/stockService.js` | Resolução do lote e as três guardas de saída; `getOrCreateSaldo` passa a chavear por `lote_id` | 2, 3, 4 |
| `server/services/almoxarifado/receiptService.js` | Cria o lote na entrada, herdando NF/fornecedor; aplica `controle_certificado` | 5 |
| `server/services/almoxarifado/schemas.js` | Campos de lote no Zod da movimentação e do recebimento | 3, 5 |
| `server/routes/almoxarifado/extended.js` | Rotas de leitura (FEFO) e de mudança de status | 6 |
| `server/routes/almoxarifado.js` | `multer` de certificado (aceita PDF) + rota de upload | 5 |
| `client/src/components/almoxarifado/RecebimentosAlmoxarifado.js` | Campo de lote/validade/corrida por item | 7 |
| `client/src/components/almoxarifado/MovimentacoesAlmoxarifado.js` | Seletor de lote com ordem FEFO no lugar do texto livre | 7 |

---

### Task 1: Tabela de lotes e o serviço que é dono dela

> **✅ ENTREGUE — `b7035dd` + `d6e36e9`.** O fix `d6e36e9` mudou uma decisão do texto abaixo:
> `criarOuObterLote` **recusa** status inválido em vez de coagir para `ATIVO` em silêncio (o código
> do Step 4 abaixo ainda mostra a coerção). Também mudou depois: `lotService` ganhou
> `liberarVencimento`/`vencimentoLiberado` na Task 3b (`556f86d`),
> `liberarBloqueioPorCertificado` na Task 5 (`c11db85`) e `listarLotesDoMaterial` na Task 6
> (`8dfeb0c`). A tabela ganhou `vencimento_liberado_em/_por/_motivo` via `safeAlter`.

**Files:**
- Create: `server/services/almoxarifado/lotService.js`
- Modify: `server/services/almoxarifado/schema.js` (DDL nova, logo após o bloco `estoque_saldo_almoxarifado` que hoje está em `schema.js:630-645`)
- Test: `server/tests/api/lotes.api.test.js` (novo)

**Interfaces:**
- Consumes: `dbRun/dbGet/dbAll` de `services/almoxarifado/db.js`; `registrarAuditoria` de `services/almoxarifado/audit.js`.
- Produces (usado pelas Tasks 3, 5 e 6):
  - `criarOuObterLote(db, user, { material_id, codigo, fornecedor_id, fornecedor_nome, corrida, data_fabricacao, data_validade, nota_fiscal, recebimento_id, recebimento_item_id, status, status_motivo })` → objeto do lote (linha completa). Idempotente por `(material_id, codigo)`: se já existe, devolve o existente **sem sobrescrever** os dados.
  - `getLote(db, loteId)` → linha ou `undefined`.
  - `getLotePorCodigo(db, materialId, codigo)` → linha ou `undefined`.
  - `mudarStatusLote(db, user, loteId, novoStatus, justificativa)` → linha atualizada. `novoStatus` ∈ `ATIVO | BLOQUEADO | REPROVADO`. Justificativa obrigatória.
  - `isVencido(lote, hojeISO)` → boolean, derivado de `data_validade`.
  - `STATUS_LOTE` = `['ATIVO', 'BLOQUEADO', 'REPROVADO']`

- [ ] **Step 1: Escrever o teste que falha**

Criar `server/tests/api/lotes.api.test.js`:

```js
const assert = require('assert');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const lotService = require('../../services/almoxarifado/lotService');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}
const ADMIN = { id: 1, nome: 'Admin Teste', role: 'admin' };

let seq = 0;
async function novoMaterial(db, qtd = 100) {
  seq += 1;
  const r = await dbRun(db,
    `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, ativo) VALUES (?,?,'UN',?,1)`,
    [`LOT-${seq}`, `Material lote ${seq}`, qtd]);
  return r.lastID;
}

(async () => {
  const { db, close } = await createTestApp({ user: ADMIN });

  await test('criar lote grava os dados da NF e nasce ATIVO', async () => {
    const mat = await novoMaterial(db);
    const lote = await lotService.criarOuObterLote(db, ADMIN, {
      material_id: mat, codigo: 'L-001', fornecedor_nome: 'Acme Acos',
      corrida: 'HEAT-99', data_validade: '2030-01-31', nota_fiscal: '12345',
    });
    assert.strictEqual(lote.codigo, 'L-001');
    assert.strictEqual(lote.fornecedor_nome, 'Acme Acos');
    assert.strictEqual(lote.corrida, 'HEAT-99');
    assert.strictEqual(lote.nota_fiscal, '12345');
    assert.strictEqual(lote.status, 'ATIVO', 'lote deveria nascer ATIVO');
  });

  await test('criar duas vezes o mesmo codigo devolve o mesmo lote, sem duplicar', async () => {
    const mat = await novoMaterial(db);
    const a = await lotService.criarOuObterLote(db, ADMIN, { material_id: mat, codigo: 'L-DUP', corrida: 'H1' });
    const b = await lotService.criarOuObterLote(db, ADMIN, { material_id: mat, codigo: 'L-DUP', corrida: 'H2' });
    assert.strictEqual(a.id, b.id, 'criou um segundo lote com o mesmo codigo');
    assert.strictEqual(b.corrida, 'H1', 'a segunda chamada sobrescreveu os dados do lote existente');
    const linhas = await dbAll(db, 'SELECT id FROM lotes_almoxarifado WHERE material_id = ? AND codigo = ?', [mat, 'L-DUP']);
    assert.strictEqual(linhas.length, 1);
  });

  await test('o mesmo codigo em materiais diferentes sao lotes diferentes', async () => {
    const matA = await novoMaterial(db);
    const matB = await novoMaterial(db);
    const a = await lotService.criarOuObterLote(db, ADMIN, { material_id: matA, codigo: 'MESMO' });
    const b = await lotService.criarOuObterLote(db, ADMIN, { material_id: matB, codigo: 'MESMO' });
    assert.notStrictEqual(a.id, b.id);
  });

  await test('lote sem codigo e recusado', async () => {
    const mat = await novoMaterial(db);
    await assert.rejects(() => lotService.criarOuObterLote(db, ADMIN, { material_id: mat, codigo: '  ' }),
      /codigo/i);
  });

  await test('vencido e derivado da data, nao e status gravado', async () => {
    const mat = await novoMaterial(db);
    const vencido = await lotService.criarOuObterLote(db, ADMIN, {
      material_id: mat, codigo: 'L-VENC', data_validade: '2020-01-01' });
    assert.strictEqual(vencido.status, 'ATIVO', 'status nao deve virar VENCIDO');
    assert.strictEqual(lotService.isVencido(vencido), true);

    const semValidade = await lotService.criarOuObterLote(db, ADMIN, {
      material_id: mat, codigo: 'L-SEM-VALIDADE' });
    assert.strictEqual(lotService.isVencido(semValidade), false, 'lote sem validade nao vence');
  });

  await test('mudar status audita e exige justificativa', async () => {
    const mat = await novoMaterial(db);
    const lote = await lotService.criarOuObterLote(db, ADMIN, { material_id: mat, codigo: 'L-STATUS' });

    await assert.rejects(() => lotService.mudarStatusLote(db, ADMIN, lote.id, 'BLOQUEADO', '   '),
      /justificativa/i);
    const intacto = await lotService.getLote(db, lote.id);
    assert.strictEqual(intacto.status, 'ATIVO', 'bloqueou mesmo recusando');

    const bloqueado = await lotService.mudarStatusLote(db, ADMIN, lote.id, 'BLOQUEADO', 'certificado ilegivel');
    assert.strictEqual(bloqueado.status, 'BLOQUEADO');
    assert.strictEqual(bloqueado.status_motivo, 'certificado ilegivel');

    const log = await dbGet(db,
      `SELECT * FROM auditoria_log_almoxarifado WHERE entidade = 'lote' AND entidade_id = ? ORDER BY id DESC LIMIT 1`,
      [lote.id]);
    assert.ok(log, 'mudanca de status nao foi auditada');
    assert.strictEqual(log.justificativa, 'certificado ilegivel');
    assert.strictEqual(JSON.parse(log.dados_anteriores).status, 'ATIVO');
    assert.strictEqual(JSON.parse(log.dados_novos).status, 'BLOQUEADO');
  });

  await test('status invalido e recusado', async () => {
    const mat = await novoMaterial(db);
    const lote = await lotService.criarOuObterLote(db, ADMIN, { material_id: mat, codigo: 'L-INVALIDO' });
    await assert.rejects(() => lotService.mudarStatusLote(db, ADMIN, lote.id, 'VENCIDO', 'tentativa'),
      /status/i);
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd server && node tests/api/lotes.api.test.js`
Expected: FAIL — `Cannot find module '../../services/almoxarifado/lotService'`.

- [ ] **Step 3: Criar a tabela no schema**

Em `server/services/almoxarifado/schema.js`, logo **depois** do bloco `CREATE TABLE IF NOT EXISTS estoque_saldo_almoxarifado` (hoje termina em `schema.js:645`), inserir:

```js
  // ── Lotes (Etapa 6) ──
  // `VENCIDO` NAO e status: vencimento e derivado de data_validade < date('now'), calculado na
  // leitura. Gravar exigiria um cron para virar o status a meia-noite e criaria um estado que
  // diverge da data quando o cron falhasse — mais uma coluna mentindo. Derivado nao diverge.
  await dbRun(db, `CREATE TABLE IF NOT EXISTS lotes_almoxarifado (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    material_id INTEGER NOT NULL,
    codigo TEXT NOT NULL,
    fornecedor_id INTEGER,
    fornecedor_nome TEXT,
    corrida TEXT,
    data_fabricacao DATE,
    data_validade DATE,
    certificado_arquivo TEXT,
    certificado_em DATETIME,
    certificado_por INTEGER,
    status TEXT NOT NULL DEFAULT 'ATIVO',
    status_motivo TEXT,
    recebimento_id INTEGER,
    recebimento_item_id INTEGER,
    nota_fiscal TEXT,
    observacoes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_por INTEGER,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(material_id, codigo),
    FOREIGN KEY (material_id) REFERENCES materiais_almoxarifado(id)
  )`);
```

- [ ] **Step 4: Criar `lotService.js`**

Criar `server/services/almoxarifado/lotService.js`:

```js
/**
 * Ciclo de vida do lote (Etapa 6).
 *
 * Este servico e o UNICO dono da tabela lotes_almoxarifado. Motivo: a Etapa 5 mostrou o custo de
 * ter duas escritas na mesma coluna de retencao (receiptService escrevia direto e o motor tambem),
 * e a correcao foi centralizar. Aqui a regra nasce centralizada.
 *
 * Mudar status de lote NAO e movimentacao de estoque: nenhuma quantidade muda de lugar, e emitir
 * um BLOQUEIO somaria em materiais_almoxarifado.quantidade_bloqueada, contando a mesma retencao
 * duas vezes. O rastro vai para auditoria_log_almoxarifado com entidade = 'lote'.
 */
const { dbRun, dbGet, dbAll } = require('./db');
const { registrarAuditoria } = require('./audit');

const STATUS_LOTE = ['ATIVO', 'BLOQUEADO', 'REPROVADO'];

function erro(msg, status = 400) {
  return Object.assign(new Error(msg), { status });
}

/** Vencimento e SEMPRE derivado — ver a nota no CREATE TABLE. */
function isVencido(lote, hojeISO) {
  if (!lote || !lote.data_validade) return false;
  const hoje = hojeISO || new Date().toISOString().slice(0, 10);
  return String(lote.data_validade).slice(0, 10) < hoje;
}

async function getLote(db, loteId) {
  if (!loteId) return undefined;
  return dbGet(db, 'SELECT * FROM lotes_almoxarifado WHERE id = ?', [loteId]);
}

async function getLotePorCodigo(db, materialId, codigo) {
  if (!materialId || !codigo) return undefined;
  return dbGet(db, 'SELECT * FROM lotes_almoxarifado WHERE material_id = ? AND codigo = ?',
    [materialId, String(codigo).trim()]);
}

/**
 * Idempotente por (material_id, codigo). Se o lote ja existe, devolve o existente SEM sobrescrever:
 * o segundo recebimento do mesmo lote nao pode reescrever a validade que veio no primeiro.
 */
async function criarOuObterLote(db, user, dados) {
  const materialId = dados?.material_id;
  const codigo = dados?.codigo == null ? '' : String(dados.codigo).trim();
  if (!materialId) throw erro('material_id obrigatorio para criar lote');
  if (!codigo) throw erro('codigo do lote obrigatorio');

  const existente = await getLotePorCodigo(db, materialId, codigo);
  if (existente) return existente;

  const status = dados.status && STATUS_LOTE.includes(dados.status) ? dados.status : 'ATIVO';
  const r = await dbRun(db, `INSERT INTO lotes_almoxarifado
    (material_id, codigo, fornecedor_id, fornecedor_nome, corrida, data_fabricacao, data_validade,
     status, status_motivo, recebimento_id, recebimento_item_id, nota_fiscal, observacoes, created_por)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [
    materialId, codigo,
    dados.fornecedor_id || null, dados.fornecedor_nome || null,
    dados.corrida || null, dados.data_fabricacao || null, dados.data_validade || null,
    status, dados.status_motivo || null,
    dados.recebimento_id || null, dados.recebimento_item_id || null,
    dados.nota_fiscal || null, dados.observacoes || null,
    user?.id || null,
  ]);

  const criado = await getLote(db, r.lastID);
  await registrarAuditoria(db, {
    entidade: 'lote', entidade_id: criado.id, acao: 'CRIACAO',
    usuario_id: user?.id, usuario_nome: user?.nome || user?.email,
    dados_novos: { codigo: criado.codigo, material_id: criado.material_id, status: criado.status },
    justificativa: dados.status_motivo || null,
  });
  return criado;
}

/**
 * Guarda no WHERE, como o resto do modulo: se o lote sumiu entre a leitura e a escrita, o UPDATE
 * nao casa e a funcao falha em vez de reportar sucesso sobre nada.
 */
async function mudarStatusLote(db, user, loteId, novoStatus, justificativa) {
  const motivo = justificativa == null ? '' : String(justificativa).trim();
  if (!STATUS_LOTE.includes(novoStatus)) {
    throw erro(`status de lote invalido: ${novoStatus}. Use ${STATUS_LOTE.join(', ')}`);
  }
  if (!motivo) throw erro('justificativa obrigatoria para mudar o status do lote');

  const anterior = await getLote(db, loteId);
  if (!anterior) throw erro('Lote nao encontrado', 404);

  const claim = await dbGet(db, `UPDATE lotes_almoxarifado
    SET status = ?, status_motivo = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND status = ?
    RETURNING id`, [novoStatus, motivo, loteId, anterior.status]);
  if (!claim) throw erro('O status do lote mudou durante a operacao. Recarregue e tente de novo.', 409);

  await registrarAuditoria(db, {
    entidade: 'lote', entidade_id: loteId, acao: 'MUDANCA_STATUS',
    usuario_id: user?.id, usuario_nome: user?.nome || user?.email,
    dados_anteriores: { status: anterior.status, status_motivo: anterior.status_motivo },
    dados_novos: { status: novoStatus, status_motivo: motivo },
    justificativa: motivo,
  });
  return getLote(db, loteId);
}

module.exports = {
  STATUS_LOTE, isVencido, getLote, getLotePorCodigo, criarOuObterLote, mudarStatusLote,
};
```

- [ ] **Step 5: Rodar e ver passar**

Run: `cd server && node tests/api/lotes.api.test.js`
Expected: PASS — `7 passed, 0 failed`.

- [ ] **Step 6: Controle positivo**

Trocar em `lotService.js` o `if (!motivo) throw …` por `if (false) throw …` e rodar de novo.
Expected: o teste `mudar status audita e exige justificativa` **falha**. Desfazer a mutação, rodar de novo e confirmar verde. Registrar no relatório que o controle foi feito.

- [ ] **Step 7: Suíte inteira e commit**

```bash
cd server && npm run test:api && npm run test:almoxarifado
```

```bash
git add server/services/almoxarifado/lotService.js server/services/almoxarifado/schema.js server/tests/api/lotes.api.test.js
git commit -m "Almoxarifado Etapa 6: tabela de lotes e o servico dono dela"
```

---

### Task 2: Reconstruir `estoque_saldo_almoxarifado` — `lote_id`, sem colunas mortas, com chave que funciona

> **✅ ENTREGUE — `015e94c` + `b4e4858`.** Duas divergências do texto abaixo, ambas corretas:
> (a) o `CREATE UNIQUE INDEX` **não** fica logo depois do `CREATE TABLE` como o Step 3 manda — em
> banco existente o `CREATE TABLE IF NOT EXISTS` é no-op e o índice referenciaria `lote_id` antes
> da migração reconstruir a tabela, quebrando o boot; foi movido para **depois** de
> `migrateSaldoLoteId` (comentário no próprio `schema.js:732-734` explica);
> (b) `MAPA_LOCALIZACOES_SQL` lia `quantidade_reservada` do saldo direto em SQL, fora de qualquer
> chamador de `getOrCreateSaldo` — não estava na lista de chamadores do Step 5.
> O fix `b4e4858` fechou um **teste vazio**: o "migração idempotente" rodava sobre banco que já
> nascia na forma nova e saía pelo early-return, sem entrar no corpo da migração; foi renomeado
> honestamente e um teste real (com mutação `SUM`→`MIN` provada) entrou no lugar. O mesmo fix
> devolveu `lt.codigo as lote` em `consultarSaldosPorLocalizacao`, senão a coluna "Lote" do extrato
> ficaria em `—` para sempre, em silêncio.

**Files:**
- Modify: `server/services/almoxarifado/schema.js` (`CREATE TABLE` em `schema.js:631-645`; nova função de migração ao lado de `migrateHistoricoNullableMaterial`, `schema.js:381-435`; chamada dentro de `initSchema`)
- Modify: `server/services/almoxarifado/stockService.js` (`getOrCreateSaldo` em `61-73`; comentário de `syncMaterialTotals` em `26-42`; todos os chamadores que hoje passam `lote`)
- Modify: `server/tests/api/ajusteLocalizacao.api.test.js` (comentário em `100-105` que afirma que as colunas existem)
- Test: `server/tests/api/loteMigracaoSaldo.api.test.js` (novo)

**Interfaces:**
- Consumes: nada de tasks anteriores além da tabela `lotes_almoxarifado` (Task 1).
- Produces: `getOrCreateSaldo(db, materialId, localizacaoId, loteId = null)` — **o quarto parâmetro passa a ser um id numérico, não mais o texto do lote**. Tasks 3 e 5 dependem dessa assinatura.

**Por que reconstruir em vez de remendar:** a sonda no dump de produção (161 MB, 08/08) achou 3 linhas em `estoque_saldo_almoxarifado`, todas com `lote IS NULL`, e **zero** lotes em texto livre. Não há dado a preservar, então cabe a reconstrução completa — que é a única forma de trocar a `UNIQUE` e remover colunas.

- [ ] **Step 1: Escrever o teste que falha**

Criar `server/tests/api/loteMigracaoSaldo.api.test.js`:

```js
const assert = require('assert');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const { initSchema } = require('../../services/almoxarifado/schema');
const stockService = require('../../services/almoxarifado/stockService');
const lotService = require('../../services/almoxarifado/lotService');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}
const ADMIN = { id: 1, nome: 'Admin Teste', role: 'admin' };

let seq = 0;
async function novoMaterial(db, qtd = 100) {
  seq += 1;
  const r = await dbRun(db,
    `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, ativo) VALUES (?,?,'UN',?,1)`,
    [`MIG-${seq}`, `Material migracao ${seq}`, qtd]);
  return r.lastID;
}
const colunas = (db) => dbAll(db, `SELECT name FROM pragma_table_info('estoque_saldo_almoxarifado')`);

(async () => {
  const { db, close } = await createTestApp({ user: ADMIN });

  await test('saldo referencia o lote por id, nao por texto', async () => {
    const nomes = (await colunas(db)).map((c) => c.name);
    assert.ok(nomes.includes('lote_id'), 'faltou a coluna lote_id');
    assert.ok(!nomes.includes('lote'), 'a coluna lote TEXT deveria ter sido removida do saldo');
  });

  await test('as tres colunas de retencao sem escritor sumiram do saldo', async () => {
    const nomes = (await colunas(db)).map((c) => c.name);
    for (const morta of ['quantidade_reservada', 'quantidade_bloqueada', 'quantidade_em_inspecao']) {
      assert.ok(!nomes.includes(morta), `${morta} continua em estoque_saldo_almoxarifado`);
    }
  });

  await test('a chave unica impede duplicata mesmo com localizacao e lote nulos', async () => {
    const mat = await novoMaterial(db);
    await dbRun(db, 'INSERT INTO estoque_saldo_almoxarifado (material_id, quantidade) VALUES (?, 10)', [mat]);
    await assert.rejects(
      () => dbRun(db, 'INSERT INTO estoque_saldo_almoxarifado (material_id, quantidade) VALUES (?, 20)', [mat]),
      /UNIQUE|constraint/i,
      'dois NULL sao distintos para UNIQUE no SQLite — o indice com COALESCE deveria barrar');
  });

  await test('getOrCreateSaldo chaveia por lote_id e nao duplica', async () => {
    const mat = await novoMaterial(db);
    const lote = await lotService.criarOuObterLote(db, ADMIN, { material_id: mat, codigo: 'MIG-L1' });
    const a = await stockService.getOrCreateSaldo(db, mat, null, lote.id);
    const b = await stockService.getOrCreateSaldo(db, mat, null, lote.id);
    assert.strictEqual(a.id, b.id, 'criou duas linhas para o mesmo lote');
    const semLote = await stockService.getOrCreateSaldo(db, mat, null, null);
    assert.notStrictEqual(semLote.id, a.id, 'saldo sem lote e saldo com lote sao linhas diferentes');
  });

  await test('initSchema roda duas vezes sem quebrar (migracao idempotente)', async () => {
    await initSchema(db);
    await initSchema(db);
    const nomes = (await colunas(db)).map((c) => c.name);
    assert.ok(nomes.includes('lote_id'));
    assert.ok(!nomes.includes('quantidade_bloqueada'));
  });

  // REGRESSAO da Etapa 5: AJUSTE com localizacao passa por syncMaterialTotals. A retencao mora em
  // materiais_almoxarifado e tem de continuar intacta depois de mexer no saldo por localizacao.
  await test('AJUSTE por localizacao continua nao evaporando a quarentena', async () => {
    const loc = (await dbRun(db, `INSERT INTO localizacoes_almoxarifado (codigo, descricao) VALUES ('MIG-L','L')`)).lastID;
    const mat = await novoMaterial(db, 100);
    await dbRun(db, 'INSERT INTO estoque_saldo_almoxarifado (material_id, localizacao_id, quantidade) VALUES (?,?,100)', [mat, loc]);
    await stockService.registrarMovimentacao(db, ADMIN, {
      material_id: mat, tipo: 'QUARENTENA', quantidade: 100, justificativa: 'material critico aguardando inspecao' });
    await stockService.registrarMovimentacao(db, ADMIN, {
      material_id: mat, tipo: 'AJUSTE', quantidade: 100, localizacao_destino_id: loc, justificativa: 'contagem' });
    const m = await dbGet(db, 'SELECT * FROM materiais_almoxarifado WHERE id = ?', [mat]);
    assert.strictEqual(m.quantidade_em_inspecao, 100, 'AJUSTE liberou a quarentena');
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd server && node tests/api/loteMigracaoSaldo.api.test.js`
Expected: FAIL nos quatro primeiros testes — `faltou a coluna lote_id`, `quantidade_reservada continua…`, e o insert duplicado **não** rejeita.

- [ ] **Step 3: Trocar o `CREATE TABLE`**

Em `schema.js`, substituir o bloco de `estoque_saldo_almoxarifado` (hoje `631-645`) por:

```js
  // ── Estoque por localização/lote ──
  // Etapa 6: `lote TEXT` virou `lote_id` (FK). As tres colunas de retencao que existiam aqui
  // (reservada/bloqueada/em_inspecao) foram REMOVIDAS: nada no sistema jamais escreveu nelas, a
  // soma era sempre 0, e manter coluna sem escritor e o padrao que ja causou tres bugs neste
  // modulo. A retencao mora exclusivamente em materiais_almoxarifado.
  await dbRun(db, `CREATE TABLE IF NOT EXISTS estoque_saldo_almoxarifado (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    material_id INTEGER NOT NULL,
    localizacao_id INTEGER,
    lote_id INTEGER,
    quantidade REAL DEFAULT 0,
    custo_medio REAL DEFAULT 0,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (material_id) REFERENCES materiais_almoxarifado(id),
    FOREIGN KEY (localizacao_id) REFERENCES localizacoes_almoxarifado(id),
    FOREIGN KEY (lote_id) REFERENCES lotes_almoxarifado(id)
  )`);

  // A UNIQUE de tabela nao serve aqui: no SQLite dois NULL sao DISTINTOS para efeito de UNIQUE,
  // e linha sem localizacao/sem lote e a maioria — a constraint antiga nao impedia duplicata
  // justamente no caso comum. COALESCE fecha o buraco.
  await dbRun(db, `CREATE UNIQUE INDEX IF NOT EXISTS idx_saldo_almox_chave
    ON estoque_saldo_almoxarifado(material_id, COALESCE(localizacao_id,0), COALESCE(lote_id,0))`);
```

- [ ] **Step 4: Escrever a migração de reconstrução**

Em `schema.js`, ao lado de `migrateHistoricoNullableMaterial` (que é o modelo a seguir, `381-435`), adicionar:

```js
const MIGRATION_SALDO_LOTE_ID = 'estoque_saldo_lote_id_e_sem_retencao';

/**
 * Reconstroi estoque_saldo_almoxarifado (Etapa 6):
 *   - `lote TEXT` -> `lote_id INTEGER` (FK para lotes_almoxarifado);
 *   - remove quantidade_reservada/bloqueada/em_inspecao (nunca tiveram escritor);
 *   - troca a UNIQUE de tabela pelo indice com COALESCE.
 *
 * Reconstruir e seguro porque a sonda no dump de producao (2026-08-09) achou 3 linhas, todas com
 * lote IS NULL, e zero lotes em texto livre — nao ha dado a converter. Segue o padrao de
 * migrateHistoricoNullableMaterial.
 */
async function migrateSaldoLoteId(db) {
  await dbRun(db, `CREATE TABLE IF NOT EXISTS schema_migrations_almoxarifado (
    id TEXT PRIMARY KEY,
    applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  const applied = await dbGet(db,
    'SELECT 1 as ok FROM schema_migrations_almoxarifado WHERE id = ?', [MIGRATION_SALDO_LOTE_ID]);
  if (applied) return;

  const tabela = await dbGet(db,
    `SELECT name FROM sqlite_master WHERE type='table' AND name='estoque_saldo_almoxarifado'`);
  const colLoteTexto = tabela && await dbGet(db,
    `SELECT name FROM pragma_table_info('estoque_saldo_almoxarifado') WHERE name = 'lote'`);

  // Banco novo (CREATE TABLE acima ja nasceu na forma nova) ou tabela ausente: nada a fazer.
  if (!tabela || !colLoteTexto) {
    await dbRun(db, 'INSERT OR IGNORE INTO schema_migrations_almoxarifado (id) VALUES (?)',
      [MIGRATION_SALDO_LOTE_ID]);
    return;
  }

  await dbRun(db, 'PRAGMA foreign_keys=OFF');
  try {
    await dbRun(db, `CREATE TABLE estoque_saldo_almoxarifado_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      material_id INTEGER NOT NULL,
      localizacao_id INTEGER,
      lote_id INTEGER,
      quantidade REAL DEFAULT 0,
      custo_medio REAL DEFAULT 0,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (material_id) REFERENCES materiais_almoxarifado(id),
      FOREIGN KEY (localizacao_id) REFERENCES localizacoes_almoxarifado(id),
      FOREIGN KEY (lote_id) REFERENCES lotes_almoxarifado(id)
    )`);

    // Converte o texto livre em lote de verdade. Em producao isto nao move nenhuma linha (zero
    // lotes em texto), mas bancos de desenvolvimento podem ter — e perder o dado em silencio
    // seria pior do que a coluna morta que estamos removendo.
    const comTexto = await dbAll(db,
      `SELECT DISTINCT material_id, TRIM(lote) as codigo FROM estoque_saldo_almoxarifado
       WHERE lote IS NOT NULL AND TRIM(lote) <> ''`);
    for (const linha of comTexto) {
      await dbRun(db,
        `INSERT OR IGNORE INTO lotes_almoxarifado (material_id, codigo, observacoes)
         VALUES (?,?,'Migrado do texto livre em 2026-08-09 (Etapa 6)')`,
        [linha.material_id, linha.codigo]);
    }

    // Soma ao consolidar: se duas linhas duplicadas existirem (a UNIQUE antiga nao impedia com
    // NULL), somar preserva o saldo; descartar uma delas perderia quantidade.
    await dbRun(db, `INSERT INTO estoque_saldo_almoxarifado_new
      (material_id, localizacao_id, lote_id, quantidade, custo_medio, updated_at)
      SELECT s.material_id, s.localizacao_id, l.id,
             SUM(s.quantidade), MAX(COALESCE(s.custo_medio,0)), MAX(s.updated_at)
      FROM estoque_saldo_almoxarifado s
      LEFT JOIN lotes_almoxarifado l
        ON l.material_id = s.material_id AND l.codigo = TRIM(s.lote)
      GROUP BY s.material_id, COALESCE(s.localizacao_id,0), COALESCE(l.id,0)`);

    await dbRun(db, 'DROP TABLE estoque_saldo_almoxarifado');
    await dbRun(db, 'ALTER TABLE estoque_saldo_almoxarifado_new RENAME TO estoque_saldo_almoxarifado');
    await dbRun(db, `CREATE UNIQUE INDEX IF NOT EXISTS idx_saldo_almox_chave
      ON estoque_saldo_almoxarifado(material_id, COALESCE(localizacao_id,0), COALESCE(lote_id,0))`);
    await dbRun(db, 'INSERT INTO schema_migrations_almoxarifado (id) VALUES (?)',
      [MIGRATION_SALDO_LOTE_ID]);
    console.log('✅ Migração estoque_saldo (lote_id + sem colunas de retenção) aplicada');
  } finally {
    await dbRun(db, 'PRAGMA foreign_keys=ON');
  }
}
```

Chamar dentro de `initSchema`, **depois** do `CREATE TABLE` de `lotes_almoxarifado` da Task 1 (a migração insere nele):

```js
  await migrateSaldoLoteId(db);
```

- [ ] **Step 5: Ajustar `getOrCreateSaldo` e os chamadores**

Em `stockService.js`, substituir `getOrCreateSaldo` (`61-73`) por:

```js
async function getOrCreateSaldo(db, materialId, localizacaoId, loteId = null) {
  let saldo = await dbGet(db,
    'SELECT * FROM estoque_saldo_almoxarifado WHERE material_id = ? AND localizacao_id IS ? AND lote_id IS ?',
    [materialId, localizacaoId || null, loteId || null]);
  if (!saldo) {
    const r = await dbRun(db,
      'INSERT INTO estoque_saldo_almoxarifado (material_id, localizacao_id, lote_id) VALUES (?,?,?)',
      [materialId, localizacaoId || null, loteId || null]);
    saldo = await dbGet(db, 'SELECT * FROM estoque_saldo_almoxarifado WHERE id = ?', [r.lastID]);
  }
  return saldo;
}
```

Trocar o quarto argumento em **todos** os chamadores. Eles são, em `stockService.js`: linhas 282 e 288 (TRANSFERENCIA), 450 (AJUSTE com localização), 477 e 482 (entrada/saída), e 594, 606, 618, 635, 636 (`cancelarMovimentacao`). Nos primeiros, o valor vem de `lote` desestruturado dos params → passa a ser `lote_id`. Nos de `cancelarMovimentacao`, vem de `mov.lote` → passa a ser `mov.lote_id`.

Adicionar `lote_id INTEGER` à lista `movCols` (`schema.js:648-666`), mantendo a coluna `lote TEXT` que já está lá:

```js
    'lote_id INTEGER',
```

> **Por que manter `lote TEXT` em movimentações e não é a mesma armadilha:** o ledger é imutável e precisa continuar legível se o lote for renomeado ou removido. `lote_id` serve para juntar, `lote` guarda o código como estava no momento do movimento. **A Task 3 mantém as duas sendo escritas** — a coluna não fica sem escritor.

- [ ] **Step 6: Corrigir os comentários que passam a mentir**

Em `stockService.js`, no bloco de `syncMaterialTotals` (`26-42`), a frase *"`estoque_saldo_almoxarifado` TEM colunas de retenção no CREATE TABLE, mas NADA no sistema escreve nelas"* deixa de ser verdade quando as colunas somem. Substituir por:

```js
 * `estoque_saldo_almoxarifado` NAO tem colunas de retencao — elas existiam, nunca tiveram
 * escritor, e foram removidas na Etapa 6 justamente para que ninguem volte a somar a partir
 * delas. A retencao mora exclusivamente em materiais_almoxarifado.
```

Em `server/tests/api/ajusteLocalizacao.api.test.js`, o comentário de `100-105` diz *"elas existem no CREATE TABLE e ficam sempre em 0"*. Trocar essa oração por: `(as colunas de retencao do saldo foram removidas na Etapa 6)`. **Não** alterar nenhuma asserção desse arquivo.

- [ ] **Step 7: Rodar e ver passar**

```bash
cd server && node tests/api/loteMigracaoSaldo.api.test.js
cd server && npm run test:api && npm run test:almoxarifado && npm run test:sqlite && npm run test:safealter
```
Expected: tudo verde. Se algum teste existente quebrar por causa da assinatura de `getOrCreateSaldo`, **corrija o chamador, não o teste**.

- [ ] **Step 8: Controle positivo**

Remover temporariamente o `CREATE UNIQUE INDEX` do Step 3 e rodar `loteMigracaoSaldo.api.test.js`.
Expected: `a chave unica impede duplicata mesmo com localizacao e lote nulos` **falha**. Restaurar, rodar, confirmar verde.

- [ ] **Step 9: Commit**

```bash
git add server/services/almoxarifado/schema.js server/services/almoxarifado/stockService.js server/tests/api/loteMigracaoSaldo.api.test.js server/tests/api/ajusteLocalizacao.api.test.js
git commit -m "Almoxarifado Etapa 6: saldo passa a referenciar lote por id e perde colunas mortas"
```

---

### Task 3: As três guardas da saída por lote — status, validade e o claim que fecha o −8

> **Estado (2026-08-09): ENTREGUE, após quatro rodadas de review.** `65d78fd` (original), `920d10c`
> (round 1), `f65758d`+`8d7773e` (round 2), `c2e31dc` (round 3), `1effd07`+`4dd6169` (round 4),
> `2d6fec5` (round 5).
> Os Steps abaixo ficam sem marcar por padrão desta etapa (o checklist de feature é consolidado na
> Task 8), mas o que os rounds mudaram **não** está no texto deles — leia
> `.superpowers/sdd/2026-08-09-almoxarifado-etapa6-lotes/task-3-report.md` antes de mexer no motor.
> Em uma linha: a reconciliação `materiais_almoxarifado.quantidade_atual` × soma das linhas de
> `estoque_saldo_almoxarifado` é **soma-das-linhas-é-a-verdade** (decisão de negócio do cliente:
> contagem por localização REDEFINE o saldo); o estorno **ajusta** linha existente e **nunca cria** a
> linha daquela chave, e quando a chave não casa reconcilia o residual **se o material já tiver
> alguma linha** (material com zero linhas = legado, no-op); e existe um escritor conhecido fora do
> motor (`routes/almoxarifado.js:868`, conclusão de inventário) — pendência nomeada na spec 03,
> junto com a pendência de negócio sobre "a primeira contagem redefine o saldo" depois que a linha
> residual sem endereço existe (medido 140, não 40 — decisão do cliente pendente).
> **Depois desta veio a Task 3b** (liberação de vencimento, `556f86d`), que **não estava neste
> plano** — nasceu de um achado do review da própria Task 3 e foi aprovada pelo cliente em
> 2026-08-09. Ver a seção logo abaixo. Depois dela, a Task 4.

**Files:**
- Modify: `server/services/almoxarifado/stockService.js` (`registrarMovimentacao`: destructuring em `197-203`; bloco de saída em `481-485`; INSERT do ledger em `496-509`)
- Modify: `server/services/almoxarifado/schemas.js` (`MovimentacaoSchema`, `51-80`)
- Test: `server/tests/api/loteGuardasSaida.api.test.js` (novo)

**Interfaces:**
- Consumes: `lotService.getLote`, `lotService.getLotePorCodigo`, `lotService.isVencido` (Task 1); `getOrCreateSaldo(db, materialId, localizacaoId, loteId)` (Task 2).
- Produces: `registrarMovimentacao` passa a aceitar `lote_id` (número) **ou** `lote` (código, texto) nos params, e a gravar as duas colunas no ledger. Tasks 4, 5 e 6 dependem disso.

**O bug que esta task fecha** (reproduzido em 2026-08-09): lote `A` com 100 e lote `B` com 2; saída de 10 no lote `B` passa **sem erro** e deixa `B` em −8, porque a guarda de saldo compara com o disponível do **material** (`stockService.js:263-268`) e a subtração acerta a linha do **lote** (`481-484`). `syncMaterialTotals` soma a linha negativa de volta, então o total do material continua coerente e nenhuma tela denuncia.

- [ ] **Step 1: Escrever o teste que falha**

Criar `server/tests/api/loteGuardasSaida.api.test.js`:

```js
const assert = require('assert');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet } = require('../../services/almoxarifado/db');
const stockService = require('../../services/almoxarifado/stockService');
const lotService = require('../../services/almoxarifado/lotService');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}
const ADMIN = { id: 1, nome: 'Admin Teste', role: 'admin' };
const JUST = { justificativa: 'teste de guarda de lote' };

let seq = 0;
async function novoMaterial(db, extra = '') {
  seq += 1;
  const r = await dbRun(db,
    `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, ativo${extra ? ', ' + extra : ''})
     VALUES (?,?,'UN',0,1${extra ? ', 1' : ''})`,
    [`GRD-${seq}`, `Material guarda ${seq}`]);
  return r.lastID;
}
async function entrar(db, materialId, loteId, qtd) {
  await stockService.registrarMovimentacao(db, ADMIN, {
    material_id: materialId, tipo: 'ENTRADA', quantidade: qtd, lote_id: loteId, motivo: 'setup' });
}
const saldoDoLote = (db, materialId, loteId) => dbGet(db,
  'SELECT quantidade FROM estoque_saldo_almoxarifado WHERE material_id = ? AND lote_id IS ?', [materialId, loteId]);

(async () => {
  const { db, close } = await createTestApp({ user: ADMIN });

  await test('saida acima do saldo do lote falha e nao deixa a linha negativa', async () => {
    const mat = await novoMaterial(db);
    const loteA = await lotService.criarOuObterLote(db, ADMIN, { material_id: mat, codigo: 'A' });
    const loteB = await lotService.criarOuObterLote(db, ADMIN, { material_id: mat, codigo: 'B' });
    await entrar(db, mat, loteA.id, 100);
    await entrar(db, mat, loteB.id, 2);

    await assert.rejects(() => stockService.registrarMovimentacao(db, ADMIN, {
      material_id: mat, tipo: 'SAIDA', quantidade: 10, lote_id: loteB.id, ...JUST }),
      /saldo/i, 'o motor aceitou tirar 10 de um lote que tem 2');

    const b = await saldoDoLote(db, mat, loteB.id);
    assert.strictEqual(b.quantidade, 2, `lote B ficou em ${b.quantidade} — a linha do lote foi negativada`);
    const m = await dbGet(db, 'SELECT quantidade_atual FROM materiais_almoxarifado WHERE id = ?', [mat]);
    assert.strictEqual(m.quantidade_atual, 102, 'o total do material foi alterado por uma saida recusada');
  });

  await test('saida dentro do saldo do lote passa e debita o lote certo', async () => {
    const mat = await novoMaterial(db);
    const loteA = await lotService.criarOuObterLote(db, ADMIN, { material_id: mat, codigo: 'A2' });
    const loteB = await lotService.criarOuObterLote(db, ADMIN, { material_id: mat, codigo: 'B2' });
    await entrar(db, mat, loteA.id, 100);
    await entrar(db, mat, loteB.id, 10);

    await stockService.registrarMovimentacao(db, ADMIN, {
      material_id: mat, tipo: 'SAIDA', quantidade: 4, lote_id: loteB.id, ...JUST });

    assert.strictEqual((await saldoDoLote(db, mat, loteB.id)).quantidade, 6);
    assert.strictEqual((await saldoDoLote(db, mat, loteA.id)).quantidade, 100, 'debitou o lote errado');
  });

  await test('saida de lote vencido falha', async () => {
    const mat = await novoMaterial(db);
    const lote = await lotService.criarOuObterLote(db, ADMIN, {
      material_id: mat, codigo: 'VENCIDO', data_validade: '2020-01-01' });
    await entrar(db, mat, lote.id, 50);
    await assert.rejects(() => stockService.registrarMovimentacao(db, ADMIN, {
      material_id: mat, tipo: 'SAIDA', quantidade: 1, lote_id: lote.id, ...JUST }), /vencid/i);
  });

  await test('saida de lote reprovado falha', async () => {
    const mat = await novoMaterial(db);
    const lote = await lotService.criarOuObterLote(db, ADMIN, { material_id: mat, codigo: 'REPROVADO' });
    await entrar(db, mat, lote.id, 50);
    await lotService.mudarStatusLote(db, ADMIN, lote.id, 'REPROVADO', 'falhou no ensaio');
    await assert.rejects(() => stockService.registrarMovimentacao(db, ADMIN, {
      material_id: mat, tipo: 'SAIDA', quantidade: 1, lote_id: lote.id, ...JUST }), /reprovad|bloquead/i);
  });

  await test('saida de lote bloqueado falha, e liberar o lote destrava', async () => {
    const mat = await novoMaterial(db);
    const lote = await lotService.criarOuObterLote(db, ADMIN, { material_id: mat, codigo: 'BLOQ' });
    await entrar(db, mat, lote.id, 50);
    await lotService.mudarStatusLote(db, ADMIN, lote.id, 'BLOQUEADO', 'aguardando certificado');
    await assert.rejects(() => stockService.registrarMovimentacao(db, ADMIN, {
      material_id: mat, tipo: 'SAIDA', quantidade: 1, lote_id: lote.id, ...JUST }), /bloquead/i);

    await lotService.mudarStatusLote(db, ADMIN, lote.id, 'ATIVO', 'certificado anexado');
    await stockService.registrarMovimentacao(db, ADMIN, {
      material_id: mat, tipo: 'SAIDA', quantidade: 1, lote_id: lote.id, ...JUST });
    assert.strictEqual((await saldoDoLote(db, mat, lote.id)).quantidade, 49);
  });

  await test('a movimentacao guarda lote_id e o codigo do lote', async () => {
    const mat = await novoMaterial(db);
    const lote = await lotService.criarOuObterLote(db, ADMIN, { material_id: mat, codigo: 'LEDGER-1' });
    await entrar(db, mat, lote.id, 5);
    const mov = await dbGet(db,
      'SELECT lote_id, lote FROM movimentacoes_almoxarifado WHERE material_id = ? ORDER BY id DESC LIMIT 1', [mat]);
    assert.strictEqual(mov.lote_id, lote.id);
    assert.strictEqual(mov.lote, 'LEDGER-1', 'o ledger precisa guardar o codigo, nao so o id');
  });

  await test('aceita o codigo do lote no lugar do id', async () => {
    const mat = await novoMaterial(db);
    const lote = await lotService.criarOuObterLote(db, ADMIN, { material_id: mat, codigo: 'POR-CODIGO' });
    await entrar(db, mat, lote.id, 20);
    await stockService.registrarMovimentacao(db, ADMIN, {
      material_id: mat, tipo: 'SAIDA', quantidade: 5, lote: 'POR-CODIGO', ...JUST });
    assert.strictEqual((await saldoDoLote(db, mat, lote.id)).quantidade, 15);
  });

  await test('codigo de lote inexistente na saida falha', async () => {
    const mat = await novoMaterial(db);
    await stockService.registrarMovimentacao(db, ADMIN, {
      material_id: mat, tipo: 'ENTRADA', quantidade: 10, motivo: 'setup' });
    await assert.rejects(() => stockService.registrarMovimentacao(db, ADMIN, {
      material_id: mat, tipo: 'SAIDA', quantidade: 1, lote: 'NAO-EXISTE', ...JUST }),
      /lote/i);
  });

  await test('material que permite saldo negativo continua podendo ficar negativo no lote', async () => {
    const mat = await novoMaterial(db);
    await dbRun(db, 'UPDATE materiais_almoxarifado SET permite_saldo_negativo = 1 WHERE id = ?', [mat]);
    const lote = await lotService.criarOuObterLote(db, ADMIN, { material_id: mat, codigo: 'NEG' });
    await entrar(db, mat, lote.id, 2);
    await stockService.registrarMovimentacao(db, ADMIN, {
      material_id: mat, tipo: 'SAIDA', quantidade: 10, lote_id: lote.id, ...JUST });
    assert.strictEqual((await saldoDoLote(db, mat, lote.id)).quantidade, -8,
      'a guarda por lote nao pode valer para material que permite saldo negativo');
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd server && node tests/api/loteGuardasSaida.api.test.js`
Expected: FAIL. O primeiro teste tem de falhar com `o motor aceitou tirar 10 de um lote que tem 2` — se ele falhar por outro motivo (erro de setup, coluna inexistente), **conserte o setup e rode de novo até falhar pelo motivo certo**. Isso já deu errado nesta base: um TDD da Etapa 4 falhou por `NOT NULL constraint` e não pela ausência da feature.

- [ ] **Step 3: Resolver o lote no motor**

Em `stockService.js`, adicionar `lote_id` ao destructuring de `registrarMovimentacao` (`197-203`), ao lado de `lote`:

```js
    localizacao_origem_id, localizacao_destino_id, lote, lote_id, projeto_id, os_id, cliente_id,
```

Logo depois da validação de tipo e do `getMaterial` (após `stockService.js:224`), inserir a resolução:

```js
  // ── Lote (Etapa 6) ──────────────────────────────────────────────────────────
  // Aceita `lote_id` (numero) ou `lote` (codigo). O ledger guarda os DOIS: `lote_id` para juntar
  // e `lote` com o codigo congelado, porque movimentacao e imutavel e precisa continuar legivel
  // se o lote for renomeado.
  const lotService = require('./lotService');
  let loteResolvido = null;
  if (lote_id) {
    loteResolvido = await lotService.getLote(db, lote_id);
    if (!loteResolvido) throw Object.assign(new Error('Lote nao encontrado'), { status: 400 });
    if (loteResolvido.material_id !== material_id) {
      throw Object.assign(new Error('O lote informado pertence a outro material'), { status: 400 });
    }
  } else if (lote && String(lote).trim()) {
    loteResolvido = await lotService.getLotePorCodigo(db, material_id, lote);
    // Entrada cria o lote que ainda nao existe; saida nao pode inventar lote.
    if (!loteResolvido) {
      if (tiposEntrada.includes(tipo)) {
        loteResolvido = await lotService.criarOuObterLote(db, user, { material_id, codigo: lote });
      } else {
        throw Object.assign(new Error(`Lote nao encontrado para este material: ${String(lote).trim()}`), { status: 400 });
      }
    }
  }
  const loteIdFinal = loteResolvido ? loteResolvido.id : null;
  const loteCodigoFinal = loteResolvido ? loteResolvido.codigo : (lote || null);
```

> **Atenção à ordem:** `tiposEntrada` é declarado em `stockService.js:230`. Mova o bloco acima para **depois** dessa declaração, ou ele lerá `tiposEntrada` antes da inicialização (`ReferenceError` em `const`).

- [ ] **Step 4: Guardas de status e validade na saída**

Dentro do ramo `else if (tiposSaida.includes(tipo))` (a partir de `stockService.js:258`), **antes** do cálculo de `saldoPosterior`, inserir:

```js
    if (loteResolvido) {
      if (loteResolvido.status !== 'ATIVO') {
        throw Object.assign(
          new Error(`Lote ${loteResolvido.codigo} esta ${loteResolvido.status.toLowerCase()} e nao pode ser utilizado`),
          { status: 400 });
      }
      if (lotService.isVencido(loteResolvido)) {
        throw Object.assign(
          new Error(`Lote ${loteResolvido.codigo} vencido em ${loteResolvido.data_validade} e nao pode sair. `
            + 'Libere o lote pela tela de lotes, com justificativa, se for usa-lo mesmo assim.'),
          { status: 400 });
      }
    }
```

- [ ] **Step 5: Claim atômico do saldo do lote**

Substituir o bloco `if (locSaida)` (`stockService.js:481-485`) por:

```js
    if (locSaida) {
      const saldo = await getOrCreateSaldo(db, material_id, locSaida, loteIdFinal);
      if (loteIdFinal && !permiteNegativo) {
        // Guarda no WHERE, como o resto do motor. Sem isto a subtracao abaixo negativa a linha do
        // lote em silencio: a guarda de saldo insuficiente la em cima compara com o disponivel do
        // MATERIAL, e syncMaterialTotals soma a linha negativa de volta, entao o total continua
        // coerente e nada denuncia (reproduzido em 2026-08-09: lote B com 2 aceitou saida de 10 e
        // ficou em -8).
        const claim = await dbGet(db, `UPDATE estoque_saldo_almoxarifado
          SET quantidade = quantidade - ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ? AND quantidade >= ?
          RETURNING id`, [quantidade, saldo.id, quantidade]);
        if (!claim) {
          throw Object.assign(
            new Error(`Saldo insuficiente no lote ${loteCodigoFinal}. Disponivel: ${saldo.quantidade} ${material.unidade}`),
            { status: 400 });
        }
      } else {
        await dbRun(db, 'UPDATE estoque_saldo_almoxarifado SET quantidade = quantidade - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
          [quantidade, saldo.id]);
      }
    }
```

> **Ordem importa e é problema conhecido:** este `UPDATE` roda **depois** de `materiais_almoxarifado.quantidade_atual` já ter sido debitado (`stockService.js:440-444`). Se o claim falhar, o total do material fica debitado sem contrapartida. Por isso as guardas do Step 4 vêm antes de qualquer efeito, e por isso o claim precisa **compensar** ao falhar. Antes do `throw`, devolva o físico:
>
> ```js
>           await dbRun(db, `UPDATE materiais_almoxarifado
>             SET quantidade_atual = quantidade_atual + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
>             [quantidade, material_id]);
> ```
>
> O teste `saida acima do saldo do lote falha e nao deixa a linha negativa` verifica exatamente isso ao afirmar `quantidade_atual === 102` depois da recusa. Compensação explícita é o padrão do módulo — não há transações (ver [[migracao-sqlite-para-postgres]]).

Trocar também o bloco `if (locEntrada)` (`476-480`) e os demais `getOrCreateSaldo` de `registrarMovimentacao` para passar `loteIdFinal` no lugar de `lote`.

- [ ] **Step 6: Gravar as duas colunas no ledger**

No `INSERT INTO movimentacoes_almoxarifado` (`496-509`), acrescentar `lote_id` à lista de colunas e mais um `?` aos valores:

```js
     usuario_id, usuario_nome, localizacao_origem_id, localizacao_destino_id, lote, lote_id, unidade,
```

e no array de parâmetros, trocar `lote || null` por:

```js
    localizacao_origem_id || null, localizacao_destino_id || null, loteCodigoFinal, loteIdFinal, material.unidade,
```

- [ ] **Step 7: Aceitar `lote_id` na rota**

Em `server/services/almoxarifado/schemas.js`, dentro de `MovimentacaoSchema` (logo abaixo de `lote: z.string().optional(),`, hoje `schemas.js:62`):

```js
  // Sem declarar aqui, o z.object descarta a chave em silencio e o motor nunca ve o lote_id
  // vindo da v2 — foi exatamente o que aconteceu com reserva_id na Etapa 4.
  lote_id: z.number().int().positive().optional(),
```

- [ ] **Step 8: Rodar e ver passar**

```bash
cd server && node tests/api/loteGuardasSaida.api.test.js
cd server && npm run test:api && npm run test:almoxarifado
```
Expected: `9 passed, 0 failed` no arquivo novo, e todas as suítes verdes.

- [ ] **Step 9: Controle positivo**

Trocar `WHERE id = ? AND quantidade >= ?` por `WHERE id = ?` no claim do Step 5 e rodar.
Expected: `saida acima do saldo do lote falha e nao deixa a linha negativa` **falha** com a linha em −8 — a mesma assinatura do bug original. Restaurar e confirmar verde.

- [ ] **Step 10: Commit**

```bash
git add server/services/almoxarifado/stockService.js server/services/almoxarifado/schemas.js server/tests/api/loteGuardasSaida.api.test.js
git commit -m "Almoxarifado Etapa 6: saida por lote valida status, validade e saldo do proprio lote"
```

---

### Task 3b: Liberação de vencimento de lote para uso — **NÃO ESTAVA NESTE PLANO**

> **✅ ENTREGUE — `556f86d`.** Relatório completo:
> `.superpowers/sdd/2026-08-09-almoxarifado-etapa6-lotes/task-3b-report.md`.

**Por que ela existiu.** O review da Task 3 achou que a guarda de vencimento tinha sido escrita
**sem** o caminho de liberação que o próprio cliente pedira no design — e, pior, que a mensagem de
erro mandava o operador *"liberar o lote pela tela de lotes, com justificativa"*, coisa que **não
destravava nada**: não existia nem tela, nem rota, nem coluna. Era uma parede com placa de porta.
O cliente aprovou a task no meio da etapa, em 2026-08-09.

**O que ela entregou:**

- `lotes_almoxarifado.vencimento_liberado_em` / `_por` / `_motivo` (via `safeAlter`, não reescrevendo
  o `CREATE TABLE` que já existia desde a Task 1) — `schema.js:773-775`;
- `lotService.vencimentoLiberado(lote)` → boolean, só olha se `vencimento_liberado_em` está
  preenchido;
- `lotService.liberarVencimento(db, user, loteId, justificativa)` — justificativa obrigatória (400),
  lote inexistente 404, lote **não vencido** recusado (400, evita registro que confunde auditoria
  depois), guarda no `WHERE` contra `data_validade` (a mesma coluna que `isVencido` acabou de ler →
  409 se mudou no meio), auditado com `acao='LIBERACAO_VENCIMENTO'`;
- `PUT /api/almoxarifado/lotes/:id/liberar-vencimento` (perm. `inspecionar` — nenhuma ação nova em
  `ACAO_PERFIS`) — `extended.js:483`;
- a guarda de saída em `stockService.js:451` passou a ser
  `isVencido(lote) && !vencimentoLiberado(lote)`;
- `server/tests/api/loteVencimentoLiberacao.api.test.js` — 8 casos, com controle positivo que provou
  a mutação (removida a cláusula `&& !vencimentoLiberado`, exatamente 1 teste falhou).

**A decisão contraintuitiva que alguém vai tentar "simplificar" — não simplifique:**

> **Liberar o vencimento NÃO "desvence" o lote.** `isVencido` continua derivado **só** de
> `data_validade` e continua devolvendo `true` depois da liberação. O que muda é a **decisão da
> guarda de saída**, não o fato. Fundir as duas coisas num campo só (um `status = 'LIBERADO'`, ou
> um `isVencido` que passa a considerar a liberação) destruiria a informação de que aquele material
> está fora da validade — que é exatamente o que a auditoria precisa enxergar. Por isso a listagem
> FEFO devolve `vencido: true` **e** `vencimento_liberado: true` lado a lado, e a tela escreve
> "(vencido, liberado)". Há teste dedicado segurando isso: `lote continua marcado como vencido
> depois da liberacao`.

**Ordem das guardas — status antes de vencimento, de propósito.** Um lote `BLOQUEADO` **e** vencido,
mesmo com o vencimento liberado, falha por **bloqueio**, com a mensagem de bloqueio. Falhar por
vencimento mandaria o operador liberar de novo algo que já está liberado. Coberto por `liberacao
nao destrava lote bloqueado` e, na listagem, por `bloqueado com vencimento liberado continua nao
elegivel (status manda por cima)`.

**O que a 3b NÃO resolveu, e virou pendência:** não existe **tela** que chame essa rota. A mensagem
de erro do motor hoje cita o endpoint HTTP (`PUT /api/almoxarifado/lotes/:id/liberar-vencimento`)
para um operador que só tem navegador. É a mesma classe de problema que a 3b nasceu para consertar,
um nível acima — registrada como pendência (a) na spec 10.

---

### Task 4: `controle_lote` deixa de ser flag morta

> **✅ ENTREGUE — `2dbbf60`**, conforme o texto abaixo, sem divergências.
> Detalhe de escopo que o texto não deixa explícito e que vale repetir: `AJUSTE_POSITIVO` e
> `AJUSTE_NEGATIVO` estão em `tiposEntrada`/`tiposSaida`, então a guarda **exige** lote neles.
> Só o `AJUSTE` puro é isento.

**Files:**
- Modify: `server/services/almoxarifado/stockService.js` (`registrarMovimentacao`, junto do bloco de resolução do lote da Task 3)
- Test: `server/tests/api/loteControleObrigatorio.api.test.js` (novo)

**Interfaces:**
- Consumes: a resolução de lote e `loteIdFinal` da Task 3.
- Produces: nada novo — só passa a recusar movimentação sem lote em material controlado.

**Contexto:** `controle_lote` é uma de **cinco** flags (`controle_lote`, `controle_certificado`, `controle_serie`, `controle_validade`, `controle_corrida`) que hoje só existem no CRUD (`routes/almoxarifado.js:295-394`, `schemas.js:178-195`, `MaterialAlmoxarifadoForm.js:28`) e não são lidas por nenhuma regra. Esta task acende a primeira. `controle_certificado` é acesa na Task 5. As outras três ficam para as etapas 6b/6c — e isso tem de ficar escrito na spec (Task 8), não subentendido.

- [ ] **Step 1: Escrever o teste que falha**

Criar `server/tests/api/loteControleObrigatorio.api.test.js`:

```js
const assert = require('assert');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet } = require('../../services/almoxarifado/db');
const stockService = require('../../services/almoxarifado/stockService');
const lotService = require('../../services/almoxarifado/lotService');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}
const ADMIN = { id: 1, nome: 'Admin Teste', role: 'admin' };
const JUST = { justificativa: 'teste de controle de lote' };

let seq = 0;
async function novoMaterial(db, controlado) {
  seq += 1;
  const r = await dbRun(db,
    `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, ativo, controle_lote)
     VALUES (?,?,'UN',0,1,?)`, [`CTL-${seq}`, `Material controlado ${seq}`, controlado ? 1 : 0]);
  return r.lastID;
}

(async () => {
  const { db, close } = await createTestApp({ user: ADMIN });

  await test('entrada sem lote em material com controle_lote falha', async () => {
    const mat = await novoMaterial(db, true);
    await assert.rejects(() => stockService.registrarMovimentacao(db, ADMIN, {
      material_id: mat, tipo: 'ENTRADA', quantidade: 10, motivo: 'sem lote' }), /lote/i);
    const m = await dbGet(db, 'SELECT quantidade_atual FROM materiais_almoxarifado WHERE id = ?', [mat]);
    assert.strictEqual(m.quantidade_atual, 0, 'entrou estoque mesmo com a movimentacao recusada');
  });

  await test('saida sem lote em material com controle_lote falha', async () => {
    const mat = await novoMaterial(db, true);
    const lote = await lotService.criarOuObterLote(db, ADMIN, { material_id: mat, codigo: 'CTL-A' });
    await stockService.registrarMovimentacao(db, ADMIN, {
      material_id: mat, tipo: 'ENTRADA', quantidade: 10, lote_id: lote.id, motivo: 'setup' });
    await assert.rejects(() => stockService.registrarMovimentacao(db, ADMIN, {
      material_id: mat, tipo: 'SAIDA', quantidade: 1, ...JUST }), /lote/i);
  });

  await test('com lote, o material controlado movimenta normalmente', async () => {
    const mat = await novoMaterial(db, true);
    const lote = await lotService.criarOuObterLote(db, ADMIN, { material_id: mat, codigo: 'CTL-B' });
    await stockService.registrarMovimentacao(db, ADMIN, {
      material_id: mat, tipo: 'ENTRADA', quantidade: 10, lote_id: lote.id, motivo: 'setup' });
    await stockService.registrarMovimentacao(db, ADMIN, {
      material_id: mat, tipo: 'SAIDA', quantidade: 3, lote_id: lote.id, ...JUST });
    const m = await dbGet(db, 'SELECT quantidade_atual FROM materiais_almoxarifado WHERE id = ?', [mat]);
    assert.strictEqual(m.quantidade_atual, 7);
  });

  await test('material SEM controle_lote continua movimentando sem lote', async () => {
    const mat = await novoMaterial(db, false);
    await stockService.registrarMovimentacao(db, ADMIN, {
      material_id: mat, tipo: 'ENTRADA', quantidade: 10, motivo: 'sem controle' });
    await stockService.registrarMovimentacao(db, ADMIN, {
      material_id: mat, tipo: 'SAIDA', quantidade: 4, ...JUST });
    const m = await dbGet(db, 'SELECT quantidade_atual FROM materiais_almoxarifado WHERE id = ?', [mat]);
    assert.strictEqual(m.quantidade_atual, 6);
  });

  // AJUSTE e contagem de inventario: exigir lote nele travaria a regularizacao do saldo que
  // existe fisicamente sem lote conhecido — justamente o caminho de saida para quem ligou a flag
  // com estoque antigo em casa.
  await test('AJUSTE nao exige lote nem em material controlado', async () => {
    const mat = await novoMaterial(db, true);
    await stockService.registrarMovimentacao(db, ADMIN, {
      material_id: mat, tipo: 'AJUSTE', quantidade: 5, justificativa: 'contagem' });
    const m = await dbGet(db, 'SELECT quantidade_atual FROM materiais_almoxarifado WHERE id = ?', [mat]);
    assert.strictEqual(m.quantidade_atual, 5);
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd server && node tests/api/loteControleObrigatorio.api.test.js`
Expected: FAIL nos dois primeiros — a movimentação passa sem lote.

- [ ] **Step 3: Implementar a guarda**

Em `stockService.js`, logo **depois** do bloco de resolução do lote (Task 3, Step 3) e **antes** de qualquer efeito de saldo:

```js
  // Etapa 6: controle_lote deixa de ser flag morta. AJUSTE fica de fora de proposito — e o
  // caminho de regularizacao de quem ligou a flag com estoque antigo sem lote em casa; exigir
  // lote nele trancaria a porta de saida.
  if (material.controle_lote && !loteIdFinal
      && (tiposEntrada.includes(tipo) || tiposSaida.includes(tipo))) {
    throw Object.assign(
      new Error(`O material ${material.codigo} exige lote em toda entrada e saida (controle por lote ligado)`),
      { status: 400 });
  }
```

- [ ] **Step 4: Rodar e ver passar**

```bash
cd server && node tests/api/loteControleObrigatorio.api.test.js
cd server && npm run test:api && npm run test:almoxarifado
```
Expected: `5 passed, 0 failed` e suítes verdes.

- [ ] **Step 5: Controle positivo**

Trocar `if (material.controle_lote && !loteIdFinal` por `if (false &&` e rodar.
Expected: os dois primeiros testes falham. Restaurar, confirmar verde.

- [ ] **Step 6: Commit**

```bash
git add server/services/almoxarifado/stockService.js server/tests/api/loteControleObrigatorio.api.test.js
git commit -m "Almoxarifado Etapa 6: controle_lote passa a ser exigido na entrada e na saida"
```

---

### Task 5: O lote nasce no recebimento, e o certificado passa a valer

> **✅ ENTREGUE — `64686b1` + `c11db85`.** Três divergências reais do texto abaixo, todas
> confirmadas por leitura do código antes de escrever o teste (o plano autoriza isso):
> as funções chamam-se **`processarNota`** (não `processarRecebimento`) e **`salvarDadosFiscal`**
> (não `atualizarDadosFiscais`); e `!item.certificado_arquivo` do Step 5 é **constante** — a coluna
> não existe no item de recebimento (as três colunas de certificado vivem em `lotes_almoxarifado`),
> então a condição virou só `!!item.controle_certificado`, que acerta por semântica e não por
> acaso.
> O fix `c11db85` corrigiu uma **corrida** que o Step 6 introduzia: a rota lia o lote, gravava o
> arquivo (`await`) e **só então** decidia se liberava — janela suficiente para um lote virar
> `REPROVADO` no meio e ser liberado por engano. A pré-condição foi inteira para dentro do `WHERE`
> de `lotService.liberarBloqueioPorCertificado`, chamada incondicionalmente.
> A criação do lote também foi para dentro do `if (qtd > 0)`: item com quantidade zero não move
> estoque, então não deve criar lote nem gravar `lote_id`.

**Files:**
- Modify: `server/services/almoxarifado/schema.js` (`recebItemCols`, hoje `schema.js:795-809`)
- Modify: `server/services/almoxarifado/receiptService.js` (`atualizarDadosFiscais` itens, `269-291`; `darEntradaEstoque`, `308-355`)
- Modify: `server/routes/almoxarifado.js` (novo `multer` de certificado ao lado do `uploadAlmox` em `45-59`; rota de upload)
- Test: `server/tests/api/loteRecebimento.api.test.js` (novo)

**Interfaces:**
- Consumes: `lotService.criarOuObterLote` e `lotService.mudarStatusLote` (Task 1); `registrarMovimentacao` com `lote_id` (Task 3).
- Produces: `POST /api/almoxarifado/lotes/:id/certificado` (campo de arquivo `certificado`) → `{ id, certificado_arquivo, status }`.

**Contexto do defeito:** `receiptService.js:309` faz `SELECT ri.*, m.material_critico, m.controle_certificado` e **nunca usa** `controle_certificado`. Quem auditar por `grep controle_certificado` acha essa linha e conclui que a entrada verifica certificado. Não verifica. Esta task faz a coluna selecionada ser usada de verdade.

- [ ] **Step 1: Escrever o teste que falha**

Criar `server/tests/api/loteRecebimento.api.test.js`:

```js
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet } = require('../../services/almoxarifado/db');
const receiptService = require('../../services/almoxarifado/receiptService');
const lotService = require('../../services/almoxarifado/lotService');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}
const ADMIN = { id: 1, nome: 'Admin Teste', role: 'admin' };

let seq = 0;
async function novoMaterial(db, { certificado = false } = {}) {
  seq += 1;
  const r = await dbRun(db,
    `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, ativo, controle_certificado)
     VALUES (?,?,'UN',0,1,?)`, [`REC-${seq}`, `Material recebimento ${seq}`, certificado ? 1 : 0]);
  return r.lastID;
}

/** Cria um recebimento pronto para processar, com um item e o lote informado. */
async function recebimentoComItem(db, materialId, item = {}) {
  seq += 1;
  const rec = await dbRun(db, `INSERT INTO recebimentos_material_almoxarifado
    (numero, status, nota_fiscal, fornecedor_nome, data_emissao_nf, data_entrada_nf, valor_total_nota)
    VALUES (?, 'EM_ENTRADA_NF', ?, 'Acme Acos', '2026-08-01', '2026-08-02', 1000)`,
    [`REC-N-${seq}`, `NF-${seq}`]);
  await dbRun(db, `INSERT INTO recebimentos_material_itens_almoxarifado
    (recebimento_id, material_id, quantidade_esperada, quantidade_recebida, lote, data_validade_lote, corrida_lote)
    VALUES (?,?,?,?,?,?,?)`, [
    rec.lastID, materialId, item.qtd ?? 10, item.qtd ?? 10,
    item.lote ?? null, item.data_validade ?? null, item.corrida ?? null]);
  return rec.lastID;
}

(async () => {
  const { app, db, close } = await createTestApp({ user: ADMIN });

  await test('processar recebimento cria o lote com dados da NF', async () => {
    const mat = await novoMaterial(db);
    const recId = await recebimentoComItem(db, mat, { lote: 'NF-LOTE-1', data_validade: '2030-06-30', corrida: 'H-77' });
    await receiptService.processarRecebimento(db, ADMIN, recId, {});

    const lote = await lotService.getLotePorCodigo(db, mat, 'NF-LOTE-1');
    assert.ok(lote, 'o recebimento nao criou o lote');
    assert.strictEqual(lote.data_validade, '2030-06-30');
    assert.strictEqual(lote.corrida, 'H-77');
    assert.strictEqual(lote.fornecedor_nome, 'Acme Acos');
    assert.strictEqual(lote.recebimento_id, recId);
    assert.strictEqual(lote.status, 'ATIVO');
  });

  await test('a entrada de estoque fica vinculada ao lote criado', async () => {
    const mat = await novoMaterial(db);
    const recId = await recebimentoComItem(db, mat, { lote: 'NF-LOTE-2', qtd: 25 });
    await receiptService.processarRecebimento(db, ADMIN, recId, {});

    const lote = await lotService.getLotePorCodigo(db, mat, 'NF-LOTE-2');
    const saldo = await dbGet(db,
      'SELECT quantidade FROM estoque_saldo_almoxarifado WHERE material_id = ? AND lote_id = ?', [mat, lote.id]);
    assert.strictEqual(saldo.quantidade, 25, 'o saldo nao foi creditado no lote');
    const mov = await dbGet(db,
      'SELECT lote_id FROM movimentacoes_almoxarifado WHERE recebimento_id = ? AND tipo = ?', [recId, 'ENTRADA_COMPRA']);
    assert.strictEqual(mov.lote_id, lote.id);
  });

  await test('sem certificado, o lote nasce BLOQUEADO e o material nao sai', async () => {
    const mat = await novoMaterial(db, { certificado: true });
    const recId = await recebimentoComItem(db, mat, { lote: 'SEM-CERT', qtd: 12 });
    await receiptService.processarRecebimento(db, ADMIN, recId, {});

    const lote = await lotService.getLotePorCodigo(db, mat, 'SEM-CERT');
    assert.strictEqual(lote.status, 'BLOQUEADO', 'lote sem certificado deveria nascer bloqueado');
    assert.match(lote.status_motivo || '', /certificado/i);

    const m = await dbGet(db, 'SELECT quantidade_atual FROM materiais_almoxarifado WHERE id = ?', [mat]);
    assert.strictEqual(m.quantidade_atual, 12,
      'o material entrou fisicamente — bloquear a ENTRADA foi o erro corrigido na Etapa 5');
  });

  await test('anexar o certificado libera o lote', async () => {
    const mat = await novoMaterial(db, { certificado: true });
    const recId = await recebimentoComItem(db, mat, { lote: 'CERT-DEPOIS', qtd: 5 });
    await receiptService.processarRecebimento(db, ADMIN, recId, {});
    const lote = await lotService.getLotePorCodigo(db, mat, 'CERT-DEPOIS');
    assert.strictEqual(lote.status, 'BLOQUEADO');

    const res = await request(app)
      .post(`/api/almoxarifado/lotes/${lote.id}/certificado`)
      .attach('certificado', Buffer.from('%PDF-1.4 certificado de qualidade'), 'cert.pdf');
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));

    const liberado = await lotService.getLote(db, lote.id);
    assert.strictEqual(liberado.status, 'ATIVO', 'anexar certificado deveria liberar o lote');
    assert.ok(liberado.certificado_arquivo, 'nome do arquivo nao foi gravado');
  });

  await test('material sem controle_certificado nasce ATIVO mesmo sem anexo', async () => {
    const mat = await novoMaterial(db, { certificado: false });
    const recId = await recebimentoComItem(db, mat, { lote: 'SEM-CTRL' });
    await receiptService.processarRecebimento(db, ADMIN, recId, {});
    const lote = await lotService.getLotePorCodigo(db, mat, 'SEM-CTRL');
    assert.strictEqual(lote.status, 'ATIVO');
  });

  await test('item sem lote continua processando (material nao controlado)', async () => {
    const mat = await novoMaterial(db);
    const recId = await recebimentoComItem(db, mat, { lote: null, qtd: 7 });
    await receiptService.processarRecebimento(db, ADMIN, recId, {});
    const m = await dbGet(db, 'SELECT quantidade_atual FROM materiais_almoxarifado WHERE id = ?', [mat]);
    assert.strictEqual(m.quantidade_atual, 7);
  });

  await test('upload de certificado sem permissao nao grava arquivo', async () => {
    const mat = await novoMaterial(db, { certificado: true });
    const recId = await recebimentoComItem(db, mat, { lote: 'PERM-1' });
    await receiptService.processarRecebimento(db, ADMIN, recId, {});
    const lote = await lotService.getLotePorCodigo(db, mat, 'PERM-1');

    const ctx = await createTestApp({ user: { id: 9, nome: 'Producao', perfil_almoxarifado: 'PRODUCAO' } });
    const res = await request(ctx.app)
      .post(`/api/almoxarifado/lotes/${lote.id}/certificado`)
      .attach('certificado', Buffer.from('%PDF-1.4'), 'cert.pdf');
    assert.strictEqual(res.status, 403, 'perfil PRODUCAO nao pode anexar certificado');
    await ctx.close();
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
```

> **Nota para quem implementa:** confira a assinatura real de `receiptService.processarRecebimento` antes de escrever o teste — o nome usado aqui vem da leitura de `receiptService.js`. Se a função exportada tiver outro nome ou outra ordem de parâmetros, **ajuste o teste para a realidade do código** e diga isso no relatório; não invente um wrapper só para o teste casar.

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd server && node tests/api/loteRecebimento.api.test.js`
Expected: FAIL — coluna `data_validade_lote` não existe e o lote não é criado.

- [ ] **Step 3: Colunas de lote no item de recebimento**

Em `schema.js`, acrescentar a `recebItemCols` (hoje `795-809`):

```js
    // Etapa 6: o lote nasce aqui. `lote` TEXT ja existia e vira o codigo digitado na conferencia;
    // estes tres completam o que a NF traz e o lote precisa.
    'lote_id INTEGER',
    'data_validade_lote DATE',
    'corrida_lote TEXT',
```

- [ ] **Step 4: Aceitar os campos de lote ao salvar os dados fiscais**

Em `receiptService.js`, no `UPDATE recebimentos_material_itens_almoxarifado` de `atualizarDadosFiscais` (`274-289`), acrescentar às colunas:

```js
        lote = COALESCE(?, lote),
        data_validade_lote = COALESCE(?, data_validade_lote),
        corrida_lote = COALESCE(?, corrida_lote),
```

e aos parâmetros, na mesma posição:

```js
        item.lote ?? null, item.data_validade_lote ?? null, item.corrida_lote ?? null,
```

- [ ] **Step 5: Criar o lote na entrada e aplicar o certificado**

Em `receiptService.js`, dentro de `darEntradaEstoque` (`308-355`), no laço `for (const item of itens)`, **antes** do `registrarMovimentacao` de `ENTRADA_COMPRA`:

```js
    // Etapa 6: o lote nasce aqui, herdando o que a NF ja sabe. Ate esta etapa, `controle_certificado`
    // era selecionado nesta query (linha do SELECT acima) e NUNCA usado — quem auditasse por grep
    // concluia que a entrada verificava certificado. Agora verifica.
    let loteId = null;
    if (item.lote && String(item.lote).trim()) {
      const semCertificado = !!item.controle_certificado && !item.certificado_arquivo;
      const lote = await lotService.criarOuObterLote(db, user, {
        material_id: item.material_id,
        codigo: item.lote,
        fornecedor_id: rec.fornecedor_id,
        fornecedor_nome: rec.fornecedor_nome,
        corrida: item.corrida_lote,
        data_validade: item.data_validade_lote,
        nota_fiscal: rec.nota_fiscal,
        recebimento_id: recebimentoId,
        recebimento_item_id: item.id,
        // Entra bloqueado, nao barrado: o material esta fisicamente no galpao. Barrar a ENTRADA
        // foi exatamente o erro corrigido na Etapa 5.
        status: semCertificado ? 'BLOQUEADO' : 'ATIVO',
        status_motivo: semCertificado ? 'Certificado do fornecedor nao anexado' : null,
      });
      loteId = lote.id;
      await dbRun(db, 'UPDATE recebimentos_material_itens_almoxarifado SET lote_id = ? WHERE id = ?',
        [loteId, item.id]);
    }
```

e passar `lote_id: loteId` no `registrarMovimentacao` de `ENTRADA_COMPRA` (hoje passa `lote: item.lote` em `receiptService.js:332` — trocar por `lote_id: loteId`).

No topo do arquivo, adicionar o require: `const lotService = require('./lotService');`

- [ ] **Step 6: Rota de upload do certificado**

Em `server/routes/almoxarifado.js`, ao lado do `uploadAlmox` (`45-59`), acrescentar um multer que aceita PDF — o existente aceita **só imagens**, então reaproveitá-lo rejeitaria todo certificado:

```js
  const uploadCertificado = multer({
    storage: multer.diskStorage({
      destination: (req, file, cb) => cb(null, uploadsAlmoxDir),
      filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        cb(null, `certificado-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
      },
    }),
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
      if (/^(application\/pdf|image\/(jpeg|jpg|png|webp))$/i.test(file.mimetype)) return cb(null, true);
      cb(new Error('Certificado deve ser PDF ou imagem'));
    },
  });
```

E a rota, **com `requirePermission` antes do multer** (invertido, o arquivo é gravado antes do 403 — motivo em `routes/almoxarifado.js:576-578`):

```js
  // POST /api/almoxarifado/lotes/:id/certificado — anexa o certificado e libera o lote se ele
  // estava bloqueado exatamente por falta dele.
  app.post('/api/almoxarifado/lotes/:id/certificado',
    requirePermission('receber_material'), uploadCertificado.single('certificado'), async (req, res) => {
      try {
        if (!req.file) return res.status(400).json({ error: 'Nenhum certificado enviado' });
        const lotService = require('../services/almoxarifado/lotService');
        const { dbRun: run, dbGet: get } = require('../services/almoxarifado/db');

        const lote = await get(db, 'SELECT * FROM lotes_almoxarifado WHERE id = ?', [req.params.id]);
        if (!lote) return res.status(404).json({ error: 'Lote nao encontrado' });

        await run(db, `UPDATE lotes_almoxarifado
          SET certificado_arquivo = ?, certificado_em = CURRENT_TIMESTAMP, certificado_por = ?,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ?`, [req.file.filename, req.user?.id || null, lote.id]);

        // So libera o que ESTE bloqueio travou. Lote reprovado no ensaio, ou bloqueado por outro
        // motivo, continua bloqueado — anexar PDF nao pode ser atalho para destravar qualquer coisa.
        if (lote.status === 'BLOQUEADO' && /certificado/i.test(lote.status_motivo || '')) {
          await lotService.mudarStatusLote(db, req.user, lote.id, 'ATIVO', 'Certificado do fornecedor anexado');
        }
        const atualizado = await get(db, 'SELECT * FROM lotes_almoxarifado WHERE id = ?', [lote.id]);
        res.json({ id: atualizado.id, certificado_arquivo: atualizado.certificado_arquivo, status: atualizado.status });
      } catch (e) {
        res.status(e.status || 500).json({ error: e.message });
      }
    });
```

- [ ] **Step 7: Rodar e ver passar**

```bash
cd server && node tests/api/loteRecebimento.api.test.js
cd server && npm run test:api && npm run test:almoxarifado
```
Expected: `7 passed, 0 failed` e suítes verdes.

- [ ] **Step 8: Controle positivo**

Trocar `status: semCertificado ? 'BLOQUEADO' : 'ATIVO'` por `status: 'ATIVO'` e rodar.
Expected: `sem certificado, o lote nasce BLOQUEADO e o material nao sai` **falha**. Restaurar, confirmar verde.

- [ ] **Step 9: Commit**

```bash
git add server/services/almoxarifado/schema.js server/services/almoxarifado/receiptService.js server/routes/almoxarifado.js server/tests/api/loteRecebimento.api.test.js
git commit -m "Almoxarifado Etapa 6: lote nasce no recebimento e controle_certificado deixa de ser select morto"
```

---

### Task 6: Rotas de consulta com ordem FEFO e mudança de status

> **✅ ENTREGUE — `8dfeb0c`.** Uma adição sobre o texto abaixo, vinda da Task 3b: a listagem expõe
> também `vencimento_liberado`, e `elegivel` é
> `status === 'ATIVO' && (!vencido || vencimento_liberado)` — **na mesma ordem que o motor usa**
> (status antes de vencimento), com teste para o caso `BLOQUEADO` + vencido + liberado, que sai
> como **não** elegível.

**Files:**
- Modify: `server/services/almoxarifado/lotService.js` (adicionar `listarLotesDoMaterial`)
- Modify: `server/routes/almoxarifado/extended.js` (novas rotas, junto das demais)
- Test: `server/tests/api/loteRotas.api.test.js` (novo)

**Interfaces:**
- Consumes: `lotService` completo (Tasks 1 e 5); `estoque_saldo_almoxarifado.lote_id` (Task 2).
- Produces:
  - `GET /api/almoxarifado/materiais/:id/lotes` → array de `{ id, codigo, corrida, data_validade, status, status_motivo, fornecedor_nome, nota_fiscal, certificado_arquivo, saldo, vencido, elegivel }`, em ordem FEFO.
  - `PUT /api/almoxarifado/lotes/:id/status` — body `{ status, justificativa }` → lote atualizado.
  - `listarLotesDoMaterial(db, materialId, { apenasComSaldo })` → mesmas linhas do endpoint.

**Ordem FEFO:** elegíveis primeiro (`elegivel` = status `ATIVO` e não vencido), depois por validade crescente com nulos por último, depois por código. Lotes não elegíveis **aparecem no fim** — sumir sem explicação faz o operador procurar material que o sistema escondeu.

- [ ] **Step 1: Escrever o teste que falha**

Criar `server/tests/api/loteRotas.api.test.js`:

```js
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet } = require('../../services/almoxarifado/db');
const stockService = require('../../services/almoxarifado/stockService');
const lotService = require('../../services/almoxarifado/lotService');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}
const ADMIN = { id: 1, nome: 'Admin Teste', role: 'admin' };

let seq = 0;
async function novoMaterial(db) {
  seq += 1;
  const r = await dbRun(db,
    `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, ativo) VALUES (?,?,'UN',0,1)`,
    [`ROT-${seq}`, `Material rota ${seq}`]);
  return r.lastID;
}
async function loteComSaldo(db, materialId, codigo, validade, qtd) {
  const lote = await lotService.criarOuObterLote(db, ADMIN, {
    material_id: materialId, codigo, data_validade: validade });
  await stockService.registrarMovimentacao(db, ADMIN, {
    material_id: materialId, tipo: 'ENTRADA', quantidade: qtd, lote_id: lote.id, motivo: 'setup' });
  return lote;
}

(async () => {
  const { app, db, close } = await createTestApp({ user: ADMIN });

  await test('lotes vem em ordem FEFO, nulos por ultimo', async () => {
    const mat = await novoMaterial(db);
    await loteComSaldo(db, mat, 'TARDE', '2031-12-31', 10);
    await loteComSaldo(db, mat, 'SEM-VALIDADE', null, 10);
    await loteComSaldo(db, mat, 'CEDO', '2030-01-01', 10);

    const res = await request(app).get(`/api/almoxarifado/materiais/${mat}/lotes`);
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    const codigos = res.body.map((l) => l.codigo);
    assert.deepStrictEqual(codigos, ['CEDO', 'TARDE', 'SEM-VALIDADE'], `ordem errada: ${codigos.join(',')}`);
  });

  await test('cada lote traz saldo e a flag de vencido', async () => {
    const mat = await novoMaterial(db);
    await loteComSaldo(db, mat, 'COM-SALDO', '2030-01-01', 42);
    await loteComSaldo(db, mat, 'JA-VENCEU', '2020-01-01', 7);

    const res = await request(app).get(`/api/almoxarifado/materiais/${mat}/lotes`);
    const porCodigo = Object.fromEntries(res.body.map((l) => [l.codigo, l]));
    assert.strictEqual(porCodigo['COM-SALDO'].saldo, 42);
    assert.strictEqual(porCodigo['COM-SALDO'].vencido, false);
    assert.strictEqual(porCodigo['COM-SALDO'].elegivel, true);
    assert.strictEqual(porCodigo['JA-VENCEU'].vencido, true);
    assert.strictEqual(porCodigo['JA-VENCEU'].elegivel, false);
  });

  await test('lote nao elegivel aparece, mas no fim da lista', async () => {
    const mat = await novoMaterial(db);
    const bloqueado = await loteComSaldo(db, mat, 'BLOQUEADO-1', '2029-01-01', 5);
    await lotService.mudarStatusLote(db, ADMIN, bloqueado.id, 'BLOQUEADO', 'aguardando ensaio');
    await loteComSaldo(db, mat, 'OK-1', '2032-01-01', 5);

    const res = await request(app).get(`/api/almoxarifado/materiais/${mat}/lotes`);
    const codigos = res.body.map((l) => l.codigo);
    assert.ok(codigos.includes('BLOQUEADO-1'), 'lote bloqueado sumiu da lista em vez de aparecer desabilitado');
    assert.strictEqual(codigos[codigos.length - 1], 'BLOQUEADO-1',
      'lote nao elegivel deveria ir para o fim, mesmo vencendo antes');
  });

  await test('mudar status pela rota exige justificativa', async () => {
    const mat = await novoMaterial(db);
    const lote = await loteComSaldo(db, mat, 'ROTA-STATUS', '2030-01-01', 5);
    const semJust = await request(app).put(`/api/almoxarifado/lotes/${lote.id}/status`)
      .send({ status: 'BLOQUEADO' });
    assert.strictEqual(semJust.status, 400, JSON.stringify(semJust.body));

    const ok = await request(app).put(`/api/almoxarifado/lotes/${lote.id}/status`)
      .send({ status: 'BLOQUEADO', justificativa: 'ensaio pendente' });
    assert.strictEqual(ok.status, 200, JSON.stringify(ok.body));
    assert.strictEqual((await lotService.getLote(db, lote.id)).status, 'BLOQUEADO');
  });

  await test('perfil sem permissao nao muda status de lote', async () => {
    const mat = await novoMaterial(db);
    const lote = await loteComSaldo(db, mat, 'ROTA-PERM', '2030-01-01', 5);
    const ctx = await createTestApp({ user: { id: 9, nome: 'Producao', perfil_almoxarifado: 'PRODUCAO' } });
    const res = await request(ctx.app).put(`/api/almoxarifado/lotes/${lote.id}/status`)
      .send({ status: 'BLOQUEADO', justificativa: 'tentativa' });
    assert.strictEqual(res.status, 403);
    await ctx.close();
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd server && node tests/api/loteRotas.api.test.js`
Expected: FAIL — 404 nas rotas.

- [ ] **Step 3: `listarLotesDoMaterial` no serviço**

Em `lotService.js`, adicionar e exportar:

```js
/**
 * Ordem FEFO: elegiveis primeiro, depois validade crescente com nulos por ultimo, depois codigo.
 * Lote nao elegivel (bloqueado, reprovado, vencido) NAO some da lista — vai para o fim. Esconder
 * faz o operador procurar material que o sistema decidiu nao mostrar.
 */
async function listarLotesDoMaterial(db, materialId, { apenasComSaldo = false } = {}) {
  const linhas = await dbAll(db, `
    SELECT l.*, COALESCE((
      SELECT SUM(s.quantidade) FROM estoque_saldo_almoxarifado s WHERE s.lote_id = l.id
    ), 0) as saldo
    FROM lotes_almoxarifado l
    WHERE l.material_id = ?`, [materialId]);

  const hoje = new Date().toISOString().slice(0, 10);
  const comFlags = linhas
    .map((l) => {
      const vencido = isVencido(l, hoje);
      return { ...l, vencido, elegivel: l.status === 'ATIVO' && !vencido };
    })
    .filter((l) => !apenasComSaldo || l.saldo > 0);

  comFlags.sort((a, b) => {
    if (a.elegivel !== b.elegivel) return a.elegivel ? -1 : 1;
    const va = a.data_validade || '9999-12-31';
    const vb = b.data_validade || '9999-12-31';
    if (va !== vb) return va < vb ? -1 : 1;
    return String(a.codigo).localeCompare(String(b.codigo));
  });
  return comFlags;
}
```

- [ ] **Step 4: As rotas**

Em `server/routes/almoxarifado/extended.js`, adicionar (o require de `lotService` no topo, junto dos outros serviços):

```js
  // ── Lotes (Etapa 6) ──
  app.get('/api/almoxarifado/materiais/:id/lotes', auth, requirePermission('visualizar'), async (req, res) => {
    try {
      const lotes = await lotService.listarLotesDoMaterial(db, Number(req.params.id), {
        apenasComSaldo: req.query.com_saldo === '1',
      });
      res.json(lotes);
    } catch (e) { handleError(res, e); }
  });

  app.put('/api/almoxarifado/lotes/:id/status', auth, requirePermission('inspecionar'), async (req, res) => {
    try {
      const { status, justificativa } = req.body || {};
      const lote = await lotService.mudarStatusLote(db, req.user, Number(req.params.id), status, justificativa);
      res.json(lote);
    } catch (e) { handleError(res, e); }
  });
```

- [ ] **Step 5: Rodar e ver passar**

```bash
cd server && node tests/api/loteRotas.api.test.js
cd server && npm run test:api && npm run test:almoxarifado
```
Expected: `5 passed, 0 failed` e suítes verdes.

- [ ] **Step 6: Controle positivo**

Inverter o critério de elegibilidade no `sort` (`return a.elegivel ? 1 : -1`) e rodar.
Expected: `lote nao elegivel aparece, mas no fim da lista` **falha**. Restaurar, confirmar verde.

- [ ] **Step 7: Commit**

```bash
git add server/services/almoxarifado/lotService.js server/routes/almoxarifado/extended.js server/tests/api/loteRotas.api.test.js
git commit -m "Almoxarifado Etapa 6: consulta de lotes em ordem FEFO e mudanca de status por rota"
```

---

### Task 7: Frontend — o lote passa a existir na tela

> **✅ ENTREGUE — `9406bff`.** Duas notas sobre o texto abaixo: o `disabled` da opção vem de
> `elegivel` (**não** de `vencido`), senão um lote vencido-e-liberado apareceria desabilitado; e o
> teste não usa `@testing-library/react` (que não está no projeto) — foi escrito com
> `createRoot` + `act` + `querySelector`, como os testes vizinhos, preservando asserções de
> **comportamento**.
> **O que esta task NÃO cobriu e virou a pendência mais visível da etapa:** não existe tela de
> **gestão** de lotes. `PUT /lotes/:id/status`, `PUT /lotes/:id/liberar-vencimento` e
> `POST /lotes/:id/certificado` não têm nenhum consumidor no cliente (verificado por grep em
> `client/src`). Ver pendência (a) na spec 10.

**Files:**
- Modify: `client/src/components/almoxarifado/RecebimentosAlmoxarifado.js` (envio dos itens em `161-171`; render dos itens em `488-511`)
- Modify: `client/src/components/almoxarifado/MovimentacoesAlmoxarifado.js` (form em `71`, `140`, `168-173`, `415-426`; campo de lote em `549-551`)
- Test: `client/src/components/almoxarifado/LoteSeletor.test.js` (novo)

**Interfaces:**
- Consumes: `GET /almoxarifado/materiais/:id/lotes` (Task 6); campos `lote`, `data_validade_lote`, `corrida_lote` no item de recebimento (Task 5).
- Produces: nada consumido por outra task.

**As duas mudanças de tela:**

1. **Recebimento** — hoje `RecebimentosAlmoxarifado.js` não menciona lote em lugar nenhum, embora a coluna exista e o backend a repasse ao motor. É a lacuna mais visível do levantamento: o ponto onde o lote nasce é o que não consegue registrá-lo. Nos itens em status `EM_ENTRADA_NF`/`ENCAMINHADO_FATURAMENTO` (o grid de `498-508`), acrescentar três campos — lote, validade, corrida — e incluí-los no payload de `salvarFiscal` (`161-171`).

2. **Movimentação** — hoje o lote é um `<input>` de texto livre, só em ENTRADA e SAÍDA (`549-551`). Na **saída**, vira um `<select>` alimentado por `GET /almoxarifado/materiais/:id/lotes?com_saldo=1`, com o primeiro elegível pré-selecionado (FEFO como sugestão, não imposição) e os não elegíveis renderizados com `disabled` e o motivo no rótulo. Na **entrada**, continua texto livre — é onde um lote novo nasce.

- [ ] **Step 1: Escrever o teste que falha**

Criar `client/src/components/almoxarifado/LoteSeletor.test.js`:

```jsx
import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import MovimentacoesAlmoxarifado from './MovimentacoesAlmoxarifado';
import api from '../../services/api';

jest.mock('../../services/api');
jest.mock('react-toastify', () => ({ toast: { success: jest.fn(), error: jest.fn(), info: jest.fn() } }));

const LOTES = [
  { id: 10, codigo: 'CEDO', data_validade: '2030-01-01', status: 'ATIVO', saldo: 40, vencido: false, elegivel: true },
  { id: 11, codigo: 'TARDE', data_validade: '2031-01-01', status: 'ATIVO', saldo: 10, vencido: false, elegivel: true },
  { id: 12, codigo: 'REPROVADO-1', data_validade: '2029-01-01', status: 'REPROVADO', saldo: 5, vencido: false, elegivel: false },
];

function mockApi() {
  api.get.mockImplementation((url) => {
    if (url.includes('/lotes')) return Promise.resolve({ data: LOTES });
    if (url.includes('/materiais')) return Promise.resolve({ data: [{ id: 1, codigo: 'M-1', nome: 'Chapa', unidade: 'KG', quantidade_atual: 55 }] });
    return Promise.resolve({ data: [] });
  });
  api.post.mockResolvedValue({ data: { id: 1 } });
}

describe('seletor de lote na saida', () => {
  beforeEach(() => { jest.clearAllMocks(); mockApi(); });

  test('o lote que vence primeiro vem pre-selecionado (FEFO como sugestao)', async () => {
    render(<MemoryRouter><MovimentacoesAlmoxarifado /></MemoryRouter>);
    const seletor = await screen.findByLabelText(/lote/i);
    await waitFor(() => expect(seletor.value).toBe('10'));
  });

  test('lote nao elegivel aparece desabilitado, com o motivo', async () => {
    render(<MemoryRouter><MovimentacoesAlmoxarifado /></MemoryRouter>);
    const opcao = await screen.findByRole('option', { name: /REPROVADO-1/ });
    expect(opcao).toBeDisabled();
    expect(opcao.textContent).toMatch(/reprovado/i);
  });

  test('o operador pode trocar o lote sugerido', async () => {
    render(<MemoryRouter><MovimentacoesAlmoxarifado /></MemoryRouter>);
    const seletor = await screen.findByLabelText(/lote/i);
    fireEvent.change(seletor, { target: { value: '11' } });
    expect(seletor.value).toBe('11');
  });
});
```

> **Nota para quem implementa:** este arquivo assume que a tela de movimentação já monta com material selecionado. Se o componente exigir passos anteriores (escolher material, escolher tipo SAÍDA) para o campo de lote aparecer, **adapte o teste para fazer esses passos** — siga `MovimentacoesAlmoxarifado.test.js`, que já existe e já resolve esse setup. Não crie prop nova só para o teste alcançar o campo.

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd client && CI=true npx react-scripts test --watchAll=false LoteSeletor`
Expected: FAIL — não existe `<select>` de lote.

- [ ] **Step 3: Campos de lote no recebimento**

Em `RecebimentosAlmoxarifado.js`, no grid de campos por item (`498-508`), acrescentar uma segunda linha de três campos:

```jsx
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginTop: 6 }}>
                        <input className="almox-input" placeholder="Lote"
                          value={item.lote ?? ''} style={{ fontSize: '0.75rem', padding: '4px 6px' }}
                          onChange={(e) => atualizarItemDetalhe(item.id, 'lote', e.target.value)} />
                        <input className="almox-input" type="date" placeholder="Validade"
                          value={item.data_validade_lote ?? ''} style={{ fontSize: '0.75rem', padding: '4px 6px' }}
                          onChange={(e) => atualizarItemDetalhe(item.id, 'data_validade_lote', e.target.value)} />
                        <input className="almox-input" placeholder="Corrida"
                          value={item.corrida_lote ?? ''} style={{ fontSize: '0.75rem', padding: '4px 6px' }}
                          onChange={(e) => atualizarItemDetalhe(item.id, 'corrida_lote', e.target.value)} />
                      </div>
```

e incluir os três no objeto enviado por `salvarFiscal` (`161-171`):

```js
        lote: item.lote,
        data_validade_lote: item.data_validade_lote,
        corrida_lote: item.corrida_lote,
```

- [ ] **Step 4: Seletor FEFO na saída**

Em `MovimentacoesAlmoxarifado.js`, adicionar estado e carregamento dos lotes:

```jsx
  const [lotes, setLotes] = useState([]);

  useEffect(() => {
    if (!form.material_id || form.tipo !== 'SAIDA') { setLotes([]); return; }
    let cancelado = false;
    api.get(`/almoxarifado/materiais/${form.material_id}/lotes?com_saldo=1`)
      .then((res) => {
        if (cancelado) return;
        const lista = res.data || [];
        setLotes(lista);
        // FEFO e SUGESTAO: pre-seleciona o primeiro elegivel (a API ja devolve em ordem) e deixa
        // o operador trocar. Impor no motor travaria quem tem motivo para pegar outro lote.
        const sugerido = lista.find((l) => l.elegivel);
        setForm((f) => ({ ...f, lote_id: sugerido ? String(sugerido.id) : '' }));
      })
      .catch(() => { if (!cancelado) setLotes([]); });
    return () => { cancelado = true; };
  }, [form.material_id, form.tipo]);
```

Substituir o `<input>` de lote (`549-551`) por um render condicional — `<select>` na saída, texto livre na entrada (é onde o lote nasce):

```jsx
                      <label className="almox-label" htmlFor="mov-lote">Lote</label>
                      {form.tipo === 'SAIDA' ? (
                        <select id="mov-lote" className="almox-input" value={form.lote_id}
                          onChange={(e) => setForm((f) => ({ ...f, lote_id: e.target.value }))}>
                          <option value="">Sem lote</option>
                          {lotes.map((l) => (
                            <option key={l.id} value={l.id} disabled={!l.elegivel}>
                              {l.codigo} — saldo {l.saldo}
                              {l.data_validade ? ` — vence ${l.data_validade}` : ''}
                              {l.vencido ? ' (vencido)' : ''}
                              {l.status !== 'ATIVO' ? ` (${l.status.toLowerCase()})` : ''}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input id="mov-lote" className="almox-input" value={form.lote}
                          onChange={(e) => setForm((f) => ({ ...f, lote: e.target.value }))} />
                      )}
```

Acrescentar `lote_id: ''` ao estado inicial do form (`71`) e ao reset (`140`), e no envio (`168-173`) mandar `lote_id` na saída e `lote` na entrada:

```js
      if (form.tipo === 'ENTRADA' && form.lote) payload.lote = form.lote;
      if (form.tipo === 'SAIDA' && form.lote_id) payload.lote_id = Number(form.lote_id);
```

Ajustar também a limpeza por troca de tipo (`415-426`), que hoje zera `lote`, para zerar `lote_id` junto.

- [ ] **Step 5: Rodar e ver passar**

```bash
cd client && CI=true npx react-scripts test --watchAll=false
cd client && CI=true npx react-scripts build
```
Expected: todas as suítes verdes e build limpo. `CI=true` faz warning virar erro — warning de `useEffect` sem dependência **quebra o build**, então confira a lista de dependências.

- [ ] **Step 6: Controle positivo**

Trocar `const sugerido = lista.find((l) => l.elegivel)` por `const sugerido = null` e rodar.
Expected: `o lote que vence primeiro vem pre-selecionado` **falha**. Restaurar, confirmar verde.

- [ ] **Step 7: Commit**

```bash
git add client/src/components/almoxarifado/RecebimentosAlmoxarifado.js client/src/components/almoxarifado/MovimentacoesAlmoxarifado.js client/src/components/almoxarifado/LoteSeletor.test.js
git commit -m "Almoxarifado Etapa 6: campo de lote no recebimento e seletor FEFO na saida"
```

---

### Task 8: Documentação — sem ela a etapa não está terminada

> **✅ ENTREGUE.** Além dos Steps abaixo, esta task corrigiu **quatro afirmações que tinham virado
> mentira** nas specs (todas apontadas às claras no texto corrigido, conforme manda o `CLAUDE.md`):
> a spec 03 dizia que a liberação de vencimento "não existe ainda" (existe desde `556f86d`); a
> spec 03 citava a conclusão de inventário em "~linha 868" (é `894`/`917`); a spec 09 dizia que a
> feature 10 "ainda não existe"; e o guia dizia que faltava "validar saída de lote vencido ou
> reprovado". Acrescentou também a Task 3b a este plano, que não a tinha.

**Files:**
- Modify: `specs/modulo-almoxarifado/10-lotes-series-etiquetas/README.md`
- Modify: `specs/modulo-almoxarifado/README.md`
- Modify: `specs/modulo-almoxarifado/03-motor-estoque/README.md`
- Modify: `specs/modulo-almoxarifado/08-recebimento/README.md` e `09-inspecao-qualidade/README.md`
- Modify: `docs/almoxarifado-guia-etapas-e-testes.md`
- Modify: `docs/superpowers/plans/2026-08-09-almoxarifado-etapa6-lotes.md` (este arquivo)

**Interfaces:** nenhuma — é a task que fecha o contrato do `CLAUDE.md`.

Esta task existe porque a regra mais importante do `CLAUDE.md` já falhou nesta base: *"código foi entregue e as specs continuaram dizendo que a feature não existia"*. Documentação desatualizada é trabalho não terminado.

- [ ] **Step 1: Fechar o checklist da feature 10**

Em `specs/modulo-almoxarifado/10-lotes-series-etiquetas/README.md`, marcar `[x]` **com o hash do commit** cada item entregue. Os itens de série e etiqueta ficam `[ ]` — e a tabela de divisão em Etapa 6/6b/6c já explica por quê, então **não** deixe desmarcado sem a explicação ao lado.

Atualizar a seção "O que já existe" e as duas caixas de ⚠️ correção: elas descrevem o estado **antes** desta etapa. Reescrever no passado, deixando claro o que foi corrigido e por qual commit — a caixa que diz "as três colunas de retenção não recebem escrita" tem de dizer que elas foram **removidas**, senão o próximo leitor procura colunas que não existem mais.

Registrar também, explicitamente, que **três das cinco flags `controle_*` continuam mortas** (`controle_serie`, `controle_validade`, `controle_corrida`) e em qual etapa cada uma acende. Acender duas e ficar em silêncio sobre as outras três recria exatamente a confusão que esta spec acabou de documentar.

- [ ] **Step 2: Atualizar o mapa mestre**

Em `specs/modulo-almoxarifado/README.md`, atualizar a linha da feature 10 (hoje `❌ lote é texto livre` + a nota do levantamento) para o estado real, a data e o resumo do que a Etapa 6 entregou. Atualizar a data de "Última atualização" no topo.

Marcar o critério de aceite "Rastrear lote e número de série (10)" como **parcialmente atendido** — lote sim, série não — em vez de deixar como está.

- [ ] **Step 3: Fechar as pendências que dependiam desta etapa**

- `03-motor-estoque/README.md`: a linha "resta validação de vencido/lote reprovado, que depende da feature 10" foi resolvida. Marcar e citar o commit da Task 3.
- `08-recebimento/README.md`: o recebimento passou a criar lote e a aplicar `controle_certificado`.
- `09-inspecao-qualidade/README.md`: registrar que **reprovar por lote ainda não está ligado à inspeção** — a Etapa 6 entrega o status `REPROVADO` no lote e a rota que o muda, mas `inspectionService.decidirInspecao` continua bloqueando o material inteiro. Isso é uma pendência **nova e real**; deixá-la implícita repetiria o erro que o `CLAUDE.md` descreve.

- [ ] **Step 4: Seção da Etapa 6 no guia do usuário**

Em `docs/almoxarifado-guia-etapas-e-testes.md`, acrescentar a seção da Etapa 6 no formato que as anteriores usam:
- tabela **Antes → Agora** (ex.: *"Antes: dava para tirar 10 de um lote que tinha 2, e o sistema não reclamava. Agora: recusa e mostra o saldo real do lote."*);
- roteiro de teste manual clicável, do recebimento com lote até a saída bloqueada por vencimento;
- o que a etapa **não** cobre: série, etiquetas/QR, reserva por lote e reprovação de lote pela inspeção.

Atualizar o cabeçalho do guia para que **onde o desenvolvimento parou fique óbvio**.

- [ ] **Step 5: Deixar a próxima tarefa detalhada**

Neste plano, marcar as tasks concluídas e escrever, ao final, a **próxima tarefa detalhada** (Etapa 6b — números de série): o contrato de API que ela consome (`lotService`, `estoque_saldo_almoxarifado.lote_id`), os pontos de atenção (série é 1 linha por unidade, não quantidade — o modelo de saldo não serve) e o que já foi decidido (série é rotina na GMP, confirmado em 2026-08-09).

- [ ] **Step 6: Rodar tudo e commitar**

```bash
cd server && npm run test:api && npm run test:almoxarifado && npm run test:validation && npm run test:safealter && npm run test:sqlite
cd client && CI=true npx react-scripts test --watchAll=false && CI=true npx react-scripts build
```

Citar no relatório os números **reais** de cada suíte.

```bash
git add specs/ docs/
git commit -m "Almoxarifado Etapa 6: atualiza specs, guia e plano com o que a etapa entregou"
```

---

## Auto-revisão do plano

**Cobertura do design.** Cada seção do design tem task: tabela de lotes → 1; reconstrução do saldo + índice COALESCE + colunas mortas → 2; três guardas da saída → 3; `controle_lote` → 4; lote no recebimento + `controle_certificado` + upload → 5; FEFO e mudança de status → 6; telas → 7; documentação → 8. **Uma decisão do design não virou task de código de propósito:** "reprovar na inspeção marca o lote" (seção "Consumo pelas features vizinhas") — a Etapa 6 entrega o status e a rota, mas ligar `inspectionService.decidirInspecao` a ela é mudança na feature 09 e vira pendência declarada na Task 8, Step 3. Não fica em silêncio.

**Placeholders.** Nenhum "TBD"/"tratar erros adequadamente". Duas notas pedem ao implementador que confira a assinatura real antes de escrever o teste (Task 5, Step 1; Task 7, Step 1) — isso é instrução verificável, não lacuna: o plano diz exatamente o que fazer se a realidade divergir.

**Consistência de tipos.** `getOrCreateSaldo(db, materialId, localizacaoId, loteId)` é definida na Task 2 e usada com o mesmo nome e ordem nas Tasks 3 e 5. `criarOuObterLote`, `getLote`, `getLotePorCodigo`, `mudarStatusLote`, `isVencido` e `STATUS_LOTE` são definidas na Task 1 e consumidas com as mesmas assinaturas nas Tasks 3, 5 e 6. `listarLotesDoMaterial` nasce na Task 6 e só é usada lá e no cliente (Task 7). O campo `lote_id` é numérico em todas as camadas; `lote` é sempre texto.

**Risco conhecido, declarado no lugar certo:** o claim atômico da Task 3 roda depois do débito em `quantidade_atual`, então precisa compensar ao falhar. Está escrito no Step 5 da Task 3, com o teste que prova a compensação.

---

# ➡️ PRÓXIMA TAREFA — Etapa 6b: números de série

> Escrito em 2026-08-09, ao fechar a Etapa 6. **Isto ainda não é um plano de implementação** — é o
> briefing que permite escrever um sem reler o código. O próximo passo formal é rodar
> `superpowers:brainstorming` + `superpowers:writing-plans` sobre este texto.

## O que já está decidido (não reabrir)

- **Série é rotina na GMP, não exceção.** Confirmado com o cliente em **2026-08-09**: a empresa
  rastreia número de série individualmente hoje, no papel/planilha. Não é "nice to have" nem
  escopo especulativo.
- **A flag `controle_serie` já existe** em `materiais_almoxarifado`, é gravada pelo CRUD e pelo
  formulário, e **nunca é lida**. É uma das três flags mortas que a Etapa 6 deixou documentadas na
  spec 10. Esta etapa acende ela — é o critério de "a etapa terminou".
- **`6b` e não `7`**: as Etapas 7 e 8 do plano mestre já são transferências/devoluções e materiais
  de clientes/terceiros.
- Etiquetas com QR ficam para a **6c**, depois desta.

## O contrato que a 6b consome (tudo já entregue e testado)

| O quê | Onde | Observação |
|---|---|---|
| `lotService.criarOuObterLote/getLote/getLotePorCodigo/mudarStatusLote/isVencido/listarLotesDoMaterial` | `server/services/almoxarifado/lotService.js` | É o **modelo a copiar**: um serviço que é dono único da tabela, com guarda no `WHERE`, justificativa obrigatória e auditoria em `auditoria_log_almoxarifado` com `entidade='lote'`. `seriesService.js` deve nascer com a mesma forma (`entidade='serie'`) |
| `estoque_saldo_almoxarifado.lote_id` (FK) + índice `idx_saldo_almox_chave` com `COALESCE` | `schema.js:720-731` e a migração `migrateSaldoLoteId` | **Cuidado:** este é o modelo de saldo que a série **não** deve usar — ver "ponto de atenção" abaixo |
| `registrarMovimentacao(db, user, { …, lote_id, lote })` resolve o lote e grava as duas colunas | `stockService.js:371-404` (resolução + guarda de `controle_lote`) e o ramo de saída a partir de `428` | O ponto de extensão para série é o mesmo bloco: resolver → validar → efeito |
| `GET /materiais/:id/lotes` (FEFO), `PUT /lotes/:id/status`, `PUT /lotes/:id/liberar-vencimento` | `routes/almoxarifado/extended.js:483-506` | Padrão de rota: `auth` + `requirePermission` + `handleError` |
| Harness de teste de API | `server/tests/helpers/testApp.js` | Roda o `requirePermission` **real**; runner artesanal por arquivo (`test()`, contador, `process.exit`) |

## O ponto de atenção que decide o desenho inteiro

> **Série é 1 (uma) linha por unidade física. O modelo de saldo por quantidade NÃO serve.**

Lote e série parecem o mesmo problema e não são:

| | Lote | Série |
|---|---|---|
| Cardinalidade | 1 lote ↔ N unidades | 1 série ↔ **1** unidade |
| Onde mora o saldo | `estoque_saldo_almoxarifado(material, localizacao, lote)` com `quantidade REAL` | **não existe "quantidade"** — a unidade está, ou não está |
| Movimentar | subtrai um número | **muda o estado de uma linha** (em estoque → entregue → em terceiro → devolvido) |
| Entrada de 10 | uma linha, `quantidade += 10` | **dez linhas**, uma por número de série |

Consequências práticas que precisam estar no plano:

1. **Não crie `serie_id` em `estoque_saldo_almoxarifado`.** Uma linha de saldo por série
   transformaria a tabela de saldo num inventário unitário com `quantidade` sempre 0 ou 1 — é a
   armadilha que a Etapa 6 removeu (coluna que existe e ninguém escreve direito). A tabela
   `series_almoxarifado` **é** o registro de posse: material, número, status, `localizacao_id`,
   `lote_id` (opcional — motor com série *e* corrida existe), projeto/OS atual.
2. **A conta tem de fechar com o saldo agregado.** `materiais_almoxarifado.quantidade_atual`
   continua sendo o físico. Para material com `controle_serie`, o invariante é
   `COUNT(series EM_ESTOQUE) == quantidade_atual` — e **esse invariante precisa de teste**, senão
   nasce mais uma coluna divergindo em silêncio, que é o padrão que este módulo já viu quatro
   vezes.
3. **Entrada exige N séries para N unidades; saída exige *quais* séries.** É validação de
   cardinalidade, não de presença: `quantidade: 10` com 9 séries tem de falhar antes de qualquer
   efeito de saldo, no mesmo lugar onde `controle_lote` falha hoje (`stockService.js:397-404`).
4. **Série é única por material** (`UNIQUE(material_id, numero)`), e **não pode estar em dois
   lugares**: reentrada de uma série que já está `EM_ESTOQUE` tem de falhar — é o teste
   `entrada de serie ja em estoque falha` que a spec 10 já exige.
5. **Reaproveite `ACAO_PERFIS`, não crie ação nova.** `visualizar` (ler), `receber_material`
   (criar série na entrada), `inspecionar` (bloquear/reprovar), `editar_material` (corrigir dados).
   Foi a regra da Etapa 6 e continua valendo.
6. **A UI de digitar 10 números de série é o problema mais difícil desta etapa**, e é onde ela mais
   arrisca virar inútil. Pense nisso no design, não no fim: digitar série a série numa tela web é
   inviável em volume. Colar uma lista (uma por linha), sequência com prefixo+contador, e leitura
   por código de barras (a 6c traz o QR) são os três caminhos — decidir **com o cliente** qual
   antes de escrever a tela.

## Dívidas da Etapa 6 que a 6b deveria absorver (são a mesma tela)

A Etapa 6 deixou **três rotas de lote sem nenhuma tela** (`PUT /lotes/:id/status`,
`PUT /lotes/:id/liberar-vencimento`, `POST /lotes/:id/certificado`) e **sem extrato de lote**. A
Etapa 6b vai precisar de uma tela de rastreabilidade de qualquer forma (para listar séries de um
material e o histórico de cada uma). **Fazer as duas na mesma tela é a decisão barata**; fazer a de
série sozinha e deixar lote sem tela repetiria o problema um andar acima. Considerar seriamente
abrir a 6b com essa tela em vez de com o backend.

## Fora do escopo da 6b (declarar no plano, não deixar implícito)

- Etiquetas e QR Code (**6c**).
- Genealogia lote de compra ↔ lote de produção.
- Reprovar por lote pela inspeção (é mudança na **feature 09**, ver o README dela).
- Reserva por lote/série (**feature 07**, continua aberta).
- Retenção parcial de lote em quantidade (a Etapa 6 decidiu: retenção é **status**, não quantidade).
