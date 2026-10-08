# Etapa 83 — os outros uploads de imagem pelo tipo real

> Origem: próxima tarefa do plano da 82. Baseline (`02dc6755`): `test:api` 304/304; client 93
> suítes / 1376 testes; build limpo.

## Fase 0 — o que existe (medido na revisão da 82; a T1 re-mede antes de mexer)
- `server/index.js:~818-1137` e `:~5196-5210`: multers de imagem de **produtos, materiais de
  escritório, famílias, esquemático, grupos (multipart), logos (empresa), logo do cliente, header,
  footer, capa** com filtro por regex solto (`/jpeg|jpg|png|.../` — basta *conter*) e extensão do
  `originalname` (`path.extname`). Um `x.pnghtml` ou `foto.html` com MIME `image/png` grava com a
  extensão escolhida pelo usuário. Hoje o estrago é contido pela 81 (`nosniff` + CSP `sandbox` nas
  pastas públicas), mas a extensão errada também quebra o `Content-Type` da imagem boa.
- `services/imagemUpload.js` (Etapa 82) já resolve: filtro pelas chaves do mapa do `extensaoSegura`
  e extensão por `extensaoSegura(file.mimetype)`; usado nos multers de grupos-compras, fornecedores,
  avatar e foto da proposta.
- Multer morto `uploadChat` em `index.js:~715-731` (aceita qualquer tipo; o chat usa o de
  `routes/chat.js`).
- Logo da empresa aceita SVG (`index.js:~989`), servido com a CSP própria do logo (81).

## Decisões (B38)
- Todos os multers de imagem passam pelo `imagemUpload.js`. **SVG continua aceito só no logo da
  empresa** (`/api/proposta-template/logo`) — o template legado o usa e já há CSP própria; nos
  demais (inclusive logo do cliente, que já excluía SVG) é recusado. Descartado: recusar SVG no logo
  da empresa (quebraria um logo vetorial já enviado — não dá para medir produção daqui).
- `uploadChat` morto é removido.

## Regras
- **RN-83.01** Cada multer de imagem listado (`uploadProduto` `:818`, `uploadMaterialEscritorioFoto`
  `:851`, `uploadFamilia` `:883`, `uploadGrupo` `:913`, `uploadLogo` `:969`, `uploadClienteLogo`
  `:1022`, `uploadHeader` `:1056`, `uploadFooter` `:1089`, `uploadCover` `:1122`,
  `uploadFamiliaEsquematico` `:5196`) aceita só os MIME do mapa do `extensaoSegura`
  (jpeg/jpg/png/gif/webp) e grava com a extensão derivada do MIME.
  **Exceção do logo da empresa** (`uploadLogo`): também `image/svg+xml` → `.svg`, **local** no filtro
  e no storage dele — **não** pôr SVG no `EXTENSAO_POR_MIME` (o mapa é compartilhado com almoxarifado,
  chat e os multers da 82; abriria SVG em todos).
  **Recusa → 400 `{ error: 'Formato de imagem não suportado' }`.** ⚠️ A primeira versão deste plano
  mandava "manter a mensagem que a rota já usa" — **estava errado**: o erro do `fileFilter` cai no
  handler global (`index.js:~23207`), que devolve **500 `Erro interno do servidor`** em produção; o
  usuário nunca viu mensagem de formato. Agora: o filtro lança um erro marcado (ex.: `codigo:
  'FORMATO_IMAGEM'` criado em `services/imagemUpload.js`) e um middleware de erro registrado **antes**
  do global o converte em 400. Efeito colateral aceito (B38): `ModalFamiliaForm.js:48` e
  `ModalGrupoForm.js:37` reenviam por base64 quando recebem 400 — o base64 (82) recusa com a mesma
  mensagem; duas requisições, mesma mensagem ao usuário.
