import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import api from '../../services/api';
import { toast } from 'react-toastify';
import { useAuth } from '../../context/AuthContext';
import { SkeletonTable } from '../SkeletonLoader';
import AlmoxPageHeader, { REQUISICAO_FLOW, getRequisicaoStepIndex } from './AlmoxPageHeader';
import {
  FiPlus, FiRefreshCw, FiEye, FiCheck, FiX, FiPackage,
  FiAlertTriangle, FiClock, FiTruck, FiCheckCircle, FiFilter, FiMap
} from 'react-icons/fi';
import './Almoxarifado.css';

const STATUS_INFO = {
  PENDENTE:     { label: 'Pendente',     cls: 'almox-badge-aberto',    icon: FiClock },
  APROVADO:     { label: 'Aprovado',     cls: 'almox-badge-ok',        icon: FiCheck },
  EM_SEPARACAO: { label: 'Em Separação', cls: 'almox-badge-ajuste',    icon: FiPackage },
  ENTREGUE:     { label: 'Entregue',     cls: 'almox-badge-concluido', icon: FiCheckCircle },
  REJEITADO:    { label: 'Rejeitado',    cls: 'almox-badge-saida',     icon: FiX },
  CANCELADO:    { label: 'Cancelado',    cls: 'almox-badge-cancelado', icon: FiX },
};

const URGENCIA_INFO = {
  NORMAL:  { label: 'Normal',   cor: 'var(--gmp-text-light)' },
  URGENTE: { label: 'Urgente',  cor: 'var(--gmp-warning)' },
  CRITICO: { label: 'Crítico',  cor: 'var(--gmp-error)' },
};

