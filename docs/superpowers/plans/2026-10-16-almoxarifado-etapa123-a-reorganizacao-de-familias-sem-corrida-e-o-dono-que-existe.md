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

- [x] **T1 — tronco (C221)** `9f035163` — `routes/almoxarifado.js` (`POST`/`PUT /familias`). RN-01..RN-09. As conferências do `PUT` viram
  funções que a primeira passada **e** a releitura chamam (uma régua só).
- [x] **T2 — galho (C216)** `c97fe07f` (worktree g1 — o hash de lá, `62fec429`, ficou só no reflog e não existe na branch; entrou por cherry-pick **sem commit** (`-n`), a suíte inteira
  rodou na branch com ele e só então o commit) — `services/almoxarifado/materialService.js` (`createMaterial`), `routes/almoxarifado.js` (`PUT
  /materiais`, depois de `assertTrocaDeDonoPermitida`). RN-10..RN-12. Worktree própria (`CRM-wt-e123-g1`), regra e trecho
  disjuntos da T1 (material × família); entra por cherry-pick **só depois da suíte inteira passar na branch com ele**.
- [x] **T3 — tronco (C223)** `c63c1b4b` — `routes/almoxarifado.js` (`POST /familias`, o mesmo trecho da T1 → depois dela),
  `services/almoxarifado/schema.js` (`migrateRepararFamiliaPaiZero`, exportada, chamada no `initSchema`). RN-13..RN-14b.
- [x] **T4 — integração** `bbef8aea` — `server/tests/api/familiasSemCorridaIntegracao.api.test.js`: (i) **pela rota**: cliente → raiz e
  subfamília pelo `POST` → material (raiz, sub) com o dono cadastrado (201) e com um inexistente (400) → corrida "raiz vira
  subfamília × cadastro de material" pela rota → família com pai 0 semeada, reparo, material nela (201); (ii) **pelo serviço**:
  `materialService.createMaterial` com dono inexistente lança 400 e `schema.migrateRepararFamiliaPaiZero` repara.
- [x] **T5 — fechamento** (o commit de documentação desta etapa — ver `git log`). CLAUDE.md: a seção da trava **não mudou** (nada desta etapa pega
  ou solta a trava por material; o `PUT` de material que inativa ou muda controle continua sob ela, como na 113/115). Compras:
  nenhum código tocado, `docs/compras-novidades-por-etapa.md` não se aplica. (skill `fechar-etapa`), com a **A72..A74** medidas no banco de uma sonda.

Galho: só a T2. A suíte inteira roda **uma por vez**, sempre na branch; o galho roda só os próprios arquivos e os vizinhos.

## Execução — o que aconteceu

- **Fase 0** (sondas `e123fase0.js`, `e123a.js`, `e123a73b.js`, não versionadas): as oito janelas do design reproduzidas (201/200 em
  todas); pela rota, criar sub × *Inativar* a raiz 18/30 e 22/30, reativar sub × *Inativar* 9/30 e 3/30. A C221 estava incompleta (o
  terceiro nível e a mudança para raiz sendo inativada) e a **C223 estava errada** (o `POST` ainda gravava o pai 0). A C216 medida:
  201/200 com dono inexistente; `clientes` não tem `DELETE` no sistema.
- **Fase 2 antes do código de produção** (só o arquivo de teste da T1 foi escrito antes, vermelho): 1 Critical, 2 Important, 4 Minor,
  todos aceitos (ver o topo). Design e plano `40b7e08e`.
- **TDD:** `familiaHierarquiaCorrida` vermelho 18/22 (as guardas RN-08/RN-09 e a corrida natural "raiz vira sub × material" passam
  antes, de propósito — a natural é guarda); depois do C1 da Fase 2, 20/26; `materialDonoInexistente` 9/10 (o cliente inativo passa
  antes); `familiaPaiZero` 4/6; `familiaCorridaFase5` 5/7.
