import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { fetchFrotasDashboard } from '../../utils/frotasApi';
import {
  FiTruck, FiAlertTriangle, FiDollarSign, FiActivity, FiRefreshCw,
  FiUsers, FiTool, FiDroplet, FiFileText, FiMap, FiClipboard, FiBarChart2, FiList,
} from 'react-icons/fi';
import FrotasPageHeader from './FrotasPageHeader';
import './Frotas.css';

const QUICK_LINKS = [
  { to: '/frota/veiculos', icon: FiTruck, label: 'Veículos' },
  { to: '/frota/motoristas', icon: FiUsers, label: 'Motoristas' },
  { to: '/frota/manutencoes', icon: FiTool, label: 'Manutenções' },
  { to: '/frota/abastecimentos', icon: FiDroplet, label: 'Abastecimentos' },
  { to: '/frota/documentos', icon: FiFileText, label: 'Documentos' },
  { to: '/frota/viagens', icon: FiMap, label: 'Viagens' },
  { to: '/frota/checklists', icon: FiClipboard, label: 'Checklist Diário' },
  { to: '/frota/multas', icon: FiAlertTriangle, label: 'Multas' },
  { to: '/frota/relatorios', icon: FiBarChart2, label: 'Relatórios' },
  { to: '/frota/requisicoes-material/nova', icon: FiList, label: 'Solicitar Material' },
];

