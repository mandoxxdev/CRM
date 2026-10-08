# Etapa 82 — URL assinada para chat, fotos da proposta e avatares (+ filtros de upload)

> Origem: próxima tarefa do plano da 81. Baseline (`f53a89bf`): `test:api` 300/300; client 88
> suítes / 1353 testes; build limpo.

## Fase 0 — medição (2026-10-08)
- **Assinador** (`server/services/almoxarifado/urlUpload.js`): `MINUTOS_VALIDADE = 15` (`:23`),
  `PREFIXO` fixo (`:24`), chave derivada com domínio fixo `almoxarifado-uploads-v1` (`:47`), HMAC só
  de `nome:exp` (`:123-127`), validade = balde de 5 min + 15 min, teto de 20 min no `verificar`
  (`:150`). **Não serve para outra pasta**: o prefixo é fixo e, mesmo com instâncias separadas, a
  chave é a mesma — uma assinatura de `chat/x.png` valeria em `avatares/x.png`. Montagem:
  `routes/almoxarifado.js:254-276` (middleware → static com `cabecalhosUploadSeguro` → 404 final,
  necessário porque o static chama `next()` quando o arquivo não existe). Testes:
  `urlUploadAssinada.api.test.js`, `materialPhotoAssinada.api.test.js`; a régua
  `uploadsProtegidos.api.test.js:269-323` exige `setHeaders: cabecalhosUpload(Seguro|Logo)` em toda
  montagem e lista as 14.
- **Chat**: `chat_mensagens.anexo_url` guarda o caminho inteiro `/api/uploads/chat/<f>`
  (`routes/chat.js:172`). Toda URL sai por `mapMessage` (`services/chat/chatService.js:4-21`): REST
  de mensagens (com paginação `before=`), resposta do POST da imagem e o evento de socket
  `nova_mensagem`. Client: `services/chatSocket.js:75-80` (`resolveMediaUrl`, preserva query),
  `ChatPage.js:615` (lightbox), `:619-622` (miniatura `loading="lazy"`). Mensagens ficam no estado
  sem refetch até trocar de conversa — **imagem lazy abaixo da dobra só é pedida quando rola**: com
  15–20 min, uma conversa aberta há uma hora mostra imagem quebrada. Filtro aceita MIME **ou**
  extensão, extensão do nome original (`routes/chat.js:26,35-37`).
- **Fotos da proposta**: tabela `proposta_fotos`, coluna `arquivo` (só o nome). As rotas `/fotos`
  (`index.js:6673-6764`) devolvem nomes. A URL nasce no template V2 com `forPdfServer=false`
  (`propostaPremiumV2.js:103-118`, com `?t=<ts>` anti-cache) e **no client**
  (`proposta/PropostaPreviewEditavel.js:617,676,1194`, montando `${base}/uploads/proposta-fotos/<arquivo>`).
  PDF usa base64 do disco — não muda. O `html_rendered` salvo pelo editor legado contém URLs, mas
  **nada o lê de volta** (PDF sempre regenera, `index.js:10329-10335`); o "Imprimir" do editor legado
  imprime o HTML do iframe atual.
- **Avatares**: `usuarios.foto_url` = nome do arquivo; sai em `buildAuthUserPayload` (`index.js:3442`,
  login e `/auth/me`), `GET /api/conta`, `POST /api/conta/foto` (`url` crua). Client monta a URL
  (`Layout.js:548-552`, `MinhaConta.js:11,155`); o usuário fica no `localStorage` e é renovado por
  `/auth/me` a cada carga do app; JWT de 24 h.
- **Filtros**: base64 `data:image/(\w+)` vira extensão (`index.js:3906-3921` grupos, `:5167-5172`
  família, `:5251-5256` esquemático, `routes/compras.js:728-742`, `:860-874`); extensão do nome
  original com filtro só por MIME (`index.js:935-946` grupos-compras, `:954-965` fornecedores);
  chat MIME-ou-extensão. Todos os clientes mandam só jpeg/png/gif/webp.

## Decisões (B37)
- Assinador parametrizado; **a pasta entra na chave** (domínio por pasta). Almoxarifado mantém os
  valores atuais (URLs e testes iguais).