- **Galho em paralelo:** T2 numa worktree (`CRM-wt-e123-g1`, subagente) enquanto a T1 corria na branch. **A lição da 122 aplicada:** o
  cherry-pick entrou com `-n` (sem commit), a suíte inteira rodou na branch com ele (`test:api` 411/411, as outras quatro e o client) e
  só então o commit — o galho não entrou sem suíte. O galho rodou só os próprios arquivos e os vizinhos que citam
  `proprietario_cliente_id`.
- **Controles positivos** (âncora contada = 1, md5 antes/depois/restauro, restauro por cópia): T1 11 sabotagens (10 derrubam o cenário
  certo; o "pai mudou → 409" é equivalente — a tentativa a mais chega no mesmo 409); T2 7 (subagente); T3 5; T4 5 (o NOT EXISTS de
  material do `PUT` não derruba a corrida natural — quem o prende é a RN-04 com a janela injetada); Fase 5 4 (1 equivalente).
- **Migração e primeiro boot:** `CRM_DATA_DIR` vazio + `node index.js` duas vezes → 0 `no such`, ledger gravado; banco do código de
  antes (`7279adb2`, worktree destacada, removida) com uma família de pai 0 + boot com o código novo → *"Migração
  reparo_familia_pai_zero aplicada (1 família(s) com pai 0 viraram família principal)"*, `parent_id` NULL.
- **Fase 5** — três revisores frescos em paralelo, cada um na sua worktree (removidas). **Regra (r1):** 0 achados; comparou 475 `PUT`
  de família (19 famílias × 25 corpos) no código de antes e no novo — idênticos byte a byte; refez o primeiro boot. **Concorrência
  (r2):** 2 Important + 1 Minor, todos **anteriores** à etapa e reproduzidos 1/1 com a janela pelas rotas (0/30 na corrida natural) →
  corrigidos `91e95c80` (B796, B797, B798). **Sabotagem (r3):** 78 sabotagens, 68 derrubaram pela asserção certa, 4
  equivalentes/inalcançáveis, **6** Minor sem prova → `familiaSabotagemFase5` (`0106f6b5`). O r1 e o r3 viram `EADDRINUSE` ao rodar
  arquivos em paralelo na máquina → `familiaHierarquiaCorrida` passou a usar `app.listen(0)`.
- **Suíte final (medida depois de `0106f6b5`, antes da documentação):** `test:api` **415/415** (0 EADDRINUSE); `test:almoxarifado`
  **44/0**; `test:validation` 4/0, `test:safealter` 3/0, `test:sqlite` 10/0; client **115** suítes / **1630** testes; `CI=true build`
  *Compiled successfully*.
- **Divergências do plano:** (1) o arquivo de teste da T1 foi escrito antes da Fase 2 terminar (nenhum código de produção); (2) a Fase
  5 trouxe três correções de produção fora do escopo previsto (anteriores à etapa, mesma forma da C221); (3) o commit `91e95c80` cita
  `test:api 415/415`, medido com o arquivo do commit seguinte (`0106f6b5`, só testes) já presente — a suíte não rodou entre os dois;
  (4) dois vizinhos (`familiaMaterialCorrida`, `controleSobATravaSabotagem`) falharam uma vez cada rodando em série **enquanto o r3
  rodava os dele** na mesma máquina — repetidos duas vezes, verdes; não reproduzido fora da contenção (a mesma família do
  EADDRINUSE).

## Retro (4 números)

1. **Rodadas de correção até verde:** **1** na Fase 5 (três correções de produção + seis cenários, numa rodada). Um teste antigo mudou
   de âncora (não de comportamento): o `[RN-09]` da 110 em `familiaMaterialCorrida` passou a injetar no SQL da primeira passada (a
   releitura do `PUT` agora é ela).
2. **Achados da revisão:** Fase 2 — **1 Critical + 2 Important + 4 Minor, todos reais**. Fase 5 — r1 **0**; r2 **2** Important + **1**
   Minor reais (anteriores, corrigidos); r3 **6** Minor sem prova (viraram teste); **0** ruído.
