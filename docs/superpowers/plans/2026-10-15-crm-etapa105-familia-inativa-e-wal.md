# Etapa 105 — família com material ativo não se inativa pelo PUT (G10c); WAL entra no primeiro boot (G12)

> Frente **Compras/cadastros (core)**, worktree `CRM-wt-e105`, branch `etapa-e105` (de `main` `4ade626f`).
> Design (Fase 0 medida por sonda): `docs/superpowers/specs/2026-10-15-crm-etapa105-familia-inativa-e-wal-design.md`.

> **Estado (2026-10-15):** 🟢 fechada — T1–T3 feitas, Fase 5 incorporada; commits e números medidos no fim. Baseline (`4ade626f`): `test:api` 351/351.

## Regras de negócio

Definição usada em todas: **"ativo"** = `Number(valor) === 1` (`1`, `'1'`, `true`); qualquer outra coisa
(`0`, `'0'`, `false`, `'false'`, `null`) é inativo — a mesma régua da Etapa 103 (`COALESCE(ativo, 0) <> 1`).
"Informado" = a chave `ativo` presente no corpo (`!== undefined`).

### G10c — inativar pelo PUT segue a regra do "Inativar" da tela (o DELETE)
- **RN-105.01** `PUT /api/almoxarifado/familias/:id` com `ativo` **informado e inativo** numa família hoje
  **ativa** (transição) que tem material **ativo** — `materiais_almoxarifado` com
  `(familia_id = :id OR subfamilia_id = :id) AND ativo = 1`, a **mesma contagem** do `DELETE` (um helper só,
  usado pelas duas portas) — → **400**, nada gravado, com a literal do DELETE:
  **L-I** `Não é possível remover: família possui ${n} item(ns) ativo(s)`.
  Cenários: raiz com 1 material ativo + `ativo: 0` → L-I(1); sub com material (`subfamilia_id`) + `ativo: 0` → L-I;
  `ativo: false`, `'0'`, `'false'` → L-I; a mesma família pelo `DELETE` → **a mesma string** (integração entre portas).
- **RN-105.02** (metade positiva) só material **inativo** + `ativo: 0` → 200; família **já inativa** com material ativo
  (legado) renomeada com `ativo: 0` → 200 (não é transição — o PUT não trava a edição de quem já estava inativo);
  `ativo` omitido → 200 e preserva (corpo da tela); `ativo: 1` numa ativa com material → 200.
- **RN-105.03** a checagem já existente de **subfamília ativa** na inativação (`Não é possível inativar: família possui
  subfamília(s) ativa(s)`, literal inalterada) passa a usar a mesma régua de inativo: `ativo: 'false'` numa raiz com
  sub ativa → 400 (hoje 200 e grava o texto). Cenário: raiz com sub ativa + `'false'` → 400 com a literal; nada gravado.
- **RN-105.04** (o inverso) `PUT` com `ativo` **informado e ativo** numa família hoje **inativa** (reativação) que é
  **subfamília**, **sem mudar de pai** (`parent_id` omitido ou igual ao gravado), cujo pai gravado está **inativo** →
  **400** **L-R** `Não é possível reativar: a família principal desta subfamília está inativa — reative a família principal antes`;
  pai gravado que **não existe** → 400 `Família pai não encontrada`. Nada gravado.
  Cenários: sub inativa de raiz inativa + `ativo: 1` → L-R; idem repetindo `parent_id` → L-R (hoje dá a mensagem
  enganosa de "máximo 2 níveis"); idem `'1'`/`true` → L-R; reativar a raiz primeiro e depois a sub → 200/200;
  sub inativa de raiz **ativa** + `ativo: 1` → 200; renomear a sub inativa **sem** `ativo` (raiz inativa) → 200;
  reativar a sub mudando para outra raiz ativa → segue as regras de mudança de nível (fora desta RN).
