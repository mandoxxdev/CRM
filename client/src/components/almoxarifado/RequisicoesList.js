import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import api from '../../services/api';
import { toast } from 'react-toastify';
import { useAuth } from '../../context/AuthContext';
import { SkeletonTable } from '../SkeletonLoader';
import AlmoxPageHeader, { REQUISICAO_FLOW, getRequisicaoStepIndex } from './AlmoxPageHeader';
import {
  FiPlus, FiRefreshCw, FiEye, FiCheck, FiX, FiPackage,
  FiAlertTriangle, FiClock, FiTruck, FiCheckCircle, FiFilter, FiMap, FiTrash2
} from 'react-icons/fi';
import './Almoxarifado.css';

const STATUS_INFO = {
  PENDENTE:              { label: 'Pendente',              cls: 'almox-badge-aberto',    icon: FiClock },
  APROVADO:              { label: 'Aprovado',              cls: 'almox-badge-ok',        icon: FiCheck },
  EM_SEPARACAO:          { label: 'Em Separação',          cls: 'almox-badge-ajuste',    icon: FiPackage },
  PARCIALMENTE_ATENDIDA: { label: 'Parcialmente Atendida', cls: 'almox-badge-baixo',     icon: FiTruck },
  ENTREGUE:              { label: 'Entregue',              cls: 'almox-badge-concluido', icon: FiCheckCircle },
  REJEITADO:             { label: 'Rejeitado',             cls: 'almox-badge-saida',     icon: FiX },
  CANCELADO:             { label: 'Cancelado',             cls: 'almox-badge-cancelado', icon: FiX },
};

