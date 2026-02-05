import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Plus, Search, Eye, DollarSign, ShoppingCart, CheckCircle, XCircle, Clock } from 'lucide-react';
import { vendaService, clienteService } from '../utils/dbService';
import { formatCurrency, formatDateBR } from '../utils/format';
import type { Venda } from '../types';

export default function Vendas() {
  const [vendas, setVendas] = useState<Venda[]>([]);
  const [clientes, setClientes] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('todos');

  useEffect(() => {
    loadVendas();
    loadClientes();
  }, []);

  const loadVendas = async () => {
    try {
      const allVendas = await vendaService.getAll();
      setVendas(allVendas);
    } catch (error) {
      console.error('Erro ao carregar vendas:', error);
    }
  };

  const loadClientes = async () => {
    try {
      const allClientes = await clienteService.getAll();
      setClientes(allClientes);
    } catch (error) {
      console.error('Erro ao carregar clientes:', error);
    }
  };

  const filteredVendas = vendas.filter((venda) => {
    const cliente = clientes.find(c => c.id === venda.clienteId);
    const matchesSearch = 
      venda.numero.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (cliente && cliente.nome.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesStatus = filterStatus === 'todos' || venda.status === filterStatus;
    return matchesSearch && matchesStatus;
  });

  const getStatusIcon = (status: Venda['status']) => {
    switch (status) {
      case 'paga':
        return <CheckCircle className="text-green-600" size={20} />;
      case 'cancelada':
        return <XCircle className="text-red-600" size={20} />;
      default:
        return <Clock className="text-yellow-600" size={20} />;
    }
  };

  const getStatusColor = (status: Venda['status']) => {
    switch (status) {
      case 'paga':
        return 'bg-green-100 text-green-700';
      case 'cancelada':
        return 'bg-red-100 text-red-700';
      default:
        return 'bg-yellow-100 text-yellow-700';
    }
  };

  const estatisticas = {
    total: vendas.length,
    pagas: vendas.filter(v => v.status === 'paga').length,
    pendentes: vendas.filter(v => v.status === 'pendente').length,
    receitaTotal: vendas.filter(v => v.status === 'paga').reduce((sum, v) => sum + v.total, 0),
  };

  return (
    <div>
      <div className="mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Vendas</h1>
          <p className="mt-2 text-gray-600">Gerencie todas as suas vendas</p>
        </div>
        <Link
          to="/vendas/nova"
          className="btn-primary flex items-center justify-center gap-2"
        >
          <Plus size={20} />
          <span>Nova Venda</span>
        </Link>
      </div>

      {/* Estatísticas */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="card bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-blue-700 font-medium">Total de Vendas</p>
              <p className="text-2xl font-bold text-blue-900 mt-1">{estatisticas.total}</p>
            </div>
            <ShoppingCart className="text-blue-600" size={32} />
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
              <p className="text-sm text-green-700 font-medium">Vendas Pagas</p>
              <p className="text-2xl font-bold text-green-900 mt-1">{estatisticas.pagas}</p>
            </div>
            <CheckCircle className="text-green-600" size={32} />
          </div>
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="card bg-gradient-to-br from-yellow-50 to-yellow-100 border-yellow-200"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-yellow-700 font-medium">Vendas Pendentes</p>
              <p className="text-2xl font-bold text-yellow-900 mt-1">{estatisticas.pendentes}</p>
            </div>
            <Clock className="text-yellow-600" size={32} />
          </div>
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="card bg-gradient-to-br from-purple-50 to-purple-100 border-purple-200"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-purple-700 font-medium">Receita Total</p>
              <p className="text-2xl font-bold text-purple-900 mt-1">{formatCurrency(estatisticas.receitaTotal)}</p>
            </div>
            <DollarSign className="text-purple-600" size={32} />
          </div>
        </motion.div>
      </div>

      {/* Filtros */}
      <div className="mb-6 grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-5 w-5" />
          <input
            type="text"
            placeholder="Buscar por número ou cliente..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="input pl-10"
          />
        </div>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="input"
        >
          <option value="todos">Todos os status</option>
          <option value="pendente">Pendentes</option>
          <option value="paga">Pagas</option>
          <option value="cancelada">Canceladas</option>
        </select>
      </div>

      {/* Lista de Vendas */}
      <div className="space-y-4">
        {filteredVendas.map((venda, index) => {
          const cliente = clientes.find(c => c.id === venda.clienteId);
          return (
            <motion.div
              key={venda.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
            >
              <div className="card hover:shadow-xl transition-all duration-300">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-lg font-semibold text-gray-900">{venda.numero}</h3>
                      <span className={`px-2 py-1 text-xs font-medium rounded flex items-center gap-1 ${getStatusColor(venda.status)}`}>
                        {getStatusIcon(venda.status)}
                        {venda.status === 'paga' ? 'Paga' : venda.status === 'cancelada' ? 'Cancelada' : 'Pendente'}
                      </span>
                    </div>
                    {cliente && (
                      <p className="text-sm text-gray-600 mb-1">
                        Cliente: <span className="font-medium">{cliente.nome}</span>
                      </p>
                    )}
                    <p className="text-sm text-gray-600">
                      {venda.itens.length} {venda.itens.length === 1 ? 'item' : 'itens'} • {formatDateBR(venda.dataVenda)}
                    </p>
                    <p className="text-sm text-gray-500 mt-1">
                      Pagamento: {venda.formaPagamento}
                    </p>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className="text-sm text-gray-600">Total</p>
                      <p className="text-2xl font-bold text-gray-900">{formatCurrency(venda.total)}</p>
                    </div>
                    <Link
                      to={`/vendas/${venda.id}`}
                      className="btn-secondary flex items-center gap-2"
                    >
                      <Eye size={18} />
                      <span className="hidden sm:inline">Ver</span>
                    </Link>
                  </div>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>

      {filteredVendas.length === 0 && (
        <div className="card text-center py-12">
          <ShoppingCart className="mx-auto text-gray-400 mb-4" size={48} />
          <p className="text-gray-500">
            {searchTerm || filterStatus !== 'todos'
              ? 'Nenhuma venda encontrada.'
              : 'Nenhuma venda registrada ainda.'}
          </p>
        </div>
      )}
    </div>
  );
}

