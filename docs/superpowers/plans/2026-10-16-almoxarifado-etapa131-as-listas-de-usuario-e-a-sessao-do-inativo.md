# Etapa 131 (núcleo): as listas de usuário (C270) e a sessão do inativo (B842) — plano

> Origem: "Próxima tarefa detalhada — Etapa 131" do plano da 130. Design com a Fase 0 medida:
> `docs/superpowers/specs/2026-10-16-almoxarifado-etapa131-as-listas-de-usuario-e-a-sessao-do-inativo-design.md`.
>
> **Numeração** (conferida com `grep -oE` em `docs/almoxarifado-novidades-por-etapa.md` em 2026-10-16): última B **B843**, último C
> **C270**, última A **A78**. Esta etapa: **B844+**, **C271+**, **A79+**. Worktree `CRM-wt-e131`, branch `etapa-e131` (a partir da main
> `12de5dc3`).
>
> **Ordem da skill:** este plano é revisado (Fase 2) por um agente fresco **antes** de qualquer código de produção.
>
> **Fase 2 (um revisor fresco, sonda `e131rev2-busy.js`, não versionada, sob a trava): 2 Important + 7 Minor, todos aceitos — antes
> de qualquer código de produção.** **I1 (reproduzido)** — com SQLITE_BUSY no enriquecimento, o ex-administrador desativado seguia com o
> papel do token (`PATCH /api/usuarios/3/status` → 200; sem o BUSY, 403) → RN-06: BUSY vira **503** (`respondDbError`, o client repete
> o pedido no 503), outro erro do banco segue **sem** o poder do token. **I2** — o 401 do `/auth/login` (senha errada, ou o desativado
> tentando entrar de novo) casa a régua `/inválido/` do interceptor e recarrega a página em `/login?sessao_expirada=1`, apagando a
> mensagem do formulário (anterior à etapa; o design afirmava "sem o aviso de sessão expirada" e o gesto seguinte o mostrava) → RN-09:
> o 401 do próprio login não redireciona; o `USUARIO_INATIVO` vai para `/login?sessao_encerrada=1` com aviso próprio (RN-10). **M1** —
> os 401/403 de contexto e o erro de banco das rotas ganham cenário (e são "raros", não "inalcançáveis": o BUSY e a corrida entre as duas
> leituras os alcançam). **M2** — o RN-02 prova que o cache foi usado (usuário novo entre os dois pedidos não aparece no segundo). **M3**
> — o `/api/auth/me` do inativo passa de 404 a 401 L11 (contrato). **M4** — as URLs assinadas (fotos 12 h, avatares 24 h) e as telas com
> axios cru/`fetch` não deslogam → D (131) e C271. **M5** — a RN-04 diz o setor exato do `/filtrar`, o `?setor=` do admin e o super
> sem a flag (403). **M6** — T1 e T2 editam o mesmo arquivo de teste (serializadas); o pronto da T1 é RN-06/07 verdes; o segundo
> `[RN-13 F5 r2]` é reescrito (com `res = {}` o 401 derrubaria o processo); a T4 prende comportamento existente → controle positivo
> obrigatório. **M7** — "admin" do filtro (`role === 'admin'` exato, do banco) ≠ "gerencia usuários" (`canManageUsers`, minúsculas, o
> super): escrito na RN-01.
>
> **Trava de máquina:** `scratchpad/e131-lock.sh` (diretório `maquina-testes.lock`, o mesmo da 129/130). Um arquivo de teste de servidor
> por vez, inclusive os revisores; nunca `test:api` junto com o jest nem dois `test:api`.

## Regras de negócio

"Gerencia usuários" = `canManageUsers(req.user)` (super administrador ou `role = 'admin'`), com o `req.user` já enriquecido do banco.
"Projeção" = cada linha só com `id`, `nome`, `email`, `ativo`, `cargo` (nenhuma outra chave), na mesma ordem.

