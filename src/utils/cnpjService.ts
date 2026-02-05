export interface DadosCNPJ {
  cnpj: string;
  razao_social: string;
  nome_fantasia?: string;
  situacao: string;
  tipo: string;
  logradouro?: string;
  numero?: string;
  complemento?: string;
  bairro?: string;
  municipio?: string;
  uf?: string;
  cep?: string;
  telefone?: string;
  email?: string;
  capital_social?: number;
  data_abertura?: string;
  natureza_juridica?: string;
  porte?: string;
  atividade_principal?: Array<{
    code: string;
    text: string;
  }>;
}

// Função auxiliar para formatar CNPJ
export const formatarCNPJ = (cnpj: string): string => {
  const cnpjLimpo = cnpj.replace(/\D/g, '');
  if (cnpjLimpo.length !== 14) return cnpj;
  return cnpjLimpo.replace(
    /^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/,
    '$1.$2.$3/$4-$5'
  );
};

export const cnpjService = {
  /**
   * Busca dados de uma empresa pelo CNPJ
   * Tenta múltiplas APIs para garantir funcionamento
   */
  buscarPorCNPJ: async (cnpj: string): Promise<DadosCNPJ | null> => {
    // Remove formatação do CNPJ
    const cnpjLimpo = cnpj.replace(/\D/g, '');

    // Validação básica
    if (cnpjLimpo.length !== 14) {
      throw new Error('CNPJ deve ter 14 dígitos');
    }

    // Tenta múltiplas APIs em sequência
    const apis = [
      // API 1: BrasilAPI (mais confiável, sem CORS)
      async () => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 segundos
        
        try {
          const response = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpjLimpo}`, {
            method: 'GET',
            headers: {
              'Accept': 'application/json',
            },
            signal: controller.signal,
          });

          if (!response.ok) {
            if (response.status === 404) {
              throw new Error('CNPJ não encontrado na base de dados');
            }
            throw new Error(`Erro na API: ${response.status}`);
          }

          const data = await response.json();
          
          // Converter formato da BrasilAPI para nosso formato
          return {
            cnpj: data.cnpj || cnpjLimpo,
            razao_social: data.razao_social || '',
            nome_fantasia: data.nome_fantasia || '',
            situacao: data.descricao_situacao_cadastral || '',
            tipo: data.descricao_tipo_logradouro || '',
            logradouro: data.logradouro || '',
            numero: data.numero || '',
            complemento: data.complemento || '',
            bairro: data.bairro || '',
            municipio: data.municipio || '',
            uf: data.uf || '',
            cep: data.cep || '',
            telefone: data.ddd_telefone_1 && data.telefone_1 
                ? `${data.ddd_telefone_1}${data.telefone_1.replace(/\D/g, '')}` 
                : '',
            email: data.email || '',
            capital_social: data.capital_social || 0,
            data_abertura: data.data_inicio_atividade || '',
            natureza_juridica: data.natureza_juridica || '',
            porte: data.porte || '',
            atividade_principal: data.cnae_fiscal_principal ? [{
              code: data.cnae_fiscal_principal.codigo || '',
              text: data.cnae_fiscal_principal.descricao || '',
            }] : [],
          } as DadosCNPJ;
        } catch (error: any) {
          if (error.name === 'AbortError') {
            throw new Error('Tempo de espera esgotado. Tente novamente.');
          }
          throw error;
        } finally {
          clearTimeout(timeoutId);
        }
      },

      // API 2: ReceitaWS com proxy CORS
      async () => {
        // Usa um proxy CORS para evitar problemas
        const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(`https://www.receitaws.com.br/v1/cnpj/${cnpjLimpo}`)}`;
        
        const response = await fetch(proxyUrl, {
          method: 'GET',
          headers: {
            'Accept': 'application/json',
          },
        });

        if (!response.ok) {
          throw new Error('API ReceitaWS não disponível');
        }

        const proxyData = await response.json();
        const data = JSON.parse(proxyData.contents);

        if (data.status === 'ERROR' || data.message) {
          throw new Error(data.message || 'CNPJ não encontrado');
        }

        return data as DadosCNPJ;
      },

      // API 3: CNPJ.ws (alternativa)
      async () => {
        const response = await fetch(`https://www.cnpj.ws/cnpj/${cnpjLimpo}`, {
          method: 'GET',
          headers: {
            'Accept': 'application/json',
          },
        });

        if (!response.ok) {
          throw new Error('API CNPJ.ws não disponível');
        }

        const data = await response.json();
        
        return {
          cnpj: data.cnpj || cnpjLimpo,
          razao_social: data.razao_social || data.nome || '',
          nome_fantasia: data.fantasia || '',
          situacao: data.situacao || 'ATIVA',
          tipo: '',
          logradouro: data.logradouro || '',
          numero: data.numero || '',
          complemento: data.complemento || '',
          bairro: data.bairro || '',
          municipio: data.municipio || '',
          uf: data.uf || '',
          cep: data.cep || '',
          telefone: data.telefone || '',
          email: data.email || '',
        } as DadosCNPJ;
      },
    ];

    // Tenta cada API até uma funcionar
    for (let i = 0; i < apis.length; i++) {
      try {
        const dados = await apis[i]();
        if (dados) {
          return dados;
        }
      } catch (error: any) {
        console.log(`API ${i + 1} falhou:`, error.message);
        
        // Se for a última API, lança o erro com mensagem amigável
        if (i === apis.length - 1) {
          if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError') || error.message.includes('CORS')) {
            throw new Error('Erro de conexão. Verifique sua internet ou tente novamente mais tarde.');
          }
          throw new Error(error.message || 'Não foi possível buscar os dados do CNPJ. Verifique sua conexão ou tente novamente mais tarde.');
        }
        // Continua para próxima API
        continue;
      }
    }

    throw new Error('Nenhuma API disponível para consulta');
  },

  /**
   * Formata CNPJ para exibição (XX.XXX.XXX/XXXX-XX)
   */
  formatarCNPJ: (cnpj: string): string => {
    const cnpjLimpo = cnpj.replace(/\D/g, '');
    if (cnpjLimpo.length !== 14) return cnpj;
    return cnpjLimpo.replace(
      /^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/,
      '$1.$2.$3/$4-$5'
    );
  },

  /**
   * Valida CNPJ
   */
  validarCNPJ: (cnpj: string): boolean => {
    const cnpjLimpo = cnpj.replace(/\D/g, '');
    
    if (cnpjLimpo.length !== 14) return false;
    
    // Verifica se todos os dígitos são iguais
    if (/^(\d)\1+$/.test(cnpjLimpo)) return false;
    
    // Validação dos dígitos verificadores
    let tamanho = cnpjLimpo.length - 2;
    let numeros = cnpjLimpo.substring(0, tamanho);
    const digitos = cnpjLimpo.substring(tamanho);
    let soma = 0;
    let pos = tamanho - 7;
    
    for (let i = tamanho; i >= 1; i--) {
      soma += parseInt(numeros.charAt(tamanho - i)) * pos--;
      if (pos < 2) pos = 9;
    }
    
    let resultado = soma % 11 < 2 ? 0 : 11 - (soma % 11);
    if (resultado !== parseInt(digitos.charAt(0))) return false;
    
    tamanho = tamanho + 1;
    numeros = cnpjLimpo.substring(0, tamanho);
    soma = 0;
    pos = tamanho - 7;
    
    for (let i = tamanho; i >= 1; i--) {
      soma += parseInt(numeros.charAt(tamanho - i)) * pos--;
      if (pos < 2) pos = 9;
    }
    
    resultado = soma % 11 < 2 ? 0 : 11 - (soma % 11);
    if (resultado !== parseInt(digitos.charAt(1))) return false;
    
    return true;
  },
};

