# Etapa 23 — A trilha para de mentir por omissão e por excesso (plano)

> **For agentic workers:** REQUIRED SUB-SKILL: `superpowers:subagent-driven-development`.

**Goal:** salvar configurações passa a ser tudo-ou-nada (hoje pode alterar o banco, responder
500 e não deixar rastro), e excluir o que já está inativo para de registrar um ato que não
aconteceu.

**Architecture:** duas mudanças pontuais em `routes/almoxarifado.js`. Sem serviço novo, sem
migration, **sem transação** (ver a Global Constraint 1 — é o ponto mais importante deste plano).

**Spec:** `docs/superpowers/specs/2026-08-28-almoxarifado-etapa23-trilha-honesta-design.md`

## Global Constraints

1. **NÃO use `BEGIN`/`COMMIT`/`ROLLBACK` nesta etapa.** `server/index.js:1026` abre **uma
   única** conexão SQLite para o CRM inteiro (o único `new sqlite3.Database` **carregado pelo
   processo do servidor** — os outros são scripts avulsos que o `index.js` não `require`; a
   versão anterior dizia "o único do servidor", falso ao pé da letra, achado A7), e transação em SQLite é por **conexão**, não por requisição. Entre um `BEGIN` e um
   `COMMIT` numa rota, **as escritas de todas as outras requisições em voo entram na mesma
   transação** — e um `ROLLBACK` por falha ao salvar configuração **desfaria a movimentação de
   estoque de outra pessoa**. A atomicidade vem de **um `UPDATE` só**: o SQLite é atômico por
   statement.
2. **Use `python3`, nunca `python`** (o alias não existe; heredoc com `python` vira no-op
   silencioso). Ou `sed` contando a âncora antes (`grep -cF` tem de dar exatamente 1), ou Edit.
3. **COMMITE ANTES DE SABOTAR** — três `git checkout` já apagaram correção não commitada aqui.
4. **Controle positivo lendo QUAL asserção caiu**, não só o placar. Sabotagem que derruba o
   cenário certo pela asserção errada deixa sem prova o ponto que ela deveria guardar; isso
   falhou três vezes nesta sessão. `md5sum` antes/depois/restaurado, `git diff --stat` vazio.
5. **Vermelho por asserção, não por `MODULE_NOT_FOUND`.**
6. **Nunca `git add -A`.** Commit em português, corpo sem acento, `git commit -F`.
7. Testes só em `server/tests/api/*.api.test.js` (runner próprio); harness `testApp.js` com
   `requirePermission` real. `denyUnlessAlmoxAdmin`/`canConfigureAlmox` **não** aceitam
   `role:'admin'` puro — use `is_superadmin: 1` ou `perfil_almoxarifado: 'ADMINISTRADOR'`.

## Regras de negócio

| RN | Enunciado | Onde é provada |
|---|---|---|
| RN-01 | Salvar configurações é tudo ou nada (um `UPDATE` com `CASE`) | `configuracoesAtomicidade` |
| RN-02 | Escrita que **não** aconteceu não deixa rastro, e o 500 descreve banco intocado (**a versão anterior prometia "escrita que aconteceu tem rastro" — falso, a auditoria é best-effort desde a Etapa 19**; achado A5) | `configuracoesAtomicidade` |
| RN-03 | Excluir o que já está inativo não é um ato: 200 `ja_inativo`, **sem auditar** | `exclusaoIdempotente` |
| RN-04 | `changes` só decide "não existe" se o `WHERE` carregar o estado (`AND ativo = 1`) | `exclusaoIdempotente` |
| RN-05 | O retry de `SQLITE_BUSY` é transparente: o callback de quem pediu é chamado **uma vez**, na tentativa final | `sqliteConcurrency.test.js` |

## Contratos congelados

**C1 — `PUT /api/almoxarifado/configuracoes`** (gate `denyUnlessAlmoxAdmin`, inalterado)

Payload e respostas **inalterados** (`{ chave: valor }` → `{ success: true }`; 400 com as
mensagens literais que já existem). O que muda é interno: o laço de `UPDATE` (`:2506-2511`) vira

```js
const partes = entradas.map(() => 'WHEN ? THEN ?').join(' ');
const marcadores = entradas.map(() => '?').join(',');
await dbRun(db, `UPDATE configuracoes_almoxarifado
                    SET valor = CASE chave ${partes} END,
                        updated_at = CURRENT_TIMESTAMP, updated_by = ?
                  WHERE chave IN (${marcadores})`,
  [...entradas.flatMap(([c, v]) => [c, String(v)]), req.user.nome || req.user.email,
   ...entradas.map(([c]) => c)]);
```

