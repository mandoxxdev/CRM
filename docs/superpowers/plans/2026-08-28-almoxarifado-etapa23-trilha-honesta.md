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
   única** conexão SQLite para o CRM inteiro (verificado: é o único `new sqlite3.Database` do
   servidor), e transação em SQLite é por **conexão**, não por requisição. Entre um `BEGIN` e um
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
| RN-02 | Escrita que aconteceu tem rastro; escrita que não aconteceu não tem | `configuracoesAtomicidade` |
| RN-03 | Excluir o que já está inativo não é um ato: 200 `ja_inativo`, **sem auditar** | `exclusaoIdempotente` |
| RN-04 | `changes` só decide "não existe" se o `WHERE` carregar o estado (`AND ativo = 1`) | `exclusaoIdempotente` |

## Contratos congelados

**C1 — `PUT /api/almoxarifado/configuracoes`** (gate `denyUnlessAlmoxAdmin`, inalterado)

Payload e respostas **inalterados** (`{ chave: valor }` → `{ success: true }`; 400 com as
mensagens literais que já existem). O que muda é interno: o laço de `UPDATE` (`:2505-2511`) vira

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

**C2 — as quatro rotas de exclusão** (`tipo_material` `:1765`, `localizacao` `:1973`,
`setor` `:2136`, `familia` `:2374`)

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
`changes`; o `setor` (`:2136`) **não lê** e precisa passar a ler.

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
- [ ] **Step 2: rodar, ver falhar** (hoje o segundo cenário falha por deixar chaves gravadas),
  **implementar o C1, verde.**
- [ ] **Step 3: controle positivo** (commitar antes): volte ao laço de `UPDATE` um-por-um → o
  cenário da falha no meio tem de cair **na asserção do banco intocado**, nomeando a chave que
  ficou gravada. Se cair só no status, a asserção que interessa não está provada.
- [ ] **Step 4: `npm run test:api`; commit.**

---

### Task 2 (galho): exclusão idempotente nas quatro rotas

**Files:** Modify `server/routes/almoxarifado.js`; Test `server/tests/api/exclusaoIdempotente.api.test.js`.

**Independência:** toca o mesmo arquivo da Task 1, em trechos distantes — **serialize**, não
paralelize (mesmo arquivo = conflito de merge, e a Etapa 20 já registrou esse par como colisão).

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
