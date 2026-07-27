# Template de Proposta V2 — Arquitetura

**Arquivo:** `server/templates/propostaPremiumV2.js`
**Exports:** `gerarHTMLPropostaPremiumV2(proposta, itens, totais, opts)` e `substituirPlaceholdersProposta(html, proposta, itens, totais)`
**Dependências:** `../config/paths`, `../propostaCompositionEngine`, `../clausulasDefault`

---

## Como é chamado

Em `server/index.js`:
- `GET /api/propostas/:id/premium` → chama `gerarHTMLPropostaPremiumV2` e devolve o HTML
- `GET /api/propostas/:id/pdf` → chama a mesma função e passa o HTML para o Puppeteer gerar PDF

---

## Estrutura do HTML gerado

```
<body>
  [printBar]          ← barra de ações visível só no browser (escondida no @media print)
  <div #proposalDocument>
    <section .proposal-page .cover-page>   ← Página 1: capa (estática, sem header/footer)
    <section .proposal-page>               ← Página 2: apresentação da empresa (estática)
    <section .proposal-page #proposalPageTemplate style="display:none">  ← template do paginador
  </div>
  <div #proposalSource style="display:none">  ← conteúdo fonte do paginador
    [blocksHtml]
  </div>
  <script>(function(){ /* paginador */ })()</script>
</body>
```

### Páginas estáticas (não passam pelo paginador)
- **Capa** (`.cover-page`): hero image full-width + barra de logos + faixa azul + área info do cliente
- **Apresentação** (página 2): header/footer padrão + grid texto/fotos

### Páginas geradas pelo paginador
O paginador lê filhos diretos de `#proposalSource`, clona `#proposalPageTemplate` e distribui os blocos entre páginas conforme altura disponível (297mm − 28mm header − 20mm footer = 249mm).

---

## blocksHtml — seções em ordem

| Nº | Seção | Tipo |
|---|---|---|
| — | DADOS DA CONTRATADA | imagem base64 (`dadosContratadaB64`) |
| 1 | OBJETIVO DA PROPOSTA | texto fixo |
| 2 | ELABORAÇÃO DA PROPOSTA | texto fixo |
| 3 | OFERTA | tabela dinâmica (`ofertaRows`) |
| 4 | ESCOPO DE FORNECIMENTO | gerado de `equipItems` (array por item) |
| 5+ | CONDIÇÕES GERAIS | cláusulas (customizadas ou padrão de `clausulasDefault.js`) |
| — | ASSINATURAS | bloco fixo |

---

## Classes CSS principais

### Layout de página
| Classe | Descrição |
|---|---|
| `.proposal-page` | Página A4 fixa: `width: 210mm; height: 297mm; flex-shrink: 0; overflow: hidden` |
| `.page-header` | Cabeçalho 28mm: dual-logo GMP + Moinho Ypiranga + nº proposta |
| `.page-content` | Área de conteúdo com `flex: 1 1 auto; padding: 10mm 14mm; overflow: hidden` |
| `.page-footer` | Rodapé 20mm: dados da empresa + número de página |

### Capa
| Classe | Descrição |
|---|---|
| `.cover-page` | Flex column, sem header/footer padrão |
| `.cover-hero` | Imagem `industria40.png` — altura controlável pelo usuário |
| `.cover-logos-bar` | Barra branca dividida: GMP (`.cover-logo-half`) \| Moinho Ypiranga (`.cover-logo-half`) |
| `.cover-blue-strip` | Faixa azul `var(--blue-900)` com título da proposta |
| `.cover-info-area` | `flex: 1 1 auto; justify-content: flex-start` — título, nº proposta, dados do cliente |
| `.cover-field-*` | Classes individuais por campo: `contratante`, `cnpj`, `email`, `emissao` |
| `.cover-client-info` | Container dos `<p>` com os campos `data-edit` |

### Conteúdo
| Classe | Descrição |
|---|---|
| `.avoid-break` | Mantém o bloco inteiro na mesma página (não quebra) |
| `.allow-break` | Permite quebra de página dentro do bloco |
| `.equip-specs-kv` | Dados técnicos do equipamento em formato chave-valor (sem tabela) |
| `.equip-descritivo` | Descritivo técnico indentado abaixo das especificações |

### Visualização no browser
| Classe | Descrição |
|---|---|
| `@media screen` | Fundo cinza `#d0d7de`, gap 16px entre páginas, sombra nas páginas |
| `@media print` | Sem sombra, sem gap, sem printbar |

---

## Campos editáveis (`data-edit`)

Os `<span data-edit="campo">` na **capa** são gerados diretamente no HTML pelo servidor. O React (`PropostaPreviewEditavel.js`) aplica `contentEditable`, outline amarelo e cursor text via `ativarEdicao()` no `onLoad` do iframe.

Todos os `[data-edit]` têm `display: inline-block; min-width: 60px; cursor: text` via CSS — clicáveis mesmo quando vazios.

Fallback padrão: `—` quando o campo está vazio (evita span invisível).

---

## Paginador (IIFE no `<script>`)

- Lê `Array.from(source.children)` — apenas filhos **diretos** de `#proposalSource`
- Cria páginas clonando `#proposalPageTemplate` e anexando a `#proposalDocument` via `appendChild`
- `avoid-break`: o bloco inteiro é movido para a próxima página se não couber
- `allow-break`: tabelas com `data-split-table="true"` são divididas linha a linha
- `data-page-break="before"`: fecha a página corrente ANTES de posicionar o bloco (seções 4 e 5, 5.23, 5.24)
- `data-page-break-after="true"`: fecha a página DEPOIS de posicionar o bloco, para que ele seja
  dono exclusivo dela — usado pela tabela DADOS DA CONTRATADA (ver abaixo)
