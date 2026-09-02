# Etapa 32 — Anexos de documento: implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recomendado) ou superpowers:executing-plans para executar este plano task a task. Os passos
> usam checkbox (`- [ ]`).

**Goal:** dar dono à tabela `anexos_documento_almoxarifado`, órfã desde a Etapa 0 — upload,
listagem, **download autenticado** e remoção genéricos por entidade —, e plugar a primeira
consumidora (o formulário de decisão de inspeção, feature 09).

**Architecture:** um serviço puro (`anexoService.js`) com mapa fechado de entidades e verificação
de existência do registro-pai; quatro rotas em `routes/almoxarifado/extended.js` no molde
multipart já canônico do módulo (`auth` → `requirePermission` → `multer` → `safeParse`); os
arquivos gravados num diretório **irmão** de `uploads/almoxarifado`, que nenhum `express.static`
alcança; e um componente React genérico que baixa por `blob`, porque a rota é autenticada.

**Tech Stack:** Express + SQLite (`sqlite3`), `multer`, Zod, `supertest`; React CRA, `axios`,
`react-toastify`, `react-icons/fi`.

**Spec:** `docs/superpowers/specs/2026-09-02-almoxarifado-etapa32-anexos-design.md` (commit
`e708125`) — leia junto; o plano argumenta a partir dele.

## Global Constraints

- **Mensagens literais**: as strings de erro do design são **contrato**, copiadas caractere a
  caractere. Um teste que asserta `"Entidade inválida para anexo"` reprova qualquer variação.
- **Português com acento no código e nas mensagens; sem acento no corpo do commit** (o histórico
  é assim).
- **O diretório de upload é PARÂMETRO, nunca constante de módulo.** `uploadsAnexosDir` nasce em
  `routes/almoxarifado.js` a partir do 4º parâmetro `PERSISTENT_DATA_DIR` e desce para a extended
  como **5º parâmetro**. Re-derivar de `config/paths.js` aponta para o diretório errado no harness
  — proibição já escrita em `almoxarifado.js:3695-3702` e em `uploadCleanup.js`.
- **Nunca `git add -A` na raiz** — há artefatos de runtime em `server/data/` e `server/uploads/`.
- **Testes descobertos só em `server/tests/api/*.api.test.js`**, cada arquivo com runner próprio
  (`test()`, contador, `process.exit`). Harness: `server/tests/helpers/testApp.js`, que roda o
  `requirePermission` **real**.
- **Controle positivo obrigatório** em todo teste que passar de primeira: quebre a implementação
  de propósito e registre o vermelho antes de seguir.

## Estrutura de arquivos

| Arquivo | Responsabilidade | Task |
|---|---|---|
| `server/services/almoxarifado/anexoService.js` **(criar)** | mapa de entidades, CRUD do anexo, auditoria | 1 |
| `server/services/almoxarifado/schema.js` **(modificar)** | 7 colunas novas por `safeAlter` + índice | 1 |
| `server/services/almoxarifado/permissions.js` **(modificar)** | `anexar_documento`, `remover_anexo` | 1 |
| `server/services/almoxarifado/auditLabels.js` **(modificar)** | rótulo da entidade `anexo` | 1 |
| `client/src/utils/permissaoErro.js` **(modificar)** | rótulo das duas ações novas | 1 |
| `server/tests/api/anexoService.api.test.js` **(criar)** | RN-01, RN-02, RN-05 pelo serviço | 1 |
| `server/routes/almoxarifado.js` **(modificar, `:188` e `:3702`)** | criar o diretório e passá-lo adiante | 2 |
| `server/routes/almoxarifado/extended.js` **(modificar)** | multer + 4 rotas | 2 |
| `server/services/almoxarifado/schemas.js` **(modificar)** | `AnexoCreateSchema` | 2 |
| `server/tests/helpers/testApp.js` **(modificar, `:80`)** | expor `uploadsAnexosDir` | 2 |
| `server/tests/api/anexoDocumento.api.test.js` **(criar)** | RN-03, RN-04, RN-06 pela rota (13 cenarios) | 2 |
| `client/src/components/almoxarifado/AnexosDocumento.js` **(criar)** | componente genérico | 3 |
| `client/src/components/almoxarifado/AnexosDocumento.test.js` **(criar)** | 7 cenários | 3 |
| `client/src/components/almoxarifado/HistoricoInspecoes.js` **(modificar)** | plug da feature 09 | 4 |
| `server/tests/api/anexoDocumento.api.test.js` **(modificar)** | fluxo cruzando, pela rota | 5 |

## Sort topológico

| Task | Tipo | Depende de | Por quê |
|---|---|---|---|
| 1 — schema, serviço e permissões | **tronco** | — | mexe em `ACAO_PERFIS` e no schema: regra compartilhada |
| 2 — fiação e rotas | **galho** | 1 | consome o serviço já congelado |
| 3 — componente `AnexosDocumento` | **galho** | 1 (só o contrato) | client contra contrato HTTP congelado — mock legítimo, é a fronteira |
| 4 — plug no Histórico de inspeções | sequencial | 3 | importa o componente da Task 3 |
| 5 — integração + fechamento | sequencial | 2 e 4 | cruza os galhos |

**Decisão que sobe para o tronco por causa da Fase 2:** `entidade_id` da inspeção é o **`id` da
linha de `inspecoes_recebimento_almoxarifado`**, que só existe **depois da decisão** — não o
`item_id` da fila de pendentes. Isso fica congelado aqui, na Task 1, junto com o mapa de
entidades, porque a Task 3 escreve as props contra ele e a Task 4 depende da mesma leitura; se
cada galho decidisse por conta, os dois divergiriam sem teste nenhum perceber.

**Paralelismo real: 2 galhos** (Tasks 2 e 3), em **worktrees isoladas** — a Task 2 roda a suíte de
servidor contra SQLite e a Task 3 roda a do client; árvores separadas evitam que um `git add` de
um pegue arquivo do outro. Scratchpad com nome único por agente (`msg-rotas.txt`,
`msg-componente.txt`) — na Etapa 25 dois executores usaram `msg.txt` e um sobrescreveu o do outro.

---

### Task 1: Schema, serviço e as duas ações de perfil  **(tronco)**

> **FEITA** — commit abaixo. Medido: serviço **6/6**; `test:api` **166/166 arquivos** (165 → 166);
> `auditLabels` 14/0; `permissoesRotas` 51/0; `permissaoErro.test.js` **vermelho antes** do rótulo
> (nomeou `anexar_documento` e `remover_anexo` sozinho, sem asserção nova) e **9/9 depois**.
> As quatro sabotagens derrubaram **exatamente** o cenário previsto, uma cada — inclusive a nº 4,
> com tabela que **existe** mas é a errada, que a Fase 2 acrescentou porque a nº 3 sozinha só
> provava que o teste pega erro de digitação.

**Files:**
- Create: `server/services/almoxarifado/anexoService.js`
- Create: `server/tests/api/anexoService.api.test.js`
- Modify: `server/services/almoxarifado/schema.js` (logo após o `CREATE TABLE` de `:1692-1700`)
- Modify: `server/services/almoxarifado/permissions.js` (bloco `ACAO_PERFIS`)
- Modify: `server/services/almoxarifado/auditLabels.js`
- Modify: `client/src/utils/permissaoErro.js` (mapa `ACOES`)

**Interfaces:**
- Consumes: `dbRun/dbGet/dbAll` de `services/almoxarifado/db.js`
  (`dbRun` resolve `{ lastID, changes }`); `registrarAuditoria(db, {entidade, entidade_id, acao,
  usuario_id, usuario_nome, dados_anteriores, dados_novos, justificativa})` de
  `services/almoxarifado/audit.js`.
- Produces, e as Tasks 2 e 5 dependem destes nomes exatos:
  - `ENTIDADES_ANEXO` — objeto `{ chave: 'nome_da_tabela' }`
  - `registrarAnexo(db, user, { entidade, entidade_id, tipo, descricao }, arquivo)` →
    `Promise<linha>`, onde `arquivo = { filename, originalname, size, mimetype }`
  - `listarAnexos(db, { entidade, entidade_id })` → `Promise<linha[]>` **sem** `arquivo_path`
  - `getAnexoParaDownload(db, id)` → `Promise<{ id, arquivo_path, nome_original, mime_type }>`
  - `removerAnexo(db, user, id)` → `Promise<{ ok: true }>`
  - Todos lançam `Error` com `.status` (o `handleError` da extended usa `err.status || 500`).

- [x] **Step 1: Escrever o teste que falha**

Crie `server/tests/api/anexoService.api.test.js` no molde de runner desta base. **Use o molde colado abaixo** (array `testes` + laço final + `process.exit`), que é autossuficiente — o `toolCalibracao.api.test.js:16-19` usa outra forma (`await test(...)` inline) e misturar as duas não roda:

