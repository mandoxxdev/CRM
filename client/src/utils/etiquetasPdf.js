// Etapa 6c: etiquetas com QR. Montadores puros (testáveis sem DOM/PDF) + renderizador jspdf.
// O descritor { codigo, nome, linhaControle, qrUrl } é a moeda entre telas, modal e PDF.

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
