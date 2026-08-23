# Etapa 10b — Inventário avançado, parte 2 — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** entregar os cortes viáveis da Etapa 10 — escopos de contagem combináveis, dupla
contagem por duas pessoas e relatório de acuracidade — sem tocar no motor de estoque.

**Architecture:** tudo é camada de rota + colunas novas por `safeAlter`. Escopo = WHERE extra
na criação da conferência sobre colunas que já existem no material; dupla contagem = checagem
única no `PUT /item` com autoria gravada por item; acuracidade = leitura derivada dos itens
imutáveis pós-conclusão + impacto financeiro persistido na conclusão. `stockService` **não é
tocado** nesta etapa.

**Tech Stack:** Express + SQLite (callback API via `dbGet`/`dbAll`/`dbRun`), harness
`tests/helpers/testApp.js` (runner próprio por arquivo, `requirePermission` real), React CRA.

**Spec:** `docs/superpowers/specs/2026-08-23-almoxarifado-etapa10b-inventario-avancado-2-design.md`
(RN-01..RN-07 e D1..D11 estão lá; as mensagens literais deste plano vêm de lá e são contrato).

## Global Constraints

- Mensagens literais congeladas (não parafrasear):
  - 400 escopo: `Classe ABC inválida (use A, B ou C)`
  - 400 dupla contagem: `Dupla contagem: a recontagem deve ser feita por outra pessoa (primeira contagem: <nome>)`
- Todo o fluxo fica sob `requirePermission('inventario')`; o relatório novo idem (RN-07).
- Colunas novas **só** por `safeAlter`; zero migração destrutiva; conferências antigas (colunas
  nulas) mantêm o comportamento de hoje.
- Teste novo que passa de primeira exige **controle positivo** (sabotagem que o derruba,
  restauração provada por md5). Lição G5: teste que depende de conjunto/ordem força o cenário
  explicitamente.
- Commits em português, corpo sem acento, um assunto por commit, nunca `git add -A` na raiz.
- Rodar `cd server && npm run test:api` antes de cada commit de backend; suíte client no galho
  do front.

## Sort topológico

| Task | O quê | Classe |
|---|---|---|
| 1 | colunas novas + escopo combinável no POST (RN-01/RN-02) | **tronco** |
| 2 | dupla contagem + autoria no PUT /item (RN-03/RN-04) | **tronco** (depois da 1) |
| 3 | impacto persistido + relatório de acuracidade (RN-05/06/07) | **tronco** (depois da 2) |
| 4 | tela: escopo, dupla contagem, autoria, visão Acuracidade | **galho** (worktree, após 3) |
| 5 | teste-jornada de integração cruzando 1+2+3 | **galho** (árvore principal, paralelo à 4) |
| 6 | fechar-etapa (7 artefatos + verificação medida) | final |

Tasks 1–3 mexem nos mesmos arquivos (`schema.js`, `routes/almoxarifado.js`) — tronco
sequencial. Task 4 (front) roda em worktree isolada contra o contrato congelado; Task 5 só
consome o backend já commitado e roda na árvore principal — é o par paralelo real da etapa.

---

### Task 1: Escopo combinável na criação da conferência (RN-01, RN-02)

**Files:**
- Modify: `server/services/almoxarifado/schema.js` (bloco de `safeAlter` da Etapa 10, ~linha 1719)
- Modify: `server/routes/almoxarifado.js` — `POST /conferencias` (~linhas 745–810)
- Test: `server/tests/api/conferenciaEscopo.api.test.js` (novo)

**Interfaces:**
- Consumes: colunas existentes de `materiais_almoxarifado` (`categoria`, `familia_id`,
  `classe_abc`, `material_critico`, `proprietario_cliente_id`, `quantidade_em_terceiros`).
- Produces: colunas `conferencias_almoxarifado.escopo_descricao TEXT`,
  `.dupla_contagem INTEGER DEFAULT 0`, `.impacto_financeiro REAL`;
  `itens_conferencia_almoxarifado.contado_por_id/contado_por_nome/recontado_por_id/recontado_por_nome`
  (as colunas de item são usadas pela Task 2; as de conferência pelas Tasks 2 e 3 — o schema
  muda **uma vez só**, aqui). Body novo do POST: `familia_id`, `classe_abc`,
  `apenas_criticos`, `apenas_de_clientes`, `apenas_em_terceiros`, `dupla_contagem`. 201 ecoa
  `escopo_descricao` e `dupla_contagem`.

- [ ] **Step 1: colunas novas no schema**

Em `schema.js`, logo depois do `safeAlter` de `recontado` (Etapa 10):

