# Etapa 87 — o PDF da OS entra na fila do Chromium compartilhado (B35)

> Origem: próxima tarefa do plano da 86 (fora do escopo da 80, B35). Baseline (`c76efc04`):
> `test:api` 308/308; client 93 suítes / 1382 testes; build limpo.

## Fase 0 — medição (2026-10-08, HEAD `c76efc04`)
- `POST /api/operacional/ordens-servico/:id/gerar-pdf` — `server/index.js:21362-21991` (o plano da 86
  dizia `~:21444`; as linhas andaram). Carrega OS/cliente/projeto/responsável/proposta e os itens;
  **imagens viram data URL antes do navegador** (disco em `uploadsProdutosDir`, ou fetch HTTP ao próprio
  servidor com 5 s, `:21667-21763`); `gerarHTMLOS` (`:13627`) embute o logo em base64 (`:13661-13668`),
  sem `<script>`, `<link>`, `url()` nem web font; `@page { size: A4; margin: 0 }`.
- Navegador **próprio**: `puppeteer.launch` (`:21791-21800`, sem `protocolTimeout`), viewport 1200×1600
  DSF 2 (`:21816`), `setRequestInterception` (`:21826-21846`) que **não faz nada útil** (a URL do
  request já é absoluta; só loga), `setContent` com `networkidle0` (`:21850`), espera de imagens com
  `img.onload=` de 10 s cada (`:21862-21895`, sobrescreve o `onerror` inline), **sleep fixo de 2 s**
  (`:21899`), `page.pdf({ format:'A4', printBackground:true, margin 15mm ×4, preferCSSPageSize:true,
  displayHeaderFooter:false, scale:1.0 })` (`:21907-21919`), cinco caminhos de `browser.close`.
  Depois: grava o arquivo (`:21934-21940`), `UPDATE ordens_servico SET pdf_url` (`:21943-21953`),
  responde `{ success, pdf_url, message }`.
- Fila (Etapa 80): `enfileirarPdf` (`:328`), `obterNavegadorPdf` (`:353`, único `launch` com
  `protocolTimeout: 60000`), `fecharNavegadorPdf` (`:343`), bloco da proposta (`:10245-10323`) como modelo.
  Régua `filaPdfFiacao.api.test.js`: 3 blocos, `obterNavegadorPdf` ×2, `fecharNavegadorPdf` ×4,
  `agendarFechamentoOcioso` ×2, `page.pdf` 3 no arquivo / 2 na fila (a OS excluída por comentário).
- `gerarPdfDeHtml` (Etapa 78) **não serve sem mudar** (DSF 1, `displayHeaderFooter: true`, margem 12 mm) —
  mexer nele afetaria o PDF do pedido de compra; a OS ganha bloco próprio na fila.
- Client: `OSDetalhesForm.js:248-283` (abre a aba, `api.post` com timeout de 30 s, usa só `pdf_url`
  verdadeiro e depois baixa pelo `GET /:id/pdf`); `OSComercialForm.js:270-281` (dispara e esquece).
  Nenhum teste de servidor chama o `gerar-pdf`.

## Decisão (B42)
Bloco próprio `enfileirarPdf(async () => …)` na rota da OS, no modelo da proposta, com **as mesmas
opções de `page.pdf` e de viewport** (DSF 2); saem a interceptação, o `networkidle0`, o sleep de 2 s e
os timers de 10 s (trocados por `document.fonts.ready` + imagens por `addEventListener` + dois quadros).
Descartado: chamar `gerarPdfDeHtml` com overrides (mexe no PDF do pedido); manter as esperas fixas.

## Regras
- **RN-87.01** A geração do PDF da OS usa `obterNavegadorPdf` dentro de `enfileirarPdf`; erro dentro da
  tarefa → `fecharNavegadorPdf('erro na geração')` e relança. Nenhum `puppeteer.launch` fora de
  `obterNavegadorPdf`; nenhum `browser.close(` no arquivo.
- **RN-87.02** Saída igual: mesmas opções de `page.pdf` e viewport; carregamento de dados, imagens em
  base64 (inclusive o fetch ao próprio servidor) e `gerarHTMLOS` **antes** da fila; arquivo, `UPDATE` e
  resposta **depois** (fora da fila). Contrato da resposta e do erro (500 `{ error: 'Erro ao gerar PDF', … }`)
  inalterados.
- **RN-87.03** Log com `fila=<ms>` e tempos por passo, como a proposta.

