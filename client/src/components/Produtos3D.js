import React, { useState, useEffect } from 'react';
import api from '../services/api';
import { FiPlus, FiTrash2, FiEye, FiEdit, FiX, FiFileText, FiBox } from 'react-icons/fi';
import { toast } from 'react-toastify';
import './Produtos3D.css';

const Produtos3D = () => {
  const [lista, setLista] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showViewer, setShowViewer] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [formNome, setFormNome] = useState('');
  const [formArquivo, setFormArquivo] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const loadLista = async () => {
    setLoading(true);
    try {
      const res = await api.get('/produtos-3d');
      setLista(res.data || []);
    } catch (e) {
      console.error(e);
      toast.error('Erro ao carregar Produtos 3D');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLista();
  }, []);

  const getFileUrl = (arquivoNome) => {
    const base = api.defaults.baseURL || '';
    return `${base}/uploads/produtos-3d/${arquivoNome}`;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const nome = (formNome || '').trim();
    if (!nome) {
      toast.warning('Informe o nome.');
      return;
    }
    if (!editingId && !formArquivo) {
      toast.warning('Selecione um arquivo (PDF ou modelo 3D: GLB, GLTF, OBJ).');
      return;
    }
    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('nome', nome);
      if (formArquivo) formData.append('arquivo', formArquivo);
      if (editingId) {
        await api.put(`/produtos-3d/${editingId}`, formData);
        toast.success('Produto 3D atualizado.');
      } else {
        await api.post('/produtos-3d', formData);
        toast.success('Produto 3D cadastrado.');
      }
      setShowForm(false);
      setEditingId(null);
      setFormNome('');
      setFormArquivo(null);
      loadLista();
    } catch (err) {
      const msg = err.response?.data?.error || err.message;
      toast.error(msg || 'Erro ao salvar.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id, nome) => {
    if (!window.confirm(`Excluir "${nome}"?`)) return;
    try {
      await api.delete(`/produtos-3d/${id}`);
      toast.success('Excluído.');
      if (showViewer?.id === id) setShowViewer(null);
      loadLista();
    } catch (e) {
      toast.error(e.response?.data?.error || 'Erro ao excluir.');
    }
  };

  const openEdit = (item) => {
    setEditingId(item.id);
    setFormNome(item.nome);
    setFormArquivo(null);
    setShowForm(true);
  };

  const openNew = () => {
    setEditingId(null);
    setFormNome('');
    setFormArquivo(null);
    setShowForm(true);
  };

  const is3D = (tipo) => tipo === '3d';

  return (
    <div className="produtos-3d-page">
      <div className="page-header">
        <div>
          <h1>Produtos 3D</h1>
          <p>Cadastre equipamentos com PDF ou modelo 3D (GLB/GLTF/OBJ) para visualização</p>
        </div>
        <button type="button" className="btn-primary produtos-3d-btn-new" onClick={openNew}>
          <FiPlus size={20} /> Novo Produto 3D
        </button>
      </div>

      <div className="produtos-3d-info">
        <p>
          <strong>PDF:</strong> use para documentação ou desenhos técnicos. Para <strong>visualização 3D interativa</strong>, faça upload de um modelo nos formatos <strong>GLB</strong> ou <strong>GLTF</strong> (gerados por ferramentas de CAD/3D).
        </p>
      </div>

      {loading ? (
        <div className="produtos-3d-loading">Carregando...</div>
      ) : (
        <div className="produtos-3d-grid">
          {lista.length === 0 ? (
            <div className="produtos-3d-empty">
              Nenhum produto 3D cadastrado. Clique em &quot;Novo Produto 3D&quot; para adicionar.
            </div>
          ) : (
            lista.map((item) => (
              <div key={item.id} className="produtos-3d-card">
                <div className="produtos-3d-card-header">
                  <span className={`produtos-3d-badge ${is3D(item.arquivo_tipo) ? 'badge-3d' : 'badge-pdf'}`}>
                    {is3D(item.arquivo_tipo) ? <FiBox size={14} /> : <FiFileText size={14} />}
                    {is3D(item.arquivo_tipo) ? '3D' : 'PDF'}
                  </span>
                </div>
                <div className="produtos-3d-card-title">{item.nome}</div>
                <div className="produtos-3d-card-actions">
                  <button
                    type="button"
                    className="btn-icon"
                    title="Visualizar"
                    onClick={() => setShowViewer(item)}
                  >
                    <FiEye />
                  </button>
                  <button type="button" className="btn-icon" title="Editar" onClick={() => openEdit(item)}>
                    <FiEdit />
                  </button>
                  <button
                    type="button"
                    className="btn-icon btn-danger"
                    title="Excluir"
                    onClick={() => handleDelete(item.id, item.nome)}
                  >
                    <FiTrash2 />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {showForm && (
        <div className="produtos-3d-modal-overlay" onClick={() => { setShowForm(false); setEditingId(null); }}>
          <div className="produtos-3d-modal" onClick={(e) => e.stopPropagation()}>
            <div className="produtos-3d-modal-header">
              <h2>{editingId ? 'Editar Produto 3D' : 'Novo Produto 3D'}</h2>
              <button type="button" className="btn-close" onClick={() => { setShowForm(false); setEditingId(null); }}>
                <FiX />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="produtos-3d-form">
              <div className="form-group">
                <label>Nome *</label>
                <input
                  type="text"
                  value={formNome}
                  onChange={(e) => setFormNome(e.target.value)}
                  placeholder="Ex: Dispersor AGF-1"
                  required
                />
              </div>
              <div className="form-group">
                <label>Arquivo {editingId ? '(deixe em branco para manter o atual)' : '*'} </label>
                <input
                  type="file"
                  accept=".pdf,.glb,.gltf,.obj"
                  onChange={(e) => setFormArquivo(e.target.files?.[0] || null)}
                />
                <small>PDF ou modelo 3D: GLB, GLTF, OBJ (máx. 50MB)</small>
              </div>
              <div className="produtos-3d-form-actions">
                <button type="button" className="btn-secondary" onClick={() => { setShowForm(false); setEditingId(null); }}>
                  Cancelar
                </button>
                <button type="submit" className="btn-primary" disabled={submitting}>
                  {submitting ? 'Salvando...' : editingId ? 'Atualizar' : 'Cadastrar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showViewer && (
        <div className="produtos-3d-modal-overlay viewer" onClick={() => setShowViewer(null)}>
          <div className="produtos-3d-viewer-modal" onClick={(e) => e.stopPropagation()}>
            <div className="produtos-3d-viewer-header">
              <h2>{showViewer.nome}</h2>
              <button type="button" className="btn-close" onClick={() => setShowViewer(null)}>
                <FiX />
              </button>
            </div>
            <div className="produtos-3d-viewer-body">
              {showViewer.arquivo_tipo === 'pdf' ? (
                <iframe
                  title={showViewer.nome}
                  src={getFileUrl(showViewer.arquivo_nome)}
                  className="produtos-3d-iframe-pdf"
                />
              ) : (() => {
                const url = getFileUrl(showViewer.arquivo_nome);
                const ext = (showViewer.arquivo_nome || '').split('.').pop()?.toLowerCase();
                const isGlbGltf = ext === 'glb' || ext === 'gltf';
                if (isGlbGltf) {
                  return (
                    <div className="produtos-3d-model-container">
                      <model-viewer
                        src={url}
                        alt={showViewer.nome}
                        auto-rotate
                        camera-controls
                        shadow-intensity="1"
                        style={{ width: '100%', height: '100%', minHeight: '400px' }}
                      />
                    </div>
                  );
                }
                return (
                  <div className="produtos-3d-download-fallback">
                    <p>Formato OBJ não possui visualização no navegador. Faça o download do arquivo.</p>
                    <a href={url} download target="_blank" rel="noopener noreferrer" className="btn-primary">
                      Baixar arquivo
                    </a>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Produtos3D;