- **Ordem das recusas do PUT (nova):** nome vazio → parent_id inválido → 404 → pai de si mesma →
  **material ativo na inativação (L-I)** → inativar com sub ativa → virar sub com sub ativa →
  **reativar sub com pai inativo/inexistente (L-R)** → virar sub com sub inativa (L-F3) → material na mudança de nível
  (L-F1/L-F2) → pai inválido (`validateParentFamilia`). L-I antes da sub ativa = a ordem do DELETE (itens, depois subs).

### G12 — WAL no primeiro boot
- **RN-105.05** `configureSqlite(db)`, chamado no callback do open, pede `PRAGMA journal_mode = WAL` como comando
  **exclusivo** do driver (`db.exec`), antes de qualquer outra instrução da conexão — inclusive as que os módulos
  enfileiraram antes do open. Depois lê `PRAGMA journal_mode` e loga **`[SQLite] WAL mode enabled`** só se ler
  `wal`; senão **`[SQLite] WAL mode unavailable: journal_mode=<modo lido>`**; erro do exec →
  `[SQLite] WAL mode unavailable: <mensagem>` (como hoje). Os outros PRAGMAs não mudam.
  Cenários (test:sqlite): banco em arquivo novo com 40 `CREATE TABLE IF NOT EXISTS` + 40 `SELECT … sqlite_master`
  enfileirados antes do open → `journal_mode` lido por outra conexão depois de fechar = **`wal`**; banco já em WAL
  → continua `wal`; banco existente em `delete` → vira `wal` (B53).
- **RN-105.06** (prova de boot real, manual, citada com número) `CRM_DATA_DIR=<pasta vazia>` + `node index.js`,
  processo morto, `PRAGMA journal_mode` = `wal` em N de N boots novos, e zero `WAL mode unavailable` no log. Banco
  `delete` de antes da correção, um boot depois → `wal`.

## Contratos congelados
- `PUT /api/almoxarifado/familias/:id` — novos 400 `{ error: L-I }`, `{ error: L-R }`, `{ error: 'Família pai não encontrada' }`
  (reativação com pai inexistente); 400 `{ error: 'Não é possível inativar: família possui subfamília(s) ativa(s)' }`
  passa a valer também para `ativo` inativo não numérico. Resto inalterado. `DELETE` inalterado (só passa a usar o
  helper da contagem).
- `configureSqlite(db)` — mesma assinatura, síncrona; os logs acima.
- Nenhuma tela muda (a aba Famílias não manda `ativo` e usa o DELETE para inativar).

## Fase 2 — revisão do plano (agente fresco, 2026-10-15) e o que mudou
**1 alto, 2 médios, 5 baixos; todos reais e incorporados (as emendas valem sobre o texto acima):**
- **(A1) O teste do G12 podia nascer vazio.** Com os 40 `SELECT` por `db.all`, o código **antigo** também dá `wal` 8/8:
  o `all` vai até o fim e se reseta. Só reproduz com **`db.get` que devolve linha** (o statement fica ativo até o
  `finalize` — é ele a "transaction"). O cenário da RN-105.05 usa `db.get`, e o controle `exec → run` tem de ler
  `delete` antes de o teste valer.
- **(M1) `ativo` era gravado cru** (`'true'` e `'false'` como texto, `2`, `'[object Object]'`); a família com `'false'`
  some das duas listas (`?ativo=0` filtra `= 0`). Emenda **RN-105.00**: `ativo` informado é **normalizado** —
  `1`, `'1'`, `true`, `'true'` → 1; `0`, `'0'`, `false`, `'false'`, `null` → 0; qualquer outro → **400**
  **`Ativo inválido: use 0 ou 1`** (logo depois do 404). Todas as RN abaixo leem o valor normalizado; o gravado é 0/1.
- **(M2) A checagem de subfamília ativa valia sem transição** — renomear uma raiz **já inativa** com sub ativa (o legado
  que a RN-105.04 fecha) já dava 400 "Não é possível inativar…". Emenda à RN-105.03: a checagem só vale na **transição**
  ativa → inativa, como a L-I. A raiz já inativa com sub ativa renomeia (200).
