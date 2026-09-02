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
  — proibição já escrita em `almoxarifado.js:3695` e em `uploadCleanup.js`.
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
| `server/services/almoxarifado/schema.js` **(modificar)** | 5 colunas novas por `safeAlter` + índice | 1 |
| `server/services/almoxarifado/permissions.js` **(modificar)** | `anexar_documento`, `remover_anexo` | 1 |
| `server/services/almoxarifado/auditLabels.js` **(modificar)** | rótulo da entidade `anexo` | 1 |
| `client/src/utils/permissaoErro.js` **(modificar)** | rótulo das duas ações novas | 1 |
| `server/tests/api/anexoService.api.test.js` **(criar)** | RN-01, RN-02, RN-05 pelo serviço | 1 |
| `server/routes/almoxarifado.js` **(modificar, `:187` e `:3695`)** | criar o diretório e passá-lo adiante | 2 |
| `server/routes/almoxarifado/extended.js` **(modificar)** | multer + 4 rotas | 2 |
| `server/services/almoxarifado/schemas.js` **(modificar)** | `AnexoCreateSchema` | 2 |
| `server/tests/helpers/testApp.js` **(modificar, `:80`)** | expor `uploadsAnexosDir` | 2 |
| `server/tests/api/anexoDocumento.api.test.js` **(criar)** | RN-03, RN-04, RN-06 pela rota | 2 |
| `client/src/components/almoxarifado/AnexosDocumento.js` **(criar)** | componente genérico | 3 |
| `client/src/components/almoxarifado/AnexosDocumento.test.js` **(criar)** | 6 cenários | 3 |
| `client/src/components/almoxarifado/InspecoesAlmoxarifado.js` **(modificar)** | plug da feature 09 | 4 |
| `server/tests/api/anexoDocumento.api.test.js` **(modificar)** | fluxo cruzando, pela rota | 5 |

## Sort topológico

| Task | Tipo | Depende de | Por quê |
|---|---|---|---|
| 1 — schema, serviço e permissões | **tronco** | — | mexe em `ACAO_PERFIS` e no schema: regra compartilhada |
| 2 — fiação e rotas | **galho** | 1 | consome o serviço já congelado |
| 3 — componente `AnexosDocumento` | **galho** | 1 (só o contrato) | client contra contrato HTTP congelado — mock legítimo, é a fronteira |
| 4 — plug na inspeção | sequencial | 3 | importa o componente da Task 3 |
| 5 — integração + fechamento | sequencial | 2 e 4 | cruza os galhos |

**Paralelismo real: 2 galhos** (Tasks 2 e 3), em **worktrees isoladas** — a Task 2 roda a suíte de
servidor contra SQLite e a Task 3 roda a do client; árvores separadas evitam que um `git add` de
um pegue arquivo do outro. Scratchpad com nome único por agente (`msg-rotas.txt`,
`msg-componente.txt`) — na Etapa 25 dois executores usaram `msg.txt` e um sobrescreveu o do outro.

---

### Task 1: Schema, serviço e as duas ações de perfil  **(tronco)**

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

- [ ] **Step 1: Escrever o teste que falha**

Crie `server/tests/api/anexoService.api.test.js` no molde de runner desta base (copie o cabeçalho
de `server/tests/api/toolCalibracao.api.test.js` — `assert`, contador, `process.exit`):

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
    assert.strictEqual(anexo.arquivo_path, undefined, 'arquivo_path NAO sai do servico');

    const aud = await dbGet(ctx.db,
      `SELECT * FROM auditoria_log_almoxarifado WHERE entidade = 'anexo' ORDER BY id DESC`);
    assert.ok(aud, 'anexar tem de auditar');
    assert.strictEqual(aud.acao, 'anexar');
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

