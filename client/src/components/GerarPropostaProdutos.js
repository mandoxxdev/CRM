import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { toast } from 'react-toastify';
import { FiX, FiCheck, FiTrash2 } from 'react-icons/fi';
import './GerarPropostaProdutos.css';

const TIPO_PROPOSTA_OPCOES = [
  { value: 'comercial', label: 'Comercial' },
  { value: 'tecnica', label: 'Técnica' },
  { value: 'orcamento', label: 'Orçamento' },
  { value: 'aditivo', label: 'Aditivo' },
];

const GerarPropostaProdutos = ({ clienteId, onClose, onSuccess }) => {
  const navigate = useNavigate();
  const [produtos, setProdutos] = useState([]);
  const [produtosSelecionados, setProdutosSelecionados] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [projetos, setProjetos] = useState([]);
  const [oportunidades, setOportunidades] = useState([]);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    cliente_id: clienteId || '',
    projeto_id: '',
    oportunidade_id: '',
    tipo_proposta: '',
    expira_em: '',
    validade_dias: 15,
    condicoes_pagamento: '30% adiantamento + 70% a 14 dias da fatura',
    observacoes: ''
  });

  useEffect(() => {
    loadProdutos();
    loadClientes();
    loadProjetos();
    loadOportunidades();
  }, []);

  const loadProdutos = async () => {
    try {
      const response = await api.get('/produtos', { params: { ativo: 'true' } });
      setProdutos(Array.isArray(response.data) ? response.data : []);
    } catch (error) {
      console.error('Erro ao carregar produtos:', error);
    }
  };

  const loadClientes = async () => {
    try {
      const response = await api.get('/clientes', { params: { status: 'ativo' } });
      setClientes(response.data);
    } catch (error) {
      console.error('Erro ao carregar clientes:', error);
    }
  };

  const loadProjetos = async () => {
    try {
      const response = await api.get('/projetos');
      setProjetos(response.data);
    } catch (error) {
      console.error('Erro ao carregar projetos:', error);
    }
  };

  const loadOportunidades = async () => {
    try {
      const response = await api.get('/oportunidades', { params: { status: 'ativa' } });
      setOportunidades(Array.isArray(response.data) ? response.data : []);
    } catch (error) {
      console.error('Erro ao carregar oportunidades:', error);
    }
  };

  const toggleProduto = (produto) => {
    const index = produtosSelecionados.findIndex(p => p.id === produto.id);
    if (index >= 0) {
      setProdutosSelecionados(produtosSelecionados.filter((_, i) => i !== index));
    } else {
      setProdutosSelecionados([...produtosSelecionados, {
        ...produto,
        quantidade: 1
      }]);
    }
  };

  const updateQuantidade = (produtoId, quantidade) => {
    setProdutosSelecionados(produtosSelecionados.map(p => 
      p.id === produtoId ? { ...p, quantidade: Math.max(1, quantidade) } : p
    ));
  };

  const removeProduto = (produtoId) => {
    setProdutosSelecionados(produtosSelecionados.filter(p => p.id !== produtoId));
  };

  const calcularTotal = () => {
    return produtosSelecionados.reduce((total, p) => {
      return total + ((p.preco_base || 0) * (p.quantidade || 1));
    }, 0);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!formData.cliente_id) {
      toast.error('Selecione um cliente');
      return;
    }

    if (produtosSelecionados.length === 0) {
      toast.error('Selecione pelo menos um produto');
      return;
    }

    setLoading(true);
    try {
      const produtosParaEnvio = produtosSelecionados.map(p => ({
        id: p.id,
        codigo: p.codigo,
        nome: p.nome,
        descricao: p.descricao,
        preco_base: p.preco_base,
        unidade: p.unidade,
        familia_produto: p.familia_produto,
        quantidade: p.quantidade || 1
      }));

      const response = await api.post('/propostas/gerar-automatica', {
        cliente_id: formData.cliente_id,
        projeto_id: formData.projeto_id || null,
        oportunidade_id: formData.oportunidade_id || null,
        tipo_proposta: formData.tipo_proposta || null,
        expira_em: formData.expira_em || null,
        produtos: produtosParaEnvio,
        validade_dias: formData.validade_dias,
        condicoes_pagamento: formData.condicoes_pagamento,
        observacoes: formData.observacoes
      });

      toast.success('Proposta gerada com sucesso!');
      if (typeof onSuccess === 'function') {
        onSuccess(response.data);
        if (onClose) onClose();
      } else {
        navigate('/comercial/propostas');
        if (onClose) onClose();
      }
    } catch (error) {
      toast.error(error.response?.data?.error || 'Erro ao gerar proposta');
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value || 0);
  };

  return (
    <div className="gerar-proposta-modal">
      <div className="modal-overlay" onClick={onClose}></div>
      <div className="modal-content">
        <div className="modal-header">
          <h2>Gerar Proposta a partir de Produtos</h2>
          <button onClick={onClose} className="btn-close">
            <FiX />
          </button>
        </div>
        
        <div style={{ 
          padding: '15px 20px', 
          background: '#e8f5e9', 
          borderLeft: '4px solid #4caf50',
          marginBottom: '20px',
          borderRadius: '4px'
        }}>
          <strong style={{ color: '#2e7d32' }}>ℹ️ Proposta automática</strong>
          <p style={{ margin: '5px 0 0 0', color: '#666', fontSize: '14px' }}>
            Selecione o cliente e os produtos. A proposta será criada em rascunho com itens e totais calculados. Qualquer família de produtos pode ser usada.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="form-container">
          <div className="form-section">
            <h3>Informações da Proposta</h3>
            <div className="form-grid">
              <div className="form-group">
                <label>Cliente *</label>
                <select
                  value={formData.cliente_id}
                  onChange={(e) => setFormData({ ...formData, cliente_id: e.target.value })}
                  required
                >
                  <option value="">Selecione...</option>
                  {clientes.map(cliente => (
                    <option key={cliente.id} value={cliente.id}>
                      {cliente.razao_social}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label>Projeto (opcional)</label>
                <select
                  value={formData.projeto_id}
                  onChange={(e) => setFormData({ ...formData, projeto_id: e.target.value })}
                >
                  <option value="">Nenhum</option>
                  {projetos
                    .filter(p => p.cliente_id === parseInt(formData.cliente_id))
                    .map(projeto => (
                      <option key={projeto.id} value={projeto.id}>
                        {projeto.nome_projeto}
                      </option>
                    ))}
                </select>
              </div>

              <div className="form-group">
                <label>Oportunidade (opcional)</label>
                <select
                  value={formData.oportunidade_id}
                  onChange={(e) => setFormData({ ...formData, oportunidade_id: e.target.value })}
                >
                  <option value="">Nenhuma</option>
                  {oportunidades
                    .filter(o => !formData.cliente_id || o.cliente_id === parseInt(formData.cliente_id))
                    .map(o => (
                      <option key={o.id} value={o.id}>{o.titulo || `Oportunidade ${o.id}`}</option>
                    ))}
                </select>
              </div>

              <div className="form-group">
                <label>Tipo de proposta</label>
                <select
                  value={formData.tipo_proposta}
                  onChange={(e) => setFormData({ ...formData, tipo_proposta: e.target.value })}
                >
                  <option value="">— Selecione —</option>
                  {TIPO_PROPOSTA_OPCOES.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label>Validade (dias)</label>
                <input
                  type="number"
                  value={formData.validade_dias}
                  onChange={(e) => setFormData({ ...formData, validade_dias: parseInt(e.target.value) || 15 })}
                  min="1"
                />
              </div>

              <div className="form-group">
                <label>Expira em (opcional)</label>
                <input
                  type="date"
                  value={formData.expira_em}
                  onChange={(e) => setFormData({ ...formData, expira_em: e.target.value })}
                />
              </div>
            </div>

            <div className="form-group">
              <label>Condições de Pagamento</label>
              <input
                type="text"
                value={formData.condicoes_pagamento}
                onChange={(e) => setFormData({ ...formData, condicoes_pagamento: e.target.value })}
                placeholder="Ex: 30% adiantamento + 70% a 14 dias da fatura"
              />
            </div>

            <div className="form-group">
              <label>Observações</label>
              <textarea
                value={formData.observacoes}
                onChange={(e) => setFormData({ ...formData, observacoes: e.target.value })}
                rows="3"
                placeholder="Observações adicionais da proposta"
              />
            </div>
          </div>

          <div className="form-section">
            <h3>Selecionar Produtos</h3>
            {produtos.length === 0 ? (
              <div style={{ 
                padding: '40px', 
                textAlign: 'center', 
                background: '#f8f9fa', 
                borderRadius: '8px',
                color: '#666'
              }}>
                <p>Nenhum produto ativo encontrado.</p>
                <p style={{ fontSize: '14px', marginTop: '10px' }}>
                  Cadastre produtos no catálogo para gerar propostas automáticas.
                </p>
              </div>
            ) : (
              <div className="produtos-grid">
                {produtos.map(produto => {
                  const selecionado = produtosSelecionados.find(p => p.id === produto.id);
                  return (
                    <div
                      key={produto.id}
                      className={`produto-card ${selecionado ? 'selecionado' : ''}`}
                      onClick={() => toggleProduto(produto)}
                    >
                      <div className="produto-check">
                        {selecionado && <FiCheck />}
                      </div>
                      <div className="produto-info">
                        <strong>{produto.codigo}</strong>
                        <p>{produto.nome}</p>
                        <span className="preco">{formatCurrency(produto.preco_base)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {produtosSelecionados.length > 0 && (
            <div className="form-section">
              <h3>Produtos Selecionados</h3>
              <div className="produtos-selecionados">
                {produtosSelecionados.map(produto => (
                  <div key={produto.id} className="produto-selecionado-item">
                    <div className="produto-detalhes">
                      <strong>{produto.codigo} - {produto.nome}</strong>
                      <span>{formatCurrency(produto.preco_base)} / {produto.unidade}</span>
                    </div>
                    <div className="produto-quantidade">
                      <label>Qtd:</label>
                      <input
                        type="number"
                        value={produto.quantidade}
                        onChange={(e) => updateQuantidade(produto.id, parseInt(e.target.value) || 1)}
                        min="1"
                      />
                      <span className="subtotal">
                        {formatCurrency((produto.preco_base || 0) * (produto.quantidade || 1))}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeProduto(produto.id)}
                      className="btn-remove"
                    >
                      <FiTrash2 />
                    </button>
                  </div>
                ))}
                <div className="total-section">
                  <strong>Total: {formatCurrency(calcularTotal())}</strong>
                </div>
              </div>
            </div>
          )}

          <div className="form-actions">
            <button type="button" onClick={onClose} className="btn-secondary">
              Cancelar
            </button>
            <button type="submit" className="btn-primary" disabled={loading || produtosSelecionados.length === 0}>
              {loading ? 'Gerando...' : 'Gerar Proposta'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default GerarPropostaProdutos;




