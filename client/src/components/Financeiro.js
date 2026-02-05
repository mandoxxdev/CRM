import React, { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate, Routes, Route, Navigate } from 'react-router-dom';
import api from '../services/api';
import { toast } from 'react-toastify';
import { 
  FiPlus, FiSearch, FiEdit, FiTrash2, FiDownload, 
  FiDollarSign, FiTrendingUp, FiTrendingDown, FiCreditCard,
  FiFilter, FiCalendar, FiBarChart2, FiArrowDown, FiArrowUp
} from 'react-icons/fi';
import { exportToExcel } from '../utils/exportExcel';
import { SkeletonTable } from './SkeletonLoader';
import './Financeiro.css';
import './Loading.css';

const Financeiro = () => {
  const location = useLocation();
  const navigate = useNavigate();
  
  // Detectar seção ativa baseada na rota
  const getActiveSection = () => {
    const path = location.pathname;
    if (path.includes('/contas-pagar')) return 'contas_pagar';
    if (path.includes('/contas-receber')) return 'contas_receber';
    if (path.includes('/fluxo-caixa')) return 'fluxo_caixa';
    if (path.includes('/bancos')) return 'bancos';
    return 'contas_pagar'; // Default
  };

  const activeSection = getActiveSection();
  const [contasPagar, setContasPagar] = useState([]);
  const [contasReceber, setContasReceber] = useState([]);
  const [fluxoCaixa, setFluxoCaixa] = useState([]);
  const [bancos, setBancos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterPeriodo, setFilterPeriodo] = useState('mes');

  const tabs = [
    { id: 'contas_pagar', label: 'Contas a Pagar', icon: FiTrendingDown },
    { id: 'contas_receber', label: 'Contas a Receber', icon: FiTrendingUp },
    { id: 'fluxo_caixa', label: 'Fluxo de Caixa', icon: FiBarChart2 },
    { id: 'bancos', label: 'Bancos', icon: FiCreditCard },
  ];

  useEffect(() => {
    // Redirecionar para contas-pagar se estiver na raiz
    if (location.pathname === '/financeiro' || location.pathname === '/financeiro/') {
      navigate('/financeiro/contas-pagar', { replace: true });
    }
  }, [location.pathname, navigate]);

  useEffect(() => {
    loadData();
  }, [activeSection, search, filterStatus, filterPeriodo]);

  const loadData = async () => {
    setLoading(true);
    try {
      switch (activeSection) {
        case 'contas_pagar':
          const contasPagarRes = await api.get('/financeiro/contas-pagar', {
            params: { search, status: filterStatus, periodo: filterPeriodo }
          });
          setContasPagar(contasPagarRes.data || []);
          break;
        case 'contas_receber':
          const contasReceberRes = await api.get('/financeiro/contas-receber', {
            params: { search, status: filterStatus, periodo: filterPeriodo }
          });
          setContasReceber(contasReceberRes.data || []);
          break;
        case 'fluxo_caixa':
          const fluxoRes = await api.get('/financeiro/fluxo-caixa', {
            params: { periodo: filterPeriodo }
          });
          setFluxoCaixa(fluxoRes.data || []);
          break;
        case 'bancos':
          const bancosRes = await api.get('/financeiro/bancos', {
            params: { search }
          });
          setBancos(bancosRes.data || []);
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
      'pago': '#2ecc71',
      'pendente': '#f39c12',
      'vencido': '#e74c3c',
      'recebido': '#2ecc71',
      'cancelado': '#95a5a6',
      'parcial': '#3498db'
    };
    return colors[status] || '#95a5a6';
  };

  const handleDelete = async (id, tipo) => {
    if (window.confirm('Tem certeza que deseja excluir este item?')) {
      try {
        await api.delete(`/financeiro/${tipo}/${id}`);
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
        case 'contas_pagar':
          dadosExport = contasPagar.map(c => ({
            'Descrição': c.descricao,
            'Fornecedor': c.fornecedor || '',
            'Valor': formatCurrency(c.valor),
            'Vencimento': formatDate(c.data_vencimento),
            'Pagamento': formatDate(c.data_pagamento),
            'Status': c.status || ''
          }));
          nomeArquivo = 'contas_pagar';
          break;
        case 'contas_receber':
          dadosExport = contasReceber.map(c => ({
            'Descrição': c.descricao,
            'Cliente': c.cliente || '',
            'Valor': formatCurrency(c.valor),
            'Vencimento': formatDate(c.data_vencimento),
            'Recebimento': formatDate(c.data_recebimento),
            'Status': c.status || ''
          }));
          nomeArquivo = 'contas_receber';
          break;
        case 'bancos':
          dadosExport = bancos.map(b => ({
            'Nome': b.nome,
            'Banco': b.banco || '',
            'Agência': b.agencia || '',
            'Conta': b.conta || '',
            'Saldo': formatCurrency(b.saldo),
            'Tipo': b.tipo || ''
          }));
          nomeArquivo = 'bancos';
          break;
      }

      exportToExcel(dadosExport, nomeArquivo, nomeArquivo);
      toast.success('Exportação realizada com sucesso!');
    } catch (error) {
      toast.error('Erro ao exportar dados');
    }
  };

  const calcularTotal = (items, campo = 'valor') => {
    return items.reduce((total, item) => total + (parseFloat(item[campo]) || 0), 0);
  };

  const renderContasPagar = () => {
    const totalPendente = calcularTotal(contasPagar.filter(c => c.status === 'pendente'));
    const totalPago = calcularTotal(contasPagar.filter(c => c.status === 'pago'));
    const totalVencido = calcularTotal(contasPagar.filter(c => c.status === 'vencido'));

    return (
      <>
        <div className="financial-summary">
          <div className="summary-card">
            <div className="summary-icon" style={{ background: 'rgba(243, 156, 18, 0.1)', color: '#f39c12' }}>
              <FiTrendingDown />
            </div>
            <div>
              <div className="summary-label">Pendente</div>
              <div className="summary-value">{formatCurrency(totalPendente)}</div>
            </div>
          </div>
          <div className="summary-card">
            <div className="summary-icon" style={{ background: 'rgba(46, 204, 113, 0.1)', color: '#2ecc71' }}>
              <FiTrendingUp />
            </div>
            <div>
              <div className="summary-label">Pago</div>
              <div className="summary-value">{formatCurrency(totalPago)}</div>
            </div>
          </div>
          <div className="summary-card">
            <div className="summary-icon" style={{ background: 'rgba(231, 76, 60, 0.1)', color: '#e74c3c' }}>
              <FiArrowDown />
            </div>
            <div>
              <div className="summary-label">Vencido</div>
              <div className="summary-value">{formatCurrency(totalVencido)}</div>
            </div>
          </div>
        </div>

        <div className="table-container">
          {loading ? (
            <SkeletonTable rows={5} />
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Descrição</th>
                  <th>Fornecedor</th>
                  <th>Valor</th>
                  <th>Vencimento</th>
                  <th>Pagamento</th>
                  <th>Status</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {contasPagar.length === 0 ? (
                  <tr>
                    <td colSpan="7" className="no-data">Nenhuma conta a pagar encontrada</td>
                  </tr>
                ) : (
                  contasPagar.map(conta => (
                    <tr key={conta.id}>
                      <td><strong>{conta.descricao}</strong></td>
                      <td>{conta.fornecedor || '-'}</td>
                      <td><strong>{formatCurrency(conta.valor)}</strong></td>
                      <td>{formatDate(conta.data_vencimento)}</td>
                      <td>{formatDate(conta.data_pagamento) || '-'}</td>
                      <td>
                        <span 
                          className="status-badge" 
                          style={{ backgroundColor: getStatusColor(conta.status) + '20', color: getStatusColor(conta.status) }}
                        >
                          {conta.status || 'pendente'}
                        </span>
                      </td>
                      <td>
                        <div className="action-buttons">
                          <Link to={`/financeiro/contas-pagar/editar/${conta.id}`} className="btn-icon" title="Editar">
                            <FiEdit />
                          </Link>
                          <button
                            onClick={() => handleDelete(conta.id, 'contas-pagar')}
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
      </>
    );
  };

  const renderContasReceber = () => {
    const totalPendente = calcularTotal(contasReceber.filter(c => c.status === 'pendente'));
    const totalRecebido = calcularTotal(contasReceber.filter(c => c.status === 'recebido'));
    const totalVencido = calcularTotal(contasReceber.filter(c => c.status === 'vencido'));

    return (
      <>
        <div className="financial-summary">
          <div className="summary-card">
            <div className="summary-icon" style={{ background: 'rgba(243, 156, 18, 0.1)', color: '#f39c12' }}>
              <FiTrendingUp />
            </div>
            <div>
              <div className="summary-label">A Receber</div>
              <div className="summary-value">{formatCurrency(totalPendente)}</div>
            </div>
          </div>
          <div className="summary-card">
            <div className="summary-icon" style={{ background: 'rgba(46, 204, 113, 0.1)', color: '#2ecc71' }}>
              <FiTrendingDown />
            </div>
            <div>
              <div className="summary-label">Recebido</div>
              <div className="summary-value">{formatCurrency(totalRecebido)}</div>
            </div>
          </div>
          <div className="summary-card">
            <div className="summary-icon" style={{ background: 'rgba(231, 76, 60, 0.1)', color: '#e74c3c' }}>
              <FiArrowUp />
            </div>
            <div>
              <div className="summary-label">Vencido</div>
              <div className="summary-value">{formatCurrency(totalVencido)}</div>
            </div>
          </div>
        </div>

        <div className="table-container">
          {loading ? (
            <SkeletonTable rows={5} />
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Descrição</th>
                  <th>Cliente</th>
                  <th>Valor</th>
                  <th>Vencimento</th>
                  <th>Recebimento</th>
                  <th>Status</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {contasReceber.length === 0 ? (
                  <tr>
                    <td colSpan="7" className="no-data">Nenhuma conta a receber encontrada</td>
                  </tr>
                ) : (
                  contasReceber.map(conta => (
                    <tr key={conta.id}>
                      <td><strong>{conta.descricao}</strong></td>
                      <td>{conta.cliente || '-'}</td>
                      <td><strong>{formatCurrency(conta.valor)}</strong></td>
                      <td>{formatDate(conta.data_vencimento)}</td>
                      <td>{formatDate(conta.data_recebimento) || '-'}</td>
                      <td>
                        <span 
                          className="status-badge" 
                          style={{ backgroundColor: getStatusColor(conta.status) + '20', color: getStatusColor(conta.status) }}
                        >
                          {conta.status || 'pendente'}
                        </span>
                      </td>
                      <td>
                        <div className="action-buttons">
                          <Link to={`/financeiro/contas-receber/editar/${conta.id}`} className="btn-icon" title="Editar">
                            <FiEdit />
                          </Link>
                          <button
                            onClick={() => handleDelete(conta.id, 'contas-receber')}
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
      </>
    );
  };

  const renderFluxoCaixa = () => {
    const entradas = calcularTotal(fluxoCaixa.filter(f => f.tipo === 'entrada'));
    const saidas = calcularTotal(fluxoCaixa.filter(f => f.tipo === 'saida'));
    const saldo = entradas - saidas;

    return (
      <>
        <div className="financial-summary">
          <div className="summary-card">
            <div className="summary-icon" style={{ background: 'rgba(46, 204, 113, 0.1)', color: '#2ecc71' }}>
              <FiArrowUp />
            </div>
            <div>
              <div className="summary-label">Entradas</div>
              <div className="summary-value">{formatCurrency(entradas)}</div>
            </div>
          </div>
          <div className="summary-card">
            <div className="summary-icon" style={{ background: 'rgba(231, 76, 60, 0.1)', color: '#e74c3c' }}>
              <FiArrowDown />
            </div>
            <div>
              <div className="summary-label">Saídas</div>
              <div className="summary-value">{formatCurrency(saidas)}</div>
            </div>
          </div>
          <div className="summary-card highlight">
            <div className="summary-icon" style={{ background: 'rgba(52, 152, 219, 0.1)', color: '#3498db' }}>
              <FiDollarSign />
            </div>
            <div>
              <div className="summary-label">Saldo</div>
              <div className="summary-value" style={{ color: saldo >= 0 ? '#2ecc71' : '#e74c3c' }}>
                {formatCurrency(saldo)}
              </div>
            </div>
          </div>
        </div>

        <div className="table-container">
          {loading ? (
            <SkeletonTable rows={5} />
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Descrição</th>
                  <th>Tipo</th>
                  <th>Valor</th>
                  <th>Categoria</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {fluxoCaixa.length === 0 ? (
                  <tr>
                    <td colSpan="6" className="no-data">Nenhum registro encontrado</td>
                  </tr>
                ) : (
                  fluxoCaixa.map(registro => (
                    <tr key={registro.id}>
                      <td>{formatDate(registro.data)}</td>
                      <td><strong>{registro.descricao}</strong></td>
                      <td>
                        <span className={`tipo-badge ${registro.tipo}`}>
                          {registro.tipo === 'entrada' ? <FiArrowUp /> : <FiArrowDown />}
                          {registro.tipo === 'entrada' ? 'Entrada' : 'Saída'}
                        </span>
                      </td>
                      <td><strong style={{ color: registro.tipo === 'entrada' ? '#2ecc71' : '#e74c3c' }}>
                        {registro.tipo === 'entrada' ? '+' : '-'}{formatCurrency(Math.abs(registro.valor))}
                      </strong></td>
                      <td>{registro.categoria || '-'}</td>
                      <td>
                        <div className="action-buttons">
                          <Link to={`/financeiro/fluxo-caixa/editar/${registro.id}`} className="btn-icon" title="Editar">
                            <FiEdit />
                          </Link>
                          <button
                            onClick={() => handleDelete(registro.id, 'fluxo-caixa')}
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
      </>
    );
  };

  const renderBancos = () => (
    <div className="table-container">
      {loading ? (
        <SkeletonTable rows={5} />
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Nome</th>
              <th>Banco</th>
              <th>Agência</th>
              <th>Conta</th>
              <th>Saldo</th>
              <th>Tipo</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {bancos.length === 0 ? (
              <tr>
                <td colSpan="7" className="no-data">Nenhum banco encontrado</td>
              </tr>
            ) : (
              bancos.map(banco => (
                <tr key={banco.id}>
                  <td><strong>{banco.nome}</strong></td>
                  <td>{banco.banco || '-'}</td>
                  <td>{banco.agencia || '-'}</td>
                  <td>{banco.conta || '-'}</td>
                  <td><strong>{formatCurrency(banco.saldo || 0)}</strong></td>
                  <td>{banco.tipo || '-'}</td>
                  <td>
                    <div className="action-buttons">
                      <Link to={`/financeiro/bancos/editar/${banco.id}`} className="btn-icon" title="Editar">
                        <FiEdit />
                      </Link>
                      <button
                        onClick={() => handleDelete(banco.id, 'bancos')}
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
      case 'contas_pagar':
        return '/financeiro/contas-pagar/nova';
      case 'contas_receber':
        return '/financeiro/contas-receber/nova';
      case 'fluxo_caixa':
        return '/financeiro/fluxo-caixa/novo';
      case 'bancos':
        return '/financeiro/bancos/novo';
      default:
        return '#';
    }
  };

  return (
    <div className="financeiro">
      <div className="page-header">
        <div>
          <h1>Financeiro</h1>
          <p>Gestão financeira completa da empresa</p>
        </div>
        <div className="header-actions">
          <button onClick={handleExportExcel} className="btn-secondary" title="Exportar para Excel">
            <FiDownload /> Exportar Excel
          </button>
          <Link to={getNewItemPath()} className="btn-premium">
            <div className="btn-premium-icon">
              <FiPlus size={20} />
            </div>
            <span className="btn-premium-text">Novo {activeSection === 'contas_pagar' ? 'Conta a Pagar' : 
                     activeSection === 'contas_receber' ? 'Conta a Receber' :
                     activeSection === 'fluxo_caixa' ? 'Registro' : 'Banco'}</span>
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
            disabled={activeSection === 'fluxo_caixa'}
          />
        </div>
        {activeSection !== 'fluxo_caixa' && (
          <div className="filter-group">
            <FiFilter />
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="filter-select"
            >
              <option value="">Todos os status</option>
              <option value="pendente">Pendente</option>
              <option value="pago">Pago</option>
              <option value="recebido">Recebido</option>
              <option value="vencido">Vencido</option>
              <option value="cancelado">Cancelado</option>
            </select>
          </div>
        )}
        <div className="filter-group">
          <FiCalendar />
          <select
            value={filterPeriodo}
            onChange={(e) => setFilterPeriodo(e.target.value)}
            className="filter-select"
          >
            <option value="mes">Este Mês</option>
            <option value="trimestre">Este Trimestre</option>
            <option value="ano">Este Ano</option>
            <option value="todos">Todos</option>
          </select>
        </div>
      </div>

      <div className="module-content">
        {activeSection === 'contas_pagar' && renderContasPagar()}
        {activeSection === 'contas_receber' && renderContasReceber()}
        {activeSection === 'fluxo_caixa' && renderFluxoCaixa()}
        {activeSection === 'bancos' && renderBancos()}
      </div>
    </div>
  );
};

export default Financeiro;

