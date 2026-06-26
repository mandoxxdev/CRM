import React, { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../../services/api';
import { fetchProducaoMeta, STATUS_OP_LABELS, statusOpClass, invalidateProducaoDashboardCache } from '../../utils/producaoApi';
import { toast } from 'react-toastify';
import { FiPlus, FiSearch, FiEdit, FiTrash2, FiPlay, FiCheck } from 'react-icons/fi';
import ProducaoPageHeader from './ProducaoPageHeader';
import './Producao.css';

const OrdensProducao = () => {
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filtroStatus, setFiltroStatus] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (search) params.search = search;
      if (filtroStatus) params.status = filtroStatus;
      const [res, m] = await Promise.all([
        api.get('/producao/ops', { params }),
        fetchProducaoMeta().catch(() => null),
      ]);
      setRows(res.data || []);
      setMeta(m);
    } catch (e) {
      toast.error(e.response?.data?.error || 'Erro ao carregar OPs');
    } finally {
      setLoading(false);
    }
  }, [search, filtroStatus]);

  useEffect(() => { load(); }, [load]);

  const mudarStatus = async (id, status) => {
    try {
      await api.post(`/producao/ops/${id}/status`, { status });
      toast.success(`Status alterado para ${STATUS_OP_LABELS[status] || status}`);
      invalidateProducaoDashboardCache();
      load();
    } catch (e) {
      toast.error(e.response?.data?.error || 'Erro ao alterar status');
    }
  };

  const excluir = async (id) => {
    if (!window.confirm('Confirma exclusão desta OP?')) return;
    try {
      await api.delete(`/producao/ops/${id}`);
      toast.success('OP excluída');
      invalidateProducaoDashboardCache();
      load();
    } catch (e) {
      toast.error(e.response?.data?.error || 'Erro ao excluir');
    }
  };

  return (
    <div className="producao-page">
      <ProducaoPageHeader
        title="Ordens de Produção"
        subtitle="Planejamento e acompanhamento de OPs — GMP Industriais"
        actions={(
          <button type="button" className="producao-btn producao-btn-primary" onClick={() => navigate('/fabrica/ordens-producao/nova')}>
            <FiPlus /> Nova OP
          </button>
        )}
      />

      <div className="producao-toolbar">
        <div className="producao-search">
          <FiSearch />
          <input placeholder="Buscar OP, produto, cliente..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <select value={filtroStatus} onChange={(e) => setFiltroStatus(e.target.value)}>
          <option value="">Todos os status</option>
          {(meta?.statusOp || []).map((s) => (
            <option key={s} value={s}>{STATUS_OP_LABELS[s] || s}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="producao-empty">Carregando...</div>
      ) : rows.length === 0 ? (
        <div className="producao-empty">Nenhuma ordem de produção encontrada</div>
      ) : (
        <div className="producao-table-wrap">
          <table className="producao-table">
            <thead>
              <tr>
                <th>OP</th>
                <th>Produto</th>
                <th>Qtd</th>
                <th>Máquina</th>
                <th>Prioridade</th>
                <th>Status</th>
                <th>Previsto</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((op) => (
                <tr key={op.id}>
                  <td><strong>{op.numero_op}</strong></td>
                  <td>
                    <div>{op.produto_descricao}</div>
                    {op.produto_codigo && <small style={{ color: 'var(--gmp-text-light)' }}>{op.produto_codigo}</small>}
                  </td>
                  <td>{op.quantidade_produzida}/{op.quantidade_planejada}</td>
                  <td>{op.maquina_codigo || '—'}</td>
                  <td><span className={`producao-badge ${op.prioridade === 'urgente' ? 'danger' : op.prioridade === 'alta' ? 'warning' : 'muted'}`}>{op.prioridade}</span></td>
                  <td><span className={`producao-badge ${statusOpClass(op.status)}`}>{STATUS_OP_LABELS[op.status] || op.status}</span></td>
                  <td>{op.data_prevista_fim || '—'}</td>
                  <td>
                    <div className="producao-actions">
                      <button type="button" className="producao-icon-btn" title="Editar" onClick={() => navigate(`/fabrica/ordens-producao/editar/${op.id}`)}>
                        <FiEdit />
                      </button>
                      {op.status === 'planejada' && (
                        <button type="button" className="producao-icon-btn" title="Liberar" onClick={() => mudarStatus(op.id, 'liberada')}>
                          <FiPlay />
                        </button>
                      )}
                      {(op.status === 'liberada' || op.status === 'em_producao') && (
                        <button type="button" className="producao-icon-btn" title="Concluir" onClick={() => mudarStatus(op.id, 'concluida')}>
                          <FiCheck />
                        </button>
                      )}
                      <button type="button" className="producao-icon-btn" title="Excluir" onClick={() => excluir(op.id)}>
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

export default OrdensProducao;