```js
const assert = require('assert');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const anexoService = require('../../services/almoxarifado/anexoService');

let passou = 0, falhou = 0;
const testes = [];
function test(nome, fn) { testes.push([nome, fn]); }

const ARQUIVO = { filename: 'anexo-1-2.pdf', originalname: 'certificado.pdf', size: 1234, mimetype: 'application/pdf' };
const USER = { id: 7, nome: 'Qualidade Teste' };

async function comMaterial(ctx) {
  const r = await dbRun(ctx.db,
    `INSERT INTO materiais_almoxarifado (codigo, nome, unidade) VALUES (?,?,?)`,
    ['MAT-1', 'Chapa 3mm', 'KG']);
  return r.lastID;
}

// RN-02 — entidade fora do mapa e recusada, e a mensagem e literal
test('entidade fora do mapa: 400 com a literal, e nada e gravado', async () => {
  const ctx = await createTestApp();
  try {
    await assert.rejects(
      () => anexoService.registrarAnexo(ctx.db, USER,
        { entidade: 'qualquer_coisa', entidade_id: 1, tipo: 'CERTIFICADO' }, ARQUIVO),
      (e) => e.status === 400 && e.message === 'Entidade inválida para anexo');
    const linhas = await dbAll(ctx.db, 'SELECT * FROM anexos_documento_almoxarifado');
    assert.strictEqual(linhas.length, 0, 'nao pode gravar linha para entidade invalida');
  } finally { await ctx.close(); }
});

// RN-01 — o registro-pai tem de existir
test('entidade_id inexistente: 404 com a literal, e nada e gravado', async () => {
  const ctx = await createTestApp();
  try {
    await assert.rejects(
      () => anexoService.registrarAnexo(ctx.db, USER,
        { entidade: 'material', entidade_id: 99999, tipo: 'FICHA' }, ARQUIVO),
      (e) => e.status === 404 && e.message === 'Registro não encontrado para anexar');
    const linhas = await dbAll(ctx.db, 'SELECT * FROM anexos_documento_almoxarifado');
    assert.strictEqual(linhas.length, 0);
  } finally { await ctx.close(); }
});

// RN-01, lado positivo — com o pai existindo, grava e devolve a linha
test('material existente: grava, audita e devolve a linha SEM arquivo_path', async () => {
  const ctx = await createTestApp();
  try {
    const materialId = await comMaterial(ctx);
    const anexo = await anexoService.registrarAnexo(ctx.db, USER,
      { entidade: 'material', entidade_id: materialId, tipo: 'FICHA', descricao: 'Ficha técnica' },
      ARQUIVO);
    assert.ok(anexo.id > 0);
    assert.strictEqual(anexo.nome_original, 'certificado.pdf');
    assert.strictEqual(anexo.tamanho_bytes, 1234);
    assert.strictEqual(anexo.mime_type, 'application/pdf');
    assert.strictEqual(anexo.uploaded_by, 7);
    assert.strictEqual(anexo.uploaded_by_nome, 'Qualidade Teste');
    assert.strictEqual(anexo.arquivo_path, undefined, 'arquivo_path NAO sai do servico');

    const aud = await dbGet(ctx.db,
      `SELECT * FROM auditoria_log_almoxarifado WHERE entidade = 'anexo' ORDER BY id DESC`);
    assert.ok(aud, 'anexar tem de auditar');
    assert.strictEqual(aud.acao, 'ANEXAR');
  } finally { await ctx.close(); }
});

// RN-05 — soft delete: some da lista, sobrevive no banco
test('remover e soft delete: some da lista, a linha continua com ativo = 0', async () => {
  const ctx = await createTestApp();
  try {
    const materialId = await comMaterial(ctx);
    const anexo = await anexoService.registrarAnexo(ctx.db, USER,
      { entidade: 'material', entidade_id: materialId, tipo: 'FICHA' }, ARQUIVO);

    await anexoService.removerAnexo(ctx.db, USER, anexo.id);

    const lista = await anexoService.listarAnexos(ctx.db, { entidade: 'material', entidade_id: materialId });
    assert.strictEqual(lista.length, 0, 'removido nao aparece na lista');

    const linha = await dbGet(ctx.db, 'SELECT * FROM anexos_documento_almoxarifado WHERE id = ?', [anexo.id]);
    assert.ok(linha, 'a linha continua existindo');
    assert.strictEqual(linha.ativo, 0);
    assert.strictEqual(linha.deleted_by, 7);
    assert.ok(linha.deleted_at, 'deleted_at preenchido');
  } finally { await ctx.close(); }
});

// RN-05 — remover duas vezes nao e sucesso silencioso
test('remover ja removido: 404, nao 200', async () => {
  const ctx = await createTestApp();
  try {
    const materialId = await comMaterial(ctx);
    const anexo = await anexoService.registrarAnexo(ctx.db, USER,
      { entidade: 'material', entidade_id: materialId, tipo: 'FICHA' }, ARQUIVO);
    await anexoService.removerAnexo(ctx.db, USER, anexo.id);
    await assert.rejects(() => anexoService.removerAnexo(ctx.db, USER, anexo.id),
      (e) => e.status === 404 && e.message === 'Anexo não encontrado');
  } finally { await ctx.close(); }
});

// As seis entidades do mapa apontam para tabela que EXISTE — a regua que pega nome imaginado.
// A asserção de DISTINÇÃO (`new Set(...).size === 6`) é o que impede o teste de passar com um
// mapa que aponte as seis chaves para `materiais_almoxarifado`: só "a tabela existe" seria
// satisfeito por esse mapa errado, e o anexo do recebimento iria consultar material.
test('as seis entidades do mapa apontam para tabelas distintas que existem no schema', async () => {
  const ctx = await createTestApp();
  try {
    const chaves = Object.keys(anexoService.ENTIDADES_ANEXO);
    assert.strictEqual(chaves.length, 6, 'o mapa tem seis entidades — uma por pendencia de spec');
    const tabelas = chaves.map((c) => anexoService.ENTIDADES_ANEXO[c]);
    assert.strictEqual(new Set(tabelas).size, 6, 'cada entidade tem a SUA tabela');
    for (const chave of chaves) {
      const tabela = anexoService.ENTIDADES_ANEXO[chave];
      const existe = await dbGet(ctx.db,
        `SELECT name FROM sqlite_master WHERE type='table' AND name = ?`, [tabela]);
      assert.ok(existe, `entidade ${chave} aponta para tabela inexistente: ${tabela}`);
    }
    // As seis chaves sao exatamente as das specs — nem a mais (YAGNI) nem a menos
    assert.deepStrictEqual(chaves.sort(),
      ['devolucao', 'inspecao', 'item_remessa', 'material', 'recebimento', 'requisicao']);
  } finally { await ctx.close(); }
});

(async () => {
  for (const [nome, fn] of testes) {
    try { await fn(); console.log(`  ✓ ${nome}`); passou++; }
    catch (e) { console.log(`  ✗ ${nome}\n    ${e.message}`); falhou++; }
  }
  console.log(`\n${passou} passed, ${falhou} failed`);
  process.exit(falhou ? 1 : 0);
})();
```

- [x] **Step 2: Rodar e ver falhar**

Run: `cd server && node tests/api/anexoService.api.test.js`
Expected: FAIL — `Cannot find module '../../services/almoxarifado/anexoService'`.

- [x] **Step 3: As colunas novas e o índice**

Em `server/services/almoxarifado/schema.js`, **logo após** o `CREATE TABLE IF NOT EXISTS
anexos_documento_almoxarifado (...)` que termina em `:1700`:

```js
  // Etapa 32: a tabela nasceu na Etapa 0 e ficou ORFA ate aqui — nenhum INSERT, nenhum SELECT,
  // nenhum indice. As colunas abaixo entram por safeAlter (e no-op em banco novo, porque o
  // CREATE acima ja e o formato final para quem instala do zero; em banco existente elas
  // faltam). `ativo` default 1 para que a linha legada — se algum dia houver — nasca visivel.
  for (const col of [
    'descricao TEXT',
    'uploaded_by_nome TEXT',
    'tamanho_bytes INTEGER',
    'mime_type TEXT',
    'ativo INTEGER DEFAULT 1',
    'deleted_by INTEGER',
    'deleted_at DATETIME',
  ]) await safeAlter(db, `ALTER TABLE anexos_documento_almoxarifado ADD COLUMN ${col}`);

  // A listagem SEMPRE filtra por (entidade, entidade_id, ativo). Sem indice e full scan numa
  // tabela que so cresce — mesmo raciocinio do indice da auditoria, logo abaixo.
  await dbRun(db, `CREATE INDEX IF NOT EXISTS idx_anexos_almox_entidade
    ON anexos_documento_almoxarifado (entidade, entidade_id, ativo)`);
```

E acrescente as seis colunas ao `CREATE TABLE` acima, para que instalação nova nasça pronta:
`descricao TEXT`, `uploaded_by_nome TEXT`, `tamanho_bytes INTEGER`, `mime_type TEXT`,
`ativo INTEGER DEFAULT 1`, `deleted_by INTEGER`, `deleted_at DATETIME`.

- [x] **Step 4: O serviço**

Crie `server/services/almoxarifado/anexoService.js`:

```js
/**
 * Anexos de documento do almoxarifado — Etapa 32.
 *
 * A tabela `anexos_documento_almoxarifado` existia desde a Etapa 0 e era ORFA TOTAL: as 11
 * ocorrencias do nome no repositorio eram todas documentacao. Seis specs (01, 04, 08, 09, 12,
 * 14) a esperavam, e cada uma assumia que outra a pagaria.
 *
 * Este servico NAO toca em disco. Quem grava o arquivo e o multer da rota; quem apaga o orfao
 * de uma saida ≠ 201 e o `limparUploadOrfaoEm`. Aqui so entra o que o multer JA gravou, e sai a
 * linha do banco — a separacao existe para que a regra (entidade valida, pai existente, soft
 * delete) seja testavel sem I/O.
 */
const { dbRun, dbGet, dbAll } = require('./db');
const audit = require('./audit');

// Mapa FECHADO. Nao e string livre de proposito: `entidade` alimenta a listagem, e uma string
// livre deixaria o anexo pendurado num nome que nenhuma tela consulta — invisivel, e ninguem
// descobre. Os nomes de tabela foram LIDOS do CREATE TABLE de schema.js, nao imaginados:
// `recebimento` e `recebimentos_material_almoxarifado` e `inspecao` e
// `inspecoes_recebimento_almoxarifado` — os dois que a intuicao erraria.
const ENTIDADES_ANEXO = {
  material: 'materiais_almoxarifado',
  requisicao: 'requisicoes_almoxarifado',
  recebimento: 'recebimentos_material_almoxarifado',
  inspecao: 'inspecoes_recebimento_almoxarifado',
  devolucao: 'devolucoes_material_almoxarifado',
  item_remessa: 'itens_remessa_terceiro_almoxarifado',
};
// SEIS entidades, uma por pendencia REALMENTE medida nas specs (01, 04, 08, 09, 12, 14). Nao ha
// `lote` nem `remessa_terceiro`, e a ausencia e deliberada, nao esquecimento: nenhuma spec os
// pede, e o certificado de lote JA TEM dono desde a Etapa 6 (coluna propria + `uploadCertificado`,
// routes/almoxarifado.js:209) — uma entidade `lote` aqui criaria um SEGUNDO lugar para o mesmo
// documento, e a tela teria de explicar qual dos dois ela le. A feature 14 pede o anexo no ITEM
// da remessa (14-materiais-terceiros/README.md:114), nao na remessa. Acrescentar qualquer uma
// delas depois e UMA LINHA.

const CAMPOS_PUBLICOS = `id, entidade, entidade_id, tipo, descricao, nome_original,
  tamanho_bytes, mime_type, uploaded_by, uploaded_by_nome, created_at`;

function erro(status, mensagem) {
  const e = new Error(mensagem);
  e.status = status;
  return e;
}

function tabelaDe(entidade) {
  const tabela = ENTIDADES_ANEXO[entidade];
  if (!tabela) throw erro(400, 'Entidade inválida para anexo');
  return tabela;
}

async function assertPaiExiste(db, entidade, entidadeId) {
  const tabela = tabelaDe(entidade);
  const id = Number(entidadeId);
  // Number.isInteger e nao Number.isFinite: `1.5` viraria `1` no SQLite e penduraria o anexo
  // no registro errado, em silencio.
  if (!Number.isInteger(id) || id <= 0) throw erro(404, 'Registro não encontrado para anexar');
  const pai = await dbGet(db, `SELECT id FROM ${tabela} WHERE id = ?`, [id]);
  if (!pai) throw erro(404, 'Registro não encontrado para anexar');
  return id;
}

async function registrarAnexo(db, user, { entidade, entidade_id, tipo, descricao }, arquivo) {
  const paiId = await assertPaiExiste(db, entidade, entidade_id);
  if (!arquivo || !arquivo.filename) throw erro(400, 'Arquivo é obrigatório');

  const r = await dbRun(db, `INSERT INTO anexos_documento_almoxarifado
    (entidade, entidade_id, tipo, arquivo_path, nome_original, tamanho_bytes, mime_type, uploaded_by, uploaded_by_nome, descricao, ativo)
    VALUES (?,?,?,?,?,?,?,?,?,?,1)`, [
    entidade, paiId, tipo, arquivo.filename, arquivo.originalname || arquivo.filename,
    arquivo.size ?? null, arquivo.mimetype || null, user?.id ?? null,
    // DENORMALIZADO de proposito: `usuarios` e tabela CORE, fora do initSchema do almoxarifado e
    // fora do harness (testApp.js stuba so `clientes` e `fornecedores`) — um LEFT JOIN faria todo
    // POST morrer com "no such table: usuarios" no teste. Precedente escrito da base:
    // requisitionCreateService.js:31. E o nome do momento do upload e o que a trilha quer.
    user?.nome || user?.email || null, descricao || null,
  ]);

  const linha = await dbGet(db,
    `SELECT ${CAMPOS_PUBLICOS} FROM anexos_documento_almoxarifado WHERE id = ?`, [r.lastID]);

  // Auditoria POS-ESCRITA e best-effort: a mesma RN-02 da Etapa 19 — derrubar a resposta por
  // causa do log desfaria nada e devolveria erro para um ato que deu certo.
  try {
    await audit.registrarAuditoria(db, {
      entidade: 'anexo', entidade_id: r.lastID, acao: 'ANEXAR',
      usuario_id: user?.id, usuario_nome: user?.nome || user?.email,
      dados_novos: { entidade, entidade_id: paiId, tipo, nome_original: linha.nome_original },
    });
  } catch (e) { console.error('[almoxarifado] Falha ao auditar anexo:', e.message); }

  return linha;
}

async function listarAnexos(db, { entidade, entidade_id }) {
  tabelaDe(entidade); // 400 para entidade fora do mapa, mesma literal do POST
  return dbAll(db, `SELECT ${CAMPOS_PUBLICOS} FROM anexos_documento_almoxarifado
    WHERE entidade = ? AND entidade_id = ? AND ativo = 1
    ORDER BY created_at DESC, id DESC`, [entidade, Number(entidade_id) || 0]);
}

async function getAnexoParaDownload(db, id) {
  const n = Number(id);
  if (!Number.isInteger(n) || n <= 0) throw erro(404, 'Anexo não encontrado');
  const row = await dbGet(db, `SELECT id, arquivo_path, nome_original, mime_type
    FROM anexos_documento_almoxarifado WHERE id = ? AND ativo = 1`, [n]);
  if (!row) throw erro(404, 'Anexo não encontrado');
  return row;
}

async function removerAnexo(db, user, id) {
  const n = Number(id);
  if (!Number.isInteger(n) || n <= 0) throw erro(404, 'Anexo não encontrado');
  const antes = await dbGet(db,
    `SELECT ${CAMPOS_PUBLICOS} FROM anexos_documento_almoxarifado WHERE id = ? AND ativo = 1`, [n]);
  if (!antes) throw erro(404, 'Anexo não encontrado');

  // Claim por UPDATE-com-WHERE, molde do modulo: duas remocoes simultaneas, so uma tem changes=1.
  const r = await dbRun(db, `UPDATE anexos_documento_almoxarifado
    SET ativo = 0, deleted_by = ?, deleted_at = CURRENT_TIMESTAMP
    WHERE id = ? AND ativo = 1`, [user?.id ?? null, n]);
  if (!r.changes) throw erro(404, 'Anexo não encontrado');

  try {
    await audit.registrarAuditoria(db, {
      entidade: 'anexo', entidade_id: n, acao: 'REMOVER_ANEXO',
      usuario_id: user?.id, usuario_nome: user?.nome || user?.email,
      dados_anteriores: antes,
    });
  } catch (e) { console.error('[almoxarifado] Falha ao auditar remocao de anexo:', e.message); }

  // O ARQUIVO FICA NO DISCO, de proposito (D5 do design): documento de qualidade some da tela,
  // nao do sistema. Com o arquivo apagado, a linha de auditoria acima vira promessa vazia — ela
  // diz que existiu algo que ninguem pode mais ver. Alternativa descartada e registrada na
  // letra B.
  return { ok: true };
}

module.exports = {
  ENTIDADES_ANEXO, registrarAnexo, listarAnexos, getAnexoParaDownload, removerAnexo,
};
```

