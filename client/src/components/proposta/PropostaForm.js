import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../../services/api';
import { toast } from 'react-toastify';
import { FiSave, FiX, FiUser, FiFileText, FiEye, FiDownload, FiPlus, FiTrash2 } from 'react-icons/fi';
import SelecaoProdutosPremium from '../SelecaoProdutosPremium';
import './PropostaForm.css';

const TIPOS = [{ value: 'comercial', label: 'Comercial' }, { value: 'tecnica', label: 'Técnica' }, { value: 'orcamento', label: 'Orçamento' }, { value: 'aditivo', label: 'Aditivo' }];

const defaultForm = {
  cliente_id: '',
  titulo: '',
  descricao: '',
  validade: '',
  condicoes_pagamento: '',
  prazo_entrega: '',
  garantia: '',
  observacoes: '',
  oportunidade_id: '',
  tipo_proposta: '',
  expira_em: '',
  responsavel_id: '',
  margem_desconto: 0
};

function produtoParaItem(p) {
  const preco = Number(p.preco_base) || 0;
  return {
    descricao: p.nome || p.descricao || '',
    quantidade: 1,
    unidade: p.unidade || 'UN',
    valor_unitario: preco,
    valor_total: preco,
    codigo_produto: p.codigo || null,
    familia_produto: p.familia || p.familia_produto || '',
    regiao_busca: ''
  };
}

