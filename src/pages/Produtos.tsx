import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Plus, Search, Edit, Trash2, Package, DollarSign, TrendingDown, TrendingUp } from 'lucide-react';
import { produtoService } from '../utils/dbService';
import { formatCurrency } from '../utils/format';
import { generateId } from '../utils/helpers';
import type { Produto } from '../types';

export default function Produtos() {
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategoria, setFilterCategoria] = useState<string>('todas');
  const [filterAtivo, setFilterAtivo] = useState<string>('todos');
  const [showModal, setShowModal] = useState(false);
  const [editingProduto, setEditingProduto] = useState<Produto | null>(null);
  const [formData, setFormData] = useState({
    codigo: '',
    nome: '',
    descricao: '',
    categoria: '',
    preco: '',
    custo: '',
    estoque: '',
    unidade: 'UN',
    ativo: true,
  });

  useEffect(() => {
    loadProdutos();
  }, []);

  const loadProdutos = async () => {
    try {
      const allProdutos = await produtoService.getAll();
      setProdutos(allProdutos);
    } catch (error) {
      console.error('Erro ao carregar produtos:', error);
    }
  };

  const filteredProdutos = produtos.filter((produto) => {
    const matchesSearch = 
      produto.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
      produto.codigo.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (produto.categoria && produto.categoria.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesCategoria = filterCategoria === 'todas' || produto.categoria === filterCategoria;
    const matchesAtivo = 
      filterAtivo === 'todos' ||
      (filterAtivo === 'ativos' && produto.ativo) ||
      (filterAtivo === 'inativos' && !produto.ativo);
    return matchesSearch && matchesCategoria && matchesAtivo;
  });

  const categorias = Array.from(new Set(produtos.map(p => p.categoria).filter(Boolean)));

  const handleOpenModal = (produto?: Produto) => {
    if (produto) {
      setEditingProduto(produto);
      setFormData({
        codigo: produto.codigo,
        nome: produto.nome,
        descricao: produto.descricao || '',
        categoria: produto.categoria || '',
        preco: produto.preco.toString(),
        custo: produto.custo?.toString() || '',
        estoque: produto.estoque.toString(),
        unidade: produto.unidade,
        ativo: produto.ativo,
      });
    } else {
      setEditingProduto(null);
      setFormData({
        codigo: '',
        nome: '',
        descricao: '',
        categoria: '',
        preco: '',
        custo: '',
        estoque: '',
        unidade: 'UN',
        ativo: true,
      });
    }
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setEditingProduto(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingProduto) {
        await produtoService.update(editingProduto.id, {
          ...formData,
          preco: parseFloat(formData.preco),
          custo: formData.custo ? parseFloat(formData.custo) : undefined,
          estoque: parseInt(formData.estoque),
        });
      } else {
        // Verificar se código já existe
        const produtoExistente = await produtoService.getByCodigo(formData.codigo);
        if (produtoExistente) {
          alert('Já existe um produto com este código!');
          return;
        }
        await produtoService.create({
          ...formData,
          preco: parseFloat(formData.preco),
          custo: formData.custo ? parseFloat(formData.custo) : undefined,
          estoque: parseInt(formData.estoque),
        });
      }
      await loadProdutos();
      handleCloseModal();
    } catch (error) {
      console.error('Erro ao salvar produto:', error);
      alert('Erro ao salvar produto');
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm('Tem certeza que deseja excluir este produto?')) {
      try {
        await produtoService.delete(id);
        await loadProdutos();
      } catch (error) {
        console.error('Erro ao excluir produto:', error);
        alert('Erro ao excluir produto');
      }
    }
  };

  const valorTotalEstoque = produtos.reduce((sum, p) => sum + (p.preco * p.estoque), 0);
  const produtosAtivos = produtos.filter(p => p.ativo).length;
  const produtosBaixoEstoque = produtos.filter(p => p.estoque < 10).length;

  return (
    <div>
      <div className="mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Produtos</h1>
          <p className="mt-2 text-gray-600">Gerencie seu catálogo de produtos</p>
        </div>
        <button
          onClick={() => handleOpenModal()}
          className="btn-primary flex items-center justify-center gap-2"
        >
          <Plus size={20} />
          <span>Novo Produto</span>
        </button>
      </div>

      {/* Estatísticas */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="card bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-blue-700 font-medium">Valor Total em Estoque</p>
              <p className="text-2xl font-bold text-blue-900 mt-1">{formatCurrency(valorTotalEstoque)}</p>
            </div>
            <DollarSign className="text-blue-600" size={32} />
          </div>
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="card bg-gradient-to-br from-green-50 to-green-100 border-green-200"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-green-700 font-medium">Produtos Ativos</p>
              <p className="text-2xl font-bold text-green-900 mt-1">{produtosAtivos}</p>
            </div>
            <TrendingUp className="text-green-600" size={32} />
          </div>
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="card bg-gradient-to-br from-red-50 to-red-100 border-red-200"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-red-700 font-medium">Produtos com Estoque Baixo</p>
              <p className="text-2xl font-bold text-red-900 mt-1">{produtosBaixoEstoque}</p>
            </div>
            <TrendingDown className="text-red-600" size={32} />
          </div>
        </motion.div>
      </div>

      {/* Filtros */}
      <div className="mb-6 grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-5 w-5" />
          <input
            type="text"
            placeholder="Buscar produtos..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="input pl-10"
          />
        </div>
        <select
          value={filterCategoria}
          onChange={(e) => setFilterCategoria(e.target.value)}
          className="input"
        >
          <option value="todas">Todas as categorias</option>
          {categorias.map((cat) => (
            <option key={cat} value={cat}>
              {cat}
            </option>
          ))}
        </select>
        <select
          value={filterAtivo}
          onChange={(e) => setFilterAtivo(e.target.value)}
          className="input"
        >
          <option value="todos">Todos</option>
          <option value="ativos">Apenas Ativos</option>
          <option value="inativos">Apenas Inativos</option>
        </select>
      </div>

      {/* Lista de Produtos */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredProdutos.map((produto, index) => (
          <motion.div
            key={produto.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.05 }}
          >
            <div className={`card hover:shadow-xl transition-all duration-300 ${!produto.ativo ? 'opacity-60' : ''}`}>
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <Link
                    to={`/produtos/${produto.id}`}
                    className="text-lg font-semibold text-gray-900 hover:text-primary-600"
                  >
                    {produto.nome}
                  </Link>
                  <p className="text-sm text-gray-500 mt-1">Código: {produto.codigo}</p>
                  {produto.categoria && (
                    <span className="inline-block mt-2 px-2 py-1 text-xs font-medium bg-primary-100 text-primary-700 rounded">
                      {produto.categoria}
                    </span>
                  )}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleOpenModal(produto)}
                    className="p-2 text-gray-600 hover:text-primary-600 hover:bg-gray-100 rounded"
                  >
                    <Edit size={18} />
                  </button>
                  <button
                    onClick={() => handleDelete(produto.id)}
                    className="p-2 text-gray-600 hover:text-red-600 hover:bg-gray-100 rounded"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Preço:</span>
                  <span className="text-lg font-bold text-gray-900">{formatCurrency(produto.preco)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Estoque:</span>
                  <span className={`font-semibold ${produto.estoque < 10 ? 'text-red-600' : 'text-gray-900'}`}>
                    {produto.estoque} {produto.unidade}
                  </span>
                </div>
                {produto.custo && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Custo:</span>
                    <span className="text-sm text-gray-700">{formatCurrency(produto.custo)}</span>
                  </div>
                )}
                <div className="flex items-center justify-between pt-2 border-t border-gray-200">
                  <span className="text-sm text-gray-600">Valor Total:</span>
                  <span className="font-bold text-primary-600">
                    {formatCurrency(produto.preco * produto.estoque)}
                  </span>
                </div>
                {!produto.ativo && (
                  <span className="inline-block mt-2 px-2 py-1 text-xs font-medium bg-gray-200 text-gray-700 rounded">
                    Inativo
                  </span>
                )}
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {filteredProdutos.length === 0 && (
        <div className="card text-center py-12">
          <Package className="mx-auto text-gray-400 mb-4" size={48} />
          <p className="text-gray-500">
            {searchTerm || filterCategoria !== 'todas' || filterAtivo !== 'todos'
              ? 'Nenhum produto encontrado.'
              : 'Nenhum produto cadastrado ainda.'}
          </p>
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
            <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" onClick={handleCloseModal} />
            <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-2xl sm:w-full">
              <form onSubmit={handleSubmit} className="p-6">
                <h2 className="text-2xl font-bold text-gray-900 mb-6">
                  {editingProduto ? 'Editar Produto' : 'Novo Produto'}
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Código *
                    </label>
                    <input
                      type="text"
                      required
                      value={formData.codigo}
                      onChange={(e) => setFormData({ ...formData, codigo: e.target.value.toUpperCase() })}
                      className="input"
                      disabled={!!editingProduto}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Unidade *
                    </label>
                    <select
                      required
                      value={formData.unidade}
                      onChange={(e) => setFormData({ ...formData, unidade: e.target.value })}
                      className="input"
                    >
                      <option value="UN">UN - Unidade</option>
                      <option value="KG">KG - Quilograma</option>
                      <option value="M">M - Metro</option>
                      <option value="L">L - Litro</option>
                      <option value="CX">CX - Caixa</option>
                      <option value="PC">PC - Peça</option>
                    </select>
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Nome *
                    </label>
                    <input
                      type="text"
                      required
                      value={formData.nome}
                      onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                      className="input"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Categoria
                    </label>
                    <input
                      type="text"
                      value={formData.categoria}
                      onChange={(e) => setFormData({ ...formData, categoria: e.target.value })}
                      className="input"
                      placeholder="Ex: Eletrônicos, Roupas, Alimentos..."
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Preço de Venda *
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      required
                      value={formData.preco}
                      onChange={(e) => setFormData({ ...formData, preco: e.target.value })}
                      className="input"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Custo
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={formData.custo}
                      onChange={(e) => setFormData({ ...formData, custo: e.target.value })}
                      className="input"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Estoque Inicial *
                    </label>
                    <input
                      type="number"
                      min="0"
                      required
                      value={formData.estoque}
                      onChange={(e) => setFormData({ ...formData, estoque: e.target.value })}
                      className="input"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Descrição
                    </label>
                    <textarea
                      value={formData.descricao}
                      onChange={(e) => setFormData({ ...formData, descricao: e.target.value })}
                      className="input"
                      rows={3}
                    />
                  </div>
                  <div className="md:col-span-2 flex items-center">
                    <input
                      type="checkbox"
                      id="ativo"
                      checked={formData.ativo}
                      onChange={(e) => setFormData({ ...formData, ativo: e.target.checked })}
                      className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                    />
                    <label htmlFor="ativo" className="ml-2 text-sm text-gray-700">
                      Produto ativo
                    </label>
                  </div>
                </div>
                <div className="mt-6 flex gap-3 justify-end">
                  <button
                    type="button"
                    onClick={handleCloseModal}
                    className="btn-secondary"
                  >
                    Cancelar
                  </button>
                  <button type="submit" className="btn-primary">
                    {editingProduto ? 'Salvar' : 'Criar'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

