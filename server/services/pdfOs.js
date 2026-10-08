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

/** Rodape da OS: "Pagina X de Y", centralizado, cinza, 8px (o texto antigo era 8pt #999). */
function rodapePaginasOs() {
  return '<div style="width:100%; text-align:center; font-family: \'Segoe UI\', Tahoma, Geneva, Verdana, sans-serif; '
    + 'font-size: 8px; color: #999;">'
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

module.exports = { MARGEM_INFERIOR_OS_MM, CSS_PAGE_OS, rodapePaginasOs, opcoesPdfOs };
