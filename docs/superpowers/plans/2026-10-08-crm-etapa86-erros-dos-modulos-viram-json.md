# Etapa 86 — erros dos módulos montados por último viram JSON

> Origem: próxima tarefa do plano da 85. Baseline (`7b025038`): `test:api` 307/307; client 93
> suítes / 1376 testes; build limpo.

## Fase 0 — medição (2026-10-08)
- `server/index.js`: `tratarErroFormatoImagem` (`:23105`), `tratarArquivoGrandeDemais` (`:23109`) e o
  handler global (`:23112-23131`: SQLITE_BUSY → 503; resto → 500 `{ error: 'Erro interno do servidor' }`)
  ficam **antes** de: modulosTipoConfig (`:23225`), requisicoesMaterial (`:23233`), almoxarifado
  (`:23236`; o `extended`, ~90 rotas, registra **assíncrono** dentro de `db.run('SELECT 1', cb)`,
  `routes/almoxarifado.js:4109-4123`), frotas (`:23239`), producao (`:23242`), todolist (`:23245`),
  whatsappGateway (`:23248`) e chat (`:23262`, **assíncrono** dentro de `initChatSchema(db).then`).
  Erro dessas rotas cai no *finalhandler* do Express: **500 `text/html`** (stack fora de produção).
  Não há catch-all 404 de `/api` que sombreie nada; o SPA deixa `/api` passar.
- O que chega lá hoje, na prática: erros de **multer** das rotas do almoxarifado — `almoxarifado.js:819`
  (foto de material, 10 MB), `:887-888` (certificado de lote), `extended.js:1581-1582` (destino de
  sucata), `:1669-1670` (calibração), `:1756-1757` (ocorrência), `:1931-1932` (assinatura, 2 MB);
  `extended.js:1823-1832` (anexos) e `chat.js:172-185` tratam os seus. frotas/produção/todolist têm
  `try/catch` em tudo. Os multers tardios usam `require('multer')` cru (sem o limite no erro, Etapa 85)
  e os `fileFilter` deles lançam `Error` sem `codigo`.
- Também: o handler global devolve **500** para erros que já trazem status 4xx (ex.: JSON malformado
  do `express.json`, `err.status = 400`).
- Client: telas do almoxarifado mostram o texto genérico quando o corpo é HTML
  (`LotesAlmoxarifado.js:330`, `FerramentasAlmoxarifado.js:367,396`, `RequisicoesList.js:835`,
  `SobrasAlmoxarifado.js:536`); `MaterialAlmoxarifadoForm.js:506-507` ignora o erro e sempre diz "Foto
  não pôde ser salva, mas o material foi criado".
- Réguas que fixam posição: `imagemUploadFiltros.api.test.js:447-475` e `uploadGrandeDemais.api.test.js:165-198`
  (cada handler registrado **uma vez**, depois da última rota com multer, antes do global; RN-85.03 exige
  que `chat.js`/`extended.js` **não** usem `multerComLimiteNoErro`). Harness: `testApp.js:200-232` monta o
  almoxarifado **sem** handler de erro.

## Decisões (B41)
- **Router dos módulos**: `const rotasModulos = express.Router(); app.use(rotasModulos);` imediatamente
  **antes** dos três handlers; todos os registradores tardios recebem `rotasModulos` no lugar de `app`
  (inclusive o chat no `.then` e, por consequência, o `extended`, que recebe o `app` do almoxarifado).
  Rota adicionada a um Router depois continua rodando **na posição do Router** — o erro chega aos
  handlers não importa quando ela registra. Descartado: mover os handlers para o fim (o `extended` e o
  chat registram depois do `listen`); segunda cópia no fim (mesmo problema + quebra as réguas de
  "registrado uma vez").
- Multers tardios também embrulhados por `multerComLimiteNoErro` ("máximo N MB"); a RN-85.03 é
  **revista** (o callback inline de anexos/chat continua recebendo o erro e respondendo a mensagem
  dele — o embrulho só anexa o limite; a 85 já provou isso).
