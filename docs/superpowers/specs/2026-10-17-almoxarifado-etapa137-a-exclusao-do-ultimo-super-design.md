# Etapa 137 (núcleo): a exclusão do último super em corrida (C292) e duas pequenas do cadastro de usuários (C291, C293) — design

> Origem: "Próxima tarefa detalhada — Etapa 137" do plano da 136
> (`docs/superpowers/plans/2026-10-17-almoxarifado-etapa136-a-ordem-das-baixas.md`). Plano:
> `docs/superpowers/plans/2026-10-17-almoxarifado-etapa137-a-exclusao-do-ultimo-super.md`.

## Fase 0 — o que foi medido

**C292 reproduzida nesta worktree** (sonda `scratchpad/e137/sonda-f0.js`, molde `scratchpad/e136/r2-nucleo2.js`, o `index.js` real em
pasta vazia; 6 rodadas por par, dois supers novos por rodada, o semente rebaixado):

| Par (ao mesmo tempo) | Resultado | Rodadas com **zero** super ativo |
|---|---|---|
| A exclui B × B exclui A | `200/200` 6/6 | **6/6** |
| A exclui B × B rebaixa A (`PUT is_superadmin 0`) | `200/200` 6/6 | **6/6** |
| A exclui B × A se rebaixa (`PUT` em si, duas abas) | `200/200` 6/6 | **6/6** |
| A exclui B × B desativa A (`PATCH /status ativo 0`) — par novo | `200/200` 3, `403/200` 3 | **3/6** |

**Causa (lida no código, `index.js` `app.delete('/api/usuarios/:id')`).** A conferência `wouldRemoveLastSuperAdmin` roda num `SELECT`
e, depois dela, a rota ainda faz dezenas de leituras (`sqlite_master`, `PRAGMA foreign_key_list` de cada tabela, `PRAGMA index_list` /
`index_info` de cada referência) antes de montar a transação em texto (`BEGIN IMMEDIATE … DELETE FROM usuarios WHERE id = ${targetId};
COMMIT;`) e mandá-la num `db.exec` só. As duas requisições passam da conferência antes de qualquer uma gravar. A transação em si é
atômica (um `exec` é **uma** escrita da fila do `wrapDatabase`, e o `BEGIN IMMEDIATE` pega o lock de escrita), mas o `DELETE` final não
tem guarda e o `exec` não devolve `changes` — não há como a transação "perceber" que o alvo virou o último super.

**As outras portas já fecham** (Etapa 136, C285/B880): o `UPDATE` do `PUT` e o do `PATCH /status` levam `GUARDA_ULTIMO_SUPER_SQL` e
conferem `this.changes`. O par DELETE × PATCH só zera em metade das rodadas porque quando o `PATCH` grava primeiro o `DELETE` ainda passa
(o alvo da exclusão era o outro).

**C291 (lida no código e reproduzida na 136).** `sanitizeSuperAdminPayload` (`services/systemPermissions.js`): para quem pode dar super
(`canGrantSuperAdmin`), `data.is_superadmin = isTruthyFlag(data.is_superadmin) ? 1 : 0` — **sem o campo vira 0**. No `PUT` isso é
"rebaixar" (`removingSuper` true, `COALESCE(0, is_superadmin)` grava 0). A tela sempre manda o campo para quem é super
(`UsuarioForm.js:231`). Medidos os testes que editam **sem** o campo: `superPadraoNoBoot` (RN-03, RN-02d, RN-02c) e `usuarioPelaApi` —
o RN-02d rebaixa o semente sem querer (o S2 renomeia o semente sem o campo); nenhum deles **assere** o rebaixamento por omissão (a
conferir na execução — se algum assere, é teste de fixação do defeito e muda com a etapa).

