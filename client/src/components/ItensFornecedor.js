import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';
import api from '../services/api';
import { toast } from 'react-toastify';
import { FiArrowLeft, FiPlus, FiTrash2, FiUpload, FiEdit2 } from 'react-icons/fi';
import './Compras.css';
import './Loading.css';

const formatCurrency = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

const ItensFornecedor = () => {
  const { fornecedorId } = useParams();
  const navigate = useNavigate();
  const [fornecedor, setFornecedor] = useState(null);
  const [itens, setItens] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModalItem, setShowModalItem] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [formCodigo, setFormCodigo] = useState('');
  const [formDescricao, setFormDescricao] = useState('');
  const [formUnidade, setFormUnidade] = useState('UN');
  const [formPreco, setFormPreco] = useState('');
  const [formObservacoes, setFormObservacoes] = useState('');
  const [saving, setSaving] = useState(false);
  const [planilhaRows, setPlanilhaRows] = useState(null);
  const [planilhaNome, setPlanilhaNome] = useState('');
  const [carregandoPlanilha, setCarregandoPlanilha] = useState(false);

  const loadFornecedor = () => {
    api.get('/compras/fornecedores').then((res) => {
      const list = res.data || [];
      const f = list.find((x) => String(x.id) === String(fornecedorId));
      setFornecedor(f || { id: fornecedorId, razao_social: 'Fornecedor' });
    }).catch(() => setFornecedor({ id: fornecedorId, razao_social: 'Fornecedor' }));
  };

  const loadItens = () => {
    if (!fornecedorId) return;
    api.get(`/compras/fornecedores/${fornecedorId}/itens`)
      .then((res) => setItens(res.data || []))
      .catch(() => setItens([]));
  };

  useEffect(() => {
    if (!fornecedorId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    loadFornecedor();
    api.get(`/compras/fornecedores/${fornecedorId}/itens`)
      .then((res) => setItens(res.data || []))
      .catch(() => setItens([]))
      .finally(() => setLoading(false));
  }, [fornecedorId]);

  const resetForm = () => {
    setEditingItem(null);
    setFormCodigo('');
    setFormDescricao('');
    setFormUnidade('UN');
    setFormPreco('');
    setFormObservacoes('');
  };

  const openEdit = (item) => {
    setEditingItem(item);
    setFormCodigo(item.codigo || '');
    setFormDescricao(item.descricao || '');
    setFormUnidade(item.unidade || 'UN');
    setFormPreco(item.preco != null ? String(item.preco) : '');
    setFormObservacoes(item.observacoes || '');
    setShowModalItem(true);
  };

  const handleSaveItem = async (e) => {
    e.preventDefault();
    const descricao = (formDescricao || '').trim();
    if (!descricao) {
      toast.warning('Descrição é obrigatória');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        codigo: (formCodigo || '').trim() || undefined,
        descricao,
        unidade: (formUnidade || 'UN').trim(),
        preco: parseFloat(formPreco) || 0,
        observacoes: (formObservacoes || '').trim() || undefined
      };
      if (editingItem) {
        await api.put(`/compras/fornecedores/${fornecedorId}/itens/${editingItem.id}`, payload);
        toast.success('Item atualizado');
      } else {
        await api.post(`/compras/fornecedores/${fornecedorId}/itens`, payload);
        toast.success('Item adicionado');
      }
      setShowModalItem(false);
      resetForm();
      loadItens();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteItem = async (item) => {
    if (!window.confirm(`Excluir "${item.descricao}"?`)) return;
    try {
      await api.delete(`/compras/fornecedores/${fornecedorId}/itens/${item.id}`);
      toast.success('Item excluído');
      loadItens();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao excluir');
    }
  };

  const handleVisualizarPlanilha = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCarregandoPlanilha(true);
    setPlanilhaRows(null);
    setPlanilhaNome(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = new Uint8Array(ev.target.result);
        const wb = XLSX.read(data, { type: 'array', raw: false });
        const firstSheet = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(firstSheet, { header: 1, defval: '' });
        if (!rows.length) {
          toast.warning('Planilha vazia');
          setPlanilhaRows([]);
        } else {
          setPlanilhaRows(rows);
          toast.success('Planilha carregada. Visualize os dados abaixo.');
        }
      } catch (err) {
        toast.error('Erro ao ler arquivo. Use Excel (.xlsx, .xls) ou CSV.');
        setPlanilhaRows(null);
      }
      setCarregandoPlanilha(false);
      e.target.value = '';
    };
    reader.readAsArrayBuffer(file);
  };

  const fecharVisualizacaoPlanilha = () => {
    setPlanilhaRows(null);
    setPlanilhaNome('');
  };

  if (loading) {
    return (
      <div className="loading">
        <div className="loading-spinner"></div>
        <p>Carregando itens...</p>
      </div>
    );
  }

  return (
    <div className="compras">
      <div className="page-header">
        <div>
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="btn-secondary"
            style={{ marginBottom: 8 }}
          >
            <FiArrowLeft /> Voltar
          </button>
          <h1>Itens e preços – {fornecedor ? fornecedor.razao_social : 'Fornecedor'}</h1>
          <p>Lista de itens cadastrados. Use &quot;Visualizar planilha&quot; para abrir um arquivo do fornecedor e ver o conteúdo sem cadastrar.</p>
        </div>
        <div className="header-actions">
          <label className="btn-premium" style={{ cursor: 'pointer', marginRight: 8 }}>
            <FiUpload size={18} style={{ marginRight: 6 }} />
            {carregandoPlanilha ? 'Carregando...' : 'Visualizar planilha'}
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleVisualizarPlanilha}
              disabled={carregandoPlanilha}
              style={{ display: 'none' }}
            />
          </label>
          <button
            type="button"
            className="btn-premium"
            onClick={() => { resetForm(); setShowModalItem(true); }}
          >
            <FiPlus size={20} style={{ marginRight: 6 }} />
            Novo item
          </button>
        </div>
      </div>

      {/* Modal visualização da planilha */}
      {planilhaRows !== null && (
        <div className="modal-grupo-overlay" onClick={fecharVisualizacaoPlanilha}>
          <div className="modal-grupo-container modal-planilha-container" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '95vw', width: 960 }}>
            <div className="modal-grupo-header" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
              <div>
                <h2 style={{ margin: 0 }}>Visualização da planilha</h2>
                {planilhaNome && <p style={{ margin: '4px 0 0', fontSize: 13, color: '#64748b' }}>{planilhaNome}</p>}
              </div>
              <button type="button" className="modal-grupo-close" onClick={fecharVisualizacaoPlanilha} aria-label="Fechar">×</button>
            </div>
            <div className="modal-planilha-body" style={{ padding: 16, maxHeight: '70vh', overflow: 'auto' }}>
              {planilhaRows.length === 0 ? (
                <p style={{ color: '#64748b' }}>Planilha vazia.</p>
              ) : (() => {
                const headerRow = planilhaRows[0] || [];
                const numCols = Math.max(headerRow.length, ...planilhaRows.slice(1).map((r) => (r || []).length), 1);
                return (
                  <table className="data-table" style={{ width: '100%', tableLayout: 'auto' }}>
                    <thead>
                      <tr>
                        {Array.from({ length: numCols }, (_, c) => (
                          <th key={c} style={{ whiteSpace: 'nowrap', padding: '8px 12px', textAlign: 'left', borderBottom: '2px solid #e2e8f0' }}>
                            {headerRow[c] != null ? String(headerRow[c]) : `Col ${c + 1}`}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {planilhaRows.slice(1).map((row, r) => (
                        <tr key={r}>
                          {Array.from({ length: numCols }, (_, c) => (
                            <td key={c} style={{ padding: '8px 12px', borderBottom: '1px solid #e2e8f0', verticalAlign: 'top' }}>
                              {row[c] != null && row[c] !== '' ? String(row[c]) : '—'}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                );
              })()}
            </div>
            <div style={{ padding: '12px 24px', borderTop: '1px solid #e2e8f0', background: '#f8fafc' }}>
              <button type="button" className="btn-secondary" onClick={fecharVisualizacaoPlanilha}>Fechar</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal add/edit item */}
      {showModalItem && (
        <div className="modal-grupo-overlay" onClick={() => { setShowModalItem(false); resetForm(); }}>
          <div className="modal-grupo-container" onClick={(e) => e.stopPropagation()}>
            <div className="modal-grupo-header">
              <h2>{editingItem ? 'Editar item' : 'Novo item'}</h2>
              <button type="button" className="modal-grupo-close" onClick={() => { setShowModalItem(false); resetForm(); }}>×</button>
            </div>
            <form onSubmit={handleSaveItem} className="modal-grupo-form">
              <div className="modal-grupo-field">
                <label>Código</label>
                <input type="text" value={formCodigo} onChange={(e) => setFormCodigo(e.target.value)} placeholder="Código / SKU" />
              </div>
              <div className="modal-grupo-field">
                <label>Descrição *</label>
                <input type="text" value={formDescricao} onChange={(e) => setFormDescricao(e.target.value)} placeholder="Descrição do item" required />
              </div>
              <div className="modal-grupo-field">
                <label>Unidade</label>
                <input type="text" value={formUnidade} onChange={(e) => setFormUnidade(e.target.value)} placeholder="UN, KG, etc." />
              </div>
              <div className="modal-grupo-field">
                <label>Preço (R$)</label>
                <input type="number" step="0.01" min="0" value={formPreco} onChange={(e) => setFormPreco(e.target.value)} placeholder="0,00" />
              </div>
              <div className="modal-grupo-field">
                <label>Observações</label>
                <input type="text" value={formObservacoes} onChange={(e) => setFormObservacoes(e.target.value)} placeholder="Opcional" />
              </div>
              <div className="modal-grupo-actions-right" style={{ marginTop: 16 }}>
                <button type="button" className="btn-cancel" onClick={() => { setShowModalItem(false); resetForm(); }}>Cancelar</button>
                <button type="submit" className="btn-save" disabled={saving}>{saving ? 'Salvando...' : 'Salvar'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="table-container">
        {itens.length === 0 ? (
          <div className="no-data" style={{ padding: 48, textAlign: 'center', color: '#64748b' }}>
            <p>Nenhum item cadastrado.</p>
            <p style={{ fontSize: 14 }}>Adicione itens manualmente ou use &quot;Visualizar planilha&quot; para abrir um arquivo do fornecedor.</p>
            <button type="button" className="btn-primary" style={{ marginTop: 16 }} onClick={() => setShowModalItem(true)}>
              <FiPlus /> Novo item
            </button>
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Código</th>
                <th>Descrição</th>
                <th>Unidade</th>
                <th>Preço</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {itens.map((item) => (
                <tr key={item.id}>
                  <td>{item.codigo || '-'}</td>
                  <td><div className="cell-primary">{item.descricao}</div></td>
                  <td>{item.unidade || 'UN'}</td>
                  <td><strong>{formatCurrency(item.preco)}</strong></td>
                  <td>
                    <div className="action-buttons">
                      <button type="button" className="btn-icon" title="Editar" onClick={() => openEdit(item)}>
                        <FiEdit2 />
                      </button>
                      <button type="button" className="btn-icon btn-danger" title="Excluir" onClick={() => handleDeleteItem(item)}>
                        <FiTrash2 />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default ItensFornecedor;
