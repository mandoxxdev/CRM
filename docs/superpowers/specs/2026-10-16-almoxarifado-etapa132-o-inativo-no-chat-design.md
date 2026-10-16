# Etapa 132 — o usuário desativado no chat em tempo real (C271) e o papel na Lista de Tarefas (C272) — design

> Origem: "Próxima tarefa detalhada — Etapa 132" do plano da 131. Núcleo (não é do almoxarifado), reversível, sem P.O.
> Worktree `CRM-wt-e132`, branch `etapa-e132`, a partir da main `e4c05102`.

## Fase 0 — o que foi medido (2026-10-16)

### O socket do chat (C271)

`server/services/chat/socket.js`:

- `criarAuthSocket(jwtSecret)` (linha 22) só faz `jwt.verify`; põe o payload do token em `socket.user`. Não abre o banco.
- `io.on('connection')` põe o socket na sala `user:<id>` (recebe `conversa_atualizada { conversa_id }` — só o id).
- `join_conversa` (53) e `typing` (68) conferem `chatService.isParticipant` (`chat_participantes`), que não olha `usuarios.ativo`.
- `emitNewMessage` manda `nova_mensagem` (a mensagem inteira, com o conteúdo e a URL assinada do anexo) para a sala `conversa:<id>`.
- `initChatSocket` devolve `{ io, emitNewMessage, emitMessageRead }`; o `index.js` guarda em `let chatSocket` (≈ 22557), criado depois
  de o banco abrir (`initChatModule` → `initChatSchema` → `initChatSocket`). As rotas de usuário (≈ 3820, 3945, 3992) são registradas
  antes, mas leem `chatSocket` só na hora do pedido (sem TDZ: a declaração já rodou quando o servidor atende).

**Sonda no servidor real** (`scratchpad/e132/sonda-chat.js`, `index.js` com pasta de dados vazia, socket.io-client 4.8.3 do client),
antes de qualquer código:

| Usuário (socket aberto e na conversa) | Gesto do administrador | O socket aberto | Conexão nova com o token velho |
|---|---|---|---|
| `pat` | `PATCH /api/usuarios/:id/status { ativo: 0 }` → 200 | **continua conectado e recebe `SEGREDO-pat`** e `conversa_atualizada` | **aceita**, entra na conversa, recebe `SEGREDO2-pat` |
| `put` | `PUT /api/usuarios/:id` com `ativo: 0` (a caixa "Usuário ativo" do formulário) → 200 | **continua e recebe** | **aceita e recebe** |
| `del` | `DELETE /api/usuarios/:id` → 200 | **continua e recebe `SEGREDO-del`** (a sala não sai com a linha) | aceita (não recebe: a linha de participante foi apagada) |
| o desativado `pat` digitando | — | o `typing` dele **chega ao administrador** | — |
| `ok` (ativo) | — | continua, recebe | — |

**Três portas** desativam ou apagam: o `PATCH …/status` (o botão da lista), o `PUT /api/usuarios/:id` (a caixa "Usuário ativo" do
formulário — `UsuarioForm.js:617`, que sempre manda `ativo`) e o `DELETE`. A limpeza de boot (`index.js` ≈ 2204, apaga "administrator")
roda antes de qualquer socket. Nenhum outro canal em tempo real: `grep "text/event-stream\|new WebSocket\|io.on("` → só o chat; a tabela
`push_subscriptions` existe mas nada envia push (`grep sendNotification\|vapid` → 0).

**O client** (`client/src/services/chatSocket.js`, `ChatPage.js:329`): um socket só por aba, `reconnection: true`; não ouve
`connect_error` nem `disconnect`. Comportamento do socket.io-client 4.8: recusa no middleware do servidor (`next(err)`) **não**
reconecta sozinha (`socket.active = false`); desconexão pelo servidor (`io server disconnect`) também não. O próximo `joinConversa`/
`emitTyping` chama `getChatSocket()` → `connectChatSocket()` → `socket.connect()` de novo. Ou seja: **recusar no handshake um usuário
ATIVO o deixa sem tempo real até o próximo clique no chat** — por isso o banco ocupado no handshake não pode recusar. E o
`conversa_atualizada` faz a tela chamar `GET /chat/conversas`, que para o inativo já é 401 `USUARIO_INATIVO` (131) e desloga.

Achado lateral (anterior, **não** desta etapa): o client não reemite `join_conversa` no `connect` — depois de uma queda de rede a
conversa aberta para de receber em tempo real até o usuário trocar de conversa. → C nova, só registrada.

**As URLs assinadas e as telas por fora** (pedido do plano 131, medir e registrar): o middleware das URLs assinadas
(`services/almoxarifado/urlUpload.js` `middleware`) é **sem banco e sem sessão, de propósito** ("roda em toda imagem de toda lista");
a URL já emitida vale até o `exp`: almoxarifado 15–20 min, chat 8–9 h (`routes/chat.js` `ASSINATURA_CHAT`), fotos da proposta 12–13 h,
avatares 24–25 h (`services/uploadsAssinadosCrm.js`). O desativado **não** consegue URL nova (quem assina é a rota autenticada, que já
dá 401 desde a 131, e o `nova_mensagem` do socket, que esta etapa fecha); só reabre o arquivo que já tinha recebido, dentro do prazo.
→ D (132), sem código. Telas com `fetch`/axios cru: 6 arquivos com `fetch(` e 2 com axios direto
(`ClienteForm`, `ConfigTemplateProposta`, `EditorTemplateProposta`, `FornecedoresDoGrupo`, `ModalFamiliaForm`, `ModalGrupoComprasForm`,
`ModalGrupoForm`, `PropostaForm`) — o servidor recusa igual (401), só não desloga na hora; o próximo pedido pelo `api` desloga. → D.

