# Etapa 132 (núcleo): o usuário desativado no chat em tempo real (C271) e o papel na Lista de Tarefas (C272) — plano

> Origem: "Próxima tarefa detalhada — Etapa 132" do plano da 131. Design com a Fase 0 medida:
> `docs/superpowers/specs/2026-10-16-almoxarifado-etapa132-o-inativo-no-chat-design.md`.
>
> **Numeração** (conferida com `grep -oE` em `docs/almoxarifado-novidades-por-etapa.md` em 2026-10-16): última B **B847**, último C
> **C273**, última A **A78**. Esta etapa: **B848+**, **C274+**, **A79+**. Worktree `CRM-wt-e132`, branch `etapa-e132` (a partir da main
> `e4c05102`).
>
> **Ordem da skill:** este plano é revisado (Fase 2) por um agente fresco **antes** de qualquer código de produção.
>
> **Fase 2 (um revisor fresco, sonda `scratchpad/e132/rev2-sonda-io.js` sob a trava, socket.io 4.8.3 dos dois lados nos três
> transportes): 0 Critical, 3 Important + 13 Minor, todos aceitos — antes de qualquer código de produção.** A sonda confirmou o que o design
> afirmava da biblioteca (recusa no middleware chega com `message` e `data` e não reconecta; o evento emitido antes de
> `disconnectSockets(true)` chega, e o client vê `io server disconnect`). **I1** — a releitura com erro emitia `sessao_encerrada` e o
> client (RN-07) deslogaria um **ativo** com a frase de desativado em qualquer PUT com o banco ocupado → RN-04: no erro, derruba **sem** o
> evento (o client reconecta no próximo gesto e o handshake relê). **I2** — o socket do usuário anterior na mesma aba (o logout não desconecta,
> o `connectChatSocket` não confere o token) deslogaria quem entrou depois quando o anterior fosse desativado → RN-07: o socket guarda o
> token com que nasceu, é recriado quando o token muda, ignora `sessao_encerrada`/`connect_error` de um token que não é mais o da aba, e o
> `logout` desconecta. **I3** — o `index.js` do teste da RN-06 ficaria órfão no Windows se o arquivo estourasse o prazo → preload
> `tests/helpers/morreComOPai.js` (stdin em `pipe`; sai no `end`) + `kill` no `exit`. **M1** a Promise de `encerrarSocketsSeInativo`
> nunca rejeita; **M2** `idDoTokenValido` passa a ser exportado de `systemPermissions.js` (uma régua só); **M3** literal do log
> `[chat socket] encerrar:`; **M4** a queda conferida pelo pacote `41`, não só pelo fechamento; **M5** o id normalizado (`Number`) nas duas
> funções (`/api/usuarios/05/status` acharia a sala `user:05` vazia); **M6** o jest isola o módulo e substitui o `window.location`; **M7** a
> reativação entra na RN-06; **M8** o PUT deixa o administrador desativar a si mesmo e o PUT sem `ativo` grava `NULL`, que a contagem de
> super administradores trata como ativo (anteriores) → C; **M9** a corrida handshake × sala → D (132); **M10–M13** o teste do servidor
> real: log em arquivo, prontidão pelo login **e** pelo `/socket.io/?EIO=4&transport=polling`, porta escolhida antes e longe da 5000,
> `spawn` (não `fork`) com env explícita sem `NODE_ENV`, `rmSync` com retentativas depois do `exit`.
>
> **Trava de máquina:** `scratchpad/e132-lock.sh` (diretório `maquina-testes.lock`, o mesmo da 129–131). Um arquivo de teste de servidor
> por vez, inclusive os revisores; nunca `test:api` junto com o jest nem dois `test:api`.

## Regras de negócio

"Linha ativa" = `SELECT … FROM usuarios WHERE id = ? AND ativo = 1` — a mesma régua do `enrichUserFromDb` (131): desativado (`ativo = 0`),
`ativo` nulo ou texto (`'true'`) e apagado contam como **sem linha ativa**. **L11** = `LITERAL_SESSAO_ENCERRADA` (`services/systemPermissions.js`)
= `Sessão encerrada — o usuário foi desativado ou removido`.

