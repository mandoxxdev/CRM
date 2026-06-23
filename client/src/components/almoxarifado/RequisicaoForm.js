import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import api from '../../services/api';
import { toast } from 'react-toastify';
import { useAuth } from '../../context/AuthContext';
import { useRequisicoesMaterialContext } from './RequisicoesMaterialContext';
import { FiPlus, FiTrash2, FiArrowLeft, FiSend, FiSearch, FiPackage, FiAlertTriangle } from 'react-icons/fi';
import { DisponibilidadeBadge } from '../../utils/disponibilidadeEstoque';
import './Almoxarifado.css';

const RequisicaoForm = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const ctx = useRequisicoesMaterialContext();
  const warehouseMode = !!ctx.warehouseMode;
  const setorFixo = searchParams.get('setor') || ctx.setor || '';
  const setorReadOnly = !warehouseMode && !!setorFixo;
  const listPath = `${ctx.basePath}/requisicoes-material`;
  const apiPrefix = warehouseMode ? '/almoxarifado/requisicoes' : '/requisicoes-material';

  const [setores, setSetores] = useState([]);
  const [materiais, setMateriais] = useState([]);
  const [busca, setBusca] = useState('');
  const [resultados, setResultados] = useState([]);
  const [showBusca, setShowBusca] = useState(false);

  const [form, setForm] = useState({
    departamento: setorFixo,
    os_referencia: '',
    urgencia: 'NORMAL',
    observacoes: '',
    justificativa_urgencia: '',
  });

  const [itens, setItens] = useState([]);
  const [saving, setSaving] = useState(false);
  const [materiaisLoading, setMateriaisLoading] = useState(true);
  const [materiaisError, setMateriaisError] = useState(null);

  const refreshDisponibilidade = useCallback(async (itensAtuais) => {
    if (warehouseMode || !itensAtuais.length) return itensAtuais;
    try {
      const res = await api.post('/requisicoes-material/disponibilidade', {
        itens: itensAtuais.map((i) => ({ material_id: i.material_id, quantidade: i.quantidade })),
      });
      const map = new Map((res.data || []).map((r) => [r.material_id, r]));
      return itensAtuais.map((i) => {
        const st = map.get(i.material_id);
        if (!st) return i;
        return {
          ...i,
          disponibilidade: st.disponibilidade,
          saldo_suficiente: st.saldo_suficiente,
          disponibilidade_label: st.disponibilidade_label,
        };
      });
    } catch {
      return itensAtuais;
    }
  }, [warehouseMode]);

  useEffect(() => {
    loadMateriais();
    if (warehouseMode) loadSetores();
  }, [setorFixo, warehouseMode, form.departamento]);

  useEffect(() => {
    if (setorFixo) {
      setForm((f) => ({ ...f, departamento: setorFixo }));
    }
  }, [setorFixo]);

  useEffect(() => {
    if (busca.length < 2) { setResultados([]); return; }
    const filtered = materiais.filter(m =>
      m.nome.toLowerCase().includes(busca.toLowerCase()) ||
      m.codigo.toLowerCase().includes(busca.toLowerCase())
    ).slice(0, 8);
    setResultados(filtered);
  }, [busca, materiais]);

  useEffect(() => {
    if (warehouseMode || itens.length === 0) return undefined;
    let cancelled = false;
    const snapshot = itens;
    refreshDisponibilidade(snapshot).then((updated) => {
      if (cancelled) return;
      const changed = updated.some((u, idx) => (
        u.disponibilidade !== snapshot[idx]?.disponibilidade
        || u.saldo_suficiente !== snapshot[idx]?.saldo_suficiente
      ));
      if (changed) setItens(updated);
    });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itens.map((i) => `${i.material_id}:${i.quantidade}`).join('|'), warehouseMode]);

  const loadSetores = async () => {
    try {
      const res = await api.get('/almoxarifado/setores-requisicao');
      setSetores(res.data);
    } catch { /* optional */ }
  };

  const loadMateriais = async () => {
    const setor = setorFixo || form.departamento;
    if (!warehouseMode && !setor && !ctx.moduloOrigem) {
      setMateriais([]);
      setMateriaisLoading(false);
      return;
    }
    setMateriaisLoading(true);
    setMateriaisError(null);
    try {
      const url = warehouseMode
        ? '/almoxarifado/materiais'
        : '/requisicoes-material/materiais';
      const params = {};
      if (setor) params.setor = setor;
      else if (ctx.moduloOrigem) params.modulo = ctx.moduloOrigem;
      const res = await api.get(url, { params });
      setMateriais(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      setMateriais([]);
      const msg = err.response?.data?.error || 'Erro ao carregar materiais disponíveis';
      setMateriaisError(msg);
      toast.error(msg);
    } finally {
      setMateriaisLoading(false);
    }
  };

  useEffect(() => {
    const preId = searchParams.get('material_id');
    if (!preId || materiais.length === 0) return;
    const mat = materiais.find(m => String(m.id) === preId);
    if (mat) {
      setItens(prev => {
        if (prev.find(i => i.material_id === mat.id)) return prev;
        return [...prev, buildItemFromMaterial(mat)];
      });
    }
  }, [materiais, searchParams]);

  const buildItemFromMaterial = (material) => {
    const base = {
      material_id: material.id,
      material_nome: material.nome,
      material_codigo: material.codigo,
      unidade: material.unidade,
      tipo_icone: material.tipo_icone || '',
      quantidade: 1,
      observacoes: '',
    };
    if (warehouseMode) {
      return { ...base, saldo_atual: material.quantidade_atual };
    }
    return {
      ...base,
      disponibilidade: material.disponibilidade,
      saldo_suficiente: material.saldo_suficiente,
      disponibilidade_label: material.disponibilidade_label,
    };
  };

  const adicionarItem = (material) => {
    if (itens.find(i => i.material_id === material.id)) {
      toast.info(`${material.nome} já está na lista`);
      setShowBusca(false);
      setBusca('');
      return;
    }
    setItens(prev => [...prev, buildItemFromMaterial(material)]);
    setBusca('');
    setResultados([]);
    setShowBusca(false);
  };

  const removerItem = (material_id) => {
    setItens(prev => prev.filter(i => i.material_id !== material_id));
  };

  const atualizarItem = (material_id, campo, valor) => {
    setItens(prev => prev.map(i => i.material_id === material_id ? { ...i, [campo]: valor } : i));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.departamento) { toast.error('Setor é obrigatório'); return; }
    if (itens.length === 0) { toast.error('Adicione ao menos um material'); return; }
    if (form.urgencia !== 'NORMAL' && !form.justificativa_urgencia) {
      toast.error('Justifique a urgência para requisições urgentes/críticas');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...form,
        setor: form.departamento,
        modulo_origem: ctx.moduloOrigem,
        itens: itens.map(i => ({
          material_id: i.material_id,
          quantidade: parseFloat(i.quantidade),
          observacoes: i.observacoes
        }))
      };
      const res = await api.post(apiPrefix, payload);
      toast.success(`Requisição ${res.data.numero} criada! ${res.data.aprovacao === 'automatica' ? '(Aprovação automática)' : 'Aguardando aprovação do almoxarifado.'}`);
      navigate(listPath);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao criar requisição');
    } finally {
      setSaving(false);
    }
  };

  const totalItens = itens.length;
  const itensSemEstoque = warehouseMode
    ? itens.filter(i => i.saldo_atual < i.quantidade)
    : itens.filter(i => i.disponibilidade && i.disponibilidade !== 'em_estoque');

  return (
    <div className="almox-page">
      <div className="almox-header">
        <div>
          <h1>Nova Requisição de Material</h1>
          <p>
            {warehouseMode
              ? 'Solicite materiais do almoxarifado'
              : `Solicitação do setor ${setorFixo || form.departamento || '—'}`}
          </p>
        </div>
        <button className="btn-almox-secondary" onClick={() => navigate(listPath)}>
          <FiArrowLeft size={14} /> Voltar
        </button>
      </div>

      <form onSubmit={handleSubmit}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 24, alignItems: 'start' }}>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

            <div style={{ background: 'var(--gmp-surface)', border: '1px solid var(--gmp-border)', borderRadius: 12, padding: 24 }}>
              <div className="almox-section-title">Dados da Requisição</div>
              <div className="almox-form-grid">
                <div className="almox-field">
                  <label className="almox-label">Setor Requisitante</label>
                  {setorReadOnly ? (
                    <input className="almox-input" value={form.departamento} readOnly
                      style={{ background: 'var(--gmp-bg)', cursor: 'not-allowed' }} />
                  ) : (
                    <select className="almox-form-select" value={form.departamento}
                      onChange={e => {
                        setForm(f => ({ ...f, departamento: e.target.value }));
                      }}>
                      <option value="">Selecionar...</option>
                      {(setores.length ? setores : [{ nome: form.departamento }]).map(s => (
                        <option key={s.id || s.nome} value={s.nome}>{s.nome}</option>
                      ))}
                    </select>
                  )}
                </div>
                <div className="almox-field">
                  <label className="almox-label">OS / Referência</label>
                  <input className="almox-input" value={form.os_referencia} onChange={e => setForm(f => ({ ...f, os_referencia: e.target.value }))}
                    placeholder="Ex: OS-0042 / Proj-123" />
                </div>
                <div className="almox-field">
                  <label className="almox-label">Urgência<span className="required">*</span></label>
                  <select className="almox-form-select" value={form.urgencia} onChange={e => setForm(f => ({ ...f, urgencia: e.target.value }))}>
                    <option value="NORMAL">Normal — atendimento padrão</option>
                    <option value="URGENTE">⚠️ Urgente — linha parada</option>
                    <option value="CRITICO">🔴 Crítico — risco de segurança</option>
                  </select>
                </div>
                {form.urgencia !== 'NORMAL' && (
                  <div className="almox-field almox-form-full">
                    <label className="almox-label">Justificativa da urgência<span className="required">*</span></label>
                    <textarea className="almox-textarea" rows={2} value={form.justificativa_urgencia}
                      onChange={e => setForm(f => ({ ...f, justificativa_urgencia: e.target.value }))}
                      placeholder="Descreva o motivo da urgência..." />
                  </div>
                )}
                <div className="almox-field almox-form-full">
                  <label className="almox-label">Observações gerais</label>
                  <textarea className="almox-textarea" rows={2} value={form.observacoes}
                    onChange={e => setForm(f => ({ ...f, observacoes: e.target.value }))}
                    placeholder="Informações adicionais para o almoxarife..." />
                </div>
              </div>
            </div>

            <div style={{ background: 'var(--gmp-surface)', border: '1px solid var(--gmp-border)', borderRadius: 12, padding: 24 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <div className="almox-section-title" style={{ margin: 0 }}>
                  Materiais Solicitados {totalItens > 0 && <span style={{ color: 'var(--gmp-text-light)' }}>({totalItens})</span>}
                </div>
                <button type="button" className="btn-almox-primary" style={{ padding: '6px 14px', fontSize: '0.8rem' }}
                  onClick={() => setShowBusca(true)}>
                  <FiPlus size={13} /> Adicionar Material
                </button>
              </div>

              {!warehouseMode && setorFixo && (
                <div className="almox-hint-banner" style={{ marginBottom: 12, fontSize: '0.8rem' }}>
                  Materiais do almoxarifado para o setor <strong>{setorFixo}</strong>
                  {materiaisLoading ? ' (carregando...)' : ''}.
                  A disponibilidade é exibida por status, sem quantidade exata em estoque.
                </div>
              )}

              {materiaisError && (
                <div style={{ marginBottom: 12, padding: '10px 14px', fontSize: '0.8rem', color: 'var(--gmp-error)', background: 'rgba(229,25,58,0.08)', border: '1px solid rgba(229,25,58,0.25)', borderRadius: 8 }}>
                  {materiaisError}
                </div>
              )}

              {!materiaisLoading && !materiaisError && materiais.length === 0 && (
                <div style={{ marginBottom: 12, padding: '10px 14px', fontSize: '0.8rem', color: 'var(--gmp-text-light)', background: 'var(--gmp-bg)', border: '1px solid var(--gmp-border)', borderRadius: 8 }}>
                  Nenhum material ativo cadastrado no almoxarifado. Solicite o cadastro ao almoxarife antes de abrir a requisição.
                </div>
              )}

              {showBusca && (
                <div style={{ marginBottom: 16, position: 'relative' }}>
                  <div className="almox-search-wrapper">
                    <FiSearch className="almox-search-icon" />
                    <input className="almox-search-input" autoFocus
                      placeholder="Buscar material por nome ou código..."
                      value={busca} onChange={e => setBusca(e.target.value)} />
                  </div>
                  {resultados.length > 0 && (
                    <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'var(--gmp-surface)', border: '1px solid var(--gmp-border)', borderRadius: 8, boxShadow: 'var(--elevation-4)', zIndex: 100, marginTop: 4 }}>
                      {resultados.map(m => (
                        <div key={m.id} onClick={() => adicionarItem(m)}
                          style={{ padding: '10px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12, borderBottom: '1px solid var(--gmp-border)', transition: 'background 0.1s' }}
                          onMouseEnter={e => e.currentTarget.style.background = 'var(--gmp-bg)'}
                          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                          <div className="almox-foto-placeholder" style={{ width: 32, height: 32, fontSize: 14 }}>
                            {m.foto ? <img src={m.foto} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 6 }} /> : <FiPackage />}
                          </div>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>{m.nome}</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--gmp-text-light)', display: 'flex', alignItems: 'center', gap: 8 }}>
                              {m.codigo}
                              {warehouseMode ? (
                                <span>· Saldo: {m.quantidade_atual} {m.unidade}</span>
                              ) : (
                                <DisponibilidadeBadge disponibilidade={m.disponibilidade} />
                              )}
                            </div>
                          </div>
                          <FiPlus size={14} style={{ color: '#4facfe' }} />
                        </div>
                      ))}
                    </div>
                  )}
                  {busca.length >= 2 && resultados.length === 0 && (
                    <div style={{ padding: '10px 16px', color: 'var(--gmp-text-light)', fontSize: '0.875rem', background: 'var(--gmp-bg)', border: '1px solid var(--gmp-border)', borderRadius: 8, marginTop: 4 }}>
                      {materiaisLoading
                        ? 'Carregando materiais...'
                        : materiais.length === 0
                          ? 'Nenhum material disponível para requisição neste setor.'
                          : `Nenhum material encontrado para "${busca}"`}
                    </div>
                  )}
                  <button type="button" onClick={() => { setShowBusca(false); setBusca(''); }}
                    style={{ marginTop: 8, fontSize: '0.8rem', color: 'var(--gmp-text-light)', background: 'none', border: 'none', cursor: 'pointer' }}>
                    Cancelar busca
                  </button>
                </div>
              )}

              {itens.length === 0 ? (
                <div className="almox-empty" style={{ padding: '32px 20px' }}>
                  <FiPackage size={36} style={{ opacity: 0.25, display: 'block', margin: '0 auto 10px' }} />
                  <p>Nenhum material adicionado ainda</p>
                </div>
              ) : (
                <>
                  {itensSemEstoque.length > 0 && (
                    <div style={{ background: 'rgba(229,152,0,0.08)', border: '1px solid rgba(229,152,0,0.25)', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: '0.8rem', color: 'var(--gmp-warning)', display: 'flex', gap: 8, alignItems: 'center' }}>
                      <FiAlertTriangle size={14} />
                      {warehouseMode ? (
                        <span>{itensSemEstoque.length} item(ns) com saldo insuficiente. A requisição será registrada mas pode não ser atendida integralmente.</span>
                      ) : (
                        <span>{itensSemEstoque.length} item(ns) com disponibilidade parcial ou sem estoque. O setor de Compras será notificado automaticamente ao enviar.</span>
                      )}
                    </div>
                  )}
                  {itens.map((item) => (
                    <div key={item.material_id} style={{ padding: '14px 0', borderBottom: '1px solid var(--gmp-border)', display: 'grid', gridTemplateColumns: 'auto 1fr auto auto', gap: 14, alignItems: 'start' }}>
                      <div style={{ width: 36, height: 36, borderRadius: 8, background: 'var(--gmp-bg)', border: '1px solid var(--gmp-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>
                        {item.tipo_icone || <FiPackage size={16} />}
                      </div>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>{item.material_nome}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--gmp-text-light)', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          {item.material_codigo}
                          {warehouseMode ? (
                            <span style={{ color: item.saldo_atual < item.quantidade ? 'var(--gmp-warning)' : 'inherit' }}>
                              · Saldo: {item.saldo_atual} {item.unidade}
                              {item.saldo_atual < item.quantidade && ' ⚠ Insuficiente'}
                            </span>
                          ) : (
                            <DisponibilidadeBadge disponibilidade={item.disponibilidade} />
                          )}
                        </div>
                        <input className="almox-input" style={{ marginTop: 6, fontSize: '0.8rem', padding: '4px 8px' }}
                          value={item.observacoes} onChange={e => atualizarItem(item.material_id, 'observacoes', e.target.value)}
                          placeholder="Obs. deste item (opcional)" />
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                        <input className="almox-count-input" type="number" min="1" step="1"
                          value={item.quantidade}
                          onChange={e => atualizarItem(item.material_id, 'quantidade', e.target.value)} />
                        <div style={{ fontSize: '0.7rem', color: 'var(--gmp-text-light)' }}>{item.unidade}</div>
                      </div>
                      <button type="button" className="almox-btn-icon danger" onClick={() => removerItem(item.material_id)}>
                        <FiTrash2 size={14} />
                      </button>
                    </div>
                  ))}
                </>
              )}
            </div>
          </div>

          <div style={{ position: 'sticky', top: 80, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ background: 'var(--gmp-surface)', border: '1px solid var(--gmp-border)', borderRadius: 12, padding: 20 }}>
              <div className="almox-section-title" style={{ marginTop: 0 }}>Resumo</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {[
                  ['Solicitante', user?.nome || '—'],
                  ['Setor', form.departamento || '—'],
                  ['Total de itens', totalItens],
                  ['Urgência', form.urgencia],
                  ['OS / Ref.', form.os_referencia || '—'],
                ].map(([k, v]) => (
                  <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem' }}>
                    <span style={{ color: 'var(--gmp-text-light)' }}>{k}</span>
                    <span style={{ fontWeight: 600 }}>{v}</span>
                  </div>
                ))}
              </div>
            </div>

            {form.urgencia === 'CRITICO' && (
              <div style={{ background: 'rgba(229,25,58,0.08)', border: '1px solid rgba(229,25,58,0.25)', borderRadius: 10, padding: '14px 16px', fontSize: '0.8rem', color: 'var(--gmp-error)' }}>
                🔴 Requisição crítica. O almoxarife será notificado imediatamente.
              </div>
            )}

            <button type="submit" className="btn-almox-primary" disabled={saving || itens.length === 0}
              style={{ justifyContent: 'center', padding: '12px' }}>
              <FiSend size={14} /> {saving ? 'Enviando...' : 'Enviar Requisição'}
            </button>
            <button type="button" className="btn-almox-secondary" style={{ justifyContent: 'center' }}
              onClick={() => navigate(listPath)}>
              Cancelar
            </button>
          </div>
        </div>
      </form>
    </div>
  );
};

export default RequisicaoForm;
