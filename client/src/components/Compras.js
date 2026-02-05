import React, { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import api from '../services/api';
import { toast } from 'react-toastify';
import { 
  FiPlus, FiSearch, FiEdit, FiTrash2, FiDownload, 
  FiShoppingCart, FiPackage, FiFileText, FiDollarSign,
  FiFilter, FiCalendar, FiTrendingUp, FiTrendingDown
} from 'react-icons/fi';
import { exportToExcel } from '../utils/exportExcel';
import { SkeletonTable } from './SkeletonLoader';
import './Compras.css';
import './Loading.css';

const Compras = () => {
  const location = useLocation();
  const navigate = useNavigate();
  
  // Detectar seção ativa baseada na rota
  const getActiveSection = () => {
    const path = location.pathname;
    if (path.includes('/fornecedores')) return 'fornecedores';
    if (path.includes('/pedidos')) return 'pedidos';
    if (path.includes('/cotacoes')) return 'cotacoes';
    return 'fornecedores'; // Default
  };

  const activeSection = getActiveSection();
  const [fornecedores, setFornecedores] = useState([]);
  const [pedidos, setPedidos] = useState([]);
  const [cotacoes, setCotacoes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  const tabs = [
    { id: 'fornecedores', label: 'Fornecedores', icon: FiShoppingCart },
    { id: 'pedidos', label: 'Pedidos de Compra', icon: FiPackage },
    { id: 'cotacoes', label: 'Cotações', icon: FiFileText },
  ];

  useEffect(() => {
    // Redirecionar para fornecedores se estiver na raiz
    if (location.pathname === '/compras' || location.pathname === '/compras/') {
      navigate('/compras/fornecedores', { replace: true });
    }
  }, [location.pathname, navigate]);

  useEffect(() => {
    loadData();
  }, [activeSection, search, filterStatus]);

  const loadData = async () => {
    setLoading(true);
    try {
      switch (activeSection) {
        case 'fornecedores':
          const fornecedoresRes = await api.get('/compras/fornecedores', {
            params: { search, status: filterStatus }
          });
          setFornecedores(fornecedoresRes.data || []);
          break;
        case 'pedidos':
          const pedidosRes = await api.get('/compras/pedidos', {
            params: { search, status: filterStatus }
          });
          setPedidos(pedidosRes.data || []);
          break;
        case 'cotacoes':
          const cotacoesRes = await api.get('/compras/cotacoes', {
            params: { search, status: filterStatus }
          });
          setCotacoes(cotacoesRes.data || []);
          break;
      }
    } catch (error) {
      console.error('Erro ao carregar dados:', error);
      toast.error('Erro ao carregar dados');
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value || 0);
  };

  const formatDate = (date) => {
    if (!date) return '-';
    return new Date(date).toLocaleDateString('pt-BR');
  };

  const getStatusColor = (status) => {
    const colors = {
      'ativo': '#2ecc71',
      'inativo': '#e74c3c',
      'pendente': '#f39c12',
      'aprovado': '#2ecc71',
      'rejeitado': '#e74c3c',
      'em_analise': '#3498db',
      'enviado': '#9b59b6',
      'recebido': '#2ecc71',
      'cancelado': '#e74c3c'
    };
    return colors[status] || '#95a5a6';
  };

  const handleDelete = async (id, tipo) => {
    if (window.confirm('Tem certeza que deseja excluir este item?')) {
      try {
        await api.delete(`/compras/${tipo}/${id}`);
        toast.success('Item excluído com sucesso');
        loadData();
      } catch (error) {
        toast.error('Erro ao excluir item');
      }
    }
  };

  const handleExportExcel = () => {
    try {
      let dadosExport = [];
      let nomeArquivo = '';

      switch (activeSection) {
        case 'fornecedores':
          dadosExport = fornecedores.map(f => ({
            'Razão Social': f.razao_social,
            'Nome Fantasia': f.nome_fantasia || '',
            'CNPJ': f.cnpj || '',
            'Contato': f.contato || '',
            'Email': f.email || '',
            'Telefone': f.telefone || '',
            'Status': f.status || '',
            'Cadastrado em': formatDate(f.created_at)
          }));
          nomeArquivo = 'fornecedores';
          break;
        case 'pedidos':
          dadosExport = pedidos.map(p => ({
            'Número': p.numero || '',
            'Fornecedor': p.fornecedor_nome || '',
            'Valor Total': formatCurrency(p.valor_total),
            'Status': p.status || '',
            'Data': formatDate(p.data_pedido),
            'Previsão Entrega': formatDate(p.previsao_entrega)
          }));
          nomeArquivo = 'pedidos_compra';
          break;
        case 'cotacoes':
          dadosExport = cotacoes.map(c => ({
            'Número': c.numero || '',
            'Fornecedor': c.fornecedor_nome || '',
            'Valor': formatCurrency(c.valor_total),
            'Status': c.status || '',
            'Data': formatDate(c.data_cotacao),
            'Validade': formatDate(c.validade)
          }));
          nomeArquivo = 'cotacoes';
          break;
      }

      exportToExcel(dadosExport, nomeArquivo, nomeArquivo);
      toast.success('Exportação realizada com sucesso!');
    } catch (error) {
      toast.error('Erro ao exportar dados');
    }
  };

  const renderFornecedores = () => (
    <div className="table-container">
      {loading ? (
        <SkeletonTable rows={5} />
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Razão Social</th>
              <th>CNPJ</th>
              <th>Contato</th>
              <th>Email</th>
              <th>Telefone</th>
              <th>Status</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {fornecedores.length === 0 ? (
              <tr>
                <td colSpan="7" className="no-data">Nenhum fornecedor encontrado</td>
              </tr>
            ) : (
              fornecedores.map(fornecedor => (
                <tr key={fornecedor.id}>
                  <td>
                    <div className="cell-primary">{fornecedor.razao_social}</div>
                    <div className="cell-secondary">{fornecedor.nome_fantasia || ''}</div>
                  </td>
                  <td>{fornecedor.cnpj || '-'}</td>
                  <td>{fornecedor.contato || '-'}</td>
                  <td>{fornecedor.email || '-'}</td>
                  <td>{fornecedor.telefone || '-'}</td>
                  <td>
                    <span 
                      className="status-badge" 
                      style={{ backgroundColor: getStatusColor(fornecedor.status) + '20', color: getStatusColor(fornecedor.status) }}
                    >
                      {fornecedor.status || 'ativo'}
                    </span>
                  </td>
                  <td>
                    <div className="action-buttons">
                      <Link to={`/compras/fornecedores/editar/${fornecedor.id}`} className="btn-icon" title="Editar">
                        <FiEdit />
                      </Link>
                      <button
                        onClick={() => handleDelete(fornecedor.id, 'fornecedores')}
                        className="btn-icon btn-danger"
                        title="Excluir"
                      >
                        <FiTrash2 />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      )}
    </div>
  );

  const renderPedidos = () => (
    <div className="table-container">
      {loading ? (
        <SkeletonTable rows={5} />
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Número</th>
              <th>Fornecedor</th>
              <th>Valor Total</th>
              <th>Data Pedido</th>
              <th>Previsão Entrega</th>
              <th>Status</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {pedidos.length === 0 ? (
              <tr>
                <td colSpan="7" className="no-data">Nenhum pedido encontrado</td>
              </tr>
            ) : (
              pedidos.map(pedido => (
                <tr key={pedido.id}>
                  <td><strong>{pedido.numero || `#${pedido.id}`}</strong></td>
                  <td>{pedido.fornecedor_nome || '-'}</td>
                  <td><strong>{formatCurrency(pedido.valor_total)}</strong></td>
                  <td>{formatDate(pedido.data_pedido)}</td>
                  <td>{formatDate(pedido.previsao_entrega)}</td>
                  <td>
                    <span 
                      className="status-badge" 
                      style={{ backgroundColor: getStatusColor(pedido.status) + '20', color: getStatusColor(pedido.status) }}
                    >
                      {pedido.status || 'pendente'}
                    </span>
                  </td>
                  <td>
                    <div className="action-buttons">
                      <Link to={`/compras/pedidos/editar/${pedido.id}`} className="btn-icon" title="Editar">
                        <FiEdit />
                      </Link>
                      <button
                        onClick={() => handleDelete(pedido.id, 'pedidos')}
                        className="btn-icon btn-danger"
                        title="Excluir"
                      >
                        <FiTrash2 />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      )}
    </div>
  );

  const renderCotacoes = () => (
    <div className="table-container">
      {loading ? (
        <SkeletonTable rows={5} />
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Número</th>
              <th>Fornecedor</th>
              <th>Valor Total</th>
              <th>Data</th>
              <th>Validade</th>
              <th>Status</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {cotacoes.length === 0 ? (
              <tr>
                <td colSpan="7" className="no-data">Nenhuma cotação encontrada</td>
              </tr>
            ) : (
              cotacoes.map(cotacao => (
                <tr key={cotacao.id}>
                  <td><strong>{cotacao.numero || `#${cotacao.id}`}</strong></td>
                  <td>{cotacao.fornecedor_nome || '-'}</td>
                  <td><strong>{formatCurrency(cotacao.valor_total)}</strong></td>
                  <td>{formatDate(cotacao.data_cotacao)}</td>
                  <td>{formatDate(cotacao.validade)}</td>
                  <td>
                    <span 
                      className="status-badge" 
                      style={{ backgroundColor: getStatusColor(cotacao.status) + '20', color: getStatusColor(cotacao.status) }}
                    >
                      {cotacao.status || 'em_analise'}
                    </span>
                  </td>
                  <td>
                    <div className="action-buttons">
                      <Link to={`/compras/cotacoes/editar/${cotacao.id}`} className="btn-icon" title="Editar">
                        <FiEdit />
                      </Link>
                      <button
                        onClick={() => handleDelete(cotacao.id, 'cotacoes')}
                        className="btn-icon btn-danger"
                        title="Excluir"
                      >
                        <FiTrash2 />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      )}
    </div>
  );

  const getNewItemPath = () => {
    switch (activeSection) {
      case 'fornecedores':
        return '/compras/fornecedores/novo';
      case 'pedidos':
        return '/compras/pedidos/novo';
      case 'cotacoes':
        return '/compras/cotacoes/nova';
      default:
        return '#';
    }
  };

  return (
    <div className="compras">
      <div className="page-header">
        <div>
          <h1>Compras</h1>
          <p>Gestão de fornecedores, pedidos e cotações</p>
        </div>
        <div className="header-actions">
          <button onClick={handleExportExcel} className="btn-secondary" title="Exportar para Excel">
            <FiDownload /> Exportar Excel
          </button>
          <Link to={getNewItemPath()} className="btn-premium">
            <div className="btn-premium-icon">
              <FiPlus size={20} />
            </div>
            <span className="btn-premium-text">Novo {activeSection === 'fornecedores' ? 'Fornecedor' : activeSection === 'pedidos' ? 'Pedido' : 'Cotação'}</span>
            <div className="btn-premium-shine"></div>
          </Link>
        </div>
      </div>

      <div className="filters">
        <div className="search-box">
          <FiSearch />
          <input
            type="text"
            placeholder="Buscar..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="filter-group">
          <FiFilter />
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="filter-select"
          >
            <option value="">Todos os status</option>
            <option value="ativo">Ativo</option>
            <option value="inativo">Inativo</option>
            <option value="pendente">Pendente</option>
            <option value="aprovado">Aprovado</option>
            <option value="rejeitado">Rejeitado</option>
            <option value="em_analise">Em Análise</option>
          </select>
        </div>
      </div>

      <div className="module-content">
        {activeSection === 'fornecedores' && renderFornecedores()}
        {activeSection === 'pedidos' && renderPedidos()}
        {activeSection === 'cotacoes' && renderCotacoes()}
      </div>
    </div>
  );
};

export default Compras;

