# Almoxarifado — Etapa 23: a trilha para de mentir por omissão e por excesso (design)

Data: 2026-08-28 · Branch: `desenvolvimento-almoxarifado`
Origem: os dois itens que o fechamento da Etapa 22 **reclassificou**. A spec 23 dizia que, para
a feature virar 🟢, "falta a tela — o resto é decisão de negócio declarada". Conferido no
código no fechamento: **dois dos restantes não são decisão de ninguém, são defeito meu**.

## Decisão de escopo (Fase 0 — medida em 2026-08-28)

Agora que a trilha **tem leitor** (Etapa 22), os dois defeitos deixaram de ser teóricos: quem
audita vê o resultado deles na tela.

### 1. `PUT /configuracoes` altera o banco e pode não deixar rastro nenhum

`routes/almoxarifado.js:2506-2511` roda **um `UPDATE` por chave, em sequência, sem transação**,
e o `registrarAuditoria` vem **depois** do laço (`:2527`). A tela manda as 18 chaves a cada
save. Se o 3º `UPDATE` falhar:

- as duas primeiras chaves **já estão gravadas**;
- o `catch` responde **500**;
- a auditoria **nunca roda** — o `try` foi abortado antes dela.

Resultado: configuração alterada, usuário vê erro, e a trilha não tem uma linha sequer. É a
**pior combinação possível** numa etapa cujo tema é o log não mentir — e agora aparece como
ausência na tela nova.

### 2. Excluir duas vezes registra duas exclusões

Quatro rotas (`tipo_material` `:1757`, `localizacao` `:1953`, `setor` `:2118`, `familia`
`:2353`) fazem `UPDATE ... SET ativo = 0 WHERE id = ?` e tratam `this.changes === 0` como 404.

**A régua está errada e o motivo é uma armadilha do SQLite que esta base já documentou:**
`changes` conta as linhas que o `WHERE` **casou**, não as que mudaram de valor. Uma linha que
já estava `ativo = 0` casa, é "atualizada" para o mesmo valor, e `changes` volta **1**. Então a
segunda exclusão responde 200 e grava **outra** linha `EXCLUSAO` — ato sem efeito, com autor e
horário, indistinguível do real para quem lê a trilha. (O `setor` nem checa `changes`.)

### 3. O retry de `SQLITE_BUSY` responde erro e grava assim mesmo (achado A1 da Fase 2)

**Este item não estava no escopo e a revisão fresca mostrou que sem ele a etapa entrega uma
promessa falsa.** `server/services/sqliteConcurrency.js:108-115` chama o callback de quem pediu
a escrita em **toda tentativa**, inclusive nas que falham por `SQLITE_BUSY`, e só **depois**
decide se refaz o statement:

```js
originalRun(sql, p, function onRun(err) {
  if (typeof cb === 'function') cb.call(this, err);   // <- roda ANTES de decidir o retry
  done(err, err ? undefined : this);
});
```

Reproduzido pela revisão com o lock segurado por outra conexão:

```
  callback da ROTA recebeu: err= SQLITE_BUSY | this.changes= undefined
[SQLITE_BUSY] retry 1/5 … 2/5 … 3/5
  callback da ROTA recebeu: err= sem erro | this.changes= 1
  estado final no banco: ativo = 0   <- a escrita ACONTECEU, depois de a rota ter respondido
```

Como `services/almoxarifado/db.js` promisifica passando um callback, **`await dbRun(...)`
rejeita na primeira tentativa**: a rota cai no `catch`, responde 500 e pula a auditoria — e o
retry aplica as 18 chaves. É o defeito nº 1 **letra por letra**, por um caminho que o `UPDATE`
único não fecha. Nas quatro rotas de exclusão o efeito é o inverso e igualmente mentiroso: o 500
já saiu e a auditoria roda na tentativa boa (com `ERR_HTTP_HEADERS_SENT` no `res.json` seguinte).

O gatilho é raro (conexão única, `busy_timeout=30000`), mas o repo instrumenta `busy_events` no
health justamente porque acontece. **O harness de teste não chama `wrapDatabase`**
(`tests/helpers/testApp.js:18`), então nenhum teste desta etapa veria isso — o conserto precisa
de teste próprio em `tests/sqliteConcurrency.test.js`, onde o wrapper é exercitado de verdade.

