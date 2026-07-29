import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { toast } from 'react-toastify';
import { FiArrowLeft, FiEye, FiDownload, FiEdit, FiSend, FiCheck, FiX, FiCopy, FiRotateCcw, FiClock, FiTrash2, FiFileText, FiUpload } from 'react-icons/fi';
import { formatDateBR, formatDateTimeBR, isPropostaInativa } from '../../utils/formatDate';
import './PropostaDetalhe.css';

const STATUS = { rascunho: 'Rascunho', enviada: 'Enviada', visualizada: 'Visualizada', aceita: 'Aceita', rejeitada: 'Rejeitada', expirada: 'Expirada' };
const TIPOS = { comercial: 'Comercial', tecnica: 'Técnica', orcamento: 'Orçamento', aditivo: 'Aditivo' };

export default function PropostaDetalhe() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = String(user?.role || '').toLowerCase() === 'admin';
  const [proposta, setProposta] = useState(null);
  const [historico, setHistorico] = useState([]);
  const [loading, setLoading] = useState(true);
  const [rejeitar, setRejeitar] = useState(false);
  const [rejeitarMotivo, setRejeitarMotivo] = useState('');
  const [pdfLoading, setPdfLoading] = useState(false);
  const [uploadingPdf, setUploadingPdf] = useState(false);

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
  const inativa = isPropostaInativa(proposta);
  const podeInativar = !inativa && (isAdmin || status === 'rascunho');

  const confirmInativar = () => {
    const numero = proposta?.numero_proposta || id;
    const st = STATUS[status] || status;
    const msg = status === 'rascunho'
      ? `Inativar a proposta ${numero}?`
      : `Inativar a proposta ${numero}?\n\nStatus atual: ${st}\n\nA proposta ficará oculta da listagem, mas os vínculos no sistema serão preservados.`;
    return window.confirm(msg);
  };

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
      } else if (nome === 'inativar') {
        await api.delete(`/propostas/${id}`);
        toast.success('Proposta inativada.');
        navigate('/comercial/propostas');
        return;
      }
      toast.success('Ação concluída.');
      load();
    } catch (e) {
      toast.error(e.response?.data?.error || 'Erro.');
    }
  };

  const abrirPreview = () => {
    if (status === 'rascunho') {
      toast.info('Envie a proposta para gerar o documento automático.');
      return;
    }
    api.get(`/propostas/${id}/premium`, { responseType: 'text' }).then(({ data }) => {
      const url = URL.createObjectURL(new Blob([data], { type: 'text/html;charset=utf-8' }));
      window.open(url, '_blank');
    }).catch(() => toast.error('Erro ao abrir proposta.'));
  };

  const baixarPdfGerado = async () => {
    if (status === 'rascunho') {
      toast.info('Envie a proposta para gerar o PDF.');
      return;
    }
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

  const baixarPdfAnexo = async () => {
    try {
      const { data } = await api.get(`/propostas/${id}/pdf-anexo`, { responseType: 'blob' });
      const url = URL.createObjectURL(new Blob([data], { type: 'application/pdf' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = proposta?.pdf_proposta_nome || `proposta-${proposta?.numero_proposta || id}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('PDF anexado baixado.');
    } catch (e) {
      toast.error(e.response?.data?.error || 'Erro ao baixar PDF anexado.');
    }
  };

  const visualizarPdfAnexo = async () => {
    try {
      const { data } = await api.get(`/propostas/${id}/pdf-anexo`, { params: { inline: '1' }, responseType: 'blob' });
      const url = URL.createObjectURL(new Blob([data], { type: 'application/pdf' }));
      window.open(url, '_blank');
    } catch (e) {
      toast.error(e.response?.data?.error || 'Erro ao visualizar PDF anexado.');
    }
  };

  const handleUploadPdf = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      toast.error('Selecione um arquivo PDF.');
      e.target.value = '';
      return;
    }
    setUploadingPdf(true);
    try {
      const formData = new FormData();
      formData.append('arquivo', file);
      await api.post(`/propostas/${id}/pdf-anexo`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      toast.success('PDF anexado com sucesso.');
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao anexar PDF.');
    } finally {
      setUploadingPdf(false);
      e.target.value = '';
    }
  };

  const removerPdfAnexo = async () => {
    if (!window.confirm('Remover o PDF anexado desta proposta?')) return;
    try {
      await api.delete(`/propostas/${id}/pdf-anexo`);
      toast.success('PDF removido.');
      load();
    } catch (e) {
      toast.error(e.response?.data?.error || 'Erro ao remover PDF.');
    }
  };

  if (loading || !proposta) return <div className="proposta-detalhe"><p className="proposta-detalhe-loading">Carregando...</p></div>;

  return (
    <div className={`proposta-detalhe${inativa ? ' proposta-detalhe-inativa' : ''}`}>
      <header className="proposta-detalhe-header">
        <Link to="/comercial/propostas" className="proposta-detalhe-back"><FiArrowLeft /> Voltar</Link>
        <div className="proposta-detalhe-title-row">
          <h1>Proposta {proposta.numero_proposta || id}</h1>
          <span className="proposta-detalhe-badge" data-status={status}>{STATUS[status] || status}</span>
          {inativa && <span className="proposta-detalhe-badge badge-inativa">Inativa</span>}
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
            <dt>Validade</dt><dd>{formatDateBR(proposta.validade)}</dd>
            <dt>Expira em</dt><dd>{formatDateBR(proposta.expira_em)}</dd>
            <dt>Enviada em</dt><dd>{formatDateTimeBR(proposta.enviada_em)}</dd>
            <dt>Criada em</dt><dd>{formatDateTimeBR(proposta.created_at)}</dd>
          </dl>
        </section>
        <section className="proposta-detalhe-card">
          <h2><FiClock /> Histórico</h2>
          {historico.length === 0 ? <p className="proposta-detalhe-empty">Nenhum registro.</p> : (
            <ul className="proposta-detalhe-timeline">
              {historico.map((h, i) => (
                <li key={i}>
                  <span className="data">{formatDateTimeBR(h.created_at)}</span>
                  <span className="status">{STATUS[h.status_anterior] || h.status_anterior} → {STATUS[h.status_novo] || h.status_novo}</span>
                  {h.usuario_nome && <span className="user">{h.usuario_nome}</span>}
                  {h.observacao && <span className="obs">{h.observacao}</span>}
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="proposta-detalhe-card">
          <h2><FiFileText /> PDF enviado ao cliente</h2>
          {proposta.pdf_proposta_cliente ? (
            <div className="proposta-detalhe-pdf-anexo">
              <p>{proposta.pdf_proposta_nome || proposta.pdf_proposta_cliente}</p>
              <div className="proposta-detalhe-pdf-btns">
                <button type="button" className="btn btn-sec" onClick={visualizarPdfAnexo}><FiEye /> Visualizar</button>
                <button type="button" className="btn btn-sec" onClick={baixarPdfAnexo}><FiDownload /> Baixar</button>
                <button type="button" className="btn btn-sec" onClick={removerPdfAnexo}><FiTrash2 /> Remover</button>
              </div>
            </div>
          ) : (
            <p className="proposta-detalhe-empty">Nenhum PDF anexado.</p>
          )}
          {!inativa && (
            <label className="proposta-detalhe-pdf-upload">
              <FiUpload /> {uploadingPdf ? 'Enviando...' : (proposta.pdf_proposta_cliente ? 'Substituir PDF' : 'Anexar PDF')}
              <input type="file" accept="application/pdf,.pdf" onChange={handleUploadPdf} disabled={uploadingPdf} hidden />
            </label>
          )}
        </section>
      </div>

      <div className="proposta-detalhe-actions">
        <button
          type="button"
          className="btn btn-sec"
          onClick={abrirPreview}
          disabled={status === 'rascunho'}
          title={status === 'rascunho' ? 'Disponível após enviar a proposta' : 'Ver proposta'}
        >
          <FiEye /> Ver proposta
        </button>
        <button
          type="button"
          className="btn btn-pri"
          onClick={baixarPdfGerado}
          disabled={pdfLoading || status === 'rascunho'}
          title={status === 'rascunho' ? 'Disponível após enviar a proposta' : undefined}
        >
          <FiDownload /> {pdfLoading ? 'Gerando...' : 'PDF gerado'}
        </button>
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
        {!inativa && <Link to={`/comercial/propostas/editar/${id}`} className="btn btn-pri"><FiEdit /> Editar</Link>}
        {podeInativar && (
          <button type="button" className="btn btn-sec btn-inativar" onClick={() => confirmInativar() && acao('inativar')}>
            <FiTrash2 /> Inativar
          </button>
        )}
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
