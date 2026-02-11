import React, { useState, useEffect, useMemo } from 'react';
import api from '../services/api';
import { FiX, FiSearch, FiFilter, FiCheck, FiImage, FiPackage, FiDollarSign } from 'react-icons/fi';
import './SelecaoProdutosPremium.css';

const SelecaoProdutosPremium = ({ onClose, onSelect, produtosSelecionados = [] }) => {
  const [produtos, setProdutos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterFamilia, setFilterFamilia] = useState('');
  const [filterPrecoMin, setFilterPrecoMin] = useState('');
  const [filterPrecoMax, setFilterPrecoMax] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [selecionados, setSelecionados] = useState(new Set(produtosSelecionados.map(p => p.id)));
  const [showFilters, setShowFilters] = useState(false);
  const itemsPerPage = 20;

  useEffect(() => {
    loadProdutos();
  }, []);

  const loadProdutos = async () => {
    try {
      setLoading(true);
      const response = await api.get('/produtos', { params: { ativo: 'true' } });
      setProdutos(response.data);
    } catch (error) {
      console.error('Erro ao carregar produtos:', error);
      alert('Erro ao carregar produtos');
    } finally {
      setLoading(false);
    }
  };

  // Obter lista única de famílias
  const familias = useMemo(() => {
    const familiasSet = new Set();
    produtos.forEach(p => {
      if (p.familia) familiasSet.add(p.familia);
      if (p.familia_produto) familiasSet.add(p.familia_produto);
    });
    return Array.from(familiasSet).sort();
  }, [produtos]);

  // Filtrar produtos
  const produtosFiltrados = useMemo(() => {
    return produtos.filter(produto => {
      // Busca por termo
      if (searchTerm) {
        const termo = searchTerm.toLowerCase();
        const matchCodigo = produto.codigo?.toLowerCase().includes(termo);
        const matchNome = produto.nome?.toLowerCase().includes(termo);
        const matchDescricao = produto.descricao?.toLowerCase().includes(termo);
        if (!matchCodigo && !matchNome && !matchDescricao) return false;
      }

      // Filtro por família
      if (filterFamilia) {
        const familia = produto.familia || produto.familia_produto;
        if (familia !== filterFamilia) return false;
      }

      // Filtro por preço
      const preco = produto.preco_base || 0;
      if (filterPrecoMin && preco < parseFloat(filterPrecoMin)) return false;
      if (filterPrecoMax && preco > parseFloat(filterPrecoMax)) return false;

      return true;
    });
  }, [produtos, searchTerm, filterFamilia, filterPrecoMin, filterPrecoMax]);

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

  const limparFiltros = () => {
    setSearchTerm('');
    setFilterFamilia('');
    setFilterPrecoMin('');
    setFilterPrecoMax('');
    setCurrentPage(1);
  };

  return (
    <div className="selecao-produtos-overlay" onClick={onClose}>
      <div className="selecao-produtos-container" onClick={(e) => e.stopPropagation()}>
        <div className="selecao-produtos-header">
          <div className="header-content">
            <h2>
              <FiPackage style={{ marginRight: '10px' }} />
              Selecionar Produtos
            </h2>
            <div className="header-stats">
              <span className="stat-item">
                {produtosFiltrados.length} {produtosFiltrados.length === 1 ? 'produto encontrado' : 'produtos encontrados'}
              </span>
              {selecionados.size > 0 && (
                <span className="stat-item selected">
                  {selecionados.size} {selecionados.size === 1 ? 'selecionado' : 'selecionados'}
                </span>
              )}
            </div>
          </div>
          <button onClick={onClose} className="btn-close-premium">
            <FiX />
          </button>
        </div>

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
              <label>Família</label>
              <select
                value={filterFamilia}
                onChange={(e) => {
                  setFilterFamilia(e.target.value);
                  setCurrentPage(1);
                }}
              >
                <option value="">Todas as famílias</option>
                {familias.map(familia => (
                  <option key={familia} value={familia}>{familia}</option>
                ))}
              </select>
            </div>
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

        <div className="selecao-produtos-content">
          {loading ? (
            <div className="loading-state">
              <div className="spinner"></div>
              <p>Carregando produtos...</p>
            </div>
          ) : produtosPaginados.length === 0 ? (
            <div className="empty-state">
              <FiPackage size={48} />
              <p>Nenhum produto encontrado</p>
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
                          {produto.descricao.length > 60 
                            ? produto.descricao.substring(0, 60) + '...' 
                            : produto.descricao}
                        </div>
                      )}
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
          )}
        </div>

        {totalPages > 1 && (
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
          <button onClick={onClose} className="btn-cancel">
            Cancelar
          </button>
          <button
            onClick={handleConfirmar}
            className="btn-confirm"
            disabled={selecionados.size === 0}
          >
            <FiCheck /> Adicionar {selecionados.size > 0 && `(${selecionados.size})`}
          </button>
        </div>
      </div>
    </div>
  );
};

export default SelecaoProdutosPremium;
