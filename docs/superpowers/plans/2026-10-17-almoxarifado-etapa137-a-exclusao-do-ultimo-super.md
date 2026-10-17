# Etapa 137 (núcleo): a exclusão do último super em corrida (C292) e duas pequenas do cadastro de usuários (C291, C293) — plano

> Origem: "Próxima tarefa detalhada — Etapa 137" do plano da 136. Design com a Fase 0 medida:
> `docs/superpowers/specs/2026-10-17-almoxarifado-etapa137-a-exclusao-do-ultimo-super-design.md`.
>
> **Numeração** (conferida com `grep -oE` em `docs/almoxarifado-novidades-por-etapa.md` em 2026-10-17): última B **B883**, último C
> **C293**, última A **A83**. Esta etapa: **B884+**, **C294+**, **A84+**. Worktree `CRM-wt-e137`, branch `etapa-e137` (a partir da main
> `f960d766`).
>
> **Fase 2 (um revisor fresco, sonda `scratchpad/e137/rev2-prepare-fura.js`): 2 Critical, 6 Important, 4 Minor — todos aceitos, antes de
> qualquer código de produção.** **C1** a `transacaoDeEscrita` de vários ticks da primeira versão engolia, no ROLLBACK, a escrita de
> `db.prepare` que entrava no meio (medido: 0 linhas depois); **C2** a frase do design "as leituras já viam o não confirmado com o `exec`"
> estava **errada** — o `Database::Exec` do driver é exclusivo; com vários ticks o alvo seria deslogado (401) por uma exclusão que depois
> volta. → o design mudou: um `exec` só, com a decisão gravada **antes** de qualquer escrita e todos os comandos condicionados a ela, sempre
> `COMMIT`. **I3** o perdedor de A × B com o destino padrão (o próprio ator, já apagado) tomava **500** de FK — o teste o contornava com
> um terceiro como destino; agora o motivo `DESTINO` e um cenário com o destino padrão. **I4** `usuarioPelaApi` ancora no texto do `DELETE`
> (mantido: o texto continua `DELETE FROM usuarios WHERE id = ${targetId}`). **I5** o `db.run` de dentro da transação travaria a fila
> (moot: não há `fn`). **I6** o `ROLLBACK` do `catch` da rota, na fila, desfazia escritas alheias → `execEmTransacao` com o ROLLBACK na
> mesma vaga. **I7** os 403/404 sem passar pelo `respondDbError` (moot: o motivo é lido, não lançado). **I8** o `is_superadmin: "true"` de um
> super rebaixava (a mesma régua da C293). **M9** o próprio com `"true"` no `PUT` → 200. **M10** o legado `ativo` em texto → declarado. **M11**
> as camadas redundantes deixariam sabotagem sobreviver → uma camada só (o motivo). **M12** um commit por assunto (T1, T2, T3).
>
> **Trava de máquina:** `scratchpad/e137-lock.sh` (o mesmo diretório `maquina-testes.lock` da 136). Um arquivo de teste de servidor por
> vez, inclusive os revisores; nunca `test:api` junto com o jest nem dois `test:api`.

## Regras de negócio

Literais: **L-EXC** = *"Não é possível excluir o último Super Administrador ativo do sistema"*; **L-DEST** = *"Usuário de destino dos
registros não encontrado"*; **L-404** = *"Usuário não encontrado"* (as três de hoje do `DELETE`); **L-ATIVO** = *"Ativo inválido: envie 1
(ativo) ou 0 (inativo)"* (a da 136); **L-SUPER** = *"Super administrador inválido: envie 1 (sim) ou 0 (não)"* (nova). "Super ativo" =
`COALESCE(is_superadmin, 0) = 1 AND ativo = 1`.

