import React, { useState, useEffect, useCallback, useMemo } from 'react';
import ReactDOM from 'react-dom';
import { FiX, FiUploadCloud, FiTrash2, FiEdit2, FiSearch, FiPlus } from 'react-icons/fi';
import api from '../services/api';
import './ModalFamiliaForm.css';

// Fallback mínimo se a API de variáveis não estiver disponível
const VARIAVEIS_FALLBACK = [
  { chave: 'motor_central_cv', nome: 'Potência motor central (CV)', categoria: 'Motor' },
  { chave: 'diametro', nome: 'Diâmetro', categoria: 'Geral' },
  { chave: 'outro', nome: 'Outro (campo livre)', categoria: null }
];

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

// Converte File para data URL (base64) para fallback quando multipart falha
function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Falha ao ler arquivo'));
    reader.readAsDataURL(file);
  });
}

// Tenta upload multipart; se der 400, reenvia em base64 (contorna proxy que quebra multipart)
async function uploadImagemFamilia(tipo, id, file) {
  const endpoint = `/familias/${id}/${tipo}`;
  const formData = new FormData();
  formData.append(tipo, file);
  try {
    return await uploadFormData(endpoint, formData);
  } catch (err) {
    if (err.response && err.response.status === 400) {
      const base64 = await fileToDataUrl(file);
      const body = tipo === 'foto' ? { foto_base64: base64 } : { esquematico_base64: base64 };
      const { data } = await api.post(`/familias/${id}/${tipo}-base64`, body);
      return data;
    }
    throw err;
  }
}

function parseMarcadores(raw) {
  if (!raw) return [];
  let arr = [];
  if (Array.isArray(raw)) arr = raw.map(m => ({ ...m, id: m.id || 'm' + Math.random().toString(36).slice(2) }));
  else if (raw.marcadores && Array.isArray(raw.marcadores)) arr = raw.marcadores.map(m => ({ ...m, id: m.id || 'm' + Math.random().toString(36).slice(2) }));
  return arr.map((m, i) => ({ ...m, numero: m.numero != null ? m.numero : i + 1 }));
}

