import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../../services/api';
import { toast } from 'react-toastify';
import {
  FiSave, FiX, FiShoppingCart, FiPlus, FiTrash2, FiUser, FiFileText,
} from 'react-icons/fi';
import SelecaoProdutosPremium from '../SelecaoProdutosPremium';
import './PropostaFormOrion.css';

const defaultForm = {
  cliente_id: '',
  titulo: '',
  descricao: '',
  valor_total: 0,
  validade: '',
  condicoes_pagamento: '',
  prazo_entrega: '',
  garantia: '',
  observacoes: '',
  status: 'rascunho',
  responsavel_id: '',
  margem_desconto: 0,
  numero_proposta: '',
  cliente_contato: '',
  cliente_telefone: '',
  cliente_email: '',
};

function buildItemFromProduct(produto) {
  if (produto._configuradoPorMarcadores && !produto.existente) {
    return {
      descricao: produto.nome || `Equipamento sob consulta – ${produto.familia || ''}`,
      quantidade: 1,
      unidade: 'UN',
      valor_unitario: 0,
      valor_total: 0,
      codigo_produto: produto.codigo || 'SOB-CONSULTA',
      familia_produto: produto.familia || '',
      regiao_busca: '',
    };
  }
  const preco = Number(produto.preco_base) || 0;
  return {
    descricao: produto.nome || produto.descricao || '',
    quantidade: 1,
    unidade: produto.unidade || 'UN',
    valor_unitario: preco,
    valor_total: preco,
    codigo_produto: produto.codigo || null,
    familia_produto: produto.familia || produto.familia_produto || '',
    regiao_busca: '',
  };
}