**C271 — o socket do chat.** Teste de serviço: `server/tests/api/chatSocketSessaoDoInativo.api.test.js` (RN-01..RN-04, RN-05 estático do
`socket.js`) — servidor HTTP de verdade + `initChatSocket` de produção + SQLite `:memory:` (DDL de produção de `usuarios` no subconjunto
de colunas que a régua lê, `initChatSchema` de produção) + um cliente socket.io mínimo sobre `ws` (`server/tests/helpers/clienteSocketIo.js`,
protocolo EIO 4: `0` aberto, `40` conectar com `auth`, `44` recusa, `42` evento, `41` desconexão, `2`/`3` ping). Teste de rota:
`server/tests/api/chatSocketInativoNoServidor.api.test.js` (RN-05 estático do `index.js`, RN-06) — sobe o `index.js` real com pasta de
dados vazia numa porta livre.

- **RN-01 — o handshake confere a linha ativa.** Token válido de usuário com linha ativa → conecta (`socket.user` = o payload, como hoje).
  Desativado → recusa: o client recebe `connect_error` com `message` = **L11** e `data` = `{ code: 'USUARIO_INATIVO' }`. Apagado (sem linha)
  → igual. `ativo` `NULL` e `ativo = 'true'` → igual. Token sem `id`, `id: 0`, `id: 'abc'` → igual, **sem** ler o banco. Sem token →
  `Token não fornecido`; assinatura errada ou vencido → `Token inválido` (como hoje, sem `data`). **Banco com erro** na leitura (BUSY ou
  outro) → **conecta** (como hoje), `console.warn('[chat socket] handshake: …')` — cenário: o usuário ativo com o banco ocupado conecta;
  o **desativado** com o banco ocupado conecta, mas a RN-02 não o deixa entrar na conversa nem receber a mensagem.
- **RN-02 — entrar na conversa relê a linha.** `join_conversa`: ativo e participante → entra (recebe a `nova_mensagem` seguinte da
  conversa); ativo e **não** participante → não entra, o socket continua conectado (como hoje); **sem linha ativa** (o socket passou no
  handshake antes de desativar, ou pelo banco ocupado) → o socket recebe `sessao_encerrada` `{ error: L11, code: 'USUARIO_INATIVO' }` e é
  desconectado pelo servidor, sem entrar (não recebe a `nova_mensagem` seguinte); erro do banco → não entra, o socket continua (como hoje);
  `conversaId` não numérico/0 → ignora (como hoje).
- **RN-03 — "digitando" relê a linha.** `typing`: ativo e participante → os outros da conversa recebem `typing { conversa_id, usuario_id,
  typing }` (como hoje); não participante → nada; sem linha ativa → `sessao_encerrada` + desconectado, e **nada** chega aos outros.
- **RN-04 — derrubar na hora (serviço).** `initChatSocket(...)` devolve também `encerrarSocketsDoUsuario(id)` — todos os sockets da sala
  `user:<id>` recebem `sessao_encerrada` e caem (os de outro usuário não) — e `encerrarSocketsSeInativo(id)` (Promise) — relê a linha:
  ativa → ninguém cai; sem linha ativa → `sessao_encerrada` e cai; **erro na releitura → cai SEM o `sessao_encerrada`** (`console.warn('[chat
  socket] encerrar: …')`; decisão B: é chamada logo depois de o administrador gravar a linha deste usuário; o ativo derrubado por engano
  não é deslogado — o client fica parado e reconecta no próximo gesto do chat, e o handshake relê —, e o desativado que não caísse seguiria
  recebendo o conteúdo de uma conversa em que já estava). *(Fase 2 I1)* A Promise **nunca rejeita** (M1). O id é normalizado com `Number`
  nas duas funções (M5: `'05'` → sala `user:5`). "Cai" = o client recebe o pacote de desconexão do servidor (`41`), não só o fim do
  transporte (M4). Depois de cair, a conexão nova com o mesmo token é recusada (RN-01).
