# Etapa 41 — A cotação ganha itens e vira pedido — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** a cotação de compra passa a ter linhas (material do catálogo, quantidade, preço) com total somado; um clique em "Gerar pedido" na lista cria o pedido de compra no servidor a partir da cotação (número `PC-…`, itens e preços copiados), grava o vínculo e leva o comprador para a edição do pedido; a mesma cotação não gera dois pedidos; excluir cotação com itens funciona e excluir cotação convertida é recusado com frase.

**Architecture:** tronco (T1) cria a tabela `itens_cotacao` em `schema.js` (chega ao harness por `initSchema`), o `CotacaoItemSchema` com `itens` **opcional** em `CotacaoSchema`, exporta `resolverItens` do serviço de pedido e acrescenta `cotacoes.pedido_id` (core: `ALTER` em `index.js` + stub). T2 (um executor, servidor) põe itens, total derivado, lixeira própria e a conversão em `cotacaoService.js` e nas rotas. T3 (tela da cotação) e T4 (aba Cotações) são galhos de cliente contra o contrato congelado, em worktrees. T5 cruza pela rota e pelo serviço; T6 fecha pela skill `fechar-etapa`.

**Tech Stack:** Express + `sqlite3` (`dbRun`/`dbGet`/`dbAll` de `services/almoxarifado/db.js`), `zod@4` (`z.looseObject`, `validate()`), supertest + runner próprio; React 18 CRA, `react-router-dom` v6, axios (`services/api`), jest sem RTL.

**Spec:** `docs/superpowers/specs/2026-09-22-crm-etapa41-cotacao-itens-pedido-design.md` (D1–D12, RN-F01…RN-F14, contratos §5). **Medições:** `.superpowers/sdd/etapa41-fase0-servidor.md`, `etapa41-fase0-cliente.md` (2026-09-22, contra `820860a`). **BASE:** `7d9e7d7`.

## Global Constraints

- **Linhas citadas** medidas em `820860a`; T1 desloca `schemas.js`, `pedidoCompraService.js` (só `module.exports`), `schema.js`, `index.js`, `testApp.js`; T2 desloca `routes/compras.js` e reescreve `cotacaoService.js`. **Reconte com `grep -n`** antes de editar.
- **`z.looseObject`**, literal **na construção E no refinamento**, **sem coerção** (`'2'` é recusado; a tela usa `Number()`).
- **Literais próprias da cotação** (`… do item da cotação …`) — nunca as do pedido; `'Material não encontrado'` é de `resolverItens` e tem **um** dono.
- **`itens` é opcional** (D2): os 4 cenários que criam cotação só com `{ numero, fornecedor_id }` continuam iguais — (1) de `comprasCotacaoRotas`, (j) de `comprasSchemasFornecedorCotacao`, (A)/(B) de `comprasFornecedorCotacaoIntegracao`.
- **`valor_total`: duas regras** (D3) — com itens, derivado e o payload ignorado; sem itens, o do payload. Tela e servidor espelham.
- **`itens_cotacao` em `schema.js`** (chega ao harness sem stub); **`cotacoes.pedido_id` em `index.js` + stub `testApp.js` + `SELECT_LINHA`** (três lugares, D6).
- **`DELETE /api/compras/cotacoes/:id` registrado ANTES do genérico** (`app.delete('/api/compras/:tipo/:id')`, `:367`) — posição é comportamento.
- **Gate:** `authenticateToken, checkModulePermission('compras')` em toda rota nova. Nenhum `requirePermission`.
- **Client:** `data-testid` prefixados `cotacao-`; ids de fixture **770/771/772** (cotações), **7701/7702** (itens), **912** (material), **650** (pedido gerado) — fora do conjunto ocupado; erro de form em `role="alert"`, erro de ação de linha em `toast` (mesmo canal da lixeira); as duas telas novas já estão em `reais` dos Proxies das suas suítes.
- **Commits:** português, corpo sem acento, um por task, `git add` explícito, mensagem em `…\scratchpad\msg-e41-t<N>.txt`, `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. Nada de push pelos executores.
- **Sabotagem:** `md5sum` antes/depois/pós-restauro, âncora `grep -cF` = 1, restauro por cópia do scratchpad, nunca `git checkout --`; `python3` não executa; **heredoc com acento quebra no Bash desta máquina — usar o Write tool**; LF (CR=0 por `perl -ne '$c++ if /\r/'`).
- **Teste verde de primeira é suspeito:** controle positivo nomeado em cada task.

---

## ⚠️ O modo de falha desta etapa: o verde do harness com FK desligada

Produção liga `PRAGMA foreign_keys = ON` (`sqliteConcurrency.js:50`); o harness roda com FK **desligada**
(`testApp.js:97`). Com `itens_cotacao.cotacao_id REFERENCES cotacoes(id)`, um `DELETE FROM cotacoes`
que **não** apague os filhos antes **passa no harness** (deixa órfãos) e **falha com 500 em produção**.
Nenhuma asserção de status pega isso. Por isso o cenário da lixeira **conta `itens_cotacao` órfãos**, e a
sabotagem obrigatória é remover o `DELETE` dos filhos e ver esse `COUNT` cair. Mesma lógica para o
vínculo: `cotacoes.pedido_id REFERENCES pedidos_compra(id)` não dispara no harness quando o pedido é
apagado — a RN-F12 declara que o `pedido_id` **fica**, e o cenário afirma isso para ninguém "consertar".

### Três regras herdadas

1. Ao medir ausência, teste a régua contra um caso que existe.
2. Leia **qual** asserção caiu na sabotagem, não o placar.
3. Marque o plano ao terminar cada task (hash, divergências).

---

## Regras de negócio — `RN-F01…RN-F14` e quem prova cada uma

| RN | Enunciado curto | Prova |
|---|---|---|
| RN-F01 | item: `material_id` int > 0 do catálogo, `quantidade` > 0, `valor_unitario` ≥ 0 opcional; literais próprias; material inexistente → 400 sem gravar | T1 (r), T2-itens (4) |
| RN-F02 | `itens` opcional; sem itens, `valor_total` do payload | T1 (p), T2-itens (3) |
| RN-F03 | com itens, `valor_total` = Σ e o do payload é ignorado | T2-itens (1)(2), T3 (i)(j) |
| RN-F04 | `GET /:id`/`POST`/`PUT` devolvem `itens[]` com `codigo/descricao/unidade`; lista devolve `pedido_id`/`pedido_numero`, não itens | T2-itens (6), T2-gerar (1), T4 (j) |
| RN-F05 | `PUT` substitui as linhas; `PUT` sem `itens` apaga | T2-itens (5), T3 (m) |
| RN-F06 | `DELETE /cotacoes/:id` próprio: 409 se convertida; senão apaga itens + cotação | T2-itens (7)(8)(10), T2-gerar (7) |
| RN-F07 | `POST …/gerar-pedido` → `criarPedido`, 201 com o pedido, `pedido_id` e `status='aprovado'` gravados | T2-gerar (1)(8) |
| RN-F08 | sem itens → 400 | T2-gerar (3) |
| RN-F09 | `rejeitado`/`cancelado` → 400 | T2-gerar (4) |
| RN-F10 | segunda conversão → 409 sem pedido novo | T2-gerar (2), T5 |
| RN-F11 | fornecedor inativo → 400; apagado → 400 | T2-gerar (5) |
| RN-F12 | o pedido gerado é normal (lista, aux do recebimento, PUT, DELETE); `pedido_id` fica | T5 |
| RN-F13 | tela: busca, linhas, total derivado, campo travado com itens, payload `itens` + `Number()` | T3 (i)–(n) |
| RN-F14 | aba: coluna Pedido, botão condicional, POST, toast, navigate, erro no toast, export | T4 (j)(k)(l) |

---

## Contratos de API congelados

Idênticos ao design §5. Nomes exatos que os galhos consomem:

**T1 exporta** (`schemas.js`): `CotacaoItemSchema`, `ITENS_COTACAO_INVALIDOS`, `MATERIAL_ITEM_COTACAO_OBRIGATORIO`,
`QTD_ITEM_COTACAO_INVALIDA`, `VALOR_UNITARIO_ITEM_COTACAO_NEGATIVO`; e `CotacaoSchema` ganha `itens`.
(`pedidoCompraService.js`): `resolverItens`.

**T2 exporta** (`cotacaoService.js`): `excluirCotacao(db, id)`, `gerarPedidoDaCotacao(db, id, user)`,
`COTACAO_SEM_ITENS`, `cotacaoStatusNaoGera(status)`, `FORNECEDOR_INATIVO_CONVERSAO`,
`cotacaoJaGerouPedido(numero, pc)`, `cotacaoJaGerouPedidoExclusao(numero, pc)`, `COTACAO_EXCLUIDA = 'Cotação excluída com sucesso'`.

**Rotas** (T2): `POST /api/compras/cotacoes/:id/gerar-pedido` → `201` pedido (`obterPedido`: `{ id, numero, fornecedor_id, fornecedor_nome, valor_total, status, itens[…] }`); `DELETE /api/compras/cotacoes/:id` → `200 { message }`. `GET /api/compras/cotacoes` → linhas com `pedido_id`, `pedido_numero`.

**Client** (T3/T4): design §5.5 verbatim.

---

## Estrutura de arquivos

| Arquivo | Task | Responsabilidade |
|---|---|---|
| `server/services/almoxarifado/schema.js` (após `:1339`) | T1 | `itens_cotacao` + índice |
| `server/index.js` (após `:19256`) | T1 | `ALTER TABLE cotacoes ADD COLUMN pedido_id` |
| `server/tests/helpers/testApp.js` (`:117-127`) | T1 | `pedido_id INTEGER` no stub |
| `server/services/compras/schemas.js` (`:203-219`, exports `:236-247`, comentário `:164-167`) | T1 | `CotacaoItemSchema`, `itens`, literais; reescrever o comentário |
| `server/services/compras/pedidoCompraService.js` (`module.exports :1013-1038`) | T1 | exportar `resolverItens` |
| `server/tests/api/comprasSchemasFornecedorCotacao.api.test.js` | T1 | (p)–(s) |
| `server/services/compras/cotacaoService.js` | T2 | itens, total, `excluirCotacao`, `gerarPedidoDaCotacao` |
| `server/routes/compras.js` (`:316-343` lista; `:345-364` bloco; `:367` genérico) | T2 | `LEFT JOIN` na lista; `DELETE` próprio antes do genérico; `POST …/gerar-pedido` |
| `server/tests/api/comprasCotacaoItens.api.test.js`, `comprasCotacaoGerarPedido.api.test.js` | T2 | 10 + 8 |
| `client/src/components/compras/CotacaoForm.js` + `.test.js` | T3 | itens, total (caminho C), +6 cenários |
| `client/src/components/Compras.js` (`:22`, `:268-278`, `:423-481`) + `Compras.test.js` | T4 | coluna Pedido, botão, `handleGerarPedido`, export, +3 cenários |
| `server/tests/api/comprasCotacaoPedidoIntegracao.api.test.js` | T5 | A4 |
| `specs/modulo-compras/README.md:70`, `22-integracoes`, mapa, guia, manual, novidades, planos | T6 | fechamento |

## Sort topológico

| Task | Tipo | Depende | Toca |
|---|---|---|---|
| T1 tabela + schema + exports + coluna | **tronco** | — | 6 arquivos acima |
| T2 servidor (itens, lixeira, conversão) | **tronco** (um executor; worktree `wt-e41-t2`) | T1 | `cotacaoService.js`, `routes/compras.js`, 2 suítes |
| T3 cliente-form | **galho** (`wt-e41-t3`) | T1 (contrato) | `CotacaoForm.*` |
| T4 cliente-aba | **galho** (`wt-e41-t4`) | T1 (contrato) | `Compras.js`, `Compras.test.js` |
| T5 integração | tronco | T2 | teste novo |
| T6 fechamento | tronco | T5 | docs |

T2, T3, T4 rodam **em paralelo** (três worktrees a partir do commit da T1, junction de `node_modules` —
provado na 40; `rmdir` da junction **antes** de `git worktree remove`). Arquivos disjuntos → merge limpo
esperado; ordem de cherry-pick T2 → T3 → T4, suíte inteira depois de cada um. **Conflito previsto:**
nenhum de código; o **plano** (blocos FECHADA) pode conflitar por adjacência — resolver mantendo os três.

---

### Task 1: `itens_cotacao`, `CotacaoItemSchema`, `resolverItens` exportada e `cotacoes.pedido_id` **(tronco)**

**Files:**
- Modify: `server/services/almoxarifado/schema.js` (após `:1339`), `server/index.js` (após `:19256`), `server/tests/helpers/testApp.js` (`:117-127`), `server/services/compras/schemas.js` (`:164-167`, `:203-219`, `:236-247`), `server/services/compras/pedidoCompraService.js` (`:1013-1038`)
- Test: `server/tests/api/comprasSchemasFornecedorCotacao.api.test.js` (+4 cenários, no fim, antes do `console.log` final)

**Interfaces:**
- Consumes: `dataIsoOpcional`, `textoOpcional`, `CotacaoSchema` existentes; `resolverItens` (`pedidoCompraService.js:290-309`).
- Produces: os exports listados em "Contratos"; a tabela `itens_cotacao` em todo `createTestApp()`; a coluna `pedido_id` no stub e em produção.

- [ ] **Step 1: escrever (p)–(s) e ver vermelho** — em `comprasSchemasFornecedorCotacao.api.test.js`, após o (o):

```js
  await test('(p) RN-F02 itens ausente -> undefined; [] passa; item minimo passa com valor_unitario undefined', () => {
    assert.strictEqual(S.CotacaoSchema.safeParse({ numero: 'C', fornecedor_id: 1 }).data.itens, undefined);
    const r = S.CotacaoSchema.safeParse({ numero: 'C', fornecedor_id: 1, itens: [] });
    assert.ok(r.success, r.success ? '' : msgs(r));
    assert.deepStrictEqual(r.data.itens, []);
    const r2 = S.CotacaoSchema.safeParse({ numero: 'C', fornecedor_id: 1, itens: [{ material_id: 912, quantidade: 2 }] });
    assert.ok(r2.success, r2.success ? '' : msgs(r2));
    assert.strictEqual(r2.data.itens[0].valor_unitario, undefined);
  });
  await test('(q) itens "abc" -> ITENS_COTACAO_INVALIDOS (a armadilha 2 vale para o tipo do array)', () => {
    const r = S.CotacaoSchema.safeParse({ numero: 'C', fornecedor_id: 1, itens: 'abc' });
    assert.ok(!r.success);
    assert.strictEqual(msgs(r), `itens: ${S.ITENS_COTACAO_INVALIDOS}`);
    assert.strictEqual(S.ITENS_COTACAO_INVALIDOS, 'itens da cotação devem ser uma lista');
  });
  await test('(r) RN-F01 item: material ausente/"3"/0 -> literal; quantidade 0/"2" -> literal; valor_unitario -1 -> literal; caminho itens.0.<campo>', () => {
    for (const v of [undefined, '3', 0]) {
      const r = S.CotacaoSchema.safeParse({ numero: 'C', fornecedor_id: 1, itens: [{ material_id: v, quantidade: 1 }] });
      assert.ok(!r.success, `devia recusar material_id ${JSON.stringify(v)}`);
      assert.strictEqual(msgs(r), `itens.0.material_id: ${S.MATERIAL_ITEM_COTACAO_OBRIGATORIO}`);
    }
    for (const v of [0, '2']) {
      const r = S.CotacaoSchema.safeParse({ numero: 'C', fornecedor_id: 1, itens: [{ material_id: 912, quantidade: v }] });
      assert.strictEqual(msgs(r), `itens.0.quantidade: ${S.QTD_ITEM_COTACAO_INVALIDA}`);
    }
    const r3 = S.CotacaoSchema.safeParse({ numero: 'C', fornecedor_id: 1, itens: [{ material_id: 912, quantidade: 1, valor_unitario: -1 }] });
    assert.strictEqual(msgs(r3), `itens.0.valor_unitario: ${S.VALOR_UNITARIO_ITEM_COTACAO_NEGATIVO}`);
    // o segundo item errado aponta itens.1
    const r4 = S.CotacaoSchema.safeParse({ numero: 'C', fornecedor_id: 1, itens: [{ material_id: 912, quantidade: 1 }, { material_id: 912, quantidade: 0 }] });
    assert.strictEqual(msgs(r4), `itens.1.quantidade: ${S.QTD_ITEM_COTACAO_INVALIDA}`);
  });
  await test('(s) as literais do item da cotação são DIFERENTES das do item do pedido (um dono por frase)', () => {
    assert.notStrictEqual(S.MATERIAL_ITEM_COTACAO_OBRIGATORIO, S.MATERIAL_ITEM_OBRIGATORIO);
    assert.notStrictEqual(S.QTD_ITEM_COTACAO_INVALIDA, S.QTD_ITEM_PEDIDO_INVALIDA);
    assert.notStrictEqual(S.VALOR_UNITARIO_ITEM_COTACAO_NEGATIVO, S.VALOR_UNITARIO_ITEM_NEGATIVO);
    assert.ok(/da cotação/.test(S.QTD_ITEM_COTACAO_INVALIDA));
  });
