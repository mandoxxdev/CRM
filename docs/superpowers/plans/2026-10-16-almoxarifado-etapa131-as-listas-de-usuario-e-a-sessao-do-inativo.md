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

- [ ] **T1 — tronco (núcleo: o enriquecimento)** — `enrichUserFromDb` (RN-06, RN-07) + `sessaoDoInativo.api.test.js` (pronto = RN-06/07
  verdes; a RN-08 depende da T2); os dois `[RN-13 F5 r2]` de `leituraDeUsuarios.api.test.js` mudam à vista (rebaixamento → 401; o
  segundo é reescrito). T1 e T2 editam esse mesmo arquivo de teste: em série.
- [ ] **T2 — tronco (núcleo: as listas)** — as três rotas para `services/leituraDeUsuarios.js`, a projeção, o `index.js` (RN-01..RN-05) +
  `listasDeUsuarios.api.test.js`; o RN-12 da 130 muda à vista. Outra regra que a T1 (independente), serializada pelo "um teste por vez".
- [ ] **T3 — integração** — RN-08 em `sessaoDoInativo.api.test.js` (rota **e** serviço), depois de T1 e T2.
- [ ] **T4 — galho (client)** — `services/api.js` (RN-09) + `components/Login.js` (RN-10), `apiSessaoEncerrada.test.js` e
  `LoginSessaoEncerrada.test.js`, com controle positivo. Nenhum seletor muda: leem `id`, `nome` e `cargo`.
- [ ] **T5 — fechamento** — novidades (B844+, C270 resolvida, C271 o socket do chat, D (131), F (131), a seção da etapa, cabeçalho),
  spec 23 (o núcleo), mapa, guia, manual, este plano (retro, "Próxima tarefa detalhada — Etapa 132"), o "defeito que escapou" da retro da
  130. CLAUDE.md: a trava **não** muda.

**Boot:** mexe no `index.js` e na autenticação → boot com pasta de dados vazia (`CRM_DATA_DIR` + `node index.js`), login, as seis rotas e
um usuário desativado com o token na mão levando 401. Sem migração (nenhuma coluna, nenhuma tabela): banco novo e antigo não se aplica.

## Execução — o que aconteceu

*(preencher)*
