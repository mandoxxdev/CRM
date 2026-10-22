// Etapa 180 (T3, RN-180.05) — o termo de responsabilidade de um emprestimo de ferramenta, em PDF gerado no NAVEGADOR. Molde:
// utils/fichaEpiPdf.js — o montador (`montarTermoFerramenta`) e puro e testavel sem DOM nem binario; so `gerarTermoFerramentaPdf` toca
// no jspdf e na rede (a imagem da assinatura). Etapa 185 (emenda M8): a quebra do texto em linhas saiu do descritor e foi para o desenho,
// porque passou a ser por LARGURA medida na fonte do PDF (o descritor leva o `texto` da versao, literal).
//
// E o documento de RECUPERACAO: o texto DA VERSAO ASSINADA (nao o vigente), a fotografia da ferramenta e do colaborador gravada no
// ato, a matricula que ele digitou, a assinatura e o hash do registro (que o "Verificar integridade" recalcula no servidor).

import jsPDF from 'jspdf';
import { formatarDataDoBanco, formatarInstanteDoBanco, hojeLocalISO, lerInstanteDoBanco, COM_SEGUNDOS } from './dataLocal';
import { resolveMaterialPhotoUrl } from './resolveMaterialPhotoUrl';
import { carregarImagemComoDataUrl } from './fichaEpiPdf';
import { matriculaConfirmadaTexto } from './termoFerramenta';

const txt = (v) => (v === null || v === undefined || String(v).trim() === '' ? '—' : String(v));

/**
 * Quebra o texto em linhas que cabem em `largura`, respeitando os paragrafos e as palavras. Puro.
 * Etapa 185 (RN-185.07, B1219): a regua e `medir` — o padrao conta caracteres (o comportamento de antes); o desenho passa a largura
 * MEDIDA no jsPDF (getTextWidth, em mm, na fonte corrente). Por contagem, 95 letras em CAIXA ALTA iam a 210,6 mm (a folha tem 210).
 * Palavra maior que a linha e cortada por medida, caractere a caractere (for...of: nao parte par substituto); nada e perdido.
 */
export function quebrarTexto(texto, largura = 95, medir = (s) => s.length) {
  const saida = [];
  String(texto ?? '').replace(/\r\n?/g, '\n').split('\n').forEach((paragrafo) => {
    const palavras = paragrafo.split(/\s+/).filter(Boolean);
    if (palavras.length === 0) { saida.push(''); return; }
    let linha = '';
    palavras.forEach((p) => {
      let palavra = p;
      while (medir(palavra) > largura) { // palavra maior que a linha (hash, URL): corta por medida
        if (linha) { saida.push(linha); linha = ''; }
        let pedaco = '';
        for (const ch of palavra) {
          // emenda M6: o pedaco leva ao menos um caractere — se um so ja nao cabe, o laco ainda avanca (senao nao terminaria)
          if (pedaco !== '' && medir(pedaco + ch) > largura) break;
          pedaco += ch;
        }
        saida.push(pedaco);
        palavra = palavra.slice(pedaco.length);
      }
      if (!palavra) return;
      if (!linha) linha = palavra;
      else if (medir(`${linha} ${palavra}`) <= largura) linha += ` ${palavra}`;
      else { saida.push(linha); linha = palavra; }
    });
    if (linha) saida.push(linha);
  });
  return saida;
}

/** Descritor do termo — a moeda entre a tela, o teste e o renderizador. Recebe a resposta de `GET …/emprestimos/:id/termo`. */
export function montarTermoFerramenta({ emprestimo, termo, evidencia } = {}, { geradoEm } = {}) {
  const t = termo || {};
  const f = t.ferramenta || {};
  const c = t.colaborador || {};
  const ev = evidencia || {};
  const numero = txt(t.numero);
  return {
    titulo: `Termo de responsabilidade — ${numero}`,
    numero,
    emprestimoId: emprestimo?.id ?? null,
    versao: t.versao != null ? String(t.versao) : '—',
    provisorio: !!t.provisorio,
    avisoProvisorio: t.provisorio ? 'Texto provisório — a empresa ainda não forneceu o texto definitivo do termo' : null,
    ferramenta: {
      codigo: txt(f.codigo_patrimonio),
      nome: txt(f.nome),
      serie: txt(f.numero_serie),
    },
    colaborador: {
      nome: txt(c.nome),
      matricula: txt(c.matricula),
      setor: txt(c.setor),
    },
    matriculaConfirmada: matriculaConfirmadaTexto(evidencia, t.colaborador),
    dataPrevista: formatarDataDoBanco(t.data_prevista_devolucao, '—', { soData: true }),
    registradoPor: txt(t.criado_por_nome),
    assinadoEm: formatarInstanteDoBanco(t.criado_em, COM_SEGUNDOS),
    texto: String(t.texto ?? ''), // Etapa 185 (RN-185.09): o texto da versao, literal; a quebra e do desenho
    assinaturaUrl: resolveMaterialPhotoUrl(ev.arquivo_url),
    hashRegistro: ev.registro_sha256 || '—',
    hashTexto: t.texto_sha256 || '—',
    geradoEm: formatarDataDoBanco(hojeLocalISO(lerInstanteDoBanco(geradoEm) || new Date())),
    nomeArquivo: `termo-${String(t.numero || emprestimo?.id || 'emprestimo').replace(/[^A-Za-z0-9-]+/g, '-')}.pdf`,
  };
}

