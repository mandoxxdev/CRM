// Etapa 186 (RN-186.01, B1231) — quebra de texto por LARGURA medida no jsPDF, compartilhada pelos PDFs da remessa a terceiros e da
// posicao do cliente. Antes, cada celula era cortada por CONTAGEM de letras (40 na remessa, 34/60 na posicao) sem olhar o papel: o codigo
// de EPI de 17 letras invadia a coluna vizinha e o nome do material perdia o fim — num papel que volta assinado pelo terceiro.
//
// POR QUE NAO IMPORTA NADA: a mesma conta mora privada em fichaEpiPdf.js (Etapa 185). Importar de la puxaria dataLocal,
// resolveMaterialPhotoUrl, epiEntrega e termoFerramenta para a remessa, e uma sabotagem da ficha derrubaria a suite da remessa (o
// acoplamento M5 da 185). Aqui o `pdf` vem por parametro e o arquivo fica sem imports.
//
// Diferente de `quebrarPorLargura` (fichaEpiPdf.js, B1207): aquela corta por LETRA, porque a juncao das linhas do aparelho tem de ser o
// texto gravado literal. Esta quebra por PALAVRA (splitTextToSize; palavra maior que a largura e partida por caractere) — nenhuma letra
// perdida, a quebra so come o espaco entre palavras.

export const MARGEM_DIREITA = 196;

/**
 * Linhas de `texto` que cabem em `largura`, medidas na FONTE CORRENTE do `pdf`. Cada linha e aparada a direita (emenda M1 da 185: o
 * splitTextToSize deixa um espaco no fim quando parte a palavra seguinte, e esse espaco passaria da coluna na medida). Vazio -> `['']`.
 * Largura nao finita ou <= 0 lanca (M1 da Fase 2 da 186): com NaN/Infinity o splitTextToSize devolve a linha inteira em silencio.
 */
export function linhasPorLargura(pdf, texto, largura) {
  if (!Number.isFinite(largura) || largura <= 0) {
    throw new Error(`linhasPorLargura: largura invalida (${largura})`);
  }
  return pdf.splitTextToSize(String(texto ?? ''), largura).map((s) => String(s).replace(/\s+$/, ''));
}

/** Largura util de cada coluna: ate 1 mm antes da proxima; a ultima ate a margem. */
export function utilDasColunas(colunas, margem = MARGEM_DIREITA) {
  return colunas.map((x, i) => (i < colunas.length - 1 ? colunas[i + 1] - 1 : margem) - x);
}

/** Uma lista de linhas por celula, na fonte corrente. */
export function quebrarCelulas(pdf, celulas, util) {
  return celulas.map((c, i) => linhasPorLargura(pdf, c, util[i]));
}

/** Desenha a linha j da celula i em (colunas[i], y + passo*j), um `text` por linha. Devolve o maior numero de linhas. */
export function desenharCelulas(pdf, linhasCelula, colunas, y, passo = 4) {
  let n = 1;
  linhasCelula.forEach((linhas, i) => {
    linhas.forEach((linha, j) => pdf.text(linha, colunas[i], y + passo * j));
    n = Math.max(n, linhas.length);
  });
  return n;
}

/** Desenha `texto` quebrado em `largura`, uma linha por `text`, avancando `passo` por linha. Devolve o y depois do bloco. */
export function desenharQuebrado(pdf, texto, x, y, largura, passo) {
  const linhas = linhasPorLargura(pdf, texto, largura);
  linhas.forEach((linha, j) => pdf.text(linha, x, y + passo * j));
  return y + passo * linhas.length;
}
