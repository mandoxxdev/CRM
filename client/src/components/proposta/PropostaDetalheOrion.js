import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import api from '../../services/api';
import { toast } from 'react-toastify';
import {
  FiArrowLeft, FiEye, FiDownload, FiEdit, FiSend, FiCheck, FiX, FiCopy, FiRotateCcw, FiClock,
} from 'react-icons/fi';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import './PropostaDetalheOrion.css';

const STATUS_LABELS = {
  rascunho: 'Rascunho',
  enviada: 'Enviada',
  visualizada: 'Visualizada',
  aceita: 'Aceita',
  rejeitada: 'Rejeitada',
  expirada: 'Expirada',
  aprovada: 'Aprovada',
  cancelada: 'Cancelada',
};

const STATUS_COLORS = {
  rascunho: '#64748b',
  enviada: '#0ea5e9',
  visualizada: '#8b5cf6',
  aceita: '#22c55e',
  rejeitada: '#ef4444',
  expirada: '#f59e0b',
  aprovada: '#22c55e',
  cancelada: '#94a3b8',
};

const TIPO_PROPOSTA_LABELS = {
  comercial: 'Comercial',
  tecnica: 'Técnica',
  orcamento: 'Orçamento',
  aditivo: 'Aditivo',
};

export default function PropostaDetalheOrion() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [proposta, setProposta] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(null);
  const [rejeitarModal, setRejeitarModal] = useState(false);
  const [rejeitarMotivo, setRejeitarMotivo] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [propRes, histRes] = await Promise.all([
          api.get(`/propostas/${id}`),
          api.get(`/propostas/${id}/status-history`).catch(() => ({ data: [] })),
        ]);
        if (cancelled) return;
        setProposta(propRes.data);
        setHistory(Array.isArray(histRes.data) ? histRes.data : []);
      } catch (err) {
        if (!cancelled) toast.error(err.response?.data?.error || 'Erro ao carregar proposta.');
        if (err.response?.status === 404) navigate('/comercial/propostas');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [id, navigate]);

  const formatMoney = (v) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v) || 0);

  const openPreview = async () => {
    try {
      const { data } = await api.get(`/propostas/${id}/premium`, { responseType: 'text' });
      const blob = new Blob([data], { type: 'text/html; charset=utf-8' });
      const url = window.URL.createObjectURL(blob);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao abrir preview.');
    }
  };

  const openPdf = async () => {
    setActionLoading('pdf');
    try {
      const response = await api.get(`/propostas/${id}/pdf`, { responseType: 'blob' });
      const blob = new Blob([response.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `proposta-${(proposta?.numero_proposta || id).toString().replace(/[/\\]/g, '-')}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      toast.success('PDF baixado.');
    } catch (err) {
      toast.error(err.response?.data?.error || err.message || 'Erro ao gerar PDF.');
    } finally {
      setActionLoading(null);
    }
  };

  const runAction = async (action, extra) => {
    if (actionLoading) return;
    setActionLoading(action);
    try {
      if (action === 'enviar') {
        await api.post(`/propostas/${id}/enviar`);
        toast.success('Proposta marcada como enviada.');
      } else if (action === 'aceitar') {
        await api.post(`/propostas/${id}/aceitar`, { observacao: extra?.observacao });
        toast.success('Proposta aceita.');
      } else if (action === 'rejeitar') {
        await api.post(`/propostas/${id}/rejeitar`, { motivo_rejeicao: rejeitarMotivo, observacao: rejeitarMotivo });
        toast.success('Proposta rejeitada.');
        setRejeitarModal(false);
        setRejeitarMotivo('');
      } else if (action === 'nova-revisao') {
        await api.post(`/propostas/${id}/nova-revisao`);
        toast.success('Nova revisão criada.');
      } else if (action === 'clone') {
        const { data } = await api.post(`/propostas/${id}/clone`);
        toast.success('Proposta clonada.');
        navigate(`/comercial/propostas/editar/${data.id}`);
        return;
      }
      const [propRes, histRes] = await Promise.all([
        api.get(`/propostas/${id}`),
        api.get(`/propostas/${id}/status-history`).catch(() => ({ data: [] })),
      ]);
      setProposta(propRes.data);
      setHistory(Array.isArray(histRes.data) ? histRes.data : []);
    } catch (err) {
      toast.error(err.response?.data?.error || err.message || 'Erro na ação.');
    } finally {
      setActionLoading(null);
    }
  };

  const status = proposta?.status || 'rascunho';
  const isRascunho = status === 'rascunho';
  const canEdit = isRascunho;
  const canEnviar = isRascunho;
  const canAceitarRejeitar = status === 'enviada' || status === 'visualizada';
  const canNovaRevisao = ['enviada', 'visualizada', 'aceita', 'rejeitada', 'expirada'].includes(status);

  if (loading) {
    return (
      <div className="proposta-detalhe-orion">
        <div className="proposta-detalhe-orion-loading">Carregando...</div>
      </div>
    );
  }

  if (!proposta) {
    return null;
  }

  return (
    <div className="proposta-detalhe-orion">
      <header className="proposta-detalhe-orion-header">
        <Link to="/comercial/propostas" className="proposta-detalhe-orion-back">
          <FiArrowLeft /> Voltar
        </Link>
        <div className="proposta-detalhe-orion-title-row">
          <h1>Proposta {proposta.numero_proposta || proposta.id}</h1>
          <span
            className="proposta-detalhe-orion-status"
            style={{ backgroundColor: STATUS_COLORS[status] || STATUS_COLORS.rascunho }}
          >
            {STATUS_LABELS[status] || status}
          </span>
        </div>
        <p className="proposta-detalhe-orion-subtitle">{proposta.titulo || '—'}</p>
      </header>

      <div className="proposta-detalhe-orion-grid">
        <section className="proposta-detalhe-orion-card">
          <h2>Dados principais</h2>
          <dl className="proposta-detalhe-orion-dl">
            <dt>Cliente</dt>
            <dd>{proposta.cliente_nome || proposta.cliente_id || '—'}</dd>
            <dt>Valor total</dt>
            <dd>{formatMoney(proposta.valor_total)}</dd>
            <dt>Tipo de proposta</dt>
            <dd>{TIPO_PROPOSTA_LABELS[proposta.tipo_proposta] || proposta.tipo_proposta || '—'}</dd>
            <dt>Validade</dt>
            <dd>{proposta.validade ? format(new Date(proposta.validade), 'dd/MM/yyyy', { locale: ptBR }) : '—'}</dd>
            <dt>Expira em</dt>
            <dd>{proposta.expira_em ? format(new Date(proposta.expira_em), 'dd/MM/yyyy', { locale: ptBR }) : '—'}</dd>
            <dt>Enviada em</dt>
            <dd>{proposta.enviada_em ? format(new Date(proposta.enviada_em), 'dd/MM/yyyy HH:mm', { locale: ptBR }) : '—'}</dd>
            <dt>Criada em</dt>
            <dd>{proposta.created_at ? format(new Date(proposta.created_at), 'dd/MM/yyyy HH:mm', { locale: ptBR }) : '—'}</dd>
          </dl>
        </section>

        <section className="proposta-detalhe-orion-card proposta-detalhe-orion-timeline">
          <h2><FiClock /> Histórico de status</h2>
          {history.length === 0 ? (
            <p className="proposta-detalhe-orion-empty">Nenhum registro de alteração de status.</p>
          ) : (
            <ul className="proposta-detalhe-orion-timeline-list">
              {history.map((h, idx) => (
                <li key={h.created_at + idx} className="proposta-detalhe-orion-timeline-item">
                  <span className="proposta-detalhe-orion-timeline-date">
                    {h.created_at ? format(new Date(h.created_at), 'dd/MM/yyyy HH:mm', { locale: ptBR }) : '—'}
                  </span>
                  <span className="proposta-detalhe-orion-timeline-status">
                    {STATUS_LABELS[h.status_anterior] || h.status_anterior || '—'} → {STATUS_LABELS[h.status_novo] || h.status_novo || '—'}
                  </span>
                  {h.usuario_nome && <span className="proposta-detalhe-orion-timeline-user">{h.usuario_nome}</span>}
                  {h.observacao && <span className="proposta-detalhe-orion-timeline-obs">{h.observacao}</span>}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <div className="proposta-detalhe-orion-actions">
        <button type="button" className="proposta-detalhe-orion-btn btn-preview" onClick={openPreview}>
          <FiEye /> Ver proposta
        </button>
        <button type="button" className="proposta-detalhe-orion-btn btn-pdf" onClick={openPdf} disabled={actionLoading === 'pdf'}>
          <FiDownload /> {actionLoading === 'pdf' ? 'Gerando...' : 'PDF'}
        </button>
        {canEnviar && (
          <button type="button" className="proposta-detalhe-orion-btn btn-enviar" onClick={() => runAction('enviar')} disabled={!!actionLoading}>
            <FiSend /> Enviar
          </button>
        )}
        {canAceitarRejeitar && (
          <>
            <button type="button" className="proposta-detalhe-orion-btn btn-aceitar" onClick={() => runAction('aceitar')} disabled={!!actionLoading}>
              <FiCheck /> Aceitar
            </button>
            <button type="button" className="proposta-detalhe-orion-btn btn-rejeitar" onClick={() => setRejeitarModal(true)} disabled={!!actionLoading}>
              <FiX /> Rejeitar
            </button>
          </>
        )}
        {canNovaRevisao && (
          <button type="button" className="proposta-detalhe-orion-btn" onClick={() => runAction('nova-revisao')} disabled={!!actionLoading}>
            <FiRotateCcw /> Nova revisão
          </button>
        )}
        <button type="button" className="proposta-detalhe-orion-btn" onClick={() => runAction('clone')} disabled={!!actionLoading}>
          <FiCopy /> Clonar
        </button>
        {canEdit && (
          <Link to={`/comercial/propostas/editar/${id}`} className="proposta-detalhe-orion-btn btn-edit">
            <FiEdit /> Editar
          </Link>
        )}
      </div>

      {rejeitarModal && (
        <div className="proposta-detalhe-orion-modal-overlay" onClick={() => setRejeitarModal(false)}>
          <div className="proposta-detalhe-orion-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Rejeitar proposta</h3>
            <p>Informe o motivo (opcional):</p>
            <textarea value={rejeitarMotivo} onChange={(e) => setRejeitarMotivo(e.target.value)} rows={3} placeholder="Motivo da rejeição..." />
            <div className="proposta-detalhe-orion-modal-actions">
              <button type="button" className="btn-orion-secondary" onClick={() => { setRejeitarModal(false); setRejeitarMotivo(''); }}>Cancelar</button>
              <button type="button" className="btn-orion-primary" onClick={() => runAction('rejeitar')}>Rejeitar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
