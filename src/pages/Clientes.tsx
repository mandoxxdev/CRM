import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Search, Edit, Trash2, Phone, Mail, Building2, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { clienteService } from '../utils/dbService';
import { formatDateBR, formatPhone } from '../utils/format';
import { cnpjService } from '../utils/cnpjService';
import type { Cliente } from '../types';

export default function Clientes() {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingCliente, setEditingCliente] = useState<Cliente | null>(null);
  const [formData, setFormData] = useState({
    nome: '',
    razaoSocial: '',
    cnpj: '',
    empresa: '',
    email: '',
    telefone: '',
    endereco: '',
    cidade: '',
    estado: '',
    cep: '',
    pais: 'Brasil',
    observacoes: '',
  });
  const [buscandoCNPJ, setBuscandoCNPJ] = useState(false);
  const [erroCNPJ, setErroCNPJ] = useState('');
  const [sucessoCNPJ, setSucessoCNPJ] = useState(false);

  useEffect(() => {
    loadClientes();
  }, []);

  const loadClientes = async () => {
    try {
      const allClientes = await clienteService.getAll();
      setClientes(allClientes);
    } catch (error) {
      console.error('Erro ao carregar clientes:', error);
    }
  };

  const filteredClientes = clientes.filter(
    (cliente) =>
      cliente.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
      cliente.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (cliente.empresa && cliente.empresa.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const handleOpenModal = (cliente?: Cliente) => {
    if (cliente) {
      setEditingCliente(cliente);
      setFormData({
        nome: cliente.nome,
        razaoSocial: cliente.razaoSocial || '',
        cnpj: cliente.cnpj || '',
        empresa: cliente.empresa || '',
        email: cliente.email,
        telefone: cliente.telefone,
        endereco: cliente.endereco || '',
        cidade: cliente.cidade || '',
        estado: cliente.estado || '',
        cep: cliente.cep || '',
        pais: cliente.pais || 'Brasil',
        observacoes: cliente.observacoes || '',
      });
    } else {
      setEditingCliente(null);
      setFormData({
        nome: '',
        razaoSocial: '',
        cnpj: '',
        empresa: '',
        email: '',
        telefone: '',
        endereco: '',
        cidade: '',
        estado: '',
        cep: '',
        pais: 'Brasil',
        observacoes: '',
      });
    }
    setErroCNPJ('');
    setSucessoCNPJ(false);
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setEditingCliente(null);
  };

  const handleBuscarCNPJ = async () => {
    if (!formData.cnpj) {
      setErroCNPJ('Digite um CNPJ');
      return;
    }

    setBuscandoCNPJ(true);
    setErroCNPJ('');
    setSucessoCNPJ(false);

    try {
      const dados = await cnpjService.buscarPorCNPJ(formData.cnpj);

      if (dados) {
        // Preencher campos automaticamente
        setFormData({
          ...formData,
          razaoSocial: dados.razao_social || '',
          nome: dados.nome_fantasia || dados.razao_social || '',
          empresa: dados.nome_fantasia || dados.razao_social || '',
          cnpj: dados.cnpj.replace(/\D/g, '').replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5'),
          endereco: dados.logradouro 
            ? `${dados.logradouro}${dados.numero ? ', ' + dados.numero : ''}${dados.complemento ? ' - ' + dados.complemento : ''}${dados.bairro ? ' - ' + dados.bairro : ''}`
            : '',
          cidade: dados.municipio || '',
          estado: dados.uf || '',
          cep: dados.cep ? (typeof dados.cep === 'string' ? dados.cep.replace(/\D/g, '') : String(dados.cep)).replace(/(\d{5})(\d{3})/, '$1-$2') : '',
          telefone: dados.telefone ? dados.telefone.replace(/\D/g, '') : '',
          email: dados.email || '',
          pais: 'Brasil',
        });
        setSucessoCNPJ(true);
        setTimeout(() => setSucessoCNPJ(false), 3000);
      }
    } catch (error: any) {
      console.error('Erro completo:', error);
      
      let mensagemErro = 'Erro ao buscar dados do CNPJ';
      
      if (error.message) {
        mensagemErro = error.message;
      } else if (error.name === 'TypeError' && error.message.includes('fetch')) {
        mensagemErro = 'Erro de conexão. Verifique sua internet e tente novamente.';
      } else if (error.message?.includes('Failed to fetch')) {
        mensagemErro = 'Não foi possível conectar à API. Verifique sua conexão ou tente novamente mais tarde.';
      } else if (error.message?.includes('CORS')) {
        mensagemErro = 'Erro de permissão. Tente novamente ou preencha os dados manualmente.';
      } else if (error.message?.includes('timeout') || error.message?.includes('Tempo')) {
        mensagemErro = 'Tempo de espera esgotado. Tente novamente.';
      }
      
      setErroCNPJ(mensagemErro);
    } finally {
      setBuscandoCNPJ(false);
    }
  };

  const handleCNPJChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const valor = e.target.value.replace(/\D/g, '');
    let cnpjFormatado = valor;
    if (valor.length === 14) {
      cnpjFormatado = valor.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
    } else if (valor.length > 0) {
      // Formatação parcial enquanto digita
      cnpjFormatado = valor.replace(/^(\d{2})(\d{0,3})(\d{0,3})(\d{0,4})(\d{0,2})$/, (_match, p1, p2, p3, p4, p5) => {
        let resultado = p1;
        if (p2) resultado += '.' + p2;
        if (p3) resultado += '.' + p3;
        if (p4) resultado += '/' + p4;
        if (p5) resultado += '-' + p5;
        return resultado;
      });
    }
    setFormData({ ...formData, cnpj: cnpjFormatado });
    setErroCNPJ('');
    setSucessoCNPJ(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingCliente) {
        await clienteService.update(editingCliente.id, formData);
      } else {
        await clienteService.create(formData);
      }
      await loadClientes();
      handleCloseModal();
    } catch (error) {
      console.error('Erro ao salvar cliente:', error);
      alert('Erro ao salvar cliente');
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm('Tem certeza que deseja excluir este cliente?')) {
      try {
        await clienteService.delete(id);
        await loadClientes();
      } catch (error) {
        console.error('Erro ao excluir cliente:', error);
        alert('Erro ao excluir cliente');
      }
    }
  };

  return (
    <div>
      <div className="mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Clientes</h1>
          <p className="mt-2 text-gray-600">Gerencie seus clientes</p>
        </div>
        <button
          onClick={() => handleOpenModal()}
          className="btn-primary flex items-center justify-center gap-2"
        >
          <Plus size={20} />
          <span>Novo Cliente</span>
        </button>
      </div>

      <div className="mb-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-5 w-5" />
          <input
            type="text"
            placeholder="Buscar clientes..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="input pl-10"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredClientes.map((cliente) => (
          <div key={cliente.id} className="card hover:shadow-md transition-shadow">
            <div className="flex items-start justify-between mb-4">
              <div className="flex-1">
                <Link
                  to={`/clientes/${cliente.id}`}
                  className="text-lg font-semibold text-gray-900 hover:text-primary-600"
                >
                  {cliente.nome}
                </Link>
                {cliente.empresa && (
                  <p className="text-sm text-gray-600 mt-1">{cliente.empresa}</p>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => handleOpenModal(cliente)}
                  className="p-2 text-gray-600 hover:text-primary-600 hover:bg-gray-100 rounded"
                >
                  <Edit size={18} />
                </button>
                <button
                  onClick={() => handleDelete(cliente.id)}
                  className="p-2 text-gray-600 hover:text-red-600 hover:bg-gray-100 rounded"
                >
                  <Trash2 size={18} />
                </button>
              </div>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2 text-gray-600">
                <Mail size={16} />
                <span className="truncate">{cliente.email}</span>
              </div>
              <div className="flex items-center gap-2 text-gray-600">
                <Phone size={16} />
                <span>{formatPhone(cliente.telefone)}</span>
              </div>
              <p className="text-xs text-gray-500 mt-3">
                Criado em {formatDateBR(cliente.dataCriacao)}
              </p>
            </div>
          </div>
        ))}
      </div>

      {filteredClientes.length === 0 && (
        <div className="card text-center py-12">
          <p className="text-gray-500">
            {searchTerm ? 'Nenhum cliente encontrado.' : 'Nenhum cliente cadastrado ainda.'}
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
                  {editingCliente ? 'Editar Cliente' : 'Novo Cliente'}
                </h2>
                <div className="space-y-4">
                  {/* CNPJ com busca automática */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      CNPJ
                    </label>
                    <div className="flex gap-2">
                      <div className="flex-1 relative">
                        <Building2 className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
                        <input
                          type="text"
                          value={formData.cnpj}
                          onChange={handleCNPJChange}
                          placeholder="00.000.000/0000-00"
                          maxLength={18}
                          className="input pl-10"
                          disabled={buscandoCNPJ}
                        />
                      </div>
                      <button
                        type="button"
                        onClick={handleBuscarCNPJ}
                        disabled={buscandoCNPJ || !formData.cnpj}
                        className="btn-primary flex items-center gap-2 whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {buscandoCNPJ ? (
                          <>
                            <Loader2 size={18} className="animate-spin" />
                            Buscando...
                          </>
                        ) : (
                          <>
                            <Search size={18} />
                            Buscar
                          </>
                        )}
                      </button>
                    </div>
                    {erroCNPJ && (
                      <div className="mt-2 flex items-center gap-2 text-sm text-red-600">
                        <AlertCircle size={16} />
                        <span>{erroCNPJ}</span>
                      </div>
                    )}
                    {sucessoCNPJ && (
                      <div className="mt-2 flex items-center gap-2 text-sm text-green-600">
                        <CheckCircle size={16} />
                        <span>Dados encontrados e preenchidos automaticamente!</span>
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Razão Social
                    </label>
                    <input
                      type="text"
                      value={formData.razaoSocial}
                      onChange={(e) => setFormData({ ...formData, razaoSocial: e.target.value })}
                      className="input"
                      placeholder="Razão social da empresa"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Nome / Nome Fantasia *
                    </label>
                    <input
                      type="text"
                      required
                      value={formData.nome}
                      onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                      className="input"
                      placeholder="Nome do contato ou nome fantasia"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Empresa
                    </label>
                    <input
                      type="text"
                      value={formData.empresa}
                      onChange={(e) => setFormData({ ...formData, empresa: e.target.value })}
                      className="input"
                      placeholder="Nome comercial"
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
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Cidade
                      </label>
                      <input
                        type="text"
                        value={formData.cidade}
                        onChange={(e) => setFormData({ ...formData, cidade: e.target.value })}
                        className="input"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Estado
                      </label>
                      <input
                        type="text"
                        value={formData.estado}
                        onChange={(e) => setFormData({ ...formData, estado: e.target.value })}
                        className="input"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      CEP
                    </label>
                    <input
                      type="text"
                      value={formData.cep}
                      onChange={(e) => setFormData({ ...formData, cep: e.target.value })}
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
                    {editingCliente ? 'Salvar' : 'Criar'}
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


