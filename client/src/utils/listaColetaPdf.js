// Etapa 189 (T3; RN-189.10 a RN-189.13, B1266, B1267, B1269) — a LISTA DE COLETA impressa: os endereços na ordem em que se anda pelo
// almoxarifado (a `ordem_coleta` da fila, Etapa 188), com uma caixinha para marcar "peguei". Gerada no NAVEGADOR com o JSON da fila já
// carregado — nenhuma chamada nova ao servidor. Molde: posicaoClientePdf.js (descritor puro `montar…` + `gerar…` que desenha) e a régua de
// papel da Etapa 186 (pdfTexto.js: célula que quebra por largura medida, número que encolhe em vez de quebrar, nada além de x = 196).
//
// As frases da dica são as da tela (utils/coletaTexto.js, B1268) — este arquivo não importa componente de tela.

import jsPDF from 'jspdf';
import { formatarDataDoBanco, hojeLocalISO, agoraLocalParaInput, lerInstanteDoBanco } from './dataLocal';
import {
  utilDasColunas, linhasPorLargura, prepararCelulas, desenharCelulasComFonte, desenharQuebrado,
} from './pdfTexto';
import { fmtQtd, fmtData, textoAvisoPegarEm, textoAlertaPegarEm } from './coletaTexto';

// Emenda I2 da Fase 2 (medido com o jsPDF real): Qtd com 27 mm úteis — `9.999.999.999,999 PC` cabe em f7 (24,5 mm); com as colunas da
// primeira proposta (19 mm) nem a fonte mínima cabia e o número quebrava em duas linhas.
export const COLUNAS = [14, 23, 70, 130, 160, 188];
const UTIL = utilDasColunas(COLUNAS); // [8, 46, 59, 29, 27, 8]
const COLUNAS_TEXTO = COLUNAS.slice(0, 5); // a sexta é o quadrado
const UTIL_TEXTO = UTIL.slice(0, 5);
const NUMERICAS = [0, 4]; // Nº e Qtd: nunca quebram (encolhem a fonte)
export const CABECALHO = ['Nº', 'Endereço', 'Material', 'Lote', 'Qtd', 'OK'];
const M = 14;
const LARGURA_TEXTO = 182; // 196 - M
const LARGURA_AVISO = 168; // de x = 23 (a coluna Endereço) até 191
const LIMITE = 275;
const TOPO = 18;
const FONTE = 9;
const FONTE_AVISO = 8;
const PASSO = 4;
const PASSO_AVISO = 3.5;
const QUADRADO = { x: 189, lado: 3.5 }; // termina em 192,5 (≤ 196)

const URGENCIA = { CRITICO: 'Crítico', URGENTE: 'Urgente', NORMAL: 'Normal' };

const dataHoraLocal = (d) => `${formatarDataDoBanco(hojeLocalISO(d))} ${agoraLocalParaInput(d).slice(11)}`;
const instante = (v) => lerInstanteDoBanco(v) || new Date();

/** RN-189.10: a requisição tem o que imprimir — paradas, ou algum item com aviso. */
export const podeImprimirListaColeta = (req) => (Array.isArray(req?.ordem_coleta) && req.ordem_coleta.length > 0)
  || (req?.itens || []).some((it) => it.pegar_em_aviso != null);

/** RN-189.11: as requisições da "todas" — etapa SEPARAR e algo a imprimir, na ordem recebida (a da fila). */
export const requisicoesParaImprimir = (fila) => (Array.isArray(fila) ? fila : [])
  .filter((r) => (r.etapas || []).includes('SEPARAR') && podeImprimirListaColeta(r));

/** RN-189.13: os nomes de arquivo. */
export const nomeArquivoListaColeta = (numero) => `lista-coleta-${String(numero ?? '').replace(/\W+/g, '-')}.pdf`;
export const nomeArquivoListaColetaFila = (carregadaEm) => `lista-coleta-fila-${hojeLocalISO(instante(carregadaEm))}.pdf`;

const enderecoDa = (p) => `${p.localizacao_codigo}${p.caminho && String(p.caminho).includes(' / ') ? ` (${p.caminho})` : ''}`;
const materialDo = (codigo, it) => (it && it.material_nome ? `${codigo} — ${it.material_nome}` : String(codigo ?? ''));
const loteDa = (p, it) => {
  if (!p.lote_codigo) return '—';
  const validade = it && it.pegar_em && it.pegar_em.lote_validade;
  return `${p.lote_codigo}${validade ? ` vence ${fmtData(validade)}` : ''}`;
};
const comUnidade = (q, it) => `${fmtQtd(q)}${it && it.unidade ? ` ${it.unidade}` : ''}`;
// O aviso e o alerta da parada, nessa ordem (I3 da Fase 2): as frases da tela.
const avisoDo = (it) => [textoAvisoPegarEm(it), textoAlertaPegarEm(it)].filter(Boolean).join(' ');

