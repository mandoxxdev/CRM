import React, { useEffect, useMemo, useState } from 'react';
import api from '../services/api';
import { toast } from 'react-toastify';
import { FiCheckCircle, FiXCircle, FiSearch, FiFilter, FiEye } from 'react-icons/fi';
import './ComprasSolicitacoesCompra.css';

export default function ComprasSolicitacoesCompra() {
  const [loading, setLoading] = useState(true);
  const [solicitacoes, setSolicitacoes] = useState([]);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [setor, setSetor] = useState('');
  const [selected, setSelected] = useState(null);
  const [details, setDetails] = useState(null);
  const [decision, setDecision] = useState({ open: false, acao: null, motivo: '' });

  const setoresDisponiveis = useMemo(() => {
    const s = new Set();
    (solicitacoes || []).forEach((x) => x.setor && s.add(x.setor));
    return Array.from(s).sort((a, b) => String(a).localeCompare(String(b)));
  }, [solicitacoes]);

  async function load() {
    setLoading(true);
    try {
      const res = await api.get('/compras/solicitacoes-compra', { params: { q, status, setor } });
      setSolicitacoes(res.data?.solicitacoes || []);
    } catch (e) {
      toast.error(e.response?.data?.error || 'Erro ao carregar solicitações');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openDetails = async (row) => {
    setSelected(row);
    setDetails(null);
    try {
      const res = await api.get(`/compras/solicitacoes-compra/${row.id}`);
      setDetails(res.data);
    } catch (e) {
      toast.error(e.response?.data?.error || 'Erro ao carregar detalhes');
    }
  };

  const decide = async () => {
    if (!selected || !decision.acao) return;
    try {
      await api.post(`/compras/solicitacoes-compra/${selected.id}/decisao`, {
        acao: decision.acao,
        motivo: decision.acao === 'rejeitar' ? (decision.motivo || '').trim() : null,
      });
      toast.success('Decisão registrada');
      setDecision({ open: false, acao: null, motivo: '' });
      setSelected(null);
      setDetails(null);
      await load();
    } catch (e) {
      toast.error(e.response?.data?.error || 'Erro ao registrar decisão');
    }
  };

  const statusLabel = (s) => {
    if (s === 'pendente') return 'Pendente';
    if (s === 'aprovada') return 'Aprovada';
    if (s === 'rejeitada') return 'Rejeitada';
    if (s === 'cancelada') return 'Cancelada';
    return s || '-';
  };

  return (
    <div className="csc">
      <header className="csc-hero">
        <div>
          <h1>Solicitações de Compra</h1>
          <p>Aprovação global das solicitações enviadas por todos os setores.</p>
        </div>
        <button className="csc-btn" type="button" onClick={load} disabled={loading}>
          Atualizar
        </button>
      </header>

      <div className="csc-filters">
        <div className="csc-filter">
          <FiSearch />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por título/observações…" />
        </div>
        <div className="csc-filter">
          <FiFilter />
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Todos status</option>
            <option value="pendente">Pendente</option>
            <option value="aprovada">Aprovada</option>
            <option value="rejeitada">Rejeitada</option>
            <option value="cancelada">Cancelada</option>
          </select>
        </div>
        <div className="csc-filter">
          <FiFilter />
          <select value={setor} onChange={(e) => setSetor(e.target.value)}>
            <option value="">Todos setores</option>
            {setoresDisponiveis.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
        <button className="csc-btn csc-btn--primary" type="button" onClick={load}>
          Aplicar
        </button>
      </div>

      <div className="csc-grid">
        <section className="csc-card">
          <div className="csc-card-title">Fila</div>
          {loading ? (
            <div className="csc-muted">Carregando…</div>
          ) : (
            <div className="csc-table">
              <div className="csc-row head">
                <div>ID</div>
                <div>Setor</div>
                <div>Solicitante</div>
                <div>Status</div>
                <div>Ações</div>
              </div>
              {(solicitacoes || []).map((r) => (
                <div className="csc-row" key={r.id}>
                  <div><span className="csc-pill">#{r.id}</span></div>
                  <div>{r.setor}</div>
                  <div>
                    <div className="csc-strong">{r.solicitante_nome || '-'}</div>
                    <div className="csc-muted">{r.solicitante_email || ''}</div>
                  </div>
                  <div>
                    <span className={`csc-status ${r.status}`}>{statusLabel(r.status)}</span>
                    {r.decisor_nome ? <div className="csc-muted">por {r.decisor_nome}</div> : null}
                  </div>
                  <div className="csc-actions">
                    <button className="csc-iconbtn" type="button" onClick={() => openDetails(r)} title="Ver detalhes">
                      <FiEye />
                    </button>
                    {r.status === 'pendente' ? (
                      <>
                        <button
                          className="csc-iconbtn ok"
                          type="button"
                          onClick={() => { setSelected(r); setDecision({ open: true, acao: 'aprovar', motivo: '' }); }}
                          title="Aprovar"
                        >
                          <FiCheckCircle />
                        </button>
                        <button
                          className="csc-iconbtn no"
                          type="button"
                          onClick={() => { setSelected(r); setDecision({ open: true, acao: 'rejeitar', motivo: '' }); }}
                          title="Rejeitar"
                        >
                          <FiXCircle />
                        </button>
                      </>
                    ) : null}
                  </div>
                </div>
              ))}
              {(!solicitacoes || solicitacoes.length === 0) ? <div className="csc-muted">Nenhuma solicitação.</div> : null}
            </div>
          )}
        </section>

        <aside className="csc-card csc-card--side">
          <div className="csc-card-title">Detalhes</div>
          {!selected ? (
            <div className="csc-muted">Selecione uma solicitação para ver os itens.</div>
          ) : !details ? (
            <div className="csc-muted">Carregando detalhes…</div>
          ) : (
            <div className="csc-details">
              <div className="csc-kv">
                <div className="k">ID</div><div className="v">#{details.solicitacao.id}</div>
                <div className="k">Setor</div><div className="v">{details.solicitacao.setor}</div>
                <div className="k">Solicitante</div><div className="v">{details.solicitacao.solicitante_nome}</div>
                <div className="k">Status</div><div className="v">{statusLabel(details.solicitacao.status)}</div>
              </div>
              {details.solicitacao.observacoes ? (
                <div className="csc-note">
                  <div className="csc-strong">Observações</div>
                  <div className="csc-muted">{details.solicitacao.observacoes}</div>
                </div>
              ) : null}
              <div className="csc-strong" style={{ marginTop: 10 }}>Itens</div>
              <div className="csc-items">
                {(details.itens || []).map((it) => (
                  <div className="csc-item" key={it.id}>
                    <div className="thumb">{it.foto_url ? <img src={it.foto_url} alt={it.nome} /> : <div className="ph">—</div>}</div>
                    <div className="meta">
                      <div className="csc-strong">{it.nome}</div>
                      <div className="csc-muted">{it.descricao || '—'}</div>
                      <div className="csc-muted">{it.quantidade} {it.unidade || ''}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </aside>
      </div>

      {decision.open ? (
        <div className="csc-modal">
          <div className="csc-modal-card">
            <div className="csc-modal-title">{decision.acao === 'aprovar' ? 'Aprovar solicitação' : 'Rejeitar solicitação'}</div>
            {decision.acao === 'rejeitar' ? (
              <>
                <label>Motivo da rejeição</label>
                <textarea value={decision.motivo} onChange={(e) => setDecision((p) => ({ ...p, motivo: e.target.value }))} rows={4} />
              </>
            ) : (
              <div className="csc-muted">Confirmar aprovação?</div>
            )}
            <div className="csc-modal-actions">
              <button className="csc-btn" type="button" onClick={() => setDecision({ open: false, acao: null, motivo: '' })}>
                Cancelar
              </button>
              <button className={`csc-btn ${decision.acao === 'aprovar' ? 'csc-btn--ok' : 'csc-btn--no'}`} type="button" onClick={decide}>
                Confirmar
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

