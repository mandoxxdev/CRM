import React, { useEffect, useMemo, useState } from 'react';
import { toast } from 'react-toastify';
import api from '../../services/api';
import './SolicitacaoMaterialEscritorio.css';

export default function SolicitacaoMaterialEscritorio() {
  const [materiais, setMateriais] = useState([]);
  const [loading, setLoading] = useState(true);
  const [observacoes, setObservacoes] = useState('');
  const [linhas, setLinhas] = useState([{ material_id: '', quantidade: 1 }]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        setLoading(true);
        const res = await api.get('/engenharia/materiais-escritorio');
        if (!mounted) return;
        setMateriais(res.data?.materiais || []);
      } catch (e) {
        toast.error(e.response?.data?.error || 'Erro ao carregar materiais');
      } finally {
        if (mounted) setLoading(false);
      }
    }
    load();
    return () => {
      mounted = false;
    };
  }, []);

  const materiaisById = useMemo(() => {
    const m = new Map();
    (materiais || []).forEach((x) => m.set(String(x.id), x));
    return m;
  }, [materiais]);

  const addLinha = () => setLinhas((prev) => [...prev, { material_id: '', quantidade: 1 }]);
  const removeLinha = (idx) => setLinhas((prev) => prev.filter((_, i) => i !== idx));
  const updateLinha = (idx, patch) =>
    setLinhas((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));

  const itensValidos = useMemo(() => {
    return linhas
      .map((l) => ({
        material_id: l.material_id ? Number(l.material_id) : null,
        quantidade: Number(l.quantidade),
      }))
      .filter((x) => x.material_id && x.quantidade > 0);
  }, [linhas]);

  const onSubmit = async (e) => {
    e.preventDefault();
    if (itensValidos.length === 0) {
      toast.error('Selecione ao menos 1 item com quantidade > 0');
      return;
    }
    try {
      setSubmitting(true);
      const res = await api.post('/engenharia/solicitacoes-materiais-escritorio', {
        itens: itensValidos,
        observacoes,
      });
      toast.success(`Solicitação enviada (#${res.data?.solicitacao_id})`);
      setObservacoes('');
      setLinhas([{ material_id: '', quantidade: 1 }]);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao enviar solicitação');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="eng-solm">
      <div className="eng-solm-header">
        <h1>Solicitação de material de escritório</h1>
        <p>Selecione os materiais cadastrados. Ao enviar, o sistema dispara e-mail para Compras e para você.</p>
      </div>

      <form className="eng-solm-card" onSubmit={onSubmit}>
        {loading ? (
          <div className="eng-solm-loading">Carregando materiais…</div>
        ) : (
          <>
            <div className="eng-solm-table">
              <div className="eng-solm-row eng-solm-row--head">
                <div>Material</div>
                <div>Qtd</div>
                <div></div>
              </div>

              {linhas.map((l, idx) => {
                const mat = l.material_id ? materiaisById.get(String(l.material_id)) : null;
                return (
                  <div className="eng-solm-row" key={idx}>
                    <div>
                      <select
                        value={l.material_id}
                        onChange={(ev) => updateLinha(idx, { material_id: ev.target.value })}
                      >
                        <option value="">Selecione…</option>
                        {materiais.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.nome} {m.unidade ? `(${m.unidade})` : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <input
                        type="number"
                        min="1"
                        step="1"
                        value={l.quantidade}
                        onChange={(ev) => updateLinha(idx, { quantidade: ev.target.value })}
                      />
                      {mat?.unidade ? <span className="eng-solm-unit">{mat.unidade}</span> : null}
                    </div>
                    <div className="eng-solm-actions">
                      <button
                        type="button"
                        className="eng-solm-btn eng-solm-btn--ghost"
                        onClick={() => removeLinha(idx)}
                        disabled={linhas.length === 1}
                        title="Remover linha"
                      >
                        Remover
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="eng-solm-footer">
              <button type="button" className="eng-solm-btn eng-solm-btn--ghost" onClick={addLinha}>
                Adicionar item
              </button>
              <button type="submit" className="eng-solm-btn eng-solm-btn--primary" disabled={submitting}>
                {submitting ? 'Enviando…' : 'Enviar solicitação'}
              </button>
            </div>

            <div className="eng-solm-obs">
              <label>Observações (opcional)</label>
              <textarea value={observacoes} onChange={(e) => setObservacoes(e.target.value)} rows={4} />
            </div>
          </>
        )}
      </form>
    </div>
  );
}

