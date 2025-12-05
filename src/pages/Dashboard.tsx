import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Users, TrendingUp, DollarSign, Calendar, Package, ShoppingCart, ArrowRight, BarChart3 } from 'lucide-react';
import { clienteService, oportunidadeService, atividadeService, produtoService, vendaService } from '../utils/dbService';
import { formatCurrency } from '../utils/format';
import type { DashboardStats } from '../types';
import LineChart from '../components/charts/LineChart';
import BarChart from '../components/charts/BarChart';
import PieChart from '../components/charts/PieChart';
import AreaChart from '../components/charts/AreaChart';
import { format, subDays } from 'date-fns';

export default function Dashboard() {
  const [stats, setStats] = useState<DashboardStats>({
    totalClientes: 0,
    totalOportunidades: 0,
    valorTotalOportunidades: 0,
    atividadesPendentes: 0,
    totalProdutos: 0,
    totalVendas: 0,
    receitaTotal: 0,
    ticketMedio: 0,
  });
  const [chartData, setChartData] = useState<any[]>([]);
  const [vendasPorEtapa, setVendasPorEtapa] = useState<any[]>([]);
  const [produtosMaisVendidos, setProdutosMaisVendidos] = useState<any[]>([]);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      const [clientes, oportunidades, atividades, produtos, vendas, estatisticas] = await Promise.all([
        clienteService.getAll(),
        oportunidadeService.getAll(),
        atividadeService.getPendentes(),
        produtoService.getAll(),
        vendaService.getAll(),
        vendaService.getEstatisticas(),
      ]);

      const valorTotal = oportunidades
        .filter(o => o.etapa !== 'perdida' && o.etapa !== 'fechada')
        .reduce((sum, o) => sum + o.valor, 0);

      setStats({
        totalClientes: clientes.length,
        totalOportunidades: oportunidades.filter(o => o.etapa !== 'fechada' && o.etapa !== 'perdida').length,
        valorTotalOportunidades: valorTotal,
        atividadesPendentes: atividades.length,
        totalProdutos: produtos.length,
        totalVendas: estatisticas.totalVendas,
        receitaTotal: estatisticas.receitaTotal,
        ticketMedio: estatisticas.ticketMedio,
      });

      // Dados para gráfico de vendas dos últimos 7 dias
      const ultimos7Dias = Array.from({ length: 7 }, (_, i) => {
        const date = subDays(new Date(), 6 - i);
        const dateStr = format(date, 'yyyy-MM-dd');
        const vendasDoDia = vendas.filter(v => 
          format(new Date(v.dataVenda), 'yyyy-MM-dd') === dateStr && v.status === 'paga'
        );
        return {
          name: format(date, 'dd/MM'),
          vendas: vendasDoDia.length,
          receita: vendasDoDia.reduce((sum, v) => sum + v.total, 0),
        };
      });
      setChartData(ultimos7Dias);

      // Vendas por etapa
      const etapas = ['prospeccao', 'qualificacao', 'proposta', 'negociacao', 'fechada', 'perdida'];
      const vendasPorEtapaData = etapas.map(etapa => ({
        name: etapa.charAt(0).toUpperCase() + etapa.slice(1),
        value: oportunidades.filter(o => o.etapa === etapa).length,
      }));
      setVendasPorEtapa(vendasPorEtapaData);

      // Produtos mais vendidos
      const produtosVendidos: Record<string, number> = {};
      vendas.forEach(venda => {
        venda.itens.forEach((item: any) => {
          produtosVendidos[item.produtoNome || item.produtoId] = (produtosVendidos[item.produtoNome || item.produtoId] || 0) + item.quantidade;
        });
      });
      const topProdutos = Object.entries(produtosVendidos)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5)
        .map(([nome, quantidade]) => ({ name: nome, value: quantidade }));
      setProdutosMaisVendidos(topProdutos);
    } catch (error) {
      console.error('Erro ao carregar dados do dashboard:', error);
    }
  };

  const statCards = [
    {
      title: 'Total de Clientes',
      value: stats.totalClientes,
      icon: Users,
      color: 'bg-gradient-to-br from-blue-500 to-blue-600',
      link: '/clientes',
    },
    {
      title: 'Oportunidades Ativas',
      value: stats.totalOportunidades,
      icon: TrendingUp,
      color: 'bg-gradient-to-br from-green-500 to-green-600',
      link: '/oportunidades',
    },
    {
      title: 'Receita Total',
      value: formatCurrency(stats.receitaTotal),
      icon: DollarSign,
      color: 'bg-gradient-to-br from-yellow-500 to-yellow-600',
      link: '/vendas',
    },
    {
      title: 'Total de Vendas',
      value: stats.totalVendas,
      icon: ShoppingCart,
      color: 'bg-gradient-to-br from-purple-500 to-purple-600',
      link: '/vendas',
    },
    {
      title: 'Produtos Cadastrados',
      value: stats.totalProdutos,
      icon: Package,
      color: 'bg-gradient-to-br from-indigo-500 to-indigo-600',
      link: '/produtos',
    },
    {
      title: 'Ticket Médio',
      value: formatCurrency(stats.ticketMedio),
      icon: BarChart3,
      color: 'bg-gradient-to-br from-pink-500 to-pink-600',
      link: '/vendas',
    },
  ];

  return (
    <div className="space-y-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
        <p className="mt-2 text-gray-600">Visão geral completa do seu negócio</p>
      </div>

      {/* Cards de Estatísticas */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {statCards.map((card, index) => {
          const Icon = card.icon;
          return (
            <motion.div
              key={card.title}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: index * 0.1 }}
            >
              <Link
                to={card.link}
                className="card hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">{card.title}</p>
                    <p className="mt-2 text-2xl font-bold text-gray-900">{card.value}</p>
                  </div>
                  <div className={`${card.color} p-4 rounded-xl shadow-lg`}>
                    <Icon className="h-6 w-6 text-white" />
                  </div>
                </div>
              </Link>
            </motion.div>
          );
        })}
      </div>

      {/* Gráficos */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Gráfico de Vendas dos Últimos 7 Dias */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.4 }}
          className="card"
        >
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Vendas dos Últimos 7 Dias</h2>
          <div className="h-64">
            <AreaChart data={chartData} dataKey="receita" name="Receita (R$)" color="#0ea5e9" />
          </div>
        </motion.div>

        {/* Gráfico de Oportunidades por Etapa */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.5 }}
          className="card"
        >
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Oportunidades por Etapa</h2>
          <div className="h-64">
            <PieChart data={vendasPorEtapa} />
          </div>
        </motion.div>

        {/* Gráfico de Receita */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.6 }}
          className="card"
        >
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Receita Diária</h2>
          <div className="h-64">
            <BarChart data={chartData} dataKey="receita" name="Receita (R$)" color="#10b981" />
          </div>
        </motion.div>

        {/* Produtos Mais Vendidos */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.7 }}
          className="card"
        >
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Produtos Mais Vendidos</h2>
          <div className="h-64">
            {produtosMaisVendidos.length > 0 ? (
              <BarChart 
                data={produtosMaisVendidos} 
                dataKey="value" 
                name="Quantidade" 
                color="#8b5cf6" 
              />
            ) : (
              <div className="flex items-center justify-center h-full text-gray-500">
                Nenhuma venda registrada ainda
              </div>
            )}
          </div>
        </motion.div>
      </div>

      {/* Ações Rápidas */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.8 }}
        className="card"
      >
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Ações Rápidas</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          <Link
            to="/clientes"
            className="flex items-center justify-between p-4 bg-gradient-to-r from-blue-50 to-blue-100 rounded-lg hover:from-blue-100 hover:to-blue-200 transition-all"
          >
            <span className="font-medium text-gray-700">Novo Cliente</span>
            <ArrowRight className="h-5 w-5 text-blue-600" />
          </Link>
          <Link
            to="/produtos"
            className="flex items-center justify-between p-4 bg-gradient-to-r from-indigo-50 to-indigo-100 rounded-lg hover:from-indigo-100 hover:to-indigo-200 transition-all"
          >
            <span className="font-medium text-gray-700">Novo Produto</span>
            <ArrowRight className="h-5 w-5 text-indigo-600" />
          </Link>
          <Link
            to="/vendas"
            className="flex items-center justify-between p-4 bg-gradient-to-r from-green-50 to-green-100 rounded-lg hover:from-green-100 hover:to-green-200 transition-all"
          >
            <span className="font-medium text-gray-700">Nova Venda</span>
            <ArrowRight className="h-5 w-5 text-green-600" />
          </Link>
          <Link
            to="/atividades"
            className="flex items-center justify-between p-4 bg-gradient-to-r from-purple-50 to-purple-100 rounded-lg hover:from-purple-100 hover:to-purple-200 transition-all"
          >
            <span className="font-medium text-gray-700">Nova Atividade</span>
            <ArrowRight className="h-5 w-5 text-purple-600" />
          </Link>
        </div>
      </motion.div>
    </div>
  );
}
