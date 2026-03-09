import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import api from '../../services/api';
import { toast } from 'react-toastify';
import { FiPlus, FiSearch, FiEdit, FiTrash2, FiEye, FiDownload, FiFileText, FiSettings } from 'react-icons/fi';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
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

  const openPdf = async (id, numeroProposta) => {
    try {
      const { data } = await api.get(`/propostas/${id}/pdf`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `proposta-${numeroProposta || id}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      toast.success('PDF baixado (gerado no servidor).');
    } catch (err) {
      let msg = 'Erro ao gerar PDF.';
      if (err.response?.data) {
        const d = err.response.data;
        if (typeof d === 'object' && d.error) msg = d.error;
        else if (typeof d.text === 'function') {
          try {
            const j = JSON.parse(await d.text());
            if (j.error) msg = j.error;
          } catch (_) {}
        }
      }
      toast.error(msg);
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
                          className="propostas-orion-btn-icon"
                          onClick={() => openPreview(p.id)}
                          title="Visualizar (HTML)"
                        >
                          <FiEye />
                        </button>
                        <button
                          type="button"
                          className="propostas-orion-btn-icon propostas-orion-btn-pdf"
                          onClick={() => openPdf(p.id, p.numero_proposta)}
                          title="Baixar PDF (gerado no servidor, sem usar impressora do navegador)"
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
    </div>
  );
}
