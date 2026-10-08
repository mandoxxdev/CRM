# Etapa 78 (`main`, numeração unificada) — o documento impresso do pedido de compra

> **Numeração:** depois da unificação de 2026-10-07 há uma linha só. As Etapas 33–39 de Compras
> colidem em número com as do almoxarifado (prefixos diferentes) e já existe uma "Etapa 40"
> (fornecedores/cotações, `2026-09-21-crm-etapa40-*`). A partir daqui a sequência é única e
> continua da 77 do almoxarifado: esta é a **78**. (O que o plano da 39 chamou de "Etapa 40" é esta.)
> Origem: o objetivo final da Etapa 32 — o pedido de compra que a GMP **emite ao fornecedor**, no
> formato do ERP (PDF `Matheus - TECNOPAR 28433`, form `TF_PEDCOMPRA`), que ficou "a fazer" (G2 da
> 32) e que a 39 não cobriu (G14). Design do layout: `docs/superpowers/specs/2026-09-11-compras-etapa32-pedido-de-compra-design.md` §3.1–3.7.
> Baseline (`ad1ab033`): `test:api` 295/295; client 85 suítes / 1323 testes; build limpo.

## Fase 0 — o que existe (medido)

- **Gerador em uso:** HTML gerado em JS (`server/templates/propostaPremiumV2.js`, função pura
  `gerarHTMLPropostaPremiumV2(...)` → string) convertido pelo **Puppeteer** com Chromium mantido
  aberto (`obterNavegadorPdf`, `server/index.js:312-337`, reciclado a cada 20 PDFs/5 min). Rota
  `GET /api/propostas/:id/pdf` (`index.js:9955`): `setContent` → espera fontes/imagens →
  `page.pdf({format:'A4', printBackground, preferCSSPageSize, margin 0})`; `Content-Disposition`
  com o nome montado por `nomeArquivoPdfProposta` (`:418-430`). `pdfkit` (`gerarPDFProposta.js`)
  existe mas **não é usado**.
- **Download no client:** `api.get(url, { responseType: 'blob' })` + `URL.createObjectURL` +
  `<a download>`; nome lido do cabeçalho por `client/src/utils/nomeArquivoPdf.js`
  (`nomeArquivoDoCabecalho`). **Nunca `?token=` na URL** (comentário em
  `RelatoriosAlmoxarifado.js:29-37`: vazaria o token em histórico/logs). `authenticateToken` aceita
  Bearer, `x-auth-token` e `?token=` (`index.js:2935-2937`), mas o padrão do app é o Bearer.
- **Dados do pedido:** `GET /api/compras/pedidos/:id` (Etapa 39) já devolve tudo o que o documento
  precisa: cabeçalho + 9 condições + 5 totais, `fornecedor{nome, cnpj, ie, endereco, municipio, uf,
  cep, telefone, celular, email, origem}`, `itens[]` com `item_numero, codigo, descricao, ncm,
  peso_unitario, quantidade, unidade, valor_unitario, ipi_percentual, observacao, valor_linha,
  ipi_linha`, `totais{6}`. Ordenado por `item_numero`.
- **Empresa:** `configuracoes` chaves `empresa_nome, empresa_cnpj, empresa_endereco, empresa_cidade,
  empresa_estado, empresa_cep, empresa_telefone, empresa_email, empresa_site` (seed `index.js:2263-2271`,
  edição em `Configuracoes.js:321-389`). **Não existe `empresa_ie`** nem logo configurável; o logo
  está em `server/assets/proposta/logo-gmp.png` (base64 com `forPdfServer`); os dados fiscais
  completos da GMP (IE `799.890.695.115`) estão **fixos no código** do template de proposta
  (`propostaPremiumV2.js:1541-1544`, `gerarPDFProposta.js:265-283`).
- **Testes de PDF:** os ~35 `server/tests/proposta*.test.js` chamam o gerador de HTML e afirmam
  sobre a **string**; poucos renderizam no Puppeteer. É o padrão a seguir.
