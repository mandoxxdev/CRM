import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Edit, Trash2, Package, DollarSign, TrendingUp, TrendingDown } from 'lucide-react';
import { produtoService, vendaService } from '../utils/dbService';
import { formatCurrency, formatDateBR } from '../utils/format';
import type { Produto } from '../types';

export default function ProdutoDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [produto, setProduto] = useState<Produto | null>(null);
  const [historicoVendas, setHistoricoVendas] = useState<any[]>([]);

  useEffect(() => {
    if (id) {
      loadProduto();
      loadHistoricoVendas();
    }
  }, [id]);

  const loadProduto = async () => {
    if (!id) return;
    try {
      const produtoData = await produtoService.getById(id);
      setProduto(produtoData || null);
    } catch (error) {
      console.error('Erro ao carregar produto:', error);
    }
  };

  const loadHistoricoVendas = async () => {
    if (!id) return;
    try {
      const vendas = await vendaService.getAll();
      const vendasComProduto = vendas.filter(venda =>
        venda.itens.some(item => item.produtoId === id)
      );
      setHistoricoVendas(vendasComProduto.slice(0, 10));
    } catch (error) {
      console.error('Erro ao carregar histórico:', error);
    }
  };

  const handleDelete = async () => {
    if (confirm('Tem certeza que deseja excluir este produto?')) {
      if (id) {
        try {
          await produtoService.delete(id);
          navigate('/produtos');
        } catch (error) {
          console.error('Erro ao excluir produto:', error);
          alert('Erro ao excluir produto');
        }
      }
    }
  };

  if (!produto) {
    return (
      <div className="card text-center py-12">
        <p className="text-gray-500">Produto não encontrado.</p>
        <Link to="/produtos" className="btn-primary mt-4 inline-block">
          Voltar para Produtos
        </Link>
      </div>
    );
  }

  const margemLucro = produto.custo 
    ? ((produto.preco - produto.custo) / produto.preco) * 100 
    : 0;
  const valorTotalEstoque = produto.preco * produto.estoque;

  return (
    <div>
      <div className="mb-6">
        <Link
          to="/produtos"
          className="inline-flex items-center text-gray-600 hover:text-gray-900 mb-4"
        >
          <ArrowLeft size={20} className="mr-2" />
          Voltar
        </Link>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">{produto.nome}</h1>
            <p className="mt-1 text-lg text-gray-600">Código: {produto.codigo}</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleDelete}
              className="btn-danger flex items-center gap-2"
            >
              <Trash2 size={18} />
              <span className="hidden sm:inline">Excluir</span>
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* Informações Principais */}
          <div className="card">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Informações do Produto</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-gray-600">Preço de Venda</label>
                <p className="text-2xl font-bold text-gray-900 mt-1">{formatCurrency(produto.preco)}</p>
              </div>
              {produto.custo && (
                <div>
                  <label className="text-sm font-medium text-gray-600">Custo</label>
                  <p className="text-xl font-semibold text-gray-900 mt-1">{formatCurrency(produto.custo)}</p>
                </div>
              )}
              <div>
                <label className="text-sm font-medium text-gray-600">Estoque</label>
                <p className={`text-xl font-semibold mt-1 ${produto.estoque < 10 ? 'text-red-600' : 'text-gray-900'}`}>
                  {produto.estoque} {produto.unidade}
                </p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-600">Valor Total em Estoque</label>
                <p className="text-xl font-bold text-primary-600 mt-1">{formatCurrency(valorTotalEstoque)}</p>
              </div>
              {produto.custo && (
                <>
                  <div>
                    <label className="text-sm font-medium text-gray-600">Margem de Lucro</label>
                    <p className="text-xl font-semibold text-green-600 mt-1">{margemLucro.toFixed(2)}%</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-600">Lucro Unitário</label>
                    <p className="text-xl font-semibold text-green-600 mt-1">
                      {formatCurrency(produto.preco - produto.custo)}
                    </p>
                  </div>
                </>
              )}
            </div>
            {produto.descricao && (
              <div className="mt-4 pt-4 border-t border-gray-200">
                <label className="text-sm font-medium text-gray-600">Descrição</label>
                <p className="text-gray-900 mt-1 whitespace-pre-wrap">{produto.descricao}</p>
              </div>
            )}
          </div>

          {/* Histórico de Vendas */}
          <div className="card">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Últimas Vendas</h2>
            {historicoVendas.length > 0 ? (
              <div className="space-y-3">
                {historicoVendas.map((venda) => {
                  const item = venda.itens.find((i: any) => i.produtoId === produto.id);
                  return (
                    <Link
                      key={venda.id}
                      to={`/vendas/${venda.id}`}
                      className="block p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium text-gray-900">{venda.numero}</p>
                          <p className="text-sm text-gray-600">
                            {item.quantidade} {produto.unidade} - {formatDateBR(venda.dataVenda)}
                          </p>
                        </div>
                        <p className="font-semibold text-gray-900">{formatCurrency(item.total)}</p>
                      </div>
                    </Link>
                  );
                })}
              </div>
            ) : (
              <p className="text-gray-500 text-sm">Nenhuma venda registrada ainda.</p>
            )}
          </div>
        </div>

        <div className="space-y-6">
          {/* Status */}
          <div className="card">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Status</h2>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Categoria:</span>
                <span className="font-medium text-gray-900">
                  {produto.categoria || 'Sem categoria'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Unidade:</span>
                <span className="font-medium text-gray-900">{produto.unidade}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Status:</span>
                <span className={`px-2 py-1 text-xs font-medium rounded ${
                  produto.ativo 
                    ? 'bg-green-100 text-green-700' 
                    : 'bg-gray-100 text-gray-700'
                }`}>
                  {produto.ativo ? 'Ativo' : 'Inativo'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Estoque:</span>
                <span className={`font-medium ${
                  produto.estoque === 0 
                    ? 'text-red-600' 
                    : produto.estoque < 10 
                    ? 'text-yellow-600' 
                    : 'text-green-600'
                }`}>
                  {produto.estoque < 10 ? 'Estoque Baixo' : produto.estoque === 0 ? 'Sem Estoque' : 'Normal'}
                </span>
              </div>
            </div>
          </div>

          {/* Informações do Sistema */}
          <div className="card">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Informações</h2>
            <div className="space-y-2 text-sm">
              <div>
                <span className="text-gray-600">Criado em:</span>
                <p className="text-gray-900">{formatDateBR(produto.dataCriacao)}</p>
              </div>
              <div>
                <span className="text-gray-600">Última atualização:</span>
                <p className="text-gray-900">{formatDateBR(produto.dataAtualizacao)}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

