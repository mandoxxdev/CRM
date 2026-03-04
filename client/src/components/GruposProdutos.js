import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { FiPackage, FiChevronRight } from 'react-icons/fi';
import './GruposProdutos.css';
import './Loading.css';

const GruposProdutos = () => {
  const navigate = useNavigate();
  const [grupos, setGrupos] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/grupos')
      .then((res) => setGrupos(res.data || []))
      .catch(() => setGrupos([]))
      .finally(() => setLoading(false));
  }, []);

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
      </div>

      <div className="grupos-grid">
        {grupos.length === 0 ? (
          <div className="grupos-empty">
            <FiPackage size={48} />
            <p>Nenhum grupo cadastrado.</p>
            <p className="hint">Os grupos são criados no servidor (ex.: Masseira, Dispersores).</p>
          </div>
        ) : (
          grupos.map((g, index) => {
            const themeIndex = index % 3;
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
                  <div className="grupo-card-placeholder">
                    <FiPackage size={56} />
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
