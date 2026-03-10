import React, { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../../services/api';
import { toast } from 'react-toastify';
import { FiPlus, FiSearch, FiEdit, FiTrash2, FiEye, FiDownload, FiFileText, FiSettings, FiEdit2, FiSend, FiCheck, FiX, FiCopy, FiRotateCcw, FiZap } from 'react-icons/fi';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import PreviewPropostaEditavel from '../PreviewPropostaEditavel';
import GerarPropostaProdutos from '../GerarPropostaProdutos';
import './PropostasOrion.css';

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

export default function PropostasOrion() {
  const navigate = useNavigate();
  const [list, setList] = useState([]);
  const [users, setUsers] = useState([]);
  const [oportunidades, setOportunidades] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterUser, setFilterUser] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterTipo, setFilterTipo] = useState('');
  const [filterOportunidade, setFilterOportunidade] = useState('');
  const [search, setSearch] = useState('');
  const [showPreviewEditavel, setShowPreviewEditavel] = useState(false);
  const [previewEditavelData, setPreviewEditavelData] = useState(null);
  const [rejeitarModal, setRejeitarModal] = useState(null);
  const [rejeitarMotivo, setRejeitarMotivo] = useState('');
  const [loadingAction, setLoadingAction] = useState(null);
  const [showGerarAutomatica, setShowGerarAutomatica] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (filterUser) params.responsavel_id = filterUser;
      if (filterStatus) params.status = filterStatus;
      if (filterTipo) params.tipo_proposta = filterTipo;
      if (filterOportunidade) params.oportunidade_id = filterOportunidade;
      if (search.trim()) params.search = search.trim();
      const { data } = await api.get('/propostas', { params });
      setList(Array.isArray(data) ? data : []);

      try {
        const [usersRes, oppRes] = await Promise.all([
          api.get('/usuarios/por-modulo/comercial'),
          api.get('/oportunidades', { params: { status: 'ativa' } }).catch(() => ({ data: [] })),
        ]);
        setUsers(usersRes?.data || []);
        setOportunidades(Array.isArray(oppRes?.data) ? oppRes.data : []);
      } catch {
        setUsers([]);
        setOportunidades([]);
      }
    } catch (err) {
      console.error(err);
      toast.error('Erro ao carregar propostas.');
      setList([]);
    } finally {
      setLoading(false);
    }
  }, [filterUser, filterStatus, filterTipo, filterOportunidade, search]);

  useEffect(() => {
    const t = setTimeout(load, 200);
    return () => clearTimeout(t);
  }, [load]);

  const formatMoney = (v) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v) || 0);

  const openPreview = async (id) => {
    try {
      const { data } = await api.get(`/propostas/${id}/premium`, { responseType: 'text' });
      const blob = new Blob([data], { type: 'text/html; charset=utf-8' });
      const url = window.URL.createObjectURL(blob);
      const w = window.open(url, '_blank', 'noopener,noreferrer');
      if (!w) toast.warning('Permita pop-ups para visualizar o preview.');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao abrir preview.');
    }
  };

  const openPreviewEditavel = async (id) => {
    try {
      const { data } = await api.get(`/propostas/${id}`);
      const formData = {
        titulo: data.titulo ?? '',
        descricao: data.descricao ?? '',
        condicoes_pagamento: data.condicoes_pagamento ?? '',
        prazo_entrega: data.prazo_entrega ?? '',
        garantia: data.garantia ?? '',
        observacoes: data.observacoes ?? '',
        cliente_id: data.cliente_id ?? '',
        cliente_contato: data.cliente_contato ?? '',
        cliente_telefone: data.cliente_telefone ?? '',
        cliente_email: data.cliente_email ?? '',
      };
      const itens = (data.itens || []).map((i) => ({
        descricao: i.descricao ?? '',
        quantidade: Number(i.quantidade) || 1,
        unidade: i.unidade ?? 'UN',
        valor_unitario: Number(i.valor_unitario) || 0,
        valor_total: Number(i.valor_total) || 0,
        codigo_produto: i.codigo_produto ?? null,
        familia_produto: i.familia_produto ?? '',
        regiao_busca: i.regiao_busca ?? '',
      }));
      setPreviewEditavelData({ proposta: data, formData, itens });
      setShowPreviewEditavel(true);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao abrir preview editável.');
    }
  };

  const [downloadingPdfId, setDownloadingPdfId] = useState(null);
  const openPdf = async (id, numero) => {
    if (downloadingPdfId) return;
    setDownloadingPdfId(id);
    try {
      const response = await api.get(`/propostas/${id}/pdf`, { responseType: 'blob' });
      const blob = new Blob([response.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `proposta-${(numero || id).toString().replace(/[/\\]/g, '-')}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      toast.success('PDF gerado e baixado.');
    } catch (err) {
      const msg = err.response?.data?.error || err.message || 'Erro ao gerar PDF.';
      try {
        if (err.response?.data instanceof Blob) {
          const text = await err.response.data.text();
          const j = JSON.parse(text);
          toast.error(j.error || msg);
        } else toast.error(msg);
      } catch (_) {
        toast.error(msg);
      }
    } finally {
      setDownloadingPdfId(null);
    }
  };

  const runAction = async (action, id, extra) => {
    if (loadingAction) return;
    setLoadingAction(action + id);
    try {
      if (action === 'enviar') {
        await api.post(`/propostas/${id}/enviar`);
        toast.success('Proposta marcada como enviada.');
      } else if (action === 'marcar-visualizada') {
        await api.post(`/propostas/${id}/marcar-visualizada`);
        toast.success('Proposta marcada como visualizada.');
      } else if (action === 'aceitar') {
        await api.post(`/propostas/${id}/aceitar`, { observacao: extra?.observacao });
        toast.success('Proposta aceita.');
      } else if (action === 'rejeitar') {
        await api.post(`/propostas/${id}/rejeitar`, { motivo_rejeicao: extra?.motivo, observacao: extra?.motivo });
        toast.success('Proposta rejeitada.');
        setRejeitarModal(null);
        setRejeitarMotivo('');
      } else if (action === 'nova-revisao') {
        await api.post(`/propostas/${id}/nova-revisao`);
        toast.success('Nova revisão criada. Proposta voltou para rascunho.');
      } else if (action === 'clone') {
        const { data } = await api.post(`/propostas/${id}/clone`);
        toast.success('Proposta clonada.');
        navigate(`/comercial/propostas/editar/${data.id}`);
        return;
      }
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || err.message || 'Erro na ação.');
    } finally {
      setLoadingAction(null);
    }
  };

  const onRejeitar = (p) => {
    setRejeitarModal(p);
    setRejeitarMotivo('');
  };

  const confirmRejeitar = () => {
    if (!rejeitarModal) return;
    runAction('rejeitar', rejeitarModal.id, { motivo: rejeitarMotivo });
  };

  const onDelete = async (id, numero) => {
    if (!window.confirm(`Excluir a proposta ${numero || id}? Esta ação não pode ser desfeita.`)) return;
    try {
      await api.delete(`/propostas/${id}`);
      toast.success('Proposta excluída.');
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao excluir.');
    }
  };

  const isRascunho = (s) => s === 'rascunho';
  const canEdit = (s) => s === 'rascunho';
  const canDelete = (s) => s === 'rascunho';
  const canEnviar = (s) => s === 'rascunho';
  const canAceitarRejeitar = (s) => s === 'enviada' || s === 'visualizada';
  const canNovaRevisao = (s) => ['enviada', 'visualizada', 'aceita', 'rejeitada', 'expirada'].includes(s);

  return (
    <div className="propostas-orion">
      <header className="propostas-orion-header">
        <div>
          <h1><FiFileText /> Propostas</h1>
          <p>Gerencie propostas no ciclo de vida enterprise (rascunho → enviada → aceita/rejeitada)</p>
        </div>
        <div className="propostas-orion-actions">
          <Link to="/configuracoes" state={{ tab: 'template-proposta' }} className="btn-orion btn-orion-secondary" title="Configurações do template">
            <FiSettings /> Config. proposta
          </Link>
          <button type="button" className="btn-orion btn-orion-secondary" onClick={() => setShowGerarAutomatica(true)} title="Gerar proposta a partir de produtos (Hélices e Acessórios)">
            <FiZap /> Proposta automática
          </button>
          <Link to="/comercial/propostas/nova" className="btn-orion btn-orion-primary">
            <FiPlus /> Nova proposta
          </Link>
        </div>
      </header>

      <div className="propostas-orion-filters">
        <div className="propostas-orion-search">
          <FiSearch />
          <input
            type="text"
            placeholder="Buscar por número, título ou cliente..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select className="propostas-orion-select" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
          <option value="">Todos os status</option>
          {Object.entries(STATUS_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <select className="propostas-orion-select" value={filterTipo} onChange={(e) => setFilterTipo(e.target.value)}>
          <option value="">Todos os tipos</option>
          {Object.entries(TIPO_PROPOSTA_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <select className="propostas-orion-select" value={filterOportunidade} onChange={(e) => setFilterOportunidade(e.target.value)}>
          <option value="">Todas as oportunidades</option>
          {oportunidades.map((o) => (
            <option key={o.id} value={o.id}>{o.titulo || `Oportunidade ${o.id}`}</option>
          ))}
        </select>
        <select className="propostas-orion-select" value={filterUser} onChange={(e) => setFilterUser(e.target.value)}>
          <option value="">Todos os responsáveis</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>{u.nome}</option>
          ))}
        </select>
      </div>

      <div className="propostas-orion-table-wrap">
        {loading ? (
          <div className="propostas-orion-loading">Carregando...</div>
        ) : (
          <table className="propostas-orion-table">
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
                <th>Criado em</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {list.length === 0 ? (
                <tr>
                  <td colSpan="10" className="propostas-orion-empty">Nenhuma proposta encontrada</td>
                </tr>
              ) : (
                list.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <Link to={`/comercial/propostas/detalhe/${p.id}`} className="propostas-orion-link-num">
                        {p.numero_proposta || '—'}
                      </Link>
                    </td>
                    <td>{p.titulo || '—'}</td>
                    <td>
                      {p.cliente_nome || '—'}
                      {p.cliente_nome_fantasia && p.cliente_nome_fantasia !== p.cliente_nome && (
                        <span className="propostas-orion-fantasia"> ({p.cliente_nome_fantasia})</span>
                      )}
                    </td>
                    <td>{TIPO_PROPOSTA_LABELS[p.tipo_proposta] || '—'}</td>
                    <td>{formatMoney(p.valor_total)}</td>
                    <td>{p.validade ? format(new Date(p.validade), 'dd/MM/yyyy', { locale: ptBR }) : '—'}</td>
                    <td>
                      <span
                        className="propostas-orion-status"
                        style={{ backgroundColor: STATUS_COLORS[p.status] || STATUS_COLORS.rascunho }}
                      >
                        {STATUS_LABELS[p.status] || p.status || 'Rascunho'}
                      </span>
                    </td>
                    <td>{p.enviada_em ? format(new Date(p.enviada_em), 'dd/MM/yyyy HH:mm', { locale: ptBR }) : '—'}</td>
                    <td>{p.created_at ? format(new Date(p.created_at), 'dd/MM/yyyy', { locale: ptBR }) : '—'}</td>
                    <td>
                      <div className="propostas-orion-cell-actions">
                        <button type="button" className="propostas-orion-btn-icon propostas-orion-btn-preview" onClick={() => openPreview(p.id)} title="Ver proposta">
                          <FiEye />
                        </button>
                        {canEdit(p.status) && (
                          <button type="button" className="propostas-orion-btn-icon propostas-orion-btn-edit-preview" onClick={() => openPreviewEditavel(p.id)} title="Ver e editar">
                            <FiEdit2 />
                          </button>
                        )}
                        <button type="button" className="propostas-orion-btn-icon propostas-orion-btn-pdf" onClick={() => openPdf(p.id, p.numero_proposta)} disabled={downloadingPdfId === p.id} title="PDF">
                          {downloadingPdfId === p.id ? '...' : <FiDownload />}
                        </button>
                        {canEnviar(p.status) && (
                          <button type="button" className="propostas-orion-btn-icon propostas-orion-btn-enviar" onClick={() => runAction('enviar', p.id)} disabled={!!loadingAction} title="Enviar">
                            <FiSend />
                          </button>
                        )}
                        {canAceitarRejeitar(p.status) && (
                          <>
                            <button type="button" className="propostas-orion-btn-icon propostas-orion-btn-aceitar" onClick={() => runAction('aceitar', p.id)} disabled={!!loadingAction} title="Aceitar">
                              <FiCheck />
                            </button>
                            <button type="button" className="propostas-orion-btn-icon propostas-orion-btn-rejeitar" onClick={() => onRejeitar(p)} disabled={!!loadingAction} title="Rejeitar">
                              <FiX />
                            </button>
                          </>
                        )}
                        {canNovaRevisao(p.status) && (
                          <button type="button" className="propostas-orion-btn-icon" onClick={() => runAction('nova-revisao', p.id)} disabled={!!loadingAction} title="Nova revisão">
                            <FiRotateCcw />
                          </button>
                        )}
                        <button type="button" className="propostas-orion-btn-icon" onClick={() => runAction('clone', p.id)} disabled={!!loadingAction} title="Clonar">
                          <FiCopy />
                        </button>
                        {canEdit(p.status) && (
                          <Link to={`/comercial/propostas/editar/${p.id}`} className="propostas-orion-btn-icon" title="Editar">
                            <FiEdit />
                          </Link>
                        )}
                        {canDelete(p.status) && (
                          <button type="button" className="propostas-orion-btn-icon propostas-orion-btn-danger" onClick={() => onDelete(p.id, p.numero_proposta)} title="Excluir">
                            <FiTrash2 />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>

      {rejeitarModal && (
        <div className="propostas-orion-modal-overlay" onClick={() => setRejeitarModal(null)}>
          <div className="propostas-orion-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Rejeitar proposta</h3>
            <p>Proposta {rejeitarModal.numero_proposta}. Informe o motivo (opcional):</p>
            <textarea value={rejeitarMotivo} onChange={(e) => setRejeitarMotivo(e.target.value)} rows={3} placeholder="Motivo da rejeição..." />
            <div className="propostas-orion-modal-actions">
              <button type="button" className="btn-orion-secondary" onClick={() => { setRejeitarModal(null); setRejeitarMotivo(''); }}>Cancelar</button>
              <button type="button" className="btn-orion-primary" onClick={confirmRejeitar}>Rejeitar</button>
            </div>
          </div>
        </div>
      )}

      {showPreviewEditavel && previewEditavelData && (
        <PreviewPropostaEditavel
          proposta={previewEditavelData.proposta}
          formData={previewEditavelData.formData}
          itens={previewEditavelData.itens}
          onClose={() => { setShowPreviewEditavel(false); setPreviewEditavelData(null); }}
          onSave={(result) => { if (result?.error) toast.error(result.error); else { load(); toast.success('Alterações salvas.'); } }}
        />
      )}

      {showGerarAutomatica && (
        <GerarPropostaProdutos
          onClose={() => setShowGerarAutomatica(false)}
          onSuccess={(data) => { load(); setShowGerarAutomatica(false); if (data?.id) navigate(`/comercial/propostas/detalhe/${data.id}`); }}
        />
      )}
    </div>
  );
}