- Após distribuir, conta `.proposal-page:not([style*="none"])` e preenche `js-page-number` / `js-page-count`

### Posse de página não pode depender de altura de imagem

A paginação mede o DOM. No preview os assets vêm por **URL** (não base64), então um `<img>` sem
`width`/`height` mede **0px** até os bytes chegarem — e permanece 0px se a URL 404. O bloco então
"cabe" numa fração da página e o paginador puxa os blocos seguintes para junto dele; quando a
imagem materializa a altura real, esse conteúdo é empurrado para baixo do rodapé e o
`overflow:hidden` da página o corta silenciosamente.

Foi o bug da proposta 87 (27/07/2026): as seções 1–4 iam parar na página da tabela DADOS DA
CONTRATADA e o documento parecia pular da seção 1 direto para a 5. Duas defesas, ambas necessárias:

1. `dimensoesImg()` lê largura/altura do IHDR do PNG e emite `width`/`height` no `<img>`, então o
   espaço é reservado já na primeira medição — inclusive com a imagem ausente.
2. O bloco usa `data-page-break-after="true"`, tornando a posse da página **estrutural** em vez de
   consequência da altura medida.

Travado por `server/tests/propostaTabelaContratadaPaginaPropria.test.js`, que roda os três estados
da imagem (presente, 404 e chegando depois da paginação) e exige o mesmo layout nos três.

---

## Cabeçalho e rodapé — sempre montados (sem imagem)

O template **não** suporta mais cabeçalho/rodapé por imagem. As colunas `header_image_url` e
`footer_image_url` de `proposta_template_config` continuam existindo (dados legados), mas são
ignoradas pelo template, e os campos de upload saíram da tela de configuração.

**Motivo (bug de produção, 24/07/2026):** quando a imagem existia no disco, o template aplicava
`display:none` no `.page-header-inner` inteiro — e o `Nº da proposta` só existe lá dentro. Produção
usava uma imagem legada (`header_1773852005478_CBC2.png`, branding CBC2 anterior ao redesign do
modelo DOCX) e saía sem número em toda proposta. No ambiente local o mesmo registro parecia correto
porque o arquivo não existe fora do volume de produção (o backup do banco não traz `uploads/`),
então caía no fallback do cabeçalho padrão.

Travado por `server/tests/propostaHeaderPadraoSempre.test.js`, que roda com arquivos de imagem
reais no disco — a condição exata em que o bug aparecia.

## Imagens de proposta

Ficam em `server/assets/proposta/` (dentro do `server/`, portanto copiadas para a imagem Docker
pelo `COPY server/ ./server/`) e são servidas por `/api/assets/proposta/*`.

### Formato por caminho: WebP no preview, JPEG no PDF

Cada caminho usa o formato bom para ele, porque os dois têm gargalos opostos:

| | preview (URL) | PDF (base64) |
|---|---|---|
| gargalo | bytes na rede | como o Chrome grava a imagem no PDF |
| formato | **WebP** (mais leve na rede) | **JPEG** (copiado 1:1, filtro `DCTDecode`) |

O Chrome copia um JPEG para dentro do PDF sem tocar nos bytes, mas **WebP e PNG ele decodifica e
regrava como bitmap comprimido em Flate** — que não comprime foto. Medido antes da correção:
`industria40.webp` 123 KB no disco → **1161 KB** dentro do PDF (9,4×); `projetos.webp` 45 KB →
**712 KB** (15,9×). Essas duas sozinhas eram 1,87 MB dos 2,44 MB do arquivo; com os gêmeos `.jpg`
o PDF caiu para **0,80 MB**.

`versaoParaPdf()` faz isso automaticamente: com `forPdfServer`, se existir um `<nome>.jpg` ao lado
do `.webp`/`.png`, ele é usado. Logo, **para aliviar o PDF basta colocar o gêmeo `.jpg` na pasta** —
nenhuma mudança de código.

**Não crie gêmeo `.jpg` para logo** (`logo-gmp*.png`, `logo-moinho-ypiranga.png`): eles dependem de
transparência e ganhariam fundo sólido. Também não vale para `dados-contratada.png`, que é cor
chapada com texto — Flate já a comprime bem (99 KB) e JPEG borraria as letras.

Travado por `server/tests/propostaPdfPesoImagens.test.js` (formato por caminho + teto de peso do
PDF gerado de fato).

| Arquivo | Uso |
|---|---|
| `logo-gmp.png` | Header das páginas internas |
| `logo-moinho-ypiranga.png` | Header das páginas internas |
| `logo-gmp-grande.png` | Capa (`.cover-logo-half` esquerda) |
| `dados-contratada.png` | Seção "DADOS DA CONTRATADA" no blocksHtml |
| `fabrica-gmp.jpeg` | Página de apresentação (foto da fábrica) |
| `industria40.png` | Capa (`.cover-hero`) + página de apresentação |

---

## Variáveis CSS

```css
--blue-900: #0b3a66   /* azul escuro principal */
--blue-700: #1a4d7a
--blue-100: #e8f2fb
--ink: #1a1a1a        /* cor de texto padrão */
--muted: ...          /* texto secundário */
--line: rgba(26,77,122,0.45)
```