- [x] **Step 5: Rodar e ver passar**

Run: `cd server && node tests/api/anexoService.api.test.js`
Expected: `6 passed, 0 failed`.

- [x] **Step 6: Controle positivo — provar que os testes sabem falhar**

Sabote **uma coisa por vez** e confirme o vermelho, revertendo depois de cada uma:

1. Troque `if (!tabela) throw erro(400, ...)` por `if (!tabela) return 'materiais_almoxarifado'`.
   Esperado: **falha** o cenário da entidade fora do mapa.
2. Troque `WHERE ... AND ativo = 1` de `listarAnexos` por `WHERE entidade = ? AND entidade_id = ?`.
   Esperado: **falha** o cenário do soft delete (`removido nao aparece na lista`).
3. No mapa, troque `recebimento: 'recebimentos_material_almoxarifado'` por
   `recebimento: 'recebimentos_almoxarifado'` (o nome que a intuição erra).
   Esperado: **falha** o cenário das seis entidades, nomeando a chave.
4. No mapa, troque `recebimento` para apontar para `'materiais_almoxarifado'` (tabela que
   **existe**, mas é a errada). Esperado: **falha** pela asserção de tabelas distintas — é a
   sabotagem que separa "o mapa existe" de "o mapa está certo".

Se alguma sabotagem **não** derrubar teste nenhum, o teste correspondente é vazio — conserte-o
antes de seguir. Registre no plano o que cada sabotagem derrubou.

- [x] **Step 7: As duas ações de perfil**

Em `server/services/almoxarifado/permissions.js`, dentro de `ACAO_PERFIS`, depois de
`gerenciar_plano_inspecao`:

```js
  // Etapa 32: anexar documento e ato de QUEM OPERA, nao de um papel so — compras anexa a NF do
  // recebimento, qualidade anexa o certificado e o relatorio dimensional, producao anexa o
  // desenho da requisicao. Por isso a lista e larga: todos MENOS CONSULTA, cujo nome ja diz o
  // que ele faz.
  anexar_documento: [PERFIS.ADMINISTRADOR, PERFIS.ALMOXARIFE, PERFIS.COMPRAS, PERFIS.PRODUCAO, PERFIS.ENGENHARIA, PERFIS.GESTOR, PERFIS.QUALIDADE],
  // E a ASSIMETRIA e a decisao: remover e estreita. Tirar um certificado de vista e apagar
  // evidencia de qualidade — risco de natureza diferente de anexar, e o criterio "quando a
  // operacao muda a NATUREZA DO RISCO, ela ganha acao propria" e o mesmo de
  // ajustar_material_cliente, remessar_terceiro e conferir_separacao. A remocao e soft delete e
  // auditada; ainda assim, quem pode escondar documento e o balcao e o administrador.
  remover_anexo: [PERFIS.ADMINISTRADOR, PERFIS.ALMOXARIFE],
```

- [x] **Step 8: Medir o vermelho do client ANTES de escrever o rótulo (RN-07)**

Este passo **é** o controle positivo da correção que a Etapa 30 fez em `permissaoErro.test.js` —
ela trocou a régua por **presença no mapa `ACAO_PERFIS` importado do servidor**. Se aquela
correção está viva, as duas ações novas derrubam o teste **sozinhas**, sem ninguém escrever
asserção nova.

Run: `cd client && CI=true npx react-scripts test src/utils/permissaoErro.test.js --watchAll=false`
Expected: **FAIL**, nomeando `anexar_documento` e `remover_anexo` como ausentes do mapa.

> Se **passar**, pare: a régua da Etapa 30 não está viva e o buraco de rótulo voltaria pela
> quinta vez. Registre o achado no plano antes de continuar.

- [x] **Step 9: Os rótulos**

Em `client/src/utils/permissaoErro.js`, no mapa `ACOES`, depois de `ajustar_material_cliente`:

```js
  // Etapa 32: as duas acoes de anexo. Escritas JUNTO com ACAO_PERFIS de proposito — o vermelho
  // do teste desta pasta, medido antes deste commit, e a prova de que a regua da Etapa 30 (a
  // lista vem de ACAO_PERFIS do servidor, e o criterio e PRESENCA) esta viva.
  anexar_documento: 'anexar documento',
  remover_anexo: 'remover anexo',
```

E em `server/services/almoxarifado/auditLabels.js`, **três** entradas — a entidade e os **dois
verbos**:

- em `ROTULOS_ENTIDADE`: `anexo: 'Anexo'` (molde de `categoria: 'Categoria'`, da Etapa 26);
- em `ROTULOS_ACAO`: `ANEXAR: 'Anexo enviado'` e `REMOVER_ANEXO: 'Anexo removido'`.

> **Por que os verbos são MAIÚSCULOS** (`'ANEXAR'`, não `'anexar'`), e isto não é estilo: a régua
> de cobertura do vocabulário, `server/tests/api/auditLabels.api.test.js:60-61`, varre o código
> com `acao: '\K[A-Z_]+` — **só maiúsculas**. Verbo minúsculo **não entra** no
> `semRotulo = uniao.filter(v => labels.rotularAcao(v) === v)` (`:229-232`), então o teste que
> existe exatamente para impedir verbo sem rótulo ficaria verde, e a tela de auditoria da Etapa 22
> mostraria `anexar` cru no meio de `Criação`, `Exclusão`, `Calibração`. Com maiúscula, aquele
> teste **exige** o rótulo sozinho — o mesmo mecanismo grátis que o Step 8 explora no
> `permissaoErro`. E `REMOVER_ANEXO` em vez de `REMOVER` porque a trilha é lida meses depois, e
> um verbo genérico não diz o que foi removido.

- [x] **Step 10: Rodar tudo o que a Task 1 toca**

```bash
cd server && node tests/api/anexoService.api.test.js && npm run test:api
cd client && CI=true npx react-scripts test src/utils/permissaoErro.test.js --watchAll=false
```
Expected: serviço `6 passed`; `test:api` **166/166 arquivos** (165 → 166); `permissaoErro` verde.

- [x] **Step 11: Commit**

```bash
git add server/services/almoxarifado/anexoService.js server/services/almoxarifado/schema.js \
        server/services/almoxarifado/permissions.js server/services/almoxarifado/auditLabels.js \
        server/tests/api/anexoService.api.test.js client/src/utils/permissaoErro.js
git commit -F msg-servico.txt
```

Mensagem: diga que a tabela existia órfã desde a Etapa 0, que o mapa é fechado **porque** string
livre deixa anexo invisível, e que o vermelho do `permissaoErro` foi medido **antes** do rótulo.

---

### Task 2: Fiação do diretório e as quatro rotas  **(galho — worktree isolada)**

**Files:**
- Modify: `server/routes/almoxarifado.js` (`:188` bloco do diretório; `:3702` chamada da extended)
- Modify: `server/routes/almoxarifado/extended.js` (assinatura `:112` + rotas novas)
- Modify: `server/services/almoxarifado/schemas.js`
- Modify: `server/tests/helpers/testApp.js` (`:80`)
- Create: `server/tests/api/anexoDocumento.api.test.js`

**Interfaces:**
- Consumes: tudo o que a Task 1 exportou em `anexoService` (assinaturas acima, verbatim);
  `limparUploadOrfaoEm(req, dir)` — **atenção: o módulo `uploadCleanup.js` exporta
  `limparUploadOrfao`; `...Em` é o alias local de `extended.js:28`**, criado de propósito para
  obrigar a ler o 2º argumento. Dentro da extended o nome já está em escopo; `handleError(res, err)` e
  `formatZodError` já existentes na extended.
- Produces: as quatro rotas do design, e `ctx.uploadsAnexosDir` no harness (a Task 5 usa as duas
  coisas).

