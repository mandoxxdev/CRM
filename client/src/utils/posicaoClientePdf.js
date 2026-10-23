// Etapa 8, Task 8: PDF de posicao por cliente, gerado no NAVEGADOR — zero mudanca de servidor,
// mesmo padrao validado em utils/etiquetasPdf.js (Etapa 6c). O montador e puro (testavel sem DOM
// nem binario); so gerarPosicaoClientePDF toca no jspdf.
//
// Por que o descritor existe em vez de desenhar direto: e a moeda entre a tela, o teste e o
// renderizador. Assertar sobre bytes de PDF nao diz se o numero certo foi para a coluna certa —
// e num documento que o cliente recebe para conferir o patrimonio dele, essa e a unica falha
// que importa.

import jsPDF from 'jspdf';
import { formatarDataDoBanco, hojeLocalISO, lerInstanteDoBanco } from './dataLocal';
import {
  utilDasColunas, prepararCelulas, desenharCelulasComFonte, desenharQuebrado, formatarQuantidade,
} from './pdfTexto';

// Fix-round da Fase 5 da 186 (M-c): o formato das telas do modulo (pt-BR, ate 4 casas) — antes `String(Number(v))`, que imprimia o ruido
// de ponto flutuante (`0.30000000000000004`) e o quebrava em `0.300000000` / `00000004`: duas linhas de algarismos parecem dois numeros.
const num = (v) => formatarQuantidade(v);

// Etapa 170 (RN-170.04, B1082): o *Gerado em* no dia LOCAL de quem gera (o `{ timeZone: 'UTC' }` imprimia o dia UTC — das 21h a
// meia-noite, o de amanha); vazio ou ilegivel -> hoje (antes, ilegivel imprimia *Invalid Date*).
const formatDataBR = (instante) => formatarDataDoBanco(hojeLocalISO(lerInstanteDoBanco(instante) || new Date()));

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

// Etapa 186 (B1230, B1232, B1233, B1236; corrige a B1220 da 185) — o cliente confere o patrimonio dele por este papel. Antes cada celula
// era cortada por CONTAGEM (34 letras nos itens, 60 nas aplicacoes) numa linha so, sem medir: o codigo de EPI de 17 letras invadia a
// coluna Material, o nome de 71 letras perdia as ultimas 37 e o projeto de 80 perdia 20. Agora cada celula QUEBRA em quantas linhas
// precisar (a linha fica mais alta; nenhuma letra perdida) e as colunas foram redistribuidas — medidas com o jsPDF real.
// Fix-round da Fase 5 (M-b): a coluna Un. tinha 11 mm e partia `TAMBOR` (13,1 mm em f9, unidade da lista do cadastro) em `TAMBO` / `R`; agora
// 14 mm (cabem todas as 16 unidades do cadastro), tirados das colunas de numero (19, 19, 19 e 21 mm — os cabecalhos cabem: `Consumido` 15,9).
const COLUNAS_ITENS = [14, 48, 100, 115, 135, 155, 175]; // = M, M + 34, M + 86, M + 101, M + 121, M + 141, M + 161
const COLUNAS_APLICACOES = [14, 48, 144]; // = M, M + 34, M + 130
const UTIL_ITENS = utilDasColunas(COLUNAS_ITENS); // [33, 51, 14, 19, 19, 19, 21]
const UTIL_APLICACOES = utilDasColunas(COLUNAS_APLICACOES); // [33, 95, 52]
const LARGURA_TEXTO = 182; // 196 - M
// Colunas de numero: nunca quebram — encolhem a fonte ate caber (M-c). Itens: Recebido, Consumido, Devolvido, Saldo; aplicacoes: Quantidade.
const NUMERICAS_ITENS = [3, 4, 5, 6];
const NUMERICAS_APLICACOES = [2];

/**
 * Desenha uma tabela a partir de `y` e devolve o y depois da ultima linha. A linha cresce (B1233): 5 mm na primeira (o passo de hoje),
 * 4 nas de continuacao; so comeca na pagina se a ULTIMA linha dela fica ate `limite` (o de hoje) — o item nao e partido entre paginas. O
 * cabecalho e repetido depois de todo addPage (emenda I4 da Fase 2, B1234): sem ele, na pagina 2 as colunas de numero ficam sem nome.
 */
function desenharTabela(pdf, {
  cabecalho, linhas, colunas, util, limite, numericas,
}, yInicial) {
  let y = yInicial;
  const desenharCabecalho = () => {
    cabecalho.forEach((h, i) => pdf.text(h, colunas[i], y));
    y += 2;
    pdf.line(colunas[0], y, 196, y);
    y += 5;
  };
  desenharCabecalho();
  for (const linha of linhas) {
    const celulas = prepararCelulas(pdf, linha, util, { numericas, fonte: 9 });
    const n = Math.max(...celulas.linhas.map((l) => l.length));
    if (y + 4 * (n - 1) > limite) { pdf.addPage(); y = 18; desenharCabecalho(); }
    desenharCelulasComFonte(pdf, celulas, colunas, y, 4, 9);
    y += 5 + 4 * (n - 1);
  }
  return y;
}

/** Desenha e dispara o download. Sem autoTable: a grade e simples e cabe em texto posicionado. */
export function gerarPosicaoClientePDF(dados) {
  const doc = montarPosicaoClientePDF(dados);
  const pdf = new jsPDF({ format: 'a4', orientation: 'portrait', unit: 'mm' });
  const M = 14;
  let y = 18;

  // O titulo traz a razao social e quebra em 182 mm (B1236): a de 69 letras (a maior do banco de hoje) ia a 233,8 mm.
  pdf.setFontSize(14);
  y = desenharQuebrado(pdf, doc.titulo, M, y, LARGURA_TEXTO, 6);
  pdf.setFontSize(9);
  pdf.text(`Gerado em ${doc.geradoEm}`, M, y);
  y += 8;

  pdf.setFontSize(9);
  y = desenharTabela(pdf, {
    cabecalho: doc.cabecalhoItens, linhas: doc.linhasItens, colunas: COLUNAS_ITENS, util: UTIL_ITENS, limite: 275, numericas: NUMERICAS_ITENS,
  }, y);
  y += 2;
  pdf.line(M, y, 196, y);
  y += 5;
  pdf.text(`Saldo total: ${num(doc.totalSaldo)}`, M, y);
  y += 10;

  if (doc.linhasAplicacoes.length > 0) {
    if (y > 250) { pdf.addPage(); y = 18; }
    pdf.setFontSize(11);
    pdf.text('Aplicações por OS / projeto', M, y);
    y += 6;
    pdf.setFontSize(9);
    y = desenharTabela(pdf, {
      cabecalho: doc.cabecalhoAplicacoes, linhas: doc.linhasAplicacoes, colunas: COLUNAS_APLICACOES, util: UTIL_APLICACOES, limite: 280,
      numericas: NUMERICAS_APLICACOES,
    }, y);
  }

  pdf.save(`posicao-${(dados?.cliente?.razao_social || 'cliente').replace(/\W+/g, '-').toLowerCase()}.pdf`);
}
