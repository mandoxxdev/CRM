import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../../services/api';
import { toast } from 'react-toastify';
import { FiSave, FiX, FiUser, FiFileText, FiEye, FiDownload, FiPlus, FiTrash2, FiBarChart2 } from 'react-icons/fi';
import SelecaoProdutosPremium from '../SelecaoProdutosPremium';
import {
  STATUS_PROPOSTA,
  ORIGENS_BUSCA,
  MOTIVOS_NAO_VENDA,
  REGIOES_BUSCA,
  FAMILIAS_PRODUTO_PADRAO,
  STATUS_EXIGE_MOTIVO
} from '../../constants/propostaComercial';
import './PropostaForm.css';

const TIPOS = [
  { value: 'comercial', label: 'Comercial' },
  { value: 'tecnica', label: 'Técnica' },
  { value: 'orcamento', label: 'Orçamento' },
  { value: 'aditivo', label: 'Aditivo' }
];

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
  margem_desconto: 0,
  status: 'rascunho',
  origem_busca: '',
  motivo_nao_venda: '',
  familia_produto: '',
  lembrete_data: '',
  lembrete_mensagem: '',
  probabilidade: 50,
  data_fechamento: ''
};

function emptyItem() {
  return {
    descricao: '',
    quantidade: 1,
    unidade: 'UN',
    valor_unitario: 0,
    valor_total: 0,
    codigo_produto: '',
    familia_produto: '',
    regiao_busca: '',
    manual: true
  };
}