- **O que o design da 32 não registrou:** o texto literal da nota legal de ICMS do rodapé, e o
  "código do fornecedor" (`3797 - TECNOPAR`) — `fornecedores` não tem coluna de código.

## Decisões (reversíveis; B26–B29)

- **B26** Formato: **PDF gerado no servidor** pelo mesmo caminho da proposta (Puppeteer), com uma
  rota HTML irmã para teste e pré-visualização. **Descartado:** jsPDF no navegador (o documento vai
  ao fornecedor — tem de sair igual em qualquer máquina) e `window.print` (sem controle de página).
- **B27** Autenticação: Bearer + módulo `compras`, download por blob como todo PDF do app.
  **Descartado:** `?token=` na URL (padrão que o app rejeita de propósito).
- **B28** Bloco da empresa vem das **configurações** (`empresa_*`) — e a configuração ganha a chave
  **`empresa_ie`** (seed + campo em Configurações → Geral → Empresa), para o documento não ter
  dado fiscal fixo no código. Logo: `server/assets/proposta/logo-gmp.png` embutido (como a proposta).
- **B29** Rodapé legal: a nota de ICMS **não** é inventada — o documento imprime o texto da chave
  **`empresa_nota_pedido_compra`** (nova, editável em Configurações; vazia por padrão → o bloco
  não aparece). É a **D-78** para o P.O.: qual é o texto que o ERP imprime hoje.
- Número: o do pedido (`PC-…`, B19). Fornecedor: o **snapshot** (`fornecedor{}` da 39); `origem:
  'cadastro'` imprime igual (sem selo — o fornecedor não precisa saber).
- "Folha X/Y", "Emissão" e "Impresso por ⟨usuário⟩ em ⟨data hora⟩" via `headerTemplate`/`footerTemplate`
  do Puppeteer (`pageNumber`/`totalPages`) — a proposta faz paginação em JS; aqui o documento é
  tabular e o nativo basta (reversível).
- A data de entrega por item (coluna do ERP) **não existe** (Etapa 33): a coluna sai do documento e
  a previsão do pedido vai no cabeçalho ("Previsão de entrega").

## Regras (`grep RN-78`)

- **RN-78.01** `GET /api/compras/pedidos/:id/documento` (HTML, `text/html; charset=utf-8`) e
  `GET /api/compras/pedidos/:id/documento.pdf` (`application/pdf`, `Content-Disposition:
  attachment; filename="pedido-compra-⟨numero⟩.pdf"`), ambos `authenticateToken` +
  `checkModulePermission('compras')`; 404 "Pedido de compra não encontrado" (literal existente).
- **RN-78.02** O HTML é gerado por função **pura** `gerarHTMLPedidoCompra({ pedido, empresa,
  impressao })` em `server/services/compras/pedidoDocumentoHtml.js` (string; sem acesso a banco),
  com os blocos do design §3: **cabeçalho** (logo, razão social, endereço, CNPJ, IE, telefone,
  e-mail da empresa; "PEDIDO DE COMPRA ⟨numero⟩", data do pedido, situação, previsão de entrega);
  **fornecedor** (nome, CNPJ, IE, endereço, município/UF, CEP, telefone, celular, e-mail);
  **faturamento** (bloco da empresa); **dados complementares** (desconto, transportadora e telefone,
  frete, condição de pagamento, tabela de preço, via de transporte, contato, observações);
  **itens** com as colunas `It. | Material | Descrição + Observação | NCM | Peso Un (kg) | Qtde. |
  Un | Valor Unitário | % IPI | Valor Total`; **totais** (produtos, IPI, ICMS-ST, desconto, frete,
  **total geral** em destaque); **rodapé** (local de entrega, local de cobrança, a nota legal se
  configurada, linhas de assinatura "Depto. Compras" / "Diretoria").
