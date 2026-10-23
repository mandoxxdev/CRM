// Etapa 8b, Task 9: documento de remessa a terceiros, gerado no NAVEGADOR — zero mudanca de
// servidor, mesmo padrao validado em utils/etiquetasPdf.js (6c) e utils/posicaoClientePdf.js (8).
// O montador e puro (testavel sem DOM nem binario); so gerarRemessaPDF toca no jspdf.
//
// Este papel acompanha material FISICO saindo do predio. Tres coisas nele nao sao decorativas:
// o numero da remessa (e por ele que o retorno e conferido), o nome do CLIENTE PROPRIETARIO
// quando o material e de terceiro — a decisao 5 do design isenta a remessa da guarda de OS/projeto
// justamente porque o documento nomeia o dono — e a declaracao de encerramento, abaixo.

import jsPDF from 'jspdf';
import { formatarDataDoBanco, hojeLocalISO, lerInstanteDoBanco } from './dataLocal';
import {
  linhasPorLargura, utilDasColunas, quebrarCelulas, desenharCelulas, desenharQuebrado,
} from './pdfTexto';

const num = (v) => String(Number(v || 0));
const ou = (v, alt = '—') => (v === null || v === undefined || v === '' ? alt : String(v));

// Etapa 170 (RN-170.04, B1082): o `{ timeZone: 'UTC' }` imprimia o dia UTC — o *Gerado em* (o `toISOString()` de quem clica) saia com o
// dia de amanha das 21h a meia-noite. Agora: o prazo (coluna SO de data) no dia gravado; o *Gerado em* no dia LOCAL de quem gera (o
// fuso do navegador, como o resto do cliente); `geradoEm` vazio ou ilegivel -> hoje.
const formatPrazo = (valor) => formatarDataDoBanco(valor, null, { soData: true });
const formatGeradoEm = (instante) => formatarDataDoBanco(hojeLocalISO(lerInstanteDoBanco(instante) || new Date()));

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
    prazo: formatPrazo(remessa.prazo_previsto) || 'sem prazo definido',
    status: remessa.status || 'ABERTA',
    encerramento: frasePreEncerramento(remessa),
    observacoes: remessa.observacoes || null,
    geradoEm: formatGeradoEm(geradoEm),
    cabecalhoItens: ['Código', 'Material', 'Un.', 'Qtde', 'Peso (kg)'],
    linhasItens: lista.map((i) => [
      ou(i.material_codigo), ou(i.material_nome), ou(i.unidade),
      num(i.quantidade), ou(i.peso),
    ]),
    totalItens: lista.length,
    totalQuantidade: lista.reduce((a, i) => a + Number(i.quantidade || 0), 0),
  };
}

// Etapa 186 (B1230, B1232, B1233, B1235; corrige a B1220 e a C445 da 185) — este papel volta ASSINADO pelo terceiro (os campos de
// assinatura, no fim): e o que prova o que foi entregue. Antes cada celula era cortada em 40 letras numa linha so, sem medir: o codigo de
// EPI de 17 letras invadia a coluna Material e o nome do material perdia o fim (o de 71 letras saia sem as ultimas 31). Agora cada celula
// QUEBRA em quantas linhas precisar (a linha fica mais alta; nenhuma letra perdida) e as colunas foram redistribuidas — medidas com o
// jsPDF real — para o codigo de EPI e o nome comum de material caberem numa linha so.
const COLUNAS = [14, 48, 126, 142, 166]; // = M, M + 34, M + 112, M + 128, M + 152
const UTIL = utilDasColunas(COLUNAS); // [33, 77, 15, 23, 30]: ate 1 mm antes da proxima coluna; a ultima ate a margem (196)
const LARGURA_TEXTO = 182; // 196 - M

/** Desenha e dispara o download. Sem autoTable: a grade e simples e cabe em texto posicionado. */
export function gerarRemessaPDF(dados) {
  const doc = montarRemessaPDF(dados);
  const pdf = new jsPDF({ format: 'a4', orientation: 'portrait', unit: 'mm' });
  const M = 14;
  let y = 18;

  // Linhas de identificacao (B1236): quebram em 182 mm, cada bloco avancando o passo de hoje POR LINHA (texto curto: o y de hoje). O
  // proprietario passava da margem com razao social de 72+ letras largas (83 de texto real), o subtitulo com fornecedor de 85+.
  pdf.setFontSize(14);
  y = desenharQuebrado(pdf, doc.titulo, M, y, LARGURA_TEXTO, 6);
  pdf.setFontSize(10);
  y = desenharQuebrado(pdf, doc.subtitulo, M, y, LARGURA_TEXTO, 5);
  pdf.setFontSize(9);
  y = desenharQuebrado(pdf, `Prazo previsto: ${doc.prazo}   ·   Status: ${doc.status}`, M, y, LARGURA_TEXTO, 5);
  if (doc.proprietario) {
    pdf.setFontSize(10);
    y = desenharQuebrado(pdf, doc.proprietario, M, y, LARGURA_TEXTO, 6);
    pdf.setFontSize(9);
  }
  if (doc.encerramento) {
    pdf.text(pdf.splitTextToSize(doc.encerramento, 175), M, y);
    y += 5 * pdf.splitTextToSize(doc.encerramento, 175).length;
  }
  pdf.text(`Gerado em ${doc.geradoEm}`, M, y); y += 8;

  // Cabecalho da tabela — repetido depois de todo addPage DENTRO da tabela (emenda I4 da Fase 2, B1234): sem ele, na pagina 2 Qtde e
  // Peso ficam duas colunas de numero sem nome num papel assinado.
  const cabecalho = () => {
    doc.cabecalhoItens.forEach((h, i) => pdf.text(h, COLUNAS[i], y));
    y += 2; pdf.line(M, y, 196, y); y += 5;
  };
  cabecalho();
  for (const linha of doc.linhasItens) {
    // A linha cresce (B1233): 5 mm na primeira (o passo de hoje), 4 nas de continuacao. So comeca na pagina se a ULTIMA linha dela fica
    // ate 262 (o limite de hoje): o item nao e partido entre paginas.
    const linhas = quebrarCelulas(pdf, linha, UTIL);
    const n = Math.max(...linhas.map((l) => l.length));
    if (y + 4 * (n - 1) > 262) { pdf.addPage(); y = 18; cabecalho(); }
    desenharCelulas(pdf, linhas, COLUNAS, y, 4);
    y += 5 + 4 * (n - 1);
  }
  y += 2; pdf.line(M, y, 196, y); y += 5;
  pdf.text(`${doc.totalItens} item(ns) · quantidade total: ${doc.totalQuantidade}`, M, y); y += 8;

  if (doc.observacoes) {
    // B1235: antes `y += 10` fixo depois do bloco — com 7+ linhas a observacao cruzava a linha de assinatura, e uma longa perto do fim
    // saia da folha (309 mm). Agora uma linha por `text`, passo 4, virando a pagina se passar de 280; depois do bloco +6 (1 linha: +10).
    pdf.text('Observações:', M, y); y += 5;
    for (const l of linhasPorLargura(pdf, doc.observacoes, 175)) {
      if (y > 280) { pdf.addPage(); y = 18; }
      pdf.text(l, M, y); y += 4;
    }
    y += 6;
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
