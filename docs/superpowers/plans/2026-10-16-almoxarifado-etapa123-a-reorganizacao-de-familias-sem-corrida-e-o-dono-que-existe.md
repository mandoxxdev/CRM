# Almoxarifado — Etapa 123: a reorganização de famílias sem corrida, e o dono que existe (plano)

> Origem: "Próxima tarefa detalhada — Etapa 123" do plano da 122 (**C221**, **C216**, **C223**).
> Design com a Fase 0 medida: `docs/superpowers/specs/2026-10-16-almoxarifado-etapa123-a-reorganizacao-de-familias-sem-corrida-e-o-dono-que-existe-design.md`.
>
> **Numeração** (conferida com `grep -oE` em `docs/almoxarifado-novidades-por-etapa.md` em 2026-10-16): última B **B792**,
> último C **C257**, última A **A71**. Esta etapa: **B793+**, **C258+**, **A72+**. Worktree `CRM-wt-e123`, branch `etapa-e123`
> (a partir da main `7279adb2`).
>
> **Ordem da skill:** este plano foi revisado (Fase 2) **antes** de qualquer código de produção (só o arquivo de teste da T1 foi
> escrito antes, vermelho 18/22).
>
> **Fase 2 (um revisor fresco, sondas `e123r-paiLido.js`, `e123r-lastid.js`, não versionadas): 1 Critical, 2 Important, 4 Minor,
> todos aceitos.** **C1 (reproduzido)** — o `PUT` que **não** muda o nível (o renomear da tela, que não manda `parent_id`) grava o
> `parent_id` lido no início sem condição: renomear S enquanto outra aba a muda para R2, inativa R1 e cadastra material (R2, S)
> → 200 e S volta ativa sob R1 inativa, com o material de par errado — reabria a C221 pelo único gesto da tela → o `UPDATE` leva
> **sempre** `AND parent_id IS ?` (o pai lido, molde do dono da 108), RN-06c. **I1** — com `ativo: 0` e mudança de nível no mesmo
> corpo, a retentativa da 110 ("outro já inativou") viraria a recusa do pai num 409 → **uma releitura só**, na ordem de hoje
> (404 → pai mudou 409 → itens → subfamílias ativas → reativação → subfamílias inativas → materiais → pai), contador único, e o
> `ativo = 1` só sai quando a linha relida já está inativa; RN-09b. **I2 (reproduzido)** — `INSERT … SELECT … WHERE` que não
> grava deixa `this.lastID` da inserção anterior → "não gravou" é só `this.changes === 0`; RN-01/01d afirmam sem `CRIACAO` e sem
> `id`. **M1** — existência do dono por `SELECT 1 FROM clientes`, não pelo nome. **M2** — ordem no `POST /materiais`: saldo
> inicial → dono → família (a do `PUT`: dono antes da família). **M3** — no `POST /familias`, "Nome é obrigatório" antes do pai
> inválido; o `0` numérico (hoje raiz calada) passa a dar 400 — o Antes→Agora diz. **M4** — a A73 conta também os materiais que
> apontam para família de pai 0.

## Regras de negócio

"Na janela" = a escrita do outro lado feita direto no banco logo depois da conferência citada (gancho em `db.get`, molde
`familiaMaterialCorrida.api.test.js`). Usuário Super Administrador nas rotas de família, salvo dito.

**C221 — as gravações de família com a conferência dentro do comando (B793).** Testes:
`server/tests/api/familiaHierarquiaCorrida.api.test.js`.

- **RN-01 — criar subfamília, a raiz inativada na janela** (depois de `validateParentFamilia`) → **400** *"Subfamília não pode ter
  filhos (máximo 2 níveis)"* (a literal de hoje para pai inativo), **nada gravado** (nenhuma família com o nome, nenhuma
  `CRIACAO`, corpo sem `id` — Fase 2, I2). Hoje: 201.
- **RN-01b — a raiz virou subfamília na janela** → o mesmo 400; **apagada** na janela → 400 *"Família pai não encontrada"*.
- **RN-01c — desfeito na janela** (inativada e reativada antes da releitura) → **201** (uma tentativa a mais, sem gastar código).
- **RN-01d — mudou duas vezes** (a releitura passa e a segunda gravação também não grava) → **409** *"A família principal mudou
  enquanto a subfamília era criada — nada foi gravado. Tente de novo."* (literal nova), nada gravado.
- **RN-02 — reativar subfamília (`PUT {ativo: 1}`), a raiz inativada na janela** (depois da leitura do pai) → **400** *"Não é
  possível reativar: a família principal desta subfamília está inativa — reative a família principal antes"*, subfamília
  **continua inativa**. Hoje: 200.