**C270 — as três listas.** Teste: `server/tests/api/listasDeUsuarios.api.test.js` (RN-01..RN-05), banco SQLite real (DDL de produção de
`usuarios`, `permissoes`, `usuarios_grupos`, `grupos_permissoes`), rotas registradas pelo `registrarLeituraDeUsuarios` de produção.

- **RN-01 — `GET /api/usuarios/comercial`.** Quem gerencia → as linhas de hoje (`id, nome, email, cargo, role, ativo, setor,
  departamento, created_at`); os outros → a projeção. Filtros como hoje: só ativos; só quem tem `comercial` (permissão direta com
  `grupo_id` nulo/0, ou por grupo) ou `role = 'admin'`; quem não é `role = 'admin'` (relido do banco) só vê o próprio setor, sem
  diferença de caixa e espaço (`' vendas '` = `'Vendas'`); `role = 'admin'` vê todos os setores. Cenários: comum do setor Vendas → só os
  de Vendas com o comercial, projetados, sem o inativo, sem quem não tem o módulo; admin → todos os setores, com `role`; super
  administrador com `role = 'usuario'` → as linhas inteiras, **só do setor dele** (o filtro de setor segue o `role`, como hoje). *(Fase 2
  M7)* Duas réguas de "admin", de propósito: o **filtro** usa `ctxUser.role === 'admin'` (exato, relido do banco); a **forma** usa
  `canManageUsers` (super ou `role` em minúsculas `admin`). *(Fase 2 M1)* O contexto, como hoje: id sem linha → 401 `Usuário não
  encontrado`; inativo → 403 `Usuário inativo` (nas três rotas); erro do banco no contexto → `respondDbError` (503 `SQLITE_BUSY` /
  500) na `/comercial`, 500 `err.message` na `/filtrar` e na `/por-modulo`.
- **RN-02 — o cache não serve a forma de um para o outro.** O super com `role = 'usuario'` e o comum do mesmo setor caem na mesma chave
  do cache. (a) o comum pede primeiro, o super depois (cache quente) → o super recebe `role`; (b) invalidado, o super primeiro, o comum
  depois → o comum recebe a projeção. *(Fase 2 M2)* E o cache foi usado: um usuário novo do setor com o comercial, inserido entre
  os dois pedidos, não aparece no segundo. E o serviço: `fetchComercialResponsaveis` devolve as linhas inteiras (o cache guarda as inteiras).
- **RN-03 — `GET /api/usuarios/por-modulo/:modulo`** (inclui `por-modulo/admin`). Mesma regra de forma da RN-01 e mesmos filtros, com o
  módulo da rota. Cenários: comum, `operacional` → só os do setor com `operacional`, projetados; admin, `operacional` → todos com
  `role`; comum, `admin` → os administradores (`role = 'admin'`) do setor e quem tem o módulo `admin`, projetados.
- **RN-04 — `GET /api/usuarios/filtrar`.** O envelope `{ flag, limit, offset, count, items }` igual; os `items` projetados para quem não
  gerencia, inteiros para quem gerencia. As recusas como hoje: flag fora de `vendedor|compras|ti` → 400 `flag inválida. Use: vendedor |
  compras | ti` (com `allowed`); quem não é `role = 'admin'` pedindo flag que não tem → 403 `Filtro não permitido para o seu perfil`;
  isolamento por setor **exato** (`COALESCE(setor,'') = ?`, sem TRIM/LOWER — diferente das outras duas, como hoje), o `?setor=` só para `role =
  'admin'`, o super com `role = 'usuario'` sem a flag → 403 (Fase 2 M5), `ativo` (`1` padrão, `0`, `all`), `departamento`, `q`, `limit`/`offset`. Cenários: comum com `flag_compras`,
  `flag=compras` → os do setor com a flag, projetados, `count` certo; `flag=ti` sem a flag → 403; `flag=xx` → 400; admin `flag=compras`
  → todos os setores, inteiros (com `flag_compras`).