- **RN-83.02** Régua por fonte no `index.js` inteiro (o esquemático está em `:5196`, longe do bloco
  `:715-1178`), no padrão `blocoStorage`/`blocoMulter` de `imagemUploadFiltros.api.test.js:204-213`:
  listas **explícitas** de storages de imagem e de documento (`storage`, `storagePropostaPdf`,
  `storageComprovantes`, `storageContrato`); **todo** `multer.diskStorage(` tem de estar numa das
  duas (multer novo não escapa); nos de imagem, nenhum `const ext = path.extname(file.originalname)`
  (não proibir qualquer `path.extname(file.originalname)` — o miolo do nome usa, ex. `:1149`).
  Não distinguir por pasta (logos e famílias são compartilhadas por dois multers cada).
- **RN-83.03** O nome gravado mantém o prefixo atual de cada pasta (ex.: `produto_<id>_<ms>`) — só a
  extensão muda de origem. O miolo vem de `path.basename(originalname, path.extname(originalname))`
  (padrão da 82, `:1149`) — **não** `basename(originalname, extDoMime)`, que gera `foto_jpeg.jpg`.
  Efeitos medidos: a otimização de produto escolhe o formato do sharp pela extensão
  (`otimizarImagem.js:44,72-88`) — fica **mais** certa (PNG chamado `.jpg` deixava de perder
  transparência); clones copiam a extensão do nome gravado (`:5048`, `:15568`) — sem efeito.

## Tasks
> **Estado (2026-10-08): T1 feita — `099da718`.** Re-medição: 18 `multer.diskStorage(` no `index.js`
> (14 de imagem, 4 de documento: `storage`, `storagePropostaPdf`, `storageComprovantes`,
> `storageContrato`); os 10 da lista conferiam. Os 10 passam por `filtroImagemMulter` + extensão
> por `extensaoSegura(file.mimetype)`; `uploadLogo` com `mimesExtras: [MIME_SVG_LOGO_EMPRESA]` e
> `.svg` local no storage (mapa compartilhado sem SVG). Recusa: erro `codigo: 'FORMATO_IMAGEM'` +
> `tratarErroFormatoImagem` (exportado de `services/imagemUpload.js`) registrado em `/api` antes do
> handler global → 400 literal. `uploadChat`/`storageChat` removidos (e o import do `uploadsChatDir`,
> que só eles usavam; a pasta continua criada por `config/paths.js`).
> **Achado (não estava no plano):** o `fileFilter` do esquemático chamava `cb(null)` sem o `true` ao
> aceitar — o multer descartava o arquivo, o multipart do esquemático **sempre** dava 400 "Nenhuma
> imagem enviada" e o `ModalFamiliaForm` caía no fallback base64. Agora o multipart funciona.
> **Client medido:** família/grupo/cliente pré-filtram jpeg/jpg/png/gif/webp; produto, material de
> escritório e logo da empresa usam `accept="image/*"` (SVG/BMP já eram recusados nos dois
> primeiros; nada que era aceito passa a ser recusado além do listado nos Pontos de atenção).
> **Testes:** `imagemUploadFiltros.api.test.js` 25/25 (10 novos: filtro marcado, SVG local, middleware
> real 400 + controle 500 de outro erro, `foto.html`→`.png` e `foto.jfif`→`_foto.jpg`, os 10
> multers por fonte, SVG só no logo, régua RN-83.02 com completude, todo multer de imagem com o
> filtro, registro antes do global, `uploadChat` sumiu). Sabotagens, todas vermelhas e restauradas
> por Edit: regex solto no produto (2 vermelhos), extensão do nome no cover (2), SVG no
> `EXTENSAO_POR_MIME` (11), middleware desligado (500 ≠ 400) e registro removido (2),
> `diskStorage` novo sem lista (1), miolo por `basename(originalname, ext)` no header (1).
> **Prova real** (porta 5992, `CRM_DATA_DIR` vazio, 0 `no such table|no column named`): produto
> `foto.html` `image/png` → `produto_1_<ms>_foto.png`; produto `x.svg` → 400 literal, nada gravado;
> JPEG 2400px como `equipamento.jfif` → `.jpg` + `.jpg.original` ao lado; logo da empresa SVG →
> `logo_<ms>_marca.svg`; JPEG aceito em logo da empresa, material de escritório, família,
> esquemático (multipart), grupo, logo do cliente e cabeçalho; SVG no logo do cliente → 400;
> rodapé com `application/octet-stream` → 400; capa `capa.html` `image/png` → `.png`.
> Suítes: `test:api` 304/304; `test:almoxarifado` 44/0; validation 4/0, safealter 3/0, sqlite 5/0;
> client 93 suítes / 1376 testes (inalterado); build limpo.

