import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import api from '../services/api';
import { FiPlus, FiEdit2, FiTrash2, FiPackage, FiArrowLeft } from 'react-icons/fi';
import ModalFamiliaForm from './ModalFamiliaForm';
import './FamiliasProdutos.css';
import './Loading.css';

const FamiliasProdutos = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const familiaFromUrl = searchParams.get('familia');
  const [familias, setFamilias] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModalFamilia, setShowModalFamilia] = useState(false);
  const [editingFamilia, setEditingFamilia] = useState(null);

  useEffect(() => {
    loadFamilias();
  }, []);

  const loadFamilias = async () => {
    setLoading(true);
    try {
      let response = await api.get('/familias-produto').catch((e) => {
        if (e.response?.status === 404 && typeof window !== 'undefined' && window.location.origin) {
          return api.get(window.location.origin + '/familias-produto');
        }
        throw e;
      });
      const data = response?.data;
      setFamilias(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Erro ao carregar famílias:', error);
    } finally {
      setLoading(false);
    }
  };

  const getFotoUrl = (foto) => {
    if (!foto) return null;
    const base = api.defaults.baseURL || '/api';
    return base.replace(/\/api\/?$/, '') + '/api/uploads/familias-produtos/' + foto;
  };

  const handleExcluir = async (id, nome) => {
    if (!window.confirm(`Desativar a família "${nome}"? Os produtos continuarão vinculados a esse nome.`)) return;
    try {
      await api.delete(`/familias-produto/${id}`).catch((e) => {
        if (e.response?.status === 404 && window.location.origin) return api.delete(window.location.origin + `/familias-produto/${id}`);
        throw e;
      });
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

  // Se veio com ?familia= na URL, mostrar a lista de produtos filtrada (componente pai faz isso)
  if (familiaFromUrl) {
    return null; // Quem renderiza é o wrapper que mostra Produtos
  }

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
          <h1>Famílias de Produtos</h1>
          <p>Selecione uma família para ver e gerenciar os produtos</p>
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
        familia={editingFamilia}
      />

      <div className="familias-grid">
        {familias.length === 0 ? (
          <div className="familias-empty">
            <FiPackage size={48} />
            <p>Nenhuma família cadastrada.</p>
            <p className="hint">Cadastre famílias para organizar seus produtos (ex: Misturadores, Dosadores, Bombas).</p>
            <button onClick={() => setShowModalFamilia(true)} className="btn-primary">
              <FiPlus /> Nova Família
            </button>
          </div>
        ) : (
          (Array.isArray(familias) ? familias : []).map((f) => {
            const fotoUrl = getFotoUrl(f.foto);
            return (
              <div
                key={f.id}
                className="familia-card"
                onClick={() => navigate(`/comercial/produtos?familia=${encodeURIComponent(f.nome)}`)}
              >
                <div className="familia-card-foto">
                  {fotoUrl ? (
                    <img src={fotoUrl} alt={f.nome} />
                  ) : (
                    <div className="familia-card-placeholder">
                      <FiPackage size={48} />
                    </div>
                  )}
                  <div className="familia-card-actions">
                    <button
                      className="btn-icon-card"
                      title="Editar família"
                      onClick={(e) => { e.stopPropagation(); setEditingFamilia(f); setShowModalFamilia(true); }}
                    >
                      <FiEdit2 />
                    </button>
                    <button
                      className="btn-icon-card btn-danger"
                      title="Desativar família"
                      onClick={(e) => { e.stopPropagation(); handleExcluir(f.id, f.nome); }}
                    >
                      <FiTrash2 />
                    </button>
                  </div>
                </div>
                <div className="familia-card-nome">{f.nome}</div>
                <div className="familia-card-cta">Ver produtos →</div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default FamiliasProdutos;
