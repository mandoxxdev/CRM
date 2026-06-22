import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../../services/api';
import { FiPackage, FiAlertTriangle, FiDollarSign, FiActivity, FiArrowRight, FiRefreshCw, FiClock, FiAlertOctagon } from 'react-icons/fi';
import './Almoxarifado.css';

const STATUS_REQ = {
  PENDENTE: 'Pendente',
  APROVADO: 'Aprovado',
  EM_SEPARACAO: 'Em Separação',
};

const AlmoxarifadoDashboard = () => {
  const [stats, setStats] = useState(null);
  const [requisicoes, setRequisicoes] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboard();
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
    } catch (err) {
      console.error('Erro ao carregar dashboard do almoxarifado:', err);
    } finally {
      setLoading(false);
    }
  };

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
                <div className="almox-kpi-label">Req. Pendentes</div>
              </div>
            </div>
            <div className="almox-kpi-card">
              <div className="almox-kpi-icon danger"><FiAlertOctagon /></div>
              <div className="almox-kpi-info">
                <div className="almox-kpi-value">{requisicoes.requisicoesUrgentes}</div>
                <div className="almox-kpi-label">Req. Urgentes</div>
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
                  <Link key={r.id} to="/almoxarifado/requisicoes" className="almox-mov-item" style={{ textDecoration: 'none' }}>
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
      </div>
    </div>
  );
};

export default AlmoxarifadoDashboard;
