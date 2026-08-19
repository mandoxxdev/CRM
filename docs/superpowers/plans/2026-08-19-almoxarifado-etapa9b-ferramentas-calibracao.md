# Etapa 9b — Ferramentas e calibração — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transformar o subsistema de ferramentas (hoje: 57 linhas sem teste, sem Zod, com TOCTOU
e gate errado) em patrimônio emprestável completo: máquina de estados com claim, calibração com
vencimento que impede empréstimo, manutenção, avaria/perda com foto, bloqueio, lembrete de
devolução e tela própria.

**Architecture:** Ferramenta é **patrimônio, não estoque** — nenhum tipo de movimento novo, zero
contato com o motor. Estados via `toolStateMachine.js` (padrão `thirdPartyStateMachine`), toda
transição por UPDATE com claim no WHERE. Histórias (calibração, manutenção, ocorrência) em tabelas
próprias; a vigência da calibração é **lida da última calibração**, sem coluna-cache.

**Tech Stack:** Express + SQLite (`safeAlter` para colunas), Zod (`schemas.js` + `validate`),
multer em disco (padrão do comprovante de sucata), React CRA no client.

**Spec:** `docs/superpowers/specs/2026-08-19-almoxarifado-etapa9b-ferramentas-calibracao-design.md`
— as **RN-01..RN-11** e os **contratos de API congelados** (payload, recusas com mensagem literal)
estão lá e valem como requisito de cada task. O nome de cada teste de RN cita o ID (`RN-03: ...`).

## Global Constraints

- Branch: `desenvolvimento-almoxarifado`. Um commit por task, mensagem em português sem acento,
  explicando **por quê**. Nunca `git add -A` na raiz — sempre pathspec explícito.
- Testes: `cd server && npm run test:api` (descobre só `server/tests/api/*.api.test.js`; cada
  arquivo tem runner próprio: `test()`, contadores, `process.exit(failed ? 1 : 0)`). Harness:
  `tests/helpers/testApp.js` — `requirePermission` REAL (`setUser` com usuário sem
  `perfil_almoxarifado` vira PRODUCAO). Client: `cd client && CI=true npx react-scripts test
  --watchAll=false` e build com `CI=true`.
- **Todo teste novo tem controle positivo.** Cada task lista a SABOTAGEM: o que quebrar de
  propósito e quais testes TÊM de cair. Rodar a sabotagem de verdade. Regras do harness de
  sabotagem (da skill `fechar-etapa`): `python` NÃO existe nesta máquina; `grep -cF '<ancora>'`
  tem de dar exatamente 1 antes de qualquer `sed`; `md5sum` antes/depois/restaurado.
- Colunas novas só por `safeAlter` (`schema.js:261` — só engole `duplicate column name`).
  DDL só em `services/almoxarifado/schema.js`.
- Validação: schemas Zod em `services/almoxarifado/schemas.js` + `validate(schema)` de
  `validation.js` (o formato do 400 é `{ error: "Dados inválidos — ..." }`).
- Auditoria: `registrarAuditoria(db, { entidade, entidade_id, acao, usuario_id, usuario_nome,
  dados_anteriores?, dados_novos? })` de `services/almoxarifado/audit.js`.
- **Overnight (skill `desenvolver-etapa-almoxarifado`):** nunca esperar input; decisão ambígua →
  caminho reversível + registro na letra B de `docs/almoxarifado-novidades-por-etapa.md`; ao fim
  de CADA task, marcar este plano com o estado real; mesmo teste falhando 3 rodadas → parar e
  reportar aqui.

## Sort topológico (tronco/galho)

| Task | Tema | Classe |
|---|---|---|
| 1 | Fundação: tabelas, colunas, máquina de estados, ação de perfil | **tronco** |
| 2 | Empréstimo endurecido: claim, RN-01..04, RN-09, RN-11, Zod, gate novo | **tronco** |
| 3 | Calibração: registrar/listar/painel, RN-08 | galho (backend, serial) |
| 4 | Bloqueio + manutenção + reencontrar: RN-06, RN-07, RN-10 | galho (backend, serial) |
| 5 | Ocorrências (avaria/perda) com foto: RN-05 | galho (backend, serial) |
| 6 | Lembrete de devolução vencida + `vencidos=1` | galho (backend, serial) |
| 7 | Front: tela `/almoxarifado/ferramentas` + painel de calibrações | **galho PARALELO** — roda em worktree própria contra os contratos congelados do design, em paralelo com as tasks 3–6 |
| 8 | Integração cruzando galhos (`toolIntegracao.api.test.js`) | fase 4 — depois do merge |
| 9 | Fechamento: skill `fechar-etapa` + retro de 4 números | fase 6 |

**Por que os galhos backend (3–6) rodam em SÉRIE e não em paralelo:** todos escrevem em
`toolService.js` + `extended.js` + `schemas.js` — mesmos arquivos, conflito de merge garantido, e
as regras se encostam (a ocorrência muda status que a manutenção lê). O único galho com fronteira
real é o front (Task 7), que trabalha contra o contrato HTTP congelado. Registrar na retro se essa
topologia valeu.

---

### Task 1: Fundação — tabelas, colunas, `toolStateMachine`, ação de perfil (tronco)

**Files:**
- Modify: `server/services/almoxarifado/schema.js` (após as tabelas de ferramentas, ~linha 1491)
- Create: `server/services/almoxarifado/toolStateMachine.js`
- Modify: `server/services/almoxarifado/permissions.js` (ACAO_PERFIS, após `aprovar_sucateamento_gestao`, linha 55)
- Test: `server/tests/api/toolFundacao.api.test.js`

**Interfaces (Produces):**
- Tabelas: `calibracoes_ferramenta_almoxarifado`, `manutencoes_ferramenta_almoxarifado`,
  `ocorrencias_ferramenta_almoxarifado` (colunas abaixo); colunas novas em
  `ferramentas_almoxarifado`: `numero_serie TEXT`, `localizacao_id INTEGER`,
  `exige_calibracao INTEGER DEFAULT 0`.
