import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import { toast } from 'react-toastify';
import { 
  FiClipboard, FiUsers, FiActivity, FiClock, 
  FiTrendingUp, FiAlertCircle, FiCheckCircle, FiPlay
} from 'react-icons/fi';
import './Operacional.css';

const DashboardOperacional = () => {
  const [dashboardData, setDashboardData] = useState({
    kpis: {},
    atividades_em_andamento: [],
    colaboradores_disponiveis: [],
    os_prioritarias: []
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboard();
    // Atualizar a cada 30 segundos
    const interval = setInterval(loadDashboard, 30000);
    return () => clearInterval(interval);
  }, []);

  const loadDashboard = async () => {
    try {
      setLoading(true);
      const response = await api.get('/operacional/dashboard');
      setDashboardData(response.data);
    } catch (error) {
      console.error('Erro ao carregar dashboard:', error);
      toast.error('Erro ao carregar dados do dashboard');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (date) => {
    if (!date) return '-';
    return new Date(date).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (loading) {
    return (
      <div className="dashboard-loading">
        <div className="loading-spinner"></div>
        <p>Carregando dashboard...</p>
      </div>
    );
  }

  return (
    <div className="dashboard-operacional">
      {/* KPIs */}
      <div className="dashboard-kpis">
        <div className="kpi-card">
          <div className="kpi-icon" style={{ background: '#3498db' }}>
            <FiClipboard />
          </div>
          <div className="kpi-content">
            <h3>{dashboardData.kpis.total_os || 0}</h3>
            <p>Total de OS</p>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-icon" style={{ background: '#2ecc71' }}>
            <FiPlay />
          </div>
          <div className="kpi-content">
            <h3>{dashboardData.kpis.os_em_andamento || 0}</h3>
            <p>OS em Andamento</p>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-icon" style={{ background: '#9b59b6' }}>
            <FiUsers />
          </div>
          <div className="kpi-content">
            <h3>{dashboardData.kpis.total_colaboradores || 0}</h3>
            <p>Total Colaboradores</p>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-icon" style={{ background: '#f39c12' }}>
            <FiCheckCircle />
          </div>
          <div className="kpi-content">
            <h3>{dashboardData.kpis.colaboradores_disponiveis || 0}</h3>
            <p>Disponíveis Agora</p>
          </div>
        </div>
      </div>

      {/* Atividades em Andamento */}
      <div className="dashboard-section">
        <div className="section-header">
          <h2>
            <FiActivity /> Atividades em Andamento
          </h2>
        </div>
        <div className="atividades-grid">
          {dashboardData.atividades_em_andamento && dashboardData.atividades_em_andamento.length > 0 ? (
            dashboardData.atividades_em_andamento.map((atividade) => (
              <div key={atividade.id} className="atividade-card">
                <div className="atividade-header">
                  <span className="atividade-colaborador">{atividade.colaborador_nome}</span>
                  <span className="atividade-status status-em_andamento">Em Andamento</span>
                </div>
                <div className="atividade-body">
                  <p className="atividade-descricao">{atividade.descricao || atividade.tipo_atividade}</p>
                  <p className="atividade-os">OS: {atividade.numero_os || '-'}</p>
                  <p className="atividade-tempo">Início: {formatDate(atividade.data_inicio)}</p>
                </div>
              </div>
            ))
          ) : (
            <div className="no-data">
              <p>Nenhuma atividade em andamento no momento</p>
            </div>
          )}
        </div>
      </div>

      {/* OS Prioritárias */}
      <div className="dashboard-section">
        <div className="section-header">
          <h2>
            <FiAlertCircle /> Ordens de Serviço Prioritárias
          </h2>
        </div>
        <div className="os-prioritarias-table">
          <table className="data-table">
            <thead>
              <tr>
                <th>Número OS</th>
                <th>Cliente</th>
                <th>Prioridade</th>
                <th>Status</th>
                <th>Data Prevista</th>
              </tr>
            </thead>
            <tbody>
              {dashboardData.os_prioritarias && dashboardData.os_prioritarias.length > 0 ? (
                dashboardData.os_prioritarias.map((os) => (
                  <tr key={os.id}>
                    <td><strong>{os.numero_os}</strong></td>
                    <td>{os.cliente_nome || '-'}</td>
                    <td>
                      <span className={`priority-badge priority-${os.prioridade}`}>
                        {os.prioridade}
                      </span>
                    </td>
                    <td>
                      <span className={`status-badge status-${os.status}`}>
                        {os.status}
                      </span>
                    </td>
                    <td>{os.data_prevista ? new Date(os.data_prevista).toLocaleDateString('pt-BR') : '-'}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="5" className="no-data">
                    Nenhuma OS prioritária no momento
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default DashboardOperacional;
