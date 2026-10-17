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

- [x] **T1 — C292 (tronco: serviço + rota)** — `sqliteConcurrency.js` `execEmTransacao` (RN-04, testes em `tests/sqliteConcurrency.test.js`);
  `index.js` `DELETE` (RN-01..RN-03). Teste novo `tests/api/usuarioExclusaoCorrida.api.test.js`. Vermelhos antes. O cenário estático de
  `chatSocketInativoNoServidor` que ancora no `await db.exec(stmts.join('\\n'))` é reancorado.
- [x] **T2 — C291** — `systemPermissions.js` `simOuNao` + `sanitizeSuperAdminPayload`; a recusa L-SUPER no `POST`/`PUT` (RN-05).
- [x] **T3 — C293** — `index.js` `PATCH`/`PUT` e `ativoDaCriacao` pela `simOuNao` (RN-06, RN-07).
- [x] **T4 — fechamento** — novidades (B884+, C291/C292/C293 resolvidas, D (136) do `PUT` resolvida, D (137), F (137), a seção da etapa,
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

## Execução — o que aconteceu

- **Fase 0** — medida por mim: `scratchpad/e137/sonda-f0.js` (o `index.js` real em pasta vazia, molde `scratchpad/e136/r2-nucleo2.js`):
  C292 reproduzida 6/6 em três pares e 3/6 num par novo (exclusão × inativar). O gatilho no banco medido para descartar (a recuperação do
  boot e os testes que zeram supers no arquivo).
- **Fase 2 antes do código de produção:** 2 Critical + 6 Important + 4 Minor, todos aceitos (ver o topo). **O design mudou** (a
  `transacaoDeEscrita` de vários ticks → um `exec` com o motivo decidido antes de escrever); o teste do serviço (RN-04) foi reescrito e
  rodado **vermelho** de novo antes do código (5/5); o da rota, `usuarioExclusaoCorrida`, **10/12 vermelhos** antes do código (os 2 verdes:
  a metade positiva com três supers e o "quem não é super" — fixação, caem por sabotagem).
- **Commits:** T1 `cbe8c079`; T2 + T3 `c73951c4`; Fase 5 `c31687d4`; fechamento — o commit de documentação (ver `git log`).
- **Divergências do plano:** (1) **T2 e T3 saíram num commit só** (`c73951c4`) — os dois são "a régua de sim ou não" e mexem nas mesmas
  linhas do `PUT`; o plano (M12) previa três. (2) O teste da RN-02 com o destino padrão **não provava a trava**: o perdedor transferia para
  o ator já apagado e a FK o recusava (500) — os cenários usam um terceiro como destino, e a RN-01b prende o destino padrão. (3) O motivo
  `DESTINO` sobreviveu à primeira bateria (S4): com o `ULTIMO_SUPER` antes, a corrida A × B nunca chega a ele — virou a **RN-01c** (o destino
  apagado no meio por outra aba), que cai. (4) **Fase 5 r2:** o motivo `ATOR` (quem exclui ainda é super ativo) entrou à frente dos outros;
  com ele o `ULTIMO_SUPER` ficou **inalcançável** (sobra ao menos o ator) — mantido como guarda de reserva e declarado (D (137)); a S1
  (o motivo sem a guarda) passa a sobreviver por isso. (5) O teste novo passou a subir o servidor com `RATE_LIMIT_MAX` (as corridas
  passam das 500 requisições em 15 min e tomavam 429).
- **Controles positivos** (âncora contada = 1, md5 antes/sabotado/restaurado, restauro por cópia, `scratchpad/e137/bateria.js`): **T1** S1–S8
  e S2b (8 caem; S4 cai depois da RN-01c; **S8** — a rota de volta ao `exec` com BEGIN/COMMIT — sobrevive na rota: só difere num erro
  inesperado no meio, e a âncora estática do `chatSocketInativoNoServidor` prende o `execEmTransacao`); **T2/T3** N1–N7 e N3b (8 caem);
  **Fase 5** F1 (sem o `ATOR` — cai na RN-01d, rodada 9 de 16) e F2 (o "igual ao gravado" com lista — cai).
- **Boot:** a etapa mexe em rotas do `index.js`, não no boot; o teste sobe o `index.js` real em pasta vazia, e o boot à mão com
  `CRM_DATA_DIR` vazio (`scratchpad/e137/boot.sh`) subiu duas vezes na mesma pasta (*"Banco de dados totalmente inicializado"*, login 200; os
  dois avisos `duplicate column` de `materiais_escritorio` no primeiro boot são de antes desta etapa). **Migração:** nenhuma.
- **CLAUDE.md:** a seção da trava por material **não mudou** (a etapa não toca saldo).
- **Suíte antes de cada commit de código:** antes de `cbe8c079`: `test:api` **452/453** — o único vermelho era o próprio
  `usuarioExclusaoCorrida` com os 5 cenários da T2/T3 ainda sem código (o commit da T1 levou o arquivo só com os cenários da T1, rodado à
  parte: 8/0; `chatSocketInativoNoServidor` 9/0); `test:almoxarifado` **44/0**; `test:validation` 4/0, `test:safealter` 3/0,
  `test:sqlite` 15/0; client **133** suítes / **1780** testes; `CI=true build` *Compiled successfully*. Antes de `c73951c4`: `test:api`
  **453/453**, o resto igual. Antes de `c31687d4`: `test:api` **453/453**; `test:almoxarifado` 44/0; 4/0, 3/0, `test:sqlite` **16/0**;
  client 133 / 1780; build *Compiled successfully*.
- **Fase 5** — três revisores frescos em paralelo sob a trava de máquina; o de sabotagem na worktree própria `CRM-wt-e137-r3` (removida com
  as junções desfeitas antes).
  - **Regra (r1): 2 Minor desta etapa** — o `[1]` passando como "igual ao gravado" (**corrigido**, `c31687d4`) e o legado `"true"` em texto
    editado com `"true"` mantido (**declarado**, B887 — é o preço do "a tela devolve o que leu"); **anterior:** a renumeração de propostas com
    o ROLLBACK pela fila (**C294**).
  - **Permissão (r2): 0 desta etapa.** Fuzz de 60 rodadas (três supers, duas abas cada, todas as portas, legados com `ativo` nulo/2/texto):
    nenhuma sem super ativo. **Anterior, reproduzido 1/6:** o super rebaixado no meio da exclusão que já mandou a concluía — **corrigido** na
    exclusão (`ATOR`, `c31687d4`); nas outras gravações, **C295**.
  - **Sabotagem (r3): 55** sabotagens novas, **35** caíram, **20** sobreviveram: **4** por falta de cenário (R30, D18, R25, E6 — viraram
    cenários em `c31687d4` e caem), **5** de ordem entre duas recusas simultâneas não contratada (D2, D3, R23, R24, R26 — declarado, D (137)),
    **11** equivalentes ou inalcançáveis provadas (R15, R17, R18, R22, R31, D1, D8, D17, E1, E5, E7).
- **Suíte final (depois da Fase 5, antes da documentação):** a de antes de `c31687d4` (acima) — a documentação não toca código.
- **T4 — fechamento** (o commit de documentação): novidades (cabeçalho, B884–B888, C291/C292/C293 resolvidas, C294 e C295, a D (136) da
  edição resolvida, D (137), F (137), a seção da etapa, "Onde estamos"), spec 23 (a seção da Etapa 137, o item da 136 marcado e a frase
  errada do plano da 136 dita), mapa (linha 23, a última atualização), guia (cabeçalho, seção, roteiro), manual (5.2e — o *ativo* pela
  régua na criação, na edição e no inativar; 5.2h — a exclusão conferida no instante de gravar e o *Super administrador*), este plano, o
  "defeito que escapou" da retro da 136.

## Tasks — estado

- [x] **T1** `cbe8c079` (Fase 5 `c31687d4`) · [x] **T2** e [x] **T3** `c73951c4` (Fase 5 `c31687d4`) · [x] **T4** — o commit de documentação.

## Retro (4 números)

1. **Rodadas de correção até verde:** **1** (Fase 5: o `ATOR` e o "igual ao gravado" só com valor simples, mais os 4 cenários). Testes
   antigos mudados: **1** arquivo — `chatSocketInativoNoServidor` (o cenário estático do `DELETE` reancorado no `execEmTransacao`).
2. **Achados da revisão:** Fase 2 — **2 Critical + 6 Important + 4 Minor, todos reais** (C1 medido por sonda; os dois Critical mudaram o
   design). Fase 5 — r1 **2** desta etapa (1 corrigido, 1 declarado) + **1** anterior (C294); r2 **0** desta etapa + **1** anterior
   reproduzido (corrigido na exclusão, C295 no resto); r3 **4** sobreviventes reais (viraram cenários) + **16** equivalentes, inalcançáveis
   ou de ordem não contratada; **0** ruído.
3. **Paralelismo:** **0** galhos em paralelo (o mesmo `index.js` e o "um teste de servidor por vez"), **0** retrabalho; **1** revisor na
   Fase 2, **3** em paralelo na Fase 5 sob a trava, e **1** agente de medição (só leitura) em paralelo com a suíte, para a escolha da 138.
4. **Defeito que escapou:** **nenhum de código; um de texto** (preenchido na Etapa 138). O `db.execEmTransacao` desta etapa foi
   reusado na renumeração de propostas e a Fase 5 da 138 não achou defeito nele nem na exclusão. Mas a **C294**, escrita na Fase 5 desta
   etapa, estava **imprecisa**: dizia "lido no código, não reproduzido" e que o desfazer pegava "as gravações que entraram na fila enquanto
   ela falhava" — a 138 **reproduziu** (35 de 90 numa rajada) e mediu que só perde quem já estava sendo atendido quando a renumeração
   começou; quem chega durante ela espera o `exec` (exclusivo no driver) e grava depois do desfazer.

## Próxima tarefa detalhada — Etapa 138

*(A série desta etapa foi B884–B888, C294–C295, nenhuma A — a 138 começa em **B889**, **C296**, **A84**; confira com `grep -oE` antes.)*

**Medido (agente de medição, só leitura, nesta etapa):** as candidatas livres do almoxarifado acabaram (medido na 136) e as do núcleo
também — a C291–C293 e a C292 foram as últimas; a C294 (propostas) e a C295 (geral) são as anteriores novas. O que sobra na letra **C** é
orientação a quem opera (C256–C263), regra de negócio (C109, C117/C118, C139 — do P.O.), ou precisa de transação de banco de verdade (C98,
C110 — depois da migração para Postgres). Em **Compras** (`specs/modulo-compras/README.md`, `docs/compras-novidades-por-etapa.md` letra G)
o que é livre é pequeno e de valor baixo (exportar pedidos um a um, a lista vazia que não cita o filtro, o build de deploy que ignora o
lint — G3). **O de maior valor livre está nas propostas.**

**Escolhida: a varredura do "payload parcial zera colunas" nos `PUT` das propostas e vizinhos** (perda de dado silenciosa; já apareceu
duas vezes — nos itens e no contato; `specs/proposta-editavel/CHECKLIST-teste-fix-2026-07-21.md:115`, item oferecido e nunca feito).
**Fase 0 (medir antes de prometer):** para cada `PUT`, mandar só um campo e conferir no banco se os outros sobreviveram:
`index.js` `app.put('/api/clientes/:id'` (~5193), `'/api/propostas/:id'` (~8160), `'/api/propostas/:id/customizacoes'` (~5829),
`'/itens/descricoes'` (~5897), `'/clausulas/:clausulaId'` (~6063), `'/fotos/:fotoId'` (~6226), `'/variaveis-manuais'` (~6267),
`'/api/produtos/:id'` (~15058), `'/api/oportunidades/:id'` (~15242). **Contrato a decidir por porta (B, reversível):** ausente = mantém
(`COALESCE` ou montar o `SET` só com o que veio) × presente nulo/vazio = limpa; a tela de hoje manda o objeto inteiro — medir o que cada
tela manda (`client/src/components/proposta/`, `Clientes`, `Produtos`, `Oportunidades`) antes de mudar, porque a tela que manda `""` para
"apagar" tem de continuar apagando. **Pontos de atenção:** `normalizarMaiusculas` e os campos calculados (totais, `updated_at`); o review
obrigatório da proposta (`specs/proposta-editavel/review-proposta.md` — rodar as invariantes antes de mexer no template/paginação; a
varredura não deve tocar no template); molde de teste com o `index.js` real em pasta vazia (`usuarioExclusaoCorrida.api.test.js`, com
`RATE_LIMIT_MAX`). **Junto, pequena:** a **C294** (a renumeração de propostas, `index.js` ~5573, passa a `db.execEmTransacao` — o mesmo
conserto da exclusão; teste no molde da RN-04b). **Alternativa se a medição achar pouco:** o índice e a paginação da lista de propostas
(`specs/lentidao-api-propostas/2026-07-21-lentidao-api-propostas.md`, Frente B — a Frente A já está feita; o índice é pequeno e seguro).

**Dependem do P.O. — NÃO implemente:** **B853**/**C279**, **B808**, **B755**, **B761**/**C239**, **C224**, o resto da **C225**, **C228**,
**C219**, **C230**, o reparo da **C246** (e a **C247**), a tabela de conversões e o grupo acima de família, a **régua do tempo de
recebimento (E2)**, a **C268**, a **C269**, **C275**, **C276**, **C277**, **C109**, **C117**/**C118**, **C139**, **C278**; na 05, os itens
de produto e a **C198**; na 06, a **B11** e a Engenharia; na 21, a valorização por cliente e previsto × realizado; na 22, **B13**,
**B101**/G30, **G38**; no Compras, D-35, D-37, D-78, D-90, G9/G30, G4, G15, B63, B60, B62; nas propostas, a verificação do dono da proposta
(Fase 12 de `specs/proposta-editavel/tasks.md`) e o filtro por permissão do histórico (`auditoria.md`). Pendem de Postgres: **C98**, **C110**.

**O que já está pronto e não precisa reabrir:** a exclusão de usuário com o motivo decidido dentro da transação (`ATOR`, `NAO_ENCONTRADO`,
`ULTIMO_SUPER`, `DESTINO`); `db.execEmTransacao` (reutilizável — é o conserto da C294); a régua `simOuNao`/`campoAusente` e
`superAdminInvalido` em `systemPermissions.js`; o "igual ao gravado" do `PUT` de usuário.