**C293 (lida no código).** `PATCH /status`: `ativo = isTruthyFlag(req.body?.ativo) ? 1 : 0` — `"true"`, `2`, ausente, nulo → **0**
(desativa). `PUT`: `ativo` vai cru para `COALESCE(?, ativo)` — `"true"` grava o texto (o login exige `ativo = 1`: a pessoa deixa de
entrar), `2` grava 2. A tela: o inativar manda `0`/`1` (`Usuarios.js:88`); o formulário manda `formData.ativo`, que é **o que leu**
(`UsuarioForm.js:80`, `:219`) e só vira 0/1 quando a caixa é clicada — um legado com `2` editado sem mexer na caixa volta com `2`.

**Gatilho no banco (caminho (a)) — medido para descartar.** Um `BEFORE DELETE`/`BEFORE UPDATE` em `usuarios` que recuse ficar sem super
ativo fecharia as três portas e qualquer SQL de fora. Custos medidos: é migração (banco novo e antigo); o boot tem a recuperação
`promoverSuperPadraoSemSuperAtivo` (que só existe porque o banco **pode** ficar sem super — editado com o servidor parado, restaurado de
backup); `superPadraoNoBoot` RN-01c zera os supers no arquivo de propósito (`UPDATE usuarios SET is_superadmin = 0`) e
`chatSocketSessaoDoInativo` apaga e desativa usuários direto no banco; e o gatilho trancaria também o DBA que precisa desfazer um super
indevido com o servidor parado. As duas portas de atualização já fecham na rota; falta só a exclusão.

## Fase 2 — o design da primeira versão estava errado (dois Critical, medidos)

A primeira versão deste design propunha `db.transacaoDeEscrita(fn)`: `BEGIN IMMEDIATE` numa vaga da fila, `await fn(tx)` com os métodos
originais do driver (vários ticks), `COMMIT`/`ROLLBACK`. O revisor da Fase 2 mediu (`scratchpad/e137/rev2-prepare-fura.js`) que:

1. **A escrita por `db.prepare(...).run` entra no meio e é engolida pelo ROLLBACK** — o `Statement::Schedule` do driver não olha a trava
   do banco, e o `prepare` não passa pela fila do `wrapDatabase` (catorze rotas do `index.js` usam). O perdedor da corrida desfaria o
   salvamento de outra pessoa que respondeu 200.
2. **A frase "as leituras podem ler o estado não confirmado — igual ao que já acontecia com o `exec` em texto" estava errada.** O
   `Database::Exec` do driver é **exclusivo** (`Schedule(..., true)`): enquanto o `exec` em texto roda, nenhum `db.get`/`db.all` da
   conexão entra. Com a transação de vários ticks, o `authenticateToken` do alvo leria a linha já apagada (ainda não confirmada),
   responderia 401 e a tela o mandaria para o login — e depois o ROLLBACK o devolveria.

**Corrigido:** a transação continua **um `exec` só** (exclusivo no driver, como hoje), e a decisão é tomada **dentro dele, antes de
qualquer escrita**, sem ROLLBACK no caminho normal.

## Design escolhido — caminho (b): a guarda dentro do próprio `exec` da exclusão, decidida antes de escrever

1. **O primeiro comando da transação grava o motivo** numa tabela temporária da conexão (`temp.usuarios_exclusao_motivo`, chave = um
   token aleatório da requisição): `NAO_ENCONTRADO` (o alvo já não existe), `ULTIMO_SUPER` (o alvo é super que entra e não sobra outro —
   `GUARDA_ULTIMO_SUPER_SQL` com o `?` = 1, a mesma régua do `PUT`/`PATCH`), `DESTINO` (o destino da transferência já não existe — o
   perdedor de A exclui B × B exclui A com o destino padrão, que é o próprio ator, tomava 500 de FK; Fase 2 I3) ou `OK`. **Todo** comando
   seguinte (purge, transferência, o `DELETE FROM usuarios`) leva `AND EXISTS (SELECT 1 FROM temp.usuarios_exclusao_motivo WHERE token =
   '…' AND motivo = 'OK')`. A transação sempre termina em `COMMIT`: recusada, não escreveu nada no banco (só a linha temporária).
2. **Depois do `exec`**, a rota lê o motivo pelo token (`db.get`) e apaga a linha temporária: `OK` → 200 de hoje; `ULTIMO_SUPER` → **403
   L-EXC**; `NAO_ENCONTRADO` → **404** *"Usuário não encontrado"*; `DESTINO` → **400** *"Usuário de destino dos registros não
   encontrado"* (as literais de hoje das conferências de antes, que continuam — a recusa cedo).