```

Rodar: `cd server && node tests/api/comprasSchemasFornecedorCotacao.api.test.js` → (p) cai em `itens` (hoje `looseObject` deixa passar `'abc'`: (q) cai com `success`), (r)(s) caem com `undefined`.

- [ ] **Step 2: `schemas.js`** — antes de `CotacaoSchema` (`:211`):

```js
/**
 * Etapa 41, Task 1 — o ITEM da cotacao. Mesma forma do `PedidoCompraItemSchema` (material do
 * catalogo, sem coercao, literal no construtor E no refinamento), com literais PROPRIAS: um grep por
 * "quantidade do item da cotacao" acha UM dono. `itens` e OPCIONAL na cotacao (D2 do design): a
 * cotacao de cabecalho — "R$ 1.500 o lote", sem discriminar — e uso real, e os quatro cenarios da
 * Etapa 40 que criam cotacao so com { numero, fornecedor_id } continuam valendo. Quem exige itens e
 * a CONVERSAO em pedido (RN-F08), no servico.
 */
const ITENS_COTACAO_INVALIDOS = 'itens da cotação devem ser uma lista';
const MATERIAL_ITEM_COTACAO_OBRIGATORIO = 'material do item da cotação é obrigatório';
const QTD_ITEM_COTACAO_INVALIDA = 'quantidade do item da cotação deve ser um número maior que zero';
const VALOR_UNITARIO_ITEM_COTACAO_NEGATIVO = 'valor unitário do item da cotação não pode ser negativo';

