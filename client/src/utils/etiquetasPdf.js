// Etapa 6c: etiquetas com QR. Montadores puros (testáveis sem DOM/PDF) + renderizador jspdf.
// O descritor { codigo, nome, linhaControle, qrUrl } é a moeda entre telas, modal e PDF.

import jsPDF from 'jspdf';
import QRCode from 'qrcode';

export const FORMATOS_ETIQUETA = {
  A4_GRADE: {
    label: 'Folha A4 (10 etiquetas por página)',
    page: { format: 'a4', orientation: 'portrait' },
    grade: { colunas: 2, linhas: 5, largura: 99, altura: 57, margemX: 6, margemY: 10.5 },
  },
  TERMICA_100x50: {
    label: 'Térmica 100×50 mm (1 por página)',
    page: { format: [100, 50], orientation: 'landscape' },
    grade: { colunas: 1, linhas: 1, largura: 100, altura: 50, margemX: 0, margemY: 0 },
  },
};

const formatDataBR = (iso) => {
  if (!iso) return '';
  const [y, m, d] = String(iso).slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
};

export function montarEtiquetaMaterial(material, origin) {
  return {
    codigo: material.codigo, nome: material.nome, linhaControle: '',
    qrUrl: `${origin}/almoxarifado/materiais?material_id=${material.id}`,
  };
}

export function montarEtiquetaLote(material, lote, origin) {
  const val = lote.data_validade ? ` · Val ${formatDataBR(lote.data_validade)}` : '';
  return {
    codigo: material.codigo, nome: material.nome,
    linhaControle: `Lote ${lote.codigo}${val}`,
    qrUrl: `${origin}/almoxarifado/lotes?material_id=${material.id}&aba=LOTES&lote=${encodeURIComponent(lote.codigo)}`,
  };
}

export function montarEtiquetaSerie(material, serie, origin) {
  return {
    codigo: material.codigo, nome: material.nome,
    linhaControle: `SN: ${serie.numero}`,
    qrUrl: `${origin}/almoxarifado/lotes?material_id=${material.id}&aba=SERIES&serie=${encodeURIComponent(serie.numero)}`,
  };
}

const linhasDeSeries = (txt) => String(txt || '').split(/\r?\n/).map((s) => s.trim()).filter(Boolean);

export function montarEtiquetasDoRecebimento(itens, materiais, origin) {
  const out = [];
  for (const item of itens || []) {
    const qtd = Number(item.quantidade_recebida || item.quantidade_esperada) || 0;
    if (qtd <= 0) continue;
    const m = (materiais || []).find((x) => x.id === item.material_id);
    if (!m) continue; // sem o material nao ha codigo/flags confiaveis para a etiqueta
    if (m.controle_serie === 1) {
      for (const numero of linhasDeSeries(item.series)) {
        out.push(montarEtiquetaSerie(m, { numero }, origin));
      }
    } else if (m.controle_lote === 1 && item.lote) {
      out.push(montarEtiquetaLote(m, { codigo: item.lote, data_validade: item.data_validade_lote }, origin));
    } else {
      out.push(montarEtiquetaMaterial(m, origin));
    }
  }
  return out;
}

/** Gera o PDF e dispara o download. copias > 1 repete cada etiqueta. */
export async function gerarEtiquetasPDF({ formato, etiquetas, copias = 1 }) {
  const cfg = FORMATOS_ETIQUETA[formato];
  if (!cfg) throw new Error(`formato de etiqueta desconhecido: ${formato}`);
  const lista = etiquetas.flatMap((e) => Array.from({ length: copias }, () => e));
  if (lista.length === 0) throw new Error('nenhuma etiqueta para gerar');

  // QRs primeiro (async) — o desenho e sincrono depois disso.
  const qrs = await Promise.all(
    lista.map((e) => QRCode.toDataURL(e.qrUrl, { margin: 0, width: 256 }))
  );

  const doc = new jsPDF({ orientation: cfg.page.orientation, unit: 'mm', format: cfg.page.format });
  const { colunas, linhas, largura, altura, margemX, margemY } = cfg.grade;
  const porPagina = colunas * linhas;
  const PAD = 4;

  lista.forEach((e, i) => {
    const slot = i % porPagina;
    if (i > 0 && slot === 0) doc.addPage();
    const x = margemX + (slot % colunas) * largura;
    const y = margemY + Math.floor(slot / colunas) * altura;

    if (porPagina > 1) { // borda pontilhada de recorte so faz sentido na grade A4
      doc.setDrawColor(180);
      doc.setLineDashPattern([1, 1], 0);
      doc.rect(x, y, largura, altura);
      doc.setLineDashPattern([], 0);
    }

    const ladoQr = Math.min(altura - 2 * PAD, 32);
    const xQr = x + largura - PAD - ladoQr;
    doc.addImage(qrs[i], 'PNG', xQr, y + (altura - ladoQr) / 2, ladoQr, ladoQr);

    const larguraTexto = xQr - x - 2 * PAD;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text(e.codigo, x + PAD, y + PAD + 5, { maxWidth: larguraTexto });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    const nome = doc.splitTextToSize(e.nome || '', larguraTexto).slice(0, 2);
    doc.text(nome, x + PAD, y + PAD + 11);
    if (e.linhaControle) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.text(e.linhaControle, x + PAD, y + altura - PAD - 1, { maxWidth: larguraTexto });
    }
  });

  const hoje = new Date().toISOString().slice(0, 10);
  doc.save(`etiquetas-${hoje}.pdf`);
}
