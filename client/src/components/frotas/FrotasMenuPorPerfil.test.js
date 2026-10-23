/**
 * Frota Etapa 1 (T7) — menu do modulo Frota por perfil e o redirecionamento do MOTORISTA.
 *
 * O menu e conferido no Layout de verdade (filhos pesados como stubs, molde Layout.avatar.test.js): o que importa e o que o
 * motorista VE na barra lateral, nao so a lista em frotaMenu.js. O perfil segue a regua do servidor
 * (server/services/frotas/permissions.js, getPerfilFromUser).
 *
 * Executar: cd client && CI=true npx react-scripts test src/components/frotas/FrotasMenuPorPerfil --watchAll=false
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import Layout from '../Layout';
import FrotasDashboard from './FrotasDashboard';
import { perfilFrota } from '../../utils/systemPermissions';
import { fetchFrotasDashboard } from '../../utils/frotasApi';

jest.mock('../../services/api', () => ({
  __esModule: true,
  default: { defaults: { baseURL: '/api' }, get: jest.fn(() => Promise.resolve({ data: {} })), post: jest.fn() },
}));
let mockUsuario = null;
jest.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: mockUsuario, logout: jest.fn() }),
}));
jest.mock('../../services/permissionsCache', () => ({
  fetchUserPermissions: jest.fn(() => Promise.resolve({ grupos: [] })),
  getCachedUserPermissions: () => ({ grupos: [] }),
  getEffectiveUser: (u) => u,
  seedPermissionsFromAuthUser: jest.fn(),
}));
jest.mock('../../utils/frotasApi', () => ({
  fetchFrotasDashboard: jest.fn(),
  baixarPlanilhaFrota: jest.fn(),
  mensagemDoServidor: jest.fn(),
}));
jest.mock('../../routes/lazyModules', () => ({ prefetchRoute: jest.fn() }));
jest.mock('../Notificacoes', () => () => null);
jest.mock('../BuscaGlobal', () => () => null);
jest.mock('../ReportBuilder', () => () => null);
jest.mock('../WorkflowEngine', () => () => null);
jest.mock('../AnimatedBackground', () => () => null);
jest.mock('../HelpGuide', () => () => null);
jest.mock('../HelpSearch', () => () => null);
jest.mock('../ModuleSplash', () => () => null);
jest.mock('../BotaoInstalarApp', () => () => null);
jest.mock('../BarraInferiorMobile', () => () => null);
jest.mock('../FundoAppMobile', () => () => null);
jest.mock('../PreferenciasMenu', () => () => null);

global.IS_REACT_ACT_ENVIRONMENT = true;

const MOTORISTA = { id: 7, nome: 'Jose', role: 'user', is_superadmin: 0, admin_modulos: [], perfil_frota: null };
const CONSULTA = { ...MOTORISTA, perfil_frota: 'CONSULTA' };
const ADMIN_MODULO = { ...MOTORISTA, admin_modulos: ['frota'] };

let container; let root;
beforeEach(() => {
  fetchFrotasDashboard.mockResolvedValue({});
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  jest.clearAllMocks();
});

async function renderLayout(user, rota = '/frota/motorista') {
  mockUsuario = user;
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={[rota]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Routes><Route path="/frota" element={<Layout />}><Route path="*" element={<div />} /></Route></Routes>
      </MemoryRouter>
    );
  });
  await act(async () => {});
}
const linksDoMenu = () => [...container.querySelectorAll('.sidebar-nav a.nav-item')]
  .map((a) => a.getAttribute('href'))
  .filter((h) => h.startsWith('/frota'));

describe('perfilFrota — a regua do servidor', () => {
  test.each([
    ['sem usuario', null, 'CONSULTA'],
    ['superadmin', { is_superadmin: 1, perfil_frota: 'MOTORISTA' }, 'ADMIN_FROTA'],
    ['admin do modulo frota', { admin_modulos: ['frota'] }, 'ADMIN_FROTA'],
    ['admin do modulo frota (texto JSON)', { admin_modulos: '["frota"]' }, 'ADMIN_FROTA'],
    ['role admin', { role: 'admin', perfil_frota: 'MOTORISTA' }, 'ADMIN_FROTA'],
    ['perfil gravado CONSULTA', { role: 'user', perfil_frota: 'CONSULTA' }, 'CONSULTA'],
    ['sem perfil = chao de fabrica', { role: 'user', perfil_frota: null }, 'MOTORISTA'],
    ['admin de OUTRO modulo nao e admin da frota', { admin_modulos: ['almoxarifado'] }, 'MOTORISTA'],
  ])('%s -> %s', (_n, user, esperado) => {
    expect(perfilFrota(user)).toBe(esperado);
  });
});

describe('menu da Frota no Layout', () => {
  test('MOTORISTA ve so Meu painel + Solicitar Material + Minhas Requisicoes', async () => {
    await renderLayout(MOTORISTA);
    expect(linksDoMenu()).toEqual(['/frota/motorista', '/frota/requisicoes-material/nova', '/frota/requisicoes-material']);
    expect(container.querySelector('a[href="/frota/motorista"]').textContent).toContain('Meu painel');
  });

  test.each([['CONSULTA', CONSULTA], ['ADMIN (admin do modulo)', ADMIN_MODULO]])('%s ve tudo e o Portal do motorista', async (_n, user) => {
    await renderLayout(user);
    const links = linksDoMenu();
    ['/frota', '/frota/veiculos', '/frota/motoristas', '/frota/checklists', '/frota/viagens', '/frota/relatorios',
      '/frota/motorista', '/frota/requisicoes-material/nova', '/frota/requisicoes-material'].forEach((p) => expect(links).toContain(p));
    expect(container.querySelector('a[href="/frota/motorista"]').textContent).toContain('Portal do motorista');
  });
});

describe('/frota (dashboard) por perfil', () => {
  async function abrirFrota(user) {
    mockUsuario = user;
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/frota']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <Routes>
            <Route path="/frota" element={<FrotasDashboard />} />
            <Route path="/frota/motorista" element={<div data-testid="portal">portal</div>} />
          </Routes>
        </MemoryRouter>
      );
    });
    await act(async () => {});
  }

  test('MOTORISTA e redirecionado para /frota/motorista e o painel nem e pedido', async () => {
    await abrirFrota(MOTORISTA);
    expect(container.querySelector('[data-testid="portal"]')).not.toBeNull();
    expect(fetchFrotasDashboard).not.toHaveBeenCalled();
  });

  test('CONSULTA fica no painel do gestor, com o botao Exportar planilha', async () => {
    await abrirFrota(CONSULTA);
    expect(container.querySelector('[data-testid="portal"]')).toBeNull();
    expect(fetchFrotasDashboard).toHaveBeenCalled();
    expect(container.textContent).toContain('Exportar planilha');
  });
});
