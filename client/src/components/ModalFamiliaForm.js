import React, { useState, useEffect } from 'react';
import { FiX, FiUploadCloud } from 'react-icons/fi';
import api from '../services/api';
import './ModalFamiliaForm.css';

// Upload de arquivo com fetch para garantir Content-Type multipart com boundary (evita 400 no servidor)
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

const ModalFamiliaForm = ({ isOpen, onClose, onSaved, onSavedLocal, familia, useLocalOnly, familiasAtuais = [] }) => {
  const isEdit = !!familia && !!familia.id;
  const [nome, setNome] = useState('');
  const [ordem, setOrdem] = useState(0);
  const [fotoFile, setFotoFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [esquematicoFile, setEsquematicoFile] = useState(null);
  const [esquematicoPreviewUrl, setEsquematicoPreviewUrl] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (familia) {
      setNome(familia.nome || '');
      setOrdem(familia.ordem || 0);
      setPreviewUrl(familia.foto ? getFotoUrl(familia.foto) : null);
      setEsquematicoPreviewUrl(familia.esquematico ? getEsquematicoUrl(familia.esquematico) : null);
    } else {
      setNome('');
      setOrdem(0);
      setPreviewUrl(null);
      setFotoFile(null);
      setEsquematicoPreviewUrl(null);
      setEsquematicoFile(null);
    }
    setError('');
  }, [familia, isOpen]);

  function getFotoUrl(foto) {
    if (!foto) return null;
    if (typeof foto === 'string' && foto.startsWith('data:')) return foto;
    const base = api.defaults.baseURL || '/api';
    return base.replace(/\/api\/?$/, '') + '/api/uploads/familias-produtos/' + foto;
  }

  function getEsquematicoUrl(esquematico) {
    if (!esquematico) return null;
    const base = api.defaults.baseURL || '/api';
    return base.replace(/\/api\/?$/, '') + '/api/uploads/familias-produtos/' + esquematico;
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

  const handleEsquematicoChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!/^image\/(jpeg|jpg|png|gif|webp)$/i.test(file.type)) {
      setError('Esquemático: use apenas imagens (JPEG, PNG, GIF, WEBP).');
      return;
    }
    setError('');
    setEsquematicoFile(file);
    setEsquematicoPreviewUrl(URL.createObjectURL(file));
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

    if (useLocalOnly) {
      const ordemNum = Number(ordem) || 0;
      let novaLista;
      if (isEdit) {
        novaLista = familiasAtuais.map((f) =>
          String(f.id) === String(familia.id) ? { ...f, nome: nomeTrim, ordem: ordemNum } : f
        );
      } else {
        const novoId = 'local_' + Date.now();
        novaLista = [...familiasAtuais, { id: novoId, nome: nomeTrim, ordem: ordemNum, foto: null }];
      }
      onSavedLocal(novaLista);
      setSaving(false);
      return;
    }

    try {
      if (isEdit) {
        await api.put(`/familias/${familia.id}`, { nome: nomeTrim, ordem: Number(ordem) || 0 });
        if (fotoFile) {
          const fd = new FormData();
          fd.append('foto', fotoFile);
          await uploadFormData(`/familias/${familia.id}/foto`, fd);
        }
        if (esquematicoFile) {
          const fd = new FormData();
          fd.append('esquematico', esquematicoFile);
          await uploadFormData(`/familias/${familia.id}/esquematico`, fd);
        }
      } else {
        const res = await api.post('/familias', { nome: nomeTrim, ordem: Number(ordem) || 0 });
        const newId = res.data && res.data.id;
        if (newId) {
          if (fotoFile) {
            const fd = new FormData();
            fd.append('foto', fotoFile);
            await uploadFormData(`/familias/${newId}/foto`, fd);
          }
          if (esquematicoFile) {
            const fd = new FormData();
            fd.append('esquematico', esquematicoFile);
            await uploadFormData(`/familias/${newId}/esquematico`, fd);
          }
        }
      }
      onSaved();
      onClose();
    } catch (err) {
      const status = err.response?.status;
      const msg = err.response?.data?.error || err.message || 'Erro ao salvar.';
      if (status === 404) {
        setError(
          'A API de famílias não está disponível. Salvando só neste navegador (modo local). Recarregue a página para usar o cadastro local.'
        );
        setTimeout(() => {
          onSavedLocal([
            ...familiasAtuais,
            { id: 'local_' + Date.now(), nome: nomeTrim, ordem: Number(ordem) || 0, foto: null }
          ]);
          onClose();
        }, 1500);
      } else if (status === 401 || status === 403) {
        setError('Sessão expirada. Faça login novamente.');
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
          <h2>{isEdit ? 'Editar Família' : 'Nova Família'}</h2>
          <button type="button" className="modal-familia-close" onClick={onClose}>
            <FiX />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="modal-familia-form">
          {useLocalOnly && (
            <div className="modal-familia-info" style={{ marginBottom: 12, fontSize: 13, color: '#666' }}>
              Modo local: os dados ficam só neste navegador.
            </div>
          )}
          {error && <div className="modal-familia-error">{error}</div>}
          <div className="modal-familia-field">
            <label>Nome da família *</label>
            <input
              type="text"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Ex: Misturadores, Dosadores"
              autoFocus
            />
          </div>
          <div className="modal-familia-field">
            <label>Ordem (opcional)</label>
            <input
              type="number"
              min="0"
              value={ordem}
              onChange={(e) => setOrdem(e.target.value)}
            />
          </div>
          {!useLocalOnly && (
            <>
              <div className="modal-familia-field">
                <label>Foto (opcional)</label>
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
              <div className="modal-familia-field">
                <label>Vista frontal / Esquemático (opcional)</label>
                <p className="modal-familia-hint">Imagem de referência ao cadastrar produtos desta família</p>
                <div className="modal-familia-foto-row">
                  <div className="modal-familia-preview">
                    {esquematicoPreviewUrl ? (
                      <img src={esquematicoPreviewUrl} alt="Esquemático" />
                    ) : (
                      <div className="modal-familia-preview-placeholder">
                        <FiUploadCloud size={32} />
                        <span>Nenhum esquemático</span>
                      </div>
                    )}
                  </div>
                  <div className="modal-familia-upload">
                    <input
                      type="file"
                      accept="image/jpeg,image/jpg,image/png,image/gif,image/webp"
                      onChange={handleEsquematicoChange}
                      id="familia-esquematico-input"
                    />
                    <label htmlFor="familia-esquematico-input" className="btn-upload-label">
                      {esquematicoFile ? 'Trocar esquemático' : 'Enviar esquemático'}
                    </label>
                  </div>
                </div>
              </div>
            </>
          )}
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
