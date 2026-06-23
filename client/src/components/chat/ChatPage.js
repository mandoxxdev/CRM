import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  FiSearch, FiPlus, FiUsers, FiSend, FiArrowLeft, FiMessageCircle, FiCheck,
  FiImage, FiX
} from 'react-icons/fi';
import { format, isToday, isYesterday, parseISO, isSameDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import {
  connectChatSocket, joinConversa, leaveConversa, emitTyping, resolveMediaUrl
} from '../../services/chatSocket';
import './Chat.css';

function formatMessageTime(dateStr) {
  if (!dateStr) return '';
  const d = parseISO(dateStr.replace(' ', 'T'));
  if (isToday(d)) return format(d, 'HH:mm');
  if (isYesterday(d)) return 'Ontem';
  return format(d, 'dd/MM/yy', { locale: ptBR });
}

function formatListTime(dateStr) {
  if (!dateStr) return '';
  const d = parseISO(dateStr.replace(' ', 'T'));
  if (isToday(d)) return format(d, 'HH:mm');
  if (isYesterday(d)) return 'Ontem';
  return format(d, 'dd/MM', { locale: ptBR });
}

function formatDateSeparator(dateStr) {
  if (!dateStr) return '';
  const d = parseISO(dateStr.replace(' ', 'T'));
  if (isToday(d)) return 'Hoje';
  if (isYesterday(d)) return 'Ontem';
  return format(d, 'dd/MM/yyyy', { locale: ptBR });
}

function showDateSeparator(mensagens, index) {
  if (index === 0) return true;
  const curr = parseISO(mensagens[index].created_at.replace(' ', 'T'));
  const prev = parseISO(mensagens[index - 1].created_at.replace(' ', 'T'));
  return !isSameDay(curr, prev);
}

function getInitials(name) {
  if (!name) return '?';
  return name.split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
}

function CreateGroupModal({ users, onClose, onCreate, loading }) {
  const [nome, setNome] = useState('');
  const [selected, setSelected] = useState([]);
  const [search, setSearch] = useState('');

  const filtered = users.filter((u) =>
    u.nome.toLowerCase().includes(search.toLowerCase()) ||
    (u.email || '').toLowerCase().includes(search.toLowerCase())
  );

  const toggle = (id) => {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  return (
    <div className="chat-modal-overlay" onClick={onClose}>
      <div className="chat-modal" onClick={(e) => e.stopPropagation()}>
        <h3>Novo grupo</h3>
        <input
          className="chat-input"
          placeholder="Nome do grupo"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          maxLength={120}
        />
        <div className="chat-modal-search">
          <FiSearch />
          <input
            placeholder="Buscar participantes..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="chat-modal-user-list">
          {filtered.map((u) => (
            <label key={u.id} className="chat-modal-user-item">
              <input
                type="checkbox"
                checked={selected.includes(u.id)}
                onChange={() => toggle(u.id)}
              />
              <span className="chat-avatar chat-avatar--sm">{getInitials(u.nome)}</span>
              <span>
                <strong>{u.nome}</strong>
                {u.cargo && <small>{u.cargo}</small>}
              </span>
            </label>
          ))}
        </div>
        <div className="chat-modal-actions">
          <button type="button" className="chat-btn chat-btn--ghost" onClick={onClose}>Cancelar</button>
          <button
            type="button"
            className="chat-btn chat-btn--primary"
            disabled={loading || !nome.trim() || selected.length < 1}
            onClick={() => onCreate(nome.trim(), selected)}
          >
            {loading ? 'Criando...' : 'Criar grupo'}
          </button>
        </div>
      </div>
    </div>
  );
}

function NewChatModal({ users, onClose, onSelect, loading }) {
  const [search, setSearch] = useState('');
  const filtered = users.filter((u) =>
    u.nome.toLowerCase().includes(search.toLowerCase()) ||
    (u.email || '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="chat-modal-overlay" onClick={onClose}>
      <div className="chat-modal" onClick={(e) => e.stopPropagation()}>
        <h3>Nova conversa</h3>
        <div className="chat-modal-search">
          <FiSearch />
          <input
            placeholder="Buscar usuário..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
          />
        </div>
        <div className="chat-modal-user-list">
          {filtered.length === 0 && (
            <p className="chat-empty-hint">Nenhum usuário encontrado</p>
          )}
          {filtered.map((u) => (
            <button
              key={u.id}
              type="button"
              className="chat-modal-user-item chat-modal-user-item--btn"
              disabled={loading}
              onClick={() => onSelect(u.id)}
            >
              <span className="chat-avatar chat-avatar--sm">{getInitials(u.nome)}</span>
              <span>
                <strong>{u.nome}</strong>
                {u.cargo && <small>{u.cargo}</small>}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

const ChatPage = () => {
  const { user } = useAuth();
  const [conversas, setConversas] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [mensagens, setMensagens] = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  const [searchConv, setSearchConv] = useState('');
  const [input, setInput] = useState('');
  const [loadingConv, setLoadingConv] = useState(true);
  const [loadingMsg, setLoadingMsg] = useState(false);
  const [sending, setSending] = useState(false);
  const [showNewChat, setShowNewChat] = useState(false);
  const [showGroup, setShowGroup] = useState(false);
  const [typingUser, setTypingUser] = useState(null);
  const [mobileShowChat, setMobileShowChat] = useState(false);
  const [error, setError] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [imagePreview, setImagePreview] = useState(null);
  const [imageFile, setImageFile] = useState(null);
  const [lightboxUrl, setLightboxUrl] = useState(null);

  const messagesEndRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const fileInputRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const activeIdRef = useRef(null);
  const skipScrollRef = useRef(false);

  const activeConversa = conversas.find((c) => c.id === activeId);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  const loadConversas = useCallback(async () => {
    try {
      const res = await api.get('/chat/conversas');
      setConversas(res.data.conversas || []);
      setError(null);
    } catch (e) {
      setError('Não foi possível carregar as conversas');
      console.error(e);
    } finally {
      setLoadingConv(false);
    }
  }, []);

  const loadUsuarios = useCallback(async () => {
    try {
      const res = await api.get('/chat/usuarios');
      setUsuarios(res.data.usuarios || []);
    } catch (e) {
      console.error(e);
    }
  }, []);

  const loadMensagens = useCallback(async (conversaId) => {
    setLoadingMsg(true);
    setHasMore(false);
    try {
      const res = await api.get(`/chat/conversas/${conversaId}/mensagens`, { params: { limit: 50 } });
      setMensagens(res.data.mensagens || []);
      setHasMore(!!res.data.hasMore);
      await api.put(`/chat/conversas/${conversaId}/lida`);
      setConversas((prev) =>
        prev.map((c) => (c.id === conversaId ? { ...c, nao_lidas: 0 } : c))
      );
      window.dispatchEvent(new CustomEvent('chat-unread-changed'));
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingMsg(false);
    }
  }, []);

  const loadOlderMessages = useCallback(async () => {
    if (!activeIdRef.current || loadingOlder || !hasMore || mensagens.length === 0) return;
    const oldestId = mensagens[0].id;
    setLoadingOlder(true);
    skipScrollRef.current = true;
    const container = messagesContainerRef.current;
    const prevHeight = container?.scrollHeight || 0;

    try {
      const res = await api.get(`/chat/conversas/${activeIdRef.current}/mensagens`, {
        params: { limit: 50, before: oldestId },
      });
      const older = res.data.mensagens || [];
      if (older.length > 0) {
        setMensagens((prev) => {
          const ids = new Set(prev.map((m) => m.id));
          return [...older.filter((m) => !ids.has(m.id)), ...prev];
        });
      }
      setHasMore(!!res.data.hasMore);
      requestAnimationFrame(() => {
        if (container) {
          container.scrollTop = container.scrollHeight - prevHeight;
        }
        skipScrollRef.current = false;
      });
    } catch (e) {
      console.error(e);
      skipScrollRef.current = false;
    } finally {
      setLoadingOlder(false);
    }
  }, [hasMore, loadingOlder, mensagens]);

  const handleMessagesScroll = useCallback(() => {
    const el = messagesContainerRef.current;
    if (!el || loadingOlder || !hasMore) return;
    if (el.scrollTop < 80) loadOlderMessages();
  }, [hasMore, loadOlderMessages, loadingOlder]);

  const selectConversa = useCallback((id) => {
    if (activeIdRef.current) leaveConversa(activeIdRef.current);
    activeIdRef.current = id;
    setActiveId(id);
    setMobileShowChat(true);
    joinConversa(id);
    loadMensagens(id);
  }, [loadMensagens]);

  useEffect(() => {
    loadConversas();
    loadUsuarios();
    const sock = connectChatSocket();

    const onNewMessage = (msg) => {
      if (msg.conversa_id === activeIdRef.current) {
        setMensagens((prev) => {
          if (prev.some((m) => m.id === msg.id)) return prev;
          return [...prev, msg];
        });
        api.put(`/chat/conversas/${msg.conversa_id}/lida`).catch(() => {});
        setTimeout(scrollToBottom, 50);
      }
      loadConversas();
      window.dispatchEvent(new CustomEvent('chat-unread-changed'));
    };

    const onConversaUpdated = () => loadConversas();

    const onTyping = ({ conversa_id, usuario_id, typing }) => {
      if (conversa_id === activeIdRef.current && usuario_id !== user?.id) {
        setTypingUser(typing ? usuario_id : null);
      }
    };

    const onMessageRead = () => {
      if (activeIdRef.current) {
        setMensagens((prev) =>
          prev.map((m) =>
            m.usuario_id === user?.id ? { ...m, lida_por_todos: true } : m
          )
        );
      }
    };

    sock?.on('nova_mensagem', onNewMessage);
    sock?.on('conversa_atualizada', onConversaUpdated);
    sock?.on('typing', onTyping);
    sock?.on('mensagem_lida', onMessageRead);

    return () => {
      sock?.off('nova_mensagem', onNewMessage);
      sock?.off('conversa_atualizada', onConversaUpdated);
      sock?.off('typing', onTyping);
      sock?.off('mensagem_lida', onMessageRead);
      if (activeIdRef.current) leaveConversa(activeIdRef.current);
    };
  }, [loadConversas, scrollToBottom, user?.id]);

  useEffect(() => {
    if (!skipScrollRef.current) scrollToBottom();
  }, [mensagens, scrollToBottom]);

  const handleSend = async () => {
    if (!activeId || sending) return;

    if (imageFile) {
      setSending(true);
      const legenda = input.trim();
      setInput('');
      emitTyping(activeId, false);
      try {
        const formData = new FormData();
        formData.append('imagem', imageFile);
        if (legenda) formData.append('legenda', legenda);
        const res = await api.post(`/chat/conversas/${activeId}/mensagens/imagem`, formData);
        const msg = res.data.mensagem;
        setMensagens((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
        setImageFile(null);
        setImagePreview(null);
        loadConversas();
      } catch (e) {
        setInput(legenda);
        console.error(e);
        alert('Não foi possível enviar a imagem');
      } finally {
        setSending(false);
      }
      return;
    }

    const text = input.trim();
    if (!text) return;
    setSending(true);
    setInput('');
    emitTyping(activeId, false);
    try {
      const res = await api.post(`/chat/conversas/${activeId}/mensagens`, { conteudo: text });
      const msg = res.data.mensagem;
      setMensagens((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
      loadConversas();
    } catch (e) {
      setInput(text);
      console.error(e);
    } finally {
      setSending(false);
    }
  };

  const handleImageSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!/^image\/(jpeg|jpg|png|gif|webp)$/i.test(file.type)) {
      alert('Use JPG, PNG, WebP ou GIF (máx. 10MB)');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      alert('Imagem muito grande. Máximo 10MB.');
      return;
    }
    setImageFile(file);
    const reader = new FileReader();
    reader.onloadend = () => setImagePreview(reader.result);
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const clearImagePreview = () => {
    setImageFile(null);
    setImagePreview(null);
  };

  const handleInputChange = (e) => {
    setInput(e.target.value);
    if (activeId) {
      emitTyping(activeId, true);
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => emitTyping(activeId, false), 2000);
    }
  };

  const startDirectChat = async (usuarioId) => {
    try {
      const res = await api.post('/chat/conversas/direta', { usuario_id: usuarioId });
      setShowNewChat(false);
      await loadConversas();
      selectConversa(res.data.conversa_id);
    } catch (e) {
      console.error(e);
    }
  };

  const createGroup = async (nome, membros) => {
    try {
      const res = await api.post('/chat/conversas/grupo', { nome, membros });
      setShowGroup(false);
      await loadConversas();
      selectConversa(res.data.conversa_id);
    } catch (e) {
      console.error(e);
    }
  };

  const filteredConversas = conversas.filter((c) =>
    (c.titulo || '').toLowerCase().includes(searchConv.toLowerCase()) ||
    (c.ultima_mensagem?.conteudo || '').toLowerCase().includes(searchConv.toLowerCase())
  );

  const typingName = typingUser
    ? usuarios.find((u) => u.id === typingUser)?.nome?.split(' ')[0] || 'Alguém'
    : null;

  return (
    <div className="chat-page">
      <aside className={`chat-sidebar ${mobileShowChat ? 'chat-sidebar--hidden-mobile' : ''}`}>
        <header className="chat-sidebar-header">
          <div className="chat-sidebar-title">
            <FiMessageCircle />
            <h1>Chat Orion</h1>
          </div>
          <div className="chat-sidebar-actions">
            <button type="button" className="chat-icon-btn" title="Nova conversa" onClick={() => setShowNewChat(true)}>
              <FiPlus />
            </button>
            <button type="button" className="chat-icon-btn" title="Novo grupo" onClick={() => setShowGroup(true)}>
              <FiUsers />
            </button>
          </div>
        </header>

        <div className="chat-search">
          <FiSearch />
          <input
            placeholder="Buscar conversas..."
            value={searchConv}
            onChange={(e) => setSearchConv(e.target.value)}
          />
        </div>

        <div className="chat-conv-list">
          {loadingConv && <div className="chat-loading">Carregando conversas...</div>}
          {error && <div className="chat-error">{error}</div>}
          {!loadingConv && filteredConversas.length === 0 && (
            <div className="chat-empty-state">
              <FiMessageCircle size={48} />
              <p>Nenhuma conversa ainda</p>
              <button type="button" className="chat-btn chat-btn--primary" onClick={() => setShowNewChat(true)}>
                Iniciar conversa
              </button>
            </div>
          )}
          {filteredConversas.map((c) => (
            <button
              key={c.id}
              type="button"
              className={`chat-conv-item ${activeId === c.id ? 'active' : ''}`}
              onClick={() => selectConversa(c.id)}
            >
              <span className={`chat-avatar ${c.tipo === 'grupo' ? 'chat-avatar--group' : ''}`}>
                {c.tipo === 'grupo' ? <FiUsers /> : getInitials(c.titulo)}
              </span>
              <span className="chat-conv-body">
                <span className="chat-conv-top">
                  <strong>{c.titulo}</strong>
                  <time>{formatListTime(c.ultima_mensagem?.created_at || c.updated_at)}</time>
                </span>
                <span className="chat-conv-bottom">
                  <span className="chat-conv-preview">
                    {c.ultima_mensagem
                      ? (c.ultima_mensagem.tipo === 'sistema'
                        ? c.ultima_mensagem.conteudo
                        : `${c.ultima_mensagem.autor_nome?.split(' ')[0] || ''}: ${c.ultima_mensagem.conteudo}`)
                      : 'Sem mensagens'}
                  </span>
                  {c.nao_lidas > 0 && (
                    <span className="chat-unread-badge">{c.nao_lidas > 99 ? '99+' : c.nao_lidas}</span>
                  )}
                </span>
              </span>
            </button>
          ))}
        </div>
      </aside>

      <main className={`chat-main ${!mobileShowChat ? 'chat-main--hidden-mobile' : ''}`}>
        {!activeConversa ? (
          <div className="chat-welcome">
            <div className="chat-welcome-icon">
              <FiMessageCircle size={64} />
            </div>
            <h2>Chat interno Orion</h2>
            <p>Selecione uma conversa ou inicie um novo bate-papo com sua equipe.</p>
            <div className="chat-welcome-actions">
              <button type="button" className="chat-btn chat-btn--primary" onClick={() => setShowNewChat(true)}>
                <FiPlus /> Nova conversa
              </button>
              <button type="button" className="chat-btn chat-btn--ghost" onClick={() => setShowGroup(true)}>
                <FiUsers /> Criar grupo
              </button>
            </div>
          </div>
        ) : (
          <>
            <header className="chat-header">
              <button
                type="button"
                className="chat-back-btn"
                onClick={() => setMobileShowChat(false)}
                aria-label="Voltar"
              >
                <FiArrowLeft />
              </button>
              <span className={`chat-avatar ${activeConversa.tipo === 'grupo' ? 'chat-avatar--group' : ''}`}>
                {activeConversa.tipo === 'grupo' ? <FiUsers /> : getInitials(activeConversa.titulo)}
              </span>
              <div className="chat-header-info">
                <strong>{activeConversa.titulo}</strong>
                {activeConversa.tipo === 'grupo' && (
                  <small>{activeConversa.participantes?.length || 0} participantes</small>
                )}
                {typingName && <small className="chat-typing">{typingName} está digitando...</small>}
              </div>
            </header>

            <div
              className="chat-messages"
              ref={messagesContainerRef}
              onScroll={handleMessagesScroll}
            >
              {loadingOlder && (
                <div className="chat-loading chat-loading--top">Carregando mensagens antigas...</div>
              )}
              {loadingMsg && <div className="chat-loading">Carregando mensagens...</div>}
              {mensagens.map((m, index) => {
                const isOwn = m.usuario_id === user?.id;
                const isSystem = m.tipo === 'sistema';
                const dateSep = showDateSeparator(mensagens, index);

                if (isSystem) {
                  return (
                    <React.Fragment key={m.id}>
                      {dateSep && (
                        <div className="chat-date-separator">
                          <span>{formatDateSeparator(m.created_at)}</span>
                        </div>
                      )}
                      <div className="chat-system-msg">
                        <span>{m.conteudo}</span>
                        <time>{formatMessageTime(m.created_at)}</time>
                      </div>
                    </React.Fragment>
                  );
                }

                const isImage = m.tipo === 'imagem' && m.anexo_url;

                return (
                  <React.Fragment key={m.id}>
                    {dateSep && (
                      <div className="chat-date-separator">
                        <span>{formatDateSeparator(m.created_at)}</span>
                      </div>
                    )}
                    <div className={`chat-bubble-row ${isOwn ? 'own' : 'other'}`}>
                      {!isOwn && (
                        <span className="chat-bubble-author">{m.autor_nome}</span>
                      )}
                      <div className={`chat-bubble ${isOwn ? 'chat-bubble--own' : 'chat-bubble--other'} ${isImage ? 'chat-bubble--image' : ''}`}>
                        {isImage && (
                          <button
                            type="button"
                            className="chat-image-thumb-wrap"
                            onClick={() => setLightboxUrl(resolveMediaUrl(m.anexo_url))}
                            aria-label="Ampliar imagem"
                          >
                            <img
                              src={resolveMediaUrl(m.anexo_url)}
                              alt={m.anexo_nome || 'Imagem'}
                              className="chat-image-thumb"
                              loading="lazy"
                            />
                          </button>
                        )}
                        {m.conteudo && <p className={isImage ? 'chat-image-caption' : ''}>{m.conteudo}</p>}
                        <span className="chat-bubble-meta">
                          <time>{formatMessageTime(m.created_at)}</time>
                          {isOwn && (
                            <span className={`chat-read ${m.lida_por_todos ? 'read' : ''}`} title={m.lida_por_todos ? 'Lida' : 'Enviada'}>
                              <FiCheck /><FiCheck />
                            </span>
                          )}
                        </span>
                      </div>
                    </div>
                  </React.Fragment>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            {imagePreview && (
              <div className="chat-image-preview-bar">
                <img src={imagePreview} alt="Pré-visualização" />
                <button type="button" className="chat-icon-btn" onClick={clearImagePreview} aria-label="Remover imagem">
                  <FiX />
                </button>
              </div>
            )}

            <footer className="chat-composer">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                className="chat-file-input"
                onChange={handleImageSelect}
              />
              <button
                type="button"
                className="chat-attach-btn"
                onClick={() => fileInputRef.current?.click()}
                title="Enviar imagem"
                aria-label="Enviar imagem"
              >
                <FiImage />
              </button>
              <input
                className="chat-composer-input"
                placeholder={imageFile ? 'Legenda (opcional)...' : 'Digite uma mensagem...'}
                value={input}
                onChange={handleInputChange}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                maxLength={4000}
              />
              <button
                type="button"
                className="chat-send-btn"
                onClick={handleSend}
                disabled={(!input.trim() && !imageFile) || sending}
                aria-label="Enviar"
              >
                <FiSend />
              </button>
            </footer>
          </>
        )}
      </main>

      {showNewChat && (
        <NewChatModal
          users={usuarios}
          onClose={() => setShowNewChat(false)}
          onSelect={startDirectChat}
        />
      )}
      {showGroup && (
        <CreateGroupModal
          users={usuarios}
          onClose={() => setShowGroup(false)}
          onCreate={createGroup}
        />
      )}

      {lightboxUrl && (
        <div className="chat-lightbox" onClick={() => setLightboxUrl(null)} role="dialog" aria-label="Visualizar imagem">
          <button type="button" className="chat-lightbox-close" onClick={() => setLightboxUrl(null)} aria-label="Fechar">
            <FiX />
          </button>
          <img src={lightboxUrl} alt="Imagem ampliada" onClick={(e) => e.stopPropagation()} />
        </div>
      )}
    </div>
  );
};

export default ChatPage;
