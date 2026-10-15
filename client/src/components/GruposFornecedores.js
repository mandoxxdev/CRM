import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { toast } from 'react-toastify';
import { FiTruck, FiChevronRight, FiPlus, FiEdit2, FiRotateCcw } from 'react-icons/fi';
import ModalGrupoComprasForm from './ModalGrupoComprasForm';
import './GruposProdutos.css';
import './Loading.css';

const GruposFornecedores = () => {
  const navigate = useNavigate();
  const [grupos, setGrupos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModalGrupo, setShowModalGrupo] = useState(false);
  const [editingGrupo, setEditingGrupo] = useState(null);
  const [mostrarDesativados, setMostrarDesativados] = useState(false);
  const [reativando, setReativando] = useState(null);

  // Etapa 103 (RN-103.06): os DOIS carregamentos (o do efeito e o do `onSaved` do modal — que roda
  // inclusive depois de "Remover grupo") pedem os desativados; a grade continua mostrando so os
  // ativos e os desativados ficam numa secao propria, com "Reativar". Desativado = ativo diferente de 1
  // (o mesmo predicado do servidor, que recusa vincular a ele).
  const loadGrupos = useCallback(() => api.get('/compras/grupos', { params: { incluir_inativos: 1 } })
    .then((res) => setGrupos(res.data || []))
    .catch(() => setGrupos([])), []);

  useEffect(() => {
    loadGrupos().finally(() => setLoading(false));
  }, [loadGrupos]);

  const ativos = grupos.filter((g) => Number(g.ativo) === 1);
  const desativados = grupos.filter((g) => Number(g.ativo) !== 1);
  // Reativado o ultimo desativado, a secao fecha: senao o proximo "Remover grupo" a reabria sozinha
  // (achado baixo da revisao final).
  useEffect(() => {
    if (desativados.length === 0) setMostrarDesativados(false);
  }, [desativados.length]);

  const handleReativar = async (g) => {
    setReativando(g.id);
    try {
      await api.post(`/compras/grupos/${g.id}/reativar`);
      toast.success('Grupo reativado');
      await loadGrupos();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao reativar grupo');
    } finally {
      setReativando(null);
    }
  };

  const botaoDesativados = desativados.length > 0 && (
    <button
      type="button"
      className="btn-secondary"
      data-testid="toggle-desativados"
      onClick={() => setMostrarDesativados((v) => !v)}
      style={{ marginTop: 16 }}
    >
      {mostrarDesativados ? 'Ocultar grupos desativados' : `Mostrar grupos desativados (${desativados.length})`}
    </button>
  );

  const getFotoUrl = (foto) => {
    if (!foto) return null;
    if (foto.startsWith('data:')) return foto;
    const base = api.defaults.baseURL || '/api';
    return base.replace(/\/api\/?$/, '') + '/api/uploads/grupos-compras/' + foto;
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
          <h1>Fornecedores homologados</h1>
          <p>Selecione um grupo para ver os fornecedores e itens com preços</p>
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

      <ModalGrupoComprasForm
        isOpen={showModalGrupo}
        onClose={() => { setShowModalGrupo(false); setEditingGrupo(null); }}
        onSaved={loadGrupos}
        grupo={editingGrupo}
        totalGrupos={ativos.length}
      />

      <div className="grupos-grid">
        {ativos.length === 0 ? (
          <div className="grupos-empty">
            <FiTruck size={48} />
            <p>{desativados.length > 0 ? 'Nenhum grupo ativo.' : 'Nenhum grupo cadastrado.'}</p>
            <p className="hint">Clique em Adicionar grupo para criar (ex.: Insumos, Peças).</p>
            <button type="button" className="btn-primary" onClick={() => setShowModalGrupo(true)}>
              <FiPlus /> Adicionar grupo
            </button>
          </div>
        ) : (
          ativos.map((g, index) => {
            const themeIndex = index % 3;
            const fotoUrl = getFotoUrl(g.foto);
            return (
              <div
                key={g.id}
                className={`grupo-card grupo-card-theme-${themeIndex}`}
                onClick={() => navigate(`/compras/fornecedores-homologados/grupo/${g.id}`)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    navigate(`/compras/fornecedores-homologados/grupo/${g.id}`);
                  }
                }}
              >
                <div className="grupo-card-header">
                  <div className="grupo-card-foto-wrap">
                    {fotoUrl ? (
                      <img src={fotoUrl} alt={g.nome} className="grupo-card-foto-img" />
                    ) : (
                      <div className="grupo-card-placeholder">
                        <FiTruck size={56} />
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
                  {g.numero != null && (
                    <span className="grupo-card-numero">Nº {g.numero}</span>
                  )}
                  <div className="grupo-card-nome">{g.nome}</div>
                  <span className="grupo-card-cta-label">
                    Ver fornecedores <FiChevronRight className="grupo-card-chevron" size={16} />
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>

      {botaoDesativados}
      {mostrarDesativados && desativados.length > 0 && (
        <div className="grupos-grid" data-testid="grupos-desativados" style={{ marginTop: 16 }}>
          {desativados.map((g) => (
            <div
              key={g.id}
              className="grupo-card"
              data-testid={`grupo-desativado-${g.id}`}
              style={{ opacity: 0.75 }}
              onClick={() => navigate(`/compras/fornecedores-homologados/grupo/${g.id}`)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  navigate(`/compras/fornecedores-homologados/grupo/${g.id}`);
                }
              }}
            >
              <div className="grupo-card-body">
                <span
                  className="status-badge"
                  style={{ display: 'inline-block', padding: '0.25rem 0.6rem', borderRadius: 12, fontSize: '0.75rem', fontWeight: 600, backgroundColor: '#e74c3c20', color: '#e74c3c', marginBottom: 8 }}
                >
                  Desativado
                </span>
                {g.numero != null && (
                  <span className="grupo-card-numero">Nº {g.numero}</span>
                )}
                <div className="grupo-card-nome">{g.nome}</div>
                <button
                  type="button"
                  className="btn-primary"
                  disabled={reativando === g.id}
                  onClick={(e) => { e.stopPropagation(); handleReativar(g); }}
                >
                  <FiRotateCcw /> {reativando === g.id ? 'Reativando...' : 'Reativar'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default GruposFornecedores;
