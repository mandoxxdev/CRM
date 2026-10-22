import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../services/api';
import { toast } from 'react-toastify';
import { FiPlus, FiTruck, FiChevronRight, FiArrowLeft, FiEdit2, FiUserMinus, FiUploadCloud, FiRotateCcw } from 'react-icons/fi';
import { mascararTelefoneDigitando, mascararTelefoneCompleto } from '../utils/telefone';
import './FamiliasProdutos.css';
import './ModalGrupoForm.css';
import './Loading.css';
import FornecedorModal from './compras/FornecedorModal';
import useAtalhoF2 from './compras/useAtalhoF2';

function getFotoUrlFornecedor(foto) {
  if (!foto) return null;
  if (typeof foto === 'string' && foto.startsWith('data:')) return foto;
  const base = api.defaults.baseURL || '/api';
  return base.replace(/\/api\/?$/, '') + '/api/uploads/fornecedores/' + foto;
}

async function uploadFotoFornecedor(id, file) {
  const baseURL = (api.defaults.baseURL || '/api').replace(/\/$/, '');
  const url = `${baseURL}/compras/fornecedores/${id}/foto`;
  const formData = new FormData();
  formData.append('foto', file);
  const token = localStorage.getItem('token') || sessionStorage.getItem('token');
  const headers = { Accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(url, { method: 'POST', headers, body: formData });
  if (res.ok) return res.json();
  if (res.status === 400) {
    const reader = new FileReader();
    const base64 = await new Promise((resolve, reject) => {
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('Falha ao ler arquivo'));
      reader.readAsDataURL(file);
    });
    const { data } = await api.post(`/compras/fornecedores/${id}/foto-base64`, { foto_base64: base64 });
    return data;
  }
  const errData = await res.json().catch(() => ({}));
  throw new Error(errData.error || res.statusText);
}

