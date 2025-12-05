import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Minus, Trash2, Search, ShoppingCart, X } from 'lucide-react';
import { clienteService, produtoService, vendaService } from '../utils/dbService';
import { formatCurrency } from '../utils/format';
import type { ItemVenda, Venda } from '../types';

export default function NovaVenda() {
  const navigate = useNavigate();
  const [clientes, setClientes] = useState<any[]>([]);
  const [produtos, setProdutos] = useState<any[]>([]);
  const [clienteId, setClienteId] = useState('');
  const [itens, setItens] = useState<ItemVenda[]>([]);
  const [descontoGeral, setDescontoGeral] = useState('');
  const [formaPagamento, setFormaPagamento] = useState<Venda['formaPagamento']>('dinheiro');
  const [observacoes, setObservacoes] = useState('');
  const [showProdutoModal, setShowProdutoModal] = useState(false);
  const [produtoSearch, setProdutoSearch] = useState('');

  useEffect(() => {
    loadClientes();
    loadProdutos();
  }, []);

  const loadClientes = async () => {
    try {
      const allClientes = await clienteService.getAll();
      setClientes(allClientes);
    } catch (error) {
      console.error('Erro ao carregar clientes:', error);
    }
  };

  const loadProdutos = async () => {
    try {
      const allProdutos = await produtoService.getAtivos();
      setProdutos(allProdutos);
    } catch (error) {
      console.error('Erro ao carregar produtos:', error);
    }
  };

  const produtosFiltrados = produtos.filter(p =>
    p.nome.toLowerCase().includes(produtoSearch.toLowerCase()) ||
    p.codigo.toLowerCase().includes(produtoSearch.toLowerCase())
  );

  const adicionarProduto = (produto: any) => {
    const itemExistente = itens.find(i => i.produtoId === produto.id);
    
    if (itemExistente) {
      // Se já existe, aumenta a quantidade
      atualizarQuantidade(itemExistente.produtoId, itemExistente.quantidade + 1);
    } else {
      // Adiciona novo item
      const novoItem: ItemVenda = {
        produtoId: produto.id,
        produtoNome: produto.nome,
        quantidade: 1,
        precoUnitario: produto.preco,
        desconto: 0,
        total: produto.preco,
      };
      setItens([...itens, novoItem]);
    }
    setShowProdutoModal(false);
    setProdutoSearch('');
  };

  const atualizarQuantidade = (produtoId: string, quantidade: number) => {
    if (quantidade <= 0) {
      removerItem(produtoId);
      return;
    }
    
    const produto = produtos.find(p => p.id === produtoId);
    if (!produto) return;

    if (quantidade > produto.estoque) {
      alert(`Estoque insuficiente. Disponível: ${produto.estoque}`);
      return;
    }

    setItens(itens.map(item => {
      if (item.produtoId === produtoId) {
        const novoTotal = (item.precoUnitario * quantidade) - (item.desconto || 0);
        return { ...item, quantidade, total: Math.max(0, novoTotal) };
      }
      return item;
    }));
  };

  const atualizarDesconto = (produtoId: string, desconto: number) => {
    setItens(itens.map(item => {
      if (item.produtoId === produtoId) {
        const novoTotal = (item.precoUnitario * item.quantidade) - desconto;
        return { ...item, desconto, total: Math.max(0, novoTotal) };
      }
      return item;
    }));
  };

  const removerItem = (produtoId: string) => {
    setItens(itens.filter(item => item.produtoId !== produtoId));
  };

  const subtotal = itens.reduce((sum, item) => sum + (item.precoUnitario * item.quantidade), 0);
  const descontoItens = itens.reduce((sum, item) => sum + (item.desconto || 0), 0);
  const descontoGeralValue = parseFloat(descontoGeral) || 0;
  const total = subtotal - descontoItens - descontoGeralValue;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!clienteId) {
      alert('Selecione um cliente');
      return;
    }

    if (itens.length === 0) {
      alert('Adicione pelo menos um produto');
      return;
    }

    // Verificar estoque
    for (const item of itens) {
      const produto = produtos.find(p => p.id === item.produtoId);
      if (produto && item.quantidade > produto.estoque) {
        alert(`Estoque insuficiente para ${produto.nome}. Disponível: ${produto.estoque}`);
        return;
      }
    }

    try {
      await vendaService.create({
        clienteId,
        itens,
        subtotal,
        desconto: descontoGeralValue > 0 ? descontoGeralValue : undefined,
        total: Math.max(0, total),
        formaPagamento,
        status: 'pendente',
        dataVenda: new Date().toISOString(),
        observacoes: observacoes || undefined,
      });

      navigate('/vendas');
    } catch (error) {
      console.error('Erro ao criar venda:', error);
      alert('Erro ao criar venda');
    }
  };

  const clienteSelecionado = clientes.find(c => c.id === clienteId);

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Nova Venda</h1>
        <p className="mt-2 text-gray-600">Registre uma nova venda</p>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            {/* Seleção de Cliente */}
            <div className="card">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Cliente</h2>
              <select
                required
                value={clienteId}
                onChange={(e) => setClienteId(e.target.value)}
                className="input"
              >
                <option value="">Selecione um cliente</option>
                {clientes.map((cliente) => (
                  <option key={cliente.id} value={cliente.id}>
                    {cliente.nome} {cliente.empresa ? `- ${cliente.empresa}` : ''}
                  </option>
                ))}
              </select>
              {clienteSelecionado && (
                <div className="mt-4 p-4 bg-gray-50 rounded-lg">
                  <p className="font-medium text-gray-900">{clienteSelecionado.nome}</p>
                  {clienteSelecionado.empresa && (
                    <p className="text-sm text-gray-600">{clienteSelecionado.empresa}</p>
                  )}
                  <p className="text-sm text-gray-600 mt-1">{clienteSelecionado.email}</p>
                  <p className="text-sm text-gray-600">{clienteSelecionado.telefone}</p>
                </div>
              )}
            </div>

            {/* Itens da Venda */}
            <div className="card">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold text-gray-900">Itens da Venda</h2>
                <button
                  type="button"
                  onClick={() => setShowProdutoModal(true)}
                  className="btn-primary flex items-center gap-2"
                >
                  <Plus size={18} />
                  Adicionar Produto
                </button>
              </div>

              {itens.length === 0 ? (
                <div className="text-center py-12 border-2 border-dashed border-gray-300 rounded-lg">
                  <ShoppingCart className="mx-auto text-gray-400 mb-4" size={48} />
                  <p className="text-gray-500">Nenhum produto adicionado</p>
                  <button
                    type="button"
                    onClick={() => setShowProdutoModal(true)}
                    className="btn-primary mt-4"
                  >
                    Adicionar Primeiro Produto
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  {itens.map((item) => {
                    const produto = produtos.find(p => p.id === item.produtoId);
                    return (
                      <div key={item.produtoId} className="p-4 bg-gray-50 rounded-lg">
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex-1">
                            <h3 className="font-semibold text-gray-900">{item.produtoNome}</h3>
                            <p className="text-sm text-gray-600">
                              Estoque: {produto?.estoque || 0} {produto?.unidade || ''}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => removerItem(item.produtoId)}
                            className="p-2 text-red-600 hover:bg-red-50 rounded"
                          >
                            <Trash2 size={18} />
                          </button>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                          <div>
                            <label className="block text-xs text-gray-600 mb-1">Quantidade</label>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => atualizarQuantidade(item.produtoId, item.quantidade - 1)}
                                className="p-1 bg-gray-200 rounded hover:bg-gray-300"
                              >
                                <Minus size={16} />
                              </button>
                              <input
                                type="number"
                                min="1"
                                max={produto?.estoque || 0}
                                value={item.quantidade}
                                onChange={(e) => atualizarQuantidade(item.produtoId, parseInt(e.target.value) || 0)}
                                className="w-20 px-2 py-1 border border-gray-300 rounded text-center"
                              />
                              <button
                                type="button"
                                onClick={() => atualizarQuantidade(item.produtoId, item.quantidade + 1)}
                                className="p-1 bg-gray-200 rounded hover:bg-gray-300"
                              >
                                <Plus size={16} />
                              </button>
                            </div>
                          </div>
                          <div>
                            <label className="block text-xs text-gray-600 mb-1">Preço Unit.</label>
                            <p className="font-medium text-gray-900">{formatCurrency(item.precoUnitario)}</p>
                          </div>
                          <div>
                            <label className="block text-xs text-gray-600 mb-1">Desconto</label>
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              max={item.precoUnitario * item.quantidade}
                              value={item.desconto || 0}
                              onChange={(e) => atualizarDesconto(item.produtoId, parseFloat(e.target.value) || 0)}
                              className="w-full px-2 py-1 border border-gray-300 rounded"
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-gray-600 mb-1">Total</label>
                            <p className="font-bold text-gray-900">{formatCurrency(item.total)}</p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <div className="space-y-6">
            {/* Resumo */}
            <div className="card sticky top-4">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Resumo</h2>
              <div className="space-y-3 mb-4">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Subtotal:</span>
                  <span className="text-gray-900">{formatCurrency(subtotal)}</span>
                </div>
                {descontoItens > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Desconto nos Itens:</span>
                    <span className="text-red-600">-{formatCurrency(descontoItens)}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Desconto Geral:</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max={subtotal - descontoItens}
                    value={descontoGeral}
                    onChange={(e) => setDescontoGeral(e.target.value)}
                    className="w-24 px-2 py-1 border border-gray-300 rounded text-right"
                    placeholder="0.00"
                  />
                </div>
                <div className="flex justify-between text-lg font-bold border-t border-gray-200 pt-3">
                  <span className="text-gray-900">Total:</span>
                  <span className="text-primary-600">{formatCurrency(Math.max(0, total))}</span>
                </div>
              </div>

              <div className="space-y-4 mt-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Forma de Pagamento *
                  </label>
                  <select
                    required
                    value={formaPagamento}
                    onChange={(e) => setFormaPagamento(e.target.value as Venda['formaPagamento'])}
                    className="input"
                  >
                    <option value="dinheiro">Dinheiro</option>
                    <option value="cartao">Cartão</option>
                    <option value="pix">PIX</option>
                    <option value="boleto">Boleto</option>
                    <option value="transferencia">Transferência</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Observações
                  </label>
                  <textarea
                    value={observacoes}
                    onChange={(e) => setObservacoes(e.target.value)}
                    className="input"
                    rows={3}
                  />
                </div>
                <button
                  type="submit"
                  className="btn-primary w-full"
                  disabled={itens.length === 0 || !clienteId}
                >
                  Finalizar Venda
                </button>
              </div>
            </div>
          </div>
        </div>
      </form>

      {/* Modal de Seleção de Produtos */}
      {showProdutoModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
            <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" onClick={() => setShowProdutoModal(false)} />
            <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-2xl sm:w-full">
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-2xl font-bold text-gray-900">Selecionar Produto</h2>
                  <button
                    onClick={() => {
                      setShowProdutoModal(false);
                      setProdutoSearch('');
                    }}
                    className="p-2 text-gray-400 hover:text-gray-600"
                  >
                    <X size={24} />
                  </button>
                </div>
                <div className="relative mb-4">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-5 w-5" />
                  <input
                    type="text"
                    placeholder="Buscar produto..."
                    value={produtoSearch}
                    onChange={(e) => setProdutoSearch(e.target.value)}
                    className="input pl-10"
                    autoFocus
                  />
                </div>
                <div className="max-h-96 overflow-y-auto space-y-2">
                  {produtosFiltrados.map((produto) => (
                    <button
                      key={produto.id}
                      type="button"
                      onClick={() => adicionarProduto(produto)}
                      disabled={produto.estoque === 0}
                      className={`w-full text-left p-4 rounded-lg border transition-colors ${
                        produto.estoque === 0
                          ? 'bg-gray-100 border-gray-200 opacity-50 cursor-not-allowed'
                          : 'bg-white border-gray-200 hover:bg-gray-50 hover:border-primary-300'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <p className="font-semibold text-gray-900">{produto.nome}</p>
                          <p className="text-sm text-gray-600">Código: {produto.codigo}</p>
                          <p className="text-sm text-gray-600">
                            Estoque: {produto.estoque} {produto.unidade}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-primary-600">{formatCurrency(produto.preco)}</p>
                          {produto.estoque === 0 && (
                            <p className="text-xs text-red-600 mt-1">Sem estoque</p>
                          )}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
                {produtosFiltrados.length === 0 && (
                  <p className="text-center text-gray-500 py-8">Nenhum produto encontrado</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

