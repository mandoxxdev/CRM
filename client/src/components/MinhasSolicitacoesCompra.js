import React, { useEffect, useState } from 'react';
import api from '../services/api';
import { toast } from 'react-toastify';
import './MinhasSolicitacoesCompra.css';

export default function MinhasSolicitacoesCompra() {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);

  async function load() {
    setLoading(true);
    try {
      const res = await api.get('/solicitacoes-compra/minhas');
      setRows(res.data?.solicitacoes || []);
    } catch (e) {
      toast.error(e.response?.data?.error || 'Erro ao carregar suas solicitações');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const label = (s) => {
    if (s === 'pendente') return 'Pendente';
    if (s === 'aprovada') return 'Aprovada';
    if (s === 'rejeitada') return 'Rejeitada';
    if (s === 'cancelada') return 'Cancelada';
    return s || '-';
  };

  return (
    <div className="msc">
      <header className="msc-hero">
        <div>
          <h1>Minhas solicitações</h1>
          <p>Acompanhe o status e quem aprovou/reprovou.</p>
        </div>
        <button className="msc-btn" type="button" onClick={load} disabled={loading}>Atualizar</button>
      </header>

      <div className="msc-card">
        {loading ? (
          <div className="msc-muted">Carregando…</div>
        ) : (
          <div className="msc-table">
            <div className="msc-row head">
              <div>ID</div>
              <div>Setor</div>
              <div>Status</div>
              <div>Decisão</div>
              <div>Data</div>
            </div>
            {rows.map((r) => (
              <div className="msc-row" key={r.id}>
                <div><span className="msc-pill">#{r.id}</span></div>
                <div>{r.setor}</div>
                <div><span className={`msc-status ${r.status}`}>{label(r.status)}</span></div>
                <div className="msc-muted">{r.decisor_nome ? `por ${r.decisor_nome}` : '—'}</div>
                <div className="msc-muted">{r.created_at ? new Date(r.created_at).toLocaleString('pt-BR') : '—'}</div>
              </div>
            ))}
            {!rows.length ? <div className="msc-muted">Nenhuma solicitação ainda.</div> : null}
          </div>
        )}
      </div>
    </div>
  );
}

