import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { FiSave, FiX, FiSettings, FiPlus, FiTrash2, FiMove, FiEye, FiEdit2, FiDownload, FiRotateCcw, FiFolder } from 'react-icons/fi';
import './EditorTemplateProposta.css';

const EditorTemplateProposta = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [familiaSelecionada, setFamiliaSelecionada] = useState('Hélices e Acessórios');
  const [componentes, setComponentes] = useState([]);
  const [componenteSelecionado, setComponenteSelecionado] = useState(null);
  const [mostrarPreview, setMostrarPreview] = useState(true);
  const [config, setConfig] = useState({
    nome_empresa: 'GMP INDUSTRIAIS',
    logo_url: null,
    cor_primaria: '#0066CC',
    cor_secundaria: '#003366',
    cor_texto: '#333333',
    mostrar_logo: true
  });
  const [logoPreview, setLogoPreview] = useState(null);
  const [templatesSalvos, setTemplatesSalvos] = useState([]);
  const [mostrarModalTemplates, setMostrarModalTemplates] = useState(false);
  const [mostrarModalSalvar, setMostrarModalSalvar] = useState(false);
  const [nomeNovoTemplate, setNomeNovoTemplate] = useState('');

  const familiasDisponiveis = [
    'Hélices e Acessórios',
    'Equipamentos',
    'Serviços',
    'Geral'
  ];

  const tiposComponentes = [
    { id: 'cabecalho', nome: 'Cabeçalho', icone: '📄', descricao: 'Cabeçalho da proposta' },
    { id: 'dados_cliente', nome: 'Dados do Cliente', icone: '👤', descricao: 'Informações do cliente' },
    { id: 'produtos', nome: 'Produtos', icone: '📦', descricao: 'Lista de produtos' },
    { id: 'valores', nome: 'Valores', icone: '💰', descricao: 'Tabela de valores' },
    { id: 'condicoes', nome: 'Condições', icone: '📋', descricao: 'Condições comerciais' },
    { id: 'texto', nome: 'Texto Livre', icone: '📝', descricao: 'Texto personalizado' },
    { id: 'tabela', nome: 'Tabela', icone: '📊', descricao: 'Tabela de dados' },
    { id: 'imagem', nome: 'Imagem', icone: '🖼️', descricao: 'Imagem' },
    { id: 'rodape', nome: 'Rodapé', icone: '⬇️', descricao: 'Rodapé da proposta' },
    { id: 'divisor', nome: 'Divisor', icone: '➖', descricao: 'Linha divisória' },
    { id: 'espaco', nome: 'Espaço', icone: '⬜', descricao: 'Espaço em branco' },
    { id: 'titulo', nome: 'Título', icone: '📌', descricao: 'Título de seção' },
    { id: 'subtitulo', nome: 'Subtítulo', icone: '📎', descricao: 'Subtítulo' },
    { id: 'lista', nome: 'Lista', icone: '📋', descricao: 'Lista de itens' }
  ];

  useEffect(() => {
    loadConfig();
    loadTemplatesSalvos();
  }, [familiaSelecionada]);

  useEffect(() => {
    loadTemplatesSalvos();
  }, []);

  const loadConfig = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get('/api/proposta-template', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (response.data) {
        setConfig({
          ...response.data,
          mostrar_logo: response.data.mostrar_logo !== 0
        });
        if (response.data.logo_url) {
          setLogoPreview(`/api/uploads/logos/${response.data.logo_url}`);
        }
        // Carregar componentes salvos se existirem
        if (response.data.componentes) {
          try {
            setComponentes(JSON.parse(response.data.componentes));
          } catch (e) {
            console.error('Erro ao parsear componentes:', e);
          }
        }
      }
    } catch (error) {
      console.error('Erro ao carregar configuração:', error);
    } finally {
      setLoading(false);
    }
  };

  const adicionarComponente = (tipo) => {
    const novoComponente = {
      id: Date.now().toString(),
      tipo: tipo.id,
      ordem: componentes.length,
      config: getConfigPadraoComponente(tipo.id)
    };
    setComponentes([...componentes, novoComponente]);
    setComponenteSelecionado(novoComponente.id);
  };

  const getConfigPadraoComponente = (tipo) => {
    switch (tipo) {
      case 'texto':
        return { conteudo: 'Digite seu texto aqui...', titulo: '', tamanho: 'normal' };
      case 'tabela':
        return { titulo: 'Tabela', colunas: ['Coluna 1', 'Coluna 2'], linhas: [['Dado 1', 'Dado 2']] };
      case 'imagem':
        return { url: '', alt: 'Imagem', largura: '100%' };
      default:
        return {};
    }
  };

  const removerComponente = (id) => {
    setComponentes(componentes.filter(c => c.id !== id));
    if (componenteSelecionado === id) {
      setComponenteSelecionado(null);
    }
  };

  const moverComponente = (index, direcao) => {
    const novosComponentes = [...componentes];
    const novoIndex = direcao === 'up' ? index - 1 : index + 1;
    if (novoIndex >= 0 && novoIndex < componentes.length) {
      [novosComponentes[index], novosComponentes[novoIndex]] = [novosComponentes[novoIndex], novosComponentes[index]];
      setComponentes(novosComponentes);
    }
  };

  const atualizarComponente = (id, novosDados) => {
    setComponentes(componentes.map(c => 
      c.id === id ? { ...c, config: { ...c.config, ...novosDados } } : c
    ));
  };

  const handleDragStart = (e, index) => {
    e.dataTransfer.setData('text/plain', index.toString());
  };

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  const handleDrop = (e, dropIndex) => {
    e.preventDefault();
    const dragIndex = parseInt(e.dataTransfer.getData('text/plain'));
    if (dragIndex !== dropIndex) {
      const novosComponentes = [...componentes];
      const [removido] = novosComponentes.splice(dragIndex, 1);
      novosComponentes.splice(dropIndex, 0, removido);
      setComponentes(novosComponentes);
    }
  };

  const loadTemplatesSalvos = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`/api/proposta-template/list?familia=${familiaSelecionada}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setTemplatesSalvos(response.data || []);
    } catch (error) {
      console.error('Erro ao carregar templates:', error);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const token = localStorage.getItem('token');
      await axios.post('/api/proposta-template', {
        ...config,
        familia: familiaSelecionada,
        componentes: JSON.stringify(componentes),
        mostrar_logo: config.mostrar_logo ? 1 : 0
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      alert('Template salvo com sucesso!');
      loadTemplatesSalvos();
    } catch (error) {
      console.error('Erro ao salvar:', error);
      alert('Erro ao salvar: ' + (error.response?.data?.error || error.message));
    } finally {
      setSaving(false);
    }
  };

  const handleSaveAs = async () => {
    if (!nomeNovoTemplate.trim()) {
      alert('Por favor, informe um nome para o template');
      return;
    }
    setSaving(true);
    try {
      const token = localStorage.getItem('token');
      await axios.post('/api/proposta-template/save-as', {
        nome_template: nomeNovoTemplate,
        ...config,
        familia: familiaSelecionada,
        componentes: JSON.stringify(componentes),
        mostrar_logo: config.mostrar_logo ? 1 : 0
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      alert('Template salvo com sucesso!');
      setMostrarModalSalvar(false);
      setNomeNovoTemplate('');
      loadTemplatesSalvos();
    } catch (error) {
      console.error('Erro ao salvar:', error);
      alert('Erro ao salvar: ' + (error.response?.data?.error || error.message));
    } finally {
      setSaving(false);
    }
  };

  const handleLoadTemplate = async (templateId) => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`/api/proposta-template/${templateId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const template = response.data;
      setConfig({
        nome_empresa: template.nome_empresa || 'GMP INDUSTRIAIS',
        logo_url: template.logo_url,
        cor_primaria: template.cor_primaria || '#0066CC',
        cor_secundaria: template.cor_secundaria || '#003366',
        cor_texto: template.cor_texto || '#333333',
        mostrar_logo: template.mostrar_logo !== 0
      });
      if (template.logo_url) {
        setLogoPreview(`/api/uploads/logos/${template.logo_url}`);
      }
      if (template.componentes) {
        try {
          setComponentes(JSON.parse(template.componentes));
        } catch (e) {
          console.error('Erro ao parsear componentes:', e);
        }
      }
      setMostrarModalTemplates(false);
      alert('Template carregado com sucesso!');
    } catch (error) {
      console.error('Erro ao carregar template:', error);
      alert('Erro ao carregar template: ' + (error.response?.data?.error || error.message));
    }
  };

  const handleRestoreDefault = async () => {
    if (!window.confirm('Tem certeza que deseja restaurar o template padrão? Isso removerá todas as personalizações.')) {
      return;
    }
    try {
      const token = localStorage.getItem('token');
      await axios.post('/api/proposta-template/restore-default', {
        familia: familiaSelecionada
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      loadConfig();
      setComponentes([]);
      alert('Template padrão restaurado!');
    } catch (error) {
      console.error('Erro ao restaurar:', error);
      alert('Erro ao restaurar: ' + (error.response?.data?.error || error.message));
    }
  };

  const renderizarPreviewComponente = (componente) => {
    switch (componente.tipo) {
      case 'cabecalho':
        return (
          <div className="preview-cabecalho" style={{ background: config.cor_primaria, color: 'white', padding: '20px', textAlign: 'center' }}>
            {config.mostrar_logo && logoPreview && <img src={logoPreview} alt="Logo" style={{ maxHeight: '60px', marginBottom: '10px' }} />}
            <h2>{config.nome_empresa}</h2>
            <p>PROPOSTA TÉCNICA COMERCIAL N° 001-01-MH-2026-REV00</p>
          </div>
        );
      case 'dados_cliente':
        return (
          <div className="preview-dados-cliente">
            <h3 style={{ color: config.cor_primaria }}>Dados do Cliente</h3>
            <table className="preview-table">
              <tr><td>Empresa:</td><td>Nome da Empresa</td></tr>
              <tr><td>CNPJ:</td><td>00.000.000/0001-00</td></tr>
              <tr><td>Telefone:</td><td>(11) 0000-0000</td></tr>
            </table>
          </div>
        );
      case 'produtos':
        return (
          <div className="preview-produtos">
            <h3 style={{ color: config.cor_primaria }}>Produtos</h3>
            <div className="preview-produto-item">
              <strong>Produto Exemplo</strong>
              <p>Código: PROD-001</p>
              <p>Quantidade: 1 UN</p>
              <p>Valor: R$ 1.000,00</p>
            </div>
          </div>
        );
      case 'valores':
        return (
          <div className="preview-valores">
            <h3 style={{ color: config.cor_primaria }}>Valores</h3>
            <table className="preview-table">
              <thead>
                <tr>
                  <th>Descrição</th>
                  <th>Quantidade</th>
                  <th>Valor Unit.</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Produto Exemplo</td>
                  <td>1 UN</td>
                  <td>R$ 1.000,00</td>
                  <td>R$ 1.000,00</td>
                </tr>
              </tbody>
            </table>
            <div style={{ marginTop: '15px', textAlign: 'right' }}>
              <strong>Total: R$ 1.000,00</strong>
            </div>
          </div>
        );
      case 'condicoes':
        return (
          <div className="preview-condicoes">
            <h3 style={{ color: config.cor_primaria }}>Condições Comerciais</h3>
            <p>Prazo de entrega: 30 dias</p>
            <p>Condições de pagamento: A combinar</p>
            <p>Garantia: 12 meses</p>
          </div>
        );
      case 'texto':
        return (
          <div className="preview-texto">
            {componente.config.titulo && <h3 style={{ color: config.cor_primaria }}>{componente.config.titulo}</h3>}
            <p style={{ fontSize: componente.config.tamanho === 'grande' ? '16px' : componente.config.tamanho === 'pequeno' ? '12px' : '14px' }}>
              {componente.config.conteudo || 'Digite seu texto aqui...'}
            </p>
          </div>
        );
      case 'tabela':
        return (
          <div className="preview-tabela">
            {componente.config.titulo && <h3 style={{ color: config.cor_primaria }}>{componente.config.titulo}</h3>}
            <table className="preview-table">
              <thead>
                <tr>
                  {componente.config.colunas?.map((col, i) => <th key={i}>{col}</th>)}
                </tr>
              </thead>
              <tbody>
                {componente.config.linhas?.map((linha, i) => (
                  <tr key={i}>
                    {linha.map((celula, j) => <td key={j}>{celula}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      case 'imagem':
        return (
          <div className="preview-imagem">
            {componente.config.url ? (
              <img src={componente.config.url} alt={componente.config.alt} style={{ width: componente.config.largura, maxWidth: '100%' }} />
            ) : (
              <div style={{ padding: '40px', background: '#f0f0f0', textAlign: 'center', color: '#999' }}>
                Imagem não configurada
              </div>
            )}
          </div>
        );
      case 'rodape':
        return (
          <div className="preview-rodape" style={{ background: config.cor_secundaria, color: 'white', padding: '20px', textAlign: 'center' }}>
            <p>{config.nome_empresa}</p>
            <p>contato@gmp.ind.br | www.gmp.ind.br</p>
          </div>
        );
      case 'divisor':
        return (
          <div style={{ borderTop: `2px solid ${config.cor_primaria}`, margin: '15px 0' }}></div>
        );
      case 'espaco':
        return (
          <div style={{ height: componente.config.altura || '30px' }}></div>
        );
      case 'titulo':
        return (
          <h2 style={{ color: config.cor_primaria, fontSize: '18px', fontWeight: 'bold', marginBottom: '10px' }}>
            {componente.config.texto || 'Título'}
          </h2>
        );
      case 'subtitulo':
        return (
          <h3 style={{ color: config.cor_secundaria, fontSize: '14px', fontWeight: '600', marginBottom: '8px' }}>
            {componente.config.texto || 'Subtítulo'}
          </h3>
        );
      case 'lista':
        return (
          <div className="preview-lista">
            {componente.config.titulo && <h3 style={{ color: config.cor_primaria }}>{componente.config.titulo}</h3>}
            <ul style={{ paddingLeft: '20px' }}>
              {(componente.config.itens || ['Item 1', 'Item 2']).map((item, i) => (
                <li key={i} style={{ marginBottom: '5px' }}>{item}</li>
              ))}
            </ul>
          </div>
        );
      default:
        return <div>Componente desconhecido</div>;
    }
  };

  if (loading) {
    return <div className="editor-loading">Carregando...</div>;
  }

  return (
    <div className="editor-template-container">
      <div className="editor-header">
        <h1><FiSettings /> Editor de Template de Proposta</h1>
        <div className="editor-header-actions">
          <button onClick={() => setMostrarPreview(!mostrarPreview)} className="btn-toggle-preview">
            <FiEye /> {mostrarPreview ? 'Ocultar' : 'Mostrar'} Preview
          </button>
          <button onClick={() => navigate('/comercial/propostas')} className="btn-close">
            <FiX /> Fechar
          </button>
        </div>
      </div>

      <div className="editor-main">
        <div className="editor-sidebar">
          <div className="sidebar-section">
            <h3>Família do Template</h3>
            <select 
              value={familiaSelecionada} 
              onChange={(e) => setFamiliaSelecionada(e.target.value)}
              className="select-familia"
            >
              {familiasDisponiveis.map(f => (
                <option key={f} value={f}>{f}</option>
              ))}
            </select>
          </div>

          <div className="sidebar-section">
            <h3>Configurações Gerais</h3>
            <div className="form-group-small">
              <label>Nome da Empresa</label>
              <input
                type="text"
                value={config.nome_empresa}
                onChange={(e) => setConfig({ ...config, nome_empresa: e.target.value })}
              />
            </div>
            <div className="form-group-small">
              <label>Cor Primária</label>
              <input
                type="color"
                value={config.cor_primaria}
                onChange={(e) => setConfig({ ...config, cor_primaria: e.target.value })}
              />
            </div>
            <div className="form-group-small">
              <label>Cor Secundária</label>
              <input
                type="color"
                value={config.cor_secundaria}
                onChange={(e) => setConfig({ ...config, cor_secundaria: e.target.value })}
              />
            </div>
          </div>

          <div className="sidebar-section">
            <h3>Adicionar Componentes</h3>
            <div className="componentes-disponiveis">
              {tiposComponentes.map(tipo => (
                <button
                  key={tipo.id}
                  onClick={() => adicionarComponente(tipo)}
                  className="btn-adicionar-componente"
                  title={tipo.descricao}
                >
                  <span className="componente-icone">{tipo.icone}</span>
                  <span className="componente-nome">{tipo.nome}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="editor-content">
          <div className="editor-canvas">
            <h3>Componentes do Template</h3>
            {componentes.length === 0 ? (
              <div className="canvas-vazio">
                <p>Clique nos botões ao lado para adicionar componentes ao template</p>
                <p>Você pode arrastar para reorganizar a ordem</p>
              </div>
            ) : (
              <div className="componentes-lista">
                {componentes.map((componente, index) => {
                  const tipo = tiposComponentes.find(t => t.id === componente.tipo);
                  return (
                    <div
                      key={componente.id}
                      className={`componente-item ${componenteSelecionado === componente.id ? 'selecionado' : ''}`}
                      draggable
                      onDragStart={(e) => handleDragStart(e, index)}
                      onDragOver={handleDragOver}
                      onDrop={(e) => handleDrop(e, index)}
                      onClick={() => setComponenteSelecionado(componente.id)}
                    >
                      <div className="componente-header">
                        <div className="componente-info">
                          <span className="componente-icone">{tipo?.icone}</span>
                          <span className="componente-nome">{tipo?.nome}</span>
                        </div>
                        <div className="componente-acoes">
                          <button
                            onClick={(e) => { e.stopPropagation(); moverComponente(index, 'up'); }}
                            disabled={index === 0}
                            className="btn-mover"
                            title="Mover para cima"
                          >
                            ↑
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); moverComponente(index, 'down'); }}
                            disabled={index === componentes.length - 1}
                            className="btn-mover"
                            title="Mover para baixo"
                          >
                            ↓
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); removerComponente(componente.id); }}
                            className="btn-remover"
                            title="Remover"
                          >
                            <FiTrash2 />
                          </button>
                        </div>
                      </div>
                      {componenteSelecionado === componente.id && (
                        <div className="componente-editor">
                          {componente.tipo === 'texto' && (
                            <>
                              <input
                                type="text"
                                placeholder="Título (opcional)"
                                value={componente.config.titulo || ''}
                                onChange={(e) => atualizarComponente(componente.id, { titulo: e.target.value })}
                                className="input-editor"
                              />
                              <textarea
                                placeholder="Digite seu texto aqui..."
                                value={componente.config.conteudo || ''}
                                onChange={(e) => atualizarComponente(componente.id, { conteudo: e.target.value })}
                                className="textarea-editor"
                                rows="4"
                              />
                              <select
                                value={componente.config.tamanho || 'normal'}
                                onChange={(e) => atualizarComponente(componente.id, { tamanho: e.target.value })}
                                className="select-editor"
                              >
                                <option value="pequeno">Pequeno</option>
                                <option value="normal">Normal</option>
                                <option value="grande">Grande</option>
                              </select>
                            </>
                          )}
                          {componente.tipo === 'imagem' && (
                            <>
                              <input
                                type="text"
                                placeholder="URL da imagem"
                                value={componente.config.url || ''}
                                onChange={(e) => atualizarComponente(componente.id, { url: e.target.value })}
                                className="input-editor"
                              />
                              <input
                                type="text"
                                placeholder="Texto alternativo"
                                value={componente.config.alt || ''}
                                onChange={(e) => atualizarComponente(componente.id, { alt: e.target.value })}
                                className="input-editor"
                              />
                            </>
                          )}
                          {componente.tipo === 'espaco' && (
                            <input
                              type="text"
                              placeholder="Altura (ex: 30px, 2rem)"
                              value={componente.config.altura || ''}
                              onChange={(e) => atualizarComponente(componente.id, { altura: e.target.value })}
                              className="input-editor"
                            />
                          )}
                          {componente.tipo === 'titulo' && (
                            <input
                              type="text"
                              placeholder="Texto do título"
                              value={componente.config.texto || ''}
                              onChange={(e) => atualizarComponente(componente.id, { texto: e.target.value })}
                              className="input-editor"
                            />
                          )}
                          {componente.tipo === 'subtitulo' && (
                            <input
                              type="text"
                              placeholder="Texto do subtítulo"
                              value={componente.config.texto || ''}
                              onChange={(e) => atualizarComponente(componente.id, { texto: e.target.value })}
                              className="input-editor"
                            />
                          )}
                          {componente.tipo === 'lista' && (
                            <>
                              <input
                                type="text"
                                placeholder="Título da lista (opcional)"
                                value={componente.config.titulo || ''}
                                onChange={(e) => atualizarComponente(componente.id, { titulo: e.target.value })}
                                className="input-editor"
                              />
                              <textarea
                                placeholder="Digite os itens, um por linha"
                                value={(componente.config.itens || []).join('\n')}
                                onChange={(e) => atualizarComponente(componente.id, { itens: e.target.value.split('\n').filter(i => i.trim()) })}
                                className="textarea-editor"
                                rows="5"
                              />
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {mostrarPreview && (
            <div className="editor-preview">
              <h3>Preview do Template</h3>
              <div className="preview-container">
                {componentes.map(componente => (
                  <div key={componente.id} className="preview-item">
                    {renderizarPreviewComponente(componente)}
                  </div>
                ))}
                {componentes.length === 0 && (
                  <div className="preview-vazio">
                    <p>Adicione componentes para ver o preview</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="editor-footer">
        <div className="editor-footer-actions">
          <button onClick={handleSave} className="btn-save" disabled={saving}>
            <FiSave /> {saving ? 'Salvando...' : 'Salvar Template'}
          </button>
          <button onClick={() => setMostrarModalSalvar(true)} className="btn-save-as" disabled={saving}>
            <FiDownload /> Salvar Como
          </button>
          <button onClick={() => setMostrarModalTemplates(true)} className="btn-load-template">
            <FiFolder /> Carregar Template
          </button>
          <button onClick={handleRestoreDefault} className="btn-restore">
            <FiRotateCcw /> Restaurar Padrão
          </button>
        </div>
      </div>

      {mostrarModalSalvar && (
        <div className="templates-list-modal" onClick={() => setMostrarModalSalvar(false)}>
          <div className="templates-list-content" onClick={(e) => e.stopPropagation()}>
            <h3>Salvar Template</h3>
            <div className="form-group-small">
              <label>Nome do Template</label>
              <input
                type="text"
                value={nomeNovoTemplate}
                onChange={(e) => setNomeNovoTemplate(e.target.value)}
                placeholder="Ex: Template Hélices 2026"
                className="input-editor"
                autoFocus
              />
            </div>
            <div style={{ display: 'flex', gap: '10px', marginTop: '15px' }}>
              <button onClick={handleSaveAs} className="btn-save" disabled={saving || !nomeNovoTemplate.trim()}>
                <FiSave /> Salvar
              </button>
              <button onClick={() => setMostrarModalSalvar(false)} className="btn-close">
                <FiX /> Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {mostrarModalTemplates && (
        <div className="templates-list-modal" onClick={() => setMostrarModalTemplates(false)}>
          <div className="templates-list-content" onClick={(e) => e.stopPropagation()}>
            <h3>Templates Salvos</h3>
            {templatesSalvos.length === 0 ? (
              <p style={{ color: 'var(--gmp-text-secondary)', textAlign: 'center', padding: '20px' }}>
                Nenhum template salvo encontrado
              </p>
            ) : (
              templatesSalvos.map(template => (
                <div
                  key={template.id}
                  className="template-item"
                  onClick={() => handleLoadTemplate(template.id)}
                >
                  <div className="template-item-name">
                    {template.nome_template || 'Template Padrão'}
                    {template.is_padrao === 1 && <span style={{ marginLeft: '8px', fontSize: '11px', color: 'var(--gmp-primary)' }}>(Padrão)</span>}
                  </div>
                  <div className="template-item-meta">
                    {template.familia} • {new Date(template.updated_at).toLocaleDateString('pt-BR')}
                  </div>
                </div>
              ))
            )}
            <button onClick={() => setMostrarModalTemplates(false)} className="btn-close" style={{ marginTop: '15px', width: '100%' }}>
              <FiX /> Fechar
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default EditorTemplateProposta;