/** Descritor — a moeda entre a tela, o teste e o renderizador. */
export function montarListaColetaPDF({ requisicoes = [], carregadaEm } = {}) {
  const carregada = dataHoraLocal(instante(carregadaEm));
  return {
    carregadaEm: carregada,
    linhaCarregada: `Fila carregada em ${carregada} — a sugestão vale para esse momento; recarregue a fila antes de imprimir de novo.`,
    requisicoes: (requisicoes || []).map((r) => {
      const itens = r.itens || [];
      const doItem = new Map(itens.map((it) => [it.item_id, it]));
      const avisos = new Map();
      const linhas = (r.ordem_coleta || []).map((p, k) => {
        const it = doItem.get(p.item_id);
        const aviso = it ? avisoDo(it) : '';
        if (aviso) avisos.set(k, aviso);
        return [String(k + 1), enderecoDa(p), materialDo(p.material_codigo, it), loteDa(p, it), comUnidade(p.quantidade_sugerida, it)];
      });
      // Sem endereço sugerido: item sem `pegar_em` com aviso (inclui PLANEJADA_INDISPONIVEL). Sem `pegar_em` e sem aviso (separável 0,
      // alçada de valor) não aparece.
      const semEndereco = itens.filter((it) => !it.pegar_em && it.pegar_em_aviso != null).map((it) => ({
        texto: `${materialDo(it.material_codigo, it)} · a separar ${comUnidade(it.a_separar, it)}`,
        aviso: avisoDo(it),
      }));
      const partes = [];
      const quem = [r.solicitante_nome, r.setor].filter(Boolean).join(' · ');
      if (quem) partes.push(`Solicitante: ${quem}`);
      partes.push(`Urgência: ${URGENCIA[String(r.urgencia || '').toUpperCase()] || URGENCIA.NORMAL}`);
      return {
        numero: r.numero || `#${r.id}`,
        titulo: `Lista de coleta — ${r.numero || `#${r.id}`}`,
        subtitulo: partes.join(' · '),
        linhas,
        avisos,
        semEndereco,
      };
    }),
  };
}

// ── Desenho ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// Toda medida passa pela fonte corrente (`setFontSize` + `splitTextToSize`); a produção não chama `getTextWidth` nem `setFont` (RN-186.11).

const linhasNaFonte = (pdf, texto, largura, fonte, volta) => {
  pdf.setFontSize(fonte);
  const n = linhasPorLargura(pdf, texto, largura).length;
  pdf.setFontSize(volta);
  return n;
};

// A parada medida: as células (prepararCelulas) e as linhas do aviso. `altura` = do primeiro baseline até o último (o que tem de
// caber até LIMITE) e `avanco` = quanto o y anda depois dela.
function medirParada(pdf, linha, aviso) {
  const celulas = prepararCelulas(pdf, linha, UTIL_TEXTO, { numericas: NUMERICAS, fonte: FONTE });
  const n = Math.max(...celulas.linhas.map((l) => l.length));
  const m = aviso ? linhasNaFonte(pdf, aviso, LARGURA_AVISO, FONTE_AVISO, FONTE) : 0;
  const altura = PASSO * (n - 1) + (m ? PASSO + PASSO_AVISO * (m - 1) : 0);
  return { celulas, n, m, altura, avanco: altura + 5 };
}

function medirSemEndereco(pdf, s) {
  const a = linhasNaFonte(pdf, s.texto, LARGURA_TEXTO, FONTE, FONTE);
  const b = s.aviso ? linhasNaFonte(pdf, s.aviso, LARGURA_TEXTO, FONTE_AVISO, FONTE) : 0;
  const altura = PASSO * (a - 1) + (b ? PASSO + PASSO_AVISO * (b - 1) : 0);
  return { altura, avanco: altura + 5 };
}

const ALTURA_CABECALHO_TABELA = 7;
const ALTURA_TITULO_SEM_ENDERECO = 6;

function desenharCabecalhoTabela(pdf, y) {
  pdf.setFontSize(FONTE);
  CABECALHO.forEach((h, i) => pdf.text(h, COLUNAS[i], y));
  pdf.line(M, y + 2, 196, y + 2);
  return y + ALTURA_CABECALHO_TABELA;
}

