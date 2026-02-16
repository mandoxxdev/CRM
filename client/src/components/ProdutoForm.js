import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import api from '../services/api';
import { FiSave, FiX, FiCheck, FiInfo, FiCheckCircle, FiAlertCircle } from 'react-icons/fi';
import './ProdutoForm.css';

const ProdutoForm = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const location = useLocation();
  const isEdit = !!id;
  
  // Detectar tipo de produto via query params ou família do produto (ao editar)
  const searchParams = new URLSearchParams(location.search);
  const [tipoProduto, setTipoProduto] = useState(searchParams.get('tipo') || 'equipamentos');

  const [formData, setFormData] = useState({
    codigo: '',
    nome: '',
    descricao: '',
    familia_produto: '',
    modelo: '', // Campo para modelo do equipamento (ex: ULTRAMIX, Bimix)
    unidade: 'UN',
    preco_base: 0,
    icms: 0,
    ipi: 0,
    ncm: '',
    especificacoes_tecnicas: '', // Será um JSON stringificado
    observacoes: '',
    ativo: 1
  });

  // Estado para informações técnicas estruturadas
  const [especificacoesTecnicas, setEspecificacoesTecnicas] = useState({
    material_contato: '',
    motor_central_cv: '',
    motoredutor_central_cv: '',
    motores_laterais_cv: '',
    ccm_incluso: '',
    ccm_tensao: '',
    celula_carga: '',
    plc_ihm: '',
    valvula_saida_tanque: '',
    classificacao_area: '',
    densidade: '',
    viscosidade: '',
    // Campos específicos para Discos e Acessórios
    espessura: '',
    acabamento: '',
    diametro: '',
    // Campos específicos para Hélices
    funcao: '',
    tratamento_termico: '',
    tratamento_termico_especifico: '',
    velocidade_trabalho: '',
    velocidade_trabalho_especifica: '',
    furacao: 'Padrão: 20mm central'
  });

  // Opções pré-definidas para campos selecionáveis
  const opcoesMaterialContato = [
    'Aço Inox 304 - AISI 304',
    'Aço Inox 410 - AISI 410',
    'Aço Inox 316 - AISI 316',
    'Aço Carbono - SAE 1020'
  ];

  const opcoesCCMTensao = [
    '440v',
    '380v',
    '220v'
  ];

  const opcoesValvulaSaida = [
    'Borboleta Manual',
    'Borboleta Atuada',
    'Esfera Manual',
    'Esfera Atuada'
  ];

  const opcoesClassificacaoArea = [
    'Base Água',
    'Base Solvente'
  ];

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showCCMAlert, setShowCCMAlert] = useState(false);
  const [showToast, setShowToast] = useState({ show: false, message: '', type: 'success' });
  const [fieldErrors, setFieldErrors] = useState({});
  const [loadingNCM, setLoadingNCM] = useState(false);
  const [imagemProduto, setImagemProduto] = useState(null);
  const [uploadingImagem, setUploadingImagem] = useState(false);
  const [outroAtivo, setOutroAtivo] = useState({
    material_contato: false,
    espessura: false,
    acabamento: false,
    funcao: false,
    tratamento_termico: false,
    velocidade_trabalho: false
  });
  const setOutro = (field, active) => setOutroAtivo(prev => ({ ...prev, [field]: active }));

  // Famílias: carregadas da API (famílias cadastradas) com fallback para lista padrão
  const [familiasFromApi, setFamiliasFromApi] = useState([]);
  const todasFamiliasPadrao = [
    'Moinhos', 'Masseiras', 'Agitadores', 'Dispersores', 'Silos',
    'Tanques de armazenamento', 'Unidade derivadora de Dosagem', 'Estação de Aditivos',
    'Equipamentos de Envase', 'Equipamentos á Vácuo', 'Hélices e Acessórios', 'Outros'
  ];
  useEffect(() => {
    api.get('/familias-produto').then((res) => {
      const data = res?.data;
      const list = Array.isArray(data) ? data.map((f) => f.nome).filter(Boolean) : [];
      setFamiliasFromApi(list);
    }).catch(() => setFamiliasFromApi([]));
  }, []);
  const todasFamilias = familiasFromApi.length > 0 ? familiasFromApi : todasFamiliasPadrao;
  const familias = tipoProduto === 'discos-acessorios'
    ? (todasFamilias.includes('Hélices e Acessórios') ? ['Hélices e Acessórios'] : todasFamilias)
    : todasFamilias;

  const unidades = ['UN', 'KG', 'L', 'M', 'M²', 'M³', 'PC'];

  useEffect(() => {
    // Se não estiver editando e não tiver tipo especificado, redirecionar para seleção
    if (!isEdit && !tipoProduto) {
      navigate('/comercial/produtos');
    }
    
    if (isEdit) {
      loadProduto();
    } else {
      // Gerar código automaticamente para novos produtos
      // Aguardar um pouco para garantir que o formData está inicializado
      setTimeout(() => {
        generateCodigoProduto();
      }, 100);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, isEdit, tipoProduto, navigate]);

  const generateCodigoProduto = async (nomeParam = null, familiaParam = null) => {
    try {
      const nome = nomeParam || formData.nome || '';
      const familia = familiaParam || formData.familia_produto || '';
      
      // Se for Hélices e Acessórios, enviar informações adicionais
      const params = { nome, familia };
      
      if (familia === 'Hélices e Acessórios') {
        params.diametro = especificacoesTecnicas.diametro || '';
        params.espessura = especificacoesTecnicas.espessura || '';
        params.material_contato = especificacoesTecnicas.material_contato || '';
      }
      
      const response = await api.get('/produtos/proximo-codigo', { params });
      
      if (response.data && response.data.codigo) {
        setFormData(prev => ({
          ...prev,
          codigo: response.data.codigo
        }));
      }
    } catch (error) {
      console.error('Erro ao gerar código do produto:', error);
      // Se falhar, gerar código padrão
      const quantidade = 1;
      const nome = nomeParam || formData.nome || 'XXX';
      const familia = familiaParam || formData.familia_produto || 'GENXX';
      
      if (familia === 'Hélices e Acessórios') {
        // Formato: NOME+SOBRENOME-DIAMETROCOMOTEXTOCONMM-ESPESSURA-MATERIAL
        const palavras = nome.split(/\s+/).filter(p => p.length > 0);
        let iniciaisNome = 'XX';
        if (palavras.length >= 2) {
          iniciaisNome = `${palavras[0].charAt(0).toUpperCase()}${palavras[1].charAt(0).toUpperCase()}`;
        } else if (palavras.length === 1) {
          const palavra = palavras[0];
          iniciaisNome = `${palavra.charAt(0).toUpperCase()}${palavra.length > 1 ? palavra.charAt(1).toUpperCase() : 'X'}`;
        }
        const diametro = (especificacoesTecnicas.diametro || '').toUpperCase() || '0MM';
        const espessura = (especificacoesTecnicas.espessura || '').toUpperCase() || '0';
        const material = (especificacoesTecnicas.material_contato || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase().substring(0, 10) || 'XXX';
        setFormData(prev => ({
          ...prev,
          codigo: `${iniciaisNome}-${diametro}-${espessura}-${material}`
        }));
      } else {
        const iniciaisNome = nome.replace(/[^a-zA-Z0-9]/g, '').substring(0, 3).toUpperCase().padEnd(3, 'X');
        const iniciaisFamilia = familia.replace(/[^a-zA-Z0-9]/g, '').substring(0, 5).toUpperCase().padEnd(5, 'X');
        setFormData(prev => ({
          ...prev,
          codigo: `PROD-${quantidade}-${iniciaisNome}-${iniciaisFamilia}`
        }));
      }
    }
  };

  const loadProduto = async () => {
    try {
      const response = await api.get(`/produtos/${id}`);
      const data = response.data;
      
      // Detectar tipo de produto baseado na família
      const familia = data.familia || '';
      const tipoCorreto = familia === 'Hélices e Acessórios' ? 'discos-acessorios' : 'equipamentos';
      
      // Se o tipo na URL não corresponder à família do produto, atualizar
      if (tipoProduto !== tipoCorreto) {
        setTipoProduto(tipoCorreto);
        // Atualizar URL para incluir o tipo correto
        navigate(`/comercial/produtos/editar/${id}?tipo=${tipoCorreto}`, { replace: true });
      }
      
      // Tentar parsear especificacoes_tecnicas se for JSON
      let especificacoes = {};
      if (data.especificacoes_tecnicas) {
        try {
          especificacoes = JSON.parse(data.especificacoes_tecnicas);
        } catch (e) {
          // Se não for JSON, manter como string vazia
          especificacoes = {};
        }
      }
      
      // Se for Hélices e Acessórios e não tiver furação definida, definir padrão
      if (data.familia === 'Hélices e Acessórios' && !especificacoes.furacao) {
        especificacoes.furacao = 'Padrão: 20mm central';
      }
      // Usar classificação de área da coluna se existir (para exibir na listagem e no formulário)
      if (data.classificacao_area) {
        especificacoes.classificacao_area = data.classificacao_area;
      }
      
      setEspecificacoesTecnicas(especificacoes);
      const opcoesMaterial = ['Aço Inox 304 - AISI 304', 'Aço Inox 410 - AISI 410', 'Aço Inox 316 - AISI 316', 'Aço Carbono - SAE 1020'];
      const opcoesEsp = ['1/8', '3/16'];
      const opcoesAcab = ['Polido', 'Escovado'];
      const opcoesFunc = ['Alto nível de Cisalhamento', 'Homogenização'];
      const opcoesTrat = ['Aplicado', 'Não Aplicado'];
      const opcoesVel = ['Informado', 'Não informado'];
      setOutroAtivo(prev => ({
        ...prev,
        material_contato: !!(especificacoes.material_contato && !opcoesMaterial.includes(especificacoes.material_contato)),
        espessura: !!(especificacoes.espessura && !opcoesEsp.includes(especificacoes.espessura)),
        acabamento: !!(especificacoes.acabamento && !opcoesAcab.includes(especificacoes.acabamento)),
        funcao: !!(especificacoes.funcao && !opcoesFunc.includes(especificacoes.funcao)),
        tratamento_termico: !!(especificacoes.tratamento_termico && !opcoesTrat.includes(especificacoes.tratamento_termico)),
        velocidade_trabalho: !!(especificacoes.velocidade_trabalho && !opcoesVel.includes(especificacoes.velocidade_trabalho))
      }));
      // Mapear familia para familia_produto (nome usado no frontend)
      setFormData({
        ...data,
        familia_produto: data.familia || '', // Mapear do backend para frontend
        modelo: data.modelo || '', // Campo modelo do equipamento
        preco_base: data.preco_base || 0,
        icms: data.icms || 0,
        ipi: data.ipi || 0
      });
      // Carregar imagem se existir
      if (data.imagem) {
        setImagemProduto(data.imagem);
      }
    } catch (error) {
      setError('Erro ao carregar produto');
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    const newValue = name === 'ativo' ? (value === 'true' ? 1 : 0) : 
                    (name === 'preco_base' || name === 'icms' || name === 'ipi') ? parseFloat(value) || 0 : value;
    
    setFormData(prev => {
      const newData = {
        ...prev,
        [name]: newValue
      };
      
      // Se mudou para "Hélices e Acessórios", definir furação padrão
      if (name === 'familia_produto' && newValue === 'Hélices e Acessórios') {
        setEspecificacoesTecnicas(prev => ({
          ...prev,
          furacao: prev.furacao || 'Padrão: 20mm central'
        }));
      }
      
      // Debug: verificar mudança de família
      if (name === 'familia_produto') {
        console.log('Família alterada para:', newValue);
      }
      
      // Se mudou o nome ou a família do produto e não está editando, regenerar o código
      if ((name === 'nome' || name === 'familia_produto') && !isEdit && !id) {
        // Usar setTimeout para garantir que o estado foi atualizado
        setTimeout(() => {
          const nomeAtual = name === 'nome' ? newValue : newData.nome || '';
          const familiaAtual = name === 'familia_produto' ? newValue : newData.familia_produto || '';
          generateCodigoProduto(nomeAtual, familiaAtual);
        }, 0);
      }
      
      // Se mudou o NCM, buscar ICMS e IPI automaticamente
      if (name === 'ncm' && value && value.length === 8) {
        // Aguardar um pouco para o usuário terminar de digitar
        setTimeout(() => {
          buscarNCM(value);
        }, 500);
      }
      
      return newData;
    });
  };

  const buscarNCM = async (ncm) => {
    // Validar formato do NCM (8 dígitos)
    if (!ncm || !/^\d{8}$/.test(ncm)) {
      return;
    }
    
    setLoadingNCM(true);
    try {
      const response = await api.get(`/ncm/${ncm}`);
      if (response.data) {
        setFormData(prev => ({
          ...prev,
          icms: response.data.icms || prev.icms,
          ipi: response.data.ipi || prev.ipi
        }));
      }
    } catch (error) {
      console.error('Erro ao buscar NCM:', error);
      // Não mostrar erro para o usuário, apenas logar
    } finally {
      setLoadingNCM(false);
    }
  };

  const handleEspecificacaoChange = (field, value) => {
    setEspecificacoesTecnicas(prev => ({
      ...prev,
      [field]: value
    }));
    
    // Validação em tempo real
    validateField(field, value);
    
    // Se for hélice e mudou campo que afeta o código, regenerar
    if (formData.familia_produto === 'Hélices e Acessórios' && !isEdit && !id) {
      if (field === 'diametro' || field === 'espessura' || field === 'material_contato') {
        setTimeout(() => {
          generateCodigoProduto();
        }, 300);
      }
    }
  };

  const handleUploadImagem = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    // Verificar tamanho (10MB)
    if (file.size > 10 * 1024 * 1024) {
      alert('A imagem excede o limite de 10MB');
      e.target.value = '';
      return;
    }
    
    // Verificar tipo de arquivo
    if (!file.type.match('image.*')) {
      alert('Por favor, selecione apenas imagens');
      e.target.value = '';
      return;
    }
    
    if (!id) {
      alert('Salve o produto primeiro antes de adicionar uma imagem');
      e.target.value = '';
      return;
    }
    
    setUploadingImagem(true);
    
    try {
      const formData = new FormData();
      formData.append('imagem', file);
      
      const response = await api.post(`/produtos/${id}/imagem`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });
      
      setImagemProduto(response.data.filename);
      setShowToast({ 
        show: true, 
        message: 'Imagem enviada com sucesso!', 
        type: 'success' 
      });
      
      // Recarregar produto para atualizar dados
      await loadProduto();
    } catch (error) {
      if (error.response?.status === 413) {
        alert('Imagem muito grande. O limite é de 10MB.');
      } else {
        alert(error.response?.data?.error || 'Erro ao enviar imagem');
      }
    } finally {
      setUploadingImagem(false);
      e.target.value = '';
    }
  };

  // Calcular progresso do preenchimento
  const progressoPreenchimento = useMemo(() => {
    const camposObrigatorios = {
      codigo: formData.codigo,
      nome: formData.nome,
      material_contato: especificacoesTecnicas.material_contato,
      ccm_incluso: especificacoesTecnicas.ccm_incluso,
      celula_carga: especificacoesTecnicas.celula_carga,
      plc_ihm: especificacoesTecnicas.plc_ihm
    };
    
    const preenchidos = Object.values(camposObrigatorios).filter(v => v && v !== '').length;
    const total = Object.keys(camposObrigatorios).length;
    
    return Math.round((preenchidos / total) * 100);
  }, [formData, especificacoesTecnicas]);

  // Validação de campos
  const validateField = (field, value) => {
    const errors = { ...fieldErrors };
    
    if (field === 'densidade' && value) {
      const pattern = /^Densidade aparente:\s*\d+([.,]\d+)?\s*–\s*\d+([.,]\d+)?\s*kg\/l$/i;
      if (!pattern.test(value)) {
        errors.densidade = 'Formato: Densidade aparente: x – x kg/l';
      } else {
        delete errors.densidade;
      }
    }
    
    if (field === 'viscosidade' && value) {
      const pattern = /^Viscosidade do fluido:\s*\d+([.,]\d+)?\s*–\s*\d+([.,]\d+)?\s*cPs$/i;
      if (!pattern.test(value)) {
        errors.viscosidade = 'Formato: Viscosidade do fluido: x – x cPs';
      } else {
        delete errors.viscosidade;
      }
    }
    
    setFieldErrors(errors);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      // Converter especificacoes_tecnicas para JSON string
      // Mapear familia_produto para familia (nome usado no backend)
      const { familia_produto, ...restFormData } = formData;
      const classificacao = (especificacoesTecnicas.classificacao_area || formData.classificacao_area || '').trim();
      const dataToSend = {
        ...restFormData,
        familia: familia_produto,
        especificacoes_tecnicas: JSON.stringify(especificacoesTecnicas),
        imagem: imagemProduto || null,
        classificacao_area: classificacao
      };

      if (isEdit) {
        await api.put(`/produtos/${id}`, dataToSend);
      } else {
        await api.post('/produtos', dataToSend);
      }
      
      // Mostrar toast de sucesso
      setShowToast({ show: true, message: isEdit ? 'Produto atualizado com sucesso!' : 'Produto cadastrado com sucesso!', type: 'success' });
      
      // Redirecionar após 1.5 segundos
      setTimeout(() => {
        navigate('/comercial/produtos');
      }, 1500);
    } catch (error) {
      setError(error.response?.data?.error || 'Erro ao salvar produto');
    } finally {
      setLoading(false);
    }
  };

  // Renderizar formulário básico para Discos/Acessórios e Serviços
  const renderFormularioBasico = () => {
    const tituloTipo = tipoProduto === 'discos-acessorios' ? 'Discos e Acessórios' : 'Serviços';
    
    return (
      <div className="produto-form">
        <div className="form-header">
          <h1>{isEdit ? `Editar ${tituloTipo}` : `Novo ${tituloTipo}`}</h1>
          <button onClick={() => navigate('/comercial/produtos')} className="btn-cancel">
            <FiX /> Cancelar
          </button>
        </div>

        {error && <div className="error-message">{error}</div>}

        <form onSubmit={handleSubmit} className="form-container">
          <div className="form-section">
            <h2>Informações Básicas</h2>
            <div className="form-grid">
              <div className="form-group">
                <label>
                  Código *
                  <span className="tooltip-icon" title="Código único de identificação">
                    <FiInfo />
                  </span>
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type="text"
                    name="codigo"
                    value={formData.codigo}
                    onChange={handleChange}
                    required
                    placeholder="Código gerado automaticamente"
                    readOnly={!isEdit}
                    className={formData.codigo ? 'field-valid' : ''}
                  />
                  {formData.codigo && (
                    <FiCheckCircle className="field-check-icon" />
                  )}
                </div>
              </div>

              <div className="form-group">
                <label>
                  Nome *
                  <span className="tooltip-icon" title="Nome comercial">
                    <FiInfo />
                  </span>
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type="text"
                    name="nome"
                    value={formData.nome}
                    onChange={handleChange}
                    required
                    placeholder="Nome do produto"
                    className={formData.nome ? 'field-valid' : ''}
                  />
                  {formData.nome && (
                    <FiCheckCircle className="field-check-icon" />
                  )}
                </div>
              </div>

              <div className="form-group">
                <label>Família de Produto</label>
                <select
                  name="familia_produto"
                  value={formData.familia_produto}
                  onChange={handleChange}
                >
                  <option value="">Selecione...</option>
                  {familias.map(familia => (
                    <option key={familia} value={familia}>{familia}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label>Unidade</label>
                <select
                  name="unidade"
                  value={formData.unidade}
                  onChange={handleChange}
                >
                  {unidades.map(unidade => (
                    <option key={unidade} value={unidade}>{unidade}</option>
                  ))}
                </select>
              </div>

              <div className="form-group full-width">
                <label>Foto do Produto</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {imagemProduto && (
                    <div style={{ 
                      width: '200px', 
                      height: '200px', 
                      border: '2px solid var(--gmp-border)', 
                      borderRadius: 'var(--border-radius)',
                      overflow: 'hidden',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background: 'var(--gmp-surface-secondary)'
                    }}>
                      <img 
                        src={`${api.defaults.baseURL}/uploads/produtos/${imagemProduto}`}
                        alt="Produto"
                        style={{ 
                          maxWidth: '100%', 
                          maxHeight: '100%', 
                          objectFit: 'contain' 
                        }}
                        onError={(e) => {
                          e.target.style.display = 'none';
                          if (e.target.nextSibling) {
                            e.target.nextSibling.style.display = 'flex';
                          }
                        }}
                      />
                      <div style={{ 
                        display: 'none', 
                        padding: '20px', 
                        textAlign: 'center',
                        color: 'var(--gmp-text-secondary)'
                      }}>
                        Imagem não encontrada
                      </div>
                    </div>
                  )}
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleUploadImagem}
                    disabled={uploadingImagem || !id}
                    style={{
                      padding: 'var(--spacing-md)',
                      border: '2px solid var(--gmp-border)',
                      borderRadius: 'var(--border-radius)',
                      background: 'var(--gmp-surface)',
                      color: 'var(--gmp-text)',
                      cursor: uploadingImagem || !id ? 'not-allowed' : 'pointer'
                    }}
                  />
                  {!id && (
                    <span style={{ 
                      fontSize: '0.875rem', 
                      color: 'var(--gmp-text-secondary)',
                      fontStyle: 'italic'
                    }}>
                      Salve o produto primeiro para adicionar uma imagem
                    </span>
                  )}
                  {uploadingImagem && (
                    <span style={{ 
                      fontSize: '0.875rem', 
                      color: 'var(--gmp-primary)'
                    }}>
                      Enviando imagem...
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="form-group">
              <label>Descrição</label>
              <textarea
                name="descricao"
                value={formData.descricao}
                onChange={handleChange}
                rows="3"
                placeholder="Descrição do produto"
              />
            </div>
          </div>

          <div className="form-section">
            <h2>Informações Comerciais</h2>
            <div className="form-grid">
              <div className="form-group">
                <label>Preço Base (R$)</label>
                <input
                  type="number"
                  name="preco_base"
                  value={formData.preco_base}
                  onChange={handleChange}
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                />
              </div>

              <div className="form-group">
                <label>ICMS (%)</label>
                <input
                  type="number"
                  name="icms"
                  value={formData.icms}
                  onChange={handleChange}
                  step="0.01"
                  min="0"
                  max="100"
                  placeholder="0.00"
                />
              </div>

              <div className="form-group">
                <label>IPI (%)</label>
                <input
                  type="number"
                  name="ipi"
                  value={formData.ipi}
                  onChange={handleChange}
                  step="0.01"
                  min="0"
                  max="100"
                  placeholder="0.00"
                />
              </div>

              <div className="form-group">
                <label>NCM</label>
                <input
                  type="text"
                  name="ncm"
                  value={formData.ncm}
                  onChange={handleChange}
                  placeholder="Código NCM (8 dígitos)"
                  maxLength="8"
                  pattern="[0-9]{8}"
                />
                <small style={{ display: 'block', marginTop: '5px', color: 'var(--gmp-text-light)', fontSize: '12px' }}>
                  Ao preencher o NCM, ICMS e IPI serão preenchidos automaticamente
                </small>
              </div>
            </div>
          </div>

          <div className="form-group" style={{ marginTop: '20px' }}>
            <label>Observações</label>
            <textarea
              name="observacoes"
              value={formData.observacoes}
              onChange={handleChange}
              rows="3"
              placeholder="Observações adicionais"
            />
          </div>

          <div className="form-actions">
            <button type="submit" className="btn-primary" disabled={loading}>
              <FiSave /> {loading ? 'Salvando...' : 'Salvar'}
            </button>
            <button type="button" onClick={() => navigate('/comercial/produtos')} className="btn-secondary">
              Cancelar
            </button>
          </div>
        </form>

        {/* Toast Notification */}
        {showToast.show && (
          <div className={`toast-notification toast-${showToast.type}`}>
            <div className="toast-content">
              {showToast.type === 'success' ? (
                <FiCheckCircle style={{ fontSize: '20px', marginRight: '10px' }} />
              ) : (
                <FiAlertCircle style={{ fontSize: '20px', marginRight: '10px' }} />
              )}
              <span>{showToast.message}</span>
            </div>
          </div>
        )}
      </div>
    );
  };

  // Se for serviços e não estiver editando, renderizar formulário básico
  if (tipoProduto === 'servicos' && !isEdit) {
    return renderFormularioBasico();
  }

  return (
    <div className="produto-form">
      <div className="form-header">
        <h1>{isEdit ? 'Editar Produto' : tipoProduto === 'discos-acessorios' ? 'Novo Disco e Acessório' : 'Novo Equipamento'}</h1>
        <button onClick={() => navigate('/comercial/produtos')} className="btn-cancel">
          <FiX /> Cancelar
        </button>
      </div>

      {error && <div className="error-message">{error}</div>}

      <form onSubmit={handleSubmit} className="form-container">
        <div className="form-section">
          <h2>Informações Básicas</h2>
          <div className="form-grid">
            <div className="form-group">
              <label>
                Código *
                <span className="tooltip-icon" title="Código único de identificação do produto">
                  <FiInfo />
                </span>
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type="text"
                  name="codigo"
                  value={formData.codigo}
                  onChange={handleChange}
                  required
                  placeholder="Código gerado automaticamente"
                  className={formData.codigo ? 'field-valid' : ''}
                  readOnly={!isEdit}
                />
                {formData.codigo && (
                  <FiCheckCircle className="field-check-icon" />
                )}
              </div>
            </div>

            <div className="form-group">
              <label>
                Nome *
                <span className="tooltip-icon" title="Nome comercial do produto">
                  <FiInfo />
                </span>
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type="text"
                  name="nome"
                  value={formData.nome}
                  onChange={handleChange}
                  required
                  placeholder="Nome do produto"
                  className={formData.nome ? 'field-valid' : ''}
                />
                {formData.nome && (
                  <FiCheckCircle className="field-check-icon" />
                )}
              </div>
            </div>

            <div className="form-group">
              <label>Família de Produto</label>
              <select
                name="familia_produto"
                value={formData.familia_produto}
                onChange={handleChange}
              >
                <option value="">Selecione...</option>
                {familias.map(familia => (
                  <option key={familia} value={familia}>{familia}</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label>Unidade</label>
              <select
                name="unidade"
                value={formData.unidade}
                onChange={handleChange}
              >
                {unidades.map(unidade => (
                  <option key={unidade} value={unidade}>{unidade}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Campo Modelo - Aparece apenas para equipamentos (não Hélices e Acessórios) */}
          {tipoProduto === 'equipamentos' && 
           formData.familia_produto && 
           formData.familia_produto !== 'Hélices e Acessórios' && 
           formData.familia_produto.trim() !== '' && (
            <div className="form-group full-width" style={{ marginTop: '20px', marginBottom: '20px', padding: '20px', backgroundColor: 'var(--gmp-surface-secondary)', borderRadius: 'var(--border-radius)', border: '2px solid var(--gmp-border)' }}>
              <label style={{ fontSize: '16px', fontWeight: '600', marginBottom: '10px', display: 'block', color: 'var(--gmp-text-primary)' }}>
                Modelo do Equipamento
              </label>
              <div className="input-with-icon" style={{ position: 'relative' }}>
                <input
                  type="text"
                  name="modelo"
                  value={formData.modelo || ''}
                  onChange={handleChange}
                  placeholder="Ex: ULTRAMIX, Bimix, etc."
                  maxLength={100}
                  style={{ 
                    width: '100%', 
                    padding: '12px 40px 12px 12px', 
                    fontSize: '14px',
                    border: '2px solid var(--gmp-border)',
                    borderRadius: 'var(--border-radius)',
                    backgroundColor: 'var(--gmp-surface)',
                    color: 'var(--gmp-text-primary)'
                  }}
                />
                {formData.modelo && (
                  <FiCheckCircle className="field-check-icon" style={{ position: 'absolute', right: '15px', top: '50%', transform: 'translateY(-50%)', color: '#10b981', fontSize: '20px' }} />
                )}
              </div>
              <small className="form-hint" style={{ display: 'block', marginTop: '8px', color: 'var(--gmp-text-secondary)', fontSize: '13px' }}>
                Digite o modelo específico do equipamento (ex: ULTRAMIX, Bimix) para facilitar buscas futuras
              </small>
            </div>
          )}

          <div className="form-group full-width">
            <label>Foto do Produto</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {imagemProduto && (
                <div style={{ 
                  width: '200px', 
                  height: '200px', 
                  border: '2px solid var(--gmp-border)', 
                  borderRadius: 'var(--border-radius)',
                  overflow: 'hidden',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: 'var(--gmp-surface-secondary)'
                }}>
                  <img 
                    src={`${api.defaults.baseURL}/uploads/produtos/${imagemProduto}`}
                    alt="Produto"
                    style={{ 
                      maxWidth: '100%', 
                      maxHeight: '100%', 
                      objectFit: 'contain' 
                    }}
                    onError={(e) => {
                      e.target.style.display = 'none';
                      if (e.target.nextSibling) {
                        e.target.nextSibling.style.display = 'flex';
                      }
                    }}
                  />
                  <div style={{ 
                    display: 'none', 
                    padding: '20px', 
                    textAlign: 'center',
                    color: 'var(--gmp-text-secondary)'
                  }}>
                    Imagem não encontrada
                  </div>
                </div>
              )}
              <input
                type="file"
                accept="image/*"
                onChange={handleUploadImagem}
                disabled={uploadingImagem || !id}
                style={{
                  padding: 'var(--spacing-md)',
                  border: '2px solid var(--gmp-border)',
                  borderRadius: 'var(--border-radius)',
                  background: 'var(--gmp-surface)',
                  color: 'var(--gmp-text)',
                  cursor: uploadingImagem || !id ? 'not-allowed' : 'pointer'
                }}
              />
              {!id && (
                <span style={{ 
                  fontSize: '0.875rem', 
                  color: 'var(--gmp-text-secondary)',
                  fontStyle: 'italic'
                }}>
                  Salve o produto primeiro para adicionar uma imagem
                </span>
              )}
              {uploadingImagem && (
                <span style={{ 
                  fontSize: '0.875rem', 
                  color: 'var(--gmp-primary)'
                }}>
                  Enviando imagem...
                </span>
              )}
            </div>
          </div>

          <div className="form-group">
            <label>Descrição</label>
            <textarea
              name="descricao"
              value={formData.descricao}
              onChange={handleChange}
              rows="3"
              placeholder="Descrição do produto"
            />
          </div>
        </div>

        <div className="form-section">
          <h2>Informações Comerciais</h2>
          <div className="form-grid">
            <div className="form-group">
              <label>Preço Base (R$)</label>
              <input
                type="number"
                name="preco_base"
                value={formData.preco_base}
                onChange={handleChange}
                step="0.01"
                min="0"
                placeholder="0.00"
              />
            </div>

            <div className="form-group">
              <label>ICMS (%)</label>
              <input
                type="number"
                name="icms"
                value={formData.icms}
                onChange={handleChange}
                step="0.01"
                min="0"
                max="100"
                placeholder="0.00"
              />
            </div>

            <div className="form-group">
              <label>IPI (%)</label>
              <input
                type="number"
                name="ipi"
                value={formData.ipi}
                onChange={handleChange}
                step="0.01"
                min="0"
                max="100"
                placeholder="0.00"
              />
            </div>

            <div className="form-group">
              <label>NCM {loadingNCM && <span style={{ fontSize: '0.8rem', color: 'var(--gmp-primary)' }}>(Buscando...)</span>}</label>
              <input
                type="text"
                name="ncm"
                value={formData.ncm}
                onChange={handleChange}
                placeholder="Código NCM (8 dígitos)"
                maxLength="8"
                pattern="[0-9]{8}"
              />
              <small style={{ display: 'block', marginTop: '5px', color: 'var(--gmp-text-light)', fontSize: '12px' }}>
                Ao preencher o NCM, ICMS e IPI serão preenchidos automaticamente
              </small>
            </div>
          </div>

          {/* Preview do Valor Total */}
          <div className="preview-valor-container">
            <h3>Preview do Valor</h3>
            <div className="preview-valor-content">
              <div className="preview-valor-item">
                <span className="preview-label">Preço Base:</span>
                <span className="preview-value">
                  {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(formData.preco_base || 0)}
                </span>
              </div>
              <div className="preview-valor-item">
                <span className="preview-label">ICMS ({formData.icms || 0}%):</span>
                <span className="preview-value">
                  {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
                    ((formData.preco_base || 0) * (formData.icms || 0)) / 100
                  )}
                </span>
              </div>
              <div className="preview-valor-item">
                <span className="preview-label">IPI ({formData.ipi || 0}%):</span>
                <span className="preview-value">
                  {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
                    ((formData.preco_base || 0) * (formData.ipi || 0)) / 100
                  )}
                </span>
              </div>
              <div className="preview-valor-total">
                <span className="preview-label-total">Valor Total:</span>
                <span className="preview-value-total">
                  {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
                    (formData.preco_base || 0) + 
                    ((formData.preco_base || 0) * (formData.icms || 0)) / 100 + 
                    ((formData.preco_base || 0) * (formData.ipi || 0)) / 100
                  )}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="form-section">
          <h2>Informações Técnicas</h2>
          
          {/* Material de Contato */}
          <div className="form-group" style={{ marginBottom: '30px' }}>
            <label style={{ marginBottom: '15px', display: 'block' }}>Material de Contato *</label>
            <div className="tecnicas-cards-grid">
              {opcoesMaterialContato.map(opcao => (
                <div
                  key={opcao}
                  className={`tecnica-card ${especificacoesTecnicas.material_contato === opcao && !outroAtivo.material_contato ? 'selecionado' : ''}`}
                  onClick={() => { handleEspecificacaoChange('material_contato', opcao); setOutro('material_contato', false); }}
                >
                  {especificacoesTecnicas.material_contato === opcao && !outroAtivo.material_contato && (
                    <div className="tecnica-card-check">
                      <FiCheck />
                    </div>
                  )}
                  <div className="tecnica-card-content">
                    <strong>{opcao}</strong>
                  </div>
                </div>
              ))}
              <div
                className={`tecnica-card tecnica-card-outro ${outroAtivo.material_contato ? 'selecionado' : ''}`}
                onClick={() => { setOutro('material_contato', true); handleEspecificacaoChange('material_contato', especificacoesTecnicas.material_contato || ''); }}
              >
                {outroAtivo.material_contato && (
                  <div className="tecnica-card-check">
                    <FiCheck />
                  </div>
                )}
                <div className="tecnica-card-content">
                  <strong>OUTRO</strong>
                </div>
              </div>
            </div>
            {outroAtivo.material_contato && (
              <div style={{ marginTop: '12px' }}>
                <input
                  type="text"
                  value={especificacoesTecnicas.material_contato || ''}
                  onChange={(e) => handleEspecificacaoChange('material_contato', e.target.value)}
                  placeholder="Descreva o material de contato"
                  style={{ width: '100%', padding: 'var(--spacing-md)', border: '2px solid var(--gmp-border)', borderRadius: 'var(--border-radius)', background: 'var(--gmp-surface)', color: 'var(--gmp-text)' }}
                />
              </div>
            )}
          </div>

          {/* Campos específicos para Discos e Acessórios */}
          {tipoProduto === 'discos-acessorios' && (
            <>
              {/* Diâmetro - Apenas para Hélices e Acessórios */}
              {formData.familia_produto === 'Hélices e Acessórios' && (
                <div className="form-group" style={{ marginBottom: '30px' }}>
                  <label style={{ marginBottom: '15px', display: 'block' }}>Diâmetro *</label>
                  <div style={{ position: 'relative' }}>
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      value={especificacoesTecnicas.diametro ? especificacoesTecnicas.diametro.replace('mm', '') : ''}
                      onChange={(e) => {
                        // Permitir apenas números
                        const value = e.target.value.replace(/[^0-9]/g, '');
                        // Sempre adicionar "mm" ao final ao salvar
                        const valueWithMM = value ? `${value}mm` : '';
                        handleEspecificacaoChange('diametro', valueWithMM);
                      }}
                      placeholder="Ex: 200"
                      style={{ 
                        width: '100%', 
                        padding: 'var(--spacing-md)', 
                        paddingRight: '50px',
                        border: '2px solid var(--gmp-border)', 
                        borderRadius: 'var(--border-radius)', 
                        background: 'var(--gmp-surface)', 
                        color: 'var(--gmp-text)' 
                      }}
                    />
                    <span style={{
                      position: 'absolute',
                      right: '12px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      color: 'var(--gmp-text-light)',
                      fontWeight: 600,
                      pointerEvents: 'none'
                    }}>mm</span>
                  </div>
                </div>
              )}

              {/* Espessura */}
              <div className="form-group" style={{ marginBottom: '30px' }}>
                <label style={{ marginBottom: '15px', display: 'block' }}>Espessura *</label>
                <div className="tecnicas-cards-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))' }}>
                  {['1/8', '3/16'].map(opcao => (
                    <div
                      key={opcao}
                      className={`tecnica-card ${especificacoesTecnicas.espessura === opcao && !outroAtivo.espessura ? 'selecionado' : ''}`}
                      onClick={() => { handleEspecificacaoChange('espessura', opcao); setOutro('espessura', false); }}
                    >
                      {especificacoesTecnicas.espessura === opcao && !outroAtivo.espessura && (
                        <div className="tecnica-card-check">
                          <FiCheck />
                        </div>
                      )}
                      <div className="tecnica-card-content">
                        <strong>{opcao}</strong>
                      </div>
                    </div>
                  ))}
                  <div
                    className={`tecnica-card tecnica-card-outro ${outroAtivo.espessura ? 'selecionado' : ''}`}
                    onClick={() => { setOutro('espessura', true); handleEspecificacaoChange('espessura', especificacoesTecnicas.espessura || ''); }}
                  >
                    {outroAtivo.espessura && <div className="tecnica-card-check"><FiCheck /></div>}
                    <div className="tecnica-card-content"><strong>OUTRO</strong></div>
                  </div>
                </div>
                {outroAtivo.espessura && (
                  <div style={{ marginTop: '12px' }}>
                    <input
                      type="text"
                      value={especificacoesTecnicas.espessura || ''}
                      onChange={(e) => handleEspecificacaoChange('espessura', e.target.value)}
                      placeholder="Descreva a espessura"
                      style={{ width: '100%', padding: 'var(--spacing-md)', border: '2px solid var(--gmp-border)', borderRadius: 'var(--border-radius)', background: 'var(--gmp-surface)', color: 'var(--gmp-text)' }}
                    />
                  </div>
                )}
              </div>

              {/* Acabamento */}
              <div className="form-group" style={{ marginBottom: '30px' }}>
                <label style={{ marginBottom: '15px', display: 'block' }}>Acabamento *</label>
                <div className="tecnicas-cards-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))' }}>
                  {['Polido', 'Escovado'].map(opcao => (
                    <div
                      key={opcao}
                      className={`tecnica-card ${especificacoesTecnicas.acabamento === opcao && !outroAtivo.acabamento ? 'selecionado' : ''}`}
                      onClick={() => { handleEspecificacaoChange('acabamento', opcao); setOutro('acabamento', false); }}
                    >
                      {especificacoesTecnicas.acabamento === opcao && !outroAtivo.acabamento && (
                        <div className="tecnica-card-check">
                          <FiCheck />
                        </div>
                      )}
                      <div className="tecnica-card-content">
                        <strong>{opcao}</strong>
                      </div>
                    </div>
                  ))}
                  <div
                    className={`tecnica-card tecnica-card-outro ${outroAtivo.acabamento ? 'selecionado' : ''}`}
                    onClick={() => { setOutro('acabamento', true); handleEspecificacaoChange('acabamento', especificacoesTecnicas.acabamento || ''); }}
                  >
                    {outroAtivo.acabamento && <div className="tecnica-card-check"><FiCheck /></div>}
                    <div className="tecnica-card-content"><strong>OUTRO</strong></div>
                  </div>
                </div>
                {outroAtivo.acabamento && (
                  <div style={{ marginTop: '12px' }}>
                    <input
                      type="text"
                      value={especificacoesTecnicas.acabamento || ''}
                      onChange={(e) => handleEspecificacaoChange('acabamento', e.target.value)}
                      placeholder="Descreva o acabamento"
                      style={{ width: '100%', padding: 'var(--spacing-md)', border: '2px solid var(--gmp-border)', borderRadius: 'var(--border-radius)', background: 'var(--gmp-surface)', color: 'var(--gmp-text)' }}
                    />
                  </div>
                )}
              </div>

              {/* Função - Discos e Acessórios */}
              <div className="form-group" style={{ marginBottom: '30px' }}>
                <label style={{ marginBottom: '15px', display: 'block' }}>Função *</label>
                  <div className="tecnicas-cards-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))' }}>
                    {['Alto nível de Cisalhamento', 'Homogenização'].map(opcao => (
                      <div
                        key={opcao}
                        className={`tecnica-card ${especificacoesTecnicas.funcao === opcao && !outroAtivo.funcao ? 'selecionado' : ''}`}
                        onClick={() => { handleEspecificacaoChange('funcao', opcao); setOutro('funcao', false); }}
                      >
                        {especificacoesTecnicas.funcao === opcao && !outroAtivo.funcao && (
                          <div className="tecnica-card-check">
                            <FiCheck />
                          </div>
                        )}
                        <div className="tecnica-card-content">
                          <strong>{opcao}</strong>
                        </div>
                      </div>
                    ))}
                    <div
                      className={`tecnica-card tecnica-card-outro ${outroAtivo.funcao ? 'selecionado' : ''}`}
                      onClick={() => { setOutro('funcao', true); handleEspecificacaoChange('funcao', especificacoesTecnicas.funcao || ''); }}
                    >
                      {outroAtivo.funcao && <div className="tecnica-card-check"><FiCheck /></div>}
                      <div className="tecnica-card-content"><strong>OUTRO</strong></div>
                    </div>
                  </div>
                  {outroAtivo.funcao && (
                    <div style={{ marginTop: '12px' }}>
                      <input
                        type="text"
                        value={especificacoesTecnicas.funcao || ''}
                        onChange={(e) => handleEspecificacaoChange('funcao', e.target.value)}
                        placeholder="Descreva a função"
                        style={{ width: '100%', padding: 'var(--spacing-md)', border: '2px solid var(--gmp-border)', borderRadius: 'var(--border-radius)', background: 'var(--gmp-surface)', color: 'var(--gmp-text)' }}
                      />
                    </div>
                  )}
                </div>

              {/* Tratamento Térmico - Discos e Acessórios */}
              <div className="form-group" style={{ marginBottom: '30px' }}>
                <label style={{ marginBottom: '15px', display: 'block' }}>Tratamento Térmico *</label>
                  <div className="tecnicas-cards-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))' }}>
                    {['Aplicado', 'Não Aplicado'].map(opcao => (
                      <div
                        key={opcao}
                        className={`tecnica-card ${especificacoesTecnicas.tratamento_termico === opcao && !outroAtivo.tratamento_termico ? 'selecionado' : ''}`}
                        onClick={() => {
                          setOutro('tratamento_termico', false);
                          handleEspecificacaoChange('tratamento_termico', opcao);
                          if (opcao === 'Não Aplicado') {
                            handleEspecificacaoChange('tratamento_termico_especifico', '');
                          }
                        }}
                      >
                        {especificacoesTecnicas.tratamento_termico === opcao && !outroAtivo.tratamento_termico && (
                          <div className="tecnica-card-check">
                            <FiCheck />
                          </div>
                        )}
                        <div className="tecnica-card-content">
                          <strong>{opcao}</strong>
                        </div>
                      </div>
                    ))}
                    <div
                      className={`tecnica-card tecnica-card-outro ${outroAtivo.tratamento_termico ? 'selecionado' : ''}`}
                      onClick={() => { setOutro('tratamento_termico', true); handleEspecificacaoChange('tratamento_termico', especificacoesTecnicas.tratamento_termico || ''); handleEspecificacaoChange('tratamento_termico_especifico', ''); }}
                    >
                      {outroAtivo.tratamento_termico && <div className="tecnica-card-check"><FiCheck /></div>}
                      <div className="tecnica-card-content"><strong>OUTRO</strong></div>
                    </div>
                  </div>
                  {outroAtivo.tratamento_termico && (
                    <div style={{ marginTop: '12px' }}>
                      <input
                        type="text"
                        value={especificacoesTecnicas.tratamento_termico || ''}
                        onChange={(e) => handleEspecificacaoChange('tratamento_termico', e.target.value)}
                        placeholder="Descreva o tratamento térmico"
                        style={{ width: '100%', padding: 'var(--spacing-md)', border: '2px solid var(--gmp-border)', borderRadius: 'var(--border-radius)', background: 'var(--gmp-surface)', color: 'var(--gmp-text)' }}
                      />
                    </div>
                  )}
                  {/* Campo para especificar o tratamento se for "Aplicado" (não OUTRO) */}
                  {especificacoesTecnicas.tratamento_termico === 'Aplicado' && !outroAtivo.tratamento_termico && (
                    <div style={{ marginTop: '15px' }}>
                      <label style={{ marginBottom: '8px', display: 'block', fontSize: '14px', color: 'var(--gmp-text-light)' }}>
                        Qual tratamento foi aplicado? *
                      </label>
                      <input
                        type="text"
                        value={especificacoesTecnicas.tratamento_termico_especifico || ''}
                        onChange={(e) => handleEspecificacaoChange('tratamento_termico_especifico', e.target.value)}
                        placeholder="Ex: Têmpera, Revenido, etc."
                        style={{ 
                          width: '100%', 
                          padding: 'var(--spacing-md)', 
                          border: '2px solid var(--gmp-border)', 
                          borderRadius: 'var(--border-radius)', 
                          background: 'var(--gmp-surface)', 
                          color: 'var(--gmp-text)' 
                        }}
                      />
                    </div>
                  )}
                </div>

              {/* Velocidade de Trabalho - Discos e Acessórios */}
              <div className="form-group" style={{ marginBottom: '30px' }}>
                <label style={{ marginBottom: '15px', display: 'block' }}>Velocidade de Trabalho *</label>
                  <div className="tecnicas-cards-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))' }}>
                    {['Informado', 'Não informado'].map(opcao => (
                      <div
                        key={opcao}
                        className={`tecnica-card ${especificacoesTecnicas.velocidade_trabalho === opcao && !outroAtivo.velocidade_trabalho ? 'selecionado' : ''}`}
                        onClick={() => {
                          setOutro('velocidade_trabalho', false);
                          handleEspecificacaoChange('velocidade_trabalho', opcao);
                          if (opcao === 'Não informado') {
                            handleEspecificacaoChange('velocidade_trabalho_especifica', '');
                          }
                        }}
                      >
                        {especificacoesTecnicas.velocidade_trabalho === opcao && !outroAtivo.velocidade_trabalho && (
                          <div className="tecnica-card-check">
                            <FiCheck />
                          </div>
                        )}
                        <div className="tecnica-card-content">
                          <strong>{opcao}</strong>
                        </div>
                      </div>
                    ))}
                    <div
                      className={`tecnica-card tecnica-card-outro ${outroAtivo.velocidade_trabalho ? 'selecionado' : ''}`}
                      onClick={() => { setOutro('velocidade_trabalho', true); handleEspecificacaoChange('velocidade_trabalho', especificacoesTecnicas.velocidade_trabalho || ''); handleEspecificacaoChange('velocidade_trabalho_especifica', ''); }}
                    >
                      {outroAtivo.velocidade_trabalho && <div className="tecnica-card-check"><FiCheck /></div>}
                      <div className="tecnica-card-content"><strong>OUTRO</strong></div>
                    </div>
                  </div>
                  {outroAtivo.velocidade_trabalho && (
                    <div style={{ marginTop: '12px' }}>
                      <input
                        type="text"
                        value={especificacoesTecnicas.velocidade_trabalho || ''}
                        onChange={(e) => handleEspecificacaoChange('velocidade_trabalho', e.target.value)}
                        placeholder="Descreva a velocidade de trabalho"
                        style={{ width: '100%', padding: 'var(--spacing-md)', border: '2px solid var(--gmp-border)', borderRadius: 'var(--border-radius)', background: 'var(--gmp-surface)', color: 'var(--gmp-text)' }}
                      />
                    </div>
                  )}
                  {/* Campo para especificar a velocidade se for "Informado" (não OUTRO) */}
                  {especificacoesTecnicas.velocidade_trabalho === 'Informado' && !outroAtivo.velocidade_trabalho && (
                    <div style={{ marginTop: '15px' }}>
                      <label style={{ marginBottom: '8px', display: 'block', fontSize: '14px', color: 'var(--gmp-text-light)' }}>
                        Qual a velocidade de trabalho? *
                      </label>
                      <input
                        type="text"
                        value={especificacoesTecnicas.velocidade_trabalho_especifica || ''}
                        onChange={(e) => handleEspecificacaoChange('velocidade_trabalho_especifica', e.target.value)}
                        placeholder="Ex: 500 rpm, 1000 rpm, etc."
                        style={{ 
                          width: '100%', 
                          padding: 'var(--spacing-md)', 
                          border: '2px solid var(--gmp-border)', 
                          borderRadius: 'var(--border-radius)', 
                          background: 'var(--gmp-surface)', 
                          color: 'var(--gmp-text)' 
                        }}
                      />
                    </div>
                  )}
                </div>

            </>
          )}

          {/* Potência Total Instalada - Apenas para Equipamentos */}
          {tipoProduto === 'equipamentos' && (
          <div className="potencia-instalada-container">
            <h3 className="potencia-instalada-title">Potência Total Instalada</h3>
            <div className="form-grid">
              <div className="form-group">
                <label>Motor Central CV</label>
                <div style={{ position: 'relative' }}>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={especificacoesTecnicas.motor_central_cv || ''}
                    onChange={(e) => {
                      // Permitir apenas números e ponto/vírgula para decimais
                      const value = e.target.value.replace(/[^0-9.,]/g, '').replace(',', '.');
                      handleEspecificacaoChange('motor_central_cv', value);
                    }}
                    placeholder="Se aplicável"
                    style={{ paddingRight: '40px' }}
                  />
                  <span className="potencia-unidade">CV</span>
                </div>
              </div>
              <div className="form-group">
                <label>Motoredutor Central CV</label>
                <div style={{ position: 'relative' }}>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={especificacoesTecnicas.motoredutor_central_cv || ''}
                    onChange={(e) => {
                      // Permitir apenas números e ponto/vírgula para decimais
                      const value = e.target.value.replace(/[^0-9.,]/g, '').replace(',', '.');
                      handleEspecificacaoChange('motoredutor_central_cv', value);
                    }}
                    placeholder="Se aplicável"
                    style={{ paddingRight: '40px' }}
                  />
                  <span className="potencia-unidade">CV</span>
                </div>
              </div>
              <div className="form-group">
                <label>Motores Laterais CV</label>
                <div style={{ position: 'relative' }}>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={especificacoesTecnicas.motores_laterais_cv || ''}
                    onChange={(e) => {
                      // Permitir apenas números e ponto/vírgula para decimais
                      const value = e.target.value.replace(/[^0-9.,]/g, '').replace(',', '.');
                      handleEspecificacaoChange('motores_laterais_cv', value);
                    }}
                    placeholder="Se aplicável"
                    style={{ paddingRight: '40px' }}
                  />
                  <span className="potencia-unidade">CV</span>
                </div>
              </div>
            </div>
            {/* Total Calculado */}
            {(() => {
              const motorCentral = parseFloat(especificacoesTecnicas.motor_central_cv) || 0;
              const motoredutorCentral = parseFloat(especificacoesTecnicas.motoredutor_central_cv) || 0;
              const motoresLaterais = parseFloat(especificacoesTecnicas.motores_laterais_cv) || 0;
              const total = motorCentral + motoredutorCentral + motoresLaterais;
              
              return total > 0 ? (
                <div className="potencia-total-card">
                  <div className="potencia-total-label">Potência Total Instalada</div>
                  <div className="potencia-total-valor">
                    {total.toFixed(2).replace('.', ',')} CV
                  </div>
                </div>
              ) : null;
            })()}
          </div>
          )}

          {/* CCM Incluso - Apenas para Equipamentos */}
          {tipoProduto === 'equipamentos' && (
          <>
          <div className="form-group" style={{ marginBottom: '30px' }}>
            <label style={{ marginBottom: '15px', display: 'block' }}>CCM Incluso? *</label>
            <div className="tecnicas-cards-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))' }}>
              {['Sim', 'Não'].map(opcao => (
                <div
                  key={opcao}
                  className={`tecnica-card ${especificacoesTecnicas.ccm_incluso === opcao ? 'selecionado' : ''} ${
                    especificacoesTecnicas.ccm_incluso === 'Não' ? 'ccm-nao' : ''
                  }`}
                  onClick={() => {
                    if (opcao === 'Não') {
                      setShowCCMAlert(true);
                    } else {
                      handleEspecificacaoChange('ccm_incluso', opcao);
                      handleEspecificacaoChange('ccm_tensao', '');
                    }
                  }}
                >
                  {especificacoesTecnicas.ccm_incluso === opcao && (
                    <div className="tecnica-card-check">
                      <FiCheck />
                    </div>
                  )}
                  <div className="tecnica-card-content">
                    <strong>{opcao}</strong>
                  </div>
                </div>
              ))}
            </div>
            {especificacoesTecnicas.ccm_incluso === 'Sim' && (
              <div style={{ marginTop: '20px' }}>
                <label style={{ marginBottom: '15px', display: 'block' }}>Tensão do CCM *</label>
                <div className="tecnicas-cards-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))' }}>
                  {opcoesCCMTensao.map(opcao => (
                    <div
                      key={opcao}
                      className={`tecnica-card ${especificacoesTecnicas.ccm_tensao === opcao ? 'selecionado' : ''}`}
                      onClick={() => handleEspecificacaoChange('ccm_tensao', opcao)}
                    >
                      {especificacoesTecnicas.ccm_tensao === opcao && (
                        <div className="tecnica-card-check">
                          <FiCheck />
                        </div>
                      )}
                      <div className="tecnica-card-content">
                        <strong>{opcao}</strong>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Célula de Carga e PLC/IHM - Apenas para Equipamentos */}
          <div className="form-grid" style={{ marginTop: '20px' }}>
            <div className="form-group">
              <label style={{ marginBottom: '15px', display: 'block' }}>Célula de Carga *</label>
              <div className="tecnicas-cards-grid" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
                {['Sim', 'Não'].map(opcao => (
                  <div
                    key={opcao}
                    className={`tecnica-card ${especificacoesTecnicas.celula_carga === opcao ? 'selecionado' : ''}`}
                    onClick={() => handleEspecificacaoChange('celula_carga', opcao)}
                  >
                    {especificacoesTecnicas.celula_carga === opcao && (
                      <div className="tecnica-card-check">
                        <FiCheck />
                      </div>
                    )}
                    <div className="tecnica-card-content">
                      <strong>{opcao}</strong>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="form-group">
              <label style={{ marginBottom: '15px', display: 'block' }}>PLC/IHM *</label>
              <div className="tecnicas-cards-grid" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
                {['Sim', 'Não'].map(opcao => (
                  <div
                    key={opcao}
                    className={`tecnica-card ${especificacoesTecnicas.plc_ihm === opcao ? 'selecionado' : ''}`}
                    onClick={() => handleEspecificacaoChange('plc_ihm', opcao)}
                  >
                    {especificacoesTecnicas.plc_ihm === opcao && (
                      <div className="tecnica-card-check">
                        <FiCheck />
                      </div>
                    )}
                    <div className="tecnica-card-content">
                      <strong>{opcao}</strong>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Válvula de Saída de Tanque - Apenas para Equipamentos */}
          <div className="form-group" style={{ marginTop: '20px', marginBottom: '30px' }}>
            <label style={{ marginBottom: '15px', display: 'block' }}>Válvula de Saída de Tanque</label>
            <div className="tecnicas-cards-grid">
              {opcoesValvulaSaida.map(opcao => (
                <div
                  key={opcao}
                  className={`tecnica-card ${especificacoesTecnicas.valvula_saida_tanque === opcao ? 'selecionado' : ''}`}
                  onClick={() => handleEspecificacaoChange('valvula_saida_tanque', opcao)}
                >
                  {especificacoesTecnicas.valvula_saida_tanque === opcao && (
                    <div className="tecnica-card-check">
                      <FiCheck />
                    </div>
                  )}
                  <div className="tecnica-card-content">
                    <strong>{opcao}</strong>
                  </div>
                </div>
              ))}
            </div>
          </div>
          </>
          )}

          {/* Classificação de Área - Apenas para Equipamentos */}
          {tipoProduto === 'equipamentos' && (
          <>
          <div className="form-group" style={{ marginBottom: '30px' }}>
            <label style={{ marginBottom: '15px', display: 'block' }}>Classificação de Área</label>
            <div className="tecnicas-cards-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
              {opcoesClassificacaoArea.map(opcao => (
                <div
                  key={opcao}
                  className={`tecnica-card ${especificacoesTecnicas.classificacao_area === opcao ? 'selecionado' : ''} ${
                    opcao === 'Base Água' ? 'classificacao-agua' : 'classificacao-solvente'
                  }`}
                  onClick={() => handleEspecificacaoChange('classificacao_area', opcao)}
                >
                  {especificacoesTecnicas.classificacao_area === opcao && (
                    <div className="tecnica-card-check">
                      <FiCheck />
                    </div>
                  )}
                  <div className="tecnica-card-content">
                    <strong>{opcao}</strong>
                  </div>
                </div>
              ))}
            </div>
          </div>
          </>
          )}

          {/* Densidade e Viscosidade - Apenas para Equipamentos */}
          {tipoProduto === 'equipamentos' && (
          <div className="form-grid" style={{ marginTop: '20px' }}>
            <div className="form-group">
              <label>Densidade que o Equipamento Suporta</label>
              <div style={{ position: 'relative' }}>
                <input
                  type="text"
                  value={especificacoesTecnicas.densidade || ''}
                  onChange={(e) => handleEspecificacaoChange('densidade', e.target.value)}
                  placeholder="Ex: Densidade aparente: 0.5 – 1.5 kg/l"
                  className={fieldErrors.densidade ? 'field-error' : (especificacoesTecnicas.densidade && !fieldErrors.densidade ? 'field-valid' : '')}
                />
                {especificacoesTecnicas.densidade && !fieldErrors.densidade && (
                  <FiCheckCircle className="field-check-icon" />
                )}
                {fieldErrors.densidade && (
                  <FiAlertCircle className="field-error-icon" />
                )}
              </div>
              {fieldErrors.densidade ? (
                <small className="field-error-message">
                  {fieldErrors.densidade}
                </small>
              ) : (
                <small className="field-hint-message">
                  Formato: Densidade aparente: x – x kg/l
                </small>
              )}
            </div>

            <div className="form-group">
              <label>Viscosidade que o Equipamento Suporta</label>
              <div style={{ position: 'relative' }}>
                <input
                  type="text"
                  value={especificacoesTecnicas.viscosidade || ''}
                  onChange={(e) => handleEspecificacaoChange('viscosidade', e.target.value)}
                  placeholder="Ex: Viscosidade do fluido: 100 – 5000 cPs"
                  className={fieldErrors.viscosidade ? 'field-error' : (especificacoesTecnicas.viscosidade && !fieldErrors.viscosidade ? 'field-valid' : '')}
                />
                {especificacoesTecnicas.viscosidade && !fieldErrors.viscosidade && (
                  <FiCheckCircle className="field-check-icon" />
                )}
                {fieldErrors.viscosidade && (
                  <FiAlertCircle className="field-error-icon" />
                )}
              </div>
              {fieldErrors.viscosidade ? (
                <small className="field-error-message">
                  {fieldErrors.viscosidade}
                </small>
              ) : (
                <small className="field-hint-message">
                  Formato: Viscosidade do fluido: x – x cPs
                </small>
              )}
            </div>
          </div>
          )}

          <div className="form-group" style={{ marginTop: '20px' }}>
            <label>Observações</label>
            <textarea
              name="observacoes"
              value={formData.observacoes}
              onChange={handleChange}
              rows="3"
              placeholder="Observações adicionais"
            />
          </div>
        </div>

        {/* Modal de Alerta CCM */}
        {showCCMAlert && (
          <div className="modal-alert-overlay" onClick={() => setShowCCMAlert(false)}>
            <div className="modal-alert-content" onClick={(e) => e.stopPropagation()}>
              <div className="modal-alert-header">
                <h3>⚠️ Atenção Importante</h3>
              </div>
              <div className="modal-alert-body">
                <p>
                  <strong>Este item deve ser vendido como um sistema mecânico e não como uma máquina/equipamento.</strong>
                </p>
                <p style={{ marginTop: '15px', color: '#666' }}>
                  Ao confirmar, você está ciente de que este produto não inclui CCM e deve ser comercializado como sistema mecânico.
                </p>
              </div>
              <div className="modal-alert-actions">
                <button
                  type="button"
                  className="btn-alert-confirm"
                  onClick={() => {
                    handleEspecificacaoChange('ccm_incluso', 'Não');
                    handleEspecificacaoChange('ccm_tensao', '');
                    setShowCCMAlert(false);
                  }}
                >
                  Confirmar - Estou Ciente
                </button>
                <button
                  type="button"
                  className="btn-alert-cancel"
                  onClick={() => setShowCCMAlert(false)}
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="form-actions">
          <button type="submit" className="btn-primary" disabled={loading}>
            <FiSave /> {loading ? 'Salvando...' : 'Salvar'}
          </button>
          <button type="button" onClick={() => navigate('/comercial/produtos')} className="btn-secondary">
            Cancelar
          </button>
        </div>
      </form>

      {/* Toast Notification */}
      {showToast.show && (
        <div className={`toast-notification toast-${showToast.type}`}>
          <div className="toast-content">
            {showToast.type === 'success' ? (
              <FiCheckCircle style={{ fontSize: '20px', marginRight: '10px' }} />
            ) : (
              <FiAlertCircle style={{ fontSize: '20px', marginRight: '10px' }} />
            )}
            <span>{showToast.message}</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProdutoForm;

