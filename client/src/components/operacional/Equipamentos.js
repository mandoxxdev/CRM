import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import { toast } from 'react-toastify';
import { FiPlus, FiSearch, FiEdit, FiTrash2, FiFilter } from 'react-icons/fi';
import { SkeletonTable } from '../SkeletonLoader';
import EquipamentoForm from './EquipamentoForm';
import './Operacional.css';

const Equipamentos = () => {
  const [equipamentos, setEquipamentos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [selectedEquipamento, setSelectedEquipamento] = useState(null);

  useEffect(() => {
    loadEquipamentos();
  }, [search, filterStatus]);

  const loadEquipamentos = async () => {
    try {
      setLoading(true);
      const response = await api.get('/operacional/equipamentos', {
        params: { search, status: filterStatus }
      });
      setEquipamentos(response.data || []);
    } catch (error) {
      console.error('Erro ao carregar equipamentos:', error);
      toast.error('Erro ao carregar equipamentos');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm('Tem certeza que deseja excluir este equipamento?')) {
      try {
        await api.delete(`/operacional/equipamentos/${id}`);
        toast.success('Equipamento excluído com sucesso');
        loadEquipamentos();
      } catch (error) {
        toast.error('Erro ao excluir equipamento');
      }
    }
  };

  if (showForm) {
    return <EquipamentoForm equipamento={selectedEquipamento} onClose={() => { setShowForm(false); setSelectedEquipamento(null); loadEquipamentos(); }} />;
  }

  return (
    <div className="operacional-list">
      <div className="list-header">
        <div className="search-filters">
          <div className="search-box">
            <FiSearch />
            <input type="text" placeholder="Buscar equipamento..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="filter-select">
            <option value="">Todos os status</option>
            <option value="disponivel">Disponível</option>
            <option value="em_uso">Em Uso</option>
            <option value="manutencao">Manutenção</option>
            <option value="indisponivel">Indisponível</option>
          </select>
        </div>
        <button className="btn-primary" onClick={() => { setSelectedEquipamento(null); setShowForm(true); }}>
          <FiPlus /> Novo Equipamento
        </button>
      </div>

      {loading ? (
        <SkeletonTable rows={8} cols={7} />
      ) : (
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Código</th>
                <th>Nome</th>
                <th>Tipo</th>
                <th>Fabricante</th>
                <th>Modelo</th>
                <th>Status</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {equipamentos.length === 0 ? (
                <tr><td colSpan="7" className="no-data">Nenhum equipamento encontrado</td></tr>
              ) : (
                equipamentos.map((eq) => (
                  <tr key={eq.id}>
                    <td><strong>{eq.codigo || '-'}</strong></td>
                    <td>{eq.nome}</td>
                    <td>{eq.tipo || '-'}</td>
                    <td>{eq.fabricante || '-'}</td>
                    <td>{eq.modelo || '-'}</td>
                    <td><span className={`status-badge status-${eq.status}`}>{eq.status}</span></td>
                    <td>
                      <div className="action-buttons">
                        <button className="action-btn edit" onClick={() => { setSelectedEquipamento(eq); setShowForm(true); }} title="Editar">
                          <FiEdit />
                        </button>
                        <button className="action-btn delete" onClick={() => handleDelete(eq.id)} title="Excluir">
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

export default Equipamentos;