const CotacaoItemSchema = z.looseObject({
  material_id: z.number({ error: MATERIAL_ITEM_COTACAO_OBRIGATORIO }).int(MATERIAL_ITEM_COTACAO_OBRIGATORIO).positive(MATERIAL_ITEM_COTACAO_OBRIGATORIO),
  quantidade: z.number({ error: QTD_ITEM_COTACAO_INVALIDA }).gt(0, QTD_ITEM_COTACAO_INVALIDA),
  valor_unitario: z.number({ error: VALOR_UNITARIO_ITEM_COTACAO_NEGATIVO }).min(0, VALOR_UNITARIO_ITEM_COTACAO_NEGATIVO).optional(),
});
```

Em `CotacaoSchema`, acrescentar `itens: z.array(CotacaoItemSchema, { error: ITENS_COTACAO_INVALIDOS }).optional(),`.
Reescrever o comentário `:164-167` (era: *"valor_total e campo de entrada porque nao ha itens de cotacao
para somar (medido: zero cotacao_itens no sistema)"*) → *"Era verdade ate a Etapa 40. Desde a 41 ha
`itens_cotacao`: com itens, `valor_total` e DERIVADO no servico e o do payload e ignorado; sem itens,
continua entrada (D3 da 41)."* Exportar os 5 nomes.

- [ ] **Step 3: `pedidoCompraService.js`** — acrescentar `resolverItens` ao `module.exports` (com comentário: *"Etapa 41: reusada por `cotacaoService` — a frase 'Material não encontrado' tem um dono"*).

- [ ] **Step 4: DDL** — `schema.js`, após o `CREATE INDEX` de `:1339`:

```js
  // ── Itens de cotação (Etapa 41, Task 1) ──
  // Espelho de `itens_pedido_compra` SEM `quantidade_recebida` (cotação não é recebida): `codigo`,
  // `descricao` e `unidade` copiados do material por `resolverItens` (a tela de edição lê por linha,
  // como o pedido). `valor_unitario` tem o MESMO nome da linha do pedido de propósito: a conversão
  // copia sem renomear e o custo médio do recebimento (U1 da Etapa 37) herda o preço da cotação.
  // Vive AQUI e não em `index.js` (onde está `cotacoes`) porque `initSchema` roda no harness
  // (`testApp.js:32`): a tabela chega a toda suíte com a DDL de produção, sem stub — a divergência
  // stub/produção foi a classe de defeito da F1 da Etapa 40.
  await dbRun(db, `CREATE TABLE IF NOT EXISTS itens_cotacao (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cotacao_id INTEGER NOT NULL,
    material_id INTEGER,
    codigo TEXT,
    descricao TEXT,
    quantidade REAL NOT NULL DEFAULT 1,
    valor_unitario REAL DEFAULT 0,
    unidade TEXT DEFAULT 'UN',
    FOREIGN KEY (cotacao_id) REFERENCES cotacoes(id),
    FOREIGN KEY (material_id) REFERENCES materiais_almoxarifado(id)
  )`);
  await dbRun(db, 'CREATE INDEX IF NOT EXISTS idx_itens_cotacao_cotacao ON itens_cotacao(cotacao_id)');