**Conserto:** o callback de quem pediu passa a ser chamado **uma vez só**, na tentativa final —
que é o contrato que um retry transparente deve cumprir: quem chama não deve saber das
tentativas intermediárias. O `this` do sqlite3 (`lastID`/`changes`) continua preservado.

## A decisão que a medição tomou por mim: NÃO usar transação **nesta forma**

O conserto óbvio do item 1 seria `BEGIN`/`COMMIT`/`ROLLBACK` **com `await` no meio**, e isso
seria um bug pior que o defeito. `server/index.js:1026` abre **uma única** conexão SQLite
carregada pelo processo do servidor, compartilhada por todas as rotas do CRM. Transação em
SQLite é por **conexão**, não por requisição. Então, entre o meu `BEGIN` e o meu `COMMIT`,
**qualquer escrita de qualquer outra requisição em voo entra na minha transação** — e o meu
`ROLLBACK`, disparado por uma falha em salvar configuração, **desfaria a movimentação de estoque
que outra pessoa acabou de fazer**. Trocar "log ausente" por "escrita alheia revertida em
silêncio" não é progresso.

A revisão da Fase 2 reproduziu isso e **corrigiu duas coisas que este parágrafo afirmava demais**:

1. **`db.serialize()` não salva** — ele ordena a fila, não dá exclusividade; a escrita alheia
   entrou na transação e sumiu no `ROLLBACK` do mesmo jeito. (Confirmação, não correção: vale
   registrar porque `serialize` é a primeira ideia de quem tenta consertar isso.)
2. **A proibição vale para essa FORMA, não para transação em geral.** Uma transação inteira num
   único `db.exec` é segura, e **o próprio CRM já usa isso em produção duas vezes**
   (`index.js:4479`, o `DELETE /api/usuarios/:id`; e `:5700`, a renumeração de propostas) — a
   escrita concorrente sobreviveu no teste. Dizer "transação seria um bug pior" sem essa
   ressalva **estava mais largo do que a medição**. A recomendação continua sendo o `UPDATE`
   único (é o mais simples e não prende a conexão), mas a razão certa é essa.
   *(A revisão notou de passagem que naqueles dois `db.exec` o `ROLLBACK` do `catch` é uma
   chamada separada — entre o `exec` que falhou e o `ROLLBACK`, escrita alheia entra na
   transação. É o mesmo perigo, existindo hoje, fora do escopo desta etapa: vai para a letra B.)*

O conserto é **um `UPDATE` só**, com `CASE`: o SQLite garante atomicidade **por statement**, sem
transação e sem prender a conexão.

```sql
UPDATE configuracoes_almoxarifado
   SET valor = CASE chave WHEN ? THEN ? WHEN ? THEN ? ... END,
       updated_at = CURRENT_TIMESTAMP, updated_by = ?
 WHERE chave IN (?, ?, ...)
```

Grava as 18 ou não grava nenhuma, e não existe janela em que metade esteja aplicada.
**Descartado** também registrar a auditoria dentro do `catch` (rastro do ato parcial): documenta
o estrago em vez de evitá-lo, e deixa o banco meio gravado do mesmo jeito.

## Regras de negócio (RN)

- **RN-01 — Salvar configurações é tudo ou nada.** Um único `UPDATE` com `CASE`. Se falhar,
  **nenhuma** chave foi gravada, e o 500 descreve um banco intocado.
- **RN-02 — Escrita que não aconteceu não deixa rastro, e escrita que aconteceu não fica sem
  resposta coerente.** Enunciado corrigido pelo achado A5 da Fase 2: a versão anterior prometia
  "escrita que aconteceu **tem** rastro", e **isso o código não entrega nem depois desta etapa** —
  `registrarAuditoria` roda num `try/catch` que engole o erro e a rota responde 200 mesmo se o
  log falhar (é o padrão best-effort do módulo, decidido na Etapa 19: o UPDATE já foi commitado,
  derrubar a resposta por causa do log não desfaz nada). Numa etapa cujo tema é o log não mentir,
  a RN não pode prometer garantia que não existe. O que esta etapa garante é a outra metade,
  que hoje é falsa: **500 descreve um banco intocado**.
