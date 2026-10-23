/**
 * Etapa 186, T1 (RN-186.01, B1231) — o helper de quebra por largura que a remessa e a posicao do cliente usam.
 *
 * Sem jest.mock('jspdf'): um jsPDF REAL (A4, mm, Helvetica) mede. A medida e o que se testa — um mock que devolvesse `[t]` passaria
 * qualquer coisa. Para os `text`, um espiao fino grava [x, y, texto] e repassa.
 *
 * Executar: cd client && CI=true npx react-scripts test src/utils/pdfTexto --watchAll=false
 */
import {
  MARGEM_DIREITA, linhasPorLargura, utilDasColunas, quebrarCelulas, desenharCelulas, desenharQuebrado,
  formatarQuantidade, fonteQueCabe, prepararCelulas, desenharCelulasComFonte,
} from './pdfTexto';

// O carregamento do jsPDF no jsdom loga uma sonda de canvas no console.error — calado so durante o require (molde EpiAlmoxarifado.test.js).
let JsPdfReal;
{
  const erroOriginal = console.error;
  console.error = () => {};
  try { ({ jsPDF: JsPdfReal } = jest.requireActual('jspdf')); } finally { console.error = erroOriginal; }
}

const novoPdf = (fonte = 9) => {
  const pdf = new JsPdfReal({ format: 'a4', orientation: 'portrait', unit: 'mm' });
  pdf.setFontSize(fonte);
  return pdf;
};
const comEspiao = (pdf) => {
  const textos = [];
  const original = pdf.text.bind(pdf);
  pdf.text = (t, x, y, ...resto) => { textos.push([x, y, t]); return original(t, x, y, ...resto); };
  return textos;
};
const semEspacos = (s) => String(s).replace(/\s+/g, '');

const CODIGO_25 = 'EIXO-SAE1045-D50-L1200-RT';
const NOME_71 = 'Eixo usinado em aco SAE 1045 retificado diametro 50 mm comprimento 1200';
const W_120 = 'W'.repeat(120);
const CASOS = [[CODIGO_25, 33], [NOME_71, 77], [NOME_71, 51], [W_120, 77]];

describe('pdfTexto — linhasPorLargura', () => {
  test('[RN-186.01] cabe: cada linha, medida na fonte corrente, cabe na largura', () => {
    const pdf = novoPdf(9);
    for (const [texto, largura] of CASOS) {
      const linhas = linhasPorLargura(pdf, texto, largura);
      for (const l of linhas) expect(pdf.getTextWidth(l)).toBeLessThanOrEqual(largura);
    }
    // Metade positiva: quebrou de verdade (uma linha so com a largura respeitada seria corte).
    expect(linhasPorLargura(pdf, CODIGO_25, 33)).toHaveLength(2);
    expect(linhasPorLargura(pdf, W_120, 77)).toHaveLength(5);
  });

  test('[RN-186.01] nada perdido: a juncao sem espacos e o texto sem espacos', () => {
    const pdf = novoPdf(9);
    for (const [texto, largura] of [...CASOS, ['Maria  Aparecida', 20]]) {
      expect(semEspacos(linhasPorLargura(pdf, texto, largura).join(''))).toBe(semEspacos(texto));
    }
  });

  test('[RN-186.01] aparar: nenhuma linha termina em espaco e todas cabem (o splitTextToSize cru deixa 30,54 > 30)', () => {
    const pdf = novoPdf(9);
    const texto = '5wh5OcA0t japiucOIvi2s16Oms83ess-erx f9Otf5102mt8b2tewgIzj62zoi M5wwrIt';
    // A premissa (medida na Fase 0): cru, uma linha termina em espaco e passa de 30.
    expect(pdf.splitTextToSize(texto, 30).some((l) => / $/.test(l) && pdf.getTextWidth(l) > 30)).toBe(true);
    const linhas = linhasPorLargura(pdf, texto, 30);
    for (const l of linhas) {
      expect(l).not.toMatch(/\s$/);
      expect(pdf.getTextWidth(l)).toBeLessThanOrEqual(30);
    }
  });

  test('[RN-186.01] vazio: "", null e undefined dao uma linha vazia (a linha da tabela existe)', () => {
    const pdf = novoPdf(9);
    expect(linhasPorLargura(pdf, '', 30)).toEqual(['']);
    expect(linhasPorLargura(pdf, null, 30)).toEqual(['']);
    expect(linhasPorLargura(pdf, undefined, 30)).toEqual(['']);
  });

  test('[RN-186.01] fonte corrente: o mesmo texto em f14 da mais linhas que em f9', () => {
    const em9 = linhasPorLargura(novoPdf(9), W_120, 77).length;
    const em14 = linhasPorLargura(novoPdf(14), W_120, 77).length;
    expect(em14).toBeGreaterThan(em9);
  });

  test('[RN-186.01] largura invalida (M1 da Fase 2): 0, -1, NaN e Infinity lancam Error', () => {
    const pdf = novoPdf(9);
    for (const largura of [0, -1, NaN, Infinity]) {
      expect(() => linhasPorLargura(pdf, 'abc', largura)).toThrow(Error);
    }
  });
});