```

`index.js`, após `:19256` (o `)` do `CREATE TABLE cotacoes`):

```js
// Etapa 41: a cotação que virou pedido aponta para ele (1:1). `cotacoes` é core, então a coluna
// entra pelo mesmo caminho das cinco de `fornecedores` abaixo (erro 'duplicate' ignorado). O stub do
// harness (`tests/helpers/testApp.js`) ganha a coluna à mão — este arquivo não roda nos testes.
db.run('ALTER TABLE cotacoes ADD COLUMN pedido_id INTEGER REFERENCES pedidos_compra(id)', (e) => {
  if (e && e.message.indexOf('duplicate') === -1) console.error('Erro ao adicionar pedido_id em cotacoes:', e.message);
});
```

`testApp.js:117-127`: acrescentar `pedido_id INTEGER,` antes de `created_at` (comentário: *"Etapa 41 — vínculo com o pedido gerado; sem FK como o resto do stub"*).

- [ ] **Step 5: rodar** — o arquivo (**19 passou**); `comprasCotacaoRotas` (10); `comprasFornecedorCotacaoIntegracao` (3); `comprasPedidoCriar` (13); um `node -e` que abre `createTestApp()` e faz `PRAGMA table_info(itens_cotacao)` (8 colunas) e `PRAGMA table_info(cotacoes)` (11); `npm run test:api` (**191/191**).

- [ ] **Step 6: sabotagens**

| # | Sabotagem | Âncora | Cai |
|---|---|---|---|
| 1 | `z.array(CotacaoItemSchema, { error: … })` → sem `{ error }` | 1 | **(q)** em inglês |
| 2 | `.gt(0, QTD_ITEM_COTACAO_INVALIDA)` → `.gte(0, …)` | 1 | **(r)** `quantidade: 0` passou |
| 3 | `QTD_ITEM_COTACAO_INVALIDA` = a literal do pedido | 1 | **(s)** `notStrictEqual` |
| 4 | remover `itens:` de `CotacaoSchema` | 1 | **(p)** `[]` vira… passa (looseObject) — **(q)** cai: `'abc'` passa |
| 5 | `CREATE TABLE IF NOT EXISTS itens_cotacao` sem `cotacao_id` | 1 | o `PRAGMA` do Step 5 (7 colunas) — declare que a suíte de schemas não vê a DDL; a T2 (1) é quem a exercita |

- [ ] **Step 7: commit** — `git add server/services/almoxarifado/schema.js server/index.js server/tests/helpers/testApp.js server/services/compras/schemas.js server/services/compras/pedidoCompraService.js server/tests/api/comprasSchemasFornecedorCotacao.api.test.js`. Mensagem em `msg-e41-t1.txt`: por que `itens` é opcional, por que a tabela vive em `schema.js`, por que `pedido_id` toca três lugares, e o descartado (`min(1)`, `index.js`, `cotacao_id` no pedido).

---

### Task 2: `cotacaoService` com itens, lixeira própria e a conversão **(tronco, um executor, worktree `wt-e41-t2`)**

**Files:**
- Modify: `server/services/compras/cotacaoService.js` (reescrever), `server/routes/compras.js` (`:316-343` lista, `:345-364` bloco, `:367` genérico)
- Test: `server/tests/api/comprasCotacaoItens.api.test.js` (novo, 10), `server/tests/api/comprasCotacaoGerarPedido.api.test.js` (novo, 8)

**Interfaces:**
- Consumes: T1 (`resolverItens`, `CotacaoSchema` com `itens`, coluna `pedido_id`, tabela `itens_cotacao`); `pedidoCompraService.criarPedido(db, dados, user)` (`:320`), `obterPedido(db, id)` (`:393`), `erro`, `assertFornecedor`; `dbAll`.
- Produces: contrato §5.3/§5.4 do design. **T4 e T5 consomem.**

- [ ] **Step 1: escrever `comprasCotacaoItens.api.test.js` e ver vermelho** (cabeçalho no molde de `comprasCotacaoRotas.api.test.js`; `ADMIN` id 100):

```js
(async () => {
  const { app, db, close } = await createTestApp({ user: ADMIN });
  const forn = (await dbRun(db, "INSERT INTO fornecedores (razao_social, status) VALUES ('Forn Itens E41', 'ativo')")).lastID;
  let seq = 0; const num = () => `COT-E41-I-${String(++seq).padStart(3, '0')}`;
  async function material(codigo, nome, unidade = 'KG') {
    return (await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, ativo) VALUES (?,?,?,0,1)`, [codigo, nome, unidade])).lastID;
  }
  const mA = await material('MAT-E41-A', 'Chapa A E41');
  const mB = await material('MAT-E41-B', 'Tubo B E41', 'PC');
  const post = (c) => request(app).post('/api/compras/cotacoes').send(c);
  const put = (id, c) => request(app).put(`/api/compras/cotacoes/${id}`).send(c);
  const get = (id) => request(app).get(`/api/compras/cotacoes/${id}`);
  const del = (id) => request(app).delete(`/api/compras/cotacoes/${id}`);
  const itensNoBanco = (id) => dbAll(db, 'SELECT * FROM itens_cotacao WHERE cotacao_id = ? ORDER BY id', [id]);
  const contaCotacoes = async () => (await dbGet(db, 'SELECT COUNT(*) AS n FROM cotacoes')).n;

  await test('(1) RN-F03/F04 POST com 2 itens -> 201, valor_total = soma, itens com codigo/descricao/unidade do material, na ordem', async () => {
    const r = await post({ numero: num(), fornecedor_id: forn, itens: [{ material_id: mA, quantidade: 2, valor_unitario: 10 }, { material_id: mB, quantidade: 1, valor_unitario: 5 }] });
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    assert.strictEqual(r.body.valor_total, 25);
    assert.strictEqual(r.body.itens.length, 2);
    assert.deepStrictEqual(r.body.itens.map((i) => [i.material_id, i.codigo, i.descricao, i.unidade, i.quantidade, i.valor_unitario]),
      [[mA, 'MAT-E41-A', 'Chapa A E41', 'KG', 2, 10], [mB, 'MAT-E41-B', 'Tubo B E41', 'PC', 1, 5]]);
    assert.ok(r.body.itens[0].id < r.body.itens[1].id, 'ordem de lancamento');
    assert.strictEqual(r.body.pedido_id, null);
    assert.strictEqual(r.body.pedido_numero, null);
  });
  await test('(2) RN-F03 valor_total do payload e IGNORADO quando ha itens', async () => {
    const r = await post({ numero: num(), fornecedor_id: forn, valor_total: 999, itens: [{ material_id: mA, quantidade: 3, valor_unitario: 1.5 }] });
    assert.strictEqual(r.status, 201);
    assert.strictEqual(r.body.valor_total, 4.5, 'devia ignorar 999');
  });
  await test('(3) RN-F02 sem itens (ausente e []) -> valor_total do payload; itens = []', async () => {
    const a = await post({ numero: num(), fornecedor_id: forn, valor_total: 77 });
    assert.strictEqual(a.body.valor_total, 77); assert.deepStrictEqual(a.body.itens, []);
    const b = await post({ numero: num(), fornecedor_id: forn, valor_total: 12, itens: [] });
    assert.strictEqual(b.body.valor_total, 12); assert.deepStrictEqual(b.body.itens, []);
  });
  await test('(4) RN-F01 material inexistente -> 400 "Material não encontrado" e NADA gravado (cabecalho inclusive)', async () => {
    const antes = await contaCotacoes();
    const r = await post({ numero: num(), fornecedor_id: forn, itens: [{ material_id: mA, quantidade: 1 }, { material_id: 999999, quantidade: 1 }] });
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.deepStrictEqual(r.body, { error: 'Material não encontrado' });
    assert.strictEqual(await contaCotacoes(), antes, 'o cabecalho nao pode ter sido gravado (resolverItens antes do INSERT)');
  });
  await test('(5) RN-F05 PUT substitui as linhas (ids novos); PUT sem itens APAGA e volta o total ao do payload', async () => {
    const a = await post({ numero: num(), fornecedor_id: forn, itens: [{ material_id: mA, quantidade: 2, valor_unitario: 10 }, { material_id: mB, quantidade: 1, valor_unitario: 5 }] });
    const idsAntes = a.body.itens.map((i) => i.id);
    const r = await put(a.body.id, { numero: a.body.numero, fornecedor_id: forn, itens: [{ material_id: mB, quantidade: 4, valor_unitario: 2 }] });
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.strictEqual(r.body.itens.length, 1); assert.strictEqual(r.body.valor_total, 8);
    assert.ok(!idsAntes.includes(r.body.itens[0].id), 'DELETE+INSERT: id novo');
    assert.strictEqual((await itensNoBanco(a.body.id)).length, 1);
    const r2 = await put(a.body.id, { numero: a.body.numero, fornecedor_id: forn, valor_total: 50 });
    assert.strictEqual(r2.status, 200);
    assert.deepStrictEqual(r2.body.itens, []); assert.strictEqual(r2.body.valor_total, 50);
    assert.strictEqual((await itensNoBanco(a.body.id)).length, 0);
  });
  await test('(6) RN-F04 GET /:id devolve itens; a LISTA nao devolve itens mas devolve pedido_id/pedido_numero', async () => {
    const a = await post({ numero: num(), fornecedor_id: forn, itens: [{ material_id: mA, quantidade: 1 }] });
    const g = await get(a.body.id);
    assert.strictEqual(g.body.itens.length, 1);
    const lista = await request(app).get('/api/compras/cotacoes');
    const l = lista.body.find((c) => c.id === a.body.id);
    assert.ok(l, 'na lista');
    assert.ok(!('itens' in l), 'a lista nao carrega itens');
    assert.ok('pedido_id' in l && 'pedido_numero' in l, `pedido_id/pedido_numero tem de vir na lista: ${Object.keys(l)}`);
  });
  await test('(7) RN-F06 DELETE leva os itens junto (orfaos = 0) e responde a literal', async () => {
    const a = await post({ numero: num(), fornecedor_id: forn, itens: [{ material_id: mA, quantidade: 1 }, { material_id: mB, quantidade: 1 }] });
    const r = await del(a.body.id);
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.deepStrictEqual(r.body, { message: 'Cotação excluída com sucesso' });
    assert.strictEqual((await get(a.body.id)).status, 404);
    // ⚠️ A ASSERCAO QUE IMPORTA: a FK nao dispara no harness (foreign_keys = 0). Sem o DELETE dos
    // filhos o status seria 200 do mesmo jeito — e producao daria 500. Contar orfaos e a regua.
    assert.strictEqual((await itensNoBanco(a.body.id)).length, 0, 'itens_cotacao orfaos — o DELETE dos filhos nao rodou');
  });
  await test('(8) DELETE de id inexistente -> 404 com a literal da cotacao (nao "Item não encontrado" do generico)', async () => {
    const r = await del(999999);
    assert.strictEqual(r.status, 404);
    assert.deepStrictEqual(r.body, { error: 'Cotação não encontrada' });
  });
  await test('(9) o (8) da Etapa 40 continua: DELETE de cotacao SEM pedido -> 200 e a linha some', async () => {
    const a = await post({ numero: num(), fornecedor_id: forn });
    assert.strictEqual((await del(a.body.id)).status, 200);
    assert.strictEqual((await get(a.body.id)).status, 404);
  });
  await test('(10) RN-F06 cotacao com pedido_id -> DELETE 409 com numero e PC (e o generico NAO responde mais por cotacoes)', async () => {
    const ped = await request(app).post('/api/compras/pedidos').send({ fornecedor_id: forn, itens: [{ material_id: mA, quantidade: 1 }] });
    assert.strictEqual(ped.status, 201, 'fixture pedido');
    const a = await post({ numero: num(), fornecedor_id: forn });
    await dbRun(db, 'UPDATE cotacoes SET pedido_id = ? WHERE id = ?', [ped.body.id, a.body.id]);
    const r = await del(a.body.id);
    assert.strictEqual(r.status, 409, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, `Cotação ${a.body.numero} já gerou o pedido ${ped.body.numero} — não pode ser excluída`);
    assert.strictEqual((await get(a.body.id)).status, 200, 'continua la');
  });
  await close(); console.log(`\n${passed} passou, ${failed} falhou`); process.exit(failed ? 1 : 0);
})();
```

Vermelho esperado: (1) `valor_total` 0 e `itens` undefined; (4) 201; (7) `message` do genérico e órfãos
não medidos (vai passar `length 0`? **Não**: sem o laço de INSERT não há itens — o (7) só mede órfãos
depois que a T2 grava itens; no vermelho ele cai na literal); (8) `Item não encontrado`; (10) 200.

- [ ] **Step 2: escrever `comprasCotacaoGerarPedido.api.test.js` e ver vermelho** (`ADMIN` id 101; fixtures: fornecedor ativo `fA`, inativo `fB`, materiais `mA`/`mB`; helper `cotar(itens, extra)`):

```js
  const gerar = (id) => request(app).post(`/api/compras/cotacoes/${id}/gerar-pedido`).send();
  const contaPedidos = async () => (await dbGet(db, 'SELECT COUNT(*) AS n FROM pedidos_compra')).n;

  await test('(1) RN-F07 gerar -> 201 pedido PC-, total = soma, 2 linhas com codigo/descricao/unidade e recebida 0; cotacao ganha pedido_id e status aprovado', async () => {
    const c = await cotar([{ material_id: mA, quantidade: 2, valor_unitario: 10 }, { material_id: mB, quantidade: 1, valor_unitario: 5 }], { status: 'em_analise' });
    const r = await gerar(c.id);
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    assert.ok(/^PC-/.test(r.body.numero), r.body.numero);
    assert.strictEqual(r.body.valor_total, 25);
    assert.strictEqual(r.body.fornecedor_id, fA);
    assert.deepStrictEqual(r.body.itens.map((i) => [i.material_id, i.quantidade, i.valor_unitario, i.codigo, i.quantidade_recebida]),
      [[mA, 2, 10, 'MAT-E41-A', 0], [mB, 1, 5, 'MAT-E41-B', 0]]);
    const g = await get(c.id);
    assert.strictEqual(g.body.pedido_id, r.body.id);
    assert.strictEqual(g.body.pedido_numero, r.body.numero);
    assert.strictEqual(g.body.status, 'aprovado', 'gerar o pedido E aprovar (D7)');
    // e o pedido e um pedido NORMAL da lista
    const lista = await request(app).get('/api/compras/pedidos');
    assert.ok(lista.body.some((p) => p.id === r.body.id));
  });
  await test('(2) RN-F10 segunda conversao -> 409 com numero e PC; COUNT(pedidos) inalterado', async () => {
    const c = await cotar([{ material_id: mA, quantidade: 1 }]);
    const a = await gerar(c.id); assert.strictEqual(a.status, 201);
    const antes = await contaPedidos();
    const r = await gerar(c.id);
    assert.strictEqual(r.status, 409, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, `Cotação ${c.numero} já gerou o pedido ${a.body.numero}`);
    assert.strictEqual(await contaPedidos(), antes);
  });
  await test('(3) RN-F08 sem itens -> 400 literal, pedido_id continua null', async () => {
    const c = await cotar([]);
    const r = await gerar(c.id);
    assert.strictEqual(r.status, 400); assert.deepStrictEqual(r.body, { error: 'cotação sem itens não pode gerar pedido' });
    assert.strictEqual((await get(c.id)).body.pedido_id, null);
  });
  await test('(4) RN-F09 rejeitado e cancelado -> 400 com o status na frase; em_analise -> 201', async () => {
    for (const s of ['rejeitado', 'cancelado']) {
      const c = await cotar([{ material_id: mA, quantidade: 1 }], { status: s });
      const r = await gerar(c.id);
      assert.strictEqual(r.status, 400, s); assert.strictEqual(r.body.error, `cotação ${s} não pode gerar pedido`);
    }
    const ok = await cotar([{ material_id: mA, quantidade: 1 }], { status: 'em_analise' });
    assert.strictEqual((await gerar(ok.id)).status, 201);
  });
  await test('(5) RN-F11 fornecedor inativo -> 400 literal; reativado -> 201; fornecedor APAGADO -> 400 "Fornecedor não encontrado"', async () => {
    const c = await cotar([{ material_id: mA, quantidade: 1 }], { fornecedor_id: fB });
    const r = await gerar(c.id);
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, 'Fornecedor inativo — reative-o em Compras → Fornecedores antes de gerar o pedido');
    await dbRun(db, "UPDATE fornecedores SET status = 'ativo' WHERE id = ?", [fB]);
    assert.strictEqual((await gerar(c.id)).status, 201);
    const fC = (await dbRun(db, "INSERT INTO fornecedores (razao_social) VALUES ('Some E41')")).lastID;
    const c2 = await cotar([{ material_id: mA, quantidade: 1 }], { fornecedor_id: fC });
    await dbRun(db, 'DELETE FROM fornecedores WHERE id = ?', [fC]);
    const r2 = await gerar(c2.id);
    assert.strictEqual(r2.status, 400); assert.deepStrictEqual(r2.body, { error: 'Fornecedor não encontrado' });
  });
  await test('(6) 404 para cotacao inexistente', async () => {
    const r = await gerar(999999); assert.strictEqual(r.status, 404); assert.deepStrictEqual(r.body, { error: 'Cotação não encontrada' });
  });
  await test('(7) RN-F06 cotacao convertida -> DELETE 409 com a literal de exclusao', async () => {
    const c = await cotar([{ material_id: mA, quantidade: 1 }]);
    const a = await gerar(c.id);
    const r = await request(app).delete(`/api/compras/cotacoes/${c.id}`);
    assert.strictEqual(r.status, 409);
    assert.strictEqual(r.body.error, `Cotação ${c.numero} já gerou o pedido ${a.body.numero} — não pode ser excluída`);
  });
  await test('(8) pelo SERVICO: gerarPedidoDaCotacao direto produz o mesmo pedido que a rota', async () => {
    const c = await cotar([{ material_id: mB, quantidade: 3, valor_unitario: 2 }]);
    const p = await cotacaoService.gerarPedidoDaCotacao(db, c.id, ADMIN);
    assert.ok(/^PC-/.test(p.numero)); assert.strictEqual(p.valor_total, 6);
    assert.strictEqual((await get(c.id)).body.pedido_id, p.id);
    let e; try { await cotacaoService.gerarPedidoDaCotacao(db, c.id, ADMIN); } catch (x) { e = x; }
    assert.strictEqual(e && e.status, 409);
  });
```

- [ ] **Step 3: `cotacaoService.js`** — reescrever (cabeçalho atualizado: o parágrafo *"Nao ha itens…"* vira *"Ate a Etapa 40 nao havia itens… Desde a 41…"*):

```js
const { dbRun, dbGet, dbAll } = require('../almoxarifado/db');
const pedidoCompraService = require('./pedidoCompraService');
const { erro, assertFornecedor, resolverItens } = pedidoCompraService;

const COTACAO_NAO_ENCONTRADA = 'Cotação não encontrada';
const FORNECEDOR_COM_COTACOES = 'Fornecedor possui cotações — não pode ser excluído';
const COTACAO_EXCLUIDA = 'Cotação excluída com sucesso';
const COTACAO_SEM_ITENS = 'cotação sem itens não pode gerar pedido';
const FORNECEDOR_INATIVO_CONVERSAO = 'Fornecedor inativo — reative-o em Compras → Fornecedores antes de gerar o pedido';
const STATUS_QUE_NAO_GERA = ['rejeitado', 'cancelado'];
const numeroDuplicado = (numero) => `Já existe uma cotação com o número ${numero}`;
const cotacaoStatusNaoGera = (status) => `cotação ${status} não pode gerar pedido`;
const cotacaoJaGerouPedido = (numero, pc) => `Cotação ${numero} já gerou o pedido ${pc}`;
const cotacaoJaGerouPedidoExclusao = (numero, pc) => `${cotacaoJaGerouPedido(numero, pc)} — não pode ser excluída`;

const SELECT_LINHA = `SELECT c.id, c.numero, c.fornecedor_id, f.razao_social AS fornecedor_nome, c.valor_total,
  c.data_cotacao, c.validade, c.status, c.observacoes, c.pedido_id, p.numero AS pedido_numero, c.created_at, c.updated_at
  FROM cotacoes c LEFT JOIN fornecedores f ON f.id = c.fornecedor_id LEFT JOIN pedidos_compra p ON p.id = c.pedido_id`;

async function lerItens(db, cotacaoId) {
  return dbAll(db, `SELECT id, material_id, codigo, descricao, unidade, quantidade, valor_unitario
    FROM itens_cotacao WHERE cotacao_id = ? ORDER BY id`, [cotacaoId]);
}
async function obterCotacao(db, id) {
  const linha = await dbGet(db, `${SELECT_LINHA} WHERE c.id = ?`, [id]);
  if (!linha) throw erro(COTACAO_NAO_ENCONTRADA, 404);
  linha.itens = await lerItens(db, id);
  return linha;
}
function colunas(dados) { /* igual à 40 */ }
const somaItens = (itens) => itens.reduce((s, i) => s + Number(i.quantidade) * Number(i.valor_unitario || 0), 0);
async function gravarItens(db, cotacaoId, resolvidos) {
  await dbRun(db, 'DELETE FROM itens_cotacao WHERE cotacao_id = ?', [cotacaoId]);
  for (const it of resolvidos) {
    await dbRun(db, `INSERT INTO itens_cotacao (cotacao_id, material_id, codigo, descricao, quantidade, valor_unitario, unidade)
      VALUES (?, ?, ?, ?, ?, ?, ?)`, [cotacaoId, it.material_id, it.codigo, it.descricao, it.quantidade, it.valor_unitario, it.unidade]);
  }
}
async function criarCotacao(db, dados) {
  const c = colunas(dados);
  const itens = Array.isArray(dados.itens) ? dados.itens : [];
  await assertFornecedor(db, c.fornecedor_id);
  const resolvidos = await resolverItens(db, itens);   // TODOS os materiais antes de qualquer escrita (RN-F01)
  await assertNumeroLivre(db, c.numero, null);
  if (resolvidos.length) c.valor_total = somaItens(resolvidos);   // RN-F03
  let r;
  try { r = await dbRun(db, `INSERT INTO cotacoes (…)`, […]); } catch (e) { throw traduzUnique(e, c.numero); }
  await gravarItens(db, r.lastID, resolvidos);
  return obterCotacao(db, r.lastID);
}
async function atualizarCotacao(db, id, dados) {
  await obterCotacao(db, id);
  const c = colunas(dados);
  const itens = Array.isArray(dados.itens) ? dados.itens : [];   // RN-F05: sem itens = apaga as linhas
  await assertFornecedor(db, c.fornecedor_id);
  const resolvidos = await resolverItens(db, itens);
  await assertNumeroLivre(db, c.numero, id);
  if (resolvidos.length) c.valor_total = somaItens(resolvidos);
  try { await dbRun(db, `UPDATE cotacoes SET … WHERE id = ?`, […]); } catch (e) { throw traduzUnique(e, c.numero); }
  await gravarItens(db, id, resolvidos);
  return obterCotacao(db, id);
}
async function excluirCotacao(db, id) {
  const c = await obterCotacao(db, id);
  if (c.pedido_id != null) throw erro(cotacaoJaGerouPedidoExclusao(c.numero, c.pedido_numero), 409);
  // Filhos PRIMEIRO: a FK nao dispara no harness e dispara em producao (ver o cabecalho do plano da 41).
  await dbRun(db, 'DELETE FROM itens_cotacao WHERE cotacao_id = ?', [id]);
  await dbRun(db, 'DELETE FROM cotacoes WHERE id = ?', [id]);
  return { message: COTACAO_EXCLUIDA };
}
async function gerarPedidoDaCotacao(db, id, user) {
  const c = await obterCotacao(db, id);
  if (c.pedido_id != null) throw erro(cotacaoJaGerouPedido(c.numero, c.pedido_numero), 409);
  if (STATUS_QUE_NAO_GERA.includes(c.status)) throw erro(cotacaoStatusNaoGera(c.status));
  if (!c.itens.length) throw erro(COTACAO_SEM_ITENS);
  await assertFornecedor(db, c.fornecedor_id);   // apagado -> 400 'Fornecedor não encontrado'
  const f = await dbGet(db, 'SELECT status FROM fornecedores WHERE id = ?', [c.fornecedor_id]);
  if (f && f.status === 'inativo') throw erro(FORNECEDOR_INATIVO_CONVERSAO);   // RN-F11: a PRIMEIRA porta do Compras a olhar status
  const pedido = await pedidoCompraService.criarPedido(db, {
    fornecedor_id: c.fornecedor_id,
    observacoes: c.observacoes,
    itens: c.itens.map((i) => ({ material_id: i.material_id, quantidade: i.quantidade, valor_unitario: i.valor_unitario })),
  }, user);
  // Sem transacao (como o resto ate o Postgres): se este UPDATE falhar, o pedido FICA e a cotacao
  // fica sem vinculo — declarado na letra G. O erro sobe.
  await dbRun(db, "UPDATE cotacoes SET pedido_id = ?, status = 'aprovado', updated_at = CURRENT_TIMESTAMP WHERE id = ?", [pedido.id, id]);
  return pedidoCompraService.obterPedido(db, pedido.id);
}
module.exports = { criarCotacao, obterCotacao, atualizarCotacao, excluirCotacao, gerarPedidoDaCotacao,
  COTACAO_NAO_ENCONTRADA, FORNECEDOR_COM_COTACOES, COTACAO_EXCLUIDA, COTACAO_SEM_ITENS, FORNECEDOR_INATIVO_CONVERSAO,
  numeroDuplicado, cotacaoStatusNaoGera, cotacaoJaGerouPedido, cotacaoJaGerouPedidoExclusao };
```

⚠️ **Ordem das guardas em `gerarPedidoDaCotacao`:** 409 (já gerou) → status → itens → fornecedor. O
cenário (5) apaga o fornecedor **depois** de criar a cotação; `assertFornecedor` tem de vir **antes** do
`SELECT status` (senão `f` é `undefined` e o 400 sai errado). Confirme o shape que `criarPedido` devolve
(`:320-380`) — se devolver `{ id, numero, … }` sem `itens`, `obterPedido` é quem relê. E o `user`: a rota
passa `req.user` (o gate condicional de `solicitacao_id` não dispara porque não mandamos `solicitacao_id`).

- [ ] **Step 4: as rotas** — em `routes/compras.js`:

(a) lista `:316-343`: `SELECT c.*, f.razao_social as fornecedor_nome, p.numero AS pedido_numero FROM cotacoes c LEFT JOIN fornecedores f ON c.fornecedor_id = f.id LEFT JOIN pedidos_compra p ON p.id = c.pedido_id WHERE 1=1` (o `c.*` já traz `pedido_id`).

(b) no bloco `:345-364`, após o `PUT`:

```js
// Etapa 41 (RN-F07…F11): a conversao. Sem corpo — tudo vem da cotacao; o servico chama
// `pedidoCompraService.criarPedido` (numero PC- gerado, total derivado, resolverItens), grava o vinculo
// e devolve o pedido relido. 201 como o POST de pedido.
app.post('/api/compras/cotacoes/:id/gerar-pedido', authenticateToken, checkModulePermission('compras'), async (req, res) => {
  try { res.status(201).json(await cotacaoService.gerarPedidoDaCotacao(db, req.params.id, req.user)); }
  catch (e) { respondeErro(res, e); }
});
// Etapa 41 (RN-F06): a lixeira PROPRIA da cotacao, e ela tem de ficar ACIMA do generico
// `DELETE /api/compras/:tipo/:id` (posicao e comportamento — o mesmo motivo do bloco de pedidos,
// :189-199). Ate a Etapa 40 o generico apagava `cotacoes` cru; com `itens_cotacao` (FK) isso da 500 em
// producao e passa no harness deixando orfaos. Aqui: 409 se ja gerou pedido, senao filhos primeiro.
app.delete('/api/compras/cotacoes/:id', authenticateToken, checkModulePermission('compras'), async (req, res) => {
  try { res.json(await cotacaoService.excluirCotacao(db, req.params.id)); }
  catch (e) { respondeErro(res, e); }
});
```

E reescrever o comentário `:345-349` (*"Nenhuma e DELETE, entao a posicao… e convencao"*): *"era verdade
até a 40; desde a 41 o `DELETE /cotacoes/:id` próprio existe e a posição deste bloco (acima do genérico)
passou a ser comportamento"*. No genérico, ao lado de `'cotacoes': 'cotacoes'` no mapa: comentário
*"sombreado desde a Etapa 41 pela rota própria — fica no mapa por caracterização, como `pedidos`"*.

- [ ] **Step 5: rodar** — os dois arquivos (**10** e **8**); `comprasCotacaoRotas` (10 — o (8) continua 200), `comprasFornecedorCotacaoIntegracao` (3), `comprasFornecedorRotas` (13), `comprasPedidoEditarExcluir` (13), `comprasPedidoCriar` (13); `npm run test:api` (**193/193**); `npm run test:almoxarifado` (42).

- [ ] **Step 6: sabotagens**

| # | Sabotagem | Âncora | Cai |
|---|---|---|---|
| 1 | `excluirCotacao`: remover `DELETE FROM itens_cotacao` | 1 (a de `excluirCotacao`; `gravarItens` tem outra — use a linha inteira com `[id]`) | **(7)** *"itens_cotacao orfaos"* — o status seguiria 200 |
| 2 | `criarCotacao`: `resolverItens` **depois** do INSERT | mover a linha | **(4)** `contaCotacoes` mudou |
| 3 | `gerarPedidoDaCotacao`: remover o `if (c.pedido_id != null)` | 1 | **(2)** 201 e COUNT +1; **(8)** |
| 4 | `SET pedido_id = ?, status = 'aprovado'` → sem `status` | 1 | **(1)** *"gerar o pedido E aprovar"* |
| 5 | mover o `app.delete('/api/compras/cotacoes/:id')` para **depois** do genérico | — | **(8)** `Item não encontrado`; **(10)** 200 — é a prova de que a posição é comportamento |
| 6 | `if (resolvidos.length) c.valor_total = somaItens(resolvidos)` → sempre | 1 | **(3)** total 0 em vez de 77 |

- [ ] **Step 7: commit** — `git add server/services/compras/cotacaoService.js server/routes/compras.js server/tests/api/comprasCotacaoItens.api.test.js server/tests/api/comprasCotacaoGerarPedido.api.test.js`. Mensagem em `msg-e41-t2.txt`.

---

### Task 3: `CotacaoForm` com itens — busca, linhas, total derivado, edição **(galho, worktree `wt-e41-t3`)**

**Files:**
- Modify: `client/src/components/compras/CotacaoForm.js`, `client/src/components/compras/CotacaoForm.test.js` (+6 → 14)

**Interfaces:**
- Consumes (mock HTTP): `GET /compras/materiais?search=` → `[{ id, codigo, descricao, unidade }]`; `GET /compras/cotacoes/:id` → linha + `itens[{ id, material_id, codigo, descricao, unidade, quantidade, valor_unitario }]`; `POST`/`PUT /compras/cotacoes` com `itens`.
- Produces: `data-testid` de §5.5; payload `itens` + `valor_total` só sem itens.

- [ ] **Step 1: os cenários (i)–(n) e os ajustes de mock**

Mock: `api.get` ganha `if (url === '/compras/materiais') return Promise.resolve({ data: MATERIAIS })`
(`MATERIAIS = [{ id: 912, codigo: 'ALM-0912', descricao: 'Chapa Aço 5mm', unidade: 'KG' }]`), e a cotação
**770** `COTACAO_770 = { ...COTACAO_760, id: 770, numero: 'COT-2026-770', valor_total: 27, itens: [{ id: 7701, material_id: 912, codigo: 'ALM-0912', descricao: 'Chapa Aço 5mm', unidade: 'KG', quantidade: 2, valor_unitario: 10 }, { id: 7702, material_id: 907, codigo: 'ALM-0907', descricao: 'Chapa Aço 3mm', unidade: 'KG', quantidade: 1, valor_unitario: 7 }] }`
com `if (url === '/compras/cotacoes/770') …`. `COTACAO_760` ganha `itens: []`, `pedido_id: null`,
`pedido_numero: null`. O `toEqual` do (e) passa a esperar `itens: []` (8 chaves, sem `valor_total`? **não** —
sem itens `valor_total` continua no payload: 9 chaves com `itens: []`).

```js
const chamadasMateriais = () => api.get.mock.calls.filter(([u]) => u === '/compras/materiais');
async function adicionar912() {
  digitar(porTestId('cotacao-busca-material'), 'chapa');
  await clicar(porTestId('cotacao-botao-buscar-material'));
  await clicar(porTestId('cotacao-adicionar-material-912'));
}
test('(i) RN-F13 busca com search, adiciona 912, total soma e o campo Valor total trava com a soma', async () => {
  await renderizarEm('/compras/cotacoes/nova');
  digitar(porTestId('cotacao-valor'), '55');           // digitavel enquanto nao ha linha
  await adicionar912();
  expect(chamadasMateriais()[0][1]).toEqual({ params: { search: 'chapa' } });
  expect(porTestId('cotacao-qtd-item-912').value).toBe('1');
  digitar(porTestId('cotacao-valor-item-912'), '12.5');
  expect(texto()).toContain('Total: R$ 12,50');
  expect(porTestId('cotacao-valor').readOnly).toBe(true);
  expect(porTestId('cotacao-valor').value).toBe('12.5');
  await clicar(porTestId('cotacao-remover-item-912'));
  expect(porTestId('cotacao-valor').readOnly).toBe(false);
  expect(porTestId('cotacao-valor').value).toBe('55');   // volta o digitado
});
test('(j) RN-F13 POST com itens em Number() e SEM valor_total', async () => {
  await renderizarEm('/compras/cotacoes/nova');
  digitar(porTestId('cotacao-numero'), 'COT-9');
  await selecionar(porTestId('cotacao-fornecedor'), '312');
  await adicionar912();
  digitar(porTestId('cotacao-qtd-item-912'), '3');
  digitar(porTestId('cotacao-valor-item-912'), '2.5');
  await submeter();
  const corpo = api.post.mock.calls[0][1];
  expect(corpo.itens).toEqual([{ material_id: 912, quantidade: 3, valor_unitario: 2.5 }]);
  expect('valor_total' in corpo).toBe(false);
});
test('(k) RN-F13 sem item -> POST com valor_total digitado e itens []', async () => {
  await renderizarEm('/compras/cotacoes/nova');
  digitar(porTestId('cotacao-numero'), 'COT-9');
  await selecionar(porTestId('cotacao-fornecedor'), '312');
  digitar(porTestId('cotacao-valor'), '99.9');
  await submeter();
  const corpo = api.post.mock.calls[0][1];
  expect(corpo.valor_total).toBe(99.9);
  expect(corpo.itens).toEqual([]);
});
test('(l) RN-F13 edicao da 770 pre-carrega 2 linhas sem buscar material; campo travado com 27', async () => {
  await renderizarEm('/compras/cotacoes/editar/770');
  expect(porTestId('cotacao-qtd-item-912').value).toBe('2');
  expect(porTestId('cotacao-valor-item-907').value).toBe('7');
  expect(chamadasMateriais()).toHaveLength(0);
  expect(porTestId('cotacao-valor').readOnly).toBe(true);
  expect(texto()).toContain('Total: R$ 27,00');
});
test('(m) RN-F05 remover uma linha e salvar -> PUT com 1 item', async () => {
  await renderizarEm('/compras/cotacoes/editar/770');
  await clicar(porTestId('cotacao-remover-item-907'));
  await submeter();
  const corpo = api.put.mock.calls[0][1];
  expect(corpo.itens).toEqual([{ material_id: 912, quantidade: 2, valor_unitario: 10 }]);
  expect('valor_total' in corpo).toBe(false);
});
test('(n) 400 de item do servidor vai para role=alert com a literal', async () => {
  api.post.mockImplementation(() => Promise.reject({ response: { status: 400, data: { error: 'Dados inválidos — itens.0.quantidade: quantidade do item da cotação deve ser um número maior que zero' } } }));
  await renderizarEm('/compras/cotacoes/nova');
  digitar(porTestId('cotacao-numero'), 'COT-9');
  await selecionar(porTestId('cotacao-fornecedor'), '312');
  await adicionar912();
  await submeter();
  expect(alertas()).toContain('itens.0.quantidade: quantidade do item da cotação');
  expect(toast.error).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: rodar** — `CI=true npx react-scripts test --watchAll=false src/components/compras/CotacaoForm.test.js`: (i)–(n) caem (`porTestId('cotacao-busca-material')` é `null`), (a)–(h) seguem verdes (o (e) cai até o payload ganhar `itens: []` — é o ajuste previsto).

- [ ] **Step 3: a tela** — em `CotacaoForm.js`, imports `useCallback, useMemo` e `FiPlus, FiSearch, FiTrash2`; cópias de `PedidoCompraForm.js`: `formatCurrency` (`:98-100`), `novaLinha` (`:124-125`); estados `itens`, `termoMaterial`, `materiais`, `buscando`; `buscarMateriais` (`:218-229`, `params: { search }`), `adicionarMaterial`, `alterarItem`, `removerItem` (`:231-245`), `total` (`:247-250`). Edição: `setItens((c.itens || []).map((it) => novaLinha({ material_id: it.material_id, codigo: it.codigo || '', descricao: it.descricao || '', unidade: it.unidade || 'UN', quantidade: String(it.quantidade ?? ''), valor_unitario: String(it.valor_unitario ?? '') })))`. Payload:

```js
    const payload = { numero: numero.trim(), fornecedor_id: Number(fornecedorId), data_cotacao: dataCotacao, validade, status, observacoes,
      itens: itens.map((it) => ({ material_id: Number(it.material_id), quantidade: Number(it.quantidade), valor_unitario: Number(it.valor_unitario) || 0 })) };
    if (itens.length === 0) payload.valor_total = Number(valorTotal) || 0;   // D3: duas regras, a tela espelha o servidor
```

O input `cotacao-valor`: `readOnly={itens.length > 0}` e `value={itens.length > 0 ? String(total) : valorTotal}`
(o `onChange` continua só setando `valorTotal`; com linhas ele não dispara porque é `readOnly`). O JSX do
bloco de itens é a cópia de `PedidoCompraForm.js:549-668` com os `data-testid` prefixados (§5.5) e **sem
`min="0"`** nos inputs de linha (F4 da 40). Aviso de item sem preço (`:674-676`) e `Total` (`:678`).
Cabeçalho do arquivo: substituir *"Cabecalho so (nao ha itens…)"* por *"Cabecalho + itens desde a 41 (D2/D3/D10)"*.

- [ ] **Step 4: rodar** — o arquivo (**14**); `PedidoCompraForm.test.js` (25); `FornecedorForm.test.js` (8); `Compras.test.js` (9); suíte inteira (**51 suítes / 775**); build.

- [ ] **Step 5: sabotagens**

| # | Sabotagem | Cai |
|---|---|---|
| 1 | `if (itens.length === 0) payload.valor_total = …` → sempre | **(j)** `'valor_total' in corpo` true; **(m)** |
| 2 | `readOnly={itens.length > 0}` → `false` | **(i)** `readOnly` false; **(l)** |
| 3 | `params: { search: termoMaterial }` → `{ q: … }` | **(i)** `toEqual` dos params |
| 4 | edição sem `setItens` | **(l)** `porTestId(...)` null |
| 5 | `Number(it.quantidade)` → `it.quantidade` | **(j)** `toEqual` (string `'3'`) |

- [ ] **Step 6: commit** — `git add client/src/components/compras/CotacaoForm.js client/src/components/compras/CotacaoForm.test.js`. Mensagem em `msg-e41-t3.txt`.

---

### Task 4: aba Cotações — coluna Pedido, botão "Gerar pedido", exportação **(galho, worktree `wt-e41-t4`)**

**Files:**
- Modify: `client/src/components/Compras.js` (`:268-278` export; `:423-481` `renderCotacoes`; `handleGerarPedido` novo ao lado de `handleDelete :166`), `client/src/components/Compras.test.js` (+3 → 12)

**Interfaces:**
- Consumes (mock): `GET /compras/cotacoes` → linhas com `pedido_id`, `pedido_numero`; `POST /compras/cotacoes/:id/gerar-pedido` → `201 { id, numero, … }`.
- Produces: `data-testid="gerar-pedido-${id}"`, coluna Pedido, `Pedido` no export.

- [ ] **Step 1: os cenários (j)(k)(l)** — fixtures em `Compras.test.js`:

```js
const COTACOES_E41 = [
  { id: 770, numero: 'COT-2026-770', fornecedor_nome: 'Aços Vale Ltda', valor_total: 27, data_cotacao: '2026-09-20', validade: '2026-10-20', status: 'aprovado', pedido_id: null, pedido_numero: null },
  { id: 771, numero: 'COT-2026-771', fornecedor_nome: 'Parafusos Sul', valor_total: 90, data_cotacao: '2026-09-18', validade: null, status: 'aprovado', pedido_id: 650, pedido_numero: 'PC-2026-650' },
  { id: 772, numero: 'COT-2026-772', fornecedor_nome: 'Parafusos Sul', valor_total: 1, data_cotacao: '2026-09-18', validade: null, status: 'rejeitado', pedido_id: null, pedido_numero: null },
];
let cotacoesDoBanco;   // beforeEach: cotacoesDoBanco = []; e o mock `/compras/cotacoes` devolve cotacoesDoBanco
```

`api.post` no `beforeEach`: `mockImplementation((url) => url.endsWith('/gerar-pedido') ? Promise.resolve({ data: { id: 650, numero: 'PC-2026-650' } }) : Promise.reject(new Error(`POST inesperado: ${url}`)))`.
A rota `/compras/pedidos/editar/650` renderiza o **stub** `PedidoCompraForm` do Proxy (`data-stub="PedidoCompraForm"`) — é o que o (k) afirma (sem pôr a tela real em `reais`: a suíte de `Compras` não mede o form de pedido).

```js
test('(j) RN-F14 coluna Pedido: "-" sem pedido, link PC- com pedido; botao Gerar pedido so em 770', async () => {
  cotacoesDoBanco = COTACOES_E41;
  await renderizarEm('/compras/cotacoes');
  expect([...container.querySelectorAll('thead th')].map((th) => th.textContent)).toEqual(['Número', 'Fornecedor', 'Valor Total', 'Data', 'Validade', 'Status', 'Pedido', 'Ações']);
  expect(celulasDaLinha(0)[6].textContent).toBe('-');
  const link = celulasDaLinha(1)[6].querySelector('a');
  expect(link.textContent).toBe('PC-2026-650');
  expect(link.getAttribute('href')).toBe('/compras/pedidos/editar/650');
  expect(container.querySelector('[data-testid="gerar-pedido-770"]')).not.toBeNull();
  expect(container.querySelector('[data-testid="gerar-pedido-771"]')).toBeNull();   // ja tem pedido
  expect(container.querySelector('[data-testid="gerar-pedido-772"]')).toBeNull();   // rejeitado
});
test('(k) RN-F14 clicar em Gerar pedido -> POST na URL certa, toast com PC e numero, navega para a edicao do pedido', async () => {
  cotacoesDoBanco = COTACOES_E41;
  await renderizarEm('/compras/cotacoes');
  await clicar(container.querySelector('[data-testid="gerar-pedido-770"]'));
  expect(api.post.mock.calls).toHaveLength(1);
  expect(api.post.mock.calls[0][0]).toBe('/compras/cotacoes/770/gerar-pedido');
  expect(toast.success).toHaveBeenCalledWith('Pedido PC-2026-650 gerado da cotação COT-2026-770');
  expect(container.querySelector('[data-stub="PedidoCompraForm"]')).not.toBeNull();   // navegou
  expect(texto()).not.toContain('Gestão de fornecedores, pedidos e cotações');
});
test('(l) RN-F14 409 do servidor -> toast.error com a literal, sem navegar; export tem a coluna Pedido no fim', async () => {
  cotacoesDoBanco = COTACOES_E41;
  api.post.mockImplementation(() => Promise.reject({ response: { status: 409, data: { error: 'Cotação COT-2026-770 já gerou o pedido PC-2026-650' } } }));
  await renderizarEm('/compras/cotacoes');
  await clicar(container.querySelector('[data-testid="gerar-pedido-770"]'));
  expect(toast.error).toHaveBeenCalledWith('Cotação COT-2026-770 já gerou o pedido PC-2026-650');
  expect(texto()).toContain('Gestão de fornecedores, pedidos e cotações');
  await clicar(botaoPorTexto('Exportar Excel'));
  const linhas = exportToExcel.mock.calls[0][0];
  expect(Object.keys(linhas[0])).toEqual(['Número', 'Fornecedor', 'Valor', 'Status', 'Data', 'Validade', 'Pedido']);
  expect(linhas[1].Pedido).toBe('PC-2026-650');
  expect(linhas[0].Pedido).toBe('');
});
```

⚠️ `celulasDaLinha(i)` existe em `Compras.test.js:177-179`; confira a assinatura de `exportToExcel` mock
(`:230-238` usa `exportToExcel.mock.calls[0]`) para ler as linhas no índice certo.

- [ ] **Step 2: rodar e ver vermelho** — (j) cai no `toEqual` dos `<th>` (7 colunas), (k) `querySelector` null, (l) idem.

- [ ] **Step 3: `Compras.js`** — `renderCotacoes`: `<th>Pedido</th>` antes de `<th>Ações</th>`, `colSpan="8"`, célula
`<td>{cotacao.pedido_id ? <Link to={`/compras/pedidos/editar/${cotacao.pedido_id}`}>{cotacao.pedido_numero}</Link> : '-'}</td>`;
na `action-buttons`, **antes** do lápis:

```jsx
                      {!cotacao.pedido_id && !['rejeitado', 'cancelado'].includes(cotacao.status) && (
                        <button type="button" onClick={() => handleGerarPedido(cotacao)} className="btn-icon" title="Gerar pedido" data-testid={`gerar-pedido-${cotacao.id}`}>
                          <FiShoppingCart />
                        </button>
                      )}
```

(ícone: confira o que `react-icons/fi` já importa em `:5-9`; `FiShoppingCart` ou `FiFileText`). E:

```js
  // Etapa 41 (RN-F14): a conversao e do SERVIDOR (D5) — a tela so pede e vai para a edicao do pedido
  // gerado, onde o comprador confere datas e previsao. Erro no toast: e o mesmo canal da lixeira.
  const handleGerarPedido = async (cotacao) => {
    try {
      const res = await api.post(`/compras/cotacoes/${cotacao.id}/gerar-pedido`);
      toast.success(`Pedido ${res.data?.numero || ''} gerado da cotação ${cotacao.numero}`.replace('  ', ' '));
      navigate(`/compras/pedidos/editar/${res.data.id}`);
    } catch (error) {
      toast.error(error.response?.data?.error || 'Não foi possível gerar o pedido');
    }
  };
```

Export (`:268-278`): `'Pedido': c.pedido_numero || ''` **no fim**.

- [ ] **Step 4: rodar** — `Compras.test.js` (**12**); `CotacaoForm.test.js` (8 — o (b) usa o primeiro `a[title="Editar"]`: o botão novo é `<button>`, não colide); `PedidoCompraForm.test.js` (25); suíte inteira; build.

- [ ] **Step 5: sabotagens**

| # | Sabotagem | Cai |
|---|---|---|
| 1 | condição do botão sem `!cotacao.pedido_id` | **(j)** `gerar-pedido-771` existe |
| 2 | condição sem o filtro de status | **(j)** `gerar-pedido-772` |
| 3 | `navigate(...)` removido | **(k)** stub ausente |
| 4 | `toast.error(...)` → `toast.error('Erro')` | **(l)** literal |
| 5 | `'Pedido'` fora do fim do export | **(l)** `Object.keys` |

- [ ] **Step 6: commit** — `git add client/src/components/Compras.js client/src/components/Compras.test.js`. Mensagem em `msg-e41-t4.txt`.

---

### Task 5: a integração que cruza — pela ROTA e pelo SERVIÇO, até o recebimento **(tronco, depois de integrar T2–T4)**

**Files:**
- Test: `server/tests/api/comprasCotacaoPedidoIntegracao.api.test.js` (novo)

**Interfaces:** consome T1–T2, `POST /api/compras/fornecedores` (payload da tela da 40), `GET /api/almoxarifado/recebimentos-aux/pedidos-compra?pendentes=1` (`extended.js:1116`), `PUT`/`DELETE /api/compras/pedidos/:id`.

- [ ] **Step 1: o teste** (`ADMIN` id 102):

```js
  await test('(A) pela ROTA: fornecedor (tela da 40) -> cotacao com 2 itens -> gerar -> pedido na lista e no aux do recebimento com saldo cheio -> 409 na segunda -> DELETE cotacao 409 -> PUT pedido 200 -> DELETE pedido 200 -> pedido_id FICA -> DELETE cotacao AINDA 409', async () => {
    const f = await request(app).post('/api/compras/fornecedores').send({ razao_social: 'Integração E41', nome_fantasia: '', cnpj: '', contato: '', email: '', telefone: '', endereco: '', grupo_id: '' });
    assert.strictEqual(f.status, 201);
    const c = await request(app).post('/api/compras/cotacoes').send({ numero: 'COT-E41-INT', fornecedor_id: f.body.id, data_cotacao: '2026-09-22', validade: '', status: 'em_analise', observacoes: 'frete incluso',
      itens: [{ material_id: mA, quantidade: 2, valor_unitario: 10 }, { material_id: mB, quantidade: 1, valor_unitario: 5 }] });
    assert.strictEqual(c.status, 201, JSON.stringify(c.body));
    assert.strictEqual(c.body.valor_total, 25);
    const g = await request(app).post(`/api/compras/cotacoes/${c.body.id}/gerar-pedido`).send();
    assert.strictEqual(g.status, 201, JSON.stringify(g.body));
    assert.strictEqual(g.body.observacoes, 'frete incluso');
    // o pedido gerado e um pedido NORMAL: lista de Compras e aux do recebimento da Etapa 37
    const lista = await request(app).get('/api/compras/pedidos');
    assert.ok(lista.body.some((p) => p.id === g.body.id && p.valor_total === 25));
    const aux = await request(app).get('/api/almoxarifado/recebimentos-aux/pedidos-compra?pendentes=1');
    assert.strictEqual(aux.status, 200, JSON.stringify(aux.body));
    const noAux = (aux.body || []).find((p) => p.id === g.body.id);
    assert.ok(noAux, 'o pedido gerado tem de aparecer para o recebimento');
    assert.strictEqual(noAux.saldo_pendente, 3, `saldo cheio (2+1): ${JSON.stringify(noAux)}`);
    // segunda conversao
    const g2 = await request(app).post(`/api/compras/cotacoes/${c.body.id}/gerar-pedido`).send();
    assert.strictEqual(g2.status, 409);
    // lixeira da cotacao convertida
    assert.strictEqual((await request(app).delete(`/api/compras/cotacoes/${c.body.id}`)).status, 409);
    // o pedido pode ser editado (troca a quantidade) e excluido
    const put = await request(app).put(`/api/compras/pedidos/${g.body.id}`).send({ fornecedor_id: f.body.id, itens: [{ material_id: mA, quantidade: 5, valor_unitario: 10 }] });
    assert.strictEqual(put.status, 200, JSON.stringify(put.body));
    assert.strictEqual((await request(app).delete(`/api/compras/pedidos/${g.body.id}`)).status, 200);
    // RN-F12: o vinculo FICA (rastro) — e por isso a cotacao continua nao-excluivel. Declarado (letra G);
    // este cenario existe para ninguem "consertar" sem saber.
    const depois = await request(app).get(`/api/compras/cotacoes/${c.body.id}`);
    assert.strictEqual(depois.body.pedido_id, g.body.id);
    assert.strictEqual(depois.body.pedido_numero, null, 'o LEFT JOIN nao acha mais o pedido');
    assert.strictEqual((await request(app).delete(`/api/compras/cotacoes/${c.body.id}`)).status, 409);
  });
  await test('(B) pelo SERVICO: criarCotacao com itens + gerarPedidoDaCotacao, e a rota le o mesmo', async () => { /* cria por cotacaoService, gera por cotacaoService, GET /pedidos/:id e GET /cotacoes/:id batem */ });
  await test('(C) RN-F11 pela rota: inativa pelo PUT da 40 -> gerar 400 literal -> reativa -> 201', async () => { /* PUT /fornecedores/:id com status inativo (7 textos + status) -> gerar 400 -> PUT ativo -> 201 */ });
```

⚠️ Confira em `extended.js:1116-1136` e `pedidoCompraService`/`receiptService.listarPedidosCompraAux` o nome
exato do campo de saldo (`saldo_pendente`, design da 37) e se a rota aux exige perfil (gate `auth` só) —
o `ADMIN` do harness passa por tudo.

- [ ] **Step 2: rodar** — 3 verdes (integração). Controle positivo: a sabotagem 3 da T2 (sem o `if (c.pedido_id != null)`) tem de derrubar (A) em *"segunda conversao"* (409 → 201).

- [ ] **Step 3: os cinco comandos** — `test:api` **194/194**; almoxarifado 42; 4/3/5; client **51 suítes / 778** (769 + 6 + 3); build.

- [ ] **Step 4: commit** — `git add server/tests/api/comprasCotacaoPedidoIntegracao.api.test.js`. Mensagem em `msg-e41-t5.txt`.

---

### Task 6: fechamento (use a skill `fechar-etapa`)

Os 7 artefatos + planos: novidades (seção da 41; letras **A18** (PRAGMAs pós-boot) e **A19** (órfãos), **B141–B152** (D1–D12), **C** nenhum novo, **D/G** (seção 8 do design + `pedido_id` de pedido apagado + `UPDATE` do vínculo sem transação + `comprasPedidoEditarExcluir:93` frase morta), item em "Onde estamos"); guia (roteiro: criar cotação com 2 itens → gerar pedido → conferir a edição do pedido → voltar e ver a coluna Pedido → tentar de novo pela API → excluir); manual (seção de cotação: itens, total, "Gerar pedido", o que Inativo/rejeitado fazem); `specs/modulo-compras/README.md:70` ("cotação não tem filhos" — **era verdade até a 40**), `22-integracoes` (o "falta para 🟢" desta fatia: o que sobra), mapa; design com "Como foi executado"; este plano com retro e a próxima tarefa (pela ordem do CLAUDE.md — medir); retro nº 4 do plano da 40 (defeito escapado — preencher com o que a Fase 0 da 41 achou de errado no handoff da 40: as 6 correções da seção 11 do design da 41).

---

## Self-review

**1. Cobertura:** D1 (T1–T5), D2 (T1 (p), T2 (3)), D3 (T2 (2)(3), T3 (i)(j)(k)), D4 (T1 Step 3-4), D5 (T2 gerar + T4), D6 (T1 Step 4, T2 (1)(6)), D7 (T2 gerar (1)(4)), D8 (T2 gerar (5), T5 (C)), D9 (T2 itens (7)(8)(10), sabotagem 5), D10 (T3), D11 (T4), D12 (sort). RN-F01–F14 na tabela com prova. §8 nada implementa.

**2. Placeholders:** o `colunas(dados)` da T2 diz "igual à 40" e o `INSERT`/`UPDATE` estão elididos com `(…)` — **são o código de hoje** em `cotacaoService.js:36-46`, `:63-64`, `:75-77`, que o executor reescreve mantendo as mesmas colunas; os cenários (B)/(C) da T5 estão em prosa com o gesto exato — o executor escreve o código no molde do (A). Nada mais.

**3. Nomes:** `resolverItens`, `CotacaoItemSchema`, as 4 literais, `excluirCotacao`, `gerarPedidoDaCotacao`, `COTACAO_EXCLUIDA`, `cotacaoJaGerouPedido`/`…Exclusao` — iguais no design §5.3, na T1, na T2 e nas asserções; `data-testid` da T3 iguais ao §5.5; `gerar-pedido-${id}` na T4 e no §5.5; `pedido_numero` na lista (T2 (6)) e na T4.

**4. Para a Fase 2 refutar:** (i) `atualizarCotacao` sem `itens` **apaga** — é o que a tela manda (`itens: []` sempre) e o que o (e) da 40 ajustado espera; mas um `PUT` externo só de cabeçalho perde as linhas: decisão D3/RN-F05, confirmar que está na letra B; (ii) `gerarPedidoDaCotacao` passa `observacoes` e **não** passa `data_pedido`/`previsao_entrega` — `criarPedido` põe default? (medir `:320-343`); (iii) o `LEFT JOIN pedidos_compra` na lista e em `SELECT_LINHA` com o alias `p` — o `SELECT c.*` da lista traz `pedido_id` de `cotacoes` e não colide com `p.id`? (iv) a rota aux do recebimento lista pedido com `status` `pendente` — `criarPedido` grava `pendente` por default? (v) RN traçadas até o último gesto: gerar → editar pedido → receber (E37) → o custo médio herda o preço da cotação — cadeia medida na Fase 0 §5, nada a mudar.

---

## Retro de 4 números (preencher na T6)

1. **Rodadas de correção até verde:** …
2. **Achados da revisão (Fase 2 + Fase 5):** …
3. **Paralelismo:** T2/T3/T4 em três worktrees — conflitos? A interrupção por limite de sessão da 40 repetiu?
4. **Defeito escapado:** *(em branco — a Etapa 42 preenche olhando para trás.)*
