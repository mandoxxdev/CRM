import jsPDF from 'jspdf';
import 'jspdf-autotable';

import api from '../services/api';

export const gerarPDFProposta = async (propostaId) => {
  try {
    console.log('📄 Iniciando geração de PDF para proposta ID:', propostaId);
    
    // Buscar dados completos da proposta
    const response = await api.get(`/propostas/${propostaId}`);
    console.log('✅ Dados da proposta recebidos:', response.data);

    const proposta = response.data;
    
    if (!proposta) {
      throw new Error('Proposta não encontrada');
    }
    
    if (!proposta.id) {
      throw new Error('Dados da proposta inválidos');
    }
    
    console.log('📝 Criando PDF...');

    // Criar PDF
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    let yPos = 20;

    // Cores GMP
    const corPrimaria = [0, 102, 204]; // #0066cc

    // Cabeçalho com logo e informações da empresa
    doc.setFillColor(...corPrimaria);
    doc.rect(0, 0, pageWidth, 50, 'F');
    
    // Logo (se existir, senão texto)
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(24);
    doc.setFont('helvetica', 'bold');
    doc.text('GMP INDUSTRIAIS', pageWidth / 2, 20, { align: 'center' });
    
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text('Proposta Técnica e Comercial', pageWidth / 2, 30, { align: 'center' });
    doc.text('www.gmp.ind.br', pageWidth / 2, 40, { align: 'center' });

    yPos = 60;

    // Informações do Cliente
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('Cliente', 20, yPos);
    
    yPos += 8;
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`${proposta.razao_social || proposta.cliente_nome}`, 20, yPos);
    if (proposta.nome_fantasia) {
      yPos += 6;
      doc.text(`Nome Fantasia: ${proposta.nome_fantasia}`, 20, yPos);
    }
    if (proposta.cnpj) {
      yPos += 6;
      doc.text(`CNPJ: ${proposta.cnpj}`, 20, yPos);
    }
    if (proposta.endereco) {
      yPos += 6;
      doc.text(`Endereço: ${proposta.endereco}`, 20, yPos);
    }
    if (proposta.cidade && proposta.estado) {
      yPos += 6;
      doc.text(`${proposta.cidade} - ${proposta.estado}`, 20, yPos);
    }
    if (proposta.cep) {
      yPos += 6;
      doc.text(`CEP: ${proposta.cep}`, 20, yPos);
    }
    if (proposta.telefone) {
      yPos += 6;
      doc.text(`Telefone: ${proposta.telefone}`, 20, yPos);
    }
    if (proposta.email) {
      yPos += 6;
      doc.text(`E-mail: ${proposta.email}`, 20, yPos);
    }
    if (proposta.contato_principal) {
      yPos += 6;
      doc.text(`Contato: ${proposta.contato_principal}`, 20, yPos);
    }

    yPos += 10;

    // Informações da Proposta
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('Proposta', pageWidth - 20, 60, { align: 'right' });
    
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`Número: ${proposta.numero_proposta}`, pageWidth - 20, 70, { align: 'right' });
    
    const dataEmissao = proposta.created_at 
      ? new Date(proposta.created_at).toLocaleDateString('pt-BR')
      : new Date().toLocaleDateString('pt-BR');
    doc.text(`Emissão: ${dataEmissao}`, pageWidth - 20, 76, { align: 'right' });
    
    if (proposta.validade) {
      const dataValidade = new Date(proposta.validade).toLocaleDateString('pt-BR');
      doc.text(`Validade: ${dataValidade}`, pageWidth - 20, 82, { align: 'right' });
    }

    yPos = Math.max(yPos, 90) + 10;

    // Título da Proposta
    if (proposta.titulo) {
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text(proposta.titulo, 20, yPos);
      yPos += 8;
    }

    // Descrição
    if (proposta.descricao) {
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      const descricaoLines = doc.splitTextToSize(proposta.descricao, pageWidth - 40);
      doc.text(descricaoLines, 20, yPos);
      yPos += descricaoLines.length * 5 + 5;
    }

    // Tabela de Itens
    if (proposta.itens && Array.isArray(proposta.itens) && proposta.itens.length > 0) {
      yPos += 5;
      
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('1. Fornecimento', 20, yPos);
      yPos += 8;

      const tableData = proposta.itens.map((item, index) => {
        try {
          return [
            index + 1,
            item.descricao || '-',
            item.quantidade || 0,
            item.unidade || 'UN',
            new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.valor_unitario || 0),
            new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.valor_total || 0)
          ];
        } catch (err) {
          console.error('Erro ao processar item:', item, err);
          return [index + 1, '-', 0, 'UN', 'R$ 0,00', 'R$ 0,00'];
        }
      });

      try {
        doc.autoTable({
          startY: yPos,
          head: [['Item', 'Descrição', 'Qtde.', 'Un.', 'Valor Unit.', 'Valor Total']],
          body: tableData,
          theme: 'striped',
          headStyles: {
            fillColor: corPrimaria,
            textColor: [255, 255, 255],
            fontStyle: 'bold',
            fontSize: 9
          },
          styles: {
            fontSize: 8,
            cellPadding: 2.5,
            overflow: 'linebreak',
            cellWidth: 'wrap'
          },
          columnStyles: {
            0: { cellWidth: 18, halign: 'center' },
            1: { cellWidth: 'auto', halign: 'left' },
            2: { cellWidth: 25, halign: 'center' },
            3: { cellWidth: 22, halign: 'center' },
            4: { cellWidth: 35, halign: 'right' },
            5: { cellWidth: 35, halign: 'right', fontStyle: 'bold' }
          },
          margin: { left: 20, right: 20 },
          showHead: 'everyPage',
          showFoot: 'everyPage',
          alternateRowStyles: {
            fillColor: [245, 245, 245]
          },
          didDrawPage: function (data) {
            // Adicionar número da página
            doc.setFontSize(8);
            doc.setTextColor(100, 100, 100);
            doc.text(
              `Página ${doc.internal.getNumberOfPages()}`,
              pageWidth - 20,
              pageHeight - 10,
              { align: 'right' }
            );
          }
        });

        yPos = doc.lastAutoTable.finalY + 10;
      } catch (tableError) {
        console.error('Erro ao criar tabela:', tableError);
        // Continuar mesmo se a tabela falhar
        yPos += 20;
      }
    } else {
      console.log('⚠️ Nenhum item encontrado na proposta');
    }

    // Preço Total - sempre na mesma página ou próxima
    if (yPos > pageHeight - 30) {
      doc.addPage();
      yPos = 20;
    }
    
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.setFillColor(240, 240, 240);
    doc.rect(20, yPos - 5, pageWidth - 40, 15, 'F');
    
    doc.setTextColor(0, 0, 0);
    doc.text('Valor Total:', pageWidth - 60, yPos + 5, { align: 'right' });
    doc.setFontSize(14);
    doc.text(
      new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(proposta.valor_total || 0),
      pageWidth - 20,
      yPos + 5,
      { align: 'right' }
    );
    yPos += 20;

    // Verificar se precisa de nova página antes das condições
    if (yPos > pageHeight - 80) {
      doc.addPage();
      yPos = 20;
    }

    // Condições de Pagamento
    if (proposta.condicoes_pagamento) {
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('2. Condição de Pagamento', 20, yPos);
      yPos += 8;
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      const pagamentoLines = doc.splitTextToSize(proposta.condicoes_pagamento, pageWidth - 40);
      doc.text(pagamentoLines, 20, yPos);
      yPos += pagamentoLines.length * 5 + 10;
    }

    // Verificar se precisa de nova página
    if (yPos > pageHeight - 50) {
      doc.addPage();
      yPos = 20;
    }

    // Prazo de Entrega
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('3. Prazo de Entrega', 20, yPos);
    yPos += 8;
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text('A combinar conforme especificações técnicas e disponibilidade de materiais.', 20, yPos);
    yPos += 15;

    // Verificar se precisa de nova página
    if (yPos > pageHeight - 50) {
      doc.addPage();
      yPos = 20;
    }

    // Garantia
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('4. Garantia', 20, yPos);
    yPos += 8;
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text('Conforme condições gerais de fornecimento da GMP INDUSTRIAIS.', 20, yPos);
    yPos += 15;

    // Verificar se precisa de nova página
    if (yPos > pageHeight - 50) {
      doc.addPage();
      yPos = 20;
    }

    // Observações
    if (proposta.observacoes) {
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('5. Observações', 20, yPos);
      yPos += 8;
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      const obsLines = doc.splitTextToSize(proposta.observacoes, pageWidth - 40);
      doc.text(obsLines, 20, yPos);
      yPos += obsLines.length * 5 + 10;
    }

    // Rodapé em todas as páginas
    const dataAtual = new Date().toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'long',
      year: 'numeric'
    });

    // Adicionar rodapé em todas as páginas
    const totalPages = doc.internal.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      
      // Linha separadora
      doc.setDrawColor(200, 200, 200);
      doc.setLineWidth(0.5);
      doc.line(20, pageHeight - 35, pageWidth - 20, pageHeight - 35);
      
      doc.setFontSize(9);
      doc.setFont('helvetica', 'italic');
      doc.setTextColor(100, 100, 100);
      doc.text(
        `São Bernardo do Campo, ${dataAtual}.`,
        pageWidth / 2,
        pageHeight - 25,
        { align: 'center' }
      );

      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(0, 102, 204);
      doc.text(
        'GMP INDUSTRIAIS',
        pageWidth / 2,
        pageHeight - 15,
        { align: 'center' }
      );
      
      // Número da página (se não foi adicionado pela tabela)
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(150, 150, 150);
      doc.text(
        `Página ${i} de ${totalPages}`,
        pageWidth - 20,
        pageHeight - 10,
        { align: 'right' }
      );
    }
    
    // Voltar para a última página
    doc.setPage(totalPages);

    // Salvar PDF
    try {
      const fileName = `Proposta_${proposta.numero_proposta || proposta.id}_${(proposta.razao_social || proposta.cliente_nome || 'Cliente').replace(/[^a-z0-9]/gi, '_')}.pdf`
        .replace(/[^a-z0-9_]/gi, '_')
        .toLowerCase();
      
      console.log('💾 Salvando PDF como:', fileName);
      doc.save(fileName);
      console.log('✅ PDF gerado com sucesso!');
    } catch (saveError) {
      console.error('❌ Erro ao salvar PDF:', saveError);
      throw new Error('Erro ao salvar o arquivo PDF');
    }

  } catch (error) {
    console.error('❌ Erro ao gerar PDF:', error);
    console.error('❌ Detalhes do erro:', {
      message: error.message,
      response: error.response?.data,
      status: error.response?.status,
      propostaId: propostaId
    });
    
    let errorMessage = 'Erro ao gerar PDF da proposta.';
    
    if (error.response?.status === 404) {
      errorMessage = 'Proposta não encontrada.';
    } else if (error.response?.status === 401 || error.response?.status === 403) {
      errorMessage = 'Você não tem permissão para acessar esta proposta.';
    } else if (error.message) {
      errorMessage = `Erro: ${error.message}`;
    }
    
    alert(errorMessage + '\n\nVerifique o console para mais detalhes.');
  }
};

