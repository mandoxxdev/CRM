import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import api from '../services/api';
import { toast } from 'react-toastify';
import { 
  FiCheck, FiX, FiClock, FiEye, FiFilter, FiRefreshCw,
  FiAlertCircle, FiDollarSign, FiFileText, FiUser, FiPlus, FiTrash2
} from 'react-icons/fi';
import { useAuth } from '../context/AuthContext';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { SkeletonTable } from './SkeletonLoader';
import './Aprovacoes.css';
import './Loading.css';

const Aprovacoes = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [aprovacoes, setAprovacoes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtroStatus, setFiltroStatus] = useState('');
  const [filtroTipo, setFiltroTipo] = useState('');
  const [aprovacaoSelecionada, setAprovacaoSelecionada] = useState(null);
  const [mostrarModal, setMostrarModal] = useState(false);
  const [motivoRejeicao, setMotivoRejeicao] = useState('');
  const [mostrarModalNovaSolicitacao, setMostrarModalNovaSolicitacao] = useState(false);
  const [propostasDisponiveis, setPropostasDisponiveis] = useState([]);
  const [propostaSelecionada, setPropostaSelecionada] = useState(null);
  const [loadingPropostas, setLoadingPropostas] = useState(false);

  useEffect(() => {
    loadAprovacoes();
  }, [filtroStatus, filtroTipo]);

  const loadAprovacoes = async () => {
    setLoading(true);
    try {
      const params = {};
      if (filtroStatus) params.status = filtroStatus;
      if (filtroTipo) params.tipo = filtroTipo;
      
      const response = await api.get('/aprovacoes', { params });
      console.log('Aprovações carregadas:', response.data);
      const aprovacoesData = response.data || [];
      // Garantir que o status está sempre definido
      const aprovacoesComStatus = aprovacoesData.map(ap => ({
        ...ap,
        status: ap.status || 'pendente' // Se não tiver status, assume pendente
      }));
      setAprovacoes(aprovacoesComStatus);
    } catch (error) {
      console.error('Erro ao carregar aprovações:', error);
      console.error('Detalhes do erro:', error.response?.data);
      toast.error(error.response?.data?.error || 'Erro ao carregar aprovações');
    } finally {
      setLoading(false);
    }
  };

  const handleAprovar = async (id) => {
    try {
      const user = JSON.parse(localStorage.getItem('user'));
      const response = await api.put(`/aprovacoes/${id}`, {
        status: 'aprovado',
        aprovado_por: user?.id
      });
      console.log('✅ Aprovação confirmada:', response.data);
      toast.success('Aprovação confirmada com sucesso!');
      loadAprovacoes();
      setMostrarModal(false);
      setAprovacaoSelecionada(null);
      setMotivoRejeicao('');
    } catch (error) {
      console.error('❌ Erro ao aprovar:', error);
      console.error('❌ Detalhes do erro:', error.response?.data);
      toast.error('Erro ao aprovar solicitação: ' + (error.response?.data?.error || error.message));
    }
  };

  const handleRejeitar = async () => {
    if (!motivoRejeicao.trim()) {
      toast.error('Por favor, informe o motivo da rejeição');
      return;
    }

    if (!aprovacaoSelecionada || !aprovacaoSelecionada.id) {
      toast.error('Erro: aprovação não selecionada');
      return;
    }

    try {
      const user = JSON.parse(localStorage.getItem('user'));
      const response = await api.put(`/aprovacoes/${aprovacaoSelecionada.id}`, {
        status: 'rejeitado',
        motivo_rejeicao: motivoRejeicao.trim(),
        aprovado_por: user?.id
      });
      console.log('✅ Solicitação rejeitada:', response.data);
      toast.success('Solicitação rejeitada com sucesso');
      loadAprovacoes();
      setMostrarModal(false);
      setAprovacaoSelecionada(null);
      setMotivoRejeicao('');
    } catch (error) {
      console.error('❌ Erro ao rejeitar:', error);
      console.error('❌ Detalhes do erro:', error.response?.data);
      toast.error('Erro ao rejeitar solicitação: ' + (error.response?.data?.error || error.message));
    }
  };

  const handleDeletarAprovacao = async () => {
    if (!aprovacaoSelecionada || !aprovacaoSelecionada.id) {
      toast.error('Erro: aprovação não selecionada');
      return;
    }

    if (!window.confirm(`Tem certeza que deseja excluir esta solicitação de aprovação?\n\nEsta ação não pode ser desfeita.`)) {
      return;
    }

    try {
      await api.delete(`/aprovacoes/${aprovacaoSelecionada.id}`);
      console.log('✅ Aprovação deletada com sucesso');
      toast.success('Solicitação de aprovação excluída com sucesso');
      loadAprovacoes();
      setMostrarModal(false);
      setAprovacaoSelecionada(null);
      setMotivoRejeicao('');
    } catch (error) {
      console.error('❌ Erro ao deletar aprovação:', error);
      console.error('❌ Detalhes do erro:', error.response?.data);
      toast.error('Erro ao excluir solicitação: ' + (error.response?.data?.error || error.message));
    }
  };

  const abrirModal = (aprovacao) => {
    console.log('📋 Abrindo modal para aprovação:', aprovacao);
    console.log('📋 Status da aprovação:', aprovacao?.status);
    setAprovacaoSelecionada(aprovacao);
    setMostrarModal(true);
    setMotivoRejeicao('');
  };

  const abrirModalNovaSolicitacao = async () => {
    setMostrarModalNovaSolicitacao(true);
    setLoadingPropostas(true);
    try {
      // Buscar propostas com desconto > 5% que ainda não têm aprovação
      const response = await api.get('/propostas', {
        params: { status: 'rascunho' }
      });
      
      const todasPropostas = response.data || [];
      
      // Filtrar propostas com desconto > 5%
      const propostasComDesconto = todasPropostas.filter(p => p.margem_desconto > 5);
      
      // Verificar quais já têm aprovação
      const propostasComAprovacao = await Promise.all(
        propostasComDesconto.map(async (proposta) => {
          try {
            const aprovacoesRes = await api.get('/aprovacoes', {
              params: { proposta_id: proposta.id, status: 'aprovado' }
            });
            const temAprovacao = aprovacoesRes.data?.some(ap => 
              ap.proposta_id === proposta.id && 
              ap.status === 'aprovado' && 
              ap.valor_desconto === proposta.margem_desconto
            );
            return { ...proposta, temAprovacao };
          } catch (error) {
            return { ...proposta, temAprovacao: false };
          }
        })
      );
      
      // Filtrar apenas as que não têm aprovação
      const propostasSemAprovacao = propostasComAprovacao.filter(p => !p.temAprovacao);
      
      setPropostasDisponiveis(propostasSemAprovacao);
    } catch (error) {
      console.error('Erro ao carregar propostas:', error);
      toast.error('Erro ao carregar propostas disponíveis');
    } finally {
      setLoadingPropostas(false);
    }
  };

  const criarSolicitacaoAprovacao = async () => {
    if (!propostaSelecionada) {
      toast.error('Selecione uma proposta');
      return;
    }

    if (!user || !user.id) {
      toast.error('Usuário não identificado');
      return;
    }

    try {
      const valorDesconto = propostaSelecionada.margem_desconto;
      const valorTotal = propostaSelecionada.valor_total || 0;
      const valorDescontoRs = valorTotal * (valorDesconto / 100);
      const valorComDesconto = valorTotal - valorDescontoRs;

      const response = await api.post('/aprovacoes', {
        proposta_id: propostaSelecionada.id,
        tipo: 'desconto',
        valor_desconto: valorDesconto,
        valor_total: valorTotal,
        valor_com_desconto: valorComDesconto,
        valor_desconto_rs: valorDescontoRs,
        solicitado_por: user.id,
        status: 'pendente',
        observacoes: `Solicitação de autorização para desconto de ${valorDesconto}% (acima do limite de 5%)`
      });

      toast.success('Solicitação de aprovação criada com sucesso!');
      setMostrarModalNovaSolicitacao(false);
      setPropostaSelecionada(null);
      loadAprovacoes();
    } catch (error) {
      console.error('Erro ao criar solicitação:', error);
      toast.error('Erro ao criar solicitação: ' + (error.response?.data?.error || error.message));
    }
  };

  const getStatusBadge = (status) => {
    const badges = {
      pendente: { bg: '#fff3cd', color: '#856404', icon: FiClock, text: 'Pendente' },
      aprovado: { bg: '#d4edda', color: '#155724', icon: FiCheck, text: 'Aprovado' },
      rejeitado: { bg: '#f8d7da', color: '#721c24', icon: FiX, text: 'Rejeitado' }
    };
    const badge = badges[status] || badges.pendente;
    const Icon = badge.icon;
    return (
      <span
        className="status-badge"
        style={{
          backgroundColor: badge.bg,
          color: badge.color,
          padding: '6px 12px',
          borderRadius: '20px',
          fontSize: '12px',
          fontWeight: '600',
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px'
        }}
      >
        <Icon size={14} />
        {badge.text}
      </span>
    );
  };

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value || 0);
  };

  const formatDate = (dateString) => {
    if (!dateString) return '-';
    try {
      // SQLite retorna datas no formato "YYYY-MM-DD HH:MM:SS" sem timezone
      // O CURRENT_TIMESTAMP do SQLite geralmente salva em UTC
      // Precisamos converter de UTC para o horário do Brasil (UTC-3)
      
      let date;
      
      // Se não tem 'T' nem 'Z', é formato SQLite (YYYY-MM-DD HH:MM:SS)
      if (dateString && !dateString.includes('T') && !dateString.includes('Z')) {
        // Formato SQLite: "2026-01-09 18:37:00"
        // Assumir que está em UTC e converter para horário do Brasil (UTC-3)
        // Criar a data como UTC primeiro
        const [datePart, timePart] = dateString.split(' ');
        const [year, month, day] = datePart.split('-');
        const [hour, minute, second = '00'] = (timePart || '00:00:00').split(':');
        
        // Criar Date object em UTC
        date = new Date(Date.UTC(
          parseInt(year),
          parseInt(month) - 1, // meses são 0-indexed
          parseInt(day),
          parseInt(hour),
          parseInt(minute),
          parseInt(second || '0')
        ));
        
        // Converter para horário do Brasil (UTC-3) - subtrair 3 horas
        date = new Date(date.getTime() - (3 * 60 * 60 * 1000));
      } else {
        // Formato ISO com timezone
        date = new Date(dateString);
        // Se tem 'Z' ou está em UTC, converter para horário do Brasil
        if (dateString.includes('Z') || dateString.endsWith('+00:00')) {
          date = new Date(date.getTime() - (3 * 60 * 60 * 1000));
        }
      }
      
      return format(date, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
    } catch (error) {
      console.error('Erro ao formatar data:', error, dateString);
      return '-';
    }
  };

  const aprovaçõesPendentes = aprovacoes.filter(a => a.status === 'pendente').length;
  const aprovaçõesAprovadas = aprovacoes.filter(a => a.status === 'aprovado').length;
  const aprovaçõesRejeitadas = aprovacoes.filter(a => a.status === 'rejeitado').length;

  return (
    <div className="aprovacoes-container">
      <div className="page-header">
        <div>
          <h1>
            <FiFileText style={{ marginRight: '10px' }} />
            Aprovações
          </h1>
          <p>Gerencie solicitações de aprovação de descontos</p>
        </div>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <button
            className="btn-nova-solicitacao-premium"
            onClick={abrirModalNovaSolicitacao}
            title="Criar nova solicitação de aprovação"
          >
            <div className="btn-nova-solicitacao-icon">
              <FiPlus size={20} />
            </div>
            <span className="btn-nova-solicitacao-text">Nova Solicitação</span>
            <div className="btn-nova-solicitacao-shine"></div>
          </button>
          <button
            className="btn-refresh"
            onClick={loadAprovacoes}
            title="Atualizar"
          >
            <FiRefreshCw />
          </button>
        </div>
      </div>

      {/* Cards de Estatísticas */}
      <div className="stats-cards">
        <div className="stat-card stat-pendente">
          <div className="stat-icon">
            <FiClock />
          </div>
          <div className="stat-content">
            <div className="stat-value">{aprovaçõesPendentes}</div>
            <div className="stat-label">Pendentes</div>
          </div>
        </div>
        <div className="stat-card stat-aprovado">
          <div className="stat-icon">
            <FiCheck />
          </div>
          <div className="stat-content">
            <div className="stat-value">{aprovaçõesAprovadas}</div>
            <div className="stat-label">Aprovadas</div>
          </div>
        </div>
        <div className="stat-card stat-rejeitado">
          <div className="stat-icon">
            <FiX />
          </div>
          <div className="stat-content">
            <div className="stat-value">{aprovaçõesRejeitadas}</div>
            <div className="stat-label">Rejeitadas</div>
          </div>
        </div>
      </div>

      {/* Filtros */}
      <div className="filters-section">
        <div className="filters-row">
          <div className="filter-group">
            <FiFilter className="filter-icon" />
            <select
              value={filtroStatus}
              onChange={(e) => setFiltroStatus(e.target.value)}
              className="filter-select"
            >
              <option value="">Todos os Status</option>
              <option value="pendente">Pendentes</option>
              <option value="aprovado">Aprovadas</option>
              <option value="rejeitado">Rejeitadas</option>
            </select>
          </div>
          
          <div className="filter-tipo-premium">
            <span className="filter-tipo-label">Tipo:</span>
            <div className="filter-tipo-buttons">
              <button
                className={`filter-tipo-btn ${filtroTipo === '' ? 'active' : ''}`}
                onClick={() => setFiltroTipo('')}
              >
                <span>Todos</span>
              </button>
              <button
                className={`filter-tipo-btn filter-tipo-enviada ${filtroTipo === 'enviada' ? 'active' : ''}`}
                onClick={() => setFiltroTipo('enviada')}
              >
                <FiFileText />
                <span>Enviadas</span>
              </button>
              <button
                className={`filter-tipo-btn filter-tipo-recebida ${filtroTipo === 'recebida' ? 'active' : ''}`}
                onClick={() => setFiltroTipo('recebida')}
              >
                <FiUser />
                <span>Recebidas</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Tabela */}
      {loading ? (
        <SkeletonTable rows={5} cols={7} />
      ) : aprovacoes.length === 0 ? (
        <div className="empty-state">
          <FiAlertCircle size={48} />
          <h3>Nenhuma aprovação encontrada</h3>
          <p>Não há solicitações de aprovação no momento.</p>
        </div>
      ) : (
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Proposta</th>
                <th>Cliente</th>
                <th>Solicitado Por</th>
                <th>Desconto</th>
                <th>Valor Total</th>
                <th>Valor com Desconto</th>
                <th>Status</th>
                <th>Data</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {aprovacoes.map((aprovacao) => (
                <tr key={aprovacao.id}>
                  <td>
                    <Link
                      to={`/comercial/propostas/editar/${aprovacao.proposta_id}`}
                      className="link-proposta"
                    >
                      {aprovacao.numero_proposta || `#${aprovacao.proposta_id}`}
                    </Link>
                  </td>
                  <td>{aprovacao.cliente_nome || '-'}</td>
                  <td>
                    <div className="user-info">
                      <FiUser size={14} />
                      {aprovacao.solicitado_por_nome || '-'}
                    </div>
                  </td>
                  <td>
                    <strong style={{ color: '#d32f2f' }}>
                      {aprovacao.valor_desconto?.toFixed(2)}%
                    </strong>
                    <div style={{ fontSize: '11px', color: '#666' }}>
                      {formatCurrency(aprovacao.valor_desconto_rs)}
                    </div>
                  </td>
                  <td>{formatCurrency(aprovacao.valor_total)}</td>
                  <td>
                    <strong style={{ color: '#1a4d7a' }}>
                      {formatCurrency(aprovacao.valor_com_desconto)}
                    </strong>
                  </td>
                  <td>{getStatusBadge(aprovacao.status)}</td>
                  <td>{formatDate(aprovacao.created_at)}</td>
                  <td>
                    <div className="action-buttons">
                      <button
                        className="btn-action btn-view"
                        onClick={() => abrirModal(aprovacao)}
                        title="Ver detalhes"
                      >
                        <FiEye />
                      </button>
                      {aprovacao.status === 'pendente' && (
                        <>
                          <button
                            className="btn-action btn-approve"
                            onClick={() => handleAprovar(aprovacao.id)}
                            title="Aprovar"
                          >
                            <FiCheck />
                          </button>
                          <button
                            className="btn-action btn-reject"
                            onClick={() => abrirModal(aprovacao)}
                            title="Rejeitar"
                          >
                            <FiX />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal de Detalhes/Rejeição */}
      {mostrarModal && aprovacaoSelecionada && (
        <div className="modal-overlay" onClick={() => {
          setMostrarModal(false);
          setAprovacaoSelecionada(null);
          setMotivoRejeicao('');
        }}>
          <div className="modal-content modal-aprovacao" onClick={(e) => e.stopPropagation()} style={{ 
            display: 'flex', 
            flexDirection: 'column', 
            maxHeight: '90vh',
            overflow: 'hidden'
          }}>
            <div className="modal-header">
              <h2>Detalhes da Solicitação</h2>
              <button className="modal-close" onClick={() => {
                setMostrarModal(false);
                setAprovacaoSelecionada(null);
                setMotivoRejeicao('');
              }}>
                <FiX />
              </button>
            </div>
            <div className="modal-body">
              <div className="detail-section">
                <h3>Informações da Proposta</h3>
                <div className="detail-grid">
                  <div className="detail-item">
                    <label>Número da Proposta:</label>
                    <span>
                      <Link
                        to={`/comercial/propostas/editar/${aprovacaoSelecionada.proposta_id}`}
                        className="link-proposta"
                      >
                        {aprovacaoSelecionada.numero_proposta || `#${aprovacaoSelecionada.proposta_id}`}
                      </Link>
                    </span>
                  </div>
                  <div className="detail-item">
                    <label>Cliente:</label>
                    <span>{aprovacaoSelecionada.cliente_nome || '-'}</span>
                  </div>
                  <div className="detail-item">
                    <label>Solicitado Por:</label>
                    <span>{aprovacaoSelecionada.solicitado_por_nome || '-'}</span>
                  </div>
                  <div className="detail-item">
                    <label>Data da Solicitação:</label>
                    <span>{formatDate(aprovacaoSelecionada.created_at)}</span>
                  </div>
                </div>
              </div>

              <div className="detail-section">
                <h3>Detalhes do Desconto</h3>
                <div className="detail-grid">
                  <div className="detail-item">
                    <label>Percentual de Desconto:</label>
                    <span style={{ color: '#d32f2f', fontWeight: '700', fontSize: '18px' }}>
                      {aprovacaoSelecionada.valor_desconto?.toFixed(2)}%
                    </span>
                  </div>
                  <div className="detail-item">
                    <label>Valor do Desconto (R$):</label>
                    <span style={{ color: '#d32f2f', fontWeight: '600' }}>
                      {formatCurrency(aprovacaoSelecionada.valor_desconto_rs)}
                    </span>
                  </div>
                  <div className="detail-item">
                    <label>Valor Total da Proposta:</label>
                    <span>{formatCurrency(aprovacaoSelecionada.valor_total)}</span>
                  </div>
                  <div className="detail-item">
                    <label>Valor com Desconto:</label>
                    <span style={{ color: '#1a4d7a', fontWeight: '700', fontSize: '18px' }}>
                      {formatCurrency(aprovacaoSelecionada.valor_com_desconto)}
                    </span>
                  </div>
                </div>
              </div>

              {aprovacaoSelecionada.observacoes && (
                <div className="detail-section">
                  <h3>Observações</h3>
                  <p>{aprovacaoSelecionada.observacoes}</p>
                </div>
              )}

              {aprovacaoSelecionada.status === 'rejeitado' && (
                <div className="detail-section">
                  <h3>Rejeição</h3>
                  {aprovacaoSelecionada.motivo_rejeicao && (
                    <div style={{ marginBottom: '15px' }}>
                      <label style={{ fontSize: '12px', color: '#666', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: '600', display: 'block', marginBottom: '5px' }}>Motivo da Rejeição:</label>
                      <p style={{ color: '#721c24', margin: 0, fontSize: '14px' }}>{aprovacaoSelecionada.motivo_rejeicao}</p>
                    </div>
                  )}
                  {aprovacaoSelecionada.aprovado_por_nome && (
                    <div style={{ marginBottom: '10px' }}>
                      <label style={{ fontSize: '12px', color: '#666', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: '600', display: 'block', marginBottom: '5px' }}>Rejeitado Por:</label>
                      <p style={{ color: '#333', margin: 0, fontSize: '14px', fontWeight: '600' }}>{aprovacaoSelecionada.aprovado_por_nome}</p>
                    </div>
                  )}
                  {aprovacaoSelecionada.aprovado_em && (
                    <div>
                      <label style={{ fontSize: '12px', color: '#666', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: '600', display: 'block', marginBottom: '5px' }}>Data da Rejeição:</label>
                      <p style={{ color: '#333', margin: 0, fontSize: '14px' }}>{formatDate(aprovacaoSelecionada.aprovado_em)}</p>
                    </div>
                  )}
                </div>
              )}

              {aprovacaoSelecionada.status === 'aprovado' && aprovacaoSelecionada.aprovado_por_nome && (
                <div className="detail-section">
                  <h3>Aprovado Por</h3>
                  <p>{aprovacaoSelecionada.aprovado_por_nome} em {formatDate(aprovacaoSelecionada.aprovado_em)}</p>
                </div>
              )}

              {aprovacaoSelecionada.status === 'pendente' && (
                <div className="detail-section">
                  <h3>Rejeitar Solicitação</h3>
                  <textarea
                    className="textarea-rejeicao"
                    placeholder="Informe o motivo da rejeição..."
                    value={motivoRejeicao}
                    onChange={(e) => setMotivoRejeicao(e.target.value)}
                    rows="4"
                  />
                </div>
              )}
            </div>
            <div className="modal-actions" style={{ 
              display: 'flex !important', 
              justifyContent: 'flex-end', 
              gap: '12px', 
              padding: '20px 25px',
              visibility: 'visible',
              opacity: 1,
              position: 'relative',
              zIndex: 10
            }}>
              {(() => {
                if (!aprovacaoSelecionada) {
                  return null;
                }
                
                const status = aprovacaoSelecionada.status || 'pendente';
                console.log('🔍 Renderizando botões. Status:', status);
                console.log('🔍 Aprovação completa:', aprovacaoSelecionada);
                console.log('🔍 Status é pendente?', status === 'pendente');
                
                if (status === 'pendente' || status === null || status === undefined) {
                  return (
                    <>
                      <button
                        className="btn-secondary"
                        onClick={() => {
                          setMostrarModal(false);
                          setAprovacaoSelecionada(null);
                          setMotivoRejeicao('');
                        }}
                        style={{
                          padding: '12px 24px',
                          background: '#e0e0e0',
                          color: '#333',
                          border: 'none',
                          borderRadius: '8px',
                          cursor: 'pointer',
                          fontWeight: '600'
                        }}
                      >
                        Cancelar
                      </button>
                      <button
                        className="btn-approve"
                        onClick={() => {
                          if (aprovacaoSelecionada && aprovacaoSelecionada.id) {
                            handleAprovar(aprovacaoSelecionada.id);
                          } else {
                            toast.error('Erro: ID da aprovação não encontrado');
                          }
                        }}
                        style={{
                          padding: '12px 24px',
                          background: '#28a745',
                          color: 'white',
                          border: 'none',
                          borderRadius: '8px',
                          cursor: 'pointer',
                          fontWeight: '600',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px'
                        }}
                      >
                        <FiCheck /> Aprovar
                      </button>
                      <button
                        className="btn-reject"
                        onClick={handleRejeitar}
                        disabled={!motivoRejeicao || !motivoRejeicao.trim()}
                        style={{
                          padding: '12px 24px',
                          background: (!motivoRejeicao || !motivoRejeicao.trim()) ? '#999' : '#dc3545',
                          color: 'white',
                          border: 'none',
                          borderRadius: '8px',
                          cursor: (!motivoRejeicao || !motivoRejeicao.trim()) ? 'not-allowed' : 'pointer',
                          fontWeight: '600',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          opacity: 1,
                          minWidth: '120px',
                          justifyContent: 'center',
                          transition: 'all 0.3s ease',
                          boxShadow: (!motivoRejeicao || !motivoRejeicao.trim()) ? 'none' : '0 2px 8px rgba(220, 53, 69, 0.3)'
                        }}
                        title={(!motivoRejeicao || !motivoRejeicao.trim()) ? 'Preencha o motivo da rejeição acima para confirmar' : 'Confirmar rejeição'}
                      >
                        <FiX /> {(!motivoRejeicao || !motivoRejeicao.trim()) ? 'Preencha o motivo' : 'Confirmar Rejeição'}
                      </button>
                      {user && user.role === 'admin' && (
                        <button
                          className="btn-reject"
                          onClick={handleDeletarAprovacao}
                          style={{
                            padding: '12px 24px',
                            background: '#6c757d',
                            color: 'white',
                            border: 'none',
                            borderRadius: '8px',
                            cursor: 'pointer',
                            fontWeight: '600',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px'
                          }}
                          title="Excluir solicitação (apenas admin)"
                        >
                          <FiTrash2 /> Excluir
                        </button>
                      )}
                    </>
                  );
                } else {
                  return (
                    <>
                      <button
                        className="btn-primary"
                        onClick={() => {
                          setMostrarModal(false);
                          setAprovacaoSelecionada(null);
                          setMotivoRejeicao('');
                        }}
                        style={{
                          padding: '12px 24px',
                          background: '#0066CC',
                          color: 'white',
                          border: 'none',
                          borderRadius: '8px',
                          cursor: 'pointer',
                          fontWeight: '600'
                        }}
                      >
                        Fechar
                      </button>
                      {user && user.role === 'admin' && (
                        <button
                          className="btn-reject"
                          onClick={handleDeletarAprovacao}
                          style={{
                            padding: '12px 24px',
                            background: '#dc3545',
                            color: 'white',
                            border: 'none',
                            borderRadius: '8px',
                            cursor: 'pointer',
                            fontWeight: '600',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px'
                          }}
                        >
                          <FiTrash2 /> Excluir
                        </button>
                      )}
                    </>
                  );
                }
              })()}
            </div>
          </div>
        </div>
      )}

      {/* Modal Nova Solicitação */}
      {mostrarModalNovaSolicitacao && (
        <div className="modal-overlay" onClick={() => setMostrarModalNovaSolicitacao(false)}>
          <div className="modal-content modal-aprovacao" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Nova Solicitação de Aprovação</h2>
              <button className="modal-close" onClick={() => setMostrarModalNovaSolicitacao(false)}>
                <FiX />
              </button>
            </div>
            <div className="modal-body">
              {loadingPropostas ? (
                <div style={{ textAlign: 'center', padding: '40px' }}>
                  <p>Carregando propostas disponíveis...</p>
                </div>
              ) : propostasDisponiveis.length === 0 ? (
                <div className="empty-state" style={{ padding: '40px', margin: 0 }}>
                  <FiAlertCircle size={48} />
                  <h3>Nenhuma proposta disponível</h3>
                  <p>Não há propostas com desconto acima de 5% que precisem de aprovação.</p>
                </div>
              ) : (
                <>
                  <div className="detail-section">
                    <h3>Selecione uma Proposta</h3>
                    <p style={{ color: '#666', marginBottom: '15px' }}>
                      Selecione uma proposta com desconto acima de 5% para solicitar aprovação:
                    </p>
                    <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
                      {propostasDisponiveis.map((proposta) => (
                        <div
                          key={proposta.id}
                          onClick={() => setPropostaSelecionada(proposta)}
                          style={{
                            padding: '15px',
                            marginBottom: '10px',
                            border: propostaSelecionada?.id === proposta.id ? '2px solid #0066CC' : '1px solid #e0e0e0',
                            borderRadius: '8px',
                            cursor: 'pointer',
                            backgroundColor: propostaSelecionada?.id === proposta.id ? '#e3f2fd' : 'white',
                            transition: 'all 0.3s ease'
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                              <strong style={{ color: '#1a4d7a' }}>{proposta.numero_proposta || `#${proposta.id}`}</strong>
                              <div style={{ fontSize: '14px', color: '#666', marginTop: '4px' }}>
                                {proposta.titulo}
                              </div>
                              <div style={{ fontSize: '12px', color: '#999', marginTop: '4px' }}>
                                {proposta.cliente_nome || 'Cliente não informado'}
                              </div>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                              <div style={{ fontSize: '16px', fontWeight: '700', color: '#d32f2f' }}>
                                Desconto: {proposta.margem_desconto?.toFixed(2)}%
                              </div>
                              <div style={{ fontSize: '14px', color: '#666', marginTop: '4px' }}>
                                Total: {formatCurrency(proposta.valor_total)}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  
                  {propostaSelecionada && (
                    <div className="detail-section">
                      <h3>Detalhes da Solicitação</h3>
                      <div className="detail-grid">
                        <div className="detail-item">
                          <label>Proposta:</label>
                          <span>{propostaSelecionada.numero_proposta || `#${propostaSelecionada.id}`}</span>
                        </div>
                        <div className="detail-item">
                          <label>Cliente:</label>
                          <span>{propostaSelecionada.cliente_nome || '-'}</span>
                        </div>
                        <div className="detail-item">
                          <label>Desconto:</label>
                          <span style={{ color: '#d32f2f', fontWeight: '700' }}>
                            {propostaSelecionada.margem_desconto?.toFixed(2)}%
                          </span>
                        </div>
                        <div className="detail-item">
                          <label>Valor Total:</label>
                          <span>{formatCurrency(propostaSelecionada.valor_total)}</span>
                        </div>
                        <div className="detail-item">
                          <label>Valor do Desconto:</label>
                          <span style={{ color: '#d32f2f', fontWeight: '600' }}>
                            {formatCurrency((propostaSelecionada.valor_total || 0) * (propostaSelecionada.margem_desconto / 100))}
                          </span>
                        </div>
                        <div className="detail-item">
                          <label>Valor com Desconto:</label>
                          <span style={{ color: '#1a4d7a', fontWeight: '700' }}>
                            {formatCurrency((propostaSelecionada.valor_total || 0) * (1 - propostaSelecionada.margem_desconto / 100))}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
            <div className="modal-actions">
              <button
                className="btn-secondary"
                onClick={() => {
                  setMostrarModalNovaSolicitacao(false);
                  setPropostaSelecionada(null);
                }}
              >
                Cancelar
              </button>
              {propostaSelecionada && (
                <button
                  className="btn-primary"
                  onClick={criarSolicitacaoAprovacao}
                >
                  <FiCheck /> Criar Solicitação
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Aprovacoes;