- Validade por pasta, pelo tempo de vida da tela que mostra a imagem: **chat 8 h** (balde 1 h);
  **fotos da proposta 12 h** (balde 1 h — sessão longa de edição e o "Imprimir"); **avatares 24 h**
  (balde 1 h — vida do JWT). Descartado: 15 min para todas (quebra chat e edição longa); rota
  autenticada por blob (exigiria trocar todo `<img>` por fetch + objectURL).
- Banco **não muda**: continua guardando o nome/caminho; a assinatura é feita na saída.

## Regras
- **RN-82.01** `criarAssinadorUpload(segredoRaiz, { prefixo, dominio, minutos, baldeMinutos })`;
  sem opções = comportamento atual do almoxarifado byte a byte (mesmo prefixo, domínio, 15 + balde 5,
  teto 20). O teto do `verificar` acompanha `minutos + baldeMinutos`. Assinatura de uma pasta **não**
  vale em outra (domínio diferente → chave diferente). **Com `prefixo` informado, `dominio` é
  obrigatório** (lança erro) — sem isso, esquecer o domínio usaria a chave do almoxarifado em
  silêncio (revisão do plano). `derivarSegredoUpload(segredo, dominio = 'almoxarifado-uploads-v1')`
  mantém a assinatura de 1 argumento (`urlUploadAssinada.api.test.js:100-111` a usa).
  ⚠️ O `require(...urlUpload)` com `cabecalhosUploadSeguro` tem de continuar **numa linha só** em
  `index.js:~280` e `routes/chat.js:~11` (régua da 81, `uploadsProtegidos.api.test.js:333-336`).
- **RN-82.02** `/api/uploads/chat`, `/api/uploads/proposta-fotos` e `/api/uploads/avatares` só servem
  com assinatura válida; sem/errada/expirada → **404** (como o almoxarifado). As montagens mantêm
  `setHeaders: cabecalhosUploadSeguro` e ganham o 404 final.
- **RN-82.03 (chat)** `mapMessage` devolve `anexo_url` **assinada** (a partir do `basename` do valor
  gravado) em REST, POST e socket — assinador de módulo configurado no `registerChatRoutes`
  (`resolveJwtSecret(PERSISTENT_DATA_DIR)`, como `routes/almoxarifado.js:262`); assina **só** quando
  há `anexo_url` e o assinador está configurado (`tests/chat.test.js:47-73` chama o serviço sem ele).
  **Recuperação de URL vencida sem recarregar a conversa** (recarregar descarta as páginas antigas,
  rola para o fim e marca como lida — revisão do plano): rota nova
  **`GET /api/chat/mensagens/:id/anexo`** (auth; só participante da conversa — senão **404 `{ error:
  'Mensagem não encontrada' }`**; mensagem sem anexo → mesmo 404) devolve `{ anexo_url }` assinada; a
  miniatura **e** o lightbox têm `onError` que chama essa rota **uma vez por id de mensagem por
  sessão** (um `Set` de ids já tentados — arquivo apagado não vira laço) e troca só o `anexo_url`
  daquela mensagem no estado. Filtro: exige MIME de imagem (lista do `extensaoSegura`); extensão por
  `extensaoSegura(mimetype)`. Teste de rota de verdade: express + `:memory:` + `initChatSchema` +
  `registerChatRoutes(app, db, authFake, null, tmpDir)` (o chat **não** está no `testApp.js`).
- **RN-82.04 (fotos)** V2 com `forPdfServer=false` usa URL assinada (sem `?t=`) — o template é
  módulo puro sem o segredo: recebe uma função `assinarFotoProposta(nome)` injetada (parâmetro/config
  na chamada de `index.js:~9950`); sem a função, comportamento de PDF (não monta URL). `GET/POST
  /fotos`, `/duplicar`, `/restaurar` devolvem, além de `arquivo`, um `url` assinado **relativo**
  (`/api/uploads/proposta-fotos/...?exp&sig`); o client usa esse `url` (`PropostaPreviewEditavel.js:617,
  676,1194`), **nunca** monta pelo nome, e o compõe pelo padrão de `utils/resolveMaterialPhotoUrl.js:40-43`
  (tira `/api` da base absoluta e prefixa a origem — `${baseURL}${url}` daria `/api/api/...`). Toda
  entrada empurrada em `FOTOS_PROPOSTA` leva o `url` assinado (a repaginação recria os `<img>` dele).
  Limite (B37): editor aberto há mais de 12 h perde as fotos na próxima repaginação; recarregar o
  preview reassina.
