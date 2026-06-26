import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import api from '../../services/api';
import { fetchProducaoMeta, STATUS_OP_LABELS, statusOpClass, invalidateProducaoDashboardCache } from '../../utils/producaoApi';
import { toast } from 'react-toastify';
import { FiSave, FiArrowLeft } from 'react-icons/fi';
import ProducaoPageHeader from './ProducaoPageHeader';
import './Producao.css';

const defaultForm = () => ({
  numero_op: '',
  produto_codigo: '',
  produto_descricao: '',
  quantidade_planejada: 1,
  prioridade: 'normal',
  status: 'planejada',
  data_planejada: new Date().toISOString().slice(0, 10),
  data_prevista_fim: '',
  maquina_id: '',
  os_id: '',
  observacoes: '',
});

const OrdemProducaoFormPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEdit = Boolean(id);
  const [form, setForm] = useState(defaultForm);
  const [meta, setMeta] = useState(null);
  const [etapas, setEtapas] = useState([]);
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const m = await fetchProducaoMeta();
      setMeta(m);
      if (isEdit) {
        setLoading(true);
        const { data } = await api.get(`/producao/ops/${id}`);
        setForm({
          numero_op: data.numero_op,
          produto_codigo: data.produto_codigo || '',
          produto_descricao: data.produto_descricao,
          quantidade_planejada: data.quantidade_planejada,
          prioridade: data.prioridade,
          status: data.status,
          data_planejada: data.data_planejada || '',
          data_prevista_fim: data.data_prevista_fim || '',
          maquina_id: data.maquina_id || '',
          os_id: data.os_id || '',
          observacoes: data.observacoes || '',
        });
        setEtapas(data.etapas || []);
      } else {
        const { data: num } = await api.get('/producao/ops/proximo-numero');
        setForm((f) => ({ ...f, numero_op: num.numero_op }));
      }
    } catch (e) {
      toast.error(e.response?.data?.error || 'Erro ao carregar OP');
    } finally {
      setLoading(false);
    }
  }, [id, isEdit]);

  useEffect(() => { load(); }, [load]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const salvar = async (e) => {
    e.preventDefault();
    if (!form.produto_descricao) {
      toast.warning('Descrição do produto é obrigatória');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...form,
        maquina_id: form.maquina_id || null,
        os_id: form.os_id || null,
        quantidade_planejada: Number(form.quantidade_planejada) || 1,
      };
      if (isEdit) {
        await api.put(`/producao/ops/${id}`, payload);
        toast.success('OP atualizada');
      } else {
        await api.post('/producao/ops', payload);
        toast.success('OP criada');
      }
      invalidateProducaoDashboardCache();
      navigate('/fabrica/ordens-producao');
    } catch (e) {
      toast.error(e.response?.data?.error || 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="producao-page"><div className="producao-empty">Carregando...</div></div>;

  return (
    <div className="producao-page">
      <ProducaoPageHeader
        title={isEdit ? `Editar ${form.numero_op}` : 'Nova Ordem de Produção'}
        subtitle="Cadastro de OP — fabricação de máquinas e equipamentos"
        actions={(
          <Link to="/fabrica/ordens-producao" className="producao-btn producao-btn-secondary">
            <FiArrowLeft /> Voltar
          </Link>
        )}
      />

      <form onSubmit={salvar} className="producao-card">
        <div className="producao-form-grid">
          <div className="producao-form-group">
            <label>Número OP</label>
            <input value={form.numero_op} readOnly />
          </div>
          <div className="producao-form-group">
            <label>Status</label>
            {isEdit ? (
              <span className={`producao-badge ${statusOpClass(form.status)}`}>{STATUS_OP_LABELS[form.status]}</span>
            ) : (
              <input value="Planejada" readOnly />
            )}
          </div>
          <div className="producao-form-group">
            <label>Código produto</label>
            <input value={form.produto_codigo} onChange={(e) => set('produto_codigo', e.target.value)} placeholder="Ex: AGT-500" />
          </div>
          <div className="producao-form-group full">
            <label>Descrição do produto *</label>
            <input value={form.produto_descricao} onChange={(e) => set('produto_descricao', e.target.value)} required />
          </div>
          <div className="producao-form-group">
            <label>Quantidade planejada</label>
            <input type="number" min="1" step="1" value={form.quantidade_planejada} onChange={(e) => set('quantidade_planejada', e.target.value)} />
          </div>
          <div className="producao-form-group">
            <label>Prioridade</label>
            <select value={form.prioridade} onChange={(e) => set('prioridade', e.target.value)}>
              {(meta?.prioridades || ['baixa', 'normal', 'alta', 'urgente']).map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>
          <div className="producao-form-group">
            <label>Data planejada</label>
            <input type="date" value={form.data_planejada} onChange={(e) => set('data_planejada', e.target.value)} />
          </div>
          <div className="producao-form-group">
            <label>Previsão término</label>
            <input type="date" value={form.data_prevista_fim} onChange={(e) => set('data_prevista_fim', e.target.value)} />
          </div>
          <div className="producao-form-group">
            <label>Máquina / Centro</label>
            <select value={form.maquina_id} onChange={(e) => set('maquina_id', e.target.value)}>
              <option value="">— Selecionar —</option>
              {(meta?.maquinas || []).map((m) => (
                <option key={m.id} value={m.id}>{m.codigo} — {m.nome}</option>
              ))}
            </select>
          </div>
          <div className="producao-form-group">
            <label>OS vinculada (ID)</label>
            <input type="number" value={form.os_id} onChange={(e) => set('os_id', e.target.value)} placeholder="Opcional" />
          </div>
          <div className="producao-form-group full">
            <label>Observações</label>
            <textarea value={form.observacoes} onChange={(e) => set('observacoes', e.target.value)} />
          </div>
        </div>

        {etapas.length > 0 && (
          <div style={{ marginTop: 24 }}>
            <h3 style={{ marginBottom: 12 }}>Etapas do roteiro</h3>
            <div className="producao-table-wrap">
              <table className="producao-table">
                <thead>
                  <tr><th>#</th><th>Etapa</th><th>Máquina</th><th>Tempo prev. (min)</th><th>Status</th></tr>
                </thead>
                <tbody>
                  {etapas.map((et) => (
                    <tr key={et.id}>
                      <td>{et.sequencia}</td>
                      <td>{et.nome}</td>
                      <td>{et.maquina_codigo || '—'}</td>
                      <td>{et.tempo_previsto_min}</td>
                      <td><span className="producao-badge info">{et.status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div style={{ marginTop: 20, display: 'flex', gap: 10 }}>
          <button type="submit" className="producao-btn producao-btn-primary" disabled={saving}>
            <FiSave /> {saving ? 'Salvando...' : 'Salvar OP'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default OrdemProducaoFormPage;