- **(B1)** "é subfamília" na RN-105.04 = `!!current.parent_id` (o legado com `parent_id = 0` é raiz, como o `eraRaiz` da 103).
- **(B2)** o helper da contagem recebe de cada rota **o mesmo valor que ela já usava** (o DELETE, `req.params.id` cru —
  `DELETE /familias/5abc` continua 404, não conta os itens da 5).
- **(B3)** muda qual mensagem sai num caso existente: raiz com sub ativa **e** material ativo, `ativo: 0` → antes
  "Não é possível inativar…", agora L-I (a ordem do DELETE). `subfamilias.api.test.js` confere só o status.
- **(B4)** com o `exec` exclusivo, os outros PRAGMAs (`synchronous`, `foreign_keys`…) iriam para o **fim** da fila do
  pré-open (antes saíam na hora). Emenda: eles vão num segundo `exec` de dentro do callback do primeiro (ali
  `pending == 0`: também fura a fila), e a leitura do modo no callback do segundo. `exec`/`get` **crus**, capturados
  antes do `wrapDatabase` (o `exec` embrulhado passa por uma promise e perderia a vez).
- **(B5)** callbacks defensivos: o `exec` sempre com callback (sem ele o erro vira evento `'error'` sem ouvinte e derruba
  o processo); a leitura trata `err`/linha vazia. Ordem em `index.js` inalterada: `configureSqlite` → `wrapDatabase`.
  `:memory:` passa a logar `WAL mode unavailable: journal_mode=memory` (verdade — antes dizia "enabled").

## Tasks
- [x] **T1 (G10c, galho)** `routes/almoxarifado.js`: helper da contagem de itens ativos (PUT e DELETE), RN-105.01–04.
  Teste novo `tests/api/familiaInativaPeloPut.api.test.js`. Controles: tirar a checagem L-I; contar todos os materiais
  (inclusive inativos); checar sem transição (sempre); régua `=== 0` em vez de `!== 1`; tirar L-R; L-R sem a condição
  "sem mudar de pai"; DELETE com contagem própria divergente (prova de que o helper é um só).
- [x] **T2 (G12, galho)** `services/sqliteConcurrency.js` RN-105.05 + cenários em `tests/sqliteConcurrency.test.js`.
  Controle: `db.exec` → `db.run` (tem de ler `delete`); log "enabled" sem ler o modo.
- [x] **T3** prova de boot real RN-105.06 (antes já medido: 1/7 e 0/6), suíte completa, revisão adversarial por agente
  fresco, fechamento.

T1 e T2 não compartilham regra nem arquivo — executor único em série (etapa pequena).

## Execução — o que foi feito em cada task (divergências incluídas)
Baseline (`4ade626f`, antes de qualquer mudança): `test:api` **351/351**.
- [x] **T1 (G10c)** — `80b15bc9` (+ `4379f2da`, Fase 5). `familiaInativaPeloPut.api.test.js` (35 na entrega, 38 depois da Fase 5; na rodada TDD 22 vermelhos e os 12 da metade
  positiva verdes). Controles (11, todos vermelhos na asserção certa): sem a L-I (9 vermelhos); helper contando os
  inativos (2: a contagem 2-de-3 e o "só inativo → 200"); sem a transição (2: legado com item e legado com sub ativa);
  sem normalizar (13); sem a L-R (5); L-R também mudando de pai (1: o cenário de reativar mudando de raiz, acrescentado
  depois da 1ª passada justamente para esta sabotagem ter onde cair); DELETE com literal própria (2: integração e
  ordem); `parent_id = 0` tratado como sub (1); sem chamar a checagem de itens (9); régua da sub ativa sem transição
  (1). **A 1ª tentativa da sabotagem da contagem abortou** (âncora de duas linhas: `grep -cF` contou 2) — refeita com
  âncora de uma linha. Suítes vizinhas sem mudança: `subfamilias` 32, `familiaMudaDeNivel` 14, `exclusaoIdempotente`
  20, `auditoriaCadastros` 24.