- **RN-05 — a fiação.** O `registrarLeituraDeUsuarios` registra as seis rotas, `/comercial`, `/filtrar` e `/por-modulo/:modulo` **antes**
  de `/api/usuarios/:id` (cenário de rota: o comum pede `/api/usuarios/comercial` e recebe a lista, não o 403 L10 do `/:id`; e estático:
  a ordem do `app._router.stack`). No `index.js`: nenhuma das três `app.get` sobra, nem `function buildSetorCondition`; a chamada
  `registrarLeituraDeUsuarios(app, { getDb: () => db, authenticateToken });` continua uma vez, antes de `app.post('/api/usuarios'`. O
  RN-12 da 130 muda à vista (a âncora `por-modulo` sai do `index.js`).

**B842 — a sessão do inativo.** Teste: `server/tests/api/sessaoDoInativo.api.test.js` (RN-06..RN-08).

- **RN-06 — sem linha ativa, 401.** `enrichUserFromDb(db)` com `req.user.id` de usuário desativado (`ativo = 0`) ou apagado (sem linha)
  → `401 { error: L11, code: 'USUARIO_INATIVO' }` e o `next` **não** é chamado. Ativo → enriquecido como hoje (nome, e-mail, papel,
  super, módulos, perfil do almoxarifado e da frota). *(Fase 2 I1)* Banco ocupado (`isSqliteBusy`) → **503** pelo `respondDbError`
  (`code: 'SQLITE_BUSY'`, `retryAfter: 3`, `context: 'auth:enrich'`) e o pedido não segue — o client repete no 503, ninguém é deslogado;
  outro erro do banco → `next()` **sem** o poder do token (`role = 'usuario'`, sem super, sem módulos, sem perfis). Token sem `id` →
  `next()` sem ler o banco (como hoje).
- **RN-07 — sem cache.** A **mesma** instância de `enrichUserFromDb(db)` usada duas vezes: o papel trocado no banco entre os dois pedidos
  vale no segundo; o usuário desativado entre os dois → o segundo leva 401.
- **RN-08 — integração (rota e serviço).** `criarAuthenticateToken` real (JWT de verdade) + `enrichUserFromDb` real + as rotas do
  `registrarLeituraDeUsuarios`: o token do administrador ativo → `/api/usuarios/comercial` inteiro; o do comum → projetado; o do
  administrador **desativado** (token emitido com `role = 'admin'`, `is_superadmin = 1`) → 401 L11 em `/api/usuarios`,
  `/api/usuarios/comercial`, `/api/usuarios/por-modulo/comercial` e `/api/usuarios/5`; o do apagado → 401 L11. E o serviço:
  `projetarListaDeUsuarios(user, linhas, ['cargo'])` com o usuário rebaixado de verdade.
- **RN-09 — o client desloga com o 401 novo** *(Fase 2 I2: `?sessao_encerrada=1`, e o 401 do `/auth/login` não redireciona)* (`client/src/services/api.js`, já existe — o teste prende): o interceptor recebendo
  `401 { error: L11, code: 'USUARIO_INATIVO' }` remove `token` e `user` do `localStorage` e `token` do `sessionStorage` e manda para
  `/login?sessao_encerrada=1`; o 401 de token vencido continua em `/login?sessao_expirada=1`; o 401 de um pedido a `/auth/login` (senha
  errada, desativado tentando entrar) **não** redireciona nem limpa nada — o formulário mostra a frase do servidor. Teste: `client/src/services/apiSessaoEncerrada.test.js` (axios mockado só na fábrica — captura os
  handlers do interceptor real).
- **RN-10 — o aviso no login** (`components/Login.js`): com `?sessao_encerrada=1`, o aviso `Sessão encerrada — o seu usuário foi
  desativado ou removido. Fale com o administrador do sistema.` (role `alert`); sem o parâmetro, não aparece; o de sessão expirada
  continua só com `?sessao_expirada=1`. Teste: `client/src/components/LoginSessaoEncerrada.test.js`.