3. **`db.execEmTransacao(corpo)`** (novo, `wrapDatabase`): uma vaga da fila; `exec('BEGIN IMMEDIATE;\n' + corpo + '\nCOMMIT;')`; se falha,
   `ROLLBACK` **na mesma vaga** (antes de soltar a fila) e, se foi BUSY, tenta de novo (o `retryAsync`); o erro chega a quem chamou. Fecha a
   armadilha da Fase 2 I6: hoje o `catch` da rota manda `db.exec('ROLLBACK;')` **na fila**, depois das escritas que entraram nela enquanto
   o `exec` falhava — elas rodavam dentro da transação aberta e o ROLLBACK as desfazia. A rota perde o `ROLLBACK` próprio. O ROLLBACK que
   falha ("no transaction is active" — o BUSY no `BEGIN` não abriu nada) é engolido e o erro original sobe.
4. **C291 (com a Fase 2 I8):** uma régua só, `simOuNao(v)` (`systemPermissions.js`) → `1` (`1`, `true`, `"1"`, `"true"`), `0` (`0`, `false`,
   `"0"`, `"false"`), `null` (o resto). `sanitizeSuperAdminPayload`, para quem pode dar super: ausente, nulo e vazio → o campo sai do
   objeto (o `PUT` mantém, o `POST` cria 0); na régua → 1/0; fora dela → o campo sai e a rota recusa antes, **400** *"Super administrador
   inválido: envie 1 (sim) ou 0 (não)"* (`POST` e `PUT`; o `"true"` de um super rebaixava). Quem não é super: o campo continua ignorado.
5. **C293:** `ativoDaCriacao` passa a usar `simOuNao`. `PATCH /status`: fora da régua (inclusive ausente, nulo e vazio) → **400 L-ATIVO**,
   nada gravado, antes de "desativar o próprio usuário". `PUT` (o primeiro `SELECT` passa a ler `ativo`): ausente/nulo/vazio → mantém;
   **igual ao gravado** (`String(v) === String(gravado)`) → mantém (a tela devolve o que leu — o legado `2` ou `"true"` em texto editado sem
   mexer na caixa fica como estava); na régua → 1/0; o resto → **400 L-ATIVO**, nada gravado. A régua vem antes de `deactivating`: o
   administrador editando a si com `"true"` não é "desativar o próprio" (Fase 2 M9).

**Descartados:** (a) o gatilho (acima); (b1) a `transacaoDeEscrita` de vários ticks (a primeira versão — engole o `prepare` e mostra o não
confirmado, medido); (b2) o `exec` com um comando que **falha** quando a linha não sai (tabela temporária com `NOT NULL`, `json('x')` num
`CASE`) — deixaria a transação aberta no meio do `exec` e exigiria ROLLBACK, com o erro a reconhecer pelo texto; (d) uma trava em memória
por usuário na rota — não cobre o `PUT`/`PATCH`, que gravam pela fila sem ela; (e) no `PUT`, recusar todo valor fora da régua — o legado
editado pela tela viraria 400 (D (136)); (f) no `PATCH`, manter o ausente como "desativar"; (g) o `is_superadmin` fora da régua mantido em
silêncio — o integrador que manda `"sim"` acharia que promoveu.

**Fica declarado (D (137)):** um erro inesperado no meio do `exec` (não a recusa: uma FK de tabela nova, o disco) ainda desfaz, no
ROLLBACK, uma escrita de `db.prepare` que tenha entrado entre dois comandos do `exec` (o `prepare` fura a fila desde sempre; o caminho
normal e a recusa terminam em `COMMIT` e não desfazem nada); o legado com `ativo` em texto (`"true"`) continua como está quando editado
sem mexer na caixa (não entra: o login exige 1).

**Reversível:** tudo é código (nenhuma migração; a tabela temporária vive na conexão e some no reinício); voltar é reverter os commits.