- `toolStateMachine.js` exporta: `STATUS = { DISPONIVEL, EMPRESTADA, BLOQUEADA, EM_MANUTENCAO,
  AVARIADA, PERDIDA }`, `TRANSICOES` (mapa `de → [para...]`), `podeTransicionar(de, para)` (bool).
- `ACAO_PERFIS.gerenciar_ferramentas = [ADMINISTRADOR, ALMOXARIFE]`.

- [ ] **Step 1: Teste falhando** — `tests/api/toolFundacao.api.test.js` no idioma do repo (copiar
  o esqueleto de runner de `sucataDedicada.api.test.js`: `test()`, contadores, `process.exit`):

```js
const assert = require('assert');
const { createTestApp } = require('../helpers/testApp');
const { dbAll, dbGet } = require('../../services/almoxarifado/db');
const { STATUS, TRANSICOES, podeTransicionar } = require('../../services/almoxarifado/toolStateMachine');
const { ACAO_PERFIS, can } = require('../../services/almoxarifado/permissions');

// (runner test()/passed/failed identico ao de sucataDedicada.api.test.js)

test('tabelas novas existem com as colunas do design', async () => {
  const { db, close } = await createTestApp();
  for (const [tabela, coluna] of [
    ['calibracoes_ferramenta_almoxarifado', 'data_validade'],
    ['manutencoes_ferramenta_almoxarifado', 'data_fim'],
    ['ocorrencias_ferramenta_almoxarifado', 'foto_path'],
  ]) {
    const cols = await dbAll(db, `PRAGMA table_info(${tabela})`);
    assert.ok(cols.length > 0, `tabela ${tabela} nao existe`);
    assert.ok(cols.some(c => c.name === coluna), `${tabela} sem coluna ${coluna}`);
  }
  const fcols = await dbAll(db, 'PRAGMA table_info(ferramentas_almoxarifado)');
  for (const c of ['numero_serie', 'localizacao_id', 'exige_calibracao'])
    assert.ok(fcols.some(x => x.name === c), `ferramentas sem coluna ${c}`);
  await close();
});

test('maquina de estados: transicoes do design valem, inventadas nao', async () => {
  assert.ok(podeTransicionar(STATUS.DISPONIVEL, STATUS.EMPRESTADA));
  assert.ok(podeTransicionar(STATUS.EMPRESTADA, STATUS.DISPONIVEL));   // devolucao
  assert.ok(podeTransicionar(STATUS.EMPRESTADA, STATUS.AVARIADA));     // RN-05
  assert.ok(podeTransicionar(STATUS.EMPRESTADA, STATUS.PERDIDA));      // RN-05
  assert.ok(podeTransicionar(STATUS.AVARIADA, STATUS.EM_MANUTENCAO));  // RN-07 conserto
  assert.ok(podeTransicionar(STATUS.EM_MANUTENCAO, STATUS.DISPONIVEL));
  assert.ok(podeTransicionar(STATUS.PERDIDA, STATUS.DISPONIVEL));      // RN-10
  assert.ok(!podeTransicionar(STATUS.EMPRESTADA, STATUS.EMPRESTADA));  // RN-01
  assert.ok(!podeTransicionar(STATUS.BLOQUEADA, STATUS.EMPRESTADA));   // RN-02
  assert.ok(!podeTransicionar(STATUS.EMPRESTADA, STATUS.EM_MANUTENCAO)); // RN-07 emprestada nao entra
});

test('RN-09: acao gerenciar_ferramentas existe e nega PRODUCAO', async () => {
  assert.deepStrictEqual(ACAO_PERFIS.gerenciar_ferramentas.sort(), ['ADMINISTRADOR', 'ALMOXARIFE']);
  assert.ok(can({ id: 9, perfil_almoxarifado: 'ALMOXARIFE' }, 'gerenciar_ferramentas'));
  assert.ok(!can({ id: 9 }, 'gerenciar_ferramentas')); // sem perfil = PRODUCAO
});
```

- [ ] **Step 2: Rodar e ver falhar** — `cd server && node tests/api/toolFundacao.api.test.js` —
  esperado: `Cannot find module ... toolStateMachine`.
- [ ] **Step 3: Implementar.** Em `schema.js`, logo após `emprestimos_ferramenta_almoxarifado`
  (linha ~1491):

```js
  await dbRun(db, `CREATE TABLE IF NOT EXISTS calibracoes_ferramenta_almoxarifado (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ferramenta_id INTEGER NOT NULL,
    data_calibracao DATE NOT NULL,
    data_validade DATE NOT NULL,
    certificado_path TEXT,
    observacoes TEXT,
    usuario_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (ferramenta_id) REFERENCES ferramentas_almoxarifado(id)
  )`);
  await dbRun(db, `CREATE TABLE IF NOT EXISTS manutencoes_ferramenta_almoxarifado (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ferramenta_id INTEGER NOT NULL,
    descricao TEXT NOT NULL,
    data_inicio DATETIME DEFAULT CURRENT_TIMESTAMP,
    data_fim DATETIME,
    observacoes TEXT,
    usuario_id INTEGER,
    FOREIGN KEY (ferramenta_id) REFERENCES ferramentas_almoxarifado(id)
  )`);
  await dbRun(db, `CREATE TABLE IF NOT EXISTS ocorrencias_ferramenta_almoxarifado (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ferramenta_id INTEGER NOT NULL,
    tipo TEXT NOT NULL,
    descricao TEXT NOT NULL,
    responsavel_colaborador_id INTEGER,
    responsavel_nome TEXT,
    foto_path TEXT,
    usuario_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (ferramenta_id) REFERENCES ferramentas_almoxarifado(id)
  )`);
  await safeAlter(db, 'ALTER TABLE ferramentas_almoxarifado ADD COLUMN numero_serie TEXT');
  await safeAlter(db, 'ALTER TABLE ferramentas_almoxarifado ADD COLUMN localizacao_id INTEGER');
  await safeAlter(db, 'ALTER TABLE ferramentas_almoxarifado ADD COLUMN exige_calibracao INTEGER DEFAULT 0');
```

`toolStateMachine.js` (arquivo inteiro):