```js
  // Etapa 10b (Task 1 — só as colunas; quem as usa são as Tasks 1-3): escopo_descricao (RN-01)
  // guarda a descrição legível do escopo com que a conferência foi criada; dupla_contagem
  // (RN-03) exige recontagem por OUTRA pessoa; impacto_financeiro (RN-05) persiste na
  // conclusão o que a Etapa 10 calculava e jogava fora. Autoria por item (RN-04): primeira
  // contagem preenche contado_por_*, cada contagem seguinte sobrescreve recontado_por_*.
  await safeAlter(db, 'ALTER TABLE conferencias_almoxarifado ADD COLUMN escopo_descricao TEXT');
  await safeAlter(db, 'ALTER TABLE conferencias_almoxarifado ADD COLUMN dupla_contagem INTEGER DEFAULT 0');
  await safeAlter(db, 'ALTER TABLE conferencias_almoxarifado ADD COLUMN impacto_financeiro REAL');
  await safeAlter(db, 'ALTER TABLE itens_conferencia_almoxarifado ADD COLUMN contado_por_id INTEGER');
  await safeAlter(db, 'ALTER TABLE itens_conferencia_almoxarifado ADD COLUMN contado_por_nome TEXT');
  await safeAlter(db, 'ALTER TABLE itens_conferencia_almoxarifado ADD COLUMN recontado_por_id INTEGER');
  await safeAlter(db, 'ALTER TABLE itens_conferencia_almoxarifado ADD COLUMN recontado_por_nome TEXT');
```

- [ ] **Step 2: teste vermelho — `conferenciaEscopo.api.test.js`**

Modelo de harness: copie o cabeçalho de `conferenciaContagemCega.api.test.js` (runner
`test()`, contadores, `createTestApp`, usuários `ADMIN`/`ALMOXARIFE`). Helper de material com
os campos de escopo:

```js
let seq = 0;
async function novoMaterial(db, { qtd = 100, categoria = null, familia_id = null, classe_abc = null,
  critico = 0, cliente_id = null, em_terceiros = 0 } = {}) {
  seq += 1;
  const codigo = `ESC-${seq}`;
  const r = await dbRun(db, `INSERT INTO materiais_almoxarifado
      (codigo, nome, unidade, quantidade_atual, ativo, categoria, familia_id, classe_abc,
       material_critico, proprietario_cliente_id, quantidade_em_terceiros)
     VALUES (?,?,'UN',?,1,?,?,?,?,?,?)`,
    [codigo, `Material Escopo ${seq}`, qtd, categoria, familia_id, classe_abc, critico, cliente_id, em_terceiros]);
  return { id: r.lastID, codigo };
}
async function itensDaConferencia(db, confId) {
  return dbAll(db, `SELECT * FROM itens_conferencia_almoxarifado WHERE conferencia_id = ?`, [confId]);
}
```

Isolamento (o banco é compartilhado entre os testes do arquivo e a conferência sem filtro pega
**todos** os materiais ativos): cada teste usa um valor de filtro **único** (categoria
`CAT-RN01-A`, família própria, etc.) e afere `totalItens` + os `material_id` dos itens.

Testes (todos com `assert` na mensagem/status exatos):

1. `RN-01: classe_abc invalida recusa 400 com a mensagem literal` — `classe_abc: 'X'` →
   status 400, `error === 'Classe ABC inválida (use A, B ou C)'`.
2. `RN-01: classe minuscula vale e filtra como maiuscula` — dois materiais
   (`classe_abc: 'A'` e `'B'`), POST `{ classe_abc: 'a', categoria: '<única>' }` →
   `totalItens: 1`, item aponta o material A.
3. `RN-01: familia_id filtra` — cria família (`INSERT INTO familias_material_almoxarifado
   (nome) VALUES ('Fam RN01')`), material dentro e fora, POST `{ familia_id }` → só o de
   dentro. Confirma `escopo_descricao === 'Família: Fam RN01'`.
4. `RN-01: apenas_criticos e apenas_de_clientes filtram` — precisa de um cliente:
   `INSERT INTO clientes (razao_social) VALUES ('Cliente Escopo')` (adapte às colunas NOT
   NULL da tabela se houver — leia o schema de `clientes` antes). Material crítico + de
   cliente vs. normal; POST combinando `{ apenas_criticos: true, apenas_de_clientes: true,
   categoria: '<única>' }` → só o que é as duas coisas.
5. `RN-02: apenas_em_terceiros limita a retencao > 0 e o esperado desconta` — material com
   `qtd: 50, em_terceiros: 20` e outro com `em_terceiros: 0`, mesma categoria única; POST
   `{ apenas_em_terceiros: true, categoria }` → 1 item, com `quantidade_sistema === 30`
   (50 − 20: a regra da 8b continua).
6. `RN-01: escopo_descricao combinada na ordem fixa` — POST `{ categoria: 'CAT-DESC',
   classe_abc: 'A', apenas_criticos: true }` → `escopo_descricao ===
   'Categoria: CAT-DESC + Classe A + Somente críticos'`. E POST `{}` → `'Geral'`.
7. `RN-01: filtro sem match cria vazia com totalItens 0` — categoria inexistente → 201,
   `totalItens: 0`, `escopo_descricao` presente.
8. `RN-01: dupla_contagem ecoada no 201` — POST `{ dupla_contagem: true }` →
   `dupla_contagem: 1`; POST `{}` → `dupla_contagem: 0`.

- [ ] **Step 3: rodar e ver falhar** — `cd server && node tests/api/conferenciaEscopo.api.test.js`
  Esperado: falhas por `escopo_descricao === undefined` / filtros ignorados (`totalItens`
  maior que o esperado) / 201 onde deveria ser 400.

- [ ] **Step 4: implementação no POST /conferencias**

Destructuring novo + validação de classe (antes de gerar `numero`):

