// Etapa 178 (T2, RN-178.09) — Ficha de EPI por colaborador, gerada no NAVEGADOR. Molde: utils/posicaoClientePdf.js — o montador
// (`montarFichaEpi`) e puro e testavel sem DOM nem binario; so `gerarFichaEpiPdf` toca no jspdf e na rede (a imagem da assinatura).
//
// E o documento de RECUPERACAO da NR-6: quem recebeu, o que, quando, com que CA, e a prova (a assinatura e o hash do registro, que
// o "Verificar integridade" da tela recalcula no servidor). Por isso o descritor carrega o hash inteiro, nao o abreviado da tela.

import jsPDF from 'jspdf';
import { formatarDataDoBanco, hojeLocalISO, lerInstanteDoBanco } from './dataLocal';
import { resolveMaterialPhotoUrl } from './resolveMaterialPhotoUrl';
import { rotuloMotivo } from './epiEntrega';
// Etapa 183 (RN-183.03): o MESMO texto do termo de ferramenta. De termoFerramenta (sem imports), nao de termoFerramentaPdf: aquele
// importa carregarImagemComoDataUrl daqui e fecharia um ciclo.
import { matriculaConfirmadaTexto } from './termoFerramenta';

const txt = (v) => (v === null || v === undefined || String(v).trim() === '' ? '—' : String(v));

// Regra da Etapa 170 (RN-170.04): o instante do servidor (`criado_em`, ISO UTC) no dia LOCAL — o de Brasilia no site. Cortar os 10
// primeiros caracteres dava o dia UTC (das 21h a meia-noite, o de amanha). Ilegivel -> '—' (nao *Invalid Date*).
const diaDoInstante = (instante) => {
  const d = lerInstanteDoBanco(instante);
  return d ? formatarDataDoBanco(hojeLocalISO(d)) : '—';
};

// Etapa 183 (RN-183.04): o aparelho e o User-Agent gravado na evidencia, LITERAL (e prova; interpretar seria adivinhar), aparado.
const SEM_APARELHO = 'Não registrado';
const textoDoAparelho = (ua) => String(ua ?? '').trim() || SEM_APARELHO;

// Etapa 183, Fase 5 (M1): a quebra das linhas da evidencia e por LARGURA medida no jsPDF (na fonte corrente), nao por contagem — 110
// caracteres de 'W' na fonte 7 iam a 280 mm (a folha tem 210). Corte por CARACTERE (nao por palavra): a juncao das linhas e o texto
// gravado, literal — o splitTextToSize come o espaco da quebra, e o aparelho e prova. `medir` recebe o texto como sera desenhado.
export function quebrarPorLargura(medir, texto, { rotulo = '', largura, larguraDemais = largura }) {
  const linhas = [];
  let atual = '';
  for (const ch of String(texto)) {
    const primeira = linhas.length === 0;
    if (atual !== '' && medir((primeira ? rotulo : '') + atual + ch) > (primeira ? largura : larguraDemais)) {
      linhas.push(atual);
      atual = ch;
    } else {
      atual += ch;
    }
  }
  linhas.push(atual);
  return linhas;
}

/** Descritor da ficha — a moeda entre a tela, o teste e o renderizador. */
export function montarFichaEpi({ colaborador, entregas = [], geradoEm } = {}) {
  const c = colaborador || {};
  const excluido = !!c.excluido;
  const linhas = (entregas || []).map((e) => ({
    id: e.id,
    numero: txt(e.numero),
    data: diaDoInstante(e.criado_em),
    epi: [e.material_codigo, e.material_nome].filter(Boolean).join(' — ') || '—',
    ca: txt(e.ca_numero),
    validadeCa: formatarDataDoBanco(e.ca_validade, '—', { soData: true }),
    quantidade: String(Number(e.quantidade || 0)),
    tamanho: txt(e.tamanho),
    motivo: e.motivo ? rotuloMotivo(e.motivo) : '—',
    entreguePor: txt(e.entregue_por_nome),
    assinaturaUrl: resolveMaterialPhotoUrl(e.arquivo_url),
    hash: e.registro_sha256 || '—',
    // Etapa 183 (RN-183.03): a matricula DA ENTREGA (snapshot do ato, no HMAC), nao a do cadastro de hoje (c.matricula).
    matriculaConfirmada: matriculaConfirmadaTexto({ confirmado_por_matricula: e.confirmado_por_matricula }, { matricula: e.matricula }),
    aparelho: textoDoAparelho(e.user_agent),
  }));
  return {
    titulo: `Ficha de EPI — ${c.nome || 'colaborador'}`,
    excluido,
    avisoExcluido: excluido ? 'Colaborador excluído do cadastro — dados da data da entrega' : null,
    colaborador: {
      nome: txt(c.nome),
      matricula: txt(c.matricula),
      setor: txt(c.setor),
      cpf: txt(c.cpf_mascarado),
    },
    geradoEm: formatarDataDoBanco(hojeLocalISO(lerInstanteDoBanco(geradoEm) || new Date())),
    cabecalho: ['Data', 'EPI', 'CA', 'Validade CA', 'Qtd', 'Tam.', 'Motivo', 'Entregue por'],
    linhas,
    total: linhas.length,
  };
}

