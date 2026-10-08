# Etapa 85 — arquivo grande demais com mensagem clara

> Origem: próxima tarefa do plano da 84 (e o "não cobre" da 83). Baseline (`d1f7f49b`): `test:api`
> 306/306; client 93 suítes / 1376 testes; build limpo.

## Fase 0 — medição (2026-10-08)
- Multers com `limits.fileSize` no `server/index.js` (`:861`, `:881`, `:896`, `:912`, `:960` 5 MB,
  `:1048`, `:1064`, `:1079` 15 MB, `:5103`) — o `MulterError` `LIMIT_FILE_SIZE` passa pelo
  `tratarErroFormatoImagem` (`:23101`, só trata `FORMATO_IMAGEM`) e cai no handler global (`:23104`)
  → **500 "Erro interno do servidor"**.
- Já tratam por conta própria: chat (`routes/chat.js:179`), um upload do almoxarifado
  (`routes/almoxarifado/extended.js:1831`, "Arquivo excede o limite de 10 MB").
- Client: `ProdutoForm.js:590` já trata 413 (provável limite do proxy em produção); `ModalFamiliaForm.js:48`,
  `ModalGrupoForm.js:37`, `ModalGrupoComprasForm.js:39`, `FornecedoresDoGrupo.js:28` reenviam por
  base64 **em 400** — com 413 não reenviam (bom: o base64 do mesmo arquivo também seria grande).
- Routers montados depois do handler global (`index.js:~23228+`: almoxarifado, requisições, frotas,
  produção, chat…): erro que eles passam adiante **não** chega ao handler global (posicional) — a T1
  mede para onde vai (handler próprio? padrão do Express?) e registra; não é escopo mudar.

## Decisão (B40)
`LIMIT_FILE_SIZE` vira **413 `{ error: 'Arquivo grande demais (máximo N MB)' }`**, com N tirado do
`limits.fileSize` do multer que recusou quando der (senão "Arquivo grande demais"). 413 em vez de 400
para os modais de família/grupo **não** reenviarem por base64 o mesmo arquivo grande. Descartado:
400 (dispararia o reenvio); manter 500.

## Regras
- **RN-85.01** Middleware de erro (estender `tratarErroFormatoImagem` ou um irmão em
  `services/imagemUpload.js`), na mesma posição (depois das rotas de upload do `index.js`, antes do
  global): `err.code === 'LIMIT_FILE_SIZE'` → 413 com a mensagem acima + `console.warn` com método e
  caminho; qualquer outro erro segue (`next(err)`).
- **RN-85.02** Como obter N: cada multer do `index.js` com limite passa a ser criado por uma função
  que anexa o limite ao erro (ex.: wrapper que pega o `MulterError` e põe `err.limiteBytes`) — ou,
  se o `MulterError` não carregar o limite, mensagem sem número. Não inventar número.
- **RN-85.03** Chat e o upload do almoxarifado que já tratam continuam com a mensagem deles.

## Tasks
**T1 (única):** RN-85.01–03 + teste por comportamento (express + multer real com limite pequeno +
o middleware real exportado: arquivo acima do limite → 413 com a mensagem e N certo; abaixo → passa;
outro erro → segue para o 500). Régua: o middleware registrado depois da última rota com multer de
limite e antes do global (como a 83). Controles positivos. **Prova real:** servidor em `CRM_DATA_DIR`
vazio; foto de produto de 11 MB → 413 com "máximo 10 MB"; avatar de 6 MB (limite 5) → 413 "máximo 5
MB"; imagem normal → 200. Medir e registrar para onde vai o erro de multer dos routers montados
depois (ex.: anexo do almoxarifado acima do limite).