## Contrato congelado

- **`GET /api/usuarios/comercial`**, **`GET /api/usuarios/por-modulo/:modulo`** — 200 `[linha]`; para quem não gerencia usuários,
  `[{ id, nome, email, ativo, cargo }]`. Recusas do contexto, como hoje: 401 `Usuário não encontrado` / 403 `Usuário inativo` (passam a
  ser **raros** pelo `authenticateToken` real, que já devolve 401 L11 — alcançáveis no BUSY e na corrida entre as duas leituras; ficam como
  defesa e com cenário).
- **`GET /api/usuarios/filtrar`** — 200 `{ flag, limit, offset, count, items }`; `items` projetados para quem não gerencia. 400 e 403 como
  hoje (literais acima).
- **Qualquer rota com `authenticateToken`**, token válido de usuário sem linha ativa — 401 **L11** = `Sessão encerrada — o usuário foi desativado ou removido`, `code: 'USUARIO_INATIVO'`.
- **`GET /api/auth/me`** do inativo — era 404 `Usuário não encontrado` (o `AuthContext` guardava o usuário velho), passa a 401 L11 pelo
  enriquecimento (o client desloga). *(Fase 2 M3)*
- **Banco ocupado no enriquecimento** — 503 `{ error: 'Banco temporariamente ocupado. Tente novamente em alguns segundos.', code:
  'SQLITE_BUSY', retryAfter: 3, context: 'auth:enrich' }`.
- `services/leituraDeUsuarios.js`: `projetarListaDeUsuarios(user, linhas, extras = [])` (sem `extras`, a forma da 130 — a lista
  `/api/usuarios` não muda); exporta também `CAMPOS_EXTRAS_DOS_SELETORES = ['cargo']`. `services/comercialResponsaveisCache.js` exporta
  `buildSetorCondition`. `services/systemPermissions.js` exporta `LITERAL_SESSAO_ENCERRADA`.

## Tasks (sort topológico)

- [x] **T1 — tronco (núcleo: o enriquecimento)** — `enrichUserFromDb` (RN-06, RN-07) + `sessaoDoInativo.api.test.js` (pronto = RN-06/07
  verdes; a RN-08 depende da T2); os dois `[RN-13 F5 r2]` de `leituraDeUsuarios.api.test.js` mudam à vista (rebaixamento → 401; o
  segundo é reescrito). T1 e T2 editam esse mesmo arquivo de teste: em série.
- [x] **T2 — tronco (núcleo: as listas)** — as três rotas para `services/leituraDeUsuarios.js`, a projeção, o `index.js` (RN-01..RN-05) +
  `listasDeUsuarios.api.test.js`; o RN-12 da 130 muda à vista. Outra regra que a T1 (independente), serializada pelo "um teste por vez".
- [x] **T3 — integração** — RN-08 em `sessaoDoInativo.api.test.js` (rota **e** serviço), depois de T1 e T2.
- [x] **T4 — galho (client)** — `services/api.js` (RN-09) + `components/Login.js` (RN-10), `apiSessaoEncerrada.test.js` e
  `LoginSessaoEncerrada.test.js`, com controle positivo. Nenhum seletor muda: leem `id`, `nome` e `cargo`.
- [x] **T5 — fechamento** — novidades (B844+, C270 resolvida, C271 o socket do chat, D (131), F (131), a seção da etapa, cabeçalho),
  spec 23 (o núcleo), mapa, guia, manual, este plano (retro, "Próxima tarefa detalhada — Etapa 132"), o "defeito que escapou" da retro da
  130. CLAUDE.md: a trava **não** muda.

**Boot:** mexe no `index.js` e na autenticação → boot com pasta de dados vazia (`CRM_DATA_DIR` + `node index.js`), login, as seis rotas e
um usuário desativado com o token na mão levando 401. Sem migração (nenhuma coluna, nenhuma tabela): banco novo e antigo não se aplica.

## Execução — o que aconteceu