const RequisicoesList = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const isAdmin = user?.role === 'admin';

  const [requisicoes, setRequisicoes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtroStatus, setFiltroStatus] = useState(searchParams.get('status') || '');
  const [filtroMinha, setFiltroMinha] = useState(searchParams.get('minha') === '1');
  const [detalhe, setDetalhe] = useState(null);
  const [loadingDetalhe, setLoadingDetalhe] = useState(false);
  const [showRejeitar, setShowRejeitar] = useState(false);
  const [motivoRejeicao, setMotivoRejeicao] = useState('');
  const [showEntregar, setShowEntregar] = useState(false);
  const [quantidadesEntrega, setQuantidadesEntrega] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadRequisicoes();
  }, [filtroStatus, filtroMinha]);

  useEffect(() => {
    const id = searchParams.get('id');
    if (id) abrirDetalhe(parseInt(id, 10));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams.get('id')]);

  useEffect(() => {
    const params = {};
    if (filtroStatus) params.status = filtroStatus;
    if (filtroMinha) params.minha = '1';
    if (detalhe?.id) params.id = String(detalhe.id);
    setSearchParams(params, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtroStatus, filtroMinha, detalhe?.id]);

  const loadRequisicoes = async () => {
    setLoading(true);
    try {
      const params = {};
      if (filtroStatus) params.status = filtroStatus;
      if (filtroMinha) params.minha = '1';
      const res = await api.get('/almoxarifado/requisicoes', { params });
      setRequisicoes(res.data);
    } catch {
      toast.error('Erro ao carregar requisições');
    } finally {
      setLoading(false);
    }
  };

  const abrirDetalhe = async (id) => {
    setLoadingDetalhe(true);
    setDetalhe(null);
    try {
      const res = await api.get(`/almoxarifado/requisicoes/${id}`);
      setDetalhe(res.data);
      const qtds = {};
      res.data.itens.forEach(i => { qtds[i.id] = i.quantidade_solicitada; });
      setQuantidadesEntrega(qtds);
    } catch {
      toast.error('Erro ao carregar detalhe');
    } finally {
      setLoadingDetalhe(false);
    }
  };

  const handleAprovar = async (id, iniciarSeparacao = false) => {
    setSaving(true);
    try {
      await api.put(`/almoxarifado/requisicoes/${id}/aprovar`);
      if (iniciarSeparacao) {
        await api.put(`/almoxarifado/requisicoes/${id}/separacao`);
        toast.success('Requisição aprovada e movida para separação!');
      } else {
        toast.success('Requisição aprovada! Inicie a separação quando estiver pronto.');
      }
      abrirDetalhe(id);
      loadRequisicoes();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao aprovar');
    } finally {
      setSaving(false);
    }
  };

  const handleRejeitar = async () => {
    setSaving(true);
    try {
      await api.put(`/almoxarifado/requisicoes/${detalhe.id}/rejeitar`, { motivo: motivoRejeicao });
      toast.success('Requisição rejeitada');
      setShowRejeitar(false);
      setDetalhe(null);
      loadRequisicoes();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao rejeitar');
    } finally {
      setSaving(false);
    }
  };

  const handleSeparacao = async (id) => {
    setSaving(true);
    try {
      await api.put(`/almoxarifado/requisicoes/${id}/separacao`);
      toast.success('Movida para separação!');
      abrirDetalhe(id);
      loadRequisicoes();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro');
    } finally {
      setSaving(false);
    }
  };

  const handleEntregar = async () => {
    setSaving(true);
    try {
      const itens_atendidos = detalhe.itens.map(i => ({
        item_id: i.id,
        quantidade_atendida: parseFloat(quantidadesEntrega[i.id] || 0)
      }));
      await api.put(`/almoxarifado/requisicoes/${detalhe.id}/entregar`, { itens_atendidos });
      toast.success('Requisição entregue! Estoque baixado.');
      setShowEntregar(false);
      setDetalhe(null);
      loadRequisicoes();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao entregar');
    } finally {
      setSaving(false);
    }
  };

  const handleCancelar = async (id) => {
    if (!window.confirm('Cancelar esta requisição?')) return;
    try {
      await api.put(`/almoxarifado/requisicoes/${id}/cancelar`);
      toast.success('Requisição cancelada');
      setDetalhe(null);
      loadRequisicoes();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao cancelar');
    }
  };

  const formatDate = (d) => d ? new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';

  const StatusBadge = ({ status }) => {
    const info = STATUS_INFO[status] || { label: status, cls: 'almox-badge-ajuste', icon: FiClock };
    const Icon = info.icon;
    return <span className={`almox-badge ${info.cls}`}><Icon size={10} />{info.label}</span>;
  };

  const UrgenciaBadge = ({ urgencia }) => {
    const info = URGENCIA_INFO[urgencia] || URGENCIA_INFO.NORMAL;
    if (urgencia === 'NORMAL') return null;
    return (
      <span style={{ fontSize: '0.7rem', fontWeight: 700, color: info.cor, display: 'flex', alignItems: 'center', gap: 3 }}>
        <FiAlertTriangle size={10} />{info.label}
      </span>
    );
  };

  return (
    <div className="almox-page">
      <AlmoxPageHeader
        title="Requisições de Material"
        subtitle={`${requisicoes.length} requisição${requisicoes.length !== 1 ? 'ões' : ''}`}
        breadcrumbs={[{ label: 'Requisições' }]}
        flowSteps={REQUISICAO_FLOW}
        currentStep={detalhe ? getRequisicaoStepIndex(detalhe.status) : undefined}
        actions={
          <>
            <button className="btn-almox-secondary" onClick={loadRequisicoes}>
              <FiRefreshCw size={13} />
            </button>
            <button className="btn-almox-primary" onClick={() => navigate('/almoxarifado/requisicoes/nova')}>
              <FiPlus size={14} /> Nova Requisição
            </button>
          </>
        }
      />

      {/* Filtros */}
      <div className="almox-filters">
        <select className="almox-select" value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)}>
          <option value="">Todos os status</option>
          {Object.entries(STATUS_INFO).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: '0.875rem', color: 'var(--gmp-text)' }}>
          <input type="checkbox" checked={filtroMinha} onChange={e => setFiltroMinha(e.target.checked)} />
          Apenas minhas
        </label>
        {(filtroStatus || filtroMinha) && (
          <button className="btn-almox-secondary" onClick={() => { setFiltroStatus(''); setFiltroMinha(false); }}>
            <FiFilter size={13} /> Limpar
          </button>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: detalhe ? '1fr 420px' : '1fr', gap: 20 }}>
        {/* Tabela */}
        <div className="almox-table-container">
          {loading ? <SkeletonTable rows={8} columns={6} /> : requisicoes.length === 0 ? (
            <div className="almox-empty"><p>Nenhuma requisição encontrada</p></div>
          ) : (
            <table className="almox-table">
              <thead>
                <tr>
                  <th>Número</th>
                  <th>Solicitante</th>
                  <th>Urgência</th>
                  <th>OS / Ref.</th>
                  <th>Itens</th>
                  <th>Status</th>
                  <th>Data</th>
                </tr>
              </thead>
              <tbody>
                {requisicoes.map(r => (
                  <tr key={r.id} style={{ cursor: 'pointer', background: detalhe?.id === r.id ? 'rgba(79,172,254,0.06)' : '' }}
                    onClick={() => abrirDetalhe(r.id)}>
                    <td>
                      <div style={{ fontWeight: 700, fontFamily: 'monospace', color: '#4facfe' }}>{r.numero}</div>
                    </td>
                    <td>
                      <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>{r.solicitante_nome}</div>
                      {r.departamento && <div style={{ fontSize: '0.75rem', color: 'var(--gmp-text-light)' }}>{r.departamento}</div>}
                    </td>
                    <td><UrgenciaBadge urgencia={r.urgencia} /></td>
                    <td style={{ fontSize: '0.8rem', color: 'var(--gmp-text-light)' }}>{r.os_referencia || '—'}</td>
                    <td style={{ fontWeight: 700 }}>{r.total_itens}</td>
                    <td><StatusBadge status={r.status} /></td>
                    <td style={{ fontSize: '0.75rem', color: 'var(--gmp-text-light)', whiteSpace: 'nowrap' }}>{formatDate(r.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Painel de detalhe */}
        {detalhe && (
          <div style={{ background: 'var(--gmp-surface)', border: '1px solid var(--gmp-border)', borderRadius: 12, overflow: 'hidden', height: 'fit-content', maxHeight: '80vh', overflowY: 'auto' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--gmp-border)', background: 'var(--gmp-bg)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', position: 'sticky', top: 0, zIndex: 2 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: '1rem', color: '#4facfe', fontFamily: 'monospace' }}>{detalhe.numero}</div>
                <StatusBadge status={detalhe.status} />
              </div>
              <button className="almox-modal-close" onClick={() => setDetalhe(null)}>✕</button>
            </div>

            {loadingDetalhe ? (
              <div className="almox-loading"><FiRefreshCw size={16} style={{ animation: 'spin 1s linear infinite' }} /> Carregando...</div>
            ) : (
              <div style={{ padding: 20 }}>
                {/* Info */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
                  {[
                    ['Solicitante', detalhe.solicitante_nome],
                    ['Departamento', detalhe.departamento || '—'],
                    ['OS / Referência', detalhe.os_referencia || '—'],
                    ['Urgência', URGENCIA_INFO[detalhe.urgencia]?.label || detalhe.urgencia],
                    ['Data', formatDate(detalhe.created_at)],
                    ['Aprovador', detalhe.aprovador_nome || '—'],
                  ].map(([k, v]) => (
                    <div key={k}>
                      <div style={{ fontSize: '0.7rem', color: 'var(--gmp-text-light)', textTransform: 'uppercase', fontWeight: 600 }}>{k}</div>
                      <div style={{ fontSize: '0.875rem', color: 'var(--gmp-text)', fontWeight: 500 }}>{v}</div>
                    </div>
                  ))}
                </div>
                {detalhe.observacoes && (
                  <div style={{ background: 'var(--gmp-bg)', border: '1px solid var(--gmp-border)', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: '0.85rem', color: 'var(--gmp-text-light)' }}>
                    💬 {detalhe.observacoes}
                  </div>
                )}
                {detalhe.rejeicao_motivo && (
                  <div style={{ background: 'rgba(229,25,58,0.06)', border: '1px solid rgba(229,25,58,0.2)', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: '0.85rem', color: 'var(--gmp-error)' }}>
                    ❌ Motivo: {detalhe.rejeicao_motivo}
                  </div>
                )}

                {/* Itens */}
                <div style={{ fontWeight: 700, fontSize: '0.8rem', color: 'var(--gmp-text)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>
                  Itens ({detalhe.itens.length})
                </div>
                {detalhe.itens.map(item => (
                  <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--gmp-border)' }}>
                    {item.foto ? (
                      <img src={item.foto} alt={item.material_nome} className="almox-foto-thumb" />
                    ) : (
                      <div className="almox-foto-placeholder"><FiPackage size={16} /></div>
                    )}
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: 6 }}>
                        {item.tipo_icone && <span>{item.tipo_icone}</span>}
                        {item.material_nome}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--gmp-text-light)' }}>
                        {item.material_codigo} · Saldo: {item.saldo_atual} {item.unidade}
                        {item.localizacao && (
                          <span> · 📍 {item.localizacao}</span>
                        )}
                      </div>
                      {item.localizacao_padrao_id && (
                        <Link to={`/almoxarifado/mapa?loc=${item.localizacao_padrao_id}`}
                          style={{ fontSize: '0.7rem', color: '#4facfe', display: 'inline-flex', alignItems: 'center', gap: 3, marginTop: 2 }}
                          onClick={e => e.stopPropagation()}>
                          <FiMap size={10} /> Ver no mapa
                        </Link>
                      )}
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>{item.quantidade_solicitada} {item.unidade}</div>
                      {item.quantidade_atendida > 0 && item.quantidade_atendida !== item.quantidade_solicitada && (
                        <div style={{ fontSize: '0.75rem', color: 'var(--gmp-warning)' }}>Atendido: {item.quantidade_atendida}</div>
                      )}
                      {item.saldo_atual < item.quantidade_solicitada && (
                        <div style={{ fontSize: '0.7rem', color: 'var(--gmp-error)' }}>⚠ Saldo insuficiente</div>
                      )}
                    </div>
                  </div>
                ))}

                {/* Ações */}
                {detalhe.status === 'PENDENTE' && (
                  <div style={{ display: 'flex', gap: 8, marginTop: 20, flexWrap: 'wrap' }}>
                    <button className="btn-almox-primary" style={{ flex: 1, justifyContent: 'center', minWidth: 140 }}
                      onClick={() => handleAprovar(detalhe.id, true)} disabled={saving}>
                      <FiCheck size={14} /> Aprovar e Separar
                    </button>
                    <button className="btn-almox-secondary" style={{ flex: 1, justifyContent: 'center', minWidth: 120 }}
                      onClick={() => handleAprovar(detalhe.id, false)} disabled={saving}>
                      <FiCheck size={14} /> Só Aprovar
                    </button>
                    <button className="btn-almox-danger" style={{ flex: 1, justifyContent: 'center', minWidth: 100 }}
                      onClick={() => setShowRejeitar(true)}>
                      <FiX size={14} /> Rejeitar
                    </button>
                  </div>
                )}
                {detalhe.status === 'APROVADO' && (
                  <div style={{ marginTop: 20 }}>
                    <div className="almox-hint-banner" style={{ marginBottom: 12, fontSize: '0.8rem' }}>
                      Próximo passo: separe os materiais nas localizações indicadas e confirme a entrega.
                    </div>
                    <button className="btn-almox-primary" style={{ width: '100%', justifyContent: 'center' }}
                      onClick={() => handleSeparacao(detalhe.id)} disabled={saving}>
                      <FiPackage size={14} /> Iniciar Separação
                    </button>
                  </div>
                )}
                {detalhe.status === 'EM_SEPARACAO' && (
                  <button className="btn-almox-primary" style={{ width: '100%', justifyContent: 'center', marginTop: 20 }} onClick={() => setShowEntregar(true)}>
                    <FiTruck size={14} /> Confirmar Entrega e Baixar Estoque
                  </button>
                )}
                {['PENDENTE', 'APROVADO'].includes(detalhe.status) && (
                  detalhe.solicitante_id === user?.id || isAdmin
                ) && (
                  <button className="btn-almox-secondary" style={{ width: '100%', justifyContent: 'center', marginTop: 8 }}
                    onClick={() => handleCancelar(detalhe.id)}>
                    Cancelar Requisição
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modal rejeitar */}
      {showRejeitar && (
        <div className="almox-modal-overlay" onClick={() => setShowRejeitar(false)}>
          <div className="almox-modal almox-modal-sm" onClick={e => e.stopPropagation()}>
            <div className="almox-modal-header">
              <h2>❌ Rejeitar Requisição</h2>
              <button className="almox-modal-close" onClick={() => setShowRejeitar(false)}>✕</button>
            </div>
            <div className="almox-modal-body">
              <div className="almox-field">
                <label className="almox-label">Motivo da rejeição</label>
                <textarea className="almox-textarea" rows={3} value={motivoRejeicao}
                  onChange={e => setMotivoRejeicao(e.target.value)}
                  placeholder="Informe o motivo para o solicitante..." />
              </div>
            </div>
            <div className="almox-modal-footer">
              <button className="btn-almox-secondary" onClick={() => setShowRejeitar(false)}>Cancelar</button>
              <button className="btn-almox-danger" onClick={handleRejeitar} disabled={saving}>
                {saving ? 'Rejeitando...' : 'Confirmar Rejeição'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal entrega */}
      {showEntregar && detalhe && (
        <div className="almox-modal-overlay" onClick={() => setShowEntregar(false)}>
          <div className="almox-modal" onClick={e => e.stopPropagation()}>
            <div className="almox-modal-header">
              <h2>🚚 Confirmar Entrega — {detalhe.numero}</h2>
              <button className="almox-modal-close" onClick={() => setShowEntregar(false)}>✕</button>
            </div>
            <div className="almox-modal-body">
              <p style={{ color: 'var(--gmp-text-light)', marginBottom: 16, fontSize: '0.875rem' }}>
                Informe a quantidade real entregue para cada item. O estoque será baixado automaticamente.
              </p>
              {detalhe.itens.map(item => (
                <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, paddingBottom: 12, borderBottom: '1px solid var(--gmp-border)' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>{item.material_nome}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--gmp-text-light)' }}>
                      Solicitado: {item.quantidade_solicitada} {item.unidade} · Saldo: {item.saldo_atual}
                    </div>
                  </div>
                  <div>
                    <input className="almox-count-input" type="number" min="0" step="0.01"
                      max={Math.min(item.quantidade_solicitada, item.saldo_atual)}
                      value={quantidadesEntrega[item.id] || ''}
                      onChange={e => setQuantidadesEntrega(q => ({ ...q, [item.id]: e.target.value }))} />
                    <div style={{ fontSize: '0.7rem', color: 'var(--gmp-text-light)', textAlign: 'right', marginTop: 2 }}>{item.unidade}</div>
                  </div>
                </div>
              ))}
            </div>
            <div className="almox-modal-footer">
              <button className="btn-almox-secondary" onClick={() => setShowEntregar(false)}>Cancelar</button>
              <button className="btn-almox-primary" onClick={handleEntregar} disabled={saving}>
                {saving ? 'Confirmando...' : '✅ Confirmar Entrega'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RequisicoesList;