// As oito entidades do mapa apontam para tabela que EXISTE — a regua que pega nome imaginado
test('as oito entidades do mapa apontam para tabelas que existem no schema', async () => {
  const ctx = await createTestApp();
  try {
    const chaves = Object.keys(anexoService.ENTIDADES_ANEXO);
    assert.strictEqual(chaves.length, 8, 'o mapa tem oito entidades');
    for (const chave of chaves) {
      const tabela = anexoService.ENTIDADES_ANEXO[chave];
      const existe = await dbGet(ctx.db,
        `SELECT name FROM sqlite_master WHERE type='table' AND name = ?`, [tabela]);
      assert.ok(existe, `entidade ${chave} aponta para tabela inexistente: ${tabela}`);
    }
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

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd server && node tests/api/anexoService.api.test.js`
Expected: FAIL — `Cannot find module '../../services/almoxarifado/anexoService'`.

- [ ] **Step 3: As colunas novas e o índice**

Em `server/services/almoxarifado/schema.js`, **logo após** o `CREATE TABLE IF NOT EXISTS
anexos_documento_almoxarifado (...)` que termina em `:1700`:

```js
  // Etapa 32: a tabela nasceu na Etapa 0 e ficou ORFA ate aqui — nenhum INSERT, nenhum SELECT,
  // nenhum indice. As colunas abaixo entram por safeAlter (e no-op em banco novo, porque o
  // CREATE acima ja e o formato final para quem instala do zero; em banco existente elas
  // faltam). `ativo` default 1 para que a linha legada — se algum dia houver — nasca visivel.
  for (const col of [
    'descricao TEXT',
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
`descricao TEXT`, `tamanho_bytes INTEGER`, `mime_type TEXT`, `ativo INTEGER DEFAULT 1`,
`deleted_by INTEGER`, `deleted_at DATETIME`.

- [ ] **Step 4: O serviço**

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
  lote: 'lotes_almoxarifado',
  remessa_terceiro: 'remessas_terceiro_almoxarifado',
  item_remessa: 'itens_remessa_terceiro_almoxarifado',
};

const CAMPOS_PUBLICOS = `id, entidade, entidade_id, tipo, descricao, nome_original,
  tamanho_bytes, mime_type, uploaded_by, created_at`;

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
    (entidade, entidade_id, tipo, arquivo_path, nome_original, tamanho_bytes, mime_type, uploaded_by, descricao, ativo)
    VALUES (?,?,?,?,?,?,?,?,?,1)`, [
    entidade, paiId, tipo, arquivo.filename, arquivo.originalname || arquivo.filename,
    arquivo.size ?? null, arquivo.mimetype || null, user?.id ?? null, descricao || null,
  ]);

  const linha = await dbGet(db,
    `SELECT ${CAMPOS_PUBLICOS} FROM anexos_documento_almoxarifado WHERE id = ?`, [r.lastID]);

  // Auditoria POS-ESCRITA e best-effort: a mesma RN-02 da Etapa 19 — derrubar a resposta por
  // causa do log desfaria nada e devolveria erro para um ato que deu certo.
  try {
    await audit.registrarAuditoria(db, {
      entidade: 'anexo', entidade_id: r.lastID, acao: 'anexar',
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
      entidade: 'anexo', entidade_id: n, acao: 'remover',
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

- [ ] **Step 5: Rodar e ver passar**

Run: `cd server && node tests/api/anexoService.api.test.js`
Expected: `6 passed, 0 failed`.

- [ ] **Step 6: Controle positivo — provar que os testes sabem falhar**

Sabote **uma coisa por vez** e confirme o vermelho, revertendo depois de cada uma:

1. Troque `if (!tabela) throw erro(400, ...)` por `if (!tabela) return 'materiais_almoxarifado'`.
   Esperado: **falha** o cenário da entidade fora do mapa.
2. Troque `WHERE ... AND ativo = 1` de `listarAnexos` por `WHERE entidade = ? AND entidade_id = ?`.
   Esperado: **falha** o cenário do soft delete (`removido nao aparece na lista`).
3. No mapa, troque `recebimento: 'recebimentos_material_almoxarifado'` por
   `recebimento: 'recebimentos_almoxarifado'` (o nome que a intuição erra).
   Esperado: **falha** o cenário das oito entidades, nomeando a chave.

Se alguma sabotagem **não** derrubar teste nenhum, o teste correspondente é vazio — conserte-o
antes de seguir. Registre no plano o que cada sabotagem derrubou.

- [ ] **Step 7: As duas ações de perfil**

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

- [ ] **Step 8: Medir o vermelho do client ANTES de escrever o rótulo (RN-07)**

Este passo **é** o controle positivo da correção que a Etapa 30 fez em `permissaoErro.test.js` —
ela trocou a régua por **presença no mapa `ACAO_PERFIS` importado do servidor**. Se aquela
correção está viva, as duas ações novas derrubam o teste **sozinhas**, sem ninguém escrever
asserção nova.

Run: `cd client && CI=true npx react-scripts test --watchAll=false -t permissaoErro`
Expected: **FAIL**, nomeando `anexar_documento` e `remover_anexo` como ausentes do mapa.

> Se **passar**, pare: a régua da Etapa 30 não está viva e o buraco de rótulo voltaria pela
> quinta vez. Registre o achado no plano antes de continuar.

- [ ] **Step 9: Os rótulos**

Em `client/src/utils/permissaoErro.js`, no mapa `ACOES`, depois de `ajustar_material_cliente`:

```js
  // Etapa 32: as duas acoes de anexo. Escritas JUNTO com ACAO_PERFIS de proposito — o vermelho
  // do teste desta pasta, medido antes deste commit, e a prova de que a regua da Etapa 30 (a
  // lista vem de ACAO_PERFIS do servidor, e o criterio e PRESENCA) esta viva.
  anexar_documento: 'anexar documento',
  remover_anexo: 'remover anexo',
```

E em `server/services/almoxarifado/auditLabels.js`, acrescente a entidade `anexo` ao mapa de
rótulos, no molde das entradas existentes (`categoria: 'Categoria'` foi a da Etapa 26):
`anexo: 'Anexo'`.

- [ ] **Step 10: Rodar tudo o que a Task 1 toca**

```bash
cd server && node tests/api/anexoService.api.test.js && npm run test:api
cd client && CI=true npx react-scripts test --watchAll=false -t permissaoErro
```
Expected: serviço `6 passed`; `test:api` **166/166 arquivos** (165 → 166); `permissaoErro` verde.

- [ ] **Step 11: Commit**

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
- Modify: `server/routes/almoxarifado.js` (`:187` bloco do diretório; `:3695` chamada da extended)
- Modify: `server/routes/almoxarifado/extended.js` (assinatura `:112` + rotas novas)
- Modify: `server/services/almoxarifado/schemas.js`
- Modify: `server/tests/helpers/testApp.js` (`:80`)
- Create: `server/tests/api/anexoDocumento.api.test.js`

**Interfaces:**
- Consumes: tudo o que a Task 1 exportou em `anexoService` (assinaturas acima, verbatim);
  `limparUploadOrfaoEm(req, dir)` de `uploadCleanup.js`; `handleError(res, err)` e
  `formatZodError` já existentes na extended.
- Produces: as quatro rotas do design, e `ctx.uploadsAnexosDir` no harness (a Task 5 usa as duas
  coisas).

- [ ] **Step 1: Escrever o teste que falha**

Crie `server/tests/api/anexoDocumento.api.test.js` (mesmo molde de runner; use `supertest`):

```js
const assert = require('assert');
const fs = require('fs');
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

    // O mount estatico existe e serve uploadsAlmoxDir — o anexo mora no diretorio IRMAO
    const estatico = await request(ctx.app).get(`/api/uploads/almoxarifado/${nomeNoDisco}`);
    assert.strictEqual(estatico.status, 404, 'anexo NAO pode ser publico');

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

test('GET /anexos lista so os ativos da entidade pedida', async () => {
  const ctx = await createTestApp();
  try {
    const materialId = await comMaterial(ctx);
    for (const nome of ['a.pdf', 'b.pdf']) {
      await request(ctx.app).post('/api/almoxarifado/anexos')
        .field('entidade', 'material').field('entidade_id', String(materialId)).field('tipo', 'FICHA')
        .attach('arquivo', PDF, nome);
    }
    const res = await request(ctx.app)
      .get(`/api/almoxarifado/anexos?entidade=material&entidade_id=${materialId}`);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.length, 2);
    assert.strictEqual(res.body[0].arquivo_path, undefined);
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

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd server && node tests/api/anexoDocumento.api.test.js`
Expected: FAIL — `ctx.uploadsAnexosDir` é `undefined` e as rotas respondem 404.

- [ ] **Step 3: O diretório e a fiação**

Em `server/routes/almoxarifado.js`, logo depois do bloco de `uploadsAlmoxDir` (`:187-188`):

```js
  // Etapa 32 (D1): os anexos vao para um diretorio IRMAO, nao para uma subpasta de
  // uploadsAlmoxDir. `express.static(root)` serve as subpastas de root tambem — guardar em
  // uploads/almoxarifado/anexos deixaria todo anexo publico pelos mounts das linhas ~229-230,
  // que nao passam por auth nenhuma. Criado explicitamente porque o multer NAO cria diretorio
  // (D3 da Etapa 9b: o primeiro upload numa subpasta inexistente da ENOENT -> 500).
  const uploadsAnexosDir = path.join(PERSISTENT_DATA_DIR, 'uploads', 'almoxarifado-anexos');
  if (!fs.existsSync(uploadsAnexosDir)) fs.mkdirSync(uploadsAnexosDir, { recursive: true });
```

E na chamada da extended (`:3695` e adiante), passe o novo diretório como **5º argumento**:

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

- [ ] **Step 4: O Zod**

Em `server/services/almoxarifado/schemas.js`, no molde dos schemas existentes, e exportado:

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

- [ ] **Step 5: As quatro rotas**

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
      // Sem este wrapper eles viram 500 com stack — e o `MulterError` de tamanho ainda deixa o
      // arquivo parcial em disco.
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

Acrescente `AnexoCreateSchema` à desestruturação do `require` de `schemas` (`extended.js:19`) e
`const anexoService = require('../../services/almoxarifado/anexoService');` junto dos outros
serviços.

- [ ] **Step 6: Rodar e ver passar**

Run: `cd server && node tests/api/anexoDocumento.api.test.js`
Expected: `12 passed, 0 failed`.

- [ ] **Step 7: Controle positivo — as três sabotagens que importam**

1. Troque `destination: (req, file, cb) => cb(null, uploadsAnexosDir)` por `uploadsAlmoxDir`.
   Esperado: **falha a RN-03** (o anexo passa a sair 200 no estático). Esta é a sabotagem que
   prova que a etapa inteira não é decorativa.
2. Remova o 5º argumento da chamada em `routes/almoxarifado.js` (a fiação).
   Esperado: **falham todos os cenários de upload** — é o modo de falha da Etapa 25, e o teste
   entra **pela rota** justamente para pegá-lo.
3. Remova o `limparUploadOrfaoEm` do catch do POST.
   Esperado: **falha** o cenário do `entidade_id` inexistente (contagem de arquivos).

- [ ] **Step 8: Suíte de servidor inteira**

```bash
cd server && npm run test:api && npm run test:almoxarifado
```
Expected: `test:api` **167/167 arquivos**; `test:almoxarifado` `42 passou, 0 falhou`.

- [ ] **Step 9: Commit**

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
  porque a fronteira HTTP existe de verdade. `jest.mock('../../services/api')` no molde de
  `PlanoInspecaoModal.test.js`.
- Produces, e a Task 4 depende disto:
  `<AnexosDocumento entidade="inspecao" entidadeId={id} titulo="Anexos" somenteLeitura={false} />`

- [ ] **Step 1: Escrever o teste que falha**

Crie `client/src/components/almoxarifado/AnexosDocumento.test.js` com **seis** cenários, no molde
de `PlanoInspecaoModal.test.js` (mesmos imports de `@testing-library/react` e `jest.mock` de
`../../services/api` e de `react-toastify`):

1. **lista o que o GET devolveu** — dois anexos, os dois nomes na tela.
2. **`entidadeId` ausente não chama a API** — `expect(api.get).not.toHaveBeenCalled()`; sem isso o
   componente dispara `GET /anexos?entidade=inspecao&entidade_id=undefined` ao abrir o formulário
   de uma inspeção nova.
3. **upload manda `FormData` com os quatro campos** — inspecione o `FormData` passado a
   `api.post`: `entidade`, `entidade_id`, `tipo`, `arquivo`.
4. **erro do servidor aparece com a mensagem do servidor** — `api.post` rejeitando com
   `{ response: { data: { error: 'Anexo deve ser PDF ou imagem' } } }` → o texto na tela é esse,
   não um genérico.
5. **download usa `responseType: 'blob'`** — `expect(api.get).toHaveBeenCalledWith(
   '/almoxarifado/anexos/5/arquivo', { responseType: 'blob' })`. É o cenário que impede alguém de
   "simplificar" para `<a href>`, que devolveria 401 porque a rota é autenticada.
6. **`somenteLeitura` esconde upload e remoção** — nem o input de arquivo nem o botão de remover.

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd client && CI=true npx react-scripts test --watchAll=false AnexosDocumento`
Expected: FAIL — `Cannot find module './AnexosDocumento'`.

- [ ] **Step 3: Implementar o componente**

`client/src/components/almoxarifado/AnexosDocumento.js`. Pontos que o código **tem** de respeitar,
e o porquê de cada um (escreva-os como comentário no topo, no estilo desta pasta):

- **O download é `blob`, não link.** A rota é autenticada; `<a href>` e `<img src>` saem sem o
  `Authorization` do interceptor do axios e tomam 401. O fluxo é
  `api.get(url, { responseType: 'blob' })` → `URL.createObjectURL` → `<a download>` sintético →
  **`URL.revokeObjectURL` no fim** (sem revogar, cada download vaza o blob até o reload).
- **`FormData` sem `Content-Type` manual** — o interceptor de `services/api.js` já remove o
  header para o browser pôr o `boundary`. Definir `multipart/form-data` à mão quebra o upload.
- **Guarda de `entidadeId` falsy antes de qualquer `useEffect`** — cenário 2.
- **A mensagem de erro vem do servidor** (`e.response?.data?.error`), com fallback genérico. As
  literais desta etapa são contrato; reescrevê-las no client faria a tela e o servidor divergirem.
- **Sem cache de módulo na listagem** — mesma razão do `useCategoriasMaterial` da Etapa 26: com
  cache, o anexo recém-enviado não apareceria até um reload, que é o "a tela mente" que a etapa
  corrige.

- [ ] **Step 4: Rodar e ver passar**

Run: `cd client && CI=true npx react-scripts test --watchAll=false AnexosDocumento`
Expected: 6 testes verdes.

- [ ] **Step 5: Controle positivo**

Troque o `responseType: 'blob'` por um `<a href>` direto e confirme que o cenário 5 **falha**;
remova a guarda de `entidadeId` e confirme que o cenário 2 **falha**. Reverta as duas.

- [ ] **Step 6: Commit**

```bash
git add client/src/components/almoxarifado/AnexosDocumento.js \
        client/src/components/almoxarifado/AnexosDocumento.test.js
git commit -F msg-componente.txt
```

---

### Task 4: Plug no formulário de inspeção (feature 09)

**Files:**
- Modify: `client/src/components/almoxarifado/InspecoesAlmoxarifado.js`
- Modify: `client/src/components/almoxarifado/InspecoesAlmoxarifado.test.js`

**Interfaces:**
- Consumes: `AnexosDocumento` da Task 3, com as props exatas ali declaradas.

- [ ] **Step 1: Teste que falha**

Em `InspecoesAlmoxarifado.test.js`, dois cenários novos:

1. **inspeção já decidida (histórico) mostra os anexos em `somenteLeitura`** — o bloco aparece e
   não tem input de arquivo.
2. **inspeção pendente ainda NÃO decidida não renderiza o bloco** — porque `entidade_id` só existe
   depois de a linha de inspeção existir. Anexar antes de decidir penduraria o arquivo num id que
   ainda não há, e o 404 `"Registro não encontrado para anexar"` do servidor apareceria como erro
   ao usuário no meio do fluxo.

- [ ] **Step 2: Rodar e ver falhar** — `CI=true npx react-scripts test --watchAll=false InspecoesAlmoxarifado`

- [ ] **Step 3: Plugar**

`import AnexosDocumento from './AnexosDocumento';` e renderizar o bloco onde a inspeção já tem
`id`, com `entidade="inspecao"`. Comentário no ponto do plug explicando a decisão do cenário 2.

- [ ] **Step 4: Rodar e ver passar**

- [ ] **Step 5: Commit** (`msg-plug.txt`)

---

### Task 5: Integração cruzando os galhos, e fechamento

**Files:**
- Modify: `server/tests/api/anexoDocumento.api.test.js`

- [ ] **Step 1: O fluxo inteiro, pela rota**

Um cenário só, que percorre **anexar → listar → baixar conferindo o conteúdo → remover → listar
vazio → baixar de novo (404)**, com dois perfis diferentes: quem anexa é `QUALIDADE`, quem remove
é `ALMOXARIFE`. Cruza a Task 1 (serviço), a Task 2 (rotas e fiação) e as duas ações da Task 1.

- [ ] **Step 2: A suíte inteira, serial**

```bash
cd server && npm run test:api
cd server && npm run test:almoxarifado
cd server && npm run test:validation && npm run test:safealter && npm run test:sqlite
cd client && CI=true npx react-scripts test --watchAll=false
cd client && CI=true npx react-scripts build
```

- [ ] **Step 3: Fase 5 — revisão adversarial**

Revisores frescos em paralelo, lentes distintas: (a) correção das RN-01..RN-07; (b)
autorização/perfil — inclusive *"o `visualizar` no download é largo demais? quem vê o almoxarifado
vê o certificado de qualquer entidade"*; (c) *"este teste passaria com a feature quebrada?"*, com
foco na RN-03 e no controle positivo dela. Achado só vale com cenário concreto e reproduzido.

- [ ] **Step 4: Fechamento**

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

## Próxima tarefa detalhada (para quem retomar)

**Plugar as outras cinco telas** — material (feature 01), requisição (04), recebimento (08),
devolução (12) e item de remessa (14). O componente já é genérico e o contrato está congelado
acima; cada plug é `<AnexosDocumento entidade="<chave>" entidadeId={id} />` mais dois cenários de
teste. **Ponto de atenção:** em cada tela, medir **quando o `id` existe** — foi a decisão do
cenário 2 da Task 4, e requisição em rascunho e recebimento em digitação têm o mesmo problema.

**A alternativa de maior valor**, se o André preferir pagar risco antes de cobertura: **fechar o
furo do estático legado** (letra C acima), que é o único item desta etapa que deixa dado exposto.