```js
/**
 * Maquina de estados da ferramenta (Etapa 9b). Padrao thirdPartyStateMachine.
 * Ferramenta e PATRIMONIO, nao estoque: nada aqui toca o motor de movimentacoes.
 * A transicao real acontece SEMPRE por UPDATE com claim no WHERE (toolService);
 * este modulo e a fonte unica de quais transicoes existem — quem valida fora dele
 * esta criando segunda fonte.
 */
const STATUS = {
  DISPONIVEL: 'DISPONIVEL',
  EMPRESTADA: 'EMPRESTADA',
  BLOQUEADA: 'BLOQUEADA',
  EM_MANUTENCAO: 'EM_MANUTENCAO',
  AVARIADA: 'AVARIADA',
  PERDIDA: 'PERDIDA',
};

const TRANSICOES = {
  [STATUS.DISPONIVEL]: [STATUS.EMPRESTADA, STATUS.BLOQUEADA, STATUS.EM_MANUTENCAO, STATUS.AVARIADA, STATUS.PERDIDA],
  [STATUS.EMPRESTADA]: [STATUS.DISPONIVEL, STATUS.AVARIADA, STATUS.PERDIDA], // devolucao e RN-05
  [STATUS.BLOQUEADA]: [STATUS.DISPONIVEL],
  [STATUS.EM_MANUTENCAO]: [STATUS.DISPONIVEL],
  [STATUS.AVARIADA]: [STATUS.EM_MANUTENCAO, STATUS.PERDIDA],
  [STATUS.PERDIDA]: [STATUS.DISPONIVEL], // RN-10 reencontrada, com justificativa
};

function podeTransicionar(de, para) {
  return (TRANSICOES[de] || []).includes(para);
}

module.exports = { STATUS, TRANSICOES, podeTransicionar };
```

Em `permissions.js`, depois da linha 55 (`aprovar_sucateamento_gestao`):

```js
  // Etapa 9b, decisao D1: ferramenta e PATRIMONIO emprestavel, nao estoque — gatear com
  // `movimentar` (permissao de mover saldo) acoplava os dois e impedia restringir um sem o outro.
  // Mesmo criterio de remessar_terceiro: acao propria para PODER restringir sem reescrever.
  // Uma acao so (nao emprestar_/calibrar_/etc): YAGNI ate o cliente pedir granularidade.
  gerenciar_ferramentas: [PERFIS.ADMINISTRADOR, PERFIS.ALMOXARIFE],
```

- [ ] **Step 4: Rodar o teste (verde) e a suíte** — `node tests/api/toolFundacao.api.test.js` e
  `npm run test:api`.
- [ ] **Step 5: SABOTAGEM (controle positivo):** remover `STATUS.EMPRESTADA` da lista de
  `TRANSICOES[STATUS.DISPONIVEL]` → o teste da máquina TEM de cair. `md5sum` antes/depois/
  restaurado; `git diff --stat` vazio ao final.
- [ ] **Step 6: Commit** — `git add server/services/almoxarifado/schema.js
  server/services/almoxarifado/toolStateMachine.js server/services/almoxarifado/permissions.js
  server/tests/api/toolFundacao.api.test.js` + mensagem
  `Almoxarifado Etapa 9b Task 1: fundacao de ferramentas — tabelas, maquina de estados e acao propria`.

---

### Task 2: Empréstimo endurecido — claim, RN-01..04, RN-09, RN-11, Zod, gate novo (tronco)

**Files:**
- Modify: `server/services/almoxarifado/toolService.js` (reescrever `emprestarFerramenta`/
  `devolverFerramenta`; enriquecer `listarFerramentas`/`listarEmprestimos`; `atualizarFerramenta` nova)
- Modify: `server/services/almoxarifado/schemas.js` (FerramentaCreateSchema,
  FerramentaUpdateSchema, EmprestimoSchema, DevolucaoEmprestimoSchema)
- Modify: `server/routes/almoxarifado/extended.js:863-887` (gate `gerenciar_ferramentas` +
  `validate(...)` + `PUT /ferramentas/:id`)
- Test: `server/tests/api/toolEmprestimo.api.test.js`

**Interfaces:**
- Consumes: Task 1 (`toolStateMachine.STATUS`, tabelas, `gerenciar_ferramentas`).
- Produces: `emprestarFerramenta(db, user, ferramentaId, data)` → `{id}` | throw `{status:400,
  message}`; `devolverFerramenta(db, user, emprestimoId, data)` → `{success:true}`;
  `atualizarFerramenta(db, user, id, data)`; `listarFerramentas(db, filters)` devolve cada item
  com `calibracao_vigente` (bool|null — null quando `exige_calibracao=0`) e
  `emprestimo_aberto` (`{id, colaborador_nome, data_prevista_devolucao}`|null). Helper interno
  `calibracaoVigente(db, ferramentaId)` → row|undefined (Task 3 e 8 reusam).

- [ ] **Step 1: Teste falhando** — `toolEmprestimo.api.test.js`. Casos (os 4 nomes da spec 16
  entre eles, prefixados pela RN):