/** Le a imagem da assinatura como data URL PNG (o addImage do jspdf). Falha -> null (a ficha sai com o aviso, nao quebra). */
export async function carregarImagemComoDataUrl(url) {
  if (!url) return null;
  try {
    const resp = await fetch(url);
    if (!resp.ok) return null;
    const blob = await resp.blob();
    return await new Promise((resolve) => {
      const leitor = new FileReader();
      leitor.onload = () => resolve(typeof leitor.result === 'string' ? leitor.result : null);
      leitor.onerror = () => resolve(null);
      leitor.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

/** Desenha e dispara o download. `carregarImagem` injetavel (teste). */
export async function gerarFichaEpiPdf(dados, { carregarImagem = carregarImagemComoDataUrl } = {}) {
  const doc = montarFichaEpi(dados);
  const imagens = await Promise.all(doc.linhas.map((l) => carregarImagem(l.assinaturaUrl)));
  const pdf = new jsPDF({ format: 'a4', orientation: 'portrait', unit: 'mm' });
  const M = 14;
  let y = 18;

  pdf.setFontSize(14);
  pdf.text(doc.titulo, M, y);
  y += 6;
  pdf.setFontSize(9);
  pdf.text(`Gerado em ${doc.geradoEm}`, M, y);
  y += 6;
  pdf.text(`Nome: ${doc.colaborador.nome}    Matrícula: ${doc.colaborador.matricula}`, M, y);
  y += 5;
  pdf.text(`Setor: ${doc.colaborador.setor}    CPF: ${doc.colaborador.cpf}`, M, y);
  y += 5;
  if (doc.avisoExcluido) {
    pdf.text(doc.avisoExcluido, M, y);
    y += 5;
  }
  y += 3;

  const cols = [M, M + 20, M + 72, M + 92, M + 114, M + 126, M + 140, M + 162];
  const cabecalho = () => {
    doc.cabecalho.forEach((h, i) => pdf.text(h, cols[i], y));
    y += 2;
    pdf.line(M, y, 196, y);
    y += 5;
  };
  cabecalho();

  // Etapa 183, Fase 5 (M1): a largura util e de margem a margem (M a 196); as linhas seguintes do aparelho vem recuadas (M + 14).
  const LARGURA_UTIL = 196 - M;
  const RECUO_APARELHO = 14;
  const RODAPE = 287;
  doc.linhas.forEach((l, idx) => {
    // As linhas da evidencia (fonte 7) sao quebradas ANTES de desenhar, para a altura da entrega ser conhecida: do comeco s a divisoria,
    // 4 (linha da tabela -> hash) + 3 por linha de confirmacao e de aparelho + 2 + (25 com imagem | 8 sem). A entrega so comeca nesta
    // pagina se a divisoria (o ultimo traco; o fundo da imagem fica 2,5 acima) couber ate o rodape. O limiar fixo de antes (y > 235)
    // supunha 3 linhas de aparelho; por largura sao de 1 a 5 (300 'W'), mais as da matricula, que nao tem tamanho maximo no cadastro.
    pdf.setFontSize(7);
    const linhasConfirmacao = pdf.splitTextToSize(`Matrícula confirmada pelo colaborador: ${l.matriculaConfirmada}`, LARGURA_UTIL);
    const linhasAparelho = quebrarPorLargura((s) => pdf.getTextWidth(s), l.aparelho,
      { rotulo: 'Aparelho: ', largura: LARGURA_UTIL, larguraDemais: LARGURA_UTIL - RECUO_APARELHO });
    pdf.setFontSize(9);
    const altura = 4 + 3 * (linhasConfirmacao.length + linhasAparelho.length) + 2 + (imagens[idx] ? 25 : 8);
    if (y + altura > RODAPE) { pdf.addPage(); y = 18; cabecalho(); }
    const celulas = [l.data, l.epi, l.ca, l.validadeCa, l.quantidade, l.tamanho, l.motivo, l.entreguePor];
    const larguras = [10, 26, 10, 11, 6, 7, 11, 18];
    celulas.forEach((c, i) => pdf.text(String(c).slice(0, larguras[i] * 1.4), cols[i], y));
    y += 4;
    pdf.setFontSize(7);
    pdf.text(`Entrega ${l.numero} · registro (HMAC-SHA256): ${l.hash}`, M, y); // Fase 5: o registro e HMAC com segredo do servidor
    // Etapa 183 (RN-183.03/04): as provas da evidencia do ato. Passo de 3 mm na fonte 7; o aparelho continua recuado, sem rotulo.
    linhasConfirmacao.forEach((s) => {
      y += 3;
      pdf.text(s, M, y);
    });
    linhasAparelho.forEach((s, i) => {
      y += 3;
      pdf.text(i === 0 ? `Aparelho: ${s}` : s, i === 0 ? M : M + RECUO_APARELHO, y);
    });
    pdf.setFontSize(9);
    y += 2;
    if (imagens[idx]) {
      pdf.addImage(imagens[idx], 'PNG', M, y, 60, 22.5);
      y += 25;
    } else {
      y += 4;
      pdf.text('(imagem da assinatura indisponível)', M, y);
      y += 4;
    }
    pdf.line(M, y, 196, y);
    y += 5;
  });

  if (doc.linhas.length === 0) pdf.text('Nenhuma entrega de EPI registrada.', M, y);

  const nome = String(dados?.colaborador?.nome || 'colaborador').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\W+/g, '-').toLowerCase();
  pdf.save(`ficha-epi-${nome}.pdf`);
  // Etapa 178 (T3): quantas assinaturas sairam "indisponivel" — a tela avisa, em vez de entregar a ficha da NR-6 sem elas em silencio.
  return { ...doc, assinaturasIndisponiveis: imagens.filter((img) => !img).length };
}
