import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';
import { FiPackage, FiAlertTriangle, FiDollarSign, FiActivity, FiArrowRight, FiRefreshCw, FiClock, FiAlertOctagon, FiFileText, FiCheckCircle, FiLayers, FiClipboard, FiMap, FiSettings, FiTruck } from 'react-icons/fi';
import './Almoxarifado.css';

const STATUS_REQ = {
  PENDENTE: 'Pendente',
  APROVADO: 'Aprovado',
  EM_SEPARACAO: 'Em Separação',
};

const getPeriodDates = (days) => {
  const fim = new Date();
  const inicio = new Date();
  inicio.setDate(inicio.getDate() - days);
  return {
    data_inicio: inicio.toISOString().slice(0, 10),
    data_fim: fim.toISOString().slice(0, 10),
  };
};

const aggregateConsumoPorOS = (rows) => {
  const map = {};
  (rows || []).forEach((r) => {
    const key = r.os_id != null && r.os_id !== '' ? String(r.os_id) : 'Sem O.S.';
    map[key] = (map[key] || 0) + (r.total_consumido || 0);
  });
  return Object.entries(map)
    .map(([os_id, total]) => ({ os_id, total }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 10);
};

const AlmoxarifadoDashboard = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [stats, setStats] = useState(null);
  const [requisicoes, setRequisicoes] = useState(null);
  const [consumoOs, setConsumoOs] = useState([]);
  const [materiaisConsumidos, setMateriaisConsumidos] = useState([]);
  const [periodoDias, setPeriodoDias] = useState(30);
  const [loading, setLoading] = useState(true);
  const relatoriosCarregados = useRef(false);

  const loadRelatorios = useCallback(async (dias) => {
    const { data_inicio, data_fim } = getPeriodDates(dias);
    const params = { data_inicio, data_fim };
    const [consumoRes, materiaisRes] = await Promise.all([
      api.get('/almoxarifado/relatorios/consumo-os', { params }).catch(() => ({ data: [] })),
      api.get('/almoxarifado/relatorios/materiais-mais-consumidos', { params }).catch(() => ({ data: [] })),
    ]);
    setConsumoOs(aggregateConsumoPorOS(consumoRes.data));
    setMateriaisConsumidos(materiaisRes.data || []);
  }, []);

  const loadDashboard = async () => {
    setLoading(true);
    try {
      const [dashRes, reqRes] = await Promise.all([
        api.get('/almoxarifado/dashboard'),
        api.get('/almoxarifado/dashboard/requisicoes').catch(() => ({ data: null })),
      ]);
      setStats(dashRes.data);
      setRequisicoes(reqRes.data);
      await loadRelatorios(periodoDias);
      relatoriosCarregados.current = true;
    } catch (err) {
      console.error('Erro ao carregar dashboard do almoxarifado:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!relatoriosCarregados.current) return;
    loadRelatorios(periodoDias);
  }, [periodoDias, loadRelatorios]);

  const formatCurrency = (v) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

  const tipoLabel = (tipo) => {
    const map = { ENTRADA: 'Entrada', SAIDA: 'Saída', AJUSTE: 'Ajuste', DEVOLUCAO: 'Devolução' };
    return map[tipo] || tipo;
  };

  const getStatusMaterial = (m) => {
    if (!m.quantidade_minima || m.quantidade_minima === 0) return null;
    if (m.quantidade_atual === 0) return 'zerado';
    if (m.quantidade_atual <= m.quantidade_minima) return 'critico';
    return null;
  };

  if (loading) {
    return (
      <div className="almox-page">
        <div className="almox-loading">
          <FiRefreshCw style={{ animation: 'spin 1s linear infinite' }} size={20} />
          <span>Carregando dashboard...</span>
        </div>
      </div>
    );
  }

  if (!stats) return null;

  return (
    <div className="almox-page">
      <div className="almox-header">
        <div>
          <h1>Almoxarifado</h1>
          <p>Visão geral do estoque e movimentações</p>
        </div>
        <div className="almox-header-actions">
          <button className="btn-almox-secondary" onClick={loadDashboard}>
            <FiRefreshCw size={14} /> Atualizar
          </button>
          <Link to="/almoxarifado/movimentacoes/novo" className="btn-almox-primary">
            <FiActivity size={14} /> Nova Movimentação
          </Link>
          <Link to="/almoxarifado/materiais/novo" className="btn-almox-primary">
            <FiPackage size={14} /> Novo Material
          </Link>
          <Link to="/almoxarifado/requisicoes/nova" className="btn-almox-primary">
            <FiClock size={14} /> Nova Requisição
          </Link>
        </div>
      </div>

      {/* Ações rápidas */}
      <div className="almox-quick-actions">
        <Link to="/almoxarifado/materiais/novo" className="almox-quick-action">
          <span className="almox-quick-action-icon"><FiPackage /></span>
          <span className="almox-quick-action-label">Novo Material</span>
        </Link>
        <Link to="/almoxarifado/requisicoes/nova" className="almox-quick-action">
          <span className="almox-quick-action-icon"><FiClipboard /></span>
          <span className="almox-quick-action-label">Nova Requisição</span>
        </Link>
        <Link to="/almoxarifado/recebimentos" className="almox-quick-action">
          <span className="almox-quick-action-icon"><FiTruck /></span>
          <span className="almox-quick-action-label">Recebimentos</span>
        </Link>
        <Link to="/almoxarifado/movimentacoes/novo" className="almox-quick-action">
          <span className="almox-quick-action-icon"><FiActivity /></span>
          <span className="almox-quick-action-label">Movimentação</span>
        </Link>
        <Link to="/almoxarifado/requisicoes?status=PENDENTE" className="almox-quick-action">
          <span className="almox-quick-action-icon"><FiClock /></span>
          <span className="almox-quick-action-label">Pendentes</span>
        </Link>
        <Link to="/almoxarifado/materiais?status=critico" className="almox-quick-action">
          <span className="almox-quick-action-icon"><FiAlertTriangle /></span>
          <span className="almox-quick-action-label">Estoque Crítico</span>
        </Link>
        <Link to="/almoxarifado/mapa" className="almox-quick-action">
          <span className="almox-quick-action-icon"><FiMap /></span>
          <span className="almox-quick-action-label">Mapa de Áreas</span>
        </Link>
        {isAdmin && (
          <Link to="/almoxarifado/configuracoes" className="almox-quick-action">
            <span className="almox-quick-action-icon"><FiSettings /></span>
            <span className="almox-quick-action-label">Configurações</span>
          </Link>
        )}
      </div>

      {/* KPIs */}
      <div className="almox-kpis">
        <div className="almox-kpi-card">
          <div className="almox-kpi-icon primary"><FiPackage /></div>
          <div className="almox-kpi-info">
            <div className="almox-kpi-value">{stats.totalMateriais}</div>
            <div className="almox-kpi-label">Materiais Ativos</div>
          </div>
        </div>
        <div className="almox-kpi-card">
          <div className="almox-kpi-icon danger"><FiAlertTriangle /></div>
          <div className="almox-kpi-info">
            <div className="almox-kpi-value">{stats.materiaisCriticos}</div>
            <div className="almox-kpi-label">Estoque Crítico</div>
          </div>
        </div>
        <div className="almox-kpi-card">
          <div className="almox-kpi-icon warning"><FiPackage /></div>
          <div className="almox-kpi-info">
            <div className="almox-kpi-value">{stats.materiaisZerados}</div>
            <div className="almox-kpi-label">Zerados</div>
          </div>
        </div>
        <div className="almox-kpi-card">
          <div className="almox-kpi-icon success"><FiDollarSign /></div>
          <div className="almox-kpi-info">
            <div className="almox-kpi-value" style={{ fontSize: '1.2rem' }}>{formatCurrency(stats.valorTotalEstoque)}</div>
            <div className="almox-kpi-label">Valor em Estoque</div>
          </div>
        </div>
        <div className="almox-kpi-card">
          <div className="almox-kpi-icon purple"><FiActivity /></div>
          <div className="almox-kpi-info">
            <div className="almox-kpi-value">{stats.movimentacoesHoje}</div>
            <div className="almox-kpi-label">Movimentações Hoje</div>
          </div>
        </div>
        {requisicoes && (
          <>
            <div className="almox-kpi-card">
              <div className="almox-kpi-icon warning"><FiClock /></div>
              <div className="almox-kpi-info">
                <div className="almox-kpi-value">{requisicoes.requisicoesPendentes}</div>
                <div className="almox-kpi-label">Pendentes de aprovação</div>
              </div>
            </div>
            <div className="almox-kpi-card">
              <div className="almox-kpi-icon danger"><FiAlertOctagon /></div>
              <div className="almox-kpi-info">
                <div className="almox-kpi-value">{requisicoes.requisicoesUrgentes}</div>
                <div className="almox-kpi-label">Req. Urgentes</div>
              </div>
            </div>
            <div className="almox-kpi-card">
              <div className="almox-kpi-icon primary"><FiFileText /></div>
              <div className="almox-kpi-info">
                <div className="almox-kpi-value">{requisicoes.requisicoesEmitidas}</div>
                <div className="almox-kpi-label">Requisições emitidas</div>
              </div>
            </div>
            <div className="almox-kpi-card">
              <div className="almox-kpi-icon success"><FiCheckCircle /></div>
              <div className="almox-kpi-info">
                <div className="almox-kpi-value">{requisicoes.requisicoesEncerradas}</div>
                <div className="almox-kpi-label">Requisições encerradas</div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Grid principal */}
      <div className="almox-dash-grid">
        {/* Alertas de estoque */}
        <div className="almox-dash-card">
          <div className="almox-dash-card-header">
            <h3>⚠️ Estoque Crítico</h3>
            <Link to="/almoxarifado/materiais?status=critico" style={{ fontSize: '0.8rem', color: '#4facfe', display: 'flex', alignItems: 'center', gap: 4 }}>
              Ver todos <FiArrowRight size={12} />
            </Link>
          </div>
          <div className="almox-dash-card-body">
            {(!stats.listaMateriaisCriticos || stats.listaMateriaisCriticos.length === 0) ? (
              <div className="almox-empty">
                <p>✅ Todos os materiais estão com estoque adequado</p>
              </div>
            ) : (
              stats.listaMateriaisCriticos.map(m => {
                const status = getStatusMaterial(m) || 'critico';
                return (
                  <div key={m.id} className="almox-alerta-item">
                    <div className={`almox-alerta-dot ${status}`} />
                    <div className="almox-alerta-nome">
                      <div style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--gmp-text)' }}>{m.nome}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--gmp-text-light)' }}>{m.codigo}</div>
                    </div>
                    <div className="almox-alerta-qtd">
                      <span style={{ fontWeight: 700, color: status === 'critico' ? 'var(--gmp-error)' : 'var(--gmp-warning)' }}>
                        {m.quantidade_atual}
                      </span>
                      <span style={{ color: 'var(--gmp-text-light)', fontSize: '0.75rem' }}> / {m.quantidade_minima} {m.unidade}</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Requisições abertas */}
        {requisicoes && (
          <div className="almox-dash-card">
            <div className="almox-dash-card-header">
              <h3>📋 Requisições Abertas</h3>
              <Link to="/almoxarifado/requisicoes" style={{ fontSize: '0.8rem', color: '#4facfe', display: 'flex', alignItems: 'center', gap: 4 }}>
                Ver todas <FiArrowRight size={12} />
              </Link>
            </div>
            <div className="almox-dash-card-body">
              {(!requisicoes.abertas || requisicoes.abertas.length === 0) ? (
                <div className="almox-empty">
                  <p>Nenhuma requisição pendente de atendimento</p>
                </div>
              ) : (
                requisicoes.abertas.map(r => (
                  <Link key={r.id} to={`/almoxarifado/requisicoes?id=${r.id}`} className="almox-mov-item" style={{ textDecoration: 'none' }}>
                    <span className={`almox-badge almox-badge-${r.status === 'PENDENTE' ? 'aberto' : 'ajuste'}`}>
                      {STATUS_REQ[r.status] || r.status}
                    </span>
                    <div className="almox-mov-info">
                      <div className="almox-mov-nome" style={{ fontFamily: 'monospace', color: '#4facfe' }}>{r.numero}</div>
                      <div className="almox-mov-meta">
                        {r.solicitante_nome}
                        {r.urgencia !== 'NORMAL' && ` · ${r.urgencia}`}
                        {' · '}{r.total_itens} item(ns)
                      </div>
                    </div>
                    <div className="almox-mov-qtd" style={{ fontSize: '0.75rem', color: 'var(--gmp-text-light)' }}>
                      {new Date(r.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                    </div>
                  </Link>
                ))
              )}
            </div>
          </div>
        )}

        {/* Últimas movimentações */}
        <div className="almox-dash-card">
          <div className="almox-dash-card-header">
            <h3>📦 Últimas Movimentações</h3>
            <Link to="/almoxarifado/movimentacoes" style={{ fontSize: '0.8rem', color: '#4facfe', display: 'flex', alignItems: 'center', gap: 4 }}>
              Ver todas <FiArrowRight size={12} />
            </Link>
          </div>
          <div className="almox-dash-card-body">
            {(!stats.ultimasMovimentacoes || stats.ultimasMovimentacoes.length === 0) ? (
              <div className="almox-empty">
                <p>Nenhuma movimentação registrada</p>
              </div>
            ) : (
              stats.ultimasMovimentacoes.map(m => (
                <div key={m.id} className="almox-mov-item">
                  <span className={`almox-badge almox-badge-${m.tipo.toLowerCase()}`}>{tipoLabel(m.tipo)}</span>
                  <div className="almox-mov-info">
                    <div className="almox-mov-nome">{m.material_nome}</div>
                    <div className="almox-mov-meta">
                      {m.usuario_nome} · {new Date(m.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                  <div className="almox-mov-qtd" style={{ color: m.tipo === 'SAIDA' ? 'var(--gmp-error)' : 'var(--gmp-success)' }}>
                    {m.tipo === 'SAIDA' ? '-' : '+'}{m.quantidade} {m.unidade}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Consumo por O.S. */}
        <div className="almox-dash-card">
          <div className="almox-dash-card-header">
            <h3><FiLayers size={14} style={{ verticalAlign: 'middle', marginRight: 6 }} />Consumo por O.S.</h3>
            <select
              className="almox-select"
              value={periodoDias}
              onChange={(e) => setPeriodoDias(Number(e.target.value))}
            >
              <option value={30}>Últimos 30 dias</option>
              <option value={90}>Últimos 90 dias</option>
            </select>
          </div>
          <div className="almox-dash-card-body">
            {consumoOs.length === 0 ? (
              <div className="almox-empty">
                <p>Nenhum consumo vinculado a O.S. no período</p>
              </div>
            ) : (
              <div className="almox-table-container" style={{ border: 'none', borderRadius: 0 }}>
                <table className="almox-table">
                  <thead>
                    <tr>
                      <th>O.S.</th>
                      <th style={{ textAlign: 'right' }}>Qtd. consumida</th>
                    </tr>
                  </thead>
                  <tbody>
                    {consumoOs.map((row) => (
                      <tr key={row.os_id}>
                        <td style={{ fontFamily: 'monospace', color: '#4facfe' }}>{row.os_id}</td>
                        <td style={{ textAlign: 'right', fontWeight: 600 }}>{Number(row.total).toLocaleString('pt-BR')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Materiais mais consumidos */}
        <div className="almox-dash-card">
          <div className="almox-dash-card-header">
            <h3>📊 Materiais mais consumidos</h3>
            <select
              className="almox-select"
              value={periodoDias}
              onChange={(e) => setPeriodoDias(Number(e.target.value))}
            >
              <option value={30}>Últimos 30 dias</option>
              <option value={90}>Últimos 90 dias</option>
            </select>
          </div>
          <div className="almox-dash-card-body">
            {materiaisConsumidos.length === 0 ? (
              <div className="almox-empty">
                <p>Nenhum consumo registrado no período</p>
              </div>
            ) : (
              <div className="almox-table-container" style={{ border: 'none', borderRadius: 0 }}>
                <table className="almox-table">
                  <thead>
                    <tr>
                      <th>Material</th>
                      <th>Código</th>
                      <th style={{ textAlign: 'right' }}>Qtd.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {materiaisConsumidos.map((m) => (
                      <tr key={m.material_id}>
                        <td>{m.nome}</td>
                        <td style={{ color: 'var(--gmp-text-light)', fontSize: '0.8rem' }}>{m.codigo}</td>
                        <td style={{ textAlign: 'right', fontWeight: 600 }}>
                          {Number(m.total_consumido).toLocaleString('pt-BR')} {m.unidade}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AlmoxarifadoDashboard;
