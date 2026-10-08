# Etapa 88 — rodapé "Página X de Y" certo no PDF da OS

> Origem: próxima tarefa do plano da 87. Baseline (`186274cf`): `test:api` 309/309; client 93
> suítes / 1382 testes; build limpo.

> **Estado (2026-10-08): T1 feita — `e445837e`.** `services/pdfOs.js` (novo) dá o `@page`
> (`margin: 0 0 10mm 0`) e as opções do `page.pdf` da OS (`displayHeaderFooter: true`,
> `headerTemplate: '<span></span>'`, `footerTemplate` inline 8px #999 centralizado "Página
> `pageNumber` de `totalPages`", margem inferior 10 mm = a do `@page`); `gerarHTMLOS` perdeu o
> `totalPages` estimado e o `div .page-number`; a rota chama `page.pdf(opcoesPdfOs())`.
> Topo/laterais ficaram 0 porque era o que valia na prática (o `@page { margin: 0 }` ignorava os
> 15 mm do `page.pdf`). Teste novo `pdfOsRodape.api.test.js` (6 ✓, com controle sintético);
> sabotagens → vermelho: div de volta, `displayHeaderFooter: false`, `@page margin: 0`, opções
> inline na rota — restauradas por Edit, LF. `filaPdfFiacao` 18/18 sem mudança (não pinava as
> opções). `test:api` 310/310; `test:almoxarifado` 44/44; validation 4, safealter 3, sqlite 5.
>
> **Prova real** (servidor na 5983, dados `c87-data`, `pdftotext -enc UTF-8 -layout`; PDFs no
> scratchpad `c88-os{3,12}-{antes,depois}.pdf`):
>
> | OS | Antes: páginas / rodapé | Depois: páginas / rodapé |
> |---|---|---|
> | 3 itens | 3 / "Página 1 de 1" só na pág. 3 (no meio do bloco Conferente/Responsável) | 3 / "Página 1 de 3", "2 de 3", "3 de 3" |
> | 12 itens | 6 / "Página 1 de 1" só na pág. 6 | 6 / "Página 1 de 6" … "6 de 6", uma por página |
>
> RN-88.02: mesmo total de páginas. Pág. 1 idêntica. Nas quebras, o cartão de item que antes era
> **cortado** no pé da página (título e "Quantidade" numa, tabela de especificações na outra)
> agora começa inteiro na página seguinte — a área útil perdeu os 10 mm do rodapé. Na grade do
> `pdftotext -lineprinter` o rodapé fica ~5 mm acima da borda e a última linha de conteúdo ~28 mm:
> sem sobreposição (a linha "MOTOR CENTRAL [kW] … Página 3 de 6" do `-layout` é só junção de
> linhas próximas). Obs.: a primeira subida do "depois" deu `SQLITE_READONLY` (subi logo após
> matar o servidor anterior); a segunda subida limpa gerou os PDFs.

## Fase 0 — o que existe (a T1 re-mede antes de mexer)
- `gerarHTMLOS` (`server/index.js:~13627`) escreve "Página 1 de 1" num `div` único no fim do HTML, com
  o total **estimado pela quantidade de itens** (não pelas páginas reais). O PDF de prova da 87
  (3 itens) tem **3 páginas** e o rodapé diz "Página 1 de 1", só na última.
- `page.pdf` da OS (bloco da fila, Etapa 87): `format: 'A4'`, `printBackground`, margens 15 mm,
  `preferCSSPageSize: true`, `displayHeaderFooter: false`, `scale: 1`; CSS `@page { size: A4; margin: 0 }`.
- Precedente: Etapa 78 (`server/routes/compras.js` + `gerarPdfDeHtml`) — rodapé do Puppeteer com
  `footerTemplate` e CSS **inline** com `font-size` explícito; `headerTemplate: '<span></span>'`. Lição
  registrada lá: `@page { margin: 0 }` no CSS **prevalece** sobre o `margin` do `page.pdf` e apaga o
  rodapé do Puppeteer.

## Decisão (B43)
Rodapé do Puppeteer em toda página ("Página X de Y", centralizado, cinza, 8 px, como o texto atual) e
o `div` estimado sai. Para o rodapé aparecer, a margem inferior tem de existir no `@page` do CSS da OS
(e as demais ficam como estão hoje na prática). Descartado: corrigir a estimativa por item (continua
estimativa); paginar em JS como a proposta (muito maior).

## Regras
- **RN-88.01** Cada página do PDF da OS mostra "Página X de Y" com X e Y reais.
- **RN-88.02** Fora o rodapé, o conteúdo não muda de lugar a ponto de criar ou perder páginas no PDF de
  prova da 87 (3 itens) — e num PDF de OS com muitos itens (ex.: 12) o total de páginas é o mesmo de
  antes ou a diferença é explicada.
- **RN-88.03** O `div` "Página N de M" do HTML sai; `gerarHTMLOS` não estima mais páginas.

## Tasks
**T1 (única):** medir o `@page`/margens atuais e o `div` do rodapé; implementar (CSS `@page` com margem
inferior compatível com o rodapé; `displayHeaderFooter: true`; `footerTemplate` com `pageNumber` /
`totalPages`; `headerTemplate` vazio); teste: o HTML não tem mais o "Página … de …" estimado (função pura
ou fonte), e a régua da 87 continua verde (opções do `page.pdf` da OS agora com o rodapé). **Prova real
antes/depois (obrigatória):** OS de 3 itens e OS de 12 itens, gerar antes e depois; `pdftotext -layout`
(existe no mingw64 do Git) — "Página 1 de 3", "Página 2 de 3", "Página 3 de 3" no depois; mesmo número
de páginas (ou diferença explicada); e deixar os PDFs no scratchpad para eu olhar as páginas.

## Pontos de atenção
- O rodapé do Puppeteer não herda o CSS do documento (lição da 78): estilo inline.
- `preferCSSPageSize: true` faz o `@page` mandar no tamanho/margem — testar de verdade, não supor.
