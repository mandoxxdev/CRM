# Etapa 79 — o PDF (e o preview) da proposta passam a exigir login

> Origem: **A5** do `docs/compras-novidades-por-etapa.md`, achado colateral da Etapa 78.
> Baseline (`0797af8e`): `test:api` 296/296; client 86 suítes / 1338 testes; build limpo.

## Fase 0 — o que existe (medido em 2026-10-08)
- `server/index.js` tem **9** registros `app.<verbo>('/api…')` sem `authenticateToken` (⚠️ a primeira
  medição contou 7 com regex ancorada na coluna 0 e errou — a revisão do plano achou `GET /api`
  `:3546` e `GET /api/app-version` `:23166`, indentada dentro de um `if`): `health` (2x),
  `auth/login`, `GET /api`, `backup` (token próprio, Etapa 21), `deploy-version`, `app-version` —
  legítimas — e **duas que vazam dado
  comercial**: `GET /api/propostas/:id/premium` (`:9683`, HTML completo da proposta: cliente,
  itens, preços, condições) e `GET /api/propostas/:id/pdf` (`:10021`, o mesmo em PDF). Comentário
  em `:10020`: "rota liberada sem autenticação para permitir abertura direta via link/PDF" (commit
  `bd836d2d`, 2026-03-12). Os ids são sequenciais: quem tem a URL do servidor baixa **todas** as
  propostas trocando o número.
- **Quem chama** (`grep -rn "premium\|/pdf" client/src`): 6 pontos —
  `PreviewPropostaEditavel.js:184,229`, `PropostaDetalhe.js:101,116`, `PropostaForm.js:463,477`,
  `PropostaPreviewEditavel.js:138,1413`, `Propostas.js:250`, `PropostasList.js:119` (7º, faltava na
  primeira contagem) — **todos** por `api.get` (o
  interceptor de `client/src/services/api.js:43-58` põe o Bearer). Nenhum `<a href>`, `<iframe
  src>` ou `window.open` aponta para as rotas: o `window.open` abre um `blob:` já baixado. Nada no
  servidor (e-mail, WhatsApp) gera link para elas. Ou seja: a "abertura direta via link" do
  comentário **não tem nenhum usuário** hoje.
- `GET /api/propostas/:id` (`:5990`, os mesmos dados em JSON) usa **só** `authenticateToken`, sem
  `checkModulePermission`.
- Não há harness do `index.js` (23 mil linhas, `listen` no import). Precedente para provar fiação
  do core: `backupExposicao.api.test.js:196-210` (lê a fonte do `index.js`).

## Regras
- **RN-79.01** `GET /api/propostas/:id/premium` e `GET /api/propostas/:id/pdf` sem token → **401**
  (a resposta padrão do `authenticateToken`); com token válido → o comportamento de antes
  (HTML 200 / PDF 200 / 404 "Proposta não encontrada").
- **RN-79.02** O gate é o **mesmo** de `GET /api/propostas/:id`: só `authenticateToken`. Quem já lê a
  proposta em JSON lê o PDF; nenhum usuário perde acesso que tinha pela tela (B34).
- **RN-79.03** O client não muda (todos os chamadores já mandam Bearer); a suíte do client tem de
  continuar verde sem tocar nela.

