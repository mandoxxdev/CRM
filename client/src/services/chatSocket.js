import { io } from 'socket.io-client';

let socket = null;

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

export function connectChatSocket() {
  const token = getToken();
  if (!token) return null;

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