```js
      const { observacoes, categoria, modo_cego, tolerancia_percentual,
              familia_id, classe_abc, apenas_criticos, apenas_de_clientes,
              apenas_em_terceiros, dupla_contagem } = req.body;

      // RN-01 (10b): classe ABC é o único filtro de domínio fechado — valor fora de A/B/C é
      // 400. Os demais filtros que não casam nada só geram conferência vazia, mesmo
      // comportamento que `categoria` inexistente sempre teve.
      let classeAbc = null;
      if (classe_abc !== undefined && classe_abc !== null && classe_abc !== '') {
        classeAbc = String(classe_abc).toUpperCase();
        if (!['A', 'B', 'C'].includes(classeAbc)) {
          return res.status(400).json({ error: 'Classe ABC inválida (use A, B ou C)' });
        }
      }
```

Depois do cálculo de `toleranciaValor`, a descrição do escopo (RN-01 — ordem fixa, `" + "`):

```js
      const partesEscopo = [];
      if (categoria) partesEscopo.push(`Categoria: ${categoria}`);
      if (familia_id) {
        const fam = await dbGet(db, `SELECT nome FROM familias_material_almoxarifado WHERE id = ?`, [familia_id]);
        partesEscopo.push(`Família: ${fam?.nome || `#${familia_id}`}`);
      }
      if (classeAbc) partesEscopo.push(`Classe ${classeAbc}`);
      if (apenas_criticos) partesEscopo.push('Somente críticos');
      if (apenas_de_clientes) partesEscopo.push('Materiais de clientes');
      if (apenas_em_terceiros) partesEscopo.push('Com saldo em terceiros');
      const escopoDescricao = partesEscopo.length > 0 ? partesEscopo.join(' + ') : 'Geral';
      const duplaContagemValor = dupla_contagem ? 1 : 0;
```

INSERT da conferência ganha as duas colunas:

```js
      const ins = await dbRun(db, `INSERT INTO conferencias_almoxarifado
              (numero, status, responsavel_id, responsavel_nome, observacoes, modo_cego,
               tolerancia_percentual, dupla_contagem, escopo_descricao)
              VALUES (?, 'ABERTO', ?, ?, ?, ?, ?, ?, ?)`,
        [numero, req.user.id, req.user.nome || req.user.email, observacoes || null,
         modoCegoValor, toleranciaValor, duplaContagemValor, escopoDescricao]);
```

WHERE (depois do `if (categoria)` existente — manter o comentário da 8b sobre o esperado
intacto):

```js
      if (categoria) { sql += ` AND categoria = ?`; params.push(categoria); }
      if (familia_id) { sql += ` AND familia_id = ?`; params.push(familia_id); }
      if (classeAbc) { sql += ` AND classe_abc = ?`; params.push(classeAbc); }
      if (apenas_criticos) { sql += ` AND material_critico = 1`; }
      if (apenas_de_clientes) { sql += ` AND proprietario_cliente_id IS NOT NULL`; }
      // RN-02 (10b): escopo "em terceiros" = tem retenção fora do prédio. O esperado continua
      // sendo o que está NO prédio (o SELECT acima já desconta — regra da 8b, inalterada).
      if (apenas_em_terceiros) { sql += ` AND COALESCE(quantidade_em_terceiros, 0) > 0`; }
```

As **duas** respostas 201 (ramo vazio e ramo normal) ganham
`dupla_contagem: duplaContagemValor, escopo_descricao: escopoDescricao`.

- [ ] **Step 5: rodar até verde** — o arquivo novo + `node tests/api/conferenciaContagemCega.api.test.js`
  + `node tests/api/conferenciaTolerancia.api.test.js` (regressão vizinha).

- [ ] **Step 6: controle positivo** — sabotagem: remover a linha
  `if (apenas_em_terceiros) ...` (checar `grep -cF "apenas_em_terceiros) { sql" ` = 1 antes do
  `sed`); rodar → o teste 5 tem de cair (`totalItens` 2 ≠ 1). Restaurar; `md5sum` antes/depois
  idêntico; `git diff --stat` da rota só com a mudança intencional.

- [ ] **Step 7: suíte inteira + commit**

```bash
cd server && npm run test:api
git add server/services/almoxarifado/schema.js server/routes/almoxarifado.js server/tests/api/conferenciaEscopo.api.test.js
git commit -m "Almoxarifado Etapa 10b Task 1: escopo combinavel na conferencia"
```

(Corpo do commit: por que escopo é filtro sobre coluna existente e não enum — D1 do design.)

---

### Task 2: Dupla contagem por duas pessoas + autoria (RN-03, RN-04)

**Files:**
- Modify: `server/routes/almoxarifado.js` — `PUT /conferencias/:id/item/:itemId` (~linhas 812–849)
- Test: `server/tests/api/conferenciaDuplaContagem.api.test.js` (novo)

**Interfaces:**
- Consumes: colunas da Task 1 (`conferencias.dupla_contagem`, `itens.contado_por_*`,
  `itens.recontado_por_*`).
- Produces: comportamento novo do `PUT /item` — autoria gravada sempre; 400 literal quando o
  primeiro contador reconta numa conferência com `dupla_contagem`. `GET /conferencias/:id` já
  ecoa as colunas novas por arrastão (`SELECT ic.*` — nenhuma mudança necessária no GET; o
  teste prova).

