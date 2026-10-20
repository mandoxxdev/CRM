import React, { useState, useEffect, useCallback } from 'react';
import api from '../../services/api';
import { toast } from 'react-toastify';
import { FiRefreshCw } from 'react-icons/fi';
import ProducaoPageHeader from './ProducaoPageHeader';
import './Producao.css';
import { hojeLocalISO, inicioDoMesLocalISO } from '../../utils/dataLocal';
import useUltimoPedido from '../../hooks/useUltimoPedido';

const RelatoriosProducao = () => {
  // Etapa 161 (RN-161.05, C397): o periodo padrao e o do mes LOCAL — o toISOString dava o fim no dia UTC (depois das 21h, amanha) e o
  // inicio so dava certo por acaso (meia-noite local em UTC-3 ainda e o mesmo dia em UTC)
  const [dataInicio, setDataInicio] = useState(() => inicioDoMesLocalISO());
  const [dataFim, setDataFim] = useState(() => hojeLocalISO());
  const [aba, setAba] = useState('producao');
  const [dados, setDados] = useState(null);
  const [loading, setLoading] = useState(false);

  // Etapa 161 (RN-161.01, C396): as tres abas guardam a resposta num estado so — so o ULTIMO pedido mexe na tela (a resposta, o erro e o
  // fim do carregando de um pedido anterior sao descartados); senao a resposta da aba velha seria desenhada pela nova
  const novoPedido = useUltimoPedido();
  const load = useCallback(async () => {
    const ehUltimo = novoPedido();
    setLoading(true);
    try {
      const params = { data_inicio: dataInicio, data_fim: dataFim };
      const endpoints = {
        producao: '/producao/relatorios/producao',
        eficiencia: '/producao/relatorios/eficiencia',
        paradas: '/producao/relatorios/paradas',
      };
      const { data } = await api.get(endpoints[aba], { params });
      if (!ehUltimo()) return;
      setDados(data);
    } catch (e) {
      if (!ehUltimo()) return;
      toast.error(e.response?.data?.error || 'Erro ao carregar relatório');
      setDados(null);
    } finally {
      if (ehUltimo()) setLoading(false);
    }
  }, [aba, dataInicio, dataFim, novoPedido]);

  // A troca de aba invalida o que esta em voo e ZERA os dados: ate o pedido da aba nova chegar, ela nao desenha a resposta da anterior
  const trocarAba = (nova) => {
    if (nova === aba) return;
    novoPedido();
    setDados(null);
    setAba(nova);
  };

  useEffect(() => { load(); }, [load]);

  return (
    <div className="producao-page">
      <ProducaoPageHeader
        title="Relatórios de Produção"
        subtitle="Produção por período, eficiência e paradas"
        actions={(
          <button type="button" className="producao-btn producao-btn-secondary" onClick={load}>
            <FiRefreshCw /> Atualizar
          </button>
        )}
      />

      <div className="producao-toolbar">
        <input type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} />
        <span>até</span>
        <input type="date" value={dataFim} onChange={(e) => setDataFim(e.target.value)} />
        <div style={{ display: 'flex', gap: 8 }}>
          {[
            { id: 'producao', label: 'Produção' },
            { id: 'eficiencia', label: 'Eficiência' },
            { id: 'paradas', label: 'Paradas' },
          ].map((t) => (
            <button
              key={t.id}
              type="button"
              className={`producao-btn producao-btn-sm ${aba === t.id ? 'producao-btn-primary' : 'producao-btn-secondary'}`}
              onClick={() => trocarAba(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? <div className="producao-empty">Carregando...</div> : !dados ? (
        <div className="producao-empty">Sem dados para o período</div>
      ) : (
        <>
          {aba === 'producao' && (
            <div className="producao-grid-2">
              <div className="producao-card">
                <h3>Produção por dia</h3>
                <div className="producao-table-wrap">
                  <table className="producao-table">
                    <thead><tr><th>Dia</th><th>Produzido</th><th>Refugo</th><th>Apont.</th></tr></thead>
                    <tbody>
                      {(dados.porDia || []).map((r) => (
                        <tr key={r.dia}><td>{r.dia}</td><td>{r.produzido}</td><td>{r.refugo}</td><td>{r.apontamentos}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <div className="producao-card">
                <h3>OPs no período</h3>
                <div className="producao-table-wrap">
                  <table className="producao-table">
                    <thead><tr><th>OP</th><th>Produto</th><th>Plan.</th><th>Prod.</th><th>Status</th></tr></thead>
                    <tbody>
                      {(dados.porOp || []).map((r) => (
                        <tr key={r.numero_op}>
                          <td>{r.numero_op}</td><td>{r.produto_descricao}</td>
                          <td>{r.quantidade_planejada}</td><td>{r.quantidade_produzida}</td>
                          <td><span className="producao-badge info">{r.status}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {aba === 'eficiencia' && (
            <div className="producao-card">
              <h3>Eficiência média: {dados.mediaEficiencia ?? 0}%</h3>
              <div className="producao-table-wrap">
                <table className="producao-table">
                  <thead><tr><th>OP</th><th>Produto</th><th>Planejado</th><th>Produzido</th><th>Refugo</th><th>Eficiência</th></tr></thead>
                  <tbody>
                    {(dados.ops || []).map((r) => (
                      <tr key={r.numero_op}>
                        <td>{r.numero_op}</td><td>{r.produto_descricao}</td>
                        <td>{r.quantidade_planejada}</td><td>{r.quantidade_produzida}</td><td>{r.quantidade_refugo}</td>
                        <td><span className={`producao-badge ${r.eficiencia_pct >= 90 ? 'success' : r.eficiencia_pct >= 70 ? 'warning' : 'danger'}`}>{r.eficiencia_pct}%</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {aba === 'paradas' && (
            <div className="producao-grid-2">
              <div className="producao-card">
                <h3>Por motivo</h3>
                <div className="producao-table-wrap">
                  <table className="producao-table">
                    <thead><tr><th>Motivo</th><th>Ocorrências</th><th>Minutos</th></tr></thead>
                    <tbody>
                      {(dados.porMotivo || []).map((r, i) => (
                        <tr key={i}><td>{r.motivo}</td><td>{r.ocorrencias}</td><td>{Math.round(r.minutos)}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <div className="producao-card">
                <h3>Por máquina</h3>
                <div className="producao-table-wrap">
                  <table className="producao-table">
                    <thead><tr><th>Máquina</th><th>Ocorrências</th><th>Minutos</th></tr></thead>
                    <tbody>
                      {(dados.porMaquina || []).map((r, i) => (
                        <tr key={i}><td>{r.codigo} — {r.nome}</td><td>{r.ocorrencias}</td><td>{Math.round(r.minutos)}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default RelatoriosProducao;
