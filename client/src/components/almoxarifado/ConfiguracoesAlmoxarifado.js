import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../../services/api';
import { toast } from 'react-toastify';
import { useAuth } from '../../context/AuthContext';
import { canConfigureAlmox, filterVisibleUsers } from '../../utils/systemPermissions';
import { getEffectiveUser } from '../../services/permissionsCache';
import {
  FiSave, FiPlus, FiTrash2, FiEdit2, FiCheck, FiX,
  FiPackage, FiSliders, FiMapPin, FiSettings,
  FiShield, FiRefreshCw, FiArrowLeft, FiArrowRight, FiMove,
  FiLayers, FiChevronDown, FiChevronRight, FiGrid, FiBell, FiSend, FiMail, FiMessageCircle, FiUsers, FiClipboard, FiShoppingCart, FiDollarSign
} from 'react-icons/fi';
import { useSearchParams } from 'react-router-dom';
import { prefixarAlmoxarifado, buildLocalizacaoPath } from '../../utils/localizacaoLabel';
import { invalidarAlmoxPermissoes } from '../../hooks/useAlmoxPermissoes';
import './Almoxarifado.css';

const ICONES = ['📦', '🔧', '🪛', '⚙️', '🛡️', '🧰', '🪝', '💡', '🔩', '🪜', '🧪', '🏗️', '🔌', '🧲', '📋'];
const CORES = ['#4facfe', '#00f2fe', '#43e97b', '#f9a825', '#ef5350', '#ab47bc', '#26c6da', '#ff7043', '#78909c', '#5c6bc0'];

// Deliberadamente SEM o almoxarifado: esta tela já tem uma coluna dedicada
// ("Almoxarifado", com loc.almoxarifado_codigo) ao lado da coluna "Caminho" — prefixar
// aqui duplicaria o dado na mesma linha.
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

const formatTipoMaterial = (tipo) => String(tipo || '')
  .replace(/_/g, ' ')
  .replace(/^./, c => c.toUpperCase());

const parseTiposPermitidos = (raw) => {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
};

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
  { id: 'materiais-setor', label: 'Materiais por Setor', icon: FiUsers },
  { id: 'estoques', label: 'Estoques Mínimos', icon: FiSliders },
  { id: 'setores', label: 'Setores e Áreas', icon: FiGrid },
  { id: 'localizacoes', label: 'Localizações', icon: FiMapPin },
  { id: 'alertas', label: 'Alertas de Estoque', icon: FiBell },
  { id: 'liberacao-valor', label: 'Liberação por Valor', icon: FiDollarSign },
  { id: 'perfis', label: 'Perfis de Acesso', icon: FiShield },
  { id: 'geral', label: 'Configurações Gerais', icon: FiSettings },
];

