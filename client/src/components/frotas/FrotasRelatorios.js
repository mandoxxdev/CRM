import React, { useState, useEffect, useCallback, useRef } from 'react';
import api from '../../services/api';
import { toast } from 'react-toastify';
import { FiBarChart2, FiRefreshCw, FiPrinter, FiDownload } from 'react-icons/fi';
import { baixarPlanilhaFrota, mensagemDoServidor } from '../../utils/frotasApi';
import FrotasPageHeader from './FrotasPageHeader';
import { consumoKmL, consumoLh, horas } from './frotasEntityConfigs';
import './Frotas.css';

// Frota Etapa 4 (RN-F4.12): texto do periodo aplicado. A data do <input type="date"> vem AAAA-MM-DD; vira DD/MM/AAAA pelo texto
// (sem new Date, que no fuso de Brasilia voltaria um dia).
const dataBr = (iso) => String(iso).slice(0, 10).split('-').reverse().join('/');
function textoDoPeriodo({ data_inicio: ini, data_fim: fim } = {}) {
  if (ini && fim) return `Período: ${dataBr(ini)} a ${dataBr(fim)}`;
  if (ini) return `Período: a partir de ${dataBr(ini)}`;
  if (fim) return `Período: até ${dataBr(fim)}`;
  return 'Período: tudo';
}

// Frota Etapa 4 (RN-F4.04, achado 7): a maquina mostra o horimetro em horas, o carro o km; nulo, "-".
function medicaoAtual(r) {
  if (r.tipo_medicao === 'horimetro') return r.horimetro_atual != null ? horas(r.horimetro_atual) : '-';
  return r.km_atual != null ? `${Number(r.km_atual).toLocaleString('pt-BR')} km` : '-';
}

const FrotasRelatorios = () => {
  const [custos, setCustos] = useState([]);
  const [consumo, setConsumo] = useState([]);
  const [loading, setLoading] = useState(true);
  const [periodo, setPeriodo] = useState({ data_inicio: '', data_fim: '' });
  const [exportando, setExportando] = useState(false);
  const [periodoAplicado, setPeriodoAplicado] = useState({});

  // Frota Etapa 1 (T7, RN-F1.18): a planilha no formato da que a empresa usa hoje, com o periodo desta tela.
  const exportar = async () => {
    setExportando(true);
    try {
      await baixarPlanilhaFrota(periodo);
    } catch (err) {
      toast.error(await mensagemDoServidor(err, 'Não foi possível gerar a planilha'));
    } finally {
      setExportando(false);
    }
  };

  const fmt = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

  // Frota Etapa 4 (RN-F4.12, Fase 2 achado 7): o periodo vai com o que estiver preenchido (uma data so vale: RN-F4.03), para o
  // custo E para o consumo — antes ia so com as duas datas e so para o custo, e a planilha baixava outra coisa. Os dois GET sao
  // independentes: o que falhar vira aviso e a tabela dele fica vazia; o outro fica (antes, erro virava "Sem dados" calado).
  // `carga` descarta a resposta de uma carga velha (a carga roda a cada data digitada) — o periodo mostrado e o da ultima.
  const carga = useRef(0);
  const load = useCallback(async () => {
    const minha = ++carga.current;
    setLoading(true);
    const params = {};
    if (periodo.data_inicio) params.data_inicio = periodo.data_inicio;
    if (periodo.data_fim) params.data_fim = periodo.data_fim;
    const [cRes, consRes] = await Promise.allSettled([
      api.get('/frotas/relatorios/custos-por-veiculo', { params }),
      api.get('/frotas/relatorios/consumo', { params }),
    ]);
    if (minha !== carga.current) return;
    const avisos = [];
    for (const res of [cRes, consRes]) {
      if (res.status === 'rejected') avisos.push(await mensagemDoServidor(res.reason, 'Não foi possível carregar os relatórios'));
    }
    if (minha !== carga.current) return;
    setCustos(cRes.status === 'fulfilled' ? (cRes.value.data || []) : []);
    setConsumo(consRes.status === 'fulfilled' ? (consRes.value.data || []) : []);
    setPeriodoAplicado({ ...params });
    setLoading(false);
    [...new Set(avisos)].forEach((m) => toast.error(m));
  }, [periodo]);

  const totais = custos.reduce((t, r) => ({
    manutencao: t.manutencao + Number(r.custo_manutencao || 0),
    combustivel: t.combustivel + Number(r.custo_combustivel || 0),
    multas: t.multas + Number(r.custo_multas || 0),
    total: t.total + Number(r.custo_total || 0),
  }), { manutencao: 0, combustivel: 0, multas: 0, total: 0 });

  useEffect(() => { load(); }, [load]);

  return (
    <div className="frotas-page">
      <FrotasPageHeader
        title="Relatórios de Frota"
        subtitle="Custos por veículo e consumo médio de combustível"
        breadcrumbs={[{ label: 'Relatórios' }]}
        actions={(
          <>
            <button type="button" className="frotas-btn frotas-btn-primary" onClick={exportar} disabled={exportando}>
              <FiDownload /> {exportando ? 'Gerando…' : 'Exportar planilha'}
            </button>
            <button type="button" className="frotas-btn frotas-btn-secondary" onClick={() => window.print()}>
              <FiPrinter /> Imprimir
            </button>
            <button type="button" className="frotas-btn frotas-btn-secondary" onClick={load}>
              <FiRefreshCw /> Atualizar
            </button>
          </>
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
      {/* fora da barra: a barra some na impressao (Frotas.css @media print), e o relatorio impresso precisa dizer o periodo */}
      <p className="frotas-periodo-aplicado" data-testid="periodo-aplicado">{textoDoPeriodo(periodoAplicado)}</p>

      {loading ? (
        <div className="frotas-empty">Carregando relatórios...</div>
      ) : (
        <>
          <div className="frotas-section">
            <h2><FiBarChart2 /> Custos por veículo</h2>
            <p className="frotas-nota">Multas pela data da infração (sem ela, pelo dia do lançamento); contestadas não entram.</p>
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
                    <th>KM / Horímetro</th>
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
                      <td>{medicaoAtual(r)}</td>
                    </tr>
                  ))}
                </tbody>
                {custos.length > 0 && (
                  <tfoot>
                    <tr className="frotas-total">
                      <td><strong>Total</strong></td>
                      <td />
                      <td />
                      <td><strong>{fmt(totais.manutencao)}</strong></td>
                      <td><strong>{fmt(totais.combustivel)}</strong></td>
                      <td><strong>{fmt(totais.multas)}</strong></td>
                      <td><strong>{fmt(totais.total)}</strong></td>
                      <td />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>

          <div className="frotas-section">
            <h2><FiBarChart2 /> Consumo médio</h2>
            <div className="frotas-table-wrap">
              <table className="frotas-table">
                <thead>
                  <tr>
                    <th>Placa</th>
                    <th>Km/L</th>
                    <th>L/h (máquina)</th>
                    <th>Total litros</th>
                    <th>Total gasto</th>
                    <th>Abastecimentos</th>
                  </tr>
                </thead>
                <tbody>
                  {consumo.length === 0 ? (
                    <tr><td colSpan={6} className="frotas-empty">Sem abastecimentos no período</td></tr>
                  ) : consumo.map((r) => (
                    <tr key={r.veiculo_id}>
                      <td><strong>{r.placa}</strong></td>
                      <td>{consumoKmL(r.consumo_medio)}</td>
                      <td>{consumoLh(r.consumo_litros_hora)}</td>
                      <td>{Number(r.total_litros || 0).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} L</td>
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