```js
// helper local
async function novaFerramenta(db, extra = {}) {
  seq += 1;
  const r = await dbRun(db, `INSERT INTO ferramentas_almoxarifado
    (codigo_patrimonio, nome, status, exige_calibracao) VALUES (?,?,?,?)`,
    [`FER-${seq}`, `Ferramenta ${seq}`, extra.status || 'DISPONIVEL', extra.exige_calibracao || 0]);
  return r.lastID;
}

test('RN-01: emprestar ferramenta ja emprestada falha', async () => {
  const { app, db, close } = await createTestApp();
  const fid = await novaFerramenta(db);
  await request(app).post(`/api/almoxarifado/ferramentas/${fid}/emprestar`)
    .send({ colaborador_nome: 'Joao' }).expect(201);
  const r = await request(app).post(`/api/almoxarifado/ferramentas/${fid}/emprestar`)
    .send({ colaborador_nome: 'Maria' }).expect(400);
  assert.strictEqual(r.body.error, 'Ferramenta não está disponível (status atual: EMPRESTADA)');
  await close();
});

test('RN-01: corrida — dois emprestar simultaneos, exatamente um vence', async () => {
  const { app, db, close } = await createTestApp();
  const fid = await novaFerramenta(db);
  const [a, b] = await Promise.all([
    request(app).post(`/api/almoxarifado/ferramentas/${fid}/emprestar`).send({ colaborador_nome: 'A' }),
    request(app).post(`/api/almoxarifado/ferramentas/${fid}/emprestar`).send({ colaborador_nome: 'B' }),
  ]);
  const codes = [a.status, b.status].sort();
  assert.deepStrictEqual(codes, [201, 400], `esperava 1 vitoria e 1 recusa, veio ${codes}`);
  const emprestimos = await dbAll(db,
    "SELECT * FROM emprestimos_ferramenta_almoxarifado WHERE ferramenta_id = ? AND status = 'EMPRESTADA'", [fid]);
  assert.strictEqual(emprestimos.length, 1, 'a corrida gravou dois emprestimos abertos');
  await close();
});

test('RN-02: emprestar ferramenta bloqueada falha', async () => {
  const { app, db, close } = await createTestApp();
  const fid = await novaFerramenta(db, { status: 'BLOQUEADA' });
  const r = await request(app).post(`/api/almoxarifado/ferramentas/${fid}/emprestar`)
    .send({ colaborador_nome: 'Joao' }).expect(400);
  assert.strictEqual(r.body.error, 'Ferramenta não está disponível (status atual: BLOQUEADA)');
  await close();
});

test('RN-03: emprestar equipamento com calibracao vencida falha', async () => {
  const { app, db, close } = await createTestApp();
  const fid = await novaFerramenta(db, { exige_calibracao: 1 });
  // sem registro algum de calibracao → recusa
  let r = await request(app).post(`/api/almoxarifado/ferramentas/${fid}/emprestar`)
    .send({ colaborador_nome: 'Joao' }).expect(400);
  assert.strictEqual(r.body.error, 'Ferramenta com calibração vencida ou sem calibração registrada');
  // calibracao VENCIDA → recusa igual
  await dbRun(db, `INSERT INTO calibracoes_ferramenta_almoxarifado
    (ferramenta_id, data_calibracao, data_validade) VALUES (?, date('now','-2 years'), date('now','-1 year'))`, [fid]);
  r = await request(app).post(`/api/almoxarifado/ferramentas/${fid}/emprestar`)
    .send({ colaborador_nome: 'Joao' }).expect(400);
  assert.strictEqual(r.body.error, 'Ferramenta com calibração vencida ou sem calibração registrada');
  // controle positivo: calibracao vigente → empresta
  await dbRun(db, `INSERT INTO calibracoes_ferramenta_almoxarifado
    (ferramenta_id, data_calibracao, data_validade) VALUES (?, date('now'), date('now','+1 year'))`, [fid]);
  await request(app).post(`/api/almoxarifado/ferramentas/${fid}/emprestar`)
    .send({ colaborador_nome: 'Joao' }).expect(201);
  await close();
});

test('RN-04: devolver ferramenta permite novo emprestimo', async () => {
  const { app, db, close } = await createTestApp();
  const fid = await novaFerramenta(db);
  const e1 = await request(app).post(`/api/almoxarifado/ferramentas/${fid}/emprestar`)
    .send({ colaborador_nome: 'Joao' }).expect(201);
  await request(app).post(`/api/almoxarifado/emprestimos/${e1.body.id}/devolver`).send({}).expect(200);
  const emp = await dbGet(db, 'SELECT * FROM emprestimos_ferramenta_almoxarifado WHERE id = ?', [e1.body.id]);
  assert.strictEqual(emp.status, 'DEVOLVIDA');
  assert.ok(emp.data_devolucao_real, 'data_devolucao_real vazia');
  await request(app).post(`/api/almoxarifado/ferramentas/${fid}/emprestar`)
    .send({ colaborador_nome: 'Maria' }).expect(201);
  await close();
});

test('RN-09: PRODUCAO recebe 403 nas escritas; leitura passa', async () => {
  const { app, db, close, setUser } = await createTestApp();
  const fid = await novaFerramenta(db);
  setUser({ id: 7, nome: 'Chao de Fabrica', email: 'p@t.com' }); // sem perfil → PRODUCAO
  await request(app).post('/api/almoxarifado/ferramentas')
    .send({ codigo_patrimonio: 'X-1', nome: 'Furadeira' }).expect(403);
  await request(app).post(`/api/almoxarifado/ferramentas/${fid}/emprestar`)
    .send({ colaborador_nome: 'Joao' }).expect(403);
  await request(app).get('/api/almoxarifado/ferramentas').expect(200);
  await close();
});

test('RN-11: emprestar e devolver auditam', async () => {
  const { app, db, close } = await createTestApp();
  const fid = await novaFerramenta(db);
  const e = await request(app).post(`/api/almoxarifado/ferramentas/${fid}/emprestar`)
    .send({ colaborador_nome: 'Joao' }).expect(201);
  await request(app).post(`/api/almoxarifado/emprestimos/${e.body.id}/devolver`).send({}).expect(200);
  const audit = await dbAll(db,
    "SELECT acao FROM auditoria_almoxarifado WHERE entidade = 'ferramenta' AND entidade_id = ?", [fid]);
  const acoes = audit.map(a => a.acao);
  assert.ok(acoes.includes('EMPRESTIMO'), `sem auditoria de emprestimo: ${acoes}`);
  assert.ok(acoes.includes('DEVOLUCAO'), `sem auditoria de devolucao: ${acoes}`);
  await close();
});

test('Zod: payload sem colaborador_nome recusa com 400 de validacao', async () => {
  const { app, db, close } = await createTestApp();
  const fid = await novaFerramenta(db);
  const r = await request(app).post(`/api/almoxarifado/ferramentas/${fid}/emprestar`).send({}).expect(400);
  assert.ok(/Dados inválidos/.test(r.body.error), r.body.error);
  await close();
});

test('listarFerramentas devolve calibracao_vigente e emprestimo_aberto', async () => {
  const { app, db, close } = await createTestApp();
  const semCal = await novaFerramenta(db);                       // exige_calibracao=0
  const comCal = await novaFerramenta(db, { exige_calibracao: 1 });
  await request(app).post(`/api/almoxarifado/ferramentas/${semCal}/emprestar`)
    .send({ colaborador_nome: 'Joao', data_prevista_devolucao: '2030-01-01' }).expect(201);
  const r = await request(app).get('/api/almoxarifado/ferramentas').expect(200);
  const a = r.body.find(f => f.id === semCal);
  const b = r.body.find(f => f.id === comCal);
  assert.strictEqual(a.calibracao_vigente, null);                 // nao exige → null
  assert.strictEqual(a.emprestimo_aberto.colaborador_nome, 'Joao');
  assert.strictEqual(b.calibracao_vigente, false);                // exige e nao tem → false
  assert.strictEqual(b.emprestimo_aberto, null);
  await close();
});
```

