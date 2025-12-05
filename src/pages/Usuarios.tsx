import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Plus, Search, Edit, Trash2, User, Shield, Lock, Eye, EyeOff } from 'lucide-react';
import { usuarioService } from '../utils/services/usuarioService';
import { useAuth, type UsuarioPublico } from '../contexts/AuthContext';
import { formatDateBR } from '../utils/format';
import type { Usuario } from '../types';

const perfis = [
  'Diretoria',
  'Comercial',
  'Eng_Processo',
  'Eng_Mecanica',
  'Eng_Eletrica',
  'Automacao',
  'PCP_Producao',
  'Financeiro',
  'Juridico',
  'Compliance',
  'Assistencia_Tecnica',
  'Cliente',
];

export default function Usuarios() {
  const { usuario: usuarioLogado } = useAuth();
  const [usuarios, setUsuarios] = useState<UsuarioPublico[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingUsuario, setEditingUsuario] = useState<UsuarioPublico | null>(null);
  const [formData, setFormData] = useState({
    nome: '',
    email: '',
    senha: '',
    confirmarSenha: '',
    perfil: 'Comercial' as Usuario['perfil'],
    ativo: true,
  });
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [erro, setErro] = useState('');

  // Verificar se é administrador
  const isAdmin = usuarioLogado?.perfil === 'Diretoria' && usuarioLogado?.email === 'matheus@gmp.ind.br';

  useEffect(() => {
    if (isAdmin) {
      loadUsuarios();
    }
  }, [isAdmin]);

  const loadUsuarios = async () => {
    try {
      const allUsuarios = await usuarioService.getAll();
      // Não mostrar senhaHash
      const usuariosSemSenha = allUsuarios.map(({ senhaHash, ...rest }) => rest as UsuarioPublico);
      setUsuarios(usuariosSemSenha);
    } catch (error) {
      console.error('Erro ao carregar usuários:', error);
    }
  };

  const filteredUsuarios = usuarios.filter(
    (usuario) =>
      usuario.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
      usuario.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      usuario.perfil.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleOpenModal = (usuario?: UsuarioPublico) => {
    if (usuario) {
      setEditingUsuario(usuario);
      setFormData({
        nome: usuario.nome,
        email: usuario.email,
        senha: '',
        confirmarSenha: '',
        perfil: usuario.perfil,
        ativo: usuario.ativo,
      });
    } else {
      setEditingUsuario(null);
      setFormData({
        nome: '',
        email: '',
        senha: '',
        confirmarSenha: '',
        perfil: 'Comercial',
        ativo: true,
      });
    }
    setErro('');
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setEditingUsuario(null);
    setErro('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro('');

    // Validações
    if (!editingUsuario && (!formData.senha || formData.senha.length < 6)) {
      setErro('A senha deve ter pelo menos 6 caracteres');
      return;
    }

    if (formData.senha && formData.senha !== formData.confirmarSenha) {
      setErro('As senhas não coincidem');
      return;
    }

    try {
      if (editingUsuario) {
        // Atualizar usuário
        const updates: any = {
          nome: formData.nome,
          perfil: formData.perfil,
          ativo: formData.ativo,
        };

        // Se senha foi preenchida, alterar
        if (formData.senha) {
          await usuarioService.alterarSenha(editingUsuario.id, formData.senha);
        }

        await usuarioService.update(editingUsuario.id, updates);
      } else {
        // Criar novo usuário
        await usuarioService.create({
          nome: formData.nome,
          email: formData.email,
          senha: formData.senha,
          perfil: formData.perfil,
          ativo: formData.ativo,
        });
      }

      await loadUsuarios();
      handleCloseModal();
    } catch (error: any) {
      console.error('Erro ao salvar usuário:', error);
      setErro(error.message || 'Erro ao salvar usuário');
    }
  };

  const handleDelete = async (id: string) => {
    // Não permitir deletar o próprio usuário ou o administrador
    if (id === usuarioLogado?.id) {
      alert('Você não pode excluir seu próprio usuário');
      return;
    }

    const usuario = usuarios.find(u => u.id === id);
    if (usuario?.email === 'matheus@gmp.ind.br') {
      alert('Não é possível excluir o usuário administrador');
      return;
    }

    if (confirm('Tem certeza que deseja excluir este usuário?')) {
      try {
        await usuarioService.delete(id);
        await loadUsuarios();
      } catch (error) {
        console.error('Erro ao excluir usuário:', error);
        alert('Erro ao excluir usuário');
      }
    }
  };

  if (!isAdmin) {
    return (
      <div className="card text-center py-12">
        <Shield className="mx-auto text-gray-400 mb-4" size={48} />
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Acesso Restrito</h2>
        <p className="text-gray-600">
          Apenas o administrador pode gerenciar usuários.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Usuários</h1>
          <p className="mt-2 text-gray-600">Gerencie os usuários do sistema</p>
        </div>
        <button
          onClick={() => handleOpenModal()}
          className="btn-primary flex items-center justify-center gap-2"
        >
          <Plus size={20} />
          <span>Novo Usuário</span>
        </button>
      </div>

      <div className="mb-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-5 w-5" />
          <input
            type="text"
            placeholder="Buscar usuários..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="input pl-10"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredUsuarios.map((usuario) => (
          <motion.div
            key={usuario.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="card hover:shadow-md transition-shadow"
          >
            <div className="flex items-start justify-between mb-4">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <User className="text-primary-600" size={20} />
                  <h3 className="text-lg font-semibold text-gray-900">{usuario.nome}</h3>
                  {usuario.perfil === 'Diretoria' && (
                    <Shield className="text-yellow-600" size={18} title="Administrador" />
                  )}
                </div>
                <p className="text-sm text-gray-600 mt-1">{usuario.email}</p>
                <span className="inline-block mt-2 px-2 py-1 text-xs font-medium bg-primary-100 text-primary-700 rounded">
                  {usuario.perfil}
                </span>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => handleOpenModal(usuario)}
                  className="p-2 text-gray-600 hover:text-primary-600 hover:bg-gray-100 rounded"
                >
                  <Edit size={18} />
                </button>
                {usuario.email !== 'matheus@gmp.ind.br' && usuario.id !== usuarioLogado?.id && (
                  <button
                    onClick={() => handleDelete(usuario.id)}
                    className="p-2 text-gray-600 hover:text-red-600 hover:bg-gray-100 rounded"
                  >
                    <Trash2 size={18} />
                  </button>
                )}
              </div>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className={`px-2 py-1 text-xs font-medium rounded ${
                usuario.ativo 
                  ? 'bg-green-100 text-green-700' 
                  : 'bg-gray-100 text-gray-700'
              }`}>
                {usuario.ativo ? 'Ativo' : 'Inativo'}
              </span>
              <span className="text-gray-500 text-xs">
                {formatDateBR(usuario.dataCriacao)}
              </span>
            </div>
          </motion.div>
        ))}
      </div>

      {filteredUsuarios.length === 0 && (
        <div className="card text-center py-12">
          <p className="text-gray-500">
            {searchTerm ? 'Nenhum usuário encontrado.' : 'Nenhum usuário cadastrado ainda.'}
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
                  {editingUsuario ? 'Editar Usuário' : 'Novo Usuário'}
                </h2>
                <div className="space-y-4">
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
                      Email *
                    </label>
                    <input
                      type="email"
                      required
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value.toLowerCase() })}
                      className="input"
                      disabled={!!editingUsuario}
                    />
                    {editingUsuario && (
                      <p className="text-xs text-gray-500 mt-1">O email não pode ser alterado</p>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {editingUsuario ? 'Nova Senha (deixe em branco para não alterar)' : 'Senha *'}
                    </label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
                      <input
                        type={mostrarSenha ? 'text' : 'password'}
                        required={!editingUsuario}
                        value={formData.senha}
                        onChange={(e) => setFormData({ ...formData, senha: e.target.value })}
                        placeholder={editingUsuario ? 'Deixe em branco para manter a senha atual' : 'Mínimo 6 caracteres'}
                        className="input pl-10 pr-10"
                        minLength={editingUsuario ? 0 : 6}
                      />
                      <button
                        type="button"
                        onClick={() => setMostrarSenha(!mostrarSenha)}
                        className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      >
                        {mostrarSenha ? <EyeOff size={20} /> : <Eye size={20} />}
                      </button>
                    </div>
                  </div>
                  {formData.senha && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Confirmar Senha *
                      </label>
                      <div className="relative">
                        <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
                        <input
                          type={mostrarSenha ? 'text' : 'password'}
                          required={!!formData.senha}
                          value={formData.confirmarSenha}
                          onChange={(e) => setFormData({ ...formData, confirmarSenha: e.target.value })}
                          placeholder="Digite a senha novamente"
                          className="input pl-10"
                        />
                      </div>
                    </div>
                  )}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Perfil *
                    </label>
                    <select
                      required
                      value={formData.perfil}
                      onChange={(e) => setFormData({ ...formData, perfil: e.target.value as Usuario['perfil'] })}
                      className="input"
                    >
                      {perfis.map((perfil) => (
                        <option key={perfil} value={perfil}>
                          {perfil.replace('_', ' ')}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      id="ativo"
                      checked={formData.ativo}
                      onChange={(e) => setFormData({ ...formData, ativo: e.target.checked })}
                      className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                    />
                    <label htmlFor="ativo" className="ml-2 text-sm text-gray-700">
                      Usuário ativo
                    </label>
                  </div>
                  {erro && (
                    <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                      {erro}
                    </div>
                  )}
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
                    {editingUsuario ? 'Salvar' : 'Criar'}
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