- **RN-05 — a fiação.** `socket.js`: `io.use(criarAuthSocket(jwtSecret, db));` é o único `io.use`; `criarAuthSocket` sem `db` **lança**
  (`criarAuthSocket: db obrigatorio`). `index.js` (estático, sem comentários): o `PATCH /api/usuarios/:id/status` chama
  `chatSocket.encerrarSocketsDoUsuario` só no ramo `ativo === 0` e depois do `UPDATE` sem erro; o `PUT /api/usuarios/:id` chama
  `chatSocket.encerrarSocketsSeInativo(id)` dentro do `finishUpdate` depois do `if (err)`; o `DELETE /api/usuarios/:id` chama
  `chatSocket.encerrarSocketsDoUsuario(targetId)` depois do `db.exec` da transação. As três com guarda para `chatSocket` nulo (módulo de
  chat que não subiu).
- **RN-06 — integração pela rota (o servidor real).** O `index.js` com pasta vazia: o seed administrador e quatro usuários comuns (`pat`,
  `put`, `del`, `ok`), uma conversa direta do administrador com cada um, os cinco sockets abertos e nas conversas. `PATCH …/status
  { ativo: 0 }` em `pat` → 200 e o socket de `pat` recebe `sessao_encerrada` e cai; `PUT /api/usuarios/:id` de `put` com `ativo: 0` → 200
  e cai; `DELETE` de `del` → 200 e cai; a mensagem nova do administrador para cada um **não** chega a nenhum dos três; o `ok` e o
  administrador continuam conectados e recebendo; a conexão nova de `pat`, `put` e `del` com o token velho → `connect_error` L11 com
  `USUARIO_INATIVO`. E as recusas não derrubam: `PATCH …/status { ativo: 0 }` do administrador **nele mesmo** → 403 `Não é possível
  desativar o próprio usuário` e o socket dele segue; `PATCH …/status { ativo: 1 }` em `ok` (já ativo) → 200 e `ok` segue; `PUT` de `ok`
  mantendo `ativo: 1` → 200 e `ok` segue. *(Fase 2 M7)* E a reativação: `PATCH …/status { ativo: 1 }` em `pat` → a conexão nova com o
  token velho **conecta** e recebe a mensagem seguinte da conversa (a linha de participante ficou). O `index.js` sobe com o preload
  `tests/helpers/morreComOPai.js` (I3), log num arquivo da pasta temporária (despejado só na falha), porta livre escolhida antes, `spawn`
  com env explícita (`CRM_DATA_DIR`, `PORT`, `SEED_ADMIN_EMAIL`/`SEED_ADMIN_PASSWORD`, sem `NODE_ENV`), prontidão = login 200 **e**
  `GET /socket.io/?EIO=4&transport=polling` 200 (prazo 60 s; falha na hora se o filho sair), limpeza depois do `exit` (M10–M13).
- **RN-07 — o client sai com a sessão encerrada** (`client/src/services/chatSocket.js`). Ao criar o socket, ouve `sessao_encerrada` e
  `connect_error`: `sessao_encerrada` → remove `token` e `user` do `localStorage` e `token` do `sessionStorage` e manda para
  `/login?sessao_encerrada=1`; `connect_error` com `err.data.code === 'USUARIO_INATIVO'` → o mesmo; `connect_error` sem esse código
  (`Token inválido`, erro de rede sem `data`) → não limpa nada nem redireciona. *(Fase 2 I2)* O socket guarda o token com que nasceu:
  `connectChatSocket` com outro token na aba desconecta o velho e cria um novo; `sessao_encerrada`/`connect_error` de um socket cujo token
  não é mais o da aba → ignorado (não limpa o token de quem entrou depois); o `logout` do `AuthContext` chama `disconnectChatSocket()`.
  Teste: `client/src/services/chatSocketSessaoEncerrada.test.js` (o `io` do `socket.io-client` mockado só na fábrica — captura os handlers
  registrados pelo `connectChatSocket` real; `jest.isolateModules` por caso e `window.location` substituído — M6).

**C272 — a Lista de Tarefas.** Teste: `server/tests/api/todolistUsuariosSemPapel.api.test.js`.