- **RN-01 — a exclusão decide o último super dentro da própria transação, antes de escrever (C292).** O `exec` da exclusão começa gravando
  o motivo (`NAO_ENCONTRADO` → `ULTIMO_SUPER` → `DESTINO` → `OK`, nessa ordem) em `temp.usuarios_exclusao_motivo` pelo token da
  requisição; todo comando seguinte só age com o motivo `OK`; sempre `COMMIT`. Depois, o motivo vira a resposta (200 / 403 L-EXC / 404
  L-404 / 400 L-DEST). Cenários (o `index.js` real, pasta vazia, 6 rodadas por par, dois supers novos por rodada, o semente rebaixado, um
  destino comum **C**): **A exclui B × B exclui A** (destino C), **× B rebaixa A (`PUT`)**, **× A se rebaixa (`PUT` em si)**, **× B desativa
  A (`PATCH`)** → em toda rodada sobra **exatamente um** super ativo; no DELETE × DELETE **exatamente um 200**; todo status é 200, 401 ou 403
  com uma literal da trava (L-EXC, a do `PUT`, a do `PATCH`), *"Acesso negado — apenas administradores do sistema"* ou *"Apenas Super
  Administradores podem excluir usuários"*.
- **RN-01b — o mesmo com o destino padrão (Fase 2 I3).** A exclui B × B exclui A **sem** `transferToId` (a tela: o destino é o próprio
  ator) → exatamente um 200, sobra um super, **nenhum 500**; o perdedor responde 403 L-EXC, 401, ou 400 L-DEST.
- **RN-02 — quem perde não escreve nada.** Cada super tem uma linha em `permissoes` e em `push_subscriptions` (purgadas) e uma em
  `proposta_followups` (`criado_por`, transferida). Todo `DELETE` 403 L-EXC deixou o alvo inteiro (usuário, as duas linhas pessoais, o
  `criado_por` dele); todo 200 apagou, purgou e transferiu para o destino. O 403 L-EXC aparece em **pelo menos uma** rodada (senão não provou).
- **RN-03 — o alvo apagado no meio é 404, sem nada feito.** O mesmo super exclui o mesmo usuário comum em duas abas, 6 rodadas → um 200 e um
  404 L-404 (hoje `200/200`); a linha do alvo foi transferida para o destino.
- **RN-04 — `db.execEmTransacao(corpo)` (serviço, `test:sqlite`).** (a) `BEGIN IMMEDIATE` + corpo + `COMMIT` numa vaga: grava tudo; (b) o
  corpo que falha no meio → ROLLBACK **na mesma vaga**: o que o corpo escreveu some, um `db.run` enfileirado enquanto ele rodava **grava**
  (não é desfeito) e a conexão sai sem transação aberta; (c) `BEGIN IMMEDIATE` com o lock de outra conexão → tenta de novo até soltar; (d)
  o lock que nunca solta → `SQLITE_BUSY` chega, nada aberto; (e) o `COMMIT` que falha (FK adiada) → ROLLBACK e o erro chega.
- **RN-05 — `is_superadmin` pela régua, e ausente mantém (C291).** Super no `PUT`: ausente, `null`, `""` → mantém (o último super editando
  a si sem o campo → **200**); `1`/`true`/`"1"`/`"true"` → 1; `0`/`false`/`"0"`/`"false"` → 0; o resto (`2`, `"sim"`, `[]`, `{}`) → **400
  L-SUPER**, nada gravado. Super no `POST`: ausente → 0; `"true"` → 1; o resto → 400 L-SUPER, nada gravado. Quem não é super: ignorado nos
  dois (não muda, nem 400).
- **RN-06 — o inativar pela régua (C293).** `PATCH /status`: na régua → 1/0; o resto (ausente, `null`, `""`, `2`, `"sim"`, `[]`, `{}`,
  `"TRUE"`, `-1`) → **400 L-ATIVO**, nada gravado; antes de "desativar o próprio usuário".
- **RN-07 — o `ativo` da edição pela régua, sem recusar o que a tela leu (C293).** `PUT`: ausente/`null`/`""` → mantém; igual ao gravado
  (pelo texto) → mantém; na régua → 1/0; o resto → **400 L-ATIVO**, nada gravado. Cenários: `"true"` num inativo → 1 e entra; `"false"` → 0;
  `2` num ativo → 400 e nada muda; legado 2 com `2` (e `"2"`) → 200, nome novo, continua 2; o próprio com `"false"` → 403 *"Não é possível
  desativar o próprio usuário"*; o próprio com `"true"` → 200 (Fase 2 M9).
