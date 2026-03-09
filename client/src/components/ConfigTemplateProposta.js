import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { FiSave, FiUpload, FiX, FiSettings, FiSearch, FiFileText } from 'react-icons/fi';
import './ConfigTemplateProposta.css';

const ConfigTemplateProposta = ({ embedded = false }) => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingHeader, setUploadingHeader] = useState(false);
  const [uploadingFooter, setUploadingFooter] = useState(false);
  const [variaveisList, setVariaveisList] = useState([]);
  const [variaveisPropostaSearch, setVariaveisPropostaSearch] = useState('');
  const [config, setConfig] = useState({
    nome_empresa: 'GMP INDUSTRIAIS',
    logo_url: null,
    cor_primaria: '#0066CC',
    cor_secundaria: '#003366',
    cor_texto: '#333333',
    mostrar_logo: true,
    cabecalho_customizado: '',
    rodape_customizado: '',
    texto_introducao: '',
    mostrar_especificacoes: true,
    mostrar_imagens_produtos: true,
    formato_numero_proposta: 'PROPOSTA TÉCNICA COMERCIAL N° {numero}',
    variaveis_proposta_tecnica: [],
    variaveis_proposta_por_familia: {}
  });
  const [logoPreview, setLogoPreview] = useState(null);
  const [headerPreview, setHeaderPreview] = useState(null);
  const [footerPreview, setFooterPreview] = useState(null);
  const [familiasList, setFamiliasList] = useState([]);
  const [familiaEquipamentoSelecionada, setFamiliaEquipamentoSelecionada] = useState('');
  const [variaveisPorEquipamentoSearch, setVariaveisPorEquipamentoSearch] = useState('');

  useEffect(() => {
    loadConfig();
  }, []);

  useEffect(() => {
    const token = localStorage.getItem('token');
    axios.get('/api/variaveis-tecnicas', { params: { ativo: 'true' }, headers: { Authorization: `Bearer ${token}` } })
      .then((res) => setVariaveisList(Array.isArray(res.data) ? res.data : []))
      .catch(() => setVariaveisList([]));
  }, []);

  useEffect(() => {
    const token = localStorage.getItem('token');
    axios.get('/api/familias/todas', { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => {
        const list = Array.isArray(res.data) ? res.data : [];
        setFamiliasList(list);
        if (!familiaEquipamentoSelecionada && list.length > 0) setFamiliaEquipamentoSelecionada(list[0].nome || '');
      })
      .catch(() => setFamiliasList([]));
  }, []);

  const loadConfig = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get('/api/proposta-template', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (response.data) {
        const vpt = response.data.variaveis_proposta_tecnica;
        const vpf = response.data.variaveis_proposta_por_familia;
        setConfig({
          ...response.data,
          mostrar_logo: response.data.mostrar_logo !== 0,
          mostrar_especificacoes: response.data.mostrar_especificacoes !== 0,
          mostrar_imagens_produtos: response.data.mostrar_imagens_produtos !== 0,
          variaveis_proposta_tecnica: Array.isArray(vpt) ? vpt : [],
          variaveis_proposta_por_familia: vpf && typeof vpf === 'object' ? vpf : {}
        });
        if (response.data.logo_url) {
          setLogoPreview(`/api/uploads/logos/${response.data.logo_url}`);
        }
        if (response.data.header_image_url) {
          setHeaderPreview(`/api/uploads/headers/${response.data.header_image_url}`);
        }
        if (response.data.footer_image_url) {
          setFooterPreview(`/api/uploads/footers/${response.data.footer_image_url}`);
        }
      }
    } catch (error) {
      console.error('Erro ao carregar configuração:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setConfig(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleLogoUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploadingLogo(true);
    try {
      const token = localStorage.getItem('token');
      const formData = new FormData();
      formData.append('logo', file);

      const response = await axios.post('/api/proposta-template/logo', formData, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'multipart/form-data'
        }
      });

      setConfig(prev => ({ ...prev, logo_url: response.data.filename }));
      setLogoPreview(`/api/uploads/logos/${response.data.filename}`);
    } catch (error) {
      console.error('Erro ao fazer upload do logo:', error);
      alert('Erro ao fazer upload do logo: ' + (error.response?.data?.error || error.message));
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleHeaderImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploadingHeader(true);
    try {
      const token = localStorage.getItem('token');
      const formData = new FormData();
      formData.append('headerImage', file);

      const response = await axios.post('/api/proposta-template/header-image', formData, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'multipart/form-data'
        }
      });

      setConfig(prev => ({ ...prev, header_image_url: response.data.filename }));
      setHeaderPreview(`/api/uploads/headers/${response.data.filename}`);
      alert('Imagem de cabeçalho enviada com sucesso!');
    } catch (error) {
      console.error('Erro ao fazer upload da imagem de cabeçalho:', error);
      alert('Erro ao fazer upload da imagem de cabeçalho: ' + (error.response?.data?.error || error.message));
    } finally {
      setUploadingHeader(false);
    }
  };

  const handleFooterImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploadingFooter(true);
    try {
      const token = localStorage.getItem('token');
      const formData = new FormData();
      formData.append('footerImage', file);

      const response = await axios.post('/api/proposta-template/footer-image', formData, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'multipart/form-data'
        }
      });

      setConfig(prev => ({ ...prev, footer_image_url: response.data.filename }));
      setFooterPreview(`/api/uploads/footers/${response.data.filename}`);
      alert('Imagem de rodapé enviada com sucesso!');
    } catch (error) {
      console.error('Erro ao fazer upload da imagem de rodapé:', error);
      alert('Erro ao fazer upload da imagem de rodapé: ' + (error.response?.data?.error || error.message));
    } finally {
      setUploadingFooter(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const token = localStorage.getItem('token');
      await axios.post('/api/proposta-template', {
        ...config,
        mostrar_logo: config.mostrar_logo ? 1 : 0,
        mostrar_especificacoes: config.mostrar_especificacoes ? 1 : 0,
        mostrar_imagens_produtos: config.mostrar_imagens_produtos ? 1 : 0,
        variaveis_proposta_tecnica: Array.isArray(config.variaveis_proposta_tecnica) ? config.variaveis_proposta_tecnica : [],
        variaveis_proposta_por_familia: config.variaveis_proposta_por_familia && typeof config.variaveis_proposta_por_familia === 'object' ? config.variaveis_proposta_por_familia : {}
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      alert('Configuração salva com sucesso!');
      if (!embedded) navigate('/comercial/propostas');
    } catch (error) {
      console.error('Erro ao salvar configuração:', error);
      alert('Erro ao salvar configuração: ' + (error.response?.data?.error || error.message));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="config-template-loading">Carregando...</div>;
  }

  return (
    <div className={`config-template-container ${embedded ? 'config-template-embedded' : ''}`}>
      {!embedded && (
        <div className="config-template-header">
          <h1><FiSettings /> Configurar Template de Proposta</h1>
          <button onClick={() => navigate('/comercial/propostas')} className="btn-close">
            <FiX /> Fechar
          </button>
        </div>
      )}
      {embedded && (
        <h2 className="config-template-embedded-title"><FiFileText /> Template de proposta — variáveis na proposta e layout</h2>
      )}
      <div className="config-template-content">
        <div className="config-section">
          <h2>Informações da Empresa</h2>
          <div className="form-group">
            <label>Nome da Empresa</label>
            <input
              type="text"
              name="nome_empresa"
              value={config.nome_empresa}
              onChange={handleChange}
              placeholder="GMP INDUSTRIAIS"
            />
          </div>

          <div className="form-group">
            <label>Logo da Empresa</label>
            {logoPreview && (
              <div className="logo-preview">
                <img src={logoPreview} alt="Logo" />
              </div>
            )}
            <div className="upload-logo-container">
              <input
                type="file"
                id="logo-upload"
                accept="image/*"
                onChange={handleLogoUpload}
                style={{ display: 'none' }}
              />
              <label htmlFor="logo-upload" className="btn-upload-logo">
                <FiUpload /> {uploadingLogo ? 'Enviando...' : logoPreview ? 'Alterar Logo' : 'Enviar Logo'}
              </label>
            </div>
            <div className="form-checkbox">
              <input
                type="checkbox"
                name="mostrar_logo"
                checked={config.mostrar_logo}
                onChange={handleChange}
              />
              <label>Mostrar logo na proposta</label>
            </div>
          </div>
        </div>

        <div className="config-section">
          <h2>Cores</h2>
          <div className="colors-grid">
            <div className="form-group">
              <label>Cor Primária</label>
              <div className="color-input-group">
                <input
                  type="color"
                  name="cor_primaria"
                  value={config.cor_primaria}
                  onChange={handleChange}
                />
                <input
                  type="text"
                  name="cor_primaria"
                  value={config.cor_primaria}
                  onChange={handleChange}
                  className="color-text-input"
                />
              </div>
            </div>

            <div className="form-group">
              <label>Cor Secundária</label>
              <div className="color-input-group">
                <input
                  type="color"
                  name="cor_secundaria"
                  value={config.cor_secundaria}
                  onChange={handleChange}
                />
                <input
                  type="text"
                  name="cor_secundaria"
                  value={config.cor_secundaria}
                  onChange={handleChange}
                  className="color-text-input"
                />
              </div>
            </div>

            <div className="form-group">
              <label>Cor do Texto</label>
              <div className="color-input-group">
                <input
                  type="color"
                  name="cor_texto"
                  value={config.cor_texto}
                  onChange={handleChange}
                />
                <input
                  type="text"
                  name="cor_texto"
                  value={config.cor_texto}
                  onChange={handleChange}
                  className="color-text-input"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="config-section">
          <h2>Formato do Número da Proposta</h2>
          <div className="form-group">
            <label>Formato (use {`{numero}`} para o número da proposta)</label>
            <input
              type="text"
              name="formato_numero_proposta"
              value={config.formato_numero_proposta}
              onChange={handleChange}
              placeholder="PROPOSTA TÉCNICA COMERCIAL N° {numero}"
            />
            <small>Exemplo: PROPOSTA TÉCNICA COMERCIAL N° {config.formato_numero_proposta.replace('{numero}', '001-01-MH-2026-REV00')}</small>
          </div>
        </div>

        <div className="config-section">
          <h2>Conteúdo Personalizado</h2>
          <div className="form-group">
            <label>Cabeçalho Customizado (HTML permitido)</label>
            <textarea
              name="cabecalho_customizado"
              value={config.cabecalho_customizado}
              onChange={handleChange}
              rows="4"
              placeholder="Texto que aparecerá no cabeçalho da proposta..."
            />
          </div>

          <div className="form-group">
            <label>Texto de Introdução</label>
            <textarea
              name="texto_introducao"
              value={config.texto_introducao}
              onChange={handleChange}
              rows="4"
              placeholder="Texto introdutório que aparecerá após o cabeçalho..."
            />
          </div>

          <div className="form-group">
            <label>Rodapé Customizado (HTML permitido)</label>
            <textarea
              name="rodape_customizado"
              value={config.rodape_customizado}
              onChange={handleChange}
              rows="4"
              placeholder="Texto que aparecerá no rodapé da proposta..."
            />
          </div>

          <div className="form-group">
            <label>Imagem de Cabeçalho</label>
            {headerPreview && (
              <div className="logo-preview" style={{ marginBottom: '10px' }}>
                <img src={headerPreview} alt="Cabeçalho" style={{ maxWidth: '100%', maxHeight: '200px' }} />
              </div>
            )}
            <div className="upload-logo-container">
              <input
                type="file"
                id="header-image-upload"
                accept="image/*"
                onChange={handleHeaderImageUpload}
                style={{ display: 'none' }}
              />
              <label htmlFor="header-image-upload" className="btn-upload-logo">
                <FiUpload /> {uploadingHeader ? 'Enviando...' : headerPreview ? 'Alterar Imagem de Cabeçalho' : 'Enviar Imagem de Cabeçalho'}
              </label>
            </div>
            <small style={{ display: 'block', marginTop: '5px', color: '#666' }}>
              A imagem aparecerá como cabeçalho fixo a partir da segunda página (onde está "OBJETIVO DA PROPOSTA")
            </small>
          </div>

          <div className="form-group">
            <label>Imagem de Rodapé</label>
            {footerPreview && (
              <div className="logo-preview" style={{ marginBottom: '10px' }}>
                <img src={footerPreview} alt="Rodapé" style={{ maxWidth: '100%', maxHeight: '200px' }} />
              </div>
            )}
            <div className="upload-logo-container">
              <input
                type="file"
                id="footer-image-upload"
                accept="image/*"
                onChange={handleFooterImageUpload}
                style={{ display: 'none' }}
              />
              <label htmlFor="footer-image-upload" className="btn-upload-logo">
                <FiUpload /> {uploadingFooter ? 'Enviando...' : footerPreview ? 'Alterar Imagem de Rodapé' : 'Enviar Imagem de Rodapé'}
              </label>
            </div>
            <small style={{ display: 'block', marginTop: '5px', color: '#666' }}>
              A imagem aparecerá no final da proposta como parte do conteúdo
            </small>
          </div>
        </div>

        <div className="config-section">
          <h2>Opções de Exibição</h2>
          <div className="form-checkbox">
            <input
              type="checkbox"
              name="mostrar_especificacoes"
              checked={config.mostrar_especificacoes}
              onChange={handleChange}
            />
            <label>Mostrar especificações técnicas dos produtos</label>
          </div>

          <div className="form-checkbox">
            <input
              type="checkbox"
              name="mostrar_imagens_produtos"
              checked={config.mostrar_imagens_produtos}
              onChange={handleChange}
            />
            <label>Mostrar imagens dos produtos</label>
          </div>
        </div>

        <div className="config-section config-section-variaveis-proposta">
          <h2>Variáveis técnicas na proposta</h2>
          <p className="config-hint">Selecione quais variáveis técnicas podem aparecer na proposta técnica comercial. Se nenhuma for marcada, será usada a lista padrão (comportamento anterior).</p>
          <div className="variaveis-proposta-search-wrap">
            <FiSearch className="variaveis-proposta-search-icon" aria-hidden />
            <input
              type="text"
              value={variaveisPropostaSearch}
              onChange={(e) => setVariaveisPropostaSearch(e.target.value)}
              placeholder="Pesquisar variáveis por nome ou chave..."
              className="variaveis-proposta-search-input"
              aria-label="Pesquisar variáveis para exibir na proposta"
            />
          </div>
          <div className="variaveis-proposta-list">
            {(() => {
              const termo = (variaveisPropostaSearch || '').trim().toLowerCase();
              const filtradas = termo
                ? variaveisList.filter((v) => (v.nome || '').toLowerCase().includes(termo) || (v.chave || '').toLowerCase().includes(termo))
                : variaveisList;
              const selecionadas = config.variaveis_proposta_tecnica || [];
              return filtradas.length === 0 ? (
                <div className="variaveis-proposta-empty">
                  {variaveisList.length === 0 ? 'Carregando variáveis...' : 'Nenhuma variável encontrada para o termo pesquisado.'}
                </div>
              ) : (
                filtradas.map((v) => {
                  const chave = v.chave || '';
                  const checked = selecionadas.includes(chave);
                  return (
                    <label key={v.id} className={`variaveis-proposta-item ${checked ? 'variaveis-proposta-item-selected' : ''}`}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => {
                          const next = checked ? selecionadas.filter((c) => c !== chave) : [...selecionadas, chave];
                          setConfig((prev) => ({ ...prev, variaveis_proposta_tecnica: next }));
                        }}
                      />
                      <span className="variaveis-proposta-item-nome">{v.nome || chave}</span>
                      <code className="variaveis-proposta-item-chave">{chave}</code>
                    </label>
                  );
                })
              );
            })()}
          </div>
          {(config.variaveis_proposta_tecnica || []).length > 0 && (
            <div className="variaveis-proposta-selecionadas">
              {(config.variaveis_proposta_tecnica || []).length} variável(is) selecionada(s) para aparecer na proposta (padrão para todos os equipamentos)
            </div>
          )}
        </div>

        <div className="config-section config-section-variaveis-por-equipamento">
          <h2>Variáveis por equipamento (família)</h2>
          <p className="config-hint">Defina quais variáveis aparecem na proposta para cada família de equipamento. Se não configurar uma família, será usada a lista padrão acima.</p>
          <div className="variaveis-por-equipamento-select-wrap">
            <label className="variaveis-por-equipamento-label">Equipamento (família):</label>
            <select
              value={familiaEquipamentoSelecionada}
              onChange={(e) => setFamiliaEquipamentoSelecionada(e.target.value)}
              className="variaveis-por-equipamento-select"
            >
              <option value="">Selecione uma família...</option>
              {familiasList.map((f) => (
                <option key={f.id} value={f.nome || ''}>{f.nome}</option>
              ))}
            </select>
          </div>
          {familiaEquipamentoSelecionada && (
            <>
              <div className="variaveis-proposta-search-wrap">
                <FiSearch className="variaveis-proposta-search-icon" aria-hidden />
                <input
                  type="text"
                  value={variaveisPorEquipamentoSearch}
                  onChange={(e) => setVariaveisPorEquipamentoSearch(e.target.value)}
                  placeholder="Pesquisar variáveis..."
                  className="variaveis-proposta-search-input"
                />
              </div>
              <div className="variaveis-proposta-list">
                {(() => {
                  const termo = (variaveisPorEquipamentoSearch || '').trim().toLowerCase();
                  const filtradas = termo
                    ? variaveisList.filter((v) => (v.nome || '').toLowerCase().includes(termo) || (v.chave || '').toLowerCase().includes(termo))
                    : variaveisList;
                  const porFamilia = config.variaveis_proposta_por_familia || {};
                  const selecionadas = Array.isArray(porFamilia[familiaEquipamentoSelecionada]) ? porFamilia[familiaEquipamentoSelecionada] : [];
                  return filtradas.length === 0 ? (
                    <div className="variaveis-proposta-empty">
                      {variaveisList.length === 0 ? 'Carregando variáveis...' : 'Nenhuma variável encontrada.'}
                    </div>
                  ) : (
                    filtradas.map((v) => {
                      const chave = v.chave || '';
                      const checked = selecionadas.includes(chave);
                      return (
                        <label key={v.id} className={`variaveis-proposta-item ${checked ? 'variaveis-proposta-item-selected' : ''}`}>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => {
                              const next = checked ? selecionadas.filter((c) => c !== chave) : [...selecionadas, chave];
                              setConfig((prev) => ({
                                ...prev,
                                variaveis_proposta_por_familia: {
                                  ...(prev.variaveis_proposta_por_familia || {}),
                                  [familiaEquipamentoSelecionada]: next
                                }
                              }));
                            }}
                          />
                          <span className="variaveis-proposta-item-nome">{v.nome || chave}</span>
                          <code className="variaveis-proposta-item-chave">{chave}</code>
                        </label>
                      );
                    })
                  );
                })()}
              </div>
              <div className="variaveis-proposta-selecionadas">
                {((config.variaveis_proposta_por_familia || {})[familiaEquipamentoSelecionada] || []).length} variável(is) para &quot;{familiaEquipamentoSelecionada}&quot;
              </div>
            </>
          )}
        </div>

        <div className="config-actions">
          <button onClick={handleSave} className="btn-save" disabled={saving}>
            <FiSave /> {saving ? 'Salvando...' : 'Salvar Configuração'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfigTemplateProposta;