// Altura do cabeçalho da seção (título, "Fila carregada em…", solicitante/urgência) — medida na fonte de cada linha.
function medirCabecalhoSecao(pdf, r, linhaCarregada) {
  const t = linhasNaFonte(pdf, r.titulo, LARGURA_TEXTO, 14, FONTE);
  const c = linhasNaFonte(pdf, linhaCarregada, LARGURA_TEXTO, FONTE, FONTE);
  const s = linhasNaFonte(pdf, r.subtitulo, LARGURA_TEXTO, FONTE, FONTE);
  return 6 * t + 4.5 * c + 4.5 * s + 3;
}

/** Desenha e dispara o download. Uma seção por requisição (B1266), na ordem recebida. */
export function gerarListaColetaPDF({ requisicoes = [], carregadaEm, nomeArquivo } = {}) {
  const doc = montarListaColetaPDF({ requisicoes, carregadaEm });
  const pdf = new jsPDF({ format: 'a4', orientation: 'portrait', unit: 'mm' });
  pdf.setFontSize(FONTE);
  let y = TOPO;

  doc.requisicoes.forEach((r, idx) => {
    // RN-189.12: a seção só começa se cabe o cabeçalho dela + a primeira parada (ou o primeiro item sem endereço).
    if (idx > 0) {
      let primeira = 0;
      if (r.linhas.length) primeira = ALTURA_CABECALHO_TABELA + medirParada(pdf, r.linhas[0], r.avisos.get(0)).altura;
      else if (r.semEndereco.length) primeira = ALTURA_TITULO_SEM_ENDERECO + medirSemEndereco(pdf, r.semEndereco[0]).altura;
      if (y + medirCabecalhoSecao(pdf, r, doc.linhaCarregada) + primeira > LIMITE) { pdf.addPage(); y = TOPO; }
    }
    pdf.setFontSize(14);
    y = desenharQuebrado(pdf, r.titulo, M, y, LARGURA_TEXTO, 6);
    pdf.setFontSize(FONTE);
    y = desenharQuebrado(pdf, doc.linhaCarregada, M, y, LARGURA_TEXTO, 4.5);
    y = desenharQuebrado(pdf, r.subtitulo, M, y, LARGURA_TEXTO, 4.5);
    y += 3;

    // M6 da Fase 2: sem paradas, nenhuma tabela.
    if (r.linhas.length) {
      y = desenharCabecalhoTabela(pdf, y);
      r.linhas.forEach((linha, k) => {
        const aviso = r.avisos.get(k);
        const med = medirParada(pdf, linha, aviso);
        // A parada (com o aviso) não é partida entre páginas; o cabeçalho é repetido depois de todo addPage.
        if (y + med.altura > LIMITE) { pdf.addPage(); y = desenharCabecalhoTabela(pdf, TOPO); }
        pdf.rect(QUADRADO.x, y - 3, QUADRADO.lado, QUADRADO.lado);
        desenharCelulasComFonte(pdf, med.celulas, COLUNAS_TEXTO, y, PASSO, FONTE);
        if (aviso) {
          pdf.setFontSize(FONTE_AVISO);
          desenharQuebrado(pdf, aviso, COLUNAS[1], y + PASSO * (med.n - 1) + PASSO, LARGURA_AVISO, PASSO_AVISO);
          pdf.setFontSize(FONTE);
        }
        y += med.avanco;
      });
    }

    if (r.semEndereco.length) {
      const primeiro = medirSemEndereco(pdf, r.semEndereco[0]);
      if (y + ALTURA_TITULO_SEM_ENDERECO + primeiro.altura > LIMITE) { pdf.addPage(); y = TOPO; }
      y += 2;
      pdf.setFontSize(10);
      pdf.text('Sem endereço sugerido', M, y);
      pdf.setFontSize(FONTE);
      y += ALTURA_TITULO_SEM_ENDERECO - 2;
      r.semEndereco.forEach((s) => {
        const med = medirSemEndereco(pdf, s);
        if (y + med.altura > LIMITE) { pdf.addPage(); y = TOPO; }
        const depois = desenharQuebrado(pdf, s.texto, M, y, LARGURA_TEXTO, PASSO);
        if (s.aviso) {
          pdf.setFontSize(FONTE_AVISO);
          desenharQuebrado(pdf, s.aviso, M, depois, LARGURA_TEXTO, PASSO_AVISO);
          pdf.setFontSize(FONTE);
        }
        y += med.avanco;
      });
    }
    y += 6;
  });

  pdf.save(nomeArquivo || (doc.requisicoes.length === 1 ? nomeArquivoListaColeta(doc.requisicoes[0].numero)
    : nomeArquivoListaColetaFila(carregadaEm)));
}