- **RN-82.05 (avatares)** `foto_url` continua o nome; campo novo **`foto_src`** assinado em
  `buildAuthUserPayload`, `GET /api/conta` e `POST /api/conta/foto` — **sempre presente** (`null` sem
  foto), senão o `mergeUserPermissions` (`utils/systemPermissions.js:88-90`) mantém o valor velho do
  `localStorage`. Client usa `foto_src` (`Layout.js`, `MinhaConta.js`), composto como na RN-82.04;
  **upload** copia `foto_src` da resposta (`MinhaConta.js:96` hoje copia só `foto_url`), **remover**
  zera os dois (`:112`), e o `<img>` tem `onError` que esconde a imagem e mostra as iniciais (cobre
  `foto_src` vencido vindo do `localStorage` quando o `/auth/me` falha, `AuthContext.js:74`).
- **RN-82.06 (filtros)** base64 (`index.js:3911`, `:5172`, `:5256`; `routes/compras.js:733`, `:865`):
  extensão só por lista (`extensaoSegura('image/'+tipo)`; `.bin` → **400 `{ error: 'Formato de imagem
  não suportado' }`**) e **o caso sem prefixo `data:image/...;base64`** (hoje decodificado cru e salvo
  como `.jpg` — `data:image/svg+xml` e `x-icon` caem nele porque `\w+` não casa `+`/`-`) também →
  400 com a mesma mensagem. Multers de grupos-compras, fornecedores, **avatar** (`:1009`) e **foto da
  proposta** (`:1153`): filtro ancorado nas chaves do mapa do `extensaoSegura` e extensão por
  `extensaoSegura(file.mimetype)` (`image/pjpeg`/`x-png` passavam no regex solto e virariam `.bin`).
  Logo SVG **não** muda (decisão separada; já tem CSP). Nenhum client manda outra coisa (todos
  pré-filtram jpeg/jpg/png/gif/webp).

## Tasks
> Estado: **T1 feita (`4ef91c01`)** — `criarAssinadorUpload(segredoRaiz, { prefixo, dominio, minutos,
> baldeMinutos } = {})`; o objeto devolvido expõe `MINUTOS_VALIDADE`, `BALDE_MINUTOS` e `PREFIXO` da
> instância; o módulo exporta também `BALDE_MINUTOS` e `DOMINIO_PADRAO`. `minutos`/`baldeMinutos`
> não inteiros positivos lançam. Teste `urlUploadParametrizada.api.test.js` (6); controles: domínio
> ignorado → 2 vermelhos, teto fixo em 20 min → 2 vermelhos. `test:api` 301/301, `test:almoxarifado`
> 44/44. Próximo: T2 e T3 em paralelo.

**T1 — tronco:** RN-82.01 em `urlUpload.js` + testes (os atuais verdes sem mudança; novos: opções,
domínio isolado entre pastas, teto acompanha a validade). Controle positivo: chave sem domínio →
assinatura cruzada passa → vermelho.
**T2 — galho (worktree A): chat** — RN-82.02 (montagem do chat) + RN-82.03, servidor e client
(`routes/chat.js`, `services/chat/chatService.js`, `ChatPage.js`). Teste de rota no harness se o
chat estiver montado nele; senão teste de serviço de `mapMessage` + teste de fonte da montagem.
**T3 — galho (worktree B): fotos + avatares + filtros** — RN-82.02 (as duas montagens do
`index.js`) + RN-82.04/05/06, servidor e client.
**T4 — integração:** merge, régua `uploadsProtegidos` atualizada (as 3 pastas agora assinadas),
suítes, **prova real** (servidor em `CRM_DATA_DIR` vazio: imagem de chat, foto de proposta e avatar
sem assinatura → 404; com a URL devolvida pela API → 200 `image/*`; assinatura de chat usada no
caminho de avatar → 404; base64 `data:image/html` → 400), revisão adversarial, docs.