- [ ] **Step 2: Rodar e ver falhar** (mensagens/claim/auditoria não existem).
- [ ] **Step 3: Implementar.** Núcleo do `emprestarFerramenta` (o claim é o ponto — copiar esta
  forma, não a antiga):

```js
const { STATUS } = require('./toolStateMachine');

async function calibracaoVigente(db, ferramentaId) {
  return dbGet(db, `SELECT * FROM calibracoes_ferramenta_almoxarifado
    WHERE ferramenta_id = ? AND date(data_validade) >= date('now')
    ORDER BY date(data_validade) DESC LIMIT 1`, [ferramentaId]);
}

async function emprestarFerramenta(db, user, ferramentaId, data) {
  const ferr = await dbGet(db, 'SELECT * FROM ferramentas_almoxarifado WHERE id = ? AND ativo = 1', [ferramentaId]);
  if (!ferr) throw Object.assign(new Error('Ferramenta não encontrada'), { status: 404 });

  // RN-03: pre-checagem fora do claim DE PROPOSITO — vencimento e funcao do tempo, nao de
  // escritor concorrente (design D3). Quem muda status concorrentemente e barrado pelo claim.
  if (ferr.exige_calibracao && !(await calibracaoVigente(db, ferramentaId))) {
    throw Object.assign(new Error('Ferramenta com calibração vencida ou sem calibração registrada'), { status: 400 });
  }

  // RN-01/RN-02: claim atomico — a leitura acima e so para a mensagem; quem decide e o UPDATE.
  const claim = await dbRun(db, `UPDATE ferramentas_almoxarifado
    SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = ?`,
    [STATUS.EMPRESTADA, ferramentaId, STATUS.DISPONIVEL]);
  if (claim.changes === 0) {
    const atual = await dbGet(db, 'SELECT status FROM ferramentas_almoxarifado WHERE id = ?', [ferramentaId]);
    throw Object.assign(new Error(`Ferramenta não está disponível (status atual: ${atual.status})`), { status: 400 });
  }

  const r = await dbRun(db, `INSERT INTO emprestimos_ferramenta_almoxarifado
    (ferramenta_id, colaborador_id, colaborador_nome, setor, data_prevista_devolucao, observacoes)
    VALUES (?,?,?,?,?,?)`, [
    ferramentaId, data.colaborador_id || null, data.colaborador_nome,
    data.setor || null, data.data_prevista_devolucao || null, data.observacoes || null,
  ]).catch(async (e) => {
    // compensacao: o claim ja tirou a ferramenta de circulacao; se o INSERT falhar, devolve.
    await dbRun(db, 'UPDATE ferramentas_almoxarifado SET status = ? WHERE id = ?', [STATUS.DISPONIVEL, ferramentaId]);
    throw e;
  });

  await registrarAuditoria(db, { entidade: 'ferramenta', entidade_id: ferramentaId, acao: 'EMPRESTIMO',
    usuario_id: user.id, usuario_nome: user.nome || user.email,
    dados_novos: { emprestimo_id: r.lastID, colaborador_nome: data.colaborador_nome } });
  return { id: r.lastID };
}
```

`devolverFerramenta`: claim no empréstimo (`UPDATE emprestimos... SET status='DEVOLVIDA',
data_devolucao_real=CURRENT_TIMESTAMP WHERE id=? AND status='EMPRESTADA'`; `changes===0` → 404
`"Empréstimo não encontrado"`), depois ferramenta → `DISPONIVEL`, auditoria `acao:'DEVOLUCAO'`.
Zod em `schemas.js`:

```js
const FerramentaCreateSchema = z.object({
  codigo_patrimonio: z.string().min(1),
  nome: z.string().min(1),
  tipo: z.string().nullable().optional(),
  setor_responsavel: z.string().nullable().optional(),
  material_id: z.number().int().positive().nullable().optional(),
  numero_serie: z.string().nullable().optional(),
  localizacao_id: z.number().int().positive().nullable().optional(),
  exige_calibracao: z.boolean().optional(),
  observacoes: z.string().nullable().optional(),
});
const FerramentaUpdateSchema = FerramentaCreateSchema.partial();
const EmprestimoSchema = z.object({
  colaborador_nome: z.string().min(1),
  colaborador_id: z.number().int().positive().nullable().optional(),
  setor: z.string().nullable().optional(),
  data_prevista_devolucao: z.string().nullable().optional(),
  observacoes: z.string().nullable().optional(),
});
const DevolucaoEmprestimoSchema = z.object({ observacoes: z.string().nullable().optional() });
```

Rotas (`extended.js:863-887`): trocar `requirePermission('movimentar')` →
`requirePermission('gerenciar_ferramentas')`, acrescentar `validate(...)` e `PUT /ferramentas/:id`.
`criarFerramenta` ganha os campos novos e a recusa do UNIQUE vira 400
`"Código de patrimônio já cadastrado"` (catch de `SQLITE_CONSTRAINT`). `listarFerramentas` passa a
montar `calibracao_vigente`/`emprestimo_aberto` (LEFT JOIN ou subquery; `calibracao_vigente = null`
quando `exige_calibracao = 0`).
- [ ] **Step 4: Verde + suíte inteira** (`npm run test:api` — atenção a `permissoesRotas.api.test.js`,
  que pode listar as rotas de ferramentas com o gate antigo; se listar, atualizar o teste É parte
  da task e o commit explica).