- Handler global respeita status 4xx que o erro já traz, **sem** usar `err.expose` (revisão do plano: o
  `expose` do body-parser mandaria texto em inglês ao usuário — "Unexpected token } in JSON",
  "request entity too large"; e um `new Error()` dos filtros não tem `expose`, então a mensagem deles
  se perderia). Mensagem: `err.mensagemUsuario` quando o **nosso** código a pôs (os `fileFilter` do
  almoxarifado passam a lançar erro com `status = 400` e `mensagemUsuario` = o texto que já têm);
  senão, por `err.type` do body-parser — `entity.parse.failed` → 400 "JSON inválido no corpo da
  requisição", `entity.too.large` → 413 "Requisição grande demais (máximo 15 MB)"; outro 4xx →
  "Requisição inválida". `MulterError` de outros códigos → 400 "Upload inválido".
- O handler global sai do `index.js` para um módulo (ex.: `services/errosApi.js`, `tratarErroGlobalApi`) —
  o harness não pode dar `require` no `index.js` (ele sobe o servidor) e precisa montar os mesmos três
  handlers.

## Regras
- **RN-86.01** Toda rota dos routers tardios cujo handler/multer passa erro adiante responde **JSON**
  pelos handlers do `index.js` (nunca o HTML do finalhandler), inclusive as registradas depois do
  `listen` (`extended`, chat).
- **RN-86.02** Arquivo grande nas rotas do almoxarifado → 413 "Arquivo grande demais (máximo N MB)";
  formato recusado pelo filtro do almoxarifado → 400 com a mensagem do filtro (via `mensagemUsuario`).
  ⚠️ `/anexos` (`extended.js:1823-1832`) e o chat tratam o erro no callback e respondem **400** com a
  mensagem deles — o embrulho não muda isso; o teste de 413 do `extended` usa outra rota (ex.:
  calibração `:1669-1670` ou assinatura `:1931-1932`, 2 MB).
- **RN-86.03** Global: 4xx do próprio erro preservado com mensagem em português (regra acima, nunca o
  `err.message` cru de terceiros); `MulterError` não-tamanho → 400 "Upload inválido"; SQLITE_BUSY → 503
  e o resto → 500 como hoje (inclusive o `message` só em `development`).
- **RN-86.04** `MaterialAlmoxarifadoForm.js`: a falha da foto mostra a mensagem do servidor quando houver
  (mantém "o material foi criado").

## Tasks
**T1 — servidor:** RN-86.01–03. `testApp.js` passa a montar os mesmos três handlers (exportados) depois
dos routers — **rodar a suíte inteira** e registrar qualquer teste que dependia do HTML/500. Teste de
rota de verdade no harness (`server/tests/api/errosModulosJson.api.test.js`): foto de material acima do
limite → 413 JSON com "máximo 10 MB"; certificado com formato recusado → 400 JSON com a mensagem; uma
rota do `extended` (registrada assíncrona) com arquivo grande → 413 JSON; JSON malformado → 400. Réguas
**reescritas** (as da 83/85 acham o global pelo texto literal `app.use('/api', (err, req, res, next) => {` —
`imagemUploadFiltros.api.test.js:449`, `uploadGrandeDemais.api.test.js:167` — e ficam cegas quando ele
vira módulo): os três handlers registrados uma vez, nesta ordem, depois do `app.use(rotasModulos)`;
o teste da RN-85.03 (`uploadGrandeDemais.api.test.js:200-206`) é **invertido** (chat e `extended` agora
usam o embrulho, e continuam com as mensagens próprias); todo
`require('./routes/…')(` depois dessa linha recebe `rotasModulos` (inclusive o do chat). Controles
positivos. **Prova real:** servidor em `CRM_DATA_DIR` vazio — foto de material 11 MB → 413 JSON;
assinatura de requisição 3 MB → 413 "máximo 2 MB"; JSON malformado → 400; chat 11 MB → mensagem dele.
**T2 — client:** RN-86.04 + teste.

## Pontos de atenção
- `whatsappGateway` e `modulosTipoConfig` também passam a ir pelo Router — conferir que nenhum usa API
  só do `app` (`app.set`, `app.locals`, `app.route`; a medição diz que não).
- Nada de `/api` 404 novo nesta etapa.
- O harness usa `express.json()` com o limite padrão de 100 kB (`testApp.js:29`), não os 15 MB da
  produção — o teste do 413 de corpo grande monta um app próprio com `limit: '15mb'` ou testa o
  handler isolado.
- Em produção as rotas dos módulos passam a rodar antes do middleware de cache e do SPA (`:23159+`) —
  todas são `/api`, sem colisão; efeito desprezível (medido na revisão do plano).
