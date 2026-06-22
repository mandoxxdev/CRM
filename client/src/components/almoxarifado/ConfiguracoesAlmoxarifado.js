import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import { toast } from 'react-toastify';
import { useAuth } from '../../context/AuthContext';
import {
  FiSave, FiPlus, FiTrash2, FiEdit2, FiCheck, FiX,
  FiPackage, FiSliders, FiMapPin, FiSettings, FiAlertOctagon,
  FiShield, FiRefreshCw
} from 'react-icons/fi';
import './Almoxarifado.css';

const ICONES = ['📦', '🔧', '🪛', '⚙️', '🛡️', '🧰', '🪝', '💡', '🔩', '🪜', '🧪', '🏗️', '🔌', '🧲', '📋'];
const CORES = ['#4facfe', '#00f2fe', '#43e97b', '#f9a825', '#ef5350', '#ab47bc', '#26c6da', '#ff7043', '#78909c', '#5c6bc0'];

const TABS = [
  { id: 'tipos', label: 'Tipos de Material', icon: FiPackage },
  { id: 'estoques', label: 'Estoques Mínimos', icon: FiSliders },
  { id: 'localizacoes', label: 'Localizações', icon: FiMapPin },
  { id: 'geral', label: 'Configurações Gerais', icon: FiSettings },
];

const ConfiguracoesAlmoxarifado = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [tab, setTab] = useState('tipos');

  if (!isAdmin) {
    return (
      <div className="almox-page">
        <div className="almox-empty" style={{ padding: 60 }}>
          <FiAlertOctagon size={48} style={{ opacity: 0.3, display: 'block', margin: '0 auto 16px' }} />
          <p style={{ fontWeight: 700, fontSize: '1.1rem' }}>Acesso Restrito</p>
          <p style={{ color: 'var(--gmp-text-light)', marginTop: 8 }}>Somente administradores podem acessar as configurações do almoxarifado.</p>
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
          <p>Gerencie tipos de material, estoques mínimos, localizações e configurações gerais</p>
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
      {tab === 'estoques' && <TabEstoquesMinimos />}
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
                <th>Mín.</th>
                <th>Máx.</th>
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

/* ===================== TAB LOCALIZAÇÕES ===================== */
const TabLocalizacoes = () => {
  const [localizacoes, setLocalizacoes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editando, setEditando] = useState(null);
  const [form, setForm] = useState({ codigo: '', descricao: '', setor: '' });
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => { loadLocs(); }, []);
  const loadLocs = async () => {
    setLoading(true);
    try { const r = await api.get('/almoxarifado/localizacoes'); setLocalizacoes(r.data); }
    catch { toast.error('Erro ao carregar localizações'); } finally { setLoading(false); }
  };

  const resetForm = () => { setForm({ codigo: '', descricao: '', setor: '' }); setEditando(null); setShowForm(false); };
  const handleEditar = (loc) => { setForm(loc); setEditando(loc.id); setShowForm(true); };
  const handleSalvar = async () => {
    if (!form.codigo.trim()) { toast.error('Código é obrigatório'); return; }
    setSaving(true);
    try {
      if (editando) { await api.put(`/almoxarifado/localizacoes/${editando}`, form); toast.success('Atualizado!'); }
      else { await api.post('/almoxarifado/localizacoes', form); toast.success('Criado!'); }
      resetForm(); loadLocs();
    } catch (err) { toast.error(err.response?.data?.error || 'Erro'); } finally { setSaving(false); }
  };
  const handleDeletar = async (id) => {
    if (!window.confirm('Remover localização?')) return;
    try { await api.delete(`/almoxarifado/localizacoes/${id}`); toast.success('Removido'); loadLocs(); }
    catch (err) { toast.error(err.response?.data?.error || 'Erro'); }
  };

  return (
    <div>
      {!showForm && (
        <button className="btn-almox-primary" style={{ marginBottom: 20 }} onClick={() => setShowForm(true)}>
          <FiPlus size={14} /> Nova Localização
        </button>
      )}
      {showForm && (
        <div style={{ background: 'var(--gmp-surface)', border: '1px solid rgba(79,172,254,0.25)', borderRadius: 12, padding: 20, marginBottom: 24 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14, marginBottom: 16 }}>
            <div className="almox-field">
              <label className="almox-label">Código<span className="required">*</span></label>
              <input className="almox-input" value={form.codigo} onChange={e => setForm(f => ({ ...f, codigo: e.target.value }))} placeholder="A1-01" />
            </div>
            <div className="almox-field">
              <label className="almox-label">Descrição</label>
              <input className="almox-input" value={form.descricao} onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))} placeholder="Prateleira A, corredor 1" />
            </div>
            <div className="almox-field">
              <label className="almox-label">Setor</label>
              <input className="almox-input" value={form.setor} onChange={e => setForm(f => ({ ...f, setor: e.target.value }))} placeholder="EPI, Ferramentas..." />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn-almox-primary" onClick={handleSalvar} disabled={saving}><FiSave size={14} /> {saving ? 'Salvando...' : 'Salvar'}</button>
            <button className="btn-almox-secondary" onClick={resetForm}>Cancelar</button>
          </div>
        </div>
      )}
      {loading ? (
        <div className="almox-loading"><FiRefreshCw size={16} style={{ animation: 'spin 1s linear infinite' }} /> Carregando...</div>
      ) : (
        <div className="almox-table-container">
          <table className="almox-table">
            <thead><tr><th>Código</th><th>Descrição</th><th>Setor</th><th></th></tr></thead>
            <tbody>
              {localizacoes.map(loc => (
                <tr key={loc.id}>
                  <td><span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#4facfe' }}>{loc.codigo}</span></td>
                  <td>{loc.descricao || '—'}</td>
                  <td>{loc.setor ? <span style={{ fontSize: '0.8rem', background: 'var(--gmp-bg)', border: '1px solid var(--gmp-border)', borderRadius: 6, padding: '2px 10px' }}>{loc.setor}</span> : '—'}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                      <button className="almox-btn-icon" onClick={() => handleEditar(loc)}><FiEdit2 size={13} /></button>
                      <button className="almox-btn-icon danger" onClick={() => handleDeletar(loc.id)}><FiTrash2 size={13} /></button>
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
