import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api';
import { toast } from 'react-toastify';
import { FiPlus, FiSearch, FiEdit, FiTrash2, FiFilter, FiEye } from 'react-icons/fi';
import { SkeletonTable } from '../SkeletonLoader';
import OSForm from './OSForm';
import './Operacional.css';

const OrdensServico = () => {
  const navigate = useNavigate();
  const [ordensServico, setOrdensServico] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterPrioridade, setFilterPrioridade] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [selectedOS, setSelectedOS] = useState(null);

  useEffect(() => {
    loadOS();
  }, [search, filterStatus, filterPrioridade]);

  const loadOS = async () => {
    try {
      setLoading(true);
      const response = await api.get('/operacional/ordens-servico', {
        params: { search, status: filterStatus, prioridade: filterPrioridade }
      });
      setOrdensServico(response.data || []);
    } catch (error) {
      console.error('Erro ao carregar OS:', error);
      toast.error('Erro ao carregar ordens de serviço');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm('Tem certeza que deseja excluir esta OS?')) {
      try {
        await api.delete(`/operacional/ordens-servico/${id}`);
        toast.success('OS excluída com sucesso');
        loadOS();
      } catch (error) {
        toast.error('Erro ao excluir OS');
      }
    }
  };

  const handleEdit = (os) => {
    setSelectedOS(os);
    setShowForm(true);
  };

  const handleNew = () => {
    setSelectedOS(null);
    setShowForm(true);
  };

  const handleFormClose = () => {
    setShowForm(false);
    setSelectedOS(null);
    loadOS();
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

  if (showForm) {
    return <OSForm os={selectedOS} onClose={handleFormClose} />;
  }

  return (
    <div className="operacional-list">
      <div className="list-header">
        <div className="search-filters">
          <div className="search-box">
            <FiSearch />
            <input
              type="text"
              placeholder="Buscar por número OS, descrição..."
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
            <option value="pendente">Pendente</option>
            <option value="em_andamento">Em Andamento</option>
            <option value="concluido">Concluído</option>
            <option value="cancelado">Cancelado</option>
          </select>
          <select
            value={filterPrioridade}
            onChange={(e) => setFilterPrioridade(e.target.value)}
            className="filter-select"
          >
            <option value="">Todas as prioridades</option>
            <option value="baixa">Baixa</option>
            <option value="normal">Normal</option>
            <option value="alta">Alta</option>
            <option value="urgente">Urgente</option>
          </select>
        </div>
        <button className="btn-primary" onClick={handleNew}>
          <FiPlus /> Nova OS
        </button>
      </div>

      {loading ? (
        <SkeletonTable rows={8} cols={8} />
      ) : (
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Número OS</th>
                <th>Cliente</th>
                <th>Proposta</th>
                <th>Tipo</th>
                <th>Prioridade</th>
                <th>Status</th>
                <th>Data Abertura</th>
                <th>Data Prevista</th>
                <th>Valor Total</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {ordensServico.length === 0 ? (
                <tr>
                  <td colSpan="10" className="no-data">
                    Nenhuma ordem de serviço encontrada
                  </td>
                </tr>
              ) : (
                ordensServico.map((os) => (
                  <tr key={os.id}>
                    <td><strong>{os.numero_os}</strong></td>
                    <td>{os.cliente_nome || '-'}</td>
                    <td>
                      {os.proposta_numero ? (
                        <span style={{ 
                          display: 'inline-block',
                          padding: '4px 8px',
                          background: '#e0f2fe',
                          color: '#0369a1',
                          borderRadius: '4px',
                          fontSize: '12px',
                          fontWeight: '500'
                        }}>
                          {os.proposta_numero}
                        </span>
                      ) : (
                        '-'
                      )}
                    </td>
                    <td>{os.tipo_os || '-'}</td>
                    <td>
                      <span className={`priority-badge priority-${os.prioridade || 'normal'}`}>
                        {os.prioridade || 'Normal'}
                      </span>
                    </td>
                    <td>
                      <span className={`status-badge status-${os.status}`}>
                        {os.status}
                      </span>
                    </td>
                    <td>{formatDate(os.data_abertura)}</td>
                    <td>{formatDate(os.data_prevista)}</td>
                    <td>{formatCurrency(os.valor_total)}</td>
                    <td>
                      <div className="action-buttons">
                        <button
                          className="action-btn edit"
                          onClick={() => handleEdit(os)}
                          title="Editar"
                        >
                          <FiEdit />
                        </button>
                        <button
                          className="action-btn delete"
                          onClick={() => handleDelete(os.id)}
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
        </div>
      )}
    </div>
  );
};

export default OrdensServico;