- **RN-08 — sem o papel.** `GET /api/todolist/usuarios` e o `usuarios` de `GET /api/todolist/board` → cada linha com **exatamente** `id`,
  `nome`, `email` (sem `role`), só os ativos, por nome sem diferença de caixa (como hoje). Cenário pela rota (registrador de produção
  `routes/todolist.js`, SQLite real, quem pede é administrador e comum — a forma é a mesma) e pelo serviço (`listUsuariosAtivos`).

## Contrato congelado

- **Handshake do socket** (`/socket.io`, `auth: { token }`): sem linha ativa → `connect_error` `{ message: L11, data: { code:
  'USUARIO_INATIVO' } }`. Os outros como hoje (`Token não fornecido`, `Token inválido`, sem `data`). Banco com erro → conecta.
- **Evento do servidor `sessao_encerrada`** → `{ error: L11, code: 'USUARIO_INATIVO' }`, seguido da desconexão pelo servidor
  (`io server disconnect` no client).
- `services/chat/socket.js`: `criarAuthSocket(jwtSecret, db)` (o `db` obrigatório); `initChatSocket(httpServer, db, jwtSecret)` devolve
  `{ io, emitNewMessage, emitMessageRead, encerrarSocketsDoUsuario, encerrarSocketsSeInativo }` (a segunda resolve sempre); exporta
  `PAYLOAD_SESSAO_ENCERRADA`. `services/systemPermissions.js` passa a exportar `idDoTokenValido` (M2).
- **Nenhuma rota HTTP muda** de resposta (o `PATCH`, o `PUT` e o `DELETE` respondem como hoje; a derrubada é efeito colateral depois do
  sucesso).
- `GET /api/todolist/usuarios` → `[{ id, nome, email }]`; `GET /api/todolist/board` → `usuarios: [{ id, nome, email }]` (o resto igual).

## Tasks (sort topológico)

- [x] **T1 — tronco (núcleo: o socket)** — `socket.js`, o export de `idDoTokenValido` (RN-01..RN-04, a parte do `socket.js` da RN-05), o cliente mínimo de teste,
  `chatSocketSessaoDoInativo.api.test.js`; o `chatSocketTokenNaUrl.api.test.js` muda à vista (assinatura com `db`, usuário 7 no banco,
  a regex da fiação).
- [x] **T2 — tronco/integração (núcleo: as três portas)** — `index.js` (RN-05 do `index.js`) + `chatSocketInativoNoServidor.api.test.js`
  (RN-06). Depende da T1.
- [x] **T3 — galho (client)** — `chatSocket.js` e o `logout` do `AuthContext.js` (RN-07) + `chatSocketSessaoEncerrada.test.js`, com controle positivo. Consome só o
  contrato do evento.
- [x] **T4 — galho (C272)** — `todolistService.js` + `todolistUsuariosSemPapel.api.test.js` (RN-08). Independente das outras.
- [x] **T5 — fechamento** — novidades (B848+, C271 e C272 resolvidas, C274+ — a reentrada na conversa depois de cair a rede —, D (132)
  das URLs assinadas e das telas por fora, F (132), a seção da etapa, cabeçalho), spec 23 (o núcleo), mapa, guia, manual, este plano
  (retro, "Próxima tarefa detalhada — Etapa 133"), o "defeito que escapou" da retro da 131. CLAUDE.md: a trava **não** muda.

**Paralelismo:** T3 e T4 são galhos de regra independente, mas o "um teste de servidor por vez" serializa a T4; a T3 é jest (não junto
com `test:api`). Executo em série, eu mesmo.

**Boot:** mexe no `index.js` → boot com pasta de dados vazia (`CRM_DATA_DIR` + `node index.js`) — a RN-06 já é isso dentro da suíte, e a
sonda `scratchpad/e132/sonda-chat.sh` repete o quadro da Fase 0 depois. Sem migração (nenhuma coluna, nenhuma tabela): banco novo e
antigo não se aplica.

