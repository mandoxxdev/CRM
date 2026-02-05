import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import { toast } from 'react-toastify';
import { FiPlus, FiSearch, FiEdit, FiTrash2, FiUser, FiShield, FiDownload } from 'react-icons/fi';
import { exportToExcel } from '../utils/exportExcel';
import { SkeletonTable } from './SkeletonLoader';
import './Usuarios.css';
import './Loading.css';

const Usuarios = () => {
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
      // Filtrar usuário "administrator" da lista
      const usuariosFiltrados = (response.data || []).filter(
        usuario => usuario.nome.toLowerCase() !== 'administrator' && 
                   usuario.email !== 'admin@gmp.com.br'
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

  const handleDelete = async (id) => {
    if (window.confirm('Tem certeza que deseja desativar este usuário?')) {
      try {
        await api.delete(`/usuarios/${id}`);
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
        'Perfil': usuario.role === 'admin' ? 'Administrador' : 'Usuário',
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
                <tr key={usuario.id}>
                  <td>
                    <div className="user-cell">
                      <div className="user-avatar">
                        <FiUser />
                      </div>
                      <span>{usuario.nome}</span>
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
                    <span className={`role-badge ${usuario.role === 'admin' ? 'admin' : 'user'}`}>
                      {usuario.role === 'admin' ? (
                        <>
                          <FiShield /> Administrador
                        </>
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
                      {usuario.role !== 'admin' && usuario.email !== 'admin@gmp.com.br' && (
                        <button
                          onClick={() => handleDelete(usuario.id)}
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