- [x] **Step 1: Escrever o teste que falha**

Crie `server/tests/api/anexoDocumento.api.test.js` (mesmo molde de runner; use `supertest`):

```js
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun } = require('../../services/almoxarifado/db');

let passou = 0, falhou = 0;
const testes = [];
function test(nome, fn) { testes.push([nome, fn]); }

const PDF = Buffer.from('%PDF-1.4 conteudo do certificado');

async function comMaterial(ctx) {
  const r = await dbRun(ctx.db,
    `INSERT INTO materiais_almoxarifado (codigo, nome, unidade) VALUES (?,?,?)`,
    ['MAT-1', 'Chapa 3mm', 'KG']);
  return r.lastID;
}
const arquivosEm = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir) : []);

// RN-04 — sem a acao, o arquivo NAO chega ao disco (o 403 sai antes do multer)
test('sem anexar_documento: 403 e NENHUM arquivo gravado', async () => {
  const ctx = await createTestApp();
  try {
    const materialId = await comMaterial(ctx);
    ctx.setUser({ id: 2, nome: 'Consulta', perfil_almoxarifado: 'CONSULTA' });
    const antes = arquivosEm(ctx.uploadsAnexosDir).length;
    const res = await request(ctx.app).post('/api/almoxarifado/anexos')
      .field('entidade', 'material').field('entidade_id', String(materialId))
      .field('tipo', 'FICHA')
      .attach('arquivo', PDF, 'cert.pdf');
    assert.strictEqual(res.status, 403);
    assert.strictEqual(res.body.acao, 'anexar_documento');
    assert.strictEqual(arquivosEm(ctx.uploadsAnexosDir).length, antes,
      'o 403 tem de sair ANTES do multer gravar');
  } finally { await ctx.close(); }
});

// [CONTROLE POSITIVO] quem TEM a acao anexa normalmente — sem isto, o cenario acima passaria
// com a rota inexistente (404 tambem nao grava arquivo... mas o status nao seria 403)
test('[CONTROLE POSITIVO] ALMOXARIFE anexa: 201 e UM arquivo a mais no disco', async () => {
  const ctx = await createTestApp();
  try {
    const materialId = await comMaterial(ctx);
    ctx.setUser({ id: 3, nome: 'Almoxarife', perfil_almoxarifado: 'ALMOXARIFE' });
    const antes = arquivosEm(ctx.uploadsAnexosDir).length;
    const res = await request(ctx.app).post('/api/almoxarifado/anexos')
      .field('entidade', 'material').field('entidade_id', String(materialId))
      .field('tipo', 'FICHA').field('descricao', 'Ficha tecnica')
      .attach('arquivo', PDF, 'cert.pdf');
    assert.strictEqual(res.status, 201, JSON.stringify(res.body));
    assert.ok(res.body.id > 0);
    assert.strictEqual(res.body.nome_original, 'cert.pdf');
    assert.strictEqual(res.body.arquivo_path, undefined, 'o nome no disco nao sai para o client');
    assert.strictEqual(arquivosEm(ctx.uploadsAnexosDir).length, antes + 1);
  } finally { await ctx.close(); }
});

// RN-06 — as saidas ≠ 201 limpam o upload
test('entidade invalida: 400 e o disco volta ao tamanho de antes', async () => {
  const ctx = await createTestApp();
  try {
    const antes = arquivosEm(ctx.uploadsAnexosDir).length;
    const res = await request(ctx.app).post('/api/almoxarifado/anexos')
      .field('entidade', 'qualquer_coisa').field('entidade_id', '1').field('tipo', 'X')
      .attach('arquivo', PDF, 'cert.pdf');
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.body.error, 'Entidade inválida para anexo');
    assert.strictEqual(arquivosEm(ctx.uploadsAnexosDir).length, antes, 'orfao nao pode ficar');
  } finally { await ctx.close(); }
});

test('entidade_id inexistente: 404 e o disco volta ao tamanho de antes', async () => {
  const ctx = await createTestApp();
  try {
    const antes = arquivosEm(ctx.uploadsAnexosDir).length;
    const res = await request(ctx.app).post('/api/almoxarifado/anexos')
      .field('entidade', 'material').field('entidade_id', '99999').field('tipo', 'X')
      .attach('arquivo', PDF, 'cert.pdf');
    assert.strictEqual(res.status, 404);
    assert.strictEqual(res.body.error, 'Registro não encontrado para anexar');
    assert.strictEqual(arquivosEm(ctx.uploadsAnexosDir).length, antes);
  } finally { await ctx.close(); }
});

test('arquivo ausente: 400 com a literal', async () => {
  const ctx = await createTestApp();
  try {
    const materialId = await comMaterial(ctx);
    const res = await request(ctx.app).post('/api/almoxarifado/anexos')
      .field('entidade', 'material').field('entidade_id', String(materialId)).field('tipo', 'X');
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.body.error, 'Arquivo é obrigatório');
  } finally { await ctx.close(); }
});

// RN-06, o ramo que os outros cenarios NAO alcancam: o Zod reprova DEPOIS de o multer ja ter
// gravado. `tipo` vazio passa pelo multer (o arquivo e valido) e morre no safeParse — e este e
// o unico cenario da suite que exercita o `limparUploadOrfaoEm` do ramo do Zod. Sem ele,
// apagar aquela linha deixa a suite inteira verde e vaza orfao a cada formulario mal preenchido.
test('Zod reprova o body: 400 e o disco volta ao tamanho de antes', async () => {
  const ctx = await createTestApp();
  try {
    const materialId = await comMaterial(ctx);
    const antes = arquivosEm(ctx.uploadsAnexosDir).length;
    const res = await request(ctx.app).post('/api/almoxarifado/anexos')
      .field('entidade', 'material').field('entidade_id', String(materialId))
      .field('tipo', '')
      .attach('arquivo', PDF, 'cert.pdf');
    assert.strictEqual(res.status, 400);
    assert.match(res.body.error, /^Dados inválidos —/);
    assert.strictEqual(arquivosEm(ctx.uploadsAnexosDir).length, antes, 'orfao do ramo Zod');
  } finally { await ctx.close(); }
});

test('tipo de arquivo recusado: 400 com a literal, e nada no disco', async () => {
  const ctx = await createTestApp();
  try {
    const materialId = await comMaterial(ctx);
    const antes = arquivosEm(ctx.uploadsAnexosDir).length;
    const res = await request(ctx.app).post('/api/almoxarifado/anexos')
      .field('entidade', 'material').field('entidade_id', String(materialId)).field('tipo', 'X')
      .attach('arquivo', Buffer.from('MZ'), 'virus.exe');
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.body.error, 'Anexo deve ser PDF ou imagem');
    assert.strictEqual(arquivosEm(ctx.uploadsAnexosDir).length, antes);
  } finally { await ctx.close(); }
});

// RN-03 — O CENARIO CENTRAL DA ETAPA: o arquivo do anexo NAO e servido estaticamente
test('RN-03: o anexo NAO sai pelo /api/uploads/almoxarifado, e SAI pela rota autenticada', async () => {
  const ctx = await createTestApp();
  try {
    const materialId = await comMaterial(ctx);
    const criado = await request(ctx.app).post('/api/almoxarifado/anexos')
      .field('entidade', 'material').field('entidade_id', String(materialId)).field('tipo', 'FICHA')
      .attach('arquivo', PDF, 'cert.pdf');
    assert.strictEqual(criado.status, 201);

    const nomeNoDisco = arquivosEm(ctx.uploadsAnexosDir)[0];
    assert.ok(nomeNoDisco, 'o multer gravou o arquivo');

    // A REGUA E A POSICAO RELATIVA, e nao o GET pelo basename. Sem esta assercao o cenario e
    // CEGO justamente para o erro que o design existe para evitar: com o diretorio em
    // `uploads/almoxarifado/anexos/`, o GET abaixo daria 404 POR CAMINHO ERRADO (o arquivo esta
    // um nivel mais fundo) enquanto a URL real `/api/uploads/almoxarifado/anexos/<nome>`
    // responderia 200 sem autenticacao nenhuma — 13 cenarios verdes e o furo entregue.
    const rel = path.relative(ctx.uploadsAlmoxDir, path.join(ctx.uploadsAnexosDir, nomeNoDisco));
    assert.ok(rel.startsWith('..'),
      `o diretorio de anexos esta DENTRO de uploads/almoxarifado (${rel}) — express.static serve subpasta`);

    // Os DOIS mounts de routes/almoxarifado.js:229-230, pelo caminho REAL do arquivo
    for (const prefixo of ['/api/uploads/almoxarifado', '/uploads/almoxarifado']) {
      const url = `${prefixo}/${rel.split(path.sep).join('/')}`;
      const estatico = await request(ctx.app).get(url);
      assert.strictEqual(estatico.status, 404, `anexo publico em ${url}`);
    }

    const baixado = await request(ctx.app).get(`/api/almoxarifado/anexos/${criado.body.id}/arquivo`);
    assert.strictEqual(baixado.status, 200);
    assert.ok(Buffer.from(baixado.body).equals(PDF), 'o conteudo baixado e o mesmo que subiu');
    assert.match(baixado.headers['content-disposition'] || '', /cert\.pdf/);
  } finally { await ctx.close(); }
});

// [CONTROLE POSITIVO da RN-03] a regua sabe reprovar: com o MESMO nome de arquivo dentro do
// diretorio estatico, o GET responde 200. Sem este cenario, "404 no estatico" passaria com o
// arquivo simplesmente nao existindo em lugar nenhum — o teste vazio classico desta base.
test('[CONTROLE POSITIVO] o mesmo arquivo DENTRO de uploads/almoxarifado sai publico (200)', async () => {
  const ctx = await createTestApp();
  try {
    fs.mkdirSync(ctx.uploadsAlmoxDir, { recursive: true });
    fs.writeFileSync(`${ctx.uploadsAlmoxDir}/prova-do-controle.pdf`, PDF);
    const res = await request(ctx.app).get('/api/uploads/almoxarifado/prova-do-controle.pdf');
    assert.strictEqual(res.status, 200,
      'se isto nao der 200, o 404 do cenario anterior nao prova nada');
  } finally { await ctx.close(); }
});

// O titulo promete DUAS coisas, entao o cenario tem de medir as duas. Com dois anexos no mesmo
// material e mais nada, uma `listarAnexos` que ignore o WHERE INTEIRO passa igual, e uma que
// ignore o `ativo = 1` tambem — por isso ha um anexo de OUTRO material e um REMOVIDO.
test('GET /anexos lista so os ativos DA entidade pedida', async () => {
  const ctx = await createTestApp();
  try {
    const materialA = await comMaterial(ctx);
    const rB = await dbRun(ctx.db,
      `INSERT INTO materiais_almoxarifado (codigo, nome, unidade) VALUES (?,?,?)`,
      ['MAT-2', 'Barra 1/2', 'M']);
    const materialB = rB.lastID;

    const anexar = (mid, nome) => request(ctx.app).post('/api/almoxarifado/anexos')
      .field('entidade', 'material').field('entidade_id', String(mid)).field('tipo', 'FICHA')
      .attach('arquivo', PDF, nome);

    const fica = await anexar(materialA, 'fica.pdf');
    const sai = await anexar(materialA, 'sai.pdf');
    await anexar(materialB, 'outro-material.pdf');
    await request(ctx.app).delete(`/api/almoxarifado/anexos/${sai.body.id}`);

    const res = await request(ctx.app)
      .get(`/api/almoxarifado/anexos?entidade=material&entidade_id=${materialA}`);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.length, 1, 'so o ativo do material A');
    assert.strictEqual(res.body[0].id, fica.body.id);
    assert.strictEqual(res.body[0].arquivo_path, undefined);
    assert.strictEqual(res.body[0].uploaded_by_nome, 'Admin Teste');
  } finally { await ctx.close(); }
});

test('DELETE sem remover_anexo: 403 com a acao no corpo', async () => {
  const ctx = await createTestApp();
  try {
    const materialId = await comMaterial(ctx);
    const criado = await request(ctx.app).post('/api/almoxarifado/anexos')
      .field('entidade', 'material').field('entidade_id', String(materialId)).field('tipo', 'FICHA')
      .attach('arquivo', PDF, 'cert.pdf');
    ctx.setUser({ id: 9, nome: 'Qualidade', perfil_almoxarifado: 'QUALIDADE' });
    const res = await request(ctx.app).delete(`/api/almoxarifado/anexos/${criado.body.id}`);
    assert.strictEqual(res.status, 403);
    assert.strictEqual(res.body.acao, 'remover_anexo');
  } finally { await ctx.close(); }
});

test('download de id inexistente: 404, nao 500 — inclusive id nao numerico', async () => {
  const ctx = await createTestApp();
  try {
    for (const id of ['99999', 'abc']) {
      const res = await request(ctx.app).get(`/api/almoxarifado/anexos/${id}/arquivo`);
      assert.strictEqual(res.status, 404, `id ${id}`);
      assert.strictEqual(res.body.error, 'Anexo não encontrado');
    }
  } finally { await ctx.close(); }
});

test('linha viva com arquivo fora do disco: 404 proprio, nao 500', async () => {
  const ctx = await createTestApp();
  try {
    const materialId = await comMaterial(ctx);
    const criado = await request(ctx.app).post('/api/almoxarifado/anexos')
      .field('entidade', 'material').field('entidade_id', String(materialId)).field('tipo', 'FICHA')
      .attach('arquivo', PDF, 'cert.pdf');
    for (const f of arquivosEm(ctx.uploadsAnexosDir)) fs.unlinkSync(`${ctx.uploadsAnexosDir}/${f}`);
    const res = await request(ctx.app).get(`/api/almoxarifado/anexos/${criado.body.id}/arquivo`);
    assert.strictEqual(res.status, 404);
    assert.strictEqual(res.body.error, 'Arquivo do anexo não encontrado');
  } finally { await ctx.close(); }
});

(async () => {
  for (const [nome, fn] of testes) {
    try { await fn(); console.log(`  ✓ ${nome}`); passou++; }
    catch (e) { console.log(`  ✗ ${nome}\n    ${e.message}`); falhou++; }
  }
  console.log(`\n${passou} passed, ${falhou} failed`);
  process.exit(falhou ? 1 : 0);
})();
```

