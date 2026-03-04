import React, { useState, useEffect } from 'react';
import { FiX, FiUploadCloud, FiTrash2 } from 'react-icons/fi';
import api from '../services/api';
import './ModalGrupoForm.css';

async function uploadFormData(endpoint, formData) {
  const baseURL = (api.defaults.baseURL || '/api').replace(/\/$/, '');
  const url = `${baseURL}${endpoint.startsWith('/') ? endpoint : '/' + endpoint}`;
  const token = localStorage.getItem('token') || sessionStorage.getItem('token');
  const headers = { Accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(url, { method: 'POST', headers, body: formData });
  if (!res.ok) {
    const err = new Error(res.statusText || 'Erro no upload');
    err.response = { status: res.status, data: await res.json().catch(() => ({})) };
    throw err;
  }
  return res.json();
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Falha ao ler arquivo'));
    reader.readAsDataURL(file);
  });
}

async function uploadFotoGrupo(id, file) {
  const endpoint = `/grupos/${id}/foto`;
  const formData = new FormData();
  formData.append('foto', file);
  try {
    return await uploadFormData(endpoint, formData);
  } catch (err) {
    if (err.response && err.response.status === 400) {
      const base64 = await fileToDataUrl(file);
      const { data } = await api.post(`/grupos/${id}/foto-base64`, { foto_base64: base64 });
      return data;
    }
    throw err;
  }
}

const ModalGrupoForm = ({ isOpen, onClose, onSaved, grupo }) => {
  const isEdit = !!grupo && !!grupo.id;
  const [nome, setNome] = useState('');
  const [ordem, setOrdem] = useState(0);
  const [fotoFile, setFotoFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (grupo) {
      setNome(grupo.nome || '');
      setOrdem(grupo.ordem ?? 0);
      setPreviewUrl(grupo.foto ? getFotoUrl(grupo.foto) : null);
      setFotoFile(null);
    } else {
      setNome('');
      setOrdem(0);
      setPreviewUrl(null);
      setFotoFile(null);
    }
    setError('');
  }, [grupo, isOpen]);

  function getFotoUrl(foto) {
    if (!foto) return null;
    if (typeof foto === 'string' && foto.startsWith('data:')) return foto;
    const base = api.defaults.baseURL || '/api';
    return base.replace(/\/api\/?$/, '') + '/api/uploads/grupos-produtos/' + foto;
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
    const nomeTrim = (nome || '').trim();
    if (!nomeTrim) {
      setError('Nome do grupo é obrigatório.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      let id = grupo && grupo.id;
      if (isEdit) {
        await api.put(`/grupos/${id}`, { nome: nomeTrim, ordem: Number(ordem) || 0 });
      } else {
        const res = await api.post('/grupos', { nome: nomeTrim, ordem: Number(ordem) || 0 });
        id = res.data && res.data.id;
      }
      if (id && fotoFile) {
        await uploadFotoGrupo(id, fotoFile);
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Erro ao salvar.');
    } finally {
      setSaving(false);
    }
  };

  const handleRemover = async () => {
    if (!grupo || !grupo.id) return;
    const msg = `Desativar o grupo "${grupo.nome}"? As famílias deste grupo continuarão existindo, mas o grupo não aparecerá na lista.`;
    if (!window.confirm(msg)) return;
    setRemoving(true);
    setError('');
    try {
      await api.delete(`/grupos/${grupo.id}`);
      onSaved();
      onClose();
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Erro ao remover grupo.');
    } finally {
      setRemoving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-grupo-overlay" onClick={onClose}>
      <div className="modal-grupo-container" onClick={(e) => e.stopPropagation()}>
        <div className="modal-grupo-header">
          <h2>{isEdit ? 'Editar grupo' : 'Novo grupo'}</h2>
          <button type="button" className="modal-grupo-close" onClick={onClose} aria-label="Fechar">
            <FiX size={22} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="modal-grupo-form">
          {error && <div className="modal-grupo-error">{error}</div>}
          <div className="modal-grupo-field">
            <label>Nome do grupo *</label>
            <input
              type="text"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Ex: Masseira, Dispersores"
              autoFocus
            />
          </div>
          <div className="modal-grupo-field">
            <label>Ordem (opcional)</label>
            <input
              type="number"
              min="0"
              value={ordem}
              onChange={(e) => setOrdem(e.target.value)}
            />
          </div>
          <div className="modal-grupo-field">
            <label>Foto (opcional)</label>
            <div className="modal-grupo-foto-row">
              <div className="modal-grupo-preview">
                {previewUrl ? (
                  <img src={previewUrl} alt="Preview" />
                ) : (
                  <span className="modal-grupo-preview-placeholder">Sem imagem</span>
                )}
              </div>
              <label className="btn-upload-label">
                <FiUploadCloud size={18} />
                {fotoFile ? 'Trocar imagem' : 'Enviar imagem'}
                <input
                  type="file"
                  accept="image/jpeg,image/jpg,image/png,image/gif,image/webp"
                  onChange={handleFileChange}
                  className="sr-only"
                />
              </label>
            </div>
          </div>
          <div className="modal-grupo-actions">
            <div className="modal-grupo-actions-left">
              {isEdit && (
                <button
                  type="button"
                  className="btn-remover-grupo"
                  onClick={handleRemover}
                  disabled={saving || removing}
                  title="Desativar este grupo"
                >
                  <FiTrash2 size={18} />
                  {removing ? 'Removendo...' : 'Remover grupo'}
                </button>
              )}
            </div>
            <div className="modal-grupo-actions-right">
              <button type="button" className="btn-cancel" onClick={onClose}>
                Cancelar
              </button>
              <button type="submit" className="btn-save" disabled={saving}>
                {saving ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ModalGrupoForm;
