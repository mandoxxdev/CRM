/**
 * Etapa 131 (B842, RN-10) — o usuario desativado ou removido chega ao login por `?sessao_encerrada=1` (o interceptor de services/api.js
 * no 401 USUARIO_INATIVO) e ve o aviso proprio, nao o de sessao expirada.
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import Login from './Login';

jest.mock('../context/AuthContext', () => ({ useAuth: () => ({ login: jest.fn() }) }));

const AVISO = 'Sessão encerrada — o seu usuário foi desativado ou removido. Fale com o administrador do sistema.';
const EXPIRADA = 'Sessão expirada. Faça login novamente para continuar.';

let container; let root;
beforeAll(() => { global.IS_REACT_ACT_ENVIRONMENT = true; });
beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
afterEach(() => { act(() => root.unmount()); container.remove(); });
const abrir = (url) => act(() => { root.render(<MemoryRouter initialEntries={[url]}><Login /></MemoryRouter>); });
const alertas = () => Array.from(container.querySelectorAll('[role="alert"]')).map((e) => e.textContent.trim());

describe('[RN-10] o aviso de sessao encerrada no login', () => {
  test('com ?sessao_encerrada=1 aparece o aviso proprio, e nao o de sessao expirada', () => {
    abrir('/login?sessao_encerrada=1');
    expect(alertas()).toEqual([AVISO]);
  });

  test('sem o parametro nao aparece; o de sessao expirada continua so com ?sessao_expirada=1', () => {
    abrir('/login');
    expect(alertas()).toEqual([]);
    expect(container.textContent).not.toContain('Sessão encerrada');
  });

  test('com ?sessao_expirada=1 so o de sessao expirada', () => {
    abrir('/login?sessao_expirada=1');
    expect(alertas()).toEqual([EXPIRADA]);
  });
});