- **RN-03 — mudar a subfamília para a raiz R2, R2 inativada na janela** (depois de `validateParentFamilia`) → 400 *"Subfamília
  não pode ter filhos (máximo 2 níveis)"*, subfamília **continua sob a raiz antiga**. **RN-03b** — R2 virou subfamília na janela →
  o mesmo 400 (sem terceiro nível).
- **RN-04 — raiz vira subfamília, um material cadastrado nela na janela** (depois da contagem de materiais) → 400 *"Não é possível
  transformar em subfamília: a família tem 1 material(is) cadastrado(s) (contando os inativos)"*, **continua raiz**.
  **RN-04b** — subfamília muda de raiz, material (R1, S) na janela → 400 *"Não é possível mudar a família principal desta
  subfamília: ela tem 1 material(is) cadastrado(s) (contando os inativos)"*, S continua sob R1. **RN-04c** — subfamília vira raiz
  (`parent_id: null`), material na janela → o mesmo 400 da RN-04b.
- **RN-05 — raiz vira subfamília, nasce uma subfamília **ativa** nela na janela** (depois da contagem das ativas) → 400 *"Família
  com subfamília(s) ativa(s) não pode virar subfamília"*. **RN-05b** — nasce **inativa** (depois da contagem das inativas) → 400
  *"Família com subfamília(s) inativa(s) não pode virar subfamília — elas ficariam num terceiro nível"*. Continua raiz.
- **RN-06c — o pai lido (Fase 2, C1):** renomear a subfamília S (`{nome}` só, a tela) com o pai mudado na janela (S → R2) →
  **409** (a literal da RN-06), S continua sob R2; idem repetindo o pai lido (`{nome, parent_id: R1}`). Corrida real "renomear ×
  mudar de raiz": nunca volta ao pai antigo depois do 200 da mudança.
- **RN-06 — PUT, mudou duas vezes** → **409** *"A família mudou enquanto era salva — nada foi gravado. Recarregue a família e
  salve de novo."* (a literal da 110). **RN-06b — desfeito na janela** → 200 (uma tentativa a mais).
- **RN-07 — corrida real** (30 rodadas por ordem, as duas requisições juntas): criar subfamília × `DELETE` da raiz; reativar
  subfamília × `DELETE` da raiz; raiz vira subfamília × `POST /materiais` nela. **Nunca** sobra subfamília ativa sob raiz
  inativa, nem família-subfamília com material gravado como raiz. Metade positiva: em cada rodada **um dos dois** responde 2xx.
- **RN-08 — guardas (sem janela, gravam como hoje)**: criar subfamília 201; reativar subfamília 200; mudar de raiz 200; virar raiz
  200; raiz vira subfamília 200; renomear (sem `parent_id`/`ativo`) 200 — cada uma com a Auditoria (`CRIACAO`/`EDICAO`) de sempre.
- **RN-09 — a inativação da 110 continua** (os testes de `familiaMaterialCorrida`): inalterada; com `ativo: 0` **e** mudança de
  nível no mesmo corpo, a recusa de itens vem primeiro (a ordem de hoje). **RN-09b (Fase 2, I1)** — `{ativo: 0, parent_id: R2}`
  numa subfamília sem material, R2 inativada na janela → **400** *"Subfamília não pode ter filhos (máximo 2 níveis)"* (não o 409).

**C216 — o dono que não existe (B794).** Testes: `server/tests/api/materialDonoInexistente.api.test.js`.