## Pontos de atenção
- T2 e T3 só compartilham `urlUpload.js` (T1). T2: `routes/chat.js`, `services/chat/chatService.js`,
  `ChatPage.js`. T3: `index.js`, `routes/compras.js`, `propostaPremiumV2.js`,
  `PropostaPreviewEditavel.js`, `Layout.js`, `MinhaConta.js`. A régua da 81 não precisa mudar (lista
  de caminhos; middleware e 404 final não são `.static`).
- `html_rendered` passa a guardar URLs assinadas que vencem — é dado morto (nada lê), registrar
  "proibido reusar" no comentário do PUT.
- Notificações/e-mail não carregam essas URLs (medido).

## Fechamento (2026-10-08) — 🟢
- T2 ✅ `1653296f` (merge `bd339000`): divergências — dentro do mesmo balde de 1 h a rota de
  renovação devolve a mesma URL (por desenho); 404 também para mensagem apagada e id inválido.
- T3 ✅ `65a17770` + `f15ffe8d` (merge `c66eae79`): divergências — `services/uploadsAssinadosCrm.js`
  e `services/imagemUpload.js` novos (testáveis); template sem assinador cai para base64 (não URL
  crua); menu lateral sem iniciais (a foto que falha some; iniciais só em Minha Conta,
  `AvatarUsuario.js`); mensagens de erro das rotas de família unificadas; teste do editor por
  leitura de fonte (o jsdom não roda o `srcDoc`).
- Integração: `test:api` 304/304, client 93/1373, build limpo.
- Revisão adversarial: nenhuma brecha na assinatura nem caminho sem assinatura. Corrigido
  (`5066bffc`, `0af3b4d5`): validade do chat em 15 min e chave repetida passavam em todos os testes
  → configurações reais afirmadas e domínios distintos; renovação no chat não se recuperava de uma
  segunda expiração nem de falha de rede → id sai do `Set` no `onLoad` e em erro de rede (404
  continua uma vez só). Registrado: os outros 10 multers de imagem (próxima etapa).

## Retro
- Rodadas de correção até verde: **1**.
- Achados: revisão do plano 9 reais (5 que quebrariam fluxo: recarga da conversa perdendo rolagem,
  laço com arquivo apagado, lightbox sem recuperação, `/api/api`, `foto_src` velho); revisão do
  código 2 mutações sobreviventes + 1 recuperação incompleta; 0 ruído.
- Paralelismo: **2 galhos** (chat ‖ fotos+avatares+filtros) depois do tronco; sem retrabalho.
- Lição repetida da 80: teste de configuração tem de afirmar **o valor real**, não uma cópia local.
- Defeito escapado: preencher na etapa seguinte.

## Próxima tarefa detalhada — Etapa 83: os outros 10 uploads de imagem pelo tipo real
- **Onde** (medido na revisão, `server/index.js:~818-1137` e `:~5196-5210`): multers de produtos,
  materiais de escritório, famílias, esquemático, grupos (multipart — o base64 já foi), logos, logo
  do cliente, header, footer e capa. Hoje: regex solto (`/jpeg|jpg|png|.../` só precisa *conter*) e
  extensão do `originalname`.
- **Como:** reusar `services/imagemUpload.js` (T3 da 82) — filtro ancorado nas chaves do mapa do
  `extensaoSegura` e extensão por `extensaoSegura(file.mimetype)`. **Logo SVG**: decidir em B (hoje
  aceito, com CSP própria da 81) — medir em produção `ls uploads/logos/*.svg` antes; recomendação:
  manter aceito no logo da empresa (só lá) e recusar nos outros.
- **Também:** o multer morto `uploadChat` em `index.js:~715-731` (aceita qualquer tipo, ninguém usa) —
  remover.
- **Teste:** ampliar `imagemUploadFiltros.api.test.js`; régua por fonte: nenhum `multer.diskStorage`
  de imagem com `path.extname(file.originalname)`.