**A ordem dos parâmetros importa e é fácil de errar:** os pares do `CASE` vêm primeiro, depois o
`updated_by`, depois as chaves do `IN`. `String(v)` continua sendo o que vai para a coluna — a
Etapa 19 decidiu logar o que foi de fato escrito, não o valor cru do body.

O laço de **validação** (`:2479-2504`) **não muda**: ele já roda inteiro antes de qualquer
escrita, e o comentário em `:2485` explica que é assim justamente por não haver transação.

**C2 — as CINCO rotas de exclusão.** Rotas em `tipo_material` `:1757`, `localizacao` `:1953`,
`setor` `:2118`, `familia` `:2353` e `material` `:623`; os `UPDATE ... ativo = 0` em `:1761`,
`:1968`, `:2133`, `:2369` e `:627`. (Achado A8: as linhas da versão anterior apontavam para o
`auditarCadastro`, não para as rotas — quem editasse por âncora erraria o alvo.)

```
UPDATE <tabela> SET ativo = 0 WHERE id = ? AND ativo = 1
```
- `changes === 1` → 200 como hoje **+ auditoria `EXCLUSAO`**.
- `changes === 0` **e** o `SELECT` anterior não achou linha → **404**, mensagem literal atual de
  cada rota (`'Tipo de material não encontrado'`, `'Localização não encontrada'`,
  `'Setor não encontrado'`, `'Família não encontrada'`) — **não invente mensagem nova**.
- `changes === 0` **e** a linha existe (já `ativo = 0`) → **200 `{ success: true, ja_inativo: true }`**,
  **sem auditoria**.

Cada uma dessas rotas usa `db.run(..., function (err) { this.changes })` — **`function`, não
arrow**: arrow não tem `this` e `this.changes` fica `undefined`. Três das quatro já leem
`changes`; o `setor` (`:2118`) **não lê** e precisa passar a ler.

---

### Task 0 (TRONCO, vai primeiro): o retry para de responder erro e gravar assim mesmo

**Files:** Modify `server/services/sqliteConcurrency.js`; Test `server/tests/sqliteConcurrency.test.js`
(o de `npm run test:sqlite` — **não** é um `*.api.test.js`, é o único lugar onde o wrapper roda
de verdade; o harness `tests/helpers/testApp.js:18` **não** chama `wrapDatabase`).

**Por que esta task existe:** a Fase 2 reproduziu que, sem ela, **a Task 1 não entrega a RN-01**.
`sqliteConcurrency.js:108-115` chama `cb.call(this, err)` em **toda** tentativa, inclusive nas
que vão ser refeitas. Como `services/almoxarifado/db.js` promisifica passando callback, um
`SQLITE_BUSY` faz `await dbRun(...)` **rejeitar**, a rota responde **500 e pula a auditoria**, e
o retry **aplica a escrita depois**. É o defeito nº 1 do design por um caminho que o `UPDATE`
único não fecha.

- [ ] **Step 1: teste que falha**, em `tests/sqliteConcurrency.test.js`. Cenário: segurar o lock
  com uma **segunda conexão**, disparar um `db.run` com callback pela conexão embrulhada, soltar
  o lock, e afirmar que o callback foi chamado **uma vez só** e **sem erro** (hoje é chamado 1×
  por tentativa, a primeira com `SQLITE_BUSY`). Use um contador, não só o último valor — a
  asserção de peso é a **contagem de chamadas**, e sem ela o cenário passa com o bug.
  `SQLITE_BUSY_TIMEOUT_MS=0` na env torna o cenário determinístico.
  Cenário irmão: quando **todas** as tentativas falham, o callback recebe o erro **uma vez**.
- [ ] **Step 2: implementar.** O `cb` sai de dentro do executor e passa a ser chamado na
  finalização do `retryAsync`. Cuidados **obrigatórios**:
  - **preservar o `this` do sqlite3** (`lastID`/`changes`) — é o motivo de o wrapper usar
    `function` e não arrow, e há comentário no arquivo dizendo isso;
  - manter o **retorno síncrono `db`** quando há callback (é o contrato do sqlite3, e há código
    no CRM que depende dele);
  - **não deixar rejeição sem handler**: hoje `enqueueWrite` anexa `.catch()` à cadeia; se você
    passar a tratar a promise para chamar o `cb`, garanta que o caminho de erro continue tratado,
    e que uma exceção lançada **dentro** do `cb` não vire `unhandledRejection`;
  - `db.get`, `db.all` e `db.exec` têm o mesmo padrão — **confira os quatro** e diga no relatório
    quais tinham o defeito.
- [ ] **Step 3: controle positivo** (commitar antes): volte o `cb.call` para dentro do executor →
  o cenário da contagem tem de cair **dizendo que houve 2 chamadas**, não por outro motivo.
