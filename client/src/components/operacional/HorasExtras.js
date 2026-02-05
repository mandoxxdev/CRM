import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import { toast } from 'react-toastify';
import { FiPlus, FiSearch, FiCheckCircle, FiXCircle, FiFilter } from 'react-icons/fi';
import { SkeletonTable } from '../SkeletonLoader';
import HoraExtraForm from './HoraExtraForm';
import './Operacional.css';

const HorasExtras = () => {
  const [horasExtras, setHorasExtras] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [selectedHoraExtra, setSelectedHoraExtra] = useState(null);

  useEffect(() => {
    loadHorasExtras();
  }, [search, filterStatus]);

  const loadHorasExtras = async () => {
    try {
      setLoading(true);
      const response = await api.get('/operacional/horas-extras', {
        params: { status: filterStatus || undefined }
      });
      setHorasExtras(response.data || []);
    } catch (error) {
      console.error('Erro ao carregar horas extras:', error);
      toast.error('Erro ao carregar horas extras');
    } finally {
      setLoading(false);
    }
  };

  const handleAprovar = async (id) => {
    try {
      await api.put(`/operacional/horas-extras/${id}/aprovar`);
      toast.success('Horas extras aprovadas');
      loadHorasExtras();
    } catch (error) {
      toast.error('Erro ao aprovar horas extras');
    }
  };

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);
  };

  if (showForm) {
    return <HoraExtraForm horaExtra={selectedHoraExtra} onClose={() => { setShowForm(false); setSelectedHoraExtra(null); loadHorasExtras(); }} />;
  }

  return (
    <div className="operacional-list">
      <div className="list-header">
        <div className="search-filters">
          <div className="search-box">
            <FiSearch />
            <input type="text" placeholder="Buscar..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="filter-select">
            <option value="">Todos os status</option>
            <option value="pendente">Pendente</option>
            <option value="aprovado">Aprovado</option>
            <option value="rejeitado">Rejeitado</option>
          </select>
        </div>
        <button className="btn-primary" onClick={() => { setSelectedHoraExtra(null); setShowForm(true); }}>
          <FiPlus /> Nova Hora Extra
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
                <th>Data</th>
                <th>Horas Extras</th>
                <th>Tipo</th>
                <th>Valor Total</th>
                <th>Status</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {horasExtras.length === 0 ? (
                <tr><td colSpan="7" className="no-data">Nenhuma hora extra encontrada</td></tr>
              ) : (
                horasExtras.map((he) => (
                  <tr key={he.id}>
                    <td><strong>{he.colaborador_nome}</strong></td>
                    <td>{new Date(he.data).toLocaleDateString('pt-BR')}</td>
                    <td>{he.horas_extras}h</td>
                    <td>{he.tipo_hora_extra}</td>
                    <td>{formatCurrency(he.valor_total)}</td>
                    <td><span className={`status-badge status-${he.status}`}>{he.status}</span></td>
                    <td>
                      {he.status === 'pendente' && (
                        <button className="btn-icon" onClick={() => handleAprovar(he.id)} title="Aprovar">
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

export default HorasExtras;
