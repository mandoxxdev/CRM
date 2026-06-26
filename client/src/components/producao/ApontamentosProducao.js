import React, { useState, useEffect, useCallback } from 'react';
import api from '../../services/api';
import { fetchProducaoMeta, invalidateProducaoDashboardCache } from '../../utils/producaoApi';
import { toast } from 'react-toastify';
import { FiPlay, FiSquare, FiRefreshCw } from 'react-icons/fi';
import ProducaoPageHeader from './ProducaoPageHeader';
import './Producao.css';

const ApontamentosProducao = () => {
  const [meta, setMeta] = useState(null);
  const [ops, setOps] = useState([]);
  const [apontamentos, setApontamentos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({ op_id: '', maquina_id: '', colaborador_id: '', operador_nome: '', observacoes: '' });
  const [finalizar, setFinalizar] = useState({ quantidade_produzida: '', quantidade_refugo: '', observacoes: '' });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [m, liberadas, emProducao, apont] = await Promise.all([
        fetchProducaoMeta(),
        api.get('/producao/ops', { params: { status: 'liberada' } }),
        api.get('/producao/ops', { params: { status: 'em_producao' } }),
        api.get('/producao/apontamentos', { params: { em_andamento: '1' } }),
      ]);
      setMeta(m);
      setOps([...(liberadas.data || []), ...(emProducao.data || [])]);
      setApontamentos(apont.data || []);
    } catch (e) {
      toast.error(e.response?.data?.error || 'Erro ao carregar apontamentos');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const iniciar = async () => {
    if (!form.op_id) { toast.warning('Selecione uma OP'); return; }
    setSaving(true);
    try {
      await api.post('/producao/apontamentos/iniciar', {
        ...form,
        op_id: Number(form.op_id),
        maquina_id: form.maquina_id ? Number(form.maquina_id) : null,
        colaborador_id: form.colaborador_id ? Number(form.colaborador_id) : null,
      });
      toast.success('Apontamento iniciado');
      setModal(null);
      invalidateProducaoDashboardCache();
      load();
    } catch (e) {
      toast.error(e.response?.data?.error || 'Erro ao iniciar');
    } finally {
      setSaving(false);
    }
  };

  const encerrar = async (id) => {
    setSaving(true);
    try {
      await api.post(`/producao/apontamentos/${id}/finalizar`, {
        quantidade_produzida: Number(finalizar.quantidade_produzida) || 0,
        quantidade_refugo: Number(finalizar.quantidade_refugo) || 0,
        observacoes: finalizar.observacoes,
      });
      toast.success('Apontamento finalizado');
      setModal(null);
      setFinalizar({ quantidade_produzida: '', quantidade_refugo: '', observacoes: '' });
      invalidateProducaoDashboardCache();
      load();
    } catch (e) {
      toast.error(e.response?.data?.error || 'Erro ao finalizar');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="producao-page">
      <ProducaoPageHeader
        title="Apontamento de Produção"
        subtitle="Iniciar e encerrar apontamentos no chão de fábrica"
        actions={(
          <>
            <button type="button" className="producao-btn producao-btn-secondary" onClick={load}>
              <FiRefreshCw /> Atualizar
            </button>
            <button type="button" className="producao-btn producao-btn-primary" onClick={() => { setModal('iniciar'); setForm({ op_id: '', maquina_id: '', colaborador_id: '', operador_nome: '', observacoes: '' }); }}>
              <FiPlay /> Iniciar apontamento
            </button>
          </>
        )}
      />

      {loading ? (
        <div className="producao-empty">Carregando...</div>
      ) : (
        <>
          <div className="producao-card" style={{ marginBottom: 20 }}>
            <h3>Apontamentos em andamento</h3>
            {apontamentos.length === 0 ? (
              <p style={{ color: 'var(--gmp-text-light)' }}>Nenhum apontamento ativo</p>
            ) : (
              apontamentos.map((a) => (
                <div key={a.id} className="producao-apontamento-ativo" style={{ marginBottom: 12 }}>
                  <strong>{a.numero_op}</strong> — {a.produto_descricao}
                  <div style={{ fontSize: '0.85rem', color: 'var(--gmp-text-light)', marginTop: 4 }}>
                    Início: {new Date(a.data_inicio).toLocaleString('pt-BR')}
                    {a.maquina_codigo && ` | Máquina: ${a.maquina_codigo}`}
                    {a.operador_nome && ` | Operador: ${a.operador_nome}`}
                  </div>
                  <button
                    type="button"
                    className="producao-btn producao-btn-danger producao-btn-sm"
                    style={{ marginTop: 8 }}
                    onClick={() => { setModal('finalizar'); setForm({ id: a.id }); }}
                  >
                    <FiSquare /> Encerrar
                  </button>
                </div>
              ))
            )}
          </div>

          <div className="producao-card">
            <h3>OPs disponíveis para apontamento</h3>
            <div className="producao-table-wrap">
              <table className="producao-table">
                <thead>
                  <tr><th>OP</th><th>Produto</th><th>Progresso</th><th>Máquina</th></tr>
                </thead>
                <tbody>
                  {ops.length === 0 ? (
                    <tr><td colSpan={4} style={{ textAlign: 'center' }}>Nenhuma OP liberada ou em produção</td></tr>
                  ) : ops.map((op) => (
                    <tr key={op.id}>
                      <td>{op.numero_op}</td>
                      <td>{op.produto_descricao}</td>
                      <td>{op.quantidade_produzida}/{op.quantidade_planejada}</td>
                      <td>{op.maquina_codigo || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {modal === 'iniciar' && (
        <div className="producao-modal-overlay" onClick={() => setModal(null)}>
          <div className="producao-modal" onClick={(e) => e.stopPropagation()}>
            <div className="producao-modal-header"><h2>Iniciar apontamento</h2></div>
            <div className="producao-modal-body">
              <div className="producao-form-grid">
                <div className="producao-form-group full">
                  <label>Ordem de Produção *</label>
                  <select value={form.op_id} onChange={(e) => setForm((f) => ({ ...f, op_id: e.target.value }))}>
                    <option value="">— Selecionar —</option>
                    {ops.map((op) => (
                      <option key={op.id} value={op.id}>{op.numero_op} — {op.produto_descricao}</option>
                    ))}
                  </select>
                </div>
                <div className="producao-form-group">
                  <label>Máquina</label>
                  <select value={form.maquina_id} onChange={(e) => setForm((f) => ({ ...f, maquina_id: e.target.value }))}>
                    <option value="">— Automático —</option>
                    {(meta?.maquinas || []).map((m) => (
                      <option key={m.id} value={m.id}>{m.codigo}</option>
                    ))}
                  </select>
                </div>
                <div className="producao-form-group">
                  <label>Operador</label>
                  <select value={form.colaborador_id} onChange={(e) => setForm((f) => ({ ...f, colaborador_id: e.target.value }))}>
                    <option value="">— Selecionar —</option>
                    {(meta?.colaboradores || []).map((c) => (
                      <option key={c.id} value={c.id}>{c.nome}</option>
                    ))}
                  </select>
                </div>
                <div className="producao-form-group full">
                  <label>Observações</label>
                  <textarea value={form.observacoes} onChange={(e) => setForm((f) => ({ ...f, observacoes: e.target.value }))} />
                </div>
              </div>
            </div>
            <div className="producao-modal-footer">
              <button type="button" className="producao-btn producao-btn-secondary" onClick={() => setModal(null)}>Cancelar</button>
              <button type="button" className="producao-btn producao-btn-primary" disabled={saving} onClick={iniciar}>
                <FiPlay /> Iniciar
              </button>
            </div>
          </div>
        </div>
      )}

      {modal === 'finalizar' && (
        <div className="producao-modal-overlay" onClick={() => setModal(null)}>
          <div className="producao-modal" onClick={(e) => e.stopPropagation()}>
            <div className="producao-modal-header"><h2>Encerrar apontamento</h2></div>
            <div className="producao-modal-body">
              <div className="producao-form-grid">
                <div className="producao-form-group">
                  <label>Quantidade produzida</label>
                  <input type="number" min="0" step="1" value={finalizar.quantidade_produzida} onChange={(e) => setFinalizar((f) => ({ ...f, quantidade_produzida: e.target.value }))} />
                </div>
                <div className="producao-form-group">
                  <label>Refugo</label>
                  <input type="number" min="0" step="1" value={finalizar.quantidade_refugo} onChange={(e) => setFinalizar((f) => ({ ...f, quantidade_refugo: e.target.value }))} />
                </div>
                <div className="producao-form-group full">
                  <label>Observações</label>
                  <textarea value={finalizar.observacoes} onChange={(e) => setFinalizar((f) => ({ ...f, observacoes: e.target.value }))} />
                </div>
              </div>
            </div>
            <div className="producao-modal-footer">
              <button type="button" className="producao-btn producao-btn-secondary" onClick={() => setModal(null)}>Cancelar</button>
              <button type="button" className="producao-btn producao-btn-primary" disabled={saving} onClick={() => encerrar(form.id)}>
                <FiSquare /> Encerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ApontamentosProducao;
