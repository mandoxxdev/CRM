import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Printer, CheckCircle, XCircle, Clock } from 'lucide-react';
import { vendaService, clienteService } from '../utils/dbService';
import { formatCurrency, formatDateBR } from '../utils/format';
import type { Venda } from '../types';

export default function VendaDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [venda, setVenda] = useState<Venda | null>(null);
  const [cliente, setCliente] = useState<any>(null);

  useEffect(() => {
    if (id) {
      loadVenda();
    }
  }, [id]);

  const loadVenda = async () => {
    if (!id) return;
    try {
      const vendaData = await vendaService.getById(id);
      if (vendaData) {
        setVenda(vendaData);
        const clienteData = await clienteService.getById(vendaData.clienteId);
        setCliente(clienteData);
      }
    } catch (error) {
      console.error('Erro ao carregar venda:', error);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const handleStatusChange = async (newStatus: Venda['status']) => {
    if (!id || !venda) return;
    try {
      await vendaService.update(id, { status: newStatus });
      await loadVenda();
    } catch (error) {
      console.error('Erro ao atualizar status:', error);
      alert('Erro ao atualizar status');
    }
  };

  if (!venda) {
    return (
      <div className="card text-center py-12">
        <p className="text-gray-500">Venda não encontrada.</p>
        <Link to="/vendas" className="btn-primary mt-4 inline-block">
          Voltar para Vendas
        </Link>
      </div>
    );
  }

  const getStatusIcon = (status: Venda['status']) => {
    switch (status) {
      case 'paga':
        return <CheckCircle className="text-green-600" size={24} />;
      case 'cancelada':
        return <XCircle className="text-red-600" size={24} />;
      default:
        return <Clock className="text-yellow-600" size={24} />;
    }
  };

  const getStatusColor = (status: Venda['status']) => {
    switch (status) {
      case 'paga':
        return 'bg-green-100 text-green-700 border-green-200';
      case 'cancelada':
        return 'bg-red-100 text-red-700 border-red-200';
      default:
        return 'bg-yellow-100 text-yellow-700 border-yellow-200';
    }
  };

  return (
    <div>
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <Link
          to="/vendas"
          className="inline-flex items-center text-gray-600 hover:text-gray-900"
        >
          <ArrowLeft size={20} className="mr-2" />
          Voltar
        </Link>
        <div className="flex gap-2">
          <button
            onClick={handlePrint}
            className="btn-secondary flex items-center gap-2"
          >
            <Printer size={18} />
            <span className="hidden sm:inline">Imprimir</span>
          </button>
          {venda.status === 'pendente' && (
            <>
              <button
                onClick={() => handleStatusChange('paga')}
                className="btn-primary flex items-center gap-2"
              >
                <CheckCircle size={18} />
                <span className="hidden sm:inline">Marcar como Paga</span>
              </button>
              <button
                onClick={() => handleStatusChange('cancelada')}
                className="btn-danger flex items-center gap-2"
              >
                <XCircle size={18} />
                <span className="hidden sm:inline">Cancelar</span>
              </button>
            </>
          )}
        </div>
      </div>

      <div className="card mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">{venda.numero}</h1>
            <p className="mt-1 text-lg text-gray-600">
              {formatDateBR(venda.dataVenda)}
            </p>
          </div>
          <div className={`mt-4 sm:mt-0 px-4 py-2 rounded-lg border flex items-center gap-2 ${getStatusColor(venda.status)}`}>
            {getStatusIcon(venda.status)}
            <span className="font-semibold">
              {venda.status === 'paga' ? 'Paga' : venda.status === 'cancelada' ? 'Cancelada' : 'Pendente'}
            </span>
          </div>
        </div>

        {cliente && (
          <div className="mb-6 p-4 bg-gray-50 rounded-lg">
            <h3 className="text-sm font-medium text-gray-600 mb-2">Cliente</h3>
            <Link
              to={`/clientes/${cliente.id}`}
              className="text-lg font-semibold text-primary-600 hover:text-primary-700"
            >
              {cliente.nome}
            </Link>
            {cliente.empresa && (
              <p className="text-sm text-gray-600 mt-1">{cliente.empresa}</p>
            )}
            <p className="text-sm text-gray-600 mt-1">{cliente.email}</p>
            <p className="text-sm text-gray-600">{cliente.telefone}</p>
          </div>
        )}

        {/* Itens da Venda */}
        <div className="mb-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Itens da Venda</h3>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Produto
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Quantidade
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Preço Unit.
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Desconto
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Total
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {venda.itens.map((item: any, index: number) => (
                  <tr key={index}>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">{item.produtoNome}</div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-right text-sm text-gray-900">
                      {item.quantidade}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-right text-sm text-gray-900">
                      {formatCurrency(item.precoUnitario)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-right text-sm text-gray-900">
                      {item.desconto ? formatCurrency(item.desconto) : '-'}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-right text-sm font-medium text-gray-900">
                      {formatCurrency(item.total)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Totais */}
        <div className="border-t border-gray-200 pt-4">
          <div className="flex justify-end">
            <div className="w-full max-w-md space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Subtotal:</span>
                <span className="text-gray-900">{formatCurrency(venda.subtotal)}</span>
              </div>
              {venda.desconto && venda.desconto > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Desconto:</span>
                  <span className="text-red-600">-{formatCurrency(venda.desconto)}</span>
                </div>
              )}
              <div className="flex justify-between text-lg font-bold border-t border-gray-200 pt-2">
                <span className="text-gray-900">Total:</span>
                <span className="text-primary-600">{formatCurrency(venda.total)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Informações Adicionais */}
        <div className="mt-6 pt-6 border-t border-gray-200 grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-gray-600">Forma de Pagamento:</span>
            <p className="text-gray-900 font-medium mt-1 capitalize">{venda.formaPagamento}</p>
          </div>
          <div>
            <span className="text-gray-600">Data da Venda:</span>
            <p className="text-gray-900 font-medium mt-1">{formatDateBR(venda.dataVenda)}</p>
          </div>
          {venda.observacoes && (
            <div className="md:col-span-2">
              <span className="text-gray-600">Observações:</span>
              <p className="text-gray-900 mt-1 whitespace-pre-wrap">{venda.observacoes}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