- [ ] **Step 1: teste vermelho — `conferenciaDuplaContagem.api.test.js`**

Mesmo harness; usuários `ALMOXARIFE` (id 3) e `GESTOR` (id 2) para alternar com `setUser`.
Helper `contarItem`:

```js
async function contarItem(app, confId, itemId, quantidade) {
  return request(app).put(`/api/almoxarifado/conferencias/${confId}/item/${itemId}`)
    .send({ quantidade_contada: quantidade });
}
```

Testes:

1. `RN-04: primeira contagem grava contado_por e o GET ecoa` — sem flag; `setUser(ALMOXARIFE)`,
   contar; item no banco tem `contado_por_id === 3`, `contado_por_nome === 'Almoxarife'`,
   `recontado_por_id === null`; `GET /conferencias/:id` traz os 4 campos no item.
2. `RN-04: recontagem grava recontado_por sem tocar contado_por` — `setUser(GESTOR)`, contar
   de novo → `recontado_por_id === 2`, `contado_por_id` continua 3, resposta
   `recontagem: true`.
3. `RN-03: com dupla_contagem o primeiro contador nao reconta — 400 literal` — conferência
   com `dupla_contagem: true`; ALMOXARIFE conta; ALMOXARIFE tenta recontar → status 400,
   `error === 'Dupla contagem: a recontagem deve ser feita por outra pessoa (primeira contagem: Almoxarife)'`.
4. `RN-03: outra pessoa reconta normalmente` — na mesma conferência, `setUser(GESTOR)` →
   200, `recontagem: true`, `recontado = 1` no banco.
5. `RN-03: o primeiro contador segue barrado na terceira contagem` — após o GESTOR recontar,
   ALMOXARIFE tenta de novo → 400 (a comparação é contra o PRIMEIRO contador, não o
   anterior — senão ele sobrescreveria a recontagem do colega).
6. `[CONTROLE] sem a flag, a mesma pessoa reconta como na Etapa 10` — conferência sem
   `dupla_contagem`; ALMOXARIFE conta e reconta → 200 nas duas.

- [ ] **Step 2: rodar e ver falhar** — falhas: autoria `null`, 200 onde deveria ser 400.

- [ ] **Step 3: implementação no PUT /item**

O `SELECT status` do gate RN-03 (Etapa 10) passa a trazer a flag:

```js
      const conf = await dbGet(db, `SELECT status, dupla_contagem FROM conferencias_almoxarifado WHERE id = ?`, [req.params.id]);
```

Depois de `const ehRecontagem = item.quantidade_contada !== null;` (manter o comentário RN-04
da Etapa 10):

```js
      // RN-03 (10b): dupla contagem — o autor da PRIMEIRA contagem nunca reconta. A comparação
      // é sempre contra contado_por_id (não o contador anterior): senão o primeiro contador
      // poderia sobrescrever a recontagem do colega e anular os quatro olhos.
      if (ehRecontagem && conf.dupla_contagem && item.contado_por_id === req.user.id) {
        return res.status(400).json({
          error: `Dupla contagem: a recontagem deve ser feita por outra pessoa (primeira contagem: ${item.contado_por_nome})`,
        });
      }

      // RN-04 (10b): autoria sempre gravada, flag ou não — primeira contagem em contado_por_*,
      // cada contagem seguinte sobrescreve recontado_por_* (fica o último recontador).
      const autorNome = req.user.nome || req.user.email;
      const camposAutoria = ehRecontagem
        ? ', recontado_por_id = ?, recontado_por_nome = ?'
        : ', contado_por_id = ?, contado_por_nome = ?';
```

E o UPDATE existente vira:

```js
      await dbRun(db, `UPDATE itens_conferencia_almoxarifado
              SET quantidade_contada = ?, divergencia = ?, observacoes = ?${ehRecontagem ? ', recontado = 1' : ''}${camposAutoria}
              WHERE id = ?`,
        [quantidade_contada, divergencia, observacoes || null, req.user.id, autorNome, req.params.itemId]);
```

(Atenção à ordem dos params: os dois `?` de autoria entram **antes** do `id` final.)

- [ ] **Step 4: rodar até verde** — arquivo novo + `conferenciaContagemCega` +
  `conferenciaTolerancia` (o UPDATE mudou de forma — regressão obrigatória).

- [ ] **Step 5: controle positivo** — sabotagem: trocar `item.contado_por_id === req.user.id`
  por `false` (âncora única conferida com `grep -cF`) → testes 3 e 5 caem. Restaurar, md5.

- [ ] **Step 6: suíte + commit**

```bash
cd server && npm run test:api
git add server/routes/almoxarifado.js server/tests/api/conferenciaDuplaContagem.api.test.js
git commit -m "Almoxarifado Etapa 10b Task 2: dupla contagem por duas pessoas e autoria por item"
```

---

### Task 3: Impacto financeiro persistido + relatório de acuracidade (RN-05, RN-06, RN-07)

**Files:**
- Modify: `server/routes/almoxarifado.js` — `PUT /concluir` (~linhas 872–1021) e rota nova
  **antes** de `GET /conferencias/:id` (~linha 701)
