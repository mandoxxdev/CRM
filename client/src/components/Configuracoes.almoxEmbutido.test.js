/**
 * Integracao (Etapa 107, G8, T8): /configuracoes?modulo=almoxarifado com a tela REAL do almoxarifado
 * embutida — a barra de Modulos de Configuracoes e a das 13 abas do almoxarifado na mesma pagina (a
 * "Abas do modulo" de Configuracoes nao aparece: o almoxarifado nao tem abas no mapa de Configuracoes).
 *
 * `Configuracoes.test.js` troca o almoxarifado por um stub e `ConfiguracoesEmbedded.test.js` renderiza o
 * almoxarifado sozinho — nenhum dos dois ve as duas barras juntas (achado da revisao do plano da 107). O
 * que este arquivo prova: clicar numa aba interna do almoxarifado troca o conteudo e grava `?tab=` sem
 * perder `?modulo=almoxarifado`; os ids `ui-tab-*` nao se repetem na pagina; e o painel de Configuracoes
 * continua rotulado por uma aba que existe.
 *
 * Executar: cd client && CI=true npx react-scripts test src/components/Configuracoes.almoxEmbutido --watchAll=false
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, useLocation } from 'react-router-dom';
import Configuracoes from './Configuracoes';
import api from '../services/api';

jest.mock('../services/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));
jest.mock('react-toastify', () => ({
  toast: { success: jest.fn(), error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));
const mockUser = { id: 1, nome: 'Super', role: 'admin', is_superadmin: 1, perfil_almoxarifado: 'ADMINISTRADOR' };
jest.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: mockUser, loading: false }) }));
jest.mock('../services/permissionsCache', () => ({
  getEffectiveUser: (u) => u,
  getCachedUserPermissions: () => null,
}));

global.IS_REACT_ACT_ENVIRONMENT = true;

let container; let root;
beforeEach(() => {
  jest.clearAllMocks();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  api.get.mockImplementation((url) => {
    if (url === '/configuracoes') return Promise.resolve({ data: { empresa: {}, sistema: {}, email: {}, backup: {} } });
    if (url === '/almoxarifado/configuracoes') return Promise.resolve({ data: {} });
    return Promise.resolve({ data: [] });
  });
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const Espiao = () => <span data-testid="espiao" data-search={useLocation().search} />;
async function render(url) {
  await act(async () => {
    root.render(<MemoryRouter initialEntries={[url]}><Configuracoes /><Espiao /></MemoryRouter>);
  });
  // React.lazy da tela embutida + os GETs dela.
  for (let i = 0; i < 6; i++) await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
}
const search = () => new URLSearchParams(container.querySelector('[data-testid="espiao"]').getAttribute('data-search'));
const botao = (rotulo) => [...container.querySelectorAll('button')].find((b) => b.textContent.trim() === rotulo);

test('T8 a tela real do almoxarifado embutida: aba interna troca o conteudo e grava ?tab= sem perder ?modulo=', async () => {
  await render('/configuracoes?modulo=almoxarifado&tab=familias');
  expect(botao('Tipos de Material')).toBeTruthy(); // a barra interna REAL esta na pagina
  expect(botao('Nova Família')).toBeTruthy();
  await act(async () => { botao('Categorias').click(); });
  for (let i = 0; i < 3; i++) await act(async () => {});
  expect(search().get('modulo')).toBe('almoxarifado');
  expect(search().get('tab')).toBe('categorias');
  expect(botao('Nova Categoria')).toBeTruthy();
  expect(botao('Nova Família')).toBeUndefined();
});

test('T8 nenhum id ui-tab-* repetido na pagina; o painel de Configuracoes e rotulado por uma aba que existe', async () => {
  await render('/configuracoes?modulo=almoxarifado&tab=geral');
  expect(botao('Tipos de Material')).toBeTruthy();
  const ids = [...container.querySelectorAll('[id^="ui-tab-"]')].map((e) => e.id);
  expect(ids.length).toBeGreaterThan(0);
  expect(new Set(ids).size).toBe(ids.length);
  const painel = container.querySelector('#ui-tabpanel-configuracoes');
  const rotulo = painel.getAttribute('aria-labelledby');
  expect(container.querySelector(`#${rotulo}`)).not.toBeNull();
  expect(container.querySelector(`#${rotulo}`).textContent.trim()).toBe('Almoxarifado');
});
