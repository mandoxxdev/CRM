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

// ── Fix-round da Fase 5 da 186 (M-c) — numero no papel ─────────────────────────────────────────────────────────────────────────────────
// Antes o numero ia cru (`String(Number(v))`): o ruido de ponto flutuante (`0.1 + 0.2`) virava `0.30000000000000004`, que numa coluna de 19 mm
// quebrava em `0.300000000` / `00000004` — e duas linhas de algarismos parecem DOIS numeros num papel que o cliente confere. Agora: o
// formato das telas do modulo que mostram quantidade (`formatNum` de Alertas, Nao conformidades, Reposicao e Relatorios: pt-BR, ate 4 casas)
// e, na tabela, o numero NUNCA quebra — encolhe a fonte ate caber (`fonteQueCabe`).

/** Quantidade como as telas do modulo mostram: pt-BR, ate 4 casas (`0.1 + 0.2` -> `0,3`; `99999.125` -> `99.999,125`). Vazio/ilegivel -> `0`. */
export function formatarQuantidade(v) {
  const n = Number(v);
  const s = (Number.isFinite(n) ? n : 0).toLocaleString('pt-BR', { maximumFractionDigits: 4 });
  // `-0.000001` arredonda para `-0`; um negativo que vira zero e zero (arredondar antes, `Math.round(n * 1e4)`, desvia numero grande)
  return /^-0(,0*)?$/.test(s) ? '0' : s;
}

/**
 * A maior fonte, de `fonte` descendo de 1 em 1 ate `minima`, em que `texto` cabe numa linha so de `largura`; `null` se nem a `minima` cabe.
 * Mede pelo splitTextToSize (sem getTextWidth — RN-186.11: o FakePdf da tela nao tem). Espera o `pdf` em `fonte` e o devolve em `fonte`.
 */
export function fonteQueCabe(pdf, texto, largura, fonte, minima = 6) {
  if (linhasPorLargura(pdf, texto, largura).length === 1) return fonte;
  let achada = null;
  for (let f = fonte - 1; f >= minima && achada === null; f -= 1) {
    pdf.setFontSize(f);
    if (linhasPorLargura(pdf, texto, largura).length === 1) achada = f;
  }
  pdf.setFontSize(fonte);
  return achada;
}

/**
 * Como `quebrarCelulas`, mas as colunas de `numericas` nao quebram: o numero que nao cabe em `util[i]` na `fonte` encolhe (`fonteQueCabe`);
 * so quebra (na `fonte`, nada perdido) se nem a `minima` couber. Devolve `{ linhas, fontes }` — `fontes[i]` e a fonte da celula i.
 */
export function prepararCelulas(pdf, celulas, util, { numericas = [], fonte, minima = 6 }) {
  const fontes = celulas.map(() => fonte);
  const linhas = celulas.map((c, i) => {
    if (numericas.includes(i)) {
      const f = fonteQueCabe(pdf, String(c ?? ''), util[i], fonte, minima);
      if (f !== null) { fontes[i] = f; return [String(c ?? '')]; }
    }
    return linhasPorLargura(pdf, c, util[i]);
  });
  return { linhas, fontes };
}

/** `desenharCelulas` com uma fonte por celula (`prepararCelulas`): a celula numa fonte menor e desenhada nela e a `fonte` volta. */
export function desenharCelulasComFonte(pdf, { linhas, fontes }, colunas, y, passo, fonte) {
  let n = 1;
  linhas.forEach((ls, i) => {
    const outra = fontes[i] !== fonte;
    if (outra) pdf.setFontSize(fontes[i]);
    ls.forEach((linha, j) => pdf.text(linha, colunas[i], y + passo * j));
    if (outra) pdf.setFontSize(fonte);
    n = Math.max(n, ls.length);
  });
  return n;
}
