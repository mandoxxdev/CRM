import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import api from '../services/api';
import { toast } from 'react-toastify';
import { 
  FiPlus, FiSearch, FiEdit, FiEye, FiFilter, FiClipboard, FiCheckCircle,
  FiClock, FiAlertCircle, FiCheck, FiX, FiTrendingUp, FiCalendar,
  FiFileText, FiUser, FiDollarSign, FiBarChart2
} from 'react-icons/fi';
import { SkeletonTable } from './SkeletonLoader';
import './OrdensServicoComercial.css';

const OrdensServicoComercial = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [propostasAprovadas, setPropostasAprovadas] = useState([]);
  const [ordensServico, setOrdensServico] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [activeTab, setActiveTab] = useState('propostas'); // 'propostas' ou 'os'
  const [osStatusFilter, setOsStatusFilter] = useState('todas'); // 'todas', 'emitidas', 'pendentes', 'em_andamento', 'concluidas', 'vencidas'

  // Recarregar dados quando voltar da criação de OS
  useEffect(() => {
    if (location.pathname === '/comercial/ordens-servico') {
      // Sempre recarregar OS para verificar novas criações
      loadOrdensServico();
      if (activeTab === 'propostas') {
        loadPropostasAprovadas();
      }
    }
  }, [location.pathname, location.key]); // Adicionar location.key para detectar navegação

  useEffect(() => {
    // Sempre carregar OS para verificar se já existe OS para as propostas
    loadOrdensServico();
  }, [osStatusFilter, search]);

  useEffect(() => {
    if (activeTab === 'propostas') {
      loadPropostasAprovadas();
    } else {
      loadOrdensServico();
    }
  }, [activeTab, search, osStatusFilter]);

  const loadPropostasAprovadas = async () => {
    try {
      setLoading(true);
      
      // Primeiro carregar todas as OS para verificar quais propostas já têm OS
      const osResponse = await api.get('/comercial/ordens-servico');
      const todasOS = Array.isArray(osResponse.data) ? osResponse.data : [];
      const propostasComOS = new Set(todasOS.map(os => os.proposta_id).filter(id => id));
      
      // Buscar propostas aprovadas
      const response = await api.get('/propostas', {
        params: { status: 'aprovada' }
      });
      let propostas = Array.isArray(response.data) ? response.data : [];
      
      // Filtrar propostas que já têm OS criada - ELAS NÃO DEVEM APARECER
      propostas = propostas.filter(proposta => !propostasComOS.has(proposta.id));
      
      // Filtrar por busca se houver
      if (search) {
        const searchLower = search.toLowerCase();
        propostas = propostas.filter(proposta => 
          proposta.numero_proposta?.toLowerCase().includes(searchLower) ||
          proposta.cliente_nome?.toLowerCase().includes(searchLower) ||
          proposta.titulo?.toLowerCase().includes(searchLower)
        );
      }
      
      // Carregar itens de cada proposta
      const propostasComItens = await Promise.all(
        propostas.map(async (proposta) => {
          try {
            const propostaDetalhe = await api.get(`/propostas/${proposta.id}`);
            return { ...proposta, itens: propostaDetalhe.data.itens || [] };
          } catch (error) {
            return { ...proposta, itens: [] };
          }
        })
      );
      
      setPropostasAprovadas(propostasComItens);
    } catch (error) {
      console.error('Erro ao carregar propostas aprovadas:', error);
      toast.error('Erro ao carregar propostas aprovadas');
      setPropostasAprovadas([]);
    } finally {
      setLoading(false);
    }
  };

  const loadOrdensServico = async () => {
    try {
      setLoading(true);
      // Usar rota específica do módulo comercial
      const response = await api.get('/comercial/ordens-servico', {
        params: { search }
      });
      let osData = Array.isArray(response.data) ? response.data : [];
      
      // Filtrar por status se necessário
      if (osStatusFilter !== 'todas') {
        if (osStatusFilter === 'vencidas') {
          const hoje = new Date();
          hoje.setHours(0, 0, 0, 0);
          osData = osData.filter(os => {
            if (!os.data_prevista) return false;
            const dataPrevista = new Date(os.data_prevista);
            dataPrevista.setHours(0, 0, 0, 0);
            return dataPrevista < hoje && os.status !== 'concluido';
          });
        } else {
          osData = osData.filter(os => os.status === osStatusFilter);
        }
      }
      
      setOrdensServico(osData);
    } catch (error) {
      toast.error('Erro ao carregar ordens de serviço');
      setOrdensServico([]);
    } finally {
      setLoading(false);
    }
  };

  const handleCriarOS = (proposta) => {
    // Verificar se já existe OS para esta proposta
    const osExistente = ordensServico.find(os => os.proposta_id === proposta.id);
    if (osExistente) {
      toast.warning('Já existe uma Ordem de Serviço para esta proposta');
      return;
    }
    // Navegar para a rota de criação de OS com o ID da proposta
    navigate(`/comercial/ordens-servico/nova/${proposta.id}`);
  };

  const formatDate = (date) => {
    if (!date) return '-';
    return new Date(date).toLocaleDateString('pt-BR');
  };

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value || 0);
  };

  const getStatusInfo = (status) => {
    const statusMap = {
      'pendente': { label: 'Pendente', color: '#f59e0b', icon: FiClock },
      'em_andamento': { label: 'Em Andamento', color: '#3b82f6', icon: FiTrendingUp },
      'concluido': { label: 'Concluída', color: '#10b981', icon: FiCheck },
      'cancelado': { label: 'Cancelada', color: '#94a3b8', icon: FiX },
      'pausada': { label: 'Pausada', color: '#ef4444', icon: FiAlertCircle }
    };
    return statusMap[status] || { label: status, color: '#1a1f2e', icon: FiFileText };
  };

  const getPriorityColor = (prioridade) => {
    const priorityMap = {
      'baixa': '#10b981',
      'normal': '#1a1f2e',
      'alta': '#f59e0b',
      'urgente': '#ef4444'
    };
    return priorityMap[prioridade] || '#1a1f2e';
  };

  // Calcular estatísticas
  const stats = {
    total: ordensServico.length,
    pendentes: ordensServico.filter(os => os.status === 'pendente').length,
    em_andamento: ordensServico.filter(os => os.status === 'em_andamento').length,
    concluidas: ordensServico.filter(os => os.status === 'concluido').length,
    vencidas: ordensServico.filter(os => {
      if (!os.data_prevista) return false;
      const hoje = new Date();
      hoje.setHours(0, 0, 0, 0);
      const dataPrevista = new Date(os.data_prevista);
      dataPrevista.setHours(0, 0, 0, 0);
      return dataPrevista < hoje && os.status !== 'concluido';
    }).length
  };

  const filteredOrdensServico = ordensServico.filter(os => {
    if (search) {
      const searchLower = search.toLowerCase();
      return (
        os.numero_os?.toLowerCase().includes(searchLower) ||
        os.cliente_nome?.toLowerCase().includes(searchLower) ||
        os.proposta_numero?.toLowerCase().includes(searchLower) ||
        os.descricao?.toLowerCase().includes(searchLower)
      );
    }
    return true;
  });

  return (
    <div className="os-comercial-container">
      <div className="os-comercial-header">
        <div>
          <h1>Ordens de Serviço</h1>
          <p>Gerencie ordens de serviço a partir de propostas aprovadas</p>
        </div>
      </div>

      {/* Tabs principais */}
      <div className="os-comercial-tabs">
        <button
          className={`os-tab ${activeTab === 'propostas' ? 'active' : ''}`}
          onClick={() => setActiveTab('propostas')}
        >
          <FiCheckCircle />
          <span>Propostas Aprovadas</span>
          {propostasAprovadas.length > 0 && (
            <span className="tab-badge">{propostasAprovadas.length}</span>
          )}
        </button>
        <button
          className={`os-tab ${activeTab === 'os' ? 'active' : ''}`}
          onClick={() => setActiveTab('os')}
        >
          <FiClipboard />
          <span>Ordens de Serviço</span>
          {stats.total > 0 && (
            <span className="tab-badge">{stats.total}</span>
          )}
        </button>
      </div>

      {/* Estatísticas - apenas na aba OS */}
      {activeTab === 'os' && (
        <div className="os-stats-grid">
          <div className="os-stat-card stat-total">
            <div className="stat-icon">
              <FiBarChart2 />
            </div>
            <div className="stat-content">
              <h3>{stats.total}</h3>
              <p>Total de OS</p>
            </div>
          </div>
          <div className="os-stat-card stat-pendente">
            <div className="stat-icon">
              <FiClock />
            </div>
            <div className="stat-content">
              <h3>{stats.pendentes}</h3>
              <p>Pendentes</p>
            </div>
          </div>
          <div className="os-stat-card stat-andamento">
            <div className="stat-icon">
              <FiTrendingUp />
            </div>
            <div className="stat-content">
              <h3>{stats.em_andamento}</h3>
              <p>Em Andamento</p>
            </div>
          </div>
          <div className="os-stat-card stat-concluida">
            <div className="stat-icon">
              <FiCheck />
            </div>
            <div className="stat-content">
              <h3>{stats.concluidas}</h3>
              <p>Concluídas</p>
            </div>
          </div>
          <div className="os-stat-card stat-vencida">
            <div className="stat-icon">
              <FiAlertCircle />
            </div>
            <div className="stat-content">
              <h3>{stats.vencidas}</h3>
              <p>Vencidas</p>
            </div>
          </div>
        </div>
      )}

      {/* Filtros e busca */}
      <div className="os-comercial-filters">
        <div className="search-box">
          <FiSearch />
          <input
            type="text"
            placeholder={activeTab === 'propostas' ? 'Buscar proposta...' : 'Buscar OS, cliente ou proposta...'}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {activeTab === 'os' && (
          <div className="os-status-filters">
            <button
              className={`status-filter-btn ${osStatusFilter === 'todas' ? 'active' : ''}`}
              onClick={() => setOsStatusFilter('todas')}
            >
              Todas
            </button>
            <button
              className={`status-filter-btn ${osStatusFilter === 'pendente' ? 'active' : ''}`}
              onClick={() => setOsStatusFilter('pendente')}
            >
              Pendentes
            </button>
            <button
              className={`status-filter-btn ${osStatusFilter === 'em_andamento' ? 'active' : ''}`}
              onClick={() => setOsStatusFilter('em_andamento')}
            >
              Em Andamento
            </button>
            <button
              className={`status-filter-btn ${osStatusFilter === 'concluido' ? 'active' : ''}`}
              onClick={() => setOsStatusFilter('concluido')}
            >
              Concluídas
            </button>
            <button
              className={`status-filter-btn ${osStatusFilter === 'vencidas' ? 'active' : ''}`}
              onClick={() => setOsStatusFilter('vencidas')}
            >
              Vencidas
            </button>
          </div>
        )}
      </div>

      {/* Conteúdo */}
      <div className="os-comercial-content">
        {loading ? (
          <SkeletonTable rows={8} cols={activeTab === 'propostas' ? 7 : 9} />
        ) : activeTab === 'propostas' ? (
          <div className="os-table-container">
            <table className="os-data-table">
              <thead>
                <tr>
                  <th>Número Proposta</th>
                  <th>Cliente</th>
                  <th>Valor Total</th>
                  <th>Data Aprovação</th>
                  <th>Status</th>
                  <th>OS Criada</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {propostasAprovadas.length === 0 ? (
                  <tr>
                    <td colSpan="7" className="no-data">
                      Nenhuma proposta aprovada encontrada
                    </td>
                  </tr>
                ) : (
                  propostasAprovadas.map((proposta) => {
                    const osExistente = ordensServico.find(os => os.proposta_id === proposta.id);
                    return (
                      <tr key={proposta.id}>
                        <td><strong>{proposta.numero_proposta}</strong></td>
                        <td>{proposta.cliente_nome || '-'}</td>
                        <td className="currency-cell">{formatCurrency(proposta.valor_total)}</td>
                        <td>{formatDate(proposta.data_aprovacao || proposta.updated_at)}</td>
                        <td>
                          <span className="status-badge status-aprovada">
                            Aprovada
                          </span>
                        </td>
                        <td>
                          {osExistente ? (
                            <span className="status-badge status-concluido">
                              OS {osExistente.numero_os}
                            </span>
                          ) : (
                            <span className="status-badge status-pendente">
                              Pendente
                            </span>
                          )}
                        </td>
                        <td>
                          {!osExistente ? (
                            <button
                              className="btn-primary btn-sm"
                              onClick={() => handleCriarOS(proposta)}
                            >
                              <FiPlus /> Criar OS
                            </button>
                          ) : (
                            <button
                              className="action-btn view"
                              onClick={() => navigate(`/comercial/ordens-servico/editar/${osExistente.id}`)}
                              title="Ver OS"
                            >
                              <FiEye />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="os-cards-grid">
            {filteredOrdensServico.length === 0 ? (
              <div className="os-empty-state">
                <FiClipboard size={64} />
                <h3>Nenhuma ordem de serviço encontrada</h3>
                <p>
                  {osStatusFilter !== 'todas' 
                    ? `Não há ordens de serviço com status "${osStatusFilter}"`
                    : 'Não há ordens de serviço cadastradas'}
                </p>
              </div>
            ) : (
              filteredOrdensServico.map((os) => {
                const statusInfo = getStatusInfo(os.status);
                const StatusIcon = statusInfo.icon;
                const isVencida = os.data_prevista && new Date(os.data_prevista) < new Date() && os.status !== 'concluido';
                const progresso = os.total_itens > 0 
                  ? Math.round((os.itens_concluidos / os.total_itens) * 100) 
                  : 0;

                return (
                  <div key={os.id} className={`os-card ${isVencida ? 'vencida' : ''} status-${os.status}`}>
                    <div className="os-card-header">
                      <div className="os-card-title">
                        <h3>{os.numero_os}</h3>
                        <span className="os-proposta-ref">Proposta: {os.proposta_numero || '-'}</span>
                      </div>
                      <div className="os-status-badge" style={{ backgroundColor: statusInfo.color || '#1a1f2e' }}>
                        <StatusIcon />
                        <span>{statusInfo.label}</span>
                      </div>
                    </div>

                    <div className="os-card-body">
                      <div className="os-info-row">
                        <FiUser className="os-info-icon" />
                        <div>
                          <strong>Cliente</strong>
                          <span>{os.cliente_nome || '-'}</span>
                        </div>
                      </div>

                      {os.projeto_nome && (
                        <div className="os-info-row">
                          <FiFileText className="os-info-icon" />
                          <div>
                            <strong>Projeto</strong>
                            <span>{os.projeto_nome}</span>
                          </div>
                        </div>
                      )}

                      <div className="os-info-row">
                        <FiDollarSign className="os-info-icon" />
                        <div>
                          <strong>Valor Total</strong>
                          <span className="os-value">{formatCurrency(os.valor_total || 0)}</span>
                        </div>
                      </div>

                      <div className="os-info-row">
                        <FiCalendar className="os-info-icon" />
                        <div>
                          <strong>Data Abertura</strong>
                          <span>{formatDate(os.data_abertura)}</span>
                        </div>
                      </div>

                      {os.data_prevista && (
                        <div className="os-info-row">
                          <FiClock className="os-info-icon" />
                          <div>
                            <strong>Data Prevista</strong>
                            <span className={isVencida ? 'vencida-text' : ''}>
                              {formatDate(os.data_prevista)}
                              {isVencida && ' ⚠️'}
                            </span>
                          </div>
                        </div>
                      )}

                      <div className="os-progress">
                        <div className="os-progress-header">
                          <span>Progresso</span>
                          <span>{Math.min(100, Math.max(0, progresso))}%</span>
                        </div>
                        <div className="os-progress-bar">
                          <div 
                            className="os-progress-fill" 
                            style={{ width: `${Math.min(100, Math.max(0, progresso))}%` }}
                          ></div>
                        </div>
                        <div className="os-progress-info">
                          {os.total_itens > 0 
                            ? `${os.itens_concluidos || 0} de ${os.total_itens} itens concluídos`
                            : 'Nenhum item cadastrado'}
                        </div>
                      </div>

                      <div className="os-priority-badge" style={{ backgroundColor: getPriorityColor(os.prioridade) }}>
                        Prioridade: {os.prioridade || 'Normal'}
                      </div>
                    </div>

                    <div className="os-card-footer">
                      <button
                        className="btn-secondary btn-sm"
                        onClick={() => navigate(`/comercial/ordens-servico/editar/${os.id}`)}
                      >
                        <FiEye /> Ver Detalhes
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default OrdensServicoComercial;