const ModalFamiliaForm = ({ isOpen, onClose, onSaved, onSavedLocal, familia, useLocalOnly, familiasAtuais = [] }) => {
  const isEdit = !!familia && !!familia.id;
  const [nome, setNome] = useState('');
  const [ordem, setOrdem] = useState(0);
  const [fotoFile, setFotoFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [esquematicoFile, setEsquematicoFile] = useState(null);
  const [esquematicoPreviewUrl, setEsquematicoPreviewUrl] = useState(null);
  const [marcadores, setMarcadores] = useState([]);
  const [editingMarcadorId, setEditingMarcadorId] = useState(null);
  const [variaveisTecnicas, setVariaveisTecnicas] = useState([]);
  const [searchVariavel, setSearchVariavel] = useState('');
  const [showBolinhasPremium, setShowBolinhasPremium] = useState(false);
  const [modoAdicionarBolinha, setModoAdicionarBolinha] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      api.get('/variaveis-tecnicas', { params: { ativo: 'true' } })
        .then((res) => setVariaveisTecnicas(Array.isArray(res.data) ? res.data : []))
        .catch(() => setVariaveisTecnicas([]));
    }
  }, [isOpen]);

  const variaveisList = useMemo(() => {
    const list = variaveisTecnicas.length ? variaveisTecnicas : VARIAVEIS_FALLBACK;
    return list.map(v => ({ chave: v.chave || v.key, nome: v.nome || v.label, categoria: v.categoria || '' }));
  }, [variaveisTecnicas]);

  const variaveisFiltradas = useMemo(() => {
    const t = (searchVariavel || '').trim().toLowerCase();
    if (!t) return variaveisList;
    return variaveisList.filter(v =>
      (v.nome || '').toLowerCase().includes(t) || (v.chave || '').toLowerCase().includes(t)
    );
  }, [variaveisList, searchVariavel]);

  useEffect(() => {
    if (familia) {
      setNome(familia.nome || '');
      setOrdem(familia.ordem || 0);
      setPreviewUrl(familia.foto ? getFotoUrl(familia.foto) : null);
      setEsquematicoPreviewUrl(familia.esquematico ? getEsquematicoUrl(familia.esquematico) : null);
      const raw = familia.marcadores_vista;
      setMarcadores(parseMarcadores(typeof raw === 'string' ? (() => { try { return JSON.parse(raw); } catch (_) { return []; } })() : raw));
    } else {
      setNome('');
      setOrdem(0);
      setPreviewUrl(null);
      setFotoFile(null);
      setEsquematicoPreviewUrl(null);
      setEsquematicoFile(null);
      setMarcadores([]);
    }
    setEditingMarcadorId(null);
    setShowBolinhasPremium(false);
    setModoAdicionarBolinha(false);
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

  const vistaFrontalRef = React.useRef(null);
  const getVistaRect = useCallback(() => {
    const el = vistaFrontalRef.current;
    if (!el) return null;
    const img = el.querySelector('img');
    return (img && img.getBoundingClientRect) ? img.getBoundingClientRect() : el.getBoundingClientRect();
  }, []);
  const handleVistaFrontalClick = useCallback((e) => {
    if (!modoAdicionarBolinha) return;
    const rect = getVistaRect();
    if (!rect || rect.width <= 0 || rect.height <= 0) return;
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    const primeiroChave = (variaveisList[0] && variaveisList[0].chave) || 'outro';
    const novoId = 'm' + Date.now();
    setMarcadores(prev => {
      const proximoNumero = prev.length === 0 ? 1 : Math.max(...prev.map(m => m.numero || 0), 0) + 1;
      const novo = {
        id: novoId,
        x: Math.max(0, Math.min(100, x)),
        y: Math.max(0, Math.min(100, y)),
        label: 'Nova variável',
        variavel: primeiroChave,
        tipo: 'texto',
        numero: proximoNumero,
        width: 12,
        height: 12
      };
      return [...prev, novo];
    });
    setEditingMarcadorId(novoId);
  }, [variaveisList, modoAdicionarBolinha, getVistaRect]);

  const [draggingMarcadorId, setDraggingMarcadorId] = useState(null);
  const dragStartRef = React.useRef({ x: 0, y: 0, id: null });
  const didMoveRef = React.useRef(false);

  const [resizingMarcadorId, setResizingMarcadorId] = useState(null);
  const [resizeHandle, setResizeHandle] = useState(null);
  const resizeStartRef = React.useRef({ x: 0, y: 0, width: 12, height: 12 });

  const handleBolinhaMouseDown = useCallback((e, id) => {
    e.preventDefault();
    e.stopPropagation();
    dragStartRef.current = { x: e.clientX, y: e.clientY, id };
    didMoveRef.current = false;
    setDraggingMarcadorId(id);
  }, []);

  const handleResizeHandleMouseDown = useCallback((e, id, handle) => {
    e.preventDefault();
    e.stopPropagation();
    const m = marcadores.find(mr => mr.id === id);
    if (!m) return;
    resizeStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      width: Math.max(6, Math.min(80, m.width != null ? Number(m.width) : 12)),
      height: Math.max(6, Math.min(80, m.height != null ? Number(m.height) : 12))
    };
    setResizingMarcadorId(id);
    setResizeHandle(handle);
  }, [marcadores]);

  useEffect(() => {
    if (!resizingMarcadorId || !resizeHandle) return;
    const id = resizingMarcadorId;
    const handle = resizeHandle;
    const clamp = (v) => Math.max(6, Math.min(80, v));
    const handleMove = (e) => {
      const dx = e.clientX - resizeStartRef.current.x;
      const dy = e.clientY - resizeStartRef.current.y;
      let w = resizeStartRef.current.width;
      let h = resizeStartRef.current.height;
      if (handle === 'e') w = clamp(resizeStartRef.current.width + dx);
      if (handle === 'w') w = clamp(resizeStartRef.current.width - dx);
      if (handle === 's') h = clamp(resizeStartRef.current.height + dy);
      if (handle === 'n') h = clamp(resizeStartRef.current.height - dy);
      setMarcadores(prev => prev.map(m => m.id === id ? { ...m, width: w, height: h } : m));
    };
    const handleUp = () => {
      setResizingMarcadorId(null);
      setResizeHandle(null);
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseup', handleUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseup', handleUp);
    document.body.style.cursor = handle === 'e' || handle === 'w' ? 'ew-resize' : 'ns-resize';
    document.body.style.userSelect = 'none';
    return () => {
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseup', handleUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [resizingMarcadorId, resizeHandle]);

  useEffect(() => {
    if (!draggingMarcadorId) return;
    const id = draggingMarcadorId;
    const handleMove = (e) => {
      didMoveRef.current = true;
      const rect = getVistaRect();
      if (!rect || rect.width <= 0 || rect.height <= 0) return;
      const x = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
      const y = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100));
      setMarcadores(prev => prev.map(m => m.id === id ? { ...m, x, y } : m));
    };
    const handleUp = () => {
      if (!didMoveRef.current) setEditingMarcadorId(id);
      setDraggingMarcadorId(null);
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseup', handleUp);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };
    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseup', handleUp);
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'grabbing';
    return () => {
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseup', handleUp);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };
  }, [draggingMarcadorId, getVistaRect]);

  const updateMarcador = useCallback((id, updates) => {
    setMarcadores(prev => prev.map(m => m.id === id ? { ...m, ...updates } : m));
  }, []);

  const removeMarcador = useCallback((id) => {
    setMarcadores(prev => prev.filter(m => m.id !== id));
    if (editingMarcadorId === id) setEditingMarcadorId(null);
  }, [editingMarcadorId]);

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
        await api.put(`/familias/${familia.id}`, {
          nome: nomeTrim,
          ordem: Number(ordem) || 0,
          marcadores_vista: marcadores
        });
        if (fotoFile) await uploadImagemFamilia('foto', familia.id, fotoFile);
        if (esquematicoFile) await uploadImagemFamilia('esquematico', familia.id, esquematicoFile);
      } else {
        const res = await api.post('/familias', { nome: nomeTrim, ordem: Number(ordem) || 0 });
        const newId = res.data && res.data.id;
        if (newId) {
          if (fotoFile) await uploadImagemFamilia('foto', newId, fotoFile);
          if (esquematicoFile) await uploadImagemFamilia('esquematico', newId, esquematicoFile);
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

  const renderBolinhasPremium = () => (
    <div className="bolinhas-premium-overlay" onClick={() => { setShowBolinhasPremium(false); setModoAdicionarBolinha(false); }}>
      <div className="bolinhas-premium-container" onClick={(e) => e.stopPropagation()}>
        <div className="bolinhas-premium-header">
          <div className="bolinhas-premium-header-content">
            <h2>Marcadores técnicos na vista frontal</h2>
            <p>
              {modoAdicionarBolinha
                ? 'Clique na imagem para posicionar um marcador. Depois edite na lista à direita.'
                : 'Use o botão "Adicionar marcador" e clique na imagem. Arraste um marcador para mover; clique sem arrastar para editar.'}
            </p>
          </div>
          <div className="bolinhas-premium-header-actions">
            {modoAdicionarBolinha ? (
              <button type="button" className="bolinhas-premium-btn-cancelar" onClick={() => setModoAdicionarBolinha(false)}>
                Cancelar
              </button>
            ) : (
              <button type="button" className="bolinhas-premium-btn-adicionar" onClick={() => setModoAdicionarBolinha(true)}>
                <FiPlus size={18} /> Adicionar marcador
              </button>
            )}
            <button type="button" className="bolinhas-premium-close" onClick={() => { setShowBolinhasPremium(false); setModoAdicionarBolinha(false); }}>
              Concluído
            </button>
          </div>
        </div>
        <div className="bolinhas-premium-body">
          <div className="bolinhas-premium-vista">
            <div className={`bolinhas-premium-vista-inner ${modoAdicionarBolinha ? 'modo-adicionar' : ''}`}>
              <div
                ref={vistaFrontalRef}
                className="vista-image-wrap"
                onClick={handleVistaFrontalClick}
              >
                <img src={esquematicoPreviewUrl} alt="Vista frontal" draggable={false} />
                {marcadores.map((m) => {
                  const w = Math.max(6, Math.min(80, m.width != null ? Number(m.width) : 12));
                  const h = Math.max(6, Math.min(80, m.height != null ? Number(m.height) : 12));
                  const isEditing = editingMarcadorId === m.id;
                  if (isEditing) {
                    return (
                      <div
                        key={m.id}
                        className="vista-marcador-resize-wrap"
                        style={{ left: m.x + '%', top: m.y + '%' }}
                        title="Arraste as alças nas laterais para redimensionar"
                      >
                        <span className="vista-marcador-resize-preview" style={{ width: w + 'px', height: h + 'px' }} />
                        <span className="vista-marcador-handle vista-marcador-handle-e" onMouseDown={(ev) => handleResizeHandleMouseDown(ev, m.id, 'e')} title="Largura" />
                        <span className="vista-marcador-handle vista-marcador-handle-w" onMouseDown={(ev) => handleResizeHandleMouseDown(ev, m.id, 'w')} title="Largura" />
                        <span className="vista-marcador-handle vista-marcador-handle-s" onMouseDown={(ev) => handleResizeHandleMouseDown(ev, m.id, 's')} title="Altura" />
                        <span className="vista-marcador-handle vista-marcador-handle-n" onMouseDown={(ev) => handleResizeHandleMouseDown(ev, m.id, 'n')} title="Altura" />
                      </div>
                    );
                  }
                  return (
                    <span
                      key={m.id}
                      className={`vista-marcador-bolinha bolinhas-premium-bolinha ${draggingMarcadorId === m.id ? 'vista-marcador-dragging' : ''}`}
                      style={{ left: m.x + '%', top: m.y + '%' }}
                      title={`${m.numero != null ? m.numero + '. ' : ''}${m.label} — Arraste para mover`}
                      onMouseDown={(ev) => handleBolinhaMouseDown(ev, m.id)}
                    >
                      {m.numero != null ? m.numero : ''}
                    </span>
                  );
                })}
              </div>
            </div>
          </div>
          <div className="bolinhas-premium-list-panel">
            <div className="bolinhas-premium-list-header">
              <span className="bolinhas-premium-list-title">Marcadores técnicos ({marcadores.length})</span>
              {!modoAdicionarBolinha ? (
                <button type="button" className="bolinhas-premium-list-btn-adicionar" onClick={() => setModoAdicionarBolinha(true)}>
                  <FiPlus size={16} /> Adicionar marcador
                </button>
              ) : (
                <span className="bolinhas-premium-list-hint">Clique na imagem para posicionar</span>
              )}
            </div>
            <ul className="bolinhas-premium-list">
              {marcadores.length === 0 ? (
                <li className="bolinhas-premium-empty">
                  <p>Nenhuma variável ainda.</p>
                  <p>Use o botão &quot;Adicionar marcador&quot; no topo e clique na imagem para adicionar.</p>
                </li>
              ) : (
                marcadores.map((m) => (
                  <li key={m.id} className={`bolinhas-premium-card ${editingMarcadorId === m.id ? 'editing' : ''}`}>
                    {editingMarcadorId === m.id ? (
                      <div className="bolinhas-premium-card-edit">
                        <input
                          type="text"
                          value={m.label}
                          onChange={(e) => updateMarcador(m.id, { label: e.target.value })}
                          placeholder="Rótulo (ex: Potência CV)"
                        />
                        <div className="bolinhas-premium-variavel-search">
                          <FiSearch size={16} />
                          <input
                            type="text"
                            value={searchVariavel}
                            onChange={(e) => setSearchVariavel(e.target.value)}
                            placeholder="Buscar variável..."
                          />
                        </div>
                        <select
                          value={m.variavel || (variaveisList[0]?.chave) || 'outro'}
                          onChange={(e) => updateMarcador(m.id, { variavel: e.target.value })}
                        >
                          {variaveisFiltradas.length === 0 ? (
                            <option value={m.variavel || ''}>{variaveisList.find(v => v.chave === m.variavel)?.nome || m.variavel || '—'}</option>
                          ) : (
                            variaveisFiltradas.map((v) => (
                              <option key={v.chave} value={v.chave}>{v.nome} {v.categoria ? `(${v.categoria})` : ''}</option>
                            ))
                          )}
                        </select>
                        <div className="bolinhas-premium-card-tipo">
                          <label>Tipo na proposta:</label>
                          <select
                            value={m.tipo || 'texto'}
                            onChange={(e) => updateMarcador(m.id, { tipo: e.target.value })}
                          >
                            <option value="texto">Variável (dropdown)</option>
                            <option value="numero">Número</option>
                            <option value="selecao">Seleção simples (clicar = incluir na proposta)</option>
                          </select>
                        </div>
                        <div className="bolinhas-premium-card-tamanho">
                          <label>Tamanho:</label>
                          <p className="bolinhas-premium-tamanho-hint">
                            {Math.max(6, Math.min(80, m.width != null ? Number(m.width) : 12))} × {Math.max(6, Math.min(80, m.height != null ? Number(m.height) : 12))} px — arraste as alças na imagem
                          </p>
                        </div>
                        <div className="bolinhas-premium-card-actions">
                          <button type="button" onClick={() => { setEditingMarcadorId(null); setSearchVariavel(''); }}>Ok</button>
                          <button type="button" onClick={() => removeMarcador(m.id)} className="danger">Remover</button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <span className="bolinhas-premium-dot bolinhas-premium-numero">{m.numero != null ? m.numero : '—'}</span>
                        <div className="bolinhas-premium-card-info">
                          <strong>{m.numero != null ? m.numero + '. ' : ''}{m.label}</strong>
                          <span>{variaveisList.find(v => v.chave === m.variavel)?.nome || m.variavel}{m.tipo === 'selecao' ? ' · Seleção' : ''}</span>
                        </div>
                        <div className="bolinhas-premium-card-actions">
                          <button type="button" onClick={() => setEditingMarcadorId(m.id)} title="Editar">Editar</button>
                          <button type="button" onClick={() => removeMarcador(m.id)} className="danger" title="Remover">Remover</button>
                        </div>
                      </>
                    )}
                  </li>
                ))
              )}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );

  if (showBolinhasPremium && isEdit && esquematicoPreviewUrl) {
    return ReactDOM.createPortal(renderBolinhasPremium(), document.body);
  }

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
                <p className="modal-familia-hint">Imagem de referência ao cadastrar produtos. Use o botão &quot;Adicionar marcador&quot; para posicionar variáveis técnicas na vista. Arraste os marcadores para mover.</p>
                <div className="modal-familia-vista-wrapper">
                  <div className={`modal-familia-vista-frontal ${esquematicoPreviewUrl ? 'has-image' : ''} ${modoAdicionarBolinha ? 'modo-adicionar' : ''}`}>
                    {esquematicoPreviewUrl ? (
                      <div
                        ref={vistaFrontalRef}
                        className="vista-image-wrap"
                        onClick={isEdit && modoAdicionarBolinha ? handleVistaFrontalClick : undefined}
                      >
                        <img src={esquematicoPreviewUrl} alt="Vista frontal" draggable={false} />
                        {marcadores.map((m) => (
                          <span
                            key={m.id}
                            className={`vista-marcador-bolinha ${draggingMarcadorId === m.id ? 'vista-marcador-dragging' : ''}`}
                            style={{ left: m.x + '%', top: m.y + '%' }}
                            title={`${m.numero != null ? m.numero + '. ' : ''}${m.label} — Arraste para mover`}
                            onMouseDown={(ev) => handleBolinhaMouseDown(ev, m.id)}
                          >
                            {m.numero != null ? m.numero : ''}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <div className="modal-familia-preview-placeholder modal-familia-vista-placeholder">
                        <FiUploadCloud size={40} />
                        <span>Nenhum esquemático</span>
                      </div>
                    )}
                  </div>
                  <div className="modal-familia-vista-upload">
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
                {isEdit && esquematicoPreviewUrl && (
                  <div className="modal-familia-marcadores-section">
                    <div className="modal-familia-marcadores-header">
                      <span className="marcadores-title">Marcadores técnicos na vista</span>
                      <span className="marcadores-hint">Adicione marcadores com o botão abaixo; arraste para mover; clique sem arrastar para editar.</span>
                      <div className="modal-familia-marcadores-buttons">
                        <button
                          type="button"
                          className={modoAdicionarBolinha ? 'btn-colocar-bolinha active' : 'btn-colocar-bolinha'}
                          onClick={() => setModoAdicionarBolinha(prev => !prev)}
                        >
                          <FiPlus size={16} /> {modoAdicionarBolinha ? 'Cancelar' : 'Adicionar marcador'}
                        </button>
                        <button
                          type="button"
                          className="btn-abrir-bolinhas-premium"
                          onClick={() => { setModoAdicionarBolinha(false); setShowBolinhasPremium(true); }}
                        >
                          Abrir tela grande para configurar marcadores
                        </button>
                      </div>
                    </div>
                    <ul className="modal-familia-marcadores-list">
                      {marcadores.map((m) => (
                        <li key={m.id} className={`marcador-item ${editingMarcadorId === m.id ? 'editing' : ''}`}>
                          <div className="marcador-item-main">
                            <span className="marcador-bolinha-preview" />
                            {editingMarcadorId === m.id ? (
                              <div className="marcador-edit-fields">
                                <input
                                  type="text"
                                  value={m.label}
                                  onChange={(e) => updateMarcador(m.id, { label: e.target.value })}
                                  placeholder="Rótulo (ex: Potência CV)"
                                  className="marcador-input"
                                />
                                <div className="marcador-variavel-select-wrap">
                                  <div className="marcador-variavel-search">
                                    <FiSearch size={14} />
                                    <input
                                      type="text"
                                      value={searchVariavel}
                                      onChange={(e) => setSearchVariavel(e.target.value)}
                                      placeholder="Buscar variável..."
                                      className="marcador-input"
                                    />
                                  </div>
                                  <select
                                    value={m.variavel || (variaveisList[0]?.chave) || 'outro'}
                                    onChange={(e) => updateMarcador(m.id, { variavel: e.target.value })}
                                    className="marcador-select"
                                  >
                                    {variaveisFiltradas.length === 0 ? (
                                      <option value={m.variavel || ''}>{variaveisList.find(v => v.chave === m.variavel)?.nome || m.variavel || '—'}</option>
                                    ) : (
                                      variaveisFiltradas.map((v) => (
                                        <option key={v.chave} value={v.chave}>{v.nome} {v.categoria ? `(${v.categoria})` : ''}</option>
                                      ))
                                    )}
                                  </select>
                                </div>
                                <div className="marcador-tipo-wrap">
                                  <label>Tipo na proposta:</label>
                                  <select
                                    value={m.tipo || 'texto'}
                                    onChange={(e) => updateMarcador(m.id, { tipo: e.target.value })}
                                    className="marcador-select"
                                  >
                                    <option value="texto">Variável (dropdown)</option>
                                    <option value="numero">Número</option>
                                    <option value="selecao">Seleção simples (clicar = incluir)</option>
                                  </select>
                                </div>
                                <div className="marcador-tamanho-wrap">
                                  <label>Tamanho:</label>
                                  <p className="marcador-tamanho-hint">{Math.max(6, Math.min(80, m.width != null ? Number(m.width) : 12))} × {Math.max(6, Math.min(80, m.height != null ? Number(m.height) : 12))} px — arraste as alças na imagem</p>
                                </div>
                                <div className="marcador-edit-actions">
                                  <button type="button" onClick={() => { setEditingMarcadorId(null); setSearchVariavel(''); }} className="marcador-btn-ok">Ok</button>
                                  <button type="button" onClick={() => removeMarcador(m.id)} className="marcador-btn-remove" title="Remover">
                                    <FiTrash2 size={14} />
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <>
                                <span className="marcador-numero">{m.numero != null ? m.numero + '.' : ''}</span>
                                <span className="marcador-label">{m.label}</span>
                                <span className="marcador-variavel">{variaveisList.find(v => v.chave === m.variavel)?.nome || m.variavel}{m.tipo === 'selecao' ? ' · Seleção' : ''}</span>
                                <button type="button" onClick={() => setEditingMarcadorId(m.id)} className="marcador-btn-edit" title="Editar">
                                  <FiEdit2 size={14} />
                                </button>
                                <button type="button" onClick={() => removeMarcador(m.id)} className="marcador-btn-remove" title="Remover">
                                  <FiTrash2 size={14} />
                                </button>
                              </>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                    {marcadores.length === 0 && (
                      <p className="marcadores-empty">Nenhum marcador técnico ainda. Use o botão &quot;Adicionar marcador&quot; e clique na vista frontal para adicionar.</p>
                    )}
                  </div>
                )}
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
