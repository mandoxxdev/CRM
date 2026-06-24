import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { canDeleteUsers, parseAdminModulos, filterVisibleUsers, isSuperAdmin } from '../utils/systemPermissions';
import { toast } from 'react-toastify';
import { FiPlus, FiSearch, FiEdit, FiTrash2, FiUser, FiShield, FiDownload, FiStar, FiEyeOff } from 'react-icons/fi';
import { exportToExcel } from '../utils/exportExcel';
import { SkeletonTable } from './SkeletonLoader';
import './Usuarios.css';
import './Loading.css';

const Usuarios = () => {
  const { user: currentUser } = useAuth();
  const podeExcluir = canDeleteUsers(currentUser);
  const actorIsSuperAdmin = isSuperAdmin(currentUser);
  const [usuarios, setUsuarios] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    loadUsuarios();
  }, []);

  const loadUsuarios = async () => {
    setLoading(true);
    try {
      const response = await api.get('/usuarios');
      const visiveis = filterVisibleUsers(response.data || [], currentUser);
      const usuariosFiltrados = visiveis.filter(
        usuario => usuario.nome.toLowerCase() !== 'administrator'
      );
      setUsuarios(usuariosFiltrados);
    } catch (error) {
      console.error('Erro ao carregar usuários:', error);
      
      let errorMessage = 'Erro ao carregar usuários';
      
      if (!error.response) {
        // Erro de rede
        if (error.code === 'ECONNREFUSED' || error.message.includes('Network Error')) {
          errorMessage = 'Erro de conexão: O servidor não está rodando. Verifique se o servidor está na porta 5000 e tente novamente.';
        } else {
          errorMessage = `Erro de conexão: ${error.message}`;
        }
      } else {
        errorMessage = error.response?.data?.error || error.message || 'Erro ao carregar usuários';
      }
      
      toast.error(errorMessage);
      setUsuarios([]);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (usuario) => {
    const isSelf = String(usuario.id) === String(currentUser?.id);
    if (isSelf) return;

    let confirmMsg = `Tem certeza que deseja desativar o usuário "${usuario.nome}"?`;
    if (usuario.is_superadmin) {
      confirmMsg = `O usuário "${usuario.nome}" é Super Administrador. Tem certeza que deseja desativá-lo?`;
    }

    if (window.confirm(confirmMsg)) {
      try {
        await api.delete(`/usuarios/${usuario.id}`);
        toast.success('Usuário desativado com sucesso!');
        loadUsuarios();
      } catch (error) {
        toast.error(error.response?.data?.error || 'Erro ao desativar usuário');
      }
    }
  };

  const handleExportExcel = () => {
    try {
      const dadosExport = usuarios.map(usuario => ({
        'Nome': usuario.nome,
        'Email': usuario.email,
        'Grupos': usuario.grupos?.map(g => g.nome).join(', ') || 'Sem grupo',
        'Perfil': usuario.is_superadmin
          ? 'Super Administrador'
          : usuario.role === 'admin'
            ? 'Administrador'
            : parseAdminModulos(usuario.admin_modulos).length > 0
              ? `Usuário (+ admin: ${parseAdminModulos(usuario.admin_modulos).join(', ')})`
              : 'Usuário',
        'Status': usuario.ativo ? 'Ativo' : 'Inativo',
        'Cadastrado em': usuario.created_at ? new Date(usuario.created_at).toLocaleDateString('pt-BR') : ''
      }));
      
      exportToExcel(dadosExport, 'usuarios', 'Usuários');
      toast.success('Exportação realizada com sucesso!');
    } catch (error) {
      toast.error('Erro ao exportar dados');
      console.error('Erro ao exportar:', error);
    }
  };

  return (
    <div className="usuarios">
      <div className="page-header">
        <div>
          <h1>Usuários</h1>
          <p>Gestão de usuários do sistema</p>
        </div>
        <div className="header-actions">
          <button onClick={handleExportExcel} className="btn-secondary" title="Exportar para Excel (Ctrl+E)">
            <FiDownload /> Exportar Excel
          </button>
          <Link to="/admin/usuarios/novo" className="btn-premium">
            <div className="btn-premium-icon">
              <FiPlus size={20} />
            </div>
            <span className="btn-premium-text">Novo Usuário</span>
            <div className="btn-premium-shine"></div>
          </Link>
        </div>
      </div>

      <div className="filters">
        <div className="search-box">
          <FiSearch />
          <input
            type="text"
            placeholder="Buscar por nome ou email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {loading ? (
        <SkeletonTable rows={8} columns={7} />
      ) : (
        <div className="table-container">
          <table className="data-table">
          <thead>
            <tr>
              <th>Nome</th>
              <th>Email</th>
              <th>Grupo</th>
              <th>Perfil</th>
              <th>Status</th>
              <th>Cadastrado em</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {usuarios
              .filter(usuario => 
                !search || 
                usuario.nome.toLowerCase().includes(search.toLowerCase()) ||
                usuario.email.toLowerCase().includes(search.toLowerCase())
              )
              .length === 0 ? (
              <tr>
                <td colSpan="7" className="no-data">
                  Nenhum usuário encontrado
                </td>
              </tr>
            ) : (
              usuarios
                .filter(usuario => 
                  !search || 
                  usuario.nome.toLowerCase().includes(search.toLowerCase()) ||
                  usuario.email.toLowerCase().includes(search.toLowerCase())
                )
                .map(usuario => (
                <tr key={usuario.id} className={usuario.is_oculto ? 'usuario-fantasma' : ''}>
                  <td>
                    <div className="user-cell">
                      <div className={`user-avatar${usuario.is_oculto ? ' ghost' : ''}`}>
                        {usuario.is_oculto ? <FiEyeOff /> : <FiUser />}
                      </div>
                      <span>{usuario.nome}</span>
                      {actorIsSuperAdmin && usuario.is_oculto && (
                        <span className="ghost-badge" title="Usuário fantasma — visível apenas para Super Admin">
                          <FiEyeOff /> Fantasma
                        </span>
                      )}
                    </div>
                  </td>
                  <td>{usuario.email}</td>
                  <td>
                    {usuario.grupos && usuario.grupos.length > 0 ? (
                      <div className="grupos-cell">
                        {usuario.grupos.map((grupo) => (
                          <span key={grupo.id} className="grupo-badge">
                            {grupo.nome}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="sem-grupo">Sem grupo</span>
                    )}
                  </td>
                  <td>
                    <span className={`role-badge ${usuario.is_superadmin ? 'admin' : usuario.role === 'admin' ? 'admin' : 'user'}`}>
                      {usuario.is_superadmin ? (
                        <>
                          <FiStar /> Super Administrador
                        </>
                      ) : usuario.role === 'admin' ? (
                        <>
                          <FiShield /> Administrador
                        </>
                      ) : parseAdminModulos(usuario.admin_modulos).length > 0 ? (
                        <>Admin módulo: {parseAdminModulos(usuario.admin_modulos).join(', ')}</>
                      ) : (
                        'Usuário'
                      )}
                    </span>
                  </td>
                  <td>
                    <span className={`status-badge ${usuario.ativo ? 'ativo' : 'inativo'}`}>
                      {usuario.ativo ? 'Ativo' : 'Inativo'}
                    </span>
                  </td>
                  <td>
                    {new Date(usuario.created_at).toLocaleDateString('pt-BR')}
                  </td>
                  <td>
                    <div className="action-buttons">
                      <Link to={`/admin/usuarios/editar/${usuario.id}`} className="btn-icon" title="Editar">
                        <FiEdit />
                      </Link>
                      {podeExcluir && String(usuario.id) !== String(currentUser?.id) && (
                        <button
                          onClick={() => handleDelete(usuario)}
                          className="btn-icon btn-danger"
                          title="Desativar"
                        >
                          <FiTrash2 />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      )}
    </div>
  );
};

export default Usuarios;

