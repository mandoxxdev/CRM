/**
 * Minha Conta — a barra de abas (Etapa 107, G8, RN-107.12).
 *
 * Escrito ANTES de a barra migrar para `ui/Tabs`, verde no codigo antigo: aba inicial "Informacoes
 * pessoais", "Alterar senha" mostra o formulario de senha e esconde o de perfil, e volta. So usa texto do
 * botao e o formulario que aparece — o que a migracao nao pode mudar.
 *
 * Executar: cd client && CI=true npx react-scripts test src/components/MinhaConta.abas --watchAll=false
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import MinhaConta from './MinhaConta';
import api from '../services/api';

jest.mock('../services/api', () => ({
  __esModule: true,
  default: { defaults: { baseURL: '/api' }, get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));
jest.mock('react-toastify', () => ({
  toast: { success: jest.fn(), error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));
jest.mock('../context/AuthContext', () => ({ useAuth: () => ({ refreshUser: jest.fn(() => Promise.resolve()) }) }));

global.IS_REACT_ACT_ENVIRONMENT = true;

const CONTA = { id: 7, nome: 'Maria Souza', email: 'm@x.com' };
let container; let root;
beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  jest.clearAllMocks();
  api.get.mockResolvedValue({ data: CONTA });
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

async function renderConta() {
  await act(async () => { root.render(<MemoryRouter><MinhaConta /></MemoryRouter>); });
  await act(async () => {});
}
const ROTULOS = ['Informações pessoais', 'Alterar senha'];
const botoesDaBarra = () => [...container.querySelectorAll('button')].filter((b) => ROTULOS.includes(b.textContent.trim()));
const botao = (r) => botoesDaBarra().find((b) => b.textContent.trim() === r);
const campoSenhaAtual = () => [...container.querySelectorAll('label')].find((l) => l.textContent.includes('Senha atual'));
const campoNome = () => [...container.querySelectorAll('label')].find((l) => /^Nome/.test(l.textContent.trim()));

test('RN-107.12 duas abas na ordem, com icone; comeca em Informacoes pessoais', async () => {
  await renderConta();
  expect(botoesDaBarra().map((b) => b.textContent.trim())).toEqual(ROTULOS);
  expect(botoesDaBarra().every((b) => b.querySelector('svg'))).toBe(true);
  expect(campoNome()).toBeTruthy();
  expect(campoSenhaAtual()).toBeUndefined();
});

test('RN-107.12 Alterar senha mostra o formulario de senha e esconde o de perfil; e volta', async () => {
  await renderConta();
  await act(async () => { botao('Alterar senha').click(); });
  expect(campoSenhaAtual()).toBeTruthy();
  expect(campoNome()).toBeUndefined();
  await act(async () => { botao('Informações pessoais').click(); });
  expect(campoNome()).toBeTruthy();
  expect(campoSenhaAtual()).toBeUndefined();
});

// Depois da migracao (o que so o `ui/Tabs` cumpre).
test('RN-107.12 acessibilidade do ui/Tabs: tablist "Minha conta", aria-selected acompanha a aba', async () => {
  await renderConta();
  const lista = container.querySelector('[role="tablist"]');
  expect(lista.getAttribute('aria-label')).toBe('Minha conta');
  const abas = () => [...lista.querySelectorAll('[role="tab"]')];
  expect(abas().map((t) => t.getAttribute('aria-selected'))).toEqual(['true', 'false']);
  await act(async () => { abas()[1].click(); });
  expect(abas().map((t) => t.getAttribute('aria-selected'))).toEqual(['false', 'true']);
  expect(container.querySelector('.conta-tabs')).toBeNull();
});
