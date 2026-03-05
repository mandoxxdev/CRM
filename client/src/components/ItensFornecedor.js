import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';
import api from '../services/api';
import { toast } from 'react-toastify';
import { FiArrowLeft, FiPlus, FiTrash2, FiUpload, FiEdit2, FiEye, FiSearch } from 'react-icons/fi';
import './Compras.css';
import './Loading.css';

const formatCurrency = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

// Normaliza célula: usa texto formatado (.w) do Excel quando existir, senão valor primitivo
function normalizarCelula(cell) {
  if (cell == null || cell === '') return '';
  if (typeof cell === 'object' && cell !== null) {
    if ('w' in cell && cell.w != null && String(cell.w).trim() !== '') return String(cell.w).trim();
    if ('v' in cell) return cell.v;
  }
  if (typeof cell === 'number' && !isNaN(cell)) return cell;
  if (typeof cell === 'boolean') return cell ? 'Sim' : 'Não';
  if (cell instanceof Date) return cell.toLocaleDateString('pt-BR');
  return String(cell).trim();
}

// Para exibição: sempre texto limpo (remove caracteres não imprimíveis)
function exibirCelula(cell) {
  const v = normalizarCelula(cell);
  if (v === '' || v == null) return '—';
  let s = String(v)
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .replace(/\uFFFD/g, '')
    .trim();
  if (!s) return '—';
  return s;
}

