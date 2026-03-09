/**
 * Geração de PDF da proposta com PDFKit (sem Puppeteer).
 * Funciona em qualquer hospedagem, sem necessidade de Chrome/Chromium.
 */
const PDFDocument = require('pdfkit');
const path = require('path');
const fs = require('fs');

const DATA_DIR = path.join(__dirname, 'data');
const UPLOADS_LOGO = path.join(DATA_DIR, 'uploads', 'logos');
const UPLOADS_HEADERS = path.join(DATA_DIR, 'uploads', 'headers');
const UPLOADS_FOOTERS = path.join(DATA_DIR, 'uploads', 'footers');

function formatMoney(v) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v) || 0);
}

const FOOTER_RESERVE = 50; // espaço reservado para rodapé (imagem ou texto)

function checkNewPage(doc, y, margin, need) {
  if (y > doc.page.height - margin - FOOTER_RESERVE - need) {
    doc.addPage();
    return margin;
  }
  return y;
}

/**
 * Gera o buffer do PDF da proposta.
 */
function gerarPDFProposta(proposta, itens, totais, templateConfig) {
  return new Promise((resolve, reject) => {
    const config = templateConfig || {};
    const margin = 50;
    const doc = new PDFDocument({
      size: 'A4',
      margin,
      bufferPages: true
    });

    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const numeroProposta = proposta.numero_proposta || proposta.id || 'N/A';
    const pageWidth = doc.page.width - margin * 2;
    const pageHeight = doc.page.height;

    let y = margin;

    // ---- CAPA: Imagem de cabeçalho (se configurada) ----
    const headerPath = config.header_image_url ? path.join(UPLOADS_HEADERS, config.header_image_url) : null;
    if (headerPath && fs.existsSync(headerPath)) {
      try {
        doc.image(headerPath, margin, y, { width: pageWidth, height: 70 });
        y += 70;
      } catch (e) {
        console.warn('Cabeçalho não carregado no PDF:', e.message);
      }
    }

    // ---- CAPA: Título + logo da empresa (template) à direita ----
    const logoPath = config.logo_url ? path.join(UPLOADS_LOGO, config.logo_url) : null;
    if (logoPath && fs.existsSync(logoPath)) {
      try {
        doc.image(logoPath, doc.page.width - margin - 120, y, { width: 100, height: 70 });
      } catch (e) {
        console.warn('Logo GMP não carregado no PDF:', e.message);
      }
    }
    doc.fontSize(22).font('Helvetica-Bold').fillColor('#1a4d7a').text('PROPOSTA TÉCNICA', margin, y, { width: pageWidth - 130 });
    y += 22;
    doc.fontSize(22).font('Helvetica-Bold').text('COMERCIAL', margin, y, { width: pageWidth - 130 });
    y += 26;
    doc.fontSize(20).fillColor('#0d2b4a').text(`Nº ${numeroProposta}`, margin, y, { width: pageWidth - 130 });
    y += 28;
    doc.fontSize(10).fillColor('#333').text('Excelência em Soluções Industriais', margin, y, { width: pageWidth - 130 });
    y += 30;

    // ---- CAPA: Logo do cliente (se tiver) ----
    const clienteLogoPath = proposta.cliente_logo_url ? path.join(UPLOADS_LOGO, proposta.cliente_logo_url) : null;
    if (clienteLogoPath && fs.existsSync(clienteLogoPath)) {
      try {
        doc.image(clienteLogoPath, margin + (pageWidth / 2) - 62, y, { width: 124, height: 124 });
        y += 130;
      } catch (e) {
        console.warn('Logo do cliente não carregado no PDF:', e.message);
      }
    }
    y += 10;

    doc.moveTo(margin, y).lineTo(doc.page.width - margin, y).stroke().fillColor('#000');
    y += 22;

    // ---- Dados do cliente ----
    doc.fontSize(12).font('Helvetica-Bold').text('DADOS DO CLIENTE', margin, y);
    y += 20;
    doc.fontSize(10).font('Helvetica');
    const cliente = [
      proposta.razao_social && `Razão Social: ${proposta.razao_social}`,
      proposta.nome_fantasia && `Nome Fantasia: ${proposta.nome_fantasia}`,
      proposta.cnpj && `CNPJ: ${proposta.cnpj}`,
      (proposta.cliente_endereco || proposta.cliente_cidade) &&
        `Endereço: ${[proposta.cliente_endereco, proposta.cliente_cidade, proposta.cliente_estado, proposta.cliente_cep].filter(Boolean).join(', ')}`,
      proposta.cliente_contato && `Contato: ${proposta.cliente_contato}`,
      proposta.cliente_telefone && `Telefone: ${proposta.cliente_telefone}`,
      proposta.cliente_email && `E-mail: ${proposta.cliente_email}`
    ].filter(Boolean);
    cliente.forEach((linha) => {
      y = checkNewPage(doc, y, margin, 80);
      doc.text(linha, margin, y, { width: pageWidth });
      y += 16;
    });
    y += 18;

    const secao = (titulo, texto) => {
      y = checkNewPage(doc, y, margin, 120);
      doc.fontSize(11).font('Helvetica-Bold').text(titulo, margin, y);
      y += 16;
      doc.fontSize(10).font('Helvetica').text(texto, margin, y, { width: pageWidth, align: 'justify' });
      y += doc.heightOfString(texto, { width: pageWidth }) + 12;
    };

    secao('1. OBJETIVO DA PROPOSTA', 'Apresentar condições técnicas e comerciais, para fornecimento de peças e acessórios para equipamentos.');

    secao('2. ELABORAÇÃO DA PROPOSTA', 'A proposta apresentada a seguir foi elaborada atendendo às solicitações e especificações informadas pelo CONTRATANTE, através de reunião e/ou e-mail. Deve-se atentar que os itens oferecidos estão descriminados e especificados nesta proposta técnica comercial. Os parâmetros e dimensionamentos dos equipamentos e garantias relacionadas nesta proposta estão baseadas nas condições e características dos produtos, disponibilizadas pelo CONTRATANTE. Qualquer alteração, inclusão ou exclusão no escopo ofertado deve ser solicitada para revisão deste documento.');

    const textoApresentacao = 'A MOINHO YPIRANGA é uma empresa especializada no desenvolvimento de projetos e instalações industriais. Somos uma das maiores empresas com foco e participação no desenvolvimento, fabricação e comercialização de equipamentos para produção de produtos químicos do MERCOSUL, destacando nossas competências no fornecimento de plantas em regime Turn-Key. Neste regime Turn-Key, quando contratado, assumimos o gerenciamento integral de todas as etapas de implantação do empreendimento, entregando a planta totalmente construída e pronta para o funcionamento. Todas as fases desse processo contam com o suporte de recursos tecnológicos adequados, com um moderno sistema de gestão de projetos, além de uma equipe técnica própria e altamente qualificada para atender às necessidades do cliente.';
    secao('3. APRESENTAÇÃO DA EMPRESA', textoApresentacao);

    // ---- 4. ESCOPO - Tabela de produtos ----
    y = checkNewPage(doc, y, margin, 150);
    doc.fontSize(11).font('Helvetica-Bold').text('4. ESCOPO DE FORNECIMENTO', margin, y);
    y += 18;

    const itensList = Array.isArray(itens) ? itens : [];
    const colDesc = margin;
    const colQtd = margin + pageWidth - 180;
    const colUnit = margin + pageWidth - 130;
    const colTotal = margin + pageWidth - 70;
    const rowH = 18;

    doc.fontSize(9).font('Helvetica-Bold');
    doc.text('Item / Descrição', colDesc, y);
    doc.text('Qtd', colQtd, y);
    doc.text('Valor unit.', colUnit, y);
    doc.text('Total', colTotal, y);
    y += rowH;
    doc.moveTo(margin, y).lineTo(doc.page.width - margin, y).stroke();
    y += 10;

    doc.font('Helvetica').fontSize(9);
    itensList.forEach((item, index) => {
      y = checkNewPage(doc, y, margin, 50);
      const nome = (item.descricao || item.produto_nome || item.nome || 'Item').substring(0, 55);
      const qtd = item.quantidade != null ? item.quantidade : 1;
      const vUnit = parseFloat(item.valor_unitario) || parseFloat(item.preco_base) || 0;
      const vTotal = vUnit * qtd;
      doc.text(`${index + 1}. ${nome}`, colDesc, y, { width: colQtd - colDesc - 5 });
      doc.text(String(qtd), colQtd, y);
      doc.text(formatMoney(vUnit), colUnit, y);
      doc.text(formatMoney(vTotal), colTotal, y);
      y += rowH;
    });
    y += 18;

    // ---- 5. VALORES ----
    y = checkNewPage(doc, y, margin, 180);
    doc.fontSize(11).font('Helvetica-Bold').text('5. VALORES', margin, y);
    y += 20;

    const sub = Number(totais.subtotal) || 0;
    const icmsVal = Number(totais.icms) || 0;
    const ipiVal = Number(totais.ipi) || 0;
    const totalVal = Number(totais.total) || sub + icmsVal + ipiVal;
    const colVal = margin + pageWidth - 95;
    doc.fontSize(10).font('Helvetica');
    doc.text('Subtotal:', margin, y); doc.text(formatMoney(sub), colVal, y);
    y += 18;
    doc.text('ICMS:', margin, y); doc.text(formatMoney(icmsVal), colVal, y);
    y += 18;
    doc.text('IPI:', margin, y); doc.text(formatMoney(ipiVal), colVal, y);
    y += 20;
    doc.font('Helvetica-Bold').text('TOTAL:', margin, y); doc.text(formatMoney(totalVal), colVal, y);
    y += 24;

    if (totais.dataEmissao || totais.dataValidade) {
      doc.font('Helvetica');
      if (totais.dataEmissao) { doc.text(`Data de emissão: ${totais.dataEmissao}`, margin, y); y += 16; }
      if (totais.dataValidade) { doc.text(`Validade: ${totais.dataValidade}`, margin, y); y += 16; }
    }
    y += 18;

    // ---- 6. CONDIÇÕES COMERCIAIS ----
    if (proposta.condicoes_pagamento || proposta.prazo_entrega || proposta.garantia || proposta.observacoes) {
      y = checkNewPage(doc, y, margin, 120);
      doc.fontSize(11).font('Helvetica-Bold').text('6. CONDIÇÕES COMERCIAIS', margin, y);
      y += 18;
      doc.fontSize(10).font('Helvetica');
      if (proposta.condicoes_pagamento) {
        doc.text('Condições de pagamento: ' + proposta.condicoes_pagamento, margin, y, { width: pageWidth });
        y += 16;
      }
      if (proposta.prazo_entrega) {
        doc.text('Prazo de entrega: ' + proposta.prazo_entrega, margin, y, { width: pageWidth });
        y += 16;
      }
      if (proposta.garantia) {
        doc.text('Garantia: ' + proposta.garantia, margin, y, { width: pageWidth });
        y += 16;
      }
      if (proposta.observacoes) {
        doc.text('Observações: ' + proposta.observacoes, margin, y, { width: pageWidth });
        y += doc.heightOfString(proposta.observacoes, { width: pageWidth }) + 10;
      }
      y += 12;
    }

    // ---- Contato ----
    y = checkNewPage(doc, y, margin, 80);
    doc.fontSize(10).font('Helvetica').fillColor('#333');
    doc.text('Para dúvidas ou negociação: contato@gmp.ind.br · +55 (11) 4513-9570 · www.gmp.ind.br', margin, y, { width: pageWidth, align: 'center' });

    // ---- Rodapé em todas as páginas (imagem se configurada, senão texto) ----
    const totalPages = doc.bufferedPageRange().count;
    const footerImgPath = config.footer_image_url ? path.join(UPLOADS_FOOTERS, config.footer_image_url) : null;
    const footerImgH = 28;
    const footerY = pageHeight - margin - (footerImgPath && fs.existsSync(footerImgPath) ? footerImgH + 5 : 18);

    for (let i = 0; i < totalPages; i++) {
      doc.switchToPage(i);
      doc.fontSize(9).font('Helvetica').fillColor('#333');
      if (footerImgPath && fs.existsSync(footerImgPath)) {
        try {
          doc.image(footerImgPath, margin, pageHeight - margin - footerImgH, { width: pageWidth, height: footerImgH });
        } catch (e) {
          doc.text(`Moinho Ypiranga · Proposta nº ${numeroProposta}`, margin, footerY, { width: pageWidth / 2 });
          doc.text('contato@gmp.ind.br · +55 (11) 4513-9570 · www.gmp.ind.br', margin + pageWidth / 2, footerY, { width: pageWidth / 2, align: 'right' });
        }
      } else {
        doc.text(`Moinho Ypiranga · Proposta nº ${numeroProposta}`, margin, footerY, { width: pageWidth / 2 });
        doc.text('contato@gmp.ind.br · +55 (11) 4513-9570 · www.gmp.ind.br', margin + pageWidth / 2, footerY, { width: pageWidth / 2, align: 'right' });
      }
    }

    doc.end();
  });
}

module.exports = { gerarPDFProposta };
