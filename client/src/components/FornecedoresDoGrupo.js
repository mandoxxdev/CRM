import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../services/api';
import { toast } from 'react-toastify';
import { FiPlus, FiTruck, FiChevronRight, FiArrowLeft, FiEdit2, FiUserMinus } from 'react-icons/fi';
import './FamiliasProdutos.css';
import './Loading.css';

const FornecedoresDoGrupo = () => {
  const { grupoId } = useParams();
  const navigate = useNavigate();
  const [grupo, setGrupo] = useState(null);
  const [fornecedores, setFornecedores] = useState([]);
  const [todosFornecedores, setTodosFornecedores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModalAdd, setShowModalAdd] = useState(false);
  const [showModalNovo, setShowModalNovo] = useState(false);
  const [selectedFornecedorId, setSelectedFornecedorId] = useState('');
  const [novoRazao, setNovoRazao] = useState('');
  const [novoFantasia, setNovoFantasia] = useState('');
  const [novoCnpj, setNovoCnpj] = useState('');
  const [saving, setSaving] = useState(false);

  const loadData = () => {
    if (!grupoId) return;
    Promise.all([
      api.get(`/compras/grupos/${grupoId}`).catch(() => null),
      api.get(`/compras/grupos/${grupoId}/fornecedores`).catch(() => []),
      api.get('/compras/fornecedores').catch(() => [])
    ]).then(([grupoRes, fornRes, todosRes]) => {
      setGrupo(grupoRes && grupoRes.data ? grupoRes.data : { id: grupoId, nome: 'Grupo' });
      setFornecedores(fornRes.data || []);
      setTodosFornecedores(todosRes.data || []);
    }).catch(() => {
      setGrupo({ id: grupoId, nome: 'Grupo' });
      setFornecedores([]);
      setTodosFornecedores([]);
    }).finally(() => setLoading(false));
  };

  useEffect(() => {
    if (!grupoId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    loadData();
  }, [grupoId]);

  const fornecedoresDisponiveis = todosFornecedores.filter(
    (f) => !f.grupo_id || String(f.grupo_id) !== String(grupoId)
  );

  const handleVincular = async () => {
    if (!selectedFornecedorId) {
      toast.warning('Selecione um fornecedor');
      return;
    }
    setSaving(true);
    try {
      const f = todosFornecedores.find((x) => String(x.id) === String(selectedFornecedorId));
      if (!f) return;
      await api.put(`/compras/fornecedores/${f.id}`, {
        razao_social: f.razao_social,
        nome_fantasia: f.nome_fantasia || '',
        cnpj: f.cnpj || '',
        contato: f.contato || '',
        email: f.email || '',
        telefone: f.telefone || '',
        endereco: f.endereco || '',
        grupo_id: grupoId
      });
      toast.success('Fornecedor adicionado ao grupo');
      setShowModalAdd(false);
      setSelectedFornecedorId('');
      loadData();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao vincular');
    } finally {
      setSaving(false);
    }
  };

  const handleRemoverDoGrupo = async (fornecedor) => {
    if (!window.confirm(`Remover "${fornecedor.razao_social}" deste grupo? O fornecedor continua cadastrado.`)) return;
    try {
      await api.put(`/compras/fornecedores/${fornecedor.id}`, {
        razao_social: fornecedor.razao_social,
        nome_fantasia: fornecedor.nome_fantasia || '',
        cnpj: fornecedor.cnpj || '',
        contato: fornecedor.contato || '',
        email: fornecedor.email || '',
        telefone: fornecedor.telefone || '',
        endereco: fornecedor.endereco || '',
        grupo_id: null
      });
      toast.success('Fornecedor removido do grupo');
      loadData();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao remover');
    }
  };

  const handleCriarNovo = async (e) => {
    e.preventDefault();
    const razao = (novoRazao || '').trim();
    if (!razao) {
      toast.warning('Razão social é obrigatória');
      return;
    }
    setSaving(true);
    try {
      await api.post('/compras/fornecedores', {
        razao_social: razao,
        nome_fantasia: (novoFantasia || '').trim(),
        cnpj: (novoCnpj || '').trim(),
        grupo_id: grupoId
      });
      toast.success('Fornecedor cadastrado e vinculado ao grupo');
      setShowModalNovo(false);
      setNovoRazao('');
      setNovoFantasia('');
      setNovoCnpj('');
      loadData();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao cadastrar');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="loading">
        <div className="loading-spinner"></div>
        <p>Carregando fornecedores...</p>
      </div>
    );
  }

  return (
    <div className="familias-produtos">
      <div className="page-header familias-header">
        <div>
          <button
            type="button"
            onClick={() => navigate('/compras/fornecedores-homologados')}
            className="btn-voltar-grupos"
          >
            <FiArrowLeft /> Voltar para grupos
          </button>
          <h1>Fornecedores – {grupo ? grupo.nome : 'Grupo'}</h1>
          <p>Fornecedores homologados neste grupo. Clique em um fornecedor para ver itens e preços.</p>
        </div>
        <div className="header-actions">
          <button
            type="button"
            className="btn-premium"
            onClick={() => setShowModalAdd(true)}
          >
            <div className="btn-premium-icon"><FiPlus size={20} /></div>
            <span className="btn-premium-text">Vincular fornecedor</span>
            <div className="btn-premium-shine"></div>
          </button>
          <button
            type="button"
            className="btn-premium"
            onClick={() => setShowModalNovo(true)}
            style={{ marginLeft: 8 }}
          >
            <div className="btn-premium-icon"><FiTruck size={20} /></div>
            <span className="btn-premium-text">Novo fornecedor</span>
            <div className="btn-premium-shine"></div>
          </button>
        </div>
      </div>

      {/* Modal: Vincular fornecedor existente */}
      {showModalAdd && (
        <div className="modal-grupo-overlay" onClick={() => setShowModalAdd(false)}>
          <div className="modal-grupo-container" onClick={(e) => e.stopPropagation()}>
            <div className="modal-grupo-header">
              <h2>Vincular fornecedor ao grupo</h2>
              <button type="button" className="modal-grupo-close" onClick={() => setShowModalAdd(false)} aria-label="Fechar">×</button>
            </div>
            <div className="modal-grupo-form" style={{ padding: 24 }}>
              <div className="modal-grupo-field">
                <label>Fornecedor</label>
                <select
                  value={selectedFornecedorId}
                  onChange={(e) => setSelectedFornecedorId(e.target.value)}
                  style={{ width: '100%', padding: 12 }}
                >
                  <option value="">Selecione...</option>
                  {fornecedoresDisponiveis.map((f) => (
                    <option key={f.id} value={f.id}>{f.razao_social} {f.nome_fantasia ? `(${f.nome_fantasia})` : ''}</option>
                  ))}
                </select>
              </div>
              {fornecedoresDisponiveis.length === 0 && (
                <p style={{ color: '#64748b', fontSize: 14 }}>Todos os fornecedores já estão em um grupo ou cadastre um novo.</p>
              )}
              <div className="modal-grupo-actions-right" style={{ marginTop: 16 }}>
                <button type="button" className="btn-cancel" onClick={() => setShowModalAdd(false)}>Cancelar</button>
                <button type="button" className="btn-save" onClick={handleVincular} disabled={saving || !selectedFornecedorId}>
                  {saving ? 'Salvando...' : 'Vincular'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Novo fornecedor */}
      {showModalNovo && (
        <div className="modal-grupo-overlay" onClick={() => setShowModalNovo(false)}>
          <div className="modal-grupo-container" onClick={(e) => e.stopPropagation()}>
            <div className="modal-grupo-header">
              <h2>Novo fornecedor</h2>
              <button type="button" className="modal-grupo-close" onClick={() => setShowModalNovo(false)} aria-label="Fechar">×</button>
            </div>
            <form onSubmit={handleCriarNovo} className="modal-grupo-form">
              <div className="modal-grupo-field">
                <label>Razão social *</label>
                <input type="text" value={novoRazao} onChange={(e) => setNovoRazao(e.target.value)} placeholder="Razão social" required />
              </div>
              <div className="modal-grupo-field">
                <label>Nome fantasia</label>
                <input type="text" value={novoFantasia} onChange={(e) => setNovoFantasia(e.target.value)} placeholder="Nome fantasia" />
              </div>
              <div className="modal-grupo-field">
                <label>CNPJ</label>
                <input type="text" value={novoCnpj} onChange={(e) => setNovoCnpj(e.target.value)} placeholder="CNPJ" />
              </div>
              <div className="modal-grupo-actions-right" style={{ marginTop: 16 }}>
                <button type="button" className="btn-cancel" onClick={() => setShowModalNovo(false)}>Cancelar</button>
                <button type="submit" className="btn-save" disabled={saving}>{saving ? 'Salvando...' : 'Cadastrar'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="familias-grid">
        {fornecedores.length === 0 ? (
          <div className="familias-empty">
            <FiTruck size={48} />
            <p>Nenhum fornecedor neste grupo.</p>
            <p className="hint">Vincule um fornecedor existente ou cadastre um novo.</p>
            <button type="button" onClick={() => setShowModalAdd(true)} className="btn-primary">
              <FiPlus /> Vincular fornecedor
            </button>
          </div>
        ) : (
          fornecedores.map((f, index) => {
            const themeIndex = index % 3;
            return (
              <div
                key={f.id}
                className={`familia-card familia-card-only familia-card-clickable familia-card-theme-${themeIndex}`}
                onClick={() => navigate(`/compras/fornecedores-homologados/fornecedor/${f.id}`)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    navigate(`/compras/fornecedores-homologados/fornecedor/${f.id}`);
                  }
                }}
              >
                <div className="familia-card-header">
                  <div className="familia-card-foto-wrap">
                    <div className="familia-card-placeholder">
                      <FiTruck size={48} />
                    </div>
                  </div>
                  <div className="familia-card-actions" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      className="btn-icon-card btn-danger"
                      title="Remover do grupo"
                      onClick={() => handleRemoverDoGrupo(f)}
                    >
                      <FiUserMinus />
                    </button>
                  </div>
                </div>
                <div className="familia-card-body">
                  <div className="familia-card-nome">{f.razao_social}</div>
                  {f.nome_fantasia && <div style={{ fontSize: 12, color: '#64748b' }}>{f.nome_fantasia}</div>}
                  <span className="familia-card-cta-label">
                    Ver itens e preços <FiChevronRight className="familia-card-chevron" size={16} />
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default FornecedoresDoGrupo;