- **RN-08 — integração pela rota e pelo serviço.** RN-01..RN-03, RN-05..RN-07 pela rota (o `index.js` real); RN-04 pelo serviço. A fiação
  (a rota usar `execEmTransacao` e o motivo) é presa pela RN-02 e pela RN-01b.

## Contrato congelado

- `DELETE /api/usuarios/:id`: payload e sucesso **iguais**; 403 L-EXC, 404 L-404 e 400 L-DEST também quando a corrida muda o estado entre a
  conferência cedo e a gravação (nada feito); não há mais 500 de FK pelo destino apagado.
- `PUT /api/usuarios/:id`: `is_superadmin` ausente/nulo/vazio = mantém, fora da régua 400 L-SUPER; `ativo` pela régua, fora dela 400 L-ATIVO
  salvo igual ao gravado.
- `POST /api/usuarios`: `is_superadmin` de super fora da régua → 400 L-SUPER; `"true"` → 1.
- `PATCH /api/usuarios/:id/status`: `ativo` fora da régua (inclusive ausente) → 400 L-ATIVO; `"true"` reativa.
- `wrapDatabase(db)`: novo `db.execEmTransacao(corpo)` → `Promise<void>`. `systemPermissions`: nova `simOuNao(v)` → 1 / 0 / `null`.

## Tasks (sort topológico)

- [ ] **T1 — C292 (tronco: serviço + rota)** — `sqliteConcurrency.js` `execEmTransacao` (RN-04, testes em `tests/sqliteConcurrency.test.js`);
  `index.js` `DELETE` (RN-01..RN-03). Teste novo `tests/api/usuarioExclusaoCorrida.api.test.js`. Vermelhos antes. O cenário estático de
  `chatSocketInativoNoServidor` que ancora no `await db.exec(stmts.join('\\n'))` é reancorado.
- [ ] **T2 — C291** — `systemPermissions.js` `simOuNao` + `sanitizeSuperAdminPayload`; a recusa L-SUPER no `POST`/`PUT` (RN-05).
- [ ] **T3 — C293** — `index.js` `PATCH`/`PUT` e `ativoDaCriacao` pela `simOuNao` (RN-06, RN-07).
- [ ] **T4 — fechamento** — novidades (B884+, C291/C292/C293 resolvidas, D (136) do `PUT` resolvida, D (137), F (137), a seção da etapa,
  cabeçalho), spec 23, mapa, guia, manual (5.2e/5.2g/5.2h), este plano (retro, "Próxima tarefa detalhada — Etapa 138"), o "defeito que
  escapou" da retro da 136.

**Ordem:** T1 → T2 → T3 → T4, em série, eu mesmo, um commit por task. **Galhos em paralelo: 0** (o mesmo `index.js` e o "um teste de
servidor por vez").

**Trava por material:** não toca — o CLAUDE.md **não** muda. **Boot:** mexe em rotas do `index.js`, não no boot; o teste sobe o `index.js`
real em pasta vazia (e o boot com pasta vazia é rodado à mão). **Migração:** nenhuma (a tabela temporária nasce na conexão, `CREATE TEMP
TABLE IF NOT EXISTS` dentro do `exec`).

**Controles positivos previstos** (âncora contada = 1, md5 antes/sabotado/restaurado, restauro por cópia): o motivo sem a guarda (RN-01
cai); a transferência sem a condição do motivo (RN-02 cai); o `DELETE` final sem a condição (RN-01/RN-03 caem); `DESTINO` fora (RN-01b cai
com 500); o 404 virando 200 (RN-03); `execEmTransacao` com o ROLLBACK fora da vaga (RN-04b); sem retry (RN-04c); `sanitize` de volta ao
`isTruthyFlag` (RN-05 `"true"`); o ausente de volta a 0 (RN-05); a L-SUPER fora (RN-05); `PATCH` de volta ao `isTruthyFlag` (RN-06); `PUT`
sem o "igual ao gravado" (RN-07 legado) e sem a régua (RN-07 `"true"`); a régua depois de `deactivating` (RN-07 o próprio `"true"`).
