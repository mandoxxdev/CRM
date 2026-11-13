import React, { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import { FiCheck, FiEdit2, FiPlus, FiRefreshCw, FiSave, FiTrash2 } from 'react-icons/fi';
import api from '../../services/api';
import AvisoSomenteLeitura from './AvisoSomenteLeitura';
import './Almoxarifado.css';

/* ===================== TAB TIPOS DE MATERIAL ===================== */
const ICONES = ['📦', '🔧', '🪛', '⚙️', '🛡️', '🧰', '🪝', '💡', '🔩', '🪜', '🧪', '🏗️', '🔌', '🧲', '📋'];
const CORES = ['#4facfe', '#00f2fe', '#43e97b', '#f9a825', '#ef5350', '#ab47bc', '#26c6da', '#ff7043', '#78909c', '#5c6bc0'];

// Etapa 215 (RN-215.03): o aviso do Almoxarifado — a aba so consulta; a MESMA literal do 403 do servidor.
// Substitui a frase da Etapa 126 (`FRASES_CONFIG.tipos`, 'Somente leitura — cadastrar, editar e excluir tipos de material ...').
export const AVISO_TIPOS_NO_COMPRAS = 'O cadastro de tipos de material é feito em Compras → Tipos de Material.';

// Etapa 215 (contrato do plano): por onde a tela fala com o servidor. O Almoxarifado le pela rota dele (gravar recusa, RN-215.02);
// o Compras le pela porta de leitura `/compras/materiais/aux/...` e grava pelas `/compras/materiais/...` (RN-215.01).
export const ROTAS_TIPOS_ALMOXARIFADO = {
  lista: '/almoxarifado/tipos-material',
  criar: '/almoxarifado/tipos-material',
  item: (id) => `/almoxarifado/tipos-material/${id}`,
};
export const ROTAS_TIPOS_COMPRAS = {
  lista: '/compras/materiais/aux/tipos-material',
  criar: '/compras/materiais/tipos-material',
  item: (id) => `/compras/materiais/tipos-material/${id}`,
};

/**
 * Etapa 215: a aba saiu de `ConfiguracoesAlmoxarifado.js` para servir as duas telas — Almoxarifado -> Configuracoes -> Tipos de
 * Material (`podeGravar` false, sempre: RN-215.03) e Compras -> Tipos de Material (`podeGravar` = quem cadastra material: RN-215.01).
 * `aviso`: a faixa de cima (null = nenhuma). Com `podeGravar` os gestos, toasts e confirmacao sao os de antes, letra por letra.
 */
const TiposDeMaterial = ({ rotas, podeGravar = false, aviso = null }) => {
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
      const res = await api.get(rotas.lista);
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
        await api.put(rotas.item(editando), form);
        toast.success('Tipo atualizado!');
      } else {
        await api.post(rotas.criar, form);
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
      await api.delete(rotas.item(id));
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
      {aviso && <AvisoSomenteLeitura frase={aviso} className="almox-tipos-somente-leitura" />}
      {!showForm && podeGravar && (
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
                {podeGravar && (
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="almox-btn-icon" onClick={() => handleEditar(tipo)} title="Editar"><FiEdit2 size={13} /></button>
                    <button className="almox-btn-icon danger" onClick={() => handleDeletar(tipo.id)} title="Excluir"><FiTrash2 size={13} /></button>
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {tipo.is_epi && <span className="almox-selo almox-selo-epi">EPI</span>}
                {tipo.is_controlado && <span className="almox-selo almox-selo-controlado">Controlado</span>}
                {tipo.requer_assinatura && <span className="almox-selo almox-selo-assinatura">Assinatura</span>}
                {tipo.requer_termo && <span className="almox-selo almox-selo-termo">Termo</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default TiposDeMaterial;