const FornecedoresDoGrupo = () => {
  const { grupoId } = useParams();
  const navigate = useNavigate();
  const [grupo, setGrupo] = useState(null);
  const [fornecedores, setFornecedores] = useState([]);
  const [todosFornecedores, setTodosFornecedores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModalAdd, setShowModalAdd] = useState(false);
  const [showModalNovo, setShowModalNovo] = useState(false);
  const [editingFornecedor, setEditingFornecedor] = useState(null);
  const [editRazao, setEditRazao] = useState('');
  const [editFantasia, setEditFantasia] = useState('');
  const [editCnpj, setEditCnpj] = useState('');
  const [editContato, setEditContato] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editTelefone, setEditTelefone] = useState('');
  const [editEndereco, setEditEndereco] = useState('');
  const [editFotoFile, setEditFotoFile] = useState(null);
  const [editPreviewUrl, setEditPreviewUrl] = useState(null);
  const [selectedFornecedorId, setSelectedFornecedorId] = useState('');
  const [saving, setSaving] = useState(false);
  // Etapa 103 (RN-103.07): 'ativo' | 'desativado' | 'inexistente' | 'desconhecido' (erro que nao e 404 —
  // a tela fica como antes e o servidor decide, RN-103.08).
  const [estadoGrupo, setEstadoGrupo] = useState('ativo');
  const [reativando, setReativando] = useState(false);

  const loadData = () => {
    if (!grupoId) return;
    Promise.all([
      // Etapa 103: com `incluir_inativos` o grupo desativado vem (com ativo 0) em vez de 404 — a tela
      // diz que ele esta desativado e nao oferece vincular. Antes o 404 virava o titulo "Grupo" e os
      // botoes vinculavam fornecedor ao grupo desativado.
      api.get(`/compras/grupos/${grupoId}`, { params: { incluir_inativos: 1 } })
        .catch((err) => ({ erro: err.response?.status === 404 ? 'inexistente' : 'desconhecido' })),
      api.get(`/compras/grupos/${grupoId}/fornecedores`).catch(() => []),
      api.get('/compras/fornecedores').catch(() => [])
    ]).then(([grupoRes, fornRes, todosRes]) => {
      if (grupoRes && grupoRes.data) {
        setEstadoGrupo(Number(grupoRes.data.ativo) === 1 ? 'ativo' : 'desativado');
      } else {
        setEstadoGrupo(grupoRes && grupoRes.erro ? grupoRes.erro : 'desconhecido');
      }
      setGrupo(grupoRes && grupoRes.data ? grupoRes.data : { id: grupoId, nome: 'Grupo' });
      setFornecedores(fornRes.data || []);
      setTodosFornecedores(todosRes.data || []);
    }).catch(() => {
      setEstadoGrupo('desconhecido');
      setGrupo({ id: grupoId, nome: 'Grupo' });
      setFornecedores([]);
      setTodosFornecedores([]);
    }).finally(() => setLoading(false));
  };

  useEffect(() => {
    if (!grupoId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    loadData();
  }, [grupoId]);

  useEffect(() => {
    if (editingFornecedor) {
      setEditRazao(editingFornecedor.razao_social || '');
      setEditFantasia(editingFornecedor.nome_fantasia || '');
      setEditCnpj(editingFornecedor.cnpj || '');
      setEditContato(editingFornecedor.contato || '');
      setEditEmail(editingFornecedor.email || '');
      // Fornecedor cadastrado antes da máscara abre já formatado. mascararTelefoneCompleto
      // devolve o original quando não reconhece a quantidade de dígitos, então telefone com
      // ramal ou número estrangeiro continua intacto ao abrir a edição.
      setEditTelefone(mascararTelefoneCompleto(editingFornecedor.telefone));
      setEditEndereco(editingFornecedor.endereco || '');
      setEditFotoFile(null);
      setEditPreviewUrl(editingFornecedor.foto ? getFotoUrlFornecedor(editingFornecedor.foto) : null);
    }
  }, [editingFornecedor]);

  const handleEditFotoChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!/^image\/(jpeg|jpg|png|gif|webp)$/i.test(file.type)) {
      toast.warning('Envie apenas imagens (JPEG, PNG, GIF, WEBP).');
      return;
    }
    setEditFotoFile(file);
    setEditPreviewUrl(URL.createObjectURL(file));
  };

  const handleSaveEdit = async (e) => {
    e.preventDefault();
    if (!editingFornecedor || !editingFornecedor.id) return;
    const razao = (editRazao || '').trim();
    if (!razao) {
      toast.warning('Razão social é obrigatória');
      return;
    }
    setSaving(true);
    try {
      await api.put(`/compras/fornecedores/${editingFornecedor.id}`, {
        razao_social: razao,
        nome_fantasia: (editFantasia || '').trim(),
        cnpj: (editCnpj || '').trim(),
        contato: (editContato || '').trim(),
        email: (editEmail || '').trim(),
        telefone: (editTelefone || '').trim(),
        endereco: (editEndereco || '').trim(),
        grupo_id: grupoId
      });
      if (editFotoFile) {
        await uploadFotoFornecedor(editingFornecedor.id, editFotoFile);
      }
      toast.success('Fornecedor atualizado');
      setEditingFornecedor(null);
      loadData();
    } catch (err) {
      toast.error(err.response?.data?.error || err.message || 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  };

  // Etapa 40 (F3): inativo nao entra em grupo enquanto inativo — antes ele era "vinculado" com
  // sucesso e nao aparecia na lista (a rota do grupo so devolvia ativos). Quem ja esta no grupo,
  // ativo ou nao, tambem fica de fora: o inativo do proprio grupo aparece na lista com selo.
  const fornecedoresDisponiveis = todosFornecedores.filter(
    (f) => (!f.grupo_id || String(f.grupo_id) !== String(grupoId)) && f.status !== 'inativo'
  );

  const handleVincular = async () => {
    if (!selectedFornecedorId) {
      toast.warning('Selecione um fornecedor');
      return;
    }
    setSaving(true);
    try {
      const f = todosFornecedores.find((x) => String(x.id) === String(selectedFornecedorId));
      if (!f) return;
      await api.put(`/compras/fornecedores/${f.id}`, {
        razao_social: f.razao_social,
        nome_fantasia: f.nome_fantasia || '',
        cnpj: f.cnpj || '',
        contato: f.contato || '',
        email: f.email || '',
        telefone: f.telefone || '',
        endereco: f.endereco || '',
        grupo_id: grupoId
      });
      toast.success('Fornecedor adicionado ao grupo');
      setShowModalAdd(false);
      setSelectedFornecedorId('');
      loadData();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao vincular');
    } finally {
      setSaving(false);
    }
  };

  const handleRemoverDoGrupo = async (fornecedor) => {
    if (!window.confirm(`Remover "${fornecedor.razao_social}" deste grupo? O fornecedor continua cadastrado.`)) return;
    try {
      await api.put(`/compras/fornecedores/${fornecedor.id}`, {
        razao_social: fornecedor.razao_social,
        nome_fantasia: fornecedor.nome_fantasia || '',
        cnpj: fornecedor.cnpj || '',
        contato: fornecedor.contato || '',
        email: fornecedor.email || '',
        telefone: fornecedor.telefone || '',
        endereco: fornecedor.endereco || '',
        grupo_id: null
      });
      toast.success('Fornecedor removido do grupo');
      loadData();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao remover');
    }
  };

  // Etapa 173 (RN-173.08): "Novo fornecedor" abre a ficha COMPLETA (a da Etapa 34) com o grupo
  // travado. Antes era um modal com razão social, fantasia e CNPJ — o cliente tinha de salvar e
  // abrir o fornecedor de novo para completar o cadastro.
  const aoSalvarNovo = () => {
    toast.success('Fornecedor cadastrado e vinculado ao grupo');
    setShowModalNovo(false);
    loadData();
  };

  const handleReativarGrupo = async () => {
    setReativando(true);
    try {
      await api.post(`/compras/grupos/${grupoId}/reativar`);
      toast.success('Grupo reativado');
      loadData();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao reativar grupo');
    } finally {
      setReativando(false);
    }
  };

  // Vincular e cadastrar no grupo so quando ele pode receber fornecedor (ou quando nao se sabe — erro
  // de rede: o servidor decide). Editar e "Remover do grupo" continuam nos dois casos.
  const podeVincular = estadoGrupo === 'ativo' || estadoGrupo === 'desconhecido';
  // RN-173.08: o F2 faz o mesmo que o botão — só quando o botão existe e nenhuma janela está aberta.
  useAtalhoF2(!loading && podeVincular && !showModalNovo && !showModalAdd && !editingFornecedor,
    () => setShowModalNovo(true));
  const tituloGrupo = estadoGrupo === 'inexistente' ? 'Grupo não encontrado' : (grupo ? grupo.nome : 'Grupo');

  if (loading) {
    return (
      <div className="loading">
        <div className="loading-spinner"></div>
        <p>Carregando fornecedores...</p>
      </div>
    );
  }

  return (
    <div className="familias-produtos">
      <div className="page-header familias-header">
        <div>
          <button
            type="button"
            onClick={() => navigate('/compras/fornecedores-homologados')}
            className="btn-voltar-grupos"
          >
            <FiArrowLeft /> Voltar para grupos
          </button>
          <h1>Fornecedores – {tituloGrupo}</h1>
          <p>Fornecedores homologados neste grupo. Clique em um fornecedor para ver itens e preços.</p>
          {estadoGrupo === 'desativado' && (
            <div role="status" data-testid="aviso-grupo-desativado" style={{ marginTop: 8, padding: '10px 14px', borderRadius: 8, background: '#fdecea', color: '#a93226', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <span>Este grupo está desativado — reative-o para vincular fornecedores.</span>
              <button type="button" className="btn-primary" onClick={handleReativarGrupo} disabled={reativando}>
                <FiRotateCcw /> {reativando ? 'Reativando...' : 'Reativar grupo'}
              </button>
            </div>
          )}
          {estadoGrupo === 'inexistente' && (
            <div role="status" data-testid="aviso-grupo-inexistente" style={{ marginTop: 8, padding: '10px 14px', borderRadius: 8, background: '#fdecea', color: '#a93226' }}>
              Grupo não encontrado.
            </div>
          )}
        </div>
        {podeVincular && (
        <div className="header-actions">
          <button
            type="button"
            className="btn-premium"
            onClick={() => setShowModalAdd(true)}
          >
            <div className="btn-premium-icon"><FiPlus size={20} /></div>
            <span className="btn-premium-text">Vincular fornecedor</span>
            <div className="btn-premium-shine"></div>
          </button>
          <button
            type="button"
            className="btn-premium"
            onClick={() => setShowModalNovo(true)}
            style={{ marginLeft: 8 }}
          >
            <div className="btn-premium-icon"><FiTruck size={20} /></div>
            <span className="btn-premium-text" title="Atalho: F2">Novo fornecedor (F2)</span>
            <div className="btn-premium-shine"></div>
          </button>
        </div>
        )}
      </div>

      {/* Modal: Vincular fornecedor existente */}
      {showModalAdd && podeVincular && (
        <div className="modal-grupo-overlay" onClick={() => setShowModalAdd(false)}>
          <div className="modal-grupo-container" onClick={(e) => e.stopPropagation()}>
            <div className="modal-grupo-header">
              <h2>Vincular fornecedor ao grupo</h2>
              <button type="button" className="modal-grupo-close" onClick={() => setShowModalAdd(false)} aria-label="Fechar">×</button>
            </div>
            <div className="modal-grupo-form" style={{ padding: 24 }}>
              <div className="modal-grupo-field">
                <label>Fornecedor</label>
                <select
                  value={selectedFornecedorId}
                  onChange={(e) => setSelectedFornecedorId(e.target.value)}
                  style={{ width: '100%', padding: 12 }}
                >
                  <option value="">Selecione...</option>
                  {fornecedoresDisponiveis.map((f) => (
                    <option key={f.id} value={f.id}>{f.razao_social} {f.nome_fantasia ? `(${f.nome_fantasia})` : ''}</option>
                  ))}
                </select>
              </div>
              {fornecedoresDisponiveis.length === 0 && (
                <p style={{ color: '#64748b', fontSize: 14 }}>Todos os fornecedores ativos já estão em um grupo (inativos não podem ser vinculados) — ou cadastre um novo.</p>
              )}
              <div className="modal-grupo-actions-right" style={{ marginTop: 16 }}>
                <button type="button" className="btn-cancel" onClick={() => setShowModalAdd(false)}>Cancelar</button>
                <button type="button" className="btn-save" onClick={handleVincular} disabled={saving || !selectedFornecedorId}>
                  {saving ? 'Salvando...' : 'Vincular'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Novo fornecedor — a ficha completa (Etapa 173, RN-173.08) */}
      <FornecedorModal
        aberto={showModalNovo && podeVincular}
        grupoIdInicial={grupoId}
        grupoTravado
        onSalvo={aoSalvarNovo}
        onFechar={() => setShowModalNovo(false)}
      />

      {/* Modal: Editar fornecedor */}
      {editingFornecedor && (
        <div className="modal-grupo-overlay" onClick={() => { if (editFotoFile && editPreviewUrl) URL.revokeObjectURL(editPreviewUrl); setEditingFornecedor(null); }}>
          <div className="modal-grupo-container" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 480 }}>
            <div className="modal-grupo-header">
              <h2>Editar fornecedor</h2>
              <button type="button" className="modal-grupo-close" onClick={() => { if (editFotoFile && editPreviewUrl) URL.revokeObjectURL(editPreviewUrl); setEditingFornecedor(null); }} aria-label="Fechar">×</button>
            </div>
            <form onSubmit={handleSaveEdit} className="modal-grupo-form">
              <div className="modal-grupo-field">
                <label>Razão social *</label>
                <input type="text" value={editRazao} onChange={(e) => setEditRazao(e.target.value)} placeholder="Razão social" required />
              </div>
              <div className="modal-grupo-field">
                <label>Nome fantasia</label>
                <input type="text" value={editFantasia} onChange={(e) => setEditFantasia(e.target.value)} placeholder="Nome fantasia" />
              </div>
              <div className="modal-grupo-field">
                <label>CNPJ</label>
                <input type="text" value={editCnpj} onChange={(e) => setEditCnpj(e.target.value)} placeholder="CNPJ" />
              </div>
              <div className="modal-grupo-field">
                <label>Contato</label>
                <input type="text" value={editContato} onChange={(e) => setEditContato(e.target.value)} placeholder="Nome do contato" />
              </div>
              <div className="modal-grupo-field">
                <label>E-mail</label>
                <input type="email" value={editEmail} onChange={(e) => setEditEmail(e.target.value)} placeholder="E-mail" />
              </div>
              <div className="modal-grupo-field">
                <label>Telefone</label>
                <input type="text" value={editTelefone} onChange={(e) => setEditTelefone(mascararTelefoneDigitando(e.target.value))} placeholder="(00) 00000-0000" inputMode="tel" maxLength={15} />
              </div>
              <div className="modal-grupo-field">
                <label>Endereço</label>
                <input type="text" value={editEndereco} onChange={(e) => setEditEndereco(e.target.value)} placeholder="Endereço" />
              </div>
              <div className="modal-grupo-field">
                <label>Foto (opcional)</label>
                <div className="modal-grupo-foto-row">
                  <div className="modal-grupo-preview">
                    {editPreviewUrl ? (
                      <img src={editPreviewUrl} alt="Preview" />
                    ) : (
                      <span className="modal-grupo-preview-placeholder">Sem imagem</span>
                    )}
                  </div>
                  <label className="btn-upload-label">
                    <FiUploadCloud size={18} />
                    {editFotoFile ? 'Trocar imagem' : 'Enviar imagem'}
                    <input
                      type="file"
                      accept="image/jpeg,image/jpg,image/png,image/gif,image/webp"
                      onChange={handleEditFotoChange}
                      className="sr-only"
                    />
                  </label>
                </div>
              </div>
              <div className="modal-grupo-actions-right" style={{ marginTop: 16 }}>
                <button type="button" className="btn-cancel" onClick={() => { if (editFotoFile && editPreviewUrl) URL.revokeObjectURL(editPreviewUrl); setEditingFornecedor(null); }}>Cancelar</button>
                <button type="submit" className="btn-save" disabled={saving}>{saving ? 'Salvando...' : 'Salvar'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="familias-grid">
        {fornecedores.length === 0 ? (
          <div className="familias-empty">
            <FiTruck size={48} />
            <p>Nenhum fornecedor neste grupo.</p>
            {podeVincular && (
              <>
                <p className="hint">Vincule um fornecedor existente ou cadastre um novo.</p>
                <button type="button" onClick={() => setShowModalAdd(true)} className="btn-primary">
                  <FiPlus /> Vincular fornecedor
                </button>
              </>
            )}
          </div>
        ) : (
          fornecedores.map((f, index) => {
            const themeIndex = index % 3;
            return (
              <div
                key={f.id}
                className={`familia-card familia-card-only familia-card-clickable familia-card-theme-${themeIndex}`}
                onClick={() => navigate(`/compras/fornecedores-homologados/fornecedor/${f.id}`)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    navigate(`/compras/fornecedores-homologados/fornecedor/${f.id}`);
                  }
                }}
              >
                <div className="familia-card-header">
                  <div className="familia-card-foto-wrap">
                    {f.foto ? (
                      <img
                        src={getFotoUrlFornecedor(f.foto)}
                        alt=""
                        className="familia-card-foto-img"
                      />
                    ) : (
                      <div className="familia-card-placeholder">
                        <FiTruck size={48} />
                      </div>
                    )}
                  </div>
                  <div className="familia-card-actions" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      className="btn-icon-card"
                      title="Editar fornecedor"
                      onClick={() => setEditingFornecedor(f)}
                    >
                      <FiEdit2 />
                    </button>
                    <button
                      type="button"
                      className="btn-icon-card btn-danger"
                      title="Remover do grupo"
                      onClick={() => handleRemoverDoGrupo(f)}
                    >
                      <FiUserMinus />
                    </button>
                  </div>
                </div>
                <div className="familia-card-body">
                  <div className="familia-card-nome">{f.razao_social}</div>
                  {f.status === 'inativo' && (
                    // Etapa 40 (F3): a rota do grupo passou a devolver inativos (antes eles sumiam
                    // daqui). Padrao de Compras.js:323-327 (`status-badge` + cor de inativo); o
                    // estilo base vai inline porque `.status-badge` mora em Compras.css, chunk lazy.
                    <span
                      className="status-badge"
                      data-testid="fornecedor-inativo"
                      title="Fornecedor inativo — reative em Compras › Fornecedores"
                      style={{ display: 'inline-block', padding: '0.375rem 0.75rem', borderRadius: 12, fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', backgroundColor: '#e74c3c20', color: '#e74c3c', marginBottom: 8 }}
                    >
                      Inativo
                    </span>
                  )}
                  {f.nome_fantasia && <div style={{ fontSize: 12, color: '#64748b' }}>{f.nome_fantasia}</div>}
                  <span className="familia-card-cta-label">
                    Ver itens e preços <FiChevronRight className="familia-card-chevron" size={16} />
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

export default FornecedoresDoGrupo;