- Test: `server/tests/api/conferenciaAcuracidade.api.test.js` (novo)

**Interfaces:**
- Consumes: colunas da Task 1 (`impacto_financeiro`, `escopo_descricao`, `dupla_contagem`);
  `custoUnitarioSql()` de `services/almoxarifado/custoSql.js` (já importado na rota).
- Produces: `GET /api/almoxarifado/conferencias/relatorio-acuracidade` →
  `{ conferencias: [...], agregado: {...} }` (contrato no design); `PUT /concluir` grava
  `impacto_financeiro` e responde `impactoFinanceiro` **sempre** calculado.

- [ ] **Step 1: teste vermelho — `conferenciaAcuracidade.api.test.js`**

Harness padrão + um usuário `PRODUCAO = { id: 9, nome: 'Chao de Fabrica', role: 'usuario',
email: 'prod@test.com' }` (sem `perfil_almoxarifado` — o fallback é PRODUCAO e `inventario`
recusa). Para concluir sem esbarrar na recontagem, crie as conferências com
`tolerancia_percentual: 100000` e categoria única por teste.

```js
async function concluir(app, confId, body = {}) {
  return request(app).put(`/api/almoxarifado/conferencias/${confId}/concluir`).send(body);
}
async function relatorio(app) {
  return request(app).get('/api/almoxarifado/conferencias/relatorio-acuracidade');
}
```

Testes:

1. `RN-05: concluir com aplicar_ajustes persiste impacto_financeiro` — material com
   `custo_unitario = 10` (colunas do INSERT: acrescente `custo_unitario` ao helper), qtd 100,
   contar 90 → concluir `{ aplicar_ajustes: true, justificativa_ajuste: 'ajuste 10b' }` →
   resposta `impactoFinanceiro === 100` (|−10| × 10) e
   `SELECT impacto_financeiro FROM conferencias_almoxarifado` === 100.
2. `RN-05: concluir SEM aplicar tambem calcula e persiste` — mesmo cenário, concluir `{}` →
   resposta `impactoFinanceiro === 100` (mudança declarada: a Etapa 10 respondia 0 aqui) e
   coluna === 100; **e o saldo do material NÃO mudou** (continua 100 — não aplicou).
3. `RN-06: metricas por conferencia com numeros conhecidos` — 3 materiais na categoria única;
   contar 2 (um exato, um divergente), 1 sem contar; concluir `{}`; relatório: a linha da
   conferência tem `total_itens 3, contados 2, exatos 1, divergentes 1, acuracidade 50` e
   `escopo_descricao` da criação.
4. `RN-06: conferencia concluida sem contagem tem acuracidade null e contados 0` — concluir
   direto; linha: `contados === 0` (o COALESCE — não null), `acuracidade === null`.
5. `RN-06: impacto nulo de conferencia antiga aparece como null` — concluir, depois
   `UPDATE conferencias_almoxarifado SET impacto_financeiro = NULL` (simula pré-10b);
   relatório: `impacto_financeiro === null`.
6. `RN-06: so CONCLUIDO entra` — uma ABERTO e uma CANCELADO (PUT /cancelar) não aparecem
   no relatório (procure pelos `numero`).
7. `RN-06: agregado e ponderado por item contado` — duas conferências: A com 4 contados/4
   exatos, B com 1 contado/0 exatos → média simples seria 50; o agregado tem de dar
   `acuracidade === 80` (5 contados, 4 exatos). O teste **força o conjunto**: afere sobre os
   totais do agregado (`contados`, `exatos`) e não assume que só existem essas duas
   conferências no banco — calcule o esperado a partir do próprio payload
   (`Number((Σexatos/Σcontados*100).toFixed(2))`) e afira que A e B estão nas linhas.
8. `RN-07: sem perfil e 403` — `setUser(PRODUCAO)` → status 403.

- [ ] **Step 2: rodar e ver falhar** — 404 na rota nova; coluna nula no teste 1.

- [ ] **Step 3: implementação**

**(a) `PUT /concluir`** — o impacto sai do loop de aplicação e vira cálculo incondicional.
Logo depois de `const ajustes = todosItens.filter((i) => i.divergencia !== 0);`:

```js
      // RN-05 (10b): impacto financeiro SEMPRE calculado — com ou sem aplicar_ajustes — sobre
      // os itens contados divergentes. "O inventário achou R$ X de erro" interessa mesmo
      // quando ninguém aplica, e é o que o relatório de acuracidade consome. Fórmula D8 da
      // Etapa 10 (valores ABSOLUTOS), custo pela fonte única (custoSql.js).
      let impactoFinanceiro = 0;
      for (const item of ajustes) {
        const custoRow = await dbGet(db,
          `SELECT ${custoUnitarioSql()} AS custo FROM materiais_almoxarifado WHERE id = ?`, [item.material_id]);
        impactoFinanceiro += Math.abs(item.divergencia) * (custoRow?.custo || 0);
      }
```

Remover do bloco de aplicação real: o `let impactoFinanceiro = 0;` antigo, o `const custoRow
= ...` e o `impactoFinanceiro += ...` de dentro do loop (o comentário D8 ali migra para o
bloco novo). `ajustesAplicados` e `materiaisAjustados` ficam como estão.

