import { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { Plus, Search, Edit, Trash2, DollarSign, TrendingUp } from 'lucide-react';
import { storage } from '../utils/storage';
import { formatCurrency, formatDateBR } from '../utils/format';
import { generateId } from '../utils/helpers';
import type { Oportunidade } from '../types';

const etapas = [
  { value: 'prospeccao', label: 'Prospecção' },
  { value: 'qualificacao', label: 'Qualificação' },
  { value: 'proposta', label: 'Proposta' },
  { value: 'negociacao', label: 'Negociação' },
  { value: 'fechada', label: 'Fechada' },
  { value: 'perdida', label: 'Perdida' },
];

export default function Oportunidades() {
  const [searchParams] = useSearchParams();
  const clienteId = searchParams.get('clienteId');
  const [oportunidades, setOportunidades] = useState<Oportunidade[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterEtapa, setFilterEtapa] = useState<string>('todas');
  const [showModal, setShowModal] = useState(false);
  const [editingOportunidade, setEditingOportunidade] = useState<Oportunidade | null>(null);
  const [formData, setFormData] = useState({
    clienteId: clienteId || '',
    titulo: '',
    valor: '',
    probabilidade: '50',
    etapa: 'prospeccao' as Oportunidade['etapa'],
    dataFechamentoEsperada: '',
    descricao: '',
  });

  useEffect(() => {
    loadOportunidades();
  }, [clienteId]);

  const loadOportunidades = () => {
    const allOportunidades = storage.oportunidades.getAll();
    if (clienteId) {
      setOportunidades(allOportunidades.filter(o => o.clienteId === clienteId));
    } else {
      setOportunidades(allOportunidades);
    }
  };

  const filteredOportunidades = oportunidades.filter((oportunidade) => {
    const matchesSearch = oportunidade.titulo.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesEtapa = filterEtapa === 'todas' || oportunidade.etapa === filterEtapa;
    return matchesSearch && matchesEtapa;
  });

  const handleOpenModal = (oportunidade?: Oportunidade) => {
    if (oportunidade) {
      setEditingOportunidade(oportunidade);
      setFormData({
        clienteId: oportunidade.clienteId,
        titulo: oportunidade.titulo,
        valor: oportunidade.valor.toString(),
        probabilidade: oportunidade.probabilidade.toString(),
        etapa: oportunidade.etapa,
        dataFechamentoEsperada: oportunidade.dataFechamentoEsperada || '',
        descricao: oportunidade.descricao || '',
      });
    } else {
      setEditingOportunidade(null);
      setFormData({
        clienteId: clienteId || '',
        titulo: '',
        valor: '',
        probabilidade: '50',
        etapa: 'prospeccao',
        dataFechamentoEsperada: '',
        descricao: '',
      });
    }
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setEditingOportunidade(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const now = new Date().toISOString();

    if (editingOportunidade) {
      storage.oportunidades.update(editingOportunidade.id, {
        ...formData,
        valor: parseFloat(formData.valor),
        probabilidade: parseInt(formData.probabilidade),
      });
    } else {
      if (!formData.clienteId) {
        alert('Selecione um cliente');
        return;
      }
      const novaOportunidade: Oportunidade = {
        id: generateId(),
        clienteId: formData.clienteId,
        titulo: formData.titulo,
        valor: parseFloat(formData.valor),
        probabilidade: parseInt(formData.probabilidade),
        etapa: formData.etapa,
        dataFechamentoEsperada: formData.dataFechamentoEsperada || undefined,
        descricao: formData.descricao || undefined,
        dataCriacao: now,
        dataAtualizacao: now,
      };
      storage.oportunidades.add(novaOportunidade);
    }

    loadOportunidades();
    handleCloseModal();
  };

  const handleDelete = (id: string) => {
    if (confirm('Tem certeza que deseja excluir esta oportunidade?')) {
      storage.oportunidades.delete(id);
      loadOportunidades();
    }
  };

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

  const clientes = storage.clientes.getAll();
  const valorTotal = filteredOportunidades
    .filter(o => o.etapa !== 'perdida')
    .reduce((sum, o) => sum + o.valor, 0);

  return (
    <div>
      <div className="mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Oportunidades</h1>
          <p className="mt-2 text-gray-600">Gerencie suas oportunidades de negócio</p>
        </div>
        <button
          onClick={() => handleOpenModal()}
          className="btn-primary flex items-center justify-center gap-2"
        >
          <Plus size={20} />
          <span>Nova Oportunidade</span>
        </button>
      </div>

      <div className="mb-6 grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-5 w-5" />
          <input
            type="text"
            placeholder="Buscar oportunidades..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="input pl-10"
          />
        </div>
        <select
          value={filterEtapa}
          onChange={(e) => setFilterEtapa(e.target.value)}
          className="input"
        >
          <option value="todas">Todas as etapas</option>
          {etapas.map((etapa) => (
            <option key={etapa.value} value={etapa.value}>
              {etapa.label}
            </option>
          ))}
        </select>
      </div>

      {filteredOportunidades.length > 0 && (
        <div className="mb-6 card bg-primary-50 border-primary-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-primary-700">Valor Total em Pipeline</p>
              <p className="text-2xl font-bold text-primary-900">{formatCurrency(valorTotal)}</p>
            </div>
            <DollarSign className="text-primary-600" size={32} />
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredOportunidades.map((oportunidade) => {
          const cliente = clientes.find(c => c.id === oportunidade.clienteId);
          return (
            <div key={oportunidade.id} className="card hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <Link
                    to={`/oportunidades/${oportunidade.id}`}
                    className="text-lg font-semibold text-gray-900 hover:text-primary-600"
                  >
                    {oportunidade.titulo}
                  </Link>
                  {cliente && (
                    <Link
                      to={`/clientes/${cliente.id}`}
                      className="text-sm text-primary-600 hover:text-primary-700 mt-1 block"
                    >
                      {cliente.nome}
                    </Link>
                  )}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleOpenModal(oportunidade)}
                    className="p-2 text-gray-600 hover:text-primary-600 hover:bg-gray-100 rounded"
                  >
                    <Edit size={18} />
                  </button>
                  <button
                    onClick={() => handleDelete(oportunidade.id)}
                    className="p-2 text-gray-600 hover:text-red-600 hover:bg-gray-100 rounded"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-2xl font-bold text-gray-900">
                    {formatCurrency(oportunidade.valor)}
                  </span>
                  <span className={`px-2 py-1 text-xs font-medium rounded ${getEtapaColor(oportunidade.etapa)}`}>
                    {etapas.find(e => e.value === oportunidade.etapa)?.label}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <TrendingUp size={16} />
                  <span>{oportunidade.probabilidade}% de probabilidade</span>
                </div>
                {oportunidade.dataFechamentoEsperada && (
                  <p className="text-xs text-gray-500">
                    Fechamento: {formatDateBR(oportunidade.dataFechamentoEsperada)}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {filteredOportunidades.length === 0 && (
        <div className="card text-center py-12">
          <p className="text-gray-500">
            {searchTerm || filterEtapa !== 'todas'
              ? 'Nenhuma oportunidade encontrada.'
              : 'Nenhuma oportunidade cadastrada ainda.'}
          </p>
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
            <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" onClick={handleCloseModal} />
            <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
              <form onSubmit={handleSubmit} className="p-6">
                <h2 className="text-2xl font-bold text-gray-900 mb-6">
                  {editingOportunidade ? 'Editar Oportunidade' : 'Nova Oportunidade'}
                </h2>
                <div className="space-y-4">
                  {!clienteId && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Cliente *
                      </label>
                      <select
                        required
                        value={formData.clienteId}
                        onChange={(e) => setFormData({ ...formData, clienteId: e.target.value })}
                        className="input"
                        disabled={!!clienteId}
                      >
                        <option value="">Selecione um cliente</option>
                        {clientes.map((cliente) => (
                          <option key={cliente.id} value={cliente.id}>
                            {cliente.nome}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Título *
                    </label>
                    <input
                      type="text"
                      required
                      value={formData.titulo}
                      onChange={(e) => setFormData({ ...formData, titulo: e.target.value })}
                      className="input"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Valor *
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        required
                        value={formData.valor}
                        onChange={(e) => setFormData({ ...formData, valor: e.target.value })}
                        className="input"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Probabilidade (%)
                      </label>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={formData.probabilidade}
                        onChange={(e) => setFormData({ ...formData, probabilidade: e.target.value })}
                        className="input"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Etapa *
                    </label>
                    <select
                      required
                      value={formData.etapa}
                      onChange={(e) => setFormData({ ...formData, etapa: e.target.value as Oportunidade['etapa'] })}
                      className="input"
                    >
                      {etapas.map((etapa) => (
                        <option key={etapa.value} value={etapa.value}>
                          {etapa.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Data de Fechamento Esperada
                    </label>
                    <input
                      type="date"
                      value={formData.dataFechamentoEsperada}
                      onChange={(e) => setFormData({ ...formData, dataFechamentoEsperada: e.target.value })}
                      className="input"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Descrição
                    </label>
                    <textarea
                      value={formData.descricao}
                      onChange={(e) => setFormData({ ...formData, descricao: e.target.value })}
                      className="input"
                      rows={4}
                    />
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
                    {editingOportunidade ? 'Salvar' : 'Criar'}
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