> **Armadilha do harness, medida:** `getPerfilFromUser` (`permissions.js:139-146`) checa
> `user.role === 'admin'` **antes** de `user.perfil_almoxarifado`. O usuário padrão do harness é
> `{ id: 1, nome: 'Admin Teste', role: 'admin' }` — por isso os cenários que criam anexo sem
> `setUser` passam como ADMINISTRADOR, e todo `setUser` de perfil restrito **não pode** levar
> `role: 'admin'` junto, ou o teste vira verde provando nada.

- [x] **Step 2: Rodar e ver falhar**

Run: `cd server && node tests/api/anexoDocumento.api.test.js`
Expected: FAIL — `ctx.uploadsAnexosDir` é `undefined` e as rotas respondem 404.

- [x] **Step 3: O diretório e a fiação**

Em `server/routes/almoxarifado.js`, logo depois do bloco de `uploadsAlmoxDir` (`:188-189`):

```js
  // Etapa 32 (D1): os anexos vao para um diretorio IRMAO, nao para uma subpasta de
  // uploadsAlmoxDir. `express.static(root)` serve as subpastas de root tambem — guardar em
  // uploads/almoxarifado/anexos deixaria todo anexo publico pelos mounts das linhas ~229-230,
  // que nao passam por auth nenhuma. Criado explicitamente porque o multer NAO cria diretorio
  // (D3 da Etapa 9b: o primeiro upload numa subpasta inexistente da ENOENT -> 500).
  const uploadsAnexosDir = path.join(PERSISTENT_DATA_DIR, 'uploads', 'almoxarifado-anexos');
  if (!fs.existsSync(uploadsAnexosDir)) fs.mkdirSync(uploadsAnexosDir, { recursive: true });
```

E na chamada da extended (`:3702`), passe o novo diretório como **5º argumento**:

```js
    require('./almoxarifado/extended')(app, db, authenticateToken, uploadsAlmoxDir, uploadsAnexosDir);
```

> Confira o nome real do 3º argumento nessa chamada antes de editar — copie o que está lá; o
> ponto do passo é **acrescentar o 5º**, não reescrever os outros.

Em `server/routes/almoxarifado/extended.js:112`:

```js
module.exports = function registerExtendedRoutes(app, db, authenticateToken, uploadsAlmoxDir, uploadsAnexosDir) {
```

Em `server/tests/helpers/testApp.js`, ao lado de `uploadsAlmoxDir` (`:80`):

```js
    uploadsAnexosDir: path.join(dataDir, 'uploads', 'almoxarifado-anexos'),
```

- [x] **Step 4: O Zod**

Em `server/services/almoxarifado/schemas.js`, no molde dos schemas existentes — **e acrescente
`AnexoCreateSchema` à lista explícita de `module.exports` em `schemas.js:736-748`**. O arquivo
exporta por lista fechada, item a item, **não** por spread: sem essa linha o binding na extended é
`undefined` e **todo** `POST /anexos` morre em `Cannot read properties of undefined (reading
'safeParse')` — 500 com stack, depois de o multer já ter gravado, e a causa não aparece na
mensagem.

```js
// Etapa 32: o body chega por multipart, entao TUDO e string — `entidade_id` vem como '12'.
// `coerce` aqui e o mesmo movimento que os schemas de formulario ja fazem no modulo.
const AnexoCreateSchema = z.object({
  entidade: z.string().min(1, 'Entidade é obrigatória'),
  entidade_id: z.coerce.number().int().positive('Registro inválido'),
  tipo: z.string().min(1, 'Tipo é obrigatório').max(60),
  descricao: z.string().max(300).optional(),
});
```

- [x] **Step 5: As quatro rotas**

Em `server/routes/almoxarifado/extended.js`, num bloco próprio (sugestão: logo após as rotas de
ocorrência de ferramenta, que são o molde multipart mais recente):

```js
  // ── Anexos de documento (Etapa 32) ────────────────────────────────────────────
  // Gravacao FLAT em uploadsAnexosDir — o diretorio IRMAO de uploads/almoxarifado (D1 do
  // design). NAO trocar por subpasta de uploadsAlmoxDir: express.static serve subpasta, e o
  // anexo viraria publico pelos mounts de routes/almoxarifado.js:229-230.
  const uploadAnexo = multer({
    storage: multer.diskStorage({
      destination: (req, file, cb) => cb(null, uploadsAnexosDir),
      filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        cb(null, `anexo-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
      },
    }),
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
      if (/^(application\/pdf|image\/(jpeg|jpg|png|webp))$/i.test(file.mimetype)) return cb(null, true);
      cb(new Error('Anexo deve ser PDF ou imagem'));
    },
  });

  // Ordem canonica (D3 da Etapa 9b): auth -> requirePermission -> multer -> safeParse manual.
  // O gate e UMA acao so, entao vai na PORTA: o 403 sai antes de o multer gravar qualquer coisa
  // — precedente medido em permissoesRotas.api.test.js:515-534 e coberto aqui pela RN-04.
  app.post('/api/almoxarifado/anexos', auth, requirePermission('anexar_documento'),
    (req, res, next) => uploadAnexo.single('arquivo')(req, res, (err) => {
      // O erro do fileFilter e do limite chegam como excecao do multer, nao como 400 do Zod.
      // Sem este wrapper o `next(err)` cai no handler de erro do Express e vira 500 com stack.
      // O `limparUploadOrfaoEm` daqui e defesa em profundidade e NO-OP no caminho normal: o
      // multer 2.x ja apaga o parcial sozinho (`make-middleware.js:78-99`, removeUploadedFiles)
      // e nunca seta `req.file` nos caminhos de erro — medido na revisao do plano.
      if (!err) return next();
      limparUploadOrfaoEm(req, uploadsAnexosDir);
      const msg = err.code === 'LIMIT_FILE_SIZE' ? 'Arquivo excede o limite de 10 MB' : err.message;
      return res.status(400).json({ error: msg });
    }),
    async (req, res) => {
      if (!req.file) return res.status(400).json({ error: 'Arquivo é obrigatório' });
      const parsed = AnexoCreateSchema.safeParse(req.body);
      if (!parsed.success) {
        limparUploadOrfaoEm(req, uploadsAnexosDir);
        return res.status(400).json({ error: `Dados inválidos — ${formatZodError(parsed.error)}` });
      }
      try {
        res.status(201).json(await anexoService.registrarAnexo(db, req.user, parsed.data, req.file));
      } catch (e) {
        limparUploadOrfaoEm(req, uploadsAnexosDir);
        handleError(res, e);
      }
    });

  app.get('/api/almoxarifado/anexos', auth, requirePermission('visualizar'), async (req, res) => {
    try { res.json(await anexoService.listarAnexos(db, req.query)); }
    catch (e) { handleError(res, e); }
  });

  app.get('/api/almoxarifado/anexos/:id/arquivo', auth, requirePermission('visualizar'), async (req, res) => {
    try {
      const anexo = await anexoService.getAnexoParaDownload(db, req.params.id);
      // `basename` e a guarda de travessia: mesmo que a coluna seja adulterada por outra via,
      // o caminho nunca sai de uploadsAnexosDir.
      const arquivo = path.join(uploadsAnexosDir, path.basename(anexo.arquivo_path));
      // Linha viva com arquivo ausente e estado ESPERADO (restore de banco sem restore de
      // uploads), nao erro de programa — 404 proprio, e nao o 500 do sendFile.
      if (!fs.existsSync(arquivo)) {
        return res.status(404).json({ error: 'Arquivo do anexo não encontrado' });
      }
      if (anexo.mime_type) res.type(anexo.mime_type);
      res.setHeader('Content-Disposition',
        `attachment; filename="${String(anexo.nome_original || 'anexo').replace(/"/g, '')}"`);
      res.sendFile(arquivo);
    } catch (e) { handleError(res, e); }
  });

  app.delete('/api/almoxarifado/anexos/:id', auth, requirePermission('remover_anexo'), async (req, res) => {
    try { res.json(await anexoService.removerAnexo(db, req.user, req.params.id)); }
    catch (e) { handleError(res, e); }
  });
