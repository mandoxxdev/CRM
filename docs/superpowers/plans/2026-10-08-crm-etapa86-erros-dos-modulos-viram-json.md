# Etapa 86 — erros dos módulos montados por último viram JSON

> Origem: próxima tarefa do plano da 85. Baseline (`7b025038`): `test:api` 307/307; client 93
> suítes / 1376 testes; build limpo.

> **Estado (2026-10-08): T1 ✅ `bf8d27fe`, T2 ✅ `82d1290e`.** Falta o fechamento (skill
> `fechar-etapa`: novidades/B41, guia, mapa). Números: `test:api` **308/308**; `test:almoxarifado`
> 44/0; validation 4/0, safealter 3/0, sqlite 5/0; `tests/chat.test.js` 4/0; client **93 suítes /
> 1378 testes**; build `CI=true` limpo.
> - **T1:** `rotasModulos` montado logo antes dos três handlers; os 8 registradores tardios (chat no
>   `.then`) recebem o Router. Global em `services/errosApi.js` (`tratarErroGlobalApi`,
>   `erroComMensagemUsuario`); filtros do almoxarifado/extended com `status 400` + `mensagemUsuario`;
>   multers de `almoxarifado.js`/`extended.js`/`chat.js` embrulhados. Teste novo
>   `errosModulosJson.api.test.js` (15). **Suíte inteira com o harness novo: nenhum teste dependia do
>   HTML/500** — só quebraram as 3 réguas da 83/85 (procuravam o global inline), reescritas; a da
>   RN-85.03 foi invertida. Controles positivos (todos vermelhos, restauro por edição, hash conferido):
>   almoxarifado de volta ao `app`; chat no `app`; handler expondo `err.message`; filtro do
>   certificado sem `mensagemUsuario`; harness sem Router (extended 413/400 → HTML); `extended` com
>   multer cru; global antes do Router.
> - **Prova real** (`CRM_DATA_DIR` vazio, porta 5986, primeiro boot: 0 "no such table|no column
>   named"): foto de material 11 MB → 413 JSON "máximo 10 MB"; assinatura 3 MB → 413 "máximo 2 MB";
>   certificado `.txt` → 400 "Certificado deve ser PDF ou imagem"; JSON malformado (módulo e core) →
>   400 "JSON inválido no corpo da requisição"; chat 11 MB → 400 "Imagem muito grande. Máximo 10MB.";
>   `GET /api/frotas/meta`, `/api/producao/meta`, `/api/almoxarifado/materiais` → 200; socket do chat
>   conecta com token no `auth` (recusa só-query/sem token, como na 84).
> - **Divergências do plano:** (1) com `res.headersSent` o global delega ao finalhandler (antes
>   tentava responder de novo); (2) `mensagemUsuario` só vale com status 4xx — sem status continua
>   500 genérico (testado); (3) o 413 de corpo usa o `err.limit` do body-parser (sai "máximo 15 MB"
>   em produção, sem número fixo no código); (4) ~~no harness o Router vem antes de Compras (em produção
>   depois) — a ordem almoxarifado → Compras do harness não muda~~ **ERRADO** (revisão adversarial): a
>   posição de casamento é a do `app.use`, e ela mudava — corrigido no fix-round (`6bc0e4b6`), abaixo.
> - **T2:** toast "Foto não pôde ser salva, mas o material foi criado: ⟨motivo⟩"; corpo não-JSON →
>   texto antigo. 2 testes; controle positivo (texto fixo) → 1 vermelho. ~~O mesmo texto "foi criado"
>   aparece na edição (onde o upload é imediato) — mantido pela RN, candidato a ajuste.~~ Ajustado no
>   fix-round (`09d195a3`): na edição o texto é "Foto não pôde ser salva: ⟨motivo⟩".
> - **Fix-round da revisão adversarial (2026-10-08)** — `6bc0e4b6`, `ad169d71`, `09d195a3`:
>   - `6bc0e4b6` **harness na ordem de produção:** o Router é criado e recebe os registros no mesmo
>     ponto (almoxarifado antes de Compras, como sempre), mas o `app.use(rotasModulos)` foi para
>     **depois de Compras**, logo antes dos três handlers. `test:api` 308/308 sem outra mudança —
>     nenhum teste dependia da ordem antiga. `ctx.rotasModulos` exposto. Comentários que a 86 tornou
>     falsos: `routes/almoxarifado.js` (o Router roda ANTES do catch-all do SPA, então um mount fora de
>     `/api` ali **seria alcançável** — virou aviso para não reintroduzir o mount legado sem
>     assinatura) e `services/imagemUpload.js` (os módulos **chegam** ao `tratarArquivoGrandeDemais`).
>   - `ad169d71` **handler global:** 401/403 de terceiro (sem `mensagemUsuario`) → **500 genérico** (o
>     client trata 401 como sessão expirada); 404 → "Arquivo não encontrado" (ENOENT, ex.:
>     `res.sendFile` dos anexos) ou "Recurso não encontrado", e o `Content-Disposition` já posto é
>     removido antes do JSON; `parameters.too.many` → 413 "Requisição grande demais".
>     `errosModulosJson` 15 → **26**: os acima + 403 nosso passa, `status = 500` não vira 4xx,
>     `headersSent` → `next(err)`, 503 texto exato, SQLITE_BUSY só pelo `code` e "database is locked"
>     só pela mensagem (separados). O teste "JSON malformado numa rota do módulo" **não provava o
>     Router** (o body-parser roda antes de qualquer rota): ficou com nome honesto, e a prova passou a
>     ser uma rota registrada **tarde** no `rotasModulos` (422 JSON) + controle da mesma rota no `app`.
>   - `09d195a3` **foto na edição:** toast "Foto não pôde ser salva: ⟨motivo⟩"; preview volta para a
>     foto anterior; contador de tentativas impede o FileReader atrasado de repintar a recusada; input
>     limpo depois do upload imediato (sucesso ou falha) — o "Salvar" não reenvia nem dá segundo toast.
>     Cadastro mantém "mas o material foi criado: ⟨motivo⟩". 2 testes reescritos + 4 novos.
>   - **Controles positivos** (sabotagem por Edit → vermelho → restauro por Edit; LF, 0 CR): servidor
>     lote 1 (sem ramo ENOENT, sem guarda 401/403, sem `parameters.too.many`, `<= 500`, texto do 503
>     trocado) → exatamente os 7 alvos vermelhos; lote 2 (sem `removeHeader`, sem `headersSent`, sem
>     `code === 'SQLITE_BUSY'`, Router montado depois dos handlers) → os 4 alvos vermelhos (+ os 6 de
>     multer, que também dependem do Router); lote 3 (sem "database is locked") → 1 vermelho. Client
>     lote A (texto fixo "foi criado", sem revert, sem limpar input) → 4 vermelhos — e revelou que o
>     teste de preview original passava SEM o revert (a guarda do FileReader bastava naquela ordem):
>     virou o teste da guarda, e entrou o da ordem real (preview pinta, depois o servidor recusa);
>     lote B (sem guarda do FileReader, cadastro sem "foi criado") → 2 vermelhos.
>   - Números: `test:api` **308/308**; `test:almoxarifado` 44/0; `tests/chat.test.js` 4/0; client
>     **93 suítes / 1382 testes**; build `CI=true` "Compiled successfully".

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

## Fechamento (2026-10-08) — 🟢

## Retro
- Rodadas de correção até verde: **1**.
- Achados: revisão do plano 2 defeitos de desenho (`expose` mandaria inglês ao usuário e perderia a
  mensagem dos filtros) + tratador global precisava virar módulo; revisão do código 0 defeitos para o
  usuário, 2 comentários falsos, 1 afirmação errada no harness (ordem diferente da produção), 404 com
  texto errado, 401/403 de biblioteca, toast enganoso na edição, lacunas de teste; 0 ruído.
- Paralelismo: nenhum (T2 do client pequena, sequencial).
- Defeito escapado: preencher na etapa seguinte.

## Próxima tarefa detalhada — Etapa 87: o PDF da OS entra na fila do Chromium (B35)
- **O que existe:** `POST /api/operacional/ordens-servico/:id/gerar-pdf` (`server/index.js:~21444`) faz
  `puppeteer.launch` próprio a cada pedido (`~:21873`) e fecha ao fim — um segundo Chromium (~580 MB)
  fora da fila serial da Etapa 80, sem `protocolTimeout`; tem `networkidle0` (`~:21883`), espera fixa de
  2 s (`~:21931`) e interceptação de requisições para imagens (`~:21920`).
- **Desenho provável:** usar `enfileirarPdf` + `obterNavegadorPdf` (a mesma aba-por-geração da proposta),
  mantendo a interceptação e o HTML da OS; medir antes se o `networkidle0` e a espera de 2 s são
  necessários (a proposta trocou esperas fixas por esperar fontes/imagens). Régua: o
  `filaPdfFiacao.api.test.js` passa a exigir 3 `page.pdf` dentro da fila e nenhum `puppeteer.launch` fora
  de `obterNavegadorPdf`. Prova real: PDF da OS gerado, e um PDF de proposta + um de OS concorrentes
  sem erro e com 1 Chromium.
