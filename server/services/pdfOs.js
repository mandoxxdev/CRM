/**
 * Etapa 88 (B43, RN-88.01..03) — rodape "Pagina X de Y" do PDF da OS pelo Puppeteer.
 *
 * Antes, `gerarHTMLOS` escrevia um `div` "Pagina 1 de N" no fim do HTML com N ESTIMADO pela
 * quantidade de itens (`ceil((itens + 5) / 20)`): a OS de 3 itens saia com 3 paginas e o texto
 * "Pagina 1 de 1" so na ultima; a de 12 itens, com 6 paginas e o mesmo "1 de 1".
 *
 * Agora o Chromium numera: `displayHeaderFooter: true` + `footerTemplate` com `pageNumber` /
 * `totalPages`. Duas armadilhas ja pagas na Etapa 78 (RN-78.05):
 *  - o template do rodape NAO herda o `<style>` do documento: estilo inline e `font-size` explicito;
 *  - com `preferCSSPageSize: true`, o `@page` do CSS prevalece sobre o `margin` do `page.pdf`.
 *    O `@page { margin: 0 }` antigo da OS apagaria o rodape — ele so aparece se a margem inferior
 *    existir no `@page`. Por isso o CSS do `@page` e as margens do `page.pdf` saem DAQUI, juntos.
 *
 * Margens: topo/laterais 0, como o `@page` antigo valia na pratica (os 15 mm do `page.pdf` eram
 * ignorados pelo `@page { margin: 0 }`); so a inferior ganha espaco para o rodape.
 */
const MARGEM_INFERIOR_OS_MM = 10;

const CSS_PAGE_OS = `@page {
      size: A4;
      margin: 0 0 ${MARGEM_INFERIOR_OS_MM}mm 0;
    }`;

/**
 * Rodape da OS: "Pagina X de Y", centralizado, cinza. 10px (~7,5pt): o texto antigo era 8pt; com
 * 8px (~6pt) o rodape do Chromium saia miudo demais (revisao da Etapa 88).
 */
function rodapePaginasOs() {
  return '<div style="width:100%; text-align:center; font-family: \'Segoe UI\', Tahoma, Geneva, Verdana, sans-serif; '
    + 'font-size: 10px; color: #999;">'
    + 'Página <span class="pageNumber"></span> de <span class="totalPages"></span>'
    + '</div>';
}

/** Opcoes do `page.pdf` da OS (usadas dentro da fila do Chromium, na rota gerar-pdf). */
function opcoesPdfOs() {
  return {
    format: 'A4',
    printBackground: true,
    margin: { top: '0mm', right: '0mm', bottom: `${MARGEM_INFERIOR_OS_MM}mm`, left: '0mm' },
    preferCSSPageSize: true,
    displayHeaderFooter: true,
    // Sem cabecalho explicito o Chromium imprime data + titulo no topo.
    headerTemplate: '<span></span>',
    footerTemplate: rodapePaginasOs(),
    scale: 1.0,
  };
}

/** Tamanho maximo da parte do numero no nome do arquivo (RN-89.01). */
const MAX_NUMERO_NOME_PDF_OS = 80;

/** Troca tudo fora de [A-Za-z0-9._-] por `_`, sem `.`/`_` nas pontas (acento perde so a marca). */
function sanearParteNome(valor) {
  return String(valor == null ? '' : valor)
    .normalize('NFD').replace(/\p{M}/gu, '')
    .replace(/[^A-Za-z0-9._-]+/g, '_')
    .replace(/^[._]+/, '')
    .slice(0, MAX_NUMERO_NOME_PDF_OS)
    .replace(/[._]+$/, '');
}

/**
 * Etapa 89 (B44, RN-89.01..02) — nome do arquivo do PDF da OS: `OS_<numero saneado>_<ms>.pdf`.
 *
 * O `numero_os` e texto livre. Cru no `path.join`, `/` ou `\` criavam pasta inexistente (ENOENT) e
 * `"`, `:`, `*`, `?`, `<`, `>`, `|` sao recusados pelo Windows — o PDF ja renderizado se perdia e o
 * usuario via 500. Saneia SO o nome do arquivo: o numero no banco e no documento nao muda. Sem
 * nada aproveitavel (vazio, null, so simbolos), usa o `id` da OS.
 */
function nomeArquivoPdfOs(numeroOs, id, agoraMs) {
  const numero = sanearParteNome(numeroOs);
  const parte = /[A-Za-z0-9]/.test(numero) ? numero : (sanearParteNome(id) || 'sem_numero');
  return `OS_${parte}_${Number(agoraMs) || 0}.pdf`;
}

module.exports = {
  MARGEM_INFERIOR_OS_MM, CSS_PAGE_OS, rodapePaginasOs, opcoesPdfOs, MAX_NUMERO_NOME_PDF_OS, nomeArquivoPdfOs,
};
