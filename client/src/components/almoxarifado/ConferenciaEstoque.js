import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import { toast } from 'react-toastify';
import { FiPlus, FiRefreshCw, FiCheckCircle, FiXCircle, FiEye, FiClipboard } from 'react-icons/fi';
import { SkeletonTable } from '../SkeletonLoader';
import './Almoxarifado.css';

const CATEGORIAS = [
  '', 'CONSUMÍVEL', 'FERRAMENTA', 'EPI', 'ELÉTRICO', 'HIDRÁULICO',
  'MECÂNICO', 'INSUMO', 'EMBALAGEM', 'ESCRITÓRIO', 'LIMPEZA', 'OUTROS'
];

const ConferenciaEstoque = () => {
  const [conferencias, setConferencias] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [criarCategoria, setCriarCategoria] = useState('');
  const [criarObs, setCriarObs] = useState('');
  const [creating, setCreating] = useState(false);

  const [confAberta, setConfAberta] = useState(null);
  const [loadingConf, setLoadingConf] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [contagens, setContagens] = useState({});
  const [aplicarAjustes, setAplicarAjustes] = useState(true);

  useEffect(() => {
    loadConferencias();
  }, []);

  const loadConferencias = async () => {
    setLoading(true);
    try {
      const res = await api.get('/almoxarifado/conferencias');
      setConferencias(res.data);
    } catch {
      toast.error('Erro ao carregar conferências');
    } finally {
      setLoading(false);
    }
  };

  const handleCriar = async (e) => {
    e.preventDefault();
    setCreating(true);
    try {
      const res = await api.post('/almoxarifado/conferencias', {
        observacoes: criarObs,
        categoria: criarCategoria || undefined
      });
      toast.success(`Conferência ${res.data.numero} criada com ${res.data.totalItens} itens`);
      setShowCreateModal(false);
      setCriarObs('');
      setCriarCategoria('');
      loadConferencias();
      abrirConferencia(res.data.id);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao criar conferência');
    } finally {
      setCreating(false);
    }
  };

  const abrirConferencia = async (id) => {
    setLoadingConf(true);
    try {
      const res = await api.get(`/almoxarifado/conferencias/${id}`);
      setConfAberta(res.data);
      const initContagens = {};
      res.data.itens.forEach(item => {
        initContagens[item.id] = item.quantidade_contada !== null ? String(item.quantidade_contada) : '';
      });
      setContagens(initContagens);
    } catch {
      toast.error('Erro ao abrir conferência');
    } finally {
      setLoadingConf(false);
    }
  };

  const handleSalvarContagem = async (itemId) => {
    const val = contagens[itemId];
    if (val === '' || val === undefined) return;
    try {
      await api.put(`/almoxarifado/conferencias/${confAberta.id}/item/${itemId}`, {
        quantidade_contada: parseFloat(val)
      });
    } catch {
      toast.error('Erro ao salvar contagem');
    }
  };

  const handleConcluir = async () => {
    if (!window.confirm(`Concluir conferência ${confAberta.numero}?${aplicarAjustes ? '\nOs saldos serão ajustados automaticamente.' : ''}`)) return;
    setSalvando(true);
    try {
      const res = await api.put(`/almoxarifado/conferencias/${confAberta.id}/concluir`, {
        aplicar_ajustes: aplicarAjustes
      });
      toast.success(`Conferência concluída! ${res.data.ajustesAplicados} ajustes aplicados.`);
      setConfAberta(null);
      loadConferencias();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao concluir conferência');
    } finally {
      setSalvando(false);
    }
  };

  const handleCancelar = async (id, numero) => {
    if (!window.confirm(`Cancelar conferência ${numero}?`)) return;
    try {
      await api.put(`/almoxarifado/conferencias/${id}/cancelar`);
      toast.success('Conferência cancelada');
      loadConferencias();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao cancelar conferência');
    }
  };

  const divergenciaItem = (item) => {
    if (contagens[item.id] === '' || contagens[item.id] === undefined) return null;
    return parseFloat(contagens[item.id]) - item.quantidade_sistema;
  };

  const totalDivergencias = () => {
    if (!confAberta) return 0;
    return confAberta.itens.filter(item => {
      const d = divergenciaItem(item);
      return d !== null && d !== 0;
    }).length;
  };

  const itensContados = () => {
    if (!confAberta) return 0;
    return confAberta.itens.filter(item => contagens[item.id] !== '' && contagens[item.id] !== undefined).length;
  };

  const formatDate = (d) => d ? new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';

  // ── Tela de contagem aberta ──
  if (confAberta) {
    return (
      <div className="almox-page">
        <div className="almox-header">
          <div>
            <h1>Conferência {confAberta.numero}</h1>
            <p>
              {itensContados()} / {confAberta.itens.length} itens contados ·
              <span style={{ color: totalDivergencias() > 0 ? 'var(--gmp-warning)' : 'var(--gmp-success)', marginLeft: 6 }}>
                {totalDivergencias()} divergência{totalDivergencias() !== 1 ? 's' : ''}
              </span>
            </p>
          </div>
          <div className="almox-header-actions">
            <button className="btn-almox-secondary" onClick={() => setConfAberta(null)}>
              ← Voltar à lista
            </button>
            {confAberta.status === 'ABERTO' && (
              <button className="btn-almox-primary" onClick={handleConcluir} disabled={salvando}>
                <FiCheckCircle size={14} /> {salvando ? 'Concluindo...' : 'Concluir Conferência'}
              </button>
            )}
          </div>
        </div>

        {confAberta.status === 'ABERTO' && (
          <div style={{ background: 'var(--gmp-surface)', border: '1px solid var(--gmp-border)', borderRadius: 12, padding: '16px 20px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 16 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: '0.875rem', color: 'var(--gmp-text)' }}>
              <input type="checkbox" checked={aplicarAjustes} onChange={e => setAplicarAjustes(e.target.checked)} />
              Aplicar ajustes automáticos ao concluir (saldos com divergência serão corrigidos)
            </label>
          </div>
        )}

        <div className="almox-table-container">
          {loadingConf ? <SkeletonTable rows={8} columns={5} /> : (
            <table className="almox-table">
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Material</th>
                  <th>Localização</th>
                  <th>Qtd. Sistema</th>
                  <th>Qtd. Contada</th>
                  <th>Divergência</th>
                </tr>
              </thead>
              <tbody>
                {confAberta.itens.map(item => {
                  const diverg = divergenciaItem(item);
                  return (
                    <tr key={item.id}>
                      <td style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: 'var(--gmp-text-light)' }}>{item.material_codigo}</td>
                      <td>
                        <div style={{ fontWeight: 600 }}>{item.material_nome}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--gmp-text-light)' }}>{item.unidade}</div>
                      </td>
                      <td style={{ fontSize: '0.8rem', color: 'var(--gmp-text-light)' }}>{item.localizacao || '—'}</td>
                      <td style={{ fontWeight: 600 }}>{item.quantidade_sistema} {item.unidade}</td>
                      <td>
                        {confAberta.status === 'ABERTO' ? (
                          <input
                            className="almox-count-input"
                            type="number"
                            min="0"
                            step="0.01"
                            value={contagens[item.id] || ''}
                            onChange={e => setContagens(c => ({ ...c, [item.id]: e.target.value }))}
                            onBlur={() => handleSalvarContagem(item.id)}
                            placeholder="—"
                          />
                        ) : (
                          <span>{item.quantidade_contada !== null ? `${item.quantidade_contada} ${item.unidade}` : '—'}</span>
                        )}
                      </td>
                      <td>
                        {diverg !== null ? (
                          <span className={`almox-count-divergencia ${diverg < 0 ? 'neg' : diverg > 0 ? 'pos' : 'zero'}`}>
                            {diverg > 0 ? '+' : ''}{diverg.toFixed(2)}
                          </span>
                        ) : <span style={{ color: 'var(--gmp-text-light)' }}>—</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    );
  }

  // ── Lista de conferências ──
  return (
    <div className="almox-page">
      <div className="almox-header">
        <div>
          <h1>Conferências de Estoque</h1>
          <p>Inventários e contagens físicas</p>
        </div>
        <div className="almox-header-actions">
          <button className="btn-almox-secondary" onClick={loadConferencias}>
            <FiRefreshCw size={13} /> Atualizar
          </button>
          <button className="btn-almox-primary" onClick={() => setShowCreateModal(true)}>
            <FiPlus size={14} /> Nova Conferência
          </button>
        </div>
      </div>

      <div className="almox-table-container">
        {loading ? <SkeletonTable rows={6} columns={6} /> : conferencias.length === 0 ? (
          <div className="almox-empty">
            <FiClipboard size={48} style={{ opacity: 0.3, display: 'block', margin: '0 auto 12px' }} />
            <p>Nenhuma conferência de estoque encontrada</p>
          </div>
        ) : (
          <table className="almox-table">
            <thead>
              <tr>
                <th>Número</th>
                <th>Status</th>
                <th>Responsável</th>
                <th>Data Início</th>
                <th>Data Fim</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {conferencias.map(c => (
                <tr key={c.id}>
                  <td style={{ fontWeight: 700, fontFamily: 'monospace' }}>{c.numero}</td>
                  <td>
                    <span className={`almox-badge almox-badge-${c.status.toLowerCase()}`}>{c.status}</span>
                  </td>
                  <td style={{ fontSize: '0.875rem' }}>{c.responsavel_nome}</td>
                  <td style={{ fontSize: '0.8rem', color: 'var(--gmp-text-light)' }}>{formatDate(c.data_inicio)}</td>
                  <td style={{ fontSize: '0.8rem', color: 'var(--gmp-text-light)' }}>{formatDate(c.data_fim)}</td>
                  <td>
                    <div className="almox-actions">
                      <button className="almox-btn-icon primary" title="Abrir" onClick={() => abrirConferencia(c.id)}>
                        <FiEye />
                      </button>
                      {c.status === 'ABERTO' && (
                        <button className="almox-btn-icon danger" title="Cancelar" onClick={() => handleCancelar(c.id, c.numero)}>
                          <FiXCircle />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal criar */}
      {showCreateModal && (
        <div className="almox-modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="almox-modal almox-modal-sm" onClick={e => e.stopPropagation()}>
            <div className="almox-modal-header">
              <h2>📋 Nova Conferência de Estoque</h2>
              <button className="almox-modal-close" onClick={() => setShowCreateModal(false)}>✕</button>
            </div>
            <form onSubmit={handleCriar}>
              <div className="almox-modal-body">
                <div className="almox-field" style={{ marginBottom: 16 }}>
                  <label className="almox-label">Filtrar por Categoria (opcional)</label>
                  <select className="almox-form-select" value={criarCategoria} onChange={e => setCriarCategoria(e.target.value)}>
                    <option value="">Todos os materiais</option>
                    {CATEGORIAS.filter(Boolean).map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="almox-field">
                  <label className="almox-label">Observações</label>
                  <textarea className="almox-textarea" rows={3} value={criarObs}
                    onChange={e => setCriarObs(e.target.value)}
                    placeholder="Motivo, período, responsáveis..." />
                </div>
                <div style={{ background: 'rgba(79,172,254,0.06)', border: '1px solid rgba(79,172,254,0.2)', borderRadius: 8, padding: '12px 16px', marginTop: 16, fontSize: '0.8rem', color: 'var(--gmp-text-light)' }}>
                  Todos os materiais{criarCategoria ? ` da categoria "${criarCategoria}"` : ''} serão incluídos na conferência com seus saldos atuais.
                </div>
              </div>
              <div className="almox-modal-footer">
                <button type="button" className="btn-almox-secondary" onClick={() => setShowCreateModal(false)}>Cancelar</button>
                <button type="submit" className="btn-almox-primary" disabled={creating}>
                  {creating ? 'Criando...' : 'Criar Conferência'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ConferenciaEstoque;