describe('pdfTexto — colunas e desenho', () => {
  test('MARGEM_DIREITA e 196 e utilDasColunas deixa 1 mm antes da proxima coluna', () => {
    expect(MARGEM_DIREITA).toBe(196);
    expect(utilDasColunas([14, 48, 126, 142, 166])).toEqual([33, 77, 15, 23, 30]);
    expect(utilDasColunas([14, 48, 144])).toEqual([33, 95, 52]);
  });

  test('quebrarCelulas + desenharCelulas: um `text` por linha, nunca array; devolve o maior numero de linhas', () => {
    const pdf = novoPdf(9);
    const textos = comEspiao(pdf);
    const linhas = quebrarCelulas(pdf, [CODIGO_25, 'Folha A4'], [33, 77]);
    expect(linhas).toEqual([['EIXO-SAE1045-D50-L', '1200-RT'], ['Folha A4']]);
    const n = desenharCelulas(pdf, linhas, [14, 48], 100);
    expect(n).toBe(2);
    expect(textos).toEqual([[14, 100, 'EIXO-SAE1045-D50-L'], [14, 104, '1200-RT'], [48, 100, 'Folha A4']]);
    expect(textos.every(([, , t]) => typeof t === 'string')).toBe(true);
  });

  test('desenharQuebrado: 2 linhas, passo 6, a partir de 18 -> devolve 30', () => {
    const pdf = novoPdf(14);
    const textos = comEspiao(pdf);
    const razao = 'Industria e Comercio de Equipamentos para Saneamento Basicos Ltda EPP';
    const y = desenharQuebrado(pdf, `Posição de materiais — ${razao}`, 14, 18, 182, 6);
    expect(textos).toHaveLength(2);
    expect(textos.map(([x, yy]) => [x, yy])).toEqual([[14, 18], [14, 24]]);
    expect(y).toBe(30);
    for (const [x, , t] of textos) expect(x + pdf.getTextWidth(t)).toBeLessThanOrEqual(196);
  });
});

// ── Fix-round da Fase 5 da 186 (M-c) — numero no papel ─────────────────────────────────────────────────────────────────────────────────
describe('pdfTexto — numero (fix-round da Fase 5, M-c)', () => {
  test('formatarQuantidade: pt-BR ate 4 casas, sem ruido de ponto flutuante nem -0', () => {
    expect(formatarQuantidade(0.1 + 0.2)).toBe('0,3');
    expect(formatarQuantidade(99999.125)).toBe('99.999,125');
    expect(formatarQuantidade(1.23456)).toBe('1,2346');
    expect(formatarQuantidade(-0.000001)).toBe('0');
    expect(formatarQuantidade(30)).toBe('30');
    expect(formatarQuantidade(null)).toBe('0');
    expect(formatarQuantidade('lixo')).toBe('0');
    expect(formatarQuantidade('1250.75')).toBe('1.250,75');
  });

  test('fonteQueCabe: a maior fonte em que cabe numa linha; null se nem a minima; o pdf volta na fonte de partida', () => {
    const pdf = novoPdf(9);
    expect(fonteQueCabe(pdf, '0,3', 19, 9)).toBe(9);
    const f = fonteQueCabe(pdf, '9.999.999.999,9999', 19, 9);
    expect(f).toBeLessThan(9);
    expect(f).toBeGreaterThanOrEqual(6);
    pdf.setFontSize(f);
    expect(pdf.getTextWidth('9.999.999.999,9999')).toBeLessThanOrEqual(19);
    // metade positiva da "maior": uma acima ja nao cabe
    pdf.setFontSize(f + 1);
    expect(pdf.getTextWidth('9.999.999.999,9999')).toBeGreaterThan(19);
    pdf.setFontSize(9);
    // a MAIOR, nao a primeira de baixo para cima: em 20 mm, 999.999.999,9999 cabe em f7 (19,7) e em f6 (16,9), nao em f8 (22,5)
    expect(fonteQueCabe(pdf, '999.999.999,9999', 20, 9)).toBe(7);
    expect(fonteQueCabe(pdf, '9'.repeat(40), 19, 9)).toBeNull();
    expect(pdf.getFontSize()).toBe(9);
  });

  test('prepararCelulas + desenharCelulasComFonte: so a coluna numerica encolhe; numero sem cabida nem na minima quebra (nada perdido)', () => {
    const pdf = novoPdf(9);
    const textos = comEspiao(pdf);
    const fontes = [];
    const setOriginal = pdf.setFontSize.bind(pdf);
    pdf.setFontSize = (f) => { fontes.push(f); return setOriginal(f); };
    const p = prepararCelulas(pdf, [NOME_71, '9.999.999.999,9999', '9'.repeat(40)], [51, 19, 19], { numericas: [1, 2], fonte: 9 });
    expect(p.linhas[0].length).toBeGreaterThan(1);
    expect(p.linhas[1]).toEqual(['9.999.999.999,9999']);
    expect(p.fontes[1]).toBeLessThan(9);
    expect(p.fontes[0]).toBe(9);
    expect(p.fontes[2]).toBe(9);
    expect(semEspacos(p.linhas[2].join(''))).toBe('9'.repeat(40));
    fontes.length = 0;
    const n = desenharCelulasComFonte(pdf, p, [14, 66, 86], 50, 4, 9);
    expect(n).toBe(Math.max(p.linhas[0].length, p.linhas[2].length));
    expect(fontes).toEqual([p.fontes[1], 9]);
    expect(textos.filter(([x]) => x === 66)).toEqual([[66, 50, '9.999.999.999,9999']]);
  });
});