- [ ] **Step 4:** `npm run test:sqlite` **e** `npm run test:api` (o wrapper não é usado pelo
  harness, mas uma regressão no contrato de `db.run` derruba tudo); commit.

---

### Task 1 (tronco): `PUT /configuracoes` atômico

**Files:** Modify `server/routes/almoxarifado.js`; Test `server/tests/api/configuracoesAtomicidade.api.test.js`.

- [ ] **Step 1: teste que falha.** Dois cenários:
  - **Caminho feliz:** salvar 3 chaves → 200, as três com o valor novo no banco, **uma** linha de
    auditoria com o diff das três.
  - **Falha no meio (o cenário que importa):** patchar `db.run` na **instância** para lançar no
    `UPDATE` de configuração (a técnica está em `fotoMaterialRastro.api.test.js` — o alvo é a
    instância `db`, que é o 1º argumento de `dbRun(db, ...)`, não o módulo, cujo binding é
    cacheado no require). Afirmar: **500**; **nenhuma** das chaves mudou de valor; e **nenhuma**
    linha de auditoria nova. Leia os valores do banco antes e depois — a asserção de peso é a de
    que o banco está intocado, não a do status.
  - **Guarda anti-teste-vazio:** antes de afirmar "nada mudou", afirme que as chaves **existem**
    e têm valor conhecido; senão o cenário passa com o banco vazio.
  - **O patch tem de ser SELETIVO PELA CHAVE** (achado A3, reproduzido — sem isto o controle
    positivo do Step 3 **não sabe falhar**): lance quando os params contiverem a **3ª** chave,
    não em qualquer `UPDATE configuracoes_almoxarifado`. Com o patch ingênuo, o laço antigo
    também deixa o banco limpo (o **primeiro** `UPDATE` já lança), então a sabotagem passa verde
    e a asserção que interessa fica sem prova. Contagem de chamadas também não serve: no código
    corrigido existe **uma** chamada só.
  - **O caminho feliz precisa de valores DIFERENTES dos atuais** (achado A9): a auditoria só é
    gravada `if (Object.keys(diff.novos).length)` (`:2525`), então reenviar os valores que já
    estão no banco produz **zero** linhas e o cenário falha por motivo alheio à RN-01.
- [ ] **Step 2: rodar, ver falhar** (hoje o segundo cenário falha por deixar chaves gravadas),
  **implementar o C1, verde.**
- [ ] **Step 3: controle positivo** (commitar antes): volte ao laço de `UPDATE` um-por-um,
  **mantendo o patch seletivo** → o cenário da falha no meio tem de cair **na asserção do banco
  intocado**, nomeando a chave que ficou gravada. Se cair só no status, a asserção que interessa
  não está provada. Resultado medido pela Fase 2 com o patch seletivo: `UPDATE` único →
  `["a=A","b=B","c=C"]` (intocado); laço → `["a=1","b=2","c=C"]` (duas gravadas).
- [ ] **Step 4: `npm run test:api`; commit.**

---

### Task 2 (galho): exclusão idempotente nas CINCO rotas

**Files:** Modify `server/routes/almoxarifado.js`; Test `server/tests/api/exclusaoIdempotente.api.test.js`.

**Independência:** toca o mesmo arquivo da Task 1, em trechos distantes — **serialize**, não
paralelize (mesmo arquivo = conflito de merge, e a Etapa 20 já registrou esse par como colisão).

**A QUINTA ROTA — `DELETE /materiais/:id` (`:623`), que o design não tinha visto** (achado A4).
Ela faz `UPDATE ... SET ativo = 0 WHERE id = ?` e audita `DESATIVACAO` sempre que o `SELECT`
achou a linha — ou seja, **desativar um material já inativo grava outra linha**, o mesmo ato sem
efeito da RN-03, na entidade central do módulo.

**E o comentário dela (`:620-622`) defende a doutrina OPOSTA**, com todas as letras: que
`dados_anteriores.ativo` precisa ser o valor real porque esse "é justamente o caso em que o log
importa (quem tentou desativar de novo, e quando)". **Decisão: a RN-03 vence e o comentário
está errado** — uma linha `DESATIVACAO` para um material que já estava inativo não se distingue,
na tela de auditoria que a Etapa 22 acabou de entregar, de uma desativação real. Registrar
tentativa sem efeito com o mesmo verbo do ato com efeito é o log mentindo por excesso, que é o
tema desta etapa. Se um dia houver valor em registrar tentativas, isso é um verbo próprio, não
o mesmo.