- **RN-78.03** Formatação: valores `pt-BR` com 2 casas; **valor unitário com as casas necessárias
  (mín. 2, até 6; zeros à direita além da 2ª caem)** — a RN-12 da 32 mediu que o ERP imprime 3 casas fixas e por isso `qtd × unit`
  **não fecha** com o total da linha em 6 das 24 linhas do pedido real (`49 × 0,106 = 5,194` vs
  `5,21`); aqui o papel tem de fechar (B31, descarta as 3 casas fixas). ⚠️ **Esta RN dizia
  "máx. 4" e estava errada** (achado da revisão adversarial, corrigido no fix-round): o
  `valor_linha` é `arred2(qtd × unit)` com o unitário na precisão gravada (`pedidoTotais.js:37`),
  então um unitário de 5 casas cortado em 4 repete o erro do ERP — `1000 × 1,23456` imprimia
  `1,2346` ao lado de `1.234,56` (com `1,2346` daria `1.234,60`). O teto 6 é o que `toFixed`
  representa sem ruído de ponto flutuante. **Quantidade** fracionada também vai até 6 (com 3,
  `0,0004` imprimia "0"). `% IPI` com 2; peso com
  3; datas `DD/MM/AAAA`; campo vazio ou `null` imprime "—". Sem nenhum `undefined`/`null`/`NaN`
  no HTML (teste varre a string, passando o shape com `null`, como vem de um pedido pré-39).
