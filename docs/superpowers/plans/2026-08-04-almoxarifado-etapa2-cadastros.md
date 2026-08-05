# Almoxarifado Etapa 2 — Cadastros Completos — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cadastro de material completo (campos técnicos/reposição/controles/ABC, unidades compra/consumo com fator, subfamílias validadas, auditoria de edição) + multi-almoxarifado como entidade raiz com restrições de endereço aplicadas pelo motor.

**Architecture:** Design aprovado em `docs/superpowers/specs/2026-08-04-almoxarifado-etapa2-cadastros-design.md` (ler primeiro — decisões e modelo de dados). Colunas via `safeAlter`; a vinculação de dados usa o ledger `schema_migrations_almoxarifado` (padrão em `schema.js:228-282`). Rotas tocadas migram para Zod (`validate(schema)`). Enforcement de endereço entra no motor único (`stockService.registrarMovimentacao`).

**Tech Stack:** Node/Express/sqlite3, Zod 4, supertest + `createTestApp`, React CRA (`client/`).

## Global Constraints

- Branch `desenvolvimento-almoxarifado`; nunca commitar na main. `backend/` e `src/` da raiz são código morto.
- DDL/colunas SÓ em `server/services/almoxarifado/schema.js` (guard test proíbe CREATE TABLE em rotas). Migração de DADOS via ledger `schema_migrations_almoxarifado` (padrão idempotente de `schema.js:228-282`).
- Runner caseiro; testes de API em `server/tests/api/*.api.test.js` com `createTestApp` (`{app, db, setUser, close}`; user default admin). Zod via `validate(schema)` de `validation.js`; schemas em `schemas.js`.
- Erros `{ error: '...' }` em português. Regressão completa por task: `cd server && npm run test:api && npm run test:almoxarifado` verdes.
- Commits pequenos, 1/task, português, corpo terminando com `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

## Fatos do código (verificados 2026-08-04, pós-Etapa 1)

| Fato | Onde |
|---|---|
| POST /materiais: destructuring + validações manuais (codigo/nome/familia_id, validateFamiliaAtiva, UNIQUE→400 'Código já existe', saldo inicial vira movimentação, resolveLocalizacaoFromFk) | `server/routes/almoxarifado.js:252-317` |
| PUT /materiais/:id: UPDATE com lista fixa de colunas; valida família só se mudou; sem auditoria | `routes/almoxarifado.js:320-390` |
| DELETE /materiais/:id: soft delete simples | `routes/almoxarifado.js:393-399` |
| CRUD localizações | `routes/almoxarifado.js:817-905` (GET 817, POST 825, PUT 875, DELETE 897) |
| CRUD famílias (gate `denyUnlessAlmoxAdmin`; POST gera código automático; DELETE bloqueia com itens ativos) | `routes/almoxarifado.js:1044-1137` |
| Colunas atuais do material (v3) | `schema.js:343-363` (`materialCols` + tipo_material_id/ponto_pedido/prazo_reposicao_dias) |
| Padrão de migração via ledger (idempotente, marca id, tolera tabela ausente) | `schema.js:228-282` (`migrateHistoricoNullableMaterial`) |
| Localizações: colunas tipo/parent_id/pos_x/pos_y/largura/altura/subgrupo via safeAlter; seed LOCALIZACOES_ALMOX_SEED count-guarded | `schema.js:386-407` |
| Motor: `registrarMovimentacao` valida tipo (whitelist), regras de vínculo, atômico RETURNING; localizações resolvidas em `resolveLocalizacaoEntrada/Saida` e `getOrCreateSaldo`; TRANSFERENCIA valida origem/destino próprios | `stockService.js` |
| `TIPOS_MATERIAL_ENUM` (20 valores) exportado | `schema.js` topo |
| `registrarAuditoria(db, {entidade, entidade_id, acao, usuario_*, dados_anteriores, dados_novos, justificativa})` | `services/almoxarifado/audit.js` |
| `schemas.js` exporta CentroCustoSchema, MovimentacaoSchema, RegularizacaoSchema, CancelamentoSchema | `services/almoxarifado/schemas.js` |
| Front form de material: estado plano com os campos atuais; categorias hardcoded (débito conhecido) | `client/src/components/almoxarifado/MaterialAlmoxarifadoForm.js` |
| Config: `ConfiguracoesAlmoxarifado.js` (~2.500 L, 9 abas; abas Famílias, Setores e Áreas, Localizações) | `client/src/components/almoxarifado/ConfiguracoesAlmoxarifado.js` |
| Mapa 2D consome `/mapa/localizacoes` | `MapaLocalizacoesAlmoxarifado.js`, `extended.js` |

---

### Task 1: Entidade `almoxarifados` + migração ledger + CRUD + filtro nas localizações

**Files:**
- Modify: `server/services/almoxarifado/schema.js` (CREATE TABLE + safeAlter `localizacoes.almoxarifado_id` + migração `criar_almoxarifado_geral`)
- Modify: `server/services/almoxarifado/schemas.js` (+`AlmoxarifadoSchema`)
- Modify: `server/routes/almoxarifado/extended.js` (CRUD)
- Modify: `server/routes/almoxarifado.js` (GET /localizacoes: filtro `?almoxarifado_id=`; POST/PUT aceitam `almoxarifado_id`)
- Test: `server/tests/api/almoxarifados.api.test.js`

**Interfaces:**
- Produces: tabela `almoxarifados(id, codigo UNIQUE NOT NULL, nome NOT NULL, descricao, ativo DEFAULT 1, created_at)`; coluna `localizacoes_almoxarifado.almoxarifado_id`; migração ledger id `'criar_almoxarifado_geral'` que (a) INSERT OR IGNORE do ALM-GERAL, (b) `UPDATE localizacoes_almoxarifado SET almoxarifado_id = <id do geral> WHERE almoxarifado_id IS NULL`, (c) marca o ledger — idempotente no padrão de `schema.js:228-282`; rotas `GET /api/almoxarifado/almoxarifados` (`?todos=1` inclui inativos), `POST` (201/409, gate `requirePermission('configurar')`, `validate(AlmoxarifadoSchema)`), `PUT /:id` (404/200; inativar com localizações ativas vinculadas → 400).
- `AlmoxarifadoSchema = z.object({ codigo: z.string().min(1), nome: z.string().min(1), descricao: z.string().optional(), ativo: z.union([z.literal(0), z.literal(1)]).optional() })`.

- [ ] **Step 1: Teste que falha** — criar `almoxarifados.api.test.js` (runner padrão; helpers como nos irmãos):

```js
  await test('migracao criou o Almoxarifado Geral e vinculou localizacoes existentes', async () => {
    const geral = await dbGet(db, `SELECT * FROM almoxarifados WHERE codigo = 'ALM-GERAL'`);
    assert.ok(geral, 'ALM-GERAL deveria existir via migração');
    const semVinculo = await dbGet(db, `SELECT COUNT(*) as c FROM localizacoes_almoxarifado WHERE almoxarifado_id IS NULL`);
    assert.strictEqual(semVinculo.c, 0, 'todas as localizações (incl. seed) deveriam estar vinculadas');
  });

  await test('POST cria almoxarifado; codigo duplicado 409', async () => {
    const res = await request(app).post('/api/almoxarifado/almoxarifados')
      .send({ codigo: 'ALM-ELET', nome: 'Materiais Elétricos' });
    assert.strictEqual(res.status, 201, JSON.stringify(res.body));
    const dup = await request(app).post('/api/almoxarifado/almoxarifados')
      .send({ codigo: 'ALM-ELET', nome: 'Outro' });
    assert.strictEqual(dup.status, 409);
  });

  await test('POST sem perfil configurar retorna 403', async () => {
    setUser({ id: 9, nome: 'Prod', role: 'user', perfil_almoxarifado: 'PRODUCAO' });
    const res = await request(app).post('/api/almoxarifado/almoxarifados')
      .send({ codigo: 'ALM-X', nome: 'X' });
    assert.strictEqual(res.status, 403);
    setUser({ id: 1, nome: 'Admin Teste', role: 'admin' });
  });

  await test('localizacao criada com almoxarifado_id e filtro por almoxarifado funciona', async () => {
    const alm = await request(app).post('/api/almoxarifado/almoxarifados')
      .send({ codigo: 'ALM-FIX', nome: 'Fixadores' });
    const loc = await request(app).post('/api/almoxarifado/localizacoes')
      .send({ codigo: 'FIX-01', descricao: 'Prateleira fixadores', almoxarifado_id: alm.body.id });
    assert.strictEqual(loc.status, 201, JSON.stringify(loc.body));
    const filtradas = await request(app).get(`/api/almoxarifado/localizacoes?almoxarifado_id=${alm.body.id}`);
    assert.ok(filtradas.body.length === 1 && filtradas.body[0].codigo === 'FIX-01');
  });

  await test('inativar almoxarifado com localizacoes ativas falha 400', async () => {
    const alm = await dbGet(db, `SELECT id FROM almoxarifados WHERE codigo = 'ALM-FIX'`);
    const res = await request(app).put(`/api/almoxarifado/almoxarifados/${alm.id}`).send({ ativo: 0 });
    assert.strictEqual(res.status, 400);
  });