const ConfiguracoesAlmoxarifado = () => {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const isAdmin = canConfigureAlmox(getEffectiveUser(user));
  const initialTab = searchParams.get('tab');
  const [tab, setTab] = useState(
    initialTab && TABS.some(t => t.id === initialTab) ? initialTab : 'tipos'
  );

  if (!isAdmin) {
    return (
      <div className="almox-page">
        <div className="almox-empty" style={{ padding: 60, textAlign: 'center' }}>
          <FiShield size={48} style={{ color: '#4facfe', opacity: 0.5, display: 'block', margin: '0 auto 16px' }} />
          <h2 style={{ margin: '0 0 8px', fontSize: '1.1rem' }}>Acesso restrito — administrador do Almoxarifado</h2>
          <p style={{ color: 'var(--gmp-text-light)', fontSize: '0.9rem', maxWidth: 420, margin: '0 auto' }}>
            As configurações do almoxarifado são exclusivas para administradores do módulo ou Super Administradores.
          </p>
          <Link to="/almoxarifado" className="btn-almox-secondary" style={{ marginTop: 24, display: 'inline-flex' }}>
            <FiArrowLeft size={14} /> Voltar ao Dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="almox-page">
      <div className="almox-header">
        <div>
          <h1 style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <FiSettings size={22} style={{ color: '#4facfe' }} /> Configurações do Almoxarifado
          </h1>
          <p>
            Gerencie tipos de material, famílias, estoques mínimos, setores, localizações e configurações gerais
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(79,172,254,0.1)', border: '1px solid rgba(79,172,254,0.2)', borderRadius: 8, padding: '6px 12px', fontSize: '0.8rem', color: '#4facfe' }}>
          <FiShield size={14} /> Somente Administradores
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--gmp-border)', marginBottom: 24 }}>
        {TABS.map(t => {
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
      {tab === 'materiais-setor' && <TabMateriaisPorSetor />}
      {tab === 'estoques' && <TabEstoquesMinimos />}
      {tab === 'setores' && <TabSetores />}
      {tab === 'localizacoes' && <TabLocalizacoes />}
      {tab === 'alertas' && <TabAlertasEstoque />}
      {tab === 'liberacao-valor' && <TabLiberacaoValor />}
      {tab === 'perfis' && <TabPerfisAcesso />}
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
  const [form, setForm] = useState({ nome: '', descricao: '', codigo: '', tipo_uso: 'ambos' });
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
    setForm({ nome: '', descricao: '', codigo: '', tipo_uso: 'ambos' });
    setEditando(null);
    setShowForm(false);
  };

  const handleEditar = (fam) => {
    setForm({
      nome: fam.nome,
      descricao: fam.descricao || '',
      codigo: fam.codigo,
      tipo_uso: fam.tipo_uso || 'ambos',
    });
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
          tipo_uso: form.tipo_uso,
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
            <div className="almox-field">
              <label className="almox-label">Tipo de uso<span className="required">*</span></label>
              <select className="almox-form-select" value={form.tipo_uso}
                onChange={e => setForm(f => ({ ...f, tipo_uso: e.target.value }))}>
                <option value="administrativo">Administrativo (escritório, EPI, consumíveis)</option>
                <option value="industrial">Industrial (fábrica, manutenção)</option>
                <option value="ambos">Ambos</option>
              </select>
            </div>
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
                      {fam.tipo_uso && fam.tipo_uso !== 'ambos' && (
                        <span style={{
                          fontSize: '0.7rem', padding: '2px 8px', borderRadius: 20, fontWeight: 600,
                          background: fam.tipo_uso === 'administrativo' ? 'rgba(46,204,113,0.12)' : 'rgba(229,152,0,0.12)',
                          color: fam.tipo_uso === 'administrativo' ? '#27ae60' : '#e59800',
                        }}>
                          {fam.tipo_uso === 'administrativo' ? 'ADM' : 'IND'}
                        </span>
                      )}
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
                              <td style={{ color: 'var(--gmp-text-light)', fontSize: '0.8rem' }}>
                                {prefixarAlmoxarifado(item.localizacao, item.almoxarifado_codigo) || '—'}
                              </td>
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
                        <input className="almox-count-input" type="number" min="0" step="1"
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

/* ===================== BLOCO ALMOXARIFADOS (topo da aba Setores e Áreas) ===================== */
const ALMOXARIFADO_FORM_INITIAL = { codigo: '', nome: '', descricao: '' };

const AlmoxarifadosSection = () => {
  const [almoxarifados, setAlmoxarifados] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editando, setEditando] = useState(null);
  const [form, setForm] = useState(ALMOXARIFADO_FORM_INITIAL);

  useEffect(() => { loadAlmoxarifados(); }, []);

  const loadAlmoxarifados = async () => {
    setLoading(true);
    try {
      const res = await api.get('/almoxarifado/almoxarifados?todos=1');
      setAlmoxarifados(res.data);
    } catch { toast.error('Erro ao carregar almoxarifados'); }
    finally { setLoading(false); }
  };

  const resetForm = () => {
    setForm(ALMOXARIFADO_FORM_INITIAL);
    setEditando(null);
    setShowForm(false);
  };

  const handleEditar = (alm) => {
    setForm({ codigo: alm.codigo, nome: alm.nome, descricao: alm.descricao || '' });
    setEditando(alm.id);
    setShowForm(true);
  };

  const handleSalvar = async () => {
    if (!form.codigo.trim()) { toast.error('Código é obrigatório'); return; }
    if (!form.nome.trim()) { toast.error('Nome é obrigatório'); return; }
    setSaving(true);
    try {
      const payload = {
        codigo: form.codigo.trim().toUpperCase(),
        nome: form.nome.trim(),
        descricao: form.descricao.trim() || null,
      };
      if (editando) {
        await api.put(`/almoxarifado/almoxarifados/${editando}`, payload);
        toast.success('Almoxarifado atualizado!');
      } else {
        await api.post('/almoxarifado/almoxarifados', payload);
        toast.success('Almoxarifado criado!');
      }
      resetForm();
      loadAlmoxarifados();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao salvar');
    } finally { setSaving(false); }
  };

  const handleInativar = async (alm) => {
    if (!window.confirm(`Inativar o almoxarifado "${alm.nome}"?`)) return;
    try {
      await api.put(`/almoxarifado/almoxarifados/${alm.id}`, { ativo: 0 });
      toast.success('Almoxarifado inativado');
      loadAlmoxarifados();
    } catch (err) {
      // Backend recusa (400) quando existem localizações ativas vinculadas — mensagem exibida direto no toast.
      toast.error(err.response?.data?.error || 'Erro ao inativar');
    }
  };

  return (
    <div style={{ marginBottom: 32 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 12 }}>
        <h3 style={{ margin: 0, fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: 8, color: 'var(--gmp-text)' }}>
          <FiPackage size={16} style={{ color: '#4facfe' }} /> Almoxarifados
        </h3>
        {!showForm && (
          <button className="btn-almox-primary" onClick={() => setShowForm(true)}>
            <FiPlus size={14} /> Novo Almoxarifado
          </button>
        )}
      </div>
      <p style={{ fontSize: '0.85rem', color: 'var(--gmp-text-light)', marginBottom: 16, maxWidth: 720 }}>
        Cada almoxarifado é um depósito independente (ex.: unidade, obra, filial). Localizações são vinculadas a um almoxarifado.
      </p>

      {showForm && (
        <div style={{ background: 'var(--gmp-surface)', border: '1px solid rgba(79,172,254,0.25)', borderRadius: 12, padding: 24, marginBottom: 20 }}>
          <div style={{ fontWeight: 700, fontSize: '0.9rem', marginBottom: 18, color: 'var(--gmp-text)' }}>
            {editando ? '✏️ Editar Almoxarifado' : '➕ Novo Almoxarifado'}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
            <div className="almox-field">
              <label className="almox-label">Código<span className="required">*</span></label>
              <input className="almox-input" value={form.codigo}
                onChange={e => setForm(f => ({ ...f, codigo: e.target.value.toUpperCase() }))}
                placeholder="Ex: ALM-02" style={{ fontFamily: 'monospace' }} maxLength={20} />
            </div>
            <div className="almox-field">
              <label className="almox-label">Nome<span className="required">*</span></label>
              <input className="almox-input" value={form.nome}
                onChange={e => setForm(f => ({ ...f, nome: e.target.value }))}
                placeholder="Ex: Almoxarifado Filial Sul" />
            </div>
            <div className="almox-field" style={{ gridColumn: '1 / -1' }}>
              <label className="almox-label">Descrição</label>
              <input className="almox-input" value={form.descricao}
                onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))}
                placeholder="Descrição breve (opcional)" />
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
              <tr><th>Código</th><th>Nome</th><th>Descrição</th><th>Status</th><th style={{ textAlign: 'right' }}>Ações</th></tr>
            </thead>
            <tbody>
              {almoxarifados.map(a => (
                <tr key={a.id} style={{ opacity: a.ativo ? 1 : 0.55 }}>
                  <td><span style={{ fontFamily: 'monospace', color: '#4facfe', fontWeight: 700 }}>{a.codigo}</span></td>
                  <td style={{ fontWeight: 600 }}>{a.nome}</td>
                  <td style={{ color: 'var(--gmp-text-light)', fontSize: '0.85rem' }}>{a.descricao || '—'}</td>
                  <td>
                    <span className={`almox-badge almox-badge-${a.ativo ? 'ok' : 'critico'}`}>
                      {a.ativo ? 'Ativo' : 'Inativo'}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                      <button className="almox-btn-icon" onClick={() => handleEditar(a)} title="Editar"><FiEdit2 size={13} /></button>
                      {!!a.ativo && (
                        <button className="almox-btn-icon danger" onClick={() => handleInativar(a)} title="Inativar">
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
      <AlmoxarifadosSection />
      <div style={{ borderTop: '1px solid var(--gmp-border)', margin: '0 0 24px' }} />
      <h3 style={{ margin: '0 0 4px', fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: 8, color: 'var(--gmp-text)' }}>
        <FiGrid size={16} style={{ color: '#4facfe' }} /> Setores e Áreas
      </h3>
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
  almoxarifado_id: '',
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
  const [tiposMaterial, setTiposMaterial] = useState([]);
  const [almoxarifados, setAlmoxarifados] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [showWizard, setShowWizard] = useState(false);
  const [wizardStep, setWizardStep] = useState(1);
  const [wizard, setWizard] = useState(WIZARD_INITIAL);
  const [wizardError, setWizardError] = useState('');
  const [showMapaStep, setShowMapaStep] = useState(false);

  const [editando, setEditando] = useState(null);
  const [editForm, setEditForm] = useState({ descricao: '', tipo: 'Almoxarifado', almoxarifado_id: '', bloqueada: false, tipos_material_permitidos: [] });
  const [showEdit, setShowEdit] = useState(false);

  const [moverLoc, setMoverLoc] = useState(null);
  const [moverStep, setMoverStep] = useState(1);
  const [moverData, setMoverData] = useState({ setor: '', estruturaTipo: '', parent_id: '', subgrupo: '', codigo: '' });
  const [moverError, setMoverError] = useState('');

  useEffect(() => { loadLocs(); loadTipos(); loadSetores(); loadAlmoxarifados(); }, []);

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
      setTiposMaterial(r.data.tipos || []);
    } catch { /* ignore */ }
  };
  const loadAlmoxarifados = async () => {
    try {
      const r = await api.get('/almoxarifado/almoxarifados');
      setAlmoxarifados(r.data);
    } catch { /* ignore — select fica vazio, PUT preserva o vínculo atual */ }
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

  // almoxarifadoId é opcional: o wizard passa (uma posição filha não pode ter pai em outro
  // almoxarifado); o fluxo de "mover" omite, para não mudar o comportamento que já existia.
  const parentOptionsForSetor = (setor, excludeId, almoxarifadoId) => localizacoes.filter(l => {
    if (excludeId && l.id === excludeId) return false;
    if (setor && l.setor !== setor) return false;
    if (almoxarifadoId && String(l.almoxarifado_id ?? '') !== String(almoxarifadoId)) return false;
    return true;
  });

  const wizardParentOptions = parentOptionsForSetor(wizard.setor, null, wizard.almoxarifado_id);
  const almoxarifadosAtivos = almoxarifados.filter(a => a.ativo !== 0);
  const almoxarifadoSelecionado = almoxarifados.find(a => String(a.id) === String(wizard.almoxarifado_id));

  const resetWizard = () => {
    setWizard(WIZARD_INITIAL);
    setWizardStep(1);
    setWizardError('');
    setShowMapaStep(false);
    setShowWizard(false);
  };

  // Com um único almoxarifado cadastrado o passo 1 não tem escolha a fazer — pré-seleciona
  // para não virar um clique obrigatório em quem nunca vai ter mais de um depósito.
  const abrirWizard = () => {
    const ativos = almoxarifados.filter(a => a.ativo !== 0);
    setWizard({
      ...WIZARD_INITIAL,
      almoxarifado_id: ativos.length === 1 ? String(ativos[0].id) : '',
    });
    setWizardStep(1);
    setWizardError('');
    setShowMapaStep(false);
    setShowWizard(true);
  };

  const resetEdit = () => {
    setEditando(null);
    setEditForm({ descricao: '', tipo: 'Almoxarifado', almoxarifado_id: '', bloqueada: false, tipos_material_permitidos: [] });
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
      if (!wizard.almoxarifado_id) { setWizardError('Selecione o almoxarifado onde a localização será criada.'); return false; }
      return true;
    }
    if (step === 2) {
      if (!wizard.setor) { setWizardError('Selecione o setor ou corredor onde a localização fica.'); return false; }
      return true;
    }
    if (step === 3) {
      if (!wizard.estruturaTipo) { setWizardError('Escolha se é uma posição raiz ou dentro de uma estrutura existente.'); return false; }
      if (wizard.estruturaTipo === 'child' && !wizard.parent_id) {
        setWizardError('Selecione a estrutura pai dentro do setor escolhido.');
        return false;
      }
      if (wizard.estruturaTipo === 'child' && wizardParentOptions.length === 0) {
        setWizardError('Não há estruturas neste setor dentro deste almoxarifado. Cadastre uma posição raiz primeiro.');
        return false;
      }
      return true;
    }
    if (step === 4) {
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
    if (wizardStep === 3 || wizardStep === 4) {
      const computed = computeWizardDetails(wizard);
      setWizard(w => ({ ...w, subgrupo: computed.subgrupo, codigo: computed.codigo, descricao: w.descricao || computed.descricao }));
    }
    setWizardStep(s => Math.min(s + 1, 5));
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
        almoxarifado_id: wizard.almoxarifado_id ? parseInt(wizard.almoxarifado_id, 10) : null,
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
    setEditForm({
      descricao: loc.descricao || '',
      tipo: loc.tipo || 'Almoxarifado',
      almoxarifado_id: loc.almoxarifado_id != null ? String(loc.almoxarifado_id) : '',
      bloqueada: !!loc.bloqueada,
      tipos_material_permitidos: parseTiposPermitidos(loc.tipos_material_permitidos),
    });
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
        almoxarifado_id: editForm.almoxarifado_id ? parseInt(editForm.almoxarifado_id, 10) : null,
        bloqueada: !!editForm.bloqueada,
        tipos_material_permitidos: editForm.tipos_material_permitidos,
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
          <button className="btn-almox-primary" onClick={() => { resetEdit(); resetMover(); abrirWizard(); }}>
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
          <WizardProgress step={wizardStep} total={5} />

          {wizardStep === 1 && (
            <div className="almox-wizard-step">
              <h4>Em qual almoxarifado?</h4>
              <p className="almox-wizard-hint">
                A localização nasce vinculada a este depósito. Para criar um novo, use o bloco
                {' '}<strong>Almoxarifados</strong> na aba <strong>Setores e Áreas</strong>.
              </p>
              {almoxarifadosAtivos.length === 0 ? (
                <p className="almox-wizard-error-inline">
                  Nenhum almoxarifado ativo cadastrado. Cadastre um em &quot;Setores e Áreas&quot; antes de criar localizações.
                </p>
              ) : (
                <div className="almox-wizard-setor-grid">
                  {almoxarifadosAtivos.map(a => (
                    <RadioCard
                      key={a.id}
                      selected={String(wizard.almoxarifado_id) === String(a.id)}
                      onClick={() => setWizard(w => ({
                        ...w,
                        almoxarifado_id: String(a.id),
                        // trocar de almoxarifado invalida o pai escolhido (ele é de outro depósito)
                        parent_id: '',
                        estruturaTipo: '',
                        subgrupo: '',
                      }))}
                      title={a.codigo}
                      subtitle={a.nome}
                      icon="🏭"
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {wizardStep === 2 && (
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

          {wizardStep === 3 && (
            <div className="almox-wizard-step">
              <h4>Tipo de estrutura</h4>
              <p className="almox-wizard-hint">
                Almoxarifado: <strong>{almoxarifadoSelecionado?.codigo || '—'}</strong>
                {' · '}Setor selecionado: <strong>{wizard.setor}</strong>
              </p>
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
                    {wizardParentOptions.map(l => (
                      <option key={l.id} value={l.id}>
                        {l.codigo} — {l.subgrupo || l.descricao || l.tipo || 'Sem descrição'}
                      </option>
                    ))}
                  </select>
                  {wizardParentOptions.length === 0 && (
                    <p className="almox-wizard-error-inline">Nenhuma estrutura neste setor dentro deste almoxarifado. Volte e escolha &quot;Posição raiz&quot;, outro setor ou outro almoxarifado.</p>
                  )}
                </div>
              )}
            </div>
          )}

          {wizardStep === 4 && (
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

          {wizardStep === 5 && (
            <div className="almox-wizard-step">
              <h4>Confirmação</h4>
              <div className="almox-wizard-confirm-box">
                <div className="almox-wizard-confirm-path">
                  <span className="almox-wizard-confirm-label">Caminho completo</span>
                  <strong>{formatLocalizacaoPath(preview, localizacoes)} / {preview.codigo}</strong>
                </div>
                <dl className="almox-wizard-confirm-dl">
                  <dt>Código</dt><dd style={{ fontFamily: 'monospace', color: '#4facfe' }}>{preview.codigo}</dd>
                  <dt>Almoxarifado</dt><dd>{almoxarifadoSelecionado ? `${almoxarifadoSelecionado.codigo} — ${almoxarifadoSelecionado.nome}` : '—'}</dd>
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
            {wizardStep < 5 ? (
              <button
                type="button"
                className="btn-almox-primary"
                onClick={handleWizardNext}
                disabled={
                  (wizardStep === 1 && !wizard.almoxarifado_id) ||
                  (wizardStep === 2 && !wizard.setor) ||
                  (wizardStep === 3 && (!wizard.estruturaTipo || (wizard.estruturaTipo === 'child' && !wizard.parent_id))) ||
                  (wizardStep === 4 && wizard.estruturaTipo === 'root' && !wizard.tipo)
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
            <div className="almox-field">
              <label className="almox-label">Almoxarifado</label>
              <select className="almox-select" value={editForm.almoxarifado_id}
                onChange={e => setEditForm(f => ({ ...f, almoxarifado_id: e.target.value }))}>
                <option value="">— Selecione —</option>
                {almoxarifados.map(a => (
                  <option key={a.id} value={a.id}>{a.codigo} — {a.nome}</option>
                ))}
              </select>
            </div>
            <div className="almox-field">
              <label className="almox-label" style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <input type="checkbox" checked={editForm.bloqueada}
                  onChange={e => setEditForm(f => ({ ...f, bloqueada: e.target.checked }))} />
                🔒 Localização bloqueada
              </label>
              <span style={{ fontSize: '0.72rem', color: 'var(--gmp-text-light)' }}>
                Impede movimentações de entrada e saída nesta posição.
              </span>
            </div>
          </div>
          <div className="almox-field" style={{ marginBottom: 16 }}>
            <label className="almox-label">
              Tipos de material permitidos{' '}
              <span style={{ fontWeight: 400, color: 'var(--gmp-text-light)' }}>(nenhum selecionado = qualquer tipo)</span>
            </label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 6 }}>
              {tiposMaterial.map(t => {
                const checked = editForm.tipos_material_permitidos.includes(t);
                return (
                  <label key={t} style={{
                    display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.78rem', cursor: 'pointer',
                    background: checked ? 'rgba(79,172,254,0.12)' : 'var(--gmp-bg)',
                    border: `1px solid ${checked ? '#4facfe' : 'var(--gmp-border)'}`,
                    borderRadius: 20, padding: '4px 10px',
                  }}>
                    <input type="checkbox" checked={checked} style={{ margin: 0 }}
                      onChange={() => setEditForm(f => ({
                        ...f,
                        tipos_material_permitidos: checked
                          ? f.tipos_material_permitidos.filter(x => x !== t)
                          : [...f.tipos_material_permitidos, t],
                      }))} />
                    {formatTipoMaterial(t)}
                  </label>
                );
              })}
              {tiposMaterial.length === 0 && (
                <span style={{ fontSize: '0.78rem', color: 'var(--gmp-text-light)' }}>Nenhum tipo de material cadastrado.</span>
              )}
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
            <thead><tr><th>Código</th><th>Descrição</th><th>Subgrupo</th><th>Caminho</th><th>Tipo</th><th>Setor</th><th>Almoxarifado</th><th></th></tr></thead>
            <tbody>
              {localizacoes.map(loc => (
                <tr key={loc.id}>
                  <td>
                    <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#4facfe' }}>{loc.codigo}</span>
                    {!!loc.bloqueada && <span title="Localização bloqueada" style={{ marginLeft: 6 }}>🔒</span>}
                  </td>
                  <td>{loc.descricao || '—'}</td>
                  <td>{loc.subgrupo ? <span style={{ fontFamily: 'monospace', fontSize: '0.85rem', fontWeight: 600 }}>{loc.subgrupo}</span> : '—'}</td>
                  <td style={{ fontSize: '0.8rem', color: 'var(--gmp-text-light)' }}>{formatLocalizacaoPath(loc, localizacoes)}</td>
                  <td><span style={{ fontSize: '0.8rem', background: 'rgba(79,172,254,0.1)', color: '#4facfe', padding: '2px 10px', borderRadius: 6 }}>{loc.tipo || 'Almoxarifado'}</span></td>
                  <td>{loc.setor ? <span style={{ fontSize: '0.8rem', background: 'var(--gmp-bg)', border: '1px solid var(--gmp-border)', borderRadius: 6, padding: '2px 10px' }}>{loc.setor}</span> : '—'}</td>
                  <td style={{ fontSize: '0.8rem', color: 'var(--gmp-text-light)' }}>{loc.almoxarifado_codigo || '—'}</td>
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
const TabAlertasEstoque = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testando, setTestando] = useState(false);
  const [novoEmail, setNovoEmail] = useState('');
  const [novoEmailRequisicao, setNovoEmailRequisicao] = useState('');
  const [novoEmailCompras, setNovoEmailCompras] = useState('');
  const [novoWhatsapp, setNovoWhatsapp] = useState('');
  const [config, setConfig] = useState({
    notificarEmail: true,
    notificarWhatsapp: false,
    emails: [],
    requisicoesEmails: [],
    comprasEmails: [],
    requisicoesNotificarEmail: true,
    requisicoesLembreteAtivo: true,
    requisicoesLembreteIntervaloHoras: 24,
    whatsappNumeros: [],
    intervaloVerificacaoHoras: 4,
    debounceSegundos: 60,
    appUrl: 'https://systemgmp.online',
    smtpHost: '',
    smtpPort: 587,
    smtpUser: '',
    smtpPass: '',
    smtpFrom: '',
    smtpSecure: false,
    whatsappWebhookUrl: '',
    whatsappApiKey: '',
  });
  const [smtpPassConfigured, setSmtpPassConfigured] = useState(false);
  const [whatsappApiKeyConfigured, setWhatsappApiKeyConfigured] = useState(false);

  useEffect(() => { loadConfig(); }, []);

  const loadConfig = async () => {
    setLoading(true);
    try {
      const res = await api.get('/almoxarifado/configuracoes/alertas-estoque');
      const smtpPassMasked = res.data.smtpPass === '********';
      const apiKeyMasked = res.data.whatsappApiKey === '********';
      setSmtpPassConfigured(smtpPassMasked);
      setWhatsappApiKeyConfigured(apiKeyMasked);
      setConfig({
        notificarEmail: !!res.data.notificarEmail,
        notificarWhatsapp: !!res.data.notificarWhatsapp,
        emails: Array.isArray(res.data.emails) ? res.data.emails : [],
        requisicoesEmails: Array.isArray(res.data.requisicoesEmails) ? res.data.requisicoesEmails : [],
        comprasEmails: Array.isArray(res.data.comprasEmails) ? res.data.comprasEmails : [],
        requisicoesNotificarEmail: res.data.requisicoesNotificarEmail !== false,
        requisicoesLembreteAtivo: res.data.requisicoesLembreteAtivo !== false,
        requisicoesLembreteIntervaloHoras: res.data.requisicoesLembreteIntervaloHoras || 24,
        whatsappNumeros: Array.isArray(res.data.whatsappNumeros) ? res.data.whatsappNumeros : [],
        intervaloVerificacaoHoras: res.data.intervaloVerificacaoHoras || 4,
        debounceSegundos: res.data.debounceSegundos ?? 60,
        appUrl: res.data.appUrl || 'https://systemgmp.online',
        smtpHost: res.data.smtpHost || '',
        smtpPort: res.data.smtpPort || 587,
        smtpUser: res.data.smtpUser || '',
        smtpPass: '',
        smtpFrom: res.data.smtpFrom || '',
        smtpSecure: !!res.data.smtpSecure,
        whatsappWebhookUrl: res.data.whatsappWebhookUrl || '',
        whatsappApiKey: '',
      });
    } catch {
      toast.error('Erro ao carregar configurações de alerta');
    } finally { setLoading(false); }
  };

  const addEmail = () => {
    const val = novoEmail.trim().toLowerCase();
    if (!val) return;
    if (!val.includes('@')) {
      toast.error('Informe um e-mail válido');
      return;
    }
    if (config.emails.includes(val)) {
      toast.info('E-mail já adicionado');
      return;
    }
    setConfig(c => ({ ...c, emails: [...c.emails, val] }));
    setNovoEmail('');
  };

  const addEmailRequisicao = () => {
    const val = novoEmailRequisicao.trim().toLowerCase();
    if (!val) return;
    if (!val.includes('@')) {
      toast.error('Informe um e-mail válido');
      return;
    }
    if (config.requisicoesEmails.includes(val)) {
      toast.info('E-mail já adicionado');
      return;
    }
    setConfig(c => ({ ...c, requisicoesEmails: [...c.requisicoesEmails, val] }));
    setNovoEmailRequisicao('');
  };

  const addEmailCompras = () => {
    const val = novoEmailCompras.trim().toLowerCase();
    if (!val) return;
    if (!val.includes('@')) {
      toast.error('Informe um e-mail válido');
      return;
    }
    if (config.comprasEmails.includes(val)) {
      toast.info('E-mail já adicionado');
      return;
    }
    setConfig(c => ({ ...c, comprasEmails: [...c.comprasEmails, val] }));
    setNovoEmailCompras('');
  };

  const addWhatsapp = () => {
    const val = novoWhatsapp.trim();
    if (!val) return;
    if (!/^\+?\d{10,15}$/.test(val.replace(/\s+/g, ''))) {
      toast.error('Use formato +55DDDNUMERO');
      return;
    }
    if (config.whatsappNumeros.includes(val)) {
      toast.info('Número já adicionado');
      return;
    }
    setConfig(c => ({ ...c, whatsappNumeros: [...c.whatsappNumeros, val] }));
    setNovoWhatsapp('');
  };

  const removeItem = (campo, valor) => {
    setConfig(c => ({ ...c, [campo]: c[campo].filter(v => v !== valor) }));
  };

  const salvar = async () => {
    setSaving(true);
    try {
      const payload = { ...config };
      if (!payload.smtpPass) delete payload.smtpPass;
      if (!payload.whatsappApiKey) delete payload.whatsappApiKey;
      await api.put('/almoxarifado/configuracoes/alertas-estoque', payload);
      toast.success('Alertas de estoque salvos!');
      await loadConfig();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao salvar alertas');
    } finally { setSaving(false); }
  };

  const testarNotificacao = async () => {
    setTestando(true);
    try {
      const res = await api.post('/almoxarifado/alertas-estoque/testar');
      const enviadosEmail = res.data?.result?.email?.enviados || 0;
      const enviadosWhatsapp = res.data?.result?.whatsapp?.enviados || 0;
      toast.success(`Teste executado. E-mail: ${enviadosEmail}, WhatsApp: ${enviadosWhatsapp}`);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao testar notificação');
    } finally { setTestando(false); }
  };

  if (loading) return <div className="almox-loading"><FiRefreshCw size={16} style={{ animation: 'spin 1s linear infinite' }} /> Carregando...</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 860 }}>
      <div style={{ background: 'var(--gmp-surface)', border: '1px solid var(--gmp-border)', borderRadius: 12, padding: 18 }}>
        <div style={{ fontWeight: 700, marginBottom: 6 }}>URL do sistema</div>
        <p style={{ fontSize: '0.8rem', color: 'var(--gmp-text-light)', marginBottom: 14, lineHeight: 1.5 }}>
          Endereço usado no botão &quot;Acessar Almoxarifado&quot; dos e-mails e no link das mensagens WhatsApp.
        </p>
        <div className="almox-field">
          <label className="almox-label">URL base</label>
          <input className="almox-input" value={config.appUrl}
            onChange={e => setConfig(c => ({ ...c, appUrl: e.target.value }))}
            placeholder="https://systemgmp.online" />
          <span style={{ fontSize: '0.75rem', color: 'var(--gmp-text-light)' }}>
            O link do almoxarifado será {config.appUrl ? `${config.appUrl.replace(/\/$/, '')}/almoxarifado` : 'https://systemgmp.online/almoxarifado'}
          </span>
        </div>
      </div>

      <div style={{ background: 'var(--gmp-surface)', border: '1px solid var(--gmp-border)', borderRadius: 12, padding: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, marginBottom: 6 }}>
          <FiMail size={16} style={{ color: '#4facfe' }} /> Configuração de E-mail (SMTP)
        </div>
        <p style={{ fontSize: '0.8rem', color: 'var(--gmp-text-light)', marginBottom: 14, lineHeight: 1.5 }}>
          Configure o servidor de envio dos alertas. Exemplos: Gmail (<code>smtp.gmail.com</code>, porta 587, TLS ativo),
          Outlook/Office 365 (<code>smtp.office365.com</code>, porta 587, TLS ativo) ou Locaweb (<code>smtp.locaweb.com.br</code>, porta 587).
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div className="almox-field">
            <label className="almox-label">Servidor SMTP (host)</label>
            <input className="almox-input" value={config.smtpHost}
              onChange={e => setConfig(c => ({ ...c, smtpHost: e.target.value }))}
              placeholder="smtp.gmail.com" />
          </div>
          <div className="almox-field">
            <label className="almox-label">Porta</label>
            <input className="almox-input" type="number" min="1" value={config.smtpPort}
              onChange={e => setConfig(c => ({ ...c, smtpPort: Number(e.target.value || 587) }))} />
          </div>
          <div className="almox-field">
            <label className="almox-label">Usuário</label>
            <input className="almox-input" value={config.smtpUser}
              onChange={e => setConfig(c => ({ ...c, smtpUser: e.target.value }))}
              placeholder="seu-email@empresa.com.br" />
          </div>
          <div className="almox-field">
            <label className="almox-label">Senha</label>
            <input className="almox-input" type="password" value={config.smtpPass}
              onChange={e => setConfig(c => ({ ...c, smtpPass: e.target.value }))}
              placeholder={smtpPassConfigured ? 'Senha configurada — deixe em branco para manter' : 'Senha do e-mail ou app password'} />
          </div>
          <div className="almox-field">
            <label className="almox-label">E-mail remetente (from)</label>
            <input className="almox-input" type="email" value={config.smtpFrom}
              onChange={e => setConfig(c => ({ ...c, smtpFrom: e.target.value }))}
              placeholder="alertas@empresa.com.br" />
          </div>
          <div className="almox-field" style={{ display: 'flex', alignItems: 'flex-end' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', paddingBottom: 10 }}>
              <input type="checkbox" checked={config.smtpSecure}
                onChange={e => setConfig(c => ({ ...c, smtpSecure: e.target.checked }))} />
              <span style={{ fontWeight: 600, fontSize: '0.875rem' }}>Usar TLS/SSL</span>
            </label>
          </div>
        </div>
      </div>

      <div style={{ background: 'var(--gmp-surface)', border: '1px solid var(--gmp-border)', borderRadius: 12, padding: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, marginBottom: 6 }}>
          <FiMessageCircle size={16} style={{ color: '#25D366' }} /> Configuração WhatsApp
        </div>
        <p style={{ fontSize: '0.8rem', color: 'var(--gmp-text-light)', marginBottom: 14, lineHeight: 1.5 }}>
          Informe a URL do webhook da sua integração (ex.: Evolution API, gateway interno).
          O sistema envia POST com <code>{'{ to, message, source }'}</code>. Token opcional para autenticação no header.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div className="almox-field" style={{ gridColumn: '1 / -1' }}>
            <label className="almox-label">URL do Webhook</label>
            <input className="almox-input" value={config.whatsappWebhookUrl}
              onChange={e => setConfig(c => ({ ...c, whatsappWebhookUrl: e.target.value }))}
              placeholder="https://api.seudominio.com/whatsapp/send" />
          </div>
          <div className="almox-field" style={{ gridColumn: '1 / -1' }}>
            <label className="almox-label">Token / Chave API <span style={{ fontWeight: 400, color: 'var(--gmp-text-light)' }}>(opcional)</span></label>
            <input className="almox-input" type="password" value={config.whatsappApiKey}
              onChange={e => setConfig(c => ({ ...c, whatsappApiKey: e.target.value }))}
              placeholder={whatsappApiKeyConfigured ? 'Token configurado — deixe em branco para manter' : 'Bearer token ou API key'} />
          </div>
        </div>
      </div>

      <div style={{ background: 'var(--gmp-surface)', border: '1px solid var(--gmp-border)', borderRadius: 12, padding: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div style={{ fontWeight: 700 }}>Canais de notificação</div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
          <div>
            <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontWeight: 600 }}>Notificar por e-mail</span>
              <input type="checkbox" checked={config.notificarEmail} onChange={e => setConfig(c => ({ ...c, notificarEmail: e.target.checked }))} />
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input className="almox-input" value={novoEmail} onChange={e => setNovoEmail(e.target.value)} placeholder="email@empresa.com.br" />
              <button className="btn-almox-secondary" type="button" onClick={addEmail}><FiPlus size={14} /> Adicionar</button>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
              {config.emails.map(email => (
                <span key={email} style={{ fontSize: '0.78rem', border: '1px solid var(--gmp-border)', borderRadius: 20, padding: '4px 8px', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  {email}
                  <button type="button" className="almox-btn-icon danger" onClick={() => removeItem('emails', email)}><FiX size={12} /></button>
                </span>
              ))}
            </div>
          </div>
          <div>
            <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontWeight: 600 }}>Notificar por WhatsApp</span>
              <input type="checkbox" checked={config.notificarWhatsapp} onChange={e => setConfig(c => ({ ...c, notificarWhatsapp: e.target.checked }))} />
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input className="almox-input" value={novoWhatsapp} onChange={e => setNovoWhatsapp(e.target.value)} placeholder="+55DDDNUMERO" />
              <button className="btn-almox-secondary" type="button" onClick={addWhatsapp}><FiPlus size={14} /> Adicionar</button>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
              {config.whatsappNumeros.map(numero => (
                <span key={numero} style={{ fontSize: '0.78rem', border: '1px solid var(--gmp-border)', borderRadius: 20, padding: '4px 8px', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  {numero}
                  <button type="button" className="almox-btn-icon danger" onClick={() => removeItem('whatsappNumeros', numero)}><FiX size={12} /></button>
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div style={{ background: 'var(--gmp-surface)', border: '1px solid var(--gmp-border)', borderRadius: 12, padding: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, marginBottom: 6 }}>
          <FiClipboard size={16} style={{ color: '#4facfe' }} /> E-mails para notificação de requisições
        </div>
        <p style={{ fontSize: '0.8rem', color: 'var(--gmp-text-light)', marginBottom: 14, lineHeight: 1.5 }}>
          Destinatários avisados quando uma requisição de material é enviada (cesta ou formulário).
          Se a lista estiver vazia, o sistema usa os e-mails de alertas de estoque acima.
        </p>
        <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, maxWidth: 420 }}>
          <span style={{ fontWeight: 600 }}>Notificar novas requisições por e-mail</span>
          <input type="checkbox" checked={config.requisicoesNotificarEmail}
            onChange={e => setConfig(c => ({ ...c, requisicoesNotificarEmail: e.target.checked }))} />
        </label>
        <div style={{ display: 'flex', gap: 8, maxWidth: 520 }}>
          <input className="almox-input" value={novoEmailRequisicao}
            onChange={e => setNovoEmailRequisicao(e.target.value)} placeholder="almoxarifado@empresa.com.br" />
          <button className="btn-almox-secondary" type="button" onClick={addEmailRequisicao}>
            <FiPlus size={14} /> Adicionar
          </button>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
          {config.requisicoesEmails.map(email => (
            <span key={email} style={{ fontSize: '0.78rem', border: '1px solid var(--gmp-border)', borderRadius: 20, padding: '4px 8px', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              {email}
              <button type="button" className="almox-btn-icon danger" onClick={() => removeItem('requisicoesEmails', email)}><FiX size={12} /></button>
            </span>
          ))}
          {!config.requisicoesEmails.length ? (
            <span style={{ fontSize: '0.78rem', color: 'var(--gmp-text-light)' }}>Nenhum e-mail específico — usando lista de alertas de estoque</span>
          ) : null}
        </div>
      </div>

      <div style={{ background: 'var(--gmp-surface)', border: '1px solid var(--gmp-border)', borderRadius: 12, padding: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, marginBottom: 6 }}>
          <FiBell size={16} style={{ color: '#f59e0b' }} /> Lembretes de requisições pendentes
        </div>
        <p style={{ fontSize: '0.8rem', color: 'var(--gmp-text-light)', marginBottom: 14, lineHeight: 1.5 }}>
          Envia e-mail diário quando uma requisição permanece com status <strong>PENDENTE</strong> sem aprovação ou rejeição.
          Usa os mesmos destinatários configurados acima (ou alertas de estoque). O envio para quando o status muda.
        </p>
        <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, maxWidth: 420 }}>
          <span style={{ fontWeight: 600 }}>Ativar lembretes diários</span>
          <input type="checkbox" checked={config.requisicoesLembreteAtivo}
            onChange={e => setConfig(c => ({ ...c, requisicoesLembreteAtivo: e.target.checked }))} />
        </label>
        <div className="almox-field" style={{ maxWidth: 280 }}>
          <label className="almox-label">Intervalo entre lembretes (horas)</label>
          <input className="almox-input" type="number" min="1" value={config.requisicoesLembreteIntervaloHoras}
            onChange={e => setConfig(c => ({ ...c, requisicoesLembreteIntervaloHoras: Number(e.target.value || 24) }))} />
          <span style={{ fontSize: '0.75rem', color: 'var(--gmp-text-light)' }}>Padrão: 24h (um lembrete por dia)</span>
        </div>
      </div>

      <div style={{ background: 'var(--gmp-surface)', border: '1px solid var(--gmp-border)', borderRadius: 12, padding: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, marginBottom: 6 }}>
          <FiShoppingCart size={16} style={{ color: '#ff6b00' }} /> E-mails do setor de Compras
        </div>
        <p style={{ fontSize: '0.8rem', color: 'var(--gmp-text-light)', marginBottom: 14, lineHeight: 1.5 }}>
          Destinatários notificados automaticamente quando uma requisição é enviada com itens
          <strong> parcialmente ou totalmente sem estoque</strong>. O solicitante recebe cópia (CC).
          Lista separada dos alertas de estoque mínimo e das notificações ao almoxarifado.
        </p>
        <div style={{ display: 'flex', gap: 8, maxWidth: 520 }}>
          <input className="almox-input" value={novoEmailCompras}
            onChange={e => setNovoEmailCompras(e.target.value)} placeholder="compras@empresa.com.br" />
          <button className="btn-almox-secondary" type="button" onClick={addEmailCompras}>
            <FiPlus size={14} /> Adicionar
          </button>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
          {config.comprasEmails.map(email => (
            <span key={email} style={{ fontSize: '0.78rem', border: '1px solid var(--gmp-border)', borderRadius: 20, padding: '4px 8px', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              {email}
              <button type="button" className="almox-btn-icon danger" onClick={() => removeItem('comprasEmails', email)}><FiX size={12} /></button>
            </span>
          ))}
          {!config.comprasEmails.length ? (
            <span style={{ fontSize: '0.78rem', color: 'var(--gmp-text-light)' }}>Nenhum e-mail configurado — solicitações de compra automáticas desativadas</span>
          ) : null}
        </div>
      </div>

      <div style={{ background: 'var(--gmp-surface)', border: '1px solid var(--gmp-border)', borderRadius: 12, padding: 18 }}>
        <div style={{ fontWeight: 700, marginBottom: 10 }}>Frequência e disparo</div>
        <p style={{ fontSize: '0.8rem', color: 'var(--gmp-text-light)', marginBottom: 14, lineHeight: 1.5 }}>
          O alerta é enviado <strong>cada vez</strong> que o saldo cruza de acima para no/abaixo do mínimo
          (reposição e nova saída geram novo alerta). Não há limite diário por material.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div className="almox-field">
            <label className="almox-label">Intervalo de verificação (horas)</label>
            <input className="almox-input" type="number" min="1" value={config.intervaloVerificacaoHoras}
              onChange={e => setConfig(c => ({ ...c, intervaloVerificacaoHoras: Number(e.target.value || 1) }))} />
          </div>
          <div className="almox-field">
            <label className="almox-label">Debounce anti-duplicata (segundos)</label>
            <input className="almox-input" type="number" min="0" max="3600" value={config.debounceSegundos}
              onChange={e => setConfig(c => ({ ...c, debounceSegundos: Number(e.target.value || 0) }))} />
            <span style={{ fontSize: '0.75rem', color: 'var(--gmp-text-light)' }}>0 = desligado. Máx. 60s recomendado.</span>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button className="btn-almox-primary" onClick={salvar} disabled={saving}>
          <FiSave size={14} /> {saving ? 'Salvando...' : 'Salvar Alertas'}
        </button>
        <button className="btn-almox-secondary" onClick={testarNotificacao} disabled={testando}>
          <FiSend size={14} /> {testando ? 'Enviando teste...' : 'Testar notificação'}
        </button>
      </div>
    </div>
  );
};

/* ===================== TAB LIBERAÇÃO POR VALOR ===================== */
const TabLiberacaoValor = () => {
  const { user } = useAuth();
  const [config, setConfig] = useState({ ativo: false, limite: 500, aprovadorIds: [] });
  const [usuarios, setUsuarios] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [buscaUsuario, setBuscaUsuario] = useState('');

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [cfgRes, usrRes] = await Promise.all([
        api.get('/almoxarifado/configuracoes/liberacao-valor'),
        api.get('/usuarios'),
      ]);
      setConfig({
        ativo: !!cfgRes.data.ativo,
        limite: cfgRes.data.limite ?? 500,
        aprovadorIds: cfgRes.data.aprovadorIds || [],
      });
      setUsuarios(filterVisibleUsers(usrRes.data || [], user).filter((u) => u.ativo !== 0));
    } catch {
      toast.error('Erro ao carregar configurações de liberação por valor');
    } finally {
      setLoading(false);
    }
  };

  const toggleAprovador = (id) => {
    setConfig((c) => {
      const ids = new Set(c.aprovadorIds);
      if (ids.has(id)) ids.delete(id);
      else ids.add(id);
      return { ...c, aprovadorIds: [...ids] };
    });
  };

  const handleSalvar = async () => {
    setSaving(true);
    try {
      await api.put('/almoxarifado/configuracoes/liberacao-valor', {
        ativo: config.ativo,
        limite: config.limite,
        aprovadorIds: config.aprovadorIds,
      });
      toast.success('Configurações de liberação por valor salvas!');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  };

  const usuariosFiltrados = usuarios.filter((u) => {
    if (!buscaUsuario.trim()) return true;
    const q = buscaUsuario.toLowerCase();
    return (u.nome || '').toLowerCase().includes(q) || (u.email || '').toLowerCase().includes(q);
  });

  if (loading) return <div className="almox-loading"><FiRefreshCw size={16} style={{ animation: 'spin 1s linear infinite' }} /> Carregando...</div>;

  return (
    <div style={{ maxWidth: 720 }}>
      <p style={{ color: 'var(--gmp-text-light)', fontSize: '0.875rem', marginBottom: 20 }}>
        Requisições cujo valor total exceder o limite configurado exigirão aprovação de um aprovador autorizado
        antes da separação ou entrega. O valor é calculado com base no custo unitário (ou custo médio) dos materiais.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ background: 'var(--gmp-surface)', border: '1px solid var(--gmp-border)', borderRadius: 10, padding: '14px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>Habilitar liberação por valor</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--gmp-text-light)', marginTop: 2 }}>
              Quando ativo, requisições acima do limite ficam aguardando aprovação de alto valor
            </div>
          </div>
          <label className="switch" style={{ flexShrink: 0 }}>
            <input type="checkbox" checked={config.ativo}
              onChange={(e) => setConfig((c) => ({ ...c, ativo: e.target.checked }))} />
            <span className="slider" />
          </label>
        </div>

        <div style={{ background: 'var(--gmp-surface)', border: '1px solid var(--gmp-border)', borderRadius: 10, padding: '14px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>Valor máximo liberação automática (R$)</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--gmp-text-light)', marginTop: 2 }}>
              Abaixo deste valor o almoxarife pode liberar sem aprovação extra
            </div>
          </div>
          <input className="almox-input" type="number" min="0" step="0.01" style={{ width: 140 }}
            value={config.limite}
            onChange={(e) => setConfig((c) => ({ ...c, limite: e.target.value }))} />
        </div>

        <div style={{ background: 'var(--gmp-surface)', border: '1px solid var(--gmp-border)', borderRadius: 10, padding: '14px 18px' }}>
          <div style={{ fontWeight: 600, fontSize: '0.875rem', marginBottom: 4 }}>Aprovadores de alto valor</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--gmp-text-light)', marginBottom: 12 }}>
            Usuários que podem aprovar ou reprovar liberação de requisições acima do limite
          </div>
          <input className="almox-input" placeholder="Buscar usuário..." value={buscaUsuario}
            onChange={(e) => setBuscaUsuario(e.target.value)} style={{ marginBottom: 10, width: '100%' }} />
          <div style={{ maxHeight: 220, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
            {usuariosFiltrados.map((u) => (
              <label key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 6, cursor: 'pointer', background: config.aprovadorIds.includes(u.id) ? 'rgba(79,172,254,0.08)' : 'transparent' }}>
                <input type="checkbox" checked={config.aprovadorIds.includes(u.id)}
                  onChange={() => toggleAprovador(u.id)} />
                <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>{u.nome}</span>
                <span style={{ fontSize: '0.75rem', color: 'var(--gmp-text-light)' }}>{u.email}</span>
              </label>
            ))}
            {usuariosFiltrados.length === 0 && (
              <div style={{ fontSize: '0.8rem', color: 'var(--gmp-text-light)', padding: 8 }}>Nenhum usuário encontrado</div>
            )}
          </div>
          {config.aprovadorIds.length > 0 && (
            <div style={{ marginTop: 10, fontSize: '0.75rem', color: 'var(--gmp-text-light)' }}>
              {config.aprovadorIds.length} aprovador(es) selecionado(s)
            </div>
          )}
        </div>
      </div>

      <button className="btn-almox-primary" style={{ marginTop: 24 }} onClick={handleSalvar} disabled={saving}>
        <FiSave size={14} /> {saving ? 'Salvando...' : 'Salvar Configurações'}
      </button>
    </div>
  );
};

/* ===================== TAB PERFIS DE ACESSO ===================== */

// Rótulo e o que cada perfil pode, em linguagem de usuário. As listas espelham
// ACAO_PERFIS (server/services/almoxarifado/permissions.js) — se as regras mudarem lá,
// atualize aqui: é texto de ajuda, não fonte de verdade (a decisão vem sempre do backend).
const PERFIS_INFO = {
  ADMINISTRADOR: { label: 'Administrador', desc: 'Acesso total, incluindo configurações do módulo' },
  ALMOXARIFE: { label: 'Almoxarife', desc: 'Movimenta estoque, cadastra material, separa, entrega, aprova e inventaria — não ajusta saldo nem configura' },
  GESTOR: { label: 'Gestor', desc: 'Ajusta saldo, aprova requisição e inventaria — não movimenta nem cadastra material' },
  COMPRAS: { label: 'Compras', desc: 'Consulta e recebe material' },
  ENGENHARIA: { label: 'Engenharia', desc: 'Cadastra e edita material, requisita e reserva' },
  PRODUCAO: { label: 'Produção', desc: 'Consulta, requisita e reserva material (é o padrão de quem não tem perfil definido)' },
  CONSULTA: { label: 'Consulta', desc: 'Somente leitura' },
};

const TabPerfisAcesso = () => {
  const [usuarios, setUsuarios] = useState([]);
  const [perfis, setPerfis] = useState([]);
  const [loading, setLoading] = useState(true);
  const [salvandoId, setSalvandoId] = useState(null);
  const [busca, setBusca] = useState('');

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.get('/almoxarifado/perfis-usuario');
      setUsuarios(res.data.usuarios || []);
      setPerfis(res.data.perfis || []);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao carregar perfis de acesso');
    } finally {
      setLoading(false);
    }
  };

  const alterar = async (usuarioId, perfil) => {
    setSalvandoId(usuarioId);
    try {
      const res = await api.put(`/almoxarifado/perfis-usuario/${usuarioId}`, { perfil });
      setUsuarios((lista) => lista.map((u) => (u.id === usuarioId
        ? { ...u, perfil_explicito: res.data.perfil_explicito, perfil_efetivo: res.data.perfil_efetivo, origem: res.data.origem }
        : u)));
      // O hook de permissões guarda a resposta em cache de módulo; sem invalidar, quem
      // acabou de ganhar perfil continuaria vendo os bloqueios até recarregar a página.
      invalidarAlmoxPermissoes();
      toast.success(perfil
        ? `Perfil definido: ${PERFIS_INFO[perfil]?.label || perfil}`
        : 'Perfil removido — o usuário volta ao padrão (Produção)');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao alterar o perfil');
    } finally {
      setSalvandoId(null);
    }
  };

  const filtrados = usuarios.filter((u) => {
    if (!busca.trim()) return true;
    const q = busca.toLowerCase();
    return (u.nome || '').toLowerCase().includes(q) || (u.email || '').toLowerCase().includes(q);
  });

  if (loading) return <div className="almox-loading"><FiRefreshCw size={16} style={{ animation: 'spin 1s linear infinite' }} /> Carregando...</div>;

  return (
    <div>
      <p style={{ color: 'var(--gmp-text-light)', fontSize: '0.875rem', marginBottom: 8 }}>
        Define o que cada pessoa pode fazer <strong>dentro do almoxarifado</strong>. Ter acesso ao módulo
        (no cadastro de usuário) permite <em>abrir</em> as telas; o perfil abaixo é o que permite <em>agir</em>.
      </p>
      <p style={{ color: 'var(--gmp-text-light)', fontSize: '0.8rem', marginBottom: 20 }}>
        Quem não tem perfil definido entra como <strong>Produção</strong> — consulta e requisita, mas não
        movimenta estoque, não cadastra material e não aprova.
      </p>

      <div className="almox-field" style={{ maxWidth: 360, marginBottom: 16 }}>
        <input
          className="almox-input"
          placeholder="Buscar por nome ou e-mail..."
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
      </div>

      <div className="almox-table-container">
        <table className="almox-table">
          <thead>
            <tr>
              <th>Usuário</th>
              <th style={{ width: 220 }}>Perfil no almoxarifado</th>
              <th>O que isso permite</th>
            </tr>
          </thead>
          <tbody>
            {filtrados.length === 0 ? (
              <tr><td colSpan={3} style={{ textAlign: 'center', color: 'var(--gmp-text-light)', padding: 24 }}>
                Nenhum usuário encontrado.
              </td></tr>
            ) : filtrados.map((u) => {
              const forcado = u.origem === 'forcado';
              const info = PERFIS_INFO[u.perfil_efetivo];
              return (
                <tr key={u.id}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{u.nome}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--gmp-text-light)' }}>{u.email}</div>
                  </td>
                  <td>
                    {forcado ? (
                      /* Administrador por superadmin/admin de sistema/admin de módulo: o perfil
                         explícito seria ignorado em runtime e apagado no próximo save do
                         usuário, então não oferecemos o select — o backend recusa com 409. */
                      <span className="almox-badge almox-badge-ok" title="Definido no cadastro de usuário (superadmin, admin de sistema ou administrador do módulo)">
                        <FiShield size={12} /> Administrador
                      </span>
                    ) : (
                      <select
                        className="almox-select"
                        value={u.perfil_explicito || ''}
                        disabled={salvandoId === u.id}
                        onChange={(e) => alterar(u.id, e.target.value)}
                      >
                        <option value="">Produção (padrão)</option>
                        {perfis.filter((p) => p !== 'PRODUCAO').map((p) => (
                          <option key={p} value={p}>{PERFIS_INFO[p]?.label || p}</option>
                        ))}
                      </select>
                    )}
                  </td>
                  <td style={{ fontSize: '0.8rem', color: 'var(--gmp-text-light)' }}>
                    {info?.desc || '—'}
                    {forcado && (
                      <div style={{ marginTop: 4, fontSize: '0.75rem' }}>
                        Para dar um perfil específico, remova a condição de administrador no cadastro de usuário.
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

/* ===================== TAB CONFIGURAÇÕES GERAIS ===================== */
const TabConfiguracoes = () => {
  const [configs, setConfigs] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // ATENÇÃO — `chave` aqui NÃO é rótulo interno: é a chave literal que o servidor semeia em
  // `configuracoes_almoxarifado` e lê em tempo de execução. Esta lista já mentiu: declarava
  // `permitir_saida_saldo_negativo` enquanto o motor de estoque lia
  // `permite_saldo_negativo_global` (stockService, guarda de saída), e mais cinco chaves que
  // simplesmente não existiam do lado do servidor. O administrador ligava a opção e nada
  // acontecia — um controle que mente é pior do que controle nenhum.
  //
  // Regra para adicionar um campo aqui: a chave precisa (1) estar semeada em
  // `server/services/almoxarifado/schema.js` e (2) ter um leitor de verdade no servidor.
  // `server/tests/api/configuracoesGerais.api.test.js` lê ESTE arquivo e reprova as duas
  // condições — não adiante inventar a chave só na tela.
  const CAMPOS = [
    { chave: 'aprovacao_automatica', label: 'Aprovação Automática', tipo: 'boolean', descricao: 'Requisições normais são aprovadas automaticamente (exceto CRÍTICO)' },
    { chave: 'permite_saldo_negativo_global', label: 'Permitir Saída com Saldo Negativo', tipo: 'boolean', descricao: 'Permite registrar saída mesmo sem saldo disponível' },
  ];
  // Saíram daqui por não ter leitor nenhum no servidor — nenhuma delas fazia coisa alguma:
  // `prazo_atendimento_horas` (semeada, mas nada calcula prazo de atendimento),
  // `prazo_urgente_horas` e `prazo_critico_horas` (nem semeadas), `alerta_estoque_email`
  // (a aba "Alertas de Estoque" é quem configura destinatários, em `alertas_estoque_emails`),
  // `prefixo_codigo_material` (a semeada chama-se `prefixo_material` e também não é lida por
  // ninguém) e `requer_os_requisicao` (nenhuma validação exige OS). Voltar qualquer uma exige
  // primeiro o leitor no servidor — senão o controle volta a mentir.

  useEffect(() => { loadConfigs(); }, []);
  const loadConfigs = async () => {
    setLoading(true);
    try {
      // GET /almoxarifado/configuracoes devolve um MAPA { chave: { valor, descricao, id } },
      // não um array. O `res.data.forEach` que estava aqui estourava TypeError em toda carga,
      // caía no catch e a aba inteira aparecia vazia com "Erro ao carregar configurações" —
      // por isso nem o campo de chave correta mostrava o valor gravado.
      const res = await api.get('/almoxarifado/configuracoes');
      const map = {};
      Object.entries(res.data || {}).forEach(([chave, info]) => {
        map[chave] = info && typeof info === 'object' ? info.valor : info;
      });
      setConfigs(map);
    } catch { toast.error('Erro ao carregar configurações'); } finally { setLoading(false); }
  };

  const handleSalvar = async () => {
    setSaving(true);
    try {
      // PUT espera o corpo achatado { chave: valor }. O envelope `{ configuracoes: [...] }` que
      // estava aqui fazia o servidor gravar UMA linha de chave 'configuracoes' com
      // "[object Object],[object Object]" — nenhuma configuração era salva.
      // Só as chaves desta tela vão no corpo: o mapa `configs` carrega tudo o que o GET trouxe
      // (SMTP, WhatsApp, liberação por valor) e reenviar isso reescreveria configuração de
      // outras abas sem ninguém ter pedido.
      const payload = {};
      CAMPOS.forEach(c => { payload[c.chave] = String(configs[c.chave] ?? ''); });
      await api.put('/almoxarifado/configuracoes', payload);
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

/* ===================== TAB MATERIAIS POR SETOR ===================== */
const TIPO_USO_LABELS = {
  administrativo: { label: 'ADM', color: '#27ae60', bg: 'rgba(46,204,113,0.12)' },
  industrial: { label: 'IND', color: '#e59800', bg: 'rgba(229,152,0,0.12)' },
  ambos: { label: 'AMB', color: '#4facfe', bg: 'rgba(79,172,254,0.1)' },
};

const TabMateriaisPorSetor = () => {
  const [setores, setSetores] = useState([]);
  const [familias, setFamilias] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [setorAtivo, setSetorAtivo] = useState(null);
  const [permissoes, setPermissoes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [filtroTipo, setFiltroTipo] = useState('todos');
  const [selFamilias, setSelFamilias] = useState(new Set());
  const [selCategorias, setSelCategorias] = useState(new Set());

  useEffect(() => { loadBase(); }, []);

  const loadBase = async () => {
    setLoading(true);
    try {
      const [setRes, famRes, catRes] = await Promise.all([
        api.get('/almoxarifado/setores-requisicao'),
        api.get('/almoxarifado/familias'),
        api.get('/almoxarifado/categorias'),
      ]);
      setSetores(setRes.data);
      setFamilias(famRes.data);
      setCategorias(catRes.data);
      if (setRes.data.length) {
        selecionarSetor(setRes.data[0]);
      }
    } catch {
      toast.error('Erro ao carregar setores');
    } finally {
      setLoading(false);
    }
  };

  const selecionarSetor = async (setor) => {
    setSetorAtivo(setor);
    try {
      const res = await api.get(`/almoxarifado/setores-requisicao/${setor.id}/permissoes`);
      setPermissoes(res.data);
      setSelFamilias(new Set(res.data.filter(p => p.familia_id).map(p => p.familia_id)));
      setSelCategorias(new Set(res.data.filter(p => p.categoria_id).map(p => p.categoria_id)));
    } catch {
      toast.error('Erro ao carregar permissões do setor');
    }
  };

  const toggleFamilia = (id) => {
    setSelFamilias(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleCategoria = (id) => {
    setSelCategorias(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleSalvar = async () => {
    if (!setorAtivo) return;
    setSaving(true);
    try {
      const payload = [
        ...[...selFamilias].map(familia_id => ({ familia_id, categoria_id: null, material_id: null })),
        ...[...selCategorias].map(categoria_id => ({ familia_id: null, categoria_id, material_id: null })),
      ];
      await api.put(`/almoxarifado/setores-requisicao/${setorAtivo.id}/permissoes`, { permissoes: payload });
      toast.success(`Permissões de ${setorAtivo.nome} salvas!`);
      selecionarSetor(setorAtivo);
      const setRes = await api.get('/almoxarifado/setores-requisicao');
      setSetores(setRes.data);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  };

  const handleBulkTipo = async (tipoUso) => {
    if (!setorAtivo) return;
    setBulkLoading(true);
    try {
      const res = await api.post(`/almoxarifado/setores-requisicao/${setorAtivo.id}/permissoes/bulk-tipo`, { tipo_uso: tipoUso });
      setPermissoes(res.data);
      setSelFamilias(new Set(res.data.filter(p => p.familia_id).map(p => p.familia_id)));
      toast.success(`Famílias ${tipoUso === 'administrativo' ? 'administrativas' : 'industriais'} atribuídas!`);
      const setRes = await api.get('/almoxarifado/setores-requisicao');
      setSetores(setRes.data);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro na atribuição em lote');
    } finally {
      setBulkLoading(false);
    }
  };

  const familiasFiltradas = familias.filter((f) => {
    if (filtroTipo === 'todos') return true;
    return f.tipo_uso === filtroTipo || f.tipo_uso === 'ambos';
  });

  const tipoSetorLabel = setorAtivo?.tipo_setor === 'administrativo'
    ? 'Administrativo (escritório)'
    : setorAtivo?.tipo_setor === 'industrial'
      ? 'Industrial / Fábrica (Produção, Manutenção)'
      : 'Geral';

  if (loading) {
    return <div className="almox-loading"><FiRefreshCw size={16} style={{ animation: 'spin 1s linear infinite' }} /> Carregando...</div>;
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr', gap: 24 }}>
      <div style={{ border: '1px solid var(--gmp-border)', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ padding: '12px 16px', background: 'var(--gmp-bg)', fontWeight: 700, fontSize: '0.8rem', textTransform: 'uppercase' }}>
          Setores
        </div>
        {setores.map(s => (
          <button key={s.id} type="button" onClick={() => selecionarSetor(s)}
            style={{
              display: 'block', width: '100%', textAlign: 'left', padding: '10px 16px', border: 'none',
              borderBottom: '1px solid var(--gmp-border)', cursor: 'pointer',
              background: setorAtivo?.id === s.id ? 'rgba(79,172,254,0.1)' : 'transparent',
              color: setorAtivo?.id === s.id ? '#4facfe' : 'var(--gmp-text)', fontWeight: setorAtivo?.id === s.id ? 700 : 500,
            }}>
            {s.nome}
            <div style={{ fontSize: '0.7rem', color: 'var(--gmp-text-light)' }}>{s.qtd_permissoes || 0} regra(s)</div>
          </button>
        ))}
      </div>

      {setorAtivo && (
        <div>
          <h3 style={{ margin: '0 0 8px' }}>{setorAtivo.nome}</h3>
          <p style={{ color: 'var(--gmp-text-light)', fontSize: '0.875rem', marginBottom: 12 }}>
            Tipo do setor: <strong>{tipoSetorLabel}</strong>.
            <strong> Produção e Manutenção</strong> são industriais; <strong>todos os demais setores</strong> (Comercial, Compras, Financeiro, Engenharia, etc.) são administrativos.
            O catálogo de cada setor filtra automaticamente por <em>tipo de uso</em> da família/categoria (Administrativo, Industrial ou Ambos).
          </p>
          <p style={{ color: 'var(--gmp-text-light)', fontSize: '0.8rem', marginBottom: 20 }}>
            As regras abaixo são opcionais para refinamento. Sem regras, o setor vê todos os materiais compatíveis com seu tipo (ADM ou IND).
            O almoxarifado continua vendo todos os materiais na lista completa.
          </p>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
            <button type="button" className="btn-almox-secondary" style={{ fontSize: '0.8rem' }}
              disabled={bulkLoading} onClick={() => handleBulkTipo('administrativo')}>
              + Todas famílias ADM
            </button>
            <button type="button" className="btn-almox-secondary" style={{ fontSize: '0.8rem' }}
              disabled={bulkLoading} onClick={() => handleBulkTipo('industrial')}>
              + Todas famílias IND
            </button>
            <select className="almox-form-select" style={{ width: 'auto', fontSize: '0.8rem' }}
              value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)}>
              <option value="todos">Filtrar famílias: todas</option>
              <option value="administrativo">Só administrativas</option>
              <option value="industrial">Só industriais</option>
            </select>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
            <div style={{ border: '1px solid var(--gmp-border)', borderRadius: 12, padding: 16 }}>
              <div className="almox-section-title">Famílias permitidas</div>
              <div style={{ maxHeight: 280, overflowY: 'auto' }}>
                {familiasFiltradas.map(f => {
                  const tipo = TIPO_USO_LABELS[f.tipo_uso] || TIPO_USO_LABELS.ambos;
                  return (
                    <label key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', cursor: 'pointer', fontSize: '0.875rem' }}>
                      <input type="checkbox" checked={selFamilias.has(f.id)} onChange={() => toggleFamilia(f.id)} />
                      <span style={{ flex: 1 }}>{f.codigo} — {f.nome}</span>
                      <span style={{ fontSize: '0.65rem', padding: '1px 6px', borderRadius: 10, fontWeight: 700, background: tipo.bg, color: tipo.color }}>
                        {tipo.label}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
            <div style={{ border: '1px solid var(--gmp-border)', borderRadius: 12, padding: 16 }}>
              <div className="almox-section-title">Categorias permitidas</div>
              <div style={{ maxHeight: 280, overflowY: 'auto' }}>
                {categorias.map(c => (
                  <label key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', cursor: 'pointer', fontSize: '0.875rem' }}>
                    <input type="checkbox" checked={selCategorias.has(c.id)} onChange={() => toggleCategoria(c.id)} />
                    <span>{c.nome}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>

          <button className="btn-almox-primary" style={{ marginTop: 20 }} onClick={handleSalvar} disabled={saving}>
            <FiSave size={14} /> {saving ? 'Salvando...' : 'Salvar permissões do setor'}
          </button>
        </div>
      )}
    </div>
  );
};

export default ConfiguracoesAlmoxarifado;
