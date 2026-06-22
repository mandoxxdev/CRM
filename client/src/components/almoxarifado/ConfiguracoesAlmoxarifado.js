import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../../services/api';
import { toast } from 'react-toastify';
import { useAuth } from '../../context/AuthContext';
import {
  FiSave, FiPlus, FiTrash2, FiEdit2, FiCheck, FiX,
  FiPackage, FiSliders, FiMapPin, FiSettings,
  FiShield, FiRefreshCw, FiArrowLeft, FiArrowRight, FiMove,
  FiLayers, FiChevronDown, FiChevronRight, FiGrid
} from 'react-icons/fi';
import { useSearchParams } from 'react-router-dom';
import './Almoxarifado.css';

const ICONES = ['📦', '🔧', '🪛', '⚙️', '🛡️', '🧰', '🪝', '💡', '🔩', '🪜', '🧪', '🏗️', '🔌', '🧲', '📋'];
const CORES = ['#4facfe', '#00f2fe', '#43e97b', '#f9a825', '#ef5350', '#ab47bc', '#26c6da', '#ff7043', '#78909c', '#5c6bc0'];

const buildLocalizacaoPath = (loc, allLocs = []) => {
  if (!loc) return '';
  const parent = loc.parent_id ? allLocs.find(l => l.id === loc.parent_id) : null;
  const parts = [];
  if (loc.setor) parts.push(loc.setor);
  if (parent) parts.push(parent.subgrupo || parent.descricao || parent.codigo);
  if (loc.subgrupo) parts.push(loc.subgrupo);
  else if (loc.descricao && !parent) parts.push(loc.descricao);
  return parts.join(' / ');
};

const formatLocalizacaoPath = (loc, allLocs = []) => {
  const path = buildLocalizacaoPath(loc, allLocs);
  return path || '—';
};

/* ── Localização: setores, auto-código e wizard ── */
const SETOR_TIPOS = [
  { value: 'corredor', label: 'Corredor' },
  { value: 'area', label: 'Área' },
  { value: 'bancada', label: 'Bancada' },
];

const setorTipoLabel = (tipo) => SETOR_TIPOS.find(t => t.value === tipo)?.label || 'Área';

const setorIcon = (tipo) => {
  if (tipo === 'corredor') return '🚶';
  if (tipo === 'bancada') return '🛠️';
  return '📍';
};

const buildSetoresOptions = (setoresConfig, localizacoes) => {
  const configMap = new Map(
    (setoresConfig || []).filter(s => s.ativo).map(s => [s.nome, s])
  );
  const fromDb = [...new Set(localizacoes.map(l => l.setor).filter(Boolean))];
  const allNames = [...new Set([...configMap.keys(), ...fromDb])].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  return allNames.map(nome => {
    const cfg = configMap.get(nome);
    return {
      nome,
      tipo: cfg?.tipo || null,
      codigo_prefixo: cfg?.codigo_prefixo || null,
      icon: setorIcon(cfg?.tipo),
      legado: !cfg,
    };
  });
};

const getSetorPrefix = (setor, setoresConfig = []) => {
  const cfg = setoresConfig.find(s => s.nome === setor);
  if (cfg?.codigo_prefixo) return cfg.codigo_prefixo;
  const parts = String(setor || '').split(/\s+/);
  if (parts[0] === 'Corredor' && parts[1]) return parts[1].toUpperCase();
  const clean = String(setor || '').replace(/[^A-Za-z0-9]/g, '');
  return (clean.slice(0, 3) || 'LOC').toUpperCase();
};

const parseCodigoNumber = (codigo) => {
  const m = String(codigo || '').match(/-(\d+)$/);
  return m ? parseInt(m[1], 10) : 0;
};

const getCodigoPrefix = (codigo) => {
  const m = String(codigo || '').match(/^(.+?)-(\d+)$/);
  if (m) return m[1];
  return String(codigo || '').replace(/\d+$/, '') || 'X';
};

const TIPOS_AREA_RAIZ = ['Prateleira', 'Gaveta', 'Box', 'Rua', 'Almoxarifado', 'Área externa'];

const generateNextCodigo = (localizacoes, { setor, parent_id, tipo }, setoresConfig = []) => {
  const parentId = parent_id ? parseInt(parent_id, 10) : null;
  if (parentId) {
    const parent = localizacoes.find(l => l.id === parentId);
    const prefix = parent ? getCodigoPrefix(parent.codigo) : getSetorPrefix(setor, setoresConfig);
    const siblings = localizacoes.filter(l => l.parent_id === parentId);
    const nums = siblings.map(s => parseCodigoNumber(s.codigo));
    const base = nums.length ? Math.max(...nums) : (parseCodigoNumber(parent?.codigo) || 0);
    return `${prefix}-${String(base + 1).padStart(2, '0')}`;
  }
  const prefix = getSetorPrefix(setor, setoresConfig);
  const roots = localizacoes.filter(l => !l.parent_id && l.setor === setor);
  const nums = roots.map(r => parseCodigoNumber(r.codigo)).filter(n => n > 0);
  const maxNum = nums.length ? Math.max(...nums) : 0;
  return `${prefix}-${String(maxNum + 1).padStart(2, '0')}`;
};

const parseSubgrupo = (subgrupo) => {
  const m = String(subgrupo || '').match(/^([A-Za-z]+)(\d+)$/);
  return m ? { letter: m[1].toUpperCase(), num: parseInt(m[2], 10) } : null;
};

const generateSubgrupoOptions = (localizacoes, parent_id) => {
  const parentId = parseInt(parent_id, 10);
  const parent = localizacoes.find(l => l.id === parentId);
  if (!parent) return [];
  const parsed = parseSubgrupo(parent.subgrupo);
  const letter = parsed?.letter || getCodigoPrefix(parent.codigo).charAt(0).toUpperCase() || 'A';
  const siblings = localizacoes.filter(l => l.parent_id === parentId);
  const used = new Set(siblings.map(s => s.subgrupo).filter(Boolean));
  const options = [];
  for (let i = 1; i <= 30; i++) {
    const sg = `${letter}${i}`;
    if (!used.has(sg)) options.push(sg);
  }
  return options;
};

const isSubgrupoDuplicado = (localizacoes, { subgrupo, setor, parent_id, excludeId }) => {
  if (!subgrupo?.trim()) return false;
  const parentVal = parent_id ? parseInt(parent_id, 10) : null;
  return localizacoes.some(l =>
    l.id !== excludeId &&
    l.subgrupo === subgrupo.trim() &&
    (l.setor || null) === (setor || null) &&
    (l.parent_id || null) === parentVal
  );
};

const suggestDescricao = ({ setor, tipo, parent_id, subgrupo }, localizacoes) => {
  const parentId = parent_id ? parseInt(parent_id, 10) : null;
  const parent = parentId ? localizacoes.find(l => l.id === parentId) : null;
  if (parent && subgrupo) {
    const parentLabel = parent.descricao || parent.subgrupo || parent.codigo;
    return `${parentLabel}, posição ${subgrupo}`;
  }
  if (tipo && setor) {
    const rootsInSetor = localizacoes.filter(l => !l.parent_id && l.setor === setor && l.tipo === tipo);
    const n = rootsInSetor.length + 1;
    const letter = String.fromCharCode(65 + ((n - 1) % 26));
    if (tipo === 'Prateleira') return `Prateleira ${letter}, Coluna ${n}`;
    if (tipo === 'Gaveta') return `Gaveta ${n}`;
    return `${tipo} ${n}`;
  }
  return '';
};

const WizardProgress = ({ step, total = 4 }) => (
  <div className="almox-wizard-progress">
    <div className="almox-wizard-progress-bar">
      <div className="almox-wizard-progress-fill" style={{ width: `${(step / total) * 100}%` }} />
    </div>
    <span className="almox-wizard-progress-label">Passo {step} de {total}</span>
  </div>
);

const RadioCard = ({ selected, onClick, title, subtitle, icon }) => (
  <button type="button" className={`almox-wizard-card${selected ? ' selected' : ''}`} onClick={onClick}>
    {icon && <span className="almox-wizard-card-icon">{icon}</span>}
    <span className="almox-wizard-card-title">{title}</span>
    {subtitle && <span className="almox-wizard-card-sub">{subtitle}</span>}
    {selected && <FiCheck className="almox-wizard-card-check" size={16} />}
  </button>
);

const TABS = [
  { id: 'tipos', label: 'Tipos de Material', icon: FiPackage },
  { id: 'familias', label: 'Famílias', icon: FiLayers },
  { id: 'estoques', label: 'Estoques Mínimos', icon: FiSliders },
  { id: 'setores', label: 'Setores e Áreas', icon: FiGrid },
  { id: 'localizacoes', label: 'Localizações', icon: FiMapPin },
  { id: 'geral', label: 'Configurações Gerais', icon: FiSettings },
];