export default function PropostaForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEdit = Boolean(id);
  const [form, setForm] = useState({ ...defaultForm });
  const [itens, setItens] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  const [oportunidades, setOportunidades] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingData, setLoadingData] = useState(true);
  const [showProdutos, setShowProdutos] = useState(false);

  const recalcTotal = useCallback(() => {
    const t = itens.reduce((s, i) => s + (Number(i.valor_total) || 0), 0);
    setForm(f => ({ ...f, valor_total: t }));
  }, [itens]);

  useEffect(() => { recalcTotal(); }, [recalcTotal]);

  useEffect(() => {
    Promise.all([
      api.get('/clientes', { params: { status: 'ativo' } }).catch(() => ({ data: [] })),
      api.get('/usuarios/por-modulo/comercial').catch(() => ({ data: [] })),
      api.get('/oportunidades', { params: { status: 'ativa' } }).catch(() => ({ data: [] }))
    ]).then(([c, u, o]) => {
      setClientes(Array.isArray(c.data) ? c.data : []);
      setUsuarios(Array.isArray(u.data) ? u.data : []);
      setOportunidades(Array.isArray(o.data) ? o.data : []);
      const user = JSON.parse(localStorage.getItem('user') || '{}');
      if (!isEdit && user?.id) setForm(f => ({ ...f, responsavel_id: String(user.id) }));
    });
  }, [isEdit]);

  useEffect(() => {
    if (!isEdit) { setLoadingData(false); return; }
    api.get(`/propostas/${id}`)
      .then(({ data }) => {
        setForm({
          cliente_id: data.cliente_id ?? '',
          titulo: data.titulo ?? '',
          descricao: data.descricao ?? '',
          validade: data.validade ? data.validade.split('T')[0] : '',
          condicoes_pagamento: data.condicoes_pagamento ?? '',
          prazo_entrega: data.prazo_entrega ?? '',
          garantia: data.garantia ?? '',
          observacoes: data.observacoes ?? '',
          oportunidade_id: data.oportunidade_id ?? '',
          tipo_proposta: data.tipo_proposta ?? '',
          expira_em: data.expira_em ? data.expira_em.split('T')[0] : '',
          responsavel_id: data.responsavel_id ?? '',
          margem_desconto: Number(data.margem_desconto) || 0,
          valor_total: Number(data.valor_total) || 0,
          status: data.status ?? 'rascunho'
        });
        setItens((data.itens || []).map(i => ({
          descricao: i.descricao ?? '',
          quantidade: Number(i.quantidade) || 1,
          unidade: i.unidade ?? 'UN',
          valor_unitario: Number(i.valor_unitario) || 0,
          valor_total: Number(i.valor_total) || 0,
          codigo_produto: i.codigo_produto ?? null,
          familia_produto: i.familia_produto ?? '',
          regiao_busca: i.regiao_busca ?? ''
        })));
      })
      .catch(() => toast.error('Erro ao carregar proposta.'))
      .finally(() => setLoadingData(false));
  }, [id, isEdit]);

  const updateItem = (idx, field, value) => {
    setItens(prev => {
      const next = prev.map((item, i) => i !== idx ? item : { ...item, [field]: value });
      if (field === 'quantidade' || field === 'valor_unitario') {
        const it = next[idx];
        const q = Number(it.quantidade) || 0;
        const v = Number(it.valor_unitario) || 0;
        next[idx] = { ...next[idx], valor_total: q * v };
      }
      return next;
    });
  };

  const removeItem = (idx) => setItens(prev => prev.filter((_, i) => i !== idx));

  const onProdutosSelect = (produtos) => {
    const novos = (produtos || []).map(produtoParaItem);
    setItens(prev => [...prev, ...novos]);
    setShowProdutos(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.cliente_id) { toast.error('Selecione o cliente.'); return; }
    if (!form.titulo?.trim()) { toast.error('Informe o título.'); return; }
    setLoading(true);
    try {
      const payload = {
        ...form,
        cliente_id: Number(form.cliente_id),
        responsavel_id: form.responsavel_id ? Number(form.responsavel_id) : undefined,
        valor_total: itens.reduce((s, i) => s + (Number(i.valor_total) || 0), 0),
        margem_desconto: Number(form.margem_desconto) || 0,
        oportunidade_id: form.oportunidade_id ? Number(form.oportunidade_id) : undefined,
        tipo_proposta: form.tipo_proposta || undefined,
        expira_em: form.expira_em || undefined,
        itens: itens.map(i => ({
          descricao: i.descricao,
          quantidade: i.quantidade,
          unidade: i.unidade,
          valor_unitario: i.valor_unitario,
          valor_total: i.valor_total,
          codigo_produto: i.codigo_produto || null,
          familia_produto: i.familia_produto || null,
          regiao_busca: i.regiao_busca || null
        }))
      };
      if (isEdit) await api.put(`/propostas/${id}`, payload);
      else await api.post('/propostas', payload);
      toast.success(isEdit ? 'Proposta atualizada.' : 'Proposta criada.');
      navigate('/comercial/propostas');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao salvar.');
    } finally {
      setLoading(false);
    }
  };

  const abrirPreview = () => {
    if (!id) return;
    api.get(`/propostas/${id}/premium`, { responseType: 'text' }).then(({ data }) => {
      const url = URL.createObjectURL(new Blob([data], { type: 'text/html;charset=utf-8' }));
      window.open(url, '_blank');
    }).catch(() => toast.error('Erro ao abrir proposta.'));
  };

  const baixarPdf = () => {
    if (!id) return;
    api.get(`/propostas/${id}/pdf`, { responseType: 'blob' }).then(({ data }) => {
      const url = URL.createObjectURL(new Blob([data], { type: 'application/pdf' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `proposta-${id}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('PDF baixado.');
    }).catch(() => toast.error('Erro ao gerar PDF.'));
  };

  const formatMoney = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v) || 0);
  const somenteLeitura = isEdit && form.status && form.status !== 'rascunho';

  if (loadingData) return <div className="proposta-form"><p className="proposta-form-loading">Carregando...</p></div>;

  return (
    <div className="proposta-form">
      <header className="proposta-form-header">
        <h1>{isEdit ? 'Editar proposta' : 'Nova proposta'}</h1>
        <div className="proposta-form-header-actions">
          {isEdit && (
            <>
              <button type="button" className="btn btn-sec" onClick={abrirPreview}><FiEye /> Ver proposta</button>
              <button type="button" className="btn btn-sec" onClick={baixarPdf}><FiDownload /> PDF</button>
            </>
          )}
          <button type="button" className="btn btn-sec" onClick={() => navigate('/comercial/propostas')}><FiX /> Cancelar</button>
          {!somenteLeitura && <button type="submit" form="proposta-form-form" className="btn btn-pri" disabled={loading}><FiSave /> {loading ? 'Salvando...' : 'Salvar'}</button>}
        </div>
      </header>

      {somenteLeitura && (
        <div className="proposta-form-alert">Proposta só pode ser editada em rascunho. Use &quot;Nova revisão&quot; na listagem para criar nova versão.</div>
      )}

      <form id="proposta-form-form" onSubmit={handleSubmit} className="proposta-form-form">
        <section className="proposta-form-section">
          <h2><FiUser /> Dados</h2>
          <div className="proposta-form-grid">
            <div className="proposta-form-field">
              <label>Cliente *</label>
              <select value={form.cliente_id} onChange={e => setForm(f => ({ ...f, cliente_id: e.target.value }))} required disabled={somenteLeitura}>
                <option value="">Selecione...</option>
                {clientes.map(c => <option key={c.id} value={c.id}>{c.razao_social || c.nome_fantasia || `#${c.id}`}</option>)}
              </select>
            </div>
            <div className="proposta-form-field">
              <label>Título *</label>
              <input type="text" value={form.titulo} onChange={e => setForm(f => ({ ...f, titulo: e.target.value }))} required disabled={somenteLeitura} placeholder="Ex.: Proposta comercial" />
            </div>
            <div className="proposta-form-field">
              <label>Validade</label>
              <input type="date" value={form.validade} onChange={e => setForm(f => ({ ...f, validade: e.target.value }))} disabled={somenteLeitura} />
            </div>
            <div className="proposta-form-field">
              <label>Oportunidade</label>
              <select value={form.oportunidade_id} onChange={e => setForm(f => ({ ...f, oportunidade_id: e.target.value }))} disabled={somenteLeitura}>
                <option value="">Nenhuma</option>
                {oportunidades.map(o => <option key={o.id} value={o.id}>{o.titulo || `#${o.id}`}</option>)}
              </select>
            </div>
            <div className="proposta-form-field">
              <label>Tipo</label>
              <select value={form.tipo_proposta} onChange={e => setForm(f => ({ ...f, tipo_proposta: e.target.value }))} disabled={somenteLeitura}>
                <option value="">—</option>
                {TIPOS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div className="proposta-form-field">
              <label>Expira em</label>
              <input type="date" value={form.expira_em} onChange={e => setForm(f => ({ ...f, expira_em: e.target.value }))} disabled={somenteLeitura} />
            </div>
            <div className="proposta-form-field">
              <label>Responsável</label>
              <select value={form.responsavel_id} onChange={e => setForm(f => ({ ...f, responsavel_id: e.target.value }))} disabled={somenteLeitura}>
                <option value="">—</option>
                {usuarios.map(u => <option key={u.id} value={u.id}>{u.nome}</option>)}
              </select>
            </div>
          </div>
          <div className="proposta-form-field">
            <label>Descrição</label>
            <textarea value={form.descricao} onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))} rows={2} disabled={somenteLeitura} />
          </div>
          <div className="proposta-form-field">
            <label>Condições de pagamento</label>
            <input type="text" value={form.condicoes_pagamento} onChange={e => setForm(f => ({ ...f, condicoes_pagamento: e.target.value }))} disabled={somenteLeitura} />
          </div>
          <div className="proposta-form-field full">
            <label>Prazo entrega</label>
            <input type="text" value={form.prazo_entrega} onChange={e => setForm(f => ({ ...f, prazo_entrega: e.target.value }))} disabled={somenteLeitura} />
          </div>
          <div className="proposta-form-field full">
            <label>Garantia</label>
            <input type="text" value={form.garantia} onChange={e => setForm(f => ({ ...f, garantia: e.target.value }))} disabled={somenteLeitura} />
          </div>
        </section>

        <section className="proposta-form-section">
          <h2><FiFileText /> Itens</h2>
          {!somenteLeitura && (
            <button type="button" className="btn btn-pri" onClick={() => setShowProdutos(true)}><FiPlus /> Adicionar produtos</button>
          )}
          {itens.length === 0 ? (
            <p className="proposta-form-empty">Nenhum item. Clique em Adicionar produtos.</p>
          ) : (
            <div className="proposta-form-table-wrap">
              <table className="proposta-form-table">
                <thead>
                  <tr><th>Descrição</th><th>Qtd</th><th>Un.</th><th>Val. unit.</th><th>Total</th>{!somenteLeitura && <th></th>}</tr>
                </thead>
                <tbody>
                  {itens.map((item, idx) => (
                    <tr key={idx}>
                      <td>{item.descricao}</td>
                      <td><input type="number" min={0.01} step={0.01} value={item.quantidade} onChange={e => updateItem(idx, 'quantidade', e.target.value)} disabled={somenteLeitura} className="input-num" /></td>
                      <td>{item.unidade}</td>
                      <td><input type="number" min={0} step={0.01} value={item.valor_unitario} onChange={e => updateItem(idx, 'valor_unitario', e.target.value)} disabled={somenteLeitura} className="input-num" /></td>
                      <td>{formatMoney(item.valor_total)}</td>
                      {!somenteLeitura && <td><button type="button" className="btn-remove" onClick={() => removeItem(idx)} title="Remover"><FiTrash2 /></button></td>}
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="proposta-form-total"><strong>Total: {formatMoney(itens.reduce((s, i) => s + (Number(i.valor_total) || 0), 0))}</strong></p>
            </div>
          )}
        </section>
      </form>

      {showProdutos && (
        <SelecaoProdutosPremium
          onClose={() => setShowProdutos(false)}
          onSelect={onProdutosSelect}
          produtosSelecionados={[]}
        />
      )}
    </div>
  );
}
