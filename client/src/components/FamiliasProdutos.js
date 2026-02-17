import React, { useState, useEffect } from 'react';
import api from '../services/api';
import { FiPlus, FiEdit2, FiTrash2, FiPackage } from 'react-icons/fi';
import ModalFamiliaForm from './ModalFamiliaForm';
import './FamiliasProdutos.css';
import './Loading.css';

const FamiliasProdutos = () => {
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
      const response = await api.get('/familias');
      setFamilias(response.data || []);
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
          <h1>Cadastro de Famílias</h1>
          <p>Cadastre e gerencie as famílias de produtos</p>
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
            <p className="hint">Clique em Nova Família para cadastrar.</p>
            <button onClick={() => setShowModalFamilia(true)} className="btn-primary">
              <FiPlus /> Nova Família
            </button>
          </div>
        ) : (
          familias.map((f) => {
            const fotoUrl = getFotoUrl(f.foto);
            return (
              <div key={f.id} className="familia-card familia-card-only">
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
                      onClick={() => { setEditingFamilia(f); setShowModalFamilia(true); }}
                    >
                      <FiEdit2 />
                    </button>
                    <button
                      className="btn-icon-card btn-danger"
                      title="Desativar família"
                      onClick={() => handleExcluir(f.id, f.nome)}
                    >
                      <FiTrash2 />
                    </button>
                  </div>
                </div>
                <div className="familia-card-nome">{f.nome}</div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default FamiliasProdutos;