**Controles positivos previstos** (âncora contada = 1, md5 antes/sabotado/restaurado, restauro por cópia): o handshake sem a leitura
(RN-01), o `AND ativo = 1` fora da régua (RN-01, `ativo = 'true'`), o BUSY recusando (RN-01), o `join` sem a releitura (RN-02), o `typing`
sem a releitura (RN-03), o `encerrarSocketsSeInativo` que não derruba no erro (RN-04), cada uma das três chamadas do `index.js` removida
(RN-05/06), o `ativo === 0` invertido no PATCH (RN-06: o `ok` reativado cairia), o `connect_error` sem a régua do código (RN-07), o
`role` de volta no SELECT (RN-08).

## Execução — o que aconteceu

- **Fase 0** — medida por mim no servidor real (`scratchpad/e132/sonda-chat.js`, socket.io-client 4.8.3 do client, `index.js` com pasta
  vazia): as três portas (PATCH de status, PUT, DELETE) deixavam o socket aberto recebendo `SEGREDO-*`; conexão nova aceita; o `typing`
  do desativado chegava ao administrador. Boot do `index.js` em ≈ 1,6 s (`tempo-boot.sh`) — viabilizou a RN-06 dentro da suíte.
- **Fase 2 antes do código de produção:** 3 Important + 13 Minor, todos aceitos (ver o topo). Os testes da T1 foram escritos e rodados
  **vermelhos** antes do código (3/22 — os 3 verdes eram comportamento de hoje: ativo conecta, sem token, não participante); o da T4 (0/5) e
  os do client (2/7; o "[F2-I2] anterior" passava vazio, provado depois pela sabotagem C1). Design e plano `a5369920`.
- **Commits:** T1 `6a77a4cb`, T2 `4c451c60`, T4 `45f604bb`, T3 `7ca9e395`; Fase 5 `55226494` (socket), `1d13093e` (index.js),
  `5950809d` (todolist), `146065f4` (client).
- **Divergências do plano:** (1) o teste da Lista de Tarefas nasceu com `fetch` e o Node no Windows derrubava o processo no
  `process.exit` (assert do libuv com o keep-alive do `fetch`) — trocado por `supertest`, como os outros; (2) o I3 (o `index.js` órfão)
  foi **medido**: no Windows o job object do libuv já mata o neto quando o pai morre (sem `detached`), e com `detached: true` sem o
  preload o neto sobrevive, com o preload sai (`scratchpad/e132/orfao.js`) — o preload fica para o Linux; (3) **o contrato "nenhuma rota
  HTTP muda" deixou de valer na Fase 5**: o `PUT /api/usuarios/:id` do próprio usuário com `ativo` falso passa a 403 *"Não é possível
  desativar o próprio usuário"*, o `PATCH …/status` compara o id pelo número, e o PUT sem `ativo` mantém o gravado (`COALESCE`) — B852;
  (4) a reentrada na conversa depois de reconectar, que o plano registraria como C nova, foi **corrigida** na Fase 5 (B849) — a C274 virou
  outro achado (o `mensagem_excluida` com o id cru).
- **Controles positivos** (âncora contada = 1, md5 antes/sabotado/restaurado, restauro por cópia): **23** antes da Fase 5
  (`scratchpad/e132/bateria.js` S1..S17 e `bateria-client.js` C1..C6) — todas caem pelo cenário certo; **16** da Fase 5
  (`bateria-f5.js` D1..D16): 15 caem pelo cenário certo (D1 pelo crash do processo — o servidor real também cairia; D5, D6 e D8 pelo
  teste certo, o casamento do script cortou o nome em 150 caracteres), **1 equivalente provado** (D7: sem a marca `encerrada`, o reconectar
  já é barrado porque o aviso da mesma sessão limpa o token e o de outra sessão tem token diferente).
- **Boot** com pasta de dados vazia: a RN-06 dentro da suíte (o `index.js` real) e a sonda `sonda-chat.sh` antes (o quadro da Fase 0),
  depois da T2 e depois da Fase 5: as três conexões caem como `io server disconnect` e não voltam; as três conexões novas recusadas com L11;
  o `ok` segue recebendo. Log com 2 linhas de erro — os dois `duplicate column` da migração de `materiais_escritorio`, anteriores.
  **Migração:** nenhuma.
