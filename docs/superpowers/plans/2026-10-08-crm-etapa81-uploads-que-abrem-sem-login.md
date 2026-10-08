# Etapa 81 — arquivos enviados que abrem sem login (`/api/uploads/*` e `/uploads/ordens-servico`)

> Origem: próxima tarefa do plano da 80. Baseline (`fc7c59f9`): `test:api` 299/299; client 86
> suítes / 1338 testes; build limpo.

## Fase 0 — medição (2026-10-08; tabela completa por pasta no relatório da varredura, resumida aqui)
17 montagens `express.static` sem login. Nenhuma rota sem login devolve nome de arquivo, então o
vazamento depende de **adivinhar o nome**. Todas servem qualquer extensão na origem do CRM, **sem
`nosniff` nem CSP** — um `.html`/`.svg` enviado vira XSS armazenado (filtros que deixam passar:
logo aceita SVG `index.js:983`; base64 de grupo/fornecedor/grupo-compras sem lista de extensões
`index.js:3912`, `routes/compras.js:737,869`; extensão do nome original `index.js:932,951`;
comprovante e cotação aceitam qualquer tipo `:802`, `:747`; chat aceita MIME **ou** extensão
`routes/chat.js:35`).

| Pasta | Conteúdo | Nome | Quem lê sem header | Decisão |
|---|---|---|---|---|
| `/uploads/ordens-servico` (`index.js:22077`) | **PDF da OS** (cliente, itens, valores) | `OS_<numero>_<ms>.pdf` — **muito adivinhável** | `OSDetalhesForm.js:230-231` (`window.open`), `:601` (`<a href>`), ambos com `:5000` fixo; `OSComercialForm.js:275` lê `pdf_url` | **T1/T2**: rota autenticada + blob; tirar a montagem |
| `/api/uploads/contrato` (`:17974`) | modelo de contrato da empresa | `contrato_<ms>_<orig>` | `<a href>` em `ConfigTemplateProposta.js:632`, `PreviewPropostaEditavel.js:701` | **T1/T2**: rota autenticada + blob; tirar a montagem |
| `/api/uploads/cotacoes` (`:17941`) | cotação de fornecedor (preços) | `cotacao_<propostaId>_<ms>_<orig>` | **ninguém** (client usa `GET /api/propostas/:id/cotacao` autenticada) | **T1**: só apagar a montagem |
| `/api/uploads/comprovantes-viagens` (`:17080`) | comprovantes de despesa (dado pessoal) | `comprovante_<id>_<ms>_<orig>` | **ninguém** (client usa a rota autenticada `:17167`) | **T1**: só apagar a montagem |
| `chat`, `proposta-fotos`, `avatares` | sensível/moderado; renderizados por `<img>` | chat: ~30 bits aleatórios | `<img>` e `srcDoc` | **fora** — exigem URL assinada (precedente `routes/almoxarifado.js:254-276`); Etapa 82 |
| produtos, famílias, grupos, grupos-compras, fornecedores, materiais-escritório, logos | catálogo / público por natureza | variado | muitos `<img>` | **ficam públicas** + cabeçalhos seguros (T1) |
| headers, footers, covers | legado sem leitor vivo | — | ninguém (só templates mortos) | ficam (cabeçalhos seguros); remoção é limpeza à parte |

## Regras
- **RN-81.01** `GET /api/operacional/ordens-servico/:id/pdf` (**authenticateToken**, o mesmo gate da
  `POST …/gerar-pdf` `:21444`): lê `pdf_url` da OS, usa só o `path.basename`, `sendFile` de
  `uploadsOSDir` com `Content-Type: application/pdf` e `Content-Disposition` **montado pelo encoder**
  (`require('content-disposition')(basename, { type: 'inline' })`, dependência do Express) — o
  `numero_os` é texto livre (`:21350`): com `"` ou caractere acima de U+00FF (travessão colado do
  Word) o cabeçalho cru dava 500/`ERR_INVALID_CHAR` (revisão do plano, F3). OS inexistente, sem `pdf_url` ou arquivo ausente → **404 `{ error: 'PDF da
  OS não encontrado' }`**. Sem token → 401.
