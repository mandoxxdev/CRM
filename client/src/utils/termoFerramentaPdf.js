// Etapa 180 (T3, RN-180.05) — o termo de responsabilidade de um emprestimo de ferramenta, em PDF gerado no NAVEGADOR. Molde:
// utils/fichaEpiPdf.js — o montador (`montarTermoFerramenta`) e puro e testavel sem DOM nem binario (inclusive a quebra do texto em
// linhas); so `gerarTermoFerramentaPdf` toca no jspdf e na rede (a imagem da assinatura).
//
// E o documento de RECUPERACAO: o texto DA VERSAO ASSINADA (nao o vigente), a fotografia da ferramenta e do colaborador gravada no
// ato, a matricula que ele digitou, a assinatura e o hash do registro (que o "Verificar integridade" recalcula no servidor).

import jsPDF from 'jspdf';
import { formatarDataDoBanco, formatarInstanteDoBanco, hojeLocalISO, lerInstanteDoBanco, COM_SEGUNDOS } from './dataLocal';
import { resolveMaterialPhotoUrl } from './resolveMaterialPhotoUrl';
import { carregarImagemComoDataUrl } from './fichaEpiPdf';
import { matriculaConfirmadaTexto } from './termoFerramenta';

const txt = (v) => (v === null || v === undefined || String(v).trim() === '' ? '—' : String(v));

/** Quebra o texto em linhas de no maximo `largura` caracteres, respeitando os paragrafos e as palavras. Puro. */
export function quebrarTexto(texto, largura = 95) {
  const saida = [];
  String(texto ?? '').replace(/\r\n?/g, '\n').split('\n').forEach((paragrafo) => {
    const palavras = paragrafo.split(/\s+/).filter(Boolean);
    if (palavras.length === 0) { saida.push(''); return; }
    let linha = '';
    palavras.forEach((p) => {
      let palavra = p;
      while (palavra.length > largura) { // palavra maior que a linha (hash, URL): corta
        if (linha) { saida.push(linha); linha = ''; }
        saida.push(palavra.slice(0, largura));
        palavra = palavra.slice(largura);
      }
      if (!linha) linha = palavra;
      else if (linha.length + 1 + palavra.length <= largura) linha += ` ${palavra}`;
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
    linhasTexto: quebrarTexto(t.texto),
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

  pdf.setFontSize(14);
  pdf.text(doc.titulo, M, y);
  pular(6);
  pdf.setFontSize(9);
  pdf.text(`Versão do texto: ${doc.versao}    Gerado em ${doc.geradoEm}`, M, y);
  pular(5);
  if (doc.avisoProvisorio) { pdf.text(doc.avisoProvisorio, M, y); pular(5); }
  pular(2);
  pdf.text(`Ferramenta: ${doc.ferramenta.codigo} — ${doc.ferramenta.nome}    Série: ${doc.ferramenta.serie}`, M, y);
  pular(5);
  pdf.text(`Colaborador: ${doc.colaborador.nome}    Matrícula: ${doc.colaborador.matricula}    Setor: ${doc.colaborador.setor}`, M, y);
  pular(5);
  pdf.text(`Devolução prevista: ${doc.dataPrevista}    Registrado por: ${doc.registradoPor}    Assinado em: ${doc.assinadoEm}`, M, y);
  pular(7);

  pdf.setFontSize(10);
  doc.linhasTexto.forEach((l) => { pdf.text(l, M, y); pular(4.6); });
  pular(4);

  pdf.setFontSize(9);
  pdf.text(`Matrícula confirmada pelo colaborador: ${doc.matriculaConfirmada}`, M, y);
  pular(3);
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
  pdf.text(`Assinatura de ${doc.colaborador.nome}`, M, y);
  pular(7);
  pdf.setFontSize(7);
  pdf.text(`Termo ${doc.numero} · registro (HMAC-SHA256): ${doc.hashRegistro}`, M, y);
  pular(3.5);
  pdf.text(`Texto da versão ${doc.versao} (SHA-256): ${doc.hashTexto}`, M, y);

  pdf.save(doc.nomeArquivo);
  return { ...doc, assinaturaIndisponivel: !imagem };
}