- [x] **T2 (G12)** — `1ace8b88` (+ `d46126c9`, Fase 5). Quatro cenários em `sqliteConcurrency.test.js` (9 no total; na rodada TDD 3 vermelhos
  sobre o código antigo — o de PRAGMAs passou de primeira, é metade positiva). Controles (3): `db.run` no lugar do
  `exec` → lê `delete` (2 vermelhos); "enabled" sem ler o modo → cai o de `:memory:`; **adiar o `exec`
  (`setImmediate`) NÃO derrubou nada** — o `exec` exclusivo adiado ainda espera a fila esvaziar e trava antes do
  próximo, então nesse desenho a captura do `exec` cru antes do `wrapDatabase` é **precaução sem prova** (declarado no
  comentário do código; mantida porque o `exec` embrulhado passa por uma promise e a ordem deixaria de ser a do driver).
- [x] **T3** — prova de boot real (RN-105.06), `CRM_DATA_DIR` em pasta vazia + `node index.js` (porta 3995), processo
  morto, `PRAGMA journal_mode` lido por outra conexão:
  | | Antes (`4ade626f`) | Depois (`1ace8b88`) |
  |---|---|---|
  | 1º boot, pasta nova | `wal` 1 de 7 (aviso "unavailable" em 6) | **`wal` 6 de 6**, 0 "unavailable", admin criado 6/6, 0 `no such table`/`no column named` |
  | boots seguintes sobre banco `delete` | `delete` 6 de 6 | o mesmo banco `delete` de antes → **`wal` em 1 boot** |
  | 2º boot de um banco novo | — | `wal` |
  | `uncaughtException` do `PRAGMA temp_store` | 1 de 7 | 0 de 6 |
  Achado lateral (G16, não corrigido): `Erro schema almoxarifado v3 (tentativa 1/3): UNIQUE constraint failed:
  setores_almoxarifado.nome` em 3 de 7 boots antes e 5 de 6 depois; a tentativa 2 passa sempre (o `initSchema` do
  almoxarifado roda duas vezes ao mesmo tempo no boot — `routes/almoxarifado.js:263` e `extended.js`).

## Fase 5 — revisão adversarial final (dois agentes frescos em paralelo, 2026-10-15)
**G10c (rota): 0 altos, 0 médios, 3 baixos reais (anteriores à 105, mas no caso que ela fecha); 2 corrigidos (`4379f2da`), 1 declarado.**
1. (Baixa) reativar sub cujo pai também é sub (3º nível legado) sem `parent_id` → 200, o 3º nível voltava. **Corrigido:** 400
   *"Subfamília não pode ter filhos (máximo 2 níveis)"*.
2. (Baixa) a sub ativa sob raiz inativa não se inativava nem renomeava **repetindo** o `parent_id` (400 "máximo 2 níveis") — o
   pai era revalidado quando "informado", não quando "novo". **Corrigido:** só o pai diferente do gravado (`nivelMuda`) passa
   por `validateParentFamilia`. (Muda a leitura da 103 de "valor novo = informado" para "valor novo = diferente".)
3. (Baixa, declarada) reativar mudando para outra raiz **inativa** recebe a mensagem compartilhada de `validateParentFamilia`
   ("máximo 2 níveis") — fora da RN-105.04, sem mudança.
   Ruído conferido: nada gravado nem auditado em toda recusa (virou cenário), ordem das recusas, valores exóticos de `ativo`
   (`' 1'`, `'TRUE'`, `[1]`, `0.5` → 400), legado gravado cru (`'true'`/`NULL`) não é transição.
