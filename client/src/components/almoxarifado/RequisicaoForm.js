import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api';
import { toast } from 'react-toastify';
import { useAuth } from '../../context/AuthContext';
import { FiPlus, FiTrash2, FiArrowLeft, FiSend, FiSearch, FiPackage, FiAlertTriangle } from 'react-icons/fi';
import './Almoxarifado.css';

const DEPARTAMENTOS = ['Produção', 'Manutenção', 'Qualidade', 'Engenharia', 'Logística', 'Administrativo', 'P&D', 'Segurança'];

const RequisicaoForm = () => {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [materiais, setMateriais] = useState([]);
  const [busca, setBusca] = useState('');
  const [resultados, setResultados] = useState([]);
  const [showBusca, setShowBusca] = useState(false);

  const [form, setForm] = useState({
    departamento: '',
    os_referencia: '',
    urgencia: 'NORMAL',
    observacoes: '',
    justificativa_urgencia: '',
  });

  const [itens, setItens] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadMateriais();
  }, []);

  useEffect(() => {
    if (busca.length < 2) { setResultados([]); return; }
    const filtered = materiais.filter(m =>
      m.nome.toLowerCase().includes(busca.toLowerCase()) ||
      m.codigo.toLowerCase().includes(busca.toLowerCase())
    ).slice(0, 8);
    setResultados(filtered);
  }, [busca, materiais]);

  const loadMateriais = async () => {
    try {
      const res = await api.get('/almoxarifado/materiais');
      setMateriais(res.data);
    } catch { /* silently fail */ }
  };

  const adicionarItem = (material) => {
    if (itens.find(i => i.material_id === material.id)) {
      toast.info(`${material.nome} já está na lista`);
      setShowBusca(false);
      setBusca('');
      return;
    }
    setItens(prev => [...prev, {
      material_id: material.id,
      material_nome: material.nome,
      material_codigo: material.codigo,
      unidade: material.unidade,
      saldo_atual: material.quantidade_atual,
      tipo_icone: material.tipo_icone || '',
      quantidade: 1,
      observacoes: '',
    }]);
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
    if (itens.length === 0) { toast.error('Adicione ao menos um material'); return; }
    if (form.urgencia !== 'NORMAL' && !form.justificativa_urgencia) {
      toast.error('Justifique a urgência para requisições urgentes/críticas');
      return;
    }
    setSaving(true);
    try {
      const res = await api.post('/almoxarifado/requisicoes', {
        ...form,
        itens: itens.map(i => ({
          material_id: i.material_id,
          quantidade: parseFloat(i.quantidade),
          observacoes: i.observacoes
        }))
      });
      toast.success(`Requisição ${res.data.numero} criada! ${res.data.aprovacao === 'automatica' ? '(Aprovação automática)' : 'Aguardando aprovação.'}`);
      navigate('/almoxarifado/requisicoes');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao criar requisição');
    } finally {
      setSaving(false);
    }
  };

  const totalItens = itens.length;
  const itensSemSaldo = itens.filter(i => i.saldo_atual < i.quantidade);

  return (
    <div className="almox-page">
      <div className="almox-header">
        <div>
          <h1>Nova Requisição de Material</h1>
          <p>Solicite materiais do almoxarifado para a fábrica</p>
        </div>
        <button className="btn-almox-secondary" onClick={() => navigate('/almoxarifado/requisicoes')}>
          <FiArrowLeft size={14} /> Voltar
        </button>
      </div>

      <form onSubmit={handleSubmit}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 24, alignItems: 'start' }}>

          {/* Coluna principal */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

            {/* Dados da requisição */}
            <div style={{ background: 'var(--gmp-surface)', border: '1px solid var(--gmp-border)', borderRadius: 12, padding: 24 }}>
              <div className="almox-section-title">Dados da Requisição</div>
              <div className="almox-form-grid">
                <div className="almox-field">
                  <label className="almox-label">Departamento / Setor</label>
                  <select className="almox-form-select" value={form.departamento} onChange={e => setForm(f => ({ ...f, departamento: e.target.value }))}>
                    <option value="">Selecionar...</option>
                    {DEPARTAMENTOS.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
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

            {/* Itens */}
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

              {/* Busca */}
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
                            <div style={{ fontSize: '0.75rem', color: 'var(--gmp-text-light)' }}>{m.codigo} · Saldo: {m.quantidade_atual} {m.unidade}</div>
                          </div>
                          <FiPlus size={14} style={{ color: '#4facfe' }} />
                        </div>
                      ))}
                    </div>
                  )}
                  {busca.length >= 2 && resultados.length === 0 && (
                    <div style={{ padding: '10px 16px', color: 'var(--gmp-text-light)', fontSize: '0.875rem', background: 'var(--gmp-bg)', border: '1px solid var(--gmp-border)', borderRadius: 8, marginTop: 4 }}>
                      Nenhum material encontrado para "{busca}"
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
                  {itensSemSaldo.length > 0 && (
                    <div style={{ background: 'rgba(229,152,0,0.08)', border: '1px solid rgba(229,152,0,0.25)', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: '0.8rem', color: 'var(--gmp-warning)', display: 'flex', gap: 8, alignItems: 'center' }}>
                      <FiAlertTriangle size={14} />
                      {itensSemSaldo.length} item(ns) com saldo insuficiente. A requisição será registrada mas pode não ser atendida integralmente.
                    </div>
                  )}
                  {itens.map((item, idx) => (
                    <div key={item.material_id} style={{ padding: '14px 0', borderBottom: '1px solid var(--gmp-border)', display: 'grid', gridTemplateColumns: 'auto 1fr auto auto', gap: 14, alignItems: 'start' }}>
                      <div style={{ width: 36, height: 36, borderRadius: 8, background: 'var(--gmp-bg)', border: '1px solid var(--gmp-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>
                        {item.tipo_icone || <FiPackage size={16} />}
                      </div>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>{item.material_nome}</div>
                        <div style={{ fontSize: '0.75rem', color: item.saldo_atual < item.quantidade ? 'var(--gmp-warning)' : 'var(--gmp-text-light)' }}>
                          {item.material_codigo} · Saldo: {item.saldo_atual} {item.unidade}
                          {item.saldo_atual < item.quantidade && ' ⚠ Insuficiente'}
                        </div>
                        <input className="almox-input" style={{ marginTop: 6, fontSize: '0.8rem', padding: '4px 8px' }}
                          value={item.observacoes} onChange={e => atualizarItem(item.material_id, 'observacoes', e.target.value)}
                          placeholder="Obs. deste item (opcional)" />
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                        <input className="almox-count-input" type="number" min="0.01" step="0.01"
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

          {/* Resumo lateral */}
          <div style={{ position: 'sticky', top: 80, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ background: 'var(--gmp-surface)', border: '1px solid var(--gmp-border)', borderRadius: 12, padding: 20 }}>
              <div className="almox-section-title" style={{ marginTop: 0 }}>Resumo</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {[
                  ['Solicitante', user?.nome || '—'],
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
              onClick={() => navigate('/almoxarifado/requisicoes')}>
              Cancelar
            </button>
          </div>
        </div>
      </form>
    </div>
  );
};

export default RequisicaoForm;
