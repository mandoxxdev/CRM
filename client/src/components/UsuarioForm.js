import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../services/api';
import { FiUsers, FiShield, FiCheck, FiX } from 'react-icons/fi';
import './UsuarioForm.css';

const UsuarioForm = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [loadingGrupos, setLoadingGrupos] = useState(false);
  const [grupos, setGrupos] = useState([]);
  const [permissoes, setPermissoes] = useState([]);
  const [formData, setFormData] = useState({
    nome: '',
    email: '',
    senha: '',
    confirmarSenha: '',
    cargo: '',
    role: 'usuario',
    ativo: 1,
    pode_aprovar_descontos: 0,
    setor: '',
    departamento: '',
    flag_vendedor: 0,
    flag_compras: 0,
    flag_ti: 0,
  });

  const [modulosSelecionados, setModulosSelecionados] = useState([]);

  const todosModulos = [
    { value: 'comercial', label: 'Comercial', descricao: 'Gestão de vendas, propostas e oportunidades' },
    { value: 'compras', label: 'Compras', descricao: 'Gestão de fornecedores, pedidos e cotações' },
    { value: 'financeiro', label: 'Financeiro', descricao: 'Contas a pagar/receber, fluxo de caixa e bancos' },
    { value: 'operacional', label: 'Operacional', descricao: 'Gestão de projetos e atividades' },
    { value: 'engenharia', label: 'Engenharia', descricao: 'Cálculos e utilitários de engenharia' },
    { value: 'engenharia_projetos', label: 'Engenharia / Projetos', descricao: 'Solicitações (cesta), cadastro e OS (projetos)' },
    { value: 'relatorios', label: 'Relatórios', descricao: 'Análises e relatórios executivos' },
    { value: 'administrativo', label: 'Administrativo', descricao: 'Configurações e gestão do sistema' },
    { value: 'admin', label: 'Admin', descricao: 'Gestão de usuários e permissões' },
  ];

  const acoes = [
    { value: 'visualizar', label: 'Visualizar' },
    { value: 'criar', label: 'Criar' },
    { value: 'editar', label: 'Editar' },
    { value: 'excluir', label: 'Excluir' },
    { value: 'aprovar', label: 'Aprovar' },
  ];

  const loadUsuario = async () => {
    try {
      console.log('🔄 Carregando usuário com ID:', id);
      const response = await api.get(`/usuarios/${id}`);
      console.log('📥 Resposta da API:', response.data);
      
      if (!response.data) {
        console.error('❌ Nenhum dado retornado da API');
        alert('Erro ao carregar dados do usuário');
        return;
      }
      
      const usuarioData = {
        nome: response.data.nome || '',
        email: response.data.email || '',
        cargo: response.data.cargo || '',
        role: response.data.role || 'usuario',
        senha: '',
        confirmarSenha: '',
        ativo: response.data.ativo !== undefined ? response.data.ativo : 1,
        pode_aprovar_descontos: response.data.pode_aprovar_descontos !== undefined ? response.data.pode_aprovar_descontos : 0,
        setor: response.data.setor || '',
        departamento: response.data.departamento || '',
        flag_vendedor: response.data.flag_vendedor ? 1 : 0,
        flag_compras: response.data.flag_compras ? 1 : 0,
        flag_ti: response.data.flag_ti ? 1 : 0,
      };
      
      console.log('📝 Dados do usuário a serem definidos:', usuarioData);
      setFormData(usuarioData);
      
      // Carregar módulos permitidos do usuário
      if (id) {
        try {
          const permissoesRes = await api.get(`/usuarios/${id}/grupos`);
          const { permissoes } = permissoesRes.data;
          console.log('📥 Permissões carregadas (todas):', permissoes);
          
          if (permissoes && permissoes.length > 0) {
            // Filtrar apenas permissões diretas do usuário (onde grupo_id é NULL)
            // e permissões de grupos que tenham permissao = 1
            const permissoesDiretas = permissoes.filter(p => p.grupo_id === null && p.permissao === 1);
            console.log('📥 Permissões diretas do usuário:', permissoesDiretas);
            
            // Se houver permissões diretas, usar apenas elas (prioridade)
            // Caso contrário, usar permissões de grupos
            const permissoesParaUsar = permissoesDiretas.length > 0 
              ? permissoesDiretas 
              : permissoes.filter(p => p.permissao === 1);
            
            const modulosPermitidos = [...new Set(permissoesParaUsar.map(p => p.modulo))];
            console.log('📦 Módulos permitidos carregados:', modulosPermitidos);
            setModulosSelecionados(modulosPermitidos);
          } else {
            console.log('⚠️ Nenhuma permissão encontrada para o usuário');
            setModulosSelecionados([]);
          }
        } catch (error) {
          console.error('❌ Erro ao carregar permissões:', error);
          setModulosSelecionados([]);
        }
      }
    } catch (error) {
      console.error('Erro ao carregar usuário:', error);
    }
  };

  const loadGrupos = async () => {
    setLoadingGrupos(true);
    try {
      const response = await api.get(`/usuarios/${id}/grupos`);
      setGrupos(response.data.grupos || []);
      setPermissoes(response.data.permissoes || []);
    } catch (error) {
      console.error('Erro ao carregar grupos:', error);
    } finally {
      setLoadingGrupos(false);
    }
  };

  useEffect(() => {
    if (id) {
      loadUsuario();
      loadGrupos();
    } else {
      setModulosSelecionados([]);
    }
  }, [id]);

  useEffect(() => {
    // Se for admin, selecionar todos os módulos automaticamente
    if (formData.role === 'admin') {
      setModulosSelecionados(todosModulos.map(m => m.value));
    } else if (id && modulosSelecionados.length === todosModulos.length && formData.role !== 'admin') {
      // Se não é mais admin, limpar seleção
      setModulosSelecionados([]);
    }
  }, [formData.role]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? (checked ? 1 : 0) : value
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Validações
    if (!id && !formData.senha) {
      alert('A senha é obrigatória para novos usuários');
      return;
    }

    if (!id && formData.senha !== formData.confirmarSenha) {
      alert('As senhas não coincidem');
      return;
    }

    if (formData.senha && formData.senha.length < 6) {
      alert('A senha deve ter pelo menos 6 caracteres');
      return;
    }

    setLoading(true);

    try {
      const dataToSend = {
        nome: formData.nome.trim(),
        email: formData.email.trim().toLowerCase(),
        cargo: formData.cargo?.trim() || '',
        role: formData.role || 'usuario',
        ativo: formData.ativo !== undefined ? formData.ativo : 1,
        pode_aprovar_descontos: formData.pode_aprovar_descontos !== undefined ? formData.pode_aprovar_descontos : 0,
        setor: formData.setor?.trim() || '',
        departamento: formData.departamento?.trim() || '',
        flag_vendedor: formData.flag_vendedor ? 1 : 0,
        flag_compras: formData.flag_compras ? 1 : 0,
        flag_ti: formData.flag_ti ? 1 : 0,
      };
      
      console.log('📤 Dados a serem enviados:', dataToSend);
      console.log('📦 Módulos selecionados:', modulosSelecionados);
      console.log('📋 Estado formData:', formData);

      // Só enviar senha se foi preenchida
      if (formData.senha && formData.senha.length >= 6) {
        dataToSend.senha = formData.senha;
      }

      let userId = id;
      
      console.log('🆔 ID do usuário:', id);
      console.log('📝 Modulos selecionados antes de salvar:', modulosSelecionados);
      
      if (id) {
        console.log('✏️ Atualizando usuário existente:', id);
        await api.put(`/usuarios/${id}`, dataToSend);
        userId = id;
        console.log('✅ Usuário atualizado, ID:', userId);
      } else {
        // Para novo usuário, senha é obrigatória
        if (!dataToSend.senha || dataToSend.senha.length < 6) {
          alert('A senha é obrigatória e deve ter no mínimo 6 caracteres');
          setLoading(false);
          return;
        }
        const response = await api.post('/usuarios', dataToSend);
        userId = response.data.id || response.data.user?.id;
        console.log('Usuário criado:', response.data);
      }

      // Salvar permissões de módulos (apenas se não for admin)
      if (userId) {
        if (formData.role === 'admin') {
          console.log('ℹ️ Usuário é admin, não precisa salvar módulos (tem acesso a todos)');
        } else {
          try {
            console.log(`🗑️ Removendo permissões antigas do usuário ${userId}...`);
            console.log(`📦 Módulos selecionados para salvar:`, modulosSelecionados);
            console.log(`👤 Role do usuário:`, formData.role);
            
            // Remover todas as permissões de módulos existentes do usuário
            await api.delete(`/permissoes/usuario/${userId}/modulos`);
            console.log('✅ Permissões antigas removidas');
            
            // Adicionar novas permissões para cada módulo selecionado
            if (modulosSelecionados && modulosSelecionados.length > 0) {
              console.log(`➕ Adicionando ${modulosSelecionados.length} módulos para o usuário ${userId}:`, modulosSelecionados);
              const permissoesPromises = modulosSelecionados.map(modulo => {
                console.log(`  → Salvando módulo: ${modulo}`);
                return api.post('/permissoes', {
                  usuario_id: userId,
                  grupo_id: null,
                  modulo: modulo,
                  acao: 'visualizar',
                  permissao: 1,
                  restricao_cliente_id: null,
                  restricao_regiao: null
                });
              });
              const resultados = await Promise.all(permissoesPromises);
              console.log('✅ Módulos salvos com sucesso:', resultados);
            } else {
              console.log('⚠️ Nenhum módulo selecionado - apenas removendo permissões antigas');
            }
          } catch (error) {
            console.error('❌ Erro ao salvar permissões:', error);
            console.error('❌ Detalhes do erro:', error.response?.data || error.message);
            console.error('❌ Stack trace:', error.stack);
            alert('Usuário salvo, mas houve erro ao salvar permissões de módulos. Tente editar novamente.');
          }
        }
      } else {
        console.log('⚠️ userId não definido, não é possível salvar módulos');
      }
      
      // Log para debug
      console.log('✅ Usuário salvo com sucesso:', {
        id: userId,
        pode_aprovar_descontos: formData.pode_aprovar_descontos,
        modulos: modulosSelecionados.length > 0 ? modulosSelecionados : 'nenhum (admin ou não selecionado)'
      });
      
      navigate('/admin');
    } catch (error) {
      console.error('Erro completo:', error);
      let errorMessage = 'Erro ao salvar usuário';
      
      if (error.response?.data) {
        if (error.response.data.error) {
          errorMessage = error.response.data.error;
        } else if (error.response.data.errors && error.response.data.errors.length > 0) {
          errorMessage = error.response.data.errors[0].msg || error.response.data.errors[0].message;
        }
      }
      
      alert(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="usuario-form">
      <div className="form-header">
        <h1>{id ? 'Editar Usuário' : 'Novo Usuário'}</h1>
        <button onClick={() => navigate('/admin')} className="btn-secondary">
          Cancelar
        </button>
      </div>

      <form onSubmit={handleSubmit} className="form">
        <div className="form-section">
          <h2>Informações Básicas</h2>
          <div className="form-grid">
            <div className="form-group">
              <label>Nome Completo *</label>
              <input
                type="text"
                name="nome"
                value={formData.nome}
                onChange={handleChange}
                required
              />
            </div>
            <div className="form-group">
              <label>E-mail *</label>
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                required
              />
            </div>
            <div className="form-group">
              <label>Cargo</label>
              <input
                type="text"
                name="cargo"
                value={formData.cargo}
                onChange={handleChange}
                placeholder="Ex: Vendedor, Gerente, etc."
              />
            </div>
            <div className="form-group">
              <label>Perfil *</label>
              <select
                name="role"
                value={formData.role}
                onChange={handleChange}
                required
              >
                <option value="usuario">Usuário</option>
                <option value="admin">Administrador</option>
              </select>
            </div>
          </div>
        </div>

        <div className="form-section">
          <h2>Senha</h2>
          <div className="form-grid">
            <div className="form-group">
              <label>{id ? 'Nova Senha (deixe em branco para manter)' : 'Senha *'}</label>
              <input
                type="password"
                name="senha"
                value={formData.senha}
                onChange={handleChange}
                required={!id}
                minLength={6}
                placeholder="Mínimo 6 caracteres"
              />
            </div>
            {!id && (
              <div className="form-group">
                <label>Confirmar Senha *</label>
                <input
                  type="password"
                  name="confirmarSenha"
                  value={formData.confirmarSenha}
                  onChange={handleChange}
                  required
                  minLength={6}
                />
              </div>
            )}
          </div>
        </div>

        <div className="form-section">
          <h2>Setor e Flags</h2>
          <p className="section-description">
            Defina o setor do usuário e quais “funções” ele representa para aparecer corretamente nos filtros (Vendedor/Compras/TI).
          </p>
          <div className="form-grid">
            <div className="form-group">
              <label>Setor</label>
              <input
                type="text"
                name="setor"
                value={formData.setor}
                onChange={handleChange}
                placeholder="Ex: Vendas, Compras, TI"
              />
            </div>
            <div className="form-group">
              <label>Departamento</label>
              <input
                type="text"
                name="departamento"
                value={formData.departamento}
                onChange={handleChange}
                placeholder="Opcional"
              />
            </div>
            <div className="form-group" style={{ display: 'flex', alignItems: 'flex-end' }}>
              <label className="checkbox-label" style={{ marginBottom: 0 }}>
                <input
                  type="checkbox"
                  name="flag_vendedor"
                  checked={formData.flag_vendedor === 1}
                  onChange={handleChange}
                />
                <span>Flag Vendedor</span>
              </label>
            </div>
            <div className="form-group" style={{ display: 'flex', alignItems: 'flex-end' }}>
              <label className="checkbox-label" style={{ marginBottom: 0 }}>
                <input
                  type="checkbox"
                  name="flag_compras"
                  checked={formData.flag_compras === 1}
                  onChange={handleChange}
                />
                <span>Flag Compras</span>
              </label>
            </div>
            <div className="form-group" style={{ display: 'flex', alignItems: 'flex-end' }}>
              <label className="checkbox-label" style={{ marginBottom: 0 }}>
                <input
                  type="checkbox"
                  name="flag_ti"
                  checked={formData.flag_ti === 1}
                  onChange={handleChange}
                />
                <span>Flag TI</span>
              </label>
            </div>
          </div>
        </div>

        <div className="form-section">
          <h2>Módulos de Acesso</h2>
          <p className="section-description">Selecione os módulos que este usuário terá acesso. Administradores têm acesso a todos os módulos automaticamente.</p>
          <div className="modulos-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem', marginTop: '1rem' }}>
            {todosModulos && todosModulos.length > 0 ? todosModulos.map(modulo => {
              const isSelected = modulosSelecionados.includes(modulo.value);
              const isDisabled = formData.role === 'admin';
              
              return (
                <div
                  key={modulo.value}
                  className={`modulo-card ${isSelected ? 'selected' : ''} ${isDisabled ? 'disabled' : ''}`}
                  onClick={() => {
                    if (!isDisabled) {
                      if (isSelected) {
                        setModulosSelecionados(prev => prev.filter(m => m !== modulo.value));
                      } else {
                        setModulosSelecionados(prev => [...prev, modulo.value]);
                      }
                    }
                  }}
                >
                  <div className="modulo-card-header">
                    <input
                      type="checkbox"
                      checked={isSelected || isDisabled}
                      disabled={isDisabled}
                      onChange={() => {
                        if (!isDisabled) {
                          if (isSelected) {
                            setModulosSelecionados(prev => prev.filter(m => m !== modulo.value));
                          } else {
                            setModulosSelecionados(prev => [...prev, modulo.value]);
                          }
                        }
                      }}
                    />
                    <div className="modulo-card-content">
                      <h3>{modulo.label}</h3>
                      <p>{modulo.descricao}</p>
                    </div>
                  </div>
                  {isDisabled && (
                    <span className="modulo-admin-badge">Acesso total (Admin)</span>
                  )}
                </div>
              );
            }) : <p style={{ padding: '20px', textAlign: 'center', color: '#666' }}>Nenhum módulo disponível</p>}
          </div>
          {formData.role === 'admin' && (
            <p className="admin-note">
              <FiShield /> Usuários administradores têm acesso automático a todos os módulos.
            </p>
          )}
        </div>

        {id && (
          <>
        <div className="form-section">
          <h2>Status e Permissões</h2>
          <div className="form-grid">
            <div className="form-group">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  name="ativo"
                  checked={formData.ativo === 1}
                  onChange={handleChange}
                />
                <span>Usuário ativo</span>
              </label>
            </div>
            <div className="form-group">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  name="pode_aprovar_descontos"
                  checked={formData.pode_aprovar_descontos === 1}
                  onChange={handleChange}
                />
                <span>Pode aprovar descontos</span>
              </label>
              <p className="field-hint">Este usuário receberá notificações de solicitações de aprovação de desconto</p>
            </div>
          </div>
        </div>

            <div className="form-section">
              <h2>
                <FiUsers /> Grupos e Permissões
              </h2>
              {loadingGrupos ? (
                <p>Carregando grupos...</p>
              ) : grupos.length === 0 ? (
                <div className="no-grupos">
                  <p>Este usuário não pertence a nenhum grupo.</p>
                  <p className="text-muted">Para adicionar grupos, acesse a página de Permissões.</p>
                </div>
              ) : (
                <div className="grupos-permissoes-container">
                  {grupos.map(grupo => {
                    const permissoesGrupo = permissoes.filter(p => p.grupo_id === grupo.id);
                    return (
                      <div key={grupo.id} className="grupo-permissoes-card">
                        <div className="grupo-permissoes-header">
                          <div>
                            <h3>
                              <FiShield /> {grupo.nome}
                            </h3>
                            {grupo.descricao && (
                              <p className="grupo-descricao">{grupo.descricao}</p>
                            )}
                          </div>
                        </div>
                        {permissoesGrupo.length === 0 ? (
                          <p className="sem-permissoes">Nenhuma permissão configurada neste grupo.</p>
                        ) : (
                          <div className="permissoes-grid">
                            {todosModulos.map(modulo => {
                              const permissoesModulo = permissoesGrupo.filter(
                                p => p.modulo === modulo.value && p.permissao === 1
                              );
                              if (permissoesModulo.length === 0) return null;
                              
                              return (
                                <div key={modulo.value} className="modulo-permissoes-item">
                                  <div className="modulo-header">
                                    <strong>{modulo.label}</strong>
                                  </div>
                                  <div className="acoes-list">
                                    {acoes.map(acao => {
                                      const temPermissao = permissoesModulo.some(
                                        p => p.acao === acao.value
                                      );
                                      return (
                                        <div
                                          key={acao.value}
                                          className={`acao-badge ${temPermissao ? 'permitido' : ''}`}
                                        >
                                          {temPermissao ? (
                                            <>
                                              <FiCheck /> {acao.label}
                                            </>
                                          ) : (
                                            <>
                                              <FiX /> {acao.label}
                                            </>
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}

        <div className="form-actions">
          <button type="submit" disabled={loading} className="btn-primary">
            {loading ? 'Salvando...' : id ? 'Atualizar Usuário' : 'Criar Usuário'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default UsuarioForm;

