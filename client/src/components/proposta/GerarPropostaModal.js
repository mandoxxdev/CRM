import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import { toast } from 'react-toastify';
import { FiX, FiCheck, FiTrash2 } from 'react-icons/fi';
import './GerarPropostaModal.css';

const TIPOS = [{ value: 'comercial', label: 'Comercial' }, { value: 'tecnica', label: 'Técnica' }, { value: 'orcamento', label: 'Orçamento' }, { value: 'aditivo', label: 'Aditivo' }];

export default function GerarPropostaModal({ onClose, onSuccess }) {
  const [clientes, setClientes] = useState([]);
  const [oportunidades, setOportunidades] = useState([]);
  const [produtos, setProdutos] = useState([]);
  const [selecionados, setSelecionados] = useState([]);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    cliente_id: '',
    oportunidade_id: '',
    tipo_proposta: '',
    expira_em: '',
    validade_dias: 15,
    condicoes_pagamento: '30% adiantamento + 70% a 14 dias da fatura',
    observacoes: ''
  });

  useEffect(() => {
    Promise.all([
      api.get('/clientes', { params: { status: 'ativo' } }).catch(() => ({ data: [] })),
      api.get('/oportunidades', { params: { status: 'ativa' } }).catch(() => ({ data: [] })),
      api.get('/produtos', { params: { ativo: 'true' } }).catch(() => ({ data: [] }))
    ]).then(([c, o, p]) => {
      setClientes(Array.isArray(c.data) ? c.data : []);
      setOportunidades(Array.isArray(o.data) ? o.data : []);
      setProdutos(Array.isArray(p.data) ? p.data : []);
    });
  }, []);

  const toggleProduto = (prod) => {
    const idx = selecionados.findIndex(p => p.id === prod.id);
    if (idx >= 0) setSelecionados(selecionados.filter((_, i) => i !== idx));
    else setSelecionados([...selecionados, { ...prod, quantidade: 1 }]);
  };

  const setQtd = (id, qtd) => {
    setSelecionados(selecionados.map(p => p.id === id ? { ...p, quantidade: Math.max(1, Number(qtd) || 1) } : p));
  };

  const total = selecionados.reduce((s, p) => s + (Number(p.preco_base) || 0) * (p.quantidade || 1), 0);
  const formatMoney = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v) || 0);

  const submit = async (e) => {
    e.preventDefault();
    if (!form.cliente_id) { toast.error('Selecione o cliente.'); return; }
    if (selecionados.length === 0) { toast.error('Selecione ao menos um produto.'); return; }
    setLoading(true);
    try {
      const payload = {
        cliente_id: form.cliente_id,
        oportunidade_id: form.oportunidade_id || null,
        tipo_proposta: form.tipo_proposta || null,
        expira_em: form.expira_em || null,
        validade_dias: form.validade_dias,
        condicoes_pagamento: form.condicoes_pagamento,
        observacoes: form.observacoes,
        produtos: selecionados.map(p => ({ id: p.id, codigo: p.codigo, nome: p.nome, descricao: p.descricao, preco_base: p.preco_base, unidade: p.unidade || 'UN', familia_produto: p.familia, quantidade: p.quantidade || 1 }))
      };
      const { data } = await api.post('/propostas/gerar-automatica', payload);
      toast.success('Proposta criada.');
      if (onSuccess) onSuccess(data);
      if (onClose) onClose();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao gerar proposta.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="gerar-proposta-modal-overlay" onClick={onClose}>
      <div className="gerar-proposta-modal" onClick={e => e.stopPropagation()}>
        <div className="gerar-proposta-modal-header">
          <h2>Proposta automática</h2>
          <button type="button" className="gerar-proposta-modal-close" onClick={onClose}><FiX /></button>
        </div>
        <p className="gerar-proposta-modal-hint">Selecione cliente e produtos. A proposta será criada em rascunho.</p>
        <form onSubmit={submit} className="gerar-proposta-modal-form">
          <div className="gerar-proposta-modal-grid">
            <div className="gerar-proposta-modal-field">
              <label>Cliente *</label>
              <select value={form.cliente_id} onChange={e => setForm(f => ({ ...f, cliente_id: e.target.value }))} required>
                <option value="">Selecione...</option>
                {clientes.map(c => <option key={c.id} value={c.id}>{c.razao_social || c.nome_fantasia || `#${c.id}`}</option>)}
              </select>
            </div>
            <div className="gerar-proposta-modal-field">
              <label>Oportunidade</label>
              <select value={form.oportunidade_id} onChange={e => setForm(f => ({ ...f, oportunidade_id: e.target.value }))}>
                <option value="">Nenhuma</option>
                {oportunidades.filter(o => !form.cliente_id || o.cliente_id === parseInt(form.cliente_id, 10)).map(o => <option key={o.id} value={o.id}>{o.titulo || `#${o.id}`}</option>)}
              </select>
            </div>
            <div className="gerar-proposta-modal-field">
              <label>Tipo</label>
              <select value={form.tipo_proposta} onChange={e => setForm(f => ({ ...f, tipo_proposta: e.target.value }))}>
                <option value="">—</option>
                {TIPOS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div className="gerar-proposta-modal-field">
              <label>Validade (dias)</label>
              <input type="number" min={1} value={form.validade_dias} onChange={e => setForm(f => ({ ...f, validade_dias: e.target.value }))} />
            </div>
            <div className="gerar-proposta-modal-field">
              <label>Expira em</label>
              <input type="date" value={form.expira_em} onChange={e => setForm(f => ({ ...f, expira_em: e.target.value }))} />
            </div>
          </div>
          <div className="gerar-proposta-modal-field">
            <label>Condições de pagamento</label>
            <input type="text" value={form.condicoes_pagamento} onChange={e => setForm(f => ({ ...f, condicoes_pagamento: e.target.value }))} />
          </div>
          <div className="gerar-proposta-modal-field">
            <label>Observações</label>
            <textarea value={form.observacoes} onChange={e => setForm(f => ({ ...f, observacoes: e.target.value }))} rows={2} />
          </div>

          <div className="gerar-proposta-modal-produtos">
            <h3>Produtos</h3>
            {produtos.length === 0 ? <p className="gerar-proposta-modal-empty">Nenhum produto ativo.</p> : (
              <div className="gerar-proposta-modal-produtos-grid">
                {produtos.map(prod => {
                  const sel = selecionados.find(p => p.id === prod.id);
                  return (
                    <div key={prod.id} className={`gerar-proposta-modal-prod-card ${sel ? 'selecionado' : ''}`} onClick={() => toggleProduto(prod)}>
                      {sel && <FiCheck className="check" />}
                      <strong>{prod.codigo}</strong>
                      <span>{prod.nome}</span>
                      <span>{formatMoney(prod.preco_base)}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {selecionados.length > 0 && (
            <div className="gerar-proposta-modal-selecionados">
              <h3>Selecionados ({selecionados.length})</h3>
              <ul>
                {selecionados.map(p => (
                  <li key={p.id}>
                    <span>{p.codigo} – {p.nome}</span>
                    <input type="number" min={1} value={p.quantidade} onChange={e => setQtd(p.id, e.target.value)} onClick={e => e.stopPropagation()} />
                    <span>{formatMoney((p.preco_base || 0) * (p.quantidade || 1))}</span>
                  </li>
                ))}
              </ul>
              <p className="gerar-proposta-modal-total"><strong>Total: {formatMoney(total)}</strong></p>
            </div>
          )}

          <div className="gerar-proposta-modal-footer">
            <button type="button" className="btn btn-sec" onClick={onClose}>Cancelar</button>
            <button type="submit" className="btn btn-pri" disabled={loading || selecionados.length === 0}>{loading ? 'Gerando...' : 'Gerar proposta'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