## Tasks
> **Estado (2026-10-08): T1 FEITA** em `b69a8ffc` (rota da OS na fila + régua). Régua
> `filaPdfFiacao` 12/12; contra o código antigo **6 falhas** (blocos 3≠4, obter 2≠3, fechar 4≠5,
> page.pdf 2≠3, `puppeteer.launch(` 2≠1, 0 blocos na rota da OS). Controles positivos (sabotagem por
> Edit, restaurada por Edit, 0 CR): `puppeteer.launch` de volta na rota → vermelho (RN-87.01);
> `fecharNavegadorPdf` no catch externo → vermelho (fechar 6≠5, linha FORA); `writeFileSync` dentro
> do bloco → vermelho ("segura a fila"). Suítes: `test:api` **308/308**, `test:almoxarifado` 44/0,
> `test:validation` 4/0, `test:safealter` 3/0, `test:sqlite` 5/0. Client intocado.
>
> **Prova real** (`CRM_DATA_DIR` vazio no scratchpad, porta 5985, mesmo banco antes/depois; cliente,
> 3 produtos — o 1 com imagem PNG enviada por `POST /produtos/:id/imagem` —, OS com 3 itens):
>
> | | antes (Chromium próprio) | depois (fila) |
> |---|---|---|
> | `gerar-pdf` (3 seguidas) | 4941 / 4676 / 4674 ms | 696 (abriu) / 482 / 453 ms |
> | páginas (`/Type /Page`) | 3 | 3 |
> | tamanho | 614379 bytes | 614379 bytes |
> | streams descomprimidos | — | **363/363 idênticos** |
> | texto (`pdftotext -layout`) | 65 linhas | idêntico (`diff` vazio) |
>
> Fora `CreationDate`/`ModDate`, os arquivos são byte a byte iguais — por isso não foi preciso
> renderizar as páginas como imagem (não há `pdftoppm` na máquina; registrado). Log do depois:
> `fila=0ms navegador(reuso)=0ms novaAba=20ms carregarHTML=9ms fontes+imagens=41ms renderizarPDF=363ms`.
> **Concorrência** (servidor reiniciado a frio; 3 rodadas de `GET /propostas/:id/pdf` + `POST gerar-pdf`
> da OS simultâneos): 6/6 **200** (proposta `%PDF` 827914 bytes); a proposta esperou na fila atrás
> da OS (`fila=689/443/458ms`) e reusou o navegador que a OS abriu; Chromium raiz do servidor
> (`Get-CimInstance`, `--headless` + `\.cache\puppeteer\`, sem `--type=`, a cada 150 ms): **máx 1**
> em 72 amostras (controle: o amostrador viu 1 com o navegador aquecido e 0 com o servidor morto).
> Observação fora do escopo (igual antes e depois): o cabeçalho do PDF mostra "Cliente: CLI (ID: 1)"
> em vez da razão social.

**T1 (única):** RN-87.01–03; régua `filaPdfFiacao.api.test.js` atualizada (4 blocos, `obterNavegadorPdf`
×3, `fecharNavegadorPdf` ×5 com 1 no corpo do `obterNavegadorPdf`, `agendarFechamentoOcioso` ×3, `page.pdf`
3/3 na fila sem o comentário de exclusão; novos: um único `puppeteer.launch(` e dentro do
`obterNavegadorPdf`; nenhum `browser.close(`; `writeFileSync`/`UPDATE ordens_servico SET pdf_url`/`res.json`
fora dos blocos). Controles positivos. **Prova real (obrigatória):** servidor em `CRM_DATA_DIR` vazio, com
uma OS com 3+ itens (um com imagem de produto): gerar o PDF **antes** (código atual) e **depois** —
comparar páginas, tamanho e texto (e ver as duas primeiras páginas como imagem, se houver como
renderizar; senão registrar); depois PDF de proposta + PDF da OS concorrentes → ambos 200 e no máximo 1
Chromium raiz do servidor (contagem por `Get-CimInstance Win32_Process`, como na 80).

## Pontos de atenção
- Revisão do plano (Fase 2) feita junto com a revisão do código: a medição acima já é a da varredura
  dedicada; registrado para não parecer esquecimento.
- A OS agora espera na fila atrás dos outros PDFs; o client dá 30 s. Deve ficar **mais rápida** (sem
  `launch` ~2 s, sem sleep de 2 s, sem `networkidle0`).
- Fora do escopo: `numero_os` com `"` quebra o nome do arquivo no Windows; a rota não tem
  `checkModulePermission`.
