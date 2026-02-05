import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../services/api';
import { FiSearch, FiLoader, FiUpload, FiX } from 'react-icons/fi';
import './ClienteForm.css';

const ClienteForm = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [loadingCnpj, setLoadingCnpj] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [logoFile, setLogoFile] = useState(null);
  const [logoPreview, setLogoPreview] = useState(null);
  const [formData, setFormData] = useState({
    razao_social: '',
    nome_fantasia: '',
    cnpj: '',
    segmento: '',
    telefone: '',
    email: '',
    endereco: '',
    cidade: '',
    estado: '',
    cep: '',
    contato_principal: '',
    observacoes: '',
    status: 'ativo',
    logo_url: ''
  });

  const segmentos = [
    'Tintas & Vernizes',
    'Químico',
    'Cosméticos',
    'Alimentícios',
    'Domissanitários',
    'Saneantes',
    'Outros'
  ];

  const estados = [
    'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA',
    'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN',
    'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'
  ];

  useEffect(() => {
    if (id) {
      loadCliente();
    }
  }, [id]);

  const loadCliente = async () => {
    try {
      const response = await api.get(`/clientes/${id}`);
      setFormData(response.data);
      // Se houver logo_url, criar preview
      if (response.data.logo_url) {
        const logoUrl = response.data.logo_url.startsWith('http') 
          ? response.data.logo_url 
          : `${api.defaults.baseURL}/uploads/logos/${response.data.logo_url}`;
        setLogoPreview(logoUrl);
      }
    } catch (error) {
      console.error('Erro ao carregar cliente:', error);
      alert('Erro ao carregar cliente');
    }
  };

  const handleLogoChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      // Validar tipo de arquivo
      const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
      if (!allowedTypes.includes(file.type)) {
        alert('Apenas imagens são permitidas (JPEG, JPG, PNG, GIF, WEBP)');
        return;
      }
      
      // Validar tamanho (5MB)
      if (file.size > 5 * 1024 * 1024) {
        alert('O arquivo deve ter no máximo 5MB');
        return;
      }

      setLogoFile(file);
      
      // Criar preview
      const reader = new FileReader();
      reader.onloadend = () => {
        setLogoPreview(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleRemoveLogo = () => {
    setLogoFile(null);
    setLogoPreview(null);
    setFormData(prev => ({ ...prev, logo_url: '' }));
  };

  const uploadLogo = async (clienteId) => {
    if (!logoFile) return null;

    setUploadingLogo(true);
    try {
      const formData = new FormData();
      formData.append('logo', logoFile);

      const response = await api.post(`/clientes/${clienteId}/logo`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      return response.data.logo_url;
    } catch (error) {
      console.error('Erro ao fazer upload do logo:', error);
      alert('Erro ao fazer upload do logo. Tente novamente.');
      return null;
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  // Função para formatar CNPJ
  const formatCNPJ = (value) => {
    const numbers = value.replace(/\D/g, '');
    if (numbers.length <= 14) {
      return numbers
        .replace(/^(\d{2})(\d)/, '$1.$2')
        .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
        .replace(/\.(\d{3})(\d)/, '.$1/$2')
        .replace(/(\d{4})(\d)/, '$1-$2');
    }
    return value;
  };

  // Função auxiliar para fazer fetch com timeout
  const fetchWithTimeout = (url, options = {}, timeout = 10000) => {
    return Promise.race([
      fetch(url, options),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Timeout: A requisição demorou muito para responder')), timeout)
      )
    ]);
  };

  // Função para validar CNPJ
  const validarCNPJ = (cnpj) => {
    cnpj = cnpj.replace(/\D/g, '');
    
    if (cnpj.length !== 14) return false;
    
    // Elimina CNPJs conhecidos como inválidos
    if (/^(\d)\1+$/.test(cnpj)) return false;
    
    // Validação dos dígitos verificadores
    let tamanho = cnpj.length - 2;
    let numeros = cnpj.substring(0, tamanho);
    let digitos = cnpj.substring(tamanho);
    let soma = 0;
    let pos = tamanho - 7;
    
    for (let i = tamanho; i >= 1; i--) {
      soma += numeros.charAt(tamanho - i) * pos--;
      if (pos < 2) pos = 9;
    }
    
    let resultado = soma % 11 < 2 ? 0 : 11 - soma % 11;
    if (resultado != digitos.charAt(0)) return false;
    
    tamanho = tamanho + 1;
    numeros = cnpj.substring(0, tamanho);
    soma = 0;
    pos = tamanho - 7;
    
    for (let i = tamanho; i >= 1; i--) {
      soma += numeros.charAt(tamanho - i) * pos--;
      if (pos < 2) pos = 9;
    }
    
    resultado = soma % 11 < 2 ? 0 : 11 - soma % 11;
    if (resultado != digitos.charAt(1)) return false;
    
    return true;
  };

  // Função para buscar dados do CNPJ
  const buscarCNPJ = async (cnpj) => {
    // Remove formatação do CNPJ
    const cnpjLimpo = cnpj.replace(/\D/g, '');
    
    // Valida se tem 14 dígitos
    if (cnpjLimpo.length !== 14) {
      alert('CNPJ deve ter 14 dígitos');
      return;
    }

    // Validar CNPJ antes de buscar
    if (!validarCNPJ(cnpjLimpo)) {
      alert('CNPJ inválido. Verifique os dígitos e tente novamente.');
      return;
    }

    setLoadingCnpj(true);
    
    try {
      // Primeiro, tentar buscar via API do backend (evita problemas de CORS)
      try {
        const response = await api.get(`/cnpj/${cnpjLimpo}`);
        
        if (response.data && response.data.success && response.data.data) {
          console.log(`Dados do CNPJ obtidos com sucesso via ${response.data.source}:`, response.data.data);
          preencherDadosCNPJ(response.data.data, cnpjLimpo);
          return;
        }
      } catch (apiError) {
        console.log('Erro ao buscar via API do backend:', apiError.message);
        // Continuar para tentar diretamente
      }

      // Se a API do backend falhou, tentar diretamente (fallback)
      try {
        // Tentar primeiro com BrasilAPI
        const response = await fetchWithTimeout(
          `https://brasilapi.com.br/api/cnpj/v1/${cnpjLimpo}`,
          {
            method: 'GET',
            headers: {
              'Accept': 'application/json',
            },
          },
          8000
        );
        
        if (response.ok) {
          const data = await response.json();
          
          if (data && (data.razao_social || data.nome || data.company_name)) {
            console.log('Dados do CNPJ obtidos com sucesso via BrasilAPI (direto):', data);
            preencherDadosCNPJ(data, cnpjLimpo);
            return;
          }
        }
      } catch (brasilApiError) {
        console.log('BrasilAPI não retornou dados:', brasilApiError.message);
      }

      // Tentar ReceitaWS como última alternativa
      try {
        const receitaResponse = await fetchWithTimeout(
          `https://www.receitaws.com.br/v1/${cnpjLimpo}`,
          {
            method: 'GET',
            headers: {
              'Accept': 'application/json',
            },
          },
          8000
        );
        
        if (receitaResponse.ok) {
          const receitaData = await receitaResponse.json();
          
          if (receitaData.status === 'ERROR' || receitaData.message) {
            throw new Error(receitaData.message || 'CNPJ não encontrado');
          }
          
          const data = {
            razao_social: receitaData.nome || receitaData.fantasia,
            nome_fantasia: receitaData.fantasia || receitaData.nome,
            logradouro: receitaData.logradouro,
            numero: receitaData.numero,
            complemento: receitaData.complemento,
            bairro: receitaData.bairro,
            municipio: receitaData.municipio,
            cidade: receitaData.municipio,
            uf: receitaData.uf,
            estado: receitaData.uf,
            cep: receitaData.cep,
            telefone: receitaData.telefone,
            email: receitaData.email
          };
          
          if (data.razao_social || data.nome_fantasia) {
            console.log('Dados do CNPJ obtidos com sucesso via ReceitaWS (direto):', data);
            preencherDadosCNPJ(data, cnpjLimpo);
            return;
          }
        }
      } catch (receitaError) {
        console.log('ReceitaWS não retornou dados:', receitaError.message);
      }

      // Se nenhuma API funcionou
      alert('CNPJ não encontrado nas bases de dados consultadas.\n\nPossíveis causas:\n• CNPJ pode estar inativo ou cancelado\n• CNPJ pode não estar cadastrado na Receita Federal\n• Problemas temporários nas APIs de consulta\n\nVocê pode preencher os dados manualmente.');

    } catch (error) {
      console.error('Erro ao buscar CNPJ:', error);
      const errorMessage = error.message || 'Erro desconhecido ao buscar dados do CNPJ';
      
      // Mensagem de erro mais amigável
      if (errorMessage.includes('Timeout') || errorMessage.includes('Failed to fetch')) {
        alert('Erro de conexão ao buscar dados do CNPJ.\n\nVerifique sua conexão com a internet e tente novamente.\n\nSe o problema persistir, você pode preencher os dados manualmente.');
      } else {
        alert(`Erro ao buscar dados do CNPJ: ${errorMessage}\n\nVocê pode preencher os dados manualmente.`);
      }
    } finally {
      setLoadingCnpj(false);
    }
  };

  // Função auxiliar para preencher dados do CNPJ
  const preencherDadosCNPJ = (data, cnpjLimpo) => {
    // Montar endereço completo
    let enderecoCompleto = '';
    if (data.logradouro || data.street) {
      const logradouro = data.logradouro || data.street || '';
      const numero = data.numero || data.number || '';
      const complemento = data.complemento || data.complement || '';
      const bairro = data.bairro || data.district || data.neighborhood || '';
      
      enderecoCompleto = logradouro;
      if (numero) enderecoCompleto += ', ' + numero;
      if (complemento) enderecoCompleto += ' - ' + complemento;
      if (bairro) enderecoCompleto += ', ' + bairro;
    }

    // Formatar CEP
    let cepFormatado = '';
    if (data.cep || data.zip_code) {
      const cep = data.cep || data.zip_code || '';
      const cepLimpo = cep.replace(/\D/g, '');
      if (cepLimpo.length === 8) {
        cepFormatado = cepLimpo.replace(/^(\d{5})(\d{3})$/, '$1-$2');
      } else {
        cepFormatado = cep;
      }
    }

    // Formatar telefone se existir
    let telefoneFormatado = '';
    if (data.telefone || data.phone) {
      const telefone = data.telefone || data.phone || '';
      const telLimpo = telefone.replace(/\D/g, '');
      if (telLimpo.length === 10) {
        telefoneFormatado = telLimpo.replace(/^(\d{2})(\d{4})(\d{4})$/, '($1) $2-$3');
      } else if (telLimpo.length === 11) {
        telefoneFormatado = telLimpo.replace(/^(\d{2})(\d{5})(\d{4})$/, '($1) $2-$3');
      } else {
        telefoneFormatado = telefone;
      }
    }

    // Preencher campos automaticamente
    setFormData(prev => ({
      ...prev,
      razao_social: data.razao_social || data.nome || data.company_name || data.name || prev.razao_social,
      nome_fantasia: data.nome_fantasia || data.fantasia || data.trade_name || data.alias || prev.nome_fantasia,
      cnpj: formatCNPJ(cnpjLimpo),
      telefone: telefoneFormatado || (data.ddd && data.telefone ? `(${data.ddd}) ${data.telefone}` : '') || prev.telefone,
      email: data.email || prev.email,
      endereco: enderecoCompleto || prev.endereco,
      cidade: data.municipio || data.cidade || data.city || prev.cidade,
      estado: data.uf || data.estado || data.state || prev.estado,
      cep: cepFormatado || prev.cep
    }));
  };

  const handleCNPJChange = (e) => {
    const { value } = e.target;
    const formatted = formatCNPJ(value);
    setFormData(prev => ({ ...prev, cnpj: formatted }));
  };

  const handleCNPJBlur = (e) => {
    const cnpj = e.target.value.replace(/\D/g, '');
    if (cnpj.length === 14 && !id) {
      // Só busca automaticamente se for um novo cadastro
      buscarCNPJ(cnpj);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      let clienteId = id;
      
      // Se for novo cliente, criar primeiro
      if (!id) {
        const response = await api.post('/clientes', formData);
        clienteId = response.data.id;
      }

      // Se houver logo para upload, fazer upload
      if (logoFile && clienteId) {
        const logoUrl = await uploadLogo(clienteId);
        if (logoUrl) {
          formData.logo_url = logoUrl;
        }
      }

      // Atualizar cliente com logo_url se necessário
      if (id || logoFile) {
        await api.put(`/clientes/${clienteId}`, formData);
      }

      navigate('/comercial/clientes');
    } catch (error) {
      alert(error.response?.data?.error || 'Erro ao salvar cliente');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="cliente-form">
      <div className="form-header">
        <h1>{id ? 'Editar Cliente' : 'Novo Cliente'}</h1>
        <button onClick={() => navigate('/comercial/clientes')} className="btn-secondary">
          Cancelar
        </button>
      </div>

      <form onSubmit={handleSubmit} className="form">
        <div className="form-section">
          <h2>Dados Básicos</h2>
          <div className="form-grid">
            <div className="form-group">
              <label>Razão Social *</label>
              <input
                type="text"
                name="razao_social"
                value={formData.razao_social}
                onChange={handleChange}
                required
              />
            </div>
            <div className="form-group">
              <label>Nome Fantasia</label>
              <input
                type="text"
                name="nome_fantasia"
                value={formData.nome_fantasia}
                onChange={handleChange}
              />
            </div>
            <div className="form-group">
              <label>CNPJ</label>
              <div className="cnpj-input-group">
                <input
                  type="text"
                  name="cnpj"
                  value={formData.cnpj}
                  onChange={handleCNPJChange}
                  onBlur={handleCNPJBlur}
                  placeholder="00.000.000/0000-00"
                  maxLength="18"
                  disabled={loadingCnpj}
                />
                {loadingCnpj ? (
                  <span className="cnpj-loader">
                    <FiLoader className="spinning" />
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={async () => {
                      const cnpj = formData.cnpj.replace(/\D/g, '');
                      if (cnpj.length === 14) {
                        try {
                          await buscarCNPJ(cnpj);
                        } catch (error) {
                          console.error('Erro ao buscar CNPJ:', error);
                          alert('Erro ao buscar dados do CNPJ. Verifique sua conexão e tente novamente.');
                        }
                      } else {
                        alert('Por favor, digite um CNPJ válido com 14 dígitos');
                      }
                    }}
                    className="btn-buscar-cnpj"
                    title="Buscar dados do CNPJ"
                  >
                    <FiSearch />
                  </button>
                )}
              </div>
              {loadingCnpj && (
                <small style={{ color: '#0066cc', display: 'block', marginTop: '5px' }}>
                  Buscando dados do CNPJ...
                </small>
              )}
            </div>
            <div className="form-group">
              <label>Segmento</label>
              <select
                name="segmento"
                value={formData.segmento}
                onChange={handleChange}
              >
                <option value="">Selecione...</option>
                {segmentos.map(seg => (
                  <option key={seg} value={seg}>{seg}</option>
                ))}
              </select>
            </div>
            <div className="form-group full-width">
              <label>Logo do Cliente</label>
              <div style={{ display: 'flex', gap: '15px', alignItems: 'flex-start' }}>
                <div style={{ flex: 1 }}>
                  <label
                    htmlFor="logo-upload"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '12px 20px',
                      background: 'linear-gradient(135deg, #ff6b35 0%, #f7931e 100%)',
                      color: 'white',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      fontWeight: 600,
                      transition: 'all 0.3s ease',
                      boxShadow: '0 2px 8px rgba(255, 107, 53, 0.3)'
                    }}
                    onMouseEnter={(e) => {
                      e.target.style.transform = 'translateY(-2px)';
                      e.target.style.boxShadow = '0 4px 12px rgba(255, 107, 53, 0.4)';
                    }}
                    onMouseLeave={(e) => {
                      e.target.style.transform = 'translateY(0)';
                      e.target.style.boxShadow = '0 2px 8px rgba(255, 107, 53, 0.3)';
                    }}
                  >
                    <FiUpload /> {logoFile ? 'Alterar Logo' : 'Selecionar Logo'}
                  </label>
                  <input
                    id="logo-upload"
                    type="file"
                    accept="image/jpeg,image/jpg,image/png,image/gif,image/webp"
                    onChange={handleLogoChange}
                    style={{ display: 'none' }}
                  />
                  {uploadingLogo && (
                    <div style={{ marginTop: '10px', color: '#666', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <FiLoader className="spinner" /> Enviando logo...
                    </div>
                  )}
                </div>
                {logoPreview && (
                  <div style={{ 
                    position: 'relative',
                    width: '120px', 
                    height: '120px', 
                    border: '2px solid #e0e0e0', 
                    borderRadius: '8px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    overflow: 'hidden',
                    background: '#f8f9fa',
                    flexShrink: 0
                  }}>
                    <img 
                      src={logoPreview} 
                      alt="Preview do logo" 
                      style={{ 
                        maxWidth: '100%', 
                        maxHeight: '100%', 
                        objectFit: 'contain' 
                      }}
                    />
                    <button
                      type="button"
                      onClick={handleRemoveLogo}
                      style={{
                        position: 'absolute',
                        top: '5px',
                        right: '5px',
                        background: 'rgba(211, 47, 47, 0.9)',
                        color: 'white',
                        border: 'none',
                        borderRadius: '50%',
                        width: '24px',
                        height: '24px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                        fontSize: '14px',
                        transition: 'all 0.2s ease'
                      }}
                      onMouseEnter={(e) => {
                        e.target.style.background = 'rgba(211, 47, 47, 1)';
                        e.target.style.transform = 'scale(1.1)';
                      }}
                      onMouseLeave={(e) => {
                        e.target.style.background = 'rgba(211, 47, 47, 0.9)';
                        e.target.style.transform = 'scale(1)';
                      }}
                    >
                      <FiX />
                    </button>
                  </div>
                )}
              </div>
              <small style={{ color: '#666', display: 'block', marginTop: '8px' }}>
                Selecione uma imagem (JPEG, JPG, PNG, GIF ou WEBP) com no máximo 5MB. O logo será usado nas propostas.
              </small>
            </div>
          </div>
        </div>

        <div className="form-section">
          <h2>Contato</h2>
          <div className="form-grid">
            <div className="form-group">
              <label>Telefone</label>
              <input
                type="text"
                name="telefone"
                value={formData.telefone}
                onChange={handleChange}
                placeholder="(00) 0000-0000"
              />
            </div>
            <div className="form-group">
              <label>E-mail</label>
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
              />
            </div>
            <div className="form-group">
              <label>Contato Principal</label>
              <input
                type="text"
                name="contato_principal"
                value={formData.contato_principal}
                onChange={handleChange}
              />
            </div>
          </div>
        </div>

        <div className="form-section">
          <h2>Endereço</h2>
          <div className="form-grid">
            <div className="form-group full-width">
              <label>Endereço</label>
              <input
                type="text"
                name="endereco"
                value={formData.endereco}
                onChange={handleChange}
              />
            </div>
            <div className="form-group">
              <label>Cidade</label>
              <input
                type="text"
                name="cidade"
                value={formData.cidade}
                onChange={handleChange}
              />
            </div>
            <div className="form-group">
              <label>Estado</label>
              <select
                name="estado"
                value={formData.estado}
                onChange={handleChange}
              >
                <option value="">Selecione...</option>
                {estados.map(est => (
                  <option key={est} value={est}>{est}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>CEP</label>
              <input
                type="text"
                name="cep"
                value={formData.cep}
                onChange={handleChange}
                placeholder="00000-000"
              />
            </div>
          </div>
        </div>

        <div className="form-section">
          <h2>Informações Adicionais</h2>
          <div className="form-group full-width">
            <label>Observações</label>
            <textarea
              name="observacoes"
              value={formData.observacoes}
              onChange={handleChange}
              rows="4"
            />
          </div>
          {id && (
            <div className="form-group">
              <label>Status</label>
              <select
                name="status"
                value={formData.status}
                onChange={handleChange}
              >
                <option value="ativo">Ativo</option>
                <option value="inativo">Inativo</option>
              </select>
            </div>
          )}
        </div>

        <div className="form-actions">
          <button type="submit" disabled={loading} className="btn-primary">
            {loading ? 'Salvando...' : 'Salvar Cliente'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default ClienteForm;