## Tasks
> **Estado (2026-10-08): T1 FEITA — `b786f506`.** As duas rotas ganharam `authenticateToken`; o
> comentário "liberada sem autenticação" foi reescrito nas duas (o da `/pdf` explica o porquê; o da
> `/premium` aponta para ele — o mesmo texto existia acima das duas, não só em `:10020`).
> Teste `propostaPdfExigeLogin.api.test.js` 4/4. Controles positivos, todos **vermelhos**: (1) no
> código antigo — 1/4, "novas abertas: [GET /api/propostas/:id/pdf, GET /api/propostas/:id/premium]";
> (2) tirando o middleware só do `/pdf` — 2/4, "novas abertas: [GET /api/propostas/:id/pdf]";
> (3) acrescentando `  app.get('/api/xyz', …)` indentada — 3/4, "novas abertas: [GET /api/xyz]";
> restauro por Edit, 4/4. Base LF, 0 CR.
> **Prova real** (`CRM_DATA_DIR` vazio, `PORT=5997`, cliente 1 e proposta 1 criados por
> `POST /api/clientes` e `POST /api/propostas`): sem token `/premium` e `/pdf` →
> `401 {"error":"Token não fornecido","code":"NO_TOKEN"}`; Bearer inválido → `401 {"error":"Token
> inválido ou expirado"}`; com Bearer `/premium` → `200 text/html` (100626 bytes, com "PROPOSTA PROVA
> C79" e "CLIENTE PROVA C79"), `/pdf` → `200 application/pdf` (828196 bytes, começa com `%PDF-1.4`),
> `/999/pdf` → `404 {"error":"Proposta não encontrada"}`.
> Suítes: `test:api` 297/297 (296 + o novo); `test:almoxarifado` 44/0; `test:validation` 4/0,
> `test:safealter` 3/0, `test:sqlite` 5/0; client 86 suítes / 1338 testes (sem tocar no client).

**T1 (única, tronco):** `index.js` — acrescentar `authenticateToken` nas duas rotas e reescrever
o comentário de `:10020` (dizendo por que o "liberada sem autenticação" caiu). Teste
`server/tests/api/propostaPdfExigeLogin.api.test.js`, no padrão de `backupExposicao.api.test.js`:
lê a fonte do `index.js` e afirma, para cada uma das duas rotas, que o registro
`app.get('/api/propostas/:id/<x>', authenticateToken, …` existe; e, como régua de regressão, que a
lista de registros `app.<verbo>('/api…'` **do `index.js`** (regex aceitando indentação) sem
`authenticateToken` é **exatamente** as 7 legítimas (health ×2, auth/login, `GET /api`, backup,
deploy-version, app-version). Fora do escopo, dito no teste: montagens `app.use` (estáticos de
`/api/uploads/*`, rate limit) e `routes/*.js` (cada módulo tem o próprio gate: `app.use` do
almoxarifado, `frotaAuth`, `prodAuth`, `guard`; `whatsappGateway` usa segredo próprio) — uma rota nova aberta por engano derruba o teste. Controle
positivo: tirar o middleware de uma das duas → vermelho.
**Prova real (obrigatória — o teste de fonte não prova o 401):** servidor em `CRM_DATA_DIR` vazio;
`curl` sem token em `/premium` e `/pdf` de uma proposta criada pela API → **401**; com Bearer →
**200** (`text/html` e `application/pdf` começando com `%PDF`).

## Pontos de atenção
- 401 no client = logout global (`client/src/services/api.js:151-158`). Hoje, com token vencido,
  "Gerar PDF"/"Ver proposta" ainda funcionavam; depois, mandam para o login e o que não foi salvo
  na página se perde (`PropostaPreviewEditavel.js` com edição inline pendente). Baixo: as mesmas
  páginas já chamam rotas autenticadas (`/clausulas`, salvar). Corpos: sem token `401
  {error:'Token não fornecido', code:'NO_TOKEN'}`; vencido `401 {error:'Token inválido ou expirado'}`.
- `authenticateToken` aceita `?token=` na query (`index.js:3001-3003`) — fora do escopo; registrado.
- Os assets do HTML (`/api/assets`, `/api/uploads/...`) são estáticos sem auth: o PDF continua
  carregando imagens e fontes.
- Se em produção alguém usa a URL crua (favorito, link colado em e-mail), passa a ver 401. Não há
  nenhum gerador desse link no código; reversível (B34).
- Não confundir com `/pdf-anexo` (já autenticada).

## Fechamento (2026-10-08)
- Revisão: a do plano (Fase 2) achou o erro real da etapa — a régua dizia 5 rotas legítimas, eram
  7 (regex ancorada na coluna 0 perdia a `app-version` indentada); corrigido antes de executar.
  O diff final é de 2 linhas de middleware + comentário; a prova real (401/200) foi a revisão do
  código.
- Docs: A5 resolvido, B34, seção da Etapa 79 no `docs/compras-novidades-por-etapa.md`, linha 79
  no índice.

## Retro
- Rodadas de correção até verde: **0** (1 correção de plano antes de executar).
- Achados: 1 real na revisão do plano (allowlist 5→7), 1 inventário (7º chamador), 0 ruído.
- Paralelismo: nenhum (task única).
- Defeito escapado: preencher na etapa seguinte.

## Próxima tarefa detalhada — Etapa 80: fila no Chromium compartilhado dos PDFs (B32)
- **O risco:** `obterNavegadorPdf` (`server/index.js`, perto de `:312`) recicla o navegador a cada
  20 PDFs e fecha no erro (`fecharNavegadorPdf`). Agora há **dois chamadores** — a rota
  `/api/propostas/:id/pdf` e `gerarPdfDeHtml` (pedido de compra, Etapa 78). Se A está em
  `page.pdf` quando B dispara a reciclagem ou fecha por erro, A morre com "Target closed".
- **Desenho mínimo:** uma fila de uma posição (promessa encadeada, `let filaPdf = Promise.resolve()`)
  pela qual as duas gerações passam; reciclagem e fechamento só entre gerações. Sem dependência nova.
- **Como provar sem Chromium no harness:** extrair a fila para `server/services/filaPdf.js` (pura:
  `enfileirar(fn)`), testar ordem e isolamento de erro (uma tarefa que lança não trava as
  seguintes) com funções falsas; prova real: 5 PDFs concorrentes (proposta + pedido) com `curl &`
  todos 200 `%PDF`.
- Medir antes: a rota da proposta tem caminhos de `return` antes do `page.close()`? (aba pendurada).
