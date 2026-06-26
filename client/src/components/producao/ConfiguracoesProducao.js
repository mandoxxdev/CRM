import React, { useState, useEffect, useCallback } from 'react';
import api from '../../services/api';
import { toast } from 'react-toastify';
import { FiPlus, FiEdit, FiTrash2, FiX } from 'react-icons/fi';
import ProducaoPageHeader from './ProducaoPageHeader';
import './Producao.css';

const ConfiguracoesProducao = () => {
  const [motivos, setMotivos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ descricao: '', categoria: 'outros', tipo: 'nao_planejada' });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/producao/motivos-parada');
      setMotivos(data || []);
    } catch (e) {
      toast.error(e.response?.data?.error || 'Erro ao carregar configurações');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const salvar = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editing) {
        await api.put(`/producao/motivos-parada/${editing.id}`, form);
        toast.success('Motivo atualizado');
      } else {
        await api.post('/producao/motivos-parada', form);
        toast.success('Motivo criado');
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
    if (!window.confirm('Confirma exclusão?')) return;
    try {
      await api.delete(`/producao/motivos-parada/${id}`);
      toast.success('Motivo excluído');
      load();
    } catch (e) {
      toast.error(e.response?.data?.error || 'Erro ao excluir');
    }
  };

  return (
    <div className="producao-page">
      <ProducaoPageHeader
        title="Configurações — Produção"
        subtitle="Motivos de parada e parâmetros do módulo (administradores)"
        actions={(
          <button type="button" className="producao-btn producao-btn-primary" onClick={() => { setEditing(null); setForm({ descricao: '', categoria: 'outros', tipo: 'nao_planejada' }); setShowModal(true); }}>
            <FiPlus /> Novo motivo
          </button>
        )}
      />

      <div className="producao-card">
        <h3>Motivos de parada</h3>
        {loading ? <div className="producao-empty">Carregando...</div> : (
          <div className="producao-table-wrap">
            <table className="producao-table">
              <thead>
                <tr><th>Descrição</th><th>Categoria</th><th>Tipo</th><th>Ações</th></tr>
              </thead>
              <tbody>
                {motivos.map((m) => (
                  <tr key={m.id}>
                    <td>{m.descricao}</td>
                    <td>{m.categoria}</td>
                    <td><span className={`producao-badge ${m.tipo === 'planejada' ? 'info' : 'warning'}`}>{m.tipo}</span></td>
                    <td>
                      <div className="producao-actions">
                        <button type="button" className="producao-icon-btn" onClick={() => { setEditing(m); setForm({ descricao: m.descricao, categoria: m.categoria, tipo: m.tipo }); setShowModal(true); }}>
                          <FiEdit />
                        </button>
                        <button type="button" className="producao-icon-btn" onClick={() => excluir(m.id)}><FiTrash2 /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="producao-card" style={{ marginTop: 20 }}>
        <h3>Sobre o módulo</h3>
        <p style={{ color: 'var(--gmp-text-light)', fontSize: '0.9rem', lineHeight: 1.6 }}>
          Módulo Produção GMP — ordens de produção (OP), apontamentos, máquinas, roteiros e paradas.
          Integrado ao almoxarifado via requisições de material (menu lateral).
          Permissões gerenciadas pelo perfil do módulo Operacional.
        </p>
      </div>

      {showModal && (
        <div className="producao-modal-overlay" onClick={() => setShowModal(false)}>
          <div className="producao-modal" onClick={(e) => e.stopPropagation()}>
            <div className="producao-modal-header">
              <h2>{editing ? 'Editar motivo' : 'Novo motivo'}</h2>
              <button type="button" className="producao-icon-btn" onClick={() => setShowModal(false)}><FiX /></button>
            </div>
            <form onSubmit={salvar}>
              <div className="producao-modal-body">
                <div className="producao-form-grid">
                  <div className="producao-form-group full">
                    <label>Descrição *</label>
                    <input value={form.descricao} onChange={(e) => setForm((f) => ({ ...f, descricao: e.target.value }))} required />
                  </div>
                  <div className="producao-form-group">
                    <label>Categoria</label>
                    <select value={form.categoria} onChange={(e) => setForm((f) => ({ ...f, categoria: e.target.value }))}>
                      {['setup', 'material', 'manutencao', 'pessoal', 'processo', 'qualidade', 'utilidades', 'outros'].map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                  <div className="producao-form-group">
                    <label>Tipo</label>
                    <select value={form.tipo} onChange={(e) => setForm((f) => ({ ...f, tipo: e.target.value }))}>
                      <option value="planejada">Planejada</option>
                      <option value="nao_planejada">Não planejada</option>
                    </select>
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

export default ConfiguracoesProducao;
