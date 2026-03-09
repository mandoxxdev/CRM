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
const UPLOADS_PRODUTOS = path.join(DATA_DIR, 'uploads', 'produtos');

function formatMoney(v) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v) || 0);
}

/**
 * Gera o buffer do PDF da proposta.
 * @param {Object} proposta - dados da proposta
 * @param {Array} itens - itens da proposta (com produto)
 * @param {Object} totais - { subtotal, icms, ipi, total, dataEmissao, dataValidade }
 * @param {Object} templateConfig - configuração do template (logo_url, margin_*, etc.)
 * @returns {Promise<Buffer>}
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

    // ---- Cabeçalho ----
    let y = margin;
    const logoPath = config.logo_url ? path.join(UPLOADS_LOGO, config.logo_url) : null;
    if (logoPath && fs.existsSync(logoPath)) {
      try {
        doc.image(logoPath, margin, y, { width: 80, height: 50 });
      } catch (e) {
        console.warn('Logo não carregado no PDF:', e.message);
      }
    }
    doc.fontSize(22).font('Helvetica-Bold').text('PROPOSTA TÉCNICA COMERCIAL', margin, y, { align: 'right', width: pageWidth - 100 });
    y += 28;
    doc.fontSize(18).text(`Nº ${numeroProposta}`, margin, y, { align: 'right', width: pageWidth - 100 });
    y += 35;
    doc.moveTo(margin, y).lineTo(doc.page.width - margin, y).stroke();
    y += 20;

    // ---- Dados do cliente ----
    doc.fontSize(12).font('Helvetica-Bold').text('DADOS DO CLIENTE', margin, y);
    y += 22;
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
      if (y > doc.page.height - margin - 80) {
        doc.addPage();
        y = margin;
      }
      doc.text(linha, margin, y, { width: pageWidth });
      y += 18;
    });
    y += 15;

    // ---- Seções de texto (resumidas) ----
    const secao = (titulo, texto) => {
      if (y > doc.page.height - margin - 100) {
        doc.addPage();
        y = margin;
      }
      doc.fontSize(11).font('Helvetica-Bold').text(titulo, margin, y);
      y += 18;
      doc.fontSize(10).font('Helvetica').text(texto, margin, y, { width: pageWidth, align: 'justify' });
      y += doc.heightOfString(texto, { width: pageWidth }) + 15;
    };

    secao('1. OBJETIVO DA PROPOSTA', 'Apresentar condições técnicas e comerciais, para fornecimento de peças e acessórios para equipamentos.');
    secao('2. ELABORAÇÃO DA PROPOSTA', 'A proposta foi elaborada atendendo às solicitações e especificações informadas pelo CONTRATANTE. Qualquer alteração no escopo deve ser solicitada para revisão do documento.');

    // ---- Escopo / Produtos ----
    if (y > doc.page.height - margin - 120) {
      doc.addPage();
      y = margin;
    }
    doc.fontSize(11).font('Helvetica-Bold').text('4. ESCOPO DE FORNECIMENTO', margin, y);
    y += 22;

    const itensList = Array.isArray(itens) ? itens : [];
    itensList.forEach((item, index) => {
      if (y > doc.page.height - margin - 100) {
        doc.addPage();
        y = margin;
      }
      const nome = item.descricao || item.produto_nome || item.nome || 'Item';
      const qtd = item.quantidade != null ? item.quantidade : 1;
      const vUnit = parseFloat(item.valor_unitario) || parseFloat(item.preco_base) || 0;
      const vTotal = vUnit * qtd;
      doc.fontSize(10).font('Helvetica-Bold').text(`${index + 1}. ${nome}`, margin, y, { width: pageWidth - 120 });
      doc.font('Helvetica').text(`Quantidade: ${qtd}   |   Valor unit.: ${formatMoney(vUnit)}   |   Total: ${formatMoney(vTotal)}`, margin, y + 14, { width: pageWidth });
      y += 38;
    });
    y += 15;

    // ---- Tabela de valores ----
    if (y > doc.page.height - margin - 150) {
      doc.addPage();
      y = margin;
    }
    doc.fontSize(11).font('Helvetica-Bold').text('VALORES', margin, y);
    y += 22;

    const sub = Number(totais.subtotal) || 0;
    const icmsVal = Number(totais.icms) || 0;
    const ipiVal = Number(totais.ipi) || 0;
    const totalVal = Number(totais.total) || sub + icmsVal + ipiVal;
    const colVal = margin + pageWidth - 100;
    doc.fontSize(10).font('Helvetica');
    doc.text('Subtotal:', margin, y); doc.text(formatMoney(sub), colVal, y);
    y += 20;
    doc.text('ICMS:', margin, y); doc.text(formatMoney(icmsVal), colVal, y);
    y += 20;
    doc.text('IPI:', margin, y); doc.text(formatMoney(ipiVal), colVal, y);
    y += 22;
    doc.font('Helvetica-Bold').text('TOTAL:', margin, y); doc.text(formatMoney(totalVal), colVal, y);
    y += 28;

    if (totais.dataEmissao || totais.dataValidade) {
      doc.font('Helvetica');
      if (totais.dataEmissao) { doc.text(`Data de emissão: ${totais.dataEmissao}`, margin, y); y += 18; }
      if (totais.dataValidade) { doc.text(`Validade: ${totais.dataValidade}`, margin, y); y += 18; }
    }

    // ---- Rodapé em todas as páginas ----
    const totalPages = doc.bufferedPageRange().count;
    const footerY = doc.page.height - margin - 15;
    for (let i = 0; i < totalPages; i++) {
      doc.switchToPage(i);
      doc.fontSize(9).font('Helvetica').fillColor('#333');
      doc.text(`Moinho Ypiranga · Proposta nº ${numeroProposta}`, margin, footerY, { width: pageWidth / 2 });
      doc.text('contato@gmp.ind.br · +55 (11) 4513-9570 · www.gmp.ind.br', margin + pageWidth / 2, footerY, { width: pageWidth / 2, align: 'right' });
    }

    doc.end();
  });
}

module.exports = { gerarPDFProposta };
