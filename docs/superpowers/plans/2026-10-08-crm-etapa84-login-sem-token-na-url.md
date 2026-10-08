# Etapa 84 — o login deixa de aceitar o token na URL (`?token=`)

> Origem: próxima tarefa do plano da 83 (e o "fora do escopo" da B34). Baseline (`d6ae7876`):
> `test:api` 304/304; client 93 suítes / 1376 testes; build limpo.

## Fase 0 — medição (2026-10-08)
- `authenticateToken` (`server/index.js:2931-2950`) aceita o JWT por `Authorization: Bearer`,
  `X-Auth-Token` **e** `req.query.token` (`:2937-2939`). O `authComOrigem` do almoxarifado
  (`routes/almoxarifado.js:198`) só embrulha esse mesmo middleware.
- **Ninguém manda `?token=`:** no client só aparece em comentários que explicam por que não usar
  (`baixarDocumentoPedido.js:8-10`, `baixarArquivoProtegido.js:9`, `Compras.js:470`,
  `RelatoriosAlmoxarifado.js:34`); o socket do chat manda o token no `auth` do handshake
  (`services/chatSocket.js:41`, outro caminho); os scripts `server/upload_*.js` usam `Authorization:
  Bearer`; nenhum teste usa `query.token`. O backup tem validador próprio (`services/backupAuth.js`,
  Etapa 21) e **não** passa por aqui — não muda.
- O JWT vence em 24 h (`index.js:~3471`): uma integração externa por `?token=` teria de logar todo
  dia — improvável; um link colado por alguém é o caso real (e é justamente o vazamento).

## Decisão (B39)
Remover o `?token=` do `authenticateToken`. Pedido que chega **só** com `?token=` recebe **401
`{ error: 'Envie o token no cabeçalho Authorization', code: 'TOKEN_NA_URL' }`** e uma linha de aviso
no log (sem o token) — diagnóstico fácil se algo externo depender disso. Descartado: fase de
depreciação aceitando com aviso (como o backup) — lá havia cron provável; aqui não há consumidor e
cada dia aceitando é um dia vazando.

## Regras
- **RN-84.01** `authenticateToken` lê só `Authorization: Bearer` e `X-Auth-Token`.
- **RN-84.02** Sem header e com `req.query.token` → 401 com o corpo literal acima; `console.warn`
  com método e caminho (**sem** query string, que contém o token).
- **RN-84.03** Header válido + `?token=` qualquer → passa (o header manda; a query é ignorada).
- **RN-84.04** `/api/backup?token=` continua funcionando (validador próprio).
- **RN-84.05** (T2) O socket do chat lê o token só de `handshake.auth.token` e do header
  `Authorization: Bearer`; só na query do handshake → recusa `Token não fornecido`.

## Tasks

