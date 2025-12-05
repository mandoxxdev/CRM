import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plus, Search, Check, X, Phone, Mail, Calendar, FileText, CheckCircle2 } from 'lucide-react';
import { storage } from '../utils/storage';
import { formatDateBR, formatDateTime } from '../utils/format';
import { generateId } from '../utils/helpers';
import type { Atividade } from '../types';

const tiposAtividade = [
  { value: 'ligacao', label: 'Ligação', icon: Phone },
  { value: 'email', label: 'Email', icon: Mail },
  { value: 'reuniao', label: 'Reunião', icon: Calendar },
  { value: 'tarefa', label: 'Tarefa', icon: CheckCircle2 },
  { value: 'nota', label: 'Nota', icon: FileText },
];

export default function Atividades() {
  const [searchParams] = useSearchParams();
  const clienteId = searchParams.get('clienteId');
  const [atividades, setAtividades] = useState<Atividade[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterConcluidas, setFilterConcluidas] = useState<string>('todas');
  const [showModal, setShowModal] = useState(false);
  const [editingAtividade, setEditingAtividade] = useState<Atividade | null>(null);
  const [formData, setFormData] = useState({
    clienteId: clienteId || '',
    oportunidadeId: '',
    tipo: 'tarefa' as Atividade['tipo'],
    titulo: '',
    descricao: '',
    data: new Date().toISOString().split('T')[0],
    hora: '',
    concluida: false,
  });

  useEffect(() => {
    loadAtividades();
  }, [clienteId]);

  const loadAtividades = () => {
    const allAtividades = storage.atividades.getAll();
    if (clienteId) {
      setAtividades(allAtividades.filter(a => a.clienteId === clienteId));
    } else {
      setAtividades(allAtividades);
    }
  };

  const filteredAtividades = atividades.filter((atividade) => {
    const matchesSearch = atividade.titulo.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesConcluidas =
      filterConcluidas === 'todas' ||
      (filterConcluidas === 'pendentes' && !atividade.concluida) ||
      (filterConcluidas === 'concluidas' && atividade.concluida);
    return matchesSearch && matchesConcluidas;
  });

  const handleOpenModal = (atividade?: Atividade) => {
    if (atividade) {
      setEditingAtividade(atividade);
      setFormData({
        clienteId: atividade.clienteId || '',
        oportunidadeId: atividade.oportunidadeId || '',
        tipo: atividade.tipo,
        titulo: atividade.titulo,
        descricao: atividade.descricao || '',
        data: atividade.data.split('T')[0],
        hora: atividade.hora || '',
        concluida: atividade.concluida,
      });
    } else {
      setEditingAtividade(null);
      setFormData({
        clienteId: clienteId || '',
        oportunidadeId: '',
        tipo: 'tarefa',
        titulo: '',
        descricao: '',
        data: new Date().toISOString().split('T')[0],
        hora: '',
        concluida: false,
      });
    }
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setEditingAtividade(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const now = new Date().toISOString();

    if (editingAtividade) {
      storage.atividades.update(editingAtividade.id, {
        ...formData,
        data: formData.data,
      });
    } else {
      const novaAtividade: Atividade = {
        id: generateId(),
        clienteId: formData.clienteId || undefined,
        oportunidadeId: formData.oportunidadeId || undefined,
        tipo: formData.tipo,
        titulo: formData.titulo,
        descricao: formData.descricao || undefined,
        data: formData.data,
        hora: formData.hora || undefined,
        concluida: formData.concluida,
        dataCriacao: now,
      };
      storage.atividades.add(novaAtividade);
    }

    loadAtividades();
    handleCloseModal();
  };

  const handleToggleConcluida = (id: string, concluida: boolean) => {
    storage.atividades.update(id, { concluida: !concluida });
    loadAtividades();
  };

  const handleDelete = (id: string) => {
    if (confirm('Tem certeza que deseja excluir esta atividade?')) {
      storage.atividades.delete(id);
      loadAtividades();
    }
  };

  const getTipoIcon = (tipo: Atividade['tipo']) => {
    const tipoData = tiposAtividade.find(t => t.value === tipo);
    return tipoData ? tipoData.icon : FileText;
  };

  const getTipoLabel = (tipo: Atividade['tipo']) => {
    const tipoData = tiposAtividade.find(t => t.value === tipo);
    return tipoData ? tipoData.label : tipo;
  };

  const clientes = storage.clientes.getAll();
  const oportunidades = storage.oportunidades.getAll();

  const atividadesPendentes = atividades.filter(a => !a.concluida).length;
  const atividadesConcluidas = atividades.filter(a => a.concluida).length;

  return (
    <div>
      <div className="mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Atividades</h1>
          <p className="mt-2 text-gray-600">Gerencie suas atividades e tarefas</p>
        </div>
        <button
          onClick={() => handleOpenModal()}
          className="btn-primary flex items-center justify-center gap-2"
        >
          <Plus size={20} />
          <span>Nova Atividade</span>
        </button>
      </div>

      <div className="mb-6 grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-5 w-5" />
          <input
            type="text"
            placeholder="Buscar atividades..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="input pl-10"
          />
        </div>
        <select
          value={filterConcluidas}
          onChange={(e) => setFilterConcluidas(e.target.value)}
          className="input"
        >
          <option value="todas">Todas</option>
          <option value="pendentes">Pendentes</option>
          <option value="concluidas">Concluídas</option>
        </select>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="card bg-blue-50 border-blue-200">
          <p className="text-sm text-blue-700">Total</p>
          <p className="text-2xl font-bold text-blue-900">{atividades.length}</p>
        </div>
        <div className="card bg-yellow-50 border-yellow-200">
          <p className="text-sm text-yellow-700">Pendentes</p>
          <p className="text-2xl font-bold text-yellow-900">{atividadesPendentes}</p>
        </div>
        <div className="card bg-green-50 border-green-200">
          <p className="text-sm text-green-700">Concluídas</p>
          <p className="text-2xl font-bold text-green-900">{atividadesConcluidas}</p>
        </div>
      </div>

      <div className="space-y-4">
        {filteredAtividades.map((atividade) => {
          const Icon = getTipoIcon(atividade.tipo);
          const cliente = atividade.clienteId
            ? clientes.find(c => c.id === atividade.clienteId)
            : null;
          const oportunidade = atividade.oportunidadeId
            ? oportunidades.find(o => o.id === atividade.oportunidadeId)
            : null;

          return (
            <div
              key={atividade.id}
              className={`card ${atividade.concluida ? 'opacity-75' : ''} hover:shadow-md transition-shadow`}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <Icon className={`${atividade.concluida ? 'text-gray-400' : 'text-primary-600'}`} size={20} />
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h3
                          className={`font-semibold text-gray-900 ${
                            atividade.concluida ? 'line-through' : ''
                          }`}
                        >
                          {atividade.titulo}
                        </h3>
                        <span className="text-xs px-2 py-1 bg-gray-100 text-gray-600 rounded">
                          {getTipoLabel(atividade.tipo)}
                        </span>
                      </div>
                      {atividade.descricao && (
                        <p className="text-sm text-gray-600 mt-1">{atividade.descricao}</p>
                      )}
                      <div className="flex flex-wrap items-center gap-4 mt-2 text-xs text-gray-500">
                        <span>{formatDateBR(atividade.data)}</span>
                        {atividade.hora && <span>{atividade.hora}</span>}
                        {cliente && (
                          <span className="text-primary-600">Cliente: {cliente.nome}</span>
                        )}
                        {oportunidade && (
                          <span className="text-primary-600">Oportunidade: {oportunidade.titulo}</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
                <div className="flex gap-2 ml-4">
                  <button
                    onClick={() => handleToggleConcluida(atividade.id, atividade.concluida)}
                    className={`p-2 rounded ${
                      atividade.concluida
                        ? 'text-green-600 hover:bg-green-50'
                        : 'text-gray-400 hover:bg-gray-100'
                    }`}
                    title={atividade.concluida ? 'Marcar como pendente' : 'Marcar como concluída'}
                  >
                    <Check size={18} />
                  </button>
                  <button
                    onClick={() => handleDelete(atividade.id)}
                    className="p-2 text-gray-400 hover:text-red-600 hover:bg-gray-100 rounded"
                  >
                    <X size={18} />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {filteredAtividades.length === 0 && (
        <div className="card text-center py-12">
          <p className="text-gray-500">
            {searchTerm || filterConcluidas !== 'todas'
              ? 'Nenhuma atividade encontrada.'
              : 'Nenhuma atividade cadastrada ainda.'}
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
                  {editingAtividade ? 'Editar Atividade' : 'Nova Atividade'}
                </h2>
                <div className="space-y-4">
                  {!clienteId && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Cliente
                      </label>
                      <select
                        value={formData.clienteId}
                        onChange={(e) => setFormData({ ...formData, clienteId: e.target.value })}
                        className="input"
                      >
                        <option value="">Selecione um cliente (opcional)</option>
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
                      Tipo *
                    </label>
                    <select
                      required
                      value={formData.tipo}
                      onChange={(e) => setFormData({ ...formData, tipo: e.target.value as Atividade['tipo'] })}
                      className="input"
                    >
                      {tiposAtividade.map((tipo) => (
                        <option key={tipo.value} value={tipo.value}>
                          {tipo.label}
                        </option>
                      ))}
                    </select>
                  </div>
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
                        Data *
                      </label>
                      <input
                        type="date"
                        required
                        value={formData.data}
                        onChange={(e) => setFormData({ ...formData, data: e.target.value })}
                        className="input"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Hora
                      </label>
                      <input
                        type="time"
                        value={formData.hora}
                        onChange={(e) => setFormData({ ...formData, hora: e.target.value })}
                        className="input"
                      />
                    </div>
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
                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      id="concluida"
                      checked={formData.concluida}
                      onChange={(e) => setFormData({ ...formData, concluida: e.target.checked })}
                      className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                    />
                    <label htmlFor="concluida" className="ml-2 text-sm text-gray-700">
                      Marcar como concluída
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
                    {editingAtividade ? 'Salvar' : 'Criar'}
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


