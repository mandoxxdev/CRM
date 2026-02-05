import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Edit, Trash2, DollarSign, TrendingUp, Calendar } from 'lucide-react';
import { storage } from '../utils/storage';
import { formatCurrency, formatDateBR } from '../utils/format';
import type { Oportunidade } from '../types';

const etapas = [
  { value: 'prospeccao', label: 'Prospecção' },
  { value: 'qualificacao', label: 'Qualificação' },
  { value: 'proposta', label: 'Proposta' },
  { value: 'negociacao', label: 'Negociação' },
  { value: 'fechada', label: 'Fechada' },
  { value: 'perdida', label: 'Perdida' },
];

export default function OportunidadeDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [oportunidade, setOportunidade] = useState<Oportunidade | null>(null);
  const [cliente, setCliente] = useState<any>(null);

  useEffect(() => {
    if (id) {
      const oportunidadeData = storage.oportunidades.getAll().find(o => o.id === id);
      if (oportunidadeData) {
        setOportunidade(oportunidadeData);
        const clienteData = storage.clientes.getById(oportunidadeData.clienteId);
        setCliente(clienteData);
      }
    }
  }, [id]);

  const handleDelete = () => {
    if (confirm('Tem certeza que deseja excluir esta oportunidade?')) {
      if (id) {
        storage.oportunidades.delete(id);
        navigate('/oportunidades');
      }
    }
  };

  if (!oportunidade) {
    return (
      <div className="card text-center py-12">
        <p className="text-gray-500">Oportunidade não encontrada.</p>
        <Link to="/oportunidades" className="btn-primary mt-4 inline-block">
          Voltar para Oportunidades
        </Link>
      </div>
    );
  }

  const getEtapaColor = (etapa: string) => {
    const colors: Record<string, string> = {
      prospeccao: 'bg-gray-100 text-gray-700',
      qualificacao: 'bg-blue-100 text-blue-700',
      proposta: 'bg-yellow-100 text-yellow-700',
      negociacao: 'bg-orange-100 text-orange-700',
      fechada: 'bg-green-100 text-green-700',
      perdida: 'bg-red-100 text-red-700',
    };
    return colors[etapa] || colors.prospeccao;
  };

  const valorEsperado = oportunidade.valor * (oportunidade.probabilidade / 100);

  return (
    <div>
      <div className="mb-6">
        <Link
          to="/oportunidades"
          className="inline-flex items-center text-gray-600 hover:text-gray-900 mb-4"
        >
          <ArrowLeft size={20} className="mr-2" />
          Voltar
        </Link>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">{oportunidade.titulo}</h1>
            {cliente && (
              <Link
                to={`/clientes/${cliente.id}`}
                className="mt-1 text-lg text-primary-600 hover:text-primary-700 inline-block"
              >
                {cliente.nome}
              </Link>
            )}
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
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Informações da Oportunidade</h2>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-gray-600">Valor</label>
                <p className="text-3xl font-bold text-gray-900 mt-1">
                  {formatCurrency(oportunidade.valor)}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-gray-600">Probabilidade</label>
                  <div className="flex items-center gap-2 mt-1">
                    <TrendingUp className="text-primary-600" size={20} />
                    <p className="text-lg font-semibold text-gray-900">
                      {oportunidade.probabilidade}%
                    </p>
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-600">Valor Esperado</label>
                  <p className="text-lg font-semibold text-gray-900 mt-1">
                    {formatCurrency(valorEsperado)}
                  </p>
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-600">Etapa</label>
                <span className={`inline-block mt-2 px-3 py-1 text-sm font-medium rounded ${getEtapaColor(oportunidade.etapa)}`}>
                  {etapas.find(e => e.value === oportunidade.etapa)?.label}
                </span>
              </div>
              {oportunidade.dataFechamentoEsperada && (
                <div>
                  <label className="text-sm font-medium text-gray-600">Data de Fechamento Esperada</label>
                  <div className="flex items-center gap-2 mt-1">
                    <Calendar className="text-gray-400" size={20} />
                    <p className="text-gray-900">
                      {formatDateBR(oportunidade.dataFechamentoEsperada)}
                    </p>
                  </div>
                </div>
              )}
              {oportunidade.descricao && (
                <div>
                  <label className="text-sm font-medium text-gray-600">Descrição</label>
                  <p className="text-gray-900 mt-1 whitespace-pre-wrap">{oportunidade.descricao}</p>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          {/* Informações do Sistema */}
          <div className="card">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Informações</h2>
            <div className="space-y-2 text-sm">
              <div>
                <span className="text-gray-600">Criado em:</span>
                <p className="text-gray-900">{formatDateBR(oportunidade.dataCriacao)}</p>
              </div>
              <div>
                <span className="text-gray-600">Última atualização:</span>
                <p className="text-gray-900">{formatDateBR(oportunidade.dataAtualizacao)}</p>
              </div>
            </div>
          </div>

          {/* Cliente */}
          {cliente && (
            <div className="card">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Cliente</h2>
              <Link
                to={`/clientes/${cliente.id}`}
                className="block p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <p className="font-medium text-gray-900">{cliente.nome}</p>
                {cliente.empresa && (
                  <p className="text-sm text-gray-600 mt-1">{cliente.empresa}</p>
                )}
                <p className="text-sm text-gray-600 mt-1">{cliente.email}</p>
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}


