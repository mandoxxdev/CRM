# Etapa 105 — design: família com material ativo não se inativa pelo PUT; WAL entra no primeiro boot

> Frente **Compras/cadastros (core)**, worktree `CRM-wt-e105`, branch `etapa-e105` (de `main` `4ade626f`).
> Plano: `docs/superpowers/plans/2026-10-15-crm-etapa105-familia-inativa-e-wal.md`.

## Fase 0 — o que foi medido (sonda executada, não leitura)

### G10c — `PUT /api/almoxarifado/familias/:id` com `ativo`
Sonda contra o harness (`createTestApp`, superadmin), 2026-10-15:

| Caso | Porta | Resultado medido |
|---|---|---|
| raiz com 1 material ativo, `ativo: 0` | PUT | **200**, `ativo = 0` |
| a mesma raiz, já inativada pelo PUT | DELETE | 400 `Não é possível remover: família possui 1 item(ns) ativo(s)` |
| raiz com 1 material ativo | DELETE (o "Inativar" da tela) | 400 `Não é possível remover: família possui 1 item(ns) ativo(s)` |
| sub com 1 material ativo, `ativo: 0` | PUT | **200**, `ativo = 0` |
| raiz com sub ativa, `ativo: 0` | PUT | 400 `Não é possível inativar: família possui subfamília(s) ativa(s)` (já existia) |
| raiz com sub ativa | DELETE | 400 `Não é possível remover: família possui 1 subfamília(s) ativa(s)` |
| raiz só com material inativo, `ativo: 0` | PUT | 200 (correto — o DELETE também deixa) |
| raiz com material ativo, `ativo: false` / `'0'` | PUT | **200**, `ativo = 0` |
| raiz com material ativo, `ativo: 'false'` | PUT | **200**, gravado o **texto** `'false'` (`typeof = text`) |
| raiz com **sub ativa**, `ativo: 'false'` | PUT | **200** — a checagem existente compara `Number(ativo) === 0` e `'false'` vira `NaN` |

**A tela:** `ConfiguracoesAlmoxarifado.js` `handleInativar` → `api.delete('/almoxarifado/familias/:id')`; o toast mostra
`err.response.data.error`. O `handleSalvar` (editar) manda `PUT` só com `{ nome, descricao, tipo_uso }` — nunca `ativo`.
A aba lista só as ativas (`GET /almoxarifado/familias` sem parâmetro) e **não tem botão de reativar família**.
Logo o G10c e o inverso abaixo são **só API**, como o G10b da 103. A descrição do G10c no doc de Compras estava
certa; faltava a variante `'false'` (texto) e a de subfamília ativa com `'false'`.

**O inverso — reativar subfamília cuja raiz está inativa:**

| Caso | Resultado medido |
|---|---|
| sub inativa de raiz inativa, `PUT { ativo: 1 }` (sem `parent_id`) | **200**, sub ativa sob raiz inativa |
| … depois disso | a sub aparece na lista ativa e a raiz não — a tela a joga no bloco **"Subfamílias sem família ativa"**, que o código da 37 descreve como estado que "as rotas recusam" |
| … e um material novo nessa sub | 400 `Família inativa — não é possível vincular novos itens` — a sub reativada não serve para nada |
| a mesma reativação repetindo `parent_id` | 400 `Subfamília não pode ter filhos (máximo 2 níveis)` — mensagem que não descreve o caso |
| reativar a raiz inativa que tem sub ativa | 200 (correto) |

### G12 — `WAL mode unavailable` no boot
Prova sem Docker: `CRM_DATA_DIR=<pasta vazia no scratchpad> PORT=3995 timeout N node index.js`, depois
`PRAGMA journal_mode` lido por outra conexão com o processo morto.

| Medição | Resultado |
|---|---|
| 1º boot, pasta nova, 7 tentativas | **1 de 7** deu `WAL mode enabled` / `wal` (a primeira, de partida fria); **6 de 7** `WAL mode unavailable: SQLITE_ERROR: cannot change into wal mode from within a transaction` / **`delete`** |
| 2º ao 6º boot sobre o mesmo banco que ficou `delete` | **6 de 6** o mesmo aviso, **continua `delete`** |
| banco de desenvolvimento do André (`CRM/server/data/database.sqlite`, cabeçalho lido sem abrir conexão) | bytes 18/19 = 2/2 → **WAL** (um boot de sorte basta: o modo é persistente no arquivo) |

