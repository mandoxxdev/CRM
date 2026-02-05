import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import { toast } from 'react-toastify';
import { FiPlus, FiSearch, FiFilter, FiPlay, FiCheckCircle, FiClock } from 'react-icons/fi';
import { SkeletonTable } from '../SkeletonLoader';
import AtividadeForm from './AtividadeForm';
import './Operacional.css';

const AtividadesColaboradores = () => {
  const [atividades, setAtividades] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [selectedAtividade, setSelectedAtividade] = useState(null);

  useEffect(() => {
    loadAtividades();
    const interval = setInterval(loadAtividades, 30000); // Atualizar a cada 30s
    return () => clearInterval(interval);
  }, [search, filterStatus]);

  const loadAtividades = async () => {
    try {
      setLoading(true);
      const response = await api.get('/operacional/atividades-colaboradores', {
        params: { status: filterStatus || undefined }
      });
      setAtividades(response.data || []);
    } catch (error) {
      console.error('Erro ao carregar atividades:', error);
      toast.error('Erro ao carregar atividades');
    } finally {
      setLoading(false);
    }
  };

  const handleFinalizar = async (atividade) => {
    try {
      await api.put(`/operacional/atividades-colaboradores/${atividade.id}`, {
        ...atividade,
        status: 'concluida',
        data_fim: new Date().toISOString()
      });
      toast.success('Atividade finalizada');
      loadAtividades();
    } catch (error) {
      toast.error('Erro ao finalizar atividade');
    }
  };

  const formatDate = (date) => {
    if (!date) return '-';
    return new Date(date).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  };

  if (showForm) {
    return <AtividadeForm atividade={selectedAtividade} onClose={() => { setShowForm(false); setSelectedAtividade(null); loadAtividades(); }} />;
  }

  return (
    <div className="operacional-list">
      <div className="list-header">
        <div className="search-filters">
          <div className="search-box">
            <FiSearch />
            <input type="text" placeholder="Buscar atividade..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="filter-select">
            <option value="">Todas</option>
            <option value="em_andamento">Em Andamento</option>
            <option value="concluida">Concluída</option>
            <option value="cancelada">Cancelada</option>
          </select>
        </div>
        <button className="btn-primary" onClick={() => { setSelectedAtividade(null); setShowForm(true); }}>
          <FiPlus /> Nova Atividade
        </button>
      </div>

      {loading ? (
        <SkeletonTable rows={8} cols={7} />
      ) : (
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Colaborador</th>
                <th>Tipo</th>
                <th>Descrição</th>
                <th>OS</th>
                <th>Status</th>
                <th>Início</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {atividades.length === 0 ? (
                <tr><td colSpan="7" className="no-data">Nenhuma atividade encontrada</td></tr>
              ) : (
                atividades.map((atividade) => (
                  <tr key={atividade.id}>
                    <td><strong>{atividade.colaborador_nome}</strong></td>
                    <td>{atividade.tipo_atividade}</td>
                    <td>{atividade.descricao || '-'}</td>
                    <td>{atividade.numero_os || '-'}</td>
                    <td><span className={`status-badge status-${atividade.status}`}>{atividade.status}</span></td>
                    <td>{formatDate(atividade.data_inicio)}</td>
                    <td>
                      {atividade.status === 'em_andamento' && (
                        <button className="btn-icon" onClick={() => handleFinalizar(atividade)} title="Finalizar">
                          <FiCheckCircle />
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default AtividadesColaboradores;
