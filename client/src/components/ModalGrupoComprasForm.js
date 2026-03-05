import React, { useState, useEffect } from 'react';
import { FiX, FiUploadCloud, FiTrash2 } from 'react-icons/fi';
import api from '../services/api';
import './ModalGrupoForm.css';

const API_BASE = '/compras/grupos';

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

async function uploadFotoGrupoCompras(id, file) {
  const endpoint = `/compras/grupos/${id}/foto`;
  const formData = new FormData();
  formData.append('foto', file);
  try {
    return await uploadFormData(endpoint, formData);
  } catch (err) {
    if (err.response && err.response.status === 400) {
      const base64 = await fileToDataUrl(file);
      const { data } = await api.post(`/compras/grupos/${id}/foto-base64`, { foto_base64: base64 });
      return data;
    }
    throw err;
  }
}

function buildOpcoesNumero(totalGrupos, numeroAtual) {
  const maxN = Math.max(5, (totalGrupos || 0) + 1);
  const maxVal = Math.max(10 * maxN, numeroAtual && numeroAtual >= 10 ? numeroAtual : 10);
  const opcoes = [];
  for (let n = 10; n <= maxVal; n += 10) opcoes.push(n);
  return opcoes;
}

const ModalGrupoComprasForm = ({ isOpen, onClose, onSaved, grupo, totalGrupos = 0 }) => {
  const isEdit = !!grupo && !!grupo.id;
  const [nome, setNome] = useState('');
  const [numero, setNumero] = useState(10);
  const [ordem, setOrdem] = useState(0);
  const [fotoFile, setFotoFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState('');

  const opcoesNumero = React.useMemo(
    () => buildOpcoesNumero(totalGrupos, grupo?.numero != null ? Number(grupo.numero) : null),
    [totalGrupos, grupo?.numero]
  );

  useEffect(() => {
    if (grupo) {
      setNome(grupo.nome || '');
      const n = Number(grupo.numero);
      setNumero((n >= 10 && n % 10 === 0) ? n : 10);
      setOrdem(grupo.ordem ?? 0);
      setPreviewUrl(grupo.foto ? getFotoUrl(grupo.foto) : null);
      setFotoFile(null);
    } else {
      setNome('');
      setNumero(10);
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
    return base.replace(/\/api\/?$/, '') + '/api/uploads/grupos-compras/' + foto;
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
      const numeroVal = Number(numero) >= 10 && Number(numero) % 10 === 0 ? Number(numero) : 10;
      if (isEdit) {
        await api.put(`${API_BASE}/${id}`, { nome: nomeTrim, numero: numeroVal, ordem: Number(ordem) || 0 });
      } else {
        const res = await api.post(API_BASE, { nome: nomeTrim, numero: numeroVal, ordem: Number(ordem) || 0 });
        id = res.data && res.data.id;
      }
      if (id && fotoFile) {
        await uploadFotoGrupoCompras(id, fotoFile);
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
    const msg = `Desativar o grupo "${grupo.nome}"? Os fornecedores continuarão cadastrados, mas o grupo não aparecerá na lista.`;
    if (!window.confirm(msg)) return;
    setRemoving(true);
    setError('');
    try {
      await api.delete(`${API_BASE}/${grupo.id}`);
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
              placeholder="Ex: Insumos, Peças, Serviços"
              autoFocus
            />
          </div>
          <div className="modal-grupo-field modal-grupo-field-numero">
            <label>Número do grupo</label>
            <select
              value={String(numero)}
              onChange={(e) => setNumero(Number(e.target.value))}
              title="10, 20, 30…"
              className="modal-grupo-select-numero"
            >
              {opcoesNumero.map((n) => (
                <option key={n} value={String(n)}>{n}</option>
              ))}
            </select>
            <span className="modal-grupo-field-hint">10, 20, 30… até o máximo pela quantidade de grupos.</span>
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

export default ModalGrupoComprasForm;
