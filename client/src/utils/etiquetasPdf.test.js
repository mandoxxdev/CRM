jest.mock('jspdf', () => {
  const instancias = [];
  function jsPDFMock(opts) {
    const doc = { opts };
    doc.addPage = jest.fn().mockReturnValue(doc);
    doc.setFont = jest.fn().mockReturnValue(doc);
    doc.setFontSize = jest.fn().mockReturnValue(doc);
    doc.text = jest.fn().mockReturnValue(doc);
    doc.addImage = jest.fn().mockReturnValue(doc);
    doc.save = jest.fn().mockReturnValue(doc);
    doc.setLineDashPattern = jest.fn().mockReturnValue(doc);
    doc.rect = jest.fn().mockReturnValue(doc);
    doc.setDrawColor = jest.fn().mockReturnValue(doc);
    doc.splitTextToSize = jest.fn((t) => [t]);
    instancias.push(doc);
    return doc;
  }
  jsPDFMock.__instancias = instancias;
  return { __esModule: true, default: jsPDFMock };
});
jest.mock('qrcode', () => ({
  __esModule: true,
  default: { toDataURL: jest.fn().mockResolvedValue('data:image/png;base64,QQ==') },
}));

import {
  FORMATOS_ETIQUETA, montarEtiquetaMaterial, montarEtiquetaLote,
  montarEtiquetaSerie, montarEtiquetasDoRecebimento, gerarEtiquetasPDF,
} from './etiquetasPdf';

const ORIGIN = 'https://crm.gmp.ind.br';
const MAT_SIMPLES = { id: 7, codigo: 'MAT-7', nome: 'Parafuso M8', controle_lote: 0, controle_serie: 0 };
const MAT_LOTE = { id: 8, codigo: 'MAT-8', nome: 'Chapa Inox 304 3mm 1200x3000 certificada', controle_lote: 1, controle_serie: 0 };
const MAT_SERIE = { id: 9, codigo: 'MAT-9', nome: 'Motor 5cv', controle_lote: 0, controle_serie: 1 };

describe('montadores de etiqueta', () => {
  test('material simples: codigo/nome e QR para a lista de materiais', () => {
    const e = montarEtiquetaMaterial(MAT_SIMPLES, ORIGIN);
    expect(e).toEqual({
      codigo: 'MAT-7', nome: 'Parafuso M8', linhaControle: '',
      qrUrl: `${ORIGIN}/almoxarifado/materiais?material_id=7`,
    });
  });

  test('lote: linha com codigo e validade formatada + QR com aba e destaque', () => {
    const e = montarEtiquetaLote(MAT_LOTE, { codigo: 'L-24/07', data_validade: '2026-12-31' }, ORIGIN);
    expect(e.linhaControle).toBe('Lote L-24/07 · Val 31/12/2026');
    expect(e.qrUrl).toBe(`${ORIGIN}/almoxarifado/lotes?material_id=8&aba=LOTES&lote=${encodeURIComponent('L-24/07')}`);
  });

  test('lote sem validade omite a parte da validade', () => {
    const e = montarEtiquetaLote(MAT_LOTE, { codigo: 'L-1' }, ORIGIN);
    expect(e.linhaControle).toBe('Lote L-1');
  });

  test('serie: linha SN e QR com aba SERIES', () => {
    const e = montarEtiquetaSerie(MAT_SERIE, { numero: 'GMP-0042' }, ORIGIN);
    expect(e.linhaControle).toBe('SN: GMP-0042');
    expect(e.qrUrl).toBe(`${ORIGIN}/almoxarifado/lotes?material_id=9&aba=SERIES&serie=GMP-0042`);
  });
});

describe('montarEtiquetasDoRecebimento', () => {
  const MATERIAIS = [MAT_SIMPLES, MAT_LOTE, MAT_SERIE];
  test('item por serie gera 1 etiqueta por linha do texto series', () => {
    const itens = [{ material_id: 9, quantidade_recebida: 3, series: 'SN-1\nSN-2\n\nSN-3' }];
    const es = montarEtiquetasDoRecebimento(itens, MATERIAIS, ORIGIN);
    expect(es.map((e) => e.linhaControle)).toEqual(['SN: SN-1', 'SN: SN-2', 'SN: SN-3']);
  });
  test('item por lote gera 1 etiqueta do lote com a validade do item', () => {
    const itens = [{ material_id: 8, quantidade_recebida: 10, lote: 'L-9', data_validade_lote: '2027-01-05' }];
    const es = montarEtiquetasDoRecebimento(itens, MATERIAIS, ORIGIN);
    expect(es).toHaveLength(1);
    expect(es[0].linhaControle).toBe('Lote L-9 · Val 05/01/2027');
  });
  test('sem quantidade_recebida usa quantidade_esperada como fallback', () => {
    const itens = [{ material_id: 7, quantidade_esperada: 2 }];
    const es = montarEtiquetasDoRecebimento(itens, MATERIAIS, ORIGIN);
    expect(es).toHaveLength(1);
  });
  test('item sem controle gera etiqueta simples; qtd 0 fica fora; material desconhecido fica fora', () => {
    const itens = [
      { material_id: 7, quantidade_recebida: 5 },
      { material_id: 8, quantidade_recebida: 0, lote: 'L-X' },
      { material_id: 999, quantidade_recebida: 2 },
    ];
    const es = montarEtiquetasDoRecebimento(itens, MATERIAIS, ORIGIN);
    expect(es).toHaveLength(1);
    expect(es[0].codigo).toBe('MAT-7');
  });
});

describe('gerarEtiquetasPDF', () => {
  beforeEach(() => {
    require('jspdf').default.__instancias.length = 0;
    jest.clearAllMocks();
  });

  test('11 etiquetas em A4 (10 por pagina) geram 1 addPage e 11 addImage', async () => {
    const etiquetas = Array.from({ length: 11 }, (_, i) => ({
      codigo: `M-${i}`, nome: 'x', linhaControle: '', qrUrl: `u${i}`,
    }));
    await gerarEtiquetasPDF({ formato: 'A4_GRADE', etiquetas });
    const doc = require('jspdf').default.__instancias.at(-1);
    expect(doc.addPage).toHaveBeenCalledTimes(1);
    expect(doc.addImage).toHaveBeenCalledTimes(11);
    expect(doc.save).toHaveBeenCalledWith(expect.stringMatching(/^etiquetas-\d{4}-\d{2}-\d{2}\.pdf$/));
  });

  test('copias multiplica as etiquetas; termica cria 1 pagina por etiqueta', async () => {
    await gerarEtiquetasPDF({ formato: 'TERMICA_100x50', etiquetas: [{ codigo: 'M', nome: 'x', linhaControle: 'SN: 1', qrUrl: 'u' }], copias: 3 });
    const doc = require('jspdf').default.__instancias.at(-1);
    expect(doc.addPage).toHaveBeenCalledTimes(2); // 3 etiquetas, 1 por pagina, a 1a pagina ja existe
    expect(require('qrcode').default.toDataURL).toHaveBeenCalledWith('u', expect.any(Object));
  });

  test('formato desconhecido e lista vazia sao recusados', async () => {
    await expect(gerarEtiquetasPDF({ formato: 'INEXISTENTE', etiquetas: [{ codigo: 'M', nome: 'x', linhaControle: '', qrUrl: 'u' }] }))
      .rejects.toThrow(/formato de etiqueta desconhecido/);
    await expect(gerarEtiquetasPDF({ formato: 'A4_GRADE', etiquetas: [] }))
      .rejects.toThrow(/nenhuma etiqueta/);
  });
});