- **RN-81.02** `GET /api/proposta-template/contrato-anexo/:arquivo` (**authenticateToken**, o mesmo da
  `POST` `:10968`): `path.basename(arquivo)` tem de casar `^contrato_[\w.\- ]+$` (casa todo nome
  real: o multer `:1170-1173` troca o que não é `[A-Za-z0-9_-]` por `_` desde o primeiro commit),
  **ser o `contrato_anexo_url` de alguma linha de `proposta_template`** (contrato removido em
  "Remover contrato" só zera a coluna e deixa o arquivo — sem esta regra continuaria baixável, B36)
  e existir em `uploadsContratoDir`; senão **404 `{ error: 'Contrato não encontrado' }`**. A
  resposta da `POST` (`:10985-10989`) troca o `url` morto por `/api/proposta-template/contrato-anexo/<f>`. `sendFile` com o tipo
  inferido pela extensão e `Content-Disposition: attachment; filename="<basename>"`. Sem token → 401.
- **RN-81.03** Somem as montagens estáticas de `/uploads/ordens-servico`, `/api/uploads/contrato`,
  `/api/uploads/cotacoes` e `/api/uploads/comprovantes-viagens` (sem elas, o arquivo só sai pela rota
  autenticada). Os arquivos em disco e as colunas (`pdf_url`, `contrato_anexo_url`) **não mudam**.
- **RN-81.04** Toda montagem `express.static` que continua pública sob `/api/uploads/` (inclusive
  `/api/uploads/chat` em `routes/chat.js`) passa a usar `setHeaders: cabecalhosUploadSeguro`
  (`services/almoxarifado/urlUpload.js:92`: `nosniff` + `CSP sandbox` + cache privado) — um `.html`
  enviado deixa de executar script na origem do CRM. `<img>` não é afetado por CSP sandbox.
  ⚠️ `footers` (`:17962-17968`, `app.use` multilinha com middleware antes do static): o
  `setHeaders` roda depois e sobrescreveria o `no-store` dela — compor: `setHeaders: (res) => {
  cabecalhosUploadSeguro(res); res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate'); }`.
  Lista medida (15): familias-produtos, grupos-produtos, grupos-compras, fornecedores, produtos,
  proposta-fotos, materiais-escritorio, logos, avatares, headers, footers, covers, chat
  (`routes/chat.js:20`); almoxarifado já tem. Todas aceitam só imagem — o problema conhecido do
  Chrome (PDF não renderiza sob CSP sandbox) não se aplica.
- **RN-81.05** Client: OS — o link "VER PDF" (`OSDetalhesForm.js:599-608`, uma espera só) baixa por
  `api.get('/operacional/ordens-servico/<id>/pdf', { responseType: 'blob' })` e abre por
  `URL.createObjectURL` em nova aba; some o `:5000` fixo. **"Gerar PDF"** (`:223-232`) espera a
  geração (Puppeteer: 2 s fixos + até 10 s por imagem) **e depois** o blob — abrir a aba só no fim
  passa da janela de ativação do Chrome (~5 s) e o popup é bloqueado (revisão do plano, F8): abrir
  `const w = window.open('', '_blank')` **no clique, antes das esperas**, e no fim
  `w.location.href = blobUrl`; no erro, `w.close()` + toast; se `w` vier nulo (bloqueador), toast
  "PDF gerado — clique em VER PDF". Contrato — o link vira botão que baixa por `api.get(
  '/proposta-template/contrato-anexo/<arquivo>', { responseType: 'blob' })` + `<a download>`.
  Erro: mensagem do servidor (blob → `text()` → JSON, como `client/src/utils/baixarDocumentoPedido.js`,
  passando mensagem padrão própria — a da util é a do pedido). Na OS por toast;
  em `ConfigTemplateProposta.js` por **`alert()`**, como o resto do componente (ele usa `axios` cru
  com Bearer manual, `:4,277-281`, e `alert` em `:263,287`; esta etapa usa `api` só na chamada
  nova e não refatora o componente). `PreviewPropostaEditavel.js:701`: medir se usa toast ou alert e
  seguir o do arquivo. `OSComercialForm.js:275` só mostra toast com `pdf_url` — **não muda**.

