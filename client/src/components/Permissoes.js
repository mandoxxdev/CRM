import React, { useState, useEffect } from 'react';
import api from '../services/api';
import { FiShield, FiUser, FiUsers, FiSave, FiPlus, FiTrash2, FiEdit, FiX, FiCheck, FiXCircle, FiCheckCircle } from 'react-icons/fi';
import './Permissoes.css';

const Permissoes = () => {
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState('grupos'); // 'grupos' ou 'usuarios'
  const [usuarios, setUsuarios] = useState([]);
  const [grupos, setGrupos] = useState([]);
  const [selectedGrupo, setSelectedGrupo] = useState(null);
  const [selectedUsuario, setSelectedUsuario] = useState('');
  const [permissoesGrupo, setPermissoesGrupo] = useState([]);
  const [usuariosGrupo, setUsuariosGrupo] = useState([]);
  const [mostrarModalGrupo, setMostrarModalGrupo] = useState(false);
  const [mostrarModalUsuarios, setMostrarModalUsuarios] = useState(false);
  const [formGrupo, setFormGrupo] = useState({ nome: '', descricao: '', ativo: true });
  const [modulosSelecionados, setModulosSelecionados] = useState({});
  const [mensagem, setMensagem] = useState(null);

  const modulos = [
    { value: 'clientes', label: 'Clientes', icon: '👥' },
    { value: 'propostas', label: 'Propostas', icon: '📄' },
    { value: 'projetos', label: 'Projetos', icon: '💼' },
    { value: 'produtos', label: 'Produtos', icon: '📦' },
    { value: 'atividades', label: 'Atividades', icon: '📅' },
    { value: 'custos_viagens', label: 'Custos de Viagens', icon: '💰' },
    { value: 'usuarios', label: 'Usuários', icon: '👤' },
    { value: 'relatorios', label: 'Relatórios', icon: '📊' },
    { value: 'oportunidades', label: 'Oportunidades', icon: '🎯' },
    { value: 'maquinas_vendidas', label: 'Máquinas Vendidas', icon: '🏭' },
    { value: 'configuracoes', label: 'Configurações', icon: '⚙️' },
  ];

  const acoes = [
    { value: 'visualizar', label: 'Visualizar' },
    { value: 'criar', label: 'Criar' },
    { value: 'editar', label: 'Editar' },
    { value: 'excluir', label: 'Excluir' },
    { value: 'aprovar', label: 'Aprovar' },
  ];

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (selectedGrupo) {
      loadPermissoesGrupo(selectedGrupo.id);
      loadUsuariosGrupo(selectedGrupo.id);
    }
  }, [selectedGrupo]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [usuariosRes, gruposRes] = await Promise.all([
        api.get('/usuarios'),
        api.get('/permissoes/grupos')
      ]);
      setUsuarios(usuariosRes.data || []);
      setGrupos(gruposRes.data || []);
    } catch (error) {
      console.error('Erro ao carregar dados:', error);
      setMensagem({ tipo: 'erro', texto: 'Erro ao carregar dados' });
    } finally {
      setLoading(false);
    }
  };

  const loadPermissoesGrupo = async (grupoId) => {
    try {
      const response = await api.get(`/permissoes/grupos/${grupoId}/permissoes`);
      setPermissoesGrupo(response.data || []);
    } catch (error) {
      console.error('Erro ao carregar permissões do grupo:', error);
      setPermissoesGrupo([]);
    }
  };

  const loadUsuariosGrupo = async (grupoId) => {
    try {
      const response = await api.get(`/permissoes/grupos/${grupoId}/usuarios`);
      setUsuariosGrupo(response.data || []);
    } catch (error) {
      console.error('Erro ao carregar usuários do grupo:', error);
      setUsuariosGrupo([]);
    }
  };

  const handleNovoGrupo = () => {
    setSelectedGrupo(null);
    setFormGrupo({ nome: '', descricao: '', ativo: true });
    setModulosSelecionados({});
    setMostrarModalGrupo(true);
  };

  const handleEditarGrupo = async (grupo) => {
    setSelectedGrupo(grupo);
    setFormGrupo({
      nome: grupo.nome,
      descricao: grupo.descricao || '',
      ativo: grupo.ativo !== 0 && grupo.ativo !== false
    });
    
    // Carregar permissões do grupo para preencher módulos selecionados
    try {
      const response = await api.get(`/permissoes/grupos/${grupo.id}/permissoes`);
      const permissoes = response.data || [];
      const modulosSelec = {};
      
      modulos.forEach(mod => {
        acoes.forEach(acao => {
          const temPerm = permissoes.find(
            p => p.modulo === mod.value && p.acao === acao.value && p.permissao === 1
          );
          if (temPerm) {
            if (!modulosSelec[mod.value]) {
              modulosSelec[mod.value] = {};
            }
            modulosSelec[mod.value][acao.value] = true;
          }
        });
      });
      
      setModulosSelecionados(modulosSelec);
    } catch (error) {
      console.error('Erro ao carregar permissões:', error);
      setModulosSelecionados({});
    }
    
    setMostrarModalGrupo(true);
  };

  const toggleModuloAcao = (modulo, acao, checked) => {
    setModulosSelecionados(prev => {
      const novo = { ...prev };
      if (!novo[modulo]) {
        novo[modulo] = {};
      }
      if (checked) {
        novo[modulo][acao] = true;
      } else {
        delete novo[modulo][acao];
        if (Object.keys(novo[modulo]).length === 0) {
          delete novo[modulo];
        }
      }
      return novo;
    });
  };

  const toggleTodasAcoesModuloModal = (modulo, todasMarcadas) => {
    setModulosSelecionados(prev => {
      const novo = { ...prev };
      if (todasMarcadas) {
        novo[modulo] = {};
        acoes.forEach(acao => {
          novo[modulo][acao.value] = true;
        });
      } else {
        delete novo[modulo];
      }
      return novo;
    });
  };

  const moduloTemTodasAcoes = (modulo) => {
    return acoes.every(acao => modulosSelecionados[modulo]?.[acao.value]);
  };

  const moduloTemAlgumaAcao = (modulo) => {
    return acoes.some(acao => modulosSelecionados[modulo]?.[acao.value]);
  };

  const handleSalvarGrupo = async () => {
    try {
      let grupoId;
      
      if (selectedGrupo && selectedGrupo.id) {
        await api.put(`/permissoes/grupos/${selectedGrupo.id}`, formGrupo);
        grupoId = selectedGrupo.id;
        setMensagem({ tipo: 'sucesso', texto: 'Grupo atualizado com sucesso!' });
      } else {
        const response = await api.post('/permissoes/grupos', formGrupo);
        grupoId = response.data.id;
        setMensagem({ tipo: 'sucesso', texto: 'Grupo criado com sucesso!' });
      }

      // Salvar permissões dos módulos selecionados
      if (grupoId) {
        const promises = [];
        
        // Criar permissões para módulos selecionados
        Object.keys(modulosSelecionados).forEach(modulo => {
          Object.keys(modulosSelecionados[modulo]).forEach(acao => {
            if (modulosSelecionados[modulo][acao]) {
              promises.push(
                api.post('/permissoes', {
                  usuario_id: null,
                  grupo_id: grupoId,
                  modulo,
                  acao,
                  permissao: true,
                  restricao_cliente_id: null,
                  restricao_regiao: null
                })
              );
            }
          });
        });
        
        await Promise.all(promises);
      }

      await loadData();
      
      // Selecionar o grupo salvo
      if (grupoId) {
        const gruposRes = await api.get('/permissoes/grupos');
        const grupoSalvo = gruposRes.data.find(g => g.id === grupoId);
        if (grupoSalvo) {
          setSelectedGrupo(grupoSalvo);
          loadPermissoesGrupo(grupoId);
        }
      }
      
      setTimeout(() => setMensagem(null), 3000);
      setMostrarModalGrupo(false);
    } catch (error) {
      console.error('Erro ao salvar grupo:', error);
      setMensagem({ tipo: 'erro', texto: error.response?.data?.error || 'Erro ao salvar grupo' });
    }
  };

  const handleExcluirGrupo = async (grupo) => {
    if (!window.confirm(`Tem certeza que deseja excluir o grupo "${grupo.nome}"?`)) {
      return;
    }

    try {
      await api.delete(`/permissoes/grupos/${grupo.id}`);
      setMensagem({ tipo: 'sucesso', texto: 'Grupo excluído com sucesso!' });
      setTimeout(() => setMensagem(null), 3000);
      setSelectedGrupo(null);
      loadData();
    } catch (error) {
      console.error('Erro ao excluir grupo:', error);
      setMensagem({ tipo: 'erro', texto: 'Erro ao excluir grupo' });
    }
  };

  const togglePermissaoModulo = async (modulo, acao, permitido) => {
    if (!selectedGrupo) return;

    try {
      await api.post('/permissoes', {
        usuario_id: null,
        grupo_id: selectedGrupo.id,
        modulo,
        acao,
        permissao: permitido,
        restricao_cliente_id: null,
        restricao_regiao: null
      });
      loadPermissoesGrupo(selectedGrupo.id);
    } catch (error) {
      console.error('Erro ao atualizar permissão:', error);
    }
  };

  const toggleTodasAcoesModulo = async (modulo, marcar) => {
    if (!selectedGrupo) return;

    try {
      // Criar/atualizar todas as ações do módulo de uma vez
      const promises = acoes.map(acao => 
        api.post('/permissoes', {
          usuario_id: null,
          grupo_id: selectedGrupo.id,
          modulo,
          acao: acao.value,
          permissao: marcar,
          restricao_cliente_id: null,
          restricao_regiao: null
        })
      );
      
      await Promise.all(promises);
      // Aguardar um pouco para garantir que o backend processou
      setTimeout(() => {
        loadPermissoesGrupo(selectedGrupo.id);
      }, 100);
    } catch (error) {
      console.error('Erro ao atualizar permissões do módulo:', error);
      alert('Erro ao atualizar permissões. Tente novamente.');
    }
  };

  const todasAcoesMarcadas = (modulo) => {
    return acoes.every(acao => temPermissao(modulo, acao.value));
  };

  const algumaAcaoMarcada = (modulo) => {
    return acoes.some(acao => temPermissao(modulo, acao.value));
  };

  const temPermissao = (modulo, acao) => {
    const permissao = permissoesGrupo.find(
      p => p.modulo === modulo && p.acao === acao
    );
    return permissao && permissao.permissao === 1;
  };

  const handleAdicionarUsuario = async () => {
    if (!selectedGrupo || !selectedUsuario) return;

    try {
      await api.post(`/permissoes/grupos/${selectedGrupo.id}/usuarios`, {
        usuario_id: selectedUsuario
      });
      setMensagem({ tipo: 'sucesso', texto: 'Usuário adicionado ao grupo!' });
      setTimeout(() => setMensagem(null), 3000);
      setSelectedUsuario('');
      loadUsuariosGrupo(selectedGrupo.id);
      loadData();
    } catch (error) {
      console.error('Erro ao adicionar usuário:', error);
      setMensagem({ tipo: 'erro', texto: 'Erro ao adicionar usuário' });
    }
  };

  const handleRemoverUsuario = async (usuarioId) => {
    if (!selectedGrupo) return;

    try {
      await api.delete(`/permissoes/grupos/${selectedGrupo.id}/usuarios/${usuarioId}`);
      setMensagem({ tipo: 'sucesso', texto: 'Usuário removido do grupo!' });
      setTimeout(() => setMensagem(null), 3000);
      loadUsuariosGrupo(selectedGrupo.id);
      loadData();
    } catch (error) {
      console.error('Erro ao remover usuário:', error);
      setMensagem({ tipo: 'erro', texto: 'Erro ao remover usuário' });
    }
  };

  if (loading) {
    return (
      <div className="permissoes-loading">
        <div className="loading-spinner"></div>
        <p>Carregando permissões...</p>
      </div>
    );
  }

  return (
    <div className="permissoes">
      <div className="permissoes-header">
        <div>
          <h1><FiShield /> Grupos de Permissões</h1>
          <p>Gerencie grupos e defina quais módulos cada grupo pode acessar</p>
        </div>
        <button onClick={handleNovoGrupo} className="btn-primary">
          <FiPlus /> Novo Grupo
        </button>
      </div>

      {mensagem && (
        <div className={`mensagem ${mensagem.tipo}`}>
          {mensagem.texto}
        </div>
      )}

      <div className="permissoes-content">
        <div className="permissoes-sidebar">
          <h3>Grupos</h3>
          {grupos.length === 0 ? (
            <p className="sem-dados">Nenhum grupo criado</p>
          ) : (
            <div className="grupos-list">
              {grupos.map(grupo => (
                <div
                  key={grupo.id}
                  className={`grupo-item ${selectedGrupo?.id === grupo.id ? 'active' : ''}`}
                  onClick={() => setSelectedGrupo(grupo)}
                >
                  <div className="grupo-info">
                    <strong>{grupo.nome}</strong>
                    <span className={`status-badge ${grupo.ativo === 1 ? 'ativo' : 'inativo'}`}>
                      {grupo.ativo === 1 ? 'Ativo' : 'Inativo'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="permissoes-main">
          {!selectedGrupo ? (
            <div className="sem-selecao">
              <FiShield size={64} />
              <h2>Selecione um grupo para gerenciar permissões</h2>
              <p>Escolha um grupo no menu lateral ou crie um novo grupo</p>
            </div>
          ) : (
            <>
              <div className="grupo-header">
                <div>
                  <h2>{selectedGrupo.nome}</h2>
                </div>
                <div className="grupo-header-actions">
                  <button
                    onClick={() => handleEditarGrupo(selectedGrupo)}
                    className="btn-icon"
                    title="Editar grupo"
                  >
                    <FiEdit />
                  </button>
                  <button
                    onClick={() => setMostrarModalUsuarios(true)}
                    className="btn-secondary"
                  >
                    <FiUsers /> Usuários ({usuariosGrupo.length})
                  </button>
                </div>
              </div>

              <div className="permissoes-modulos">
                <h3>Permissões</h3>
                
                <div className="modulos-grid">
                  {modulos.map(modulo => {
                    const todasMarcadas = todasAcoesMarcadas(modulo.value);
                    return (
                      <div key={modulo.value} className="modulo-card">
                        <div className="modulo-header">
                          <span className="modulo-icon">{modulo.icon}</span>
                          <h4>{modulo.label}</h4>
                          <button
                            className="btn-marcar-todos"
                            onClick={() => toggleTodasAcoesModulo(modulo.value, !todasMarcadas)}
                            title={todasMarcadas ? "Desmarcar todas as ações" : "Marcar todas as ações"}
                          >
                            {todasMarcadas ? (
                              <>
                                <FiXCircle /> Desmarcar Todas
                              </>
                            ) : (
                              <>
                                <FiCheckCircle /> Marcar Todas
                              </>
                            )}
                          </button>
                        </div>
                        <div className="modulo-acoes">
                          {acoes.map(acao => {
                            const temPerm = temPermissao(modulo.value, acao.value);
                            return (
                              <div key={acao.value} className="acao-item">
                                <label>
                                  <input
                                    type="checkbox"
                                    checked={temPerm}
                                    onChange={(e) => togglePermissaoModulo(modulo.value, acao.value, e.target.checked)}
                                  />
                                  <span>{acao.label}</span>
                                </label>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Modal de Grupo */}
      {mostrarModalGrupo && (
        <div className="modal-overlay" onClick={() => setMostrarModalGrupo(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '1000px', maxHeight: '90vh', overflowY: 'auto' }}>
            <div className="modal-header">
              <h2><FiShield /> {selectedGrupo ? 'Editar' : 'Novo'} Grupo</h2>
              <button className="modal-close" onClick={() => setMostrarModalGrupo(false)}>
                <FiX />
              </button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>Nome do Grupo *</label>
                <input
                  type="text"
                  value={formGrupo.nome}
                  onChange={(e) => setFormGrupo({ ...formGrupo, nome: e.target.value })}
                  placeholder="Ex: Vendedores, Gerentes, etc."
                />
              </div>

              <div className="form-group">
                <label>Descrição</label>
                <textarea
                  value={formGrupo.descricao}
                  onChange={(e) => setFormGrupo({ ...formGrupo, descricao: e.target.value })}
                  placeholder="Descreva o propósito deste grupo"
                  rows="3"
                />
              </div>

              <div className="form-group">
                <label style={{ marginBottom: '1rem', display: 'block', fontWeight: 600, fontSize: '1.1rem' }}>
                  Módulos e Permissões
                </label>
                <p style={{ color: '#64748b', fontSize: '0.9rem', marginBottom: '1rem' }}>
                  Selecione os módulos e ações que este grupo poderá acessar
                </p>
                <div className="modulos-selecao">
                  {modulos.map(modulo => {
                    const todasMarcadas = moduloTemTodasAcoes(modulo.value);
                    const algumaMarcada = moduloTemAlgumaAcao(modulo.value);
                    return (
                      <div key={modulo.value} className="modulo-selecao-card">
                        <div className="modulo-selecao-header">
                          <span className="modulo-icon">{modulo.icon}</span>
                          <h5>{modulo.label}</h5>
                          <button
                            type="button"
                            className="btn-marcar-todos-small"
                            onClick={() => toggleTodasAcoesModuloModal(modulo.value, !todasMarcadas)}
                            title={todasMarcadas ? "Desmarcar todas" : "Marcar todas"}
                          >
                            {todasMarcadas ? (
                              <>
                                <FiXCircle /> Desmarcar
                              </>
                            ) : (
                              <>
                                <FiCheckCircle /> Marcar Todas
                              </>
                            )}
                          </button>
                        </div>
                        <div className="acoes-selecao">
                          {acoes.map(acao => {
                            const checked = modulosSelecionados[modulo.value]?.[acao.value] || false;
                            return (
                              <label key={acao.value} className="acao-selecao-item">
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={(e) => toggleModuloAcao(modulo.value, acao.value, e.target.checked)}
                                />
                                <span>{acao.label}</span>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="form-group grupo-ativo-section">
                <div className="grupo-ativo-container">
                  <label className="grupo-ativo-label">
                    <input
                      type="checkbox"
                      checked={formGrupo.ativo}
                      onChange={(e) => setFormGrupo({ ...formGrupo, ativo: e.target.checked })}
                      className="grupo-ativo-checkbox"
                    />
                    <span className="grupo-ativo-text">Grupo Ativo</span>
                  </label>
                  <small className="grupo-ativo-hint">
                    Grupos inativos não terão permissões aplicadas aos usuários
                  </small>
                </div>
              </div>

              <div className="form-actions">
                <button onClick={() => setMostrarModalGrupo(false)} className="btn-secondary">
                  Cancelar
                </button>
                <button onClick={handleSalvarGrupo} className="btn-primary" disabled={!formGrupo.nome}>
                  <FiSave /> Salvar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Usuários do Grupo */}
      {mostrarModalUsuarios && selectedGrupo && (
        <div className="modal-overlay" onClick={() => setMostrarModalUsuarios(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '600px' }}>
            <div className="modal-header">
              <h2><FiUsers /> Usuários do Grupo: {selectedGrupo.nome}</h2>
              <button className="modal-close" onClick={() => setMostrarModalUsuarios(false)}>
                <FiX />
              </button>
            </div>
            <div className="modal-body">
              <div className="adicionar-usuario">
                <select
                  value={selectedUsuario}
                  onChange={(e) => setSelectedUsuario(e.target.value)}
                  className="select-usuario"
                >
                  <option value="">Selecione um usuário</option>
                  {usuarios
                    .filter(u => !usuariosGrupo.find(ug => ug.id === u.id))
                    .map(usuario => (
                      <option key={usuario.id} value={usuario.id}>
                        {usuario.nome} ({usuario.email})
                      </option>
                    ))}
                </select>
                <button
                  onClick={handleAdicionarUsuario}
                  className="btn-primary"
                  disabled={!selectedUsuario}
                >
                  <FiPlus /> Adicionar
                </button>
              </div>

              <div className="usuarios-lista">
                <h4>Usuários no Grupo ({usuariosGrupo.length})</h4>
                {usuariosGrupo.length === 0 ? (
                  <p className="sem-dados">Nenhum usuário no grupo</p>
                ) : (
                  <div className="usuarios-grid">
                    {usuariosGrupo.map(usuario => (
                      <div key={usuario.id} className="usuario-item">
                        <div>
                          <strong>{usuario.nome}</strong>
                          <small>{usuario.email}</small>
                        </div>
                        <button
                          onClick={() => handleRemoverUsuario(usuario.id)}
                          className="btn-icon btn-danger"
                          title="Remover"
                        >
                          <FiXCircle />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Permissoes;