```

Acrescente `AnexoCreateSchema` à desestruturação do `require` de `schemas` (`extended.js:20`) e
`const anexoService = require('../../services/almoxarifado/anexoService');` junto dos outros
serviços.

- [x] **Step 6: Rodar e ver passar**

Run: `cd server && node tests/api/anexoDocumento.api.test.js`
Expected: `13 passed, 0 failed`.

- [x] **Step 7: Controle positivo — as três sabotagens que importam**

1. Troque `destination: (req, file, cb) => cb(null, uploadsAnexosDir)` por `uploadsAlmoxDir`.
   Esperado: **a RN-03 fica vermelha na âncora `o multer gravou o arquivo`** — o diretório de
   anexos fica vazio e `nomeNoDisco` vem `undefined`, então o `assert.ok` estoura **antes** do
   `GET` estático. É a sabotagem que prova que a etapa não é decorativa, mas **registre o motivo
   real**: para observar o 200 no estático, troque durante a sabotagem por
   `const nomeNoDisco = arquivosEm(ctx.uploadsAlmoxDir).find((f) => f.startsWith('anexo-'));`.
2. Remova o 5º argumento da chamada em `routes/almoxarifado.js` (a fiação).
   Esperado: **falham todos os cenários de upload** — é o modo de falha da Etapa 25, e o teste
   entra **pela rota** justamente para pegá-lo. **O cenário da RN-04 (403) continua VERDE**, e
   isso é correto, não falha da sabotagem: o 403 sai antes do multer, então ele não depende da
   fiação. Registre assim, senão parece que a sabotagem vazou.
3. Remova o `limparUploadOrfaoEm` do **catch** do POST.
   Esperado: **falha** o cenário do `entidade_id` inexistente (contagem de arquivos).
4. **A sabotagem que exercita a asserção central**: aponte `uploadsAnexosDir` para
   `path.join(PERSISTENT_DATA_DIR, 'uploads', 'almoxarifado', 'anexos')` **e** faça o mesmo em
   `testApp.js`. Esperado: **falha em `rel.startsWith('..')`** e, se você remover essa asserção
   para ver, os dois mounts respondem **200**. É o erro que o design nomeia como "o instinto
   óbvio", e sem esta sabotagem ninguém sabe se o teste o pega.
5. Remova o `limparUploadOrfaoEm` do **ramo do Zod** (o `if (!parsed.success)`).
   Esperado: **falha só** o cenário `Zod reprova o body`. Se ele não existisse, esta linha poderia
   ser apagada com a suíte inteira verde, vazando órfão a cada formulário mal preenchido — e a
   sabotagem 3 **não** cobre este ramo, são dois `limparUploadOrfaoEm` diferentes.

- [x] **Step 8: Suíte de servidor inteira**

```bash
cd server && npm run test:api && npm run test:almoxarifado
```
Expected: `test:api` **167/167 arquivos**; `test:almoxarifado` `42 passou, 0 falhou`.

- [x] **Step 9: Commit**

```bash
git add server/routes/almoxarifado.js server/routes/almoxarifado/extended.js \
        server/services/almoxarifado/schemas.js server/tests/helpers/testApp.js \
        server/tests/api/anexoDocumento.api.test.js
git commit -F msg-rotas.txt
```

---

### Task 3: Componente `AnexosDocumento`  **(galho — worktree isolada)**

**Files:**
- Create: `client/src/components/almoxarifado/AnexosDocumento.js`
- Create: `client/src/components/almoxarifado/AnexosDocumento.test.js`

**Interfaces:**
- Consumes: **só o contrato HTTP congelado** no design — este é o único mock legítimo da etapa,
  porque a fronteira HTTP existe de verdade. `jest.mock('../../services/api')`.
- Produces, e a Task 4 depende disto:
  `<AnexosDocumento entidade="inspecao" entidadeId={id} titulo="Anexos" somenteLeitura={false} />`

> ⚠️ **`@testing-library/react` NÃO está instalado neste projeto** — medido: não está em
> `client/package.json`, não está em `client/node_modules/@testing-library`, e não está hoisted na
> raiz. `LoteSeletor.test.js:10-12` já documenta essa pegadinha. Importá-lo derruba a suíte com
> `Cannot find module`, que **parece** o `Cannot find module './AnexosDocumento'` esperado no Step
> 2 e mascara o problema real. E instalar a biblioteca num galho paralelo commitaria um
> `package-lock.json` alterado dentro da worktree — não faça.
>
> **O molde correto é `PlanoInspecaoModal.test.js:23-25` + `RelatoriosAlmoxarifado.test.js`:**
> `import React, { act } from 'react'`, `createRoot` de `react-dom/client`,
> `global.IS_REACT_ACT_ENVIRONMENT = true`, `container = document.createElement('div')`, e o
> helper `esperarEfeitos = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); })`.

**Três moldes que o executor DEVE abrir antes de escrever qualquer linha** — os três já resolvem
problemas medidos nesta base, e reinventá-los custa um fix-round:

| Molde | Onde | O que resolve |
|---|---|---|
| download por blob | `RelatoriosAlmoxarifado.js:308-340` | o fluxo `blob → anchor → revoke` **e** a leitura da mensagem de erro |
| mock de `createObjectURL` | `RelatoriosAlmoxarifado.test.js:108-122` | jsdom **não implementa** `URL.createObjectURL` |
| `File` num input | `LotesAlmoxarifado.test.js:240` | disparar `change` sem `fireEvent` |

- [x] **Step 1: Escrever o teste que falha**

Crie `client/src/components/almoxarifado/AnexosDocumento.test.js` com **sete** cenários. O
`beforeEach` é obrigatório e não é boilerplate opcional — sem ele o cenário 5 passa com o
componente quebrado:

```js
beforeEach(() => {
  jest.clearAllMocks();
  // jsdom NAO implementa nenhum dos dois. Sem o stub, o handler de download lanca no meio e o
  // catch engole: o cenario 5, que so olha `api.get`, passaria com o download quebrado.
  window.URL.createObjectURL = jest.fn(() => 'blob:mock-url');
  window.URL.revokeObjectURL = jest.fn();
  container = document.createElement('div');
  document.body.appendChild(container);
});
```

Os sete cenários:

1. **lista o que o GET devolveu** — e o mock é **params-aware** (GC 8 desta base, escrita em
   `PlanoInspecaoModal.test.js:9-21`): com `mockResolvedValue` simples, o cenário passa mesmo que
   o componente chame a rota **sem** `params` ou com a entidade trocada.
   ```js
   api.get.mockImplementation((url, cfg) =>
     (url === '/almoxarifado/anexos' && cfg?.params?.entidade === 'inspecao'
       && cfg?.params?.entidade_id === 7)
       ? Promise.resolve({ data: [anexoA, anexoB] })
       : Promise.resolve({ data: [] }));
   ```
2. **`entidadeId` ausente não chama a API — e com `entidadeId` chama, no mesmo teste** (GC 9): o
   negativo sozinho passa idêntico com o componente retornando `null` ou com o `useEffect` nunca
   escrito. Renderize duas vezes: sem `entidadeId` → `expect(api.get).not.toHaveBeenCalled()`;
   com `entidadeId={7}` → uma chamada, com os params certos.
3. **upload manda `FormData` com os quatro campos** — inspecione o `FormData` passado a
   `api.post`: `entidade`, `entidade_id`, `tipo`, `arquivo`.
4. **erro do `post` aparece com a mensagem do servidor** — `api.post` rejeitando com
   `{ response: { data: { error: 'Anexo deve ser PDF ou imagem' } } }` → esse texto na tela.
5. **download usa `responseType: 'blob'`** —
   `expect(api.get).toHaveBeenCalledWith('/almoxarifado/anexos/5/arquivo', { responseType: 'blob' })`.
   É o cenário que impede alguém de "simplificar" para `<a href>`, que tomaria 401 porque a rota
   é autenticada.
6. **erro do `get` de download vem do Blob, não de `data.error`** — `api.get` rejeitando com
   `{ response: { data: new Blob([JSON.stringify({ error: 'Arquivo do anexo não encontrado' })]) } }`
   → esse texto na tela. **Sem este cenário o defeito é invisível** (ver Step 3).
7. **`somenteLeitura` esconde upload e remoção — e a metade positiva no mesmo teste** (GC 9):
   renderize com `somenteLeitura={false}` (input **presente**, botão remover **presente**) e
   depois com `true` (os dois ausentes).

- [x] **Step 2: Rodar e ver falhar**

Run: `cd client && CI=true npx react-scripts test --watchAll=false AnexosDocumento`
Expected: FAIL — `Cannot find module './AnexosDocumento'`.

- [x] **Step 3: Implementar o componente**

`client/src/components/almoxarifado/AnexosDocumento.js`. Pontos que o código **tem** de respeitar,
e o porquê de cada um (escreva-os como comentário no topo, no estilo desta pasta):

- **O download é `blob`, não link.** A rota é autenticada; `<a href>` e `<img src>` saem sem o
  `Authorization` do interceptor do axios e tomam 401. O fluxo é
  `api.get(url, { responseType: 'blob' })` → `URL.createObjectURL` → `<a download>` sintético →
  **`URL.revokeObjectURL` no fim** (sem revogar, cada download vaza o blob até o reload).
- **⚠️ Com `responseType: 'blob'`, `e.response?.data?.error` é SEMPRE `undefined`** — o axios
  entrega o **corpo do erro como Blob também**. Este achado já foi medido e está documentado em
  `RelatoriosAlmoxarifado.js:325-333`, onde custou uma rodada: 403, 400 e 404 apareciam todos
  como a mesma mensagem genérica. **Copie aquele `catch`**: `await bruto.text()` → `JSON.parse` →
  `corpo.error`, com fallback. O caso real que isto atende é o anexo cuja linha existe e o
  arquivo sumiu (restore de banco sem restore de uploads), que a rota trata com 404 próprio — e
  que o usuário precisa conseguir distinguir de "sem permissão".
- **`FormData` sem `Content-Type` manual** — o interceptor de `services/api.js:43-49` já remove o
  header para o browser pôr o `boundary`. Definir `multipart/form-data` à mão quebra o upload.
- **Guarda de `entidadeId` falsy antes de qualquer `useEffect`** — cenário 2.
- **A mensagem de erro vem do servidor**, com fallback genérico. As literais desta etapa são
  contrato; reescrevê-las no client faria a tela e o servidor divergirem.
- **Sem cache de módulo na listagem** — mesma razão do `useCategoriasMaterial` da Etapa 26: com
  cache, o anexo recém-enviado não apareceria até um reload, que é o "a tela mente" que a etapa
  corrige.

- [x] **Step 4: Rodar e ver passar**

Run: `cd client && CI=true npx react-scripts test --watchAll=false AnexosDocumento`
Expected: 7 testes verdes.

- [x] **Step 5: Controle positivo**

Três sabotagens, uma por vez, revertendo depois de cada:

1. Troque o `responseType: 'blob'` por um `<a href>` direto → o cenário 5 falha.
2. Remova a guarda de `entidadeId` → o cenário 2 falha na metade negativa.
3. Troque o `catch` do download por `e.response?.data?.error` → o cenário 6 falha, mostrando o
   fallback genérico. **Se ele não falhar**, o mock do Blob não está representando o axios —
   conserte o teste antes de seguir.

- [x] **Step 6: Commit**

```bash
git add client/src/components/almoxarifado/AnexosDocumento.js \
        client/src/components/almoxarifado/AnexosDocumento.test.js