- [ ] **Step 5: SABOTAGEM:** trocar o claim de volta para if-depois-UPDATE (remover
  `AND status = ?` do WHERE) → o teste de corrida TEM de cair. Restaurar (md5sum + diff vazio).
- [ ] **Step 6: Commit** — pathspec explícito, mensagem
  `Almoxarifado Etapa 9b Task 2: emprestimo com claim atomico, calibracao barrando, auditoria e gate proprio`.

---

### Task 3: Calibração — registrar (multipart), listar, painel (galho serial)

**Files:**
- Modify: `server/services/almoxarifado/toolService.js` (`registrarCalibracao`,
  `listarCalibracoes`, `painelCalibracoes`)
- Modify: `server/routes/almoxarifado/extended.js` (3 rotas novas; multer `uploadCertificadoCalibracao`
  clonando a configuração de `uploadComprovanteSucata` de `extended.js:74`, subpasta
  `uploads/almoxarifado/calibracoes`)
- Modify: `server/services/almoxarifado/schemas.js` (`CalibracaoSchema`: `data_calibracao` string
  date obrigatória, `data_validade` obrigatória, `observacoes?`; refine: validade > calibração,
  mensagem literal `"Data de validade deve ser posterior à data de calibração"`)
- Test: `server/tests/api/toolCalibracao.api.test.js`

**Interfaces:**
- Consumes: Task 2 (`calibracaoVigente`, claim, gate).
- Produces: `POST /ferramentas/:id/calibracoes` (multipart, campo `certificado` opcional),
  `GET /ferramentas/:id/calibracoes`, `GET /calibracoes/painel?dias=30` →
  `{vencidas:[...], a_vencer:[...]}` (só ferramentas `exige_calibracao=1` e `ativo=1`; cada item:
  `{id, codigo_patrimonio, nome, data_validade, dias_restantes}`).

- [ ] **Step 1: Teste falhando.** Casos: `RN-08: registrar calibracao vigente torna a ferramenta
  emprestavel de novo` (cria `exige_calibracao=1`, emprestar → 400, POST calibração com validade
  futura via multipart `.field(...)`, emprestar → 201); validade ≤ calibração → 400 com a mensagem
  literal; POST com `.attach('certificado', Buffer.from('%PDF-1.4'), 'cert.pdf')` grava
  `certificado_path` e o arquivo existe em `uploadsAlmoxDir` (o harness expõe); painel separa
  vencida de a-vencer (inserir uma vencida e uma vencendo em 10 dias, `?dias=30` traz as duas nas
  listas certas, `dias=5` deixa a de 10 dias de fora); PRODUCAO → 403 no POST, 200 no GET; POST
  audita (`acao:'CALIBRACAO'`).
- [ ] **Step 2: Rodar e ver falhar.**
- [ ] **Step 3: Implementar.** Multer ANTES do gate grava arquivo mesmo em 403 — usar a MESMA
  solução da rota de destino da sucata (ler o comentário em `extended.js:815-845` e copiar a
  ordem dos middlewares de lá; não inventar).
- [ ] **Step 4: Verde + suíte.**
- [ ] **Step 5: SABOTAGEM:** no `painelCalibracoes`, trocar o filtro `exige_calibracao = 1` por
  `1=1` → o teste do painel TEM de cair (ferramenta sem exigência apareceria). Restaurar.
- [ ] **Step 6: Commit** `Almoxarifado Etapa 9b Task 3: calibracao com certificado e painel de vencimento`.

---

### Task 4: Bloqueio, manutenção e reencontrar — RN-06/07/10 (galho serial)

**Files:**
- Modify: `server/services/almoxarifado/toolService.js` (`bloquearFerramenta`,
  `desbloquearFerramenta`, `iniciarManutencao`, `concluirManutencao`, `listarManutencoes`,
  `reencontrarFerramenta`)
- Modify: `server/routes/almoxarifado/extended.js` (6 rotas do contrato)
- Modify: `server/services/almoxarifado/schemas.js` (`JustificativaSchema`
  `{justificativa: z.string().min(5)}`, `ManutencaoSchema` `{descricao: z.string().min(1)}`,
  `ManutencaoConcluirSchema` `{observacoes?}`)
- Test: `server/tests/api/toolManutencao.api.test.js`

**Interfaces:**
- Consumes: Tasks 1–2 (STATUS, claim, gate). Todos os claims por UPDATE-com-WHERE; mensagens de
  recusa EXATAS do contrato (design, tabela de contratos).
- Produces: os 6 endpoints do contrato; `iniciarManutencao` aceita origem `DISPONIVEL` e
  `AVARIADA`; `concluirManutencao` fecha `data_fim` e devolve `DISPONIVEL`.

- [ ] **Step 1: Teste falhando.** Casos: `RN-06: bloquear exige justificativa e audita`
  (sem justificativa → 400 Zod; com → 200, status `BLOQUEADA`, auditoria `acao:'BLOQUEIO'` com a
  justificativa em `dados_novos`); bloquear EMPRESTADA → 400
  `"Ferramenta não pode ser bloqueada (status atual: EMPRESTADA)"`; desbloquear volta a
  `DISPONIVEL`; `RN-07: emprestada nao entra em manutencao` (400
  `"Ferramenta não pode entrar em manutenção (status atual: EMPRESTADA)"`); `RN-07: avariada entra
  em manutencao e sai DISPONIVEL` (forçar status `AVARIADA` por UPDATE direto no teste, iniciar →
  `EM_MANUTENCAO` + linha aberta, emprestar → 400, concluir → `data_fim` preenchida + status
  `DISPONIVEL` + emprestar → 201); concluir manutenção já concluída → 404
  `"Manutenção não encontrada"`; `RN-10: reencontrar exige justificativa e so vale para PERDIDA`
  (em `DISPONIVEL` → 400 `"Ferramenta não está perdida (status atual: DISPONIVEL)"`; forçar
  `PERDIDA`, reencontrar → `DISPONIVEL`, auditoria `acao:'REENCONTRO'`).
