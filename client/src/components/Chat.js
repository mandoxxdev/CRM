import React, { useState, useEffect, useRef } from 'react';
import { FiMessageCircle, FiX, FiSend, FiPaperclip, FiUsers, FiPlus, FiSearch, FiImage, FiFile } from 'react-icons/fi';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { registerServiceWorker, requestNotificationPermission, notifyNewMessage } from '../utils/pushNotifications';
import './Chat.css';

const Chat = ({ isOpen, onClose }) => {
  const { user } = useAuth();
  const [conversas, setConversas] = useState([]);
  const [conversaSelecionada, setConversaSelecionada] = useState(null);
  const [mensagens, setMensagens] = useState([]);
  const [novaMensagem, setNovaMensagem] = useState('');
  const [loading, setLoading] = useState(false);
  const [mostrarCriarGrupo, setMostrarCriarGrupo] = useState(false);
  const [novoGrupo, setNovoGrupo] = useState({ nome: '', descricao: '', participantes: [] });
  const [usuariosDisponiveis, setUsuariosDisponiveis] = useState([]);
  const [buscaUsuarios, setBuscaUsuarios] = useState('');
  const [mostrarParticipantes, setMostrarParticipantes] = useState(false);
  const [participantes, setParticipantes] = useState([]);
  const [arquivoSelecionado, setArquivoSelecionado] = useState(null);
  const [previewArquivo, setPreviewArquivo] = useState(null);
  const mensagensEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const intervaloRef = useRef(null);

  useEffect(() => {
    // Registrar Service Worker e solicitar permissão de notificação
    if (isOpen) {
      registerServiceWorker();
      requestNotificationPermission();
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      carregarConversas();
      // Polling para novas mensagens a cada 3 segundos
      intervaloRef.current = setInterval(async () => {
        if (conversaSelecionada) {
          carregarMensagens(conversaSelecionada.id, false);
        }
        // Verificar novas mensagens em todas as conversas
        await carregarConversas();
        // Verificar se há novas mensagens não lidas e notificar
        const conversasAtualizadas = await api.get('/chat/conversas').then(res => res.data);
        conversasAtualizadas.forEach(conv => {
          if (conv.nao_lidas > 0 && conv.id !== conversaSelecionada?.id) {
            // Buscar última mensagem para notificar
            api.get(`/chat/conversas/${conv.id}/mensagens?limit=1`)
              .then(res => {
                if (res.data.length > 0) {
                  const ultimaMsg = res.data[0];
                  if (ultimaMsg.usuario_id !== user.id) {
                    notifyNewMessage(ultimaMsg, conv);
                  }
                }
              })
              .catch(err => console.error('Erro ao verificar mensagens:', err));
          }
        });
      }, 3000);
    } else {
      if (intervaloRef.current) {
        clearInterval(intervaloRef.current);
      }
    }

    return () => {
      if (intervaloRef.current) {
        clearInterval(intervaloRef.current);
      }
    };
  }, [isOpen, conversaSelecionada]);

  useEffect(() => {
    scrollToBottom();
  }, [mensagens]);

  const scrollToBottom = () => {
    mensagensEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const carregarConversas = async () => {
    try {
      const response = await api.get('/chat/conversas');
      setConversas(response.data);
      return response.data;
    } catch (error) {
      console.error('Erro ao carregar conversas:', error);
      return [];
    }
  };

  const carregarMensagens = async (conversaId, mostrarNotificacao = false) => {
    try {
      const response = await api.get(`/chat/conversas/${conversaId}/mensagens`);
      const novasMensagens = response.data;
      
      // Verificar se há novas mensagens (não lidas pelo usuário atual)
      if (mostrarNotificacao && novasMensagens.length > 0 && conversaSelecionada) {
        const ultimaMensagem = novasMensagens[novasMensagens.length - 1];
        if (ultimaMensagem.usuario_id !== user.id && !ultimaMensagem.lida) {
          notifyNewMessage(ultimaMensagem, conversaSelecionada);
        }
      }
      
      setMensagens(novasMensagens);
      
      // Marcar como lidas se a conversa estiver selecionada
      if (conversaSelecionada?.id === conversaId) {
        await api.post(`/chat/conversas/${conversaId}/marcar-lidas`);
      }
    } catch (error) {
      console.error('Erro ao carregar mensagens:', error);
    }
  };

  const selecionarConversa = (conversa) => {
    setConversaSelecionada(conversa);
    carregarMensagens(conversa.id);
    carregarParticipantes(conversa.id);
  };

  const carregarParticipantes = async (conversaId) => {
    try {
      const response = await api.get(`/chat/conversas/${conversaId}/participantes`);
      setParticipantes(response.data);
    } catch (error) {
      console.error('Erro ao carregar participantes:', error);
    }
  };

  const enviarMensagem = async (e) => {
    e.preventDefault();
    if (!novaMensagem.trim() && !arquivoSelecionado) return;
    if (!conversaSelecionada) return;

    setLoading(true);
    try {
      const formData = new FormData();
      if (arquivoSelecionado) {
        formData.append('arquivo', arquivoSelecionado);
      }
      formData.append('mensagem', novaMensagem);
      
      await api.post(`/chat/conversas/${conversaSelecionada.id}/mensagens`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });

      setNovaMensagem('');
      setArquivoSelecionado(null);
      setPreviewArquivo(null);
      carregarMensagens(conversaSelecionada.id);
      carregarConversas();
    } catch (error) {
      console.error('Erro ao enviar mensagem:', error);
      alert('Erro ao enviar mensagem');
    } finally {
      setLoading(false);
    }
  };

  const criarConversaPrivada = async (usuarioId) => {
    try {
      const response = await api.post('/chat/conversas/privada', {
        outro_usuario_id: usuarioId
      });
      
      const conversa = conversas.find(c => c.id === response.data.id);
      if (conversa) {
        selecionarConversa(conversa);
      } else {
        carregarConversas();
      }
    } catch (error) {
      console.error('Erro ao criar conversa:', error);
    }
  };

  const criarGrupo = async () => {
    if (!novoGrupo.nome || novoGrupo.participantes.length === 0) {
      alert('Preencha o nome e adicione pelo menos um participante');
      return;
    }

    try {
      const response = await api.post('/chat/conversas/grupo', novoGrupo);
      setMostrarCriarGrupo(false);
      setNovoGrupo({ nome: '', descricao: '', participantes: [] });
      carregarConversas();
      // Selecionar o novo grupo
      setTimeout(() => {
        const novaConversa = conversas.find(c => c.id === response.data.id);
        if (novaConversa) {
          selecionarConversa(novaConversa);
        }
      }, 500);
    } catch (error) {
      console.error('Erro ao criar grupo:', error);
      alert('Erro ao criar grupo');
    }
  };

  const buscarUsuarios = async (search) => {
    try {
      const response = await api.get('/chat/usuarios', { params: { search } });
      setUsuariosDisponiveis(response.data.filter(u => u.id !== user.id));
    } catch (error) {
      console.error('Erro ao buscar usuários:', error);
    }
  };

  useEffect(() => {
    if (buscaUsuarios) {
      const timeout = setTimeout(() => buscarUsuarios(buscaUsuarios), 300);
      return () => clearTimeout(timeout);
    } else {
      setUsuariosDisponiveis([]);
    }
  }, [buscaUsuarios]);

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (file) {
      setArquivoSelecionado(file);
      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onloadend = () => {
          setPreviewArquivo(reader.result);
        };
        reader.readAsDataURL(file);
      } else {
        setPreviewArquivo(null);
      }
    }
  };

  const formatarData = (data) => {
    const agora = new Date();
    const mensagemData = new Date(data);
    const diff = agora - mensagemData;
    const minutos = Math.floor(diff / 60000);
    const horas = Math.floor(diff / 3600000);
    const dias = Math.floor(diff / 86400000);

    if (minutos < 1) return 'Agora';
    if (minutos < 60) return `${minutos}m`;
    if (horas < 24) return `${horas}h`;
    if (dias < 7) return `${dias}d`;
    return mensagemData.toLocaleDateString('pt-BR');
  };

  const formatarTamanhoArquivo = (bytes) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  if (!isOpen) return null;

  return (
    <div className="chat-overlay">
      <div className="chat-container">
        {/* Sidebar de Conversas */}
        <div className="chat-sidebar">
          <div className="chat-sidebar-header">
            <h3>Conversas</h3>
            <div className="chat-sidebar-actions">
              <button 
                className="chat-btn-icon" 
                onClick={() => setMostrarCriarGrupo(true)}
                title="Criar grupo"
              >
                <FiUsers />
              </button>
              <button className="chat-btn-icon" onClick={onClose} title="Fechar">
                <FiX />
              </button>
            </div>
          </div>

          <div className="chat-search">
            <FiSearch />
            <input
              type="text"
              placeholder="Buscar conversas..."
              value={buscaUsuarios}
              onChange={(e) => setBuscaUsuarios(e.target.value)}
            />
          </div>

          {/* Lista de Usuários para Conversa Privada */}
          {buscaUsuarios && usuariosDisponiveis.length > 0 && (
            <div className="chat-usuarios-lista">
              {usuariosDisponiveis.map(usuario => (
                <div
                  key={usuario.id}
                  className="chat-usuario-item"
                  onClick={() => {
                    criarConversaPrivada(usuario.id);
                    setBuscaUsuarios('');
                  }}
                >
                  <div className="chat-avatar">{usuario.nome.charAt(0).toUpperCase()}</div>
                  <div className="chat-usuario-info">
                    <div className="chat-usuario-nome">{usuario.nome}</div>
                    <div className="chat-usuario-email">{usuario.email}</div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Lista de Conversas */}
          <div className="chat-conversas-lista">
            {conversas.map(conversa => (
              <div
                key={conversa.id}
                className={`chat-conversa-item ${conversaSelecionada?.id === conversa.id ? 'active' : ''}`}
                onClick={() => selecionarConversa(conversa)}
              >
                <div className="chat-avatar">
                  {conversa.tipo === 'grupo' ? (
                    <FiUsers />
                  ) : (
                    conversa.outro_usuario?.nome?.charAt(0).toUpperCase() || '?'
                  )}
                </div>
                <div className="chat-conversa-info">
                  <div className="chat-conversa-header">
                    <span className="chat-conversa-nome">
                      {conversa.tipo === 'grupo' ? conversa.nome : (conversa.outro_usuario?.nome || 'Usuário')}
                    </span>
                    {conversa.ultima_mensagem_data && (
                      <span className="chat-conversa-data">
                        {formatarData(conversa.ultima_mensagem_data)}
                      </span>
                    )}
                  </div>
                  <div className="chat-conversa-preview">
                    {conversa.ultima_mensagem_texto && (
                      <>
                        {conversa.ultima_mensagem_usuario && (
                          <span className="chat-conversa-usuario">
                            {conversa.ultima_mensagem_usuario}:{' '}
                          </span>
                        )}
                        {conversa.ultima_mensagem_texto.length > 50
                          ? conversa.ultima_mensagem_texto.substring(0, 50) + '...'
                          : conversa.ultima_mensagem_texto}
                      </>
                    )}
                  </div>
                </div>
                {conversa.nao_lidas > 0 && (
                  <div className="chat-badge">{conversa.nao_lidas}</div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Área de Mensagens */}
        <div className="chat-main">
          {conversaSelecionada ? (
            <>
              <div className="chat-header">
                <div className="chat-header-info">
                  <div className="chat-avatar">
                    {conversaSelecionada.tipo === 'grupo' ? (
                      <FiUsers />
                    ) : (
                      conversaSelecionada.outro_usuario?.nome?.charAt(0).toUpperCase() || '?'
                    )}
                  </div>
                  <div>
                    <div className="chat-header-nome">
                      {conversaSelecionada.tipo === 'grupo'
                        ? conversaSelecionada.nome
                        : conversaSelecionada.outro_usuario?.nome || 'Usuário'}
                    </div>
                    {conversaSelecionada.tipo === 'grupo' && (
                      <div className="chat-header-descricao">
                        {participantes.length} participantes
                      </div>
                    )}
                  </div>
                </div>
                <div className="chat-header-actions">
                  {conversaSelecionada.tipo === 'grupo' && (
                    <button
                      className="chat-btn-icon"
                      onClick={() => setMostrarParticipantes(!mostrarParticipantes)}
                      title="Participantes"
                    >
                      <FiUsers />
                    </button>
                  )}
                  <button className="chat-btn-icon" onClick={onClose} title="Fechar">
                    <FiX />
                  </button>
                </div>
              </div>

              {/* Lista de Participantes (para grupos) */}
              {mostrarParticipantes && conversaSelecionada.tipo === 'grupo' && (
                <div className="chat-participantes">
                  <h4>Participantes</h4>
                  {participantes.map(p => (
                    <div key={p.id} className="chat-participante-item">
                      <div className="chat-avatar">{p.nome.charAt(0).toUpperCase()}</div>
                      <div>
                        <div className="chat-participante-nome">{p.nome}</div>
                        <div className="chat-participante-email">{p.email}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="chat-mensagens">
                {mensagens.map(mensagem => (
                  <div
                    key={mensagem.id}
                    className={`chat-mensagem ${mensagem.usuario_id === user.id ? 'own' : ''}`}
                  >
                    {mensagem.usuario_id !== user.id && (
                      <div className="chat-avatar">{mensagem.usuario_nome?.charAt(0).toUpperCase()}</div>
                    )}
                    <div className="chat-mensagem-content">
                      {mensagem.usuario_id !== user.id && (
                        <div className="chat-mensagem-usuario">{mensagem.usuario_nome}</div>
                      )}
                      {mensagem.tipo === 'imagem' && mensagem.arquivo_url && (
                        <img
                          src={`${api.defaults.baseURL}${mensagem.arquivo_url}`}
                          alt={mensagem.arquivo_nome}
                          className="chat-mensagem-imagem"
                        />
                      )}
                      {mensagem.tipo === 'arquivo' && (
                        <a
                          href={`${api.defaults.baseURL}${mensagem.arquivo_url}`}
                          download
                          className="chat-mensagem-arquivo"
                        >
                          <FiFile />
                          <div>
                            <div>{mensagem.arquivo_nome}</div>
                            <div className="chat-arquivo-tamanho">
                              {formatarTamanhoArquivo(mensagem.arquivo_tamanho)}
                            </div>
                          </div>
                        </a>
                      )}
                      {mensagem.mensagem && (
                        <div className="chat-mensagem-texto">{mensagem.mensagem}</div>
                      )}
                      <div className="chat-mensagem-meta">
                        {formatarData(mensagem.created_at)}
                        {mensagem.lida && mensagem.usuario_id === user.id && (
                          <span className="chat-mensagem-lida">✓✓</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
                <div ref={mensagensEndRef} />
              </div>

              {previewArquivo && (
                <div className="chat-preview-arquivo">
                  {arquivoSelecionado.type.startsWith('image/') ? (
                    <img src={previewArquivo} alt="Preview" />
                  ) : (
                    <div>
                      <FiFile />
                      <span>{arquivoSelecionado.name}</span>
                    </div>
                  )}
                  <button onClick={() => {
                    setArquivoSelecionado(null);
                    setPreviewArquivo(null);
                  }}>
                    <FiX />
                  </button>
                </div>
              )}

              <form className="chat-input-form" onSubmit={enviarMensagem}>
                <input
                  ref={fileInputRef}
                  type="file"
                  style={{ display: 'none' }}
                  onChange={handleFileSelect}
                />
                <button
                  type="button"
                  className="chat-btn-icon"
                  onClick={() => fileInputRef.current?.click()}
                  title="Anexar arquivo"
                >
                  <FiPaperclip />
                </button>
                <input
                  type="text"
                  className="chat-input"
                  placeholder="Digite uma mensagem..."
                  value={novaMensagem}
                  onChange={(e) => setNovaMensagem(e.target.value)}
                />
                <button type="submit" className="chat-btn-send" disabled={loading}>
                  <FiSend />
                </button>
              </form>
            </>
          ) : (
            <div className="chat-empty">
              <FiMessageCircle />
              <p>Selecione uma conversa ou crie uma nova</p>
            </div>
          )}
        </div>
      </div>

      {/* Modal Criar Grupo */}
      {mostrarCriarGrupo && (
        <div className="chat-modal-overlay" onClick={() => setMostrarCriarGrupo(false)}>
          <div className="chat-modal" onClick={(e) => e.stopPropagation()}>
            <div className="chat-modal-header">
              <h3>Criar Grupo</h3>
              <button onClick={() => setMostrarCriarGrupo(false)}>
                <FiX />
              </button>
            </div>
            <div className="chat-modal-body">
              <div className="chat-form-group">
                <label>Nome do Grupo</label>
                <input
                  type="text"
                  value={novoGrupo.nome}
                  onChange={(e) => setNovoGrupo({ ...novoGrupo, nome: e.target.value })}
                  placeholder="Ex: Equipe Projeto X"
                />
              </div>
              <div className="chat-form-group">
                <label>Descrição (opcional)</label>
                <textarea
                  value={novoGrupo.descricao}
                  onChange={(e) => setNovoGrupo({ ...novoGrupo, descricao: e.target.value })}
                  placeholder="Descrição do grupo..."
                  rows="3"
                />
              </div>
              <div className="chat-form-group">
                <label>Adicionar Participantes</label>
                <input
                  type="text"
                  placeholder="Buscar usuários..."
                  onChange={(e) => buscarUsuarios(e.target.value)}
                />
                {usuariosDisponiveis.length > 0 && (
                  <div className="chat-usuarios-lista">
                    {usuariosDisponiveis
                      .filter(u => !novoGrupo.participantes.includes(u.id))
                      .map(usuario => (
                        <div
                          key={usuario.id}
                          className="chat-usuario-item"
                          onClick={() => {
                            if (!novoGrupo.participantes.includes(usuario.id)) {
                              setNovoGrupo({
                                ...novoGrupo,
                                participantes: [...novoGrupo.participantes, usuario.id]
                              });
                            }
                          }}
                        >
                          <div className="chat-avatar">{usuario.nome.charAt(0).toUpperCase()}</div>
                          <div className="chat-usuario-info">
                            <div className="chat-usuario-nome">{usuario.nome}</div>
                            <div className="chat-usuario-email">{usuario.email}</div>
                          </div>
                          <FiPlus />
                        </div>
                      ))}
                  </div>
                )}
                {novoGrupo.participantes.length > 0 && (
                  <div className="chat-participantes-selecionados">
                    <h4>Participantes Selecionados:</h4>
                    {novoGrupo.participantes.map(pid => {
                      const usuario = usuariosDisponiveis.find(u => u.id === pid);
                      if (!usuario) return null;
                      return (
                        <div key={pid} className="chat-participante-tag">
                          {usuario.nome}
                          <button
                            onClick={() => {
                              setNovoGrupo({
                                ...novoGrupo,
                                participantes: novoGrupo.participantes.filter(id => id !== pid)
                              });
                            }}
                          >
                            <FiX />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
            <div className="chat-modal-footer">
              <button onClick={() => setMostrarCriarGrupo(false)}>Cancelar</button>
              <button onClick={criarGrupo} className="btn-premium btn-primary">
                Criar Grupo
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Chat;
