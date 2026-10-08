/**
 * Menu lateral (Layout) — avatar pela URL assinada `foto_src` (Etapa 82, RN-82.05).
 *
 * A pasta de avatares exige assinatura. Antes o Layout montava
 * `${baseURL}/uploads/avatares/${user.foto_url}` — que agora responde 404. Prova-se: usa o
 * `foto_src`; com só `foto_url` (usuário antigo no localStorage) não fabrica endereço; e imagem que
 * falha some em vez de virar ícone quebrado.
 *
 * Os filhos pesados do Layout são stubs — o que está sob teste é só o rodapé do menu.
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import Layout from './Layout';

jest.mock('../services/api', () => ({
  __esModule: true,
  default: { defaults: { baseURL: '/api' }, get: jest.fn(() => Promise.resolve({ data: {} })), post: jest.fn() },
}));
let mockUsuario = null;
jest.mock('../context/AuthContext', () => ({
  useAuth: () => ({ user: mockUsuario, logout: jest.fn() }),
}));
jest.mock('../services/permissionsCache', () => ({
  fetchUserPermissions: jest.fn(() => Promise.resolve({ grupos: [] })),
  getCachedUserPermissions: () => ({ grupos: [] }),
  getEffectiveUser: (u) => u,
  seedPermissionsFromAuthUser: jest.fn(),
}));
jest.mock('../routes/lazyModules', () => ({ prefetchRoute: jest.fn() }));
jest.mock('./Notificacoes', () => () => null);
jest.mock('./BuscaGlobal', () => () => null);
jest.mock('./ReportBuilder', () => () => null);
jest.mock('./WorkflowEngine', () => () => null);
jest.mock('./AnimatedBackground', () => () => null);
jest.mock('./HelpGuide', () => () => null);
jest.mock('./HelpSearch', () => () => null);
jest.mock('./ModuleSplash', () => () => null);
jest.mock('./BotaoInstalarApp', () => () => null);
jest.mock('./BarraInferiorMobile', () => () => null);
jest.mock('./FundoAppMobile', () => () => null);
jest.mock('./PreferenciasMenu', () => () => null);

global.IS_REACT_ACT_ENVIRONMENT = true;

const SIG = 'exp=99999999999&sig=0123456789abcdef0123456789abcdef';
const SRC = `/api/uploads/avatares/avatar_7_1.png?${SIG}`;
const BASE = { id: 7, nome: 'Maria Souza', role: 'admin', is_superadmin: true, modulos: [] };

let container; let root;
beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

async function renderLayout(user) {
  mockUsuario = user;
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={['/']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Routes><Route path="/" element={<Layout />}><Route index element={<div />} /></Route></Routes>
      </MemoryRouter>
    );
  });
  await act(async () => {});
}
const mini = () => container.querySelector('img.user-avatar-mini');

test('usa o foto_src assinado', async () => {
  await renderLayout({ ...BASE, foto_url: 'avatar_7_1.png', foto_src: SRC });
  expect(mini()).not.toBeNull();
  expect(mini().getAttribute('src')).toBe(SRC);
});

test('so foto_url (usuario antigo no localStorage): nenhum endereco fabricado pelo nome', async () => {
  await renderLayout({ ...BASE, foto_url: 'avatar_7_1.png' });
  expect(mini()).toBeNull();
  expect(container.innerHTML).not.toContain('/uploads/avatares/avatar_7_1.png');
});

test('onError: a imagem some (nada de icone quebrado)', async () => {
  await renderLayout({ ...BASE, foto_url: 'avatar_7_1.png', foto_src: SRC });
  await act(async () => { mini().dispatchEvent(new Event('error')); });
  expect(mini()).toBeNull();
});