git commit -F msg-componente.txt
```

---

### Task 4: Plug na aba Histórico de inspeções (feature 09)

**Files:**
- Modify: `client/src/components/almoxarifado/HistoricoInspecoes.js`
- Modify: `client/src/components/almoxarifado/HistoricoInspecoes.test.js`

**Interfaces:**
- Consumes: `AnexosDocumento` da Task 3, com as props exatas ali declaradas.

> **⚠️ Correção medida na Fase 2 — a versão anterior deste plano mandava plugar em
> `InspecoesAlmoxarifado.js`, em `somenteLeitura`, e as duas coisas estavam erradas.**
>
> `inspecoes_recebimento_almoxarifado` só ganha linha no `INSERT` de `inspectionService.js:268`,
> **dentro da decisão**. Logo, a fila de pendentes (`GET /inspecoes/pendentes`) devolve `item_id`,
> **não** `inspecao.id` — não há `entidade_id` para usar ali. O único lugar do client onde o `id`
> da inspeção existe é a **aba Histórico**, e ela é renderizada por `HistoricoInspecoes.js`
> (`data-testid="historico-linha-${h.id}"`), não por `InspecoesAlmoxarifado.js`.
>
> E `somenteLeitura` deixaria a etapa **sem superfície nenhuma para anexar**: backend com 19
> cenários verdes, ação `anexar_documento` criada, e zero botões. O certificado e o relatório
> dimensional chegam **depois** da decisão — é exatamente ali que anexar tem sentido. Por isso o
> plug é `somenteLeitura={false}`, na **linha expandida** do histórico, onde já mora o fetch de
> `/inspecoes/${id}/medidas` (`HistoricoInspecoes.js:88`).

- [x] **Step 1: Teste que falha**

Em `HistoricoInspecoes.test.js`, dois cenários novos:

1. **linha expandida mostra o bloco de anexos COM input de arquivo** — `entidade="inspecao"`,
   `entidadeId` igual ao `h.id` da linha, e o input presente (não é `somenteLeitura`).
2. **linha fechada não monta o bloco** — o componente não deve disparar `GET /anexos` para todas
   as linhas do histórico ao abrir a aba; com 100 linhas seriam 100 requisições. Asserte que
   `api.get` não foi chamado com `/almoxarifado/anexos` antes do clique de expandir.

- [x] **Step 2: Rodar e ver falhar**

Run: `cd client && CI=true npx react-scripts test --watchAll=false HistoricoInspecoes`

- [x] **Step 3: Plugar**

`import AnexosDocumento from './AnexosDocumento';` e renderizar dentro do bloco expandido, ao lado
das medidas. Comentário no ponto do plug com as duas razões acima: por que é aqui (é o único lugar
com `id`) e por que não é `somenteLeitura` (senão a etapa não entrega superfície nenhuma).

- [x] **Step 4: Rodar e ver passar**

Run: `cd client && CI=true npx react-scripts test --watchAll=false HistoricoInspecoes InspecoesAlmoxarifado`
Expected: as duas suítes verdes — a segunda não deve ter mudado.

- [x] **Step 5: Commit** (`msg-plug.txt`)

---

### Task 5: Integração cruzando os galhos, e fechamento

**Files:**
- Modify: `server/tests/api/anexoDocumento.api.test.js`

- [x] **Step 1: O fluxo inteiro, pela rota**

Um cenário só, que percorre **anexar → listar → baixar conferindo o conteúdo → remover → listar
vazio → baixar de novo (404)**, com dois perfis diferentes: quem anexa é `QUALIDADE`, quem remove
é `ALMOXARIFE`. Cruza a Task 1 (serviço), a Task 2 (rotas e fiação) e as duas ações da Task 1.

**E ele carrega a única asserção da suíte que mede a metade "e no disco" da RN-05.** Sem ela,
alguém que "limpe" o `removerAnexo` acrescentando um `fs.unlinkSync` não derruba **nenhum** dos 19
cenários — a decisão que o design mais defende (D5) cairia em silêncio. O teste de serviço não
pode pegar (o serviço não toca disco por construção) e o `404` do "baixar de novo" é ambíguo:

```js
    const noDiscoAntes = arquivosEm(ctx.uploadsAnexosDir);
    // ... DELETE como ALMOXARIFE ...
    assert.deepStrictEqual(arquivosEm(ctx.uploadsAnexosDir), noDiscoAntes,
      'D5: soft delete NAO apaga o arquivo do disco');
    const depois = await request(ctx.app).get(`/api/almoxarifado/anexos/${id}/arquivo`);
    assert.strictEqual(depois.status, 404);
    // A LITERAL importa: tem de ser o 404 da LINHA (ativo = 0), nao o do arquivo sumido —
    // senao o cenario passaria igual com o unlink que ele existe para proibir.
    assert.strictEqual(depois.body.error, 'Anexo não encontrado');

- [x] **Step 2: A suíte inteira, serial**

```bash
cd server && npm run test:api
cd server && npm run test:almoxarifado
cd server && npm run test:validation && npm run test:safealter && npm run test:sqlite
cd client && CI=true npx react-scripts test --watchAll=false
cd client && CI=true npx react-scripts build
```

- [x] **Step 3: Fase 5 — revisão adversarial**

Revisores frescos em paralelo, lentes distintas: (a) correção das RN-01..RN-07; (b)
autorização/perfil — inclusive *"o `visualizar` no download é largo demais? quem vê o almoxarifado
vê o certificado de qualquer entidade"*; (c) *"este teste passaria com a feature quebrada?"*, com
foco na RN-03 e no controle positivo dela. Achado só vale com cenário concreto e reproduzido.

- [x] **Step 4: Fechamento**

Skill `fechar-etapa`, os 7 artefatos. Pontos que já estão decididos e **precisam** aparecer:

- **letra B**: (a) soft delete mantendo o arquivo no disco — alternativa descartada: apagar junto;
  (b) `visualizar` como gate do download, e não uma ação por entidade — alternativa descartada:
  gate por entidade depois do multer, que obrigaria a limpar órfão no 403; (c) `remover_anexo`
  restrito a ADMINISTRADOR e ALMOXARIFE.
- **letra C (furo)**: os seis uploads legados continuam **públicos sem autenticação** em
  `/api/uploads/almoxarifado` — foto de material, certificado de lote, comprovante de
  sucateamento, certificado de calibração, foto de ocorrência e **assinatura de entrega**. Nomeie
  o caminho: migrar as seis para download autenticado e trocar os `<img src>`/`<a href>` do
  client por blob. **Etapa própria**, porque mexe em duas telas e nos testes que congelam as URLs
  (`LotesAlmoxarifado.test.js:298`, `RequisicoesList.test.js:155,289`).
- **specs**: marcar em 09 o item de anexos, e acrescentar em 01, 04, 08, 12 e 14 a linha dizendo
  que **o mecanismo existe e falta o plug da tela** — a spec não pode continuar dizendo que a
  tabela é o bloqueio, porque deixou de ser.
- **guia do usuário**: roteiro clicável — abrir uma inspeção decidida, anexar um PDF, baixar,
  remover; e o aviso de que anexo removido some da tela mas fica na trilha.


---

---

## Fechamento (2026-09-02)

| Task | Commit | Medido |
|---|---|---|
| 1 — schema, serviço, 2 ações | `0bb9ab4` | serviço 6/6 · `test:api` 166/166 |
| 2 — fiação e 4 rotas (galho) | `8a496e9` | rota 13/13 · `test:api` 167/167 |
| 3 — componente (galho) | `59902a9` | 7/7 · client 42 suítes |
| 4 — plug na aba Histórico | `8847c7e` | 13/13 |
| 5 — integração | `dad6a84` | 14/14 |
| fix-round adversarial | `2bad01b` | rota 22/22 · client 647 |
| fix-round 2 (affordance) | `fd71958` | `HistoricoInspecoes` 14/14 · client 648 |

> ⚠️ **O hash que a Task 3 reportou (`21bc179`) é ÓRFÃO.** Ela rodou em worktree e foi integrada
> por `cherry-pick`, que reescreve o hash — `git show 21bc179` falha em qualquer clone. O commit
> real é **`59902a9`**. Conferido com `git merge-base --is-ancestor` em todos os hashes citados;
> é a terceira vez que esta armadilha aparece nesta base.

### Onde a execução divergiu do plano

1. **O cenário de integração montava a inspeção com `material_id`, coluna que não existe.** A
   tabela amarra em `recebimento_item_id` (`schema.js:1123`). Mesma classe de erro que a Fase 2
   pegou nos nomes de tabela do mapa: nome imaginado em vez de lido.
2. **O `Blob` do jsdom não representa o do navegador.** O plano mandava montar o corpo de erro do
   cenário (6) com `new Blob([...])` cru; jsdom 16.7 **não implementa** `Blob.prototype.text` nem
   `.arrayBuffer`. Com o Blob cru, o `catch` **correto** cairia no fallback e o cenário ficaria
   **vermelho com a implementação certa**. O executor repôs a API via `FileReader` e documentou.
3. **Jest não roda em worktree sob `.claude/`** — o `\.` de `.claude` é lido pelo glob como
   escape, e `testMatch` casa **zero** arquivos, inclusive os que já existiam. Contorno para quem
   for executar em worktree: `--testMatch "**/src/**/*.test.js"`.
4. **A Task 3 mexeu em `Almoxarifado.css`**, fora da lista de arquivos dela — o componente é
   genérico e não pode herdar o CSS da tela que o hospeda. Aditivo, sem conflito.
5. **A Task 4 mudou o comportamento de uma tela existente**, o que o plano não previa: a linha do
   histórico **sem medidas** passou a expandir. Sem isso o anexo só existiria em inspeção com
   plano dimensional. Custou uma asserção do teste da Etapa 29 (`detalhe(8) === null`), que era
   consequência do desenho antigo e não a regra guardada — a perda está escrita no próprio teste.
6. **Sabotar em worktree, não na árvore principal.** Rodei os controles positivos na árvore
   enquanto os revisores adversariais liam o código, e **dois deles relataram medições
   contaminadas** por sabotagens vivas que não estavam em `HEAD`. Nenhum resultado final foi
   afetado (os dois refizeram contra `HEAD` limpo), mas é defeito de processo e o modo de falha
   é sério: um `git add` no instante errado leva a sabotagem para o commit.

### Retro de 4 números

1. **Rodadas de correção até verde: 2.** Um fix-round dos achados adversariais e um segundo só
   para a affordance. Nenhum teste falhou duas vezes.
2. **Achados: 22 na Fase 2 + 25 na Fase 5 = 47 reais, 0 ruído.** A Fase 2 continua sendo a mais
   lucrativa: **4 dos 22 travariam a execução**, e um deles faria o executor **abortar a etapa
   inteira** por alarme falso. A Fase 5 achou **2 bloqueantes** que a Fase 2 não tinha como ver,
   porque só aparecem executando.
3. **Paralelismo: 2 galhos reais** (rotas e componente), em worktrees isoladas, **zero
   retrabalho**. A independência só se sustentou porque a Fase 2 mandou `uploaded_by_nome` para o
   tronco — era o único campo do contrato que os dois galhos podiam implementar de formas
   incompatíveis sem teste nenhum perceber, nem o de integração.
4. **Defeito que escapou:** preencher na etapa seguinte.