- **RN-10 — `POST /materiais` com `proprietario_cliente_id` que não está em Clientes** → **400** *"O cliente dono informado
  (#⟨n⟩) não existe em Clientes — escolha um cliente cadastrado ou deixe o material como estoque próprio."* (literal nova), nada
  gravado (material, saldo, Auditoria). Também pelo serviço (`materialService.createMaterial` lança com `status` 400).
- **RN-10b — metade positiva:** cliente **inativo** (`status = 'inativo'`) → 201 com o dono; dono vazio/`null` → 201 nosso.
- **RN-10c — ordem:** com saldo inicial e dono inexistente → a recusa do saldo inicial (*"…: é de cliente…"*) vem antes (a de hoje);
  dono inexistente **e** família inativa → a do dono (saldo inicial → dono → família, Fase 2, M2). Existência por
  `SELECT 1 FROM clientes WHERE id = ?` (M1: cliente com `razao_social` vazia existe).
- **RN-11 — `PUT` trocando para um dono inexistente** (material sem histórico, Almoxarife) → 400 (a literal), dono gravado
  **inalterado**.
- **RN-11b — ordem:** material **com histórico**, Almoxarife, dono inexistente → **403** da troca de dono (a de hoje), não o 400.
- **RN-12 — o legado continua editável:** material com dono 77777 gravado direto (cliente que não existe) → `PUT` renomeando sem a
  chave → 200; repetindo a mesma chave (77777) → 200; para `null` → 200 (sem histórico).

**C223 — o pai 0 (B795).** Testes: `server/tests/api/familiaPaiZero.api.test.js`.

- **RN-13 — `POST /familias` com `parent_id` informado e não vazio que não é inteiro positivo** (`"0"`, `0`, `"abc"`, `"1.5"`,
  `-1`) → **400** *"Família pai não encontrada"* (a literal do `PUT` desde a 103), nada gravado; sem nome → *"Nome é obrigatório"*
  primeiro (M3). `null`, `""` e omitido → raiz
  (201). `"5"` de uma raiz ativa → subfamília (201).
- **RN-14 — o reparo no boot** (`schema.migrateRepararFamiliaPaiZero`, chamada direta, ledger apagado antes): família com
  `parent_id = 0` → `NULL`; as outras intocadas; ledger `reparo_familia_pai_zero` gravado. Segunda chamada com o ledger → não toca
  (um 0 gravado à mão depois continua 0). Depois do reparo, cadastrar material nela → 201 (antes: 400 *"A família escolhida é uma
  subfamília — …"*).
- **RN-14b — primeiro boot** (prova manual, `CRM_DATA_DIR` em pasta vazia + `node index.js`, duas vezes): ledger gravado, 0
  `no such`; banco **antigo** (boot com `7279adb2` numa worktree destacada + uma família com pai 0 semeada) + boot com o código
  novo → a família vira raiz.

## Contrato congelado

- `POST /api/almoxarifado/familias`: novo **400** *"Família pai não encontrada"* para `parent_id` informado não inteiro positivo;
  novo **409** *"A família principal mudou enquanto a subfamília era criada — nada foi gravado. Tente de novo."* O resto igual.
- `PUT /api/almoxarifado/familias/:id`: nenhuma literal nova; as recusas de hoje passam a sair também quando a condição muda na
  janela; o 409 da 110 também para as mudanças de nível/pai **e para o renomear da tela quando o pai mudou no meio** (C1 da Fase 2;
  a tela já mostra a literal no toast).
- `POST/PUT /api/almoxarifado/materiais`: novo **400** *"O cliente dono informado (#⟨n⟩) não existe em Clientes — escolha um
  cliente cadastrado ou deixe o material como estoque próprio."* No `PUT`, só quando o dono muda para um id; depois do 403 da troca.
- **Schema:** nenhuma coluna. Ledger `reparo_familia_pai_zero` (`schema_migrations_almoxarifado`). A tela não muda (o seletor de
  dono só oferece cadastrados; a aba Famílias não manda `parent_id` inválido).

## Tasks (sort topológico)

- [ ] **T1 — tronco (C221)** — `routes/almoxarifado.js` (`POST`/`PUT /familias`). RN-01..RN-09. As conferências do `PUT` viram
  funções que a primeira passada **e** a releitura chamam (uma régua só).
- [ ] **T2 — galho (C216)** — `services/almoxarifado/materialService.js` (`createMaterial`), `routes/almoxarifado.js` (`PUT
  /materiais`, depois de `assertTrocaDeDonoPermitida`). RN-10..RN-12. Worktree própria (`CRM-wt-e123-g1`), regra e trecho
  disjuntos da T1 (material × família); entra por cherry-pick **só depois da suíte inteira passar na branch com ele**.
- [ ] **T3 — tronco (C223)** — `routes/almoxarifado.js` (`POST /familias`, o mesmo trecho da T1 → depois dela),
  `services/almoxarifado/schema.js` (`migrateRepararFamiliaPaiZero`, exportada, chamada no `initSchema`). RN-13..RN-14b.
- [ ] **T4 — integração** — `server/tests/api/familiasSemCorridaIntegracao.api.test.js`: (i) **pela rota**: cliente → raiz e
  subfamília pelo `POST` → material (raiz, sub) com o dono cadastrado (201) e com um inexistente (400) → corrida "raiz vira
  subfamília × cadastro de material" pela rota → família com pai 0 semeada, reparo, material nela (201); (ii) **pelo serviço**:
  `materialService.createMaterial` com dono inexistente lança 400 e `schema.migrateRepararFamiliaPaiZero` repara.
- [ ] **T5 — fechamento** (skill `fechar-etapa`), com a **A72..A74** medidas no banco de uma sonda.

Galho: só a T2. A suíte inteira roda **uma por vez**, sempre na branch; o galho roda só os próprios arquivos e os vizinhos.
