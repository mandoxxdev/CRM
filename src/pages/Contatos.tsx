import { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { Plus, Search, Edit, Trash2, Phone, Mail, User } from 'lucide-react';
import { storage } from '../utils/storage';
import { formatPhone } from '../utils/format';
import { generateId } from '../utils/helpers';
import type { Contato } from '../types';

export default function Contatos() {
  const [searchParams] = useSearchParams();
  const clienteId = searchParams.get('clienteId');
  const [contatos, setContatos] = useState<Contato[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingContato, setEditingContato] = useState<Contato | null>(null);
  const [formData, setFormData] = useState({
    clienteId: clienteId || '',
    nome: '',
    cargo: '',
    email: '',
    telefone: '',
    observacoes: '',
  });

  useEffect(() => {
    loadContatos();
  }, [clienteId]);

  const loadContatos = () => {
    const allContatos = storage.contatos.getAll();
    if (clienteId) {
      setContatos(allContatos.filter(c => c.clienteId === clienteId));
    } else {
      setContatos(allContatos);
    }
  };

  const filteredContatos = contatos.filter(
    (contato) =>
      contato.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
      contato.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleOpenModal = (contato?: Contato) => {
    if (contato) {
      setEditingContato(contato);
      setFormData({
        clienteId: contato.clienteId,
        nome: contato.nome,
        cargo: contato.cargo || '',
        email: contato.email,
        telefone: contato.telefone,
        observacoes: contato.observacoes || '',
      });
    } else {
      setEditingContato(null);
      setFormData({
        clienteId: clienteId || '',
        nome: '',
        cargo: '',
        email: '',
        telefone: '',
        observacoes: '',
      });
    }
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setEditingContato(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const now = new Date().toISOString();

    if (editingContato) {
      storage.contatos.update(editingContato.id, formData);
    } else {
      if (!formData.clienteId) {
        alert('Selecione um cliente');
        return;
      }
      const novoContato: Contato = {
        id: generateId(),
        ...formData,
        dataCriacao: now,
      };
      storage.contatos.add(novoContato);
    }

    loadContatos();
    handleCloseModal();
  };

  const handleDelete = (id: string) => {
    if (confirm('Tem certeza que deseja excluir este contato?')) {
      storage.contatos.delete(id);
      loadContatos();
    }
  };

  const clientes = storage.clientes.getAll();

  return (
    <div>
      <div className="mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Contatos</h1>
          <p className="mt-2 text-gray-600">Gerencie os contatos dos seus clientes</p>
        </div>
        <button
          onClick={() => handleOpenModal()}
          className="btn-primary flex items-center justify-center gap-2"
        >
          <Plus size={20} />
          <span>Novo Contato</span>
        </button>
      </div>

      <div className="mb-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-5 w-5" />
          <input
            type="text"
            placeholder="Buscar contatos..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="input pl-10"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredContatos.map((contato) => {
          const cliente = clientes.find(c => c.id === contato.clienteId);
          return (
            <div key={contato.id} className="card hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <User className="text-primary-600" size={20} />
                    <p className="text-lg font-semibold text-gray-900">{contato.nome}</p>
                  </div>
                  {contato.cargo && (
                    <p className="text-sm text-gray-600">{contato.cargo}</p>
                  )}
                  {cliente && (
                    <Link
                      to={`/clientes/${cliente.id}`}
                      className="text-sm text-primary-600 hover:text-primary-700 mt-1 inline-block"
                    >
                      {cliente.nome}
                    </Link>
                  )}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleOpenModal(contato)}
                    className="p-2 text-gray-600 hover:text-primary-600 hover:bg-gray-100 rounded"
                  >
                    <Edit size={18} />
                  </button>
                  <button
                    onClick={() => handleDelete(contato.id)}
                    className="p-2 text-gray-600 hover:text-red-600 hover:bg-gray-100 rounded"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2 text-gray-600">
                  <Mail size={16} />
                  <span className="truncate">{contato.email}</span>
                </div>
                <div className="flex items-center gap-2 text-gray-600">
                  <Phone size={16} />
                  <span>{formatPhone(contato.telefone)}</span>
                </div>
                {contato.observacoes && (
                  <p className="text-xs text-gray-500 mt-2 line-clamp-2">{contato.observacoes}</p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {filteredContatos.length === 0 && (
        <div className="card text-center py-12">
          <p className="text-gray-500">
            {searchTerm ? 'Nenhum contato encontrado.' : 'Nenhum contato cadastrado ainda.'}
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
                  {editingContato ? 'Editar Contato' : 'Novo Contato'}
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
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Cargo
                    </label>
                    <input
                      type="text"
                      value={formData.cargo}
                      onChange={(e) => setFormData({ ...formData, cargo: e.target.value })}
                      className="input"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Email *
                    </label>
                    <input
                      type="email"
                      required
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      className="input"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Telefone *
                    </label>
                    <input
                      type="tel"
                      required
                      value={formData.telefone}
                      onChange={(e) => setFormData({ ...formData, telefone: e.target.value })}
                      className="input"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Observações
                    </label>
                    <textarea
                      value={formData.observacoes}
                      onChange={(e) => setFormData({ ...formData, observacoes: e.target.value })}
                      className="input"
                      rows={3}
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
                    {editingContato ? 'Salvar' : 'Criar'}
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


