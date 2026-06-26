import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { fetchProducaoDashboard } from '../../utils/producaoApi';
import {
  FiRefreshCw, FiLayers, FiActivity, FiAlertTriangle, FiCheckCircle,
  FiTool, FiClock, FiBarChart2, FiList, FiSettings, FiClipboard, FiTarget,
} from 'react-icons/fi';
import ProducaoPageHeader from './ProducaoPageHeader';
import './Producao.css';

const QUICK_LINKS = [
  { to: '/fabrica/ordens-producao', icon: FiLayers, label: 'Ordens de Produção' },
  { to: '/fabrica/apontamentos', icon: FiActivity, label: 'Apontamentos' },
  { to: '/fabrica/maquinas', icon: FiTool, label: 'Máquinas' },
  { to: '/fabrica/paradas', icon: FiAlertTriangle, label: 'Paradas' },
  { to: '/fabrica/roteiros', icon: FiTarget, label: 'Roteiros' },
  { to: '/fabrica/relatorios', icon: FiBarChart2, label: 'Relatórios' },
  { to: '/fabrica/producao-kanban', icon: FiClipboard, label: 'Kanban OS' },
  { to: '/fabrica/requisicoes-material/nova', icon: FiList, label: 'Solicitar Material' },
  { to: '/fabrica/configuracoes', icon: FiSettings, label: 'Configurações' },
];

const ProducaoDashboard = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async (force = false) => {
    setLoading(true);
    setError(null);
    try {
      setData(await fetchProducaoDashboard({ force }));
    } catch (err) {
      const status = err.response?.status;
      if (status === 403) setError('Sem permissão para acessar o módulo Produção.');
      else setError(err.response?.data?.error || 'Erro ao carregar dashboard.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <div className="producao-page">
        <ProducaoPageHeader title="Produção GMP" subtitle="Carregando indicadores..." />
        <div className="producao-empty">Carregando...</div>
      </div>
    );
  }

  const k = data?.kpis || {};

  return (
    <div className="producao-page">
      <ProducaoPageHeader
        title="Produção — Chão de Fábrica"
        subtitle="Ordens de produção, apontamentos, máquinas e OEE — GMP Industriais"
        actions={(
          <button type="button" className="producao-btn producao-btn-secondary" onClick={() => load(true)}>
            <FiRefreshCw /> Atualizar
          </button>
        )}
      />

      {error && <div className="producao-error-banner">{error}</div>}

      <div className="producao-quick-links">
        {QUICK_LINKS.map((l) => (
          <Link key={l.to} to={l.to} className="producao-quick-link">
            <l.icon size={16} /> {l.label}
          </Link>
        ))}
      </div>

      <div className="producao-kpis">
        <div className="producao-kpi-card">
          <div className="producao-kpi-icon primary"><FiLayers /></div>
          <div>
            <div className="producao-kpi-value">{k.opsAbertas ?? 0}</div>
            <div className="producao-kpi-label">OPs abertas</div>
          </div>
        </div>
        <div className="producao-kpi-card">
          <div className="producao-kpi-icon warning"><FiActivity /></div>
          <div>
            <div className="producao-kpi-value">{k.opsEmProducao ?? 0}</div>
            <div className="producao-kpi-label">Em produção</div>
          </div>
        </div>
        <div className="producao-kpi-card">
          <div className="producao-kpi-icon danger"><FiAlertTriangle /></div>
          <div>
            <div className="producao-kpi-value">{k.opsAtrasadas ?? 0}</div>
            <div className="producao-kpi-label">OPs atrasadas</div>
          </div>
        </div>
        <div className="producao-kpi-card">
          <div className="producao-kpi-icon success"><FiCheckCircle /></div>
          <div>
            <div className="producao-kpi-value">{k.opsConcluidasMes ?? 0}</div>
            <div className="producao-kpi-label">Concluídas no mês</div>
          </div>
        </div>
        <div className="producao-kpi-card">
          <div className="producao-kpi-icon info"><FiBarChart2 /></div>
          <div>
            <div className="producao-kpi-value">{k.eficiencia ?? 0}%</div>
            <div className="producao-kpi-label">Eficiência</div>
          </div>
        </div>
        <div className="producao-kpi-card">
          <div className="producao-kpi-icon primary"><FiTool /></div>
          <div>
            <div className="producao-kpi-value">{k.maquinasEmUso ?? 0}</div>
            <div className="producao-kpi-label">Máquinas em uso</div>
          </div>
        </div>
        <div className="producao-kpi-card">
          <div className="producao-kpi-icon danger"><FiClock /></div>
          <div>
            <div className="producao-kpi-value">{k.paradasHoje ?? 0}</div>
            <div className="producao-kpi-label">Paradas hoje</div>
          </div>
        </div>
        <div className="producao-kpi-card">
          <div className="producao-kpi-icon success"><FiActivity /></div>
          <div>
            <div className="producao-kpi-value">{k.oee ?? 0}%</div>
            <div className="producao-kpi-label">OEE básico</div>
          </div>
        </div>
      </div>

      <div className="producao-grid-2">
        <div className="producao-card">
          <h3>OPs em andamento</h3>
          {(data?.opsRecentes || []).length === 0 ? (
            <div className="producao-empty" style={{ padding: 24 }}>Nenhuma OP em andamento</div>
          ) : (
            <div className="producao-table-wrap">
              <table className="producao-table">
                <thead>
                  <tr>
                    <th>OP</th>
                    <th>Produto</th>
                    <th>Status</th>
                    <th>Previsto</th>
                  </tr>
                </thead>
                <tbody>
                  {data.opsRecentes.map((op) => (
                    <tr key={op.id}>
                      <td><Link to={`/fabrica/ordens-producao/editar/${op.id}`}>{op.numero_op}</Link></td>
                      <td>{op.produto_descricao}</td>
                      <td><span className={`producao-badge ${op.status === 'em_producao' ? 'warning' : 'primary'}`}>{op.status}</span></td>
                      <td>{op.data_prevista_fim || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="producao-card">
          <h3>Status das máquinas</h3>
          <div className="producao-maquinas-grid">
            {(data?.maquinasStatus || []).map((m) => (
              <div key={m.id} className="producao-maquina-chip">
                <strong>{m.codigo}</strong>
                <span>{m.nome}</span>
                <span className={`producao-badge ${m.status === 'em_producao' ? 'warning' : m.status === 'parada' ? 'danger' : 'success'}`} style={{ marginTop: 6 }}>
                  {m.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProducaoDashboard;
