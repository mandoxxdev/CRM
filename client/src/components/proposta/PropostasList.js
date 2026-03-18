import React, { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../../services/api';
import { toast } from 'react-toastify';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { FiPlus, FiSearch, FiSettings, FiEye, FiDownload, FiEdit, FiTrash2, FiSend, FiCheck, FiX, FiCopy, FiRotateCcw, FiZap } from 'react-icons/fi';
import GerarPropostaModal from './GerarPropostaModal';
import './PropostasList.css';

const STATUS = {
  rascunho: 'Rascunho',
  em_revisao: 'Em revisão',
  aprovada_internamente: 'Aprovada internamente',
  enviada: 'Enviada',
  visualizada: 'Visualizada',
  aceita: 'Aceita',
  rejeitada: 'Rejeitada',
  cancelada: 'Cancelada',
  expirada: 'Expirada'
};
const TIPOS = { comercial: 'Comercial', tecnica: 'Técnica', orcamento: 'Orçamento', aditivo: 'Aditivo' };

export default function PropostasList() {
  const navigate = useNavigate();
  const [list, setList] = useState([]);
  const [oportunidades, setOportunidades] = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterTipo, setFilterTipo] = useState('');
  const [filterOportunidade, setFilterOportunidade] = useState('');
  const [filterResponsavel, setFilterResponsavel] = useState('');
  const [showAutomatica, setShowAutomatica] = useState(false);
  const [rejeitarId, setRejeitarId] = useState(null);
  const [rejeitarMotivo, setRejeitarMotivo] = useState('');
  const [pdfId, setPdfId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (search.trim()) params.search = search.trim();
      if (filterStatus) params.status = filterStatus;
      if (filterTipo) params.tipo_proposta = filterTipo;
      if (filterOportunidade) params.oportunidade_id = filterOportunidade;
      if (filterResponsavel) params.responsavel_id = filterResponsavel;
      const { data } = await api.get('/propostas', { params });
      setList(Array.isArray(data) ? data : []);
    } catch (e) {
      toast.error('Erro ao carregar propostas.');
      setList([]);
    } finally {
      setLoading(false);
    }
  }, [search, filterStatus, filterTipo, filterOportunidade, filterResponsavel]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    api.get('/oportunidades', { params: { status: 'ativa' } }).then(r => setOportunidades(Array.isArray(r.data) ? r.data : [])).catch(() => setOportunidades([]));
    api.get('/usuarios/por-modulo/comercial').then(r => setUsuarios(Array.isArray(r.data) ? r.data : [])).catch(() => setUsuarios([]));
  }, []);

  const formatMoney = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v) || 0);

  const abrirPreview = (id) => {
    api.get(`/propostas/${id}/premium`, { responseType: 'text' }).then(({ data }) => {
      const url = URL.createObjectURL(new Blob([data], { type: 'text/html;charset=utf-8' }));
      window.open(url, '_blank');
    }).catch((e) => {
      const msg = e.response?.data?.error || e.message || 'Erro ao abrir proposta.';
      toast.error(typeof msg === 'string' ? msg : 'Erro ao abrir proposta.');
    });
  };

  const baixarPdf = async (id, numero) => {
    if (pdfId) return;
    setPdfId(id);
    try {
      const { data } = await api.get(`/propostas/${id}/pdf`, { responseType: 'blob' });
      const url = URL.createObjectURL(new Blob([data], { type: 'application/pdf' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `proposta-${String(numero || id).replace(/[/\\]/g, '-')}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('PDF baixado.');
    } catch (e) {
      toast.error(e.response?.data?.error || 'Erro ao gerar PDF.');
    } finally {
      setPdfId(null);
    }
  };

  const acao = async (acaoNome, id, extra) => {
    try {
      if (acaoNome === 'enviar') await api.post(`/propostas/${id}/enviar`);
      else if (acaoNome === 'aceitar') await api.post(`/propostas/${id}/aceitar`, { observacao: extra?.observacao });
      else if (acaoNome === 'rejeitar') {
        await api.post(`/propostas/${id}/rejeitar`, { motivo_rejeicao: extra?.motivo, observacao: extra?.motivo });
        setRejeitarId(null);
        setRejeitarMotivo('');
      } else if (acaoNome === 'nova-revisao') await api.post(`/propostas/${id}/nova-revisao`);
      else if (acaoNome === 'clone') {
        const { data } = await api.post(`/propostas/${id}/clone`);
        toast.success('Proposta clonada.');
        navigate(`/comercial/propostas/editar/${data.id}`);
        return;
      } else if (acaoNome === 'excluir') {
        await api.delete(`/propostas/${id}`);
        toast.success('Proposta excluída.');
      }
      if (acaoNome !== 'clone') toast.success('Ação concluída.');
      load();
    } catch (e) {
      toast.error(e.response?.data?.error || 'Erro na ação.');
    }
  };

  const isRascunho = (s) => s === 'rascunho';
  const podeAceitarRejeitar = (s) => s === 'enviada' || s === 'visualizada';
  const podeNovaRevisao = (s) => ['enviada', 'visualizada', 'aceita', 'rejeitada', 'cancelada', 'expirada'].includes(s);
  const confirmExcluir = (p) => {
    const numero = p?.numero_proposta || `#${p?.id}`;
    const st = STATUS[p?.status] || p?.status || '—';
    return window.confirm(
      `Tem certeza que deseja excluir a proposta ${numero}?\n\n` +
      `Status atual: ${st}\n\n` +
      `Esta ação não pode ser desfeita.`
    );
  };

  return (
    <div className="propostas-list">
      <header className="propostas-list-header">
        <h1>Propostas</h1>
        <div className="propostas-list-actions">
          <Link to="/configuracoes" state={{ tab: 'template-proposta' }} className="btn btn-sec">
            <FiSettings /> Config. template
          </Link>
          <button type="button" className="btn btn-sec" onClick={() => setShowAutomatica(true)}>
            <FiZap /> Proposta automática
          </button>
          <Link to="/comercial/propostas/nova" className="btn btn-pri">
            <FiPlus /> Nova proposta
          </Link>
        </div>
      </header>

      <div className="propostas-list-filters">
        <div className="propostas-list-search">
          <FiSearch />
          <input type="text" placeholder="Buscar por número, título ou cliente..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
          <option value="">Status</option>
          {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select value={filterTipo} onChange={(e) => setFilterTipo(e.target.value)}>
          <option value="">Tipo</option>
          {Object.entries(TIPOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select value={filterOportunidade} onChange={(e) => setFilterOportunidade(e.target.value)}>
          <option value="">Oportunidade</option>
          {oportunidades.map(o => <option key={o.id} value={o.id}>{o.titulo || `#${o.id}`}</option>)}
        </select>
        <select value={filterResponsavel} onChange={(e) => setFilterResponsavel(e.target.value)}>
          <option value="">Responsável</option>
          {usuarios.map(u => <option key={u.id} value={u.id}>{u.nome}</option>)}
        </select>
      </div>

      <div className="propostas-list-table-wrap">
        {loading ? (
          <p className="propostas-list-loading">Carregando...</p>
        ) : (
          <table className="propostas-list-table">
            <thead>
              <tr>
                <th>Número</th>
                <th>Título</th>
                <th>Cliente</th>
                <th>Tipo</th>
                <th>Valor</th>
                <th>Validade</th>
                <th>Status</th>
                <th>Enviada em</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {list.length === 0 ? (
                <tr><td colSpan="9" className="propostas-list-empty">Nenhuma proposta encontrada.</td></tr>
              ) : list.map(p => (
                <tr key={p.id}>
                  <td><Link to={`/comercial/propostas/detalhe/${p.id}`} className="link-num">{p.numero_proposta || '—'}</Link></td>
                  <td>{p.titulo || '—'}</td>
                  <td>{p.cliente_nome || p.cliente_nome_fantasia || '—'}</td>
                  <td>{TIPOS[p.tipo_proposta] || '—'}</td>
                  <td>{formatMoney(p.valor_total)}</td>
                  <td>{p.validade ? format(new Date(p.validade), 'dd/MM/yyyy', { locale: ptBR }) : '—'}</td>
                  <td><span className="badge" data-status={p.status}>{STATUS[p.status] || p.status}</span></td>
                  <td>{p.enviada_em ? format(new Date(p.enviada_em), 'dd/MM/yyyy HH:mm', { locale: ptBR }) : '—'}</td>
                  <td>
                    <div className="propostas-list-cell-actions">
                      <button type="button" title="Ver proposta" onClick={() => abrirPreview(p.id)}><FiEye /></button>
                      <button type="button" title="PDF" onClick={() => baixarPdf(p.id, p.numero_proposta)} disabled={pdfId === p.id}>{pdfId === p.id ? '...' : <FiDownload />}</button>
                      {isRascunho(p.status) && <button type="button" title="Enviar" onClick={() => acao('enviar', p.id)}><FiSend /></button>}
                      {podeAceitarRejeitar(p.status) && (
                        <>
                          <button type="button" title="Aceitar" onClick={() => acao('aceitar', p.id)}><FiCheck /></button>
                          <button type="button" title="Rejeitar" onClick={() => setRejeitarId(p)}><FiX /></button>
                        </>
                      )}
                      {podeNovaRevisao(p.status) && <button type="button" title="Nova revisão" onClick={() => acao('nova-revisao', p.id)}><FiRotateCcw /></button>}
                      <button type="button" title="Clonar" onClick={() => acao('clone', p.id)}><FiCopy /></button>
                      {isRascunho(p.status) && <Link to={`/comercial/propostas/editar/${p.id}`} title="Editar"><FiEdit /></Link>}
                      <button
                        type="button"
                        title="Excluir"
                        onClick={() => confirmExcluir(p) && acao('excluir', p.id)}
                      >
                        <FiTrash2 />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showAutomatica && (
        <GerarPropostaModal
          onClose={() => setShowAutomatica(false)}
          onSuccess={(data) => { load(); setShowAutomatica(false); if (data?.id) navigate(`/comercial/propostas/detalhe/${data.id}`); }}
        />
      )}

      {rejeitarId && (
        <div className="propostas-list-modal-overlay" onClick={() => setRejeitarId(null)}>
          <div className="propostas-list-modal" onClick={e => e.stopPropagation()}>
            <h3>Rejeitar proposta</h3>
            <p>Motivo (opcional):</p>
            <textarea value={rejeitarMotivo} onChange={e => setRejeitarMotivo(e.target.value)} rows={3} />
            <div className="propostas-list-modal-btns">
              <button type="button" className="btn btn-sec" onClick={() => setRejeitarId(null)}>Cancelar</button>
              <button type="button" className="btn btn-pri" onClick={() => acao('rejeitar', rejeitarId.id, { motivo: rejeitarMotivo })}>Rejeitar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
