import React, { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import api from '../../services/api';
import { toast } from 'react-toastify';
import { SkeletonTable } from '../SkeletonLoader';
import {
  FiPlus, FiSearch, FiEdit, FiTrash2, FiImage, FiPackage,
  FiArrowUp, FiArrowDown, FiAlertTriangle, FiRefreshCw
} from 'react-icons/fi';
import './Almoxarifado.css';

const CATEGORIAS = [
  'CONSUMÍVEL', 'FERRAMENTA', 'EPI', 'ELÉTRICO', 'HIDRÁULICO',
  'MECÂNICO', 'INSUMO', 'EMBALAGEM', 'ESCRITÓRIO', 'LIMPEZA', 'OUTROS'
];

const MateriaisAlmoxarifado = () => {
  const [materiais, setMateriais] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [categoria, setCategoria] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [showMovModal, setShowMovModal] = useState(false);
  const [selectedMaterial, setSelectedMaterial] = useState(null);
  const [movTipo, setMovTipo] = useState('ENTRADA');
  const [movQtd, setMovQtd] = useState('');
  const [movMotivo, setMovMotivo] = useState('');
  const [movRef, setMovRef] = useState('');
  const [savingMov, setSavingMov] = useState(false);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    const s = searchParams.get('status');
    if (s) setStatusFilter(s);
  }, []);

  useEffect(() => {
    const t = setTimeout(loadMateriais, 300);
    return () => clearTimeout(t);
  }, [search, categoria, statusFilter]);

  const loadMateriais = async () => {
    setLoading(true);
    try {
      const params = {};
      if (search) params.search = search;
      if (categoria) params.categoria = categoria;
      if (statusFilter) params.status = statusFilter;
      const res = await api.get('/almoxarifado/materiais', { params });
      setMateriais(res.data);
    } catch {
      toast.error('Erro ao carregar materiais');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id, nome) => {
    if (!window.confirm(`Inativar o material "${nome}"?`)) return;
    try {
      await api.delete(`/almoxarifado/materiais/${id}`);
      toast.success('Material inativado');
      loadMateriais();
    } catch {
      toast.error('Erro ao inativar material');
    }
  };

  const openMovModal = (material, tipo) => {
    setSelectedMaterial(material);
    setMovTipo(tipo);
    setMovQtd('');
    setMovMotivo('');
    setMovRef('');
    setShowMovModal(true);
  };

  const handleMovimentar = async (e) => {
    e.preventDefault();
    if (!movQtd || parseFloat(movQtd) <= 0) {
      toast.error('Informe uma quantidade válida');
      return;
    }
    setSavingMov(true);
    try {
      await api.post('/almoxarifado/movimentacoes', {
        material_id: selectedMaterial.id,
        tipo: movTipo,
        quantidade: parseFloat(movQtd),
        motivo: movMotivo,
        referencia: movRef
      });
      toast.success(`${movTipo === 'ENTRADA' ? 'Entrada' : 'Saída'} registrada!`);
      setShowMovModal(false);
      loadMateriais();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao registrar movimentação');
    } finally {
      setSavingMov(false);
    }
  };

  const getStatus = (m) => {
    if (m.quantidade_atual === 0) return { label: 'Zerado', cls: 'zerado' };
    if (m.quantidade_minima > 0 && m.quantidade_atual <= m.quantidade_minima) return { label: 'Crítico', cls: 'critico' };
    if (m.quantidade_minima > 0 && m.quantidade_atual <= m.quantidade_minima * 1.5) return { label: 'Baixo', cls: 'baixo' };
    return { label: 'OK', cls: 'ok' };
  };

  const getPct = (m) => {
    if (!m.quantidade_maxima || m.quantidade_maxima === 0) return 50;
    return Math.min(100, (m.quantidade_atual / m.quantidade_maxima) * 100);
  };

  return (
    <div className="almox-page">
      <div className="almox-header">
        <div>
          <h1>Materiais do Almoxarifado</h1>
          <p>{materiais.length} {materiais.length === 1 ? 'material' : 'materiais'}</p>
        </div>
        <div className="almox-header-actions">
          <button className="btn-almox-secondary" onClick={loadMateriais}>
            <FiRefreshCw size={13} /> Atualizar
          </button>
          <Link to="/almoxarifado/materiais/novo" className="btn-almox-primary">
            <FiPlus size={14} /> Novo Material
          </Link>
        </div>
      </div>

      {/* Filtros */}
      <div className="almox-filters">
        <div className="almox-search-wrapper">
          <FiSearch className="almox-search-icon" />
          <input
            className="almox-search-input"
            placeholder="Buscar por nome, código ou fornecedor..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <select className="almox-select" value={categoria} onChange={e => setCategoria(e.target.value)}>
          <option value="">Todas categorias</option>
          {CATEGORIAS.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select className="almox-select" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="">Todos status</option>
          <option value="ok">OK</option>
          <option value="critico">Crítico</option>
          <option value="zerado">Zerado</option>
        </select>
        {(search || categoria || statusFilter) && (
          <button className="btn-almox-secondary" onClick={() => { setSearch(''); setCategoria(''); setStatusFilter(''); }}>
            Limpar filtros
          </button>
        )}
      </div>

      {/* Tabela */}
      <div className="almox-table-container">
        {loading ? (
          <SkeletonTable rows={8} columns={7} />
        ) : materiais.length === 0 ? (
          <div className="almox-empty">
            <FiPackage size={48} style={{ opacity: 0.3, display: 'block', margin: '0 auto 12px' }} />
            <p>Nenhum material encontrado</p>
          </div>
        ) : (
          <table className="almox-table">
            <thead>
              <tr>
                <th>Foto</th>
                <th>Código</th>
                <th>Material</th>
                <th>Categoria</th>
                <th>Quantidade</th>
                <th>Localização</th>
                <th>Status</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {materiais.map(m => {
                const status = getStatus(m);
                const pct = getPct(m);
                return (
                  <tr key={m.id}>
                    <td>
                      {m.foto ? (
                        <img src={m.foto} alt={m.nome} className="almox-foto-thumb" />
                      ) : (
                        <div className="almox-foto-placeholder"><FiImage /></div>
                      )}
                    </td>
                    <td>
                      <span style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: 'var(--gmp-text-light)' }}>
                        {m.codigo}
                      </span>
                    </td>
                    <td>
                      <div style={{ fontWeight: 600, color: 'var(--gmp-text)' }}>{m.nome}</div>
                      {m.fornecedor_principal && (
                        <div style={{ fontSize: '0.75rem', color: 'var(--gmp-text-light)' }}>{m.fornecedor_principal}</div>
                      )}
                    </td>
                    <td>
                      <span style={{ fontSize: '0.8rem', color: 'var(--gmp-text-light)' }}>{m.categoria}</span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div className="almox-stock-bar">
                          <div className={`almox-stock-fill ${status.cls}`} style={{ width: `${pct}%` }} />
                        </div>
                        <span style={{ fontWeight: 600 }}>{m.quantidade_atual}</span>
                        <span style={{ color: 'var(--gmp-text-light)', fontSize: '0.8rem' }}>{m.unidade}</span>
                      </div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--gmp-text-light)' }}>
                        Mín: {m.quantidade_minima > 0 ? m.quantidade_minima : '—'} · Máx: {m.quantidade_maxima > 0 ? m.quantidade_maxima : '—'}
                      </div>
                    </td>
                    <td>
                      <span style={{ fontSize: '0.8rem', color: 'var(--gmp-text-light)' }}>{m.localizacao || '—'}</span>
                    </td>
                    <td>
                      <span className={`almox-badge almox-badge-${status.cls}`}>
                        {status.cls === 'critico' && <FiAlertTriangle size={10} />}
                        {status.label}
                      </span>
                    </td>
                    <td>
                      <div className="almox-actions">
                        <button className="almox-btn-icon success" title="Entrada" onClick={() => openMovModal(m, 'ENTRADA')}>
                          <FiArrowUp />
                        </button>
                        <button className="almox-btn-icon danger" title="Saída" onClick={() => openMovModal(m, 'SAIDA')}>
                          <FiArrowDown />
                        </button>
                        <button className="almox-btn-icon primary" title="Editar" onClick={() => navigate(`/almoxarifado/materiais/editar/${m.id}`)}>
                          <FiEdit />
                        </button>
                        <button className="almox-btn-icon danger" title="Inativar" onClick={() => handleDelete(m.id, m.nome)}>
                          <FiTrash2 />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal movimentação rápida */}
      {showMovModal && selectedMaterial && (
        <div className="almox-modal-overlay" onClick={() => setShowMovModal(false)}>
          <div className="almox-modal almox-modal-sm" onClick={e => e.stopPropagation()}>
            <div className="almox-modal-header">
              <h2>{movTipo === 'ENTRADA' ? '📥 Entrada' : '📤 Saída'} de Material</h2>
              <button className="almox-modal-close" onClick={() => setShowMovModal(false)}>✕</button>
            </div>
            <form onSubmit={handleMovimentar}>
              <div className="almox-modal-body">
                <div style={{ background: 'var(--gmp-bg)', borderRadius: 8, padding: '12px 16px', marginBottom: 16, border: '1px solid var(--gmp-border)' }}>
                  <div style={{ fontWeight: 700, color: 'var(--gmp-text)' }}>{selectedMaterial.nome}</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--gmp-text-light)', marginTop: 4 }}>
                    Saldo atual: <strong>{selectedMaterial.quantidade_atual} {selectedMaterial.unidade}</strong>
                  </div>
                </div>

                <div className="almox-form-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
                  <div className="almox-field almox-form-full">
                    <label className="almox-label">Tipo<span className="required">*</span></label>
                    <select className="almox-form-select" value={movTipo} onChange={e => setMovTipo(e.target.value)}>
                      <option value="ENTRADA">Entrada</option>
                      <option value="SAIDA">Saída</option>
                      <option value="AJUSTE">Ajuste (define saldo)</option>
                      <option value="DEVOLUCAO">Devolução</option>
                    </select>
                  </div>
                  <div className="almox-field almox-form-full">
                    <label className="almox-label">Quantidade<span className="required">*</span></label>
                    <input className="almox-input" type="number" min="0.01" step="0.01"
                      value={movQtd} onChange={e => setMovQtd(e.target.value)} placeholder="0" required />
                  </div>
                  <div className="almox-field">
                    <label className="almox-label">Motivo</label>
                    <input className="almox-input" value={movMotivo} onChange={e => setMovMotivo(e.target.value)} placeholder="Ex: Compra, Uso interno..." />
                  </div>
                  <div className="almox-field">
                    <label className="almox-label">Referência (OS/NF)</label>
                    <input className="almox-input" value={movRef} onChange={e => setMovRef(e.target.value)} placeholder="Ex: OS-0042 / NF 1234" />
                  </div>
                </div>
              </div>
              <div className="almox-modal-footer">
                <button type="button" className="btn-almox-secondary" onClick={() => setShowMovModal(false)}>Cancelar</button>
                <button type="submit" className="btn-almox-primary" disabled={savingMov}>
                  {savingMov ? 'Salvando...' : 'Registrar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default MateriaisAlmoxarifado;
