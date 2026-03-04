import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { FiPackage, FiChevronRight, FiPlus, FiEdit2 } from 'react-icons/fi';
import ModalGrupoForm from './ModalGrupoForm';
import './GruposProdutos.css';
import './Loading.css';

const GruposProdutos = () => {
  const navigate = useNavigate();
  const [grupos, setGrupos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModalGrupo, setShowModalGrupo] = useState(false);
  const [editingGrupo, setEditingGrupo] = useState(null);

  const loadGrupos = () => {
    api.get('/grupos')
      .then((res) => setGrupos(res.data || []))
      .catch(() => setGrupos([]));
  };

  useEffect(() => {
    api.get('/grupos')
      .then((res) => setGrupos(res.data || []))
      .catch(() => setGrupos([]))
      .finally(() => setLoading(false));
  }, []);

  const getFotoUrl = (foto) => {
    if (!foto) return null;
    if (foto.startsWith('data:')) return foto;
    const base = api.defaults.baseURL || '/api';
    return base.replace(/\/api\/?$/, '') + '/api/uploads/grupos-produtos/' + foto;
  };

  if (loading) {
    return (
      <div className="loading">
        <div className="loading-spinner"></div>
        <p>Carregando grupos...</p>
      </div>
    );
  }

  return (
    <div className="grupos-produtos">
      <div className="page-header grupos-header">
        <div>
          <h1>Produtos</h1>
          <p>Selecione um grupo para ver as famílias e produtos</p>
        </div>
        <div className="grupos-header-actions">
          <button
            type="button"
            className="btn-novo-grupo"
            onClick={() => { setEditingGrupo(null); setShowModalGrupo(true); }}
          >
            <FiPlus size={20} /> Adicionar grupo
          </button>
        </div>
      </div>

      <ModalGrupoForm
        isOpen={showModalGrupo}
        onClose={() => { setShowModalGrupo(false); setEditingGrupo(null); }}
        onSaved={loadGrupos}
        grupo={editingGrupo}
      />

      <div className="grupos-grid">
        {grupos.length === 0 ? (
          <div className="grupos-empty">
            <FiPackage size={48} />
            <p>Nenhum grupo cadastrado.</p>
            <p className="hint">Clique em Novo grupo para cadastrar.</p>
            <button type="button" className="btn-primary" onClick={() => setShowModalGrupo(true)}>
              <FiPlus /> Adicionar grupo
            </button>
          </div>
        ) : (
          grupos.map((g, index) => {
            const themeIndex = index % 3;
            const fotoUrl = getFotoUrl(g.foto);
            return (
              <div
                key={g.id}
                className={`grupo-card grupo-card-theme-${themeIndex}`}
                onClick={() => navigate(`/comercial/produtos/grupo/${g.id}`)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    navigate(`/comercial/produtos/grupo/${g.id}`);
                  }
                }}
              >
                <div className="grupo-card-header">
                  <div className="grupo-card-foto-wrap">
                    {fotoUrl ? (
                      <img src={fotoUrl} alt={g.nome} className="grupo-card-foto-img" />
                    ) : (
                      <div className="grupo-card-placeholder">
                        <FiPackage size={56} />
                      </div>
                    )}
                  </div>
                  <div className="grupo-card-actions" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      className="btn-icon-grupo"
                      title="Editar grupo"
                      onClick={() => { setEditingGrupo(g); setShowModalGrupo(true); }}
                    >
                      <FiEdit2 size={18} />
                    </button>
                  </div>
                </div>
                <div className="grupo-card-body">
                  <div className="grupo-card-nome">{g.nome}</div>
                  <span className="grupo-card-cta-label">
                    Ver famílias <FiChevronRight className="grupo-card-chevron" size={16} />
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

export default GruposProdutos;
