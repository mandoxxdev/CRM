import React, { useState, useEffect } from 'react';
import api from '../services/api';
import { FiX, FiSave, FiDownload, FiEdit2 } from 'react-icons/fi';
import './PreviewPropostaEditavel.css';

const PreviewPropostaEditavel = ({ proposta, formData, itens, onClose, onSave }) => {
  const [dadosEditaveis, setDadosEditaveis] = useState({
    titulo: formData.titulo || '',
    descricao: formData.descricao || '',
    condicoes_pagamento: formData.condicoes_pagamento || '',
    prazo_entrega: formData.prazo_entrega || 'Dentro de 15 (quinze) dias úteis, a contar da data de confirmação do pedido via e compensação do pagamento (quando aplicável).',
    garantia: formData.garantia || '',
    observacoes: formData.observacoes || '',
    cliente_contato: formData.cliente_contato || '',
    cliente_telefone: formData.cliente_telefone || '',
    cliente_email: formData.cliente_email || ''
  });
  
  const [itensEditaveis, setItensEditaveis] = useState(itens.map(item => ({ ...item })));
  const [cliente, setCliente] = useState(null);
  const [produtosCompletos, setProdutosCompletos] = useState([]);
  const [loading, setLoading] = useState(false);
  const [previewHTML, setPreviewHTML] = useState('');
  const [carregandoPreview, setCarregandoPreview] = useState(false);
  const [mostrarPreview, setMostrarPreview] = useState(true);

  useEffect(() => {
    loadDadosCompletos();
  }, []);

  useEffect(() => {
    if (proposta && proposta.id && mostrarPreview) {
      const timeoutId = setTimeout(() => {
        atualizarPreview();
      }, 500); // Debounce de 500ms
      return () => clearTimeout(timeoutId);
    }
  }, [dadosEditaveis, itensEditaveis, mostrarPreview]);

  useEffect(() => {
    // Escutar mensagens do iframe
    const handleMessage = (event) => {
      if (event.data.type === 'textoEditado') {
        handleChange(event.data.campo, event.data.valor);
      }
    };
    
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const loadDadosCompletos = async () => {
    try {
      // Carregar cliente
      if (formData.cliente_id) {
        const clienteRes = await api.get(`/clientes/${formData.cliente_id}`);
        setCliente(clienteRes.data);
        // Preencher telefone e email do cliente se não estiverem nos dados editáveis
        if (!dadosEditaveis.cliente_telefone && clienteRes.data.telefone) {
          setDadosEditaveis(prev => ({ ...prev, cliente_telefone: clienteRes.data.telefone }));
        }
        if (!dadosEditaveis.cliente_email && clienteRes.data.email) {
          setDadosEditaveis(prev => ({ ...prev, cliente_email: clienteRes.data.email }));
        }
      }
      
      // Carregar produtos completos dos itens
      const codigosProdutos = itens
        .filter(item => item.codigo_produto)
        .map(item => item.codigo_produto);
      
      if (codigosProdutos.length > 0) {
        const produtosRes = await api.get('/produtos', { 
          params: { ativo: 'true' } 
        });
        const produtosFiltrados = produtosRes.data.filter(p => 
          codigosProdutos.includes(p.codigo)
        );
        setProdutosCompletos(produtosFiltrados);
      }
    } catch (error) {
      console.error('Erro ao carregar dados:', error);
    }
  };

  const handleChange = (field, value) => {
    setDadosEditaveis(prev => ({ ...prev, [field]: value }));
  };

  const handleItemChange = (index, field, value) => {
    setItensEditaveis(prev => {
      const novosItens = [...prev];
      novosItens[index] = { ...novosItens[index], [field]: value };
      
      // Recalcular valor total se quantidade ou valor unitário mudar
      if (field === 'quantidade' || field === 'valor_unitario') {
        const quantidade = field === 'quantidade' ? parseFloat(value) || 0 : novosItens[index].quantidade || 0;
        const valorUnitario = field === 'valor_unitario' ? parseFloat(value) || 0 : novosItens[index].valor_unitario || 0;
        novosItens[index].valor_total = quantidade * valorUnitario;
      }
      
      return novosItens;
    });
  };

  const calcularTotal = () => {
    return itensEditaveis.reduce((sum, item) => sum + (parseFloat(item.valor_total) || 0), 0);
  };

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value || 0);
  };

  const handleSalvar = async () => {
    setLoading(true);
    try {
      // Atualizar proposta com dados editados
      await api.put(`/propostas/${proposta.id}`, {
        ...formData,
        ...dadosEditaveis,
        itens: itensEditaveis,
        valor_total: calcularTotal()
      });
      
      alert('Proposta salva com sucesso!');
      onClose();
    } catch (error) {
      alert('Erro ao salvar alterações: ' + (error.response?.data?.error || error.message));
    } finally {
      setLoading(false);
    }
  };

  const handleGerarPDF = async () => {
    setLoading(true);
    try {
      // Atualizar proposta com dados editados antes de gerar PDF
      await api.put(`/propostas/${proposta.id}`, {
        ...formData,
        ...dadosEditaveis,
        itens: itensEditaveis,
        valor_total: calcularTotal()
      });
      
      // Gerar PDF usando Puppeteer no backend
      const token = localStorage.getItem('token');
      const baseURL = api.defaults.baseURL || '/api';
      let urlPDF;
      
      if (baseURL.startsWith('http')) {
        urlPDF = `${baseURL}/propostas/${proposta.id}/pdf?token=${encodeURIComponent(token || '')}`;
      } else {
        urlPDF = `${baseURL}/propostas/${proposta.id}/pdf?token=${encodeURIComponent(token || '')}`;
      }
      
      // Fazer download do PDF
      const response = await fetch(urlPDF, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Erro ao gerar PDF' }));
        throw new Error(errorData.error || 'Erro ao gerar PDF');
      }
      
      // Criar blob e fazer download
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `proposta-${proposta.numero_proposta || proposta.id}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      
      alert('PDF gerado e baixado com sucesso!');
    } catch (error) {
      console.error('Erro ao gerar PDF:', error);
      alert('Erro ao gerar PDF: ' + (error.message || 'Erro desconhecido'));
    } finally {
      setLoading(false);
    }
  };

  const getProdutoCompleto = (codigo) => {
    return produtosCompletos.find(p => p.codigo === codigo);
  };

  const atualizarPreview = async () => {
    setCarregandoPreview(true);
    try {
      // Primeiro, atualizar a proposta no backend com os dados editados
      await api.put(`/propostas/${proposta.id}`, {
        ...formData,
        ...dadosEditaveis,
        itens: itensEditaveis,
        valor_total: calcularTotal()
      });
      
      // Depois, buscar o HTML atualizado
      const response = await api.get(`/propostas/${proposta.id}/premium`, {
        responseType: 'text'
      });
      
      // Substituir os textos editáveis no HTML com contenteditable
      let htmlEditavel = response.data;
      
      // Adicionar script para tornar TODOS os textos editáveis e comunicar mudanças
      const scriptEditavel = `
        <script>
          document.addEventListener('DOMContentLoaded', function() {
            // Tornar TODOS os elementos de texto editáveis
            function tornarEditavel(elemento) {
              if (elemento.tagName === 'SCRIPT' || elemento.tagName === 'STYLE' || elemento.tagName === 'IFRAME') {
                return;
              }
              
              // Se já tem contenteditable, manter
              if (elemento.hasAttribute('contenteditable')) {
                return;
              }
              
              // Tornar editável elementos de texto comuns
              const tagsEditaveis = ['P', 'DIV', 'SPAN', 'LI', 'TD', 'TH', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'STRONG', 'EM', 'B', 'I'];
              if (tagsEditaveis.includes(elemento.tagName)) {
                // Verificar se não é um elemento estrutural (títulos de seção, etc)
                const classes = elemento.className || '';
                if (!classes.includes('section-title') && !elemento.closest('.section-title')) {
                  elemento.setAttribute('contenteditable', 'true');
                  elemento.setAttribute('data-editavel', 'true');
                  elemento.style.border = '1px dashed transparent';
                  elemento.style.padding = '2px 4px';
                  elemento.style.borderRadius = '3px';
                  elemento.style.minHeight = '20px';
                  elemento.style.cursor = 'text';
                  
                  // Adicionar eventos
                  elemento.addEventListener('mouseenter', function() {
                    if (!this.matches(':focus')) {
                      this.style.borderColor = '#0066CC';
                      this.style.backgroundColor = '#f0f7ff';
                    }
                  });
                  elemento.addEventListener('mouseleave', function() {
                    if (!this.matches(':focus')) {
                      this.style.borderColor = 'transparent';
                      this.style.backgroundColor = 'transparent';
                    }
                  });
                  elemento.addEventListener('focus', function() {
                    this.style.borderColor = '#0066CC';
                    this.style.backgroundColor = '#f0f7ff';
                    this.style.outline = 'none';
                  });
                  elemento.addEventListener('blur', function() {
                    this.style.borderColor = 'transparent';
                    this.style.backgroundColor = 'transparent';
                    // Notificar mudanças para o parent
                    if (window.parent) {
                      window.parent.postMessage({
                        type: 'textoEditado',
                        campo: this.dataset.campo || this.tagName + '_' + (this.className || '').replace(/\\s+/g, '_'),
                        valor: this.textContent || this.innerText || ''
                      }, '*');
                    }
                  });
                  elemento.addEventListener('input', function() {
                    // Atualizar em tempo real enquanto digita
                    if (window.parent) {
                      window.parent.postMessage({
                        type: 'textoEditado',
                        campo: this.dataset.campo || this.tagName + '_' + (this.className || '').replace(/\\s+/g, '_'),
                        valor: this.textContent || this.innerText || ''
                      }, '*');
                    }
                  });
                }
              }
              
              // Processar filhos recursivamente
              Array.from(elemento.children).forEach(filho => {
                tornarEditavel(filho);
              });
            }
            
            // Tornar editáveis elementos já marcados
            const textosEditaveis = document.querySelectorAll('[contenteditable="true"]');
            textosEditaveis.forEach(el => {
              el.style.border = '1px dashed transparent';
              el.style.padding = '2px 4px';
              el.style.borderRadius = '3px';
              el.style.minHeight = '20px';
              el.style.cursor = 'text';
              
              el.addEventListener('mouseenter', function() {
                if (!this.matches(':focus')) {
                  this.style.borderColor = '#0066CC';
                  this.style.backgroundColor = '#f0f7ff';
                }
              });
              el.addEventListener('mouseleave', function() {
                if (!this.matches(':focus')) {
                  this.style.borderColor = 'transparent';
                  this.style.backgroundColor = 'transparent';
                }
              });
              el.addEventListener('focus', function() {
                this.style.borderColor = '#0066CC';
                this.style.backgroundColor = '#f0f7ff';
                this.style.outline = 'none';
              });
              el.addEventListener('blur', function() {
                this.style.borderColor = 'transparent';
                this.style.backgroundColor = 'transparent';
                if (window.parent && this.dataset.campo) {
                  window.parent.postMessage({
                    type: 'textoEditado',
                    campo: this.dataset.campo,
                    valor: this.textContent || this.innerText || ''
                  }, '*');
                }
              });
              el.addEventListener('input', function() {
                if (window.parent && this.dataset.campo) {
                  window.parent.postMessage({
                    type: 'textoEditado',
                    campo: this.dataset.campo,
                    valor: this.textContent || this.innerText || ''
                  }, '*');
                }
              });
            });
            
            // Tornar editável todo o body (exceto scripts e estilos)
            tornarEditavel(document.body);
          });
        </script>
      `;
      
      // Inserir o script antes do </body>
      htmlEditavel = htmlEditavel.replace('</body>', scriptEditavel + '</body>');
      
      setPreviewHTML(htmlEditavel);
    } catch (error) {
      console.error('Erro ao atualizar preview:', error);
    } finally {
      setCarregandoPreview(false);
    }
  };

  return (
    <div className="preview-proposta-overlay">
      <div className="preview-proposta-container">
        <div className="preview-proposta-header">
          <h2>
            <FiEdit2 style={{ marginRight: '10px' }} />
            Preview Editável - Proposta Premium
          </h2>
          <button onClick={onClose} className="btn-close">
            <FiX />
          </button>
        </div>

        <div className="preview-proposta-content">
          <div className="preview-section">
            <h3>Informações Gerais</h3>
            <div className="preview-form-grid">
              <div className="preview-form-group">
                <label>Título</label>
                <input
                  type="text"
                  value={dadosEditaveis.titulo}
                  onChange={(e) => handleChange('titulo', e.target.value)}
                  placeholder="Título da proposta"
                />
              </div>
              <div className="preview-form-group full-width">
                <label>Descrição</label>
                <textarea
                  value={dadosEditaveis.descricao}
                  onChange={(e) => handleChange('descricao', e.target.value)}
                  rows="3"
                  placeholder="Descrição da proposta"
                />
              </div>
            </div>
          </div>

          <div className="preview-section">
            <h3>Itens da Proposta</h3>
            <div className="preview-itens-table">
              <table>
                <thead>
                  <tr>
                    <th>Produto</th>
                    <th>Quantidade</th>
                    <th>Valor Unitário</th>
                    <th>Valor Total</th>
                  </tr>
                </thead>
                <tbody>
                  {itensEditaveis.map((item, index) => {
                    const produtoCompleto = getProdutoCompleto(item.codigo_produto);
                    return (
                      <tr key={index}>
                        <td>
                          <div>
                            <strong>{item.descricao}</strong>
                            {item.codigo_produto && (
                              <span style={{ fontSize: '12px', color: '#666', display: 'block' }}>
                                Código: {item.codigo_produto}
                              </span>
                            )}
                            {produtoCompleto?.imagem && (
                              <img 
                                src={`${api.defaults.baseURL}/uploads/produtos/${produtoCompleto.imagem}`}
                                alt={item.descricao}
                                style={{ 
                                  width: '60px', 
                                  height: '60px', 
                                  objectFit: 'cover',
                                  borderRadius: '4px',
                                  marginTop: '5px'
                                }}
                                onError={(e) => e.target.style.display = 'none'}
                              />
                            )}
                          </div>
                        </td>
                        <td>
                          <input
                            type="number"
                            value={item.quantidade || 1}
                            onChange={(e) => handleItemChange(index, 'quantidade', e.target.value)}
                            min="1"
                            style={{ width: '80px' }}
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            step="0.01"
                            value={item.valor_unitario || 0}
                            onChange={(e) => handleItemChange(index, 'valor_unitario', e.target.value)}
                            min="0"
                            style={{ width: '120px' }}
                          />
                        </td>
                        <td>
                          <strong>{formatCurrency(item.valor_total || 0)}</strong>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan="3" style={{ textAlign: 'right' }}>
                      <strong>Total:</strong>
                    </td>
                    <td>
                      <strong style={{ fontSize: '18px', color: '#FF6B35' }}>
                        {formatCurrency(calcularTotal())}
                      </strong>
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          <div className="preview-section">
            <h3>Condições Comerciais</h3>
            <div className="preview-form-grid">
              <div className="preview-form-group">
                <label>Condições de Pagamento</label>
                <input
                  type="text"
                  value={dadosEditaveis.condicoes_pagamento}
                  onChange={(e) => handleChange('condicoes_pagamento', e.target.value)}
                  placeholder="Ex: 30% adiantamento + 70% a 14 dias"
                />
              </div>
              <div className="preview-form-group">
                <label>Prazo de Entrega</label>
                <textarea
                  value={dadosEditaveis.prazo_entrega}
                  onChange={(e) => handleChange('prazo_entrega', e.target.value)}
                  placeholder="Dentro de 15 (quinze) dias úteis, a contar da data de confirmação do pedido via e compensação do pagamento (quando aplicável)."
                  rows="3"
                />
              </div>
              <div className="preview-form-group">
                <label>Garantia</label>
                <input
                  type="text"
                  value={dadosEditaveis.garantia}
                  onChange={(e) => handleChange('garantia', e.target.value)}
                  placeholder="Ex: 12 meses"
                />
              </div>
              <div className="preview-form-group full-width">
                <label>Observações</label>
                <textarea
                  value={dadosEditaveis.observacoes}
                  onChange={(e) => handleChange('observacoes', e.target.value)}
                  rows="4"
                  placeholder="Observações adicionais"
                />
              </div>
            </div>
          </div>

          <div className="preview-section">
            <h3>Dados do Cliente</h3>
            {cliente && (
              <div className="preview-cliente-info">
                <p><strong>Razão Social:</strong> {cliente.razao_social}</p>
                {cliente.nome_fantasia && (
                  <p><strong>Nome Fantasia:</strong> {cliente.nome_fantasia}</p>
                )}
                {cliente.cnpj && (
                  <p><strong>CNPJ:</strong> {cliente.cnpj}</p>
                )}
                {cliente.endereco && (
                  <p><strong>Endereço:</strong> {cliente.endereco}, {cliente.cidade} - {cliente.estado} {cliente.cep}</p>
                )}
              </div>
            )}
            <div className="preview-form-grid" style={{ marginTop: '15px' }}>
              <div className="preview-form-group">
                <label>Contato:</label>
                <input
                  type="text"
                  value={dadosEditaveis.cliente_contato}
                  onChange={(e) => handleChange('cliente_contato', e.target.value)}
                  placeholder="Nome do contato"
                />
              </div>
              <div className="preview-form-group">
                <label>Telefone:</label>
                <input
                  type="text"
                  value={dadosEditaveis.cliente_telefone || (cliente?.telefone || '')}
                  onChange={(e) => handleChange('cliente_telefone', e.target.value)}
                  placeholder="Telefone do cliente"
                />
              </div>
              <div className="preview-form-group">
                <label>E-mail:</label>
                <input
                  type="email"
                  value={dadosEditaveis.cliente_email || (cliente?.email || '')}
                  onChange={(e) => handleChange('cliente_email', e.target.value)}
                  placeholder="E-mail do cliente"
                />
              </div>
            </div>
          </div>

          <div className="preview-section">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
              <h3>Preview da Proposta (Editável em Tempo Real)</h3>
              <button 
                onClick={() => setMostrarPreview(!mostrarPreview)}
                className="btn-secondary"
                style={{ padding: '8px 16px' }}
              >
                {mostrarPreview ? 'Ocultar Preview' : 'Mostrar Preview'}
              </button>
            </div>
            {mostrarPreview && (
              <div style={{ 
                border: '1px solid var(--gmp-border)', 
                borderRadius: '8px', 
                overflow: 'auto',
                minHeight: '600px',
                maxHeight: 'calc(100vh - 300px)',
                position: 'relative',
                background: 'white',
                backgroundImage: 'linear-gradient(rgba(0, 0, 0, 0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(0, 0, 0, 0.03) 1px, transparent 1px)',
                backgroundSize: '20px 20px',
                backgroundPosition: '0 0, 0 0'
              }}>
                {carregandoPreview ? (
                  <div style={{ 
                    display: 'flex', 
                    justifyContent: 'center', 
                    alignItems: 'center', 
                    minHeight: '600px',
                    color: 'var(--gmp-text-secondary)'
                  }}>
                    Carregando preview...
                  </div>
                ) : previewHTML ? (
                  <iframe
                    srcDoc={previewHTML}
                    style={{
                      width: '100%',
                      minHeight: '800px',
                      border: 'none',
                      background: 'white',
                      display: 'block'
                    }}
                    title="Preview da Proposta"
                    scrolling="yes"
                  />
                ) : (
                  <div style={{ 
                    display: 'flex', 
                    flexDirection: 'column',
                    justifyContent: 'center', 
                    alignItems: 'center', 
                    height: '100%',
                    color: 'var(--gmp-text-secondary)',
                    gap: '10px'
                  }}>
                    <p>Clique em "Atualizar Preview" para ver a proposta</p>
                    <button onClick={atualizarPreview} className="btn-primary">
                      <FiDownload /> Atualizar Preview
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="preview-proposta-footer">
          <button onClick={onClose} className="btn-secondary">
            Cancelar
          </button>
          <button 
            onClick={atualizarPreview}
            className="btn-secondary"
            disabled={carregandoPreview}
          >
            <FiDownload /> {carregandoPreview ? 'Atualizando...' : 'Atualizar Preview'}
          </button>
          <button 
            onClick={handleSalvar} 
            className="btn-secondary"
            disabled={loading}
          >
            <FiSave /> {loading ? 'Salvando...' : 'Salvar'}
          </button>
          <button 
            onClick={handleGerarPDF} 
            className="btn-primary"
            disabled={loading}
          >
            <FiDownload /> {loading ? 'Gerando...' : 'Gerar PDF'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default PreviewPropostaEditavel;
