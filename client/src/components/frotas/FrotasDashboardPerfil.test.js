/**
 * Frota C22 — o painel do gestor renova o usuario quando o perfil do servidor difere do que a tela tem.
 *
 * Quem deixava de ser Administrador de Frota continuava vendo o menu de administrador ate recarregar a pagina. O GET /dashboard agora
 * traz `perfil` (o de quem pediu); divergiu de perfilFrota(getEffectiveUser(user)), o painel chama refreshUser() UMA vez (o mesmo
 * guarda do portal, Fase5-2). O cache do navegador (45 s) nao guarda o `perfil`: so a resposta que veio do servidor agora compara —
 * senao, depois de sair e entrar com outra pessoa no mesmo navegador, o perfil da anterior faria renovar a toa.
 *
 * So a fronteira HTTP (`api`) e mockada; o frotasApi (com o cache) e o real.
 * Executar: cd client && CI=true npx react-scripts test src/components/frotas/FrotasDashboardPerfil --watchAll=false
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import FrotasDashboard from './FrotasDashboard';
import { invalidateFrotasDashboardCache } from '../../utils/frotasApi';
import api from '../../services/api';

jest.mock('../../services/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));
jest.mock('react-toastify', () => ({ toast: { success: jest.fn(), error: jest.fn(), info: jest.fn(), warning: jest.fn() } }));

const ADMIN_FROTA = { id: 1, nome: 'Fabio', role: 'user', admin_modulos: ['frota'] };
const CONSULTA = { id: 2, nome: 'Carla', role: 'user', perfil_frota: 'CONSULTA' };
const mockAuth = { user: ADMIN_FROTA, refreshUser: jest.fn(() => Promise.resolve(null)), logout: () => {} };
jest.mock('../../context/AuthContext', () => ({ useAuth: () => mockAuth }));
jest.mock('../../services/permissionsCache', () => ({ getEffectiveUser: (u) => u }));

const PAINEL = { veiculos: { total: 2 }, alertas: [] };
let perfilDoServidor;

let container;
let root;
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  invalidateFrotasDashboardCache();
  mockAuth.user = ADMIN_FROTA;
  mockAuth.refreshUser = jest.fn(() => Promise.resolve(null));
  perfilDoServidor = 'ADMIN_FROTA';
  api.get.mockImplementation((url) => {
    if (url === '/frotas/dashboard') return Promise.resolve({ data: { ...PAINEL, perfil: perfilDoServidor } });
    return Promise.resolve({ data: [] });
  });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  jest.clearAllMocks();
});

async function render(el) {
  await act(async () => { root.render(<MemoryRouter>{el}</MemoryRouter>); });
  await act(async () => {});
}
async function remontar(el) {
  act(() => root.unmount());
  root = createRoot(container);
  await render(el);
}
async function clicar(el) {
  if (!el) throw new Error('elemento nao encontrado');
  await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  await act(async () => {});
}
const botao = (texto) => [...container.querySelectorAll('button')].find((b) => b.textContent.trim() === texto);
const leiturasDoPainel = () => api.get.mock.calls.filter(([u]) => u === '/frotas/dashboard').length;

describe('C22 painel do gestor: renova o menu quando o perfil muda', () => {
  test('C22 deixou de ser ADMIN_FROTA (servidor diz CONSULTA): refreshUser uma vez, mesmo com Atualizar de novo', async () => {
    perfilDoServidor = 'CONSULTA';
    await render(<FrotasDashboard />);
    expect(leiturasDoPainel()).toBe(1);
    expect(mockAuth.refreshUser).toHaveBeenCalledTimes(1);
    // a renovacao (aqui mockada) nao trouxe o perfil novo: o Atualizar diverge de novo, e nao renova em laco
    await clicar(botao('Atualizar'));
    expect(leiturasDoPainel()).toBe(2);
    expect(mockAuth.refreshUser).toHaveBeenCalledTimes(1);
  });

  test('C22 perfil igual ao da tela: nao renova', async () => {
    await render(<FrotasDashboard />);
    expect(leiturasDoPainel()).toBe(1);
    expect(mockAuth.refreshUser).not.toHaveBeenCalled();
    mockAuth.user = CONSULTA;
    perfilDoServidor = 'CONSULTA';
    invalidateFrotasDashboardCache();
    await remontar(<FrotasDashboard />);
    expect(leiturasDoPainel()).toBe(2);
    expect(mockAuth.refreshUser).not.toHaveBeenCalled();
  });

  test('C22 cache do navegador: o perfil de quem aqueceu nao vale para o proximo usuario (sem renovar a toa)', async () => {
    await render(<FrotasDashboard />); // Fabio, ADMIN_FROTA, aquece o cache de 45 s
    expect(mockAuth.refreshUser).not.toHaveBeenCalled();
    // sai e entra a Carla (CONSULTA) no mesmo navegador, dentro dos 45 s: o painel vem do cache, sem o perfil do Fabio
    mockAuth.user = CONSULTA;
    await remontar(<FrotasDashboard />);
    expect(leiturasDoPainel()).toBe(1);
    expect(container.textContent).not.toMatch(/Sem permissão|Erro/);
    expect(mockAuth.refreshUser).not.toHaveBeenCalled();
  });

  test('C22 o 403 continua renovando (Fase5-2) e conta a mesma vez', async () => {
    api.get.mockImplementation((url) => {
      if (url === '/frotas/dashboard') {
        return Promise.reject(Object.assign(new Error('403'), { response: { status: 403, data: { perfil: 'MOTORISTA' } } }));
      }
      return Promise.resolve({ data: [] });
    });
    await render(<FrotasDashboard />);
    expect(mockAuth.refreshUser).toHaveBeenCalledTimes(1);
  });
});
