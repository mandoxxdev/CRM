import React, { useState, useEffect, useCallback } from 'react';
import api from '../../services/api';
import { fetchProducaoMeta, invalidateProducaoDashboardCache } from '../../utils/producaoApi';
import { toast } from 'react-toastify';
import { FiPlay, FiSquare, FiRefreshCw } from 'react-icons/fi';
import ProducaoPageHeader from './ProducaoPageHeader';
import './Producao.css';

const ParadasProducao = () => {
  const [meta, setMeta] = useState(null);
  const [paradas, setParadas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({ maquina_id: '', motivo_id: '', motivo_texto: '', op_id: '', observacoes: '' });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [m, res] = await Promise.all([
        fetchProducaoMeta(),
        api.get('/producao/paradas', { params: { em_andamento: '1' } }),
      ]);
      setMeta(m);
      const hist = await api.get('/producao/paradas');
      setParadas(hist.data || []);
    } catch (e) {
      toast.error(e.response?.data?.error || 'Erro ao carregar paradas');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const iniciar = async () => {
    if (!form.maquina_id) { toast.warning('Selecione a máquina'); return; }
    setSaving(true);
    try {
      await api.post('/producao/paradas/iniciar', {
        ...form,
        maquina_id: Number(form.maquina_id),
        motivo_id: form.motivo_id ? Number(form.motivo_id) : null,
        op_id: form.op_id ? Number(form.op_id) : null,
      });
      toast.success('Parada registrada');
      setModal(null);
      invalidateProducaoDashboardCache();
      load();
    } catch (e) {
      toast.error(e.response?.data?.error || 'Erro ao registrar parada');
    } finally {
      setSaving(false);
    }
  };

  const finalizar = async (id) => {
    setSaving(true);
    try {
      await api.post(`/producao/paradas/${id}/finalizar`, {});
      toast.success('Parada encerrada');
      invalidateProducaoDashboardCache();
      load();
    } catch (e) {
      toast.error(e.response?.data?.error || 'Erro ao encerrar');
    } finally {
      setSaving(false);
    }
  };

  const ativas = paradas.filter((p) => !p.data_fim);

  return (
    <div className="producao-page">
      <ProducaoPageHeader
        title="Paradas de Máquina"
        subtitle="Registro de paradas para cálculo de OEE básico"
        actions={(
          <>
            <button type="button" className="producao-btn producao-btn-secondary" onClick={load}><FiRefreshCw /> Atualizar</button>
            <button type="button" className="producao-btn producao-btn-primary" onClick={() => setModal('iniciar')}>
              <FiPlay /> Registrar parada
            </button>
          </>
        )}
      />

      {loading ? <div className="producao-empty">Carregando...</div> : (
        <>
          {ativas.length > 0 && (
            <div className="producao-card" style={{ marginBottom: 20 }}>
              <h3>Paradas em andamento</h3>
              {ativas.map((p) => (
                <div key={p.id} className="producao-apontamento-ativo" style={{ borderColor: '#ef4444' }}>
                  <strong>{p.maquina_codigo}</strong> — {p.motivo_descricao || p.motivo_texto || 'Sem motivo'}
                  <div style={{ fontSize: '0.85rem', color: 'var(--gmp-text-light)', marginTop: 4 }}>
                    Início: {new Date(p.data_inicio).toLocaleString('pt-BR')}
                  </div>
                  <button type="button" className="producao-btn producao-btn-primary producao-btn-sm" style={{ marginTop: 8 }} disabled={saving} onClick={() => finalizar(p.id)}>
                    <FiSquare /> Encerrar parada
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="producao-table-wrap">
            <table className="producao-table">
              <thead>
                <tr><th>Máquina</th><th>Motivo</th><th>Início</th><th>Fim</th><th>Duração (min)</th></tr>
              </thead>
              <tbody>
                {paradas.length === 0 ? (
                  <tr><td colSpan={5} style={{ textAlign: 'center' }}>Nenhuma parada registrada</td></tr>
                ) : paradas.slice(0, 50).map((p) => (
                  <tr key={p.id}>
                    <td>{p.maquina_codigo}</td>
                    <td>{p.motivo_descricao || p.motivo_texto || '—'}</td>
                    <td>{new Date(p.data_inicio).toLocaleString('pt-BR')}</td>
                    <td>{p.data_fim ? new Date(p.data_fim).toLocaleString('pt-BR') : <span className="producao-badge danger">Ativa</span>}</td>
                    <td>{p.duracao_minutos != null ? Math.round(p.duracao_minutos) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {modal === 'iniciar' && (
        <div className="producao-modal-overlay" onClick={() => setModal(null)}>
          <div className="producao-modal" onClick={(e) => e.stopPropagation()}>
            <div className="producao-modal-header"><h2>Registrar parada</h2></div>
            <div className="producao-modal-body">
              <div className="producao-form-grid">
                <div className="producao-form-group full">
                  <label>Máquina *</label>
                  <select value={form.maquina_id} onChange={(e) => setForm((f) => ({ ...f, maquina_id: e.target.value }))}>
                    <option value="">— Selecionar —</option>
                    {(meta?.maquinas || []).map((m) => (
                      <option key={m.id} value={m.id}>{m.codigo} — {m.nome}</option>
                    ))}
                  </select>
                </div>
                <div className="producao-form-group full">
                  <label>Motivo</label>
                  <select value={form.motivo_id} onChange={(e) => setForm((f) => ({ ...f, motivo_id: e.target.value }))}>
                    <option value="">— Selecionar —</option>
                    {(meta?.motivos || []).map((mot) => (
                      <option key={mot.id} value={mot.id}>{mot.descricao}</option>
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
              <button type="button" className="producao-btn producao-btn-primary" disabled={saving} onClick={iniciar}>Registrar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ParadasProducao;
