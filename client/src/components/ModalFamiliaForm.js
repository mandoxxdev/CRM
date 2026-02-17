import React, { useState, useEffect } from 'react';
import { FiX, FiUploadCloud } from 'react-icons/fi';
import api from '../services/api';
import './ModalFamiliaForm.css';

const ModalFamiliaForm = ({ isOpen, onClose, onSaved, familia }) => {
  const isEdit = !!familia && !!familia.id;
  const [nome, setNome] = useState('');
  const [ordem, setOrdem] = useState(0);
  const [fotoFile, setFotoFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (familia) {
      setNome(familia.nome || '');
      setOrdem(familia.ordem || 0);
      setPreviewUrl(familia.foto ? getFotoUrl(familia.foto) : null);
    } else {
      setNome('');
      setOrdem(0);
      setPreviewUrl(null);
      setFotoFile(null);
    }
    setError('');
  }, [familia, isOpen]);

  function getFotoUrl(foto) {
    if (!foto) return null;
    const base = api.defaults.baseURL || '/api';
    return base.replace(/\/api\/?$/, '') + '/api/uploads/familias-produtos/' + foto;
  }

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!/^image\/(jpeg|jpg|png|gif|webp)$/i.test(file.type)) {
      setError('Envie apenas imagens (JPEG, PNG, GIF, WEBP).');
      return;
    }
    setError('');
    setFotoFile(file);
    setPreviewUrl(URL.createObjectURL(file));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const nomeTrim = nome.trim();
    if (!nomeTrim) {
      setError('Informe o nome da família.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      if (isEdit) {
        await api.put(`/produtos/familias/${familia.id}`, { nome: nomeTrim, ordem: Number(ordem) || 0 });
        if (fotoFile) {
          const formData = new FormData();
          formData.append('foto', fotoFile);
          await api.post(`/produtos/familias/${familia.id}/foto`, formData, {
            headers: { 'Content-Type': 'multipart/form-data' }
          });
        }
      } else {
        const res = await api.post('/produtos/familias', { nome: nomeTrim, ordem: Number(ordem) || 0 });
        if (fotoFile && res.data && res.data.id) {
          const formData = new FormData();
          formData.append('foto', fotoFile);
          await api.post(`/produtos/familias/${res.data.id}/foto`, formData, {
            headers: { 'Content-Type': 'multipart/form-data' }
          });
        }
      }
      onSaved();
      onClose();
    } catch (err) {
      const status = err.response?.status;
      const msg = err.response?.data?.error || err.message || 'Erro ao salvar.';
      if (status === 404) {
        setError('Rota da API não encontrada (404). Se o app está no Coolify, faça um novo deploy com o código atualizado e tente novamente.');
      } else {
        setError(msg);
      }
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-familia-overlay" onClick={onClose}>
      <div className="modal-familia-container" onClick={(e) => e.stopPropagation()}>
        <div className="modal-familia-header">
          <h2>{isEdit ? 'Editar Família' : 'Nova Família de Produtos'}</h2>
          <button type="button" className="modal-familia-close" onClick={onClose}>
            <FiX />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="modal-familia-form">
          {error && <div className="modal-familia-error">{error}</div>}
          <div className="modal-familia-field">
            <label>Nome da família *</label>
            <input
              type="text"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Ex: Misturadores, Dosadores, Bombas"
              autoFocus
            />
          </div>
          <div className="modal-familia-field">
            <label>Ordem de exibição</label>
            <input
              type="number"
              min="0"
              value={ordem}
              onChange={(e) => setOrdem(e.target.value)}
            />
          </div>
          <div className="modal-familia-field">
            <label>Foto da família</label>
            <div className="modal-familia-foto-row">
              <div className="modal-familia-preview">
                {previewUrl ? (
                  <img src={previewUrl} alt="Preview" />
                ) : (
                  <div className="modal-familia-preview-placeholder">
                    <FiUploadCloud size={32} />
                    <span>Nenhuma imagem</span>
                  </div>
                )}
              </div>
              <div className="modal-familia-upload">
                <input
                  type="file"
                  accept="image/jpeg,image/jpg,image/png,image/gif,image/webp"
                  onChange={handleFileChange}
                  id="familia-foto-input"
                />
                <label htmlFor="familia-foto-input" className="btn-upload-label">
                  {fotoFile ? 'Trocar imagem' : 'Enviar imagem'}
                </label>
              </div>
            </div>
          </div>
          <div className="modal-familia-actions">
            <button type="button" onClick={onClose} className="btn-cancel">
              Cancelar
            </button>
            <button type="submit" className="btn-save" disabled={saving}>
              {saving ? 'Salvando...' : (isEdit ? 'Salvar' : 'Cadastrar')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ModalFamiliaForm;