const getEntregue = (item) => Number(item.quantidade_entregue ?? item.quantidade_atendida) || 0;
const getSeparado = (item) => Number(item.quantidade_separada) || 0;
const getPendente = (item) => Math.max(0, Number(item.quantidade_solicitada) - getEntregue(item));
const maxQtdSeparacao = (item) => Math.min(
  Math.max(0, Number(item.quantidade_solicitada) - getSeparado(item)),
  Number(item.saldo_atual) || 0
);
const maxQtdEntrega = (item) => {
  const entregue = getEntregue(item);
  const separadoDisponivel = Math.max(0, getSeparado(item) - entregue);
  const pendente = getPendente(item);
  const estoque = Number(item.saldo_atual) || 0;
  return Math.min(pendente, separadoDisponivel, estoque);
};
const temEntregavel = (itens) => (itens || []).some((i) => maxQtdEntrega(i) > 0);
const temPendenteComEstoque = (itens) => temEntregavel(itens);

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
  const [selectedId, setSelectedId] = useState(() => {
    const id = searchParams.get('id');
    return id ? parseInt(id, 10) || null : null;
  });
  const [detalhe, setDetalhe] = useState(null);
  const [loadingDetalhe, setLoadingDetalhe] = useState(false);
  const loadedDetalheIdRef = useRef(null);
  const selectedIdRef = useRef(selectedId);
  selectedIdRef.current = selectedId;
  const [showRejeitar, setShowRejeitar] = useState(false);
  const [motivoRejeicao, setMotivoRejeicao] = useState('');
  const [showEntregar, setShowEntregar] = useState(false);
  const [showSeparar, setShowSeparar] = useState(false);
  const [showExcluir, setShowExcluir] = useState(false);
  const [justificativaExclusao, setJustificativaExclusao] = useState('');
  const [quantidadesEntrega, setQuantidadesEntrega] = useState({});
  const [quantidadesSeparacao, setQuantidadesSeparacao] = useState({});
  const [entregaAposSeparar, setEntregaAposSeparar] = useState(false);
  const [saving, setSaving] = useState(false);

  const buildSearchParams = useCallback((id) => {
    const params = {};
    if (filtroStatus) params.status = filtroStatus;
    if (filtroMinha) params.minha = '1';
    if (id) params.id = String(id);
    return params;
  }, [filtroStatus, filtroMinha]);

  const syncSearchParams = useCallback((id) => {
    const params = buildSearchParams(id);
    const next = new URLSearchParams(params).toString();
    if (next !== searchParams.toString()) {
      setSearchParams(params, { replace: true });
    }
  }, [buildSearchParams, searchParams, setSearchParams]);

  useEffect(() => {
    loadRequisicoes();
  }, [filtroStatus, filtroMinha]);

  // Deep-link / browser back-forward: open panel when ?id= changes externally
  useEffect(() => {
    const urlId = searchParams.get('id');
    if (!urlId) {
      if (loadedDetalheIdRef.current != null) {
        setSelectedId(null);
        setDetalhe(null);
        loadedDetalheIdRef.current = null;
      }
      return;
    }
    const numId = parseInt(urlId, 10);
    if (!numId) return;
    abrirDetalhe(numId, { fromUrl: true, force: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // Sync filter params in URL, preserving open requisition id
  useEffect(() => {
    syncSearchParams(selectedIdRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtroStatus, filtroMinha]);

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

  const abrirDetalhe = async (id, { fromUrl = false, force = false } = {}) => {
    if (!id) return;
    if (!force && loadedDetalheIdRef.current === id && detalhe) return;

    setSelectedId(id);
    setLoadingDetalhe(true);
    if (loadedDetalheIdRef.current !== id) {
      setDetalhe(null);
    }

    try {
      const res = await api.get(`/almoxarifado/requisicoes/${id}`);
      setDetalhe(res.data);
      loadedDetalheIdRef.current = id;
      const qtdsEntrega = {};
      const qtdsSeparacao = {};
      res.data.itens.forEach((i) => {
        qtdsEntrega[i.id] = maxQtdEntrega(i);
        qtdsSeparacao[i.id] = maxQtdSeparacao(i);
      });
      setQuantidadesEntrega(qtdsEntrega);
      setQuantidadesSeparacao(qtdsSeparacao);
      if (!fromUrl) syncSearchParams(id);
      return res.data;
    } catch {
      toast.error('Erro ao carregar detalhe');
      setSelectedId(null);
      setDetalhe(null);
      loadedDetalheIdRef.current = null;
      if (!fromUrl) syncSearchParams(null);
      return null;
    } finally {
      setLoadingDetalhe(false);
    }
  };

  const fecharDetalhe = () => {
    setSelectedId(null);
    setDetalhe(null);
    loadedDetalheIdRef.current = null;
    syncSearchParams(null);
  };

  const handleAprovar = async (id, iniciarSeparacao = false) => {
    setSaving(true);
    try {
      await api.put(`/almoxarifado/requisicoes/${id}/aprovar`);
      if (iniciarSeparacao) {
        await abrirDetalhe(id, { force: true });
        setShowSeparar(true);
        toast.success('Requisição aprovada! Informe as quantidades a separar.');
      } else {
        toast.success('Requisição aprovada! Inicie a separação quando estiver pronto.');
        abrirDetalhe(id, { force: true });
      }
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
      fecharDetalhe();
      loadRequisicoes();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao rejeitar');
    } finally {
      setSaving(false);
    }
  };

  const abrirModalSeparacao = () => {
    if (!detalhe) return;
    const qtds = {};
    detalhe.itens.forEach((i) => { qtds[i.id] = maxQtdSeparacao(i); });
    setQuantidadesSeparacao(qtds);
    setShowSeparar(true);
  };

  const handleSeparacao = async () => {
    if (!detalhe) return;
    setSaving(true);
    try {
      const itens_separados = detalhe.itens
        .map((i) => ({
          item_id: i.id,
          quantidade_separada: parseFloat(quantidadesSeparacao[i.id] || 0),
        }))
        .filter((i) => i.quantidade_separada > 0);

      await api.put(`/almoxarifado/requisicoes/${detalhe.id}/separacao`, { itens_separados });
      toast.success('Separação registrada!');
      setShowSeparar(false);
      const abrirEntrega = entregaAposSeparar;
      setEntregaAposSeparar(false);
      const updated = await abrirDetalhe(detalhe.id, { force: true });
      loadRequisicoes();
      if (abrirEntrega && updated) abrirModalEntrega(updated);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao separar');
    } finally {
      setSaving(false);
    }
  };

  const montarItensEntrega = (fonte, qtdMap = quantidadesEntrega) => {
    if (!fonte?.itens) return [];
    return fonte.itens
      .map((i) => ({
        item_id: Number(i.id),
        quantidade_atendida: parseFloat(qtdMap[i.id] ?? qtdMap[String(i.id)] ?? 0) || 0,
      }))
      .filter((i) => i.item_id && i.quantidade_atendida > 0);
  };

  const entregarItens = async (itens_atendidos, reqId = detalhe?.id) => {
    if (!reqId) {
      toast.error('Requisição não carregada');
      return;
    }
    if (!itens_atendidos?.length) {
      console.error('[RequisicoesList] entregarItens: nenhuma quantidade informada', { reqId, detalhe });
      toast.error('Informe ao menos uma quantidade maior que zero para entregar');
      return;
    }
    setSaving(true);
    try {
      const res = await api.put(`/almoxarifado/requisicoes/${reqId}/entregar`, { itens_atendidos });
      setShowEntregar(false);
      if (res.data?.parcial) {
        toast.success('Entrega parcial registrada. Saldo pendente permanece em aberto.');
        abrirDetalhe(reqId, { force: true });
      } else {
        toast.success('Requisição entregue por completo! Estoque baixado.');
        fecharDetalhe();
      }
      loadRequisicoes();
    } catch (err) {
      console.error('[RequisicoesList] Erro ao entregar requisição', err?.response?.data || err);
      toast.error(err.response?.data?.error || 'Erro ao entregar');
    } finally {
      setSaving(false);
    }
  };

  const abrirModalEntrega = (fonte = detalhe) => {
    if (!fonte) {
      toast.error('Requisição não carregada');
      return;
    }
    const qtds = {};
    fonte.itens.forEach((i) => {
      const qtd = maxQtdEntrega(i);
      if (qtd > 0) qtds[i.id] = qtd;
    });
    if (Object.keys(qtds).length === 0) {
      console.error('[RequisicoesList] abrirModalEntrega: nenhum item entregável', fonte);
      toast.error('Nenhum item disponível para entrega. Verifique separação e estoque.');
      return;
    }
    setQuantidadesEntrega(qtds);
    setShowEntregar(true);
  };

  const handleConfirmarEntrega = async ({ direto = false } = {}) => {
    if (!detalhe) {
      toast.error('Requisição não carregada');
      return;
    }
    const qtds = {};
    detalhe.itens.forEach((i) => {
      const qtd = maxQtdEntrega(i);
      if (qtd > 0) qtds[i.id] = qtd;
    });
    const itens_atendidos = montarItensEntrega(detalhe, qtds);
    if (!itens_atendidos.length) {
      console.error('[RequisicoesList] handleConfirmarEntrega: nenhum item entregável', {
        reqId: detalhe.id,
        itens: detalhe.itens.map((i) => ({
          id: i.id,
          solicitado: i.quantidade_solicitada,
          separado: getSeparado(i),
          entregue: getEntregue(i),
          saldo: i.saldo_atual,
          max: maxQtdEntrega(i),
        })),
      });
      toast.error('Nenhum item disponível para entrega. Separe os materiais ou aguarde reposição de estoque.');
      return;
    }
    setQuantidadesEntrega(qtds);
    if (direto) {
      await entregarItens(itens_atendidos);
    } else {
      setShowEntregar(true);
    }
  };

  const handleCompletarEntrega = () => {
    if (!detalhe) return;
    const precisaSeparar = detalhe.itens.some((i) => maxQtdSeparacao(i) > 0 && getPendente(i) > 0);
    if (precisaSeparar) {
      setEntregaAposSeparar(true);
      abrirModalSeparacao();
    } else {
      abrirModalEntrega();
    }
  };

  const handleEntregar = async () => {
    const itens_atendidos = montarItensEntrega(detalhe);
    await entregarItens(itens_atendidos);
  };

  const handleCancelar = async (id) => {
    if (!window.confirm('Cancelar esta requisição?')) return;
    try {
      await api.put(`/almoxarifado/requisicoes/${id}/cancelar`);
      toast.success('Requisição cancelada');
      fecharDetalhe();
      loadRequisicoes();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao cancelar');
    }
  };

  const handleExcluir = async () => {
    if (!detalhe || !justificativaExclusao.trim()) {
      toast.error('Informe a justificativa da exclusão');
      return;
    }
    setSaving(true);
    try {
      const res = await api.delete(`/almoxarifado/requisicoes/${detalhe.id}`, {
        data: { justificativa: justificativaExclusao.trim() },
      });
      const estornados = res.data?.estornos?.length || 0;
      toast.success(estornados > 0
        ? `Requisição excluída. Estoque estornado em ${estornados} item(ns).`
        : 'Requisição excluída.');
      setShowExcluir(false);
      setJustificativaExclusao('');
      fecharDetalhe();
      loadRequisicoes();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao excluir requisição');
    } finally {
      setSaving(false);
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

      <div style={{ display: 'grid', gridTemplateColumns: selectedId ? '1fr 420px' : '1fr', gap: 20 }}>
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
                  <tr key={r.id} style={{ cursor: 'pointer', background: selectedId === r.id ? 'rgba(79,172,254,0.06)' : '' }}
                    onClick={() => abrirDetalhe(r.id, { force: true })}>
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
        {selectedId && (
          <div style={{ background: 'var(--gmp-surface)', border: '1px solid var(--gmp-border)', borderRadius: 12, overflow: 'hidden', height: 'fit-content', maxHeight: '80vh', overflowY: 'auto' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--gmp-border)', background: 'var(--gmp-bg)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', position: 'sticky', top: 0, zIndex: 2 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: '1rem', color: '#4facfe', fontFamily: 'monospace' }}>{detalhe?.numero || '...'}</div>
                {detalhe && <StatusBadge status={detalhe.status} />}
              </div>
              <button className="almox-modal-close" onClick={fecharDetalhe}>✕</button>
            </div>

            {loadingDetalhe || !detalhe ? (
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
                    <div style={{ textAlign: 'right', minWidth: 130 }}>
                      <div style={{ fontSize: '0.72rem', color: 'var(--gmp-text-light)', lineHeight: 1.5 }}>
                        <div>Solicitado: <strong>{item.quantidade_solicitada}</strong></div>
                        <div>Separado: <strong>{getSeparado(item)}</strong></div>
                        <div>Entregue: <strong style={{ color: getEntregue(item) > 0 ? 'var(--gmp-success)' : 'inherit' }}>{getEntregue(item)}</strong></div>
                        {getPendente(item) > 0 && (
                          <div style={{ color: 'var(--gmp-warning)' }}>Pendente: <strong>{getPendente(item)}</strong></div>
                        )}
                      </div>
                      {getPendente(item) > 0 && Number(item.saldo_atual) < getPendente(item) && maxQtdEntrega(item) > 0 && (
                        <div style={{ fontSize: '0.7rem', color: 'var(--gmp-warning)', marginTop: 4 }}>
                          ⚠ Saldo insuficiente para quantidade total — entrega parcial disponível
                        </div>
                      )}
                      {getPendente(item) > 0 && maxQtdEntrega(item) <= 0 && (
                        <div style={{ fontSize: '0.7rem', color: 'var(--gmp-error)', marginTop: 4 }}>⚠ Sem estoque para entrega</div>
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
                      Próximo passo: separe os materiais (máximo disponível em estoque) e confirme a entrega.
                    </div>
                    <button className="btn-almox-primary" style={{ width: '100%', justifyContent: 'center' }}
                      onClick={abrirModalSeparacao} disabled={saving}>
                      <FiPackage size={14} /> Iniciar Separação
                    </button>
                  </div>
                )}
                {detalhe.status === 'EM_SEPARACAO' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 20 }}>
                    <button className="btn-almox-secondary" style={{ width: '100%', justifyContent: 'center' }}
                      onClick={abrirModalSeparacao}>
                      <FiPackage size={14} /> Ajustar Separação
                    </button>
                    {temEntregavel(detalhe.itens) ? (
                      <button className="btn-almox-primary" style={{ width: '100%', justifyContent: 'center' }}
                        onClick={() => handleConfirmarEntrega({ direto: true })} disabled={saving}>
                        <FiTruck size={14} /> {saving ? 'Confirmando...' : 'Confirmar Entrega e Baixar Estoque'}
                      </button>
                    ) : (
                      <div style={{ fontSize: '0.8rem', color: 'var(--gmp-text-light)', textAlign: 'center', padding: '8px 0' }}>
                        Nenhuma quantidade separada disponível para entrega no momento.
                      </div>
                    )}
                  </div>
                )}
                {detalhe.status === 'PARCIALMENTE_ATENDIDA' && (
                  <div style={{ marginTop: 20 }}>
                    <div className="almox-hint-banner" style={{ marginBottom: 12, fontSize: '0.8rem', borderColor: 'var(--gmp-warning)' }}>
                      Atendimento parcial — itens pendentes aguardam estoque para conclusão.
                    </div>
                    {temPendenteComEstoque(detalhe.itens) ? (
                      <button className="btn-almox-primary" style={{ width: '100%', justifyContent: 'center' }}
                        onClick={handleCompletarEntrega}>
                        <FiTruck size={14} /> Completar Entrega
                      </button>
                    ) : (
                      <div style={{ fontSize: '0.8rem', color: 'var(--gmp-text-light)', textAlign: 'center', padding: '8px 0' }}>
                        Aguardando reposição de estoque para itens pendentes.
                      </div>
                    )}
                  </div>
                )}
                {['PENDENTE', 'APROVADO'].includes(detalhe.status) && (
                  detalhe.solicitante_id === user?.id || isAdmin
                ) && (
                  <button className="btn-almox-secondary" style={{ width: '100%', justifyContent: 'center', marginTop: 8 }}
                    onClick={() => handleCancelar(detalhe.id)}>
                    Cancelar Requisição
                  </button>
                )}
                {isAdmin && (
                  <button className="btn-almox-danger" style={{ width: '100%', justifyContent: 'center', marginTop: 8 }}
                    onClick={() => { setJustificativaExclusao(''); setShowExcluir(true); }}>
                    <FiTrash2 size={14} /> Excluir Requisição
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

      {/* Modal separação */}
      {showSeparar && detalhe && (
        <div className="almox-modal-overlay" onClick={() => setShowSeparar(false)}>
          <div className="almox-modal" onClick={e => e.stopPropagation()}>
            <div className="almox-modal-header">
              <h2>📦 Separar Materiais — {detalhe.numero}</h2>
              <button className="almox-modal-close" onClick={() => setShowSeparar(false)}>✕</button>
            </div>
            <div className="almox-modal-body">
              <p style={{ color: 'var(--gmp-text-light)', marginBottom: 16, fontSize: '0.875rem' }}>
                Informe a quantidade a separar. Não é possível separar mais que o estoque disponível.
              </p>
              {detalhe.itens.filter(i => maxQtdSeparacao(i) > 0).map(item => (
                <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, paddingBottom: 12, borderBottom: '1px solid var(--gmp-border)' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>{item.material_nome}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--gmp-text-light)' }}>
                      Solicitado: {item.quantidade_solicitada} · Já separado: {getSeparado(item)} · Saldo: {item.saldo_atual}
                    </div>
                  </div>
                  <div>
                    <input className="almox-count-input" type="number" min="0" step="1"
                      max={maxQtdSeparacao(item)}
                      value={quantidadesSeparacao[item.id] ?? ''}
                      onChange={e => setQuantidadesSeparacao(q => ({ ...q, [item.id]: e.target.value }))} />
                    <div style={{ fontSize: '0.7rem', color: 'var(--gmp-text-light)', textAlign: 'right', marginTop: 2 }}>{item.unidade}</div>
                  </div>
                </div>
              ))}
              {detalhe.itens.every(i => maxQtdSeparacao(i) <= 0) && (
                <p style={{ color: 'var(--gmp-text-light)', fontSize: '0.85rem' }}>Nenhum item com estoque disponível para separação.</p>
              )}
            </div>
            <div className="almox-modal-footer">
              <button className="btn-almox-secondary" onClick={() => setShowSeparar(false)}>Cancelar</button>
              <button className="btn-almox-primary" onClick={handleSeparacao} disabled={saving || detalhe.itens.every(i => maxQtdSeparacao(i) <= 0)}>
                {saving ? 'Separando...' : '📦 Confirmar Separação'}
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
                Informe a quantidade a entregar nesta rodada. O estoque será baixado apenas do que for confirmado.
              </p>
              {detalhe.itens.filter(i => maxQtdEntrega(i) > 0).map(item => {
                const qtdEntregar = parseFloat(quantidadesEntrega[item.id] || 0) || 0;
                const permanecePendente = Math.max(0, getPendente(item) - qtdEntregar);
                const saldoInsuficienteTotal = getPendente(item) > Number(item.saldo_atual);
                return (
                <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, paddingBottom: 12, borderBottom: '1px solid var(--gmp-border)' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>{item.material_nome}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--gmp-text-light)' }}>
                      Solicitado: {item.quantidade_solicitada} · Separado: {getSeparado(item)} · Entregue: {getEntregue(item)} · Pendente: {getPendente(item)} · Saldo: {item.saldo_atual}
                    </div>
                    {saldoInsuficienteTotal && (
                      <div style={{ fontSize: '0.7rem', color: 'var(--gmp-warning)', marginTop: 4 }}>
                        Saldo insuficiente para quantidade total — será entregue o máximo disponível
                      </div>
                    )}
                    {qtdEntregar > 0 && (
                      <div style={{ fontSize: '0.75rem', color: 'var(--gmp-success)', marginTop: 4, fontWeight: 600 }}>
                        Será entregue: {qtdEntregar} {item.unidade} | Permanecerá pendente: {permanecePendente} {item.unidade}
                      </div>
                    )}
                  </div>
                  <div>
                    <input className="almox-count-input" type="number" min="0" step="1"
                      max={maxQtdEntrega(item)}
                      value={quantidadesEntrega[item.id] ?? ''}
                      onChange={e => setQuantidadesEntrega(q => ({ ...q, [item.id]: e.target.value }))} />
                    <div style={{ fontSize: '0.7rem', color: 'var(--gmp-text-light)', textAlign: 'right', marginTop: 2 }}>{item.unidade}</div>
                  </div>
                </div>
              );})}
              {detalhe.itens.every(i => maxQtdEntrega(i) <= 0) && (
                <p style={{ color: 'var(--gmp-text-light)', fontSize: '0.85rem' }}>Nenhum item disponível para entrega no momento.</p>
              )}
            </div>
            <div className="almox-modal-footer">
              <button className="btn-almox-secondary" onClick={() => setShowEntregar(false)}>Cancelar</button>
              <button className="btn-almox-primary" onClick={handleEntregar} disabled={saving || detalhe.itens.every(i => maxQtdEntrega(i) <= 0)}>
                {saving ? 'Confirmando...' : '✅ Confirmar Entrega'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal excluir (admin) */}
      {showExcluir && detalhe && (
        <div className="almox-modal-overlay" onClick={() => setShowExcluir(false)}>
          <div className="almox-modal almox-modal-sm" onClick={e => e.stopPropagation()}>
            <div className="almox-modal-header">
              <h2>🗑 Excluir Requisição</h2>
              <button className="almox-modal-close" onClick={() => setShowExcluir(false)}>✕</button>
            </div>
            <div className="almox-modal-body">
              <p style={{ color: 'var(--gmp-text-light)', marginBottom: 12, fontSize: '0.875rem' }}>
                Esta ação remove a requisição <strong>{detalhe.numero}</strong> do sistema.
                {detalhe.itens.some((i) => getEntregue(i) > 0) && (
                  <span style={{ display: 'block', marginTop: 8, color: 'var(--gmp-warning)' }}>
                    Itens já entregues terão o estoque estornado automaticamente.
                  </span>
                )}
              </p>
              <div className="almox-field">
                <label className="almox-label">Justificativa da exclusão *</label>
                <textarea className="almox-textarea" rows={3} value={justificativaExclusao}
                  onChange={e => setJustificativaExclusao(e.target.value)}
                  placeholder="Informe o motivo da exclusão..." />
              </div>
            </div>
            <div className="almox-modal-footer">
              <button className="btn-almox-secondary" onClick={() => setShowExcluir(false)}>Cancelar</button>
              <button className="btn-almox-danger" onClick={handleExcluir}
                disabled={saving || !justificativaExclusao.trim()}>
                {saving ? 'Excluindo...' : 'Confirmar Exclusão'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RequisicoesList;