> **Estado (2026-10-08): T1 feita — `7b572c1a`.**
> - **A medição da Fase 0 estava incompleta:** listou 9 multers com limite; o `index.js` tem **18**
>   (faltavam `upload` 40 MB, `uploadPropostaPdf` 20 MB, `uploadComprovante` 40 MB, `uploadProduto`
>   10 MB, `uploadMaterialEscritorioFoto` 10 MB, `uploadLogo` 5 MB, `uploadClienteLogo` 5 MB,
>   `uploadHeader`/`uploadFooter` 10 MB). Todos cobertos — a régua conta os 18.
> - **RN-85.02 — o `MulterError` não carrega o limite** (multer 2.2.0, `lib/multer-error.js`: só
>   `code`, `field` e `'File too large'`). Implementado o embrulho: `multerComLimiteNoErro(require('multer'))`
>   em `services/imagemUpload.js` é a fábrica do `multer` do `index.js` (estáticos preservados);
>   `single/array/fields/any/none` anexam `err.limiteBytes = limits.fileSize`. Embrulhar o `require`
>   e não cada multer: nenhum dos 18 (nem um futuro) fica de fora. Sem `limiteBytes` → "Arquivo
>   grande demais" sem número. Abaixo de 1 MB a mensagem sai em KB; fração com vírgula ("1,5 MB").
> - **RN-85.01:** `tratarArquivoGrandeDemais` → 413 `{ error: 'Arquivo grande demais (máximo N MB)' }` +
>   `console.warn('[upload] arquivo grande demais:', método, caminho, limite)`; outro erro → `next(err)`.
>   Registrado logo depois do `tratarErroFormatoImagem`. O `require` do `imagemUpload` subiu para antes
>   do `const multer` (senão TDZ no boot); o pin da Etapa 83 sobre essa linha foi afrouxado.
> - **RN-85.03:** chat e `extended.js` intocados (régua por fonte).
> - **Teste** `server/tests/api/uploadGrandeDemais.api.test.js` (11): express + multer real (limite 2 KB
>   e 1 MB, `single`/`array`/`fields`) + os middlewares reais na ordem do `index.js`; multer sem
>   embrulho → sem número; outro erro → 500; formato → 400; réguas de posição (depois da última rota
>   com multer — inclui a montagem de `routes/compras` — e antes do global). **Controles positivos**
>   (sabotagem por Edit, restauro por Edit, LF): não anexar o limite → 3 vermelhos; status 400 → 4;
>   registro antes de `contrato-anexo` → 1; registro depois do global → 1.
> - **Prova real** (`CRM_DATA_DIR` vazio, porta 5987): produto 11 MB → **413** "máximo 10 MB"; avatar
>   6 MB → **413** "máximo 5 MB"; avatar e produto normais → 200; `image/svg+xml` → 400 (83 intacta);
>   warn no log com método/caminho/limite; chat 11 MB → 400 "Imagem muito grande. Máximo 10MB." (própria).
> - **Medido, não mudado — routers montados depois do handler global:** a foto de material do
>   almoxarifado (`routes/almoxarifado.js:819`, `uploadAlmox` 10 MB) com 11 MB → **500 `text/html`**
>   do *finalhandler* padrão do Express, com o stack do `MulterError` no corpo (fora de `production`;
>   em `production` o HTML diz só "Internal Server Error"). O erro não passa por nenhum handler do
>   `index.js` (registrados antes) e o router não tem handler próprio. Vale para `uploadCertificado`
>   (`:888`) e para os multers de `extended.js` que não tratam o erro (`:163`, `:1654`, `:1742`,
>   `:1916`) — candidato a etapa própria (um handler de erro no fim das montagens, ou o mesmo
>   `tratarArquivoGrandeDemais` registrado de novo depois delas).
> - Suítes: `test:api` **307/307** (306 + este); `test:almoxarifado` 44/44; validation 4/4, safealter
>   3/3, sqlite 5/5. Client não mudou (não rodado).

## Pontos de atenção
- Em produção o proxy pode cortar antes (413 do nginx, HTML) — o `ProdutoForm` já trata; os outros
  clients mostram `error.response.data.error` (que no 413 do nginx é vazio) — registrar, não é escopo.
