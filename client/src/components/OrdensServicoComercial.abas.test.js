/**
 * OS comercial — a barra de abas (Etapa 107, G8, RN-107.13).
 *
 * Escrito ANTES de a barra migrar para `ui/Tabs`, verde no codigo antigo. Prende: as duas abas na ordem,
 * o contador ao lado de cada uma SO quando > 0 (propostas aprovadas sem OS; total de OS), a aba inicial
 * Propostas (tabela de propostas, sem os cartoes de estatistica) e "Ordens de Servico" mostrando os
 * cartoes e a lista de OS. O contador e lido pelo NUMERO dentro do botao, nao pela classe — a classe
 * muda na migracao (`.tab-badge` -> `.ui-tab-badge`).
 *
 * Executar: cd client && CI=true npx react-scripts test src/components/OrdensServicoComercial.abas --watchAll=false
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import OrdensServicoComercial from './OrdensServicoComercial';
import api from '../services/api';

jest.mock('../services/api', () => ({
  __esModule: true,
  default: { defaults: { baseURL: '/api' }, get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));
jest.mock('react-toastify', () => ({
  toast: { success: jest.fn(), error: jest.fn(), info: jest.fn(), warn: jest.fn(), warning: jest.fn() },
}));

global.IS_REACT_ACT_ENVIRONMENT = true;

// 3 propostas aprovadas, 1 delas ja com OS -> 2 no contador de Propostas; 1 OS no total.
const PROPOSTAS = [
  { id: 1, numero_proposta: 'P-001', cliente_nome: 'Cliente A', status: 'aprovada' },
  { id: 2, numero_proposta: 'P-002', cliente_nome: 'Cliente B', status: 'aprovada' },
  { id: 3, numero_proposta: 'P-003', cliente_nome: 'Cliente C', status: 'aprovada' },
];
const OS = [{ id: 10, numero_os: 'OS-010', proposta_id: 3, status: 'pendente', cliente_nome: 'Cliente C' }];

function mockApi({ propostas = PROPOSTAS, os = OS } = {}) {
  api.get.mockImplementation((url) => {
    if (url === '/comercial/ordens-servico') return Promise.resolve({ data: os });
    if (url === '/propostas') return Promise.resolve({ data: propostas });
    if (url.startsWith('/propostas/')) return Promise.resolve({ data: { itens: [] } });
    return Promise.resolve({ data: [] });
  });
}

let container; let root;
beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  jest.clearAllMocks();
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

async function renderOS() {
  await act(async () => {
    root.render(<MemoryRouter initialEntries={['/comercial/ordens-servico']}><OrdensServicoComercial /></MemoryRouter>);
  });
  for (let i = 0; i < 4; i++) await act(async () => {});
}
const ROTULOS = ['Propostas Aprovadas', 'Ordens de Serviço'];
const botoesDaBarra = () => [...container.querySelectorAll('button')]
  .filter((b) => ROTULOS.some((r) => b.textContent.includes(r)));
const botao = (r) => botoesDaBarra().find((b) => b.textContent.includes(r));
// O numero do contador: o texto do botao sem o rotulo.
const contador = (r) => botao(r).textContent.replace(r, '').trim();
const temCartoes = () => container.textContent.includes('Total de OS');
const cabecalhos = () => [...container.querySelectorAll('th')].map((t) => t.textContent.trim());

test('RN-107.13 duas abas na ordem, com icone; contador so quando > 0', async () => {
  mockApi();
  await renderOS();
  expect(botoesDaBarra().map((b) => ROTULOS.find((r) => b.textContent.includes(r)))).toEqual(ROTULOS);
  expect(botoesDaBarra().every((b) => b.querySelector('svg'))).toBe(true);
  expect(contador('Propostas Aprovadas')).toBe('2');
  expect(contador('Ordens de Serviço')).toBe('1');
});

test('RN-107.13 sem propostas nem OS nenhum contador aparece (nem "0")', async () => {
  mockApi({ propostas: [], os: [] });
  await renderOS();
  expect(botoesDaBarra()).toHaveLength(2);
  expect(contador('Propostas Aprovadas')).toBe('');
  expect(contador('Ordens de Serviço')).toBe('');
});

test('RN-107.13 comeca em Propostas (tabela de propostas, sem cartoes); Ordens de Servico mostra cartoes e lista de OS', async () => {
  mockApi();
  await renderOS();
  expect(temCartoes()).toBe(false);
  expect(cabecalhos()).toContain('Número Proposta');
  await act(async () => { botao('Ordens de Serviço').click(); });
  for (let i = 0; i < 4; i++) await act(async () => {});
  expect(temCartoes()).toBe(true);
  expect(cabecalhos()).not.toContain('Número Proposta');
  expect(container.textContent).toContain('OS-010');
  await act(async () => { botao('Propostas Aprovadas').click(); });
  for (let i = 0; i < 4; i++) await act(async () => {});
  expect(temCartoes()).toBe(false);
  expect(cabecalhos()).toContain('Número Proposta');
});

// Depois da migracao (o que so o `ui/Tabs` cumpre).
test('RN-107.13 acessibilidade do ui/Tabs: tablist "Ordens de serviço", contador em .ui-tab-badge, aria-selected', async () => {
  mockApi();
  await renderOS();
  const lista = container.querySelector('[role="tablist"]');
  expect(lista.getAttribute('aria-label')).toBe('Ordens de serviço');
  const abas = () => [...lista.querySelectorAll('[role="tab"]')];
  expect(abas().map((t) => t.querySelector('.ui-tab-badge')?.textContent)).toEqual(['2', '1']);
  expect(abas().map((t) => t.getAttribute('aria-selected'))).toEqual(['true', 'false']);
  await act(async () => { abas()[1].click(); });
  for (let i = 0; i < 4; i++) await act(async () => {});
  expect(abas().map((t) => t.getAttribute('aria-selected'))).toEqual(['false', 'true']);
  expect(container.querySelector('.os-tab, .tab-badge, .os-comercial-tabs')).toBeNull();
});
