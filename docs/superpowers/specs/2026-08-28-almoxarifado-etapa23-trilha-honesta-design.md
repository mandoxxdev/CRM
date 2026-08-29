# Almoxarifado — Etapa 23: a trilha para de mentir por omissão e por excesso (design)

Data: 2026-08-28 · Branch: `desenvolvimento-almoxarifado`
Origem: os dois itens que o fechamento da Etapa 22 **reclassificou**. A spec 23 dizia que, para
a feature virar 🟢, "falta a tela — o resto é decisão de negócio declarada". Conferido no
código no fechamento: **dois dos restantes não são decisão de ninguém, são defeito meu**.

## Decisão de escopo (Fase 0 — medida em 2026-08-28)

Agora que a trilha **tem leitor** (Etapa 22), os dois defeitos deixaram de ser teóricos: quem
audita vê o resultado deles na tela.

### 1. `PUT /configuracoes` altera o banco e pode não deixar rastro nenhum

`routes/almoxarifado.js:2505-2511` roda **um `UPDATE` por chave, em sequência, sem transação**,
e o `registrarAuditoria` vem **depois** do laço (`:2528`). A tela manda as 18 chaves a cada
save. Se o 3º `UPDATE` falhar:

- as duas primeiras chaves **já estão gravadas**;
- o `catch` responde **500**;
- a auditoria **nunca roda** — o `try` foi abortado antes dela.

Resultado: configuração alterada, usuário vê erro, e a trilha não tem uma linha sequer. É a
**pior combinação possível** numa etapa cujo tema é o log não mentir — e agora aparece como
ausência na tela nova.

### 2. Excluir duas vezes registra duas exclusões

Quatro rotas (`tipo_material` `:1765`, `localizacao` `:1973`, `setor` `:2136`, `familia`
`:2374`) fazem `UPDATE ... SET ativo = 0 WHERE id = ?` e tratam `this.changes === 0` como 404.

**A régua está errada e o motivo é uma armadilha do SQLite que esta base já documentou:**
`changes` conta as linhas que o `WHERE` **casou**, não as que mudaram de valor. Uma linha que
já estava `ativo = 0` casa, é "atualizada" para o mesmo valor, e `changes` volta **1**. Então a
segunda exclusão responde 200 e grava **outra** linha `EXCLUSAO` — ato sem efeito, com autor e
horário, indistinguível do real para quem lê a trilha. (O `setor` nem checa `changes`.)

## A decisão que a medição tomou por mim: NÃO usar transação

O conserto óbvio do item 1 seria `BEGIN`/`COMMIT`/`ROLLBACK`. **Medido: seria um bug pior que o
defeito.** `server/index.js:1026` abre **uma única** conexão SQLite, compartilhada por todas as
rotas do CRM (verificado: é o único `new sqlite3.Database` do servidor). Transação em SQLite é
por **conexão**, não por requisição. Então, entre o meu `BEGIN` e o meu `COMMIT`, **qualquer
escrita de qualquer outra requisição em voo entra na minha transação** — e o meu `ROLLBACK`,
disparado por uma falha em salvar configuração, **desfaria a movimentação de estoque que outra
pessoa acabou de fazer**. Trocar "log ausente" por "escrita alheia revertida em silêncio" não é
progresso.

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
- **RN-02 — Escrita que aconteceu tem rastro; escrita que não aconteceu não tem.** Com a RN-01,
  as duas metades ficam verdadeiras pela mesma régua: a auditoria continua **depois** da escrita
  e best-effort (o padrão do módulo), mas agora "depois da escrita" e "depois de tudo" são o
  mesmo instante.
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
  distinguindo 404 de já-inativo pelo `SELECT` anterior. O `setor` (`:2136`) ganha o check de
  `changes` que não tem.

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