export default function PropostaFormOrion() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEdit = Boolean(id);

  const [form, setForm] = useState({ ...defaultForm });
  const [itens, setItens] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingData, setLoadingData] = useState(true);
  const [showProdutosModal, setShowProdutosModal] = useState(false);

  const recalcTotal = useCallback((items) => {
    const total = (items || []).reduce((s, i) => s + (Number(i.valor_total) || 0), 0);
    setForm((prev) => ({ ...prev, valor_total: total }));
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [cliRes, usrRes] = await Promise.all([
          api.get('/clientes', { params: { ativo: 'true' } }),
          api.get('/usuarios/por-modulo/comercial').catch(() => ({ data: [] })),
        ]);
        if (cancelled) return;
        setClientes(Array.isArray(cliRes.data) ? cliRes.data : []);
        setUsuarios(Array.isArray(usrRes.data) ? usrRes.data : []);
      } catch (e) {
        if (!cancelled) toast.error('Erro ao carregar clientes/usuários.');
      } finally {
        if (!cancelled) setLoadingData(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!isEdit) {
      setLoadingData(false);
      const user = JSON.parse(localStorage.getItem('user') || '{}');
      if (user?.id) setForm((prev) => ({ ...prev, responsavel_id: String(user.id) }));
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.get(`/propostas/${id}`);
        if (cancelled) return;
        setForm({
          cliente_id: data.cliente_id ?? '',
          titulo: data.titulo ?? '',
          descricao: data.descricao ?? '',
          valor_total: Number(data.valor_total) || 0,
          validade: data.validade ? data.validade.split('T')[0] : '',
          condicoes_pagamento: data.condicoes_pagamento ?? '',
          prazo_entrega: data.prazo_entrega ?? '',
          garantia: data.garantia ?? '',
          observacoes: data.observacoes ?? '',
          status: data.status ?? 'rascunho',
          responsavel_id: data.responsavel_id ?? '',
          margem_desconto: Number(data.margem_desconto) || 0,
          numero_proposta: data.numero_proposta ?? '',
          cliente_contato: data.cliente_contato ?? '',
          cliente_telefone: data.cliente_telefone ?? '',
          cliente_email: data.cliente_email ?? '',
        });
        setItens((data.itens || []).map((i) => ({
          descricao: i.descricao ?? '',
          quantidade: Number(i.quantidade) || 1,
          unidade: i.unidade ?? 'UN',
          valor_unitario: Number(i.valor_unitario) || 0,
          valor_total: Number(i.valor_total) || 0,
          codigo_produto: i.codigo_produto ?? null,
          familia_produto: i.familia_produto ?? '',
          regiao_busca: i.regiao_busca ?? '',
        })));
      } catch (e) {
        if (!cancelled) toast.error('Erro ao carregar proposta.');
      } finally {
        if (!cancelled) setLoadingData(false);
      }
    })();
    return () => { cancelled = true; };
  }, [id, isEdit]);

  const updateItem = (index, field, value) => {
    setItens((prev) => {
      const next = prev.map((item, i) => (i !== index ? item : { ...item, [field]: value }));
      if (field === 'quantidade' || field === 'valor_unitario') {
        const item = next[index];
        const q = Number(item.quantidade) || 0;
        const v = Number(item.valor_unitario) || 0;
        next[index] = { ...item, valor_total: q * v };
      }
      recalcTotal(next);
      return next;
    });
  };

  const removeItem = (index) => {
    setItens((prev) => {
      const next = prev.filter((_, i) => i !== index);
      recalcTotal(next);
      return next;
    });
  };

  const onProductsSelected = (produtos) => {
    const novos = produtos.map(buildItemFromProduct);
    setItens((prev) => {
      const next = [...prev, ...novos];
      recalcTotal(next);
      return next;
    });
    setShowProdutosModal(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.cliente_id) {
      toast.error('Selecione o cliente.');
      return;
    }
    if (!form.titulo?.trim()) {
      toast.error('Informe o título.');
      return;
    }
    setLoading(true);
    try {
      const payload = {
        ...form,
        cliente_id: Number(form.cliente_id),
        responsavel_id: form.responsavel_id ? Number(form.responsavel_id) : undefined,
        valor_total: form.valor_total,
        margem_desconto: Number(form.margem_desconto) || 0,
        itens: itens.map((i) => ({
          descricao: i.descricao,
          quantidade: i.quantidade,
          unidade: i.unidade,
          valor_unitario: i.valor_unitario,
          valor_total: i.valor_total,
          codigo_produto: i.codigo_produto || null,
          familia_produto: i.familia_produto || null,
          regiao_busca: i.regiao_busca || null,
        })),
      };
      if (!payload.numero_proposta?.trim()) delete payload.numero_proposta;
      if (isEdit) {
        await api.put(`/propostas/${id}`, payload);
        toast.success('Proposta atualizada.');
      } else {
        await api.post('/propostas', payload);
        toast.success('Proposta criada.');
      }
      navigate('/comercial/propostas');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao salvar.');
    } finally {
      setLoading(false);
    }
  };

  const formatMoney = (v) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v) || 0);

  if (loadingData) {
    return (
      <div className="proposta-form-orion">
        <div className="proposta-form-orion-loading">Carregando...</div>
      </div>
    );
  }

  return (
    <div className="proposta-form-orion">
      <header className="proposta-form-orion-header">
        <h1><FiFileText /> {isEdit ? 'Editar proposta' : 'Nova proposta'}</h1>
        <div className="proposta-form-orion-header-actions">
          <button type="button" className="btn-orion-outline" onClick={() => navigate('/comercial/propostas')}>
            <FiX /> Cancelar
          </button>
          <button type="submit" form="proposta-form-orion-form" className="btn-orion-primary" disabled={loading}>
            <FiSave /> {loading ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </header>

      <form id="proposta-form-orion-form" onSubmit={handleSubmit} className="proposta-form-orion-form">
        <section className="proposta-form-orion-section">
          <h2><FiUser /> Dados da proposta</h2>
          <div className="proposta-form-orion-grid">
            <div className="proposta-form-orion-field">
              <label>Cliente *</label>
              <select
                value={form.cliente_id}
                onChange={(e) => setForm((p) => ({ ...p, cliente_id: e.target.value }))}
                required
              >
                <option value="">Selecione...</option>
                {clientes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome_fantasia || c.razao_social || `Cliente ${c.id}`}
                  </option>
                ))}
              </select>
            </div>
            <div className="proposta-form-orion-field">
              <label>Título *</label>
              <input
                type="text"
                value={form.titulo}
                onChange={(e) => setForm((p) => ({ ...p, titulo: e.target.value }))}
                placeholder="Ex.: Proposta técnica comercial"
                required
              />
            </div>
            <div className="proposta-form-orion-field">
              <label>Validade</label>
              <input
                type="date"
                value={form.validade}
                onChange={(e) => setForm((p) => ({ ...p, validade: e.target.value }))}
              />
            </div>
            <div className="proposta-form-orion-field">
              <label>Responsável</label>
              <select
                value={form.responsavel_id}
                onChange={(e) => setForm((p) => ({ ...p, responsavel_id: e.target.value }))}
              >
                <option value="">—</option>
                {usuarios.map((u) => (
                  <option key={u.id} value={u.id}>{u.nome}</option>
                ))}
              </select>
            </div>
            <div className="proposta-form-orion-field full">
              <label>Descrição</label>
              <textarea
                value={form.descricao}
                onChange={(e) => setForm((p) => ({ ...p, descricao: e.target.value }))}
                rows={2}
              />
            </div>
            <div className="proposta-form-orion-field full">
              <label>Condições de pagamento</label>
              <input
                type="text"
                value={form.condicoes_pagamento}
                onChange={(e) => setForm((p) => ({ ...p, condicoes_pagamento: e.target.value }))}
              />
            </div>
            <div className="proposta-form-orion-field">
              <label>Prazo de entrega</label>
              <input
                type="text"
                value={form.prazo_entrega}
                onChange={(e) => setForm((p) => ({ ...p, prazo_entrega: e.target.value }))}
              />
            </div>
            <div className="proposta-form-orion-field">
              <label>Garantia</label>
              <input
                type="text"
                value={form.garantia}
                onChange={(e) => setForm((p) => ({ ...p, garantia: e.target.value }))}
              />
            </div>
            <div className="proposta-form-orion-field">
              <label>Desconto (%)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.margem_desconto}
                onChange={(e) => setForm((p) => ({ ...p, margem_desconto: e.target.value }))}
              />
            </div>
          </div>
        </section>

        <section className="proposta-form-orion-section proposta-form-orion-cart">
          <h2><FiShoppingCart /> Carrinho</h2>
          <p className="proposta-form-orion-hint">
            Adicione produtos ao carrinho. A proposta gerada usará o template e as variáveis técnicas definidas em Configurações.
          </p>
          <div className="proposta-form-orion-cart-actions">
            <button
              type="button"
              className="btn-orion-primary"
              onClick={() => setShowProdutosModal(true)}
            >
              <FiPlus /> Adicionar produtos
            </button>
          </div>
          {itens.length === 0 ? (
            <div className="proposta-form-orion-cart-empty">
              Nenhum item no carrinho. Clique em &quot;Adicionar produtos&quot; para escolher itens do catálogo.
            </div>
          ) : (
            <div className="proposta-form-orion-table-wrap">
              <table className="proposta-form-orion-table">
                <thead>
                  <tr>
                    <th>Descrição</th>
                    <th>Qtd</th>
                    <th>Un.</th>
                    <th>Valor unit.</th>
                    <th>Total</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {itens.map((item, idx) => (
                    <tr key={idx}>
                      <td>{item.descricao}</td>
                      <td>
                        <input
                          type="number"
                          min="0.01"
                          step="0.01"
                          value={item.quantidade}
                          onChange={(e) => updateItem(idx, 'quantidade', e.target.value)}
                          className="proposta-form-orion-input-num"
                        />
                      </td>
                      <td>{item.unidade}</td>
                      <td>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={item.valor_unitario}
                          onChange={(e) => updateItem(idx, 'valor_unitario', e.target.value)}
                          className="proposta-form-orion-input-num"
                        />
                      </td>
                      <td>{formatMoney(item.valor_total)}</td>
                      <td>
                        <button
                          type="button"
                          className="proposta-form-orion-btn-remove"
                          onClick={() => removeItem(idx)}
                          title="Remover"
                        >
                          <FiTrash2 />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="proposta-form-orion-total">
                <strong>Total da proposta: {formatMoney(form.valor_total)}</strong>
              </div>
            </div>
          )}
        </section>
      </form>

      {showProdutosModal && (
        <SelecaoProdutosPremium
          onClose={() => setShowProdutosModal(false)}
          onSelect={onProductsSelected}
          produtosSelecionados={[]}
        />
      )}
    </div>
  );
}