> **Estado (2026-10-08):** T1 ✅ `45bdbc14`. `services/tokenDaRequisicao.js` (função pura
> `{ token, motivo }` + `ERRO_TOKEN_NA_URL`) usada no `authenticateToken`; o aviso loga
> `req.method` + `req.baseUrl` + `req.path` (nunca `originalUrl`). Teste
> `tests/api/tokenNaUrl.api.test.js` 13/13. Controles positivos: fallback de query de volta no
> middleware e na função → 2 vermelhos; aviso com `req.originalUrl` → 1 vermelho; restaurado por
> Edit (LF, CR=0). **Prova real** (`CRM_DATA_DIR` vazio, porta 5990): só `?token=` → 401
> `TOKEN_NA_URL` (também em `/api/almoxarifado/minhas-permissoes`, via `authComOrigem`); Bearer →
> 200; Bearer + `?token=lixo` → 200; `X-Auth-Token` → 200; nada → 401 `NO_TOKEN`;
> `/api/backup?token=<BACKUP_TOKEN>` → 200 `application/zip` (aviso `QUERY_DEPRECIADA`, como
> antes); log `[auth] token na URL recusado: GET /api/auth/me`, 0 ocorrências do token. Suítes:
> `test:api` 305/305 arquivos; `test:almoxarifado` 44/44; validation 4, safealter 3, sqlite 5;
> client 93 suítes / 1376 testes.
>
> **O que a medição achou além da Fase 0:** (1) o socket do chat **no servidor**
> (`server/services/chat/socket.js:15-18`) ainda aceita `socket.handshake.query.token` como
> último fallback — mesma classe de vazamento (o transporte polling põe a query na URL). O client
> (`client/src/services/chatSocket.js:41`, o arquivo que a Fase 0 citava) manda no `auth`, então
> remover é seguro; virou a T2 (abaixo, ✅ `25bb5b80`). (2) Três comentários
> afirmavam "o servidor até aceita `?token=`" (`RelatoriosAlmoxarifado.js:34`,
> `baixarDocumentoPedido.js:10`, `urlUpload.js:10`) — corrigidos no mesmo commit para não enganar.
>
> **T2 ✅ `25bb5b80`** (socket do chat, RN-84.05): `services/chat/socket.js` deixa de ler
> `socket.handshake.query.token`; `tokenDoHandshake` (exportada) lê só `auth.token` e
> `Authorization: Bearer`. Prova real com `socket.io-client` em polling: token no `auth` conecta;
> só na query e sem token → recusado `Token não fornecido`.
>
> **Fix da revisão adversarial ✅ `6f16510d`.** A régua da T1 era **por fonte** (regex no corpo do `authenticateToken` em `index.js`) e
> deixava passar três mutações que reabrem ou desfiguram o contrato: (a)
> `const { query: q } = req; if (!token && q.token) jwt.verify(q.token, ...)` — o login por
> `?token=` de volta; (b) o `if (!token)` NO_TOKEN acima do ramo TOKEN_NA_URL — só-query vira
> NO_TOKEN e o aviso some; (c) `res.status(200).json(ERRO_TOKEN_NA_URL)`. No socket, a régua
> `handshake\??\.query` não pegava `socket.handshake['query']` nem `socket.request._query`.
> Correção: o middleware virou fábrica `services/authenticateToken.js`
> (`criarAuthenticateToken({ jwtSecret, enrich })`; o `index.js` faz
> `const authenticateToken = criarAuthenticateToken({ jwtSecret: JWT_SECRET, enrich: (req, res, next) => enrichUserFromDb(db)(req, res, next) })`
> — o `enrich` lê o `db` na hora do pedido, porque `db` é atribuído no callback do sqlite; nenhuma
> referência a `authenticateToken` antecede a definição, então perder o hoisting da declaração de
> função não muda nada; o `authComOrigem` do almoxarifado reatribui o **parâmetro** do módulo de
> rotas e segue igual). O socket exporta `criarAuthSocket(jwtSecret)`, usado no `io.use`. Testes
> agora **comportamentais**: `tokenNaUrl.api.test.js` 16/16 (mini-app express + supertest com JWT
> real: Bearer → 200 e `enrich` chamado; `X-Auth-Token` → 200; só `?token=<válido>` → 401 corpo
> literal, `enrich` não chamado, 1 aviso sem o token; Bearer + `?token=lixo` → 200; nada → 401
> `NO_TOKEN`; inválido → 401 `Token inválido ou expirado`; + checagem curta de fonte de que o
> `index.js` usa a fábrica); `chatSocketTokenNaUrl.api.test.js` 11/11 (sockets falsos: `auth`
> válido → `next()` e `socket.user`; só em `handshake.query`/`request._query` → `Token não
> fornecido`; inválido → `Token inválido`). **Controles positivos:** (a), (b), (c) → vermelho cada
> um; `handshake['query']` em `tokenDoHandshake` → 2 vermelhos; `request._query` no middleware →
> 1 vermelho; restaurado por Edit (md5 igual ao de antes, CR=0). **Prova real** (`CRM_DATA_DIR`
> vazio, porta 5988): Bearer → 200; só `?token=` → 401 `TOKEN_NA_URL`; `X-Auth-Token` → 200; nada
> → 401 `NO_TOKEN`; inválido → 401; `/api/almoxarifado/minhas-permissoes` com Bearer → 200 (via
> `authComOrigem`) e só com query → 401 `TOKEN_NA_URL`; socket: token no `auth` conecta, só na
> query e sem token recusados; log com os 2 avisos e 0 ocorrências do token. Suítes: `test:api`
> 306/306 arquivos; `test:almoxarifado` 44/44; validation 4, safealter 3, sqlite 5;
> `tests/chat.test.js` 4/4.

**T1:** extrair a leitura do token para uma função pura testável (ex.:
`services/tokenDaRequisicao.js` → `{ token, motivo }`), usar no `authenticateToken`; teste
`server/tests/api/tokenNaUrl.api.test.js` (função pura + fiação por fonte: o `authenticateToken` usa a
função e não lê `req.query.token`). Controle positivo. **Prova real:** servidor em `CRM_DATA_DIR`
vazio; `GET /api/auth/me?token=<válido>` sem header → 401 `TOKEN_NA_URL`; com header → 200; log tem o
aviso **sem** o token; `/api/backup?token=` com `BACKUP_TOKEN` definido continua respondendo como antes.

## Pontos de atenção
- Fase 2 (revisão do plano) feita junto com a revisão do código: mudança de 3 linhas, consumidores
  medidos acima. Registrado aqui para não parecer esquecimento.