## Tasks (contrato congelado acima; T1 e T2 em paralelo, worktrees)
**T1 — servidor (`index.js`, `routes/chat.js`):** RN-81.01–04. Antes de apagar cada montagem,
`grep` de novo por consumidores (inclusive e-mail/WhatsApp que mandem link do PDF da OS para fora —
se existir, **não** apagar essa montagem e registrar). Teste de fonte
`server/tests/api/uploadsProtegidos.api.test.js` (padrão `propostaPdfExigeLogin.api.test.js`): as 4
montagens não existem; toda `express.static` restante sob `/api/uploads` tem `cabecalhosUploadSeguro`;
as 2 rotas novas registradas com `authenticateToken`; o 404 literal de cada uma; o scanner reconhece
`app.use(path, mw, express.static(dir))` multilinha (footers). Sabotagens: voltar
uma montagem, tirar o setHeaders de uma, tirar o middleware de uma rota → vermelho.
**Prova real (obrigatória):** servidor em `CRM_DATA_DIR` vazio; criar OS + gerar PDF; anexar um
contrato; enviar um comprovante e uma cotação pela API; então: `curl` sem token nas URLs estáticas
antigas → **não** é o arquivo (`/uploads/ordens-servico/...` cai no catch-all do SPA e responde 200
com HTML quando há build — afirmar "não começa com `%PDF`", não "404"); `curl` sem token nas rotas novas → 401; com Bearer → 200
com o arquivo (`%PDF`). Um `.html` enviado como foto de produto (se algum filtro deixar) servido com
`X-Content-Type-Options: nosniff` e `Content-Security-Policy: sandbox`.
**T2 — client:** RN-81.05 em `OSDetalhesForm.js` (`:230-231`, `:601`), `OSComercialForm.js` (`:275`
— medir o que faz com `pdf_url`), `ConfigTemplateProposta.js:632`, `PreviewPropostaEditavel.js:701`.
Não existem testes para esses componentes; padrões a copiar: `utils/baixarDocumentoPedido.test.js`
(erro em blob) e `Compras.test.js`/`compras/PedidoCompraForm.test.js` (`api` mockado, `createRoot` +
`act`); `OSDetalhesForm` carrega itens no mount (`/operacional/ordens-servico/:id/itens`) e o jsdom
não tem `URL.createObjectURL` (stub). Testes de componente com `api` mockado na fronteira HTTP
(contrato acima), incluindo: "Gerar PDF" chama `window.open` **antes** de resolver as promessas; clique → `api.get` com a URL
e `responseType: 'blob'`; erro 404 em blob → toast com a mensagem. Controle positivo por sabotagem.
**T3 — integração/fechamento:** merge, suítes completas, prova real, revisão adversarial, docs.

## Pontos de atenção
- **PDF de OS antigo em produção** continua no disco; a rota nova acha pelo `pdf_url` gravado — nada
  a migrar. Link antigo salvo/colado (`/uploads/ordens-servico/...`) passa a não abrir (B36).
- `/uploads/ordens-servico` **não** tem `/api`: em produção pode estar atrás do proxy de outro jeito;
  a rota nova fica sob `/api` como todas.
- Fora do escopo (Etapa 82): URL assinada para chat, proposta-fotos e avatares; corrigir os filtros
  de upload (SVG no logo, extensões do base64 e do nome original) — o RN-81.04 já neutraliza a
  execução, os filtros são a segunda camada.

