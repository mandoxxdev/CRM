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

    // ---- 4. ESCOPO DE FORNECIMENTO ----
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
    y += 20;

    // ---- 5. PRAZO DE ENTREGA ----
    secao('5. PRAZO DE ENTREGA', proposta.prazo_entrega || 'Dentro de 15 (quinze) dias úteis, a contar da data de confirmação do pedido via e compensação do pagamento (quando aplicável).');

    // ---- 6. TRANSPORTE E EMBALAGEM ----
    secao('6. TRANSPORTE E EMBALAGEM', 'Transporte: EXW (Ex Work) [Coleta na fábrica da Moinho Ypiranga]\nEmbalagem: Caixa de papelão e/ou plástico bolha');

    // ---- 7. VALIDADE DA PROPOSTA ----
    secao('7. VALIDADE DA PROPOSTA', 'Proposta válida por 15 (quinze) dias corridos, contados da data de emissão.');

    // ---- 8. GARANTIA ----
    secao('8. GARANTIA', (proposta.garantia || 'Garantia de 12 (doze) meses, contados da data de emissão da nota fiscal, contra defeitos de fabricação.') + ' Garantia válida, para peças colocadas na fábrica da Moinho Ypiranga.');

    // ---- 9. CONSIDERAÇÃO CONSTRUTIVA ----
    secao('9. CONSIDERAÇÃO CONSTRUTIVA', 'Fica entendido que todas as informações foram apresentadas ao CONTRATANTE nesta proposta técnica comercial, e foram suficientes para o entendimento e aceite do produto e/ou serviço que será fornecido, desta forma, qualquer informação e/ou característica que não foi apresentada previamente neste documento, seguirá o padrão do projeto e/ou serviço da CONTRATADA.');

    // ---- 10. EXCLUSO DO FORNECIMENTO ----
    const excluso = '• Transporte e seguro das peças;\n• Parafusos e buchas de fixação;\n• Serviço de instalação e montagem;\n• Eixos e hastes;\n• Projetos, croquis, laudos e certificados;\n• E demais itens não citados nesta proposta comercial.';
    secao('10. EXCLUSO DO FORNECIMENTO', excluso);

    // ---- 11. PREÇO E CONDIÇÃO DE PAGAMENTO ----
    y = checkNewPage(doc, y, margin, 200);
    doc.fontSize(11).font('Helvetica-Bold').text('11. PREÇO E CONDIÇÃO DE PAGAMENTO', margin, y);
    y += 20;
    doc.fontSize(10).font('Helvetica-Bold').text('Tabela de Preços', margin, y);
    y += 18;

    const colItem = margin;
    const colNome = margin + 35;
    const colQuant = margin + pageWidth - 200;
    const colPreco = margin + pageWidth - 145;
    const colTotalTab = margin + pageWidth - 75;
    doc.fontSize(9).font('Helvetica-Bold');
    doc.text('ITEM', colItem, y);
    doc.text('NOME DO ITEM', colNome, y, { width: colQuant - colNome - 5 });
    doc.text('QUANT.', colQuant, y);
    doc.text('PREÇO UNIT.', colPreco, y);
    doc.text('TOTAL', colTotalTab, y);
    y += rowH;
    doc.moveTo(margin, y).lineTo(doc.page.width - margin, y).stroke();
    y += 10;

    doc.font('Helvetica').fontSize(9);
    let totalProposta = 0;
    itensList.forEach((item, index) => {
      y = checkNewPage(doc, y, margin, 50);
      const nome = (item.descricao || item.produto_nome || item.nome || 'Item').substring(0, 45);
      const qtd = item.quantidade != null ? item.quantidade : 1;
      const vUnit = parseFloat(item.valor_unitario) || parseFloat(item.preco_base) || 0;
      const vTotal = vUnit * qtd;
      totalProposta += vTotal;
      doc.text('4.' + (index + 1), colItem, y);
      doc.text(nome, colNome, y, { width: colQuant - colNome - 5 });
      doc.text(String(qtd), colQuant, y);
      doc.text(formatMoney(vUnit), colPreco, y);
      doc.text(formatMoney(vTotal), colTotalTab, y);
      y += rowH;
    });
    y += 8;
    doc.font('Helvetica-Bold').fillColor('#ff6b35');
    doc.text('TOTAL DA PROPOSTA', margin, y, { width: pageWidth - 80 });
    doc.text(formatMoney(totalProposta), colTotalTab, y);
    doc.fillColor('#000');
    y += 22;
    doc.font('Helvetica').fontSize(10);
    doc.text('Condição de pagamento: ' + (proposta.condicoes_pagamento || '28/42/56DDL a partir da assinatura da proposta via boleto bancário.'), margin, y, { width: pageWidth });
    y += 24;

    // ---- 12. DADOS CADASTRAIS DA CONTRATADA ----
    y = checkNewPage(doc, y, margin, 280);
    doc.fontSize(11).font('Helvetica-Bold').text('12. DADOS CADASTRAIS DA CONTRATADA', margin, y);
    y += 20;
    doc.fontSize(10).font('Helvetica-Bold').text('INFORMAÇÕES GERAIS', margin, y);
    y += 16;
    doc.font('Helvetica').fontSize(9);
    const dadosCadastrais = [
      ['Nome Fantasia:', 'Moinho Ypiranga'],
      ['Razão Social:', 'Moinho Ypiranga indústria de maquinas Ltda'],
      ['CNPJ:', '13.273.368/0001-75'],
      ['Inscrição Estadual:', '799.890.695.115'],
      ['Inscrição Municipal:', '356.586-6'],
      ['Data de constituição:', '07/02/2011'],
      ['Logradouro:', 'Av. Ângelo Demarchi, n° 130'],
      ['CEP:', '09844-100'],
      ['Bairro:', 'Batistini'],
      ['Município:', 'São Bernardo do Campo'],
      ['Estado:', 'São Paulo'],
      ['País:', 'Brasil'],
      ['Telefone:', '+55 (11) 4513-9570'],
      ['E-mail comercial:', 'contato@gmp.ind.br / vendas@moinhoypiranga.com'],
      ['E-mail financeiro:', 'financeiro@gmp.ind.br / contato@moinhoypiranga.com'],
      ['Site:', 'www.gmp.ind.br / www.moinhoypiranga.com'],
      ['Regime tributário:', 'Lucro Presumido'],
      ['Ramo de Atividade:', 'Fabricação de maquinas e equipamentos industriais']
    ];
    const labelW = 120;
    dadosCadastrais.forEach(([label, value]) => {
      y = checkNewPage(doc, y, margin, 25);
      doc.font('Helvetica-Bold').text(label, margin, y, { width: labelW });
      doc.font('Helvetica').text(value, margin + labelW, y, { width: pageWidth - labelW });
      y += 14;
    });
    y += 12;

    // ---- 12.1. INFORMAÇÕES BANCÁRIAS ----
    y = checkNewPage(doc, y, margin, 80);
    doc.fontSize(11).font('Helvetica-Bold').text('12.1. INFORMAÇÕES BANCÁRIAS', margin, y);
    y += 18;
    doc.fontSize(9).font('Helvetica');
    [['Banco:', 'Itaú'], ['Agência:', '1690'], ['Conta corrente:', '65623-4'], ['Chave Pix (CNPJ):', '13.273.368/0001-75']].forEach(([l, v]) => {
      doc.font('Helvetica-Bold').text(l, margin, y, { width: labelW });
      doc.font('Helvetica').text(v, margin + labelW, y);
      y += 14;
    });
    y += 12;

    // ---- 13. CLASSIFICAÇÃO FISCAL E IMPOSTOS ----
    y = checkNewPage(doc, y, margin, 220);
    doc.fontSize(11).font('Helvetica-Bold').text('13. CLASSIFICAÇÃO FISCAL E IMPOSTOS', margin, y);
    y += 20;
    doc.fontSize(10).font('Helvetica-Bold').text('Classificação Fiscal', margin, y);
    y += 16;
    doc.font('Helvetica').fontSize(9);
    doc.text('NCM', margin, y);
    doc.text('IDENTIFICAÇÃO PRODUTOS MOINHO YPIRANGA', margin + 90, y, { width: pageWidth - 95 });
    y += 14;
    doc.moveTo(margin, y).lineTo(doc.page.width - margin, y).stroke();
    y += 10;
    doc.text('8474.39.00', margin, y);
    doc.text('Hélices, impelidores, discos, eixos, hastes, acoplamento, telas, e outros.', margin + 90, y, { width: pageWidth - 95 });
    y += 14;
    doc.text('7309.00.90', margin, y);
    doc.text('Tanques, tachos, reservatórios e baldes.', margin + 90, y, { width: pageWidth - 95 });
    y += 20;
    doc.font('Helvetica').fontSize(9).fillColor('#555');
    doc.text('Nota: Para outros produtos, a classificação fiscal deverá ser consultada caso a caso.', margin, y, { width: pageWidth });
    y += 22;
    doc.fillColor('#000');
    doc.font('Helvetica-Bold').fontSize(10).text('Tabela de Impostos e Alíquotas', margin, y);
    y += 16;
    doc.font('Helvetica').fontSize(8);
    const thFiscal = [margin, margin + 55, margin + 95, margin + 130, margin + 165, margin + 200, margin + 235];
    doc.text('NCM', thFiscal[0], y);
    doc.text('ICMS R1', thFiscal[1], y);
    doc.text('ICMS R2', thFiscal[2], y);
    doc.text('ICMS R3', thFiscal[3], y);
    doc.text('IPI', thFiscal[4], y);
    doc.text('PIS', thFiscal[5], y);
    doc.text('COFINS', thFiscal[6], y);
    y += 12;
    doc.text('8474.39.00', thFiscal[0], y);
    doc.text('18,00%', thFiscal[1], y);
    doc.text('12,00%', thFiscal[2], y);
    doc.text('7,00%', thFiscal[3], y);
    doc.text('0%', thFiscal[4], y);
    doc.text('0,65%', thFiscal[5], y);
    doc.text('3,00%', thFiscal[6], y);
    y += 12;
    doc.text('7309.00.90', thFiscal[0], y);
    doc.text('12,00%', thFiscal[1], y);
    doc.text('12,00%', thFiscal[2], y);
    doc.text('7,00%', thFiscal[3], y);
    doc.text('0%', thFiscal[4], y);
    doc.text('0,65%', thFiscal[5], y);
    doc.text('3,00%', thFiscal[6], y);
    y += 18;
    doc.fontSize(9);
    doc.text('Região 1: São Paulo (SP). Região 2: MG, PR, RJ, RS, SC. Região 3: demais estados.', margin, y, { width: pageWidth });
    y += 14;
    doc.font('Helvetica').fillColor('#555');
    doc.text('Nota: Redução tributária aplicada nos produtos NCM 8474.39.00, Inciso II, Artigo 12, Anexo II do RICMS/SP.', margin, y, { width: pageWidth });
    y += 22;
    doc.fillColor('#000');

    // ---- 14. REAJUSTE DE PREÇO ----
    secao('14. REAJUSTE DE PREÇO', 'Havendo alterações na legislação tributária vigente na época, a CONTRATADA se resguarda ao direito de atualizar os preços apresentados, de acordo com a nova tributação, com prévia aprovação do CONTRATANTE.\n\nPara vendas fora do território nacional (BRASIL), os preços apresentados nesta proposta técnica comercial, poderão ser reajustado pela taxa do Dólar Americano, valor comercial de venda, até a data do faturamento, utilizando como taxa base USD 1,00 = VALOR DA COTAÇÃO NA DATA DA PROPOSTA.');

    // ---- 15. CONSIDERAÇÃO FINAL ----
    y = checkNewPage(doc, y, margin, 140);
    doc.fontSize(11).font('Helvetica-Bold').text('15. CONSIDERAÇÃO FINAL', margin, y);
    y += 18;
    doc.fontSize(10).font('Helvetica');
    doc.text('Em caso de aceite e que não seja emitido um pedido de compra oficial formal, esta proposta torna-se apenas válida como pedido de compra mediante assinatura do responsável e com carimbo da empresa no campo destacado abaixo:', margin, y, { width: pageWidth });
    y += doc.heightOfString('Em caso de aceite e que não seja emitido um pedido de compra oficial formal, esta proposta torna-se apenas válida como pedido de compra mediante assinatura do responsável e com carimbo da empresa no campo destacado abaixo:', { width: pageWidth }) + 12;
    doc.rect(margin, y, pageWidth, 55).stroke();
    y += 12;
    doc.text('Data da assinatura: _____/_____/_____', margin + 10, y);
    y += 14;
    doc.text('Assinatura e carimbo da empresa CONTRATANTE:', margin + 10, y);
    y += 45;

    // ---- Assinaturas (Atenciosamente) ----
    y = checkNewPage(doc, y, margin, 100);
    doc.fontSize(11).font('Helvetica').text('Atenciosamente,', margin, y, { align: 'center', width: pageWidth });
    y += 28;
    const assinaturas = [
      { nome: 'Junior Machado', cargo: 'Diretor Comercial', tel: 'T +55 (11) 4513-9570', cel: 'M +55 (11) 9.9351-5046', email: 'junior@gmp.ind.br' },
      { nome: 'Bruno Machado', cargo: 'Gerente Comercial', tel: 'T +55 (11) 4513-9570', cel: 'M +55 (11) 9.9351-5543', email: 'bruno@gmp.ind.br' },
      { nome: 'Alex Junior', cargo: 'Vendas Técnica', tel: 'T +55 (11) 4513-9570', cel: 'M +55 (11) 9.8908-5127', email: 'alexjunior@gmp.ind.br' },
      { nome: 'Matheus Honrado', cargo: 'Vendas Técnica', tel: 'T +55 (11) 4513-9570', cel: 'M +55 (11) 9.3386-9232', email: 'matheus@gmp.ind.br' }
    ];
    const colWidth = pageWidth / 4;
    const baseY = y;
    assinaturas.forEach((a, i) => {
      const x = margin + i * colWidth + 8;
      const w = colWidth - 16;
      doc.fontSize(10).font('Helvetica-Bold').text(a.nome, x, baseY, { width: w, align: 'center' });
      doc.font('Helvetica').fontSize(9).text(a.cargo, x, baseY + 14, { width: w, align: 'center' });
      doc.fontSize(8).text(a.tel, x, baseY + 26, { width: w, align: 'center' });
      doc.text(a.cel, x, baseY + 36, { width: w, align: 'center' });
      doc.fillColor('#1a4d7a').text(a.email, x, baseY + 46, { width: w, align: 'center' });
      doc.fillColor('#000');
    });
    y = baseY + 62;

    // ---- Contato final ----
    y = checkNewPage(doc, y, margin, 40);
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
