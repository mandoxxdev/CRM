import { io } from 'socket.io-client';

let socket = null;
// Etapa 132 (Fase 2 I2): o token com que o socket nasceu. O logout nao recarrega a pagina; sem isto o socket de quem saiu
// seguia na aba de quem entrou depois (o tempo real do anterior, e o aviso de sessao encerrada dele deslogando o novo).
let tokenDoSocket = null;

export function getSocketURL() {
  if (process.env.REACT_APP_SOCKET_URL) {
    return process.env.REACT_APP_SOCKET_URL;
  }
  if (process.env.REACT_APP_API_URL) {
    return process.env.REACT_APP_API_URL.replace(/\/api\/?$/, '');
  }
  if (process.env.NODE_ENV === 'production') {
    return typeof window !== 'undefined' ? window.location.origin : '';
  }
  const hostname = window.location.hostname;
  const protocol = window.location.protocol;
  if (hostname !== 'localhost' && hostname !== '127.0.0.1' && hostname !== '') {
    return `${protocol}//${hostname}:5000`;
  }
  return 'http://localhost:5000';
}

function getToken() {
  return localStorage.getItem('token') || sessionStorage.getItem('token');
}

/**
 * Etapa 132 (C271, RN-07): o servidor recusa no handshake quem ficou sem linha ativa (`connect_error` com
 * `data.code = 'USUARIO_INATIVO'`) e derruba o socket aberto de quem foi desativado ou apagado, avisando antes com
 * `sessao_encerrada`. Sai como o 401 da 131 (`services/api.js`): limpa a sessao e vai para `/login?sessao_encerrada=1`.
 * So se o socket ainda for o da aba — o aviso do socket do usuario anterior nao desloga quem entrou depois.
 */
function sairPorSessaoEncerrada(tokenDele) {
  if (tokenDele !== getToken()) return;
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  sessionStorage.removeItem('token');
  window.location.href = '/login?sessao_encerrada=1';
}

export function connectChatSocket() {
  const token = getToken();
  if (!token) return null;

  // Etapa 132 (Fase 2 I2): outro token na aba (outro usuario entrou sem recarregar) -> o socket velho sai e nasce outro.
  if (socket && tokenDoSocket !== token) disconnectChatSocket();

  if (socket?.connected) return socket;

  if (socket) {
    socket.auth = { token };
    socket.connect();
    return socket;
  }

  socket = io(getSocketURL(), {
    path: '/socket.io',
    auth: { token },
    transports: ['websocket', 'polling'],
    reconnection: true,
  });
  tokenDoSocket = token;
  socket.on('sessao_encerrada', () => sairPorSessaoEncerrada(token));
  socket.on('connect_error', (err) => {
    if (err && err.data && err.data.code === 'USUARIO_INATIVO') sairPorSessaoEncerrada(token);
  });

  return socket;
}

export function getChatSocket() {
  return socket?.connected ? socket : connectChatSocket();
}

export function disconnectChatSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
  tokenDoSocket = null;
}

export function joinConversa(conversaId) {
  const s = getChatSocket();
  if (s && conversaId) s.emit('join_conversa', conversaId);
}

export function leaveConversa(conversaId) {
  const s = getChatSocket();
  if (s && conversaId) s.emit('leave_conversa', conversaId);
}

export function emitTyping(conversaId, typing) {
  const s = getChatSocket();
  if (s && conversaId) s.emit('typing', { conversa_id: conversaId, typing });
}

export function resolveMediaUrl(path) {
  if (!path) return '';
  if (path.startsWith('http')) return path;
  const base = getSocketURL();
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}