- **RN-78.04** Empresa: `empresa_nome, cnpj, ie, endereco, cidade, estado, cep, telefone, email`
  lidos de `configuracoes` por `lerEmpresa(db)` (em `opcoesPedido.js`, que já lê 5 delas);
  **`empresa_ie`** e **`empresa_nota_pedido_compra`** nascem no seed (`INSERT OR IGNORE`, vazias) e
  aparecem em Configurações → Geral → Empresa (campo "Inscrição Estadual" e textarea "Nota legal do
  pedido de compra"). Chave vazia → "—" (IE) / bloco ausente (nota).
- **RN-78.05** PDF: A4 retrato, **`@page { size: A4; margin: 12mm }` no CSS do documento** (⚠️ a
  proposta usa `margin: 0` porque pagina em JS — copiar isso **apaga o rodapé** do Puppeteer: o
  `@page` do CSS prevalece sobre o `margin` de `page.pdf`) e o mesmo `margin` em `page.pdf`;
  `printBackground`; `displayHeaderFooter: true` com `headerTemplate: '<span></span>'` (sem ele o
  Chromium imprime data+título padrão) e `footerTemplate` com **CSS inline e `font-size`
  explícito** (nada do `<style>` do documento chega lá): "Folha ⟨pageNumber⟩/⟨totalPages⟩ ·
  Impresso por ⟨usuário, escapado⟩ em ⟨DD/MM/AAAA HH:mm⟩". Gerado pelo **mesmo Chromium** da proposta:
  `gerarPdfDeHtml(html, opcoes)` nasce **dentro do `index.js`**, logo abaixo de `obterNavegadorPdf`
  (`:312`), replicando o fluxo da proposta (`:10241-10300`: `newPage` → `setViewport` →
  `setContent` → fontes/imagens → `page.pdf` → `Buffer` → `page.close()` → `pdfsGerados += 1` →
  `agendarFechamentoOcioso()`; no `catch`, `fecharNavegadorPdf('erro na geração')` como a proposta
  faz em `:10337` — aba pendurada contamina os PDFs seguintes). Não dá para extrair para um serviço
  sem mover o ciclo de vida inteiro (`let navegadorPdf/pdfsGerados/timerOciosoPdf`, `:292-294`).
  Injetada em `routes/compras.js` no 5º argumento, que **já existe** (`uploads`, `:86-92`): chave
  nova `gerarPdfDeHtml`, com default na rota → `503 {error:'Geração de PDF indisponível'}` quando
  ausente (harness antigo). JSDoc de `:51-52` atualizado. `cors({ exposedHeaders:
  ['Content-Disposition'] })` em `index.js:488` (B30 — em dev por IP o header era invisível ao
  axios). No harness, `testApp.js` passa um `gerarPdfDeHtml` falso que devolve um buffer com o HTML
  — o teste prova a fiação (status, headers, nome), não o Chromium.
- **RN-78.06** Client: botão **"Documento (PDF)"** na lista de pedidos (coluna de ações) e no
  formulário em edição — **`type="button"`** (o rodapé `.header-actions` fica dentro do `<form>`,
  `PedidoCompraForm.js:1253-1258`; sem isso o clique submete o pedido), presente também no modo
  "só status" (`:430`); download por blob; nome do cabeçalho com **fallback**
  `pedido-compra-⟨numero⟩.pdf` montado do `numero` da linha/formulário (sem o `exposedHeaders` o
  header é invisível cross-origin); erro: com `responseType:'blob'` o 404/500 chega como `Blob` —
  ler `await e.response.data.text()` → `JSON.parse` → `.error` para o toast dizer "Pedido de
  compra não encontrado". Na criação (sem id) o botão não existe.
- **RN-78.07** `fornecedor.origem === 'cadastro'` (pedido anterior à 39) imprime o cadastro vivo
  sem aviso; `teve_recebimento` não muda o documento.

## Contratos

| Rota | Resposta | Erros |
|---|---|---|
| `GET /api/compras/pedidos/:id/documento` | `200 text/html` (página completa, CSS inline, logo base64) | 401; 403 módulo; 404 literal |
| `GET /api/compras/pedidos/:id/documento.pdf` | `200 application/pdf`, `Content-Disposition: attachment; filename="pedido-compra-<numero>.pdf"` | idem; 500 `{error}` se o Chromium falhar |
| `GET /configuracoes` / `PUT /configuracoes/:chave` | ganham `empresa_ie`, `empresa_nota_pedido_compra` (categoria `empresa`) | — |

`gerarHTMLPedidoCompra({ pedido, empresa, impressao: { usuario, dataHora } })` → string.
`lerEmpresa(db)` → `{ nome, cnpj, ie, endereco, cidade, estado, cep, telefone, email, nota_pedido_compra }`.

## Tasks

> **Estado (2026-10-08): 🟢 todas feitas.** T1 ✅ `be62b9f6` (HTML puro), `a01ef932` (lerEmpresa,
> seed, `gerarPdfDeHtml`, cors), `e263afd7` (rotas, harness, `comprasPedidoImpresso.api.test.js`) —
> merge `ff57b804`. Divergências: URL das opções é `/pedidos-aux/opcoes`; `gerarPdfDeHtml` ficou
> **ao lado** da proposta (não extraído para `services/pdfDeHtml.js` — mudaria o comportamento da
> proposta); 2 commits em vez de 3 (hunks do `index.js` inseparáveis sem add interativo). T2 ✅
> `661ef423` — merge `85a969c1` (o "81/81 verde" do primeiro executor era falso: faltava chamar o
> fallback do nome; o executor morreu no meio da sabotagem). T3 ✅ suíte inteira, PDF real (abaixo),
> revisão, onda `6e5267b6` + `51bb00fe`, documentação.

**T1 — tronco (servidor):** `pedidoDocumentoHtml.js` (puro; lê `server/assets/proposta/logo-gmp.png`
em base64 por conta própria — `assetProposta` da proposta é closure local; CSS do documento:
`thead { display: table-header-group }`, `tr { break-inside: avoid }`, `.avoid-break` em totais e
assinaturas, **sem** `overflow: hidden` no wrapper da tabela, `font-family: Arial, Helvetica,
sans-serif` — o Dockerfile só tem `ttf-freefont`) + `server/tests/pedidoDocumentoHtml.test.js`
(runner próprio como os `proposta*.test.js`: blocos presentes com os dados do pedido 28433 dos
testes da 39; 3 casas no unitário; "—" nos vazios; nota ausente quando vazia; nenhum
`undefined|null|NaN` na string; ordem por `item_numero`; snapshot × cadastro imprimem o `fornecedor{}`
que receberam). `lerEmpresa` em `opcoesPedido.js` (+ `empresa` do `/opcoes` continua `{nome,
endereco}` — não mudar o shape que o form da 39 lê). Seed das 2 chaves em `index.js` (ao lado de
`:2263-2271`). Rotas em `routes/compras.js` (`/documento`, `/documento.pdf`) e a injeção
`gerarPdfDeHtml` no `index.js` (uma função que usa `obterNavegadorPdf` — **extrair** o trecho
`setContent → page.pdf` da rota da proposta para `server/services/pdfDeHtml.js`? só se a rota da
proposta puder usá-lo sem mudar comportamento; senão, função nova ao lado, sem tocar na proposta).
Teste de rota em **`comprasPedidoImpresso.api.test.js`** (⚠️ `comprasPedidoDocumento.api.test.js` **já
existe** — é o da Etapa 39; não tocar): HTML 200 com o número e o total; 404 literal; 401; PDF via
fake → `application/pdf` + `Content-Disposition: attachment; filename="pedido-compra-<numero>.pdf"`
(forma simples, como a proposta em `index.js:10331`); 503 quando o 5º argumento não traz
`gerarPdfDeHtml`. `lerEmpresa(db)` **tolera "no such table"** (fallback com todas as chaves vazias,
como `enderecoDaEmpresa` já faz) — o `testApp.js` **não** ganha a tabela `configuracoes` (o teste
da 39 afirma esse fallback e diz isso por escrito); o teste novo cria a tabela mínima
(`chave TEXT PRIMARY KEY, valor, tipo, categoria, descricao`) **no próprio arquivo**, com um cenário
com tabela preenchida (cabeçalho com CNPJ/IE da empresa) e um sem (tudo "—").
**T2 — galho (client):** `Configuracoes.js` (a aba Empresa é JSX por chave fixa, `:321-389` —
acrescentar os campos "Inscrição Estadual" (`empresa_ie`) e a textarea "Nota legal do pedido de
compra" (`empresa_nota_pedido_compra`), ambos por `handleChange('empresa', chave)`; o `PUT` faz
upsert, então funcionam mesmo sem seed) + `Compras.js` (botão na linha, `:443-454`) +
`PedidoCompraForm.js` (botão `type="button"` no rodapé, inclusive em "só status") + testes
(`Configuracoes.test.js`: os dois campos salvam por `PUT /configuracoes/<chave>`;
`Compras.test.js`/`PedidoCompraForm.test.js`: clique → `api.get('/compras/pedidos/7/documento.pdf',
{ responseType: 'blob' })` → `<a download>` com o nome do cabeçalho, e com o fallback quando o
header não vem; 404 em blob → toast "Pedido de compra não encontrado"; o clique **não** dispara o
submit do form).
**T3 — integração/fechamento:** suíte inteira; **prova real do PDF** fora do harness: subir o
servidor (`CRM_DATA_DIR` de teste) e baixar `…/documento.pdf` de um pedido criado pela API com
`curl -H "Authorization: Bearer …"` → arquivo começa com `%PDF`, > 10 kB; registrar. Seção da
Etapa 78 no `docs/compras-novidades-por-etapa.md` (+ D-78, B26–B29); índice; renomear as menções
"Etapa 40" da 39 para "Etapa 78"; retro.

## Pontos de atenção
- O Chromium é compartilhado com a proposta (`obterNavegadorPdf` recicla após 20 PDFs): no sucesso
  a função fecha só a `page` e conta o PDF; **no erro fecha o navegador** (como a proposta) — aba
  pendurada contamina os seguintes. Risco pré-existente, agora com dois chamadores (B32): a
  reciclagem não é serializada — se A está em `page.pdf` quando B dispara a reciclagem, A morre com
  "Target closed"; fila/mutex é etapa própria.
- Colateral medido (letra A): `GET /api/propostas/:id/pdf` **não tem `authenticateToken`**
  (`index.js:9954-9955`) — não é desta etapa, mas é um furo a fechar.
- Letra A desta etapa: o seed tem `empresa_cnpj/cep/telefone/email = ''`; o André preenche
  Configurações → Geral → Empresa (incluindo a IE `799.890.695.115`, hoje fixa em
  `propostaPremiumV2.js:1541-1545`) antes de emitir o primeiro pedido — senão o cabeçalho sai com "—".
- O `thead` repetido em pedido de 40 itens **não é afirmado por teste** (o harness não chama o
  Chromium); a prova é o curl da T3 com um pedido longo.
- `authenticateToken` + `checkModulePermission` em `routes/compras.js` já vêm injetados; o
  `fakeCheckModulePermission` do harness é no-op (403 não é testável — provar 401 e leitura).
- `nomeArquivoDoCabecalho` do client espera `filename` ou `filename*`; usar o mesmo formato da proposta.
- O logo em base64 pesa ~dezenas de kB por PDF — aceitável (a proposta faz igual).
- Puppeteer no Windows do André já funciona (proposta); no harness nunca é chamado.

## Prova real (T3)
- Servidor em `CRM_DATA_DIR` vazio, pedido de 45 itens criado pela API, `curl` com Bearer: 200
  `application/pdf`, `attachment; filename="pedido-compra-PC-….pdf"`, `Access-Control-Expose-Headers`
  presente, `%PDF-1.4`, 272 kB, **3 folhas**. Conferido visualmente: cabeçalho da tabela repetido
  nas folhas 2 e 3, rodapé "Folha X/3 · Impresso por Administrador em …" em todas, totais e
  assinaturas na última. Achado visual corrigido: número `PC-…` quebrava no hífen e a emissão
  quebrava a hora (`6e5267b6`, conferido no render do Chromium).
- Primeiro boot em pasta vazia: 0 "no such table|no column named"; as 2 chaves nascem com
  categoria `empresa`.

## Retro
- Rodadas de correção até verde: **1** (onda única da revisão). Os dois executores originais
  morreram por limite de API e foram retomados.
- Achados da revisão: **2 bugs reais** (unitário cortado em 4 casas não fechava a linha — **a RN-78.03
  do plano estava errada**; desconto com dois valores no mesmo papel), 1 cosmético real (CEP
  escapado duas vezes), 1 visual achado na prova real (cabeçalho), 1 plausível tratado
  (`revokeObjectURL` síncrono), 1 decisão registrada (B33). 7 lacunas de teste → 4 fechadas com
  controle positivo; a do gate de módulo não é testável no harness (no-op) e a do clique mockado
  ficou.
- Paralelismo: **2 galhos** (servidor e client em worktrees) contra contrato congelado; nenhum
  retrabalho entre eles.
- Defeito escapado: preencher na etapa seguinte.

## Próxima tarefa detalhada — Etapa 79: o PDF da proposta exige login (A5)
- **O furo:** `GET /api/propostas/:id/pdf` em `server/index.js` (perto de `:9954`; procure a
  string da rota) **não tem `authenticateToken`** — qualquer um com o id baixa a proposta comercial
  (preços, cliente).
- **Antes de mudar, medir quem chama:** `grep -rn "propostas/.*pdf" client/src` — se o client abre
  por `window.open`/`<a href>` (sem header), pôr o middleware quebra o botão. Nesse caso trocar o
  client para o padrão desta etapa (`api.get(..., { responseType: 'blob' })` + `<a download>`,
  como `client/src/utils/baixarDocumentoPedido.js`), **nunca** `?token=` na URL.
- Teste de rota: 401 sem token; 200 `application/pdf` com token (fake de PDF no harness, como o
  `gerarPdfDeHtml` do `testApp.js`, se a rota for extraível; senão provar só o 401 e registrar).
- Registrar na letra B do doc de novidades o que foi escolhido (ex.: também exigir o módulo
  comercial?) e o que foi descartado.