const FrotasDashboard = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async (force = false) => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchFrotasDashboard({ force });
      setData(data);
    } catch (err) {
      console.error(err);
      const status = err.response?.status;
      if (status === 403) {
        setError('Sem permissão para acessar o módulo Frota.');
      } else if (!err.response) {
        setError('Não foi possível conectar ao servidor. Verifique se o backend está rodando.');
      } else {
        setError(err.response?.data?.error || 'Erro ao carregar dashboard.');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const fmt = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

  if (loading) {
    return (
      <div className="frotas-page">
        <FrotasPageHeader title="Frota GMP" subtitle="Carregando indicadores..." />
        <div className="frotas-empty">Carregando...</div>
      </div>
    );
  }

  return (
    <div className="frotas-page">
      <FrotasPageHeader
        title="Gestão de Frota"
        subtitle="Controle de veículos, manutenções, combustível e documentação — GMP Industriais"
        actions={(
          <button type="button" className="frotas-btn frotas-btn-secondary" onClick={() => load(true)}>
            <FiRefreshCw /> Atualizar
          </button>
        )}
      />

      {error && <div className="frotas-error-banner">{error}</div>}

      <div className="frotas-quick-links">
        {QUICK_LINKS.map((l) => (
          <Link key={l.to} to={l.to} className="frotas-quick-link">
            <l.icon size={18} /> {l.label}
          </Link>
        ))}
      </div>

      <div className="frotas-kpis">
        <div className="frotas-kpi-card">
          <div className="frotas-kpi-icon primary"><FiTruck /></div>
          <div>
            <div className="frotas-kpi-value">{data?.veiculosAtivos ?? 0}</div>
            <div className="frotas-kpi-label">Veículos ativos</div>
          </div>
        </div>
        <div className="frotas-kpi-card">
          <div className="frotas-kpi-icon warning"><FiTool /></div>
          <div>
            <div className="frotas-kpi-value">{data?.veiculosManutencao ?? 0}</div>
            <div className="frotas-kpi-label">Em manutenção</div>
          </div>
        </div>
        <div className="frotas-kpi-card">
          <div className="frotas-kpi-icon danger"><FiAlertTriangle /></div>
          <div>
            <div className="frotas-kpi-value">{data?.manutencoesVencidas ?? 0}</div>
            <div className="frotas-kpi-label">Manutenção vencida</div>
          </div>
        </div>
        <div className="frotas-kpi-card">
          <div className="frotas-kpi-icon warning"><FiTool /></div>
          <div>
            <div className="frotas-kpi-value">{data?.osAbertas ?? 0}</div>
            <div className="frotas-kpi-label">OS em aberto</div>
          </div>
        </div>
        <div className="frotas-kpi-card">
          <div className="frotas-kpi-icon info"><FiDroplet /></div>
          <div>
            <div className="frotas-kpi-value">{fmt(data?.custoCombustivelMes)}</div>
            <div className="frotas-kpi-label">Combustível no mês</div>
          </div>
        </div>
        <div className="frotas-kpi-card">
          <div className="frotas-kpi-icon danger"><FiAlertTriangle /></div>
          <div>
            <div className="frotas-kpi-value">{data?.alertasCount ?? 0}</div>
            <div className="frotas-kpi-label">Alertas ativos</div>
          </div>
        </div>
        <div className="frotas-kpi-card">
          <div className="frotas-kpi-icon info"><FiDollarSign /></div>
          <div>
            <div className="frotas-kpi-value">{fmt(data?.custoTotal)}</div>
            <div className="frotas-kpi-label">Custo total acumulado</div>
          </div>
        </div>
        <div className="frotas-kpi-card">
          <div className="frotas-kpi-icon success"><FiMap /></div>
          <div>
            <div className="frotas-kpi-value">{data?.totalVeiculos ?? 0}</div>
            <div className="frotas-kpi-label">Total de veículos</div>
          </div>
        </div>
        <div className="frotas-kpi-card">
          <div className="frotas-kpi-icon primary"><FiClipboard /></div>
          <div>
            <div className="frotas-kpi-value">{data?.checklistsHoje ?? 0}</div>
            <div className="frotas-kpi-label">Checklists hoje</div>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 20 }}>
        <div className="frotas-section">
          <h2><FiAlertTriangle /> Alertas e vencimentos</h2>
          {!data?.alertas?.length ? (
            <div className="frotas-empty">Nenhum alerta no momento.</div>
          ) : (
            <div className="frotas-alert-list">
              {data.alertas.map((a, i) => (
                <div key={i} className={`frotas-alert-item ${a.severidade}`}>
                  <div>
                    <div className="frotas-alert-title">{a.titulo}</div>
                    <div className="frotas-alert-desc">{a.descricao}</div>
                    {a.dias_restantes != null && (
                      <div className="frotas-alert-desc">
                        {a.dias_restantes < 0 ? `Vencido há ${Math.abs(a.dias_restantes)} dia(s)` : `${a.dias_restantes} dia(s) restantes`}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="frotas-section">
          <h2><FiActivity /> Custos por categoria</h2>
          <div className="frotas-table-wrap">
            <table className="frotas-table">
              <tbody>
                <tr><td>Manutenções</td><td><strong>{fmt(data?.custoManutencao)}</strong></td></tr>
                <tr><td>Combustível</td><td><strong>{fmt(data?.custoCombustivel)}</strong></td></tr>
                <tr><td>Multas</td><td><strong>{fmt(data?.custoMultas)}</strong></td></tr>
                <tr><td>Documentos / Seguros</td><td><strong>{fmt(data?.custoDocumentos)}</strong></td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {data?.ultimosAbastecimentos?.length > 0 && (
        <div className="frotas-section" style={{ marginTop: 20 }}>
          <h2><FiDroplet /> Últimos abastecimentos</h2>
          <div className="frotas-table-wrap">
            <table className="frotas-table">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Placa</th>
                  <th>Litros</th>
                  <th>Valor</th>
                  <th>Posto</th>
                </tr>
              </thead>
              <tbody>
                {data.ultimosAbastecimentos.map((a) => (
                  <tr key={a.id}>
                    <td>{a.data_abastecimento}</td>
                    <td><strong>{a.placa}</strong></td>
                    <td>{a.litros} L</td>
                    <td>{fmt(a.valor_total)}</td>
                    <td>{a.posto || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default FrotasDashboard;
