import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import { toast } from 'react-toastify';
import { 
  FiTrendingUp, FiTrendingDown, FiAlertCircle, FiCheckCircle,
  FiActivity, FiClock, FiZap, FiBarChart2, FiTarget, FiUsers
} from 'react-icons/fi';
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import './MESDashboard.css';

const DashboardMES = () => {
  const [dashboardData, setDashboardData] = useState({
    kpis: {},
    oee: {},
    producao: [],
    qualidade: {},
    manutencao: {},
    alarmes: []
  });
  const [loading, setLoading] = useState(true);
  const [refreshInterval, setRefreshInterval] = useState(30000); // 30 segundos

  useEffect(() => {
    loadDashboard();
    const interval = setInterval(loadDashboard, refreshInterval);
    return () => clearInterval(interval);
  }, [refreshInterval]);

  const loadDashboard = async () => {
    try {
      setLoading(true);
      const response = await api.get('/operacional/dashboard-mes');
      setDashboardData(response.data);
    } catch (error) {
      console.error('Erro ao carregar dashboard MES:', error);
      toast.error('Erro ao carregar dados do dashboard MES');
      // Em caso de erro, inicializar com dados vazios
      setDashboardData({
        kpis: {},
        oee: {},
        producao: [],
        qualidade: {},
        manutencao: {},
        alarmes: [],
        status_linhas: []
      });
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="mes-dashboard-loading">
        <div className="loading-spinner"></div>
        <p>Carregando dashboard MES...</p>
      </div>
    );
  }

  const COLORS = ['#4fc3f7', '#66bb6a', '#ffa726', '#ef5350', '#ab47bc'];

  // Calcular percentual de produção
  const producaoPercentual = (() => {
    const producao = dashboardData.kpis?.producao_hoje || 0;
    const meta = dashboardData.kpis?.producao_meta || 1;
    return Math.min(100, (producao / meta) * 100);
  })();

  return (
    <div className="mes-dashboard">
      <div className="mes-dashboard-header">
        <div>
          <h1>Dashboard MES</h1>
          <p>Manufacturing Execution System - Visão Geral da Produção</p>
        </div>
        <div className="mes-dashboard-controls">
          <select 
            value={refreshInterval} 
            onChange={(e) => setRefreshInterval(Number(e.target.value))}
            className="mes-refresh-select"
          >
            <option value={10000}>Atualizar a cada 10s</option>
            <option value={30000}>Atualizar a cada 30s</option>
            <option value={60000}>Atualizar a cada 1min</option>
            <option value={300000}>Atualizar a cada 5min</option>
          </select>
          <button onClick={loadDashboard} className="mes-refresh-btn">
            <FiZap /> Atualizar Agora
          </button>
        </div>
      </div>

      {/* KPIs Principais */}
      <div className="mes-kpis-grid">
        <div className="mes-kpi-card primary">
          <div className="mes-kpi-icon" style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}>
            <FiZap />
          </div>
          <div className="mes-kpi-content">
            <h3>{dashboardData.kpis.oee !== undefined ? dashboardData.kpis.oee.toFixed(1) : '0.0'}%</h3>
            <p>OEE (Overall Equipment Effectiveness)</p>
            <div className="mes-kpi-trend">
              {dashboardData.kpis.oee >= 85 ? <FiTrendingUp /> : <FiTrendingDown />}
              <span>{dashboardData.kpis.oee >= 85 ? 'Meta atingida' : 'Abaixo da meta'}</span>
            </div>
          </div>
        </div>

        <div className="mes-kpi-card">
          <div className="mes-kpi-icon" style={{ background: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)' }}>
            <FiActivity />
          </div>
          <div className="mes-kpi-content">
            <h3>{dashboardData.kpis.disponibilidade !== undefined ? dashboardData.kpis.disponibilidade.toFixed(1) : '0.0'}%</h3>
            <p>Disponibilidade</p>
            <div className="mes-kpi-trend">
              {dashboardData.kpis.disponibilidade >= 90 ? <FiTrendingUp /> : <FiTrendingDown />}
              <span>{dashboardData.kpis.disponibilidade >= 90 ? 'Ótimo' : 'Atenção'}</span>
            </div>
          </div>
        </div>

        <div className="mes-kpi-card">
          <div className="mes-kpi-icon" style={{ background: 'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)' }}>
            <FiBarChart2 />
          </div>
          <div className="mes-kpi-content">
            <h3>{dashboardData.kpis.performance !== undefined ? dashboardData.kpis.performance.toFixed(1) : '0.0'}%</h3>
            <p>Performance</p>
            <div className="mes-kpi-trend">
              {dashboardData.kpis.performance >= 85 ? <FiTrendingUp /> : <FiTrendingDown />}
              <span>{dashboardData.kpis.performance >= 85 ? 'Bom' : 'Melhorar'}</span>
            </div>
          </div>
        </div>

        <div className="mes-kpi-card">
          <div className="mes-kpi-icon" style={{ background: 'linear-gradient(135deg, #fa709a 0%, #fee140 100%)' }}>
            <FiCheckCircle />
          </div>
          <div className="mes-kpi-content">
            <h3>{dashboardData.kpis.qualidade !== undefined ? dashboardData.kpis.qualidade.toFixed(1) : '0.0'}%</h3>
            <p>Qualidade</p>
            <div className="mes-kpi-trend">
              {dashboardData.kpis.qualidade >= 95 ? <FiTrendingUp /> : <FiTrendingDown />}
              <span>{dashboardData.kpis.qualidade >= 95 ? 'Excelente' : 'Atenção'}</span>
            </div>
          </div>
        </div>

        <div className="mes-kpi-card">
          <div className="mes-kpi-icon" style={{ background: 'linear-gradient(135deg, #30cfd0 0%, #330867 100%)' }}>
            <FiTarget />
          </div>
          <div className="mes-kpi-content">
            <h3>{dashboardData.kpis.producao_hoje || 0}</h3>
            <p>Produção Hoje</p>
            <div className="mes-kpi-progress">
              <div className="mes-progress-bar">
                <div 
                  className="mes-progress-fill" 
                  style={{ 
                    width: `${producaoPercentual}%`
                  }}
                ></div>
              </div>
              <span>{dashboardData.kpis.producao_meta || 0} meta</span>
            </div>
          </div>
        </div>

        <div className="mes-kpi-card">
          <div className="mes-kpi-icon" style={{ background: 'linear-gradient(135deg, #a8edea 0%, #fed6e3 100%)' }}>
            <FiClock />
          </div>
          <div className="mes-kpi-content">
            <h3>{dashboardData.kpis.tempo_ciclo_medio !== undefined ? dashboardData.kpis.tempo_ciclo_medio.toFixed(1) : '0.0'}h</h3>
            <p>Tempo Ciclo Médio</p>
            <div className="mes-kpi-trend">
              <span>{dashboardData.kpis.tempo_ciclo_medio > 0 ? 'Real' : 'Sem dados'}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Gráficos e Métricas */}
      <div className="mes-charts-grid">
        <div className="mes-chart-card">
          <h3>Produção ao Longo do Dia</h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={dashboardData.producao && dashboardData.producao.length > 0 ? dashboardData.producao : []}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="hora" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="quantidade" stroke="#4fc3f7" strokeWidth={3} />
            </LineChart>
          </ResponsiveContainer>
          {(!dashboardData.producao || dashboardData.producao.length === 0 || dashboardData.producao.every(p => p.quantidade === 0)) && (
            <div style={{ textAlign: 'center', padding: '40px', color: '#7f8c8d' }}>
              <p>Nenhum dado de produção hoje</p>
              <span style={{ fontSize: '12px' }}>Os dados aparecerão quando houver itens concluídos</span>
            </div>
          )}
        </div>

        <div className="mes-chart-card">
          <h3>Componentes OEE</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={[
              { name: 'Disponibilidade', valor: dashboardData.oee.disponibilidade || 0 },
              { name: 'Performance', valor: dashboardData.oee.performance || 0 },
              { name: 'Qualidade', valor: dashboardData.oee.qualidade || 0 }
            ].filter(item => item.valor > 0)}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis domain={[0, 100]} />
              <Tooltip />
              <Bar dataKey="valor" fill="#4fc3f7" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Alertas e Status */}
      <div className="mes-alerts-grid">
        <div className="mes-alert-card">
          <h3>
            <FiAlertCircle /> Alarmes Ativos
          </h3>
          <div className="mes-alerts-list">
            {dashboardData.alarmes && dashboardData.alarmes.length > 0 ? (
              dashboardData.alarmes.map(alarme => (
                <div key={alarme.id} className={`mes-alert-item ${alarme.tipo.toLowerCase()}`}>
                  <div className="mes-alert-content">
                    <strong>{alarme.descricao}</strong>
                    <span>{alarme.equipamento} - {alarme.hora}</span>
                  </div>
                  <span className={`mes-alert-badge ${alarme.tipo.toLowerCase()}`}>
                    {alarme.tipo}
                  </span>
                </div>
              ))
            ) : (
              <div className="mes-no-alerts">
                <FiCheckCircle /> Nenhum alarme ativo
              </div>
            )}
          </div>
        </div>

        <div className="mes-status-card">
          <h3>Status da Produção</h3>
          <div className="mes-status-grid">
            {dashboardData.status_linhas && dashboardData.status_linhas.length > 0 ? (
              dashboardData.status_linhas.map((linha) => (
                <div key={linha.id} className="mes-status-item">
                  <div className={`mes-status-indicator ${linha.status}`}></div>
                  <div>
                    <strong>{linha.nome}</strong>
                    <span>{linha.label}</span>
                  </div>
                </div>
              ))
            ) : (
              <div className="mes-no-status">
                <p>Nenhuma linha cadastrada</p>
                <span style={{ fontSize: '12px', color: '#7f8c8d' }}>Cadastre equipamentos do tipo "Linha" para visualizar o status</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default DashboardMES;
