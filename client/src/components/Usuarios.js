import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { canDeleteUsers, canManageUsers, parseAdminModulos } from '../utils/systemPermissions';
import { toast } from 'react-toastify';
import { FiPlus, FiSearch, FiEdit, FiTrash2, FiUser, FiShield, FiDownload, FiStar, FiUserX, FiUserCheck } from 'react-icons/fi';
import { exportToExcel } from '../utils/exportExcel';
import { SkeletonTable } from './SkeletonLoader';
import './Usuarios.css';
import './Loading.css';

const Usuarios = ({ deferMs = 200 }) => {
  const { user: currentUser, loading: authLoading } = useAuth();
  const effectiveActor = currentUser;
  const podeGerenciar = canManageUsers(effectiveActor); // inativar / reativar
  const podeExcluir = canDeleteUsers(effectiveActor); // apagar definitivamente (super admin)
  const [usuarios, setUsuarios] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [excluindo, setExcluindo] = useState(null); // { usuario } | null — controla o modal
  const [transferToId, setTransferToId] = useState('');
  const [processando, setProcessando] = useState(false);

  useEffect(() => {
    if (authLoading) return;

    let cancelled = false;
    const timer = setTimeout(() => {
      if (!cancelled) loadUsuarios();
    }, deferMs);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [authLoading, effectiveActor?.id, effectiveActor?.is_superadmin, deferMs]);

  const loadUsuarios = async () => {
    setLoading(true);
    try {
      const response = await api.get('/usuarios', {
        params: { limit: 200, offset: 0 },
        timeout: 25000,
      });
      const usuariosFiltrados = (response.data || []).filter(
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

  // Inativar / reativar (ação reversível) — disponível para administradores.
  const handleToggleAtivo = async (usuario) => {
    const isSelf = String(usuario.id) === String(currentUser?.id);
    if (isSelf) return;

    const novoAtivo = usuario.ativo ? 0 : 1;
    const acao = novoAtivo ? 'reativar' : 'desativar';

    let confirmMsg = `Tem certeza que deseja ${acao} o usuário "${usuario.nome}"?`;
    if (!novoAtivo && usuario.is_superadmin) {
      confirmMsg = `O usuário "${usuario.nome}" é Super Administrador. Tem certeza que deseja desativá-lo?`;
    }

    if (window.confirm(confirmMsg)) {
      try {
        await api.patch(`/usuarios/${usuario.id}/status`, { ativo: novoAtivo });
        toast.success(`Usuário ${novoAtivo ? 'reativado' : 'desativado'} com sucesso!`);
        loadUsuarios();
      } catch (error) {
        toast.error(error.response?.data?.error || `Erro ao ${acao} usuário`);
      }
    }
  };

  // Abre o modal de exclusão definitiva (apenas super admin).
  const abrirExclusao = (usuario) => {
    if (String(usuario.id) === String(currentUser?.id)) return;
    // Destino padrão dos registros: o próprio super admin que está excluindo.
    setTransferToId(String(currentUser?.id || ''));
    setExcluindo(usuario);
  };

  const confirmarExclusao = async () => {
    if (!excluindo) return;
    if (!transferToId || String(transferToId) === String(excluindo.id)) {
      toast.error('Escolha um usuário válido para herdar os registros.');
      return;
    }
    setProcessando(true);
    try {
      await api.delete(`/usuarios/${excluindo.id}`, {
        data: { transferToId: Number(transferToId) },
      });
      toast.success('Usuário excluído com sucesso!');
      setExcluindo(null);
      loadUsuarios();
    } catch (error) {
      toast.error(error.response?.data?.error || 'Erro ao excluir usuário');
    } finally {
      setProcessando(false);
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
                      {podeGerenciar && String(usuario.id) !== String(currentUser?.id) && (
                        <button
                          onClick={() => handleToggleAtivo(usuario)}
                          className="btn-icon"
                          title={usuario.ativo ? 'Inativar usuário' : 'Reativar usuário'}
                        >
                          {usuario.ativo ? <FiUserX /> : <FiUserCheck />}
                        </button>
                      )}
                      {podeExcluir && String(usuario.id) !== String(currentUser?.id) && (
                        <button
                          onClick={() => abrirExclusao(usuario)}
                          className="btn-icon btn-danger"
                          title="Excluir definitivamente"
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

      {excluindo && (
        <div className="modal-overlay" onClick={() => !processando && setExcluindo(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2>Excluir usuário</h2>
            <p>
              Você está prestes a <strong>apagar definitivamente</strong> o usuário{' '}
              <strong>"{excluindo.nome}"</strong>. Esta ação não pode ser desfeita.
            </p>
            <p>
              Os registros de negócio vinculados a ele (propostas, leads, atividades, etc.)
              serão transferidos para:
            </p>
            <select
              value={transferToId}
              onChange={(e) => setTransferToId(e.target.value)}
              disabled={processando}
              style={{ width: '100%', padding: '8px', margin: '8px 0' }}
            >
              <option value="">Selecione um usuário...</option>
              {usuarios
                .filter((u) => u.ativo && String(u.id) !== String(excluindo.id))
                .map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.nome}
                    {String(u.id) === String(currentUser?.id) ? ' (você)' : ''}
                  </option>
                ))}
            </select>
            <div className="action-buttons" style={{ justifyContent: 'flex-end', marginTop: 16 }}>
              <button
                className="btn-secondary"
                onClick={() => setExcluindo(null)}
                disabled={processando}
              >
                Cancelar
              </button>
              <button
                className="btn-secondary btn-danger"
                onClick={confirmarExclusao}
                disabled={processando || !transferToId}
              >
                {processando ? 'Excluindo...' : 'Excluir definitivamente'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Usuarios;

