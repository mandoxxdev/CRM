import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import { toast } from 'react-toastify';
import { 
  FiPlus, FiSearch, FiEdit, FiTrash2, FiFilter, 
  FiUserCheck, FiUserX, FiClock, FiTool, FiFileText,
  FiPlay, FiPause, FiCheckCircle, FiActivity, FiGrid
} from 'react-icons/fi';
import { SkeletonTable } from '../SkeletonLoader';
import ColaboradorForm from './ColaboradorForm';
import './Operacional.css';
import './Colaboradores.css';

const Colaboradores = () => {
  const [colaboradores, setColaboradores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterSetor, setFilterSetor] = useState('');
  const [filterTrabalho, setFilterTrabalho] = useState('');
  const [viewMode, setViewMode] = useState('cards'); // 'cards' ou 'table'
  const [showForm, setShowForm] = useState(false);
  const [selectedColaborador, setSelectedColaborador] = useState(null);

  useEffect(() => {
    loadColaboradores();
    const interval = setInterval(loadColaboradores, 30000); // Atualizar a cada 30s
    return () => clearInterval(interval);
  }, [search, filterStatus, filterSetor, filterTrabalho]);

  const loadColaboradores = async () => {
    try {
      setLoading(true);
      const response = await api.get('/operacional/colaboradores', {
        params: { search, status: filterStatus, setor: filterSetor }
      });
      setColaboradores(response.data || []);
    } catch (error) {
      console.error('Erro ao carregar colaboradores:', error);
      toast.error('Erro ao carregar colaboradores');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm('Tem certeza que deseja excluir este colaborador?')) {
      try {
        await api.delete(`/operacional/colaboradores/${id}`);
        toast.success('Colaborador excluído com sucesso');
        loadColaboradores();
      } catch (error) {
        toast.error('Erro ao excluir colaborador');
      }
    }
  };

  const handleToggleDisponibilidade = async (colaborador) => {
    try {
      await api.put(`/operacional/colaboradores/${colaborador.id}`, {
        ...colaborador,
        disponivel: colaborador.disponivel ? 0 : 1
      });
      toast.success('Disponibilidade atualizada');
      loadColaboradores();
    } catch (error) {
      toast.error('Erro ao atualizar disponibilidade');
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

  const getStatusColor = (status) => {
    switch (status) {
      case 'trabalhando':
        return '#4caf50';
      case 'disponivel':
        return '#2196f3';
      case 'parado':
        return '#ff9800';
      case 'ausente':
        return '#9e9e9e';
      default:
        return '#9e9e9e';
    }
  };

  const getStatusLabel = (status) => {
    switch (status) {
      case 'trabalhando':
        return 'Trabalhando';
      case 'disponivel':
        return 'Disponível';
      case 'parado':
        return 'Parado';
      case 'ausente':
        return 'Ausente';
      default:
        return 'Indefinido';
    }
  };

  const filteredColaboradores = colaboradores.filter(colab => {
    if (filterTrabalho === 'trabalhando' && colab.status_trabalho !== 'trabalhando') return false;
    if (filterTrabalho === 'disponivel' && colab.status_trabalho !== 'disponivel') return false;
    if (filterTrabalho === 'parado' && colab.status_trabalho !== 'parado') return false;
    if (filterTrabalho === 'ausente' && colab.status_trabalho !== 'ausente') return false;
    return true;
  });

  const stats = {
    trabalhando: colaboradores.filter(c => c.status_trabalho === 'trabalhando').length,
    disponivel: colaboradores.filter(c => c.status_trabalho === 'disponivel').length,
    parado: colaboradores.filter(c => c.status_trabalho === 'parado').length,
    ausente: colaboradores.filter(c => c.status_trabalho === 'ausente').length,
    total: colaboradores.length
  };

  if (showForm) {
    return <ColaboradorForm colaborador={selectedColaborador} onClose={() => { setShowForm(false); setSelectedColaborador(null); loadColaboradores(); }} />;
  }

  return (
    <div className="operacional-list colaboradores-painel">
      <div className="list-header">
        <div className="search-filters">
          <div className="search-box">
            <FiSearch />
            <input
              type="text"
              placeholder="Buscar colaborador..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="filter-select"
          >
            <option value="">Todos os status</option>
            <option value="ativo">Ativo</option>
            <option value="inativo">Inativo</option>
          </select>
          <select
            value={filterTrabalho}
            onChange={(e) => setFilterTrabalho(e.target.value)}
            className="filter-select"
          >
            <option value="">Todos</option>
            <option value="trabalhando">Trabalhando</option>
            <option value="disponivel">Disponível</option>
            <option value="parado">Parado</option>
            <option value="ausente">Ausente</option>
          </select>
          <select
            value={filterSetor}
            onChange={(e) => setFilterSetor(e.target.value)}
            className="filter-select"
          >
            <option value="">Todos os setores</option>
            {[...new Set(colaboradores.map(c => c.setor).filter(Boolean))].map(setor => (
              <option key={setor} value={setor}>{setor}</option>
            ))}
          </select>
        </div>
        <div className="header-actions">
          <div className="view-toggle">
            <button 
              className={viewMode === 'cards' ? 'active' : ''}
              onClick={() => setViewMode('cards')}
              title="Visualização em cards"
            >
              <FiGrid />
            </button>
            <button 
              className={viewMode === 'table' ? 'active' : ''}
              onClick={() => setViewMode('table')}
              title="Visualização em tabela"
            >
              <FiFileText />
            </button>
          </div>
          <button className="btn-primary" onClick={() => { setSelectedColaborador(null); setShowForm(true); }}>
            <FiPlus /> Novo Colaborador
          </button>
        </div>
      </div>

      {/* Estatísticas */}
      <div className="colaboradores-stats">
        <div className="stat-card stat-trabalhando">
          <div className="stat-icon">
            <FiActivity />
          </div>
          <div className="stat-content">
            <h3>{stats.trabalhando}</h3>
            <p>Trabalhando</p>
          </div>
        </div>
        <div className="stat-card stat-disponivel">
          <div className="stat-icon">
            <FiUserCheck />
          </div>
          <div className="stat-content">
            <h3>{stats.disponivel}</h3>
            <p>Disponível</p>
          </div>
        </div>
        <div className="stat-card stat-parado">
          <div className="stat-icon">
            <FiPause />
          </div>
          <div className="stat-content">
            <h3>{stats.parado}</h3>
            <p>Parado</p>
          </div>
        </div>
        <div className="stat-card stat-ausente">
          <div className="stat-icon">
            <FiUserX />
          </div>
          <div className="stat-content">
            <h3>{stats.ausente}</h3>
            <p>Ausente</p>
          </div>
        </div>
        <div className="stat-card stat-total">
          <div className="stat-icon">
            <FiCheckCircle />
          </div>
          <div className="stat-content">
            <h3>{stats.total}</h3>
            <p>Total</p>
          </div>
        </div>
      </div>

      {loading ? (
        <SkeletonTable rows={8} cols={8} />
      ) : viewMode === 'cards' ? (
        <div className="colaboradores-cards-grid">
          {filteredColaboradores.length === 0 ? (
            <div className="no-data">
              <p>Nenhum colaborador encontrado</p>
            </div>
          ) : (
            filteredColaboradores.map((colab) => (
              <div key={colab.id} className={`colaborador-card status-${colab.status_trabalho || 'indefinido'}`}>
                <div className="colaborador-card-header">
                  <div className="colaborador-avatar">
                    <span>{colab.nome?.charAt(0)?.toUpperCase() || '?'}</span>
                  </div>
                  <div className="colaborador-info-header">
                    <h3>{colab.nome}</h3>
                    <span className="colaborador-matricula">{colab.matricula || 'Sem matrícula'}</span>
                  </div>
                  <div 
                    className="status-indicator" 
                    style={{ backgroundColor: getStatusColor(colab.status_trabalho) }}
                    title={getStatusLabel(colab.status_trabalho)}
                  ></div>
                </div>

                <div className="colaborador-card-body">
                  {colab.atividade_atual ? (
                    <>
                      <div className="atividade-info">
                        <div className="atividade-item">
                          <FiFileText className="atividade-icon" />
                          <div>
                            <strong>OS: {colab.atividade_atual.numero_os || '-'}</strong>
                            <span>{colab.atividade_atual.item_descricao || colab.atividade_atual.descricao || 'Sem descrição'}</span>
                          </div>
                        </div>
                        
                        {colab.atividade_atual.equipamento && (
                          <div className="atividade-item">
                            <FiTool className="atividade-icon" />
                            <div>
                              <strong>Equipamento</strong>
                              <span>{colab.atividade_atual.equipamento}</span>
                            </div>
                          </div>
                        )}

                        {colab.atividade_atual.etapa && (
                          <div className="atividade-item">
                            <FiActivity className="atividade-icon" />
                            <div>
                              <strong>Etapa</strong>
                              <span>{colab.atividade_atual.etapa}</span>
                            </div>
                          </div>
                        )}

                        <div className="atividade-item tempo">
                          <FiClock className="atividade-icon" />
                          <div>
                            <strong>Tempo decorrido</strong>
                            <span>{colab.atividade_atual.tempo_decorrido}</span>
                          </div>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="sem-atividade">
                      <p>{getStatusLabel(colab.status_trabalho)}</p>
                      {colab.status_trabalho === 'disponivel' && (
                        <span className="disponivel-badge">Pronto para trabalhar</span>
                      )}
                    </div>
                  )}
                </div>

                <div className="colaborador-card-footer">
                  <div className="colaborador-meta">
                    <span className="colaborador-cargo">{colab.cargo || '-'}</span>
                    <span className="colaborador-setor">{colab.setor || '-'}</span>
                  </div>
                  <div className="colaborador-actions">
                    <button 
                      className={`btn-icon ${colab.disponivel ? 'available' : 'unavailable'}`}
                      onClick={() => handleToggleDisponibilidade(colab)}
                      title={colab.disponivel ? 'Disponível' : 'Indisponível'}
                    >
                      {colab.disponivel ? <FiUserCheck /> : <FiUserX />}
                    </button>
                    <button 
                      className="action-btn edit" 
                      onClick={() => { setSelectedColaborador(colab); setShowForm(true); }} 
                      title="Editar"
                    >
                      <FiEdit />
                    </button>
                    <button 
                      className="action-btn delete" 
                      onClick={() => handleDelete(colab.id)} 
                      title="Excluir"
                    >
                      <FiTrash2 />
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      ) : (
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Nome</th>
                <th>Matrícula</th>
                <th>Cargo</th>
                <th>Setor</th>
                <th>Status</th>
                <th>Trabalhando em</th>
                <th>Equipamento</th>
                <th>Tempo</th>
                <th>Disponível</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {filteredColaboradores.map((colab) => (
                <tr key={colab.id}>
                  <td><strong>{colab.nome}</strong></td>
                  <td>{colab.matricula || '-'}</td>
                  <td>{colab.cargo || '-'}</td>
                  <td>{colab.setor || '-'}</td>
                  <td>
                    <span 
                      className="status-badge" 
                      style={{ backgroundColor: getStatusColor(colab.status_trabalho) }}
                    >
                      {getStatusLabel(colab.status_trabalho)}
                    </span>
                  </td>
                  <td>
                    {colab.atividade_atual ? (
                      <div>
                        <strong>OS: {colab.atividade_atual.numero_os}</strong>
                        <br />
                        <small>{colab.atividade_atual.item_descricao || colab.atividade_atual.descricao}</small>
                      </div>
                    ) : (
                      '-'
                    )}
                  </td>
                  <td>{colab.atividade_atual?.equipamento || '-'}</td>
                  <td>{colab.atividade_atual?.tempo_decorrido || '-'}</td>
                  <td>
                    <button
                      className={`btn-icon ${colab.disponivel ? 'available' : 'unavailable'}`}
                      onClick={() => handleToggleDisponibilidade(colab)}
                      title={colab.disponivel ? 'Disponível' : 'Indisponível'}
                    >
                      {colab.disponivel ? <FiUserCheck /> : <FiUserX />}
                    </button>
                  </td>
                  <td>
                    <div className="action-buttons">
                      <button className="action-btn edit" onClick={() => { setSelectedColaborador(colab); setShowForm(true); }} title="Editar">
                        <FiEdit />
                      </button>
                      <button className="action-btn delete" onClick={() => handleDelete(colab.id)} title="Excluir">
                        <FiTrash2 />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default Colaboradores;
