import React, { useState, useEffect, useCallback } from 'react';
import api from '../../services/api';
import { fetchProducaoMeta } from '../../utils/producaoApi';
import { toast } from 'react-toastify';
import { FiPlus, FiEdit, FiTrash2, FiX } from 'react-icons/fi';
import ProducaoPageHeader from './ProducaoPageHeader';
import './Producao.css';

const ETAPAS_PADRAO = [
  { sequencia: 1, nome: 'Corte / Preparação', tempo_previsto_min: 60 },
  { sequencia: 2, nome: 'Caldeiraria', tempo_previsto_min: 480 },
  { sequencia: 3, nome: 'Usinagem', tempo_previsto_min: 360 },
  { sequencia: 4, nome: 'Montagem', tempo_previsto_min: 480 },
  { sequencia: 5, nome: 'Pintura / Acabamento', tempo_previsto_min: 120 },
  { sequencia: 6, nome: 'Teste / Inspeção', tempo_previsto_min: 60 },
];

const RoteirosProducao = () => {
  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ produto_codigo: '', produto_descricao: '', versao: '1.0', observacoes: '', etapas: ETAPAS_PADRAO });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [m, res] = await Promise.all([fetchProducaoMeta(), api.get('/producao/roteiros')]);
      setMeta(m);
      setRows(res.data || []);
    } catch (e) {
      toast.error(e.response?.data?.error || 'Erro ao carregar roteiros');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openNew = () => {
    setEditing(null);
    setForm({ produto_codigo: '', produto_descricao: '', versao: '1.0', observacoes: '', etapas: [...ETAPAS_PADRAO] });
    setShowModal(true);
  };

  const openEdit = async (row) => {
    try {
      const { data } = await api.get(`/producao/roteiros/${row.id}`);
      setEditing(data);
      setForm({
        produto_codigo: data.produto_codigo,
        produto_descricao: data.produto_descricao || '',
        versao: data.versao || '1.0',
        observacoes: data.observacoes || '',
        etapas: data.etapas?.length ? data.etapas : [...ETAPAS_PADRAO],
      });
      setShowModal(true);
    } catch (e) {
      toast.error('Erro ao carregar roteiro');
    }
  };

  const salvar = async (e) => {
    e.preventDefault();
    if (!form.produto_codigo) { toast.warning('Código do produto é obrigatório'); return; }
    setSaving(true);
    try {
      const payload = {
        ...form,
        etapas: form.etapas.map((et, i) => ({
          sequencia: et.sequencia || i + 1,
          nome: et.nome,
          maquina_id: et.maquina_id || null,
          tempo_previsto_min: Number(et.tempo_previsto_min) || 0,
        })),
      };
      if (editing) {
        await api.put(`/producao/roteiros/${editing.id}`, payload);
        toast.success('Roteiro atualizado');
      } else {
        await api.post('/producao/roteiros', payload);
        toast.success('Roteiro criado');
      }
      setShowModal(false);
      load();
    } catch (e) {
      toast.error(e.response?.data?.error || 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  };

  const excluir = async (id) => {
    if (!window.confirm('Confirma exclusão do roteiro?')) return;
    try {
      await api.delete(`/producao/roteiros/${id}`);
      toast.success('Roteiro excluído');
      load();
    } catch (e) {
      toast.error(e.response?.data?.error || 'Erro ao excluir');
    }
  };

  const updateEtapa = (idx, field, value) => {
    setForm((f) => {
      const etapas = [...f.etapas];
      etapas[idx] = { ...etapas[idx], [field]: value };
      return { ...f, etapas };
    });
  };

  return (
    <div className="producao-page">
      <ProducaoPageHeader
        title="Roteiros de Produção"
        subtitle="Sequência de etapas por produto — aplicada automaticamente nas novas OPs"
        actions={(
          <button type="button" className="producao-btn producao-btn-primary" onClick={openNew}>
            <FiPlus /> Novo roteiro
          </button>
        )}
      />

      {loading ? <div className="producao-empty">Carregando...</div> : (
        <div className="producao-table-wrap">
          <table className="producao-table">
            <thead>
              <tr><th>Código</th><th>Descrição</th><th>Versão</th><th>Etapas</th><th>Ações</th></tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={5} style={{ textAlign: 'center' }}>Nenhum roteiro cadastrado</td></tr>
              ) : rows.map((r) => (
                <tr key={r.id}>
                  <td><strong>{r.produto_codigo}</strong></td>
                  <td>{r.produto_descricao || '—'}</td>
                  <td>{r.versao}</td>
                  <td>{r.total_etapas}</td>
                  <td>
                    <div className="producao-actions">
                      <button type="button" className="producao-icon-btn" onClick={() => openEdit(r)}><FiEdit /></button>
                      <button type="button" className="producao-icon-btn" onClick={() => excluir(r.id)}><FiTrash2 /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <div className="producao-modal-overlay" onClick={() => setShowModal(false)}>
          <div className="producao-modal" style={{ maxWidth: 720 }} onClick={(e) => e.stopPropagation()}>
            <div className="producao-modal-header">
              <h2>{editing ? 'Editar roteiro' : 'Novo roteiro'}</h2>
              <button type="button" className="producao-icon-btn" onClick={() => setShowModal(false)}><FiX /></button>
            </div>
            <form onSubmit={salvar}>
              <div className="producao-modal-body">
                <div className="producao-form-grid">
                  <div className="producao-form-group">
                    <label>Código produto *</label>
                    <input value={form.produto_codigo} onChange={(e) => setForm((f) => ({ ...f, produto_codigo: e.target.value }))} required disabled={!!editing} />
                  </div>
                  <div className="producao-form-group">
                    <label>Versão</label>
                    <input value={form.versao} onChange={(e) => setForm((f) => ({ ...f, versao: e.target.value }))} />
                  </div>
                  <div className="producao-form-group full">
                    <label>Descrição</label>
                    <input value={form.produto_descricao} onChange={(e) => setForm((f) => ({ ...f, produto_descricao: e.target.value }))} />
                  </div>
                </div>
                <h4 style={{ margin: '16px 0 8px' }}>Etapas</h4>
                {form.etapas.map((et, idx) => (
                  <div key={idx} className="producao-form-grid" style={{ marginBottom: 8, paddingBottom: 8, borderBottom: '1px solid var(--gmp-border)' }}>
                    <div className="producao-form-group">
                      <label>Seq.</label>
                      <input type="number" value={et.sequencia} onChange={(e) => updateEtapa(idx, 'sequencia', e.target.value)} />
                    </div>
                    <div className="producao-form-group">
                      <label>Nome</label>
                      <input value={et.nome} onChange={(e) => updateEtapa(idx, 'nome', e.target.value)} />
                    </div>
                    <div className="producao-form-group">
                      <label>Máquina</label>
                      <select value={et.maquina_id || ''} onChange={(e) => updateEtapa(idx, 'maquina_id', e.target.value)}>
                        <option value="">—</option>
                        {(meta?.maquinas || []).map((m) => (
                          <option key={m.id} value={m.id}>{m.codigo}</option>
                        ))}
                      </select>
                    </div>
                    <div className="producao-form-group">
                      <label>Tempo (min)</label>
                      <input type="number" value={et.tempo_previsto_min} onChange={(e) => updateEtapa(idx, 'tempo_previsto_min', e.target.value)} />
                    </div>
                  </div>
                ))}
              </div>
              <div className="producao-modal-footer">
                <button type="button" className="producao-btn producao-btn-secondary" onClick={() => setShowModal(false)}>Cancelar</button>
                <button type="submit" className="producao-btn producao-btn-primary" disabled={saving}>Salvar</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default RoteirosProducao;
