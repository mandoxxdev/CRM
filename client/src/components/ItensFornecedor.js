import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';
import api from '../services/api';
import { toast } from 'react-toastify';
import { FiArrowLeft, FiPlus, FiTrash2, FiUpload, FiEdit2 } from 'react-icons/fi';
import './Compras.css';
import './Loading.css';

const formatCurrency = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

// Normaliza texto para comparação (minúsculo, sem acentos)
function normalizar(s) {
  if (s == null) return '';
  return String(s).toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').trim();
}

// Listas de possíveis nomes de coluna (normalizados)
const COLS_DESCRICAO = ['descricao', 'descrição', 'descricao do produto', 'produto', 'item', 'nome', 'designacao', 'designação', 'material', 'especificacao', 'denominacao', 'nome do produto', 'desc'];
const COLS_CODIGO = ['codigo', 'código', 'cod', 'sku', 'referencia', 'referência', 'ref', 'codigo do produto', 'código do produto'];
const COLS_UNIDADE = ['unidade', 'und', 'um', 'un', 'unid', 'unidade de medida', 'medida'];
const COLS_PRECO = ['preco', 'preço', 'valor', 'valor unitario', 'valor unitário', 'price', 'vlr', 'preco unitario', 'preço unitário', 'valor unit', 'preco unit'];

function colunaMatch(norm, listas) {
  for (const list of listas) {
    for (const k of list) {
      if (norm.includes(k) || k.includes(norm)) return true;
    }
  }
  return false;
}

function acharIndicesCabecalho(headers) {
  const normHeaders = headers.map((h, idx) => ({ norm: normalizar(h), original: h, idx }));
  let descIdx = -1, codIdx = -1, undIdx = -1, precoIdx = -1;
  for (const { norm, idx } of normHeaders) {
    if (!norm) continue;
    if (descIdx < 0 && colunaMatch(norm, [COLS_DESCRICAO])) descIdx = idx;
    if (codIdx < 0 && colunaMatch(norm, [COLS_CODIGO])) codIdx = idx;
    if (undIdx < 0 && colunaMatch(norm, [COLS_UNIDADE])) undIdx = idx;
    if (precoIdx < 0 && colunaMatch(norm, [COLS_PRECO])) precoIdx = idx;
  }
  return { descIdx, codIdx, undIdx, precoIdx };
}

function parsePreco(val) {
  if (val == null || val === '') return 0;
  if (typeof val === 'number' && !isNaN(val)) return val;
  const s = String(val).trim().replace(/\s/g, '').replace(/\./g, '').replace(',', '.');
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

function extrairLinhas(rows, indices) {
  const { descIdx, codIdx, undIdx, precoIdx } = indices;
  const linhas = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i] || [];
    let descricao = '';
    if (descIdx >= 0 && row[descIdx] != null) descricao = String(row[descIdx]).trim();
    if (!descricao) {
      for (let c = 0; c < row.length; c++) {
        const v = row[c];
        if (v != null && String(v).trim() !== '' && isNaN(parsePreco(v))) {
          descricao = String(v).trim();
          break;
        }
      }
    }
    if (!descricao && row.length > 0 && row[0] != null) descricao = String(row[0]).trim();
    if (!descricao) continue;
    const codigo = codIdx >= 0 && row[codIdx] != null ? String(row[codIdx]).trim() : '';
    const unidade = undIdx >= 0 && row[undIdx] != null ? String(row[undIdx]).trim() : 'UN';
    let preco = 0;
    if (precoIdx >= 0 && row[precoIdx] != null) preco = parsePreco(row[precoIdx]);
    else {
      for (let c = 0; c < row.length; c++) {
        const v = row[c];
        if (v != null && String(v).trim() !== '' && (typeof v === 'number' || !isNaN(parsePreco(v)))) {
          preco = parsePreco(v);
          break;
        }
      }
    }
    linhas.push({ codigo: codigo || undefined, descricao, unidade: unidade || 'UN', preco });
  }
  return linhas;
}

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
  const [importing, setImporting] = useState(false);

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

  const handleFileImport = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = new Uint8Array(ev.target.result);
        const wb = XLSX.read(data, { type: 'array', raw: false });
        const firstSheet = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(firstSheet, { header: 1, defval: '' });
        if (!rows.length) {
          toast.warning('Planilha vazia');
          setImporting(false);
          return;
        }
        let headerRowIndex = 0;
        const firstRow = rows[0] || [];
        const nonEmptyFirst = firstRow.filter((c) => c != null && String(c).trim() !== '').length;
        if (nonEmptyFirst < 2 && rows.length > 1) {
          headerRowIndex = 1;
        }
        const headers = (rows[headerRowIndex] || []).map((h) => String(h ?? '').trim());
        const dataStartIndex = headerRowIndex + 1;
        const dataRows = rows.slice(dataStartIndex);
        const indices = acharIndicesCabecalho(headers);
        const linhas = extrairLinhas([headers, ...dataRows], indices);
        if (linhas.length === 0) {
          toast.warning('Nenhuma linha válida encontrada. A planilha deve ter ao menos uma coluna com descrição do item (ou nome do produto).');
          setImporting(false);
          return;
        }
        api.post(`/compras/fornecedores/${fornecedorId}/itens/importar`, { linhas })
          .then(() => {
            toast.success(`${linhas.length} item(ns) importado(s)`);
            loadItens();
          })
          .catch((err) => toast.error(err.response?.data?.error || 'Erro na importação'))
          .finally(() => setImporting(false));
      } catch (err) {
        toast.error('Erro ao ler planilha. Verifique se o arquivo é Excel (.xlsx, .xls) ou CSV.');
        setImporting(false);
      }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = '';
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
          <p>Lista de itens padrão e preços. Importe qualquer planilha (Excel/CSV): o sistema detecta automaticamente colunas de descrição, código, unidade e preço.</p>
        </div>
        <div className="header-actions">
          <label className="btn-premium" style={{ cursor: 'pointer', marginRight: 8 }}>
            <FiUpload size={18} style={{ marginRight: 6 }} />
            {importing ? 'Importando...' : 'Importar planilha'}
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleFileImport}
              disabled={importing}
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
            <p style={{ fontSize: 14 }}>Adicione itens manualmente ou importe uma planilha (colunas: descrição, codigo, unidade, preco).</p>
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