const ConfiguracoesAlmoxarifado = () => {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const isAdmin = user?.role === 'admin';
  const visibleTabs = isAdmin ? TABS : TABS.filter(t => t.id === 'estoques');
  const initialTab = searchParams.get('tab');
  const [tab, setTab] = useState(
    initialTab && visibleTabs.some(t => t.id === initialTab) ? initialTab : (isAdmin ? 'tipos' : 'estoques')
  );

  return (
    <div className="almox-page">
      <div className="almox-header">
        <div>
          <h1 style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <FiSettings size={22} style={{ color: '#4facfe' }} /> Configurações do Almoxarifado
          </h1>
          <p>
            {isAdmin
              ? 'Gerencie tipos de material, famílias, estoques mínimos, setores, localizações e configurações gerais'
              : 'Defina estoque mínimo, máximo, ponto de pedido e prazo de reposição por material'}
          </p>
        </div>
        {isAdmin && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(79,172,254,0.1)', border: '1px solid rgba(79,172,254,0.2)', borderRadius: 8, padding: '6px 12px', fontSize: '0.8rem', color: '#4facfe' }}>
            <FiShield size={14} /> Somente Administradores
          </div>
        )}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--gmp-border)', marginBottom: 24 }}>
        {visibleTabs.map(t => {
          const Icon = t.icon;
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                padding: '10px 18px', fontSize: '0.875rem', fontWeight: 600,
                color: tab === t.id ? '#4facfe' : 'var(--gmp-text-light)',
                borderBottom: `2px solid ${tab === t.id ? '#4facfe' : 'transparent'}`,
                display: 'flex', alignItems: 'center', gap: 8, transition: 'all 0.15s',
                marginBottom: -1,
              }}>
              <Icon size={15} /> {t.label}
            </button>
          );
        })}
      </div>

      {tab === 'tipos' && <TabTiposMaterial />}
      {tab === 'familias' && <TabFamilias />}
      {tab === 'estoques' && <TabEstoquesMinimos />}
      {tab === 'setores' && <TabSetores />}
      {tab === 'localizacoes' && <TabLocalizacoes />}
      {tab === 'geral' && <TabConfiguracoes />}
    </div>
  );
};