function produtoParaItem(p) {
  const preco = Number(p.preco_base) || 0;
  return {
    descricao: p.nome || p.descricao || '',
    quantidade: 1,
    unidade: p.unidade || 'UN',
    valor_unitario: preco,
    valor_total: preco,
    codigo_produto: p.codigo || '',
    familia_produto: p.familia || p.familia_produto || '',
    regiao_busca: '',
    manual: false
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
  const [familiasFromApi, setFamiliasFromApi] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingData, setLoadingData] = useState(true);
  const [showProdutos, setShowProdutos] = useState(false);

  const familiasProduto = useMemo(() => {
    const fromApi = (familiasFromApi || []).map((f) => (typeof f === 'string' ? f : f.nome)).filter(Boolean);
    const base = fromApi.length > 0 ? fromApi : FAMILIAS_PRODUTO_PADRAO;
    return base.includes('Outros') ? base : [...base, 'Outros'];
  }, [familiasFromApi]);

  const exigeMotivo = STATUS_EXIGE_MOTIVO.includes(form.status);
  const somenteLeitura = isEdit && form.status && form.status !== 'rascunho';

  const recalcTotal = useCallback(() => {
    const t = itens.reduce((s, i) => s + (Number(i.valor_total) || 0), 0);
    setForm((f) => ({ ...f, valor_total: t }));
  }, [itens]);

  useEffect(() => { recalcTotal(); }, [recalcTotal]);

  useEffect(() => {
    Promise.all([
      api.get('/clientes', { params: { status: 'ativo' } }).catch(() => ({ data: [] })),
      api.get('/usuarios/por-modulo/comercial').catch(() => ({ data: [] })),
      api.get('/oportunidades', { params: { status: 'ativa' } }).catch(() => ({ data: [] })),
      api.get('/familias').catch(() => ({ data: [] }))
    ]).then(([c, u, o, f]) => {
      setClientes(Array.isArray(c.data) ? c.data : []);
      setUsuarios(Array.isArray(u.data) ? u.data : []);
      setOportunidades(Array.isArray(o.data) ? o.data : []);
      setFamiliasFromApi(Array.isArray(f.data) ? f.data : []);
      const user = JSON.parse(localStorage.getItem('user') || '{}');
      if (!isEdit && user?.id) setForm((prev) => ({ ...prev, responsavel_id: String(user.id) }));
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
          status: data.status ?? 'rascunho',
          origem_busca: data.origem_busca ?? '',
          motivo_nao_venda: data.motivo_nao_venda ?? '',
          familia_produto: data.familia_produto ?? '',
          lembrete_data: data.lembrete_data ? data.lembrete_data.split('T')[0] : '',
          lembrete_mensagem: data.lembrete_mensagem ?? '',
          probabilidade: data.probabilidade != null ? Number(data.probabilidade) : 50,
          data_fechamento: data.data_fechamento ? data.data_fechamento.split('T')[0] : ''
        });
        setItens((data.itens || []).map((i) => ({
          descricao: i.descricao ?? '',
          quantidade: Number(i.quantidade) || 1,
          unidade: i.unidade ?? 'UN',
          valor_unitario: Number(i.valor_unitario) || 0,
          valor_total: Number(i.valor_total) || 0,
          codigo_produto: i.codigo_produto ?? '',
          familia_produto: i.familia_produto ?? '',
          regiao_busca: i.regiao_busca ?? '',
          manual: !i.codigo_produto
        })));
      })
      .catch(() => toast.error('Erro ao carregar proposta.'))
      .finally(() => setLoadingData(false));
  }, [id, isEdit]);

  const updateItem = (idx, field, value) => {
    setItens((prev) => {
      const next = prev.map((item, i) => (i !== idx ? item : { ...item, [field]: value }));
      if (field === 'quantidade' || field === 'valor_unitario') {
        const it = next[idx];
        const q = Number(it.quantidade) || 0;
        const v = Number(it.valor_unitario) || 0;
        next[idx] = { ...next[idx], valor_total: q * v };
      }
      return next;
    });
  };

  const addManualItem = () => setItens((prev) => [...prev, emptyItem()]);
  const removeItem = (idx) => setItens((prev) => prev.filter((_, i) => i !== idx));

  const onProdutosSelect = (produtos) => {
    const novos = (produtos || []).map(produtoParaItem);
    setItens((prev) => [...prev, ...novos]);
    setShowProdutos(false);
  };

  const handleStatusChange = (status) => {
    setForm((f) => ({
      ...f,
      status,
      motivo_nao_venda: STATUS_EXIGE_MOTIVO.includes(status) ? f.motivo_nao_venda : '',
      data_fechamento: ['aprovada', 'rejeitada'].includes(status) && !f.data_fechamento
        ? new Date().toISOString().split('T')[0]
        : f.data_fechamento
    }));
  };

  const validateForm = () => {
    if (!form.cliente_id) { toast.error('Selecione o cliente.'); return false; }
    if (!form.titulo?.trim()) { toast.error('Informe o título.'); return false; }
    if (exigeMotivo && !form.motivo_nao_venda?.trim()) {
      toast.error('Informe o motivo da não venda para propostas perdidas/rejeitadas.');
      return false;
    }
    const itensInvalidos = itens.some((i) => !i.descricao?.trim());
    if (itens.length > 0 && itensInvalidos) {
      toast.error('Todos os itens precisam de descrição.');
      return false;
    }
    return true;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;
    setLoading(true);
    try {
      const payload = {
        ...form,
        cliente_id: Number(form.cliente_id),
        responsavel_id: form.responsavel_id ? Number(form.responsavel_id) : undefined,
        valor_total: itens.reduce((s, i) => s + (Number(i.valor_total) || 0), 0),
        margem_desconto: Number(form.margem_desconto) || 0,
        probabilidade: Number(form.probabilidade) || 0,
        oportunidade_id: form.oportunidade_id ? Number(form.oportunidade_id) : undefined,
        tipo_proposta: form.tipo_proposta || undefined,
        expira_em: form.expira_em || undefined,
        data_fechamento: form.data_fechamento || undefined,
        motivo_nao_venda: exigeMotivo ? form.motivo_nao_venda : null,
        origem_busca: form.origem_busca || null,
        familia_produto: form.familia_produto || null,
        lembrete_data: form.lembrete_data || null,
        lembrete_mensagem: form.lembrete_mensagem || null,
        itens: itens.map((i) => ({
          descricao: i.descricao,
          quantidade: i.quantidade,
          unidade: i.unidade,
          valor_unitario: i.valor_unitario,
          valor_total: i.valor_total,
          codigo_produto: i.codigo_produto?.trim() || null,
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
          {!somenteLeitura && (
            <button type="submit" form="proposta-form-form" className="btn btn-pri" disabled={loading}>
              <FiSave /> {loading ? 'Salvando...' : 'Salvar'}
            </button>
          )}
        </div>
      </header>

      {somenteLeitura && (
        <div className="proposta-form-alert">
          Proposta só pode ser editada em rascunho. Use &quot;Nova revisão&quot; na listagem para criar nova versão.
        </div>
      )}

      <form id="proposta-form-form" onSubmit={handleSubmit} className="proposta-form-form">
        <section className="proposta-form-section">
          <h2><FiUser /> Dados gerais</h2>
          <div className="proposta-form-grid">
            <div className="proposta-form-field">
              <label>Cliente *</label>
              <select value={form.cliente_id} onChange={(e) => setForm((f) => ({ ...f, cliente_id: e.target.value }))} required disabled={somenteLeitura}>
                <option value="">Selecione...</option>
                {clientes.map((c) => (
                  <option key={c.id} value={c.id}>{c.razao_social || c.nome_fantasia || `#${c.id}`}</option>
                ))}
              </select>
              <span className="proposta-form-hint">UF e segmento vêm do cadastro do cliente (gráficos do dashboard)</span>
            </div>
            <div className="proposta-form-field">
              <label>Título *</label>
              <input type="text" value={form.titulo} onChange={(e) => setForm((f) => ({ ...f, titulo: e.target.value }))} required disabled={somenteLeitura} placeholder="Ex.: Proposta comercial" />
            </div>
            <div className="proposta-form-field">
              <label>Validade</label>
              <input type="date" value={form.validade} onChange={(e) => setForm((f) => ({ ...f, validade: e.target.value }))} disabled={somenteLeitura} />
            </div>
            <div className="proposta-form-field">
              <label>Oportunidade</label>
              <select value={form.oportunidade_id} onChange={(e) => setForm((f) => ({ ...f, oportunidade_id: e.target.value }))} disabled={somenteLeitura}>
                <option value="">Nenhuma</option>
                {oportunidades.map((o) => <option key={o.id} value={o.id}>{o.titulo || `#${o.id}`}</option>)}
              </select>
            </div>
            <div className="proposta-form-field">
              <label>Tipo</label>
              <select value={form.tipo_proposta} onChange={(e) => setForm((f) => ({ ...f, tipo_proposta: e.target.value }))} disabled={somenteLeitura}>
                <option value="">—</option>
                {TIPOS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div className="proposta-form-field">
              <label>Expira em</label>
              <input type="date" value={form.expira_em} onChange={(e) => setForm((f) => ({ ...f, expira_em: e.target.value }))} disabled={somenteLeitura} />
            </div>
            <div className="proposta-form-field">
              <label>Responsável (vendedor)</label>
              <select value={form.responsavel_id} onChange={(e) => setForm((f) => ({ ...f, responsavel_id: e.target.value }))} disabled={somenteLeitura}>
                <option value="">—</option>
                {usuarios.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
              </select>
            </div>
            <div className="proposta-form-field">
              <label>Margem de desconto (%)</label>
              <input type="number" min={0} max={100} step={0.1} value={form.margem_desconto} onChange={(e) => setForm((f) => ({ ...f, margem_desconto: e.target.value }))} disabled={somenteLeitura} />
            </div>
          </div>
          <div className="proposta-form-field">
            <label>Descrição</label>
            <textarea value={form.descricao} onChange={(e) => setForm((f) => ({ ...f, descricao: e.target.value }))} rows={2} disabled={somenteLeitura} />
          </div>
          <div className="proposta-form-grid">
            <div className="proposta-form-field">
              <label>Condições de pagamento</label>
              <input type="text" value={form.condicoes_pagamento} onChange={(e) => setForm((f) => ({ ...f, condicoes_pagamento: e.target.value }))} disabled={somenteLeitura} />
            </div>
            <div className="proposta-form-field">
              <label>Prazo entrega</label>
              <input type="text" value={form.prazo_entrega} onChange={(e) => setForm((f) => ({ ...f, prazo_entrega: e.target.value }))} disabled={somenteLeitura} />
            </div>
            <div className="proposta-form-field">
              <label>Garantia</label>
              <input type="text" value={form.garantia} onChange={(e) => setForm((f) => ({ ...f, garantia: e.target.value }))} disabled={somenteLeitura} />
            </div>
          </div>
        </section>

        <section className="proposta-form-section proposta-form-section-dashboard">
          <h2><FiBarChart2 /> Pipeline e dashboard</h2>
          <p className="proposta-form-section-desc">Campos vinculados aos gráficos do dashboard comercial (funil, origem, família, motivos de perda e lembretes).</p>
          <div className="proposta-form-grid">
            <div className="proposta-form-field">
              <label>Status da proposta *</label>
              <select value={form.status} onChange={(e) => handleStatusChange(e.target.value)} disabled={somenteLeitura}>
                {STATUS_PROPOSTA.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
            <div className="proposta-form-field">
              <label>Origem da busca (marketing)</label>
              <select value={form.origem_busca} onChange={(e) => setForm((f) => ({ ...f, origem_busca: e.target.value }))} disabled={somenteLeitura}>
                <option value="">Selecione...</option>
                {ORIGENS_BUSCA.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            <div className="proposta-form-field">
              <label>Família de produto / equipamento</label>
              <select value={form.familia_produto} onChange={(e) => setForm((f) => ({ ...f, familia_produto: e.target.value }))} disabled={somenteLeitura}>
                <option value="">Selecione...</option>
                {familiasProduto.map((fam) => <option key={fam} value={fam}>{fam}</option>)}
              </select>
            </div>
            <div className="proposta-form-field">
              <label>Probabilidade de fechamento (%)</label>
              <input type="number" min={0} max={100} value={form.probabilidade} onChange={(e) => setForm((f) => ({ ...f, probabilidade: e.target.value }))} disabled={somenteLeitura} />
              <span className="proposta-form-hint">Usado na previsão de fechamento do dashboard de vendas</span>
            </div>
            <div className="proposta-form-field">
              <label>Data de fechamento</label>
              <input type="date" value={form.data_fechamento} onChange={(e) => setForm((f) => ({ ...f, data_fechamento: e.target.value }))} disabled={somenteLeitura} />
              <span className="proposta-form-hint">Preenchida automaticamente ao marcar como ganha ou perdida</span>
            </div>
            {exigeMotivo && (
              <div className="proposta-form-field proposta-form-field-required">
                <label>Motivo da não venda *</label>
                <select value={form.motivo_nao_venda} onChange={(e) => setForm((f) => ({ ...f, motivo_nao_venda: e.target.value }))} required disabled={somenteLeitura}>
                  <option value="">Selecione o motivo...</option>
                  {MOTIVOS_NAO_VENDA.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
            )}
            <div className="proposta-form-field">
              <label>Data do lembrete</label>
              <input type="date" value={form.lembrete_data} onChange={(e) => setForm((f) => ({ ...f, lembrete_data: e.target.value }))} disabled={somenteLeitura} />
            </div>
            <div className="proposta-form-field full">
              <label>Mensagem do lembrete</label>
              <textarea value={form.lembrete_mensagem} onChange={(e) => setForm((f) => ({ ...f, lembrete_mensagem: e.target.value }))} rows={2} disabled={somenteLeitura} placeholder="Aviso para follow-up desta cotação..." />
            </div>
          </div>
        </section>

        <section className="proposta-form-section">
          <h2><FiFileText /> Itens da proposta</h2>
          {!somenteLeitura && (
            <div className="proposta-form-item-actions">
              <button type="button" className="btn btn-pri" onClick={() => setShowProdutos(true)}><FiPlus /> Catálogo de produtos</button>
              <button type="button" className="btn btn-sec" onClick={addManualItem}><FiPlus /> Item manual</button>
            </div>
          )}
          {itens.length === 0 ? (
            <p className="proposta-form-empty">Nenhum item. Adicione do catálogo ou crie um item manual (texto livre).</p>
          ) : (
            <div className="proposta-form-table-wrap">
              <table className="proposta-form-table">
                <thead>
                  <tr>
                    <th>Código</th>
                    <th>Descrição</th>
                    <th>Qtd</th>
                    <th>Un.</th>
                    <th>Val. unit.</th>
                    <th>Total</th>
                    <th>Família</th>
                    <th>Região</th>
                    {!somenteLeitura && <th />}
                  </tr>
                </thead>
                <tbody>
                  {itens.map((item, idx) => (
                    <tr key={idx} className={item.manual ? 'item-manual' : ''}>
                      <td>
                        {item.manual && !somenteLeitura ? (
                          <input type="text" value={item.codigo_produto} onChange={(e) => updateItem(idx, 'codigo_produto', e.target.value)} placeholder="Opcional" className="input-text-sm" />
                        ) : (item.codigo_produto || '—')}
                      </td>
                      <td>
                        {item.manual && !somenteLeitura ? (
                          <input type="text" value={item.descricao} onChange={(e) => updateItem(idx, 'descricao', e.target.value)} placeholder="Descrição do item" className="input-text" required />
                        ) : item.descricao}
                      </td>
                      <td><input type="number" min={0.01} step={0.01} value={item.quantidade} onChange={(e) => updateItem(idx, 'quantidade', e.target.value)} disabled={somenteLeitura} className="input-num" /></td>
                      <td>
                        {item.manual && !somenteLeitura ? (
                          <input type="text" value={item.unidade} onChange={(e) => updateItem(idx, 'unidade', e.target.value)} className="input-text-sm" />
                        ) : item.unidade}
                      </td>
                      <td><input type="number" min={0} step={0.01} value={item.valor_unitario} onChange={(e) => updateItem(idx, 'valor_unitario', e.target.value)} disabled={somenteLeitura} className="input-num" /></td>
                      <td>{formatMoney(item.valor_total)}</td>
                      <td>
                        {!somenteLeitura ? (
                          <select value={item.familia_produto} onChange={(e) => updateItem(idx, 'familia_produto', e.target.value)} className="input-select-sm">
                            <option value="">—</option>
                            {familiasProduto.map((fam) => <option key={fam} value={fam}>{fam}</option>)}
                          </select>
                        ) : (item.familia_produto || '—')}
                      </td>
                      <td>
                        {!somenteLeitura ? (
                          <select value={item.regiao_busca} onChange={(e) => updateItem(idx, 'regiao_busca', e.target.value)} className="input-select-sm">
                            <option value="">—</option>
                            {REGIOES_BUSCA.map((r) => <option key={r} value={r}>{r}</option>)}
                          </select>
                        ) : (item.regiao_busca || '—')}
                      </td>
                      {!somenteLeitura && (
                        <td>
                          <button type="button" className="btn-remove" onClick={() => removeItem(idx)} title="Remover"><FiTrash2 /></button>
                        </td>
                      )}
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