- **Fase 0** — medida por mim (grep nos chamadores com a régua testada contra um caso que existe — `Dashboard.js:136`): 12
  consumidores das três listas, os campos que cada um lê (`id`, `nome`; `cargo` em dois), `/filtrar` sem chamador; o cache de 30 s do
  `enrichUserFromDb` morto (uma instância por pedido); o interceptor de 401 do client; os testes que montam o `authenticateToken`.
- **Fase 2 antes do código de produção:** 2 Important + 7 Minor, todos aceitos (ver o topo); os testes T1, T2 e T4 foram escritos e
  rodados **vermelhos** antes do código (`listas` 0/7, `sessao` 2/6 — os 2 eram controles —, e o client caiu no 401 sem
  `sessao_encerrada`). Design e plano `b6ebf17d`.
- **Ordem dos commits ≠ ordem das tasks:** T2 (`31976510`) saiu antes de T1 (`831386a2`) porque a RN-08 (no arquivo da T1) depende
  das rotas movidas; o `leituraDeUsuarios.api.test.js` foi dividido entre os dois commits (o RN-12 no da T2, os RN-13 no da T1) pelo
  índice do git, para cada commit ficar verde sozinho. T3 entrou junto com a T1 (o mesmo arquivo). T4 `bc51b6b5`.
- **Controles positivos** (âncora contada = 1, md5 antes/sabotado/restaurado, restauro por cópia — `scratchpad/e131/bateria.js`):
  **22** antes da Fase 5 (A1..A9, B1..B5, C1..C5) — 20 caem pelo cenário certo, 2 equivalentes (A9: o `undefined → null` do extra,
  a linha do SQL sempre traz `cargo`; B4: um `Map` declarado e não usado) — e **9** das correções da Fase 5 (D1..D9), todas caem.
- **Boot** com pasta de dados vazia (`scratchpad/e131/boot.sh`), antes e depois da Fase 5: login, as seis rotas, o comum criado com as
  listas reduzidas, desativado → 401 L11 nas listas, no `/auth/me` e no `/usuarios/:id`; o login dele, 401 *"Email ou senha
  inválidos"*. Log com 2 linhas de erro — os dois `duplicate column` da migração de `materiais_escritorio`, anteriores (os mesmos da 130).
  **Migração:** nenhuma — banco novo e antigo não se aplica.
- **CLAUDE.md:** a seção da trava **não mudou** (nada aqui mexe em saldo). A seção "Autorização do almoxarifado" continua verdadeira.
- **Suíte antes dos commits de código (T1, T2, T4):** `test:api` **440/440**; `test:almoxarifado` **44/0**; `test:validation` 4/0,
  `test:safealter` 3/0, `test:sqlite` 10/0; client **129** suítes / **1755** testes; `CI=true build` *Compiled successfully*.
- **Fase 5** — três revisores frescos em paralelo sob a trava de máquina; o de sabotagem numa worktree própria (`CRM-wt-e131-r3`,
  removida com as junções desfeitas antes). Eu não rodei nada enquanto eles trabalhavam.
  - **Regra (r1): 0 Critical/Important, 1 Minor** (não reproduzido, por leitura): na corrida entre a releitura da sessão e a da lista, a
    lista responde o 401/403 antigo do contexto → declarado em D (131). Resistiu: os corpos das três rotas idênticos aos de `12de5dc3`;
    o cache; o client até o último gesto (o `error.config.url` continua relativo no axios 1.x).
  - **Permissão (r2): 2 Minor reais (reproduzidos, `e131r2-boot.js`, `e131r2-enrich.js`)** — token sem id/id 0 seguia com o papel do
    token; erro não-BUSY deixava o desativado passar como comum (e o BUSY no perfil virava Produção) → corrigidos (`5974a6c7`, B845). E
    três candidatos a C: o chat (medido: o desativado conecta de novo e recebe o conteúdo das mensagens; o apagado com o socket aberto
    também) → **C271** reescrita com o medido; a Lista de Tarefas devolve `role` de todos → **C272**; as rotas de permissões com `role ===
    'admin'` exato → **C273**. A tabela perfil × rota medida (14 perfis × 6 rotas, servidor de verdade) está no relatório do r2; o resumo, em "O que a revisão encontrou" da novidades.
  - **Sabotagem (r3): 46** sabotagens novas, **39** sobreviveram: **31** (a) faltava asserção → viraram cenários (`5974a6c7`,
    `38dc9a46`) e, rodada a bateria dele de novo contra a branch, **todas caem**; **8** (b) equivalentes provados (o `'true'` do ativo, o
    `DISTINCT`, o perfil do token que nunca vem, as variações da régua do login, o `config?.`, o aviso pela mensagem, o `!sessaoExpirada`).