O UPDATE final ganha a coluna:

```js
      await dbRun(db, `UPDATE conferencias_almoxarifado
              SET status = 'CONCLUIDO', data_fim = CURRENT_TIMESTAMP, justificativa_ajuste = ?, impacto_financeiro = ?
              WHERE id = ?`, [aplicar_ajustes ? justificativa_ajuste : conf.justificativa_ajuste, impactoFinanceiro, req.params.id]);
```

**(b) rota nova** — inserir **entre** `GET /conferencias` (lista) e `GET /conferencias/:id`:

```js
  // GET /api/almoxarifado/conferencias/relatorio-acuracidade — RN-06/RN-07 (Etapa 10b).
  // Registrada ANTES de GET /conferencias/:id — senão o Express casa "relatorio-acuracidade"
  // como :id. Métricas DERIVADAS dos itens (imutáveis pós-conclusão — D10: acuracidade nunca
  // é persistida; impacto_financeiro é, porque depende do custo do momento).
  app.get('/api/almoxarifado/conferencias/relatorio-acuracidade', requirePermission('inventario'), async (req, res) => {
    try {
      const rows = await dbAll(db, `
        SELECT c.id, c.numero, c.data_fim, c.escopo_descricao, c.modo_cego, c.dupla_contagem,
               c.impacto_financeiro,
               COUNT(ic.id) AS total_itens,
               COALESCE(SUM(CASE WHEN ic.quantidade_contada IS NOT NULL THEN 1 ELSE 0 END), 0) AS contados,
               COALESCE(SUM(CASE WHEN ic.quantidade_contada IS NOT NULL AND ic.divergencia = 0 THEN 1 ELSE 0 END), 0) AS exatos
        FROM conferencias_almoxarifado c
        LEFT JOIN itens_conferencia_almoxarifado ic ON ic.conferencia_id = c.id
        WHERE c.status = 'CONCLUIDO'
        GROUP BY c.id
        ORDER BY c.data_fim DESC, c.id DESC`, []);

      const conferencias = rows.map((r) => ({
        id: r.id, numero: r.numero, data_fim: r.data_fim, escopo_descricao: r.escopo_descricao,
        modo_cego: r.modo_cego, dupla_contagem: r.dupla_contagem,
        total_itens: r.total_itens, contados: r.contados, exatos: r.exatos,
        divergentes: r.contados - r.exatos,
        // RN-06: sem contagem não há acuracidade — 0% mentiria.
        acuracidade: r.contados > 0 ? Number(((r.exatos / r.contados) * 100).toFixed(2)) : null,
        impacto_financeiro: r.impacto_financeiro,
      }));

      const totalContados = conferencias.reduce((s, c) => s + c.contados, 0);
      const totalExatos = conferencias.reduce((s, c) => s + c.exatos, 0);
      const agregado = {
        conferencias: conferencias.length,
        total_itens: conferencias.reduce((s, c) => s + c.total_itens, 0),
        contados: totalContados,
        exatos: totalExatos,
        // RN-06: ponderada por item contado (Σ exatos / Σ contados) — uma conferência de 2
        // itens não pode pesar o mesmo que uma de 200.
        acuracidade: totalContados > 0 ? Number(((totalExatos / totalContados) * 100).toFixed(2)) : null,
      };

      res.json({ conferencias, agregado });
    } catch (e) {
      res.status(e.status || 500).json({ error: e.message });
    }
  });
```

- [ ] **Step 4: rodar até verde** — arquivo novo + **regressão obrigatória**:
  `conferenciaMotorAjuste` (o concluir mudou), `conferenciaTolerancia`,
  `inventarioIntegracao`, `permissoesRotas`.

- [ ] **Step 5: controle positivo** — duas sabotagens independentes: (i) trocar o WHERE do
  relatório para `c.status != ''` → teste 6 cai; (ii) na conta do agregado, trocar a ponderada
  por média simples das porcentagens (`conferencias.reduce((s,c) => s + (c.acuracidade||0), 0)
  / conferencias.length`) → teste 7 cai. Restaurar, md5 idêntico.

- [ ] **Step 6: suíte + commit**

```bash
cd server && npm run test:api
git add server/routes/almoxarifado.js server/tests/api/conferenciaAcuracidade.api.test.js
git commit -m "Almoxarifado Etapa 10b Task 3: impacto persistido e relatorio de acuracidade"
```

(Corpo: declarar a mudança de comportamento do `impactoFinanceiro` sem aplicar — de 0 para o
valor achado — e o porquê.)

---

### Task 4: Tela — escopo, dupla contagem, autoria e visão Acuracidade (galho, worktree)

**Files:**
- Modify: `client/src/components/almoxarifado/ConferenciaEstoque.js`
- Modify: `client/src/components/almoxarifado/ConferenciaEstoque.test.js`

