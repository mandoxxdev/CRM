import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../services/api';
import { FiPlus, FiEdit2, FiTrash2, FiPackage, FiChevronRight, FiArrowLeft } from 'react-icons/fi';
import ModalFamiliaForm from './ModalFamiliaForm';
import './FamiliasProdutos.css';
import './Loading.css';

const FamiliasDoGrupo = () => {
  const { grupoId } = useParams();
  const navigate = useNavigate();
  const [grupo, setGrupo] = useState(null);
  const [familias, setFamilias] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModalFamilia, setShowModalFamilia] = useState(false);
  const [editingFamilia, setEditingFamilia] = useState(null);

  useEffect(() => {
    if (!grupoId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    Promise.all([
      api.get(`/grupos/${grupoId}`).catch(() => null),
      api.get('/familias', { params: { grupo_id: grupoId } })
    ])
      .then(([grupoRes, famRes]) => {
        setGrupo(grupoRes && grupoRes.data ? grupoRes.data : { id: grupoId, nome: 'Grupo' });
        setFamilias(famRes.data || []);
      })
      .catch(() => {
        setGrupo({ id: grupoId, nome: 'Grupo' });
        setFamilias([]);
      })
      .finally(() => setLoading(false));
  }, [grupoId]);

  const loadFamilias = () => {
    if (!grupoId) return;
    api.get('/familias', { params: { grupo_id: grupoId } })
      .then((res) => setFamilias(res.data || []))
      .catch(() => setFamilias([]));
  };

  const getFotoUrl = (foto) => {
    if (!foto) return null;
    if (foto.startsWith('data:')) return foto;
    const base = api.defaults.baseURL || '/api';
    return base.replace(/\/api\/?$/, '') + '/api/uploads/familias-produtos/' + foto;
  };

  const handleExcluir = async (id, nome) => {
    if (!window.confirm(`Desativar a família "${nome}"?`)) return;
    try {
      await api.delete(`/familias/${id}`);
      loadFamilias();
    } catch (error) {
      console.error('Erro ao desativar família:', error);
      alert(error.response?.data?.error || 'Erro ao desativar família');
    }
  };

  const handleSalvarFamilia = () => {
    setShowModalFamilia(false);
    setEditingFamilia(null);
    loadFamilias();
  };

  if (loading) {
    return (
      <div className="loading">
        <div className="loading-spinner"></div>
        <p>Carregando famílias...</p>
      </div>
    );
  }

  return (
    <div className="familias-produtos">
      <div className="page-header familias-header">
        <div>
          <button
            type="button"
            onClick={() => navigate('/comercial/produtos')}
            className="btn-voltar-grupos"
          >
            <FiArrowLeft /> Voltar para grupos
          </button>
          <h1>Famílias – {grupo ? grupo.nome : 'Grupo'}</h1>
          <p>Cadastre e gerencie as famílias deste grupo. Clique em uma família para ver os produtos.</p>
        </div>
        <div className="header-actions">
          <button
            onClick={() => { setEditingFamilia(null); setShowModalFamilia(true); }}
            className="btn-premium"
          >
            <div className="btn-premium-icon">
              <FiPlus size={20} />
            </div>
            <span className="btn-premium-text">Nova Família</span>
            <div className="btn-premium-shine"></div>
          </button>
        </div>
      </div>

      <ModalFamiliaForm
        isOpen={showModalFamilia}
        onClose={() => { setShowModalFamilia(false); setEditingFamilia(null); }}
        onSaved={handleSalvarFamilia}
        onSavedLocal={handleSalvarFamilia}
        familia={editingFamilia}
        useLocalOnly={false}
        familiasAtuais={familias}
        grupoId={grupoId}
      />

      <div className="familias-grid">
        {familias.length === 0 ? (
          <div className="familias-empty">
            <FiPackage size={48} />
            <p>Nenhuma família neste grupo.</p>
            <p className="hint">Clique em Nova Família para cadastrar.</p>
            <button onClick={() => setShowModalFamilia(true)} className="btn-primary">
              <FiPlus /> Nova Família
            </button>
          </div>
        ) : (
          familias.map((f, index) => {
            const fotoUrl = getFotoUrl(f.foto);
            const themeIndex = index % 3;
            return (
              <div
                key={f.id}
                className={`familia-card familia-card-only familia-card-clickable familia-card-theme-${themeIndex}`}
                onClick={() => navigate(`/comercial/produtos/familia/${f.id}`, { state: { grupoId } })}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    navigate(`/comercial/produtos/familia/${f.id}`, { state: { grupoId } });
                  }
                }}
              >
                <div className="familia-card-header">
                  <div className="familia-card-foto-wrap">
                    {fotoUrl ? (
                      <img src={fotoUrl} alt={f.nome} className="familia-card-foto-img" />
                    ) : (
                      <div className="familia-card-placeholder">
                        <FiPackage size={48} />
                      </div>
                    )}
                  </div>
                  {!fotoUrl && <div className="familia-card-header-shapes" aria-hidden="true" />}
                  <div className="familia-card-header-overlay" aria-hidden="true" />
                  <div className="familia-card-actions" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      className="btn-icon-card"
                      title="Editar família"
                      onClick={() => { setEditingFamilia(f); setShowModalFamilia(true); }}
                    >
                      <FiEdit2 />
                    </button>
                    <button
                      type="button"
                      className="btn-icon-card btn-danger"
                      title="Desativar família"
                      onClick={() => handleExcluir(f.id, f.nome)}
                    >
                      <FiTrash2 />
                    </button>
                  </div>
                </div>
                <div className="familia-card-body">
                  <div className="familia-card-nome">{f.nome}</div>
                  <span className="familia-card-cta-label">
                    Ver produtos <FiChevronRight className="familia-card-chevron" size={16} />
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

export default FamiliasDoGrupo;
