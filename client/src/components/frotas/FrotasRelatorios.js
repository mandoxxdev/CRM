import React, { useState, useEffect, useCallback } from 'react';
import api from '../../services/api';
import { FiBarChart2, FiRefreshCw } from 'react-icons/fi';
import FrotasPageHeader from './FrotasPageHeader';
import './Frotas.css';

const FrotasRelatorios = () => {
  const [custos, setCustos] = useState([]);
  const [consumo, setConsumo] = useState([]);
  const [loading, setLoading] = useState(true);
  const [periodo, setPeriodo] = useState({ data_inicio: '', data_fim: '' });

  const fmt = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (periodo.data_inicio && periodo.data_fim) {
        params.data_inicio = periodo.data_inicio;
        params.data_fim = periodo.data_fim;
      }
      const [cRes, consRes] = await Promise.all([
        api.get('/frotas/relatorios/custos-por-veiculo', { params }),
        api.get('/frotas/relatorios/consumo'),
      ]);
      setCustos(cRes.data || []);
      setConsumo(consRes.data || []);
    } catch (err) {
      console.error(err);
      setCustos([]);
      setConsumo([]);
    } finally {
      setLoading(false);
    }
  }, [periodo]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="frotas-page">
      <FrotasPageHeader
        title="Relatórios de Frota"
        subtitle="Custos por veículo e consumo médio de combustível"
        breadcrumbs={[{ label: 'Relatórios' }]}
        actions={(
          <button type="button" className="frotas-btn frotas-btn-secondary" onClick={load}>
            <FiRefreshCw /> Atualizar
          </button>
        )}
      />

      <div className="frotas-toolbar">
        <input
          type="date"
          className="frotas-filter-select"
          value={periodo.data_inicio}
          onChange={(e) => setPeriodo((p) => ({ ...p, data_inicio: e.target.value }))}
        />
        <input
          type="date"
          className="frotas-filter-select"
          value={periodo.data_fim}
          onChange={(e) => setPeriodo((p) => ({ ...p, data_fim: e.target.value }))}
        />
        <button type="button" className="frotas-btn frotas-btn-primary frotas-btn-sm" onClick={load}>Filtrar período</button>
      </div>

      {loading ? (
        <div className="frotas-empty">Carregando relatórios...</div>
      ) : (
        <>
          <div className="frotas-section">
            <h2><FiBarChart2 /> Custos por veículo</h2>
            <div className="frotas-table-wrap">
              <table className="frotas-table">
                <thead>
                  <tr>
                    <th>Placa</th>
                    <th>Modelo</th>
                    <th>Setor</th>
                    <th>Manutenção</th>
                    <th>Combustível</th>
                    <th>Multas</th>
                    <th>Total</th>
                    <th>KM atual</th>
                  </tr>
                </thead>
                <tbody>
                  {custos.length === 0 ? (
                    <tr><td colSpan={8} className="frotas-empty">Sem dados</td></tr>
                  ) : custos.map((r) => (
                    <tr key={r.id}>
                      <td><strong>{r.placa}</strong></td>
                      <td>{r.modelo || r.marca || '-'}</td>
                      <td>{r.setor_responsavel || '-'}</td>
                      <td>{fmt(r.custo_manutencao)}</td>
                      <td>{fmt(r.custo_combustivel)}</td>
                      <td>{fmt(r.custo_multas)}</td>
                      <td><strong>{fmt(r.custo_total)}</strong></td>
                      <td>{r.km_atual != null ? Number(r.km_atual).toLocaleString('pt-BR') : '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="frotas-section">
            <h2><FiBarChart2 /> Consumo médio (Km/L)</h2>
            <div className="frotas-table-wrap">
              <table className="frotas-table">
                <thead>
                  <tr>
                    <th>Placa</th>
                    <th>Consumo médio</th>
                    <th>Total litros</th>
                    <th>Total gasto</th>
                    <th>Abastecimentos</th>
                  </tr>
                </thead>
                <tbody>
                  {consumo.length === 0 ? (
                    <tr><td colSpan={5} className="frotas-empty">Sem dados de consumo calculado</td></tr>
                  ) : consumo.map((r) => (
                    <tr key={r.veiculo_id}>
                      <td><strong>{r.placa}</strong></td>
                      <td>{r.consumo_medio != null ? `${Number(r.consumo_medio).toFixed(2)} km/L` : '-'}</td>
                      <td>{Number(r.total_litros || 0).toFixed(1)} L</td>
                      <td>{fmt(r.total_gasto)}</td>
                      <td>{r.abastecimentos}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default FrotasRelatorios;
