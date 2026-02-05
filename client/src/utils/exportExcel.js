import * as XLSX from 'xlsx';

/**
 * Exporta dados para Excel
 * @param {Array} data - Array de objetos com os dados
 * @param {String} filename - Nome do arquivo (sem extensão)
 * @param {String} sheetName - Nome da planilha
 */
export const exportToExcel = (data, filename = 'export', sheetName = 'Dados') => {
  try {
    // Criar workbook
    const wb = XLSX.utils.book_new();
    
    // Converter dados para worksheet
    const ws = XLSX.utils.json_to_sheet(data);
    
    // Ajustar largura das colunas
    const colWidths = [];
    if (data.length > 0) {
      Object.keys(data[0]).forEach((key, index) => {
        const maxLength = Math.max(
          key.length,
          ...data.map(row => String(row[key] || '').length)
        );
        colWidths.push({ wch: Math.min(maxLength + 2, 50) });
      });
      ws['!cols'] = colWidths;
    }
    
    // Adicionar worksheet ao workbook
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    
    // Gerar arquivo e fazer download
    XLSX.writeFile(wb, `${filename}.xlsx`);
    
    return true;
  } catch (error) {
    console.error('Erro ao exportar para Excel:', error);
    throw error;
  }
};

/**
 * Exporta múltiplas planilhas para um único arquivo Excel
 * @param {Array} sheets - Array de objetos { name: 'Nome', data: [...] }
 * @param {String} filename - Nome do arquivo
 */
export const exportMultipleSheets = (sheets, filename = 'export') => {
  try {
    const wb = XLSX.utils.book_new();
    
    sheets.forEach(({ name, data }) => {
      const ws = XLSX.utils.json_to_sheet(data);
      
      // Ajustar largura das colunas
      if (data.length > 0) {
        const colWidths = [];
        Object.keys(data[0]).forEach((key) => {
          const maxLength = Math.max(
            key.length,
            ...data.map(row => String(row[key] || '').length)
          );
          colWidths.push({ wch: Math.min(maxLength + 2, 50) });
        });
        ws['!cols'] = colWidths;
      }
      
      XLSX.utils.book_append_sheet(wb, ws, name);
    });
    
    XLSX.writeFile(wb, `${filename}.xlsx`);
    return true;
  } catch (error) {
    console.error('Erro ao exportar múltiplas planilhas:', error);
    throw error;
  }
};

/**
 * Exporta tabela HTML para Excel
 * @param {HTMLElement} tableElement - Elemento da tabela
 * @param {String} filename - Nome do arquivo
 */
export const exportTableToExcel = (tableElement, filename = 'export') => {
  try {
    const wb = XLSX.utils.table_to_book(tableElement);
    XLSX.writeFile(wb, `${filename}.xlsx`);
    return true;
  } catch (error) {
    console.error('Erro ao exportar tabela:', error);
    throw error;
  }
};




