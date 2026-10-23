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