## Estado e fechamento (2026-10-08) — 🟢
- T1 ✅ `de1f9bb8` (merge `cf721b00`): divergências — handlers em `server/services/arquivosProtegidos.js`
  (para o teste executá-los de verdade); a tabela é **`proposta_template_config`** (o plano dizia
  `proposta_template` — **estava errado**); as pastas públicas são **13**, não 15 (o plano errou a
  contagem); no Windows o `gerar-pdf` já falhava com `"` no `numero_os` (nome de arquivo proibido),
  pré-existente. T2 ✅ `9b3a1c97` (merge `640f0d3e`): "VER PDF" também abre a aba no clique;
  estado `pdfGerado` para o botão aparecer após a primeira geração.
- Plano corrompido pelo script de correção (`$\`` no texto de substituição) e reparado em
  `5cecbde1` — quem percebeu foi o executor da T1.
- Prova real: URLs antigas sem token → não é o arquivo; rotas novas sem token 401, com Bearer 200
  (`%PDF`); contrato removido 404; OS com travessão/aspas 200; `.html` público com `nosniff` +
  `sandbox`.
- Revisão adversarial: nenhum furo nos handlers nem leitor quebrado. Corrigido (`52fe8195`,
  `defcf287`): `Cache-Control: public` herdado do `sendFile` nas rotas protegidas → `private,
  no-store` + `nosniff`; régua de registro só via `app.get` (um `app.use` sem login passava) →
  qualquer registro em `index.js`/`routes/*.js`; CSP estrita podia tirar estilo de SVG de logo →
  CSP própria do logo; duplo clique no VER PDF; aba fechada durante a geração; 4 mutações que
  passavam nos testes. Registrado (B36): sem gate de módulo na OS; cópias de modelo mantêm contrato.

## Retro
- Rodadas de correção até verde: **1** (onda da revisão).
- Achados: revisão do plano 8 (2 que travariam: popup bloqueado, componente com axios/alert);
  revisão do código 4 reais + 4 lacunas de teste; 0 ruído.
- Paralelismo: **2 galhos** (servidor/client em worktrees) contra contrato congelado; sem retrabalho.
- Defeito escapado: preencher na etapa seguinte.

## Próxima tarefa detalhada — Etapa 82: URL assinada para chat, fotos da proposta e avatares
- **Pastas:** `/api/uploads/chat` (`routes/chat.js:20`, imagens do chat interno — sensível; nome
  `chat-<ms>-<random 1e9>`), `/api/uploads/proposta-fotos` (`index.js:~17946`, fotos soltas da
  proposta; `foto_<ms>_<orig>`), `/api/uploads/avatares` (`:~17954`, `avatar_<userId>_<ms>` — o mais
  adivinhável).
- **Precedente a reusar:** `services/almoxarifado/urlUpload.js` (`criarAssinadorUpload`: HMAC do nome
  + validade, middleware que devolve 404) montado em `routes/almoxarifado.js:254-276`; o servidor
  **assina ao devolver** a URL (`materialPhotoUrl`) e o client usa como veio.
- **Onde assinar:** chat — ao listar mensagens (`anexo_url`) e no evento de socket
  (`services/chatSocket.js:75` `resolveMediaUrl` no client); proposta-fotos — no template V2 quando
  `forPdfServer=false` (`propostaPremiumV2.js:109`) e nas respostas das rotas `/fotos` usadas em
  `PropostaPreviewEditavel.js:617,676,1194`; avatares — onde o usuário é serializado (`Layout.js:551`,
  `MinhaConta.js:11` leem).
- **Cuidado:** a URL assinada expira (15 min no almoxarifado) — tela aberta por horas mostra imagem
  quebrada; o almoxarifado aceitou isso, medir se o chat aguenta (talvez validade maior).
- Junto: filtros de upload — logo aceita SVG (`index.js:~983`), base64 sem lista de extensões
  (`:~3912`, `routes/compras.js:737,869`), extensão do nome original (`:~932,951`), chat aceita MIME
  **ou** extensão (`routes/chat.js:35`) → usar `extensaoSegura` (`urlUpload.js:65-85`).
