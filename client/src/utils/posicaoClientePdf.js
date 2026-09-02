// Etapa 8, Task 8: PDF de posicao por cliente, gerado no NAVEGADOR — zero mudanca de servidor,
// mesmo padrao validado em utils/etiquetasPdf.js (Etapa 6c). O montador e puro (testavel sem DOM
// nem binario); so gerarPosicaoClientePDF toca no jspdf.
//
// Por que o descritor existe em vez de desenhar direto: e a moeda entre a tela, o teste e o
// renderizador. Assertar sobre bytes de PDF nao diz se o numero certo foi para a coluna certa —
// e num documento que o cliente recebe para conferir o patrimonio dele, essa e a unica falha
// que importa.

import jsPDF from 'jspdf';

const num = (v) => String(Number(v || 0));

const formatDataBR = (iso) => {
  const d = iso ? new Date(iso) : new Date();
  return d.toLocaleDateString('pt-BR', { timeZone: 'UTC' });
};

/** Descritor do documento — a moeda entre a tela, o teste e o renderizador. */
export function montarPosicaoClientePDF({ cliente, itens = [], aplicacoes = [], geradoEm } = {}) {
  const listaItens = itens || [];
  const linhasItens = listaItens.map((i) => [
    i.codigo, i.nome, i.unidade, num(i.recebido), num(i.consumido), num(i.devolvido), num(i.saldo),
  ]);
  // Linha sem OS e sem projeto fica de FORA: o servico ja nao devolve essas (a guarda do dono
  // impede saida de material de cliente sem vinculo), e imprimir "aplicado em —" no documento do
  // cliente parece rastreabilidade perdida, nao dado ausente.
  const linhasAplicacoes = (aplicacoes || [])
    .filter((a) => a.numero_os || a.projeto_nome)
    .map((a) => [
      a.codigo,
      a.numero_os ? `OS ${a.numero_os}` : a.projeto_nome,
      num(a.quantidade),
    ]);
  return {
    titulo: `Posição de materiais — ${cliente?.razao_social || 'cliente'}`,
    geradoEm: formatDataBR(geradoEm),
    cabecalhoItens: ['Código', 'Material', 'Un.', 'Recebido', 'Consumido', 'Devolvido', 'Saldo'],
    linhasItens,
    cabecalhoAplicacoes: ['Código', 'Aplicado em', 'Quantidade'],
    linhasAplicacoes,
    totalSaldo: listaItens.reduce((acc, i) => acc + Number(i.saldo || 0), 0),
  };
}

/** Desenha e dispara o download. Sem autoTable: a grade e simples e cabe em texto posicionado. */
export function gerarPosicaoClientePDF(dados) {
  const doc = montarPosicaoClientePDF(dados);
  const pdf = new jsPDF({ format: 'a4', orientation: 'portrait', unit: 'mm' });
  const M = 14;
  let y = 18;

  pdf.setFontSize(14);
  pdf.text(doc.titulo, M, y);
  y += 6;
  pdf.setFontSize(9);
  pdf.text(`Gerado em ${doc.geradoEm}`, M, y);
  y += 8;

  const colsItens = [M, M + 26, M + 84, M + 96, M + 116, M + 140, M + 164];
  pdf.setFontSize(9);
  doc.cabecalhoItens.forEach((h, i) => pdf.text(h, colsItens[i], y));
  y += 2;
  pdf.line(M, y, 196, y);
  y += 5;
  for (const linha of doc.linhasItens) {
    if (y > 275) { pdf.addPage(); y = 18; }
    linha.forEach((c, i) => pdf.text(String(c ?? '').slice(0, 34), colsItens[i], y));
    y += 5;
  }
  y += 2;
  pdf.line(M, y, 196, y);
  y += 5;
  pdf.text(`Saldo total: ${doc.totalSaldo}`, M, y);
  y += 10;

  if (doc.linhasAplicacoes.length > 0) {
    if (y > 250) { pdf.addPage(); y = 18; }
    pdf.setFontSize(11);
    pdf.text('Aplicações por OS / projeto', M, y);
    y += 6;
    pdf.setFontSize(9);
    const colsAp = [M, M + 30, M + 130];
    doc.cabecalhoAplicacoes.forEach((h, i) => pdf.text(h, colsAp[i], y));
    y += 2;
    pdf.line(M, y, 196, y);
    y += 5;
    for (const linha of doc.linhasAplicacoes) {
      if (y > 280) { pdf.addPage(); y = 18; }
      linha.forEach((c, i) => pdf.text(String(c ?? '').slice(0, 60), colsAp[i], y));
      y += 5;
    }
  }

  pdf.save(`posicao-${(dados?.cliente?.razao_social || 'cliente').replace(/\W+/g, '-').toLowerCase()}.pdf`);
}
