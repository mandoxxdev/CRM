/**
 * Admin — a barra de abas (Etapa 107, G8, RN-107.11).
 *
 * Escrito ANTES de a barra migrar para `ui/Tabs`, verde no codigo antigo: prende o comportamento que a
 * migracao nao pode mudar (ordem e rotulos, aba inicial, clique troca o conteudo, "Preparando painel…"
 * antes do primeiro quadro, quem nao e admin volta para o inicio). So usa o que nao muda na migracao
 * (texto do botao e conteudo que aparece); o bloco de acessibilidade do fim e o que so o `Tabs` cumpre.
 *
 * Executar: cd client && CI=true npx react-scripts test src/components/Admin.abas --watchAll=false
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import Admin from './Admin';

jest.mock('./Usuarios', () => () => <div data-testid="conteudo">conteudo-usuarios</div>);
jest.mock('./Permissoes', () => () => <div data-testid="conteudo">conteudo-permissoes</div>);
jest.mock('./Logs', () => () => <div data-testid="conteudo">conteudo-logs</div>);
const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));
let mockUser = { id: 1, role: 'admin' };
jest.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: mockUser }) }));

global.IS_REACT_ACT_ENVIRONMENT = true;

let container; let root;
beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  mockNavigate.mockClear();
  mockUser = { id: 1, role: 'admin' };
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

async function renderAdmin({ esperarPainel = true } = {}) {
  await act(async () => { root.render(<MemoryRouter><Admin /></MemoryRouter>); });
  if (esperarPainel) await act(async () => { await new Promise((r) => setTimeout(r, 250)); });
}
const botoesDaBarra = () => [...container.querySelectorAll('button')]
  .filter((b) => ['Usuários', 'Permissões', 'Logs'].includes(b.textContent.trim()));
const botao = (rotulo) => botoesDaBarra().find((b) => b.textContent.trim() === rotulo);
const conteudo = () => container.querySelector('[data-testid="conteudo"]')?.textContent;

test('RN-107.11 tres abas na ordem Usuarios, Permissoes, Logs, cada uma com icone', async () => {
  await renderAdmin();
  expect(botoesDaBarra().map((b) => b.textContent.trim())).toEqual(['Usuários', 'Permissões', 'Logs']);
  expect(botoesDaBarra().every((b) => b.querySelector('svg'))).toBe(true);
});

test('RN-107.11 antes do primeiro quadro mostra "Preparando painel…"; depois, Usuarios', async () => {
  await renderAdmin({ esperarPainel: false });
  expect(container.textContent).toContain('Preparando painel…');
  expect(conteudo()).toBeUndefined();
  await act(async () => { await new Promise((r) => setTimeout(r, 250)); });
  expect(conteudo()).toBe('conteudo-usuarios');
});

test('RN-107.11 clicar troca o conteudo e volta', async () => {
  await renderAdmin();
  await act(async () => { botao('Permissões').click(); });
  expect(conteudo()).toBe('conteudo-permissoes');
  await act(async () => { botao('Logs').click(); });
  expect(conteudo()).toBe('conteudo-logs');
  await act(async () => { botao('Usuários').click(); });
  expect(conteudo()).toBe('conteudo-usuarios');
});

test('RN-107.11 quem nao e admin do sistema e mandado para o inicio (metade positiva: admin nao e)', async () => {
  await renderAdmin();
  expect(mockNavigate).not.toHaveBeenCalled();
  act(() => root.unmount());
  root = createRoot(container);
  mockUser = { id: 2, role: 'usuario' };
  await renderAdmin();
  expect(mockNavigate).toHaveBeenCalledWith('/');
});

// Depois da migracao (o que so o `ui/Tabs` cumpre): tablist rotulado, aba ativa marcada, painel rotulado
// pela aba ativa.
test('RN-107.11 acessibilidade do ui/Tabs: tablist "Administração", aria-selected so na ativa, painel rotulado', async () => {
  await renderAdmin();
  const lista = container.querySelector('[role="tablist"]');
  expect(lista.getAttribute('aria-label')).toBe('Administração');
  expect(lista.classList.contains('ui-tabs')).toBe(true);
  const abas = [...lista.querySelectorAll('[role="tab"]')];
  expect(abas.map((t) => t.getAttribute('aria-selected'))).toEqual(['true', 'false', 'false']);
  const painel = container.querySelector('[role="tabpanel"]');
  expect(painel.getAttribute('aria-labelledby')).toBe('ui-tab-usuarios');
  expect(abas.every((t) => t.getAttribute('aria-controls') === painel.id)).toBe(true);
  await act(async () => { abas[2].click(); });
  expect(painel.getAttribute('aria-labelledby')).toBe('ui-tab-logs');
  expect(container.querySelector('[role="tab"][aria-selected="true"]').textContent.trim()).toBe('Logs');
  expect(container.querySelector('.admin-tab, .admin-tabs')).toBeNull();
});