- **Suíte final (depois da Fase 5, antes da documentação):** `test:api` **440/440**; `test:almoxarifado` **44/0**; `test:validation`
  4/0, `test:safealter` 3/0, `test:sqlite` 10/0; client **129** suítes / **1756** testes; `CI=true build` *Compiled successfully*.
- **T5 — fechamento** (o commit de documentação — ver `git log`): novidades (cabeçalho, B842 marcada como substituída, B844–B847, C270
  resolvida, C271–C273, D (131), F (131), a seção da etapa, "Onde estamos"), spec 23 (a B842 da 130 dizia "erro do banco não rebaixa" —
  **estava errado como regra**, dito à vista), mapa, guia, manual (5.2d e 5.2e nova), este plano, o "defeito que escapou" da retro da 130.

## Tasks — estado

- [x] **T1** `831386a2` (Fase 5 `5974a6c7`) · [x] **T2** `31976510` (Fase 5 `5974a6c7`) · [x] **T3** `831386a2` · [x] **T4**
  `bc51b6b5` (Fase 5 `38dc9a46`) · [x] **T5** — o commit de documentação.

## Retro (4 números)

1. **Rodadas de correção até verde:** **1** (Fase 5). Testes antigos que mudaram à vista: os dois `[RN-13 F5 r2]` e o RN-12 de
   `leituraDeUsuarios.api.test.js` (130).
2. **Achados da revisão:** Fase 2 — **2 Important + 7 Minor, todos reais** (o I1 reproduzido). Fase 5 — r1 **1 Minor** real (declarado);
   r2 **2 Minor** reais (corrigidos) + 3 candidatos a C reais (C271–C273); r3 **39** sobreviventes — 31 viraram cenários, 8 equivalentes
   provados; **0** ruído.
3. **Paralelismo:** **0** galhos em paralelo de fato (a T4 é galho, mas o "um teste por vez" a serializa), **0** retrabalho; **1** revisor
   na Fase 2 e **3** em paralelo na Fase 5 sob a trava.
4. **Defeito que escapou:** **1** — o `PUT /api/usuarios/:id` sem o campo `ativo` gravava `NULL` (anterior à 131), e a régua exata da 131
   (`ativo = 1` no enriquecimento e no login) passou a trancar esse usuário fora — inclusive o último super administrador, porque a trava
   dele (`countActiveSuperAdmins`, `COALESCE(ativo, 1)`) conta o `NULL` como ativo. Achado pelo r2 da Fase 5 da **132**, reproduzido no
   servidor real; corrigido em `1d13093e` (`ativo = COALESCE(?, ativo)`), com a consulta **A79** para o que ficou assim antes. A 131 mediu
   quem **lê** `ativo`, não quem o **grava** — a lição: régua nova sobre uma coluna exige medir os escritores dela também.

## Próxima tarefa detalhada — Etapa 132

*(A série desta etapa foi B844–B847, C271–C273, nenhuma A — a 132 começa em **B848**, **C274**, **A79**; confira com `grep -oE` antes.)*

**Medido em 2026-10-16 (Fase 5 desta etapa):** sem o P.O., três candidatas do núcleo, todas reversíveis.

