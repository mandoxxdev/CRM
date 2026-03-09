import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import api from '../../services/api';
import { toast } from 'react-toastify';
import { FiPlus, FiSearch, FiEdit, FiTrash2, FiEye, FiDownload, FiFileText, FiSettings, FiEdit2 } from 'react-icons/fi';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import PreviewPropostaEditavel from '../PreviewPropostaEditavel';
import './PropostasOrion.css';

const STATUS_LABELS = {
  rascunho: 'Rascunho',
  enviada: 'Enviada',
  aprovada: 'Aprovada',
  rejeitada: 'Rejeitada',
  cancelada: 'Cancelada',
};

const STATUS_COLORS = {
  rascunho: '#64748b',
  enviada: '#0ea5e9',
  aprovada: '#22c55e',
  rejeitada: '#ef4444',
  cancelada: '#94a3b8',
};

export default function PropostasOrion() {
  const [list, setList] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterUser, setFilterUser] = useState('');
  const [search, setSearch] = useState('');
  const [showPreviewEditavel, setShowPreviewEditavel] = useState(false);
  const [previewEditavelData, setPreviewEditavelData] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (filterUser) params.responsavel_id = filterUser;
      if (search.trim()) params.search = search.trim();
      const { data } = await api.get('/propostas', { params });
      setList(Array.isArray(data) ? data : []);

      try {
        const { data: usersData } = await api.get('/usuarios/por-modulo/comercial');
        setUsers(usersData || []);
      } catch {
        setUsers([]);
      }
    } catch (err) {
      console.error(err);
      toast.error('Erro ao carregar propostas.');
      setList([]);
    } finally {
      setLoading(false);
    }
  }, [filterUser, search]);

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

  const openPdf = async (id) => {
    try {
      const { data } = await api.get(`/propostas/${id}/premium`, { responseType: 'text' });
      const blob = new Blob([data], { type: 'text/html; charset=utf-8' });
      const url = window.URL.createObjectURL(blob);
      const w = window.open(url, '_blank', 'noopener,noreferrer');
      if (!w) {
        toast.warning('Permita pop-ups para abrir a proposta e gerar o PDF.');
        return;
      }
      toast.success('Abra a proposta na nova aba e use Imprimir → Salvar como PDF (ou o botão "Gerar PDF" na página).');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao abrir proposta para PDF.');
    }
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

  return (
    <div className="propostas-orion">
      <header className="propostas-orion-header">
        <div>
          <h1><FiFileText /> Propostas</h1>
          <p>Gerencie suas propostas comerciais</p>
        </div>
        <div className="propostas-orion-actions">
          <Link to="/configuracoes" state={{ tab: 'template-proposta' }} className="btn-orion btn-orion-secondary" title="Configurações (template e variáveis na proposta)">
            <FiSettings /> Config. proposta
          </Link>
          <Link to="/comercial/propostas/nova" className="btn-orion btn-orion-primary">
            <FiPlus /> Nova proposta
          </Link>
        </div>
      </header>

      <p className="propostas-orion-hint">
        <strong>Ver proposta</strong> e <strong>PDF</strong> abrem a proposta em nova aba. Use <strong>Imprimir → Salvar como PDF</strong> (ou o botão laranja na página) para gerar o PDF pelo navegador. <strong>Ver e editar</strong> abre o preview editável.
      </p>
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
        <select
          className="propostas-orion-select"
          value={filterUser}
          onChange={(e) => setFilterUser(e.target.value)}
        >
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
                <th>Valor</th>
                <th>Validade</th>
                <th>Status</th>
                <th>Criado em</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {list.length === 0 ? (
                <tr>
                  <td colSpan="8" className="propostas-orion-empty">
                    Nenhuma proposta encontrada
                  </td>
                </tr>
              ) : (
                list.map((p) => (
                  <tr key={p.id}>
                    <td><strong>{p.numero_proposta || '—'}</strong></td>
                    <td>{p.titulo || '—'}</td>
                    <td>
                      {p.cliente_nome || '—'}
                      {p.cliente_nome_fantasia && p.cliente_nome_fantasia !== p.cliente_nome && (
                        <span className="propostas-orion-fantasia"> ({p.cliente_nome_fantasia})</span>
                      )}
                    </td>
                    <td>{formatMoney(p.valor_total)}</td>
                    <td>
                      {p.validade ? format(new Date(p.validade), 'dd/MM/yyyy', { locale: ptBR }) : '—'}
                    </td>
                    <td>
                      <span
                        className="propostas-orion-status"
                        style={{ backgroundColor: STATUS_COLORS[p.status] || STATUS_COLORS.rascunho }}
                      >
                        {STATUS_LABELS[p.status] || p.status || 'Rascunho'}
                      </span>
                    </td>
                    <td>
                      {p.created_at ? format(new Date(p.created_at), 'dd/MM/yyyy', { locale: ptBR }) : '—'}
                    </td>
                    <td>
                      <div className="propostas-orion-cell-actions">
                        <button
                          type="button"
                          className="propostas-orion-btn-icon propostas-orion-btn-preview"
                          onClick={() => openPreview(p.id)}
                          title="Abrir proposta em nova aba (só visualizar)"
                        >
                          <FiEye /> Ver proposta
                        </button>
                        <button
                          type="button"
                          className="propostas-orion-btn-icon propostas-orion-btn-edit-preview"
                          onClick={() => openPreviewEditavel(p.id)}
                          title="Abrir preview editável (editar layout e textos da proposta)"
                        >
                          <FiEdit2 /> Ver e editar
                        </button>
                        <button
                          type="button"
                          className="propostas-orion-btn-icon propostas-orion-btn-pdf"
                          onClick={() => openPdf(p.id)}
                          title="Abrir proposta em nova aba para imprimir ou Salvar como PDF pelo navegador"
                        >
                          <FiDownload /> PDF
                        </button>
                        <Link
                          to={`/comercial/propostas/editar/${p.id}`}
                          className="propostas-orion-btn-icon"
                          title="Editar"
                        >
                          <FiEdit />
                        </Link>
                        <button
                          type="button"
                          className="propostas-orion-btn-icon propostas-orion-btn-danger"
                          onClick={() => onDelete(p.id, p.numero_proposta)}
                          title="Excluir"
                        >
                          <FiTrash2 />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>

      {showPreviewEditavel && previewEditavelData && (
        <PreviewPropostaEditavel
          proposta={previewEditavelData.proposta}
          formData={previewEditavelData.formData}
          itens={previewEditavelData.itens}
          onClose={() => {
            setShowPreviewEditavel(false);
            setPreviewEditavelData(null);
          }}
          onSave={(result) => {
            if (result?.error) {
              toast.error(result.error);
              return;
            }
            load();
            toast.success('Alterações salvas.');
          }}
        />
      )}
    </div>
  );
}