3. **Paralelismo:** **1** galho em paralelo de fato (T2), **0** retrabalho, **0** conflito no cherry-pick; três revisores em paralelo
   na Fase 5. **Custo de ambiente:** arquivos de teste rodando em paralelo na máquina (revisores) dão falso vermelho — a suíte inteira
   rodou sempre sozinha, 0 EADDRINUSE.
4. **Defeito que escapou:** *(preencher na Etapa 124)*.

## Próxima tarefa detalhada — Etapa 124

*(A série desta etapa foi B793–B799, C258, A72–A74 — a 124 começa em **B800**, **C259**, **A75**; confira com `grep -oE` antes.)*

**Como foi escolhida (mapa e os C abertos, medidos em 2026-10-16):** as features 🟡 continuam 00, 01, 05, 06, 21, 22 e 23. O que
**não** depende do P.O.:

1. **D (123) — o formulário de material aberto há minutos grava a família que mostra** (feature 01). O `PUT /materiais/:id` só protege
   o que muda **dentro** do salvar (B798); o formulário manda `familia_id`/`subfamilia_id` de quando abriu, e uma mudança feita por
   outra pessoa entre abrir e salvar é desfeita (validada como troca de família). **Molde pronto:** a **C233** (Etapa 116,
   `controles_lidos`): o formulário manda o par que leu; lido ≠ gravado **e** gravaria ≠ gravado → 409 com literal nova; sem a chave,
   o comportamento de hoje. Medir antes: `MaterialAlmoxarifadoForm.js` (`loadMaterial`, o ref dos controles lidos),
   `materialService.controlesDesfeitos` (o molde), o `MaterialUpdateSchema` (o `z.object` descarta chave não declarada — a 116
   tropeçou nisso). **Não depende do P.O.**
2. **C231 — a recusa da aprovação manda reativar o material quando a família também está inativa** (feature 06/04):
   `services/almoxarifado/requisicaoMaterialInativo.js` (`reativar()`, usada em `mensagemAprovar`, `mensagemEnviar`,
   `mensagemSeparar`) nomeia quem edita material; com a família inativa, o Reativar recusa (*"Família inativa — não é possível vincular
   novos itens"*). Correção candidata: `lerCodigosInativosPendentes` devolve também se a família do material está inativa, e a frase
   passa a nomear a reativação da família (Configurações → Famílias, Administrador) antes da do material (B reversível — texto).
   Atenção: as três mensagens têm testes com a literal (`grep -rn "Reative o material" server/tests`). **Não depende do P.O.**
3. **A73 — o pai que aponta para família inexistente:** sem reparo (não medido em produção). Só se a consulta da A73 achar linhas.
4. **Dependem do P.O.:** **B755**, **B761**/**C239**, **C224**, o resto da **C225**, **C228**, **C219**, **C230**, o reparo da **C246**
   (e a **C247**).

**Escolhida: D (123) + C231.**

**Contrato candidato:** D (123) — `PUT /materiais/:id` com a chave nova do par lido (congelar o nome no plano) → 409 com literal nova
(congelar no plano) quando o lido difere do gravado e o salvar o desfaria; sem a chave, o de hoje. C231 — as três literais da
`requisicaoMaterialInativo` com o ramo da família inativa.

**Pontos de atenção:** o formulário de material já manda `controles_lidos` (116) — a chave nova anda junto, no mesmo ref; o
`MaterialUpdateSchema` precisa declará-la; a ordem entre o 409 do par lido, o da C233 (logo depois do 404) e o 403 da troca de dono
— decidir no plano e prender em teste; a revisão do plano vem **antes** do código; galhos e revisores não rodam arquivos de teste ao
mesmo tempo que a suíte (o falso vermelho de arquivos em paralelo voltou a aparecer nesta etapa).

**O que já está pronto e não precisa reabrir:** as gravações de família com a conferência no comando (B793) e a edição que confere o
pai, a situação e o par lidos dentro do salvar (B796, B798); o dono que existe (B794); o pai 0 (B795) e o reparo no boot.
