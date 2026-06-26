import React, { useState, useEffect, useCallback } from 'react';
import api from '../../services/api';
import { fetchProducaoMeta, STATUS_MAQUINA_LABELS, statusMaquinaClass, invalidateProducaoDashboardCache } from '../../utils/producaoApi';
import { toast } from 'react-toastify';
import { FiPlus, FiSearch, FiEdit, FiTrash2, FiX } from 'react-icons/fi';
import ProducaoPageHeader from './ProducaoPageHeader';
import './Producao.css';

const defaultForm = (meta) => ({
  codigo: '', nome: '', setor: meta?.setores?.[0] || '', tipo: 'maquina',
  status: 'disponivel', capacidade_hora: 1, centro_trabalho: '', observacoes: '',
});

const MaquinasProducao = () => {
  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [m, res] = await Promise.all([
        fetchProducaoMeta(),
        api.get('/producao/maquinas', { params: search ? { search } : {} }),
      ]);
      setMeta(m);
      setRows(res.data || []);
    } catch (e) {
      toast.error(e.response?.data?.error || 'Erro ao carregar máquinas');
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => { load(); }, [load]);

  const openNew = () => { setEditing(null); setForm(defaultForm(meta)); setShowModal(true); };
  const openEdit = (row) => {
    setEditing(row);
    setForm({ ...defaultForm(meta), ...row });
    setShowModal(true);
  };

  const salvar = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = { ...form, capacidade_hora: Number(form.capacidade_hora) || 1 };
      if (editing) {
        await api.put(`/producao/maquinas/${editing.id}`, payload);
        toast.success('Máquina atualizada');
      } else {
        await api.post('/producao/maquinas', payload);
        toast.success('Máquina cadastrada');
      }
      setShowModal(false);
      invalidateProducaoDashboardCache();
      load();
    } catch (e) {
      toast.error(e.response?.data?.error || 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  };

  const excluir = async (id) => {
    if (!window.confirm('Confirma exclusão?')) return;
    try {
      await api.delete(`/producao/maquinas/${id}`);
      toast.success('Máquina excluída');
      load();
    } catch (e) {
      toast.error(e.response?.data?.error || 'Erro ao excluir');
    }
  };

  return (
    <div className="producao-page">
      <ProducaoPageHeader
        title="Máquinas e Centros de Trabalho"
        subtitle="Cadastro de equipamentos do chão de fábrica"
        actions={(
          <button type="button" className="producao-btn producao-btn-primary" onClick={openNew}>
            <FiPlus /> Nova máquina
          </button>
        )}
      />

      <div className="producao-toolbar">
        <div className="producao-search">
          <FiSearch />
          <input placeholder="Buscar código, nome, setor..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>

      {loading ? <div className="producao-empty">Carregando...</div> : (
        <div className="producao-table-wrap">
          <table className="producao-table">
            <thead>
              <tr><th>Código</th><th>Nome</th><th>Setor</th><th>Tipo</th><th>Capacidade/h</th><th>Status</th><th>Ações</th></tr>
            </thead>
            <tbody>
              {rows.map((m) => (
                <tr key={m.id}>
                  <td><strong>{m.codigo}</strong></td>
                  <td>{m.nome}</td>
                  <td>{m.setor || '—'}</td>
                  <td>{m.tipo}</td>
                  <td>{m.capacidade_hora}</td>
                  <td><span className={`producao-badge ${statusMaquinaClass(m.status)}`}>{STATUS_MAQUINA_LABELS[m.status] || m.status}</span></td>
                  <td>
                    <div className="producao-actions">
                      <button type="button" className="producao-icon-btn" onClick={() => openEdit(m)}><FiEdit /></button>
                      <button type="button" className="producao-icon-btn" onClick={() => excluir(m.id)}><FiTrash2 /></button>
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
          <div className="producao-modal" onClick={(e) => e.stopPropagation()}>
            <div className="producao-modal-header">
              <h2>{editing ? 'Editar máquina' : 'Nova máquina'}</h2>
              <button type="button" className="producao-icon-btn" onClick={() => setShowModal(false)}><FiX /></button>
            </div>
            <form onSubmit={salvar}>
              <div className="producao-modal-body">
                <div className="producao-form-grid">
                  <div className="producao-form-group">
                    <label>Código *</label>
                    <input value={form.codigo} onChange={(e) => setForm((f) => ({ ...f, codigo: e.target.value.toUpperCase() }))} required />
                  </div>
                  <div className="producao-form-group">
                    <label>Nome *</label>
                    <input value={form.nome} onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))} required />
                  </div>
                  <div className="producao-form-group">
                    <label>Setor</label>
                    <select value={form.setor} onChange={(e) => setForm((f) => ({ ...f, setor: e.target.value }))}>
                      <option value="">—</option>
                      {(meta?.setores || []).map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div className="producao-form-group">
                    <label>Status</label>
                    <select value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}>
                      {(meta?.statusMaquina || []).map((s) => (
                        <option key={s} value={s}>{STATUS_MAQUINA_LABELS[s] || s}</option>
                      ))}
                    </select>
                  </div>
                  <div className="producao-form-group">
                    <label>Capacidade/hora</label>
                    <input type="number" min="0.1" step="0.1" value={form.capacidade_hora} onChange={(e) => setForm((f) => ({ ...f, capacidade_hora: e.target.value }))} />
                  </div>
                  <div className="producao-form-group full">
                    <label>Observações</label>
                    <textarea value={form.observacoes || ''} onChange={(e) => setForm((f) => ({ ...f, observacoes: e.target.value }))} />
                  </div>
                </div>
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

export default MaquinasProducao;