**Interfaces:**
- Consumes (contrato congelado — mock de HTTP nos testes, nunca do motor):
  - `POST /almoxarifado/conferencias` body novo: `familia_id`, `classe_abc`,
    `apenas_criticos`, `apenas_de_clientes`, `apenas_em_terceiros`, `dupla_contagem`; 201 ecoa
    `escopo_descricao`, `dupla_contagem`.
  - `GET /almoxarifado/conferencias` — cada linha agora tem `escopo_descricao` (nulo nas
    antigas → renderizar `—`).
  - `GET /almoxarifado/conferencias/:id` — itens com `contado_por_nome`/`recontado_por_nome`
    (nulos → não renderizar).
  - `PUT .../item/:itemId` — 400 novo com `error` começando com `Dupla contagem:` (exibir o
    texto do servidor, sem parafrasear — padrão já usado no handleConcluir).
  - `GET /almoxarifado/conferencias/relatorio-acuracidade` → `{ conferencias, agregado }`
    (campos no design; `acuracidade`/`impacto_financeiro` nulos → `—`).
  - `GET /almoxarifado/familias` → lista `{ id, nome, parent_id }` (mesma fonte do
    `MaterialAlmoxarifadoForm.js:153`).
- Produces: UI. Nenhum outro componente consome.

- [ ] **Step 1: testes vermelhos (RTL, mock do módulo `api` como os testes existentes do arquivo)**

Acrescentar ao `ConferenciaEstoque.test.js` (seguir os padrões do arquivo — `esperarEfeitos`,
mocks de `api.get`/`api.post`):

1. `RN-01: criar envia os filtros de escopo e dupla_contagem no POST` — abrir o modal de
   criação, marcar classe A, críticos e dupla contagem, submeter; afere
   `api.post.toHaveBeenCalledWith('/almoxarifado/conferencias', expect.objectContaining({
   classe_abc: 'A', apenas_criticos: true, dupla_contagem: true }))`.
2. `lista mostra escopo_descricao e traço quando nulo` — mock da lista com uma conferência
   `escopo_descricao: 'Classe A + Somente críticos'` e outra `null`; os dois renderizam.
3. `RN-04: item mostra contado por e recontado por` — mock do detalhe com
   `contado_por_nome: 'Almoxarife'`, `recontado_por_nome: 'Gestor'`; texto visível.
4. `RN-03: 400 de dupla contagem exibe a mensagem do servidor` — mock do PUT rejeitando com
   `{ response: { status: 400, data: { error: 'Dupla contagem: a recontagem deve ser feita
   por outra pessoa (primeira contagem: Almoxarife)' } } }`; a mensagem aparece.
5. `visao Acuracidade renderiza linhas e agregado com traço para nulos` — mock do relatório
   com uma linha `acuracidade: 98.5, impacto_financeiro: 120` e outra
   `acuracidade: null, impacto_financeiro: null`, agregado `acuracidade: 92.31`; tudo
   renderiza; nulos viram `—`.

- [ ] **Step 2: rodar e ver falhar** —
  `cd client && CI=true npx react-scripts test --watchAll=false ConferenciaEstoque`

- [ ] **Step 3: implementação**

Seguir os padrões do componente (styles inline dos modais, `api` compartilhado, toasts):

- Estados novos: `criarFamilia`, `criarClasseAbc`, `criarCriticos`, `criarDeClientes`,
  `criarEmTerceiros`, `criarDuplaContagem`, `familias` (carregada com
  `api.get('/almoxarifado/familias')` no mount, junto de `loadToleranciaConfigurada`),
  `mostrarAcuracidade`, `relatorioAcuracidade`.
- Modal de criação: select de família (`<option>` por família, value id), select de classe
  (vazio/A/B/C), checkboxes "Somente críticos", "Materiais de clientes", "Com saldo em
  terceiros", "Dupla contagem (recontagem por outra pessoa)". `handleCriar` inclui os campos
  no body **só quando preenchidos** (booleans `true`, ids não vazios).
- Lista: célula/badge `conf.escopo_descricao || '—'`.
- Detalhe do item: linha pequena `Contado por: <nome>` e `· Recontado por: <nome>` quando
  presentes.
- Erro do `handleSalvarContagem`: exibir `err.response?.data?.error` quando houver (o texto
  da dupla contagem vem pronto do servidor).
- Botão "Acuracidade" no cabeçalho da lista → carrega
  `api.get('/almoxarifado/conferencias/relatorio-acuracidade')` e mostra a tabela
  (`numero`, `data_fim`, `escopo_descricao`, contados/exatos/divergentes, `acuracidade`
  formatada `98.50%` ou `—`, `impacto_financeiro` em `R$` ou `—`) + linha de agregado.

- [ ] **Step 4: rodar até verde + build** — a suíte do arquivo, depois
  `CI=true npx react-scripts build`.

- [ ] **Step 5: controle positivo** — sabotagem: no `handleCriar`, deixar de enviar
  `dupla_contagem` → teste 1 cai. Restaurar, md5.

- [ ] **Step 6: commit (na worktree)**

```bash
git add client/src/components/almoxarifado/ConferenciaEstoque.js client/src/components/almoxarifado/ConferenciaEstoque.test.js
git commit -m "Almoxarifado Etapa 10b Task 4: tela de escopo, dupla contagem e acuracidade"
```

---

### Task 5: Teste-jornada de integração (galho, árvore principal)

**Files:**
- Test: `server/tests/api/inventarioEscopoJornada.api.test.js` (novo — só teste, zero produção)

**Interfaces:**
- Consumes: tudo das Tasks 1–3 via HTTP real (supertest + motor real, nunca mock).