**A descrição do G12 estava errada.** O doc de Compras (G6) dizia "o WAL entra no boot seguinte" e o chamava de
inofensivo. Medido: o WAL **não** entra no boot seguinte — cada boot perde a mesma corrida; um banco que nasceu
`delete` só vira WAL se algum boot ganhar a corrida por sorte. Um banco de produção criado com o código atual pode
estar em `delete` até hoje (o modo de rollback: leitura e escrita se bloqueiam, mais `SQLITE_BUSY`; o checkpoint do
`dbRecovery` vira no-op).

**Causa (lida no código do driver, `node_modules/sqlite3/src/database.cc`, e confirmada por `db.on('trace')`):**
`index.js` cria o `sqlite3.Database` e, **antes de o open terminar**, dezenas de módulos já enfileiraram
`CREATE TABLE IF NOT EXISTS …` e `SELECT name FROM sqlite_master …` (o trace mostra ~40 antes do PRAGMA). No callback
do open, `configureSqlite` manda `db.run('PRAGMA journal_mode = WAL')` — comando **não exclusivo**; o driver
processa a fila em paralelo e o PRAGMA cai com outra instrução ativa na mesma conexão (SQLite recusa trocar para WAL
com `nVdbeRead > 1`). Não há `BEGIN` envolvido — "transaction" é a leitura implícita de quem está no meio do passo.

**Correção escolhida:** o PRAGMA vai por `db.exec` (no driver, `Schedule(..., exclusive = true)`). No callback do
open nada roda ainda (`pending == 0`), então o `exec` sai na hora, marca a conexão como travada e o `Process()` que
o driver chama depois do callback **não** solta a fila até o PRAGMA terminar. Tudo o que estava enfileirado roda
depois, já em WAL. Depois do `exec`, `PRAGMA journal_mode` é **lido** e o log diz o modo real (`WAL mode enabled`
só quando lê `wal`).

Reprodução determinística (fora do `index.js`): banco em arquivo novo, 40 `CREATE TABLE IF NOT EXISTS` + 40
`SELECT … sqlite_master` enfileirados antes do open, `configureSqlite` no callback do open — **10 de 10** `delete`
com `db.run`; **10 de 10** `wal` com `db.exec`.

**Descartado:**
- repetir o PRAGMA com espera/backoff — continua disputando com a carga do boot, que dura segundos;
- uma segunda conexão só para o PRAGMA antes da principal — o `db` principal precisa existir de forma síncrona
  (os módulos o capturam no `require`), e duas conexões disputariam o lock;
- `db.serialize()` em volta do PRAGMA — o que já está enfileirado antes do open entrou como não exclusivo e
  continuaria rodando junto.

**Banco existente:** já em WAL → o PRAGMA é no-op (SQLite só confere a transação quando o modo **muda**) — nada muda.
Em `delete` (o caso que a medição mostrou ser o comum) → **passa a WAL no próximo boot** — é o que o código sempre
anunciou (`WAL mode: Habilitado para melhor concorrência`). Isso vira decisão registrada (B53) e consulta (A8).

## Emendas depois do design (valem sobre o texto acima)
- **Reprodução:** o que segura a "transaction" é o `db.get` que devolve linha (fica ativo até o `finalize`); com `db.all`
  o defeito não aparece (achado A1 da Fase 2). "40 `SELECT`" acima = 40 `db.get`.
- **Os outros PRAGMAs:** um `exec` por PRAGMA, encadeados, `foreign_keys` primeiro — num `exec` só, um `SQLITE_BUSY` no
  `synchronous` deixava o `foreign_keys` desligado (Fase 5). Ver o plano.
- **G10c:** o `ativo` passou a ser normalizado (0/1) e as regras valem só na transição — ver RN-105.00 e a Fase 2 do plano.