- [ ] **Step 2: Ver falhar. Step 3: Implementar** (cada transição = claim com a lista de origens
  válidas no WHERE; `changes===0` → ler status atual e montar a mensagem do contrato).
- [ ] **Step 4: Verde + suíte. Step 5: SABOTAGEM:** no `iniciarManutencao`, incluir `EMPRESTADA`
  nas origens do claim → o teste RN-07 TEM de cair. Restaurar.
- [ ] **Step 6: Commit** `Almoxarifado Etapa 9b Task 4: bloqueio, manutencao e reencontro com claim por transicao`.

---

### Task 5: Ocorrências (avaria/perda) com foto — RN-05 (galho serial)

**Files:**
- Modify: `server/services/almoxarifado/toolService.js` (`registrarOcorrencia`, `listarOcorrencias`)
- Modify: `server/routes/almoxarifado/extended.js` (`POST /ferramentas/:id/ocorrencias` multipart
  campo `foto` + `GET /ferramentas/:id/ocorrencias`; multer reusa o storage da Task 3, subpasta
  `uploads/almoxarifado/ocorrencias`)
- Modify: `server/services/almoxarifado/schemas.js` (`OcorrenciaSchema`:
  `tipo: z.enum(['AVARIA','PERDA'])` — a mensagem de enum inválido do contrato é
  `"Tipo de ocorrência inválido"`, usar `errorMap`/refine para bater literal —, `descricao!`,
  `responsavel_nome?`, `responsavel_colaborador_id?`)
- Test: `server/tests/api/toolOcorrencia.api.test.js`

**Interfaces:**
- Consumes: Tasks 1–2. **RN-05 é o coração:** sobre ferramenta `EMPRESTADA`, a ocorrência fecha o
  empréstimo aberto (`status='DEVOLVIDA'`, `data_devolucao_real=CURRENT_TIMESTAMP`, observação
  `Encerrado por ocorrência #<id> (<TIPO>)`) e aplica `AVARIADA`/`PERDIDA` — tudo na mesma chamada.
- Produces: os 2 endpoints; efeito de status conforme design D5.

- [ ] **Step 1: Teste falhando.** Casos: AVARIA em `DISPONIVEL` → status `AVARIADA`, linha criada,
  auditoria `acao:'OCORRENCIA'`; `RN-05: perda sobre emprestada encerra o emprestimo e aplica
  PERDIDA` (emprestar, registrar PERDA → empréstimo `DEVOLVIDA` com `data_devolucao_real`
  preenchida, ferramenta `PERDIDA`, emprestar de novo → 400); AVARIA sobre emprestada idem →
  `AVARIADA`; foto multipart grava `foto_path` e arquivo existe; tipo inválido → 400
  `"Tipo de ocorrência inválido"`; PRODUCAO → 403.
- [ ] **Step 2: Ver falhar. Step 3: Implementar** (claim: origem `DISPONIVEL|EMPRESTADA` →
  destino pelo tipo; fechar empréstimo DEPOIS do claim vencido, na mesma função).
- [ ] **Step 4: Verde + suíte. Step 5: SABOTAGEM:** comentar o fechamento do empréstimo dentro de
  `registrarOcorrencia` → o teste RN-05 TEM de cair (empréstimo ficaria aberto para sempre com a
  ferramenta perdida). Restaurar.
- [ ] **Step 6: Commit** `Almoxarifado Etapa 9b Task 5: avaria e perda com foto — ocorrencia fecha emprestimo aberto`.

---

### Task 6: Devolução vencida — filtro `vencidos=1` + lembrete (galho serial)

**Files:**
- Modify: `server/services/almoxarifado/toolService.js` (`listarEmprestimos` ganha
  `vencidos`, `ferramenta_id`, `colaborador`)
- Create: `server/services/almoxarifado/toolReminderService.js` (padrão de
  `requisitionReminderService.js` — LER o arquivo antes: mesmo formato de agendamento, mesmo
  registro de envio; se o padrão de lá exigir SMTP/infra que não há como testar, o serviço expõe
  `listarEmprestimosVencidos(db)` pura + o agendamento fino, e o teste cobre a função pura)
- Modify: `server/routes/almoxarifado/extended.js` (nada novo se o filtro entra no GET existente)
- Test: `server/tests/api/toolEmprestimoVencido.api.test.js`

**Interfaces:**
- Consumes: Task 2 (`listarEmprestimos`).
- Produces: `GET /emprestimos?vencidos=1` → só empréstimos `EMPRESTADA` com
  `data_prevista_devolucao < date('now')`; `toolReminderService.listarEmprestimosVencidos(db)`.

- [ ] **Step 1: Teste falhando** (um vencido ontem, um para amanhã, um devolvido: `vencidos=1`
  traz só o primeiro; a função pura idem). **Step 2: falhar. Step 3: implementar.**
- [ ] **Step 4: Verde + suíte. Step 5: SABOTAGEM:** inverter o sinal da comparação de data →
  o teste TEM de cair. Restaurar.
- [ ] **Step 6: Commit** `Almoxarifado Etapa 9b Task 6: emprestimos vencidos — filtro e lembrete no padrao das requisicoes`.

---

### Task 7: Front — tela `/almoxarifado/ferramentas` (GALHO PARALELO — worktree própria)

> Pode começar assim que a Task 2 commitar (os contratos estão congelados no design desde antes).
> Trabalha contra o contrato; se o backend ainda não tiver a rota, mock de fetch no teste RTL —
> mock de JSON na fronteira HTTP é o único mock legítimo (skill, Fase 3).

**Files:**
- Create: `client/src/components/almoxarifado/FerramentasAlmoxarifado.js`
- Create: `client/src/components/almoxarifado/FerramentasAlmoxarifado.test.js`
- Modify: `client/src/routes/lazyModules.js` (export `page(...)` + entrada
  `'/almoxarifado/ferramentas'`, padrão da linha 156/206 — `SobrasAlmoxarifado`)
