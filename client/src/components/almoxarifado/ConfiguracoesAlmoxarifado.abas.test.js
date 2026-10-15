/**
 * Almoxarifado -> Configuracoes: a barra das 13 abas internas (Etapa 107, G8, RN-107.14).
 *
 * Escrito ANTES de a barra migrar para `ui/Tabs`, verde no codigo antigo: a ordem e os rotulos das
 * 13 abas, todas com icone, e que quem nao e administrador do almoxarifado ve "Acesso restrito" e
 * NENHUMA aba. `?tab=` e o modo embutido ja estao presos em `ConfiguracoesEmbedded.test.js` (Etapa 36); a
 * escrita com `replace` NAO estava (achado da Fase 5 da 107) e e o ultimo cenario deste arquivo. O bloco do fim (acessibilidade e tamanho) so o
 * `ui/Tabs` cumpre.
 *
 * Executar: cd client && CI=true npx react-scripts test src/components/almoxarifado/ConfiguracoesAlmoxarifado.abas --watchAll=false
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import ConfiguracoesAlmoxarifado from './ConfiguracoesAlmoxarifado';
import api from '../../services/api';

jest.mock('../../services/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));
jest.mock('react-toastify', () => ({
  toast: { success: jest.fn(), error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));
let mockUser = null;
jest.mock('../../context/AuthContext', () => ({ useAuth: () => ({ user: mockUser }) }));
jest.mock('../../services/permissionsCache', () => ({ getEffectiveUser: (u) => u }));

global.IS_REACT_ACT_ENVIRONMENT = true;

const ADMIN_ALMOX = { id: 1, nome: 'Admin', perfil_almoxarifado: 'ADMINISTRADOR' };
const OPERADOR = { id: 2, nome: 'Operador', role: 'user', modulos: ['almoxarifado'] };
const ROTULOS = [
  'Tipos de Material', 'Famílias', 'Categorias', 'Motivos de Movimentação', 'Materiais por Setor',
  'Estoques Mínimos', 'Setores e Áreas', 'Localizações', 'Alertas de Estoque', 'Liberação por Valor',
  'Regras de Aprovação', 'Perfis de Acesso', 'Configurações Gerais',
];

let container; let root;
beforeEach(() => {
  jest.clearAllMocks();
  mockUser = ADMIN_ALMOX;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  api.get.mockImplementation((url) => Promise.resolve({ data: url === '/almoxarifado/configuracoes' ? {} : [] }));
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

async function render({ url = '/almoxarifado/configuracoes', embedded = false } = {}) {
  await act(async () => {
    root.render(<MemoryRouter initialEntries={[url]}><ConfiguracoesAlmoxarifado embedded={embedded} /></MemoryRouter>);
  });
  await act(async () => {});
}
const botoesDaBarra = () => [...container.querySelectorAll('button')].filter((b) => ROTULOS.includes(b.textContent.trim()));
function remontar() {
  act(() => root.unmount());
  root = createRoot(container);
}

test('RN-107.14 as 13 abas na ordem, cada uma com icone (sozinha e embutida)', async () => {
  await render();
  expect(botoesDaBarra().map((b) => b.textContent.trim())).toEqual(ROTULOS);
  expect(botoesDaBarra().every((b) => b.querySelector('svg'))).toBe(true);
  remontar();
  await render({ url: '/configuracoes?modulo=almoxarifado', embedded: true });
  expect(botoesDaBarra().map((b) => b.textContent.trim())).toEqual(ROTULOS);
});

test('RN-107.14 quem nao administra o almoxarifado ve "Acesso restrito" e nenhuma aba (metade positiva: o admin ve)', async () => {
  mockUser = OPERADOR;
  await render();
  expect(container.textContent).toContain('Acesso restrito — administrador do Almoxarifado');
  expect(botoesDaBarra()).toHaveLength(0);
  expect(container.querySelector('[role="tablist"]')).toBeNull();
  remontar();
  mockUser = ADMIN_ALMOX;
  await render();
  expect(container.textContent).not.toContain('Acesso restrito');
  expect(botoesDaBarra()).toHaveLength(13);
});

// Depois da migracao (o que so o `ui/Tabs` cumpre): tablist rotulado, aba ativa pela URL, tamanho por modo.
test('RN-107.14 acessibilidade do ui/Tabs: aba ativa vem do ?tab=, "sm" embutida e "md" sozinha, sem aria-controls', async () => {
  await render({ url: '/almoxarifado/configuracoes?tab=localizacoes' });
  let lista = container.querySelector('[role="tablist"][aria-label="Configurações do almoxarifado"]');
  expect(lista).not.toBeNull();
  expect(lista.classList.contains('ui-tabs-sm')).toBe(false);
  expect(lista.querySelector('[aria-selected="true"]').textContent.trim()).toBe('Localizações');
  expect([...lista.querySelectorAll('[role="tab"]')].some((t) => t.hasAttribute('aria-controls'))).toBe(false);
  remontar();
  await render({ url: '/configuracoes?modulo=almoxarifado&tab=nao-existe', embedded: true });
  lista = container.querySelector('[role="tablist"][aria-label="Configurações do almoxarifado"]');
  expect(lista.classList.contains('ui-tabs-sm')).toBe(true);
  expect(lista.querySelector('[aria-selected="true"]').textContent.trim()).toBe('Tipos de Material');
});

// Fase 5 da 107 (achado 1): o cabecalho deste arquivo dizia que o `replace` da escrita de `?tab=` estava
// preso em ConfiguracoesEmbedded.test.js — nao estava (tirar o `{ replace: true }` passava verde). Sem
// ele, cada clique ou seta empilharia uma entrada no historico do navegador.
test('RN-107.14 trocar de aba grava ?tab= com REPLACE (nao empilha historico), sozinha e embutida', async () => {
  const { useNavigationType, useLocation } = require('react-router-dom');
  const Espiao = () => <span data-testid="nav" data-tipo={useNavigationType()} data-search={useLocation().search} />;
  const nav = () => container.querySelector('[data-testid="nav"]');
  for (const [url, embedded] of [['/almoxarifado/configuracoes', false], ['/configuracoes?modulo=almoxarifado', true]]) {
    remontar();
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={[url]}>
          <Espiao />
          <ConfiguracoesAlmoxarifado embedded={embedded} />
        </MemoryRouter>
      );
    });
    await act(async () => {});
    expect(nav().getAttribute('data-tipo')).toBe('POP'); // estado inicial do MemoryRouter
    const categorias = botoesDaBarra().find((b) => b.textContent.trim() === 'Categorias');
    await act(async () => { categorias.click(); });
    expect(new URLSearchParams(nav().getAttribute('data-search')).get('tab')).toBe('categorias');
    expect(nav().getAttribute('data-tipo')).toBe('REPLACE');
  }
});