**T1 (única, tronco):** re-medir a lista (grep de `multer(` e `diskStorage` no `index.js`), aplicar
RN-83.01–03, remover `uploadChat`, ampliar `server/tests/api/imagemUploadFiltros.api.test.js` (filtro
de cada multer por nome/config exportada ou por fonte — afirmar o mecanismo), régua RN-83.02. Rotas
de produto/família/grupo: medir o que o client manda (`accept=`) para não recusar o que é enviado
hoje. Controles positivos por sabotagem. **Prova real:** servidor em `CRM_DATA_DIR` vazio; enviar
`foto.html` com MIME `image/png` como foto de produto → gravado `.png`; `x.svg` como foto de produto
→ recusado; SVG como logo da empresa → aceito `.svg`; JPEG normal em cada rota → aceito.

## Pontos de atenção
- Passam a ser recusados: `image/pjpeg`/`x-png` (navegadores antigos), `image/apng`, os
  `image/x-citrix-*` (o regex solto achava "png"/"jpeg" dentro). Passa a ser aceito: `foto.jfif` com
  `image/jpeg` (padrão do "salvar imagem como" do Windows) → `.jpg`.
- Header, footer e capa não têm tela no client (só `server/upload_header.js`/`upload_footer.js`; o do
  footer manda `application/octet-stream` e **já** era recusado).
- O teste `imagemUploadFiltros.api.test.js:98` instala o próprio handler 400 — o teste novo tem de
  passar pelo middleware de erro **real** (exportado) para provar o 400 em vez do 500.
- Otimização de imagem de produto (`.original` ao lado, `index.js:~18048`) depende da extensão —
  conferir que o fluxo continua (o `.original` é nome + sufixo).

## Fechamento (2026-10-08) — 🟢
- Revisão adversarial: nenhum defeito de comportamento. Corrigido (`8c4fb6e7`): storage que declarava a
  extensão segura mas gravava com a do nome passava na régua; middleware registrado antes das rotas
  (recusa voltaria a 500) passava; a recusa não ia mais para o log. Registrado: os 4 multers da 82
  também passaram de 500 a 400 (mesmo filtro); `LIMIT_FILE_SIZE` continua 500 (fora do escopo); os
  routers montados depois do middleware (almoxarifado, chat…) não usam `filtroImagemMulter`.

## Retro
- Rodadas de correção até verde: **1**.
- Achados: revisão do plano 5 (2 bloqueantes: a mensagem "que a rota já usa" nunca chegava ao usuário
  — **o plano estava errado**; a exceção do SVG não cabia no mapa compartilhado); revisão do código 2
  mutações sobreviventes + 1 comentário falso; bônus: o esquemático multipart nunca funcionou
  (`cb(null)` sem `true`).
- Paralelismo: nenhum (task única).
- Defeito escapado: preencher na etapa seguinte.

## Próxima tarefa detalhada — Etapa 84: o login ainda aceita o token na URL (`?token=`)
- **O que existe:** `authenticateToken` (`server/index.js:~3001-3003`) aceita `req.query.token` além do
  header `Authorization`. Token em URL vaza em log de proxy/servidor, histórico do navegador e
  cabeçalho `Referer`. A Etapa 21 já tratou isso no backup (`?token=` com aviso de depreciação,
  `services/backupAuth.js`); o almoxarifado recusou de propósito (`urlUpload.js:8-20`).
- **Medir antes:** quem manda `?token=` hoje — `grep -rn "token=" client/src` (downloads por `<a href>`,
  `window.open`, `EventSource`, socket.io `auth`/`query`), scripts em `server/*.js` e integrações. O
  socket do chat pode passar o token pela query do handshake (`services/chat/socket.js`) — esse é
  outro caminho, não o `authenticateToken`.
- **Desenho provável:** se ninguém usa, remover o `req.query.token` do `authenticateToken` (com teste que
  prova 401 com `?token=` válido); se alguém usa, migrar esse chamador para blob/header primeiro.