/* ===================== TAB TIPOS DE MATERIAL ===================== */
const TabTiposMaterial = () => {
  const [tipos, setTipos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editando, setEditando] = useState(null);
  const [form, setForm] = useState({ nome: '', descricao: '', icone: '📦', cor: '#4facfe', requer_assinatura: false, requer_termo: false, is_epi: false, is_controlado: false });
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => { loadTipos(); }, []);

  const loadTipos = async () => {
    setLoading(true);
    try {
      const res = await api.get('/almoxarifado/tipos-material');
      setTipos(res.data);
    } catch { toast.error('Erro ao carregar tipos'); } finally { setLoading(false); }
  };

  const resetForm = () => {
    setForm({ nome: '', descricao: '', icone: '📦', cor: '#4facfe', requer_assinatura: false, requer_termo: false, is_epi: false, is_controlado: false });
    setEditando(null);
    setShowForm(false);
  };

  const handleEditar = (tipo) => {
    setForm({ ...tipo, requer_assinatura: !!tipo.requer_assinatura, requer_termo: !!tipo.requer_termo, is_epi: !!tipo.is_epi, is_controlado: !!tipo.is_controlado });
    setEditando(tipo.id);
    setShowForm(true);
  };

  const handleSalvar = async () => {
    if (!form.nome.trim()) { toast.error('Nome é obrigatório'); return; }
    setSaving(true);
    try {
      if (editando) {
        await api.put(`/almoxarifado/tipos-material/${editando}`, form);
        toast.success('Tipo atualizado!');
      } else {
        await api.post('/almoxarifado/tipos-material', form);
        toast.success('Tipo criado!');
      }
      resetForm();
      loadTipos();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao salvar');
    } finally { setSaving(false); }
  };

  const handleDeletar = async (id) => {
    if (!window.confirm('Deletar este tipo? Materiais vinculados perderão o tipo.')) return;
    try {
      await api.delete(`/almoxarifado/tipos-material/${id}`);
      toast.success('Tipo removido');
      loadTipos();
    } catch (err) { toast.error(err.response?.data?.error || 'Erro ao deletar'); }
  };

  const CheckToggle = ({ label, field, value, onChange }) => (
    <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: '0.875rem', padding: '4px 0' }}>
      <div onClick={onChange} style={{
        width: 20, height: 20, borderRadius: 4, border: `2px solid ${value ? '#4facfe' : 'var(--gmp-border)'}`,
        background: value ? '#4facfe' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'all 0.15s', cursor: 'pointer', flexShrink: 0,
      }}>
        {value && <FiCheck size={11} color="white" strokeWidth={3} />}
      </div>
      {label}
    </label>
  );

  return (
    <div>
      {!showForm && (
        <button className="btn-almox-primary" style={{ marginBottom: 20 }} onClick={() => setShowForm(true)}>
          <FiPlus size={14} /> Novo Tipo de Material
        </button>
      )}

      {showForm && (
        <div style={{ background: 'var(--gmp-surface)', border: '1px solid rgba(79,172,254,0.25)', borderRadius: 12, padding: 24, marginBottom: 24 }}>
          <div style={{ fontWeight: 700, fontSize: '0.9rem', marginBottom: 18, color: 'var(--gmp-text)' }}>
            {editando ? '✏️ Editar Tipo' : '➕ Novo Tipo de Material'}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
            <div className="almox-field">
              <label className="almox-label">Nome<span className="required">*</span></label>
              <input className="almox-input" value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} placeholder="Ex: EPI, Ferramenta, Consumível..." />
            </div>
            <div className="almox-field">
              <label className="almox-label">Descrição</label>
              <input className="almox-input" value={form.descricao} onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))} placeholder="Descrição breve" />
            </div>
          </div>

          <div style={{ marginBottom: 16 }}>
            <label className="almox-label">Ícone</label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
              {ICONES.map(ic => (
                <button key={ic} type="button" onClick={() => setForm(f => ({ ...f, icone: ic }))}
                  style={{ fontSize: 20, padding: 6, borderRadius: 8, border: `2px solid ${form.icone === ic ? '#4facfe' : 'var(--gmp-border)'}`, background: form.icone === ic ? 'rgba(79,172,254,0.1)' : 'var(--gmp-bg)', cursor: 'pointer' }}>
                  {ic}
                </button>
              ))}
            </div>
          </div>

          <div style={{ marginBottom: 16 }}>
            <label className="almox-label">Cor</label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
              {CORES.map(cor => (
                <button key={cor} type="button" onClick={() => setForm(f => ({ ...f, cor }))}
                  style={{ width: 28, height: 28, borderRadius: 50, background: cor, border: `3px solid ${form.cor === cor ? 'var(--gmp-text)' : 'transparent'}`, cursor: 'pointer' }} />
              ))}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 20 }}>
            <CheckToggle label="🛡️ É um EPI" value={form.is_epi} onChange={() => setForm(f => ({ ...f, is_epi: !f.is_epi }))} />
            <CheckToggle label="🔒 Controlado" value={form.is_controlado} onChange={() => setForm(f => ({ ...f, is_controlado: !f.is_controlado }))} />
            <CheckToggle label="✍️ Requer Assinatura" value={form.requer_assinatura} onChange={() => setForm(f => ({ ...f, requer_assinatura: !f.requer_assinatura }))} />
            <CheckToggle label="📄 Requer Termo" value={form.requer_termo} onChange={() => setForm(f => ({ ...f, requer_termo: !f.requer_termo }))} />
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn-almox-primary" onClick={handleSalvar} disabled={saving}>
              <FiSave size={14} /> {saving ? 'Salvando...' : 'Salvar Tipo'}
            </button>
            <button className="btn-almox-secondary" onClick={resetForm}>Cancelar</button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="almox-loading"><FiRefreshCw size={16} style={{ animation: 'spin 1s linear infinite' }} /> Carregando...</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
          {tipos.map(tipo => (
            <div key={tipo.id} style={{ background: 'var(--gmp-surface)', border: `1px solid var(--gmp-border)`, borderLeft: `4px solid ${tipo.cor}`, borderRadius: 12, padding: 18 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 22 }}>{tipo.icone}</span>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>{tipo.nome}</div>
                    {tipo.descricao && <div style={{ fontSize: '0.75rem', color: 'var(--gmp-text-light)' }}>{tipo.descricao}</div>}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="almox-btn-icon" onClick={() => handleEditar(tipo)}><FiEdit2 size={13} /></button>
                  <button className="almox-btn-icon danger" onClick={() => handleDeletar(tipo.id)}><FiTrash2 size={13} /></button>
                </div>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {tipo.is_epi && <span style={{ fontSize: '0.7rem', background: 'rgba(79,172,254,0.1)', color: '#4facfe', padding: '2px 8px', borderRadius: 20, fontWeight: 600 }}>EPI</span>}
                {tipo.is_controlado && <span style={{ fontSize: '0.7rem', background: 'rgba(239,83,80,0.1)', color: '#ef5350', padding: '2px 8px', borderRadius: 20, fontWeight: 600 }}>Controlado</span>}
                {tipo.requer_assinatura && <span style={{ fontSize: '0.7rem', background: 'rgba(171,71,188,0.1)', color: '#ab47bc', padding: '2px 8px', borderRadius: 20, fontWeight: 600 }}>Assinatura</span>}
                {tipo.requer_termo && <span style={{ fontSize: '0.7rem', background: 'rgba(249,168,37,0.1)', color: '#f9a825', padding: '2px 8px', borderRadius: 20, fontWeight: 600 }}>Termo</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

/* ===================== TAB FAMÍLIAS DE MATERIAL ===================== */
const TabFamilias = () => {
  const [familias, setFamilias] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editando, setEditando] = useState(null);
  const [form, setForm] = useState({ nome: '', descricao: '', codigo: '' });
  const [expandidas, setExpandidas] = useState({});
  const [itensPorFamilia, setItensPorFamilia] = useState({});
  const [loadingItens, setLoadingItens] = useState({});

  useEffect(() => { loadFamilias(); }, []);

  const loadFamilias = async () => {
    setLoading(true);
    try {
      const res = await api.get('/almoxarifado/familias');
      setFamilias(res.data);
    } catch { toast.error('Erro ao carregar famílias'); }
    finally { setLoading(false); }
  };

  const loadItensFamilia = async (familiaId) => {
    setLoadingItens(prev => ({ ...prev, [familiaId]: true }));
    try {
      const res = await api.get(`/almoxarifado/familias/${familiaId}/itens`);
      setItensPorFamilia(prev => ({ ...prev, [familiaId]: res.data }));
    } catch { toast.error('Erro ao carregar itens da família'); }
    finally { setLoadingItens(prev => ({ ...prev, [familiaId]: false })); }
  };

  const toggleExpand = (familiaId) => {
    const abrir = !expandidas[familiaId];
    setExpandidas(prev => ({ ...prev, [familiaId]: abrir }));
    if (abrir && !itensPorFamilia[familiaId]) loadItensFamilia(familiaId);
  };

  const resetForm = () => {
    setForm({ nome: '', descricao: '', codigo: '' });
    setEditando(null);
    setShowForm(false);
  };

  const handleEditar = (fam) => {
    setForm({ nome: fam.nome, descricao: fam.descricao || '', codigo: fam.codigo });
    setEditando(fam.id);
    setShowForm(true);
  };

  const handleSalvar = async () => {
    if (!form.nome.trim()) { toast.error('Nome é obrigatório'); return; }
    setSaving(true);
    try {
      if (editando) {
        await api.put(`/almoxarifado/familias/${editando}`, {
          nome: form.nome,
          descricao: form.descricao,
        });
        toast.success('Família atualizada!');
      } else {
        await api.post('/almoxarifado/familias', form);
        toast.success('Família criada!');
      }
      resetForm();
      loadFamilias();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao salvar');
    } finally { setSaving(false); }
  };

  const handleInativar = async (fam) => {
    if (!window.confirm(`Inativar a família "${fam.nome}"? Novos itens não poderão ser cadastrados.`)) return;
    try {
      await api.delete(`/almoxarifado/familias/${fam.id}`);
      toast.success('Família inativada');
      loadFamilias();
    } catch (err) { toast.error(err.response?.data?.error || 'Erro ao inativar'); }
  };

  return (
    <div>
      <p style={{ fontSize: '0.85rem', color: 'var(--gmp-text-light)', marginBottom: 20 }}>
        Agrupe materiais em famílias (ex.: Parafusos e Porcas) e cadastre cada SKU como item dentro da família.
        Cada item mantém sua própria localização e estoque.
      </p>

      {!showForm && (
        <button className="btn-almox-primary" style={{ marginBottom: 20 }} onClick={() => setShowForm(true)}>
          <FiPlus size={14} /> Nova Família
        </button>
      )}

      {showForm && (
        <div style={{ background: 'var(--gmp-surface)', border: '1px solid rgba(79,172,254,0.25)', borderRadius: 12, padding: 24, marginBottom: 24 }}>
          <div style={{ fontWeight: 700, fontSize: '0.9rem', marginBottom: 18 }}>
            {editando ? '✏️ Editar Família' : '➕ Nova Família de Material'}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
            <div className="almox-field">
              <label className="almox-label">Nome<span className="required">*</span></label>
              <input className="almox-input" value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))}
                placeholder="Ex: Parafusos e Porcas" />
            </div>
            {!editando && (
              <div className="almox-field">
                <label className="almox-label">Código <span style={{ fontWeight: 400, color: 'var(--gmp-text-light)' }}>(opcional — gerado automaticamente)</span></label>
                <input className="almox-input" value={form.codigo} onChange={e => setForm(f => ({ ...f, codigo: e.target.value.toUpperCase() }))}
                  placeholder="Ex: PAR" style={{ fontFamily: 'monospace' }} maxLength={10} />
              </div>
            )}
            {editando && (
              <div className="almox-field">
                <label className="almox-label">Código</label>
                <input className="almox-input" value={form.codigo} readOnly style={{ fontFamily: 'monospace', opacity: 0.7 }} />
              </div>
            )}
            <div className="almox-field" style={{ gridColumn: '1 / -1' }}>
              <label className="almox-label">Descrição</label>
              <input className="almox-input" value={form.descricao} onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))}
                placeholder="Descrição breve da família" />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn-almox-primary" onClick={handleSalvar} disabled={saving}>
              <FiSave size={14} /> {saving ? 'Salvando...' : 'Salvar Família'}
            </button>
            <button className="btn-almox-secondary" onClick={resetForm}>Cancelar</button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="almox-loading"><FiRefreshCw size={16} style={{ animation: 'spin 1s linear infinite' }} /> Carregando...</div>
      ) : familias.length === 0 ? (
        <div className="almox-empty" style={{ padding: 40 }}>
          <FiLayers size={40} style={{ opacity: 0.3, display: 'block', margin: '0 auto 12px' }} />
          <p>Nenhuma família cadastrada</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {familias.map(fam => {
            const expandida = !!expandidas[fam.id];
            const itens = itensPorFamilia[fam.id] || [];
            return (
              <div key={fam.id} style={{ background: 'var(--gmp-surface)', border: '1px solid var(--gmp-border)', borderRadius: 12, overflow: 'hidden' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px', cursor: 'pointer' }}
                  onClick={() => toggleExpand(fam.id)}>
                  <button type="button" className="almox-btn-icon" style={{ pointerEvents: 'none' }}>
                    {expandida ? <FiChevronDown size={14} /> : <FiChevronRight size={14} />}
                  </button>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                      <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#4facfe', fontSize: '0.85rem' }}>{fam.codigo}</span>
                      <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>{fam.nome}</span>
                      <span style={{ fontSize: '0.75rem', background: 'rgba(79,172,254,0.1)', color: '#4facfe', padding: '2px 10px', borderRadius: 20, fontWeight: 600 }}>
                        {fam.qtd_itens || 0} {fam.qtd_itens === 1 ? 'item' : 'itens'}
                      </span>
                    </div>
                    {fam.descricao && <div style={{ fontSize: '0.75rem', color: 'var(--gmp-text-light)', marginTop: 4 }}>{fam.descricao}</div>}
                  </div>
                  <div style={{ display: 'flex', gap: 6 }} onClick={e => e.stopPropagation()}>
                    <Link to={`/almoxarifado/materiais/novo?familia_id=${fam.id}`} className="btn-almox-secondary" style={{ fontSize: '0.75rem', padding: '6px 12px' }}>
                      <FiPlus size={12} /> Adicionar item
                    </Link>
                    <button className="almox-btn-icon" onClick={() => handleEditar(fam)} title="Editar"><FiEdit2 size={13} /></button>
                    <button className="almox-btn-icon danger" onClick={() => handleInativar(fam)} title="Inativar"><FiTrash2 size={13} /></button>
                  </div>
                </div>

                {expandida && (
                  <div style={{ borderTop: '1px solid var(--gmp-border)', padding: '12px 18px 16px 48px', background: 'var(--gmp-bg)' }}>
                    {loadingItens[fam.id] ? (
                      <div style={{ fontSize: '0.8rem', color: 'var(--gmp-text-light)' }}>Carregando itens...</div>
                    ) : itens.length === 0 ? (
                      <div style={{ fontSize: '0.85rem', color: 'var(--gmp-text-light)' }}>
                        Nenhum item nesta família.{' '}
                        <Link to={`/almoxarifado/materiais/novo?familia_id=${fam.id}`} style={{ color: '#4facfe' }}>Cadastrar primeiro item</Link>
                      </div>
                    ) : (
                      <table className="almox-table" style={{ fontSize: '0.85rem' }}>
                        <thead>
                          <tr>
                            <th>Código</th>
                            <th>Nome</th>
                            <th>Saldo</th>
                            <th>Localização</th>
                            <th></th>
                          </tr>
                        </thead>
                        <tbody>
                          {itens.map(item => (
                            <tr key={item.id}>
                              <td><span style={{ fontFamily: 'monospace', color: '#4facfe' }}>{item.codigo}</span></td>
                              <td>{item.nome}</td>
                              <td>{item.quantidade_atual} {item.unidade}</td>
                              <td style={{ color: 'var(--gmp-text-light)', fontSize: '0.8rem' }}>{item.localizacao || '—'}</td>
                              <td>
                                <Link to={`/almoxarifado/materiais/editar/${item.id}`} className="almox-btn-icon" title="Editar">
                                  <FiEdit2 size={13} />
                                </Link>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

/* ===================== TAB ESTOQUES MÍNIMOS ===================== */
const TabEstoquesMinimos = () => {
  const [materiais, setMateriais] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [buscaFiltro, setBuscaFiltro] = useState('');
  const [editados, setEditados] = useState({});

  useEffect(() => { loadMateriais(); }, []);

  const loadMateriais = async () => {
    setLoading(true);
    try {
      const res = await api.get('/almoxarifado/materiais');
      setMateriais(res.data);
    } catch { toast.error('Erro ao carregar materiais'); } finally { setLoading(false); }
  };

  const handleChange = (id, campo, valor) => {
    setEditados(prev => ({ ...prev, [id]: { ...(prev[id] || {}), [campo]: valor } }));
  };

  const getVal = (mat, campo) => {
    if (editados[mat.id]?.[campo] !== undefined) return editados[mat.id][campo];
    return mat[campo] ?? '';
  };

  const handleSalvar = async () => {
    const ids = Object.keys(editados);
    if (ids.length === 0) { toast.info('Nenhuma alteração para salvar'); return; }
    setSaving(true);
    try {
      const payload = ids.map(id => ({
        id: parseInt(id),
        quantidade_minima: parseFloat(editados[id].quantidade_minima ?? materiais.find(m => m.id === parseInt(id))?.quantidade_minima ?? 0),
        quantidade_maxima: parseFloat(editados[id].quantidade_maxima ?? materiais.find(m => m.id === parseInt(id))?.quantidade_maxima ?? 0),
        ponto_pedido: parseFloat(editados[id].ponto_pedido ?? materiais.find(m => m.id === parseInt(id))?.ponto_pedido ?? 0),
        prazo_reposicao_dias: parseInt(editados[id].prazo_reposicao_dias ?? materiais.find(m => m.id === parseInt(id))?.prazo_reposicao_dias ?? 0),
      }));
      await api.put('/almoxarifado/configuracoes/estoques-minimos', { materiais: payload });
      toast.success(`${ids.length} material(is) atualizado(s)!`);
      setEditados({});
      loadMateriais();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao salvar');
    } finally { setSaving(false); }
  };

  const materiaisFiltrados = materiais.filter(m =>
    m.nome.toLowerCase().includes(buscaFiltro.toLowerCase()) ||
    m.codigo.toLowerCase().includes(buscaFiltro.toLowerCase())
  );

  const countEditados = Object.keys(editados).length;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <input className="almox-input" style={{ width: 260 }} placeholder="Filtrar materiais..." value={buscaFiltro} onChange={e => setBuscaFiltro(e.target.value)} />
          {countEditados > 0 && <span style={{ fontSize: '0.8rem', color: '#f9a825', fontWeight: 600 }}>{countEditados} alteração(ões) pendente(s)</span>}
        </div>
        <button className="btn-almox-primary" onClick={handleSalvar} disabled={saving || countEditados === 0}>
          <FiSave size={14} /> {saving ? 'Salvando...' : `Salvar Alterações${countEditados > 0 ? ` (${countEditados})` : ''}`}
        </button>
      </div>

      {loading ? (
        <div className="almox-loading"><FiRefreshCw size={16} style={{ animation: 'spin 1s linear infinite' }} /> Carregando...</div>
      ) : (
        <div className="almox-table-container">
          <table className="almox-table">
            <thead>
              <tr>
                <th>Material</th>
                <th>Saldo Atual</th>
                <th>Estoque mín.</th>
                <th>Estoque máx.</th>
                <th>Ponto Pedido</th>
                <th>Prazo Repos. (dias)</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {materiaisFiltrados.map(mat => {
                const isEditado = !!editados[mat.id];
                const minVal = parseFloat(getVal(mat, 'quantidade_minima') || 0);
                const atual = mat.quantidade_atual;
                const status = atual <= 0 ? 'critico' : atual <= minVal ? 'baixo' : 'ok';
                return (
                  <tr key={mat.id} style={{ background: isEditado ? 'rgba(79,172,254,0.04)' : '' }}>
                    <td>
                      <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>{mat.nome}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--gmp-text-light)', fontFamily: 'monospace' }}>{mat.codigo}</div>
                    </td>
                    <td style={{ fontWeight: 700, color: status === 'critico' ? 'var(--gmp-error)' : status === 'baixo' ? 'var(--gmp-warning)' : 'var(--gmp-success)' }}>
                      {atual} {mat.unidade}
                    </td>
                    {['quantidade_minima', 'quantidade_maxima', 'ponto_pedido', 'prazo_reposicao_dias'].map(campo => (
                      <td key={campo}>
                        <input className="almox-count-input" type="number" min="0" step={campo === 'prazo_reposicao_dias' ? '1' : '0.01'}
                          value={getVal(mat, campo)} onChange={e => handleChange(mat.id, campo, e.target.value)} />
                      </td>
                    ))}
                    <td>
                      <span className={`almox-badge almox-badge-${status}`}>
                        {status === 'critico' ? 'Crítico' : status === 'baixo' ? 'Baixo' : 'OK'}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

/* ===================== TAB SETORES E ÁREAS ===================== */
const SETOR_FORM_INITIAL = { nome: '', codigo_prefixo: '', tipo: 'corredor', ordem: 0 };

const TabSetores = () => {
  const [setores, setSetores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editando, setEditando] = useState(null);
  const [form, setForm] = useState(SETOR_FORM_INITIAL);

  useEffect(() => { loadSetores(); }, []);

  const loadSetores = async () => {
    setLoading(true);
    try {
      const res = await api.get('/almoxarifado/setores?all=1');
      setSetores(res.data);
    } catch { toast.error('Erro ao carregar setores'); }
    finally { setLoading(false); }
  };

  const resetForm = () => {
    setForm(SETOR_FORM_INITIAL);
    setEditando(null);
    setShowForm(false);
  };

  const handleEditar = (setor) => {
    setForm({
      nome: setor.nome,
      codigo_prefixo: setor.codigo_prefixo,
      tipo: setor.tipo || 'area',
      ordem: setor.ordem || 0,
    });
    setEditando(setor.id);
    setShowForm(true);
  };

  const suggestPrefixo = (nome, tipo) => {
    const parts = String(nome || '').trim().split(/\s+/);
    if (tipo === 'corredor' && parts[0] === 'Corredor' && parts[1]) return parts[1].toUpperCase();
    if (tipo === 'bancada') return 'GAV';
    const clean = String(nome || '').replace(/[^A-Za-z0-9]/g, '');
    return (clean.slice(0, 3) || '').toUpperCase();
  };

  const handleSalvar = async () => {
    if (!form.nome.trim()) { toast.error('Nome é obrigatório'); return; }
    if (!form.codigo_prefixo.trim()) { toast.error('Prefixo do código é obrigatório'); return; }
    setSaving(true);
    try {
      const payload = {
        nome: form.nome.trim(),
        codigo_prefixo: form.codigo_prefixo.trim().toUpperCase(),
        tipo: form.tipo,
        ordem: parseInt(form.ordem, 10) || 0,
      };
      if (editando) {
        await api.put(`/almoxarifado/setores/${editando}`, payload);
        toast.success('Setor atualizado!');
      } else {
        await api.post('/almoxarifado/setores', payload);
        toast.success('Setor criado!');
      }
      resetForm();
      loadSetores();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao salvar');
    } finally { setSaving(false); }
  };

  const handleInativar = async (setor) => {
    if (setor.qtd_localizacoes > 0) {
      toast.error(`Não é possível excluir: ${setor.qtd_localizacoes} localização(ões) usam este setor`);
      return;
    }
    if (!window.confirm(`Inativar o setor "${setor.nome}"?`)) return;
    try {
      await api.delete(`/almoxarifado/setores/${setor.id}`);
      toast.success('Setor inativado');
      loadSetores();
    } catch (err) { toast.error(err.response?.data?.error || 'Erro ao inativar'); }
  };

  return (
    <div>
      <p style={{ fontSize: '0.85rem', color: 'var(--gmp-text-light)', marginBottom: 20, maxWidth: 720 }}>
        Defina os corredores, bancadas e áreas disponíveis no cadastro guiado de localizações.
        O <strong>prefixo do código</strong> é usado na geração automática (ex.: Corredor D com prefixo &quot;D&quot; gera códigos D-01, D-02…).
      </p>

      {!showForm && (
        <button className="btn-almox-primary" style={{ marginBottom: 20 }} onClick={() => setShowForm(true)}>
          <FiPlus size={14} /> Novo Setor ou Área
        </button>
      )}

      {showForm && (
        <div style={{ background: 'var(--gmp-surface)', border: '1px solid rgba(79,172,254,0.25)', borderRadius: 12, padding: 24, marginBottom: 24 }}>
          <div style={{ fontWeight: 700, fontSize: '0.9rem', marginBottom: 18, color: 'var(--gmp-text)' }}>
            {editando ? '✏️ Editar Setor' : '➕ Novo Setor ou Área'}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
            <div className="almox-field">
              <label className="almox-label">Nome<span className="required">*</span></label>
              <input className="almox-input" value={form.nome}
                onChange={e => {
                  const nome = e.target.value;
                  setForm(f => ({
                    ...f,
                    nome,
                    codigo_prefixo: f.codigo_prefixo || suggestPrefixo(nome, f.tipo),
                  }));
                }}
                placeholder="Ex: Corredor D, Área de Solda..." />
            </div>
            <div className="almox-field">
              <label className="almox-label">Prefixo do código<span className="required">*</span></label>
              <input className="almox-input" value={form.codigo_prefixo}
                onChange={e => setForm(f => ({ ...f, codigo_prefixo: e.target.value.toUpperCase() }))}
                placeholder="Ex: D, EPI, GAV" style={{ fontFamily: 'monospace' }} />
              <span style={{ fontSize: '0.72rem', color: 'var(--gmp-text-light)' }}>Usado em códigos como {form.codigo_prefixo || 'X'}-01</span>
            </div>
            <div className="almox-field">
              <label className="almox-label">Tipo</label>
              <select className="almox-select" value={form.tipo}
                onChange={e => setForm(f => ({ ...f, tipo: e.target.value }))}>
                {SETOR_TIPOS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div className="almox-field">
              <label className="almox-label">Ordem de exibição</label>
              <input className="almox-input" type="number" min="0" value={form.ordem}
                onChange={e => setForm(f => ({ ...f, ordem: e.target.value }))} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn-almox-primary" onClick={handleSalvar} disabled={saving}>
              <FiSave size={14} /> {saving ? 'Salvando...' : 'Salvar'}
            </button>
            <button className="btn-almox-secondary" onClick={resetForm}><FiX size={14} /> Cancelar</button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="almox-loading"><FiRefreshCw size={16} style={{ animation: 'spin 1s linear infinite' }} /> Carregando...</div>
      ) : (
        <div className="almox-table-container">
          <table className="almox-table">
            <thead>
              <tr>
                <th>Nome</th>
                <th>Prefixo</th>
                <th>Tipo</th>
                <th>Ordem</th>
                <th>Localizações</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {setores.map(s => (
                <tr key={s.id} style={{ opacity: s.ativo ? 1 : 0.55 }}>
                  <td style={{ fontWeight: 600 }}>{s.nome}</td>
                  <td><span style={{ fontFamily: 'monospace', color: '#4facfe', fontWeight: 700 }}>{s.codigo_prefixo}</span></td>
                  <td><span style={{ fontSize: '0.8rem' }}>{setorIcon(s.tipo)} {setorTipoLabel(s.tipo)}</span></td>
                  <td>{s.ordem}</td>
                  <td>{s.qtd_localizacoes || 0}</td>
                  <td>
                    <span className={`almox-badge almox-badge-${s.ativo ? 'ok' : 'critico'}`}>
                      {s.ativo ? 'Ativo' : 'Inativo'}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                      <button className="almox-btn-icon" onClick={() => handleEditar(s)} title="Editar"><FiEdit2 size={13} /></button>
                      {s.ativo && (
                        <button className="almox-btn-icon danger" onClick={() => handleInativar(s)} title="Inativar"
                          disabled={s.qtd_localizacoes > 0}>
                          <FiTrash2 size={13} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

/* ===================== TAB LOCALIZAÇÕES ===================== */
const WIZARD_INITIAL = {
  setor: '',
  estruturaTipo: '',
  parent_id: '',
  tipo: 'Prateleira',
  descricao: '',
  subgrupo: '',
  codigo: '',
  pos_x: '',
  pos_y: '',
  largura: 120,
  altura: 80,
};

const TabLocalizacoes = () => {
  const [localizacoes, setLocalizacoes] = useState([]);
  const [setoresConfig, setSetoresConfig] = useState([]);
  const [tiposLoc, setTiposLoc] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [showWizard, setShowWizard] = useState(false);
  const [wizardStep, setWizardStep] = useState(1);
  const [wizard, setWizard] = useState(WIZARD_INITIAL);
  const [wizardError, setWizardError] = useState('');
  const [showMapaStep, setShowMapaStep] = useState(false);

  const [editando, setEditando] = useState(null);
  const [editForm, setEditForm] = useState({ descricao: '', tipo: 'Almoxarifado' });
  const [showEdit, setShowEdit] = useState(false);

  const [moverLoc, setMoverLoc] = useState(null);
  const [moverStep, setMoverStep] = useState(1);
  const [moverData, setMoverData] = useState({ setor: '', estruturaTipo: '', parent_id: '', subgrupo: '', codigo: '' });
  const [moverError, setMoverError] = useState('');

  useEffect(() => { loadLocs(); loadTipos(); loadSetores(); }, []);

  const loadSetores = async () => {
    try {
      const r = await api.get('/almoxarifado/setores');
      setSetoresConfig(r.data);
    } catch { /* fallback: setores legados das localizações */ }
  };
  const loadTipos = async () => {
    try {
      const r = await api.get('/almoxarifado/meta/tipos-material');
      setTiposLoc(r.data.localizacoes_tipos || []);
    } catch { /* ignore */ }
  };
  const loadLocs = async () => {
    setLoading(true);
    try { const r = await api.get('/almoxarifado/localizacoes'); setLocalizacoes(r.data); }
    catch { toast.error('Erro ao carregar localizações'); } finally { setLoading(false); }
  };

  const tiposAreaRaiz = TIPOS_AREA_RAIZ.filter(t =>
    !tiposLoc.length || tiposLoc.includes(t) || TIPOS_AREA_RAIZ.includes(t)
  );
  const setoresOptions = buildSetoresOptions(setoresConfig, localizacoes);

  const parentOptionsForSetor = (setor, excludeId) => localizacoes.filter(l => {
    if (excludeId && l.id === excludeId) return false;
    if (setor && l.setor !== setor) return false;
    return true;
  });

  const resetWizard = () => {
    setWizard(WIZARD_INITIAL);
    setWizardStep(1);
    setWizardError('');
    setShowMapaStep(false);
    setShowWizard(false);
  };

  const resetEdit = () => {
    setEditando(null);
    setEditForm({ descricao: '', tipo: 'Almoxarifado' });
    setShowEdit(false);
  };

  const resetMover = () => {
    setMoverLoc(null);
    setMoverStep(1);
    setMoverData({ setor: '', estruturaTipo: '', parent_id: '', subgrupo: '', codigo: '' });
    setMoverError('');
  };

  const computeWizardDetails = (data) => {
    const isChild = data.estruturaTipo === 'child';
    const parentId = isChild && data.parent_id ? parseInt(data.parent_id, 10) : null;
    const subgrupoOpts = isChild && data.parent_id ? generateSubgrupoOptions(localizacoes, data.parent_id) : [];
    const subgrupo = isChild ? (data.subgrupo || subgrupoOpts[0] || '') : '';
    const codigo = generateNextCodigo(localizacoes, {
      setor: data.setor,
      parent_id: parentId,
      tipo: data.tipo,
    }, setoresConfig);
    const descricao = data.descricao?.trim() || suggestDescricao({
      setor: data.setor,
      tipo: data.tipo,
      parent_id: parentId,
      subgrupo,
    }, localizacoes);
    return { subgrupo, codigo, descricao, parentId };
  };

  const wizardPreviewLoc = () => {
    const { subgrupo, codigo, descricao, parentId } = computeWizardDetails(wizard);
    return { setor: wizard.setor, subgrupo, descricao, codigo, tipo: wizard.tipo, parent_id: parentId };
  };

  const validateWizardStep = (step) => {
    setWizardError('');
    if (step === 1) {
      if (!wizard.setor) { setWizardError('Selecione o setor ou corredor onde a localização fica.'); return false; }
      return true;
    }
    if (step === 2) {
      if (!wizard.estruturaTipo) { setWizardError('Escolha se é uma posição raiz ou dentro de uma estrutura existente.'); return false; }
      if (wizard.estruturaTipo === 'child' && !wizard.parent_id) {
        setWizardError('Selecione a estrutura pai dentro do setor escolhido.');
        return false;
      }
      if (wizard.estruturaTipo === 'child' && parentOptionsForSetor(wizard.setor).length === 0) {
        setWizardError('Não há estruturas neste setor. Cadastre uma posição raiz primeiro.');
        return false;
      }
      return true;
    }
    if (step === 3) {
      if (wizard.estruturaTipo === 'root' && !wizard.tipo) {
        setWizardError('Selecione o tipo de área.');
        return false;
      }
      const { subgrupo, parentId } = computeWizardDetails(wizard);
      if (wizard.estruturaTipo === 'child' && !subgrupo) {
        setWizardError('Selecione o subgrupo para a posição dentro da estrutura.');
        return false;
      }
      if (isSubgrupoDuplicado(localizacoes, { subgrupo, setor: wizard.setor, parent_id: parentId })) {
        setWizardError('Este subgrupo já existe nesta estrutura. Escolha outro.');
        return false;
      }
      return true;
    }
    return true;
  };

  const handleWizardNext = () => {
    if (!validateWizardStep(wizardStep)) return;
    if (wizardStep === 2 || wizardStep === 3) {
      const computed = computeWizardDetails(wizard);
      setWizard(w => ({ ...w, subgrupo: computed.subgrupo, codigo: computed.codigo, descricao: w.descricao || computed.descricao }));
    }
    setWizardStep(s => Math.min(s + 1, 4));
  };

  const handleWizardBack = () => {
    setWizardError('');
    setWizardStep(s => Math.max(s - 1, 1));
  };

  const handleWizardConfirm = async () => {
    const { subgrupo, codigo, descricao, parentId } = computeWizardDetails(wizard);
    if (!codigo) { setWizardError('Não foi possível gerar o código. Revise as seleções.'); return; }
    if (isSubgrupoDuplicado(localizacoes, { subgrupo, setor: wizard.setor, parent_id: parentId })) {
      setWizardError('Subgrupo duplicado nesta estrutura. Volte e escolha outro.');
      return;
    }
    setSaving(true);
    try {
      await api.post('/almoxarifado/localizacoes', {
        codigo,
        descricao: descricao || null,
        setor: wizard.setor,
        subgrupo: subgrupo || null,
        parent_id: parentId,
        tipo: wizard.tipo || 'Almoxarifado',
        pos_x: wizard.pos_x !== '' && wizard.pos_x != null ? parseFloat(wizard.pos_x) : null,
        pos_y: wizard.pos_y !== '' && wizard.pos_y != null ? parseFloat(wizard.pos_y) : null,
        largura: parseFloat(wizard.largura) || 120,
        altura: parseFloat(wizard.altura) || 80,
      });
      toast.success('Localização cadastrada!');
      resetWizard();
      loadLocs();
    } catch (err) {
      setWizardError(err.response?.data?.error || 'Erro ao cadastrar localização');
    } finally { setSaving(false); }
  };

  const handleEditar = (loc) => {
    resetWizard();
    resetMover();
    setEditando(loc.id);
    setEditForm({ descricao: loc.descricao || '', tipo: loc.tipo || 'Almoxarifado' });
    setShowEdit(true);
  };

  const handleSalvarEdit = async () => {
    const loc = localizacoes.find(l => l.id === editando);
    if (!loc) return;
    setSaving(true);
    try {
      await api.put(`/almoxarifado/localizacoes/${editando}`, {
        codigo: loc.codigo,
        descricao: editForm.descricao || null,
        setor: loc.setor,
        subgrupo: loc.subgrupo || null,
        parent_id: loc.parent_id || null,
        tipo: editForm.tipo || 'Almoxarifado',
        pos_x: loc.pos_x ?? null,
        pos_y: loc.pos_y ?? null,
        largura: loc.largura ?? 120,
        altura: loc.altura ?? 80,
      });
      toast.success('Localização atualizada!');
      resetEdit();
      loadLocs();
    } catch (err) { toast.error(err.response?.data?.error || 'Erro ao salvar'); }
    finally { setSaving(false); }
  };

  const startMover = (loc) => {
    resetWizard();
    resetEdit();
    setMoverLoc(loc);
    setMoverData({
      setor: loc.setor || '',
      estruturaTipo: loc.parent_id ? 'child' : 'root',
      parent_id: loc.parent_id ? String(loc.parent_id) : '',
      subgrupo: loc.subgrupo || '',
      codigo: loc.codigo,
    });
    setMoverStep(1);
    setMoverError('');
  };

  const computeMoverDetails = (data, loc) => {
    const isChild = data.estruturaTipo === 'child';
    const parentId = isChild && data.parent_id ? parseInt(data.parent_id, 10) : null;
    const locsExcl = localizacoes.filter(l => l.id !== loc.id);
    const subgrupoOpts = isChild && data.parent_id ? generateSubgrupoOptions(locsExcl, data.parent_id) : [];
    const subgrupo = isChild ? (data.subgrupo || subgrupoOpts[0] || loc.subgrupo || '') : null;
    const codigo = generateNextCodigo(locsExcl, { setor: data.setor, parent_id: parentId, tipo: loc.tipo }, setoresConfig);
    return { subgrupo, codigo, parentId };
  };

  const handleMoverConfirm = async () => {
    if (!moverLoc) return;
    const { subgrupo, codigo, parentId } = computeMoverDetails(moverData, moverLoc);
    if (moverData.estruturaTipo === 'child' && !moverData.parent_id) {
      setMoverError('Selecione a estrutura pai no novo setor.');
      return;
    }
    if (isSubgrupoDuplicado(localizacoes, {
      subgrupo, setor: moverData.setor, parent_id: parentId, excludeId: moverLoc.id,
    })) {
      setMoverError('Subgrupo já existe na estrutura de destino.');
      return;
    }
    setSaving(true);
    try {
      await api.put(`/almoxarifado/localizacoes/${moverLoc.id}`, {
        codigo,
        descricao: moverLoc.descricao,
        setor: moverData.setor,
        subgrupo: subgrupo || null,
        parent_id: parentId,
        tipo: moverLoc.tipo || 'Almoxarifado',
        pos_x: moverLoc.pos_x ?? null,
        pos_y: moverLoc.pos_y ?? null,
        largura: moverLoc.largura ?? 120,
        altura: moverLoc.altura ?? 80,
      });
      toast.success('Localização movida com novo código!');
      resetMover();
      loadLocs();
    } catch (err) { setMoverError(err.response?.data?.error || 'Erro ao mover'); }
    finally { setSaving(false); }
  };

  const handleDeletar = async (id) => {
    if (!window.confirm('Remover localização?')) return;
    try { await api.delete(`/almoxarifado/localizacoes/${id}`); toast.success('Removido'); loadLocs(); }
    catch (err) { toast.error(err.response?.data?.error || 'Erro'); }
  };

  const subgrupoOptions = wizard.estruturaTipo === 'child' && wizard.parent_id
    ? generateSubgrupoOptions(localizacoes, wizard.parent_id) : [];
  const preview = wizardPreviewLoc();
  const moverParents = moverLoc ? parentOptionsForSetor(moverData.setor, moverLoc.id) : [];
  const moverPreview = moverLoc ? computeMoverDetails(moverData, moverLoc) : null;
  const editLoc = editando ? localizacoes.find(l => l.id === editando) : null;
  const tiposEdit = tiposLoc.length ? tiposLoc : ['Almoxarifado', 'Rua', 'Prateleira', 'Gaveta', 'Box', 'Área externa'];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        {!showWizard && !showEdit && !moverLoc && (
          <button className="btn-almox-primary" onClick={() => { resetEdit(); resetMover(); setShowWizard(true); }}>
            <FiPlus size={14} /> Nova Localização
          </button>
        )}
        <Link to="/almoxarifado/mapa" className="btn-almox-secondary" style={{ marginLeft: (!showWizard && !showEdit && !moverLoc) ? 'auto' : 0 }}>
          <FiMapPin size={14} /> Ver Mapa de Áreas
        </Link>
      </div>

      {showWizard && (
        <div className="almox-wizard-panel">
          <div className="almox-wizard-header">
            <h3>Nova Localização</h3>
            <button type="button" className="almox-btn-icon" onClick={resetWizard} title="Cancelar"><FiX size={16} /></button>
          </div>
          <WizardProgress step={wizardStep} />

          {wizardStep === 1 && (
            <div className="almox-wizard-step">
              <h4>Onde fica?</h4>
              <p className="almox-wizard-hint">
                Selecione o setor ou corredor. Não é possível digitar livremente.
                {' '}Precisa de mais corredores? Cadastre em <strong>Setores e Áreas</strong>.
              </p>
              <div className="almox-wizard-setor-grid">
                {setoresOptions.map(s => (
                  <RadioCard
                    key={s.nome}
                    selected={wizard.setor === s.nome}
                    onClick={() => setWizard(w => ({ ...w, setor: s.nome, parent_id: '', estruturaTipo: '' }))}
                    title={s.nome}
                    subtitle={s.codigo_prefixo ? `Códigos ${s.codigo_prefixo}-01…` : (s.legado ? 'Setor legado' : setorTipoLabel(s.tipo))}
                    icon={s.icon}
                  />
                ))}
              </div>
            </div>
          )}

          {wizardStep === 2 && (
            <div className="almox-wizard-step">
              <h4>Tipo de estrutura</h4>
              <p className="almox-wizard-hint">Setor selecionado: <strong>{wizard.setor}</strong></p>
              <div className="almox-wizard-cards-row">
                <RadioCard
                  selected={wizard.estruturaTipo === 'root'}
                  onClick={() => setWizard(w => ({ ...w, estruturaTipo: 'root', parent_id: '' }))}
                  title="Posição raiz"
                  subtitle="Nova prateleira, gaveta ou área no corredor"
                  icon="🗄️"
                />
                <RadioCard
                  selected={wizard.estruturaTipo === 'child'}
                  onClick={() => setWizard(w => ({ ...w, estruturaTipo: 'child', parent_id: '' }))}
                  title="Dentro de uma estrutura existente"
                  subtitle="Posição filha (ex.: coluna dentro da prateleira)"
                  icon="📦"
                />
              </div>
              {wizard.estruturaTipo === 'child' && (
                <div className="almox-field" style={{ marginTop: 20 }}>
                  <label className="almox-label">Estrutura pai (apenas em {wizard.setor})</label>
                  <select
                    className="almox-select"
                    value={wizard.parent_id}
                    onChange={e => setWizard(w => ({ ...w, parent_id: e.target.value, subgrupo: '' }))}
                  >
                    <option value="">Selecione a estrutura pai...</option>
                    {parentOptionsForSetor(wizard.setor).map(l => (
                      <option key={l.id} value={l.id}>
                        {l.codigo} — {l.subgrupo || l.descricao || l.tipo || 'Sem descrição'}
                      </option>
                    ))}
                  </select>
                  {parentOptionsForSetor(wizard.setor).length === 0 && (
                    <p className="almox-wizard-error-inline">Nenhuma estrutura neste setor. Volte e escolha &quot;Posição raiz&quot; ou outro setor.</p>
                  )}
                </div>
              )}
            </div>
          )}

          {wizardStep === 3 && (
            <div className="almox-wizard-step">
              <h4>Detalhes</h4>
              {wizard.estruturaTipo === 'root' && (
                <div className="almox-field" style={{ marginBottom: 16 }}>
                  <label className="almox-label">Tipo de área<span className="required">*</span></label>
                  <select className="almox-select" value={wizard.tipo} onChange={e => setWizard(w => ({ ...w, tipo: e.target.value }))}>
                    {(tiposLoc.length ? tiposAreaRaiz.filter(t => tiposLoc.includes(t) || TIPOS_AREA_RAIZ.includes(t)) : tiposAreaRaiz).map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
              )}
              {wizard.estruturaTipo === 'child' && (
                <div className="almox-field" style={{ marginBottom: 16 }}>
                  <label className="almox-label">Subgrupo<span className="required">*</span></label>
                  <select className="almox-select" value={wizard.subgrupo || subgrupoOptions[0] || ''} onChange={e => setWizard(w => ({ ...w, subgrupo: e.target.value }))}>
                    {subgrupoOptions.map(sg => (
                      <option key={sg} value={sg}>{sg}</option>
                    ))}
                  </select>
                  <p className="almox-wizard-hint">Sugestão automática com base nas posições irmãs (A1, A2, B1...).</p>
                </div>
              )}
              <div className="almox-field" style={{ marginBottom: 16 }}>
                <label className="almox-label">Descrição <span style={{ fontWeight: 400, color: 'var(--gmp-text-light)' }}>(opcional)</span></label>
                <input
                  className="almox-input"
                  value={wizard.descricao}
                  onChange={e => setWizard(w => ({ ...w, descricao: e.target.value }))}
                  placeholder={suggestDescricao({
                    setor: wizard.setor,
                    tipo: wizard.tipo,
                    parent_id: wizard.parent_id ? parseInt(wizard.parent_id, 10) : null,
                    subgrupo: wizard.subgrupo || subgrupoOptions[0],
                  }, localizacoes) || 'Descrição da posição'}
                />
              </div>
              <div className="almox-field">
                <label className="almox-label">Código</label>
                <input className="almox-input" value={computeWizardDetails(wizard).codigo} readOnly style={{ fontFamily: 'monospace', fontWeight: 700, color: '#4facfe', opacity: 0.9 }} />
                <p className="almox-wizard-hint">Gerado automaticamente — não editável no cadastro.</p>
              </div>
            </div>
          )}

          {wizardStep === 4 && (
            <div className="almox-wizard-step">
              <h4>Confirmação</h4>
              <div className="almox-wizard-confirm-box">
                <div className="almox-wizard-confirm-path">
                  <span className="almox-wizard-confirm-label">Caminho completo</span>
                  <strong>{formatLocalizacaoPath(preview, localizacoes)} / {preview.codigo}</strong>
                </div>
                <dl className="almox-wizard-confirm-dl">
                  <dt>Código</dt><dd style={{ fontFamily: 'monospace', color: '#4facfe' }}>{preview.codigo}</dd>
                  <dt>Setor</dt><dd>{preview.setor}</dd>
                  <dt>Tipo</dt><dd>{preview.tipo}</dd>
                  {preview.subgrupo && <><dt>Subgrupo</dt><dd>{preview.subgrupo}</dd></>}
                  <dt>Descrição</dt><dd>{preview.descricao || '—'}</dd>
                </dl>
              </div>
              <button type="button" className="btn-almox-secondary" style={{ marginTop: 12, fontSize: '0.8rem' }} onClick={() => setShowMapaStep(v => !v)}>
                {showMapaStep ? 'Ocultar posição no mapa' : 'Definir posição no mapa (opcional)'}
              </button>
              {showMapaStep && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 14, marginTop: 12 }}>
                  {['pos_x', 'pos_y', 'largura', 'altura'].map(campo => (
                    <div key={campo} className="almox-field">
                      <label className="almox-label">{campo === 'pos_x' ? 'Posição X' : campo === 'pos_y' ? 'Posição Y' : campo === 'largura' ? 'Largura' : 'Altura'}</label>
                      <input className="almox-input" type="number" min="0" value={wizard[campo]} onChange={e => setWizard(w => ({ ...w, [campo]: e.target.value }))} />
                    </div>
                  ))}
                </div>
              )}
              <p className="almox-wizard-hint" style={{ marginTop: 8 }}>
                Ou ajuste a posição depois em <Link to="/almoxarifado/mapa">Mapa de Áreas</Link>.
              </p>
            </div>
          )}

          {wizardError && <p className="almox-wizard-error">{wizardError}</p>}

          <div className="almox-wizard-actions">
            {wizardStep > 1 && (
              <button type="button" className="btn-almox-secondary" onClick={handleWizardBack}>
                <FiArrowLeft size={14} /> Voltar
              </button>
            )}
            <div style={{ flex: 1 }} />
            {wizardStep < 4 ? (
              <button
                type="button"
                className="btn-almox-primary"
                onClick={handleWizardNext}
                disabled={
                  (wizardStep === 1 && !wizard.setor) ||
                  (wizardStep === 2 && (!wizard.estruturaTipo || (wizard.estruturaTipo === 'child' && !wizard.parent_id))) ||
                  (wizardStep === 3 && wizard.estruturaTipo === 'root' && !wizard.tipo)
                }
              >
                Próximo <FiArrowRight size={14} />
              </button>
            ) : (
              <button type="button" className="btn-almox-primary" onClick={handleWizardConfirm} disabled={saving}>
                <FiCheck size={14} /> {saving ? 'Cadastrando...' : 'Confirmar cadastro'}
              </button>
            )}
          </div>
        </div>
      )}

      {showEdit && editLoc && (
        <div className="almox-wizard-panel">
          <div className="almox-wizard-header">
            <h3>Editar Localização</h3>
            <button type="button" className="almox-btn-icon" onClick={resetEdit}><FiX size={16} /></button>
          </div>
          <p className="almox-wizard-hint">Código, setor e estrutura pai não podem ser alterados aqui. Use &quot;Mover&quot; para relocar.</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 14, marginBottom: 16 }}>
            <div className="almox-field">
              <label className="almox-label">Código</label>
              <input className="almox-input" value={editLoc.codigo} readOnly style={{ fontFamily: 'monospace', opacity: 0.7 }} />
            </div>
            <div className="almox-field">
              <label className="almox-label">Setor</label>
              <input className="almox-input" value={editLoc.setor || '—'} readOnly style={{ opacity: 0.7 }} />
            </div>
            <div className="almox-field">
              <label className="almox-label">Caminho</label>
              <input className="almox-input" value={formatLocalizacaoPath(editLoc, localizacoes)} readOnly style={{ opacity: 0.7 }} />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 16 }}>
            <div className="almox-field">
              <label className="almox-label">Descrição</label>
              <input className="almox-input" value={editForm.descricao} onChange={e => setEditForm(f => ({ ...f, descricao: e.target.value }))} />
            </div>
            <div className="almox-field">
              <label className="almox-label">Tipo de área</label>
              <select className="almox-select" value={editForm.tipo} onChange={e => setEditForm(f => ({ ...f, tipo: e.target.value }))}>
                {tiposEdit.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button className="btn-almox-primary" onClick={handleSalvarEdit} disabled={saving}>
              <FiSave size={14} /> {saving ? 'Salvando...' : 'Salvar'}
            </button>
            <button className="btn-almox-secondary" onClick={() => startMover(editLoc)}>
              <FiMove size={14} /> Mover localização
            </button>
            <button className="btn-almox-secondary" onClick={resetEdit}>Cancelar</button>
          </div>
        </div>
      )}

      {moverLoc && (
        <div className="almox-wizard-panel almox-wizard-panel-mover">
          <div className="almox-wizard-header">
            <h3>Mover: {moverLoc.codigo}</h3>
            <button type="button" className="almox-btn-icon" onClick={resetMover}><FiX size={16} /></button>
          </div>
          <WizardProgress step={moverStep} total={3} />

          {moverStep === 1 && (
            <div className="almox-wizard-step">
              <h4>Novo setor</h4>
              <div className="almox-wizard-setor-grid">
                {setoresOptions.map(s => (
                  <RadioCard
                    key={s.nome}
                    selected={moverData.setor === s.nome}
                    onClick={() => setMoverData(d => ({ ...d, setor: s.nome, parent_id: '', estruturaTipo: '' }))}
                    title={s.nome}
                    subtitle={s.codigo_prefixo ? `Códigos ${s.codigo_prefixo}-01…` : setorTipoLabel(s.tipo)}
                    icon={s.icon}
                  />
                ))}
              </div>
            </div>
          )}

          {moverStep === 2 && (
            <div className="almox-wizard-step">
              <h4>Estrutura no novo setor</h4>
              <div className="almox-wizard-cards-row">
                <RadioCard
                  selected={moverData.estruturaTipo === 'root'}
                  onClick={() => setMoverData(d => ({ ...d, estruturaTipo: 'root', parent_id: '' }))}
                  title="Posição raiz"
                  subtitle="Sem estrutura pai"
                  icon="🗄️"
                />
                <RadioCard
                  selected={moverData.estruturaTipo === 'child'}
                  onClick={() => setMoverData(d => ({ ...d, estruturaTipo: 'child', parent_id: '' }))}
                  title="Dentro de estrutura existente"
                  icon="📦"
                />
              </div>
              {moverData.estruturaTipo === 'child' && (
                <div className="almox-field" style={{ marginTop: 16 }}>
                  <label className="almox-label">Estrutura pai</label>
                  <select className="almox-select" value={moverData.parent_id} onChange={e => setMoverData(d => ({ ...d, parent_id: e.target.value }))}>
                    <option value="">Selecione...</option>
                    {moverParents.map(l => (
                      <option key={l.id} value={l.id}>{l.codigo} — {l.descricao || l.subgrupo || l.tipo}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          )}

          {moverStep === 3 && moverPreview && (
            <div className="almox-wizard-step">
              <h4>Confirmar movimentação</h4>
              <div className="almox-wizard-confirm-box">
                <p><span className="almox-wizard-confirm-label">Código atual</span> <s>{moverLoc.codigo}</s></p>
                <p><span className="almox-wizard-confirm-label">Novo código</span> <strong style={{ fontFamily: 'monospace', color: '#4facfe' }}>{moverPreview.codigo}</strong></p>
                <p><span className="almox-wizard-confirm-label">Novo caminho</span>{' '}
                  <strong>{formatLocalizacaoPath({
                    setor: moverData.setor,
                    subgrupo: moverPreview.subgrupo,
                    parent_id: moverPreview.parentId,
                  }, localizacoes)} / {moverPreview.codigo}</strong>
                </p>
              </div>
            </div>
          )}

          {moverError && <p className="almox-wizard-error">{moverError}</p>}

          <div className="almox-wizard-actions">
            {moverStep > 1 && (
              <button type="button" className="btn-almox-secondary" onClick={() => { setMoverError(''); setMoverStep(s => s - 1); }}>
                <FiArrowLeft size={14} /> Voltar
              </button>
            )}
            <div style={{ flex: 1 }} />
            {moverStep < 3 ? (
              <button
                type="button"
                className="btn-almox-primary"
                onClick={() => {
                  setMoverError('');
                  if (moverStep === 1 && !moverData.setor) { setMoverError('Selecione o novo setor.'); return; }
                  if (moverStep === 2 && !moverData.estruturaTipo) { setMoverError('Escolha o tipo de estrutura.'); return; }
                  if (moverStep === 2 && moverData.estruturaTipo === 'child' && !moverData.parent_id) {
                    setMoverError('Selecione a estrutura pai.'); return;
                  }
                  setMoverStep(s => s + 1);
                }}
                disabled={moverStep === 1 && !moverData.setor}
              >
                Próximo <FiArrowRight size={14} />
              </button>
            ) : (
              <button type="button" className="btn-almox-primary" onClick={handleMoverConfirm} disabled={saving}>
                <FiCheck size={14} /> {saving ? 'Movendo...' : 'Confirmar movimentação'}
              </button>
            )}
          </div>
        </div>
      )}

      {loading ? (
        <div className="almox-loading"><FiRefreshCw size={16} style={{ animation: 'spin 1s linear infinite' }} /> Carregando...</div>
      ) : (
        <div className="almox-table-container">
          <table className="almox-table">
            <thead><tr><th>Código</th><th>Descrição</th><th>Subgrupo</th><th>Caminho</th><th>Tipo</th><th>Setor</th><th></th></tr></thead>
            <tbody>
              {localizacoes.map(loc => (
                <tr key={loc.id}>
                  <td><span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#4facfe' }}>{loc.codigo}</span></td>
                  <td>{loc.descricao || '—'}</td>
                  <td>{loc.subgrupo ? <span style={{ fontFamily: 'monospace', fontSize: '0.85rem', fontWeight: 600 }}>{loc.subgrupo}</span> : '—'}</td>
                  <td style={{ fontSize: '0.8rem', color: 'var(--gmp-text-light)' }}>{formatLocalizacaoPath(loc, localizacoes)}</td>
                  <td><span style={{ fontSize: '0.8rem', background: 'rgba(79,172,254,0.1)', color: '#4facfe', padding: '2px 10px', borderRadius: 6 }}>{loc.tipo || 'Almoxarifado'}</span></td>
                  <td>{loc.setor ? <span style={{ fontSize: '0.8rem', background: 'var(--gmp-bg)', border: '1px solid var(--gmp-border)', borderRadius: 6, padding: '2px 10px' }}>{loc.setor}</span> : '—'}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                      <button className="almox-btn-icon" onClick={() => handleEditar(loc)} title="Editar"><FiEdit2 size={13} /></button>
                      <button className="almox-btn-icon" onClick={() => startMover(loc)} title="Mover"><FiMove size={13} /></button>
                      <button className="almox-btn-icon danger" onClick={() => handleDeletar(loc.id)} title="Excluir"><FiTrash2 size={13} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

/* ===================== TAB CONFIGURAÇÕES GERAIS ===================== */
const TabConfiguracoes = () => {
  const [configs, setConfigs] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const CAMPOS = [
    { chave: 'aprovacao_automatica', label: 'Aprovação Automática', tipo: 'boolean', descricao: 'Requisições normais são aprovadas automaticamente (exceto CRÍTICO)' },
    { chave: 'prazo_atendimento_horas', label: 'Prazo de Atendimento (horas)', tipo: 'number', descricao: 'Tempo máximo para atender uma requisição normal' },
    { chave: 'prazo_urgente_horas', label: 'Prazo Urgente (horas)', tipo: 'number', descricao: 'Tempo máximo para atender uma requisição urgente' },
    { chave: 'prazo_critico_horas', label: 'Prazo Crítico (horas)', tipo: 'number', descricao: 'Tempo máximo para atender uma requisição crítica' },
    { chave: 'alerta_estoque_email', label: 'E-mail para Alertas de Estoque', tipo: 'text', descricao: 'Será notificado quando estoque crítico for detectado' },
    { chave: 'prefixo_codigo_material', label: 'Prefixo do Código de Material', tipo: 'text', descricao: 'Prefixo usado na geração automática de códigos (ex: MAT, ALM)' },
    { chave: 'permitir_saida_saldo_negativo', label: 'Permitir Saída com Saldo Negativo', tipo: 'boolean', descricao: 'Permite registrar saída mesmo sem saldo disponível' },
    { chave: 'requer_os_requisicao', label: 'OS Obrigatória na Requisição', tipo: 'boolean', descricao: 'Exige referência de Ordem de Serviço em toda requisição' },
  ];

  useEffect(() => { loadConfigs(); }, []);
  const loadConfigs = async () => {
    setLoading(true);
    try {
      const res = await api.get('/almoxarifado/configuracoes');
      const map = {};
      res.data.forEach(c => { map[c.chave] = c.valor; });
      setConfigs(map);
    } catch { toast.error('Erro ao carregar configurações'); } finally { setLoading(false); }
  };

  const handleSalvar = async () => {
    setSaving(true);
    try {
      await api.put('/almoxarifado/configuracoes', { configuracoes: Object.entries(configs).map(([chave, valor]) => ({ chave, valor: String(valor) })) });
      toast.success('Configurações salvas!');
    } catch (err) { toast.error(err.response?.data?.error || 'Erro'); } finally { setSaving(false); }
  };

  if (loading) return <div className="almox-loading"><FiRefreshCw size={16} style={{ animation: 'spin 1s linear infinite' }} /> Carregando...</div>;

  return (
    <div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 700 }}>
        {CAMPOS.map(campo => (
          <div key={campo.chave} style={{ background: 'var(--gmp-surface)', border: '1px solid var(--gmp-border)', borderRadius: 10, padding: '14px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 20 }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--gmp-text)' }}>{campo.label}</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--gmp-text-light)', marginTop: 2 }}>{campo.descricao}</div>
            </div>
            {campo.tipo === 'boolean' ? (
              <label className="switch" style={{ flexShrink: 0 }}>
                <input type="checkbox" checked={configs[campo.chave] === '1'}
                  onChange={e => setConfigs(c => ({ ...c, [campo.chave]: e.target.checked ? '1' : '0' }))} />
                <span className="slider" />
              </label>
            ) : (
              <input className="almox-input" style={{ width: 180, flexShrink: 0 }}
                type={campo.tipo === 'number' ? 'number' : 'text'}
                value={configs[campo.chave] || ''}
                onChange={e => setConfigs(c => ({ ...c, [campo.chave]: e.target.value }))} />
            )}
          </div>
        ))}
      </div>

      <button className="btn-almox-primary" style={{ marginTop: 24 }} onClick={handleSalvar} disabled={saving}>
        <FiSave size={14} /> {saving ? 'Salvando...' : 'Salvar Configurações'}
      </button>
    </div>
  );
};

export default ConfiguracoesAlmoxarifado;