**O teste existente:** `server/tests/api/chatSocketTokenNaUrl.api.test.js` monta `criarAuthSocket(SEGREDO)` com usuário `7` fora de
qualquer banco e a fiação por regex `io.use(criarAuthSocket(jwtSecret));`. Se a assinatura ganhar o `db`, os dois mudam à vista.

**Boot:** `index.js` com pasta vazia responde o login em ≈ 1,6 s e loga `Módulo Chat interno inicializado` (medido,
`scratchpad/e132/tempo-boot.sh`) — dá para um teste da suíte subir o servidor real (o runner dá 120 s por arquivo).

### A Lista de Tarefas (C272)

`server/services/todolist/todolistService.js:44` `listUsuariosAtivos` → `SELECT id, nome, email, role FROM usuarios WHERE ativo = 1
ORDER BY nome COLLATE NOCASE`, servido por `GET /api/todolist/usuarios` e dentro de `GET /api/todolist/board` (`usuarios`), para quem
tem o módulo `todolist`. Quem lê: `TodolistBoard.js:85` (`data.usuarios` do board) e `:416` (`u.id`, `u.nome` no seletor de
responsável). `/todolist/usuarios`: **nenhum** chamador no client. `role`: **0** leitores (`grep "\.role" components/todolist` → 0).
Testes de servidor das duas rotas: só os de portão de módulo (não olham a forma).

## Desenho

### C271 — o socket confere a linha ativa, e as três portas derrubam

1. **Handshake** — `criarAuthSocket(jwtSecret, db)` (o `db` passa a ser **obrigatório**: sem ele lança no boot; um esquecimento de
   fiação não pode virar "token só" em silêncio). Depois do `jwt.verify`: token sem id válido (a régua `idDoTokenValido` da 131) →
   recusa; `SELECT 1 FROM usuarios WHERE id = ? AND ativo = 1` (a mesma régua do `enrichUserFromDb`) sem linha → recusa com
   `Error(LITERAL_SESSAO_ENCERRADA)` e `err.data = { code: 'USUARIO_INATIVO' }` (o socket.io manda `message` e `data` ao client).
   **Erro do banco (BUSY ou outro) → aceita, como hoje**, com `console.warn`: recusar deixaria um usuário ativo sem tempo real até o
   próximo clique (medido acima), e o conteúdo fica atrás do passo 2.
2. **Entrada na conversa e "digitando"** — uma leitura só: a linha do usuário (`ativo`) e se ele participa. Sem linha ativa → manda
   `sessao_encerrada { error: L11, code: 'USUARIO_INATIVO' }` ao socket e desconecta (`disconnect(true)`), sem entrar; ativo e não
   participante → não entra (como hoje); erro do banco → não entra e o socket fica (como hoje).
3. **Derrubar na hora** — `initChatSocket` passa a devolver `encerrarSocketsDoUsuario(id)` (manda `sessao_encerrada` à sala
   `user:<id>` e `disconnectSockets(true)`) e `encerrarSocketsSeInativo(id)` (relê com a régua do passo 1; sem linha ativa →
   derruba com o evento; **erro na releitura → derruba sem o evento** — Fase 2 I1: com o evento o client deslogaria um ativo com a frase de
   desativado; sem ele, o client fica parado e reconecta no próximo gesto, e o handshake relê). No `index.js`: `PATCH …/status` com `ativo = 0` e `DELETE` derrubam sem reler (o resultado é conhecido);
   o `PUT` relê (o `ativo` vem cru do corpo: `NULL`, `'true'`, `0` — só a releitura diz o que ficou). Só depois do `UPDATE`/`COMMIT`
   que deu certo; recusa (403/404/400) não derruba ninguém.
4. **O client** — `chatSocket.js` ouve `sessao_encerrada` e `connect_error` com `data.code === 'USUARIO_INATIVO'`: limpa
   `token`/`user` (e o `token` da sessão) e manda para `/login?sessao_encerrada=1` — o mesmo destino do 401 da 131. Outro
   `connect_error` (token vencido, rede) → nada muda (como hoje).

**Descartado:** (a) recusar no handshake com o banco ocupado — derruba o ativo (medido); (b) reler a linha a cada `nova_mensagem`
(custo por mensagem × participantes; derrubar na hora + a releitura no `join` cobrem); (c) tirar o desativado de `chat_participantes`
ao desativar — perde o histórico da conversa na reativação, e o desativar é "reversível, mantém o histórico" (comentário da rota);
(d) `criarAuthSocket` com `db` opcional (fail-open silencioso numa fiação errada).

### C272 — a Lista de Tarefas sem o papel

`listUsuariosAtivos` passa a `SELECT id, nome, email` (as duas rotas leem dele). **Descartado:** a projeção da 131 por quem pede
(`projetarListaDeUsuarios`) — quem gerencia usuários continuaria recebendo `role` numa tela que não o lê; e tirar `email` (fora do
pedido; a projeção da 131 mantém `email`).
