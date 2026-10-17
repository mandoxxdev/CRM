/**
 * Etapa 135 (núcleo, C282, RN-10) — a lista de Usuários mostra quem se chama "administrator".
 *
 * A tela escondia o usuário de nome exatamente "administrator" (qualquer caixa — e o cadastro grava o nome em maiúsculas): servia a
 * um usuário antigo que o boot também apagava. O boot não apaga mais (RN-10), e um usuário que existe e não aparece na lista não pode
 * ser editado, desativado nem excluído pela tela.
 *
 * Executar: cd client && CI=true npx react-scripts test src/components/Usuarios.administrator --watchAll=false
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import Usuarios from './Usuarios';
import api from '../services/api';

const mockAdmin = { id: 1, nome: 'Admin', role: 'admin', is_superadmin: 1 };
jest.mock('../context/AuthContext', () => ({
  useAuth: () => ({ user: mockAdmin, loading: false }),
}));
jest.mock('../services/api', () => ({ get: jest.fn(), put: jest.fn(), post: jest.fn(), delete: jest.fn(), patch: jest.fn() }));
jest.mock('react-toastify', () => ({ toast: { success: jest.fn(), error: jest.fn(), info: jest.fn(), warn: jest.fn() } }));

global.IS_REACT_ACT_ENVIRONMENT = true;

let container; let root;
beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  api.get.mockImplementation((url) => {
    if (url === '/usuarios') {
      return Promise.resolve({ data: [
        { id: 7, nome: 'ADMINISTRATOR', email: 'adm7@t.com', role: 'usuario', ativo: 1, is_superadmin: 0, admin_modulos: '[]' },
        { id: 9, nome: 'administrator', email: 'adm9@t.com', role: 'usuario', ativo: 1, is_superadmin: 0, admin_modulos: '[]' }, // Fase 5 r3 (U13): legado minusculo
        { id: 8, nome: 'MARIA SILVA', email: 'maria@t.com', role: 'usuario', ativo: 1, is_superadmin: 0, admin_modulos: '[]' },
      ] });
    }
    return Promise.resolve({ data: [] });
  });
});
afterEach(() => { act(() => root.unmount()); container.remove(); jest.clearAllMocks(); });

test('[135 RN-10] a lista mostra o usuário ADMINISTRATOR (e o outro, a metade positiva)', async () => {
  await act(async () => {
    root.render(<MemoryRouter><Usuarios deferMs={0} /></MemoryRouter>);
  });
  await act(async () => { await new Promise((r) => setTimeout(r, 10)); });
  expect(container.textContent).toContain('MARIA SILVA');
  expect(container.textContent).toContain('ADMINISTRATOR');
  expect(container.textContent).toContain('adm9@t.com');
});