- **CLAUDE.md:** a seção da trava **não mudou** (nada aqui mexe em saldo).
- **Suíte antes dos commits de código (T1–T4):** `test:api` **443/443**; `test:almoxarifado` **44/0**; `test:validation` 4/0,
  `test:safealter` 3/0, `test:sqlite` 10/0; client **131** suítes / **1763** testes; `CI=true build` *Compiled successfully*.
- **Fase 5** — três revisores frescos em paralelo sob a trava de máquina; o de sabotagem numa worktree própria (`CRM-wt-e132-r3`, removida
  com as junções desfeitas antes). Eu não rodei nada enquanto eles trabalhavam.
  - **Regra (r1): 0 Critical/Important, 4 Minor** (sonda `r1-sonda.js`, polling e duas abas reproduzidos): "reconecta no próximo gesto"
    era otimista e a conversa aberta não voltava depois de reconectar → corrigido (`146065f4`, B849); `emit('typing')` sem payload lançava
    fora do `try` → corrigido (`55226494`); duas abas com o mesmo usuário relogado e o socket recriado sem os ouvintes do ChatPage →
    declarados (D (132)) / sem ação.
  - **Permissão (r2): 2 Important + 1 Minor, anteriores à etapa** (sonda `r2-sonda.js`, tabela perfil × canal no servidor real): o
    administrador se desativava por `/usuarios/02/status` (N1) → corrigido; o administrador do sistema desativa um super (N2) → pergunta
    **B853**; e o **M8** da Fase 2 confirmado e subido a Important (o PUT sem `ativo` tranca o último super fora) → corrigido com o PUT do
    próprio usuário (`1d13093e`, B852, A79); o `mensagem_excluida` com o id cru → **C274**.
  - **Sabotagem (r3): 49** sabotagens novas, **11** sobreviveram: **8** (a) faltava asserção → viraram cenários (`55226494`,
    `5950809d`, `146065f4`) e as 8 caem na bateria D (D9..D16); **3** (b) equivalentes provados (K4, K5, K12).
- **Suíte final (depois da Fase 5, antes da documentação):** `test:api` **443/443**; `test:almoxarifado` **44/0**; `test:validation`
  4/0, `test:safealter` 3/0, `test:sqlite` 10/0; client **131** suítes / **1768** testes; `CI=true build` *Compiled successfully*.
- **T5 — fechamento** (o commit de documentação — ver `git log`): novidades (cabeçalho, A79, B848–B854, C271 e C272 resolvidas, C274, D
  (132), F (132), a seção da etapa, "Onde estamos"), spec 23, mapa, guia, manual (5.2e), este plano, o "defeito que escapou" da retro da 131.

## Tasks — estado

- [x] **T1** `6a77a4cb` (Fase 5 `55226494`) · [x] **T2** `4c451c60` (Fase 5 `1d13093e`) · [x] **T3** `7ca9e395` (Fase 5 `146065f4`) ·
  [x] **T4** `45f604bb` (Fase 5 `5950809d`) · [x] **T5** — o commit de documentação.

## Retro (4 números)

1. **Rodadas de correção até verde:** **1** (Fase 5). Teste antigo que mudou à vista: `chatSocketTokenNaUrl.api.test.js` (a assinatura).
2. **Achados da revisão:** Fase 2 — **3 Important + 13 Minor, todos reais** (as afirmações da biblioteca confirmadas por sonda). Fase 5 —
   r1 **4 Minor** reais (2 corrigidos, 2 declarados); r2 **2 Important + 1 Minor** reais, anteriores à etapa (1 corrigido, 1 pergunta B853,
   1 C) + o M8 confirmado e corrigido; r3 **11** sobreviventes — 8 viraram cenários, 3 equivalentes provados; **0** ruído.
3. **Paralelismo:** **0** galhos em paralelo de fato (T3 e T4 são galhos, mas o "um teste por vez" os serializa), **0** retrabalho; **1**
   revisor na Fase 2 e **3** em paralelo na Fase 5 sob a trava.
