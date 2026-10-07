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
- **RN-78.03** Formatação: valores `pt-BR` com 2 casas; **valor unitário com 3 casas** (RN-12 da
  32: gravado com 4, impresso com 3); `% IPI` com 2; peso com 3; datas `DD/MM/AAAA`; campo vazio
  imprime "—". Sem nenhum `undefined`/`null`/`NaN` no HTML (teste varre a string).
- **RN-78.04** Empresa: `empresa_nome, cnpj, ie, endereco, cidade, estado, cep, telefone, email`
  lidos de `configuracoes` por `lerEmpresa(db)` (em `opcoesPedido.js`, que já lê 5 delas);
  **`empresa_ie`** e **`empresa_nota_pedido_compra`** nascem no seed (`INSERT OR IGNORE`, vazias) e
  aparecem em Configurações → Geral → Empresa (campo "Inscrição Estadual" e textarea "Nota legal do
  pedido de compra"). Chave vazia → "—" (IE) / bloco ausente (nota).
- **RN-78.05** PDF: A4 retrato, margens 12 mm, `printBackground`, `displayHeaderFooter` com
  `footerTemplate` "Folha ⟨pageNumber⟩/⟨totalPages⟩ · Impresso por ⟨usuário⟩ em ⟨DD/MM/AAAA HH:mm⟩";
  gerado pelo **mesmo Chromium** da proposta (`obterNavegadorPdf`), injetado em `routes/compras.js`
  pelo 5º argumento (`{ gerarPdfDeHtml }`); no harness, um `gerarPdfDeHtml` falso devolve um buffer
  com o HTML — o teste prova a fiação (status, headers, nome), não o Chromium.
- **RN-78.06** Client: botão **"Documento (PDF)"** na lista de pedidos (coluna de ações) e no
  formulário em edição (ao lado de Salvar); download por blob com o nome do cabeçalho; erro →
  toast com a mensagem do servidor. Na criação (sem id) o botão não existe.
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

**T1 — tronco (servidor):** `pedidoDocumentoHtml.js` (puro) + `server/tests/pedidoDocumentoHtml.test.js`
(runner próprio como os `proposta*.test.js`: blocos presentes com os dados do pedido 28433 dos
testes da 39; 3 casas no unitário; "—" nos vazios; nota ausente quando vazia; nenhum
`undefined|null|NaN` na string; ordem por `item_numero`; snapshot × cadastro imprimem o `fornecedor{}`
que receberam). `lerEmpresa` em `opcoesPedido.js` (+ `empresa` do `/opcoes` continua `{nome,
endereco}` — não mudar o shape que o form da 39 lê). Seed das 2 chaves em `index.js` (ao lado de
`:2263-2271`). Rotas em `routes/compras.js` (`/documento`, `/documento.pdf`) e a injeção
`gerarPdfDeHtml` no `index.js` (uma função que usa `obterNavegadorPdf` — **extrair** o trecho
`setContent → page.pdf` da rota da proposta para `server/services/pdfDeHtml.js`? só se a rota da
proposta puder usá-lo sem mudar comportamento; senão, função nova ao lado, sem tocar na proposta).
Teste de rota em `comprasPedidoDocumento.api.test.js` (HTML 200 com o número e o total; 404; 401;
PDF via fake → `application/pdf` + nome; harness: `testApp.js` passa `gerarPdfDeHtml` falso no 5º
argumento e cria a tabela `configuracoes` mínima para `lerEmpresa` — ou afirma o fallback).
**T2 — galho (client):** `Configuracoes.js` (2 campos novos na aba Empresa) + `Compras.js` (botão
na linha) + `PedidoCompraForm.js` (botão na edição) + testes (`Configuracoes.test.js`,
`Compras.test.js`/`PedidoCompraForm.test.js`: clique → `api.get('/compras/pedidos/7/documento.pdf',
{ responseType: 'blob' })` → `<a download>` com o nome do cabeçalho; erro → toast).
**T3 — integração/fechamento:** suíte inteira; **prova real do PDF** fora do harness: subir o
servidor (`CRM_DATA_DIR` de teste) e baixar `…/documento.pdf` de um pedido criado pela API com
`curl -H "Authorization: Bearer …"` → arquivo começa com `%PDF`, > 10 kB; registrar. Seção da
Etapa 78 no `docs/compras-novidades-por-etapa.md` (+ D-78, B26–B29); índice; renomear as menções
"Etapa 40" da 39 para "Etapa 78"; retro.

## Pontos de atenção
- O Chromium é compartilhado com a proposta (`obterNavegadorPdf` recicla após 20 PDFs): a função
  injetada **não** fecha o navegador; fecha só a `page`.
- `authenticateToken` + `checkModulePermission` em `routes/compras.js` já vêm injetados; o
  `fakeCheckModulePermission` do harness é no-op (403 não é testável — provar 401 e leitura).
- `nomeArquivoDoCabecalho` do client espera `filename` ou `filename*`; usar o mesmo formato da proposta.
- O logo em base64 pesa ~dezenas de kB por PDF — aceitável (a proposta faz igual).
- Puppeteer no Windows do André já funciona (proposta); no harness nunca é chamado.

## Retro (preencher no fechamento)
- Rodadas de correção até verde: _preencher_
- Achados da revisão: _preencher_
- Paralelismo: _preencher_
- Defeito escapado: preencher na etapa seguinte.