**Quinto número, o mesmo das quatro etapas anteriores: 3 testes passavam com a feature
quebrada** — e desta vez um deles era o **cenário-bandeira** (RN-03, cego para o erro que o
design existe para evitar), outro era a **defesa central da listagem** (que não provava o "da
entidade pedida"), e o terceiro era **meu, escrito no próprio fix-round** (o cenário do campo
repetido ficava verde com a guarda fraca de volta, porque o único efeito observável da correção
era um `console.warn` que ninguém espionava).

### Lição da etapa: a régua tem de medir a POSIÇÃO, não o exemplo

A RN-03 assertava `GET /api/uploads/almoxarifado/<basename> → 404`. Isso é um **exemplo**: com o
diretório uma pasta mais fundo, o mesmo GET dá 404 **por caminho errado** e a URL real responde
200 sem autenticação. A régua certa é o **invariante**: `path.relative(raizServida, arquivo)`
começa com `..`. Não há como satisfazê-lo por acidente — qualquer diretório dentro da raiz
reprova, em qualquer profundidade.

É a terceira etapa seguida com a mesma forma: na 29 foi fixture simétrica, na 31 foram exemplos
que só separavam por comprimento, aqui foi uma URL montada pelo nome do arquivo em vez do
caminho. **O padrão que fica: quando o teste monta a entrada a partir de um pedaço do estado em
vez do estado inteiro, ele mede o pedaço.**

## Próxima tarefa detalhada

**Plugar as outras cinco telas** — é o item de maior valor por unidade de trabalho, porque todo o
custo já foi pago: backend testado, componente genérico pronto e contrato congelado.

**O que ela consome, já pronto e sem precisar reabrir:**

```jsx
import AnexosDocumento from './AnexosDocumento';
<AnexosDocumento entidade="material" entidadeId={id} titulo="Anexos" somenteLeitura={false} />
```

- `entidade` ∈ `material` · `requisicao` · `recebimento` · `devolucao` · `item_remessa`
  (as chaves e as tabelas estão em `anexoService.ENTIDADES_ANEXO`, e o teste do serviço congela o
  mapa inteiro com `deepStrictEqual` — mexer nele passa por lá).
- `entidadeId` falsy ⇒ o componente **não** chama a API e renderiza `null`.
- O componente já resolve permissão sozinho (`useAlmoxPermissoes`): esconde o formulário de quem
  não tem `anexar_documento` e a lixeira de quem não tem `remover_anexo`.
- `data-testid` disponíveis: `anexos-documento`, `anexo-arquivo`, `anexo-enviar`, `anexo-tipo`,
  `anexo-linha-<id>`, `anexo-baixar-<id>`, `anexo-remover-<id>`, `anexo-erro`, `anexo-vazio`.

**Pontos de atenção, medidos nesta etapa:**

1. **Descubra QUANDO o `id` existe em cada tela — é o que derrubou a Task 4 no plano original.**
   Requisição em rascunho e recebimento em digitação têm o mesmo problema da inspeção pendente: a
   linha ainda não nasceu, então não há `entidade_id`. Onde isso acontecer, o bloco só pode
   aparecer depois de salvar.
2. **Monte o bloco só quando a área estiver aberta.** Em lista longa, montar por linha dispara uma
   consulta por linha — o cenário (12) de `HistoricoInspecoes.test.js` é o molde da guarda.
3. **No teste, mocke `/almoxarifado/anexos`** no `api.get` da tela, senão o mock rejeita e o
   componente cai no estado de erro dele.
4. **Se der affordance nova a alguma linha, dê a affordance INTEIRA** — cursor, `title`, chevron e
   `aria-expanded`. O fix-round 2 existiu porque a linha passou a abrir sem dizer que abria.

**A alternativa de maior valor, se o André preferir pagar risco antes de cobertura:** fechar o
furo **C42** — migrar os seis uploads legados para download autenticado e trocar os `<img src>` /
`<a href>` do client por blob. É a única coisa do módulo que hoje **expõe dado**: certificado de
fornecedor, comprovante de sucateamento e **a imagem da assinatura de quem retirou material**
abrem deslogado para quem tiver o link. O trabalho é conhecido e pequeno, mas mexe em SEIS telas
(medido na Fase 0 da etapa seguinte, 2026-09-02 — **esta frase dizia "duas telas" e estava
ERRADA**: `resolveMaterialPhotoUrl.js` e consumido por **seis** componentes —
`LotesAlmoxarifado`, `MateriaisAlmoxarifado`, `MaterialAlmoxarifadoForm`, `RequisicaoForm`,
`RequisicaoMaterialCesta` e `RequisicoesList`), no proprio `resolveMaterialPhotoUrl.js` e nos testes que
congelam essas URLs (`LotesAlmoxarifado.test.js:298`, `RequisicoesList.test.js:155,289`) — por
isso é etapa própria e não um fix de uma linha.

## Fase 2 — o que a revisão do plano pegou ANTES de executar

Três revisores frescos em paralelo, lentes distintas (contratos/código pronto; RN contra spec e
código; "este teste passaria com a feature quebrada?" + independência dos galhos).
**22 achados, 0 ruído.** Placar por gravidade: **4 travariam a execução**, **11 deixariam passar
defeito silencioso**, 7 menores.

### Os quatro que travariam

1. **`-t permissaoErro` não roda teste nenhum.** `-t` é `--testNamePattern`, não caminho: o
   comando devolve `41 skipped, 636 skipped, exit 0`. Como o Step 8 manda **PARAR** se aquilo
   passar, o executor abortaria a etapa inteira por um alarme falso — e o Step 10 usaria o mesmo
   comando como confirmação final, ficando verde mesmo se o rótulo nunca fosse escrito. Os dois
   revisores que olharam isso mediram a régua de verdade: **ela está viva** e falha nomeando
   `anexar_documento` e `remover_anexo`. Só o comando estava errado.
2. **`@testing-library/react` não está instalado neste projeto** — e a Task 3 mandava usá-lo. Não
   está no `package.json`, nem em `client/node_modules`, nem hoisted; `LoteSeletor.test.js:10-12`
   já documenta a pegadinha, e o próprio molde citado (`PlanoInspecaoModal.test.js`) usa
   `createRoot`/`act`. O erro apareceria como `Cannot find module`, **parecido com o esperado no
   Step 2**, mascarando a causa — ou o agente instalaria a lib e commitaria um `package-lock.json`
   alterado dentro de uma worktree paralela.
3. **A Task 4 plugava no componente errado, e em `somenteLeitura`.** `inspecoes_recebimento_almoxarifado`
   só ganha linha no `INSERT` de `inspectionService.js:268`, **dentro da decisão** — a fila de
   pendentes devolve `item_id`, não `inspecao.id`. O único ponto do client com o `id` é a aba
   Histórico, em `HistoricoInspecoes.js`, **não** `InspecoesAlmoxarifado.js`. Executado como
   estava, a etapa terminaria com backend completo, ação criada e **zero superfície para anexar**
   — e o roteiro do guia (`"anexar um PDF"`) seria impossível de seguir.
4. **`AnexoCreateSchema` fora do `module.exports`.** `schemas.js:736-748` exporta por lista
   fechada, não por spread. Sem a linha, o binding é `undefined` e **todo** `POST /anexos` morre
   em `undefined.safeParse` — 500 com stack, depois de o multer já ter gravado, e a causa não
   aparece na mensagem.

### O achado que mais ensina: o cenário-bandeira era cego

**A RN-03 — a regra que justifica a etapa — não pegava o erro que o design existe para evitar.**
A asserção era `GET /api/uploads/almoxarifado/<basename> → 404`. Com o diretório em
`uploads/almoxarifado/anexos/` (o "instinto óbvio" que o próprio design nomeia), aquele `GET` dá
**404 por caminho errado** — o arquivo está um nível mais fundo — enquanto
`/api/uploads/almoxarifado/anexos/<nome>` responde **200 sem autenticação nenhuma**. O controle
positivo também passaria. Treze cenários verdes, e a etapa entregando exatamente o furo que ela
existe para não criar: o **quinto teste vazio** desta base.

**A régua certa não é o `GET`, é a POSIÇÃO RELATIVA:**
`path.relative(uploadsAlmoxDir, arquivoDoAnexo).startsWith('..')`, mais o 404 nos **dois** mounts
pelo caminho real. É a mesma lição da Etapa 31 num vestido novo — *exemplo prova exemplo,
invariante prova a regra*: "o `GET` daquela URL dá 404" é um exemplo, e "o arquivo não está sob a
raiz servida" é o invariante.

### Os outros defeitos silenciosos, agrupados

- **Contrato que ninguém produziria:** o 403 congelado no design (`"Sem permissão para anexar
  documento"`) **não é o que o `requirePermission` devolve** — ele manda a mesma literal genérica
  para as 24 ações, e quem monta a frase é o client. E `uploaded_by_nome` estava no contrato do
  201 sem existir em lugar nenhum: **é o único campo que quebrava a independência dos galhos** —
  a Task 3 renderizaria `undefined` e nem a Task 5 pegaria, porque a integração é 100% servidor.
  Resolvido subindo a coluna para o tronco, **denormalizada** (`usuarios` é tabela CORE e não
  existe no harness; precedente em `requisitionCreateService.js:31`).
- **Testes que não distinguiam:** o mapa de entidades passava com as chaves todas apontando para
  `materiais_almoxarifado`; a listagem passava com o `WHERE` inteiro ignorado; a RN-05 prometia
  "o arquivo sobrevive no disco" e **nenhum** cenário media disco, então um `fs.unlinkSync` "de
  limpeza" implementaria em silêncio a alternativa que o D5 descartou; e o ramo do Zod do
  `limparUploadOrfaoEm` não tinha cenário nenhum.
- **Caixa alta que não é estilo:** `acao: 'anexar'` minúsculo **escapa da varredura** de
  `auditLabels.api.test.js:60-61` (`acao: '\K[A-Z_]+`), então o teste que existe para impedir
  verbo sem rótulo ficaria verde e a tela de auditoria mostraria `anexar` cru ao lado de
  `Criação`. Com `ANEXAR`/`REMOVER_ANEXO`, aquele teste passa a exigir o rótulo sozinho — o mesmo
  mecanismo grátis que o Step 8 explora no `permissaoErro`.
- **`e.response?.data?.error` não funciona com `responseType: 'blob'`** — o axios entrega o corpo
  do erro como Blob, e a base já pagou por isso uma vez (`RelatoriosAlmoxarifado.js:325-333`).
- **Duas das três sabotagens não provavam o que prometiam:** a do `destination` derruba a RN-03
  numa âncora anterior (o diretório fica vazio), e a do nome de tabela usava uma tabela
  **inexistente**, provando só que o teste pega erro de digitação.

### E uma coisa que os três confirmaram, e que sustenta a etapa

A premissa está de pé: varredura independente achou **uma única** ocorrência de
`anexos_documento_almoxarifado` em `server/` — o `CREATE TABLE` — e **nenhuma** referência a anexo
de almoxarifado no client. As seis tabelas do mapa existem com o nome exato; nenhum
`express.static` do repositório serve `PERSISTENT_DATA_DIR/uploads` inteiro, então o diretório
irmão é defesa válida; `Buffer.from(res.body)` funciona para PDF no supertest **e** estoura se a
rota devolver JSON; e a armadilha do `role === 'admin'` no harness estava medida corretamente.