```

(Nota: conferir o status do POST /localizacoes atual — se responder 200/outro shape, ajustar o teste ao contrato real; o objetivo é o vínculo, não mudar contrato.)
- [ ] **Step 2: RED** — rotas 404 / tabela inexistente.
- [ ] **Step 3: Implementar** — schema (CREATE TABLE + safeAlter + função `migrateCriarAlmoxarifadoGeral(db)` chamada no initSchema após as localizações existirem, padrão do ledger); AlmoxarifadoSchema; CRUD em extended.js (espelhar centros-custo: GET/POST/PUT, 409 UNIQUE, PUT valida localizações ativas antes de inativar); GET /localizacoes ganha `if (almoxarifado_id) sql += ' AND l.almoxarifado_id = ?'`; POST/PUT localizações persistem `almoxarifado_id` (default: id do ALM-GERAL quando ausente).
- [ ] **Step 4: GREEN + regressão.**
- [ ] **Step 5: Commit** — `Almoxarifado: entidade almoxarifados como raiz + migracao ledger do ALM-GERAL`

---

### Task 2: Restrições de endereço aplicadas pelo motor

**Files:**
- Modify: `server/services/almoxarifado/schema.js` (safeAlter `bloqueada`, `tipos_material_permitidos`)
- Modify: `server/services/almoxarifado/stockService.js` (validação em `registrarMovimentacao`)
- Modify: `server/routes/almoxarifado.js` (POST/PUT localizações aceitam os campos; DELETE bloqueia com saldo)
- Test: `server/tests/api/restricoesEndereco.api.test.js`

**Interfaces:**
- Produces: helper `validarLocalizacaoParaMovimento(db, localizacaoId, material, papel)` em stockService (papel 'origem'|'destino'): lança 400 se `bloqueada=1` (`Localização <codigo> está bloqueada`); se papel destino e `tipos_material_permitidos` não-nulo e `material.tipo_material` fora da lista → 400. Chamado em `registrarMovimentacao` para locEntrada/locSaida/TRANSFERENCIA (ambas pontas) ANTES de aplicar efeitos. `tipos_material_permitidos` armazenado como JSON array de strings (`JSON.parse` defensivo).
- DELETE /localizacoes/:id: se `SELECT SUM(quantidade) FROM estoque_saldo_almoxarifado WHERE localizacao_id = ?` > 0 → 400 `'Não é possível remover: localização possui saldo'`.

- [ ] **Step 1: Teste que falha** — `restricoesEndereco.api.test.js`: (a) entrada para localização bloqueada → 400 e saldo intacto; (b) saída com origem bloqueada → 400; (c) transferência com destino bloqueado → 400; (d) destino com `tipos_material_permitidos=['Ferramenta']` e material `tipo_material='Consumível'` → 400; material 'Ferramenta' → 201; (e) destino sem restrição aceita qualquer tipo; (f) DELETE localização com saldo → 400; sem saldo → sucesso. (Helpers: criarMaterial com `tipo_material`, criar localizações via API com os campos novos.)
- [ ] **Step 2: RED.**
- [ ] **Step 3: Implementar** — colunas; helper + chamadas no motor (entrada: valida destino resolvido; saída: origem resolvida; transferência: origem E destino); rotas de localização persistem/retornam os campos (PUT parcial preserva); DELETE com checagem de saldo.
- [ ] **Step 4: GREEN + regressão** (atenção: testes antigos criam localizações sem os campos — default NULL/0 não restringe nada).
- [ ] **Step 5: Commit** — `Almoxarifado: bloqueio e restricao de tipos por localizacao aplicados no motor`

---

### Task 3: Famílias hierárquicas (subfamílias) + vínculo no material

**Files:**
- Modify: `server/services/almoxarifado/schema.js` (safeAlter `familias.parent_id`, `materiais.subfamilia_id`)
- Modify: `server/routes/almoxarifado.js` (POST/PUT famílias com parent_id; GET com parent info; POST/PUT materiais validam subfamilia_id)
- Test: `server/tests/api/subfamilias.api.test.js`

**Interfaces:**
- Produces: POST/PUT `/familias` aceitam `parent_id` com validações: pai deve existir e ser raiz (`parent_id IS NULL`) → senão 400 `'Subfamília não pode ter filhos (máximo 2 níveis)'`; família não pode ser pai de si mesma; inativar família com subfamílias ativas → 400. GET /familias retorna `parent_id` e `parent_nome` (LEFT JOIN self). POST/PUT `/materiais`: quando `subfamilia_id` presente, valida `SELECT ... WHERE id = ? AND parent_id = <familia_id do material> AND ativo = 1` → senão 400 `'Subfamília inválida para a família selecionada'`; persiste a coluna.

- [ ] **Step 1: Teste que falha** — `subfamilias.api.test.js`: criar família raiz; criar subfamília com parent_id → 201; criar sub-subfamília (parent = subfamília) → 400; material com familia A + subfamília de B → 400; material com subfamília correta → 201 e coluna persistida; inativar família com subfamília ativa → 400; GET retorna parent_nome.
- [ ] **Step 2: RED.**
- [ ] **Step 3: Implementar** (validações callback-style seguindo o padrão do arquivo; tocar o mínimo nos handlers de materiais — a reescrita Zod completa é a Task 4).
- [ ] **Step 4: GREEN + regressão.**
- [ ] **Step 5: Commit** — `Almoxarifado: subfamilias hierarquicas no cadastro de familias + vinculo validado no material`

---

### Task 4: Material completo — campos novos, Zod e auditoria de edição

**Files:**
- Modify: `server/services/almoxarifado/schema.js` (bloco de safeAlters novos em `materialCols`)
- Modify: `server/services/almoxarifado/schemas.js` (+`MaterialSchema`)
- Modify: `server/routes/almoxarifado.js:252-399` (POST/PUT/DELETE materiais reescritos com validate + campos + auditoria)
- Test: `server/tests/api/materialCompleto.api.test.js`

**Interfaces:**
- Colunas novas (adicionar a `materialCols` em `schema.js:343+`): `fabricante TEXT, codigo_fabricante TEXT, peso_unitario REAL, dimensoes TEXT, material_construtivo TEXT, norma TEXT, marca TEXT, modelo TEXT, aplicacao TEXT, ponto_reposicao REAL, lote_economico REAL, controle_serie INTEGER DEFAULT 0, controle_validade INTEGER DEFAULT 0, controle_corrida INTEGER DEFAULT 0, requer_inspecao INTEGER DEFAULT 0, requer_foto INTEGER DEFAULT 0, classe_abc TEXT, unidade_compra TEXT, fator_conversao_compra REAL, unidade_consumo TEXT, fator_conversao_consumo REAL`.
- `MaterialSchema` (Zod): codigo/nome obrigatórios; familia_id obrigatório number; números `.nonnegative()` onde couber; `classe_abc: z.enum(['A','B','C']).nullable().optional()`; `.superRefine`: se `unidade_compra` presente → `fator_conversao_compra` presente e > 0 (idem consumo). PUT usa `MaterialSchema.partial()` MAS mantendo as invariantes do superRefine.
- POST/PUT persistem TODOS os campos (existentes + novos). PUT: antes do UPDATE, `SELECT *` do estado atual; depois do UPDATE, `registrarAuditoria(db, { entidade: 'material', entidade_id, acao: 'ATUALIZACAO', usuario_*, dados_anteriores: <somente campos alterados>, dados_novos: <somente campos alterados> })`. POST audita `acao: 'CRIACAO'` com dados_novos resumidos. Contratos preservados: 400 'Código já existe' (UNIQUE), validateFamiliaAtiva, validação de subfamília (Task 3), saldo inicial vira movimentação, resolveLocalizacaoFromFk.

- [ ] **Step 1: Teste que falha** — `materialCompleto.api.test.js`: criar material com payload completo (todos os campos novos) → 201 e SELECT confirma persistência; `fator_conversao_compra: 0` com `unidade_compra` → 400 citando fator; `classe_abc: 'X'` → 400; PUT altera nome+marca → `auditoria_log_almoxarifado` tem linha `entidade='material'` com dados_anteriores.nome e dados_novos.nome; payload shape inválido (peso string) → 400 Zod; regressões de contrato: sem familia_id → 400, código duplicado → 400.
- [ ] **Step 2: RED.**
- [ ] **Step 3: Implementar** (reescrever os 3 handlers no estilo async/await com dbRun/dbGet — o arquivo já mistura estilos; manter mensagens).
- [ ] **Step 4: GREEN + regressão** (testes antigos: schemaUnico cria material só com codigo/nome/familia/unidade — MaterialSchema deve aceitar payload mínimo).
- [ ] **Step 5: Commit** — `Almoxarifado: cadastro de material completo (campos tecnicos, unidades com fator, ABC) com Zod e auditoria`

---

### Task 5: Consultas de endereçamento (vazias, sem endereço, endereço completo)

**Files:**
- Modify: `server/routes/almoxarifado.js` (GET /localizacoes: `endereco_completo`)
- Modify: `server/routes/almoxarifado/extended.js` (2 rotas novas)
- Test: `server/tests/api/enderecamento.api.test.js`

**Interfaces:**
- `GET /api/almoxarifado/localizacoes` passa a incluir `endereco_completo` (concat: codigo do almoxarifado + setor + parent.codigo + codigo, separador ' / ', pulando vazios — computável no SELECT com JOINs ou pós-processamento JS).
- `GET /api/almoxarifado/localizacoes/vazias`: localizações ativas sem nenhuma linha de saldo com quantidade > 0.
- `GET /api/almoxarifado/relatorios/materiais-sem-endereco`: materiais ativos com `localizacao_padrao_id IS NULL` e sem saldo em `estoque_saldo_almoxarifado` com localização.
- ⚠️ Ordem de rotas: registrar `/localizacoes/vazias` ANTES de qualquer rota `/localizacoes/:id` se existir (Express casa na ordem).

- [ ] **Step 1: Teste que falha** (3 testes: endereco_completo montado; vazias exclui localização com saldo; sem-endereco lista material certo).
- [ ] **Step 2: RED.** — [ ] **Step 3: Implementar.** — [ ] **Step 4: GREEN + regressão.**
- [ ] **Step 5: Commit** — `Almoxarifado: consultas de enderecamento (vazias, sem endereco, endereco completo)`

---

### Task 6: Front — form de material em seções

**Files:**
- Modify: `client/src/components/almoxarifado/MaterialAlmoxarifadoForm.js`

**Interfaces:** consome POST/PUT com MaterialSchema (Task 4) e famílias com parent (Task 3). Seções: **Identificação** (código+gerar, nome, descrições, foto) · **Classificação** (família → subfamília em cascata [subfamílias = famílias com `parent_id === familia selecionada`], categoria, tipo de material, criticidade) · **Dados técnicos** (fabricante, código fab., marca, modelo, norma, material construtivo, peso, dimensões, aplicação, NCM) · **Estoque e reposição** (unidade, min/max, ponto de reposição, lote econômico, prazo, localização padrão) · **Controles** (checkboxes: lote, série, validade, corrida, certificado, inspeção, foto) · **Unidades e custos** (unidade/fator compra, unidade/fator consumo, custo unitário). Manter classes `almox-*`; seções como blocos com `almox-section-title` (padrão do ExtratoMaterialModal). Payload: enviar apenas campos preenchidos (números via Number, checkboxes 0/1). Validação: CRA build.

- [ ] **Step 1: Implementar.** — [ ] **Step 2: `cd client && npm run build` compila + regressão servidor.** — [ ] **Step 3: Commit** — `Almoxarifado: form de material em secoes com todos os campos do cadastro`

---

### Task 7: Front — gestão de almoxarifados, restrições e filtro no mapa

**Files:**
- Modify: `client/src/components/almoxarifado/ConfiguracoesAlmoxarifado.js` (gestão de almoxarifados + campos novos na aba Localizações)
- Modify: `client/src/components/almoxarifado/MapaLocalizacoesAlmoxarifado.js` (filtro por almoxarifado + badge bloqueada)

**Interfaces:** consome CRUD `/almoxarifados` (T1) e campos de localização (T2). Na aba "Setores e Áreas" (ou nova sub-seção no topo da aba Localizações — seguir o padrão visual do arquivo): listar/criar/editar/inativar almoxarifados. Na edição de localização: select de almoxarifado, checkbox "Bloqueada", multi-select simples de tipos permitidos (checkboxes dos `TIPOS_MATERIAL_ENUM` via `/meta/tipos-material`; vazio = sem restrição). Mapa: select de almoxarifado acima do canvas (filtra as localizações exibidas), ícone/badge 🔒 em localização bloqueada. Validação: CRA build + regressão servidor.

- [ ] **Step 1: Implementar.** — [ ] **Step 2: Build + regressão.** — [ ] **Step 3: Commit** — `Almoxarifado: gestao de almoxarifados, restricoes de localizacao e filtro no mapa`

---

### Task 8: Atualização das specs da etapa

**Files:**
- Modify: `specs/modulo-almoxarifado/01-cadastros-materiais/README.md`, `specs/modulo-almoxarifado/02-localizacoes-enderecamento/README.md`, `specs/modulo-almoxarifado/README.md`

Marcar `[x]` nos itens entregues das duas features (campos do material, subfamílias, conversões de unidade [colunas+validação — a tabela de conversões genérica NÃO foi criada: manter item não marcado com nota], multi-almoxarifado, restrições/bloqueio de endereço, consultas, exclusão com saldo, auditoria de cadastro); registrar a decisão multi-almoxarifado como tomada (2026-08-04, entidade raiz) substituindo o bloco "Decisão em aberto"; NÃO marcar o que ficou fora (capacidade/peso enforcement, confirmação por leitura, sugestão de localização na entrada, motivos/transportadoras/tipos de documento, `almoxarifadoApi.js`, categorias hardcoded do front se não resolvidas). Atualizar datas e a tabela de status do mestre (01 e 02 → entregas desta etapa). Regressão final completa (4 suites).

- [ ] **Step 1: Editar specs.** — [ ] **Step 2: Regressão completa.** — [ ] **Step 3: Commit** — `Almoxarifado: specs das features 01 e 02 atualizadas (etapa 2 entregue)`

---

## Self-Review (feito na escrita)

1. **Cobertura do design:** todas as linhas da tabela de regras essenciais do design têm task (T1 migração/CRUD/inativar; T2 bloqueio/tipos/delete-com-saldo; T3 subfamílias; T4 fator/ABC/auditoria; T5 consultas). Front T6/T7. Specs T8.
2. **Consistência:** `AlmoxarifadoSchema`/`MaterialSchema` em schemas.js; helper `validarLocalizacaoParaMovimento` só na T2; nomes de rotas idênticos entre T1/T5/T7.
3. **Riscos mapeados:** ordem de rota `/localizacoes/vazias` vs param routes (T5 avisa); MaterialSchema deve aceitar payload mínimo dos testes antigos (T4 Step 4 avisa); localizações de testes antigos sem restrições → default não restritivo (T2 Step 4 avisa).