// Extrai linhas da planilha usando o texto exibido (como no Excel) quando disponível
function sheetToRowsComoTela(sheet) {
  if (!sheet || !sheet['!ref']) return [];
  const range = XLSX.utils.decode_range(sheet['!ref']);
  const rows = [];
  for (let R = range.s.r; R <= range.e.r; R++) {
    const row = [];
    for (let C = range.s.c; C <= range.e.c; C++) {
      const addr = XLSX.utils.encode_cell({ r: R, c: C });
      const cell = sheet[addr];
      let val = '';
      if (cell) {
        if (cell.w != null && String(cell.w).trim() !== '') val = String(cell.w).trim();
        else if (cell.v !== undefined) val = cell.v;
      }
      row.push(val === '' ? '' : val);
    }
    rows.push(row);
  }
  return rows;
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
  const [planilhaSalva, setPlanilhaSalva] = useState(null);
  const [showModalPlanilha, setShowModalPlanilha] = useState(false);
  const [filtroPlanilha, setFiltroPlanilha] = useState('');
  const [salvandoPlanilha, setSalvandoPlanilha] = useState(false);

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

  const normalizarLinhasParaExibicao = (linhas) => {
    if (!Array.isArray(linhas)) return [];
    return linhas.map((row) => (Array.isArray(row) ? row.map(normalizarCelula) : []));
  };

  const loadPlanilha = () => {
    if (!fornecedorId) return;
    api.get(`/compras/fornecedores/${fornecedorId}/planilha`)
      .then((res) => {
        const d = res.data;
        if (d && Array.isArray(d.linhas) && d.linhas.length > 0) {
          setPlanilhaSalva({
            nome: d.nome || 'Planilha',
            linhas: normalizarLinhasParaExibicao(d.linhas),
            atualizado_em: d.atualizado_em
          });
        } else {
          setPlanilhaSalva(null);
        }
      })
      .catch(() => setPlanilhaSalva(null));
  };

  useEffect(() => {
    if (!fornecedorId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    loadFornecedor();
    Promise.all([
      api.get(`/compras/fornecedores/${fornecedorId}/itens`).then((r) => setItens(r.data || [])).catch(() => setItens([])),
      api.get(`/compras/fornecedores/${fornecedorId}/planilha`).then((r) => {
        const d = r.data;
        if (d && Array.isArray(d.linhas) && d.linhas.length > 0) {
          const linhasNorm = d.linhas.map((row) => (Array.isArray(row) ? row.map(normalizarCelula) : []));
          setPlanilhaSalva({ nome: d.nome || 'Planilha', linhas: linhasNorm, atualizado_em: d.atualizado_em });
        } else {
          setPlanilhaSalva(null);
        }
      }).catch(() => setPlanilhaSalva(null))
    ]).finally(() => setLoading(false));
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

  const handleSalvarPlanilha = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSalvandoPlanilha(true);
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = new Uint8Array(ev.target.result);
        const wb = XLSX.read(data, { type: 'array', raw: false, cellNF: true });
        const firstSheet = wb.Sheets[wb.SheetNames[0]];
        const rawRows = sheetToRowsComoTela(firstSheet);
        const rows = rawRows.map((row) => (Array.isArray(row) ? row.map((c) => (c === '' || c == null ? '' : c)) : []));
        if (!rows.length) {
          toast.warning('Planilha vazia');
          setSalvandoPlanilha(false);
          e.target.value = '';
          return;
        }
        api.post(`/compras/fornecedores/${fornecedorId}/planilha`, { nome: file.name, linhas: rows })
          .then(() => {
            setPlanilhaSalva({ nome: file.name, linhas: rows, atualizado_em: new Date().toISOString() });
            toast.success('Planilha salva. Use "Visualizar planilha" para ver no software.');
          })
          .catch((err) => toast.error(err.response?.data?.error || 'Erro ao salvar planilha'))
          .finally(() => { setSalvandoPlanilha(false); e.target.value = ''; });
      } catch (err) {
        toast.error('Erro ao ler arquivo. Use Excel (.xlsx, .xls) ou CSV.');
        setSalvandoPlanilha(false);
        e.target.value = '';
      }
    };
    reader.readAsArrayBuffer(file);
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
          <p>Lista de itens cadastrados. Salve a planilha do fornecedor e visualize quando quiser, direto no software.</p>
        </div>
        <div className="header-actions">
          <label className="btn-premium" style={{ cursor: salvandoPlanilha ? 'wait' : 'pointer', marginRight: 8 }}>
            <FiUpload size={18} style={{ marginRight: 6 }} />
            {salvandoPlanilha ? 'Salvando...' : 'Salvar planilha'}
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleSalvarPlanilha}
              disabled={salvandoPlanilha}
              style={{ display: 'none' }}
            />
          </label>
          <button
            type="button"
            className="btn-premium"
            style={{ opacity: planilhaSalva ? 1 : 0.6, cursor: planilhaSalva ? 'pointer' : 'not-allowed' }}
            onClick={() => planilhaSalva && setShowModalPlanilha(true)}
            title={planilhaSalva ? 'Abrir planilha salva' : 'Salve uma planilha antes para visualizar'}
          >
            <FiEye size={18} style={{ marginRight: 6 }} />
            Visualizar planilha
          </button>
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

      {/* Modal visualização da planilha salva */}
      {showModalPlanilha && planilhaSalva && (
        <div className="modal-grupo-overlay" onClick={() => { setShowModalPlanilha(false); setFiltroPlanilha(''); }}>
          <div className="modal-grupo-container modal-planilha-container" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '95vw', width: 960 }}>
            <div className="modal-grupo-header" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
              <div>
                <h2 style={{ margin: 0 }}>Planilha – {planilhaSalva.nome}</h2>
                {planilhaSalva.atualizado_em && (
                  <p style={{ margin: '4px 0 0', fontSize: 13, color: '#64748b' }}>
                    Salva em {new Date(planilhaSalva.atualizado_em).toLocaleString('pt-BR')}
                  </p>
                )}
              </div>
              <button type="button" className="modal-grupo-close" onClick={() => { setShowModalPlanilha(false); setFiltroPlanilha(''); }} aria-label="Fechar">×</button>
            </div>
            {planilhaSalva.linhas && planilhaSalva.linhas.length > 0 && (
              <div style={{ padding: '0 24px 12px', borderBottom: '1px solid #e2e8f0' }}>
                <div className="planilha-busca">
                  <FiSearch size={18} style={{ color: '#64748b', flexShrink: 0 }} />
                  <input
                    type="text"
                    placeholder="Buscar na planilha..."
                    value={filtroPlanilha}
                    onChange={(e) => setFiltroPlanilha(e.target.value)}
                  />
                </div>
              </div>
            )}
            <div className="modal-planilha-body" style={{ padding: 16, maxHeight: '70vh', overflow: 'auto' }}>
              {!planilhaSalva.linhas || planilhaSalva.linhas.length === 0 ? (
                <p style={{ color: '#64748b' }}>Planilha vazia.</p>
              ) : (() => {
                const rows = planilhaSalva.linhas;
                const headerRow = rows[0] || [];
                const numCols = Math.max(headerRow.length, ...rows.slice(1).map((r) => (r || []).length), 1);
                const termo = filtroPlanilha.trim().toLowerCase();
                const dataRows = rows.slice(1);
                const linhasFiltradas = termo
                  ? dataRows.filter((row) =>
                      Array.from({ length: numCols }, (_, c) => row[c]).some((cell) =>
                        exibirCelula(cell).toLowerCase().includes(termo)
                      )
                    )
                  : dataRows;
                return (
                  <>
                    {termo && (
                      <p style={{ fontSize: 13, color: '#64748b', marginBottom: 12 }}>
                        {linhasFiltradas.length} de {dataRows.length} linha(s)
                      </p>
                    )}
                    <table className="data-table" style={{ width: '100%', tableLayout: 'auto' }}>
                      <thead>
                        <tr>
                          {Array.from({ length: numCols }, (_, c) => (
                            <th key={c} style={{ whiteSpace: 'nowrap', padding: '8px 12px', textAlign: 'left', borderBottom: '2px solid #e2e8f0' }}>
                              {c < headerRow.length ? exibirCelula(headerRow[c]) : `Col ${c + 1}`}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {linhasFiltradas.map((row, r) => (
                          <tr key={r}>
                            {Array.from({ length: numCols }, (_, c) => (
                              <td key={c} style={{ padding: '8px 12px', borderBottom: '1px solid #e2e8f0', verticalAlign: 'top' }}>
                                {exibirCelula(row[c])}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {linhasFiltradas.length === 0 && termo && (
                      <p style={{ color: '#64748b', marginTop: 16 }}>Nenhuma linha encontrada para &quot;{filtroPlanilha.trim()}&quot;</p>
                    )}
                  </>
                );
              })()}
            </div>
            <div style={{ padding: '12px 24px', borderTop: '1px solid #e2e8f0', background: '#f8fafc' }}>
              <button type="button" className="btn-secondary" onClick={() => { setShowModalPlanilha(false); setFiltroPlanilha(''); }}>Fechar</button>
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
            <p style={{ fontSize: 14 }}>Adicione itens manualmente. Salve a planilha do fornecedor para visualizá-la aqui no software.</p>
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