- [ ] **Step 1: escrever a jornada (um único `test` longo, padrão de
  `inventarioIntegracao.api.test.js`)**

Cenário (12 passos, cada um com assert de status e dos números):

1. Seed: 3 materiais categoria única `JORNADA-10B` — M1 (`classe_abc 'A'`, crítico,
   `custo_unitario 10`, qtd 100), M2 (`classe_abc 'A'`, crítico, qtd 50), M3 (`classe_abc
   'B'`, NÃO crítico, qtd 30 — o fora-do-escopo de controle).
2. `POST /conferencias` `{ categoria: 'JORNADA-10B', classe_abc: 'A', apenas_criticos: true,
   dupla_contagem: true, modo_cego: true, tolerancia_percentual: 5 }` → 201,
   `totalItens === 2` (M3 ficou fora — RN-01),
   `escopo_descricao === 'Categoria: JORNADA-10B + Classe A + Somente críticos'`.
3. `setUser(ALMOXARIFE)`; `GET /:id` → itens **sem** `quantidade_sistema` (modo cego da
   Etapa 10 continua valendo com escopo novo).
4. ALMOXARIFE conta M1 = 90 (divergência −10, 10% > 5%) e M2 = 50 (exato).
5. `PUT /concluir` (ADMIN) → 400 `Recontagem necessária...` (RN-05 da Etapa 10 compõe).
6. ALMOXARIFE tenta recontar M1 → 400 dupla contagem (RN-03 desta etapa), mensagem literal.
7. `setUser(GESTOR)`; reconta M1 = 90 → 200, `recontagem: true`.
8. `GET /:id` (ADMIN) → item M1 com `contado_por_nome 'Almoxarife'` e
   `recontado_por_nome 'Gestor'` (RN-04).
9. `PUT /concluir { aplicar_ajustes: true, justificativa_ajuste: 'jornada 10b' }` (ADMIN) →
   200, `ajustesAplicados === 1`, `impactoFinanceiro === 100`.
10. Banco: M1 `quantidade_atual === 90`; movimentação `AJUSTE_INVENTARIO` gravada para M1
    (motor real — a jornada cruza a Task 1/2 com o caminho da Etapa 10);
    `conferencias.impacto_financeiro === 100` (RN-05).
11. `GET /relatorio-acuracidade` → a linha da conferência: `contados 2, exatos 1,
    divergentes 1, acuracidade 50, impacto_financeiro 100`, `dupla_contagem 1`,
    `escopo_descricao` do passo 2 (RN-06).
12. `setUser(PRODUCAO)` (sem perfil) → relatório 403 (RN-07).

- [ ] **Step 2: rodar** — se passar de primeira, **desconfiar** e ir ao Step 3 antes de
  comemorar.

- [ ] **Step 3: controle positivo da jornada** — sabotagem no servidor (temporária): trocar,
  no `PUT /item`, a comparação `item.contado_por_id === req.user.id` por `false` → o passo 6
  tem de derrubar a jornada (e as suítes unitárias da Task 2 também — anotar qual cai
  primeiro). Restaurar, md5, rodar de novo verde.

- [ ] **Step 4: suíte + commit**

```bash
cd server && npm run test:api
git add server/tests/api/inventarioEscopoJornada.api.test.js
git commit -m "Almoxarifado Etapa 10b Task 5: jornada de escopo, dupla contagem e acuracidade"
```

---

### Task 6: Fechar a etapa

- [ ] Merge da worktree do front (`git merge --no-ff`), suíte completa serial (os cinco
  comandos da `fechar-etapa`), revisão final de branch (revisores frescos, lentes: correção
  das RN, autorização, "este teste passaria com a feature quebrada?").
- [ ] Skill **`fechar-etapa`** inteira: novidades-por-etapa (seção Etapa 10b + letra B: ruling
  "10b antes da 11" e D2–D8 do design), spec 17 (checklist com hash), mapa do módulo, guia,
  este plano (tasks marcadas + próxima tarefa), manual do sistema (seções 13.x: escopo na
  criação, dupla contagem, relatório de acuracidade — linguagem de usuário, mensagens
  literais conferidas no código).
- [ ] Retro de 4 números no fim deste arquivo.

---

## Self-review do plano (feito na escrita)

- **Cobertura do design:** RN-01/02 → Task 1; RN-03/04 → Task 2; RN-05/06/07 → Task 3; front
  → Task 4; composição → Task 5. D1–D11 não geram task (são cortes/decisões) e vão para a
  documentação na Task 6.
- **Tipos consistentes:** `dupla_contagem`/`escopo_descricao`/`impacto_financeiro` e os quatro
  campos de autoria têm o mesmo nome em schema (Task 1), rotas (Tasks 2–3), contrato do front
  (Task 4) e jornada (Task 5).
- **Armadilhas nomeadas onde existem:** ordem de registro da rota do relatório (Express casa
  `:id`), `COALESCE` nos `SUM` do LEFT JOIN (conferência sem item), ordem dos params no UPDATE
  do PUT /item, isolamento por categoria única nos testes (banco compartilhado), agregado
  ponderado × média simples (sabotagem específica), teste 7 sem assumir banco limpo.