- **RN-05 — O retry é transparente para quem chamou.** Uma escrita que só deu certo na 3ª
  tentativa devolve **um** resultado, de sucesso; uma que falhou nas 5 devolve **um** erro. O
  callback de quem pediu nunca é chamado mais de uma vez, e nunca é chamado com o erro de uma
  tentativa que ainda vai ser refeita.
- **RN-03 — Excluir o que já está inativo não é um ato.** As quatro rotas passam a usar
  `WHERE id = ? AND ativo = 1`. Com `changes === 0`, a rota distingue os dois casos usando o
  `SELECT` que **já faz** hoje: linha inexistente → **404** (como hoje); linha existente e já
  inativa → **200 `{ success: true, ja_inativo: true }` SEM auditar**.
  **Descartado responder 400/409**: a exclusão passa a ser idempotente, que é o comportamento
  que a tela já assume ao permitir clicar de novo — e transformar em erro quebraria a tela por
  causa de um conserto de log. O que muda é **a trilha**, não o fluxo do usuário.
- **RN-04 — O contador de linhas nunca decide sozinho.** Onde `changes` for lido para concluir
  "não existe", o `WHERE` precisa carregar a condição de estado (`AND ativo = 1`), senão
  `changes` responde outra pergunta. Vale como régua para as rotas futuras.

## Arquitetura

Sem serviço novo, sem migration. Duas mudanças pontuais em `routes/almoxarifado.js`:

- **`PUT /configuracoes`**: o laço de `UPDATE` vira um `UPDATE` só, montado com placeholders
  (um `WHEN ? THEN ?` por chave, um `?` por chave no `IN`). O laço de **validação** continua
  como está — ele já roda inteiro antes de qualquer escrita, e o comentário em `:2485` já
  explica que isso existe justamente porque não há transação.
- **As quatro rotas de exclusão**: `AND ativo = 1` no `WHERE`, e o ramo `changes === 0`
  distinguindo 404 de já-inativo pelo `SELECT` anterior. O `setor` (`:2118`) ganha o check de
  `changes` que não tem.

> **Nota da Fase 2 (achado A8):** os números de linha da versão anterior deste documento
> apontavam para as chamadas de `auditarCadastro`, **não para as rotas**. Já corrigidos acima —
> as rotas começam em `:1757`, `:1953`, `:2118`, `:2353`, e os `UPDATE ... ativo = 0` estão em
> `:1761`, `:1968`, `:2133`, `:2369`. Quem editar por âncora de linha confira antes: elas andam.

## Testes

- `configuracoesAtomicidade.api.test.js`: RN-01/RN-02 — com uma chave que **falha na gravação**
  (patch de `db.run` na instância, a técnica que a Etapa 20 estabeleceu), afirmar que **nenhuma**
  das outras chaves mudou de valor no banco **e** que não há linha de auditoria; e o caminho
  feliz gravando as N chaves com **uma** linha de auditoria.
- `exclusaoIdempotente.api.test.js`: RN-03 — para **cada uma das quatro** entidades: excluir →
  200 + 1 linha `EXCLUSAO`; excluir de novo → 200 `ja_inativo` + **nenhuma linha nova**;
  id inexistente → 404 + nenhuma linha. A contagem de auditoria é a asserção de peso.
- Controle positivo obrigatório, **commitado antes**, e **lendo qual asserção caiu** (regra nova
  da skill): tirar o `AND ativo = 1` tem de derrubar o cenário da segunda exclusão **nomeando a
  linha extra**, não outro.

## O que muda em cada camada

| Camada | Mudança |
|---|---|
| `routes/almoxarifado.js` | `PUT /configuracoes` atômico; `AND ativo = 1` nas 4 exclusões |
| `specs/23` | os dois itens saem de "falta para 🟢" |

## Fica FORA, declarado

- **As demais rotas com laço de escrita sem transação.** A medição desta etapa olhou o
  `PUT /configuracoes` porque ele é o que a spec 23 nomeia; varrer o módulo inteiro atrás de
  laços de `UPDATE` é etapa própria, e o `UPDATE` único só serve onde as linhas são da mesma
  tabela e o valor é função da chave.
- **`EXCLUSAO` vs `DESATIVACAO` nas escritas novas** — a Etapa 22 agrupou os dois na exibição e
  declarou que padronizar as ~45 escritas é outra etapa. Continua valendo.
