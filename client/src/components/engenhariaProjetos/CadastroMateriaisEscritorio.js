import React, { useEffect, useMemo, useState } from 'react';
import { toast } from 'react-toastify';
import api from '../../services/api';
import './CadastroMateriaisEscritorio.css';

export default function CadastroMateriaisEscritorio() {
  const [loading, setLoading] = useState(true);
  const [materiais, setMateriais] = useState([]);
  const [query, setQuery] = useState('');
  const [saving, setSaving] = useState(false);

  const [novo, setNovo] = useState({ nome: '', unidade: 'un', ativo: true });

  async function load() {
    setLoading(true);
    try {
      const res = await api.get('/engenharia/materiais-escritorio/admin');
      setMateriais(res.data?.materiais || []);
    } catch (e) {
      toast.error(e.response?.data?.error || 'Erro ao carregar materiais (admin)');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return materiais;
    return (materiais || []).filter((m) => String(m.nome || '').toLowerCase().includes(q));
  }, [materiais, query]);

  const toggleAtivo = async (m) => {
    try {
      await api.patch(`/engenharia/materiais-escritorio/${m.id}/ativo`, { ativo: m.ativo ? 0 : 1 });
      setMateriais((prev) => prev.map((x) => (x.id === m.id ? { ...x, ativo: m.ativo ? 0 : 1 } : x)));
    } catch (e) {
      toast.error(e.response?.data?.error || 'Erro ao alterar status');
    }
  };

  const updateItem = async (m, patch) => {
    try {
      setSaving(true);
      await api.put(`/engenharia/materiais-escritorio/${m.id}`, {
        nome: patch.nome ?? m.nome,
        unidade: patch.unidade ?? m.unidade,
      });
      setMateriais((prev) => prev.map((x) => (x.id === m.id ? { ...x, ...patch } : x)));
      toast.success('Material atualizado');
    } catch (e) {
      toast.error(e.response?.data?.error || 'Erro ao atualizar');
    } finally {
      setSaving(false);
    }
  };

  const create = async () => {
    const nome = novo.nome.trim();
    if (!nome) {
      toast.error('Informe o nome');
      return;
    }
    try {
      setSaving(true);
      const res = await api.post('/engenharia/materiais-escritorio', {
        nome,
        unidade: (novo.unidade || 'un').trim() || 'un',
        ativo: novo.ativo ? 1 : 0,
      });
      setNovo({ nome: '', unidade: 'un', ativo: true });
      setMateriais((prev) => [res.data, ...(prev || [])]);
      toast.success('Material criado');
    } catch (e) {
      toast.error(e.response?.data?.error || 'Erro ao criar');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="engp-mat">
      <div className="engp-mat-header">
        <div>
          <h1>Cadastro de materiais (escritório)</h1>
          <p>Administra a lista de materiais disponíveis para solicitação.</p>
        </div>
        <button type="button" className="engp-mat-btn" onClick={load} disabled={loading}>
          Atualizar
        </button>
      </div>

      <div className="engp-mat-shell">
        <div className="engp-mat-panel">
          <div className="engp-mat-panel-title">Novo material</div>
          <div className="engp-mat-form">
            <label>Nome</label>
            <input value={novo.nome} onChange={(e) => setNovo((p) => ({ ...p, nome: e.target.value }))} placeholder="Ex.: Papel A4" />
            <div className="engp-mat-form-row">
              <div>
                <label>Unidade</label>
                <input value={novo.unidade} onChange={(e) => setNovo((p) => ({ ...p, unidade: e.target.value }))} placeholder="un / cx / resma" />
              </div>
              <div className="engp-mat-switch">
                <label>Ativo</label>
                <button
                  type="button"
                  className={`engp-mat-toggle ${novo.ativo ? 'on' : 'off'}`}
                  onClick={() => setNovo((p) => ({ ...p, ativo: !p.ativo }))}
                >
                  {novo.ativo ? 'Sim' : 'Não'}
                </button>
              </div>
            </div>
            <button type="button" className="engp-mat-btn engp-mat-btn--primary" onClick={create} disabled={saving}>
              {saving ? 'Salvando…' : 'Cadastrar'}
            </button>
          </div>
        </div>

        <div className="engp-mat-list">
          <div className="engp-mat-list-top">
            <div className="engp-mat-panel-title">Materiais</div>
            <input
              className="engp-mat-search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar material…"
            />
          </div>

          {loading ? (
            <div className="engp-mat-loading">Carregando…</div>
          ) : (
            <div className="engp-mat-table">
              <div className="engp-mat-row head">
                <div>Nome</div>
                <div>Unidade</div>
                <div>Status</div>
              </div>
              {filtered.map((m) => (
                <div className="engp-mat-row" key={m.id}>
                  <div>
                    <input
                      className="engp-mat-inline"
                      defaultValue={m.nome}
                      onBlur={(e) => {
                        const v = e.target.value.trim();
                        if (v && v !== m.nome) updateItem(m, { nome: v });
                      }}
                    />
                  </div>
                  <div>
                    <input
                      className="engp-mat-inline small"
                      defaultValue={m.unidade || 'un'}
                      onBlur={(e) => {
                        const v = e.target.value.trim() || 'un';
                        if (v !== (m.unidade || 'un')) updateItem(m, { unidade: v });
                      }}
                    />
                  </div>
                  <div>
                    <button type="button" className={`engp-mat-pill ${m.ativo ? 'on' : 'off'}`} onClick={() => toggleAtivo(m)}>
                      {m.ativo ? 'Ativo' : 'Inativo'}
                    </button>
                  </div>
                </div>
              ))}
              {!filtered.length ? <div className="engp-mat-empty">Nenhum material encontrado.</div> : null}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