1. **C271 — o desativado no chat em tempo real (núcleo) — a principal. Não depende do P.O.** `server/services/chat/socket.js`:
   `criarAuthSocket` (linha ~22) só faz `jwt.verify`; `io.on('connection')` põe o socket na sala `user:<id>`; `join_conversa` (~53)
   confere `chatService.isParticipant`, que não olha `ativo`. **Medido pelo r2 desta etapa** (`scratchpad/e131/e131r2-boot.js`, com
   socket.io-client): desativado → conexão nova aceita com o token velho, entra na conversa, recebe o conteúdo da mensagem nova; apagado
   com o socket aberto continua recebendo. **Candidato:** reler `usuarios.ativo` no handshake (recusar com `Sessão encerrada…`) e no
   `join_conversa`; no `PATCH /api/usuarios/:id/status` (`index.js` ~3945) com `ativo = 0` e no `DELETE /api/usuarios/:id` (~3992),
   derrubar os sockets da sala `user:<id>` (`initChatSocket` devolve o `chatSocket` — `index.js` ~22567 — medir se expõe o `io`).
   **Pontos de atenção:** o teste existente `chatSocketTokenNaUrl.api.test.js` monta o `criarAuthSocket` com usuário fora do banco
   (o handshake passa a precisar do `db`: mudar a assinatura muda esse teste à vista); o `index.js` cria o socket depois de o banco
   abrir; o BUSY no handshake não pode derrubar ninguém (o client do chat reconecta?) — medir `client/src/services` do chat antes. Boot
   com pasta vazia obrigatório (mexe no `index.js`).
2. **C272 — a Lista de Tarefas devolve o papel de todos (núcleo).** `server/services/todolist/todolistService.js:46`
   (`SELECT id, nome, email, role`), servido por `GET /api/todolist/usuarios` e dentro do `/api/todolist/board`. **Medido nesta etapa:**
   `grep "\.role" client/src/components/todolist` → **0** (a tela não lê o papel) → candidato: tirar `role` do SELECT (ou a projeção
   da B844). Confirmar com teste de rota.
3. **C273 — as rotas de permissões com `role === 'admin'` exato (núcleo).** `/api/permissoes/*` (`index.js` ~18475, ~18707) recusam o
   super administrador sem o papel *admin* e o *Admin* com maiúscula, que o cadastro aceita (`canManageUsers`). Candidato: a mesma régua.
   **Atenção:** muda quem pode mexer em permissão — é ampliação de acesso; registrar na letra B com o descartado.
4. **Dependem do P.O. — NÃO implemente:** **B808**, **B755**, **B761**/**C239**, **C224**, o resto da **C225**, **C228**, **C219**,
   **C230**, o reparo da **C246** (e a **C247**), a tabela de conversões e o grupo acima de família, a **régua do tempo de recebimento
   (E2)**, a **C268** (o custo sigiloso?), a **C269** (o documento da nota deve seguir o estoque corrigido pelo estorno?); na 05, os itens
   de produto e a **C198**; na 06, a **B11** e a Engenharia; na 21, a valorização por cliente e previsto × realizado; na 22, **B13**,
   **B101**/G30, **G38**.

**Escolhida: a C271 (1)**, com a C272 (2) se couber com qualidade — as duas do núcleo, reversíveis, registradas na letra B. A C273
amplia acesso: só com o registro explícito na letra B, numa etapa própria.

**O que já está pronto e não precisa reabrir:** as seis leituras de `services/leituraDeUsuarios.js` (com a projeção
`projetarListaDeUsuarios(user, linhas, extras)` — a C272 pode reusá-la), o `enrichUserFromDb` (401 `USUARIO_INATIVO`, `respondDbError`
em qualquer erro, sem cache; `LITERAL_SESSAO_ENCERRADA` exportado — o handshake do chat deve reusar a mesma frase), o interceptor do
client (`sessao_encerrada=1`) e o aviso do Login.