**G12 (sqliteConcurrency): 1 médio real (reproduzido), corrigido (`d46126c9`); 2 baixos/ruído.**
4. (Média) os 5 PRAGMAs num `exec` só: com o arquivo travado por outro processo além do busy_timeout, `synchronous` caía em
   `SQLITE_BUSY` e o `sqlite3_exec` parava — **`foreign_keys` ficava 0 o processo inteiro** (no código anterior à 105 ligava).
   **Corrigido:** um `exec` por PRAGMA, encadeados, `foreign_keys` primeiro. Cenário novo (rival com `BEGIN EXCLUSIVE`):
   vermelho antes, verde depois; controle voltando ao `exec` único derruba o cenário.
5. (Baixa) a metade "banco já em WAL continua WAL" passaria sem a correção (o modo é persistente) — quem prende é a metade
   `delete`; declarado. (Ruído) o backup do boot copia o arquivo antes do PRAGMA terminar — já era assim com o `db.run`.
   O revisor refez a prova de boot: 9 de 9 em `wal` no código novo, 4 de 5 `delete` no pai; cópia do banco de dev real
   (161 MB) em WAL: logs iguais aos do pai.
Controles da onda (3): tirar a recusa da neta, voltar a revalidar o pai "informado", `exec` único — os três vermelhos no cenário novo.

## Retro (4 números)
- Rodadas de correção até verde: **2** (a Fase 2 mudou o contrato antes do código — normalização do `ativo`, transição na
  regra de sub ativa, PRAGMAs na frente da fila; a Fase 5, 3 correções).
- Achados de revisão: Fase 2 **8** (1 alto — o teste do G12 nasceria vazio com `db.all` —, 2 médios, 5 baixos), todos
  reais; Fase 5 **4 reais** (1 médio, 3 baixos; 1 baixo só declarado) + 1 baixo declarado, ruído conferido sem mudança.
- Paralelismo: **0 galhos em paralelo** na execução (T1/T2 independentes, mas pequenos — um executor); as duas revisões
  da Fase 5 em paralelo, sem retrabalho.
- Defeito escapado: preencher na próxima etapa de Compras. (Da 103: os dois baixos 1 e 2 acima eram do caminho que a 103
  mexeu e passaram pela revisão dela.)

## Commits (branch `etapa-e105`)
- `80b15bc9` G10c — inativar pelo PUT segue o "Inativar"; `ativo` 0/1; reativar sub sob raiz inativa recusado.
- `1ace8b88` G12 — WAL no primeiro boot (`exec` exclusivo, modo lido).
- `4379f2da` Fase 5 — neta legada não reativa; pai repetido não é revalidado.
- `d46126c9` Fase 5 — um `exec` por PRAGMA, `foreign_keys` primeiro.
- docs — este plano, o design, `compras-novidades-por-etapa.md`, `specs/modulo-compras/README.md`.

**Medido na árvore final (depois de `d46126c9`, antes do commit de docs):** `test:api` **352/352**; `test:almoxarifado`
**44/44**; `test:validation` 4/4, `test:safealter` 3/3, `test:sqlite` **10/10**; client **100 suítes / 1542 testes**;
`CI=true react-scripts build` **Compiled successfully**. Boot real em pasta nova com `d46126c9`: 3 de 3 em `wal`, nenhum
PRAGMA falhou, admin criado.

## Para o integrador — texto pronto para `docs/almoxarifado-manual-do-sistema.md` §2.1
Esta etapa **não** tocou o manual (a 102 do almoxarifado o edita em paralelo). Duas edições na §2.1 (a tabela
"Regras que o sistema aplica na tela", logo depois do parágrafo **Subfamílias**):

1. Trocar a linha *"Inativar uma subfamília que tem itens ativos | Recusado: … — antes da Etapa 37 a inativação passava e
   os itens ficavam ineditáveis"* (ela só fala de subfamília, mas a regra vale para os dois níveis — e o manual não cita
   etapa) por:

   > | Inativar uma família ou subfamília que tem itens ativos (contando os das subfamílias, no caso da família) | Recusado: *"Não é possível remover: família possui N item(ns) ativo(s)"* |

