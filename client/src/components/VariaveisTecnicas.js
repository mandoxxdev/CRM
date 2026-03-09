import React, { useState, useEffect, useMemo } from 'react';
import api from '../services/api';
import { FiPlus, FiEdit2, FiTrash2, FiSearch, FiX } from 'react-icons/fi';
import './VariaveisTecnicas.css';

const TIPOS = [
  { value: 'texto', label: 'Texto' },
  { value: 'numero', label: 'Número' },
  { value: 'lista', label: 'Lista (opções fixas)' }
];

const FONTE_OPCOES = [
  { value: 'manual', label: 'Lista manual (opções abaixo)' },
  { value: 'fornecedores_grupo', label: 'Fornecedores homologados (grupo de compras)' }
];

const VariaveisTecnicas = () => {
  const [list, setList] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [gruposCompras, setGruposCompras] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterCategoria, setFilterCategoria] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ nome: '', chave: '', categoria: '', tipo: 'texto', opcoes: '', ordem: 0, sufixo: '', fonte_opcoes: 'manual', grupo_compras_id: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const loadList = async () => {
    try {
      setLoading(true);
      const [resList, resCat, resGrupos] = await Promise.all([
        api.get('/variaveis-tecnicas', { params: { ativo: 'true' } }),
        api.get('/variaveis-tecnicas/categorias').catch(() => ({ data: [] })),
        api.get('/compras/grupos').catch(() => ({ data: [] }))
      ]);
      setList(Array.isArray(resList.data) ? resList.data : []);
      setCategorias(Array.isArray(resCat.data) ? resCat.data : []);
      setGruposCompras(Array.isArray(resGrupos.data) ? resGrupos.data : []);
    } catch (e) {
      console.error(e);
      setList([]);
      setCategorias([]);
      setGruposCompras([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadList(); }, []);

  const filtered = useMemo(() => {
    let r = list;
    if (filterCategoria) r = r.filter(v => (v.categoria || '') === filterCategoria);
    if (search.trim()) {
      const t = search.trim().toLowerCase();
      r = r.filter(v => (v.nome || '').toLowerCase().includes(t) || (v.chave || '').toLowerCase().includes(t));
    }
    return r;
  }, [list, search, filterCategoria]);

  const openNew = () => {
    setEditing(null);
    setForm({ nome: '', chave: '', categoria: '', tipo: 'texto', opcoes: '', ordem: 0, sufixo: '', fonte_opcoes: 'manual', grupo_compras_id: '' });
    setError('');
    setModalOpen(true);
  };

  const openEdit = (v) => {
    setEditing(v);
    const opcoes = Array.isArray(v.opcoes) ? v.opcoes.join('\n') : (v.opcoes || '');
    setForm({
      nome: v.nome || '',
      chave: v.chave || '',
      categoria: v.categoria || '',
      tipo: v.tipo || 'texto',
      opcoes,
      ordem: v.ordem || 0,
      sufixo: v.sufixo || '',
      fonte_opcoes: v.fonte_opcoes === 'fornecedores_grupo' ? 'fornecedores_grupo' : 'manual',
      grupo_compras_id: v.grupo_compras_id != null ? String(v.grupo_compras_id) : ''
    });
    setError('');
    setModalOpen(true);
  };

  const handleSave = async () => {
    const nome = (form.nome || '').trim();
    if (!nome) {
      setError('Nome é obrigatório.');
      return;
    }
    const chave = (form.chave || '').trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '') || nome.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
    const categoria = (form.categoria || '').trim() || null;
    const tipo = form.tipo || 'texto';
    const opcoesStr = (form.opcoes || '').trim();
    const opcoes = opcoesStr ? opcoesStr.split(/\n/).map(s => s.trim()).filter(Boolean) : [];
    const ordem = Number(form.ordem) || 0;
    const sufixo = (form.sufixo || '').trim() || null;
    const fonte_opcoes = form.tipo === 'lista' && form.fonte_opcoes === 'fornecedores_grupo' ? 'fornecedores_grupo' : 'manual';
    const grupo_compras_id = fonte_opcoes === 'fornecedores_grupo' && form.grupo_compras_id ? (parseInt(form.grupo_compras_id, 10) || null) : null;
    setSaving(true);
    setError('');
    try {
      if (editing) {
        await api.put(`/variaveis-tecnicas/${editing.id}`, { nome, chave, categoria, tipo, opcoes, ordem, sufixo, fonte_opcoes, grupo_compras_id });
      } else {
        await api.post('/variaveis-tecnicas', { nome, chave, categoria, tipo, opcoes, ordem, sufixo, fonte_opcoes, grupo_compras_id });
      }
      setModalOpen(false);
      loadList();
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Erro ao salvar.');
    } finally {
      setSaving(false);
    }
  };

  const handleDesativar = async (v) => {
    if (!window.confirm(`Desativar a variável "${v.nome}"?`)) return;
    try {
      await api.delete(`/variaveis-tecnicas/${v.id}`);
      loadList();
    } catch (err) {
      alert(err.response?.data?.error || 'Erro ao desativar.');
    }
  };

  return (
    <div className="config-section variaveis-tecnicas-section">
      <div className="vt-header">
        <h2>Variáveis técnicas</h2>
        <p className="vt-desc">Cadastre as variáveis usadas nos marcadores técnicos da vista frontal e no cadastro de produtos (motor, disco, potência, etc.).</p>
      </div>

      <div className="vt-toolbar">
        <div className="vt-search-wrap">
          <FiSearch className="vt-search-icon" />
          <input
            type="text"
            placeholder="Buscar por nome ou chave..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="vt-search-input"
          />
        </div>
        <select
          value={filterCategoria}
          onChange={(e) => setFilterCategoria(e.target.value)}
          className="vt-filter-categoria"
        >
          <option value="">Todas as categorias</option>
          {categorias.map(c => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <button type="button" onClick={openNew} className="vt-btn-new">
          <FiPlus /> Nova variável
        </button>
      </div>

      {loading ? (
        <div className="vt-loading">Carregando...</div>
      ) : (
        <div className="vt-table-wrap">
          <table className="vt-table">
            <thead>
              <tr>
                <th>Nome</th>
                <th>Chave</th>
                <th>Categoria</th>
                <th>Tipo</th>
                <th>Sufixo</th>
                <th>Fonte opções</th>
                <th>Ordem</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="vt-empty">
                    {list.length === 0
                      ? 'Nenhuma variável cadastrada. Clique em "Nova variável" para começar.'
                      : 'Nenhum resultado para a busca ou filtro.'}
                  </td>
                </tr>
              ) : (
                filtered.map(v => (
                  <tr key={v.id}>
                    <td className="vt-nome">{v.nome}</td>
                    <td className="vt-chave"><code>{v.chave}</code></td>
                    <td>{v.categoria || '—'}</td>
                    <td>{TIPOS.find(t => t.value === v.tipo)?.label || v.tipo}</td>
                    <td>{v.sufixo || '—'}</td>
                    <td>
                      {v.tipo === 'lista' && v.fonte_opcoes === 'fornecedores_grupo'
                        ? (gruposCompras.find(g => g.id === v.grupo_compras_id)?.nome || `Grupo #${v.grupo_compras_id}`)
                        : (v.tipo === 'lista' ? 'Manual' : '—')}
                    </td>
                    <td>{v.ordem}</td>
                    <td>
                      <button type="button" onClick={() => openEdit(v)} className="vt-btn-icon" title="Editar">
                        <FiEdit2 />
                      </button>
                      <button type="button" onClick={() => handleDesativar(v)} className="vt-btn-icon vt-btn-danger" title="Desativar">
                        <FiTrash2 />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          <div className="vt-count">{filtered.length} {filtered.length === 1 ? 'variável' : 'variáveis'}</div>
        </div>
      )}

      {modalOpen && (
        <div className="vt-modal-overlay" onClick={() => setModalOpen(false)}>
          <div className="vt-modal" onClick={e => e.stopPropagation()}>
            <div className="vt-modal-header">
              <h3>{editing ? 'Editar variável' : 'Nova variável'}</h3>
              <button type="button" onClick={() => setModalOpen(false)} className="vt-modal-close"><FiX /></button>
            </div>
            <div className="vt-modal-body">
              {error && <div className="vt-modal-error">{error}</div>}
              <div className="vt-form-group">
                <label>Nome *</label>
                <input
                  type="text"
                  value={form.nome}
                  onChange={(e) => setForm(f => ({ ...f, nome: e.target.value }))}
                  placeholder="Ex: Potência motor central (CV)"
                />
              </div>
              <div className="vt-form-group">
                <label>Chave (identificador único)</label>
                <input
                  type="text"
                  value={form.chave}
                  onChange={(e) => setForm(f => ({ ...f, chave: e.target.value }))}
                  placeholder="Ex: motor_central_cv (deixe vazio para gerar do nome)"
                />
              </div>
              <div className="vt-form-group">
                <label>Categoria</label>
                <input
                  type="text"
                  value={form.categoria}
                  onChange={(e) => setForm(f => ({ ...f, categoria: e.target.value }))}
                  placeholder="Ex: Motor, Disco, Geral"
                  list="vt-categorias-list"
                />
                <datalist id="vt-categorias-list">
                  {categorias.map(c => <option key={c} value={c} />)}
                </datalist>
              </div>
              <div className="vt-form-group">
                <label>Sufixo (unidade exibida após o valor)</label>
                <input
                  type="text"
                  value={form.sufixo}
                  onChange={(e) => setForm(f => ({ ...f, sufixo: e.target.value }))}
                  placeholder="Ex: kW, CV, L, RPM, Hz (deixe vazio se não houver)"
                />
                <small className="vt-form-hint">Ex.: motor → o cliente informa &quot;30&quot; e o sistema exibe &quot;30 kW&quot; ou &quot;30 CV&quot;</small>
              </div>
              <div className="vt-form-row">
                <div className="vt-form-group">
                  <label>Tipo</label>
                  <select
                    value={form.tipo}
                    onChange={(e) => setForm(f => ({ ...f, tipo: e.target.value }))}
                  >
                    {TIPOS.map(t => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </div>
                <div className="vt-form-group">
                  <label>Ordem</label>
                  <input
                    type="number"
                    min="0"
                    value={form.ordem}
                    onChange={(e) => setForm(f => ({ ...f, ordem: e.target.value }))}
                  />
                </div>
              </div>
              {form.tipo !== 'lista' && (
                <p className="vt-form-hint vt-form-hint-block">Para vincular esta variável ao módulo <strong>Compras (fornecedores homologados)</strong>, altere o tipo para <strong>Lista (opções fixas)</strong>. Em seguida será exibida a opção &quot;Fonte das opções&quot; com o grupo de fornecedores.</p>
              )}
              {form.tipo === 'lista' && (
                <>
                  <div className="vt-form-group">
                    <label>Fonte das opções</label>
                    <select
                      value={form.fonte_opcoes}
                      onChange={(e) => setForm(f => ({ ...f, fonte_opcoes: e.target.value, grupo_compras_id: e.target.value === 'manual' ? '' : f.grupo_compras_id }))}
                      className="vt-form-select"
                    >
                      {FONTE_OPCOES.map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </div>
                  {form.fonte_opcoes === 'fornecedores_grupo' && (
                    <div className="vt-form-group">
                      <label>Grupo de fornecedores homologados</label>
                      <select
                        value={form.grupo_compras_id}
                        onChange={(e) => setForm(f => ({ ...f, grupo_compras_id: e.target.value }))}
                        className="vt-form-select"
                      >
                        <option value="">Selecione o grupo...</option>
                        {gruposCompras.map((g) => (
                          <option key={g.id} value={g.id}>{g.nome || `Grupo ${g.id}`}</option>
                        ))}
                      </select>
                      {gruposCompras.length === 0 && (
                        <small className="vt-form-hint">Nenhum grupo cadastrado. Cadastre em Compras → Fornecedores homologados.</small>
                      )}
                    </div>
                  )}
                  {form.fonte_opcoes === 'manual' && (
                    <div className="vt-form-group">
                      <label>Opções (uma por linha)</label>
                      <textarea
                        value={form.opcoes}
                        onChange={(e) => setForm(f => ({ ...f, opcoes: e.target.value }))}
                        placeholder="Aço Inox 304&#10;Aço Carbono&#10;..."
                        rows={4}
                      />
                    </div>
                  )}
                </>
              )}
            </div>
            <div className="vt-modal-footer">
              <button type="button" onClick={() => setModalOpen(false)} className="vt-btn-cancel">Cancelar</button>
              <button type="button" onClick={handleSave} className="vt-btn-save" disabled={saving}>
                {saving ? 'Salvando...' : (editing ? 'Salvar' : 'Cadastrar')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default VariaveisTecnicas;
