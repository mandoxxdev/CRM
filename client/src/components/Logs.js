import React, { useState, useEffect } from 'react';
import api from '../services/api';
import { FiAlertTriangle, FiShield, FiFilter, FiDownload, FiRefreshCw } from 'react-icons/fi';
import { exportToExcel } from '../utils/exportExcel';
import './Logs.css';

const Logs = () => {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtros, setFiltros] = useState({
    tipo: '',
    modulo: '',
    data_inicio: '',
    data_fim: ''
  });

  useEffect(() => {
    loadLogs();
  }, [filtros]);

  const loadLogs = async () => {
    setLoading(true);
    try {
      const params = {};
      if (filtros.tipo) params.tipo = filtros.tipo;
      if (filtros.modulo) params.modulo = filtros.modulo;
      if (filtros.data_inicio) params.data_inicio = filtros.data_inicio;
      if (filtros.data_fim) params.data_fim = filtros.data_fim;

      const response = await api.get('/auditoria/logs', { params });
      setLogs(response.data || []);
    } catch (error) {
      console.error('Erro ao carregar logs:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleFilterChange = (field, value) => {
    setFiltros(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleExportExcel = () => {
    const dadosExport = logs.map(log => ({
      'ID': log.id,
      'Data/Hora': new Date(log.created_at).toLocaleString('pt-BR'),
      'Usuário': log.usuario_nome || 'N/A',
      'Email': log.usuario_email || 'N/A',
      'Tipo': log.tipo || 'N/A',
      'Módulo': log.nome_modulo || log.modulo || 'N/A',
      'IP': log.ip_address || 'N/A',
      'Detalhes': log.detalhes || 'N/A'
    }));

    exportToExcel(dadosExport, 'logs_auditoria');
  };

  const getTipoBadgeColor = (tipo) => {
    switch (tipo) {
      case 'acesso_negado':
        return '#e74c3c';
      case 'login':
        return '#3498db';
      case 'logout':
        return '#95a5a6';
      case 'alteracao':
        return '#f39c12';
      default:
        return '#7f8c8d';
    }
  };

  const getTipoLabel = (tipo) => {
    switch (tipo) {
      case 'acesso_negado':
        return 'Acesso Negado';
      case 'login':
        return 'Login';
      case 'logout':
        return 'Logout';
      case 'alteracao':
        return 'Alteração';
      default:
        return tipo || 'N/A';
    }
  };

  if (loading) {
    return (
      <div className="loading">
        <div className="loading-spinner"></div>
        <p>Carregando logs...</p>
      </div>
    );
  }

  return (
    <div className="logs-container">
      <div className="logs-header">
        <div>
          <h2>Logs de Auditoria</h2>
          <p>Registro de atividades e tentativas de acesso do sistema</p>
        </div>
        <div className="logs-header-actions">
          <button onClick={loadLogs} className="btn-secondary" title="Atualizar">
            <FiRefreshCw /> Atualizar
          </button>
          <button onClick={handleExportExcel} className="btn-secondary" title="Exportar Excel">
            <FiDownload /> Exportar Excel
          </button>
        </div>
      </div>

      <div className="logs-filters">
        <div className="filter-group">
          <FiFilter />
          <select
            value={filtros.tipo}
            onChange={(e) => handleFilterChange('tipo', e.target.value)}
            className="filter-select"
          >
            <option value="">Todos os Tipos</option>
            <option value="acesso_negado">Acesso Negado</option>
            <option value="login">Login</option>
            <option value="logout">Logout</option>
            <option value="alteracao">Alteração</option>
          </select>
        </div>

        <div className="filter-group">
          <select
            value={filtros.modulo}
            onChange={(e) => handleFilterChange('modulo', e.target.value)}
            className="filter-select"
          >
            <option value="">Todos os Módulos</option>
            <option value="comercial">Comercial</option>
            <option value="compras">Compras</option>
            <option value="financeiro">Financeiro</option>
            <option value="operacional">Operacional</option>
            <option value="administrativo">Administrativo</option>
            <option value="admin">Admin</option>
          </select>
        </div>

        <div className="filter-group">
          <input
            type="date"
            value={filtros.data_inicio}
            onChange={(e) => handleFilterChange('data_inicio', e.target.value)}
            className="filter-select"
            placeholder="Data Início"
          />
        </div>

        <div className="filter-group">
          <input
            type="date"
            value={filtros.data_fim}
            onChange={(e) => handleFilterChange('data_fim', e.target.value)}
            className="filter-select"
            placeholder="Data Fim"
          />
        </div>
      </div>

      <div className="logs-content">
        {logs.length === 0 ? (
          <div className="no-logs">
            <FiShield />
            <p>Nenhum log encontrado</p>
          </div>
        ) : (
          <div className="logs-table-container">
            <table className="logs-table">
              <thead>
                <tr>
                  <th>Data/Hora</th>
                  <th>Usuário</th>
                  <th>Tipo</th>
                  <th>Módulo</th>
                  <th>IP</th>
                  <th>Detalhes</th>
                </tr>
              </thead>
              <tbody>
                {logs.map(log => (
                  <tr key={log.id}>
                    <td>
                      {new Date(log.created_at).toLocaleString('pt-BR', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit'
                      })}
                    </td>
                    <td>
                      <div className="log-user-info">
                        <strong>{log.usuario_nome || 'N/A'}</strong>
                        <small>{log.usuario_email || ''}</small>
                      </div>
                    </td>
                    <td>
                      <span 
                        className="log-tipo-badge"
                        style={{ backgroundColor: getTipoBadgeColor(log.tipo) }}
                      >
                        {getTipoLabel(log.tipo)}
                      </span>
                    </td>
                    <td>{log.nome_modulo || log.modulo || 'N/A'}</td>
                    <td><code>{log.ip_address || 'N/A'}</code></td>
                    <td>{log.detalhes || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default Logs;