/** Desenha e dispara o download. `carregarImagem` injetavel (teste). Devolve o descritor + `assinaturaIndisponivel`. */
export async function gerarTermoFerramentaPdf(dados, { carregarImagem = carregarImagemComoDataUrl } = {}) {
  const doc = montarTermoFerramenta(dados);
  const imagem = await carregarImagem(doc.assinaturaUrl);
  const pdf = new jsPDF({ format: 'a4', orientation: 'portrait', unit: 'mm' });
  const M = 14;
  let y = 18;
  const pular = (dy) => { y += dy; if (y > 280) { pdf.addPage(); y = 18; } };
  // Etapa 185 (RN-185.08, B1219): toda linha de identificacao quebra por LARGURA medida na fonte corrente (o setFontSize vem antes),
  // de margem a margem; cada linha quebrada avanca 5 mm e a ULTIMA mantem o passo de antes — com texto curto, o y e o mesmo de hoje.
  // Antes: "Registrado por" com nome de 44 letras ia a 199,9 mm (margem 196), e os nomes nao tem tamanho maximo no cadastro.
  const LARGURA_UTIL = 196 - M;
  const linhasQuebradas = (texto, passoFinal) => {
    const linhas = pdf.splitTextToSize(String(texto), LARGURA_UTIL).map((s) => String(s).replace(/\s+$/, ''));
    linhas.forEach((s, j) => { pdf.text(s, M, y); pular(j < linhas.length - 1 ? 5 : passoFinal); });
  };

  pdf.setFontSize(14);
  linhasQuebradas(doc.titulo, 6);
  pdf.setFontSize(9);
  linhasQuebradas(`Versão do texto: ${doc.versao}    Gerado em ${doc.geradoEm}`, 5);
  if (doc.avisoProvisorio) linhasQuebradas(doc.avisoProvisorio, 5);
  pular(2);
  linhasQuebradas(`Ferramenta: ${doc.ferramenta.codigo} — ${doc.ferramenta.nome}    Série: ${doc.ferramenta.serie}`, 5);
  linhasQuebradas(`Colaborador: ${doc.colaborador.nome}    Matrícula: ${doc.colaborador.matricula}    Setor: ${doc.colaborador.setor}`, 5);
  linhasQuebradas(`Devolução prevista: ${doc.dataPrevista}    Registrado por: ${doc.registradoPor}    Assinado em: ${doc.assinadoEm}`, 7);

  // o texto da versao: fonte 10, medido DEPOIS do setFontSize(10) (emenda M3)
  pdf.setFontSize(10);
  quebrarTexto(doc.texto, LARGURA_UTIL, (s) => pdf.getTextWidth(s)).forEach((l) => { pdf.text(l, M, y); pular(4.6); });
  pular(4);

  pdf.setFontSize(9);
  linhasQuebradas(`Matrícula confirmada pelo colaborador: ${doc.matriculaConfirmada}`, 3);
  if (y > 245) { pdf.addPage(); y = 18; }
  if (imagem) {
    pdf.addImage(imagem, 'PNG', M, y, 80, 30);
    y += 32;
  } else {
    pular(4);
    pdf.text('(imagem da assinatura indisponível)', M, y);
    pular(4);
  }
  pdf.line(M, y, 110, y);
  pular(4);
  linhasQuebradas(`Assinatura de ${doc.colaborador.nome}`, 7);
  pdf.setFontSize(7);
  pdf.text(`Termo ${doc.numero} · registro (HMAC-SHA256): ${doc.hashRegistro}`, M, y);
  pular(3.5);
  pdf.text(`Texto da versão ${doc.versao} (SHA-256): ${doc.hashTexto}`, M, y);

  pdf.save(doc.nomeArquivo);
  return { ...doc, assinaturaIndisponivel: !imagem };
}
