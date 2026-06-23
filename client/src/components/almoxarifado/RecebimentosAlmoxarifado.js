import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../../services/api';
import { toast } from 'react-toastify';
import { SkeletonTable } from '../SkeletonLoader';
import AlmoxPageHeader from './AlmoxPageHeader';
import {
  FiPlus, FiRefreshCw, FiPackage, FiCheck, FiTruck, FiSearch, FiX
} from 'react-icons/fi';
import './Almoxarifado.css';

const STATUS_INFO = {
  RECEBIDO: { label: 'Recebido', cls: 'aberto' },
  EM_CONFERENCIA: { label: 'Em Conferência', cls: 'ajuste' },
  APROVADO: { label: 'Aprovado', cls: 'concluido' },
  REPROVADO: { label: 'Reprovado', cls: 'saida' },
  PARCIALMENTE_APROVADO: { label: 'Parcial', cls: 'ajuste' },
  BLOQUEADO: { label: 'Bloqueado', cls: 'saida' },
};

const RecebimentosAlmoxarifado = () => {
  const [recebimentos, setRecebimentos] = useState([]);
  const [materiais, setMateriais] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtroStatus, setFiltroStatus] = useState('');
  const [detalhe, setDetalhe] = useState(null);
  const [loadingDetalhe, setLoadingDetalhe] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showNovo, setShowNovo] = useState(false);
  const [buscaMat, setBuscaMat] = useState('');
  const [form, setForm] = useState({
    nota_fiscal: '',
    fornecedor_nome: '',
    observacoes: '',
    itens: [],
  });

  useEffect(() => {
    loadRecebimentos();
    loadMateriais();
  }, [filtroStatus]);

  const loadRecebimentos = async () => {
    setLoading(true);
    try {
      const params = {};
      if (filtroStatus) params.status = filtroStatus;
      const res = await api.get('/almoxarifado/recebimentos', { params });
      setRecebimentos(res.data || []);
    } catch {
      toast.error('Erro ao carregar recebimentos');
    } finally {
      setLoading(false);
    }
  };

  const loadMateriais = async () => {
    try {
      const res = await api.get('/almoxarifado/materiais');
      setMateriais(res.data || []);
    } catch { /* ignore */ }
  };

  const abrirDetalhe = async (id) => {
    setLoadingDetalhe(true);
    try {
      const res = await api.get(`/almoxarifado/recebimentos/${id}`);
      setDetalhe(res.data);
    } catch {
      toast.error('Erro ao carregar recebimento');
    } finally {
      setLoadingDetalhe(false);
    }
  };

  const adicionarItem = (material) => {
    if (form.itens.find(i => i.material_id === material.id)) {
      toast.info('Material já incluído');
      return;
    }
    setForm(f => ({
      ...f,
      itens: [...f.itens, {
        material_id: material.id,
        material_nome: material.nome,
        material_codigo: material.codigo,
        unidade: material.unidade,
        quantidade: 1,
      }],
    }));
    setBuscaMat('');
  };

  const removerItem = (material_id) => {
    setForm(f => ({ ...f, itens: f.itens.filter(i => i.material_id !== material_id) }));
  };

  const handleCriar = async (e) => {
    e.preventDefault();
    if (form.itens.length === 0) {
      toast.error('Adicione ao menos um material');
      return;
    }
    setSaving(true);
    try {
      const res = await api.post('/almoxarifado/recebimentos', {
        nota_fiscal: form.nota_fiscal || null,
        fornecedor_nome: form.fornecedor_nome || null,
        observacoes: form.observacoes || null,
        itens: form.itens.map(i => ({
          material_id: i.material_id,
          quantidade: parseFloat(i.quantidade),
          quantidade_esperada: parseFloat(i.quantidade),
          quantidade_recebida: parseFloat(i.quantidade),
        })),
      });
      toast.success(`Recebimento ${res.data.numero} registrado!`);
      setShowNovo(false);
      setForm({ nota_fiscal: '', fornecedor_nome: '', observacoes: '', itens: [] });
      loadRecebimentos();
      abrirDetalhe(res.data.id);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao registrar recebimento');
    } finally {
      setSaving(false);
    }
  };

  const handleAprovar = async (id) => {
    if (!window.confirm('Aprovar recebimento e dar entrada no estoque?')) return;
    setSaving(true);
    try {
      await api.post(`/almoxarifado/recebimentos/${id}/aprovar`, {});
      toast.success('Recebimento aprovado — estoque atualizado!');
      abrirDetalhe(id);
      loadRecebimentos();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao aprovar');
    } finally {
      setSaving(false);
    }
  };

  const formatDate = (d) => d
    ? new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
    : '—';

  const materiaisFiltrados = buscaMat.length >= 2
    ? materiais.filter(m =>
      m.nome.toLowerCase().includes(buscaMat.toLowerCase()) ||
      m.codigo.toLowerCase().includes(buscaMat.toLowerCase())
    ).slice(0, 6)
    : [];

  return (
    <div className="almox-page">
      <AlmoxPageHeader
        title="Recebimentos de Material"
        subtitle="Registre entradas de compra com conferência e aprovação"
        breadcrumbs={[{ label: 'Recebimentos' }]}
        flowSteps={[
          { label: 'Registrar' },
          { label: 'Conferir' },
          { label: 'Aprovar entrada' },
        ]}
        currentStep={detalhe ? (detalhe.status === 'APROVADO' ? 3 : detalhe.status === 'EM_CONFERENCIA' ? 2 : 1) : 0}
        actions={
          <>
            <button className="btn-almox-secondary" onClick={loadRecebimentos}>
              <FiRefreshCw size={13} />
            </button>
            <button className="btn-almox-primary" onClick={() => setShowNovo(true)}>
              <FiPlus size={14} /> Novo Recebimento
            </button>
          </>
        }
      />

      <div className="almox-hint-banner">
        <FiTruck size={16} />
        <span>
          Após registrar o recebimento, confira os itens e aprove para dar entrada automática no estoque.
          Para movimentações avulsas, use{' '}
          <Link to="/almoxarifado/movimentacoes">Movimentações</Link>.
        </span>
      </div>

      <div className="almox-filters">
        <select className="almox-select" value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)}>
          <option value="">Todos os status</option>
          {Object.entries(STATUS_INFO).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: detalhe ? '1fr 400px' : '1fr', gap: 20 }}>
        <div className="almox-table-container">
          {loading ? <SkeletonTable rows={8} columns={5} /> : recebimentos.length === 0 ? (
            <div className="almox-empty">
              <FiPackage size={40} style={{ opacity: 0.3, display: 'block', margin: '0 auto 12px' }} />
              <p>Nenhum recebimento registrado</p>
              <button className="btn-almox-primary" style={{ marginTop: 12 }} onClick={() => setShowNovo(true)}>
                Registrar primeiro recebimento
              </button>
            </div>
          ) : (
            <table className="almox-table">
              <thead>
                <tr>
                  <th>Número</th>
                  <th>NF</th>
                  <th>Fornecedor</th>
                  <th>Status</th>
                  <th>Data</th>
                </tr>
              </thead>
              <tbody>
                {recebimentos.map(r => {
                  const st = STATUS_INFO[r.status] || { label: r.status, cls: 'ajuste' };
                  return (
                    <tr key={r.id} style={{ cursor: 'pointer', background: detalhe?.id === r.id ? 'rgba(79,172,254,0.06)' : '' }}
                      onClick={() => abrirDetalhe(r.id)}>
                      <td style={{ fontWeight: 700, fontFamily: 'monospace', color: '#4facfe' }}>{r.numero}</td>
                      <td>{r.nota_fiscal || '—'}</td>
                      <td>{r.fornecedor_nome || '—'}</td>
                      <td><span className={`almox-badge almox-badge-${st.cls}`}>{st.label}</span></td>
                      <td style={{ fontSize: '0.75rem', color: 'var(--gmp-text-light)' }}>{formatDate(r.created_at)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {detalhe && (
          <div className="almox-detail-panel">
            <div className="almox-detail-panel-header">
              <div>
                <div style={{ fontWeight: 700, fontFamily: 'monospace', color: '#4facfe' }}>{detalhe.numero}</div>
                <span className={`almox-badge almox-badge-${STATUS_INFO[detalhe.status]?.cls || 'ajuste'}`}>
                  {STATUS_INFO[detalhe.status]?.label || detalhe.status}
                </span>
              </div>
              <button className="almox-modal-close" onClick={() => setDetalhe(null)}>✕</button>
            </div>
            {loadingDetalhe ? (
              <div className="almox-loading"><FiRefreshCw size={16} style={{ animation: 'spin 1s linear infinite' }} /></div>
            ) : (
              <div style={{ padding: 20 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16, fontSize: '0.85rem' }}>
                  <div><span style={{ color: 'var(--gmp-text-light)', fontSize: '0.7rem' }}>NF</span><br />{detalhe.nota_fiscal || '—'}</div>
                  <div><span style={{ color: 'var(--gmp-text-light)', fontSize: '0.7rem' }}>Fornecedor</span><br />{detalhe.fornecedor_nome || '—'}</div>
                  <div><span style={{ color: 'var(--gmp-text-light)', fontSize: '0.7rem' }}>Responsável</span><br />{detalhe.responsavel_nome || '—'}</div>
                  <div><span style={{ color: 'var(--gmp-text-light)', fontSize: '0.7rem' }}>Data</span><br />{formatDate(detalhe.created_at)}</div>
                </div>
                {detalhe.observacoes && (
                  <div className="almox-hint-banner" style={{ marginBottom: 16, fontSize: '0.8rem' }}>{detalhe.observacoes}</div>
                )}
                <div style={{ fontWeight: 700, fontSize: '0.75rem', textTransform: 'uppercase', marginBottom: 10 }}>
                  Itens ({detalhe.itens?.length || 0})
                </div>
                {(detalhe.itens || []).map(item => (
                  <div key={item.id} style={{ display: 'flex', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--gmp-border)', fontSize: '0.85rem' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600 }}>{item.material_nome}</div>
                      <div style={{ color: 'var(--gmp-text-light)', fontSize: '0.75rem' }}>{item.material_codigo}</div>
                    </div>
                    <div style={{ fontWeight: 700 }}>{item.quantidade_recebida || item.quantidade_esperada}</div>
                  </div>
                ))}
                {detalhe.status !== 'APROVADO' && detalhe.status !== 'REPROVADO' && (
                  <button className="btn-almox-primary" style={{ width: '100%', justifyContent: 'center', marginTop: 16 }}
                    onClick={() => handleAprovar(detalhe.id)} disabled={saving}>
                    <FiCheck size={14} /> Aprovar e Dar Entrada no Estoque
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {showNovo && (
        <div className="almox-modal-overlay" onClick={() => setShowNovo(false)}>
          <div className="almox-modal" onClick={e => e.stopPropagation()}>
            <div className="almox-modal-header">
              <h2>📥 Novo Recebimento</h2>
              <button className="almox-modal-close" onClick={() => setShowNovo(false)}>✕</button>
            </div>
            <form onSubmit={handleCriar}>
              <div className="almox-modal-body">
                <div className="almox-form-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
                  <div className="almox-field">
                    <label className="almox-label">Nota Fiscal</label>
                    <input className="almox-input" value={form.nota_fiscal}
                      onChange={e => setForm(f => ({ ...f, nota_fiscal: e.target.value }))} placeholder="NF 12345" />
                  </div>
                  <div className="almox-field">
                    <label className="almox-label">Fornecedor</label>
                    <input className="almox-input" value={form.fornecedor_nome}
                      onChange={e => setForm(f => ({ ...f, fornecedor_nome: e.target.value }))} placeholder="Nome do fornecedor" />
                  </div>
                  <div className="almox-field almox-form-full">
                    <label className="almox-label">Observações</label>
                    <input className="almox-input" value={form.observacoes}
                      onChange={e => setForm(f => ({ ...f, observacoes: e.target.value }))} />
                  </div>
                </div>

                <div style={{ marginTop: 16 }}>
                  <label className="almox-label">Materiais recebidos</label>
                  <div className="almox-search-wrapper" style={{ marginBottom: 8 }}>
                    <FiSearch className="almox-search-icon" />
                    <input className="almox-search-input" placeholder="Buscar material..."
                      value={buscaMat} onChange={e => setBuscaMat(e.target.value)} />
                  </div>
                  {materiaisFiltrados.length > 0 && (
                    <div className="almox-search-results">
                      {materiaisFiltrados.map(m => (
                        <button key={m.id} type="button" className="almox-search-result-item" onClick={() => adicionarItem(m)}>
                          <span>{m.codigo} — {m.nome}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {form.itens.map(item => (
                    <div key={item.material_id} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                      <div style={{ flex: 1, fontSize: '0.85rem' }}>
                        <strong>{item.material_nome}</strong>
                        <div style={{ color: 'var(--gmp-text-light)', fontSize: '0.75rem' }}>{item.material_codigo}</div>
                      </div>
                      <input className="almox-count-input" type="number" min="1" step="1" required
                        value={item.quantidade}
                        onChange={e => setForm(f => ({
                          ...f,
                          itens: f.itens.map(i => i.material_id === item.material_id ? { ...i, quantidade: e.target.value } : i),
                        }))} />
                      <span style={{ fontSize: '0.75rem', color: 'var(--gmp-text-light)' }}>{item.unidade}</span>
                      <button type="button" className="almox-btn-icon danger" onClick={() => removerItem(item.material_id)}>
                        <FiX />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
              <div className="almox-modal-footer">
                <button type="button" className="btn-almox-secondary" onClick={() => setShowNovo(false)}>Cancelar</button>
                <button type="submit" className="btn-almox-primary" disabled={saving || form.itens.length === 0}>
                  {saving ? 'Salvando...' : 'Registrar Recebimento'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default RecebimentosAlmoxarifado;
