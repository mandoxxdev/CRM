import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import useUltimoPedido from '../../hooks/useUltimoPedido';
import { toast } from 'react-toastify';
import { FiPlus, FiSearch, FiCheckCircle, FiXCircle, FiFilter } from 'react-icons/fi';
import { SkeletonTable } from '../SkeletonLoader';
import HoraExtraForm from './HoraExtraForm';
import { casaBusca } from '../../utils/buscaNoNavegador';
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
  // Etapa 160 (RN-160.05, C394): a busca filtra no navegador (abaixo) — digitar nao recarrega a lista
  }, [filterStatus]);

  // Etapa 161 (RN-161.01, C396): so o ULTIMO pedido mexe na lista — a resposta, o erro (o aviso) e o fim do carregando de um pedido
  // anterior (o filtro velho; tambem quem recarrega depois de aprovar ou salvar) sao descartados; o descarte e return, nunca erro
  const novoPedido = useUltimoPedido();
  const loadHorasExtras = async () => {
    const ehUltimo = novoPedido();
    try {
      setLoading(true);
      const response = await api.get('/operacional/horas-extras', {
        params: { status: filterStatus || undefined }
      });
      if (!ehUltimo()) return;
      setHorasExtras(response.data || []);
    } catch (error) {
      if (!ehUltimo()) return;
      console.error('Erro ao carregar horas extras:', error);
      toast.error('Erro ao carregar horas extras');
    } finally {
      if (ehUltimo()) setLoading(false);
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

  // Etapa 160 (RN-160.05, C394): a caixa Buscar nao ia a lugar nenhum — filtra a lista carregada nas colunas mostradas
  const visiveis = horasExtras.filter((he) => casaBusca(search, he.colaborador_nome, he.tipo_hora_extra));

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
              {visiveis.length === 0 ? (
                <tr><td colSpan="7" className="no-data">Nenhuma hora extra encontrada</td></tr>
              ) : (
                visiveis.map((he) => (
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
