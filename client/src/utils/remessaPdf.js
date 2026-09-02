// Etapa 8b, Task 9: documento de remessa a terceiros, gerado no NAVEGADOR — zero mudanca de
// servidor, mesmo padrao validado em utils/etiquetasPdf.js (6c) e utils/posicaoClientePdf.js (8).
// O montador e puro (testavel sem DOM nem binario); so gerarRemessaPDF toca no jspdf.
//
// Este papel acompanha material FISICO saindo do predio. Tres coisas nele nao sao decorativas:
// o numero da remessa (e por ele que o retorno e conferido), o nome do CLIENTE PROPRIETARIO
// quando o material e de terceiro — a decisao 5 do design isenta a remessa da guarda de OS/projeto
// justamente porque o documento nomeia o dono — e a declaracao de encerramento, abaixo.

import jsPDF from 'jspdf';

const num = (v) => String(Number(v || 0));
const ou = (v, alt = '—') => (v === null || v === undefined || v === '' ? alt : String(v));

const formatDataBR = (iso) => {
  if (!iso) return null;
  const d = new Date(String(iso).length === 10 ? `${iso}T00:00:00Z` : iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('pt-BR', { timeZone: 'UTC' });
};

/**
 * Destinos de encerramento (thirdPartyService.DESTINOS_ENCERRAMENTO) em linguagem de papel.
 *
 * Os dois baixam estoque, mas explicam desaparecimentos diferentes: "sumiu la" nao e "virou
 * cavaco". Quem le o documento meses depois so tem esta frase.
 */
export const ROTULO_DESTINO_ENCERRAMENTO = {
  PERDA_NO_TERCEIRO: 'perda no terceiro',
  CONSUMIDO_NO_PROCESSO: 'consumido no processo',
};

/**
 * A frase de encerramento — `null` enquanto a remessa esta em curso.
 *
 * POR QUE ELA EXISTE: ao encerrar com destino, o servico grava `quantidade_retornada = quantidade`
 * nos itens pendentes (thirdPartyService.encerrarRemessa). Ali isso significa LIQUIDADO, nao
 * "voltou" — o item deixa de ter pendencia porque foi BAIXADO. A verdade do que voltou esta em
 * retornos_remessa_item_almoxarifado; o cabecalho e quem guarda `encerramento_destino`. Um
 * documento que ignorasse o destino afirmaria que o material voltou quando ele se perdeu.
 *
 * Encerramento SEM destino tambem e correto e nao gera frase nenhuma: quando tudo volta, o retorno
 * total encerra a remessa sozinho e nao havia pendencia a destinar. Inventar "baixa definitiva"
 * nesse caso afirmaria uma perda que nao houve, num papel que o terceiro assina.
 */
function frasePreEncerramento(remessa) {
  const destino = remessa.encerramento_destino;
  if (!destino) return null;
  const rotulo = ROTULO_DESTINO_ENCERRAMENTO[destino] || String(destino).toLowerCase().replace(/_/g, ' ');
  const justificativa = String(remessa.encerramento_justificativa || '').trim();
  return `Encerrada com baixa definitiva do saldo que ficou no terceiro (${rotulo})`
    + `${justificativa ? `: ${justificativa}` : '.'}`;
}

/** Descritor do documento — a moeda entre a tela, o teste e o renderizador. */
export function montarRemessaPDF({ remessa = {}, itens = [], geradoEm } = {}) {
  const lista = itens || [];
  return {
    titulo: `Remessa para terceiros — ${remessa.numero || 's/n'}`,
    subtitulo: [remessa.fornecedor_nome, remessa.tipo_servico].filter(Boolean).join(' · ') || 'terceiro nao informado',
    // `null` quando o material e NOSSO: escrever "material de cliente" sempre poria um dono falso
    // em todo documento de estoque proprio.
    proprietario: remessa.proprietario_cliente_id
      ? `Material de propriedade de ${remessa.proprietario_cliente_nome || `cliente #${remessa.proprietario_cliente_id}`}`
      : null,
    prazo: formatDataBR(remessa.prazo_previsto) || 'sem prazo definido',
    status: remessa.status || 'ABERTA',
    encerramento: frasePreEncerramento(remessa),
    observacoes: remessa.observacoes || null,
    geradoEm: formatDataBR(geradoEm) || formatDataBR(new Date().toISOString()),
    cabecalhoItens: ['Código', 'Material', 'Un.', 'Qtde', 'Peso (kg)'],
    linhasItens: lista.map((i) => [
      ou(i.material_codigo), ou(i.material_nome), ou(i.unidade),
      num(i.quantidade), ou(i.peso),
    ]),
    totalItens: lista.length,
    totalQuantidade: lista.reduce((a, i) => a + Number(i.quantidade || 0), 0),
  };
}

/** Desenha e dispara o download. Sem autoTable: a grade e simples e cabe em texto posicionado. */
export function gerarRemessaPDF(dados) {
  const doc = montarRemessaPDF(dados);
  const pdf = new jsPDF({ format: 'a4', orientation: 'portrait', unit: 'mm' });
  const M = 14;
  let y = 18;

  pdf.setFontSize(14);
  pdf.text(doc.titulo, M, y); y += 6;
  pdf.setFontSize(10);
  pdf.text(doc.subtitulo, M, y); y += 5;
  pdf.setFontSize(9);
  pdf.text(`Prazo previsto: ${doc.prazo}   ·   Status: ${doc.status}`, M, y); y += 5;
  if (doc.proprietario) {
    pdf.setFontSize(10);
    pdf.text(doc.proprietario, M, y); y += 6;
    pdf.setFontSize(9);
  }
  if (doc.encerramento) {
    pdf.text(pdf.splitTextToSize(doc.encerramento, 175), M, y);
    y += 5 * pdf.splitTextToSize(doc.encerramento, 175).length;
  }
  pdf.text(`Gerado em ${doc.geradoEm}`, M, y); y += 8;

  const cols = [M, M + 30, M + 110, M + 126, M + 152];
  doc.cabecalhoItens.forEach((h, i) => pdf.text(h, cols[i], y));
  y += 2; pdf.line(M, y, 196, y); y += 5;
  for (const linha of doc.linhasItens) {
    if (y > 262) { pdf.addPage(); y = 18; }
    linha.forEach((c, i) => pdf.text(String(c ?? '').slice(0, 40), cols[i], y));
    y += 5;
  }
  y += 2; pdf.line(M, y, 196, y); y += 5;
  pdf.text(`${doc.totalItens} item(ns) · quantidade total: ${doc.totalQuantidade}`, M, y); y += 8;

  if (doc.observacoes) {
    pdf.text('Observações:', M, y); y += 5;
    pdf.text(pdf.splitTextToSize(doc.observacoes, 175), M, y); y += 10;
  }

  // Campos de assinatura: o papel volta assinado pelo terceiro, e e o que prova a entrega.
  if (y > 245) { pdf.addPage(); y = 18; }
  y += 12;
  pdf.line(M, y, M + 75, y);
  pdf.line(M + 100, y, M + 175, y);
  y += 5;
  pdf.text('Responsável GMP', M, y);
  pdf.text('Recebido pelo terceiro (nome / data)', M + 100, y);

  pdf.save(`remessa-${(dados?.remessa?.numero || 'sn').toLowerCase()}.pdf`);
}
