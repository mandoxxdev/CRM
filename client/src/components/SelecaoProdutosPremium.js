import React, { useState, useEffect, useMemo } from 'react';
import api from '../services/api';
import { FiX, FiSearch, FiFilter, FiCheck, FiImage, FiPackage, FiDollarSign, FiArrowLeft, FiCheckCircle, FiAlertCircle } from 'react-icons/fi';
import './SelecaoProdutosPremium.css';

const baseUploads = () => (api.defaults.baseURL || '/api').replace(/\/api\/?$/, '') + '/api/uploads/familias-produtos/';

function parseMarcadores(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map((m, i) => ({ ...m, numero: m.numero != null ? m.numero : i + 1 }));
  if (raw.marcadores && Array.isArray(raw.marcadores)) return raw.marcadores.map((m, i) => ({ ...m, numero: m.numero != null ? m.numero : i + 1 }));
  return [];
}

const SelecaoProdutosPremium = ({ onClose, onSelect, produtosSelecionados = [] }) => {
  const [step, setStep] = useState('familia'); // 'familia' | 'itens' | 'marcadores'
  const [familias, setFamilias] = useState([]);
  const [familiaSelecionada, setFamiliaSelecionada] = useState(null);
  const [produtos, setProdutos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingProdutos, setLoadingProdutos] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterPrecoMin, setFilterPrecoMin] = useState('');
  const [filterPrecoMax, setFilterPrecoMax] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [selecionados, setSelecionados] = useState(new Set(produtosSelecionados.map(p => p.id)));
  const [showFilters, setShowFilters] = useState(false);
  const itemsPerPage = 20;

  // Modo "Configurar por marcadores técnicos"
  const [marcadoresStepSelecoes, setMarcadoresStepSelecoes] = useState({});
  const [marcadoresList, setMarcadoresList] = useState([]);
  const [opcoesPorVariavel, setOpcoesPorVariavel] = useState({});
  const [variaveisNomesMap, setVariaveisNomesMap] = useState({}); // chave -> nome (para exibir nome da variável em vez de "Nova variável")
  const [loadingMarcadores, setLoadingMarcadores] = useState(false);
  const [resultadoVerificacao, setResultadoVerificacao] = useState(null);
  const [loadingVerificacao, setLoadingVerificacao] = useState(false);
  const [marcadorAbertoIndex, setMarcadorAbertoIndex] = useState(null);

  useEffect(() => {
    loadFamilias();
  }, []);

  const fecharPopoverMarcador = () => setMarcadorAbertoIndex(null);
  useEffect(() => {
    if (marcadorAbertoIndex === null) return;
    const handleClickFora = (e) => {
      if (e.target.closest('.marcador-popover') || e.target.closest('.marcadores-step-vista-bolinha')) return;
      fecharPopoverMarcador();
    };
    document.addEventListener('click', handleClickFora, true);
    return () => document.removeEventListener('click', handleClickFora, true);
  }, [marcadorAbertoIndex]);

  const loadFamilias = async () => {
    try {
      setLoading(true);
      const response = await api.get('/familias');
      setFamilias(Array.isArray(response.data) ? response.data : []);
    } catch (error) {
      console.error('Erro ao carregar famílias:', error);
      setFamilias([]);
    } finally {
      setLoading(false);
    }
  };

  const loadProdutos = async (familiaNome) => {
    if (!familiaNome) return;
    try {
      setLoadingProdutos(true);
      const response = await api.get('/produtos', { params: { ativo: 'true', familia: familiaNome } });
      setProdutos(response.data || []);
    } catch (error) {
      console.error('Erro ao carregar produtos:', error);
      setProdutos([]);
    } finally {
      setLoadingProdutos(false);
    }
  };

  const escolherFamilia = (familia) => {
    setFamiliaSelecionada(familia);
    setStep('itens');
    setCurrentPage(1);
    setSelecionados(new Set());
    loadProdutos(familia.nome);
  };

  const voltarParaFamilia = () => {
    setFamiliaSelecionada(null);
    setStep('familia');
    setProdutos([]);
    setSearchTerm('');
    setFilterPrecoMin('');
    setFilterPrecoMax('');
    setResultadoVerificacao(null);
    setMarcadoresStepSelecoes({});
  };

  const irParaMarcadores = async () => {
    if (!familiaSelecionada || !familiaSelecionada.id) return;
    setLoadingMarcadores(true);
    setResultadoVerificacao(null);
    setMarcadoresStepSelecoes({});
    try {
      const [famRes, opcoesRes, vtRes] = await Promise.all([
        api.get(`/familias/${familiaSelecionada.id}`),
        api.get(`/familias/${familiaSelecionada.id}/opcoes-variaveis`),
        api.get('/variaveis-tecnicas', { params: { ativo: 'true' } }).catch(() => ({ data: [] }))
      ]);
      const vtList = Array.isArray(vtRes.data) ? vtRes.data : [];
      const nomesMap = {};
      vtList.forEach((v) => {
        const chave = v.chave || v.key;
        if (chave) nomesMap[chave] = v.nome || v.label || chave;
      });
      setVariaveisNomesMap(nomesMap);
      let raw = famRes.data.marcadores_vista;
      if (typeof raw === 'string') try { raw = JSON.parse(raw); } catch (_) { raw = []; }
      const marcs = parseMarcadores(raw);
      setMarcadoresList(marcs);
      const opcoesByVar = opcoesRes.data || {};
      const opcoes = {};
      marcs.forEach((m) => {
        if (m.tipo === 'selecao') return;
        const chave = m.variavel || m.key;
        if (!chave) return;
        opcoes[chave] = Array.isArray(opcoesByVar[chave]) ? opcoesByVar[chave] : [];
      });
      setOpcoesPorVariavel(opcoes);
      setStep('marcadores');
    } catch (e) {
      console.error(e);
      setMarcadoresList([]);
      setOpcoesPorVariavel({});
      setVariaveisNomesMap({});
    } finally {
      setLoadingMarcadores(false);
    }
  };

  const voltarParaItens = () => {
    setStep('itens');
    setResultadoVerificacao(null);
  };

  const setMarcadorValor = (variavelChave, valor) => {
    setMarcadoresStepSelecoes(prev => ({ ...prev, [variavelChave]: valor }));
    setResultadoVerificacao(null);
  };

  const toggleMarcadorSelecao = (variavelChave) => {
    setMarcadoresStepSelecoes(prev => ({ ...prev, [variavelChave]: !prev[variavelChave] }));
    setResultadoVerificacao(null);
  };

  const buildEspecificacoesParaEnvio = () => {
    const spec = {};
    marcadoresList.forEach((m) => {
      const chave = m.variavel || m.key;
      const val = marcadoresStepSelecoes[chave];
      if (m.tipo === 'selecao') {
        if (val === true) spec[chave] = 'Sim';
      } else {
        if (val != null && val !== '') spec[chave] = val;
      }
    });
    return spec;
  };

  const verificarExistente = async () => {
    if (!familiaSelecionada || !familiaSelecionada.nome) return;
    setLoadingVerificacao(true);
    setResultadoVerificacao(null);
    try {
      const especificacoes = buildEspecificacoesParaEnvio();
      const res = await api.post('/produtos/verificar-existente', {
        familia: familiaSelecionada.nome,
        especificacoes
      });
      setResultadoVerificacao(res.data);
    } catch (e) {
      console.error(e);
      setResultadoVerificacao({ existente: false, produtos: [], error: e.response?.data?.error || e.message });
    } finally {
      setLoadingVerificacao(false);
    }
  };

  const adicionarConfiguracaoMarcadores = () => {
    const especificacoes = buildEspecificacoesParaEnvio();
    if (resultadoVerificacao && resultadoVerificacao.existente && resultadoVerificacao.produtos && resultadoVerificacao.produtos.length > 0) {
      onSelect(resultadoVerificacao.produtos.map(p => ({ ...p, familia: familiaSelecionada.nome })));
    } else if (resultadoVerificacao && !resultadoVerificacao.existente) {
      const specStr = Object.entries(especificacoes).filter(([, v]) => v != null && v !== '').map(([k, v]) => `${k}: ${v}`).join('; ');
      onSelect([{
        _configuradoPorMarcadores: true,
        existente: false,
        familia: familiaSelecionada.nome,
        especificacoes,
        nome: `Equipamento sob consulta – ${familiaSelecionada.nome}${specStr ? ` (${specStr})` : ''}`,
        codigo: 'SOB-CONSULTA',
        preco_base: 0
      }]);
    }
    onClose();
  };

  // Filtrar produtos (apenas busca e preço; família já veio da seleção)
  const produtosFiltrados = useMemo(() => {
    return produtos.filter(produto => {
      if (searchTerm) {
        const termo = searchTerm.toLowerCase();
        const matchCodigo = produto.codigo?.toLowerCase().includes(termo);
        const matchNome = produto.nome?.toLowerCase().includes(termo);
        const matchDescricao = produto.descricao?.toLowerCase().includes(termo);
        if (!matchCodigo && !matchNome && !matchDescricao) return false;
      }
      const preco = produto.preco_base || 0;
      if (filterPrecoMin && preco < parseFloat(filterPrecoMin)) return false;
      if (filterPrecoMax && preco > parseFloat(filterPrecoMax)) return false;
      return true;
    });
  }, [produtos, searchTerm, filterPrecoMin, filterPrecoMax]);

  // Paginação
  const totalPages = Math.ceil(produtosFiltrados.length / itemsPerPage);
  const produtosPaginados = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    const end = start + itemsPerPage;
    return produtosFiltrados.slice(start, end);
  }, [produtosFiltrados, currentPage]);

  const toggleSelecao = (produto) => {
    const novosSelecionados = new Set(selecionados);
    if (novosSelecionados.has(produto.id)) {
      novosSelecionados.delete(produto.id);
    } else {
      novosSelecionados.add(produto.id);
    }
    setSelecionados(novosSelecionados);
  };

  const handleConfirmar = () => {
    const produtosSelecionadosList = produtos.filter(p => selecionados.has(p.id));
    onSelect(produtosSelecionadosList);
    onClose();
  };

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value || 0);
  };

  const getClassificacaoArea = (produto) => {
    if (produto.classificacao_area) return produto.classificacao_area;
    try {
      const spec = produto.especificacoes_tecnicas ? (typeof produto.especificacoes_tecnicas === 'string' ? JSON.parse(produto.especificacoes_tecnicas) : produto.especificacoes_tecnicas) : {};
      return spec.classificacao_area || '';
    } catch (e) { return ''; }
  };

  // Descritivo técnico (discos: material, espessura...; equipamentos: CCM, potência, etc.)
  const getDescritivoTecnico = (produto) => {
    let spec = {};
    try {
      const raw = produto.especificacoes_tecnicas;
      if (raw) spec = typeof raw === 'string' ? JSON.parse(raw) : raw;
    } catch (_) {}
    const parts = [];
    if (spec.material_contato) parts.push(`Material: ${spec.material_contato}`);
    if (spec.espessura) parts.push(`Espessura: ${spec.espessura}`);
    if (spec.acabamento) parts.push(`Acabamento: ${spec.acabamento}`);
    if (spec.diametro) parts.push(`Diâmetro: ${spec.diametro}`);
    if (spec.funcao) parts.push(`Função: ${spec.funcao}`);
    if (spec.tratamento_termico) parts.push(`Trat. Térmico: ${spec.tratamento_termico}`);
    if (spec.velocidade_trabalho) parts.push(`Velocidade: ${spec.velocidade_trabalho}`);
    if (spec.ccm_incluso) parts.push(`CCM: ${spec.ccm_incluso}`);
    if (spec.ccm_tensao) parts.push(`Tensão CCM: ${spec.ccm_tensao}`);
    if (spec.celula_carga) parts.push(`Célula de Carga: ${spec.celula_carga}`);
    if (spec.plc_ihm) parts.push(`PLC/IHM: ${spec.plc_ihm}`);
    if (spec.valvula_saida_tanque) parts.push(`Válvula Saída: ${spec.valvula_saida_tanque}`);
    const totalCV = [spec.motor_central_cv, spec.motoredutor_central_cv, spec.motores_laterais_cv]
      .reduce((s, v) => s + (parseFloat(v) || 0), 0);
    if (totalCV > 0) parts.push(`Potência: ${totalCV.toFixed(1).replace('.', ',')} CV`);
    const classArea = spec.classificacao_area || produto.classificacao_area;
    if (classArea) parts.push(`Class. Área: ${classArea}`);
    return parts.length ? parts.join(' • ') : null;
  };

  const limparFiltros = () => {
    setSearchTerm('');
    setFilterPrecoMin('');
    setFilterPrecoMax('');
    setCurrentPage(1);
  };

  const familiasAtivas = useMemo(() => familias.filter(f => f.ativo !== 0), [familias]);
  const urlEsquematico = (f) => {
    if (!f || !f.esquematico) return null;
    const base = baseUploads();
    if (f.esquematico_dataurl) return f.esquematico_dataurl;
    return base + encodeURIComponent(f.esquematico);
  };

  return (
    <div className="selecao-produtos-overlay" onClick={onClose}>
      <div className="selecao-produtos-container" onClick={(e) => e.stopPropagation()}>
        <div className="selecao-produtos-header">
          <div className="header-content">
            <h2>
              <FiPackage style={{ marginRight: '10px' }} />
              {step === 'familia' ? 'Escolher família' : step === 'marcadores' ? 'Configurar por marcadores técnicos' : 'Selecionar itens'}
              {(step === 'itens' || step === 'marcadores') && familiaSelecionada && (
                <span className="header-familia-nome"> — {familiaSelecionada.nome}</span>
              )}
            </h2>
            <div className="header-stats">
              {step === 'familia' ? (
                <span className="stat-item">
                  {familiasAtivas.length} {familiasAtivas.length === 1 ? 'família' : 'famílias'}
                </span>
              ) : (
                <>
                  <span className="stat-item">
                    {produtosFiltrados.length} {produtosFiltrados.length === 1 ? 'produto' : 'produtos'}
                  </span>
                  {selecionados.size > 0 && (
                    <span className="stat-item selected">
                      {selecionados.size} {selecionados.size === 1 ? 'selecionado' : 'selecionados'}
                    </span>
                  )}
                </>
              )}
            </div>
          </div>
          <button onClick={onClose} className="btn-close-premium">
            <FiX />
          </button>
        </div>

        {(step === 'itens' || step === 'marcadores') && (
          <>
            <div className="selecao-vista-frontal-bar">
              {step === 'itens' && (
                <button type="button" onClick={() => irParaMarcadores()} className="btn-config-marcadores" disabled={loadingMarcadores}>
                  {loadingMarcadores ? 'Carregando...' : 'Configurar por marcadores técnicos'}
                </button>
              )}
              {step === 'marcadores' && (
                <button type="button" onClick={voltarParaItens} className="btn-trocar-familia">
                  <FiArrowLeft /> Voltar para lista
                </button>
              )}
              <button type="button" onClick={voltarParaFamilia} className="btn-trocar-familia">
                <FiArrowLeft /> Trocar família
              </button>
            </div>
            {step === 'itens' && (
              <>
                <div className="selecao-produtos-toolbar">
                  <div className="search-container">
                    <FiSearch className="search-icon" />
                    <input
                      type="text"
                      placeholder="Buscar por código, nome ou descrição..."
                      value={searchTerm}
                      onChange={(e) => {
                        setSearchTerm(e.target.value);
                        setCurrentPage(1);
                      }}
                      className="search-input"
                    />
                    {searchTerm && (
                      <button onClick={() => setSearchTerm('')} className="clear-search">
                        <FiX />
                      </button>
                    )}
                  </div>
                  <button
                    onClick={() => setShowFilters(!showFilters)}
                    className={`btn-filter ${showFilters ? 'active' : ''}`}
                  >
                    <FiFilter /> Filtros
                  </button>
                </div>
                {showFilters && (
                  <div className="filters-panel">
                    <div className="filter-group">
                      <label>Preço Mínimo</label>
                      <input
                        type="number"
                        placeholder="R$ 0,00"
                        value={filterPrecoMin}
                        onChange={(e) => {
                          setFilterPrecoMin(e.target.value);
                          setCurrentPage(1);
                        }}
                        min="0"
                        step="0.01"
                      />
                    </div>
                    <div className="filter-group">
                      <label>Preço Máximo</label>
                      <input
                        type="number"
                        placeholder="R$ 999.999,99"
                        value={filterPrecoMax}
                        onChange={(e) => {
                          setFilterPrecoMax(e.target.value);
                          setCurrentPage(1);
                        }}
                        min="0"
                        step="0.01"
                      />
                    </div>
                    <button onClick={limparFiltros} className="btn-clear-filters">
                      Limpar Filtros
                    </button>
                  </div>
                )}
              </>
            )}
          </>
        )}

        <div className="selecao-produtos-content">
          {step === 'marcadores' ? (
            <div className="marcadores-step-content">
              {marcadoresList.length === 0 ? (
                <div className="empty-state">
                  <FiPackage size={48} />
                  <p>Esta família não tem marcadores técnicos configurados.</p>
                  <p className="empty-hint">Configure os marcadores na família (Configurações ou edição da família) e as opções em &quot;Opções por família&quot;.</p>
                </div>
              ) : (
                <>
                  <div className="marcadores-step-row">
                    {familiaSelecionada && urlEsquematico(familiaSelecionada) && (
                      <div className="marcadores-step-vista-wrap">
                        <div className="marcadores-step-vista-inner">
                          <div className="vista-image-wrap">
                          <img src={urlEsquematico(familiaSelecionada)} alt={`Vista ${familiaSelecionada.nome}`} />
                          {marcadoresList.map((m, index) => {
                            const chave = m.variavel || m.key;
                            const nomeVariavel = variaveisNomesMap[chave] || m.label || chave;
                            const isSelecao = m.tipo === 'selecao';
                            const opcoes = opcoesPorVariavel[chave] || [];
                            const valor = marcadoresStepSelecoes[chave];
                            const selecionado = isSelecao && valor === true;
                            const aberto = marcadorAbertoIndex === index;
                            return (
                              <div
                                key={m.id || chave || index}
                                className="marcador-wrapper-na-vista"
                                style={{ left: (m.x != null ? m.x : 0) + '%', top: (m.y != null ? m.y : 0) + '%' }}
                              >
                                <button
                                  type="button"
                                  className={`marcadores-step-vista-bolinha ${aberto ? 'marcador-aberto' : ''} ${selecionado && isSelecao ? 'marcador-preenchido' : ''}`}
                                  title={nomeVariavel}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setMarcadorAbertoIndex(aberto ? null : index);
                                  }}
                                >
                                  {m.numero != null ? m.numero : ''}
                                </button>
                                {aberto && (
                                  <div className="marcador-popover" onClick={(e) => e.stopPropagation()}>
                                    <div className="marcador-popover-label">
                                      {m.numero != null ? `${m.numero}. ` : ''}{nomeVariavel || 'Variável'}
                                      {isSelecao && <span className="marcador-config-selecao-badge">Seleção</span>}
                                    </div>
                                    {isSelecao ? (
                                      <button
                                        type="button"
                                        className={`marcador-toggle-incluir ${selecionado ? 'marcador-toggle-incluir-ativo' : ''}`}
                                        onClick={() => { toggleMarcadorSelecao(chave); fecharPopoverMarcador(); }}
                                      >
                                        {selecionado ? <FiCheck size={18} /> : null}
                                        <span>{selecionado ? 'Incluído na proposta' : 'Não incluído'}</span>
                                      </button>
                                    ) : (
                                      <select
                                        value={valor || ''}
                                        onChange={(e) => { setMarcadorValor(chave, e.target.value); fecharPopoverMarcador(); }}
                                        className="marcador-config-select"
                                        autoFocus
                                      >
                                        <option value="">Selecione...</option>
                                        {opcoes.map((o) => (
                                          <option key={o.id} value={o.valor}>{o.valor}</option>
                                        ))}
                                      </select>
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                          </div>
                        </div>
                      </div>
                    )}
                    <div className="marcadores-step-panel">
                      <div className="marcadores-step-panel-header">
                        <span className="marcadores-step-panel-title">Variáveis ({marcadoresList.length})</span>
                        <p className="marcadores-step-hint">Clique nos números na imagem para configurar cada variável.</p>
                      </div>
                      <div className="marcadores-step-panel-body">
                        <div className="marcadores-step-resumo">
                          {marcadoresList.map((m) => {
                            const chave = m.variavel || m.key;
                            const nomeVariavel = variaveisNomesMap[chave] || m.label || chave;
                            const isSelecao = m.tipo === 'selecao';
                            const valor = marcadoresStepSelecoes[chave];
                            const preenchido = isSelecao ? valor === true : (valor != null && valor !== '');
                            const texto = isSelecao ? (valor === true ? 'Incluído' : '—') : (valor || '—');
                            return (
                              <div key={m.id || chave} className={`marcador-resumo-item ${preenchido ? 'preenchido' : ''}`}>
                                <span className="marcador-resumo-numero">{m.numero != null ? m.numero : '—'}</span>
                                <span className="marcador-resumo-nome">{nomeVariavel}</span>
                                <span className="marcador-resumo-texto">{texto}</span>
                              </div>
                            );
                          })}
                        </div>
                        <div className="marcadores-step-actions">
                          <button type="button" className="btn-verificar-existente" onClick={verificarExistente} disabled={loadingVerificacao}>
                            {loadingVerificacao ? 'Verificando...' : 'Verificar existência'}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                  {resultadoVerificacao !== null && (
                    <div className={`marcadores-resultado ${resultadoVerificacao.existente ? 'existente' : 'nao-existente'}`}>
                      {resultadoVerificacao.existente ? (
                        <>
                          <FiCheckCircle size={24} />
                          <h4>Equipamento padrão (Existente)</h4>
                          <p>Foi encontrado produto(s) com esta configuração.</p>
                          <ul className="marcadores-resultado-lista">
                            {resultadoVerificacao.produtos.map((p) => (
                              <li key={p.id}>{p.codigo} – {p.nome} – {formatCurrency(p.preco_base)}</li>
                            ))}
                          </ul>
                        </>
                      ) : (
                        <>
                          <FiAlertCircle size={24} />
                          <h4>Equipamento sob consulta (Não existente)</h4>
                          <p>Não há produto cadastrado com esta combinação. Será adicionado como item sob consulta.</p>
                        </>
                      )}
                      <button type="button" className="btn-adicionar-config-marcadores" onClick={adicionarConfiguracaoMarcadores}>
                        <FiCheck /> Adicionar à proposta
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          ) : step === 'familia' ? (
            loading ? (
              <div className="loading-state">
                <div className="spinner"></div>
                <p>Carregando famílias...</p>
              </div>
            ) : familiasAtivas.length === 0 ? (
              <div className="empty-state">
                <FiPackage size={48} />
                <p>Nenhuma família cadastrada</p>
              </div>
            ) : (
              <div className="familias-grid-selecao">
                {familiasAtivas.map(familia => {
                  const esquematicoUrl = urlEsquematico(familia);
                  return (
                    <div
                      key={familia.id}
                      className="familia-card-selecao"
                      onClick={() => escolherFamilia(familia)}
                    >
                      <div className="familia-card-preview">
                        {esquematicoUrl ? (
                          <img src={esquematicoUrl} alt={familia.nome} />
                        ) : (
                          <div className="familia-card-placeholder">
                            <FiImage size={40} />
                          </div>
                        )}
                      </div>
                      <div className="familia-card-nome">{familia.nome}</div>
                      <button type="button" className="familia-card-btn" onClick={(e) => { e.stopPropagation(); escolherFamilia(familia); }}>
                        Abrir itens desta família
                      </button>
                    </div>
                  );
                })}
              </div>
            )
          ) : (
            loadingProdutos ? (
              <div className="loading-state">
                <div className="spinner"></div>
                <p>Carregando produtos...</p>
              </div>
            ) : produtosPaginados.length === 0 ? (
              <div className="empty-state">
                <FiPackage size={48} />
                <p>Nenhum produto encontrado nesta família</p>
                <p className="empty-hint">Tente ajustar os filtros ou termo de busca</p>
              </div>
            ) : (
              <div className="produtos-grid-premium">
                {produtosPaginados.map(produto => {
                const isSelecionado = selecionados.has(produto.id);
                return (
                  <div
                    key={produto.id}
                    className={`produto-card-premium ${isSelecionado ? 'selecionado' : ''}`}
                    onClick={() => toggleSelecao(produto)}
                  >
                    <div className="produto-check-premium">
                      {isSelecionado && <FiCheck />}
                    </div>
                    {produto.imagem ? (
                      <div className="produto-image">
                        <img
                          src={`${api.defaults.baseURL}/uploads/produtos/${produto.imagem}`}
                          alt={produto.nome}
                          onError={(e) => {
                            e.target.style.display = 'none';
                            e.target.nextSibling.style.display = 'flex';
                          }}
                        />
                        <div className="produto-image-placeholder" style={{ display: 'none' }}>
                          <FiImage size={32} />
                        </div>
                      </div>
                    ) : (
                      <div className="produto-image-placeholder">
                        <FiImage size={32} />
                      </div>
                    )}
                    <div className="produto-info-premium">
                      <div className="produto-codigo">{produto.codigo}</div>
                      <div className="produto-nome">{produto.nome}</div>
                      {produto.descricao && (
                        <div className="produto-descricao" title={produto.descricao}>
                          {produto.descricao}
                        </div>
                      )}
                      {(() => {
                        const descritivoTecnico = getDescritivoTecnico(produto);
                        return descritivoTecnico ? (
                          <div className="produto-descritivo-tecnico" title={descritivoTecnico}>
                            {descritivoTecnico}
                          </div>
                        ) : null;
                      })()}
                      {getClassificacaoArea(produto) && (
                        <div className="produto-classificacao-area-badge" data-base={getClassificacaoArea(produto).toUpperCase().includes('ÁGUA') ? 'agua' : 'solvente'}>
                          {getClassificacaoArea(produto)}
                        </div>
                      )}
                      <div className="produto-meta">
                        {produto.familia && (
                          <span className="produto-familia">{produto.familia}</span>
                        )}
                        <span className="produto-preco-premium">
                          <FiDollarSign size={14} />
                          {formatCurrency(produto.preco_base)}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            )
          )}
        </div>

        {step === 'itens' && totalPages > 1 && (
          <div className="pagination">
            <button
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
              className="pagination-btn"
            >
              Anterior
            </button>
            <span className="pagination-info">
              Página {currentPage} de {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              disabled={currentPage === totalPages}
              className="pagination-btn"
            >
              Próxima
            </button>
          </div>
        )}

        <div className="selecao-produtos-footer">
          <button
            onClick={step === 'marcadores' ? voltarParaItens : step === 'itens' ? voltarParaFamilia : onClose}
            className="btn-cancel"
          >
            {step === 'marcadores' ? <><FiArrowLeft /> Voltar para lista</> : step === 'itens' ? <><FiArrowLeft /> Voltar</> : 'Cancelar'}
          </button>
          {step === 'itens' && (
            <button
              onClick={handleConfirmar}
              className="btn-confirm"
              disabled={selecionados.size === 0}
            >
              <FiCheck /> Adicionar {selecionados.size > 0 && `(${selecionados.size})`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default SelecaoProdutosPremium;
