import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { FiPlus, FiEdit2, FiTrash2, FiPackage, FiChevronRight } from 'react-icons/fi';
import ModalFamiliaForm from './ModalFamiliaForm';
import './FamiliasProdutos.css';
import './Loading.css';

const STORAGE_KEY = 'gmp_familias_produto';

function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch (_) {
    return [];
  }
}

function saveToStorage(list) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch (_) {}
}

const FamiliasProdutos = () => {
  const navigate = useNavigate();
  const [familias, setFamilias] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModalFamilia, setShowModalFamilia] = useState(false);
  const [editingFamilia, setEditingFamilia] = useState(null);
  const [useLocalOnly, setUseLocalOnly] = useState(false);

  const loadFamilias = async () => {
    setLoading(true);
    if (useLocalOnly) {
      setFamilias(loadFromStorage());
      setLoading(false);
      return;
    }
    try {
      const response = await api.get('/familias');
      setFamilias(response.data || []);
      setUseLocalOnly(false);
    } catch (error) {
      console.error('Erro ao carregar famílias, usando lista local:', error);
      setUseLocalOnly(true);
      setFamilias(loadFromStorage());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadFamilias();
  }, []);

  useEffect(() => {
    if (useLocalOnly) {
      setFamilias(loadFromStorage());
    }
  }, [useLocalOnly]);

  const getFotoUrl = (foto) => {
    if (!foto) return null;
    if (foto.startsWith('data:')) return foto;
    const base = api.defaults.baseURL || '/api';
    return base.replace(/\/api\/?$/, '') + '/api/uploads/familias-produtos/' + foto;
  };

  const handleExcluir = async (id, nome) => {
    if (!window.confirm(`Desativar a família "${nome}"?`)) return;
    if (useLocalOnly) {
      const list = loadFromStorage().filter((f) => String(f.id) !== String(id));
      saveToStorage(list);
      setFamilias(list);
      return;
    }
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

  const handleSaveLocal = (novaLista) => {
    setUseLocalOnly(true);
    saveToStorage(novaLista);
    setFamilias(novaLista);
    setShowModalFamilia(false);
    setEditingFamilia(null);
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
          <h1>Cadastro de Famílias</h1>
          <p>
            {useLocalOnly
              ? 'Modo local (dados só neste navegador). Cadastre e gerencie as famílias.'
              : 'Cadastre e gerencie as famílias de produtos'}
          </p>
        </div>
        <div className="header-actions">
          <button onClick={() => { setEditingFamilia(null); setShowModalFamilia(true); }} className="btn-premium">
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
        onSavedLocal={handleSaveLocal}
        familia={editingFamilia}
        useLocalOnly={useLocalOnly}
        familiasAtuais={familias}
      />

      <div className="familias-grid">
        {familias.length === 0 ? (
          <div className="familias-empty">
            <FiPackage size={48} />
            <p>Nenhuma família cadastrada.</p>
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
                onClick={() => navigate(`/comercial/produtos/familia/${f.id}`)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate(`/comercial/produtos/familia/${f.id}`); } }}
              >
                <div className="familia-card-header">
                  <div className="familia-card-header-shapes" aria-hidden="true" />
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
                  <div className="familia-card-foto-wrap">
                    <div className="familia-card-foto">
                      {fotoUrl ? (
                        <img src={fotoUrl} alt={f.nome} />
                      ) : (
                        <div className="familia-card-placeholder">
                          <FiPackage size={56} />
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                <div className="familia-card-body">
                  <div className="familia-card-codigo">{f.codigo != null ? f.codigo : (f.id * 10)}</div>
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

export default FamiliasProdutos;
