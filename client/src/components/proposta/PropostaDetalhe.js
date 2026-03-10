import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import api from '../../services/api';
import { toast } from 'react-toastify';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { FiArrowLeft, FiEye, FiDownload, FiEdit, FiSend, FiCheck, FiX, FiCopy, FiRotateCcw, FiClock } from 'react-icons/fi';
import './PropostaDetalhe.css';

const STATUS = { rascunho: 'Rascunho', enviada: 'Enviada', visualizada: 'Visualizada', aceita: 'Aceita', rejeitada: 'Rejeitada', expirada: 'Expirada' };
const TIPOS = { comercial: 'Comercial', tecnica: 'Técnica', orcamento: 'Orçamento', aditivo: 'Aditivo' };

export default function PropostaDetalhe() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [proposta, setProposta] = useState(null);
  const [historico, setHistorico] = useState([]);
  const [loading, setLoading] = useState(true);
  const [rejeitar, setRejeitar] = useState(false);
  const [rejeitarMotivo, setRejeitarMotivo] = useState('');
  const [pdfLoading, setPdfLoading] = useState(false);

  const load = () => {
    setLoading(true);
    Promise.all([
      api.get(`/propostas/${id}`),
      api.get(`/propostas/${id}/status-history`).catch(() => ({ data: [] }))
    ]).then(([r1, r2]) => {
      setProposta(r1.data);
      setHistorico(Array.isArray(r2.data) ? r2.data : []);
    }).catch(() => toast.error('Erro ao carregar proposta.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [id]);

  const formatMoney = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v) || 0);
  const status = proposta?.status || 'rascunho';

  const acao = async (nome, extra) => {
    try {
      if (nome === 'enviar') await api.post(`/propostas/${id}/enviar`);
      else if (nome === 'aceitar') await api.post(`/propostas/${id}/aceitar`, { observacao: extra?.observacao });
      else if (nome === 'rejeitar') {
        await api.post(`/propostas/${id}/rejeitar`, { motivo_rejeicao: extra?.motivo, observacao: extra?.motivo });
        setRejeitar(false);
        setRejeitarMotivo('');
      } else if (nome === 'nova-revisao') await api.post(`/propostas/${id}/nova-revisao`);
      else if (nome === 'clone') {
        const { data } = await api.post(`/propostas/${id}/clone`);
        toast.success('Proposta clonada.');
        navigate(`/comercial/propostas/editar/${data.id}`);
        return;
      }
      toast.success('Ação concluída.');
      load();
    } catch (e) {
      toast.error(e.response?.data?.error || 'Erro.');
    }
  };

  const abrirPreview = () => {
    api.get(`/propostas/${id}/premium`, { responseType: 'text' }).then(({ data }) => {
      const url = URL.createObjectURL(new Blob([data], { type: 'text/html;charset=utf-8' }));
      window.open(url, '_blank');
    }).catch(() => toast.error('Erro ao abrir proposta.'));
  };

  const baixarPdf = async () => {
    setPdfLoading(true);
    try {
      const { data } = await api.get(`/propostas/${id}/pdf`, { responseType: 'blob' });
      const url = URL.createObjectURL(new Blob([data], { type: 'application/pdf' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `proposta-${proposta?.numero_proposta || id}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('PDF baixado.');
    } catch (e) {
      toast.error(e.response?.data?.error || 'Erro ao gerar PDF.');
    } finally {
      setPdfLoading(false);
    }
  };

  if (loading || !proposta) return <div className="proposta-detalhe"><p className="proposta-detalhe-loading">Carregando...</p></div>;

  return (
    <div className="proposta-detalhe">
      <header className="proposta-detalhe-header">
        <Link to="/comercial/propostas" className="proposta-detalhe-back"><FiArrowLeft /> Voltar</Link>
        <div className="proposta-detalhe-title-row">
          <h1>Proposta {proposta.numero_proposta || id}</h1>
          <span className="proposta-detalhe-badge" data-status={status}>{STATUS[status] || status}</span>
        </div>
        <p className="proposta-detalhe-subtitle">{proposta.titulo || '—'}</p>
      </header>

      <div className="proposta-detalhe-grid">
        <section className="proposta-detalhe-card">
          <h2>Dados</h2>
          <dl className="proposta-detalhe-dl">
            <dt>Cliente</dt><dd>{proposta.cliente_nome || proposta.cliente_nome_fantasia || proposta.cliente_id || '—'}</dd>
            <dt>Valor</dt><dd>{formatMoney(proposta.valor_total)}</dd>
            <dt>Tipo</dt><dd>{TIPOS[proposta.tipo_proposta] || '—'}</dd>
            <dt>Validade</dt><dd>{proposta.validade ? format(new Date(proposta.validade), 'dd/MM/yyyy', { locale: ptBR }) : '—'}</dd>
            <dt>Expira em</dt><dd>{proposta.expira_em ? format(new Date(proposta.expira_em), 'dd/MM/yyyy', { locale: ptBR }) : '—'}</dd>
            <dt>Enviada em</dt><dd>{proposta.enviada_em ? format(new Date(proposta.enviada_em), 'dd/MM/yyyy HH:mm', { locale: ptBR }) : '—'}</dd>
            <dt>Criada em</dt><dd>{proposta.created_at ? format(new Date(proposta.created_at), 'dd/MM/yyyy HH:mm', { locale: ptBR }) : '—'}</dd>
          </dl>
        </section>
        <section className="proposta-detalhe-card">
          <h2><FiClock /> Histórico</h2>
          {historico.length === 0 ? <p className="proposta-detalhe-empty">Nenhum registro.</p> : (
            <ul className="proposta-detalhe-timeline">
              {historico.map((h, i) => (
                <li key={i}>
                  <span className="data">{h.created_at ? format(new Date(h.created_at), 'dd/MM/yyyy HH:mm', { locale: ptBR }) : '—'}</span>
                  <span className="status">{STATUS[h.status_anterior] || h.status_anterior} → {STATUS[h.status_novo] || h.status_novo}</span>
                  {h.usuario_nome && <span className="user">{h.usuario_nome}</span>}
                  {h.observacao && <span className="obs">{h.observacao}</span>}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <div className="proposta-detalhe-actions">
        <button type="button" className="btn btn-sec" onClick={abrirPreview}><FiEye /> Ver proposta</button>
        <button type="button" className="btn btn-pri" onClick={baixarPdf} disabled={pdfLoading}><FiDownload /> {pdfLoading ? 'Gerando...' : 'PDF'}</button>
        {status === 'rascunho' && <button type="button" className="btn btn-sec" onClick={() => acao('enviar')}><FiSend /> Enviar</button>}
        {(status === 'enviada' || status === 'visualizada') && (
          <>
            <button type="button" className="btn btn-sec" onClick={() => acao('aceitar')}><FiCheck /> Aceitar</button>
            <button type="button" className="btn btn-sec" onClick={() => setRejeitar(true)}><FiX /> Rejeitar</button>
          </>
        )}
        {['enviada', 'visualizada', 'aceita', 'rejeitada', 'expirada'].includes(status) && (
          <button type="button" className="btn btn-sec" onClick={() => acao('nova-revisao')}><FiRotateCcw /> Nova revisão</button>
        )}
        <button type="button" className="btn btn-sec" onClick={() => acao('clone')}><FiCopy /> Clonar</button>
        {status === 'rascunho' && <Link to={`/comercial/propostas/editar/${id}`} className="btn btn-pri"><FiEdit /> Editar</Link>}
      </div>

      {rejeitar && (
        <div className="proposta-detalhe-modal-overlay" onClick={() => setRejeitar(false)}>
          <div className="proposta-detalhe-modal" onClick={e => e.stopPropagation()}>
            <h3>Rejeitar proposta</h3>
            <p>Motivo (opcional):</p>
            <textarea value={rejeitarMotivo} onChange={e => setRejeitarMotivo(e.target.value)} rows={3} />
            <div className="proposta-detalhe-modal-btns">
              <button type="button" className="btn btn-sec" onClick={() => setRejeitar(false)}>Cancelar</button>
              <button type="button" className="btn btn-pri" onClick={() => acao('rejeitar', { motivo: rejeitarMotivo })}>Rejeitar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