2. Logo depois do texto sobre mudança de nível pela API (o da Etapa 103, que substituiu *"O que a tela **não** faz…"*),
   acrescentar:

   > Inativar e reativar famílias **pela API** segue as mesmas regras da tela, com as mesmas mensagens — e algumas a mais,
   > porque a tela não reativa família:
   >
   > | Situação | Resultado |
   > |---|---|
   > | Inativar família ou subfamília com itens ativos | Recusado: *"Não é possível remover: família possui N item(ns) ativo(s)"* |
   > | Inativar família que tem subfamília ativa | Recusado: *"Não é possível inativar: família possui subfamília(s) ativa(s)"* |
   > | Reativar uma subfamília cuja família principal está inativa | Recusado: *"Não é possível reativar: a família principal desta subfamília está inativa — reative a família principal antes"* |
   > | Reativar uma subfamília cuja família principal não existe mais | Recusado: *"Família pai não encontrada"* |
   > | Situação (ativo) diferente de ativo/inativo | Recusado: *"Ativo inválido: use 0 ou 1"* |
   >
   > A recusa por itens vem antes da recusa por subfamília. Uma família que **já está** inativa pode ser renomeada ou
   > editada normalmente, mesmo que ainda tenha itens ativos ou subfamílias ativas dentro dela. Para reativar uma
   > subfamília de família inativa, reative primeiro a família principal.

(Sem mudança de manual para o G12: o modo do banco não é comportamento de tela. Se o manual tiver seção de
operação/instalação, a frase é: *"O servidor liga o modo WAL do banco já no primeiro início; com ele aparecem, ao lado
de `database.sqlite`, os arquivos `database.sqlite-wal` e `database.sqlite-shm` — uma cópia manual do banco tem de levar
os três, com o servidor parado."*)

## Próxima de Compras: a definir
Candidatas medidas que restam, sem prioridade decidida:
- **G8** — migrar as outras barras de abas para `ui/Tabs`. Medido aqui: só `Configuracoes.js` importa
  `components/ui/Tabs`; as barras de Admin, Compras/Financeiro, Minha Conta, OS comercial, Operacional e a interna do
  almoxarifado continuam com CSS próprio (lista do doc; não reconferida uma a uma nesta etapa).
- **G7** — as quatro listas de módulos: medido que ainda existem no cliente (`client/src/constants/modulosMeta.js`,
  `TipoSelecao.todosModulos`) e no servidor (`MODULE_ADMIN_KEYS` em `services/systemPermissions.js`,
  `DEFAULT_MODULOS_TIPO` em `services/modulosTipoConfigService.js`). Unificar é etapa própria (contrato de API de
  permissões no meio).
- **B52 (concorrência declarada)** — vincular fornecedor e desativar o grupo no mesmo instante ainda deixa vínculo novo
  em grupo desativado (conferência e gravação não são atômicas). Mesma classe da contagem-e-gravação do G10c (B54 não a
  fecha: inativar a família no mesmo instante em que alguém cadastra material nela também passa).
- **G16** (achado aqui; é do almoxarifado) — `initSchema` do almoxarifado roda duas vezes ao mesmo tempo no boot e o seed
  de setores colide (`UNIQUE … setores_almoxarifado.nome`, tentativa 1/3; a 2ª passa). Correção apontada: uma chamada
  só, ou `INSERT OR IGNORE` no seed.
- **B45** — Variáveis técnicas apontando para grupo desativado continuam oferecendo os fornecedores dele (decisão de P.O.).
- **G15** — só se o P.O. aceitar mostrar o total gravado com nota de "pedido anterior à 39".

Pontos de atenção para quem pegar: o PUT de família agora normaliza `ativo` (0/1) e tem quatro transições
(`inativa`/`reativa` × raiz/sub); `configureSqlite` tem de continuar sendo chamado **no callback do open e antes do
`wrapDatabase`** (o `exec` cru é capturado ali).