**Nesta rota o conserto é diferente das outras quatro:** ela responde `success: true` também
para id inexistente, e **isso fica inalterado** (foi declarado assim na Etapa 19; mudar para 404
seria mudança de contrato fora do tema). O que muda é só a condição da auditoria:
`if (antes && antes.ativo === 1)`. E **reescreva o comentário `:615-622`** dizendo que a segunda
razão estava errada e por quê — não apague, ele explica o `SELECT`, que continua necessário.

**DUAS COISAS QUE VOCÊ VAI ENCONTRAR E O PLANO ORIGINAL NÃO PREVIA:**

1. **Há um teste existente que fixa por escrito o comportamento que esta task conserta**
   (achado A2). `tests/api/auditoriaCadastros.api.test.js:339-354` é uma *characterization test*
   chamada `[limitacao declarada] DELETE de linha JA INATIVA segue 200 e audita um EXCLUSAO`, e
   ela afirma `length === 2`. Depois desta task vira **1** e o arquivo fica vermelho no Step 4.
   **Isso é esperado, não é sabotagem sua**: atualize o cenário para afirmar `1` e **reescreva o
   cabeçalho do arquivo** (`:22-26`, que declara a limitação como não corrigida) dizendo que a
   Etapa 23 a corrigiu — não apague, a limitação declarada virou pendência resolvida e o
   histórico ajuda quem ler.
2. **O `setor` (`:2118`) é diferente das outras três** (achado A6): ele já faz
   `if (!setor) return res.status(404)` **antes** do `UPDATE`, então o ramo "404 por `SELECT`
   vazio" do C2 é **inalcançável** ali — implementá-lo literalmente adiciona código morto. Para
   essa rota, `changes === 0` significa **sempre** "já inativa" → 200 `ja_inativo`.
   E há um caso que o C2 não previu: **setor já inativo cujo nome ainda é usado por localização
   ativa** cai no 400 de `:2128-2132` e nunca chega ao `UPDATE`. **Decisão:** esse 400 continua
   valendo — a mensagem fala do vínculo, que é verdade, e transformar em `ja_inativo` esconderia
   o vínculo de quem está tentando limpar o cadastro. Escreva isso no teste como cenário
   declarado, não deixe implícito.

- [ ] **Step 1: teste que falha.** Para **cada uma das quatro** entidades, o mesmo trio:
  criar → excluir (200, **1** linha `EXCLUSAO`) → excluir de novo (**200 `ja_inativo`, e o total
  de linhas de auditoria da entidade continua 1**) → id inexistente (**404**, nenhuma linha).
  A contagem de auditoria antes/depois é a asserção de peso; o status sozinho não pega o defeito
  (hoje a segunda exclusão **já** responde 200 — o que ela faz de errado é auditar).
- [ ] **Step 2: implementar o C2; verde.** Atenção ao `setor`, que hoje nem lê `changes`.
- [ ] **Step 3: controle positivo** (commitar antes), com alvo e leitura da asserção: tirar o
  `AND ativo = 1` de **uma** das quatro → o cenário da segunda exclusão **daquela entidade** tem
  de cair nomeando a linha de auditoria extra. Se cair o de outra entidade, ou cair pelo status,
  diga — é achado.
- [ ] **Step 4: `npm run test:api`; commit.**

---

### Task 3: integração e fechamento

- [ ] **Step 1:** cenário que cruza as duas tasks em `auditoriaFluxoCompleto.api.test.js` (ou
  arquivo próprio): excluir um tipo de material duas vezes e **ler pela tela-contrato**
  (`GET /auditoria?entidade=tipo_material`), afirmando que a trilha mostra **um** ato, não dois.
  É o que prova que o conserto aparece para quem audita — o motivo de a etapa existir.
- [ ] **Step 2:** os cinco comandos da suíte, com os números lidos. Rodar o cliente **também com
  `TZ=UTC`** (`client/jest.globalSetup.js` existe para isso desde a Etapa 22).
- [ ] **Step 3:** skill `fechar-etapa` inteira. Na spec 23, **os dois itens saem de "falta para
  🟢"** — e diga se a feature muda de cor.

## Próxima tarefa detalhada (para retomar sem reler o código)

Se parar aqui: o próximo passo é a **Fase 2** — agente fresco com este plano + o design, três
perguntas (os contratos cobrem os erros e as mensagens literais? as RN batem com o código? a
Task 2 é galho de verdade?). Dar atenção especial a **duas armadilhas já conhecidas**: `changes`
contando linha casada e não linha alterada (é o defeito que a etapa conserta — o plano não pode
repeti-lo em outro lugar), e a proibição de transação da Global Constraint 1, que é
contraintuitiva e um revisor desatento vai querer "corrigir".
