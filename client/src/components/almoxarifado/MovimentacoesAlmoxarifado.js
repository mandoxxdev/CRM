import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import api from '../../services/api';
import { toast } from 'react-toastify';
import { FiPlus, FiSearch, FiRefreshCw, FiArrowUp, FiArrowDown } from 'react-icons/fi';
import { SkeletonTable } from '../SkeletonLoader';
import './Almoxarifado.css';

const TIPOS = [
  { value: 'ENTRADA', label: 'Entrada', cls: 'entrada' },
  { value: 'SAIDA', label: 'Saída', cls: 'saida' },
  { value: 'AJUSTE', label: 'Ajuste', cls: 'ajuste' },
  { value: 'DEVOLUCAO', label: 'Devolução', cls: 'devolucao' },
];

const MovimentacoesAlmoxarifado = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [movimentacoes, setMovimentacoes] = useState([]);
  const [materiais, setMateriais] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tipoFilter, setTipoFilter] = useState('');
  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim] = useState('');
  const [showModal, setShowModal] = useState(false);

  const [form, setForm] = useState({
    material_id: '',
    tipo: 'ENTRADA',
    quantidade: '',
    motivo: '',
    referencia: '',
    observacoes: ''
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadMateriais();
    loadMovimentacoes();
  }, []);

  useEffect(() => {
    if (location.pathname.endsWith('/novo')) {
      setShowModal(true);
    }
    const params = new URLSearchParams(location.search);
    const matId = params.get('material_id');
    if (matId) {
      setForm(f => ({ ...f, material_id: matId }));
      setShowModal(true);
    }
  }, [location.pathname, location.search]);

  useEffect(() => {
    const t = setTimeout(loadMovimentacoes, 300);
    return () => clearTimeout(t);
  }, [tipoFilter, dataInicio, dataFim]);

  const loadMateriais = async () => {
    try {
      const res = await api.get('/almoxarifado/materiais');
      setMateriais(res.data);
    } catch { /* silently fail */ }
  };

  const loadMovimentacoes = async () => {
    setLoading(true);
    try {
      const params = { limit: 200 };
      if (tipoFilter) params.tipo = tipoFilter;
      if (dataInicio) params.data_inicio = dataInicio;
      if (dataFim) params.data_fim = dataFim;
      const res = await api.get('/almoxarifado/movimentacoes', { params });
      setMovimentacoes(res.data);
    } catch {
      toast.error('Erro ao carregar movimentações');
    } finally {
      setLoading(false);
    }
  };

  const openModal = () => {
    setForm({ material_id: '', tipo: 'ENTRADA', quantidade: '', motivo: '', referencia: '', observacoes: '' });
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.material_id || !form.quantidade || parseFloat(form.quantidade) <= 0) {
      toast.error('Selecione o material e informe a quantidade');
      return;
    }
    setSaving(true);
    try {
      await api.post('/almoxarifado/movimentacoes', {
        ...form,
        quantidade: parseFloat(form.quantidade)
      });
      toast.success('Movimentação registrada!');
      setShowModal(false);
      if (location.pathname.endsWith('/novo')) {
        navigate('/almoxarifado/movimentacoes', { replace: true });
      }
      loadMovimentacoes();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao registrar movimentação');
    } finally {
      setSaving(false);
    }
  };

  const tipoInfo = (tipo) => TIPOS.find(t => t.value === tipo) || { label: tipo, cls: 'ajuste' };

  const formatDate = (d) => new Date(d).toLocaleDateString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
  });

  const selectedMaterial = materiais.find(m => m.id === parseInt(form.material_id));

  return (
    <div className="almox-page">
      <div className="almox-header">
        <div>
          <h1>Movimentações de Estoque</h1>
          <p>{movimentacoes.length} registro{movimentacoes.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="almox-header-actions">
          <button className="btn-almox-secondary" onClick={loadMovimentacoes}>
            <FiRefreshCw size={13} /> Atualizar
          </button>
          <button className="btn-almox-primary" onClick={openModal}>
            <FiPlus size={14} /> Nova Movimentação
          </button>
        </div>
      </div>

      {/* Filtros */}
      <div className="almox-filters">
        <select className="almox-select" value={tipoFilter} onChange={e => setTipoFilter(e.target.value)}>
          <option value="">Todos os tipos</option>
          {TIPOS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input type="date" className="almox-input" style={{ width: 'auto' }}
            value={dataInicio} onChange={e => setDataInicio(e.target.value)} />
          <span style={{ color: 'var(--gmp-text-light)', fontSize: '0.8rem' }}>até</span>
          <input type="date" className="almox-input" style={{ width: 'auto' }}
            value={dataFim} onChange={e => setDataFim(e.target.value)} />
        </div>
        {(tipoFilter || dataInicio || dataFim) && (
          <button className="btn-almox-secondary" onClick={() => { setTipoFilter(''); setDataInicio(''); setDataFim(''); }}>
            Limpar
          </button>
        )}
      </div>

      {/* Tabela */}
      <div className="almox-table-container">
        {loading ? <SkeletonTable rows={10} columns={7} /> : movimentacoes.length === 0 ? (
          <div className="almox-empty"><p>Nenhuma movimentação encontrada</p></div>
        ) : (
          <table className="almox-table">
            <thead>
              <tr>
                <th>Data</th>
                <th>Tipo</th>
                <th>Material</th>
                <th>Quantidade</th>
                <th>Saldo Anterior</th>
                <th>Saldo Posterior</th>
                <th>Motivo / Referência</th>
                <th>Usuário</th>
              </tr>
            </thead>
            <tbody>
              {movimentacoes.map(m => {
                const t = tipoInfo(m.tipo);
                return (
                  <tr key={m.id}>
                    <td style={{ fontSize: '0.8rem', color: 'var(--gmp-text-light)', whiteSpace: 'nowrap' }}>
                      {formatDate(m.created_at)}
                    </td>
                    <td>
                      <span className={`almox-badge almox-badge-${t.cls}`}>
                        {m.tipo === 'ENTRADA' || m.tipo === 'DEVOLUCAO' ? <FiArrowUp size={10} /> : <FiArrowDown size={10} />}
                        {t.label}
                      </span>
                    </td>
                    <td>
                      <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>{m.material_nome}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--gmp-text-light)' }}>{m.material_codigo}</div>
                    </td>
                    <td>
                      <span style={{
                        fontWeight: 700,
                        color: m.tipo === 'SAIDA' ? 'var(--gmp-error)' : 'var(--gmp-success)',
                        fontSize: '0.9rem'
                      }}>
                        {m.tipo === 'SAIDA' ? '-' : '+'}{m.quantidade} {m.unidade}
                      </span>
                    </td>
                    <td style={{ color: 'var(--gmp-text-light)' }}>{m.saldo_anterior} {m.unidade}</td>
                    <td style={{ fontWeight: 600 }}>{m.saldo_posterior} {m.unidade}</td>
                    <td>
                      {m.motivo && <div style={{ fontSize: '0.875rem' }}>{m.motivo}</div>}
                      {m.referencia && <div style={{ fontSize: '0.75rem', color: 'var(--gmp-text-light)' }}>📋 {m.referencia}</div>}
                    </td>
                    <td style={{ fontSize: '0.8rem', color: 'var(--gmp-text-light)' }}>{m.usuario_nome}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal nova movimentação */}
      {showModal && (
        <div className="almox-modal-overlay" onClick={() => {
          setShowModal(false);
          if (location.pathname.endsWith('/novo')) navigate('/almoxarifado/movimentacoes', { replace: true });
        }}>
          <div className="almox-modal" onClick={e => e.stopPropagation()}>
            <div className="almox-modal-header">
              <h2>📦 Registrar Movimentação</h2>
              <button className="almox-modal-close" onClick={() => {
                setShowModal(false);
                if (location.pathname.endsWith('/novo')) navigate('/almoxarifado/movimentacoes', { replace: true });
              }}>✕</button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="almox-modal-body">
                <div className="almox-form-grid">
                  <div className="almox-field almox-form-full">
                    <label className="almox-label">Material<span className="required">*</span></label>
                    <select className="almox-form-select" value={form.material_id}
                      onChange={e => setForm(f => ({ ...f, material_id: e.target.value }))} required>
                      <option value="">Selecionar material...</option>
                      {materiais.map(m => (
                        <option key={m.id} value={m.id}>
                          {m.codigo} — {m.nome} (Saldo: {m.quantidade_atual} {m.unidade})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="almox-field">
                    <label className="almox-label">Tipo<span className="required">*</span></label>
                    <select className="almox-form-select" value={form.tipo}
                      onChange={e => setForm(f => ({ ...f, tipo: e.target.value }))}>
                      {TIPOS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                  </div>
                  <div className="almox-field">
                    <label className="almox-label">
                      {form.tipo === 'AJUSTE' ? 'Novo Saldo' : 'Quantidade'}
                      <span className="required">*</span>
                    </label>
                    <input className="almox-input" type="number" min="0" step="1"
                      value={form.quantidade} onChange={e => setForm(f => ({ ...f, quantidade: e.target.value }))}
                      placeholder="0" required />
                    {selectedMaterial && form.tipo === 'SAIDA' && (
                      <small style={{ color: 'var(--gmp-text-light)', fontSize: '0.75rem' }}>
                        Disponível: {selectedMaterial.quantidade_atual} {selectedMaterial.unidade}
                      </small>
                    )}
                  </div>
                  <div className="almox-field">
                    <label className="almox-label">Motivo</label>
                    <input className="almox-input" value={form.motivo}
                      onChange={e => setForm(f => ({ ...f, motivo: e.target.value }))}
                      placeholder="Compra, Uso produção, Retorno, etc." />
                  </div>
                  <div className="almox-field">
                    <label className="almox-label">Referência (OS / NF)</label>
                    <input className="almox-input" value={form.referencia}
                      onChange={e => setForm(f => ({ ...f, referencia: e.target.value }))}
                      placeholder="OS-0042 / NF 1234" />
                  </div>
                  <div className="almox-field almox-form-full">
                    <label className="almox-label">Observações</label>
                    <textarea className="almox-textarea" rows={2} value={form.observacoes}
                      onChange={e => setForm(f => ({ ...f, observacoes: e.target.value }))} />
                  </div>
                </div>
              </div>
              <div className="almox-modal-footer">
                <button type="button" className="btn-almox-secondary" onClick={() => setShowModal(false)}>Cancelar</button>
                <button type="submit" className="btn-almox-primary" disabled={saving}>
                  {saving ? 'Registrando...' : 'Confirmar Movimentação'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default MovimentacoesAlmoxarifado;