4. **Defeito que escapou:** *(preencher na Etapa 133)*.

## Próxima tarefa detalhada — Etapa 133

*(A série desta etapa foi B848–B854, C274, A79 — a 133 começa em **B855**, **C275**, **A80**; confira com `grep -oE` antes.)*

**Medido em 2026-10-16 (fechamento desta etapa):** as candidatas do núcleo sem o P.O. que sobram são a **C273** e a **C274**.

1. **C273 — as rotas com `role === 'admin'` exato (núcleo) — a principal.** `server/index.js`: as rotas de `/api/permissoes/*` (≈ 18487
   `GET /usuario/:id`, 18508 `/verificar`, 18570 `POST /`, 18641–18789 os grupos e os usuários do grupo, 20188 `DELETE /usuario/:id/modulos`)
   recusam com `req.user.role !== 'admin'` — o super administrador com outro papel e o papel *Admin* com maiúscula levam 403, enquanto o
   cadastro de usuários aceita (`canManageUsers` = `isSystemAdmin`, `services/systemPermissions.js:42`). **Efeito na tela (medir):**
   `UsuarioForm.js:276`/`:284` grava os módulos pelo `DELETE /permissoes/usuario/:id/modulos` e `POST /permissoes` — o super sem o papel
   *admin* salva o cadastro e pode **perder** a gravação das permissões (403 no meio do salvar?); `Permissoes.js` inteira. Fora das
   permissões, o mesmo padrão em ≈ 14323 (aprovações), 17947–18030 (materiais de escritório da Engenharia), 20667, 22397 — **medir cada um**
   e decidir por rota (nem todo "admin" é "gerencia usuários"). **Candidato:** trocar a régua das rotas de permissões por `canManageUsers`
   (o que o cadastro já usa). **Atenção:** é **ampliação de acesso** (o super sem o papel e o *Admin* com maiúscula passam a mexer em
   permissões) — registrar na letra B com o descartado (manter exato; ou só o super). Teste de rota com o registrador de produção — as
   rotas estão no `index.js`: extrair para um serviço (como a 131 fez com as listas) ou estender o teste que sobe o `index.js` real
   (`chatSocketInativoNoServidor.api.test.js` é o molde: porta livre, pasta vazia, preload `morreComOPai`). Boot com pasta vazia obrigatório.
2. **C274 — o `mensagem_excluida` com o id cru (núcleo, pequeno).** `server/routes/chat.js:253` emite para `` `conversa:${req.params.id}` ``
   — com `/conversas/03/...` a sala fica `conversa:03`; normalizar com `Number`. Cabe junto da C273.
3. **Dependem do P.O. — NÃO implemente:** **B853** (o administrador do sistema desativa um super?), **B808**, **B755**, **B761**/**C239**,
   **C224**, o resto da **C225**, **C228**, **C219**, **C230**, o reparo da **C246** (e a **C247**), a tabela de conversões e o grupo acima
   de família, a **régua do tempo de recebimento (E2)**, a **C268**, a **C269**; na 05, os itens de produto e a **C198**; na 06, a **B11** e
   a Engenharia; na 21, a valorização por cliente e previsto × realizado; na 22, **B13**, **B101**/G30, **G38**.

**Escolhida: a C273 (1)**, com a C274 (2) junto — as duas do núcleo, reversíveis (a C273 com o registro de ampliação de acesso na letra B).
Depois delas, as candidatas do núcleo sem o P.O. acabam: a 134 mede o mapa `specs/modulo-almoxarifado/README.md` e o do Compras
(`specs/modulo-compras/README.md`) por algo de valor que não dependa do P.O.

**O que já está pronto e não precisa reabrir:** o socket do chat (`services/chat/socket.js`: o handshake, o `join`/`typing` e as duas
`encerrarSockets*`, com o cliente mínimo `tests/helpers/clienteSocketIo.js`), as três portas do `index.js`, o client do chat
(`chatSocket.js`: o token do socket, o aviso, a reconexão e a reentrada), o `enrichUserFromDb` da 131 e o teste que sobe o `index.js`
real (molde para a RN de rota da C273).
