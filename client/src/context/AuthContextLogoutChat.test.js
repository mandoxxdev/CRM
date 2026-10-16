/**
 * Etapa 132 (C271, RN-07, Fase 2 I2) — sair desconecta o socket do chat.
 *
 * O logout nao recarrega a pagina; o socket do chat (um so por aba, `services/chatSocket.js`) seguia conectado com o token de
 * quem saiu: quem entrasse depois na mesma aba via o tempo real do anterior, e o aviso de sessao encerrada do anterior o
 * deslogaria. Agora o `logout` do `AuthProvider` chama `disconnectChatSocket()`.
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { AuthProvider, useAuth } from './AuthContext';
import api from '../services/api';
import { disconnectChatSocket } from '../services/chatSocket';

jest.mock('axios', () => ({ __esModule: true, default: { defaults: { headers: { common: {} } } } }));
jest.mock('../services/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));
jest.mock('../services/chatSocket', () => ({ disconnectChatSocket: jest.fn() }));

let container; let root; let authRef;
function Sonda() { authRef = useAuth(); return null; }

beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  jest.clearAllMocks();
  localStorage.clear();
  api.get.mockResolvedValue({ data: { user: { id: 5, nome: 'F', email: 'f@x', role: 'usuario', modulos: [] } } });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); localStorage.clear(); });

test('[RN-07] logout desconecta o socket do chat (e limpa a sessao, como antes)', async () => {
  localStorage.setItem('token', 't');
  localStorage.setItem('user', JSON.stringify({ id: 5, nome: 'F' }));
  await act(async () => { root.render(<AuthProvider><Sonda /></AuthProvider>); });
  for (let i = 0; i < 3; i += 1) await act(async () => { await Promise.resolve(); });
  expect(authRef.user && authRef.user.id).toBe(5); // metade positiva: havia sessao
  expect(disconnectChatSocket).not.toHaveBeenCalled();
  await act(async () => { authRef.logout(); });
  expect(disconnectChatSocket).toHaveBeenCalledTimes(1);
  expect(localStorage.getItem('token')).toBeNull();
  expect(authRef.user).toBeNull();
});