- Modify: o menu/navegação onde `/almoxarifado/sobras` foi registrado na Etapa 9 (grep por
  `almoxarifado/sobras` em `client/src` e replicar cada ponto para `ferramentas`)

**Interfaces:**
- Consumes: SOMENTE os contratos congelados do design (tabela "Contratos de API").
- Precedente obrigatório: `SobrasAlmoxarifado.js` (visões em abas, `useAlmoxPermissoes` linha 131,
  `AlmoxPageHeader`, `Almoxarifado.css`). Seguir o idioma dele, não inventar layout novo.

**Conteúdo:** três visões — **Ferramentas** (tabela: código, nome, status com badge, série,
localização, calibração — com filtros de status/busca; ações por linha conforme status: emprestar
(modal colaborador/setor/data prevista), devolver, bloquear/desbloquear (modal justificativa),
iniciar/concluir manutenção, registrar ocorrência (modal tipo/descrição/responsável/foto),
registrar calibração (modal datas/observações/certificado), reencontrar; botão "Nova ferramenta"
com o form do contrato); **Empréstimos** (ativos com vencidos destacados — `vencidos=1` —,
histórico, filtro por colaborador); **Calibrações** (painel `GET /calibracoes/painel`: vencidas em
vermelho, a vencer com `dias_restantes`). Botões de escrita sob
`bloquearSeNaoPode('gerenciar_ferramentas')`.

- [ ] **Step 1: Testes RTL falhando** (`FerramentasAlmoxarifado.test.js`, precedente
  `SobrasAlmoxarifado` tem teste vizinho para copiar o setup de mock de fetch): renderiza as três
  visões; lista ferramentas do mock; emprestar dispara POST com o payload do contrato; recusa 400
  do mock aparece como mensagem na tela (usar a mensagem literal
  `"Ferramenta com calibração vencida ou sem calibração registrada"`); usuário sem
  `gerenciar_ferramentas` (mock de `minhas-permissoes`) não vê os botões de escrita; painel separa
  vencidas de a-vencer.
- [ ] **Step 2: Ver falhar. Step 3: Implementar. Step 4:**
  `CI=true npx react-scripts test --watchAll=false` verde + `CI=true npx react-scripts build`
  sem warning.
- [ ] **Step 5: SABOTAGEM:** remover o `bloquearSeNaoPode` de um botão → o teste de permissão TEM
  de cair. Restaurar.
- [ ] **Step 6: Commit** `Almoxarifado Etapa 9b Task 7: tela de ferramentas — emprestimo, manutencao, ocorrencia e painel de calibracao`.

---

### Task 8: Integração cruzando galhos (fase 4 — depois do merge das tasks 3–7)

**Files:**
- Test: `server/tests/api/toolIntegracao.api.test.js`

**Interfaces:** Consumes TUDO (Tasks 1–6). É o teste exigido pela skill: verde por unidade não
prova que as partes compõem.

- [ ] **Step 1: Escrever o fluxo completo como UM teste-jornada + asserções intermediárias:**

```
criar ferramenta exige_calibracao=1
→ emprestar: 400 RN-03 (mensagem literal)
→ registrar calibracao vigente (Task 3)
→ emprestar: 201 (RN-08)
→ registrar AVARIA durante o emprestimo (Task 5)
→ emprestimo fechado (RN-05) + status AVARIADA
→ emprestar: 400 RN-02
→ iniciar manutencao sobre AVARIADA (Task 4, RN-07)
→ concluir manutencao → DISPONIVEL
→ emprestar: 201 → devolver: 200 (RN-04)
→ auditoria da ferramenta contem, em ordem: CALIBRACAO, EMPRESTIMO, OCORRENCIA, EMPRESTIMO, DEVOLUCAO
→ GET /calibracoes/painel NAO lista a ferramenta (calibracao vigente)
```

- [ ] **Step 2: Rodar** — se falhar, o defeito é de COSTURA entre tasks: registrar aqui no plano
  qual costura a revisão da Fase 2 deixou passar (regra da skill), consertar e só então seguir.
- [ ] **Step 3: Suíte completa serial** (os cinco comandos da `fechar-etapa`).
- [ ] **Step 4: SABOTAGEM:** reverter mentalmente não vale — escolher UMA costura real (ex.:
  fazer `registrarOcorrencia` não fechar o empréstimo) e confirmar que ESTE teste cai além do
  unitário da Task 5. Restaurar.
- [ ] **Step 5: Commit** `Almoxarifado Etapa 9b Task 8: teste-jornada da ferramenta — calibra, empresta, avaria, conserta, devolve`.

---

### Task 9: Fechamento (fase 6)

- [ ] Usar a skill **`fechar-etapa`** inteira: novidades-por-etapa (com o bloco ⚠️ atualizado —
  as decisões D1–D12 delegadas entram na letra B se alguma esperar arbitragem), spec 16 (status,
  checklist com hash por item, **e a correção declarada das linhas envelhecidas** anotada no
  design), mapa de status (feature 16), guia do usuário, manual do sistema (regras RN citadas em
  linguagem de operador, mensagens literais conferidas no código), este plano (tasks marcadas +
  divergências).
- [ ] **Retro de 4 números** no fim deste arquivo (regra da skill `desenvolver-etapa-almoxarifado`):
  rodadas até verde; achados reais vs. ruído na revisão adversarial; galhos paralelos de fato e
  retrabalho causado; defeito que escapou (preencher na etapa seguinte).

---

## Self-review do plano (feito na escrita)

- **Cobertura da spec 16:** série+localização (T1/T2), lembrete (T6), avaria/perda com fotos (T5),
  bloqueio (T4), manutenção (T4), calibração completa (T3) + impedimento (T2), tela + painel (T7).
  Integração com inspeção e alertas formais: fora do escopo declarado (design D11). Os 4 testes
  nomeados da spec: T2 (três) + T2/RN-04 (quarto).
- **Consistência de tipos:** `calibracaoVigente` definida em T2 e citada em T3/T8;
  mensagens literais idênticas ao contrato do design; `STATUS` de T1 usado em T2/T4/T5.
- **Sem placeholder:** cada task tem código ou instrução executável com precedente file:line.
